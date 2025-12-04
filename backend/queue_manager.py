"""Background queue manager for processing ComfyUI jobs with multi-segment support."""

import os
import threading
import time
import urllib.parse
from typing import Optional, Callable
from datetime import datetime

from database import (
    get_pending_jobs,
    get_job,
    update_job_status,
    get_setting,
    get_job_segments,
    get_next_pending_segment,
    update_segment_status,
    update_segment_start_image,
    get_completed_segments_count
)
from comfyui_client import ComfyUIClient
from video_utils import (
    download_video_from_comfyui,
    extract_last_frame,
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
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        print("Queue manager started")

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
        comfyui_url = get_setting("comfyui_url", "http://3090.zero:8188")

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

        try:
            # Get ComfyUI client
            client = self._get_client()
            comfyui_url = get_setting("comfyui_url", "http://3090.zero:8188")
            print(f"[QueueManager] Using ComfyUI URL: {comfyui_url}")

            # Check ComfyUI connection
            connected, msg = client.check_connection()
            print(f"[QueueManager] ComfyUI connection check: connected={connected}, msg={msg}")
            if not connected:
                print(f"[QueueManager] ComfyUI not available: {msg}")
                # Don't fail the job, just wait
                self._current_job_id = None
                return

            # Update status to running
            update_job_status(job_id, "running")
            self._notify_update(job_id, "running")

            # Process segments one by one
            self._process_job_segments(job_id, job, client)

        except Exception as e:
            print(f"Error processing job {job_id}: {e}")
            import traceback
            traceback.print_exc()
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
                # Get the previous segment's end frame
                prev_segment = segments[segment_index - 1]
                if prev_segment.get("end_frame_url"):
                    # Update this segment's start image
                    update_segment_start_image(job_id, segment_index, prev_segment["end_frame_url"])
                    segment["start_image_url"] = prev_segment["end_frame_url"]
                else:
                    print(f"[QueueManager] Segment {segment_index} missing start image, waiting for previous segment")
                    continue

            # Process this segment
            success = self._process_segment(job_id, job, segment, client)

            if not success:
                # Use 1-based segment number for user-facing error message
                print(f"[QueueManager] Segment {segment_index} failed, stopping job")
                update_job_status(job_id, "failed", error_message=f"Segment {segment_index + 1} failed")
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
            print(f"[QueueManager] {completed_count} segment(s) completed. Awaiting user decision: continue or finalize")
            update_job_status(job_id, "awaiting_prompt")
            self._notify_update(job_id, "awaiting_prompt")
        else:
            # No segments completed - something went wrong
            print(f"[QueueManager] ERROR: No segments completed for job {job_id}")
            update_job_status(job_id, "failed", error_message="No segments were successfully processed")
            self._notify_update(job_id, "failed")

    def _process_segment(self, job_id: int, job: dict, segment: dict, client: ComfyUIClient) -> bool:
        """Process a single segment and return True if successful."""
        segment_index = segment["segment_index"]
        print(f"[QueueManager] Processing segment {segment_index} for job {job_id}")
        
        # Update segment status to running
        update_segment_status(job_id, segment_index, "running")
        
        # Get job parameters
        params = job.get("parameters") or {}
        fps = int(get_setting("default_fps", "16"))
        segment_duration = int(params.get("segment_duration", 5))
        frames = fps * segment_duration + 1
        
        # Determine the start image for this segment
        if segment_index == 0:
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
        
        # Get LoRA selections for this segment (may be None if user didn't select any)
        high_lora = segment.get("high_lora")
        low_lora = segment.get("low_lora")
        print(f"[QueueManager] Segment {segment_index} LoRA selections: high={high_lora}, low={low_lora}")
        
        # Build the workflow using the Wan2.2 i2v workflow builder directly
        # This ensures LoRA parameters are passed correctly
        workflow = client.build_wan_i2v_workflow(
            prompt=segment.get("prompt") or job.get("prompt", ""),
            negative_prompt=job.get("negative_prompt", get_setting("default_negative_prompt", "")),
            width=int(params.get("width", get_setting("default_width", "640"))),
            height=int(params.get("height", get_setting("default_height", "640"))),
            frames=frames,
            start_image_filename=input_image,
            high_noise_model=get_setting("high_noise_model", "wan2.2_i2v_high_noise_14B_fp16.safetensors"),
            low_noise_model=get_setting("low_noise_model", "wan2.2_i2v_low_noise_14B_fp16.safetensors"),
            seed=params.get("seed"),
            high_lora=high_lora,
            low_lora=low_lora,
        )
        
        # Queue the prompt
        print(f"[QueueManager] Queuing segment {segment_index} workflow to ComfyUI...")
        success, result = client.queue_prompt(workflow)
        print(f"[QueueManager] queue_prompt result: success={success}, result={result}")
        
        if not success:
            print(f"[QueueManager] Failed to queue segment {segment_index}: {result}")
            update_segment_status(job_id, segment_index, "failed", error_message=result)
            return False
        
        prompt_id = result
        update_segment_status(job_id, segment_index, "running", comfyui_prompt_id=prompt_id)
        
        # Wait for completion
        return self._wait_for_segment_completion(job_id, segment_index, prompt_id, client)

    def _wait_for_segment_completion(self, job_id: int, segment_index: int, prompt_id: str, client: ComfyUIClient) -> bool:
        """Wait for a segment to complete and process its outputs."""
        comfyui_url = get_setting("comfyui_url", "http://3090.zero:8188")
        max_wait = 600  # 10 minutes max per segment
        waited = 0
        
        while self._running and waited < max_wait:
            status = client.get_prompt_status(prompt_id)
            
            if status.get("status") == "completed":
                # Get output media URLs
                media_urls = client.get_output_images(prompt_id)
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

                                # Get execution time from ComfyUI history
                                exec_time = client.get_execution_time(prompt_id)

                                # Update segment with video path, end frame URL, and execution time
                                update_segment_status(
                                    job_id, segment_index, "completed",
                                    video_path=video_path,
                                    end_frame_url=end_frame_url,
                                    execution_time=exec_time
                                )

                                # Update the next segment's start image
                                update_segment_start_image(job_id, segment_index + 1, end_frame_url)

                                print(f"[QueueManager] Segment {segment_index} fully processed")
                                return True
                            else:
                                print(f"[QueueManager] ERROR: Failed to upload last frame for segment {segment_index}")
                        else:
                            print(f"[QueueManager] ERROR: Failed to extract last frame from {video_path}")
                    else:
                        print(f"[QueueManager] ERROR: Failed to download video from {video_url}")
                else:
                    print(f"[QueueManager] No video output found for segment {segment_index}")
                    # Still mark as completed but without video
                    update_segment_status(job_id, segment_index, "completed")
                    return True
                
                # If we got here, something failed in post-processing
                update_segment_status(job_id, segment_index, "failed", error_message="Post-processing failed")
                return False
            
            if status.get("status") == "error":
                error = status.get("error", "Unknown error")
                update_segment_status(job_id, segment_index, "failed", error_message=error)
                return False
            
            time.sleep(self._status_poll_interval)
            waited += self._status_poll_interval
        
        # Timeout
        if waited >= max_wait:
            update_segment_status(job_id, segment_index, "failed", error_message="Segment timed out")
            return False
        
        return False

    def _finalize_job(self, job_id: int):
        """Finalize a job by stitching all completed segment videos together."""
        # Get all completed segments
        segments = get_job_segments(job_id)
        completed_segments = [s for s in segments if s.get("status") == "completed"]

        print(f"[QueueManager] Finalizing job {job_id} - stitching {len(completed_segments)} segment(s)")

        # Collect all segment video paths
        video_paths = []
        for segment in completed_segments:
            segment_index = segment["segment_index"]
            video_path = get_segment_video_path(job_id, segment_index)
            if video_path and os.path.exists(video_path):
                video_paths.append(video_path)
            else:
                print(f"[QueueManager] Warning: Segment {segment_index} video not found at {video_path}")

        if not video_paths:
            print(f"[QueueManager] No segment videos found for job {job_id}")
            update_job_status(job_id, "failed", error_message="No segment videos to stitch")
            self._notify_update(job_id, "failed")
            return
        
        # Stitch videos together
        final_video_path = get_final_video_path(job_id)
        if stitch_videos(video_paths, final_video_path):
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
        fps = int(get_setting("default_fps", "16"))
        segment_duration = int(params.get("segment_duration", 5))
        frames = fps * segment_duration + 1
        
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
            seed=params.get("seed"),
            denoise=float(params.get("denoise", 0.75)),
            input_image=job.get("input_image"),
            frames=frames,
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
        max_wait = 600  # 10 minutes max
        waited = 0

        while self._running and waited < max_wait:
            status = client.get_prompt_status(prompt_id)

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
