import { getFileFromOPFS } from './opfs';

/**
 * Decodes the audio from an asset file in OPFS and extracts a fixed number of amplitude peaks.
 * Works for both pure audio files and video files containing audio.
 *
 * @param opfsPath Path to the file in OPFS
 * @param points Number of peak points to extract (default 200)
 * @returns Array of peak values between 0.0 and 1.0
 */
export async function generateWaveformPeaks(opfsPath: string, points = 200): Promise<number[]> {
  let audioCtx: AudioContext | null = null;
  try {
    const file = await getFileFromOPFS(opfsPath);
    const arrayBuffer = await file.arrayBuffer();

    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    // Use channel 0 (mono/left) to generate peaks
    const channelData = audioBuffer.getChannelData(0);
    const step = Math.ceil(channelData.length / points);
    const peaks: number[] = [];

    for (let i = 0; i < points; i++) {
      const start = i * step;
      const end = Math.min(start + step, channelData.length);
      let max = 0;
      for (let j = start; j < end; j++) {
        const val = Math.abs(channelData[j]);
        if (val > max) {
          max = val;
        }
      }
      // Normalize peak to [0, 1] range (usually audio sits below 1.0, but clamp just in case)
      peaks.push(Math.min(1.0, Number(max.toFixed(3))));
    }

    return peaks;
  } catch (err) {
    console.warn('Could not generate waveform peaks (file may have no audio track):', err);
    return [];
  } finally {
    if (audioCtx) {
      try {
        await audioCtx.close();
      } catch (e) {
        // ignore
      }
    }
  }
}
