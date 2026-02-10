# Wan2.2 Video Generator

A local web application for generating long-form videos using the Wan2.2 image-to-video model via ComfyUI. Since Wan2.2 is limited to ~5-second clips, this app segments longer videos and automatically stitches them together.

## CRITICAL: Runtime Environment

**This application runs on 2070.zero (remote GPU box), NOT locally.**

### Environment Variables (STRICT - NO FALLBACKS)

The following environment variables are **required**. The API will refuse to start if any are missing or point to non-existent paths:

| Variable | Path on 2070.zero | Validated in |
|----------|-------------------|--------------|
| `DATABASE_PATH` | `/home/david/projects/wan22-data/database/queue.db` | `database.py` |
| `JOB_OUTPUT_PATH` | `/home/david/projects/wan22-data/job_output` | `video_utils.py` |
| `VR_OUTPUT_PATH` | `/home/david/projects/wan22-data/vr_images` | `vr_stereo.py` |

There are **no default fallbacks**. This is intentional to prevent silent misconfiguration.

### Start Scripts

`start-api.sh` sets environment variables explicitly:
```bash
export DATABASE_PATH="${DATABASE_PATH:-/home/david/projects/wan22-data/database/queue.db}"
export JOB_OUTPUT_PATH="${JOB_OUTPUT_PATH:-/home/david/projects/wan22-data/job_output}"
export VR_OUTPUT_PATH="${VR_OUTPUT_PATH:-/home/david/projects/wan22-data/vr_images}"
```

**NEVER add fallback defaults to `database.py` or `video_utils.py`** - the strict validation prevents the app from silently using wrong paths.

## Tech Stack

- **Backend**: FastAPI (Python 3.11), SQLite database, ffmpeg
- **Frontend**: React 19, Vite, Material UI 7, React Router
- **AI Backend**: ComfyUI with Wan2.2 14B models

## System Requirements

- **ffmpeg** with `libx264` encoder (required for fade-to-black transitions)
  - Verify with: `ffmpeg -encoders | grep libx264`
  - On Ubuntu/Debian: `sudo apt install ffmpeg`
- **ffprobe** (typically included with ffmpeg)
- **Python 3.11+**
- **Node.js 18+** (for frontend)

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
│   ├── comfyui_queue.db     # SQLite database (symlink to ~/backups/)
│   ├── output/              # Generated videos (symlink to ~/backups/video_output/)
│   └── lora_previews/       # LoRA preview images (symlink to ~/backups/)
├── react-app/
│   ├── src/
│   │   ├── App.jsx          # Router setup
│   │   ├── pages/           # Dashboard, Queue, JobDetail, ImageRepo, LoraLibrary, Settings
│   │   ├── components/      # Modals, Layout, StatusChip, etc.
│   │   ├── api/client.js    # API wrapper
│   │   └── utils/helpers.js # Utilities
│   └── vite.config.js
├── start-api.sh             # Start backend in tmux
├── start-ui.sh              # Start frontend in tmux
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

## Running the Application

The application runs natively using tmux sessions for process management.

### Starting Services

```bash
# Start backend API server (in tmux session)
tmux new -s wan-api './start-api.sh'

# Start frontend UI server (in tmux session)
tmux new -s wan-ui './start-ui.sh'
```

### Managing tmux Sessions

```bash
# List running sessions
tmux ls

# Attach to a session
tmux attach -t wan-api
tmux attach -t wan-ui

# Detach from session: Ctrl+B, then D

# Kill a session
tmux kill-session -t wan-api
```

### Restarting After Code Changes

After making code changes, restart the appropriate service:

```bash
# Restart backend
tmux kill-session -t wan-api
tmux new -s wan-api './start-api.sh'

# Restart frontend
tmux kill-session -t wan-ui
tmux new -s wan-ui './start-ui.sh'
```

### Data Storage

