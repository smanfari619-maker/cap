/**
 * inpaint-telea.ts — Advanced Inpainting with Exemplar Patch-Matching & Grain Preservation.
 *
 * Combines:
 *  1. Gradient-Aware & User Brush Masking: Tight masking of watermark pixels.
 *  2. Telea PDE Base Propagation: Smooth structural base color.
 *  3. Exemplar Patch-Matching (Near-Object Filling): Searches surrounding unmasked 
 *     background (e.g. wood grain, fabric, walls) for best-matching texture patches.
 *  4. High-Frequency Micro-Texture Injection: Restores natural surface noise/roughness 
 *     so inpainted regions blend seamlessly without flat, blurry smudges.
 */

export interface InpaintRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  maskData?: Uint8Array; // 1 for masked, 0 for unmasked, length must be w * h
}

export function inpaintRegion(
  imageData: ImageData,
  region: InpaintRegion
): ImageData {
  const { data, width: W, height: H } = imageData;

  const rx = Math.max(0, Math.floor(region.x));
  const ry = Math.max(0, Math.floor(region.y));
  const rw = Math.min(W - rx, Math.ceil(region.w));
  const rh = Math.min(H - ry, Math.ceil(region.h));

  if (rw <= 0 || rh <= 0) {
    return new ImageData(new Uint8ClampedArray(data), W, H);
  }

  const output = new Uint8ClampedArray(data);
  const mask = new Uint8Array(rw * rh);
  let maskedCount = 0;

  if (region.maskData && region.maskData.length === rw * rh) {
    // ── User-Drawn Brush Mask ──────────────────────────────────────────────────
    mask.set(region.maskData);
    for (let i = 0; i < mask.length; i++) if (mask[i] === 1) maskedCount++;
  } else {
    // ── 1. Gradient-Aware Tight Masking (Fallback for Rectangles) ─────────────
    const pad = 4;

    for (let dy = 0; dy < rh; dy++) {
      for (let dx = 0; dx < rw; dx++) {
        const idx = dy * rw + dx;
        const x = rx + dx;
        const y = ry + dy;

        const xL = Math.max(0, rx - pad);
        const xR = Math.min(W - 1, rx + rw + pad - 1);
        const yT = Math.max(0, ry - pad);
        const yB = Math.min(H - 1, ry + rh + pad - 1);

        const dL = x - xL;
        const dR = xR - x;
        const dT = y - yT;
        const dB = yB - y;

        const wL = 1.0 / (dL + 0.1);
        const wR = 1.0 / (dR + 0.1);
        const wT = 1.0 / (dT + 0.1);
        const wB = 1.0 / (dB + 0.1);
        const weightSum = wL + wR + wT + wB;

        const pL = (y * W + xL) * 4;
        const pR = (y * W + xR) * 4;
        const pT = (yT * W + x) * 4;
        const pB = (yB * W + x) * 4;

        const estR = (wL * data[pL] + wR * data[pR] + wT * data[pT] + wB * data[pB]) / weightSum;
        const estG = (wL * data[pL+1] + wR * data[pR+1] + wT * data[pT+1] + wB * data[pB+1]) / weightSum;
        const estB = (wL * data[pL+2] + wR * data[pR+2] + wT * data[pT+2] + wB * data[pB+2]) / weightSum;

        const pi = (y * W + x) * 4;
        const r = data[pi];
        const g = data[pi + 1];
        const b = data[pi + 2];

        const colorDist = Math.sqrt((r - estR) ** 2 + (g - estG) ** 2 + (b - estB) ** 2);
        
        if (colorDist > 15) {
          mask[idx] = 1;
          maskedCount++;
        }
      }
    }

    if (maskedCount < 5 || maskedCount > rw * rh * 0.9) {
      mask.fill(1);
      maskedCount = rw * rh;
    }
  }

  // Unified 1-pixel dilation to swallow anti-aliased edges safely
  const preDilate = new Uint8Array(mask);
  for (let dy = 0; dy < rh; dy++) {
    for (let dx = 0; dx < rw; dx++) {
      if (preDilate[dy * rw + dx] !== 1) continue;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = dx + ox, ny = dy + oy;
          if (nx >= 0 && nx < rw && ny >= 0 && ny < rh) {
            mask[ny * rw + nx] = 1;
          }
        }
      }
    }
  }
  maskedCount = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] === 1) maskedCount++;

  // ── 2. Telea Inpainting Base Pass ──────────────────────────────────────────
  let pixelsRemaining = maskedCount;
  let safetyCounter = 1000;
  const radius = 6;
  const r2 = radius * radius;
  const nextValues = new Uint8ClampedArray(rw * rh * 3);
  const currentMask = new Uint8Array(mask);

  while (pixelsRemaining > 0 && safetyCounter > 0) {
    safetyCounter--;
    const boundaryIndices: number[] = [];

    for (let dy = 0; dy < rh; dy++) {
      for (let dx = 0; dx < rw; dx++) {
        const idx = dy * rw + dx;
        if (currentMask[idx] === 0) continue;

        const gx = rx + dx, gy = ry + dy;
        let isBoundary = false;

        if (gx > 0   && (dx - 1 < 0  || currentMask[idx - 1] === 0)) isBoundary = true;
        if (gx < W-1 && (dx + 1 >= rw || currentMask[idx + 1] === 0)) isBoundary = true;
        if (gy > 0   && (dy - 1 < 0  || currentMask[idx - rw] === 0)) isBoundary = true;
        if (gy < H-1 && (dy + 1 >= rh || currentMask[idx + rw] === 0)) isBoundary = true;

        if (isBoundary) boundaryIndices.push(idx);
      }
    }

    if (boundaryIndices.length === 0) break;

    for (const idx of boundaryIndices) {
      const dy = Math.floor(idx / rw);
      const dx = idx % rw;
      const gx = rx + dx, gy = ry + dy;

      let wR = 0, wG = 0, wB = 0, wW = 0;

      for (let ny = -radius; ny <= radius; ny++) {
        const ngy = gy + ny;
        if (ngy < 0 || ngy >= H) continue;

        for (let nx = -radius; nx <= radius; nx++) {
          if (nx * nx + ny * ny > r2) continue;
          const ngx = gx + nx;
          if (ngx < 0 || ngx >= W) continue;
          const ndx = ngx - rx, ndy = ngy - ry;

          const isInsideCrop = ndx >= 0 && ndx < rw && ndy >= 0 && ndy < rh;
          if (isInsideCrop && currentMask[ndy * rw + ndx] === 1) continue;

          const distSq = nx * nx + ny * ny;
          const weight = 1.0 / (Math.sqrt(distSq) + 0.1);
          const pi = (ngy * W + ngx) * 4;
          
          wR += output[pi] * weight;
          wG += output[pi + 1] * weight;
          wB += output[pi + 2] * weight;
          wW += weight;
        }
      }

      if (wW > 0) {
        nextValues[idx * 3]     = Math.min(255, Math.max(0, wR / wW));
        nextValues[idx * 3 + 1] = Math.min(255, Math.max(0, wG / wW));
        nextValues[idx * 3 + 2] = Math.min(255, Math.max(0, wB / wW));
      } else {
        const pi = (gy * W + gx) * 4;
        nextValues[idx * 3]     = output[pi];
        nextValues[idx * 3 + 1] = output[pi + 1];
        nextValues[idx * 3 + 2] = output[pi + 2];
      }
    }

    for (const idx of boundaryIndices) {
      const dy = Math.floor(idx / rw);
      const dx = idx % rw;
      const pi = ((ry + dy) * W + (rx + dx)) * 4;
      output[pi]     = nextValues[idx * 3];
      output[pi + 1] = nextValues[idx * 3 + 1];
      output[pi + 2] = nextValues[idx * 3 + 2];
      currentMask[idx] = 0;
      pixelsRemaining--;
    }
  }

  // ── 3. Exemplar Patch Matching & Grain Synthesis Pass ───────────────────────
  // To avoid smooth blur on wood, fabric, marble, etc., we sample surrounding
  // unmasked texture patches ("near objects") and inject local surface grain.

  // Collect unmasked background pixels in a margin around the region
  const searchMargin = 96; // wider search = much better texture matches
  const bgCoords: Array<[number, number]> = [];
  const minX = Math.max(0, rx - searchMargin);
  const maxX = Math.min(W - 1, rx + rw + searchMargin);
  const minY = Math.max(0, ry - searchMargin);
  const maxY = Math.min(H - 1, ry + rh + searchMargin);

  for (let sy = minY; sy <= maxY; sy++) {
    for (let sx = minX; sx <= maxX; sx++) {
      const inBox = sx >= rx && sx < rx + rw && sy >= ry && sy < ry + rh;
      if (inBox) {
        const localIdx = (sy - ry) * rw + (sx - rx);
        if (mask[localIdx] === 1) continue; // Skip masked pixels
      }
      bgCoords.push([sx, sy]);
    }
  }

  if (bgCoords.length > 50) {
    // A) Measure background noise / texture variance
    let sumVar = 0;
    let sampleCount = 0;
    for (let i = 0; i < Math.min(200, bgCoords.length); i++) {
      const [bx, by] = bgCoords[(i * 37) % bgCoords.length];
      const pi = (by * W + bx) * 4;
      // High-pass filter sample against neighbor
      if (bx + 1 < W) {
        const npi = (by * W + (bx + 1)) * 4;
        const diffR = Math.abs(data[pi] - data[npi]);
        const diffG = Math.abs(data[pi + 1] - data[npi + 1]);
        const diffB = Math.abs(data[pi + 2] - data[npi + 2]);
        sumVar += (diffR + diffG + diffB) / 3;
        sampleCount++;
      }
    }
    const bgGrainStd = sampleCount > 0 ? (sumVar / sampleCount) : 0;

    // B) Exemplar Patch Transfer for Masked Pixels
    // Create a feathered mask to soften the texture injection at boundaries
    const featherMask = new Float32Array(rw * rh);
    for (let dy = 0; dy < rh; dy++) {
      for (let dx = 0; dx < rw; dx++) {
        let sum = 0, count = 0;
        for (let oy = -2; oy <= 2; oy++) {
          for (let ox = -2; ox <= 2; ox++) {
            const nx = dx + ox, ny = dy + oy;
            if (nx >= 0 && nx < rw && ny >= 0 && ny < rh) {
              sum += mask[ny * rw + nx];
              count++;
            }
          }
        }
        featherMask[dy * rw + dx] = sum / count;
      }
    }

    const patchSize = 7;  // larger patch = more context for matching
    const halfP = 3;

    for (let dy = 0; dy < rh; dy += 2) {
      for (let dx = 0; dx < rw; dx += 2) {
        const idx = dy * rw + dx;
        if (mask[idx] !== 1) continue;

        const gx = rx + dx;
        const gy = ry + dy;

        // Build candidate list: first 16 are same-row (horizontal grain bias),
        // next 32 are random spread across the full margin.
        // This dramatically improves results on wood, fabric, marble textures.
        const horizontalCandidates: Array<[number, number]> = bgCoords.filter(
          ([cx, cy]) => Math.abs(cy - gy) <= 3
        );
        const candidateList: Array<[number, number]> = [
          ...horizontalCandidates.slice(0, 16),
          ...Array.from({ length: 32 }, (_, k) => bgCoords[(k * 23 + (dx + dy) * 11) % bgCoords.length])
        ];

        let bestCandidate: [number, number] | null = null;
        let minSSD = Infinity;

        // Sample up to 48 candidates
        for (let attempt = 0; attempt < Math.min(48, candidateList.length); attempt++) {
          const [cx, cy] = candidateList[attempt];

          // Compute Sum of Squared Differences (SSD) onknown boundary context
          let ssd = 0;
          let validCount = 0;

          for (let py = -halfP; py <= halfP; py++) {
            for (let px = -halfP; px <= halfP; px++) {
              const targetX = gx + px, targetY = gy + py;
              const sourceX = cx + px, sourceY = cy + py;

              if (targetX < 0 || targetX >= W || targetY < 0 || targetY >= H) continue;
              if (sourceX < 0 || sourceX >= W || sourceY < 0 || sourceY >= H) continue;

              const tInside = targetX >= rx && targetX < rx + rw && targetY >= ry && targetY < ry + rh;
              const tMasked = tInside && mask[(targetY - ry) * rw + (targetX - rx)] === 1;

              if (!tMasked) {
                const tPi = (targetY * W + targetX) * 4;
                const sPi = (sourceY * W + sourceX) * 4;
                const dr = data[tPi] - data[sPi];
                const dg = data[tPi + 1] - data[sPi + 1];
                const db = data[tPi + 2] - data[sPi + 2];
                ssd += dr * dr + dg * dg + db * db;
                validCount++;
              }
            }
          }

          if (validCount > 0 && ssd / validCount < minSSD) {
            minSSD = ssd / validCount;
            bestCandidate = [cx, cy];
          }
        }

        // Blend matched exemplar texture into the Telea base
        if (bestCandidate && minSSD < 4000) {
          const [cx, cy] = bestCandidate;
          for (let py = 0; py < 2 && dy + py < rh; py++) {
            for (let px = 0; px < 2 && dx + px < rw; px++) {
              const mIdx = (dy + py) * rw + (dx + px);
              if (mask[mIdx] !== 1) continue;

              const targetX = gx + px, targetY = gy + py;
              const sourceX = cx + px, sourceY = cy + py;

                if (sourceX >= 0 && sourceX < W && sourceY >= 0 && sourceY < H) {
                  const tPi = (targetY * W + targetX) * 4;
                  const sPi = (sourceY * W + sourceX) * 4;

                  // High-frequency texture detail from near object
                  const texR = data[sPi];
                  const texG = data[sPi + 1];
                  const texB = data[sPi + 2];

                  // Blend 80% Exemplar Texture + 20% Smooth Base, feathered at edges
                  const strength = 0.8 * featherMask[mIdx];
                  const inv = 1.0 - strength;
                  
                  output[tPi]     = Math.round(output[tPi] * inv + texR * strength);
                  output[tPi + 1] = Math.round(output[tPi + 1] * inv + texG * strength);
                  output[tPi + 2] = Math.round(output[tPi + 2] * inv + texB * strength);
                }
              }
            }
        } else if (bgGrainStd > 1.5) {
          // If no clean patch found, add matched grain noise so it doesn't look smooth & blurred
          for (let py = 0; py < 2 && dy + py < rh; py++) {
            for (let px = 0; px < 2 && dx + px < rw; px++) {
              const mIdx = (dy + py) * rw + (dx + px);
              if (mask[mIdx] !== 1) continue;

              const tPi = ((gy + py) * W + (gx + px)) * 4;
              // Deterministic pseudo-random grain based on position, feathered at edges
              const noise = ((Math.sin((gx + px) * 12.9898 + (gy + py) * 78.233) * 43758.5453) % 1 - 0.5) * bgGrainStd * 1.8 * featherMask[mIdx];

              output[tPi]     = Math.min(255, Math.max(0, output[tPi] + noise));
              output[tPi + 1] = Math.min(255, Math.max(0, output[tPi + 1] + noise));
              output[tPi + 2] = Math.min(255, Math.max(0, output[tPi + 2] + noise));
            }
          }
        }
      }
    }
  }
  // ── 4. Feather Composite Pass (Eliminate Hard Seam / Border) ─────────────────
  // Compute Manhattan distance from each masked pixel to the nearest unmasked
  // boundary pixel. Blend the inpainted result back with the original within
  // FEATHER_WIDTH pixels of the edge — this makes the seam invisible.
  const FEATHER_WIDTH = 6;
  const distMap = new Float32Array(rw * rh);

  // Forward pass: propagate distances from unmasked pixels inward
  for (let dy = 0; dy < rh; dy++) {
    for (let dx = 0; dx < rw; dx++) {
      if (mask[dy * rw + dx] === 0) {
        distMap[dy * rw + dx] = 0;
      } else {
        const fromTop  = dy > 0   ? distMap[(dy - 1) * rw + dx] + 1 : Infinity;
        const fromLeft = dx > 0   ? distMap[dy * rw + (dx - 1)] + 1 : Infinity;
        distMap[dy * rw + dx] = Math.min(fromTop, fromLeft);
      }
    }
  }
  // Backward pass: propagate distances from bottom-right to top-left
  for (let dy = rh - 1; dy >= 0; dy--) {
    for (let dx = rw - 1; dx >= 0; dx--) {
      if (mask[dy * rw + dx] === 0) continue;
      const fromBottom = dy < rh - 1 ? distMap[(dy + 1) * rw + dx] + 1 : Infinity;
      const fromRight  = dx < rw - 1 ? distMap[dy * rw + (dx + 1)] + 1 : Infinity;
      distMap[dy * rw + dx] = Math.min(distMap[dy * rw + dx], fromBottom, fromRight);
    }
  }

  // Apply feathered blend: original → inpainted over FEATHER_WIDTH pixels
  for (let dy = 0; dy < rh; dy++) {
    for (let dx = 0; dx < rw; dx++) {
      if (mask[dy * rw + dx] === 0) continue;
      const dist = distMap[dy * rw + dx];
      if (dist >= FEATHER_WIDTH) continue; // Already full inpaint, no blend needed

      // Smooth alpha: 0 at boundary → 1 at FEATHER_WIDTH pixels inside
      const alpha = dist / FEATHER_WIDTH;
      // Ease-in curve for a more natural fade
      const t = alpha * alpha;

      const pi = ((ry + dy) * W + (rx + dx)) * 4;
      output[pi]     = Math.round(data[pi]     * (1 - t) + output[pi]     * t);
      output[pi + 1] = Math.round(data[pi + 1] * (1 - t) + output[pi + 1] * t);
      output[pi + 2] = Math.round(data[pi + 2] * (1 - t) + output[pi + 2] * t);
    }
  }

  return new ImageData(output, W, H);
}
