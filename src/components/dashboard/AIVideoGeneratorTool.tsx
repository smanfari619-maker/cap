import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Sparkles, X, Plus, Trash2, ChevronDown, ChevronUp,
  Play, Download, RotateCcw, ArrowRight, Loader2,
  Settings, Key, AlertCircle, CheckCircle,
  Film, Image, Layers, Volume2, Camera, DollarSign,
  GripVertical, ExternalLink, Copy, Check
} from 'lucide-react';
import {
  generateVideo, estimateCost, getFalApiKey, setFalApiKey, clearFalApiKey,
  PROVIDERS, CAMERA_PRESETS, STYLE_PRESETS,
  type VideoProvider, type GenerationMode, type GenerationResult,
  type ShotDefinition, type GenerationSettings, type AspectRatio,
  type VideoDuration, type VideoResolution
} from '../../lib/ai-video-generator';
import { db } from '../../lib/db';
import { saveFileToOPFS } from '../../lib/opfs';
import { useEditorStore } from '../../store/editorStore';

// ─── Shared Styles ─────────────────────────────────────────────────────────────
const inputCls = 'w-full bg-[#111113] border border-[#2c2c32] rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-white/40 transition resize-none';
const selectCls = 'bg-[#111113] border border-[#2c2c32] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-white/40 transition cursor-pointer';
const btnPrimary = 'flex items-center gap-2 px-4 py-2 bg-white text-black text-xs font-bold rounded-lg hover:bg-zinc-200 transition disabled:opacity-40 disabled:cursor-not-allowed';
const btnSecondary = 'flex items-center gap-2 px-3 py-1.5 bg-[#1e1e22] border border-[#2c2c32] text-zinc-300 text-xs font-semibold rounded-lg hover:bg-[#252529] transition disabled:opacity-40 disabled:cursor-not-allowed';

