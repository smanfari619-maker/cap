import type { DesignElement, RectElement, TextElement, ImageElement, LineElement, StarElement, PolygonElement, PathElement, Fill, Effect, DropShadow } from './types';

export const uid = () => Math.random().toString(36).substring(2, 10);

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(' ');
    let current = '';
    for (const word of words) {
      const test = current ? current + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    else if (paragraphs.length > 1) lines.push('');
  }

  return lines.length ? lines : [''];
}

export function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, points: number, outerR: number, innerR: number) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    if (i === 0) ctx.moveTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    else ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  ctx.closePath();
}

export function drawPolygon(ctx: CanvasRenderingContext2D, cx: number, cy: number, sides: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
    if (i === 0) ctx.moveTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    else ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  ctx.closePath();
}

export function getBounds(els: DesignElement[]) {
  if (!els.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of els) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function applyFill(ctx: CanvasRenderingContext2D, fill: Fill, x: number, y: number, w: number, h: number, imageCache?: Map<string, HTMLImageElement>) {
  if (fill.type === 'solid') {
    const hex = fill.color;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    ctx.fillStyle = `rgba(${r},${g},${b},${fill.opacity})`;
  } else if (fill.type === 'linear') {
    const angle = (fill.angle * Math.PI) / 180;
    const grd = ctx.createLinearGradient(
      x + w / 2 - Math.cos(angle) * w / 2,
      y + h / 2 - Math.sin(angle) * h / 2,
      x + w / 2 + Math.cos(angle) * w / 2,
      y + h / 2 + Math.sin(angle) * h / 2
    );
    fill.stops.forEach(s => grd.addColorStop(s.position, s.color));
    ctx.fillStyle = grd;
  } else if (fill.type === 'radial') {
    const grd = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, Math.max(w, h) / 2);
    fill.stops.forEach(s => grd.addColorStop(s.position, s.color));
    ctx.fillStyle = grd;
  } else if (fill.type === 'image' && imageCache) {
    const cached = imageCache.get(fill.url);
    if (cached) {
      const pattern = ctx.createPattern(cached, fill.fit === 'tile' ? 'repeat' : 'no-repeat');
      if (pattern) {
        ctx.fillStyle = pattern;
      }
    }
  }
}

export function applyEffects(ctx: CanvasRenderingContext2D, effects: Effect[], zoom = 1) {
  const shadow = effects.find(e => e.type === 'drop-shadow') as DropShadow | undefined;
  if (shadow) {
    ctx.shadowColor = shadow.color;
    ctx.shadowBlur = shadow.blur * zoom;
    ctx.shadowOffsetX = shadow.offsetX * zoom;
    ctx.shadowOffsetY = shadow.offsetY * zoom;
  }
  // Implement inner shadow and blur filters if supported
  const blur = effects.find(e => e.type === 'blur') as any;
  if (blur) {
    ctx.filter = `blur(${blur.radius * zoom}px)`;
  }
}

export function clearEffects(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.filter = 'none';
}

