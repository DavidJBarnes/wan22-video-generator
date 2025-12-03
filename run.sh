#!/bin/bash

# Quick run script for Wan2.2 Video Generator

echo "Starting Wan2.2 Video Generator..."
echo ""

# Check if backend code has been added
if grep -q "PASTE THE PYTHON BACKEND CODE HERE" backend/main.py; then
    echo "❌ ERROR: backend/main.py still contains placeholder text"
    echo "Please edit backend/main.py and paste the Python backend code"
    exit 1
fi

# Check if frontend code has been added
if grep -q "PASTE THE HTML FRONTEND CODE HERE" frontend/index.html; then
    echo "❌ ERROR: frontend/index.html still contains placeholder text"
    echo "Please edit frontend/index.html and paste the HTML frontend code"
    exit 1
fi

# Start backend
echo "🚀 Starting backend on http://localhost:8000"
cd backend
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

echo "Backend PID: $BACKEND_PID"
echo ""
echo "✅ Backend started successfully!"
echo ""
echo "📱 Frontend options:"
echo "   1. Open frontend/index.html directly in your browser"
echo "   2. Or run: cd frontend && python -m http.server 3000"
echo ""
echo "Press Ctrl+C to stop the backend"

# Wait for Ctrl+C
trap "kill $BACKEND_PID; exit" INT
wait $BACKEND_PID
