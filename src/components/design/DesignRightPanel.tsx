import { useState, useCallback } from 'react';
import {
  Lock, Unlock, Eye, EyeOff, Trash2,
  AlignLeft, AlignCenter, AlignRight,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  ChevronDown, ChevronUp, Layers, BringToFront, SendToBack,
  Sliders, Type as TypeIcon, Palette, Plus, X,
} from 'lucide-react';
import { useDesignStore } from './useDesignStore';
import type {
  DesignElement, TextElement, RectElement, Fill, Stroke, Effect, DropShadow, SolidFill
} from './types';

// ─── Mini Color Swatch ────────────────────────────────────────────────────────

function ColorSwatch({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  return (
    <label className="relative w-8 h-8 rounded-lg overflow-hidden border cursor-pointer shrink-0 hover:scale-105 transition-transform"
      style={{ borderColor: '#444' }}>
      <div className="absolute inset-0" style={{ background: color }} />
      <input
        type="color"
        value={color}
        onChange={e => onChange(e.target.value)}
        className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
      />
    </label>
  );
}

// ─── Number Input ─────────────────────────────────────────────────────────────

function NumInput({
  label, value, onChange, unit = '', step = 1, min, max,
}: {
  label: string; value: number; onChange: (v: number) => void;
  unit?: string; step?: number; min?: number; max?: number;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs" style={{ color: '#6b7280', fontSize: 9 }}>{label}</label>
      <div className="flex items-center gap-0.5 px-1.5 py-1 rounded-md" style={{ background: '#f3f4f6', border: '1px solid #e5e5e5' }}>
        <input
          type="number"
          value={Math.round(value * 100) / 100}
          min={min}
          max={max}
          step={step}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full bg-transparent text-xs outline-none text-right"
          style={{ color: '#111827' }}
        />
        {unit && <span className="text-xs shrink-0" style={{ color: '#6b7280' }}>{unit}</span>}
      </div>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ label, icon: Icon, expanded, onToggle }: {
  label: string; icon: any; expanded: boolean; onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between py-2.5 text-xs font-semibold"
      style={{ color: '#6b7280' }}
    >
      <div className="flex items-center gap-1.5">
        <Icon size={12} />
        {label}
      </div>
      {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
    </button>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function DesignRightPanel() {
  const {
    selectedIds, elements, updateElement,
    bringForward, sendBackward, bringToFront, sendToBack,
    deleteElements, getCurrentPage, getSelectionBounds,
    setPageBackground, updatePageDimensions, alignElements, distributeElements, flipElement,
    tool, setTool, addPage, booleanOperation,
  } = useDesignStore();

  const [openSections, setOpenSections] = useState({
    position: true, fill: true, stroke: false, text: true, effects: false, layers: false,
  });

  const toggle = (key: keyof typeof openSections) =>
    setOpenSections(s => ({ ...s, [key]: !s[key] }));

  const currentPage = getCurrentPage();
  const selectedEl = selectedIds.length === 1 ? elements[selectedIds[0]] : null;
  const bounds = getSelectionBounds();

  // ── Frame Tool Active: Show Preset Templates ────────────────────────────
  if (tool === 'frame') {
    const FRAME_PRESETS = [
      {
        category: 'Phone',
        sizes: [
          { name: 'iPhone 14', width: 393, height: 852 },
          { name: 'iPhone 14 Pro Max', width: 430, height: 932 },
          { name: 'Google Pixel 7', width: 412, height: 915 },
        ]
      },
      {
        category: 'Tablet',
        sizes: [
          { name: 'iPad Pro 11"', width: 834, height: 1194 },
          { name: 'iPad Pro 12.9"', width: 1024, height: 1366 },
        ]
      },
      {
        category: 'Desktop',
        sizes: [
          { name: 'MacBook Pro 14"', width: 1512, height: 982 },
          { name: 'Desktop', width: 1440, height: 1024 },
        ]
      },
      {
        category: 'Presentation',
        sizes: [
          { name: 'Presentation 16:9', width: 1920, height: 1080 },
        ]
      },
      {
        category: 'Social media',
        sizes: [
          { name: 'Instagram Post', width: 1080, height: 1080 },
          { name: 'Instagram Story', width: 1080, height: 1920 },
          { name: 'YouTube Thumbnail', width: 1280, height: 720 },
          { name: 'Twitter/X Post', width: 1600, height: 900 },
          { name: 'Facebook Cover', width: 1640, height: 624 },
          { name: 'LinkedIn Post', width: 1200, height: 627 },
        ]
      },
      {
        category: 'Paper',
        sizes: [
          { name: 'A4', width: 794, height: 1123 },
          { name: 'Letter', width: 816, height: 1056 },
        ]
      },
      {
        category: 'Community / Logo',
        sizes: [
          { name: 'Logo Square', width: 800, height: 800 },
        ]
      }
    ];

    return (
      <div className="flex flex-col h-full overflow-hidden select-none"
        style={{
          background: '#ffffff',
          borderLeft: '1px solid #e5e5e5',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.12)',
          borderRadius: '12px 0 0 12px',
          width: 252,
        }}
      >
        <div className="px-3 py-3 border-b" style={{ borderColor: '#e5e5e5' }}>
          <p className="text-xs font-semibold" style={{ color: '#6b7280' }}>FRAME PRESETS</p>
          <p className="text-[9px] text-gray-500 mt-0.5">Choose a preset size to create a frame, or drag on the canvas to draw a custom one.</p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4 scrollbar-thin">
          {FRAME_PRESETS.map(cat => (
            <div key={cat.category} className="space-y-1.5">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide px-1">{cat.category}</p>
              <div className="space-y-0.5">
                {cat.sizes.map(size => (
                  <button
                    key={size.name}
                    onClick={() => {
                      addPage(size.name, size.width, size.height);
                      setTool('select');
                    }}
                    className="w-full flex items-center justify-between px-2 py-2 rounded-md hover:bg-black/5 text-left text-xs text-gray-700 transition-colors"
                  >
                    <span className="font-medium truncate max-w-[130px]">{size.name}</span>
                    <span className="text-[10px] text-gray-500 font-mono shrink-0">{size.width} × {size.height}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── No selection ─────────────────────────────────────────────────────────

  if (!selectedEl && !bounds) {
    return (
      <div
        className="flex flex-col h-full overflow-y-auto"
        style={{ background: '#ffffff', borderLeft: '1px solid #e5e5e5' }}
      >
        <div className="px-4 py-3 border-b" style={{ borderColor: '#e5e5e5' }}>
          <p className="text-xs font-semibold" style={{ color: '#6b7280' }}>PAGE</p>
        </div>
        {currentPage && (
          <div className="px-4 py-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <NumInput
                label="WIDTH"
                value={currentPage.width}
                onChange={w => updatePageDimensions(currentPage.id, w, currentPage.height)}
              />
              <NumInput
                label="HEIGHT"
                value={currentPage.height}
                onChange={h => updatePageDimensions(currentPage.id, currentPage.width, h)}
              />
            </div>
            <div>
              <p className="text-xs mb-1.5" style={{ color: '#6b7280', fontSize: 9 }}>BACKGROUND</p>
              <div className="flex items-center gap-2">
                <ColorSwatch
                  color={currentPage.background}
                  onChange={c => setPageBackground(currentPage.id, c)}
                />
                <span className="text-xs font-mono" style={{ color: '#111827' }}>
                  {currentPage.background.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        )}
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-xs text-center" style={{ color: '#6b7280' }}>
            Select an element to edit its properties
          </p>
        </div>
      </div>
    );
  }

  const el = selectedEl;
  const upd = (updates: Partial<DesignElement>) => {
    if (selectedEl) updateElement(selectedEl.id, updates);
  };

  const firstFill = el?.fills[0] as SolidFill | undefined;

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{
        background: '#ffffff',
        borderLeft: '1px solid #e5e5e5',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.12)',
        borderRadius: '12px 0 0 12px',
        width: 252,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0" style={{ borderColor: '#e5e5e5' }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold truncate" style={{ color: '#111827' }}>
            {el?.name ?? `${selectedIds.length} elements`}
          </span>
          {el && (
            <span className="px-1.5 py-0.5 rounded text-xs animate-none" style={{ background: '#f3f4f6', color: '#6b7280' }}>
              {el.type}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {el && (
            <>
              <button
                title={el.visible ? 'Hide' : 'Show'}
                onClick={() => upd({ visible: !el.visible })}
                className="p-1 rounded hover:bg-black/5"
                style={{ color: el.visible ? '#6b7280' : '#a3a3a3' }}
              >
                {el.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <button
                title={el.locked ? 'Unlock' : 'Lock'}
                onClick={() => upd({ locked: !el.locked })}
                className="p-1 rounded hover:bg-black/5"
                style={{ color: '#6b7280' }}
              >
                {el.locked ? <Lock size={13} /> : <Unlock size={13} />}
              </button>
              <button
                title="Delete"
                onClick={() => deleteElements(selectedIds)}
                className="p-1 rounded hover:bg-red-500/20"
                style={{ color: '#f87171' }}
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 divide-y" style={{ divideColor: '#e5e5e5' }}>

        {/* ── Alignment & Distribution ────────────────────────────────────── */}
        <div className="py-2 flex items-center justify-between gap-1" style={{ borderColor: '#e5e5e5' }}>
          <div className="flex items-center gap-1">
            <button
              title="Align Left"
              onClick={() => alignElements('left')}
              className="p-1.5 rounded hover:bg-black/5 text-gray-500 hover:text-black"
            >
              <AlignLeft size={14} />
            </button>
            <button
              title="Align Center"
              onClick={() => alignElements('center')}
              className="p-1.5 rounded hover:bg-black/5 text-gray-500 hover:text-black"
            >
              <AlignCenter size={14} />
            </button>
            <button
              title="Align Right"
              onClick={() => alignElements('right')}
              className="p-1.5 rounded hover:bg-black/5 text-gray-500 hover:text-black"
            >
              <AlignRight size={14} />
            </button>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />
            <button
              title="Align Top"
              onClick={() => alignElements('top')}
              className="p-1.5 rounded hover:bg-black/5 text-gray-500 hover:text-black"
            >
              <AlignStartVertical size={14} />
            </button>
            <button
              title="Align Middle"
              onClick={() => alignElements('middle')}
              className="p-1.5 rounded hover:bg-black/5 text-gray-500 hover:text-black"
            >
              <AlignCenterVertical size={14} />
            </button>
            <button
              title="Align Bottom"
              onClick={() => alignElements('bottom')}
              className="p-1.5 rounded hover:bg-black/5 text-gray-500 hover:text-black"
            >
              <AlignEndVertical size={14} />
            </button>
          </div>

          {selectedIds.length >= 3 && (
            <div className="flex items-center gap-1 shrink-0">
              <div className="w-px h-4 bg-gray-200 mx-0.5" />
              <button
                title="Distribute Horizontally"
                onClick={() => distributeElements('h')}
                className="px-1.5 py-1 rounded hover:bg-black/5 text-xs text-purple-600 font-semibold"
              >
                H-Dist
              </button>
              <button
                title="Distribute Vertically"
                onClick={() => distributeElements('v')}
                className="px-1.5 py-1 rounded hover:bg-black/5 text-xs text-purple-600 font-semibold"
              >
                V-Dist
              </button>
            </div>
          )}
        </div>

        {/* ── Boolean Operations ─────────────────────────────────────────── */}
        {selectedIds.length >= 2 && (
          <div className="py-2.5 flex flex-col gap-1.5" style={{ borderColor: '#e5e5e5' }}>
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Boolean Groups</span>
            <div className="grid grid-cols-4 gap-1 bg-gray-50 p-1 rounded-md border border-gray-200">
              <button
                onClick={() => booleanOperation('union')}
                className="py-1 rounded text-[10px] hover:bg-black/5 text-purple-600 font-semibold transition-colors"
                title="Union Selection"
              >
                Union
              </button>
              <button
                onClick={() => booleanOperation('subtract')}
                className="py-1 rounded text-[10px] hover:bg-black/5 text-purple-600 font-semibold transition-colors"
                title="Subtract Selection"
              >
                Subtract
              </button>
              <button
                onClick={() => booleanOperation('intersect')}
                className="py-1 rounded text-[10px] hover:bg-black/5 text-purple-600 font-semibold transition-colors"
                title="Intersect Selection"
              >
                Intersect
              </button>
              <button
                onClick={() => booleanOperation('exclude')}
                className="py-1 rounded text-[10px] hover:bg-black/5 text-purple-600 font-semibold transition-colors"
                title="Exclude Selection"
              >
                Exclude
              </button>
            </div>
          </div>
        )}
        {/* ── Position & Size ────────────────────────────────────────────── */}
        <div>
          <SectionHeader label="POSITION & SIZE" icon={Sliders} expanded={openSections.position} onToggle={() => toggle('position')} />
          {openSections.position && el && (
            <div className="pb-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <NumInput label="X" value={el.x} onChange={v => upd({ x: v })} />
                <NumInput label="Y" value={el.y} onChange={v => upd({ y: v })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumInput label="W" value={el.width} onChange={v => upd({ width: Math.max(1, v) })} min={1} />
                <NumInput label="H" value={el.height} onChange={v => upd({ height: Math.max(1, v) })} min={1} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumInput label="ROTATE" value={el.rotation} onChange={v => upd({ rotation: v })} unit="°" />
                <NumInput label="OPACITY" value={el.opacity * 100} onChange={v => upd({ opacity: v / 100 })} unit="%" min={0} max={100} />


                <div className="flex flex-col gap-0.5">
                  <label className="text-xs" style={{ color: '#6b7280', fontSize: 9 }}>BLEND MODE</label>
                  <select
                    value={el.blendMode}
                    onChange={e => upd({ blendMode: e.target.value as any })}
                    className="w-full h-[26px] px-1 py-0.5 rounded-md text-xs outline-none"
                    style={{ background: '#f3f4f6', color: '#111827', border: '1px solid #e5e5e5' }}
                  >
                    {['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'].map(bm => (
                      <option key={bm} value={bm}>{bm}</option>
                    ))}
                  </select>
                </div>
              </div>

              {(el.type === 'rect' || el.type === 'frame') && (
                <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-gray-200 col-span-2">
                  <NumInput
                    label="CORNER RADIUS (UNIFORM)"
                    value={(el as RectElement).cornerRadius ?? 0}
                    onChange={v => {
                      const val = Math.max(0, v);
                      upd({ cornerRadius: val, cornerRadii: [val, val, val, val] } as any);
                    }}
                    min={0}
                  />
                  {el.type === 'rect' && (
                    <div className="grid grid-cols-4 gap-1 mt-1">
                      <NumInput
                        label="TL"
                        value={(el as RectElement).cornerRadii?.[0] ?? (el as RectElement).cornerRadius ?? 0}
                        onChange={v => {
                          const rect = el as RectElement;
                          const current = rect.cornerRadii || [rect.cornerRadius, rect.cornerRadius, rect.cornerRadius, rect.cornerRadius];
                          upd({ cornerRadii: [Math.max(0, v), current[1], current[2], current[3]] } as any);
                        }}
                        min={0}
                      />
                      <NumInput
                        label="TR"
                        value={(el as RectElement).cornerRadii?.[1] ?? (el as RectElement).cornerRadius ?? 0}
                        onChange={v => {
                          const rect = el as RectElement;
                          const current = rect.cornerRadii || [rect.cornerRadius, rect.cornerRadius, rect.cornerRadius, rect.cornerRadius];
                          upd({ cornerRadii: [current[0], Math.max(0, v), current[2], current[3]] } as any);
                        }}
                        min={0}
                      />
                      <NumInput
                        label="BR"
                        value={(el as RectElement).cornerRadii?.[2] ?? (el as RectElement).cornerRadius ?? 0}
                        onChange={v => {
                          const rect = el as RectElement;
                          const current = rect.cornerRadii || [rect.cornerRadius, rect.cornerRadius, rect.cornerRadius, rect.cornerRadius];
                          upd({ cornerRadii: [current[0], current[1], Math.max(0, v), current[3]] } as any);
                        }}
                        min={0}
                      />
                      <NumInput
                        label="BL"
                        value={(el as RectElement).cornerRadii?.[3] ?? (el as RectElement).cornerRadius ?? 0}
                        onChange={v => {
                          const rect = el as RectElement;
                          const current = rect.cornerRadii || [rect.cornerRadius, rect.cornerRadius, rect.cornerRadius, rect.cornerRadius];
                          upd({ cornerRadii: [current[0], current[1], current[2], Math.max(0, v)] } as any);
                        }}
                        min={0}
                      />
                    </div>
                  )}
                </div>
              )}

              {el.type === 'star' && (
                <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-200 col-span-2">
                  <NumInput
                    label="POINTS"
                    value={(el as any).points ?? 5}
                    onChange={v => upd({ points: Math.max(3, Math.min(100, Math.round(v))) } as any)}
                    min={3}
                    max={100}
                  />
                  <NumInput
                    label="INNER RATIO"
                    value={((el as any).innerRatio ?? 0.38) * 100}
                    onChange={v => upd({ innerRatio: Math.max(0.01, Math.min(0.99, v / 100)) } as any)}
                    min={1}
                    max={99}
                    unit="%"
                  />
                </div>
              )}

              {el.type === 'polygon' && (
                <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-200 col-span-2">
                  <NumInput
                    label="SIDES"
                    value={(el as any).sides ?? 6}
                    onChange={v => upd({ sides: Math.max(3, Math.min(100, Math.round(v))) } as any)}
                    min={3}
                    max={100}
                  />
                </div>
              )}

              {el.type === 'image' && (
                <div className="border border-gray-200 p-2 rounded-lg bg-gray-50/50 mt-2 space-y-1.5 col-span-2">
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Image Crop</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <NumInput
                      label="CROP X"
                      value={((el as any).cropX ?? 0) * 100}
                      onChange={v => upd({ cropX: Math.max(0, Math.min(100, v)) / 100 } as any)}
                      min={0}
                      max={100}
                      unit="%"
                    />
                    <NumInput
                      label="CROP Y"
                      value={((el as any).cropY ?? 0) * 100}
                      onChange={v => upd({ cropY: Math.max(0, Math.min(100, v)) / 100 } as any)}
                      min={0}
                      max={100}
                      unit="%"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <NumInput
                      label="CROP W"
                      value={((el as any).cropW ?? 1) * 100}
                      onChange={v => upd({ cropW: Math.max(1, Math.min(100, v)) / 100 } as any)}
                      min={1}
                      max={100}
                      unit="%"
                    />
                    <NumInput
                      label="CROP H"
                      value={((el as any).cropH ?? 1) * 100}
                      onChange={v => upd({ cropH: Math.max(1, Math.min(100, v)) / 100 } as any)}
                      min={1}
                      max={100}
                      unit="%"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => flipElement(el.id, 'h')}
                  className="flex-1 py-1 rounded text-xs transition-all hover:bg-black/5"
                  style={{
                    background: (el as any).flipHorizontal ? 'rgba(124,58,237,0.2)' : '#f3f4f6',
                    color: (el as any).flipHorizontal ? '#7c3aed' : '#4b5563',
                    border: '1px solid',
                    borderColor: (el as any).flipHorizontal ? '#7c3aed' : '#e5e5e5',
                  }}
                >
                  Flip Horizontal
                </button>
                <button
                  onClick={() => flipElement(el.id, 'v')}
                  className="flex-1 py-1 rounded text-xs transition-all hover:bg-black/5"
                  style={{
                    background: (el as any).flipVertical ? 'rgba(124,58,237,0.2)' : '#f3f4f6',
                    color: (el as any).flipVertical ? '#7c3aed' : '#4b5563',
                    border: '1px solid',
                    borderColor: (el as any).flipVertical ? '#7c3aed' : '#e5e5e5',
                  }}
                >
                  Flip Vertical
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Fill ──────────────────────────────────────────────────────── */}
        <div>
          <SectionHeader label="FILL" icon={Palette} expanded={openSections.fill} onToggle={() => toggle('fill')} />
          {openSections.fill && el && (
            <div className="pb-3 space-y-3">
              {el.fills.map((fill, i) => (
                <div key={i} className="space-y-1.5 p-2 rounded-lg bg-gray-50/50 border border-gray-200">
                  <div className="flex items-center justify-between">
                    <select
                      value={fill.type}
                      onChange={e => {
                        const newType = e.target.value as any;
                        const fills = [...el.fills];
                        if (newType === 'solid') {
                          fills[i] = { type: 'solid', color: '#7c3aed', opacity: 1 };
                        } else if (newType === 'linear' || newType === 'radial') {
                          fills[i] = {
                            type: newType,
                            stops: [
                              { color: '#7c3aed', position: 0, opacity: 1 },
                              { color: '#a855f7', position: 1, opacity: 1 }
                            ],
                            ...(newType === 'linear' ? { angle: 135 } : {})
                          };
                        } else {
                          fills[i] = { type: 'image', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400', fit: 'fill' };
                        }
                        upd({ fills });
                      }}
                      className="px-1 py-0.5 rounded text-xs outline-none bg-[#f3f4f6] text-gray-700 border border-gray-200"
                    >
                      <option value="solid">Solid</option>
                      <option value="linear">Linear</option>
                      <option value="radial">Radial</option>
                      <option value="image">Image</option>
                    </select>

                    <button
                      onClick={() => upd({ fills: el.fills.filter((_, fi) => fi !== i) })}
                      className="p-1 rounded hover:bg-black/5"
                      style={{ color: '#6b7280' }}
                    >
                      <X size={10} />
                    </button>
                  </div>

                  {fill.type === 'solid' && (
                    <div className="flex items-center gap-2">
                      <ColorSwatch
                        color={fill.color}
                        onChange={c => {
                          const fills = [...el.fills];
                          fills[i] = { ...fill, color: c };
                          upd({ fills });
                        }}
                      />
                      <input
                        value={fill.color.toUpperCase()}
                        onChange={e => {
                          const fills = [...el.fills];
                          fills[i] = { ...fill, color: e.target.value };
                          upd({ fills });
                        }}
                        className="flex-1 px-2 py-1 rounded-md text-xs font-mono outline-none"
                        style={{ background: '#f3f4f6', color: '#111827', border: '1px solid #e5e5e5' }}
                      />
                      <NumInput
                        label=""
                        value={fill.opacity * 100}
                        onChange={v => {
                          const fills = [...el.fills];
                          fills[i] = { ...fill, opacity: v / 100 };
                          upd({ fills });
                        }}
                        unit="%"
                        min={0}
                        max={100}
                      />
                    </div>
                  )}

                  {(fill.type === 'linear' || fill.type === 'radial') && (
                    <div className="space-y-2 pt-1">
                      {fill.type === 'linear' && (
                        <div className="flex items-center justify-between">
                          <label className="text-[9px]" style={{ color: '#6b7280' }}>GRADIENT ANGLE</label>
                          <NumInput
                            label=""
                            value={(fill as any).angle ?? 0}
                            onChange={v => {
                              const fills = [...el.fills];
                              fills[i] = { ...fill, angle: v };
                              upd({ fills });
                            }}
                            unit="°"
                          />
                        </div>
                      )}

                      {/* Stops list */}
                      <div className="space-y-1.5 p-1.5 rounded bg-gray-100/50 border border-[#e5e5e5]">
                        {((fill as any).stops || []).map((stop: any, si: number) => (
                          <div key={si} className="flex items-center gap-1.5">
                            <ColorSwatch
                              color={stop.color}
                              onChange={c => {
                                const fills = [...el.fills];
                                const stops = [...(fills[i] as any).stops];
                                stops[si] = { ...stop, color: c };
                                fills[i] = { ...fills[i], stops };
                                upd({ fills });
                              }}
                            />
                            <input
                              value={stop.color.toUpperCase()}
                              onChange={e => {
                                const fills = [...el.fills];
                                const stops = [...(fills[i] as any).stops];
                                stops[si] = { ...stop, color: e.target.value };
                                fills[i] = { ...fills[i], stops };
                                upd({ fills });
                              }}
                              className="w-16 px-1 py-0.5 rounded text-[10px] font-mono outline-none"
                              style={{ background: '#f3f4f6', color: '#111827', border: '1px solid #e5e5e5' }}
                            />
                            <NumInput
                              label=""
                              value={Math.round(stop.position * 100)}
                              onChange={v => {
                                const fills = [...el.fills];
                                const stops = [...(fills[i] as any).stops];
                                stops[si] = { ...stop, position: Math.max(0, Math.min(100, v)) / 100 };
                                stops.sort((a, b) => a.position - b.position);
                                fills[i] = { ...fills[i], stops };
                                upd({ fills });
                              }}
                              unit="%"
                              min={0}
                              max={100}
                            />
                            {((fill as any).stops || []).length > 2 && (
                              <button
                                onClick={() => {
                                  const fills = [...el.fills];
                                  const stops = ((fills[i] as any).stops || []).filter((_: any, sidx: number) => sidx !== si);
                                  fills[i] = { ...fills[i], stops };
                                  upd({ fills });
                                }}
                                className="p-1 rounded hover:text-red-400 text-gray-600"
                              >
                                <X size={10} />
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          onClick={() => {
                            const fills = [...el.fills];
                            const stops = [...((fills[i] as any).stops || [])];
                            stops.push({ color: '#ffffff', position: 1, opacity: 1 });
                            stops.forEach((s, idx) => s.position = idx / (stops.length - 1));
                            fills[i] = { ...fills[i], stops };
                            upd({ fills });
                          }}
                          className="text-[10px] text-purple-400 hover:underline pt-1 block"
                        >
                          + Add Stop
                        </button>
                      </div>
                    </div>
                  )}

                  {fill.type === 'image' && (
                    <div className="space-y-1 pt-1">
                      <input
                        value={(fill as any).url || ''}
                        onChange={e => {
                          const fills = [...el.fills];
                          fills[i] = { ...fill, url: e.target.value };
                          upd({ fills });
                        }}
                        placeholder="Image URL..."
                        className="w-full px-2 py-1 rounded text-xs outline-none"
                        style={{ background: '#f3f4f6', color: '#111827', border: '1px solid #e5e5e5' }}
                      />
                    </div>
                  )}
                </div>
              ))}
              <button
                onClick={() => upd({ fills: [...el.fills, { type: 'solid', color: '#7c3aed', opacity: 1 }] })}
                className="flex items-center gap-1.5 text-xs hover:text-purple-400 transition-colors"
                style={{ color: '#9ca3af' }}
              >
                <Plus size={11} /> Add Fill
              </button>
            </div>
          )}
        </div>

        {/* ── Stroke ────────────────────────────────────────────────────── */}
        <div>
          <SectionHeader label="STROKE" icon={Sliders} expanded={openSections.stroke} onToggle={() => toggle('stroke')} />
          {openSections.stroke && el && (
            <div className="pb-3 space-y-2">
              {el.strokes.map((stroke, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <ColorSwatch
                      color={stroke.color}
                      onChange={c => {
                        const strokes = [...el.strokes];
                        strokes[i] = { ...stroke, color: c };
                        upd({ strokes });
                      }}
                    />
                    <NumInput
                      label=""
                      value={stroke.width}
                      onChange={v => {
                        const strokes = [...el.strokes];
                        strokes[i] = { ...stroke, width: v };
                        upd({ strokes });
                      }}
                      unit="px"
                      min={0.5}
                    />
                    <button
                      onClick={() => upd({ strokes: el.strokes.filter((_, si) => si !== i) })}
                      className="p-1 rounded hover:bg-white/5"
                      style={{ color: '#6b7280' }}
                    >
                      <X size={10} />
                    </button>
                  </div>
                  <div className="flex gap-1">
                    {(['solid','dashed','dotted'] as const).map(style => (
                      <button
                        key={style}
                        onClick={() => {
                          const strokes = [...el.strokes];
                          strokes[i] = { ...stroke, style };
                          upd({ strokes });
                        }}
                        className="flex-1 py-1 rounded text-xs transition-all"
                        style={{
                          background: stroke.style === style ? 'rgba(124,58,237,0.2)' : '#1a1a1a',
                          color: stroke.style === style ? '#a78bfa' : '#9ca3af',
                          border: '1px solid',
                          borderColor: stroke.style === style ? '#7c3aed' : '#333',
                        }}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button
                onClick={() => upd({ strokes: [...el.strokes, { color: '#7c3aed', opacity: 1, width: 1, style: 'solid', position: 'center' }] })}
                className="flex items-center gap-1.5 text-xs hover:text-purple-400 transition-colors"
                style={{ color: '#9ca3af' }}
              >
                <Plus size={11} /> Add Stroke
              </button>
            </div>
          )}
        </div>

        {/* ── Typography ────────────────────────────────────────────────── */}
        {el?.type === 'text' && (
          <div>
            <SectionHeader label="TYPOGRAPHY" icon={TypeIcon} expanded={openSections.text} onToggle={() => toggle('text')} />
            {openSections.text && (
              <div className="pb-3 space-y-2">
                {(() => {
                  const text = el as TextElement;
                  const ts = text.textStyle;
                  const updTs = (tsUpd: Partial<typeof ts>) => {
                    upd({ textStyle: { ...ts, ...tsUpd } } as any);
                  };
                  return (
                    <>
                      <div>
                        <label className="text-xs mb-1 block" style={{ color: '#6b7280', fontSize: 9 }}>CONTENT</label>
                        <textarea
                          value={text.content}
                          onChange={e => upd({ content: e.target.value } as any)}
                          rows={2}
                          className="w-full px-2 py-1.5 rounded-md text-xs outline-none resize-none"
                          style={{ background: '#1a1a1a', color: '#e5e7eb', border: '1px solid #333' }}
                        />
                      </div>
                      <div>
                        <label className="text-xs mb-1 block" style={{ color: '#6b7280', fontSize: 9 }}>FONT FAMILY</label>
                        <select
                          value={ts.fontFamily}
                          onChange={e => updTs({ fontFamily: e.target.value })}
                          className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
                          style={{ background: '#1a1a1a', color: '#e5e7eb', border: '1px solid #333' }}
                        >
                          {['Inter','Outfit','Montserrat','Bebas Neue','Playfair Display','Cinzel','Space Grotesk','Syne','Satisfy'].map(f => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <NumInput label="SIZE" value={ts.fontSize} onChange={v => updTs({ fontSize: v })} unit="px" min={8} />
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: '#6b7280', fontSize: 9 }}>WEIGHT</label>
                          <select
                            value={ts.fontWeight}
                            onChange={e => updTs({ fontWeight: e.target.value as any })}
                            className="w-full px-1.5 py-1.5 rounded-md text-xs outline-none"
                            style={{ background: '#f3f4f6', color: '#111827', border: '1px solid #e5e5e5' }}
                          >
                            {['300','400','500','600','700','800','900'].map(w => (
                              <option key={w} value={w}>{w}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <NumInput label="LINE HEIGHT" value={ts.lineHeight} onChange={v => updTs({ lineHeight: v })} step={0.1} />
                        <NumInput label="LETTER SPACING" value={ts.letterSpacing} onChange={v => updTs({ letterSpacing: v })} step={0.01} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: '#6b7280', fontSize: 9 }}>ALIGNMENT</label>
                          <div className="flex gap-1">
                            {(['left','center','right'] as const).map(align => {
                              const icons = { left: AlignLeft, center: AlignCenter, right: AlignRight };
                              const Icon = icons[align];
                              return (
                                <button
                                  key={align}
                                  onClick={() => updTs({ textAlign: align })}
                                  className="flex-1 py-1 rounded flex items-center justify-center transition-all"
                                  style={{
                                    background: ts.textAlign === align ? 'rgba(124,58,237,0.2)' : '#f3f4f6',
                                    color: ts.textAlign === align ? '#7c3aed' : '#4b5563',
                                    border: `1px solid ${ts.textAlign === align ? '#7c3aed' : '#e5e5e5'}`,
                                  }}
                                >
                                  <Icon size={12} />
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <label className="text-xs mb-1 block" style={{ color: '#6b7280', fontSize: 9 }}>STYLE & CASE</label>
                          <div className="flex gap-1">
                            <button
                              title="Italic"
                              onClick={() => updTs({ fontStyle: ts.fontStyle === 'italic' ? 'normal' : 'italic' })}
                              className="flex-1 py-1 rounded text-xs font-serif italic transition-all"
                              style={{
                                background: ts.fontStyle === 'italic' ? 'rgba(124,58,237,0.2)' : '#f3f4f6',
                                color: ts.fontStyle === 'italic' ? '#7c3aed' : '#4b5563',
                                border: `1px solid ${ts.fontStyle === 'italic' ? '#7c3aed' : '#e5e5e5'}`,
                              }}
                            >
                              I
                            </button>
                            <button
                              title="Underline"
                              onClick={() => updTs({ textDecoration: ts.textDecoration === 'underline' ? 'none' : 'underline' })}
                              className="flex-1 py-1 rounded text-xs underline transition-all"
                              style={{
                                background: ts.textDecoration === 'underline' ? 'rgba(124,58,237,0.2)' : '#f3f4f6',
                                color: ts.textDecoration === 'underline' ? '#7c3aed' : '#4b5563',
                                border: `1px solid ${ts.textDecoration === 'underline' ? '#7c3aed' : '#e5e5e5'}`,
                              }}
                            >
                              U
                            </button>
                            <button
                              title="Strikethrough"
                              onClick={() => updTs({ textDecoration: ts.textDecoration === 'line-through' ? 'none' : 'line-through' })}
                              className="flex-1 py-1 rounded text-xs line-through transition-all"
                              style={{
                                background: ts.textDecoration === 'line-through' ? 'rgba(124,58,237,0.2)' : '#f3f4f6',
                                color: ts.textDecoration === 'line-through' ? '#7c3aed' : '#4b5563',
                                border: `1px solid ${ts.textDecoration === 'line-through' ? '#7c3aed' : '#e5e5e5'}`,
                              }}
                            >
                              S
                            </button>
                            <button
                              title="Uppercase"
                              onClick={() => updTs({ textTransform: ts.textTransform === 'uppercase' ? 'none' : 'uppercase' })}
                              className="flex-1 py-1 rounded text-xs font-mono uppercase transition-all"
                              style={{
                                background: ts.textTransform === 'uppercase' ? 'rgba(124,58,237,0.2)' : '#f3f4f6',
                                color: ts.textTransform === 'uppercase' ? '#7c3aed' : '#4b5563',
                                border: `1px solid ${ts.textTransform === 'uppercase' ? '#7c3aed' : '#e5e5e5'}`,
                              }}
                            >
                              TT
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs" style={{ color: '#6b7280', fontSize: 9 }}>COLOR</span>
                        <ColorSwatch color={ts.color} onChange={c => updTs({ color: c })} />
                        <input
                          value={ts.color.toUpperCase()}
                          onChange={e => updTs({ color: e.target.value })}
                          className="flex-1 px-2 py-1 rounded-md text-xs font-mono outline-none"
                          style={{ background: '#f3f4f6', color: '#111827', border: '1px solid #e5e5e5' }}
                        />
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* ── Effects ───────────────────────────────────────────────────── */}
        <div>
          <SectionHeader label="EFFECTS" icon={Sliders} expanded={openSections.effects} onToggle={() => toggle('effects')} />
          {openSections.effects && el && (
            <div className="pb-3 space-y-2">
              {el.effects.map((effect, i) => (
                <div key={i} className="p-2 rounded-lg space-y-1.5" style={{ background: '#f3f4f6', border: '1px solid #e5e5e5' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs capitalize" style={{ color: '#6b7280' }}>{effect.type}</span>
                    <button onClick={() => upd({ effects: el.effects.filter((_, ei) => ei !== i) })} className="hover:text-red-500" style={{ color: '#6b7280' }}>
                      <X size={10} />
                    </button>
                  </div>
                  {effect.type === 'drop-shadow' && (() => {
                    const ds = effect as DropShadow;
                    const updEffect = (upds: Partial<DropShadow>) => {
                      const effects = [...el.effects];
                      effects[i] = { ...ds, ...upds };
                      upd({ effects });
                    };
                    return (
                      <div className="grid grid-cols-2 gap-1.5">
                        <NumInput label="X" value={ds.offsetX} onChange={v => updEffect({ offsetX: v })} />
                        <NumInput label="Y" value={ds.offsetY} onChange={v => updEffect({ offsetY: v })} />
                        <NumInput label="BLUR" value={ds.blur} onChange={v => updEffect({ blur: v })} min={0} />
                        <NumInput label="SPREAD" value={ds.spread} onChange={v => updEffect({ spread: v })} />
                      </div>
                    );
                  })()}
                </div>
              ))}
              <button
                onClick={() => upd({ effects: [...el.effects, { type: 'drop-shadow', color: '#000000', opacity: 0.25, offsetX: 4, offsetY: 4, blur: 12, spread: 0 }] })}
                className="flex items-center gap-1.5 text-xs hover:text-purple-400 transition-colors"
                style={{ color: '#6b7280' }}
              >
                <Plus size={11} /> Add Drop Shadow
              </button>
            </div>
          )}
        </div>

        {/* ── Layer order ───────────────────────────────────────────────── */}
        {selectedIds.length === 1 && (
          <div className="pb-3">
            <SectionHeader label="ARRANGE" icon={Layers} expanded={openSections.layers} onToggle={() => toggle('layers')} />
            {openSections.layers && el && (
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                {[
                  { label: 'Bring Forward', icon: ChevronUp, action: () => bringForward(el.id) },
                  { label: 'Send Backward', icon: ChevronDown, action: () => sendBackward(el.id) },
                  { label: 'Bring to Front', icon: BringToFront, action: () => bringToFront(el.id) },
                  { label: 'Send to Back', icon: SendToBack, action: () => sendToBack(el.id) },
                ].map(({ label, icon: Icon, action }) => (
                  <button
                    key={label}
                    onClick={action}
                    className="flex items-center gap-1.5 px-2 py-2 rounded-lg text-xs transition-all hover:bg-black/5"
                    style={{ border: '1px solid #e5e5e5', color: '#4b5563' }}
                  >
                    <Icon size={11} />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
