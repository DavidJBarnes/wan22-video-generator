# Wan2.2 Video Generator

A local web application for generating long-form videos using the Wan2.2 image-to-video model via ComfyUI. Since Wan2.2 is limited to ~5-second clips, this app segments longer videos and automatically stitches them together.

## Tech Stack

- **Backend**: FastAPI (Python 3.11), SQLite database, ffmpeg
- **Frontend**: React 19, Vite, Material UI 7, React Router
- **Orchestration**: Docker Compose
- **AI Backend**: ComfyUI with Wan2.2 14B models

## Project Structure

```
wan22-video-generator/
├── backend/
│   ├── main.py              # FastAPI app entry point
│   ├── routes.py            # REST API endpoints
│   ├── database.py          # SQLite schema and operations
│   ├── queue_manager.py     # Background job processing
│   ├── comfyui_client.py    # ComfyUI API wrapper
│   ├── workflow_templates.py # Pre-converted Wan2.2 workflows
│   ├── video_utils.py       # ffmpeg operations (stitch, extract frames)
│   ├── config.py            # Default configuration constants
│   └── output/              # Generated videos and frames
├── react-app/
│   ├── src/
│   │   ├── App.jsx          # Router setup
│   │   ├── pages/           # Dashboard, Queue, JobDetail, ImageRepo, LoraLibrary, Settings
│   │   ├── components/      # Modals, Layout, StatusChip, etc.
│   │   ├── api/client.js    # API wrapper
│   │   └── utils/helpers.js # Utilities
│   └── vite.config.js
├── docker-compose.yml
└── CLAUDE.md
```

## Key Concepts

### On-Demand Segment Workflow

Jobs are processed segment-by-segment. After each segment completes, the job pauses at `awaiting_prompt` status for the user to:
1. Submit the next segment's prompt, OR
2. Finalize and merge all completed segments

This allows interactive, iterative video creation where each segment can have different prompts and LoRAs.

### Job Status Lifecycle

```
pending → running → awaiting_prompt → running → ... → awaiting_prompt → completed
                                                                     ↘ failed
```

### Segment Processing

