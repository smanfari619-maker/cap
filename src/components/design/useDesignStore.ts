import { create } from 'zustand';
import { db } from '../../lib/db';
import type {
  DesignElement, DesignPage, DesignProject, ToolMode, BoundingBox, PathNode, PathElement
} from './types';
import { uid, getBounds } from './utils';
import { performBooleanOp } from './shape_builder_utils';

// ─── History ─────────────────────────────────────────────────────────────────

interface HistoryEntry {
  pages: DesignPage[];
  elements: Record<string, DesignElement>;
}

// ─── State ────────────────────────────────────────────────────────────────────

interface DesignState {
  // Project
  currentProject: DesignProject | null;
  pages: DesignPage[];
  currentPageId: string | null;
  elements: Record<string, DesignElement>;

  // Selection
  selectedIds: string[];
  hoveredId: string | null;

  // Canvas viewport
  tool: ToolMode;
  zoom: number; // 0.1 – 10
  panX: number;
  panY: number;

  // UI
  showGrid: boolean;
  showRulers: boolean;
  snapToGrid: boolean;
  snapToElements: boolean;
  gridSize: number;

  // History
  past: HistoryEntry[];
  future: HistoryEntry[];

  // Clipboard
  clipboard: DesignElement[];
  copiedStyle: any | null;

  // UI Panel visibility
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;

  // Path Editing / Pen Tool State
  activePathId: string | null;
  editingPathId: string | null;
  selectedNodeIndices: number[];
  artboardSelected: boolean;

  // Actions ─────────────────────────────────────────────────────────────────
  copy: () => void;
  cut: () => void;
  paste: () => void;
  copyProperties: () => void;
  pasteProperties: () => void;
  zoomToSelection: (containerW: number, containerH: number) => void;
  frameSelection: () => void;
  toggleUI: () => void;

  // Project
  loadDesignProject: (project: DesignProject) => void;
  closeDesignProject: () => void;
  saveDesignProject: () => Promise<void>;

  // Page
  addPage: (name?: string, width?: number, height?: number) => void;
  setCurrentPage: (pageId: string) => void;
  renamePage: (pageId: string, name: string) => void;
  deletePage: (pageId: string) => void;
  setPageBackground: (pageId: string, color: string) => void;
  updatePageDimensions: (pageId: string, width: number, height: number) => void;
  duplicatePage: (pageId: string) => void;

  // Element CRUD
  addElement: (el: DesignElement) => void;
  updateElement: (id: string, updates: Partial<DesignElement>) => void;
  deleteElements: (ids: string[]) => void;
  duplicateElements: (ids: string[]) => void;

  // Selection
  setSelectedIds: (ids: string[]) => void;
  setHoveredId: (id: string | null) => void;
  setArtboardSelected: (selected: boolean) => void;

