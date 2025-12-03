"""Background queue manager for processing ComfyUI jobs."""

import asyncio
import threading
import time
from typing import Optional, Callable
from datetime import datetime

from database import (
    get_pending_jobs,
    get_job,
    update_job_status,
    get_setting
)
from comfyui_client import ComfyUIClient


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

            # Build the workflow
            params = job.get("parameters") or {}
            workflow = client.build_workflow(
                workflow_type=job.get("workflow_type", "txt2img"),
                prompt=job.get("prompt", ""),
                negative_prompt=job.get("negative_prompt", ""),
                checkpoint=params.get("checkpoint", get_setting("default_checkpoint", "v1-5-pruned.safetensors")),
                steps=int(params.get("steps", get_setting("default_steps", "20"))),
                cfg=float(params.get("cfg", get_setting("default_cfg", "7.0"))),
                sampler=params.get("sampler", get_setting("default_sampler", "euler")),
                scheduler=params.get("scheduler", get_setting("default_scheduler", "normal")),
                width=int(params.get("width", get_setting("default_width", "512"))),
                height=int(params.get("height", get_setting("default_height", "512"))),
                seed=params.get("seed"),
                denoise=float(params.get("denoise", 0.75)),
                input_image=job.get("input_image")
            )

            # Queue the prompt
            print(f"[QueueManager] Queuing workflow to ComfyUI...")
            success, result = client.queue_prompt(workflow)
            print(f"[QueueManager] queue_prompt result: success={success}, result={result}")

            if not success:
                print(f"[QueueManager] Failed to queue prompt: {result}")
                update_job_status(job_id, "failed", error_message=result)
                self._notify_update(job_id, "failed")
                self._current_job_id = None
                return

            prompt_id = result
            print(f"[QueueManager] Job {job_id} queued successfully with prompt_id={prompt_id}")
            update_job_status(job_id, "running", comfyui_prompt_id=prompt_id)

            # Wait for completion
            self._wait_for_completion(job_id, prompt_id, client)

        except Exception as e:
            print(f"Error processing job {job_id}: {e}")
            update_job_status(job_id, "failed", error_message=str(e))
            self._notify_update(job_id, "failed")
        finally:
            self._current_job_id = None

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
