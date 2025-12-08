"""API routes for the ComfyUI Queue Manager."""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import RedirectResponse, FileResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import base64
import os
import shutil
from pathlib import Path

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
    create_first_segment,
    create_next_segment,
    get_job_segments as db_get_job_segments,
    update_segment_prompt,
    get_segment,
    delete_job_segments,
    delete_segment,
    get_completed_segments_count,
    get_all_loras as db_get_all_loras,
    get_lora as db_get_lora,
    update_lora as db_update_lora,
    delete_lora as db_delete_lora,
    bulk_upsert_loras,
    get_connection,
    get_image_rating,
    set_image_rating,
    get_all_image_ratings
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
    high_lora: Optional[str] = None  # Optional LoRA for high noise path
    low_lora: Optional[str] = None  # Optional LoRA for low noise path


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


class LoraUpdate(BaseModel):
    friendly_name: Optional[str] = None
    url: Optional[str] = None
    prompt_text: Optional[str] = None
    trigger_keywords: Optional[str] = None
    rating: Optional[int] = None


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
    
    # Build start image URL for segment 0
    start_image_url = None
    if job.input_image:
        comfyui_url = get_setting("comfyui_url", COMFYUI_SERVER_URL)
        if job.input_image.startswith("http"):
            start_image_url = job.input_image
        else:
            start_image_url = f"{comfyui_url}/view?filename={job.input_image}&subfolder=&type=input"

    # Create only the first segment (on-demand workflow)
    # Additional segments will be created when user provides prompts
    create_first_segment(
        job_id,
        job.prompt,
        start_image_url,
        high_lora=job.high_lora,
        low_lora=job.low_lora
    )
    
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
    """Retry a failed job by resetting incomplete segments while preserving completed ones."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] not in ("failed", "cancelled"):
        raise HTTPException(status_code=400, detail="Only failed or cancelled jobs can be retried")

    # Get existing segments
    existing_segments = db_get_job_segments(job_id)

    # Reset non-completed segments to pending (preserves completed segments)
    # This allows the job to pick up where it left off
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE job_segments
            SET status = 'pending', error_message = NULL
            WHERE job_id = ? AND status != 'completed'
        """, (job_id,))

    # Reset job status to pending and clear error message
    update_job_status(job_id, "pending", error_message=None)
    return {"status": "pending", "id": job_id}


