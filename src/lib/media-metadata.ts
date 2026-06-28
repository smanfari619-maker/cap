/**
 * Extract metadata (duration, width, height) from a media File (video or audio)
 * using a temporary browser HTMLVideoElement/HTMLAudioElement.
 */
export function getMediaMetadata(file: File): Promise<{ durationMs: number; width?: number; height?: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const isAudio = file.type.startsWith('audio/');
    
    if (isAudio) {
      const audio = new Audio();
      audio.src = url;
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve({
          durationMs: Math.round(audio.duration * 1000)
        });
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ durationMs: 0 });
      };
    } else {
      const video = document.createElement('video');
      video.src = url;
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve({
          durationMs: Math.round(video.duration * 1000),
          width: video.videoWidth || undefined,
          height: video.videoHeight || undefined
        });
      };
      
      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ durationMs: 0 });
      };
    }
  });
}
