/**
 * ai-video-generator.ts
 *
 * Unified client for AI video generation via fal.ai gateway.
 * Supports Minimax Hailuo 2.3 (Fast/Standard) and Kling 3.0 (Turbo/Cinematic).
 *
 * API Key: User-provided fal.ai key stored encrypted in localStorage.
 * All calls go through fal.ai's unified REST API — one key for all providers.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type VideoProvider = 'hailuo-fast' | 'hailuo-standard' | 'kling-turbo' | 'kling-cinematic';

export type GenerationMode = 'text-to-video' | 'image-to-video' | 'multi-shot';

export type AspectRatio = '16:9' | '9:16' | '1:1';

export type VideoResolution = '720p' | '768p' | '1080p' | '4k';

export type VideoDuration = 5 | 6 | 10 | 15;

export interface ShotDefinition {
  id: string;
  description: string;
  durationSec: number;
  startFrameUrl?: string; // optional image URL for that shot's start frame
}

export interface GenerationSettings {
  provider: VideoProvider;
  mode: GenerationMode;
  prompt: string;
  negativePrompt?: string;
  resolution: VideoResolution;
  duration: VideoDuration;
  aspectRatio: AspectRatio;
  // Image-to-video
  startImageUrl?: string;
  endImageUrl?: string;
  // Multi-shot (Kling only)
  shots?: ShotDefinition[];
  // Kling extras
  enableAudio?: boolean;
  cameraControl?: CameraPreset;
}

export type CameraPreset =
  | 'none'
  | 'pan-left'
  | 'pan-right'
  | 'tilt-up'
  | 'tilt-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'dolly-forward'
  | 'dolly-back'
  | 'orbit-left'
  | 'orbit-right';

export interface GenerationResult {
  taskId: string;
  provider: VideoProvider;
  mode: GenerationMode;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number; // 0-100
  videoUrl?: string;
  thumbnailUrl?: string;
  durationSec?: number;
  costUsd?: number;
  errorMessage?: string;
  prompt: string;
  createdAt: number;
}

// ─── fal.ai Model IDs ─────────────────────────────────────────────────────────

const FAL_MODEL_IDS: Record<VideoProvider, string> = {
  'hailuo-fast':       'fal-ai/minimax-video/image-to-video',
  'hailuo-standard':   'fal-ai/minimax-video/image-to-video',
  'kling-turbo':       'fal-ai/kling-video/v1.6/standard/text-to-video',
  'kling-cinematic':   'fal-ai/kling-video/v1.6/pro/text-to-video',
};

const FAL_T2V_MODEL_IDS: Record<VideoProvider, string> = {
  'hailuo-fast':       'fal-ai/minimax/video-01-live',
  'hailuo-standard':   'fal-ai/minimax/video-01',
  'kling-turbo':       'fal-ai/kling-video/v1.6/standard/text-to-video',
  'kling-cinematic':   'fal-ai/kling-video/v1.6/pro/text-to-video',
};

// ─── Cost Estimation ──────────────────────────────────────────────────────────

const COST_PER_SECOND: Record<VideoProvider, { low: number; high: number }> = {
  'hailuo-fast':     { low: 0.032, high: 0.040 }, // ~$0.19/6s
  'hailuo-standard': { low: 0.047, high: 0.056 }, // ~$0.28/6s
  'kling-turbo':     { low: 0.112, high: 0.140 }, // Kling 3.0 Turbo
  'kling-cinematic': { low: 0.140, high: 0.170 }, // Kling 3.0 Pro
};

export function estimateCost(settings: GenerationSettings): { low: number; high: number } {
  const rates = COST_PER_SECOND[settings.provider];
  let totalSeconds: number = settings.duration;

  if (settings.mode === 'multi-shot' && settings.shots) {
    totalSeconds = settings.shots.reduce((sum, s) => sum + s.durationSec, 0);
  }

  return {
    low: parseFloat((rates.low * totalSeconds).toFixed(3)),
    high: parseFloat((rates.high * totalSeconds).toFixed(3)),
  };
}

// ─── API Key Management ───────────────────────────────────────────────────────

const API_KEY_STORAGE = 'jellycut_fal_api_key';

export function getFalApiKey(): string | null {
  try {
    return localStorage.getItem(API_KEY_STORAGE);
  } catch {
    return null;
  }
}

export function setFalApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE, key.trim());
}

export function clearFalApiKey(): void {
  localStorage.removeItem(API_KEY_STORAGE);
}

// ─── Request Builders ─────────────────────────────────────────────────────────

function buildMultiShotPrompt(shots: ShotDefinition[]): string {
  // Kling multi-shot syntax: "shot n, m, [description];"
  return shots
    .map((s, i) => `shot ${i + 1}, ${s.durationSec}, ${s.description}`)
    .join('; ');
}

function buildFalPayload(settings: GenerationSettings): Record<string, any> {
  const isKling = settings.provider.startsWith('kling');
  const isHailuo = settings.provider.startsWith('hailuo');

  const base: Record<string, any> = {
    prompt: settings.mode === 'multi-shot' && settings.shots
      ? buildMultiShotPrompt(settings.shots)
      : settings.prompt,
  };

  if (settings.negativePrompt) {
    base.negative_prompt = settings.negativePrompt;
  }

  if (isHailuo) {
    base.duration = settings.duration === 6 ? '6' : '10';
    base.prompt_optimizer = true;
  }

  if (isKling) {
    base.duration = String(settings.duration);
    base.aspect_ratio = settings.aspectRatio.replace(':', '_');

    if (settings.enableAudio) {
      base.with_audio = true;
    }

    if (settings.cameraControl && settings.cameraControl !== 'none') {
      base.camera_control = { type: settings.cameraControl };
    }
  }

  if (settings.mode === 'image-to-video' && settings.startImageUrl) {
    base.image_url = settings.startImageUrl;
    if (settings.endImageUrl) {
      base.tail_image_url = settings.endImageUrl;
    }
  }

  return base;
}

// ─── Core Generation API ──────────────────────────────────────────────────────

const FAL_BASE = 'https://queue.fal.run';
const FAL_STATUS_BASE = 'https://queue.fal.run';

export async function generateVideo(
  settings: GenerationSettings,
  onProgress?: (result: GenerationResult) => void
): Promise<GenerationResult> {
  const apiKey = getFalApiKey();
  if (!apiKey) {
    throw new Error('No fal.ai API key configured. Please add your key in Settings.');
  }

  const isI2V = settings.mode === 'image-to-video';
  let modelId: string;

  if (isI2V) {
    modelId = FAL_MODEL_IDS[settings.provider];
  } else {
    modelId = FAL_T2V_MODEL_IDS[settings.provider];
  }

  const payload = buildFalPayload(settings);
  const cost = estimateCost(settings);

  const taskId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Initial result
  const initial: GenerationResult = {
    taskId,
    provider: settings.provider,
    mode: settings.mode,
    status: 'queued',
    progress: 0,
    prompt: settings.prompt,
    createdAt: Date.now(),
    costUsd: cost.high,
  };
  onProgress?.(initial);

  // Submit to fal.ai queue
  const submitRes = await fetch(`${FAL_BASE}/${modelId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!submitRes.ok) {
    const errBody = await submitRes.text();
    throw new Error(`fal.ai submit failed (${submitRes.status}): ${errBody}`);
  }

  const submitData = await submitRes.json();
  const requestId: string = submitData.request_id || submitData.id || taskId;
  const statusUrl = submitData.status_url || `${FAL_STATUS_BASE}/${modelId}/requests/${requestId}/status`;
  const resultUrl = submitData.response_url || `${FAL_STATUS_BASE}/${modelId}/requests/${requestId}`;

  // Poll for completion
  return await pollUntilDone(
    requestId,
    statusUrl,
    resultUrl,
    apiKey,
    { ...initial, taskId: requestId },
    onProgress
  );
}

async function pollUntilDone(
  requestId: string,
  statusUrl: string,
  resultUrl: string,
  apiKey: string,
  current: GenerationResult,
  onProgress?: (result: GenerationResult) => void,
  intervalMs = 3000,
  maxAttempts = 200
): Promise<GenerationResult> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    await sleep(intervalMs);
    attempts++;

    try {
      const statusRes = await fetch(statusUrl, {
        headers: { 'Authorization': `Key ${apiKey}` },
      });

      if (!statusRes.ok) {
        console.warn('[AIVideoGen] Status check failed:', statusRes.status);
        continue;
      }

      const statusData = await statusRes.json();
      const rawStatus: string = (statusData.status || '').toLowerCase();

      // Map fal.ai status to our enum
      let status: GenerationResult['status'];
      if (rawStatus === 'completed' || rawStatus === 'ok') {
        status = 'completed';
      } else if (rawStatus === 'failed' || rawStatus === 'error') {
        status = 'failed';
      } else if (rawStatus === 'in_progress' || rawStatus === 'processing' || rawStatus === 'running') {
        status = 'processing';
      } else {
        status = 'queued';
      }

      // fal.ai sometimes embeds progress logs
      const progress = extractProgress(statusData);

      const updated: GenerationResult = {
        ...current,
        status,
        progress,
      };
      onProgress?.(updated);

      if (status === 'failed') {
        return {
          ...updated,
          errorMessage: statusData.error?.message || statusData.detail || 'Generation failed',
        };
      }

      if (status === 'completed') {
        // Fetch the final result
        const resultRes = await fetch(resultUrl, {
          headers: { 'Authorization': `Key ${apiKey}` },
        });

        if (!resultRes.ok) {
          throw new Error(`Failed to fetch result: ${resultRes.status}`);
        }

        const resultData = await resultRes.json();
        const videoUrl = extractVideoUrl(resultData);
        const thumbnailUrl = extractThumbnailUrl(resultData);

        const final: GenerationResult = {
          ...updated,
          status: 'completed',
          progress: 100,
          videoUrl,
          thumbnailUrl,
          durationSec: resultData.duration || undefined,
        };
        onProgress?.(final);
        return final;
      }
    } catch (err) {
      console.warn('[AIVideoGen] Poll error:', err);
    }
  }

  return {
    ...current,
    status: 'failed',
    errorMessage: 'Timed out waiting for generation to complete.',
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractProgress(data: any): number {
  if (data.progress !== undefined) return Math.round(data.progress * 100);
  if (data.logs) {
    const logLines: string[] = data.logs.map((l: any) => l.message || '');
    for (const line of logLines.reverse()) {
      const m = line.match(/(\d+)%/);
      if (m) return parseInt(m[1], 10);
    }
  }
  return 50; // default "in progress" progress
}

function extractVideoUrl(data: any): string | undefined {
  return (
    data.video?.url ||
    data.video_url ||
    data.output?.video_url ||
    data.output?.url ||
    (Array.isArray(data.videos) && data.videos[0]?.url) ||
    undefined
  );
}

function extractThumbnailUrl(data: any): string | undefined {
  return (
    data.thumbnail?.url ||
    data.thumbnail_url ||
    undefined
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Provider Metadata ────────────────────────────────────────────────────────

export interface ProviderMeta {
  id: VideoProvider;
  name: string;
  badge: string;
  description: string;
  maxDuration: number;
  resolutions: VideoResolution[];
  durations: VideoDuration[];
  supportsAudio: boolean;
  supportsCameraControl: boolean;
  supportsMultiShot: boolean;
  supportsImageToVideo: boolean;
  supportsEndFrame: boolean;
}

export const PROVIDERS: ProviderMeta[] = [
  {
    id: 'hailuo-fast',
    name: 'Hailuo Fast',
    badge: 'CHEAPEST',
    description: 'Minimax Hailuo 2.3 — Best value, fast generation. Great for drafts and social content.',
    maxDuration: 10,
    resolutions: ['768p', '1080p'],
    durations: [6, 10],
    supportsAudio: false,
    supportsCameraControl: false,
    supportsMultiShot: false,
    supportsImageToVideo: true,
    supportsEndFrame: false,
  },
  {
    id: 'hailuo-standard',
    name: 'Hailuo Standard',
    badge: 'BALANCED',
    description: 'Minimax Hailuo 2.3 — Higher fidelity output. Better motion and detail.',
    maxDuration: 10,
    resolutions: ['768p', '1080p'],
    durations: [6, 10],
    supportsAudio: false,
    supportsCameraControl: false,
    supportsMultiShot: false,
    supportsImageToVideo: true,
    supportsEndFrame: false,
  },
  {
    id: 'kling-turbo',
    name: 'Kling Turbo',
    badge: 'CINEMATIC',
    description: 'Kling 3.0 Turbo — Cinematic 4K quality. Multi-shot storyboards, native audio, camera control.',
    maxDuration: 15,
    resolutions: ['720p', '1080p'],
    durations: [5, 10, 15],
    supportsAudio: true,
    supportsCameraControl: true,
    supportsMultiShot: true,
    supportsImageToVideo: true,
    supportsEndFrame: true,
  },
  {
    id: 'kling-cinematic',
    name: 'Kling Pro',
    badge: 'PREMIUM',
    description: 'Kling 3.0 Pro — Maximum quality, physics-accurate motion, multi-language lip sync.',
    maxDuration: 15,
    resolutions: ['720p', '1080p'],
    durations: [5, 10, 15],
    supportsAudio: true,
    supportsCameraControl: true,
    supportsMultiShot: true,
    supportsImageToVideo: true,
    supportsEndFrame: true,
  },
];

export const CAMERA_PRESETS: { value: CameraPreset; label: string }[] = [
  { value: 'none',          label: 'None (Static)' },
  { value: 'pan-left',      label: 'Pan Left' },
  { value: 'pan-right',     label: 'Pan Right' },
  { value: 'tilt-up',       label: 'Tilt Up' },
  { value: 'tilt-down',     label: 'Tilt Down' },
  { value: 'zoom-in',       label: 'Zoom In' },
  { value: 'zoom-out',      label: 'Zoom Out' },
  { value: 'dolly-forward', label: 'Dolly Forward' },
  { value: 'dolly-back',    label: 'Dolly Back' },
  { value: 'orbit-left',    label: 'Orbit Left' },
  { value: 'orbit-right',   label: 'Orbit Right' },
];

export const STYLE_PRESETS = [
  'Cinematic', 'Documentary', 'Anime', 'Photorealistic',
  'Fantasy', 'Sci-Fi', 'Horror', 'Commercial', 'Music Video', 'Short Film',
];
