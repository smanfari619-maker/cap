/**
 * Transitions Registry
 * Defines all available transitions with Canvas 2D rendering logic.
 * Uses a smoothstep easing function for professional-quality motion.
 */

export interface TransitionDef {
  id: string;
  name: string;
  category: 'Basic' | 'Wipe' | 'Push' | 'Zoom' | 'Glitch' | 'Light';
  description: string;
  /** Preview gradient colors for the sidebar card [from, to] */
  previewColors: [string, string];
}

export const TRANSITIONS_REGISTRY: Record<string, TransitionDef> = {
  // ── Basic ────────────────────────────────────────────────────────
  'fade': {
    id: 'fade',
    name: 'Cross Fade',
    category: 'Basic',
    description: 'Dissolve between clips.',
    previewColors: ['#667eea', '#764ba2'],
  },
  'dip-black': {
    id: 'dip-black',
    name: 'Dip to Black',
    category: 'Basic',
    description: 'Fades out to black then fades in.',
    previewColors: ['#1a1a1a', '#4a4a4a'],
  },
  'dip-white': {
    id: 'dip-white',
    name: 'Dip to White',
    category: 'Basic',
    description: 'Fades out to white then fades in.',
    previewColors: ['#f5f5f5', '#a0a0a0'],
  },

  // ── Wipe ─────────────────────────────────────────────────────────
  'wipe-left': {
    id: 'wipe-left',
    name: 'Wipe Left',
    category: 'Wipe',
    description: 'New clip wipes in from left.',
    previewColors: ['#43e97b', '#38f9d7'],
  },
  'wipe-right': {
    id: 'wipe-right',
    name: 'Wipe Right',
    category: 'Wipe',
    description: 'New clip wipes in from right.',
    previewColors: ['#fa709a', '#fee140'],
  },
  'wipe-up': {
    id: 'wipe-up',
    name: 'Wipe Up',
    category: 'Wipe',
    description: 'New clip wipes in from top.',
    previewColors: ['#a18cd1', '#fbc2eb'],
  },
  'wipe-down': {
    id: 'wipe-down',
    name: 'Wipe Down',
    category: 'Wipe',
    description: 'New clip wipes in from bottom.',
    previewColors: ['#fddb92', '#d1fdff'],
  },

  // ── Push ─────────────────────────────────────────────────────────
  'slide-left': {
    id: 'slide-left',
    name: 'Slide Left',
    category: 'Push',
    description: 'New clip pushes in from right.',
    previewColors: ['#4facfe', '#00f2fe'],
  },
  'slide-right': {
    id: 'slide-right',
    name: 'Slide Right',
    category: 'Push',
    description: 'New clip pushes in from left.',
    previewColors: ['#43e97b', '#38f9d7'],
  },
  'slide-up': {
    id: 'slide-up',
    name: 'Slide Up',
    category: 'Push',
    description: 'New clip pushes in from below.',
    previewColors: ['#f093fb', '#f5576c'],
  },
  'slide-down': {
    id: 'slide-down',
    name: 'Slide Down',
    category: 'Push',
    description: 'New clip pushes in from above.',
    previewColors: ['#4481eb', '#04befe'],
  },

  // ── Zoom ─────────────────────────────────────────────────────────
  'zoom': {
    id: 'zoom',
    name: 'Zoom In',
    category: 'Zoom',
    description: 'New clip scales in from center.',
    previewColors: ['#96fbc4', '#f9f586'],
  },
  'zoom-out': {
    id: 'zoom-out',
    name: 'Zoom Out',
    category: 'Zoom',
    description: 'Incoming clip shrinks from oversized.',
    previewColors: ['#fccb90', '#d57eeb'],
  },
  'cross-zoom': {
    id: 'cross-zoom',
    name: 'Cross Zoom',
    category: 'Zoom',
    description: 'Outgoing zooms in while incoming zooms out.',
    previewColors: ['#a1c4fd', '#c2e9fb'],
  },

  // ── Glitch ───────────────────────────────────────────────────────
  'glitch': {
    id: 'glitch',
    name: 'RGB Glitch',
    category: 'Glitch',
    description: 'Chromatic aberration with digital glitch artifacts.',
    previewColors: ['#f6d365', '#fda085'],
  },

  // ── Light ────────────────────────────────────────────────────────
  'flash': {
    id: 'flash',
    name: 'Flash',
    category: 'Light',
    description: 'Quick white flash between clips.',
    previewColors: ['#ffffff', '#e0e0e0'],
  },
  'light-leak': {
    id: 'light-leak',
    name: 'Film Light Leak',
    category: 'Light',
    description: 'Warm film light leak flare sweep.',
    previewColors: ['#fb923c', '#ef4444'],
  },
  'slide-fade-left': {
    id: 'slide-fade-left',
    name: 'Slide Fade',
    category: 'Push',
    description: 'Smooth slide coupled with a gradual opacity fade.',
    previewColors: ['#818cf8', '#c084fc'],
  },
  'zoom-rotate': {
    id: 'zoom-rotate',
    name: 'Zoom Spin',
    category: 'Zoom',
    description: 'Dynamic zoom rotation spin transition.',
    previewColors: ['#ec4899', '#f43f5e'],
  },
};

