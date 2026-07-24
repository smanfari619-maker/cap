use wasm_bindgen::prelude::*;

/// Compute the mean absolute difference between two RGBA frame buffers.
///
/// Both buffers must be the same length (width × height × 4 bytes).
/// Returns a score in [0.0, 255.0] — values above ~28 indicate a scene cut,
/// matching the threshold used in the original JS scene detector.
///
/// # Arguments
/// * `a` - first frame RGBA bytes (Uint8ClampedArray from ImageData)
/// * `b` - second frame RGBA bytes (Uint8ClampedArray from ImageData)
///
/// # Returns
/// Mean absolute pixel difference across all RGB channels (alpha ignored)
#[wasm_bindgen]
pub fn diff_frames(a: &[u8], b: &[u8]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }

    let mut total: u64 = 0;
    let mut count: u64 = 0;
    let mut i = 0;

    while i + 3 < a.len() {
        // Only compare R, G, B — skip alpha (index i+3)
        let r_diff = (a[i] as i32 - b[i] as i32).unsigned_abs() as u64;
        let g_diff = (a[i + 1] as i32 - b[i + 1] as i32).unsigned_abs() as u64;
        let b_diff = (a[i + 2] as i32 - b[i + 2] as i32).unsigned_abs() as u64;

        total += (r_diff + g_diff + b_diff) / 3;
        count += 1;
        i += 4;
    }

    if count == 0 {
        return 0.0;
    }

    total as f32 / count as f32
}
