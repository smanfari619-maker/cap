/**
 * index.ts — Public API for the watermark removal module.
 *
 * This is the ONLY file other parts of the app should import from:
 *   import { removeWatermark, removeWatermarkFromVideoFile } from '../lib/watermark';
 */

import { db, type Asset }     from '../db';
import { saveFileToOPFS, getFileFromOPFS } from '../opfs';
import { pipelineWebCodecs, getEstimatedGeminiRegion }  from './pipeline-webcodecs';
import { pipelineFallback }   from './pipeline-fallback';
import { inpaintRegion }      from './inpaint-telea';

export type { WatermarkRegionPx, RemovalStatus } from './types';

// ─── Shared audio extraction ──────────────────────────────────────────────────

async function extractAudio(file: File): Promise<AudioBuffer | null> {
  try {
    const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ab = await ac.decodeAudioData(await file.arrayBuffer());
    ac.close().catch(() => {});
    return ab;
  } catch {
    return null;
  }
}

// ─── Choose pipeline ──────────────────────────────────────────────────────────

function hasWebCodecs(): boolean {
  return typeof VideoDecoder !== 'undefined' && typeof VideoEncoder !== 'undefined';
}

async function extractFirstFrame(file: File, vw: number, vh: number): Promise<ImageData> {
  const el = Object.assign(document.createElement('video'), {
    src: URL.createObjectURL(file), muted: true, preload: 'metadata',
  });
  await new Promise<void>((res, rej) => {
    el.onloadedmetadata = () => res();
    el.onerror = () => rej(new Error('Failed to read video metadata'));
  });
  el.currentTime = 0.1; // Seek slightly to get a real frame
  await new Promise(r => el.onseeked = r);
  
  const canvas = document.createElement('canvas');
  canvas.width = vw; canvas.height = vh;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(el, 0, 0, vw, vh);
  URL.revokeObjectURL(el.src);
  return ctx.getImageData(0, 0, vw, vh);
}

async function runBestPipeline(
  file      : File,
  audio     : AudioBuffer | null,
  vw        : number,
  vh        : number,
  region    : { x: number; y: number; w: number; h: number } | null,
  onProgress?: (p: number) => void
): Promise<ArrayBuffer> {
  
  // 1. Try Gemini Native perfect extraction (Reverse Alpha Blending)
  let geminiMatch: any = null;
  if (region) {
    try {
      const imageData = await extractFirstFrame(file, vw, vh);
      const { createWatermarkEngine } = await import('@pilio/gemini-watermark-remover');
      const engine = await createWatermarkEngine();
      const { detectWatermarkLocally } = await import('./gemini-detector');
      
      geminiMatch = await detectWatermarkLocally(imageData, engine, region);
      if (geminiMatch) {
         console.log('[WM] Gemini watermark detected! Skipping AI backend and using perfect reverse-alpha blend.');
      }
    } catch (e) {
      console.warn('[WM] Gemini detection failed', e);
    }
  }

  // 2. Try Python AI Backend (STTN / ProPainter)
  // Skip this if we already perfectly matched the Gemini watermark
  if (!geminiMatch) {
    try {
      onProgress?.(0.1); // Indicate upload started
      const formData = new FormData();
      formData.append('file', file);
      formData.append('region', JSON.stringify(region || { x: 0, y: 0, w: vw, h: vh }));

      const res = await fetch('http://localhost:8000/api/remove-watermark', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        onProgress?.(0.9);
        const arrayBuffer = await res.arrayBuffer();
        if (arrayBuffer.byteLength > 0) {
          return arrayBuffer;
        }
      } else {
        console.warn('[WM] Backend API returned error:', await res.text());
      }
    } catch (err) {
      console.warn('[WM] Python backend not running or failed, falling back to browser inpainting:', err);
    }
  }

  // 3. Fallback to Browser Processing
  if (hasWebCodecs()) {
    try {
      return await pipelineWebCodecs(file, audio, vw, vh, region, geminiMatch, onProgress);
    } catch (err) {
      console.warn('[WM] WebCodecs pipeline failed, using seek fallback:', err);
    }
  }
  
  return pipelineFallback(file, audio, vw, vh, region, geminiMatch, onProgress);
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
  onProgress?: (progress: number) => void
): Promise<Asset> {
  onProgress?.(0.01);
  const sourceFile = await getFileFromOPFS(asset.opfsPath);
  const inputExt   = asset.opfsPath.split('.').pop()?.toLowerCase() || 'mp4';

  onProgress?.(0.05);
  const audio = await extractAudio(sourceFile);
  onProgress?.(0.1);

  const vw = asset.width  || 1920;
  const vh = asset.height || 1080;

  const outputBuffer = await runBestPipeline(sourceFile, audio, vw, vh, region, onProgress);

  if (outputBuffer.byteLength === 0)
    throw new Error('Processed video is 0 bytes — encoding failed.');

  const mimeType = inputExt === 'mov' ? 'video/quicktime' : 'video/mp4';
  const blob     = new Blob([outputBuffer], { type: mimeType });
  const newId    = Math.random().toString(36).slice(2, 9);
  const opfsPath = `${projectId}/${newId}.${inputExt}`;

  await saveFileToOPFS(opfsPath, blob);

  const newAsset: Asset = {
    id        : newId,
    projectId,
    name      : asset.name.replace(/(\.[^.]+)$/, `_nowm.${inputExt}`),
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
  onProgress?: (progress: number) => void
): Promise<ArrayBuffer> {
  const el = Object.assign(document.createElement('video'), {
    src: URL.createObjectURL(file), muted: true, preload: 'metadata',
  });
  await new Promise<void>((res, rej) => {
    el.onloadedmetadata = () => res();
    el.onerror = () => rej(new Error('Failed to read video metadata'));
  });
  const { videoWidth: vw, videoHeight: vh } = el;
  URL.revokeObjectURL(el.src);

  const audio = await extractAudio(file);
  return runBestPipeline(file, audio, vw, vh, region, onProgress);
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
