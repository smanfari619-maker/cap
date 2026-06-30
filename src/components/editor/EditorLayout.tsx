import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Edit2, Sparkles, Download, Loader2, CheckCircle2, Film, Music, Type, Smile, Scissors, Languages, Palette, Sliders, Users, Keyboard, Zap, AlertTriangle } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import { db } from '../../lib/db';
import LeftSidebar from './LeftSidebar';
import VideoPreview from './VideoPreview';
import ClipInspector from './ClipInspector';
import Timeline from './Timeline';
import { exportProjectWebCodecs } from '../../lib/webcodec-exporter';
import jellycutLogo from '../../assets/jellycut_logo.svg';

const tabs = [
  { id: 'media', label: 'Media', icon: Film },
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'stickers', label: 'Stickers', icon: Smile },
  { id: 'effects', label: 'Effects', icon: Sparkles },
  { id: 'transitions', label: 'Transitions', icon: Scissors },
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
  const currentTime = useEditorStore(state => state.currentTime);
  const zoom = useEditorStore(state => state.zoom);
  const setZoom = useEditorStore(state => state.setZoom);
  const selectedClipId = useEditorStore(state => state.selectedClipId);
  const selectedClipIds = useEditorStore(state => state.selectedClipIds);
  const setSelectedClipId = useEditorStore(state => state.setSelectedClipId);
  const setSelectedClipIds = useEditorStore(state => state.setSelectedClipIds);
  const removeClip = useEditorStore(state => state.removeClip);
  const addClip = useEditorStore(state => state.addClip);
  const splitClipAtPlayhead = useEditorStore(state => state.splitClipAtPlayhead);
  const upscaleEnabled = useEditorStore(state => state.upscaleEnabled);
  const undo = useEditorStore(state => state.undo);
  const redo = useEditorStore(state => state.redo);

  const clipboardClipRef = useRef<any>(null);

  const [activeTab, setActiveTab] = useState<string>('media');
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Resizable panel states
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [inspectorWidth, setInspectorWidth] = useState(320);
  const [timelineHeight, setTimelineHeight] = useState(340);
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
              positionMs: currentTime,
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
  }, [undo, redo, isPlaying, setIsPlaying, currentTime, setCurrentTime, zoom, setZoom, selectedClipId, selectedClipIds, setSelectedClipId, setSelectedClipIds, removeClip, addClip, splitClipAtPlayhead, project]);

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
        {/* Left Side: Back & Tabs */}
        <div className="flex items-center gap-2 h-full">
          <button
            onClick={closeProject}
            className="p-1.5 rounded hover:bg-[#2a2a30] text-gray-400 hover:text-gray-200 transition"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <img src={jellycutLogo} className="h-4 w-auto ml-1 mr-2" alt="Jellycut" />

          {/* Top Tabs Bar */}
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
        </div>

        {/* Center: Project Title */}
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
                className="p-0.5 hover:bg-[#2a2a30] text-gray-500 hover:text-gray-300 rounded transition"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            </>
          )}
        </div>

        {/* Right Side: Shortcuts & Export */}
        <div className="flex items-center gap-2">
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
                      : 'text-zinc-400 hover:text-zinc-250 hover:bg-zinc-800'
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
        </div>
      </header>
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Media & Asset Sidebar */}
        <LeftSidebar activeTab={activeTab} width={sidebarWidth} />

        {/* Sidebar Resize Handle */}
        <div 
          className={`w-2 hover:w-2 bg-transparent cursor-col-resize transition-all relative flex items-center justify-center group z-30 ${
            activeDrag === 'sidebar' ? 'bg-sky-500/20' : ''
          }`}
          onMouseDown={startSidebarResize}
        >
          {/* Visual Divider Line */}
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

        {/* Center: Video Preview & Canvas */}
        <VideoPreview />

        {/* Inspector Resize Handle */}
        <div 
          className={`w-2 hover:w-2 bg-transparent cursor-col-resize transition-all relative flex items-center justify-center group z-30 ${
            activeDrag === 'inspector' ? 'bg-sky-500/20' : ''
          }`}
          onMouseDown={startInspectorResize}
        >
          {/* Visual Divider Line */}
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

        {/* Right: Details Inspector */}
        <ClipInspector width={inspectorWidth} />
      </div>

      {/* Timeline Resize Handle */}
      <div 
        className={`h-2 hover:h-2 bg-transparent cursor-row-resize transition-all relative flex items-center justify-center group z-30 ${
          activeDrag === 'timeline' ? 'bg-sky-500/20' : ''
        }`}
        onMouseDown={startTimelineResize}
      >
        {/* Visual Divider Line */}
        <div className={`w-full h-[1px] transition-colors ${
          activeDrag === 'timeline' ? 'bg-sky-400' : 'bg-[#2c2c32] group-hover:bg-sky-500'
        }`} />
        
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-0.5 bg-[#3a3a42] rounded group-hover:bg-sky-400 transition-colors" />
      </div>

      {/* Bottom Area: Timeline Scrubber */}
      <Timeline height={timelineHeight} />

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
              <button onClick={() => setShowShortcutsHelp(false)} className="text-gray-500 hover:text-gray-200 text-xs transition">✕ Close</button>
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
                  className="text-gray-500 hover:text-gray-300 font-bold text-sm"
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
                      className="w-full rounded border border-[#2c2c32] bg-[#121214] px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-sky-500 transition"
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
                      className="w-full rounded border border-[#2c2c32] bg-[#121214] px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-sky-500 transition"
                    >
                      <option value={24}>24 FPS (Cinematic)</option>
                      <option value={30}>30 FPS (Standard)</option>
                      <option value={60}>60 FPS (Ultra Smooth)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase">Video Quality Preset</label>
                    <select
                      value={qualityPreset}
                      onChange={(e) => setQualityPreset(e.target.value as any)}
                      className="w-full rounded border border-[#2c2c32] bg-[#121214] px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-sky-500 transition"
                    >
                      <option value="low">Low Quality (Small File)</option>
                      <option value="medium">Medium Quality (Standard)</option>
                      <option value="high">High Quality (Best Detail)</option>
                    </select>
                  </div>

                  {'showSaveFilePicker' in window && (
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-semibold text-gray-400 uppercase">Save Method</label>
                      <button
                        type="button"
                        onClick={() => setUseSystemPicker(p => !p)}
                        className={`w-full text-left rounded border border-[#2c2c32] px-3 py-2 text-xs transition-all ${
                          useSystemPicker ? 'bg-sky-950/20 text-sky-400 border-sky-900/50' : 'bg-[#121214] text-gray-300'
                        }`}
                      >
                        {useSystemPicker ? '📂 System Native Picker' : '📥 Browser Auto-Save'}
                      </button>
                    </div>
                  )}
                </div>


                {/* Upscaling Options Selectors */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase">Upscale / Enhance Mode</label>
                  
                  <div className="grid grid-cols-1 gap-2">
                    {/* Standard Mode */}
                    <button
                      onClick={() => setUpscaleMode('standard')}
                      className={`flex flex-col text-left p-3 rounded-lg border transition-all ${
                        upscaleMode === 'standard'
                          ? 'border-sky-500 bg-sky-950/20'
                          : 'border-[#2c2c32] bg-[#121214] hover:bg-[#1a1a20] hover:border-zinc-700'
                      }`}
                    >
                      <span className="text-xs font-bold text-gray-200">Standard Scaling</span>
                      <span className="text-[10px] text-gray-500 mt-0.5">Instant. Standard browser scaling without extra processing.</span>
                    </button>

                    {/* Enhanced Mode */}
                    <button
                      onClick={() => setUpscaleMode('enhanced')}
                      className={`flex flex-col text-left p-3 rounded-lg border transition-all ${
                        upscaleMode === 'enhanced'
                          ? 'border-sky-500 bg-sky-950/20'
                          : 'border-[#2c2c32] bg-[#121214] hover:bg-[#1a1a20] hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-gray-200">Fast Browser Enhance</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-900/50 font-semibold uppercase">Instant</span>
                      </div>
                      <span className="text-[10px] text-gray-500 mt-0.5">Instant. Uses high-quality browser upscaling combined with contrast & sharpness boost filters.</span>
                    </button>

                    {/* AI Neural Mode */}
                    <button
                      onClick={() => setUpscaleMode('ai')}
                      className={`flex flex-col text-left p-3 rounded-lg border transition-all ${
                        upscaleMode === 'ai'
                          ? 'border-sky-500 bg-sky-950/20'
                          : 'border-[#2c2c32] bg-[#121214] hover:bg-[#1a1a20] hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-gray-200">AI Neural Upscale (Real-ESRGAN)</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-900/50 text-sky-400 font-semibold uppercase">AI</span>
                      </div>
                      <span className="text-[10px] text-gray-500 mt-0.5">Slow. Runs frame-by-frame deep neural network to reconstruct crisp native details.</span>
                    </button>
                  </div>

                  {upscaleMode === 'ai' && (
                    <div className="px-4 py-3 rounded-lg border border-[#2c2c32] bg-amber-950/20 space-y-1.5">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                        <p className="text-[10px] text-amber-300/80 leading-relaxed">
                          Export takes ~0.5–2s per frame on GPU (WebGPU), or ~5–10s on WASM CPU fallback. A 10s video is ~300 frames. 
                          First run downloads the 33MB AI model.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setShowExportModal(false)}
                    className="px-4 py-2 text-xs font-semibold rounded border border-[#2c2c32] bg-[#121214] text-gray-400 hover:bg-[#2a2a30] transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleStartExport}
                    className="px-4 py-2 text-xs font-semibold rounded text-white bg-sky-650 hover:bg-sky-550 transition flex items-center gap-1.5"
                  >
                    Start Rendering
                  </button>
                </div>
              </div>
            )}

            {/* Rendering Progress Screen */}
            {isExporting && (
              <div className="space-y-4 text-center py-6">
                {upscaleStage ? (
                  <div className="flex flex-col items-center gap-3">
                    <Zap className="w-10 h-10 text-sky-400 animate-pulse" />
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-gray-200">{upscaleStage}</h4>
                      <p className="text-[10px] text-gray-500">Loading Real-ESRGAN model…</p>
                    </div>
                    <div className="w-full bg-[#121214] h-2 rounded overflow-hidden border border-[#2c2c32]">
                      <div className="bg-sky-400 h-full transition-all duration-200" style={{ width: `${upscaleStageProgress}%` }} />
                    </div>
                    <span className="text-xs font-mono text-sky-400">{upscaleStageProgress}%</span>
                  </div>
                ) : (
                  <>
                    <Loader2 className="w-10 h-10 text-sky-500 animate-spin mx-auto" />
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-bold text-gray-200">
                        {upscaleMode === 'ai' ? '🤖 AI Upscaling Frames…' : 'Rendering Timeline Frames'}
                      </h4>
                      <p className="text-[10px] text-gray-500">
                        {upscaleMode === 'ai'
                          ? `Frame ${currentFrame} / ${totalFrames} — Real-ESRGAN x4 active`
                          : 'Compositing canvas textures and encoding H.264 streams…'}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="w-full bg-[#121214] h-2 rounded overflow-hidden border border-[#2c2c32]">
                        <div
                          className={`h-full transition-all duration-100 ${
                            upscaleMode === 'ai' ? 'bg-gradient-to-r from-sky-500 to-purple-500' : 'bg-sky-500'
                          }`}
                          style={{ width: `${exportProgress}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono font-bold text-sky-400">{Math.round(exportProgress)}% Completed</span>
                    </div>
                  </>
                )}
                <button
                  onClick={handleCancelExport}
                  className="mt-2 px-4 py-1.5 text-xs font-semibold border border-[#2c2c32] hover:bg-[#2a2a30] text-gray-400 rounded transition"
                >
                  Cancel Render
                </button>
              </div>
            )}

            {/* Render Complete Screen */}
            {!isExporting && exportBlob && (
              <div className="space-y-5 text-center py-4">
                <div className="w-12 h-12 bg-emerald-950/30 border border-emerald-800 rounded-full flex items-center justify-center mx-auto text-emerald-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-gray-200">Render Successful!</h4>
                  <p className="text-[10px] text-gray-500">
                    Your video is ready. It has been encoded completely in your browser.
                  </p>
                </div>
                <div className="rounded bg-[#121214] p-3.5 border border-[#2c2c32] text-left text-xs text-gray-450 space-y-1">
                  <p><strong className="text-gray-300">Format:</strong> MP4 (MPEG-4 H.264)</p>
                  <p><strong className="text-gray-300">Resolution:</strong> {exportResolution === '2k' ? '2K QHD (2560×1440)' : exportResolution}</p>
                  <p><strong className="text-gray-300">AI Upscale:</strong> {upscaleMode === 'ai' ? '✅ Real-ESRGAN x4 (WebGPU/WASM)' : upscaleMode === 'enhanced' ? 'Fast Browser Enhance' : 'Standard'}</p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      setExportBlob(null);
                      setShowExportModal(false);
                    }}
                    className="flex-1 px-4 py-2.5 text-xs font-semibold rounded border border-[#2c2c32] bg-[#121214] text-gray-400 hover:bg-[#2a2a30] transition"
                  >
                    Close
                  </button>
                  <button
                    onClick={handleDownload}
                    className="flex-1 px-4 py-2.5 text-xs font-semibold rounded text-white bg-sky-650 hover:bg-sky-550 transition flex items-center justify-center gap-1.5"
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
