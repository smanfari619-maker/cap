/**
 * config.ts — All tuneable constants in one place.
 * Change these without touching any other file.
 */
export const CFG = {
  // Radius for Telea boundary propagation inpainter (default = 5)
  INPAINT_RADIUS: 5,

  // Encoder settings (30 Mbps for high-fidelity quality preservation)
  ENCODER_BITRATE_BPS: 30_000_000,
  AUDIO_BITRATE_BPS:      128_000,
  AUDIO_FRAME_SIZE:         1_024,

  // WebCodecs back-pressure: max decoded frames held in memory
  DECODE_QUEUE_LIMIT: 12,
  DECODE_TIMEOUT_MS:   8_000,

  // Yield to the main thread every N frames (keeps UI responsive)
  YIELD_EVERY_N_FRAMES: 20,
} as const;
