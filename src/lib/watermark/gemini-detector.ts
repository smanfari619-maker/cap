
export interface WatermarkRegionPx {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ─── Fast Reverse Alpha Blending Math ──────────────────────────────────────
export function fastRemoveWatermark(
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

export function negateAlphaMap(alphaMap: Float32Array): Float32Array {
  const negative = new Float32Array(alphaMap.length);
  for (let i = 0; i < alphaMap.length; i++) {
    negative[i] = -alphaMap[i];
  }
  return negative;
}

export function resizeAlphaMap(alphaMap: Float32Array, srcSize: number, dstSize: number): Float32Array {
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

export function findWatermarkPositionNCC(
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

export async function detectWatermarkLocally(
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
  
  const threshold = 0.85; // Strict threshold to prevent false positives on non-Gemini watermarks
  
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
