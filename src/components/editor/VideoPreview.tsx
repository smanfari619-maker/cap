import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Maximize2, Menu, ChevronDown, Tv, SkipBack, SkipForward, Check } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import { db } from '../../lib/db';
import { getFileFromOPFS } from '../../lib/opfs';
import { parseCubeLUT, applyLut3D, type Lut3D } from '../../lib/lut-solver';
import { evaluateKeyframe } from '../../lib/keyframe-evaluator';

export default function VideoPreview() {
  const project = useEditorStore(state => state.project);
  const currentTime = useEditorStore(state => state.currentTime);
  const setCurrentTime = useEditorStore(state => state.setCurrentTime);
  const isPlaying = useEditorStore(state => state.isPlaying);
  const setIsPlaying = useEditorStore(state => state.setIsPlaying);
  const upscaleEnabled = useEditorStore(state => state.upscaleEnabled);
  const selectedClipId = useEditorStore(state => state.selectedClipId);
  const updateClip = useEditorStore(state => state.updateClip);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Keep track of loaded media elements (video/audio)
  // map: assetId -> HTMLMediaElement
  const mediaElementsRef = useRef<Map<string, HTMLMediaElement>>(new Map());
  // Keep track of loaded image elements
  // map: assetId -> HTMLImageElement
  const imageElementsRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lutCacheRef = useRef<Map<string, Lut3D>>(new Map());
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [totalDuration, setTotalDuration] = useState(0);

  // 1. Load project media files from OPFS and create Blob URLs
  useEffect(() => {
    if (!project) return;

    let isSubscribed = true;
    const mediaMap = mediaElementsRef.current;

    const loadMedia = async () => {
      setAssetsLoaded(false);
      
      // Get all unique asset IDs used in timeline
      const assetIds = new Set<string>();
      project.tracks.forEach(track => {
        track.clips.forEach(clip => {
          if (clip.assetId) assetIds.add(clip.assetId);
        });
      });

      // Revoke and delete old media elements that are no longer used
      for (const [id, element] of mediaMap.entries()) {
        if (!assetIds.has(id)) {
          element.pause();
          const src = element.src;
          element.src = '';
          if (element instanceof HTMLVideoElement) {
            element.load();
          }
          if (src.startsWith('blob:')) {
            URL.revokeObjectURL(src);
          }
          mediaMap.delete(id);
        }
      }

      // Also clean up old image elements
      const imageMap = imageElementsRef.current;
      for (const [id, element] of imageMap.entries()) {
        if (!assetIds.has(id)) {
          const src = element.src;
          element.src = '';
          if (src.startsWith('blob:')) {
            URL.revokeObjectURL(src);
          }
          imageMap.delete(id);
        }
      }

      // Load new media elements
      for (const assetId of assetIds) {
        if (!mediaMap.has(assetId)) {
          try {
            const asset = await db.assets.get(assetId);
            if (!asset) continue;

            const file = await getFileFromOPFS(asset.opfsPath);
            const objectUrl = URL.createObjectURL(file);

            let mediaEl: HTMLMediaElement;
            if (asset.type.startsWith('audio/')) {
              mediaEl = new Audio(objectUrl);
            } else if (asset.type.startsWith('image/')) {
              // Images: load as HTMLImageElement, not HTMLMediaElement
              const img = new window.Image();
              img.src = objectUrl;
              imageElementsRef.current.set(assetId, img);
              continue; // skip adding to mediaMap
            } else {
              const video = document.createElement('video');
              video.src = objectUrl;
              video.muted = false;
              video.playsInline = true;
              video.preload = 'auto';
              mediaEl = video;
            }

            const handleSeeked = () => {
              const pending = (mediaEl as any)._pendingSeek;
              if (pending !== undefined) {
                (mediaEl as any)._pendingSeek = undefined;
                mediaEl.currentTime = pending;
              } else {
                drawRef.current();
              }
            };
            mediaEl.addEventListener('seeked', handleSeeked);

            mediaMap.set(assetId, mediaEl);
          } catch (error) {
            console.error(`Failed to load asset ${assetId} from OPFS:`, error);
          }
        }
      }

      if (isSubscribed) {
        setAssetsLoaded(true);
      }
    };

    loadMedia();

    return () => {
      isSubscribed = false;
    };
  }, [project]);

  // 2. Clean up media elements on unmount
  useEffect(() => {
    return () => {
      const mediaMap = mediaElementsRef.current;
      for (const [_, element] of mediaMap.entries()) {
        element.pause();
        const src = element.src;
        element.src = '';
        if (src.startsWith('blob:')) {
          URL.revokeObjectURL(src);
        }
      }
      mediaMap.clear();
    };
  }, []);

  // 3. Compute total timeline duration
  useEffect(() => {
    if (!project) return;
    let maxTime = 0;
    project.tracks.forEach(track => {
      track.clips.forEach(clip => {
        const clipEnd = clip.positionMs + clip.durationMs;
        if (clipEnd > maxTime) maxTime = clipEnd;
      });
    });
    setTotalDuration(maxTime || 10000); // minimum 10s timeline duration
  }, [project]);

  // 4. Synchronize HTML Media Elements playback states and current times
  useEffect(() => {
    if (!project || !assetsLoaded) return;

    project.tracks.forEach(track => {
      track.clips.forEach(clip => {
        if (!clip.assetId) return;
        const media = mediaElementsRef.current.get(clip.assetId);
        if (!media) return;

        const isClipActive = currentTime >= clip.positionMs && currentTime < clip.positionMs + clip.durationMs;

        if (isClipActive) {
          const speed = clip.speed || 1.0;
          const clipOffset = currentTime - clip.positionMs;
          const targetSourceTime = (clip.trimStartMs + (clipOffset * speed)) / 1000;

          // Sync playback speed
          if (media.playbackRate !== speed) {
            media.playbackRate = speed;
          }

          // Sync mute state
          const isMuted = !!track.muted;
          if (media.muted !== isMuted) {
            media.muted = isMuted;
          }

          // Sync volume
          let volumeFactor = 1.0;
          const fadeIn = clip.fadeInMs || 0;
          const fadeOut = clip.fadeOutMs || 0;
          if (clipOffset < fadeIn && fadeIn > 0) {
            volumeFactor = clipOffset / fadeIn;
          } else if (clipOffset > clip.durationMs - fadeOut && fadeOut > 0) {
            volumeFactor = (clip.positionMs + clip.durationMs - currentTime) / fadeOut;
          }
          const baseVolume = clip.volume !== undefined ? clip.volume / 100 : 1.0;
          const calculatedVolume = Math.max(0, Math.min(volumeFactor * baseVolume, 1.0));
          if (media.volume !== calculatedVolume) {
            media.volume = calculatedVolume;
          }

          // Playback sync logic
          if (isPlaying) {
            // Sync time and play if paused or just beginning clip
            if (media.paused) {
              if (media.seeking) {
                (media as any)._pendingSeek = targetSourceTime;
              } else {
                media.currentTime = targetSourceTime;
              }
              media.play().catch(() => {});
            } else {
              // Only force seek during playback if drift is very large (> 1.0 second)
              // to prevent the HTML5 decoder from stuttering or freezing.
              const drift = Math.abs(media.currentTime - targetSourceTime);
              if (drift > 1.0) {
                if (media.seeking) {
                  (media as any)._pendingSeek = targetSourceTime;
                } else {
                  media.currentTime = targetSourceTime;
                }
              }
            }
          } else {
            // When scrubbing (paused), always sync current frame for visual feedback
            if (!media.paused) {
              media.pause();
            }
            const drift = Math.abs(media.currentTime - targetSourceTime);
            if (drift > 0.03) { // tight threshold for responsive scrubbing
              if (media.seeking) {
                (media as any)._pendingSeek = targetSourceTime;
              } else {
                media.currentTime = targetSourceTime;
              }
            }
          }
        } else {
          // Pause if clip is inactive
          if (!media.paused) {
            media.pause();
          }
        }
      });
    });
  }, [currentTime, isPlaying, project, assetsLoaded]);

  const drawRef = useRef<() => void>(() => {});

  // 5. Draw Loop for Canvas Compositor
  useEffect(() => {
    
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const state = useEditorStore.getState();
      const project = state.project;
      const currentTime = state.currentTime;
      const upscaleEnabled = state.upscaleEnabled;
      
      if (!project) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear Canvas
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Collect all active clips
      const activeClips: { clip: typeof project.tracks[0]['clips'][0]; trackType: string; trackIndex: number }[] = [];
      project.tracks.forEach((track, trackIndex) => {
        if (track.hidden) return; // skip hidden tracks
        track.clips.forEach(clip => {
          const isActive = currentTime >= clip.positionMs && currentTime < clip.positionMs + clip.durationMs;
          if (isActive) {
            activeClips.push({ clip, trackType: track.type, trackIndex });
          }
        });
      });

      // Sort clips by trackIndex descending (so lower indices/top tracks are drawn last/on top)
      activeClips.sort((a, b) => b.trackIndex - a.trackIndex);

      // Render active clips with volume and opacity transition fades
      activeClips.forEach(({ clip, trackType }) => {
        let opacity = 1.0;
        const clipOffset = currentTime - clip.positionMs;
        const fadeIn = clip.fadeInMs || 0;
        const fadeOut = clip.fadeOutMs || 0;
        const hasTransition = clip.transitionType && clip.transitionType !== 'none' && clipOffset < fadeIn;

        if (hasTransition) {
          opacity = 1.0; // Handled inside transition block
        } else if (clipOffset < fadeIn && fadeIn > 0) {
          opacity = clipOffset / fadeIn;
        } else if (clipOffset > clip.durationMs - fadeOut && fadeOut > 0) {
          opacity = (clip.positionMs + clip.durationMs - currentTime) / fadeOut;
        }

        // Apply keyframed opacity multiplier
        const keyframeOpacity = evaluateKeyframe(clip.keyframes?.opacity, clipOffset, 100) / 100;
        opacity = opacity * keyframeOpacity;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(opacity, 1.0));

        if (trackType === 'video' && clip.assetId) {
          const media = mediaElementsRef.current.get(clip.assetId);
          if (media && media instanceof HTMLVideoElement && media.readyState >= 2) {
            
            // Draw preceding clip's freeze frame if transition is active
            const isTransActive = clip.transitionType && clip.transitionType !== 'none' && clipOffset < fadeIn;
            if (isTransActive) {
              let prevClip = null;
              const track = project.tracks.find(t => t.clips.some(c => c.id === clip.id));
              if (track) {
                const sortedClips = [...track.clips].sort((a, b) => a.positionMs - b.positionMs);
                const idx = sortedClips.findIndex(c => c.id === clip.id);
                if (idx > 0) {
                  prevClip = sortedClips[idx - 1];
                }
              }

              if (prevClip) {
                const prevMedia = prevClip.assetId ? mediaElementsRef.current.get(prevClip.assetId) : null;
                if (prevMedia && prevMedia instanceof HTMLVideoElement && prevMedia.readyState >= 2) {
                  // Freeze frame at the end of the previous clip
                  const prevTargetTime = prevClip.trimEndMs / 1000;
                  if (Math.abs(prevMedia.currentTime - prevTargetTime) > 0.15) {
                    prevMedia.currentTime = prevTargetTime;
                  }
                  // Calculate aspect ratio preserving destination rectangle for prevMedia
                  const prevWidth = (prevMedia as HTMLVideoElement).videoWidth || canvas.width;
                  const prevHeight = (prevMedia as HTMLVideoElement).videoHeight || canvas.height;
                  const prevSrcRatio = prevWidth / prevHeight;
                  const prevDestRatio = canvas.width / canvas.height;
                  
                  let pdWidth = canvas.width;
                  let pdHeight = canvas.height;
                  let pdx = 0;
                  let pdy = 0;
                  
                  if (prevSrcRatio > prevDestRatio) {
                    pdHeight = canvas.width / prevSrcRatio;
                    pdy = (canvas.height - pdHeight) / 2;
                  } else {
                    pdWidth = canvas.height * prevSrcRatio;
                    pdx = (canvas.width - pdWidth) / 2;
                  }
                  
                  ctx.save();
                  ctx.drawImage(prevMedia, pdx, pdy, pdWidth, pdHeight);
                  ctx.restore();
                }
              }
            }

            let filterString = '';

            // Apply color adjustments
            if (clip.colorAdjustments) {
              const { brightness, contrast, saturation } = clip.colorAdjustments;
              filterString += `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) `;
            }

            // Apply filter presets
            if (clip.filterSettings && clip.filterSettings.type !== 'none') {
              const { type, intensity } = clip.filterSettings;
              if (type === 'bw') {
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
              }
            }

            if (upscaleEnabled) {
              filterString += 'contrast(1.05) saturate(1.05) ';
            }

            // Blend mode map
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
            const blend = clip.transform?.blendMode || 'normal';
            ctx.globalCompositeOperation = (blendModeMap[blend] || 'source-over') as GlobalCompositeOperation;

            // Compute center point & parameters
            const cx = canvas.width / 2;
            const cy = canvas.height / 2;
            
            // Check keyframe overrides, otherwise fallback to static transform settings
            const tx = evaluateKeyframe(clip.keyframes?.x, clipOffset, clip.transform?.x || 0);
            const ty = evaluateKeyframe(clip.keyframes?.y, clipOffset, clip.transform?.y || 0);
            const tRotation = evaluateKeyframe(clip.keyframes?.rotation, clipOffset, clip.transform?.rotation || 0);
            const rawScale = evaluateKeyframe(clip.keyframes?.scale, clipOffset, clip.transform?.scale !== undefined ? clip.transform.scale : 100);
            const tScale = rawScale / 100;

            ctx.save();
            ctx.translate(cx + tx, cy + ty);

            // Apply transition animation displacement to incoming clip
            if (isTransActive) {
              const p = clipOffset / fadeIn; // transition progress (0.0 to 1.0)
              if (clip.transitionType === 'fade') {
                ctx.globalAlpha = p;
              } else if (clip.transitionType === 'slide-left') {
                ctx.translate(canvas.width * (1 - p), 0);
              } else if (clip.transitionType === 'slide-right') {
                ctx.translate(-canvas.width * (1 - p), 0);
              } else if (clip.transitionType === 'zoom') {
                ctx.scale(p, p);
              }
            }

            if (tRotation !== 0) ctx.rotate((tRotation * Math.PI) / 180);
            if (tScale !== 1) ctx.scale(tScale, tScale);

            if (!offscreenCanvasRef.current) {
              offscreenCanvasRef.current = document.createElement('canvas');
            }
            const offscreen = offscreenCanvasRef.current;
            offscreen.width = canvas.width;
            offscreen.height = canvas.height;
            const offCtx = offscreen.getContext('2d');
            if (offCtx) {
              offCtx.filter = filterString.trim() || 'none';
              
              // Calculate aspect ratio preserving destination rectangle (contain fit)
              const videoWidth = (media as HTMLVideoElement).videoWidth || offscreen.width;
              const videoHeight = (media as HTMLVideoElement).videoHeight || offscreen.height;
              const srcRatio = videoWidth / videoHeight;
              const destRatio = offscreen.width / offscreen.height;
              
              let dWidth = offscreen.width;
              let dHeight = offscreen.height;
              let dx = 0;
              let dy = 0;
              
              if (srcRatio > destRatio) {
                // Letterbox
                dHeight = offscreen.width / srcRatio;
                dy = (offscreen.height - dHeight) / 2;
              } else {
                // Pillarbox
                dWidth = offscreen.height * srcRatio;
                dx = (offscreen.width - dWidth) / 2;
              }

              offCtx.drawImage(media, dx, dy, dWidth, dHeight);
              offCtx.filter = 'none';

              // Chroma Key Green Screen Removal
              if (clip.chromaKey && clip.chromaKey.enabled) {
                const imgData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
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
                  const imgData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
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
                if (!lutCacheRef.current.has(lutText)) {
                  const parsed = parseCubeLUT(lutText);
                  if (parsed) lutCacheRef.current.set(lutText, parsed);
                }
                lutEntry = lutCacheRef.current.get(lutText) ?? null;
              }

              const lift = clip.colorCorrection?.lift || { r: 0, g: 0, b: 0 };
              const gamma = clip.colorCorrection?.gamma || { r: 0, g: 0, b: 0 };
              const gain = clip.colorCorrection?.gain || { r: 0, g: 0, b: 0 };
              const hasLGG = lift.r !== 0 || lift.g !== 0 || lift.b !== 0 ||
                             gamma.r !== 0 || gamma.g !== 0 || gamma.b !== 0 ||
                             gain.r !== 0 || gain.g !== 0 || gain.b !== 0;

              if (lutEntry || hasLGG) {
                const imgData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
                const data = imgData.data;

                for (let i = 0; i < data.length; i += 4) {
                  if (data[i+3] === 0) continue;

                  let r = data[i] / 255;
                  let g = data[i+1] / 255;
                  let b = data[i+2] / 255;

                  if (lutEntry) {
                    const result = applyLut3D(r, g, b, lutEntry.table, lutEntry.size);
                    r = result.r;
                    g = result.g;
                    b = result.b;
                  }

                  if (hasLGG) {
                    // Shadows Lift
                    r = r + (lift.r / 100) * (1.0 - r);
                    g = g + (lift.g / 100) * (1.0 - g);
                    b = b + (lift.b / 100) * (1.0 - b);

                    // Midtones Gamma
                    const midR = Math.sin(r * Math.PI) * (gamma.r / 100);
                    const midG = Math.sin(g * Math.PI) * (gamma.g / 100);
                    const midB = Math.sin(b * Math.PI) * (gamma.b / 100);
                    r = Math.max(0, Math.min(1, r + midR));
                    g = Math.max(0, Math.min(1, g + midG));
                    b = Math.max(0, Math.min(1, b + midB));

                    // Highlights Gain
                    r = r * (1.0 + gain.r / 100);
                    g = g * (1.0 + gain.g / 100);
                    b = b * (1.0 + gain.b / 100);
                  }

                  data[i] = Math.round(Math.max(0, Math.min(1, r)) * 255);
                  data[i+1] = Math.round(Math.max(0, Math.min(1, g)) * 255);
                  data[i+2] = Math.round(Math.max(0, Math.min(1, b)) * 255);
                }
                offCtx.putImageData(imgData, 0, 0);
              }

              ctx.drawImage(offscreen, -cx, -cy, canvas.width, canvas.height);
            }

            // Render Temperature Tint overlay (in transformed space)
            if (clip.colorAdjustments && clip.colorAdjustments.temp !== 0) {
              ctx.save();
              ctx.globalCompositeOperation = 'color';
              const tempVal = clip.colorAdjustments.temp;
              ctx.fillStyle = tempVal > 0 
                ? `rgba(255, 140, 0, ${Math.abs(tempVal) / 250})` 
                : `rgba(0, 191, 255, ${Math.abs(tempVal) / 250})`;
              ctx.fillRect(-cx, -cy, canvas.width, canvas.height);
              ctx.restore();
            }

            // Render Vignette overlay (in transformed space)
            if (clip.colorAdjustments && clip.colorAdjustments.vignette > 0) {
              const strength = clip.colorAdjustments.vignette / 100;
              ctx.save();
              const gradient = ctx.createRadialGradient(
                0, 0, canvas.height * 0.3,
                0, 0, canvas.width * 0.8
              );
              gradient.addColorStop(0, 'rgba(0,0,0,0)');
              gradient.addColorStop(1, `rgba(0,0,0,${strength * 0.85})`);
              ctx.fillStyle = gradient;
              ctx.fillRect(-cx, -cy, canvas.width, canvas.height);
              ctx.restore();
            }

            ctx.restore(); // restore transform space
            ctx.globalCompositeOperation = 'source-over'; // restore blend mode
          }
        } else if (trackType === 'text' && clip.textSettings) {
          const settings = clip.textSettings;
          ctx.save();
          
          const fontSize = settings.fontSize * (canvas.height / 360);
          ctx.font = `${fontSize}px ${settings.fontFamily || 'Inter'}`;
          ctx.fillStyle = settings.color || '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const xPos = settings.x * canvas.width;
          const yPos = settings.y * canvas.height;

          ctx.strokeStyle = '#000000';
          ctx.lineWidth = Math.max(2, fontSize * 0.08);
          ctx.strokeText(settings.content, xPos, yPos);
          ctx.fillText(settings.content, xPos, yPos);

          ctx.restore();
        } else if (trackType === 'image' && clip.assetId) {
          const img = imageElementsRef.current.get(clip.assetId);
          if (img && img.complete && img.naturalWidth > 0) {
            // Reuse the same transform/opacity/blend logic as video clips
            const tScale = (clip.transform?.scale ?? 100) / 100;
            const tX = clip.transform?.x ?? 0;
            const tY = clip.transform?.y ?? 0;
            const tRotation = clip.transform?.rotation ?? 0;
            const blendModeMap: Record<string, string> = {
              normal: 'source-over', multiply: 'multiply', screen: 'screen',
              overlay: 'overlay', darken: 'darken', lighten: 'lighten',
            };
            const blend = clip.transform?.blendMode || 'normal';
            ctx.globalCompositeOperation = (blendModeMap[blend] || 'source-over') as GlobalCompositeOperation;

            const cx = canvas.width / 2 + tX;
            const cy = canvas.height / 2 + tY;

            ctx.save();
            ctx.translate(cx, cy);
            if (tRotation !== 0) ctx.rotate((tRotation * Math.PI) / 180);
            if (tScale !== 1) ctx.scale(tScale, tScale);

            // Contain-fit the image
            const srcRatio = img.naturalWidth / (img.naturalHeight || 1);
            const destRatio = canvas.width / canvas.height;
            let dWidth = canvas.width;
            let dHeight = canvas.height;
            let dx = 0;
            let dy = 0;
            if (srcRatio > destRatio) {
              dHeight = canvas.width / srcRatio;
              dy = (canvas.height - dHeight) / 2;
            } else {
              dWidth = canvas.height * srcRatio;
              dx = (canvas.width - dWidth) / 2;
            }
            ctx.drawImage(img, dx - canvas.width / 2, dy - canvas.height / 2, dWidth, dHeight);
            ctx.restore();
            ctx.globalCompositeOperation = 'source-over';
          }
        }

        ctx.restore();
      });
    };

    drawRef.current = draw;
    draw();
  }, [project, selectedClipId, assetsLoaded]);

  // 5a. Continuous playback loop
  useEffect(() => {
    if (!isPlaying) return;
    let animationFrameId: number;
    const loop = () => {
      drawRef.current();
      animationFrameId = requestAnimationFrame(loop);
    };
    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying]);

  // 5b. Scrubbing redraw
  useEffect(() => {
    if (!isPlaying) {
      drawRef.current();
    }
  }, [currentTime, isPlaying]);

  // Precise delta-time clock to drive currentTime progression smoothly at 60fps
  useEffect(() => {
    if (!isPlaying || !project) return;

    let lastTime = performance.now();
    let animId: number;

    const tick = () => {
      const now = performance.now();
      const delta = now - lastTime;
      lastTime = now;

      // Adjust for playback speed if necessary, but default tick is 1:1 real-time
      const nextTime = useEditorStore.getState().currentTime + delta;
      if (nextTime >= totalDuration) {
        setCurrentTime(0);
        setIsPlaying(false);
      } else {
        setCurrentTime(nextTime);
        animId = requestAnimationFrame(tick);
      }
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, project, totalDuration, setCurrentTime, setIsPlaying]);

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const [showRatioDropdown, setShowRatioDropdown] = useState(false);
  const [showSafeZone, setShowSafeZone] = useState(false);

  const ratioOptions = [
    { id: 'original', label: 'Original', ratio: null },
    { id: 'custom', label: 'Custom', ratio: null },
    { type: 'separator' },
    { id: '16:9', label: '16:9', ratio: 16/9, iconStyle: 'w-4 h-2.5' },
    { id: '4:3', label: '4:3', ratio: 4/3, iconStyle: 'w-3.5 h-2.7' },
    { id: '2.35:1', label: '2.35:1', ratio: 2.35, iconStyle: 'w-4.5 h-2' },
    { id: '2:1', label: '2:1', ratio: 2.0, iconStyle: 'w-4 h-2' },
    { id: '1.85:1', label: '1.85:1', ratio: 1.85, iconStyle: 'w-4 h-2.2' },
    { type: 'separator' },
    { id: '9:16', label: '9:16', ratio: 9/16, iconStyle: 'w-2 h-3.5' },
    { id: '3:4', label: '3:4', ratio: 3/4, iconStyle: 'w-2.5 h-3.5' },
    { id: '5.8-inch', label: '5.8-inch', ratio: 9/19.5, iconStyle: 'w-1.8 h-3.5' },
    { id: '1:1', label: '1:1', ratio: 1.0, iconStyle: 'w-3.5 h-3.5' }
  ];

  const getActiveRatioId = () => {
    if (!project) return 'original';
    const currentRatio = project.width / project.height;
    
    // Check if it matches any of our options
    const match = ratioOptions.find(opt => 
      opt.ratio && Math.abs(opt.ratio - currentRatio) < 0.02
    );
    
    return match ? match.id : 'custom';
  };

  const handleSetAspectRatio = async (ratioId: string) => {
    if (!project) return;
    
    let width = 1920;
    let height = 1080;
    
    if (ratioId === 'original') {
      // Find the first video asset dimensions
      const videoTrack = project.tracks.find(t => t.type === 'video');
      const firstClip = videoTrack?.clips.find(c => c.assetId);
      if (firstClip && firstClip.assetId) {
        const asset = await db.assets.get(firstClip.assetId);
        if (asset && asset.width && asset.height) {
          width = asset.width;
          height = asset.height;
        }
      }
    } else if (ratioId === 'custom') {
      const customWidth = prompt('Enter custom width (px):', String(project.width));
      const customHeight = prompt('Enter custom height (px):', String(project.height));
      if (customWidth && customHeight) {
        width = parseInt(customWidth) || 1920;
        height = parseInt(customHeight) || 1080;
      } else {
        return;
      }
    } else {
      const option = ratioOptions.find(o => o.id === ratioId);
      if (option && option.ratio) {
        const r = option.ratio;
        if (r >= 1.0) {
          width = 1920;
          height = Math.round(1920 / r);
        } else {
          height = 1920;
          width = Math.round(1920 * r);
        }
      }
    }

    const updated = {
      ...project,
      width,
      height,
      updatedAt: new Date()
    };

    useEditorStore.setState({ project: updated });
    await db.projects.put(updated);
    setShowRatioDropdown(false);
  };

  const formatTimecode = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = Math.floor(totalSec % 60);
    const frames = Math.floor((ms % 1000) / 33.33); // 30 fps
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  const getAspectName = () => {
    if (!project) return 'Original';
    const activeId = getActiveRatioId();
    const activeOption = ratioOptions.find(o => o.id === activeId);
    return activeOption ? activeOption.label : 'Custom';
  };

  const stepFrame = (dir: number) => {
    if (!project) return;
    const frameTime = 1000 / (project.fps || 30);
    setCurrentTime(Math.max(0, Math.min(totalDuration, currentTime + dir * frameTime)));
  };

  const handleFullscreen = () => {
    if (canvasRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        canvasRef.current.requestFullscreen().catch((err) => {
          console.error('Error attempting to enable fullscreen:', err);
        });
      }
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || !project || !selectedClipId) return;

    const selectedClip = project.tracks
      .flatMap(t => t.clips)
      .find(c => c.id === selectedClipId);

    if (!selectedClip || selectedClip.type === 'audio') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;

    // Video/Image positions
    const startX = selectedClip.transform?.x ?? 0;
    const startY = selectedClip.transform?.y ?? 0;

    // Text positions
    const startTextX = selectedClip.textSettings?.x ?? 0.5;
    const startTextY = selectedClip.textSettings?.y ?? 0.5;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = (moveEvent.clientX - startMouseX) * scaleX;
      const deltaY = (moveEvent.clientY - startMouseY) * scaleY;

      if (selectedClip.type === 'text' && selectedClip.textSettings) {
        const newX = Math.max(0, Math.min(1, startTextX + deltaX / canvas.width));
        const newY = Math.max(0, Math.min(1, startTextY + deltaY / canvas.height));
        updateClip(selectedClip.id, {
          textSettings: {
            ...selectedClip.textSettings,
            x: newX,
            y: newY
          }
        });
      } else {
        const newX = startX + deltaX;
        const newY = startY + deltaY;
        updateClip(selectedClip.id, {
          transform: {
            ...(selectedClip.transform || {
              scale: 100,
              rotation: 0,
              uniformScale: true,
              blendMode: 'normal'
            }),
            x: Math.round(newX),
            y: Math.round(newY)
          }
        });
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className="flex flex-col flex-1 bg-[#121214] border-b border-[#2c2c32] overflow-hidden select-none">
      {/* Player Header */}
      <div className="h-9 border-b border-[#2c2c32] bg-[#18181c] flex items-center justify-between px-3 text-xs font-semibold text-gray-400">
        <span>Player</span>
        <button className="hover:text-gray-200">
          <Menu className="w-4 h-4" />
        </button>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 flex items-center justify-center min-h-0 relative p-4 bg-[#121214]">
        <div 
          className="relative max-w-full max-h-full bg-black rounded overflow-hidden border border-[#2c2c32] shadow-2xl transition-all flex items-center justify-center"
          style={{ 
            aspectRatio: `${project?.width || 1920} / ${project?.height || 1080}` 
          }}
        >
          <canvas
            ref={canvasRef}
            width={project?.width || 1920}
            height={project?.height || 1080}
            onMouseDown={handleCanvasMouseDown}
            className={`w-full h-full object-contain ${selectedClipId ? 'cursor-move' : ''}`}
          />

          {/* Safe Zone Overlay */}
          {showSafeZone && (
            <div className="absolute inset-[10%] border border-dashed border-sky-500/30 pointer-events-none flex items-center justify-center">
              <div className="absolute inset-[10%] border border-dashed border-sky-500/20 pointer-events-none" />
            </div>
          )}

          {!assetsLoaded && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2">
              <div className="w-8 h-8 rounded-full border-4 border-zinc-700 border-t-sky-500 animate-spin" />
              <p className="text-xs text-gray-400 font-semibold">Loading media tracks...</p>
            </div>
          )}
        </div>
      </div>

      {/* Controller Controls Bar */}
      <div className="border-t border-[#2c2c32] bg-[#18181c] p-2.5 flex flex-col gap-2">
        {/* Scrubber Slider */}
        <div className="flex items-center gap-2 w-full px-1">
          <input
            type="range"
            min={0}
            max={totalDuration}
            value={currentTime}
            onChange={(e) => setCurrentTime(Number(e.target.value))}
            className="flex-1 h-1 bg-[#121214] rounded-lg appearance-none cursor-pointer accent-sky-500 focus:outline-none"
          />
        </div>

        {/* Buttons & Timecode Bar */}
        <div className="flex items-center justify-between w-full px-1">
          {/* Left: Timecode */}
          <div className="text-xs font-mono text-gray-400 flex items-center gap-1">
            <span className="text-gray-250 font-medium">{formatTimecode(currentTime)}</span>
            <span className="text-gray-600">/</span>
            <span className="text-gray-500">{formatTimecode(totalDuration)}</span>
          </div>

          {/* Center: Playback Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => stepFrame(-1)}
              title="Previous Frame (Key: ,)"
              className="p-1 rounded hover:bg-[#2a2a30] text-gray-400 hover:text-gray-200 transition"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={togglePlay}
              disabled={!assetsLoaded}
              className="p-2.5 rounded-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white transition shadow shadow-sky-600/10 hover:scale-105"
            >
              {isPlaying ? <Pause className="w-4.5 h-4.5 fill-current" /> : <Play className="w-4.5 h-4.5 fill-current" />}
            </button>
            <button
              onClick={() => stepFrame(1)}
              title="Next Frame (Key: .)"
              className="p-1 rounded hover:bg-[#2a2a30] text-gray-400 hover:text-gray-200 transition"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Right: Ratio, Safe Zone, Fullscreen, WebGPU */}
          <div className="flex items-center gap-2 relative">
            {/* WebGPU Indicator */}
            {upscaleEnabled && (
              <span className="flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded bg-sky-950/40 text-sky-400 border border-sky-900/50 select-none animate-pulse">
                WebGPU
              </span>
            )}

            {/* Ratio Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowRatioDropdown(!showRatioDropdown)}
                className="flex items-center gap-1 px-2.5 py-1 bg-[#121214] border border-[#2c2c32] hover:border-sky-500 rounded text-[10px] text-gray-300 font-semibold transition"
              >
                <span>Ratio: {getAspectName()}</span>
                <ChevronDown className="w-3 h-3 text-gray-500" />
              </button>

              {showRatioDropdown && (
                <div className="absolute bottom-8 right-0 z-50 flex flex-col bg-[#1e1e22] border border-[#2c2c32] rounded shadow-2xl py-1.5 w-44 max-h-80 overflow-y-auto custom-scrollbar">
                  {ratioOptions.map((opt, idx) => {
                    if (opt.type === 'separator') {
                      return <div key={`sep-${idx}`} className="h-[1px] bg-[#2c2c32] my-1 mx-2" />;
                    }
                    
                    const activeId = getActiveRatioId();
                    const isActive = activeId === opt.id;
                    
                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleSetAspectRatio(opt.id!)}
                        className="flex items-center justify-between px-3 py-1.5 text-[10px] text-left text-gray-350 hover:bg-[#2a2a30] hover:text-sky-400 transition font-medium"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-3.5 flex items-center justify-center">
                            {isActive && <Check className="w-3 h-3 text-sky-400" />}
                          </span>
                          <span>{opt.label}</span>
                        </div>
                        {opt.iconStyle && (
                          <div className="w-6 flex items-center justify-center">
                            <div className={`border border-gray-500/80 rounded-sm bg-transparent ${opt.iconStyle}`} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Safe Zone Toggle */}
            <button
              onClick={() => setShowSafeZone(!showSafeZone)}
              title="Toggle Safe Zone"
              className={`p-1.5 rounded border transition ${
                showSafeZone
                  ? 'bg-[#2a2a30] text-sky-400 border-sky-900/50'
                  : 'bg-[#121214] text-gray-400 border-[#2c2c32] hover:text-gray-200'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
            </button>

            {/* Fullscreen */}
            <button
              onClick={handleFullscreen}
              title="Fullscreen Preview"
              className="p-1.5 rounded bg-[#121214] border border-[#2c2c32] text-gray-400 hover:text-gray-200 transition"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
