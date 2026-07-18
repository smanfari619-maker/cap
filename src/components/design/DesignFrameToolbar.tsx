import { useState, useEffect } from 'react';
import { useDesignStore } from './useDesignStore';
import { ChevronDown, Link2 } from 'lucide-react';

const PRESETS = [
  { name: 'Custom', width: 1024, height: 1024 },
  { name: '1:1', width: 1024, height: 1024 },
  { name: '2:3', width: 800, height: 1200 },
  { name: '9:16', width: 1080, height: 1920 },
  { name: '3:2', width: 1200, height: 800 },
  { name: '16:9', width: 1920, height: 1080 },
  { name: 'A4', width: 794, height: 1123 },
  { name: 'Website', width: 1440, height: 900 },
];

export default function DesignFrameToolbar() {
  const { artboardSelected, getCurrentPage, setPageBackground, updatePageDimensions, panX, panY, zoom } = useDesignStore();
  const page = getCurrentPage();

  const [layoutMode, setLayoutMode] = useState<'auto' | 'freeform'>('freeform');
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);
  const [activePresetName, setActivePresetName] = useState('Custom');
  const [isLocked, setIsLocked] = useState(false);

  // Sync preset name if page dimensions match any preset
  useEffect(() => {
    if (!page) return;
    const match = PRESETS.find(p => p.name !== 'Custom' && p.width === page.width && p.height === page.height);
    if (match) {
      setActivePresetName(match.name);
    } else {
      setActivePresetName('Custom');
    }
  }, [page?.width, page?.height]);

  if (!artboardSelected || !page) return null;

  const handleWidthChange = (val: number) => {
    if (isLocked && page.height > 0) {
      const ratio = page.width / page.height;
      updatePageDimensions(page.id, val, Math.round(val / ratio));
    } else {
      updatePageDimensions(page.id, val, page.height);
    }
  };

  const handleHeightChange = (val: number) => {
    if (isLocked && page.width > 0) {
      const ratio = page.width / page.height;
      updatePageDimensions(page.id, Math.round(val * ratio), val);
    } else {
      updatePageDimensions(page.id, page.width, val);
    }
  };

  const ax = panX;
  const ay = panY;
  const aw = page.width * zoom;

  const centerX = ax + aw / 2;
  const bottomY = ay - 22; // 22px above artboard top border
  const topY = Math.max(8, bottomY - 38);

  return (
    <div
      id="design-frame-toolbar"
      className="absolute flex items-center gap-2.5 px-3 py-1.5 rounded-full border bg-white select-none shadow-sm"
      style={{
        zIndex: 50,
        borderColor: '#e5e5e5',
        height: 38,
        left: centerX,
        top: topY,
        transform: 'translateX(-50%)',
      }}
    >
      {/* Fill Swatch / Color Input */}
      <div className="flex items-center gap-1.5">
        <div
          className="relative flex items-center justify-center w-5.5 h-5.5 rounded-full border cursor-pointer overflow-hidden shadow-sm"
          style={{
            borderColor: '#e5e5e5',
            backgroundColor: page.background === 'transparent' ? '#ffffff' : page.background,
          }}
          title="Fill color"
        >
          {page.background === 'transparent' && (
            <div className="absolute inset-0 bg-[linear-gradient(45deg,#ccc_25%,transparent_25%),linear-gradient(-45deg,#ccc_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#ccc_75%),linear-gradient(-45deg,transparent_75%,#ccc_75%)] bg-[size:6px_6px] bg-[position:0_0,0_3px,3px_-3px,-3px_0]" />
          )}
          <input
            type="color"
            value={page.background === 'transparent' ? '#ffffff' : page.background}
            onChange={(e) => setPageBackground(page.id, e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </div>

        {/* Transparency Toggle */}
        <button
          onClick={() => setPageBackground(page.id, page.background === 'transparent' ? '#ffffff' : 'transparent')}
          className="flex items-center justify-center w-5.5 h-5.5 rounded hover:bg-black/5 transition-colors"
          title="Toggle artboard transparency"
        >
          {page.background === 'transparent' ? (
            <div className="w-3.5 h-3.5 rounded-full border border-dashed border-gray-400" />
          ) : (
            <div className="w-3.5 h-3.5 rounded-full border-2 border-black" />
          )}
        </button>
      </div>

      <div className="w-px h-4 bg-gray-200" />

      {/* Layout Option */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Layout</span>
        <div className="flex p-0.5 rounded-lg bg-gray-100 border border-gray-200/40">
          <button
            onClick={() => setLayoutMode('auto')}
            className={`px-2.5 py-0.5 text-[10px] font-medium rounded-md transition-all ${
              layoutMode === 'auto' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-black'
            }`}
          >
            Auto
          </button>
          <button
            onClick={() => setLayoutMode('freeform')}
            className={`px-2.5 py-0.5 text-[10px] font-medium rounded-md transition-all ${
              layoutMode === 'freeform' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-black'
            }`}
          >
            Freeform
          </button>
        </div>
      </div>

      <div className="w-px h-4 bg-gray-200" />

      {/* Preset Dropdown */}
      <div className="relative">
        <button
          onClick={() => setShowPresetDropdown(!showPresetDropdown)}
          className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-black/5 transition-colors text-[11px] font-medium text-gray-700"
        >
          <span className="truncate max-w-[70px]">{activePresetName}</span>
          <ChevronDown size={10} className="text-gray-400" />
        </button>
        {showPresetDropdown && (
          <div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 mb-1.5 py-1.5 w-40 rounded-xl border bg-white shadow-xl z-50 max-h-60 overflow-y-auto"
            style={{ borderColor: '#e5e5e5' }}
            onMouseLeave={() => setShowPresetDropdown(false)}
          >
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => {
                  updatePageDimensions(page.id, preset.width, preset.height);
                  setActivePresetName(preset.name);
                  setShowPresetDropdown(false);
                }}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-gray-700 hover:bg-black/5 transition-colors"
              >
                <span>{preset.name}</span>
                <span className="text-gray-400 text-[9px] font-mono">{preset.width}×{preset.height}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Dimensions Inputs */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-medium text-gray-400 font-mono">W</span>
          <input
            type="number"
            value={page.width}
            onChange={(e) => handleWidthChange(parseInt(e.target.value) || 100)}
            className="w-12 px-1 py-0.5 rounded bg-gray-50 border border-gray-200 text-[11px] text-center font-mono text-gray-800 outline-none focus:border-blue-400"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-medium text-gray-400 font-mono">H</span>
          <input
            type="number"
            value={page.height}
            onChange={(e) => handleHeightChange(parseInt(e.target.value) || 100)}
            className="w-12 px-1 py-0.5 rounded bg-gray-50 border border-gray-200 text-[11px] text-center font-mono text-gray-800 outline-none focus:border-blue-400"
          />
        </div>

        {/* Link / Aspect Ratio Lock */}
        <button
          onClick={() => setIsLocked(!isLocked)}
          className={`flex items-center justify-center w-5.5 h-5.5 rounded transition-all ${
            isLocked ? 'bg-blue-50 text-blue-500 border border-blue-100' : 'text-gray-400 hover:text-gray-700 hover:bg-black/5'
          }`}
          title="Lock aspect ratio"
        >
          <Link2 size={12} />
        </button>
      </div>
    </div>
  );
}
