"""WebSocket-based progress tracking for ComfyUI jobs."""

import json
import threading
import time
from typing import Optional, Dict, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime

try:
    import websocket
    WEBSOCKET_AVAILABLE = True
except ImportError:
    WEBSOCKET_AVAILABLE = False
    print("[ProgressTracker] websocket-client not installed, progress tracking disabled")


@dataclass
class ProgressState:
    """Current progress state for a job."""
    job_id: int
    segment_index: int
    prompt_id: str
    # Progress info
    current_step: int = 0
    total_steps: int = 0
    current_node: Optional[str] = None
    current_node_title: Optional[str] = None
    # Timing
    started_at: Optional[datetime] = None
    last_update: Optional[datetime] = None
    # Status
    status: str = "waiting"  # waiting, running, completed, error

    @property
    def percent(self) -> int:
        """Calculate progress percentage."""
        if self.total_steps <= 0:
            return 0
        return min(100, int((self.current_step / self.total_steps) * 100))

    @property
    def elapsed_seconds(self) -> Optional[float]:
        """Calculate elapsed time in seconds since start."""
        started = self.started_at  # Local copy to avoid race conditions
        if started is None:
            return None
        # Handle both timezone-aware and naive datetimes
        now = datetime.now(started.tzinfo) if started.tzinfo else datetime.now()
        return (now - started).total_seconds()

    def to_dict(self, avg_run_time: Optional[float] = None) -> Dict[str, Any]:
        """Convert to dictionary for API response.

        Args:
            avg_run_time: Average run time in seconds for ETA calculation
        """
        elapsed = self.elapsed_seconds
        eta_seconds = None

        # Calculate ETA based on average run time (only if we have both values)
        if avg_run_time is not None and elapsed is not None:
            eta_seconds = max(0, avg_run_time - elapsed)

        return {
            "job_id": self.job_id,
            "segment_index": self.segment_index,
            "prompt_id": self.prompt_id,
            "current_step": self.current_step,
            "total_steps": self.total_steps,
            "percent": self.percent,
            "current_node": self.current_node,
            "current_node_title": self.current_node_title,
            "status": self.status,
            # Use Unix timestamp (seconds since epoch) to avoid timezone issues
            "started_at_ts": self.started_at.timestamp() if self.started_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "last_update": self.last_update.isoformat() if self.last_update else None,
            # Timing estimates
            "elapsed_seconds": elapsed,
            "eta_seconds": eta_seconds,
        }


