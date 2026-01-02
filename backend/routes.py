"""API routes for the ComfyUI Queue Manager."""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import RedirectResponse, FileResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import base64
import json
import os
import re
import shutil
import subprocess
import tempfile
import httpx
from pathlib import Path

from database import (
    get_all_jobs,
    get_job,
    create_job,
    delete_job,
    update_job_status,
    update_job_parameters,
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
    get_all_image_ratings,
    move_job_up,
    move_job_down,
    move_job_to_bottom,
    hide_lora_file,
    unhide_lora_file,
    get_hidden_loras as db_get_hidden_loras,
    get_job_logs as db_get_job_logs
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


# ============== CivitAI Preview Fetching ==============

# Directory for cached LoRA preview images
LORA_PREVIEWS_DIR = Path(__file__).parent / "lora_previews"
LORA_PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)


def fetch_and_cache_preview(url: str, lora_id: int) -> Optional[str]:
    """Fetch preview image from CivitAI and cache it locally.

    Supports URLs like:
    - https://civitai.com/models/1811313/model-name
    - https://civitai.com/models/1811313

    Returns the local filename if successful, or None if failed.
    """
    if not url:
        return None

    # Extract model ID from URL
    match = re.search(r'civitai\.com/models/(\d+)', url)
    if not match:
        return None

    model_id = match.group(1)
    api_url = f"https://civitai.com/api/v1/models/{model_id}"

    try:
        # Use shorter timeout for API calls, longer for image downloads
        with httpx.Client(timeout=10.0) as api_client:
            # First, get the image URL from the API
            response = api_client.get(api_url)
            response.raise_for_status()
            data = response.json()

            # Get images from first model version
            model_versions = data.get('modelVersions', [])
            if not model_versions:
                return None

            images = model_versions[0].get('images', [])

            # Prefer static images over videos
            static_image = next((img for img in images if img.get('type') == 'image'), None)

            if static_image:
                image_url = static_image.get('url', '')
                is_video = False
            elif images:
                # Fall back to first media (even if video)
                image_url = images[0].get('url', '')
                is_video = images[0].get('type') == 'video'
            else:
                return None

            if not image_url:
                return None

            # For CivitAI URLs, request a reasonable size for images only
            # Videos don't support resizing and return 500 error
            if 'original=true' in image_url and not is_video:
                image_url = image_url.replace('original=true', 'width=512')

        # Use longer timeout for image download (CivitAI CDN can be slow)
        # Must include User-Agent header or some CDNs block the request
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        with httpx.Client(timeout=60.0, headers=headers) as img_client:
            img_response = img_client.get(image_url)
            img_response.raise_for_status()

            # Determine file extension from content-type or URL
            content_type = img_response.headers.get('content-type', '')
            is_video_content = 'video' in content_type or is_video

            if is_video_content:
                # For videos, extract first frame as webp for better browser compatibility
                with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as tmp:
                    tmp.write(img_response.content)
                    tmp_path = tmp.name

                try:
                    filename = f"{lora_id}.webp"
                    filepath = LORA_PREVIEWS_DIR / filename
                    # Extract first frame using ffmpeg
                    result = subprocess.run([
                        'ffmpeg', '-y', '-i', tmp_path,
                        '-vframes', '1', '-q:v', '80',
                        str(filepath)
                    ], capture_output=True, timeout=30)

                    if result.returncode != 0 or not filepath.exists():
                        print(f"[CivitAI] ffmpeg failed: {result.stderr.decode()}")
                        return None

                    print(f"[CivitAI] Cached preview for LoRA {lora_id}: {filename} (extracted from video)")
                    return filename
                finally:
                    os.unlink(tmp_path)
            else:
                # Static image - save directly
                if 'webp' in content_type:
                    ext = '.webp'
                elif 'png' in content_type:
                    ext = '.png'
                elif 'gif' in content_type:
                    ext = '.gif'
                else:
                    ext = '.jpg'

                filename = f"{lora_id}{ext}"
                filepath = LORA_PREVIEWS_DIR / filename
                with open(filepath, 'wb') as f:
                    f.write(img_response.content)

                print(f"[CivitAI] Cached preview for LoRA {lora_id}: {filename}")
                return filename

    except Exception as e:
        print(f"[CivitAI] Failed to fetch/cache preview for {url}: {e}")
        return None


