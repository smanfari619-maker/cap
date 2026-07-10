import { useEffect, useState, useRef } from 'react';

interface ClipFadeHandlesProps {
  clipId: string;
  fadeInMs: number;
  fadeOutMs: number;
  durationMs: number;
  pxPerMs: number;
  width: number;
  height: number;
  updateClip: (id: string, updates: any) => void | Promise<void>;
}

export default function ClipFadeHandles({
  clipId,
  fadeInMs,
  fadeOutMs,
  durationMs,
  pxPerMs,
  width,
  height,
  updateClip
}: ClipFadeHandlesProps) {
  const [localFadeIn, setLocalFadeIn] = useState(fadeInMs);
  const [localFadeOut, setLocalFadeOut] = useState(fadeOutMs);
  const [isDragging, setIsDragging] = useState<'in' | 'out' | null>(null);

  const startDragX = useRef(0);
  const startVal = useRef(0);

  useEffect(() => {
    if (!isDragging) {
      setLocalFadeIn(fadeInMs);
    }
  }, [fadeInMs, isDragging]);

  useEffect(() => {
    if (!isDragging) {
      setLocalFadeOut(fadeOutMs);
    }
  }, [fadeOutMs, isDragging]);

  const handlePointerDown = (e: React.PointerEvent, type: 'in' | 'out') => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(type);
    startDragX.current = e.clientX;
    startVal.current = type === 'in' ? fadeInMs : fadeOutMs;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    e.stopPropagation();
    
    const deltaX = e.clientX - startDragX.current;
    const deltaMs = deltaX / pxPerMs;

    if (isDragging === 'in') {
      const newVal = Math.max(0, Math.min(durationMs - localFadeOut, startVal.current + deltaMs));
      setLocalFadeIn(newVal);
      updateClip(clipId, { fadeInMs: Math.round(newVal) });
    } else {
      const newVal = Math.max(0, Math.min(durationMs - localFadeIn, startVal.current - deltaMs));
      setLocalFadeOut(newVal);
      updateClip(clipId, { fadeOutMs: Math.round(newVal) });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    e.stopPropagation();
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setIsDragging(null);
  };

  const fadeInWidth = localFadeIn * pxPerMs;
  const fadeOutWidth = localFadeOut * pxPerMs;

  // Curves for volume ramp visualization
  const fadeInLinePath = fadeInWidth > 0
    ? `M 0,${height} C ${fadeInWidth * 0.4},${height} ${fadeInWidth * 0.6},0 ${fadeInWidth},0`
    : '';

  const fadeOutLinePath = fadeOutWidth > 0
    ? `M ${width - fadeOutWidth},0 C ${width - fadeOutWidth * 0.6},0 ${width - fadeOutWidth * 0.4},${height} ${width},${height}`
    : '';

  // Silent dark mask overlays
  const fadeInMaskPath = fadeInWidth > 0
    ? `M 0,0 L ${fadeInWidth},0 C ${fadeInWidth * 0.6},0 ${fadeInWidth * 0.4},${height} 0,${height} Z`
    : '';

  const fadeOutMaskPath = fadeOutWidth > 0
    ? `M ${width - fadeOutWidth},0 L ${width},0 L ${width},${height} C ${width - fadeOutWidth * 0.4},${height} ${width - fadeOutWidth * 0.6},0 ${width - fadeOutWidth},0 Z`
    : '';

  return (
    <div className="absolute inset-0 pointer-events-none z-30 w-full h-full">
      {/* SVG Curve Overlays */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {/* Silent masks */}
        {fadeInMaskPath && <path d={fadeInMaskPath} fill="rgba(0,0,0,0.4)" />}
        {fadeOutMaskPath && <path d={fadeOutMaskPath} fill="rgba(0,0,0,0.4)" />}
        
        {/* Visual curve borders */}
        {fadeInLinePath && (
          <path d={fadeInLinePath} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeDasharray="3,2" />
        )}
        {fadeOutLinePath && (
          <path d={fadeOutLinePath} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeDasharray="3,2" />
        )}
      </svg>

      {/* Fade In Handle */}
      <div
        onPointerDown={(e) => handlePointerDown(e, 'in')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`absolute w-3 h-3 bg-white border-2 border-violet-500 rounded-full cursor-col-resize pointer-events-auto transform -translate-x-1/2 shadow-md hover:scale-125 transition-transform z-35`}
        style={{ left: `${fadeInWidth}px`, top: '4px' }}
        title={`Fade In: ${Math.round(localFadeIn)}ms (Drag left/right to adjust)`}
      />

      {/* Fade Out Handle */}
      <div
        onPointerDown={(e) => handlePointerDown(e, 'out')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`absolute w-3 h-3 bg-white border-2 border-violet-500 rounded-full cursor-col-resize pointer-events-auto transform -translate-x-1/2 shadow-md hover:scale-125 transition-transform z-35`}
        style={{ left: `${width - fadeOutWidth}px`, top: '4px' }}
        title={`Fade Out: ${Math.round(localFadeOut)}ms (Drag left/right to adjust)`}
      />
    </div>
  );
}
