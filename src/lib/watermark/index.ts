/**
 * index.ts — Public API for the watermark removal module.
 *
 * This is the ONLY file other parts of the app should import from:
 *   import { removeWatermark, removeWatermarkFromVideoFile } from '../lib/watermark';
 */

import { db, type Asset }     from '../db';
import { saveFileToOPFS, getFileFromOPFS } from '../opfs';
import { pipelineWebCodecs, getEstimatedGeminiRegion }  from './pipeline-webcodecs';
import { pipelineFallback, seekVideoToTime }   from './pipeline-fallback';
import { inpaintRegion }      from './inpaint-telea';
export { inpaintRegion }      from './inpaint-telea';

export type { WatermarkRegionPx, RemovalStatus } from './types';

// ─── Format Detector ──────────────────────────────────────────────────────────

export function detectVideoMimeType(buffer: ArrayBuffer): { mime: string; ext: string } {
  if (buffer.byteLength >= 12) {
    const bytes = new Uint8Array(buffer, 0, 12);
    // WebM magic bytes: 1A 45 DF A3
    if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
      return { mime: 'video/webm', ext: 'webm' };
    }
    // MP4 'ftyp' at bytes 4..7
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
      return { mime: 'video/mp4', ext: 'mp4' };
    }
  }
  return { mime: 'video/mp4', ext: 'mp4' };
}

// ─── Shared audio extraction ──────────────────────────────────────────────────

async function extractAudio(file: File): Promise<AudioBuffer | null> {
  try {
    const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ab = await ac.decodeAudioData(await file.arrayBuffer());
    ac.close().catch(() => {});

    // Windows Media Foundation AAC encoder strictly requires mono or stereo (<= 2 channels)
    if (ab.numberOfChannels > 2) {
      try {
        const offlineCtx = new OfflineAudioContext(2, ab.length, ab.sampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = ab;
        source.connect(offlineCtx.destination);
        source.start();
        return await offlineCtx.startRendering();
      } catch {
        return ab;
      }
    }

    return ab;
  } catch {
    return null;
  }
}

// ─── Choose pipeline ──────────────────────────────────────────────────────────

function hasWebCodecs(): boolean {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    console.warn(
      '[WM] Note: Application is accessed on an insecure HTTP context (e.g. LAN IP). ' +
      'WebCodecs hardware acceleration requires HTTPS or localhost. Using universal fallback pipeline.'
    );
    return false;
  }
  return typeof VideoDecoder !== 'undefined' && typeof VideoEncoder !== 'undefined';
}

async function loadVideoMetadata(file: File): Promise<{ el: HTMLVideoElement; cleanup: () => void }> {
  const url = URL.createObjectURL(file);
  const el = document.createElement('video');
  el.src = url;
  el.muted = true;
  el.playsInline = true;
  el.preload = 'metadata';
  el.style.position = 'fixed';
  el.style.top = '-9999px';
  el.style.left = '-9999px';
  el.style.width = '1px';
  el.style.height = '1px';
  el.style.opacity = '0';
  el.style.pointerEvents = 'none';
  document.body.appendChild(el);

  const cleanup = () => {
    if (el.parentNode) el.parentNode.removeChild(el);
    URL.revokeObjectURL(url);
  };

  try {
    await new Promise<void>((res, rej) => {
      const timer = setTimeout(() => rej(new Error('Timeout loading video metadata')), 8000);
      el.onloadedmetadata = () => { clearTimeout(timer); res(); };
      el.onerror = () => { clearTimeout(timer); rej(new Error('Failed to read video metadata')); };
      el.load();
    });
    return { el, cleanup };
  } catch (err) {
    cleanup();
    throw err;
  }
}

async function extractFirstFrame(file: File, vw: number, vh: number): Promise<ImageData> {
  const { el, cleanup } = await loadVideoMetadata(file);
  try {
    await seekVideoToTime(el, 0.1, 800);
    const canvas = document.createElement('canvas');
    canvas.width = vw; canvas.height = vh;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(el, 0, 0, vw, vh);
    return ctx.getImageData(0, 0, vw, vh);
  } finally {
    cleanup();
  }
}

