#!/bin/bash
# Stop and restart both API and UI services in tmux sessions

# Kill existing sessions (suppress errors if they don't exist)
tmux kill-session -t wan-api 2>/dev/null
tmux kill-session -t wan-ui 2>/dev/null

# Start new sessions
tmux new-session -d -s wan-api './start-api.sh' && \
tmux new-session -d -s wan-ui './start-ui.sh' && \
echo "Services started: wan-api, wan-ui"
