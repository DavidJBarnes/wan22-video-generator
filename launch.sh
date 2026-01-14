#!/bin/bash
# Stop and restart both API and UI services in tmux sessions
tmux kill-session -t wan-api 2>/dev/null; tmux kill-session -t wan-ui 2>/dev/null; tmux new-session -d -s wan-api './start-api.sh' && tmux new-session -d -s wan-ui './start-ui.sh' && echo "Services started: wan-api, wan-ui"
