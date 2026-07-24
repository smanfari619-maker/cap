#!/usr/bin/env bash
# wasm-build.sh — Build all JellyCut WASM modules
# Run this after any changes to src/wasm/*/src/lib.rs
# Outputs compiled modules to public/wasm/<module>/

set -e

source "$HOME/.cargo/env"

MODULES=("waveform" "scene_diff" "audio_mix")
ROOT=$(pwd)

echo "🦀 Building JellyCut WASM modules..."

for MOD in "${MODULES[@]}"; do
  echo ""
  echo "── Building $MOD ──────────────────────────────────────────"
  cd "$ROOT/src/wasm/$MOD"
  wasm-pack build \
    --target web \
    --out-dir "$ROOT/public/wasm/$MOD" \
    --release
  echo "✓ $MOD.wasm built → public/wasm/$MOD/"
done

echo ""
echo "✅ All WASM modules built successfully!"
echo "   Run 'npm run dev' to start the dev server."