@router.post("/jobs/{job_id}/finalize")
async def finalize_job(job_id: int):
    """Finalize a job and merge all completed segments into final video."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Get all segments to check if we have any completed
    segments = db_get_job_segments(job_id)
    completed_segments = [s for s in segments if s.get("status") == "completed"]

    if len(completed_segments) == 0:
        raise HTTPException(status_code=400, detail="No completed segments to finalize")

    # Update job status to 'running' and trigger finalization through queue manager
    update_job_status(job_id, "running")

    # Trigger the queue manager to finalize this job
    queue_manager.finalize_job_now(job_id)

    return {
        "status": "finalizing",
        "id": job_id,
        "completed_segments": len(completed_segments),
        "message": "Job is being finalized. All completed segments will be merged into final video."
    }


@router.post("/jobs/{job_id}/reopen")
async def reopen_job(job_id: int):
    """Reopen a completed job to add more segments."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Only completed jobs can be reopened")

    # Set job status to awaiting_prompt so user can add more segments
    update_job_status(job_id, "awaiting_prompt")

    segments = db_get_job_segments(job_id)
    completed_segments = [s for s in segments if s.get("status") == "completed"]

    return {
        "status": "awaiting_prompt",
        "id": job_id,
        "completed_segments": len(completed_segments),
        "message": "Job reopened. You can now add more segments."
    }


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

    # Get the actual filename from the path
    actual_filename = os.path.basename(video_path)

    return FileResponse(
        video_path,
        media_type="video/mp4",
        filename=actual_filename
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
async def update_segment_prompt_endpoint(
    job_id: int,
    segment_index: int,
    prompt: str = Form(...),
    high_lora: Optional[str] = Form(None),
    low_lora: Optional[str] = Form(None)
):
    """Create or update a segment with a prompt and resume job processing (on-demand workflow)."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    segment = get_segment(job_id, segment_index)

    if not segment:
        # Segment doesn't exist - create it on-demand
        # Get the previous segment's end frame as the start image for this segment
        if segment_index == 0:
            raise HTTPException(status_code=400, detail="Segment 0 should already exist")

        previous_segment = get_segment(job_id, segment_index - 1)
        if not previous_segment:
            raise HTTPException(status_code=400, detail=f"Previous segment {segment_index - 1} does not exist")

        if previous_segment.get("status") != "completed":
            raise HTTPException(status_code=400, detail=f"Previous segment {segment_index - 1} must be completed first")

        start_image_url = previous_segment.get("end_frame_url")
        if not start_image_url:
            raise HTTPException(status_code=400, detail=f"Previous segment {segment_index - 1} has no end frame")

        # Create new segment on-demand
        create_next_segment(
            job_id,
            segment_index,
            prompt,
            start_image_url,
            high_lora=high_lora,
            low_lora=low_lora
        )
    else:
        # Segment exists - update its prompt and LoRA selections
        update_segment_prompt(job_id, segment_index, prompt, high_lora=high_lora, low_lora=low_lora)

    # If job was waiting for prompt, set it back to pending so queue manager picks it up
    if job.get("status") == "awaiting_prompt":
        update_job_status(job_id, "pending")

    return {"status": "updated", "job_id": job_id, "segment_index": segment_index, "resumed": job.get("status") == "awaiting_prompt"}


@router.delete("/jobs/{job_id}/segments/{segment_index}")
async def delete_segment_endpoint(job_id: int, segment_index: int):
    """Delete a specific segment from a job.

    Can only delete the last segment, and only when the job is in awaiting_prompt status.
    """
    # Get job and validate
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Validate job status
    if job.get("status") != "awaiting_prompt":
        raise HTTPException(
            status_code=400,
            detail="Can only delete segments when job is awaiting prompt"
        )

    # Get all segments to validate this is the last one
    segments = db_get_job_segments(job_id)
    if not segments:
        raise HTTPException(status_code=404, detail="No segments found for this job")

    # Find the highest segment index (last segment)
    max_segment_index = max(seg["segment_index"] for seg in segments)

    # Validate that we're deleting the last segment
    if segment_index != max_segment_index:
        raise HTTPException(
            status_code=400,
            detail=f"Can only delete the last segment (segment {max_segment_index}). To delete segment {segment_index}, first delete segments {max_segment_index} down to {segment_index + 1}."
        )

    # Validate the segment exists
    segment = get_segment(job_id, segment_index)
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")

    # Delete the segment
    success = delete_segment(job_id, segment_index)

    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete segment")

    # Job remains in awaiting_prompt status
    return {
        "status": "success",
        "message": f"Segment {segment_index} deleted successfully",
        "job_status": "awaiting_prompt"
    }


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


@router.get("/comfyui/loras")
async def get_loras():
    """Get available LoRA models from ComfyUI."""
    comfyui_url = get_setting("comfyui_url", "http://3090.zero:8188")
    client = ComfyUIClient(comfyui_url)
    loras = client.get_loras()
    client.close()
    return {"loras": loras}


# ============== LoRA Library Routes ==============

@router.get("/loras/library")
async def get_lora_library():
    """Get all LoRAs from the cached library."""
    loras = db_get_all_loras()
    return {"loras": loras}


@router.post("/loras/fetch")
async def fetch_and_cache_loras():
    """Fetch LoRAs from ComfyUI and cache them in the database."""
    try:
        comfyui_url = get_setting("comfyui_url", "http://3090.zero:8188")
        client = ComfyUIClient(comfyui_url)
        loras = client.get_loras()
        client.close()

        # Bulk insert/update LoRAs
        count = bulk_upsert_loras(loras)

        return {
            "status": "success",
            "message": f"Fetched and cached {count} LoRAs",
            "count": count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch LoRAs: {str(e)}")


@router.get("/loras/{lora_id}")
async def get_lora(lora_id: int):
    """Get a specific LoRA by ID."""
    lora = db_get_lora(lora_id)
    if not lora:
        raise HTTPException(status_code=404, detail="LoRA not found")
    return lora


@router.put("/loras/{lora_id}")
async def update_lora(lora_id: int, lora_data: LoraUpdate):
    """Update LoRA metadata."""
    # Check if LoRA exists
    lora = db_get_lora(lora_id)
    if not lora:
        raise HTTPException(status_code=404, detail="LoRA not found")

    # Update the LoRA
    db_update_lora(
        lora_id,
        friendly_name=lora_data.friendly_name,
        url=lora_data.url,
        prompt_text=lora_data.prompt_text,
        trigger_keywords=lora_data.trigger_keywords,
        rating=lora_data.rating
    )

    # Return updated LoRA
    updated_lora = db_get_lora(lora_id)
    return updated_lora


@router.delete("/loras/{lora_id}")
async def delete_lora(lora_id: int):
    """Delete a LoRA from the library."""
    lora = db_get_lora(lora_id)
    if not lora:
        raise HTTPException(status_code=404, detail="LoRA not found")

    db_delete_lora(lora_id)
    return {"status": "deleted", "id": lora_id}


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


@router.get("/comfyui/view")
async def proxy_comfyui_view(filename: str, subfolder: str = "", type: str = "input"):
    """Proxy endpoint to view images from ComfyUI.

    This proxies requests to ComfyUI's /view endpoint to avoid CORS issues.
    """
    import httpx
    from fastapi.responses import StreamingResponse

    comfyui_url = get_setting("comfyui_url", "http://3090.zero:8188")

    # Build the ComfyUI view URL
    view_url = f"{comfyui_url}/view"
    params = {
        "filename": filename,
        "subfolder": subfolder,
        "type": type
    }

    try:
        # Proxy the request to ComfyUI
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(view_url, params=params)

            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Failed to fetch image from ComfyUI")

            # Determine content type from ComfyUI response
            content_type = response.headers.get("content-type", "image/jpeg")

            # Return the image as a streaming response
            return StreamingResponse(
                iter([response.content]),
                media_type=content_type,
                headers={"Cache-Control": "public, max-age=3600"}
            )
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Failed to connect to ComfyUI: {str(e)}")


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


# ============== Image Repository Endpoints ==============

@router.get("/image-repo/browse")
async def browse_image_repo(path: str = ""):
    """Browse the image repository directory.

    Returns folders and images (jpg, png) in the specified path.
    """
    repo_root = get_setting("image_repo_path", "")

    if not repo_root:
        raise HTTPException(status_code=400, detail="Image repository path not configured. Please set it in Settings.")

    # Security: Ensure the repo root exists and is accessible
    repo_root_path = Path(repo_root)
    if not repo_root_path.exists():
        raise HTTPException(status_code=400, detail=f"Image repository path does not exist: {repo_root}")

    if not repo_root_path.is_dir():
        raise HTTPException(status_code=400, detail=f"Image repository path is not a directory: {repo_root}")

    # Build the full path, ensuring it's within repo_root (security)
    if path:
        full_path = repo_root_path / path
        # Resolve to prevent directory traversal attacks
        full_path = full_path.resolve()
        if not str(full_path).startswith(str(repo_root_path.resolve())):
            raise HTTPException(status_code=403, detail="Access denied: Path is outside repository")
    else:
        full_path = repo_root_path

    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Path not found")

    if not full_path.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a directory")

    # List directory contents
    folders = []
    images = []

    try:
        for item in sorted(full_path.iterdir()):
            if item.is_dir():
                # Get relative path from repo root
                rel_path = item.relative_to(repo_root_path)
                folders.append({
                    "name": item.name,
                    "path": str(rel_path).replace("\\", "/")  # Normalize path separators
                })
            elif item.is_file():
                # Only include jpg and png files
                if item.suffix.lower() in ['.jpg', '.jpeg', '.png']:
                    rel_path = item.relative_to(repo_root_path)
                    images.append({
                        "name": item.name,
                        "path": str(rel_path).replace("\\", "/"),  # Normalize path separators
                        "size": item.stat().st_size
                    })
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied accessing directory")

    # Build breadcrumb trail
    breadcrumbs = [{"name": "Home", "path": ""}]
    if path:
        parts = Path(path).parts
        current_path = ""
        for part in parts:
            current_path = str(Path(current_path) / part).replace("\\", "/")
            breadcrumbs.append({"name": part, "path": current_path})

    # Enrich images with ratings
    all_ratings = get_all_image_ratings()
    for image in images:
        image['rating'] = all_ratings.get(image['path'], None)

    return {
        "current_path": path,
        "breadcrumbs": breadcrumbs,
        "folders": folders,
        "images": images
    }


@router.get("/image-repo/image")
async def get_image_from_repo(path: str):
    """Serve an image file from the repository.

    This endpoint is used to display thumbnails in the image repository browser.
    """
    from fastapi.responses import FileResponse

    repo_root = get_setting("image_repo_path", "")

    if not repo_root:
        raise HTTPException(status_code=400, detail="Image repository path not configured")

    repo_root_path = Path(repo_root)

    # Build full path with security check
    full_path = repo_root_path / path
    full_path = full_path.resolve()

    # Security: Ensure path is within repo root
    if not str(full_path).startswith(str(repo_root_path.resolve())):
        raise HTTPException(status_code=403, detail="Access denied: Path is outside repository")

    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")

    if not full_path.is_file():
        raise HTTPException(status_code=400, detail="Path is not a file")

    # Check file extension
    if full_path.suffix.lower() not in ['.jpg', '.jpeg', '.png']:
        raise HTTPException(status_code=400, detail="Only JPG and PNG images are supported")

    # Determine media type
    media_type = "image/jpeg" if full_path.suffix.lower() in ['.jpg', '.jpeg'] else "image/png"

    return FileResponse(str(full_path), media_type=media_type)


@router.post("/image-repo/select")
async def select_image_from_repo(image_path: str = Form(...)):
    """Upload an image from the repository to ComfyUI.

    Takes an image from the local repository and uploads it to ComfyUI's input folder.
    """
    repo_root = get_setting("image_repo_path", "")

    if not repo_root:
        raise HTTPException(status_code=400, detail="Image repository path not configured")

    repo_root_path = Path(repo_root)

    # Build full path with security check
    full_path = repo_root_path / image_path
    full_path = full_path.resolve()

    # Security: Ensure path is within repo root
    if not str(full_path).startswith(str(repo_root_path.resolve())):
        raise HTTPException(status_code=403, detail="Access denied: Path is outside repository")

    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")

    if not full_path.is_file():
        raise HTTPException(status_code=400, detail="Path is not a file")

    # Check file extension
    if full_path.suffix.lower() not in ['.jpg', '.jpeg', '.png']:
        raise HTTPException(status_code=400, detail="Only JPG and PNG images are supported")

    # Read the image file
    try:
        with open(full_path, 'rb') as f:
            image_content = f.read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read image: {str(e)}")

    # Upload to ComfyUI
    comfyui_url = get_setting("comfyui_url", "http://3090.zero:8188")
    client = ComfyUIClient(comfyui_url)

    try:
        result_filename = client.upload_image(image_content, full_path.name)
        client.close()

        if not result_filename:
            raise HTTPException(status_code=500, detail="Failed to upload image to ComfyUI")

        # Return both filename and image_url for compatibility
        return {
            "filename": result_filename,
            "image_url": result_filename,  # For frontend compatibility
            "original_name": full_path.name,
            "original_path": image_path
        }
    except Exception as e:
        client.close()
        raise HTTPException(status_code=500, detail=f"Failed to upload image: {str(e)}")


@router.post("/image-repo/delete")
async def delete_image_from_repo(image_path: str = Form(...)):
    """Delete an image from the repository.

    Permanently removes an image file from the local filesystem.
    """
    repo_root = get_setting("image_repo_path", "")

    if not repo_root:
        raise HTTPException(status_code=400, detail="Image repository path not configured")

    repo_root_path = Path(repo_root)

    # Build full path with security check
    full_path = repo_root_path / image_path
    full_path = full_path.resolve()

    # Security: Ensure path is within repo root
    if not str(full_path).startswith(str(repo_root_path.resolve())):
        raise HTTPException(status_code=403, detail="Access denied: Path is outside repository")

    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")

    if not full_path.is_file():
        raise HTTPException(status_code=400, detail="Path is not a file")

    # Check file extension for safety
    if full_path.suffix.lower() not in ['.jpg', '.jpeg', '.png']:
        raise HTTPException(status_code=400, detail="Only JPG and PNG images can be deleted")

    # Delete the file
    try:
        full_path.unlink()
        return {
            "success": True,
            "message": f"Image '{full_path.name}' deleted successfully",
            "deleted_path": image_path
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete image: {str(e)}")


@router.get("/image-repo/rating")
async def get_image_rating_endpoint(image_path: str):
    """Get the rating for a specific image."""
    rating = get_image_rating(image_path)
    return {"image_path": image_path, "rating": rating}


@router.post("/image-repo/rating")
async def set_image_rating_endpoint(image_path: str = Form(...), rating: Optional[int] = Form(None)):
    """Set or update the rating for an image."""
    # Validate rating is between 1-5 or None
    if rating is not None and (rating < 1 or rating > 5):
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    set_image_rating(image_path, rating)
    return {"image_path": image_path, "rating": rating, "success": True}
