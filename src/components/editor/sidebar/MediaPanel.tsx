import React, { useRef, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Upload, Plus, Loader2, Search, ImageIcon, LayoutGrid, List, ArrowUpDown, Filter, Check } from 'lucide-react';
import { db, type Asset } from '../../../lib/db';
import { useEditorStore } from '../../../store/editorStore';
import { saveFileToOPFS, deleteFileFromOPFS, getFileFromOPFS } from '../../../lib/opfs';
import { getMediaMetadata } from '../../../lib/media-metadata';
import { generateWaveformPeaks } from '../../../lib/waveform-generator';

interface MediaPanelProps {
  activeTab: string;
  selectedClipId: string | null;
  setSelectedClipId: (id: string | null) => void;
}

export default function MediaPanel({ activeTab, selectedClipId: _selectedClipId, setSelectedClipId }: MediaPanelProps) {
  const currentProjectId = useEditorStore(state => state.currentProjectId);
  const addClip = useEditorStore(state => state.addClip);
  const addTrack = useEditorStore(state => state.addTrack);
  const project = useEditorStore(state => state.project);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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
  }, [assets]);

  // Extract thumbnails for video and image assets
  const assetIds = assets.map(a => a.id).join(',');
  useEffect(() => {
    assetsRef.current.forEach(async (asset) => {
      if (thumbnailCacheRef.current[asset.id]) return;
      if (asset.type.startsWith('audio/')) return;
      try {
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

        let durationMs = 5000; // default 5s for images
        let width: number | undefined;
        let height: number | undefined;

        if (file.type.startsWith('image/')) {
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

        let waveformPeaks: number[] | undefined;
        if (!file.type.startsWith('image/')) {
          waveformPeaks = await generateWaveformPeaks(opfsPath);
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
          waveformPeaks,
          createdAt: new Date()
        };

        await db.assets.put(newAsset);
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
      const updatedProject = useEditorStore.getState().project;
      track = updatedProject?.tracks.find(t => t.type === trackType);
      if (!track) return;
    }

    // Place at playhead or end of track
    const positionMs = useEditorStore.getState().currentTime;

    const clipId = `clip-${Math.random().toString(36).substring(2, 9)}`;
    const newClip = {
      id: clipId,
      assetId: asset.id,
      type: clipType as 'video' | 'audio' | 'image',
      name: asset.name,
      durationMs: asset.durationMs,
      trimStartMs: 0,
      trimEndMs: 0,
      positionMs,
      trackId: track.id,
      volume: 100,
      speed: 1.0
    };

    await addClip(track.id, newClip);
    setSelectedClipId(clipId);
  };

  const formatDuration = (ms: number) => {
    const sec = Math.floor(ms / 1000) % 60;
    const min = Math.floor(ms / 60000);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Action Bar */}
      <div className="p-3 border-b border-[#2c2c32] space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded text-[11px] font-bold shadow transition cursor-pointer disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                Import Media
              </>
            )}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            accept="video/*,audio/*,image/*"
            className="hidden"
          />

          {/* Toggle view mode */}
          <button
            onClick={() => setViewMode(prev => prev === 'grid' ? 'list' : 'grid')}
            title={viewMode === 'grid' ? 'Switch to List View' : 'Switch to Grid View'}
            className="p-2 bg-[#1e1e22] border border-[#2c2c32] rounded text-gray-400 hover:text-gray-200 transition cursor-pointer"
          >
            {viewMode === 'grid' ? <List className="w-3.5 h-3.5" /> : <LayoutGrid className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Search & Sort & Filter controls */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-gray-500" />
            <input
              type="text"
              placeholder="Search library..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#121214] border border-[#2c2c32] rounded pl-7 pr-3 py-1 text-[10px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-sky-500 transition"
            />
          </div>

          {/* Sort dropdown toggle */}
          <div className="relative">
            <button
              onClick={() => {
                setShowSortDropdown(!showSortDropdown);
                setShowFilterDropdown(false);
              }}
              title="Sort assets"
              className={`p-1.5 border rounded transition cursor-pointer ${sortBy !== 'created' || sortOrder !== 'asc' ? 'border-sky-500/40 text-sky-400 bg-sky-950/10' : 'border-[#2c2c32] text-gray-400 bg-[#1e1e22] hover:text-gray-200'}`}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
            </button>
            {showSortDropdown && (
              <div className="absolute right-0 mt-1 w-32 bg-[#1c1c20] border border-[#2c2c32] rounded shadow-xl py-1 z-35 text-[10px]">
                <button
                  onClick={() => {
                    setSortBy('created');
                    setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                    setShowSortDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-[#2a2a30] transition flex items-center justify-between cursor-pointer ${sortBy === 'created' ? 'text-sky-400 font-bold' : 'text-gray-300'}`}
                >
                  Date Imported {sortBy === 'created' && (sortOrder === 'asc' ? '↑' : '↓')}
                </button>
                <button
                  onClick={() => {
                    setSortBy('name');
                    setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                    setShowSortDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-[#2a2a30] transition flex items-center justify-between cursor-pointer ${sortBy === 'name' ? 'text-sky-400 font-bold' : 'text-gray-300'}`}
                >
                  Name {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                </button>
                <button
                  onClick={() => {
                    setSortBy('duration');
                    setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                    setShowSortDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-[#2a2a30] transition flex items-center justify-between cursor-pointer ${sortBy === 'duration' ? 'text-sky-400 font-bold' : 'text-gray-300'}`}
                >
                  Duration {sortBy === 'duration' && (sortOrder === 'asc' ? '↑' : '↓')}
                </button>
              </div>
            )}
          </div>

          {/* Filter dropdown toggle */}
          <div className="relative">
            <button
              onClick={() => {
                setShowFilterDropdown(!showFilterDropdown);
                setShowSortDropdown(false);
              }}
              title="Filter assets"
              className={`p-1.5 border rounded transition cursor-pointer ${filterType !== 'all' ? 'border-sky-500/40 text-sky-400 bg-sky-950/10' : 'border-[#2c2c32] text-gray-400 bg-[#1e1e22] hover:text-gray-200'}`}
            >
              <Filter className="w-3.5 h-3.5" />
            </button>
            {showFilterDropdown && (
              <div className="absolute right-0 mt-1 w-28 bg-[#1c1c20] border border-[#2c2c32] rounded shadow-xl py-1 z-35 text-[10px]">
                {['all', 'video', 'audio', 'image'].map(type => (
                  <button
                    key={type}
                    onClick={() => {
                      setFilterType(type as any);
                      setShowFilterDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-[#2a2a30] transition capitalize cursor-pointer ${filterType === type ? 'text-sky-400 font-bold' : 'text-gray-300'}`}
                  >
                    {type}s
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Media Files list/grid */}
      <div
        ref={containerRefMedia}
        onMouseDown={handleContainerMouseDown}
        onContextMenu={handleContextMenu}
        className="flex-1 overflow-y-auto p-3 custom-scrollbar relative select-none"
      >
        {/* Selection Box Render (Marquee selection) */}
        {marqueeBox && (
          <div
            className="absolute border border-sky-500 bg-sky-500/10 rounded pointer-events-none z-40"
            style={{
              left: Math.min(marqueeBox.x1, marqueeBox.x2),
              top: Math.min(marqueeBox.y1, marqueeBox.y2),
              width: Math.abs(marqueeBox.x2 - marqueeBox.x1),
              height: Math.abs(marqueeBox.y2 - marqueeBox.y1)
            }}
          />
        )}

        {filteredAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <ImageIcon className="w-8 h-8 text-gray-700 mb-2.5" />
            <p className="text-xs text-gray-500 font-semibold">Your Media Library is Empty</p>
            <p className="text-[10px] text-gray-600 mt-1 max-w-[170px] leading-relaxed">
              Drag & drop media files here or click "Import Media" to start.
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-2 pb-6">
            {filteredAssets.map(asset => {
              const isAdded = isAssetAdded(asset.id);
              const isSelected = selectedAssetIds.includes(asset.id);
              return (
                <div
                  key={asset.id}
                  data-asset-id={asset.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/cap-asset-id', asset.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  className={`group relative rounded-lg overflow-hidden border transition bg-[#121214] select-none ${isSelected ? 'border-sky-500 shadow-md shadow-sky-500/15' : 'border-[#2c2c32] hover:border-gray-500'}`}
                >
                  {/* Thumbnail / Placeholder */}
                  <div className="h-20 w-full relative overflow-hidden bg-zinc-950 flex items-center justify-center">
                    {thumbnailCache[asset.id] ? (
                      <img
                        src={thumbnailCache[asset.id]}
                        alt={asset.name}
                        className="w-full h-full object-cover pointer-events-none"
                      />
                    ) : asset.type.startsWith('audio/') ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xl">🎵</span>
                        <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">Audio File</span>
                      </div>
                    ) : (
                      <div className="w-full h-full animate-pulse bg-zinc-900" />
                    )}

                    {/* Badge / Indicators */}
                    {isAdded && (
                      <div className="absolute top-1 left-1 bg-green-600/90 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow flex items-center gap-0.5">
                        <Check className="w-2.5 h-2.5" /> Added
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-4.5 h-4.5 bg-sky-500 rounded-full flex items-center justify-center shadow border border-sky-400 z-10">
                        <Check className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}

                    {/* Duration badge */}
                    {asset.durationMs > 0 && (
                      <div className="absolute bottom-1 right-1 bg-black/75 px-1 py-0.5 rounded font-mono text-[8px] text-gray-300">
                        {formatDuration(asset.durationMs)}
                      </div>
                    )}

                    {/* Quick Add Overlay Button */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1.5 z-20">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddToTimeline(asset);
                        }}
                        className="p-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg shadow cursor-pointer transform hover:scale-105 transition"
                        title="Add to Playhead"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Info footer */}
                  <div className="px-2 py-1.5 border-t border-[#2c2c32]/50 bg-[#121214]/65">
                    <p className="text-[10px] text-gray-200 font-semibold truncate" title={asset.name}>
                      {asset.name}
                    </p>
                    <p className="text-[9px] text-gray-500 font-mono mt-0.5 truncate uppercase">
                      {asset.type.split('/')[1] || asset.type} • {(asset.size / (1024 * 1024)).toFixed(1)}MB
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="space-y-1.5 pb-6">
            {filteredAssets.map(asset => {
              const isAdded = isAssetAdded(asset.id);
              const isSelected = selectedAssetIds.includes(asset.id);
              return (
                <div
                  key={asset.id}
                  data-asset-id={asset.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/cap-asset-id', asset.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  className={`group flex items-center justify-between p-1.5 rounded-lg border transition select-none bg-[#121214] ${isSelected ? 'border-sky-500 bg-sky-950/5' : 'border-[#2c2c32] hover:border-gray-500'}`}
                >
                  <div className="flex items-center gap-2 overflow-hidden flex-1">
                    {/* Small preview thumbnail */}
                    <div className="w-10 h-7 rounded overflow-hidden bg-zinc-950 flex items-center justify-center flex-shrink-0 border border-[#2c2c32]">
                      {thumbnailCache[asset.id] ? (
                        <img src={thumbnailCache[asset.id]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[11px]">{asset.type.startsWith('audio/') ? '🎵' : '🎞️'}</span>
                      )}
                    </div>

                    <div className="overflow-hidden leading-tight flex-1">
                      <p className="text-[10px] text-gray-200 font-semibold truncate" title={asset.name}>
                        {asset.name}
                      </p>
                      <p className="text-[8px] text-gray-500 uppercase font-mono mt-0.5">
                        {asset.type.split('/')[1] || asset.type} • {(asset.size / (1024 * 1024)).toFixed(1)}MB
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                    {isAdded && (
                      <span className="text-[8px] text-green-500 font-semibold bg-green-950/20 border border-green-500/20 px-1 py-0.5 rounded">
                        Added
                      </span>
                    )}
                    {asset.durationMs > 0 && (
                      <span className="font-mono text-[8px] text-gray-400">
                        {formatDuration(asset.durationMs)}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddToTimeline(asset);
                      }}
                      className="p-1 bg-[#1e1e22] hover:bg-sky-600 border border-[#2c2c32] text-gray-400 hover:text-white rounded transition opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                      title="Add to Timeline"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Right-click Context Menu */}
        {contextMenu && (
          <div
            className="fixed bg-[#1c1c20] border border-[#2c2c32] rounded-lg shadow-2xl py-1 z-50 text-[10px] w-36"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1 border-b border-[#2c2c32] text-gray-500 font-bold uppercase tracking-wider text-[8px]">
              Asset Actions ({selectedAssetIds.length})
            </div>
            <button
              onClick={async () => {
                if (selectedAssetIds.length > 0) {
                  for (const id of selectedAssetIds) {
                    const asset = await db.assets.get(id);
                    if (asset) {
                      const isAudio = asset.type.startsWith('audio/');
                      const isImage = asset.type.startsWith('image/');
                      const clipType = isAudio ? 'audio' : isImage ? 'image' : 'video';
                      const trackType = clipType === 'image' ? 'video' : clipType;
                      let track = project?.tracks.find(t => t.type === trackType);
                      if (!track && project) {
                        await addTrack(trackType as 'video' | 'audio' | 'text');
                        const updated = useEditorStore.getState().project;
                        track = updated?.tracks.find(t => t.type === trackType);
                      }
                      if (track) {
                        await addClip(track.id, {
                          id: `clip-${Math.random().toString(36).substring(2, 9)}`,
                          assetId: asset.id,
                          type: clipType as any,
                          name: asset.name,
                          durationMs: asset.durationMs,
                          trimStartMs: 0,
                          trimEndMs: asset.durationMs,
                          positionMs: useEditorStore.getState().currentTime,
                          volume: 100,
                          speed: 1.0
                        });
                      }
                    }
                  }
                  setSelectedAssetIds([]);
                }
                setContextMenu(null);
              }}
              disabled={selectedAssetIds.length === 0}
              className="w-full text-left px-3 py-1.5 text-gray-200 hover:bg-[#2a2a30] transition disabled:opacity-45 cursor-pointer"
            >
              Add to Timeline
            </button>
            <button
              onClick={async () => {
                if (selectedAssetIds.length > 0) {
                  const confirmDelete = window.confirm(`Are you sure you want to delete the ${selectedAssetIds.length} selected asset(s) from your library? This will delete the raw files from disk and remove them from the timeline.`);
                  if (confirmDelete) {
                    for (const id of selectedAssetIds) {
                      const asset = await db.assets.get(id);
                      if (asset) {
                        try {
                          await deleteFileFromOPFS(asset.opfsPath);
                        } catch (err) {
                          console.warn('Failed to delete file from OPFS:', err);
                        }
                        const affectedTracks = project?.tracks.filter(track =>
                          track.clips.some(clip => clip.assetId === id)
                        ) || [];
                        for (const tr of affectedTracks) {
                          const clipsToRemove = tr.clips.filter(c => c.assetId === id);
                          for (const cl of clipsToRemove) {
                            await useEditorStore.getState().removeClip(cl.id);
                          }
                        }
                        await db.assets.delete(id);
                      }
                    }
                    setSelectedAssetIds([]);
                  }
                }
                setContextMenu(null);
              }}
              disabled={selectedAssetIds.length === 0}
              className="w-full text-left px-3 py-1.5 text-red-400 hover:bg-red-950/40 hover:text-red-300 transition disabled:opacity-45 cursor-pointer"
            >
              Delete Selected
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