export const TRANSITION_CATEGORIES = ['Basic', 'Wipe', 'Push', 'Zoom', 'Glitch', 'Light'] as const;

/**
 * Get eased progress based on transition easing option.
 */
export function getEasingProgress(p: number, easing?: string): number {
  const t = Math.max(0, Math.min(1, p));
  switch (easing) {
    case 'linear':
      return t;
    case 'ease-in':
      return t * t * t; // cubic ease-in
    case 'ease-out':
      return 1 - Math.pow(1 - t, 3); // cubic ease-out
    case 'ease-in-out':
    default:
      return t * t * (3 - 2 * t); // smoothstep (cubic ease-in-out)
  }
}

export function smoothstep(p: number): number {
  return getEasingProgress(p, 'ease-in-out');
}

/**
 * Apply a transition to the canvas context.
 * Call this before drawing the clip to set up the transform/alpha.
 *
 * @param ctx      - Main 2D canvas context (already translated to clip center)
 * @param transId  - Transition ID from TRANSITIONS_REGISTRY
 * @param rawP     - Raw linear progress 0.0–1.0
 * @param width    - Canvas width
 * @param height   - Canvas height
 * @param timeMs   - Current playhead time in ms (for animated transitions)
 * @param isOutgoing - True if applying to the outgoing clip, False if incoming
 * @param easing   - Easing curve name
 */
export function applyTransitionTransform(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  transId: string,
  rawP: number,
  width: number,
  height: number,
  timeMs: number,
  isOutgoing: boolean,
  easing?: string
): void {
  const p = getEasingProgress(rawP, easing); // eased progress

  switch (transId) {
    case 'fade':
      ctx.globalAlpha *= isOutgoing ? 1 - p : p;
      break;

    case 'dip-black':
    case 'dip-white': {
      if (isOutgoing) {
        ctx.globalAlpha *= p < 0.5 ? 1 - p * 2 : 0;
      } else {
        ctx.globalAlpha *= p < 0.5 ? 0 : (p - 0.5) * 2;
      }
      break;
    }

    case 'slide-left':
      if (isOutgoing) {
        ctx.translate(-width * p, 0);
      } else {
        ctx.translate(width * (1 - p), 0);
      }
      break;

    case 'slide-right':
      if (isOutgoing) {
        ctx.translate(width * p, 0);
      } else {
        ctx.translate(-width * (1 - p), 0);
      }
      break;

    case 'slide-up':
      if (isOutgoing) {
        ctx.translate(0, -height * p);
      } else {
        ctx.translate(0, height * (1 - p));
      }
      break;

    case 'slide-down':
      if (isOutgoing) {
        ctx.translate(0, height * p);
      } else {
        ctx.translate(0, -height * (1 - p));
      }
      break;

    case 'slide-fade-left':
      if (isOutgoing) {
        ctx.translate(-width * 0.4 * p, 0);
        ctx.globalAlpha *= 1 - p;
      } else {
        ctx.translate(width * 0.4 * (1 - p), 0);
        ctx.globalAlpha *= p;
      }
      break;

    case 'wipe-left':
    case 'wipe-right':
    case 'wipe-up':
    case 'wipe-down':
      break;

    case 'zoom': {
      if (isOutgoing) {
        const s = 1.0 - p * 0.15;
        ctx.scale(s, s);
        ctx.globalAlpha *= 1 - p;
      } else {
        const s = 0.35 + p * 0.65;
        ctx.scale(s, s);
        ctx.globalAlpha *= p;
      }
      break;
    }

    case 'zoom-out': {
      if (isOutgoing) {
        const s = 1.0 - p * 0.3;
        ctx.scale(s, s);
        ctx.globalAlpha *= 1 - p;
      } else {
        const s = 1.45 - p * 0.45;
        ctx.scale(s, s);
        ctx.globalAlpha *= p;
      }
      break;
    }

    case 'cross-zoom': {
      if (isOutgoing) {
        const s = 1.0 + p * 0.5;
        ctx.scale(s, s);
        ctx.globalAlpha *= 1 - p;
      } else {
        const s = 0.7 + p * 0.3;
        ctx.scale(s, s);
        ctx.globalAlpha *= p;
      }
      break;
    }

    case 'zoom-rotate': {
      if (isOutgoing) {
        const s = 1.0 + p * 0.5;
        ctx.scale(s, s);
        ctx.rotate(p * Math.PI * 0.25);
        ctx.globalAlpha *= 1 - p;
      } else {
        const s = 0.5 + p * 0.5;
        ctx.scale(s, s);
        ctx.rotate((1 - p) * -Math.PI * 0.25);
        ctx.globalAlpha *= p;
      }
      break;
    }

    case 'glitch': {
      const glitchAmp = Math.sin(timeMs * 0.08) * (isOutgoing ? p : 1 - p) * 18;
      ctx.translate(glitchAmp, 0);
      ctx.globalAlpha *= isOutgoing ? 1 - p : p;
      break;
    }

    case 'flash':
    case 'light-leak': {
      ctx.globalAlpha *= isOutgoing ? 1 - p : p;
      break;
    }

    default:
      ctx.globalAlpha *= isOutgoing ? 1 - p : p;
      break;
  }
}

