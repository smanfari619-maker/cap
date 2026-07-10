import { db } from './db';
import { getFileFromOPFS } from './opfs';
import { useEditorStore } from '../store/editorStore';

/**
 * Reads a video file and detects scene cuts by comparing downsampled pixel brightness deltas.
 */
export async function detectSceneCuts(
  file: File,
  onProgress?: (progress: number) => void
): Promise<number[]> {
  const arrayBuffer = await file.arrayBuffer();
  
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/scene-detect.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (event) => {
      const { type, pct, cuts, error } = event.data;
      if (type === 'progress') {
        onProgress?.(pct);
      } else if (type === 'done') {
        worker.terminate();
        resolve(cuts);
      } else if (type === 'error') {
        worker.terminate();
        reject(new Error(error));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    worker.postMessage({ arrayBuffer }, [arrayBuffer]);
  });
}

/**
 * Triggers sequential split actions descending from right-to-left at detected scene cuts.
 *
 * @param clipId ID of the clip to scan and split
 * @param onProgress Progress callback
 * @returns number of splits made
 */
export async function autoCutVideoClip(
  clipId: string,
  onProgress?: (progress: number) => void
): Promise<number> {
  const store = useEditorStore.getState();
  const project = store.project;
  if (!project) return 0;

  const clip = project.tracks.flatMap(t => t.clips).find(c => c.id === clipId);
  if (!clip || clip.type !== 'video' || !clip.assetId) return 0;

  const asset = await db.assets.get(clip.assetId);
  if (!asset || !asset.opfsPath) return 0;

  const file = await getFileFromOPFS(asset.opfsPath);
  const cuts = await detectSceneCuts(file, onProgress);

  if (cuts.length === 0) return 0;

  // Map cut timestamps inside the source file to absolute positions on the timeline.
  // Ensure we only cut inside boundaries of current trimmed clip, with a safety buffer.
  const absoluteCuts = cuts
    .map(cutFileMs => {
      const offsetInClip = cutFileMs - clip.trimStartMs;
      return clip.positionMs + offsetInClip;
    })
    .filter(pos => pos > clip.positionMs + 500 && pos < clip.positionMs + clip.durationMs - 500)
    .sort((a, b) => b - a); // Descending order ensures we don't displace left timeline offsets.

  if (absoluteCuts.length === 0) return 0;

  const originalPlayhead = store.currentTime;

  for (const pos of absoluteCuts) {
    store.setCurrentTime(pos);
    store.setSelectedClipId(clipId);
    store.setSelectedClipIds([clipId]);
    await store.splitClipAtPlayhead();
  }

  // Restore playhead position and active selections
  store.setCurrentTime(originalPlayhead);
  store.setSelectedClipId(null);
  store.setSelectedClipIds([]);
  
  return absoluteCuts.length;
}
