import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Plus, Search, Trash2, Layout, Smartphone, Monitor, FileText,
  Image, Star, Clock, Sparkles, Grid, ArrowRight, MoreVertical, X, Edit2,
} from 'lucide-react';
import { db } from '../../lib/db';
import type { DesignProject } from '../design/types';
import DesignEditor from '../design/DesignEditor';

const uid = () => Math.random().toString(36).substring(2, 10);

const ARTBOARD_PRESETS = [
  { name: 'Instagram Post', width: 1080, height: 1080, icon: Image, color: '#ec4899' },
  { name: 'Instagram Story', width: 1080, height: 1920, icon: Smartphone, color: '#f97316' },
  { name: 'YouTube Thumbnail', width: 1280, height: 720, icon: Monitor, color: '#ef4444' },
  { name: 'Presentation', width: 1920, height: 1080, icon: Layout, color: '#7c3aed' },
  { name: 'Poster', width: 794, height: 1123, icon: FileText, color: '#0ea5e9' },
  { name: 'Custom Size', width: 800, height: 600, icon: Grid, color: '#10b981' },
];

const CATEGORY_COLORS: Record<string, string> = {
  social: '#ec4899', presentation: '#7c3aed', poster: '#f97316',
  logo: '#0ea5e9', document: '#10b981', custom: '#6b7280',
};

