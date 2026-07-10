import { useState, useEffect } from 'react';
import { Sliders } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import { db, type Asset } from '../../lib/db';
import WatermarkDrawModal from './WatermarkDrawModal';
import VideoTab from './inspector/VideoTab';
import AudioTab from './inspector/AudioTab';
import SpeedTab from './inspector/SpeedTab';
import AdjustTab from './inspector/AdjustTab';
import EffectsTab from './inspector/EffectsTab';
import TextTab from './inspector/TextTab';

export default function ClipInspector({ width }: { width: number }) {
  const project = useEditorStore(state => state.project);
  const selectedClipId = useEditorStore(state => state.selectedClipId);
  const updateClip = useEditorStore(state => state.updateClip);
  const watermarkRegion = useEditorStore(state => state.watermarkRegion);
  const setWatermarkRegion = useEditorStore(state => state.setWatermarkRegion);

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
        style={{ 
          width: window.innerWidth < 1024 ? '100%' : width, 
          display: width === 0 ? 'none' : 'flex' 
        }}
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



  return (
    <div 
      className="flex flex-col h-full bg-zinc-900/50 border-l border-zinc-800 text-zinc-200"
      style={{ 
        width: window.innerWidth < 1024 ? '100%' : width, 
        display: width === 0 ? 'none' : 'flex' 
      }}
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
        
        {/* Text clip special settings */}
        {selectedClip.type === 'text' && selectedClip.textSettings && (
          <TextTab
            selectedClip={selectedClip}
            handleTextSettingsChange={handleTextSettingsChange}
          />
        )}
        {/* Shape clip special settings */}
        {selectedClip.shapeSettings && (
          <div className="flex flex-col gap-4 border border-zinc-800 bg-zinc-950/20 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-200 capitalize">{selectedClip.shapeSettings.type} Shape</span>
              <span className="text-[9px] font-mono text-zinc-500">VECTOR ELEMENT</span>
            </div>

             {/* Fill Color */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] text-gray-400 font-semibold">Fill Color</label>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={selectedClip.shapeSettings.color || '#8b5cf6'} 
                  onChange={(e) => {
                    updateClip(selectedClip.id, {
                      shapeSettings: {
                        ...selectedClip.shapeSettings,
                        color: e.target.value
                      } as any
                    });
                  }}
                  className="w-8 h-8 rounded bg-transparent border-0 cursor-pointer"
                />
                {/* Palette presets */}
                <div className="flex gap-1.5 flex-wrap">
                  {/* No Color Button */}
                  <button
                    onClick={() => {
                      updateClip(selectedClip.id, {
                        shapeSettings: {
                          ...selectedClip.shapeSettings,
                          color: 'transparent'
                        } as any
                      });
                    }}
                    className={`w-5 h-5 rounded-full border cursor-pointer hover:scale-110 transition relative bg-zinc-800 flex items-center justify-center overflow-hidden ${selectedClip.shapeSettings?.color === 'transparent' || selectedClip.shapeSettings?.color === 'none' ? 'border-sky-500 shadow-md shadow-sky-500/20' : 'border-white/20'}`}
                    title="No Fill (Transparent)"
                  >
                    <div className="absolute w-[1.5px] h-full bg-red-500 rotate-45" />
                  </button>

                  {['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ffffff', '#000000'].map(c => (
                    <button
                      key={c}
                      onClick={() => {
                        updateClip(selectedClip.id, {
                          shapeSettings: {
                            ...selectedClip.shapeSettings,
                            color: c
                          } as any
                        });
                      }}
                      className={`w-5 h-5 rounded-full border cursor-pointer hover:scale-110 transition ${selectedClip.shapeSettings?.color === c ? 'border-sky-500 shadow-md shadow-sky-500/20' : 'border-white/10'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Stroke Color */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] text-gray-400 font-semibold">Outline Color</label>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={selectedClip.shapeSettings.strokeColor || '#ffffff'} 
                  onChange={(e) => {
                    updateClip(selectedClip.id, {
                      shapeSettings: {
                        ...selectedClip.shapeSettings,
                        strokeColor: e.target.value
                      } as any
                    });
                  }}
                  className="w-8 h-8 rounded bg-transparent border-0 cursor-pointer"
                />
                {/* Palette presets */}
                <div className="flex gap-1.5 flex-wrap">
                  {/* No Outline Button */}
                  <button
                    onClick={() => {
                      updateClip(selectedClip.id, {
                        shapeSettings: {
                          ...selectedClip.shapeSettings,
                          strokeColor: 'transparent'
                        } as any
                      });
                    }}
                    className={`w-5 h-5 rounded-full border cursor-pointer hover:scale-110 transition relative bg-zinc-800 flex items-center justify-center overflow-hidden ${selectedClip.shapeSettings?.strokeColor === 'transparent' || selectedClip.shapeSettings?.strokeColor === 'none' ? 'border-sky-500 shadow-md shadow-sky-500/20' : 'border-white/20'}`}
                    title="No Outline (Transparent)"
                  >
                    <div className="absolute w-[1.5px] h-full bg-red-500 rotate-45" />
                  </button>

                  {['#ffffff', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#000000'].map(c => (
                    <button
                      key={c}
                      onClick={() => {
                        updateClip(selectedClip.id, {
                          shapeSettings: {
                            ...selectedClip.shapeSettings,
                            strokeColor: c
                          } as any
                        });
                      }}
                      className={`w-5 h-5 rounded-full border cursor-pointer hover:scale-110 transition ${selectedClip.shapeSettings?.strokeColor === c ? 'border-sky-500 shadow-md shadow-sky-500/20' : 'border-white/10'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Stroke Width */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-[10px] text-gray-400 font-semibold">
                <span>Outline Width</span>
                <span className="font-mono text-gray-300">{selectedClip.shapeSettings.strokeWidth !== undefined ? selectedClip.shapeSettings.strokeWidth : 3}px</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="20" 
                value={selectedClip.shapeSettings.strokeWidth !== undefined ? selectedClip.shapeSettings.strokeWidth : 3} 
                onChange={(e) => {
                  updateClip(selectedClip.id, {
                    shapeSettings: {
                      ...selectedClip.shapeSettings,
                      strokeWidth: Number(e.target.value)
                    } as any
                  });
                }}
                className="w-full h-1 bg-[#121214] rounded-lg appearance-none cursor-pointer accent-sky-500 focus:outline-none"
              />
            </div>

            {/* Shape Original Size (Width & Height) */}
            <div className="flex flex-col gap-3 border-t border-zinc-800/80 pt-3">
              <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wide">Shape Dimensions</span>

              {/* Width */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[10px] text-gray-400 font-semibold">
                  <span>Width</span>
                  <span className="font-mono text-gray-300">{selectedClip.shapeSettings?.width || 300}px</span>
                </div>
                <input 
                  type="range" 
                  min="20" 
                  max="1000" 
                  value={selectedClip.shapeSettings?.width || 300} 
                  onChange={(e) => {
                    updateClip(selectedClip.id, {
                      shapeSettings: {
                        ...selectedClip.shapeSettings,
                        width: Number(e.target.value)
                      } as any
                    });
                  }}
                  className="w-full h-1 bg-[#121214] rounded-lg appearance-none cursor-pointer accent-sky-500 focus:outline-none"
                />
              </div>

              {/* Height */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[10px] text-gray-400 font-semibold">
                  <span>Height</span>
                  <span className="font-mono text-gray-300">{selectedClip.shapeSettings?.height || 300}px</span>
                </div>
                <input 
                  type="range" 
                  min="20" 
                  max="1000" 
                  value={selectedClip.shapeSettings?.height || 300} 
                  onChange={(e) => {
                    updateClip(selectedClip.id, {
                      shapeSettings: {
                        ...selectedClip.shapeSettings,
                        height: Number(e.target.value)
                      } as any
                    });
                  }}
                  className="w-full h-1 bg-[#121214] rounded-lg appearance-none cursor-pointer accent-sky-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Manual Scale, Position & Rotation */}
            <div className="border-t border-zinc-800/80 pt-3 flex flex-col gap-3">
              <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wide">Transform Controls</span>
              
              {/* Scale */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[10px] text-gray-400 font-semibold">
                  <span>Scale</span>
                  <span className="font-mono text-gray-300">{transform.scale}%</span>
                </div>
                <input 
                  type="range" 
                  min="5" 
                  max="300" 
                  value={transform.scale} 
                  onChange={(e) => handleTransformChange('scale', Number(e.target.value))}
                  className="w-full h-1 bg-[#121214] rounded-lg appearance-none cursor-pointer accent-sky-500 focus:outline-none"
                />
              </div>

              {/* Position X */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[10px] text-gray-400 font-semibold">
                  <span>Position X</span>
                  <span className="font-mono text-gray-300">{transform.x}px</span>
                </div>
                <input 
                  type="range" 
                  min="-1000" 
                  max="1000" 
                  value={transform.x} 
                  onChange={(e) => handleTransformChange('x', Number(e.target.value))}
                  className="w-full h-1 bg-[#121214] rounded-lg appearance-none cursor-pointer accent-sky-500 focus:outline-none"
                />
              </div>

              {/* Position Y */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[10px] text-gray-400 font-semibold">
                  <span>Position Y</span>
                  <span className="font-mono text-gray-300">{transform.y}px</span>
                </div>
                <input 
                  type="range" 
                  min="-1000" 
                  max="1000" 
                  value={transform.y} 
                  onChange={(e) => handleTransformChange('y', Number(e.target.value))}
                  className="w-full h-1 bg-[#121214] rounded-lg appearance-none cursor-pointer accent-sky-500 focus:outline-none"
                />
              </div>

              {/* Rotation */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[10px] text-gray-400 font-semibold">
                  <span>Rotation</span>
                  <span className="font-mono text-gray-300">{transform.rotation}°</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="360" 
                  value={transform.rotation} 
                  onChange={(e) => handleTransformChange('rotation', Number(e.target.value))}
                  className="w-full h-1 bg-[#121214] rounded-lg appearance-none cursor-pointer accent-sky-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 1: Video Settings (Transforms & Trim offsets) */}
        {selectedClip.type !== 'text' && activeTab === 'video' && (
          <VideoTab
            selectedClip={selectedClip}
            project={project}
            updateClip={updateClip}
            transform={transform}
            handleTransformChange={handleTransformChange}
            handleResetTransform={handleResetTransform}
            toggleKeyframe={toggleKeyframe}
            hasKeyframeAtPlayhead={hasKeyframeAtPlayhead}
            currentAsset={currentAsset}
            wmStatus={wmStatus}
            setWmStatus={setWmStatus}
            wmProgress={wmProgress}
            setWmProgress={setWmProgress}
            wmError={wmError}
            setWmError={setWmError}
            watermarkRegion={watermarkRegion}
            setWatermarkRegion={setWatermarkRegion}
            setIsDrawModalOpen={setIsDrawModalOpen}
          />
        )}

        {/* Tab 2: Audio Settings (Volume & Fades) */}
        {selectedClip.type !== 'text' && activeTab === 'audio' && (
          <AudioTab
            selectedClip={selectedClip}
            updateClip={updateClip}
          />
        )}

        {/* Tab 3: Speed Controls */}
        {selectedClip.type !== 'text' && activeTab === 'speed' && (
          <SpeedTab
            selectedClip={selectedClip}
            updateClip={updateClip}
          />
        )}

        {/* Tab 4: Color adjust & Filters */}
        {selectedClip.type !== 'text' && activeTab === 'adjust' && (
          <AdjustTab
            selectedClip={selectedClip}
            updateClip={updateClip}
            colorAdjustments={colorAdjustments}
            filterSettings={filterSettings}
            handleColorChange={handleColorChange}
            handleFilterChange={handleFilterChange}
          />
        )}

        {/* Tab 5: Effects & Transitions */}
        {selectedClip.type !== 'text' && activeTab === 'effects' && (
          <EffectsTab
            selectedClip={selectedClip}
            updateClip={updateClip}
          />
        )}
      </div>

      {isDrawModalOpen && currentAsset && (
        <WatermarkDrawModal
          asset={currentAsset}
          initialTimeMs={(useEditorStore.getState().currentTime - selectedClip.positionMs) + selectedClip.trimStartMs}
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
