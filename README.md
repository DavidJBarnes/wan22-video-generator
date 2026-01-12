# Wan2.2 Video Generator

A local web application for generating long-form videos using the Wan2.2 image-to-video model via ComfyUI. Since Wan2.2 is limited to ~5-second clips, this app segments longer videos and automatically stitches them together.

## Prerequisites

- **Python 3.11+** - For the backend API
- **Node.js 18+** - For the React frontend
- **ComfyUI** - Running with Wan2.2 models installed
- **ffmpeg** - For video processing (must be in PATH)
- **tmux** - For process management

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd wan22-video-generator
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Frontend Setup

```bash
cd react-app

# Install dependencies
npm install
```

### 4. Directory Setup

Create the required directories and symlinks for persistent storage:

```bash
# Create backup directories
mkdir -p ~/backups/video_output
mkdir -p ~/backups/lora_previews

# Create symlinks in backend/
cd backend
ln -sf ~/backups/comfyui_queue.db comfyui_queue.db
ln -sf ~/backups/video_output output
ln -sf ~/backups/lora_previews lora_previews
```

## Database Setup

The SQLite database is automatically created when the backend starts. No manual setup required.

### Database Location

By default, the database is stored at `backend/comfyui_queue.db`. You can override paths with environment variables:

```bash
# Set custom database path
export DATABASE_PATH=/path/to/your/database.db

# Set custom LoRA preview thumbnails path
export LORA_PREVIEW_PATH=/path/to/lora_thumbnails

# Set custom video output path
export JOB_OUTPUT_PATH=/path/to/videos

# Or inline when starting
DATABASE_PATH=/path/to/db.db JOB_OUTPUT_PATH=/path/to/videos ./start-api.sh
```

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `DATABASE_PATH` | `backend/comfyui_queue.db` | SQLite database location |
| `LORA_PREVIEW_PATH` | `backend/lora_previews/` | LoRA thumbnail images |
| `JOB_OUTPUT_PATH` | `backend/output/` | Generated video segments and final videos |
| `THUMBNAIL_CACHE_PATH` | `backend/thumbnail_cache/` | Cached image thumbnails |

### Fresh Database Setup

To create a new database (or reset an existing one):

```bash
# 1. Stop the backend if running
tmux kill-session -t wan-api

# 2. Remove or backup existing database
rm ~/backups/comfyui_queue.db
# Or backup: mv ~/backups/comfyui_queue.db ~/backups/comfyui_queue.db.bak

# 3. Start the backend - database will be created automatically
tmux new -s wan-api './start-api.sh'
```

The backend will automatically:
- Create all required tables (jobs, job_segments, settings, lora_library, image_ratings, etc.)
- Initialize default settings
- Start the queue manager (if auto_start_queue is enabled)

### Database Tables

| Table | Purpose |
|-------|---------|
| `jobs` | Video generation jobs with status, prompts, parameters |
| `job_segments` | Individual segments within each job |
| `settings` | Application configuration (key-value store) |
| `lora_library` | Cached LoRA metadata |
| `image_ratings` | User ratings for images in the repository |
| `uploaded_images` | Tracks images uploaded to ComfyUI (deduplication) |
| `job_logs` | Activity logs for debugging |

## Configuration

### Application Settings

Settings are stored in the database and configurable via the web UI at `/settings`:

| Setting | Default | Description |
|---------|---------|-------------|
| `comfyui_url` | `http://localhost:8188` | ComfyUI server address |
| `default_width` | `512` | Default video width in pixels |
| `default_height` | `768` | Default video height in pixels |
| `default_fps` | `16` | Frames per second |
| `image_repo_path` | (empty) | Local directory containing source images |
| `image_repo_url` | (empty) | URL prefix for serving images |
| `auto_start_queue` | `true` | Start queue manager on backend startup |

### Model Configuration

Edit `backend/config.py` to configure the Wan2.2 models:

```python
MODELS = {
    "high_noise": "wan22RemixT2VI2V_i2vHighV20.safetensors",
    "low_noise": "wan22RemixT2VI2V_i2vLowV20.safetensors",
    "vae": "wan_2.1_vae.safetensors",
    "text_encoder": "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
}
```

### Directory Paths

| Path | Description |
|------|-------------|
| `backend/output/` | Generated video segments and final stitched videos |
| `backend/lora_previews/` | LoRA preview images |
| `image_repo_path` (setting) | Source images for video generation |

## Running the Application

### Start Services

