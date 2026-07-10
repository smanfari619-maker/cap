/**
 * Client-Side Background Segmenter
 * Uses Google MediaPipe Selfie Segmentation via CDN to segment human subjects from background.
 */

export interface SelfieSegmentationResults {
  segmentationMask: HTMLCanvasElement | ImageBitmap;
  image: HTMLCanvasElement | ImageBitmap;
}

export interface SelfieSegmentationOptions {
  modelSelection?: number;
}

export interface SelfieSegmentationConfig {
  locateFile: (file: string) => string;
}

export class MediaPipeSelfieSegmentation {
  private instance: any = null;
  private onResultsCallback: ((results: SelfieSegmentationResults) => void) | null = null;
  private isLoaded = false;
  private initPromise: Promise<void> | null = null;

  constructor() {}

  private loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as any).SelfieSegmentation) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        if ((window as any).SelfieSegmentation) {
          resolve();
        } else {
          reject(new Error('SelfieSegmentation loaded but global not found'));
        }
      };
      script.onerror = () => reject(new Error(`Failed to load script ${src}`));
      document.head.appendChild(script);
    });
  }

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      await this.loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');
      
      const SelfieClass = (window as any).SelfieSegmentation;
      if (!SelfieClass) {
        throw new Error('SelfieSegmentation global not found after script load');
      }

      this.instance = new SelfieClass({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
      });

      this.instance.setOptions({
        modelSelection: 1 // 1 for landscape (faster/web-optimized), 0 for general
      });

      this.instance.onResults((results: any) => {
        if (this.onResultsCallback) {
          this.onResultsCallback(results);
        }
      });

      this.isLoaded = true;
    })();

    return this.initPromise;
  }

  onResults(callback: (results: SelfieSegmentationResults) => void) {
    this.onResultsCallback = callback;
  }

  async send(image: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | ImageBitmap): Promise<void> {
    if (!this.isLoaded) {
      await this.init();
    }
    return this.instance.send({ image });
  }

  async close(): Promise<void> {
    if (this.instance) {
      await this.instance.close();
      this.instance = null;
      this.isLoaded = false;
      this.initPromise = null;
    }
  }
}

// Global singleton helper
const segmenterSingleton = new MediaPipeSelfieSegmentation();

