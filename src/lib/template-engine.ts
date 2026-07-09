/**
 * template-engine.ts
 * Phase 4.3 — Template System
 *
 * Provides:
 *  - A set of built-in starter templates with pre-configured tracks,
 *    text overlays, and suggested clip placements.
 *  - `applyTemplate(template, title)` — instantiates a fresh Project
 *    from a template, replacing placeholder IDs with fresh ones.
 *  - `exportAsTemplate(project, meta)` — converts a project into a template.
 */

import type { Project, TimelineTrack, TimelineClip } from './db';

// ─────────────────────────────────────────────
// BuiltinTemplate
// ─────────────────────────────────────────────

export interface BuiltinTemplate {
  id: string;
  title: string;
  description: string;
  category: 'social' | 'marketing' | 'cinematic' | 'educational' | 'podcast';
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  tags: string[];
  gradient: string;
  accentColor: string;
  tracks: TimelineTrack[];
}

// ─────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).substring(2, 9);
}

// ─────────────────────────────────────────────
// Helper: build a basic text clip using the flat textSettings schema
// ─────────────────────────────────────────────

function makeTextClip(
  trackId: string,
  name: string,
  content: string,
  positionMs: number,
  durationMs: number,
  opts: {
    fontSize?: number;
    fontFamily?: string;
    color?: string;
    x?: number;
    y?: number;
    strokeColor?: string;
    strokeWidth?: number;
    shadowColor?: string;
    shadowBlur?: number;
    shadowOffsetX?: number;
    shadowOffsetY?: number;
    backgroundColor?: string;
    backgroundAlpha?: number;
    backgroundPadding?: number;
    backgroundBorderRadius?: number;
    letterSpacing?: number;
    lineHeight?: number;
  } = {}
): TimelineClip {
  return {
    id: uid(),
    trackId,
    assetId: '',
    type: 'text',
    name,
    positionMs,
    durationMs,
    trimStartMs: 0,
    trimEndMs: durationMs,
    textSettings: {
      content,
      color: opts.color ?? '#ffffff',
      fontSize: opts.fontSize ?? 64,
      fontFamily: opts.fontFamily ?? 'Inter',
      x: opts.x ?? 0.5,
      y: opts.y ?? 0.5,
      scale: 1,
      strokeColor: opts.strokeColor,
      strokeWidth: opts.strokeWidth,
      shadowColor: opts.shadowColor,
      shadowBlur: opts.shadowBlur,
      shadowOffsetX: opts.shadowOffsetX,
      shadowOffsetY: opts.shadowOffsetY,
      backgroundColor: opts.backgroundColor,
      backgroundAlpha: opts.backgroundAlpha,
      backgroundPadding: opts.backgroundPadding,
      backgroundBorderRadius: opts.backgroundBorderRadius,
      letterSpacing: opts.letterSpacing,
      lineHeight: opts.lineHeight,
    }
  };
}

