"""ComfyUI Queue Manager - Main Application Entry Point."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from database import (
    init_db, get_setting, reset_orphaned_running_jobs,
    get_segments_needing_recovery, update_segment_status,
    update_segment_start_image, update_job_status
)
from routes import router
from queue_manager import queue_manager
from comfyui_client import ComfyUIClient
from video_utils import download_video_from_comfyui, extract_last_frame, get_segment_video_path, get_segment_frame_path


def recover_segment_from_comfyui(segment: dict, client: ComfyUIClient, comfyui_url: str):
    """Recover a segment that completed in ComfyUI but wasn't processed.

    Downloads the video, extracts the last frame, uploads to ComfyUI, and updates the database.
    """
    job_id = segment["job_id"]
    segment_index = segment["segment_index"]
    prompt_id = segment["comfyui_prompt_id"]
    job_name = segment["job_name"]

    print(f"[Recovery] Recovering segment {segment_index} of job {job_id} ({job_name})")

    # Get output media from ComfyUI
    media_urls = client.get_output_images(prompt_id)
    video_url = None
    for url in media_urls:
        if any(ext in url.lower() for ext in ['.mp4', '.webm', '.gif']):
            video_url = url
            break

    if not video_url:
        print(f"[Recovery] No video output found for segment {segment_index} of job {job_id}")
        update_segment_status(job_id, segment_index, "failed", error_message="Recovery failed: no video in ComfyUI output")
        return False

    # Download the video
    video_path = get_segment_video_path(job_id, segment_index)
    print(f"[Recovery] Downloading video from {video_url} to {video_path}")
    if not download_video_from_comfyui(video_url, video_path):
        print(f"[Recovery] Failed to download video for segment {segment_index} of job {job_id}")
        update_segment_status(job_id, segment_index, "failed", error_message="Recovery failed: video download failed")
        return False

    # Extract last frame
    frame_path = get_segment_frame_path(job_id, segment_index, "last")
    print(f"[Recovery] Extracting last frame to {frame_path}")
    if not extract_last_frame(video_path, frame_path):
        print(f"[Recovery] Failed to extract last frame for segment {segment_index} of job {job_id}")
        update_segment_status(job_id, segment_index, "failed", error_message="Recovery failed: frame extraction failed")
        return False

    # Upload last frame to ComfyUI
    with open(frame_path, "rb") as f:
        frame_data = f.read()

    uploaded_filename = client.upload_image(frame_data, f"job_{job_id}_seg_{segment_index}_last.jpg")
    if not uploaded_filename:
        print(f"[Recovery] Failed to upload last frame for segment {segment_index} of job {job_id}")
        update_segment_status(job_id, segment_index, "failed", error_message="Recovery failed: frame upload failed")
        return False

    # Build end frame URL
    end_frame_url = f"{comfyui_url}/view?filename={uploaded_filename}&subfolder=&type=input"

    # Get execution time
    exec_time = client.get_execution_time(prompt_id)

    # Update segment as completed
    update_segment_status(
        job_id, segment_index, "completed",
        video_path=video_path,
        end_frame_url=end_frame_url,
        execution_time=exec_time
    )

    # Update next segment's start image
    update_segment_start_image(job_id, segment_index + 1, end_frame_url)

    exec_time_str = f"{exec_time:.1f}s" if exec_time else "unknown"
    print(f"[Recovery] Successfully recovered segment {segment_index} of job {job_id} (execution_time={exec_time_str})")
    return True


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown."""
    # Startup
    print("Initializing ComfyUI Queue Manager...")

    # Initialize database
    init_db()
    print("Database initialized")

    # Create ComfyUI client for startup checks
    comfyui_url = get_setting("comfyui_url", "http://localhost:8188")
    client = ComfyUIClient(comfyui_url)

    # Check ComfyUI connection
    connected, msg = client.check_connection()
    if connected:
        print(f"ComfyUI connected: {comfyui_url}")
    else:
        print(f"ComfyUI not available: {msg} - recovery will be limited")

    # Reset any orphaned running jobs/segments from previous backend instance
    # Pass client only if connected so we can check for completed prompts
    reset_orphaned_running_jobs(client if connected else None)

    # Recover segments that completed in ComfyUI but weren't processed
    if connected:
        segments_to_recover = get_segments_needing_recovery()
        if segments_to_recover:
            print(f"[Recovery] Found {len(segments_to_recover)} segment(s) to recover from ComfyUI")
            for segment in segments_to_recover:
                recover_segment_from_comfyui(segment, client, comfyui_url)

            # Update job statuses for recovered segments
            # Jobs with all segments completed should go to awaiting_prompt
            from database import get_job_segments
            recovered_job_ids = set(s["job_id"] for s in segments_to_recover)
            for job_id in recovered_job_ids:
                segments = get_job_segments(job_id)
                all_completed = all(s.get("status") == "completed" for s in segments)
                has_pending = any(s.get("status") == "pending" for s in segments)
                has_failed = any(s.get("status") == "failed" for s in segments)

                if has_failed:
                    update_job_status(job_id, "failed", error_message="Recovery: some segments failed")
                elif all_completed:
                    # Clear any previous error message on successful recovery
                    update_job_status(job_id, "awaiting_prompt", error_message="")
                    print(f"[Recovery] Job {job_id} recovered - awaiting prompt for next segment")
                elif has_pending:
                    update_job_status(job_id, "pending", error_message="")

    client.close()

    # Auto-start queue if enabled
    auto_start = get_setting("auto_start_queue", "true")
    if auto_start.lower() == "true":
        queue_manager.start()
        print("Queue manager auto-started")

    yield

    # Shutdown
    print("Shutting down...")
    queue_manager.stop()
    print("Queue manager stopped")


# Create FastAPI app
app = FastAPI(
    title="ComfyUI Queue Manager",
    description="A queue management system for ComfyUI workflows",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router, prefix="/api")

# Serve static files (frontend)
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(frontend_path):
    app.mount("/static", StaticFiles(directory=frontend_path), name="static")

    @app.get("/")
    async def serve_index():
        """Serve the main frontend page."""
        index_path = os.path.join(frontend_path, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return {"message": "Frontend not found. API is available at /api"}


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "queue_running": queue_manager.is_running
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)