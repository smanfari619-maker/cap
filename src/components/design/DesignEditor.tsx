import { useEffect, useRef, useState, useCallback } from 'react';
import { useDesignStore } from './useDesignStore';
import DesignTopBar from './DesignTopBar';
import DesignLeftPanel from './DesignLeftPanel';
import DesignCanvas from './DesignCanvas';
import DesignRightPanel from './DesignRightPanel';
import DesignFloatingToolbar from './DesignFloatingToolbar';
import DesignFrameToolbar from './DesignFrameToolbar';
import DesignShapeToolbar from './DesignShapeToolbar';
import AIDesignModal from './AIDesignModal';
import type { DesignProject } from './types';
import { drawElementOnContext } from './utils';

interface Props {
  project: DesignProject;
  onClose: () => void;
  onInsertToTimeline?: (dataUrl: string, name: string) => void;
}

export default function DesignEditor({ project, onClose, onInsertToTimeline }: Props) {
  const { loadDesignProject, getCurrentPage, zoom, fitToScreen, selectedIds, undo, redo, past, future, showGrid, setShowGrid } = useDesignStore();
  const [showAIModal, setShowAIModal] = useState(false);
  const [leftOpen, setLeftOpen] = useState(false);

  useEffect(() => {
    loadDesignProject(project);
    // Wait two frames: first for React to commit, second for layout to settle
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = document.getElementById('design-canvas-container');
        if (container) {
          fitToScreen(container.clientWidth, container.clientHeight);
        }
      });
    });
  }, [project, loadDesignProject, fitToScreen]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '\\' && !e.metaKey && !e.ctrlKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') setLeftOpen(o => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Export ────────────────────────────────────────────────────────────────

  const exportCanvas = useCallback(async () => {
    const page = getCurrentPage();
    if (!page) return;

    const { getPageElements, elements } = useDesignStore.getState();
    const pageEls = getPageElements();

    // Preload image elements to render them correctly
    const tempImageCache = new Map<string, HTMLImageElement>();
    const imageElements = pageEls.filter(el => el.type === 'image') as any[];
    await Promise.all(imageElements.map(img => {
      return new Promise<void>(resolve => {
        const image = new window.Image();
        image.onload = () => {
          tempImageCache.set(img.url, image);
          resolve();
        };
        image.onerror = () => resolve();
        image.src = img.url;
      });
    }));

    // Render to off-screen canvas at 2x for quality
    const scale = 2;
    const offCanvas = document.createElement('canvas');
    offCanvas.width = page.width * scale;
    offCanvas.height = page.height * scale;
    const ctx = offCanvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(scale, scale);

    // Background
    ctx.fillStyle = page.background;
    ctx.fillRect(0, 0, page.width, page.height);

    // Draw all page elements
    const toCanvasIdentity = (wx: number, wy: number) => ({ x: wx, y: wy });
    for (const el of pageEls) {
      drawElementOnContext(ctx, el, 1, toCanvasIdentity, tempImageCache, elements);
    }

    // Download
    const dataUrl = offCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${project.title || 'design'}.png`;
    a.click();
  }, [getCurrentPage, project.title]);

  // ── Insert to video timeline ───────────────────────────────────────────────

  const insertToTimeline = useCallback(async () => {
    const page = getCurrentPage();
    if (!page) return;

    const { getPageElements, elements } = useDesignStore.getState();
    const pageEls = getPageElements();

    // Preload image elements
    const tempImageCache = new Map<string, HTMLImageElement>();
    const imageElements = pageEls.filter(el => el.type === 'image') as any[];
    await Promise.all(imageElements.map(img => {
      return new Promise<void>(resolve => {
        const image = new window.Image();
        image.onload = () => {
          tempImageCache.set(img.url, image);
          resolve();
        };
        image.onerror = () => resolve();
        image.src = img.url;
      });
    }));

    // Render page to offscreen canvas at native resolution
    const scale = 2;
    const off = document.createElement('canvas');
    off.width = page.width * scale;
    off.height = page.height * scale;
    const ctx = off.getContext('2d');
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.fillStyle = page.background;
    ctx.fillRect(0, 0, page.width, page.height);

    // Draw page elements
    const toCanvasIdentity = (wx: number, wy: number) => ({ x: wx, y: wy });
    for (const el of pageEls) {
      drawElementOnContext(ctx, el, 1, toCanvasIdentity, tempImageCache, elements);
    }

    const dataUrl = off.toDataURL('image/png');
    if (onInsertToTimeline) {
      onInsertToTimeline(dataUrl, project.title || 'Design Overlay');
    }
  }, [getCurrentPage, onInsertToTimeline, project.title]);

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#f5f5f5' }}>
      {/* Top Bar — 36px */}
      <DesignTopBar
        onExport={exportCanvas}
        onInsertToTimeline={insertToTimeline}
        onAIGenerate={() => setShowAIModal(true)}
        onClose={onClose}
      />

      {/* Canvas fills 100% of remaining space */}
      <div
        id="design-canvas-container"
        className="flex-1 relative overflow-hidden"
      >
        <DesignCanvas />

        {/* Floating toolbar — bottom-center */}
        <DesignFloatingToolbar />

        {/* Contextual Frame toolbar — top-center */}
        <DesignFrameToolbar />

        {/* Contextual Shape toolbar — top-center */}
        <DesignShapeToolbar />

        {/* Bottom-left controls: undo/redo + grid + zoom */}
        <div
          className="absolute bottom-4 left-4 flex items-center gap-1 select-none"
          style={{ zIndex: 20 }}
        >
          <button
            onClick={undo}
            disabled={!past.length}
            title="Undo (⌘Z)"
            className="flex items-center justify-center w-7 h-7 rounded-md disabled:opacity-25 transition-colors hover:text-black"
            style={{ color: '#555555' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
            </svg>
          </button>
          <button
            onClick={redo}
            disabled={!future.length}
            title="Redo (⌘⇧Z)"
            className="flex items-center justify-center w-7 h-7 rounded-md disabled:opacity-25 transition-colors hover:text-black"
            style={{ color: '#555555' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>
            </svg>
          </button>
          <div className="w-px h-4 mx-0.5" style={{ background: '#d1d5db' }} />
          <button
            onClick={() => setShowGrid(!showGrid)}
            title="Toggle grid (G)"
            className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:text-black"
            style={{ color: showGrid ? '#8b5cf6' : '#555555' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
            </svg>
          </button>
          <div className="w-px h-4 mx-0.5" style={{ background: '#d1d5db' }} />
          <button
            onClick={() => {
              const el = document.getElementById('design-canvas-container');
              if (el) fitToScreen(el.clientWidth, el.clientHeight);
            }}
            title="Click to fit to screen (⇧1)"
            className="px-2 h-7 rounded-md text-xs font-medium transition-colors hover:text-black"
            style={{ color: '#555555', fontVariantNumeric: 'tabular-nums', minWidth: 44, textAlign: 'center' }}
          >
            {Math.round(zoom * 100)}%
          </button>
        </div>

        {/* Left panel overlay — slides in from left */}
        <div
          className="absolute top-0 left-0 h-full"
          style={{
            zIndex: 40,
            transform: leftOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 220ms cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: leftOpen ? 'all' : 'none',
          }}
        >
          <DesignLeftPanel onClose={() => setLeftOpen(false)} />
        </div>

        {/* Left panel hover trigger strip */}
        {!leftOpen && (
          <div
            className="absolute top-0 left-0 h-full w-2"
            style={{ zIndex: 39, cursor: 'default' }}
            onMouseEnter={() => setLeftOpen(true)}
          />
        )}

        {/* Right panel overlay — slides in from right when element selected */}
        <div
          className="absolute top-0 right-0 h-full"
          style={{
            zIndex: 40,
            transform: selectedIds.length > 0 ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: selectedIds.length > 0 ? 'all' : 'none',
          }}
        >
          <DesignRightPanel />
        </div>
      </div>

      {/* AI Modal */}
      {showAIModal && <AIDesignModal onClose={() => setShowAIModal(false)} />}
    </div>
  );
}
