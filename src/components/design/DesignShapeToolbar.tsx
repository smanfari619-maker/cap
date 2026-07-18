import { useState, useEffect } from 'react';
import { useDesignStore } from './useDesignStore';
import { ChevronDown, Link2, Download } from 'lucide-react';
import { drawElementOnContext } from './utils';

export default function DesignShapeToolbar() {
  const { selectedIds, artboardSelected, elements, updateElement, panX, panY, zoom } = useDesignStore();
  const [isLocked, setIsLocked] = useState(false);

  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const el = selectedId ? elements[selectedId] : null;

  if (artboardSelected || !el) return null;

  // Only show for shapes
  const isShape = ['rect', 'ellipse', 'star', 'polygon', 'line', 'arrow'].includes(el.type);
  if (!isShape) return null;

  const fill = el.fills[0];
  const fillColor = fill?.type === 'solid' ? fill.color : '#cccccc';

  const stroke = el.strokes[0];
  const strokeColor = stroke ? stroke.color : '#000000';
  const hasStroke = !!stroke;

  const handleFillChange = (color: string) => {
    const nextFills = [...el.fills];
    if (nextFills[0]) {
      nextFills[0] = { ...nextFills[0], color };
    } else {
      nextFills.push({ type: 'solid', color, opacity: 1 });
    }
    updateElement(el.id, { fills: nextFills });
  };

  const handleStrokeChange = (color: string) => {
    const nextStrokes = [...el.strokes];
    if (nextStrokes[0]) {
      nextStrokes[0] = { ...nextStrokes[0], color };
    } else {
      nextStrokes.push({ color, opacity: 1, width: 2, style: 'solid', position: 'center' });
    }
    updateElement(el.id, { strokes: nextStrokes });
  };

  const toggleStroke = () => {
    if (hasStroke) {
      updateElement(el.id, { strokes: [] });
    } else {
      updateElement(el.id, {
        strokes: [{ color: '#000000', opacity: 1, width: 2, style: 'solid', position: 'center' }]
      });
    }
  };

  const handleWidthChange = (val: number) => {
    if (isLocked && el.height > 0) {
      const ratio = el.width / el.height;
      updateElement(el.id, { width: val, height: Math.round(val / ratio) });
    } else {
      updateElement(el.id, { width: val });
    }
  };

  const handleHeightChange = (val: number) => {
    if (isLocked && el.width > 0) {
      const ratio = el.width / el.height;
      updateElement(el.id, { height: val, width: Math.round(val * ratio) });
    } else {
      updateElement(el.id, { height: val });
    }
  };

  const handleRadiusChange = (val: number) => {
    updateElement(el.id, { cornerRadius: val });
  };

  const handleExportShape = () => {
    const canvas = document.createElement('canvas');
    canvas.width = el.width;
    canvas.height = el.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Create copy at (0, 0)
    const tempEl = { ...el, x: 0, y: 0, rotation: 0 };
    drawElementOnContext(ctx, tempEl as any, 1, (x, y) => ({ x, y }), new Map(), {});
    
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `${el.name || 'shape'}.png`;
    link.href = dataUrl;
    link.click();
  };

  // Position calculation
  const sx = el.x * zoom + panX;
  const sy = el.y * zoom + panY;
  const sw = el.width * zoom;
  const sh = el.height * zoom;

  const centerX = sx + sw / 2;
  const bottomY = sy - 22; // 22px above top border
  const topY = Math.max(8, bottomY - 38);

  return (
    <div
      id="design-shape-toolbar"
      className="absolute flex items-center gap-2.5 px-3 py-1.5 rounded-full border bg-white select-none shadow-sm"
      style={{
        zIndex: 50,
        borderColor: '#e5e5e5',
        height: 38,
        left: centerX,
        top: topY,
        transform: 'translateX(-50%)',
      }}
    >
      {/* Fill Swatch */}
      <div
        className="relative flex items-center justify-center w-5.5 h-5.5 rounded-full border cursor-pointer overflow-hidden shadow-sm"
        style={{
          borderColor: '#e5e5e5',
          backgroundColor: fillColor,
        }}
        title="Fill color"
      >
        <input
          type="color"
          value={fillColor}
          onChange={(e) => handleFillChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </div>

      {/* Stroke Swatch / Toggle */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleStroke}
          className={`relative flex items-center justify-center w-5.5 h-5.5 rounded-full border cursor-pointer overflow-hidden transition-all ${
            hasStroke ? 'border-black' : 'border-dashed border-gray-300'
          }`}
          style={{
            backgroundColor: hasStroke ? 'transparent' : '#ffffff',
          }}
          title={hasStroke ? 'Disable stroke' : 'Enable stroke'}
        >
          {hasStroke ? (
            <div className="w-3.5 h-3.5 rounded-full border-2" style={{ borderColor: strokeColor }} />
          ) : (
            <div className="w-3.5 h-3.5 rounded-full border border-dashed border-gray-400" />
          )}
        </button>
        {hasStroke && (
          <div className="relative w-4 h-4 overflow-hidden rounded cursor-pointer">
            <input
              type="color"
              value={strokeColor}
              onChange={(e) => handleStrokeChange(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </div>
        )}
      </div>

      {/* Corner Radius (Only for Rects) */}
      {el.type === 'rect' && (
        <>
          <div className="flex items-center gap-1">
            {/* Custom Corner Radius Icon */}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
              <path d="M19 6h-6a7 7 0 0 0-7 7v6" />
              <path d="M12 12l-3 3" />
              <path d="M9 11v4h4" />
            </svg>
            <input
              type="number"
              value={(el as any).cornerRadius ?? 0}
              onChange={(e) => handleRadiusChange(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-10 px-1 py-0.5 rounded bg-gray-50 border border-gray-200 text-[11px] text-center font-mono text-gray-800 outline-none focus:border-blue-400"
            />
          </div>
        </>
      )}

      <div className="w-px h-4 bg-gray-200" />

      {/* Dimensions (W / H) */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-medium text-gray-400 font-mono">W</span>
          <input
            type="number"
            value={el.width}
            onChange={(e) => handleWidthChange(parseInt(e.target.value) || 4)}
            className="w-12 px-1 py-0.5 rounded bg-gray-50 border border-gray-200 text-[11px] text-center font-mono text-gray-800 outline-none focus:border-blue-400"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-medium text-gray-400 font-mono">H</span>
          <input
            type="number"
            value={el.height}
            onChange={(e) => handleHeightChange(parseInt(e.target.value) || 4)}
            className="w-12 px-1 py-0.5 rounded bg-gray-50 border border-gray-200 text-[11px] text-center font-mono text-gray-800 outline-none focus:border-blue-400"
          />
        </div>

        {/* Link / Aspect Ratio Lock */}
        <button
          onClick={() => setIsLocked(!isLocked)}
          className={`flex items-center justify-center w-5.5 h-5.5 rounded transition-all ${
            isLocked ? 'bg-blue-50 text-blue-500 border border-blue-100' : 'text-gray-400 hover:text-gray-700 hover:bg-black/5'
          }`}
          title="Lock aspect ratio"
        >
          <Link2 size={12} />
        </button>
      </div>

      <div className="w-px h-4 bg-gray-200" />

      {/* Export / Download Button */}
      <button
        onClick={handleExportShape}
        className="flex items-center justify-center w-5.5 h-5.5 rounded text-gray-500 hover:text-gray-700 hover:bg-black/5 transition-colors"
        title="Export shape as PNG"
      >
        <Download size={12} />
      </button>
    </div>
  );
}
