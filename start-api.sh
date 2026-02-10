#!/bin/bash
# Start the Wan2.2 Video Generator API server
# Usage: ./start-api.sh
# Or in tmux: tmux new -s wan-api './start-api.sh'

cd "$(dirname "$0")/backend"

# Activate Python environment
# Try venv first, then conda/miniconda
if [ -d "venv" ]; then
    source venv/bin/activate
elif [ -d ".venv" ]; then
    source .venv/bin/activate
elif [ -f "$HOME/miniconda3/etc/profile.d/conda.sh" ]; then
    source "$HOME/miniconda3/etc/profile.d/conda.sh"
    conda activate base
elif [ -f "$HOME/anaconda3/etc/profile.d/conda.sh" ]; then
    source "$HOME/anaconda3/etc/profile.d/conda.sh"
    conda activate base
fi

# =============================================================================
# Environment variables - ALL REQUIRED PATHS
# =============================================================================
export DATABASE_PATH="${DATABASE_PATH:-/home/david/projects/wan22-data/database/queue.db}"
export JOB_OUTPUT_PATH="${JOB_OUTPUT_PATH:-/home/david/projects/wan22-data/job_output}"
export UPSCALE_SAVE_PATH="${UPSCALE_SAVE_PATH:-/home/david/projects/wan22-data/upscaled_videos}"
export LORA_PREVIEW_PATH="${LORA_PREVIEW_PATH:-/home/david/projects/wan22-data/lora_previews}"
export THUMBNAIL_CACHE_PATH="${THUMBNAIL_CACHE_PATH:-/home/david/projects/wan22-data/thumbnail_cache}"
export VR_OUTPUT_PATH="${VR_OUTPUT_PATH:-/home/david/projects/wan22-data/vr_images}"

# Log the paths being used (helpful for debugging)
echo "=== Wan2.2 Video Generator API ==="
echo "DATABASE_PATH:       $DATABASE_PATH"
echo "JOB_OUTPUT_PATH:     $JOB_OUTPUT_PATH"
echo "UPSCALE_SAVE_PATH:   $UPSCALE_SAVE_PATH"
echo "LORA_PREVIEW_PATH:   $LORA_PREVIEW_PATH"
echo "THUMBNAIL_CACHE_PATH: $THUMBNAIL_CACHE_PATH"
echo "VR_OUTPUT_PATH:      $VR_OUTPUT_PATH"
echo "=================================="

# Verify critical paths exist
if [ ! -f "$DATABASE_PATH" ]; then
    echo "WARNING: Database file not found at $DATABASE_PATH"
    echo "A new database will be created on first run."
fi

if [ ! -d "$JOB_OUTPUT_PATH" ]; then
    echo "Creating job output directory: $JOB_OUTPUT_PATH"
    mkdir -p "$JOB_OUTPUT_PATH"
fi

if [ ! -d "$VR_OUTPUT_PATH" ]; then
    echo "Creating VR output directory: $VR_OUTPUT_PATH"
    mkdir -p "$VR_OUTPUT_PATH"
fi

# Start uvicorn (log-level warning to reduce noise)
exec uvicorn main:app --host 0.0.0.0 --port 9090 --log-level warning