// ─── API Key Modal ─────────────────────────────────────────────────────────────
function ApiKeyModal({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState('');
  const [copied, setCopied] = useState(false);

  const handleSave = () => {
    if (key.trim()) {
      setFalApiKey(key.trim());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#111113] border border-[#2c2c32] rounded-2xl p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Key className="w-4 h-4 text-white" />
            <span className="font-bold text-sm text-white">fal.ai API Key Required</span>
          </div>
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-white transition cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-[#181818] border border-[#2a2a2f] rounded-xl p-4 flex flex-col gap-3">
          <p className="text-xs text-zinc-400 leading-relaxed">
            JellyCut uses <strong className="text-zinc-200">fal.ai</strong> as the gateway for AI video generation. 
            It's free to sign up and you only pay for what you generate.
          </p>
          <ol className="text-xs text-zinc-500 flex flex-col gap-1.5 list-decimal list-inside">
            <li>Go to <a href="https://fal.ai" target="_blank" rel="noreferrer" className="text-white underline underline-offset-2 hover:no-underline">fal.ai ↗</a> and create a free account</li>
            <li>Navigate to <strong className="text-zinc-300">Settings → API Keys</strong></li>
            <li>Create a new key and paste it below</li>
          </ol>
          <p className="text-[10px] text-zinc-600">
            Your key is stored locally in your browser only — never sent to JellyCut servers.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">Your fal.ai API Key</label>
          <input
            type="password"
            value={key}
            onChange={e => setKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="fal-..."
            className={inputCls}
          />
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className={btnSecondary}>Cancel</button>
          <button onClick={handleSave} disabled={!key.trim()} className={btnPrimary}>
            <Check className="w-3.5 h-3.5" />
            Save Key
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shot Card (Multi-Shot Builder) ───────────────────────────────────────────
function ShotCard({
  shot,
  index,
  total,
  onChange,
  onRemove,
}: {
  shot: ShotDefinition;
  index: number;
  total: number;
  onChange: (s: ShotDefinition) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start gap-2 group">
      <div className="flex items-center gap-1.5 pt-2.5 text-zinc-600 cursor-grab active:cursor-grabbing">
        <GripVertical className="w-3.5 h-3.5" />
        <span className="text-[10px] font-mono w-4 text-center">{index + 1}</span>
      </div>
      <div className="flex-1 bg-[#111113] border border-[#2c2c32] rounded-lg p-3 flex flex-col gap-2">
        <textarea
          value={shot.description}
          onChange={e => onChange({ ...shot, description: e.target.value })}
          placeholder={`Shot ${index + 1} — describe the scene, action, mood...`}
          rows={2}
          className={`${inputCls} text-[11px]`}
        />
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-zinc-500 whitespace-nowrap">Duration:</label>
          <select
            value={shot.durationSec}
            onChange={e => onChange({ ...shot, durationSec: Number(e.target.value) })}
            className={`${selectCls} text-[10px] flex-1`}
          >
            {[2, 3, 4, 5].map(d => (
              <option key={d} value={d}>{d}s</option>
            ))}
          </select>
        </div>
      </div>
      <button
        onClick={onRemove}
        disabled={total <= 1}
        className="pt-2.5 text-zinc-700 hover:text-red-400 transition disabled:opacity-20 cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Result Card ──────────────────────────────────────────────────────────────
function ResultCard({
  result,
  onSendToTimeline,
  onDownload,
  onRetry,
}: {
  result: GenerationResult;
  onSendToTimeline: (r: GenerationResult) => void;
  onDownload: (r: GenerationResult) => void;
  onRetry: (r: GenerationResult) => void;
}) {
  const providerMeta = PROVIDERS.find(p => p.id === result.provider);
  const isCompleted = result.status === 'completed';
  const isFailed = result.status === 'failed';
  const isProcessing = !isCompleted && !isFailed;

  return (
    <div className={`border rounded-xl overflow-hidden transition ${isFailed ? 'border-red-900/50 bg-red-950/10' : 'border-[#2c2c32] bg-[#111113]'}`}>
      {/* Thumbnail / Progress */}
      <div className="relative bg-[#0a0a0c] aspect-video flex items-center justify-center">
        {isCompleted && result.videoUrl ? (
          <video
            src={result.videoUrl}
            className="w-full h-full object-cover"
            controls
            muted
            loop
            playsInline
          />
        ) : isProcessing ? (
          <div className="flex flex-col items-center gap-3 p-4 w-full">
            <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
            <div className="w-full bg-[#1e1e22] rounded-full h-1">
              <div
                className="bg-white h-1 rounded-full transition-all duration-500"
                style={{ width: `${result.progress ?? 0}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-500 capitalize">{result.status}… {result.progress ?? 0}%</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 p-4">
            <AlertCircle className="w-6 h-6 text-red-400" />
            <span className="text-[10px] text-red-400 text-center">{result.errorMessage || 'Generation failed'}</span>
          </div>
        )}

        {/* Status badge */}
        <div className={`absolute top-2 left-2 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
          isCompleted ? 'bg-white text-black' :
          isFailed    ? 'bg-red-900/80 text-red-300' :
                        'bg-[#2a2a2f] text-zinc-400'
        }`}>
          {isCompleted ? '✓ Done' : isFailed ? 'Failed' : result.status}
        </div>
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-2">
        <p className="text-[10px] text-zinc-400 line-clamp-2">{result.prompt}</p>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] text-zinc-600 bg-[#1a1a1e] border border-[#2c2c32] px-1.5 py-0.5 rounded">
            {providerMeta?.name ?? result.provider}
          </span>
          <span className="text-[9px] text-zinc-600 bg-[#1a1a1e] border border-[#2c2c32] px-1.5 py-0.5 rounded capitalize">
            {result.mode.replace('-', '→')}
          </span>
          {result.costUsd && (
            <span className="text-[9px] text-zinc-600 bg-[#1a1a1e] border border-[#2c2c32] px-1.5 py-0.5 rounded">
              ~${result.costUsd.toFixed(2)}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-1.5 pt-1">
          {isCompleted && (
            <>
              <button
                onClick={() => onSendToTimeline(result)}
                className={`${btnPrimary} flex-1 justify-center text-[10px] py-1.5`}
              >
                <ArrowRight className="w-3 h-3" />
                Add to Timeline
              </button>
              <button
                onClick={() => onDownload(result)}
                className={`${btnSecondary} py-1.5 px-2`}
                title="Download video"
              >
                <Download className="w-3 h-3" />
              </button>
            </>
          )}
          {isFailed && (
            <button onClick={() => onRetry(result)} className={`${btnSecondary} flex-1 justify-center text-[10px] py-1.5`}>
              <RotateCcw className="w-3 h-3" />
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
interface AIVideoGeneratorToolProps {
  inline?: boolean;
  onClose?: () => void;
  renderTrigger?: (open: () => void) => React.ReactNode;
}

export default function AIVideoGeneratorTool({ inline, onClose, renderTrigger }: AIVideoGeneratorToolProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const hasApiKey = !!getFalApiKey();

  // Settings state
  const [provider, setProvider] = useState<VideoProvider>('hailuo-fast');
  const [mode, setMode] = useState<GenerationMode>('text-to-video');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [showNegative, setShowNegative] = useState(false);
  const [resolution, setResolution] = useState<VideoResolution>('1080p');
  const [duration, setDuration] = useState<VideoDuration>(6);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [enableAudio, setEnableAudio] = useState(false);
  const [cameraControl, setCameraControl] = useState<string>('none');
  const [stylePreset, setStylePreset] = useState<string>('');
  const [startImageUrl, setStartImageUrl] = useState('');
  const [endImageUrl, setEndImageUrl] = useState('');

  // Multi-shot shots
  const [shots, setShots] = useState<ShotDefinition[]>([
    { id: '1', description: '', durationSec: 3 },
    { id: '2', description: '', durationSec: 3 },
  ]);

  // Generation queue
  const [queue, setQueue] = useState<GenerationResult[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const providerMeta = PROVIDERS.find(p => p.id === provider)!;

  // Computed settings for cost estimation
  const currentSettings: GenerationSettings = {
    provider,
    mode,
    prompt,
    negativePrompt,
    resolution,
    duration,
    aspectRatio,
    shots: mode === 'multi-shot' ? shots : undefined,
    enableAudio,
    cameraControl: cameraControl as any,
  };
  const costEst = estimateCost(currentSettings);

  // Store project for "send to timeline"
  const project = useEditorStore(s => s.project);
  const addTrack = useEditorStore(s => s.addTrack);
  const addClip = useEditorStore(s => s.addClip);

  const open = () => {
    setIsOpen(true);
  };

  // Provider change: reset settings to valid values
  useEffect(() => {
    if (!providerMeta.supportsAudio) setEnableAudio(false);
    if (!providerMeta.supportsCameraControl) setCameraControl('none');
    if (!providerMeta.supportsMultiShot && mode === 'multi-shot') setMode('text-to-video');
    if (!providerMeta.durations.includes(duration)) setDuration(providerMeta.durations[0] as VideoDuration);
  }, [provider, providerMeta, duration, mode]);

  // Shots management
  const addShot = () => {
    if (shots.length >= 6) return;
    setShots(prev => [...prev, { id: Date.now().toString(), description: '', durationSec: 3 }]);
  };
  const updateShot = (id: string, updated: ShotDefinition) => {
    setShots(prev => prev.map(s => s.id === id ? updated : s));
  };
  const removeShot = (id: string) => {
    if (shots.length <= 1) return;
    setShots(prev => prev.filter(s => s.id !== id));
  };

  // Generate
  const handleGenerate = async () => {
    if (!getFalApiKey()) {
      setShowApiKeyModal(true);
      return;
    }

    const fullPrompt = stylePreset ? `${stylePreset} style. ${prompt}` : prompt;

    const settings: GenerationSettings = {
      provider,
      mode,
      prompt: fullPrompt,
      negativePrompt: negativePrompt || undefined,
      resolution,
      duration,
      aspectRatio,
      shots: mode === 'multi-shot' ? shots : undefined,
      enableAudio,
      cameraControl: cameraControl as any,
      startImageUrl: startImageUrl || undefined,
      endImageUrl: endImageUrl || undefined,
    };

    setIsGenerating(true);
    try {
      await generateVideo(settings, (result) => {
        setQueue(prev => {
          const idx = prev.findIndex(r => r.taskId === result.taskId);
          if (idx === -1) return [result, ...prev];
          const next = [...prev];
          next[idx] = result;
          return next;
        });
      });
    } catch (err: any) {
      const errorResult: GenerationResult = {
        taskId: Date.now().toString(),
        provider,
        mode,
        status: 'failed',
        progress: 0,
        prompt: fullPrompt,
        createdAt: Date.now(),
        errorMessage: err.message || 'Unknown error',
      };
      setQueue(prev => [errorResult, ...prev]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendToTimeline = async (result: GenerationResult) => {
    if (!result.videoUrl || !project) return;
    try {
      const res = await fetch(result.videoUrl);
      const blob = await res.blob();
      const file = new File([blob], `ai-gen-${result.taskId}.mp4`, { type: 'video/mp4' });
      const opfsPath = await saveFileToOPFS(`ai-gen-${result.taskId}.mp4`, file);
      const assetId = `ai-${result.taskId}`;
      await db.assets.put({
        id: assetId,
        projectId: project.id,
        name: `AI Generated — ${result.prompt.slice(0, 40)}`,
        type: 'video',
        opfsPath,
        durationMs: (result.durationSec ?? 6) * 1000,
        size: blob.size,
        createdAt: new Date(),
      });
      // Find first video track or create one
      const track = project.tracks.find(t => t.type === 'video');
      if (!track) {
        await addTrack('video');
      }
      // Re-read after potential addTrack
      const currentProject = useEditorStore.getState().project;
      const videoTrack = currentProject?.tracks.find(t => t.type === 'video');
      if (!videoTrack) return;
      const lastClipEnd = videoTrack.clips.reduce((max, c) => Math.max(max, c.positionMs + c.durationMs), 0);
      await addClip(videoTrack.id, {
        id: `clip-${assetId}`,
        name: `AI — ${result.prompt.slice(0, 30)}`,
        assetId,
        type: 'video',
        positionMs: lastClipEnd,
        durationMs: (result.durationSec ?? 6) * 1000,
        trimStartMs: 0,
        trimEndMs: 0,
        volume: 100,
        speed: 1,
        disabled: false,
      });
    } catch (err) {
      console.error('[AIVideoGen] Send to timeline failed:', err);
    }
  };

  const handleDownload = async (result: GenerationResult) => {
    if (!result.videoUrl) return;
    const a = document.createElement('a');
    a.href = result.videoUrl;
    a.download = `jellycut-ai-${result.taskId}.mp4`;
    a.target = '_blank';
    a.click();
  };

  const handleRetry = async (result: GenerationResult) => {
    // Re-run with same prompt / provider
    setQueue(prev => prev.filter(r => r.taskId !== result.taskId));
    const settings: GenerationSettings = {
      provider: result.provider,
      mode: result.mode,
      prompt: result.prompt,
      resolution,
      duration,
      aspectRatio,
    };
    setIsGenerating(true);
    try {
      await generateVideo(settings, (r) => {
        setQueue(prev => {
          const idx = prev.findIndex(x => x.taskId === r.taskId);
          if (idx === -1) return [r, ...prev];
          const next = [...prev]; next[idx] = r; return next;
        });
      });
    } finally {
      setIsGenerating(false);
    }
  };

  if (!inline && !isOpen) {
    return renderTrigger ? <>{renderTrigger(open)}</> : (
      <button onClick={open} className="hidden" />
    );
  }

  const handleClose = () => {
    if (inline && onClose) onClose();
    else setIsOpen(false);
  };

  const content = (
    <>
      {showApiKeyModal && <ApiKeyModal onClose={() => setShowApiKeyModal(false)} />}

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1e1e22] shrink-0">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-white" />
            <span className="font-bold text-sm text-white tracking-tight">AI Video Generator</span>
            {!hasApiKey && (
              <button
                onClick={() => setShowApiKeyModal(true)}
                className="flex items-center gap-1 text-[10px] text-amber-400 border border-amber-400/30 bg-amber-400/5 px-2 py-0.5 rounded-full hover:bg-amber-400/10 transition cursor-pointer"
              >
                <Key className="w-2.5 h-2.5" />
                Add API Key
              </button>
            )}
            {hasApiKey && (
              <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                <CheckCircle className="w-2.5 h-2.5 text-white" />
                fal.ai connected
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowApiKeyModal(true)}
              className="p-1.5 text-zinc-500 hover:text-white transition cursor-pointer"
              title="API Key Settings"
            >
              <Key className="w-4 h-4" />
            </button>
            <button onClick={handleClose} className="p-1.5 text-zinc-500 hover:text-white transition cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* ── Left Panel: Config ────────────────────────── */}
          <div className="w-80 shrink-0 border-r border-[#1e1e22] flex flex-col overflow-y-auto">
            {/* Provider */}
            <div className="p-4 border-b border-[#1a1a1e]">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2.5">Provider</p>
              <div className="flex flex-col gap-1.5">
                {PROVIDERS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setProvider(p.id)}
                    className={`w-full text-left p-2.5 rounded-lg border transition cursor-pointer ${
                      provider === p.id
                        ? 'border-white/30 bg-white/5'
                        : 'border-[#222226] hover:border-[#2c2c32] bg-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-bold text-zinc-200">{p.name}</span>
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                        p.badge === 'CHEAPEST'  ? 'bg-white/10 text-white' :
                        p.badge === 'BALANCED'  ? 'bg-zinc-700/60 text-zinc-300' :
                        p.badge === 'CINEMATIC' ? 'bg-zinc-700/60 text-zinc-300' :
                                                   'bg-zinc-700/60 text-zinc-300'
                      }`}>
                        {p.badge}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-600 leading-snug">{p.description.split('—')[0]}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Mode */}
            <div className="p-4 border-b border-[#1a1a1e]">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2.5">Mode</p>
              <div className="flex flex-col gap-1">
                {([
                  { id: 'text-to-video', label: 'Text → Video', icon: Film, always: true },
                  { id: 'image-to-video', label: 'Image → Video', icon: Image, always: false, check: providerMeta.supportsImageToVideo },
                  { id: 'multi-shot', label: 'Multi-Shot', icon: Layers, always: false, check: providerMeta.supportsMultiShot },
                ] as const).map(m => {
                  const enabled = m.always || m.check;
                  return (
                    <button
                      key={m.id}
                      disabled={!enabled}
                      onClick={() => setMode(m.id as GenerationMode)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        mode === m.id
                          ? 'bg-white text-black'
                          : 'text-zinc-400 hover:bg-[#1a1a1e] disabled:opacity-30 disabled:cursor-not-allowed'
                      }`}
                    >
                      <m.icon className="w-3.5 h-3.5" />
                      {m.label}
                      {!enabled && <span className="ml-auto text-[9px] text-zinc-600">Kling only</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Settings */}
            <div className="p-4 flex flex-col gap-3">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Settings</p>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-zinc-500 mb-1 block">Resolution</label>
                  <select value={resolution} onChange={e => setResolution(e.target.value as VideoResolution)} className={`${selectCls} w-full`}>
                    {providerMeta.resolutions.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 mb-1 block">Duration</label>
                  <select value={duration} onChange={e => setDuration(Number(e.target.value) as VideoDuration)} className={`${selectCls} w-full`}>
                    {providerMeta.durations.map(d => <option key={d} value={d}>{d}s</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">Aspect Ratio</label>
                <div className="flex gap-1.5">
                  {(['16:9', '9:16', '1:1'] as AspectRatio[]).map(ar => (
                    <button
                      key={ar}
                      onClick={() => setAspectRatio(ar)}
                      className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg border transition cursor-pointer ${
                        aspectRatio === ar ? 'bg-white text-black border-white' : 'border-[#2c2c32] text-zinc-400 hover:border-zinc-500'
                      }`}
                    >
                      {ar}
                    </button>
                  ))}
                </div>
              </div>

              {/* Style Preset */}
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">Style Preset</label>
                <select value={stylePreset} onChange={e => setStylePreset(e.target.value)} className={`${selectCls} w-full`}>
                  <option value="">None</option>
                  {STYLE_PRESETS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Kling-only extras */}
              {providerMeta.supportsAudio && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableAudio}
                    onChange={e => setEnableAudio(e.target.checked)}
                    className="w-3.5 h-3.5 accent-white"
                  />
                  <Volume2 className="w-3 h-3 text-zinc-400" />
                  <span className="text-[11px] text-zinc-300">Generate Native Audio</span>
                </label>
              )}

              {providerMeta.supportsCameraControl && (
                <div>
                  <label className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1"><Camera className="w-3 h-3" /> Camera</label>
                  <select value={cameraControl} onChange={e => setCameraControl(e.target.value)} className={`${selectCls} w-full`}>
                    {CAMERA_PRESETS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* ── Middle Panel: Prompt & Multi-Shot ─────────── */}
          <div className="flex-1 flex flex-col overflow-hidden border-r border-[#1e1e22]">
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">

              {/* Text-to-video / image-to-video prompt */}
              {mode !== 'multi-shot' && (
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 block">Prompt</label>
                    <textarea
                      value={prompt}
                      onChange={e => setPrompt(e.target.value)}
                      placeholder={
                        mode === 'image-to-video'
                          ? 'Describe how the image should animate — camera movement, action, mood...'
                          : 'Describe your video scene — setting, characters, action, lighting, mood...'
                      }
                      rows={5}
                      className={inputCls}
                    />
                  </div>

                  <button
                    onClick={() => setShowNegative(!showNegative)}
                    className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-400 transition cursor-pointer self-start"
                  >
                    {showNegative ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    Negative prompt
                  </button>

                  {showNegative && (
                    <textarea
                      value={negativePrompt}
                      onChange={e => setNegativePrompt(e.target.value)}
                      placeholder="Things to avoid — blurry, low quality, distorted hands..."
                      rows={2}
                      className={inputCls}
                    />
                  )}

                  {/* Image-to-video URL inputs */}
                  {mode === 'image-to-video' && (
                    <div className="flex flex-col gap-2">
                      <div>
                        <label className="text-[10px] text-zinc-500 mb-1 block">Start Frame Image URL</label>
                        <input
                          value={startImageUrl}
                          onChange={e => setStartImageUrl(e.target.value)}
                          placeholder="https://... (publicly accessible image)"
                          className={inputCls}
                        />
                      </div>
                      {providerMeta.supportsEndFrame && (
                        <div>
                          <label className="text-[10px] text-zinc-500 mb-1 block">End Frame Image URL (optional)</label>
                          <input
                            value={endImageUrl}
                            onChange={e => setEndImageUrl(e.target.value)}
                            placeholder="https://... (optional, Kling only)"
                            className={inputCls}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Multi-shot builder */}
              {mode === 'multi-shot' && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Shot Storyboard</p>
                      <p className="text-[10px] text-zinc-600 mt-0.5">Define up to 6 shots for the AI Director. Each generates as a continuous sequence.</p>
                    </div>
                    <button
                      onClick={addShot}
                      disabled={shots.length >= 6}
                      className={`${btnSecondary} text-[10px] py-1`}
                    >
                      <Plus className="w-3 h-3" />
                      Shot {shots.length + 1}
                    </button>
                  </div>

                  <div className="flex flex-col gap-2">
                    {shots.map((shot, i) => (
                      <ShotCard
                        key={shot.id}
                        shot={shot}
                        index={i}
                        total={shots.length}
                        onChange={updated => updateShot(shot.id, updated)}
                        onRemove={() => removeShot(shot.id)}
                      />
                    ))}
                  </div>

                  <p className="text-[9px] text-zinc-700 text-right">
                    Total: {shots.reduce((s, shot) => s + shot.durationSec, 0)}s
                  </p>
                </div>
              )}
            </div>

            {/* Generate button */}
            <div className="p-4 border-t border-[#1a1a1e] bg-[#0d0d0f] shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                  <DollarSign className="w-3 h-3" />
                  <span>Est. cost: <strong className="text-zinc-300">${costEst.low.toFixed(2)} – ${costEst.high.toFixed(2)}</strong></span>
                </div>
                <a
                  href="https://fal.ai/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[9px] text-zinc-600 hover:text-zinc-400 transition"
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                  fal.ai balance
                </a>
              </div>

              <button
                onClick={handleGenerate}
                disabled={isGenerating || (!prompt.trim() && mode !== 'multi-shot') || (mode === 'multi-shot' && shots.every(s => !s.description.trim()))}
                className={`${btnPrimary} w-full justify-center py-2.5`}
              >
                {isGenerating ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                ) : (
                  <><Sparkles className="w-3.5 h-3.5" /> Generate Video</>
                )}
              </button>

              {!getFalApiKey() && (
                <p className="text-[10px] text-amber-400/80 text-center mt-2">
                  ⚠ No API key —{' '}
                  <button onClick={() => setShowApiKeyModal(true)} className="underline cursor-pointer hover:text-amber-300 transition">
                    add your fal.ai key first
                  </button>
                </p>
              )}
            </div>
          </div>

          {/* ── Right Panel: Queue & Results ──────────────── */}
          <div className="w-80 shrink-0 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3.5 border-b border-[#1a1a1e] shrink-0">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Generation Queue</span>
              {queue.length > 0 && (
                <span className="text-[9px] bg-[#1e1e22] border border-[#2c2c32] text-zinc-400 px-1.5 py-0.5 rounded-full">{queue.length}</span>
              )}
            </div>

            {queue.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-6">
                <Film className="w-8 h-8 text-zinc-800" />
                <p className="text-xs text-zinc-600">Your generated videos will appear here.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
                {queue.map(result => (
                  <ResultCard
                    key={result.taskId}
                    result={result}
                    onSendToTimeline={handleSendToTimeline}
                    onDownload={handleDownload}
                    onRetry={handleRetry}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
    </>
  );

  if (inline) {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-[#0a0a0c]">
        {content}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[#0a0a0c]/95 backdrop-blur-sm flex flex-col overflow-hidden">
      {content}
    </div>
  );
}
