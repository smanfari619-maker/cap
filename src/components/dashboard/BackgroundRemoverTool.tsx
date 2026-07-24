/**
 * AI Background Remover — Dashboard Tool
 * Removes image and video backgrounds 100% locally in the browser
 * using Google MediaPipe Selfie Segmentation.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Upload, Download, ImageIcon, Video, Sparkles,
  CheckCircle, AlertCircle, Loader2, RefreshCw, X,
  Palette, Image as ImagePic
} from 'lucide-react';
import { removeBackgroundFromImageData, removeBackgroundFromVideoFile } from '../../lib/background-segmenter';

// ─── Local UI atoms ───────────────────────────────────────────────────────────
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

function BeforeAfterPreview({ origUrl, resultUrl, isVideo, bgMode, bgColor, bgImgUrl }: {
  origUrl: string; resultUrl: string | null; isVideo: boolean; bgMode: string; bgColor: string; bgImgUrl: string | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {([['Original', origUrl, false], ['Processed', resultUrl, true]] as const).map(([label, url, isPro]) => {
        // Build style for processed preview placeholder background
        let style: React.CSSProperties = {};
        if (isPro && !url) {
          if (bgMode === 'color') {
            style.backgroundColor = bgColor;
          } else if (bgMode === 'image' && bgImgUrl) {
            style.backgroundImage = `url(${bgImgUrl})`;
            style.backgroundSize = 'cover';
            style.backgroundPosition = 'center';
          } else {
            // checkerboard for transparent
            style.backgroundImage = 'radial-gradient(#27272a 20%, transparent 20%), radial-gradient(#27272a 20%, transparent 20%)';
            style.backgroundSize = '8px 8px';
            style.backgroundPosition = '0 0, 4px 4px';
            style.backgroundColor = '#09090b';
          }
        }
        return (
          <div key={label} className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${isPro ? 'bg-violet-500' : 'bg-zinc-650'}`} />
              {label}
            </span>
            <div 
              style={style}
              className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 aspect-video flex items-center justify-center relative"
            >
              {url
                ? (isVideo
                    ? <video src={url} className="w-full h-full object-contain" controls muted />
                    : <img src={url} className="w-full h-full object-contain" alt={label} />
                  )
                : <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <Sparkles className="w-8 h-8 text-zinc-700" />
                    <span className="text-[10px] text-zinc-650 font-medium">Ready to process</span>
                    <span className="text-[9px] text-zinc-700">Click button below</span>
                  </div>
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Tab = 'image' | 'video';
type BgMode = 'transparent' | 'color' | 'image';

interface ProcessResult {
  url: string;
  name: string;
  size: number;
}

interface BackgroundRemoverToolProps {
  renderTrigger?: (open: () => void) => React.ReactNode;
}

export default function BackgroundRemoverTool({ renderTrigger }: BackgroundRemoverToolProps = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('image');

  // Background Options
  const [bgMode, setBgMode] = useState<BgMode>('transparent');
  const [bgColor, setBgColor] = useState('#00ff00'); // Default chroma green
  const [bgImageFile, setBgImageFile] = useState<File | null>(null);
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const bgImageElRef = useRef<HTMLImageElement | null>(null);

  // Image tab states
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgOrigUrl, setImgOrigUrl] = useState<string | null>(null);
  const [imgResult, setImgResult] = useState<ProcessResult | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);

  // Video tab states
  const [vidFile, setVidFile] = useState<File | null>(null);
  const [vidOrigUrl, setVidOrigUrl] = useState<string | null>(null);
  const [vidResult, setVidResult] = useState<ProcessResult | null>(null);
  const [vidBusy, setVidBusy] = useState(false);
  const [vidPct, setVidPct] = useState(0);
  const [vidError, setVidError] = useState<string | null>(null);

  // Clean URLs on unmount
  useEffect(() => () => {
    [imgOrigUrl, imgResult?.url, vidOrigUrl, vidResult?.url, bgImageUrl]
      .filter(Boolean).forEach(u => URL.revokeObjectURL(u!));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetImage = useCallback(() => {
    if (imgOrigUrl) URL.revokeObjectURL(imgOrigUrl);
    if (imgResult?.url) URL.revokeObjectURL(imgResult.url);
    setImgFile(null); setImgOrigUrl(null); setImgResult(null); setImgError(null);
  }, [imgOrigUrl, imgResult]);

  const resetVideo = useCallback(() => {
    if (vidOrigUrl) URL.revokeObjectURL(vidOrigUrl);
    if (vidResult?.url) URL.revokeObjectURL(vidResult.url);
    setVidFile(null); setVidOrigUrl(null); setVidResult(null);
    setVidError(null); setVidPct(0);
  }, [vidOrigUrl, vidResult]);

  // Tab changes reset
  useEffect(() => {
    resetImage();
    resetVideo();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Handle custom background image select
  const handleBgImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (bgImageUrl) URL.revokeObjectURL(bgImageUrl);
      const url = URL.createObjectURL(file);
      setBgImageFile(file);
      setBgImageUrl(url);

      const img = new Image();
      img.src = url;
      bgImageElRef.current = img;
    }
  };

  const handleImgFile = useCallback((f: File) => {
    if (imgOrigUrl) URL.revokeObjectURL(imgOrigUrl);
    if (imgResult?.url) URL.revokeObjectURL(imgResult.url);
    setImgResult(null); setImgError(null);
    setImgFile(f); setImgOrigUrl(URL.createObjectURL(f));
  }, [imgOrigUrl, imgResult]);

  const handleVidFile = useCallback((f: File) => {
    if (vidOrigUrl) URL.revokeObjectURL(vidOrigUrl);
    if (vidResult?.url) URL.revokeObjectURL(vidResult.url);
    setVidResult(null); setVidError(null); setVidPct(0);
    setVidFile(f); setVidOrigUrl(URL.createObjectURL(f));
  }, [vidOrigUrl, vidResult]);

  const processImage = useCallback(async () => {
    if (!imgFile) return;
    setImgBusy(true); setImgError(null);
    try {
      const img = new Image();
      img.src = imgOrigUrl!;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const idata = ctx.getImageData(0, 0, c.width, c.height);
      const resultData = await removeBackgroundFromImageData(idata, bgMode, bgColor, bgImageElRef.current);
      ctx.putImageData(resultData, 0, 0);

      c.toBlob((blob) => {
        if (!blob) throw new Error('Failed to create Image blob');
        const base = imgFile.name.replace(/\.[^.]+$/, '');
        if (imgResult?.url) URL.revokeObjectURL(imgResult.url);
        setImgResult({ url: URL.createObjectURL(blob), name: `${base}_bg_removed.png`, size: blob.size });
        setImgBusy(false);
      }, 'image/png');
    } catch (e: unknown) {
      setImgError((e as Error)?.message ?? 'Processing failed');
      setImgBusy(false);
    }
  }, [imgFile, imgOrigUrl, bgMode, bgColor, imgResult]);

  const processVideo = useCallback(async () => {
    if (!vidFile) return;
    setVidBusy(true); setVidError(null); setVidPct(0);
    try {
      const blob = await removeBackgroundFromVideoFile(
        vidFile,
        bgMode,
        bgColor,
        bgImageElRef.current,
        (pct) => setVidPct(pct)
      );
      const base = vidFile.name.replace(/\.[^.]+$/, '');
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      if (vidResult?.url) URL.revokeObjectURL(vidResult.url);
      setVidResult({ url: URL.createObjectURL(blob), name: `${base}_bg_removed.${ext}`, size: blob.size });
    } catch (e: unknown) {
      setVidError((e as Error)?.message ?? 'Video processing failed');
    } finally { setVidBusy(false); }
  }, [vidFile, bgMode, bgColor, vidResult]);

  const fmtBytes = (b = 0) =>
    b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

  const bgOptionsContent = (
    <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-3">
      <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
        <Palette className="w-3.5 h-3.5 text-violet-400" /> Background Mode Settings
      </span>
      <div className="grid grid-cols-3 gap-2">
        {([
          ['transparent', 'Transparent'],
          ['color', 'Color Key'],
          ['image', 'Custom Image']
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => setBgMode(mode)}
            className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition cursor-pointer text-center ${
              bgMode === mode
                ? 'border-violet-500 bg-violet-600/10 text-violet-300'
                : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/40 text-zinc-450 hover:text-zinc-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {bgMode === 'color' && (
        <div className="flex items-center gap-3 animate-fade-in-up">
          <span className="text-xs text-zinc-500">Pick color:</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="w-8 h-8 rounded border border-zinc-800 bg-transparent cursor-pointer"
            />
            <span className="text-xs font-mono text-zinc-400">{bgColor}</span>
          </div>
        </div>
      )}

      {bgMode === 'image' && (
        <div className="flex flex-col gap-2 animate-fade-in-up">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Custom background image:</span>
            <label className="px-3 py-1 rounded-lg text-[10px] font-bold border border-zinc-700 hover:border-zinc-650 bg-zinc-850 hover:bg-zinc-800 text-zinc-300 transition cursor-pointer">
              Upload Image
              <input type="file" accept="image/*" onChange={handleBgImageChange} className="hidden" />
            </label>
          </div>
          {bgImageUrl && (
            <div className="flex items-center gap-2 p-2 rounded bg-zinc-950/40 border border-zinc-850">
              <ImagePic className="w-4 h-4 text-zinc-500" />
              <span className="text-xs text-zinc-400 flex-1 truncate">{bgImageFile?.name || 'custom_bg.png'}</span>
              <button 
                onClick={() => {
                  if (bgImageUrl) URL.revokeObjectURL(bgImageUrl);
                  setBgImageFile(null);
                  setBgImageUrl(null);
                  bgImageElRef.current = null;
                }}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const content = (
    <div className="flex flex-col gap-4">
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
      <div className="p-5 flex flex-col gap-4">
        {bgOptionsContent}

        {/* ── IMAGE TAB ── */}
        {tab === 'image' && (
          <div className="flex flex-col gap-4">
            {!imgFile
              ? <DropZone accept="image/png,image/jpeg,image/webp" onFile={handleImgFile}
                  label="Drop an image here or click to browse"
                  sublabel="PNG, JPG, WebP — segmented locally in your browser" />
              : <>
                  <BeforeAfterPreview 
                    origUrl={imgOrigUrl!} 
                    resultUrl={imgResult?.url ?? null} 
                    isVideo={false} 
                    bgMode={bgMode} 
                    bgColor={bgColor} 
                    bgImgUrl={bgImageUrl}
                  />

                  {imgError && <ErrBanner msg={imgError} />}
                  <div className="flex items-center gap-2">
                    {!imgResult
                      ? <ActionBtn busy={imgBusy} onClick={processImage} label="Remove Background" busyLabel="Processing…" />
                      : <DlBtn href={imgResult.url} filename={imgResult.name} label="Download Image" size={fmtBytes(imgResult.size)} />
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
                  <BeforeAfterPreview 
                    origUrl={vidOrigUrl!} 
                    resultUrl={vidResult?.url ?? null} 
                    isVideo 
                    bgMode={bgMode} 
                    bgColor={bgColor} 
                    bgImgUrl={bgImageUrl}
                  />

                  {vidBusy && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-zinc-400">Processing frames…</span>
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
                      ? <ActionBtn busy={vidBusy} onClick={processVideo} label="Remove Background" busyLabel="Processing…" />
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
    </div>
  );

  const card = (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-violet-600/15 border border-violet-500/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-200 leading-none">AI Background Remover</h3>
            <p className="text-[10px] text-zinc-550 mt-0.5">100% client-side · MediaPipe segmentation</p>
          </div>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded border border-emerald-800/50 bg-emerald-950/30 text-emerald-400 font-bold select-none">FREE</span>
      </div>
      {content}
    </div>
  );

  return (
    <>
      {renderTrigger ? renderTrigger(() => setIsOpen(true)) : card}
      {isOpen && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in-up">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-[#18181b] shadow-2xl relative flex flex-col p-6">
            <div className="flex justify-between items-center pb-4 mb-4 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-violet-650/15 border border-violet-500/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100 leading-none">AI Background Remover</h3>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Erase or replace backgrounds from images & videos</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition cursor-pointer">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {content}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

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
      <CheckCircle className="w-4 h-4 shrink-0" />Processing complete. Your files are processed entirely locally.
    </div>
  );
}
