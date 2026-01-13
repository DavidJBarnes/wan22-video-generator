"""Background queue manager for processing ComfyUI jobs with multi-segment support."""

import os
import threading
import time
import urllib.parse
import json
import logging
from pathlib import Path
from typing import Optional, Callable
from datetime import datetime

# Configure logging for better debugging
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

from database import (
    get_pending_jobs,
    get_job,
    update_job_status,
    get_setting,
    get_job_segments,
    get_next_pending_segment,
    update_segment_status,
    update_segment_start_image,
    get_completed_segments_count,
    get_last_active_segment_before,
    parse_loras,
    add_job_log,
    get_segment_queue_time
)
from comfyui_client import ComfyUIClient
from progress_tracker import progress_tracker
from video_utils import (
    download_video_from_comfyui,
    extract_last_frame,
    remux_video,
    stitch_videos,
    get_segment_video_path,
    get_segment_frame_path,
    get_final_video_path
)


class QueueManager:
    """Manages background processing of the job queue."""

    def __init__(self):
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._client: Optional[ComfyUIClient] = None
        self._current_job_id: Optional[int] = None
        self._poll_interval = 2.0  # seconds between queue checks
        self._status_poll_interval = 1.0  # seconds between status checks
        self._on_job_update: Optional[Callable] = None
        self._resumed_segments: set = set()  # Track (job_id, segment_index) being monitored

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def current_job_id(self) -> Optional[int]:
        return self._current_job_id

    def set_job_update_callback(self, callback: Callable):
        """Set callback for job status updates (for WebSocket notifications)."""
        self._on_job_update = callback

    def start(self):
        """Start the queue manager in a background thread."""
        if self._running:
            print("Queue manager already running")
            return

        self._running = True

        # Resume monitoring any segments that were running before restart
        # MUST be called BEFORE starting the main loop to prevent race condition
        # where _process_queue submits new work before resumed segments are tracked
        self._resume_running_segments()

        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        print("Queue manager started")

    def _resume_running_segments(self):
        """Resume monitoring segments that are still running in ComfyUI after backend restart."""
        from database import get_connection

        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT s.job_id, s.segment_index, s.comfyui_prompt_id, j.name
                FROM job_segments s
                JOIN jobs j ON s.job_id = j.id
                WHERE s.status = 'running' AND s.comfyui_prompt_id IS NOT NULL
            """)
            running_segments = cursor.fetchall()

        if not running_segments:
            return

        print(f"[QueueManager] Resuming monitoring of {len(running_segments)} running segment(s)")

        for seg_row in running_segments:
            job_id, segment_index, prompt_id, job_name = seg_row
            print(f"[QueueManager] Resuming segment {segment_index} of job {job_id} ({job_name}), prompt_id={prompt_id}")

            # Track this segment so _process_queue doesn't submit new work
            self._resumed_segments.add((job_id, segment_index))

            # Start a background thread to monitor this segment
            resume_thread = threading.Thread(
                target=self._monitor_resumed_segment,
                args=(job_id, segment_index, prompt_id),
                daemon=True
            )
            resume_thread.start()

    def _monitor_resumed_segment(self, job_id: int, segment_index: int, prompt_id: str):
        """Monitor a segment that was already running in ComfyUI (called in background thread)."""
        try:
            client = self._get_client()
            logger.info(f"[Job {job_id}] Resumed monitoring segment {segment_index}, waiting for completion...")
            add_job_log(job_id, "INFO", f"Backend restarted - resumed monitoring segment {segment_index}",
                       segment_index=segment_index, details=f"prompt_id={prompt_id}")

            # Start progress tracking for the resumed segment with original start time
            comfyui_url = get_setting("comfyui_url") or COMFYUI_SERVER_URL
            queue_time_str = get_segment_queue_time(job_id, segment_index)
            original_start = None
            if queue_time_str:
                # Database stores UTC time, parse and mark as UTC for correct timestamp conversion
                from datetime import timezone
                original_start = datetime.strptime(queue_time_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
            progress_tracker.start_tracking(job_id, segment_index, prompt_id, comfyui_url, started_at=original_start)

            # Use existing completion wait logic
            success = self._wait_for_segment_completion(job_id, segment_index, prompt_id, client)

            if success:
                logger.info(f"[Job {job_id}] Resumed segment {segment_index} completed successfully")
                # Check if job needs to continue or await next prompt
                self._check_job_continuation(job_id)
            else:
                logger.error(f"[Job {job_id}] Resumed segment {segment_index} failed")
                update_job_status(job_id, "failed", error_message=f"Segment {segment_index} failed after backend restart")
                self._notify_update(job_id, "failed")

        except Exception as e:
            logger.error(f"[Job {job_id}] Error monitoring resumed segment {segment_index}: {e}")
            update_segment_status(job_id, segment_index, "failed", error_message=str(e))
            update_job_status(job_id, "failed", error_message=f"Error resuming segment {segment_index}: {str(e)}")
            self._notify_update(job_id, "failed")
        finally:
            # Stop progress tracking
            progress_tracker.stop_tracking(job_id)
            # Remove from tracking so new work can be submitted
            self._resumed_segments.discard((job_id, segment_index))

    def _check_job_continuation(self, job_id: int):
        """Check if a job should continue processing or await user input after a segment completes."""
        job = get_job(job_id)
        if not job:
            return

        segments = get_job_segments(job_id)
        completed_count = sum(1 for s in segments if s.get("status") == "completed")
        pending_count = sum(1 for s in segments if s.get("status") == "pending")

        if pending_count > 0:
            # There are more pending segments - check if next has a prompt
            next_pending = get_next_pending_segment(job_id)
            if next_pending and next_pending.get("prompt"):
                # Next segment has a prompt, continue processing (queue manager will pick it up)
                update_job_status(job_id, "pending")
                self._notify_update(job_id, "pending")
            else:
                # Need user to provide next prompt
                update_job_status(job_id, "awaiting_prompt")
                self._notify_update(job_id, "awaiting_prompt")
        else:
            # All segments completed or no more pending - await next prompt from user
            update_job_status(job_id, "awaiting_prompt")
            self._notify_update(job_id, "awaiting_prompt")
            logger.info(f"[Job {job_id}] All segments complete, awaiting next prompt")

    def stop(self):
        """Stop the queue manager."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5.0)
            self._thread = None
        if self._client:
            self._client.close()
            self._client = None
        print("Queue manager stopped")

    def finalize_job_now(self, job_id: int):
        """Finalize a job immediately (called from finalize endpoint)."""
        print(f"[QueueManager] Finalize request for job {job_id}")
        try:
            self._finalize_job(job_id)
        except Exception as e:
            print(f"[QueueManager] Error finalizing job {job_id}: {e}")
            update_job_status(job_id, "failed", error_message=f"Finalization failed: {str(e)}")

    def _get_client(self) -> ComfyUIClient:
        """Get or create ComfyUI client with current settings."""
        comfyui_url = get_setting("comfyui_url", "http://localhost:8188")

        if self._client is None or self._client.base_url != comfyui_url:
            if self._client:
                self._client.close()
            self._client = ComfyUIClient(comfyui_url)

        return self._client

    def _run_loop(self):
        """Main processing loop."""
        while self._running:
            try:
                self._process_queue()
            except Exception as e:
                print(f"Queue processing error: {e}")

            # Wait before next check
            time.sleep(self._poll_interval)

    def _process_queue(self):
        """Process the next pending job if any."""
        # Don't submit new work if we're still monitoring resumed segments from backend restart
        if self._resumed_segments:
            print(f"[QueueManager] Waiting for {len(self._resumed_segments)} resumed segment(s) to complete before processing new jobs")
            return

        # Check for pending jobs
        pending_jobs = get_pending_jobs()
        print(f"[QueueManager] Checking queue: {len(pending_jobs)} pending jobs")
        if not pending_jobs:
            return

        # Get the next job
        job = pending_jobs[0]
        job_id = job["id"]
        self._current_job_id = job_id

        print(f"[QueueManager] Processing job {job_id}: {job['name']}")
        print(f"[QueueManager] Job details: workflow_type={job.get('workflow_type')}, input_image={job.get('input_image')}")
        add_job_log(job_id, "INFO", "Job processing started", details=f"workflow_type={job.get('workflow_type')}")

        try:
            # Get ComfyUI client
            client = self._get_client()
            comfyui_url = get_setting("comfyui_url", "http://localhost:8188")
            print(f"[QueueManager] Using ComfyUI URL: {comfyui_url}")

            # Check ComfyUI connection
            connected, msg = client.check_connection()
            print(f"[QueueManager] ComfyUI connection check: connected={connected}, msg={msg}")
            if not connected:
                print(f"[QueueManager] ComfyUI not available: {msg}")
                add_job_log(job_id, "WARN", "ComfyUI not available, waiting", details=msg)
                # Don't fail the job, just wait
                self._current_job_id = None
                return

            # Log connection but keep job pending until segment is actually submitted
            add_job_log(job_id, "INFO", "Connected to ComfyUI", details=comfyui_url)

            # Process segments one by one
            self._process_job_segments(job_id, job, client)

        except Exception as e:
            print(f"Error processing job {job_id}: {e}")
            import traceback
            traceback.print_exc()
            add_job_log(job_id, "ERROR", "Job processing failed with exception", details=str(e))
            update_job_status(job_id, "failed", error_message=str(e))
            self._notify_update(job_id, "failed")
        finally:
            self._current_job_id = None

    def _process_job_segments(self, job_id: int, job: dict, client: ComfyUIClient):
        """Process all segments for a job sequentially (on-demand workflow).

        After each segment completes, the job pauses and waits for the user to either:
        1. Provide a prompt for the next segment (continues)
        2. Click "Finalize & Merge" (completes the job)
        """
        # Get all segments
        segments = get_job_segments(job_id)
        if not segments:
            print(f"[QueueManager] No segments found for job {job_id}, treating as single segment")
            # Fall back to single-segment processing
            self._process_single_segment_job(job_id, job, client)
            return

        print(f"[QueueManager] Job {job_id} has {len(segments)} segment(s)")

        # Process each segment that has a prompt and isn't completed yet
        for segment in segments:
            if not self._running:
                print(f"[QueueManager] Queue manager stopped, aborting job {job_id}")
                return

            segment_index = segment["segment_index"]

            # Skip already completed segments
            if segment["status"] == "completed":
                print(f"[QueueManager] Segment {segment_index} already completed, skipping")
                continue

            # Check if segment has a prompt (required for all segments)
            if not segment.get("prompt"):
                print(f"[QueueManager] Segment {segment_index} has no prompt yet, waiting for user input")
                update_job_status(job_id, "awaiting_prompt")
                self._notify_update(job_id, "awaiting_prompt")
                return  # Stop processing, will resume when user provides prompt

            # Check if segment has a start image (required for all segments)
            if segment_index > 0 and not segment.get("start_image_url"):
                # Find the last non-deleted, completed segment to use as start image
                # This handles cases where earlier segments were soft-deleted
                prev_segment = get_last_active_segment_before(job_id, segment_index)
                if prev_segment and prev_segment.get("end_frame_url"):
                    # Use the previous active segment's end frame
                    update_segment_start_image(job_id, segment_index, prev_segment["end_frame_url"])
                    segment["start_image_url"] = prev_segment["end_frame_url"]
                elif job.get("input_image"):
                    # No active previous segment - use the job's original input image
                    comfyui_url = get_setting("comfyui_url", "http://localhost:8188")
                    input_image = job["input_image"]
                    if input_image.startswith("http"):
                        start_url = input_image
                    else:
                        start_url = f"{comfyui_url}/view?filename={input_image}&subfolder=&type=input"
                    update_segment_start_image(job_id, segment_index, start_url)
                    segment["start_image_url"] = start_url
                    print(f"[QueueManager] Segment {segment_index} using original input image (previous segments deleted)")
                else:
                    print(f"[QueueManager] Segment {segment_index} missing start image, no fallback available")
                    continue

            # Process this segment
            success = self._process_segment(job_id, job, segment, client)

            if not success:
                # Use 1-based segment number for user-facing error message
                print(f"[QueueManager] Segment {segment_index} failed, stopping job")
                # Get the segment's error message for a more helpful job error
                updated_segment = get_job_segments(job_id)[segment_index] if segment_index < len(get_job_segments(job_id)) else None
                segment_error = updated_segment.get("error_message") if updated_segment else None
                job_error = f"Segment {segment_index + 1} failed: {segment_error}" if segment_error else f"Segment {segment_index + 1} failed"
                add_job_log(job_id, "ERROR", f"Segment {segment_index} failed, stopping job", segment_index=segment_index, details=segment_error)
                update_job_status(job_id, "failed", error_message=job_error)
                self._notify_update(job_id, "failed")
                return

        # After processing all segments that have prompts, check if user wants to continue or finalize
        # If we reach here, all existing segments are completed
        # The job should go to awaiting_prompt to let user decide: add more segments OR finalize

        # Re-fetch segments to get updated status
        segments = get_job_segments(job_id)
        print(f"[QueueManager] Re-fetched segments for final check: {len(segments)} total")
        for seg in segments:
            print(f"[QueueManager]   Segment {seg['segment_index']}: status={seg.get('status')}, has_prompt={bool(seg.get('prompt'))}")

        completed_count = len([s for s in segments if s.get("status") == "completed"])
        print(f"[QueueManager] Completed count: {completed_count}")

        if completed_count > 0:
            # Check if auto_finalize is enabled
            params = job.get("parameters") or {}
            if isinstance(params, str):
                try:
                    params = json.loads(params)
                except:
                    params = {}

            if params.get("auto_finalize"):
                print(f"[QueueManager] Auto-finalize enabled, finalizing job {job_id}")
                self._finalize_job(job_id)
            else:
                print(f"[QueueManager] {completed_count} segment(s) completed. Awaiting user decision: continue or finalize")
                update_job_status(job_id, "awaiting_prompt")
                self._notify_update(job_id, "awaiting_prompt")
        else:
            # No segments completed - something went wrong
            print(f"[QueueManager] ERROR: No segments completed for job {job_id}")
            update_job_status(job_id, "failed", error_message="No segments were successfully processed")
            self._notify_update(job_id, "failed")

    def _process_segment(self, job_id: int, job: dict, segment: dict, client: ComfyUIClient) -> bool:
        """Process a single segment and return True if successful.

        Implements retry logic for prompt lost scenarios:
        - If prompt is lost, wait and re-check up to 3 times
        - If still lost, re-submit the workflow
        - Only fail after re-submission also fails
        """
        segment_index = segment["segment_index"]
        max_retries = 2  # Total attempts = 1 original + 2 retries
        retry_count = 0

        while retry_count <= max_retries:
            if retry_count > 0:
                logger.info(f"[Job {job_id}] Retrying segment {segment_index} (attempt {retry_count + 1}/{max_retries + 1})")
                add_job_log(job_id, "INFO", f"Retrying segment {segment_index}",
                           segment_index=segment_index, details=f"attempt {retry_count + 1}/{max_retries + 1}")
                # Wait before retry
                time.sleep(10)

            result = self._process_segment_attempt(job_id, job, segment, client)

            if result is True:
                return True
            elif result == "prompt_lost":
                retry_count += 1
                if retry_count <= max_retries:
                    logger.warning(f"[Job {job_id}] Segment {segment_index} prompt lost, will retry ({retry_count}/{max_retries})")
                else:
                    logger.error(f"[Job {job_id}] Segment {segment_index} prompt lost after {max_retries} retries")
                    add_job_log(job_id, "ERROR", f"Segment {segment_index} failed - prompt lost after retries",
                               segment_index=segment_index, details=f"Exhausted {max_retries} retries")
                    update_segment_status(job_id, segment_index, "failed",
                                         error_message=f"ComfyUI prompt lost after {max_retries} retries")
                    return False
            else:
                # Hard failure (not prompt_lost)
                return False

        return False

    def _process_segment_attempt(self, job_id: int, job: dict, segment: dict, client: ComfyUIClient):
        """Single attempt to process a segment. Returns True, False, or "prompt_lost"."""
        segment_index = segment["segment_index"]
        print(f"[QueueManager] Processing segment {segment_index} for job {job_id}")

        # Health check before submission
        health = client.health_check()
        logger.info(f"[Job {job_id}] ComfyUI health check: healthy={health['healthy']}, "
                   f"connected={health['connected']}, queue_ready={health['queue_ready']}")
        add_job_log(job_id, "INFO", f"ComfyUI health check before segment {segment_index}",
                   segment_index=segment_index,
                   details=f"healthy={health['healthy']}, connected={health['connected']}, "
                          f"queue={health['details'].get('queue_running', 0)} running/"
                          f"{health['details'].get('queue_pending', 0)} pending")

        if not health["connected"]:
            logger.warning(f"[Job {job_id}] ComfyUI not connected: {health['error']}")
            add_job_log(job_id, "WARN", "ComfyUI health check failed - not connected",
                       segment_index=segment_index, details=health['error'])
            # Don't fail immediately, wait for reconnection (existing logic handles this)

        # Update segment status to running
        update_segment_status(job_id, segment_index, "running")
        
        # Get job parameters
        params = job.get("parameters") or {}
        target_fps = int(params.get("target_fps", get_setting("default_target_fps", "30")))
        segment_duration = float(params.get("segment_duration", 5))
        
        # Determine the start image for this segment
        # Check for custom start image first (overrides default behavior)
        custom_start_image = segment.get("custom_start_image")
        if custom_start_image and segment_index > 0:
            # Check if it's a ComfyUI filename (prefixed with "comfyui:")
            if custom_start_image.startswith("comfyui:"):
                # Use the ComfyUI filename directly (already in ComfyUI input folder)
                input_image = custom_start_image[8:]  # Strip "comfyui:" prefix
                print(f"[QueueManager] Segment {segment_index} using ComfyUI image directly: {input_image}")
            else:
                # Upload custom image from image repo to ComfyUI
                input_image = self._upload_custom_start_image(custom_start_image, client)
                if not input_image:
                    print(f"[QueueManager] Failed to upload custom start image for segment {segment_index}")
                    update_segment_status(job_id, segment_index, "failed", error_message="Failed to upload custom start image")
                    return False
                print(f"[QueueManager] Segment {segment_index} using CUSTOM start image: {input_image}")
        elif segment_index == 0:
            # First segment uses the job's input image
            input_image = job.get("input_image")
        else:
            # Subsequent segments use the previous segment's last frame
            # The start_image_url should already be set
            start_image_url = segment.get("start_image_url")
            if start_image_url:
                # Extract filename from URL if it's a ComfyUI view URL
                if "filename=" in start_image_url:
                    parsed = urllib.parse.urlparse(start_image_url)
                    query_params = urllib.parse.parse_qs(parsed.query)
                    input_image = query_params.get("filename", [None])[0]
                else:
                    input_image = start_image_url
            else:
                print(f"[QueueManager] Segment {segment_index} has no start image!")
                update_segment_status(job_id, segment_index, "failed", error_message="No start image")
                return False
        
        print(f"[QueueManager] Segment {segment_index} using input_image: {input_image}")

        # Parse LoRA selections for this segment (supports 0-2 LoRA pairs)
        # Each parse_loras returns list of dicts: [{"file": "...", "weight": 1.0}, ...]
        high_loras = parse_loras(segment.get("high_lora"))
        low_loras = parse_loras(segment.get("low_lora"))

        # Build loras list for workflow builder with weights
        loras = []
        for i in range(max(len(high_loras), len(low_loras))):
            high_lora = high_loras[i] if i < len(high_loras) else None
            low_lora = low_loras[i] if i < len(low_loras) else None
            if high_lora or low_lora:
                lora_entry = {}
                if high_lora:
                    lora_entry["high_file"] = high_lora.get("file")
                    lora_entry["high_weight"] = high_lora.get("weight", 1.0)
                if low_lora:
                    lora_entry["low_file"] = low_lora.get("file")
                    lora_entry["low_weight"] = low_lora.get("weight", 1.0)
                loras.append(lora_entry)

        print(f"[QueueManager] Segment {segment_index} LoRA pairs: {loras}")
        
        # Check if ComfyUI queue is idle before submitting
        queue_status = client.get_queue_status()

        # Handle connection loss - wait for reconnection instead of failing
        if not queue_status.get("connected", True):
            logger.warning(f"[Job {job_id}] ComfyUI not connected: {queue_status.get('error')}. Waiting for reconnection...")
            add_job_log(job_id, "WARN", "ComfyUI connection lost, waiting for reconnection",
                       segment_index=segment_index, details=queue_status.get('error'))

            reconnect_wait = 0
            max_reconnect_wait = int(get_setting("comfyui_reconnect_timeout", "600"))  # 10 min default
            while not queue_status.get("connected", False) and reconnect_wait < max_reconnect_wait and self._running:
                time.sleep(10)
                reconnect_wait += 10
                queue_status = client.get_queue_status()
                if reconnect_wait % 60 == 0:
                    logger.info(f"[Job {job_id}] Still waiting for ComfyUI reconnection... ({reconnect_wait}s elapsed)")

            if not queue_status.get("connected", False):
                error_msg = f"ComfyUI connection not restored after {max_reconnect_wait // 60} minutes"
                logger.error(f"[Job {job_id}] Segment {segment_index}: {error_msg}")
                add_job_log(job_id, "ERROR", "ComfyUI reconnection timeout", segment_index=segment_index, details=error_msg)
                update_segment_status(job_id, segment_index, "failed", error_message=error_msg)
                return False

            logger.info(f"[Job {job_id}] ComfyUI reconnected after {reconnect_wait}s")
            add_job_log(job_id, "INFO", "ComfyUI reconnected", segment_index=segment_index)

        queue_running = queue_status.get("queue_running", [])
        queue_pending = queue_status.get("queue_pending", [])

        if len(queue_running) > 0 or len(queue_pending) > 0:
            logger.info(f"[Job {job_id}] ComfyUI queue is busy. Running: {len(queue_running)}, Pending: {len(queue_pending)}. Waiting for it to finish...")

            # Wait for queue to clear (configurable timeout, default 30 minutes)
            wait_time = 0
            max_wait = int(get_setting("queue_wait_timeout", "1800"))  # seconds
            while (len(queue_running) > 0 or len(queue_pending) > 0) and wait_time < max_wait and self._running:
                time.sleep(10)  # Check every 10 seconds
                wait_time += 10
                queue_status = client.get_queue_status()

                # Check for connection loss during wait
                if not queue_status.get("connected", True):
                    logger.warning(f"[Job {job_id}] Lost connection to ComfyUI during queue wait: {queue_status.get('error')}")
                    add_job_log(job_id, "WARN", "Lost ComfyUI connection during queue wait", segment_index=segment_index)
                    # Wait for reconnection
                    reconnect_wait = 0
                    max_reconnect_wait = int(get_setting("comfyui_reconnect_timeout", "600"))
                    while not queue_status.get("connected", False) and reconnect_wait < max_reconnect_wait and self._running:
                        time.sleep(10)
                        reconnect_wait += 10
                        wait_time += 10  # Count towards total wait time
                        queue_status = client.get_queue_status()
                        if reconnect_wait % 60 == 0:
                            logger.info(f"[Job {job_id}] Waiting for ComfyUI reconnection... ({reconnect_wait}s)")

                    if not queue_status.get("connected", False):
                        error_msg = f"ComfyUI connection not restored after {max_reconnect_wait // 60} minutes"
                        logger.error(f"[Job {job_id}] Segment {segment_index}: {error_msg}")
                        add_job_log(job_id, "ERROR", "ComfyUI reconnection timeout during queue wait", segment_index=segment_index)
                        update_segment_status(job_id, segment_index, "failed", error_message=error_msg)
                        return False

                    logger.info(f"[Job {job_id}] ComfyUI reconnected, continuing queue wait")
                    add_job_log(job_id, "INFO", "ComfyUI reconnected during queue wait", segment_index=segment_index)

                queue_running = queue_status.get("queue_running", [])
                queue_pending = queue_status.get("queue_pending", [])
                if wait_time % 60 == 0:  # Log every minute
                    logger.info(f"[Job {job_id}] Still waiting for ComfyUI queue... Running: {len(queue_running)}, Pending: {len(queue_pending)} ({wait_time}s elapsed)")

            if wait_time >= max_wait:
                error_msg = f"ComfyUI queue did not clear after {max_wait // 60} minutes. Queue had {len(queue_running)} running and {len(queue_pending)} pending jobs."
                logger.error(f"[Job {job_id}] Segment {segment_index}: {error_msg}")
                update_segment_status(job_id, segment_index, "failed", error_message=error_msg)
                return False

            logger.info(f"[Job {job_id}] ComfyUI queue cleared after {wait_time}s, proceeding with segment {segment_index}")

        # Build the workflow using the Wan2.2 i2v workflow builder directly
        # This ensures LoRA parameters are passed correctly
        # Build output prefix from job name
        job_name = job.get("name", f"job_{job_id}")
        output_prefix = f"{job_name}_seg{segment_index}"

        # Get faceswap settings from segment (per-segment faceswap)
        faceswap_enabled = bool(segment.get("faceswap_enabled", 0))
        faceswap_image = segment.get("faceswap_image", "") or ""
        faceswap_faces_order = segment.get("faceswap_faces_order", "left-right") or "left-right"
        faceswap_faces_index = segment.get("faceswap_faces_index", "0") or "0"

        # Use the job's seed for all segments (fixed seed per job)
        job_seed = job.get("seed")
        if job_seed is not None:
            logger.info(f"[Job {job_id}] Using fixed seed {job_seed} for segment {segment_index}")

        workflow = client.build_wan_i2v_workflow(
            prompt=segment.get("prompt") or job.get("prompt", ""),
            negative_prompt=job.get("negative_prompt", get_setting("default_negative_prompt", "")),
            width=int(params.get("width", get_setting("default_width", "640"))),
            height=int(params.get("height", get_setting("default_height", "640"))),
            duration_sec=segment_duration,
            target_fps=target_fps,
            start_image_filename=input_image,
            high_noise_model=get_setting("high_noise_model", "wan2.2_i2v_high_noise_14B_fp16.safetensors"),
            low_noise_model=get_setting("low_noise_model", "wan2.2_i2v_low_noise_14B_fp16.safetensors"),
            seed=job_seed,
            loras=loras if loras else None,
            output_prefix=output_prefix,
            faceswap_enabled=faceswap_enabled,
            faceswap_image=faceswap_image,
            faceswap_faces_order=faceswap_faces_order,
            faceswap_faces_index=faceswap_faces_index,
        )

        # Queue the prompt
        logger.info(f"[Job {job_id}] Queuing segment {segment_index} workflow to ComfyUI...")
        add_job_log(job_id, "INFO", f"Queuing segment {segment_index} to ComfyUI", segment_index=segment_index,
                   details=f"image={input_image}, {params.get('width', 640)}x{params.get('height', 640)}, {segment_duration}s @ {target_fps}fps")
        success, result = client.queue_prompt(workflow)
        logger.info(f"[Job {job_id}] queue_prompt result: success={success}, result={result[:200] if isinstance(result, str) else result}")

        if not success:
            # Log detailed workflow info on failure for debugging
            workflow_summary = {
                "prompt": (segment.get("prompt") or job.get("prompt", ""))[:100] + "...",
                "input_image": input_image,
                "dimensions": f"{params.get('width', 640)}x{params.get('height', 640)}",
                "duration_sec": segment_duration,
                "target_fps": target_fps,
                "loras": loras,
            }
            logger.error(f"[Job {job_id}] Segment {segment_index} FAILED to queue!")
            logger.error(f"[Job {job_id}] Error: {result}")
            logger.error(f"[Job {job_id}] Workflow summary: {json.dumps(workflow_summary, indent=2)}")

            # Provide more helpful error message to user
            error_msg = result
            if "not found" in result.lower():
                error_msg = f"ComfyUI error: {result}. Check that the input image and LoRA files exist."
            elif "node" in result.lower():
                error_msg = f"ComfyUI workflow error: {result}. There may be a missing node or invalid configuration."

            add_job_log(job_id, "ERROR", f"Segment {segment_index} failed to queue", segment_index=segment_index, details=error_msg)
            update_segment_status(job_id, segment_index, "failed", error_message=error_msg)
            return False

        prompt_id = result
        add_job_log(job_id, "INFO", f"Segment {segment_index} queued successfully", segment_index=segment_index, details=f"prompt_id={prompt_id}")
        update_segment_status(job_id, segment_index, "running", comfyui_prompt_id=prompt_id)
        # NOW set job to running (segment is actually submitted to ComfyUI)
        update_job_status(job_id, "running")
        self._notify_update(job_id, "running")

        # Start progress tracking via WebSocket
        comfyui_url = get_setting("comfyui_url", "http://localhost:8188")
        progress_tracker.start_tracking(job_id, segment_index, prompt_id, comfyui_url)

        # Wait for completion
        return self._wait_for_segment_completion(job_id, segment_index, prompt_id, client)

    def _wait_for_segment_completion(self, job_id: int, segment_index: int, prompt_id: str, client: ComfyUIClient) -> bool:
        """Wait for a segment to complete and process its outputs."""
        comfyui_url = get_setting("comfyui_url", "http://localhost:8188")
        max_wait = int(get_setting("segment_execution_timeout", "1200"))  # configurable, default 20 min
        waited = 0
        consecutive_errors = 0
        max_consecutive_errors = 30  # Allow ~30 seconds of connection issues before logging warnings

        while self._running and waited < max_wait:
            status = client.get_prompt_status(prompt_id)

            # Handle connection errors during execution
            if status.get("status") == "error" and "connect" in status.get("error", "").lower():
                consecutive_errors += 1
                if consecutive_errors == max_consecutive_errors:
                    logger.warning(f"[Job {job_id}] Lost connection to ComfyUI during segment {segment_index} execution")
                    add_job_log(job_id, "WARN", f"Lost ComfyUI connection during segment {segment_index} execution",
                               segment_index=segment_index, details=status.get("error"))

                # Wait for reconnection
                if consecutive_errors >= max_consecutive_errors:
                    max_reconnect_wait = int(get_setting("comfyui_reconnect_timeout", "600"))
                    if consecutive_errors * self._status_poll_interval >= max_reconnect_wait:
                        error_msg = f"ComfyUI connection not restored after {max_reconnect_wait // 60} minutes during segment execution"
                        logger.error(f"[Job {job_id}] Segment {segment_index}: {error_msg}")
                        add_job_log(job_id, "ERROR", "ComfyUI reconnection timeout during execution",
                                   segment_index=segment_index, details=error_msg)
                        update_segment_status(job_id, segment_index, "failed", error_message=error_msg)
                        return False

                time.sleep(self._status_poll_interval)
                waited += self._status_poll_interval
                continue

            # Reset consecutive errors on successful connection
            if consecutive_errors > 0 and status.get("status") != "error":
                logger.info(f"[Job {job_id}] ComfyUI connection restored during segment {segment_index} execution")
                if consecutive_errors >= max_consecutive_errors:
                    add_job_log(job_id, "INFO", "ComfyUI reconnected during segment execution", segment_index=segment_index)
                consecutive_errors = 0

            if status.get("status") == "completed":
                # Extract output media URLs from the status data (don't fetch again - history might be cleared)
                completion_data = status.get("data", {})
                media_urls = client.extract_media_urls_from_data(completion_data)
                print(f"[QueueManager] Segment {segment_index} completed with {len(media_urls)} outputs")
                print(f"[QueueManager] Media URLs: {media_urls}")

                # Find the video output (mp4/webm)
                video_url = None
                for url in media_urls:
                    print(f"[QueueManager] Checking URL: {url}")
                    if any(ext in url.lower() for ext in ['.mp4', '.webm', '.gif']):
                        video_url = url
                        print(f"[QueueManager] Found video URL: {video_url}")
                        break
                
                if video_url:
                    # Download the video
                    video_path = get_segment_video_path(job_id, segment_index)
                    print(f"[QueueManager] Downloading video from {video_url} to {video_path}")
                    if download_video_from_comfyui(video_url, video_path):
                        print(f"[QueueManager] Video downloaded successfully")
                        # Remux to fix duration metadata (VHS_VideoCombine issue)
                        remux_video(video_path)
                        # Extract the last frame
                        frame_path = get_segment_frame_path(job_id, segment_index, "last")
                        print(f"[QueueManager] Extracting last frame to {frame_path}")
                        if extract_last_frame(video_path, frame_path):
                            print(f"[QueueManager] Last frame extracted successfully")
                            # Read the frame and upload it to ComfyUI
                            with open(frame_path, "rb") as f:
                                frame_data = f.read()

                            print(f"[QueueManager] Uploading last frame to ComfyUI ({len(frame_data)} bytes)")
                            uploaded_filename = client.upload_image(frame_data, f"job_{job_id}_seg_{segment_index}_last.jpg")

                            if uploaded_filename:
                                print(f"[QueueManager] Last frame uploaded as {uploaded_filename}")
                                # Build the URL for the uploaded frame
                                end_frame_url = f"{comfyui_url}/view?filename={uploaded_filename}&subfolder=&type=input"

                                # Get execution time from the completion data (don't fetch again)
                                exec_time = client.extract_execution_time_from_data(completion_data)

                                # Update segment with video path, end frame URL, and execution time
                                update_segment_status(
                                    job_id, segment_index, "completed",
                                    video_path=video_path,
                                    end_frame_url=end_frame_url,
                                    execution_time=exec_time
                                )

                                # Update the next segment's start image
                                update_segment_start_image(job_id, segment_index + 1, end_frame_url)

                                exec_time_str = f"{exec_time:.1f}s" if exec_time else "unknown"
                                add_job_log(job_id, "INFO", f"Segment {segment_index} completed", segment_index=segment_index,
                                           details=f"execution_time={exec_time_str}, video={video_path}")
                                logger.info(f"[Job {job_id}] Segment {segment_index} fully processed")
                                # Stop progress tracking
                                progress_tracker.stop_tracking(job_id)
                                return True
                            else:
                                error_msg = f"Failed to upload last frame to ComfyUI for segment {segment_index}"
                                logger.error(f"[Job {job_id}] {error_msg}")
                                add_job_log(job_id, "ERROR", f"Segment {segment_index} frame upload failed", segment_index=segment_index, details=error_msg)
                                update_segment_status(job_id, segment_index, "failed", error_message=error_msg)
                                progress_tracker.stop_tracking(job_id)
                                return False
                        else:
                            error_msg = f"Failed to extract last frame from video at {video_path}"
                            logger.error(f"[Job {job_id}] {error_msg}")
                            add_job_log(job_id, "ERROR", f"Segment {segment_index} frame extraction failed", segment_index=segment_index, details=error_msg)
                            update_segment_status(job_id, segment_index, "failed", error_message=error_msg)
                            progress_tracker.stop_tracking(job_id)
                            return False
                    else:
                        error_msg = f"Failed to download video from ComfyUI: {video_url}"
                        logger.error(f"[Job {job_id}] {error_msg}")
                        add_job_log(job_id, "ERROR", f"Segment {segment_index} video download failed", segment_index=segment_index, details=error_msg)
                        update_segment_status(job_id, segment_index, "failed", error_message=error_msg)
                        progress_tracker.stop_tracking(job_id)
                        return False
                else:
                    error_msg = f"No video output found for segment {segment_index}. ComfyUI reported completion but returned no video. Media URLs: {media_urls}"
                    logger.error(f"[Job {job_id}] {error_msg}")
                    add_job_log(job_id, "ERROR", f"Segment {segment_index} has no video output", segment_index=segment_index, details=error_msg)
                    update_segment_status(job_id, segment_index, "failed", error_message="No video output from ComfyUI")
                    progress_tracker.stop_tracking(job_id)
                    return False

                # If we got here, something failed in post-processing
                add_job_log(job_id, "ERROR", f"Segment {segment_index} post-processing failed", segment_index=segment_index)
                update_segment_status(job_id, segment_index, "failed", error_message="Post-processing failed")
                progress_tracker.stop_tracking(job_id)
                return False
            
            if status.get("status") == "error":
                error = status.get("error", "Unknown error")
                logger.error(f"[Job {job_id}] Segment {segment_index} reported error from ComfyUI: {error}")
                add_job_log(job_id, "ERROR", f"Segment {segment_index} failed - ComfyUI error", segment_index=segment_index, details=error)
                update_segment_status(job_id, segment_index, "failed", error_message=f"ComfyUI error: {error}")
                progress_tracker.stop_tracking(job_id)
                return False

            if status.get("status") == "not_found":
                # Prompt lost - this is where we implement retry logic
                # Signal to caller that prompt was lost (will be handled by _process_segment)
                logger.warning(f"[Job {job_id}] Segment {segment_index}: Prompt {prompt_id} not found in ComfyUI")
                add_job_log(job_id, "WARN", f"Segment {segment_index} prompt lost - will retry",
                           segment_index=segment_index, details=f"prompt_id={prompt_id}")
                progress_tracker.stop_tracking(job_id)
                # Return special value to indicate prompt lost (not a hard failure)
                return "prompt_lost"

            time.sleep(self._status_poll_interval)
            waited += self._status_poll_interval

        # Timeout
        if waited >= max_wait:
            error_msg = f"Segment {segment_index} timed out after {max_wait}s waiting for ComfyUI to complete"
            logger.error(f"[Job {job_id}] {error_msg}")
            add_job_log(job_id, "ERROR", f"Segment {segment_index} timed out", segment_index=segment_index,
                       details=f"Waited {max_wait}s (limit: {max_wait}s). Consider increasing segment_execution_timeout in Settings.")
            update_segment_status(job_id, segment_index, "failed", error_message=error_msg)
            progress_tracker.stop_tracking(job_id)
            return False

        progress_tracker.stop_tracking(job_id)
        return False

    def _upload_custom_start_image(self, image_path: str, client: ComfyUIClient) -> Optional[str]:
        """Upload a custom start image from the image repo to ComfyUI.

        Args:
            image_path: Path to the image within the image repo (relative path)
            client: ComfyUI client instance

        Returns:
            The ComfyUI filename of the uploaded image, or None if upload failed
        """
        from database import compute_image_hash, get_image_by_hash, store_uploaded_image

        repo_root = get_setting("image_repo_path", "")
        if not repo_root:
            print(f"[QueueManager] Image repository path not configured")
            return None

        repo_root_path = Path(repo_root)
        full_path = (repo_root_path / image_path).resolve()

        # Security: Ensure path is within repo root
        if not str(full_path).startswith(str(repo_root_path.resolve())):
            print(f"[QueueManager] Custom image path is outside repository: {image_path}")
            return None

        if not full_path.exists() or not full_path.is_file():
            print(f"[QueueManager] Custom image not found: {full_path}")
            return None

        # Check file extension
        if full_path.suffix.lower() not in ['.jpg', '.jpeg', '.png']:
            print(f"[QueueManager] Unsupported image format: {full_path.suffix}")
            return None

        try:
            # Read the image file
            with open(full_path, 'rb') as f:
                image_content = f.read()

            # Check if this image was already uploaded (by content hash)
            content_hash = compute_image_hash(image_content)
            existing = get_image_by_hash(content_hash)

            if existing:
                # Image already exists, return existing filename without re-uploading
                print(f"[QueueManager] Custom image already in ComfyUI (deduplicated): {existing['comfyui_filename']}")
                return existing['comfyui_filename']

            # Upload to ComfyUI
            result_filename = client.upload_image(image_content, full_path.name)

            if not result_filename:
                print(f"[QueueManager] Failed to upload custom image to ComfyUI")
                return None

            # Store the hash for future deduplication
            store_uploaded_image(content_hash, result_filename, full_path.name)

            print(f"[QueueManager] Uploaded custom start image: {result_filename}")
            return result_filename

        except Exception as e:
            print(f"[QueueManager] Error uploading custom start image: {e}")
            return None

    def _finalize_job(self, job_id: int):
        """Finalize a job by stitching all completed (non-deleted) segment videos together."""
        # Get job info for naming the final video
        job = get_job(job_id)
        job_name = job.get("name", f"job_{job_id}")

        # Get all completed segments (excluding deleted ones)
        segments = get_job_segments(job_id)
        completed_segments = [s for s in segments if s.get("status") == "completed" and not s.get("deleted_at")]

        print(f"[QueueManager] Finalizing job {job_id} - stitching {len(completed_segments)} segment(s) (deleted segments excluded)")

        # Collect all segment video paths and metadata for fade effects
        video_paths = []
        segment_info = []
        for segment in completed_segments:
            segment_index = segment["segment_index"]
            video_path = get_segment_video_path(job_id, segment_index)
            if video_path and os.path.exists(video_path):
                video_paths.append(video_path)
                # Include segment metadata for fade-to-black effect
                segment_info.append({
                    "fade_to_black": bool(segment.get("fade_to_black", 0))
                })
            else:
                print(f"[QueueManager] Warning: Segment {segment_index} video not found at {video_path}")

        if not video_paths:
            print(f"[QueueManager] No segment videos found for job {job_id}")
            update_job_status(job_id, "failed", error_message="No segment videos to stitch")
            self._notify_update(job_id, "failed")
            return

        # Stitch videos together with descriptive filename
        final_video_path = get_final_video_path(job_id, job_name)
        if stitch_videos(video_paths, final_video_path, segment_info=segment_info):
            # Update job with final video path
            update_job_status(job_id, "completed", output_images=[final_video_path])
            self._notify_update(job_id, "completed")
            print(f"[QueueManager] Job {job_id} completed! Final video: {final_video_path}")
        else:
            update_job_status(job_id, "failed", error_message="Failed to stitch videos")
            self._notify_update(job_id, "failed")

    def _process_single_segment_job(self, job_id: int, job: dict, client: ComfyUIClient):
        """Process a job as a single segment (legacy behavior)."""
        print(f"[QueueManager] Processing job {job_id} as single segment")

        params = job.get("parameters") or {}
        target_fps = int(params.get("target_fps", get_setting("default_target_fps", "30")))
        segment_duration = float(params.get("segment_duration", 5))

        # Check if ComfyUI queue is idle before submitting
        queue_status = client.get_queue_status()

        # Handle connection loss - wait for reconnection instead of failing
        if not queue_status.get("connected", True):
            logger.warning(f"[Job {job_id}] ComfyUI not connected: {queue_status.get('error')}. Waiting for reconnection...")
            add_job_log(job_id, "WARN", "ComfyUI connection lost, waiting for reconnection", details=queue_status.get('error'))

            reconnect_wait = 0
            max_reconnect_wait = int(get_setting("comfyui_reconnect_timeout", "600"))  # 10 min default
            while not queue_status.get("connected", False) and reconnect_wait < max_reconnect_wait and self._running:
                time.sleep(10)
                reconnect_wait += 10
                queue_status = client.get_queue_status()
                if reconnect_wait % 60 == 0:
                    logger.info(f"[Job {job_id}] Still waiting for ComfyUI reconnection... ({reconnect_wait}s elapsed)")

            if not queue_status.get("connected", False):
                error_msg = f"ComfyUI connection not restored after {max_reconnect_wait // 60} minutes"
                logger.error(f"[Job {job_id}] {error_msg}")
                add_job_log(job_id, "ERROR", "ComfyUI reconnection timeout", details=error_msg)
                update_job_status(job_id, "failed", error_message=error_msg)
                self._notify_update(job_id, "failed")
                return

            logger.info(f"[Job {job_id}] ComfyUI reconnected after {reconnect_wait}s")
            add_job_log(job_id, "INFO", "ComfyUI reconnected")

        queue_running = queue_status.get("queue_running", [])
        queue_pending = queue_status.get("queue_pending", [])

        if len(queue_running) > 0 or len(queue_pending) > 0:
            logger.info(f"[Job {job_id}] ComfyUI queue is busy. Running: {len(queue_running)}, Pending: {len(queue_pending)}. Waiting for it to finish...")

            # Wait for queue to clear (configurable timeout, default 30 minutes)
            wait_time = 0
            max_wait = int(get_setting("queue_wait_timeout", "1800"))  # seconds
            while (len(queue_running) > 0 or len(queue_pending) > 0) and wait_time < max_wait and self._running:
                time.sleep(10)
                wait_time += 10
                queue_status = client.get_queue_status()

                # Check for connection loss during wait
                if not queue_status.get("connected", True):
                    logger.warning(f"[Job {job_id}] Lost connection to ComfyUI during queue wait: {queue_status.get('error')}")
                    add_job_log(job_id, "WARN", "Lost ComfyUI connection during queue wait")
                    # Wait for reconnection
                    reconnect_wait = 0
                    max_reconnect_wait = int(get_setting("comfyui_reconnect_timeout", "600"))
                    while not queue_status.get("connected", False) and reconnect_wait < max_reconnect_wait and self._running:
                        time.sleep(10)
                        reconnect_wait += 10
                        wait_time += 10  # Count towards total wait time
                        queue_status = client.get_queue_status()
                        if reconnect_wait % 60 == 0:
                            logger.info(f"[Job {job_id}] Waiting for ComfyUI reconnection... ({reconnect_wait}s)")

                    if not queue_status.get("connected", False):
                        error_msg = f"ComfyUI connection not restored after {max_reconnect_wait // 60} minutes"
                        logger.error(f"[Job {job_id}] {error_msg}")
                        add_job_log(job_id, "ERROR", "ComfyUI reconnection timeout during queue wait")
                        update_job_status(job_id, "failed", error_message=error_msg)
                        self._notify_update(job_id, "failed")
                        return

                    logger.info(f"[Job {job_id}] ComfyUI reconnected, continuing queue wait")
                    add_job_log(job_id, "INFO", "ComfyUI reconnected during queue wait")

                queue_running = queue_status.get("queue_running", [])
                queue_pending = queue_status.get("queue_pending", [])
                if wait_time % 60 == 0:
                    logger.info(f"[Job {job_id}] Still waiting for ComfyUI queue... Running: {len(queue_running)}, Pending: {len(queue_pending)} ({wait_time}s elapsed)")

            if wait_time >= max_wait:
                error_msg = f"ComfyUI queue did not clear after {max_wait // 60} minutes. Queue had {len(queue_running)} running and {len(queue_pending)} pending jobs."
                logger.error(f"[Job {job_id}] {error_msg}")
                update_job_status(job_id, "failed", error_message=error_msg)
                self._notify_update(job_id, "failed")
                return

            logger.info(f"[Job {job_id}] ComfyUI queue cleared after {wait_time}s, proceeding")

        # Use the job's fixed seed
        job_seed = job.get("seed")

        workflow = client.build_workflow(
            workflow_type=job.get("workflow_type", "txt2img"),
            prompt=job.get("prompt", ""),
            negative_prompt=job.get("negative_prompt", get_setting("default_negative_prompt", "")),
            checkpoint=params.get("checkpoint", get_setting("default_checkpoint", "v1-5-pruned.safetensors")),
            steps=int(params.get("steps", get_setting("default_steps", "20"))),
            cfg=float(params.get("cfg", get_setting("default_cfg", "7.0"))),
            sampler=params.get("sampler", get_setting("default_sampler", "euler")),
            scheduler=params.get("scheduler", get_setting("default_scheduler", "normal")),
            width=int(params.get("width", get_setting("default_width", "640"))),
            height=int(params.get("height", get_setting("default_height", "640"))),
            seed=job_seed,
            denoise=float(params.get("denoise", 0.75)),
            input_image=job.get("input_image"),
            duration_sec=segment_duration,
            target_fps=target_fps,
            high_noise_model=get_setting("high_noise_model", "wan2.2_i2v_high_noise_14B_fp16.safetensors"),
            low_noise_model=get_setting("low_noise_model", "wan2.2_i2v_low_noise_14B_fp16.safetensors"),
        )

        # Queue the prompt
        success, result = client.queue_prompt(workflow)
        
        if not success:
            update_job_status(job_id, "failed", error_message=result)
            self._notify_update(job_id, "failed")
            return
        
        prompt_id = result
        update_job_status(job_id, "running", comfyui_prompt_id=prompt_id)
        
        # Wait for completion
        self._wait_for_completion(job_id, prompt_id, client)

    def _wait_for_completion(self, job_id: int, prompt_id: str, client: ComfyUIClient):
        """Wait for a prompt to complete and update job status."""
        max_wait = int(get_setting("segment_execution_timeout", "1200"))  # configurable, default 20 min
        waited = 0
        consecutive_errors = 0
        max_consecutive_errors = 30  # Allow ~30 seconds of connection issues before logging warnings

        while self._running and waited < max_wait:
            status = client.get_prompt_status(prompt_id)

            # Handle connection errors during execution
            if status.get("status") == "error" and "connect" in status.get("error", "").lower():
                consecutive_errors += 1
                if consecutive_errors == max_consecutive_errors:
                    logger.warning(f"[Job {job_id}] Lost connection to ComfyUI during execution")
                    add_job_log(job_id, "WARN", "Lost ComfyUI connection during execution", details=status.get("error"))

                # Wait for reconnection
                if consecutive_errors >= max_consecutive_errors:
                    max_reconnect_wait = int(get_setting("comfyui_reconnect_timeout", "600"))
                    if consecutive_errors * self._status_poll_interval >= max_reconnect_wait:
                        error_msg = f"ComfyUI connection not restored after {max_reconnect_wait // 60} minutes during execution"
                        logger.error(f"[Job {job_id}] {error_msg}")
                        add_job_log(job_id, "ERROR", "ComfyUI reconnection timeout during execution", details=error_msg)
                        update_job_status(job_id, "failed", error_message=error_msg)
                        self._notify_update(job_id, "failed")
                        return

                time.sleep(self._status_poll_interval)
                waited += self._status_poll_interval
                continue

            # Reset consecutive errors on successful connection
            if consecutive_errors > 0 and status.get("status") != "error":
                logger.info(f"[Job {job_id}] ComfyUI connection restored during execution")
                if consecutive_errors >= max_consecutive_errors:
                    add_job_log(job_id, "INFO", "ComfyUI reconnected during execution")
                consecutive_errors = 0

            if status.get("status") == "completed":
                # Get output images
                images = client.get_output_images(prompt_id)
                update_job_status(job_id, "completed", output_images=images)
                self._notify_update(job_id, "completed")
                print(f"Job {job_id} completed with {len(images)} images")
                return

            if status.get("status") == "error":
                error = status.get("error", "Unknown error")
                update_job_status(job_id, "failed", error_message=error)
                self._notify_update(job_id, "failed")
                return

            time.sleep(self._status_poll_interval)
            waited += self._status_poll_interval

        # Timeout
        if waited >= max_wait:
            update_job_status(job_id, "failed", error_message="Job timed out")
            self._notify_update(job_id, "failed")

    def _notify_update(self, job_id: int, status: str):
        """Notify about job status update."""
        if self._on_job_update:
            try:
                self._on_job_update(job_id, status)
            except Exception as e:
                print(f"Notification error: {e}")


# Global queue manager instance
queue_manager = QueueManager()
