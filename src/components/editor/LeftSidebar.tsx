import React, { useRef, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Film, Music, Upload, Plus, Loader2, Trash2, Sparkles, Search, Sliders, User, ImageIcon, LayoutGrid, List, ArrowUpDown, Filter, Check } from 'lucide-react';
import { db, type Asset, type TimelineClip } from '../../lib/db';
import { useEditorStore } from '../../store/editorStore';
import { saveFileToOPFS, deleteFileFromOPFS } from '../../lib/opfs';
import { getMediaMetadata } from '../../lib/media-metadata';

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
    const trackType = clipType; // track type matches clip type

    // Find an existing track of this type, or create one
    let track = project.tracks.find(t => t.type === trackType);
    if (!track) {
      await addTrack(trackType);
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
      updateClip(selectedClipId, { transitionType: 'none', fadeInMs: 0 });
    } else {
      updateClip(selectedClipId, { transitionType: type, fadeInMs: 1000 });
    }
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

        {/* Effects Tab (NEW) */}
        {activeTab === 'effects' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#2c2c32]">
              <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400">Video Effects</h3>
              <p className="text-[10px] text-gray-500 mt-0.5">Select a clip and click an effect to apply.</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              {[
                { id: 'glow', label: 'Neon Glow', desc: 'Adds a beautiful neon glow intensity' },
                { id: 'blur', label: 'Soft Focus', desc: 'Slightly blurs the background' },
                { id: 'shake', label: 'Jitter Shake', desc: 'Adds dynamic viewport shaking' },
                { id: 'vignette', label: 'Vignette Cinematic', desc: 'Darkens the corners of the frame' }
              ].map(effect => (
                <button
                  key={effect.id}
                  onClick={() => {
                    if (!selectedClipId) {
                      alert('Please select a video clip on the timeline first.');
                      return;
                    }
                    if (effect.id === 'vignette') {
                      updateClip(selectedClipId, { colorAdjustments: { brightness: 100, contrast: 100, saturation: 100, temp: 0, vignette: 50 } });
                    } else {
                      alert(`Applying ${effect.label} effect (simulated).`);
                    }
                  }}
                  className="w-full text-left p-2.5 bg-[#121214] border border-[#2c2c32] hover:border-sky-500 rounded-lg transition"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-sky-400" />
                    <div>
                      <p className="text-xs font-semibold text-gray-200">{effect.label}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{effect.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Transitions Tab */}
        {activeTab === 'transitions' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#2c2c32]">
              <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400">Transitions</h3>
              <p className="text-[10px] text-gray-500 mt-0.5">Select a clip to apply transition.</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              {[
                { id: 'fade', label: 'Cross-Fade (Dissolve)', desc: 'Gradually blend in from previous clip' },
                { id: 'slide-left', label: 'Slide Left (Push)', desc: 'Slide in from right to left' },
                { id: 'slide-right', label: 'Slide Right (Push)', desc: 'Slide in from left to right' },
                { id: 'zoom', label: 'Zoom In', desc: 'Scale up clip from center' },
                { id: 'clear', label: 'Clear Transitions', desc: 'Remove transition settings' }
              ].map(trans => (
                <button
                  key={trans.id}
                  onClick={() => handleApplyTransition(trans.id)}
                  className="w-full text-left p-2.5 bg-[#121214] border border-[#2c2c32] hover:border-sky-500 rounded-lg transition"
                >
                  <p className="text-xs font-semibold text-gray-200">{trans.label}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{trans.desc}</p>
                </button>
              ))}
            </div>
          </div>
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