def get_cached_preview_path(lora_id: int) -> Optional[Path]:
    """Get the path to a cached preview image if it exists."""
    for ext in ['.jpg', '.png', '.webp', '.gif', '.mp4']:
        filepath = LORA_PREVIEWS_DIR / f"{lora_id}{ext}"
        if filepath.exists():
            return filepath
    return None


# Create router
router = APIRouter()


# ============== Pydantic Models ==============

class LoraSelection(BaseModel):
    """A LoRA pair selection (high + low noise variants) with weights."""
    high_file: Optional[str] = None    # LoRA filename for high noise pass
    high_weight: Optional[float] = 1.0  # Weight for high noise LoRA (0.0-2.0)
    low_file: Optional[str] = None     # LoRA filename for low noise pass
    low_weight: Optional[float] = 1.0   # Weight for low noise LoRA (0.0-2.0)


class JobCreate(BaseModel):
    name: str
    prompt: str
    negative_prompt: Optional[str] = ""
    workflow_type: Optional[str] = "txt2img"
    parameters: Optional[Dict[str, Any]] = None
    input_image: Optional[str] = None  # Base64 encoded or ComfyUI filename
    loras: Optional[List[LoraSelection]] = None  # 0-2 LoRA pairs


class JobUpdate(BaseModel):
    name: Optional[str] = None
    prompt: Optional[str] = None
    negative_prompt: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None


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
    priority: Optional[int] = None
    seed: Optional[int] = None
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
    notes: Optional[str] = None
    preview_image_url: Optional[str] = None
    fetch_preview: Optional[bool] = False  # If true, auto-fetch preview from URL


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


@router.get("/jobs/{job_id}/logs")
async def get_job_logs(job_id: int, limit: int = 100):
    """Get activity logs for a job."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    logs = db_get_job_logs(job_id, limit=limit)
    return {"job_id": job_id, "logs": logs}


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

    # Extract LoRA selections from loras list (0-2 pairs) with weights
    high_loras = []
    low_loras = []
    if job.loras:
        for lora in job.loras[:2]:  # Max 2 pairs
            if lora.high_file or lora.low_file:
                if lora.high_file:
                    high_loras.append({
                        "file": lora.high_file,
                        "weight": lora.high_weight or 1.0
                    })
                if lora.low_file:
                    low_loras.append({
                        "file": lora.low_file,
                        "weight": lora.low_weight or 1.0
                    })

    # Create only the first segment (on-demand workflow)
    # Additional segments will be created when user provides prompts
    create_first_segment(
        job_id,
        job.prompt,
        start_image_url,
        high_loras=high_loras if high_loras else None,
        low_loras=low_loras if low_loras else None
    )
    
    return get_job(job_id)


@router.put("/jobs/{job_id}", response_model=JobResponse)
async def update_job_endpoint(job_id: int, job_data: JobUpdate):
    """Update a job's parameters.

    Jobs with status 'pending' or 'awaiting_prompt' can be updated.
    """
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] not in ("pending", "awaiting_prompt"):
        raise HTTPException(status_code=400, detail="Only pending or awaiting_prompt jobs can be edited")

    # Update the job
    success = update_job_parameters(
        job_id,
        name=job_data.name,
        prompt=job_data.prompt,
        negative_prompt=job_data.negative_prompt,
        parameters=job_data.parameters
    )

    if not success:
        raise HTTPException(status_code=400, detail="Failed to update job")

    # Also update the first segment's prompt if job prompt changed
    if job_data.prompt is not None:
        update_segment_prompt(job_id, 0, job_data.prompt)

    return enrich_job_with_segments(get_job(job_id))


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


@router.post("/jobs/{job_id}/move-up")
async def move_job_up_endpoint(job_id: int):
    """Move a pending job up in the queue (higher priority)."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] != "pending":
        raise HTTPException(status_code=400, detail="Only pending jobs can be reordered")

    moved = move_job_up(job_id)
    if not moved:
        return {"status": "unchanged", "id": job_id, "message": "Job is already at the top of the queue"}

    return {"status": "moved", "id": job_id, "direction": "up"}


