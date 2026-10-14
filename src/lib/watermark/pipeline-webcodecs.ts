/**
 * pipeline-webcodecs.ts — High-performance pipeline using WebCodecs + Telea Inpainting.
 *
 * Flow:
 *   1. Demux MP4 with mp4box
 *   2. Resolve watermark region (user manual region or estimated Gemini default)
 *   3. VideoDecoder loop → inpaintRegion (Telea + Exemplar Patch) → VideoEncoder → mp4-muxer
 *   4. Encode original audio
 */

import { CFG }            from './config';
import { demuxMP4 }       from './demuxer';
import { makeVideoMuxer, makeVideoEncoder, muxAudio, finalizeMuxer, canMuxAudio } from './encoder';
import { inpaintRegion }  from './inpaint-telea';
import { WebGLWatermarkEngine } from './webgl-engine';

/**
 * Returns estimated Gemini watermark region based on video resolution.
 */
export function getEstimatedGeminiRegion(vw: number, vh: number) {
  const isLarge = vw > 1024 && vh > 1024;
  const logoSize = isLarge ? 96 : 48;
  const marginRight = isLarge ? 64 : 32;
  const marginBottom = isLarge ? 64 : 32;
  return {
    x: vw - marginRight - logoSize,
    y: vh - marginBottom - logoSize,
    w: logoSize,
    h: logoSize,
  };
}

export async function pipelineWebCodecs(
  file      : File,
  audio     : AudioBuffer | null,
  vw        : number,
  vh        : number,
  region    : { x: number; y: number; w: number; h: number } | null,
  geminiMatch: any,
  mode: 'translucent' | 'opaque' = 'opaque',
  onProgress?: (p: number) => void
): Promise<ArrayBuffer> {
  // ── 1. Demux ────────────────────────────────────────────────────────────────
  const arrayBuffer = await file.arrayBuffer();
  const demuxed     = await demuxMP4(arrayBuffer);
  onProgress?.(0.12);

  // ── 2. Determine watermark region & normalize dimensions ───────────────────
  const normW = Math.max(2, Math.floor(vw) & ~1);
  const normH = Math.max(2, Math.floor(vh) & ~1);
  const activeRegion = region || getEstimatedGeminiRegion(normW, normH);
  console.log('[WM/WebCodecs] Inpainting region:', activeRegion, `dims: ${normW}x${normH}`);
  onProgress?.(0.18);

  const canvas = document.createElement('canvas');
  canvas.width = normW; canvas.height = normH;
  const ctx    = canvas.getContext('2d', { willReadFrequently: true })!;

  // Hardware-accelerated GPU WebGL engine (~1ms per frame instead of 3000ms CPU)
  let webglEngine: WebGLWatermarkEngine | null = null;
  try {
    webglEngine = new WebGLWatermarkEngine(normW, normH);
  } catch (err) {
    console.warn('[WM/WebCodecs] WebGL engine unavailable, using optimized CPU inpaint:', err);
  }

  // ── 3. WebCodecs Decode & Encode Loop ────────────────────────────────────────
  const audioOk = await canMuxAudio(audio);
  const muxer = makeVideoMuxer(normW, normH, audio, audioOk);
  const enc   = await makeVideoEncoder(muxer, normW, normH, 30);

  const queue: VideoFrame[] = [];
  let resolver: (() => void) | null = null;
  let rejecter: ((err: Error) => void) | null = null;
  let decErr : Error | null = null;

  const dec = new VideoDecoder({
    output: frame => {
      queue.push(frame);
      if (resolver) {
        const r = resolver;
        resolver = null;
        rejecter = null;
        r();
      }
    },
    error : e => {
      decErr = e instanceof Error ? e : new Error(String(e));
      if (rejecter) {
        const rej = rejecter;
        resolver = null;
        rejecter = null;
        rej(decErr);
      }
    },
  });
  dec.configure({
    codec      : demuxed.codec,
    codedWidth : demuxed.width,
    codedHeight: demuxed.height,
    description: demuxed.description,
  });

  let fed = 0;
  let processedFrames = 0;
  const totalFrames = demuxed.samples.length;

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (decErr) throw decErr;

      // Paced backpressure: feed decoder chunks without saturating memory
      while (fed < totalFrames && dec.decodeQueueSize < CFG.DECODE_QUEUE_LIMIT) {
        const s = demuxed.samples[fed++];
        dec.decode(new EncodedVideoChunk({
          type     : s.is_sync ? 'key' : 'delta',
          timestamp: (s.cts * 1_000_000) / s.timescale,
          duration : (s.duration * 1_000_000) / s.timescale,
          data     : s.data,
        }));
      }

      if (queue.length === 0) {
        if (fed >= totalFrames && dec.state === 'configured') {
          await dec.flush();
        }
        if (queue.length === 0 && fed < totalFrames) {
          while (fed < totalFrames && dec.decodeQueueSize < CFG.DECODE_QUEUE_LIMIT * 2) {
            const s = demuxed.samples[fed++];
            dec.decode(new EncodedVideoChunk({
              type     : s.is_sync ? 'key' : 'delta',
              timestamp: (s.cts * 1_000_000) / s.timescale,
              duration : (s.duration * 1_000_000) / s.timescale,
              data     : s.data,
            }));
          }
        }
        if (queue.length === 0) {
          if (fed >= totalFrames) break;
          await new Promise<void>((res, rej) => {
            let timer: any = null;
            resolver = () => { if (timer) clearTimeout(timer); res(); };
            rejecter = (err) => { if (timer) clearTimeout(timer); rej(err); };
            timer = setTimeout(() => {
              resolver = null;
              rejecter = null;
              rej(new Error('Decode timeout'));
            }, CFG.DECODE_TIMEOUT_MS);
          });
        }
      }
      if (queue.length === 0) break;

      const frame = queue.shift()!;

      // Draw frame → inpaint (GPU WebGL or fast CPU) → encode
      if (webglEngine) {
        ctx.drawImage(frame, 0, 0, normW, normH);
        webglEngine.processFrame(canvas, activeRegion, mode);
        const out = new VideoFrame(webglEngine.getCanvas(), { timestamp: frame.timestamp });
        try { enc.encode(out); } finally { out.close(); }
      } else {
        ctx.drawImage(frame, 0, 0, normW, normH);
        const imageData  = ctx.getImageData(0, 0, normW, normH);
        const inpainted  = inpaintRegion(imageData, activeRegion);
        ctx.putImageData(inpainted, 0, 0);
        const out = new VideoFrame(canvas, { timestamp: frame.timestamp });
        try { enc.encode(out); } finally { out.close(); }
      }
      frame.close();
      processedFrames++;

      onProgress?.(0.18 + (processedFrames / totalFrames) * 0.72);
      if (processedFrames % CFG.YIELD_EVERY_N_FRAMES === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }

    await enc.flush();
    enc.close();
    dec.close();
    if (webglEngine) webglEngine.destroy();

    if (audioOk && audio) { onProgress?.(0.92); await muxAudio(muxer, audio); }
    onProgress?.(0.97);
  } catch (err) {
    if (webglEngine) webglEngine.destroy();
    try { if (enc.state !== 'closed') enc.close(); } catch { /* ignore */ }
    try { if (dec.state !== 'closed') dec.close(); } catch { /* ignore */ }
    throw err;
  }

  return finalizeMuxer(muxer);
}
