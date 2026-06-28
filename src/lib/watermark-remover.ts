/**
 * watermark-remover.ts
 *
 * Uses ffmpeg.wasm (already a project dependency) to apply the `delogo`
 * filter to a video asset, blurring the region specified by the user.
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

// Singleton – load once, reuse.
let ffmpegInstance: FFmpeg | null = null;

async function getFFmpeg(
  onProgress?: (progress: number) => void
): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;

  const ff = new FFmpeg();

  if (onProgress) {
    ff.on('progress', ({ progress }) => {
      onProgress(Math.max(0, Math.min(1, progress)));
    });
  }

  // Load from CDN with crossOriginIsolated support
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
  await ff.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegInstance = ff;
  return ff;
}

/**
 * Remove a watermark from the given asset using FFmpeg delogo filter.
 *
 * @param asset         - The source asset record from IndexedDB.
 * @param region        - Bounding box in actual video pixel coordinates.
 * @param projectId     - Project ID, used for OPFS path construction.
 * @param onProgress    - Callback receiving 0 to 1 float progress.
 * @returns             - The new asset record (saved to DB + OPFS).
 */
export async function removeWatermark(
  asset: Asset,
  region: WatermarkRegionPx,
  projectId: string,
  onProgress?: (progress: number) => void
): Promise<Asset> {
  const ff = await getFFmpeg(onProgress);

  // Read source file from OPFS
  const sourceFile = await getFileFromOPFS(asset.opfsPath);
  const sourceData = await fetchFile(sourceFile);

  const inputName = 'input.mp4';
  const outputName = 'output.mp4';

  await ff.writeFile(inputName, sourceData);

  // Clamp region values to be safe
  const x = Math.max(0, Math.round(region.x));
  const y = Math.max(0, Math.round(region.y));
  const w = Math.max(4, Math.round(region.w));
  const h = Math.max(4, Math.round(region.h));

  // Run delogo filter: blurs/interpolates the marked rectangle
  await ff.exec([
    '-i', inputName,
    '-vf', `delogo=x=${x}:y=${y}:w=${w}:h=${h}:show=0`,
    '-c:a', 'copy',
    '-preset', 'ultrafast',
    outputName
  ]);

  // Read the output file
  const outputData = await ff.readFile(outputName);
  const outputBlob = new Blob([outputData as any], { type: 'video/mp4' });

  // Save to OPFS as a new asset
  const newAssetId = Math.random().toString(36).substring(2, 9);
  const fileExt = asset.opfsPath.split('.').pop() || 'mp4';
  const newOpfsPath = `${projectId}/${newAssetId}.${fileExt}`;

  await saveFileToOPFS(newOpfsPath, outputBlob);

  // Save asset record to IndexedDB
  const cleanName = asset.name.replace(/(\.[^.]+)$/, '_nowm$1');
  const newAsset: Asset = {
    id: newAssetId,
    projectId,
    name: cleanName,
    size: outputBlob.size,
    type: asset.type,
    durationMs: asset.durationMs,
    width: asset.width,
    height: asset.height,
    opfsPath: newOpfsPath,
    createdAt: new Date()
  };

  await db.assets.add(newAsset);

  // Clean up ffmpeg virtual FS
  try {
    await ff.deleteFile(inputName);
    await ff.deleteFile(outputName);
  } catch { /* ignore cleanup errors */ }

  return newAsset;
}
