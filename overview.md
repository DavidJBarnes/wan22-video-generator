# Wan2.2 Video Generator - Project Overview

## What Is This?

The **Wan2.2 Video Generator** is a local web application that transforms still images into long-form AI-generated videos. It solves a fundamental limitation: the Wan2.2 AI model can only generate ~5-second clips. This app breaks longer videos into segments, generates each one, and automatically stitches them together into seamless final videos.

Think of it as a video production pipeline where you provide a starting image and prompts, and the AI creates animated sequences that you can extend indefinitely, one segment at a time.

---

## The Problem We Solved

**Wan2.2** is a state-of-the-art image-to-video model that produces remarkably coherent motion from a single image. However, it has hard constraints:

1. **Duration limit**: ~5 seconds per generation
2. **Memory intensive**: Requires 24GB+ VRAM
3. **No native continuity**: Each generation is independent

Our solution creates an orchestration layer that:
- Chains segments together using the last frame of each clip as the starting image for the next
- Queues and manages jobs across a remote GPU server
- Provides an interactive workflow where users can guide each segment's direction
- Handles all the ffmpeg stitching automatically

---

## How It Works (Non-Technical)

### The Workflow

1. **Start with an image** - Upload or select a photo/artwork
2. **Write a prompt** - Describe the motion you want ("camera slowly zooms in as wind blows through hair")
3. **Generate segment 0** - The AI creates a 5-second video
4. **Review and continue** - Watch the result, then submit a prompt for the next segment
5. **Repeat** - Add as many segments as you want, each building on the previous
6. **Finalize** - Click merge and get your complete video

### Key Concepts

| Term | Meaning |
|------|---------|
| **Job** | A complete video project (can have many segments) |
| **Segment** | A single 5-second clip within a job |
| **Awaiting Prompt** | The job is paused, waiting for you to describe the next segment |
| **LoRA** | A fine-tuned style or character that modifies how the AI generates video |
| **Two-Pass Sampling** | A quality technique using two different models for better results |

### The Interface

- **Dashboard** - Overview of all your jobs and their statuses
- **Queue** - Create new jobs, see what's processing
- **Job Detail** - Manage segments, submit prompts, watch progress
- **Videos** - Gallery of completed work
- **Image Repository** - Browse and rate your source images
- **LoRA Library** - Manage AI style/character modifiers
- **Settings** - Configure defaults and connections

---

## Architecture (Technical)

### System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        User's Machine                            │
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │  React Frontend │◄──►│ FastAPI Backend │                     │
│  │   (Port 3030)   │    │   (Port 8000)   │                     │
│  └─────────────────┘    └────────┬────────┘                     │
│         Docker Compose           │                               │
└──────────────────────────────────┼───────────────────────────────┘
                                   │ HTTP + WebSocket
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                     GPU Server (3090.zero)                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    ComfyUI (Port 8188)                      ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ ││
│  │  │ Wan2.2 14B  │  │    RIFE     │  │    LoRA Models      │ ││
│  │  │   Models    │  │ Interpolate │  │  (Style/Character)  │ ││
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────┘│
│                    RTX 3090 (24GB VRAM)                          │
└─────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React 19, Vite, Material UI 7 | User interface |
| **Backend** | FastAPI, Python 3.11 | API, job orchestration |
| **Database** | SQLite | Job/segment/settings persistence |
| **Video Processing** | ffmpeg | Frame extraction, video stitching |
| **AI Inference** | ComfyUI + Wan2.2 | Video generation |
| **Deployment** | Docker Compose | Container orchestration |

### Database Schema

```sql
jobs
├── id, name, status, prompt, negative_prompt
├── parameters (JSON: dimensions, fps, models)
├── input_image, output_images (JSON)
└── created_at, started_at, completed_at

job_segments
├── id, job_id, segment_index, status
├── prompt, start_image_url, end_frame_url
├── video_path, high_lora, low_lora
└── execution_time, notes, fade_to_black

settings (key-value store)
lora_library (cached LoRA metadata)
image_ratings (user ratings)
job_logs (error tracking)
```

### Job State Machine

```
                    ┌──────────────────────────────────────┐
                    ▼                                      │
pending ──► running ──► awaiting_prompt ──► running ──► ... ──► completed
              │              │                                     ▲
              │              │         ┌───────────────────────────┘
              ▼              ▼         │
           failed ◄──── (error) ──► retry (preserves completed segments)
              │
              ▼
           paused (manual)
```

### Segment Processing Flow

```
1. Determine start image
   ├── Segment 0: Job's input image
   └── Segment N: Previous segment's last frame (or custom image)

2. Wait for ComfyUI idle (30-min timeout)

3. Build workflow
   ├── Inject image URL (Node 97)
   ├── Set prompts (Nodes 93/89)
   ├── Configure dimensions/FPS (Node 98)
   └── Apply LoRAs (Nodes 118/119)

4. Submit to ComfyUI
   └── Track progress via WebSocket

5. On completion
   ├── Download video from ComfyUI
   ├── Extract last frame (ffmpeg)
   ├── Upload frame back to ComfyUI
   └── Update segment record

6. Transition job to awaiting_prompt
```

### Two-Pass Sampling

The Wan2.2 workflow uses a dual-model approach for quality:

