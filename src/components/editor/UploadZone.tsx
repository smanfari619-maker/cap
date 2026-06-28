import React, { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Upload, Plus, Film, Music, Loader2, Trash2 } from 'lucide-react';
import { db, type Asset } from '../../lib/db';
import { useEditorStore } from '../../store/editorStore';
import { saveFileToOPFS, deleteFileFromOPFS } from '../../lib/opfs';
import { getMediaMetadata } from '../../lib/media-metadata';

export default function UploadZone() {
  const currentProjectId = useEditorStore(state => state.currentProjectId);
  const addClip = useEditorStore(state => state.addClip);
  const currentTime = useEditorStore(state => state.currentTime);
  const project = useEditorStore(state => state.project);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Fetch assets of the current project
  const assets = useLiveQuery(
    () => db.assets.where('projectId').equals(currentProjectId || '').toArray(),
    [currentProjectId]
  ) || [];

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

        // 1. Save file to OPFS
        await saveFileToOPFS(opfsPath, file);

        // 2. Extract metadata
        const metadata = await getMediaMetadata(file);

        // 3. Write asset to Dexie
        const newAsset: Asset = {
          id: assetId,
          projectId: currentProjectId,
          name: file.name,
          size: file.size,
          type: file.type,
          durationMs: metadata.durationMs || 5000, // fallback 5s
          width: metadata.width,
          height: metadata.height,
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
    
    // Choose appropriate track type
    const isAudio = asset.type.startsWith('audio/');
    const trackType = isAudio ? 'audio' : 'video';
    
    // Find the first track matching the type
    const track = project.tracks.find(t => t.type === trackType);
    if (!track) return;

    // Create timeline clip
    const clipId = Math.random().toString(36).substring(2, 9);
    const newClip = {
      id: clipId,
      assetId: asset.id,
      type: trackType as 'video' | 'audio',
      name: asset.name,
      durationMs: asset.durationMs,
      trimStartMs: 0,
      trimEndMs: asset.durationMs,
      positionMs: currentTime
    };

    await addClip(track.id, newClip);
  };

  const handleDeleteAsset = async (asset: Asset, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete ${asset.name}? This will remove it from the project library and delete the file from your local storage.`)) {
      // Delete file from OPFS
      await deleteFileFromOPFS(asset.opfsPath);
      // Delete asset record from Dexie
      await db.assets.delete(asset.id);
    }
  };

  const formatDuration = (ms: number) => {
    const sec = Math.floor(ms / 1000) % 60;
    const min = Math.floor(ms / 60000);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full border-r border-zinc-800 bg-zinc-900/50 w-80 text-zinc-200">
      {/* Upload Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <h3 className="font-bold text-sm">Media Library</h3>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-zinc-800 hover:bg-zinc-800 disabled:opacity-50 text-violet-400 border border-zinc-800 rounded-lg transition"
        >
          {isUploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Upload className="w-3.5 h-3.5" />
          )}
          Import
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          multiple
          accept="video/*,audio/*"
          className="hidden"
        />
      </div>

      {/* Asset List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 border border-dashed border-zinc-800 rounded-xl text-center p-4">
            <Film className="w-8 h-8 text-zinc-700 mb-2" />
            <p className="text-xs text-zinc-500 font-semibold">Media Library Empty</p>
            <p className="text-[10px] text-zinc-600 mt-1 max-w-xs leading-relaxed">
              Import MP4, MOV, WebM or MP3/WAV files to start editing.
            </p>
          </div>
        ) : (
          assets.map(asset => {
            const isAudio = asset.type.startsWith('audio/');
            return (
              <div
                key={asset.id}
                className="group relative flex items-center gap-3 p-2 bg-zinc-900/80 border border-zinc-800 rounded-lg hover:border-zinc-800 transition"
              >
                {/* Media Icon Preview */}
                <div className="flex items-center justify-center w-12 h-12 bg-zinc-800 rounded-md text-zinc-500 border border-zinc-800 flex-shrink-0">
                  {isAudio ? <Music className="w-5 h-5 text-emerald-400" /> : <Film className="w-5 h-5 text-sky-400" />}
                </div>

                {/* Metadata */}
                <div className="flex-1 min-w-0 pr-6">
                  <p className="text-xs font-bold text-zinc-300 truncate" title={asset.name}>
                    {asset.name}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    {formatDuration(asset.durationMs)}
                    {asset.width && asset.height ? ` • ${asset.width}x${asset.height}` : ''}
                  </p>
                </div>

                {/* Hover Add & Delete Actions */}
                <div className="absolute right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition bg-zinc-900/90 pl-2">
                  <button
                    onClick={() => handleAddToTimeline(asset)}
                    title="Add to timeline"
                    className="p-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-md transition shadow"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleDeleteAsset(asset, e)}
                    title="Delete permanently"
                    className="p-1.5 hover:bg-zinc-800 text-zinc-500 hover:text-red-400 rounded-md transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
