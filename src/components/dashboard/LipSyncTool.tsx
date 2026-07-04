import React, { useState, useRef } from 'react';
import { 
  Sparkles, Image as ImageIcon, Music, Download, 
  Video, RefreshCw, AlertTriangle, AlertCircle, CheckCircle
} from 'lucide-react';

export default function LipSyncTool() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [audioName, setAudioName] = useState<string | null>(null);
  const [still, setStill] = useState<boolean>(true);
  const [enhance, setEnhance] = useState<boolean>(false);
  
  // Status states
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [statusText, setStatusText] = useState<string>('');
  const [progressStep, setProgressStep] = useState<number>(0);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isMissingModels, setIsMissingModels] = useState<boolean>(false);
  const [resultVideoUrl, setResultVideoUrl] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setStatus('idle');
    }
  };

  const handleAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
      setAudioName(file.name);
      setStatus('idle');
    }
  };

  const getSteps = () => [
    'Uploading files to local backend…',
    'Preprocessing face portrait & extracting 3DMM coefficients…',
    'Extracting audio speech features…',
    'Synthesizing head pose & facial expression coefficients…',
    ...(enhance ? ['Restoring facial texture details (GFPGAN)…'] : []),
    'Generating 3D talking avatar frames…',
    'Encoding final video with FFmpeg…'
  ];

  const runLipsync = async () => {
    if (!imageFile || !audioFile) return;

    setStatus('processing');
    setProgressStep(0);
    setProgressPercent(0);
    const stepsList = getSteps();
    setStatusText(stepsList[0]);
    setIsMissingModels(false);
    setErrorMsg('');

    // Simulate stepping through progress phases to keep UX active
    const stepInterval = setInterval(() => {
      setProgressStep((prev) => {
        if (prev < stepsList.length - 1) {
          setStatusText(stepsList[prev + 1]);
          return prev + 1;
        }
        return prev;
      });
    }, 7500);

    const startTime = Date.now();
    const percentInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      setProgressPercent((prev) => {
        if (prev >= 98) return 98;
        // Asymptotic curve: reaches 85% at 90s, 95% at 3 mins
        const target = Math.floor(98 * (1 - Math.exp(-elapsed / 50)));
        return Math.max(prev, target);
      });
    }, 1000);

    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('audio', audioFile);
      formData.append('still', still.toString());
      formData.append('enhance', enhance.toString());

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/lipsync`, {
        method: 'POST',
        body: formData,
      });

      clearInterval(stepInterval);
      clearInterval(percentInterval);

      if (!response.ok) {
        throw new Error(`Server returned status: ${response.status}`);
      }

      // Check if it's a JSON response (like error) or direct file download
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const json = await response.json();
        if (json.error === 'missing_models') {
          setIsMissingModels(true);
          setErrorMsg(json.message);
          setStatus('error');
          return;
        } else if (json.error) {
          throw new Error(json.error);
        }
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error('Received empty video file from server');
      }

      const videoUrl = URL.createObjectURL(blob);
      setResultVideoUrl(videoUrl);
      setProgressPercent(100);
      setStatus('success');
    } catch (err: any) {
      clearInterval(stepInterval);
      clearInterval(percentInterval);
      setStatus('error');
      setErrorMsg(err.message || 'An unknown error occurred during processing.');
      console.error('[Lipsync] Error:', err);
    }
  };

  const resetForm = () => {
    setImageFile(null);
    setImagePreview(null);
    setAudioFile(null);
    setAudioName(null);
    setResultVideoUrl(null);
    setStatus('idle');
    setErrorMsg('');
  };

  const activeSteps = getSteps();

  return (
    <div className="glass-panel rounded-2xl p-5 relative overflow-hidden flex flex-col gap-5 border border-zinc-800 bg-zinc-950/20">
      
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400 animate-pulse" />
            SadTalker 3D Talking Head
          </h3>
          <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
            Local AI
          </span>
        </div>
        <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
          Animate any static face portrait to sync perfectly with a spoken voice clip with natural head movements, blinks, and micro-expressions.
        </p>
      </div>

      {status === 'idle' && (
        <div className="flex flex-col gap-4">
          
          {/* Avatar Upload */}
          <div 
            onClick={() => imageInputRef.current?.click()}
            className={`border border-dashed rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
              imagePreview 
                ? 'border-violet-500/40 bg-violet-950/5 hover:bg-violet-950/10' 
                : 'border-zinc-800 bg-zinc-900/20 hover:border-zinc-700 hover:bg-zinc-900/40'
            }`}
          >
            <input 
              type="file" 
              ref={imageInputRef} 
              onChange={handleImageChange} 
              accept="image/png, image/jpeg, image/jpg" 
              className="hidden" 
            />
            {imagePreview ? (
              <div className="flex items-center gap-3 w-full">
                <img 
                  src={imagePreview} 
                  alt="Avatar preview" 
                  className="w-12 h-12 rounded-lg object-cover border border-violet-500/30" 
                />
                <div className="flex flex-col text-left">
                  <span className="text-xs font-semibold text-zinc-200">Avatar Image Selected</span>
                  <span className="text-[10px] text-zinc-500">{imageFile?.name}</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="p-2 bg-zinc-900 rounded-lg text-zinc-400">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <span className="text-xs font-medium text-zinc-300">Choose Face Portrait</span>
                <span className="text-[10px] text-zinc-500">Supports PNG, JPG, JPEG</span>
              </div>
            )}
          </div>

          {/* Voice Upload */}
          <div 
            onClick={() => audioInputRef.current?.click()}
            className={`border border-dashed rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
              audioFile 
                ? 'border-violet-500/40 bg-violet-950/5 hover:bg-violet-950/10' 
                : 'border-zinc-800 bg-zinc-900/20 hover:border-zinc-700 hover:bg-zinc-900/40'
            }`}
          >
            <input 
              type="file" 
              ref={audioInputRef} 
              onChange={handleAudioChange} 
              accept="audio/*,audio/mp3,audio/wav,audio/m4a,.mp3,.wav,.m4a" 
              className="hidden" 
            />
            {audioFile ? (
              <div className="flex items-center gap-3 w-full">
                <div className="p-3 bg-violet-500/10 text-violet-400 rounded-lg">
                  <Music className="w-5 h-5" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-xs font-semibold text-zinc-200">Voice Clip Selected</span>
                  <span className="text-[10px] text-zinc-500 truncate max-w-[200px]">{audioName}</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="p-2 bg-zinc-900 rounded-lg text-zinc-400">
                  <Music className="w-4 h-4" />
                </div>
                <span className="text-xs font-medium text-zinc-300">Choose Voice Audio</span>
                <span className="text-[10px] text-zinc-500">Supports WAV, MP3, M4A, etc.</span>
              </div>
            )}
          </div>

          {/* Settings / Sliders */}
          <div className="flex flex-col gap-3 px-1">
            
            {/* Padding Slider */}
            {/* Still Mode Checkbox */}
            <div className="flex items-center gap-2.5 p-2 bg-zinc-900/20 rounded-xl border border-zinc-800/40 hover:border-violet-500/20 transition-all duration-200">
              <input 
                type="checkbox" 
                id="still-toggle" 
                checked={still} 
                onChange={(e) => setStill(e.target.checked)}
                className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500 bg-zinc-900 border-zinc-800 cursor-pointer" 
              />
              <div className="flex flex-col text-left cursor-pointer select-none" onClick={() => setStill(!still)}>
                <label htmlFor="still-toggle" className="text-xs font-bold text-zinc-300 cursor-pointer">
                  Keep Body Still (Recommended)
                </label>
                <span className="text-[9px] text-zinc-600 leading-tight">
                  Keep neck and body motions static to prevent visual distortion.
                </span>
              </div>
            </div>

            {/* GFPGAN Enhance Checkbox */}
            <div className="flex items-center gap-2.5 p-2 bg-zinc-900/20 rounded-xl border border-zinc-800/40 hover:border-violet-500/20 transition-all duration-200">
              <input 
                type="checkbox" 
                id="enhance-toggle" 
                checked={enhance} 
                onChange={(e) => setEnhance(e.target.checked)}
                className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500 bg-zinc-900 border-zinc-800 cursor-pointer" 
              />
              <div className="flex flex-col text-left cursor-pointer select-none" onClick={() => setEnhance(!enhance)}>
                <label htmlFor="enhance-toggle" className="text-xs font-bold text-zinc-300 cursor-pointer">
                  Face Texture Restoration (GFPGAN)
                </label>
                <span className="text-[9px] text-zinc-600 leading-tight">
                  Upscale mouth area using generative AI for hyper-realistic skin & teeth.
                </span>
              </div>
            </div>

          </div>

          {/* Action Button */}
          <button
            onClick={runLipsync}
            disabled={!imageFile || !audioFile}
            className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed bg-violet-600 hover:bg-violet-500 text-white"
          >
            <Sparkles className="w-4 h-4" />
            Synthesize Lip-Sync
          </button>

        </div>
      )}

      {/* Processing State */}
      {status === 'processing' && (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="relative mb-4 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin" />
            <Video className="w-4 h-4 text-violet-400 absolute" />
          </div>
          
          <h4 className="text-xs font-bold text-zinc-200">Local Inference in Progress</h4>
          <span className="text-[10px] text-violet-400 font-semibold mt-1 animate-pulse">
            Step {progressStep + 1} of {activeSteps.length}
          </span>
          <p className="text-[11px] text-zinc-500 mt-2 max-w-[240px] leading-relaxed min-h-[32px]">
            {statusText}
          </p>

          {/* Progress Bar */}
          <div className="w-full max-w-[240px] mt-4">
            <div className="flex justify-between items-center mb-1.5 px-1">
              <span className="text-[10px] text-zinc-400 font-medium">Processing Status</span>
              <span className="text-[10px] text-violet-400 font-bold">{progressPercent}%</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
              <div 
                className="h-full bg-violet-500 rounded-full transition-all duration-300 ease-out relative"
                style={{ width: `${progressPercent}%` }}
              >
                <div className="absolute top-0 right-0 bottom-0 left-0 bg-white/20 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success State */}
      {status === 'success' && resultVideoUrl && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div className="text-left">
              <span className="text-xs font-bold text-emerald-400 block leading-tight">3D Talking Avatar Synthesized!</span>
              <span className="text-[10px] text-zinc-500 block mt-0.5">
                Rendered locally with SadTalker 3D MM coefficients and expressions.
              </span>
            </div>
          </div>

          {/* Video Preview */}
          <div className="relative aspect-square rounded-xl overflow-hidden border border-zinc-800 bg-black">
            <video 
              src={resultVideoUrl} 
              controls 
              className="w-full h-full object-contain" 
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={resetForm}
              className="flex-1 py-2 px-3 rounded-xl font-medium text-xs border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/80 text-zinc-300 transition-colors flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reset Tool
            </button>
            <a
              href={resultVideoUrl}
              download="lipsync_offline.mp4"
              className="flex-1 py-2 px-3 rounded-xl font-semibold text-xs bg-violet-600 hover:bg-violet-500 text-white transition-colors flex items-center justify-center gap-1.5 shadow-md"
            >
              <Download className="w-3.5 h-3.5" />
              Download MP4
            </a>
          </div>
        </div>
      )}

      {/* Error / Missing Weights State */}
      {status === 'error' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
            {isMissingModels ? (
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
            )}
            <div className="text-left">
              <span className="text-xs font-bold text-zinc-200 block">
                {isMissingModels ? 'AI Weights Required' : 'Inference Failed'}
              </span>
              <p className="text-[10px] text-zinc-450 mt-1 leading-normal">
                {errorMsg}
              </p>
            </div>
          </div>

          {isMissingModels && (
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-left space-y-2">
              <h5 className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider">Setup Instructions:</h5>
              <ol className="text-[10px] text-zinc-555 list-decimal pl-4 space-y-2.5 leading-relaxed">
                <li>
                  Make sure you have downloaded all SadTalker checkpoints:
                  <div className="flex flex-col gap-1 mt-1 pl-2">
                    <a href="https://github.com/OpenTalker/SadTalker/releases/download/v0.0.2-rc/SadTalker_V0.0.2_256.safetensors" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 underline font-semibold">SadTalker_V0.0.2_256.safetensors</a>
                    <a href="https://github.com/OpenTalker/SadTalker/releases/download/v0.0.2-rc/mapping_00109-model.pth.tar" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 underline font-semibold">mapping_00109-model.pth.tar</a>
                    <a href="https://github.com/OpenTalker/SadTalker/releases/download/v0.0.2-rc/mapping_00229-model.pth.tar" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 underline font-semibold">mapping_00229-model.pth.tar</a>
                  </div>
                </li>
                <li>
                  Place all downloaded checkpoints in the <code className="text-zinc-300 font-mono text-[9px] bg-zinc-950 px-1 py-0.5 rounded">backend/backend/models/sadtalker/</code> directory.
                </li>
                <li>Simply upload your photo and audio, and click "Synthesize Lip-Sync" again.</li>
              </ol>
            </div>
          )}

          <button
            onClick={isMissingModels ? resetForm : runLipsync}
            className="w-full py-2 rounded-xl font-semibold text-xs bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-200 transition-colors flex items-center justify-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {isMissingModels ? 'Clear files' : 'Try Again'}
          </button>
        </div>
      )}

    </div>
  );
}
