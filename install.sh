#!/bin/bash

# Installation script for Wan2.2 Video Generator

set -e

echo "=========================================="
echo "Installing Wan2.2 Video Generator"
echo "=========================================="
echo ""

# Check for Python
echo "Checking for Python 3.9+..."
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.9 or higher."
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
echo "✅ Found Python $PYTHON_VERSION"
echo ""

# Check for FFmpeg
echo "Checking for FFmpeg..."
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  FFmpeg is not installed."
    echo ""
    echo "Please install FFmpeg:"
    echo "  Ubuntu/Debian: sudo apt install ffmpeg"
    echo "  macOS: brew install ffmpeg"
    echo "  Windows: Download from https://ffmpeg.org/download.html"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✅ Found FFmpeg"
fi
echo ""

# Create virtual environment (optional)
echo "Creating Python virtual environment..."
read -p "Create virtual environment? (recommended) (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    python3 -m venv venv
    source venv/bin/activate
    echo "✅ Virtual environment created and activated"
else
    echo "⏭️  Skipping virtual environment"
fi
echo ""

# Install Python dependencies
echo "Installing Python dependencies..."
cd backend
pip install -r requirements.txt
cd ..
echo "✅ Python dependencies installed"
echo ""

echo "=========================================="
echo "Installation complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Edit backend/main.py and paste the Python backend code"
echo "2. Edit frontend/index.html and paste the HTML frontend code"
echo "3. Review backend/config.py and update settings as needed"
echo "4. Run: ./run.sh"
echo ""
