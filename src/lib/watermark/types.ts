/**
 * types.ts — Shared interfaces used across the watermark module.
 */

export interface WatermarkRegionPx {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RemovalStatus =
  | { stage: 'idle' }
  | { stage: 'loading' }
  | { stage: 'processing'; progress: number }
  | { stage: 'done'; newAssetId: string }
  | { stage: 'error'; message: string };

/** Raw demuxed video data from mp4box. */
export interface DemuxedVideo {
  codec      : string;
  width      : number;
  height     : number;
  description: Uint8Array | undefined;
  samples    : any[];
}
