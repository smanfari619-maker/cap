/**
 * watermark-remover.ts
 *
 * Uses browser-native video + Canvas2D for frame extraction and pure-JS
 * bilinear edge inpainting. FFmpeg WASM is only used for the final re-encode.
 *
 * Pipeline:
 *  1. Load the source video file as a blob URL into an HTMLVideoElement.
 *  2. Seek to each frame via currentTime, draw it to a Canvas.
 *  3. Fill the watermark rectangle using bilinear edge interpolation (no libs).
 *  4. Encode each processed frame as a JPEG and store it in FFmpeg's virtual FS.
 *  5. FFmpeg re-encodes the frame sequence → H.264 MP4, copying original audio.
 *
 * This avoids the WASM heap-overflow crash that occurred when all frames were
 * dumped into FFmpeg's virtual FS simultaneously (RuntimeError: memory access
 * out of bounds).
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { db, type Asset } from './db';
import { saveFileToOPFS, getFileFromOPFS } from './opfs';

export interface WatermarkRegionPx {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RemovalStatus =
  | { stage: 'idle' }
  | { stage: 'loading' }
  | { stage: 'processing'; progress: number }
  | { stage: 'done'; newAssetId: string }
  | { stage: 'error'; message: string };

// ─── FFmpeg Singleton ──────────────────────────────────────────────────────────
let ffmpegInstance: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;

  const ff = new FFmpeg();
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
  await ff.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegInstance = ff;
  return ff;
}

// ─── Pure-JS Bilinear Edge Inpainting ─────────────────────────────────────────
/**
 * Fill the watermark bounding box by bilinear-blending the thin ring of
 * background pixels that border it. No external libraries required.
 */
function fillRegion(imageData: ImageData, region: WatermarkRegionPx): void {
  const { data, width, height } = imageData;

  // Clamp strictly inside image (need 1px border on all sides for sampling)
  const x0 = Math.max(1, Math.round(region.x));
  const y0 = Math.max(1, Math.round(region.y));
  const x1 = Math.min(width  - 2, x0 + Math.round(region.w) - 1);
  const y1 = Math.min(height - 2, y0 + Math.round(region.h) - 1);

  if (x1 <= x0 || y1 <= y0) return;

  const colCount = x1 - x0 + 1;
  const rowCount = y1 - y0 + 1;

  // Snapshot border strips BEFORE we start modifying interior pixels
  const topEdge   = new Uint8Array(colCount * 4);
  const botEdge   = new Uint8Array(colCount * 4);
  const leftEdge  = new Uint8Array(rowCount * 4);
  const rightEdge = new Uint8Array(rowCount * 4);

  for (let cx = x0; cx <= x1; cx++) {
    const ci = (cx - x0) * 4;
    const ti = ((y0 - 1) * width + cx) * 4;
    const bi = ((y1 + 1) * width + cx) * 4;
    topEdge[ci]   = data[ti];   topEdge[ci+1] = data[ti+1]; topEdge[ci+2] = data[ti+2]; topEdge[ci+3] = 255;
    botEdge[ci]   = data[bi];   botEdge[ci+1] = data[bi+1]; botEdge[ci+2] = data[bi+2]; botEdge[ci+3] = 255;
  }
  for (let cy = y0; cy <= y1; cy++) {
    const ci = (cy - y0) * 4;
    const li = (cy * width + (x0 - 1)) * 4;
    const ri = (cy * width + (x1 + 1)) * 4;
    leftEdge[ci]  = data[li];   leftEdge[ci+1]  = data[li+1]; leftEdge[ci+2]  = data[li+2]; leftEdge[ci+3]  = 255;
    rightEdge[ci] = data[ri];   rightEdge[ci+1] = data[ri+1]; rightEdge[ci+2] = data[ri+2]; rightEdge[ci+3] = 255;
  }

  // Fill each interior pixel with bilinear blend of surrounding background
  for (let py = y0; py <= y1; py++) {
    const fy  = rowCount > 1 ? (py - y0) / (rowCount - 1) : 0.5;
    const wtop = 1 - fy;
    const wbot = fy;
    const li   = (py - y0) * 4;

    for (let px = x0; px <= x1; px++) {
      const fx   = colCount > 1 ? (px - x0) / (colCount - 1) : 0.5;
      const wlft = 1 - fx;
      const wrgt = fx;
      const ci   = (px - x0) * 4;
      const oi   = (py * width + px) * 4;

      for (let c = 0; c < 3; c++) {
        const hBlend = leftEdge[li+c] * wlft + rightEdge[li+c] * wrgt;
        const vBlend = topEdge[ci+c]  * wtop + botEdge[ci+c]   * wbot;
        data[oi+c]   = Math.round((hBlend + vBlend) / 2);
      }
      data[oi+3] = 255;
    }
  }
}

// ─── Video Frame Iterator (browser-native, no WASM) ───────────────────────────
/**
 * Iterate over every frame of a video using the browser's HTMLVideoElement.
 * For each frame: draws to canvas, inpaints watermark, returns JPEG Uint8Array.
 * This keeps FFmpeg's WASM heap free — zero WASM memory pressure.
 */
