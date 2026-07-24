use wasm_bindgen::prelude::*;

/// Extract amplitude peaks from raw f32 PCM audio samples.
/// 
/// Uses RMS (Root Mean Square) windowing for more accurate loudness
/// representation than simple max-abs, which is what the JS version does.
///
/// # Arguments
/// * `samples` - flat f32 PCM buffer (mono channel, values in [-1.0, 1.0])
/// * `num_peaks` - number of output buckets (e.g. 200 for the timeline waveform)
///
/// # Returns
/// A Vec<f32> of RMS peak values, each in [0.0, 1.0]
#[wasm_bindgen]
pub fn extract_peaks(samples: &[f32], num_peaks: usize) -> Vec<f32> {
    if samples.is_empty() || num_peaks == 0 {
        return vec![0.0; num_peaks];
    }

    let step = (samples.len() as f64 / num_peaks as f64).ceil() as usize;
    let step = step.max(1);
    let mut peaks = Vec::with_capacity(num_peaks);

    for i in 0..num_peaks {
        let start = i * step;
        let end = ((start + step).min(samples.len())).max(start + 1);
        let slice = &samples[start..end];

        // RMS: sqrt(mean(x^2))
        let sum_sq: f32 = slice.iter().map(|&s| s * s).sum();
        let rms = (sum_sq / slice.len() as f32).sqrt();

        // Clamp to [0, 1]
        peaks.push(rms.min(1.0_f32).max(0.0_f32));
    }

    peaks
}

/// Faster max-abs version (matches the original JS behaviour exactly,
/// useful for A/B comparison in tests).
#[wasm_bindgen]
pub fn extract_peaks_max(samples: &[f32], num_peaks: usize) -> Vec<f32> {
    if samples.is_empty() || num_peaks == 0 {
        return vec![0.0; num_peaks];
    }

    let step = (samples.len() as f64 / num_peaks as f64).ceil() as usize;
    let step = step.max(1);
    let mut peaks = Vec::with_capacity(num_peaks);

    for i in 0..num_peaks {
        let start = i * step;
        let end = ((start + step).min(samples.len())).max(start + 1);
        let slice = &samples[start..end];

        let max = slice.iter().map(|s| s.abs()).fold(0.0_f32, f32::max);
        peaks.push(max.min(1.0_f32));
    }

    peaks
}
