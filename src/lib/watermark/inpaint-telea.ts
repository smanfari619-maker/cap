/**
 * inpaint-telea.ts — High-performance general-purpose inpainting algorithm.
 *
 * Approach:
 *  1. Gradient-Aware Tight Masking: We estimate the background behind the watermark
 *     by interpolating the colors from the 4 outer boundaries (Inverse Distance Weighting).
 *     This handles complex lighting gradients perfectly. Any pixel inside the box that
 *     differs significantly from this estimated background is masked as "watermark".
 *  2. Telea Inpainting (radius=3): A fast PDE-based boundary propagation that fills the
 *     tight mask smoothly from the outside in.
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
    // The user has perfectly painted the watermark. We just dilate their paint
    // strokes slightly to cover any anti-aliased edges, completely bypassing
    // the need to guess what is background vs foreground!
    const preDilate = region.maskData;
    for (let dy = 0; dy < rh; dy++) {
      for (let dx = 0; dx < rw; dx++) {
        if (preDilate[dy * rw + dx] !== 1) continue;
        for (let oy = -2; oy <= 2; oy++) {
          for (let ox = -2; ox <= 2; ox++) {
            const nx = dx + ox, ny = dy + oy;
            if (nx >= 0 && nx < rw && ny >= 0 && ny < rh) {
              mask[ny * rw + nx] = 1;
            }
          }
        }
      }
    }
    for (let i = 0; i < mask.length; i++) if (mask[i] === 1) maskedCount++;
  } else {
    // ── 1. Gradient-Aware Tight Masking (Fallback for Rectangles) ─────────────
    // We sample pixels 4px outside the bounding box to ensure we hit pure background.
    const pad = 4;

    for (let dy = 0; dy < rh; dy++) {
      for (let dx = 0; dx < rw; dx++) {
        const idx = dy * rw + dx;
        const x = rx + dx;
        const y = ry + dy;

        // Outer boundary coordinates
        const xL = Math.max(0, rx - pad);
        const xR = Math.min(W - 1, rx + rw + pad - 1);
        const yT = Math.max(0, ry - pad);
        const yB = Math.min(H - 1, ry + rh + pad - 1);

        // Distances to outer boundaries
        const dL = x - xL;
        const dR = xR - x;
        const dT = y - yT;
        const dB = yB - y;

        // Inverse distance weights
        const wL = 1.0 / (dL + 0.1);
        const wR = 1.0 / (dR + 0.1);
        const wT = 1.0 / (dT + 0.1);
        const wB = 1.0 / (dB + 0.1);
        const weightSum = wL + wR + wT + wB;

        // Get colors from the 4 outer boundaries
        const pL = (y * W + xL) * 4;
        const pR = (y * W + xR) * 4;
        const pT = (yT * W + x) * 4;
        const pB = (yB * W + x) * 4;

        const estR = (wL * data[pL] + wR * data[pR] + wT * data[pT] + wB * data[pB]) / weightSum;
        const estG = (wL * data[pL+1] + wR * data[pR+1] + wT * data[pT+1] + wB * data[pB+1]) / weightSum;
        const estB = (wL * data[pL+2] + wR * data[pR+2] + wT * data[pT+2] + wB * data[pB+2]) / weightSum;

        // Actual pixel color
        const pi = (y * W + x) * 4;
        const r = data[pi];
        const g = data[pi + 1];
        const b = data[pi + 2];

        // Euclidean distance
        const colorDist = Math.sqrt((r - estR) ** 2 + (g - estG) ** 2 + (b - estB) ** 2);
        
        // If it significantly differs from the expected gradient, it's the watermark!
        if (colorDist > 25) {
          mask[idx] = 1;
          maskedCount++;
        }
      }
    }

    // Fallback: If mask is empty or huge, mask the whole box
    if (maskedCount < 5 || maskedCount > rw * rh * 0.9) {
      mask.fill(1);
      maskedCount = rw * rh;
    } else {
      // Dilate mask by 2 pixels to cover anti-aliasing
      const preDilate = new Uint8Array(mask);
      for (let dy = 0; dy < rh; dy++) {
        for (let dx = 0; dx < rw; dx++) {
          if (preDilate[dy * rw + dx] !== 1) continue;
          for (let oy = -2; oy <= 2; oy++) {
            for (let ox = -2; ox <= 2; ox++) {
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
    }
  }

  // ── 2. Telea Inpainting (Onion-skin propagation) ────────────────────────────
  let pixelsRemaining = maskedCount;
  let safetyCounter = 1000;
  const radius = 6; // Larger radius blends across the medial axis to prevent "X" marks
  const r2 = radius * radius;
  const nextValues = new Uint8ClampedArray(rw * rh * 3);

  while (pixelsRemaining > 0 && safetyCounter > 0) {
    safetyCounter--;
    const boundaryIndices: number[] = [];

    // Find boundary pixels
    for (let dy = 0; dy < rh; dy++) {
      for (let dx = 0; dx < rw; dx++) {
        const idx = dy * rw + dx;
        if (mask[idx] === 0) continue;

        const gx = rx + dx, gy = ry + dy;
        let isBoundary = false;

        if (gx > 0   && (dx - 1 < 0  || mask[idx - 1] === 0)) isBoundary = true;
        if (gx < W-1 && (dx + 1 >= rw || mask[idx + 1] === 0)) isBoundary = true;
        if (gy > 0   && (dy - 1 < 0  || mask[idx - rw] === 0)) isBoundary = true;
        if (gy < H-1 && (dy + 1 >= rh || mask[idx + rw] === 0)) isBoundary = true;

        if (isBoundary) boundaryIndices.push(idx);
      }
    }

    if (boundaryIndices.length === 0) break;

    // Fill boundary pixels from known neighbors
    for (const idx of boundaryIndices) {
      const dy = Math.floor(idx / rw);
      const dx = idx % rw;
      const gx = rx + dx, gy = ry + dy;

      let wR = 0, wG = 0, wB = 0, wW = 0;

      for (let ny = -radius; ny <= radius; ny++) {
        const ngy = gy + ny;
        if (ngy < 0 || ngy >= H) continue;
        const ndy = ngy - ry;

        for (let nx = -radius; nx <= radius; nx++) {
          if (nx * nx + ny * ny > r2) continue;
          const ngx = gx + nx;
          if (ngx < 0 || ngx >= W) continue;
          const ndx = ngx - rx;

          const isInsideCrop = ndx >= 0 && ndx < rw && ndy >= 0 && ndy < rh;
          if (isInsideCrop && mask[ndy * rw + ndx] === 1) continue; // Masked, don't sample

          const distSq = nx * nx + ny * ny;
          // Slower weight decay (sqrt) blends opposite wavefronts together perfectly
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
        nextValues[idx * 3] = output[pi];
        nextValues[idx * 3 + 1] = output[pi + 1];
        nextValues[idx * 3 + 2] = output[pi + 2];
      }
    }

    // Apply new values
    for (const idx of boundaryIndices) {
      const dy = Math.floor(idx / rw);
      const dx = idx % rw;
      const pi = ((ry + dy) * W + (rx + dx)) * 4;
      output[pi]     = nextValues[idx * 3];
      output[pi + 1] = nextValues[idx * 3 + 1];
      output[pi + 2] = nextValues[idx * 3 + 2];
      mask[idx] = 0;
      pixelsRemaining--;
    }
  }

  return new ImageData(output, W, H);
}
