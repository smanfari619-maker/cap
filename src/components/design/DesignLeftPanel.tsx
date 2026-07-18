import { useState, useCallback } from 'react';
import {
  Square, Circle, Type, Image, Star, Hexagon, Minus, ArrowRight,
  Triangle, LayoutTemplate, Sparkles, Search, ChevronRight, ChevronDown, X, Plus,
  Smile, Heart, Zap, Bookmark, Globe, Camera, Music, Coffee,
  Eye, EyeOff, Lock, Unlock, Trash2, Layers
} from 'lucide-react';
import { useDesignStore } from './useDesignStore';
import { CURATED_PALETTES, FONT_PAIRS, generateAIPalette, generateAILayout } from '../../lib/design-ai';
import type { DesignElement } from './types';

// ─── Design templates ─────────────────────────────────────────────────────────

const ARTBOARD_SIZES = [
  { name: 'Instagram Post', width: 1080, height: 1080, category: 'social' },
  { name: 'Instagram Story', width: 1080, height: 1920, category: 'social' },
  { name: 'YouTube Thumbnail', width: 1280, height: 720, category: 'social' },
  { name: 'Twitter/X Post', width: 1600, height: 900, category: 'social' },
  { name: 'Facebook Cover', width: 1640, height: 624, category: 'social' },
  { name: 'LinkedIn Post', width: 1200, height: 627, category: 'social' },
  { name: 'Poster A4', width: 794, height: 1123, category: 'print' },
  { name: 'Presentation 16:9', width: 1920, height: 1080, category: 'presentation' },
  { name: 'Business Card', width: 1050, height: 600, category: 'print' },
  { name: 'Logo Square', width: 800, height: 800, category: 'logo' },
];

const SHAPE_ELEMENTS = [
  { id: 'rect', label: 'Rectangle', icon: Square },
  { id: 'ellipse', label: 'Ellipse', icon: Circle },
  { id: 'triangle', label: 'Triangle', icon: Triangle },
  { id: 'star', label: 'Star', icon: Star },
  { id: 'polygon', label: 'Polygon', icon: Hexagon },
  { id: 'line', label: 'Line', icon: Minus },
  { id: 'arrow', label: 'Arrow', icon: ArrowRight },
];

const VECTOR_PRESETS = [
  {
    name: 'Arrow',
    icon: ArrowRight,
    nodes: [
      { x: 0, y: 30, type: 'corner' as const },
      { x: 70, y: 30, type: 'corner' as const },
      { x: 70, y: 0, type: 'corner' as const },
      { x: 100, y: 50, type: 'corner' as const },
      { x: 70, y: 100, type: 'corner' as const },
      { x: 70, y: 70, type: 'corner' as const },
      { x: 0, y: 70, type: 'corner' as const }
    ]
  },
  {
    name: 'Heart',
    icon: Heart,
    nodes: [
      { x: 50, y: 15, type: 'smooth' as const, cpIn: { x: -15, y: -15 }, cpOut: { x: 15, y: -15 } },
      { x: 95, y: 40, type: 'smooth' as const, cpIn: { x: 5, y: -20 }, cpOut: { x: -5, y: 20 } },
      { x: 50, y: 90, type: 'corner' as const },
      { x: 5, y: 40, type: 'smooth' as const, cpIn: { x: 5, y: 20 }, cpOut: { x: -5, y: -20 } }
    ]
  },
  {
    name: 'Speech Bubble',
    icon: Smile,
    nodes: [
      { x: 10, y: 10, type: 'corner' as const },
      { x: 90, y: 10, type: 'corner' as const },
      { x: 90, y: 70, type: 'corner' as const },
      { x: 45, y: 70, type: 'corner' as const },
      { x: 30, y: 90, type: 'corner' as const },
      { x: 35, y: 70, type: 'corner' as const },
      { x: 10, y: 70, type: 'corner' as const }
    ]
  },
  {
    name: 'Badge',
    icon: Zap,
    nodes: [
      { x: 50, y: 0, type: 'corner' as const },
      { x: 90, y: 20, type: 'corner' as const },
      { x: 80, y: 70, type: 'corner' as const },
      { x: 50, y: 100, type: 'corner' as const },
      { x: 20, y: 70, type: 'corner' as const },
      { x: 10, y: 20, type: 'corner' as const }
    ]
  },
  {
    name: 'Chevron',
    icon: ChevronRight,
    nodes: [
      { x: 0, y: 0, type: 'corner' as const },
      { x: 40, y: 0, type: 'corner' as const },
      { x: 90, y: 50, type: 'corner' as const },
      { x: 40, y: 100, type: 'corner' as const },
      { x: 0, y: 100, type: 'corner' as const },
      { x: 50, y: 50, type: 'corner' as const }
    ]
  }
];

