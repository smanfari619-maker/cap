import { Volume2 } from 'lucide-react';

interface AudioTabProps {
  selectedClip: any;
  updateClip: (id: string, updates: any) => void;
}

export default function AudioTab({ selectedClip, updateClip }: AudioTabProps) {
  return (
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
  );
}
