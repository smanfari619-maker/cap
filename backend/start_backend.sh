#!/bin/bash
cd "$(dirname "$0")"

echo "==========================================="
echo "  Video Subtitle Remover AI Backend API"
echo "==========================================="

if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate

echo "Installing requirements..."
pip install --default-timeout=1000 -r requirements.txt
# Remove paddleocr if it fails, since we patched it out
pip uninstall -y paddleocr || true

echo "Starting FastAPI Server on http://localhost:8000..."
export PYTORCH_ENABLE_MPS_FALLBACK=1
uvicorn api:app --host 0.0.0.0 --port 8000
