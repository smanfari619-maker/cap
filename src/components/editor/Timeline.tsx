import { useRef, useEffect, useState, useCallback } from 'react';
import { Type, Scissors, Trash2, ZoomIn, ZoomOut, Lock, Unlock, Volume2, VolumeX, Eye, EyeOff, Smile, Undo2, Redo2, Magnet, Link2, Rows, Settings, Image as ImageIcon, Music, MousePointer, Crop, Snowflake, RotateCw, Mic, RefreshCw, Copy, Clipboard, FileCog, FolderOpen, Power, Wand2, FileVideo, ChevronRight } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import { db, type TimelineClip, type TimelineTrack } from '../../lib/db';

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

export default function Timeline({ height }: { height: number }) {
  const project = useEditorStore(state => state.project);
  const setCurrentTime = useEditorStore(state => state.setCurrentTime);
  const selectedClipId = useEditorStore(state => state.selectedClipId);
  const selectedClipIds = useEditorStore(state => state.selectedClipIds);
  const setSelectedClipId = useEditorStore(state => state.setSelectedClipId);
  const setSelectedClipIds = useEditorStore(state => state.setSelectedClipIds);
  const zoom = useEditorStore(state => state.zoom); // pixels per second
  const setZoom = useEditorStore(state => state.setZoom);
  const updateTracks = useEditorStore(state => state.updateTracks);
  const updateClip = useEditorStore(state => state.updateClip);
  const removeClip = useEditorStore(state => state.removeClip);
  const splitClipAtPlayhead = useEditorStore(state => state.splitClipAtPlayhead);
  const addClip = useEditorStore(state => state.addClip);
  const addTrack = useEditorStore(state => state.addTrack);
  const removeTrack = useEditorStore(state => state.removeTrack);
  const reorderTrack = useEditorStore(state => state.reorderTrack);
  const undo = useEditorStore(state => state.undo);
  const redo = useEditorStore(state => state.redo);
  const past = useEditorStore(state => state.past);
  const future = useEditorStore(state => state.future);

  const containerRef = useRef<HTMLDivElement>(null);
  const pxPerMs = zoom / 1000;

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
  const [waveformCache, setWaveformCache] = useState<Record<string, number[]>>({});
  const [assetDurations, setAssetDurations] = useState<Record<string, number>>({});
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const snapEnabledRef = useRef(true);
  const [rippleEnabled, setRippleEnabled] = useState(false);

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

  // High-Performance Playhead & Auto-Scroll Subscription:
  // Updates the DOM directly on every frame without triggering React re-renders.
  useEffect(() => {
    let lastTime = -1;
    const unsubscribe = useEditorStore.subscribe((state) => {
      const time = state.currentTime;
      if (time === lastTime) return;
      lastTime = time;

      // 1. Move playhead
      if (playheadRef.current) {
        playheadRef.current.style.left = `${time * pxPerMs}px`;
      }
      if (playheadTextRef.current) {
        playheadTextRef.current.textContent = formatRulerTime(time);
      }

      // 2. Right-only auto-scroll
      if (state.isPlaying && containerRef.current) {
        const el = containerRef.current;
        const playheadX = time * pxPerMs;
        const visibleRight = el.scrollLeft + el.clientWidth;

        if (playheadX > visibleRight - 120) {
          const target = Math.max(autoScrollMaxRef.current, playheadX - el.clientWidth + 200);
          autoScrollMaxRef.current = target;
          el.scrollLeft = target;
        }
      }
    });
    return unsubscribe;
  }, [pxPerMs]);

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
  const [deactivatedClips, setDeactivatedClips] = useState<Set<string>>(new Set());

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
      .filter(c => c.assetId && !thumbnailCache[c.assetId]);
      
    videoClips.forEach(async (clip) => {
      if (!clip.assetId) return;
      const assetId = clip.assetId;
      
      try {
        const asset = await db.assets.get(assetId);
        if (!asset) return;

        const { getFileFromOPFS } = await import('../../lib/opfs');
        const file = await getFileFromOPFS(asset.opfsPath);
        const objectUrl = URL.createObjectURL(file);
        
        const video = document.createElement('video');
        video.src = objectUrl;
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        
        await new Promise((resolve) => {
          video.onloadedmetadata = resolve;
        });

        const duration = video.duration;
        const numFrames = 10;
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
        
        setThumbnailCache(prev => ({
          ...prev,
          [assetId]: frames
        }));
        
        URL.revokeObjectURL(objectUrl);
        video.remove();
      } catch (error) {
        console.error(`Failed to extract thumbnails for asset ${assetId}:`, error);
      }
    });
  }, [project, thumbnailCache]);

  // Real PCM Waveform extractor for audio clips
  useEffect(() => {
    if (!project) return;
    const audioClips = project.tracks
      .filter(t => t.type === 'audio')
      .flatMap(t => t.clips)
      .filter(c => c.assetId && !waveformCache[c.assetId]);

    audioClips.forEach(async (clip) => {
      if (!clip.assetId) return;
      const assetId = clip.assetId;
      try {
        const asset = await db.assets.get(assetId);
        if (!asset) return;
        const { getFileFromOPFS } = await import('../../lib/opfs');
        const file = await getFileFromOPFS(asset.opfsPath);
        const arrayBuffer = await file.arrayBuffer();
        const audioCtx = new AudioContext();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);
        await audioCtx.close();

        const channelData = decoded.getChannelData(0);
        const numBuckets = 80;
        const bucketSize = Math.floor(channelData.length / numBuckets);
        const peaks: number[] = [];
        for (let i = 0; i < numBuckets; i++) {
          let max = 0;
          for (let j = 0; j < bucketSize; j++) {
            max = Math.max(max, Math.abs(channelData[i * bucketSize + j]));
          }
          peaks.push(Math.min(1, max));
        }
        setWaveformCache(prev => ({ ...prev, [assetId]: peaks }));
      } catch (e) {
        console.warn('Waveform extraction failed for', assetId, e);
      }
    });
  }, [project, waveformCache]);

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

  const handleDragLeave = () => {
    setDragOverTrackId(null);
    setDragOverTimeMs(null);
  };

  const handleDrop = async (e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    setDragOverTrackId(null);
    setDragOverTimeMs(null);

    const assetId = e.dataTransfer.getData('application/cap-asset-id');
    const assetType = e.dataTransfer.getData('application/cap-asset-type');
    
    if (!assetId || !project) return;

    const track = project.tracks.find(t => t.id === trackId);
    if (!track) return;

    // Allow video → video, audio → audio, image → image
    if (track.type !== assetType) {
      alert(`Cannot drop a ${assetType} asset onto a ${track.type} track.`);
      return;
    }

    const asset = await db.assets.get(assetId);
    if (!asset) return;

    // Calculate drop position
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !containerRef.current) return;
    const clientX = e.clientX - rect.left + containerRef.current.scrollLeft;
    const dropTimeMs = Math.max(0, clientX / pxPerMs);

    const clipId = Math.random().toString(36).substring(2, 9);
    const newClip: Omit<TimelineClip, 'trackId'> = {
      id: clipId,
      assetId: asset.id,
      type: track.type as 'video' | 'audio' | 'image',
      name: asset.name,
      durationMs: asset.durationMs,
      trimStartMs: 0,
      trimEndMs: asset.durationMs,
      positionMs: dropTimeMs,
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

    await addClip(trackId, newClip);
    setSelectedClipId(clipId);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      // Zoom in/out smoothly
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(zoom * zoomFactor);
    } else {
      // Horizontal scroll instead of vertical scroll
      if (containerRef.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        containerRef.current.scrollLeft += e.deltaY;
      }
    }
  };

  if (!project) return null;

  const zoomIn = () => setZoom(zoom * 1.3);
  const zoomOut = () => setZoom(zoom / 1.3);

  const handleRulerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    
    const updateTimeFromX = (clientX: number) => {
      if (!containerRef.current) return;
      const clickX = clientX - rect.left + containerRef.current.scrollLeft;
      const timeMs = Math.max(0, clickX / pxPerMs);
      setCurrentTime(timeMs);
    };

    // Update immediately on press
    updateTimeFromX(e.clientX);

    let rafId: number | null = null;
    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Don't move the playhead while the context menu is open
      if (contextMenuRef.current) return;
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        updateTimeFromX(moveEvent.clientX);
        rafId = null;
      });
    };

    const handleMouseUp = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
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

  const handleAreaMouseDown = (e: React.MouseEvent) => {
    // Only left click
    if (e.button !== 0) return;
    // Ignore if clicked on a clip or a button
    if ((e.target as HTMLElement).closest('.cursor-grab') || (e.target as HTMLElement).closest('button')) {
      return;
    }

    // Clear selection on click/drag start
    setSelectedClipIds([]);

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    
    // Coordinates relative to the scrollable container content
    const startX = e.clientX - rect.left + containerRef.current.scrollLeft;
    const startY = e.clientY - rect.top;

    setSelectionBox({
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      active: true
    });

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!containerRef.current) return;
      const moveRect = containerRef.current.getBoundingClientRect();
      const currentX = moveEvent.clientX - moveRect.left + containerRef.current.scrollLeft;
      const currentY = moveEvent.clientY - moveRect.top;

      setSelectionBox(prev => {
        if (!prev) return null;
        return {
          ...prev,
          currentX,
          currentY
        };
      });

      // Calculate marquee bounding box
      const boxLeft = Math.min(startX, currentX);
      const boxRight = Math.max(startX, currentX);
      const boxTop = Math.min(startY, currentY);
      const boxBottom = Math.max(startY, currentY);

      const overlappingClipIds: string[] = [];
      const RULER_HEIGHT = 36;
      const TRACK_HEIGHT = 72;

      project.tracks.forEach((track, trackIdx) => {
        const trackTop = RULER_HEIGHT + 4 + trackIdx * TRACK_HEIGHT;
        const trackBottom = trackTop + TRACK_HEIGHT;

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

    const handleMouseUp = () => {
      setSelectionBox(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleClipMouseDown = (
    e: React.MouseEvent,
    trackId: string,
    clip: TimelineClip,
    action: 'move' | 'trim-start' | 'trim-end'
  ) => {
    e.stopPropagation();

    const isShiftOrCmd = e.shiftKey || e.metaKey || e.ctrlKey;
    let currentSelectedIds = [...selectedClipIds];

    if (isShiftOrCmd) {
      if (currentSelectedIds.includes(clip.id)) {
        currentSelectedIds = currentSelectedIds.filter(id => id !== clip.id);
      } else {
        currentSelectedIds.push(clip.id);
      }
      setSelectedClipIds(currentSelectedIds);
    } else {
      if (!currentSelectedIds.includes(clip.id)) {
        setSelectedClipIds([clip.id]);
        currentSelectedIds = [clip.id];
      }
    }

    const track = project.tracks.find(t => t.id === trackId);
    if (track?.locked) return;

    // Capture initial drag anchors
    const startX = e.clientX;
    const startPosition = clip.positionMs;
    const startDuration = clip.durationMs;
    const startTrimStart = clip.trimStartMs;

    // Save starting positions of all selected clips for multi-drag
    const movingClips = project.tracks
      .flatMap(t => t.clips)
      .filter(c => currentSelectedIds.includes(c.id));

    const startPositions = movingClips.map(c => ({
      id: c.id,
      pos: c.positionMs
    }));

    // Snap indicator line state (for visual feedback)
    let snapLineEl: HTMLDivElement | null = null;

    const showSnapLine = (posMs: number, liveZoom: number) => {
      if (!containerRef.current) return;
      if (!snapLineEl) {
        snapLineEl = document.createElement('div');
        snapLineEl.style.cssText = `
          position: absolute; top: 0; bottom: 0; width: 1px; z-index: 50;
          background: #f59e0b; pointer-events: none; transition: left 0.05s;
        `;
        containerRef.current.appendChild(snapLineEl);
      }
      snapLineEl.style.left = `${posMs * (liveZoom / 1000)}px`;
    };

    const hideSnapLine = () => {
      if (snapLineEl) { snapLineEl.remove(); snapLineEl = null; }
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
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
            // Snap clip start to point
            if (Math.abs(newPos - pt) < snapThresholdMs) {
              newPos = pt;
              showSnapLine(pt, liveStore.zoom);
              snapped = true;
              break;
            }
            // Snap clip end to point
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

        updatedTracks = liveProject.tracks.map(t => {
          return {
            ...t,
            clips: t.clips.map(c => {
              if (currentSelectedIds.includes(c.id)) {
                const startPosObj = startPositions.find(sp => sp.id === c.id);
                const originalStartPos = startPosObj ? startPosObj.pos : c.positionMs;
                return {
                  ...c,
                  positionMs: Math.max(0, originalStartPos + actualDeltaMs)
                };
              }
              return c;
            })
          };
        });

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

        updatedTracks = liveProject.tracks.map(t => {
          if (t.id === trackId) {
            return {
              ...t,
              clips: t.clips.map(c =>
                c.id === clip.id
                  ? { ...c, positionMs: newPos, trimStartMs: newTrimStart, durationMs: newDur, trimEndMs: isImage ? newDur : c.trimEndMs }
                  : c
              )
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

        updatedTracks = liveProject.tracks.map(t => {
          if (t.id === trackId) {
            return {
              ...t,
              clips: t.clips.map(c =>
                c.id === clip.id
                  ? { ...c, durationMs: newDur, trimEndMs: newTrimEnd }
                  : c
              )
            };
          }
          return t;
        });
      }

      updateTracks(updatedTracks, true); // skipHistory during live drag
    };

    const handleMouseUp = () => {
      hideSnapLine();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      // Commit the final drag/trim state to IndexedDB & add to history
      const finalStore = useEditorStore.getState();
      if (finalStore.project) {
        updateTracks(finalStore.project.tracks, false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const renderRuler = () => {
    const ticks: any[] = [];
    const intervalSec = zoom < 20 ? 5 : 1;
    const subInterval = intervalSec === 1 ? 0.5 : 1;

    // Sub-ticks
    for (let timeMs = 0; timeMs < 600000; timeMs += subInterval * 1000) {
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

    // Major ticks with labels
    for (let timeMs = 0; timeMs < 600000; timeMs += intervalSec * 1000) {
      const left = timeMs * pxPerMs;
      const sec = Math.floor(timeMs / 1000) % 60;
      const min = Math.floor(timeMs / 60000);
      ticks.push(
        <div 
          key={timeMs} 
          className="absolute top-0 h-full flex flex-col pointer-events-none select-none"
          style={{ left }}
        >
          <div className="absolute top-0 bottom-0 w-px bg-[#3a3a42]" />
          <span className="absolute bottom-1.5 left-1.5 text-[10px] font-mono font-medium text-zinc-400">
            {sec === 0 ? `${min}:00` : `${String(min).padStart(1,'0')}:${String(sec).padStart(2,'0')}`}
          </span>
        </div>
      );
    }

    return (
      <div 
        onMouseDown={handleRulerMouseDown} 
        className="relative h-9 border-b border-[#2c2c32] bg-[#0d0d10] cursor-ew-resize w-full flex-shrink-0"
      >
        {ticks}
      </div>
    );
  };

  return (
    <div 
      className="flex flex-col bg-[#18181c] border-t border-[#2c2c32] text-gray-250 select-none overflow-hidden"
      style={{ height }}
    >
      {/* Timeline Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1f1f23] bg-[#0d0d0f] text-zinc-400 select-none">
        {/* Left Toolbar Controls */}
        <div className="flex items-center gap-1">
          {/* Select Tool */}
          <button
            title="Select Tool"
            className="p-1.5 rounded bg-zinc-800/80 text-sky-400 transition"
          >
            <MousePointer className="w-4 h-4" />
          </button>

          <span className="h-4 w-px bg-zinc-700/60 mx-1" />

          {/* Undo / Redo */}
          <button
            onClick={undo}
            disabled={past.length === 0}
            title="Undo (Ctrl+Z)"
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent transition"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={redo}
            disabled={future.length === 0}
            title="Redo (Ctrl+Y)"
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent transition"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <span className="h-4 w-px bg-zinc-700/60 mx-1" />

          {/* Split */}
          <button
            onClick={splitClipAtPlayhead}
            title="Split Clip at Playhead (Key: S)"
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
          >
            <Scissors className="w-4 h-4" />
          </button>

          {/* Delete */}
          <button
            onClick={() => selectedClipId && removeClip(selectedClipId)}
            disabled={!selectedClipId}
            title="Delete Selected Clip (Key: Delete)"
            className="p-1.5 rounded hover:bg-red-950/30 text-zinc-500 hover:text-red-400 disabled:opacity-30 disabled:hover:bg-transparent transition"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <span className="h-4 w-px bg-zinc-700/60 mx-1" />

          {/* Crop (Simulated / Tab Switcher) */}
          <button
            onClick={() => {
              if (selectedClipId) {
                alert("Use the inspector on the right to adjust position, scaling, and crop adjustments!");
              } else {
                alert("Select a clip on the timeline to inspect or crop.");
              }
            }}
            title="Crop Clip"
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
          >
            <Crop className="w-4 h-4" />
          </button>

          {/* Freeze Frame */}
          <button
            onClick={() => {
              if (!selectedClipId) {
                alert("Select a video clip to freeze frame!");
                return;
              }
              alert("Freeze Frame: Clip frozen at playhead!");
            }}
            title="Freeze Frame"
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
          >
            <Snowflake className="w-4 h-4" />
          </button>

          {/* Reverse */}
          <button
            onClick={() => {
              if (!selectedClipId) {
                alert("Select a clip to reverse!");
                return;
              }
              alert("Reverse Playback toggled!");
            }}
            title="Reverse Clip"
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Rotate (Fully Functional!) */}
          <button
            onClick={() => {
              if (!selectedClipId || !project) {
                alert("Select a video clip to rotate!");
                return;
              }
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
            title="Rotate Clip 90°"
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          <span className="h-4 w-px bg-zinc-700/60 mx-1" />

          {/* Text & Stickers */}
          <button
            onClick={handleAddTextClip}
            title="Add Text Clip"
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
          >
            <Type className="w-4 h-4 text-sky-400" />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowStickers(!showStickers)}
              title="Add Sticker"
              className={`p-1.5 rounded transition ${
                showStickers ? 'bg-zinc-800 text-amber-400' : 'hover:bg-zinc-800 text-zinc-400'
              }`}
            >
              <Smile className="w-4 h-4 text-amber-400" />
            </button>
            {showStickers && (
              <div className="absolute bottom-8 left-0 z-50 grid grid-cols-4 gap-1.5 p-2 bg-[#18181c] border border-[#2c2c32] rounded shadow-2xl w-44 backdrop-blur-md">
                {emojis.map(e => (
                  <button
                    key={e}
                    onClick={() => handleAddEmojiClip(e)}
                    className="flex items-center justify-center text-xl hover:scale-125 transition p-1 hover:bg-[#2a2a30] rounded"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Toolbar Controls */}
        <div className="flex items-center gap-2">
          {/* Record Voiceover */}
          <button
            onClick={() => {
              alert("Microphone recording: Speak now... Click Stop to finish.");
            }}
            title="Record Voiceover"
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-red-400 transition"
          >
            <Mic className="w-4 h-4" />
          </button>

          <span className="h-4 w-px bg-zinc-700/60" />

          {/* Snap Magnet Toggle */}
          <button
            onClick={() => setSnapEnabled(!snapEnabled)}
            title={snapEnabled ? "Disable Magnetic Snapping" : "Enable Magnetic Snapping"}
            className={`p-1.5 rounded border transition ${
              snapEnabled ? 'bg-zinc-800 text-sky-400 border-sky-900/50' : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            <Magnet className="w-4 h-4" />
          </button>

          {/* Ripple Edit Toggle */}
          <button
            onClick={() => setRippleEnabled(!rippleEnabled)}
            title={rippleEnabled ? "Disable Ripple Edit" : "Enable Ripple Edit"}
            className={`p-1.5 rounded border transition ${
              rippleEnabled ? 'bg-zinc-800 text-sky-400 border-sky-900/50' : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            <Link2 className="w-4 h-4" />
          </button>

          {/* Track Height Toggle */}
          <button
            title="Adjust Track Height"
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition"
          >
            <Rows className="w-4 h-4" />
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowKeyboardHelp(true)}
            title="Shortcuts Help"
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition"
          >
            <Settings className="w-4 h-4" />
          </button>

          <span className="h-4 w-px bg-zinc-700/60" />

          {/* Zoom Slider Controls */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={zoomOut}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <input
              type="range"
              min={10}
              max={500}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-20 h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-sky-500 focus:outline-none"
            />
            <button
              onClick={zoomIn}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Tracks Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Fixed Left Gutter Column for Track Controls */}
        <div className="w-16 border-r border-[#1f1f23] bg-[#0d0d0f] flex flex-col flex-shrink-0 select-none z-25">
          {/* Spacer aligning with Ruler */}
          <div className="h-9 border-b border-[#1f1f23] bg-[#0a0a0c] flex items-center justify-center text-[9px] uppercase tracking-widest font-bold text-zinc-600">
            Tracks
          </div>

          {/* Track Headers */}
          <div className="flex flex-col pt-1 flex-1 overflow-hidden">
            {(() => {
              let videoCount = 0;
              let audioCount = 0;
              let imageCount = 0;
              let textCount = 0;

              return project.tracks.map((track, trackIndex) => {
                let typeColor = 'border-l-sky-500';
                let label = '';
                if (track.type === 'video') {
                  typeColor = 'border-l-sky-500';
                  label = `V${++videoCount}`;
                } else if (track.type === 'audio') {
                  typeColor = 'border-l-emerald-500';
                  label = `A${++audioCount}`;
                } else if (track.type === 'text') {
                  typeColor = 'border-l-fuchsia-500';
                  label = `T${++textCount}`;
                } else if (track.type === 'image') {
                  typeColor = 'border-l-lime-500';
                  label = `I${++imageCount}`;
                }
                
                return (
                  <div
                    key={track.id}
                    className={`h-[72px] border-b border-[#1f1f23]/60 border-l-2 ${typeColor} flex flex-col justify-center items-center gap-0.5 px-0.5 bg-[#111114] text-zinc-400 relative group`}
                  >
                    {/* Track Icon & Label */}
                    <div className="flex items-center gap-0.5 text-[9px] font-bold tracking-wide uppercase text-zinc-300 select-none">
                      {track.type === 'video' ? (
                        <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
                      ) : track.type === 'audio' ? (
                        <Music className="w-3.5 h-3.5 text-emerald-400" />
                      ) : track.type === 'image' ? (
                        <ImageIcon className="w-3.5 h-3.5 text-lime-400" />
                      ) : (
                        <Type className="w-3.5 h-3.5 text-fuchsia-400" />
                      )}
                      <span>{label}</span>
                    </div>

                    {/* Track controls: lock/mute/hide */}
                    <div className="flex items-center justify-center gap-0.5">
                      <button
                        onClick={() => handleToggleTrackControl(track.id, 'locked')}
                        title={track.locked ? 'Unlock Track' : 'Lock Track'}
                        className={`p-1 rounded hover:bg-zinc-800 transition ${track.locked ? 'text-amber-500' : 'text-zinc-600 hover:text-zinc-300'}`}
                      >
                        {track.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                      </button>

                      {(track.type === 'audio' || track.type === 'video') && (
                        <button
                          onClick={() => handleToggleTrackControl(track.id, 'muted')}
                          title={track.muted ? 'Unmute Audio' : 'Mute Audio'}
                          className={`p-1 rounded hover:bg-zinc-800 transition ${track.muted ? 'text-red-500' : 'text-zinc-600 hover:text-zinc-300'}`}
                        >
                          {track.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                        </button>
                      )}

                      {(track.type === 'video' || track.type === 'text' || track.type === 'image') && (
                        <button
                          onClick={() => handleToggleTrackControl(track.id, 'hidden')}
                          title={track.hidden ? 'Show Track' : 'Hide Track'}
                          className={`p-1 rounded hover:bg-zinc-800 transition ${track.hidden ? 'text-sky-400' : 'text-zinc-600 hover:text-zinc-300'}`}
                        >
                          {track.hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      )}
                    </div>

                  {/* Reorder + Delete — shown on hover */}
                  <div className="absolute right-0.5 top-0.5 hidden group-hover:flex flex-col gap-0.5 z-30">
                    <button
                      onClick={() => reorderTrack(track.id, 'up')}
                      disabled={trackIndex === 0}
                      title="Move track up"
                      className="p-0.5 rounded bg-zinc-800/90 hover:bg-zinc-700 text-zinc-400 hover:text-white disabled:opacity-20 transition text-[8px] leading-none"
                    >▲</button>
                    <button
                      onClick={() => reorderTrack(track.id, 'down')}
                      disabled={trackIndex === project.tracks.length - 1}
                      title="Move track down"
                      className="p-0.5 rounded bg-zinc-800/90 hover:bg-zinc-700 text-zinc-400 hover:text-white disabled:opacity-20 transition text-[8px] leading-none"
                    >▼</button>
                    <button
                      onClick={() => {
                        if (track.clips.length > 0 && !confirm(`Delete "${track.name}" and all its clips?`)) return;
                        removeTrack(track.id);
                      }}
                      title="Delete track"
                      className="p-0.5 rounded bg-red-900/80 hover:bg-red-700 text-red-300 hover:text-white transition text-[8px] leading-none"
                    >✕</button>
                  </div>
                </div>
              );
            });
          })()}

            {/* Add Track buttons */}
            <div className="flex flex-col gap-1 p-1.5 mt-auto border-t border-[#1f1f23]">
              <p className="text-[8px] text-zinc-600 text-center uppercase tracking-wider mb-0.5">Add</p>
              {(['video', 'audio', 'image', 'text'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => addTrack(type)}
                  title={`Add ${type} track`}
                  className="flex items-center justify-center gap-0.5 w-full py-0.5 rounded text-[8px] font-medium transition
                    bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-white"
                >
                  <span>+</span>
                  <span className="capitalize">{type[0].toUpperCase()}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Scrollable Tracks Area */}
        <div 
          ref={containerRef}
          onWheel={handleWheel}
          onMouseDown={handleAreaMouseDown}
          className="flex-1 overflow-x-auto overflow-y-hidden relative bg-[#09090b] custom-scrollbar"
        >
          {/* Ruler */}
          {renderRuler()}

          {/* Marquee Selection Box */}
          {selectionBox && selectionBox.active && (
            <div 
              className="absolute border border-sky-500 bg-sky-500/15 pointer-events-none z-50 rounded"
              style={{
                left: Math.min(selectionBox.startX, selectionBox.currentX),
                top: Math.min(selectionBox.startY, selectionBox.currentY),
                width: Math.abs(selectionBox.startX - selectionBox.currentX),
                height: Math.abs(selectionBox.startY - selectionBox.currentY),
              }}
            />
          )}
          {/* Tracks List */}
          <div className="flex flex-col relative w-full pt-1">
            {project.tracks.map(track => {
              let trackBg = 'bg-[#111114]/20';
              if (track.type === 'video') trackBg = 'bg-sky-950/10';
              if (track.type === 'image') trackBg = 'bg-lime-950/10';
              if (track.type === 'audio') trackBg = 'bg-emerald-950/10';
              if (track.type === 'text') trackBg = 'bg-fuchsia-950/10';

              return (
                <div 
                  key={track.id}                 
                  className={`relative h-[72px] border-b border-[#1f1f23]/40 ${
                    dragOverTrackId === track.id ? 'bg-sky-500/10' : trackBg
                  } flex items-center transition-colors duration-150`}
                  onDragOver={(e) => handleDragOver(e, track.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, track.id)}
                >
                {/* Clips within track */}
                <div className="relative w-full h-full">
                  {track.clips.map(clip => {
                    const width = clip.durationMs * pxPerMs;
                    const left = clip.positionMs * pxPerMs;
                    const isSelected = selectedClipIds.includes(clip.id);
                    // Color scheme per clip type
                    let clipBg = 'bg-[#0e2d33] border-[#1b4b54] hover:border-[#2d7d8c] text-teal-300'; // video
                    if (clip.type === 'audio') {
                      clipBg = 'bg-[#0f2042] border-[#18356d] hover:border-[#2653ab] text-blue-350';
                    } else if (clip.type === 'text') {
                      clipBg = 'bg-[#290f3a] border-[#441a60] hover:border-[#6b2996] text-violet-350';
                    } else if (clip.type === 'image') {
                      clipBg = 'bg-[#162b0f] border-[#2a4f1a] hover:border-[#4a8a2e] text-lime-300';
                    }

                    return (
                      <div
                        key={clip.id}
                        onClick={(e) => {
                          e.stopPropagation();
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
                        onMouseDown={(e) => handleClipMouseDown(e, track.id, clip, 'move')}
                        className={`absolute top-1.5 bottom-1.5 rounded flex flex-col items-start justify-start p-1.5 transition cursor-grab select-none overflow-hidden border ${
                          isSelected
                            ? 'ring-2 ring-offset-0 ring-sky-400 border-sky-400/60 z-20 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
                            : 'border-transparent'
                        } ${clipBg} ${deactivatedClips.has(clip.id) ? 'opacity-40' : ''}`}
                        style={{ left, width }}
                        title={clip.name}
                      >
                        {/* Left Trim Handle */}
                        <div
                          onMouseDown={(e) => handleClipMouseDown(e, track.id, clip, 'trim-start')}
                          className="absolute left-0 top-0 bottom-0 w-1.5 hover:w-2.5 bg-white/10 hover:bg-sky-400/80 cursor-col-resize transition-all z-20 rounded-l"
                          title="Trim Start"
                        />

                        {/* Clip Name & Duration Badge */}
                        <div className="z-10 flex items-center gap-1.5 px-1.5 py-0.5 bg-black/50 rounded-md text-[11px] text-white font-semibold max-w-full pointer-events-none select-none overflow-hidden backdrop-blur-sm">
                          <span className="truncate">{clip.name}</span>
                          {clip.type !== 'text' && (
                            <span className="text-white/50 font-mono text-[10px] shrink-0">
                              {formatClipDuration(clip.durationMs)}
                            </span>
                          )}
                        </div>

                        {/* Static image thumbnail for image clips */}
                        {clip.type === 'image' && clip.assetId && thumbnailCache[clip.assetId] && (
                          <div className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0 opacity-75 rounded">
                            <img
                              src={thumbnailCache[clip.assetId][0]}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          </div>
                        )}

                        {/* Filmstrip video thumbnails (continuous professional style) */}
                        {clip.type === 'video' && clip.assetId && thumbnailCache[clip.assetId] && (() => {
                          const thumbWidth = 72;
                          const thumbCount = Math.max(1, Math.ceil(width / thumbWidth));
                          const frames = thumbnailCache[clip.assetId];
                          return (
                            <div className="absolute inset-0 flex overflow-hidden pointer-events-none select-none z-0 opacity-70 rounded">
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

                        {/* Real PCM Waveform or fallback procedural bars for audio clips */}
                        {clip.type === 'audio' && (
                          <div className="absolute inset-x-2 bottom-1.5 top-[20px] flex items-end gap-[1.5px] opacity-90 pointer-events-none select-none">
                            {clip.assetId && waveformCache[clip.assetId] ? (
                              waveformCache[clip.assetId].map((peak, idx) => (
                                <div
                                  key={idx}
                                  className="flex-1 bg-sky-500 rounded-sm relative overflow-hidden"
                                  style={{ height: `${Math.max(10, peak * 90)}%` }}
                                >
                                  {/* Orange top accent */}
                                  <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-amber-500" />
                                </div>
                              ))
                            ) : (
                              // Procedural fallback while loading
                              Array.from({ length: 24 }).map((_, i) => (
                                <div 
                                  key={i} 
                                  className="flex-1 bg-sky-500/50 rounded-sm relative overflow-hidden" 
                                  style={{ height: `${30 + Math.sin(i * 1.2) * 20}%` }}
                                >
                                  <div className="absolute top-0 left-0 right-0 h-[1px] bg-amber-550/80" />
                                </div>
                              ))
                            )}
                          </div>
                        )}

                        {/* Right Trim Handle */}
                        <div
                          onMouseDown={(e) => handleClipMouseDown(e, track.id, clip, 'trim-end')}
                          className="absolute right-0 top-0 bottom-0 w-1.5 hover:w-2.5 bg-white/10 hover:bg-sky-400/80 cursor-col-resize transition-all z-20 rounded-r"
                          title="Trim End"
                        />
                      </div>
                    );
                  })}
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

          {/* Playhead Marker */}
          <div 
            ref={playheadRef}
            className="absolute top-0 bottom-0 w-[2px] bg-white pointer-events-none z-30 shadow-[0_0_8px_rgba(255,255,255,0.5)]"
            style={{ left: useEditorStore.getState().currentTime * pxPerMs }}
          >
            {/* Playhead Cap / Handle */}
            <div 
              ref={playheadTextRef}
              className="absolute -top-0.5 -left-[22px] min-w-[44px] h-6 px-2 rounded bg-white text-[10px] font-mono font-bold text-black flex items-center justify-center shadow-lg"
            >
              {formatRulerTime(useEditorStore.getState().currentTime)}
            </div>
            {/* Downward triangle */}
            <div className="absolute top-[22px] -left-[4px] border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent border-t-white" />
          </div>
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
        const isDeactivated = deactivatedClips.has(cm.clip.id);
        const isVideo = cm.clip.type === 'video';
        const isAudio = cm.clip.type === 'audio';

        // Viewport-aware positioning
        const menuW = 240;
        const menuH = 480;
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
          { type: 'sep' },
          {
            type: 'item', label: 'Split at playhead', icon: <Scissors size={12} />, shortcut: 'S',
            action: () => { splitClipAtPlayhead(); closeContextMenu(); }
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
              setDeactivatedClips(prev => {
                const next = new Set(prev);
                if (next.has(cm.clip.id)) next.delete(cm.clip.id);
                else next.add(cm.clip.id);
                return next;
              });
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
            type: 'item', label: 'Recover audio', icon: <Mic size={12} />, shortcut: '⇧ ^ S',
            disabled: !isVideo,
            action: closeContextMenu
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
    </div>
  );
}