1. Determine start image (job input for seg 0, previous segment's last frame for others)
2. Wait for ComfyUI queue to be idle
3. Build and submit Wan2.2 i2v workflow
4. Poll for completion (10 min timeout)
5. Download video, extract last frame, upload frame back to ComfyUI
6. Update segment with video_path and end_frame_url

## Database Schema

**jobs**: id, name, status, prompt, negative_prompt, parameters (JSON), input_image, output_images (JSON), error_message, timestamps

**job_segments**: id, job_id, segment_index, status, prompt, start_image_url, end_frame_url, video_path, high_lora, low_lora, execution_time

**settings**: key-value store for configuration

**lora_library**: cached LoRA metadata with grouped high/low variants

**image_ratings**: user ratings for images in repository

## API Endpoints

### Jobs
- `GET /api/jobs` - List all jobs
- `POST /api/jobs` - Create job (creates first segment)
- `GET /api/jobs/{id}` - Get job with segment counts
- `PUT /api/jobs/{id}` - Update job (pending only)
- `DELETE /api/jobs/{id}` - Delete job
- `POST /api/jobs/{id}/cancel` - Cancel pending job
- `POST /api/jobs/{id}/retry` - Retry failed job (preserves completed segments)
- `POST /api/jobs/{id}/finalize` - Stitch segments into final video
- `POST /api/jobs/{id}/reopen` - Add more segments to completed job
- `GET /api/jobs/{id}/video` - Download final video

### Segments
- `GET /api/jobs/{id}/segments` - List segments
- `POST /api/jobs/{id}/segments/{idx}/prompt` - Submit segment prompt (triggers processing)
- `DELETE /api/jobs/{id}/segments/{idx}` - Delete last segment

### Queue
- `GET /api/queue/status` - Queue and ComfyUI status
- `POST /api/queue/start` - Start background queue
- `POST /api/queue/stop` - Stop background queue

### Settings, LoRAs, Image Repository
See `routes.py` for full API documentation.

## ComfyUI Integration

### Workflow Template
Pre-converted Wan2.2 i2v workflow stored in `workflow_templates.py`. Key nodes:
- Node 97 (LoadImage): input image filename
- Node 93/89 (CLIPTextEncode): positive/negative prompts
- Node 98 (WanImageToVideo): dimensions, frames, FPS
- Node 95/96 (UNETLoader): high/low noise models
- Node 118/119 (LoraLoader): high/low noise LoRAs

### Two-Pass Sampling
- First pass (high noise): steps 0→10, add noise
- Second pass (low noise): steps 10→10000, use leftover noise

## Docker Setup

```bash
# Start services
docker compose up -d

# Rebuild after code changes
docker compose up -d --build

# View logs
docker compose logs -f backend
```

### Volumes
- `~/backups/comfyui_queue.db:/app/comfyui_queue.db` - Persistent database
- Host image directories mounted with `:z` flag (SELinux/Fedora)

### Ports
- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- ComfyUI: Configured in Settings (default: http://localhost:8188)

## Development Notes

### Running Locally (without Docker)

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd react-app
npm install
npm run dev
```

### Key Files to Modify

| Task | File(s) |
|------|---------|
| Add new API endpoint | `routes.py` |
| Change job processing logic | `queue_manager.py` |
| Modify workflow parameters | `workflow_templates.py` |
| Add new settings | `database.py`, `routes.py`, `Settings.jsx` |
| Change video naming | `video_utils.py` |

### Video Output Naming

- Segments from ComfyUI: `{JobName}_seg{N}_00001.mp4`
- Final stitched video: `{JobName}_00001.mp4`

Filenames are sanitized (spaces → underscores, special chars removed).

### Error Recovery

- **Backend restart**: `reset_orphaned_running_jobs()` checks video files exist, resets incomplete segments
- **Segment failure**: Job marked failed, user can retry (preserves completed segments)
- **ComfyUI busy**: Queue manager waits up to 30 min before timeout

## Frontend Pages

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/` | Job overview, status counts, real-time updates |
| Queue | `/queue` | Full job list, create new jobs |
| JobDetail | `/job/:id` | Segment management, prompt submission, finalization |
| ImageRepo | `/images` | Browse/rate local images, upload to ComfyUI |
| LoraLibrary | `/loras` | View/edit LoRA metadata |
| Settings | `/settings` | Configure ComfyUI URL, defaults, paths |

## Common Workflows

### Create a Job
1. Click "Create Job" in Queue page
2. Upload or select starting image
3. Enter prompt, configure dimensions/FPS
4. Optionally select LoRA
5. Submit → job starts processing segment 0

### Add More Segments
1. Wait for job to reach `awaiting_prompt`
2. In JobDetail, click "Submit Prompt" for next segment
3. Enter prompt, optionally change LoRA
4. Submit → processing resumes

### Finalize Job
1. All desired segments completed
2. Click "Finalize & Merge"
3. Backend stitches videos with ffmpeg (no re-encoding)
4. Download final video

### Retry Failed Job
1. Job shows as `failed`
2. Click "Retry" → resets failed segments, keeps completed ones
3. Re-submit prompts for failed segments

## Configuration

Settings stored in SQLite `settings` table, editable via Settings page:

| Setting | Description |
|---------|-------------|
| `comfyui_url` | ComfyUI server address |
| `default_width/height` | Default video dimensions |
| `default_fps` | Frames per second |
| `segment_duration` | Seconds per segment |
| `high_noise_model` | UNET model for first pass |
| `low_noise_model` | UNET model for second pass |
| `image_repo_path` | Local image repository directory |
| `auto_start_queue` | Start queue on backend startup |
