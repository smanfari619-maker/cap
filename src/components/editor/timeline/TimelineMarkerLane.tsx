import { useState, useRef, useEffect } from 'react';
import { Trash2, Check } from 'lucide-react';
import { type TimelineMarker } from '../../../lib/db';

interface TimelineMarkerLaneProps {
  markers: TimelineMarker[];
  pxPerMs: number;
  timelineMinWidth: number;
  onAddMarker: (timeMs: number) => void;
  onDeleteMarker: (id: string) => void;
  onUpdateMarker: (id: string, updates: Partial<TimelineMarker>) => void;
  setCurrentTime: (timeMs: number) => void;
}

export default function TimelineMarkerLane({
  markers = [],
  pxPerMs,
  timelineMinWidth,
  onAddMarker,
  onDeleteMarker,
  onUpdateMarker,
  setCurrentTime
}: TimelineMarkerLaneProps) {
  const [editingMarker, setEditingMarker] = useState<TimelineMarker | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setEditingMarker(null);
        setPopoverPos(null);
      }
    };
    if (editingMarker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editingMarker]);

  const handleMarkerDoubleClick = (e: React.MouseEvent, marker: TimelineMarker) => {
    e.stopPropagation();
    setEditingMarker(marker);
    
    // Position popover near the marker
    const rect = e.currentTarget.getBoundingClientRect();
    const container = e.currentTarget.parentElement?.getBoundingClientRect();
    const left = rect.left - (container?.left || 0) + rect.width / 2;
    setPopoverPos({
      x: left,
      y: 24 // Render just below the marker lane
    });
  };

  const handleLaneDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const timeMs = clickX / pxPerMs;
    onAddMarker(timeMs);
  };

  const colorMap = {
    red: 'bg-red-500 hover:bg-red-400 border-red-450 shadow-red-500/50',
    green: 'bg-emerald-500 hover:bg-emerald-400 border-emerald-450 shadow-emerald-500/50',
    blue: 'bg-sky-500 hover:bg-sky-400 border-sky-450 shadow-sky-500/50',
    yellow: 'bg-amber-500 hover:bg-amber-400 border-amber-450 shadow-amber-500/50',
    purple: 'bg-purple-500 hover:bg-purple-400 border-purple-450 shadow-purple-500/50'
  };

  return (
    <div
      onDoubleClick={handleLaneDoubleClick}
      onMouseDown={(e) => e.stopPropagation()}
      className="relative h-[12px] bg-[#080809] border-b border-[#1a1a1e] select-none cursor-crosshair"
      style={{ minWidth: `${timelineMinWidth}px` }}
      data-markerlane="true"
      title="Double-click to add marker · M key"
    >
      {/* Markers */}
      {markers.map((marker) => {
        const left = marker.timeMs * pxPerMs;
        const colorClass = colorMap[marker.color] || colorMap.blue;
        
        return (
          <div
            key={marker.id}
            onDoubleClick={(e) => handleMarkerDoubleClick(e, marker)}
            onClick={(e) => {
              e.stopPropagation();
              setCurrentTime(marker.timeMs);
            }}
            className={`absolute top-0.5 -ml-1 w-2 h-[9px] rounded-[1px] cursor-pointer transition-transform hover:scale-110 active:scale-95 z-20 ${colorClass}`}
            style={{ left: `${left}px` }}
            title={marker.note || 'Marker'}
          />
        );
      })}

      {/* Editing Popover */}
      {editingMarker && popoverPos && (
        <div
          ref={popoverRef}
          style={{
            left: `${Math.min(timelineMinWidth - 220, Math.max(10, popoverPos.x - 100))}px`,
            top: `${popoverPos.y}px`
          }}
          className="absolute z-50 w-52 bg-[#18181c] border border-[#2c2c32] rounded-lg shadow-2xl p-2.5 flex flex-col gap-2.5 backdrop-blur bg-opacity-95 text-left cursor-default select-text"
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] font-bold text-zinc-400 tracking-wider uppercase">Edit Marker</div>

          {/* Color Select */}
          <div className="flex gap-1.5 justify-between">
            {(['red', 'green', 'blue', 'yellow', 'purple'] as const).map((col) => (
              <button
                key={col}
                onClick={() => {
                  onUpdateMarker(editingMarker.id, { color: col });
                  setEditingMarker(prev => prev ? { ...prev, color: col } : null);
                }}
                className={`w-5 h-5 rounded-full border flex items-center justify-center transition-transform hover:scale-115 ${
                  col === 'red' ? 'bg-red-500 border-red-400' :
                  col === 'green' ? 'bg-emerald-500 border-emerald-400' :
                  col === 'blue' ? 'bg-sky-500 border-sky-400' :
                  col === 'yellow' ? 'bg-amber-500 border-amber-400' :
                  'bg-purple-500 border-purple-400'
                }`}
              >
                {editingMarker.color === col && <Check className="w-3 h-3 text-white" />}
              </button>
            ))}
          </div>

          {/* Note Input */}
          <input
            type="text"
            placeholder="Marker note..."
            value={editingMarker.note}
            onChange={(e) => {
              const val = e.target.value;
              onUpdateMarker(editingMarker.id, { note: val });
              setEditingMarker(prev => prev ? { ...prev, note: val } : null);
            }}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] text-white focus:outline-none focus:border-sky-500"
            autoFocus
          />

          {/* Delete Action */}
          <button
            onClick={() => {
              onDeleteMarker(editingMarker.id);
              setEditingMarker(null);
              setPopoverPos(null);
            }}
            className="w-full py-1 border border-red-900/30 hover:border-red-600 bg-red-950/25 hover:bg-red-600 text-red-300 hover:text-white text-[9px] font-bold rounded flex items-center justify-center gap-1 transition cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            <span>Delete Marker</span>
          </button>
        </div>
      )}
    </div>
  );
}
