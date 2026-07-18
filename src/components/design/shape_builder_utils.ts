import polygonClipping from 'polygon-clipping';
import type { DesignElement, PathElement, PathNode } from './types';
import { uid } from './utils';

// Helper to sample bezier curve
function sampleBezier(
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
  steps = 10
): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3;
    const y = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3;
    points.push([x, y]);
  }
  return points;
}

// Convert any element into a list of polygon rings
export function elementToPolygonRings(el: DesignElement): [number, number][][] {
  const rings: [number, number][][] = [];

  if (el.type === 'rect') {
    const { x, y, width: w, height: h } = el;
    rings.push([
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
      [x, y]
    ]);
  } else if (el.type === 'ellipse') {
    const rx = el.width / 2;
    const ry = el.height / 2;
    const cx = el.x + rx;
    const cy = el.y + ry;
    const ring: [number, number][] = [];
    const steps = 64;
    for (let i = 0; i <= steps; i++) {
      const angle = (i * 2 * Math.PI) / steps;
      ring.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
    }
    rings.push(ring);
  } else if (el.type === 'polygon') {
    const sides = (el as any).sides || 6;
    const r = Math.min(el.width, el.height) / 2;
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const ring: [number, number][] = [];
    for (let i = 0; i <= sides; i++) {
      const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
      ring.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    rings.push(ring);
  } else if (el.type === 'star') {
    const points = (el as any).points || 5;
    const outerR = el.width / 2;
    const innerR = outerR * ((el as any).innerRatio || 0.38);
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const ring: [number, number][] = [];
    for (let i = 0; i <= points * 2; i++) {
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      ring.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    rings.push(ring);
  } else if (el.type === 'path') {
    const path = el as PathElement;
    if (path.nodes.length > 0) {
      const ring: [number, number][] = [];
      const len = path.nodes.length;
      for (let i = 0; i < len; i++) {
        const curr = path.nodes[i];
        const next = path.nodes[(i + 1) % len];
        if (!path.closed && i === len - 1) {
          break;
        }
        const p0x = path.x + curr.x;
        const p0y = path.y + curr.y;
        const p3x = path.x + next.x;
        const p3y = path.y + next.y;

        const cp1 = curr.cpOut ? { x: p0x + curr.cpOut.x, y: p0y + curr.cpOut.y } : null;
        const cp2 = next.cpIn ? { x: p3x + next.cpIn.x, y: p3y + next.cpIn.y } : null;

        if (cp1 || cp2) {
          const c1 = cp1 || { x: p0x, y: p0y };
          const c2 = cp2 || { x: p3x, y: p3y };
          const sampled = sampleBezier(p0x, p0y, c1.x, c1.y, c2.x, c2.y, p3x, p3y);
          // avoid duplicating endpoints
          if (sampled.length > 1) {
            ring.push(...(sampled.slice(0, -1) as [number, number][] ));
          }
        } else {
          ring.push([p0x, p0y]);
        }
      }
      if (path.nodes.length > 0) {
        const lastNode = path.nodes[path.nodes.length - 1];
        ring.push([path.x + lastNode.x, path.y + lastNode.y]);
      }
      // Ensure it is closed
      if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
        ring.push([ring[0][0], ring[0][1]]);
      }
      rings.push(ring);
    }
  }

  // Handle rotation of the coordinate rings if shape is rotated
  if (el.rotation && el.type !== 'path') {
    const angle = (el.rotation * Math.PI) / 180;
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    return rings.map(ring =>
      ring.map(([px, py]) => {
        const dx = px - cx;
        const dy = py - cy;
        const rx = cx + dx * Math.cos(angle) - dy * Math.sin(angle);
        const ry = cy + dx * Math.sin(angle) + dy * Math.cos(angle);
        return [rx, ry];
      })
    );
  }

  return rings;
}

// Convert MultiPolygon result back to a PathElement
export function polygonResultToPathElement(
  polygons: any,
  baseStyle: Partial<DesignElement>
): PathElement {
  const nodes: PathNode[] = [];
  
  // Flat representation: find the longest outer ring
  let bestRing: [number, number][] | null = null;
  for (const poly of polygons) {
    for (const ring of poly) {
      if (!bestRing || ring.length > bestRing.length) {
        bestRing = ring as [number, number][];
      }
    }
  }

  if (bestRing && bestRing.length > 0) {
    // Convert points to nodes. Remove last point if it duplicates first point
    let pts = [...bestRing];
    if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) {
      pts.pop();
    }
    // Calculate bounding box to normalize path coordinate space
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of pts) {
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }

    const x = minX;
    const y = minY;
    const width = maxX - minX || 1;
    const height = maxY - minY || 1;

    for (const [px, py] of pts) {
      nodes.push({
        x: px - x,
        y: py - y,
        type: 'corner'
      });
    }

    return {
      id: uid(),
      name: 'Combined Path',
      type: 'path',
      x,
      y,
      width,
      height,
      rotation: 0,
      opacity: baseStyle.opacity ?? 1,
      visible: baseStyle.visible ?? true,
      locked: baseStyle.locked ?? false,
      fills: baseStyle.fills || [{ type: 'solid', color: '#7C3AED', opacity: 1 }],
      strokes: baseStyle.strokes || [],
      effects: baseStyle.effects || [],
      blendMode: baseStyle.blendMode || 'normal',
      nodes,
      closed: true
    };
  }

  // Fallback empty path
  return {
    id: uid(),
    name: 'Empty Path',
    type: 'path',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fills: [{ type: 'solid', color: '#7C3AED', opacity: 1 }],
    strokes: [],
    effects: [],
    blendMode: 'normal',
    nodes: [],
    closed: true
  };
}

// Perform Boolean Operation
export function performBooleanOp(
  op: 'union' | 'subtract' | 'intersect' | 'exclude',
  elements: DesignElement[]
): PathElement | null {
  if (elements.length < 2) return null;

  // Convert elements to multi-polygon array for polygon-clipping
  const polyCoords = elements.map(el => [elementToPolygonRings(el)]);

  let result: any;
  try {
    if (op === 'union') {
      result = (polygonClipping.union as any)(...polyCoords);
    } else if (op === 'subtract') {
      // Subtract elements in order (element 0 minus element 1, 2, ...)
      result = (polygonClipping.difference as any)(polyCoords[0], ...polyCoords.slice(1));
    } else if (op === 'intersect') {
      result = (polygonClipping.intersection as any)(polyCoords[0], ...polyCoords.slice(1));
    } else { // exclude (xor)
      result = (polygonClipping.xor as any)(...polyCoords);
    }
  } catch (e) {
    console.error("Boolean operation error:", e);
    return null;
  }

  const baseStyle = elements[0];
  return polygonResultToPathElement(result, baseStyle);
}
