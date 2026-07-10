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
  'distort-mirror': {
    id: 'distort-mirror',
    name: 'Mirror Kaleidoscope',
    category: 'Distort',
    description: 'Split-screen mirroring. Symmetrical kaleidoscopic look.',
    previewColors: ['#a78bfa', '#e879f9'],
    defaultIntensity: 100,
    isCanvasOp: true,
  },
  'color-thermal': {
    id: 'color-thermal',
    name: 'Thermal Vision',
    category: 'Color',
    description: 'Thermal camera simulation. Maps brightness to a vibrant color spectrum.',
    previewColors: ['#3b82f6', '#ef4444'],
    defaultIntensity: 80,
    isCanvasOp: true,
  },
  'distort-pixelate': {
    id: 'distort-pixelate',
    name: '8-Bit Retro',
    category: 'Distort',
    description: 'Retro pixelation. Recreates the aesthetic of 8-bit vintage video games.',
    previewColors: ['#10b981', '#f59e0b'],
    defaultIntensity: 50,
    isCanvasOp: true,
  },
  'color-duotone': {
    id: 'color-duotone',
    name: 'Cyber Duotone',
    category: 'Color',
    description: 'Stylized duotone mapping using cyan and magenta gradients.',
    previewColors: ['#06b6d4', '#d946ef'],
    defaultIntensity: 70,
    isCanvasOp: true,
  },
  'distort-lens-flare': {
    id: 'distort-lens-flare',
    name: 'Anamorphic Flare',
    category: 'Glow',
    description: 'Cinematic horizontal blue lens flare across highlights.',
    previewColors: ['#0284c7', '#38bdf8'],
    defaultIntensity: 50,
    isCanvasOp: true,
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
    const amp = t * 15;
    const dx = (Math.random() - 0.5) * amp * 2;
    const dy = (Math.random() - 0.5) * amp * 2;
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.drawImage(ctx.canvas, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(dx, dy);
      ctx.drawImage(tempCanvas, 0, 0);
      ctx.restore();
    }
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

  if (effectId === 'distort-mirror') {
    const imgData = ctx.getImageData(0, 0, width, height);
    const halfW = Math.floor(width / 2);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < halfW; x++) {
        const leftIdx = (y * width + x) * 4;
        const rightIdx = (y * width + (width - 1 - x)) * 4;
        imgData.data[rightIdx] = imgData.data[leftIdx];
        imgData.data[rightIdx + 1] = imgData.data[leftIdx + 1];
        imgData.data[rightIdx + 2] = imgData.data[leftIdx + 2];
        imgData.data[rightIdx + 3] = imgData.data[leftIdx + 3];
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return;
  }

  if (effectId === 'color-thermal') {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i+1];
      const b = data[i+2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      
      let tr = 0, tg = 0, tb = 0;
      if (l < 64) {
        tr = l * 2;
        tg = 0;
        tb = 128 + l * 2;
      } else if (l < 128) {
        tr = 128 + (l - 64) * 2;
        tg = 0;
        tb = 255 - (l - 64) * 4;
      } else if (l < 192) {
        tr = 255;
        tg = (l - 128) * 4;
        tb = 0;
      } else {
        tr = 255;
        tg = 255;
        tb = (l - 192) * 4;
      }
      
      data[i] = r * (1 - t) + tr * t;
      data[i+1] = g * (1 - t) + tg * t;
      data[i+2] = b * (1 - t) + tb * t;
    }
    ctx.putImageData(imgData, 0, 0);
    return;
  }

  if (effectId === 'distort-pixelate') {
    const size = Math.max(2, Math.round(t * 20));
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    for (let y = 0; y < height; y += size) {
      for (let x = 0; x < width; x += size) {
        const cx = Math.min(width - 1, x + Math.floor(size / 2));
        const cy = Math.min(height - 1, y + Math.floor(size / 2));
        const centerIdx = (cy * width + cx) * 4;
        const r = data[centerIdx];
        const g = data[centerIdx + 1];
        const b = data[centerIdx + 2];
        const a = data[centerIdx + 3];

        for (let dy = 0; dy < size && y + dy < height; dy++) {
          for (let dx = 0; dx < size && x + dx < width; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = a;
          }
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return;
  }

  if (effectId === 'distort-fisheye') {
    const imgData = ctx.getImageData(0, 0, width, height);
    const output = ctx.createImageData(width, height);
    const cx = width / 2;
    const cy = height / 2;
    const strength = t * 0.7;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const nx = (x - cx) / cx;
        const ny = (y - cy) / cy;
        const r = Math.sqrt(nx * nx + ny * ny);

        let dr = r;
        if (strength > 0) {
          dr = r + strength * r * r * r;
        }

        const scale = dr / (r || 1);
        const sourceNx = nx * scale;
        const sourceNy = ny * scale;

        const sourceX = Math.round(sourceNx * cx + cx);
        const sourceY = Math.round(sourceNy * cy + cy);

        const destIdx = (y * width + x) * 4;

        if (sourceX >= 0 && sourceX < width && sourceY >= 0 && sourceY < height) {
          const srcIdx = (sourceY * width + sourceX) * 4;
          output.data[destIdx] = imgData.data[srcIdx];
          output.data[destIdx + 1] = imgData.data[srcIdx + 1];
          output.data[destIdx + 2] = imgData.data[srcIdx + 2];
          output.data[destIdx + 3] = imgData.data[srcIdx + 3];
        } else {
          output.data[destIdx + 3] = 0;
        }
      }
    }
    ctx.putImageData(output, 0, 0);
    return;
  }

  if (effectId === 'color-duotone') {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    
    // Cyan: R=6, G=182, B=212
    // Magenta: R=217, G=70, B=239
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i+1];
      const b = data[i+2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      const ratio = l / 255;

      const dr = Math.round(6 * (1 - ratio) + 217 * ratio);
      const dg = Math.round(182 * (1 - ratio) + 70 * ratio);
      const db = Math.round(212 * (1 - ratio) + 239 * ratio);

      data[i] = Math.round(r * (1 - t) + dr * t);
      data[i+1] = Math.round(g * (1 - t) + dg * t);
      data[i+2] = Math.round(b * (1 - t) + db * t);
    }
    ctx.putImageData(imgData, 0, 0);
    return;
  }

  if (effectId === 'distort-lens-flare') {
    const gradient = ctx.createLinearGradient(0, height / 2, width, height / 2);
    gradient.addColorStop(0, 'rgba(56, 189, 248, 0)');
    gradient.addColorStop(0.3, 'rgba(56, 189, 248, 0.05)');
    gradient.addColorStop(0.5, `rgba(255, 255, 255, ${t * 0.85})`);
    gradient.addColorStop(0.7, 'rgba(56, 189, 248, 0.05)');
    gradient.addColorStop(1, 'rgba(56, 189, 248, 0)');
    
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = gradient;
    ctx.fillRect(0, height / 2 - height * 0.04 * t, width, height * 0.08 * t);
    
    const radial = ctx.createRadialGradient(
      width / 2, height / 2, 0,
      width / 2, height / 2, width * 0.1 * t
    );
    radial.addColorStop(0, `rgba(255, 255, 255, ${t * 0.9})`);
    radial.addColorStop(0.5, `rgba(56, 189, 248, ${t * 0.4})`);
    radial.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = radial;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, width * 0.1 * t, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
}
