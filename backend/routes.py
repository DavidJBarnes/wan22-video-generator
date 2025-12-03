"""API routes for the ComfyUI Queue Manager."""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import RedirectResponse, FileResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import base64
import os

from database import (
    get_all_jobs,
    get_job,
    create_job,
    delete_job,
    update_job_status,
    get_all_settings,
    get_setting,
    update_settings,
    create_segments_for_job,
    get_job_segments as db_get_job_segments,
    update_segment_prompt,
    get_segment,
    delete_job_segments,
    get_completed_segments_count
)
from comfyui_client import ComfyUIClient
from queue_manager import queue_manager
from config import (
    COMFYUI_SERVER_URL,
    DEFAULT_WIDTH,
    DEFAULT_HEIGHT,
    DEFAULT_FPS,
    MODELS,
    GENERATION_PARAMS,
    DEFAULT_NEGATIVE_PROMPT
)

# Create router
router = APIRouter()


# ============== Pydantic Models ==============

class JobCreate(BaseModel):
    name: str
    prompt: str
    negative_prompt: Optional[str] = ""
    workflow_type: Optional[str] = "txt2img"
    parameters: Optional[Dict[str, Any]] = None
    input_image: Optional[str] = None  # Base64 encoded or ComfyUI filename


class JobResponse(BaseModel):
    id: int
    name: str
    status: str
    prompt: Optional[str]
    negative_prompt: Optional[str]
    workflow_type: Optional[str]
    parameters: Optional[Dict[str, Any]]
    input_image: Optional[str]
    output_images: Optional[List[str]]
    comfyui_prompt_id: Optional[str]
    error_message: Optional[str]
    created_at: Optional[str]
    started_at: Optional[str]
    completed_at: Optional[str]
    # Computed segment fields
    total_segments: Optional[int] = 0
    completed_segments: Optional[int] = 0
    progress_percent: Optional[int] = 0


def enrich_job_with_segments(job: Dict[str, Any]) -> Dict[str, Any]:
    """Add computed segment fields to a job dict."""
    job_id = job["id"]
    segments = db_get_job_segments(job_id)
    
    # Get total segments from actual segments or from parameters
    if segments:
        total = len(segments)
        completed = sum(1 for s in segments if s.get("status") == "completed")
    else:
        params = job.get("parameters") or {}
        total = int(params.get("total_segments", 1))
        completed = 0
    
    job["total_segments"] = total
    job["completed_segments"] = completed
    job["progress_percent"] = round((completed / total) * 100) if total > 0 else 0
    
    return job


class SettingsUpdate(BaseModel):
    settings: Dict[str, str]


class QueueStatus(BaseModel):
    is_running: bool
    current_job_id: Optional[int]
    pending_count: int
    comfyui_connected: bool
    comfyui_message: str


# ============== Job Endpoints ==============

@router.get("/jobs", response_model=List[JobResponse])
async def list_jobs(limit: int = 100, offset: int = 0):
    """Get all jobs with pagination, enriched with segment counts."""
    jobs = get_all_jobs(limit=limit, offset=offset)
    # Enrich each job with segment counts
    return [enrich_job_with_segments(job) for job in jobs]


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job_details(job_id: int):
    """Get a specific job by ID, enriched with segment counts."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return enrich_job_with_segments(job)


@router.post("/jobs", response_model=JobResponse)
async def create_new_job(job: JobCreate):
    """Create a new job and its segments."""
    job_id = create_job(
        name=job.name,
        prompt=job.prompt,
        negative_prompt=job.negative_prompt or "",
        workflow_type=job.workflow_type or "txt2img",
        parameters=job.parameters,
        input_image=job.input_image
    )
    
    # Create segments for the job
    params = job.parameters or {}
    total_segments = int(params.get("total_segments", 1))
    
    # Build start image URL for segment 1
    start_image_url = None
    if job.input_image:
        comfyui_url = get_setting("comfyui_url", COMFYUI_SERVER_URL)
        if job.input_image.startswith("http"):
            start_image_url = job.input_image
        else:
            start_image_url = f"{comfyui_url}/view?filename={job.input_image}&subfolder=&type=input"
    
    # Create segment records
    create_segments_for_job(job_id, total_segments, job.prompt, start_image_url)
    
    return get_job(job_id)


@router.delete("/jobs/{job_id}")
async def delete_job_endpoint(job_id: int):
    """Delete a job."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Don't delete running jobs
    if job["status"] == "running":
        raise HTTPException(status_code=400, detail="Cannot delete a running job")

    delete_job(job_id)
    return {"status": "deleted", "id": job_id}


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: int):
    """Cancel a pending job."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] != "pending":
        raise HTTPException(status_code=400, detail="Only pending jobs can be cancelled")

    update_job_status(job_id, "cancelled")
    return {"status": "cancelled", "id": job_id}


@router.post("/jobs/{job_id}/retry")
async def retry_job(job_id: int):
    """Retry a failed job by resetting all segments and job status."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] not in ("failed", "cancelled"):
        raise HTTPException(status_code=400, detail="Only failed or cancelled jobs can be retried")

    # Delete existing segments and recreate them
    delete_job_segments(job_id)
    
    # Recreate segments
    params = job.get("parameters") or {}
    total_segments = int(params.get("total_segments", 1))
    
    # Build start image URL for segment 1
    start_image_url = None
    if job.get("input_image"):
        comfyui_url = get_setting("comfyui_url", COMFYUI_SERVER_URL)
        input_image = job["input_image"]
        if input_image.startswith("http"):
            start_image_url = input_image
        else:
            start_image_url = f"{comfyui_url}/view?filename={input_image}&subfolder=&type=input"
    
    # Create fresh segment records
    create_segments_for_job(job_id, total_segments, job.get("prompt", ""), start_image_url)
    
    # Reset job status to pending and clear error message
    update_job_status(job_id, "pending", error_message=None)
    return {"status": "pending", "id": job_id}


