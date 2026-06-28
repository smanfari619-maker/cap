import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2, Video, Film, Folder, Download, Upload } from 'lucide-react';
import { db, type Project } from '../../lib/db';
import { useEditorStore } from '../../store/editorStore';
import { deleteDirectoryFromOPFS } from '../../lib/opfs';

export default function Dashboard() {
  const loadProject = useEditorStore(state => state.loadProject);
  const projects = useLiveQuery(() => db.projects.reverse().sortBy('updatedAt')) || [];
  
  // New Project Form State
  const [title, setTitle] = useState('');
  const [resolution, setResolution] = useState('1080p');
  const [fps, setFps] = useState(30);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    let width = 1920;
    let height = 1080;
    if (resolution === '720p') {
      width = 1280;
      height = 720;
    } else if (resolution === '480p') {
      width = 854;
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

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this project? All local media files inside this project will be deleted permanently.')) {
      // 1. Delete from database
      await db.projects.delete(projectId);
      
      // 2. Delete all assets from Dexie
      const projectAssets = await db.assets.where('projectId').equals(projectId).toArray();
      await db.assets.bulkDelete(projectAssets.map(a => a.id));

      // 3. Delete directory from OPFS
      await deleteDirectoryFromOPFS(projectId);
    }
  };

  const handleExportBackup = async (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    // Export project configuration as JSON
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
        
        // Basic check
        if (!projectData.id || !projectData.title || !projectData.tracks) {
          alert('Invalid project backup file format.');
          return;
        }

        // Generate a new ID if it already exists or keep it
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
    <div className="flex-1 overflow-y-auto bg-zinc-950 p-8 text-zinc-100">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-500 bg-clip-text text-transparent">
              CapCut Studio
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Offline-first web video editor. All media files are kept locally in your browser.
            </p>
          </div>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 hover:border-zinc-700 cursor-pointer transition text-zinc-300">
              <Upload className="w-4 h-4 text-violet-400" />
              Import Project
              <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
            </label>
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-500 transition shadow-lg shadow-violet-600/20"
            >
              <Plus className="w-4 h-4" />
              New Project
            </button>
          </div>
        </div>

        {/* Modal for project creation */}
        {isCreating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-zinc-100 mb-4">Create New Project</h3>
              <form onSubmit={handleCreateProject} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Project Name</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="My Amazing Video"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm text-zinc-100 focus:border-violet-500 focus:outline-none transition"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1">Resolution</label>
                    <select
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm text-zinc-100 focus:border-violet-500 focus:outline-none transition"
                    >
                      <option value="1080p">1080p (1920x1080)</option>
                      <option value="720p">720p (1280x720)</option>
                      <option value="480p">480p (854x480)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1">Frame Rate (FPS)</label>
                    <select
                      value={fps}
                      onChange={(e) => setFps(Number(e.target.value))}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm text-zinc-100 focus:border-violet-500 focus:outline-none transition"
                    >
                      <option value={30}>30 fps</option>
                      <option value={60}>60 fps</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-400 hover:bg-zinc-900 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold rounded-lg text-white bg-violet-600 hover:bg-violet-500 transition"
                  >
                    Create Project
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Projects Grid */}
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center border border-dashed border-zinc-800 bg-zinc-900/20 rounded-2xl p-16 text-center">
            <Film className="w-12 h-12 text-zinc-600 mb-4 animate-pulse" />
            <h3 className="text-lg font-bold text-zinc-300">No projects yet</h3>
            <p className="text-sm text-zinc-500 mt-1 max-w-sm">
              Create your first project or import a backup file to start editing.
            </p>
            <button
              onClick={() => setIsCreating(true)}
              className="mt-6 flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-500 transition"
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
                className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 hover:bg-zinc-900/80 hover:border-zinc-700 transition cursor-pointer"
              >
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-zinc-800/80 p-2.5 text-violet-400 group-hover:text-violet-300 group-hover:scale-105 transition">
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
                      <Folder className="w-3.5 h-3.5 text-zinc-600" />
                      Timeline tracks: {proj.tracks?.length || 0}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Film className="w-3.5 h-3.5 text-zinc-600" />
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
                      className="rounded-lg p-1.5 hover:bg-zinc-800 hover:text-zinc-300 text-zinc-500 transition"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteProject(proj.id, e)}
                      title="Delete Project"
                      className="rounded-lg p-1.5 hover:bg-red-950/30 hover:text-red-400 text-zinc-500 transition"
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
