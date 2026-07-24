import { createFile, DataStream, Endianness } from 'mp4box';

// ─── WASM Scene Diff Module ───────────────────────────────────────────────────
// Loaded once per worker lifetime. Falls back to JS if unavailable.

interface SceneDiffWasm {
  diff_frames(a: Uint8Array, b: Uint8Array): number;
}

let sceneDiffWasm: SceneDiffWasm | null = null;

async function loadSceneDiffWasm(): Promise<SceneDiffWasm | null> {
  try {
    // Dynamic import of the wasm-pack generated JS glue
    // @ts-ignore — /wasm/ paths are Vite static assets, not TS modules
    const mod = await import(/* @vite-ignore */ '/wasm/scene_diff/scene_diff.js') as any;
    if (typeof mod.default === 'function') {
      await mod.default(); // initialise the WASM module
    }
    console.debug('[SceneDetect Worker] scene_diff.wasm loaded ✓');
    return mod as SceneDiffWasm;
  } catch (err) {
    console.warn('[SceneDetect Worker] scene_diff.wasm unavailable, using JS fallback:', err);
    return null;
  }
}

/**
 * Compute mean absolute pixel difference between two RGBA frame buffers.
 * Uses WASM fast path when available, JS fallback otherwise.
 */
function diffFrames(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  wasm: SceneDiffWasm | null
): number {
  if (wasm) {
    // wasm-bindgen expects Uint8Array — create a zero-copy view
    const aU8 = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    const bU8 = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    return wasm.diff_frames(aU8, bU8);
  }

  // Pure JS fallback (matches original algorithm exactly)
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

// ─── MP4 Demuxer ─────────────────────────────────────────────────────────────

function demuxMP4(arrayBuffer: ArrayBuffer): Promise<any> {
  return new Promise((resolve, reject) => {
    const mp4file = createFile();
    let videoTrack: any = null;
    const videoSamples: any[] = [];
    let resolved = false;

    function tryResolve() {
      if (resolved) return;
      if (!videoTrack || videoSamples.length === 0) return;
      // Only resolve once we have all expected samples (or close to it)
      if (videoSamples.length < videoTrack.nb_samples * 0.99) return;
      resolved = true;

      let description: Uint8Array | undefined;
      try {
        const track = mp4file.getTrackById(videoTrack.id);
        const entry = track.mdia.minf.stbl.stsd.entries[0] as any;
        const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C ||
          (entry.boxes && entry.boxes.find((b: any) =>
            b.type === 'avcC' || b.type === 'hvcC' || b.type === 'vpcC' || b.type === 'av1C'
          ));
        if (box) {
          const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
          box.write(stream);
          description = new Uint8Array(stream.buffer, 8);
        }
      } catch (err) {
        console.warn('Failed to extract codec description:', err);
      }
      resolve({
        codec: videoTrack.codec,
        width: videoTrack.video_width,
        height: videoTrack.video_height,
        timescale: videoTrack.timescale,
        description,
        samples: videoSamples
      });
    }

    mp4file.onError = (e) => reject(new Error(`mp4box demuxing error: ${e}`));
    
    mp4file.onReady = (info) => {
      videoTrack = info.tracks.find((t: any) => t.video);
      if (!videoTrack) {
        reject(new Error('No video track found.'));
        return;
      }
      mp4file.setExtractionOptions(videoTrack.id, null, { nbSamples: videoTrack.nb_samples });
      mp4file.start();
    };

    mp4file.onSamples = (trackId, _ref, samples) => {
      if (trackId === videoTrack?.id) {
        videoSamples.push(...samples);
        tryResolve();
      }
    };

    try {
      const buf = arrayBuffer as any;
      buf.fileStart = 0;
      mp4file.appendBuffer(buf);
      mp4file.flush();
    } catch (err) {
      reject(err);
      return;
    }

    // Fallback: resolve after 2s even if sample count check didn't trigger
    setTimeout(() => {
      if (!resolved) {
        if (videoTrack && videoSamples.length > 0) {
          resolved = true;
          resolve({
            codec: videoTrack.codec,
            width: videoTrack.video_width,
            height: videoTrack.video_height,
            timescale: videoTrack.timescale,
            description: undefined,
            samples: videoSamples
          });
        } else {
          reject(new Error('No video samples extracted within timeout.'));
        }
      }
    }, 2000);
  });
}

// ─── Worker Entry Point ───────────────────────────────────────────────────────

self.onmessage = async (e) => {
  const { arrayBuffer } = e.data;

  // Load WASM diff module in parallel with MP4 demuxing
  const [wasmMod, demuxed] = await Promise.all([
    loadSceneDiffWasm(),
    demuxMP4(arrayBuffer).catch((err) => {
      self.postMessage({ type: 'error', error: err.message || String(err) });
      return null;
    })
  ]);

  if (!demuxed) return;

  try {
    sceneDiffWasm = wasmMod;
    const { codec, width, height, timescale, description, samples } = demuxed;
    
    const cuts: number[] = [];
    let prevData: Uint8ClampedArray | null = null;
    
    const canvas = new OffscreenCanvas(60, 36);
    const ctx = canvas.getContext('2d')!;

    let lastSampleTimeUs = -1000000;
    const sampleIntervalUs = 500 * 1000; // 500ms

    const decoder = new VideoDecoder({
      output: (frame) => {
        const timestampUs = frame.timestamp;
        
        if (timestampUs - lastSampleTimeUs >= sampleIntervalUs) {
          lastSampleTimeUs = timestampUs;
          
          ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;

          if (prevData) {
            // ── WASM fast path ────────────────────────────────────────────
            const averageDiff = diffFrames(data, prevData, sceneDiffWasm);
            if (averageDiff > 28) {
              cuts.push(timestampUs / 1000);
            }
          }
          prevData = data;
        }
        frame.close();
      },
      error: (err) => {
        console.error("Decoder error inside Worker:", err);
      }
    });

    decoder.configure({
      codec,
      codedWidth: width,
      codedHeight: height,
      description
    });

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const chunk = new EncodedVideoChunk({
        type: sample.is_sync ? 'key' : 'delta',
        timestamp: (sample.cts * 1_000_000) / timescale,
        duration: (sample.duration * 1_000_000) / timescale,
        data: sample.data
      });

      decoder.decode(chunk);

      if (i % 20 === 0) {
        const progress = Math.round((i / samples.length) * 100);
        self.postMessage({ type: 'progress', pct: progress });
      }
    }

    await decoder.flush();
    decoder.close();

    self.postMessage({ type: 'done', cuts });
  } catch (err: any) {
    self.postMessage({ type: 'error', error: err.message || String(err) });
  }
};
