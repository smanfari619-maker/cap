import React, { useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, ChevronDown, Check, Tv, Maximize2, Columns } from 'lucide-react';
import { useEditorStore } from '../../../store/editorStore';
import { db } from '../../../lib/db';

interface PlaybackControlsProps {
  project: any;
  totalDuration: number;
  assetsLoaded: boolean;
  isPlaying: boolean;
  upscaleEnabled: boolean;
  showSafeZone: boolean;
  setShowSafeZone: (show: boolean) => void;
  compareMode: boolean;
  setCompareMode: (show: boolean) => void;
  scrubberRef: React.RefObject<HTMLInputElement | null>;
  mobileTimecodeRef: React.RefObject<HTMLSpanElement | null>;
  desktopTimecodeRef: React.RefObject<HTMLSpanElement | null>;
  setCurrentTime: (ms: number) => void;
  togglePlay: () => void;
  handleFullscreen: () => void;
}

export default function PlaybackControls({
  project,
  totalDuration,
  assetsLoaded,
  isPlaying,
  upscaleEnabled: _upscaleEnabled,
  showSafeZone,
  setShowSafeZone,
  compareMode,
  setCompareMode,
  scrubberRef,
  mobileTimecodeRef,
  desktopTimecodeRef,
  setCurrentTime,
  togglePlay,
  handleFullscreen
}: PlaybackControlsProps) {

  const [showRatioDropdown, setShowRatioDropdown] = useState(false);
  const [isEditingTimecode, setIsEditingTimecode] = useState(false);
  const [timecodeInputVal, setTimecodeInputVal] = useState('');

  const ratioOptions = [
    { id: 'original', label: 'Original', ratio: null },
    { id: 'custom', label: 'Custom', ratio: null },
    { type: 'separator' },
    { id: '16:9', label: '16:9', ratio: 16/9, iconStyle: 'w-4 h-2.5' },
    { id: '4:3', label: '4:3', ratio: 4/3, iconStyle: 'w-3.5 h-2.7' },
    { id: '2.35:1', label: '2.35:1', ratio: 2.35, iconStyle: 'w-4.5 h-2' },
    { id: '2:1', label: '2:1', ratio: 2.0, iconStyle: 'w-4 h-2' },
    { id: '1.85:1', label: '1.85:1', ratio: 1.85, iconStyle: 'w-4 h-2.2' },
    { type: 'separator' },
    { id: '9:16', label: '9:16', ratio: 9/16, iconStyle: 'w-2 h-3.5' },
    { id: '3:4', label: '3:4', ratio: 3/4, iconStyle: 'w-2.5 h-3.5' },
    { id: '5.8-inch', label: '5.8-inch', ratio: 9/19.5, iconStyle: 'w-1.8 h-3.5' },
    { id: '1:1', label: '1:1', ratio: 1.0, iconStyle: 'w-3.5 h-3.5' }
  ];

  const getActiveRatioId = () => {
    if (!project) return 'original';
    const currentRatio = project.width / project.height;
    const match = ratioOptions.find(opt => 
      opt.ratio && Math.abs(opt.ratio - currentRatio) < 0.02
    );
    return match ? match.id : 'custom';
  };

  const handleSetAspectRatio = async (ratioId: string) => {
    if (!project) return;
    
    let width = 1920;
    let height = 1080;
    
    if (ratioId === 'original') {
      const videoTrack = project.tracks.find((t: any) => t.type === 'video');
      const firstClip = videoTrack?.clips.find((c: any) => c.assetId);
      if (firstClip && firstClip.assetId) {
        const asset = await db.assets.get(firstClip.assetId);
        if (asset && asset.width && asset.height) {
          width = asset.width;
          height = asset.height;
        }
      }
    } else if (ratioId === 'custom') {
      const customWidth = prompt('Enter custom width (px):', String(project.width));
      const customHeight = prompt('Enter custom height (px):', String(project.height));
      if (customWidth && customHeight) {
        width = parseInt(customWidth) || 1920;
        height = parseInt(customHeight) || 1080;
      } else {
        return;
      }
    } else {
      const option = ratioOptions.find(o => o.id === ratioId);
      if (option && option.ratio) {
        const r = option.ratio;
        if (r >= 1.0) {
          width = 1920;
          height = Math.round(1920 / r);
        } else {
          height = 1920;
          width = Math.round(1920 * r);
        }
      }
    }

    const updated = {
      ...project,
      width,
      height,
      updatedAt: new Date()
    };

    useEditorStore.setState({ project: updated });
    await db.projects.put(updated);
    setShowRatioDropdown(false);
  };

  const formatTimecode = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = Math.floor(totalSec % 60);
    const frames = Math.floor((ms % 1000) / 33.33); // 30 fps
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  const parseTimecode = (text: string, fps: number = 30): number | null => {
    const parts = text.trim().split(':');
    if (parts.length === 4) {
      const h = parseInt(parts[0], 10) || 0;
      const m = parseInt(parts[1], 10) || 0;
      const s = parseInt(parts[2], 10) || 0;
      const f = parseInt(parts[3], 10) || 0;
      return (h * 3600 + m * 60 + s) * 1000 + f * (1000 / fps);
    }
    if (parts.length === 3) {
      const m = parseInt(parts[0], 10) || 0;
      const s = parseInt(parts[1], 10) || 0;
      const f = parseInt(parts[2], 10) || 0;
      return (m * 60 + s) * 1000 + f * (1000 / fps);
    }
    if (parts.length === 2) {
      const p0 = parseFloat(parts[0]);
      const p1 = parseFloat(parts[1]);
      if (isNaN(p0) || isNaN(p1)) return null;
      return (p0 * 60 + p1) * 1000;
    }
    const val = parseFloat(text);
    if (isNaN(val)) return null;
    if (val > 1000) return val;
    return val * 1000;
  };

  const getAspectName = () => {
    if (!project) return 'Original';
    const activeId = getActiveRatioId();
    const activeOption = ratioOptions.find(o => o.id === activeId);
    return activeOption ? activeOption.label : 'Custom';
  };

  const stepFrame = (dir: number) => {
    if (!project) return;
    const frameTime = 1000 / (project.fps || 30);
    setCurrentTime(Math.max(0, Math.min(totalDuration, useEditorStore.getState().currentTime + dir * frameTime)));
  };

  return (
    <div className="border-t border-[#2c2c32] bg-[#18181c] p-2 flex flex-col gap-1.5 shrink-0">
      {/* Scrubber Slider & Mobile Timecode Row */}
      <div className="flex items-center justify-between gap-3 w-full px-1.5">
        <input
          ref={scrubberRef}
          type="range"
          min={0}
          max={totalDuration}
          defaultValue={0}
          onChange={(e) => setCurrentTime(Number(e.target.value))}
          className="flex-1 h-1 bg-[#121214] rounded-lg appearance-none cursor-pointer accent-sky-500 focus:outline-none"
        />
        {/* Mobile Only Inline Timecode */}
        <div className="md:hidden text-[9px] font-mono text-zinc-400 shrink-0 select-none">
          <span ref={mobileTimecodeRef}>{formatTimecode(useEditorStore.getState().currentTime)}</span>
          <span className="text-zinc-650 mx-0.5">/</span>
          <span className="text-zinc-550">{formatTimecode(totalDuration)}</span>
        </div>
      </div>

      {/* Buttons & Timecode Bar */}
      <div className="flex items-center justify-between w-full px-1.5 relative min-h-7">
        {/* Left: Desktop Only Timecode */}
        <div className="hidden md:flex text-xs font-mono text-zinc-400 items-center gap-1 select-none">
          {isEditingTimecode ? (
            <input
              type="text"
              value={timecodeInputVal}
              onChange={(e) => setTimecodeInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const parsedMs = parseTimecode(timecodeInputVal, project?.fps || 30);
                  if (parsedMs !== null) {
                    setCurrentTime(Math.max(0, Math.min(totalDuration, parsedMs)));
                  }
                  setIsEditingTimecode(false);
                } else if (e.key === 'Escape') {
                  setIsEditingTimecode(false);
                }
              }}
              onBlur={() => {
                const parsedMs = parseTimecode(timecodeInputVal, project?.fps || 30);
                if (parsedMs !== null) {
                  setCurrentTime(Math.max(0, Math.min(totalDuration, parsedMs)));
                }
                setIsEditingTimecode(false);
              }}
              className="w-20 bg-[#0a0a0c] border border-[#38383e] rounded px-1 py-0.5 text-[10px] font-mono text-white text-center focus:outline-none"
              autoFocus
            />
          ) : (
            <span
              onClick={() => {
                setIsEditingTimecode(true);
                setTimecodeInputVal(formatTimecode(useEditorStore.getState().currentTime));
              }}
              className="text-zinc-200 font-medium hover:text-white cursor-pointer transition select-none"
              title="Click to input timestamp"
              ref={desktopTimecodeRef}
            >
              {formatTimecode(useEditorStore.getState().currentTime)}
            </span>
          )}
          <span className="text-zinc-600">/</span>
          <span className="text-zinc-500">{formatTimecode(totalDuration)}</span>
        </div>

        {/* Center: Playback Buttons */}
        <div className="flex items-center gap-3.5 justify-start md:justify-center md:absolute md:left-1/2 md:-translate-x-1/2">
          <button
            onClick={() => stepFrame(-1)}
            title="Previous Frame (Key: ,)"
            className="p-1 rounded-lg hover:bg-[#18181c] text-zinc-400 hover:text-white transition cursor-pointer"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={togglePlay}
            disabled={!assetsLoaded}
            className="p-2 rounded-full bg-white hover:bg-zinc-200 disabled:opacity-50 text-black transition shadow-md hover:scale-105 cursor-pointer"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
          </button>
          <button
            onClick={() => stepFrame(1)}
            title="Next Frame (Key: .)"
            className="p-1 rounded-lg hover:bg-[#18181c] text-zinc-400 hover:text-white transition cursor-pointer"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Ratio, Safe Zone, Fullscreen, WebGPU */}
        <div className="flex items-center gap-1.5 relative justify-end">
          {/* Ratio Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowRatioDropdown(!showRatioDropdown)}
              className="flex items-center gap-1 px-2.5 py-1 bg-[#121215] border border-[#222226] hover:border-zinc-500 rounded-md text-[10px] text-zinc-200 font-semibold transition cursor-pointer"
            >
              <span>Ratio: {getAspectName()}</span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </button>

            {showRatioDropdown && (
              <div className="absolute bottom-7 right-0 z-50 flex flex-col bg-[#1e1e22] border border-[#2c2c32] rounded shadow-2xl py-1.5 w-36 max-h-60 overflow-y-auto custom-scrollbar">
                {ratioOptions.map((opt, idx) => {
                  if (opt.type === 'separator') {
                    return <div key={`sep-${idx}`} className="h-[1px] bg-[#2c2c32] my-1 mx-2" />;
                  }
                  
                  const activeId = getActiveRatioId();
                  const isActive = activeId === opt.id;
                  
                  return (
                    <button
                      key={opt.id}
                      onClick={() => handleSetAspectRatio(opt.id!)}
                      className="flex items-center justify-between px-2.5 py-1 text-[9px] text-left text-gray-350 hover:bg-[#2a2a30] hover:text-sky-400 transition font-medium cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 flex items-center justify-center">
                          {isActive && <Check className="w-2.5 h-2.5 text-sky-400" />}
                        </span>
                        <span>{opt.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Before/After Compare Toggle */}
          <button
            onClick={() => setCompareMode(!compareMode)}
            title={compareMode ? 'Disable Comparison Mode' : 'Enable Before/After Split Screen'}
            className={`p-1 rounded border transition cursor-pointer ${
              compareMode
                ? 'bg-[#2a2a30] text-violet-400 border-violet-900/50'
                : 'bg-[#121214] text-gray-400 border-[#2c2c32] hover:text-gray-200'
            }`}
          >
            <Columns className="w-3 h-3" />
          </button>

          {/* Safe Zone Toggle */}
          <button
            onClick={() => setShowSafeZone(!showSafeZone)}
            title="Toggle Safe Zone"
            className={`p-1 rounded border transition cursor-pointer ${
              showSafeZone
                ? 'bg-[#2a2a30] text-sky-400 border-sky-900/50'
                : 'bg-[#121214] text-gray-400 border-[#2c2c32] hover:text-gray-200'
            }`}
          >
            <Tv className="w-3 h-3" />
          </button>

          {/* Fullscreen */}
          <button
            onClick={handleFullscreen}
            title="Fullscreen Preview"
            className="p-1 rounded bg-[#121214] border border-[#2c2c32] text-gray-400 hover:text-gray-200 transition cursor-pointer"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
