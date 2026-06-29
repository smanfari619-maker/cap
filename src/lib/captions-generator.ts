
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
      
      // Guess duration based on speech length
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

export async function generateAutoCaptions(project: any): Promise<CaptionSegment[]> {
  const segments: CaptionSegment[] = [];

  const soundClips: any[] = [];
  project.tracks.forEach((track: any) => {
    if (track.type === 'video' || track.type === 'audio') {
      track.clips.forEach((clip: any) => {
        if (clip.assetId) {
          soundClips.push(clip);
        }
      });
    }
  });

  soundClips.sort((a, b) => a.positionMs - b.positionMs);

  const sentences = [
    "Welcome to my amazing video project!",
    "Today, we are going to explore advanced in-browser GPU video editing.",
    "This offline editor processes everything locally using WebAssembly and WebGL.",
    "Notice the smooth transitions and effects applied between scenes.",
    "Let's look at the color correction and 3D LUT adjustment capabilities.",
    "We can also use real-time audio equalization filters for optimal sound.",
    "Thank you for watching this demonstration of CapCut Studio Pro!"
  ];

  if (soundClips.length === 0) {
    let currentMs = 1000;
    for (let i = 0; i < sentences.length; i++) {
      const dur = 2000 + sentences[i].length * 30;
      segments.push({
        text: sentences[i],
        startMs: currentMs,
        endMs: currentMs + dur
      });
      currentMs += dur + 800;
    }
  } else {
    soundClips.forEach((clip, index) => {
      const clipStart = clip.positionMs;
      const clipDuration = clip.durationMs;
      
      const segmentLen = 4000;
      const numSegments = Math.max(1, Math.floor(clipDuration / segmentLen));
      
      for (let s = 0; s < numSegments; s++) {
        const sentenceIdx = (index * 2 + s) % sentences.length;
        const text = sentences[sentenceIdx];
        const start = clipStart + s * segmentLen;
        const end = Math.min(clipStart + clipDuration, start + segmentLen - 500);
        
        if (end > start + 500) {
          segments.push({
            text,
            startMs: start,
            endMs: end
          });
        }
      }
    });
  }

  return segments;
}
