import { useState } from 'react';
import { Search, Sparkles, X, Check } from 'lucide-react';
import { EFFECTS_REGISTRY, EFFECT_CATEGORIES } from '../../../lib/effects-registry';
import heroImg from '../../../assets/hero.png';

const EffectPreviewPlaceholder = () => (
  <div className="w-full h-full relative overflow-hidden">
    <img src={heroImg} className="w-full h-full object-cover" alt="Outgoing Clip" />
  </div>
);

const getEffectPreviewStyle = (effectId: string) => {
  switch (effectId) {
    case 'blur-gaussian':
      return { filter: 'blur(1.5px)' };
    case 'blur-tilt-shift':
      return { filter: 'blur(1.2px) contrast(105%)' };
    case 'glow-neon':
      return { filter: 'brightness(110%) saturate(140%) drop-shadow(0 0 3px #8b5cf6)' };
    case 'glow-bloom':
      return { filter: 'brightness(125%) blur(0.5px)' };
    case 'glow-dreamy':
      return { filter: 'brightness(105%) saturate(75%) sepia(20%) blur(0.3px)' };
    case 'distort-fisheye':
      return { transform: 'scale(1.12)', filter: 'contrast(110%)' };
    case 'distort-wave':
      return { transform: 'skewX(3deg) scale(1.05)' };
    case 'distort-glitch':
      return { filter: 'hue-rotate(90deg) saturate(140%) contrast(115%)' };
    case 'camera-shake':
      return { animation: 'preview-shake 0.5s infinite alternate' };
    case 'camera-grain':
      return { filter: 'contrast(115%) brightness(95%) saturate(90%)' };
    case 'camera-scanlines':
      return { filter: 'brightness(90%) contrast(110%)' };
    case 'color-vignette':
      return {};
    case 'color-lomo':
      return { filter: 'contrast(130%) saturate(125%) brightness(90%)' };
    case 'distort-mirror':
      return {};
    case 'color-thermal':
      return { filter: 'hue-rotate(240deg) saturate(220%) contrast(140%) brightness(110%)' };
    case 'distort-pixelate':
      return { filter: 'contrast(120%) saturate(110%) brightness(95%)', imageRendering: 'pixelated' as any };
    default:
      return {};
  }
};

interface EffectsPanelProps {
  selectedClipId: string | null;
  project: any;
  handleApplyEffect: (id: string, intensity: number) => void;
  handleRemoveEffect: (id: string) => void;
  updateClip: any;
}

