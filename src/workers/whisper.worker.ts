import { pipeline, env } from '@xenova/transformers';

// Configure ONNX Runtime to use CDN assets
env.allowLocalModels = false;

let transcriber: any = null;

async function getTranscriber(progressCallback: (progress: number) => void) {
  if (!transcriber) {
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
      progress_callback: (data: any) => {
        if (data.status === 'progress') {
          progressCallback(data.progress);
        }
      }
    });
  }
  return transcriber;
}

self.addEventListener('message', async (event: MessageEvent) => {
  const { audioData } = event.data;
  if (!audioData) {
    self.postMessage({ status: 'error', error: 'No audio data received' });
    return;
  }

  try {
    self.postMessage({ status: 'loading', progress: 0 });

    const pipe = await getTranscriber((percent) => {
      self.postMessage({ status: 'loading', progress: percent });
    });

    self.postMessage({ status: 'transcribing' });

    const result = await pipe(audioData, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
      force_decoder_prompt_ids: [50259], // Force English to avoid language hallucination loops
    });

    const chunks = result.chunks || [];
    const segments = chunks.map((chunk: any) => {
      const startMs = Math.round((chunk.timestamp[0] ?? 0) * 1000);
      const endMs = Math.round((chunk.timestamp[1] ?? (chunk.timestamp[0] + 2)) * 1000);
      return {
        text: chunk.text.trim(),
        startMs,
        endMs
      };
    });

    self.postMessage({ status: 'done', segments });
  } catch (err: any) {
    console.error('Whisper worker error:', err);
    self.postMessage({ status: 'error', error: err.message || String(err) });
  }
});
