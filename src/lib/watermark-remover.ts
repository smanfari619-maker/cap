/**
 * watermark-remover.ts
 *
 * Uses OpenCV.js Telea inpainting for high-quality, realistic watermark removal.
 *
 * Pipeline:
 *  1. FFmpeg extracts every video frame to JPEG images in its virtual filesystem.
 *  2. For each frame, OpenCV.js Telea inpainting reconstructs the watermark region
 *     by propagating surrounding background pixels inward (Fast Marching Method).
 *     Only an expanded ROI around the watermark is processed for maximum speed.
 *  3. FFmpeg re-encodes all inpainted frames back into H.264 MP4 with audio copied
 *     directly from the original source — no audio re-encoding, no quality loss.
 *
 * Requires Cross-Origin-Opener-Policy + Cross-Origin-Embedder-Policy headers
 * (set in vite.config.ts) for SharedArrayBuffer support.
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

// ─── OpenCV.js Singleton ───────────────────────────────────────────────────────
let cvInstance: any = null;
let cvLoadPromise: Promise<any> | null = null;

function loadOpenCV(): Promise<any> {
  if (cvInstance) return Promise.resolve(cvInstance);
  if (cvLoadPromise) return cvLoadPromise;

  cvLoadPromise = new Promise((resolve, reject) => {
    // Already loaded by a previous call
    if ((window as any).cv?.Mat) {
      cvInstance = (window as any).cv;
      resolve(cvInstance);
      return;
    }

    // Load the official OpenCV.js build from public/opencv.js (same-origin).
    // This completely bypasses all CORS/COEP restrictions since the file is
    // served from localhost by Vite. No CDN, no blob URL tricks needed.
    const script = document.createElement('script');
    script.src = '/opencv.js';
    script.async = true;

    script.onload = () => {
      const deadline = Date.now() + 30_000;
      const check = setInterval(() => {
        if ((window as any).cv?.Mat) {
          clearInterval(check);
          cvInstance = (window as any).cv;
          resolve(cvInstance);
        } else if (Date.now() > deadline) {
          clearInterval(check);
          reject(new Error('OpenCV.js failed to initialize within 30 s'));
        }
      }, 50);
    };

    script.onerror = () => reject(new Error('Failed to load /opencv.js'));
    document.head.appendChild(script);
  });

  return cvLoadPromise;
}

// ─── Per-Frame Telea Inpainting ────────────────────────────────────────────────
/**
 * Inpaint the watermark region in a single JPEG frame buffer.
 *
 * For speed we only operate on an expanded ROI (the watermark box + margin)
 * rather than the entire frame. OpenCV still has surrounding context pixels
 * to sample from because the margin extends into the real background.
 */
async function inpaintFrame(
  cv: any,
  jpegData: Uint8Array,
  region: WatermarkRegionPx,
): Promise<Uint8Array> {
  const MARGIN = 60; // extra px around watermark for inpainting context

  // ── Decode JPEG ────────────────────────────────────────────────────────────
  const blob = new Blob([jpegData as any], { type: 'image/jpeg' });
  const bitmap = await createImageBitmap(blob);
  const fw = bitmap.width;
  const fh = bitmap.height;

  // ── Compute expanded ROI (clamped to frame) ────────────────────────────────
  const roiX = Math.max(0, region.x - MARGIN);
  const roiY = Math.max(0, region.y - MARGIN);
  const roiW = Math.min(fw - roiX, region.w + MARGIN * 2);
  const roiH = Math.min(fh - roiY, region.h + MARGIN * 2);

  // Watermark offset within the ROI
  const maskX = region.x - roiX;
  const maskY = region.y - roiY;
  const maskW = Math.min(region.w, roiW - maskX);
  const maskH = Math.min(region.h, roiH - maskY);

  // ── Draw full frame to canvas ──────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.width = fw;
  canvas.height = fh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  // ── Extract ROI pixel data ─────────────────────────────────────────────────
  const roiImageData = ctx.getImageData(roiX, roiY, roiW, roiH);

  // ── Build binary mask efficiently (no pixel-by-pixel WASM calls) ──────────
  const maskArr = new Uint8Array(roiW * roiH); // all zeros = keep
  for (let r = maskY; r < maskY + maskH; r++) {
    const rowStart = r * roiW + maskX;
    maskArr.fill(255, rowStart, rowStart + maskW); // white = inpaint here
  }

  // ── OpenCV: RGBA → BGR → inpaint → RGBA ──────────────────────────────────
  const srcRGBA = cv.matFromImageData(roiImageData);
  const srcBGR  = new cv.Mat();
  cv.cvtColor(srcRGBA, srcBGR, cv.COLOR_RGBA2BGR);
  srcRGBA.delete();

  const maskMat = cv.matFromArray(roiH, roiW, cv.CV_8UC1, maskArr);
  const dstBGR  = new cv.Mat();

  // Telea Fast Marching Method — radius=3 is standard for small watermarks
  cv.inpaint(srcBGR, maskMat, dstBGR, 3, cv.INPAINT_TELEA);

  srcBGR.delete();
  maskMat.delete();

  const dstRGBA = new cv.Mat();
  cv.cvtColor(dstBGR, dstRGBA, cv.COLOR_BGR2RGBA);
  dstBGR.delete();

  // ── Paste inpainted patch back onto full canvas ────────────────────────────
  const patchData = new ImageData(
    new Uint8ClampedArray(dstRGBA.data),
    roiW,
    roiH,
  );
  dstRGBA.delete();
  ctx.putImageData(patchData, roiX, roiY);

  // ── Encode back to JPEG (quality 0.95 to keep file sizes reasonable) ───────
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) { reject(new Error('canvas.toBlob produced null')); return; }
        b.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
      },
      'image/jpeg',
      0.95,
    );
  });
}

