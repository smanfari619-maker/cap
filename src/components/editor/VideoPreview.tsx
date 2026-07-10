import { useEffect, useRef, useState } from 'react';
import { Menu } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import { db } from '../../lib/db';
import { getFileFromOPFS } from '../../lib/opfs';
import { parseCubeLUT, applyLut3D, type Lut3D } from '../../lib/lut-solver';
import { evaluateKeyframe } from '../../lib/keyframe-evaluator';
import { applyTransitionTransform, drawTransitionOverlay, applyWipeClip } from '../../lib/transitions-registry';
import { buildEffectFilterString, applyCanvasEffect } from '../../lib/effects-registry';
import { getSubjectFaceCenter } from '../../lib/face-tracker';
import PlaybackControls from './preview/PlaybackControls';
import { MediaPipeSelfieSegmentation } from '../../lib/background-segmenter';
import { webglPipeline } from '../../lib/webgl-pipeline';

export default function VideoPreview() {
  const project = useEditorStore(state => state.project);
  const setCurrentTime = useEditorStore(state => state.setCurrentTime);
  const isPlaying = useEditorStore(state => state.isPlaying);
  const setIsPlaying = useEditorStore(state => state.setIsPlaying);
  const upscaleEnabled = useEditorStore(state => state.upscaleEnabled);
  const selectedClipId = useEditorStore(state => state.selectedClipId);

  
  const scrubberRef = useRef<HTMLInputElement>(null);
  const mobileTimecodeRef = useRef<HTMLSpanElement>(null);
  const desktopTimecodeRef = useRef<HTMLSpanElement>(null);
  const updateClip = useEditorStore(state => state.updateClip);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Keep track of loaded media elements (video/audio)
  // map: assetId -> HTMLMediaElement
  const mediaElementsRef = useRef<Map<string, HTMLMediaElement>>(new Map());
  // Keep track of loaded image elements
  // map: assetId -> HTMLImageElement
  const imageElementsRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const filterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const effectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lutCacheRef = useRef<Map<string, Lut3D>>(new Map());
  const smoothedRefX = useRef<Record<string, number>>({});
  const videoFrameCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const segmenterRef = useRef<MediaPipeSelfieSegmentation | null>(null);
  const segmentationMasksRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const segmenterFrameCounterRef = useRef<number>(0);
  const segmenterProcessingRef = useRef<boolean>(false);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [totalDuration, setTotalDuration] = useState(0);
  const [snapX, setSnapX] = useState(false);
  const [snapY, setSnapY] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.5);

  // Web Audio Context and Routing references for real-time audio EQ preview
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioNodesRef = useRef<Map<string, {
    source: MediaElementAudioSourceNode;
    lowFilter: BiquadFilterNode;
    midFilter: BiquadFilterNode;
    highFilter: BiquadFilterNode;
  }>>(new Map());

  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const setupAudioRouting = (key: string, mediaEl: HTMLMediaElement) => {
    try {
      const audioCtx = getAudioContext();
      if (audioNodesRef.current.has(key)) return;

      const source = audioCtx.createMediaElementSource(mediaEl);
      
      const lowFilter = audioCtx.createBiquadFilter();
      lowFilter.type = 'lowshelf';
      lowFilter.frequency.value = 250;
      lowFilter.gain.value = 0;

      const midFilter = audioCtx.createBiquadFilter();
      midFilter.type = 'peaking';
      midFilter.Q.value = 1.0;
      midFilter.frequency.value = 1000;
      midFilter.gain.value = 0;

      const highFilter = audioCtx.createBiquadFilter();
      highFilter.type = 'highshelf';
      highFilter.frequency.value = 4000;
      highFilter.gain.value = 0;

      source.connect(lowFilter);
      lowFilter.connect(midFilter);
      midFilter.connect(highFilter);
      highFilter.connect(audioCtx.destination);

      audioNodesRef.current.set(key, {
        source,
        lowFilter,
        midFilter,
        highFilter
      });
    } catch (err) {
      console.warn("Failed to setup Web Audio routing for", key, err);
    }
  };

  // 1. Load project media files from OPFS and create Blob URLs
  useEffect(() => {
    if (!project) return;

    let isSubscribed = true;
    const mediaMap = mediaElementsRef.current;

    const loadMedia = async () => {
      setAssetsLoaded(false);
      
      // Get all clips that need audio/video media element loading
      const clipMediaSpecs: { clipId: string; assetId: string }[] = [];
      const activeClipKeys = new Set<string>();
      project.tracks.forEach(track => {
        track.clips.forEach(clip => {
          if (clip.disabled) return;
          if (clip.assetId && clip.type !== 'image') {
            clipMediaSpecs.push({ clipId: clip.id, assetId: clip.assetId });
            activeClipKeys.add(`${clip.id}_${clip.assetId}`);
          }
        });
      });

      // Get all unique image asset IDs
      const imageAssetIds = new Set<string>();
      project.tracks.forEach(track => {
        track.clips.forEach(clip => {
          if (clip.disabled) return;
          if (clip.assetId && clip.type === 'image') {
            imageAssetIds.add(clip.assetId);
          }
        });
      });

      // Revoke and delete old media elements that are no longer used on the timeline
      for (const [key, element] of mediaMap.entries()) {
        if (!activeClipKeys.has(key)) {
          element.pause();
          const src = element.src;
          element.src = '';
          if (element instanceof HTMLVideoElement) {
            element.load();
          }
          if (src.startsWith('blob:')) {
            URL.revokeObjectURL(src);
          }
          mediaMap.delete(key);

          // Clean up audio nodes for unused media elements
          const nodes = audioNodesRef.current.get(key);
          if (nodes) {
            try {
              nodes.source.disconnect();
              nodes.lowFilter.disconnect();
              nodes.midFilter.disconnect();
              nodes.highFilter.disconnect();
            } catch {
              // Safe cleanup
            }
            audioNodesRef.current.delete(key);
          }
        }
      }

      // Clean up old image elements that are no longer used
      const imageMap = imageElementsRef.current;
      for (const [id, element] of imageMap.entries()) {
        if (!imageAssetIds.has(id)) {
          const src = element.src;
          element.src = '';
          if (src.startsWith('blob:')) {
            URL.revokeObjectURL(src);
          }
          imageMap.delete(id);
        }
      }

      // Load new media elements for audio/video clips (keyed by clipId_assetId for independence)
      for (const { clipId, assetId } of clipMediaSpecs) {
        const key = `${clipId}_${assetId}`;
        if (!mediaMap.has(key)) {
          try {
            const asset = await db.assets.get(assetId);
            if (!asset) continue;

            const file = await getFileFromOPFS(asset.opfsPath);
            const objectUrl = URL.createObjectURL(file);

            let mediaEl: HTMLMediaElement;
            if (asset.type.startsWith('audio/')) {
              mediaEl = new Audio(objectUrl);
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

            mediaMap.set(key, mediaEl);
          } catch (error) {
            console.error(`Failed to load asset ${assetId} for clip ${clipId} from OPFS:`, error);
          }
        }
      }

      // Load new image assets (keyed by assetId since they are static)
      for (const assetId of imageAssetIds) {
        if (!imageMap.has(assetId)) {
          try {
            const asset = await db.assets.get(assetId);
            if (!asset) continue;

            const file = await getFileFromOPFS(asset.opfsPath);
            const objectUrl = URL.createObjectURL(file);

            const img = new window.Image();
            img.src = objectUrl;
            imageMap.set(assetId, img);
          } catch (error) {
            console.error(`Failed to load image asset ${assetId} from OPFS:`, error);
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
    const currentMediaElements = mediaElementsRef.current;
    const currentAudioNodes = audioNodesRef.current;
    const currentAudioCtx = audioCtxRef;

    return () => {
      for (const [key, element] of currentMediaElements.entries()) {
        element.pause();
        const src = element.src;
        element.src = '';
        if (src.startsWith('blob:')) {
          URL.revokeObjectURL(src);
        }

        // Clean up audio nodes
        const nodes = currentAudioNodes.get(key);
        if (nodes) {
          try {
            nodes.source.disconnect();
            nodes.lowFilter.disconnect();
            nodes.midFilter.disconnect();
            nodes.highFilter.disconnect();
          } catch {
            // Safe cleanup
          }
        }
      }
      currentMediaElements.clear();
      currentAudioNodes.clear();
      if (currentAudioCtx.current) {
        currentAudioCtx.current.close();
        currentAudioCtx.current = null;
      }
      if (segmenterRef.current) {
        segmenterRef.current.close().catch(err => console.warn("Failed to close segmenter on unmount:", err));
        segmenterRef.current = null;
      }
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
    let lastTime = -1;
    let lastIsPlaying = false;
    const unsubscribe = useEditorStore.subscribe((state) => {
      const time = state.currentTime;
      const isPlay = state.isPlaying;
      if (time === lastTime && isPlay === lastIsPlaying) return;
      lastTime = time;
      lastIsPlaying = isPlay;

      // --- UI Updates ---
      if (scrubberRef.current) {
        scrubberRef.current.value = time.toString();
      }
      const timecode = formatTimecode(time);
      if (mobileTimecodeRef.current) mobileTimecodeRef.current.textContent = timecode;
      if (desktopTimecodeRef.current) desktopTimecodeRef.current.textContent = timecode;

      // --- Media Syncing ---
      const proj = state.project;

      if (!proj || !assetsLoaded) return;

      if (isPlay) getAudioContext();

      proj.tracks.forEach(track => {
        track.clips.forEach((clip, clipIdx) => {
          if (clip.disabled) return;
          if (!clip.assetId || clip.type === 'image') return;
          const media = mediaElementsRef.current.get(`${clip.id}_${clip.assetId}`);
          if (!media) return;

          // Find transition duration at start
          const transIn = clip.transitionIn && clip.transitionIn.type !== 'none'
            ? clip.transitionIn.durationMs
            : 0;

          // Find transition duration at end (defined by next clip's transitionIn)
          let transOut = 0;
          const nextClip = track.clips[clipIdx + 1];
          if (nextClip && nextClip.transitionIn && nextClip.transitionIn.type !== 'none') {
            transOut = nextClip.transitionIn.durationMs;
          }

          const startMs = clip.positionMs - transIn / 2;
          const endMs = clip.positionMs + clip.durationMs + transOut / 2;

          const isClipActive = time >= startMs && time < endMs;
          const key = `${clip.id}_${clip.assetId}`;

          if (isClipActive) {
            setupAudioRouting(key, media);
            const nodes = audioNodesRef.current.get(key);
            if (nodes) {
              const lowGain = clip.audioEQ?.low ?? 0;
              const midGain = clip.audioEQ?.mid ?? 0;
              const highGain = clip.audioEQ?.high ?? 0;
              if (nodes.lowFilter.gain.value !== lowGain) nodes.lowFilter.gain.value = lowGain;
              if (nodes.midFilter.gain.value !== midGain) nodes.midFilter.gain.value = midGain;
              if (nodes.highFilter.gain.value !== highGain) nodes.highFilter.gain.value = highGain;
            }

            const speed = clip.speed || 1.0;
            let targetSourceTime = (clip.trimStartMs + ((time - clip.positionMs) * speed)) / 1000;
            let isFrozen = false;

            // Check if clip is extended into a transition window
            const transInDur = clip.transitionIn && clip.transitionIn.type !== 'none' ? clip.transitionIn.durationMs : 0;
            let transOutDurForFrozen = 0;
            const nextIdx = track.clips.indexOf(clip);
            const nextForFrozen = nextIdx >= 0 ? track.clips[nextIdx + 1] : null;
            if (nextForFrozen?.transitionIn && nextForFrozen.transitionIn.type !== 'none') {
              transOutDurForFrozen = nextForFrozen.transitionIn.durationMs;
            }
            const inTransWindow =
              (transInDur > 0 && time >= clip.positionMs - transInDur / 2 && time < clip.positionMs)
              || (transOutDurForFrozen > 0 && time > clip.positionMs + clip.durationMs && time < clip.positionMs + clip.durationMs + transOutDurForFrozen / 2);

            if (time < clip.positionMs && !inTransWindow) {
              targetSourceTime = clip.trimStartMs / 1000;
              isFrozen = true;
            } else if (time > clip.positionMs + clip.durationMs && !inTransWindow) {
              targetSourceTime = clip.trimEndMs / 1000;
              isFrozen = true;
            } else if (time < clip.positionMs) {
              // In transition window before clip — play from trimStart
              targetSourceTime = clip.trimStartMs / 1000;
            } else if (time > clip.positionMs + clip.durationMs) {
              // In transition window after clip — freeze at trimEnd but keep audio playing (cross-fade will mute it)
              targetSourceTime = clip.trimEndMs / 1000;
            }

            if (media.playbackRate !== speed) media.playbackRate = speed;
            const isMuted = !!track.muted || isFrozen;
            if (media.muted !== isMuted) media.muted = isMuted;

            let volumeFactor = 1.0;
            const fadeIn = clip.fadeInMs || 0;
            const fadeOut = clip.fadeOutMs || 0;
            const clipOffset = time - clip.positionMs;
            if (clipOffset < fadeIn && fadeIn > 0) {
              volumeFactor = clipOffset / fadeIn;
            } else if (clipOffset > clip.durationMs - fadeOut && fadeOut > 0) {
              volumeFactor = (clip.positionMs + clip.durationMs - time) / fadeOut;
            }

            // Audio cross-fade during transitions: ramp volume to avoid click/pop
            const transIn = clip.transitionIn && clip.transitionIn.type !== 'none'
              ? clip.transitionIn.durationMs
              : 0;
            let transOutForAudio = 0;
            const nextClipIdx = track.clips.indexOf(clip);
            const nextClipForAudio = nextClipIdx >= 0 ? track.clips[nextClipIdx + 1] : null;
            if (nextClipForAudio?.transitionIn && nextClipForAudio.transitionIn.type !== 'none') {
              transOutForAudio = nextClipForAudio.transitionIn.durationMs;
            }
            const transInBoundary = clip.positionMs;
            const transOutBoundary = clip.positionMs + clip.durationMs;
            if (transIn > 0 && time >= transInBoundary - transIn / 2 && time < transInBoundary + transIn / 2) {
              const p = (time - (transInBoundary - transIn / 2)) / transIn;
              volumeFactor *= Math.max(0, Math.min(1, p));
            } else if (transOutForAudio > 0 && time >= transOutBoundary - transOutForAudio / 2 && time < transOutBoundary + transOutForAudio / 2) {
              const p = (time - (transOutBoundary - transOutForAudio / 2)) / transOutForAudio;
              volumeFactor *= Math.max(0, Math.min(1, 1 - p));
            }

            const baseVolume = clip.volume !== undefined ? clip.volume / 100 : 1.0;
            const calculatedVolume = isFrozen ? 0 : Math.max(0, Math.min(volumeFactor * baseVolume, 1.0));
            if (Math.abs(media.volume - calculatedVolume) > 0.001) media.volume = calculatedVolume;

            if (isPlay && !isFrozen) {
              (media as any)._pendingSeek = undefined;
              const isReallyPlaying = !media.paused || (media as any)._playPending;
              if (!isReallyPlaying) {
                (media as any)._playPending = true;
                media.currentTime = targetSourceTime;
                media.play().then(() => { (media as any)._playPending = false; }).catch(() => { (media as any)._playPending = false; });
              } else {
                const drift = Math.abs(media.currentTime - targetSourceTime);
                if (drift > 1.5 && !(media as any).seeking) media.currentTime = targetSourceTime;
              }
            } else {
              (media as any)._playPending = false;
              if (!media.paused) media.pause();
              const drift = Math.abs(media.currentTime - targetSourceTime);
              if (drift > 0.03) {
                if ((media as any).seeking) {
                  (media as any)._pendingSeek = targetSourceTime;
                } else {
                  media.currentTime = targetSourceTime;
                }
              }
            }
          } else {
            if (!media.paused) media.pause();
          }
        });
      });
    });
    return () => unsubscribe();
  }, [assetsLoaded]);


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
      const isPlaying = state.isPlaying;
      
      if (!project) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear Canvas
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Collect all active clips (taking boundary transition overlaps into account)
      const activeClips: { clip: typeof project.tracks[0]['clips'][0]; trackType: string; trackIndex: number }[] = [];
      project.tracks.forEach((track, trackIndex) => {
        if (track.hidden) return; // skip hidden tracks
        track.clips.forEach((clip, clipIdx) => {
          if (clip.disabled) return;

          // Find transition duration at start
          const transIn = clip.transitionIn && clip.transitionIn.type !== 'none'
            ? clip.transitionIn.durationMs
            : 0;

          // Find transition duration at end (defined by next clip's transitionIn)
          let transOut = 0;
          const nextClip = track.clips[clipIdx + 1];
          if (nextClip && nextClip.transitionIn && nextClip.transitionIn.type !== 'none') {
            transOut = nextClip.transitionIn.durationMs;
          }

          const startMs = clip.positionMs - transIn / 2;
          const endMs = clip.positionMs + clip.durationMs + transOut / 2;

          const isActive = currentTime >= startMs && currentTime < endMs;
          if (isActive) {
            activeClips.push({ clip, trackType: track.type, trackIndex });
          }
        });
      });

      // Sort clips by trackIndex descending (so lower indices/top tracks are drawn last/on top)
      // and within the same track by positionMs ascending (so outgoing clip is drawn before incoming clip)
      activeClips.sort((a, b) => {
        if (a.trackIndex !== b.trackIndex) {
          return b.trackIndex - a.trackIndex;
        }
        return a.clip.positionMs - b.clip.positionMs;
      });

      // Render active clips with volume and opacity transition fades
      activeClips.forEach(({ clip, trackType }) => {
        let opacity = 1.0;
        const clipOffset = currentTime - clip.positionMs;
        const fadeIn = clip.fadeInMs || 0;
        const fadeOut = clip.fadeOutMs || 0;

        // Transition In (Centered on clip.positionMs)
        const transIn = clip.transitionIn && clip.transitionIn.type !== 'none'
          ? clip.transitionIn
          : null;
        const transInDuration = transIn?.durationMs || 0;
        const isTransInActive = transInDuration > 0 && 
          currentTime >= clip.positionMs - transInDuration / 2 && 
          currentTime < clip.positionMs + transInDuration / 2;

        // Transition Out (Centered on nextClip.positionMs)
        let transOut = null;
        let transOutDuration = 0;
        const track = project.tracks.find(t => t.clips.some(c => c.id === clip.id));
        if (track) {
          const sortedClips = [...track.clips].sort((a, b) => a.positionMs - b.positionMs);
          const idx = sortedClips.findIndex(c => c.id === clip.id);
          const nextClip = sortedClips[idx + 1];
          if (nextClip && nextClip.transitionIn && nextClip.transitionIn.type !== 'none') {
            transOut = nextClip.transitionIn;
            transOutDuration = nextClip.transitionIn.durationMs;
          }
        }
        const isTransOutActive = transOutDuration > 0 &&
          currentTime >= (clip.positionMs + clip.durationMs) - transOutDuration / 2 &&
          currentTime < (clip.positionMs + clip.durationMs) + transOutDuration / 2;

        // Calculate opacity and transition progress
        let hasTransition = false;
        let activeTrans = null;
        let transProgress = 1;
        let isOutgoing = false;

        const isIncomingTransActive = !!(isTransInActive && transIn);
        const isOutgoingTransActive = !!(isTransOutActive && transOut);

        if (isIncomingTransActive && transIn) {
          hasTransition = true;
          activeTrans = transIn;
          transProgress = (currentTime - (clip.positionMs - transInDuration / 2)) / transInDuration;
        } else if (isOutgoingTransActive && transOut) {
          hasTransition = true;
          activeTrans = transOut;
          transProgress = (currentTime - ((clip.positionMs + clip.durationMs) - transOutDuration / 2)) / transOutDuration;
          isOutgoing = true;
        } else {
          // Standard fade in/out if no transition is active
          if (clipOffset >= 0 && clipOffset < fadeIn && fadeIn > 0) {
            opacity = clipOffset / fadeIn;
          } else if (clipOffset > clip.durationMs - fadeOut && fadeOut > 0) {
            opacity = (clip.positionMs + clip.durationMs - currentTime) / fadeOut;
          }
        }

        // Apply keyframed opacity multiplier
        const keyframeOpacity = evaluateKeyframe(clip.keyframes?.opacity, clipOffset, 100) / 100;
        opacity = opacity * keyframeOpacity;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(opacity, 1.0));

        if ((clip.type === 'video' || clip.type === 'image') && clip.assetId) {
          const isAIAvatar = clip.type === 'video' && clip.assetId.startsWith('avatar_');
          const media = clip.type === 'video' && !isAIAvatar ? (mediaElementsRef.current.get(`${clip.id}_${clip.assetId}`) as HTMLVideoElement | undefined) : null;
          const img = clip.type === 'image' ? imageElementsRef.current.get(clip.assetId) : null;

          const isShape = clip.type === 'image' && !!clip.shapeSettings;
          // During transitions allow falling back to cache even if media isn't ready
          const clipCacheForReady = videoFrameCacheRef.current.get(clip.id);
          const isMediaReadyOrCached = isAIAvatar
            || isShape
            || (media && (media.readyState >= 2 || (clipCacheForReady && clipCacheForReady.width > 0)))
            || (img && img.complete && img.naturalWidth > 0);

          if (isMediaReadyOrCached) {
            const passes = (compareMode && clip.enhanceVideo) ? ['before', 'after'] : ['normal'];
            for (const pass of passes) {
              ctx.save();
              if (pass === 'before') {
                ctx.beginPath();
                ctx.rect(0, 0, canvas.width * splitRatio, canvas.height);
                ctx.clip();
              } else if (pass === 'after') {
                ctx.beginPath();
                ctx.rect(canvas.width * splitRatio, 0, canvas.width * (1.0 - splitRatio), canvas.height);
                ctx.clip();
              }

              // Build filter string from colorAdjustments and filterSettings
              let filterString = '';

              // Apply color adjustments
              if (clip.colorAdjustments) {
                const { brightness, contrast, saturation } = clip.colorAdjustments;
                filterString += `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) `;
              }

              const shouldEnhance = (pass === 'normal' && clip.enhanceVideo) || pass === 'after';
              if (shouldEnhance) {
                filterString += 'contrast(1.15) saturate(1.15) brightness(1.02) ';
              }

            // Apply filter presets
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

            // Apply CSS-based videoEffects from effects-registry
            if (clip.videoEffects) {
              for (const eff of clip.videoEffects) {
                const effFilter = buildEffectFilterString(eff.id, eff.intensity);
                if (effFilter) filterString += effFilter + ' ';
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

            // Apply wipe clip-region for wipe transitions (before translate)
            const isWipe = hasTransition && activeTrans && !isOutgoing && ['wipe-left','wipe-right','wipe-up','wipe-down'].includes(activeTrans.type);
            if (isWipe && activeTrans) {
              ctx.save();
              applyWipeClip(ctx as CanvasRenderingContext2D, activeTrans.type, transProgress, canvas.width, canvas.height, (activeTrans as any).easing);
            }

            ctx.translate(cx + tx, cy + ty);

            // Apply transition animation: use registry for easing + transform
            if (hasTransition && activeTrans && !isWipe) {
              applyTransitionTransform(
                ctx as CanvasRenderingContext2D,
                activeTrans.type,
                transProgress,
                canvas.width,
                canvas.height,
                currentTime,
                isOutgoing,
                (activeTrans as any).easing
              );
            } else if (!hasTransition) {
              // No-op: drawn normally
            }

            if (tRotation !== 0) ctx.rotate((tRotation * Math.PI) / 180);
            if (tScale !== 1) ctx.scale(tScale, tScale);

            if (!offscreenCanvasRef.current) {
              offscreenCanvasRef.current = document.createElement('canvas');
            }
            const offscreen = offscreenCanvasRef.current;
            if (offscreen.width !== canvas.width || offscreen.height !== canvas.height) {
              offscreen.width = canvas.width;
              offscreen.height = canvas.height;
            }
            const offCtx = offscreen.getContext('2d');
            if (offCtx) {
              offCtx.clearRect(0, 0, offscreen.width, offscreen.height);
              offCtx.filter = filterString.trim() || 'none';
              
              if (isAIAvatar) {
                const preset = clip.assetId.substring(7);
                offCtx.save();
                offCtx.translate(offscreen.width / 2, offscreen.height / 2);
                drawAIAvatar(offCtx as CanvasRenderingContext2D, preset, clipOffset, offscreen.width, offscreen.height, isPlaying);
                offCtx.restore();
              } else if (isShape && clip.shapeSettings) {
                // Calculate aspect ratio preserving destination rectangle (contain fit)
                const sourceWidth = clip.shapeSettings.width || 300;
                const sourceHeight = clip.shapeSettings.height || 300;
                const srcRatio = sourceWidth / sourceHeight;
                const destRatio = offscreen.width / offscreen.height;

                let dWidth = offscreen.width;
                let dHeight = offscreen.height;
                let dx = 0;
                let dy = 0;
                if (srcRatio > destRatio) {
                  dHeight = offscreen.width / srcRatio;
                  dy = (offscreen.height - dHeight) / 2;
                } else {
                  dWidth = offscreen.height * srcRatio;
                  dx = (offscreen.width - dWidth) / 2;
                }

                offCtx.save();
                offCtx.fillStyle = clip.shapeSettings.color || '#3b82f6';
                offCtx.strokeStyle = clip.shapeSettings.strokeColor || '#ffffff';
                offCtx.lineWidth = clip.shapeSettings.strokeWidth !== undefined ? clip.shapeSettings.strokeWidth : 3;
                offCtx.lineJoin = 'round';
                offCtx.lineCap = 'round';

                // Center coordinates and sizes relative to contain fit box
                const cx = dx + dWidth / 2;
                const cy = dy + dHeight / 2;
                const type = clip.shapeSettings.type;

                const fillVal = clip.shapeSettings.color;
                const strokeVal = clip.shapeSettings.strokeColor;
                const hasFill = fillVal && fillVal !== 'transparent' && fillVal !== 'none';
                const hasStroke = offCtx.lineWidth > 0 && strokeVal && strokeVal !== 'transparent' && strokeVal !== 'none';

                offCtx.beginPath();
                if (type === 'circle') {
                  const rx = Math.max(2, dWidth / 2 - offCtx.lineWidth);
                  const ry = Math.max(2, dHeight / 2 - offCtx.lineWidth);
                  offCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                } else if (type === 'rectangle') {
                  const strokeOffset = offCtx.lineWidth;
                  offCtx.rect(cx - dWidth / 2 + strokeOffset, cy - dHeight / 2 + strokeOffset, Math.max(1, dWidth - strokeOffset * 2), Math.max(1, dHeight - strokeOffset * 2));
                } else if (type === 'triangle') {
                  const strokeOffset = offCtx.lineWidth;
                  offCtx.moveTo(cx, cy - dHeight / 2 + strokeOffset);
                  offCtx.lineTo(cx - dWidth / 2 + strokeOffset, cy + dHeight / 2 - strokeOffset);
                  offCtx.lineTo(cx + dWidth / 2 - strokeOffset, cy + dHeight / 2 - strokeOffset);
                  offCtx.closePath();
                } else if (type === 'arrow') {
                  const length = dWidth * 0.95;
                  const thickness = dHeight * 0.3;
                  offCtx.moveTo(cx - length / 2, cy - thickness / 2);
                  offCtx.lineTo(cx + length / 6, cy - thickness / 2);
                  offCtx.lineTo(cx + length / 6, cy - thickness);
                  offCtx.lineTo(cx + length / 2, cy);
                  offCtx.lineTo(cx + length / 6, cy + thickness);
                  offCtx.lineTo(cx + length / 6, cy + thickness / 2);
                  offCtx.lineTo(cx - length / 2, cy + thickness / 2);
                  offCtx.closePath();
                } else if (type === 'star') {
                  const spikes = 5;
                  const rx = Math.max(2, dWidth / 2 - offCtx.lineWidth);
                  const ry = Math.max(2, dHeight / 2 - offCtx.lineWidth);
                  const rxInner = rx / 2;
                  const ryInner = ry / 2;
                  let rot = Math.PI / 2 * 3;
                  const step = Math.PI / spikes;

                  offCtx.moveTo(cx, cy - ry);
                  for (let i = 0; i < spikes; i++) {
                    let x = cx + Math.cos(rot) * rx;
                    let y = cy + Math.sin(rot) * ry;
                    offCtx.lineTo(x, y);
                    rot += step;

                    x = cx + Math.cos(rot) * rxInner;
                    y = cy + Math.sin(rot) * ryInner;
                    offCtx.lineTo(x, y);
                    rot += step;
                  }
                  offCtx.lineTo(cx, cy - ry);
                  offCtx.closePath();
                }

                if (hasFill) {
                  offCtx.fill();
                }
                if (hasStroke) {
                  offCtx.stroke();
                }
                offCtx.restore();
              } else if (media || img) {
                // Calculate aspect ratio preserving destination rectangle (contain fit)
                const sourceWidth = media ? media.videoWidth : (img ? img.naturalWidth : offscreen.width);
                const sourceHeight = media ? media.videoHeight : (img ? img.naturalHeight : offscreen.height);
                const srcRatio = (sourceWidth || offscreen.width) / (sourceHeight || offscreen.height);
                const destRatio = offscreen.width / offscreen.height;
                
                let dWidth = offscreen.width;
                let dHeight = offscreen.height;
                let dx = 0;
                let dy = 0;

                const cacheMap = videoFrameCacheRef.current;
                if (media && !cacheMap.has(clip.id)) {
                  cacheMap.set(clip.id, document.createElement('canvas'));
                }
                let clipCache = media ? cacheMap.get(clip.id) : null;

                if ((!clipCache || clipCache.width === 0) && media) {
                  for (const [cachedClipId, cachedCanvas] of cacheMap.entries()) {
                    const otherClip = project.tracks.flatMap(t => t.clips).find(c => c.id === cachedClipId);
                    if (otherClip && otherClip.assetId === clip.assetId && cachedCanvas.width > 0) {
                      clipCache = cachedCanvas;
                      break;
                    }
                  }
                }

                if (media && !media.seeking && media.readyState >= 2 && media.videoWidth > 0) {
                  const cCanvas = cacheMap.get(clip.id);
                  if (cCanvas) {
                    if (cCanvas.width !== media.videoWidth || cCanvas.height !== media.videoHeight) {
                      cCanvas.width = media.videoWidth;
                      cCanvas.height = media.videoHeight;
                    }
                    const cCtx = cCanvas.getContext('2d');
                    if (cCtx) {
                      cCtx.drawImage(media, 0, 0);
                    }
                  }
                }

                let drawSource: CanvasImageSource = media || img!;
                if (media && (media.seeking || media.readyState < 2) && clipCache && clipCache.width > 0) {
                  drawSource = clipCache;
                }

                if (clip.smartReframe && clip.smartReframe.enabled) {
                  const scale = Math.max(offscreen.width / (sourceWidth || 1920), offscreen.height / (sourceHeight || 1080));
                  dWidth = (sourceWidth || 1920) * scale;
                  dHeight = (sourceHeight || 1080) * scale;

                  const frameNum = Math.floor(currentTime / 33);
                  if (frameNum % 10 === 0) {
                    offCtx.drawImage(drawSource, 0, 0, offscreen.width, offscreen.height);
                    const rawX = getSubjectFaceCenter(offCtx, offscreen.width, offscreen.height);
                    const smoothing = (clip.smartReframe.smoothing ?? 20) / 100;
                    const prevX = smoothedRefX.current[clip.id] !== undefined ? smoothedRefX.current[clip.id] : 0.5;
                    smoothedRefX.current[clip.id] = prevX * (1 - smoothing) + rawX * smoothing;
                  }

                  const faceX = smoothedRefX.current[clip.id] !== undefined ? smoothedRefX.current[clip.id] : 0.5;
                  dx = (offscreen.width / 2) - (faceX * dWidth);
                  dx = Math.max(offscreen.width - dWidth, Math.min(0, dx));
                  dy = (offscreen.height - dHeight) / 2;

                  offCtx.clearRect(0, 0, offscreen.width, offscreen.height);
                } else {
                  if (srcRatio > destRatio) {
                    dHeight = offscreen.width / srcRatio;
                    dy = (offscreen.height - dHeight) / 2;
                  } else {
                    dWidth = offscreen.height * srcRatio;
                    dx = (offscreen.width - dWidth) / 2;
                  }
                }

                // Fill letterbox "dead space" areas by drawing a blurred background of the same color pixels
                if (dx > 0 || dy > 0) {
                  let cWidth = offscreen.width;
                  let cHeight = offscreen.height;
                  let cX = 0;
                  let cY = 0;
                  if (srcRatio > destRatio) {
                    cWidth = offscreen.height * srcRatio;
                    cX = (offscreen.width - cWidth) / 2;
                  } else {
                    cHeight = offscreen.width / srcRatio;
                    cY = (offscreen.height - cHeight) / 2;
                  }
                  offCtx.save();
                  // Apply temporary heavy blur filter to background image
                  offCtx.filter = 'blur(40px) brightness(0.65)';
                  offCtx.drawImage(drawSource, cX, cY, cWidth, cHeight);
                  offCtx.restore();
                  // Reset filter for the foreground contain-fit image draw
                  offCtx.filter = filterString.trim() || 'none';
                }

                offCtx.drawImage(drawSource, dx, dy, dWidth, dHeight);

                // Draw dip-to-black / dip-to-white / flash overlay restricted to the clip box
                if (hasTransition && activeTrans) {
                  drawTransitionOverlay(
                    offCtx as CanvasRenderingContext2D,
                    activeTrans.type,
                    transProgress,
                    offscreen.width,
                    offscreen.height,
                    dx,
                    dy,
                    dWidth,
                    dHeight,
                    (activeTrans as any).easing
                  );
                }
              }
              offCtx.filter = 'none';

              // Apply canvas-based video effects (pixel ops) from effects-registry
              if (clip.videoEffects) {
                for (const eff of clip.videoEffects) {
                  applyCanvasEffect(
                    offCtx as CanvasRenderingContext2D,
                    eff.id,
                    eff.intensity,
                    offscreen.width,
                    offscreen.height,
                    currentTime
                  );
                }
              }

              // AI Subject Background Removal/Blur (MediaPipe integration)
              if (clip.aiBackgroundRemoval && clip.aiBackgroundRemoval.enabled) {
                const mode = clip.aiBackgroundRemoval.mode || 'remove';
                
                // Lazy initialize the segmenter
                if (!segmenterRef.current) {
                  segmenterRef.current = new MediaPipeSelfieSegmentation();
                  segmenterRef.current.init().catch(err => console.warn("Failed to initialize MediaPipe segmenter for live preview:", err));
                }

                segmenterFrameCounterRef.current++;
                if (segmenterRef.current && !segmenterProcessingRef.current && segmenterFrameCounterRef.current % 3 === 0) {
                  // Create a static copy of offscreen canvas
                  const sendCanvas = document.createElement('canvas');
                  sendCanvas.width = offscreen.width;
                  sendCanvas.height = offscreen.height;
                  const sendCtx = sendCanvas.getContext('2d')!;
                  sendCtx.drawImage(offscreen, 0, 0);

                  segmenterProcessingRef.current = true;
                  segmenterRef.current.onResults((results) => {
                    let cachedCanvas = segmentationMasksRef.current.get(clip.id);
                    if (!cachedCanvas) {
                      cachedCanvas = document.createElement('canvas');
                      segmentationMasksRef.current.set(clip.id, cachedCanvas);
                    }
                    if (cachedCanvas.width !== offscreen.width || cachedCanvas.height !== offscreen.height) {
                      cachedCanvas.width = offscreen.width;
                      cachedCanvas.height = offscreen.height;
                    }
                    const cCtx = cachedCanvas.getContext('2d')!;
                    cCtx.clearRect(0, 0, cachedCanvas.width, cachedCanvas.height);
                    cCtx.drawImage(results.segmentationMask, 0, 0, cachedCanvas.width, cachedCanvas.height);
                    
                    segmenterProcessingRef.current = false;
                    if (!useEditorStore.getState().isPlaying) {
                      drawRef.current();
                    }
                  });

                  segmenterRef.current.send(sendCanvas).catch((err) => {
                    segmenterProcessingRef.current = false;
                    console.warn("Selfie segmenter send error in preview:", err);
                  });
                }

                // Apply background removal using cached mask
                const maskCanvas = segmentationMasksRef.current.get(clip.id);
                if (maskCanvas) {
                  const tempCanvas = document.createElement('canvas');
                  tempCanvas.width = offscreen.width;
                  tempCanvas.height = offscreen.height;
                  const tempCtx = tempCanvas.getContext('2d')!;
                  tempCtx.drawImage(offscreen, 0, 0);

                  if (mode === 'blur') {
                    offCtx.save();
                    const radius = clip.aiBackgroundRemoval.blurRadius || 10;
                    offCtx.filter = `blur(${radius}px)`;
                    offCtx.drawImage(tempCanvas, 0, 0);
                    offCtx.restore();
                  } else {
                    offCtx.clearRect(0, 0, offscreen.width, offscreen.height);
                  }

                  const personCanvas = document.createElement('canvas');
                  personCanvas.width = offscreen.width;
                  personCanvas.height = offscreen.height;
                  const personCtx = personCanvas.getContext('2d')!;
                  personCtx.drawImage(tempCanvas, 0, 0);

                  personCtx.globalCompositeOperation = 'destination-in';
                  personCtx.drawImage(maskCanvas, 0, 0, offscreen.width, offscreen.height);
                  personCtx.globalCompositeOperation = 'source-over';

                  offCtx.drawImage(personCanvas, 0, 0);
                } else {
                  // Fallback: Radial gradient mask until segmentation is loaded
                  const faceX = smoothedRefX.current[clip.id] !== undefined ? smoothedRefX.current[clip.id] : 0.5;
                  const tempCanvas = document.createElement('canvas');
                  tempCanvas.width = offscreen.width;
                  tempCanvas.height = offscreen.height;
                  const tempCtx = tempCanvas.getContext('2d')!;
                  tempCtx.drawImage(offscreen, 0, 0);

                  if (mode === 'blur') {
                    offCtx.save();
                    const radius = clip.aiBackgroundRemoval.blurRadius || 10;
                    offCtx.filter = `blur(${radius}px)`;
                    offCtx.drawImage(tempCanvas, 0, 0);
                    offCtx.restore();
                  } else {
                    offCtx.clearRect(0, 0, offscreen.width, offscreen.height);
                  }

                  tempCtx.save();
                  tempCtx.globalCompositeOperation = 'destination-in';
                  const grad = tempCtx.createRadialGradient(
                    faceX * offscreen.width, offscreen.height * 0.45, offscreen.height * 0.15,
                    faceX * offscreen.width, offscreen.height * 0.5, offscreen.height * 0.5
                  );
                  grad.addColorStop(0, 'rgba(0,0,0,1)');
                  grad.addColorStop(0.65, 'rgba(0,0,0,0.85)');
                  grad.addColorStop(1, 'rgba(0,0,0,0)');
                  tempCtx.fillStyle = grad;
                  tempCtx.fillRect(0, 0, offscreen.width, offscreen.height);
                  tempCtx.restore();

                  offCtx.drawImage(tempCanvas, 0, 0);
                }
              }

              // Collapsed Single-Pass Pixel Pipeline (Chroma Key, HSL, LUT, LGG)
              const hasChromaKey = clip.chromaKey && clip.chromaKey.enabled;
              const hasHsl = clip.hslAdjustments && (clip.hslAdjustments.hue !== 0 || clip.hslAdjustments.saturation !== 0 || clip.hslAdjustments.lightness !== 0);
              
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

              const needPixelPipeline = hasChromaKey || hasHsl || lutEntry || hasLGG;

              if (needPixelPipeline) {
                const success = webglPipeline.process(
                  offscreen,
                  {
                    chromaKey: clip.chromaKey,
                    hslAdjustments: clip.hslAdjustments,
                    lutEntry,
                    lutText,
                    colorCorrection: clip.colorCorrection
                  },
                  offCtx
                );

                if (!success) {
                  const imgData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
                  const data = imgData.data;

                  // Precompute chroma key targets
                  const targetHex = clip.chromaKey?.color || '#00ff00';
                  const rTarget = parseInt(targetHex.slice(1, 3), 16);
                  const gTarget = parseInt(targetHex.slice(3, 5), 16);
                  const bTarget = parseInt(targetHex.slice(5, 7), 16);
                  const tolerance = clip.chromaKey?.tolerance || 30;
                  const feather = clip.chromaKey?.feather || 10;

                  // Precompute HSL shift targets
                  const hShift = clip.hslAdjustments?.hue || 0;
                  const sShift = clip.hslAdjustments?.saturation || 0;
                  const lShift = clip.hslAdjustments?.lightness || 0;

                  for (let i = 0; i < data.length; i += 4) {
                    let a = data[i+3];
                    if (a === 0) continue;

                    let r = data[i];
                    let g = data[i+1];
                    let b = data[i+2];

                    // 1. Chroma Key
                    if (hasChromaKey) {
                      const dist = Math.sqrt((r - rTarget)**2 + (g - gTarget)**2 + (b - bTarget)**2);
                      if (dist < tolerance) {
                        a = 0;
                      } else if (dist < tolerance + feather) {
                        const ratio = (dist - tolerance) / feather;
                        a = Math.min(a, ratio * 255);
                      }
                      if (a === 0) {
                        data[i+3] = 0;
                        continue;
                      }
                    }

                    let rNorm = r / 255;
                    let gNorm = g / 255;
                    let bNorm = b / 255;

                    // 2. HSL Adjustments
                    if (hasHsl) {
                      const max = Math.max(rNorm, gNorm, bNorm);
                      const min = Math.min(rNorm, gNorm, bNorm);
                      let h = 0, s = 0, l = (max + min) / 2;

                      if (max !== min) {
                        const d = max - min;
                        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                        switch (max) {
                          case rNorm: h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0); break;
                          case gNorm: h = (bNorm - rNorm) / d + 2; break;
                          case bNorm: h = (rNorm - gNorm) / d + 4; break;
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
                      rNorm = rNew;
                      gNorm = gNew;
                      bNorm = bNew;
                    }

                    // 3. LUT application
                    if (lutEntry) {
                      const result = applyLut3D(rNorm, gNorm, bNorm, lutEntry.table, lutEntry.size);
                      rNorm = result.r;
                      gNorm = result.g;
                      bNorm = result.b;
                    }

                    // 4. LGG (Lift Gamma Gain)
                    if (hasLGG) {
                      // Shadows Lift
                      rNorm = rNorm + (lift.r / 100) * (1.0 - rNorm);
                      gNorm = gNorm + (lift.g / 100) * (1.0 - gNorm);
                      bNorm = bNorm + (lift.b / 100) * (1.0 - bNorm);

                      // Midtones Gamma
                      const midR = Math.sin(rNorm * Math.PI) * (gamma.r / 100);
                      const midG = Math.sin(gNorm * Math.PI) * (gamma.g / 100);
                      const midB = Math.sin(bNorm * Math.PI) * (gamma.b / 100);
                      rNorm = Math.max(0, Math.min(1, rNorm + midR));
                      gNorm = Math.max(0, Math.min(1, gNorm + midG));
                      bNorm = Math.max(0, Math.min(1, bNorm + midB));

                      // Highlights Gain
                      rNorm = rNorm * (1.0 + gain.r / 100);
                      gNorm = gNorm * (1.0 + gain.g / 100);
                      bNorm = bNorm * (1.0 + gain.b / 100);
                    }

                    data[i] = Math.round(Math.max(0, Math.min(1, rNorm)) * 255);
                    data[i+1] = Math.round(Math.max(0, Math.min(1, gNorm)) * 255);
                    data[i+2] = Math.round(Math.max(0, Math.min(1, bNorm)) * 255);
                    data[i+3] = Math.round(a);
                  }
                  offCtx.putImageData(imgData, 0, 0);
                }
              }

              ctx.drawImage(offscreen, -cx, -cy, canvas.width, canvas.height);
            }

            // Close wipe clip region
            if (isWipe) ctx.restore();

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
            ctx.restore(); // restore the pass clip region
          }
        }
        } else if (trackType === 'text' && clip.textSettings) {
          const settings = clip.textSettings;
          ctx.save();
          
          const scaleRatio = canvas.height / 360;
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
          
          const xPos = settings.x * canvas.width;
          const yPos = settings.y * canvas.height;

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

        ctx.restore();
      });

      // Apply global effect track clips (Effects Layer)
      const effectTracks = project.tracks.filter(t => t.type === 'effect');
      effectTracks.forEach(track => {
        if (track.hidden || track.muted) return;
        track.clips.forEach(clip => {
          const isActive = currentTime >= clip.positionMs && currentTime < clip.positionMs + clip.durationMs;
          if (isActive) {
            // 1. Apply filter settings (if a filter is placed on the effect track)
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
                if (!filterCanvasRef.current) {
                  filterCanvasRef.current = document.createElement('canvas');
                }
                const offscreen = filterCanvasRef.current;
                if (offscreen.width !== canvas.width || offscreen.height !== canvas.height) {
                  offscreen.width = canvas.width;
                  offscreen.height = canvas.height;
                }
                const offCtx = offscreen.getContext('2d');
                if (offCtx) {
                  offCtx.drawImage(canvas, 0, 0);
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  ctx.save();
                  ctx.filter = filterStr;
                  ctx.drawImage(offscreen, 0, 0);
                  ctx.restore();
                }
              }
            }

            // 2. Apply video effects (if an effect is placed on the effect track)
            if (clip.videoEffects && clip.videoEffects.length > 0) {
              clip.videoEffects.forEach(eff => {
                if (!effectCanvasRef.current) {
                  effectCanvasRef.current = document.createElement('canvas');
                }
                const offscreen = effectCanvasRef.current;
                if (offscreen.width !== canvas.width || offscreen.height !== canvas.height) {
                  offscreen.width = canvas.width;
                  offscreen.height = canvas.height;
                }
                const offCtx = offscreen.getContext('2d');
                if (offCtx) {
                  offCtx.drawImage(canvas, 0, 0);
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  
                  const filterStr = buildEffectFilterString(eff.id, eff.intensity);
                  if (filterStr) {
                    ctx.save();
                    ctx.filter = filterStr;
                    ctx.drawImage(offscreen, 0, 0);
                    ctx.restore();
                  } else {
                    ctx.drawImage(offscreen, 0, 0);
                  }
                  
                  applyCanvasEffect(
                    ctx as CanvasRenderingContext2D,
                    eff.id,
                    eff.intensity,
                    canvas.width,
                    canvas.height,
                    currentTime
                  );
                }
              });
            }
          }
        });
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
  }, [isPlaying]);

  // Precise delta-time clock to drive currentTime progression smoothly at 60fps
  useEffect(() => {
    if (!isPlaying || !project) return;

    let lastTime = performance.now();
    let animId: number;

    const tick = () => {
      const now = performance.now();
      const delta = now - lastTime;
      lastTime = now;

      // Adjust for playback speed (supports J/K/L reverse/fast-forward multipliers)
      const speed = useEditorStore.getState().playbackSpeed ?? 1;
      const nextTime = useEditorStore.getState().currentTime + delta * speed;
      
      if (nextTime >= totalDuration) {
        setCurrentTime(0);
        setIsPlaying(false);
        useEditorStore.setState({ playbackSpeed: 1 });
      } else if (nextTime < 0) {
        setCurrentTime(0);
        setIsPlaying(false);
        useEditorStore.setState({ playbackSpeed: 1 });
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

  const [showSafeZone, setShowSafeZone] = useState(false);

  const formatTimecode = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = Math.floor(totalSec % 60);
    const frames = Math.floor((ms % 1000) / 33.33); // 30 fps
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
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
        let newX = startTextX + deltaX / canvas.width;
        let newY = startTextY + deltaY / canvas.height;

        const snapThresholdPct = 0.015;

        if (Math.abs(newX - 0.5) < snapThresholdPct) {
          newX = 0.5;
          setSnapX(true);
        } else {
          setSnapX(false);
        }

        if (Math.abs(newY - 0.5) < snapThresholdPct) {
          newY = 0.5;
          setSnapY(true);
        } else {
          setSnapY(false);
        }

        updateClip(selectedClip.id, {
          textSettings: {
            ...selectedClip.textSettings,
            x: Math.max(0, Math.min(1, newX)),
            y: Math.max(0, Math.min(1, newY))
          }
        });
      } else {
        let newX = startX + deltaX;
        let newY = startY + deltaY;

        const snapThreshold = 12;

        if (Math.abs(newX) < snapThreshold) {
          newX = 0;
          setSnapX(true);
        } else {
          setSnapX(false);
        }

        if (Math.abs(newY) < snapThreshold) {
          newY = 0;
          setSnapY(true);
        } else {
          setSnapY(false);
        }

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
      setSnapX(false);
      setSnapY(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const selectedClip = project?.tracks
    .flatMap(t => t.clips)
    .find(c => c.id === selectedClipId);

  const showOverlay = selectedClip && (selectedClip.type === 'video' || selectedClip.type === 'image');

  // Calculate contain-fit coordinates mapping project coords to percentage bounds
  let left_pct = 0;
  let top_pct = 0;
  let width_pct = 100;
  let height_pct = 100;
  let tRotation = 0;

  if (selectedClip && showOverlay) {
    let mediaWidth = project?.width || 1920;
    let mediaHeight = project?.height || 1080;

    if (selectedClip.type === 'video') {
      const media = mediaElementsRef.current.get(`${selectedClip.id}_${selectedClip.assetId}`);
      if (media && media instanceof HTMLVideoElement) {
        mediaWidth = media.videoWidth || mediaWidth;
        mediaHeight = media.videoHeight || mediaHeight;
      }
    } else if (selectedClip.type === 'image') {
      if (selectedClip.shapeSettings) {
        mediaWidth = selectedClip.shapeSettings.width || 300;
        mediaHeight = selectedClip.shapeSettings.height || 300;
      } else {
        const img = selectedClip.assetId ? imageElementsRef.current.get(selectedClip.assetId) : null;
        if (img && img instanceof HTMLImageElement) {
          mediaWidth = img.naturalWidth || mediaWidth;
          mediaHeight = img.naturalHeight || mediaHeight;
        }
      }
    }

    const W = project?.width || 1920;
    const H = project?.height || 1080;

    const tx = selectedClip.transform?.x || 0;
    const ty = selectedClip.transform?.y || 0;
    tRotation = selectedClip.transform?.rotation || 0;
    const tScale = (selectedClip.transform?.scale !== undefined ? selectedClip.transform.scale : 100) / 100;

    const srcRatio = mediaWidth / mediaHeight;
    const destRatio = W / H;

    let baseW = W;
    let baseH = H;

    if (srcRatio > destRatio) {
      baseW = W;
      baseH = W / srcRatio;
    } else {
      baseW = H * srcRatio;
      baseH = H;
    }

    const clipW = baseW * tScale;
    const clipH = baseH * tScale;

    const cx = W / 2 + tx;
    const cy = H / 2 + ty;

    const left = cx - clipW / 2;
    const top = cy - clipH / 2;

    left_pct = (left / W) * 100;
    top_pct = (top / H) * 100;
    width_pct = (clipW / W) * 100;
    height_pct = (clipH / H) * 100;
  }

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!selectedClip) return;

    const canvas = canvasRef.current;
    if (!canvas || !project) return;
    const rect = canvas.getBoundingClientRect();

    const W = project.width;
    const H = project.height;

    const tx = selectedClip.transform?.x || 0;
    const ty = selectedClip.transform?.y || 0;
    const cx = W / 2 + tx;
    const cy = H / 2 + ty;

    const screenCx = rect.left + (cx / W) * rect.width;
    const screenCy = rect.top + (cy / H) * rect.height;

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;

    const dx = startMouseX - screenCx;
    const dy = startMouseY - screenCy;
    const startDist = Math.sqrt(dx * dx + dy * dy);

    const startScale = selectedClip.transform?.scale !== undefined ? selectedClip.transform.scale : 100;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const curDx = moveEvent.clientX - screenCx;
      const curDy = moveEvent.clientY - screenCy;
      const curDist = Math.sqrt(curDx * curDx + curDy * curDy);

      if (startDist > 0) {
        const newScale = Math.round(startScale * (curDist / startDist));
        const clampedScale = Math.max(5, Math.min(500, newScale));
        updateClip(selectedClip.id, {
          transform: {
            ...(selectedClip.transform || {
              x: 0,
              y: 0,
              rotation: 0,
              uniformScale: true,
              blendMode: 'normal'
            }),
            scale: clampedScale
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

  const handleRotateMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!selectedClip) return;

    const canvas = canvasRef.current;
    if (!canvas || !project) return;
    const rect = canvas.getBoundingClientRect();

    const W = project.width;
    const H = project.height;

    const tx = selectedClip.transform?.x || 0;
    const ty = selectedClip.transform?.y || 0;
    const cx = W / 2 + tx;
    const cy = H / 2 + ty;

    const screenCx = rect.left + (cx / W) * rect.width;
    const screenCy = rect.top + (cy / H) * rect.height;

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;

    const startAngle = Math.atan2(startMouseY - screenCy, startMouseX - screenCx);
    const startRotation = selectedClip.transform?.rotation || 0;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const curAngle = Math.atan2(moveEvent.clientY - screenCy, moveEvent.clientX - screenCx);
      const deltaAngle = curAngle - startAngle;
      const deltaDegrees = (deltaAngle * 180) / Math.PI;

      let newRotation = Math.round(startRotation + deltaDegrees);
      newRotation = ((newRotation % 360) + 360) % 360;

      updateClip(selectedClip.id, {
        transform: {
          ...(selectedClip.transform || {
            x: 0,
            y: 0,
            scale: 100,
            uniformScale: true,
            blendMode: 'normal'
          }),
          rotation: newRotation
        }
      });
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
          className="relative max-w-full max-h-full bg-black rounded overflow-visible border border-[#2c2c32] shadow-2xl transition-all flex items-center justify-center"
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

          {compareMode && (
            <>
              {/* Visual Divider Line */}
              <div 
                className="absolute top-0 bottom-0 w-[2.5px] bg-white cursor-ew-resize z-45 group flex items-center justify-center shadow-[0_0_12px_rgba(255,255,255,0.8)]"
                style={{ left: `${splitRatio * 100}%` }}
                onMouseDown={(mouseDownEvent) => {
                  mouseDownEvent.preventDefault();
                  const containerElement = mouseDownEvent.currentTarget.parentElement!;
                  const handleMouseMove = (moveEvent: MouseEvent) => {
                    const rect = containerElement.getBoundingClientRect();
                    const relativeX = moveEvent.clientX - rect.left;
                    const newRatio = Math.max(0.01, Math.min(0.99, relativeX / rect.width));
                    setSplitRatio(newRatio);
                  };
                  const handleMouseUp = () => {
                    window.removeEventListener('mousemove', handleMouseMove);
                    window.removeEventListener('mouseup', handleMouseUp);
                  };
                  window.addEventListener('mousemove', handleMouseMove);
                  window.addEventListener('mouseup', handleMouseUp);
                }}
              >
                {/* Drag Handle Tab */}
                <div className="w-6 h-10 rounded-full bg-white border border-zinc-200 shadow-2xl flex flex-col gap-0.5 items-center justify-center pointer-events-none hover:scale-110 transition-transform">
                  <div className="w-[1.5px] h-3 bg-zinc-400 rounded-full" />
                  <div className="w-[1.5px] h-3 bg-zinc-400 rounded-full" />
                </div>
              </div>

              {/* Labels */}
              <div className="absolute top-3 left-3 px-2 py-0.5 rounded bg-black/70 backdrop-blur border border-white/10 text-[9px] font-mono font-bold text-white select-none pointer-events-none z-45 shadow">
                Original
              </div>
              <div className="absolute top-3 right-3 px-2 py-0.5 rounded bg-violet-600/85 backdrop-blur border border-violet-500/20 text-[9px] font-mono font-bold text-white select-none pointer-events-none z-45 shadow">
                Enhanced
              </div>
            </>
          )}

          {/* Interactive Bounding Box Overlay */}
          {showOverlay && (
            <div 
              style={{
                position: 'absolute',
                left: `${left_pct}%`,
                top: `${top_pct}%`,
                width: `${width_pct}%`,
                height: `${height_pct}%`,
                transform: `rotate(${tRotation}deg)`,
                transformOrigin: 'center center',
                border: '1.5px solid #8b5cf6',
                pointerEvents: 'none',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
                zIndex: 40
              }}
            >
              {/* Corner handles */}
              <div
                onMouseDown={handleResizeMouseDown}
                className="absolute w-3.5 h-3.5 bg-white border-2 border-violet-600 rounded-full cursor-nwse-resize -translate-x-1/2 -translate-y-1/2"
                style={{ left: 0, top: 0, pointerEvents: 'auto' }}
              />
              <div
                onMouseDown={handleResizeMouseDown}
                className="absolute w-3.5 h-3.5 bg-white border-2 border-violet-600 rounded-full cursor-nesw-resize translate-x-1/2 -translate-y-1/2"
                style={{ right: 0, top: 0, pointerEvents: 'auto' }}
              />
              <div
                onMouseDown={handleResizeMouseDown}
                className="absolute w-3.5 h-3.5 bg-white border-2 border-violet-600 rounded-full cursor-nesw-resize -translate-x-1/2 translate-y-1/2"
                style={{ left: 0, bottom: 0, pointerEvents: 'auto' }}
              />
              <div
                onMouseDown={handleResizeMouseDown}
                className="absolute w-3.5 h-3.5 bg-white border-2 border-violet-600 rounded-full cursor-nwse-resize translate-x-1/2 translate-y-1/2"
                style={{ right: 0, bottom: 0, pointerEvents: 'auto' }}
              />

              {/* Rotation Handle Connector */}
              <div 
                className="absolute left-1/2 bottom-0 w-0.5 bg-violet-500" 
                style={{ height: '20px', transform: 'translateX(-50%) translateY(100%)' }}
              />

              {/* Rotation Button */}
              <div
                onMouseDown={handleRotateMouseDown}
                className="absolute left-1/2 bottom-0 w-7 h-7 bg-zinc-900 border border-zinc-700 hover:border-zinc-500 rounded-full shadow-lg cursor-grab flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                style={{ 
                  transform: 'translateX(-50%) translateY(32px)', 
                  pointerEvents: 'auto'
                }}
                title="Rotate clip"
              >
                <svg
                  className="w-4 h-4 text-violet-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                  />
                </svg>
              </div>
            </div>
          )}

          {/* Magnetic Center Guidelines */}
          {snapX && (
            <div 
              className="absolute top-0 bottom-0 w-[1px] border-l border-dashed border-violet-500 z-30 pointer-events-none" 
              style={{ left: '50%' }}
            />
          )}
          {snapY && (
            <div 
              className="absolute left-0 right-0 h-[1px] border-t border-dashed border-violet-500 z-30 pointer-events-none" 
              style={{ top: '50%' }}
            />
          )}

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
      <PlaybackControls
        project={project}
        totalDuration={totalDuration}
        assetsLoaded={assetsLoaded}
        isPlaying={isPlaying}
        upscaleEnabled={upscaleEnabled}
        showSafeZone={showSafeZone}
        setShowSafeZone={setShowSafeZone}
        compareMode={compareMode}
        setCompareMode={setCompareMode}
        scrubberRef={scrubberRef}
        mobileTimecodeRef={mobileTimecodeRef}
        desktopTimecodeRef={desktopTimecodeRef}
        setCurrentTime={setCurrentTime}
        togglePlay={togglePlay}
        handleFullscreen={handleFullscreen}
      />
    </div>
  );
}

function drawAIAvatar(
  ctx: CanvasRenderingContext2D,
  preset: string,
  clipOffsetMs: number,
  width: number,
  height: number,
  isPlaying: boolean
) {
  const size = Math.min(width, height) * 0.45;

  ctx.save();

  // Background card for avatar (centered at 0,0)
  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = preset === 'sarah' || preset === 'elena' ? '#ec4899' : '#06b6d4';
  ctx.stroke();

  // 1. Neck
  ctx.fillStyle = '#fed7aa'; // Neck skin
  ctx.beginPath();
  ctx.moveTo(-size * 0.15, size * 0.2);
  ctx.lineTo(size * 0.15, size * 0.2);
  ctx.lineTo(size * 0.12, size * 0.45);
  ctx.lineTo(-size * 0.12, size * 0.45);
  ctx.closePath();
  ctx.fill();

  // Shirt / body outline
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(-size * 0.25, size * 0.4);
  ctx.quadraticCurveTo(-size * 0.4, size * 0.6, -size * 0.5, size * 0.75);
  ctx.lineTo(size * 0.5, size * 0.75);
  ctx.quadraticCurveTo(size * 0.4, size * 0.6, size * 0.25, size * 0.4);
  ctx.closePath();
  ctx.fill();

  // Suit / clothes
  ctx.fillStyle = preset === 'sarah' ? '#1e3a8a' : preset === 'david' ? '#0f172a' : preset === 'elena' ? '#be185d' : '#0369a1';
  ctx.beginPath();
  ctx.moveTo(-size * 0.45, size * 0.75);
  ctx.lineTo(-size * 0.2, size * 0.45);
  ctx.lineTo(0, size * 0.6);
  ctx.lineTo(size * 0.2, size * 0.45);
  ctx.lineTo(size * 0.45, size * 0.75);
  ctx.closePath();
  ctx.fill();

  // Tie / collar details
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(-size * 0.08, size * 0.45);
  ctx.lineTo(0, size * 0.54);
  ctx.lineTo(size * 0.08, size * 0.45);
  ctx.lineTo(0, size * 0.6);
  ctx.closePath();
  ctx.fill();

  // 2. Head (Skin tone)
  ctx.fillStyle = '#fed7aa'; 
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.38, 0, Math.PI * 2);
  ctx.fill();

  // 3. Eyes (Blinking animation)
  const isBlinking = (Math.floor(clipOffsetMs / 3000) % 2 === 0) && (clipOffsetMs % 3000 < 150);
  ctx.fillStyle = '#1e293b';
  
  if (isBlinking) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(-size * 0.14, -size * 0.05);
    ctx.lineTo(-size * 0.04, -size * 0.05);
    ctx.moveTo(size * 0.04, -size * 0.05);
    ctx.lineTo(size * 0.14, -size * 0.05);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(-size * 0.09, -size * 0.05, size * 0.035, 0, Math.PI * 2);
    ctx.arc(size * 0.09, -size * 0.05, size * 0.035, 0, Math.PI * 2);
    ctx.fill();
    // Pupils
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-size * 0.10, -size * 0.06, size * 0.012, 0, Math.PI * 2);
    ctx.arc(size * 0.08, -size * 0.06, size * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Eyebrows
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  // Left eyebrow
  ctx.arc(-size * 0.09, -size * 0.12, size * 0.05, Math.PI * 1.15, Math.PI * 1.85);
  // Right eyebrow
  ctx.arc(size * 0.09, -size * 0.12, size * 0.05, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();

  // 5. Hair
  ctx.fillStyle = preset === 'sarah' ? '#78350f' : preset === 'david' ? '#1e293b' : preset === 'elena' ? '#d97706' : '#b45309';
  if (preset === 'sarah' || preset === 'elena') {
    // Long hair outline
    ctx.beginPath();
    ctx.arc(0, -size * 0.12, size * 0.42, Math.PI * 0.9, Math.PI * 2.1);
    ctx.quadraticCurveTo(size * 0.45, size * 0.4, size * 0.4, size * 0.6);
    ctx.lineTo(-size * 0.4, size * 0.6);
    ctx.quadraticCurveTo(-size * 0.45, size * 0.4, -size * 0.42, -size * 0.12);
    ctx.fill();
    
    // Bangs
    ctx.beginPath();
    ctx.moveTo(-size * 0.38, -size * 0.08);
    ctx.quadraticCurveTo(-size * 0.2, -size * 0.35, 0, -size * 0.25);
    ctx.quadraticCurveTo(size * 0.2, -size * 0.35, size * 0.38, -size * 0.08);
    ctx.quadraticCurveTo(0, -size * 0.45, -size * 0.38, -size * 0.08);
    ctx.fill();
  } else {
    // Short hair
    ctx.beginPath();
    ctx.arc(0, -size * 0.08, size * 0.41, Math.PI * 1.0, Math.PI * 2.0);
    ctx.quadraticCurveTo(0, -size * 0.45, -size * 0.41, -size * 0.08);
    ctx.fill();
  }

  // 6. Mouth (Talking animation)
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  const mouthOpenFactor = isPlaying ? Math.max(0.1, Math.abs(Math.sin(clipOffsetMs * 0.012))) : 0.15;
  const mouthH = size * 0.08 * mouthOpenFactor;
  const mouthW = size * 0.13;
  
  ctx.moveTo(-mouthW/2, size * 0.16);
  ctx.quadraticCurveTo(0, size * 0.13, mouthW/2, size * 0.16);
  ctx.quadraticCurveTo(0, size * 0.16 + mouthH * 2, -mouthW/2, size * 0.16);
  ctx.fill();

  if (mouthOpenFactor > 0.4) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-mouthW * 0.3, size * 0.16 + 1, mouthW * 0.6, 2);
  }

  // 7. Label tag
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(-size * 0.35, size * 0.33, size * 0.7, size * 0.12);
  ctx.fillStyle = '#38bdf8';
  ctx.font = `bold ${Math.round(size * 0.065)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(preset.toUpperCase() + ' (AI)', 0, size * 0.39);

  ctx.restore();
}
