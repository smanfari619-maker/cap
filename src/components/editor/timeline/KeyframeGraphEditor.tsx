import { useState, useMemo, useRef, useCallback } from 'react';
import { Sparkles, Trash2, Plus } from 'lucide-react';
import { type TimelineClip, type Keyframe } from '../../../lib/db';

interface KeyframeGraphEditorProps {
  clip: TimelineClip | null;
  currentTime: number; // Global time in ms
  updateClip: (clipId: string, updates: Partial<TimelineClip>) => Promise<void>;
}

type PropertyKey = 'scale' | 'x' | 'y' | 'rotation' | 'opacity';

export default function KeyframeGraphEditor({
  clip,
  currentTime,
  updateClip
}: KeyframeGraphEditorProps) {
  const [selectedProp, setSelectedProp] = useState<PropertyKey>('scale');
  const [activeKeyframeIndex, setActiveKeyframeIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const keyframes: Keyframe[] = useMemo(() => {
    if (!clip?.keyframes) return [];
    return clip.keyframes[selectedProp] || [];
  }, [clip, selectedProp]);

  // Value ranges for normalization
  const ranges = {
    scale: { min: 0, max: 200, def: 100, label: '%' },
    x: { min: -500, max: 500, def: 0, label: 'px' },
    y: { min: -500, max: 500, def: 0, label: 'px' },
    rotation: { min: -180, max: 180, def: 0, label: '°' },
    opacity: { min: 0, max: 100, def: 100, label: '%' }
  };

  const currentRange = ranges[selectedProp];

  // Map time & value to SVG coordinates
  // SVG size: width=600, height=180
  const svgW = 600;
  const svgH = 150;
  const padding = 20;

  const getCoords = useCallback((timeMs: number, value: number) => {
    if (!clip) return { x: 0, y: 0 };
    const x = padding + (timeMs / clip.durationMs) * (svgW - padding * 2);
    const valRatio = (value - currentRange.min) / (currentRange.max - currentRange.min);
    const y = svgH - padding - valRatio * (svgH - padding * 2);
    return { x, y };
  }, [clip, currentRange.min, currentRange.max]);

  const getValFromCoords = (x: number, y: number) => {
    if (!clip) return { timeMs: 0, value: 0 };
    const timeRatio = (x - padding) / (svgW - padding * 2);
    const timeMs = Math.max(0, Math.min(clip.durationMs, timeRatio * clip.durationMs));

    const yRatio = (svgH - padding - y) / (svgH - padding * 2);
    const rawVal = currentRange.min + yRatio * (currentRange.max - currentRange.min);
    const value = Math.max(currentRange.min, Math.min(currentRange.max, Math.round(rawVal)));

    return { timeMs, value };
  };

  // SVG Mouse Drag Handler for Keyframes
  const handleKeyframeMouseDown = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();
    setActiveKeyframeIndex(index);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!svgRef.current || !clip) return;
      const rect = svgRef.current.getBoundingClientRect();
      const x = moveEvent.clientX - rect.left;
      const y = moveEvent.clientY - rect.top;

      const { timeMs, value } = getValFromCoords(x, y);

      // Update keyframe in list
      const updatedKeyframes = [...keyframes];
      updatedKeyframes[index] = {
        ...updatedKeyframes[index],
        timeMs: Math.round(timeMs),
        value
      };

      // Sort by time
      updatedKeyframes.sort((a, b) => a.timeMs - b.timeMs);

      const newKeyframes = {
        ...(clip.keyframes || {}),
        [selectedProp]: updatedKeyframes
      };

      updateClip(clip.id, { keyframes: newKeyframes });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Add a new keyframe at the current playhead offset
  const handleAddKeyframe = () => {
    if (!clip) return;
    const offsetMs = Math.max(0, Math.min(clip.durationMs, currentTime - clip.positionMs));
    
    // Get current value at this time (for interpolation)
    let initialValue = currentRange.def;
    if (keyframes.length > 0) {
      const sorted = [...keyframes].sort((a, b) => a.timeMs - b.timeMs);
      const nextIdx = sorted.findIndex(k => k.timeMs > offsetMs);
      if (nextIdx === 0) {
        initialValue = sorted[0].value;
      } else if (nextIdx === -1) {
        initialValue = sorted[sorted.length - 1].value;
      } else {
        const prev = sorted[nextIdx - 1];
        const next = sorted[nextIdx];
        const ratio = (offsetMs - prev.timeMs) / (next.timeMs - prev.timeMs);
        initialValue = Math.round(prev.value + ratio * (next.value - prev.value));
      }
    }

    const newKey: Keyframe = {
      timeMs: Math.round(offsetMs),
      value: initialValue,
      easing: 'linear'
    };

    const updated = [...keyframes, newKey].sort((a, b) => a.timeMs - b.timeMs);
    const newKeyframes = {
      ...(clip.keyframes || {}),
      [selectedProp]: updated
    };

    updateClip(clip.id, { keyframes: newKeyframes });
  };

  // Delete active keyframe
  const handleDeleteKeyframe = (index: number) => {
    if (!clip) return;
    const updated = keyframes.filter((_, i) => i !== index);
    const newKeyframes = {
      ...(clip.keyframes || {}),
      [selectedProp]: updated
    };
    updateClip(clip.id, { keyframes: newKeyframes });
    setActiveKeyframeIndex(null);
  };

  // Render SVG Path Curve
  const curvePath = useMemo(() => {
    if (keyframes.length === 0) return '';
    const sorted = [...keyframes].sort((a, b) => a.timeMs - b.timeMs);
    let d = '';

    sorted.forEach((k, idx) => {
      const { x, y } = getCoords(k.timeMs, k.value);
      if (idx === 0) {
        d += `M ${x} ${y}`;
      } else {
        // Drawing a smooth bezier curve or line
        const prev = getCoords(sorted[idx - 1].timeMs, sorted[idx - 1].value);
        if (k.easing === 'ease-in-out' || k.easing === 'ease-in' || k.easing === 'ease-out') {
          const cp1x = prev.x + (x - prev.x) / 2;
          const cp1y = prev.y;
          const cp2x = prev.x + (x - prev.x) / 2;
          const cp2y = y;
          d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x} ${y}`;
        } else {
          d += ` L ${x} ${y}`;
        }
      }
    });

    return d;
  }, [keyframes, getCoords]);

  // Current playhead line inside the clip space
  const playheadX = useMemo(() => {
    if (!clip) return -100;
    const offsetMs = currentTime - clip.positionMs;
    if (offsetMs < 0 || offsetMs > clip.durationMs) return -100;
    return padding + (offsetMs / clip.durationMs) * (svgW - padding * 2);
  }, [clip, currentTime]);

  if (!clip) {
    return (
      <div className="h-44 bg-[#0d0d0f] border-t border-[#1f1f23] flex items-center justify-center text-zinc-500 text-xs gap-2">
        <Sparkles className="w-4 h-4 text-zinc-600 animate-pulse" />
        <span>Select a clip on the timeline to edit keyframes</span>
      </div>
    );
  }

  const propColor = {
    scale: 'text-teal-400 border-teal-500/30 hover:bg-teal-950/10',
    x: 'text-orange-400 border-orange-500/30 hover:bg-orange-950/10',
    y: 'text-green-400 border-green-500/30 hover:bg-green-950/10',
    rotation: 'text-purple-400 border-purple-500/30 hover:bg-purple-950/10',
    opacity: 'text-zinc-300 border-zinc-500/30 hover:bg-zinc-800/20'
  }[selectedProp];

  const propAccentSvg = {
    scale: '#2dd4bf',
    x: '#fb923c',
    y: '#4ade80',
    rotation: '#c084fc',
    opacity: '#d4d4d8'
  }[selectedProp];

  return (
    <div className="h-52 bg-[#0d0d10] border-t border-[#1f1f23] flex flex-col select-none relative shrink-0">
      {/* Tab Header / Controls */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1f1f23] bg-[#09090b]">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mr-2">Keyframe Graph</span>
          {(['scale', 'x', 'y', 'rotation', 'opacity'] as const).map((prop) => (
            <button
              key={prop}
              onClick={() => {
                setSelectedProp(prop);
                setActiveKeyframeIndex(null);
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-bold border transition capitalize cursor-pointer ${
                selectedProp === prop
                  ? 'bg-zinc-850 border-zinc-700 text-zinc-100'
                  : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {prop}
            </button>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddKeyframe}
            className="px-2 py-0.5 bg-zinc-850 hover:bg-zinc-800 border border-zinc-700 text-[9.5px] font-bold text-zinc-300 rounded flex items-center gap-1 transition cursor-pointer"
            title="Add keyframe at playhead"
          >
            <Plus className="w-3 h-3" />
            <span>Add Keyframe</span>
          </button>
          
          {activeKeyframeIndex !== null && (
            <button
              onClick={() => handleDeleteKeyframe(activeKeyframeIndex)}
              className="px-2 py-0.5 bg-red-950/20 hover:bg-red-600 border border-red-900/30 hover:border-red-600 text-[9.5px] font-bold text-red-400 hover:text-white rounded flex items-center gap-1 transition cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete</span>
            </button>
          )}

          {/* Easing Toggle */}
          {activeKeyframeIndex !== null && keyframes[activeKeyframeIndex] && (
            <select
              value={keyframes[activeKeyframeIndex].easing || 'linear'}
              onChange={(e) => {
                const val = e.target.value as any;
                const updated = [...keyframes];
                updated[activeKeyframeIndex] = { ...updated[activeKeyframeIndex], easing: val };
                updateClip(clip.id, { keyframes: { ...(clip.keyframes || {}), [selectedProp]: updated } });
              }}
              className="bg-zinc-900 border border-zinc-800 rounded px-1 py-0.5 text-[9.5px] text-zinc-300 focus:outline-none"
            >
              <option value="linear">Linear</option>
              <option value="ease-in-out">Ease In/Out</option>
              <option value="ease-in">Ease In</option>
              <option value="ease-out">Ease Out</option>
            </select>
          )}
        </div>
      </div>

      {/* Main SVG Graph Workspace */}
      <div className="flex-1 flex overflow-hidden bg-[#0a0a0c]">
        {/* Left Value Ruler */}
        <div className="w-14 border-r border-[#1f1f23] flex flex-col justify-between text-[8px] font-mono text-zinc-600 p-1 bg-[#070709] shrink-0 select-none">
          <span>{currentRange.max}{currentRange.label}</span>
          <span>{Math.round((currentRange.max + currentRange.min) / 2)}{currentRange.label}</span>
          <span>{currentRange.min}{currentRange.label}</span>
        </div>

        {/* Graph Area */}
        <div className="flex-1 relative overflow-hidden">
          <svg
            ref={svgRef}
            className="w-full h-full"
            viewBox={`0 0 ${svgW} ${svgH}`}
            preserveAspectRatio="none"
          >
            {/* Grid Lines */}
            <line x1={padding} y1={svgH / 2} x2={svgW - padding} y2={svgH / 2} stroke="#1f1f23" strokeWidth="1" strokeDasharray="3 3" />
            <line x1={svgW / 2} y1={padding} x2={svgW / 2} y2={svgH - padding} stroke="#1f1f23" strokeWidth="1" strokeDasharray="3 3" />
            
            {/* Curves */}
            {curvePath && (
              <path
                d={curvePath}
                fill="none"
                stroke={propAccentSvg}
                strokeWidth="2.5"
                strokeLinecap="round"
                className="transition-all duration-75"
              />
            )}

            {/* Draggable Keyframe Dots */}
            {keyframes.map((k, idx) => {
              const { x, y } = getCoords(k.timeMs, k.value);
              const isActive = activeKeyframeIndex === idx;
              
              return (
                <g key={idx}>
                  {/* Outer glow ring for active node */}
                  {isActive && (
                    <circle
                      cx={x}
                      cy={y}
                      r="7"
                      fill="none"
                      stroke={propAccentSvg}
                      strokeWidth="1.5"
                      className="animate-ping"
                    />
                  )}
                  {/* Intersecting crosshairs when dragging */}
                  {isActive && (
                    <>
                      <line x1="0" y1={y} x2={svgW} y2={y} stroke={propAccentSvg} strokeWidth="0.5" strokeOpacity="0.3" />
                      <line x1={x} y1="0" x2={x} y2={svgH} stroke={propAccentSvg} strokeWidth="0.5" strokeOpacity="0.3" />
                    </>
                  )}
                  {/* Inner interactive dot */}
                  <circle
                    cx={x}
                    cy={y}
                    r={isActive ? "5.5" : "4.5"}
                    fill={isActive ? propAccentSvg : '#18181c'}
                    stroke={propAccentSvg}
                    strokeWidth="2"
                    className="cursor-pointer transition-transform hover:scale-125"
                    onMouseDown={(e) => handleKeyframeMouseDown(e, idx)}
                  />
                </g>
              );
            })}

            {/* Playhead line inside clip */}
            {playheadX > 0 && (
              <line
                x1={playheadX}
                y1="0"
                x2={playheadX}
                y2={svgH}
                stroke="#ffffff"
                strokeWidth="1.5"
                strokeDasharray="2 2"
                strokeOpacity="0.75"
              />
            )}
          </svg>

          {/* Quick Info Overlay */}
          {activeKeyframeIndex !== null && keyframes[activeKeyframeIndex] && (
            <div className="absolute top-1.5 left-2 px-2 py-0.5 bg-zinc-900/90 border border-zinc-800 rounded text-[8px] font-mono text-zinc-400 pointer-events-none">
              Time: <span className="text-zinc-200">{(keyframes[activeKeyframeIndex].timeMs / 1000).toFixed(2)}s</span> | 
              Val: <span className={propColor.split(' ')[0]}>{keyframes[activeKeyframeIndex].value}{currentRange.label}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
