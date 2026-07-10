/**
 * AI Audio Denoiser — Dashboard Tool
 * Removes background noise, fan hum, and room noise 100% locally
 * using STFT Spectral Subtraction.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Upload, Download, Music, Sparkles,
  CheckCircle, AlertCircle, Loader2, RefreshCw, X,
  Volume2, Sliders
} from 'lucide-react';
import { denoiseAudioBuffer, audioBufferToWavBlob } from '../../lib/audio-denoiser';

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

// Simple waveform visualizer from decoded buffer
function AudioWaveform({ buffer, label, color = 'bg-violet-500' }: { buffer: AudioBuffer | null; label: string; color?: string }) {
  const [peaks, setPeaks] = useState<number[]>([]);

  useEffect(() => {
    if (!buffer) {
      setPeaks([]);
      return;
    }
    const data = buffer.getChannelData(0);
    const points = 100;
    const step = Math.ceil(data.length / points);
    const calculated: number[] = [];
    for (let i = 0; i < points; i++) {
      const start = i * step;
      const end = Math.min(start + step, data.length);
      let max = 0;
      for (let j = start; j < end; j++) {
        const val = Math.abs(data[j]);
        if (val > max) max = val;
      }
      calculated.push(max);
    }
    setPeaks(calculated);
  }, [buffer]);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full inline-block ${color}`} />
        {label}
      </span>
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 h-24 flex items-center gap-0.5 justify-center relative overflow-hidden">
        {peaks.length > 0 ? (
          peaks.map((p, idx) => (
            <div
              key={idx}
              className={`w-[3px] rounded-full ${color} opacity-75 hover:opacity-100 transition-all`}
              style={{ height: `${Math.max(4, Math.min(100, p * 100))}%` }}
            />
          ))
        ) : (
          <div className="absolute inset-0 flex items-center justify-center gap-2">
            <Music className="w-6 h-6 text-zinc-800 animate-pulse" />
            <span className="text-[10px] text-zinc-650 font-medium">Awaiting file upload…</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface AudioDenoiserToolProps {
  renderTrigger?: (open: () => void) => React.ReactNode;
}

export default function AudioDenoiserTool({ renderTrigger }: AudioDenoiserToolProps = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [origBuffer, setOrigBuffer] = useState<AudioBuffer | null>(null);
  const [denoisedBuffer, setDenoisedBuffer] = useState<AudioBuffer | null>(null);

  // Settings
  const [strength, setStrength] = useState(70); // Percent suppression
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState('');
  const [downloadSize, setDownloadSize] = useState(0);

  // Audio Playback Preview States
  const [isPlaying, setIsPlaying] = useState<'none' | 'orig' | 'denoised'>('none');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Clean URLs on unmount
  useEffect(() => () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    stopPlayback();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopPlayback = () => {
    if (playSourceRef.current) {
      try {
        playSourceRef.current.stop();
      } catch (e) { /* ignore */ }
      playSourceRef.current = null;
    }
    setIsPlaying('none');
  };

  const startPlayback = async (type: 'orig' | 'denoised') => {
    stopPlayback();
    const buffer = type === 'orig' ? origBuffer : denoisedBuffer;
    if (!buffer) return;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      setIsPlaying('none');
    };
    source.start();
    playSourceRef.current = source;
    setIsPlaying(type);
  };

  const reset = useCallback(() => {
    stopPlayback();
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setFile(null);
    setOrigBuffer(null);
    setDenoisedBuffer(null);
    setDownloadUrl(null);
    setError(null);
  }, [downloadUrl]);

  const handleFile = async (f: File) => {
    reset();
    setFile(f);
    setBusy(true);
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const arrayBuffer = await f.arrayBuffer();
      const buffer = await audioCtx.decodeAudioData(arrayBuffer);
      setOrigBuffer(buffer);
      await audioCtx.close();
    } catch (e: any) {
      setError('Could not decode audio file. Make sure it contains a valid audio track.');
    } finally {
      setBusy(false);
    }
  };

  const processAudio = async () => {
    if (!origBuffer) return;
    setBusy(true);
    setError(null);
    stopPlayback();
    try {
      // Denoise
      const denoised = await denoiseAudioBuffer(origBuffer, strength / 100);
      setDenoisedBuffer(denoised);

      // Generate export blob
      const wavBlob = audioBufferToWavBlob(denoised);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      const url = URL.createObjectURL(wavBlob);
      setDownloadUrl(url);
      
      const base = file?.name.replace(/\.[^.]+$/, '') || 'denoised';
      setDownloadName(`${base}_denoised.wav`);
      setDownloadSize(wavBlob.size);
    } catch (e: any) {
      setError(e.message || 'Denoising processing failed.');
    } finally {
      setBusy(false);
    }
  };

  const fmtBytes = (b = 0) =>
    b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

  const content = (
    <div className="flex flex-col gap-4">
      {!file ? (
        <DropZone
          accept="audio/*,video/*"
          onFile={handleFile}
          label="Drop an audio or video file here"
          sublabel="WAV, MP3, M4A, MOV, MP4 — processed locally in browser"
        />
      ) : (
        <div className="flex flex-col gap-5 p-5">
          <div className="flex flex-col gap-4">
            <AudioWaveform buffer={origBuffer} label="Original Audio" color="bg-zinc-600" />
            {denoisedBuffer && (
              <AudioWaveform buffer={denoisedBuffer} label="Cleaned Audio (Preview)" color="bg-emerald-500 animate-fade-in-up" />
            )}
          </div>

          {/* Quick Playback Preview triggers */}
          <div className="flex items-center gap-3 justify-center">
            {origBuffer && (
              <button
                onClick={() => isPlaying === 'orig' ? stopPlayback() : startPlayback('orig')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                  isPlaying === 'orig'
                    ? 'border-zinc-600 bg-zinc-700 text-zinc-100'
                    : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Volume2 className="w-3.5 h-3.5" />
                {isPlaying === 'orig' ? 'Stop' : 'Listen Original'}
              </button>
            )}
            {denoisedBuffer && (
              <button
                onClick={() => isPlaying === 'denoised' ? stopPlayback() : startPlayback('denoised')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                  isPlaying === 'denoised'
                    ? 'border-emerald-600 bg-emerald-650/15 text-emerald-400 font-bold'
                    : 'border-zinc-800 bg-zinc-955/40 text-zinc-450 hover:text-zinc-300'
                }`}
              >
                <Volume2 className="w-3.5 h-3.5" />
                {isPlaying === 'denoised' ? 'Stop' : 'Listen Denoised'}
              </button>
            )}
          </div>

          {/* Settings panel */}
          <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-3">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-violet-400" /> Suppression Parameters
            </span>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs text-zinc-400">
                <span>Denoise Intensity</span>
                <span className="font-mono text-violet-400 font-bold">{strength}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                value={strength}
                onChange={(e) => setStrength(Number(e.target.value))}
                className="w-full accent-violet-650 h-1.5 bg-zinc-950 rounded-lg cursor-pointer"
                disabled={busy}
              />
              <span className="text-[10px] text-zinc-500">
                Higher intensity removes more background hiss, but might slightly lower vocal dynamics. 70% is recommended.
              </span>
            </div>
          </div>

          {error && <ErrBanner msg={error} />}

          <div className="flex items-center gap-2">
            {!downloadUrl ? (
              <ActionBtn busy={busy} onClick={processAudio} label="Clean Audio Track" busyLabel="Cleaning Track…" />
            ) : (
              <DlBtn href={downloadUrl} filename={downloadName} label="Download Denoised WAV" size={fmtBytes(downloadSize)} />
            )}
            <ResetBtn onClick={reset} disabled={busy} />
          </div>

          {downloadUrl && <OkBanner />}
        </div>
      )}
    </div>
  );

  const card = (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/20 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-600/15 border border-emerald-500/20 flex items-center justify-center">
            <Volume2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-200 leading-none">AI Audio Denoiser</h3>
            <p className="text-[10px] text-zinc-550 mt-0.5">Spectral subtraction noise cleaning · WASM free</p>
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
                <div className="w-8 h-8 rounded-lg bg-emerald-650/15 border border-emerald-500/20 flex items-center justify-center">
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100 leading-none">AI Audio Denoiser</h3>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Remove fan noises, room echoes, and constant static hums</p>
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
      <CheckCircle className="w-4 h-4 shrink-0" />Audio cleanup complete. Processing completed entirely locally in your sandbox.
    </div>
  );
}
