/**
 * Client-Side AI/Spectral Audio Denoiser
 * Performs real-time or offline spectral subtraction noise reduction.
 * Fully client-side, zero downloads, zero dependencies.
 */

// Simple Radix-2 FFT implementation
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  if (n <= 1) return;

  // Bit reversal permutation
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (i < j) {
      let temp = re[i]; re[i] = re[j]; re[j] = temp;
      temp = im[i]; im[i] = im[j]; im[j] = temp;
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }

  // Cooley-Tukey Radix-2 iteration
  for (let len = 2; len <= n; len <<= 1) {
    const angle = -2 * Math.PI / len;
    const wlen_r = Math.cos(angle);
    const wlen_i = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let w_r = 1;
      let w_i = 0;
      const halflen = len >> 1;
      for (let k = 0; k < halflen; k++) {
        const u_r = re[i + k];
        const u_i = im[i + k];
        const t_r = re[i + k + halflen] * w_r - im[i + k + halflen] * w_i;
        const t_i = re[i + k + halflen] * w_i + im[i + k + halflen] * w_r;
        re[i + k] = u_r + t_r;
        im[i + k] = u_i + t_i;
        re[i + k + halflen] = u_r - t_r;
        im[i + k + halflen] = u_i - t_i;

        const next_w_r = w_r * wlen_r - w_i * wlen_i;
        w_i = w_r * wlen_i + w_i * wlen_r;
        w_r = next_w_r;
      }
    }
  }
}

function ifft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 0; i < n; i++) {
    im[i] = -im[i];
  }
  fft(re, im);
  for (let i = 0; i < n; i++) {
    re[i] /= n;
    im[i] = -im[i] / n;
  }
}

/**
 * Denoises a Float32Array audio channel using STFT Spectral Subtraction.
 * 
 * @param input The raw Float32Array PCM samples
 * @param reductionStrength Suppression factor (0.0 to 1.0)
 * @returns A new Float32Array with background noise suppressed
 */
export function denoiseAudioChannel(input: Float32Array, reductionStrength: number): Float32Array {
  const n = input.length;
  const output = new Float32Array(n);

  const fftSize = 1024;
  const hopSize = 256; // 4x overlap
  const numBins = fftSize / 2 + 1;

  // Generate Hann window
  const window = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
  }

  // Pre-calculate window normalization factor
  let winSum = 0;
  for (let i = 0; i < fftSize; i += hopSize) {
    if (i < fftSize) {
      winSum += window[i] * window[i];
    }
  }
  const normFactor = hopSize / (winSum || 1);

  // Phase 1: Noise profile estimation (minimum statistics tracking)
  // We keep track of the minimum observed magnitude for each frequency bin
  const noiseFloor = new Float32Array(numBins);
  noiseFloor.fill(999.0); // Initialize with high values

  const numBlocks = Math.floor((n - fftSize) / hopSize) + 1;
  const magnitudesList: Float32Array[] = [];
  const phasesList: Float32Array[] = [];

  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);

  for (let b = 0; b < numBlocks; b++) {
    const offset = b * hopSize;
    
    // Fill and window block
    for (let i = 0; i < fftSize; i++) {
      re[i] = input[offset + i] * window[i];
      im[i] = 0;
    }

    fft(re, im);

    const mag = new Float32Array(numBins);
    const phase = new Float32Array(numBins);

    for (let i = 0; i < numBins; i++) {
      const real = re[i];
      const imag = im[i];
      const m = Math.sqrt(real * real + imag * imag);
      mag[i] = m;
      phase[i] = Math.atan2(imag, real);

      // Minimum statistics: track noise floor over the entire audio
      if (m < noiseFloor[i]) {
        noiseFloor[i] = m;
      }
    }

    magnitudesList.push(mag);
    phasesList.push(phase);
  }

  // Smooth the noise floor slightly to prevent musical noise artifacts
  for (let i = 1; i < numBins - 1; i++) {
    noiseFloor[i] = 0.2 * noiseFloor[i-1] + 0.6 * noiseFloor[i] + 0.2 * noiseFloor[i+1];
  }

  // Scale alpha factor according to user selection
  const alpha = 1.0 + reductionStrength * 4.5; // alpha ranges from 1.0 to 5.5
  const minGain = 0.05 + (1.0 - reductionStrength) * 0.2; // Floor to avoid absolute dead silence

  // Overlap-add synthesis
  const synthBuffer = new Float32Array(n + fftSize);

  for (let b = 0; b < numBlocks; b++) {
    const mag = magnitudesList[b];
    const phase = phasesList[b];

    const outRe = new Float32Array(fftSize);
    const outIm = new Float32Array(fftSize);

    // Apply spectral subtraction
    for (let i = 0; i < numBins; i++) {
      const origMag = mag[i];
      const noiseEst = noiseFloor[i];
      
      // Subtract noise estimate from original magnitude
      let newMag = origMag - alpha * noiseEst;
      if (newMag < minGain * origMag) {
        newMag = minGain * origMag;
      }

      outRe[i] = newMag * Math.cos(phase[i]);
      outIm[i] = newMag * Math.sin(phase[i]);

      // Mirror spectrum for real IFFT
      if (i > 0 && i < numBins - 1) {
        outRe[fftSize - i] = outRe[i];
        outIm[fftSize - i] = -outIm[i];
      }
    }

    ifft(outRe, outIm);

    // Overlap-add
    const offset = b * hopSize;
    for (let i = 0; i < fftSize; i++) {
      synthBuffer[offset + i] += outRe[i] * window[i] * normFactor;
    }
  }

  // Copy synth buffer to output
  for (let i = 0; i < n; i++) {
    // Basic dynamic range clamp to prevent clipping
    output[i] = Math.max(-1.0, Math.min(1.0, synthBuffer[i]));
  }

  return output;
}

/**
 * Denoises an entire multi-channel AudioBuffer using Spectral Subtraction.
 */
export async function denoiseAudioBuffer(
  audioBuffer: AudioBuffer,
  reductionStrength: number
): Promise<AudioBuffer> {
  const offlineCtx = new OfflineAudioContext({
    numberOfChannels: audioBuffer.numberOfChannels,
    length: audioBuffer.length,
    sampleRate: audioBuffer.sampleRate
  });

  const denoisedBuffer = offlineCtx.createBuffer(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const inputData = audioBuffer.getChannelData(channel);
    const denoisedData = denoiseAudioChannel(inputData, reductionStrength);
    denoisedBuffer.copyToChannel(denoisedData as any, channel);
  }

  return denoisedBuffer;
}

/**
 * Encodes an AudioBuffer into a Standard 16-bit Mono/Stereo WAV file Blob.
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // Uncompressed LPCM
  const bitDepth = 16;
  
  const byteRate = sampleRate * numChannels * (bitDepth / 8);
  const blockAlign = numChannels * (bitDepth / 8);
  
  const numSamples = buffer.length;
  const dataSize = numSamples * numChannels * 2;
  
  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);
  
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Write interleaved channel samples
  let offset = 44;
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1.0, Math.min(1.0, channels[c][i]));
      const pcm = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, pcm, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: 'audio/wav' });
}