```bash
# Start backend API server (in tmux)
tmux new -s wan-api './start-api.sh'

# Start frontend UI server (in a new terminal)
tmux new -s wan-ui './start-ui.sh'
```

### Access Points

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3030 |
| Backend API | http://localhost:9090 |
| API Docs | http://localhost:9090/docs |

### Managing tmux Sessions

```bash
# List sessions
tmux ls

# Attach to a session
tmux attach -t wan-api

# Detach from session: Ctrl+B, then D

# Kill a session
tmux kill-session -t wan-api
```

### Restart After Code Changes

```bash
# Restart backend
tmux kill-session -t wan-api && tmux new -s wan-api './start-api.sh'

# Restart frontend
tmux kill-session -t wan-ui && tmux new -s wan-ui './start-ui.sh'
```

## ComfyUI Requirements

### Required Models

Download and place in your ComfyUI models directory:

**UNET Models** (`models/unet/`):
- `wan22RemixT2VI2V_i2vHighV20.safetensors` (high noise pass)
- `wan22RemixT2VI2V_i2vLowV20.safetensors` (low noise pass)

**VAE** (`models/vae/`):
- `wan_2.1_vae.safetensors`

**Text Encoder** (`models/text_encoders/`):
- `umt5_xxl_fp8_e4m3fn_scaled.safetensors`

### ComfyUI Startup

For optimal memory management with Wan2.2:

```bash
python3 main.py --listen --port 8188 --cache-none
```

The `--cache-none` flag prevents RAM accumulation between jobs.

## How It Works

### Segments

A **segment** is a short video clip generated by ComfyUI (typically ~5 seconds).

To create longer videos:
1. User provides a starting image and prompt
2. ComfyUI generates a ~5 second clip
3. The app extracts the last frame as the starting image for the next segment
4. User provides a new prompt (or reuses the previous one)
5. Process repeats until all segments are complete
6. ffmpeg stitches all segments into the final video

### Job Status Lifecycle

```
pending → running → awaiting_prompt → running → ... → awaiting_prompt → completed
                                                                     ↘ failed
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/jobs` | List all jobs |
| POST | `/api/jobs` | Create a new job |
| GET | `/api/jobs/{id}` | Get job details |
| DELETE | `/api/jobs/{id}` | Delete a job |
| POST | `/api/jobs/{id}/finalize` | Stitch segments into final video |
| GET | `/api/jobs/{id}/segments` | List job segments |
| POST | `/api/jobs/{id}/segments/{idx}/prompt` | Submit segment prompt |
| GET | `/api/queue/status` | Get queue and ComfyUI status |
| POST | `/api/queue/start` | Start the queue manager |
| POST | `/api/queue/stop` | Stop the queue manager |
| GET | `/api/settings` | Get all settings |
| PUT | `/api/settings` | Update settings |
| GET | `/health` | Health check |

Full API documentation available at `/docs` when the backend is running.

## Troubleshooting

### Database Issues

**Corrupted database**: Remove and restart (will recreate):
```bash
rm ~/backups/comfyui_queue.db
tmux kill-session -t wan-api && tmux new -s wan-api './start-api.sh'
```

**Missing symlink**:
```bash
ln -sf ~/backups/comfyui_queue.db backend/comfyui_queue.db
```

### Connection Issues

**ComfyUI not connecting**: Verify the URL in Settings matches your ComfyUI server.

**Frontend can't reach backend**: Ensure backend is running on port 9090.

### Memory Issues

If ComfyUI runs out of memory:
1. Use `--cache-none` flag when starting ComfyUI
2. Reduce video dimensions in Settings
3. Restart ComfyUI between large jobs

## Project Structure

```
wan22-video-generator/
├── backend/
│   ├── main.py              # FastAPI entry point
│   ├── routes.py            # API endpoints
│   ├── database.py          # SQLite schema and operations
│   ├── queue_manager.py     # Background job processing
│   ├── comfyui_client.py    # ComfyUI API wrapper
│   ├── config.py            # Default configuration
│   ├── video_utils.py       # ffmpeg operations
│   └── workflow_templates.py # Wan2.2 workflow templates
├── react-app/
│   ├── src/
│   │   ├── pages/           # Dashboard, Queue, JobDetail, etc.
│   │   └── components/      # Reusable UI components
│   └── vite.config.js
├── start-api.sh             # Backend startup script
├── start-ui.sh              # Frontend startup script
├── CLAUDE.md                # Detailed developer documentation
└── README.md                # This file
```
