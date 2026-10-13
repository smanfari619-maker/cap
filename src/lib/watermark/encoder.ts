/**
 * encoder.ts — Video muxer + encoder factory helpers with cross-device fallbacks.
 *
 * Provides dynamic hardware acceleration & codec profile negotiation for
 * Windows, macOS, Linux, and various GPU architectures (NVIDIA, AMD, Intel, Apple Silicon).
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { CFG } from './config';

// ─── Dimension Helper ─────────────────────────────────────────────────────────

/** Enforces even dimensions (required by Windows Media Foundation & hardware encoders) */
export function normalizeEvenDimension(dim: number): number {
  return Math.max(2, Math.floor(dim) & ~1);
}

// ─── Audio encoder check ─────────────────────────────────────────────────────

export async function canMuxAudio(ab: AudioBuffer | null): Promise<boolean> {
  if (!ab || ab.length === 0) return false;
  if (typeof AudioEncoder === 'undefined') return false;
  try {
    const ch = Math.min(2, Math.max(1, ab.numberOfChannels));
    const audioConfig: AudioEncoderConfig = {
      codec           : 'mp4a.40.2',
      numberOfChannels: ch,
      sampleRate      : ab.sampleRate,
      bitrate         : CFG.AUDIO_BITRATE_BPS,
    };
    if (typeof AudioEncoder.isConfigSupported === 'function') {
      const support = await AudioEncoder.isConfigSupported(audioConfig);
      return Boolean(support.supported);
    }
    return true;
  } catch {
    return false;
  }
}

// ─── Video muxer ─────────────────────────────────────────────────────────────

export function makeVideoMuxer(
  vw   : number,
  vh   : number,
  audio: AudioBuffer | null,
  isAudioSupported = true
): Muxer<ArrayBufferTarget> {
  const normW = normalizeEvenDimension(vw);
  const normH = normalizeEvenDimension(vh);
  const hasAudio = isAudioSupported && Boolean(audio && audio.length > 0 && typeof AudioEncoder !== 'undefined');

  return new Muxer({
    target: new ArrayBufferTarget(),
    video : { codec: 'avc', width: normW, height: normH },
    audio : hasAudio
      ? { codec: 'aac', numberOfChannels: Math.min(2, Math.max(1, audio!.numberOfChannels)), sampleRate: audio!.sampleRate }
      : undefined,
    fastStart            : 'in-memory',
    firstTimestampBehavior: 'offset',
  });
}

// ─── Video encoder negotiation ───────────────────────────────────────────────

export async function getSupportedVideoEncoderConfig(
  width: number,
  height: number,
  fps = 30,
  bitrate: number = CFG.ENCODER_BITRATE_BPS
): Promise<VideoEncoderConfig> {
  const normW = normalizeEvenDimension(width);
  const normH = normalizeEvenDimension(height);

  // Candidate codec profiles tested from highest quality to most compatible baseline
  const candidates: Array<{ codec: string; accel: HardwareAcceleration }> = [
    // 1. High Profile (Level 5.1 / 4.2)
    { codec: (normW > 1920 || normH > 1080) ? 'avc1.640033' : 'avc1.64002a', accel: 'prefer-hardware' },
    { codec: (normW > 1920 || normH > 1080) ? 'avc1.640033' : 'avc1.64002a', accel: 'no-preference' },
    // 2. Main Profile
    { codec: 'avc1.4d402a', accel: 'prefer-hardware' },
    { codec: 'avc1.4d402a', accel: 'no-preference' },
    // 3. Baseline Profile (widest compatibility on Windows & Intel integrated graphics)
    { codec: 'avc1.42e01f', accel: 'prefer-hardware' },
    { codec: 'avc1.42e01f', accel: 'no-preference' },
    { codec: 'avc1.42001e', accel: 'no-preference' },
  ];

  for (const candidate of candidates) {
    const config: VideoEncoderConfig = {
      codec: candidate.codec,
      width: normW,
      height: normH,
      bitrate,
      framerate: fps,
      bitrateMode: 'variable',
      hardwareAcceleration: candidate.accel,
    };

    try {
      if (typeof VideoEncoder !== 'undefined' && typeof VideoEncoder.isConfigSupported === 'function') {
        const support = await VideoEncoder.isConfigSupported(config);
        if (support.supported && support.config) {
          return support.config;
        }
      } else {
        return config;
      }
    } catch {
      // Continue trying next candidate
    }
  }

  // Fallback safe configuration
  return {
    codec: 'avc1.42e01f',
    width: normW,
    height: normH,
    bitrate,
    framerate: fps,
    bitrateMode: 'variable',
    hardwareAcceleration: 'no-preference',
  };
}