@router.post("/jobs/{job_id}/move-down")
async def move_job_down_endpoint(job_id: int):
    """Move a pending job down in the queue (lower priority)."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] != "pending":
        raise HTTPException(status_code=400, detail="Only pending jobs can be reordered")

    moved = move_job_down(job_id)
    if not moved:
        return {"status": "unchanged", "id": job_id, "message": "Job is already at the bottom of the queue"}

    return {"status": "moved", "id": job_id, "direction": "down"}


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

    # Move job to bottom of queue (retried jobs shouldn't jump ahead)
    move_job_to_bottom(job_id)

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
    
    # Find the video file (first .webm or .mp4 in output_images)
    video_path = None
    for path in output_images:
        if path.endswith('.webm') or path.endswith('.mp4'):
            video_path = path
            break

    if not video_path:
        raise HTTPException(status_code=404, detail="No video file found")

    # Check if file exists
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail=f"Video file not found on disk")

    # Get the actual filename and determine media type
    actual_filename = os.path.basename(video_path)
    media_type = "video/webm" if video_path.endswith('.webm') else "video/mp4"

    return FileResponse(
        video_path,
        media_type=media_type,
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
    loras: Optional[str] = Form(None)  # JSON array: '[{"high_file": "...", "low_file": "..."}]'
):
    """Create or update a segment with a prompt and resume job processing (on-demand workflow).

    Args:
        loras: Optional JSON string containing array of LoRA pairs (max 2).
               Format: '[{"high_file": "path/to/high.safetensors", "low_file": "path/to/low.safetensors"}]'
    """
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Parse LoRA selections from JSON string
    # Format: [{"high_file": "...", "high_weight": 1.0, "low_file": "...", "low_weight": 1.0}, ...]
    high_loras = []
    low_loras = []
    if loras:
        try:
            lora_list = json.loads(loras)
            for lora in lora_list[:2]:  # Max 2 pairs
                if lora.get("high_file") or lora.get("low_file"):
                    # Store as objects with file and weight
                    if lora.get("high_file"):
                        high_loras.append({
                            "file": lora["high_file"],
                            "weight": float(lora.get("high_weight", 1.0))
                        })
                    if lora.get("low_file"):
                        low_loras.append({
                            "file": lora["low_file"],
                            "weight": float(lora.get("low_weight", 1.0))
                        })
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid loras JSON format")

    segment = get_segment(job_id, segment_index)

    if not segment:
        # Segment doesn't exist - create it on-demand
        if segment_index == 0:
            # Segment 0 uses the job's original input image
            start_image_url = job.get("input_image")
            if not start_image_url:
                raise HTTPException(status_code=400, detail="Job has no input image")
        else:
            # Get the previous segment's end frame as the start image for this segment
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
            high_loras=high_loras if high_loras else None,
            low_loras=low_loras if low_loras else None
        )
    else:
        # Segment exists - update its prompt and LoRA selections
        update_segment_prompt(
            job_id, segment_index, prompt,
            high_loras=high_loras if high_loras else None,
            low_loras=low_loras if low_loras else None
        )

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

    # Job naming presets (stored as JSON arrays)
    settings.setdefault("job_name_prefixes", "[]")
    settings.setdefault("job_name_descriptions", "[]")

    # Segment execution timeout (seconds) - how long to wait for ComfyUI to complete a segment
    settings.setdefault("segment_execution_timeout", "1200")  # 20 minutes default

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
    comfyui_url = get_setting("comfyui_url", "http://localhost:8188")
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
    comfyui_url = get_setting("comfyui_url", "http://localhost:8188")
    client = ComfyUIClient(comfyui_url)
    checkpoints = client.get_checkpoints()
    client.close()
    return {"checkpoints": checkpoints}


@router.get("/comfyui/samplers")
async def get_samplers():
    """Get available samplers from ComfyUI."""
    comfyui_url = get_setting("comfyui_url", "http://localhost:8188")
    client = ComfyUIClient(comfyui_url)
    samplers = client.get_samplers()
    client.close()
    return {"samplers": samplers}


@router.get("/comfyui/schedulers")
async def get_schedulers():
    """Get available schedulers from ComfyUI."""
    comfyui_url = get_setting("comfyui_url", "http://localhost:8188")
    client = ComfyUIClient(comfyui_url)
    schedulers = client.get_schedulers()
    client.close()
    return {"schedulers": schedulers}


@router.get("/comfyui/loras")
async def get_loras():
    """Get available LoRA models from ComfyUI."""
    comfyui_url = get_setting("comfyui_url", "http://localhost:8188")
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
    """Fetch LoRAs from ComfyUI and cache them in the database.

    LoRAs are automatically grouped by base name (high/low variants combined).
    """
    try:
        comfyui_url = get_setting("comfyui_url", "http://localhost:8188")
        client = ComfyUIClient(comfyui_url)
        loras = client.get_loras()
        client.close()

        # Bulk insert/update LoRAs (automatically groups high/low variants)
        count = bulk_upsert_loras(loras)

        return {
            "status": "success",
            "message": f"Fetched {len(loras)} files, grouped into {count} LoRAs",
            "file_count": len(loras),
            "grouped_count": count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch LoRAs: {str(e)}")


@router.post("/loras/cleanup")
async def cleanup_lora_duplicates():
    """Clean up duplicate LoRA entries based on actual .safetensors filename.

    If the same filename appears in multiple rows, keeps the row with the most
    metadata and removes the duplicate entries.
    """
    from database import cleanup_duplicate_loras
    result = cleanup_duplicate_loras()
    return {
        "status": "success",
        "message": f"Cleaned up {result['duplicates_removed']} duplicate entries, deleted {result['empty_rows_deleted']} empty rows",
        **result
    }


@router.get("/loras/hidden")
async def get_hidden_loras():
    """Get all hidden LoRA files."""
    return db_get_hidden_loras()


@router.post("/loras/hidden/restore")
async def restore_hidden_lora(filename: str):
    """Restore a hidden LoRA file so it appears on next refresh."""
    if unhide_lora_file(filename):
        return {"status": "restored", "filename": filename}
    raise HTTPException(status_code=404, detail="File not found in hidden list")


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

    # Determine preview image URL
    preview_url = lora_data.preview_image_url

    # Auto-fetch preview from CivitAI if requested
    if lora_data.fetch_preview and lora_data.url:
        fetched_preview = fetch_civitai_preview(lora_data.url)
        if fetched_preview:
            preview_url = fetched_preview

    # Update the LoRA
    db_update_lora(
        lora_id,
        friendly_name=lora_data.friendly_name,
        url=lora_data.url,
        prompt_text=lora_data.prompt_text,
        trigger_keywords=lora_data.trigger_keywords,
        rating=lora_data.rating,
        notes=lora_data.notes,
        preview_image_url=preview_url
    )

    # Return updated LoRA
    updated_lora = db_get_lora(lora_id)
    return updated_lora


@router.get("/loras/{lora_id}/preview")
async def get_lora_preview(lora_id: int):
    """Serve the cached preview image for a LoRA."""
    preview_path = get_cached_preview_path(lora_id)
    if not preview_path:
        raise HTTPException(status_code=404, detail="Preview not found")

    # Determine correct media type based on extension
    ext = preview_path.suffix.lower()
    media_types = {
        '.webp': 'image/webp',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
    }
    media_type = media_types.get(ext, 'application/octet-stream')

    return FileResponse(preview_path, media_type=media_type)


@router.post("/loras/{lora_id}/refresh-preview")
async def refresh_lora_preview(lora_id: int):
    """Fetch and cache the preview image from the LoRA's CivitAI URL."""
    lora = db_get_lora(lora_id)
    if not lora:
        raise HTTPException(status_code=404, detail="LoRA not found")

    if not lora.get('url'):
        raise HTTPException(status_code=400, detail="LoRA has no URL set")

    # Fetch and cache the preview image locally
    cached_filename = fetch_and_cache_preview(lora['url'], lora_id)
    if not cached_filename:
        raise HTTPException(status_code=400, detail="Could not fetch preview from URL")

    # Store the cached filename in the database (only updates preview_image_url)
    db_update_lora(lora_id, preview_image_url=cached_filename)

    return {"status": "success", "preview_image_url": cached_filename}


