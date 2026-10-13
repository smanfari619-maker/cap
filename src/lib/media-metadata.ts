/**
 * Extract metadata (duration, width, height) from a media File (video or audio)
 * using a temporary browser HTMLVideoElement/HTMLAudioElement.
 */
export function getMediaMetadata(file: File): Promise<{ durationMs: number; width?: number; height?: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const isAudio = file.type.startsWith('audio/');
    let settled = false;

    const finalize = (result: { durationMs: number; width?: number; height?: number }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      resolve(result);
    };

    // 6s safety timeout prevents hanging indefinitely on unparseable / broken containers
    const timer = setTimeout(() => {
      console.warn(`[getMediaMetadata] Metadata read timeout for ${file.name}; fallback default used.`);
      finalize({ durationMs: 5000, width: isAudio ? undefined : 1920, height: isAudio ? undefined : 1080 });
    }, 6000);

    if (isAudio) {
      const audio = new Audio();
      audio.src = url;
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        finalize({
          durationMs: Math.round((audio.duration && !isNaN(audio.duration) ? audio.duration : 5) * 1000)
        });
      };
      audio.onerror = () => {
        finalize({ durationMs: 5000 });
      };
    } else {
      const video = document.createElement('video');
      video.src = url;
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      video.onloadedmetadata = () => {
        finalize({
          durationMs: Math.round((video.duration && !isNaN(video.duration) ? video.duration : 5) * 1000),
          width: video.videoWidth || undefined,
          height: video.videoHeight || undefined
        });
        video.remove();
      };

      video.onerror = () => {
        finalize({ durationMs: 5000 });
        video.remove();
      };
    }
  });
}
