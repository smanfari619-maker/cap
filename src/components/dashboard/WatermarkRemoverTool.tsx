/**
 * Gemini Watermark Remover — Dashboard Tool
 *
 * Exactly matches @pilio/gemini-watermark-remover internals:
 *   - Loads all 4 embedded alpha maps (48, 96, 96-20260520, 36-v2)
 *   - Provides a synchronous getAlphaMap cache (same as WatermarkEngine.removeWatermarkFromImage)
 *   - Frame 0 → full detection pipeline (removeWatermarkFromImageDataSync with all maps)
 *   - Frames 1+ → direct reverse-alpha-blend on the ~9 000 watermark pixels only (~0.1 ms/frame)
 *   - requestVideoFrameCallback for real-time playback capture (no keyframe-seek overhead)
 *   - MediaRecorder on output canvas for the final video blob
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Upload, Download, ImageIcon, Video, Sparkles,
  CheckCircle, AlertCircle, Loader2, RefreshCw, X,
  Paintbrush, Hand, ZoomIn, ZoomOut
} from 'lucide-react';
import { removeWatermarkFromVideoFile, removeWatermarkFromImageDataSync } from '../../lib/watermark';

// ─── Video Processor ──────────────────────────────────────────────────────────
async function processVideoFast(
  file: File,
  region: { x: number; y: number; w: number; h: number } | null,
  onProgress: (pct: number, label: string) => void
): Promise<Blob> {
  const arrayBuffer = await removeWatermarkFromVideoFile(file, region, (pct) => {
    const val = Math.round(pct * 100);
    onProgress(val, `Processing… ${val}%`);
  });
  return new Blob([arrayBuffer], { type: 'video/mp4' });
}

// ─── Image Processing ─────────────────────────────────────────────────────────
function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), type);
  });
}

// ─── DropZone ─────────────────────────────────────────────────────────────────
function DropZone({ accept, onFile, label, sublabel }: {
  accept: string; onFile: (f: File) => void; label: string; sublabel: string;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) onFile(f);
  }, [onFile]);
  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 cursor-pointer transition-all duration-200 select-none ${
        dragging ? 'border-violet-500 bg-violet-600/8 shadow-inner shadow-violet-900/20'
                 : 'border-zinc-800 bg-zinc-900/20 hover:border-zinc-700 hover:bg-zinc-900/35'
      }`}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-200 ${dragging ? 'scale-110 bg-violet-600/20' : 'bg-zinc-800/80'}`}>
        <Upload className={`w-6 h-6 transition-colors ${dragging ? 'text-violet-400' : 'text-zinc-400'}`} />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-zinc-300">{label}</p>
        <p className="text-xs text-zinc-500 mt-1">{sublabel}</p>
      </div>
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </div>
  );
}

// ─── BeforeAfter preview ──────────────────────────────────────────────────────
function BeforeAfterPreview({ origUrl, resultUrl, isVideo }: {
  origUrl: string; resultUrl: string | null; isVideo: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {([['Original', origUrl, false], ['Processed', resultUrl, true]] as const).map(([label, url, isPro]) => (
        <div key={label} className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full inline-block ${isPro ? 'bg-violet-500' : 'bg-zinc-600'}`} />
            {label}
          </span>
          <div className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 aspect-video flex items-center justify-center relative">
            {url
              ? (isVideo
                  ? <video src={url} className="w-full h-full object-contain" controls muted />
                  : <img src={url} className="w-full h-full object-contain" alt={label} />
                )
              : <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <Sparkles className="w-8 h-8 text-zinc-700 animate-pulse" />
                  <span className="text-[10px] text-zinc-600 font-medium">Awaiting processing…</span>
                </div>
            }
          </div>
        </div>
      ))}
    </div>
  );
}

type Tab = 'image' | 'video';

interface ProcessResult {
  url: string;
  name: string;
  size: number;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function WatermarkRemoverTool() {
  const [tab, setTab] = useState<Tab>('image');

  // Bounding box selection state
  const [customRegion, setCustomRegion] = useState<{ x: number; y: number; w: number; h: number; maskData?: Uint8Array } | null>(null);
  const [showDrawModal, setShowDrawModal] = useState(false);

  // Image
  const [imgFile,      setImgFile]      = useState<File | null>(null);
  const [imgOrigUrl,   setImgOrigUrl]   = useState<string | null>(null);
  const [imgResult,    setImgResult]    = useState<ProcessResult | null>(null);
  const [imgBusy,      setImgBusy]      = useState(false);
  const [imgError,     setImgError]     = useState<string | null>(null);

  // Video
  const [vidFile,      setVidFile]      = useState<File | null>(null);
  const [vidOrigUrl,   setVidOrigUrl]   = useState<string | null>(null);
  const [vidResult,    setVidResult]    = useState<ProcessResult | null>(null);
  const [vidBusy,      setVidBusy]      = useState(false);
  const [vidPct,       setVidPct]       = useState(0);
  const [vidLabel,     setVidLabel]     = useState('');
  const [vidError,     setVidError]     = useState<string | null>(null);

  useEffect(() => () => {
    [imgOrigUrl, imgResult?.url, vidOrigUrl, vidResult?.url]
      .filter(Boolean).forEach(u => URL.revokeObjectURL(u!));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetImage = useCallback(() => {
    if (imgOrigUrl) URL.revokeObjectURL(imgOrigUrl);
    if (imgResult?.url) URL.revokeObjectURL(imgResult.url);
    setImgFile(null); setImgOrigUrl(null); setImgResult(null); setImgError(null);
    setCustomRegion(null);
  }, [imgOrigUrl, imgResult]);

  const resetVideo = useCallback(() => {
    if (vidOrigUrl) URL.revokeObjectURL(vidOrigUrl);
    if (vidResult?.url) URL.revokeObjectURL(vidResult.url);
    setVidFile(null); setVidOrigUrl(null); setVidResult(null);
    setVidError(null); setVidPct(0); setVidLabel('');
    setCustomRegion(null);
  }, [vidOrigUrl, vidResult]);

  // Tab changes reset
  useEffect(() => {
    resetImage();
    resetVideo();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ── Image handlers ──────────────────────────────────────────────────────────
  const handleImgFile = useCallback((f: File) => {
    if (imgOrigUrl) URL.revokeObjectURL(imgOrigUrl);
    if (imgResult?.url) URL.revokeObjectURL(imgResult.url);
    setImgResult(null); setImgError(null);
    setImgFile(f); setImgOrigUrl(URL.createObjectURL(f));
    setCustomRegion(null);
  }, [imgOrigUrl, imgResult]);

  const processImage = useCallback(async () => {
    if (!imgFile) return;
    setImgBusy(true); setImgError(null);
    try {
      const img = await loadImageFromFile(imgFile);
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const idata = ctx.getImageData(0, 0, c.width, c.height);
      // Use the selected custom bounding box region if drawn
      const result = removeWatermarkFromImageDataSync(idata, customRegion);
      ctx.putImageData(result.imageData as unknown as ImageData, 0, 0);
      const blob = await canvasToBlob(c, 'image/png');
      const base = imgFile.name.replace(/\.[^.]+$/, '');
      if (imgResult?.url) URL.revokeObjectURL(imgResult.url);
      setImgResult({ url: URL.createObjectURL(blob), name: `${base}_no_watermark.png`, size: blob.size });
    } catch (e: unknown) {
      setImgError((e as Error)?.message ?? 'Processing failed');
    } finally { setImgBusy(false); }
  }, [imgFile, imgResult, customRegion]);

  // ── Video handlers ──────────────────────────────────────────────────────────
  const handleVidFile = useCallback((f: File) => {
    if (vidOrigUrl) URL.revokeObjectURL(vidOrigUrl);
    if (vidResult?.url) URL.revokeObjectURL(vidResult.url);
    setVidResult(null); setVidError(null); setVidPct(0); setVidLabel('');
    setVidFile(f); setVidOrigUrl(URL.createObjectURL(f));
    setCustomRegion(null);
  }, [vidOrigUrl, vidResult]);

  const processVideo = useCallback(async () => {
    if (!vidFile) return;
    setVidBusy(true); setVidError(null); setVidPct(0); setVidLabel('Starting…');
    try {
      const blob = await processVideoFast(vidFile, customRegion, (pct, label) => {
        setVidPct(pct); setVidLabel(label);
      });
      const base = vidFile.name.replace(/\.[^.]+$/, '');
      const ext  = blob.type.includes('mp4') ? 'mp4' : 'webm';
      if (vidResult?.url) URL.revokeObjectURL(vidResult.url);
      setVidResult({ url: URL.createObjectURL(blob), name: `${base}_no_watermark.${ext}`, size: blob.size });
    } catch (e: unknown) {
      setVidError((e as Error)?.message ?? 'Video processing failed');
    } finally { setVidBusy(false); }
  }, [vidFile, vidResult, customRegion]);

  const fmtBytes = (b = 0) =>
    b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/20 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/60 bg-zinc-900/30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-violet-600/15 border border-violet-500/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-200 leading-none">Gemini Watermark Remover</h3>
            <p className="text-[10px] text-zinc-500 mt-0.5">100% client-side · No upload · Reverse alpha blending</p>
          </div>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded border border-emerald-800/50 bg-emerald-950/30 text-emerald-400 font-bold select-none">FREE</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 px-3 pt-3 border-b border-zinc-800/60">
        {(['image', 'video'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all cursor-pointer ${
              tab === t ? 'border-violet-500 text-violet-300 bg-violet-500/8'
                        : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40'
            }`}
          >
            {t === 'image' ? <ImageIcon className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
            {t === 'image' ? 'Images' : 'Videos'}
            {t === 'video' && (
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-500/20 text-sky-400 font-bold">BETA</span>
            )}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="p-5">

        {/* ── IMAGE TAB ── */}
        {tab === 'image' && (
          <div className="flex flex-col gap-4">
            {!imgFile
              ? <DropZone accept="image/png,image/jpeg,image/webp" onFile={handleImgFile}
                  label="Drop an image here or click to browse"
                  sublabel="PNG, JPG, WebP — processed locally in your browser" />
              : <>
                  <BeforeAfterPreview origUrl={imgOrigUrl!} resultUrl={imgResult?.url ?? null} isVideo={false} />
                  
                  {/* Custom Region controls */}
                  <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-900/10">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-zinc-400">Inpainting Mode</span>
                      <span className="text-[11px] text-zinc-500">
                        {customRegion 
                          ? `Custom Box: ${customRegion.x}, ${customRegion.y} (${customRegion.w}x${customRegion.h}px)`
                          : 'Auto Detect (Estimates bottom-right Gemini logo)'
                        }
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setShowDrawModal(true)}
                        className="px-3 py-1.5 rounded-lg text-[10px] font-bold border border-zinc-700 hover:border-zinc-600 bg-zinc-850 hover:bg-zinc-800 text-zinc-350 transition cursor-pointer"
                        disabled={imgBusy}
                      >
                        {customRegion ? 'Redraw Box' : 'Draw Custom Region'}
                      </button>
                      {customRegion && (
                        <button
                          onClick={() => setCustomRegion(null)}
                          className="px-2 py-1.5 rounded-lg text-[10px] font-bold border border-zinc-800 hover:border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
                          disabled={imgBusy}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {imgError && <ErrBanner msg={imgError} />}
                  <div className="flex items-center gap-2">
                    {!imgResult
                      ? <ActionBtn busy={imgBusy} onClick={processImage} label="Remove Watermark" busyLabel="Processing…" />
                      : <DlBtn href={imgResult.url} filename={imgResult.name} label="Download PNG" size={fmtBytes(imgResult.size)} />
                    }
                    <ResetBtn onClick={resetImage} disabled={imgBusy} />
                  </div>
                  {imgResult && <OkBanner />}
                </>
            }
          </div>
        )}

        {/* ── VIDEO TAB ── */}
        {tab === 'video' && (
          <div className="flex flex-col gap-4">
            {!vidFile
              ? <DropZone accept="video/mp4,video/webm,video/quicktime" onFile={handleVidFile}
                  label="Drop a video here or click to browse"
                  sublabel="MP4, WebM, MOV — processed entirely in your browser" />
              : <>
                  <BeforeAfterPreview origUrl={vidOrigUrl!} resultUrl={vidResult?.url ?? null} isVideo />
                  
                  {/* Custom Region controls */}
                  <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-900/10">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-zinc-400">Inpainting Mode</span>
                      <span className="text-[11px] text-zinc-500">
                        {customRegion 
                          ? `Custom Box: ${customRegion.x}, ${customRegion.y} (${customRegion.w}x${customRegion.h}px)`
                          : 'Auto Detect (Estimates bottom-right Gemini logo)'
                        }
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setShowDrawModal(true)}
                        className="px-3 py-1.5 rounded-lg text-[10px] font-bold border border-zinc-700 hover:border-zinc-600 bg-zinc-850 hover:bg-zinc-800 text-zinc-350 transition cursor-pointer"
                        disabled={vidBusy}
                      >
                        {customRegion ? 'Redraw Box' : 'Draw Custom Region'}
                      </button>
                      {customRegion && (
                        <button
                          onClick={() => setCustomRegion(null)}
                          className="px-2 py-1.5 rounded-lg text-[10px] font-bold border border-zinc-800 hover:border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
                          disabled={vidBusy}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {vidBusy && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-zinc-400">{vidLabel}</span>
                        <span className="text-[10px] font-mono text-violet-400">{vidPct}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-violet-600 to-sky-500 rounded-full transition-all duration-200"
                             style={{ width: `${vidPct}%` }} />
                      </div>
                    </div>
                  )}
                  {vidError && <ErrBanner msg={vidError} />}
                  <div className="flex items-center gap-2">
                    {!vidResult
                      ? <ActionBtn busy={vidBusy} onClick={processVideo} label="Remove Watermark" busyLabel={vidLabel || 'Processing…'} />
                      : <DlBtn href={vidResult.url} filename={vidResult.name} label="Download Video" size={fmtBytes(vidResult.size)} />
                    }
                    <ResetBtn onClick={resetVideo} disabled={vidBusy} />
                  </div>
                  {vidResult && <OkBanner />}
                </>
            }
          </div>
        )}

      </div>

      {showDrawModal && (
        <DashboardDrawModal
          file={tab === 'image' ? imgFile! : vidFile!}
          isVideo={tab === 'video'}
          onClose={() => setShowDrawModal(false)}
          onConfirm={(region) => {
            setCustomRegion(region);
            setShowDrawModal(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Small UI atoms ───────────────────────────────────────────────────────────
function ActionBtn({ busy, onClick, label, busyLabel }: { busy: boolean; onClick: () => void; label: string; busyLabel: string }) {
  return (
    <button onClick={onClick} disabled={busy}
      className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-60 disabled:cursor-not-allowed rounded-xl transition cursor-pointer shadow shadow-violet-900/30">
      {busy ? <><Loader2 className="w-4 h-4 animate-spin" />{busyLabel}</> : <><Sparkles className="w-4 h-4" />{label}</>}
    </button>
  );
}
function DlBtn({ href, filename, label, size }: { href: string; filename: string; label: string; size: string }) {
  return (
    <a href={href} download={filename}
      className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition cursor-pointer shadow shadow-emerald-900/30">
      <Download className="w-4 h-4" />{label}
      {size && <span className="opacity-70 font-normal">({size})</span>}
    </a>
  );
}
function ResetBtn({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title="Reset"
      className="flex items-center justify-center w-9 h-9 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 transition cursor-pointer disabled:opacity-50">
      <RefreshCw className="w-3.5 h-3.5" />
    </button>
  );
}
function ErrBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/20 border border-red-900/40 rounded-xl px-3 py-2">
      <AlertCircle className="w-4 h-4 shrink-0" />{msg}
    </div>
  );
}
function OkBanner() {
  return (
    <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/20 border border-emerald-900/40 rounded-xl px-3 py-2">
      <CheckCircle className="w-4 h-4 shrink-0" />Watermark removed. Your file never left your device.
    </div>
  );
}

// ─── Dashboard Bounding Box Drawer Modal ──────────────────────────────────────
interface DashboardDrawModalProps {
  file: File;
  isVideo: boolean;
  onClose: () => void;
  onConfirm: (region: { x: number; y: number; w: number; h: number; maskData?: Uint8Array }) => void;
}

function DashboardDrawModal({ file, isVideo, onClose, onConfirm }: DashboardDrawModalProps) {
  const [fileURL, setFileURL] = useState<string | null>(null);
  const [naturalWidth, setNaturalWidth] = useState<number>(0);
  const [naturalHeight, setNaturalHeight] = useState<number>(0);
  const [isLoaded, setIsLoaded] = useState(false);

  const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Zoom & Pan States
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState<'draw' | 'pan'>('draw');
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const [brushSize, setBrushSize] = useState(15);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setFileURL(url);
    setIsLoaded(false);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const handleLoadedMetadata = () => {
    if (isVideo && mediaRef.current) {
      const v = mediaRef.current as HTMLVideoElement;
      setNaturalWidth(v.videoWidth);
      setNaturalHeight(v.videoHeight);
      v.currentTime = 0.1;
      setIsLoaded(true);
    }
  };

  const handleImgLoad = () => {
    if (!isVideo && mediaRef.current) {
      const img = mediaRef.current as HTMLImageElement;
      setNaturalWidth(img.naturalWidth);
      setNaturalHeight(img.naturalHeight);
      setIsLoaded(true);
    }
  };

  // Sync canvas size to media layout size
  useEffect(() => {
    if (!mediaRef.current || !canvasRef.current || !naturalWidth || !naturalHeight || !isLoaded) return;
    
    const observer = new ResizeObserver(() => {
      if (mediaRef.current && canvasRef.current) {
        const w = mediaRef.current.clientWidth;
        const h = mediaRef.current.clientHeight;
        if (canvasRef.current.width !== w || canvasRef.current.height !== h) {
          canvasRef.current.width = w;
          canvasRef.current.height = h;
        }
        
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.lineWidth = brushSize;
          ctx.strokeStyle = 'rgba(139, 92, 246, 0.7)'; // Violet-500
        }
      }
    });
    
    observer.observe(mediaRef.current);
    
    // Immediate config without resizing to prevent clear
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = brushSize;
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.7)';
    }

    return () => observer.disconnect();
  }, [naturalWidth, naturalHeight, isLoaded, brushSize]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          if (!e.repeat) {
            setIsSpacePressed(true);
          }
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Recenter automatically if zoom is reset to 1
  useEffect(() => {
    if (zoom === 1) {
      setPan({ x: 0, y: 0 });
    }
  }, [zoom]);

  // Non-passive wheel event listener to handle zoom cleanly on trackpads/scroll-wheels
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const preventDefaultWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomDelta = e.deltaY < 0 ? 0.25 : -0.25;
      setZoom(prev => Math.min(5, Math.max(1, prev + zoomDelta)));
    };

    viewport.addEventListener('wheel', preventDefaultWheel, { passive: false });
    return () => {
      viewport.removeEventListener('wheel', preventDefaultWheel);
    };
  }, []);

  const currentTool = isSpacePressed ? 'pan' : activeTool;

  const startDrawingOrPanning = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (currentTool === 'pan') {
      setIsPanning(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    } else {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const y = ((e.clientY - rect.top) / rect.height) * canvas.height;

      ctx.beginPath();
      ctx.moveTo(x, y);
      setIsDrawing(true);
      setHasDrawn(true);
    }
  };

  const drawOrPan = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (currentTool === 'pan') {
      if (!isPanning) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      setPan(prev => ({
        x: prev.x + dx / zoom,
        y: prev.y + dy / zoom
      }));
    } else {
      if (!isDrawing) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const y = ((e.clientY - rect.top) / rect.height) * canvas.height;

      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const stopDrawingOrPanning = () => {
    if (currentTool === 'pan') {
      setIsPanning(false);
    } else {
      if (!isDrawing) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.closePath();
      setIsDrawing(false);
    }
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
    
    const offscreen = document.createElement('canvas');
    offscreen.width = naturalWidth;
    offscreen.height = naturalHeight;
    const octx = offscreen.getContext('2d');
    if (!octx) return;

    octx.drawImage(canvasRef.current, 0, 0, naturalWidth, naturalHeight);
    
    const imgData = octx.getImageData(0, 0, naturalWidth, naturalHeight);
    const data = imgData.data;

    let minX = naturalWidth;
    let minY = naturalHeight;
    let maxX = 0;
    let maxY = 0;

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

    if (minX > maxX || minY > maxY) return;

    minX = Math.max(0, minX - 2);
    minY = Math.max(0, minY - 2);
    maxX = Math.min(naturalWidth - 1, maxX + 2);
    maxY = Math.min(naturalHeight - 1, maxY + 2);

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;

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

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl p-4 sm:p-6 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-900 mb-4 shrink-0">
          <div>
            <h4 className="text-sm font-bold text-zinc-100">Paint Custom Watermark Region</h4>
            <p className="text-[10px] text-zinc-500 mt-0.5">Use the brush to paint precisely over the watermark on the preview frame.</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Media Container */}
        <div 
          ref={viewportRef}
          style={{ backgroundColor: '#000000' }}
          className="flex-1 flex items-center justify-center rounded-lg border border-zinc-900 p-2 min-h-[150px] relative overflow-hidden select-none"
        >
          {/* Floating Toolbar Overlay */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-25 flex items-center gap-1.5 p-1.5 bg-zinc-950/85 border border-zinc-800 rounded-xl backdrop-blur-md shadow-lg select-none">
            {/* Draw mode */}
            <button
              onClick={() => setActiveTool('draw')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                currentTool === 'draw'
                  ? 'bg-violet-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
              title="Draw Mode (B)"
            >
              <Paintbrush className="w-4 h-4" />
            </button>
            
            {/* Pan mode */}
            <button
              onClick={() => setActiveTool('pan')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                currentTool === 'pan'
                  ? 'bg-violet-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
              title="Pan Mode (Hold Spacebar)"
            >
              <Hand className="w-4 h-4" />
            </button>

            {currentTool === 'draw' && (
              <>
                <div className="w-px h-4 bg-zinc-800 mx-1" />
                <div className="flex items-center gap-1.5 px-1">
                  <span className="text-[9px] font-bold text-zinc-500 font-mono">Brush:</span>
                  <input
                    type="range"
                    min="4"
                    max="50"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-16 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
                    title="Brush Size"
                  />
                  <span className="text-[9px] font-bold font-mono text-zinc-300 min-w-[22px] text-right">
                    {brushSize}px
                  </span>
                </div>
              </>
            )}

            <div className="w-px h-4 bg-zinc-800 mx-1" />

            {/* Zoom Out */}
            <button
              onClick={() => setZoom(prev => Math.max(1, prev - 0.25))}
              disabled={zoom <= 1}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 disabled:opacity-30 disabled:hover:text-zinc-400 disabled:hover:bg-transparent transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            {/* Zoom Value */}
            <span className="text-[10px] font-bold font-mono px-1.5 text-zinc-300 min-w-[36px] text-center">
              {Math.round(zoom * 100)}%
            </span>

            {/* Zoom In */}
            <button
              onClick={() => setZoom(prev => Math.min(5, prev + 0.25))}
              disabled={zoom >= 5}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 disabled:opacity-30 disabled:hover:text-zinc-400 disabled:hover:bg-transparent transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            {/* Reset */}
            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-900 transition-colors cursor-pointer"
              title="Reset View"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {!isLoaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 text-zinc-500 animate-spin" />
              <p className="text-xs text-zinc-500">Loading original preview...</p>
            </div>
          )}

          {fileURL && (
            <div 
              style={{
                transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
                transformOrigin: 'center center',
              }}
              className={`relative inline-block max-w-full max-h-full sm:max-h-[55vh] lg:max-h-[60vh] transition-transform duration-75 select-none ${isLoaded ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'}`}
            >
              {isVideo ? (
                <video
                  ref={el => { mediaRef.current = el; }}
                  src={fileURL}
                  onLoadedMetadata={handleLoadedMetadata}
                  className="max-w-full max-h-full sm:max-h-[55vh] lg:max-h-[60vh] block rounded pointer-events-none object-contain select-none"
                  muted
                  playsInline
                  preload="auto"
                />
              ) : (
                <img
                  ref={el => { mediaRef.current = el; }}
                  src={fileURL}
                  onLoad={handleImgLoad}
                  className="max-w-full max-h-full sm:max-h-[55vh] lg:max-h-[60vh] block rounded pointer-events-none object-contain select-none"
                  alt="Preview"
                />
              )}
              <canvas
                ref={canvasRef}
                style={{ cursor: currentTool === 'pan' ? (isPanning ? 'grabbing' : 'grab') : 'crosshair' }}
                className="absolute inset-0 z-10 touch-none"
                onMouseDown={startDrawingOrPanning}
                onMouseMove={drawOrPan}
                onMouseUp={stopDrawingOrPanning}
                onMouseLeave={stopDrawingOrPanning}
              />
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-4 mt-4 border-t border-zinc-900 shrink-0">
          <div className="text-[10px] text-zinc-500 font-mono flex flex-wrap items-center gap-4">
            {naturalWidth && naturalHeight ? (
              <span>Media Resolution: {naturalWidth}×{naturalHeight} px</span>
            ) : (
              <span>Loading media resolution...</span>
            )}
            {hasDrawn && (
              <button 
                onClick={clearCanvas}
                className="flex items-center gap-1.5 text-zinc-400 hover:text-red-400 transition cursor-pointer"
              >
                Clear Brush
              </button>
            )}
          </div>
          <div className="flex gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!hasDrawn}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-900 disabled:text-zinc-600 text-white transition disabled:cursor-not-allowed cursor-pointer"
            >
              Confirm Region
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}
