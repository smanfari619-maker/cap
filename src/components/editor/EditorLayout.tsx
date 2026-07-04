import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Edit2, Sparkles, Download, Loader2, CheckCircle2, Film, Music, Type, Smile, Scissors, Languages, Palette, Sliders, Users, Keyboard, Volume2, Timer, X, Trash2, ChevronDown, Zap } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import { db } from '../../lib/db';
import LeftSidebar from './LeftSidebar';
import VideoPreview from './VideoPreview';
import ClipInspector from './ClipInspector';
import Timeline from './Timeline';
import { exportProjectWebCodecs } from '../../lib/webcodec-exporter';
import jellycutLogo from '../../assets/jellycut_logo.svg';
import MobileMediaPicker from '../mobile/MobileMediaPicker';

const tabs = [
  { id: 'media', label: 'Media', icon: Film },
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'stickers', label: 'Stickers', icon: Smile },
  { id: 'effects', label: 'Effects', icon: Sparkles },
  { id: 'transitions', label: 'Transitions', icon: Zap },
  { id: 'captions', label: 'Captions', icon: Languages },
  { id: 'filters', label: 'Filters', icon: Palette },
  { id: 'adjustment', label: 'Adjustment', icon: Sliders },
  { id: 'ai-avatars', label: 'AI Avatars', icon: Users },
];

