import React, { useState, useEffect, useRef } from 'react';
import { getFileURLFromOPFS } from '../../lib/opfs';
import { type Asset } from '../../lib/db';
import { X, RefreshCw } from 'lucide-react';

interface WatermarkDrawModalProps {
  asset: Asset;
  initialTimeMs: number;
  onClose: () => void;
  onConfirm: (region: { x: number; y: number; w: number; h: number }) => void;
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
  const containerRef = useRef<HTMLDivElement>(null);

  // Dragging / Selection state
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

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

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDragStart({ x, y });
    setCurrentPos({ x, y });
    setSelectedRegion(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    setCurrentPos({ x, y });
  };

  const handleMouseUp = () => {
    if (!dragStart || !currentPos) return;
    
    const x = Math.min(dragStart.x, currentPos.x);
    const y = Math.min(dragStart.y, currentPos.y);
    const w = Math.abs(dragStart.x - currentPos.x);
    const h = Math.abs(dragStart.y - currentPos.y);

    if (w > 5 && h > 5) {
      setSelectedRegion({ x, y, w, h });
    }
    setDragStart(null);
    setCurrentPos(null);
  };

  const handleConfirm = () => {
    if (!selectedRegion || !containerRef.current || !naturalWidth || !naturalHeight) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    
    const x_rel = selectedRegion.x / rect.width;
    const y_rel = selectedRegion.y / rect.height;
    const w_rel = selectedRegion.w / rect.width;
    const h_rel = selectedRegion.h / rect.height;

    const region = {
      x: Math.round(x_rel * naturalWidth),
      y: Math.round(y_rel * naturalHeight),
      w: Math.round(w_rel * naturalWidth),
      h: Math.round(h_rel * naturalHeight)
    };

    onConfirm(region);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-100">Select Watermark Region</h3>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Draw a box exactly over the watermark on the raw video preview frame.
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
        <div className="flex-1 flex items-center justify-center bg-black rounded-lg border border-zinc-900 p-2 min-h-0 relative">
          {videoURL ? (
            <div
              ref={containerRef}
              className="relative select-none inline-block max-w-full max-h-[60vh]"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              <video
                ref={videoRef}
                src={videoURL}
                onLoadedMetadata={handleLoadedMetadata}
                className="max-w-full max-h-[60vh] block rounded pointer-events-none"
                muted
                playsInline
              />

              {/* Selection overlay (transparent cover to capture drags) */}
              <div className="absolute inset-0 cursor-crosshair" />

              {/* Live drawing rectangle */}
              {dragStart && currentPos && (
                <div
                  className="absolute border border-dashed border-violet-500 bg-violet-500/20 pointer-events-none"
                  style={{
                    left: Math.min(dragStart.x, currentPos.x),
                    top: Math.min(dragStart.y, currentPos.y),
                    width: Math.abs(dragStart.x - currentPos.x),
                    height: Math.abs(dragStart.y - currentPos.y)
                  }}
                />
              )}

              {/* Confirmed selection region */}
              {selectedRegion && (
                <div
                  className="absolute border-2 border-violet-500 bg-violet-500/10 pointer-events-none"
                  style={{
                    left: selectedRegion.x,
                    top: selectedRegion.y,
                    width: selectedRegion.w,
                    height: selectedRegion.h
                  }}
                >
                  <div className="absolute -top-1 -left-1 w-2 h-2 bg-violet-500 rounded-sm" />
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-violet-500 rounded-sm" />
                  <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-violet-500 rounded-sm" />
                  <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-violet-500 rounded-sm" />
                </div>
              )}
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
          <div className="text-[10px] text-zinc-500 font-mono">
            {naturalWidth && naturalHeight ? (
              <span>Video Resolution: {naturalWidth}×{naturalHeight} px</span>
            ) : (
              <span>Loading video resolution...</span>
            )}
            {selectedRegion && containerRef.current && (
              <span className="ml-4 text-violet-400">
                Selected: {Math.round((selectedRegion.w / containerRef.current.clientWidth) * naturalWidth)}×
                {Math.round((selectedRegion.h / containerRef.current.clientHeight) * naturalHeight)} px
              </span>
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
              disabled={!selectedRegion}
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
