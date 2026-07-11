import { getFileFromOPFS } from './opfs';
import { db } from './db';

export async function getWaveformPeaksForAsset(assetId: string): Promise<number[]> {
  try {
    const asset = await db.assets.get(assetId);
    if (!asset) return [];
    if (asset.waveformPeaks && asset.waveformPeaks.length > 0) {
      return asset.waveformPeaks;
    }

    const peaks = await generateWaveformPeaks(asset.opfsPath);
    if (peaks.length > 0) {
      await db.assets.update(assetId, { waveformPeaks: peaks });
    }
    return peaks;
  } catch (err) {
    console.warn('Failed to get/compute waveform peaks for asset:', assetId, err);
    return [];
  }
}

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

    // Safety check for massive files to prevent memory/CPU exhaust crashes
    if (file.size > 100 * 1024 * 1024) {
      console.warn(`File ${file.name} is too large (${(file.size / 1024 / 1024).toFixed(1)}MB) for in-browser waveform extraction. Generating mock waveform.`);
      const peaks: number[] = [];
      let currentVal = 0.4;
      for (let i = 0; i < points; i++) {
        currentVal = Math.max(0.1, Math.min(0.8, currentVal + (Math.random() - 0.5) * 0.2));
        peaks.push(Number(currentVal.toFixed(3)));
      }
      return peaks;
    }

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