export default function EditorLayout() {
  const project = useEditorStore(state => state.project);
  const closeProject = useEditorStore(state => state.closeProject);
  const setCurrentTime = useEditorStore(state => state.setCurrentTime);
  const setIsPlaying = useEditorStore(state => state.setIsPlaying);
  const isPlaying = useEditorStore(state => state.isPlaying);
  const zoom = useEditorStore(state => state.zoom);
  const setZoom = useEditorStore(state => state.setZoom);
  const selectedClipId = useEditorStore(state => state.selectedClipId);
  const selectedClipIds = useEditorStore(state => state.selectedClipIds);
  const setSelectedClipId = useEditorStore(state => state.setSelectedClipId);
  const setSelectedClipIds = useEditorStore(state => state.setSelectedClipIds);
  const removeClip = useEditorStore(state => state.removeClip);
  const addClip = useEditorStore(state => state.addClip);
  const addTrack = useEditorStore(state => state.addTrack);
  const splitClipAtPlayhead = useEditorStore(state => state.splitClipAtPlayhead);
  const updateClip = useEditorStore(state => state.updateClip);
  const upscaleEnabled = useEditorStore(state => state.upscaleEnabled);
  const undo = useEditorStore(state => state.undo);
  const redo = useEditorStore(state => state.redo);

  const clipboardClipRef = useRef<any>(null);

  const [activeTab, setActiveTab] = useState<string>('media');
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Mobile layout state variables
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileSheet, setShowMobileSheet] = useState(false);
  const [activeMobileSlider, setActiveMobileSlider] = useState<'volume' | 'speed' | null>(null);
  const [showMobileMediaPicker, setShowMobileMediaPicker] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener('resize', handleResize);

    const handleOpenProperties = () => {
      if (window.innerWidth < 1024) {
        setActiveTab('properties');
        setShowMobileSheet(true);
      }
    };
    window.addEventListener('open-mobile-properties', handleOpenProperties);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('open-mobile-properties', handleOpenProperties);
    };
  }, []);

  // Resizable panel states
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [inspectorWidth, setInspectorWidth] = useState(320);
  const [timelineHeight, setTimelineHeight] = useState(window.innerWidth < 768 ? 200 : 340);
  const [activeDrag, setActiveDrag] = useState<'sidebar' | 'inspector' | 'timeline' | null>(null);

  // Resize Handlers
  const startSidebarResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setActiveDrag('sidebar');
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(0, Math.min(600, moveEvent.clientX));
      setSidebarWidth(newWidth > 50 ? newWidth : 0);
    };
    const handleMouseUp = () => {
      setActiveDrag(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const startInspectorResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setActiveDrag('inspector');
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(0, Math.min(600, window.innerWidth - moveEvent.clientX));
      setInspectorWidth(newWidth > 50 ? newWidth : 0);
    };
    const handleMouseUp = () => {
      setActiveDrag(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const startTimelineResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setActiveDrag('timeline');
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newHeight = Math.max(150, Math.min(600, window.innerHeight - moveEvent.clientY));
      setTimelineHeight(newHeight);
    };
    const handleMouseUp = () => {
      setActiveDrag(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const startTimelineTouchResize = () => {
    setActiveDrag('timeline');
    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length === 0) return;
      const clientY = moveEvent.touches[0].clientY;
      const newHeight = Math.max(120, Math.min(500, window.innerHeight - clientY));
      setTimelineHeight(newHeight);
    };
    const handleTouchEnd = () => {
      setActiveDrag(null);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);
  };

  const applyLayoutPreset = (preset: 'editing' | 'color' | 'audio' | 'media') => {
    if (preset === 'editing') {
      setSidebarWidth(320);
      setInspectorWidth(320);
      setTimelineHeight(340);
    } else if (preset === 'color') {
      setSidebarWidth(0);
      setInspectorWidth(420);
      setTimelineHeight(220);
    } else if (preset === 'audio') {
      setSidebarWidth(200);
      setInspectorWidth(240);
      setTimelineHeight(460);
    } else if (preset === 'media') {
      setSidebarWidth(480);
      setInspectorWidth(0);
      setTimelineHeight(240);
    }
  };

  // Full keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Undo / Redo
      if (isCmdOrCtrl && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) { redo(); } else { undo(); }
      } else if (isCmdOrCtrl && e.key === 'y') {
        e.preventDefault();
        redo();
      }
      // Play/Pause
      else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
      }
      // Delete selected clips
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedClipIds.length > 0) {
        e.preventDefault();
        selectedClipIds.forEach(id => removeClip(id));
      }
      // Select All (Ctrl/Cmd + A)
      else if (isCmdOrCtrl && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        if (!project) return;
        const allClipIds = project.tracks.flatMap(t => t.clips.map(c => c.id));
        setSelectedClipIds(allClipIds);
      }
      // Split at playhead
      else if (e.key === 's' || e.key === 'S') {
        if (!isCmdOrCtrl) { e.preventDefault(); splitClipAtPlayhead(); }
      }
      // Arrow scrub: frame-step 33ms, shift = 1s
      else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentTime(Math.max(0, useEditorStore.getState().currentTime - (e.shiftKey ? 1000 : 33)));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentTime(useEditorStore.getState().currentTime + (e.shiftKey ? 1000 : 33));
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
      // Clipboard Copy (Ctrl/Cmd + C)
      else if (isCmdOrCtrl && (e.key === 'c' || e.key === 'C')) {
        if (selectedClipIds.length > 0) {
          e.preventDefault();
          const target = project?.tracks.flatMap(t => t.clips).find(c => selectedClipIds.includes(c.id));
          if (target) {
            clipboardClipRef.current = target;
          }
        }
      }
      // Clipboard Paste (Ctrl/Cmd + V)
      else if (isCmdOrCtrl && (e.key === 'v' || e.key === 'V')) {
        if (clipboardClipRef.current && project) {
          e.preventDefault();
          const source = clipboardClipRef.current;
          const pasteTrack = project.tracks.find(t => t.type === source.type && !t.locked) || project.tracks.find(t => t.type === source.type);
          if (pasteTrack) {
            const newClipId = Math.random().toString(36).substring(2, 9);
            const pastedClip = {
              ...source,
              id: newClipId,
              positionMs: useEditorStore.getState().currentTime,
              trackId: pasteTrack.id
            };
            addClip(pasteTrack.id, pastedClip);
            setSelectedClipIds([newClipId]);
          }
        }
      }
      // J/K/L Shuttle speed play/reverse control
      else if (!isCmdOrCtrl && !e.altKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        const liveSpeed = useEditorStore.getState().playbackSpeed;
        const nextSpeed = liveSpeed >= 1 ? Math.min(8, liveSpeed * 2) : 1;
        useEditorStore.setState({ playbackSpeed: nextSpeed });
        setIsPlaying(true);
      }
      else if (!isCmdOrCtrl && !e.altKey && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        const liveSpeed = useEditorStore.getState().playbackSpeed;
        const nextSpeed = liveSpeed <= -1 ? Math.max(-8, liveSpeed * 2) : -1;
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
  }, [undo, redo, isPlaying, setIsPlaying, setCurrentTime, zoom, setZoom, selectedClipId, selectedClipIds, setSelectedClipId, setSelectedClipIds, removeClip, addClip, splitClipAtPlayhead, project]);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [projectTitle, setProjectTitle] = useState('');
  
  // Export Modal States
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportBlob, setExportBlob] = useState<Blob | null>(null);
  const [exportResolution, setExportResolution] = useState('1080p');

  const exportCancelledRef = useRef(false);

  // AI upscale state
  const [upscaleMode, setUpscaleMode] = useState<'standard' | 'enhanced' | 'ai'>('standard');
  const [upscaleStage, setUpscaleStage] = useState('');
  const [upscaleStageProgress, setUpscaleStageProgress] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);

  // Advanced export settings
  const [exportFps, setExportFps] = useState<number>(30);
  const [qualityPreset, setQualityPreset] = useState<'low' | 'medium' | 'high'>('medium');
  const [useSystemPicker, setUseSystemPicker] = useState<boolean>(true);

  useEffect(() => {
    if (project) {
      setProjectTitle(project.title);
    }
  }, [project]);

  if (!project) return null;

  const selectedClip = selectedClipId
    ? project.tracks.flatMap((t: any) => t.clips).find((c: any) => c.id === selectedClipId)
    : null;

  const handleSaveTitle = async () => {
    if (!projectTitle.trim()) return;
    setIsEditingTitle(false);
    
    const updated = {
      ...project,
      title: projectTitle.trim(),
      updatedAt: new Date()
    };
    
    useEditorStore.setState({ project: updated });
    await db.projects.put(updated);
  };

  const handleStartExport = async () => {
    setIsExporting(true);
    setExportProgress(0);
    setExportBlob(null);
    setIsPlaying(false);
    setCurrentTime(0);
    exportCancelledRef.current = false;

    try {
      let width = 1920;
      let height = 1080;
      const isPortrait = project.width < project.height;
      const isSquare = project.width === project.height;

      if (exportResolution === '2k') {
        if (isPortrait) {
          width = 1440; height = 2560;
        } else if (isSquare) {
          width = 1440; height = 1440;
        } else {
          width = 2560; height = 1440;
        }
      } else if (exportResolution === '720p') {
        if (isPortrait) {
          width = 720; height = 1280;
        } else if (isSquare) {
          width = 720; height = 720;
        } else {
          width = 1280; height = 720;
        }
      } else if (exportResolution === '480p') {
        if (isPortrait) {
          width = 480; height = 854;
        } else if (isSquare) {
          width = 480; height = 480;
        } else {
          width = 854; height = 480;
        }
      } else { // 1080p
        if (isPortrait) {
          width = 1080; height = 1920;
        } else if (isSquare) {
          width = 1080; height = 1080;
        } else {
          width = 1920; height = 1080;
        }
      }



      // Determine Bitrate based on preset and resolution
      let baseBitrate = 8000000; // 8 Mbps (medium)
      if (qualityPreset === 'low') baseBitrate = 4000000; // 4 Mbps
      if (qualityPreset === 'high') baseBitrate = 16000000; // 16 Mbps
      
      // Scale bitrate for high resolutions
      if (exportResolution === '2k') baseBitrate = Math.round(baseBitrate * 1.8);

      const settings = {
        width:  width,
        height: height,
        fps: exportFps,
        bitrate: baseBitrate,
        upscaleMode: upscaleMode,
        onUpscaleProgress: (stage: string, percent: number) => {
          setUpscaleStage(stage);
          setUpscaleStageProgress(percent);
        },
      };

      // Estimate total frames for ETA display
      let durMs = 0;
      for (const track of project.tracks)
        for (const clip of track.clips)
          durMs = Math.max(durMs, clip.positionMs + clip.durationMs);
      setTotalFrames(Math.ceil((durMs / 1000) * exportFps));
      setCurrentFrame(0);

      const blob = await exportProjectWebCodecs(
        project,
        settings,
        (progress) => {
          setExportProgress(progress);
          // Estimate current frame from progress (15%→85% = frame rendering window)
          if (progress >= 15 && progress <= 85) {
            setCurrentFrame(Math.round(((progress - 15) / 70) * totalFrames));
          }
        },
        () => exportCancelledRef.current
      );

      setExportBlob(blob);
      setIsExporting(false);
    } catch (err: any) {
      console.warn('Export finished or cancelled:', err);
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const handleCancelExport = () => {
    exportCancelledRef.current = true;
    setIsExporting(false);
    setExportProgress(0);
  };

  const handleDownload = async () => {
    if (!exportBlob) return;
    
    const safeTitle = project.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'export';
    const filename = `${safeTitle}_${exportResolution}.mp4`;

    // Try System Native Save Picker first to guarantee file extension/name in sandboxed iframes
    if (useSystemPicker && 'showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: 'MPEG-4 Video File',
            accept: { 'video/mp4': ['.mp4'] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(exportBlob);
        await writable.close();
        return;
      } catch (err: any) {
        // User cancelled picker or permission denied - fallback to link download
        console.warn('[Export] System Picker failed/cancelled, falling back:', err);
      }
    }

    // Fallback: Standard browser programmatic link download
    const url = URL.createObjectURL(exportBlob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.setAttribute('download', filename);
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 2000);
  };

  // Determine global cursor style during active dragging
  let globalCursorClass = '';
  if (activeDrag === 'sidebar' || activeDrag === 'inspector') {
    globalCursorClass = 'cursor-col-resize';
  } else if (activeDrag === 'timeline') {
    globalCursorClass = 'cursor-row-resize';
  }
  return (
    <div className={`flex flex-col h-full bg-[#121214] text-gray-100 font-sans select-none ${globalCursorClass}`}>
      {/* Editor Header */}
      <header className="h-12 border-b border-[#2c2c32] bg-[#18181c] flex items-center justify-between px-4 z-40">
        {/* Left Side: Back & Logo */}
        <div className="flex items-center gap-2 h-full">
          <button
            onClick={closeProject}
            className="p-1.5 rounded hover:bg-[#2a2a30] text-gray-400 hover:text-gray-200 transition"
            title="Back to Dashboard"
          >
            {isMobile ? <X className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
          </button>

          <img src={jellycutLogo} className="h-4 w-auto ml-1 mr-2" alt="Jellycut" />

          {/* Top Tabs Bar (Desktop Only) */}
          {!isMobile && (
            <div className="flex items-center h-full gap-0.5 ml-2 border-l border-[#2c2c32] pl-2">
              {tabs.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex flex-col items-center justify-center px-2.5 h-full transition-all relative ${
                      isActive 
                        ? 'text-sky-400 font-bold' 
                        : 'text-gray-400 hover:bg-[#2a2a30] hover:text-gray-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 mb-0.5" />
                    <span className="text-[8px] uppercase tracking-wider font-medium">{tab.label}</span>
                    {isActive && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-400" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Center: Project Title (Desktop Only) */}
        {!isMobile && (
          <div className="flex items-center gap-1.5">
            {isEditingTitle ? (
              <input
                type="text"
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                autoFocus
                className="bg-[#121214] border border-[#2c2c32] rounded px-2 py-0.5 text-xs text-gray-100 font-semibold focus:outline-none focus:border-sky-500"
              />
            ) : (
              <>
                <h2 className="text-xs font-semibold text-gray-200">{project.title}</h2>
                <button
                  onClick={() => setIsEditingTitle(true)}
                  className="p-0.5 hover:bg-[#2a2a30] text-gray-500 hover:text-gray-350 rounded transition"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        )}

        {/* Right Side: Shortcuts & Export */}
        <div className="flex items-center gap-2">
          {isMobile ? (
            <>
              {/* Mobile resolution label */}
              <button 
                onClick={() => alert("To change output quality, tap Export to access options.")}
                className="flex items-center gap-1 px-2.5 py-1 bg-[#121214] border border-[#2c2c32] rounded text-[10px] text-gray-300 font-semibold"
              >
                <span>1080P</span>
                <ChevronDown className="w-3 h-3 text-gray-550" />
              </button>

              <button
                onClick={() => setShowExportModal(true)}
                className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded transition shadow shadow-sky-600/15"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
            </>
          ) : (
            <>
              {upscaleEnabled && (
                <span className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full border border-sky-950 bg-sky-950/30 text-sky-450 font-semibold select-none animate-pulse">
                  <Sparkles className="w-3 h-3 text-sky-400" />
                  WebGPU ACTIVE
                </span>
              )}

              {/* Workspace Layout Switcher */}
              <div className="flex items-center gap-1 bg-[#202024] border border-[#2c2c32] rounded p-0.5 text-xs mr-2">
                <span className="text-[9px] text-zinc-500 uppercase font-bold px-1.5 select-none">Layout</span>
                {(['editing', 'color', 'audio', 'media'] as const).map(preset => {
                  const isActive = 
                    (preset === 'editing' && sidebarWidth === 320 && inspectorWidth === 320 && timelineHeight === 340) ||
                    (preset === 'color' && sidebarWidth === 0 && inspectorWidth === 420 && timelineHeight === 220) ||
                    (preset === 'audio' && sidebarWidth === 200 && inspectorWidth === 240 && timelineHeight === 460) ||
                    (preset === 'media' && sidebarWidth === 480 && inspectorWidth === 0 && timelineHeight === 240);

                  return (
                    <button
                      key={preset}
                      onClick={() => applyLayoutPreset(preset)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold capitalize transition ${
                        isActive
                          ? 'bg-sky-600 text-white shadow-sm font-bold'
                          : 'text-zinc-400 hover:text-zinc-250 hover:bg-zinc-855'
                      }`}
                    >
                      {preset === 'editing' ? 'Edit' : preset}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setShowShortcutsHelp(true)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-gray-400 hover:text-gray-200 bg-[#2a2a30]/50 border border-[#2c2c32] rounded hover:bg-[#2a2a30] transition"
              >
                <Keyboard className="w-3.5 h-3.5" />
                Shortcuts
              </button>

              <button
                onClick={() => setShowExportModal(true)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded transition shadow shadow-sky-600/15"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
            </>
          )}
        </div>
      </header>

      {/* Editor Content Area */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Left Side: Media & Asset Sidebar (Desktop Only) */}
        {!isMobile && <LeftSidebar activeTab={activeTab} width={sidebarWidth} />}

        {/* Sidebar Resize Handle (Desktop Only) */}
        {!isMobile && (
          <div 
            className={`w-2 hover:w-2 bg-transparent cursor-col-resize transition-all relative flex items-center justify-center group z-35 ${
              activeDrag === 'sidebar' ? 'bg-sky-500/20' : ''
            }`}
            onMouseDown={startSidebarResize}
          >
            <div className={`w-[1px] h-full transition-colors ${
              activeDrag === 'sidebar' ? 'bg-sky-400' : 'bg-[#2c2c32] group-hover:bg-sky-500'
            }`} />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSidebarWidth(sidebarWidth === 0 ? 320 : 0);
              }}
              className="absolute left-1/2 -translate-x-1/2 w-4 h-8 bg-[#202024] hover:bg-[#2c2c30] border border-[#3a3a42] rounded flex items-center justify-center text-[8px] text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-xl z-40"
            >
              {sidebarWidth === 0 ? '▶' : '◀'}
            </button>
          </div>
        )}

        {/* Center: Video Preview & Canvas */}
        <div className="flex-1 flex flex-col min-h-0 bg-[#121214] relative">
          <VideoPreview />
        </div>

        {/* Inspector Resize Handle (Desktop Only) */}
        {!isMobile && (
          <div 
            className={`w-2 hover:w-2 bg-transparent cursor-col-resize transition-all relative flex items-center justify-center group z-35 ${
              activeDrag === 'inspector' ? 'bg-sky-500/20' : ''
            }`}
            onMouseDown={startInspectorResize}
          >
            <div className={`w-[1px] h-full transition-colors ${
              activeDrag === 'inspector' ? 'bg-sky-400' : 'bg-[#2c2c32] group-hover:bg-sky-500'
            }`} />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setInspectorWidth(inspectorWidth === 0 ? 320 : 0);
              }}
              className="absolute left-1/2 -translate-x-1/2 w-4 h-8 bg-[#202024] hover:bg-[#2c2c30] border border-[#3a3a42] rounded flex items-center justify-center text-[8px] text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-xl z-40"
            >
              {inspectorWidth === 0 ? '◀' : '▶'}
            </button>
          </div>
        )}

        {/* Right: Details Inspector (Desktop Only) */}
        {!isMobile && <ClipInspector width={inspectorWidth} />}
      </div>

      {/* Timeline Resize Handle (Desktop & Mobile) */}
      <div 
        className={`h-3 bg-[#121214] border-t border-b border-[#2c2c32] hover:bg-sky-500/20 cursor-row-resize transition-all relative flex items-center justify-center group z-35 shrink-0 ${
          activeDrag === 'timeline' ? 'bg-sky-500/20' : ''
        }`}
        onMouseDown={startTimelineResize}
        onTouchStart={startTimelineTouchResize}
      >
        <div className={`w-full h-[1px] transition-colors ${
          activeDrag === 'timeline' ? 'bg-sky-400' : 'bg-[#2c2c32] group-hover:bg-sky-500'
        }`} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-1 bg-[#3a3a42] rounded-full group-hover:bg-sky-400 transition-colors" />
      </div>

      {/* Bottom Area: Timeline Scrubber */}
      <div className="flex flex-col shrink-0" style={{ height: `${timelineHeight}px` }}>
        <Timeline height={timelineHeight} />
      </div>

      {/* Mobile Toolbar (Mobile Only) */}
      {isMobile && (
        <div className="bg-[#18181c] border-t border-[#2c2c32] py-2 px-3 flex justify-between items-center z-40 safe-bottom-padding overflow-x-auto scrollbar-hide shrink-0">
          {selectedClipId ? (
            /* Clip Specific actions when clip is selected */
            <div className="flex justify-between items-center w-full min-w-max gap-8 px-1">
              <button 
                onClick={() => { setSelectedClipId(null); setSelectedClipIds([]); }}
                className="flex flex-col items-center gap-1 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              >
                <X className="w-4 h-4 text-zinc-450" />
                <span className="text-[8px] font-bold">Deselect</span>
              </button>
              <button 
                onClick={() => splitClipAtPlayhead()}
                className="flex flex-col items-center gap-1 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              >
                <Scissors className="w-4 h-4" />
                <span className="text-[8px] font-bold">Split</span>
              </button>
              <button 
                onClick={() => setActiveMobileSlider(activeMobileSlider === 'speed' ? null : 'speed')}
                className={`flex flex-col items-center gap-1 transition cursor-pointer ${activeMobileSlider === 'speed' ? 'text-sky-400' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                <Timer className="w-4 h-4" />
                <span className="text-[8px] font-bold">Speed</span>
              </button>
              <button 
                onClick={() => setActiveMobileSlider(activeMobileSlider === 'volume' ? null : 'volume')}
                className={`flex flex-col items-center gap-1 transition cursor-pointer ${activeMobileSlider === 'volume' ? 'text-sky-400' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                <Volume2 className="w-4 h-4" />
                <span className="text-[8px] font-bold">Volume</span>
              </button>
              <button 
                onClick={() => { setActiveTab('properties'); setShowMobileSheet(true); }}
                className="flex flex-col items-center gap-1 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              >
                <Sliders className="w-4 h-4 text-sky-455" />
                <span className="text-[8px] font-bold">Properties</span>
              </button>
              <button 
                onClick={() => { setActiveTab('effects'); setShowMobileSheet(true); }}
                className="flex flex-col items-center gap-1 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span className="text-[8px] font-bold">Effects</span>
              </button>
              <button 
                onClick={() => { setActiveTab('filters'); setShowMobileSheet(true); }}
                className="flex flex-col items-center gap-1 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              >
                <Palette className="w-4 h-4" />
                <span className="text-[8px] font-bold">Filters</span>
              </button>
              <button 
                onClick={() => { setActiveTab('transitions'); setShowMobileSheet(true); }}
                className="flex flex-col items-center gap-1 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              >
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="text-[8px] font-bold">Transitions</span>
              </button>
              <button 
                onClick={() => { removeClip(selectedClipId); setSelectedClipId(null); }}
                className="flex flex-col items-center gap-1 text-red-400 hover:text-red-300 transition cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-[8px] font-bold">Delete</span>
              </button>
            </div>
          ) : (
            /* General tabs when no clip is selected */
            <div className="flex justify-between items-center w-full min-w-max gap-8 px-1">
              <button 
                onClick={() => setShowMobileMediaPicker(true)}
                className="flex flex-col items-center gap-1 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              >
                <Film className="w-4 h-4" />
                <span className="text-[8px] font-bold">Media</span>
              </button>
              <button 
                onClick={() => { setActiveTab('audio'); setShowMobileSheet(true); }}
                className="flex flex-col items-center gap-1 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              >
                <Music className="w-4 h-4" />
                <span className="text-[8px] font-bold">Audio</span>
              </button>
              <button 
                onClick={() => { setActiveTab('text'); setShowMobileSheet(true); }}
                className="flex flex-col items-center gap-1 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              >
                <Type className="w-4 h-4" />
                <span className="text-[8px] font-bold">Text</span>
              </button>
              <button 
                onClick={() => { setActiveTab('stickers'); setShowMobileSheet(true); }}
                className="flex flex-col items-center gap-1 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              >
                <Smile className="w-4 h-4" />
                <span className="text-[8px] font-bold">Stickers</span>
              </button>
              <button 
                onClick={() => { setActiveTab('effects'); setShowMobileSheet(true); }}
                className="flex flex-col items-center gap-1 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span className="text-[8px] font-bold">Effects</span>
              </button>
              <button 
                onClick={() => { setActiveTab('transitions'); setShowMobileSheet(true); }}
                className="flex flex-col items-center gap-1 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              >
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="text-[8px] font-bold">Transitions</span>
              </button>
              <button 
                onClick={() => { setActiveTab('captions'); setShowMobileSheet(true); }}
                className="flex flex-col items-center gap-1 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              >
                <Languages className="w-4 h-4" />
                <span className="text-[8px] font-bold">Captions</span>
              </button>
              <button 
                onClick={() => { setActiveTab('filters'); setShowMobileSheet(true); }}
                className="flex flex-col items-center gap-1 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              >
                <Palette className="w-4 h-4" />
                <span className="text-[8px] font-bold">Filters</span>
              </button>
              <button 
                onClick={() => { setActiveTab('adjustment'); setShowMobileSheet(true); }}
                className="flex flex-col items-center gap-1 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              >
                <Sliders className="w-4 h-4" />
                <span className="text-[8px] font-bold">Adjust</span>
              </button>
              <button 
                onClick={() => { setActiveTab('ai-avatars'); setShowMobileSheet(true); }}
                className="flex flex-col items-center gap-1 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              >
                <Users className="w-4 h-4" />
                <span className="text-[8px] font-bold">AI Avatars</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mobile Slide-Up Bottom Sheet (Library Tabs) */}
      {isMobile && showMobileSheet && (
        <div className="fixed inset-0 z-50 bg-black/60 flex flex-col justify-end">
          <div className="bg-[#18181c] border-t border-[#2c2c32] rounded-t-2xl h-[65vh] flex flex-col overflow-hidden animate-slide-up">
            <div className="flex justify-between items-center px-4 py-3 border-b border-[#2c2c32] bg-[#18181c] shrink-0">
              <span className="text-xs font-bold text-gray-300 capitalize">{activeTab === 'properties' ? 'Clip Inspector' : `${activeTab} Library`}</span>
              <button onClick={() => setShowMobileSheet(false)} className="p-1 hover:bg-[#2a2a30] rounded-lg text-zinc-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {activeTab === 'properties' ? (
                <ClipInspector width={window.innerWidth} />
              ) : (
                <LeftSidebar activeTab={activeTab} width={window.innerWidth} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Speed/Volume Slider Overlay */}
      {isMobile && activeMobileSlider && selectedClip && (
        <div className="fixed bottom-0 inset-x-0 z-50 bg-[#18181c] border-t border-[#2c2c32] p-4 rounded-t-2xl space-y-4 safe-bottom-padding animate-slide-up">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-gray-350 capitalize">{activeMobileSlider} Adjustment</span>
            <button onClick={() => setActiveMobileSlider(null)} className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
          
          {activeMobileSlider === 'volume' ? (
            <div className="space-y-2.5">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Volume Level</span>
                <span className="font-mono text-sky-400">{selectedClip.volume ?? 100}%</span>
              </div>
              <input 
                type="range"
                min={0}
                max={100}
                value={selectedClip.volume ?? 100}
                onChange={(e) => updateClip(selectedClip.id, { volume: Number(e.target.value) })}
                className="w-full h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-sky-500"
              />
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Speed Factor</span>
                <span className="font-mono text-sky-400">{(selectedClip.speed ?? 1.0).toFixed(1)}x</span>
              </div>
              <input 
                type="range"
                min={0.1}
                max={8.0}
                step={0.1}
                value={selectedClip.speed ?? 1.0}
                onChange={(e) => updateClip(selectedClip.id, { speed: Number(e.target.value) })}
                className="w-full h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-sky-500"
              />
            </div>
          )}
        </div>
      )}

      {/* Mobile Media Picker Modal */}
      {isMobile && showMobileMediaPicker && (
        <MobileMediaPicker 
          onClose={() => setShowMobileMediaPicker(false)}
          onAdd={async (selectedAssets) => {
            setShowMobileMediaPicker(false);
            for (const asset of selectedAssets) {
              const isAudio = asset.type.startsWith('audio/');
              const isImage = asset.type.startsWith('image/');
              const clipType = (isAudio ? 'audio' : isImage ? 'image' : 'video') as 'video' | 'audio' | 'image';
              const trackType = clipType === 'image' ? 'video' : clipType;

              let track = project.tracks.find(t => t.type === trackType);
              if (!track) {
                await addTrack(trackType as 'video' | 'audio' | 'text');
                const updatedProject = useEditorStore.getState().project;
                track = updatedProject?.tracks.find(t => t.type === trackType);
              }
              if (track) {
                const clipId = Math.random().toString(36).substring(2, 9);
                const newClip = {
                  id: clipId,
                  assetId: asset.id,
                  type: clipType,
                  name: asset.name,
                  durationMs: asset.durationMs,
                  trimStartMs: 0,
                  trimEndMs: asset.durationMs,
                  positionMs: useEditorStore.getState().currentTime,
                  speed: 1.0,
                  volume: 100,
                  fadeInMs: 0,
                  fadeOutMs: 0,
                  transform: {
                    scale: 100,
                    x: 0,
                    y: 0,
                    rotation: 0,
                    uniformScale: true,
                    blendMode: 'normal'
                  }
                };
                await addClip(track.id, newClip);
              }
            }
          }}
        />
      )}
      {/* Keyboard Shortcuts Help Overlay */}
      {showShortcutsHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowShortcutsHelp(false)}
        >
          <div
            className="bg-[#18181c] border border-[#2c2c32] rounded-xl p-5 w-[400px] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-gray-100 flex items-center gap-1.5">
                <Keyboard className="w-4 h-4 text-sky-400" />
                Keyboard Shortcuts
              </h3>
              <button onClick={() => setShowShortcutsHelp(false)} className="text-gray-500 hover:text-gray-200 text-xs transition cursor-pointer">✕ Close</button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              {[
                ['Space', 'Play / Pause'],
                ['S', 'Split clip at playhead'],
                ['Delete / Backspace', 'Delete selected clip'],
                ['Z (Ctrl/Cmd)', 'Undo'],
                ['Shift+Z (Ctrl/Cmd)', 'Redo'],
                ['← / →', 'Step 1 frame (~33ms)'],
                ['Shift+← / →', 'Jump 1 second'],
                ['[ / ]', 'Zoom out / Zoom in'],
                ['Escape', 'Deselect clip'],
              ].map(([key, action]) => (
                <div key={key} className="flex items-start gap-2">
                  <kbd className="px-1.5 py-0.5 bg-[#121214] border border-[#2c2c32] rounded text-gray-300 font-mono whitespace-nowrap text-[9px]">{key}</kbd>
                  <span className="text-gray-400">{action}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Export Settings & Progress Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-[#2c2c32] bg-[#18181c] p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-[#2c2c32] pb-3">
              <h3 className="text-sm font-bold text-gray-100">Export Settings</h3>
              {!isExporting && (
                <button
                  onClick={() => setShowExportModal(false)}
                  className="text-gray-500 hover:text-gray-355 font-bold text-sm cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {!isExporting && !exportBlob && (
              <div className="space-y-4">
                {/* Resolution Selector */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase">Export Resolution</label>
                    <select
                      value={exportResolution}
                      onChange={(e) => setExportResolution(e.target.value)}
                      className="w-full rounded border border-[#2c2c32] bg-[#121214] px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-sky-500 transition cursor-pointer"
                    >
                      <option value="2k">2K QHD (2560×1440)</option>
                      <option value="1080p">1080p Full HD</option>
                      <option value="720p">720p HD</option>
                      <option value="480p">480p SD</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase">Framerate (FPS)</label>
                    <select
                      value={exportFps}
                      onChange={(e) => setExportFps(Number(e.target.value))}
                      className="w-full rounded border border-[#2c2c32] bg-[#121214] px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-sky-500 transition cursor-pointer"
                    >
                      <option value={24}>24 FPS (Cinematic)</option>
                      <option value={30}>30 FPS (Standard)</option>
                      <option value={60}>60 FPS (Ultra Smooth)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase">Bitrate / Quality</label>
                    <select
                      value={qualityPreset}
                      onChange={(e) => setQualityPreset(e.target.value as any)}
                      className="w-full rounded border border-[#2c2c32] bg-[#121214] px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-sky-500 transition cursor-pointer"
                    >
                      <option value="low">Low Quality (Small File)</option>
                      <option value="medium">Medium Quality (Standard)</option>
                      <option value="high">High Quality (Best Detail)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase">AI Frame Upscale</label>
                    <select
                      value={upscaleMode}
                      onChange={(e) => setUpscaleMode(e.target.value as any)}
                      className="w-full rounded border border-[#2c2c32] bg-[#121214] px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-sky-500 transition cursor-pointer"
                    >
                      <option value="standard">None (Normal Render)</option>
                      <option value="enhanced">Enhanced (Contrast/Sharpen)</option>
                      <option value="ai">AI Real-ESRGAN x4 (WebGPU)</option>
                    </select>
                  </div>
                </div>

                <div className="border-t border-[#2c2c32] pt-4 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-[10px] text-zinc-550 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useSystemPicker}
                      onChange={(e) => setUseSystemPicker(e.target.checked)}
                      className="rounded bg-zinc-950 border border-zinc-800 accent-sky-500"
                    />
                    <span>Use Native OS File Picker</span>
                  </label>

                  <button
                    onClick={handleStartExport}
                    className="px-5 py-2 text-xs font-bold text-white bg-sky-650 hover:bg-sky-550 rounded transition shadow shadow-sky-600/15 cursor-pointer"
                  >
                    Start Rendering
                  </button>
                </div>
              </div>
            )}

            {isExporting && (
              <div className="space-y-4 text-center py-4">
                <Loader2 className="w-10 h-10 animate-spin text-sky-550 mx-auto" />
                
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-gray-250">
                    {upscaleMode === 'ai' && exportProgress < 20 
                      ? 'Initializing AI Neural Models...' 
                      : 'Rendering Video Frames...'}
                  </p>
                  <p className="text-[10px] text-zinc-550">
                    {upscaleStage ? `${upscaleStage} (${Math.round(upscaleStageProgress)}%)` : `Frame ${currentFrame} / ${totalFrames}`}
                  </p>
                </div>

                <div className="w-full h-2 bg-[#121214] border border-[#2c2c32] rounded-full overflow-hidden relative">
                  <div 
                    className="h-full bg-sky-500 transition-all duration-300"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
                
                <div className="flex justify-between text-[10px] text-zinc-550">
                  <span>Progress: {Math.round(exportProgress)}%</span>
                  <span>FPS: {exportFps}</span>
                </div>

                <button
                  onClick={handleCancelExport}
                  className="px-4 py-1.5 text-xs text-red-400 border border-red-950 bg-red-950/20 hover:bg-red-950/40 rounded transition mx-auto block cursor-pointer"
                >
                  Cancel Export
                </button>
              </div>
            )}

            {exportBlob && !isExporting && (
              <div className="space-y-4">
                <div className="flex flex-col items-center justify-center gap-2.5 py-4 text-center">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 animate-bounce" />
                  <div>
                    <h4 className="text-sm font-bold text-gray-200">Video Rendered Successfully!</h4>
                    <p className="text-[10px] text-zinc-550 mt-1 max-w-[280px]">
                      Your high-resolution video is encoded and cached locally in browser sandbox memory.
                    </p>
                  </div>
                </div>

                <div className="bg-[#121214] border border-[#2c2c32] rounded p-3 text-[10px] text-zinc-450 space-y-1">
                  <p><strong className="text-gray-300">File Format:</strong> MP4 (MPEG-4 H.264)</p>
                  <p><strong className="text-gray-300">File Size:</strong> {(exportBlob.size / (1024 * 1024)).toFixed(2)} MB</p>
                  <p><strong className="text-gray-300">Output Quality:</strong> {exportResolution} @ {exportFps}fps</p>
                  <p><strong className="text-gray-300">AI Upscale:</strong> {upscaleMode === 'ai' ? '✅ Real-ESRGAN x4 (WebGPU/WASM)' : upscaleMode === 'enhanced' ? 'Fast Browser Enhance' : 'Standard'}</p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      setExportBlob(null);
                      setShowExportModal(false);
                    }}
                    className="flex-1 px-4 py-2.5 text-xs font-semibold rounded border border-[#2c2c32] bg-[#121214] text-gray-400 hover:bg-[#2a2a30] transition cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    onClick={handleDownload}
                    className="flex-1 px-4 py-2.5 text-xs font-semibold rounded text-white bg-sky-650 hover:bg-sky-550 transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    Download Video
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
