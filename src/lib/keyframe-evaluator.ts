import { type Keyframe } from './db';

export function evaluateKeyframe(
  keyframes: Keyframe[] | undefined,
  timeMs: number,
  defaultValue: number
): number {
  if (!keyframes || keyframes.length === 0) return defaultValue;

  // Sort keyframes chronologically
  const sorted = [...keyframes].sort((a, b) => a.timeMs - b.timeMs);

  // Before first keyframe
  if (timeMs <= sorted[0].timeMs) return sorted[0].value;

  // After last keyframe
  if (timeMs >= sorted[sorted.length - 1].timeMs) {
    return sorted[sorted.length - 1].value;
  }

  // Find segment boundaries
  let prev = sorted[0];
  let next = sorted[0];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (timeMs >= sorted[i].timeMs && timeMs <= sorted[i + 1].timeMs) {
      prev = sorted[i];
      next = sorted[i + 1];
      break;
    }
  }

  const range = next.timeMs - prev.timeMs;
  if (range === 0) return prev.value;
  const t = (timeMs - prev.timeMs) / range;

  // Apply easing curve
  const easing = prev.easing || 'linear';
  let progress = t;
  
  if (easing === 'ease-in') {
    progress = t * t * t;
  } else if (easing === 'ease-out') {
    const f = t - 1;
    progress = f * f * f + 1;
  } else if (easing === 'ease-in-out') {
    progress = t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
  }

  // Interpolate linearly between boundary values
  return prev.value + (next.value - prev.value) * progress;
}
