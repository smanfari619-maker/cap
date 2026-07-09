import { useState } from 'react';
import { Search, Zap, X, Clock, Check } from 'lucide-react';
import { TRANSITIONS_REGISTRY, TRANSITION_CATEGORIES } from '../../../lib/transitions-registry';
import heroImg from '../../../assets/hero.png';

const EffectPreviewPlaceholder = () => (
  <div className="w-full h-full relative overflow-hidden">
    <img src={heroImg} className="w-full h-full object-cover" alt="Outgoing Clip" />
  </div>
);

const TransitionPreviewPlaceholderB = () => (
  <div className="w-full h-full relative overflow-hidden">
    <img src={heroImg} className="w-full h-full object-cover filter hue-rotate-[120deg] brightness-[85%]" alt="Incoming Clip" />
  </div>
);

const getTransitionAnimationA = (id: string, isHovered: boolean) => {
  if (!isHovered) return {};
  if (id === 'cross-zoom') {
    return { animation: 'trans-cross-zoom-a 1.5s infinite ease-in-out' };
  }
  return {};
};

const getTransitionAnimationB = (id: string, isHovered: boolean) => {
  if (!isHovered) return { opacity: 0 };
  switch (id) {
    case 'fade':
      return { animation: 'trans-fade 1.5s infinite ease-in-out' };
    case 'dip-black':
    case 'dip-white':
    case 'flash':
      return { animation: 'trans-clip-reveal 1.5s infinite' };
    case 'wipe-left':
      return { animation: 'trans-wipe-left 1.5s infinite ease-in-out' };
    case 'wipe-right':
      return { animation: 'trans-wipe-right 1.5s infinite ease-in-out' };
    case 'wipe-up':
      return { animation: 'trans-wipe-up 1.5s infinite ease-in-out' };
    case 'wipe-down':
      return { animation: 'trans-wipe-down 1.5s infinite ease-in-out' };
    case 'slide-left':
      return { animation: 'trans-slide-left 1.5s infinite ease-in-out' };
    case 'slide-right':
      return { animation: 'trans-slide-right 1.5s infinite ease-in-out' };
    case 'slide-up':
      return { animation: 'trans-slide-up 1.5s infinite ease-in-out' };
    case 'slide-down':
      return { animation: 'trans-slide-down 1.5s infinite ease-in-out' };
    case 'zoom':
      return { animation: 'trans-zoom 1.5s infinite ease-in-out' };
    case 'zoom-out':
      return { animation: 'trans-zoom-out 1.5s infinite ease-in-out' };
    case 'cross-zoom':
      return { animation: 'trans-cross-zoom-b 1.5s infinite ease-in-out' };
    case 'glitch':
      return { animation: 'trans-glitch-b 1.5s infinite steps(5)' };
    default:
      return { animation: 'trans-fade 1.5s infinite ease-in-out' };
  }
};

interface TransitionsPanelProps {
  selectedClipId: string | null;
  project: any;
  handleApplyTransition: (type: string) => void;
  updateClip: any;
}

