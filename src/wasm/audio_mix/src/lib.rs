use wasm_bindgen::prelude::*;

/// A single audio track's PCM data and mix parameters.
/// All times are in samples (not seconds).
#[wasm_bindgen]
pub struct TrackInput {
    /// Interleaved stereo f32 samples [L, R, L, R, ...]
    /// or mono [S, S, S, ...] — specify with `channels`
    samples: Vec<f32>,
    channels: u32,
    /// Where this track starts in the output buffer (in samples)
    start_sample: usize,
    /// How many output samples to use from this track
    duration_samples: usize,
    /// Where in the source buffer to start reading (trim)
    trim_start_sample: usize,
    /// Volume multiplier [0.0, 2.0]
    volume: f32,
    /// Fade-in duration in samples (0 = no fade)
    fade_in_samples: usize,
    /// Fade-out duration in samples (0 = no fade)
    fade_out_samples: usize,
    /// Playback speed factor (1.0 = normal)
    speed: f32,
}

#[wasm_bindgen]
impl TrackInput {
    #[wasm_bindgen(constructor)]
    pub fn new(
        samples: Vec<f32>,
        channels: u32,
        start_sample: usize,
        duration_samples: usize,
        trim_start_sample: usize,
        volume: f32,
        fade_in_samples: usize,
        fade_out_samples: usize,
        speed: f32,
    ) -> TrackInput {
        TrackInput {
            samples,
            channels,
            start_sample,
            duration_samples,
            trim_start_sample,
            volume,
            fade_in_samples,
            fade_out_samples,
            speed,
        }
    }
}

/// Mix multiple audio tracks into a stereo f32 output buffer.
///
/// # Arguments
/// * `tracks` - Vec of TrackInput structs
/// * `total_samples` - total length of output in stereo samples (pairs)
///
/// # Returns
/// Interleaved stereo f32 buffer [L0, R0, L1, R1, ...]
#[wasm_bindgen]
pub fn mix_tracks(tracks: Vec<TrackInput>, total_samples: usize) -> Vec<f32> {
    // Output: interleaved stereo
    let mut output = vec![0.0f32; total_samples * 2];

    for track in &tracks {
        let vol = track.volume.max(0.0).min(2.0);
        let speed = track.speed.max(0.01).min(10.0);

        for out_i in 0..track.duration_samples {
            let out_pos = track.start_sample + out_i;
            if out_pos >= total_samples {
                break;
            }

            // Map output position back to source position (with speed factor)
            let src_float = track.trim_start_sample as f64
                + out_i as f64 * speed as f64;
            let src_i = src_float as usize;

            let channels = track.channels as usize;

            // Linear interpolation between adjacent samples for smoother speed changes
            let frac = (src_float - src_i as f64) as f32;

            let get_sample = |ch: usize, idx: usize| -> f32 {
                let flat = idx * channels + ch;
                if flat < track.samples.len() {
                    track.samples[flat]
                } else {
                    0.0
                }
            };

            let sample_l = {
                let s0 = get_sample(0, src_i);
                let s1 = get_sample(0, src_i + 1);
                s0 + (s1 - s0) * frac
            };

            let sample_r = if channels > 1 {
                let s0 = get_sample(1, src_i);
                let s1 = get_sample(1, src_i + 1);
                s0 + (s1 - s0) * frac
            } else {
                sample_l
            };

            // Compute gain envelope (fade in/out)
            let gain = compute_gain(
                out_i,
                track.duration_samples,
                track.fade_in_samples,
                track.fade_out_samples,
                vol,
            );

            output[out_pos * 2] += sample_l * gain;
            output[out_pos * 2 + 1] += sample_r * gain;
        }
    }

    // Soft clip to prevent clipping artifacts
    for s in output.iter_mut() {
        *s = soft_clip(*s);
    }

    output
}

/// Compute per-sample gain with fade-in and fade-out envelope.
#[inline(always)]
fn compute_gain(
    pos: usize,
    duration: usize,
    fade_in: usize,
    fade_out: usize,
    volume: f32,
) -> f32 {
    let mut gain = volume;

    if fade_in > 0 && pos < fade_in {
        gain *= pos as f32 / fade_in as f32;
    }

    if fade_out > 0 {
        let fade_start = duration.saturating_sub(fade_out);
        if pos >= fade_start {
            let t = (pos - fade_start) as f32 / fade_out as f32;
            gain *= 1.0 - t;
        }
    }

    gain
}

/// Soft clip using tanh to prevent harsh digital clipping.
#[inline(always)]
fn soft_clip(x: f32) -> f32 {
    x.tanh()
}
