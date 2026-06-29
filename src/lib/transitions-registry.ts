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
};

export const TRANSITION_CATEGORIES = ['Basic', 'Wipe', 'Push', 'Zoom', 'Glitch', 'Light'] as const;

/**
 * Smooth easing function (cubic smoothstep).
 * Converts linear progress 0–1 to smooth 0–1.
 */
export function smoothstep(p: number): number {
  const t = Math.max(0, Math.min(1, p));
  return t * t * (3 - 2 * t);
}

/**
 * Apply a transition to the canvas context for the incoming clip.
 * The previous clip's frame should already be drawn on the canvas.
 * Call this before drawing the current clip to set up the transform/alpha.
 *
 * @param ctx      - Main 2D canvas context (already translated to clip center)
 * @param transId  - Transition ID from TRANSITIONS_REGISTRY
 * @param rawP     - Raw linear progress 0.0–1.0
 * @param width    - Canvas width
 * @param height   - Canvas height
 * @param timeMs   - Current playhead time in ms (for animated transitions)
 */
export function applyTransitionTransform(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  transId: string,
  rawP: number,
  width: number,
  height: number,
  timeMs: number
): void {
  const p = smoothstep(rawP); // eased progress

  switch (transId) {
    case 'fade':
      ctx.globalAlpha = p;
      break;

    case 'dip-black':
    case 'dip-white': {
      // First half: fade out (handled by caller drawing a fill rect)
      // Second half: fade in the new clip
      ctx.globalAlpha = p < 0.5 ? 0 : (p - 0.5) * 2;
      break;
    }

    case 'slide-left':
      ctx.translate(width * (1 - p), 0);
      break;

    case 'slide-right':
      ctx.translate(-width * (1 - p), 0);
      break;

    case 'slide-up':
      ctx.translate(0, height * (1 - p));
      break;

    case 'slide-down':
      ctx.translate(0, -height * (1 - p));
      break;

    case 'wipe-left':
    case 'wipe-right':
    case 'wipe-up':
    case 'wipe-down':
      // Clip region — reveal the incoming clip progressively
      // Applied via clipPath before the incoming clip is drawn
      break;

    case 'zoom': {
      const s = 0.3 + p * 0.7; // scale from 0.3 to 1.0
      ctx.scale(s, s);
      ctx.globalAlpha = p;
      break;
    }

    case 'zoom-out': {
      const s = 1.4 - p * 0.4; // scale from 1.4 to 1.0
      ctx.scale(s, s);
      ctx.globalAlpha = p;
      break;
    }

    case 'cross-zoom': {
      // Incoming zooms from 1.5 to 1.0, fades in
      const s = 1.5 - p * 0.5;
      ctx.scale(s, s);
      ctx.globalAlpha = p;
      break;
    }

    case 'glitch': {
      // Jitter and alpha
      const glitchAmp = Math.sin(timeMs * 0.05) * (1 - p) * 20;
      ctx.translate(glitchAmp, 0);
      ctx.globalAlpha = p;
      break;
    }

    case 'flash': {
      ctx.globalAlpha = p;
      break;
    }

    default:
      ctx.globalAlpha = p;
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
  height: number
): void {
  const p = smoothstep(rawP);

  if (transId === 'dip-black') {
    const alpha = p < 0.5 ? 1 - p * 2 : (p - 0.5) * 2 > 1 ? 0 : 0;
    // Outgoing fade-to-black overlay (alpha goes 0→1 on first half when prev is drawn)
    const overlayAlpha = p < 0.5 ? p * 2 : 1 - (p - 0.5) * 2;
    ctx.fillStyle = `rgba(0,0,0,${overlayAlpha.toFixed(3)})`;
    ctx.fillRect(0, 0, width, height);
    void alpha; // suppress unused warning
  }
  if (transId === 'dip-white') {
    const overlayAlpha = p < 0.5 ? p * 2 : 1 - (p - 0.5) * 2;
    ctx.fillStyle = `rgba(255,255,255,${overlayAlpha.toFixed(3)})`;
    ctx.fillRect(0, 0, width, height);
  }
  if (transId === 'flash') {
    // White flash strongest at p=0, gone at p=1
    const flashAlpha = Math.max(0, 1 - p * 3);
    ctx.fillStyle = `rgba(255,255,255,${flashAlpha.toFixed(3)})`;
    ctx.fillRect(0, 0, width, height);
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
  height: number
): boolean {
  const p = smoothstep(rawP);
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
