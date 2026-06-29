import { create } from 'zustand';
import { db, type Project, type TimelineTrack, type TimelineClip, type TimelineMarker } from '../lib/db';

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
  playbackSpeed: number; // For J/K/L shuttle speeds (1, 2, 4, 8, -1, -2, -4, -8)

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
  updateMarkers: (markers: TimelineMarker[]) => Promise<void>;
}

const clipsOverlap = (a: TimelineClip, b: TimelineClip): boolean => {
  return a.positionMs < b.positionMs + b.durationMs &&
         a.positionMs + a.durationMs > b.positionMs;
};



const resolveTrackCollisions = (tracks: TimelineTrack[]): TimelineTrack[] => {
  let resolvedTracks = [...tracks];
  let hasCollision = true;
  let iterations = 0;
  const maxIterations = 50;

  while (hasCollision && iterations < maxIterations) {
    hasCollision = false;
    iterations++;

    let collisionDetected = false;
    for (const track of resolvedTracks) {
      if (track.locked) continue; // Skip collisions on locked tracks
      const clips = [...track.clips].sort((a, b) => a.positionMs - b.positionMs);

      for (let i = 0; i < clips.length; i++) {
        for (let j = i + 1; j < clips.length; j++) {
          const clipA = clips[i];
          const clipB = clips[j];

          if (clipsOverlap(clipA, clipB)) {
            hasCollision = true;
            collisionDetected = true;

            let targetTrack: TimelineTrack | null = null;
            const sameTypeTracks = resolvedTracks.filter(t => t.type === track.type);
            for (const t of sameTypeTracks) {
              if (t.id === track.id) continue;
              if (t.locked) continue;
              const overlaps = t.clips.some(c => clipsOverlap(c, clipB));
              if (!overlaps) {
                targetTrack = t;
                break;
              }
            }

            if (targetTrack) {
              const targetId = targetTrack.id;
              resolvedTracks = resolvedTracks.map(t => {
                if (t.id === track.id) {
                  return { ...t, clips: t.clips.filter(c => c.id !== clipB.id) };
                }
                if (t.id === targetId) {
                  return {
                    ...t,
                    clips: [...t.clips, { ...clipB, trackId: targetId }].sort((a, b) => a.positionMs - b.positionMs)
                  };
                }
                return t;
              });
            } else {
              const newTrackId = Math.random().toString(36).substring(2, 9);
              const typeLabel = track.type.charAt(0).toUpperCase() + track.type.slice(1);
              const existingCount = sameTypeTracks.length;

              const newTrack: TimelineTrack = {
                id: newTrackId,
                name: `${typeLabel} Track ${existingCount + 1}`,
                type: track.type,
                clips: [{ ...clipB, trackId: newTrackId }],
                locked: false,
                muted: false,
                hidden: false
              };

              if (track.type === 'video' || track.type === 'text') {
                const firstIdx = resolvedTracks.findIndex(t => t.type === track.type);
                resolvedTracks = [
                  ...resolvedTracks.slice(0, firstIdx),
                  newTrack,
                  ...resolvedTracks.slice(firstIdx)
                ];
              } else {
                const lastIdx = resolvedTracks.map(t => t.type).lastIndexOf(track.type);
                resolvedTracks = [
                  ...resolvedTracks.slice(0, lastIdx + 1),
                  newTrack,
                  ...resolvedTracks.slice(lastIdx + 1)
                ];
              }

              resolvedTracks = resolvedTracks.map(t => {
                if (t.id === track.id) {
                  return { ...t, clips: t.clips.filter(c => c.id !== clipB.id) };
                }
                return t;
              });
            }
            break;
          }
        }
        if (collisionDetected) break;
      }
      if (collisionDetected) break;
    }
  }

  return resolvedTracks;
};

const cleanupEmptyTracks = (tracks: TimelineTrack[]): TimelineTrack[] => {
  return tracks;
};

export const useEditorStore = create<EditorState>((set, get) => ({
  currentProjectId: null,
  project: null,
  currentTime: 0,
  isPlaying: false,
  selectedClipId: null,
  selectedClipIds: [],
  zoom: 50, // 50 pixels = 1 second (1000ms)
  upscaleEnabled: false,
  playbackSpeed: 1,

  // Watermark removal
  watermarkRegion: null,
  watermarkDrawMode: false,
  
  // History initial state
  past: [],
  future: [],

  loadProject: async (projectId: string) => {
    const proj = await db.projects.get(projectId);
    if (proj) {
      // Migrate any legacy 'image' track type to 'video' for unified tracks
      const migratedTracks = proj.tracks.map(t => {
        if ((t.type as string) === 'image') {
          return {
            ...t,
            type: 'video' as const,
            name: t.name.replace('Image', 'Video')
          };
        }
        return t;
      });
      const migratedProj = {
        ...proj,
        tracks: migratedTracks
      };
      set({ 
        currentProjectId: projectId, 
        project: migratedProj, 
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

    let processedTracks = tracks;
    if (!skipHistory) {
      const resolved = resolveTrackCollisions(tracks);
      processedTracks = cleanupEmptyTracks(resolved);
    }

    // Ensure all clips have their trackId fields set correctly
    processedTracks = processedTracks.map(t => ({
      ...t,
      clips: t.clips.map(c => c.trackId !== t.id ? { ...c, trackId: t.id } : c)
    }));

    // Auto-sort tracks by type and layer order:
    // 1. Text tracks at the top
    // 2. Image tracks below text
    // 3. Video tracks below image (V3, V2, V1 - descending track numbers)
    // 4. Audio tracks at the bottom (A1, A2... - ascending track numbers)
    const textTracks = processedTracks.filter(t => t.type === 'text');
    const effectTracks = processedTracks.filter(t => t.type === 'effect');
    const imageTracks = processedTracks.filter(t => (t.type as string) === 'image');
    const videoTracks = processedTracks.filter(t => t.type === 'video');
    const audioTracks = processedTracks.filter(t => t.type === 'audio');

    // Group by type to preserve timeline layers, but maintain relative user ordering within each group
    const sortedTracks = [...textTracks, ...effectTracks, ...imageTracks, ...videoTracks, ...audioTracks];

    const updatedProject = {
      ...project,
      tracks: sortedTracks,
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
        const combined = [...t.clips, fullClip];
        
        // Sort: new clip first if positions are equal
        const sorted = combined.sort((a, b) => {
          if (a.positionMs !== b.positionMs) {
            return a.positionMs - b.positionMs;
          }
          if (a.id === fullClip.id) return -1;
          if (b.id === fullClip.id) return 1;
          return 0;
        });

        // Resolve overlaps
        for (let i = 1; i < sorted.length; i++) {
          const prev = sorted[i - 1];
          const curr = sorted[i];
          if (curr.positionMs < prev.positionMs + prev.durationMs) {
            curr.positionMs = prev.positionMs + prev.durationMs;
          }
        }

        return {
          ...t,
          clips: sorted
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
      video: 'Video', audio: 'Audio', text: 'Text', image: 'Image', effect: 'Effects'
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

  updateMarkers: async (markers) => {
    const { project, past } = get();
    if (!project) return;
    const updatedProject = {
      ...project,
      markers,
      updatedAt: new Date()
    };
    const currentSerialized = JSON.stringify(project);
    set({
      project: updatedProject,
      past: [...past, currentSerialized],
      future: []
    });
    await db.projects.put(updatedProject);
  },
}));
