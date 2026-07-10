import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Type, Scissors, Trash2, ZoomIn, ZoomOut, Smile, Undo2, Redo2, Magnet, Link2, Rows, Settings, Image as ImageIcon, MousePointer, Crop, Snowflake, RotateCw, Mic, RefreshCw, Copy, Clipboard, FileCog, FolderOpen, Power, Wand2, FileVideo, ChevronRight, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import { db, type TimelineClip, type TimelineTrack, type Keyframe } from '../../lib/db';
import { EFFECTS_REGISTRY } from '../../lib/effects-registry';
import { evaluateKeyframe } from '../../lib/keyframe-evaluator';
import TrackHeader from './timeline/TrackHeader';
import AddTrackPopover from './timeline/AddTrackPopover';
import TimelineMarkerLane from './timeline/TimelineMarkerLane';
import KeyframeGraphEditor from './timeline/KeyframeGraphEditor';
import VoiceoverRecorder from './timeline/VoiceoverRecorder';
import WaveformBar from './timeline/WaveformBar';
import ClipFadeHandles from './timeline/ClipFadeHandles';

const formatRulerTime = (ms: number) => {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
};

const formatClipDuration = (ms: number, fps: number = 30) => {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const frames = Math.floor((ms % 1000) / (1000 / fps));
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
};

const getTrackHeight = (type: 'video' | 'audio' | 'image' | 'text' | 'effect') => {
  switch (type) {
    case 'video':
    case 'image':
      return 52;
    case 'audio':
      return 40;
    case 'effect':
      return 30;
    case 'text':
    default:
      return 28;
  }
};