export function drawElementOnContext(
  ctx: CanvasRenderingContext2D,
  el: DesignElement,
  zoom: number,
  toCanvas: (wx: number, wy: number) => { x: number; y: number },
  imageCache: Map<string, HTMLImageElement>,
  elementsMap?: Record<string, DesignElement>
) {
  if (!el.visible) return;
  ctx.save();
  ctx.globalAlpha = el.opacity;
  ctx.globalCompositeOperation = el.blendMode as GlobalCompositeOperation;

  const { x: cx, y: cy } = toCanvas(el.x, el.y);
  const cw = el.width * zoom;
  const ch = el.height * zoom;

  // Rotation around center
  if (el.rotation) {
    ctx.translate(cx + cw / 2, cy + ch / 2);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-(cx + cw / 2), -(cy + ch / 2));
  }

  // Flips
  if ((el as any).flipHorizontal || (el as any).flipVertical) {
    ctx.translate(cx + cw / 2, cy + ch / 2);
    ctx.scale(
      (el as any).flipHorizontal ? -1 : 1,
      (el as any).flipVertical ? -1 : 1
    );
    ctx.translate(-(cx + cw / 2), -(cy + ch / 2));
  }

  applyEffects(ctx, el.effects, zoom);

  if (el.type === 'rect') {
    const rect = el as RectElement;
    ctx.beginPath();
    if (rect.cornerRadii) {
      const scaledRadii = rect.cornerRadii.map(r => r * zoom) as [number, number, number, number];
      ctx.roundRect(cx, cy, cw, ch, scaledRadii);
    } else {
      const r = (rect.cornerRadius ?? 0) * zoom;
      if (r > 0) {
        ctx.roundRect(cx, cy, cw, ch, r);
      } else {
        ctx.rect(cx, cy, cw, ch);
      }
    }
    for (const fill of el.fills) {
      applyFill(ctx, fill, cx, cy, cw, ch, imageCache);
      ctx.fill();
    }
    clearEffects(ctx);
    for (const stroke of el.strokes) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width * zoom;
      if (stroke.style === 'dashed') ctx.setLineDash([8, 4]);
      else if (stroke.style === 'dotted') ctx.setLineDash([2, 4]);
      else ctx.setLineDash([]);
      ctx.stroke();
    }
  } else if (el.type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(cx + cw / 2, cy + ch / 2, cw / 2, ch / 2, 0, 0, Math.PI * 2);
    for (const fill of el.fills) {
      applyFill(ctx, fill, cx, cy, cw, ch, imageCache);
      ctx.fill();
    }
    clearEffects(ctx);
    for (const stroke of el.strokes) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width * zoom;
      if (stroke.style === 'dashed') ctx.setLineDash([8, 4]);
      else if (stroke.style === 'dotted') ctx.setLineDash([2, 4]);
      else ctx.setLineDash([]);
      ctx.stroke();
    }
  } else if (el.type === 'text') {
    const text = el as TextElement;
    const ts = text.textStyle;
    ctx.font = `${ts.fontStyle || 'normal'} ${ts.fontWeight || '400'} ${ts.fontSize * zoom}px '${ts.fontFamily || 'Inter'}', sans-serif`;
    ctx.fillStyle = ts.color || '#ffffff';
    ctx.textAlign = (ts.textAlign || 'left') as CanvasTextAlign;
    ctx.textBaseline = 'top';
    const lineH = ts.fontSize * zoom * (ts.lineHeight || 1.2);
    
    let content = text.content || '';
    if (ts.textTransform === 'uppercase') content = content.toUpperCase();
    else if (ts.textTransform === 'lowercase') content = content.toLowerCase();
    else if (ts.textTransform === 'capitalize') {
      content = content.replace(/\b\w/g, c => c.toUpperCase());
    }
 
    const lines = wrapText(ctx, content, cw);
    const alignX = ts.textAlign === 'center' ? cx + cw / 2 : ts.textAlign === 'right' ? cx + cw : cx;
    clearEffects(ctx);
    applyEffects(ctx, el.effects, zoom);
    
    lines.forEach((line, i) => {
      const lineY = cy + i * lineH;
      ctx.fillText(line, alignX, lineY);
 
      if (ts.textDecoration === 'underline' || ts.textDecoration === 'line-through') {
        const textWidth = ctx.measureText(line).width;
        let lineStartX = alignX;
        if (ts.textAlign === 'center') lineStartX = alignX - textWidth / 2;
        else if (ts.textAlign === 'right') lineStartX = alignX - textWidth;
 
        ctx.strokeStyle = ts.color || '#ffffff';
        ctx.lineWidth = Math.max(1, (ts.fontSize * zoom) / 16);
        ctx.beginPath();
        if (ts.textDecoration === 'underline') {
          ctx.moveTo(lineStartX, lineY + ts.fontSize * zoom * 0.95);
          ctx.lineTo(lineStartX + textWidth, lineY + ts.fontSize * zoom * 0.95);
        } else {
          ctx.moveTo(lineStartX, lineY + ts.fontSize * zoom * 0.55);
          ctx.lineTo(lineStartX + textWidth, lineY + ts.fontSize * zoom * 0.55);
        }
        ctx.stroke();
      }
    });
  } else if (el.type === 'image') {
    const img = el as ImageElement;
    const cached = imageCache.get(img.url);
    if (cached) {
      if (typeof img.cropW === 'number' && typeof img.cropH === 'number' && img.cropW > 0 && img.cropH > 0) {
        ctx.drawImage(
          cached,
          cached.naturalWidth * img.cropX,
          cached.naturalHeight * img.cropY,
          cached.naturalWidth * img.cropW,
          cached.naturalHeight * img.cropH,
          cx, cy, cw, ch
        );
      } else {
        ctx.drawImage(cached, cx, cy, cw, ch);
      }
    } else {
      ctx.fillStyle = '#2d2d2d';
      ctx.fillRect(cx, cy, cw, ch);
    }
  } else if (el.type === 'path') {
    const path = el as PathElement;
    if (path.nodes.length > 0) {
      ctx.beginPath();
      const n0 = path.nodes[0];
      ctx.moveTo(cx + n0.x * zoom, cy + n0.y * zoom);
      const len = path.nodes.length;
      for (let i = 0; i < len; i++) {
        if (i === len - 1 && !path.closed) break;
        const curr = path.nodes[i];
        const next = path.nodes[(i + 1) % len];
        const p0x = cx + curr.x * zoom;
        const p0y = cy + curr.y * zoom;
        const p3x = cx + next.x * zoom;
        const p3y = cy + next.y * zoom;

        const cp1 = curr.cpOut ? { x: p0x + curr.cpOut.x * zoom, y: p0y + curr.cpOut.y * zoom } : null;
        const cp2 = next.cpIn ? { x: p3x + next.cpIn.x * zoom, y: p3y + next.cpIn.y * zoom } : null;

        if (cp1 || cp2) {
          const c1 = cp1 || { x: p0x, y: p0y };
          const c2 = cp2 || { x: p3x, y: p3y };
          ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p3x, p3y);
        } else {
          ctx.lineTo(p3x, p3y);
        }
      }
      if (path.closed) {
        ctx.closePath();
      }
      for (const fill of el.fills) {
        applyFill(ctx, fill, cx, cy, cw, ch, imageCache);
        ctx.fill();
      }
      clearEffects(ctx);
      for (const stroke of el.strokes) {
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width * zoom;
        if (stroke.style === 'dashed') ctx.setLineDash([8, 4]);
        else if (stroke.style === 'dotted') ctx.setLineDash([2, 4]);
        else ctx.setLineDash([]);
        ctx.stroke();
      }
    }
  } else if (el.type === 'line') {
    const line = el as LineElement;
    const { x: x2, y: y2 } = toCanvas(line.x2, line.y2);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x2, y2);
    for (const stroke of el.strokes) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width * zoom;
      if (stroke.style === 'dashed') ctx.setLineDash([8, 4]);
      else if (stroke.style === 'dotted') ctx.setLineDash([2, 4]);
      else ctx.setLineDash([]);
      ctx.stroke();
    }
  } else if (el.type === 'star') {
    const star = el as StarElement;
    drawStar(ctx, cx + cw / 2, cy + ch / 2, star.points, cw / 2, (cw / 2) * star.innerRatio);
    for (const fill of el.fills) {
      applyFill(ctx, fill, cx, cy, cw, ch, imageCache);
      ctx.fill();
    }
  } else if (el.type === 'polygon') {
    const poly = el as PolygonElement;
    drawPolygon(ctx, cx + cw / 2, cy + ch / 2, poly.sides, Math.min(cw, ch) / 2);
    for (const fill of el.fills) {
      applyFill(ctx, fill, cx, cy, cw, ch, imageCache);
      ctx.fill();
    }
  } else if (el.type === 'group') {
    const group = el as any;
    if (group.children && elementsMap) {
      for (const childId of group.children) {
        const child = elementsMap[childId];
        if (child) {
          drawElementOnContext(ctx, child, zoom, toCanvas, imageCache, elementsMap);
        }
      }
    }
  }

  ctx.restore();
}
