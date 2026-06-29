import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2, Video, Film, Folder, Download, Upload, Smartphone, Tv, Sparkles } from 'lucide-react';
import { db, type Project } from '../../lib/db';
import { useEditorStore } from '../../store/editorStore';
import { deleteDirectoryFromOPFS } from '../../lib/opfs';

export default function Dashboard() {
  const loadProject = useEditorStore(state => state.loadProject);
  const projects = useLiveQuery(() => db.projects.reverse().sortBy('updatedAt')) || [];
  
  // New Project Form State
  const [title, setTitle] = useState('');
  const [resolution, setResolution] = useState('1080p');
  const [aspectRatio, setAspectRatio] = useState<'16-9' | '9-16' | '1-1' | '21-9'>('16-9');
  const [fps, setFps] = useState(30);
  const [isCreating, setIsCreating] = useState(false);

  const templates = [
    { id: 'yt', title: 'YouTube Landscape', ratio: '16-9', w: 1920, h: 1080, icon: Tv, bg: 'from-blue-600 to-indigo-900', desc: '16:9 • Standard horizontal video' },
    { id: 'tiktok', title: 'TikTok / Reel', ratio: '9-16', w: 1080, h: 1920, icon: Smartphone, bg: 'from-pink-600 to-rose-900', desc: '9:16 • Mobile portrait video' },
    { id: 'insta', title: 'Instagram Square', ratio: '1-1', w: 1080, h: 1080, icon: Film, bg: 'from-purple-650 to-pink-900', desc: '1:1 • Square post format' },
    { id: 'cinematic', title: 'Cinematic Short', ratio: '21-9', w: 2560, h: 1080, icon: Video, bg: 'from-emerald-600 to-teal-900', desc: '21:9 • Ultra-wide aspect ratio' }
  ];

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
      await db.projects.delete(projectId);
      const projectAssets = await db.assets.where('projectId').equals(projectId).toArray();
      await db.assets.bulkDelete(projectAssets.map(a => a.id));
      await deleteDirectoryFromOPFS(projectId);
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

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
      } catch (err) {
        alert('Error parsing JSON backup file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-950 p-8 text-zinc-100 relative">
      {/* Visual background accents */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-violet-650/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-sky-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="mx-auto max-w-6xl relative z-10">
        {/* Header */}
        <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-500 bg-clip-text text-transparent">
              CapCut Studio Pro
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Offline-first professional browser video editor. Your files never leave your device.
            </p>
          </div>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/80 hover:border-zinc-700 cursor-pointer transition text-zinc-300 backdrop-blur-sm">
              <Upload className="w-4 h-4 text-violet-400" />
              Import Project
              <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
            </label>
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-500 hover:scale-[1.02] transition shadow-lg shadow-violet-600/30 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New Project
            </button>
          </div>
        </div>

        {/* Start with a Template Section */}
        <div className="mb-12">
          <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-violet-400" /> Start with a Template
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {templates.map((temp) => {
              const IconComponent = temp.icon;
              return (
                <div
                  key={temp.id}
                  onClick={() => handleCreateTemplate(temp.title, temp.w, temp.h)}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 hover:bg-zinc-900/60 hover:border-zinc-700 transition cursor-pointer hover:shadow-xl hover:shadow-violet-950/10"
                >
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${temp.bg} flex items-center justify-center mb-4 text-white group-hover:scale-110 transition duration-300`}>
                    <IconComponent className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-200 group-hover:text-white transition">{temp.title}</h3>
                    <p className="text-xs text-zinc-500 mt-1 leading-snug">{temp.desc}</p>
                  </div>
                  <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition duration-300">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-violet-600/20 border border-violet-500/30 text-violet-400 rounded-full">Use</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal for project creation */}
        {isCreating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
            <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl relative">
              <h3 className="text-xl font-bold text-zinc-100 mb-5">Create New Project</h3>
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
                              : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <Icon className={`w-5 h-5 mb-1.5 ${selected ? 'text-violet-400' : 'text-zinc-500'}`} />
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
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 focus:border-violet-500 focus:outline-none transition cursor-pointer"
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
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 focus:border-violet-500 focus:outline-none transition cursor-pointer"
                    >
                      <option value={30}>30 fps (Standard)</option>
                      <option value={60}>60 fps (Smooth / Gaming)</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800/80">
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

        {/* Projects Grid */}
        <h2 className="text-sm font-bold text-zinc-350 uppercase tracking-wider mb-5 mt-10">Recent Projects</h2>
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center border border-dashed border-zinc-800 bg-zinc-900/10 rounded-2xl p-16 text-center backdrop-blur-sm">
            <Film className="w-12 h-12 text-zinc-700 mb-4 animate-pulse" />
            <h3 className="text-lg font-bold text-zinc-300">No projects yet</h3>
            <p className="text-sm text-zinc-500 mt-1 max-w-sm">
              Use a quick template above or create your first project to begin editing.
            </p>
            <button
              onClick={() => setIsCreating(true)}
              className="mt-6 flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-500 transition shadow-lg shadow-violet-600/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Create Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((proj) => (
              <div
                key={proj.id}
                onClick={() => loadProject(proj.id)}
                className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-zinc-800/85 bg-zinc-900/30 p-5 hover:bg-zinc-900/60 hover:border-zinc-700 hover:shadow-xl hover:shadow-violet-950/5 transition duration-300 cursor-pointer"
              >
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-zinc-800/80 p-2.5 text-violet-400 group-hover:text-violet-300 group-hover:scale-105 transition duration-300">
                        <Video className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-zinc-200 line-clamp-1 group-hover:text-zinc-100 transition">
                          {proj.title}
                        </h4>
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">
                          {proj.width}x{proj.height} • {proj.fps}fps
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-zinc-500 space-y-1">
                    <p className="flex items-center gap-1.5">
                      <Folder className="w-3.5 h-3.5 text-zinc-650" />
                      Timeline tracks: {proj.tracks?.length || 0}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Film className="w-3.5 h-3.5 text-zinc-650" />
                      Clips count: {proj.tracks?.reduce((acc, t) => acc + (t.clips?.length || 0), 0) || 0}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-zinc-850 pt-3 text-[11px] text-zinc-500">
                  <span>
                    Edited {new Date(proj.updatedAt).toLocaleDateString()}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => handleExportBackup(proj, e)}
                      title="Download JSON Project Backup"
                      className="rounded-lg p-1.5 hover:bg-zinc-800 hover:text-zinc-300 text-zinc-650 transition cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteProject(proj.id, e)}
                      title="Delete Project"
                      className="rounded-lg p-1.5 hover:bg-red-950/30 hover:text-red-400 text-zinc-650 transition cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
