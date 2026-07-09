/**
 * StoryCutterTool.tsx
 * Dashboard tool — splits a long video into perfectly timed segments for social
 * media stories without re-encoding. Each segment becomes a new Project in the
 * local database with the source video and correct trim points applied.
 *
 * Improvements:
 *   - Editable duration field visible for every preset (not just Custom)
 *   - Download clip button in success popup
 *   - All segments share a folderId so they appear grouped on the Dashboard
 */

import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Scissors, Upload, X, ChevronRight, Film,
  CheckCircle, Loader2, AlertCircle, Play, Download, FolderOpen
} from 'lucide-react';
import { db } from '../../lib/db';
import { saveFileToOPFS } from '../../lib/opfs';
import { useEditorStore } from '../../store/editorStore';

// ─────────────────────────────────────────────
// Platform presets
// ─────────────────────────────────────────────

interface Preset {
  id: string;
  label: string;
  platform: string;
  segmentSec: number;
  width: number;
  height: number;
  icon: string;
  color: string;
  border: string;
  desc: string;
}

const PRESETS: Preset[] = [
  {
    id: 'instagram',
    label: 'Instagram Stories',
    platform: 'Instagram',
    segmentSec: 15,
    width: 1080,
    height: 1920,
    icon: '📸',
    color: 'from-pink-500/20 via-fuchsia-500/10 to-transparent',
    border: 'border-pink-500/30 hover:border-pink-400/60',
    desc: '15 s  •  9:16  •  Stories / Reels'
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    platform: 'TikTok',
    segmentSec: 60,
    width: 1080,
    height: 1920,
    icon: '🎵',
    color: 'from-sky-500/20 via-cyan-500/10 to-transparent',
    border: 'border-sky-500/30 hover:border-sky-400/60',
    desc: '60 s  •  9:16  •  Full TikTok'
  },
  {
    id: 'shorts',
    label: 'YouTube Shorts',
    platform: 'YouTube',
    segmentSec: 60,
    width: 1080,
    height: 1920,
    icon: '▶️',
    color: 'from-red-500/20 via-rose-500/10 to-transparent',
    border: 'border-red-500/30 hover:border-red-400/60',
    desc: '60 s  •  9:16  •  Shorts'
  },
  {
    id: 'snapchat',
    label: 'Snapchat',
    platform: 'Snapchat',
    segmentSec: 10,
    width: 1080,
    height: 1920,
    icon: '👻',
    color: 'from-yellow-500/20 via-amber-500/10 to-transparent',
    border: 'border-yellow-500/30 hover:border-yellow-400/60',
    desc: '10 s  •  9:16  •  Snap Stories'
  },
  {
    id: 'twitter',
    label: 'Twitter / X',
    platform: 'Twitter',
    segmentSec: 140,
    width: 1920,
    height: 1080,
    icon: '𝕏',
    color: 'from-zinc-500/20 via-slate-500/10 to-transparent',
    border: 'border-zinc-500/30 hover:border-zinc-400/60',
    desc: '140 s  •  16:9  •  Twitter video'
  },
  {
    id: 'custom',
    label: 'Custom',
    platform: 'Custom',
    segmentSec: 30,
    width: 1920,
    height: 1080,
    icon: '⚙️',
    color: 'from-violet-500/20 via-purple-500/10 to-transparent',
    border: 'border-violet-500/30 hover:border-violet-400/60',
    desc: 'Set your own segment duration'
  }
];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).substring(2, 9);
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = reject;
    video.src = URL.createObjectURL(file);
  });
}

// ─────────────────────────────────────────────
// Segment calculation
// ─────────────────────────────────────────────

interface Segment {
  index: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  label: string;
}

function calculateSegments(totalSec: number, segmentSec: number): Segment[] {
  const segs: Segment[] = [];
  let start = 0;
  let i = 0;
  while (start < totalSec) {
    const end = Math.min(start + segmentSec, totalSec);
    segs.push({
      index: i,
      startSec: start,
      endSec: end,
      durationSec: end - start,
      label: `Part ${i + 1} (${formatTime(start)} to ${formatTime(end)})`
    });
    start = end;
    i++;
  }
  return segs;
}

