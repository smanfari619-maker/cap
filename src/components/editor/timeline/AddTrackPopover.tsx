import { useState, useRef, useEffect } from 'react';
import { Film, Music, Type, Sparkles } from 'lucide-react';
import { type TimelineTrack } from '../../../lib/db';

interface AddTrackPopoverProps {
  tracks: TimelineTrack[];
  updateTracks: (tracks: TimelineTrack[]) => Promise<void>;
}

export default function AddTrackPopover({ tracks, updateTracks }: AddTrackPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleAddTrack = async (type: 'video' | 'audio' | 'text' | 'effect') => {
    const newTrackId = Math.random().toString(36).substring(2, 9);
    const existingCount = tracks.filter(t => t.type === type).length;
    const typeLabel = type === 'effect' ? 'Effects' : type.charAt(0).toUpperCase() + type.slice(1);
    const newTrack: TimelineTrack = {
      id: newTrackId,
      name: `${typeLabel} Track ${existingCount + 1}`,
      type,
      clips: [],
      locked: false,
      muted: false,
      hidden: false
    };
    await updateTracks([...tracks, newTrack]);
    setIsOpen(false);
  };

  return (
    <div className="relative w-full" ref={popoverRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-1.5 rounded bg-zinc-850 hover:bg-zinc-800 text-[10px] font-bold text-zinc-300 hover:text-zinc-100 border border-zinc-700/30 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
      >
        <span>⊕ Add Track</span>
      </button>

      {isOpen && (
        <div className="absolute bottom-9 left-0 right-0 z-50 bg-[#18181c] border border-[#2c2c32] rounded shadow-2xl p-1 flex flex-col gap-0.5 backdrop-blur bg-opacity-95 animate-in fade-in slide-in-from-bottom-2 duration-100">
          <button
            onClick={() => handleAddTrack('video')}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[10px] text-zinc-300 hover:bg-[#202026] hover:text-teal-400 transition text-left cursor-pointer"
          >
            <Film className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <span>Video Track</span>
          </button>

          <button
            onClick={() => handleAddTrack('audio')}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[10px] text-zinc-300 hover:bg-[#202026] hover:text-sky-400 transition text-left cursor-pointer"
          >
            <Music className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>Audio Track</span>
          </button>

          <button
            onClick={() => handleAddTrack('text')}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[10px] text-zinc-300 hover:bg-[#202026] hover:text-fuchsia-400 transition text-left cursor-pointer"
          >
            <Type className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />
            <span>Text Track</span>
          </button>

          <button
            onClick={() => handleAddTrack('effect')}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[10px] text-zinc-300 hover:bg-[#202026] hover:text-purple-400 transition text-left cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span>Effect Track</span>
          </button>
        </div>
      )}
    </div>
  );
}