export default function TransitionsPanel({ selectedClipId, project, handleApplyTransition, updateClip }: TransitionsPanelProps) {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [transitionDuration, setTransitionDuration] = useState(1000);

  const selectedClip = selectedClipId
    ? project?.tracks.flatMap((t: any) => t.clips).find((c: any) => c.id === selectedClipId)
    : null;

  const activeTransType = selectedClip?.transitionIn?.type || selectedClip?.transitionType || null;

  const allTransitions = Object.values(TRANSITIONS_REGISTRY);
  const filtered = allTransitions.filter(t => {
    const matchCat = activeCategory === 'All' || t.category === activeCategory;
    const matchSearch = !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleApplyWithDuration = (type: string) => {
    if (!selectedClipId) {
      alert('Please select a video clip on the timeline first to apply a transition.');
      return;
    }
    updateClip(selectedClipId, {
      transitionType: type,
      fadeInMs: transitionDuration,
      transitionIn: { type, durationMs: transitionDuration, easing: 'ease-in-out' }
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-[#2c2c32] space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-xs uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-sky-400" /> Transitions
          </h3>
          {activeTransType && (
            <button
              onClick={() => handleApplyTransition('clear')}
              className="text-[9px] text-red-400 hover:text-red-300 transition flex items-center gap-0.5"
            >
              <X className="w-2.5 h-2.5" /> Clear
            </button>
          )}
        </div>

        {/* Duration slider */}
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <label className="text-[9px] font-semibold text-gray-500 uppercase flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" /> Duration
            </label>
            <span className="text-[9px] font-mono text-gray-400">{(transitionDuration / 1000).toFixed(1)}s</span>
          </div>
          <input
            type="range"
            min={200}
            max={3000}
            step={100}
            value={transitionDuration}
            onChange={e => setTransitionDuration(Number(e.target.value))}
            className="w-full h-1 bg-[#2c2c32] rounded-lg appearance-none cursor-pointer accent-sky-500"
          />
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2 w-3 h-3 text-gray-500" />
          <input
            type="text"
            placeholder="Search transitions..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[#121214] border border-[#2c2c32] rounded pl-7 pr-3 py-1 text-[10px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-sky-500 transition"
          />
        </div>
        {/* Category pills */}
        <div className="flex gap-1 flex-wrap">
          {(['All', ...TRANSITION_CATEGORIES] as string[]).map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-2 py-0.5 rounded text-[9px] font-semibold transition ${activeCategory === cat ? 'bg-sky-600 text-white' : 'bg-[#1e1e22] text-gray-400 hover:text-gray-200 border border-[#2c2c32]'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Transition cards grid */}
      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        <style>{`
          @keyframes trans-fade {
            0%, 10% { opacity: 0; }
            90%, 100% { opacity: 1; }
          }
          @keyframes trans-dip-black {
            0%, 10% { opacity: 0; }
            45%, 55% { opacity: 1; }
            90%, 100% { opacity: 0; }
          }
          @keyframes trans-clip-reveal {
            0%, 10% { opacity: 0; }
            45% { opacity: 0; }
            50%, 100% { opacity: 1; }
          }
          @keyframes trans-wipe-left {
            0%, 10% { clip-path: inset(0 100% 0 0); }
            90%, 100% { clip-path: inset(0 0 0 0); }
          }
          @keyframes trans-wipe-right {
            0%, 10% { clip-path: inset(0 0 0 100%); }
            90%, 100% { clip-path: inset(0 0 0 0); }
          }
          @keyframes trans-wipe-up {
            0%, 10% { clip-path: inset(100% 0 0 0); }
            90%, 100% { clip-path: inset(0 0 0 0); }
          }
          @keyframes trans-wipe-down {
            0%, 10% { clip-path: inset(0 0 100% 0); }
            90%, 100% { clip-path: inset(0 0 0 0); }
          }
          @keyframes trans-slide-left {
            0%, 10% { transform: translateX(100%); }
            90%, 100% { transform: translateX(0); }
          }
          @keyframes trans-slide-right {
            0%, 10% { transform: translateX(-100%); }
            90%, 100% { transform: translateX(0); }
          }
          @keyframes trans-slide-up {
            0%, 10% { transform: translateY(100%); }
            90%, 100% { transform: translateY(0); }
          }
          @keyframes trans-slide-down {
            0%, 10% { transform: translateY(-100%); }
            90%, 100% { transform: translateY(0); }
          }
          @keyframes trans-zoom {
            0%, 10% { transform: scale(0.3); opacity: 0; }
            90%, 100% { transform: scale(1); opacity: 1; }
          }
          @keyframes trans-zoom-out {
            0%, 10% { transform: scale(1.5); opacity: 0; }
            90%, 100% { transform: scale(1); opacity: 1; }
          }
          @keyframes trans-cross-zoom-a {
            0%, 10% { transform: scale(1); opacity: 1; }
            90%, 100% { transform: scale(1.5); opacity: 0; }
          }
          @keyframes trans-cross-zoom-b {
            0%, 10% { transform: scale(0.5); opacity: 0; }
            90%, 100% { transform: scale(1); opacity: 1; }
          }
          @keyframes trans-glitch-b {
            0%, 10% { opacity: 0; transform: translate(0, 0); filter: hue-rotate(0deg); }
            20% { opacity: 0.3; transform: translate(-2px, 1px); filter: hue-rotate(90deg); }
            40% { opacity: 0.6; transform: translate(2px, -1px); filter: hue-rotate(180deg); }
            60% { opacity: 0.8; transform: translate(-1px, -1px); }
            80%, 100% { opacity: 1; transform: translate(0, 0); filter: hue-rotate(0deg); }
          }
          @keyframes trans-flash-overlay {
            0%, 10% { opacity: 0; }
            30%, 50% { opacity: 1; }
            90%, 100% { opacity: 0; }
          }
        `}</style>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
          {filtered.map(trans => {
            const isApplied = activeTransType === trans.id;
            const isHovered = hoveredId === trans.id;
            return (
              <div
                key={trans.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/cap-transition-id', trans.id);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className={`relative rounded-lg overflow-hidden cursor-pointer border transition-all duration-200 ${isApplied ? 'border-sky-500 shadow-lg shadow-sky-500/20' : 'border-[#2c2c32] hover:border-sky-400/60'}`}
                onMouseEnter={() => setHoveredId(trans.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => handleApplyWithDuration(trans.id)}
              >
                {/* Preview Thumbnail Container */}
                <div className="h-14 w-full relative overflow-hidden bg-zinc-950 flex items-center justify-center">
                  {/* Outgoing Clip (Image A) */}
                  <div className="absolute inset-0 w-full h-full" style={getTransitionAnimationA(trans.id, isHovered)}>
                    <EffectPreviewPlaceholder />
                  </div>

                  {/* Incoming Clip (Image B) */}
                  <div className="absolute inset-0 w-full h-full" style={getTransitionAnimationB(trans.id, isHovered)}>
                    <TransitionPreviewPlaceholderB />
                  </div>

                  {/* Dip to Black Overlay */}
                  {isHovered && trans.id === 'dip-black' && (
                    <div className="absolute inset-0 bg-black pointer-events-none" style={{
                      animation: 'trans-dip-black 1.5s infinite ease-in-out'
                    }} />
                  )}

                  {/* Dip to White Overlay */}
                  {isHovered && trans.id === 'dip-white' && (
                    <div className="absolute inset-0 bg-white pointer-events-none" style={{
                      animation: 'trans-dip-black 1.5s infinite ease-in-out'
                    }} />
                  )}

                  {/* Flash Overlay */}
                  {isHovered && trans.id === 'flash' && (
                    <div className="absolute inset-0 bg-white pointer-events-none" style={{
                      animation: 'trans-flash-overlay 1.5s infinite ease-out'
                    }} />
                  )}

                  {isApplied && (
                    <div className="absolute top-1 right-1 w-4 h-4 bg-sky-500 rounded-full flex items-center justify-center shadow z-10">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                  <div className="absolute bottom-1 left-1.5 z-10">
                    <span className="text-[8px] font-bold text-white/60 uppercase tracking-wider">{trans.category}</span>
                  </div>
                </div>
                {/* Label */}
                <div className="px-1.5 py-1 bg-[#121214]">
                  <p className="text-[10px] font-semibold text-gray-200 truncate">{trans.name}</p>
                  <p className="text-[9px] text-gray-500 truncate leading-tight mt-0.5">{trans.description}</p>
                </div>
              </div>
            );
          })}
        </div>
        {/* Clear button at bottom */}
        <button
          onClick={() => handleApplyTransition('clear')}
          className="mt-3 w-full py-2 text-[10px] font-semibold text-gray-400 hover:text-red-400 border border-[#2c2c32] hover:border-red-500/40 rounded-lg transition flex items-center justify-center gap-1.5"
        >
          <X className="w-3 h-3" /> Remove Transition
        </button>
      </div>
    </div>
  );
}
