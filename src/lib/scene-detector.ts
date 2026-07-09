import { db } from './db';
import { getFileFromOPFS } from './opfs';
import { useEditorStore } from '../store/editorStore';

/**
 * Reads a video file and detects scene cuts by comparing downsampled pixel brightness deltas.
 */
export async function detectSceneCuts(file: File): Promise<number[]> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;
    
    const canvas = document.createElement('canvas');
    canvas.width = 60;
    canvas.height = 36;
    const ctx = canvas.getContext('2d')!;

    const cuts: number[] = [];
    let prevData: Uint8ClampedArray | null = null;
    
    // Check frames at 500ms intervals
    const intervalS = 0.5; 
    let currentSeek = 0.5;

    video.onloadedmetadata = () => {
      const duration = video.duration;
      
      const seekNext = () => {
        if (currentSeek >= duration - 0.2) {
          URL.revokeObjectURL(video.src);
          resolve(cuts);
          return;
        }
        video.currentTime = currentSeek;
      };

      video.onseeked = () => {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;

          if (prevData) {
            let diffSum = 0;
            for (let i = 0; i < data.length; i += 4) {
              const rDiff = Math.abs(data[i] - prevData[i]);
              const gDiff = Math.abs(data[i+1] - prevData[i+1]);
              const bDiff = Math.abs(data[i+2] - prevData[i+2]);
              diffSum += (rDiff + gDiff + bDiff) / 3;
            }
            const averageDiff = diffSum / (canvas.width * canvas.height);
            
            // Brightness delta threshold peak indicating scene changes
            if (averageDiff > 28) {
              cuts.push(currentSeek * 1000);
            }
          }
          prevData = data;
        } catch (e) {
          // ignore draw frame errors on missing tracks
        }
        
        currentSeek += intervalS;
        seekNext();
      };

      seekNext();
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve([]);
    };
  });
}

/**
 * Triggers sequential split actions descending from right-to-left at detected scene cuts.
 *
 * @param clipId ID of the clip to scan and split
 * @returns number of splits made
 */
export async function autoCutVideoClip(clipId: string): Promise<number> {
  const store = useEditorStore.getState();
  const project = store.project;
  if (!project) return 0;

  const clip = project.tracks.flatMap(t => t.clips).find(c => c.id === clipId);
  if (!clip || clip.type !== 'video' || !clip.assetId) return 0;

  const asset = await db.assets.get(clip.assetId);
  if (!asset || !asset.opfsPath) return 0;

  const file = await getFileFromOPFS(asset.opfsPath);
  const cuts = await detectSceneCuts(file);

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
