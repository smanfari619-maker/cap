/**
 * encoder.ts — Video muxer + encoder factory helpers.
 *
 * Keeps mp4-muxer and WebCodecs encoder setup away from pipeline logic.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { CFG } from './config';

// ─── Video muxer ─────────────────────────────────────────────────────────────

export function makeVideoMuxer(
  vw   : number,
  vh   : number,
  audio: AudioBuffer | null
): Muxer<ArrayBufferTarget> {
  return new Muxer({
    target: new ArrayBufferTarget(),
    video : { codec: 'avc', width: vw, height: vh },
    audio : audio
      ? { codec: 'aac', numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate }
      : undefined,
    fastStart            : 'in-memory',
    firstTimestampBehavior: 'offset',
  });
}

// ─── Video encoder ────────────────────────────────────────────────────────────

export function makeVideoEncoder(
  muxer: Muxer<ArrayBufferTarget>,
  vw   : number,
  vh   : number,
  fps  = 30
): VideoEncoder {
  // High profile for >1080p, otherwise Main profile
  const codec = (vw > 1920 || vh > 1080) ? 'avc1.640033' : 'avc1.64002a';
  const enc   = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error : (e) => { throw e; },
  });
  enc.configure({
    codec,
    width : vw, height: vh,
    bitrate           : CFG.ENCODER_BITRATE_BPS,
    framerate         : fps,
    bitrateMode       : 'variable',
    hardwareAcceleration: 'prefer-hardware',
  });
  return enc;
}

// ─── Audio encoder ────────────────────────────────────────────────────────────

/** Encode an AudioBuffer and add it to the muxer. */
export async function muxAudio(
  muxer: Muxer<ArrayBufferTarget>,
  ab   : AudioBuffer
): Promise<void> {
  const enc = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error : (e) => { throw e; },
  });
  enc.configure({
    codec             : 'mp4a.40.2',
    numberOfChannels  : ab.numberOfChannels,
    sampleRate        : ab.sampleRate,
    bitrate           : CFG.AUDIO_BITRATE_BPS,
  });

  const { numberOfChannels: ch, length, sampleRate } = ab;
  const fsz = CFG.AUDIO_FRAME_SIZE;

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
}

// ─── Finalise ─────────────────────────────────────────────────────────────────

export function finalizeMuxer(muxer: Muxer<ArrayBufferTarget>): ArrayBuffer {
  muxer.finalize();
  return (muxer.target as ArrayBufferTarget).buffer;
}