export async function removeBackgroundFromImageData(
  imgData: ImageData,
  bgMode: 'transparent' | 'color' | 'image',
  bgColor = '#00ff00',
  bgImageElement: HTMLImageElement | null = null
): Promise<ImageData> {
  const canvas = document.createElement('canvas');
  canvas.width = imgData.width;
  canvas.height = imgData.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imgData, 0, 0);

  return new Promise(async (resolve, reject) => {
    try {
      await segmenterSingleton.init();

      let segmentResolved = false;
      const timeout = setTimeout(() => {
        if (!segmentResolved) {
          reject(new Error('Selfie Segmentation timed out'));
        }
      }, 8000);

      segmenterSingleton.onResults((results) => {
        if (segmentResolved) return;
        segmentResolved = true;
        clearTimeout(timeout);

        // Draw segmented results
        const outCanvas = document.createElement('canvas');
        outCanvas.width = imgData.width;
        outCanvas.height = imgData.height;
        const outCtx = outCanvas.getContext('2d')!;

        // 1. Draw background first
        if (bgMode === 'transparent') {
          outCtx.clearRect(0, 0, imgData.width, imgData.height);
        } else if (bgMode === 'color') {
          outCtx.fillStyle = bgColor;
          outCtx.fillRect(0, 0, imgData.width, imgData.height);
        } else if (bgMode === 'image' && bgImageElement) {
          outCtx.drawImage(bgImageElement, 0, 0, imgData.width, imgData.height);
        } else {
          // default to transparent
          outCtx.clearRect(0, 0, imgData.width, imgData.height);
        }

        // 2. Draw mask to mask context
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imgData.width;
        tempCanvas.height = imgData.height;
        const tempCtx = tempCanvas.getContext('2d')!;

        // Draw the selfie segmentation mask
        tempCtx.drawImage(results.segmentationMask, 0, 0, imgData.width, imgData.height);

        // Clip source image with mask
        const personCanvas = document.createElement('canvas');
        personCanvas.width = imgData.width;
        personCanvas.height = imgData.height;
        const personCtx = personCanvas.getContext('2d')!;

        // Draw original image first
        personCtx.drawImage(canvas, 0, 0);

        // Use source-in to keep only where mask is drawn
        personCtx.globalCompositeOperation = 'destination-in';
        personCtx.drawImage(results.segmentationMask, 0, 0, imgData.width, imgData.height);
        personCtx.globalCompositeOperation = 'source-over';

        // Draw person on top of background
        outCtx.drawImage(personCanvas, 0, 0);

        resolve(outCtx.getImageData(0, 0, imgData.width, imgData.height));
      });

      await segmenterSingleton.send(canvas);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Removes background from a Video file frame-by-frame and exports as a new video blob.
 */
export async function removeBackgroundFromVideoFile(
  file: File,
  bgMode: 'transparent' | 'color' | 'image',
  bgColor = '#00ff00',
  bgImageElement: HTMLImageElement | null = null,
  onProgress: (pct: number) => void
): Promise<Blob> {
  const video = document.createElement('video');
  video.src = URL.createObjectURL(file);
  video.muted = true;
  video.playsInline = true;

  await new Promise((resolve) => {
    video.onloadedmetadata = resolve;
  });

  const width = video.videoWidth || 640;
  const height = video.videoHeight || 360;
  const duration = video.duration;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = height;
  const outCtx = outCanvas.getContext('2d')!;

  const stream = outCanvas.captureStream(25);
  const options = { mimeType: 'video/webm;codecs=vp9' };
  let mediaRecorder: MediaRecorder;
  try {
    mediaRecorder = new MediaRecorder(stream, options);
  } catch (e) {
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  }

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  const recordingPromise = new Promise<Blob>((resolve) => {
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
      URL.revokeObjectURL(video.src);
      resolve(blob);
    };
  });

  mediaRecorder.start();

  const frameInterval = 0.04; // 25 FPS
  let currentTime = 0;

  await segmenterSingleton.init();

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext('2d')!;

  while (currentTime < duration) {
    video.currentTime = currentTime;
    await new Promise((resolve) => {
      video.onseeked = resolve;
    });

    tempCtx.drawImage(video, 0, 0, width, height);

    await new Promise<void>((resolveFrame) => {
      segmenterSingleton.onResults((results) => {
        if (bgMode === 'transparent') {
          outCtx.clearRect(0, 0, width, height);
        } else if (bgMode === 'color') {
          outCtx.fillStyle = bgColor;
          outCtx.fillRect(0, 0, width, height);
        } else if (bgMode === 'image' && bgImageElement) {
          outCtx.drawImage(bgImageElement, 0, 0, width, height);
        }

        const personCanvas = document.createElement('canvas');
        personCanvas.width = width;
        personCanvas.height = height;
        const personCtx = personCanvas.getContext('2d')!;
        personCtx.drawImage(tempCanvas, 0, 0);
        personCtx.globalCompositeOperation = 'destination-in';
        personCtx.drawImage(results.segmentationMask, 0, 0, width, height);
        personCtx.globalCompositeOperation = 'source-over';

        outCtx.drawImage(personCanvas, 0, 0);
        resolveFrame();
      });

      segmenterSingleton.send(tempCanvas).catch(() => {
        outCtx.drawImage(tempCanvas, 0, 0);
        resolveFrame();
      });
    });

    currentTime += frameInterval;
    onProgress(Math.min(100, Math.round((currentTime / duration) * 100)));
  }

  mediaRecorder.stop();
  return recordingPromise;
}
