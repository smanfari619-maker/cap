import { useState } from 'react';
import { Download, Sparkles, ChevronDown, ArrowLeft } from 'lucide-react';
import { useDesignStore } from './useDesignStore';

interface Props {
  onExport: () => void;
  onInsertToTimeline: () => void;
  onAIGenerate: () => void;
  onClose: () => void;
}

export default function DesignTopBar({ onExport, onInsertToTimeline, onAIGenerate, onClose }: Props) {
  const { pages, currentPageId, addPage, setCurrentPage, renamePage, getCurrentPage } = useDesignStore();
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editingPageName, setEditingPageName] = useState('');
  const [showPageMenu, setShowPageMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const currentPage = getCurrentPage();

  return (
    <div
      className="flex items-center justify-between px-3 border-b select-none shrink-0"
      style={{
        height: 36,
        background: '#ffffff',
        borderColor: '#e5e5e5',
      }}
    >
      {/* ── Left: Title + page indicator ─────────────────────────────────── */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Back button */}
        <button
          onClick={onClose}
          className="flex items-center justify-center w-6 h-6 rounded hover:bg-black/5 transition-colors"
          style={{ color: '#555' }}
          title="Back to Dashboard"
        >
          <ArrowLeft size={14} />
        </button>
        
        <div className="w-px h-4 mx-1" style={{ background: '#e5e5e5' }} />

        {/* Page title / picker */}
        <div className="relative">
          <button
            onClick={() => setShowPageMenu(v => !v)}
            className="flex items-center gap-1 text-xs font-medium transition-colors hover:text-black"
            style={{ color: '#333333', maxWidth: 200 }}
          >
            <span className="truncate">{currentPage?.name ?? 'Untitled'}</span>
            <ChevronDown size={10} style={{ color: '#888888', flexShrink: 0 }} />
          </button>

          {showPageMenu && (
            <div
              className="absolute top-7 left-0 rounded-xl border py-1.5 shadow-2xl"
              style={{ background: '#ffffff', borderColor: '#e5e5e5', minWidth: 180, zIndex: 100 }}
              onMouseLeave={() => setShowPageMenu(false)}
            >
              {pages.map(p => (
                <div key={p.id} className="flex items-center group">
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
                      className="mx-3 my-0.5 px-2 py-0.5 rounded text-xs outline-none w-full"
                      style={{ background: '#f5f5f5', color: '#111111' }}
                    />
                  ) : (
                    <button
                      className="flex-1 text-left px-4 py-1.5 text-xs transition-colors hover:bg-black/5"
                      style={{ color: currentPageId === p.id ? '#8b5cf6' : '#333333' }}
                      onClick={() => { setCurrentPage(p.id); setShowPageMenu(false); }}
                      onDoubleClick={() => { setEditingPageId(p.id); setEditingPageName(p.name); }}
                    >
                      {p.name}
                    </button>
                  )}
                </div>
              ))}
              <div className="border-t my-1" style={{ borderColor: '#e5e5e5' }} />
              <button
                onClick={() => { addPage(); setShowPageMenu(false); }}
                className="w-full text-left px-4 py-1.5 text-xs transition-colors hover:bg-black/5"
                style={{ color: '#777777' }}
              >
                + Add page
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Actions ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onAIGenerate}
          className="flex items-center gap-1.5 px-2.5 h-[26px] rounded-lg text-xs font-semibold transition-all hover:opacity-90"
          style={{
            background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
            color: '#fff',
          }}
        >
          <Sparkles size={11} />
          AI
        </button>

        {/* Export dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(v => !v)}
            className="flex items-center gap-1 px-2.5 h-[26px] rounded-lg text-xs font-medium border transition-all hover:bg-black/5"
            style={{ borderColor: '#e5e5e5', color: '#333333' }}
          >
            <Download size={11} />
            Export
            <ChevronDown size={9} style={{ color: '#888888' }} />
          </button>
          {showExportMenu && (
            <div
              className="absolute top-8 right-0 rounded-xl border py-1.5 shadow-2xl"
              style={{ background: '#ffffff', borderColor: '#e5e5e5', minWidth: 160, zIndex: 100 }}
            >
              <button
                onClick={() => { onExport(); setShowExportMenu(false); }}
                className="w-full text-left px-4 py-1.5 text-xs hover:bg-black/5"
                style={{ color: '#333333' }}
              >
                Export PNG
              </button>
              <button
                onClick={() => { onInsertToTimeline(); setShowExportMenu(false); }}
                className="w-full text-left px-4 py-1.5 text-xs hover:bg-black/5"
                style={{ color: '#333333' }}
              >
                Insert to Video
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