```
Pass 1 (High Noise Model)
├── Steps: 0 → 10
├── Add noise: true
└── Purpose: Establish broad motion/structure

Pass 2 (Low Noise Model)
├── Steps: 10 → 10000
├── Use leftover noise
└── Purpose: Refine details, smooth motion
```

Each pass can use different LoRAs for fine-tuned control.

### API Structure

**60+ endpoints organized by domain:**

| Domain | Key Endpoints |
|--------|---------------|
| Jobs | `GET/POST/PUT/DELETE /api/jobs`, `/jobs/{id}/cancel`, `/jobs/{id}/retry`, `/jobs/{id}/finalize` |
| Segments | `GET /api/jobs/{id}/segments`, `POST /segments/{idx}/prompt`, `DELETE /segments/{idx}` |
| Queue | `GET /api/queue/status`, `POST /api/queue/start`, `POST /api/queue/stop` |
| LoRAs | `GET /api/loras/library`, `POST /api/loras/fetch`, `PUT /api/loras/{name}` |
| Images | `GET /api/images/browse`, `POST /api/images/rating`, `POST /api/upload/image` |
| Settings | `GET/PUT /api/settings` |

### Key Files

| File | Lines | Responsibility |
|------|-------|----------------|
| `backend/routes.py` | ~1900 | All API endpoints |
| `backend/queue_manager.py` | ~1150 | Background job processing |
| `backend/database.py` | ~1950 | SQLite operations, recovery |
| `backend/comfyui_client.py` | ~670 | ComfyUI API wrapper |
| `backend/workflow_templates.py` | ~480 | Wan2.2 workflow definition |
| `react-app/src/pages/JobDetail.jsx` | ~1200 | Segment management UI |

---

## Notable Features

### 1. Interactive Segment Workflow
Jobs pause at `awaiting_prompt` between segments. This allows:
- Different prompts per segment (scene changes)
- Different LoRAs per segment (style shifts)
- Review before continuing
- Branching narratives

### 2. Custom Start Images
Segment 0 uses the job's input image, but subsequent segments can:
- Use the previous segment's last frame (default continuity)
- Use a custom image from the repository
- Allow creative scene transitions

### 3. Real-Time Progress Tracking
WebSocket connection to ComfyUI provides:
- Current step / total steps
- Which node is executing
- ETA calculations
- Live elapsed time

### 4. Automatic Recovery
On backend restart:
- Orphaned running jobs are detected
- Completed segments are recovered from ComfyUI
- Failed segments are reset for retry
- No work is lost

### 5. LoRA Management
- Automatic pairing of high/low noise variants
- CivitAI preview image caching
- Hide/show in UI
- Custom display names

### 6. Video Stitching
ffmpeg concatenation with:
- No re-encoding (fast)
- Web optimization (faststart flag)
- Automatic output naming

---

## Memory & Performance Considerations

### Known Issues

**Wan2.2 + RIFE RAM Leak**: Without mitigation, ~30GB RAM accumulates between jobs.

**Mitigations in place:**
1. `--cache-none` ComfyUI flag
2. RIFE `clear_cache_after_n_frames: 25`

**Additional options if needed:**
- ComfyUI `/free` endpoint between jobs
- Periodic ComfyUI restarts
- ComfyUI-Unload-Model plugin

### Timeouts

| Operation | Default | Purpose |
|-----------|---------|---------|
| Segment execution | 10-20 min | Single segment generation |
| ComfyUI idle wait | 30 min | Wait for queue to clear |
| Queue poll interval | 3 sec | Check job status |

---

## Development Quick Reference

### Running Locally

```bash
# With Docker (recommended)
docker compose up -d --build

# Without Docker
cd backend && uvicorn main:app --reload --port 8000
cd react-app && npm run dev
```

### After Code Changes

```bash
docker compose up -d --build  # REQUIRED for changes to take effect
```

### Useful Commands

```bash
# View backend logs
docker compose logs -f backend

# Check ComfyUI status
ssh david@3090.zero "systemctl status comfyui"

# Check GPU memory
ssh david@3090.zero "nvidia-smi"

# Restart ComfyUI
ssh david@3090.zero "sudo systemctl restart comfyui"
```

---

## Current State

**Branch**: `feature/44-custom-segment-start-image`

**Recent additions:**
- Custom start image selection for segments
- Average run time dashboard card
- Segment notes and fade-to-black settings
- Video gallery with shuffle mode

**Stable features:**
- Full job lifecycle management
- Multi-segment video generation
- LoRA integration
- Image repository with ratings
- Real-time progress tracking
- Error recovery and retry

---

## Design Philosophy

1. **Iterative creation**: Users guide each segment rather than batch-processing
2. **Graceful degradation**: Works even when ComfyUI is offline
3. **Recovery-first**: All state is persisted; nothing is lost on crashes
4. **Minimal re-encoding**: ffmpeg concatenation preserves quality
5. **Local-first**: No cloud dependencies, runs entirely on local network

---

## Questions for Future Development

When extending this system, consider:

1. **Branching**: Should users be able to create multiple "paths" from a single segment?
2. **Templates**: Should common prompt patterns be saveable?
3. **Batch processing**: Should there be a mode that auto-continues without awaiting_prompt?
4. **Audio**: Should audio tracks be integratable?
5. **Upscaling**: Should post-generation upscaling be added to the pipeline?

---

*This document provides context for understanding the Wan2.2 Video Generator codebase. For detailed implementation specifics, see CLAUDE.md.*