@router.delete("/loras/{lora_id}")
async def delete_lora(lora_id: int):
    """Delete a LoRA from the library and hide its files from future refreshes."""
    lora = db_get_lora(lora_id)
    if not lora:
        raise HTTPException(status_code=404, detail="LoRA not found")

    # Hide the files so they don't reappear on refresh
    hidden_files = []
    if lora.get('high_file'):
        hide_lora_file(lora['high_file'])
        hidden_files.append(lora['high_file'])
    if lora.get('low_file'):
        hide_lora_file(lora['low_file'])
        hidden_files.append(lora['low_file'])

    db_delete_lora(lora_id)
    return {"status": "deleted", "id": lora_id, "hidden_files": hidden_files}


@router.get("/comfyui/status")
async def get_comfyui_status():
    """Check ComfyUI connection status."""
    comfyui_url = get_setting("comfyui_url", "http://localhost:8188")
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

    comfyui_url = get_setting("comfyui_url", "http://localhost:8188")

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
    """Upload an image to ComfyUI.

    Deduplicates based on content hash - if the same image was uploaded before,
    returns the existing filename without re-uploading.
    """
    from database import compute_image_hash, get_image_by_hash, store_uploaded_image

    # Read file content
    content = await file.read()

    # Check if this image was already uploaded (by content hash)
    content_hash = compute_image_hash(content)
    existing = get_image_by_hash(content_hash)

    if existing:
        # Image already exists, return existing filename
        return {
            "filename": existing['comfyui_filename'],
            "original_name": file.filename,
            "deduplicated": True
        }

    # Upload to ComfyUI
    comfyui_url = get_setting("comfyui_url", "http://localhost:8188")
    client = ComfyUIClient(comfyui_url)

    filename = client.upload_image(content, file.filename)
    client.close()

    if not filename:
        raise HTTPException(status_code=500, detail="Failed to upload image to ComfyUI")

    # Store the hash for future deduplication
    store_uploaded_image(content_hash, filename, file.filename)

    return {"filename": filename, "original_name": file.filename, "deduplicated": False}


