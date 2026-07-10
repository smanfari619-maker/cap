import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { db, type Project, type TimelineClip } from './db';
import { getFileFromOPFS } from './opfs';
import { mixAudioTracks } from './audio-mixer';
import { evaluateKeyframe } from './keyframe-evaluator';
import { parseCubeLUT, applyLut3D, type Lut3D } from './lut-solver';
import { initUpscaler, upscaleFrame, isUpscalerReady } from './upscaler';
import { applyTransitionTransform, drawTransitionOverlay, applyWipeClip } from './transitions-registry';
import { buildEffectFilterString, applyCanvasEffect } from './effects-registry';
import { getSubjectFaceCenter } from './face-tracker';
import { createFile, DataStream, Endianness } from 'mp4box';

export interface ExportSettings {
  width: number;
  height: number;
  fps: number;
  bitrate: number; // in bps (e.g. 8000000 for 8Mbps)
  upscaleMode?: 'standard' | 'enhanced' | 'ai'; // upscaling mode
  onUpscaleProgress?: (stage: string, percent: number) => void;
}

// ─── Video Demuxer & Decoder Helper for Hardware-Accelerated Export ─────────
interface DemuxedVideo {
  codec: string;
  width: number;
  height: number;
  description?: Uint8Array;
  samples: any[];
}

function demuxMP4(arrayBuffer: ArrayBuffer): Promise<DemuxedVideo> {
  return new Promise((resolve, reject) => {
    const mp4file = createFile();
    let videoTrack: any = null;
    const videoSamples: any[] = [];

    mp4file.onError = (e) => {
      reject(new Error(`mp4box demuxing error: ${e}`));
    };

    mp4file.onReady = (info) => {
      videoTrack = info.tracks.find((t: any) => t.video);
      if (!videoTrack) {
        reject(new Error('No video track found in source MP4 file.'));
        return;
      }
      mp4file.setExtractionOptions(videoTrack.id, null, { nbSamples: videoTrack.nb_samples });
      mp4file.start();
    };

    mp4file.onSamples = (trackId, _ref, samples) => {
      if (trackId === videoTrack.id) {
        videoSamples.push(...samples);
      }
    };

    try {
      const buf = arrayBuffer as any;
      buf.fileStart = 0;
      mp4file.appendBuffer(buf);
      mp4file.flush();
    } catch (err) {
      reject(err);
      return;
    }

    setTimeout(() => {
      if (videoTrack && videoSamples.length > 0) {
        let description: Uint8Array | undefined;
        try {
          const track = mp4file.getTrackById(videoTrack.id);
          const entry = track.mdia.minf.stbl.stsd.entries[0] as any;
          const box =
            entry.avcC ||
            entry.hvcC ||
            entry.vpcC ||
            entry.av1C ||
            (entry.boxes &&
              entry.boxes.find(
                (b: any) =>
                  b.type === 'avcC' ||
                  b.type === 'hvcC' ||
                  b.type === 'vpcC' ||
                  b.type === 'av1C'
              ));

          if (box) {
            const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
            box.write(stream);
            description = new Uint8Array(stream.buffer, 8);
          }
        } catch (err) {
          console.warn('[Exporter Decoder] Failed to extract codec description:', err);
        }

        resolve({
          codec: videoTrack.codec,
          width: videoTrack.video_width,
          height: videoTrack.video_height,
          description,
          samples: videoSamples
        });
      } else {
        reject(new Error('No video samples extracted.'));
      }
    }, 50);
  });
}

class VideoDecoderReader {
  private demuxed: DemuxedVideo | null = null;
  private decoder: VideoDecoder | null = null;
  private frameQueue: VideoFrame[] = [];
  private nextSampleIndex = 0;
  private arrayBuffer: ArrayBuffer;
  private isInitialized = false;
  private decodeError: Error | null = null;
  private frameResolver: (() => void) | null = null;

  constructor(arrayBuffer: ArrayBuffer) {
    this.arrayBuffer = arrayBuffer;
  }

  async init(startTimeSec = 0) {
    if (this.isInitialized) return;
    this.demuxed = await demuxMP4(this.arrayBuffer);

    this.decoder = new VideoDecoder({
      output: (frame) => {
        this.frameQueue.push(frame);
        if (this.frameResolver) {
          const res = this.frameResolver;
          this.frameResolver = null;
          res();
        }
      },
      error: (e) => {
        console.error('[VideoDecoderReader] Decoder error:', e);
        this.decodeError = e;
      }
    });

    this.decoder.configure({
      codec: this.demuxed.codec,
      codedWidth: this.demuxed.width,
      codedHeight: this.demuxed.height,
      description: this.demuxed.description
    });

    // Seek to the nearest keyframe preceding the target start time
    const targetUs = startTimeSec * 1_000_000;
    let syncIndex = 0;

    for (let i = 0; i < this.demuxed.samples.length; i++) {
      const sample = this.demuxed.samples[i];
      const sampleUs = (sample.cts * 1_000_000) / sample.timescale;
      if (sample.is_sync) {
        if (sampleUs <= targetUs) {
          syncIndex = i;
        } else {
          break;
        }
      }
    }

    this.nextSampleIndex = syncIndex;
    this.isInitialized = true;
  }

  async getFrameAt(timeSec: number): Promise<VideoFrame | null> {
    if (!this.isInitialized) await this.init(timeSec);
    if (!this.demuxed || !this.decoder) return null;

    const timeUs = timeSec * 1_000_000;

    while (true) {
      if (this.decodeError) throw this.decodeError;

      // 1. Drain frames that are too old
      if (this.frameQueue.length > 0) {
        if (this.frameQueue.length > 1 && this.frameQueue[1].timestamp <= timeUs) {
          const oldFrame = this.frameQueue.shift()!;
          oldFrame.close();
          continue;
        }

        try {
          return this.frameQueue[0].clone();
        } catch (err) {
          this.frameQueue.shift();
          continue;
        }
      }

      // 2. Decode next sample if available
      if (this.nextSampleIndex >= this.demuxed.samples.length) {
        if (this.decoder.state === 'configured') {
          await this.decoder.flush();
        }
        if (this.frameQueue.length === 0) return null;
        continue;
      }

      const sample = this.demuxed.samples[this.nextSampleIndex++];
      const chunk = new EncodedVideoChunk({
        type: sample.is_sync ? 'key' : 'delta',
        timestamp: (sample.cts * 1_000_000) / sample.timescale,
        duration: (sample.duration * 1_000_000) / sample.timescale,
        data: sample.data
      });

      this.decoder.decode(chunk);

      if (this.frameQueue.length === 0) {
        await new Promise<void>((resolve, reject) => {
          this.frameResolver = resolve;
          setTimeout(() => reject(new Error('Video decoder read timeout')), 1000);
        }).catch((err) => {
          throw err;
        });
      }
    }
  }

