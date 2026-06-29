/**
 * Effects Registry
 * Central definition for all video effect presets.
 * Each effect describes how it is applied via CSS filter strings or canvas pixel ops.
 */

export interface EffectDef {
  id: string;
  name: string;
  category: 'Blur' | 'Glow' | 'Distort' | 'Camera' | 'Color';
  description: string;
  /** CSS filter string template — use {i} as intensity placeholder (0-100) */
  cssFilter?: string;
  /** Swatches color to preview in the sidebar card (two colors shown as a gradient) */
  previewColors: [string, string];
  /** Default intensity 0-100 */
  defaultIntensity: number;
  /** Whether this effect modifies pixel data directly (not CSS filters) */
  isCanvasOp?: boolean;
}

export const EFFECTS_REGISTRY: Record<string, EffectDef> = {
  // ── Blur ──────────────────────────────────────────────────────────
  'blur-gaussian': {
    id: 'blur-gaussian',
    name: 'Gaussian Blur',
    category: 'Blur',
    description: 'Smooth blur over the entire frame.',
    cssFilter: 'blur({v}px)',
    previewColors: ['#a3bffa', '#4c51bf'],
    defaultIntensity: 40,
  },
  'blur-tilt-shift': {
    id: 'blur-tilt-shift',
    name: 'Tilt Shift',
    category: 'Blur',
    description: 'Miniature effect — blurs top and bottom edges.',
    cssFilter: 'blur({v}px)',
    previewColors: ['#68d391', '#276749'],
    defaultIntensity: 30,
    isCanvasOp: true, // partial blur needs canvas pixel ops
  },

  // ── Glow ──────────────────────────────────────────────────────────
  'glow-neon': {
    id: 'glow-neon',
    name: 'Neon Glow',
    category: 'Glow',
    description: 'Bright neon radiance around highlights.',
    cssFilter: 'brightness({bv}%) saturate(150%) drop-shadow(0 0 {gv}px rgba(120,80,255,0.85))',
    previewColors: ['#9f7aea', '#553c9a'],
    defaultIntensity: 60,
  },
  'glow-bloom': {
    id: 'glow-bloom',
    name: 'Bloom',
    category: 'Glow',
    description: 'Soft light bleed from bright areas.',
    cssFilter: 'brightness({bv}%) blur(0.5px)',
    previewColors: ['#fefcbf', '#d69e2e'],
    defaultIntensity: 50,
  },
  'glow-dreamy': {
    id: 'glow-dreamy',
    name: 'Dreamy Haze',
    category: 'Glow',
    description: 'Soft pastel glow for a dreamlike look.',
    cssFilter: 'brightness({bv}%) saturate(80%) blur(0.8px) sepia(20%)',
    previewColors: ['#fbd5e8', '#b83280'],
    defaultIntensity: 55,
  },

  // ── Distort ────────────────────────────────────────────────────────
  'distort-fisheye': {
    id: 'distort-fisheye',
    name: 'Fisheye',
    category: 'Distort',
    description: 'Wide-angle barrel lens distortion.',
    cssFilter: '', // canvas pixel op
    previewColors: ['#fc8181', '#9b2c2c'],
    defaultIntensity: 60,
    isCanvasOp: true,
  },
  'distort-wave': {
    id: 'distort-wave',
    name: 'Wave Warp',
    category: 'Distort',
    description: 'Animated sine wave pixel displacement.',
    cssFilter: '', // canvas pixel op
    previewColors: ['#63b3ed', '#2b6cb0'],
    defaultIntensity: 40,
    isCanvasOp: true,
  },
  'distort-glitch': {
    id: 'distort-glitch',
    name: 'Glitch',
    category: 'Distort',
    description: 'RGB channel split with scanline artifacts.',
    cssFilter: '', // canvas pixel op
    previewColors: ['#f6e05e', '#b7791f'],
    defaultIntensity: 50,
    isCanvasOp: true,
  },

  // ── Camera ─────────────────────────────────────────────────────────
  'camera-shake': {
    id: 'camera-shake',
    name: 'Jitter Shake',
    category: 'Camera',
    description: 'Dynamic handheld camera shake.',
    cssFilter: '', // canvas transform only
    previewColors: ['#f6ad55', '#c05621'],
    defaultIntensity: 50,
    isCanvasOp: true,
  },
  'camera-grain': {
    id: 'camera-grain',
    name: 'Film Grain',
    category: 'Camera',
    description: 'Authentic film grain noise overlay.',
    cssFilter: '', // canvas pixel op
    previewColors: ['#a0aec0', '#4a5568'],
    defaultIntensity: 40,
    isCanvasOp: true,
  },
  'camera-scanlines': {
    id: 'camera-scanlines',
    name: 'CRT Scanlines',
    category: 'Camera',
    description: 'Retro television horizontal scanlines.',
    cssFilter: '', // canvas pixel op
    previewColors: ['#38a169', '#1c4532'],
    defaultIntensity: 60,
    isCanvasOp: true,
  },

  // ── Color ──────────────────────────────────────────────────────────
  'color-vignette': {
    id: 'color-vignette',
    name: 'Vignette',
    category: 'Color',
    description: 'Darkens corners to focus attention on the center.',
    cssFilter: '',
    previewColors: ['#2d3748', '#1a202c'],
    defaultIntensity: 50,
    isCanvasOp: true,
  },
  'color-lomo': {
    id: 'color-lomo',
    name: 'Lomo Chrome',
    category: 'Color',
    description: 'High contrast with lifted shadows.',
    cssFilter: 'contrast(130%) saturate(120%) brightness(90%)',
    previewColors: ['#ed8936', '#7b341e'],
    defaultIntensity: 80,
  },
};

