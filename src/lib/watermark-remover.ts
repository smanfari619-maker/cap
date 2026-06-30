/**
 * watermark-remover.ts
 *
 * Browser-native video watermark remover using:
 *  - mp4box for lightning-fast container demuxing.
 *  - WebCodecs VideoDecoder for hardware-accelerated frame decoding.
 *  - WebCodecs VideoEncoder for high-performance sequential frame encoding.
 *  - Web Audio API (decodeAudioData) for native audio decoding.
 *  - mp4-muxer for lightning-fast H.264 muxing.
 *  - Dynamic Reverse Alpha Blending for pixel-perfect reconstruction of Gemini watermarks
 *    without silhouette or misalignment artifacts.
 *  - Fallback seek-based pipeline for formats/containers unsupported by the demuxer.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { createFile, DataStream, Endianness } from 'mp4box';
import { db, type Asset } from './db';
import { saveFileToOPFS, getFileFromOPFS } from './opfs';

export interface WatermarkRegionPx {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RemovalStatus =
  | { stage: 'idle' }
  | { stage: 'loading' }
  | { stage: 'processing'; progress: number }
  | { stage: 'done'; newAssetId: string }
  | { stage: 'error'; message: string };

import { createWatermarkEngine } from '@pilio/gemini-watermark-remover';

// ─── Fast Reverse Alpha Blending Math ──────────────────────────────────────
function fastRemoveWatermark(
  imageData: ImageData, 
  alphaMap: Float32Array, 
  position: {x: number, y: number, width: number, height: number},
  alphaGain: number = 1
) {
  const { x, y, width, height } = position;
  for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
          const imgIdx = ((y + row) * imageData.width + (x + col)) * 4;
          const alphaIdx = row * width + col;
          const rawAlpha = alphaMap[alphaIdx];
          const alphaMagnitude = Math.abs(rawAlpha);
          const logoValue = rawAlpha < 0 ? 0 : 255;
          const signalAlpha = Math.max(0, alphaMagnitude - 3/255) * alphaGain;
          if (signalAlpha < 0.002) continue;
          
          const alpha = Math.min(alphaMagnitude * alphaGain, 0.99);
          const oneMinusAlpha = 1.0 - alpha;
          for (let c = 0; c < 3; c++) {
              const watermarked = imageData.data[imgIdx + c];
              const original = (watermarked - alpha * logoValue) / oneMinusAlpha;
              imageData.data[imgIdx + c] = Math.max(0, Math.min(255, Math.round(original)));
          }
      }
  }
}
function negateAlphaMap(alphaMap: Float32Array): Float32Array {
  const negative = new Float32Array(alphaMap.length);
  for (let i = 0; i < alphaMap.length; i++) {
    negative[i] = -alphaMap[i];
  }
  return negative;
}

function resizeAlphaMap(alphaMap: Float32Array, srcSize: number, dstSize: number): Float32Array {
  if (srcSize === dstSize) return alphaMap;
  
  const dst = new Float32Array(dstSize * dstSize);
  for (let dy = 0; dy < dstSize; dy++) {
    for (let dx = 0; dx < dstSize; dx++) {
      // Map to source coordinates
      const sx = (dx / dstSize) * srcSize;
      const sy = (dy / dstSize) * srcSize;
      
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(srcSize - 1, x0 + 1);
      const y1 = Math.min(srcSize - 1, y0 + 1);
      
      const tx = sx - x0;
      const ty = sy - y0;
      
      const val00 = alphaMap[y0 * srcSize + x0];
      const val10 = alphaMap[y0 * srcSize + x1];
      const val01 = alphaMap[y1 * srcSize + x0];
      const val11 = alphaMap[y1 * srcSize + x1];
      
      const val = (1 - tx) * (1 - ty) * val00 +
                  tx * (1 - ty) * val10 +
                  (1 - tx) * ty * val01 +
                  tx * ty * val11;
                  
      dst[dy * dstSize + dx] = val;
    }
  }
  return dst;
}

interface NCCResult {
  x: number;
  y: number;
  correlation: number;
}

function findWatermarkPositionNCC(
  imageData: ImageData,
  alphaMap: Float32Array,
  region: WatermarkRegionPx,
  size: number
): NCCResult {
  const { data, width, height } = imageData;
  
  // Calculate expected top-left based on centering the template in the region
  const centerX = region.x + region.w / 2;
  const centerY = region.y + region.h / 2;
  const expectedX = centerX - size / 2;
  const expectedY = centerY - size / 2;
  
  // Search window around the expected top-left corner
  const searchRadius = 64; // Huge tolerance of 64px!
  const startX = Math.max(0, Math.round(expectedX) - searchRadius);
  const endX = Math.min(width - size, Math.round(expectedX) + searchRadius);
  const startY = Math.max(0, Math.round(expectedY) - searchRadius);
  const endY = Math.min(height - size, Math.round(expectedY) + searchRadius);
  
  let bestX = Math.round(expectedX);
  let bestY = Math.round(expectedY);
  let bestCorrelation = -1;
  
  // Pre-calculate stats of alphaMap
  let alphaSum = 0;
  for (let i = 0; i < alphaMap.length; i++) {
    alphaSum += alphaMap[i];
  }
  const alphaMean = alphaSum / alphaMap.length;
  
  let alphaVarSum = 0;
  for (let i = 0; i < alphaMap.length; i++) {
    const diff = alphaMap[i] - alphaMean;
    alphaVarSum += diff * diff;
  }
  const alphaStd = Math.sqrt(alphaVarSum / alphaMap.length);
  
  if (alphaStd < 1e-6) {
    return { x: bestX, y: bestY, correlation: -1 };
  }
  
  const patchLuma = new Float32Array(size * size);
  
  const computeCorrelationAt = (sx: number, sy: number): number => {
    let patchSum = 0;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const idx = ((sy + row) * width + (sx + col)) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        patchLuma[row * size + col] = luma;
        patchSum += luma;
      }
    }
    const patchMean = patchSum / patchLuma.length;
    
    let patchVarSum = 0;
    for (let i = 0; i < patchLuma.length; i++) {
      const diff = patchLuma[i] - patchMean;
      patchVarSum += diff * diff;
    }
    const patchStd = Math.sqrt(patchVarSum / patchLuma.length);
    if (patchStd < 1e-6) return -1;
    
    let covariance = 0;
    for (let i = 0; i < patchLuma.length; i++) {
      covariance += (patchLuma[i] - patchMean) * (alphaMap[i] - alphaMean);
    }
    return covariance / (patchLuma.length * patchStd * alphaStd);
  };
  
  // Phase 1: Coarse search (step = 4)
  const coarseStep = 4;
  let coarseBestX = bestX;
  let coarseBestY = bestY;
  let coarseBestCorr = -1;
  
  for (let sy = startY; sy <= endY; sy += coarseStep) {
    for (let sx = startX; sx <= endX; sx += coarseStep) {
      const corr = Math.abs(computeCorrelationAt(sx, sy));
      if (corr > coarseBestCorr) {
        coarseBestCorr = corr;
        coarseBestX = sx;
        coarseBestY = sy;
      }
    }
  }
  
  // Phase 2: Fine search (step = 1) around the coarse best
  const fineRadius = 4;
  const fineStartX = Math.max(startX, coarseBestX - fineRadius);
  const fineEndX = Math.min(endX, coarseBestX + fineRadius);
  const fineStartY = Math.max(startY, coarseBestY - fineRadius);
  const fineEndY = Math.min(endY, coarseBestY + fineRadius);
  
  for (let sy = fineStartY; sy <= fineEndY; sy++) {
    for (let sx = fineStartX; sx <= fineEndX; sx++) {
      const corrVal = computeCorrelationAt(sx, sy);
      const corr = Math.abs(corrVal);
      if (corr > bestCorrelation) {
        bestCorrelation = corr;
        bestX = sx;
        bestY = sy;
      }
    }
  }
  
  const finalCorr = computeCorrelationAt(bestX, bestY);
  return { x: bestX, y: bestY, correlation: finalCorr };
}

async function detectWatermarkLocally(
  imageData: ImageData,
  engine: any,
  region: WatermarkRegionPx
) {
  // Determine the target size from the user's manual bounding box
  const targetSize = Math.max(24, Math.min(160, Math.round((region.w + region.h) / 2)));
  
  // Load the high-res 96x96 template as the source
  const alpha96 = await engine.getAlphaMap(96);
  
  // Resize the template to match the user's drawn box size
  const resizedAlpha = resizeAlphaMap(alpha96, 96, targetSize);
  
  // Run NCC search with the resized template
  const res = findWatermarkPositionNCC(imageData, resizedAlpha, region, targetSize);
  
  const threshold = 0.15; // Safe threshold for scaled template
  
  if (Math.abs(res.correlation) >= threshold) {
    return {
      position: { x: res.x, y: res.y, width: targetSize, height: targetSize },
      size: targetSize,
      alphaMap: resizedAlpha,
      correlation: res.correlation
    };
  }
  
  return null;
}

async function detectWatermarkAutomatically(
  imageData: ImageData,
  engine: any
) {
  const { width, height } = imageData;
  
  // Search the bottom half of the video where Gemini/Veo watermarks are always placed
  const startX = 0;
  const startY = Math.round(height / 2);
  
  const alpha48 = await engine.getAlphaMap(48);
  const alpha96 = await engine.getAlphaMap(96);
  
  const searchGrid = (alphaMap: Float32Array, size: number) => {
    let bestX = 0;
    let bestY = 0;
    let bestCorrelation = -1;
    
    let alphaSum = 0;
    for (let i = 0; i < alphaMap.length; i++) alphaSum += alphaMap[i];
    const alphaMean = alphaSum / alphaMap.length;
    let alphaVarSum = 0;
    for (let i = 0; i < alphaMap.length; i++) {
      const diff = alphaMap[i] - alphaMean;
      alphaVarSum += diff * diff;
    }
    const alphaStd = Math.sqrt(alphaVarSum / alphaMap.length);
    if (alphaStd < 1e-6) return { x: 0, y: 0, correlation: -1 };
    
    const patchLuma = new Float32Array(size * size);
    
    const computeCorrelationAt = (sx: number, sy: number): number => {
      let patchSum = 0;
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          const idx = ((sy + row) * width + (sx + col)) * 4;
          const r = imageData.data[idx];
          const g = imageData.data[idx + 1];
          const b = imageData.data[idx + 2];
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          patchLuma[row * size + col] = luma;
          patchSum += luma;
        }
      }
      const patchMean = patchSum / patchLuma.length;
      
      let patchVarSum = 0;
      for (let i = 0; i < patchLuma.length; i++) {
        const diff = patchLuma[i] - patchMean;
        patchVarSum += diff * diff;
      }
      const patchStd = Math.sqrt(patchVarSum / patchLuma.length);
      if (patchStd < 1e-6) return -1;
      
      let covariance = 0;
      for (let i = 0; i < patchLuma.length; i++) {
        covariance += (patchLuma[i] - patchMean) * (alphaMap[i] - alphaMean);
      }
      return covariance / (patchLuma.length * patchStd * alphaStd);
    };
    
    // Coarse search: step by 16 pixels for blazing fast scans
    const coarseStep = 16;
    let coarseBestX = 0;
    let coarseBestY = 0;
    let coarseBestCorr = -1;
    
    const limitX = width - size;
    const limitY = height - size;
    
    for (let sy = startY; sy <= limitY; sy += coarseStep) {
      for (let sx = startX; sx <= limitX; sx += coarseStep) {
        const corr = Math.abs(computeCorrelationAt(sx, sy));
        if (corr > coarseBestCorr) {
          coarseBestCorr = corr;
          coarseBestX = sx;
          coarseBestY = sy;
        }
      }
    }
    
    // Medium search: step by 4 around the coarse best
    const medRadius = 16;
    const medStartX = Math.max(0, coarseBestX - medRadius);
    const medEndX = Math.min(limitX, coarseBestX + medRadius);
    const medStartY = Math.max(startY, coarseBestY - medRadius);
    const medEndY = Math.min(limitY, coarseBestY + medRadius);
    
    let medBestX = coarseBestX;
    let medBestY = coarseBestY;
    let medBestCorr = -1;
    for (let sy = medStartY; sy <= medEndY; sy += 4) {
      for (let sx = medStartX; sx <= medEndX; sx += 4) {
        const corr = Math.abs(computeCorrelationAt(sx, sy));
        if (corr > medBestCorr) {
          medBestCorr = corr;
          medBestX = sx;
          medBestY = sy;
        }
      }
    }
    
    // Fine search: step by 1 around the medium best
    const fineRadius = 4;
    const fineStartX = Math.max(0, medBestX - fineRadius);
    const fineEndX = Math.min(limitX, medBestX + fineRadius);
    const fineStartY = Math.max(startY, medBestY - fineRadius);
    const fineEndY = Math.min(limitY, medBestY + fineRadius);
    
    for (let sy = fineStartY; sy <= fineEndY; sy++) {
      for (let sx = fineStartX; sx <= fineEndX; sx++) {
        const corrVal = computeCorrelationAt(sx, sy);
        const corr = Math.abs(corrVal);
        if (corr > bestCorrelation) {
          bestCorrelation = corr;
          bestX = sx;
          bestY = sy;
        }
      }
    }
    
    const finalCorr = computeCorrelationAt(bestX, bestY);
    return { x: bestX, y: bestY, correlation: finalCorr };
  };
  
  const res48 = searchGrid(alpha48, 48);
  const res96 = searchGrid(alpha96, 96);
  
  const absCorr48 = Math.abs(res48.correlation);
  const absCorr96 = Math.abs(res96.correlation);
  
  const threshold = 0.22; // High confidence for automatic detection
  
  if (absCorr48 > absCorr96 && absCorr48 >= threshold) {
    return {
      position: { x: res48.x, y: res48.y, width: 48, height: 48 },
      size: 48,
      alphaMap: alpha48,
      correlation: res48.correlation
    };
  } else if (absCorr96 >= threshold) {
    return {
      position: { x: res96.x, y: res96.y, width: 96, height: 96 },
      size: 96,
      alphaMap: alpha96,
      correlation: res96.correlation
    };
  }
  
  return null;
}

// ─── MP4 Demuxer Helper ──────────────────────────────────────────────────────
interface DemuxedVideo {
  codec: string;
  width: number;
  height: number;
  description?: Uint8Array;
  samples: any[];
}

function demuxMP4(arrayBuffer: ArrayBuffer): Promise<DemuxedVideo> {
  return new Promise((resolve, reject) => {
    const mp4file = createFile();
    let videoTrack: any = null;
    const videoSamples: any[] = [];

    mp4file.onError = (e) => {
      reject(new Error(`mp4box demuxing error: ${e}`));
    };

    mp4file.onReady = (info) => {
      videoTrack = info.tracks.find((t: any) => t.video);
      if (!videoTrack) {
        reject(new Error('No video track found in the source MP4 file.'));
        return;
      }
      mp4file.setExtractionOptions(videoTrack.id, null, { nbSamples: videoTrack.nb_samples });
      mp4file.start();
    };

    mp4file.onSamples = (trackId, _ref, samples) => {
      if (trackId === videoTrack.id) {
        videoSamples.push(...samples);
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

    setTimeout(() => {
      if (videoTrack && videoSamples.length > 0) {
        let description: Uint8Array | undefined;
        try {
          const track = mp4file.getTrackById(videoTrack.id);
          const entry = track.mdia.minf.stbl.stsd.entries[0] as any;
          const box =
            entry.avcC ||
            entry.hvcC ||
            entry.vpcC ||
            entry.av1C ||
            (entry.boxes &&
              entry.boxes.find(
                (b: any) =>
                  b.type === 'avcC' ||
                  b.type === 'hvcC' ||
                  b.type === 'vpcC' ||
                  b.type === 'av1C'
              ));

          if (box) {
            const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
            box.write(stream);
            description = new Uint8Array(stream.buffer, 8);
          }
        } catch (err) {
          console.warn('[Watermark Remover] Failed to extract codec description record:', err);
        }

        resolve({
          codec: videoTrack.codec,
          width: videoTrack.video_width,
          height: videoTrack.video_height,
          description,
          samples: videoSamples
        });
      } else {
        reject(new Error('No video samples extracted from the source container.'));
      }
    }, 50);
  });
}

// ─── High Performance WebCodecs VideoDecoder Loop ────────────────────────────
async function removeWatermarkWebCodecs(
  sourceFile: File,
  region: WatermarkRegionPx | null,
  audioBuffer: AudioBuffer | null,
  videoWidth: number,
  videoHeight: number,
  onProgress?: (progress: number) => void
): Promise<ArrayBuffer> {
  const arrayBuffer = await sourceFile.arrayBuffer();
  const demuxed = await demuxMP4(arrayBuffer);

  const canvas = document.createElement('canvas');
  canvas.width = videoWidth;
  canvas.height = videoHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  const engine = await createWatermarkEngine();

  let watermarkInfo: any = null;
  let alphaMap: Float32Array | null = null;

  // Setup muxer
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width: videoWidth,
      height: videoHeight
    },
    audio: audioBuffer ? {
      codec: 'aac',
      numberOfChannels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate
    } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset'
  });

  let encodeError: Error | null = null;

  // Initialize encoder
  const videoEncoder = new VideoEncoder({
    output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
    error: (e) => {
      console.error('Video Encoder Error:', e);
      encodeError = e;
    }
  });

  const encoderCodec = (videoWidth > 1920 || videoHeight > 1080) ? 'avc1.640033' : 'avc1.64002a';
  videoEncoder.configure({
    codec: encoderCodec,
    width: videoWidth,
    height: videoHeight,
    bitrate: 8_000_000,
    framerate: 30,
    bitrateMode: 'variable',
    hardwareAcceleration: 'prefer-hardware'
  });

  // Setup memory-safe streaming queue for decoder
  const queueLimit = 15;
  const frameQueue: VideoFrame[] = [];
  let frameResolver: (() => void) | null = null;
  let decodeError: Error | null = null;

  const videoDecoder = new VideoDecoder({
    output: (frame) => {
      frameQueue.push(frame);
      if (frameResolver) {
        frameResolver();
        frameResolver = null;
      }
    },
    error: (e) => {
      console.error('Video Decoder Error:', e);
      decodeError = e;
    }
  });

  videoDecoder.configure({
    codec: demuxed.codec,
    codedWidth: demuxed.width,
    codedHeight: demuxed.height,
    description: demuxed.description
  });

  let fedSampleIndex = 0;

  try {
    for (let i = 0; i < demuxed.samples.length; i++) {
      if (encodeError) throw encodeError;
      if (decodeError) throw decodeError;

      // Feed chunks ahead to keep the decoding engine saturated
      while (fedSampleIndex < demuxed.samples.length && frameQueue.length < queueLimit) {
        const sample = demuxed.samples[fedSampleIndex++];
        const chunk = new EncodedVideoChunk({
          type: sample.is_sync ? 'key' : 'delta',
          timestamp: (sample.cts * 1_000_000) / sample.timescale,
          duration: (sample.duration * 1_000_000) / sample.timescale,
          data: sample.data
        });
        videoDecoder.decode(chunk);
      }

      // If frame queue is empty, wait for decoder output
      if (frameQueue.length === 0) {
        if (fedSampleIndex >= demuxed.samples.length) {
          await videoDecoder.flush();
        }
        if (frameQueue.length === 0 && fedSampleIndex < demuxed.samples.length) {
          await new Promise<void>((resolve, reject) => {
            frameResolver = resolve;
            setTimeout(() => reject(new Error('Video decode timeout')), 5000);
          });
        }
      }

      if (frameQueue.length === 0) {
        if (decodeError) throw decodeError;
        break; // completed or empty
      }

      const frame = frameQueue.shift()!;

      // Draw, apply dynamic blending, and write
      ctx.drawImage(frame, 0, 0, videoWidth, videoHeight);
      let imageData = ctx.getImageData(0, 0, videoWidth, videoHeight);
      
      if (!watermarkInfo) {
        // Run NCC detection (local if region is provided, automatic full-scan fallback otherwise)
        const detection = region
          ? await detectWatermarkLocally(imageData, engine, region)
          : await detectWatermarkAutomatically(imageData, engine);
        if (detection) {
          let alphaMapToUse = detection.alphaMap;
          if (detection.correlation < -0.05) {
            alphaMapToUse = negateAlphaMap(alphaMapToUse);
          }
          watermarkInfo = { 
            position: detection.position, 
            size: detection.size, 
            alphaGain: 1.0 // default gain
          };
          alphaMap = alphaMapToUse;
          
          // Apply fast path to frame 1 immediately
          fastRemoveWatermark(imageData, alphaMapToUse, watermarkInfo.position, watermarkInfo.alphaGain);
        }
      } else if (alphaMap && watermarkInfo) {
        // Fast path: mathematically subtract the watermark at the cached exact position
        fastRemoveWatermark(imageData, alphaMap as Float32Array, watermarkInfo.position, watermarkInfo.alphaGain);
      }
      
      ctx.putImageData(imageData, 0, 0);

      const timestamp = frame.timestamp;
      const outputFrame = new VideoFrame(canvas, { timestamp });
      try {
        videoEncoder.encode(outputFrame);
      } finally {
        outputFrame.close();
      }

      frame.close();

      onProgress?.(0.1 + (i / demuxed.samples.length) * 0.7);

      // Keep the main thread responsive
      if (i % 25 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    await videoEncoder.flush();
    videoEncoder.close();
    videoDecoder.close();

    // Encode audio if exists
    if (audioBuffer) {
      onProgress?.(0.85);
      const audioEncoder = new AudioEncoder({
        output: (chunk, metadata) => muxer.addAudioChunk(chunk, metadata),
        error: (e) => {
          console.error('Audio Encoder Error:', e);
          encodeError = e;
        }
      });
      audioEncoder.configure({
        codec: 'mp4a.40.2',
        numberOfChannels: audioBuffer.numberOfChannels,
        sampleRate: audioBuffer.sampleRate,
        bitrate: 128_000
      });

      const { numberOfChannels: channels, length, sampleRate } = audioBuffer;
      const frameSize = 1024;

      for (let offset = 0; offset < length; offset += frameSize) {
        if (encodeError) throw encodeError;
        const size = Math.min(frameSize, length - offset);
        const data = new Float32Array(size * channels);

        for (let ch = 0; ch < channels; ch++) {
          const chData = audioBuffer.getChannelData(ch);
          const base = ch * size;
          for (let k = 0; k < size; k++) data[base + k] = chData[offset + k];
        }

        const audioFrame = new AudioData({
          format: 'f32-planar',
          sampleRate,
          numberOfFrames: size,
          numberOfChannels: channels,
          timestamp: (offset * 1_000_000) / sampleRate,
          data
        });
        audioEncoder.encode(audioFrame);
        audioFrame.close();
      }

      await audioEncoder.flush();
      audioEncoder.close();
    }

    onProgress?.(0.92);
  } catch (err) {
    try { if (videoEncoder.state !== 'closed') videoEncoder.close(); } catch { /* ignore */ }
    try { if (videoDecoder.state !== 'closed') videoDecoder.close(); } catch { /* ignore */ }
    throw err;
  }

  muxer.finalize();
  return (muxer.target as ArrayBufferTarget).buffer;
}

