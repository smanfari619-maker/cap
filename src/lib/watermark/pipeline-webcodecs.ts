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
import { makeVideoMuxer, makeVideoEncoder, muxAudio, finalizeMuxer } from './encoder';
import { inpaintRegion }  from './inpaint-telea';

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

  // ── 2. Determine watermark region ───────────────────────────────────────────
  const activeRegion = region || getEstimatedGeminiRegion(vw, vh);
  console.log('[WM/WebCodecs] Inpainting region:', activeRegion);
  onProgress?.(0.18);

  const canvas = document.createElement('canvas');
  canvas.width = vw; canvas.height = vh;
  const ctx    = canvas.getContext('2d', { willReadFrequently: true })!;

  // ── 3. WebCodecs Decode & Encode Loop ────────────────────────────────────────
  const muxer = makeVideoMuxer(vw, vh, audio);
  const enc   = makeVideoEncoder(muxer, vw, vh, 30);

  const queue: VideoFrame[] = [];
  let resolver: (() => void) | null = null;
  let decErr : Error | null = null;

  const dec = new VideoDecoder({
    output: frame => { queue.push(frame); resolver?.(); resolver = null; },
    error : e     => { decErr = e; },
  });
  dec.configure({
    codec      : demuxed.codec,
    codedWidth : demuxed.width,
    codedHeight: demuxed.height,
    description: demuxed.description,
  });

  let fed = 0;
  try {
    for (let i = 0; i < demuxed.samples.length; i++) {
      if (decErr) throw decErr;

      // Feed chunks ahead to saturate the decoder
      while (fed < demuxed.samples.length && queue.length < CFG.DECODE_QUEUE_LIMIT) {
        const s = demuxed.samples[fed++];
        dec.decode(new EncodedVideoChunk({
          type     : s.is_sync ? 'key' : 'delta',
          timestamp: (s.cts * 1_000_000) / s.timescale,
          duration : (s.duration * 1_000_000) / s.timescale,
          data     : s.data,
        }));
      }

      if (queue.length === 0) {
        if (fed >= demuxed.samples.length) await dec.flush();
        if (queue.length === 0) {
          await new Promise<void>((res, rej) => {
            resolver = res;
            setTimeout(() => rej(new Error('Decode timeout')), CFG.DECODE_TIMEOUT_MS);
          });
        }
      }
      if (queue.length === 0) break;

      const frame = queue.shift()!;

      // Draw frame → inpaint → encode
      ctx.drawImage(frame, 0, 0, vw, vh);
      const imageData  = ctx.getImageData(0, 0, vw, vh);
      const inpainted  = inpaintRegion(imageData, activeRegion);
      ctx.putImageData(inpainted, 0, 0);

      const out = new VideoFrame(canvas, { timestamp: frame.timestamp });
      try { enc.encode(out); } finally { out.close(); }
      frame.close();

      onProgress?.(0.18 + (i / demuxed.samples.length) * 0.72);
      if (i % CFG.YIELD_EVERY_N_FRAMES === 0) await new Promise(r => setTimeout(r, 0));
    }

    await enc.flush(); enc.close(); dec.close();
    if (audio) { onProgress?.(0.92); await muxAudio(muxer, audio); }
    onProgress?.(0.97);
  } catch (err) {
    try { if (enc.state !== 'closed') enc.close(); } catch { /* ignore */ }
    try { if (dec.state !== 'closed') dec.close(); } catch { /* ignore */ }
    throw err;
  }

  return finalizeMuxer(muxer);
}
