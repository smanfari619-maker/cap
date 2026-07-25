import { useState } from 'react';
import { Move, RotateCcw, Eraser, Sparkles, Crosshair, Scissors, Loader2 } from 'lucide-react';
import { db } from '../../../lib/db';
import { removeWatermark } from '../../../lib/watermark';
import { autoCutVideoClip } from '../../../lib/scene-detector';
import SnappingSlider from './SnappingSlider';

interface VideoTabProps {
  selectedClip: any;
  project: any;
  updateClip: any;
  transform: any;
  handleTransformChange: (key: string, value: any) => void;
  handleResetTransform: () => void;
  toggleKeyframe: (property: 'scale' | 'x' | 'y' | 'rotation' | 'opacity', defaultValue: number) => void;
  hasKeyframeAtPlayhead: (property: 'scale' | 'x' | 'y' | 'rotation' | 'opacity') => boolean;
  currentAsset: any;
  wmStatus: 'idle' | 'loading' | 'processing' | 'done' | 'error';
  setWmStatus: (status: any) => void;
  wmProgress: number;
  setWmProgress: (progress: number) => void;
  wmError: string | null;
  setWmError: (error: string | null) => void;
  watermarkRegion: any;
  setWatermarkRegion: (region: any) => void;
  setIsDrawModalOpen: (open: boolean) => void;
}