  // Alignment & Distribution
  alignElements: (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  distributeElements: (axis: 'h' | 'v') => void;
  flipElement: (id: string, axis: 'h' | 'v') => void;

  // Layer order
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;

  // Group/Ungroup
  groupElements: (ids: string[]) => void;
  ungroupElements: (id: string) => void;

  // Tool
  setTool: (tool: ToolMode) => void;

  // Viewport
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  fitToScreen: (containerW: number, containerH: number) => void;

  // UI toggles
  setShowGrid: (v: boolean) => void;
  setSnapToGrid: (v: boolean) => void;
  setSnapToElements: (v: boolean) => void;

  // Path / Pen actions
  setActivePathId: (id: string | null) => void;
  setEditingPathId: (id: string | null) => void;
  setSelectedNodeIndices: (indices: number[]) => void;
  addPathNode: (x: number, y: number) => void;
  updatePathNode: (index: number, nodeUpdates: Partial<PathNode>) => void;
  closeActivePath: () => void;
  booleanOperation: (opType: 'union' | 'subtract' | 'intersect' | 'exclude') => void;

  // History
  undo: () => void;
  redo: () => void;
  snapshot: () => void;

  // Computed helpers
  getCurrentPage: () => DesignPage | null;
  getPageElements: () => DesignElement[];
  getSelectionBounds: () => BoundingBox | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function newPage(name = 'Page 1', width = 1080, height = 1080): DesignPage {
  return { id: uid(), name, width, height, background: '#ffffff', elementIds: [] };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useDesignStore = create<DesignState>((set, get) => ({
  currentProject: null,
  pages: [],
  currentPageId: null,
  elements: {},
  selectedIds: [],
  hoveredId: null,
  tool: 'select',
  zoom: 1,
  panX: 0,
  panY: 0,
  showGrid: false,
  showRulers: true,
  snapToGrid: true,
  snapToElements: true,
  gridSize: 8,
  past: [],
  future: [],
  clipboard: [],
  copiedStyle: null,
  leftPanelVisible: true,
  rightPanelVisible: true,

  activePathId: null,
  editingPathId: null,
  selectedNodeIndices: [],
  artboardSelected: false,

  // ── Project ───────────────────────────────────────────────────────────────

  loadDesignProject: (project) => {
    const pageId = project.pages[0]?.id ?? null;
    set({
      currentProject: project,
      pages: project.pages,
      currentPageId: pageId,
      elements: project.elements,
      selectedIds: [],
      past: [],
      future: [],
      zoom: 1,
      panX: 0,
      panY: 0,
    });
  },

  closeDesignProject: () => set({
    currentProject: null, pages: [], currentPageId: null,
    elements: {}, selectedIds: [], past: [], future: [],
  }),

  saveDesignProject: async () => {
    const { currentProject, pages, elements } = get();
    if (!currentProject) return;
    const updated: DesignProject = {
      ...currentProject,
      pages,
      elements,
      updatedAt: new Date(),
    };
    await db.designProjects.put(updated as any);
    set({ currentProject: updated });
  },

  // ── Page ─────────────────────────────────────────────────────────────────

  addPage: (name, width = 1080, height = 1080) => {
    const page = newPage(name ?? `Page ${get().pages.length + 1}`, width, height);
    set(s => ({ pages: [...s.pages, page], currentPageId: page.id }));
    get().saveDesignProject();
  },

  setCurrentPage: (pageId) => set({ currentPageId: pageId, selectedIds: [] }),

  renamePage: (pageId, name) => {
    set(s => ({ pages: s.pages.map(p => p.id === pageId ? { ...p, name } : p) }));
    get().saveDesignProject();
  },

  deletePage: (pageId) => {
    const pages = get().pages.filter(p => p.id !== pageId);
    if (!pages.length) return;
    const currentPageId = get().currentPageId === pageId ? pages[0].id : get().currentPageId;
    set({ pages, currentPageId });
    get().saveDesignProject();
  },

  setPageBackground: (pageId, color) => {
    set(s => ({ pages: s.pages.map(p => p.id === pageId ? { ...p, background: color } : p) }));
    get().saveDesignProject();
  },

  updatePageDimensions: (pageId, width, height) => {
    set(s => ({
      pages: s.pages.map(p =>
        p.id === pageId ? { ...p, width: Math.max(10, width), height: Math.max(10, height) } : p
      )
    }));
    get().saveDesignProject();
  },

  duplicatePage: (pageId) => {
    const page = get().pages.find(p => p.id === pageId);
    if (!page) return;
    const newEl: Record<string, DesignElement> = {};
    const newIds: string[] = [];
    for (const oldId of page.elementIds) {
      const el = get().elements[oldId];
      if (!el) continue;
      const newId = uid();
      newEl[newId] = { ...el, id: newId };
      newIds.push(newId);
    }
    const dup: DesignPage = { ...page, id: uid(), name: page.name + ' Copy', elementIds: newIds };
    set(s => ({
      pages: [...s.pages, dup],
      elements: { ...s.elements, ...newEl },
      currentPageId: dup.id,
    }));
    get().saveDesignProject();
  },

  // ── Element ───────────────────────────────────────────────────────────────

  addElement: (el) => {
    get().snapshot();
    const { currentPageId } = get();
    if (!currentPageId) return;
    set(s => ({
      elements: { ...s.elements, [el.id]: el },
      pages: s.pages.map(p =>
        p.id === currentPageId
          ? { ...p, elementIds: [...p.elementIds, el.id] }
          : p
      ),
      selectedIds: [el.id],
    }));
    get().saveDesignProject();
  },

  updateElement: (id, updates) => {
    set(s => ({ elements: { ...s.elements, [id]: { ...s.elements[id], ...updates } as DesignElement } }));
    get().saveDesignProject();
  },

  deleteElements: (ids) => {
    get().snapshot();
    const idsSet = new Set(ids);
    set(s => {
      const elements = { ...s.elements };
      ids.forEach(id => delete elements[id]);
      return {
        elements,
        pages: s.pages.map(p => ({ ...p, elementIds: p.elementIds.filter(id => !idsSet.has(id)) })),
        selectedIds: [],
      };
    });
    get().saveDesignProject();
  },

  duplicateElements: (ids) => {
    get().snapshot();
    const { currentPageId, elements } = get();
    if (!currentPageId) return;
    const newEls: Record<string, DesignElement> = {};
    const newIds: string[] = [];
    for (const id of ids) {
      const el = elements[id];
      if (!el) continue;
      const newId = uid();
      newEls[newId] = { ...el, id: newId, x: el.x + 20, y: el.y + 20 };
      newIds.push(newId);
    }
    set(s => ({
      elements: { ...s.elements, ...newEls },
      pages: s.pages.map(p =>
        p.id === currentPageId
          ? { ...p, elementIds: [...p.elementIds, ...newIds] }
          : p
      ),
      selectedIds: newIds,
    }));
    get().saveDesignProject();
  },

  copy: () => {
    const { selectedIds, elements } = get();
    const copied = selectedIds.map(id => elements[id]).filter(Boolean);
    set({ clipboard: copied });
  },

  cut: () => {
    const { selectedIds } = get();
    if (!selectedIds.length) return;
    get().copy();
    get().deleteElements(selectedIds);
  },

  paste: () => {
    const { clipboard, currentPageId } = get();
    if (!clipboard.length || !currentPageId) return;
    get().snapshot();

    const newEls: Record<string, DesignElement> = {};
    const newIds: string[] = [];

    for (const el of clipboard) {
      const newId = uid();
      newEls[newId] = {
        ...el,
        id: newId,
        x: el.x + 20,
        y: el.y + 20,
      };
      newIds.push(newId);
    }

    set(s => ({
      elements: { ...s.elements, ...newEls },
      pages: s.pages.map(p =>
        p.id === currentPageId
          ? { ...p, elementIds: [...p.elementIds, ...newIds] }
          : p
      ),
      selectedIds: newIds,
    }));
    get().saveDesignProject();
  },

  copyProperties: () => {
    const { selectedIds, elements } = get();
    if (selectedIds.length !== 1) return;
    const el = elements[selectedIds[0]];
    if (!el) return;
    const copiedStyle = {
      fills: JSON.parse(JSON.stringify(el.fills)),
      strokes: JSON.parse(JSON.stringify(el.strokes)),
      effects: JSON.parse(JSON.stringify(el.effects)),
      opacity: el.opacity,
      blendMode: el.blendMode,
      ...(el.type === 'text' ? { textStyle: JSON.parse(JSON.stringify((el as any).textStyle)) } : {})
    };
    set({ copiedStyle });
  },

  pasteProperties: () => {
    const { selectedIds, copiedStyle } = get();
    if (!selectedIds.length || !copiedStyle) return;
    get().snapshot();
    selectedIds.forEach(id => {
      const el = get().elements[id];
      if (!el || el.locked) return;
      const updates: any = {
        fills: JSON.parse(JSON.stringify(copiedStyle.fills)),
        strokes: JSON.parse(JSON.stringify(copiedStyle.strokes)),
        effects: JSON.parse(JSON.stringify(copiedStyle.effects)),
        opacity: copiedStyle.opacity,
        blendMode: copiedStyle.blendMode,
      };
      if (el.type === 'text' && copiedStyle.textStyle) {
        updates.textStyle = JSON.parse(JSON.stringify(copiedStyle.textStyle));
      }
      get().updateElement(id, updates);
    });
  },

  zoomToSelection: (containerW, containerH) => {
    const bounds = get().getSelectionBounds();
    if (!bounds) {
      get().fitToScreen(containerW, containerH);
      return;
    }
    const padding = 60;
    const scaleX = (containerW - padding) / bounds.width;
    const scaleY = (containerH - padding) / bounds.height;
    const zoom = Math.max(0.1, Math.min(10, Math.min(scaleX, scaleY)));
    const panX = containerW / 2 - (bounds.x + bounds.width / 2) * zoom;
    const panY = containerH / 2 - (bounds.y + bounds.height / 2) * zoom;
    set({ zoom, panX, panY });
  },

  frameSelection: () => {
    const { selectedIds } = get();
    if (selectedIds.length > 0) {
      get().groupElements(selectedIds);
    }
  },

  toggleUI: () => {
    const { leftPanelVisible, rightPanelVisible } = get();
    const visible = leftPanelVisible || rightPanelVisible;
    set({ leftPanelVisible: !visible, rightPanelVisible: !visible });
  },

  // ── Selection ─────────────────────────────────────────────────────────────

  setSelectedIds: (ids) => set({ selectedIds: ids, artboardSelected: ids.length > 0 ? false : get().artboardSelected }),
  setHoveredId: (id) => set({ hoveredId: id }),
  setArtboardSelected: (selected) => set({ artboardSelected: selected, selectedIds: selected ? [] : get().selectedIds }),

  alignElements: (alignment) => {
    const { selectedIds, elements, currentPageId, pages } = get();
    if (!selectedIds.length || !currentPageId) return;
    get().snapshot();

    const page = pages.find(p => p.id === currentPageId);
    if (!page) return;

    const bounds = get().getSelectionBounds();
    if (!bounds) return;

    const usePage = selectedIds.length === 1;
    const targetX = usePage ? 0 : bounds.x;
    const targetY = usePage ? 0 : bounds.y;
    const targetW = usePage ? page.width : bounds.width;
    const targetH = usePage ? page.height : bounds.height;

    selectedIds.forEach(id => {
      const el = elements[id];
      if (!el || el.locked) return;

      let x = el.x;
      let y = el.y;

      if (alignment === 'left') x = targetX;
      else if (alignment === 'center') x = targetX + (targetW - el.width) / 2;
      else if (alignment === 'right') x = targetX + targetW - el.width;
      else if (alignment === 'top') y = targetY;
      else if (alignment === 'middle') y = targetY + (targetH - el.height) / 2;
      else if (alignment === 'bottom') y = targetY + targetH - el.height;

      get().updateElement(id, { x, y });
    });
  },

  distributeElements: (axis) => {
    const { selectedIds, elements } = get();
    if (selectedIds.length < 3) return;
    get().snapshot();

    const els = selectedIds.map(id => elements[id]).filter(Boolean).filter(el => !el.locked);
    if (els.length < 3) return;

    if (axis === 'h') {
      els.sort((a, b) => a.x - b.x);
      const first = els[0];
      const last = els[els.length - 1];
      const totalWidth = last.x + last.width - first.x;
      const combinedElWidth = els.reduce((sum, el) => sum + el.width, 0);
      const remainingSpace = totalWidth - combinedElWidth;
      const gap = remainingSpace / (els.length - 1);

      let currentX = first.x;
      for (let i = 0; i < els.length; i++) {
        get().updateElement(els[i].id, { x: currentX });
        currentX += els[i].width + gap;
      }
    } else {
      els.sort((a, b) => a.y - b.y);
      const first = els[0];
      const last = els[els.length - 1];
      const totalHeight = last.y + last.height - first.y;
      const combinedElHeight = els.reduce((sum, el) => sum + el.height, 0);
      const remainingSpace = totalHeight - combinedElHeight;
      const gap = remainingSpace / (els.length - 1);

      let currentY = first.y;
      for (let i = 0; i < els.length; i++) {
        get().updateElement(els[i].id, { y: currentY });
        currentY += els[i].height + gap;
      }
    }
  },

  flipElement: (id, axis) => {
    const el = get().elements[id];
    if (!el || el.locked) return;
    get().snapshot();
    if (axis === 'h') {
      get().updateElement(id, { flipHorizontal: !(el as any).flipHorizontal } as any);
    } else {
      get().updateElement(id, { flipVertical: !(el as any).flipVertical } as any);
    }
  },

  // ── Layer Order ───────────────────────────────────────────────────────────

  bringForward: (id) => {
    const { currentPageId } = get();
    if (!currentPageId) return;
    set(s => ({
      pages: s.pages.map(p => {
        if (p.id !== currentPageId) return p;
        const idx = p.elementIds.indexOf(id);
        if (idx < p.elementIds.length - 1) {
          const ids = [...p.elementIds];
          [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
          return { ...p, elementIds: ids };
        }
        return p;
      }),
    }));
  },

  sendBackward: (id) => {
    const { currentPageId } = get();
    if (!currentPageId) return;
    set(s => ({
      pages: s.pages.map(p => {
        if (p.id !== currentPageId) return p;
        const idx = p.elementIds.indexOf(id);
        if (idx > 0) {
          const ids = [...p.elementIds];
          [ids[idx], ids[idx - 1]] = [ids[idx - 1], ids[idx]];
          return { ...p, elementIds: ids };
        }
        return p;
      }),
    }));
  },

  bringToFront: (id) => {
    const { currentPageId } = get();
    if (!currentPageId) return;
    set(s => ({
      pages: s.pages.map(p =>
        p.id !== currentPageId ? p : {
          ...p,
          elementIds: [...p.elementIds.filter(i => i !== id), id],
        }
      ),
    }));
  },

  sendToBack: (id) => {
    const { currentPageId } = get();
    if (!currentPageId) return;
    set(s => ({
      pages: s.pages.map(p =>
        p.id !== currentPageId ? p : {
          ...p,
          elementIds: [id, ...p.elementIds.filter(i => i !== id)],
        }
      ),
    }));
  },

  // ── Group / Ungroup ───────────────────────────────────────────────────────

  groupElements: (ids) => {
    if (ids.length < 2) return;
    get().snapshot();
    const { currentPageId, elements } = get();
    if (!currentPageId) return;
    const groupEls = ids.map(id => elements[id]).filter(Boolean);
    const bounds = getBounds(groupEls) ?? { x: 0, y: 0, width: 100, height: 100 };
    const groupId = uid();
    const group: DesignElement = {
      id: groupId, type: 'group', name: 'Group',
      x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
      rotation: 0, opacity: 1, visible: true, locked: false,
      fills: [], strokes: [], effects: [], blendMode: 'normal',
      children: ids,
    };
    const idsSet = new Set(ids);
    set(s => ({
      elements: { ...s.elements, [groupId]: group },
      pages: s.pages.map(p =>
        p.id !== currentPageId ? p : {
          ...p,
          elementIds: [...p.elementIds.filter(i => !idsSet.has(i)), groupId],
        }
      ),
      selectedIds: [groupId],
    }));
    get().saveDesignProject();
  },

  ungroupElements: (id) => {
    get().snapshot();
    const { currentPageId, elements } = get();
    const group = elements[id];
    if (!group || group.type !== 'group') return;
    const childIds = (group as any).children as string[];
    if (!currentPageId) return;
    set(s => {
      const newEls = { ...s.elements };
      delete newEls[id];
      return {
        elements: newEls,
        pages: s.pages.map(p =>
          p.id !== currentPageId ? p : {
            ...p,
            elementIds: [...p.elementIds.filter(i => i !== id), ...childIds],
          }
        ),
        selectedIds: childIds,
      };
    });
    get().saveDesignProject();
  },

  // ── Tool ─────────────────────────────────────────────────────────────────

  setTool: (tool) => set({ tool }),

  // ── Viewport ─────────────────────────────────────────────────────────────

  setZoom: (zoom) => set({ zoom: Math.max(0.05, Math.min(10, zoom)) }),
  setPan: (panX, panY) => set({ panX, panY }),

  fitToScreen: (containerW, containerH) => {
    const page = get().getCurrentPage();
    if (!page) return;
    const scaleX = (containerW - 80) / page.width;
    const scaleY = (containerH - 80) / page.height;
    const zoom = Math.min(scaleX, scaleY, 1);
    const panX = (containerW - page.width * zoom) / 2;
    const panY = (containerH - page.height * zoom) / 2;
    set({ zoom, panX, panY });
  },

  // ── UI ────────────────────────────────────────────────────────────────────

  setShowGrid: (v) => set({ showGrid: v }),
  setSnapToGrid: (v) => set({ snapToGrid: v }),
  setSnapToElements: (v) => set({ snapToElements: v }),

  // ── Path / Pen Actions ───────────────────────────────────────────────────

  setActivePathId: (id) => set({ activePathId: id }),
  setEditingPathId: (id) => set({ editingPathId: id, selectedNodeIndices: [] }),
  setSelectedNodeIndices: (indices) => set({ selectedNodeIndices: indices }),

  addPathNode: (wx, wy) => {
    const { activePathId, elements, currentPageId } = get();
    get().snapshot();

    if (activePathId && elements[activePathId]) {
      // Append node to existing drawing path
      const path = elements[activePathId] as PathElement;
      // convert global coords to relative coordinate space of the path
      const nodeX = wx - path.x;
      const nodeY = wy - path.y;
      
      const newNodes = [...path.nodes, { x: nodeX, y: nodeY, type: 'corner' as const }];
      
      // Update dimensions dynamically to fit all nodes
      let minX = 0, minY = 0, maxX = 0, maxY = 0;
      newNodes.forEach(n => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x);
        maxY = Math.max(maxY, n.y);
      });
      
      // If minX or minY shifted below 0, shift all nodes and adjust path x/y
      let finalNodes = newNodes;
      let shiftX = 0, shiftY = 0;
      if (minX < 0) { shiftX = -minX; minX = 0; }
      if (minY < 0) { shiftY = -minY; minY = 0; }
      if (shiftX > 0 || shiftY > 0) {
        finalNodes = newNodes.map(n => ({ ...n, x: n.x + shiftX, y: n.y + shiftY }));
      }

      set(s => ({
        elements: {
          ...s.elements,
          [activePathId]: {
            ...path,
            x: path.x - shiftX,
            y: path.y - shiftY,
            width: Math.max(1, maxX - minX),
            height: Math.max(1, maxY - minY),
            nodes: finalNodes
          } as PathElement
        }
      }));
    } else {
      // Create new PathElement
      const newId = uid();
      const pathEl: PathElement = {
        id: newId,
        name: 'Vector Path',
        type: 'path',
        x: wx,
        y: wy,
        width: 1,
        height: 1,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        fills: [],
        strokes: [{ color: '#7C3AED', opacity: 1, width: 2, style: 'solid', position: 'center' }],
        effects: [],
        blendMode: 'normal',
        nodes: [{ x: 0, y: 0, type: 'corner' }],
        closed: false
      };

      set(s => ({
        elements: { ...s.elements, [newId]: pathEl },
        pages: s.pages.map(p =>
          p.id === currentPageId ? { ...p, elementIds: [...p.elementIds, newId] } : p
        ),
        activePathId: newId,
        selectedIds: [newId]
      }));
    }
    get().saveDesignProject();
  },

  updatePathNode: (index, nodeUpdates) => {
    const { activePathId, editingPathId, elements } = get();
    const targetId = activePathId || editingPathId;
    if (!targetId || !elements[targetId]) return;

    const path = elements[targetId] as PathElement;
    const newNodes = [...path.nodes];
    if (newNodes[index]) {
      newNodes[index] = { ...newNodes[index], ...nodeUpdates };
    }

    set(s => ({
      elements: {
        ...s.elements,
        [targetId]: {
          ...path,
          nodes: newNodes
        } as PathElement
      }
    }));
    get().saveDesignProject();
  },

  closeActivePath: () => {
    const { activePathId, elements } = get();
    if (activePathId && elements[activePathId]) {
      const path = elements[activePathId] as PathElement;
      // If we have at least 2 nodes, we can close it
      const closed = path.nodes.length > 1;
      
      // Auto-fill path when closed if it doesn't have fills
      const fills = closed ? [{ type: 'solid' as const, color: '#7C3AED', opacity: 0.5 }] : [];

      set(s => ({
        elements: {
          ...s.elements,
          [activePathId]: { ...path, closed, fills } as PathElement
        },
        activePathId: null,
        tool: 'select'
      }));
    }
    get().saveDesignProject();
  },

  booleanOperation: (opType) => {
    const { selectedIds, elements, currentPageId, pages } = get();
    if (selectedIds.length < 2 || !currentPageId) return;

    get().snapshot();
    const els = selectedIds.map(id => elements[id]).filter(Boolean);
    const newPath = performBooleanOp(opType, els);

    if (newPath) {
      const idsSet = new Set(selectedIds);
      set(s => {
        const nextElements = { ...s.elements };
        selectedIds.forEach(id => delete nextElements[id]);
        nextElements[newPath.id] = newPath;

        return {
          elements: nextElements,
          pages: s.pages.map(p =>
            p.id === currentPageId
              ? { ...p, elementIds: [...p.elementIds.filter(id => !idsSet.has(id)), newPath.id] }
              : p
          ),
          selectedIds: [newPath.id]
        };
      });
      get().saveDesignProject();
    }
  },

  // ── History ───────────────────────────────────────────────────────────────

  snapshot: () => {
    const { pages, elements, past } = get();
    set({ past: [...past.slice(-49), { pages, elements }], future: [] });
  },

  undo: () => {
    const { past, pages, elements, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({
      past: past.slice(0, -1),
      future: [{ pages, elements }, ...future],
      pages: prev.pages,
      elements: prev.elements,
    });
    get().saveDesignProject();
  },

  redo: () => {
    const { future, pages, elements, past } = get();
    if (!future.length) return;
    const next = future[0];
    set({
      future: future.slice(1),
      past: [...past, { pages, elements }],
      pages: next.pages,
      elements: next.elements,
    });
    get().saveDesignProject();
  },

  // ── Computed ──────────────────────────────────────────────────────────────

  getCurrentPage: () => {
    const { pages, currentPageId } = get();
    return pages.find(p => p.id === currentPageId) ?? null;
  },

  getPageElements: () => {
    const page = get().getCurrentPage();
    if (!page) return [];
    return page.elementIds.map(id => get().elements[id]).filter(Boolean) as DesignElement[];
  },

  getSelectionBounds: () => {
    const { selectedIds, elements } = get();
    const els = selectedIds.map(id => elements[id]).filter(Boolean) as DesignElement[];
    return getBounds(els);
  },
}));