// ─────────────────────────────────────────────
// Built-in Templates
// ─────────────────────────────────────────────

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  // ── 1. YouTube Intro ─────────────────────────────────────────────────────
  {
    id: 'yt-intro',
    title: 'YouTube Intro',
    description: '5-second branded intro with animated title overlay and tagline.',
    category: 'social',
    width: 1920,
    height: 1080,
    fps: 30,
    durationMs: 5000,
    tags: ['youtube', 'intro', 'branded', '16:9'],
    gradient: 'from-red-600/20 via-red-500/5 to-transparent',
    accentColor: '#ef4444',
    tracks: [
      { id: 'v1', name: 'Background', type: 'video', clips: [], locked: false, muted: false, hidden: false },
      {
        id: 't1', name: 'Title', type: 'text', clips: [
          makeTextClip('t1', 'Channel Title', 'YOUR CHANNEL', 500, 3500, {
            fontSize: 96, color: '#ffffff', x: 0.5, y: 0.46,
            strokeColor: '#000000', strokeWidth: 6,
            shadowColor: '#000000cc', shadowBlur: 20, shadowOffsetX: 4, shadowOffsetY: 4,
            letterSpacing: 8,
          })
        ],
        locked: false, muted: false, hidden: false
      },
      {
        id: 't2', name: 'Tagline', type: 'text', clips: [
          makeTextClip('t2', 'Tagline', 'YOUR TAGLINE HERE', 1200, 2800, {
            fontSize: 32, color: '#a3a3a3', x: 0.5, y: 0.55,
            shadowColor: '#00000099', shadowBlur: 10, shadowOffsetX: 2, shadowOffsetY: 2,
            letterSpacing: 4,
          })
        ],
        locked: false, muted: false, hidden: false
      },
      { id: 'a1', name: 'Intro Music', type: 'audio', clips: [], locked: false, muted: false, hidden: false }
    ]
  },

  // ── 2. TikTok Hook Reel ───────────────────────────────────────────────────
  {
    id: 'tiktok-hook',
    title: 'TikTok Hook Reel',
    description: '15-second attention-grabbing vertical reel with hook text overlay.',
    category: 'social',
    width: 1080,
    height: 1920,
    fps: 30,
    durationMs: 15000,
    tags: ['tiktok', 'reels', 'viral', '9:16', 'vertical'],
    gradient: 'from-pink-600/20 via-fuchsia-500/5 to-transparent',
    accentColor: '#ec4899',
    tracks: [
      { id: 'v1', name: 'Main Video', type: 'video', clips: [], locked: false, muted: false, hidden: false },
      {
        id: 't1', name: 'Hook Text', type: 'text', clips: [
          makeTextClip('t1', 'Hook Question', 'Did you know this?? 👀', 0, 3000, {
            fontSize: 72, color: '#ffffff', x: 0.5, y: 0.16,
            strokeColor: '#000000', strokeWidth: 5,
            shadowColor: '#00000088', shadowBlur: 12, shadowOffsetX: 3, shadowOffsetY: 3,
            letterSpacing: 1,
          })
        ],
        locked: false, muted: false, hidden: false
      },
      { id: 't2', name: 'Captions', type: 'text', clips: [], locked: false, muted: false, hidden: false },
      { id: 'a1', name: 'Trending Audio', type: 'audio', clips: [], locked: false, muted: false, hidden: false }
    ]
  },

  // ── 3. Product Showcase ───────────────────────────────────────────────────
  {
    id: 'product-showcase',
    title: 'Product Showcase',
    description: '30-second professional product reveal with title cards and CTA.',
    category: 'marketing',
    width: 1920,
    height: 1080,
    fps: 30,
    durationMs: 30000,
    tags: ['product', 'marketing', 'ad', 'ecommerce'],
    gradient: 'from-emerald-600/20 via-teal-500/5 to-transparent',
    accentColor: '#10b981',
    tracks: [
      { id: 'v1', name: 'Product Video', type: 'video', clips: [], locked: false, muted: false, hidden: false },
      {
        id: 't1', name: 'Product Name', type: 'text', clips: [
          makeTextClip('t1', 'Product Name', 'Product Name', 2000, 6000, {
            fontSize: 80, color: '#ffffff', x: 0.5, y: 0.44,
            strokeColor: '#10b981', strokeWidth: 3,
            shadowColor: '#000000bb', shadowBlur: 24, shadowOffsetX: 0, shadowOffsetY: 6,
            backgroundColor: '#000000', backgroundAlpha: 40, backgroundPadding: 20, backgroundBorderRadius: 12,
            letterSpacing: 3,
          })
        ],
        locked: false, muted: false, hidden: false
      },
      {
        id: 't2', name: 'CTA', type: 'text', clips: [
          makeTextClip('t2', 'Call To Action', 'Shop Now →', 26000, 4000, {
            fontSize: 56, color: '#000000', x: 0.5, y: 0.57,
            backgroundColor: '#10b981', backgroundAlpha: 100, backgroundPadding: 24, backgroundBorderRadius: 40,
            letterSpacing: 2,
          })
        ],
        locked: false, muted: false, hidden: false
      },
      { id: 'a1', name: 'Background Music', type: 'audio', clips: [], locked: false, muted: false, hidden: false }
    ]
  },

  // ── 4. Podcast Audiogram ──────────────────────────────────────────────────
  {
    id: 'podcast-audiogram',
    title: 'Podcast Audiogram',
    description: 'Square audiogram with speaker name and episode title overlay.',
    category: 'podcast',
    width: 1080,
    height: 1080,
    fps: 30,
    durationMs: 60000,
    tags: ['podcast', 'audiogram', 'square', '1:1'],
    gradient: 'from-violet-600/20 via-purple-500/5 to-transparent',
    accentColor: '#8b5cf6',
    tracks: [
      { id: 'v1', name: 'Background', type: 'video', clips: [], locked: false, muted: false, hidden: false },
      {
        id: 't1', name: 'Episode Title', type: 'text', clips: [
          makeTextClip('t1', 'Episode Title', 'Episode 42: The Future', 0, 60000, {
            fontSize: 56, color: '#ffffff', x: 0.5, y: 0.3,
            shadowColor: '#00000066', shadowBlur: 16, shadowOffsetX: 0, shadowOffsetY: 4,
            letterSpacing: 2, lineHeight: 1.3,
          })
        ],
        locked: false, muted: false, hidden: false
      },
      {
        id: 't2', name: 'Speaker Name', type: 'text', clips: [
          makeTextClip('t2', 'Speaker', 'with John Doe', 0, 60000, {
            fontSize: 36, color: '#8b5cf6', x: 0.5, y: 0.37,
            letterSpacing: 1, lineHeight: 1.2,
          })
        ],
        locked: false, muted: false, hidden: false
      },
      { id: 'a1', name: 'Podcast Audio', type: 'audio', clips: [], locked: false, muted: false, hidden: false }
    ]
  },

  // ── 5. Cinematic Trailer ──────────────────────────────────────────────────
  {
    id: 'cinematic-trailer',
    title: 'Cinematic Trailer',
    description: '60-second ultra-wide cinematic trailer with title cards and dramatic reveal.',
    category: 'cinematic',
    width: 2560,
    height: 1080,
    fps: 24,
    durationMs: 60000,
    tags: ['cinematic', 'trailer', '21:9', 'ultrawide', 'film'],
    gradient: 'from-amber-600/20 via-orange-500/5 to-transparent',
    accentColor: '#f59e0b',
    tracks: [
      { id: 'v1', name: 'Main Footage', type: 'video', clips: [], locked: false, muted: false, hidden: false },
      { id: 'v2', name: 'B-Roll', type: 'video', clips: [], locked: false, muted: false, hidden: false },
      {
        id: 't1', name: 'Title Cards', type: 'text', clips: [
          makeTextClip('t1', 'Intro Title', 'IN A WORLD\nWHERE ANYTHING IS POSSIBLE', 5000, 4000, {
            fontSize: 72, color: '#ffffff', x: 0.5, y: 0.46,
            shadowColor: '#00000088', shadowBlur: 30, shadowOffsetX: 0, shadowOffsetY: 8,
            letterSpacing: 12, lineHeight: 1.6,
          }),
          makeTextClip('t1', 'Main Title', 'YOUR FILM TITLE', 52000, 8000, {
            fontSize: 128, color: '#f59e0b', x: 0.5, y: 0.44,
            shadowColor: '#000000', shadowBlur: 40, shadowOffsetX: 0, shadowOffsetY: 10,
            letterSpacing: 16, lineHeight: 1.2,
          })
        ],
        locked: false, muted: false, hidden: false
      },
      { id: 'a1', name: 'Orchestral Score', type: 'audio', clips: [], locked: false, muted: false, hidden: false }
    ]
  },

  // ── 6. Tutorial / Educational ─────────────────────────────────────────────
  {
    id: 'tutorial',
    title: 'Tutorial / Explainer',
    description: 'Screen recording tutorial with lower thirds, step labels, and voice track.',
    category: 'educational',
    width: 1920,
    height: 1080,
    fps: 30,
    durationMs: 120000,
    tags: ['tutorial', 'education', 'how-to', 'screencast'],
    gradient: 'from-sky-600/20 via-blue-500/5 to-transparent',
    accentColor: '#0ea5e9',
    tracks: [
      { id: 'v1', name: 'Screen Recording', type: 'video', clips: [], locked: false, muted: false, hidden: false },
      { id: 'v2', name: 'Webcam Overlay', type: 'video', clips: [], locked: false, muted: false, hidden: false },
      {
        id: 't1', name: 'Step Labels', type: 'text', clips: [
          makeTextClip('t1', 'Step 1', 'Step 1: Getting Started', 0, 20000, {
            fontSize: 44, color: '#ffffff', x: 0.13, y: 0.91,
            backgroundColor: '#0ea5e9', backgroundAlpha: 90, backgroundPadding: 14, backgroundBorderRadius: 8,
            letterSpacing: 1,
          })
        ],
        locked: false, muted: false, hidden: false
      },
      {
        id: 't2', name: 'Lower Third', type: 'text', clips: [
          makeTextClip('t2', 'Speaker Lower Third', 'John Doe\nSenior Developer', 2000, 6000, {
            fontSize: 38, color: '#ffffff', x: 0.15, y: 0.8,
            backgroundColor: '#18181b', backgroundAlpha: 85, backgroundPadding: 16, backgroundBorderRadius: 6,
            lineHeight: 1.4,
          })
        ],
        locked: false, muted: false, hidden: false
      },
      { id: 'a1', name: 'Voiceover', type: 'audio', clips: [], locked: false, muted: false, hidden: false },
      { id: 'a2', name: 'Background Music', type: 'audio', clips: [], locked: false, muted: false, hidden: false }
    ]
  }
];

