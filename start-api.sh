#!/bin/bash
# Start the Wan2.2 Video Generator API server
# Usage: ./start-api.sh
# Or in tmux: tmux new -s wan-api './start-api.sh'

cd "$(dirname "$0")/backend"

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
elif [ -d ".venv" ]; then
    source .venv/bin/activate
fi

# Environment variables
export DATABASE_PATH="${DATABASE_PATH:-/home/david/projects/wan22-data/database/queue.db}"
export UPSCALE_SAVE_PATH="${UPSCALE_SAVE_PATH:-/home/david/projects/wan22-data/upscaled_videos}"

# Start uvicorn
exec uvicorn main:app --host 0.0.0.0 --port 9090