@router.get("/jobs/{job_id}/thumbnail")
async def get_job_thumbnail(job_id: int):
    """Get thumbnail for a job.
    
    For video generation jobs, always use the input/start image as thumbnail
    since output_images contains video files (MP4) which can't be displayed as images.
    """
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # For video jobs, always use the input image as thumbnail
    # (output_images contains MP4 files which can't be displayed as images)
    input_image = job.get("input_image")
    if input_image:
        comfyui_url = get_setting("comfyui_url", COMFYUI_SERVER_URL)
        # If it's already a full URL, redirect directly
        if input_image.startswith("http"):
            return RedirectResponse(input_image)
        # Otherwise, construct ComfyUI view URL for uploaded images
        # Uploaded images go to the "input" subfolder with type "input"
        return RedirectResponse(
            f"{comfyui_url}/view?filename={input_image}&subfolder=&type=input"
        )

    # No thumbnail available
    raise HTTPException(status_code=404, detail="No thumbnail available")


@router.get("/jobs/{job_id}/video")
async def get_job_video(job_id: int):
    """Get the final stitched video for a completed job.
    
    Returns the video file directly for playback in the browser.
    """
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Check if job has output videos
    output_images = job.get("output_images") or []
    if not output_images:
        raise HTTPException(status_code=404, detail="No video available for this job")
    
    # Find the video file (first .mp4 in output_images)
    video_path = None
    for path in output_images:
        if path.endswith('.mp4'):
            video_path = path
            break
    
    if not video_path:
        raise HTTPException(status_code=404, detail="No video file found")
    
    # Check if file exists
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail=f"Video file not found on disk")
    
    return FileResponse(
        video_path,
        media_type="video/mp4",
        filename=f"job_{job_id}_final.mp4"
    )


@router.get("/jobs/{job_id}/segments")
async def get_job_segments_endpoint(job_id: int):
    """Get segments for a job from the database."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Get real segments from database
    segments = db_get_job_segments(job_id)
    
    # If no segments exist yet (legacy jobs), create stub data
    if not segments:
        params = job.get("parameters") or {}
        total_segments = int(params.get("total_segments", 1))
        
        # Build start image URL
        start_image_url = None
        if job.get("input_image"):
            comfyui_url = get_setting("comfyui_url", COMFYUI_SERVER_URL)
            input_image = job["input_image"]
            if input_image.startswith("http"):
                start_image_url = input_image
            else:
                start_image_url = f"{comfyui_url}/view?filename={input_image}&subfolder=&type=input"
        
        segments = []
        for i in range(total_segments):
            segments.append({
                "segment_index": i,
                "status": job["status"] if i == 0 else "pending",
                "prompt": job.get("prompt", ""),
                "start_image_url": start_image_url if i == 0 else None,
                "end_frame_url": None,
            })

    return segments


@router.post("/jobs/{job_id}/segments/{segment_index}/prompt")
async def update_segment_prompt_endpoint(job_id: int, segment_index: int, prompt: str = Form(...)):
    """Update the prompt for a specific segment and resume job processing."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    segment = get_segment(job_id, segment_index)
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    
    # Update the segment's prompt
    update_segment_prompt(job_id, segment_index, prompt)
    
    # If job was waiting for prompt, set it back to pending so queue manager picks it up
    if job.get("status") == "awaiting_prompt":
        update_job_status(job_id, "pending")
    
    return {"status": "updated", "job_id": job_id, "segment_index": segment_index, "resumed": job.get("status") == "awaiting_prompt"}


# ============== Settings Endpoints ==============