class ProgressTracker:
    """Tracks ComfyUI job progress via WebSocket."""

    def __init__(self):
        self._progress: Dict[int, ProgressState] = {}  # job_id -> ProgressState
        self._ws: Optional[Any] = None
        self._ws_thread: Optional[threading.Thread] = None
        self._running = False
        self._comfyui_url: Optional[str] = None
        self._lock = threading.Lock()
        self._on_progress_update: Optional[Callable] = None

    def set_progress_callback(self, callback: Callable):
        """Set callback for progress updates."""
        self._on_progress_update = callback

    def start_tracking(self, job_id: int, segment_index: int, prompt_id: str, comfyui_url: str, started_at: Optional[datetime] = None):
        """Start tracking progress for a job segment.

        Args:
            started_at: Optional start time override (for resumed segments). Defaults to now.
        """
        if not WEBSOCKET_AVAILABLE:
            print(f"[ProgressTracker] WebSocket not available, skipping progress tracking for job {job_id}")
            return

        with self._lock:
            self._progress[job_id] = ProgressState(
                job_id=job_id,
                segment_index=segment_index,
                prompt_id=prompt_id,
                started_at=started_at or datetime.now(),
                status="waiting"
            )

        # Connect WebSocket if not already connected
        if not self._running or self._comfyui_url != comfyui_url:
            self._connect_websocket(comfyui_url)

    def stop_tracking(self, job_id: int):
        """Stop tracking progress for a job."""
        with self._lock:
            if job_id in self._progress:
                del self._progress[job_id]

            # Disconnect WebSocket if no more jobs being tracked
            if not self._progress:
                self._disconnect_websocket()

    def get_progress(self, job_id: int, avg_run_time: Optional[float] = None) -> Optional[Dict[str, Any]]:
        """Get current progress for a job.

        Args:
            job_id: The job ID to get progress for
            avg_run_time: Average run time in seconds for ETA calculation
        """
        with self._lock:
            if job_id in self._progress:
                return self._progress[job_id].to_dict(avg_run_time=avg_run_time)
        return None

    def get_all_progress(self, avg_run_time: Optional[float] = None) -> Dict[int, Dict[str, Any]]:
        """Get progress for all tracked jobs.

        Args:
            avg_run_time: Average run time in seconds for ETA calculation
        """
        with self._lock:
            return {jid: p.to_dict(avg_run_time=avg_run_time) for jid, p in self._progress.items()}

    def _connect_websocket(self, comfyui_url: str):
        """Connect to ComfyUI WebSocket."""
        self._disconnect_websocket()

        # Convert HTTP URL to WebSocket URL
        # Don't use a clientId to receive all events from ComfyUI
        ws_url = comfyui_url.replace("http://", "ws://").replace("https://", "wss://")
        ws_url = f"{ws_url}/ws"

        self._comfyui_url = comfyui_url
        self._running = True

        self._ws_thread = threading.Thread(target=self._ws_loop, args=(ws_url,), daemon=True)
        self._ws_thread.start()
        print(f"[ProgressTracker] Connecting to {ws_url}")

    def _disconnect_websocket(self):
        """Disconnect from ComfyUI WebSocket."""
        self._running = False
        if self._ws:
            try:
                self._ws.close()
            except:
                pass
            self._ws = None
        if self._ws_thread:
            self._ws_thread.join(timeout=2.0)
            self._ws_thread = None

    def _ws_loop(self, ws_url: str):
        """WebSocket message loop."""
        retry_count = 0
        max_retries = 5

        while self._running and retry_count < max_retries:
            try:
                self._ws = websocket.WebSocket()
                self._ws.settimeout(5.0)
                self._ws.connect(ws_url)
                print(f"[ProgressTracker] WebSocket connected")
                retry_count = 0  # Reset on successful connection

                while self._running:
                    try:
                        self._ws.settimeout(1.0)
                        message = self._ws.recv()
                        if message:
                            # Check if it's binary (preview image) or text (JSON)
                            if isinstance(message, bytes):
                                # Skip binary messages (preview images)
                                continue
                            self._handle_message(message)
                    except websocket.WebSocketTimeoutException:
                        continue
                    except websocket.WebSocketConnectionClosedException:
                        print("[ProgressTracker] WebSocket connection closed")
                        break
                    except Exception as e:
                        print(f"[ProgressTracker] WebSocket recv error: {e}")
                        break

            except Exception as e:
                print(f"[ProgressTracker] WebSocket connection error: {e}")
                retry_count += 1
                if self._running and retry_count < max_retries:
                    time.sleep(2.0)  # Wait before retry

        if retry_count >= max_retries:
            print(f"[ProgressTracker] Max retries reached, giving up")

    def _handle_message(self, message: str):
        """Handle incoming WebSocket message."""
        try:
            data = json.loads(message)
            msg_type = data.get("type")


            if msg_type == "progress":
                self._handle_progress(data.get("data", {}))
            elif msg_type == "progress_state":
                # Alternative progress message format used by some ComfyUI versions
                self._handle_progress_state(data.get("data", {}))
            elif msg_type == "executing":
                self._handle_executing(data.get("data", {}))
            elif msg_type == "execution_start":
                self._handle_execution_start(data.get("data", {}))
            elif msg_type == "executed":
                self._handle_executed(data.get("data", {}))

        except json.JSONDecodeError:
            pass
        except Exception as e:
            print(f"[ProgressTracker] Error handling message: {e}")

    def _handle_progress_state(self, data: Dict[str, Any]):
        """Handle progress_state message.

        Format: {prompt_id, nodes: {node_id: {value, max, state, node_id, ...}, ...}}
        Calculate overall progress as: finished_nodes / total_nodes
        """
        prompt_id = data.get("prompt_id")
        nodes = data.get("nodes", {})

        if not nodes:
            return

        # Count finished vs total nodes for overall progress
        total_nodes = len(nodes)
        finished_nodes = sum(1 for n in nodes.values() if n.get("state") == "finished")

        # Find the currently running node
        current_node = None
        running_step = 0
        running_max = 0

        for node_id, node_data in nodes.items():
            if node_data.get("state") == "running":
                current_node = node_id
                running_step = node_data.get("value", 0)
                running_max = node_data.get("max", 0)
                break

        with self._lock:
            for job_id, progress in self._progress.items():
                if progress.prompt_id == prompt_id:
                    # Use node count for progress: finished + partial progress of current
                    if running_max > 0:
                        partial = running_step / running_max
                    else:
                        partial = 0
                    progress.current_step = finished_nodes
                    progress.total_steps = total_nodes
                    progress.current_node = current_node
                    progress.last_update = datetime.now()
                    progress.status = "running"

                    if self._on_progress_update:
                        try:
                            self._on_progress_update(job_id, progress.to_dict())
                        except:
                            pass
                    break

    def _handle_progress(self, data: Dict[str, Any]):
        """Handle progress message (step updates)."""
        value = data.get("value", 0)
        max_val = data.get("max", 0)
        prompt_id = data.get("prompt_id")

        with self._lock:
            # Find the job with this prompt_id
            for job_id, progress in self._progress.items():
                if progress.prompt_id == prompt_id:
                    progress.current_step = value
                    progress.total_steps = max_val
                    progress.last_update = datetime.now()
                    progress.status = "running"

                    # Notify callback
                    if self._on_progress_update:
                        try:
                            self._on_progress_update(job_id, progress.to_dict())
                        except:
                            pass
                    break

    def _handle_executing(self, data: Dict[str, Any]):
        """Handle executing message (current node)."""
        node = data.get("node")
        prompt_id = data.get("prompt_id")

        with self._lock:
            for job_id, progress in self._progress.items():
                if progress.prompt_id == prompt_id:
                    if node is None:
                        # Execution finished
                        progress.status = "completed"
                        progress.current_step = progress.total_steps
                    else:
                        progress.current_node = node
                        progress.status = "running"
                    progress.last_update = datetime.now()
                    break

    def _handle_execution_start(self, data: Dict[str, Any]):
        """Handle execution start message."""
        prompt_id = data.get("prompt_id")

        with self._lock:
            for job_id, progress in self._progress.items():
                if progress.prompt_id == prompt_id:
                    progress.status = "running"
                    progress.started_at = datetime.now()
                    progress.last_update = datetime.now()
                    break

    def _handle_executed(self, data: Dict[str, Any]):
        """Handle executed message (node completed)."""
        # This fires for each node completion, not very useful for progress
        pass


# Global progress tracker instance
progress_tracker = ProgressTracker()