@router.post("/upload/image/base64")
async def upload_image_base64(image_data: str = Form(...), filename: str = Form(...)):
    """Upload a base64 encoded image to ComfyUI.

    Deduplicates based on content hash - if the same image was uploaded before,
    returns the existing filename without re-uploading.
    """
    from database import compute_image_hash, get_image_by_hash, store_uploaded_image

    try:
        # Decode base64
        if "," in image_data:
            image_data = image_data.split(",")[1]
        content = base64.b64decode(image_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 data: {e}")

    # Check if this image was already uploaded (by content hash)
    content_hash = compute_image_hash(content)
    existing = get_image_by_hash(content_hash)

    if existing:
        # Image already exists, return existing filename
        return {
            "filename": existing['comfyui_filename'],
            "original_name": filename,
            "deduplicated": True
        }

    # Upload to ComfyUI
    comfyui_url = get_setting("comfyui_url", "http://localhost:8188")
    client = ComfyUIClient(comfyui_url)

    result_filename = client.upload_image(content, filename)
    client.close()

    if not result_filename:
        raise HTTPException(status_code=500, detail="Failed to upload image to ComfyUI")

    # Store the hash for future deduplication
    store_uploaded_image(content_hash, result_filename, filename)

    return {"filename": result_filename, "original_name": filename, "deduplicated": False}


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

                # Get up to 3 preview images from the folder
                preview_images = []
                try:
                    for img_file in sorted(item.iterdir()):
                        # Skip hidden files and non-image files
                        if img_file.name.startswith('.'):
                            continue
                        if img_file.is_file() and img_file.suffix.lower() in ['.jpg', '.jpeg', '.png']:
                            img_rel = img_file.relative_to(repo_root_path)
                            preview_images.append(str(img_rel).replace("\\", "/"))
                            if len(preview_images) >= 3:
                                break
                except (PermissionError, OSError):
                    pass  # Skip folders we can't read

                folders.append({
                    "name": item.name,
                    "path": str(rel_path).replace("\\", "/"),  # Normalize path separators
                    "preview_images": preview_images
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
    Deduplicates based on content hash - if the same image was uploaded before,
    returns the existing filename without re-uploading.
    """
    from database import compute_image_hash, get_image_by_hash, store_uploaded_image

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

    # Check if this image was already uploaded (by content hash)
    content_hash = compute_image_hash(image_content)
    existing = get_image_by_hash(content_hash)

    if existing:
        # Image already exists, return existing filename without re-uploading
        return {
            "filename": existing['comfyui_filename'],
            "image_url": existing['comfyui_filename'],
            "original_name": full_path.name,
            "original_path": image_path,
            "deduplicated": True
        }

    # Upload to ComfyUI
    comfyui_url = get_setting("comfyui_url", "http://localhost:8188")
    client = ComfyUIClient(comfyui_url)

    try:
        result_filename = client.upload_image(image_content, full_path.name)
        client.close()

        if not result_filename:
            raise HTTPException(status_code=500, detail="Failed to upload image to ComfyUI")

        # Store the hash for future deduplication
        store_uploaded_image(content_hash, result_filename, full_path.name)

        # Return both filename and image_url for compatibility
        return {
            "filename": result_filename,
            "image_url": result_filename,  # For frontend compatibility
            "original_name": full_path.name,
            "original_path": image_path,
            "deduplicated": False
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
