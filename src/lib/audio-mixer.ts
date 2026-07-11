import { db, type Project, type TimelineClip } from './db';
import { getFileFromOPFS } from './opfs';

export async function mixAudioTracks(project: Project, sampleRate = 44100): Promise<AudioBuffer | null> {
  // 1. Calculate project duration
  let maxTimeMs = 0;
  const audioVideoClips: { clip: TimelineClip; type: 'video' | 'audio' }[] = [];

  for (const track of project.tracks) {
    // Skip muted tracks
    if (track.muted) continue;
    if (track.type === 'video' || track.type === 'audio') {
      for (const clip of track.clips) {
        // Skip disabled clips or clips with volume set to 0
        if (clip.disabled || clip.volume === 0) continue;
        if (clip.assetId && clip.type !== 'image') {
          audioVideoClips.push({ clip, type: track.type === 'audio' ? 'audio' : 'video' });
          const endMs = clip.positionMs + clip.durationMs;
          if (endMs > maxTimeMs) {
            maxTimeMs = endMs;
          }
        }
      }
    }
  }

  if (maxTimeMs === 0) return null;

  // 2. Create OfflineAudioContext
  const totalLength = Math.max(sampleRate, Math.round((sampleRate * maxTimeMs) / 1000));
  const offlineCtx = new OfflineAudioContext({
    numberOfChannels: 2,
    length: totalLength,
    sampleRate
  });

  const baseAudioCtx = new AudioContext({ sampleRate });
  try {
    // 3. Decode and mix each clip
    for (const { clip } of audioVideoClips) {
      if (!clip.assetId) continue;

      try {
        const asset = await db.assets.get(clip.assetId);
        if (!asset) continue;

        const file = await getFileFromOPFS(asset.opfsPath);
        
        // Safety check for massive video files to prevent memory/decoding crashes
        if (file.size > 100 * 1024 * 1024 && file.type.startsWith('video/')) {
          console.warn(`[AudioMixer] Skipping audio track for massive video file ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB) to prevent crash.`);
          continue;
        }

        const arrayBuffer = await file.arrayBuffer();

        // Decode audio data inside standard context (OfflineAudioContext might not support decoding directly on some engines)
        const decodedBuffer = await baseAudioCtx.decodeAudioData(arrayBuffer);

        // Create nodes in offlineCtx
        const source = offlineCtx.createBufferSource();
        source.buffer = decodedBuffer;

        const gainNode = offlineCtx.createGain();

        // Set playback speed rate
        source.playbackRate.value = clip.speed || 1.0;

        // Calculate time mappings
        const startTimeSec = clip.positionMs / 1000;
        const trimStartSec = clip.trimStartMs / 1000;
        const durationSec = clip.durationMs / 1000;

        // Base volume level
        const volumeFactor = (clip.volume !== undefined ? clip.volume : 100) / 100;
        gainNode.gain.setValueAtTime(0, startTimeSec);

        // Volume & Fades automation
        const fadeInSec = (clip.fadeInMs || 0) / 1000;
        const fadeOutSec = (clip.fadeOutMs || 0) / 1000;

        if (fadeInSec > 0) {
          gainNode.gain.linearRampToValueAtTime(volumeFactor, startTimeSec + fadeInSec);
        } else {
          gainNode.gain.setValueAtTime(volumeFactor, startTimeSec);
        }

        if (fadeOutSec > 0) {
          const fadeOutStart = startTimeSec + durationSec - fadeOutSec;
          gainNode.gain.setValueAtTime(volumeFactor, fadeOutStart);
          gainNode.gain.linearRampToValueAtTime(0, startTimeSec + durationSec);
        } else {
          gainNode.gain.setValueAtTime(volumeFactor, startTimeSec + durationSec);
        }

        // 3-band EQ setup if defined
        let lastNode: AudioNode = source;
        if (clip.audioEQ) {
          const { low, mid, high } = clip.audioEQ;
          
          const lowFilter = offlineCtx.createBiquadFilter();
          lowFilter.type = 'lowshelf';
          lowFilter.frequency.value = 250;
          lowFilter.gain.value = low;

          const midFilter = offlineCtx.createBiquadFilter();
          midFilter.type = 'peaking';
          midFilter.Q.value = 1.0;
          midFilter.frequency.value = 1000;
          midFilter.gain.value = mid;

          const highFilter = offlineCtx.createBiquadFilter();
          highFilter.type = 'highshelf';
          highFilter.frequency.value = 4000;
          highFilter.gain.value = high;

          source.connect(lowFilter);
          lowFilter.connect(midFilter);
          midFilter.connect(highFilter);
          lastNode = highFilter;
        }

        // Connect nodes
        lastNode.connect(gainNode);
        gainNode.connect(offlineCtx.destination);

        // Start play at mapping offsets
        source.start(startTimeSec, trimStartSec, durationSec);
      } catch (err) {
        console.warn(`Failed to mix audio clip ${clip.name}:`, err);
      }
    }

    // Render audio mix
    const renderedBuffer = await offlineCtx.startRendering();
    return renderedBuffer;
  } finally {
    baseAudioCtx.close();
  }
}