async function runBestPipeline(
  file      : File,
  audio     : AudioBuffer | null,
  vw        : number,
  vh        : number,
  region    : { x: number; y: number; w: number; h: number } | null,
  mode      : 'translucent' | 'opaque' = 'opaque',
  onProgress?: (p: number) => void
): Promise<ArrayBuffer> {
  if (hasWebCodecs()) {
    try {
      return await pipelineWebCodecs(file, audio, vw, vh, region, null, mode, onProgress);
    } catch (err) {
      console.warn('[WM] WebCodecs pipeline failed, falling back to seek pipeline:', err);
    }
  }
  
  return pipelineFallback(file, audio, vw, vh, region, null, mode, onProgress);
}

// ─── Public functions ─────────────────────────────────────────────────────────

/**
 * Remove the Gemini watermark from an OPFS-stored video asset.
 * Saves the result back to OPFS, creates a new Asset record, and returns it.
 *
 * Used by the editor (ClipInspector → removeWatermark).
 */
export async function removeWatermark(
  asset     : Asset,
  region    : { x: number; y: number; w: number; h: number } | null,
  projectId : string,
  mode      : 'translucent' | 'opaque' = 'opaque',
  onProgress?: (progress: number) => void
): Promise<Asset> {
  onProgress?.(0.01);
  const sourceFile = await getFileFromOPFS(asset.opfsPath);

  onProgress?.(0.05);
  const audio = await extractAudio(sourceFile);
  onProgress?.(0.1);

  const vw = asset.width  || 1920;
  const vh = asset.height || 1080;

  const outputBuffer = await runBestPipeline(sourceFile, audio, vw, vh, region, mode, onProgress);

  if (outputBuffer.byteLength === 0)
    throw new Error('Processed video is 0 bytes — encoding failed.');

  const detected = detectVideoMimeType(outputBuffer);
  const finalExt = detected.ext;
  const blob     = new Blob([outputBuffer], { type: detected.mime });
  const newId    = Math.random().toString(36).slice(2, 9);
  const opfsPath = `${projectId}/${newId}.${finalExt}`;

  await saveFileToOPFS(opfsPath, blob);

  const newAsset: Asset = {
    id        : newId,
    projectId,
    name      : asset.name.replace(/(\.[^.]+)$/, `_nowm.${finalExt}`),
    size      : blob.size,
    type      : asset.type,
    durationMs: asset.durationMs,
    width     : asset.width,
    height    : asset.height,
    opfsPath,
    createdAt : new Date(),
  };
  await db.assets.add(newAsset);
  onProgress?.(1.0);
  return newAsset;
}

/**
 * Remove the Gemini watermark from a plain File (no OPFS needed).
 * Returns the processed video as an ArrayBuffer.
 *
 * Used by the Dashboard watermark tool (WatermarkRemoverTool.tsx).
 */
export async function removeWatermarkFromVideoFile(
  file      : File,
  region    : { x: number; y: number; w: number; h: number } | null = null,
  mode      : 'translucent' | 'opaque' = 'opaque',
  onProgress?: (progress: number) => void
): Promise<ArrayBuffer> {
  const { el, cleanup } = await loadVideoMetadata(file);
  const { videoWidth: vw, videoHeight: vh } = el;
  cleanup();

  const audio = await extractAudio(file);
  const outputBuffer = await runBestPipeline(file, audio, vw, vh, region, mode, onProgress);
  if (outputBuffer.byteLength === 0) {
    throw new Error('Processed video is 0 bytes — encoding failed.');
  }
  return outputBuffer;
}

/**
 * Remove the watermark from an ImageData sync (for image processing).
 *
 * Used by the Dashboard watermark tool (WatermarkRemoverTool.tsx).
 */
export function removeWatermarkFromImageDataSync(
  imageData: ImageData,
  region    : { x: number; y: number; w: number; h: number } | null = null
): { imageData: ImageData } {
  const vw = imageData.width;
  const vh = imageData.height;
  const activeRegion = region || getEstimatedGeminiRegion(vw, vh);
  const result = inpaintRegion(imageData, activeRegion);
  return { imageData: result };
}
