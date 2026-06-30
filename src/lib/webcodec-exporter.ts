import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { db, type Project, type TimelineClip } from './db';
import { getFileFromOPFS } from './opfs';
import { mixAudioTracks } from './audio-mixer';
import { evaluateKeyframe } from './keyframe-evaluator';
import { parseCubeLUT, applyLut3D, type Lut3D } from './lut-solver';
import { initUpscaler, upscaleFrame, isUpscalerReady } from './upscaler';
import { applyTransitionTransform, drawTransitionOverlay, applyWipeClip } from './transitions-registry';
import { buildEffectFilterString, applyCanvasEffect } from './effects-registry';

export interface ExportSettings {
  width: number;
  height: number;
  fps: number;
  bitrate: number; // in bps (e.g. 8000000 for 8Mbps)
  upscaleMode?: 'standard' | 'enhanced' | 'ai'; // upscaling mode
  onUpscaleProgress?: (stage: string, percent: number) => void;
}

export async function exportProjectWebCodecs(
  project: Project,
  settings: ExportSettings,
  onProgress: (percent: number) => void,
  isCancelled: () => boolean = () => false
): Promise<Blob> {
  const { width, height, fps, bitrate, upscaleMode, onUpscaleProgress } = settings;

  // Determine rendering resolution vs final export resolution
  const renderWidth = upscaleMode === 'ai' ? Math.round(width / 2) : width;
  const renderHeight = upscaleMode === 'ai' ? Math.round(height / 2) : height;

  // Initialise AI upscaler if requested (load model from CDN / IDB cache)
  if (upscaleMode === 'ai' && !isUpscalerReady()) {
    await initUpscaler(onUpscaleProgress);
    onUpscaleProgress?.('', 0);
  }

  // 1. Render mixed audio track
  onProgress(5);
  const audioBuffer = await mixAudioTracks(project, 44100);
  onProgress(15);

  // Calculate total duration in milliseconds
  let durationMs = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      const endMs = clip.positionMs + clip.durationMs;
      if (endMs > durationMs) durationMs = endMs;
    }
  }
  if (durationMs === 0) durationMs = 5000; // fallback 5s

  const totalFrames = Math.ceil((durationMs / 1000) * fps);

  // 2. Setup mp4-muxer
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

  // 3. Initialize encoders
  const videoEncoder = new VideoEncoder({
    output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
    error: (e) => {
      console.error('Video Encoder Error:', e);
      encodeError = e;
    }
  });

  // H.264 High Profile (avc1.6400xx) provides superior compression quality compared to Main Profile
  const codec = (width > 1920 || height > 1080) ? 'avc1.640033' : 'avc1.64002a';

  videoEncoder.configure({
    codec,
    width,
    height,
    bitrate,
    framerate: fps,
    bitrateMode: 'variable', // Enable Variable Bitrate (VBR) for higher quality in complex scenes
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
      codec: 'mp4a.40.2', // AAC-LC
      numberOfChannels: 2,
      sampleRate: audioBuffer.sampleRate, // Match mixed audio sample rate
      bitrate: 128000
    });
  }

  // 4. Create and load off-screen video and image elements
  const videoElements = new Map<string, HTMLVideoElement>();
  const imageElements = new Map<string, HTMLImageElement>();
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.type === 'video' && clip.assetId && !videoElements.has(clip.assetId)) {
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
          console.warn(`Failed to preload asset for export:`, err);
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

  // Blend mode mapping
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

  // Pre-allocate reusable canvases for effect-track compositing and enhanced upscale.
  // These are re-dimensioned only when the render size changes (never inside the loop).
  const effectFilterCanvas = document.createElement('canvas');
  effectFilterCanvas.width = renderWidth;
  effectFilterCanvas.height = renderHeight;

  const effectVideoCanvas = document.createElement('canvas');
  effectVideoCanvas.width = renderWidth;
  effectVideoCanvas.height = renderHeight;

  // Pre-allocate the enhanced-upscale output canvas (only used in 'enhanced' mode).
  let enhancedCanvas: HTMLCanvasElement | null = null;
  let enhancedCtx: CanvasRenderingContext2D | null = null;
  if (upscaleMode === 'enhanced') {
    enhancedCanvas = document.createElement('canvas');
    enhancedCanvas.width = width;
    enhancedCanvas.height = height;
    enhancedCtx = enhancedCanvas.getContext('2d')!;
    enhancedCtx.imageSmoothingEnabled = true;
    enhancedCtx.imageSmoothingQuality = 'high';
  }

  // Helper: close encoders + revoke all blob URLs on any exit (cancel OR error).
  const cleanupOnExit = () => {
    try { if (videoEncoder.state !== 'closed') videoEncoder.close(); } catch { /* ignore */ }
    try { if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close(); } catch { /* ignore */ }
    videoElements.forEach((video) => { URL.revokeObjectURL(video.src); video.remove(); });
    imageElements.forEach((img) => { URL.revokeObjectURL(img.src); });
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

    // Draw background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, renderWidth, renderHeight);

    // Render active tracks in reverse track order (from bottom to top)
    // Loop in reverse so bottom tracks (higher index) are drawn first, and top tracks (index 0) are drawn last
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

    // Draw visual tracks
    for (const { clip, trackHidden, type } of activeVisualClips) {
      if (trackHidden) continue;
      if (type === 'video') {
      const video = clip.assetId ? videoElements.get(clip.assetId) : null;
      if (video) {
        const speed = clip.speed || 1.0;
        const offset = timeMs - clip.positionMs;
        const sourceTime = (clip.trimStartMs + offset * speed) / 1000;

        // Seek video element to target time
        video.currentTime = sourceTime;
        await new Promise((resolve) => {
          video.onseeked = resolve;
        });

        // Set opacity
        let opacity = 1.0;
        const fadeIn = clip.fadeInMs || 0;
        const fadeOut = clip.fadeOutMs || 0;

        // Determine active transition — prefer new transitionIn, fall back to legacy transitionType
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

        // Apply keyframed opacity multiplier
        const keyframeOpacity = evaluateKeyframe(clip.keyframes?.opacity, offset, 100) / 100;
        opacity = opacity * keyframeOpacity;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(opacity, 1.0));

        // Draw dip/flash overlay for supported transitions
        if (hasTransition && activeTrans) {
          drawTransitionOverlay(ctx as CanvasRenderingContext2D, activeTrans.type, transProgress, renderWidth, renderHeight);
        }

        // Draw preceding clip for transitions
        if (hasTransition) {
          let prevClip = null;
          const track = project.tracks.find(t => t.clips.some(c => c.id === clip.id));
          if (track) {
            const sortedClips = [...track.clips].sort((a, b) => a.positionMs - b.positionMs);
            const idx = sortedClips.findIndex(c => c.id === clip.id);
            if (idx > 0) prevClip = sortedClips[idx - 1];
          }
          if (prevClip) {
            const prevVideo = prevClip.assetId ? videoElements.get(prevClip.assetId) : null;
            if (prevVideo) {
              prevVideo.currentTime = prevClip.trimEndMs / 1000;
              await new Promise((resolve) => {
                prevVideo.onseeked = resolve;
              });
              // Calculate aspect ratio preserving destination rectangle for prevVideo
              const prevWidth = prevVideo.videoWidth || renderWidth;
              const prevHeight = prevVideo.videoHeight || renderHeight;
              const prevSrcRatio = prevWidth / prevHeight;
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
              ctx.drawImage(prevVideo, pdx, pdy, pdWidth, pdHeight);
              ctx.restore();
            }
          }
        }

        // Apply filters
        let filterString = '';
        if (clip.colorAdjustments) {
          const { brightness, contrast, saturation } = clip.colorAdjustments;
          filterString += `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) `;
        }
        if (clip.filterSettings && clip.filterSettings.type !== 'none') {
          const { type, intensity } = clip.filterSettings;
          if (type === 'bw') filterString += `grayscale(${intensity}%) `;
          else if (type === 'sepia') filterString += `sepia(${intensity}%) `;
          else if (type === 'vintage') filterString += `sepia(${intensity * 0.4}%) hue-rotate(30deg) contrast(${100 - intensity * 0.2}%) `;
          else if (type === 'warm') filterString += `sepia(${intensity * 0.3}%) saturate(${100 + intensity * 0.2}%) `;
          else if (type === 'cool') filterString += `hue-rotate(190deg) saturate(${100 + intensity * 0.1}%) `;
          else if (type === 'cyberpunk') filterString += `hue-rotate(300deg) contrast(1.1) saturate(${100 + intensity * 0.5}%) `;
          else if (type === 'cinematic') filterString += `contrast(${100 + intensity * 0.2}%) saturate(${100 - intensity * 0.1}%) `;
        }
        // Apply CSS-based videoEffects from effects-registry
        if (clip.videoEffects) {
          for (const eff of clip.videoEffects) {
            const effFilter = buildEffectFilterString(eff.id, eff.intensity);
            if (effFilter) filterString += effFilter + ' ';
          }
        }

        ctx.filter = filterString.trim() || 'none';

        // Apply blends & transforms
        const blend = clip.transform?.blendMode || 'normal';
        ctx.globalCompositeOperation = (blendModeMap[blend] || 'source-over') as GlobalCompositeOperation;

        const cx = renderWidth / 2;
        const cy = renderHeight / 2;
        
        // Evaluate keyframes, fallback to transform
        const tx = evaluateKeyframe(clip.keyframes?.x, offset, clip.transform?.x || 0);
        const ty = evaluateKeyframe(clip.keyframes?.y, offset, clip.transform?.y || 0);
        const tRotation = evaluateKeyframe(clip.keyframes?.rotation, offset, clip.transform?.rotation || 0);
        const rawScale = evaluateKeyframe(clip.keyframes?.scale, offset, clip.transform?.scale !== undefined ? clip.transform.scale : 100);
        const tScale = rawScale / 100;

        ctx.save();

        // Apply wipe clip-region for wipe transitions (before translate)
        const isWipe = hasTransition && activeTrans && ['wipe-left','wipe-right','wipe-up','wipe-down'].includes(activeTrans.type);
        if (isWipe && activeTrans) {
          ctx.save();
          applyWipeClip(ctx as CanvasRenderingContext2D, activeTrans.type, transProgress, renderWidth, renderHeight);
        }

        ctx.translate(cx + tx, cy + ty);

        // Apply transition displacement using registry (with smoothstep easing)
        if (hasTransition && activeTrans && !isWipe) {
          applyTransitionTransform(
            ctx as CanvasRenderingContext2D,
            activeTrans.type,
            transProgress,
            renderWidth,
            renderHeight,
            timeMs
          );
        }

        if (tRotation !== 0) ctx.rotate((tRotation * Math.PI) / 180);
        if (tScale !== 1) ctx.scale(tScale, tScale);

        // Calculate aspect ratio preserving destination rectangle (contain fit)
        const videoWidth = video.videoWidth || renderWidth;
        const videoHeight = video.videoHeight || renderHeight;
        const srcRatio = videoWidth / videoHeight;
        const destRatio = renderWidth / renderHeight;
        
        let dWidth = renderWidth;
        let dHeight = renderHeight;
        let dx = 0;
        let dy = 0;
        
        if (srcRatio > destRatio) {
          // Video is wider than project (letterbox)
          dHeight = renderWidth / srcRatio;
          dy = (renderHeight - dHeight) / 2;
        } else {
          // Video is taller than project (pillarbox)
          dWidth = renderHeight * srcRatio;
          dx = (renderWidth - dWidth) / 2;
        }

        let drawSource: CanvasImageSource = video;

        if (offCtx) {
          offCtx.filter = filterString.trim() || 'none';
          offCtx.drawImage(video, dx, dy, dWidth, dHeight);
          offCtx.filter = 'none';

          // Apply canvas-based video effects (pixel ops) from effects-registry
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

          // Chroma Key Green Screen Removal
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

          // HSL Shifts
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

          // LUT & Lift/Gamma/Gain color correction
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

          if (offCtx && (lutEntry || hasLGG)) {
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

          drawSource = offscreen;
        }

        ctx.drawImage(drawSource, -cx, -cy, renderWidth, renderHeight);
        if (isWipe) ctx.restore(); // close wipe clip region

        // Tint & Vignette overlay inside transformed space
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
      }
    } else if (type === 'image') {
        const img = clip.assetId ? imageElements.get(clip.assetId) : null;
        if (img) {
          // Compute opacity
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

          // Contain-fit the image
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
          ctx.restore();
          ctx.globalCompositeOperation = 'source-over';
          ctx.restore();
        }
      }
    }

    // Draw text tracks
    for (const { clip, trackHidden } of activeTextClips) {
      if (trackHidden || !clip.textSettings) continue;
      const textSettings = clip.textSettings;
      ctx.save();
      ctx.fillStyle = textSettings.color;
      ctx.font = `bold ${textSettings.fontSize}px ${textSettings.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(textSettings.content, textSettings.x * renderWidth, textSettings.y * renderHeight);
      ctx.restore();
    }

    // Apply global effect track clips during export
    const effectTracks = project.tracks.filter(t => t.type === 'effect');
    effectTracks.forEach(track => {
      if (track.hidden || track.muted) return;
      track.clips.forEach(clip => {
        const isActive = timeMs >= clip.positionMs && timeMs < clip.positionMs + clip.durationMs;
        if (isActive) {
          // 1. Apply filter settings
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
              // Reuse pre-allocated effectFilterCanvas — no allocation inside the frame loop.
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

          // 2. Apply video effects
          if (clip.videoEffects && clip.videoEffects.length > 0) {
            clip.videoEffects.forEach(eff => {
              // Reuse pre-allocated effectVideoCanvas — no allocation inside the frame loop.
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

    // Capture and encode frame (with optional AI upscaling or fast enhancement)
    let frameSource: HTMLCanvasElement | OffscreenCanvas = canvas;

    if (upscaleMode === 'ai' && isUpscalerReady()) {
      try {
        // Upscale: Real-ESRGAN processes canvas at current res, outputs at targetW×targetH
        frameSource = await upscaleFrame(canvas as HTMLCanvasElement, width, height);
      } catch (err) {
        console.warn('[Upscaler] Frame upscale failed, using original:', err);
        frameSource = canvas;
      }
    } else if (upscaleMode === 'enhanced' && enhancedCanvas && enhancedCtx) {
      // Reuse pre-allocated canvas — just redraw the current frame into it.
      enhancedCtx.filter = 'contrast(1.04) saturate(1.03)';
      enhancedCtx.drawImage(canvas, 0, 0, width, height);
      enhancedCtx.filter = 'none';
      frameSource = enhancedCanvas;
    }

    const frame = new VideoFrame(frameSource as CanvasImageSource, { timestamp: (f * 1000000) / fps });
    try {
      videoEncoder.encode(frame);
    } finally {
      frame.close();
    }

    // Report Progress (from 15% to 85%)
    if (encodeError) throw encodeError;
    const frameProgress = 15 + Math.round((f / totalFrames) * 70);
    onProgress(frameProgress);

    // Yield control to the browser event loop once every 10 frames
    // to prevent freezes while keeping the render loop extremely fast.
    if (f % 10 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  } finally {
    // Always close encoders to release GPU/system codec resources,
    // regardless of whether the export succeeded, failed, or was cancelled.
    cleanupOnExit();
  }

  // Flush video encoder
  await videoEncoder.flush();
  if (encodeError) throw encodeError;
  videoEncoder.close();

  // 7. Encode Mixed Audio
  if (audioBuffer && audioEncoder) {
    if (encodeError) throw encodeError;
    const channels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;
    const frameSize = 1024;

    for (let offset = 0; offset < length; offset += frameSize) {
      const size = Math.min(frameSize, length - offset);
      const data = new Float32Array(size * channels);
      // Correct planar copy for 'f32-planar' format
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

  // 8. Finalize Muxer and close clean video and image elements
  videoElements.forEach((video) => {
    URL.revokeObjectURL(video.src);
    video.remove();
  });
  imageElements.forEach((img) => {
    URL.revokeObjectURL(img.src);
  });

  onProgress(95);
  muxer.finalize();
  const { buffer } = muxer.target as ArrayBufferTarget;
  onProgress(100);

  return new Blob([buffer], { type: 'video/mp4' });
}