@router.get("/settings")
async def get_settings():
    """Get all settings, merged with config.py defaults."""
    settings = get_all_settings()
    
    # Merge in config.py defaults for fields that may not be in DB
    settings.setdefault("comfyui_url", COMFYUI_SERVER_URL)
    settings.setdefault("default_width", str(DEFAULT_WIDTH))
    settings.setdefault("default_height", str(DEFAULT_HEIGHT))
    settings.setdefault("default_fps", str(DEFAULT_FPS))
    settings.setdefault("default_negative_prompt", DEFAULT_NEGATIVE_PROMPT)
    settings.setdefault("models", MODELS)
    settings.setdefault("generation_params", GENERATION_PARAMS)
    
    return {"settings": settings}


@router.put("/settings")
async def update_settings_endpoint(data: SettingsUpdate):
    """Update settings."""
    update_settings(data.settings)
    return {"status": "updated", "settings": get_all_settings()}


@router.get("/settings/{key}")
async def get_single_setting(key: str):
    """Get a single setting by key."""
    value = get_setting(key)
    if value is None:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    return {"key": key, "value": value}


# ============== Queue Control Endpoints ==============

@router.get("/queue/status", response_model=QueueStatus)
async def get_queue_status():
    """Get queue manager status."""
    from database import get_pending_jobs

    # Check ComfyUI connection
    comfyui_url = get_setting("comfyui_url", "http://3090.zero:8188")
    client = ComfyUIClient(comfyui_url)
    connected, message = client.check_connection()
    client.close()

    pending_jobs = get_pending_jobs()

    return QueueStatus(
        is_running=queue_manager.is_running,
        current_job_id=queue_manager.current_job_id,
        pending_count=len(pending_jobs),
        comfyui_connected=connected,
        comfyui_message=message
    )


@router.post("/queue/start")
async def start_queue():
    """Start the queue manager."""
    if queue_manager.is_running:
        return {"status": "already_running"}

    queue_manager.start()
    return {"status": "started"}


@router.post("/queue/stop")
async def stop_queue():
    """Stop the queue manager."""
    if not queue_manager.is_running:
        return {"status": "already_stopped"}

    queue_manager.stop()
    return {"status": "stopped"}


# ============== ComfyUI Info Endpoints ==============

@router.get("/comfyui/checkpoints")
async def get_checkpoints():
    """Get available checkpoint models from ComfyUI."""
    comfyui_url = get_setting("comfyui_url", "http://3090.zero:8188")
    client = ComfyUIClient(comfyui_url)
    checkpoints = client.get_checkpoints()
    client.close()
    return {"checkpoints": checkpoints}


@router.get("/comfyui/samplers")
async def get_samplers():
    """Get available samplers from ComfyUI."""
    comfyui_url = get_setting("comfyui_url", "http://3090.zero:8188")
    client = ComfyUIClient(comfyui_url)
    samplers = client.get_samplers()
    client.close()
    return {"samplers": samplers}


@router.get("/comfyui/schedulers")
async def get_schedulers():
    """Get available schedulers from ComfyUI."""
    comfyui_url = get_setting("comfyui_url", "http://3090.zero:8188")
    client = ComfyUIClient(comfyui_url)
    schedulers = client.get_schedulers()
    client.close()
    return {"schedulers": schedulers}


@router.get("/comfyui/status")
async def get_comfyui_status():
    """Check ComfyUI connection status."""
    comfyui_url = get_setting("comfyui_url", "http://3090.zero:8188")
    client = ComfyUIClient(comfyui_url)
    connected, message = client.check_connection()

    queue_status = {}
    if connected:
        queue_status = client.get_queue_status()

    client.close()

    return {
        "connected": connected,
        "message": message,
        "url": comfyui_url,
        "queue": queue_status
    }


# ============== Image Upload Endpoint ==============

@router.post("/upload/image")
async def upload_image(file: UploadFile = File(...)):
    """Upload an image to ComfyUI."""
    # Read file content
    content = await file.read()

    # Upload to ComfyUI
    comfyui_url = get_setting("comfyui_url", "http://3090.zero:8188")
    client = ComfyUIClient(comfyui_url)

    filename = client.upload_image(content, file.filename)
    client.close()

    if not filename:
        raise HTTPException(status_code=500, detail="Failed to upload image to ComfyUI")

    return {"filename": filename, "original_name": file.filename}


@router.post("/upload/image/base64")
async def upload_image_base64(image_data: str = Form(...), filename: str = Form(...)):
    """Upload a base64 encoded image to ComfyUI."""
    try:
        # Decode base64
        if "," in image_data:
            image_data = image_data.split(",")[1]
        content = base64.b64decode(image_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 data: {e}")

    # Upload to ComfyUI
    comfyui_url = get_setting("comfyui_url", "http://3090.zero:8188")
    client = ComfyUIClient(comfyui_url)

    result_filename = client.upload_image(content, filename)
    client.close()

    if not result_filename:
        raise HTTPException(status_code=500, detail="Failed to upload image to ComfyUI")

    return {"filename": result_filename, "original_name": filename}
