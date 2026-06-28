import { create } from 'zustand';
import { db, type Project, type TimelineTrack, type TimelineClip } from '../lib/db';

export interface WatermarkRegion {
  x: number; // px in video space
  y: number;
  w: number;
  h: number;
}

interface EditorState {
  currentProjectId: string | null;
  project: Project | null;
  currentTime: number; // in milliseconds
  isPlaying: boolean;
  selectedClipId: string | null;
  selectedClipIds: string[];
  zoom: number; // pixels per second
  upscaleEnabled: boolean;

  // Watermark removal
  watermarkRegion: WatermarkRegion | null;
  watermarkDrawMode: boolean;
  
  // History states
  past: string[];
  future: string[];
  
  // Actions
  loadProject: (projectId: string) => Promise<void>;
  closeProject: () => void;
  setCurrentTime: (timeMs: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setSelectedClipId: (clipId: string | null) => void;
  setSelectedClipIds: (clipIds: string[]) => void;
  setZoom: (zoom: number) => void;
  setUpscaleEnabled: (enabled: boolean) => void;
  setWatermarkRegion: (region: WatermarkRegion | null) => void;
  setWatermarkDrawMode: (active: boolean) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  
  // Timeline Mutations
  updateTracks: (tracks: TimelineTrack[], skipHistory?: boolean) => Promise<void>;
  addClip: (trackId: string, clip: Omit<TimelineClip, 'trackId'>) => Promise<void>;
  removeClip: (clipId: string) => Promise<void>;
  splitClipAtPlayhead: () => Promise<void>;
  updateClip: (clipId: string, updates: Partial<TimelineClip>) => Promise<void>;
  addTrack: (type: TimelineTrack['type']) => Promise<void>;
  removeTrack: (trackId: string) => Promise<void>;
  reorderTrack: (trackId: string, direction: 'up' | 'down') => Promise<void>;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  currentProjectId: null,
  project: null,
  currentTime: 0,
  isPlaying: false,
  selectedClipId: null,
  selectedClipIds: [],
  zoom: 50, // 50 pixels = 1 second (1000ms)
  upscaleEnabled: false,

  // Watermark removal
  watermarkRegion: null,
  watermarkDrawMode: false,
  
  // History initial state
  past: [],
  future: [],

  loadProject: async (projectId: string) => {
    const proj = await db.projects.get(projectId);
    if (proj) {
      set({ 
        currentProjectId: projectId, 
        project: proj, 
        currentTime: 0, 
        isPlaying: false, 
        selectedClipId: null,
        selectedClipIds: [],
        past: [],
        future: []
      });
    } else {
      console.error(`Project ${projectId} not found in IndexedDB.`);
    }
  },

  closeProject: () => {
    set({ 
      currentProjectId: null, 
      project: null, 
      currentTime: 0, 
      isPlaying: false, 
      selectedClipId: null,
      selectedClipIds: [],
      past: [],
      future: []
    });
  },

  setCurrentTime: (timeMs: number) => {
    const newTime = Math.max(0, timeMs);
    set({ currentTime: newTime });
  },

  setIsPlaying: (playing: boolean) => {
    set({ isPlaying: playing });
  },

  setSelectedClipId: (clipId: string | null) => {
    set({ 
      selectedClipId: clipId,
      selectedClipIds: clipId ? [clipId] : []
    });
  },

  setSelectedClipIds: (clipIds: string[]) => {
    set({
      selectedClipIds: clipIds,
      selectedClipId: clipIds.length > 0 ? clipIds[clipIds.length - 1] : null
    });
  },

  setZoom: (zoom: number) => {
    set({ zoom: Math.max(10, Math.min(zoom, 500)) }); // constraint zoom between 10px/s and 500px/s
  },

  setUpscaleEnabled: (enabled: boolean) => {
    set({ upscaleEnabled: enabled });
  },

  setWatermarkRegion: (region: WatermarkRegion | null) => {
    set({ watermarkRegion: region });
  },

  setWatermarkDrawMode: (active: boolean) => {
    set({ watermarkDrawMode: active });
    if (!active) return;
    // Clear any previous region when entering draw mode
    set({ watermarkRegion: null });
  },

  undo: async () => {
    const { past, project, future } = get();
    if (past.length === 0 || !project) return;

    const previousSerialized = past[past.length - 1];
    const previous = JSON.parse(previousSerialized) as Project;
    const remainingPast = past.slice(0, past.length - 1);
    const currentSerialized = JSON.stringify(project);

    set({
      project: previous,
      past: remainingPast,
      future: [currentSerialized, ...future],
      selectedClipId: null
    });

    await db.projects.put(previous);
  },

  redo: async () => {
    const { future, project, past } = get();
    if (future.length === 0 || !project) return;

    const nextSerialized = future[0];
    const next = JSON.parse(nextSerialized) as Project;
    const remainingFuture = future.slice(1);
    const currentSerialized = JSON.stringify(project);

    set({
      project: next,
      past: [...past, currentSerialized],
      future: remainingFuture,
      selectedClipId: null
    });

    await db.projects.put(next);
  },

  updateTracks: async (tracks: TimelineTrack[], skipHistory = false) => {
    const { project, past } = get();
    if (!project) return;

    const updatedProject = {
      ...project,
      tracks,
      updatedAt: new Date()
    };

    if (skipHistory) {
      set({ project: updatedProject });
    } else {
      const currentSerialized = JSON.stringify(project);
      set({
        project: updatedProject,
        past: [...past, currentSerialized].slice(-50), // max 50 items
        future: [] // clear redo history on new action
      });
      await db.projects.put(updatedProject);
    }
  },

  addClip: async (trackId: string, clipData: Omit<TimelineClip, 'trackId'>) => {
    const { project } = get();
    if (!project) return;

    const tracks = project.tracks.map(t => {
      if (t.id === trackId) {
        const fullClip: TimelineClip = { ...clipData, trackId };
        return {
          ...t,
          clips: [...t.clips, fullClip].sort((a, b) => a.positionMs - b.positionMs)
        };
      }
      return t;
    });

    await get().updateTracks(tracks);
  },

  removeClip: async (clipId: string) => {
    const { project, selectedClipId } = get();
    if (!project) return;

    const tracks = project.tracks.map(t => ({
      ...t,
      clips: t.clips.filter(c => c.id !== clipId)
    }));

    const nextSelected = selectedClipId === clipId ? null : selectedClipId;
    const nextSelectedIds = get().selectedClipIds.filter(id => id !== clipId);
    set({ 
      selectedClipId: nextSelected,
      selectedClipIds: nextSelectedIds
    });
    await get().updateTracks(tracks);
  },

  splitClipAtPlayhead: async () => {
    const { project, currentTime } = get();
    if (!project) return;

    let targetClip: TimelineClip | null = null;
    let targetTrackId = '';

    // Find the clip under the playhead
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        const clipEnd = clip.positionMs + clip.durationMs;
        if (currentTime > clip.positionMs && currentTime < clipEnd) {
          targetClip = clip;
          targetTrackId = track.id;
          break;
        }
      }
      if (targetClip) break;
    }