  close() {
    this.frameQueue.forEach((f) => f.close());
    this.frameQueue = [];
    if (this.decoder && this.decoder.state !== 'closed') {
      try {
        this.decoder.close();
      } catch { /* ignore */ }
    }
  }
}

// ─── Main Exporter Function ──────────────────────────────────────────────────
export async function exportProjectWebCodecs(
  project: Project,
  settings: ExportSettings,
  onProgress: (percent: number) => void,
  isCancelled: () => boolean = () => false
): Promise<Blob> {
  const { width, height, fps, bitrate } = settings;
  let { upscaleMode } = settings;
  const isUpscaling = upscaleMode === 'ai' || upscaleMode === 'enhanced';
  let renderWidth = isUpscaling ? Math.round(width / 2) : width;
  let renderHeight = isUpscaling ? Math.round(height / 2) : height;

  if (isUpscaling && !isUpscalerReady()) {
    try {
      await initUpscaler(settings.onUpscaleProgress);
      settings.onUpscaleProgress?.('', 0);
    } catch (err) {
      console.warn('[Exporter] WebGL Upscaler initialization failed, falling back to standard full-res mode:', err);
      upscaleMode = 'standard';
      renderWidth = width;
      renderHeight = height;
    }
  }
  onProgress(5);
  const audioBuffer = await mixAudioTracks(project, 44100);
  onProgress(15);

  let durationMs = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      const endMs = clip.positionMs + clip.durationMs;
      if (endMs > durationMs) durationMs = endMs;
    }
  }
  if (durationMs === 0) durationMs = 5000;

  const totalFrames = Math.ceil((durationMs / 1000) * fps);
  const smoothedRefX: Record<string, number> = {};

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width,
      height
    },
    audio: audioBuffer ? {
      codec: 'aac',
      numberOfChannels: 2,
      sampleRate: 44100
    } : undefined,
    fastStart: 'in-memory'
  });

  let encodeError: Error | null = null;

  const videoEncoder = new VideoEncoder({
    output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
    error: (e) => {
      console.error('Video Encoder Error:', e);
      encodeError = e;
    }
  });

  const codec = (width > 1920 || height > 1080) ? 'avc1.640033' : 'avc1.64002a';
  videoEncoder.configure({
    codec,
    width,
    height,
    bitrate,
    framerate: fps,
    bitrateMode: 'variable',
    hardwareAcceleration: 'prefer-hardware'
  });

  let audioEncoder: AudioEncoder | null = null;
  if (audioBuffer) {
    audioEncoder = new AudioEncoder({
      output: (chunk, metadata) => muxer.addAudioChunk(chunk, metadata),
      error: (e) => {
        console.error('Audio Encoder Error:', e);
        encodeError = e;
      }
    });

    audioEncoder.configure({
      codec: 'mp4a.40.2',
      numberOfChannels: 2,
      sampleRate: audioBuffer.sampleRate,
      bitrate: 128000
    });
  }

  // 4. Preload visual and audio assets
  const videoElements = new Map<string, HTMLVideoElement>();
  const imageElements = new Map<string, HTMLImageElement>();
  const videoReaders = new Map<string, VideoDecoderReader>();

  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.type === 'video' && clip.assetId) {
        // Pre-create high performance WebCodecs Reader
        if (!videoReaders.has(clip.id)) {
          try {
            const asset = await db.assets.get(clip.assetId);
            if (asset) {
              const file = await getFileFromOPFS(asset.opfsPath);
              const arrayBuffer = await file.arrayBuffer();
              const reader = new VideoDecoderReader(arrayBuffer);
              await reader.init(clip.trimStartMs / 1000);
              videoReaders.set(clip.id, reader);
              console.log(`[Exporter] Initialized hardware reader for clip: ${clip.id}`);
            }
          } catch (err) {
            console.warn(`[Exporter] Failed to initialize hardware reader for clip ${clip.id}, will use seek fallback:`, err);
          }
        }

        // Preload seek-based HTMLVideoElement fallback
        if (!videoElements.has(clip.assetId)) {
          try {
            const asset = await db.assets.get(clip.assetId);
            if (asset) {
              const file = await getFileFromOPFS(asset.opfsPath);
              const url = URL.createObjectURL(file);
              const video = document.createElement('video');
              video.src = url;
              video.muted = true;
              video.playsInline = true;
              video.preload = 'auto';
              await new Promise((resolve) => {
                video.onloadedmetadata = resolve;
              });
              videoElements.set(clip.assetId, video);
            }
          } catch (err) {
            console.warn(`[Exporter] Failed to preload fallback video element:`, err);
          }
        }
      } else if (clip.type === 'image' && clip.assetId && !imageElements.has(clip.assetId)) {
        try {
          const asset = await db.assets.get(clip.assetId);
          if (asset) {
            const file = await getFileFromOPFS(asset.opfsPath);
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.src = url;
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
            });
            imageElements.set(clip.assetId, img);
          }
        } catch (err) {
          console.warn(`Failed to preload image asset for export:`, err);
        }
      }
    }
  }

  // 5. Setup rendering canvas
  const canvas = document.createElement('canvas');
  canvas.width = renderWidth;
  canvas.height = renderHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas 2d context');

  const offscreen = document.createElement('canvas');
  offscreen.width = renderWidth;
  offscreen.height = renderHeight;
  const offCtx = offscreen.getContext('2d');

  const blendModeMap: Record<string, string> = {
    normal: 'source-over',
    multiply: 'multiply',
    screen: 'screen',
    overlay: 'overlay',
    darken: 'darken',
    lighten: 'lighten',
    'color-dodge': 'color-dodge',
    'color-burn': 'color-burn',
    'soft-light': 'soft-light',
    'hard-light': 'hard-light'
  };

  const effectFilterCanvas = document.createElement('canvas');
  effectFilterCanvas.width = renderWidth;
  effectFilterCanvas.height = renderHeight;

  const effectVideoCanvas = document.createElement('canvas');
  effectVideoCanvas.width = renderWidth;
  effectVideoCanvas.height = renderHeight;

  let enhancedCanvas: HTMLCanvasElement | null = null;
  let enhancedCtx: CanvasRenderingContext2D | null = null;

  const cleanupOnExit = () => {
    try { if (videoEncoder.state !== 'closed') videoEncoder.close(); } catch { /* ignore */ }
    try { if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close(); } catch { /* ignore */ }
    videoElements.forEach((video) => { URL.revokeObjectURL(video.src); video.remove(); });
    imageElements.forEach((img) => { URL.revokeObjectURL(img.src); });
    videoReaders.forEach((reader) => {
      try {
        reader.close();
      } catch { /* ignore */ }
    });
  };

  // 6. Draw and Encode video frame by frame
  try {
    for (let f = 0; f < totalFrames; f++) {
      if (isCancelled()) {
        cleanupOnExit();
        throw new Error('Export cancelled');
      }
      if (encodeError) throw encodeError;
      const timeMs = (f / fps) * 1000;

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, renderWidth, renderHeight);

      const activeVisualClips: { clip: TimelineClip; trackHidden: boolean; type: 'video' | 'image' }[] = [];
      const activeTextClips: { clip: TimelineClip; trackHidden: boolean }[] = [];

      for (let i = project.tracks.length - 1; i >= 0; i--) {
        const track = project.tracks[i];
        const activeClips = track.clips.filter(c => timeMs >= c.positionMs && timeMs < c.positionMs + c.durationMs);
        for (const clip of activeClips) {
          if (track.type === 'video' || (track.type as string) === 'image') {
            if (clip.type === 'video') activeVisualClips.push({ clip, trackHidden: !!track.hidden, type: 'video' });
            if (clip.type === 'image') activeVisualClips.push({ clip, trackHidden: !!track.hidden, type: 'image' });
          }
          if (track.type === 'text') activeTextClips.push({ clip, trackHidden: !!track.hidden });
        }
      }

      for (const { clip, trackHidden, type } of activeVisualClips) {
        if (trackHidden) continue;
        if (type === 'video') {
          const speed = clip.speed || 1.0;
          const offset = timeMs - clip.positionMs;
          const sourceTime = (clip.trimStartMs + offset * speed) / 1000;

          // Attempt WebCodecs frame decode
          let frameToDraw: VideoFrame | null = null;
          const reader = videoReaders.get(clip.id);
          if (reader) {
            try {
              frameToDraw = await reader.getFrameAt(sourceTime);
            } catch (err) {
              console.warn(`[Exporter] Hardware decode failed for clip ${clip.id}, falling back:`, err);
            }
          }

          const fallbackVideo = clip.assetId ? videoElements.get(clip.assetId) : null;
          if (!frameToDraw && fallbackVideo) {
            fallbackVideo.currentTime = sourceTime;
            await new Promise((resolve) => {
              fallbackVideo.onseeked = resolve;
            });
          }

          const srcWidth = frameToDraw ? frameToDraw.displayWidth : (fallbackVideo ? fallbackVideo.videoWidth : renderWidth);
          const srcHeight = frameToDraw ? frameToDraw.displayHeight : (fallbackVideo ? fallbackVideo.videoHeight : renderHeight);
          const srcRatio = srcWidth / (srcHeight || 1);
          const destRatio = renderWidth / renderHeight;

          let opacity = 1.0;
          const fadeIn = clip.fadeInMs || 0;
          const fadeOut = clip.fadeOutMs || 0;

          const activeTrans = clip.transitionIn
            ? { type: clip.transitionIn.type, durationMs: clip.transitionIn.durationMs }
            : clip.transitionType && clip.transitionType !== 'none'
              ? { type: clip.transitionType, durationMs: fadeIn }
              : null;
          const hasTransition = !!activeTrans && offset < (activeTrans.durationMs || fadeIn);
          const transProgress = hasTransition ? offset / (activeTrans!.durationMs || fadeIn) : 1;

          if (hasTransition) {
            opacity = 1.0;
          } else if (offset < fadeIn && fadeIn > 0) {
            opacity = offset / fadeIn;
          } else if (offset > clip.durationMs - fadeOut && fadeOut > 0) {
            opacity = (clip.positionMs + clip.durationMs - timeMs) / fadeOut;
          }

          const keyframeOpacity = evaluateKeyframe(clip.keyframes?.opacity, offset, 100) / 100;
          opacity = opacity * keyframeOpacity;

          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(opacity, 1.0));

          if (hasTransition && activeTrans) {
            drawTransitionOverlay(ctx as CanvasRenderingContext2D, activeTrans.type, transProgress, renderWidth, renderHeight);
          }

          if (hasTransition) {
            let prevClip: TimelineClip | null = null;
            const track = project.tracks.find(t => t.clips.some(c => c.id === clip.id));
            if (track) {
              const sortedClips = [...track.clips].sort((a, b) => a.positionMs - b.positionMs);
              const idx = sortedClips.findIndex(c => c.id === clip.id);
              if (idx > 0) prevClip = sortedClips[idx - 1];
            }
            if (prevClip) {
              const prevTime = prevClip.trimEndMs / 1000;
              let prevFrameToDraw: VideoFrame | null = null;
              const prevReader = videoReaders.get(prevClip.id);
              if (prevReader) {
                try {
                  prevFrameToDraw = await prevReader.getFrameAt(prevTime);
                } catch (err) {
                  console.warn(`[Exporter] Transition preceding frame decode failed:`, err);
                }
              }

              const prevVideo = prevClip.assetId ? videoElements.get(prevClip.assetId) : null;
              if (!prevFrameToDraw && prevVideo) {
                prevVideo.currentTime = prevTime;
                await new Promise((resolve) => {
                  prevVideo.onseeked = resolve;
                });
              }

              const pWidth = prevFrameToDraw ? prevFrameToDraw.displayWidth : (prevVideo ? prevVideo.videoWidth : renderWidth);
              const pHeight = prevFrameToDraw ? prevFrameToDraw.displayHeight : (prevVideo ? prevVideo.videoHeight : renderHeight);
              const prevSrcRatio = pWidth / (pHeight || 1);
              const prevDestRatio = renderWidth / renderHeight;

              let pdWidth = renderWidth;
              let pdHeight = renderHeight;
              let pdx = 0;
              let pdy = 0;

              if (prevSrcRatio > prevDestRatio) {
                pdHeight = renderWidth / prevSrcRatio;
                pdy = (renderHeight - pdHeight) / 2;
              } else {
                pdWidth = renderHeight * prevSrcRatio;
                pdx = (renderWidth - pdWidth) / 2;
              }

              ctx.save();
              ctx.drawImage(prevFrameToDraw || prevVideo!, pdx, pdy, pdWidth, pdHeight);
              ctx.restore();

              if (prevFrameToDraw) {
                prevFrameToDraw.close();
              }
            }
          }

          let filterString = '';
          if (clip.colorAdjustments) {
            const { brightness, contrast, saturation } = clip.colorAdjustments;
            filterString += `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) `;
          }
          if (clip.filterSettings && clip.filterSettings.type !== 'none') {
            const { type, intensity } = clip.filterSettings;
            if (type === 'sunset') {
              filterString += `saturate(${100 + intensity * 0.4}%) brightness(${100 + intensity * 0.05}%) sepia(${intensity * 0.3}%) hue-rotate(${-intensity * 0.1}deg) contrast(${100 + intensity * 0.05}%) `;
            } else if (type === 'nordic') {
              filterString += `hue-rotate(${185 * intensity / 100}deg) saturate(${100 - intensity * 0.25}%) contrast(${100 + intensity * 0.1}%) brightness(${100 - intensity * 0.05}%) `;
            } else if (type === 'neon') {
              filterString += `hue-rotate(${280 * intensity / 100}deg) saturate(${100 + intensity * 0.4}%) contrast(${100 + intensity * 0.15}%) `;
            } else if (type === 'emerald') {
              filterString += `hue-rotate(${85 * intensity / 100}deg) saturate(${100 - intensity * 0.15}%) contrast(${100 - intensity * 0.05}%) sepia(${intensity * 0.2}%) `;
            } else if (type === 'fade') {
              filterString += `contrast(${100 - intensity * 0.25}%) saturate(${100 - intensity * 0.15}%) brightness(${100 + intensity * 0.1}%) sepia(${intensity * 0.1}%) `;
            } else if (type === 'drama') {
              filterString += `contrast(${100 + intensity * 0.35}%) saturate(${100 - intensity * 0.4}%) brightness(${100 - intensity * 0.1}%) `;
            } else if (type === 'bw') {
              filterString += `grayscale(${intensity}%) `;
            } else if (type === 'sepia') {
              filterString += `sepia(${intensity}%) `;
            } else if (type === 'vintage') {
              filterString += `sepia(${intensity * 0.4}%) hue-rotate(30deg) contrast(${100 - intensity * 0.2}%) `;
            } else if (type === 'warm') {
              filterString += `sepia(${intensity * 0.3}%) saturate(${100 + intensity * 0.2}%) `;
            } else if (type === 'cool') {
              filterString += `hue-rotate(190deg) saturate(${100 + intensity * 0.1}%) `;
            } else if (type === 'cyberpunk') {
              filterString += `hue-rotate(300deg) contrast(1.1) saturate(${100 + intensity * 0.5}%) `;
            } else if (type === 'cinematic') {
              filterString += `contrast(${100 + intensity * 0.2}%) saturate(${100 - intensity * 0.1}%) `;
            } else if (type === 'pastel') {
              filterString += `sepia(${intensity * 0.25}%) saturate(${100 + intensity * 0.3}%) hue-rotate(-15deg) contrast(${100 - intensity * 0.05}%) `;
            } else if (type === 'forest') {
              filterString += `hue-rotate(60deg) saturate(${100 + intensity * 0.1}%) contrast(${100 + intensity * 0.15}%) `;
            } else if (type === 'polaroid') {
              filterString += `contrast(${100 - intensity * 0.15}%) saturate(${100 - intensity * 0.15}%) sepia(${intensity * 0.15}%) brightness(${100 + intensity * 0.05}%) `;
            } else if (type === 'vaporwave') {
              filterString += `hue-rotate(270deg) saturate(${100 + intensity * 0.6}%) contrast(${100 + intensity * 0.1}%) `;
            }
          }
          if (clip.videoEffects) {
            for (const eff of clip.videoEffects) {
              const effFilter = buildEffectFilterString(eff.id, eff.intensity);
              if (effFilter) filterString += effFilter + ' ';
            }
          }

          ctx.filter = filterString.trim() || 'none';

          const blend = clip.transform?.blendMode || 'normal';
          ctx.globalCompositeOperation = (blendModeMap[blend] || 'source-over') as GlobalCompositeOperation;

          const cx = renderWidth / 2;
          const cy = renderHeight / 2;

          const tx = evaluateKeyframe(clip.keyframes?.x, offset, clip.transform?.x || 0);
          const ty = evaluateKeyframe(clip.keyframes?.y, offset, clip.transform?.y || 0);
          const tRotation = evaluateKeyframe(clip.keyframes?.rotation, offset, clip.transform?.rotation || 0);
          const rawScale = evaluateKeyframe(clip.keyframes?.scale, offset, clip.transform?.scale !== undefined ? clip.transform.scale : 100);
          const tScale = rawScale / 100;

          ctx.save();

          const isWipe = hasTransition && activeTrans && ['wipe-left','wipe-right','wipe-up','wipe-down'].includes(activeTrans.type);
          if (isWipe && activeTrans) {
            ctx.save();
            applyWipeClip(ctx as CanvasRenderingContext2D, activeTrans.type, transProgress, renderWidth, renderHeight);
          }

          ctx.translate(cx + tx, cy + ty);

          if (hasTransition && activeTrans && !isWipe) {
            applyTransitionTransform(
              ctx as CanvasRenderingContext2D,
              activeTrans.type,
              transProgress,
              renderWidth,
              renderHeight,
              timeMs,
              false,
              (activeTrans as any).easing
            );
          }

          if (tRotation !== 0) ctx.rotate((tRotation * Math.PI) / 180);
          if (tScale !== 1) ctx.scale(tScale, tScale);

          let dWidth = renderWidth;
          let dHeight = renderHeight;
          let dx = 0;
          let dy = 0;

          const drawSource = frameToDraw || fallbackVideo!;

          if (offCtx) {
            offCtx.filter = filterString.trim() || 'none';

            if (clip.smartReframe && clip.smartReframe.enabled) {
              const scale = Math.max(renderWidth / srcWidth, renderHeight / srcHeight);
              dWidth = srcWidth * scale;
              dHeight = srcHeight * scale;

              const frameNum = Math.floor((timeMs / 1000) * fps);
              if (frameNum % 10 === 0 || smoothedRefX[clip.id] === undefined) {
                offCtx.drawImage(drawSource, 0, 0, renderWidth, renderHeight);
                const rawX = getSubjectFaceCenter(offCtx, renderWidth, renderHeight);
                const smoothing = (clip.smartReframe.smoothing ?? 20) / 100;
                const prevX = smoothedRefX[clip.id] !== undefined ? smoothedRefX[clip.id] : 0.5;
                smoothedRefX[clip.id] = prevX * (1 - smoothing) + rawX * smoothing;
              }

              const faceX = smoothedRefX[clip.id] !== undefined ? smoothedRefX[clip.id] : 0.5;
              dx = (renderWidth / 2) - (faceX * dWidth);
              dx = Math.max(renderWidth - dWidth, Math.min(0, dx));
              dy = (renderHeight - dHeight) / 2;

              offCtx.clearRect(0, 0, renderWidth, renderHeight);
            } else {
              if (srcRatio > destRatio) {
                dHeight = renderWidth / srcRatio;
                dy = (renderHeight - dHeight) / 2;
              } else {
                dWidth = renderHeight * srcRatio;
                dx = (renderWidth - dWidth) / 2;
              }
            }

            // Fill letterbox "dead space" areas by drawing a blurred background of the same color pixels
            if (dx > 0 || dy > 0) {
              let cWidth = renderWidth;
              let cHeight = renderHeight;
              let cX = 0;
              let cY = 0;
              if (srcRatio > destRatio) {
                cWidth = renderHeight * srcRatio;
                cX = (renderWidth - cWidth) / 2;
              } else {
                cHeight = renderWidth / srcRatio;
                cY = (renderHeight - cHeight) / 2;
              }
              offCtx.save();
              offCtx.filter = 'blur(40px) brightness(0.65)';
              offCtx.drawImage(drawSource, cX, cY, cWidth, cHeight);
              offCtx.restore();
              offCtx.filter = filterString.trim() || 'none';
            }

            offCtx.drawImage(drawSource, dx, dy, dWidth, dHeight);
            offCtx.filter = 'none';

            if (clip.videoEffects) {
              for (const eff of clip.videoEffects) {
                applyCanvasEffect(
                  offCtx as CanvasRenderingContext2D,
                  eff.id,
                  eff.intensity,
                  renderWidth,
                  renderHeight,
                  timeMs
                );
              }
            }

            if (clip.chromaKey && clip.chromaKey.enabled) {
              const imgData = offCtx.getImageData(0, 0, renderWidth, renderHeight);
              const data = imgData.data;
              const targetHex = clip.chromaKey.color || '#00ff00';
              const rTarget = parseInt(targetHex.slice(1, 3), 16);
              const gTarget = parseInt(targetHex.slice(3, 5), 16);
              const bTarget = parseInt(targetHex.slice(5, 7), 16);
              const tolerance = clip.chromaKey.tolerance || 30;
              const feather = clip.chromaKey.feather || 10;

              for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i+1];
                const b = data[i+2];
                const dist = Math.sqrt((r - rTarget)**2 + (g - gTarget)**2 + (b - bTarget)**2);
                if (dist < tolerance) {
                  data[i+3] = 0;
                } else if (dist < tolerance + feather) {
                  const ratio = (dist - tolerance) / feather;
                  data[i+3] = Math.min(data[i+3], ratio * 255);
                }
              }
              offCtx.putImageData(imgData, 0, 0);
            }

            if (clip.aiBackgroundRemoval && clip.aiBackgroundRemoval.enabled) {
              const faceX = smoothedRefX[clip.id] !== undefined ? smoothedRefX[clip.id] : 0.5;
              const mode = clip.aiBackgroundRemoval.mode || 'remove';

              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = renderWidth;
              tempCanvas.height = renderHeight;
              const tempCtx = tempCanvas.getContext('2d')!;
              tempCtx.drawImage(offscreen, 0, 0);

              if (mode === 'blur') {
                offCtx.save();
                const radius = clip.aiBackgroundRemoval.blurRadius || 10;
                offCtx.filter = `blur(${radius}px)`;
                offCtx.drawImage(tempCanvas, 0, 0);
                offCtx.restore();
              } else {
                offCtx.clearRect(0, 0, renderWidth, renderHeight);
              }

              tempCtx.save();
              tempCtx.globalCompositeOperation = 'destination-in';

              const grad = tempCtx.createRadialGradient(
                faceX * renderWidth, renderHeight * 0.45, renderHeight * 0.15,
                faceX * renderWidth, renderHeight * 0.5, renderHeight * 0.5
              );
              grad.addColorStop(0, 'rgba(0,0,0,1)');
              grad.addColorStop(0.65, 'rgba(0,0,0,0.85)');
              grad.addColorStop(1, 'rgba(0,0,0,0)');

              tempCtx.fillStyle = grad;
              tempCtx.fillRect(0, 0, renderWidth, renderHeight);
              tempCtx.restore();

              offCtx.drawImage(tempCanvas, 0, 0);
            }

            if (clip.hslAdjustments) {
              const hShift = clip.hslAdjustments.hue || 0;
              const sShift = clip.hslAdjustments.saturation || 0;
              const lShift = clip.hslAdjustments.lightness || 0;

              if (hShift !== 0 || sShift !== 0 || lShift !== 0) {
                const imgData = offCtx.getImageData(0, 0, renderWidth, renderHeight);
                const data = imgData.data;
                for (let i = 0; i < data.length; i += 4) {
                  if (data[i+3] === 0) continue;
                  let r = data[i] / 255;
                  let g = data[i+1] / 255;
                  let b = data[i+2] / 255;
                  const max = Math.max(r, g, b), min = Math.min(r, g, b);
                  let h = 0, s = 0, l = (max + min) / 2;

                  if (max !== min) {
                    const d = max - min;
                    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                    switch (max) {
                      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                      case g: h = (b - r) / d + 2; break;
                      case b: h = (r - g) / d + 4; break;
                    }
                    h /= 6;
                  }

                  h = (h * 360 + hShift + 360) % 360 / 360;
                  s = Math.max(0, Math.min(1, s + sShift / 100));
                  l = Math.max(0, Math.min(1, l + lShift / 100));

                  let rNew = l, gNew = l, bNew = l;
                  if (s !== 0) {
                    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                    const p = 2 * l - q;
                    const hue2rgb = (t: number) => {
                      if (t < 0) t += 1;
                      if (t > 1) t -= 1;
                      if (t < 1/6) return p + (q - p) * 6 * t;
                      if (t < 1/2) return q;
                      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                      return p;
                    };
                    rNew = hue2rgb(h + 1/3);
                    gNew = hue2rgb(h);
                    bNew = hue2rgb(h - 1/3);
                  }

                  data[i] = Math.round(rNew * 255);
                  data[i+1] = Math.round(gNew * 255);
                  data[i+2] = Math.round(bNew * 255);
                }
                offCtx.putImageData(imgData, 0, 0);
              }
            }

            let lutEntry: Lut3D | null = null;
            const lutText = clip.colorCorrection?.lutContent;
            if (lutText) {
              const parsed = parseCubeLUT(lutText);
              if (parsed) lutEntry = parsed;
            }

            const lift = clip.colorCorrection?.lift || { r: 0, g: 0, b: 0 };
            const gamma = clip.colorCorrection?.gamma || { r: 0, g: 0, b: 0 };
            const gain = clip.colorCorrection?.gain || { r: 0, g: 0, b: 0 };
            const hasLGG = lift.r !== 0 || lift.g !== 0 || lift.b !== 0 ||
                           gamma.r !== 0 || gamma.g !== 0 || gamma.b !== 0 ||
                           gain.r !== 0 || gain.g !== 0 || gain.b !== 0;

            if (lutEntry || hasLGG) {
              const imgData = offCtx.getImageData(0, 0, renderWidth, renderHeight);
              const data = imgData.data;
              for (let i = 0; i < data.length; i += 4) {
                if (data[i+3] === 0) continue;
                let r = data[i] / 255;
                let g = data[i+1] / 255;
                let b = data[i+2] / 255;

                if (lutEntry) {
                  const res = applyLut3D(r, g, b, lutEntry.table, lutEntry.size);
                  r = res.r; g = res.g; b = res.b;
                }
                if (hasLGG) {
                  r = r + (lift.r / 100) * (1 - r);
                  g = g + (lift.g / 100) * (1 - g);
                  b = b + (lift.b / 100) * (1 - b);
                  r = Math.max(0, Math.min(1, r + Math.sin(r * Math.PI) * (gamma.r / 100)));
                  g = Math.max(0, Math.min(1, g + Math.sin(g * Math.PI) * (gamma.g / 100)));
                  b = Math.max(0, Math.min(1, b + Math.sin(b * Math.PI) * (gamma.b / 100)));
                  r = r * (1 + gain.r / 100);
                  g = g * (1 + gain.g / 100);
                  b = b * (1 + gain.b / 100);
                }
                data[i] = Math.round(Math.max(0, Math.min(1, r)) * 255);
                data[i+1] = Math.round(Math.max(0, Math.min(1, g)) * 255);
                data[i+2] = Math.round(Math.max(0, Math.min(1, b)) * 255);
              }
              offCtx.putImageData(imgData, 0, 0);
            }

            ctx.drawImage(offscreen, -cx, -cy, renderWidth, renderHeight);
          } else {
            ctx.drawImage(drawSource, -cx, -cy, renderWidth, renderHeight);
          }

          if (isWipe) ctx.restore();

          if (clip.colorAdjustments && clip.colorAdjustments.temp !== 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'color';
            const tempVal = clip.colorAdjustments.temp;
            ctx.fillStyle = tempVal > 0 
              ? `rgba(255, 140, 0, ${Math.abs(tempVal) / 250})` 
              : `rgba(0, 191, 255, ${Math.abs(tempVal) / 250})`;
            ctx.fillRect(-cx, -cy, renderWidth, renderHeight);
            ctx.restore();
          }
          if (clip.colorAdjustments && clip.colorAdjustments.vignette > 0) {
            const strength = clip.colorAdjustments.vignette / 100;
            ctx.save();
            const gradient = ctx.createRadialGradient(0, 0, renderHeight * 0.3, 0, 0, renderWidth * 0.8);
            gradient.addColorStop(0, 'rgba(0,0,0,0)');
            gradient.addColorStop(1, `rgba(0,0,0,${strength * 0.85})`);
            ctx.fillStyle = gradient;
            ctx.fillRect(-cx, -cy, renderWidth, renderHeight);
            ctx.restore();
          }

          ctx.restore();
          ctx.globalCompositeOperation = 'source-over';
          ctx.restore();

          // Safely release the decoded VideoFrame structure
          if (frameToDraw) {
            frameToDraw.close();
          }
        } else if (type === 'image') {
        const isShape = !!clip.shapeSettings;
        const img = clip.assetId ? imageElements.get(clip.assetId) : null;
        if (img || isShape) {
          let opacity = 1.0;
          const offset = timeMs - clip.positionMs;
          const fadeIn = clip.fadeInMs || 0;
          const fadeOut = clip.fadeOutMs || 0;
          if (offset < fadeIn && fadeIn > 0) {
            opacity = offset / fadeIn;
          } else if (offset > clip.durationMs - fadeOut && fadeOut > 0) {
            opacity = (clip.positionMs + clip.durationMs - timeMs) / fadeOut;
          }
          const keyframeOpacity = evaluateKeyframe(clip.keyframes?.opacity, offset, 100) / 100;
          opacity = opacity * keyframeOpacity;

          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(opacity, 1.0));

          const tScale = (clip.transform?.scale ?? 100) / 100;
          const tX = clip.transform?.x ?? 0;
          const tY = clip.transform?.y ?? 0;
          const tRotation = clip.transform?.rotation ?? 0;

          const blend = clip.transform?.blendMode || 'normal';
          ctx.globalCompositeOperation = (blendModeMap[blend] || 'source-over') as GlobalCompositeOperation;

          const cx = renderWidth / 2 + tX;
          const cy = renderHeight / 2 + tY;

          ctx.save();
          ctx.translate(cx, cy);
          if (tRotation !== 0) ctx.rotate((tRotation * Math.PI) / 180);
          if (tScale !== 1) ctx.scale(tScale, tScale);

          if (isShape && clip.shapeSettings) {
            ctx.fillStyle = clip.shapeSettings.color || '#3b82f6';
            ctx.strokeStyle = clip.shapeSettings.strokeColor || '#ffffff';
            ctx.lineWidth = clip.shapeSettings.strokeWidth !== undefined ? clip.shapeSettings.strokeWidth : 3;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            const width = clip.shapeSettings.width || 300;
            const height = clip.shapeSettings.height || 300;
            const shapeType = clip.shapeSettings.type;

            const fillVal = clip.shapeSettings.color;
            const strokeVal = clip.shapeSettings.strokeColor;
            const hasFill = fillVal && fillVal !== 'transparent' && fillVal !== 'none';
            const hasStroke = ctx.lineWidth > 0 && strokeVal && strokeVal !== 'transparent' && strokeVal !== 'none';

            ctx.beginPath();
            if (shapeType === 'circle') {
              const rx = Math.max(2, width / 2 - ctx.lineWidth);
              const ry = Math.max(2, height / 2 - ctx.lineWidth);
              ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
            } else if (shapeType === 'rectangle') {
              const strokeOffset = ctx.lineWidth;
              ctx.rect(-width / 2 + strokeOffset, -height / 2 + strokeOffset, Math.max(1, width - strokeOffset * 2), Math.max(1, height - strokeOffset * 2));
            } else if (shapeType === 'triangle') {
              const strokeOffset = ctx.lineWidth;
              ctx.moveTo(0, -height / 2 + strokeOffset);
              ctx.lineTo(-width / 2 + strokeOffset, height / 2 - strokeOffset);
              ctx.lineTo(width / 2 - strokeOffset, height / 2 - strokeOffset);
              ctx.closePath();
            } else if (shapeType === 'arrow') {
              const length = width * 0.95;
              const thickness = height * 0.3;
              ctx.moveTo(-length / 2, -thickness / 2);
              ctx.lineTo(length / 6, -thickness / 2);
              ctx.lineTo(length / 6, -thickness);
              ctx.lineTo(length / 2, 0);
              ctx.lineTo(length / 6, thickness);
              ctx.lineTo(length / 6, thickness / 2);
              ctx.lineTo(-length / 2, thickness / 2);
              ctx.closePath();
            } else if (shapeType === 'star') {
              const spikes = 5;
              const rx = Math.max(2, width / 2 - ctx.lineWidth);
              const ry = Math.max(2, height / 2 - ctx.lineWidth);
              const rxInner = rx / 2;
              const ryInner = ry / 2;
              let rot = Math.PI / 2 * 3;
              const step = Math.PI / spikes;
              ctx.moveTo(0, -ry);
              for (let i = 0; i < spikes; i++) {
                let x = Math.cos(rot) * rx;
                let y = Math.sin(rot) * ry;
                ctx.lineTo(x, y);
                rot += step;
                x = Math.cos(rot) * rxInner;
                y = Math.sin(rot) * ryInner;
                ctx.lineTo(x, y);
                rot += step;
              }
              ctx.lineTo(0, -ry);
              ctx.closePath();
            }

            if (hasFill) {
              ctx.fill();
            }
            if (hasStroke) {
              ctx.stroke();
            }
          } else if (img) {
            const srcRatio = img.naturalWidth / (img.naturalHeight || 1);
            const destRatio = renderWidth / renderHeight;
            let dWidth = renderWidth;
            let dHeight = renderHeight;
            let dx = 0;
            let dy = 0;
            if (srcRatio > destRatio) {
              dHeight = renderWidth / srcRatio;
              dy = (renderHeight - dHeight) / 2;
            } else {
              dWidth = renderHeight * srcRatio;
              dx = (renderWidth - dWidth) / 2;
            }
            ctx.drawImage(img, dx - renderWidth / 2, dy - renderHeight / 2, dWidth, dHeight);
          }
          ctx.restore();
          ctx.globalCompositeOperation = 'source-over';
          ctx.restore();
        }
      }
    }

    for (const { clip, trackHidden } of activeTextClips) {
      if (trackHidden || !clip.textSettings) continue;
      const settings = clip.textSettings;
      ctx.save();
      
      const scaleRatio = renderHeight / 360;
      const fontSize = settings.fontSize * scaleRatio;
      const weight = settings.fontWeight || 'normal';
      const style = settings.fontStyle || 'normal';
      ctx.font = `${style} normal ${weight} ${fontSize}px "${settings.fontFamily || 'Inter'}"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Apply letter-spacing if supported
      if (settings.letterSpacing !== undefined && settings.letterSpacing !== 0) {
        try {
          (ctx as any).letterSpacing = `${settings.letterSpacing * scaleRatio}px`;
        } catch (e) {
          // ignore
        }
      }

      const lines = settings.content.split('\n');
      const lineHeightMultiplier = settings.lineHeight ?? 1.2;
      const lineHeight = fontSize * lineHeightMultiplier;
      
      const xPos = settings.x * renderWidth;
      const yPos = settings.y * renderHeight;

      // Measure layout size
      let maxLineWidth = 0;
      lines.forEach(line => {
        const metrics = ctx.measureText(line);
        if (metrics.width > maxLineWidth) {
          maxLineWidth = metrics.width;
        }
      });

      const totalHeight = lines.length * lineHeight;
      const startY = yPos - (totalHeight / 2) + (lineHeight / 2);

      // 1. Draw Background Box
      if (settings.backgroundColor) {
        ctx.save();
        const padding = (settings.backgroundPadding ?? 8) * scaleRatio;
        const radius = (settings.backgroundBorderRadius ?? 4) * scaleRatio;
        const bgW = maxLineWidth + padding * 2;
        const bgH = totalHeight + padding * 1.5;
        const bgX = xPos - bgW / 2;
        const bgY = yPos - bgH / 2;

        ctx.fillStyle = settings.backgroundColor;
        const alpha = settings.backgroundAlpha !== undefined ? settings.backgroundAlpha / 100 : 0.8;
        ctx.globalAlpha = alpha;

        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(bgX, bgY, bgW, bgH, radius);
        } else {
          ctx.rect(bgX, bgY, bgW, bgH);
        }
        ctx.fill();
        ctx.restore();
      }

      // 2. Configure Drop Shadow
      if (settings.shadowColor) {
        ctx.shadowColor = settings.shadowColor;
        ctx.shadowBlur = (settings.shadowBlur ?? 5) * scaleRatio;
        ctx.shadowOffsetX = (settings.shadowOffsetX ?? 2) * scaleRatio;
        ctx.shadowOffsetY = (settings.shadowOffsetY ?? 2) * scaleRatio;
      }

      // 3. Draw stroke + fill for all lines
      lines.forEach((line, index) => {
        const lineY = startY + index * lineHeight;

        const sWidth = settings.strokeWidth !== undefined ? settings.strokeWidth * scaleRatio : Math.max(2, fontSize * 0.08);
        if (sWidth > 0) {
          ctx.strokeStyle = settings.strokeColor || '#000000';
          ctx.lineWidth = sWidth;
          ctx.lineJoin = 'round';
          ctx.strokeText(line, xPos, lineY);
        }

        ctx.fillStyle = settings.color || '#ffffff';
        ctx.fillText(line, xPos, lineY);
      });

      ctx.restore();
    }

    const effectTracks = project.tracks.filter(t => t.type === 'effect');
    effectTracks.forEach(track => {
      if (track.hidden || track.muted) return;
      track.clips.forEach(clip => {
        const isActive = timeMs >= clip.positionMs && timeMs < clip.positionMs + clip.durationMs;
        if (isActive) {
          if (clip.filterSettings && clip.filterSettings.type !== 'none') {
            const { type, intensity } = clip.filterSettings;
            let filterStr = '';
            if (type === 'bw') {
              filterStr = `grayscale(${intensity}%)`;
            } else if (type === 'sepia') {
              filterStr = `sepia(${intensity}%)`;
            } else if (type === 'vintage') {
              filterStr = `sepia(${intensity * 0.4}%) hue-rotate(30deg) contrast(${100 - intensity * 0.2}%)`;
            } else if (type === 'warm') {
              filterStr = `sepia(${intensity * 0.3}%) saturate(${100 + intensity * 0.2}%)`;
            } else if (type === 'cool') {
              filterStr = `hue-rotate(190deg) saturate(${100 + intensity * 0.1}%)`;
            } else if (type === 'cyberpunk') {
              filterStr = `hue-rotate(300deg) contrast(1.1) saturate(${100 + intensity * 0.5}%)`;
            } else if (type === 'cinematic') {
              filterStr = `contrast(${100 + intensity * 0.2}%) saturate(${100 - intensity * 0.1}%)`;
            } else if (type === 'pastel') {
              filterStr = `sepia(${intensity * 0.25}%) saturate(${100 + intensity * 0.3}%) hue-rotate(-15deg) contrast(${100 - intensity * 0.05}%)`;
            } else if (type === 'forest') {
              filterStr = `hue-rotate(60deg) saturate(${100 + intensity * 0.1}%) contrast(${100 + intensity * 0.15}%)`;
            } else if (type === 'polaroid') {
              filterStr = `contrast(${100 - intensity * 0.15}%) saturate(${100 - intensity * 0.15}%) sepia(${intensity * 0.15}%) brightness(${100 + intensity * 0.05}%)`;
            } else if (type === 'vaporwave') {
              filterStr = `hue-rotate(270deg) saturate(${100 + intensity * 0.6}%) contrast(${100 + intensity * 0.1}%)`;
            }

            if (filterStr) {
              const offCtx = effectFilterCanvas.getContext('2d');
              if (offCtx) {
                offCtx.drawImage(canvas, 0, 0);
                ctx.clearRect(0, 0, renderWidth, renderHeight);
                ctx.save();
                ctx.filter = filterStr;
                ctx.drawImage(effectFilterCanvas, 0, 0);
                ctx.restore();
              }
            }
          }

          if (clip.videoEffects && clip.videoEffects.length > 0) {
            clip.videoEffects.forEach(eff => {
              const offCtx = effectVideoCanvas.getContext('2d');
              if (offCtx) {
                offCtx.drawImage(canvas, 0, 0);
                ctx.clearRect(0, 0, renderWidth, renderHeight);
                
                const filterStr = buildEffectFilterString(eff.id, eff.intensity);
                if (filterStr) {
                  ctx.save();
                  ctx.filter = filterStr;
                  ctx.drawImage(effectVideoCanvas, 0, 0);
                  ctx.restore();
                } else {
                  ctx.drawImage(effectVideoCanvas, 0, 0);
                }
                
                applyCanvasEffect(
                  ctx as CanvasRenderingContext2D,
                  eff.id,
                  eff.intensity,
                  renderWidth,
                  renderHeight,
                  timeMs
                );
              }
            });
          }
        }
      });
    });

    let frameSource: HTMLCanvasElement | OffscreenCanvas = canvas;

    if ((upscaleMode === 'ai' || upscaleMode === 'enhanced') && isUpscalerReady()) {
      try {
        const contrast = upscaleMode === 'enhanced' ? 1.15 : 1.0;
        const saturation = upscaleMode === 'enhanced' ? 1.15 : 1.0;
        frameSource = await upscaleFrame(canvas as HTMLCanvasElement, width, height, contrast, saturation);
      } catch (err) {
        console.warn('[Upscaler] Frame upscale failed, using canvas 2D fallback:', err);
        if (!enhancedCanvas) {
          enhancedCanvas = document.createElement('canvas');
          enhancedCanvas.width = width;
          enhancedCanvas.height = height;
          enhancedCtx = enhancedCanvas.getContext('2d')!;
          enhancedCtx.imageSmoothingEnabled = true;
          enhancedCtx.imageSmoothingQuality = 'high';
        }
        if (upscaleMode === 'enhanced') {
          enhancedCtx!.filter = 'contrast(1.15) saturate(1.15) brightness(1.02)';
        } else {
          enhancedCtx!.filter = 'none';
        }
        enhancedCtx!.clearRect(0, 0, width, height);
        enhancedCtx!.drawImage(canvas, 0, 0, width, height);
        enhancedCtx!.filter = 'none';
        frameSource = enhancedCanvas;
      }
    }

    const frame = new VideoFrame(frameSource as CanvasImageSource, { timestamp: (f * 1000000) / fps });
    try {
      videoEncoder.encode(frame);
    } finally {
      frame.close();
    }

    if (encodeError) throw encodeError;
    const frameProgress = 15 + Math.round((f / totalFrames) * 70);
    onProgress(frameProgress);

    // Yield to the browser event loop less frequently (once per 60 frames / 2 seconds of video)
    // to allow GPU pipelines to run uninterrupted and maximize frame encoding speed.
    if (f % 60 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  } finally {
    cleanupOnExit();
  }

  await videoEncoder.flush();
  if (encodeError) throw encodeError;
  videoEncoder.close();

  if (audioBuffer && audioEncoder) {
    if (encodeError) throw encodeError;
    const channels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;
    const frameSize = 1024;

    for (let offset = 0; offset < length; offset += frameSize) {
      const size = Math.min(frameSize, length - offset);
      const data = new Float32Array(size * channels);
      for (let ch = 0; ch < channels; ch++) {
        const chData = audioBuffer.getChannelData(ch);
        const targetOffset = ch * size;
        for (let i = 0; i < size; i++) {
          data[targetOffset + i] = chData[offset + i];
        }
      }

      const audioFrame = new AudioData({
        format: 'f32-planar',
        sampleRate,
        numberOfFrames: size,
        numberOfChannels: channels,
        timestamp: (offset * 1000000) / sampleRate,
        data
      });
      if (encodeError) throw encodeError;
      audioEncoder.encode(audioFrame);
      audioFrame.close();
    }

    await audioEncoder.flush();
    if (encodeError) throw encodeError;
    audioEncoder.close();
  }

  videoElements.forEach((video) => {
    URL.revokeObjectURL(video.src);
    video.remove();
  });
  imageElements.forEach((img) => {
    URL.revokeObjectURL(img.src);
  });
  videoReaders.forEach((reader) => {
    try {
      reader.close();
    } catch { /* ignore */ }
  });

  onProgress(95);
  muxer.finalize();
  const { buffer } = muxer.target as ArrayBufferTarget;
  onProgress(100);

  return new Blob([buffer], { type: 'video/mp4' });
}