function createNewProject(name: string, width: number, height: number): DesignProject {
  const pageId = uid();
  return {
    id: uid(),
    title: name,
    category: 'custom',
    pages: [{
      id: pageId,
      name: 'Page 1',
      width,
      height,
      background: '#ffffff',
      elementIds: [],
    }],
    elements: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

interface Props {
  onSwitchToVideo: () => void;
}

export default function DesignDashboard({ onSwitchToVideo }: Props) {
  const [activeDesignProject, setActiveDesignProject] = useState<DesignProject | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [customWidth, setCustomWidth] = useState(800);
  const [customHeight, setCustomHeight] = useState(600);
  const [customName, setCustomName] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const projects = useLiveQuery<DesignProject[]>(
    () => db.designProjects.orderBy('updatedAt').reverse().toArray(),
    []
  ) || [];

  const filtered = projects.filter(p =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateProject = async (preset: typeof ARTBOARD_PRESETS[0], customN?: string, cW?: number, cH?: number) => {
    const w = cW ?? preset.width;
    const h = cH ?? preset.height;
    const name = customN || preset.name;
    const project = createNewProject(name, w, h);
    await db.designProjects.put(project);
    setActiveDesignProject(project);
    setShowNewModal(false);
  };

  const handleDelete = async (id: string) => {
    await db.designProjects.delete(id);
    setDeleteConfirmId(null);
    setMenuOpenId(null);
  };

  const handleOpenProject = async (p: DesignProject) => {
    setActiveDesignProject(p);
  };

  // ── Design Editor mode ────────────────────────────────────────────────────

  if (activeDesignProject) {
    return (
      <div className="flex flex-col h-full">

        <div className="flex-1 min-h-0">
          <DesignEditor
            project={activeDesignProject}
            onClose={() => setActiveDesignProject(null)}
          />
        </div>
      </div>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#f9fafb' }}>
      {/* Header */}
      <div
        className="px-8 py-5 border-b shrink-0"
        style={{ background: '#ffffff', borderColor: '#e5e7eb' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{
              background: 'linear-gradient(135deg, #a78bfa, #c084fc, #f0abfc)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              Design Studio
            </h1>
            <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
              Create stunning graphics, social posts, and brand assets
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onSwitchToVideo}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:bg-black/5"
              style={{ color: '#4b5563', border: '1px solid #d1d5db' }}
            >
              ← Video Editor
            </button>
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: '#fff' }}
            >
              <Plus size={16} />
              New Design
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">
        {/* Quick create */}
        <section>
          <h2 className="text-sm font-semibold mb-4" style={{ color: '#4b5563' }}>QUICK CREATE</h2>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {ARTBOARD_PRESETS.map(preset => (
              <button
                key={preset.name}
                onClick={() => preset.name === 'Custom Size' ? setShowNewModal(true) : handleCreateProject(preset)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl transition-all hover:scale-105 hover:border-opacity-60 group shadow-sm"
                style={{ background: '#ffffff', border: '1px solid #e5e7eb' }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                  style={{ background: `${preset.color}22` }}
                >
                  <preset.icon size={18} style={{ color: preset.color }} />
                </div>
                <span className="text-xs font-medium text-center leading-tight" style={{ color: '#111827' }}>
                  {preset.name}
                </span>
                <span className="text-xs" style={{ color: '#6b7280' }}>
                  {preset.width}×{preset.height}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Search */}
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-sm" style={{ background: '#ffffff', border: '1px solid #e5e7eb' }}>
          <Search size={16} style={{ color: '#6b7280' }} />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search designs..."
            className="flex-1 bg-transparent text-sm outline-none placeholder-gray-400"
            style={{ color: '#111827' }}
          />
        </div>

        {/* Recent designs */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold" style={{ color: '#4b5563' }}>
              {searchQuery ? `RESULTS (${filtered.length})` : 'RECENT DESIGNS'}
            </h2>
          </div>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: 'rgba(124,58,237,0.1)' }}
              >
                <Sparkles size={28} style={{ color: '#7c3aed' }} />
              </div>
              <h3 className="text-base font-semibold mb-2" style={{ color: '#111827' }}>
                {searchQuery ? 'No designs found' : 'Start your first design'}
              </h3>
              <p className="text-sm mb-5" style={{ color: '#6b7280' }}>
                {searchQuery ? 'Try a different search term' : 'Create stunning graphics powered by AI'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setShowNewModal(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: '#fff' }}
                >
                  <Plus size={16} /> Create Design
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {filtered.map(p => {
              const page = p.pages[0];
              const aspectRatio = page ? page.width / page.height : 1;
              const cardH = Math.round(200 / aspectRatio);
              return (
                <div
                  key={p.id}
                  className="group relative rounded-xl overflow-hidden cursor-pointer transition-all hover:scale-[1.02] shadow-sm"
                  style={{ background: '#ffffff', border: '1px solid #e5e7eb' }}
                  onClick={() => handleOpenProject(p)}
                >
                  {/* Thumbnail */}
                  <div
                    className="w-full flex items-center justify-center"
                    style={{
                      height: Math.max(100, Math.min(180, cardH)),
                      background: page?.background ?? '#fff',
                    }}
                  >
                    <div
                      className="text-xs font-medium opacity-30"
                      style={{ color: '#000' }}
                    >
                      {page?.width}×{page?.height}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <p className="text-sm font-medium truncate" style={{ color: '#e5e7eb' }}>
                      {p.title}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs" style={{ color: '#6b7280' }}>
                        {p.pages.length} page{p.pages.length !== 1 ? 's' : ''}
                      </p>
                      <p className="text-xs" style={{ color: '#6b7280' }}>
                        {new Date(p.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Hover overlay */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="flex gap-2">
                      <button
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: '#fff' }}
                        onClick={e => { e.stopPropagation(); handleOpenProject(p); }}
                      >
                        <Edit2 size={12} /> Edit
                      </button>
                      <button
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
                        onClick={e => { e.stopPropagation(); setDeleteConfirmId(p.id); }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* New design modal */}
      {showNewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowNewModal(false); }}
        >
          <div
            className="w-full max-w-lg mx-4 rounded-2xl overflow-hidden"
            style={{ background: '#161616', border: '1px solid #2a2a2a', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#2a2a2a' }}>
              <h2 className="text-base font-bold" style={{ color: '#e5e7eb' }}>New Design</h2>
              <button onClick={() => setShowNewModal(false)} className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: '#9ca3af' }}>
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold mb-2 block" style={{ color: '#9ca3af' }}>PRESET SIZES</label>
                <div className="grid grid-cols-3 gap-2">
                  {ARTBOARD_PRESETS.filter(p => p.name !== 'Custom Size').map(preset => (
                    <button
                      key={preset.name}
                      onClick={() => handleCreateProject(preset)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all hover:border-purple-500"
                      style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
                    >
                      <preset.icon size={14} style={{ color: preset.color }} />
                      <div>
                        <p className="text-xs font-medium" style={{ color: '#e5e7eb' }}>{preset.name}</p>
                        <p className="text-xs" style={{ color: '#6b7280' }}>{preset.width}×{preset.height}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t" style={{ borderColor: '#2a2a2a' }} />

              <div>
                <label className="text-xs font-semibold mb-2 block" style={{ color: '#9ca3af' }}>CUSTOM SIZE</label>
                <div className="space-y-3">
                  <input
                    value={customName}
                    onChange={e => setCustomName(e.target.value)}
                    placeholder="Design name..."
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                    style={{ background: '#1a1a1a', color: '#e5e7eb', border: '1px solid #333' }}
                  />
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>WIDTH (px)</label>
                      <input
                        type="number"
                        value={customWidth}
                        onChange={e => setCustomWidth(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                        style={{ background: '#1a1a1a', color: '#e5e7eb', border: '1px solid #333' }}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>HEIGHT (px)</label>
                      <input
                        type="number"
                        value={customHeight}
                        onChange={e => setCustomHeight(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                        style={{ background: '#1a1a1a', color: '#e5e7eb', border: '1px solid #333' }}
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => handleCreateProject(ARTBOARD_PRESETS[0], customName || 'My Design', customWidth, customHeight)}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: '#fff' }}
                  >
                    Create Custom Design
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteConfirmId(null); }}
        >
          <div className="w-80 rounded-2xl p-6 space-y-4" style={{ background: '#161616', border: '1px solid #2a2a2a' }}>
            <h3 className="font-semibold" style={{ color: '#e5e7eb' }}>Delete Design?</h3>
            <p className="text-sm" style={{ color: '#9ca3af' }}>This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2 rounded-xl text-sm font-medium"
                style={{ background: '#2a2a2a', color: '#9ca3af' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