/**
 * Draw the dip-overlay (black or white rect) for dip transitions.
 * Call this AFTER clearing the canvas, BEFORE drawing the clips.
 */
export function drawTransitionOverlay(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  transId: string,
  rawP: number,
  width: number,
  height: number,
  x?: number,
  y?: number,
  w?: number,
  h?: number,
  easing?: string
): void {
  const p = getEasingProgress(rawP, easing);
  const renderX = x !== undefined ? x : 0;
  const renderY = y !== undefined ? y : 0;
  const renderW = w !== undefined ? w : width;
  const renderH = h !== undefined ? h : height;

  if (transId === 'dip-black') {
    const alpha = p < 0.5 ? 1 - p * 2 : (p - 0.5) * 2 > 1 ? 0 : 0;
    // Outgoing fade-to-black overlay (alpha goes 0→1 on first half when prev is drawn)
    const overlayAlpha = p < 0.5 ? p * 2 : 1 - (p - 0.5) * 2;
    ctx.fillStyle = `rgba(0,0,0,${overlayAlpha.toFixed(3)})`;
    ctx.fillRect(renderX, renderY, renderW, renderH);
    void alpha; // suppress unused warning
  }
  if (transId === 'dip-white') {
    const overlayAlpha = p < 0.5 ? p * 2 : 1 - (p - 0.5) * 2;
    ctx.fillStyle = `rgba(255,255,255,${overlayAlpha.toFixed(3)})`;
    ctx.fillRect(renderX, renderY, renderW, renderH);
  }
  if (transId === 'flash') {
    const flashAlpha = Math.max(0, 1 - p * 3);
    ctx.fillStyle = `rgba(255,255,255,${flashAlpha.toFixed(3)})`;
    ctx.fillRect(renderX, renderY, renderW, renderH);
  }
  if (transId === 'light-leak') {
    const intensity = 1 - Math.abs(p - 0.5) * 2;
    if (intensity > 0) {
      const gradient = ctx.createRadialGradient(
        renderX + renderW * 0.7, renderY + renderH * 0.3, 0,
        renderX + renderW * 0.7, renderY + renderH * 0.3, renderW * 0.8
      );
      gradient.addColorStop(0, `rgba(251, 146, 60, ${intensity * 0.95})`);
      gradient.addColorStop(0.4, `rgba(239, 68, 68, ${intensity * 0.55})`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = gradient;
      ctx.fillRect(renderX, renderY, renderW, renderH);
      ctx.restore();
    }
  }
}

/**
 * Apply a clipping region for wipe transitions.
 * Call this in a save/restore block before drawing the incoming clip.
 */
export function applyWipeClip(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  transId: string,
  rawP: number,
  width: number,
  height: number,
  easing?: string
): boolean {
  const p = getEasingProgress(rawP, easing);
  ctx.beginPath();
  switch (transId) {
    case 'wipe-left':
      ctx.rect(0, 0, width * p, height);
      break;
    case 'wipe-right':
      ctx.rect(width * (1 - p), 0, width * p, height);
      break;
    case 'wipe-up':
      ctx.rect(0, 0, width, height * p);
      break;
    case 'wipe-down':
      ctx.rect(0, height * (1 - p), width, height * p);
      break;
    default:
      return false; // not a wipe transition
  }
  ctx.clip();
  return true;
}
