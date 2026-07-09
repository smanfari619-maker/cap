import { useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';

/**
 * Global Keyboard Shortcut listener hook.
 * Maps keyboard keypress actions to editor store actions.
 * Excludes inputs, textareas, and contenteditable nodes from triggers.
 */
export function useHotkeys() {
  const project = useEditorStore(state => state.project);
  const isPlaying = useEditorStore(state => state.isPlaying);
  const setIsPlaying = useEditorStore(state => state.setIsPlaying);
  const currentTime = useEditorStore(state => state.currentTime);
  const setCurrentTime = useEditorStore(state => state.setCurrentTime);
  const zoom = useEditorStore(state => state.zoom);
  const setZoom = useEditorStore(state => state.setZoom);
  const selectedClipId = useEditorStore(state => state.selectedClipId);
  const selectedClipIds = useEditorStore(state => state.selectedClipIds);
  const setSelectedClipId = useEditorStore(state => state.setSelectedClipId);
  const setSelectedClipIds = useEditorStore(state => state.setSelectedClipIds);
  const toolMode = useEditorStore(state => state.toolMode);
  const setToolMode = useEditorStore(state => state.setToolMode);
  const removeClip = useEditorStore(state => state.removeClip);
  const splitClipAtPlayhead = useEditorStore(state => state.splitClipAtPlayhead);
  const addClip = useEditorStore(state => state.addClip);
  const updateMarkers = useEditorStore(state => state.updateMarkers);
  const undo = useEditorStore(state => state.undo);
  const redo = useEditorStore(state => state.redo);
  const playbackSpeed = useEditorStore(state => state.playbackSpeed);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.getAttribute('contenteditable') === 'true'
      ) {
        return;
      }

      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      // Undo / Redo
      if (isCmdOrCtrl && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if (isCmdOrCtrl && e.key === 'y') {
        e.preventDefault();
        redo();
      }
      
      // Tool Selection (V for Select, C for Razor)
      else if (!isCmdOrCtrl && e.key.toLowerCase() === 'v') {
        setToolMode('select');
      } else if (!isCmdOrCtrl && e.key.toLowerCase() === 'c') {
        setToolMode('razor');
      }

      // Add Marker (M)
      else if (!isCmdOrCtrl && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        if (!project) return;
        const newMarker = {
          id: Math.random().toString(36).substring(2, 9),
          timeMs: currentTime,
          color: 'blue' as const,
          note: ''
        };
        const currentMarkers = project.markers || [];
        updateMarkers([...currentMarkers, newMarker]);
      }

      // Play/Pause (Space)
      else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
      }

      // Delete selected clips (Delete / Backspace)
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedClipIds.length > 0) {
        e.preventDefault();
        const isRipple = e.shiftKey;
        selectedClipIds.forEach(id => removeClip(id, isRipple));
      }

      // Select All (Ctrl/Cmd + A)
      else if (isCmdOrCtrl && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        if (!project) return;
        const allClipIds = project.tracks.flatMap(t => t.clips.map(c => c.id));
        setSelectedClipIds(allClipIds);
      }

      // Split at playhead (S)
      else if ((e.key === 's' || e.key === 'S') && !isCmdOrCtrl) {
        e.preventDefault();
        splitClipAtPlayhead();
      }

      // Arrow scrub: frame-step 33ms, shift = 1s
      else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentTime(Math.max(0, currentTime - (e.shiftKey ? 1000 : 33)));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentTime(currentTime + (e.shiftKey ? 1000 : 33));
      }

      // Bracket zoom [ and ]
      else if (e.key === '[') {
        e.preventDefault();
        setZoom(Math.max(10, zoom - 10));
      } else if (e.key === ']') {
        e.preventDefault();
        setZoom(Math.min(500, zoom + 10));
      }

      // Shift+Z: Zoom to fit timeline window
      else if (e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        if (!isCmdOrCtrl) {
          e.preventDefault();
          if (!project) return;
          let maxTime = 10000; // minimum 10s
          project.tracks.forEach(t => {
            t.clips.forEach(c => {
              maxTime = Math.max(maxTime, c.positionMs + c.durationMs);
            });
          });
          const scrollEl = document.querySelector('.timeline-scroll');
          if (scrollEl) {
            const fitZoom = (scrollEl.clientWidth - 40) / (maxTime / 1000);
            setZoom(Math.max(10, Math.min(500, fitZoom)));
          }
        }
      }

      // Home / End playhead navigation
      else if (e.key === 'Home') {
        e.preventDefault();
        setCurrentTime(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        if (!project) return;
        let maxTime = 0;
        project.tracks.forEach(t => {
          t.clips.forEach(c => {
            maxTime = Math.max(maxTime, c.positionMs + c.durationMs);
          });
        });
        setCurrentTime(maxTime);
      }

      // J/K/L Shuttle speed play/reverse control
      else if (!isCmdOrCtrl && !e.altKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        const nextSpeed = playbackSpeed >= 1 ? Math.min(8, playbackSpeed * 2) : 1;
        useEditorStore.setState({ playbackSpeed: nextSpeed });
        setIsPlaying(true);
      }
      else if (!isCmdOrCtrl && !e.altKey && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        const nextSpeed = playbackSpeed <= -1 ? Math.max(-8, playbackSpeed * 2) : -1;
        useEditorStore.setState({ playbackSpeed: nextSpeed });
        setIsPlaying(true);
      }
      else if (!isCmdOrCtrl && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useEditorStore.setState({ playbackSpeed: 1 });
        setIsPlaying(false);
      }

      // Escape deselect
      else if (e.key === 'Escape') {
        setSelectedClipIds([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    project,
    isPlaying,
    setIsPlaying,
    currentTime,
    setCurrentTime,
    zoom,
    setZoom,
    selectedClipId,
    selectedClipIds,
    setSelectedClipId,
    setSelectedClipIds,
    toolMode,
    setToolMode,
    removeClip,
    splitClipAtPlayhead,
    addClip,
    updateMarkers,
    undo,
    redo,
    playbackSpeed
  ]);
}
