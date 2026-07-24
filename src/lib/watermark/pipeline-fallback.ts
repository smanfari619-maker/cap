/**
 * pipeline-fallback.ts — Seek-based pipeline for containers mp4box cannot demux.
 *
 * Uses HTMLVideoElement.currentTime seeks to extract frames.
 * Slower than WebCodecs but universally compatible.
 * Applies Telea + Exemplar Patch inpainting to every frame.
 */

import { CFG }                  from './config';
import { getEstimatedGeminiRegion } from './pipeline-webcodecs';
import { makeVideoMuxer, makeVideoEncoder, muxAudio, finalizeMuxer } from './encoder';
import { inpaintRegion } from './inpaint-telea';

export async function pipelineFallback(
  file      : File,
  audio     : AudioBuffer | null,
  vw        : number,
  vh        : number,
  region    : { x: number; y: number; w: number; h: number } | null,
  geminiMatch: any,
  mode: 'translucent' | 'opaque' = 'opaque',
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

      // Draw → inpaint → encode
      ctx.drawImage(video, 0, 0, vw, vh);
      const imageData = ctx.getImageData(0, 0, vw, vh);
      const inpainted = inpaintRegion(imageData, activeRegion);
      ctx.putImageData(inpainted, 0, 0);

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
