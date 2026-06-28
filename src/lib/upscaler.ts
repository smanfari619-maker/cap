/**
 * Real-ESRGAN AI Upscaler
 * ========================
 * Uses onnxruntime-web with WebGPU (primary) or WASM (fallback) to run
 * the Real-ESRGAN x4plus model frame-by-frame during export.
 *
 * Model: RealESRGAN_x4plus_fp16.onnx (fp16 quantized)
 * Fetched from HuggingFace CDN on first use, then cached in IndexedDB.
 *
 * Tiling strategy:
 *   - Split each frame into 128×128 tiles with 16px overlap
 *   - Run each tile through the model → 512×512 output
 *   - Blend overlap seams with linear feathering
 *   - Stitch into final 4× upscaled image
 *   - Downscale to target resolution using high-quality canvas
 */

import * as ort from 'onnxruntime-web';

// ─── Config ───────────────────────────────────────────────────────────────────
const ONNX_MODEL_URL =
  'https://huggingface.co/OwlMaster/AllFilesRope/resolve/main/RealESRGAN_x4plus.fp16.onnx';

const TILE_SIZE = 128;
const TILE_PAD  = 16;
const SCALE     = 4;
const IDB_DB    = 'realesrgan-model-cache';
const IDB_STORE = 'models';
const IDB_KEY   = 'RealESRGAN_x4plus_fp16';

// ─── Singleton state ──────────────────────────────────────────────────────────
let _session: ort.InferenceSession | null = null;
let _sessionPromise: Promise<ort.InferenceSession> | null = null;
let _provider: 'webgpu' | 'wasm' = 'wasm';

// ─── IndexedDB cache ──────────────────────────────────────────────────────────
function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadFromIDB(): Promise<ArrayBuffer | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const get = tx.objectStore(IDB_STORE).get(IDB_KEY);
      get.onsuccess = () => resolve(get.result ?? null);
      get.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function saveToIDB(buffer: ArrayBuffer): Promise<void> {
  try {
    const db = await openIDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(buffer, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* non-fatal */ }
}

// ─── Model download ───────────────────────────────────────────────────────────
async function fetchModel(onProgress?: (p: number) => void): Promise<ArrayBuffer> {
  const cached = await loadFromIDB();
  if (cached) { onProgress?.(100); return cached; }

  const response = await fetch(ONNX_MODEL_URL);
  if (!response.ok) throw new Error(`Failed to fetch model: ${response.status}`);

  const contentLength = parseInt(response.headers.get('content-length') ?? '0');
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (contentLength > 0) onProgress?.(Math.round((received / contentLength) * 90));
  }

  const total = chunks.reduce((s, c) => s + c.length, 0);
  const buffer = new ArrayBuffer(total);
  const view = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) { view.set(chunk, offset); offset += chunk.length; }

  await saveToIDB(buffer);
  onProgress?.(100);
  return buffer;
}

