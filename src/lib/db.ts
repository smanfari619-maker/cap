import Dexie, { type Table } from 'dexie';

export interface Asset {
  id: string;
  projectId: string;
  name: string;
  size: number;
  type: string;
  durationMs: number;
  width?: number;
  height?: number;
  opfsPath: string;
  createdAt: Date;
  waveformPeaks?: number[];
}

export interface TimelineClip {
  id: string;
  assetId?: string; // Undefined for text clips
  type: 'video' | 'audio' | 'text' | 'image' | 'effect';
  name: string;
  durationMs: number;
  trimStartMs: number; // Trim start offset in source asset (ms)
  trimEndMs: number;   // Trim end offset in source asset (ms)
  positionMs: number;  // Position on timeline (ms)
  trackId: string;
  disabled?: boolean;     // Disable playback & rendering of this clip
  enhanceVideo?: boolean; // Toggle video enhancement (contrast + saturation boost)
  
  // Speed & Audio
  speed?: number;
  volume?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  transitionType?: string; // legacy — prefer transitionIn

  // Stacked video effects (e.g. glitch, grain, shake) with per-effect intensity
  videoEffects?: Array<{
    id: string;        // effect ID from effects-registry.ts
    intensity: number; // 0-100
  }>;

  // Structured transition-in (replaces the flat transitionType + fadeInMs pattern)
  transitionIn?: {
    type: string;  // transition ID from transitions-registry.ts
    durationMs: number;
    easing: 'linear' | 'ease-in-out' | 'ease-in' | 'ease-out';
  };

  // Color adjustments
  colorAdjustments?: {
    brightness: number;
    contrast: number;
    saturation: number;
    temp: number;
    vignette: number;
  };

  // Preset filter settings
  filterSettings?: {
    type: string;
    intensity: number;
  };

  textSettings?: {
    content: string;
    color: string;
    fontSize: number;
    fontFamily: string;
    x: number; // 0-1 normalized
    y: number; // 0-1 normalized
    scale: number;
    
    // Outlines & Borders
    strokeColor?: string;
    strokeWidth?: number;

    // Drop Shadows
    shadowColor?: string;
    shadowBlur?: number;
    shadowOffsetX?: number;
    shadowOffsetY?: number;

    // Background Fills
    backgroundColor?: string;
    backgroundAlpha?: number; // 0-100
    backgroundPadding?: number;
    backgroundBorderRadius?: number;

    // Spacing
    letterSpacing?: number;
    lineHeight?: number;
    fontWeight?: string;
    fontStyle?: string;
  };

  // Visual transform settings (scale, translation, rotation, blend mode)
  transform?: {
    scale: number;       // default 100 (%)
    x: number;           // horizontal offset in px (default 0)
    y: number;           // vertical offset in px (default 0)
    rotation: number;    // rotation in degrees (default 0)
    uniformScale: boolean; // default true
    blendMode: string;   // default 'normal' (canvas globalCompositeOperation matching values)
    opacity?: number;    // default 100 (%)
  };

  // Keyframe Animation configurations
  keyframes?: {
    scale?: Keyframe[];
    x?: Keyframe[];
    y?: Keyframe[];
    rotation?: Keyframe[];
    opacity?: Keyframe[];
  };

  // AI & Advanced Chroma Key Green Screen Removal
  chromaKey?: {
    enabled: boolean;
    color: string;      // hex color to remove (e.g. #00ff00)
    tolerance: number;  // tolerance threshold (1-100, default 30)
    feather: number;    // feather edge softness (1-100, default 10)
  };

  // AI Background Removal
  aiBackgroundRemoval?: {
    enabled: boolean;
    mode: 'remove' | 'blur';
    blurRadius: number;
  };

  // Smart Reframe
  smartReframe?: {
    enabled: boolean;
    targetAspect: '9:16' | '1:1';
    smoothing: number;
  };

  // Pro HSL adjustments
  hslAdjustments?: {
    hue: number;        // shift (-180 to 180, default 0)
    saturation: number; // shift (-100 to 100, default 0)
    lightness: number;  // shift (-100 to 100, default 0)
  };

  // EQ Mixing
  audioEQ?: {
    low: number;        // low gain (-12 to 12 dB, default 0)
    mid: number;        // mid gain (-12 to 12 dB, default 0)
    high: number;       // high gain (-12 to 12 dB, default 0)
  };

  // Lift/Gamma/Gain, LUT, and RGB Curves Color Correction
  colorCorrection?: {
    lift?: { r: number; g: number; b: number };
    gamma?: { r: number; g: number; b: number };
    gain?: { r: number; g: number; b: number };
    lutContent?: string;
    curves?: {
      r?: { x: number; y: number }[];
      g?: { x: number; y: number }[];
      b?: { x: number; y: number }[];
      rgb?: { x: number; y: number }[];
    };
  };
  // Shape Settings for vector shape overlays
  shapeSettings?: {
    type: 'circle' | 'rectangle' | 'triangle' | 'arrow' | 'star';
    color: string;
    strokeColor?: string;
    strokeWidth?: number;
    width?: number;
    height?: number;
  };
}

export interface Keyframe {
  timeMs: number; // relative to clip start position
  value: number;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'text' | 'effect';
  clips: TimelineClip[];
  
  // Track status states
  locked?: boolean;
  muted?: boolean;
  hidden?: boolean;
}

export interface TimelineMarker {
  id: string;
  timeMs: number;
  color: 'red' | 'green' | 'blue' | 'yellow' | 'purple';
  note: string;
}

export interface Project {
  id: string;
  title: string;
  width: number;
  height: number;
  fps: number;
  tracks: TimelineTrack[];
  markers?: TimelineMarker[];
  createdAt: Date;
  updatedAt: Date;
  // Folder grouping — set by Story Cutter and other batch tools
  folderId?: string;
  folderName?: string;
  thumbnailUrl?: string;
}

export interface ProjectVersion {
  id: string;
  projectId: string;
  label: string;
  projectData: string; // JSON string of project structure
  createdAt: Date;
}

class CapCutDatabase extends Dexie {
  projects!: Table<Project>;
  assets!: Table<Asset>;
  projectVersions!: Table<ProjectVersion>;

  constructor() {
    super('CapCutDatabase');
    this.version(1).stores({
      projects: 'id, title, createdAt, updatedAt',
      assets: 'id, projectId, type, createdAt'
    });
    // Version 2: adds 'image' clip/track type (schema string unchanged, types are TS-only)
    this.version(2).stores({
      projects: 'id, title, createdAt, updatedAt',
      assets: 'id, projectId, type, createdAt'
    });
    // Version 3: adds videoEffects[] and transitionIn structured field (TS-only, schema unchanged)
    this.version(3).stores({
      projects: 'id, title, createdAt, updatedAt',
      assets: 'id, projectId, type, createdAt'
    });
    // Version 4: adds projectVersions table for version rollback history
    this.version(4).stores({
      projects: 'id, title, createdAt, updatedAt',
      assets: 'id, projectId, type, createdAt',
      projectVersions: 'id, projectId, createdAt'
    });
    // Version 5: adds folderId index to projects for folder grouping
    this.version(5).stores({
      projects: 'id, title, createdAt, updatedAt, folderId',
      assets: 'id, projectId, type, createdAt',
      projectVersions: 'id, projectId, createdAt'
    });
  }
}

export const db = new CapCutDatabase();
