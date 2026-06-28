// Each entry in the 3D table is a [r, g, b] tuple
type LutEntry = [number, number, number];

export interface Lut3D {
  table: LutEntry[][][];
  size: number;
}

export function parseCubeLUT(text: string): Lut3D | null {
  const lines = text.split('\n');
  let size = 0;
  const points: LutEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('LUT_3D_SIZE')) {
      size = parseInt(trimmed.split(/\s+/)[1], 10);
      continue;
    }

    const parts = trimmed.split(/\s+/).map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      points.push([parts[0], parts[1], parts[2]]);
    }
  }

  if (size === 0 || points.length < size * size * size) return null;

  // Build 3D array [r][g][b] -> [r,g,b]
  const table: LutEntry[][][] = [];
  let idx = 0;
  for (let ri = 0; ri < size; ri++) {
    table[ri] = [];
    for (let gi = 0; gi < size; gi++) {
      table[ri][gi] = [];
      for (let bi = 0; bi < size; bi++) {
        table[ri][gi][bi] = points[idx++];
      }
    }
  }

  return { table, size };
}

export function applyLut3D(
  r: number,
  g: number,
  b: number,
  lutTable: LutEntry[][][],
  size: number
): { r: number; g: number; b: number } {
  // Scale from 0-1 to 0-(size-1)
  const x = r * (size - 1);
  const y = g * (size - 1);
  const z = b * (size - 1);

  const x0 = Math.floor(x), x1 = Math.min(x0 + 1, size - 1);
  const y0 = Math.floor(y), y1 = Math.min(y0 + 1, size - 1);
  const z0 = Math.floor(z), z1 = Math.min(z0 + 1, size - 1);

  const dx = x - x0;
  const dy = y - y0;
  const dz = z - z0;

  // Read corners
  const c000 = lutTable[x0][y0][z0];
  const c100 = lutTable[x1][y0][z0];
  const c010 = lutTable[x0][y1][z0];
  const c110 = lutTable[x1][y1][z0];
  const c001 = lutTable[x0][y0][z1];
  const c101 = lutTable[x1][y0][z1];
  const c011 = lutTable[x0][y1][z1];
  const c111 = lutTable[x1][y1][z1];

  // Trilinear interpolation per channel
  function interp(ch: 0 | 1 | 2): number {
    return (
      (1 - dx) * (1 - dy) * (1 - dz) * c000[ch] +
      dx       * (1 - dy) * (1 - dz) * c100[ch] +
      (1 - dx) * dy       * (1 - dz) * c010[ch] +
      dx       * dy       * (1 - dz) * c110[ch] +
      (1 - dx) * (1 - dy) * dz       * c001[ch] +
      dx       * (1 - dy) * dz       * c101[ch] +
      (1 - dx) * dy       * dz       * c011[ch] +
      dx       * dy       * dz       * c111[ch]
    );
  }

  return { r: interp(0), g: interp(1), b: interp(2) };
}
