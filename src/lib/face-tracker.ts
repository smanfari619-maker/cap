/**
 * Light-weight, high-performance Skin-Tone Centroid Tracker
 * Scans downsampled image pixels to locate the speaker's face center.
 * Used for real-time Smart Reframe (auto-cropping) and Subject Background Removal.
 */
export function getSubjectFaceCenter(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number
): number {
  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    let sumX = 0;
    let count = 0;

    // Standard human skin color thresholds in RGB color space
    for (let y = Math.round(height * 0.1); y < height * 0.8; y += 6) {
      for (let x = Math.round(width * 0.1); x < width * 0.9; x += 6) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Skin color heuristics: R > 95, G > 40, B > 20, R - G > 15, R > G, R > B
        const isSkin = r > 95 && g > 40 && b > 20 && r - g > 15 && r > g && r > b;
        if (isSkin) {
          sumX += x;
          count++;
        }
      }
    }

    // Return normalized X position, default to center (0.5) if not enough skin pixels detected
    return count > 8 ? (sumX / count) / width : 0.5;
  } catch (e) {
    return 0.5;
  }
}