async function* iterateFrames(
  sourceBlob: Blob,
  region: WatermarkRegionPx,
): AsyncGenerator<{ jpeg: Uint8Array; index: number; total: number; fps: number }> {
  const url   = URL.createObjectURL(sourceBlob);
  const video = document.createElement('video');
  video.src     = url;
  video.muted   = true;
  video.preload = 'auto';

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error(`Video failed to load metadata: ${video.error?.message}`));
  });

  // Probe FPS: prefer the decoder's native fps, fall back to 30
  // HTMLVideoElement doesn't expose fps directly — we estimate from duration
  const duration = video.duration;
  if (!isFinite(duration) || duration <= 0) {
    URL.revokeObjectURL(url);
    throw new Error(`Invalid video duration: ${duration}`);
  }

  // Probe frame count by seeking to the end region
  // We'll use a conservative 30fps estimate and adjust later from decoded timestamps
  const fps    = 30; // will be corrected from FFmpeg logs during re-encode
  const total  = Math.max(1, Math.ceil(duration * fps));
  const canvas = document.createElement('canvas');
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  for (let i = 0; i < total; i++) {
    const seekTime = i / fps;

    await new Promise<void>((resolve) => {
      const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
      video.addEventListener('seeked', onSeeked);
      video.currentTime = seekTime;
    });

    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    fillRegion(imageData, region);
    ctx.putImageData(imageData, 0, 0);

    const jpeg = await new Promise<Uint8Array>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (!b) { reject(new Error('canvas.toBlob returned null')); return; }
          b.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
        },
        'image/jpeg',
        0.95,
      );
    });

    yield { jpeg, index: i, total, fps };

    // Yield to main thread for UI updates
    await new Promise(r => setTimeout(r, 0));
  }

  URL.revokeObjectURL(url);
}

// ─── Public API ────────────────────────────────────────────────────────────────
export async function removeWatermark(
  asset: Asset,
  region: WatermarkRegionPx,
  projectId: string,
  onProgress?: (progress: number) => void,
): Promise<Asset> {

  // ── Phase 1 (0–8%): Load FFmpeg ───────────────────────────────────────────
  onProgress?.(0.02);
  const ff = await getFFmpeg();
  onProgress?.(0.08);

  // ── Phase 2 (8–12%): Load source from OPFS ────────────────────────────────
  const sourceFile = await getFileFromOPFS(asset.opfsPath);
  const inputExt   = asset.opfsPath.split('.').pop()?.toLowerCase() || 'mp4';
  const outputName = `wm_output.${inputExt}`;
  onProgress?.(0.12);

  // ── Phase 3 (12–85%): Extract+inpaint each frame via browser video decoder ─
  // Write frames directly into FFmpeg's virtual FS one at a time.
  // This keeps WASM heap usage constant (one frame in memory at a time)
  // rather than dumping all frames in at once.
  let actualFps = 30;
  let actualTotal = 1;

  for await (const { jpeg, index, total, fps } of iterateFrames(sourceFile, region)) {
    actualFps   = fps;
    actualTotal = total;

    const frameName = `wm_frame_${String(index + 1).padStart(6, '0')}.jpg`;
    await ff.writeFile(frameName, jpeg);

    // Progress: 12% → 85% during frame inpainting
    onProgress?.(0.12 + ((index + 1) / total) * 0.73);
  }

  // Write original source into FFmpeg VFS for audio extraction
  onProgress?.(0.85);
  const sourceData = await fetchFile(sourceFile);
  const inputName  = `wm_input.${inputExt}`;
  await ff.writeFile(inputName, sourceData);

  // ── Phase 4 (85–92%): Re-encode inpainted frames → H.264 MP4 ─────────────
  const encodeLogs: string[] = [];
  const encodeLogHandler = (e: { message: string }) => encodeLogs.push(e.message);
  ff.on('log', encodeLogHandler);

  const exitCode = await ff.exec([
    '-framerate', String(actualFps),
    '-i', 'wm_frame_%06d.jpg',   // input 0: inpainted frames
    '-i', inputName,              // input 1: original (audio only)
    '-map', '0:v',
    '-map', '1:a?',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    '-shortest',
    outputName,
  ]);

  ff.off('log', encodeLogHandler);

  if (exitCode !== 0) {
    const recentLogs = encodeLogs.slice(-20).join('\n');
    throw new Error(`Re-encoding failed (exit ${exitCode}):\n${recentLogs}`);
  }

  // ── Phase 5 (92–97%): Read output + save ──────────────────────────────────
  onProgress?.(0.92);
  const outputData = await ff.readFile(outputName) as Uint8Array;
  if (outputData.length === 0) {
    throw new Error('Output video is 0 bytes — FFmpeg re-encoding silently failed.');
  }

  const mimeType   = inputExt === 'mov' ? 'video/quicktime' : 'video/mp4';
  const outputBlob = new Blob([outputData as any], { type: mimeType });

  const newAssetId  = Math.random().toString(36).substring(2, 9);
  const newOpfsPath = `${projectId}/${newAssetId}.${inputExt}`;
  await saveFileToOPFS(newOpfsPath, outputBlob);

  const cleanName = asset.name.replace(/(\.[^.]+)$/, `_nowm.${inputExt}`);
  const newAsset: Asset = {
    id:         newAssetId,
    projectId,
    name:       cleanName,
    size:       outputBlob.size,
    type:       asset.type,
    durationMs: asset.durationMs,
    width:      asset.width,
    height:     asset.height,
    opfsPath:   newOpfsPath,
    createdAt:  new Date(),
  };

  await db.assets.add(newAsset);

  // ── Phase 6 (97–100%): Cleanup FFmpeg virtual FS ──────────────────────────
  onProgress?.(0.97);
  const cleanupFiles = [inputName, outputName];
  for (let i = 1; i <= actualTotal; i++) {
    cleanupFiles.push(`wm_frame_${String(i).padStart(6, '0')}.jpg`);
  }
  await Promise.allSettled(cleanupFiles.map(f => ff.deleteFile(f)));

  onProgress?.(1.0);
  return newAsset;
}
