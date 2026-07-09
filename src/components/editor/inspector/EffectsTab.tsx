import { Scissors, Sparkles } from 'lucide-react';
import { EFFECTS_REGISTRY } from '../../../lib/effects-registry';

interface EffectsTabProps {
  selectedClip: any;
  updateClip: (id: string, updates: any) => void;
}

export default function EffectsTab({ selectedClip, updateClip }: EffectsTabProps) {
  return (
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
  );
}
