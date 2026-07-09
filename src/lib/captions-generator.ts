import { db } from './db';
import { getFileFromOPFS } from './opfs';

export interface CaptionSegment {
  text: string;
  startMs: number;
  endMs: number;
}

export function startSpeechRecognitionCaptions(
  onSegment: (segment: CaptionSegment) => void,
  onEnd: () => void
): any {
  // Use browser native SpeechRecognition API (supported in Chrome, Edge, Safari)
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('Speech Recognition is not supported in this browser. Please use Google Chrome, Microsoft Edge or Safari.');
    onEnd();
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  const startTime = Date.now();

  recognition.onresult = (event: any) => {
    const resultIndex = event.resultIndex;
    const result = event.results[resultIndex];
    if (result.isFinal) {
      const text = result[0].transcript.trim();
      const elapsedMs = Date.now() - startTime;
      
      const durationMs = Math.max(1500, text.length * 80);
      const startMs = Math.max(0, elapsedMs - durationMs);

      onSegment({
        text,
        startMs,
        endMs: elapsedMs
      });
    }
  };

  recognition.onerror = (e: any) => {
    console.error('Speech Recognition Error:', e);
  };

  recognition.onend = () => {
    onEnd();
  };

  recognition.start();
  return recognition;
}

// Resamples and mixes all project audio into a single 16000Hz mono Float32Array PCM buffer
async function mixProjectAudioTo16kMono(project: any): Promise<Float32Array | null> {
  let maxTimeMs = 0;
  const soundClips: any[] = [];

  for (const track of project.tracks) {
    if (track.type === 'video' || track.type === 'audio') {
      for (const clip of track.clips) {
        if (clip.assetId && clip.type !== 'image') {
          soundClips.push(clip);
          const endMs = clip.positionMs + clip.durationMs;
          if (endMs > maxTimeMs) {
            maxTimeMs = endMs;
          }
        }
      }
    }
  }

  if (maxTimeMs === 0) return null;

  const sampleRate = 16000;
  const totalLength = Math.max(sampleRate, Math.round((sampleRate * maxTimeMs) / 1000));
  
  const offlineCtx = new OfflineAudioContext({
    numberOfChannels: 1,
    length: totalLength,
    sampleRate
  });

  const baseAudioCtx = new AudioContext({ sampleRate: 44100 });

  try {
    for (const clip of soundClips) {
      if (!clip.assetId) continue;
      const asset = await db.assets.get(clip.assetId);
      if (!asset) continue;

      try {
        const file = await getFileFromOPFS(asset.opfsPath);
        const arrayBuffer = await file.arrayBuffer();
        const decodedBuffer = await baseAudioCtx.decodeAudioData(arrayBuffer);

        const source = offlineCtx.createBufferSource();
        source.buffer = decodedBuffer;
        source.playbackRate.value = clip.speed || 1.0;

        const gainNode = offlineCtx.createGain();
        const vol = clip.volume !== undefined ? clip.volume / 100 : 1.0;
        gainNode.gain.setValueAtTime(vol, 0);

        source.connect(gainNode);
        gainNode.connect(offlineCtx.destination);

        const startTimeSec = clip.positionMs / 1000;
        const trimStartSec = clip.trimStartMs / 1000;
        const durationSec = clip.durationMs / 1000;

        source.start(startTimeSec, trimStartSec, durationSec);
      } catch (err) {
        console.warn('Failed to mix clip for auto-captions:', clip.name, err);
      }
    }

    const rendered = await offlineCtx.startRendering();
    await baseAudioCtx.close();
    return rendered.getChannelData(0);
  } catch (err) {
    console.error('Audio mixing failed:', err);
    await baseAudioCtx.close();
    return null;
  }
}

export async function generateAutoCaptions(
  project: any,
  onProgress?: (stage: string, percent: number) => void
): Promise<CaptionSegment[]> {
  onProgress?.('Mixing audio tracks...', 10);
  const audioData = await mixProjectAudioTo16kMono(project);
  if (!audioData) {
    throw new Error('No audio found in project to transcribe.');
  }

  return new Promise((resolve, reject) => {
    onProgress?.('Initializing Whisper AI model...', 25);

    const worker = new Worker(
      new URL('../workers/whisper.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (event) => {
      const { status, progress, segments, error } = event.data;
      if (status === 'loading') {
        onProgress?.('Downloading Whisper AI Model (~75MB)...', Math.round(25 + progress * 0.45));
      } else if (status === 'transcribing') {
        onProgress?.('Transcribing audio files locally...', 75);
      } else if (status === 'done') {
        onProgress?.('Formatting captions...', 95);
        worker.terminate();
        resolve(segments);
      } else if (status === 'error') {
        worker.terminate();
        reject(new Error(error));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    worker.postMessage({ audioData });
  });
}
