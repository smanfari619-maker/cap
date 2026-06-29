import React, { useRef, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Film, Music, Upload, Plus, Loader2, Trash2, Sparkles, Search, Sliders, User, ImageIcon, LayoutGrid, List, ArrowUpDown, Filter, Check, Zap, X, Clock } from 'lucide-react';
import { db, type Asset, type TimelineClip } from '../../lib/db';
import { useEditorStore } from '../../store/editorStore';
import { saveFileToOPFS, deleteFileFromOPFS } from '../../lib/opfs';
import { getMediaMetadata } from '../../lib/media-metadata';
import { EFFECTS_REGISTRY, EFFECT_CATEGORIES } from '../../lib/effects-registry';
import { TRANSITIONS_REGISTRY, TRANSITION_CATEGORIES } from '../../lib/transitions-registry';

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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
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

  // Extract thumbnails for video and image assets in LeftSidebar
  useEffect(() => {
    assets.forEach(async (asset) => {
      if (thumbnailCache[asset.id]) return;
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
        video.preload = 'auto';
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
  }, [assets]);

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
      await deleteFileFromOPFS(asset.opfsPath);
      await db.assets.delete(asset.id);
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

  const handleApplyEffect = (effectId: string, intensity: number) => {
    if (!selectedClipId) {
      alert('Please select a video clip on the timeline first to apply an effect.');
      return;
    }
    const clip = project?.tracks.flatMap(t => t.clips).find(c => c.id === selectedClipId);
    if (!clip) return;
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
  };

  const handleRemoveEffect = (effectId: string) => {
    if (!selectedClipId) return;
    const clip = project?.tracks.flatMap(t => t.clips).find(c => c.id === selectedClipId);
    if (!clip) return;
    const newEffects = (clip.videoEffects || []).filter(e => e.id !== effectId);
    updateClip(selectedClipId, { videoEffects: newEffects });
  };

  const handleApplyFilter = (type: string) => {
    if (!selectedClipId) {
      alert('Please select a video clip on the timeline first to apply filter.');
      return;
    }
    updateClip(selectedClipId, {
      filterSettings: {
        type,
        intensity: 80
      }
    });
  };

  const formatDuration = (ms: number) => {
    const sec = Math.floor(ms / 1000) % 60;
    const min = Math.floor(ms / 60000);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

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

  return (
    <div 
      className="flex flex-col h-full bg-[#18181c] border-r border-[#2c2c32] text-gray-200 overflow-hidden select-none"
      style={{ width, display: width === 0 ? 'none' : 'flex' }}
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
            </div>
            
             {/* Media Grid / List */}
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
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
                <div className="grid grid-cols-2 gap-x-2 gap-y-3.5">
                  {filteredAssets.map(asset => {
                    const isAudio = asset.type.startsWith('audio/');
                    const added = isAssetAdded(asset.id);
                    return (
                      <div key={asset.id} className="flex flex-col min-w-0">
                        <div
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/cap-asset-id', asset.id);
                            const assetClipType = asset.type.startsWith('audio/') ? 'audio'
                              : asset.type.startsWith('image/') ? 'image' : 'video';
                            e.dataTransfer.setData('application/cap-asset-type', assetClipType);
                            e.dataTransfer.effectAllowed = 'copy';
                          }}
                          className="group relative aspect-video bg-[#1e1e22] border border-[#2c2c32] rounded overflow-hidden hover:border-sky-500 transition cursor-grab active:cursor-grabbing flex items-center justify-center"
                          onClick={() => handleAddToTimeline(asset)}
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

                          {/* Duration Badge */}
                          <span className="absolute top-1.5 right-1.5 px-1 bg-black/60 text-[8px] font-mono text-white rounded">
                            {formatDuration(asset.durationMs)}
                          </span>

                          {/* Added Overlay Indicator */}
                          {added && (
                            <span className="absolute top-1.5 left-1.5 px-1 py-0.5 bg-sky-500/90 text-[8px] font-bold text-white rounded">
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
                    return (
                      <div 
                        key={asset.id} 
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/cap-asset-id', asset.id);
                          const assetClipType = asset.type.startsWith('audio/') ? 'audio'
                            : asset.type.startsWith('image/') ? 'image' : 'video';
                          e.dataTransfer.setData('application/cap-asset-type', assetClipType);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        className="group flex items-center gap-2.5 p-1.5 bg-[#1a1a20]/40 border border-[#2c2c32] hover:border-sky-500/80 rounded transition cursor-grab active:cursor-grabbing text-left min-w-0"
                      >
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
              <button
                onClick={() => alert('Voice captioning is simulated. Captions will be auto-generated at the playhead position.')}
                className="w-full py-2 bg-sky-650 hover:bg-sky-500 text-white font-semibold rounded-lg text-xs transition shadow-lg shadow-sky-600/10 flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-sky-250" />
                Generate Captions
              </button>
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
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'none', name: 'None (Default)' },
                  { id: 'cinematic', name: 'Cinematic Blue' },
                  { id: 'bw', name: 'Noir B&W' },
                  { id: 'vintage', name: 'Vintage Retro' },
                  { id: 'warm', name: 'Golden Warm' },
                  { id: 'cool', name: 'Teal Cool' },
                  { id: 'cyberpunk', name: 'Neon Cyberpunk' },
                  { id: 'sepia', name: 'Rustic Sepia' }
                ].map(filter => (
                  <button
                    key={filter.id}
                    onClick={() => handleApplyFilter(filter.id)}
                    className="p-3 bg-[#121214] hover:border-sky-500 border border-[#2c2c32] rounded transition text-left text-xs"
                  >
                    <p className="font-semibold text-gray-200 truncate">{filter.name}</p>
                  </button>
                ))}
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
              <p className="text-[10px] text-gray-500 mt-0.5">Add simulated AI speaker avatars to your video.</p>
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
                    onClick={() => alert(`Adding AI Avatar ${avatar.name} (simulated)`)}
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
        <div className="grid grid-cols-2 gap-2">
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
                {/* Preview gradient */}
                <div
                  className="h-14 w-full relative overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${effect.previewColors[0]}, ${effect.previewColors[1]})` }}
                >
                  {isHovered && (
                    <div className="absolute inset-0 animate-pulse opacity-40"
                      style={{ background: `radial-gradient(circle at 50% 50%, ${effect.previewColors[0]}88, transparent 70%)` }}
                    />
                  )}
                  {isApplied && (
                    <div className="absolute top-1 right-1 w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center shadow">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                  <div className="absolute bottom-1 left-1.5">
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
        <div className="grid grid-cols-2 gap-2">
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
                {/* Preview gradient with animated shimmer on hover */}
                <div
                  className="h-14 w-full relative overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${trans.previewColors[0]}, ${trans.previewColors[1]})` }}
                >
                  {isHovered && (
                    <>
                      <div
                        className="absolute inset-0 transition-all duration-300"
                        style={{
                          background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)`,
                          transform: isHovered ? 'translateX(100%)' : 'translateX(-100%)',
                          animation: isHovered ? 'shimmer 0.8s ease-in-out' : 'none',
                        }}
                      />
                      {/* Animated diagonal slice to simulate transition */}
                      <div
                        className="absolute inset-0"
                        style={{
                          background: `linear-gradient(135deg, ${trans.previewColors[1]} 0%, ${trans.previewColors[1]} 40%, transparent 40%)`,
                          opacity: 0.6,
                          animation: 'wipe-preview 1.2s ease-in-out infinite',
                        }}
                      />
                    </>
                  )}
                  {isApplied && (
                    <div className="absolute top-1 right-1 w-4 h-4 bg-sky-500 rounded-full flex items-center justify-center shadow">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                  <div className="absolute bottom-1 left-1.5">
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