// ─── Public: init ─────────────────────────────────────────────────────────────
export async function initUpscaler(
  onProgress?: (stage: string, percent: number) => void
): Promise<{ provider: 'webgpu' | 'wasm' }> {
  if (_session) return { provider: _provider };
  if (_sessionPromise) { await _sessionPromise; return { provider: _provider }; }

  _sessionPromise = (async () => {
    onProgress?.('Downloading AI model…', 0);
    const modelBuffer = await fetchModel((p) => onProgress?.('Downloading AI model…', p));

    onProgress?.('Loading model on GPU…', 0);
    try {
      const session = await ort.InferenceSession.create(modelBuffer, {
        executionProviders: ['webgpu'],
        graphOptimizationLevel: 'all',
      });
      _session = session;
      _provider = 'webgpu';
      console.log('[Upscaler] WebGPU backend active');
    } catch {
      console.warn('[Upscaler] WebGPU unavailable, falling back to WASM');
      // Use CDN path for WASM files so they load correctly in production
      ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';
      const session = await ort.InferenceSession.create(modelBuffer, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      _session = session;
      _provider = 'wasm';
      console.log('[Upscaler] WASM backend active');
    }
    onProgress?.('Model ready', 100);
    return _session!;
  })();

  await _sessionPromise;
  return { provider: _provider };
}

// ─── Tensor helpers ───────────────────────────────────────────────────────────
function imageDataToTensor(imageData: ImageData): ort.Tensor {
  const { data, width, height } = imageData;
  const f32 = new Float32Array(3 * height * width);
  const area = height * width;
  for (let i = 0; i < area; i++) {
    f32[i]          = data[i * 4]     / 255;
    f32[area + i]   = data[i * 4 + 1] / 255;
    f32[2 * area + i] = data[i * 4 + 2] / 255;
  }
  return new ort.Tensor('float32', f32, [1, 3, height, width]);
}

// ─── Tiled upscale ────────────────────────────────────────────────────────────
async function upscaleTiled(
  srcCtx: CanvasRenderingContext2D,
  srcW: number,
  srcH: number
): Promise<ImageData> {
  const session = _session!;
  const outW = srcW * SCALE;
  const outH = srcH * SCALE;

  const outData    = new Float32Array(outW * outH * 4).fill(0);
  const weightData = new Float32Array(outW * outH).fill(0);

  for (let ty = 0; ty < srcH; ty += TILE_SIZE) {
    for (let tx = 0; tx < srcW; tx += TILE_SIZE) {
      const x0 = Math.max(0, tx - TILE_PAD);
      const y0 = Math.max(0, ty - TILE_PAD);
      const x1 = Math.min(srcW, tx + TILE_SIZE + TILE_PAD);
      const y1 = Math.min(srcH, ty + TILE_SIZE + TILE_PAD);
      const tw = x1 - x0;
      const th = y1 - y0;

      const tileData    = srcCtx.getImageData(x0, y0, tw, th);
      const inputTensor = imageDataToTensor(tileData);
      const results     = await session.run({ [session.inputNames[0]]: inputTensor });
      const outTensor   = results[session.outputNames[0]];
      const outTileData = outTensor.data as Float32Array;

      const outTileW = tw * SCALE;
      const outTileH = th * SCALE;
      const outArea  = outTileW * outTileH;

      const ox0 = x0 * SCALE;
      const oy0 = y0 * SCALE;

      const padL  = (tx - x0) * SCALE;
      const padT  = (ty - y0) * SCALE;
      const validW = Math.min(TILE_SIZE, srcW - tx) * SCALE;
      const validH = Math.min(TILE_SIZE, srcH - ty) * SCALE;
      const pad   = TILE_PAD * SCALE;

      for (let row = padT; row < padT + validH; row++) {
        const wy = row < padT + pad
          ? (row - padT + 1) / pad
          : row > padT + validH - pad
            ? (padT + validH - row) / pad
            : 1;

        for (let col = padL; col < padL + validW; col++) {
          const wx = col < padL + pad
            ? (col - padL + 1) / pad
            : col > padL + validW - pad
              ? (padL + validW - col) / pad
              : 1;

          const w = Math.max(0.001, wx * wy);
          const tileIdx  = row * outTileW + col;
          const gRow     = oy0 + row;
          const gCol     = ox0 + col;
          if (gRow >= outH || gCol >= outW) continue;
          const gIdx = gRow * outW + gCol;

          outData[gIdx * 4]     += w * outTileData[tileIdx]              * 255;
          outData[gIdx * 4 + 1] += w * outTileData[outArea + tileIdx]    * 255;
          outData[gIdx * 4 + 2] += w * outTileData[2 * outArea + tileIdx] * 255;
          outData[gIdx * 4 + 3] += 255;
          weightData[gIdx]      += w;
        }
      }
    }
  }

  const pixels = new Uint8ClampedArray(outW * outH * 4);
  for (let i = 0; i < outW * outH; i++) {
    const w = weightData[i] || 1;
    pixels[i * 4]     = Math.round(Math.min(255, outData[i * 4]     / w));
    pixels[i * 4 + 1] = Math.round(Math.min(255, outData[i * 4 + 1] / w));
    pixels[i * 4 + 2] = Math.round(Math.min(255, outData[i * 4 + 2] / w));
    pixels[i * 4 + 3] = 255;
  }
  return new ImageData(pixels, outW, outH);
}

// ─── Public: upscale frame ────────────────────────────────────────────────────
/**
 * Upscale a composited canvas frame using Real-ESRGAN x4.
 * Returns a new canvas at targetWidth × targetHeight.
 */
export async function upscaleFrame(
  sourceCanvas: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number
): Promise<HTMLCanvasElement> {
  if (!_session) throw new Error('Upscaler not initialized. Call initUpscaler() first.');

  const srcCtx = sourceCanvas.getContext('2d');
  if (!srcCtx) throw new Error('Cannot read source canvas context');

  const upscaledImageData = await upscaleTiled(srcCtx, sourceCanvas.width, sourceCanvas.height);

  const interCanvas = document.createElement('canvas');
  interCanvas.width  = sourceCanvas.width  * SCALE;
  interCanvas.height = sourceCanvas.height * SCALE;
  const interCtx = interCanvas.getContext('2d')!;
  interCtx.putImageData(upscaledImageData, 0, 0);

  // High-quality downscale to target resolution
  const outCanvas = document.createElement('canvas');
  outCanvas.width  = targetWidth;
  outCanvas.height = targetHeight;
  const outCtx = outCanvas.getContext('2d')!;
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  outCtx.drawImage(interCanvas, 0, 0, targetWidth, targetHeight);

  return outCanvas;
}

export function isUpscalerReady(): boolean { return _session !== null; }
export function getUpscalerProvider(): 'webgpu' | 'wasm' | null {
  return _session ? _provider : null;
}