// ─── Universal Compatibility Fallback seeking loop ───────────────────────────
async function removeWatermarkFallback(
  sourceFile: File,
  region: WatermarkRegionPx | null,
  audioBuffer: AudioBuffer | null,
  videoWidth: number,
  videoHeight: number,
  onProgress?: (progress: number) => void
): Promise<ArrayBuffer> {
  const url = URL.createObjectURL(sourceFile);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error(`Failed to load metadata in fallback: ${video.error?.message}`));
  });

  const duration = video.duration;
  const fps = 30;
  const totalFrames = Math.max(1, Math.ceil(duration * fps));

  const canvas = document.createElement('canvas');
  canvas.width = videoWidth;
  canvas.height = videoHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  const engine = await createWatermarkEngine();

  let watermarkInfo: any = null;
  let alphaMap: Float32Array | null = null;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width: videoWidth,
      height: videoHeight
    },
    audio: audioBuffer ? {
      codec: 'aac',
      numberOfChannels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate
    } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset'
  });

  let encodeError: Error | null = null;

  const videoEncoder = new VideoEncoder({
    output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
    error: (e) => {
      console.error('Video Encoder Fallback Error:', e);
      encodeError = e;
    }
  });

  const encoderCodec = (videoWidth > 1920 || videoHeight > 1080) ? 'avc1.640033' : 'avc1.64002a';
  videoEncoder.configure({
    codec: encoderCodec,
    width: videoWidth,
    height: videoHeight,
    bitrate: 8_000_000,
    framerate: fps,
    bitrateMode: 'variable',
    hardwareAcceleration: 'prefer-hardware'
  });

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (encodeError) throw encodeError;

      const seekTime = i / fps;
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
        video.currentTime = seekTime;
      });

      ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
      let imageData = ctx.getImageData(0, 0, videoWidth, videoHeight);
      
      if (!watermarkInfo) {
        // Run NCC detection (local if region is provided, automatic full-scan fallback otherwise)
        const detection = region
          ? await detectWatermarkLocally(imageData, engine, region)
          : await detectWatermarkAutomatically(imageData, engine);
        if (detection) {
          let alphaMapToUse = detection.alphaMap;
          if (detection.correlation < -0.05) {
            alphaMapToUse = negateAlphaMap(alphaMapToUse);
          }
          watermarkInfo = { 
            position: detection.position, 
            size: detection.size, 
            alphaGain: 1.0 // default gain
          };
          alphaMap = alphaMapToUse;
          
          // Apply fast path to frame 1 immediately
          fastRemoveWatermark(imageData, alphaMapToUse, watermarkInfo.position, watermarkInfo.alphaGain);
        }
      } else if (alphaMap && watermarkInfo) {
        // Fast path: mathematically subtract the watermark at the cached exact position
        fastRemoveWatermark(imageData, alphaMap as Float32Array, watermarkInfo.position, watermarkInfo.alphaGain);
      }
      
      ctx.putImageData(imageData, 0, 0);

      const frame = new VideoFrame(canvas, { timestamp: (i * 1_000_000) / fps });
      try {
        videoEncoder.encode(frame);
      } finally {
        frame.close();
      }

      onProgress?.(0.1 + (i / totalFrames) * 0.7);

      if (i % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    await videoEncoder.flush();
    videoEncoder.close();

    if (audioBuffer) {
      onProgress?.(0.85);
      const audioEncoder = new AudioEncoder({
        output: (chunk, metadata) => muxer.addAudioChunk(chunk, metadata),
        error: (e) => {
          console.error('Audio Encoder Fallback Error:', e);
          encodeError = e;
        }
      });
      audioEncoder.configure({
        codec: 'mp4a.40.2',
        numberOfChannels: audioBuffer.numberOfChannels,
        sampleRate: audioBuffer.sampleRate,
        bitrate: 128_000
      });

      const { numberOfChannels: channels, length, sampleRate } = audioBuffer;
      const frameSize = 1024;

      for (let offset = 0; offset < length; offset += frameSize) {
        if (encodeError) throw encodeError;
        const size = Math.min(frameSize, length - offset);
        const data = new Float32Array(size * channels);

        for (let ch = 0; ch < channels; ch++) {
          const chData = audioBuffer.getChannelData(ch);
          const base = ch * size;
          for (let k = 0; k < size; k++) data[base + k] = chData[offset + k];
        }

        const audioFrame = new AudioData({
          format: 'f32-planar',
          sampleRate,
          numberOfFrames: size,
          numberOfChannels: channels,
          timestamp: (offset * 1_000_000) / sampleRate,
          data
        });
        audioEncoder.encode(audioFrame);
        audioFrame.close();
      }

      await audioEncoder.flush();
      audioEncoder.close();
    }

    onProgress?.(0.92);
  } catch (err) {
    try { if (videoEncoder.state !== 'closed') videoEncoder.close(); } catch { /* ignore */ }
    throw err;
  } finally {
    URL.revokeObjectURL(url);
    video.remove();
  }

  muxer.finalize();
  return (muxer.target as ArrayBufferTarget).buffer;
}