const EMOJI_ELEMENTS = ['😀','🔥','⚡','🎨','🎯','💎','🚀','🌟','✨','❤️','👑','🎸'];

const TEXT_PRESETS = [
  { label: 'Big Title', size: 72, weight: '800', family: 'Outfit' },
  { label: 'Heading', size: 48, weight: '700', family: 'Outfit' },
  { label: 'Subheading', size: 32, weight: '600', family: 'Inter' },
  { label: 'Body Text', size: 18, weight: '400', family: 'Inter' },
  { label: 'Caption', size: 12, weight: '400', family: 'Inter' },
  { label: 'Bebas Bold', size: 64, weight: '400', family: 'Bebas Neue' },
  { label: 'Cinzel Elegant', size: 40, weight: '700', family: 'Cinzel' },
  { label: 'Playfair Display', size: 48, weight: '700', family: 'Playfair Display' },
];

const uid = () => Math.random().toString(36).substring(2, 10);

type PanelTab = 'templates' | 'elements' | 'text' | 'images' | 'brand' | 'layers';

// ─── Component ────────────────────────────────────────────────────────────────

export default function DesignLeftPanel({ onClose }: { onClose?: () => void }) {
  const {
    addElement, getCurrentPage, addPage, setCurrentPage, pages, snapshot,
    selectedIds, setSelectedIds, updateElement, deleteElements,
    bringForward, sendBackward, getPageElements, currentPageId, renamePage, deletePage
  } = useDesignStore();
  const [activeTab, setActiveTab] = useState<PanelTab>('elements');
  const [search, setSearch] = useState('');
  const [pagesExpanded, setPagesExpanded] = useState(false);
  const [isGeneratingPalette, setIsGeneratingPalette] = useState(false);
  const [aiPaletteTheme, setAiPaletteTheme] = useState('');
  const [generatedPalette, setGeneratedPalette] = useState<string[] | null>(null);

  const currentPage = getCurrentPage();

  const addShape = useCallback((type: string) => {
    if (!currentPage) return;
    snapshot();
    const cx = currentPage.width / 2 - 75;
    const cy = currentPage.height / 2 - 50;
    let el: DesignElement;

    const base = {
      id: uid(), visible: true, locked: false, rotation: 0, opacity: 1,
      strokes: [], effects: [], blendMode: 'normal' as const,
    };

    if (type === 'rect') {
      el = { ...base, type: 'rect', name: 'Rectangle', x: cx, y: cy, width: 150, height: 100,
        fills: [{ type: 'solid', color: '#7c3aed', opacity: 1 }], cornerRadius: 0 };
    } else if (type === 'ellipse') {
      el = { ...base, type: 'ellipse', name: 'Circle', x: cx, y: cy, width: 120, height: 120,
        fills: [{ type: 'solid', color: '#0ea5e9', opacity: 1 }] };
    } else if (type === 'star') {
      el = { ...base, type: 'star', name: 'Star', x: cx, y: cy, width: 120, height: 120,
        fills: [{ type: 'solid', color: '#f59e0b', opacity: 1 }], points: 5, innerRatio: 0.4 };
    } else if (type === 'polygon') {
      el = { ...base, type: 'polygon', name: 'Polygon', x: cx, y: cy, width: 120, height: 120,
        fills: [{ type: 'solid', color: '#10b981', opacity: 1 }], sides: 6 };
    } else if (type === 'line') {
      el = { ...base, type: 'line', name: 'Line', x: cx, y: cy + 50, width: 1, height: 1,
        x2: cx + 150, y2: cy + 50,
        fills: [],
        strokes: [{ color: '#e5e7eb', opacity: 1, width: 2, style: 'solid', position: 'center' }],
        arrowStart: false, arrowEnd: false };
    } else {
      el = { ...base, type: 'rect', name: 'Shape', x: cx, y: cy, width: 120, height: 80,
        fills: [{ type: 'solid', color: '#7c3aed', opacity: 1 }], cornerRadius: 8 };
    }
    addElement(el);
  }, [currentPage, addElement, snapshot]);

  const addText = useCallback((preset: typeof TEXT_PRESETS[0]) => {
    if (!currentPage) return;
    snapshot();
    const el: DesignElement = {
      id: uid(), type: 'text', name: preset.label,
      x: currentPage.width / 2 - 200, y: currentPage.height / 2 - 30,
      width: 400, height: preset.size * 1.5,
      rotation: 0, opacity: 1, visible: true, locked: false,
      fills: [{ type: 'solid', color: '#111827', opacity: 1 }],
      strokes: [], effects: [], blendMode: 'normal',
      content: preset.label,
      textStyle: {
        fontFamily: preset.family, fontSize: preset.size,
        fontWeight: preset.weight as any,
        fontStyle: 'normal', letterSpacing: 0, lineHeight: 1.2,
        textAlign: 'center', textDecoration: 'none', textTransform: 'none',
        color: '#111827',
      },
      autoWidth: false, autoHeight: true,
    };
    addElement(el);
  }, [currentPage, addElement, snapshot]);

  const addEmoji = useCallback((emoji: string) => {
    if (!currentPage) return;
    snapshot();
    const el: DesignElement = {
      id: uid(), type: 'text', name: 'Emoji',
      x: currentPage.width / 2 - 40, y: currentPage.height / 2 - 40,
      width: 80, height: 80,
      rotation: 0, opacity: 1, visible: true, locked: false,
      fills: [], strokes: [], effects: [], blendMode: 'normal',
      content: emoji,
      textStyle: {
        fontFamily: 'Inter', fontSize: 64, fontWeight: '400', fontStyle: 'normal',
        letterSpacing: 0, lineHeight: 1, textAlign: 'center',
        textDecoration: 'none', textTransform: 'none', color: '#000',
      },
      autoWidth: true, autoHeight: true,
    };
    addElement(el);
  }, [currentPage, addElement, snapshot]);

  const addVectorPreset = useCallback((preset: typeof VECTOR_PRESETS[0]) => {
    if (!currentPage) return;
    snapshot();
    const cx = currentPage.width / 2 - 50;
    const cy = currentPage.height / 2 - 50;
    const el: DesignElement = {
      id: uid(),
      name: preset.name,
      type: 'path',
      x: cx,
      y: cy,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      fills: [{ type: 'solid', color: '#8b5cf6', opacity: 1 }],
      strokes: [],
      effects: [],
      blendMode: 'normal',
      nodes: JSON.parse(JSON.stringify(preset.nodes)),
      closed: true
    };
    addElement(el);
  }, [currentPage, addElement, snapshot]);

  const handleAddPage = useCallback((size: typeof ARTBOARD_SIZES[0]) => {
    addPage(size.name, size.width, size.height);
  }, [addPage]);

  const generatePalette = async () => {
    if (!aiPaletteTheme.trim()) return;
    setIsGeneratingPalette(true);
    const palette = await generateAIPalette(aiPaletteTheme);
    setGeneratedPalette(palette);
    setIsGeneratingPalette(false);
  };

  const PagesSection = () => {
    const [editingPageId, setEditingPageId] = useState<string | null>(null);
    const [editingPageName, setEditingPageName] = useState('');
    return (
      <div className="space-y-0.5">
        {pages.map(p => (
          <div key={p.id} className="relative group">
            {editingPageId === p.id ? (
              <input
                autoFocus
                value={editingPageName}
                onChange={e => setEditingPageName(e.target.value)}
                onBlur={() => { renamePage(p.id, editingPageName); setEditingPageId(null); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { renamePage(p.id, editingPageName); setEditingPageId(null); }
                  if (e.key === 'Escape') setEditingPageId(null);
                }}
                className="w-full px-2 py-0.5 rounded text-xs bg-[#222] text-gray-200 outline-none border border-purple-500"
              />
            ) : (
              <div
                onClick={() => setCurrentPage(p.id)}
                onDoubleClick={() => { setEditingPageId(p.id); setEditingPageName(p.name); }}
                className="flex items-center justify-between px-2 py-1 rounded-md text-xs cursor-pointer select-none"
                style={{
                  background: currentPageId === p.id ? 'rgba(124,58,237,0.15)' : 'transparent',
                  color: currentPageId === p.id ? '#a78bfa' : '#9ca3af',
                }}
              >
                <span className="truncate">{p.name}</span>
                {pages.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deletePage(p.id); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-red-400 hover:bg-red-500/10 transition-opacity"
                    title="Delete Page"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const LayersSection = () => {
    return (
      <div className="space-y-1 flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-1 py-1 select-none">
          <span className="text-[10px] font-bold tracking-wider text-gray-500 uppercase">Layers</span>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 pr-1 min-h-[120px] scrollbar-thin">
          {currentPage ? (
            (() => {
              const pageEls = [...getPageElements()].reverse();
              if (!pageEls.length) {
                return <p className="text-[10px] text-gray-500 text-center py-4">No layers on this page.</p>;
              }
              return pageEls.map(el => {
                const isSelected = selectedIds.includes(el.id);
                
                let TypeIcon = Square;
                if (el.type === 'ellipse') TypeIcon = Circle;
                else if (el.type === 'text') TypeIcon = Type;
                else if (el.type === 'image') TypeIcon = Image;
                else if (el.type === 'line') TypeIcon = Minus;
                else if (el.type === 'star') TypeIcon = Star;
                else if (el.type === 'polygon') TypeIcon = Hexagon;

                return (
                  <div
                    key={el.id}
                    onClick={(e) => {
                      if (e.shiftKey) {
                        setSelectedIds(selectedIds.includes(el.id)
                          ? selectedIds.filter(id => id !== el.id)
                          : [...selectedIds, el.id]);
                      } else {
                        setSelectedIds([el.id]);
                      }
                    }}
                    className="group flex items-center justify-between px-2 py-1 rounded-md text-xs font-medium cursor-pointer transition-all border"
                    style={{
                      background: isSelected ? 'rgba(124,58,237,0.12)' : 'transparent',
                      borderColor: isSelected ? 'rgba(124,58,237,0.3)' : 'transparent',
                      color: isSelected ? '#a78bfa' : '#9ca3af',
                    }}
                  >
                    <div className="flex items-center gap-1.5 truncate min-w-0">
                      <TypeIcon size={11} className="shrink-0 text-gray-500" />
                      <span className="truncate text-xs">{el.name}</span>
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        title="Bring Forward"
                        onClick={(e) => { e.stopPropagation(); bringForward(el.id); }}
                        className="p-0.5 rounded text-[10px] hover:bg-white/5 hover:text-white"
                      >
                        ↑
                      </button>
                      <button
                        title="Send Backward"
                        onClick={(e) => { e.stopPropagation(); sendBackward(el.id); }}
                        className="p-0.5 rounded text-[10px] hover:bg-white/5 hover:text-white"
                      >
                        ↓
                      </button>
                      <button
                        title={el.visible ? 'Hide layer' : 'Show layer'}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateElement(el.id, { visible: !el.visible });
                        }}
                        className="p-0.5 rounded hover:bg-white/5"
                        style={{ color: el.visible ? '#9ca3af' : '#4b5563' }}
                      >
                        {el.visible ? <Eye size={10} /> : <EyeOff size={10} />}
                      </button>
                      <button
                        title={el.locked ? 'Unlock layer' : 'Lock layer'}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateElement(el.id, { locked: !el.locked });
                        }}
                        className="p-0.5 rounded hover:bg-white/5"
                        style={{ color: el.locked ? '#a78bfa' : '#4b5563' }}
                      >
                        {el.locked ? <Lock size={10} /> : <Unlock size={10} />}
                      </button>
                      <button
                        title="Delete layer"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteElements([el.id]);
                        }}
                        className="p-0.5 rounded hover:bg-red-500/20 text-red-400"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                );
              });
            })()
          ) : (
            <p className="text-xs text-gray-500 text-center py-4">Select a page first.</p>
          )}
        </div>
      </div>
    );
  };

  const TABS: { id: PanelTab; label: string; icon: any }[] = [
    { id: 'elements', label: 'Elements', icon: Square },
    { id: 'text', label: 'Text', icon: Type },
    { id: 'images', label: 'Media', icon: Image },
    { id: 'brand', label: 'Brand', icon: Sparkles },
    { id: 'layers', label: 'Layers', icon: Layers },
  ];

  return (
    <div
      className="flex h-full overflow-hidden"
      style={{
        background: '#ffffff',
        borderRight: '1px solid #e5e5e5',
        boxShadow: '8px 0 40px rgba(0,0,0,0.12)',
        borderRadius: '0 12px 12px 0',
        width: 288,
      }}
    >
      {/* Tab nav - Vertical Rail */}
      <div
        className="flex flex-col items-center py-3 border-r shrink-0 select-none"
        style={{ width: 68, borderColor: '#e5e5e5', background: '#fafafa' }}
      >
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex flex-col items-center justify-center w-14 h-14 rounded-xl mb-2 transition-all hover:bg-black/5 group relative text-[10px] font-medium"
              style={{
                color: isActive ? '#8b5cf6' : '#6b7280',
              }}
              title={tab.label}
            >
              {isActive && (
                <div
                  className="absolute left-0 w-1 h-8 rounded-r bg-purple-500"
                  style={{ top: '50%', transform: 'translateY(-50%)' }}
                />
              )}
              <Icon size={20} className={`mb-1 transition-transform group-hover:scale-105 ${isActive ? 'text-purple-400' : ''}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main panel contents wrapper */}
      {activeTab === 'layers' ? (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#ffffff] p-3 space-y-3 overflow-hidden">
          {/* Pages Collapsible Header */}
          <div className="space-y-1 select-none shrink-0">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setPagesExpanded(!pagesExpanded)}
                className="flex items-center gap-1.5 py-1 text-[10px] font-bold text-gray-400 uppercase hover:text-gray-700 transition-colors"
              >
                {pagesExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                <span>Pages</span>
                <span className="text-[9px] text-gray-500 font-normal normal-case ml-1">
                  ({currentPage?.name})
                </span>
              </button>
              <button
                onClick={() => addPage()}
                className="p-1 rounded hover:bg-black/5 text-gray-500 hover:text-black"
                title="Add Page"
              >
                <Plus size={12} />
              </button>
            </div>
            {pagesExpanded && (
              <div className="pl-3 pr-1 py-1 max-h-[140px] overflow-y-auto border-l border-gray-200 ml-2 scrollbar-thin">
                <PagesSection />
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 shrink-0" />

          {/* Layers List */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            <LayersSection />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#ffffff]">
          {/* Search */}
          {(activeTab === 'elements') && (
            <div className="px-3 py-2 shrink-0">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: '#f3f4f6' }}>
                <Search size={12} style={{ color: '#6b7280' }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="flex-1 bg-transparent text-xs outline-none"
                  style={{ color: '#111827' }}
                />
              </div>
            </div>
          )}

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4 scrollbar-thin">

            {/* ── Elements ───────────────────────────────────────────────────── */}
            {activeTab === 'elements' && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: '#9ca3af' }}>SHAPES</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {SHAPE_ELEMENTS.map(s => (
                      <button
                        key={s.id}
                        onClick={() => addShape(s.id)}
                        className="flex flex-col items-center gap-1 p-2 rounded-lg transition-all hover:bg-white/5"
                        style={{ border: '1px solid #2a2a2a' }}
                        title={s.label}
                      >
                        <s.icon size={18} style={{ color: '#a78bfa' }} />
                        <span className="text-xs" style={{ color: '#9ca3af', fontSize: 9 }}>{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: '#9ca3af' }}>EMOJIS</p>
                  <div className="grid grid-cols-6 gap-1">
                    {EMOJI_ELEMENTS.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => addEmoji(emoji)}
                        className="flex items-center justify-center w-9 h-9 rounded-lg text-lg transition-all hover:bg-white/10"
                        style={{ border: '1px solid #2a2a2a' }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: '#9ca3af' }}>VECTOR PRESETS</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {VECTOR_PRESETS.map((preset, idx) => (
                      <button
                        key={idx}
                        onClick={() => addVectorPreset(preset)}
                        className="flex flex-col items-center gap-1 p-2 rounded-lg transition-all hover:bg-white/5"
                        style={{ border: '1px solid #2a2a2a' }}
                        title={preset.name}
                      >
                        <preset.icon size={18} style={{ color: '#8b5cf6' }} />
                        <span className="text-[10px]" style={{ color: '#9ca3af', fontSize: 9 }}>{preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: '#9ca3af' }}>GRADIENTS</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      ['#7c3aed','#a855f7'],['#0ea5e9','#06b6d4'],
                      ['#f97316','#fbbf24'],['#ec4899','#f43f5e'],
                      ['#10b981','#34d399'],['#6366f1','#818cf8'],
                    ].map(([c1, c2], i) => (
                      <button
                        key={i}
                        onClick={() => {
                          if (!currentPage) return;
                          snapshot();
                          const el: DesignElement = {
                            id: uid(), type: 'rect', name: 'Gradient Rect',
                            x: currentPage.width / 2 - 100, y: currentPage.height / 2 - 60,
                            width: 200, height: 120, cornerRadius: 12,
                            rotation: 0, opacity: 1, visible: true, locked: false,
                            fills: [{ type: 'linear', stops: [
                              { color: c1, position: 0, opacity: 1 },
                              { color: c2, position: 1, opacity: 1 },
                            ], angle: 135 }],
                            strokes: [], effects: [], blendMode: 'normal',
                          };
                          addElement(el);
                        }}
                        className="h-10 rounded-lg transition-all hover:scale-105"
                        style={{ background: `linear-gradient(135deg, ${c1}, ${c2})`, border: 'none' }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Text ───────────────────────────────────────────────────────── */}
            {activeTab === 'text' && (
              <div className="space-y-3">
                <p className="text-xs font-semibold" style={{ color: '#9ca3af' }}>TEXT STYLES</p>
                {TEXT_PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => addText(p)}
                    className="w-full text-left px-3 py-2.5 rounded-lg transition-all hover:bg-white/5"
                    style={{ border: '1px solid #2a2a2a' }}
                  >
                    <span
                      style={{
                        fontFamily: p.family,
                        fontSize: Math.min(p.size / 2.5, 24),
                        fontWeight: p.weight,
                        color: '#e5e7eb',
                        lineHeight: 1.2,
                        display: 'block',
                      }}
                    >
                      {p.label}
                    </span>
                    <span className="text-xs" style={{ color: '#6b7280' }}>
                      {p.family} · {p.size}px
                    </span>
                  </button>
                ))}

                <div>
                  <p className="text-xs font-semibold mt-4 mb-2" style={{ color: '#9ca3af' }}>FONT PAIRS</p>
                  {FONT_PAIRS.map(pair => (
                    <button
                      key={pair.name}
                      className="w-full text-left px-3 py-2.5 rounded-lg mb-1.5 transition-all hover:bg-white/5"
                      style={{ border: '1px solid #2a2a2a' }}
                      onClick={() => {
                        if (!currentPage) return;
                        snapshot();
                        const cx = currentPage.width / 2;
                        const cy = currentPage.height / 2;
                        [{ text: 'Your Headline', font: pair.heading, size: 56, weight: '800', dy: -40 },
                         { text: 'Your body text goes here', font: pair.body, size: 20, weight: '400', dy: 40 }
                        ].forEach(({ text, font, size, weight, dy }) => {
                          const el: DesignElement = {
                            id: uid(), type: 'text', name: text,
                            x: cx - 300, y: cy + dy - size,
                            width: 600, height: size * 1.5,
                            rotation: 0, opacity: 1, visible: true, locked: false,
                            fills: [{ type: 'solid', color: '#111827', opacity: 1 }],
                            strokes: [], effects: [], blendMode: 'normal',
                            content: text,
                            textStyle: {
                              fontFamily: font, fontSize: size, fontWeight: weight as any,
                              fontStyle: 'normal', letterSpacing: 0, lineHeight: 1.2,
                              textAlign: 'center', textDecoration: 'none', textTransform: 'none',
                              color: '#111827',
                            },
                            autoWidth: false, autoHeight: true,
                          };
                          addElement(el);
                        });
                      }}
                    >
                      <span style={{ fontFamily: pair.heading, fontSize: 16, fontWeight: 700, color: '#e5e7eb' }}>
                        {pair.heading}
                      </span>
                      <span style={{ color: '#6b7280' }}> + </span>
                      <span style={{ fontFamily: pair.body, fontSize: 14, color: '#9ca3af' }}>
                        {pair.body}
                      </span>
                      <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{pair.name}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Images ─────────────────────────────────────────────────────── */}
            {activeTab === 'images' && (
              <div className="space-y-3">
                <p className="text-xs font-semibold" style={{ color: '#9ca3af' }}>UPLOAD IMAGE</p>
                <label className="flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer hover:bg-white/5 transition-all"
                  style={{ border: '2px dashed #333' }}>
                  <Image size={24} style={{ color: '#7c3aed' }} />
                  <span className="text-xs text-center" style={{ color: '#9ca3af' }}>
                    Click to upload or drag & drop
                  </span>
                  <input type="file" accept="image/*" className="hidden" onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file || !currentPage) return;
                    const reader = new FileReader();
                    reader.onload = ev => {
                      const url = ev.target?.result as string;
                      const img = new window.Image();
                      img.onload = () => {
                        snapshot();
                        const el: DesignElement = {
                          id: uid(), type: 'image', name: file.name,
                          x: currentPage.width / 2 - 150, y: currentPage.height / 2 - 100,
                          width: 300, height: 200,
                          rotation: 0, opacity: 1, visible: true, locked: false,
                          fills: [], strokes: [], effects: [], blendMode: 'normal',
                          url, naturalWidth: img.width, naturalHeight: img.height,
                          cropX: 0, cropY: 0, cropW: 1, cropH: 1,
                        };
                        addElement(el);
                      };
                      img.src = url;
                    };
                    reader.readAsDataURL(file);
                  }} />
                </label>

                <p className="text-xs font-semibold mt-4" style={{ color: '#9ca3af' }}>PLACEHOLDER IMAGES</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: 'Abstract', bg: 'linear-gradient(135deg,#667eea,#764ba2)', w: 400, h: 300 },
                    { label: 'Nature', bg: 'linear-gradient(135deg,#11998e,#38ef7d)', w: 400, h: 300 },
                    { label: 'Tech', bg: 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)', w: 400, h: 300 },
                    { label: 'Sunset', bg: 'linear-gradient(135deg,#f093fb,#f5576c)', w: 400, h: 300 },
                  ].map(ph => (
                    <button
                      key={ph.label}
                      onClick={() => {
                        if (!currentPage) return;
                        // Create gradient rect as placeholder
                        snapshot();
                        const el: DesignElement = {
                          id: uid(), type: 'rect', name: ph.label,
                          x: currentPage.width / 2 - 150, y: currentPage.height / 2 - 100,
                          width: 300, height: 200, cornerRadius: 8,
                          rotation: 0, opacity: 1, visible: true, locked: false,
                          fills: [{ type: 'linear', stops: [
                            { color: '#667eea', position: 0, opacity: 1 },
                            { color: '#764ba2', position: 1, opacity: 1 },
                          ], angle: 135 }],
                          strokes: [], effects: [], blendMode: 'normal',
                        };
                        addElement(el);
                      }}
                      className="h-16 rounded-lg flex items-end p-2 text-xs font-medium transition-all hover:opacity-90"
                      style={{ background: ph.bg, color: '#fff' }}
                    >
                      {ph.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Brand Kit ──────────────────────────────────────────────────── */}
            {activeTab === 'brand' && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: '#6b7280' }}>COLOR PALETTES</p>
                  {CURATED_PALETTES.map(palette => (
                    <div key={palette.name} className="mb-2">
                      <p className="text-xs mb-1" style={{ color: '#6b7280' }}>{palette.name}</p>
                      <div className="flex gap-1">
                        {palette.colors.map(color => (
                          <button
                            key={color}
                            className="w-8 h-8 rounded-md border transition-all hover:scale-110"
                            style={{ background: color, borderColor: '#e5e5e5' }}
                            title={color}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: '#6b7280' }}>AI PALETTE GENERATOR</p>
                  <div className="flex gap-2">
                    <input
                      value={aiPaletteTheme}
                      onChange={e => setAiPaletteTheme(e.target.value)}
                      placeholder="e.g. sunset beach..."
                      className="flex-1 px-2 py-1.5 rounded-lg text-xs outline-none"
                      style={{ background: '#f3f4f6', color: '#111827', border: '1px solid #e5e5e5' }}
                      onKeyDown={e => e.key === 'Enter' && generatePalette()}
                    />
                    <button
                      onClick={generatePalette}
                      disabled={isGeneratingPalette}
                      className="px-2 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff' }}
                    >
                      <Sparkles size={12} />
                    </button>
                  </div>
                  {generatedPalette && (
                    <div className="flex gap-1 mt-2">
                      {generatedPalette.map(color => (
                        <div
                          key={color}
                          className="flex-1 h-8 rounded-md"
                          style={{ background: color }}
                          title={color}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