export default function EffectsPanel({ selectedClipId, project, handleApplyEffect, handleRemoveEffect }: EffectsPanelProps) {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pendingIntensity, setPendingIntensity] = useState<Record<string, number>>({});

  const selectedClip = selectedClipId
    ? project?.tracks.flatMap((t: any) => t.clips).find((c: any) => c.id === selectedClipId)
    : null;

  const appliedEffects: Array<{ id: string; intensity: number }> = selectedClip?.videoEffects || [];
  const appliedIds = new Set(appliedEffects.map((e: any) => e.id));

  const allEffects = Object.values(EFFECTS_REGISTRY);
  const filtered = allEffects.filter(e => {
    const matchCat = activeCategory === 'All' || e.category === activeCategory;
    const matchSearch = !searchQuery || e.name.toLowerCase().includes(searchQuery.toLowerCase()) || e.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-[#2c2c32] space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Video Effects
          </h3>
          {appliedEffects.length > 0 && (
            <span className="text-[9px] font-bold bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full border border-purple-500/30">
              {appliedEffects.length} applied
            </span>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2 w-3 h-3 text-gray-500" />
          <input
            type="text"
            placeholder="Search effects..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[#121214] border border-[#2c2c32] rounded pl-7 pr-3 py-1 text-[10px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500 transition"
          />
        </div>
        {/* Category pills */}
        <div className="flex gap-1 flex-wrap">
          {(['All', ...EFFECT_CATEGORIES] as string[]).map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-2 py-0.5 rounded text-[9px] font-semibold transition ${activeCategory === cat ? 'bg-purple-600 text-white' : 'bg-[#1e1e22] text-gray-400 hover:text-gray-200 border border-[#2c2c32]'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Applied Effects strip */}
      {appliedEffects.length > 0 && (
        <div className="px-3 py-2 border-b border-[#2c2c32] space-y-1.5">
          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Applied</p>
          {appliedEffects.map((eff: any) => {
            const def = EFFECTS_REGISTRY[eff.id];
            if (!def) return null;
            const intensity = pendingIntensity[eff.id] ?? eff.intensity;
            return (
              <div key={eff.id} className="bg-[#1a1a20] border border-purple-500/30 rounded-lg p-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-purple-300">{def.name}</span>
                  <button
                    onClick={() => handleRemoveEffect(eff.id)}
                    className="text-gray-500 hover:text-red-400 transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={intensity}
                    onChange={e => {
                      const val = Number(e.target.value);
                      setPendingIntensity(prev => ({ ...prev, [eff.id]: val }));
                      handleApplyEffect(eff.id, val);
                    }}
                    className="flex-1 h-1 bg-[#2c2c32] rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                  <span className="text-[9px] font-mono text-gray-400 w-6 text-right">{intensity}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Effect cards grid */}
      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        <style>{`
          @keyframes preview-shake {
            0% { transform: translate(0, 0) rotate(0deg); }
            25% { transform: translate(1px, 1px) rotate(0.5deg); }
            50% { transform: translate(-1px, -1px) rotate(-0.5deg); }
            75% { transform: translate(1px, -1px) rotate(0.5deg); }
            100% { transform: translate(0, 0) rotate(0deg); }
          }
        `}</style>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
          {filtered.map(effect => {
            const isApplied = appliedIds.has(effect.id);
            const isHovered = hoveredId === effect.id;
            return (
              <div
                key={effect.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/cap-effect-id', effect.id);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className={`relative rounded-lg overflow-hidden cursor-pointer border transition-all duration-200 ${isApplied ? 'border-purple-500 shadow-lg shadow-purple-500/20' : 'border-[#2c2c32] hover:border-purple-400/60'}`}
                onMouseEnter={() => setHoveredId(effect.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => handleApplyEffect(effect.id, EFFECTS_REGISTRY[effect.id]?.defaultIntensity || 60)}
              >
                {/* Preview Thumbnail Container */}
                <div className="h-14 w-full relative overflow-hidden bg-zinc-950 flex items-center justify-center">
                  {effect.id === 'distort-mirror' ? (
                    <div className="w-full h-full flex pointer-events-none">
                      <div className="w-1/2 h-full overflow-hidden">
                        <EffectPreviewPlaceholder />
                      </div>
                      <div className="w-1/2 h-full overflow-hidden scale-x-[-1]">
                        <EffectPreviewPlaceholder />
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full transition-all duration-300" style={getEffectPreviewStyle(effect.id)}>
                      <EffectPreviewPlaceholder />
                    </div>
                  )}

                  {/* Vignette Overlay */}
                  {effect.id === 'color-vignette' && (
                    <div className="absolute inset-0 pointer-events-none" style={{
                      background: 'radial-gradient(circle, transparent 35%, rgba(0,0,0,0.85) 100%)'
                    }} />
                  )}

                  {/* CRT Scanlines Overlay */}
                  {effect.id === 'camera-scanlines' && (
                    <div className="absolute inset-0 pointer-events-none" style={{
                      background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.3) 50%)',
                      backgroundSize: '100% 3px'
                    }} />
                  )}

                  {/* Film Grain Overlay */}
                  {effect.id === 'camera-grain' && (
                    <div className="absolute inset-0 pointer-events-none opacity-25 bg-[radial-gradient(#fff_1px,transparent_1px)] bg-[size:3px_3px]" />
                  )}

                  {/* Pixelate Overlay */}
                  {effect.id === 'distort-pixelate' && (
                    <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(rgba(0,0,0,0.4)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.4)_1px,transparent_1px)] bg-[size:4px_4px]" />
                  )}

                  {isHovered && (
                    <div className="absolute inset-0 animate-pulse opacity-20"
                      style={{ background: `radial-gradient(circle at 50% 50%, ${effect.previewColors[0]}88, transparent 70%)` }}
                    />
                  )}
                  {isApplied && (
                    <div className="absolute top-1 right-1 w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center shadow z-10">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                  <div className="absolute bottom-1 left-1.5 z-10">
                    <span className="text-[8px] font-bold text-white/60 uppercase tracking-wider">{effect.category}</span>
                  </div>
                </div>
                {/* Label */}
                <div className="px-1.5 py-1 bg-[#121214]">
                  <p className="text-[10px] font-semibold text-gray-200 truncate">{effect.name}</p>
                  <p className="text-[9px] text-gray-500 truncate leading-tight mt-0.5">{effect.description}</p>
                </div>
              </div>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Sparkles className="w-6 h-6 text-gray-600 mb-2" />
            <p className="text-[10px] text-gray-500">No effects found</p>
          </div>
        )}
      </div>
    </div>
  );
}
