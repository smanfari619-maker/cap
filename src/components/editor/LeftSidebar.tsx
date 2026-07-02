import React, { useRef, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Film, Music, Upload, Plus, Loader2, Trash2, Sparkles, Search, Sliders, User, ImageIcon, LayoutGrid, List, ArrowUpDown, Filter, Check, Zap, X, Clock } from 'lucide-react';
import { db, type Asset, type TimelineClip } from '../../lib/db';
import { useEditorStore } from '../../store/editorStore';
import { saveFileToOPFS, deleteFileFromOPFS } from '../../lib/opfs';
import { getMediaMetadata } from '../../lib/media-metadata';
import { EFFECTS_REGISTRY, EFFECT_CATEGORIES } from '../../lib/effects-registry';
import { TRANSITIONS_REGISTRY, TRANSITION_CATEGORIES } from '../../lib/transitions-registry';
import heroImg from '../../assets/hero.png';

interface LeftSidebarProps {
  activeTab: string;
  width: number;
}

export default function LeftSidebar({ activeTab, width }: LeftSidebarProps) {
  const currentProjectId = useEditorStore(state => state.currentProjectId);
  const addClip = useEditorStore(state => state.addClip);
  const addTrack = useEditorStore(state => state.addTrack);
  const updateClip = useEditorStore(state => state.updateClip);
  const currentTime = useEditorStore(state => state.currentTime);
  const project = useEditorStore(state => state.project);
  const selectedClipId = useEditorStore(state => state.selectedClipId);
  const setSelectedClipId = useEditorStore(state => state.setSelectedClipId);
  const selectedClip = selectedClipId
    ? project?.tracks.flatMap((t: any) => t.clips).find((c: any) => c.id === selectedClipId)
    : null;
  const activeFilter = selectedClip?.filterSettings?.type || 'none';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const [captionsProgress, setCaptionsProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [mediaCategory, setMediaCategory] = useState<'all' | 'yours' | 'ai' | 'library'>('all');
  const [thumbnailCache, setThumbnailCache] = useState<Record<string, string>>({});

  // Sorting and Filtering States
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'imported' | 'created' | 'name' | 'type' | 'duration'>('created');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filterType, setFilterType] = useState<'all' | 'video' | 'audio' | 'image'>('all');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  // Fetch assets of the current project
  const assets = useLiveQuery(
    () => db.assets.where('projectId').equals(currentProjectId || '').toArray(),
    [currentProjectId]
  ) || [];

  // Filter and Sort assets based on criteria
  const filteredAssets = assets
    .filter(asset => {
      // Search query
      if (searchQuery && !asset.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      // Filter Type
      if (filterType === 'video') return asset.type.startsWith('video/');
      if (filterType === 'audio') return asset.type.startsWith('audio/');
      if (filterType === 'image') return asset.type.startsWith('image/');
      return true;
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === 'type') {
        comparison = a.type.localeCompare(b.type);
      } else if (sortBy === 'duration') {
        comparison = a.durationMs - b.durationMs;
      } else {
        // 'created' or 'imported'
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  // Check if asset is already added to timeline
  const isAssetAdded = (assetId: string) => {
    return project?.tracks.some(track => 
      track.clips.some(clip => clip.assetId === assetId)
    ) || false;
  };

  // Multi-selection and Marquee Selection States
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [lastSelectedAssetId, setLastSelectedAssetId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [marqueeBox, setMarqueeBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const containerRefMedia = useRef<HTMLDivElement>(null);

  const handleAssetClick = (e: React.MouseEvent, assetId: string) => {
    const isShift = e.shiftKey;
    const isCmd = e.metaKey || e.ctrlKey;

    if (isCmd) {
      setSelectedAssetIds(prev => {
        if (prev.includes(assetId)) {
          return prev.filter(id => id !== assetId);
        } else {
          return [...prev, assetId];
        }
      });
      setLastSelectedAssetId(assetId);
    } else if (isShift && lastSelectedAssetId) {
      const allIds = filteredAssets.map(a => a.id);
      const lastIdx = allIds.indexOf(lastSelectedAssetId);
      const currentIdx = allIds.indexOf(assetId);
      if (lastIdx !== -1 && currentIdx !== -1) {
        const start = Math.min(lastIdx, currentIdx);
        const end = Math.max(lastIdx, currentIdx);
        const rangeIds = allIds.slice(start, end + 1);
        
        setSelectedAssetIds(prev => {
          const union = new Set([...prev, ...rangeIds]);
          return Array.from(union);
        });
      }
    } else {
      setSelectedAssetIds([assetId]);
      setLastSelectedAssetId(assetId);
    }
  };

  const handleContainerMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select') || target.closest('a')) {
      return;
    }

    const assetCard = target.closest('[data-asset-id]');
    if (assetCard) {
      const assetId = assetCard.getAttribute('data-asset-id')!;
      handleAssetClick(e, assetId);
      return;
    }

    // Clicked empty space: clear selection unless modifier keys are held
    if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
      setSelectedAssetIds([]);
    }

    const container = containerRefMedia.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const startX = e.clientX - rect.left + container.scrollLeft;
    const startY = e.clientY - rect.top + container.scrollTop;

    setMarqueeBox({
      x1: startX,
      y1: startY,
      x2: startX,
      y2: startY
    });

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentX = moveEvent.clientX - rect.left + container.scrollLeft;
      const currentY = moveEvent.clientY - rect.top + container.scrollTop;

      setMarqueeBox({
        x1: startX,
        y1: startY,
        x2: currentX,
        y2: currentY
      });

      const xMin = Math.min(startX, currentX);
      const xMax = Math.max(startX, currentX);
      const yMin = Math.min(startY, currentY);
      const yMax = Math.max(startY, currentY);

      const cards = container.querySelectorAll('[data-asset-id]');
      const intersectedIds: string[] = [];

      cards.forEach(card => {
        const cardHtml = card as HTMLElement;
        const cardLeft = cardHtml.offsetLeft;
        const cardTop = cardHtml.offsetTop;
        const cardWidth = cardHtml.offsetWidth;
        const cardHeight = cardHtml.offsetHeight;

        const cardRight = cardLeft + cardWidth;
        const cardBottom = cardTop + cardHeight;

        const isOverlapping = !(
          cardLeft > xMax ||
          cardRight < xMin ||
          cardTop > yMax ||
          cardBottom < yMin
        );

        if (isOverlapping) {
          const id = card.getAttribute('data-asset-id');
          if (id) intersectedIds.push(id);
        }
      });

      if (moveEvent.shiftKey || moveEvent.metaKey || moveEvent.ctrlKey) {
        setSelectedAssetIds(prev => {
          const newSelection = new Set(prev);
          intersectedIds.forEach(id => newSelection.add(id));
          return Array.from(newSelection);
        });
      } else {
        setSelectedAssetIds(intersectedIds);
      }
    };

    const handleMouseUp = () => {
      setMarqueeBox(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  // Keyboard shortcut listener for Cmd+A / Ctrl+A
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTab !== 'media') return;
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      const isCmdA = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a';
      if (isCmdA) {
        e.preventDefault();
        setSelectedAssetIds(filteredAssets.map(a => a.id));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, filteredAssets]);

  // Close context menu on click elsewhere
  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  // Keep thumbnailCache and assets in refs to avoid dependency cycles
  const thumbnailCacheRef = useRef(thumbnailCache);
  useEffect(() => {
    thumbnailCacheRef.current = thumbnailCache;
  }, [thumbnailCache]);

  const assetsRef = useRef(assets);
  useEffect(() => {
    assetsRef.current = assets;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]);

  // Extract thumbnails for video and image assets in LeftSidebar
  const assetIds = assets.map(a => a.id).join(',');
  useEffect(() => {
    assetsRef.current.forEach(async (asset) => {
      if (thumbnailCacheRef.current[asset.id]) return;
      if (asset.type.startsWith('audio/')) return;
      try {
        const { getFileFromOPFS } = await import('../../lib/opfs');
        const file = await getFileFromOPFS(asset.opfsPath);
        const objectUrl = URL.createObjectURL(file);

        // Images: draw directly
        if (asset.type.startsWith('image/')) {
          const img = new window.Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const aspect = img.naturalWidth / (img.naturalHeight || 1);
            canvas.height = 135;
            canvas.width = Math.round(135 * aspect);
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              setThumbnailCache(prev => ({ ...prev, [asset.id]: canvas.toDataURL('image/jpeg', 0.7) }));
            }
            URL.revokeObjectURL(objectUrl);
          };
          img.src = objectUrl;
          return;
        }

        // Videos: seek to mid-point
        const video = document.createElement('video');
        video.src = objectUrl;
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.onloadeddata = () => {
          video.currentTime = Math.min(1, video.duration ? video.duration / 2 : 1);
        };
        video.onseeked = () => {
          const canvas = document.createElement('canvas');
          const aspect = (video.videoWidth || 240) / (video.videoHeight || 135);
          canvas.height = 135;
          canvas.width = Math.round(135 * aspect);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            setThumbnailCache(prev => ({ ...prev, [asset.id]: canvas.toDataURL('image/jpeg', 0.6) }));
          }
          URL.revokeObjectURL(objectUrl);
          video.remove();
        };
      } catch (e) {
        console.warn('Failed to extract thumbnail for sidebar:', e);
      }
    });
  }, [assetIds]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !currentProjectId) return;
    
    setIsUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const assetId = Math.random().toString(36).substring(2, 9);
        const fileExt = file.name.split('.').pop() || 'mp4';
        const opfsPath = `${currentProjectId}/${assetId}.${fileExt}`;

        await saveFileToOPFS(opfsPath, file);

        // For images, we don't call getMediaMetadata (it's video/audio only)
        let durationMs = 5000; // default 5s for images
        let width: number | undefined;
        let height: number | undefined;

        if (file.type.startsWith('image/')) {
          // Read image dimensions
          await new Promise<void>((resolve) => {
            const img = new window.Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
              width = img.naturalWidth;
              height = img.naturalHeight;
              URL.revokeObjectURL(url);
              resolve();
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
            img.src = url;
          });
        } else {
          const metadata = await getMediaMetadata(file);
          durationMs = metadata.durationMs || 5000;
          width = metadata.width;
          height = metadata.height;
        }

        const newAsset: Asset = {
          id: assetId,
          projectId: currentProjectId,
          name: file.name,
          size: file.size,
          type: file.type,
          durationMs,
          width,
          height,
          opfsPath,
          createdAt: new Date()
        };

        await db.assets.add(newAsset);
      } catch (error) {
        console.error('Failed to import file:', error);
        alert(`Error importing ${file.name}`);
      }
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddToTimeline = async (asset: Asset) => {
    if (!project) return;

    const isAudio = asset.type.startsWith('audio/');
    const isImage = asset.type.startsWith('image/');
    const clipType = isAudio ? 'audio' : isImage ? 'image' : 'video';
    const trackType = clipType === 'image' ? 'video' : clipType;

    // Find an existing track of this type, or create one
    let track = project.tracks.find(t => t.type === trackType);
    if (!track) {
      await addTrack(trackType as 'video' | 'audio' | 'text');
      // Re-read the project to get the new track
      const updatedProject = useEditorStore.getState().project;
      track = updatedProject?.tracks.find(t => t.type === trackType);
      if (!track) return;
    }

    const clipId = Math.random().toString(36).substring(2, 9);
    const newClip: Omit<import('../../lib/db').TimelineClip, 'trackId'> = {
      id: clipId,
      assetId: asset.id,
      type: clipType,
      name: asset.name,
      durationMs: asset.durationMs,
      trimStartMs: 0,
      trimEndMs: asset.durationMs,
      positionMs: currentTime,
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

    await addClip(track.id, newClip);
  };

  const handleDeleteAsset = async (asset: Asset, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete ${asset.name}? This will remove it from the project library.`)) {
      // Delete DB record first (transactional). If this succeeds and the
      // OPFS delete below fails, we only lose the file bytes — the ghost record
      // is already gone so the app stays consistent. The reverse order risks
      // leaving a DB record pointing to a missing file on every reload.
      await db.assets.delete(asset.id);
      await deleteFileFromOPFS(asset.opfsPath);
    }
  };

  const handleAddTextPreset = async (styleType: 'standard' | 'tiktok' | 'sub' | 'cinematic') => {
    const textTrack = project?.tracks.find(t => t.type === 'text');
    if (!textTrack || !project) return;

    const clipId = Math.random().toString(36).substring(2, 9);
    let name = 'Text Overlay';
    let fontSize = 24;
    let fontFamily = 'Inter';
    let content = 'Edit Text';
    let color = '#ffffff';

    if (styleType === 'tiktok') {
      name = 'TikTok Bold';
      fontFamily = 'Impact';
      fontSize = 36;
      content = 'TEXT STICKER';
      color = '#fcd34d';
    } else if (styleType === 'sub') {
      name = 'Subtitle';
      fontFamily = 'Georgia';
      fontSize = 18;
      content = 'Dialogue text goes here...';
    } else if (styleType === 'cinematic') {
      name = 'Cinematic Title';
      fontFamily = 'Courier New';
      fontSize = 28;
      content = 'THE TITLE';
    }

    const newTextClip: Omit<TimelineClip, 'trackId'> = {
      id: clipId,
      type: 'text',
      name,
      durationMs: 4000,
      trimStartMs: 0,
      trimEndMs: 4000,
      positionMs: currentTime,
      textSettings: {
        content,
        color,
        fontSize,
        fontFamily,
        x: 0.5,
        y: 0.5,
        scale: 1.0
      }
    };

    await addClip(textTrack.id, newTextClip);
    setSelectedClipId(clipId);
  };

  const handleAddSticker = async (emoji: string) => {
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
      positionMs: currentTime,
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
  };

  const handleApplyTransition = (type: string) => {
    if (!selectedClipId) {
      alert('Please select a video clip on the timeline first to apply transition.');
      return;
    }
    if (type === 'clear') {
      updateClip(selectedClipId, { transitionType: 'none', fadeInMs: 0, transitionIn: undefined });
    } else {
      updateClip(selectedClipId, {
        transitionType: type, // keep legacy for compat
        fadeInMs: 1000,
        transitionIn: { type, durationMs: 1000, easing: 'ease-in-out' }
      });
    }
  };

  const handleApplyEffect = async (effectId: string, intensity: number) => {
    if (!project) return;

    if (selectedClipId) {
      const clip = project.tracks.flatMap(t => t.clips).find(c => c.id === selectedClipId);
      if (clip && clip.type !== 'audio') {
        const existing = clip.videoEffects || [];
        const alreadyApplied = existing.findIndex(e => e.id === effectId);
        let newEffects;
        if (alreadyApplied >= 0) {
          // Update intensity
          newEffects = existing.map((e, i) => i === alreadyApplied ? { ...e, intensity } : e);
        } else {
          newEffects = [...existing, { id: effectId, intensity }];
        }
        updateClip(selectedClipId, { videoEffects: newEffects });
        return;
      }
    }

    // Otherwise, apply it as a separate layer on the Effects Track!
    let effectTrack = project.tracks.find(t => t.type === 'effect');
    if (!effectTrack) {
      await addTrack('effect');
      effectTrack = useEditorStore.getState().project?.tracks.find(t => t.type === 'effect');
    }
    if (!effectTrack) return;

    const def = EFFECTS_REGISTRY[effectId];
    const clipId = `clip-${Math.random().toString(36).substring(2, 9)}`;
    const newEffectClip = {
      id: clipId,
      type: 'effect' as const,
      name: def?.name || 'Effect',
      durationMs: 3000, // 3 seconds
      trimStartMs: 0,
      trimEndMs: 0,
      positionMs: currentTime, // at playhead!
      trackId: effectTrack.id,
      videoEffects: [{ id: effectId, intensity }]
    };
    await addClip(effectTrack.id, newEffectClip);
    useEditorStore.setState({ selectedClipId: clipId });
  };

  const handleRemoveEffect = (effectId: string) => {
    if (!selectedClipId) return;
    const clip = project?.tracks.flatMap(t => t.clips).find(c => c.id === selectedClipId);
    if (!clip) return;
    const newEffects = (clip.videoEffects || []).filter(e => e.id !== effectId);
    updateClip(selectedClipId, { videoEffects: newEffects });
  };

  const handleApplyFilter = async (type: string) => {
    if (!project) return;

    if (selectedClipId) {
      const clip = project.tracks.flatMap(t => t.clips).find(c => c.id === selectedClipId);
      if (clip && clip.type !== 'audio') {
        updateClip(selectedClipId, {
          filterSettings: {
            type,
            intensity: 80
          }
        });
        return;
      }
    }

    // Apply as separate layer on the Effects Track!
    let effectTrack = project.tracks.find(t => t.type === 'effect');
    if (!effectTrack) {
      await addTrack('effect');
      effectTrack = useEditorStore.getState().project?.tracks.find(t => t.type === 'effect');
    }
    if (!effectTrack) return;

    const clipId = `clip-${Math.random().toString(36).substring(2, 9)}`;
    const newFilterClip = {
      id: clipId,
      type: 'effect' as const,
      name: type.charAt(0).toUpperCase() + type.slice(1),
      durationMs: 3000,
      trimStartMs: 0,
      trimEndMs: 0,
      positionMs: currentTime,
      trackId: effectTrack.id,
      filterSettings: {
        type,
        intensity: 80
      }
    };
    await addClip(effectTrack.id, newFilterClip);
    useEditorStore.setState({ selectedClipId: clipId });
  };

  const formatDuration = (ms: number) => {
    const sec = Math.floor(ms / 1000) % 60;
    const min = Math.floor(ms / 60000);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };



  return (
    <div 
      className="flex flex-col h-full bg-[#18181c] border-r border-[#2c2c32] text-gray-200 overflow-hidden select-none"
      style={{ 
        width: window.innerWidth < 1024 ? '100%' : width, 
        display: width === 0 ? 'none' : 'flex' 
      }}
    >
      
      {/* Tab Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* Media Library Tab */}
        {activeTab === 'media' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Action Bar */}
            <div className="p-3 border-b border-[#2c2c32] space-y-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold rounded text-xs transition shadow-md shadow-sky-600/10"
                >
                  {isUploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  Import Media
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  multiple
                  accept="video/*,audio/*,image/*"
                  className="hidden"
                />
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search media..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#121214] border border-[#2c2c32] rounded pl-8 pr-3 py-1 text-xs text-gray-200 placeholder-gray-550 focus:outline-none focus:border-sky-500 transition"
                />
              </div>

              {/* View/Sort/Filter Toolbar */}
              <div className="flex items-center justify-between gap-1.5 pt-0.5">
                {/* Left: View Mode Toggle */}
                <div className="flex items-center gap-0.5 bg-[#121214] border border-[#2c2c32] rounded p-0.5">
                  <button
                    onClick={() => setViewMode('grid')}
                    title="Grid view"
                    className={`p-1 rounded transition ${viewMode === 'grid' ? 'bg-[#2a2a30] text-sky-400' : 'text-gray-500 hover:text-gray-350'}`}
                  >
                    <LayoutGrid className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    title="List view"
                    className={`p-1 rounded transition ${viewMode === 'list' ? 'bg-[#2a2a30] text-sky-400' : 'text-gray-500 hover:text-gray-350'}`}
                  >
                    <List className="w-3 h-3" />
                  </button>
                </div>

                {/* Right: Sort and Filter Dropdowns */}
                <div className="flex items-center gap-1.5">
                  {/* Sort Trigger */}
                  <div className="relative">
                    <button
                      onClick={() => {
                        setShowSortDropdown(!showSortDropdown);
                        setShowFilterDropdown(false);
                      }}
                      className={`flex items-center gap-1 px-2 py-1 bg-[#121214] border border-[#2c2c32] rounded text-[9px] font-semibold text-gray-400 hover:text-gray-200 transition ${
                        showSortDropdown ? 'border-sky-550 text-sky-400' : ''
                      }`}
                    >
                      <ArrowUpDown className="w-2.5 h-2.5" />
                      <span>Sort</span>
                    </button>
                    {showSortDropdown && (
                      <div className="absolute right-0 top-6 z-50 flex flex-col bg-[#1e1e22] border border-[#2c2c32] rounded shadow-2xl py-1 w-36">
                        {(['imported', 'created', 'name', 'type', 'duration'] as const).map(option => (
                          <button
                            key={option}
                            onClick={() => {
                              setSortBy(option);
                              setShowSortDropdown(false);
                            }}
                            className="flex items-center justify-between px-2.5 py-1.5 text-[9px] text-left text-gray-350 hover:bg-[#2a2a30] hover:text-sky-450 transition font-medium"
                          >
                            <span className="capitalize">{option === 'imported' ? 'Time imported' : option === 'created' ? 'Time created' : option}</span>
                            {sortBy === option && <Check className="w-2.5 h-2.5 text-sky-400" />}
                          </button>
                        ))}
                        <div className="h-[1px] bg-[#2c2c32] my-1" />
                        <button
                          onClick={() => {
                            setSortOrder('desc');
                            setShowSortDropdown(false);
                          }}
                          className="flex items-center justify-between px-2.5 py-1.5 text-[9px] text-left text-gray-350 hover:bg-[#2a2a30] hover:text-sky-450 transition font-medium"
                        >
                          <span>Latest to earliest</span>
                          {sortOrder === 'desc' && <Check className="w-2.5 h-2.5 text-sky-400" />}
                        </button>
                        <button
                          onClick={() => {
                            setSortOrder('asc');
                            setShowSortDropdown(false);
                          }}
                          className="flex items-center justify-between px-2.5 py-1.5 text-[9px] text-left text-gray-350 hover:bg-[#2a2a30] hover:text-sky-450 transition font-medium"
                        >
                          <span>Earliest to latest</span>
                          {sortOrder === 'asc' && <Check className="w-2.5 h-2.5 text-sky-400" />}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Filter Trigger */}
                  <div className="relative">
                    <button
                      onClick={() => {
                        setShowFilterDropdown(!showFilterDropdown);
                        setShowSortDropdown(false);
                      }}
                      className={`flex items-center gap-1 px-2 py-1 bg-[#121214] border border-[#2c2c32] rounded text-[9px] font-semibold text-gray-400 hover:text-gray-200 transition ${
                        showFilterDropdown ? 'border-sky-555 text-sky-400' : ''
                      }`}
                    >
                      <Filter className="w-2.5 h-2.5" />
                      <span>Filter</span>
                    </button>
                    {showFilterDropdown && (
                      <div className="absolute right-0 top-6 z-50 flex flex-col bg-[#1e1e22] border border-[#2c2c32] rounded shadow-2xl py-1 w-28">
                        {(['all', 'video', 'audio', 'image'] as const).map(option => (
                          <button
                            key={option}
                            onClick={() => {
                              setFilterType(option);
                              setShowFilterDropdown(false);
                            }}
                            className="flex items-center justify-between px-2.5 py-1.5 text-[9px] text-left text-gray-350 hover:bg-[#2a2a30] hover:text-sky-450 transition font-medium"
                          >
                            <span className="capitalize">{option}</span>
                            {filterType === option && <Check className="w-2.5 h-2.5 text-sky-400" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Sub-categories */}
              <div className="flex gap-1 text-[10px] font-medium border-b border-[#2c2c32] pb-1 pt-1.5">
                {(['all', 'yours', 'ai', 'library'] as const).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setMediaCategory(cat)}
                    className={`px-2 py-0.5 rounded capitalize transition ${
                      mediaCategory === cat 
                        ? 'bg-[#2a2a30] text-sky-400 font-bold' 
                        : 'text-gray-400 hover:text-gray-250'
                    }`}
                  >
                    {cat === 'ai' ? 'AI Media' : cat}
                  </button>
                ))}
              </div>

              {/* Bulk Actions Bar */}
              {filteredAssets.length > 0 && (
                <div className="flex items-center justify-between text-[9px] text-zinc-400 px-2 py-1 bg-[#1a1a20]/30 border-b border-[#2c2c32]/50">
                  <label className="flex items-center gap-1.5 cursor-pointer hover:text-zinc-200 select-none">
                    <input
                      type="checkbox"
                      checked={filteredAssets.length > 0 && selectedAssetIds.length === filteredAssets.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedAssetIds(filteredAssets.map(a => a.id));
                        } else {
                          setSelectedAssetIds([]);
                        }
                      }}
                      className="w-2.5 h-2.5 rounded bg-zinc-950 border border-zinc-800 accent-sky-500 cursor-pointer"
                    />
                    <span>Select All ({filteredAssets.length})</span>
                  </label>

                  <button
                    onClick={async () => {
                      if (confirm("Are you sure you want to delete ALL media in the current view?")) {
                        for (const asset of filteredAssets) {
                          await db.assets.delete(asset.id);
                        }
                        setSelectedAssetIds([]);
                      }
                    }}
                    className="text-red-400 hover:text-red-300 font-semibold transition flex items-center gap-0.5 cursor-pointer"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                    <span>Delete All</span>
                  </button>
                </div>
              )}
            </div>
            
             {/* Media Grid / List */}
            <div 
              ref={containerRefMedia}
              onMouseDown={handleContainerMouseDown}
              onContextMenu={handleContextMenu}
              className="flex-1 overflow-y-auto p-3 custom-scrollbar relative select-none"
            >
              {/* Marquee Visual Box */}
              {marqueeBox && (
                <div
                  className="absolute border border-sky-500 bg-sky-500/15 pointer-events-none z-45"
                  style={{
                    left: Math.min(marqueeBox.x1, marqueeBox.x2),
                    top: Math.min(marqueeBox.y1, marqueeBox.y2),
                    width: Math.abs(marqueeBox.x1 - marqueeBox.x2),
                    height: Math.abs(marqueeBox.y1 - marqueeBox.y2)
                  }}
                />
              )}

              {filteredAssets.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 border border-dashed border-[#2c2c32] rounded-lg text-center p-4">
                  <Film className="w-8 h-8 text-gray-600 mb-2" />
                  <p className="text-xs text-gray-400 font-bold">No Media Found</p>
                  <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                    Import files or change your search query.
                  </p>
                </div>
              ) : viewMode === 'grid' ? (
                /* Grid View */
                <div className="grid grid-cols-[repeat(auto-fill,minmax(90px,1fr))] gap-x-2 gap-y-3.5">
                  {filteredAssets.map(asset => {
                    const isAudio = asset.type.startsWith('audio/');
                    const added = isAssetAdded(asset.id);
                    const isSelected = selectedAssetIds.includes(asset.id);
                    return (
                      <div key={asset.id} data-asset-id={asset.id} className="flex flex-col min-w-0">
                        <div
                          draggable
                          onDragStart={(e) => {
                            const dragIds = selectedAssetIds.includes(asset.id) ? selectedAssetIds : [asset.id];
                            e.dataTransfer.setData('application/cap-asset-ids', JSON.stringify(dragIds));
                            e.dataTransfer.setData('application/cap-asset-id', asset.id);
                            const assetClipType = asset.type.startsWith('audio/') ? 'audio'
                              : asset.type.startsWith('image/') ? 'image' : 'video';
                            e.dataTransfer.setData('application/cap-asset-type', assetClipType);
                            e.dataTransfer.effectAllowed = 'copy';
                          }}
                          className={`group relative aspect-video bg-[#1e1e22] border rounded overflow-hidden transition cursor-grab active:cursor-grabbing flex items-center justify-center ${
                            isSelected 
                              ? 'border-sky-500 ring-2 ring-sky-500/20 z-10' 
                              : 'border-[#2c2c32] hover:border-sky-500/60'
                          }`}
                          onClick={(e) => handleAssetClick(e, asset.id)}
                          onDoubleClick={() => handleAddToTimeline(asset)}
                        >
                          {/* Thumbnail */}
                          {isAudio ? (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-[#1e1e22] text-emerald-500">
                              <Music className="w-6 h-6 mb-1" />
                              <span className="text-[8px] text-gray-400 px-1 truncate w-full text-center">{asset.name}</span>
                            </div>
                          ) : asset.type.startsWith('image/') && !thumbnailCache[asset.id] ? (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-[#1e1e22] text-lime-500">
                              <ImageIcon className="w-6 h-6 mb-1" />
                              <span className="text-[8px] text-gray-400 px-1 truncate w-full text-center">{asset.name}</span>
                            </div>
                          ) : thumbnailCache[asset.id] ? (
                            <img
                              src={thumbnailCache[asset.id]}
                              alt={asset.name}
                              className="max-w-full max-h-full object-contain"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-[#1e1e22] text-sky-450">
                              <Film className="w-6 h-6" />
                            </div>
                          )}

                          {/* Selection Checkbox */}
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAssetIds(prev => {
                                if (prev.includes(asset.id)) {
                                  return prev.filter(id => id !== asset.id);
                                } else {
                                  return [...prev, asset.id];
                                }
                              });
                            }}
                            className={`absolute top-1.5 left-1.5 w-4 h-4 rounded border flex items-center justify-center transition-all z-20 cursor-pointer ${
                              isSelected 
                                ? 'bg-sky-500 border-sky-400 text-white' 
                                : 'bg-black/45 border-gray-500/60 opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                          </div>

                          {/* Duration Badge */}
                          <span className="absolute top-1.5 right-1.5 px-1 bg-black/60 text-[8px] font-mono text-white rounded">
                            {formatDuration(asset.durationMs)}
                          </span>

                          {/* Added Overlay Indicator */}
                          {added && !isSelected && (
                            <span className="absolute bottom-1.5 left-1.5 px-1 py-0.5 bg-sky-500/90 text-[8px] font-bold text-white rounded">
                              Added
                            </span>
                          )}

                          {/* Hover Overlay */}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddToTimeline(asset);
                              }}
                              className="p-1.5 bg-sky-500 hover:bg-sky-400 text-white rounded-full transition shadow"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteAsset(asset, e)}
                              className="p-1.5 bg-red-650 hover:bg-red-550 text-white rounded-full transition shadow"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Title text under the card */}
                        <span className="text-[10px] text-gray-400 mt-1.5 px-0.5 truncate w-full" title={asset.name}>
                          {asset.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* List View Layout */
                <div className="flex flex-col gap-1.5">
                  {filteredAssets.map(asset => {
                    const isAudio = asset.type.startsWith('audio/');
                    const added = isAssetAdded(asset.id);
                    const isSelected = selectedAssetIds.includes(asset.id);
                    return (
                      <div 
                        key={asset.id} 
                        data-asset-id={asset.id}
                        draggable
                        onDragStart={(e) => {
                          const dragIds = selectedAssetIds.includes(asset.id) ? selectedAssetIds : [asset.id];
                          e.dataTransfer.setData('application/cap-asset-ids', JSON.stringify(dragIds));
                          e.dataTransfer.setData('application/cap-asset-id', asset.id);
                          const assetClipType = asset.type.startsWith('audio/') ? 'audio'
                            : asset.type.startsWith('image/') ? 'image' : 'video';
                          e.dataTransfer.setData('application/cap-asset-type', assetClipType);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        className={`group flex items-center gap-2.5 p-1.5 bg-[#1a1a20]/40 border rounded transition cursor-grab active:cursor-grabbing text-left min-w-0 ${
                          isSelected 
                            ? 'border-sky-500 ring-2 ring-sky-500/20 z-10' 
                            : 'border-[#2c2c32] hover:border-sky-500/60'
                        }`}
                        onClick={(e) => handleAssetClick(e, asset.id)}
                        onDoubleClick={() => handleAddToTimeline(asset)}
                      >
                        {/* Selection Checkbox (List view) */}
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAssetIds(prev => {
                              if (prev.includes(asset.id)) {
                                return prev.filter(id => id !== asset.id);
                              } else {
                                return [...prev, asset.id];
                              }
                            });
                          }}
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                            isSelected 
                              ? 'bg-sky-500 border-sky-400 text-white' 
                              : 'bg-black/30 border-gray-500/60 opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3" />}
                        </div>

                        {/* Small Thumbnail */}
                        <div className="w-12 h-8 bg-[#121214] border border-[#2c2c32] rounded overflow-hidden flex items-center justify-center shrink-0">
                          {isAudio ? (
                            <Music className="w-4 h-4 text-emerald-500" />
                          ) : asset.type.startsWith('image/') && !thumbnailCache[asset.id] ? (
                            <ImageIcon className="w-4 h-4 text-lime-500" />
                          ) : thumbnailCache[asset.id] ? (
                            <img
                              src={thumbnailCache[asset.id]}
                              alt=""
                              className="max-w-full max-h-full object-contain"
                            />
                          ) : (
                            <Film className="w-4 h-4 text-sky-450" />
                          )}
                        </div>

                        {/* Name and Size */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <span className="text-[10px] text-gray-200 font-semibold truncate block" title={asset.name}>
                            {asset.name}
                          </span>
                          <span className="text-[8px] text-zinc-500 mt-0.5">
                            {(asset.size / (1024 * 1024)).toFixed(2)} MB
                          </span>
                        </div>

                        {/* Duration & Added Status */}
                        <div className="flex items-center gap-1.5 shrink-0 pr-1 group-hover:hidden">
                          {added && (
                            <span className="px-1 py-0.5 bg-sky-500/90 text-[8px] font-bold text-white rounded">
                              Added
                            </span>
                          )}
                          <span className="text-[9px] font-mono text-zinc-400">
                            {formatDuration(asset.durationMs)}
                          </span>
                        </div>

                        {/* Hover Actions */}
                        <div className="hidden group-hover:flex items-center gap-1.5 shrink-0 ml-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddToTimeline(asset);
                            }}
                            className="p-1 bg-sky-500 hover:bg-sky-400 text-white rounded transition shadow"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteAsset(asset, e)}
                            className="p-1 bg-red-650 hover:bg-red-550 text-white rounded transition shadow"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Floating Selection Action Bar */}
              {selectedAssetIds.length > 0 && (
                <div className="absolute bottom-2 left-2 right-2 p-2 bg-[#18181c] border border-[#2c2c32] rounded-lg shadow-2xl flex items-center justify-between z-50">
                  <span className="text-[10px] text-sky-450 font-bold pl-1 font-sans">
                    {selectedAssetIds.length} Selected
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={async () => {
                        for (const id of selectedAssetIds) {
                          const asset = filteredAssets.find(a => a.id === id);
                          if (asset) await handleAddToTimeline(asset);
                        }
                        setSelectedAssetIds([]);
                      }}
                      className="px-2 py-1 bg-sky-600 hover:bg-sky-500 text-white text-[9px] font-bold rounded transition flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm(`Delete ${selectedAssetIds.length} selected assets?`)) {
                          for (const id of selectedAssetIds) {
                            const asset = filteredAssets.find(a => a.id === id);
                            if (asset) await db.assets.delete(asset.id);
                          }
                          setSelectedAssetIds([]);
                        }
                      }}
                      className="px-2 py-1 bg-red-955/50 hover:bg-red-600 text-red-200 hover:text-white text-[9px] font-bold rounded transition cursor-pointer"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setSelectedAssetIds([])}
                      className="px-2 py-1 bg-[#232327] hover:bg-[#2e2e33] text-zinc-300 text-[9px] font-bold rounded transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Context Menu */}
              {contextMenu && (
                <div
                  style={{ top: contextMenu.y, left: contextMenu.x }}
                  className="fixed z-[100] bg-[#1a1a1e]/95 border border-[#2c2c32] rounded shadow-2xl py-1 w-48 text-left backdrop-blur"
                >
                  <button
                    onClick={() => {
                      setSelectedAssetIds(filteredAssets.map(a => a.id));
                      setContextMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 text-[10px] text-gray-250 hover:bg-[#2a2a30] hover:text-sky-400 transition cursor-pointer"
                  >
                    Select All (Cmd+A)
                  </button>
                  <button
                    onClick={() => {
                      setSelectedAssetIds([]);
                      setContextMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 text-[10px] text-gray-250 hover:bg-[#2a2a30] hover:text-sky-400 transition cursor-pointer"
                  >
                    Deselect All
                  </button>
                  <div className="h-[1px] bg-[#2c2c32] my-1" />
                  <button
                    onClick={async () => {
                      for (const id of selectedAssetIds) {
                        const asset = filteredAssets.find(a => a.id === id);
                        if (asset) await handleAddToTimeline(asset);
                      }
                      setSelectedAssetIds([]);
                      setContextMenu(null);
                    }}
                    disabled={selectedAssetIds.length === 0}
                    className="w-full text-left px-3 py-1.5 text-[10px] text-gray-250 hover:bg-[#2a2a30] hover:text-sky-400 transition disabled:opacity-45 cursor-pointer"
                  >
                    Add Selected to Timeline
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm(`Delete ${selectedAssetIds.length} selected assets?`)) {
                        for (const id of selectedAssetIds) {
                          const asset = filteredAssets.find(a => a.id === id);
                          if (asset) await db.assets.delete(asset.id);
                        }
                        setSelectedAssetIds([]);
                      }
                      setContextMenu(null);
                    }}
                    disabled={selectedAssetIds.length === 0}
                    className="w-full text-left px-3 py-1.5 text-[10px] text-red-400 hover:bg-red-950/40 hover:text-red-300 transition disabled:opacity-45 cursor-pointer"
                  >
                    Delete Selected
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Audio Soundtrack Tab */}
        {activeTab === 'audio' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#2c2c32]">
              <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400">Audio Tracks</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              {[
                { name: 'Vlog Beat (Upbeat)', dur: '2:15' },
                { name: 'Synthwave Cruise (Retro)', dur: '3:04' },
                { name: 'Lo-Fi Chill (Ambient)', dur: '1:45' },
                { name: 'Cinematic Drama (orchestra)', dur: '2:50' },
                { name: 'Corporate Bright (Acoustic)', dur: '2:05' }
              ].map((sound, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 bg-[#121214] border border-[#2c2c32] rounded hover:border-sky-500 transition text-xs"
                >
                  <div>
                    <p className="font-semibold text-gray-200">{sound.name}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{sound.dur}</p>
                  </div>
                  <button
                    onClick={() => alert('Preset audio downloads are simulated. Import custom MP3 tracks in the Media tab.')}
                    className="p-1 bg-[#1e1e22] border border-[#2c2c32] text-sky-400 hover:text-sky-300 rounded transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Text Layouts Tab */}
        {activeTab === 'text' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#2c2c32]">
              <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400">Text Effects</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
              {[
                { type: 'standard', title: 'Standard Text', desc: 'Simple white Inter overlay' },
                { type: 'tiktok', title: 'TikTok Gold', desc: 'Impact font with bold yellow fill' },
                { type: 'sub', title: 'Karaoke Subtitle', desc: 'Georgia centered dialogues' },
                { type: 'cinematic', title: 'Cinematic Title', desc: 'Monospace vintage screen title' }
              ].map(preset => (
                <button
                  key={preset.type}
                  onClick={() => handleAddTextPreset(preset.type as any)}
                  className="w-full text-left p-2.5 bg-[#121214] border border-[#2c2c32] hover:border-sky-500 rounded-lg transition"
                >
                  <p className="text-xs font-semibold text-gray-200">{preset.title}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{preset.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stickers Tab */}
        {activeTab === 'stickers' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#2c2c32]">
              <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400">Stickers & Emojis</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
              <div className="grid grid-cols-4 gap-2">
                {['❤️', '🔥', '✨', '😂', '👍', '🎉', '🚀', '💡', '🎬', '📱', '❌', '✅', '💥', '👀', '⭐', '🎈', '❤️‍🔥', '🤯', '😭', '⚡'].map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => handleAddSticker(emoji)}
                    className="flex items-center justify-center h-12 hover:scale-110 transition bg-[#121214] border border-[#2c2c32] hover:border-sky-500 rounded text-2xl"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Effects Tab - Full premium redesign */}
        {activeTab === 'effects' && (
          <EffectsPanel
            selectedClipId={selectedClipId}
            project={project}
            handleApplyEffect={handleApplyEffect}
            handleRemoveEffect={handleRemoveEffect}
            updateClip={updateClip}
          />
        )}

        {/* Transitions Tab - Full premium redesign */}
        {activeTab === 'transitions' && (
          <TransitionsPanel
            selectedClipId={selectedClipId}
            project={project}
            handleApplyTransition={handleApplyTransition}
            updateClip={updateClip}
          />
        )}

        {/* Captions Tab */}
        {activeTab === 'captions' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#2c2c32]">
              <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400">Auto-Captions</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              <div className="space-y-1">
                <label className="block text-[10px] font-semibold text-gray-400 uppercase">Language</label>
                <select className="w-full rounded border border-[#2c2c32] bg-[#121214] px-3 py-2 text-xs text-gray-200 focus:outline-none transition">
                  <option value="en-US">English (United States)</option>
                  <option value="es-ES">Spanish (Spain)</option>
                  <option value="fr-FR">French (France)</option>
                </select>
              </div>

              {isGeneratingCaptions ? (
                <div className="space-y-2 text-center p-4 bg-[#121214] rounded-lg border border-[#2c2c32] animate-pulse">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
                    <span className="text-xs text-zinc-300">Generating audio transcript...</span>
                  </div>
                  <div className="w-full bg-[#1e1e22] h-1.5 rounded-full overflow-hidden">
                    <div className="h-full bg-sky-500 transition-all duration-300" style={{ width: `${captionsProgress}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500">{captionsProgress}% complete</span>
                </div>
              ) : (
                <button
                  onClick={async () => {
                    if (!project) return;
                    setIsGeneratingCaptions(true);
                    setCaptionsProgress(0);

                    // Mock loader ticks
                    const interval = setInterval(() => {
                      setCaptionsProgress(p => {
                        if (p >= 90) {
                          clearInterval(interval);
                          return 90;
                        }
                        return p + Math.floor(Math.random() * 15 + 5);
                      });
                    }, 200);

                    try {
                      const { generateAutoCaptions } = await import('../../lib/captions-generator');
                      const segments = await generateAutoCaptions(project);

                      let textTrack = project.tracks.find(t => t.type === 'text');
                      if (!textTrack) {
                        await addTrack('text');
                        // Reload from state
                        const updatedProj = useEditorStore.getState().project;
                        textTrack = updatedProj?.tracks.find(t => t.type === 'text');
                      }

                      if (!textTrack) {
                        alert('Could not add a text track for subtitles.');
                        clearInterval(interval);
                        setIsGeneratingCaptions(false);
                        return;
                      }

                      for (const seg of segments) {
                        const clipId = Math.random().toString(36).substring(2, 9);
                        await addClip(textTrack.id, {
                          id: clipId,
                          type: 'text',
                          name: seg.text,
                          durationMs: seg.endMs - seg.startMs,
                          trimStartMs: 0,
                          trimEndMs: seg.endMs - seg.startMs,
                          positionMs: seg.startMs,
                          textSettings: {
                            content: seg.text,
                            color: '#ffffff',
                            fontSize: 22,
                            fontFamily: 'Inter',
                            x: 0.5,
                            y: 0.8,
                            scale: 1
                          }
                        });
                      }

                      setCaptionsProgress(100);
                      setTimeout(() => {
                        setIsGeneratingCaptions(false);
                        alert(`Successfully generated ${segments.length} subtitles directly on the Text Track!`);
                      }, 500);
                    } catch (err) {
                      console.error(err);
                      alert('Failed to generate captions.');
                      setIsGeneratingCaptions(false);
                    } finally {
                      clearInterval(interval);
                    }
                  }}
                  className="w-full py-2 bg-sky-650 hover:bg-sky-500 text-white font-semibold rounded-lg text-xs transition shadow-lg shadow-sky-600/10 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-sky-250" />
                  Generate Captions
                </button>
              )}
            </div>
          </div>
        )}

        {/* Filters Tab */}
        {activeTab === 'filters' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#2c2c32]">
              <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400">Filters</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
                {[
                  { id: 'none', name: 'None' },
                  { id: 'cinematic', name: 'Cinematic' },
                  { id: 'bw', name: 'Noir B&W' },
                  { id: 'vintage', name: 'Vintage' },
                  { id: 'warm', name: 'Golden' },
                  { id: 'cool', name: 'Teal Cool' },
                  { id: 'cyberpunk', name: 'Cyberpunk' },
                  { id: 'sepia', name: 'Sepia' },
                  { id: 'pastel', name: 'Dreamy Pastel' },
                  { id: 'forest', name: 'Forest Green' },
                  { id: 'polaroid', name: 'Polaroid Film' },
                  { id: 'vaporwave', name: 'Vaporwave' }
                ].map(filter => {
                  const isApplied = activeFilter === filter.id;
                  return (
                    <div
                      key={filter.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/cap-filter-id', filter.id);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => handleApplyFilter(filter.id)}
                      className={`relative rounded-lg overflow-hidden cursor-pointer border text-left transition-all duration-200 ${isApplied ? 'border-sky-500 shadow-lg shadow-sky-500/20' : 'border-[#2c2c32] hover:border-sky-400/60'}`}
                    >
                      {/* Preview Thumbnail */}
                      <div className="h-14 w-full relative overflow-hidden bg-zinc-950 flex items-center justify-center">
                        <div className="w-full h-full" style={getFilterPreviewStyle(filter.id)}>
                          <img src={heroImg} className="w-full h-full object-cover" alt={filter.name} />
                        </div>
                        {isApplied && (
                          <div className="absolute top-1 right-1 w-4 h-4 bg-sky-500 rounded-full flex items-center justify-center shadow z-10">
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                      </div>
                      {/* Label */}
                      <div className="px-1.5 py-1 bg-[#121214]">
                        <p className="text-[10px] font-semibold text-gray-200 truncate">{filter.name}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Adjustment Tab (NEW) */}
        {activeTab === 'adjustment' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#2c2c32]">
              <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400">Color Adjustment Presets</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              {[
                { id: 'bright', name: 'High Brightness', desc: 'Boosts brightness for dark clips' },
                { id: 'high-contrast', name: 'Punchy Contrast', desc: 'Deepens contrast and shadows' },
                { id: 'saturated', name: 'Vibrant Colors', desc: 'Saturates primary colors' },
                { id: 'warm-look', name: 'Warm Sunset', desc: 'Shift temperature to warmer tones' }
              ].map(preset => (
                <button
                  key={preset.id}
                  onClick={() => {
                    if (!selectedClipId) {
                      alert('Please select a video clip on the timeline first.');
                      return;
                    }
                    if (preset.id === 'bright') {
                      updateClip(selectedClipId, { colorAdjustments: { brightness: 130, contrast: 100, saturation: 100, temp: 0, vignette: 0 } });
                    } else if (preset.id === 'high-contrast') {
                      updateClip(selectedClipId, { colorAdjustments: { brightness: 100, contrast: 130, saturation: 105, temp: 0, vignette: 0 } });
                    } else if (preset.id === 'saturated') {
                      updateClip(selectedClipId, { colorAdjustments: { brightness: 100, contrast: 100, saturation: 140, temp: 0, vignette: 0 } });
                    } else if (preset.id === 'warm-look') {
                      updateClip(selectedClipId, { colorAdjustments: { brightness: 100, contrast: 100, saturation: 100, temp: 25, vignette: 0 } });
                    }
                  }}
                  className="w-full text-left p-2.5 bg-[#121214] border border-[#2c2c32] hover:border-sky-500 rounded-lg transition"
                >
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-sky-400" />
                    <div>
                      <p className="text-xs font-semibold text-gray-200">{preset.name}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{preset.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AI Avatars Tab (NEW) */}
        {activeTab === 'ai-avatars' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#2c2c32]">
              <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400">AI Avatars</h3>
              <p className="text-[10px] text-gray-500 mt-0.5">Add talking AI speaker avatars to your video.</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { name: 'Sarah (Business)', type: 'Female' },
                  { name: 'David (Tech)', type: 'Male' },
                  { name: 'Elena (Lifestyle)', type: 'Female' },
                  { name: 'Marcus (Casual)', type: 'Male' }
                ].map((avatar, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      if (!project) return;
                      const videoTrack = project.tracks.find(t => t.type === 'video');
                      if (!videoTrack) {
                        alert('No Video track found to add the avatar clip.');
                        return;
                      }
                      const preset = avatar.name.split(' ')[0].toLowerCase();
                      const clipId = Math.random().toString(36).substring(2, 9);
                      addClip(videoTrack.id, {
                        id: clipId,
                        assetId: `avatar_${preset}`,
                        type: 'video',
                        name: `AI Avatar (${avatar.name})`,
                        durationMs: 5000,
                        trimStartMs: 0,
                        trimEndMs: 5000,
                        positionMs: currentTime
                      });
                    }}
                    className="flex flex-col items-center justify-center p-4 bg-[#121214] border border-[#2c2c32] hover:border-sky-500 rounded text-center transition cursor-pointer"
                  >
                    <div className="w-12 h-12 rounded-full bg-[#1e1e22] flex items-center justify-center text-sky-400 border border-[#2c2c32] mb-2">
                      <User className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-semibold text-gray-200">{avatar.name}</span>
                    <span className="text-[9px] text-gray-500 mt-0.5">{avatar.type}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

/* ─────────────────────────── Effects Panel ─────────────────────────── */
const EffectPreviewPlaceholder = () => (
  <div className="w-full h-full relative overflow-hidden">
    <img src={heroImg} className="w-full h-full object-cover" alt="Outgoing Clip" />
  </div>
);

const getEffectPreviewStyle = (effectId: string) => {
  switch (effectId) {
    case 'blur-gaussian':
      return { filter: 'blur(1.5px)' };
    case 'blur-tilt-shift':
      return { filter: 'blur(1.2px) contrast(105%)' };
    case 'glow-neon':
      return { filter: 'brightness(110%) saturate(140%) drop-shadow(0 0 3px #8b5cf6)' };
    case 'glow-bloom':
      return { filter: 'brightness(125%) blur(0.5px)' };
    case 'glow-dreamy':
      return { filter: 'brightness(105%) saturate(75%) sepia(20%) blur(0.3px)' };
    case 'distort-fisheye':
      return { transform: 'scale(1.12)', filter: 'contrast(110%)' };
    case 'distort-wave':
      return { transform: 'skewX(3deg) scale(1.05)' };
    case 'distort-glitch':
      return { filter: 'hue-rotate(90deg) saturate(140%) contrast(115%)' };
    case 'camera-shake':
      return { animation: 'preview-shake 0.5s infinite alternate' };
    case 'camera-grain':
      return { filter: 'contrast(115%) brightness(95%) saturate(90%)' };
    case 'camera-scanlines':
      return { filter: 'brightness(90%) contrast(110%)' };
    case 'color-vignette':
      return {};
    case 'color-lomo':
      return { filter: 'contrast(130%) saturate(125%) brightness(90%)' };
    case 'distort-mirror':
      return {};
    case 'color-thermal':
      return { filter: 'hue-rotate(240deg) saturate(220%) contrast(140%) brightness(110%)' };
    case 'distort-pixelate':
      return { filter: 'contrast(120%) saturate(110%) brightness(95%)', imageRendering: 'pixelated' as any };
    default:
      return {};
  }
};

const getFilterPreviewStyle = (filterId: string) => {
  switch (filterId) {
    case 'bw':
      return { filter: 'grayscale(100%)' };
    case 'sepia':
      return { filter: 'sepia(100%)' };
    case 'vintage':
      return { filter: 'sepia(40%) hue-rotate(30deg) contrast(80%)' };
    case 'warm':
      return { filter: 'sepia(30%) saturate(120%)' };
    case 'cool':
      return { filter: 'hue-rotate(190deg) saturate(110%)' };
    case 'cyberpunk':
      return { filter: 'hue-rotate(300deg) contrast(1.1) saturate(150%)' };
    case 'cinematic':
      return { filter: 'contrast(120%) saturate(90%)' };
    case 'pastel':
      return { filter: 'sepia(25%) saturate(130%) hue-rotate(-15deg) contrast(95%)' };
    case 'forest':
      return { filter: 'hue-rotate(60deg) saturate(110%) contrast(115%)' };
    case 'polaroid':
      return { filter: 'contrast(85%) saturate(85%) sepia(15%) brightness(105%)' };
    case 'vaporwave':
      return { filter: 'hue-rotate(270deg) saturate(160%) contrast(110%)' };
    default:
      return {};
  }
};

interface EffectsPanelProps {
  selectedClipId: string | null;
  project: any;
  handleApplyEffect: (id: string, intensity: number) => void;
  handleRemoveEffect: (id: string) => void;
  updateClip: any;
}

function EffectsPanel({ selectedClipId, project, handleApplyEffect, handleRemoveEffect }: EffectsPanelProps) {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pendingIntensity, setPendingIntensity] = useState<Record<string, number>>({});

  const selectedClip = selectedClipId
    ? project?.tracks.flatMap((t: any) => t.clips).find((c: any) => c.id === selectedClipId)
    : null;

  const appliedEffects: Array<{ id: string; intensity: number }> = selectedClip?.videoEffects || [];
  const appliedIds = new Set(appliedEffects.map((e: any) => e.id));

  const allEffects = Object.values(EFFECTS_REGISTRY);
  const filtered = allEffects.filter(e => {
    const matchCat = activeCategory === 'All' || e.category === activeCategory;
    const matchSearch = !searchQuery || e.name.toLowerCase().includes(searchQuery.toLowerCase()) || e.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-[#2c2c32] space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Video Effects
          </h3>
          {appliedEffects.length > 0 && (
            <span className="text-[9px] font-bold bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full border border-purple-500/30">
              {appliedEffects.length} applied
            </span>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2 w-3 h-3 text-gray-500" />
          <input
            type="text"
            placeholder="Search effects..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[#121214] border border-[#2c2c32] rounded pl-7 pr-3 py-1 text-[10px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500 transition"
          />
        </div>
        {/* Category pills */}
        <div className="flex gap-1 flex-wrap">
          {(['All', ...EFFECT_CATEGORIES] as string[]).map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-2 py-0.5 rounded text-[9px] font-semibold transition ${activeCategory === cat ? 'bg-purple-600 text-white' : 'bg-[#1e1e22] text-gray-400 hover:text-gray-200 border border-[#2c2c32]'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Applied Effects strip */}
      {appliedEffects.length > 0 && (
        <div className="px-3 py-2 border-b border-[#2c2c32] space-y-1.5">
          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Applied</p>
          {appliedEffects.map((eff: any) => {
            const def = EFFECTS_REGISTRY[eff.id];
            if (!def) return null;
            const intensity = pendingIntensity[eff.id] ?? eff.intensity;
            return (
              <div key={eff.id} className="bg-[#1a1a20] border border-purple-500/30 rounded-lg p-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-purple-300">{def.name}</span>
                  <button
                    onClick={() => handleRemoveEffect(eff.id)}
                    className="text-gray-500 hover:text-red-400 transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={intensity}
                    onChange={e => {
                      const val = Number(e.target.value);
                      setPendingIntensity(prev => ({ ...prev, [eff.id]: val }));
                      handleApplyEffect(eff.id, val);
                    }}
                    className="flex-1 h-1 bg-[#2c2c32] rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                  <span className="text-[9px] font-mono text-gray-400 w-6 text-right">{intensity}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Effect cards grid */}
      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        <style>{`
          @keyframes preview-shake {
            0% { transform: translate(0, 0) rotate(0deg); }
            25% { transform: translate(1px, 1px) rotate(0.5deg); }
            50% { transform: translate(-1px, -1px) rotate(-0.5deg); }
            75% { transform: translate(1px, -1px) rotate(0.5deg); }
            100% { transform: translate(0, 0) rotate(0deg); }
          }
        `}</style>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
          {filtered.map(effect => {
            const isApplied = appliedIds.has(effect.id);
            const isHovered = hoveredId === effect.id;
            return (
              <div
                key={effect.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/cap-effect-id', effect.id);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className={`relative rounded-lg overflow-hidden cursor-pointer border transition-all duration-200 ${isApplied ? 'border-purple-500 shadow-lg shadow-purple-500/20' : 'border-[#2c2c32] hover:border-purple-400/60'}`}
                onMouseEnter={() => setHoveredId(effect.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => handleApplyEffect(effect.id, EFFECTS_REGISTRY[effect.id]?.defaultIntensity || 60)}
              >
                {/* Preview Thumbnail Container */}
                <div className="h-14 w-full relative overflow-hidden bg-zinc-950 flex items-center justify-center">
                  {effect.id === 'distort-mirror' ? (
                    <div className="w-full h-full flex pointer-events-none">
                      <div className="w-1/2 h-full overflow-hidden">
                        <EffectPreviewPlaceholder />
                      </div>
                      <div className="w-1/2 h-full overflow-hidden scale-x-[-1]">
                        <EffectPreviewPlaceholder />
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full transition-all duration-300" style={getEffectPreviewStyle(effect.id)}>
                      <EffectPreviewPlaceholder />
                    </div>
                  )}

                  {/* Vignette Overlay */}
                  {effect.id === 'color-vignette' && (
                    <div className="absolute inset-0 pointer-events-none" style={{
                      background: 'radial-gradient(circle, transparent 35%, rgba(0,0,0,0.85) 100%)'
                    }} />
                  )}

                  {/* CRT Scanlines Overlay */}
                  {effect.id === 'camera-scanlines' && (
                    <div className="absolute inset-0 pointer-events-none" style={{
                      background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.3) 50%)',
                      backgroundSize: '100% 3px'
                    }} />
                  )}

                  {/* Film Grain Overlay */}
                  {effect.id === 'camera-grain' && (
                    <div className="absolute inset-0 pointer-events-none opacity-25 bg-[radial-gradient(#fff_1px,transparent_1px)] bg-[size:3px_3px]" />
                  )}

                  {/* Pixelate Overlay */}
                  {effect.id === 'distort-pixelate' && (
                    <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(rgba(0,0,0,0.4)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.4)_1px,transparent_1px)] bg-[size:4px_4px]" />
                  )}

                  {isHovered && (
                    <div className="absolute inset-0 animate-pulse opacity-20"
                      style={{ background: `radial-gradient(circle at 50% 50%, ${effect.previewColors[0]}88, transparent 70%)` }}
                    />
                  )}
                  {isApplied && (
                    <div className="absolute top-1 right-1 w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center shadow z-10">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                  <div className="absolute bottom-1 left-1.5 z-10">
                    <span className="text-[8px] font-bold text-white/60 uppercase tracking-wider">{effect.category}</span>
                  </div>
                </div>
                {/* Label */}
                <div className="px-1.5 py-1 bg-[#121214]">
                  <p className="text-[10px] font-semibold text-gray-200 truncate">{effect.name}</p>
                  <p className="text-[9px] text-gray-500 truncate leading-tight mt-0.5">{effect.description}</p>
                </div>
              </div>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Sparkles className="w-6 h-6 text-gray-600 mb-2" />
            <p className="text-[10px] text-gray-500">No effects found</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────── Transitions Panel ─────────────────────────── */
const TransitionPreviewPlaceholderB = () => (
  <div className="w-full h-full relative overflow-hidden">
    <img src={heroImg} className="w-full h-full object-cover filter hue-rotate-[120deg] brightness-[85%]" alt="Incoming Clip" />
  </div>
);

const getTransitionAnimationA = (id: string, isHovered: boolean) => {
  if (!isHovered) return {};
  if (id === 'cross-zoom') {
    return { animation: 'trans-cross-zoom-a 1.5s infinite ease-in-out' };
  }
  return {};
};

const getTransitionAnimationB = (id: string, isHovered: boolean) => {
  if (!isHovered) return { opacity: 0 };
  switch (id) {
    case 'fade':
      return { animation: 'trans-fade 1.5s infinite ease-in-out' };
    case 'dip-black':
    case 'dip-white':
    case 'flash':
      return { animation: 'trans-clip-reveal 1.5s infinite' };
    case 'wipe-left':
      return { animation: 'trans-wipe-left 1.5s infinite ease-in-out' };
    case 'wipe-right':
      return { animation: 'trans-wipe-right 1.5s infinite ease-in-out' };
    case 'wipe-up':
      return { animation: 'trans-wipe-up 1.5s infinite ease-in-out' };
    case 'wipe-down':
      return { animation: 'trans-wipe-down 1.5s infinite ease-in-out' };
    case 'slide-left':
      return { animation: 'trans-slide-left 1.5s infinite ease-in-out' };
    case 'slide-right':
      return { animation: 'trans-slide-right 1.5s infinite ease-in-out' };
    case 'slide-up':
      return { animation: 'trans-slide-up 1.5s infinite ease-in-out' };
    case 'slide-down':
      return { animation: 'trans-slide-down 1.5s infinite ease-in-out' };
    case 'zoom':
      return { animation: 'trans-zoom 1.5s infinite ease-in-out' };
    case 'zoom-out':
      return { animation: 'trans-zoom-out 1.5s infinite ease-in-out' };
    case 'cross-zoom':
      return { animation: 'trans-cross-zoom-b 1.5s infinite ease-in-out' };
    case 'glitch':
      return { animation: 'trans-glitch-b 1.5s infinite steps(5)' };
    default:
      return { animation: 'trans-fade 1.5s infinite ease-in-out' };
  }
};

interface TransitionsPanelProps {
  selectedClipId: string | null;
  project: any;
  handleApplyTransition: (type: string) => void;
  updateClip: any;
}

function TransitionsPanel({ selectedClipId, project, handleApplyTransition, updateClip }: TransitionsPanelProps) {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [transitionDuration, setTransitionDuration] = useState(1000);

  const selectedClip = selectedClipId
    ? project?.tracks.flatMap((t: any) => t.clips).find((c: any) => c.id === selectedClipId)
    : null;

  const activeTransType = selectedClip?.transitionIn?.type || selectedClip?.transitionType || null;

  const allTransitions = Object.values(TRANSITIONS_REGISTRY);
  const filtered = allTransitions.filter(t => {
    const matchCat = activeCategory === 'All' || t.category === activeCategory;
    const matchSearch = !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleApplyWithDuration = (type: string) => {
    if (!selectedClipId) {
      alert('Please select a video clip on the timeline first to apply a transition.');
      return;
    }
    updateClip(selectedClipId, {
      transitionType: type,
      fadeInMs: transitionDuration,
      transitionIn: { type, durationMs: transitionDuration, easing: 'ease-in-out' }
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-[#2c2c32] space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-sky-400" /> Transitions
          </h3>
          {activeTransType && (
            <button
              onClick={() => handleApplyTransition('clear')}
              className="text-[9px] text-red-400 hover:text-red-300 transition flex items-center gap-0.5"
            >
              <X className="w-2.5 h-2.5" /> Clear
            </button>
          )}
        </div>

        {/* Duration slider */}
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <label className="text-[9px] font-semibold text-gray-500 uppercase flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" /> Duration
            </label>
            <span className="text-[9px] font-mono text-gray-400">{(transitionDuration / 1000).toFixed(1)}s</span>
          </div>
          <input
            type="range"
            min={200}
            max={3000}
            step={100}
            value={transitionDuration}
            onChange={e => setTransitionDuration(Number(e.target.value))}
            className="w-full h-1 bg-[#2c2c32] rounded-lg appearance-none cursor-pointer accent-sky-500"
          />
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2 w-3 h-3 text-gray-500" />
          <input
            type="text"
            placeholder="Search transitions..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[#121214] border border-[#2c2c32] rounded pl-7 pr-3 py-1 text-[10px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-sky-500 transition"
          />
        </div>
        {/* Category pills */}
        <div className="flex gap-1 flex-wrap">
          {(['All', ...TRANSITION_CATEGORIES] as string[]).map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-2 py-0.5 rounded text-[9px] font-semibold transition ${activeCategory === cat ? 'bg-sky-600 text-white' : 'bg-[#1e1e22] text-gray-400 hover:text-gray-200 border border-[#2c2c32]'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Transition cards grid */}
      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        <style>{`
          @keyframes trans-fade {
            0%, 10% { opacity: 0; }
            90%, 100% { opacity: 1; }
          }
          @keyframes trans-dip-black {
            0%, 10% { opacity: 0; }
            45%, 55% { opacity: 1; }
            90%, 100% { opacity: 0; }
          }
          @keyframes trans-clip-reveal {
            0%, 10% { opacity: 0; }
            45% { opacity: 0; }
            50%, 100% { opacity: 1; }
          }
          @keyframes trans-wipe-left {
            0%, 10% { clip-path: inset(0 100% 0 0); }
            90%, 100% { clip-path: inset(0 0 0 0); }
          }
          @keyframes trans-wipe-right {
            0%, 10% { clip-path: inset(0 0 0 100%); }
            90%, 100% { clip-path: inset(0 0 0 0); }
          }
          @keyframes trans-wipe-up {
            0%, 10% { clip-path: inset(100% 0 0 0); }
            90%, 100% { clip-path: inset(0 0 0 0); }
          }
          @keyframes trans-wipe-down {
            0%, 10% { clip-path: inset(0 0 100% 0); }
            90%, 100% { clip-path: inset(0 0 0 0); }
          }
          @keyframes trans-slide-left {
            0%, 10% { transform: translateX(100%); }
            90%, 100% { transform: translateX(0); }
          }
          @keyframes trans-slide-right {
            0%, 10% { transform: translateX(-100%); }
            90%, 100% { transform: translateX(0); }
          }
          @keyframes trans-slide-up {
            0%, 10% { transform: translateY(100%); }
            90%, 100% { transform: translateY(0); }
          }
          @keyframes trans-slide-down {
            0%, 10% { transform: translateY(-100%); }
            90%, 100% { transform: translateY(0); }
          }
          @keyframes trans-zoom {
            0%, 10% { transform: scale(0.3); opacity: 0; }
            90%, 100% { transform: scale(1); opacity: 1; }
          }
          @keyframes trans-zoom-out {
            0%, 10% { transform: scale(1.5); opacity: 0; }
            90%, 100% { transform: scale(1); opacity: 1; }
          }
          @keyframes trans-cross-zoom-a {
            0%, 10% { transform: scale(1); opacity: 1; }
            90%, 100% { transform: scale(1.5); opacity: 0; }
          }
          @keyframes trans-cross-zoom-b {
            0%, 10% { transform: scale(0.5); opacity: 0; }
            90%, 100% { transform: scale(1); opacity: 1; }
          }
          @keyframes trans-glitch-b {
            0%, 10% { opacity: 0; transform: translate(0, 0); filter: hue-rotate(0deg); }
            20% { opacity: 0.3; transform: translate(-2px, 1px); filter: hue-rotate(90deg); }
            40% { opacity: 0.6; transform: translate(2px, -1px); filter: hue-rotate(180deg); }
            60% { opacity: 0.8; transform: translate(-1px, -1px); }
            80%, 100% { opacity: 1; transform: translate(0, 0); filter: hue-rotate(0deg); }
          }
          @keyframes trans-flash-overlay {
            0%, 10% { opacity: 0; }
            30%, 50% { opacity: 1; }
            90%, 100% { opacity: 0; }
          }
        `}</style>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
          {filtered.map(trans => {
            const isApplied = activeTransType === trans.id;
            const isHovered = hoveredId === trans.id;
            return (
              <div
                key={trans.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/cap-transition-id', trans.id);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className={`relative rounded-lg overflow-hidden cursor-pointer border transition-all duration-200 ${isApplied ? 'border-sky-500 shadow-lg shadow-sky-500/20' : 'border-[#2c2c32] hover:border-sky-400/60'}`}
                onMouseEnter={() => setHoveredId(trans.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => handleApplyWithDuration(trans.id)}
              >
                {/* Preview Thumbnail Container */}
                <div className="h-14 w-full relative overflow-hidden bg-zinc-950 flex items-center justify-center">
                  {/* Outgoing Clip (Image A) */}
                  <div className="absolute inset-0 w-full h-full" style={getTransitionAnimationA(trans.id, isHovered)}>
                    <EffectPreviewPlaceholder />
                  </div>

                  {/* Incoming Clip (Image B) */}
                  <div className="absolute inset-0 w-full h-full" style={getTransitionAnimationB(trans.id, isHovered)}>
                    <TransitionPreviewPlaceholderB />
                  </div>

                  {/* Dip to Black Overlay */}
                  {isHovered && trans.id === 'dip-black' && (
                    <div className="absolute inset-0 bg-black pointer-events-none" style={{
                      animation: 'trans-dip-black 1.5s infinite ease-in-out'
                    }} />
                  )}

                  {/* Dip to White Overlay */}
                  {isHovered && trans.id === 'dip-white' && (
                    <div className="absolute inset-0 bg-white pointer-events-none" style={{
                      animation: 'trans-dip-black 1.5s infinite ease-in-out'
                    }} />
                  )}

                  {/* Flash Overlay */}
                  {isHovered && trans.id === 'flash' && (
                    <div className="absolute inset-0 bg-white pointer-events-none" style={{
                      animation: 'trans-flash-overlay 1.5s infinite ease-out'
                    }} />
                  )}

                  {isApplied && (
                    <div className="absolute top-1 right-1 w-4 h-4 bg-sky-500 rounded-full flex items-center justify-center shadow z-10">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                  <div className="absolute bottom-1 left-1.5 z-10">
                    <span className="text-[8px] font-bold text-white/60 uppercase tracking-wider">{trans.category}</span>
                  </div>
                </div>
                {/* Label */}
                <div className="px-1.5 py-1 bg-[#121214]">
                  <p className="text-[10px] font-semibold text-gray-200 truncate">{trans.name}</p>
                  <p className="text-[9px] text-gray-500 truncate leading-tight mt-0.5">{trans.description}</p>
                </div>
              </div>
            );
          })}
        </div>
        {/* Clear button at bottom */}
        <button
          onClick={() => handleApplyTransition('clear')}
          className="mt-3 w-full py-2 text-[10px] font-semibold text-gray-400 hover:text-red-400 border border-[#2c2c32] hover:border-red-500/40 rounded-lg transition flex items-center justify-center gap-1.5"
        >
          <X className="w-3 h-3" /> Remove Transition
        </button>
      </div>
    </div>
  );
}
