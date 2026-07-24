import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Plus, Trash2, Video, Film, Folder, FolderOpen, Download, Upload, 
  Smartphone, Tv, Sparkles, Search, HardDrive, Cpu, 
  Keyboard, Clock, ShieldCheck, Settings, HelpCircle, 
  Bell, User, Scissors, MoreVertical, X, Share2, Link, Check,
  ChevronDown, ChevronRight, ChevronLeft, Volume2
} from 'lucide-react';
import { db, type Project } from '../../lib/db';
import { useEditorStore } from '../../store/editorStore';
import { deleteDirectoryFromOPFS } from '../../lib/opfs';
import jellycutLogo from '../../assets/jellycut_logo.svg';
import WatermarkRemoverTool from './WatermarkRemoverTool';
import LipSyncTool from './LipSyncTool';
import StoryCutterTool from './StoryCutterTool';
import BackgroundRemoverTool from './BackgroundRemoverTool';
import AudioDenoiserTool from './AudioDenoiserTool';
import AIVideoGeneratorTool from './AIVideoGeneratorTool';
import { BUILTIN_TEMPLATES, applyTemplate } from '../../lib/template-engine';
import { downloadProjectBackup, generateShareLink } from '../../lib/cloud-sync';

export default function Dashboard() {
  const loadProject = useEditorStore(state => state.loadProject);
  const projects = useLiveQuery(() => db.projects.reverse().sortBy('updatedAt')) || [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const projectsVersion = useMemo(() => projects.map(p => `${p.id}-${p.updatedAt?.getTime() ?? 0}`).join(','), [projects]);
  
  // Desktop layout states
  const [activeView, setActiveView] = useState<'home' | 'projects' | 'templates' | 'ai-tools' | 'ai-studio'>('home');
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [selectedTemplateCategory, setSelectedTemplateCategory] = useState<string>('all');
  const [openSettingsModal, setOpenSettingsModal] = useState(false);
  const [openHelpModal, setOpenHelpModal] = useState(false);

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
  const carouselRef = React.useRef<HTMLDivElement>(null);

  // Mobile layout state
  const [mobileTab, setMobileTab] = useState<'edit' | 'templates' | 'inbox' | 'me'>('edit');
  const [showMobileWatermarkTool, setShowMobileWatermarkTool] = useState(false);
  const [activeProjectMenuId, setActiveProjectMenuId] = useState<string | null>(null);
  const [projectToDeleteId, setProjectToDeleteId] = useState<string | null>(null);

  // Rich built-in templates from template engine
  const templates = BUILTIN_TEMPLATES;

  // Share link state
  const [shareProjectId, setShareProjectId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

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

  const handleCreateTemplate = async (template: typeof BUILTIN_TEMPLATES[0]) => {
    const newProject = applyTemplate(template);
    await db.projects.add(newProject);
    loadProject(newProject.id);
  };

  const handleShareProject = async (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setShareProjectId(project.id);
    setShareUrl(null);
    setCopiedShareLink(false);
    setIsGeneratingShare(true);
    try {
      const url = await generateShareLink(project);
      setShareUrl(url);
    } catch (err: any) {
      alert('Could not generate share link: ' + err.message);
      setShareProjectId(null);
    } finally {
      setIsGeneratingShare(false);
    }
  };

  const handleCopyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 2500);
    } catch {
      /* noop */
    }
  };

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProjectToDeleteId(projectId);
  };

  const confirmDeleteProject = async () => {
    if (!projectToDeleteId) return;
    // Delete OPFS files first. deleteDirectoryFromOPFS swallows errors silently,
    // so if it fails the DB records remain intact and the user can retry.
    // Deleting DB records first would leave orphaned OPFS files with no UI path to clean them.
    await deleteDirectoryFromOPFS(projectToDeleteId);
    const projectAssets = await db.assets.where('projectId').equals(projectToDeleteId).toArray();
    await db.assets.bulkDelete(projectAssets.map(a => a.id));
    await db.projects.delete(projectToDeleteId);
    setProjectToDeleteId(null);
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

  // Folder grouping for Story Cutter batches
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const toggleFolder = (fid: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid); else next.add(fid);
      return next;
    });
  };
  const folderMap = new Map<string, { folderName: string; projects: Project[] }>();
  const soloProjects: Project[] = [];
  for (const p of filteredProjects) {
    if (p.folderId) {
      if (!folderMap.has(p.folderId)) folderMap.set(p.folderId, { folderName: p.folderName || 'Folder', projects: [] });
      folderMap.get(p.folderId)!.projects.push(p);
    } else {
      soloProjects.push(p);
    }
  }
  const folderGroups = Array.from(folderMap.entries());


  const scrollProjects = (dir: 'left' | 'right') => {
    if (carouselRef.current) {
      const scrollAmt = dir === 'left' ? -360 : 360;
      carouselRef.current.scrollBy({ left: scrollAmt, behavior: 'smooth' });
    }
  };

  const renderHomeView = () => {
    return (
      <div className="flex flex-col gap-8 animate-fade-in-up w-full">
        {/* Hero CTA Card */}
        <div 
          onClick={() => setIsCreating(true)}
          className="hero-cta-card flex flex-col justify-center items-center text-center cursor-pointer group select-none relative"
        >
          {/* Visual shine overlay */}
          <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
          
          <div className="w-14 h-14 rounded-full bg-white text-zinc-950 flex items-center justify-center shadow-lg group-hover:scale-105 transition duration-300 mb-3 z-10">
            <Plus className="w-7 h-7 text-violet-650" />
          </div>
          <h2 className="text-lg font-black text-white tracking-tight z-10 select-none">Create New Project</h2>
          <p className="text-xs text-white/90 mt-1 max-w-md z-10 select-none">
            Start a blank canvas or import assets to begin your next video masterpiece.
          </p>
        </div>

        {/* Recent Projects Section */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
              <Film className="w-4 h-4 text-sky-400" /> Recent Projects
            </h3>
            
            {/* Slider scroll buttons + project count */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-450 select-none">
                {projects.length} project{projects.length !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => scrollProjects('left')}
                  className="w-7 h-7 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-805 text-zinc-450 hover:text-zinc-200 flex items-center justify-center cursor-pointer transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => scrollProjects('right')}
                  className="w-7 h-7 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-805 text-zinc-450 hover:text-zinc-200 flex items-center justify-center cursor-pointer transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Carousel */}
          {filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center border border-dashed border-[#27272a] bg-zinc-900/10 rounded-2xl p-12 text-center backdrop-blur-sm">
              <Film className="w-8 h-8 text-zinc-700 mb-3" />
              <h4 className="text-xs font-bold text-zinc-300">No matching projects</h4>
              <p className="text-[11px] text-zinc-500 mt-1 max-w-xs">
                {searchQuery || filterRatio !== 'all' 
                  ? 'Try adjusting your search queries or aspect filters.' 
                  : 'Create your first project above to begin editing.'}
              </p>
            </div>
          ) : (
            <div 
              ref={carouselRef}
              className="horizontal-carousel w-full"
            >
              {filteredProjects.map((proj) => {
                const durMs = getProjectDurationMs(proj);
                const ratio = proj.width / proj.height;
                let ratioLabel = '16:9';
                let previewAspect = 'aspect-video';
                if (Math.abs(ratio - 9/16) < 0.1) { ratioLabel = '9:16'; previewAspect = 'aspect-[9/16] h-[130px] mx-auto'; }
                else if (Math.abs(ratio - 1) < 0.1) { ratioLabel = '1:1'; previewAspect = 'aspect-square h-[130px] mx-auto'; }
                else if (Math.abs(ratio - 21/9) < 0.1) { ratioLabel = '21:9'; previewAspect = 'aspect-[21/9]'; }
                
                return (
                  <div 
                    key={proj.id} 
                    onClick={() => loadProject(proj.id)} 
                    className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-850/80 bg-[#18181b] hover:bg-[#202024] hover:border-zinc-700 transition duration-300 cursor-pointer hover:shadow-xl hover:shadow-violet-950/5 relative w-[220px] shrink-0"
                  >
                    {/* Visual Thumbnail */}
                    <div className="p-3 bg-zinc-950/40 border-b border-zinc-900/80 flex items-center justify-center overflow-hidden h-[130px] relative">
                      <div className={`w-full rounded bg-gradient-to-br from-zinc-800/60 to-zinc-900/60 border border-zinc-800 flex items-center justify-center relative overflow-hidden ${previewAspect} transition-transform group-hover:scale-[1.01] duration-300`}>
                        {/* Dynamic Project Thumbnail */}
                        {proj.thumbnailUrl ? (
                          <img 
                            src={proj.thumbnailUrl} 
                            className="absolute inset-0 w-full h-full object-cover rounded" 
                            alt=""
                          />
                        ) : (
                          <>
                            <div className="absolute inset-x-2 bottom-2 flex flex-col gap-1 opacity-45 pointer-events-none">
                              <div className="h-1 bg-violet-500 rounded-full w-2/3" />
                              <div className="h-1 bg-sky-500 rounded-full w-4/5" />
                              <div className="h-1 bg-zinc-650 rounded-full w-1/2" />
                            </div>
                            <div className="rounded-full bg-zinc-900/80 p-2.5 border border-zinc-800 group-hover:bg-violet-600/95 group-hover:scale-110 group-hover:border-violet-500 transition duration-300 z-10">
                              <Video className="w-4 h-4 text-zinc-400 group-hover:text-white" />
                            </div>
                          </>
                        )}
                        <div className="absolute top-1.5 right-1.5 flex gap-1.5 z-10">
                          <span className="text-[9px] tracking-wide font-bold px-1.5 py-0.5 rounded bg-black/80 text-zinc-200 border border-zinc-800 select-none">{ratioLabel}</span>
                          <span className="text-[9px] tracking-wide font-mono font-bold px-1.5 py-0.5 rounded bg-black/80 text-sky-400 border border-zinc-850 select-none">{formatTimecode(durMs)}</span>
                        </div>
                      </div>
                    </div>
                    {/* Meta info */}
                    <div className="p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <h4 className="font-bold text-zinc-200 line-clamp-1 group-hover:text-zinc-100 transition-colors text-xs">{proj.title}</h4>
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 bg-zinc-900 border border-zinc-850 rounded text-zinc-400 leading-none">{proj.width}x{proj.height}</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 bg-zinc-900 border border-zinc-850 rounded text-zinc-400 leading-none">{proj.fps} FPS</span>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-zinc-900 pt-3 text-[11px] text-zinc-500">
                        <span className="flex items-center gap-1 shrink-0"><Clock className="w-3.5 h-3.5" /> {new Date(proj.updatedAt).toLocaleDateString()}</span>
                        <div className="flex gap-1">
                          <button onClick={(e) => { e.stopPropagation(); downloadProjectBackup(proj); }} title="Download backup" className="rounded-lg p-1 hover:bg-zinc-800 hover:text-zinc-350 text-zinc-550 transition cursor-pointer"><Download className="w-3.5 h-3.5" /></button>
                          <button onClick={(e) => handleShareProject(proj, e)} title="Share link" className="rounded-lg p-1 hover:bg-violet-950/40 hover:text-violet-400 text-zinc-550 transition cursor-pointer"><Share2 className="w-3.5 h-3.5" /></button>
                          <button onClick={(e) => handleDeleteProject(proj.id, e)} title="Delete project" className="rounded-lg p-1 hover:bg-red-950/30 hover:text-red-400 text-zinc-550 transition cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Start with a Template Section */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[#27272a] pb-3 gap-3">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-400" /> Start with a Template
            </h3>
            
            {/* Category tabs */}
            <div className="flex flex-wrap gap-1">
              {['all', 'social', 'marketing', 'cinematic', 'educational', 'podcast'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedTemplateCategory(cat)}
                  className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-lg transition cursor-pointer ${
                    selectedTemplateCategory === cat
                      ? 'bg-violet-650 text-white shadow shadow-violet-950/30'
                      : 'text-zinc-400 hover:text-zinc-250 bg-[#18181b] border border-zinc-850 hover:bg-zinc-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Templates Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {templates
              .filter(temp => selectedTemplateCategory === 'all' || temp.category === selectedTemplateCategory)
              .map((temp) => {
                const ratioLabel = temp.width === 1920 && temp.height === 1080 ? '16:9'
                  : temp.width === 1080 && temp.height === 1920 ? '9:16'
                  : temp.width === 1080 && temp.height === 1080 ? '1:1'
                  : temp.width === 2560 ? '21:9'
                  : `${temp.width}×${temp.height}`;
                
                const durationLabel = temp.durationMs >= 60000
                  ? `${Math.round(temp.durationMs / 60000)}m`
                  : `${Math.round(temp.durationMs / 1000)}s`;

                return (
                  <div
                    key={temp.id}
                    onClick={() => handleCreateTemplate(temp)}
                    className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-[#27272a] bg-[#18181b] p-5 hover:bg-[#202024] hover:border-[#3f3f46] hover:shadow-xl transition duration-300 cursor-pointer`}
                  >
                    {/* Top Row info */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-600/10 text-violet-400 border border-violet-500/20">
                          {temp.category}
                        </span>
                        <span className="text-[10px] text-zinc-400 font-semibold px-2 py-0.5 bg-zinc-950/40 border border-zinc-800 rounded">
                          {ratioLabel}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">{durationLabel}</span>
                    </div>

                    {/* Miniature representation */}
                    <div className="mb-4 flex items-center justify-center h-16">
                      <div
                        className="rounded border border-[#27272a] bg-zinc-955/60 flex items-center justify-center transition-transform group-hover:scale-105 duration-300"
                        style={{
                          width: temp.height > temp.width ? '36px' : temp.width === temp.height ? '48px' : '72px',
                          height: temp.height > temp.width ? '64px' : temp.width === temp.height ? '48px' : '30px',
                        }}
                      >
                        <Film className="w-3.5 h-3.5 text-zinc-650" />
                      </div>
                    </div>

                    {/* Info */}
                    <div>
                      <h4 className="font-bold text-zinc-200 group-hover:text-white transition-colors text-xs">{temp.title}</h4>
                      <p className="text-[11px] text-zinc-550 mt-1 leading-snug line-clamp-2">{temp.description}</p>
                    </div>

                    {/* Tags */}
                    <div className="mt-3 flex flex-wrap gap-1">
                      {temp.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-850 text-zinc-500">
                          #{tag}
                        </span>
                      ))}
                    </div>

                    {/* Hover Call to Action */}
                    <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 bg-violet-650 border border-violet-500 text-white rounded-lg">
                      Use Template
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    );
  };

  const renderProjectsView = () => {
    return (
      <div className="flex flex-col gap-6 animate-fade-in-up w-full">
        {/* Projects header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[#27272a] pb-4 gap-4">
          <div>
            <h2 className="text-sm font-bold text-zinc-350 uppercase tracking-widest">All Projects</h2>
            <p className="text-xs text-zinc-500 mt-1">Manage and edit your local project timeline files.</p>
          </div>
          
          {/* Controls */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-zinc-950 border border-zinc-850 rounded-xl pl-9 pr-4 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-violet-500 focus:bg-zinc-900 transition-colors w-48"
              />
            </div>
            
            <select
              value={filterRatio}
              onChange={(e) => setFilterRatio(e.target.value)}
              className="bg-zinc-955 border border-[#27272a] rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-violet-500 transition-colors cursor-pointer"
            >
              <option value="all">All Formats</option>
              <option value="16-9">16:9 Landscape</option>
              <option value="9-16">9:16 Portrait</option>
              <option value="1-1">1:1 Square</option>
              <option value="21-9">21:9 Cinema</option>
            </select>
          </div>
        </div>

        {/* Project display */}
        {filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center border border-dashed border-[#27272a] bg-zinc-900/10 rounded-2xl p-16 text-center">
            <Film className="w-10 h-10 text-zinc-700 mb-3 animate-pulse" />
            <h3 className="text-xs font-bold text-zinc-350">No projects found</h3>
            <p className="text-[11px] text-zinc-550 mt-1">Try adapting your search parameter or filter ratios.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Folder batches */}
            {folderGroups.map(([fid, group]) => {
              const isCollapsed = collapsedFolders.has(fid);
              return (
                <div key={fid} className="rounded-2xl border border-violet-900/30 bg-violet-950/5 overflow-hidden">
                  <button
                    onClick={() => toggleFolder(fid)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-violet-950/10 transition cursor-pointer text-left"
                  >
                    {isCollapsed ? <ChevronRight className="w-4 h-4 text-violet-400" /> : <ChevronDown className="w-4 h-4 text-violet-400" />}
                    <FolderOpen className="w-4 h-4 text-violet-400" />
                    <span className="text-xs font-bold text-violet-300 flex-1 truncate">{group.folderName}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-900/40 border border-violet-850 text-violet-400 font-semibold">{group.projects.length} clips</span>
                  </button>
                  {!isCollapsed && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 pt-0">
                      {group.projects.map((proj) => renderDesktopProjectCard(proj))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Solo projects grid */}
            {soloProjects.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {soloProjects.map((proj) => renderDesktopProjectCard(proj))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderDesktopProjectCard = (proj: Project) => {
    const durMs = getProjectDurationMs(proj);
    const ratio = proj.width / proj.height;
    let ratioLabel = '16:9';
    let previewAspect = 'aspect-video';
    if (Math.abs(ratio - 9/16) < 0.1) { ratioLabel = '9:16'; previewAspect = 'aspect-[9/16] h-[130px] mx-auto'; }
    else if (Math.abs(ratio - 1) < 0.1) { ratioLabel = '1:1'; previewAspect = 'aspect-square h-[130px] mx-auto'; }
    else if (Math.abs(ratio - 21/9) < 0.1) { ratioLabel = '21:9'; previewAspect = 'aspect-[21/9]'; }

    return (
      <div 
        key={proj.id} 
        onClick={() => loadProject(proj.id)} 
        className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-850 bg-[#18181b] hover:bg-[#202024] hover:border-zinc-700 transition duration-300 cursor-pointer relative"
      >
        <div className="p-3 bg-zinc-950/40 border-b border-zinc-900/80 flex items-center justify-center overflow-hidden h-[130px] relative">
          <div className={`w-full rounded bg-gradient-to-br from-zinc-800/60 to-zinc-900/60 border border-zinc-800 flex items-center justify-center relative overflow-hidden ${previewAspect} transition-transform group-hover:scale-[1.01] duration-300`}>
            {proj.thumbnailUrl ? (
              <img 
                src={proj.thumbnailUrl} 
                className="absolute inset-0 w-full h-full object-cover rounded" 
                alt=""
              />
            ) : (
              <>
                <div className="absolute inset-x-2 bottom-2 flex flex-col gap-1 opacity-45 pointer-events-none">
                  <div className="h-1 bg-violet-500 rounded-full w-2/3" />
                  <div className="h-1 bg-sky-500 rounded-full w-4/5" />
                </div>
                <div className="rounded-full bg-zinc-900/80 p-2.5 border border-zinc-800 group-hover:bg-violet-600/95 group-hover:scale-110 group-hover:border-violet-500 transition duration-300 z-10">
                  <Video className="w-4 h-4 text-zinc-400 group-hover:text-white" />
                </div>
              </>
            )}
            <div className="absolute top-1.5 right-1.5 flex gap-1.5 z-10">
              <span className="text-[9px] tracking-wide font-bold px-1.5 py-0.5 rounded bg-black/80 text-zinc-200 border border-zinc-800">{ratioLabel}</span>
              <span className="text-[9px] tracking-wide font-mono font-bold px-1.5 py-0.5 rounded bg-black/80 text-sky-400 border border-zinc-850">{formatTimecode(durMs)}</span>
            </div>
          </div>
        </div>
        <div className="p-4 flex-1 flex flex-col justify-between">
          <div>
            <h4 className="font-bold text-zinc-200 line-clamp-1 group-hover:text-zinc-100 transition-colors text-xs">{proj.title}</h4>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className="text-[10px] font-bold px-2 py-0.5 bg-zinc-900 border border-zinc-850 rounded text-zinc-450 leading-none">{proj.width}x{proj.height}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-zinc-900 border border-zinc-850 rounded text-zinc-455 leading-none">{proj.fps} FPS</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-zinc-500">
              <p className="flex items-center gap-1"><Folder className="w-3.5 h-3.5 text-zinc-700" />{proj.tracks?.length || 0} Tracks</p>
              <p className="flex items-center gap-1"><Film className="w-3.5 h-3.5 text-zinc-700" />{proj.tracks?.reduce((acc, t) => acc + (t.clips?.length || 0), 0) || 0} Clips</p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-[#27272a] pt-3 text-[11px] text-zinc-500">
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Edited {new Date(proj.updatedAt).toLocaleDateString()}</span>
            <div className="flex gap-1">
              <button onClick={(e) => { e.stopPropagation(); downloadProjectBackup(proj); }} title="Download backup" className="rounded-lg p-1 hover:bg-zinc-800 hover:text-zinc-350 text-zinc-550 transition cursor-pointer"><Download className="w-3.5 h-3.5" /></button>
              <button onClick={(e) => handleShareProject(proj, e)} title="Share link" className="rounded-lg p-1 hover:bg-violet-950/40 hover:text-violet-400 text-zinc-550 transition cursor-pointer"><Share2 className="w-3.5 h-3.5" /></button>
              <button onClick={(e) => handleDeleteProject(proj.id, e)} title="Delete project" className="rounded-lg p-1 hover:bg-red-950/30 hover:text-red-400 text-zinc-550 transition cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTemplatesView = () => {
    return (
      <div className="flex flex-col gap-6 animate-fade-in-up w-full">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[#27272a] pb-4 gap-4">
          <div>
            <h2 className="text-sm font-bold text-zinc-350 uppercase tracking-widest">Template Gallery</h2>
            <p className="text-xs text-zinc-500 mt-1">Jumpstart your workflow with layouts crafted for popular platforms.</p>
          </div>
          
          <div className="flex flex-wrap gap-1">
            {['all', 'social', 'marketing', 'cinematic', 'educational', 'podcast'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedTemplateCategory(cat)}
                className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-lg transition cursor-pointer ${
                  selectedTemplateCategory === cat
                    ? 'bg-violet-650 text-white shadow shadow-violet-950/30'
                    : 'text-zinc-450 hover:text-zinc-200 bg-zinc-900 border border-zinc-850 hover:bg-zinc-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {templates
            .filter(temp => selectedTemplateCategory === 'all' || temp.category === selectedTemplateCategory)
            .map((temp) => {
              const ratioLabel = temp.width === 1920 && temp.height === 1080 ? '16:9'
                : temp.width === 1080 && temp.height === 1920 ? '9:16'
                : temp.width === 1080 && temp.height === 1080 ? '1:1'
                : temp.width === 2560 ? '21:9'
                : `${temp.width}×${temp.height}`;
              
              const durationLabel = temp.durationMs >= 60000
                ? `${Math.round(temp.durationMs / 60000)}m`
                : `${Math.round(temp.durationMs / 1000)}s`;

              return (
                <div
                  key={temp.id}
                  onClick={() => handleCreateTemplate(temp)}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-zinc-850 bg-[#18181b] p-5 hover:bg-[#202024] hover:border-zinc-700 transition duration-300 cursor-pointer hover:shadow-xl hover:shadow-violet-950/5 h-[230px]"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-600/10 text-violet-400 border border-violet-500/20">{temp.category}</span>
                      <span className="text-[10px] text-zinc-400 font-semibold px-2 py-0.5 bg-zinc-950/40 border border-zinc-850 rounded">{ratioLabel}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">{durationLabel}</span>
                  </div>

                  <div className="flex items-center justify-center h-16">
                    <div
                      className="rounded border border-zinc-850 bg-zinc-955/60 flex items-center justify-center transition-transform group-hover:scale-105 duration-300"
                      style={{
                        width: temp.height > temp.width ? '36px' : temp.width === temp.height ? '48px' : '72px',
                        height: temp.height > temp.width ? '64px' : temp.width === temp.height ? '48px' : '30px',
                      }}
                    >
                      <Film className="w-3.5 h-3.5 text-zinc-650" />
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-zinc-200 group-hover:text-white transition-colors text-xs">{temp.title}</h4>
                    <p className="text-[11px] text-zinc-550 mt-1 leading-snug line-clamp-2">{temp.description}</p>
                  </div>

                  <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 bg-violet-650 border border-violet-500 text-white rounded-lg">
                    Use Template
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    );
  };

  const renderAiToolsView = () => {
    return (
      <div className="flex flex-col gap-6 animate-fade-in-up w-full">
        <div>
          <h2 className="text-sm font-bold text-zinc-350 uppercase tracking-widest">AI & Advanced Tools</h2>
          <p className="text-xs text-zinc-500 mt-1">Accelerate your video edits with powerful client-side AI processing.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ✦ AI Video Generator — Featured */}
          <div
            onClick={() => setActiveView('ai-studio')}
            className="premium-card p-6 flex flex-col justify-between h-[200px] cursor-pointer group col-span-1 md:col-span-2 border border-white/10 bg-gradient-to-br from-[#141416] to-[#0e0e10]"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/15 text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-bold text-sm text-white">AI Video Studio</h4>
                  <span className="text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 bg-white text-black rounded-full">NEW</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Generate cinematic videos from text or images using Hailuo Fast ($0.19/clip) or Kling 3.0 with multi-shot storyboards, native audio, and camera controls.
                </p>
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-white group-hover:text-zinc-300 flex items-center gap-1">Open Studio &rarr;</span>
            </div>
          </div>

          {/* Story Cutter */}
          <StoryCutterTool
            renderTrigger={(open) => (
              <div 
                onClick={open}
                className="premium-card p-6 flex flex-col justify-between h-[200px] cursor-pointer group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-violet-600/10 border border-violet-500/20 text-violet-400 flex items-center justify-center shrink-0">
                    <Scissors className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-zinc-200 group-hover:text-violet-400 transition-colors">Story Cutter</h4>
                    <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
                      Split long video files into perfectly timed segments for TikTok, Instagram Reels, and YouTube Shorts with no quality loss.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end pt-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-violet-400 group-hover:text-violet-300 flex items-center gap-1">Open Tool &rarr;</span>
                </div>
              </div>
            )}
          />

          {/* Watermark Remover */}
          <WatermarkRemoverTool
            renderTrigger={(open) => (
              <div 
                onClick={open}
                className="premium-card p-6 flex flex-col justify-between h-[200px] cursor-pointer group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-zinc-200 group-hover:text-emerald-450 transition-colors">Watermark Remover</h4>
                    <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
                      Scan, detect, and erase static video and image watermarks automatically using high-accuracy client-side reverse blending.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end pt-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 group-hover:text-emerald-300 flex items-center gap-1">Open Tool &rarr;</span>
                </div>
              </div>
            )}
          />

          {/* AI Background Remover */}
          <BackgroundRemoverTool
            renderTrigger={(open) => (
              <div 
                onClick={open}
                className="premium-card p-6 flex flex-col justify-between h-[200px] cursor-pointer group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-violet-650/10 border border-violet-500/20 text-violet-400 flex items-center justify-center shrink-0">
                    <Sparkles className="w-6 h-6 text-violet-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-zinc-200 group-hover:text-violet-400 transition-colors">AI Background Remover</h4>
                    <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
                      Segment subjects and remove or replace backgrounds from video and image files locally with MediaPipe Selfie Segmentation.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end pt-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-violet-400 group-hover:text-violet-300 flex items-center gap-1">Open Tool &rarr;</span>
                </div>
              </div>
            )}
          />

          {/* AI Audio Denoiser */}
          <AudioDenoiserTool
            renderTrigger={(open) => (
              <div 
                onClick={open}
                className="premium-card p-6 flex flex-col justify-between h-[200px] cursor-pointer group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <Volume2 className="w-6 h-6 text-emerald-450" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-zinc-200 group-hover:text-emerald-450 transition-colors">AI Audio Denoiser</h4>
                    <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
                      Clean background noises, static hums, fan rumbles, and hiss from your audio and video tracks locally in browser.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end pt-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 group-hover:text-emerald-300 flex items-center gap-1">Open Tool &rarr;</span>
                </div>
              </div>
            )}
          />

          {/* AI Avatar */}
          <LipSyncTool
            renderTrigger={(open) => (
              <div 
                onClick={open}
                className="premium-card p-6 flex flex-col justify-between h-[200px] cursor-pointer group col-span-1 md:col-span-2"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-sky-600/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-zinc-200 group-hover:text-sky-400 transition-colors">Jellycut 3D AI Avatar</h4>
                    <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
                      Animate static face portrait images to sync perfectly with natural head movements, blinks, and vocal audio tracks. Runs completely in private sandbox.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end pt-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400 group-hover:text-sky-300 flex items-center gap-1">Open Tool &rarr;</span>
                </div>
              </div>
            )}
          />
        </div>
      </div>
    );
  };

  const renderRightPanel = () => {
    return (
      <div className="flex flex-col gap-6 p-5 h-full overflow-y-auto animate-slide-in">
        {/* Title */}
        <div>
          <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest leading-none">AI Quick Tools</h3>
          <p className="text-[10px] text-zinc-500 mt-1.5 leading-none">Contextual background helpers</p>
        </div>

        {/* AI Quick triggers */}
        <div className="flex flex-col gap-3">
          <StoryCutterTool
            renderTrigger={(open) => (
              <div 
                onClick={open}
                className="flex items-center justify-between p-3 rounded-xl border border-zinc-850 hover:border-zinc-800 bg-[#202024] hover:bg-zinc-900/60 cursor-pointer transition group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-violet-600/10 border border-violet-500/20 text-violet-400 flex items-center justify-center shrink-0">
                    <Scissors className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-[11px] text-zinc-200 leading-tight">Story Cutter</h4>
                    <span className="text-[9px] text-zinc-500">Split video files</span>
                  </div>
                </div>
                <span className="text-zinc-550 text-xs font-semibold select-none group-hover:text-zinc-350">&gt;</span>
              </div>
            )}
          />

          <WatermarkRemoverTool
            renderTrigger={(open) => (
              <div 
                onClick={open}
                className="flex items-center justify-between p-3 rounded-xl border border-zinc-850 hover:border-zinc-800 bg-[#202024] hover:bg-zinc-900/60 cursor-pointer transition group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-[11px] text-zinc-200 leading-tight">Watermark Remover</h4>
                    <span className="text-[9px] text-zinc-500">Erase text logo</span>
                  </div>
                </div>
                <span className="text-zinc-550 text-xs font-semibold select-none group-hover:text-zinc-350">&gt;</span>
              </div>
            )}
          />

          <BackgroundRemoverTool
            renderTrigger={(open) => (
              <div 
                onClick={open}
                className="flex items-center justify-between p-3 rounded-xl border border-zinc-850 hover:border-zinc-800 bg-[#202024] hover:bg-zinc-900/60 cursor-pointer transition group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-violet-650/10 border border-violet-500/20 text-violet-400 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-[11px] text-zinc-200 leading-tight">BG Remover</h4>
                    <span className="text-[9px] text-zinc-500">Erase background</span>
                  </div>
                </div>
                <span className="text-zinc-550 text-xs font-semibold select-none group-hover:text-zinc-350">&gt;</span>
              </div>
            )}
          />

          <AudioDenoiserTool
            renderTrigger={(open) => (
              <div 
                onClick={open}
                className="flex items-center justify-between p-3 rounded-xl border border-zinc-850 hover:border-zinc-800 bg-[#202024] hover:bg-zinc-900/60 cursor-pointer transition group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-[11px] text-zinc-200 leading-tight">Audio Denoiser</h4>
                    <span className="text-[9px] text-zinc-500">Clean room noise</span>
                  </div>
                </div>
                <span className="text-zinc-550 text-xs font-semibold select-none group-hover:text-zinc-350">&gt;</span>
              </div>
            )}
          />

          {/* AI Video Generator quick card */}
          <div
            onClick={() => { setActiveView('ai-studio'); setIsRightPanelOpen(false); }}
            className="flex items-center justify-between p-3 rounded-xl border border-zinc-850 hover:border-zinc-800 bg-[#202024] hover:bg-zinc-900/60 cursor-pointer transition group"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/15 text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-[11px] text-zinc-200 leading-tight">AI Video Studio</h4>
                <span className="text-[9px] text-zinc-500">Generate from text/image</span>
              </div>
            </div>
            <span className="text-zinc-550 text-xs font-semibold select-none group-hover:text-zinc-350">&gt;</span>
          </div>

          <LipSyncTool
            renderTrigger={(open) => (
              <div 
                onClick={open}
                className="flex items-center justify-between p-3 rounded-xl border border-zinc-850 hover:border-zinc-800 bg-[#202024] hover:bg-zinc-900/60 cursor-pointer transition group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-sky-600/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-[11px] text-zinc-200 leading-tight">LipSync Avatar</h4>
                    <span className="text-[9px] text-zinc-500">Animate voice portrait</span>
                  </div>
                </div>
                <span className="text-zinc-550 text-xs font-semibold select-none group-hover:text-zinc-350">&gt;</span>
              </div>
            )}
          />
        </div>

        {/* Acceleration accordion */}
        <div className="flex flex-col gap-3 border-t border-[#27272a] pt-4">
          <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1"><Cpu className="w-3.5 h-3.5 text-violet-400" /> Engine Status</h4>
          
          <div className="bg-[#202024] border border-zinc-850 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-300 font-bold">GPU Engine</span>
              {webGpuStatus === 'active' ? (
                <span className="text-[9px] px-2 py-0.5 rounded border border-emerald-950 bg-emerald-950/40 text-emerald-400 font-bold select-none">WebGPU</span>
              ) : (
                <span className="text-[9px] px-2 py-0.5 rounded border border-amber-950 bg-amber-950/40 text-amber-550 font-bold select-none">WASM</span>
              )}
            </div>
            
            {storageEstimate && (
              <div className="mt-3">
                <div className="flex justify-between items-center text-[10px] text-zinc-450 mb-1">
                  <span>Sandbox disk space</span>
                  <span className="font-mono text-sky-400">{storageEstimate.percent}%</span>
                </div>
                <div className="w-full h-1 bg-zinc-950 rounded-full overflow-hidden">
                  <div className="h-full bg-sky-500 rounded-full" style={{ width: `${storageEstimate.percent}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Shortcuts Accordion collapsible widget */}
        <div className="border-t border-[#27272a] pt-4 mt-auto">
          <details className="group cursor-pointer">
            <summary className="list-none flex items-center justify-between text-[11px] font-bold text-zinc-400 uppercase tracking-wider select-none">
              <span className="flex items-center gap-1.5"><Keyboard className="w-3.5 h-3.5 text-zinc-500" /> Hotkey Shortcuts</span>
              <span className="text-zinc-550 transition-transform group-open:rotate-180">&darr;</span>
            </summary>
            <div className="space-y-2 mt-3 pt-2 border-t border-zinc-900/60">
              {[
                { key: 'Space', desc: 'Play / Pause Video' },
                { key: 'S', desc: 'Split Clip at Playhead' },
                { key: '← / →', desc: 'Scrub 1 Frame' },
                { key: 'Shift + ← / →', desc: 'Scrub 1 Second' },
                { key: 'Del / Backspace', desc: 'Delete Selected Clip' },
                { key: 'Cmd/Ctrl + Z', desc: 'Undo' },
              ].map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-[10px]">
                  <span className="text-zinc-450 leading-none">{item.desc}</span>
                  <kbd className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-zinc-950 text-sky-400 border border-zinc-850 select-none">
                    {item.key}
                  </kbd>
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>
    );
  };

  const renderSettingsModal = () => {
    if (!openSettingsModal) return null;
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in-up">
        <div className="w-full max-w-md rounded-2xl border border-[#27272a] bg-[#18181b] p-6 shadow-2xl relative">
          <button 
            onClick={() => setOpenSettingsModal(false)}
            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
          <h3 className="text-sm font-bold text-zinc-100 mb-4 flex items-center gap-2">
            <Settings className="w-4.5 h-4.5 text-violet-400" />
            Jellycut Settings
          </h3>
          <div className="space-y-4 text-xs text-zinc-300">
            <div className="flex justify-between items-center border-b border-zinc-850 pb-3">
              <span>Client Sandbox System</span>
              <span className="font-bold text-emerald-400 uppercase">Offline-First</span>
            </div>
            <div className="flex justify-between items-center border-b border-zinc-850 pb-3">
              <span>WASM Rendering Mode</span>
              <span className="font-mono text-zinc-450">Multi-Threaded SAB</span>
            </div>
            <div className="flex justify-between items-center border-b border-zinc-850 pb-3">
              <span>WebGPU Hardware Acceleration</span>
              <span className="text-sky-400 font-bold uppercase">{webGpuStatus}</span>
            </div>
            <div className="pt-2">
              <label className="flex items-center justify-center gap-2 w-full py-2.5 text-xs font-semibold rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-850 transition cursor-pointer text-zinc-200">
                <Upload className="w-4 h-4 text-sky-400" />
                Import Project Backup (.json)
                <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
              </label>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderHelpModal = () => {
    if (!openHelpModal) return null;
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in-up">
        <div className="w-full max-w-md rounded-2xl border border-[#27272a] bg-[#18181b] p-6 shadow-2xl relative">
          <button 
            onClick={() => setOpenHelpModal(false)}
            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-550 hover:text-zinc-200 transition cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
          <h3 className="text-sm font-bold text-zinc-100 mb-2 flex items-center gap-2">
            <HelpCircle className="w-4.5 h-4.5 text-violet-400" />
            Jellycut Studio v1.0
          </h3>
          <p className="text-xs text-zinc-400 leading-relaxed mb-4">
            Jellycut is an offline-first video editor. Everything runs client-side in private sandbox directories.
          </p>
          <div className="bg-zinc-955 p-3 rounded-xl border border-zinc-850 text-[11px] text-zinc-500 leading-relaxed">
            <span className="font-bold text-zinc-350 block mb-1">Architecture stack:</span>
            - WebGPU Engine for real-time adjustments<br />
            - FFMPEG Wasm for fast stream splitting<br />
            - IndexedDB Dexie database cache
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard-root flex-1 overflow-hidden relative text-zinc-100">
      
      {/* DESKTOP SIDE BAR RAIL (Hidden on mobile) */}
      <div className="hidden md:flex flex-col items-center justify-between py-6 px-3 bg-[#18181b] border-r border-[#27272a] shrink-0 h-full w-[70px]">
        {/* Top Logo */}
        <div className="flex flex-col items-center gap-6 w-full">
          <div className="w-10 h-10 rounded-xl bg-violet-650 flex items-center justify-center font-bold text-white shadow shadow-violet-955/20 select-none">
            JC
          </div>
          
          {/* Nav Items */}
          <div className="flex flex-col gap-3 w-full">
            {[
              { id: 'home', label: 'Home', icon: Tv },
              { id: 'projects', label: 'Projects', icon: Folder },
              { id: 'templates', label: 'Templates', icon: Sparkles },
              { id: 'ai-tools', label: 'AI Tools', icon: Cpu },
              { id: 'ai-studio', label: 'AI Studio', icon: Sparkles },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeView === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveView(tab.id as any);
                    if (tab.id === 'ai-tools') {
                      setIsRightPanelOpen(true);
                    }
                  }}
                  title={tab.label}
                  className={`nav-rail-item w-full ${active ? 'active' : ''}`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[9px] font-bold tracking-wide mt-0.5 leading-none">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="flex flex-col gap-3 w-full">
          <button
            onClick={() => setOpenSettingsModal(true)}
            title="Settings"
            className="nav-rail-item w-full"
          >
            <Settings className="w-5 h-5 text-zinc-450 hover:text-zinc-205" />
            <span className="text-[9px] font-bold tracking-wide mt-0.5 leading-none">Settings</span>
          </button>
          <button
            onClick={() => setOpenHelpModal(true)}
            title="Help & Info"
            className="nav-rail-item w-full"
          >
            <HelpCircle className="w-5 h-5 text-zinc-455 hover:text-zinc-205" />
            <span className="text-[9px] font-bold tracking-wide mt-0.5 leading-none">Help</span>
          </button>
        </div>
      </div>

      {/* MAIN VIEW AREA */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#111113]">
        
        {/* Desktop Content Panel */}
        <div className="hidden md:flex flex-col flex-1 h-full overflow-y-auto p-6 lg:p-8 relative">
          {/* Glow effects */}
          <div className="absolute top-0 left-1/4 w-[600px] h-[600px] purple-glow-accent rounded-full blur-[140px] pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] blue-glow-accent rounded-full blur-[120px] pointer-events-none" />

          {/* Subview Rendering */}
          {activeView === 'home' && renderHomeView()}
          {activeView === 'projects' && renderProjectsView()}
          {activeView === 'templates' && renderTemplatesView()}
          {activeView === 'ai-tools' && renderAiToolsView()}
          {activeView === 'ai-studio' && (
            <div className="absolute inset-0 z-10 bg-[#0a0a0c]">
              <AIVideoGeneratorTool inline onClose={() => setActiveView('ai-tools')} />
            </div>
          )}
        </div>

        {/* MOBILE VIEW (Unchanged core logic) */}
        <div className="block md:hidden flex-1 overflow-y-auto h-full pb-24 px-4 pt-4 relative z-10 animate-fade-in-up w-full max-w-full overflow-x-hidden">
          {mobileTab === 'edit' && (
            <>
              {/* Mobile Header */}
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <img src={jellycutLogo} className="h-6 w-auto" alt="Jellycut" />
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-violet-500/25 bg-violet-500/10 text-violet-400 font-bold tracking-wide">
                    PRO
                  </span>
                </div>
                <div className="flex items-center gap-3 text-zinc-400">
                  <Search className="w-5 h-5 cursor-pointer hover:text-zinc-205" />
                  <HelpCircle className="w-5 h-5 cursor-pointer hover:text-zinc-205" />
                  <Settings className="w-5 h-5 cursor-pointer hover:text-zinc-205" />
                </div>
              </div>

              {/* Story Cutter Quick Tool Card */}
              <StoryCutterTool
                renderTrigger={(open) => (
                  <div 
                    onClick={open}
                    className="bg-zinc-900/40 border border-zinc-850 rounded-2xl p-4 mb-3 flex items-center justify-between cursor-pointer hover:border-violet-500/30 transition group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-400 flex items-center justify-center group-hover:scale-105 transition">
                        <Scissors className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-xs text-zinc-200">Story Cutter</h4>
                        <p className="text-[10px] text-zinc-500 mt-0.5">Seamlessly split long videos into perfectly timed segments</p>
                      </div>
                    </div>
                    <span className="text-zinc-500 group-hover:text-zinc-300 transition text-xs font-semibold mr-1">&gt;</span>
                  </div>
                )}
              />

              {/* Watermark Remover Quick Tool Card */}
              <div 
                onClick={() => setShowMobileWatermarkTool(true)}
                className="bg-zinc-900/40 border border-zinc-855 rounded-2xl p-4 mb-3 flex items-center justify-between cursor-pointer hover:border-violet-500/30 transition group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-zinc-200">Gemini Watermark Remover</h4>
                    <p className="text-[10px] text-zinc-550 mt-0.5">Scan and erase video watermarks automatically</p>
                  </div>
                </div>
                <span className="text-zinc-550 group-hover:text-zinc-355 transition text-xs font-semibold mr-1">&gt;</span>
              </div>

              {/* Wav2Lip Lipsync Quick Tool Card */}
              <LipSyncTool
                renderTrigger={(open) => (
                  <div 
                    onClick={open}
                    className="bg-zinc-900/40 border border-zinc-850 rounded-2xl p-4 mb-6 flex items-center justify-between cursor-pointer hover:border-violet-500/30 transition group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-400 flex items-center justify-center group-hover:scale-105 transition">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-xs text-zinc-200">Jellycut 3D AI Avatar</h4>
                        <p className="text-[10px] text-zinc-500 mt-0.5">Sync face portraits to spoken voice clips locally</p>
                      </div>
                    </div>
                    <span className="text-zinc-500 group-hover:text-zinc-300 transition text-xs font-semibold mr-1">&gt;</span>
                  </div>
                )}
              />

              {/* New Project Gradient Button */}
              <div 
                onClick={() => setIsCreating(true)}
                className="bg-gradient-to-r from-sky-500 via-violet-600 to-fuchsia-600 rounded-2xl p-6 mb-6 flex flex-col items-center justify-center gap-3 cursor-pointer shadow-lg shadow-violet-950/20 active:scale-[0.98] transition duration-200"
              >
                <div className="w-10 h-10 rounded-full bg-white text-zinc-955 flex items-center justify-center font-bold">
                  <Plus className="w-6 h-6" />
                </div>
                <span className="font-bold text-sm text-white">New project</span>
              </div>

              {/* Explore Section */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-xs font-bold text-zinc-450 uppercase tracking-wider">Explore</h3>
                  <span className="text-[10px] text-zinc-550 cursor-pointer">View all &gt;</span>
                </div>
                <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 w-full max-w-full">
                  {templates.map((temp) => {
                    const ratioLabel = temp.width === 1920 && temp.height === 1080 ? '16:9'
                      : temp.width === 1080 && temp.height === 1920 ? '9:16'
                      : temp.width === 1080 && temp.height === 1080 ? '1:1'
                      : temp.width === 2560 ? '21:9'
                      : `${temp.width}×${temp.height}`;
                    return (
                      <div
                        key={temp.id}
                        onClick={() => handleCreateTemplate(temp)}
                        className={`flex-none w-36 rounded-xl border border-zinc-850 p-3 bg-gradient-to-br ${temp.gradient} flex flex-col justify-between h-24 cursor-pointer`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="w-7 h-7 rounded-lg bg-zinc-900/60 border border-zinc-800 flex items-center justify-center">
                            <Film className="w-4 h-4 text-zinc-550" />
                          </div>
                          <span className="text-[8px] text-zinc-555 px-1 bg-zinc-900/50 rounded border border-zinc-800">{ratioLabel}</span>
                        </div>
                        <span className="font-semibold text-[10px] text-zinc-200 truncate">{temp.title}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Projects Section */}
              <div>
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-zinc-900">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-sky-400" /> Projects
                  </h3>
                  <div className="flex items-center gap-2">
                    <button className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded bg-zinc-900 border border-zinc-805 text-zinc-400">
                      <HardDrive className="w-3 h-3 text-sky-400" /> Space
                    </button>
                  </div>
                </div>

                {/* Projects List */}
                {filteredProjects.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-zinc-850 rounded-xl bg-zinc-900/10">
                    <Film className="w-8 h-8 text-zinc-750 mx-auto mb-2" />
                    <p className="text-xs text-zinc-500">No projects yet. Tap 'New project' to start!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredProjects.map((proj) => {
                      const durMs = getProjectDurationMs(proj);
                      const ratio = proj.width / proj.height;
                      let ratioLabel = '16:9';
                      if (Math.abs(ratio - 9/16) < 0.1) ratioLabel = '9:16';
                      else if (Math.abs(ratio - 1) < 0.1) ratioLabel = '1:1';
                      else if (Math.abs(ratio - 21/9) < 0.1) ratioLabel = '21:9';

                      return (
                        <div 
                          key={proj.id} 
                          onClick={() => loadProject(proj.id)}
                          className="flex items-center gap-3 p-2.5 bg-zinc-900/35 border border-zinc-850 rounded-xl active:bg-zinc-900/60 transition cursor-pointer relative"
                        >
                          {/* Preview */}
                          <div className="w-16 h-12 bg-zinc-950 rounded-lg border border-zinc-800 flex items-center justify-center relative overflow-hidden shrink-0">
                            <Video className="w-4 h-4 text-zinc-650" />
                            <span className="absolute bottom-0.5 right-0.5 text-[7px] font-mono bg-black/80 text-sky-400 px-1 rounded">
                              {formatTimecode(durMs)}
                            </span>
                            <span className="absolute top-0.5 left-0.5 text-[7px] bg-black/80 text-zinc-300 px-1 rounded">
                              {ratioLabel}
                            </span>
                          </div>
                          {/* Meta */}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-xs text-zinc-200 truncate">{proj.title}</h4>
                            <p className="text-[9px] text-zinc-550 mt-0.5">{proj.width}x{proj.height} • {proj.fps} FPS</p>
                            <p className="text-[9px] text-zinc-555 mt-0.5">Edited {new Date(proj.updatedAt).toLocaleDateString()}</p>
                          </div>
                          {/* Options */}
                          <div className="relative">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveProjectMenuId(activeProjectMenuId === proj.id ? null : proj.id);
                              }}
                              className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-550 hover:text-zinc-300 transition"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {activeProjectMenuId === proj.id && (
                              <div className="absolute right-0 top-6 z-30 w-32 rounded-xl border border-zinc-805 bg-zinc-900 p-1 shadow-xl">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleExportBackup(proj, e); setActiveProjectMenuId(null); }}
                                  className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 text-[10px] text-zinc-350 hover:bg-zinc-800 rounded-lg transition"
                                >
                                  <Download className="w-3.5 h-3.5 text-zinc-400" />
                                  Export
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteProject(proj.id, e); setActiveProjectMenuId(null); }}
                                  className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 text-[10px] text-red-455 hover:bg-red-955/20 rounded-lg transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Templates Tab */}
          {mobileTab === 'templates' && (
            <div>
              <h3 className="text-sm font-bold text-zinc-200 mb-4 pb-2 border-b border-zinc-905 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-400" />
                Templates
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {templates.map((temp) => {
                  const ratioLabel = temp.width === 1920 && temp.height === 1080 ? '16:9'
                    : temp.width === 1080 && temp.height === 1920 ? '9:16'
                    : temp.width === 1080 && temp.height === 1080 ? '1:1'
                    : temp.width === 2560 ? '21:9'
                    : `${temp.width}×${temp.height}`;
                  return (
                    <div
                      key={temp.id}
                      onClick={() => handleCreateTemplate(temp)}
                      className={`rounded-xl border border-zinc-850 p-4 bg-gradient-to-br ${temp.gradient} flex flex-col justify-between h-32 cursor-pointer hover:border-violet-500/50 transition`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="w-8 h-8 rounded-lg bg-zinc-900/60 border border-zinc-800 flex items-center justify-center">
                          <Film className="w-4 h-4 text-zinc-405" />
                        </div>
                        <span className="text-[9px] text-zinc-550 px-1.5 py-0.5 bg-zinc-900/50 rounded border border-zinc-800">{ratioLabel}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-xs text-zinc-100 block truncate">{temp.title}</span>
                        <span className="text-[9px] text-zinc-555 block truncate mt-1">{temp.description}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Inbox Tab */}
          {mobileTab === 'inbox' && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Bell className="w-12 h-12 text-zinc-755 mb-3 animate-pulse" />
              <h4 className="font-bold text-zinc-350 text-sm">Notifications</h4>
              <p className="text-xs text-zinc-505 mt-1 max-w-[200px]">All caught up! You have no new messages or alerts at this time.</p>
            </div>
          )}

          {/* Me Tab */}
          {mobileTab === 'me' && (
            <div className="space-y-6">
              {/* Profile */}
              <div className="flex items-center gap-4 bg-zinc-905 border border-zinc-850 p-4 rounded-2xl">
                <div className="w-12 h-12 rounded-full bg-violet-650 flex items-center justify-center font-bold text-white text-lg">
                  J
                </div>
                <div>
                  <h4 className="font-bold text-zinc-200 text-sm">Jellycut Creator</h4>
                  <span className="text-[9px] mt-0.5 px-2 py-0.5 inline-block rounded bg-violet-600/20 text-violet-400 border border-violet-500/30 font-bold">
                    PRO MEMBER
                  </span>
                </div>
              </div>

              {/* Storage Estimate */}
              <div className="bg-zinc-905 border border-zinc-855 p-4 rounded-2xl">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-sky-400" /> Storage Sandbox
                </h3>
                {storageEstimate ? (
                  <div>
                    <div className="flex justify-between items-center text-xs font-semibold text-zinc-300 mb-1.5">
                      <span>Browser sandbox usage</span>
                      <span className="font-mono text-sky-400">{storageEstimate.percent}%</span>
                    </div>
                    <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden">
                      <div className="h-full bg-sky-500 rounded-full transition-all duration-300" style={{ width: `${storageEstimate.percent}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-zinc-500 mt-2">
                      <span>Used: {formatBytes(storageEstimate.used)}</span>
                      <span>Total Quota: {formatBytes(storageEstimate.total)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">Loading storage metrics...</p>
                )}
              </div>

              {/* GPU Status */}
              <div className="bg-zinc-905 border border-zinc-850 p-4 rounded-2xl flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-violet-400" />
                  <span className="text-xs font-bold text-zinc-300">GPU Acceleration</span>
                </div>
                {webGpuStatus === 'active' ? (
                  <span className="text-[9px] px-2 py-0.5 bg-emerald-950/40 border border-emerald-900 text-emerald-400 font-bold rounded">
                    WEBGL/WEBGPU ACTIVE
                  </span>
                ) : (
                  <span className="text-[9px] px-2 py-0.5 bg-amber-950/40 border border-amber-900 text-amber-550 font-bold rounded">
                    WASM FALLBACK
                  </span>
                )}
              </div>

              {/* Restore/Import Backup button */}
              <div className="bg-zinc-905 border border-zinc-850 p-4 rounded-2xl">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-violet-400" /> Backup Management
                </h3>
                <p className="text-[10px] text-zinc-500 mb-3 leading-relaxed">Restore previous project configurations by selecting a JSON backup file below.</p>
                <label className="flex items-center justify-center gap-2 w-full py-2.5 text-xs font-semibold rounded-xl border border-zinc-805 bg-zinc-900 hover:bg-zinc-855 transition cursor-pointer text-zinc-200">
                  <Upload className="w-4 h-4 text-sky-400" />
                  Select Backup File
                  <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
                </label>
              </div>

              {/* Offline notice */}
              <div className="flex items-start gap-2 bg-zinc-950/40 border border-zinc-900 p-3 rounded-xl text-[10px] text-zinc-550">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                <p>Jellycut operates offline-first. Your projects and assets remain completely local inside this browser sandbox.</p>
              </div>
            </div>
          )}

          {/* Mobile Sticky Bottom Nav Bar */}
          <div className="fixed bottom-0 inset-x-0 bg-zinc-900 border-t border-zinc-800 py-2.5 px-6 flex justify-between items-center z-45 safe-bottom-padding">
            {[
              { id: 'edit', label: 'Edit', icon: Scissors },
              { id: 'templates', label: 'Templates', icon: Sparkles },
              { id: 'inbox', label: 'Inbox', icon: Bell },
              { id: 'me', label: 'Me', icon: User }
            ].map((tab) => {
              const Icon = tab.icon;
              const active = mobileTab === tab.id;
              return (
                <button 
                  key={tab.id}
                  onClick={() => setMobileTab(tab.id as any)}
                  className={`flex flex-col items-center gap-1 cursor-pointer transition ${
                    active ? 'text-violet-405' : 'text-zinc-500 hover:text-zinc-350'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[9px] font-bold">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT SIDEBAR PANEL (Collapsible, hidden on mobile) */}
      <div 
        className={`hidden md:flex flex-col bg-[#18181b] border-l border-[#27272a] h-full shrink-0 transition-all duration-300 relative ${
          isRightPanelOpen ? 'w-[280px]' : 'w-0 border-l-0 overflow-hidden'
        }`}
      >
        {/* Toggle Collapse Tab Button */}
        <button
          onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
          className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border border-[#27272a] bg-[#202024] hover:bg-[#27272a] text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer transition shadow z-40"
        >
          {isRightPanelOpen ? <ChevronRight className="w-3.5 h-3.5 animate-pulse" /> : <ChevronLeft className="w-3.5 h-3.5 animate-pulse" />}
        </button>

        {isRightPanelOpen && renderRightPanel()}
      </div>

      {/* MODALS / OVERLAYS */}
      {/* Modal for Custom Project creation */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#18181b] p-6 shadow-2xl relative animate-fade-in-up">
            <h3 className="text-sm font-bold text-zinc-100 mb-5">Create New Project</h3>
            <form onSubmit={handleCreateProject} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Project Name</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="My Stunning Video"
                  className="w-full rounded-lg border border-zinc-805 bg-zinc-950 px-4 py-2.5 text-xs text-zinc-150 focus:border-violet-500 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-450 mb-2">Aspect Ratio (Format)</label>
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
                            ? 'bg-violet-650/10 border-violet-500 text-violet-400 shadow-md shadow-violet-500/5'
                            : 'bg-zinc-950 border-zinc-850 hover:border-zinc-700 text-zinc-450 hover:text-zinc-200'
                        }`}
                      >
                        <Icon className={`w-5 h-5 mb-1.5 ${selected ? 'text-violet-400' : 'text-zinc-550'}`} />
                        <span className="text-[10px] font-bold block">{item.label.split(' ')[0]}</span>
                        <span className="text-[9px] opacity-60 block mt-0.5">{item.sub}</span>
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
                    className="w-full rounded-lg border border-zinc-850 bg-zinc-950 px-4 py-2.5 text-xs text-zinc-150 focus:border-violet-500 focus:outline-none transition cursor-pointer"
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
                    className="w-full rounded-lg border border-zinc-855 bg-zinc-955 px-4 py-2.5 text-xs text-zinc-150 focus:border-violet-500 focus:outline-none transition cursor-pointer"
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
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-[#27272a] bg-zinc-950 text-zinc-450 hover:bg-zinc-900 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold rounded-lg text-white bg-violet-600 hover:bg-violet-500 hover:scale-[1.02] transition cursor-pointer shadow-lg shadow-violet-600/20"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mobile Watermark Remover Full Screen Overlay */}
      {showMobileWatermarkTool && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-955 p-4 pb-12">
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-zinc-855">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              Gemini Watermark Remover
            </h3>
            <button 
              onClick={() => setShowMobileWatermarkTool(false)}
              className="p-1 hover:bg-zinc-805 rounded-lg text-zinc-405"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <WatermarkRemoverTool />
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {projectToDeleteId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in-up">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#18181b] p-6 shadow-2xl relative">
            <h3 className="text-sm font-bold text-zinc-100 mb-2">Delete Project?</h3>
            <p className="text-xs text-zinc-550 mb-6 leading-relaxed">
              Are you sure you want to delete this project? All local media files inside this project will be deleted permanently. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setProjectToDeleteId(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-450 hover:text-zinc-200 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteProject}
                className="px-4 py-2 text-xs font-bold rounded-lg text-white bg-red-650 hover:bg-red-600 transition cursor-pointer shadow-lg shadow-red-955/20"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Link Modal */}
      {shareProjectId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in-up">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#18181b] p-6 shadow-2xl relative">
            <button
              onClick={() => { setShareProjectId(null); setShareUrl(null); }}
              className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-zinc-805 text-zinc-550 hover:text-zinc-200 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/20 flex items-center justify-center">
                <Share2 className="w-4 h-4 text-violet-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100">Share Project</h3>
                <p className="text-[10px] text-zinc-500">Generate a shareable link for this project</p>
              </div>
            </div>

            {isGeneratingShare ? (
              <div className="py-8 flex flex-col items-center gap-3">
                <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-zinc-400">Generating link...</p>
              </div>
            ) : shareUrl ? (
              <div className="space-y-3">
                <p className="text-[10px] text-zinc-400 leading-relaxed">
                  Your project has been encoded as a portable link. Recipients can import it back into Jellycut using <strong>Import Backup</strong>.
                </p>
                <div className="flex gap-2">
                  <div className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-[10px] font-mono text-zinc-550 overflow-hidden text-ellipsis whitespace-nowrap">
                    {shareUrl.startsWith('data:') ? '(Encoded project data — click Copy to copy)' : shareUrl}
                  </div>
                  <button
                    onClick={handleCopyShareLink}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                      copiedShareLink
                        ? 'bg-emerald-600/20 border border-emerald-500/30 text-emerald-400'
                        : 'bg-violet-600 hover:bg-violet-500 text-white'
                    }`}
                  >
                    {copiedShareLink ? <Check className="w-3.5 h-3.5" /> : <Link className="w-3.5 h-3.5" />}
                    {copiedShareLink ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="text-[9px] text-zinc-650 leading-relaxed">
                  💡 Tip: If a cloud endpoint (VITE_CLOUD_ENDPOINT) is configured, a real public URL is returned instead.
                </p>
              </div>
            ) : (
              <p className="text-xs text-zinc-500 py-4 text-center">No link generated yet.</p>
            )}
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {renderSettingsModal()}

      {/* Help Modal */}
      {renderHelpModal()}

    </div>
  );
}
