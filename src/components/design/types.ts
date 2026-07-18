// ─── Design Tool Types ────────────────────────────────────────────────────────

export type ToolMode =
  | 'select'
  | 'frame'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'text'
  | 'pen'
  | 'hand'
  | 'image'
  | 'star'
  | 'polygon'
  | 'node-edit';

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay'
  | 'darken' | 'lighten' | 'color-dodge' | 'color-burn'
  | 'hard-light' | 'soft-light' | 'difference' | 'exclusion';

// ─── Fill ────────────────────────────────────────────────────────────────────

export interface SolidFill {
  type: 'solid';
  color: string; // hex
  opacity: number; // 0–1
}

export interface GradientStop {
  color: string;
  position: number; // 0–1
  opacity: number;
}

export interface LinearGradientFill {
  type: 'linear';
  stops: GradientStop[];
  angle: number; // degrees
}

export interface RadialGradientFill {
  type: 'radial';
  stops: GradientStop[];
}

export interface ImageFill {
  type: 'image';
  url: string; // data URL or blob URL
  fit: 'fill' | 'fit' | 'crop' | 'tile';
}

export type Fill = SolidFill | LinearGradientFill | RadialGradientFill | ImageFill;

// ─── Stroke ──────────────────────────────────────────────────────────────────

export interface Stroke {
  color: string;
  opacity: number; // 0–1
  width: number;
  style: 'solid' | 'dashed' | 'dotted';
  position: 'inside' | 'outside' | 'center';
}

// ─── Effects ─────────────────────────────────────────────────────────────────

export interface DropShadow {
  type: 'drop-shadow';
  color: string;
  opacity: number;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
}

export interface InnerShadow {
  type: 'inner-shadow';
  color: string;
  opacity: number;
  offsetX: number;
  offsetY: number;
  blur: number;
}

export interface GaussianBlur {
  type: 'blur';
  radius: number;
}

export type Effect = DropShadow | InnerShadow | GaussianBlur;

// ─── Text ────────────────────────────────────────────────────────────────────

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: '300' | '400' | '500' | '600' | '700' | '800' | '900';
  fontStyle: 'normal' | 'italic';
  letterSpacing: number; // em
  lineHeight: number; // multiplier
  textAlign: 'left' | 'center' | 'right' | 'justify';
  textDecoration: 'none' | 'underline' | 'line-through';
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  color: string;
}

// ─── Base Element ─────────────────────────────────────────────────────────────

export interface BaseElement {
  id: string;
  name: string;
  x: number; // px on artboard
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees
  opacity: number; // 0–1
  visible: boolean;
  locked: boolean;
  fills: Fill[];
  strokes: Stroke[];
  effects: Effect[];
  blendMode: BlendMode;
  cornerRadius?: number; // for rects/frames
}

// ─── Element Variants ────────────────────────────────────────────────────────

export interface RectElement extends BaseElement {
  type: 'rect';
  cornerRadius: number;
  cornerRadii?: [number, number, number, number]; // TL, TR, BR, BL
}

export interface EllipseElement extends BaseElement {
  type: 'ellipse';
}

export interface FrameElement extends BaseElement {
  type: 'frame';
  cornerRadius: number;
  children: string[]; // child element IDs
  clipContent: boolean;
}

export interface TextElement extends BaseElement {
  type: 'text';
  content: string;
  textStyle: TextStyle;
  autoWidth: boolean;
  autoHeight: boolean;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  url: string; // data URL
  naturalWidth: number;
  naturalHeight: number;
  cropX: number; // 0–1
  cropY: number;
  cropW: number;
  cropH: number;
}

export interface LineElement extends BaseElement {
  type: 'line';
  x2: number;
  y2: number;
  arrowStart: boolean;
  arrowEnd: boolean;
}

export interface StarElement extends BaseElement {
  type: 'star';
  points: number;
  innerRatio: number; // 0–1
}

export interface PolygonElement extends BaseElement {
  type: 'polygon';
  sides: number;
}

export interface PathNode {
  x: number;
  y: number;
  cpIn?: { x: number; y: number };  // relative to node (x, y)
  cpOut?: { x: number; y: number }; // relative to node (x, y)
  type: 'smooth' | 'corner' | 'symmetric';
}

export interface PathElement extends BaseElement {
  type: 'path';
  nodes: PathNode[];
  closed: boolean;
}

export interface GroupElement extends BaseElement {
  type: 'group';
  children: string[]; // child element IDs
}

export type DesignElement =
  | RectElement
  | EllipseElement
  | FrameElement
  | TextElement
  | ImageElement
  | LineElement
  | StarElement
  | PolygonElement
  | PathElement
  | GroupElement;

export type ElementType = DesignElement['type'];

// ─── Page / Artboard ─────────────────────────────────────────────────────────

export interface DesignPage {
  id: string;
  name: string;
  width: number; // artboard width px
  height: number;
  background: string; // hex color
  elementIds: string[]; // ordered list (bottom → top)
}

// ─── Design Project ───────────────────────────────────────────────────────────

export interface DesignProject {
  id: string;
  title: string;
  category: 'social' | 'presentation' | 'poster' | 'logo' | 'document' | 'custom';
  thumbnail?: string; // data URL
  pages: DesignPage[];
  elements: Record<string, DesignElement>;
  createdAt: Date;
  updatedAt: Date;
}

// ─── AI Suggestion ────────────────────────────────────────────────────────────

export interface AIDesignSuggestion {
  type: 'layout' | 'color-palette' | 'font-pair' | 'text-copy';
  label: string;
  data: any;
}

// ─── Snap Guide ──────────────────────────────────────────────────────────────

export interface SnapGuide {
  type: 'horizontal' | 'vertical';
  position: number; // canvas coordinate
}

// ─── Selection Bounds ────────────────────────────────────────────────────────

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
