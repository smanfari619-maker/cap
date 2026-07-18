import { useState, useEffect, useRef } from 'react';
import {
  MousePointer2, Hand, Frame, Square, Circle, Minus, ArrowRight,
  PenTool, Type, Image as ImageIcon, Star, Hexagon, Triangle,
  ChevronRight,
} from 'lucide-react';
import { useDesignStore } from './useDesignStore';

// ─── Tool definitions ─────────────────────────────────────────────────────────

type SubItem = { label: string; tool: string; key?: string; icon: any };

interface ToolDef {
  id: string;
  icon: any;
  label: string;
  shortcut?: string;
  sub?: SubItem[];
}

const TOOLS: ToolDef[] = [
  {
    id: 'select',
    icon: MousePointer2,
    label: 'Select',
    shortcut: 'V',
    sub: [
      { label: 'Select', tool: 'select', key: 'V', icon: MousePointer2 },
      { label: 'Move (Hand)', tool: 'hand', key: 'H', icon: Hand },
    ],
  },
  {
    id: 'frame',
    icon: Frame,
    label: 'Frame',
    shortcut: 'F',
  },
  {
    id: 'media',
    icon: ImageIcon,
    label: 'Media',
    sub: [
      { label: 'Upload Image', tool: 'image', key: 'I', icon: ImageIcon },
    ],
  },
  {
    id: 'shapes',
    icon: Square,
    label: 'Shapes',
    shortcut: 'R',
    sub: [
      { label: 'Rectangle', tool: 'rect', key: 'R', icon: Square },
      { label: 'Ellipse', tool: 'ellipse', key: 'O', icon: Circle },
      { label: 'Triangle', tool: 'triangle', key: '', icon: Triangle },
      { label: 'Star', tool: 'star', key: '', icon: Star },
      { label: 'Polygon', tool: 'polygon', key: '', icon: Hexagon },
      { label: 'Line', tool: 'line', key: 'L', icon: Minus },
      { label: 'Arrow', tool: 'arrow', key: '', icon: ArrowRight },
    ],
  },
  {
    id: 'pen',
    icon: PenTool,
    label: 'Pen',
    shortcut: 'P',
    sub: [
      { label: 'Pen', tool: 'pen', key: 'P', icon: PenTool },
      { label: 'Node Edit', tool: 'node-edit', key: 'A', icon: ChevronRight },
    ],
  },
  {
    id: 'text',
    icon: Type,
    label: 'Text',
    shortcut: 'T',
  },
];

// Active tool → which pill tool is "active" for highlight
function getActivePillId(tool: string): string {
  if (tool === 'select' || tool === 'hand') return 'select';
  if (tool === 'frame') return 'frame';
  if (tool === 'image') return 'media';
  if (['rect', 'ellipse', 'triangle', 'star', 'polygon', 'line', 'arrow'].includes(tool)) return 'shapes';
  if (tool === 'pen' || tool === 'node-edit') return 'pen';
  if (tool === 'text') return 'text';
  return '';
}

// Get the icon for the shapes button based on current tool
function getShapeIcon(tool: string) {
  if (tool === 'ellipse') return Circle;
  if (tool === 'star') return Star;
  if (tool === 'polygon') return Hexagon;
  if (tool === 'line') return Minus;
  if (tool === 'arrow') return ArrowRight;
  if (tool === 'triangle') return Triangle;
  return Square;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DesignFloatingToolbar() {
  const { tool, setTool } = useDesignStore();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ id: string; label: string } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activePillId = getActivePillId(tool);

  // Close menu on canvas click
  useEffect(() => {
    const close = (e: MouseEvent) => {
      const toolbar = document.getElementById('design-floating-toolbar');
      if (toolbar && !toolbar.contains(e.target as Node)) setOpenMenu(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, []);

  const handleToolClick = (def: ToolDef) => {
    if (def.sub && def.sub.length > 1) {
      setOpenMenu(prev => prev === def.id ? null : def.id);
    } else if (def.sub && def.sub.length === 1) {
      setTool(def.sub[0].tool as any);
      setOpenMenu(null);
    } else {
      setTool(def.id as any);
      setOpenMenu(null);
    }
  };

  const handleSubClick = (sub: SubItem) => {
    setTool(sub.tool as any);
    setOpenMenu(null);
  };

  return (
    <div
      id="design-floating-toolbar"
      className="absolute select-none"
      style={{
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 30,
      }}
    >
      {/* Pill container */}
      <div
        className="flex items-center gap-0.5 px-1.5 py-1.5 rounded-2xl"
        style={{
          background: '#ffffff',
          border: '1px solid #e5e5e5',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        }}
      >
        {TOOLS.map((def) => {
          const isActive = activePillId === def.id;
          const isMenuOpen = openMenu === def.id;

          // Dynamic icon for shapes tool
          const Icon = def.id === 'shapes' ? getShapeIcon(tool) : def.icon;

          return (
            <div key={def.id} className="relative">
              {/* Sub-menu popup (white card, above toolbar) */}
              {isMenuOpen && def.sub && def.sub.length > 1 && (
                <div
                  className="absolute bottom-[calc(100%+10px)] left-1/2 rounded-2xl overflow-hidden"
                  style={{
                    transform: 'translateX(-50%)',
                    background: '#ffffff',
                    border: '1px solid rgba(0,0,0,0.08)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
                    minWidth: 196,
                    zIndex: 50,
                  }}
                >
                  {def.sub.map((sub) => {
                    const SubIcon = sub.icon;
                    return (
                      <button
                        key={sub.tool}
                        onClick={() => handleSubClick(sub)}
                        className="w-full flex items-center justify-between px-4 py-2 transition-colors"
                        style={{
                          color: '#111111',
                          background: tool === sub.tool ? 'rgba(0,0,0,0.05)' : 'transparent',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
                        onMouseLeave={e => (e.currentTarget.style.background = tool === sub.tool ? 'rgba(0,0,0,0.05)' : 'transparent')}
                      >
                        <div className="flex items-center gap-3">
                          <SubIcon size={14} style={{ color: '#444' }} />
                          <span style={{ fontSize: 13, fontWeight: 400, letterSpacing: '-0.01em' }}>{sub.label}</span>
                        </div>
                        {sub.key && (
                          <span style={{ fontSize: 12, color: '#999', fontWeight: 400 }}>{sub.key}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Tooltip (for single tools with no sub-menu) */}
              {tooltip?.id === def.id && !def.sub && (
                <div
                  className="absolute bottom-[calc(100%+8px)] left-1/2 pointer-events-none whitespace-nowrap"
                  style={{
                    transform: 'translateX(-50%)',
                    background: '#333333',
                    color: '#ffffff',
                    fontSize: 12,
                    padding: '4px 8px',
                    borderRadius: 6,
                    zIndex: 50,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  }}
                >
                  {def.label}{def.shortcut ? ` ${def.shortcut}` : ''}
                </div>
              )}

              {/* Tool button */}
              <button
                onClick={() => handleToolClick(def)}
                onMouseEnter={() => {
                  if (closeTimer.current) clearTimeout(closeTimer.current);
                  if (!def.sub) setTooltip({ id: def.id, label: def.label });
                }}
                onMouseLeave={() => {
                  closeTimer.current = setTimeout(() => setTooltip(null), 200);
                }}
                className="flex items-center justify-center rounded-xl transition-all hover:bg-black/5"
                style={{
                  width: 36,
                  height: 36,
                  background: isActive ? '#f0f0f0' : 'transparent',
                  color: isActive ? '#111111' : '#777777',
                }}
              >
                <Icon size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
