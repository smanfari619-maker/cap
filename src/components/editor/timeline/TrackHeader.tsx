import { Lock, Unlock, Volume2, VolumeX, Eye, EyeOff, Trash2, ChevronUp, ChevronDown, Type, ImageIcon, Music, Edit2, Sparkles } from 'lucide-react';
import { type TimelineTrack } from '../../../lib/db';

interface TrackHeaderProps {
  track: TimelineTrack;
  trackLabel: string;
  isFirstVideoTrack: boolean;
  editingTrackId: string | null;
  setEditingTrackId: (id: string | null) => void;
  updateTracks: (tracks: TimelineTrack[]) => Promise<void>;
  removeTrack: (id: string) => Promise<void>;
  reorderTrack: (id: string, direction: 'up' | 'down') => Promise<void>;
  handleToggleTrackControl: (trackId: string, property: 'locked' | 'muted' | 'hidden') => Promise<void>;
  allTracks: TimelineTrack[];
}

export default function TrackHeader({
  track,
  trackLabel,
  isFirstVideoTrack,
  editingTrackId,
  setEditingTrackId,
  updateTracks,
  removeTrack,
  reorderTrack,
  handleToggleTrackControl,
  allTracks
}: TrackHeaderProps) {

  let Icon = Type;
  let iconColor = 'text-fuchsia-400';
  let accentColor = 'border-l-fuchsia-500';
  let bgGradient = 'from-fuchsia-950/10';

  if (track.type === 'video') {
    Icon = ImageIcon;
    iconColor = 'text-teal-400';
    accentColor = 'border-l-teal-500';
    bgGradient = 'from-teal-950/10';
  } else if (track.type === 'audio') {
    Icon = Music;
    iconColor = track.muted ? 'text-zinc-500' : 'text-sky-400';
    accentColor = track.muted ? 'border-l-zinc-600' : 'border-l-sky-500';
    bgGradient = track.muted ? 'from-zinc-950/20' : 'from-sky-950/10';
  } else if (track.type === 'effect') {
    Icon = Sparkles;
    iconColor = 'text-purple-400';
    accentColor = 'border-l-purple-500';
    bgGradient = 'from-purple-950/15';
  }

  const trackHeight = {
    video: 52,
    image: 52,
    audio: 40,
    effect: 30,
    text: 28
  }[track.type] || 28;

  const isInactive = track.muted || track.hidden;

  return (
    <div
      className={`border-b border-[#1f1f23]/60 flex items-center bg-gradient-to-r ${bgGradient} to-transparent border-l-4 ${accentColor} relative group select-none overflow-hidden shrink-0 px-1.5 gap-1 transition-all ${isInactive ? 'opacity-50 saturate-50' : ''}`}
      style={{ height: `${trackHeight}px`, marginBottom: '4px' }}
    >
      <Icon className={`w-3 h-3 ${iconColor} opacity-75 shrink-0`} />

      {editingTrackId === track.id ? (
        <input
          type="text"
          defaultValue={track.name || trackLabel}
          onBlur={(e) => {
            const newName = e.target.value.trim();
            if (newName) updateTracks(allTracks.map(t => t.id === track.id ? { ...t, name: newName } : t));
            setEditingTrackId(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const newName = e.currentTarget.value.trim();
              if (newName) updateTracks(allTracks.map(t => t.id === track.id ? { ...t, name: newName } : t));
              setEditingTrackId(null);
            } else if (e.key === 'Escape') setEditingTrackId(null);
          }}
          className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded text-[9px] text-white px-1 py-0.5 focus:outline-none font-bold"
          autoFocus
        />
      ) : (
        <span
          onDoubleClick={() => setEditingTrackId(track.id)}
          className={`flex-1 min-w-0 text-[9px] font-semibold tracking-tight cursor-pointer truncate ${
            track.type === 'audio' && track.muted ? 'text-zinc-500 hover:text-zinc-400' : 'text-zinc-400 hover:text-zinc-200'
          }`}
          title={`${track.name || trackLabel} — Double click to rename`}
        >
          {track.name || trackLabel}
        </span>
      )}

      {track.locked && <Lock className="w-2.5 h-2.5 text-amber-400 shrink-0" />}
      {track.muted && <VolumeX className="w-2.5 h-2.5 text-red-400 shrink-0" />}
      {track.hidden && <EyeOff className="w-2.5 h-2.5 text-sky-400 shrink-0" />}

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-100 shrink-0">
        <button
          onClick={() => handleToggleTrackControl(track.id, 'locked')}
          title={track.locked ? 'Unlock' : 'Lock'}
          className={`p-0.5 rounded transition ${track.locked ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-300'}`}
        >
          {track.locked ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
        </button>

        {track.type === 'audio' ? (
          <button
            onClick={() => handleToggleTrackControl(track.id, 'muted')}
            title={track.muted ? 'Unmute' : 'Mute'}
            className={`p-0.5 rounded transition ${track.muted ? 'text-red-400' : 'text-zinc-600 hover:text-zinc-300'}`}
          >
            {track.muted ? <VolumeX className="w-2.5 h-2.5" /> : <Volume2 className="w-2.5 h-2.5" />}
          </button>
        ) : (
          <button
            onClick={() => handleToggleTrackControl(track.id, 'hidden')}
            title={track.hidden ? 'Show' : 'Hide'}
            className={`p-0.5 rounded transition ${track.hidden ? 'text-sky-400' : 'text-zinc-600 hover:text-zinc-300'}`}
          >
            {track.hidden ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
          </button>
        )}

        <button onClick={() => reorderTrack(track.id, 'up')} title="Move Up" className="p-0.5 rounded text-zinc-600 hover:text-zinc-300 transition">
          <ChevronUp className="w-2.5 h-2.5" />
        </button>
        <button onClick={() => reorderTrack(track.id, 'down')} title="Move Down" className="p-0.5 rounded text-zinc-600 hover:text-zinc-300 transition">
          <ChevronDown className="w-2.5 h-2.5" />
        </button>

        {isFirstVideoTrack && (
          <button onClick={() => alert('Select Cover image from frame or upload one!')} title="Set Cover" className="p-0.5 rounded text-zinc-600 hover:text-zinc-300 transition">
            <Edit2 className="w-2.5 h-2.5" />
          </button>
        )}

        <button
          onClick={() => {
            if (track.clips.length > 0 && !confirm(`Delete "${track.name || trackLabel}" and all its clips?`)) return;
            removeTrack(track.id);
          }}
          title="Delete Track"
          className="p-0.5 rounded text-zinc-600 hover:text-red-400 transition"
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
}
