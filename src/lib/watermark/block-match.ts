/**
 * block-match.ts — Motion-Compensated Temporal Block Copying
 *
 * Instead of averaging pixels (which causes blur), this module:
 *  1. Finds the best motion offset between the current frame and a reference
 *     frame using Sum of Absolute Differences (SAD) on the watermark border.
 *  2. Stamps real, unmodified pixels from the reference frame directly onto
 *     the watermark region. Zero averaging. Zero blur. 100% crisp.
 */

export interface MatchRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MotionOffset {
  dx: number;
  dy: number;
  sad: number; // quality score — lower is better
}

/**
 * Capture raw ImageData from a video element at its current time.
 */
export function captureFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D
): ImageData {
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Find the best motion offset (dx, dy) between a current frame and a
 * reference frame using SAD block matching on the 4-pixel border ring
 * surrounding the watermark region.
 *
 * @param currentData - ImageData of the watermarked frame
 * @param refData     - ImageData of a clean reference frame (t±k)
 * @param region      - The watermark bounding box
 * @param W           - Image width
 * @param searchRadius - How far to search in pixels (default: 15)
 * @returns Best (dx, dy) offset and its SAD score
 */
export function findBestMotionOffset(
  currentData: Uint8ClampedArray,
  refData: Uint8ClampedArray,
  region: MatchRegion,
  W: number,
  H: number,
  searchRadius = 15
): MotionOffset {
  const { x, y, w, h } = region;
  const margin = 4;

  // Collect border pixel positions (ring around the watermark box)
  const borderPixels: Array<[number, number]> = [];
  for (let bx = x - margin; bx < x + w + margin; bx++) {
    if (bx < 0 || bx >= W) continue;
    for (let row of [y - margin, y + h + margin - 1]) {
      if (row >= 0 && row < H) borderPixels.push([bx, row]);
    }
  }
  for (let by = y - margin; by < y + h + margin; by++) {
    if (by < 0 || by >= H) continue;
    for (let col of [x - margin, x + w + margin - 1]) {
      if (col >= 0 && col < W) borderPixels.push([col, by]);
    }
  }

  let bestSAD = Infinity;
  let bestDx = 0;
  let bestDy = 0;

  // Search within searchRadius — step by 2 for speed
  for (let dy = -searchRadius; dy <= searchRadius; dy += 2) {
    for (let dx = -searchRadius; dx <= searchRadius; dx += 2) {
      let sad = 0;

      for (const [px, py] of borderPixels) {
        const rx = Math.max(0, Math.min(W - 1, px + dx));
        const ry = Math.max(0, Math.min(H - 1, py + dy));

        const ci = (py * W + px) * 4;
        const ri = (ry * W + rx) * 4;

        sad += Math.abs(currentData[ci]     - refData[ri])
             + Math.abs(currentData[ci + 1] - refData[ri + 1])
             + Math.abs(currentData[ci + 2] - refData[ri + 2]);
      }

      if (sad < bestSAD) {
        bestSAD = sad;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }

  return { dx: bestDx, dy: bestDy, sad: bestSAD };
}

/**
 * Stamp pixels from the reference frame (at the motion offset) directly onto
 * the watermark region of the output buffer. No averaging. No blur.
 *
 * @param output  - Mutable Uint8ClampedArray of the current frame (modified in place)
 * @param refData - ImageData of the clean reference frame
 * @param region  - The watermark bounding box
 * @param dx, dy  - Motion offset found by findBestMotionOffset
 * @param W       - Image width
 * @param H       - Image height
 */
export function stampPixels(
  output: Uint8ClampedArray,
  refData: Uint8ClampedArray,
  region: MatchRegion,
  dx: number,
  dy: number,
  W: number,
  H: number
): void {
  const { x, y, w, h } = region;

  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      if (px < 0 || px >= W || py < 0 || py >= H) continue;

      const rx = Math.max(0, Math.min(W - 1, px + dx));
      const ry = Math.max(0, Math.min(H - 1, py + dy));

      const oi = (py * W + px) * 4;
      const ri = (ry * W + rx) * 4;

      output[oi]     = refData[ri];
      output[oi + 1] = refData[ri + 1];
      output[oi + 2] = refData[ri + 2];
      output[oi + 3] = refData[ri + 3];
    }
  }
}

/**
 * SAD score threshold above which we consider the reference frame too
 * different (e.g. scene cut) and fall back to Telea inpainting.
 * Expressed as average SAD per border pixel — tune as needed.
 */
export const SAD_SCENE_CUT_THRESHOLD = 60;
