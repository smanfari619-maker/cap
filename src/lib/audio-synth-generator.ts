/**
 * Browser-Native AI Soundtrack Synthesizer using Web Audio API
 * Generates custom royalty-free ambient beats, chord sequences, and sound FX on-the-fly.
 * Outputs a standard 16-bit PCM WAV Blob.
 */

// Helper to write string to DataView
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Convert float samples to 16-bit PCM WAV
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const sampleRate = buffer.sampleRate;
  const format = 1; // Raw PCM
  const bitDepth = 16;
  const result = buffer.getChannelData(0); // Downsample to mono for simplicity
  const bufferLength = result.length * 2;
  const wavBuffer = new ArrayBuffer(44 + bufferLength);
  const view = new DataView(wavBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + bufferLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 1 * (bitDepth / 8), true);
  view.setUint16(32, 1 * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, bufferLength, true);

  // Write PCM samples
  let offset = 44;
  for (let i = 0; i < result.length; i++, offset += 2) {
    const s = Math.max(-1.0, Math.min(1.0, result[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

// Pitch frequencies for scales (C-Major, A-Minor, etc.)
const SCALE_NOTES: Record<string, number[]> = {
  chill: [130.81, 146.83, 164.81, 196.00, 220.00], // C3, D3, E3, G3, A3
  tech: [73.42, 87.31, 98.00, 110.00, 130.81],    // D2, F2, G2, A2, C3
  epic: [110.00, 123.47, 130.81, 146.83, 164.81], // A2, B2, C3, D3, E3
};

/**
 * Synthesizes an audio soundtrack based on configuration parameters.
 *
 * @param bpm Beats Per Minute (60 to 180)
 * @param mood Track mood type ('chill' | 'tech' | 'epic')
 * @param durationSeconds Sound length (10 to 180 seconds)
 * @returns Blob object containing the WAV audio file
 */
export async function generateAISoundtrack(
  bpm: number,
  mood: 'chill' | 'tech' | 'epic',
  durationSeconds: number
): Promise<Blob> {
  const sampleRate = 44100;
  const totalLength = sampleRate * durationSeconds;

  const offlineCtx = new OfflineAudioContext(1, totalLength, sampleRate);

  const beatLength = 60 / bpm; // duration of 1 beat in seconds
  const barLength = beatLength * 4; // 4 beats per bar

  // Note frequency maps
  const scale = SCALE_NOTES[mood] || SCALE_NOTES.chill;

  // Sound Synth Helpers
  const playKick = (time: number) => {
    const osc = offlineCtx.createOscillator();
    const gain = offlineCtx.createGain();
    osc.connect(gain);
    gain.connect(offlineCtx.destination);
    
    osc.frequency.setValueAtTime(120, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.25);
    
    gain.gain.setValueAtTime(1.0, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
    
    osc.start(time);
    osc.stop(time + 0.25);
  };

  const playSnare = (time: number) => {
    const bufferSize = sampleRate * 0.15;
    const buffer = offlineCtx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = offlineCtx.createBufferSource();
    noise.buffer = buffer;

    const filter = offlineCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;

    const gain = offlineCtx.createGain();
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(offlineCtx.destination);

    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    noise.start(time);
    noise.stop(time + 0.15);
  };

  const playHat = (time: number) => {
    const bufferSize = sampleRate * 0.04;
    const buffer = offlineCtx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = offlineCtx.createBufferSource();
    noise.buffer = buffer;

    const filter = offlineCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 8000;

    const gain = offlineCtx.createGain();
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(offlineCtx.destination);

    gain.gain.setValueAtTime(0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

    noise.start(time);
    noise.stop(time + 0.04);
  };

  const playBass = (freq: number, time: number, duration: number) => {
    const osc = offlineCtx.createOscillator();
    const osc2 = offlineCtx.createOscillator();
    const gain = offlineCtx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.value = freq / 2; // Bass oct

    osc2.type = 'triangle';
    osc2.frequency.value = freq / 2 + 2; // De-tune detuning chorusing effect

    const filter = offlineCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 350;

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(offlineCtx.destination);

    gain.gain.setValueAtTime(0.0, time);
    gain.gain.linearRampToValueAtTime(0.22, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.start(time);
    osc.stop(time + duration);
    osc2.start(time);
    osc2.stop(time + duration);
  };

  const playLead = (freq: number, time: number, duration: number) => {
    const osc = offlineCtx.createOscillator();
    const gain = offlineCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = freq * 2; // Arp higher oct

    const delay = offlineCtx.createDelay();
    delay.delayTime.value = beatLength * 0.75;
    
    const delayGain = offlineCtx.createGain();
    delayGain.gain.value = 0.25;

    osc.connect(gain);
    gain.connect(offlineCtx.destination);

    // Feedback delay loop
    gain.connect(delay);
    delay.connect(delayGain);
    delayGain.connect(offlineCtx.destination);

    gain.gain.setValueAtTime(0.0, time);
    gain.gain.linearRampToValueAtTime(0.15, time + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.start(time);
    osc.stop(time + duration);
  };

  // Compile full arrangement timeline loop
  let time = 0.0;
  let barIndex = 0;

  while (time < durationSeconds - 0.5) {
    // 1. Kick on beat 1 and 3
    playKick(time);
    playKick(time + beatLength * 2);

    // 2. Snare on beat 2 and 4
    playSnare(time + beatLength);
    playSnare(time + beatLength * 3);

    // 3. Hihats subdivision (8th notes)
    for (let h = 0; h < 8; h++) {
      playHat(time + h * (beatLength / 2));
    }

    // 4. Bass Progression note selection
    const rootNote = scale[barIndex % scale.length];
    playBass(rootNote, time, barLength - 0.1);

    // 5. Melodic lead notes (Syncopated Arpeggios)
    if (mood === 'chill' || mood === 'epic') {
      const melodyPattern = [0, 2, 4, 3, 2, 4, 1, 3];
      for (let step = 0; step < 8; step++) {
        if (Math.random() > 0.3) {
          const noteIndex = melodyPattern[step] % scale.length;
          const noteFreq = scale[noteIndex];
          playLead(noteFreq, time + step * (beatLength / 2), beatLength / 3);
        }
      }
    } else if (mood === 'tech') {
      // Minimal pattern
      playLead(rootNote, time + beatLength * 0.5, beatLength * 0.2);
      playLead(scale[(barIndex + 2) % scale.length], time + beatLength * 2.5, beatLength * 0.2);
    }

    time += barLength;
    barIndex++;
  }

  // Render buffer offline
  const renderedBuffer = await offlineCtx.startRendering();
  return audioBufferToWav(renderedBuffer);
}