// ─── Public API ──────────────────────────────────────────────────────────────
export async function removeWatermark(
  asset: Asset,
  region: WatermarkRegionPx | null,
  projectId: string,
  onProgress?: (progress: number) => void
): Promise<Asset> {
  onProgress?.(0.01);

  // 1. Load source video file
  const sourceFile = await getFileFromOPFS(asset.opfsPath);
  const inputExt = asset.opfsPath.split('.').pop()?.toLowerCase() || 'mp4';

  // 2. Extract audio track natively
  onProgress?.(0.05);
  let audioBuffer: AudioBuffer | null = null;
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  try {
    const arrayBuffer = await sourceFile.arrayBuffer();
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  } catch (err) {
    console.warn('[Watermark Remover] No audio track decoded or not supported:', err);
  }
  onProgress?.(0.1);

  let outputBuffer: ArrayBuffer;
  try {
    // Attempt high performance demuxer + WebCodecs decoding pipeline
    console.log('[Watermark Remover] Attempting high-performance hardware-accelerated decode...');
    outputBuffer = await removeWatermarkWebCodecs(
      sourceFile,
      region,
      audioBuffer,
      asset.width || 1920,
      asset.height || 1080,
      onProgress
    );
  } catch (err) {
    console.warn('[Watermark Remover] High-performance pipeline failed, falling back to seek-decoding:', err);
    // Fallback to compatibility seek mode
    outputBuffer = await removeWatermarkFallback(
      sourceFile,
      region,
      audioBuffer,
      asset.width || 1920,
      asset.height || 1080,
      onProgress
    );
  } finally {
    // Release Web Audio context
    audioContext.close().catch(() => { /* ignore */ });
  }

  if (outputBuffer.byteLength === 0) {
    throw new Error('Processed video output is 0 bytes - encoding pipeline failed.');
  }

  const mimeType = inputExt === 'mov' ? 'video/quicktime' : 'video/mp4';
  const outputBlob = new Blob([outputBuffer], { type: mimeType });

  // 3. Save clean video back to OPFS and database
  const newAssetId = Math.random().toString(36).substring(2, 9);
  const newOpfsPath = `${projectId}/${newAssetId}.${inputExt}`;
  await saveFileToOPFS(newOpfsPath, outputBlob);

  const cleanName = asset.name.replace(/(\.[^.]+)$/, `_nowm.${inputExt}`);
  const newAsset: Asset = {
    id: newAssetId,
    projectId,
    name: cleanName,
    size: outputBlob.size,
    type: asset.type,
    durationMs: asset.durationMs,
    width: asset.width,
    height: asset.height,
    opfsPath: newOpfsPath,
    createdAt: new Date()
  };

  await db.assets.add(newAsset);
  onProgress?.(1.0);
  return newAsset;
}
