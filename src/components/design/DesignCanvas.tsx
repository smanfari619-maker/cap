import { useEffect, useRef, useCallback, useState } from 'react';
import { useDesignStore } from './useDesignStore';
import type {
  DesignElement, RectElement, TextElement,
  ImageElement, LineElement, StarElement,
  PathElement, PathNode,
  BoundingBox, SnapGuide
} from './types';
import { uid, drawElementOnContext } from './utils';

// ─── Constants ───────────────────────────────────────────────────────────────

const HANDLE_SIZE = 8;
const ROTATE_OFFSET = 24;
const SELECTION_COLOR = '#7C3AED';
const GUIDE_COLOR = '#f059da';

// ─── Canvas Renderer ─────────────────────────────────────────────────────────

export default function DesignCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const isDragging = useRef(false);
  const isPanning = useRef(false);
  const isResizing = useRef<string | null>(null); // 'nw'|'ne'|'sw'|'se'|'n'|'s'|'e'|'w'|'rotate'
  const dragStart = useRef({ x: 0, y: 0 });
  const elemStartRect = useRef<Record<string, { x: number; y: number; w: number; h: number }>>({});
  const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; visible: boolean; targetId: string | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [quickActionSearch, setQuickActionSearch] = useState('');
  const [hoveredHandle, setHoveredHandle] = useState<string | null>(null);
  const [isArtboardHovered, setIsArtboardHovered] = useState(false);

  // Path / Pen / Parameter Editing drag tracking
  const draggingNodeIndex = useRef<number | null>(null);
  const draggingHandleType = useRef<'node' | 'cpIn' | 'cpOut' | null>(null);
  const draggingParamHandle = useRef<'star-inner' | 'rect-tl' | 'rect-tr' | 'rect-br' | 'rect-bl' | null>(null);
  const nodeStartPos = useRef<{ x: number; y: number; cpIn?: { x: number; y: number }; cpOut?: { x: number; y: number } }[]>([]);

  const triggerToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast(prev => prev === msg ? null : prev);
    }, 2500);
  }, []);
  const isMarquee = useRef(false);
  const marqueeStart = useRef({ x: 0, y: 0 });
  const marqueeEnd = useRef({ x: 0, y: 0 });
  const isCreating = useRef(false);
  const creationStart = useRef({ x: 0, y: 0 });
  const creationId = useRef<string | null>(null);

  const store = useDesignStore();
  const {
    tool, zoom, panX, panY, showGrid, gridSize,
    snapToGrid,
    selectedIds, hoveredId, elements,
    getCurrentPage, getPageElements, getSelectionBounds,
    setSelectedIds, setHoveredId,
    updateElement, addElement, setTool,
    setZoom, setPan, snapshot,
    copy, cut, paste, duplicateElements, deleteElements,
    bringForward, sendBackward, groupElements, ungroupElements,
    activePathId, editingPathId, selectedNodeIndices,
    setSelectedNodeIndices,
    addPathNode, updatePathNode, closeActivePath,
    artboardSelected, setArtboardSelected, updatePageDimensions
  } = store;

  const page = getCurrentPage();

  // ── DPR-aware canvas resize ────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ── Preload images ─────────────────────────────────────────────────────────

  const loadImage = useCallback((url: string): Promise<HTMLImageElement> => {
    if (imageCache.current.has(url)) return Promise.resolve(imageCache.current.get(url)!);
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => { imageCache.current.set(url, img); resolve(img); };
      img.src = url;
    });
  }, []);

  // ── Coordinate transforms ─────────────────────────────────────────────────

  const toCanvas = useCallback((wx: number, wy: number) => ({
    x: wx * zoom + panX,
    y: wy * zoom + panY,
  }), [zoom, panX, panY]);

  const toWorld = useCallback((cx: number, cy: number) => ({
    x: (cx - panX) / zoom,
    y: (cy - panY) / zoom,
  }), [zoom, panX, panY]);

  // ── Element hit test ──────────────────────────────────────────────────────

  const hitTestElement = useCallback((el: DesignElement, wx: number, wy: number, ignoreLocked = true): boolean => {
    if (!el.visible) return false;
    if (ignoreLocked && el.locked) return false;
    if (el.type === 'line') {
      const line = el as LineElement;
      // Simple AABB for lines
      const minX = Math.min(line.x, line.x2), maxX = Math.max(line.x, line.x2);
      const minY = Math.min(line.y, line.y2), maxY = Math.max(line.y, line.y2);
      return wx >= minX - 5 && wx <= maxX + 5 && wy >= minY - 5 && wy <= maxY + 5;
    }
    return wx >= el.x && wx <= el.x + el.width && wy >= el.y && wy <= el.y + el.height;
  }, []);

  // ── Selection handle hit test ─────────────────────────────────────────────

  const getHandleAt = useCallback((bounds: BoundingBox, cx: number, cy: number): string | null => {
    const { x: bx, y: by, width: bw, height: bh } = bounds;
    const { x: sx, y: sy } = toCanvas(bx, by);
    const sw = bw * zoom, sh = bh * zoom;
    const hs = HANDLE_SIZE;
    const handles = {
      nw: [sx - hs / 2, sy - hs / 2],
      n:  [sx + sw / 2 - hs / 2, sy - hs / 2],
      ne: [sx + sw - hs / 2, sy - hs / 2],
      w:  [sx - hs / 2, sy + sh / 2 - hs / 2],
      e:  [sx + sw - hs / 2, sy + sh / 2 - hs / 2],
      sw: [sx - hs / 2, sy + sh - hs / 2],
      s:  [sx + sw / 2 - hs / 2, sy + sh - hs / 2],
      se: [sx + sw - hs / 2, sy + sh - hs / 2],
      rotate: [sx + sw / 2 - hs / 2, sy - ROTATE_OFFSET - hs / 2],
    };
    for (const [name, [hx, hy]] of Object.entries(handles)) {
      if (cx >= hx && cx <= hx + hs && cy >= hy && cy <= hy + hs) return name;
    }
    return null;
  }, [toCanvas, zoom]);

  // ── Draw single element ────────────────────────────────────────────────────

  const drawElement = useCallback((ctx: CanvasRenderingContext2D, el: DesignElement) => {
    drawElementOnContext(ctx, el, zoom, toCanvas, imageCache.current, elements);
    if (el.type === 'image') {
      const img = el as ImageElement;
      if (!imageCache.current.has(img.url)) {
        loadImage(img.url);
      }
    }
  }, [toCanvas, zoom, loadImage, elements]);

  // ── Draw grid ─────────────────────────────────────────────────────────────

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number) => {
    const step = gridSize * zoom;
    if (step < 4) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const startX = panX % step;
    const startY = panY % step;
    ctx.beginPath();
    for (let x = startX; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = startY; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }, [gridSize, zoom, panX, panY]);

  // ── Draw selection handles ────────────────────────────────────────────────

  const drawSelectionHandles = useCallback((ctx: CanvasRenderingContext2D, bounds: BoundingBox) => {
    const { x: bx, y: by, width: bw, height: bh } = bounds;
    const { x: sx, y: sy } = toCanvas(bx, by);
    const sw = bw * zoom, sh = bh * zoom;
    const hs = HANDLE_SIZE;

    // Selection bounding box
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.strokeRect(sx, sy, sw, sh);

    // Rotate handle line
    ctx.beginPath();
    ctx.moveTo(sx + sw / 2, sy);
    ctx.lineTo(sx + sw / 2, sy - ROTATE_OFFSET);
    ctx.stroke();

    // Draw handles
    const handles = [
      [sx - hs / 2, sy - hs / 2],
      [sx + sw / 2 - hs / 2, sy - hs / 2],
      [sx + sw - hs / 2, sy - hs / 2],
      [sx - hs / 2, sy + sh / 2 - hs / 2],
      [sx + sw - hs / 2, sy + sh / 2 - hs / 2],
      [sx - hs / 2, sy + sh - hs / 2],
      [sx + sw / 2 - hs / 2, sy + sh - hs / 2],
      [sx + sw - hs / 2, sy + sh - hs / 2],
      // rotate
      [sx + sw / 2 - hs / 2, sy - ROTATE_OFFSET - hs / 2],
    ];
    for (const [hx, hy] of handles) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = SELECTION_COLOR;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(hx, hy, hs, hs, 2);
      ctx.fill();
      ctx.stroke();
    }
  }, [toCanvas, zoom]);

  // ── Node editor and parameter handles drawing ────────────────────────────

  const drawNodeEditorOverlay = useCallback((ctx: CanvasRenderingContext2D, el: PathElement) => {
    ctx.save();
    ctx.lineWidth = 1.5;
    
    el.nodes.forEach((node, idx) => {
      const { x: nx, y: ny } = toCanvas(el.x + node.x, el.y + node.y);
      const isSelected = selectedNodeIndices.includes(idx);
      
      // Draw control handles if selected
      if (isSelected) {
        if (node.cpIn) {
          const { x: hx, y: hy } = toCanvas(el.x + node.x + node.cpIn.x, el.y + node.y + node.cpIn.y);
          ctx.strokeStyle = '#0c8ce9';
          ctx.beginPath();
          ctx.moveTo(nx, ny);
          ctx.lineTo(hx, hy);
          ctx.stroke();
          
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#0c8ce9';
          ctx.beginPath();
          ctx.arc(hx, hy, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        if (node.cpOut) {
          const { x: hx, y: hy } = toCanvas(el.x + node.x + node.cpOut.x, el.y + node.y + node.cpOut.y);
          ctx.strokeStyle = '#0c8ce9';
          ctx.beginPath();
          ctx.moveTo(nx, ny);
          ctx.lineTo(hx, hy);
          ctx.stroke();
          
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#0c8ce9';
          ctx.beginPath();
          ctx.arc(hx, hy, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
      
      // Draw anchor node (diamond shape)
      ctx.fillStyle = isSelected ? '#0c8ce9' : '#ffffff';
      ctx.strokeStyle = '#0c8ce9';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(nx, ny - 4);
      ctx.lineTo(nx + 4, ny);
      ctx.lineTo(nx, ny + 4);
      ctx.lineTo(nx - 4, ny);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
    
    ctx.restore();
  }, [toCanvas, selectedNodeIndices]);

  const drawParameterHandles = useCallback((ctx: CanvasRenderingContext2D, el: DesignElement) => {
    ctx.save();
    ctx.strokeStyle = '#7C3AED';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 1.5;

    if (el.type === 'star') {
      const star = el as StarElement;
      const outerR = star.width / 2;
      const innerR = outerR * star.innerRatio;
      const cx = star.x + star.width / 2;
      const cy = star.y + star.height / 2;
      const angle = Math.PI / star.points - Math.PI / 2;
      
      const { x: hx, y: hy } = toCanvas(
        cx + innerR * Math.cos(angle),
        cy + innerR * Math.sin(angle)
      );
      
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (el.type === 'rect') {
      const rect = el as RectElement;
      const r = rect.cornerRadius || 0;
      const offset = Math.max(10, Math.min(rect.width / 2, rect.height / 2, r));
      
      const corners = [
        { x: rect.x + offset, y: rect.y + offset },
        { x: rect.x + rect.width - offset, y: rect.y + offset },
        { x: rect.x + rect.width - offset, y: rect.y + rect.height - offset },
        { x: rect.x + offset, y: rect.y + rect.height - offset },
      ];
      
      corners.forEach(c => {
        const { x: hx, y: hy } = toCanvas(c.x, c.y);
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }
    ctx.restore();
  }, [toCanvas]);

  // ── Draw snap guides ──────────────────────────────────────────────────────

  const drawSnapGuides = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number) => {
    ctx.strokeStyle = GUIDE_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (const guide of snapGuides) {
      ctx.beginPath();
      if (guide.type === 'horizontal') {
        const y = guide.position * zoom + panY;
        ctx.moveTo(0, y); ctx.lineTo(W, y);
      } else {
        const x = guide.position * zoom + panX;
        ctx.moveTo(x, 0); ctx.lineTo(x, H);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }, [snapGuides, zoom, panX, panY]);

  // ── Main render loop ──────────────────────────────────────────────────────

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width / (window.devicePixelRatio || 1);
    const H = canvas.height / (window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, W, H);

    if (!page) return;

    // Artboard background
    const { x: ax, y: ay } = toCanvas(0, 0);
    const aw = page.width * zoom;
    const ah = page.height * zoom;

    // Artboard fill
    ctx.fillStyle = page.background;
    ctx.fillRect(ax, ay, aw, ah);

    // Flat artboard border (if not selected)
    if (!artboardSelected) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.lineWidth = 1;
      ctx.strokeRect(ax, ay, aw, ah);
    }

    // Artboard labels (Figma style)
    ctx.save();
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    ctx.textBaseline = 'bottom';
    const isBlue = artboardSelected || isArtboardHovered;
    ctx.fillStyle = isBlue ? '#0c8ce9' : '#888888';
    
    // Name label above top-left
    ctx.fillText(`# ${page.name}`, ax, ay - 6);

    // Size label above top-right (only when selected)
    if (artboardSelected) {
      ctx.textAlign = 'right';
      ctx.fillText(`${page.width} × ${page.height}`, ax + aw, ay - 6);
    }
    ctx.restore();

    // Grid
    if (showGrid) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(ax, ay, aw, ah);
      ctx.clip();
      drawGrid(ctx, W, H);
      ctx.restore();
    }

    // Elements (clip to artboard)
    ctx.save();
    ctx.beginPath();
    ctx.rect(ax, ay, aw, ah);
    ctx.clip();
    const pageEls = getPageElements();
    for (const el of pageEls) {
      drawElement(ctx, el);
    }
    ctx.restore();

    // Hover outline
    if (hoveredId && !selectedIds.includes(hoveredId)) {
      const el = elements[hoveredId];
      if (el) {
        const { x: ex, y: ey } = toCanvas(el.x, el.y);
        ctx.strokeStyle = SELECTION_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(ex, ey, el.width * zoom, el.height * zoom);
        ctx.setLineDash([]);
      }
    }

    // Selection handles / Artboard selection border & handles
    let bounds = getSelectionBounds();
    if (artboardSelected && page) {
      bounds = { x: 0, y: 0, width: page.width, height: page.height };
    }
    if (bounds && (selectedIds.length > 0 || artboardSelected)) {
      if (artboardSelected) {
        const { x: bx, y: by, width: bw, height: bh } = bounds;
        const { x: sx, y: sy } = toCanvas(bx, by);
        const sw = bw * zoom, sh = bh * zoom;
        const hs = HANDLE_SIZE;

        // Draw active frame blue outline
        ctx.strokeStyle = '#0c8ce9';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.strokeRect(sx, sy, sw, sh);

        // Corner handles only
        const handles = [
          [sx - hs / 2, sy - hs / 2], // nw
          [sx + sw - hs / 2, sy - hs / 2], // ne
          [sx - hs / 2, sy + sh - hs / 2], // sw
          [sx + sw - hs / 2, sy + sh - hs / 2], // se
        ];
        for (const [hx, hy] of handles) {
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#0c8ce9';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(hx, hy, hs, hs, 2);
          ctx.fill();
          ctx.stroke();
        }
      } else {
        drawSelectionHandles(ctx, bounds);
      }
    }

    // Snap guides
    drawSnapGuides(ctx, W, H);

    // Marquee selection box
    if (isMarquee.current) {
      const { x: msx, y: msy } = toCanvas(marqueeStart.current.x, marqueeStart.current.y);
      const { x: mex, y: mey } = toCanvas(marqueeEnd.current.x, marqueeEnd.current.y);
      ctx.save();
      ctx.strokeStyle = SELECTION_COLOR;
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(124, 88, 237, 0.15)';
      ctx.beginPath();
      ctx.rect(msx, msy, mex - msx, mey - msy);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Node edit mode overlay
    const nodeEditElId = editingPathId || activePathId;
    if (nodeEditElId && elements[nodeEditElId] && elements[nodeEditElId].type === 'path') {
      drawNodeEditorOverlay(ctx, elements[nodeEditElId] as PathElement);
    }

    // Custom Parameter handles
    if (selectedIds.length === 1 && !nodeEditElId) {
      const singleEl = elements[selectedIds[0]];
      if (singleEl && (singleEl.type === 'star' || singleEl.type === 'rect')) {
        drawParameterHandles(ctx, singleEl);
      }
    }

  }, [page, zoom, toCanvas, showGrid, drawGrid, getPageElements, drawElement,
      hoveredId, selectedIds, elements, getSelectionBounds, drawSelectionHandles, drawSnapGuides,
      editingPathId, activePathId, drawNodeEditorOverlay, drawParameterHandles]);

  // ── rAF render scheduling ─────────────────────────────────────────────────

  useEffect(() => {
    const loop = () => { render(); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [render]);

  // ── Pointer events ────────────────────────────────────────────────────────

  const getCanvasPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { cx: e.clientX - rect.left, cy: e.clientY - rect.top };
  };

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { cx, cy } = getCanvasPos(e);
    const { x: wx, y: wy } = toWorld(cx, cy);

    if (tool === 'hand' || e.button === 1 || (e.button === 0 && e.altKey)) {
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY, px: panX, py: panY };
      return;
    }

    // Check Node Edit handle clicks
    if (tool === 'node-edit' && editingPathId && elements[editingPathId]) {
      const path = elements[editingPathId] as PathElement;
      let hitNodeIdx: number | null = null;
      let hitHandleType: 'node' | 'cpIn' | 'cpOut' | null = null;

      // 1. Check control handles first (they are smaller, render on top of lines)
      for (let i = 0; i < path.nodes.length; i++) {
        const node = path.nodes[i];
        const isSelected = selectedNodeIndices.includes(i);
        if (isSelected) {
          const ax = path.x + node.x;
          const ay = path.y + node.y;
          if (node.cpIn) {
            const { x: hx, y: hy } = toCanvas(ax + node.cpIn.x, ay + node.cpIn.y);
            if (Math.hypot(cx - hx, cy - hy) < 8) {
              hitNodeIdx = i;
              hitHandleType = 'cpIn';
              break;
            }
          }
          if (node.cpOut) {
            const { x: hx, y: hy } = toCanvas(ax + node.cpOut.x, ay + node.cpOut.y);
            if (Math.hypot(cx - hx, cy - hy) < 8) {
              hitNodeIdx = i;
              hitHandleType = 'cpOut';
              break;
            }
          }
        }
      }

      // 2. Check anchor nodes
      if (hitNodeIdx === null) {
        for (let i = 0; i < path.nodes.length; i++) {
          const node = path.nodes[i];
          const ax = path.x + node.x;
          const ay = path.y + node.y;
          const { x: nx, y: ny } = toCanvas(ax, ay);
          if (Math.hypot(cx - nx, cy - ny) < 8) {
            hitNodeIdx = i;
            hitHandleType = 'node';
            break;
          }
        }
      }

      if (hitNodeIdx !== null && hitHandleType !== null) {
        if (hitHandleType === 'node') {
          if (e.shiftKey) {
            const nextIdx = selectedNodeIndices.includes(hitNodeIdx)
              ? selectedNodeIndices.filter(idx => idx !== hitNodeIdx)
              : [...selectedNodeIndices, hitNodeIdx];
            setSelectedNodeIndices(nextIdx);
          } else if (!selectedNodeIndices.includes(hitNodeIdx)) {
            setSelectedNodeIndices([hitNodeIdx]);
          }
        }
        draggingNodeIndex.current = hitNodeIdx;
        draggingHandleType.current = hitHandleType;
        dragStart.current = { x: wx, y: wy };
        nodeStartPos.current = path.nodes.map(n => ({
          x: n.x, y: n.y,
          cpIn: n.cpIn ? { ...n.cpIn } : undefined,
          cpOut: n.cpOut ? { ...n.cpOut } : undefined
        }));
        return;
      }

      setSelectedNodeIndices([]);
      return;
    }

    // Pen tool logic
    if (tool === 'pen') {
      const activePath = activePathId ? (elements[activePathId] as PathElement) : null;
      if (activePath && activePath.nodes.length > 0) {
        // Check if we click close to the first node to close path
        const n0 = activePath.nodes[0];
        const ax = activePath.x + n0.x;
        const ay = activePath.y + n0.y;
        const { x: nx, y: ny } = toCanvas(ax, ay);
        if (Math.hypot(cx - nx, cy - ny) < 8) {
          closeActivePath();
          return;
        }
      }

      // Add new node
      snapshot();
      addPathNode(wx, wy);

      // Instantly start handle pulling for smooth paths
      const updatedPath = useDesignStore.getState().elements[activePathId || ''] as PathElement;
      if (updatedPath) {
        const lastIdx = updatedPath.nodes.length - 1;
        draggingNodeIndex.current = lastIdx;
        draggingHandleType.current = 'cpOut';
        dragStart.current = { x: wx, y: wy };
        nodeStartPos.current = updatedPath.nodes.map((n: PathNode) => ({
          x: n.x, y: n.y,
          cpIn: n.cpIn ? { ...n.cpIn } : undefined,
          cpOut: n.cpOut ? { ...n.cpOut } : undefined
        }));
      }
      return;
    }

    // Check custom parameter handles (Star inner ratio / Rect corner radius)
    if (selectedIds.length === 1 && !activePathId && !editingPathId) {
      const singleEl = elements[selectedIds[0]];
      if (singleEl.type === 'star') {
        const star = singleEl as StarElement;
        const outerR = star.width / 2;
        const innerR = outerR * star.innerRatio;
        const cxCenter = star.x + star.width / 2;
        const cyCenter = star.y + star.height / 2;
        const angle = Math.PI / star.points - Math.PI / 2;
        const { x: hx, y: hy } = toCanvas(cxCenter + innerR * Math.cos(angle), cyCenter + innerR * Math.sin(angle));
        if (Math.hypot(cx - hx, cy - hy) < 8) {
          draggingParamHandle.current = 'star-inner';
          dragStart.current = { x: wx, y: wy };
          return;
        }
      } else if (singleEl.type === 'rect') {
        const rect = singleEl as RectElement;
        const r = rect.cornerRadius || 0;
        const offset = Math.max(10, Math.min(rect.width / 2, rect.height / 2, r));
        const corners = [
          { name: 'rect-tl' as const, x: rect.x + offset, y: rect.y + offset },
          { name: 'rect-tr' as const, x: rect.x + rect.width - offset, y: rect.y + offset },
          { name: 'rect-br' as const, x: rect.x + rect.width - offset, y: rect.y + rect.height - offset },
          { name: 'rect-bl' as const, x: rect.x + offset, y: rect.y + rect.height - offset },
        ];
        for (const c of corners) {
          const { x: hx, y: hy } = toCanvas(c.x, c.y);
          if (Math.hypot(cx - hx, cy - hy) < 8) {
            draggingParamHandle.current = c.name;
            dragStart.current = { x: wx, y: wy };
            return;
          }
        }
      }
    }

    // Check handle hit on existing selection or selected artboard
    let bounds = getSelectionBounds();
    if (artboardSelected && page) {
      bounds = { x: 0, y: 0, width: page.width, height: page.height };
    }
    if (bounds && (selectedIds.length > 0 || artboardSelected)) {
      const handle = getHandleAt(bounds, cx, cy);
      if (handle) {
        // Artboard only supports corner handles for resizing
        if (!artboardSelected || ['nw', 'ne', 'sw', 'se'].includes(handle)) {
          isResizing.current = handle;
          dragStart.current = { x: wx, y: wy };
          elemStartRect.current = {};
          if (artboardSelected && page) {
            elemStartRect.current['page'] = { x: 0, y: 0, w: page.width, h: page.height };
          } else {
            for (const id of selectedIds) {
              const el = elements[id];
              if (el) elemStartRect.current[id] = { x: el.x, y: el.y, w: el.width, h: el.height };
            }
          }
          return;
        }
      }
    }

    if (tool === 'select') {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCmd = isMac ? e.metaKey : e.ctrlKey;

      // Hit test elements (top-to-bottom)
      const pageEls = getPageElements();
      let hit: DesignElement | null = null;
      if (isCmd) {
        for (let i = pageEls.length - 1; i >= 0; i--) {
          const innerHit = findInnermostHit(pageEls[i], wx, wy, elements, true);
          if (innerHit) { hit = innerHit; break; }
        }
      } else {
        for (let i = pageEls.length - 1; i >= 0; i--) {
          if (hitTestElement(pageEls[i], wx, wy)) { hit = pageEls[i]; break; }
        }
      }
      if (hit) {
        let nextSelectedIds = [...selectedIds];
        if (e.shiftKey) {
          nextSelectedIds = selectedIds.includes(hit.id)
            ? selectedIds.filter(id => id !== hit.id)
            : [...selectedIds, hit.id];
        } else if (!selectedIds.includes(hit.id)) {
          nextSelectedIds = [hit.id];
        }
        setSelectedIds(nextSelectedIds);

        isDragging.current = true;
        dragStart.current = { x: wx, y: wy };
        elemStartRect.current = {};
        for (const id of nextSelectedIds) {
          const el = elements[id];
          if (el) elemStartRect.current[id] = { x: el.x, y: el.y, w: el.width, h: el.height };
        }
      } else {
        // Hit test artboard itself (only click on the border line or the top-left label will select the artboard)
        const { x: sx, y: sy } = toCanvas(0, 0);
        const sw = page.width * zoom;
        const sh = page.height * zoom;
        const d = 8; // detection distance in screen pixels

        const nearLeft = Math.abs(cx - sx) <= d && cy >= sy - d && cy <= sy + sh + d;
        const nearRight = Math.abs(cx - (sx + sw)) <= d && cy >= sy - d && cy <= sy + sh + d;
        const nearTop = Math.abs(cy - sy) <= d && cx >= sx - d && cx <= sx + sw + d;
        const nearBottom = Math.abs(cy - (sy + sh)) <= d && cx >= sx - d && cx <= sx + sw + d;
        
        // Hitting the top-left name label
        const hitLabel = cx >= sx - 4 && cx <= sx + 120 && cy >= sy - 22 && cy <= sy;

        const hitArtboardLine = nearLeft || nearRight || nearTop || nearBottom || hitLabel;

        if (hitArtboardLine) {
          setArtboardSelected(true);
        } else {
          setArtboardSelected(false);
          setSelectedIds([]);
          isMarquee.current = true;
          marqueeStart.current = { x: wx, y: wy };
          marqueeEnd.current = { x: wx, y: wy };
        }
      }
      return;
    }

    // Shape creation tools
    if (['rect', 'ellipse', 'text', 'line'].includes(tool)) {
      snapshot();
      const newEl = createDefaultElement(tool, wx, wy);
      newEl.width = 0;
      newEl.height = 0;
      if (tool === 'line') {
        (newEl as any).x2 = wx;
        (newEl as any).y2 = wy;
      }
      addElement(newEl);
      setSelectedIds([newEl.id]);

      isCreating.current = true;
      creationId.current = newEl.id;
      creationStart.current = { x: wx, y: wy };
    }
  }, [tool, toWorld, panX, panY, getSelectionBounds, selectedIds, getHandleAt,
      getPageElements, hitTestElement, setSelectedIds, elements, snapshot,
      addElement, setTool, activePathId, editingPathId, selectedNodeIndices,
      setSelectedNodeIndices, addPathNode, closeActivePath, toCanvas]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const { cx, cy } = getCanvasPos(e);
    const { x: wx, y: wy } = toWorld(cx, cy);

    // Handle dragging nodes/control handles
    if (draggingNodeIndex.current !== null && draggingHandleType.current !== null) {
      const idx = draggingNodeIndex.current;
      const hType = draggingHandleType.current;
      const pathId = activePathId || editingPathId;
      if (!pathId || !elements[pathId]) return;

      const path = elements[pathId] as PathElement;
      const startNode = nodeStartPos.current[idx];
      if (!startNode) return;

      const dx = wx - dragStart.current.x;
      const dy = wy - dragStart.current.y;

      if (hType === 'node') {
        // Move all selected nodes
        selectedNodeIndices.forEach(sIdx => {
          const sn = nodeStartPos.current[sIdx];
          if (sn) {
            updatePathNode(sIdx, { x: sn.x + dx, y: sn.y + dy });
          }
        });
      } else {
        // Move curves
        const lx = wx - path.x;
        const ly = wy - path.y;
        const rx = lx - startNode.x;
        const ry = ly - startNode.y;

        if (hType === 'cpOut') {
          updatePathNode(idx, {
            cpOut: { x: rx, y: ry },
            cpIn: { x: -rx, y: -ry }
          });
        } else {
          updatePathNode(idx, {
            cpIn: { x: rx, y: ry },
            cpOut: { x: -rx, y: -ry }
          });
        }
      }
      return;
    }

    // Handle dragging custom parameter handles
    if (draggingParamHandle.current !== null && selectedIds.length === 1) {
      const id = selectedIds[0];
      const el = elements[id];
      const pHandle = draggingParamHandle.current;

      if (el.type === 'star' && pHandle === 'star-inner') {
        const star = el as StarElement;
        const cxCenter = star.x + star.width / 2;
        const cyCenter = star.y + star.height / 2;
        const dist = Math.hypot(wx - cxCenter, wy - cyCenter);
        const outerR = star.width / 2;
        const innerRatio = Math.max(0.01, Math.min(0.99, dist / outerR));
        updateElement(id, { innerRatio });
        return;
      }

      if (el.type === 'rect') {
        const rect = el as RectElement;
        let radiusVal = 0;
        if (pHandle === 'rect-tl') radiusVal = Math.min(wx - rect.x, wy - rect.y);
        else if (pHandle === 'rect-tr') radiusVal = Math.min(rect.x + rect.width - wx, wy - rect.y);
        else if (pHandle === 'rect-br') radiusVal = Math.min(rect.x + rect.width - wx, rect.y + rect.height - wy);
        else if (pHandle === 'rect-bl') radiusVal = Math.min(wx - rect.x, rect.y + rect.height - wy);

        const val = Math.max(0, Math.min(rect.width / 2, rect.height / 2, radiusVal));
        if (rect.cornerRadii) {
          const cornerIdx = ['rect-tl', 'rect-tr', 'rect-br', 'rect-bl'].indexOf(pHandle);
          const nextRadii = [...rect.cornerRadii] as [number, number, number, number];
          if (cornerIdx !== -1) {
            nextRadii[cornerIdx] = val;
            updateElement(id, { cornerRadii: nextRadii } as any);
          }
        } else {
          updateElement(id, { cornerRadius: val });
        }
        return;
      }
    }

    if (isDragging.current && selectedIds.length) {
      const dx = wx - dragStart.current.x;
      const dy = wy - dragStart.current.y;
      for (const id of selectedIds) {
        const start = elemStartRect.current[id];
        if (!start) continue;
        let nx = start.x + dx;
        let ny = start.y + dy;
        if (snapToGrid) {
          nx = Math.round(nx / gridSize) * gridSize;
          ny = Math.round(ny / gridSize) * gridSize;
        }
        updateElement(id, { x: nx, y: ny });
      }
      return;
    }

    if (isResizing.current && artboardSelected && page) {
      const start = elemStartRect.current['page'];
      if (!start) return;
      const dx = wx - dragStart.current.x;
      const dy = wy - dragStart.current.y;
      const handle = isResizing.current;
      let w = start.w;
      let h = start.h;

      if (handle.includes('e')) w = Math.max(100, start.w + dx);
      if (handle.includes('s')) h = Math.max(100, start.h + dy);
      if (handle.includes('w')) w = Math.max(100, start.w - dx);
      if (handle.includes('n')) h = Math.max(100, start.h - dy);

      if (e.shiftKey) {
        const ratio = start.w / start.h;
        if (handle === 'se' || handle === 'ne' || handle === 'sw' || handle === 'nw') {
          if (handle.includes('e') || handle.includes('w')) {
            h = w / ratio;
          } else {
            w = h * ratio;
          }
        }
      }

      updatePageDimensions(page.id, Math.round(w), Math.round(h));
      return;
    }

    if (isResizing.current && selectedIds.length === 1) {
      const id = selectedIds[0];
      const start = elemStartRect.current[id];
      if (!start) return;
      const dx = wx - dragStart.current.x;
      const dy = wy - dragStart.current.y;
      const handle = isResizing.current;
      let { x, y, w, h } = start;

      if (handle === 'rotate') {
        const { x: ex, y: ey } = toCanvas(x + w / 2, y + h / 2);
        const angle = Math.atan2(cy - ey, cx - ex) * (180 / Math.PI) + 90;
        updateElement(id, { rotation: Math.round(angle) });
        return;
      }

      if (handle.includes('e')) w = Math.max(4, start.w + dx);
      if (handle.includes('s')) h = Math.max(4, start.h + dy);
      if (handle.includes('w')) { x = start.x + dx; w = Math.max(4, start.w - dx); }
      if (handle.includes('n')) { y = start.y + dy; h = Math.max(4, start.h - dy); }

      // Proportional scale on shift key
      if (e.shiftKey) {
        const ratio = start.w / start.h;
        if (handle === 'se') {
          w = Math.max(4, start.w + dx);
          h = w / ratio;
        } else if (handle === 'nw') {
          w = Math.max(4, start.w - dx);
          h = w / ratio;
          x = start.x + start.w - w;
          y = start.y + start.h - h;
        } else if (handle === 'ne') {
          w = Math.max(4, start.w + dx);
          h = w / ratio;
          y = start.y + start.h - h;
        } else if (handle === 'sw') {
          w = Math.max(4, start.w - dx);
          h = w / ratio;
          x = start.x + start.w - w;
        } else if (handle === 'n' || handle === 's' || handle === 'e' || handle === 'w') {
          if (handle === 'e' || handle === 'w') {
            h = w / ratio;
          } else {
            w = h * ratio;
          }
        }
      }

      updateElement(id, { x, y, width: w, height: h });
      return;
    }

    // Hover: check if over a resize/rotate handle first
    let bounds = getSelectionBounds();
    if (artboardSelected && page) {
      bounds = { x: 0, y: 0, width: page.width, height: page.height };
    }
    if (bounds && (selectedIds.length > 0 || artboardSelected)) {
      const handle = getHandleAt(bounds, cx, cy);
      if (artboardSelected && handle && !['nw', 'ne', 'sw', 'se'].includes(handle)) {
        setHoveredHandle(null);
      } else {
        setHoveredHandle(handle);
      }
    } else {
      setHoveredHandle(null);
    }

    // Hover element
    const pageEls = getPageElements();
    let hit: DesignElement | null = null;
    for (let i = pageEls.length - 1; i >= 0; i--) {
      if (hitTestElement(pageEls[i], wx, wy)) { hit = pageEls[i]; break; }
    }
    setHoveredId(hit?.id ?? null);

    // Hover artboard check
    if (page) {
      const isHovered = !hit && wx >= 0 && wx <= page.width && wy >= 0 && wy <= page.height;
      setIsArtboardHovered(isHovered);
    } else {
      setIsArtboardHovered(false);
    }
  }, [toWorld, isPanning, isDragging, selectedIds, dragStart, elemStartRect, updateElement,
      snapToGrid, gridSize, isResizing, toCanvas, getPageElements, hitTestElement, setHoveredId, setPan,
      getSelectionBounds, getHandleAt, setHoveredHandle, activePathId, editingPathId, selectedNodeIndices,
      updatePathNode, elements, artboardSelected, updatePageDimensions, page]);

  const onPointerUp = useCallback(() => {
    if (isMarquee.current) {
      isMarquee.current = false;
      const x1 = Math.min(marqueeStart.current.x, marqueeEnd.current.x);
      const y1 = Math.min(marqueeStart.current.y, marqueeEnd.current.y);
      const x2 = Math.max(marqueeStart.current.x, marqueeEnd.current.x);
      const y2 = Math.max(marqueeStart.current.y, marqueeEnd.current.y);
      const w = x2 - x1;
      const h = y2 - y1;

      if (w > 2 && h > 2) {
        const pageEls = getPageElements();
        const hits = pageEls.filter(el => {
          if (el.locked || !el.visible) return false;
          const elX1 = el.x;
          const elY1 = el.y;
          const elX2 = el.x + el.width;
          const elY2 = el.y + el.height;
          return !(elX2 < x1 || elX1 > x2 || elY2 < y1 || elY1 > y2);
        });
        setSelectedIds(hits.map(h => h.id));
      }
    }

    if (isCreating.current && creationId.current) {
      isCreating.current = false;
      const id = creationId.current;
      creationId.current = null;
      const el = elements[id];
      if (el) {
        if (el.type === 'line') {
          const len = Math.hypot((el as any).x2 - el.x, (el as any).y2 - el.y);
          if (len < 5) {
            updateElement(id, { x2: el.x + 150, y2: el.y });
          }
        } else {
          if (el.width < 5 && el.height < 5) {
            updateElement(id, {
              width: el.type === 'text' ? 200 : el.type === 'ellipse' ? 120 : 160,
              height: el.type === 'text' ? 48 : el.type === 'ellipse' ? 120 : 100
            });
          }
        }
      }
      setTool('select');
    }

    isDragging.current = false;
    isPanning.current = false;
    isResizing.current = null;
    draggingNodeIndex.current = null;
    draggingHandleType.current = null;
    draggingParamHandle.current = null;
    nodeStartPos.current = [];
    setSnapGuides([]);
  }, [getPageElements, setSelectedIds, elements, updateElement, setTool]);

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.05, Math.min(10, zoom * delta));
      const wx = (cx - panX) / zoom;
      const wy = (cy - panY) / zoom;
      setPan(cx - wx * newZoom, cy - wy * newZoom);
      setZoom(newZoom);
    } else {
      setPan(panX - e.deltaX, panY - e.deltaY);
    }
  }, [zoom, panX, panY, setZoom, setPan]);

  const onDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const { x: wx, y: wy } = toWorld(cx, cy);

    const pageEls = getPageElements();
    let hit: DesignElement | null = null;
    for (let i = pageEls.length - 1; i >= 0; i--) {
      if (hitTestElement(pageEls[i], wx, wy, true)) { hit = pageEls[i]; break; }
    }

    if (hit && hit.type === 'text') {
      setEditingTextId(hit.id);
    }
  }, [toWorld, getPageElements, hitTestElement]);

  const onContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const { x: wx, y: wy } = toWorld(cx, cy);

    const pageEls = getPageElements();
    let hit: DesignElement | null = null;
    for (let i = pageEls.length - 1; i >= 0; i--) {
      if (hitTestElement(pageEls[i], wx, wy, true)) { hit = pageEls[i]; break; }
    }

    if (hit) {
      if (!selectedIds.includes(hit.id)) {
        setSelectedIds([hit.id]);
      }
      setContextMenu({ x: cx, y: cy, visible: true, targetId: hit.id });
    } else {
      setContextMenu({ x: cx, y: cy, visible: true, targetId: null });
    }
  }, [toWorld, getPageElements, hitTestElement, selectedIds, setSelectedIds]);

  useEffect(() => {
    const hideMenu = () => setContextMenu(null);
    window.addEventListener('click', hideMenu);
    return () => window.removeEventListener('click', hideMenu);
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    // Track spacebar state to avoid repeated keydown fires
    let spaceHeld = false;

    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      const store = useDesignStore.getState();

      // Spacebar → temporarily activate hand tool (hold-to-pan, Figma-style)
      if (e.key === ' ' && !spaceHeld) {
        e.preventDefault();
        spaceHeld = true;
        if (store.tool !== 'hand') {
          (window as any).__designPrevTool = store.tool;
          store.setTool('hand');
        }
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCmd = isMac ? e.metaKey : e.ctrlKey;

      // Undo / Redo
      if (isCmd && e.key === 'z' && !e.shiftKey) { e.preventDefault(); store.undo(); return; }
      if (isCmd && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); store.redo(); return; }

      // Selection commands
      if (isCmd && e.key === 'd') { e.preventDefault(); store.duplicateElements(store.selectedIds); return; }
      
      // Node edit keys (delete node)
      if (store.tool === 'node-edit' && store.editingPathId) {
        if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          const path = store.elements[store.editingPathId] as PathElement;
          if (path) {
            const nextNodes = path.nodes.filter((_: any, idx: number) => !store.selectedNodeIndices.includes(idx));
            if (nextNodes.length === 0) {
              store.deleteElements([path.id]);
              store.setEditingPathId(null);
              store.setTool('select');
            } else {
              store.updateElement(path.id, { nodes: nextNodes });
              store.setSelectedNodeIndices([]);
            }
          }
          return;
        }
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault();
          store.setEditingPathId(null);
          store.setTool('select');
          return;
        }
      }

      // Pen tool keys (finish path)
      if (store.tool === 'pen' && store.activePathId) {
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault();
          store.closeActivePath();
          return;
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (store.selectedIds.length) store.deleteElements(store.selectedIds);
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); store.setSelectedIds([]); return; }

      // Selection hierarchy levels
      if (e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        if (store.selectedIds.length === 1) {
          const childId = store.selectedIds[0];
          const parentGroup = Object.values(store.elements).find(
            el => el.type === 'group' && (el as any).children?.includes(childId)
          );
          if (parentGroup) {
            store.setSelectedIds([parentGroup.id]);
          }
        }
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (store.selectedIds.length === 1) {
          const parentEl = store.elements[store.selectedIds[0]];
          if (parentEl && parentEl.type === 'group' && (parentEl as any).children?.length) {
            store.setSelectedIds((parentEl as any).children);
          }
        }
        return;
      }

      // Frame selection Cmd+Opt+G
      if (isCmd && e.altKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        store.frameSelection();
        triggerToast("Selection framed/grouped");
        return;
      }

      // Lock / Unlock Layer (Cmd+Shift+L)
      if (isCmd && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        store.selectedIds.forEach(id => {
          const el = store.elements[id];
          if (el) store.updateElement(id, { locked: !el.locked });
        });
        return;
      }

      // Hide / Show Layer (Cmd+Shift+H)
      if (isCmd && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        store.selectedIds.forEach(id => {
          const el = store.elements[id];
          if (el) store.updateElement(id, { visible: !el.visible });
        });
        return;
      }

      // UI Panels toggle (Cmd+\)
      if (isCmd && e.key === '\\') {
        e.preventDefault();
        store.toggleUI();
        return;
      }

      // Show Shortcuts Modal (Ctrl+Shift+?)
      if (e.ctrlKey && e.shiftKey && e.key === '?') {
        e.preventDefault();
        setShowShortcutsModal(true);
        return;
      }

      // Quick Actions (Cmd+/)
      if (isCmd && e.key === '/') {
        e.preventDefault();
        setShowQuickActions(true);
        return;
      }

      // Copy/Paste properties (Cmd+Opt+C / Cmd+Opt+V)
      if (isCmd && e.altKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        store.copyProperties();
        triggerToast("Properties Copied");
        return;
      }
      if (isCmd && e.altKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        store.pasteProperties();
        triggerToast("Properties Pasted");
        return;
      }

      // Text Alignment (Cmd+Opt+L/T/R)
      if (isCmd && e.altKey && ['l', 't', 'r'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        const alignMap: Record<string, 'left' | 'center' | 'right'> = { l: 'left', t: 'center', r: 'right' };
        const align = alignMap[e.key.toLowerCase()];
        store.selectedIds.forEach(id => {
          const el = store.elements[id];
          if (el && el.type === 'text') {
            const ts = { ...(el as any).textStyle, textAlign: align };
            store.updateElement(id, { textStyle: ts } as any);
          }
        });
        return;
      }

      // Font Size adjustment (Cmd+Shift+< / >)
      if (isCmd && e.shiftKey && (e.key === '<' || e.key === '>')) {
        e.preventDefault();
        const diff = e.key === '>' ? 2 : -2;
        store.selectedIds.forEach(id => {
          const el = store.elements[id];
          if (el && el.type === 'text') {
            const ts = { ...(el as any).textStyle, fontSize: Math.max(4, ((el as any).textStyle?.fontSize ?? 12) + diff) };
            store.updateElement(id, { textStyle: ts } as any);
          }
        });
        return;
      }

      // Font Weight adjustment (Cmd+Opt+< / >)
      if (isCmd && e.altKey && (e.key === '<' || e.key === '>')) {
        e.preventDefault();
        const weights = ['300', '400', '500', '600', '700', '800', '900'];
        store.selectedIds.forEach(id => {
          const el = store.elements[id];
          if (el && el.type === 'text') {
            const currentWeight = String((el as any).textStyle?.fontWeight ?? '400');
            const idx = weights.indexOf(currentWeight);
            let nextIdx = idx + (e.key === '>' ? 1 : -1);
            nextIdx = Math.max(0, Math.min(weights.length - 1, nextIdx));
            const ts = { ...(el as any).textStyle, fontWeight: weights[nextIdx] };
            store.updateElement(id, { textStyle: ts } as any);
          }
        });
        return;
      }

      // Auto Layout (Shift+A) & Remove Auto Layout (Opt+Shift+A)
      if (e.shiftKey && e.key === 'A') {
        e.preventDefault();
        triggerToast("Auto Layout Added (Items Stacked)");
        const { selectedIds, elements } = store;
        if (selectedIds.length >= 2) {
          store.snapshot();
          let currentY = Math.min(...selectedIds.map(id => elements[id]?.y ?? 0));
          selectedIds.forEach(id => {
            const el = elements[id];
            if (el && !el.locked) {
              store.updateElement(id, { y: currentY });
              currentY += el.height + 12;
            }
          });
        }
        return;
      }
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        triggerToast("Auto Layout Removed");
        return;
      }

      // Component creation stubs (Cmd+Opt+K / Cmd+Opt+B)
      if (isCmd && e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        triggerToast("Component Created");
        return;
      }
      if (isCmd && e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        triggerToast("Component Instance Detached");
        return;
      }
      if (e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        triggerToast("Insert Component Panel Opened");
        return;
      }

      // Clipboard shortcuts (standard)
      if (isCmd && e.key === 'c') { e.preventDefault(); store.copy(); return; }
      if (isCmd && e.key === 'x') { e.preventDefault(); store.cut(); return; }
      if (isCmd && e.key === 'v') { e.preventDefault(); store.paste(); return; }

      // Tools mappings
      if (!isCmd && !e.altKey) {
        if (e.key === 'v') { store.setTool('select'); return; }
        if (e.key === 'r') { store.setTool('rect'); return; }
        if (e.key === 'e' || e.key === 'o') { store.setTool('ellipse'); return; }
        if (e.key === 't') { store.setTool('text'); return; }
        if (e.key === 'l') { store.setTool('line'); return; }
        if (e.key === 'h') { store.setTool('hand'); return; }
        if (e.key === 'f') {
          store.setTool('frame');
          triggerToast("Frame/Artboard Tool Active: Choose a preset size on the right panel or drag to create");
          return;
        }
        if (e.key === 'p') {
          triggerToast("Pen Tool Coming Soon!");
          return;
        }

        // Color picker Eyedropper (I)
        if (e.key === 'i') {
          e.preventDefault();
          if ('EyeDropper' in window) {
            const eyeDropper = new (window as any).EyeDropper();
            eyeDropper.open().then((result: any) => {
              const hex = result.sRGBHex;
              const { selectedIds, elements } = store;
              if (selectedIds.length > 0) {
                selectedIds.forEach(id => {
                  const el = elements[id];
                  if (!el || el.locked) return;
                  if (el.type === 'text') {
                    const ts = { ...(el as any).textStyle, color: hex };
                    store.updateElement(id, { textStyle: ts } as any);
                  } else if (el.fills && el.fills.length > 0) {
                    const fills = [...el.fills];
                    if (fills[0].type === 'solid') {
                      fills[0] = { ...fills[0], color: hex };
                      store.updateElement(id, { fills } as any);
                    }
                  }
                });
              }
            }).catch(() => {});
          } else {
            triggerToast("Eyedropper not supported in this browser");
          }
          return;
        }
      }

      // Zoom keys
      if (isCmd && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        store.setZoom(store.zoom + 0.1);
        return;
      }
      if (isCmd && e.key === '-') {
        e.preventDefault();
        store.setZoom(store.zoom - 0.1);
        return;
      }
      if (e.shiftKey && e.key === '0') {
        e.preventDefault();
        store.setZoom(1.0);
        return;
      }
      if (e.shiftKey && e.key === '1') {
        e.preventDefault();
        const container = document.getElementById('design-canvas-container');
        if (container) store.fitToScreen(container.clientWidth, container.clientHeight);
        return;
      }
      if (e.shiftKey && e.key === '2') {
        e.preventDefault();
        const container = document.getElementById('design-canvas-container');
        if (container) store.zoomToSelection(container.clientWidth, container.clientHeight);
        return;
      }

      // Layer arrangement keys
      if (isCmd && e.key === ']') {
        e.preventDefault();
        if (store.selectedIds.length === 1) {
          if (e.shiftKey) store.bringToFront(store.selectedIds[0]);
          else store.bringForward(store.selectedIds[0]);
        }
        return;
      }
      if (isCmd && e.key === '[') {
        e.preventDefault();
        if (store.selectedIds.length === 1) {
          if (e.shiftKey) store.sendToBack(store.selectedIds[0]);
          else store.sendBackward(store.selectedIds[0]);
        }
        return;
      }

      // Grouping / Ungrouping
      if (isCmd && e.key === 'g' && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) {
          if (store.selectedIds.length === 1) store.ungroupElements(store.selectedIds[0]);
        } else {
          if (store.selectedIds.length >= 2) store.groupElements(store.selectedIds);
        }
        return;
      }

      // Nudging with arrow keys
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const amt = e.shiftKey ? 10 : 1;
        let dx = 0, dy = 0;
        if (e.key === 'ArrowUp') dy = -amt;
        if (e.key === 'ArrowDown') dy = amt;
        if (e.key === 'ArrowLeft') dx = -amt;
        if (e.key === 'ArrowRight') dx = amt;

        store.selectedIds.forEach(id => {
          const el = store.elements[id];
          if (el && !el.locked) store.updateElement(id, { x: el.x + dx, y: el.y + dy });
        });
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        spaceHeld = false;
        // Restore previous tool on spacebar release
        const prev = (window as any).__designPrevTool;
        if (prev && prev !== 'hand') {
          useDesignStore.getState().setTool(prev);
          delete (window as any).__designPrevTool;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);


  const editingEl = editingTextId ? (elements[editingTextId] as TextElement) : null;

  const getEditingTextAreaStyle = (): React.CSSProperties | undefined => {
    if (!editingEl) return undefined;
    const { x: cx, y: cy } = toCanvas(editingEl.x, editingEl.y);
    const ts = editingEl.textStyle;
    return {
      position: 'absolute',
      left: cx,
      top: cy,
      width: Math.max(100, editingEl.width * zoom),
      height: Math.max(30, editingEl.height * zoom),
      transform: `rotate(${editingEl.rotation}deg)`,
      transformOrigin: 'center center',
      fontFamily: `'${ts.fontFamily}', sans-serif`,
      fontSize: ts.fontSize * zoom,
      fontWeight: ts.fontWeight,
      fontStyle: ts.fontStyle,
      lineHeight: ts.lineHeight,
      textAlign: ts.textAlign as any,
      color: ts.color,
      background: 'rgba(255,255,255,0.05)',
      border: '1px dashed #7C3AED',
      outline: 'none',
      resize: 'none',
      overflow: 'hidden',
      padding: 0,
      margin: 0,
      zIndex: 100,
    };
  };

  // ── Cursor style ──────────────────────────────────────────────────────────

  // Maps each handle name to the appropriate CSS cursor.
  // Corner handles use diagonal resize cursors; edge handles use N/S/E/W;
  // the rotate handle uses a custom rotation cursor via SVG data-URI.
  const HANDLE_CURSOR_MAP: Record<string, string> = {
    nw: 'nw-resize',
    ne: 'ne-resize',
    sw: 'sw-resize',
    se: 'se-resize',
    n:  'n-resize',
    s:  's-resize',
    e:  'e-resize',
    w:  'w-resize',
    rotate: [
      'url("data:image/svg+xml;utf8,',
      '<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\'>',
      '<path d=\'M12 2a10 10 0 0 1 7.39 3.26L21 4v5h-5l1.73-1.73A8 8 0 1 0 20 12h2a10 10 0 1 1-10-10z\' fill=\'white\' stroke=\'black\' stroke-width=\'.5\'/>',
      '</svg>',
      '") 12 12, alias',
    ].join(''),
  };

  const getCursor = () => {
    if (isPanning.current) return 'grabbing';
    if (tool === 'hand') return 'grab';
    if (tool === 'rect' || tool === 'ellipse' || tool === 'frame') return 'crosshair';
    if (tool === 'text') return 'text';

    const handle = isResizing.current || hoveredHandle;
    if (handle) {
      if (handle === 'rotate') return HANDLE_CURSOR_MAP['rotate'];

      // If exactly 1 element is selected, adapt the cursor to its rotation
      if (selectedIds.length === 1) {
        const el = elements[selectedIds[0]];
        if (el && el.rotation) {
          const baseAngles: Record<string, number> = {
            e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315
          };
          if (baseAngles[handle] !== undefined) {
            let angle = (baseAngles[handle] + el.rotation) % 360;
            if (angle < 0) angle += 360;
            const octant = Math.round(angle / 45) % 8;
            const cursorMap = [
              'e-resize', 'se-resize', 's-resize', 'sw-resize',
              'w-resize', 'nw-resize', 'n-resize', 'ne-resize'
            ];
            return cursorMap[octant];
          }
        }
      }
      return HANDLE_CURSOR_MAP[handle] ?? 'default';
    }

    return 'default';
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      style={{ background: '#f5f5f5' }}
    >
      <canvas
        ref={canvasRef}
        style={{ cursor: getCursor(), touchAction: 'none', display: 'block', width: '100%', height: '100%' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
      />
      {editingEl && (
        <textarea
          style={getEditingTextAreaStyle()}
          value={editingEl.content}
          onChange={e => updateElement(editingEl.id, { content: e.target.value })}
          onBlur={() => setEditingTextId(null)}
          onKeyDown={e => {
            if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
              e.preventDefault();
              setEditingTextId(null);
            }
          }}
          autoFocus
        />
      )}
      {contextMenu && contextMenu.visible && (
        <div
          className="absolute z-50 rounded-lg shadow-2xl border py-1 w-44 text-xs flex flex-col"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            background: '#1c1c1c',
            borderColor: '#333',
            color: '#e5e7eb',
          }}
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.targetId ? (
            <>
              <button onClick={() => { copy(); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 hover:bg-white/5 flex justify-between">
                <span>Copy</span><span className="text-[10px] text-gray-500">⌘C</span>
              </button>
              <button onClick={() => { cut(); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 hover:bg-white/5 flex justify-between">
                <span>Cut</span><span className="text-[10px] text-gray-500">⌘X</span>
              </button>
              <button onClick={() => { duplicateElements(selectedIds); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 hover:bg-white/5 flex justify-between">
                <span>Duplicate</span><span className="text-[10px] text-gray-500">⌘D</span>
              </button>
              <button onClick={() => { deleteElements(selectedIds); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 hover:bg-white/5 flex justify-between">
                <span>Delete</span><span className="text-[10px] text-gray-500">Del</span>
              </button>
              <div className="border-t my-1 border-[#333]" />
              <button onClick={() => { bringForward(contextMenu.targetId!); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 hover:bg-white/5">
                Bring Forward
              </button>
              <button onClick={() => { sendBackward(contextMenu.targetId!); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 hover:bg-white/5">
                Send Backward
              </button>
              {selectedIds.length >= 2 && (
                <button onClick={() => { groupElements(selectedIds); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 hover:bg-white/5 flex justify-between">
                  <span>Group</span><span className="text-[10px] text-gray-500">⌘G</span>
                </button>
              )}
              {selectedIds.length === 1 && elements[selectedIds[0]]?.type === 'group' && (
                <button onClick={() => { ungroupElements(contextMenu.targetId!); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 hover:bg-white/5 flex justify-between">
                  <span>Ungroup</span><span className="text-[10px] text-gray-500">⌘⇧G</span>
                </button>
              )}
            </>
          ) : (
            <button onClick={() => { paste(); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 hover:bg-white/5 flex justify-between">
              <span>Paste</span><span className="text-[10px] text-gray-500">⌘V</span>
            </button>
          )}
        </div>
      )}
      {/* Zoom indicator */}
      <div className="absolute bottom-4 right-4 bg-black/60 text-white text-xs px-2 py-1 rounded-md backdrop-blur-sm select-none">
        {Math.round(zoom * 100)}%
      </div>

      {/* Toasts */}
      {toast && (
        <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 bg-purple-600/90 text-white font-semibold text-xs px-4 py-2 rounded-lg shadow-2xl z-50 backdrop-blur border border-purple-500">
          {toast}
        </div>
      )}

      {/* Quick Actions Search Menu */}
      {showQuickActions && (
        <div
          className="absolute inset-0 z-50 flex items-start justify-center pt-24 bg-black/40 backdrop-blur-sm"
          onClick={() => setShowQuickActions(false)}
        >
          <div
            className="w-96 rounded-xl border shadow-2xl p-2 flex flex-col gap-1 text-xs"
            style={{ background: '#1c1c1c', borderColor: '#333' }}
            onClick={e => e.stopPropagation()}
          >
            <input
              autoFocus
              value={quickActionSearch}
              onChange={e => setQuickActionSearch(e.target.value)}
              placeholder="Search actions (e.g. Delete, Group, Zoom, Rectangle...)"
              className="w-full px-3 py-2 rounded-lg outline-none border"
              style={{ background: '#121212', color: '#e5e7eb', borderColor: '#333' }}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  setShowQuickActions(false);
                }
              }}
            />
            
            <div className="max-h-60 overflow-y-auto pt-1">
              {[
                { label: 'Add Rectangle', shortcut: 'R', action: () => store.setTool('rect') },
                { label: 'Add Ellipse', shortcut: 'O', action: () => store.setTool('ellipse') },
                { label: 'Add Text', shortcut: 'T', action: () => store.setTool('text') },
                { label: 'Add Line', shortcut: 'L', action: () => store.setTool('line') },
                { label: 'Zoom In', shortcut: '⌘+', action: () => store.setZoom(store.zoom + 0.2) },
                { label: 'Zoom Out', shortcut: '⌘-', action: () => store.setZoom(store.zoom - 0.2) },
                { label: 'Zoom to 100%', shortcut: '⇧0', action: () => store.setZoom(1.0) },
                { label: 'Group Selection', shortcut: '⌘G', action: () => store.groupElements(store.selectedIds) },
                { label: 'Ungroup Selection', shortcut: '⌘⇧G', action: () => {
                  if (store.selectedIds.length === 1) store.ungroupElements(store.selectedIds[0]);
                }},
                { label: 'Delete Selection', shortcut: 'Backspace', action: () => store.deleteElements(store.selectedIds) },
                { label: 'Toggle Panels UI', shortcut: '⌘\\', action: () => store.toggleUI() },
                { label: 'Show Keyboard Shortcuts Panel', shortcut: '⌃⇧?', action: () => setShowShortcutsModal(true) },
              ]
              .filter(cmd => cmd.label.toLowerCase().includes(quickActionSearch.toLowerCase()))
              .map((cmd, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    cmd.action();
                    setShowQuickActions(false);
                    setQuickActionSearch('');
                  }}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-white/5 flex justify-between items-center transition-colors text-gray-300"
                >
                  <span>{cmd.label}</span>
                  <span className="text-[10px] text-gray-500 font-mono bg-black/30 px-1 py-0.5 rounded border border-[#2a2a2a]">{cmd.shortcut}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Shortcuts Cheat Sheet Modal */}
      {showShortcutsModal && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowShortcutsModal(false)}
        >
          <div
            className="w-[500px] rounded-xl border shadow-2xl p-5 flex flex-col gap-3 text-xs max-h-[80vh] overflow-hidden"
            style={{ background: '#1c1c1c', borderColor: '#333', color: '#e5e7eb' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b pb-2" style={{ borderColor: '#333' }}>
              <span className="text-sm font-semibold">Keyboard Shortcuts Cheat Sheet</span>
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="text-gray-500 hover:text-white font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div>
                <p className="text-purple-400 font-bold mb-1.5 uppercase text-[10px]">Master Controls</p>
                <div className="grid grid-cols-2 gap-2 text-gray-300">
                  <div className="flex justify-between border-b border-[#262626] pb-1"><span>Show Shortcuts Panel</span><kbd className="font-mono bg-black/40 px-1.5 rounded text-[10px]">⌃ + ⇧ + ?</kbd></div>
                  <div className="flex justify-between border-b border-[#262626] pb-1"><span>Quick Actions Menu</span><kbd className="font-mono bg-black/40 px-1.5 rounded text-[10px]">⌘ + /</kbd></div>
                  <div className="flex justify-between border-b border-[#262626] pb-1"><span>Show/Hide Panels UI</span><kbd className="font-mono bg-black/40 px-1.5 rounded text-[10px]">⌘ + \</kbd></div>
                </div>
              </div>

              <div>
                <p className="text-purple-400 font-bold mb-1.5 uppercase text-[10px]">Tools & Navigation</p>
                <div className="grid grid-cols-2 gap-2 text-gray-300">
                  <div className="flex justify-between border-b border-[#262626] pb-1"><span>Move / Select Tool</span><kbd className="font-mono bg-black/40 px-1.5 rounded text-[10px]">V</kbd></div>
                  <div className="flex justify-between border-b border-[#262626] pb-1"><span>Rectangle / Ellipse</span><kbd className="font-mono bg-black/40 px-1.5 rounded text-[10px]">R / O</kbd></div>
                  <div className="flex justify-between border-b border-[#262626] pb-1"><span>Line / Text Tool</span><kbd className="font-mono bg-black/40 px-1.5 rounded text-[10px]">L / T</kbd></div>
                  <div className="flex justify-between border-b border-[#262626] pb-1"><span>Pan Canvas (Grab)</span><kbd className="font-mono bg-black/40 px-1.5 rounded text-[10px]">Space + Drag</kbd></div>
                  <div className="flex justify-between border-b border-[#262626] pb-1"><span>Zoom to 100%</span><kbd className="font-mono bg-black/40 px-1.5 rounded text-[10px]">⇧ + 0</kbd></div>
                  <div className="flex justify-between border-b border-[#262626] pb-1"><span>Zoom to Fit Canvas</span><kbd className="font-mono bg-black/40 px-1.5 rounded text-[10px]">⇧ + 1</kbd></div>
                  <div className="flex justify-between border-b border-[#262626] pb-1"><span>Zoom to Selection</span><kbd className="font-mono bg-black/40 px-1.5 rounded text-[10px]">⇧ + 2</kbd></div>
                </div>
              </div>

              <div>
                <p className="text-purple-400 font-bold mb-1.5 uppercase text-[10px]">Selection & Layers</p>
                <div className="grid grid-cols-2 gap-2 text-gray-300">
                  <div className="flex justify-between border-b border-[#262626] pb-1"><span>Deep Select</span><kbd className="font-mono bg-black/40 px-1.5 rounded text-[10px]">⌘ + Click</kbd></div>
                  <div className="flex justify-between border-b border-[#262626] pb-1"><span>Select Parent Group</span><kbd className="font-mono bg-black/40 px-1.5 rounded text-[10px]">⇧ + Enter</kbd></div>
                  <div className="flex justify-between border-b border-[#262626] pb-1"><span>Select Group Children</span><kbd className="font-mono bg-black/40 px-1.5 rounded text-[10px]">Enter</kbd></div>
                  <div className="flex justify-between border-b border-[#262626] pb-1"><span>Group Selection</span><kbd className="font-mono bg-black/40 px-1.5 rounded text-[10px]">⌘ + G</kbd></div>
                  <div className="flex justify-between border-b border-[#262626] pb-1"><span>Frame Selection</span><kbd className="font-mono bg-black/40 px-1.5 rounded text-[10px]">⌘ + ⌥ + G</kbd></div>
                  <div className="flex justify-between border-b border-[#262626] pb-1"><span>Toggle Layer Lock</span><kbd className="font-mono bg-black/40 px-1.5 rounded text-[10px]">⌘ + ⇧ + L</kbd></div>
                  <div className="flex justify-between border-b border-[#262626] pb-1"><span>Toggle Layer Visibility</span><kbd className="font-mono bg-black/40 px-1.5 rounded text-[10px]">⌘ + ⇧ + H</kbd></div>
                </div>
              </div>

              <div>
                <p className="text-purple-400 font-bold mb-1.5 uppercase text-[10px]">Styling & Properties</p>
                <div className="grid grid-cols-2 gap-2 text-gray-300">
                  <div className="flex justify-between border-b border-[#262626] pb-1"><span>Color Eyedropper</span><kbd className="font-mono bg-black/40 px-1.5 rounded text-[10px]">I</kbd></div>
                  <div className="flex justify-between border-b border-[#262626] pb-1"><span>Copy Properties</span><kbd className="font-mono bg-black/40 px-1.5 rounded text-[10px]">⌘ + ⌥ + C</kbd></div>
                  <div className="flex justify-between border-b border-[#262626] pb-1"><span>Paste Properties</span><kbd className="font-mono bg-black/40 px-1.5 rounded text-[10px]">⌘ + ⌥ + V</kbd></div>
                  <div className="flex justify-between border-b border-[#262626] pb-1"><span>Align Text (L/C/R)</span><kbd className="font-mono bg-black/40 px-1.5 rounded text-[10px]">⌘ + ⌥ + L/T/R</kbd></div>
                  <div className="flex justify-between border-b border-[#262626] pb-1"><span>Adjust Font Size</span><kbd className="font-mono bg-black/40 px-1.5 rounded text-[10px]">⌘ + ⇧ + &lt; / &gt;</kbd></div>
                  <div className="flex justify-between border-b border-[#262626] pb-1"><span>Adjust Font Weight</span><kbd className="font-mono bg-black/40 px-1.5 rounded text-[10px]">⌘ + ⌥ + &lt; / &gt;</kbd></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function findInnermostHit(
  el: DesignElement,
  wx: number,
  wy: number,
  elementsMap: Record<string, DesignElement>,
  ignoreLocked = true
): DesignElement | null {
  if (!el.visible) return null;
  if (ignoreLocked && el.locked) return null;

  if (el.type === 'group') {
    const group = el as any;
    if (group.children) {
      for (let i = group.children.length - 1; i >= 0; i--) {
        const childId = group.children[i];
        const child = elementsMap[childId];
        if (child) {
          const hit = findInnermostHit(child, wx, wy, elementsMap, ignoreLocked);
          if (hit) return hit;
        }
      }
    }
  }

  // Hit test checks
  if (el.type === 'line') {
    const line = el as LineElement;
    const minX = Math.min(line.x, line.x2), maxX = Math.max(line.x, line.x2);
    const minY = Math.min(line.y, line.y2), maxY = Math.max(line.y, line.y2);
    if (wx >= minX - 5 && wx <= maxX + 5 && wy >= minY - 5 && wy <= maxY + 5) return el;
  } else {
    if (wx >= el.x && wx <= el.x + el.width && wy >= el.y && wy <= el.y + el.height) return el;
  }

  return null;
}

function createDefaultElement(toolType: string, wx: number, wy: number): DesignElement {
  const base = {
    id: uid(), visible: true, locked: false, rotation: 0, opacity: 1,
    fills: [{ type: 'solid' as const, color: '#7C3AED', opacity: 1 }],
    strokes: [], effects: [], blendMode: 'normal' as const,
  };
  if (toolType === 'rect') {
    return { ...base, type: 'rect', name: 'Rectangle', x: wx, y: wy, width: 160, height: 100, cornerRadius: 0 };
  }
  if (toolType === 'ellipse') {
    return { ...base, type: 'ellipse', name: 'Ellipse', x: wx, y: wy, width: 120, height: 120 };
  }
  if (toolType === 'text') {
    return {
      ...base, type: 'text', name: 'Text', x: wx, y: wy, width: 200, height: 48,
      fills: [{ type: 'solid', color: '#ffffff', opacity: 1 }],
      content: 'Type something',
      textStyle: {
        fontFamily: 'Inter', fontSize: 24, fontWeight: '600', fontStyle: 'normal',
        letterSpacing: 0, lineHeight: 1.3, textAlign: 'left', textDecoration: 'none',
        textTransform: 'none', color: '#ffffff',
      },
      autoWidth: true, autoHeight: true,
    };
  }
  if (toolType === 'line') {
    return {
      ...base, type: 'line', name: 'Line', x: wx, y: wy, width: 1, height: 1,
      x2: wx + 150, y2: wy,
      fills: [],
      strokes: [{ color: '#7C3AED', opacity: 1, width: 2, style: 'solid', position: 'center' }],
      arrowStart: false, arrowEnd: false,
    };
  }
  if (toolType === 'star') {
    return { ...base, type: 'star', name: 'Star', x: wx, y: wy, width: 100, height: 100, points: 5, innerRatio: 0.38 } as any;
  }
  if (toolType === 'polygon') {
    return { ...base, type: 'polygon', name: 'Polygon', x: wx, y: wy, width: 100, height: 100, sides: 6 } as any;
  }
  return { ...base, type: 'rect', name: 'Shape', x: wx, y: wy, width: 100, height: 100, cornerRadius: 0 };
}