Persistent data is stored in `~/backups/` with symlinks in `backend/`:
- `backend/comfyui_queue.db` → `~/backups/comfyui_queue.db` (SQLite database)
- `backend/output/` → `~/backups/video_output/` (generated videos)
- `backend/lora_previews/` → `~/backups/lora_previews/` (LoRA preview images)

### Setting Up a New Database

The database is automatically created when the backend starts if it doesn't exist. To set up a fresh database:

1. **Stop the backend** (if running):
   ```bash
   tmux kill-session -t wan-api
   ```

2. **Remove or rename the existing database**:
   ```bash
   # Option A: Delete completely (lose all data)
   rm ~/backups/comfyui_queue.db

   # Option B: Rename for backup
   mv ~/backups/comfyui_queue.db ~/backups/comfyui_queue.db.bak
   ```

3. **Start the backend**:
   ```bash
   tmux new -s wan-api './start-api.sh'
   ```

   The backend will automatically:
   - Create a new SQLite database with all required tables
   - Initialize default settings (ComfyUI URL, dimensions, etc.)
   - Start the queue manager (if auto_start_queue is enabled)

4. **Configure settings** via the web UI at http://localhost:3030/settings:
   - Set the ComfyUI URL (default: `http://localhost:8188`)
   - Set the image repository path
   - Adjust default video dimensions, FPS, etc.

**Note**: If you're setting up on a new machine, ensure the symlink exists first:
```bash
mkdir -p ~/backups
ln -sf ~/backups/comfyui_queue.db backend/comfyui_queue.db
```

