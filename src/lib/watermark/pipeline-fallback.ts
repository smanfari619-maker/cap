/**
 * pipeline-fallback.ts — Seek-based pipeline for containers mp4box cannot demux
 * or browsers without WebCodecs support (e.g. Firefox).
 *
 * Uses HTMLVideoElement.currentTime seeks to extract frames.
 * Slower than WebCodecs but universally compatible across all devices.
 * Applies Telea + Exemplar Patch inpainting to every frame.
 */

import { CFG }                  from './config';
import { getEstimatedGeminiRegion } from './pipeline-webcodecs';
import { 
  makeVideoMuxer, makeVideoEncoder, muxAudio, 
  finalizeMuxer, normalizeEvenDimension, canMuxAudio 
} from './encoder';
import { inpaintRegion } from './inpaint-telea';

/**
 * Universal safe seek helper that guarantees execution never hangs,
 * even if the browser drops the 'seeked' event or currentTime is already equal.
 */
export function seekVideoToTime(video: HTMLVideoElement, timeSec: number, timeoutMs = 800): Promise<void> {
  return new Promise<void>((resolve) => {
    if (Math.abs(video.currentTime - timeSec) < 0.001) {
      resolve();
      return;
    }

    let resolved = false;
    let timer: any = null;

    const onSeeked = () => {
      if (resolved) return;
      resolved = true;
      if (timer) clearTimeout(timer);
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };

    video.addEventListener('seeked', onSeeked, { once: true });
    timer = setTimeout(onSeeked, timeoutMs);
    try {
      video.currentTime = timeSec;
    } catch {
      onSeeked();
    }
  });
}

async function recordCanvasFallback(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  total: number,
  fps: number,
  activeRegion: any,
  onProgress?: (p: number) => void
): Promise<ArrayBuffer> {
  const stream = canvas.captureStream(fps);
  const mimeType = (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4'))
    ? 'video/mp4'
    : (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm;codecs=vp9'))
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: CFG.ENCODER_BITRATE_BPS });
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  const finished = new Promise<ArrayBuffer>((resolve, reject) => {
    recorder.onstop = async () => {
      try {
        const blob = new Blob(chunks, { type: mimeType });
        resolve(await blob.arrayBuffer());
      } catch (e) {
        reject(e);
      }
    };
    recorder.onerror = e => reject((e as any).error || new Error('MediaRecorder error'));
  });

  recorder.start();
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const w = canvas.width;
  const h = canvas.height;

  for (let i = 0; i < total; i++) {
    await seekVideoToTime(video, i / fps);

    ctx.drawImage(video, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const inpainted = inpaintRegion(imageData, activeRegion);
    ctx.putImageData(inpainted, 0, 0);

    onProgress?.(0.18 + (i / total) * 0.72);
    await new Promise(r => setTimeout(r, Math.max(10, Math.floor(1000 / fps))));
  }

  recorder.stop();
  return await finished;
}

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
  // ── Set up video element with playsInline for iOS / mobile ───────────────────
  const url   = URL.createObjectURL(file);
  const video = Object.assign(document.createElement('video'), {
    src: url, muted: true, playsInline: true, preload: 'auto',
  });
  await new Promise<void>((res, rej) => {
    const timer = setTimeout(() => rej(new Error('Could not load video metadata (timeout)')), 8000);
    video.onloadedmetadata = () => { clearTimeout(timer); res(); };
    video.onerror = () => { clearTimeout(timer); rej(new Error('Could not load video metadata')); };
  });

  const fps   = 30;
  const total = Math.max(1, Math.ceil(video.duration * fps));

  const normW = normalizeEvenDimension(vw);
  const normH = normalizeEvenDimension(vh);

  const canvas = document.createElement('canvas');
  canvas.width = normW; canvas.height = normH;
  const ctx    = canvas.getContext('2d', { willReadFrequently: true })!;

  // ── Determine region ───────────────────────────────────────────────────────
  const activeRegion = region || getEstimatedGeminiRegion(normW, normH);
  console.log('[WM/Fallback] Inpainting region:', activeRegion, `dims: ${normW}x${normH}`);
  onProgress?.(0.18);

  // ── Universal MediaRecorder fallback if WebCodecs is unavailable (e.g. Firefox) ──
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    try {
      return await recordCanvasFallback(canvas, video, total, fps, activeRegion, onProgress);
    } finally {
      URL.revokeObjectURL(url);
      video.remove();
    }
  }

  // ── WebCodecs Frame loop with universal safe seeking ─────────────────────────
  const audioOk = await canMuxAudio(audio);
  const muxer   = makeVideoMuxer(normW, normH, audio, audioOk);
  const enc     = await makeVideoEncoder(muxer, normW, normH, fps);

  try {
    for (let i = 0; i < total; i++) {
      await seekVideoToTime(video, i / fps);

      // Draw → inpaint → encode
      ctx.drawImage(video, 0, 0, normW, normH);
      const imageData = ctx.getImageData(0, 0, normW, normH);
      const inpainted = inpaintRegion(imageData, activeRegion);
      ctx.putImageData(inpainted, 0, 0);

      const frame = new VideoFrame(canvas, { timestamp: (i * 1_000_000) / fps });
      try { enc.encode(frame); } finally { frame.close(); }

      onProgress?.(0.18 + (i / total) * 0.72);
      if (i % CFG.YIELD_EVERY_N_FRAMES === 0) await new Promise(r => setTimeout(r, 0));
    }

    await enc.flush(); enc.close();
    if (audioOk && audio) { onProgress?.(0.92); await muxAudio(muxer, audio); }
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