export const EFFECT_CATEGORIES = ['Blur', 'Glow', 'Distort', 'Camera', 'Color'] as const;

/**
 * Build the CSS filter string for an effect at a given intensity (0-100).
 */
export function buildEffectFilterString(effectId: string, intensity: number): string {
  const def = EFFECTS_REGISTRY[effectId];
  if (!def || !def.cssFilter) return '';

  const t = intensity / 100; // 0.0 to 1.0
  return def.cssFilter
    .replace('{v}', (t * 12).toFixed(1))          // pixel value (e.g. blur px)
    .replace('{bv}', (100 + t * 30).toFixed(0))   // brightness %
    .replace('{gv}', (t * 20).toFixed(1));         // glow spread px
}

/**
 * Apply canvas-based effects (pixel ops / transforms) that cannot be expressed as CSS filters.
 * Called from the draw loop after the clip frame has been drawn to the offscreen canvas.
 */
export function applyCanvasEffect(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  effectId: string,
  intensity: number,
  width: number,
  height: number,
  timeMs: number
): void {
  const t = intensity / 100;

  if (effectId === 'camera-shake') {
    const amp = t * 10;
    const dx = (Math.random() - 0.5) * amp * 2;
    const dy = (Math.random() - 0.5) * amp * 2;
    ctx.translate(dx, dy);
    return;
  }

  if (effectId === 'color-vignette') {
    const gradient = ctx.createRadialGradient(
      width / 2, height / 2, height * 0.25,
      width / 2, height / 2, width * 0.75
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${t * 0.85})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  if (effectId === 'camera-grain') {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const grainAmount = t * 60;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * grainAmount;
      data[i] = Math.max(0, Math.min(255, data[i] + noise));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);
    return;
  }

  if (effectId === 'camera-scanlines') {
    const lineSpacing = Math.max(2, Math.round(4 - t * 2));
    ctx.fillStyle = `rgba(0,0,0,${t * 0.4})`;
    for (let y = 0; y < height; y += lineSpacing) {
      ctx.fillRect(0, y, width, 1);
    }
    return;
  }

  if (effectId === 'distort-glitch') {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const shift = Math.round(t * 12);
    // RGB channel horizontal split
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcIdx = (y * width + x) * 4;
        const rIdx = (y * width + Math.min(width - 1, x + shift)) * 4;
        const bIdx = (y * width + Math.max(0, x - shift)) * 4;
        data[srcIdx] = imgData.data[rIdx];     // red shifted right
        data[srcIdx + 2] = imgData.data[bIdx + 2]; // blue shifted left
      }
    }
    ctx.putImageData(imgData, 0, 0);
    // Add a random horizontal glitch bar
    if (Math.random() < t * 0.4) {
      const barY = Math.floor(Math.random() * height);
      const barH = Math.floor(Math.random() * 8 + 2);
      const barW = Math.floor(Math.random() * (width / 2));
      ctx.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},0.15)`;
      ctx.fillRect(0, barY, barW, barH);
    }
    return;
  }

  if (effectId === 'distort-wave') {
    const imgData = ctx.getImageData(0, 0, width, height);
    const output = ctx.createImageData(width, height);
    const amp = t * 15;
    const freq = 0.05;
    const phase = (timeMs / 500) % (Math.PI * 2);
    for (let y = 0; y < height; y++) {
      const srcX = Math.round(Math.sin(y * freq + phase) * amp);
      for (let x = 0; x < width; x++) {
        const destIdx = (y * width + x) * 4;
        const srcXClamped = Math.max(0, Math.min(width - 1, x + srcX));
        const srcIdx = (y * width + srcXClamped) * 4;
        output.data[destIdx] = imgData.data[srcIdx];
        output.data[destIdx + 1] = imgData.data[srcIdx + 1];
        output.data[destIdx + 2] = imgData.data[srcIdx + 2];
        output.data[destIdx + 3] = imgData.data[srcIdx + 3];
      }
    }
    ctx.putImageData(output, 0, 0);
    return;
  }
}