export default function Timeline({ height }: { height: number }) {
  const project = useEditorStore(state => state.project);
  const setCurrentTime = useEditorStore(state => state.setCurrentTime);
  const selectedClipId = useEditorStore(state => state.selectedClipId);
  const [isLinkedSelection, setIsLinkedSelection] = useState(true);
  const [showGraphEditor, setShowGraphEditor] = useState(false);
  const selectedClipIds = useEditorStore(state => state.selectedClipIds);
  const setSelectedClipId = useEditorStore(state => state.setSelectedClipId);
  const setSelectedClipIds = useEditorStore(state => state.setSelectedClipIds);
  const zoom = useEditorStore(state => state.zoom); // pixels per second
  const setZoom = useEditorStore(state => state.setZoom);
  const updateTracks = useEditorStore(state => state.updateTracks);
  const updateClip = useEditorStore(state => state.updateClip);
  const removeClip = useEditorStore(state => state.removeClip);
  const addClip = useEditorStore(state => state.addClip);
  const removeTrack = useEditorStore(state => state.removeTrack);
  const reorderTrack = useEditorStore(state => state.reorderTrack);
  const undo = useEditorStore(state => state.undo);
  const redo = useEditorStore(state => state.redo);
  const past = useEditorStore(state => state.past);
  const future = useEditorStore(state => state.future);
  const updateMarkers = useEditorStore(state => state.updateMarkers);

  const [showMicModal, setShowMicModal] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const snapLineRef = useRef<HTMLDivElement | null>(null);

  const showSnapLine = (posMs: number, liveZoom: number) => {
    if (!containerRef.current) return;
    if (!snapLineRef.current) {
      const snapLineEl = document.createElement('div');
      snapLineEl.style.cssText = `
        position: absolute; top: 0; bottom: 0; width: 1.5px; z-index: 100;
        background: #00e5ff; box-shadow: 0 0 8px #00e5ff, 0 0 15px rgba(0, 229, 255, 0.6);
        pointer-events: none; transition: left 0.05s;
      `;
      containerRef.current.appendChild(snapLineEl);
      snapLineRef.current = snapLineEl;
    }
    snapLineRef.current.style.left = `${posMs * (liveZoom / 1000)}px`;
  };

  const hideSnapLine = () => {
    if (snapLineRef.current) {
      snapLineRef.current.remove();
      snapLineRef.current = null;
    }
  };
  
  // Mobile touch gesture & double tap refs
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(300);
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);

  const pxPerMs = zoom / 1000;

  // Calculate dynamic timeline duration based on actual clips (minimum 1 minute, with 30s padding)
  const timelineDurationMs = useMemo(() => {
    if (!project) return 60000;
    let maxClipEnd = 0;
    project.tracks.forEach(track => {
      track.clips.forEach(clip => {
        const end = clip.positionMs + clip.durationMs;
        if (end > maxClipEnd) maxClipEnd = end;
      });
    });
    return Math.max(60000, maxClipEnd + 30000);
  }, [project]);

  // Stable minimum width dynamically scales with the timeline's active content duration
  const timelineMinWidth = useMemo(() => Math.max(3000, timelineDurationMs * pxPerMs), [pxPerMs, timelineDurationMs]);

  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const toolMode = useEditorStore(state => state.toolMode);
  const setToolMode = useEditorStore(state => state.setToolMode);
  const [razorHoverClipId, setRazorHoverClipId] = useState<string | null>(null);
  const [razorHoverX, setRazorHoverX] = useState<number>(0);

  // Helper to determine track label (e.g. V1, V2, A1, T1) based on order
  const getTrackLabel = (track: TimelineTrack) => {
    if (!project) return '';
    const sameTypeTracks = project.tracks.filter(t => t.type === track.type);
    const index = sameTypeTracks.findIndex(t => t.id === track.id);
    if (index === -1) return '';
    
    const prefix = {
      video: 'V',
      audio: 'A',
      image: 'I',
      text: 'T',
      effect: 'FX'
    }[track.type] || 'T';

    if (track.type === 'audio') {
      return `${prefix}${index + 1}`;
    } else {
      return `${prefix}${sameTypeTracks.length - index}`;
    }
  };

  // Marquee Selection Box State
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    active: boolean;
  } | null>(null);

  const [showStickers, setShowStickers] = useState(false);
  const emojis = ['❤️', '🔥', '✨', '😂', '👍', '🎉', '🚀', '💡', '🎬', '📱', '❌', '✅', '💥', '👀', '⭐', '🎈'];

  const [thumbnailCache, setThumbnailCache] = useState<Record<string, string[]>>({});
  const thumbnailCacheRef = useRef<Record<string, string[]>>({});
  const [waveformCache, setWaveformCache] = useState<Record<string, number[]>>({});
  const waveformCacheRef = useRef<Record<string, number[]>>({});
  const [assetDurations, setAssetDurations] = useState<Record<string, number>>({});
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const snapEnabledRef = useRef(true);
  const [rippleEnabled, setRippleEnabled] = useState(false);
  const rippleEnabledRef = useRef(false);

  const selectedClip = useMemo(() => {
    if (!selectedClipId || !project) return null;
    for (const track of project.tracks) {
      const c = track.clips.find(x => x.id === selectedClipId);
      if (c) return c;
    }
    return null;
  }, [selectedClipId, project]);

  useEffect(() => { rippleEnabledRef.current = rippleEnabled; }, [rippleEnabled]);

  // Load durations of all assets on the timeline
  useEffect(() => {
    if (!project) return;
    const assetIds = new Set<string>();
    project.tracks.forEach(t => {
      t.clips.forEach(c => {
        if (c.assetId) assetIds.add(c.assetId);
      });
    });

    Promise.all(
      Array.from(assetIds).map(async (id) => {
        const asset = await db.assets.get(id);
        return { id, duration: asset?.durationMs || 0 };
      })
    ).then(results => {
      const map: Record<string, number> = {};
      results.forEach(r => {
        map[r.id] = r.duration;
      });
      setAssetDurations(map);
    });
  }, [project]);

  // Keep snapEnabledRef in sync
  useEffect(() => { snapEnabledRef.current = snapEnabled; }, [snapEnabled]);



  // Track the highest scrollLeft we've auto-scrolled to — guarantees we never go back left
  const autoScrollMaxRef = useRef(0);
  const playheadRef = useRef<HTMLDivElement>(null);
  const playheadTextRef = useRef<HTMLDivElement>(null);
  const headersRef = useRef<HTMLDivElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;

    // Never allow scrolling past the left edge (time = 0)
    if (el.scrollLeft < 0) {
      el.scrollLeft = 0;
    }

    // Sync vertical scroll of the left gutter headers
    if (headersRef.current) {
      headersRef.current.scrollTop = el.scrollTop;
    }
  };

  // High-Performance Playhead & Auto-Scroll Subscription:
  // Updates the DOM directly on every frame without triggering React re-renders.
  // IMPORTANT: read zoom/pxPerMs from state inside the subscriber, NOT from the
  // closed-over component variable — otherwise the playhead drifts after zoom changes.
  useEffect(() => {
    let lastTime = -1;
    const unsubscribe = useEditorStore.subscribe((state) => {
      const time = state.currentTime;
      const livePxPerMs = state.zoom / 1000;
      if (time === lastTime) return;
      lastTime = time;

      // 1. Move playhead
      if (playheadRef.current) {
        playheadRef.current.style.left = `${time * livePxPerMs}px`;
      }
      if (playheadTextRef.current) {
        playheadTextRef.current.textContent = formatRulerTime(time);
      }

      // 2. Right-only auto-scroll
      if (state.isPlaying && containerRef.current) {
        const el = containerRef.current;
        const playheadX = time * livePxPerMs;
        const visibleRight = el.scrollLeft + el.clientWidth;

        if (playheadX > visibleRight - 120) {
          const target = Math.max(autoScrollMaxRef.current, playheadX - el.clientWidth + 200);
          autoScrollMaxRef.current = target;
          el.scrollLeft = target;
        }
      }
    });
    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-once — zoom is read live from state inside the subscriber


  // Reset the auto-scroll ceiling whenever the user manually scrolls left
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      // If user manually scrolls left past our tracked ceiling, lower the ceiling
      if (el.scrollLeft < autoScrollMaxRef.current) {
        autoScrollMaxRef.current = el.scrollLeft;
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);


  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    clip: TimelineClip;
    trackId: string;
  } | null>(null);
  // Ref so window-level mousemove closures can read the current value without stale captures
  const contextMenuRef = useRef<typeof contextMenu>(null);
  const [clipboard, setClipboard] = useState<TimelineClip | null>(null);
  const [timelineToast, setTimelineToast] = useState<string | null>(null);

  useEffect(() => {
    if (timelineToast) {
      const t = setTimeout(() => setTimelineToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [timelineToast]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    contextMenuRef.current = null;
  }, []);

  // Keep the ref in sync whenever state changes
  useEffect(() => {
    contextMenuRef.current = contextMenu;
  }, [contextMenu]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#clip-context-menu')) closeContextMenu();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu, closeContextMenu]);

  // Background video thumbnail extractor
  useEffect(() => {
    if (!project) return;
    
    // Find all video assets on the timeline not yet cached
    const videoClips = project.tracks
      .filter(t => t.type === 'video')
      .flatMap(t => t.clips)
      .filter(c => c.assetId && !thumbnailCacheRef.current[c.assetId]);
      
    videoClips.forEach(async (clip) => {
      if (!clip.assetId) return;
      const assetId = clip.assetId;
      // Mark as in-progress immediately to prevent duplicate extractions
      thumbnailCacheRef.current[assetId] = [];
      
      try {
        const asset = await db.assets.get(assetId);
        if (!asset) return;

        const { getFileFromOPFS } = await import('../../lib/opfs');
        const file = await getFileFromOPFS(asset.opfsPath);
        const objectUrl = URL.createObjectURL(file);
        
        if (asset.type.startsWith('image/')) {
          // Fast single-frame extraction for image assets
          const img = new Image();
          img.src = objectUrl;
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });
          
          const canvas = document.createElement('canvas');
          const aspect = img.naturalWidth / (img.naturalHeight || 1);
          canvas.height = 180;
          canvas.width = Math.round(180 * aspect);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const frame = canvas.toDataURL('image/jpeg', 0.6);
            setThumbnailCache(prev => {
              const updated = { ...prev, [assetId]: [frame] };
              thumbnailCacheRef.current = updated;
              return updated;
            });
          }
          URL.revokeObjectURL(objectUrl);
        } else {
          // Standard multi-frame seek for video assets
          const video = document.createElement('video');
          video.src = objectUrl;
          video.muted = true;
          video.playsInline = true;
          video.preload = 'metadata';
          
          await new Promise((resolve) => {
            video.onloadedmetadata = resolve;
          });

          const duration = video.duration;
          // If the file is larger than 500MB, extract only 1 frame to avoid decoder choking
          const numFrames = asset.size > 500 * 1024 * 1024 ? 1 : 10;
          const frames: string[] = [];
          
          const canvas = document.createElement('canvas');
          const videoWidth = video.videoWidth || 320;
          const videoHeight = video.videoHeight || 180;
          const aspect = videoWidth / videoHeight;
          
          canvas.height = 180;
          canvas.width = Math.round(180 * aspect);
          const ctx = canvas.getContext('2d');
          
          for (let i = 0; i < numFrames; i++) {
            const targetTime = (duration / (numFrames + 1)) * (i + 1);
            video.currentTime = targetTime;
            
            await new Promise((resolve) => {
              video.onseeked = resolve;
            });
            
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              frames.push(canvas.toDataURL('image/jpeg', 0.6));
            }
          }
          
          setThumbnailCache(prev => {
            const updated = { ...prev, [assetId]: frames };
            thumbnailCacheRef.current = updated;
            return updated;
          });
          
          URL.revokeObjectURL(objectUrl);
          video.remove();
        }
      } catch (error) {
        console.error(`Failed to extract thumbnails for asset ${assetId}:`, error);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  // Real PCM Waveform extractor for audio/video clips
  useEffect(() => {
    if (!project) return;
    const clips = project.tracks
      .filter(t => t.type === 'audio' || t.type === 'video')
      .flatMap(t => t.clips)
      .filter(c => c.assetId && !waveformCacheRef.current[c.assetId]);

    clips.forEach(async (clip) => {
      if (!clip.assetId) return;
      const assetId = clip.assetId;
      waveformCacheRef.current[assetId] = [];
      try {
        const asset = await db.assets.get(assetId);
        if (!asset) return;

        // 1. Check if peaks are already cached in IndexedDB
        if (asset.waveformPeaks && asset.waveformPeaks.length > 0) {
          setWaveformCache(prev => {
            const updated = { ...prev, [assetId]: asset.waveformPeaks! };
            waveformCacheRef.current = updated;
            return updated;
          });
          return;
        }

        // 2. Fallback: generate dynamically if not present
        if (asset.type.startsWith('image/')) return;
        const { generateWaveformPeaks } = await import('../../lib/waveform-generator');
        const peaks = await generateWaveformPeaks(asset.opfsPath);

        if (peaks.length > 0) {
          await db.assets.update(assetId, { waveformPeaks: peaks });
          setWaveformCache(prev => {
            const updated = { ...prev, [assetId]: peaks };
            waveformCacheRef.current = updated;
            return updated;
          });
        }
      } catch (e) {
        console.warn('Waveform extraction failed for', assetId, e);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  const handleAddEmojiClip = async (emoji: string) => {
    const textTrack = project?.tracks.find(t => t.type === 'text');
    if (!textTrack || !project) return;

    const clipId = Math.random().toString(36).substring(2, 9);
    const newTextClip: Omit<TimelineClip, 'trackId'> = {
      id: clipId,
      type: 'text',
      name: `Sticker (${emoji})`,
      durationMs: 4000,
      trimStartMs: 0,
      trimEndMs: 4000,
      positionMs: useEditorStore.getState().currentTime,
      textSettings: {
        content: emoji,
        color: '#ffffff',
        fontSize: 48,
        fontFamily: 'Inter',
        x: 0.5,
        y: 0.5,
        scale: 1.0
      }
    };
    await addClip(textTrack.id, newTextClip);
    setSelectedClipId(clipId);
    setShowStickers(false);
  };

  // Drag and drop states
  const [dragOverTrackId, setDragOverTrackId] = useState<string | null>(null);
  const [dragOverTimeMs, setDragOverTimeMs] = useState<number | null>(null);

  const handleDragOver = (e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left + containerRef.current.scrollLeft;
    const timeMs = Math.max(0, clientX / pxPerMs);
    
    setDragOverTrackId(trackId);
    setDragOverTimeMs(timeMs);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    // Only clear drag state if the cursor has actually exited the track row bounds
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setDragOverTrackId(null);
      setDragOverTimeMs(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    setDragOverTrackId(null);
    setDragOverTimeMs(null);

    if (!project) return;

    const emoji = e.dataTransfer.getData('application/cap-emoji');
    const shapeType = e.dataTransfer.getData('application/cap-shape');

    if (emoji || shapeType) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || !containerRef.current) return;
      const clientX = e.clientX - rect.left + containerRef.current.scrollLeft;
      const dropTimeMs = Math.max(0, clientX / pxPerMs);
      
      const clipId = `clip-${Math.random().toString(36).substring(2, 9)}`;

      if (emoji) {
        let textTrack = project.tracks.find(t => t.type === 'text');
        if (!textTrack) {
          const newTrackId = Math.random().toString(36).substring(2, 9);
          textTrack = {
            id: newTrackId,
            name: 'Text Track 1',
            type: 'text' as const,
            clips: [],
            locked: false,
            muted: false,
            hidden: false
          };
          await updateTracks([...project.tracks, textTrack]);
        }
        
        const newTextClip = {
          id: clipId,
          type: 'text' as const,
          name: `Sticker (${emoji})`,
          durationMs: 4000,
          trimStartMs: 0,
          trimEndMs: 4000,
          positionMs: dropTimeMs,
          trackId: textTrack.id,
          textSettings: {
            content: emoji,
            color: '#ffffff',
            fontSize: 48,
            fontFamily: 'Inter',
            x: 0.5,
            y: 0.5,
            scale: 1.0
          }
        };
        await addClip(textTrack.id, newTextClip);
      } else if (shapeType) {
        let videoTrack = project.tracks.find(t => t.id === trackId) || project.tracks.find(t => t.type === 'video');
        if (!videoTrack) {
          const newTrackId = Math.random().toString(36).substring(2, 9);
          videoTrack = {
            id: newTrackId,
            name: 'Video Track 1',
            type: 'video' as const,
            clips: [],
            locked: false,
            muted: false,
            hidden: false
          };
          await updateTracks([...project.tracks, videoTrack]);
        }
        
        const newShapeClip = {
          id: clipId,
          type: 'image' as const,
          name: `Shape (${shapeType})`,
          assetId: `shape_${shapeType}`,
          durationMs: 4000,
          trimStartMs: 0,
          trimEndMs: 4000,
          positionMs: dropTimeMs,
          trackId: videoTrack.id,
          shapeSettings: {
            type: shapeType as any,
            color: '#8b5cf6',
            strokeColor: '#ffffff',
            strokeWidth: 3,
            width: 300,
            height: 300
          },
          transform: {
            scale: 40,
            x: 0,
            y: 0,
            rotation: 0,
            uniformScale: true,
            blendMode: 'normal'
          }
        };
        await addClip(videoTrack.id, newShapeClip);
      }

      setSelectedClipIds([clipId]);
      return;
    }

    const effectId = e.dataTransfer.getData('application/cap-effect-id');
    const filterId = e.dataTransfer.getData('application/cap-filter-id');

    if (effectId || filterId) {
      let effectTrack = project.tracks.find(t => t.type === 'effect');
      if (!effectTrack) {
        const newTrackId = Math.random().toString(36).substring(2, 9);
        effectTrack = {
          id: newTrackId,
          name: 'Effects Track 1',
          type: 'effect' as const,
          clips: [],
          locked: false,
          muted: false,
          hidden: false
        };
        await updateTracks([...project.tracks, effectTrack]);
      }

      // Calculate drop position
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || !containerRef.current) return;
      const clientX = e.clientX - rect.left + containerRef.current.scrollLeft;
      const dropTimeMs = Math.max(0, clientX / pxPerMs);

      const clipId = `clip-${Math.random().toString(36).substring(2, 9)}`;
      
      if (effectId) {
        const def = EFFECTS_REGISTRY[effectId];
        const newEffectClip = {
          id: clipId,
          type: 'effect' as const,
          name: def?.name || 'Effect',
          durationMs: 3000,
          trimStartMs: 0,
          trimEndMs: 0,
          positionMs: dropTimeMs,
          trackId: effectTrack.id,
          videoEffects: [{ id: effectId, intensity: def?.defaultIntensity || 60 }]
        };
        await addClip(effectTrack.id, newEffectClip);
      } else if (filterId) {
        const newFilterClip = {
          id: clipId,
          type: 'effect' as const,
          name: filterId.charAt(0).toUpperCase() + filterId.slice(1),
          durationMs: 3000,
          trimStartMs: 0,
          trimEndMs: 0,
          positionMs: dropTimeMs,
          trackId: effectTrack.id,
          filterSettings: {
            type: filterId,
            intensity: 80
          }
        };
        await addClip(effectTrack.id, newFilterClip);
      }
      
      setSelectedClipIds([clipId]);
      return;
    }

    const assetIdsJson = e.dataTransfer.getData('application/cap-asset-ids');
    let assetIds: string[] = [];
    if (assetIdsJson) {
      try {
        assetIds = JSON.parse(assetIdsJson);
      } catch {}
    }
    if (assetIds.length === 0) {
      const singleId = e.dataTransfer.getData('application/cap-asset-id');
      if (singleId) assetIds = [singleId];
    }

    if (assetIds.length === 0) return;

    const track = project.tracks.find(t => t.id === trackId);
    if (!track) return;

    // Calculate drop position
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !containerRef.current) return;
    const clientX = e.clientX - rect.left + containerRef.current.scrollLeft;
    let currentDropTimeMs = Math.max(0, clientX / pxPerMs);

    const addedClipIds: string[] = [];

    for (const id of assetIds) {
      const asset = await db.assets.get(id);
      if (!asset) continue;

      const type = asset.type.startsWith('audio/') ? 'audio' : asset.type.startsWith('image/') ? 'image' : 'video';

      let finalTrackId = trackId;
      const isTrackVisual = track.type === 'video' || (track.type as string) === 'image';
      const isAssetVisual = type === 'video' || type === 'image';
      const isCompatible = (track.type === type) || (isTrackVisual && isAssetVisual);

      if (!isCompatible) {
        const targetType = isAssetVisual ? 'video' : type;
        const existingTrack = project.tracks.find(t => t.type === targetType);
        if (existingTrack) {
          finalTrackId = existingTrack.id;
        } else {
          // Create new track
          const newTrackId = Math.random().toString(36).substring(2, 9);
          const typeLabels: Record<string, string> = {
            video: 'Video Track 1', audio: 'Audio Track 1', text: 'Text Track 1'
          };
          const newTrack: TimelineTrack = {
            id: newTrackId,
            name: typeLabels[targetType] || `${targetType} Track 1`,
            type: targetType as 'video' | 'audio' | 'text',
            clips: [],
            locked: false,
            muted: false,
            hidden: false
          };
          await updateTracks([...project.tracks, newTrack]);
          // Reload from state
          const updatedProj = useEditorStore.getState().project;
          if (updatedProj) {
            const freshTrack = updatedProj.tracks.find(t => t.type === targetType);
            if (freshTrack) finalTrackId = freshTrack.id;
          }
        }
      }

      const clipId = Math.random().toString(36).substring(2, 9);
      const newClip: Omit<TimelineClip, 'trackId'> = {
        id: clipId,
        assetId: asset.id,
        type,
        name: asset.name,
        durationMs: asset.durationMs,
        trimStartMs: 0,
        trimEndMs: asset.durationMs,
        positionMs: currentDropTimeMs,
        speed: 1.0,
        volume: 100,
        fadeInMs: 0,
        fadeOutMs: 0,
        transform: {
          scale: 100,
          x: 0,
          y: 0,
          rotation: 0,
          uniformScale: true,
          blendMode: 'normal'
        }
      };

      await addClip(finalTrackId, newClip);
      addedClipIds.push(clipId);
      currentDropTimeMs += asset.durationMs;
    }

    if (addedClipIds.length > 0) {
      setSelectedClipIds(addedClipIds);
    }
  };

  const handleAreaDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleAreaDrop = async (e: React.DragEvent) => {
    if (e.defaultPrevented) return;
    e.preventDefault();

    if (!project) return;

    const assetIdsJson = e.dataTransfer.getData('application/cap-asset-ids');
    let assetIds: string[] = [];
    if (assetIdsJson) {
      try {
        assetIds = JSON.parse(assetIdsJson);
      } catch {}
    }
    if (assetIds.length === 0) {
      const singleId = e.dataTransfer.getData('application/cap-asset-id');
      if (singleId) assetIds = [singleId];
    }

    if (assetIds.length === 0) return;

    // Calculate vertical drop coordinate relative to ruler top
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !containerRef.current) return;
    const relativeY = e.clientY - rect.top - 36 - 4; // 36 is ruler height, 4 is pt-1 padding

    const clientX = e.clientX - rect.left + containerRef.current.scrollLeft;
    let currentDropTimeMs = Math.max(0, clientX / pxPerMs);

    const addedClipIds: string[] = [];

    for (const id of assetIds) {
      const asset = await db.assets.get(id);
      if (!asset) continue;

      const type = asset.type.startsWith('audio/') ? 'audio' : asset.type.startsWith('image/') ? 'image' : 'video';
      const isAssetVisual = type === 'video' || type === 'image';

      // Find closest compatible track
      let closestTrack: TimelineTrack | null = null;
      let tempTop = 0;
      for (const t of project.tracks) {
        const tHeight = getTrackHeight(t.type);
        if (relativeY >= tempTop && relativeY < tempTop + tHeight + 6) {
          const isTrackVisual = t.type === 'video' || (t.type as string) === 'image';
          const isCompatible = (t.type === type) || (isTrackVisual && isAssetVisual);
          if (isCompatible) {
            closestTrack = t;
          }
          break;
        }
        tempTop += tHeight + 6;
      }

      let finalTrackId = '';
      if (closestTrack) {
        finalTrackId = closestTrack.id;
      } else {
        const targetType = isAssetVisual ? 'video' : type;
        const firstOfType = project.tracks.find(t => t.type === targetType);
        if (firstOfType) {
          finalTrackId = firstOfType.id;
        } else {
          // Create new track
          const newTrackId = Math.random().toString(36).substring(2, 9);
          const typeLabels: Record<string, string> = {
            video: 'Video Track 1', audio: 'Audio Track 1', text: 'Text Track 1'
          };
          const newTrack: TimelineTrack = {
            id: newTrackId,
            name: typeLabels[targetType] || `${targetType} Track 1`,
            type: targetType as 'video' | 'audio' | 'text',
            clips: [],
            locked: false,
            muted: false,
            hidden: false
          };
          await updateTracks([...project.tracks, newTrack]);
          // Reload from state
          const updatedProj = useEditorStore.getState().project;
          if (updatedProj) {
            const freshTrack = updatedProj.tracks.find(t => t.type === targetType);
            if (freshTrack) finalTrackId = freshTrack.id;
          }
        }
      }

      const clipId = Math.random().toString(36).substring(2, 9);
      const newClip: Omit<TimelineClip, 'trackId'> = {
        id: clipId,
        assetId: asset.id,
        type,
        name: asset.name,
        durationMs: asset.durationMs,
        trimStartMs: 0,
        trimEndMs: asset.durationMs,
        positionMs: currentDropTimeMs,
        speed: 1.0,
        volume: 100,
        fadeInMs: 0,
        fadeOutMs: 0,
        transform: {
          scale: 100,
          x: 0,
          y: 0,
          rotation: 0,
          uniformScale: true,
          blendMode: 'normal'
        }
      };

      await addClip(finalTrackId, newClip);
      addedClipIds.push(clipId);
      currentDropTimeMs += asset.durationMs;
    }

    if (addedClipIds.length > 0) {
      setSelectedClipIds(addedClipIds);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      // Zoom in/out smoothly
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(zoom * zoomFactor);
    }
    // All other wheel/trackpad gestures (scroll up/down, two-finger scroll)
    // are handled natively by the browser — no interception.
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchStartDistRef.current = Math.sqrt(dx * dx + dy * dy);
      touchStartZoomRef.current = useEditorStore.getState().zoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) return;
      
      const ratio = dist / touchStartDistRef.current;
      const newZoom = Math.max(50, Math.min(3000, touchStartZoomRef.current * ratio));
      setZoom(newZoom);
    }
  };

  const handleTouchEnd = () => {
    touchStartDistRef.current = null;
  };

  const handleClipTap = (clipId: string) => {
    const now = Date.now();
    if (lastTapRef.current && lastTapRef.current.id === clipId && now - lastTapRef.current.time < 350) {
      // Dispatch custom DOM event to notify EditorLayout to open properties drawer
      window.dispatchEvent(new CustomEvent('open-mobile-properties'));
      lastTapRef.current = null;
    } else {
      lastTapRef.current = { id: clipId, time: now };
    }
  };

  if (!project) return null;

  const zoomIn = () => setZoom(zoom * 1.3);
  const zoomOut = () => setZoom(zoom / 1.3);

  const handleRulerMouseDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Stop the event from bubbling to the tracks area container so it
    // doesn't accidentally trigger the marquee selection.
    e.stopPropagation();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    
    const updateTimeFromX = (clientX: number) => {
      if (!containerRef.current) return;
      const clickX = clientX - rect.left + containerRef.current.scrollLeft;
      let timeMs = Math.max(0, clickX / pxPerMs);

      let snapped = false;
      if (snapEnabledRef.current) {
        const SNAP_PX = 8;
        const snapThresholdMs = SNAP_PX / pxPerMs;

        // Collect all potential snap points (starts and ends of clips, plus markers)
        const snapPoints: number[] = [0];
        project.tracks.forEach(t => {
          t.clips.forEach(c => {
            snapPoints.push(c.positionMs);
            snapPoints.push(c.positionMs + c.durationMs);
          });
        });
        if (project.markers) {
          project.markers.forEach(m => {
            snapPoints.push(m.timeMs);
          });
        }

        for (const pt of snapPoints) {
          if (Math.abs(timeMs - pt) < snapThresholdMs) {
            timeMs = pt;
            showSnapLine(pt, useEditorStore.getState().zoom);
            snapped = true;
            break;
          }
        }
      }

      if (!snapped) {
        hideSnapLine();
      }

      setCurrentTime(timeMs);
    };

    // Update immediately on press
    updateTimeFromX(e.clientX);

    let rafId: number | null = null;
    const handleMouseMove = (moveEvent: PointerEvent) => {
      // Don't move the playhead while the context menu is open
      if (contextMenuRef.current) return;
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        updateTimeFromX(moveEvent.clientX);
        rafId = null;
      });
    };

    const handleMouseUp = () => {
      hideSnapLine();
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener('pointermove', handleMouseMove);
      window.removeEventListener('pointerup', handleMouseUp);
    };

    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);
  };

  const handleAddTextClip = async () => {
    const textTrack = project.tracks.find(t => t.type === 'text');
    if (!textTrack) return;

    const clipId = Math.random().toString(36).substring(2, 9);
    const newTextClip: Omit<TimelineClip, 'trackId'> = {
      id: clipId,
      type: 'text',
      name: 'Text Overlay',
      durationMs: 4000,
      trimStartMs: 0,
      trimEndMs: 4000,
      positionMs: useEditorStore.getState().currentTime,
      textSettings: {
        content: 'Edit Text',
        color: '#ffffff',
        fontSize: 24,
        fontFamily: 'Inter',
        x: 0.5,
        y: 0.5,
        scale: 1.0
      }
    };
    await addClip(textTrack.id, newTextClip);
    setSelectedClipId(clipId);
  };

  const handleDetachAudio = async (clip: TimelineClip) => {
    if (clip.type !== 'video' || !clip.assetId) return;

    // Clone tracks
    const tracksCopy = JSON.parse(JSON.stringify(project.tracks)) as TimelineTrack[];

    // Find or create an audio track
    let audioTrack = tracksCopy.find(t => t.type === 'audio');
    if (!audioTrack) {
      const newTrackId = Math.random().toString(36).substring(2, 9);
      audioTrack = {
        id: newTrackId,
        name: 'Audio Track 1',
        type: 'audio',
        clips: []
      };
      tracksCopy.push(audioTrack);
    }

    // Find original clip in copy and set its volume to 0 (muting the video's audio)
    let originalClipCopy: TimelineClip | null = null;
    for (const track of tracksCopy) {
      const found = track.clips.find(c => c.id === clip.id);
      if (found) {
        originalClipCopy = found;
        break;
      }
    }

    if (!originalClipCopy) return;
    originalClipCopy.volume = 0;

    // Create a new audio clip
    const audioClipId = Math.random().toString(36).substring(2, 9);
    const newAudioClip: TimelineClip = {
      id: audioClipId,
      assetId: clip.assetId,
      type: 'audio',
      name: `${clip.name} (Audio)`,
      durationMs: clip.durationMs,
      trimStartMs: clip.trimStartMs,
      trimEndMs: clip.trimEndMs,
      positionMs: clip.positionMs,
      trackId: audioTrack.id,
      volume: 100,
      speed: clip.speed
    };

    audioTrack.clips.push(newAudioClip);
    await updateTracks(tracksCopy);
    setSelectedClipIds([clip.id, audioClipId]); // Select both the video and its detached audio
  };

  const handleRestoreAudio = async (clip: TimelineClip) => {
    if (clip.type !== 'video') return;
    await updateClip(clip.id, { volume: 100 });
  };

  const handleToggleTrackControl = async (trackId: string, property: 'locked' | 'muted' | 'hidden') => {
    if (!project) return;
    const updatedTracks = project.tracks.map(t => {
      if (t.id === trackId) {
        const val = (t as any)[property];
        return {
          ...t,
          [property]: !val
        };
      }
      return t;
    });
    await updateTracks(updatedTracks);
  };

  const handleAreaMouseDown = (e: React.PointerEvent) => {
    // Only left click for mouse
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Ignore if clicked on a clip or a button
    if ((e.target as HTMLElement).closest('.cursor-grab') || (e.target as HTMLElement).closest('button')) {
      return;
    }
    // Ignore clicks that land on the sticky ruler or marker lane
    // (those are handled by handleRulerMouseDown and the marker lane)
    if ((e.target as HTMLElement).closest('[data-ruler]') || (e.target as HTMLElement).closest('[data-markerlane]')) {
      return;
    }

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    
    // Coordinates relative to the scrollable container's visible viewport
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    // Track state to distinguish between a single click seek and a marquee drag
    let hasExceededThreshold = false;

    setSelectionBox({
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      active: false // Not active until threshold is exceeded
    });

    const handleMouseMove = (moveEvent: PointerEvent) => {
      if (!containerRef.current) return;
      const moveRect = containerRef.current.getBoundingClientRect();
      const currentX = moveEvent.clientX - moveRect.left;
      const currentY = moveEvent.clientY - moveRect.top;

      // Threshold: 5 pixels of drag in any direction
      if (!hasExceededThreshold) {
        const dist = Math.sqrt(Math.pow(currentX - startX, 2) + Math.pow(currentY - startY, 2));
        if (dist > 5) {
          hasExceededThreshold = true;
          // Clear selection on drag start
          setSelectedClipIds([]);
        }
      }

      setSelectionBox(prev => {
        if (!prev) return null;
        return {
          ...prev,
          currentX,
          currentY,
          active: hasExceededThreshold
        };
      });

      if (!hasExceededThreshold) return;

      // Calculate marquee bounding box in timeline scroll space
      const scrollLeft = containerRef.current.scrollLeft;
      const scrollTop = containerRef.current.scrollTop;
      const boxLeft = Math.min(startX, currentX) + scrollLeft;
      const boxRight = Math.max(startX, currentX) + scrollLeft;
      const boxTop = Math.min(startY, currentY) + scrollTop;
      const boxBottom = Math.max(startY, currentY) + scrollTop;

      const overlappingClipIds: string[] = [];
      const RULER_HEIGHT = 36;
      let currentTop = RULER_HEIGHT;

      project.tracks.forEach((track) => {
        const trackHeight = getTrackHeight(track.type);
        const trackTop = currentTop;
        const trackBottom = trackTop + trackHeight;
        currentTop += trackHeight + 4; // 4px margin-bottom gap

        const yOverlap = Math.max(0, Math.min(boxBottom, trackBottom) - Math.max(boxTop, trackTop)) > 0;
        if (!yOverlap) return;

        track.clips.forEach(clip => {
          const clipLeft = clip.positionMs * pxPerMs;
          const clipRight = (clip.positionMs + clip.durationMs) * pxPerMs;

          const xOverlap = Math.max(0, Math.min(boxRight, clipRight) - Math.max(boxLeft, clipLeft)) > 0;
          if (xOverlap) {
            overlappingClipIds.push(clip.id);
          }
        });
      });

      setSelectedClipIds(overlappingClipIds);
    };

    const handleMouseUp = (upEvent: PointerEvent) => {
      // Seek playhead only if user just clicked (did not drag beyond 5px)
      if (!hasExceededThreshold && containerRef.current) {
        const upRect = containerRef.current.getBoundingClientRect();
        const clickX = upEvent.clientX - upRect.left + containerRef.current.scrollLeft;
        const clickTimeMs = Math.max(0, clickX / pxPerMs);
        setCurrentTime(clickTimeMs);
        setSelectedClipIds([]);
      }

      setSelectionBox(null);
      window.removeEventListener('pointermove', handleMouseMove);
      window.removeEventListener('pointerup', handleMouseUp);
    };

    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);
  };

  const handleGainMouseDown = (
    e: React.PointerEvent,
    clipId: string,
    initialVolume: number
  ) => {
    e.stopPropagation();
    e.preventDefault();

    const startY = e.clientY;
    // Scale sensitivity: 1px = 1.5% volume change
    const sensitivity = 1.5;

    const handleMouseMove = (moveEvent: PointerEvent) => {
      const deltaY = startY - moveEvent.clientY; // drag up = volume increase
      const newVolume = Math.max(0, Math.min(100, Math.round(initialVolume + deltaY * sensitivity)));
      updateClip(clipId, { volume: newVolume });
    };

    const handleMouseUp = () => {
      window.removeEventListener('pointermove', handleMouseMove);
      window.removeEventListener('pointerup', handleMouseUp);
    };

    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);
  };

  const handleTransitionResizeMouseDown = (
    e: React.PointerEvent,
    clipId: string,
    edge: 'left' | 'right',
    initialDurationMs: number,
    prevClipId: string
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const startX = e.clientX;
    const clip = project?.tracks.flatMap(t => t.clips).find(c => c.id === clipId);
    const prevClip = project?.tracks.flatMap(t => t.clips).find(c => c.id === prevClipId);
    if (!clip || !prevClip) return;

    // Max duration is limited by the length of the two clips
    const maxDuration = 2 * Math.min(prevClip.durationMs, clip.durationMs);

    const handleMouseMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaMs = deltaX / pxPerMs;
      
      let newDuration = initialDurationMs;
      if (edge === 'left') {
        newDuration = initialDurationMs - 2 * deltaMs;
      } else {
        newDuration = initialDurationMs + 2 * deltaMs;
      }

      // Constrain duration between 200ms and maxDuration
      newDuration = Math.max(200, Math.min(maxDuration, newDuration));
      newDuration = Math.round(newDuration / 100) * 100; // snap to 100ms increments

      updateClip(clipId, {
        fadeInMs: newDuration,
        transitionIn: {
          ...clip.transitionIn!,
          durationMs: newDuration
        }
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener('pointermove', handleMouseMove);
      window.removeEventListener('pointerup', handleMouseUp);
    };

    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);
  };

  const handleClipMouseDown = (
    e: React.PointerEvent,
    trackId: string,
    clip: TimelineClip,
    action: 'move' | 'trim-start' | 'trim-end'
  ) => {
    e.stopPropagation();
    if (e.pointerType === 'mouse' && e.button !== 0) return; // Only allow left-click to drag or trim

    const isShiftOrCmd = e.shiftKey || e.metaKey || e.ctrlKey;
    let currentSelectedIds = [...selectedClipIds];

    if (isShiftOrCmd) {
      if (currentSelectedIds.includes(clip.id)) {
        currentSelectedIds = currentSelectedIds.filter(id => id !== clip.id);
      } else {
        currentSelectedIds.push(clip.id);
      }
    } else {
      if (!currentSelectedIds.includes(clip.id)) {
        currentSelectedIds = [clip.id];
      }
    }

    // J/L Cut Linked Selection Expansion
    if (isLinkedSelection && !isShiftOrCmd) {
      const linkedIds: string[] = [];
      const isClipVisual = clip.type === 'video' || clip.type === 'image';
      const isClipAudio = clip.type === 'audio';

      project.tracks.forEach(t => {
        t.clips.forEach(c => {
          if (c.assetId === clip.assetId && Math.abs(c.positionMs - clip.positionMs) < 50) {
            const isTargetVisual = c.type === 'video' || c.type === 'image';
            const isTargetAudio = c.type === 'audio';
            // Only link video/image with audio, or vice-versa
            if ((isClipVisual && isTargetAudio) || (isClipAudio && isTargetVisual)) {
              linkedIds.push(c.id);
            }
          }
        });
      });
      currentSelectedIds = Array.from(new Set([...currentSelectedIds, ...linkedIds]));
    }

    setSelectedClipIds(currentSelectedIds);

    const track = project.tracks.find(t => t.id === trackId);
    if (track?.locked) return;

    // Capture initial drag anchors
    const startX = e.clientX;
    const startPosition = clip.positionMs;
    const startDuration = clip.durationMs;
    const startTrimStart = clip.trimStartMs;

    // Save starting positions and trims of all selected clips for multi-drag
    const movingClips = project.tracks
      .flatMap(t => t.clips)
      .filter(c => currentSelectedIds.includes(c.id))
      .map(c => ({
        id: c.id,
        pos: c.positionMs,
        trimStartMs: c.trimStartMs
      }));

    // Bug fix #2: reuse a stable id/name for any auto-created track during this drag
    // so we don't generate a new track on every mousemove frame.
    const pendingNewTrack = { id: '', name: '', type: '' as TimelineTrack['type'] };




    const handleMouseMove = (moveEvent: PointerEvent) => {
      // Don't drag clips while the context menu is open
      if (contextMenuRef.current) return;

      // Always read LIVE state so snap/zoom changes are reflected mid-drag
      const liveStore = useEditorStore.getState();
      const liveProject = liveStore.project;
      const livePxPerMs = liveStore.zoom / 1000;
      const liveCurrentTime = liveStore.currentTime;
      if (!liveProject) return;

      const deltaX = moveEvent.clientX - startX;
      const deltaMs = deltaX / livePxPerMs;

      // Fixed pixel snap radius (8px) → convert to ms using live zoom
      const SNAP_PX = 8;
      const snapThresholdMs = SNAP_PX / livePxPerMs;

      let updatedTracks: TimelineTrack[] = [];
      let snapped = false;

      if (action === 'move') {
        const isSlip = moveEvent.altKey;

        if (isSlip) {
          // Perform Slip Edit: shift trimStartMs, keep positionMs constant
          updatedTracks = liveProject.tracks.map(t => {
            return {
              ...t,
              clips: t.clips.map(c => {
                if (currentSelectedIds.includes(c.id)) {
                  const isImage = c.type === 'image';
                  const assetDur = assetDurations[c.assetId || ''] || c.durationMs;
                  const speed = c.speed || 1.0;

                  const startTrimStartVal = movingClips.find(mc => mc.id === c.id)?.trimStartMs ?? c.trimStartMs;
                  let newTrimStart = startTrimStartVal + deltaMs * speed;

                  if (isImage) {
                    newTrimStart = Math.max(0, newTrimStart);
                  } else {
                    newTrimStart = Math.max(0, Math.min(assetDur - c.durationMs * speed, newTrimStart));
                  }
                  const newTrimEnd = isImage ? c.durationMs : newTrimStart + c.durationMs * speed;

                  return {
                    ...c,
                    trimStartMs: newTrimStart,
                    trimEndMs: newTrimEnd
                  };
                }
                return c;
              })
            };
          });
        } else {
          let newPos = Math.max(0, startPosition + deltaMs);

          if (snapEnabledRef.current) {
            const snapPoints: number[] = [0, liveCurrentTime];
            liveProject.tracks.forEach(t => {
              t.clips.forEach(c => {
                if (!currentSelectedIds.includes(c.id)) {
                  snapPoints.push(c.positionMs);
                  snapPoints.push(c.positionMs + c.durationMs);
                }
              });
            });

            for (const pt of snapPoints) {
              if (Math.abs(newPos - pt) < snapThresholdMs) {
                newPos = pt;
                showSnapLine(pt, liveStore.zoom);
                snapped = true;
                break;
              }
              if (Math.abs((newPos + startDuration) - pt) < snapThresholdMs) {
                newPos = pt - startDuration;
                showSnapLine(pt, liveStore.zoom);
                snapped = true;
                break;
              }
            }
          }

          if (!snapped) hideSnapLine();

          const actualDeltaMs = newPos - startPosition;

          // Determine which track is hovered vertically (including boundary auto-creation)
          let targetTrackId = trackId;
          let tracksForThisMove = [...liveProject.tracks];

          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            // 36 is RULER_HEIGHT, 4 is pt-1 padding
            const relativeY = moveEvent.clientY - rect.top - 36 - 4;
            
            // Calculate tops and bottoms of all tracks
            let currentTop = 0;
            const trackTops = new Map<string, number>();
            const trackHeights = new Map<string, number>();
            for (const t of tracksForThisMove) {
              const tHeight = getTrackHeight(t.type);
              trackTops.set(t.id, currentTop);
              trackHeights.set(t.id, tHeight);
              currentTop += tHeight + 6; // Include 6px margin-bottom gap
            }

            const isClipVisual = clip.type === 'video' || clip.type === 'image';
            const sameTypeTracks = tracksForThisMove.filter(t => 
              isClipVisual 
                ? (t.type === 'video' || (t.type as string) === 'image') 
                : t.type === clip.type
            );

            if (sameTypeTracks.length > 0) {
              const firstTrack = sameTypeTracks[0];
              const lastTrack = sameTypeTracks[sameTypeTracks.length - 1];
              const firstTop = trackTops.get(firstTrack.id) || 0;
              const lastBottom = (trackTops.get(lastTrack.id) || 0) + (trackHeights.get(lastTrack.id) || 0);

              if (relativeY < firstTop - 10) {
                // Dragged above the first track of this type
                const isFirstTrackEmpty = firstTrack.clips.every(c => currentSelectedIds.includes(c.id));
                if (!isFirstTrackEmpty) {
                  const targetType = isClipVisual ? 'video' : clip.type;
                  const typeLabels: Record<string, string> = { video: 'Video', audio: 'Audio', text: 'Text' };
                  // Reuse pending track id to avoid creating a new track every frame
                  if (!pendingNewTrack.id) {
                    pendingNewTrack.id = Math.random().toString(36).substring(2, 9);
                    pendingNewTrack.type = targetType as TimelineTrack['type'];
                    const existingCount = tracksForThisMove.filter(t => t.type === targetType).length;
                    pendingNewTrack.name = `${typeLabels[targetType] || 'Video'} ${existingCount + 1}`;
                  }
                  // Only splice if this pending track isn't already in the list
                  if (!tracksForThisMove.find(t => t.id === pendingNewTrack.id)) {
                    const newTrack: TimelineTrack = {
                      id: pendingNewTrack.id, name: pendingNewTrack.name, type: pendingNewTrack.type,
                      clips: [], locked: false, muted: false, hidden: false
                    };
                    const idx = tracksForThisMove.findIndex(t => t.id === firstTrack.id);
                    tracksForThisMove.splice(idx, 0, newTrack);
                  }
                  targetTrackId = pendingNewTrack.id;
                } else {
                  targetTrackId = firstTrack.id;
                }
              } else if (relativeY > lastBottom + 10) {
                // Dragged below the last track of this type
                const isLastTrackEmpty = lastTrack.clips.every(c => currentSelectedIds.includes(c.id));
                if (!isLastTrackEmpty) {
                  const targetType = isClipVisual ? 'video' : clip.type;
                  const typeLabels: Record<string, string> = { video: 'Video', audio: 'Audio', text: 'Text' };
                  // Reuse pending track id to avoid creating a new track every frame
                  if (!pendingNewTrack.id) {
                    pendingNewTrack.id = Math.random().toString(36).substring(2, 9);
                    pendingNewTrack.type = targetType as TimelineTrack['type'];
                    const existingCount = tracksForThisMove.filter(t => t.type === targetType).length;
                    pendingNewTrack.name = `${typeLabels[targetType] || 'Video'} ${existingCount + 1}`;
                  }
                  // Only splice if this pending track isn't already in the list
                  if (!tracksForThisMove.find(t => t.id === pendingNewTrack.id)) {
                    const newTrack: TimelineTrack = {
                      id: pendingNewTrack.id, name: pendingNewTrack.name, type: pendingNewTrack.type,
                      clips: [], locked: false, muted: false, hidden: false
                    };
                    const idx = tracksForThisMove.findIndex(t => t.id === lastTrack.id);
                    tracksForThisMove.splice(idx + 1, 0, newTrack);
                  }
                  targetTrackId = pendingNewTrack.id;
                } else {
                  targetTrackId = lastTrack.id;
                }
              } else {
                // Standard hover detection
                let tempTop = 0;
                for (const t of tracksForThisMove) {
                  const tHeight = getTrackHeight(t.type);
                  if (relativeY >= tempTop && relativeY < tempTop + tHeight + 6) {
                    const isTrackVisual = t.type === 'video' || (t.type as string) === 'image';
                    const isCompatible = (t.type === clip.type) || (isTrackVisual && isClipVisual);
                    if (isCompatible && !t.locked) {
                      targetTrackId = t.id;
                    }
                    break;
                  }
                  tempTop += tHeight + 6;
                }
              }
            }
          }


          // 1. Extract moving clips and temporarily assign their targetTrackId
          const clipsToMove: any[] = [];
          const tempTracks = tracksForThisMove.map(t => {
            const remainingClips = [];
            for (const c of t.clips) {
              if (currentSelectedIds.includes(c.id)) {
                clipsToMove.push({
                  ...c,
                  targetTrackId: t.id === trackId ? targetTrackId : t.id
                });
              } else {
                remainingClips.push(c);
              }
            }
            return { ...t, clips: remainingClips };
          });

          // 2. Re-insert the moving clips into their target tracks
          updatedTracks = tempTracks.map(t => {
            const clipsForThisTrack = clipsToMove.filter(c => c.targetTrackId === t.id);
            
            let rippleDelta = 0;
            if (rippleEnabledRef.current && t.id === targetTrackId) {
              rippleDelta = actualDeltaMs;
            }

            const updatedClipsForThisTrack = clipsForThisTrack.map(c => {
              const startPosObj = movingClips.find((sp: { id: string; pos: number }) => sp.id === c.id);
              const originalStartPos = startPosObj ? startPosObj.pos : c.positionMs;
              const { targetTrackId: _, ...cleanClip } = c;
              return {
                ...cleanClip,
                positionMs: Math.max(0, originalStartPos + actualDeltaMs)
              };
            });

            // Apply ripple shift to other non-moving clips starting at or after the original position
            const shiftedRemainingClips = t.clips.map(c => {
              if (rippleDelta !== 0 && c.positionMs >= startPosition) {
                return {
                  ...c,
                  positionMs: Math.max(0, c.positionMs + rippleDelta)
                };
              }
              return c;
            });

            const combinedClips = [...shiftedRemainingClips, ...updatedClipsForThisTrack];

            // Sort clips: if positions are equal, prioritize moving clips so they stay at their drop position and push others
            const sortedClips = combinedClips.sort((a, b) => {
              if (a.positionMs !== b.positionMs) {
                return a.positionMs - b.positionMs;
              }
              const aMoving = currentSelectedIds.includes(a.id);
              const bMoving = currentSelectedIds.includes(b.id);
              if (aMoving && !bMoving) return -1;
              if (!aMoving && bMoving) return 1;
              return 0;
            });

            // Resolve overlaps (push overlapping clips to the right)
            for (let i = 1; i < sortedClips.length; i++) {
              const prev = sortedClips[i - 1];
              const curr = sortedClips[i];
              if (curr.positionMs < prev.positionMs + prev.durationMs) {
                curr.positionMs = prev.positionMs + prev.durationMs;
              }
            }

            return {
              ...t,
              clips: sortedClips
            };
          });
        }
      } else if (action === 'trim-start') {
        const isImage = clip.type === 'image';
        let newPos, newDur, newTrimStart;

        if (isImage) {
          // Image can start anywhere >= 0, as long as duration remains >= 100ms
          newPos = Math.max(0, Math.min(startPosition + startDuration - 100, startPosition + deltaMs));
          newDur = startDuration + (startPosition - newPos);
          newTrimStart = 0;
        } else {
          let deltaTrim = Math.min(startDuration - 100, Math.max(-startTrimStart, deltaMs));
          newPos = startPosition + deltaTrim;
          
          if (snapEnabledRef.current) {
            const snapPoints: number[] = [0, liveCurrentTime];
            liveProject.tracks.forEach(t => {
              t.clips.forEach(c => {
                if (c.id !== clip.id) {
                  snapPoints.push(c.positionMs);
                  snapPoints.push(c.positionMs + c.durationMs);
                }
              });
            });

            for (const pt of snapPoints) {
              if (Math.abs(newPos - pt) < snapThresholdMs) {
                const actualDelta = pt - startPosition;
                if (actualDelta >= -startTrimStart && actualDelta <= startDuration - 100) {
                  newPos = pt;
                  deltaTrim = actualDelta;
                  showSnapLine(pt, liveStore.zoom);
                  snapped = true;
                  break;
                }
              }
            }
          }
          if (!snapped) hideSnapLine();
          newTrimStart = startTrimStart + deltaTrim;
          newDur = startDuration - deltaTrim;
        }

        const trimDelta = newPos - startPosition;
        updatedTracks = liveProject.tracks.map(t => {
          if (t.id === trackId) {
            return {
              ...t,
              clips: t.clips.map(c => {
                if (c.id === clip.id) {
                  return { ...c, positionMs: newPos, trimStartMs: newTrimStart, durationMs: newDur, trimEndMs: isImage ? newDur : c.trimEndMs };
                }
                if (rippleEnabledRef.current && c.positionMs > startPosition) {
                  return { ...c, positionMs: Math.max(0, c.positionMs + trimDelta) };
                }
                return c;
              })
            };
          }
          return t;
        });

      } else if (action === 'trim-end') {
        const isImage = clip.type === 'image';
        const assetDur = (clip.assetId && !isImage) ? assetDurations[clip.assetId] : null;
        const speed = clip.speed || 1.0;
        const maxDur = isImage ? Infinity : (assetDur ? (assetDur - startTrimStart) / speed : Infinity);

        let newDur = Math.max(100, Math.min(maxDur, startDuration + deltaMs));
        let newTrimEnd = isImage ? newDur : (startTrimStart + newDur * speed);

        if (snapEnabledRef.current) {
          const snapPoints: number[] = [0, liveCurrentTime];
          liveProject.tracks.forEach(t => {
            t.clips.forEach(c => {
              if (c.id !== clip.id) {
                snapPoints.push(c.positionMs);
                snapPoints.push(c.positionMs + c.durationMs);
              }
            });
          });

          for (const pt of snapPoints) {
            const targetDuration = pt - startPosition;
            if (Math.abs((startPosition + newDur) - pt) < snapThresholdMs && targetDuration >= 100 && targetDuration <= maxDur) {
              newDur = targetDuration;
              newTrimEnd = isImage ? newDur : (startTrimStart + newDur * speed);
              showSnapLine(pt, liveStore.zoom);
              snapped = true;
              break;
            }
          }
        }

        if (!snapped) hideSnapLine();

        const trimEndDelta = newDur - startDuration;
        updatedTracks = liveProject.tracks.map(t => {
          if (t.id === trackId) {
            return {
              ...t,
              clips: t.clips.map(c => {
                if (c.id === clip.id) {
                  return { ...c, durationMs: newDur, trimEndMs: newTrimEnd };
                }
                if (rippleEnabledRef.current && c.positionMs >= startPosition + startDuration - 10) {
                  return { ...c, positionMs: Math.max(0, c.positionMs + trimEndDelta) };
                }
                return c;
              })
            };
          }
          return t;
        });
      }

      updateTracks(updatedTracks, true); // skipHistory during live drag
    };

    const handleMouseUp = () => {
      hideSnapLine();
      window.removeEventListener('pointermove', handleMouseMove);
      window.removeEventListener('pointerup', handleMouseUp);

      // Commit the final drag/trim state to IndexedDB & add to history
      const finalStore = useEditorStore.getState();
      if (finalStore.project) {
        updateTracks(finalStore.project.tracks, false);
      }
    };

    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);
  };

  const splitKeyframeTrack = (
    keyframes: Keyframe[] | undefined,
    splitOffsetMs: number,
    defaultValue: number
  ): { keyframesA: Keyframe[] | undefined; keyframesB: Keyframe[] | undefined } => {
    if (!keyframes || keyframes.length === 0) {
      return { keyframesA: undefined, keyframesB: undefined };
    }

    const valueAtSplit = evaluateKeyframe(keyframes, splitOffsetMs, defaultValue);

    const keyframesA: Keyframe[] = [];
    const keyframesB: Keyframe[] = [];

    // Filter and populate for clipA (left side)
    const leftKeyframes = keyframes.filter(k => k.timeMs < splitOffsetMs);
    keyframesA.push(...leftKeyframes);
    keyframesA.push({ timeMs: splitOffsetMs, value: valueAtSplit, easing: 'linear' });

    // Add boundary keyframe at start for clipB (right side)
    keyframesB.push({ timeMs: 0, value: valueAtSplit, easing: 'linear' });
    // Filter, shift, and populate for clipB
    const rightKeyframes = keyframes
      .filter(k => k.timeMs > splitOffsetMs)
      .map(k => ({
        ...k,
        timeMs: k.timeMs - splitOffsetMs
      }));
    keyframesB.push(...rightKeyframes);

    return {
      keyframesA: keyframesA.sort((a, b) => a.timeMs - b.timeMs),
      keyframesB: keyframesB.sort((a, b) => a.timeMs - b.timeMs)
    };
  };

  const splitClipAtTime = async (trackId: string, targetClip: TimelineClip, splitTimeMs: number, shouldPromote = false) => {
    if (!project) return;
    const splitOffsetMs = splitTimeMs - targetClip.positionMs;
    if (splitOffsetMs < 100 || splitOffsetMs > targetClip.durationMs - 100) {
      alert("Split point is too close to the clip boundaries (must be at least 0.1s from start and end).");
      return;
    }

    const oldKeyframes = targetClip.keyframes;
    let keyframesA: TimelineClip['keyframes'] = undefined;
    let keyframesB: TimelineClip['keyframes'] = undefined;

    if (oldKeyframes) {
      keyframesA = {};
      keyframesB = {};
      
      const properties: Array<{
        key: 'scale' | 'x' | 'y' | 'rotation' | 'opacity';
        def: number;
      }> = [
        { key: 'scale', def: targetClip.transform?.scale ?? 100 },
        { key: 'x', def: targetClip.transform?.x ?? 0 },
        { key: 'y', def: targetClip.transform?.y ?? 0 },
        { key: 'rotation', def: targetClip.transform?.rotation ?? 0 },
        { key: 'opacity', def: 100 }
      ];

      for (const { key, def } of properties) {
        const track = oldKeyframes[key];
        if (track && track.length > 0) {
          const { keyframesA: kA, keyframesB: kB } = splitKeyframeTrack(track, splitOffsetMs, def);
          keyframesA[key] = kA;
          keyframesB[key] = kB;
        }
      }
    }

    const clipA: TimelineClip = {
      ...targetClip,
      durationMs: splitOffsetMs,
      trimEndMs: targetClip.trimStartMs + splitOffsetMs,
      keyframes: keyframesA
    };

    const clipBId = Math.random().toString(36).substring(2, 9);
    let clipB: TimelineClip = {
      ...targetClip,
      id: clipBId,
      positionMs: splitTimeMs,
      trimStartMs: targetClip.trimStartMs + splitOffsetMs,
      durationMs: targetClip.durationMs - splitOffsetMs,
      keyframes: keyframesB
    };

    let tracks = [...project.tracks];

    if (shouldPromote) {
      const origTrackIdx = tracks.findIndex(t => t.id === trackId);
      if (origTrackIdx !== -1) {
        const origTrack = tracks[origTrackIdx];
        const trackType = origTrack.type;
        const newTrackId = Math.random().toString(36).substring(2, 9);
        const typeLabel = trackType.charAt(0).toUpperCase() + trackType.slice(1);
        const existingCount = tracks.filter(t => t.type === trackType).length;

        const newTrack: TimelineTrack = {
          id: newTrackId,
          name: `${typeLabel} Track ${existingCount + 1}`,
          type: trackType,
          clips: [],
          locked: false,
          muted: false,
          hidden: false
        };

        // Insert above for video/text, below for audio
        if (trackType === 'video' || trackType === 'text') {
          tracks.splice(origTrackIdx, 0, newTrack);
        } else {
          tracks.splice(origTrackIdx + 1, 0, newTrack);
        }

        clipB = { ...clipB, trackId: newTrackId };

        tracks = tracks.map(t => {
          if (t.id === trackId) {
            return {
              ...t,
              clips: t.clips.map(c => c.id === targetClip.id ? clipA : c).sort((a, b) => a.positionMs - b.positionMs)
            };
          }
          if (t.id === newTrackId) {
            return {
              ...t,
              clips: [clipB]
            };
          }
          return t;
        });
      }
    } else {
      tracks = tracks.map(t => {
        if (t.id === trackId) {
          const filtered = t.clips.filter(c => c.id !== targetClip.id);
          return {
            ...t,
            clips: [...filtered, clipA, clipB].sort((a, b) => a.positionMs - b.positionMs)
          };
        }
        return t;
      });
    }

    await updateTracks(tracks);
    setSelectedClipIds([clipB.id]);
  };



  const renderRuler = () => {
    const ticks: any[] = [];
    const intervalSec = zoom < 20 ? 5 : 1;
    const subInterval = intervalSec === 1 ? 0.5 : 1;

    // Sub-ticks (scaled dynamically to timelineDurationMs to avoid rendering thousands of off-screen nodes)
    for (let timeMs = 0; timeMs < timelineDurationMs; timeMs += subInterval * 1000) {
      const left = timeMs * pxPerMs;
      const isMajor = timeMs % (intervalSec * 1000) === 0;
      if (isMajor) continue;
      ticks.push(
        <div
          key={`sub-${timeMs}`}
          className="absolute bottom-0 w-px bg-[#2c2c32]/70 pointer-events-none select-none"
          style={{ left, height: '30%' }}
        />
      );
    }

    // Major ticks with labels (scaled dynamically to timelineDurationMs)
    for (let timeMs = 0; timeMs < timelineDurationMs; timeMs += intervalSec * 1000) {
      const left = timeMs * pxPerMs;
      const sec = Math.floor(timeMs / 1000) % 60;
      const min = Math.floor(timeMs / 60000);
      ticks.push(
        <div 
          key={timeMs} 
          className="absolute top-0 h-full flex flex-col pointer-events-none select-none"
          style={{ left }}
        >
          <div className="absolute top-0 bottom-0 w-px bg-[#2a2a32]" />
          <span className="absolute bottom-0.5 left-1 text-[8px] font-mono font-medium text-zinc-500">
            {sec === 0 ? `${min}:00` : `${String(min).padStart(1,'0')}:${String(sec).padStart(2,'0')}`}
          </span>
        </div>
      );
    }

    return (
      <div 
        onPointerDown={handleRulerMouseDown} 
        className="sticky top-0 h-6 border-b border-[#2c2c32] bg-[#0a0a0d] cursor-ew-resize flex-shrink-0 z-40 touch-none"
        data-ruler="true"
        style={{ minWidth: `${timelineMinWidth}px` }}
      >
        {ticks}

        {/* Playhead */}
        <div 
          ref={playheadRef}
          className="absolute top-0 bottom-[-4000px] pointer-events-none z-30"
          style={{ left: useEditorStore.getState().currentTime * pxPerMs, width: '1px' }}
        >
          {/* Line — white, thin, no glow */}
          <div className="absolute inset-0 w-px bg-white/90" />

          {/* Timecode pill badge — centered on line */}
          <div
            ref={playheadTextRef}
            className="absolute font-mono font-bold text-white flex items-center justify-center"
            style={{
              top: '-1px',
              left: '50%',
              transform: 'translateX(-50%)',
              minWidth: '46px',
              height: '18px',
              padding: '0 6px',
              fontSize: '9px',
              borderRadius: '5px',
              background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
            }}
          >
            {formatRulerTime(useEditorStore.getState().currentTime)}
          </div>

          {/* Diamond tip */}
          <div
            className="absolute"
            style={{
              top: '17px',
              left: '50%',
              transform: 'translateX(-50%) rotate(45deg)',
              width: '6px',
              height: '6px',
              background: '#8b5cf6',
              borderRadius: '1px',
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <div 
      className="flex flex-col bg-[#18181c] border-t border-[#2c2c32] text-gray-250 select-none overflow-hidden"
      style={{ height }}
    >
      {/* Timeline Toolbar */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-[#1f1f23] bg-[#0a0a0d] text-zinc-400 select-none overflow-x-auto scrollbar-hide w-full max-w-full">
        {/* Left Toolbar Controls */}
        <div className="flex items-center gap-1.5 md:gap-0.5 min-w-max">
          {/* Select Tool */}
          <button
            onClick={() => setToolMode('select')}
            title="Select (V)"
            className={`hidden md:flex p-1 rounded border transition cursor-pointer ${
              toolMode === 'select' ? 'bg-zinc-800 text-sky-400 border-sky-900/50' : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            <MousePointer className="w-3.5 h-3.5" />
          </button>

          {/* Razor Cut Tool */}
          <button
            onClick={() => setToolMode('razor')}
            title="Razor (C)"
            className={`hidden md:flex p-1 rounded border transition cursor-pointer ${
              toolMode === 'razor' ? 'bg-zinc-800 text-red-400 border-red-900/50' : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
          </button>

          <span className="hidden md:inline h-3 w-px bg-zinc-700/60 mx-1" />

          {/* Undo / Redo */}
          <button onClick={undo} disabled={past.length === 0} title="Undo (Ctrl+Z)" className="p-1.5 md:p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 disabled:opacity-25 disabled:hover:bg-transparent transition cursor-pointer">
            <Undo2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
          </button>
          <button onClick={redo} disabled={future.length === 0} title="Redo (Ctrl+Y)" className="p-1.5 md:p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 disabled:opacity-25 disabled:hover:bg-transparent transition cursor-pointer">
            <Redo2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
          </button>

          <span className="h-3 w-px bg-zinc-700/60 mx-1" />


          {/* Delete */}
          <button onClick={() => selectedClipId && removeClip(selectedClipId)} disabled={!selectedClipId} title="Delete (Del)" className="p-1.5 md:p-1 rounded hover:bg-red-950/30 text-zinc-500 hover:text-red-400 disabled:opacity-25 disabled:hover:bg-transparent transition cursor-pointer">
            <Trash2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
          </button>

          <span className="h-3 w-px bg-zinc-700/60 mx-1" />

          {/* Crop */}
          <button onClick={() => { if (selectedClipId) { setTimelineToast("Adjust crop settings in the inspector on the right!"); } }} title="Crop" className="p-1.5 md:p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition cursor-pointer">
            <Crop className="w-4 h-4 md:w-3.5 md:h-3.5" />
          </button>

          {/* Freeze Frame */}
          <button onClick={() => { if (!selectedClipId) { setTimelineToast("Select a clip first to apply Freeze Frame!"); return; } setTimelineToast("Freeze Frame applied!"); }} title="Freeze Frame" className="p-1.5 md:p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition cursor-pointer">
            <Snowflake className="w-4 h-4 md:w-3.5 md:h-3.5" />
          </button>

          {/* Reverse */}
          <button onClick={() => { if (!selectedClipId) { setTimelineToast("Select a clip first to reverse it!"); return; } setTimelineToast("Reverse applied!"); }} title="Reverse" className="p-1.5 md:p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition cursor-pointer">
            <RefreshCw className="w-4 h-4 md:w-3.5 md:h-3.5" />
          </button>

          {/* Rotate */}
          <button
            onClick={() => {
              if (!selectedClipId || !project) { setTimelineToast("Select a video clip first to rotate!"); return; }
              let clip = null;
              for (const track of project.tracks) {
                const c = track.clips.find(x => x.id === selectedClipId);
                if (c) { clip = c; break; }
              }
              if (!clip) return;
              const currentRotation = clip.transform?.rotation || 0;
              const newRotation = (currentRotation + 90) % 360;
              updateClip(selectedClipId, {
                transform: {
                  ...(clip.transform || { scale: 100, x: 0, y: 0, uniformScale: true, blendMode: 'normal' }),
                  rotation: newRotation
                }
              });
            }}
            title="Rotate 90°"
            className="p-1.5 md:p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition cursor-pointer"
          >
            <RotateCw className="w-4 h-4 md:w-3.5 md:h-3.5" />
          </button>

          {/* Enhance Video */}
          <button 
            onClick={async () => {
              if (!selectedClipId || !selectedClip) { 
                setTimelineToast("Select a video/image clip first to enhance!"); 
                return; 
              }
              if (selectedClip.type !== 'video' && selectedClip.type !== 'image') {
                setTimelineToast("Enhancement is only supported for video and image clips.");
                return;
              }
              const isEnhanced = selectedClip.enhanceVideo || false;
              await updateClip(selectedClipId, { enhanceVideo: !isEnhanced });
              setTimelineToast(isEnhanced ? "Video Enhancement disabled" : "Video Enhancement enabled!");
            }} 
            title={selectedClip?.enhanceVideo ? 'Disable Video Enhancement' : 'Enhance Video (Auto Color & Detail Boost)'} 
            className={`p-1.5 md:p-1 rounded transition cursor-pointer ${
              selectedClip?.enhanceVideo 
                ? 'bg-violet-900/40 text-violet-300 border border-violet-800/30' 
                : 'hover:bg-zinc-800 text-zinc-500 hover:text-violet-400'
            }`}
          >
            <Sparkles className="w-4 h-4 md:w-3.5 md:h-3.5" />
          </button>

          <span className="h-3 w-px bg-zinc-700/60 mx-1" />

          {/* Text */}
          <button onClick={handleAddTextClip} title="Add Text" className="p-1.5 md:p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-sky-400 transition cursor-pointer">
            <Type className="w-4 h-4 md:w-3.5 md:h-3.5" />
          </button>

          {/* Stickers */}
          <div className="relative">
            <button
              onClick={() => setShowStickers(!showStickers)}
              title="Stickers"
              className={`p-1.5 md:p-1 rounded transition cursor-pointer ${
                showStickers ? 'bg-zinc-800 text-amber-400' : 'text-zinc-500 hover:text-amber-400'
              }`}
            >
              <Smile className="w-4 h-4 md:w-3.5 md:h-3.5" />
            </button>
            {showStickers && (
              <div className="absolute bottom-7 left-0 z-50 grid grid-cols-4 gap-1 p-1.5 bg-[#18181c] border border-[#2c2c32] rounded shadow-2xl w-40 backdrop-blur-md">
                {emojis.map(e => (
                  <button
                    key={e}
                    onClick={() => handleAddEmojiClip(e)}
                    className="flex items-center justify-center text-lg hover:scale-125 transition p-0.5 hover:bg-[#2a2a30] rounded cursor-pointer"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Toolbar Controls */}
        <div className="flex items-center gap-1.5 md:gap-0.5 min-w-max ml-4 md:ml-0">
          {/* Record Voiceover */}
          <button onClick={() => setShowMicModal(true)} title="Record Voiceover" className="p-1.5 md:p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition cursor-pointer">
            <Mic className="w-4 h-4 md:w-3.5 md:h-3.5" />
          </button>

          <span className="h-3 w-px bg-zinc-700/60 mx-1" />

          {/* Snap Toggle */}
          <button onClick={() => setSnapEnabled(!snapEnabled)} title={snapEnabled ? 'Disable Snapping' : 'Enable Snapping'}
            className={`p-1.5 md:p-1 rounded border transition cursor-pointer ${
              snapEnabled ? 'bg-zinc-800 text-sky-400 border-sky-900/50' : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300'
            }`}>
            <Magnet className="w-4 h-4 md:w-3.5 md:h-3.5" />
          </button>

          {/* Linked Selection Toggle */}
          <button onClick={() => setIsLinkedSelection(!isLinkedSelection)} title={isLinkedSelection ? 'Disable Linked Selection' : 'Enable Linked Selection'}
            className={`p-1.5 md:p-1 rounded border transition cursor-pointer ${
              isLinkedSelection ? 'bg-zinc-800 text-sky-400 border-sky-900/50' : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300'
            }`}>
            <Link2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
          </button>

          {/* Ripple Edit Toggle */}
          <button onClick={() => setRippleEnabled(!rippleEnabled)} title={rippleEnabled ? 'Disable Ripple Edit' : 'Enable Ripple Edit'}
            className={`p-1.5 md:p-1 rounded border transition cursor-pointer ${
              rippleEnabled ? 'bg-zinc-800 text-sky-400 border-sky-900/50' : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300'
            }`}>
            <Rows className="w-4 h-4 md:w-3.5 md:h-3.5" />
          </button>

          {/* Shortcuts Help */}
          <button onClick={() => setShowKeyboardHelp(true)} title="Keyboard Shortcuts" className="hidden md:flex p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition cursor-pointer">
            <Settings className="w-3.5 h-3.5" />
          </button>

          {/* Keyframe Graph Editor Toggle */}
          <button
            onClick={() => setShowGraphEditor(!showGraphEditor)}
            title="Keyframe Graph Editor"
            className={`p-1.5 md:p-1 rounded border transition flex items-center gap-0.5 cursor-pointer ${
              showGraphEditor ? 'bg-zinc-800 text-purple-400 border-purple-900/50' : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-[9px] font-bold">Graph</span>
          </button>

          <span className="h-3 w-px bg-zinc-700/60 mx-1" />

          {/* Zoom Slider Controls */}
          <div className="flex items-center gap-1">
            <button onClick={zoomOut} className="p-0.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min={10}
              max={500}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-16 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-sky-500 focus:outline-none"
            />
            <button onClick={zoomIn} className="p-0.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Tracks Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Fixed Left Gutter Column for Track Controls */}
        <div className="w-32 border-r border-[#1f1f23] bg-[#0f0f12] flex flex-col flex-shrink-0 select-none z-25">
          {/* Spacer aligning with Ruler */}
          <div className="h-6 border-b border-[#2c2c32] bg-[#0a0a0d]" />

          {/* Marker lane spacer */}
          <div className="h-[12px] border-b border-[#1a1a1e] bg-[#080809]" />

          {/* Track Headers */}
          <div 
            ref={headersRef}
            className="flex flex-col flex-1 overflow-y-hidden"
          >
            {project.tracks.map((track) => {
              const isFirstVideoTrack = track.type === 'video' && project.tracks.find(t => t.type === 'video')?.id === track.id;
              return (
                <TrackHeader
                  key={track.id}
                  track={track}
                  trackLabel={getTrackLabel(track)}
                  isFirstVideoTrack={isFirstVideoTrack}
                  editingTrackId={editingTrackId}
                  setEditingTrackId={setEditingTrackId}
                  updateTracks={updateTracks}
                  removeTrack={removeTrack}
                  reorderTrack={reorderTrack}
                  handleToggleTrackControl={handleToggleTrackControl}
                  allTracks={project.tracks}
                />
              );
            })}
          </div>

          {/* Add Track Button Sticky to bottom of Gutter column */}
          <div className="p-2 border-t border-[#1f1f23] flex items-center justify-center gap-1 shrink-0 bg-[#0f0f12]">
            <AddTrackPopover tracks={project.tracks} updateTracks={updateTracks} />
          </div>
        </div>

        {/* Scrollable Tracks Area */}
        <div 
          ref={containerRef}
          onScroll={handleScroll}
          onWheel={handleWheel}
          onPointerDown={handleAreaMouseDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDragOver={handleAreaDragOver}
          onDrop={handleAreaDrop}
          className="flex-1 overflow-x-scroll overflow-y-auto relative bg-[#16161a] timeline-scroll"
          style={{ scrollbarGutter: 'stable' }}
        >
          {/* Ruler */}
          {renderRuler()}

          {/* Marker Lane */}
          <TimelineMarkerLane
            markers={project.markers || []}
            pxPerMs={pxPerMs}
            timelineMinWidth={timelineMinWidth}
            onAddMarker={(timeMs) => {
              const newMarker = {
                id: Math.random().toString(36).substring(2, 9),
                timeMs,
                color: 'blue' as const,
                note: ''
              };
              updateMarkers([...(project.markers || []), newMarker]);
            }}
            onDeleteMarker={(id) => {
              updateMarkers((project.markers || []).filter(m => m.id !== id));
            }}
            onUpdateMarker={(id, updates) => {
              updateMarkers((project.markers || []).map(m => m.id === id ? { ...m, ...updates } : m));
            }}
            setCurrentTime={setCurrentTime}
          />


          {/* Marquee Selection Box */}
          {selectionBox && selectionBox.active && containerRef.current && (
            <div 
              className="absolute border border-sky-500 bg-sky-500/15 pointer-events-none z-50 rounded"
              style={{
                left: Math.min(selectionBox.startX, selectionBox.currentX) + containerRef.current.scrollLeft,
                top: Math.min(selectionBox.startY, selectionBox.currentY) + containerRef.current.scrollTop,
                width: Math.abs(selectionBox.startX - selectionBox.currentX),
                height: Math.abs(selectionBox.startY - selectionBox.currentY),
              }}
            />
          )}
          {/* Tracks List */}
          <div className="flex flex-col relative pt-0.5" style={{ minWidth: `${timelineMinWidth}px`, minHeight: 'calc(100% - 36px)' }}>
            {project.tracks.map(track => {
              const trackHeight = getTrackHeight(track.type);
              const isTrackInactive = track.muted || track.hidden;

              return (
                <div 
                  key={track.id}                 
                  className={`relative border-b border-zinc-900 ${
                    dragOverTrackId === track.id ? 'bg-[#0d1f22]' : 'bg-[#111114]'
                  } flex items-center transition-colors duration-150 shrink-0 ${
                    isTrackInactive ? 'opacity-55 saturate-50' : ''
                  }`}
                  style={{ height: `${trackHeight}px`, marginBottom: '4px' }}
                  onDragOver={(e) => handleDragOver(e, track.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, track.id)}
                >
                {/* Clips within track */}
                <div className="relative w-full h-full">
                  {track.clips.map(clip => {
                    const width = clip.durationMs * pxPerMs;
                    const left = Math.max(0, clip.positionMs * pxPerMs);
                    const isSelected = selectedClipIds.includes(clip.id);
                    // Reference UI: teal border for video/image, dark blue for audio
                    let clipBg = 'bg-[#071e22] border-[#1aa3b8] text-teal-200'; // video/image: visible teal border
                    if (clip.type === 'audio') {
                      const isClipMuted = track.muted || clip.volume === 0;
                      if (isClipMuted) {
                        clipBg = 'bg-[#121214] border-zinc-700/65 text-zinc-500';
                      } else {
                        clipBg = 'bg-[#07101e] border-[#1a3a6e] text-cyan-300';
                      }
                    } else if (clip.type === 'text') {
                      clipBg = 'bg-[#071e22] border-[#1aa3b8] text-teal-200';
                    } else if (clip.type === 'image') {
                      clipBg = 'bg-[#071e22] border-[#1aa3b8] text-teal-200';
                    } else if (clip.type === 'effect') {
                      clipBg = 'bg-[#25103c] border-[#7c3aed] text-purple-200';
                    }

                    return (
                      <div
                        key={clip.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (toolMode === 'razor') {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const clickX = e.clientX - rect.left;
                            const clickMs = clickX / pxPerMs;
                            const splitPointMs = clip.positionMs + clickMs;
                            splitClipAtTime(track.id, clip, splitPointMs, e.shiftKey);
                            return;
                          }
                          
                          // Track tap for mobile double-tap detection
                          handleClipTap(clip.id);

                          if (e.shiftKey) {
                            if (selectedClipIds.includes(clip.id)) {
                              setSelectedClipIds(selectedClipIds.filter(id => id !== clip.id));
                            } else {
                              setSelectedClipIds([...selectedClipIds, clip.id]);
                            }
                          } else {
                            setSelectedClipIds([clip.id]);
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedClipIds([clip.id]);
                          setContextMenu({ x: e.clientX, y: e.clientY, clip, trackId: track.id });
                        }}
                        onPointerDown={(e) => {
                          if (toolMode === 'razor') {
                            e.stopPropagation();
                            return;
                          }
                          handleClipMouseDown(e, track.id, clip, 'move');
                        }}
                        onPointerMove={(e) => {
                          if (toolMode === 'razor') {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const localX = e.clientX - rect.left;
                            setRazorHoverClipId(clip.id);
                            setRazorHoverX(localX);
                          }
                        }}
                        onMouseLeave={() => {
                          setRazorHoverClipId(null);
                        }}
                        onDragOver={(e) => {
                          const hasEffect = e.dataTransfer.types.includes('application/cap-effect-id');
                          const hasTrans = e.dataTransfer.types.includes('application/cap-transition-id');
                          const hasFilter = e.dataTransfer.types.includes('application/cap-filter-id');
                          if (hasEffect || hasTrans || hasFilter) {
                            e.preventDefault();
                            e.stopPropagation();
                          }
                        }}
                        onDrop={async (e) => {
                          const effectId = e.dataTransfer.getData('application/cap-effect-id');
                          const transitionId = e.dataTransfer.getData('application/cap-transition-id');
                          const filterId = e.dataTransfer.getData('application/cap-filter-id');
                          if (effectId) {
                            e.preventDefault();
                            e.stopPropagation();
                            const currentEffects = clip.videoEffects || [];
                            const exists = currentEffects.some(eff => eff.id === effectId);
                            if (!exists) {
                              const def = EFFECTS_REGISTRY[effectId];
                              const newEffects = [...currentEffects, { id: effectId, intensity: def?.defaultIntensity || 60 }];
                              await updateClip(clip.id, { videoEffects: newEffects });
                            }
                          } else if (transitionId) {
                            e.preventDefault();
                            e.stopPropagation();
                            await updateClip(clip.id, {
                              transitionType: transitionId,
                              fadeInMs: 1000,
                              transitionIn: { type: transitionId, durationMs: 1000, easing: 'ease-in-out' }
                            });
                          } else if (filterId) {
                            e.preventDefault();
                            e.stopPropagation();
                            await updateClip(clip.id, {
                              filterSettings: {
                                type: filterId,
                                intensity: 80
                              }
                            });
                          }
                        }}
                        className={`absolute ${
                          track.type === 'video' || track.type === 'audio' ? 'top-0 bottom-0 p-0' : 'top-1 bottom-1 p-1'
                        } rounded flex flex-col items-start justify-start transition ${
                          toolMode === 'razor' ? 'cursor-cell border-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.25)]' : 'cursor-grab'
                        } select-none overflow-hidden border ${
                          isSelected
                            ? 'ring-2 ring-offset-0 ring-sky-400 border-sky-400/60 z-20 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
                            : ''
                        } ${clipBg} ${clip.disabled ? 'opacity-40 saturate-50' : ''} touch-none`}
                        style={{ left, width }}
                        title={clip.name}
                      >
                        {/* Transition visual overlay indicator (Pink/Violet gradient block) */}
                        {(() => {
                          // Check if this clip is adjacent to a previous clip
                          const sortedClips = [...track.clips].sort((a, b) => a.positionMs - b.positionMs);
                          const myIdx = sortedClips.findIndex(c => c.id === clip.id);
                          const isAdjacentToPrev = myIdx > 0 && (clip.positionMs - (sortedClips[myIdx - 1].positionMs + sortedClips[myIdx - 1].durationMs) < 100);

                          // If adjacent, we show the centered transition connector instead of the pink block
                          if (isAdjacentToPrev) return null;

                          const trans = clip.transitionIn || (clip.transitionType && clip.transitionType !== 'none'
                            ? { type: clip.transitionType, durationMs: clip.fadeInMs || 1000 }
                            : null);
                          const transDuration = trans && trans.type !== 'none' ? trans.durationMs : 0;
                          const transWidth = transDuration * pxPerMs;
                          if (transWidth > 0) {
                            return (
                              <div
                                className="absolute left-0 top-0 bottom-0 pointer-events-none select-none z-10"
                                style={{
                                  width: `${Math.min(width, transWidth)}px`,
                                  background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.35) 0%, rgba(139, 92, 246, 0.35) 100%)',
                                  borderRight: '1px solid rgba(236, 72, 153, 0.6)'
                                }}
                                title={`Transition: ${trans?.type || ''} (${(transDuration/1000).toFixed(1)}s)`}
                              />
                            );
                          }
                          return null;
                        })()}

                        {/* Video Effect Star badge */}
                        {clip.videoEffects && clip.videoEffects.length > 0 && (
                          <Sparkles className="w-2.5 h-2.5 text-purple-300 absolute right-1.5 top-1 z-25 pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,1)] animate-pulse" />
                        )}

                        {/* Razor Cut Hover Guideline */}
                        {toolMode === 'razor' && razorHoverClipId === clip.id && (
                          <div
                            className="absolute top-0 bottom-0 w-px border-l border-dashed border-red-500 pointer-events-none z-30"
                            style={{ left: `${razorHoverX}px` }}
                          />
                        )}

                        {/* Audio Waveform overlay */}
                        {(clip.type === 'audio' || clip.type === 'video') && clip.assetId && (
                          <WaveformBar
                            assetId={clip.assetId}
                            durationMs={clip.durationMs}
                            trimStartMs={clip.trimStartMs}
                            trimEndMs={clip.trimEndMs}
                            color={clip.type === 'audio' ? 'rgba(34, 211, 238, 0.45)' : 'rgba(255, 255, 255, 0.25)'}
                          />
                        )}

                        {/* Audio/Video Fade Handles */}
                        {(clip.type === 'audio' || clip.type === 'video') && (
                          <ClipFadeHandles
                            clipId={clip.id}
                            fadeInMs={clip.fadeInMs || 0}
                            fadeOutMs={clip.fadeOutMs || 0}
                            durationMs={clip.durationMs}
                            pxPerMs={pxPerMs}
                            width={width}
                            height={trackHeight}
                            updateClip={updateClip}
                          />
                        )}

                        {/* Left Trim Handle */}
                        <div
                          onPointerDown={(e) => handleClipMouseDown(e, track.id, clip, 'trim-start')}
                          className="absolute left-0 top-0 bottom-0 w-4 hover:w-5 md:w-1.5 md:hover:w-2.5 bg-white/10 hover:bg-sky-400/80 cursor-col-resize transition-all z-20 rounded-l touch-none"
                          title="Trim Start"
                        />

                        {/* Clip Name & Duration — top label floats over filmstrip */}
                        <div className="absolute inset-0 z-10 flex items-center gap-1.5 px-1.5 text-[9.5px] font-semibold text-white max-w-full pointer-events-none select-none overflow-hidden drop-shadow-[0_1px_3px_rgba(0,0,0,1)]">
                          {clip.type === 'effect' && (
                            <Sparkles className="w-3 h-3 text-purple-300 shrink-0 mr-0.5 animate-pulse" />
                          )}
                          <span className={`${clip.type === 'audio' && (track.muted || clip.volume === 0) ? 'text-zinc-500' : 'text-white'} truncate`}>{clip.name}</span>
                          {clip.type !== 'text' && (
                            <span className={`${clip.type === 'audio' && (track.muted || clip.volume === 0) ? 'text-zinc-650 font-bold' : clip.type === 'effect' ? 'text-purple-300' : 'text-[#5ddcf0]'} font-mono text-[8px] shrink-0 ml-1`}>
                              {formatClipDuration(clip.durationMs)}
                            </span>
                          )}
                        </div>

                        {/* Static image thumbnail for image clips */}
                        {clip.type === 'image' && clip.assetId && thumbnailCache[clip.assetId] && (
                          <div className="absolute left-0 right-0 top-[14px] h-[32px] overflow-hidden pointer-events-none select-none z-0 opacity-75 rounded-sm">
                            <img
                              src={thumbnailCache[clip.assetId][0]}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          </div>
                        )}

                        {/* Filmstrip video thumbnails */}
                        {clip.type === 'video' && clip.assetId && thumbnailCache[clip.assetId] && (() => {
                          const thumbWidth = 60;
                          const thumbCount = Math.max(1, Math.ceil(width / thumbWidth));
                          const frames = thumbnailCache[clip.assetId];
                          return (
                            <div className="absolute left-0 right-0 top-[14px] h-[32px] flex overflow-hidden pointer-events-none select-none z-0 rounded-sm">
                              {Array.from({ length: thumbCount }).map((_, idx) => {
                                const frameIdx = Math.min(frames.length - 1, Math.floor((idx / thumbCount) * frames.length));
                                const imgUrl = frames[frameIdx];
                                return (
                                  <img
                                    key={idx}
                                    src={imgUrl}
                                    alt=""
                                    className="h-full object-cover shrink-0 grow-0 border-r border-black/20"
                                    style={{ width: `${thumbWidth}px` }}
                                  />
                                );
                              })}
                            </div>
                          );
                        })()}

                        {/* Audio waveform — high-density thin bars with orange tips */}
                        {clip.type === 'audio' && (() => {
                          const barWidth = 1.5;
                          const gap = 1;
                          const step = barWidth + gap;
                          const barCount = Math.max(5, Math.floor(width / step));
                          const peaks = clip.assetId && waveformCache[clip.assetId] ? waveformCache[clip.assetId] : [];
                          const isClipMuted = track.muted || clip.volume === 0;

                          return (
                            <div className={`absolute inset-x-1 bottom-[2px] top-[14px] flex items-end justify-start gap-[1px] pointer-events-none select-none z-10 overflow-hidden ${isClipMuted ? 'opacity-35' : 'opacity-90'}`}>
                              {Array.from({ length: barCount }).map((_, i) => {
                                const peakIdx = peaks.length > 0 ? Math.floor((i / barCount) * peaks.length) : -1;
                                const peak = peakIdx !== -1 && peaks[peakIdx] !== undefined ? peaks[peakIdx] : 0.2 + Math.abs(Math.sin(i * 0.15) * 0.6);
                                const heightPercent = Math.max(15, peak * 85);

                                return (
                                  <div
                                    key={i}
                                    className="flex flex-col justify-end gap-0"
                                    style={{ width: `${barWidth}px`, height: `${heightPercent}%` }}
                                  >
                                    <div className={`w-full h-[1.5px] shrink-0 ${isClipMuted ? 'bg-zinc-650' : 'bg-orange-500'}`} />
                                    <div className={`w-full grow ${isClipMuted ? 'bg-zinc-700' : 'bg-[#1aa3b8]'}`} />
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}

                        {/* Attached mini audio waveform below the filmstrip for video clips (hidden if volume is 0 / detached) */}
                        {clip.type === 'video' && clip.volume !== 0 && (() => {
                          const barWidth = 1.5;
                          const gap = 1;
                          const step = barWidth + gap;
                          const barCount = Math.max(5, Math.floor(width / step));
                          const peaks = clip.assetId && waveformCache[clip.assetId] ? waveformCache[clip.assetId] : [];

                          return (
                            <div className="absolute left-0 right-0 top-[30px] bottom-[2px] flex items-end justify-start gap-[1px] bg-[#071e22]/50 px-0.5 pointer-events-none select-none z-10 overflow-hidden">
                              {Array.from({ length: barCount }).map((_, i) => {
                                const peakIdx = peaks.length > 0 ? Math.floor((i / barCount) * peaks.length) : -1;
                                const peak = peakIdx !== -1 && peaks[peakIdx] !== undefined ? peaks[peakIdx] : 0.2 + Math.abs(Math.sin(i * 0.2) * 0.5);
                                const heightPercent = Math.max(15, peak * 80);

                                return (
                                  <div
                                    key={i}
                                    className="flex flex-col justify-end gap-0"
                                    style={{ width: `${barWidth}px`, height: `${heightPercent}%` }}
                                  >
                                    <div className="w-full h-[1px] bg-orange-500 shrink-0" />
                                    <div className="w-full bg-[#1aa3b8] grow" />
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}

                        {/* Teal bottom accent stripe on video/image clips (matches reference UI) */}
                        {(clip.type === 'video' || clip.type === 'image') && (
                          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#1ecfed] z-10 pointer-events-none rounded-b opacity-90" />
                        )}

                        {/* Visual Keyframe Markers (Diamonds) */}
                        {(() => {
                          const keys = new Set<number>();
                          if (clip.keyframes) {
                            Object.values(clip.keyframes).forEach((arr: any) => {
                              if (Array.isArray(arr)) {
                                arr.forEach((k: any) => keys.add(k.timeMs));
                              }
                            });
                          }
                          return Array.from(keys).map((timeMs) => {
                            const leftPos = timeMs * pxPerMs;
                            if (leftPos >= 0 && leftPos <= width) {
                              return (
                                <div
                                  key={timeMs}
                                  className="absolute w-2 h-2 bg-cyan-400 border border-zinc-950 rotate-45 z-30 pointer-events-none transform -translate-x-1/2 -translate-y-1/2 shadow-lg"
                                  style={{ left: `${leftPos}px`, top: '50%' }}
                                  title={`Keyframe at ${formatClipDuration(timeMs)}`}
                                />
                              );
                            }
                            return null;
                          });
                        })()}

                        {/* Audio Gain Rubber Band */}
                        {(clip.type === 'audio' || clip.type === 'video') && (() => {
                          const maxH = track.type === 'audio' ? 22 : 12;
                          const bottomOffset = 2 + ((clip.volume ?? 100) / 100) * maxH;
                          const isClipMuted = (clip.type === 'audio' && track.muted) || clip.volume === 0;
                          return (
                            <div
                              onPointerDown={(e) => handleGainMouseDown(e, clip.id, clip.volume ?? 100)}
                              className={`absolute left-0 right-0 h-[3px] cursor-ns-resize z-30 group/gain transition-colors touch-none ${
                                isClipMuted ? 'bg-zinc-650/30 hover:bg-zinc-550/50' : 'bg-yellow-500/55 hover:bg-yellow-400'
                              }`}
                              style={{ bottom: `${bottomOffset}px` }}
                              title={`Volume: ${clip.volume ?? 100}% (Drag up/down to adjust gain)`}
                            >
                              <div className={`absolute left-1/2 -translate-x-1/2 bottom-2 bg-zinc-950/90 border border-zinc-800 text-[8px] font-mono font-bold px-1 py-0.5 rounded opacity-0 group-hover/gain:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-40 ${
                                isClipMuted ? 'text-zinc-500' : 'text-yellow-400'
                              }`}>
                                Gain: {clip.volume ?? 100}%
                              </div>
                            </div>
                          );
                        })()}

                        {/* Right Trim Handle */}
                        <div
                          onPointerDown={(e) => handleClipMouseDown(e, track.id, clip, 'trim-end')}
                          className="absolute right-0 top-0 bottom-0 w-4 hover:w-5 md:w-1.5 md:hover:w-2.5 bg-white/10 hover:bg-sky-400/80 cursor-col-resize transition-all z-20 rounded-r touch-none"
                          title="Trim End"
                        />
                      </div>
                    );
                  })}

                  {/* Transition Connectors between adjacent clips */}
                  {(() => {
                    const connectors = [];
                    const sortedClips = [...track.clips].sort((a, b) => a.positionMs - b.positionMs);
                    for (let i = 1; i < sortedClips.length; i++) {
                      const prev = sortedClips[i - 1];
                      const curr = sortedClips[i];
                      const gap = curr.positionMs - (prev.positionMs + prev.durationMs);
                      // If they are adjacent (within 100ms)
                      if (gap < 100 && (prev.type === 'video' || prev.type === 'image') && (curr.type === 'video' || curr.type === 'image')) {
                        const boundaryX = curr.positionMs * pxPerMs;
                        const hasTransition = curr.transitionIn && curr.transitionIn.type !== 'none';
                        const transDuration = curr.transitionIn?.durationMs || 0;
                        const transWidth = transDuration * pxPerMs;
                        
                        connectors.push({
                          prevId: prev.id,
                          currId: curr.id,
                          boundaryX,
                          hasTransition,
                          transWidth,
                          transitionType: curr.transitionIn?.type
                        });
                      }
                    }

                    return connectors.map((conn, cIdx) => {
                      const width = 20;
                      const height = 28; // height of the connector box
                      const left = conn.boundaryX - width / 2;
                      
                      return (
                        <div key={cIdx} className="absolute top-1/2 -translate-y-1/2 z-30" style={{ left: `${left}px`, width: `${width}px`, height: `${height}px` }}>
                          {/* Hatched Overlay if transition is present */}
                          {conn.hasTransition && (
                             <>
                               {/* Solid white border box outline when selected */}
                               {selectedClipIds.includes(conn.currId) && (
                                 <div 
                                   className="absolute top-1/2 -translate-y-1/2 pointer-events-none border-2 border-white rounded z-35 animate-fade-in"
                                   style={{ 
                                     left: `-${conn.transWidth / 2 - width / 2}px`, 
                                     width: `${conn.transWidth}px`, 
                                     height: '36px',
                                   }}
                                 />
                               )}

                               <div 
                                 className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
                                 style={{ 
                                   left: `-${conn.transWidth / 2 - width / 2}px`, 
                                   width: `${conn.transWidth}px`, 
                                   height: '36px',
                                   background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.08), rgba(255,255,255,0.08) 4px, rgba(0,0,0,0.15) 4px, rgba(0,0,0,0.15) 8px)',
                                   borderLeft: '1px dashed rgba(255,255,255,0.3)',
                                   borderRight: '1px dashed rgba(255,255,255,0.3)',
                                 }}
                               />

                               {/* Left Resize Handle */}
                               <div
                                 onPointerDown={(e) => handleTransitionResizeMouseDown(e, conn.currId, 'left', conn.transWidth / pxPerMs, conn.prevId)}
                                 className={`absolute top-1/2 -translate-y-1/2 z-40 transition-colors touch-none cursor-col-resize ${
                                   selectedClipIds.includes(conn.currId)
                                     ? 'w-1.5 h-9 bg-white border border-zinc-600 rounded-sm hover:bg-sky-400'
                                     : 'w-1.5 h-9 hover:bg-sky-500/80'
                                 }`}
                                 style={{ left: `-${conn.transWidth / 2 - width / 2}px`, transform: 'translate(-50%, -50%)' }}
                                 title="Drag to adjust transition duration"
                               />

                               {/* Right Resize Handle */}
                               <div
                                 onPointerDown={(e) => handleTransitionResizeMouseDown(e, conn.currId, 'right', conn.transWidth / pxPerMs, conn.prevId)}
                                 className={`absolute top-1/2 -translate-y-1/2 z-40 transition-colors touch-none cursor-col-resize ${
                                   selectedClipIds.includes(conn.currId)
                                     ? 'w-1.5 h-9 bg-white border border-zinc-600 rounded-sm hover:bg-sky-400'
                                     : 'w-1.5 h-9 hover:bg-sky-500/80'
                                 }`}
                                 style={{ left: `${conn.transWidth / 2 + width / 2}px`, transform: 'translate(-50%, -50%)' }}
                                 title="Drag to adjust transition duration"
                               />
                             </>
                          )}

                          {/* Connector Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Select the incoming clip so user can edit transition in the sidebar
                              setSelectedClipIds([conn.currId]);
                            }}
                            onDragOver={(e) => {
                              const hasTrans = e.dataTransfer.types.includes('application/cap-transition-id');
                              if (hasTrans) {
                                e.preventDefault();
                                e.stopPropagation();
                              }
                            }}
                            onDrop={async (e) => {
                              const transitionId = e.dataTransfer.getData('application/cap-transition-id');
                              if (transitionId) {
                                e.preventDefault();
                                e.stopPropagation();
                                if (transitionId === 'clear') {
                                  await updateClip(conn.currId, { transitionType: 'none', fadeInMs: 0, transitionIn: undefined });
                                } else {
                                  await updateClip(conn.currId, {
                                    transitionType: transitionId,
                                    fadeInMs: 1000,
                                    transitionIn: { type: transitionId, durationMs: 1000, easing: 'ease-in-out' }
                                  });
                                }
                              }
                            }}
                            className={`w-full h-full rounded border flex items-center justify-center transition-all cursor-pointer ${
                              conn.hasTransition 
                                ? 'bg-sky-600/90 border-sky-400 text-white shadow-[0_0_8px_rgba(56,189,248,0.4)] hover:bg-sky-500' 
                                : 'bg-zinc-900/95 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                            }`}
                            title={conn.hasTransition ? `Transition: ${conn.transitionType} (Click to select clip)` : "Drag & drop transition here to connect"}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-2.5 h-2.5">
                              <path d="M4 6l16 12V6L4 18V6z" />
                            </svg>
                          </button>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            );
          })}
          </div>

          {/* Drag and Drop Guide Line */}
          {dragOverTrackId && dragOverTimeMs !== null && (
            <div 
              className="absolute top-0 bottom-0 w-[1.5px] border-l border-dashed border-sky-400 pointer-events-none z-30"
              style={{ left: dragOverTimeMs * pxPerMs }}
            >
              <div className="bg-sky-600 text-white text-[8px] font-mono px-1.5 py-0.5 rounded absolute -top-4 -left-7 whitespace-nowrap shadow border border-sky-450">
                Drop here ({formatRulerTime(dragOverTimeMs)})
              </div>
            </div>
          )}

      </div>
    </div>

      {/* Keyboard Shortcuts Help Overlay */}
      {showKeyboardHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowKeyboardHelp(false)}
        >
          <div
            className="bg-[#18181c] border border-[#2c2c32] rounded-xl p-5 w-[400px] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-gray-100">⌨️ Keyboard Shortcuts</h3>
              <button onClick={() => setShowKeyboardHelp(false)} className="text-gray-500 hover:text-gray-250 text-xs transition">✕ Close</button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              {[
                ['Space', 'Play / Pause'],
                ['S', 'Split clip at playhead'],
                ['Delete / Backspace', 'Delete selected clip'],
                ['Z (Ctrl/Cmd)', 'Undo'],
                ['Shift+Z (Ctrl/Cmd)', 'Redo'],
                ['← / →', 'Step 1 frame (~33ms)'],
                ['Shift+← / →', 'Jump 1 second'],
                ['[ / ]', 'Zoom out / Zoom in'],
                ['Escape', 'Deselect clip'],
              ].map(([key, action]) => (
                <div key={key} className="flex items-start gap-2">
                  <kbd className="px-1.5 py-0.5 bg-[#121214] border border-[#2c2c32] rounded text-gray-300 font-mono whitespace-nowrap text-[9px]">{key}</kbd>
                  <span className="text-gray-400">{action}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* ─── Clip Right-Click Context Menu ─── */}
      {contextMenu && (() => {
        const cm = contextMenu;
        const isDeactivated = !!cm.clip.disabled;
        const isVideo = cm.clip.type === 'video';
        const isAudio = cm.clip.type === 'audio';

        // Viewport-aware positioning
        const menuW = 240;
        const menuH = 360; // Better estimation of menu height
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const x = cm.x + menuW > vw ? cm.x - menuW : cm.x;
        const y = cm.y + menuH > vh ? cm.y - menuH : cm.y;

        type MenuItem =
          | { type: 'item'; label: string; icon?: React.ReactNode; shortcut?: string; disabled?: boolean; danger?: boolean; action: () => void; sub?: boolean }
          | { type: 'sep' };

        const menuItems: MenuItem[] = [
          {
            type: 'item', label: 'Copy', icon: <Copy size={12} />, shortcut: '⌘ C',
            action: () => { setClipboard({ ...cm.clip }); closeContextMenu(); }
          },
          {
            type: 'item', label: 'Cut', icon: <Scissors size={12} />, shortcut: '⌘ X',
            action: () => { setClipboard({ ...cm.clip }); removeClip(cm.clip.id); closeContextMenu(); }
          },
          {
            type: 'item', label: 'Copy attributes', icon: <FileCog size={12} />, shortcut: '⌘ ⇧ C',
            action: () => { setClipboard({ ...cm.clip }); closeContextMenu(); }
          },
          {
            type: 'item', label: 'Paste attributes', icon: <Clipboard size={12} />, shortcut: '⌘ ⇧ V',
            disabled: !clipboard,
            action: () => {
              if (clipboard) updateClip(cm.clip.id, { trimStartMs: clipboard.trimStartMs, trimEndMs: clipboard.trimEndMs });
              closeContextMenu();
            }
          },
          { type: 'sep' },
          {
            type: 'item', label: 'Delete', icon: <Trash2 size={12} />, shortcut: '⌫', danger: true,
            action: () => { removeClip(cm.clip.id); closeContextMenu(); }
          },
          {
            type: 'item', label: 'Ripple Delete', icon: <Trash2 size={12} />, shortcut: '⇧ ⌫', danger: true,
            action: () => { removeClip(cm.clip.id, true); closeContextMenu(); }
          },
          {
            type: 'item', label: 'Duplicate', icon: <Copy size={12} />,
            action: () => {
              const dup: TimelineClip = {
                ...cm.clip,
                id: Math.random().toString(36).substring(2, 9),
                positionMs: cm.clip.positionMs + cm.clip.durationMs + 200,
              };
              addClip(cm.trackId, dup);
              closeContextMenu();
            }
          },
          { type: 'sep' },
          {
            type: 'item',
            label: isDeactivated ? 'Activate clip' : 'Deactivate clip',
            icon: <Power size={12} />,
            shortcut: 'V',
            action: () => {
              updateClip(cm.clip.id, { disabled: !cm.clip.disabled });
              closeContextMenu();
            }
          },
          {
            type: 'item', label: 'Trim clip', icon: <Crop size={12} />,
            action: () => { setSelectedClipId(cm.clip.id); closeContextMenu(); }
          },
          {
            type: 'item', label: 'Replace clip', icon: <RefreshCw size={12} />,
            disabled: true, action: closeContextMenu
          },
          {
            type: 'item', label: 'Link to media', icon: <Link2 size={12} />,
            disabled: true, action: closeContextMenu
          },
          {
            type: 'item', label: 'Open file location', icon: <FolderOpen size={12} />,
            disabled: !isVideo && !isAudio,
            action: closeContextMenu
          },
          { type: 'sep' },
          {
            type: 'item',
            label: 'Detach audio',
            icon: <VolumeX size={12} />,
            disabled: !isVideo || cm.clip.volume === 0,
            action: () => { handleDetachAudio(cm.clip); closeContextMenu(); }
          },
          {
            type: 'item',
            label: 'Restore audio',
            icon: <Volume2 size={12} />,
            disabled: !isVideo || cm.clip.volume !== 0,
            action: () => { handleRestoreAudio(cm.clip); closeContextMenu(); }
          },
          {
            type: 'item', label: 'Sync video and audio', icon: <Wand2 size={12} />,
            disabled: true, action: closeContextMenu
          },
          { type: 'sep' },
          {
            type: 'item', label: 'Create compound clip', icon: <FileVideo size={12} />, shortcut: '⌥ G',
            action: closeContextMenu
          },
          {
            type: 'item', label: 'Save preset', icon: <Settings size={12} />,
            action: closeContextMenu
          },
          { type: 'sep' },
          {
            type: 'item', label: 'Range', icon: <Rows size={12} />, sub: true,
            disabled: true, action: closeContextMenu
          },
          {
            type: 'item', label: 'Render', icon: <ImageIcon size={12} />, sub: true,
            disabled: true, action: closeContextMenu
          },
        ];

        return (
          <div
            id="clip-context-menu"
            className="fixed z-[9999] select-none"
            style={{ left: x, top: y }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseMove={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
          >
            <div
              className="w-[240px] rounded-xl overflow-hidden shadow-2xl border border-white/10"
              style={{
                background: 'rgba(28,28,32,0.97)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}
            >
              {/* Header: clip name */}
              <div className="px-3 py-2 border-b border-white/10">
                <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold">Clip</p>
                <p className="text-[11px] text-white/80 font-medium truncate mt-0.5">{cm.clip.name}</p>
              </div>

              <div className="py-1">
                {menuItems.map((item, i) => {
                  if (item.type === 'sep') {
                    return <div key={`sep-${i}`} className="my-1 mx-2 border-t border-white/8" />;
                  }
                  return (
                    <button
                      key={item.label}
                      disabled={item.disabled}
                      onClick={item.disabled ? undefined : item.action}
                      className={`w-full flex items-center gap-2.5 px-3 py-[5px] text-left text-[12px] font-medium transition-colors
                        ${item.disabled
                          ? 'text-white/25 cursor-default'
                          : item.danger
                            ? 'text-red-400 hover:bg-red-500/15 hover:text-red-300 cursor-pointer'
                            : 'text-white/80 hover:bg-white/8 hover:text-white cursor-pointer'
                        }`}
                    >
                      <span className="w-3.5 shrink-0 text-white/40">{item.icon}</span>
                      <span className="flex-1">{item.label}</span>
                      {item.shortcut && (
                        <span className="text-[10px] text-white/30 font-mono shrink-0">{item.shortcut}</span>
                      )}
                      {item.sub && <ChevronRight size={11} className="text-white/25 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Keyframe Graph Editor */}
      {showGraphEditor && (
        <KeyframeGraphEditor
          clip={selectedClip}
          currentTime={useEditorStore.getState().currentTime}
          updateClip={updateClip}
        />
      )}

      {/* Voiceover Recording Modal */}
      <VoiceoverRecorder isOpen={showMicModal} onClose={() => setShowMicModal(false)} />

      {/* Premium custom non-blocking Toast notification */}
      {timelineToast && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 bg-zinc-900/95 border border-zinc-700/60 rounded-xl shadow-2xl flex items-center gap-2.5 backdrop-blur-md animate-fade-in-up text-[11px] text-zinc-100 font-semibold max-w-[90vw]">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse shrink-0" />
          <span>{timelineToast}</span>
        </div>
      )}
    </div>
  );
}