### Ports
- Frontend: http://localhost:3030
- Backend: http://localhost:9090
- ComfyUI: Configured in Settings (default: http://localhost:8188)

## Git Guidelines

- **Never commit binary files** such as videos (.mp4, .webm), images (.jpg, .png), or other media assets
- **No personal names or explicit material** in code or commits - use generic placeholders (e.g., "Face 1", "face_01.png")

### CRITICAL: Always Resolve Merge Conflicts Before Pushing

**EVERY push must be preceded by fetching and merging main.** This is mandatory, not optional. Never push code that will create a merge conflict in the PR.

```bash
# ALWAYS run this sequence before pushing:
git fetch origin main
git merge origin/main  # If conflicts occur, resolve them NOW before pushing
git push
```

If `git merge origin/main` produces conflicts:
1. Resolve ALL conflicts in the affected files
2. Remove all conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
3. Test that the code still works
4. `git add` the resolved files
5. `git commit` the merge
6. Then `git push`

**Do NOT push and leave conflicts for the PR.** Resolve them locally first.

## Repository Rules

**NEVER commit image files to the repository.** This includes any binary image formats such as .png, .jpg, .jpeg, .gif, .webp, .bmp, .ico, .svg, etc. If images are generated or downloaded during development, they should be:
- Added to .gitignore
- Stored in a designated local-only directory
- Deleted after use if temporary

Always check `git status` before committing to ensure no image files are staged.

## Development Notes

### CRITICAL: Never Hardcode Configurable Values

**All user-configurable values must be read from the Settings system at runtime, never hardcoded.**

This applies to:
- Preset definitions (faceswap presets, encoding presets, etc.)
- Default parameter values that users can override
- Any value that appears in the Settings page

**Bad example** (hardcoded values in preset that override user settings):
```python
presets = {
    "clean_face": {
        "model": "inswapper_128",
        "maskAreas": "upper-face,lower-face,mouth",  # BAD: hardcoded, overrides Settings
    }
}
```

**Good example** (preset only defines what it needs, other values fall back to Settings):
```python
presets = {
    "clean_face": {
        "model": "inswapper_128",
        # maskAreas NOT included - will use value from Settings page
    }
}
```

**The pattern:**
1. Presets/templates should only include values that are *specific to that preset*
2. Values that users might want to change globally should be read from `get_setting()` at runtime
3. If a preset value is `None`/missing, the code should fall back to the global setting

This ensures users can control settings globally without preset definitions silently overriding their choices.

### Manual Setup (if not using startup scripts)

```bash
# Backend
cd backend
source venv/bin/activate  # or .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 9090

# Frontend
cd react-app
npm install
npm run dev -- --host 0.0.0.0 --port 3030
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

## CivitAI LoRA Downloads

When downloading LoRAs from CivitAI:
- **API Token**: `458068b9eaef12cbb8cd9c409e2a75ec`
- **Download Path**: `~/StabilityMatrix-linux-x64/Data/Packages/ComfyUI/models/loras/wan2.2`

## RIFE Frame Interpolation

Frame interpolation options in `workflow_templates.py`:
- **none**: No interpolation, 5s video at original fps
- **2x**: RIFE doubles frames, keeps original fps → 10s video (double duration)

RIFE settings (node 200):
- Model: `rife49.pth` (better quality, lower VRAM than rife47)
- `clear_cache_after_n_frames: 25` (clears RAM during processing)
- `ensemble: True` (better quality, uses more memory)

## Testing - MANDATORY Before Any Commit

**NEVER commit code, push to remote, or claim a fix works until you have verified it 100%.**

### Before Writing Any Fix

1. **Trace the FULL data flow** - Follow the value from its origin (UI, database, config) through every function call to where it's used. Don't assume you found the problem at the first place you look.

2. **Identify ALL sources** - A value might come from multiple places:
   - Database settings
   - Per-record JSON fields (e.g., `faceswap_params`)
   - Preset/template definitions
   - Hardcoded defaults in multiple files
   - Function parameter defaults

3. **Check the actual runtime behavior** - Read the code that runs at execution time, not just where defaults are defined. The bug is often in the ORDER of precedence (which source gets checked first).

### Before Committing

1. **Trace your fix through the full code path** - Manually verify that your change will actually be reached at runtime
2. **Check for other places the same pattern exists** - If you fix it in one place, search for similar patterns elsewhere
3. **Verify syntax** - Run `python -m py_compile` on changed Python files
4. **Build frontend** - Run `npm run build` if you changed JS/JSX files

### What "100% Verified" Means

- You have traced the exact code path that will execute
- You have confirmed your fix is in that code path
- You have checked there are no other code paths that bypass your fix
- You have NOT just fixed the first thing you found and hoped it works

**If you're not 100% certain, say so.** It's better to ask for help debugging than to waste time with partial fixes.

## ComfyUI Error Handling

When working with ComfyUI API calls:

1. **Always capture the full response** - Don't just check for status 200. Parse and log the complete response body, including any `error`, `node_errors`, or `exception_message` fields.

2. **Check the /history endpoint** - After queueing a job, poll /history/{prompt_id} and examine the `status` object. Failed jobs contain detailed error info here that isn't returned from the initial queue call.

3. **Log node-level errors** - ComfyUI failures are usually node-specific. The response includes which node failed and why. Always extract and display: node ID, node type, exception type, and exception message.

4. **Capture execution errors** - Check for `status.status_str == "error"` and `status.messages` which contains the execution stack trace.

5. **On any failure**, print:
   - The prompt_id
   - Which node failed (by ID and class type)
   - The full exception message
   - The inputs that were passed to that node

Example error structure to parse:
```python
history = response.json()[prompt_id]
if history.get("status", {}).get("status_str") == "error":
    for node_id, error in history.get("status", {}).get("messages", []):
        if error.get("type") == "execution_error":
            print(f"Node {node_id} ({error.get('node_type')}) failed:")
            print(f"  {error.get('exception_type')}: {error.get('exception_message')}")
```

Never report a ComfyUI job as "failed" without capturing and showing me the actual error from the API.

## git and source control
Always create a relevant git branch (fix/* or feature/*) before starting work. Name branches descriptively, like feature/video-chaining or fix/queue-persistence. Commit with clear messages and push to remote when a task is complete.
## Remote Access Rules
- NEVER access 2070.zero (SSH, curl, or any network access) without explicit user permission
- The application is deployed on 2070.zero, but all code changes and testing should be done locally
- If remote access is needed, ask the user first

