import { useState, useEffect } from 'react';
import { Sliders, Palette, Eye, Volume2, Gauge, Move, RotateCcw, Eraser, Crosshair, Sparkles, Scissors } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import { db, type Asset } from '../../lib/db';
import { removeWatermark } from '../../lib/watermark';
import WatermarkDrawModal from './WatermarkDrawModal';
import { EFFECTS_REGISTRY } from '../../lib/effects-registry';

export default function ClipInspector({ width }: { width: number }) {
  const project = useEditorStore(state => state.project);
  const selectedClipId = useEditorStore(state => state.selectedClipId);
  const updateClip = useEditorStore(state => state.updateClip);
  const watermarkRegion = useEditorStore(state => state.watermarkRegion);
  const setWatermarkRegion = useEditorStore(state => state.setWatermarkRegion);
  const currentTime = useEditorStore(state => state.currentTime);

  const [activeTab, setActiveTab] = useState<'video' | 'audio' | 'speed' | 'adjust' | 'effects'>('video');
  const [isDrawModalOpen, setIsDrawModalOpen] = useState(false);
  const [currentAsset, setCurrentAsset] = useState<Asset | null>(null);

  // Watermark removal state
  type WmStatus = 'idle' | 'loading' | 'processing' | 'done' | 'error';
  const [wmStatus, setWmStatus] = useState<WmStatus>('idle');
  const [wmProgress, setWmProgress] = useState(0);
  const [wmError, setWmError] = useState<string | null>(null);

  // Fetch asset details dynamically when a clip is selected
  useEffect(() => {
    if (!selectedClipId || !project) {
      setCurrentAsset(null);
      return;
    }
    let foundClipId: string | undefined;
    for (const track of project.tracks) {
      const clip = track.clips.find(c => c.id === selectedClipId);
      if (clip) {
        foundClipId = clip.assetId;
        break;
      }
    }
    if (foundClipId) {
      db.assets.get(foundClipId).then(asset => {
        setCurrentAsset(asset || null);
      });
    } else {
      setCurrentAsset(null);
    }
  }, [selectedClipId, project]);

  if (!project) return null;

  // Find the selected clip
  let selectedClip = null;

  for (const track of project.tracks) {
    const clip = track.clips.find(c => c.id === selectedClipId);
    if (clip) {
      selectedClip = clip;
      break;
    }
  }

  if (!selectedClip) {
    const aspect = project.width > project.height ? '16:9' : project.width < project.height ? '9:16' : '1:1';
    const resolution = `${project.width}x${project.height}`;
    
    return (
      <div 
        className="flex flex-col h-full bg-[#18181c] border-l border-[#2c2c32] text-gray-300 select-none"
        style={{ width, display: width === 0 ? 'none' : 'flex' }}
      >
        {/* Header */}
        <div className="h-9 border-b border-[#2c2c32] bg-[#1e1e22]/50 flex items-center px-3 text-xs font-semibold text-gray-400">
          <span>Details</span>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 space-y-4 overflow-y-auto text-[11px]">
          <div className="grid grid-cols-3 gap-y-3.5 text-gray-400">
            <div className="font-medium text-gray-500">Name:</div>
            <div className="col-span-2 text-gray-200 font-semibold truncate" title={project.title}>
              {project.title}
            </div>

            <div className="font-medium text-gray-500">Path:</div>
            <div className="col-span-2 text-gray-250 break-all font-mono leading-relaxed">
              /Users/salman/Movies/Jellycut/Projects/{project.title.toLowerCase().replace(/\s+/g, '_')}
            </div>

            <div className="font-medium text-gray-500">Aspect ratio:</div>
            <div className="col-span-2 text-gray-200">
              {aspect} (Original)
            </div>

            <div className="font-medium text-gray-500">Resolution:</div>
            <div className="col-span-2 text-gray-205">
              {resolution}
            </div>

            <div className="font-medium text-gray-500">Color space:</div>
            <div className="col-span-2 text-gray-205">
              Rec. 709 SDR
            </div>

            <div className="font-medium text-gray-500">Frame rate:</div>
            <div className="col-span-2 text-gray-255 font-mono">
              {project.fps.toFixed(2)}fps
            </div>

            <div className="font-medium text-gray-500">Imported media:</div>
            <div className="col-span-2 text-gray-300">
              Stay in original location
            </div>

            <div className="font-medium text-gray-500">Proxy:</div>
            <div className="col-span-2 text-gray-400">
              Turned off
            </div>

            <div className="font-medium text-gray-500">Arrange layers:</div>
            <div className="col-span-2 text-gray-400">
              Turned off
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#2c2c32] bg-[#18181c] flex justify-end">
          <button
            onClick={() => alert('Project settings modification is simulated. Frame rate and resolution are optimized.')}
            className="px-3 py-1.5 bg-[#2a2a30] hover:bg-[#3f3f48] border border-[#2c2c32] text-gray-200 rounded font-semibold text-[10px] transition"
          >
            Modify
          </button>
        </div>
      </div>
    );
  }

  // Get transform settings with fallback defaults
  const transform = selectedClip.transform || {
    scale: 100,
    x: 0,
    y: 0,
    rotation: 0,
    uniformScale: true,
    blendMode: 'normal'
  };

  // Get color adjustments with fallback defaults
  const colorAdjustments = selectedClip.colorAdjustments || {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    temp: 0,
    vignette: 0
  };

  // Get filter settings with fallback defaults
  const filterSettings = selectedClip.filterSettings || {
    type: 'none',
    intensity: 80
  };

  const handleTransformChange = (key: string, value: any) => {
    if (!selectedClip) return;
    updateClip(selectedClip.id, {
      transform: {
        ...transform,
        [key]: value
      }
    });
  };

  const handleColorChange = (key: string, value: number) => {
    if (!selectedClip) return;
    updateClip(selectedClip.id, {
      colorAdjustments: {
        ...colorAdjustments,
        [key]: value
      }
    });
  };

  const handleFilterChange = (key: string, value: any) => {
    if (!selectedClip) return;
    updateClip(selectedClip.id, {
      filterSettings: {
        ...filterSettings,
        [key]: value
      }
    });
  };

  const handleTextSettingsChange = (key: string, value: any) => {
    if (!selectedClip || !selectedClip.textSettings) return;
    updateClip(selectedClip.id, {
      textSettings: {
        ...selectedClip.textSettings,
        [key]: value
      }
    });
  };

  const handleResetTransform = () => {
    if (!selectedClip) return;
    updateClip(selectedClip.id, {
      transform: {
        scale: 100,
        x: 0,
        y: 0,
        rotation: 0,
        uniformScale: true,
        blendMode: 'normal'
      }
    });
  };



  const toggleKeyframe = (property: 'scale' | 'x' | 'y' | 'rotation' | 'opacity', defaultValue: number) => {
    if (!selectedClip || !project) return;
    const currentTime = useEditorStore.getState().currentTime;
    const clipOffset = currentTime - selectedClip.positionMs;
    if (clipOffset < 0 || clipOffset > selectedClip.durationMs) {
      alert('Playhead must be over the selected clip to toggle a keyframe.');
      return;
    }
    const keyframesObj = selectedClip.keyframes || {};
    const keyframesList = keyframesObj[property] || [];
    const snappedIdx = keyframesList.findIndex(k => Math.abs(k.timeMs - clipOffset) < 50);

    let updatedList = [...keyframesList];
    if (snappedIdx >= 0) {
      updatedList.splice(snappedIdx, 1);
    } else {
      let currentValue = defaultValue;
      if (property === 'scale') currentValue = transform.scale;
      else if (property === 'x') currentValue = transform.x;
      else if (property === 'y') currentValue = transform.y;
      else if (property === 'rotation') currentValue = transform.rotation;
      else if (property === 'opacity') {
        const transOpacity = selectedClip.transform?.opacity !== undefined ? selectedClip.transform.opacity : 100;
        currentValue = transOpacity;
      }
      updatedList.push({
        timeMs: clipOffset,
        value: currentValue,
        easing: 'linear'
      });
      updatedList.sort((a, b) => a.timeMs - b.timeMs);
    }
    updateClip(selectedClip.id, {
      keyframes: {
        ...keyframesObj,
        [property]: updatedList
      }
    });
  };

  const hasKeyframeAtPlayhead = (property: 'scale' | 'x' | 'y' | 'rotation' | 'opacity') => {
    if (!selectedClip) return false;
    const currentTime = useEditorStore.getState().currentTime;
    const clipOffset = currentTime - selectedClip.positionMs;
    const keyframesList = selectedClip.keyframes?.[property] || [];
    return keyframesList.some(k => Math.abs(k.timeMs - clipOffset) < 50);
  };

  const formatTime = (ms: number) => {
    const sec = (ms / 1000).toFixed(2);
    return `${sec}s`;
  };

  return (
    <div 
      className="flex flex-col h-full bg-zinc-900/50 border-l border-zinc-800 text-zinc-200"
      style={{ width, display: width === 0 ? 'none' : 'flex' }}
    >
      {/* Inspector Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-violet-400" />
          <h3 className="font-bold text-sm">Clip Inspector</h3>
        </div>
      </div>

      {/* Tabs Switcher for Video/Audio clips matching CapCut */}
      {selectedClip.type !== 'text' && (
        <div className="flex border-b border-zinc-800 px-2 py-1 gap-1 text-[10px] font-semibold bg-zinc-950/20">
          <button
            onClick={() => setActiveTab('video')}
            className={`flex-1 py-1 rounded transition text-center ${activeTab === 'video' ? 'bg-zinc-800 text-violet-400 font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            Video
          </button>
          <button
            onClick={() => setActiveTab('audio')}
            className={`flex-1 py-1 rounded transition text-center ${activeTab === 'audio' ? 'bg-zinc-800 text-violet-400 font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            Audio
          </button>
          <button
            onClick={() => setActiveTab('speed')}
            className={`flex-1 py-1 rounded transition text-center ${activeTab === 'speed' ? 'bg-zinc-800 text-violet-400 font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            Speed
          </button>
          <button
            onClick={() => setActiveTab('adjust')}
            className={`flex-1 py-1 rounded transition text-center ${activeTab === 'adjust' ? 'bg-zinc-800 text-violet-400 font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            Adjust
          </button>
          <button
            onClick={() => setActiveTab('effects')}
            className={`flex-1 py-1 rounded transition text-center ${activeTab === 'effects' ? 'bg-zinc-800 text-violet-400 font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            Effects
          </button>
        </div>
      )}

      {/* Inspector Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        
        {/* Text clip special settings (not tabbed) */}
        {selectedClip.type === 'text' && selectedClip.textSettings && (
          <div className="space-y-4">
            <h4 className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500">Text settings</h4>
            
            <div className="space-y-1">
              <label className="block text-[10px] font-semibold text-zinc-400 uppercase">Text Content</label>
              <textarea
                value={selectedClip.textSettings.content}
                onChange={(e) => handleTextSettingsChange('content', e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:border-violet-500 focus:outline-none transition resize-none h-16"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-semibold text-zinc-400 uppercase">Text Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={selectedClip.textSettings.color}
                  onChange={(e) => handleTextSettingsChange('color', e.target.value)}
                  className="w-8 h-8 rounded border border-zinc-800 bg-zinc-950 cursor-pointer"
                />
                <input
                  type="text"
                  value={selectedClip.textSettings.color}
                  onChange={(e) => handleTextSettingsChange('color', e.target.value)}
                  className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 focus:border-violet-500 focus:outline-none transition font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-semibold text-zinc-400 uppercase">Font Family</label>
              <select
                value={selectedClip.textSettings.fontFamily}
                onChange={(e) => handleTextSettingsChange('fontFamily', e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:border-violet-500 focus:outline-none transition"
              >
                <option value="Inter">Inter (Sans)</option>
                <option value="Impact">Impact (Bold)</option>
                <option value="Courier New">Courier (Mono)</option>
                <option value="Georgia">Georgia (Serif)</option>
                <option value="Arial">Arial</option>
              </select>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase">Font Size</label>
                <span className="text-[10px] font-mono text-zinc-400 font-bold">{selectedClip.textSettings.fontSize}px</span>
              </div>
              <input
                type="range"
                min={10}
                max={120}
                value={selectedClip.textSettings.fontSize}
                onChange={(e) => handleTextSettingsChange('fontSize', Number(e.target.value))}
                className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase">Vertical Position (Y)</label>
                <span className="text-[10px] font-mono text-zinc-400 font-bold">{Math.round(selectedClip.textSettings.y * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.05}
                max={0.95}
                step={0.01}
                value={selectedClip.textSettings.y}
                onChange={(e) => handleTextSettingsChange('y', Number(e.target.value))}
                className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
              />
            </div>
            
            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase">Horizontal Position (X)</label>
                <span className="text-[10px] font-mono text-zinc-400 font-bold">{Math.round(selectedClip.textSettings.x * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.05}
                max={0.95}
                step={0.01}
                value={selectedClip.textSettings.x}
                onChange={(e) => handleTextSettingsChange('x', Number(e.target.value))}
                className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Tab 1: Video Settings (Transforms & Trim offsets) */}
        {selectedClip.type !== 'text' && activeTab === 'video' && (
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
                  <input
                    type="range"
                    min={10}
                    max={200}
                    value={transform.scale}
                    onChange={(e) => handleTransformChange('scale', Number(e.target.value))}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
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
                  <input
                    type="range"
                    min={-480}
                    max={480}
                    value={transform.x}
                    onChange={(e) => handleTransformChange('x', Number(e.target.value))}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
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
                  <input
                    type="range"
                    min={-270}
                    max={270}
                    value={transform.y}
                    onChange={(e) => handleTransformChange('y', Number(e.target.value))}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
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
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={transform.rotation}
                    onChange={(e) => handleTransformChange('rotation', Number(e.target.value))}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
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
                          value={Math.round(transform.opacity !== undefined ? transform.opacity : 100)}
                          min={0}
                          max={100}
                          onChange={(e) => handleTransformChange('opacity', Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                          className="w-10 text-right bg-[#121214] border border-[#2c2c32] rounded px-1 py-0.5 text-[10px] font-mono text-zinc-300 focus:border-violet-500 focus:outline-none"
                        />
                        <span className="text-[10px] text-zinc-500 font-mono">%</span>
                      </div>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={transform.opacity !== undefined ? transform.opacity : 100}
                    onChange={(e) => handleTransformChange('opacity', Number(e.target.value))}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
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
                      onClick={async () => {
                        if (!selectedClip?.assetId || !project) return;
                        setWmStatus('processing');
                        setWmProgress(0);
                        setWmError(null);
                        try {
                          const asset = await db.assets.get(selectedClip.assetId);
                          if (!asset) throw new Error('Asset not found in database.');
                          const newAsset = await removeWatermark(
                            asset,
                            null, // null region triggers fully automatic scan
                            project.id,
                            (p) => setWmProgress(Math.round(p * 100))
                          );
                          await updateClip(selectedClip.id, { assetId: newAsset.id, name: newAsset.name });
                          setWmStatus('done');
                        } catch (err: any) {
                          console.error('[Watermark Removal Error]', err);
                          setWmStatus('error');
                          setWmError(err?.message ?? String(err));
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[10px] font-bold transition bg-violet-700 hover:bg-violet-600 text-white cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Auto Detect & Remove
                    </button>
                    
                    <button
                      onClick={() => setIsDrawModalOpen(true)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[10px] font-semibold transition border bg-zinc-900/50 border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-300 cursor-pointer"
                    >
                      <Crosshair className="w-3.5 h-3.5" /> Draw Region (Manual Fallback)
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
        )}

        {/* Tab 2: Audio Settings (Volume & Fades) */}
        {selectedClip.type !== 'text' && activeTab === 'audio' && (
          <div className="space-y-5">
            <h4 className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500 flex items-center gap-1">
              <Volume2 className="w-3.5 h-3.5 text-violet-400" /> Audio controls
            </h4>
            
            <div className="space-y-4">
              {/* Volume Slider */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="text-[10px] font-semibold text-zinc-400 uppercase">Volume</label>
                  <span className="text-[10px] font-mono text-zinc-400 font-bold">{selectedClip.volume !== undefined ? selectedClip.volume : 100}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={selectedClip.volume !== undefined ? selectedClip.volume : 100}
                  onChange={(e) => updateClip(selectedClip.id, { volume: Number(e.target.value) })}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                />
              </div>

              {/* Fade In */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="text-[10px] font-semibold text-zinc-400 uppercase">Fade In Duration</label>
                  <span className="text-[10px] font-mono text-zinc-400 font-bold">{((selectedClip.fadeInMs || 0) / 1000).toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2000}
                  step={100}
                  value={selectedClip.fadeInMs || 0}
                  onChange={(e) => updateClip(selectedClip.id, { fadeInMs: Number(e.target.value) })}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                />
              </div>

              {/* Fade Out */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="text-[10px] font-semibold text-zinc-400 uppercase">Fade Out Duration</label>
                  <span className="text-[10px] font-mono text-zinc-400 font-bold">{((selectedClip.fadeOutMs || 0) / 1000).toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2000}
                  step={100}
                  value={selectedClip.fadeOutMs || 0}
                  onChange={(e) => updateClip(selectedClip.id, { fadeOutMs: Number(e.target.value) })}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                />
              </div>

              {/* EQ Controls */}
              <div className="space-y-4 pt-4 border-t border-zinc-800">
                <h4 className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500">3-Band EQ Mixer</h4>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <label className="text-[10px] font-semibold text-zinc-400 uppercase">Low (Bass)</label>
                      <span className="text-[10px] font-mono text-zinc-400 font-bold">{(selectedClip.audioEQ?.low || 0)} dB</span>
                    </div>
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      value={selectedClip.audioEQ?.low || 0}
                      onChange={(e) => {
                        const current = selectedClip.audioEQ || { low: 0, mid: 0, high: 0 };
                        updateClip(selectedClip.id, { audioEQ: { ...current, low: Number(e.target.value) } });
                      }}
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <label className="text-[10px] font-semibold text-zinc-400 uppercase">Mid (Vocals)</label>
                      <span className="text-[10px] font-mono text-zinc-400 font-bold">{(selectedClip.audioEQ?.mid || 0)} dB</span>
                    </div>
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      value={selectedClip.audioEQ?.mid || 0}
                      onChange={(e) => {
                        const current = selectedClip.audioEQ || { low: 0, mid: 0, high: 0 };
                        updateClip(selectedClip.id, { audioEQ: { ...current, mid: Number(e.target.value) } });
                      }}
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <label className="text-[10px] font-semibold text-zinc-400 uppercase">High (Treble)</label>
                      <span className="text-[10px] font-mono text-zinc-400 font-bold">{(selectedClip.audioEQ?.high || 0)} dB</span>
                    </div>
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      value={selectedClip.audioEQ?.high || 0}
                      onChange={(e) => {
                        const current = selectedClip.audioEQ || { low: 0, mid: 0, high: 0 };
                        updateClip(selectedClip.id, { audioEQ: { ...current, high: Number(e.target.value) } });
                      }}
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Speed Controls */}
        {selectedClip.type !== 'text' && activeTab === 'speed' && (
          <div className="space-y-5">
            <h4 className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500 flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5 text-violet-400" /> Playback speed
            </h4>

            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase">Speed Multiplier</label>
                <span className="text-[10px] font-mono text-zinc-400 font-bold">{(selectedClip.speed || 1.0).toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.25}
                max={4.0}
                step={0.05}
                value={selectedClip.speed || 1.0}
                onChange={(e) => {
                  const newSpeed = Number(e.target.value);
                  const sourceDuration = selectedClip.trimEndMs - selectedClip.trimStartMs;
                  const newDur = Math.round(sourceDuration / newSpeed);
                  updateClip(selectedClip.id, {
                    speed: newSpeed,
                    durationMs: newDur
                  });
                }}
                className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
              />
              <div className="flex justify-between text-[8px] text-zinc-550 font-semibold px-1 select-none">
                <span>0.25x</span>
                <span>1.0x (Normal)</span>
                <span>4.0x</span>
              </div>
            </div>

            {/* Preset Speed Buttons */}
            <div className="space-y-2 pt-3 border-t border-zinc-800">
              <label className="text-[10px] font-semibold text-zinc-400 uppercase">Speed Presets</label>
              <div className="grid grid-cols-3 gap-1.5">
                {[0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0].map(sp => (
                  <button
                    key={sp}
                    onClick={() => {
                      const sourceDuration = selectedClip.trimEndMs - selectedClip.trimStartMs;
                      updateClip(selectedClip.id, { speed: sp, durationMs: Math.round(sourceDuration / sp) });
                    }}
                    className={`py-1 rounded text-[9px] font-bold border transition ${
                      Math.abs((selectedClip.speed || 1.0) - sp) < 0.01
                        ? 'bg-violet-700 border-violet-500 text-white'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-violet-600 hover:text-zinc-200'
                    }`}
                  >
                    {sp}x
                  </button>
                ))}
              </div>
            </div>

            {/* Velocity Curve Ramp Selector */}
            <div className="space-y-2 pt-3 border-t border-zinc-800">
              <label className="text-[10px] font-semibold text-zinc-400 uppercase">Velocity Ramp Curve</label>
              <p className="text-[9px] text-zinc-600">Shape how speed changes over the clip's duration (CapCut-style ramp).</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'none', label: 'No Ramp', desc: 'Constant speed', icon: '─' },
                  { id: 'slow-in', label: 'Slow In', desc: 'Decelerates at start', icon: '╱' },
                  { id: 'slow-out', label: 'Slow Out', desc: 'Decelerates at end', icon: '╲' },
                  { id: 'slow-in-out', label: 'Slow In+Out', desc: 'Ease in & out', icon: '∫' },
                  { id: 'fast-in', label: 'Fast In', desc: 'Accelerates at start', icon: '⌒' },
                  { id: 'montage', label: 'Montage', desc: 'Fast–Slow–Fast rhythm', icon: '≋' },
                ].map(curve => {
                  const curveId = (selectedClip as any).velocityCurve || 'none';
                  return (
                    <button
                      key={curve.id}
                      onClick={() => updateClip(selectedClip.id, { velocityCurve: curve.id } as any)}
                      className={`p-2 rounded-lg border text-left text-[9px] transition ${
                        curveId === curve.id
                          ? 'bg-violet-900/40 border-violet-600 text-violet-300'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-violet-700 hover:text-zinc-200'
                      }`}
                    >
                      <div className="font-bold text-base leading-none mb-0.5">{curve.icon}</div>
                      <div className="font-bold text-zinc-200">{curve.label}</div>
                      <div className="text-zinc-500">{curve.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Freeze Frame */}
            <div className="space-y-2 pt-3 border-t border-zinc-800">
              <label className="text-[10px] font-semibold text-zinc-400 uppercase">Freeze Frame</label>
              <p className="text-[9px] text-zinc-600">Lock playback at the current playhead frame position.</p>
              <button
                onClick={() => {
                  const currentT = useEditorStore.getState().currentTime;
                  const clipOffset = currentT - selectedClip.positionMs;
                  if (clipOffset < 0 || clipOffset > selectedClip.durationMs) {
                    alert('Move playhead over the clip to set a freeze frame.');
                    return;
                  }
                  updateClip(selectedClip.id, { speed: 0.001, durationMs: 2000 } as any);
                }}
                className="w-full py-2 bg-zinc-900 border border-zinc-700 hover:border-violet-600 text-zinc-300 hover:text-zinc-100 rounded-lg text-[10px] font-semibold transition"
              >
                ❄ Set Freeze Frame (2s)
              </button>
            </div>
          </div>
        )}

        {/* Tab 4: Color adjust & Filters */}
        {selectedClip.type !== 'text' && activeTab === 'adjust' && (
          <div className="space-y-6">
            {/* Color adjustments */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500 flex items-center gap-1">
                <Palette className="w-3.5 h-3.5 text-violet-400" /> Color adjustments
              </h4>
              
              <div className="space-y-3.5">
                {/* Brightness */}
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-semibold text-zinc-400 uppercase">Brightness</label>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold">{colorAdjustments.brightness}%</span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={150}
                    value={colorAdjustments.brightness}
                    onChange={(e) => handleColorChange('brightness', Number(e.target.value))}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                  />
                </div>

                {/* Contrast */}
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-semibold text-zinc-400 uppercase">Contrast</label>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold">{colorAdjustments.contrast}%</span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={150}
                    value={colorAdjustments.contrast}
                    onChange={(e) => handleColorChange('contrast', Number(e.target.value))}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                  />
                </div>

                {/* Saturation */}
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-semibold text-zinc-400 uppercase">Saturation</label>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold">{colorAdjustments.saturation}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={colorAdjustments.saturation}
                    onChange={(e) => handleColorChange('saturation', Number(e.target.value))}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                  />
                </div>

                {/* Temperature */}
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-semibold text-zinc-400 uppercase">Temperature</label>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold">{colorAdjustments.temp > 0 ? `+${colorAdjustments.temp}` : colorAdjustments.temp}</span>
                  </div>
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    value={colorAdjustments.temp}
                    onChange={(e) => handleColorChange('temp', Number(e.target.value))}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                  />
                </div>

                {/* Vignette */}
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-semibold text-zinc-400 uppercase">Vignette</label>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold">{colorAdjustments.vignette}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={colorAdjustments.vignette}
                    onChange={(e) => handleColorChange('vignette', Number(e.target.value))}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Cinematic filters */}
            <div className="space-y-4 pt-4 border-t border-zinc-800">
              <h4 className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500 flex items-center gap-1">
                <Eye className="w-3.5 h-3.5 text-violet-400" /> Cinematic filters
              </h4>

              <div className="space-y-3.5">
                <div className="space-y-1">
                  <label className="block text-[10px] font-semibold text-zinc-400 uppercase">Preset Filter</label>
                  <select
                    value={filterSettings.type}
                    onChange={(e) => handleFilterChange('type', e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-violet-500 transition"
                  >
                    <option value="none">None (No Filter)</option>
                    <option value="cinematic">Cinematic Blue</option>
                    <option value="bw">Noir B&W (Monochrome)</option>
                    <option value="vintage">Vintage Retro</option>
                    <option value="warm">Golden Warm</option>
                    <option value="cool">Teal Cool</option>
                    <option value="cyberpunk">Cyberpunk Neon</option>
                    <option value="sepia">Rustic Sepia</option>
                    <option value="pastel">Dreamy Pastel</option>
                    <option value="forest">Forest Green</option>
                    <option value="polaroid">Polaroid Film</option>
                    <option value="vaporwave">Vaporwave</option>
                  </select>
                </div>

                {filterSettings.type !== 'none' && (
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <label className="text-[10px] font-semibold text-zinc-400 uppercase">Filter Intensity</label>
                      <span className="text-[10px] font-mono text-zinc-400 font-bold">{filterSettings.intensity}%</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={filterSettings.intensity}
                      onChange={(e) => handleFilterChange('intensity', Number(e.target.value))}
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* HSL Adjustments */}
            <div className="space-y-4 pt-4 border-t border-zinc-800">
              <h4 className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500">HSL Color Shift</h4>
              <div className="space-y-3.5">
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-semibold text-zinc-400 uppercase">Hue Shift</label>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold">{selectedClip.hslAdjustments?.hue || 0}°</span>
                  </div>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={selectedClip.hslAdjustments?.hue || 0}
                    onChange={(e) => {
                      const current = selectedClip.hslAdjustments || { hue: 0, saturation: 0, lightness: 0 };
                      updateClip(selectedClip.id, { hslAdjustments: { ...current, hue: Number(e.target.value) } });
                    }}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-semibold text-zinc-400 uppercase">Saturation Shift</label>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold">{selectedClip.hslAdjustments?.saturation || 0}%</span>
                  </div>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={selectedClip.hslAdjustments?.saturation || 0}
                    onChange={(e) => {
                      const current = selectedClip.hslAdjustments || { hue: 0, saturation: 0, lightness: 0 };
                      updateClip(selectedClip.id, { hslAdjustments: { ...current, saturation: Number(e.target.value) } });
                    }}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-semibold text-zinc-400 uppercase">Lightness Shift</label>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold">{selectedClip.hslAdjustments?.lightness || 0}%</span>
                  </div>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={selectedClip.hslAdjustments?.lightness || 0}
                    onChange={(e) => {
                      const current = selectedClip.hslAdjustments || { hue: 0, saturation: 0, lightness: 0 };
                      updateClip(selectedClip.id, { hslAdjustments: { ...current, lightness: Number(e.target.value) } });
                    }}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Lift/Gamma/Gain Shadows+Mids+Highlights */}
            <div className="space-y-4 pt-4 border-t border-zinc-800">
              <h4 className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500">Lift / Gamma / Gain</h4>
              <p className="text-[9px] text-zinc-600">Adjust shadows (Lift), midtones (Gamma) and highlights (Gain) per-channel.</p>
              {(['r','g','b'] as const).map(ch => {
                const labels: Record<string, string> = { r: 'Red', g: 'Green', b: 'Blue' };
                const colors: Record<string, string> = { r: 'accent-red-500', g: 'accent-green-500', b: 'accent-blue-500' };
                const cc = selectedClip.colorCorrection || {};
                const liftVal = (cc.lift as any)?.[ch] ?? 0;
                const gammaVal = (cc.gamma as any)?.[ch] ?? 0;
                const gainVal = (cc.gain as any)?.[ch] ?? 0;
                return (
                  <div key={ch} className="space-y-2 p-2 bg-zinc-950/40 rounded-lg border border-zinc-800">
                    <p className="text-[10px] font-bold text-zinc-300 uppercase">{labels[ch]} Channel</p>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <label className="text-[9px] text-zinc-500">Lift (Shadows)</label>
                        <span className="text-[9px] font-mono text-zinc-400">{liftVal}</span>
                      </div>
                      <input type="range" min={-50} max={50} value={liftVal}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          updateClip(selectedClip.id, { colorCorrection: { ...selectedClip.colorCorrection, lift: { ...((selectedClip.colorCorrection?.lift) || {r:0,g:0,b:0}), [ch]: v } } });
                        }}
                        className={`w-full h-0.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer ${colors[ch]} focus:outline-none`} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <label className="text-[9px] text-zinc-500">Gamma (Mids)</label>
                        <span className="text-[9px] font-mono text-zinc-400">{gammaVal}</span>
                      </div>
                      <input type="range" min={-50} max={50} value={gammaVal}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          updateClip(selectedClip.id, { colorCorrection: { ...selectedClip.colorCorrection, gamma: { ...((selectedClip.colorCorrection?.gamma) || {r:0,g:0,b:0}), [ch]: v } } });
                        }}
                        className={`w-full h-0.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer ${colors[ch]} focus:outline-none`} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <label className="text-[9px] text-zinc-500">Gain (Highlights)</label>
                        <span className="text-[9px] font-mono text-zinc-400">{gainVal}</span>
                      </div>
                      <input type="range" min={-50} max={50} value={gainVal}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          updateClip(selectedClip.id, { colorCorrection: { ...selectedClip.colorCorrection, gain: { ...((selectedClip.colorCorrection?.gain) || {r:0,g:0,b:0}), [ch]: v } } });
                        }}
                        className={`w-full h-0.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer ${colors[ch]} focus:outline-none`} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* .cube LUT File Import */}
            <div className="space-y-2 pt-4 border-t border-zinc-800">
              <h4 className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500">3D LUT Import (.cube)</h4>
              <p className="text-[9px] text-zinc-600">Import a professional .cube LUT file for cinematic color grading.</p>
              {selectedClip.colorCorrection?.lutContent ? (
                <div className="flex items-center gap-2 p-2 bg-violet-950/30 border border-violet-800 rounded-lg">
                  <span className="text-[9px] text-violet-300 flex-1">✓ LUT loaded ({Math.round(selectedClip.colorCorrection.lutContent.length / 1024)}KB)</span>
                  <button
                    onClick={() => updateClip(selectedClip.id, { colorCorrection: { ...selectedClip.colorCorrection, lutContent: undefined } })}
                    className="text-[9px] text-red-400 hover:text-red-300 transition"
                  >Remove</button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-1.5 w-full py-2 bg-zinc-900 border border-dashed border-zinc-700 hover:border-violet-600 rounded-lg cursor-pointer text-[10px] text-zinc-400 hover:text-zinc-200 transition">
                  <input
                    type="file"
                    accept=".cube"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const text = ev.target?.result as string;
                        updateClip(selectedClip.id, { colorCorrection: { ...selectedClip.colorCorrection, lutContent: text } });
                      };
                      reader.readAsText(file);
                    }}
                  />
                  ⊕ Import .cube LUT
                </label>
              )}
            </div>
          </div>
        )}

        {/* Tab 5: Effects & Transitions */}
        {selectedClip.type !== 'text' && activeTab === 'effects' && (
          <div className="space-y-6">
            {/* Active Transition Section */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500 flex items-center gap-1">
                <Scissors className="w-3.5 h-3.5 text-violet-400" /> Active Transition
              </h4>

              {(() => {
                const trans = selectedClip.transitionIn || (selectedClip.transitionType && selectedClip.transitionType !== 'none'
                  ? { type: selectedClip.transitionType, durationMs: selectedClip.fadeInMs || 1000, easing: 'ease-in-out' }
                  : null);

                if (!trans || trans.type === 'none') {
                  return (
                    <div className="text-[10px] text-zinc-500 italic p-3 bg-zinc-950/20 border border-zinc-800/50 rounded-lg text-center">
                      No transition applied. Drag a transition from the Transitions tab to apply.
                    </div>
                  );
                }

                return (
                  <div className="bg-zinc-950/40 border border-zinc-800 rounded-lg p-3 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-violet-300 capitalize">{trans.type}</span>
                      <button
                        onClick={() => updateClip(selectedClip.id, { transitionType: 'none', fadeInMs: 0, transitionIn: undefined })}
                        className="text-[9px] font-semibold text-red-400 hover:text-red-300 transition uppercase tracking-wider"
                      >
                        Remove
                      </button>
                    </div>

                    {/* Transition Duration Slider */}
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <label className="text-[9px] font-semibold text-zinc-400 uppercase">Duration</label>
                        <span className="text-[9px] font-mono text-zinc-400 font-bold">{(trans.durationMs / 1000).toFixed(1)}s</span>
                      </div>
                      <input
                        type="range"
                        min={200}
                        max={3000}
                        step={100}
                        value={trans.durationMs}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          updateClip(selectedClip.id, {
                            fadeInMs: val,
                            transitionIn: { ...trans, durationMs: val }
                          });
                        }}
                        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                      />
                    </div>

                    {/* Transition Easing Selector */}
                    <div className="space-y-1">
                      <label className="block text-[9px] font-semibold text-zinc-400 uppercase">Easing Curve</label>
                      <select
                        value={trans.easing || 'ease-in-out'}
                        onChange={(e) => {
                          updateClip(selectedClip.id, {
                            transitionIn: { ...trans, easing: e.target.value as any }
                          });
                        }}
                        className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px] text-zinc-200 focus:outline-none focus:border-violet-500 transition"
                      >
                        <option value="linear">Linear (Constant speed)</option>
                        <option value="ease-in-out">Ease In + Out (Smooth)</option>
                        <option value="ease-in">Ease In (Accelerating)</option>
                        <option value="ease-out">Ease Out (Decelerating)</option>
                      </select>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Active Video Effects Section */}
            <div className="space-y-4 pt-4 border-t border-zinc-800">
              <h4 className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-violet-400" /> Active Video Effects
              </h4>

              {(() => {
                const effects = selectedClip.videoEffects || [];
                if (effects.length === 0) {
                  return (
                    <div className="text-[10px] text-zinc-500 italic p-3 bg-zinc-950/20 border border-zinc-800/50 rounded-lg text-center">
                      No effects applied. Drag an effect from the Effects tab to apply.
                    </div>
                  );
                }

                return (
                  <div className="space-y-2">
                    {effects.map((eff: any) => {
                      const def = EFFECTS_REGISTRY[eff.id];
                      return (
                        <div key={eff.id} className="bg-zinc-950/40 border border-zinc-800 rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-violet-300">{def?.name || eff.id}</span>
                            <button
                              onClick={() => {
                                const newEffects = effects.filter((e: any) => e.id !== eff.id);
                                updateClip(selectedClip.id, { videoEffects: newEffects });
                              }}
                              className="text-[9px] font-semibold text-red-400 hover:text-red-300 transition uppercase tracking-wider"
                            >
                              Remove
                            </button>
                          </div>

                          {/* Effect Intensity */}
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <label className="text-[9px] font-semibold text-zinc-400 uppercase">Intensity</label>
                              <span className="text-[9px] font-mono text-zinc-400 font-bold">{eff.intensity}</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={eff.intensity}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                const newEffects = effects.map((e: any) => e.id === eff.id ? { ...e, intensity: val } : e);
                                updateClip(selectedClip.id, { videoEffects: newEffects });
                              }}
                              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {isDrawModalOpen && currentAsset && (
        <WatermarkDrawModal
          asset={currentAsset}
          initialTimeMs={(currentTime - selectedClip.positionMs) + selectedClip.trimStartMs}
          onClose={() => setIsDrawModalOpen(false)}
          onConfirm={(region) => {
            setWatermarkRegion(region);
            setIsDrawModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