// Download the source file — browser cannot trim video containers without FFmpeg
function downloadClipFile(videoFile: File, seg: Segment, platform: string): void {
  const baseName = videoFile.name.replace(/\.[^/.]+$/, '');
  const ext = videoFile.name.split('.').pop() || 'mp4';
  const start = formatTime(seg.startSec).replace(/:/g, '-');
  const end = formatTime(seg.endSec).replace(/:/g, '-');
  const fileName = `${baseName}_${platform}_Part${seg.index + 1}_${start}_${end}.${ext}`;
  const url = URL.createObjectURL(videoFile);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ─────────────────────────────────────────────
interface StoryCutterToolProps {
  renderTrigger?: (open: () => void) => React.ReactNode;
}

interface CreatedProject {
  id: string;
  title: string;
  seg: Segment;
}

export default function StoryCutterTool({ renderTrigger }: StoryCutterToolProps = {}) {
  const loadProject = useEditorStore(state => state.loadProject);

  const [isOpen, setIsOpen] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<Preset>(PRESETS[0]);
  const [overrideDuration, setOverrideDuration] = useState<number>(PRESETS[0].segmentSec);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'splitting' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [createdProjects, setCreatedProjects] = useState<CreatedProject[]>([]);
  const [batchFolderName, setBatchFolderName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const segments: Segment[] = videoDuration
    ? calculateSegments(videoDuration, overrideDuration)
    : [];

  // ── Video file selection ─────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('video/')) {
      setErrorMsg('Please upload a video file.');
      return;
    }
    setErrorMsg('');
    setVideoFile(file);
    setVideoPreviewUrl(URL.createObjectURL(file));
    setStatus('analyzing');
    try {
      const duration = await getVideoDuration(file);
      setVideoDuration(duration);
      setStatus('idle');
    } catch {
      setErrorMsg('Could not read video metadata.');
      setStatus('error');
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleSelectPreset = (preset: Preset) => {
    setSelectedPreset(preset);
    setOverrideDuration(preset.segmentSec);
  };

  // ── Create projects ──────────────────────────────────────────────────────

  const handleSplit = async () => {
    if (!videoFile || !videoDuration || segments.length === 0) return;
    setStatus('splitting');
    setProgress(0);
    setCreatedProjects([]);

    try {
      const assetId = uid();
      const projectBaseId = uid();
      const opfsPath = `${projectBaseId}/assets/${assetId}_${videoFile.name}`;

      const batchFolderId = uid();
      const baseTitle = videoFile.name.replace(/\.[^/.]+$/, '');
      const folderName = `${baseTitle} — ${selectedPreset.platform} Cuts`;
      setBatchFolderName(folderName);

      setProgressLabel('Saving video to local storage…');
      await saveFileToOPFS(opfsPath, videoFile);
      setProgress(15);

      const preset = selectedPreset;
      const created: CreatedProject[] = [];

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const projectId = uid();
        const trackId = uid();
        const clipId = uid();
        const segAssetId = uid();
        const now = new Date();
        const title = `${baseTitle} — ${preset.platform} Part ${i + 1}`;

        await db.projects.put({
          id: projectId,
          title,
          width: preset.width,
          height: preset.height,
          fps: 30,
          folderId: batchFolderId,
          folderName,
          tracks: [
            {
              id: trackId,
              name: 'Story Segment',
              type: 'video',
              clips: [
                {
                  id: clipId,
                  trackId,
                  assetId: segAssetId,
                  type: 'video',
                  name: `${preset.platform} Part ${i + 1}`,
                  positionMs: 0,
                  durationMs: Math.round(seg.durationSec * 1000),
                  trimStartMs: Math.round(seg.startSec * 1000),
                  trimEndMs: Math.round(seg.endSec * 1000),
                }
              ],
              locked: false,
              muted: false,
              hidden: false,
            },
            { id: uid(), name: 'Text Overlay', type: 'text', clips: [], locked: false, muted: false, hidden: false },
            { id: uid(), name: 'Audio', type: 'audio', clips: [], locked: false, muted: false, hidden: false }
          ],
          createdAt: now,
          updatedAt: now,
        });

        await db.assets.put({
          id: segAssetId,
          projectId,
          name: videoFile.name,
          type: 'video',
          opfsPath,
          size: videoFile.size,
          durationMs: Math.round(videoDuration * 1000),
          createdAt: now,
        });

        created.push({ id: projectId, title, seg });
        setProgress(15 + Math.round(((i + 1) / segments.length) * 80));
        setProgressLabel(`Created: ${title}`);
        await new Promise(r => setTimeout(r, 30));
      }

      setCreatedProjects(created);
      setProgress(100);
      setStatus('done');
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while splitting.');
      setStatus('error');
    }
  };

  const reset = () => {
    setVideoFile(null);
    setVideoPreviewUrl(null);
    setVideoDuration(null);
    setStatus('idle');
    setProgress(0);
    setCreatedProjects([]);
    setBatchFolderName('');
    setErrorMsg('');
  };

  // ─────────────────────────────────────────────
  // CARD
  // ─────────────────────────────────────────────

  const card = (
    <div
      className="group relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-violet-500/10 via-sky-500/5 to-transparent p-5 cursor-pointer hover:border-violet-500/50 hover:shadow-xl hover:shadow-violet-950/20 transition duration-300"
      onClick={() => setIsOpen(true)}
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-500 bg-gradient-to-br from-violet-500/5 to-transparent pointer-events-none" />
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center group-hover:scale-110 transition duration-300">
          <Scissors className="w-5 h-5 text-violet-400" />
        </div>
        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-violet-500/20 bg-violet-500/10 text-violet-400">
          Free Tool
        </span>
      </div>
      <h3 className="font-bold text-zinc-200 group-hover:text-white text-sm transition-colors mb-1">Story Cutter</h3>
      <p className="text-[11px] text-zinc-500 leading-relaxed">
        Split long videos into perfectly timed segments for Instagram, TikTok, YouTube Shorts, and more — no quality loss.
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {['Instagram 15s', 'TikTok 60s', 'Shorts 60s', 'Snap 10s'].map(tag => (
          <span key={tag} className="text-[8px] font-semibold px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">{tag}</span>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-1 text-[10px] font-semibold text-violet-400 group-hover:gap-2 transition-all duration-200">
        <span>Open Story Cutter</span>
        <ChevronRight className="w-3.5 h-3.5" />
      </div>
    </div>
  );

  // ─────────────────────────────────────────────
  // MODAL
  // ─────────────────────────────────────────────

  const modal = isOpen && createPortal(
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in-up">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-[#111113] shadow-2xl relative flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800 sticky top-0 bg-[#111113] z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
              <Scissors className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100">Story Cutter</h2>
              <p className="text-[10px] text-zinc-500">Split long videos into platform-ready story segments</p>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-6">

          {/* STEP 1: Upload */}
          {status !== 'done' && (
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-3">① Upload Your Video</p>
              {!videoFile ? (
                <label
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition cursor-pointer ${isDragging ? 'border-violet-500 bg-violet-600/5' : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/20'}`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition ${isDragging ? 'bg-violet-500/20 scale-110' : 'bg-zinc-900'}`}>
                    <Upload className={`w-6 h-6 ${isDragging ? 'text-violet-400' : 'text-zinc-500'}`} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-300">Drop your video here</p>
                    <p className="text-xs text-zinc-500 mt-1">MP4, MOV, WebM, AVI — any length</p>
                  </div>
                  <span className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition">Choose File</span>
                  <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                </label>
              ) : (
                <div className="flex gap-3 items-center bg-zinc-900/40 border border-zinc-800 rounded-xl p-3">
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-950 flex items-center justify-center shrink-0">
                    {videoPreviewUrl ? <video src={videoPreviewUrl} className="w-full h-full object-cover" muted playsInline /> : <Film className="w-6 h-6 text-zinc-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-zinc-200 truncate">{videoFile.name}</p>
                    {videoDuration !== null && (
                      <p className="text-[10px] text-zinc-500 mt-1">
                        Duration: <span className="text-sky-400 font-mono font-bold">{formatTime(videoDuration)}</span> ({Math.ceil(videoDuration)} s)
                      </p>
                    )}
                    <p className="text-[9px] text-zinc-600 mt-0.5">{(videoFile.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                  <button onClick={reset} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-600 hover:text-red-400 transition cursor-pointer shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {status === 'analyzing' && (
                <div className="flex items-center gap-2 mt-2 text-[10px] text-zinc-400">
                  <Loader2 className="w-3 h-3 animate-spin text-violet-400" /> Reading video metadata…
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Platform preset */}
          {videoFile && videoDuration !== null && status === 'idle' && (
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-3">② Choose Platform</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset)}
                    className={`rounded-xl border p-3 text-left transition cursor-pointer bg-gradient-to-br ${preset.color} ${selectedPreset.id === preset.id ? 'border-violet-500 ring-1 ring-violet-500/40' : preset.border}`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-base leading-none">{preset.icon}</span>
                      <span className="text-[10px] font-bold text-zinc-200">{preset.label}</span>
                    </div>
                    <p className="text-[9px] text-zinc-500">{preset.desc}</p>
                  </button>
                ))}
              </div>

              {/* Editable segment duration — visible for all presets */}
              <div className="mt-3 flex items-center gap-3 bg-zinc-900/40 border border-zinc-800 rounded-xl p-3">
                <label className="text-[10px] text-zinc-400 font-semibold shrink-0">Segment length:</label>
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={overrideDuration}
                  onChange={(e) => setOverrideDuration(Math.max(1, parseInt(e.target.value) || selectedPreset.segmentSec))}
                  className="w-20 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-violet-500"
                />
                <span className="text-[10px] text-zinc-500">seconds</span>
                {overrideDuration !== selectedPreset.segmentSec && (
                  <button
                    onClick={() => setOverrideDuration(selectedPreset.segmentSec)}
                    className="text-[9px] text-violet-400 hover:text-violet-300 underline cursor-pointer ml-1"
                  >
                    Reset to {selectedPreset.segmentSec}s
                  </button>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Segment preview */}
          {segments.length > 0 && status === 'idle' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  ③ Preview Segments — {segments.length} parts
                </p>
                <span className="text-[9px] text-zinc-500">{overrideDuration}s each • {selectedPreset.width}×{selectedPreset.height}</span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                {segments.map((seg) => (
                  <div key={seg.index} className="flex items-center gap-3 rounded-lg bg-zinc-900/50 border border-zinc-800/60 px-3 py-2">
                    <div className="w-6 h-6 rounded-full bg-violet-600/20 border border-violet-500/20 flex items-center justify-center shrink-0">
                      <span className="text-[9px] font-bold text-violet-400">{seg.index + 1}</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-semibold text-zinc-300">Part {seg.index + 1}</p>
                      <p className="text-[9px] text-zinc-600 font-mono">
                        {formatTime(seg.startSec)} → {formatTime(seg.endSec)}
                        <span className="ml-2 text-sky-500">{seg.durationSec.toFixed(1)}s</span>
                      </p>
                    </div>
                    <div className="w-24 h-1.5 rounded-full bg-zinc-800 overflow-hidden shrink-0">
                      <div
                        className="h-full bg-violet-500 rounded-full"
                        style={{ marginLeft: `${(seg.startSec / (videoDuration ?? 1)) * 100}%`, width: `${(seg.durationSec / (videoDuration ?? 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SPLITTING PROGRESS */}
          {status === 'splitting' && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-violet-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-zinc-200">Creating projects…</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{progressLabel}</p>
                </div>
              </div>
              <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-violet-500 to-sky-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-right text-[10px] font-mono text-zinc-500">{progress}%</p>
            </div>
          )}

          {/* DONE */}
          {status === 'done' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-900/40 bg-emerald-950/20">
                <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-300">
                    {createdProjects.length} Segment{createdProjects.length !== 1 ? 's' : ''} Created!
                  </p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    Saved to folder <span className="text-violet-400 font-semibold">{batchFolderName}</span> on your dashboard.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-violet-900/40 bg-violet-950/20">
                <FolderOpen className="w-4 h-4 text-violet-400 shrink-0" />
                <p className="text-[10px] text-zinc-400 flex-1 truncate">
                  All segments are grouped under <span className="text-violet-300 font-semibold">{batchFolderName}</span>
                </p>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                {createdProjects.map((proj, i) => (
                  <div key={proj.id} className="group flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 p-3 transition">
                    <div className="w-8 h-8 rounded-full bg-violet-600/20 border border-violet-500/20 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold text-violet-400">{i + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-zinc-300 truncate group-hover:text-white transition-colors">{proj.title}</p>
                      <p className="text-[9px] text-zinc-600 font-mono mt-0.5">
                        {formatTime(proj.seg.startSec)} → {formatTime(proj.seg.endSec)}
                        <span className="ml-1.5 text-sky-600">{proj.seg.durationSec.toFixed(1)}s</span>
                      </p>
                    </div>
                    <button
                      onClick={() => videoFile && downloadClipFile(videoFile, proj.seg, selectedPreset.platform)}
                      title="Download source file"
                      className="p-1.5 rounded-lg hover:bg-emerald-950/40 text-zinc-500 hover:text-emerald-400 transition cursor-pointer shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { setIsOpen(false); loadProject(proj.id); }}
                      title="Open in editor"
                      className="flex items-center gap-1 text-[9px] text-violet-400 font-semibold px-2 py-1 rounded-lg border border-violet-900/40 bg-violet-950/20 hover:bg-violet-900/30 transition cursor-pointer shrink-0"
                    >
                      <Play className="w-3 h-3" /> Open
                    </button>
                  </div>
                ))}
              </div>

              <button onClick={reset} className="w-full py-2.5 rounded-xl border border-zinc-800 hover:border-zinc-700 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition cursor-pointer">
                Cut Another Video
              </button>
            </div>
          )}

          {/* ERROR */}
          {errorMsg && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-950/20 border border-red-900/40">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{errorMsg}</p>
            </div>
          )}
        </div>

        {/* Footer CTA */}
        {status === 'idle' && segments.length > 0 && (
          <div className="p-5 border-t border-zinc-800 bg-[#111113] sticky bottom-0">
            <button
              onClick={handleSplit}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-sky-600 hover:from-violet-500 hover:to-sky-500 text-white font-bold text-sm transition shadow-lg shadow-violet-950/30 cursor-pointer flex items-center justify-center gap-2"
            >
              <Scissors className="w-4 h-4" />
              Split into {segments.length} Story Segment{segments.length !== 1 ? 's' : ''}
            </button>
            <p className="text-center text-[9px] text-zinc-600 mt-2">
              Quality preserved. No re-encoding. Segments saved in a folder.
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );

  return (
    <>
      {renderTrigger ? renderTrigger(() => setIsOpen(true)) : card}
      {modal}
    </>
  );
}