    if (!targetClip) return;

    // Calculate split dimensions
    const splitOffsetMs = currentTime - targetClip.positionMs;
    
    // First clip segment
    const clipA: TimelineClip = {
      ...targetClip,
      durationMs: splitOffsetMs,
      trimEndMs: targetClip.trimStartMs + splitOffsetMs
    };

    // Second clip segment
    const clipB: TimelineClip = {
      ...targetClip,
      id: Math.random().toString(36).substring(2, 9), // new ID
      positionMs: currentTime,
      trimStartMs: targetClip.trimStartMs + splitOffsetMs,
      durationMs: targetClip.durationMs - splitOffsetMs
    };

    const tracks = project.tracks.map(t => {
      if (t.id === targetTrackId) {
        // Replace targetClip with clipA, insert clipB
        const filtered = t.clips.filter(c => c.id !== targetClip!.id);
        return {
          ...t,
          clips: [...filtered, clipA, clipB].sort((a, b) => a.positionMs - b.positionMs)
        };
      }
      return t;
    });

    await get().updateTracks(tracks);
    set({ selectedClipId: clipB.id }); // select the second split clip
  },

  updateClip: async (clipId: string, updates: Partial<TimelineClip>, skipHistory = false) => {
    const { project } = get();
    if (!project) return;

    const tracks = project.tracks.map(t => {
      const hasClip = t.clips.some(c => c.id === clipId);
      if (hasClip) {
        return {
          ...t,
          clips: t.clips.map(c => c.id === clipId ? { ...c, ...updates } : c)
        };
      }
      return t;
    });

    await get().updateTracks(tracks, skipHistory);
  },

  addTrack: async (type: TimelineTrack['type']) => {
    const { project } = get();
    if (!project) return;
    const typeLabels: Record<string, string> = {
      video: 'Video', audio: 'Audio', text: 'Text', image: 'Image'
    };
    const existingCount = project.tracks.filter(t => t.type === type).length;
    const newTrack: TimelineTrack = {
      id: Math.random().toString(36).substring(2, 9),
      name: `${typeLabels[type]} ${existingCount + 1}`,
      type,
      clips: [],
      locked: false,
      muted: false,
      hidden: false,
    };
    await get().updateTracks([...project.tracks, newTrack]);
  },

  removeTrack: async (trackId: string) => {
    const { project } = get();
    if (!project) return;
    const tracks = project.tracks.filter(t => t.id !== trackId);
    await get().updateTracks(tracks);
  },

  reorderTrack: async (trackId: string, direction: 'up' | 'down') => {
    const { project } = get();
    if (!project) return;
    const tracks = [...project.tracks];
    const idx = tracks.findIndex(t => t.id === trackId);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= tracks.length) return;
    [tracks[idx], tracks[swapIdx]] = [tracks[swapIdx], tracks[idx]];
    await get().updateTracks(tracks);
  },
}));
