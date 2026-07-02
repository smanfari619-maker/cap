import React, { useState, useEffect, useRef } from 'react';
import { getFileURLFromOPFS } from '../../lib/opfs';
import { type Asset } from '../../lib/db';
import { X, RefreshCw, Eraser } from 'lucide-react';

interface WatermarkDrawModalProps {
  asset: Asset;
  initialTimeMs: number;
  onClose: () => void;
  onConfirm: (region: { x: number; y: number; w: number; h: number; maskData?: Uint8Array }) => void;
}

export default function WatermarkDrawModal({
  asset,
  initialTimeMs,
  onClose,
  onConfirm
}: WatermarkDrawModalProps) {
  const [videoURL, setVideoURL] = useState<string | null>(null);
  const [naturalWidth, setNaturalWidth] = useState<number>(0);
  const [naturalHeight, setNaturalHeight] = useState<number>(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Load the OPFS file Blob URL
  useEffect(() => {
    let active = true;
    let urlToRevoke = '';
    getFileURLFromOPFS(asset.opfsPath).then(url => {
      if (active) {
        setVideoURL(url);
        urlToRevoke = url;
      } else {
        URL.revokeObjectURL(url);
      }
    });

    return () => {
      active = false;
      if (urlToRevoke) {
        URL.revokeObjectURL(urlToRevoke);
      }
    };
  }, [asset.opfsPath]);

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    setNaturalWidth(video.videoWidth);
    setNaturalHeight(video.videoHeight);
    
    // Seek to the correct initial time (seconds)
    video.currentTime = initialTimeMs / 1000;
  };

  // Sync canvas size to video layout size
  useEffect(() => {
    if (!videoRef.current || !canvasRef.current || !naturalWidth || !naturalHeight) return;
    
    // We must wait for the video layout to settle
    const observer = new ResizeObserver(() => {
      if (videoRef.current && canvasRef.current) {
        canvasRef.current.width = videoRef.current.clientWidth;
        canvasRef.current.height = videoRef.current.clientHeight;
        
        // Reset canvas context properties after resize
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.lineWidth = 15;
          ctx.strokeStyle = 'rgba(139, 92, 246, 0.7)'; // Violet-500 with opacity
        }
      }
    });
    
    observer.observe(videoRef.current);
    return () => observer.disconnect();
  }, [naturalWidth, naturalHeight]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.closePath();
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleConfirm = () => {
    if (!hasDrawn || !canvasRef.current || !naturalWidth || !naturalHeight) return;
    
    // To get pixel-perfect accuracy, we draw the overlay canvas onto an offscreen
    // canvas that matches the exact natural resolution of the original video.
    const offscreen = document.createElement('canvas');
    offscreen.width = naturalWidth;
    offscreen.height = naturalHeight;
    const octx = offscreen.getContext('2d');
    if (!octx) return;

    // Draw and automatically scale the user's paint strokes to native resolution
    octx.drawImage(canvasRef.current, 0, 0, naturalWidth, naturalHeight);
    
    const imgData = octx.getImageData(0, 0, naturalWidth, naturalHeight);
    const data = imgData.data;

    let minX = naturalWidth;
    let minY = naturalHeight;
    let maxX = 0;
    let maxY = 0;

    // 1. Find bounding box of painted pixels
    for (let y = 0; y < naturalHeight; y++) {
      for (let x = 0; x < naturalWidth; x++) {
        const alpha = data[(y * naturalWidth + x) * 4 + 3];
        if (alpha > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (minX > maxX || minY > maxY) {
      // Nothing was drawn
      return;
    }

    // Add a tiny bit of padding to the bounding box just in case
    minX = Math.max(0, minX - 2);
    minY = Math.max(0, minY - 2);
    maxX = Math.min(naturalWidth - 1, maxX + 2);
    maxY = Math.min(naturalHeight - 1, maxY + 2);

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;

    // 2. Extract tight Uint8Array mask
    const maskData = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcX = minX + x;
        const srcY = minY + y;
        const alpha = data[(srcY * naturalWidth + srcX) * 4 + 3];
        if (alpha > 0) {
          maskData[y * w + x] = 1;
        }
      }
    }

    onConfirm({ x: minX, y: minY, w, h, maskData });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-100">Paint Watermark Region</h3>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Use the brush to paint precisely over the watermark.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition p-1 hover:bg-zinc-900 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Video Preview Container */}
        <div className="flex-1 flex items-center justify-center bg-black rounded-lg border border-zinc-900 p-2 min-h-0 relative overflow-hidden">
          {videoURL ? (
            <div className="relative inline-block max-w-full max-h-[60vh]">
              <video
                ref={videoRef}
                src={videoURL}
                onLoadedMetadata={handleLoadedMetadata}
                className="max-w-full max-h-[60vh] block rounded pointer-events-none select-none"
                muted
                playsInline
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 z-10 cursor-crosshair touch-none"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-20">
              <RefreshCw className="w-6 h-6 text-zinc-500 animate-spin" />
              <p className="text-xs text-zinc-500">Loading original video frame...</p>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="flex items-center justify-between border-t border-zinc-800 pt-4 mt-4">
          <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-4">
            {naturalWidth && naturalHeight ? (
              <span>Video Resolution: {naturalWidth}×{naturalHeight} px</span>
            ) : (
              <span>Loading video resolution...</span>
            )}
            {hasDrawn && (
              <button 
                onClick={clearCanvas}
                className="flex items-center gap-1.5 text-zinc-400 hover:text-red-400 transition"
              >
                <Eraser className="w-3 h-3" /> Clear Brush
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!hasDrawn}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white transition disabled:cursor-not-allowed"
            >
              Confirm Region
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
