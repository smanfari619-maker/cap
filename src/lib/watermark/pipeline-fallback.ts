/**
 * pipeline-fallback.ts — Seek-based pipeline for containers mp4box cannot demux.
 *
 * Uses HTMLVideoElement.currentTime seeks to extract frames.
 * Slower than WebCodecs (one seek per frame) but universally compatible.
 */

import { CFG }                  from './config';
import { inpaintRegion }        from './inpaint-telea';
import { getEstimatedGeminiRegion } from './pipeline-webcodecs';
import { makeVideoMuxer, makeVideoEncoder, muxAudio, finalizeMuxer } from './encoder';

export async function pipelineFallback(
  file      : File,
  audio     : AudioBuffer | null,
  vw        : number,
  vh        : number,
  region    : { x: number; y: number; w: number; h: number } | null,
  geminiMatch: any,
  onProgress?: (p: number) => void
): Promise<ArrayBuffer> {
  // ── Set up video element ───────────────────────────────────────────────────
  const url   = URL.createObjectURL(file);
  const video = Object.assign(document.createElement('video'), {
    src: url, muted: true, playsInline: true, preload: 'auto',
  });
  await new Promise<void>((res, rej) => {
    video.onloadedmetadata = () => res();
    video.onerror = () => rej(new Error('Could not load video metadata'));
  });

  const fps   = 30;
  const total = Math.max(1, Math.ceil(video.duration * fps));

  const canvas = document.createElement('canvas');
  canvas.width = vw; canvas.height = vh;
  const ctx    = canvas.getContext('2d', { willReadFrequently: true })!;

  // ── Determine region ───────────────────────────────────────────────────────
  const activeRegion = region || getEstimatedGeminiRegion(vw, vh);
  console.log('[WM/Fallback] Inpainting region:', activeRegion);
  onProgress?.(0.18);

  // ── Frame loop ─────────────────────────────────────────────────────────────
  const muxer = makeVideoMuxer(vw, vh, audio);
  const enc   = makeVideoEncoder(muxer, vw, vh, fps);

  try {
    for (let i = 0; i < total; i++) {
      await new Promise<void>(res => {
        video.addEventListener('seeked', () => res(), { once: true });
        video.currentTime = i / fps;
      });

      ctx.drawImage(video, 0, 0, vw, vh);
      let imageData = ctx.getImageData(0, 0, vw, vh);

      if (geminiMatch) {
         // Fast reverse alpha-blending
         const { fastRemoveWatermark } = await import('./gemini-detector');
         fastRemoveWatermark(imageData, geminiMatch.alphaMap, geminiMatch.position, 1.0);
      } else {
         imageData = inpaintRegion(imageData, activeRegion);
      }
      
      ctx.putImageData(imageData, 0, 0);

      const frame = new VideoFrame(canvas, { timestamp: (i * 1_000_000) / fps });
      try { enc.encode(frame); } finally { frame.close(); }

      onProgress?.(0.18 + (i / total) * 0.72);
      if (i % CFG.YIELD_EVERY_N_FRAMES === 0) await new Promise(r => setTimeout(r, 0));
    }

    await enc.flush(); enc.close();
    if (audio) { onProgress?.(0.92); await muxAudio(muxer, audio); }
    onProgress?.(0.97);
  } catch (err) {
    try { if (enc.state !== 'closed') enc.close(); } catch { /* ignore */ }
    throw err;
  } finally {
    URL.revokeObjectURL(url);
    video.remove();
  }

  return finalizeMuxer(muxer);
}
