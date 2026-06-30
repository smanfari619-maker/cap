import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Plus, Trash2, Video, Film, Folder, Download, Upload, 
  Smartphone, Tv, Sparkles, Search, HardDrive, Cpu, 
  Keyboard, Clock, ShieldCheck
} from 'lucide-react';
import { db, type Project } from '../../lib/db';
import { useEditorStore } from '../../store/editorStore';
import { deleteDirectoryFromOPFS } from '../../lib/opfs';
import jellycutLogo from '../../assets/jellycut_logo.svg';

export default function Dashboard() {
  const loadProject = useEditorStore(state => state.loadProject);
  const projects = useLiveQuery(() => db.projects.reverse().sortBy('updatedAt')) || [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const projectsVersion = useMemo(() => projects.map(p => `${p.id}-${p.updatedAt?.getTime() ?? 0}`).join(','), [projects]);
  
  // New Project Form State
  const [title, setTitle] = useState('');
  const [resolution, setResolution] = useState('1080p');
  const [aspectRatio, setAspectRatio] = useState<'16-9' | '9-16' | '1-1' | '21-9'>('16-9');
  const [fps, setFps] = useState(30);
  const [isCreating, setIsCreating] = useState(false);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRatio, setFilterRatio] = useState<string>('all');

  // System & Storage States
  const [storageEstimate, setStorageEstimate] = useState<{ used: number; total: number; percent: number } | null>(null);
  const [webGpuStatus, setWebGpuStatus] = useState<'checking' | 'active' | 'unavailable'>('checking');
  const [dragOverBackup, setDragOverBackup] = useState(false);

  // templates config
  const templates = [
    { id: 'yt', title: 'YouTube Landscape', ratio: '16-9', w: 1920, h: 1080, icon: Tv, bg: 'from-sky-500/10 via-blue-500/5 to-transparent', border: 'hover:border-sky-500/50', iconBg: 'bg-sky-500/10 text-sky-400', desc: '16:9 • Standard horizontal format' },
    { id: 'tiktok', title: 'TikTok / Reel', ratio: '9-16', w: 1080, h: 1920, icon: Smartphone, bg: 'from-pink-500/10 via-rose-500/5 to-transparent', border: 'hover:border-pink-500/50', iconBg: 'bg-pink-500/10 text-pink-400', desc: '9:16 • Mobile portrait format' },
    { id: 'insta', title: 'Instagram Square', ratio: '1-1', w: 1080, h: 1080, icon: Film, bg: 'from-purple-500/10 via-fuchsia-500/5 to-transparent', border: 'hover:border-purple-500/50', iconBg: 'bg-purple-500/10 text-purple-400', desc: '1:1 • Square post format' },
    { id: 'cinematic', title: 'Cinematic Short', ratio: '21-9', w: 2560, h: 1080, icon: Video, bg: 'from-emerald-500/10 via-teal-500/5 to-transparent', border: 'hover:border-emerald-500/50', iconBg: 'bg-emerald-500/10 text-emerald-400', desc: '21:9 • Ultra-wide aspect ratio' }
  ];

  // Fetch storage estimates
  useEffect(() => {
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((estimate) => {
        const used = estimate.usage || 0;
        const total = estimate.quota || 1;
        const percent = Math.min(100, Math.round((used / total) * 100));
        setStorageEstimate({ used, total, percent });
      });
    }
  }, [projectsVersion]);

  // Check WebGPU hardware acceleration adapter presence
  useEffect(() => {
    if ('gpu' in navigator) {
      navigator.gpu.requestAdapter()
        .then((adapter) => {
          if (adapter) setWebGpuStatus('active');
          else setWebGpuStatus('unavailable');
        })
        .catch(() => setWebGpuStatus('unavailable'));
    } else {
      setWebGpuStatus('unavailable');
    }
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    let width = 1920;
    let height = 1080;

    if (aspectRatio === '9-16') {
      width = 1080;
      height = 1920;
    } else if (aspectRatio === '1-1') {
      width = 1080;
      height = 1080;
    } else if (aspectRatio === '21-9') {
      width = 2560;
      height = 1080;
    }

    // Scale resolution if not 1080p
    if (resolution === '720p') {
      width = Math.round(width * (720 / height));
      height = 720;
    } else if (resolution === '480p') {
      width = Math.round(width * (480 / height));
      height = 480;
    }

    const projectId = Math.random().toString(36).substring(2, 9);
    const newProject: Project = {
      id: projectId,
      title: title.trim(),
      width,
      height,
      fps,
      tracks: [
        { id: 't1', name: 'Text Track 1', type: 'text', clips: [] },
        { id: 'v1', name: 'Video Track 1', type: 'video', clips: [] },
        { id: 'a1', name: 'Audio Track 1', type: 'audio', clips: [] }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.projects.add(newProject);
    setTitle('');
    setIsCreating(false);
    loadProject(projectId);
  };

  const handleCreateTemplate = async (templateTitle: string, w: number, h: number) => {
    const projectId = Math.random().toString(36).substring(2, 9);
    const newProject: Project = {
      id: projectId,
      title: `My ${templateTitle}`,
      width: w,
      height: h,
      fps: 30,
      tracks: [
        { id: 't1', name: 'Text Track 1', type: 'text', clips: [] },
        { id: 'v1', name: 'Video Track 1', type: 'video', clips: [] },
        { id: 'a1', name: 'Audio Track 1', type: 'audio', clips: [] }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.projects.add(newProject);
    loadProject(projectId);
  };

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this project? All local media files inside this project will be deleted permanently.')) {
      // Delete OPFS files first. deleteDirectoryFromOPFS swallows errors silently,
      // so if it fails the DB records remain intact and the user can retry.
      // Deleting DB records first would leave orphaned OPFS files with no UI path to clean them.
      await deleteDirectoryFromOPFS(projectId);
      const projectAssets = await db.assets.where('projectId').equals(projectId).toArray();
      await db.assets.bulkDelete(projectAssets.map(a => a.id));
      await db.projects.delete(projectId);
    }
  };

  const handleExportBackup = async (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    const dataStr = JSON.stringify(project, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `${project.title.toLowerCase().replace(/\s+/g, '_')}_backup.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let file: File | null = null;
    
    if ('files' in e.target && e.target.files) {
      file = e.target.files[0];
    } else if ('dataTransfer' in e && e.dataTransfer.files) {
      e.preventDefault();
      file = e.dataTransfer.files[0];
    }

    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const projectData = JSON.parse(event.target?.result as string) as Project;
        if (!projectData.id || !projectData.title || !projectData.tracks) {
          alert('Invalid project backup file format.');
          return;
        }

        const exists = await db.projects.get(projectData.id);
        if (exists) {
          projectData.id = Math.random().toString(36).substring(2, 9);
          projectData.title = `${projectData.title} (Imported)`;
        }

        projectData.createdAt = new Date(projectData.createdAt);
        projectData.updatedAt = new Date();

        await db.projects.add(projectData);
        alert('Project imported successfully!');
      } catch {
        alert('Error parsing JSON backup file.');
      }
    };
    reader.readAsText(file);
  };

  // Helper: Calculate project duration based on clips
  const getProjectDurationMs = (proj: Project) => {
    let maxTime = 0;
    proj.tracks?.forEach(t => {
      t.clips?.forEach(c => {
        maxTime = Math.max(maxTime, c.positionMs + c.durationMs);
      });
    });
    return maxTime;
  };

  const formatTimecode = (ms: number) => {
    if (!ms || ms <= 0) return '00:00';
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    
    const pad = (n: number) => String(n).padStart(2, '0');
    
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Project Filtering
  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase());
    
    const ratio = p.width / p.height;
    let matchesRatio = true;
    if (filterRatio === '16-9') {
      matchesRatio = Math.abs(ratio - 16/9) < 0.1;
    } else if (filterRatio === '9-16') {
      matchesRatio = Math.abs(ratio - 9/16) < 0.1;
    } else if (filterRatio === '1-1') {
      matchesRatio = Math.abs(ratio - 1) < 0.1;
    } else if (filterRatio === '21-9') {
      matchesRatio = Math.abs(ratio - 21/9) < 0.1;
    }
    
    return matchesSearch && matchesRatio;
  });

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-950 p-6 md:p-8 text-zinc-100 relative">
      {/* Decorative gradients */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] purple-glow-accent rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] blue-glow-accent rounded-full blur-[120px] pointer-events-none" />

      <div className="mx-auto max-w-7xl relative z-10 animate-fade-in-up">
        
        {/* Top Branding Header */}
        <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-center border-b border-zinc-900 pb-8">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <img src={jellycutLogo} className="h-8 w-auto" alt="Jellycut" />
              <span className="text-[10px] px-2.5 py-0.5 rounded-full border border-violet-500/25 bg-violet-500/10 text-violet-400 font-bold select-none tracking-wide">
                v1.0 • WASM Engine
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-lg">
              Offline-first professional browser video editor. Powered by WebGPU, WASM, and Origin Private File System.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl border border-zinc-800 bg-zinc-900/35 hover:bg-zinc-800/80 hover:border-zinc-700 cursor-pointer transition text-zinc-300 backdrop-blur-md glow-hover-blue">
              <Upload className="w-4 h-4 text-sky-400" />
              Import Backup
              <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
            </label>
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-violet-600 rounded-xl hover:bg-violet-500 hover:scale-[1.02] transition shadow-lg shadow-violet-600/35 cursor-pointer glow-hover"
            >
              <Plus className="w-4 h-4" />
              New Project
            </button>
          </div>
        </div>

        {/* 2-Column Responsive Dashboard Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT/MAIN WORKSPACE (8 Columns on Large Screen) */}
          <div className="lg:col-span-8 flex flex-col gap-10">
            
            {/* Start with a Template Section */}
            <div>
              <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-violet-400" /> Start with a Template
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {templates.map((temp) => {
                  const IconComponent = temp.icon;
                  return (
                    <div
                      key={temp.id}
                      onClick={() => handleCreateTemplate(temp.title, temp.w, temp.h)}
                      className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-zinc-850 bg-zinc-900/25 p-5 hover:bg-zinc-900/50 hover:shadow-xl transition duration-300 cursor-pointer ${temp.border} bg-gradient-to-br ${temp.bg}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className={`w-10 h-10 rounded-xl ${temp.iconBg} flex items-center justify-center group-hover:scale-110 transition duration-300`}>
                          <IconComponent className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] text-zinc-500 font-semibold px-2 py-0.5 bg-zinc-900/55 rounded-md border border-zinc-800">
                          {temp.ratio}
                        </span>
                      </div>
                      <div className="mt-5">
                        <h3 className="font-bold text-zinc-200 group-hover:text-white transition-colors">{temp.title}</h3>
                        <p className="text-xs text-zinc-500 mt-1 leading-snug">{temp.desc}</p>
                      </div>
                      <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 bg-violet-600 border border-violet-500 text-white rounded-lg">
                        Create
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Projects Workspace */}
            <div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-900 pb-4 mb-6">
                <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                  <Film className="w-3.5 h-3.5 text-sky-400" /> Recent Projects
                </h2>
                
                {/* Search & Ratio Filters bar */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Search input */}
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Search projects..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-zinc-900/50 border border-zinc-850 rounded-xl pl-9 pr-4 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-violet-500 focus:bg-zinc-900 transition-colors w-44"
                    />
                  </div>

                  {/* Ratio Filter Dropdown/Chips */}
                  <select
                    value={filterRatio}
                    onChange={(e) => setFilterRatio(e.target.value)}
                    className="bg-zinc-900/50 border border-zinc-850 rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-violet-500 transition-colors cursor-pointer"
                  >
                    <option value="all">All Formats</option>
                    <option value="16-9">16:9 Landscape</option>
                    <option value="9-16">9:16 Portrait</option>
                    <option value="1-1">1:1 Square</option>
                    <option value="21-9">21:9 Cinema</option>
                  </select>
                </div>
              </div>

              {/* Projects Grid Display */}
              {filteredProjects.length === 0 ? (
                <div className="flex flex-col items-center justify-center border border-dashed border-zinc-850 bg-zinc-900/10 rounded-2xl p-16 text-center backdrop-blur-sm">
                  <Film className="w-10 h-10 text-zinc-700 mb-3 animate-pulse" />
                  <h3 className="text-sm font-bold text-zinc-300">No matching projects</h3>
                  <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                    {searchQuery || filterRatio !== 'all' 
                      ? 'Try adjusting your search queries or aspect filters.' 
                      : 'Create your first project above to begin editing.'}
                  </p>
                  {!(searchQuery || filterRatio !== 'all') && (
                    <button
                      onClick={() => setIsCreating(true)}
                      className="mt-5 flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-violet-600 rounded-lg hover:bg-violet-500 transition shadow cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Create Project
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {filteredProjects.map((proj) => {
                    const durMs = getProjectDurationMs(proj);
                    const ratio = proj.width / proj.height;
                    let ratioLabel = '16:9';
                    let previewAspect = 'aspect-video';
                    
                    if (Math.abs(ratio - 9/16) < 0.1) {
                      ratioLabel = '9:16';
                      previewAspect = 'aspect-[9/16] max-h-[160px] mx-auto';
                    } else if (Math.abs(ratio - 1) < 0.1) {
                      ratioLabel = '1:1';
                      previewAspect = 'aspect-square max-h-[160px] mx-auto';
                    } else if (Math.abs(ratio - 21/9) < 0.1) {
                      ratioLabel = '21:9';
                      previewAspect = 'aspect-[21/9]';
                    }

                    return (
                      <div
                        key={proj.id}
                        onClick={() => loadProject(proj.id)}
                        className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-850/80 bg-zinc-900/20 hover:bg-zinc-900/40 hover:border-zinc-750 transition duration-300 cursor-pointer hover:shadow-xl hover:shadow-violet-950/5 relative"
                      >
                        {/* Project Card Video Aspect Ratio Preview Box */}
                        <div className="p-3 bg-zinc-950/40 border-b border-zinc-900/80 flex items-center justify-center overflow-hidden h-[130px] relative">
                          <div className={`w-full rounded bg-gradient-to-br from-zinc-800/60 to-zinc-900/60 border border-zinc-800 flex flex-col items-center justify-center relative overflow-hidden ${previewAspect} transition-transform group-hover:scale-[1.01] duration-300`}>
                            {/* Abstract Timeline Preview Lines */}
                            <div className="absolute inset-x-2 bottom-2 flex flex-col gap-1 opacity-45 pointer-events-none">
                              <div className="h-1 bg-violet-500 rounded-full w-2/3" />
                              <div className="h-1 bg-sky-500 rounded-full w-4/5" />
                              <div className="h-1 bg-zinc-650 rounded-full w-1/2" />
                            </div>

                            {/* Center Aspect Stamp Icon */}
                            <div className="rounded-full bg-zinc-900/80 p-2.5 border border-zinc-800 group-hover:bg-violet-600/95 group-hover:scale-110 group-hover:border-violet-500 transition duration-300 z-10">
                              <Video className="w-4 h-4 text-zinc-400 group-hover:text-white" />
                            </div>

                            {/* Floating aspect & timecode tag */}
                            <div className="absolute top-1.5 right-1.5 flex gap-1.5 z-10">
                              <span className="text-[8px] tracking-wide font-bold px-1.5 py-0.5 rounded bg-zinc-900/90 text-zinc-300 border border-zinc-800 select-none">
                                {ratioLabel}
                              </span>
                              <span className="text-[8px] tracking-wide font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-900/90 text-sky-400 border border-zinc-850 select-none">
                                {formatTimecode(durMs)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Card Meta Content */}
                        <div className="p-4 flex-1 flex flex-col justify-between">
                          <div>
                            <h4 className="font-bold text-zinc-200 line-clamp-1 group-hover:text-zinc-100 transition-colors">
                              {proj.title}
                            </h4>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className="text-[9px] font-bold px-2 py-0.5 bg-zinc-900 border border-zinc-850 rounded text-zinc-400">
                                {proj.width}x{proj.height}
                              </span>
                              <span className="text-[9px] font-bold px-2 py-0.5 bg-zinc-900 border border-zinc-850 rounded text-zinc-400">
                                {proj.fps} FPS
                              </span>
                            </div>
                            
                            <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] text-zinc-500">
                              <p className="flex items-center gap-1">
                                <Folder className="w-3.5 h-3.5 text-zinc-700" />
                                {proj.tracks?.length || 0} Tracks
                              </p>
                              <p className="flex items-center gap-1">
                                <Film className="w-3.5 h-3.5 text-zinc-700" />
                                {proj.tracks?.reduce((acc, t) => acc + (t.clips?.length || 0), 0) || 0} Clips
                              </p>
                            </div>
                          </div>

                          <div className="mt-5 flex items-center justify-between border-t border-zinc-900 pt-3 text-[10px] text-zinc-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Edited {new Date(proj.updatedAt).toLocaleDateString()}
                            </span>
                            
                            <div className="flex gap-1.5">
                              <button
                                onClick={(e) => handleExportBackup(proj, e)}
                                title="Download JSON backup"
                                className="rounded-lg p-1.5 hover:bg-zinc-800 hover:text-zinc-300 text-zinc-600 transition cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => handleDeleteProject(proj.id, e)}
                                title="Delete project"
                                className="rounded-lg p-1.5 hover:bg-red-950/30 hover:text-red-400 text-zinc-650 transition cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT SIDEBAR PANEL (4 Columns on Large Screen) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            {/* Live System Status Widget */}
            <div className="glass-panel rounded-2xl p-5 relative overflow-hidden">
              <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-violet-400" /> Engine Acceleration
              </h3>
              
              <div className="space-y-4">
                {/* WebGPU Status Check */}
                <div className="flex items-center justify-between bg-zinc-950/40 border border-zinc-900 rounded-xl p-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-zinc-900 rounded-lg">
                      <Sparkles className="w-4 h-4 text-violet-400" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-zinc-500 block leading-none">GPU Renderer</span>
                      <span className="text-xs font-semibold text-zinc-300 mt-1 block">WebGPU Engine</span>
                    </div>
                  </div>
                  {webGpuStatus === 'checking' ? (
                    <span className="text-[10px] text-zinc-500 font-semibold animate-pulse">Checking...</span>
                  ) : webGpuStatus === 'active' ? (
                    <span className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded border border-emerald-950 bg-emerald-950/40 text-emerald-400 font-bold select-none animate-pulse">
                      ACTIVE
                    </span>
                  ) : (
                    <span className="text-[9px] px-2 py-0.5 rounded border border-amber-950 bg-amber-950/30 text-amber-500 font-bold select-none">
                      WASM FALLBACK
                    </span>
                  )}
                </div>

                {/* Storage Meter */}
                <div className="bg-zinc-900/40 border border-zinc-900 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-zinc-900 rounded-lg">
                        <HardDrive className="w-4 h-4 text-sky-400" />
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block leading-none">Browser Disk</span>
                        <span className="text-xs font-semibold text-zinc-300 mt-1 block">Private Sandbox</span>
                      </div>
                    </div>
                    {storageEstimate && (
                      <span className="text-xs font-mono font-bold text-sky-400">
                        {storageEstimate.percent}%
                      </span>
                    )}
                  </div>

                  {storageEstimate ? (
                    <div className="mt-3">
                      <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-sky-500 rounded-full transition-all duration-500" 
                          style={{ width: `${storageEstimate.percent}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-2 text-[9px] text-zinc-500">
                        <span>Used: {formatBytes(storageEstimate.used)}</span>
                        <span>Total Quota: {formatBytes(storageEstimate.total)}</span>
                      </div>
                    </div>
                  ) : (
                    <span className="text-[10px] text-zinc-500">Loading Storage metrics...</span>
                  )}
                </div>
              </div>

              {/* Offline-First notice */}
              <div className="mt-4 flex items-start gap-2 text-[10px] text-zinc-400 leading-snug bg-zinc-900/30 p-2.5 rounded-lg border border-zinc-900/60">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <p>
                  <strong>Private Workspace</strong>: Your video media and backup files are saved client-side. Nothing is ever uploaded to a server.
                </p>
              </div>
            </div>

            {/* Quick backup restoration Drag & Drop Area */}
            <div 
              onDragOver={(e) => { e.preventDefault(); setDragOverBackup(true); }}
              onDragLeave={() => setDragOverBackup(false)}
              onDrop={async (e) => { e.preventDefault(); setDragOverBackup(false); await handleImportBackup(e); }}
              className={`rounded-2xl border-2 border-dashed p-6 text-center transition-all duration-200 cursor-pointer relative ${
                dragOverBackup 
                  ? 'border-violet-500 bg-violet-600/5 shadow-inner' 
                  : 'border-zinc-850 bg-zinc-900/10 hover:border-zinc-750'
              }`}
            >
              <Upload className={`w-8 h-8 mx-auto mb-3 transition-transform ${dragOverBackup ? 'scale-110 text-violet-400 animate-bounce' : 'text-zinc-650'}`} />
              <h4 className="text-xs font-bold text-zinc-350">Restore Project Backup</h4>
              <p className="text-[10px] text-zinc-500 mt-1 max-w-[200px] mx-auto leading-relaxed">
                Drag and drop a project <strong>.json</strong> backup file here to restore it.
              </p>
              <input 
                type="file" 
                accept=".json" 
                onChange={handleImportBackup} 
                className="absolute inset-0 opacity-0 cursor-pointer" 
              />
            </div>

            {/* Keyboard Shortcuts Cheat Sheet side widget */}
            <div className="glass-panel rounded-2xl p-5">
              <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-sky-400" /> Hotkey Cheat Sheet
              </h3>
              
              <div className="space-y-2.5">
                {[
                  { key: 'Space', desc: 'Play / Pause Video' },
                  { key: 'S', desc: 'Split Clip at Playhead' },
                  { key: '← / →', desc: 'Scrub Playhead 1 Frame' },
                  { key: 'Shift + ← / →', desc: 'Scrub Playhead 1 Second' },
                  { key: 'Delete / Backspace', desc: 'Delete Selected Clip' },
                  { key: 'Ctrl/Cmd + Z', desc: 'Undo Action' },
                  { key: '[  /  ]', desc: 'Zoom In / Out Timeline' },
                  { key: 'Home / End', desc: 'Jump Playhead to Start/End' }
                ].map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[10px] border-b border-zinc-900/60 pb-1.5 last:border-b-0 last:pb-0">
                    <span className="text-zinc-400 leading-none">{item.desc}</span>
                    <kbd className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-950 text-sky-400 border border-zinc-850 select-none">
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Modal for Custom Project creation */}
        {isCreating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
            <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl relative animate-fade-in-up">
              <h3 className="text-lg font-bold text-zinc-100 mb-5">Create New Project</h3>
              <form onSubmit={handleCreateProject} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Project Name</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="My Stunning Video"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-550 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-2">Aspect Ratio (Format)</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { id: '16-9', label: '16:9 Landscape', icon: Tv, sub: 'YouTube' },
                      { id: '9-16', label: '9:16 Portrait', icon: Smartphone, sub: 'TikTok/Reels' },
                      { id: '1-1', label: '1:1 Square', icon: Film, sub: 'Instagram' },
                      { id: '21-9', label: '21:9 UltraWide', icon: Video, sub: 'Cinema' }
                    ].map((item) => {
                      const Icon = item.icon;
                      const selected = aspectRatio === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setAspectRatio(item.id as any)}
                          className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition cursor-pointer ${
                            selected
                              ? 'bg-violet-600/10 border-violet-500 text-violet-400 shadow-md shadow-violet-500/5'
                              : 'bg-zinc-950 border-zinc-850 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <Icon className={`w-5 h-5 mb-1.5 ${selected ? 'text-violet-400' : 'text-zinc-550'}`} />
                          <span className="text-[10px] font-bold block">{item.label.split(' ')[0]}</span>
                          <span className="text-[8px] opacity-60 block mt-0.5">{item.sub}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Resolution</label>
                    <select
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      className="w-full rounded-lg border border-zinc-850 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 focus:border-violet-500 focus:outline-none transition cursor-pointer"
                    >
                      <option value="1080p">1080p Full HD</option>
                      <option value="720p">720p HD Ready</option>
                      <option value="480p">480p Standard</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Frame Rate (FPS)</label>
                    <select
                      value={fps}
                      onChange={(e) => setFps(Number(e.target.value))}
                      className="w-full rounded-lg border border-zinc-850 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 focus:border-violet-500 focus:outline-none transition cursor-pointer"
                    >
                      <option value={30}>30 fps (Standard)</option>
                      <option value={60}>60 fps (Smooth / Gaming)</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800/80">
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-400 hover:bg-zinc-900 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-semibold rounded-lg text-white bg-violet-600 hover:bg-violet-500 hover:scale-[1.02] transition cursor-pointer shadow-lg shadow-violet-600/20"
                  >
                    Create Project
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