export async function makeVideoEncoder(
  muxer: Muxer<ArrayBufferTarget>,
  vw   : number,
  vh   : number,
  fps  = 30
): Promise<VideoEncoder> {
  const enc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error : (e) => {
      console.error('[WebCodecs VideoEncoder Error]', e);
      throw e;
    },
  });

  const config = await getSupportedVideoEncoderConfig(vw, vh, fps);
  enc.configure(config);
  return enc;
}

// ─── Audio encoder ────────────────────────────────────────────────────────────

/** Encode an AudioBuffer and add it to the muxer, with non-fatal fallback. */
export async function muxAudio(
  muxer: Muxer<ArrayBufferTarget>,
  ab   : AudioBuffer
): Promise<void> {
  if (typeof AudioEncoder === 'undefined') {
    console.warn('[WM] AudioEncoder not available in this browser context; skipping audio muxing.');
    return;
  }

  const ch = Math.min(2, Math.max(1, ab.numberOfChannels));
  const audioConfig: AudioEncoderConfig = {
    codec             : 'mp4a.40.2',
    numberOfChannels  : ch,
    sampleRate        : ab.sampleRate,
    bitrate           : CFG.AUDIO_BITRATE_BPS,
  };

  try {
    if (typeof AudioEncoder.isConfigSupported === 'function') {
      const support = await AudioEncoder.isConfigSupported(audioConfig);
      if (!support.supported) {
        console.warn(`[WM] AudioEncoder does not support sample rate ${ab.sampleRate}Hz on this OS; skipping audio.`);
        return;
      }
    }
  } catch (err) {
    console.warn('[WM] AudioEncoder support check encountered error:', err);
  }

  let enc: AudioEncoder;
  try {
    enc = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error : (e) => {
        console.warn('[WM] AudioEncoder runtime error (non-fatal):', e);
      },
    });
    enc.configure(audioConfig);
  } catch (err) {
    console.warn('[WM] Failed to configure AudioEncoder on this device (proceeding without audio):', err);
    return;
  }

  const { length, sampleRate } = ab;
  const fsz = CFG.AUDIO_FRAME_SIZE;

  try {
    for (let off = 0; off < length; off += fsz) {
      const sz   = Math.min(fsz, length - off);
      const data = new Float32Array(sz * ch);
      for (let c = 0; c < ch; c++) {
        const src = ab.getChannelData(c);
        for (let k = 0; k < sz; k++) data[c * sz + k] = src[off + k];
      }
      const af = new AudioData({
        format: 'f32-planar', sampleRate,
        numberOfFrames: sz, numberOfChannels: ch,
        timestamp: (off * 1_000_000) / sampleRate, data,
      });
      enc.encode(af);
      af.close();
    }
    await enc.flush();
    enc.close();
  } catch (err) {
    console.warn('[WM] Error during audio encoding loop (proceeding with clean video):', err);
    try { if (enc.state !== 'closed') enc.close(); } catch { /* ignore */ }
  }
}

// ─── Finalise ─────────────────────────────────────────────────────────────────

export function finalizeMuxer(muxer: Muxer<ArrayBufferTarget>): ArrayBuffer {
  muxer.finalize();
  return (muxer.target as ArrayBufferTarget).buffer;
}
