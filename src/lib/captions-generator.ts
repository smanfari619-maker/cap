
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
