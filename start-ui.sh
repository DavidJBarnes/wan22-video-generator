#!/bin/bash
# Start the Wan2.2 Video Generator UI server
# Usage: ./start-ui.sh
# Or in tmux: tmux new -s wan-ui './start-ui.sh'

cd "$(dirname "$0")/react-app"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start Vite dev server
exec npm run dev -- --host 0.0.0.0 --port 3030
