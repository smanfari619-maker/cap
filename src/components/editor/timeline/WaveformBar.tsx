import { useEffect, useRef, useState } from 'react';
import { getWaveformPeaksForAsset } from '../../../lib/waveform-generator';

interface WaveformBarProps {
  assetId: string;
  durationMs: number;
  trimStartMs: number;
  trimEndMs: number;
  color?: string;
}

export default function WaveformBar({
  assetId,
  durationMs,
  trimStartMs,
  trimEndMs,
  color = 'rgba(14, 165, 233, 0.5)'
}: WaveformBarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peaksRef = useRef<number[]>([]);
  const [peaks, setPeaks] = useState<number[]>([]);

  useEffect(() => {
    let active = true;
    getWaveformPeaksForAsset(assetId).then((data) => {
      if (active) {
        peaksRef.current = data;
        setPeaks(data);
      }
    });
    return () => {
      active = false;
    };
  }, [assetId]);

  // Draw function, separated so it can be called from both effects
  function drawWaveform(canvas: HTMLCanvasElement, currentPeaks: number[]) {
    if (!canvas || currentPeaks.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    ctx.clearRect(0, 0, width, height);

    const assetDurationMs = trimStartMs + durationMs + trimEndMs;
    const startPct = assetDurationMs > 0 ? trimStartMs / assetDurationMs : 0;
    const endPct = assetDurationMs > 0 ? (trimStartMs + durationMs) / assetDurationMs : 1;

    const startIndex = Math.floor(startPct * currentPeaks.length);
    const endIndex = Math.min(currentPeaks.length, Math.ceil(endPct * currentPeaks.length));
    const visiblePeaks = currentPeaks.slice(startIndex, endIndex);

    if (visiblePeaks.length === 0) return;

    ctx.fillStyle = color;
    const barWidth = width / visiblePeaks.length;
    const midY = height / 2;

    for (let i = 0; i < visiblePeaks.length; i++) {
      const peak = visiblePeaks[i];
      const barHeight = peak * height * 0.8;
      const x = i * barWidth;
      const y = midY - barHeight / 2;
      ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
    }
  }

  // Redraw whenever peaks, trim, or color change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && peaks.length > 0) {
      drawWaveform(canvas, peaks);
    }
  }, [peaks, durationMs, trimStartMs, trimEndMs, color]);

  // Also use a ResizeObserver so we draw once the container has real dimensions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver(() => {
      if (peaksRef.current.length > 0) {
        drawWaveform(canvas, peaksRef.current);
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full pointer-events-none absolute inset-0"
    />
  );
}

