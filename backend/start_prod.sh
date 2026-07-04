#!/bin/bash
cd "$(dirname "$0")"

echo "==========================================="
echo "  Video Subtitle Remover AI Backend API"
echo "             (PRODUCTION MODE)"
echo "==========================================="

if [ ! -d "venv" ]; then
    echo "Virtual environment not found! Please run start_backend.sh first to install."
    exit 1
fi

source venv/bin/activate

# Required for Apple Silicon GPU acceleration on unsupported 3D operators
export PYTORCH_ENABLE_MPS_FALLBACK=1

# Use $PORT environment variable if defined (for PaaS like Heroku/Render), fallback to 8000
PORT="${PORT:-8000}"

echo "Starting Production FastAPI Server on port $PORT..."
# Using gunicorn with Uvicorn workers for production stability, or just uvicorn without --reload
# Since we spawn heavy ML processes via subprocess, a single worker is safer to prevent OOM
uvicorn api:app --host 0.0.0.0 --port $PORT