// ─────────────────────────────────────────────
// Template Engine Functions
// ─────────────────────────────────────────────

/**
 * Instantiate a fresh Project from a built-in template.
 * Generates new IDs so multiple forks don't collide in the database.
 */
export function applyTemplate(template: BuiltinTemplate, customTitle?: string): Project {
  const projectId = uid();
  const now = new Date();

  const clonedTracks: TimelineTrack[] = template.tracks.map((track) => {
    const newTrackId = uid();
    const clonedClips: TimelineClip[] = track.clips.map((clip) => ({
      ...clip,
      id: uid(),
      trackId: newTrackId
    }));
    return { ...track, id: newTrackId, clips: clonedClips };
  });

  return {
    id: projectId,
    title: customTitle ?? `My ${template.title}`,
    width: template.width,
    height: template.height,
    fps: template.fps,
    tracks: clonedTracks,
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Export a user project as a template object (strips real asset references).
 */
export function exportAsTemplate(
  project: Project,
  meta: Pick<BuiltinTemplate, 'id' | 'title' | 'description' | 'category' | 'tags' | 'gradient' | 'accentColor'>
): BuiltinTemplate {
  const totalDuration = project.tracks
    .flatMap((t) => t.clips)
    .reduce((max, c) => Math.max(max, c.positionMs + c.durationMs), 0);

  return {
    ...meta,
    width: project.width,
    height: project.height,
    fps: project.fps,
    durationMs: totalDuration,
    tracks: project.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => ({
        ...c,
        assetId: c.type === 'text' ? '' : `__slot_${c.type}_${c.id}`
      }))
    }))
  };
}
