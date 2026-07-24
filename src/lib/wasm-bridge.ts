/**
 * wasm-bridge.ts
 *
 * Central lazy-loader for all three WASM modules.
 * Each module is loaded once on first use and cached for subsequent calls.
 *
 * Consumers call the typed async APIs below — they never touch WebAssembly directly.
 */

// ─── Type Definitions ────────────────────────────────────────────────────────

interface WaveformWasm {
  extract_peaks(samples: Float32Array, num_peaks: number): Float32Array;
  extract_peaks_max(samples: Float32Array, num_peaks: number): Float32Array;
}

interface SceneDiffWasm {
  diff_frames(a: Uint8Array, b: Uint8Array): number;
}

export interface TrackInputParams {
  samples: Float32Array;
  channels: number;
  start_sample: number;
  duration_samples: number;
  trim_start_sample: number;
  volume: number;
  fade_in_samples: number;
  fade_out_samples: number;
  speed: number;
}

interface AudioMixWasm {
  TrackInput: any;
  mix_tracks(tracks: any[], total_samples: number): Float32Array;
}

// ─── WASM Instance Cache ──────────────────────────────────────────────────────

let waveformWasm: WaveformWasm | null = null;
let sceneDiffWasm: SceneDiffWasm | null = null;
let audioMixWasm: AudioMixWasm | null = null;

/**
 * Dynamically import a wasm-pack generated JS module.
 * Works with Vite's `?url` static asset handling for .wasm files.
 */
async function loadWasmModule(jsPath: string): Promise<any> {
  // @ts-ignore — /wasm/ paths are Vite static assets served from public/, not TS modules
  const mod = await import(/* @vite-ignore */ jsPath);
  if (typeof mod.default === 'function') {
    await mod.default(); // wasm-pack init()
  }
  return mod;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const WasmBridge = {
  /**
   * Extract waveform amplitude peaks from raw PCM f32 samples.
   * Falls back to JS implementation if WASM is unavailable.
   *
   * @param samples - Float32Array of PCM audio (mono, values in [-1, 1])
   * @param numPeaks - Number of output peak buckets (e.g. 200)
   * @param useRms - true = RMS (smoother), false = max-abs (matches original JS)
   */
  async extractWaveformPeaks(
    samples: Float32Array,
    numPeaks: number,
    useRms = true
  ): Promise<Float32Array> {
    try {
      if (!waveformWasm) {
        const mod = await loadWasmModule('/wasm/waveform/waveform.js');
        waveformWasm = mod as WaveformWasm;
      }
      if (useRms) {
        return waveformWasm!.extract_peaks(samples, numPeaks);
      } else {
        return waveformWasm!.extract_peaks_max(samples, numPeaks);
      }
    } catch (err) {
      console.warn('[WasmBridge] waveform.wasm unavailable, falling back to JS:', err);
      return jsFallbackPeaks(samples, numPeaks);
    }
  },

  /**
   * Compute mean absolute pixel difference between two RGBA frames.
   * Returns a value in [0, 255] — values > 28 indicate a scene cut.
   *
   * @param a - first frame Uint8ClampedArray (RGBA)
   * @param b - second frame Uint8ClampedArray (RGBA)
   */
  async diffFrames(a: Uint8ClampedArray, b: Uint8ClampedArray): Promise<number> {
    try {
      if (!sceneDiffWasm) {
        const mod = await loadWasmModule('/wasm/scene_diff/scene_diff.js');
        sceneDiffWasm = mod as SceneDiffWasm;
      }
      // wasm-bindgen takes Uint8Array, not Uint8ClampedArray — view is free (same buffer)
      return sceneDiffWasm!.diff_frames(
        new Uint8Array(a.buffer, a.byteOffset, a.byteLength),
        new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
      );
    } catch (err) {
      console.warn('[WasmBridge] scene_diff.wasm unavailable, falling back to JS:', err);
      return jsFallbackDiff(a, b);
    }
  },

  /**
   * Mix multiple audio tracks into a stereo f32 output buffer.
   */
  async mixAudio(tracks: TrackInputParams[], totalSamples: number): Promise<Float32Array | null> {
    try {
      if (!audioMixWasm) {
        const mod = await loadWasmModule('/wasm/audio_mix/audio_mix.js');
        audioMixWasm = mod as AudioMixWasm;
      }
      
      const wasmTracks = tracks.map(t => 
        new audioMixWasm!.TrackInput(
          t.samples,
          t.channels,
          t.start_sample,
          t.duration_samples,
          t.trim_start_sample,
          t.volume,
          t.fade_in_samples,
          t.fade_out_samples,
          t.speed
        )
      );

      return audioMixWasm!.mix_tracks(wasmTracks, totalSamples);
    } catch (err) {
      console.warn('[WasmBridge] audio_mix.wasm unavailable:', err);
      return null; // Signals audio-mixer to fallback to OfflineAudioContext
    }
  },
};

// ─── JavaScript Fallbacks ─────────────────────────────────────────────────────
// These match the exact logic in the original files — used when WASM fails to load.

function jsFallbackPeaks(samples: Float32Array, numPeaks: number): Float32Array {
  const step = Math.ceil(samples.length / numPeaks);
  const peaks = new Float32Array(numPeaks);
  for (let i = 0; i < numPeaks; i++) {
    const start = i * step;
    const end = Math.min(start + step, samples.length);
    let max = 0;
    for (let j = start; j < end; j++) {
      const val = Math.abs(samples[j]);
      if (val > max) max = val;
    }
    peaks[i] = Math.min(1.0, max);
  }
  return peaks;
}

function jsFallbackDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let total = 0;
  let count = 0;
  for (let i = 0; i < a.length; i += 4) {
    const rDiff = Math.abs(a[i] - b[i]);
    const gDiff = Math.abs(a[i + 1] - b[i + 1]);
    const bDiff = Math.abs(a[i + 2] - b[i + 2]);
    total += (rDiff + gDiff + bDiff) / 3;
    count++;
  }
  return count > 0 ? total / count : 0;
}