// ─── Public API ────────────────────────────────────────────────────────────────
/**
 * Remove a watermark from the given asset using OpenCV.js Telea inpainting.
 *
 * @param asset       - Source asset record from IndexedDB.
 * @param region      - Bounding box in actual video pixel coordinates.
 * @param projectId   - Project ID used for OPFS path construction.
 * @param onProgress  - Optional callback receiving 0–1 float progress.
 * @returns           - The new inpainted asset (saved to DB + OPFS).
 */
export async function removeWatermark(
  asset: Asset,
  region: WatermarkRegionPx,
  projectId: string,
  onProgress?: (progress: number) => void,
): Promise<Asset> {

  // ── Phase 1 (0–8%): Load FFmpeg + OpenCV in parallel ──────────────────────
  onProgress?.(0.02);
  const [ff, cv] = await Promise.all([getFFmpeg(), loadOpenCV()]);
  onProgress?.(0.08);

  // ── Phase 2 (8–12%): Write source to FFmpeg virtual FS ────────────────────
  const sourceFile = await getFileFromOPFS(asset.opfsPath);
  const sourceData = await fetchFile(sourceFile);
  const inputExt   = asset.opfsPath.split('.').pop()?.toLowerCase() || 'mp4';
  const inputName  = `wm_input.${inputExt}`;
  const outputName = `wm_output.${inputExt}`;
  await ff.writeFile(inputName, sourceData);
  onProgress?.(0.12);

  // ── Phase 3 (12–22%): Extract all frames to JPEG, capture FPS from logs ──
  const extractLogs: string[] = [];
  const extractLogHandler = (e: { message: string }) => extractLogs.push(e.message);
  ff.on('log', extractLogHandler);
  await ff.exec(['-i', inputName, '-q:v', '2', 'wm_frame_%06d.jpg']);
  ff.off('log', extractLogHandler);

  // Parse native FPS from extraction logs (e.g. "30 fps" or "29.97 fps")
  let fps = 30;
  for (const line of extractLogs) {
    const m = line.match(/(\d+(?:\.\d+)?)\s+fps/);
    if (m) { fps = parseFloat(m[1]); break; }
  }
  onProgress?.(0.22);

  // ── Phase 4 (22–85%): Telea-inpaint each frame ────────────────────────────
  let frameIndex = 1;
  // We don't know the count upfront — loop until readFile throws.
  // First pass: determine total frame count for accurate progress.
  let totalFrames = 0;
  while (true) {
    try {
      await ff.readFile(`wm_frame_${String(totalFrames + 1).padStart(6, '0')}.jpg`);
      totalFrames++;
    } catch { break; }
  }

  for (frameIndex = 1; frameIndex <= totalFrames; frameIndex++) {
    const frameName = `wm_frame_${String(frameIndex).padStart(6, '0')}.jpg`;
    const frameData = await ff.readFile(frameName) as Uint8Array;

    const inpainted = await inpaintFrame(cv, frameData, region);
    await ff.writeFile(frameName, inpainted);

    // Progress: 22% → 85% across all frames
    onProgress?.(0.22 + (frameIndex / totalFrames) * 0.63);

    // Yield back to the browser's main thread to allow React to repaint,
    // update the progress bar, and prevent the "Page Unresponsive" warning.
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  // ── Phase 5 (85–92%): Re-encode inpainted frames → H.264 MP4 ─────────────
  onProgress?.(0.85);
  const encodeLogs: string[] = [];
  const encodeLogHandler = (e: { message: string }) => encodeLogs.push(e.message);
  ff.on('log', encodeLogHandler);

  const exitCode = await ff.exec([
    '-framerate', String(fps),
    '-i', 'wm_frame_%06d.jpg',   // input 0: inpainted frame sequence
    '-i', inputName,              // input 1: original file (for audio)
    '-map', '0:v',                // video from frames
    '-map', '1:a?',               // audio from original (optional)
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',               // copy original audio, no re-encode
    '-shortest',
    outputName,
  ]);

  ff.off('log', encodeLogHandler);

  if (exitCode !== 0) {
    const recentLogs = encodeLogs.slice(-25).join('\n');
    throw new Error(`Re-encoding failed (exit ${exitCode}):\n${recentLogs}`);
  }

  // ── Phase 6 (92–97%): Read output + save to OPFS ──────────────────────────
  onProgress?.(0.92);
  const outputData = await ff.readFile(outputName) as Uint8Array;
  if (outputData.length === 0) {
    throw new Error('Output video is 0 bytes — re-encoding silently failed.');
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

  // ── Phase 7 (97–100%): Cleanup FFmpeg virtual FS ──────────────────────────
  onProgress?.(0.97);
  const cleanupFiles = [inputName, outputName];
  for (let i = 1; i <= totalFrames; i++) {
    cleanupFiles.push(`wm_frame_${String(i).padStart(6, '0')}.jpg`);
  }
  await Promise.allSettled(cleanupFiles.map(f => ff.deleteFile(f)));

  onProgress?.(1.0);
  return newAsset;
}