export default function VideoTab({
  selectedClip,
  project,
  updateClip,
  transform,
  handleTransformChange,
  handleResetTransform,
  toggleKeyframe,
  hasKeyframeAtPlayhead,
  currentAsset,
  wmStatus,
  setWmStatus,
  wmProgress,
  setWmProgress,
  wmError,
  setWmError,
  watermarkRegion,
  setWatermarkRegion,
  setIsDrawModalOpen
}: VideoTabProps) {
  const [isAnalyzingScenes, setIsAnalyzingScenes] = useState(false);
  const [sceneAnalysisProgress, setSceneAnalysisProgress] = useState<number | null>(null);
  const [mode, setMode] = useState<'translucent' | 'opaque'>('opaque');

  const formatTime = (ms: number) => {
    const sec = (ms / 1000).toFixed(2);
    return `${sec}s`;
  };

  return (
    <div className="space-y-5">
      {/* Transform settings matching CapCut */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500 flex items-center gap-1">
            <Move className="w-3 h-3 text-violet-400" /> Transform
          </h4>
          <button
            onClick={handleResetTransform}
            className="text-[9px] font-semibold text-zinc-500 hover:text-violet-400 transition uppercase tracking-wider flex items-center gap-1"
            title="Reset Transform settings to default"
          >
            <RotateCcw className="w-2.5 h-2.5" /> Reset
          </button>
        </div>

        <div className="space-y-3.5">
          {/* Scale */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-semibold text-zinc-400 uppercase">Scale</label>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => toggleKeyframe('scale', 100)}
                  className={`hover:text-violet-400 transition ${hasKeyframeAtPlayhead('scale') ? 'text-amber-500' : 'text-zinc-650'}`}
                  title="Add/Remove Scale Keyframe"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={hasKeyframeAtPlayhead('scale') ? "currentColor" : "none"} stroke="currentColor">
                    <path d="M12 2L2 12l10 10 10-10L12 2z" strokeWidth="2.5" />
                  </svg>
                </button>
                <div className="flex items-center gap-0.5">
                  <input
                    type="number"
                    value={Math.round(transform.scale)}
                    min={10}
                    max={200}
                    onChange={(e) => handleTransformChange('scale', Math.min(200, Math.max(10, Number(e.target.value) || 10)))}
                    className="w-10 text-right bg-[#121214] border border-[#2c2c32] rounded px-1 py-0.5 text-[10px] font-mono text-zinc-300 focus:border-violet-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-zinc-500 font-mono">%</span>
                </div>
              </div>
            </div>
            <SnappingSlider
              min={10}
              max={200}
              defaultValue={100}
              value={transform.scale}
              onChange={(val) => handleTransformChange('scale', val)}
            />
          </div>

          {/* Uniform Scale switch toggle */}
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold text-zinc-400 uppercase">Uniform scale</label>
            <button
              onClick={() => handleTransformChange('uniformScale', !transform.uniformScale)}
              className={`w-8 h-4 rounded-full transition relative ${transform.uniformScale ? 'bg-violet-600' : 'bg-zinc-800'}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${transform.uniformScale ? 'right-0.5' : 'left-0.5'}`} />
            </button>
          </div>

          {/* Position X */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-semibold text-zinc-400 uppercase">Position X (px)</label>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => toggleKeyframe('x', 0)}
                  className={`hover:text-violet-400 transition ${hasKeyframeAtPlayhead('x') ? 'text-amber-500' : 'text-zinc-650'}`}
                  title="Add/Remove Position X Keyframe"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={hasKeyframeAtPlayhead('x') ? "currentColor" : "none"} stroke="currentColor">
                    <path d="M12 2L2 12l10 10 10-10L12 2z" strokeWidth="2.5" />
                  </svg>
                </button>
                <div className="flex items-center gap-0.5">
                  <input
                    type="number"
                    value={Math.round(transform.x)}
                    min={-480}
                    max={480}
                    onChange={(e) => handleTransformChange('x', Math.min(480, Math.max(-480, Number(e.target.value) || 0)))}
                    className="w-11 text-right bg-[#121214] border border-[#2c2c32] rounded px-1 py-0.5 text-[10px] font-mono text-zinc-300 focus:border-violet-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-zinc-500 font-mono">px</span>
                </div>
              </div>
            </div>
            <SnappingSlider
              min={-480}
              max={480}
              defaultValue={0}
              value={transform.x}
              onChange={(val) => handleTransformChange('x', val)}
            />
          </div>

          {/* Position Y */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-semibold text-zinc-400 uppercase">Position Y (px)</label>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => toggleKeyframe('y', 0)}
                  className={`hover:text-violet-400 transition ${hasKeyframeAtPlayhead('y') ? 'text-amber-500' : 'text-zinc-650'}`}
                  title="Add/Remove Position Y Keyframe"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={hasKeyframeAtPlayhead('y') ? "currentColor" : "none"} stroke="currentColor">
                    <path d="M12 2L2 12l10 10 10-10L12 2z" strokeWidth="2.5" />
                  </svg>
                </button>
                <div className="flex items-center gap-0.5">
                  <input
                    type="number"
                    value={Math.round(transform.y)}
                    min={-270}
                    max={270}
                    onChange={(e) => handleTransformChange('y', Math.min(270, Math.max(-270, Number(e.target.value) || 0)))}
                    className="w-11 text-right bg-[#121214] border border-[#2c2c32] rounded px-1 py-0.5 text-[10px] font-mono text-zinc-300 focus:border-violet-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-zinc-500 font-mono">px</span>
                </div>
              </div>
            </div>
            <SnappingSlider
              min={-270}
              max={270}
              defaultValue={0}
              value={transform.y}
              onChange={(val) => handleTransformChange('y', val)}
            />
          </div>

          {/* Rotate */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-semibold text-zinc-400 uppercase">Rotate</label>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => toggleKeyframe('rotation', 0)}
                  className={`hover:text-violet-400 transition ${hasKeyframeAtPlayhead('rotation') ? 'text-amber-500' : 'text-zinc-650'}`}
                  title="Add/Remove Rotation Keyframe"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={hasKeyframeAtPlayhead('rotation') ? "currentColor" : "none"} stroke="currentColor">
                    <path d="M12 2L2 12l10 10 10-10L12 2z" strokeWidth="2.5" />
                  </svg>
                </button>
                <div className="flex items-center gap-0.5">
                  <input
                    type="number"
                    value={Math.round(transform.rotation)}
                    min={-180}
                    max={180}
                    onChange={(e) => handleTransformChange('rotation', Math.min(180, Math.max(-180, Number(e.target.value) || 0)))}
                    className="w-10 text-right bg-[#121214] border border-[#2c2c32] rounded px-1 py-0.5 text-[10px] font-mono text-zinc-300 focus:border-violet-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-zinc-500 font-mono">°</span>
                </div>
              </div>
            </div>
            <SnappingSlider
              min={-180}
              max={180}
              defaultValue={0}
              value={transform.rotation}
              onChange={(val) => handleTransformChange('rotation', val)}
            />
          </div>

          {/* Opacity with Keyframe */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-semibold text-zinc-400 uppercase">Opacity</label>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => toggleKeyframe('opacity', 100)}
                  className={`hover:text-violet-400 transition ${hasKeyframeAtPlayhead('opacity') ? 'text-amber-500' : 'text-zinc-650'}`}
                  title="Add/Remove Opacity Keyframe"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={hasKeyframeAtPlayhead('opacity') ? "currentColor" : "none"} stroke="currentColor">
                    <path d="M12 2L2 12l10 10 10-10L12 2z" strokeWidth="2.5" />
                  </svg>
                </button>
                <div className="flex items-center gap-0.5">
                  <input
                    type="number"
                    value={Math.round(transform.opacity)}
                    min={0}
                    max={100}
                    onChange={(e) => handleTransformChange('opacity', Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                    className="w-10 text-right bg-[#121214] border border-[#2c2c32] rounded px-1 py-0.5 text-[10px] font-mono text-zinc-300 focus:border-violet-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-zinc-500 font-mono">%</span>
                </div>
              </div>
            </div>
            <SnappingSlider
              min={0}
              max={100}
              defaultValue={100}
              value={transform.opacity}
              onChange={(val) => handleTransformChange('opacity', val)}
            />
          </div>

          {/* Alignment presets grid */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-semibold text-zinc-400 uppercase">Alignment presets</label>
            <div className="grid grid-cols-3 gap-1 w-24">
              {[
                { name: '↖️', x: -300, y: -180 },
                { name: '⬆️', x: 0, y: -180 },
                { name: '↗️', x: 300, y: -180 },
                { name: '⬅️', x: -300, y: 0 },
                { name: '⏹️', x: 0, y: 0 },
                { name: '➡️', x: 300, y: 0 },
                { name: '↙️', x: -300, y: 180 },
                { name: '⬇️', x: 0, y: 180 },
                { name: '↘️', x: 300, y: 180 }
              ].map((align, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    handleTransformChange('x', align.x);
                    handleTransformChange('y', align.y);
                  }}
                  className="h-6 rounded bg-zinc-950 border border-zinc-800 text-[10px] hover:bg-zinc-800 hover:text-white transition flex items-center justify-center font-bold"
                  title={`Align offset to ${align.x}, ${align.y}`}
                >
                  {align.name}
                </button>
              ))}
            </div>
          </div>

          {/* Blend modes dropdown matching CapCut */}
          <div className="space-y-1 pt-3 border-t border-zinc-800">
            <label className="block text-[10px] font-semibold text-zinc-400 uppercase">Blend Mode</label>
            <select
              value={transform.blendMode}
              onChange={(e) => handleTransformChange('blendMode', e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-violet-500 transition"
            >
              <option value="normal">Normal</option>
              <option value="multiply">Multiply</option>
              <option value="screen">Screen</option>
              <option value="overlay">Overlay</option>
              <option value="darken">Darken</option>
              <option value="lighten">Lighten</option>
              <option value="color-dodge">Color Dodge</option>
              <option value="color-burn">Color Burn</option>
              <option value="soft-light">Soft Light</option>
              <option value="hard-light">Hard Light</option>
            </select>
          </div>

          {/* Chroma Key Green Screen Removal */}
          <div className="space-y-4 pt-4 border-t border-zinc-800">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold text-zinc-400 uppercase">Enable Chroma Key</label>
              <button
                onClick={() => {
                  const current = selectedClip.chromaKey || { enabled: false, color: '#00ff00', tolerance: 30, feather: 10 };
                  updateClip(selectedClip.id, {
                    chromaKey: { ...current, enabled: !current.enabled }
                  });
                }}
                className={`w-8 h-4 rounded-full transition relative ${selectedClip.chromaKey?.enabled ? 'bg-violet-600' : 'bg-zinc-800'}`}
              >
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${selectedClip.chromaKey?.enabled ? 'right-0.5' : 'left-0.5'}`} />
              </button>
            </div>
            {selectedClip.chromaKey?.enabled && (
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <label className="block text-[10px] font-semibold text-zinc-400 uppercase">Key Color</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={selectedClip.chromaKey.color || '#00ff00'}
                      onChange={(e) => {
                        const current = selectedClip.chromaKey || { enabled: true, color: '#00ff00', tolerance: 30, feather: 10 };
                        updateClip(selectedClip.id, { chromaKey: { ...current, color: e.target.value } });
                      }}
                      className="w-8 h-8 rounded border border-zinc-800 bg-zinc-950 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={selectedClip.chromaKey.color || '#00ff00'}
                      onChange={(e) => {
                        const current = selectedClip.chromaKey || { enabled: true, color: '#00ff00', tolerance: 30, feather: 10 };
                        updateClip(selectedClip.id, { chromaKey: { ...current, color: e.target.value } });
                      }}
                      className="flex-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-semibold text-zinc-400 uppercase">Tolerance</label>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold">{selectedClip.chromaKey.tolerance || 30}</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={150}
                    value={selectedClip.chromaKey.tolerance || 30}
                    onChange={(e) => {
                      const current = selectedClip.chromaKey || { enabled: true, color: '#00ff00', tolerance: 30, feather: 10 };
                      updateClip(selectedClip.id, { chromaKey: { ...current, tolerance: Number(e.target.value) } });
                    }}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-semibold text-zinc-400 uppercase">Feather</label>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold">{selectedClip.chromaKey.feather || 10}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={80}
                    value={selectedClip.chromaKey.feather || 10}
                    onChange={(e) => {
                      const current = selectedClip.chromaKey || { enabled: true, color: '#00ff00', tolerance: 30, feather: 10 };
                      updateClip(selectedClip.id, { chromaKey: { ...current, feather: Number(e.target.value) } });
                    }}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* AI Background Removal */}
          <div className="p-3 bg-[#18181b] border border-zinc-800/80 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold text-zinc-400 uppercase">AI Background Removal</label>
              <button
                onClick={() => {
                  const current = selectedClip.aiBackgroundRemoval || { enabled: false, mode: 'remove', blurRadius: 10 };
                  updateClip(selectedClip.id, {
                    aiBackgroundRemoval: { ...current, enabled: !current.enabled }
                  });
                }}
                className={`w-8 h-4 rounded-full transition relative ${selectedClip.aiBackgroundRemoval?.enabled ? 'bg-sky-600' : 'bg-zinc-800'}`}
              >
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${selectedClip.aiBackgroundRemoval?.enabled ? 'right-0.5' : 'left-0.5'}`} />
              </button>
            </div>
            {selectedClip.aiBackgroundRemoval?.enabled && (
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <label className="block text-[10px] font-semibold text-zinc-400 uppercase">Removal Mode</label>
                  <select
                    value={selectedClip.aiBackgroundRemoval.mode || 'remove'}
                    onChange={(e) => {
                      const current = selectedClip.aiBackgroundRemoval || { enabled: true, mode: 'remove', blurRadius: 10 };
                      updateClip(selectedClip.id, {
                        aiBackgroundRemoval: { ...current, mode: e.target.value as 'remove' | 'blur' }
                      });
                    }}
                    className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
                  >
                    <option value="remove">Cutout Subject (Remove Background)</option>
                    <option value="blur">Blur Background</option>
                  </select>
                </div>
                {selectedClip.aiBackgroundRemoval.mode === 'blur' && (
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <label className="text-[10px] font-semibold text-zinc-400 uppercase">Blur Radius</label>
                      <span className="text-[10px] font-mono text-zinc-400 font-bold">{selectedClip.aiBackgroundRemoval.blurRadius || 10}px</span>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={30}
                      value={selectedClip.aiBackgroundRemoval.blurRadius || 10}
                      onChange={(e) => {
                        const current = selectedClip.aiBackgroundRemoval || { enabled: true, mode: 'blur', blurRadius: 10 };
                        updateClip(selectedClip.id, {
                          aiBackgroundRemoval: { ...current, blurRadius: Number(e.target.value) }
                        });
                      }}
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-sky-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Smart Reframe */}
          <div className="p-3 bg-[#18181b] border border-zinc-800/80 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold text-zinc-400 uppercase">Smart Reframe (Face Lock)</label>
              <button
                onClick={() => {
                  const current = selectedClip.smartReframe || { enabled: false, targetAspect: '9:16', smoothing: 20 };
                  updateClip(selectedClip.id, {
                    smartReframe: { ...current, enabled: !current.enabled }
                  });
                }}
                className={`w-8 h-4 rounded-full transition relative ${selectedClip.smartReframe?.enabled ? 'bg-sky-600' : 'bg-zinc-800'}`}
              >
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${selectedClip.smartReframe?.enabled ? 'right-0.5' : 'left-0.5'}`} />
              </button>
            </div>
            {selectedClip.smartReframe?.enabled && (
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <label className="block text-[10px] font-semibold text-zinc-400 uppercase">Target Aspect Ratio</label>
                  <select
                    value={selectedClip.smartReframe.targetAspect || '9:16'}
                    onChange={(e) => {
                      const current = selectedClip.smartReframe || { enabled: true, targetAspect: '9:16', smoothing: 20 };
                      updateClip(selectedClip.id, {
                        smartReframe: { ...current, targetAspect: e.target.value as '9:16' | '1:1' }
                      });
                    }}
                    className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
                  >
                    <option value="9:16">Vertical (9:16 Shorts/TikTok)</option>
                    <option value="1:1">Square (1:1 Instagram)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-semibold text-zinc-400 uppercase">Tracking Speed / Smoothing</label>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold">{selectedClip.smartReframe.smoothing ?? 20}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    value={selectedClip.smartReframe.smoothing ?? 20}
                    onChange={(e) => {
                      const current = selectedClip.smartReframe || { enabled: true, targetAspect: '9:16', smoothing: 20 };
                      updateClip(selectedClip.id, {
                        smartReframe: { ...current, smoothing: Number(e.target.value) }
                      });
                    }}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-sky-500 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* AI Auto-Cut (Scene Splitter) */}
          <div className="p-3 bg-[#18181b] border border-zinc-800/80 rounded-lg space-y-3">
            <div className="flex items-center gap-1.5 text-sky-400">
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              <label className="text-[10px] font-semibold text-zinc-300 uppercase">AI Video Scene Splitter</label>
            </div>
            <p className="text-[10px] text-zinc-400 leading-normal">
              Automatically scan this clip for camera/scene changes and splice it into multiple individual timeline items.
            </p>
            <button
              disabled={isAnalyzingScenes}
              onClick={async () => {
                setIsAnalyzingScenes(true);
                setSceneAnalysisProgress(0);
                try {
                  const splitCount = await autoCutVideoClip(selectedClip.id, (progress) => {
                    setSceneAnalysisProgress(progress);
                  });
                  if (splitCount > 0) {
                    alert(`Successfully detected and split this clip into ${splitCount + 1} scenes!`);
                  } else {
                    alert("No distinct camera cuts or scene changes were found in this range.");
                  }
                } catch (e: any) {
                  console.error(e);
                  alert(e.message || "Failed to analyze scene cuts.");
                } finally {
                  setIsAnalyzingScenes(false);
                  setSceneAnalysisProgress(null);
                }
              }}
              className="w-full py-1.5 bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-semibold rounded text-[10px] transition flex items-center justify-center gap-1 cursor-pointer"
            >
              {isAnalyzingScenes ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Analyzing scenes {sceneAnalysisProgress !== null ? `(${sceneAnalysisProgress}%)` : ''}...
                </>
              ) : (
                <>
                  <Scissors className="w-3.5 h-3.5" />
                  Auto-Split Scenes
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Trim offsets */}
      <div className="space-y-4 pt-4 border-t border-zinc-800">
        <h4 className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500">Trim offsets</h4>
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between">
              <label className="text-[10px] font-semibold text-zinc-400 uppercase">Trim Start</label>
              <span className="text-[10px] font-mono text-zinc-400 font-bold">{formatTime(selectedClip.trimStartMs)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={selectedClip.trimEndMs - 100}
              value={selectedClip.trimStartMs}
              onChange={(e) => {
                const newTrimStart = Number(e.target.value);
                const currentSpeed = selectedClip.speed || 1.0;
                const newDur = Math.round((selectedClip.trimEndMs - newTrimStart) / currentSpeed);
                updateClip(selectedClip.id, {
                  trimStartMs: newTrimStart,
                  durationMs: newDur
                });
              }}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <label className="text-[10px] font-semibold text-zinc-400 uppercase">Trim End</label>
              <span className="text-[10px] font-mono text-zinc-400 font-bold">{formatTime(selectedClip.trimEndMs)}</span>
            </div>
            <input
              type="range"
              min={selectedClip.trimStartMs + 100}
              max={currentAsset ? currentAsset.durationMs : selectedClip.trimEndMs}
              value={selectedClip.trimEndMs}
              onChange={(e) => {
                const newTrimEnd = Number(e.target.value);
                const currentSpeed = selectedClip.speed || 1.0;
                const newDur = Math.round((newTrimEnd - selectedClip.trimStartMs) / currentSpeed);
                updateClip(selectedClip.id, {
                  trimEndMs: newTrimEnd,
                  durationMs: newDur
                });
              }}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Watermark Removal Section */}
      {selectedClip.type === 'video' && (
        <div className="space-y-3 pt-4 border-t border-zinc-800">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500 flex items-center gap-1">
              <Eraser className="w-3 h-3 text-violet-400" /> Remove Watermark
            </h4>
            {watermarkRegion && (
              <button
                onClick={() => { setWatermarkRegion(null); setWmStatus('idle'); setWmError(null); }}
                className="text-[9px] font-semibold text-zinc-500 hover:text-red-400 transition uppercase tracking-wider flex items-center gap-1"
              >
                <RotateCcw className="w-2.5 h-2.5" /> Clear
              </button>
            )}
          </div>

          <p className="text-[9px] text-zinc-600 leading-relaxed">
            Draw a rectangle over the watermark on the video preview. Runs reverse alpha blending locally — no uploads.
          </p>



          {/* Step 1: Draw region or Auto Remove */}
          {!watermarkRegion && wmStatus === 'idle' && (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setIsDrawModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-semibold transition border bg-zinc-900/50 border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-300 cursor-pointer"
              >
                <Crosshair className="w-3.5 h-3.5" /> Draw Region to Remove Watermark
              </button>
            </div>
          )}

          {/* Step 2: Region set — show coords and process button */}
          {watermarkRegion && wmStatus === 'idle' && (
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-1 p-2 bg-zinc-950/50 rounded-lg border border-zinc-800 text-[9px] font-mono">
                {(['x','y','w','h'] as const).map(k => (
                  <div key={k} className="flex flex-col items-center gap-0.5">
                    <span className="text-zinc-600 uppercase">{k}</span>
                    <span className="text-violet-400 font-bold">{watermarkRegion[k]}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsDrawModalOpen(true)}
                  className="flex-1 py-1.5 rounded-lg text-[9px] font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
                >
                  Redraw
                </button>
                <button
                  onClick={async () => {
                    if (!selectedClip?.assetId || !project || !watermarkRegion) return;
                    setWmStatus('processing');
                    setWmProgress(0);
                    setWmError(null);
                    try {
                      const asset = await db.assets.get(selectedClip.assetId);
                      if (!asset) throw new Error('Asset not found in database.');
                      const newAsset = await removeWatermark(
                        asset,
                        watermarkRegion,
                        project.id,
                        mode,
                        (p) => setWmProgress(Math.round(p * 100))
                      );
                      await updateClip(selectedClip.id, { assetId: newAsset.id, name: newAsset.name });
                      setWmStatus('done');
                      setWatermarkRegion(null);
                    } catch (err: any) {
                       console.error('[Watermark Removal Error]', err);
                       setWmStatus('error');
                       setWmError(err?.message ?? String(err));
                     }
                  }}
                  className="flex-1 py-1.5 rounded-lg text-[9px] font-bold bg-violet-700 hover:bg-violet-600 text-white transition flex items-center justify-center gap-1.5"
                >
                  <Eraser className="w-3 h-3" /> Process & Remove
                </button>
              </div>
            </div>
          )}

          {/* Loading */}
          {wmStatus === 'loading' && (
            <div className="flex items-center gap-2 p-2.5 bg-zinc-900 rounded-lg border border-zinc-800">
              <div className="w-3 h-3 rounded-full border-2 border-zinc-700 border-t-violet-500 animate-spin flex-shrink-0" />
              <p className="text-[9px] text-zinc-400">Initializing video decoder…</p>
            </div>
          )}

          {/* Processing with progress bar */}
          {wmStatus === 'processing' && (
            <div className="space-y-1.5 p-2.5 bg-zinc-900 rounded-lg border border-zinc-800">
              <div className="flex justify-between text-[9px] font-mono">
                <span className="text-zinc-400">Removing watermark…</span>
                <span className="text-violet-400 font-bold">{wmProgress}%</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-600 to-purple-400 rounded-full transition-all duration-300"
                  style={{ width: `${wmProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Done */}
          {wmStatus === 'done' && (
            <div className="flex items-center gap-2 p-2.5 bg-emerald-950/40 rounded-lg border border-emerald-800">
              <span className="text-emerald-400 text-sm">✓</span>
              <div>
                <p className="text-[9px] font-bold text-emerald-400">Done! Clip updated.</p>
                <p className="text-[8px] text-emerald-700">Original asset preserved in media library.</p>
              </div>
              <button
                onClick={() => setWmStatus('idle')}
                className="ml-auto text-[8px] text-emerald-600 hover:text-emerald-400 transition"
              >Dismiss</button>
            </div>
          )}

          {/* Error */}
          {wmStatus === 'error' && (
            <div className="space-y-1.5 p-2.5 bg-red-950/40 rounded-lg border border-red-800">
              <p className="text-[9px] font-bold text-red-400">⚠ Error removing watermark</p>
              <p className="text-[8px] text-red-600 break-all">{wmError}</p>
              <button
                onClick={() => { setWmStatus('idle'); setWmError(null); }}
                className="text-[8px] text-red-500 hover:text-red-300 transition underline"
              >Try again</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
