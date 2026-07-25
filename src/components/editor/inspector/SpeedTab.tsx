import { Gauge } from 'lucide-react';
import { useEditorStore } from '../../../store/editorStore';
import SnappingSlider from './SnappingSlider';

interface SpeedTabProps {
  selectedClip: any;
  updateClip: (id: string, updates: any) => void;
}

export default function SpeedTab({ selectedClip, updateClip }: SpeedTabProps) {
  return (
    <div className="space-y-5">
      <h4 className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-500 flex items-center gap-1">
        <Gauge className="w-3.5 h-3.5 text-violet-400" /> Playback speed
      </h4>

      <div className="space-y-2">
        <div className="flex justify-between">
          <label className="text-[10px] font-semibold text-zinc-400 uppercase">Speed Multiplier</label>
          <span className="text-[10px] font-mono text-zinc-400 font-bold">{(selectedClip.speed || 1.0).toFixed(2)}x</span>
        </div>
        <SnappingSlider
          min={0.25}
          max={4.0}
          step={0.05}
          defaultValue={1.0}
          snapThreshold={0.12}
          value={selectedClip.speed || 1.0}
          onChange={(newSpeed) => {
            const sourceDuration = selectedClip.trimEndMs - selectedClip.trimStartMs;
            const newDur = Math.round(sourceDuration / newSpeed);
            updateClip(selectedClip.id, {
              speed: newSpeed,
              durationMs: newDur
            });
          }}
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
            const curveId = selectedClip.velocityCurve || 'none';
            return (
              <button
                key={curve.id}
                onClick={() => updateClip(selectedClip.id, { velocityCurve: curve.id })}
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
            updateClip(selectedClip.id, { speed: 0.001, durationMs: 2000 });
          }}
          className="w-full py-2 bg-zinc-900 border border-zinc-700 hover:border-violet-600 text-zinc-300 hover:text-zinc-100 rounded-lg text-[10px] font-semibold transition"
        >
          ❄ Set Freeze Frame (2s)
        </button>
      </div>
    </div>
  );
}
