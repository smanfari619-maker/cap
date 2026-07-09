import { useState, useRef, useEffect } from 'react';
import { Mic } from 'lucide-react';
import { useEditorStore } from '../../../store/editorStore';
import { db } from '../../../lib/db';
import { saveFileToOPFS } from '../../../lib/opfs';

interface VoiceoverRecorderProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function VoiceoverRecorder({ isOpen, onClose }: VoiceoverRecorderProps) {
  const project = useEditorStore(state => state.project);
  const addClip = useEditorStore(state => state.addClip);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [volumeLevel, setVolumeLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];
      
      const options = { mimeType: 'audio/webm' };
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, options);
      } catch {
        recorder = new MediaRecorder(stream);
      }
      
      mediaRecorderRef.current = recorder;
      
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const durationMs = await getAudioDuration(audioBlob);
        
        // Save to OPFS & Database
        const assetId = `vo-${Math.random().toString(36).substr(2, 9)}`;
        const opfsPath = `${project?.id}/${assetId}.webm`;
        await saveFileToOPFS(opfsPath, audioBlob);

        const newAsset = {
          id: assetId,
          projectId: project?.id || '',
          name: `Voiceover ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
          size: audioBlob.size,
          type: 'audio',
          durationMs,
          opfsPath,
          createdAt: new Date()
        };

        await db.assets.add(newAsset);

        // Add clip to the first audio track (or create one) at current playhead
        let audioTrack = project?.tracks.find((t: any) => t.type === 'audio');
        if (!audioTrack) {
          audioTrack = project?.tracks[0];
        }

        if (audioTrack) {
          const newClip = {
            id: `clip-${Math.random().toString(36).substr(2, 9)}`,
            assetId,
            type: 'audio' as const,
            name: newAsset.name,
            durationMs,
            trimStartMs: 0,
            trimEndMs: 0,
            positionMs: useEditorStore.getState().currentTime,
            trackId: audioTrack.id,
            volume: 100,
            speed: 1.0
          };
          await addClip(audioTrack.id, newClip);
        }

        stream.getTracks().forEach(t => t.stop());
      };

      // Set up volume analyzer
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const audioCtx = new AudioContextClass();
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyserRef.current = analyser;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const checkVolume = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const average = sum / dataArray.length;
          setVolumeLevel(Math.min(100, Math.round((average / 128) * 100)));
          animationFrameRef.current = requestAnimationFrame(checkVolume);
        };
        animationFrameRef.current = requestAnimationFrame(checkVolume);
      }

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error('Failed to start recording:', err);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioCtxRef.current) audioCtxRef.current.close();
    setVolumeLevel(0);
  };

  const closeVoiceoverRecorder = () => {
    stopRecording();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    onClose();
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const getAudioDuration = (blob: Blob): Promise<number> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.addEventListener('loadedmetadata', () => {
        URL.revokeObjectURL(url);
        resolve(audio.duration * 1000);
      });
      audio.addEventListener('error', () => {
        URL.revokeObjectURL(url);
        resolve(0);
      });
    });
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioCtxRef.current) audioCtxRef.current.close();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-[#1a1a20] border border-zinc-800 rounded-xl p-6 w-80 shadow-2xl space-y-4 text-center">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h3 className="font-bold text-sm text-gray-200 flex items-center gap-2">
            <Mic className="w-4 h-4 text-red-500 animate-pulse" />
            Voiceover Recorder
          </h3>
          <button 
            onClick={closeVoiceoverRecorder}
            disabled={isRecording}
            className="text-gray-500 hover:text-gray-300 transition text-xs"
          >
            Close
          </button>
        </div>

        {/* Visualizer and Timer */}
        <div className="py-6 flex flex-col items-center justify-center space-y-3">
          {/* Pulsing Outer Circle based on volume level */}
          <div 
            className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center transition-all duration-75"
            style={{
              boxShadow: isRecording ? `0 0 ${20 + volumeLevel * 0.4}px rgba(239, 68, 68, ${0.2 + volumeLevel * 0.005})` : 'none',
              transform: isRecording ? `scale(${1 + volumeLevel * 0.002})` : 'scale(1)'
            }}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isRecording ? 'bg-red-600 animate-pulse' : 'bg-zinc-800'}`}>
              <Mic className="w-5 h-5 text-white" />
            </div>
          </div>

          {/* Volume Meter Bar */}
          {isRecording && (
            <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 h-full transition-all duration-75" 
                style={{ width: `${volumeLevel}%` }}
              />
            </div>
          )}

          <div className="text-2xl font-mono font-bold text-gray-100">
            {formatTimer(recordingTime)}
          </div>
          <p className="text-[10px] text-gray-500">
            {isRecording ? "Recording your voice... Click Stop to save." : "Ready to record. Make sure your mic is allowed."}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3">
          {!isRecording ? (
            <button
              onClick={startRecording}
              className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold shadow transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
              Start Recording
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="px-5 py-2 bg-zinc-200 hover:bg-white text-zinc-950 rounded-lg text-xs font-semibold shadow transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span className="w-2.5 h-2.5 bg-zinc-950 rounded-sm" />
              Stop & Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
