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
import { WebGLWatermarkEngine } from './webgl-engine';

/**
 * Universal safe seek helper that guarantees execution never hangs,
 * even if the browser drops the 'seeked' event or currentTime is already equal.
 */
export function seekVideoToTime(video: HTMLVideoElement, timeSec: number, timeoutMs = 500): Promise<void> {
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
  mode: 'translucent' | 'opaque' = 'opaque',
  webglEngine: WebGLWatermarkEngine | null = null,
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
    if (webglEngine) {
      webglEngine.processFrame(canvas, activeRegion, mode);
      ctx.drawImage(webglEngine.getCanvas(), 0, 0);
    } else {
      const imageData = ctx.getImageData(0, 0, w, h);
      const inpainted = inpaintRegion(imageData, activeRegion);
      ctx.putImageData(inpainted, 0, 0);
    }

    onProgress?.(0.18 + (i / total) * 0.72);
    // Pace MediaRecorder to maintain correct target framerate in recorded container
    await new Promise(r => setTimeout(r, Math.max(8, Math.floor(1000 / fps))));
  }

  try {
    if (recorder.state === 'recording') recorder.requestData();
  } catch { /* ignore */ }
  recorder.stop();
  const res = await finished;
  try {
    stream.getTracks().forEach(t => t.stop());
  } catch { /* ignore */ }
  return res;
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
  // Temporarily attach off-screen to DOM so WebKit/Safari does not throttle or drop seeked events
  video.style.position = 'fixed';
  video.style.top = '-9999px';
  video.style.left = '-9999px';
  video.style.width = '1px';
  video.style.height = '1px';
  video.style.opacity = '0';
  video.style.pointerEvents = 'none';
  document.body.appendChild(video);

  try {
    await new Promise<void>((res, rej) => {
      const timer = setTimeout(() => rej(new Error('Could not load video metadata (timeout)')), 8000);
      video.onloadedmetadata = () => { clearTimeout(timer); res(); };
      video.onerror = () => { clearTimeout(timer); rej(new Error('Could not load video metadata')); };
      video.load();
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

    // Hardware-accelerated GPU WebGL engine
    let webglEngine: WebGLWatermarkEngine | null = null;
    try {
      webglEngine = new WebGLWatermarkEngine(normW, normH);
    } catch (err) {
      console.warn('[WM/Fallback] WebGL engine unavailable, using fast CPU inpaint:', err);
    }

    // ── Universal MediaRecorder fallback if WebCodecs is unavailable or fails ──
    let useMediaRecorder = typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined';
    let muxer: any = null;
    let enc: any = null;
    let audioOk = false;

    if (!useMediaRecorder) {
      try {
        audioOk = await canMuxAudio(audio);
        muxer   = makeVideoMuxer(normW, normH, audio, audioOk);
        enc     = await makeVideoEncoder(muxer, normW, normH, fps);
      } catch (err) {
        console.warn('[WM/Fallback] VideoEncoder configure failed, falling back to MediaRecorder:', err);
        useMediaRecorder = true;
      }
    }

    if (useMediaRecorder) {
      try {
        return await recordCanvasFallback(canvas, video, total, fps, activeRegion, mode, webglEngine, onProgress);
      } finally {
        if (webglEngine) webglEngine.destroy();
      }
    }

    try {
      for (let i = 0; i < total; i++) {
        await seekVideoToTime(video, i / fps);

        // Draw → inpaint (GPU WebGL or fast CPU) → encode
        if (webglEngine) {
          ctx.drawImage(video, 0, 0, normW, normH);
          webglEngine.processFrame(canvas, activeRegion, mode);
          const frame = new VideoFrame(webglEngine.getCanvas(), { timestamp: (i * 1_000_000) / fps });
          try { enc.encode(frame); } finally { frame.close(); }
        } else {
          ctx.drawImage(video, 0, 0, normW, normH);
          const imageData = ctx.getImageData(0, 0, normW, normH);
          const inpainted = inpaintRegion(imageData, activeRegion);
          ctx.putImageData(inpainted, 0, 0);
          const frame = new VideoFrame(canvas, { timestamp: (i * 1_000_000) / fps });
          try { enc.encode(frame); } finally { frame.close(); }
        }

        onProgress?.(0.18 + (i / total) * 0.72);
        if (i % CFG.YIELD_EVERY_N_FRAMES === 0) {
          await new Promise(r => setTimeout(r, 0));
        }
      }

      await enc.flush();
      enc.close();
      if (webglEngine) webglEngine.destroy();

      if (audioOk && audio) { onProgress?.(0.92); await muxAudio(muxer, audio); }
      onProgress?.(0.97);
    } catch (err) {
      if (webglEngine) webglEngine.destroy();
      try { if (enc.state !== 'closed') enc.close(); } catch { /* ignore */ }
      throw err;
    }

    return finalizeMuxer(muxer);
  } finally {
    if (video.parentNode) video.parentNode.removeChild(video);
    URL.revokeObjectURL(url);
  }
}
