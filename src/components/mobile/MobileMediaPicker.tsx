import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, ChevronDown, Loader2, Upload, Music } from 'lucide-react';
import { db, type Asset } from '../../lib/db';
import { useEditorStore } from '../../store/editorStore';
import { saveFileToOPFS } from '../../lib/opfs';
import { getMediaMetadata } from '../../lib/media-metadata';

interface MobileMediaPickerProps {
  onClose: () => void;
  onAdd: (selectedAssets: Asset[]) => void;
}

export default function MobileMediaPicker({ onClose, onAdd }: MobileMediaPickerProps) {
  const currentProjectId = useEditorStore(state => state.currentProjectId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'video' | 'photo' | 'audio'>('video');
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [thumbnailCache, setThumbnailCache] = useState<Record<string, string>>({});

  // Query assets for the current project
  const assets = useLiveQuery(
    () => db.assets.where('projectId').equals(currentProjectId || '').toArray(),
    [currentProjectId]
  ) || [];

  // Filter assets based on activeTab
  const filteredAssets = assets.filter(asset => {
    if (activeTab === 'video') return asset.type.startsWith('video/');
    if (activeTab === 'photo') return asset.type.startsWith('image/');
    if (activeTab === 'audio') return asset.type.startsWith('audio/');
    return false;
  });

  // Memoize assets mapping to avoid redundant effect re-runs
  const assetsSerialized = assets.map(a => `${a.id}:${thumbnailCache[a.id] ? 'y' : 'n'}`).join(',');

  // Extract thumbnails for video and image assets
  useEffect(() => {
    assets.forEach(async (asset) => {
      if (thumbnailCache[asset.id]) return;
      if (asset.type.startsWith('audio/')) return;
      try {
        const { getFileFromOPFS } = await import('../../lib/opfs');
        const file = await getFileFromOPFS(asset.opfsPath);
        const objectUrl = URL.createObjectURL(file);

        if (asset.type.startsWith('image/')) {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const aspect = img.naturalWidth / (img.naturalHeight || 1);
            canvas.height = 100;
            canvas.width = Math.round(100 * aspect);
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              setThumbnailCache(prev => ({ ...prev, [asset.id]: canvas.toDataURL('image/jpeg', 0.6) }));
            }
            URL.revokeObjectURL(objectUrl);
          };
          img.src = objectUrl;
        } else {
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
            const aspect = (video.videoWidth || 160) / (video.videoHeight || 90);
            canvas.height = 100;
            canvas.width = Math.round(100 * aspect);
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              setThumbnailCache(prev => ({ ...prev, [asset.id]: canvas.toDataURL('image/jpeg', 0.6) }));
            }
            URL.revokeObjectURL(objectUrl);
            video.remove();
          };
        }
      } catch (e) {
        console.warn('Failed to extract thumbnail in MobileMediaPicker:', e);
      }
    });
  }, [assetsSerialized]);

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

        let durationMs = 5000; // default for images
        let width: number | undefined;
        let height: number | undefined;

        if (file.type.startsWith('image/')) {
          await new Promise<void>((resolve) => {
            const img = new Image();
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
        // Auto select newly uploaded file
        setSelectedAssetIds(prev => [...prev, assetId]);
      } catch (error) {
        console.error('Failed to import file:', error);
      }
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleSelect = (id: string) => {
    setSelectedAssetIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const getSelectedIndex = (id: string) => {
    const index = selectedAssetIds.indexOf(id);
    return index !== -1 ? index + 1 : null;
  };

  const formatDuration = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const handleAddSelected = () => {
    const selectedAssets = selectedAssetIds
      .map(id => assets.find(a => a.id === id))
      .filter((x): x is Asset => !!x);
    onAdd(selectedAssets);
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 text-zinc-100 flex flex-col safe-bottom-padding animate-slide-up">
      {/* Top Header */}
      <div className="flex justify-between items-center px-4 py-3.5 border-b border-zinc-900 bg-zinc-950">
        <button onClick={onClose} className="p-1 hover:bg-zinc-900 rounded-lg text-zinc-400">
          <X className="w-5 h-5" />
        </button>
        <button className="flex items-center gap-1 text-xs font-semibold text-zinc-200 px-3 py-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 transition">
          Recents <ChevronDown className="w-3.5 h-3.5" />
        </button>
        <button className="text-xs font-semibold text-sky-400 hover:text-sky-300">
          Stock videos
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-900 bg-zinc-950">
        {[
          { id: 'video', label: 'Videos' },
          { id: 'photo', label: 'Photos' },
          { id: 'audio', label: 'Audio' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 text-center py-3 text-xs font-bold transition border-b-2 relative ${
              activeTab === tab.id
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <button
          onClick={() => alert('Live photos are simulated. Use Photos tab to select images.')}
          className="flex-1 text-center py-3 text-xs font-bold text-zinc-400 hover:text-zinc-200"
        >
          Live Photos
        </button>
      </div>

      {/* Media Grid */}
      <div className="flex-1 overflow-y-auto p-2 bg-zinc-950">
        {isUploading ? (
          <div className="flex flex-col items-center justify-center h-48 text-zinc-500">
            <Loader2 className="w-8 h-8 animate-spin mb-2 text-sky-500" />
            <p className="text-xs">Importing files to sandbox...</p>
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Upload className="w-10 h-10 text-zinc-700 mb-2" />
            <p className="text-xs font-bold text-zinc-400">No {activeTab}s imported yet</p>
            <p className="text-[10px] text-zinc-550 mt-1 max-w-[200px]">
              Tap "Import Media" below to select files from your phone or device.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 pb-20">
            {filteredAssets.map(asset => {
              const selectedIdx = getSelectedIndex(asset.id);
              const thumbnail = thumbnailCache[asset.id];
              return (
                <div
                  key={asset.id}
                  onClick={() => toggleSelect(asset.id)}
                  className="aspect-square bg-zinc-900 border border-zinc-850 rounded-lg relative overflow-hidden group cursor-pointer active:scale-95 transition-transform duration-100"
                >
                  {asset.type.startsWith('audio/') ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900 border border-zinc-800">
                      <Music className="w-6 h-6 text-zinc-600 mb-1" />
                      <span className="text-[9px] text-zinc-500 max-w-full truncate px-1">{asset.name}</span>
                    </div>
                  ) : thumbnail ? (
                    <img src={thumbnail} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-650 bg-zinc-950">
                      Loading...
                    </div>
                  )}

                  {/* Selection Circle */}
                  <div className="absolute top-1.5 right-1.5 z-10">
                    {selectedIdx ? (
                      <div className="w-5 h-5 rounded-full bg-sky-500 border border-sky-400 flex items-center justify-center text-[10px] font-bold text-white shadow">
                        {selectedIdx}
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full border border-white/60 bg-black/35 hover:bg-black/55 transition" />
                    )}
                  </div>

                  {/* Duration label (Videos only) */}
                  {asset.type.startsWith('video/') && (
                    <div className="absolute bottom-1 right-1 px-1 bg-black/75 rounded text-[8px] font-mono text-zinc-200">
                      {formatDuration(asset.durationMs)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Control Bar */}
      <div className="border-t border-zinc-900 bg-zinc-950 p-4 flex justify-between items-center fixed bottom-0 inset-x-0 safe-bottom-padding z-30">
        <div className="flex gap-2">
          <label className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 transition cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-sky-400" />
            Import Media
            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept={activeTab === 'video' ? 'video/*' : activeTab === 'photo' ? 'image/*' : 'audio/*,audio/mp3,audio/wav,audio/m4a,.mp3,.wav,.m4a'}
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>
        <button
          onClick={handleAddSelected}
          disabled={selectedAssetIds.length === 0}
          className="px-6 py-2.5 text-xs font-bold rounded-xl text-white bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:hover:bg-sky-500 transition shadow-lg shadow-sky-500/15"
        >
          Add {selectedAssetIds.length > 0 ? `(${selectedAssetIds.length})` : ''}
        </button>
      </div>
    </div>
  );
}
