"""Database module for job and settings persistence."""

import sqlite3
import json
import random
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from contextlib import contextmanager


# KSampler seed range: 0 to 2^64-1 (unsigned 64-bit integer)
# Using 2^63-1 to stay within Python's safe integer range and JSON compatibility
MAX_SEED = 2**63 - 1


def generate_seed() -> int:
    """Generate a random seed for KSampler.

    Returns a random integer in the range [0, 2^63-1].
    This is used for reproducible video generation - same seed = same output.
    """
    return random.randint(0, MAX_SEED)


def utc_now_iso():
    """Return current UTC time as ISO string with Z suffix for proper browser parsing."""
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def serialize_loras(loras: Optional[List[Dict[str, Any]]]) -> Optional[str]:
    """Serialize a list of LoRA objects to JSON string for database storage.

    Args:
        loras: List of LoRA dicts with 'file' and optional 'weight' keys, or None.
               Can also accept list of strings (filenames) for backward compatibility.

    Returns:
        JSON string like '[{"file": "f1.safetensors", "weight": 1.0}, ...]', or None if empty
    """
    if not loras:
        return None

    # Normalize to list of dicts with file and weight
    normalized = []
    for l in loras:
        if not l:
            continue
        if isinstance(l, str):
            # Backward compat: plain filename string
            normalized.append({"file": l, "weight": 1.0})
        elif isinstance(l, dict):
            if l.get("file"):
                normalized.append({
                    "file": l["file"],
                    "weight": float(l.get("weight", 1.0))
                })

    if not normalized:
        return None
    return json.dumps(normalized)


def parse_loras(db_value: Optional[str]) -> List[Dict[str, Any]]:
    """Parse LoRA data from database, handling multiple formats.

    Args:
        db_value: Database value - could be:
            - None (no LoRAs)
            - Single filename string (legacy): "wan2.2/lora.safetensors"
            - JSON array of strings (old): '["wan2.2/lora1.safetensors", ...]'
            - JSON array of objects (new): '[{"file": "...", "weight": 1.0}, ...]'

    Returns:
        List of LoRA dicts with 'file' and 'weight' keys (may be empty)
    """
    if not db_value:
        return []

    # Try parsing as JSON first
    if db_value.startswith('['):
        try:
            parsed = json.loads(db_value)
            if isinstance(parsed, list):
                result = []
                for item in parsed:
                    if not item:
                        continue
                    if isinstance(item, str):
                        # Old format: plain filename
                        result.append({"file": item, "weight": 1.0})
                    elif isinstance(item, dict) and item.get("file"):
                        # New format: object with file and weight
                        result.append({
                            "file": item["file"],
                            "weight": float(item.get("weight", 1.0))
                        })
                return result
        except json.JSONDecodeError:
            pass

    # Fall back to treating as single filename (legacy format)
    return [{"file": db_value, "weight": 1.0}]

# Use absolute path to avoid issues with current working directory
from pathlib import Path
BACKEND_DIR = Path(__file__).resolve().parent
DATABASE_PATH = str(BACKEND_DIR / "comfyui_queue.db")


@contextmanager
def get_connection():
    """Context manager for database connections."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Initialize database tables."""
    with get_connection() as conn:
        cursor = conn.cursor()

        # Jobs table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                prompt TEXT,
                negative_prompt TEXT,
                workflow_type TEXT DEFAULT 'txt2img',
                parameters TEXT,
                input_image TEXT,
                output_images TEXT,
                comfyui_prompt_id TEXT,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                started_at TIMESTAMP,
                completed_at TIMESTAMP
            )
        """)

        # Job segments table - tracks each segment of a multi-segment video job
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS job_segments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL,
                segment_index INTEGER NOT NULL,
                status TEXT DEFAULT 'pending',
                prompt TEXT,
                start_image_url TEXT,
                end_frame_url TEXT,
                video_path TEXT,
                comfyui_prompt_id TEXT,
                execution_time REAL,
                error_message TEXT,
                high_lora TEXT,
                low_lora TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP,
                FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
                UNIQUE(job_id, segment_index)
            )
        """)
        
        # Add high_lora and low_lora columns if they don't exist (migration for existing DBs)
        try:
            cursor.execute("ALTER TABLE job_segments ADD COLUMN high_lora TEXT")
        except sqlite3.OperationalError:
            pass  # Column already exists
        try:
            cursor.execute("ALTER TABLE job_segments ADD COLUMN low_lora TEXT")
        except sqlite3.OperationalError:
            pass  # Column already exists

        # Add priority column for queue ordering (lower number = higher priority)
        try:
            cursor.execute("ALTER TABLE jobs ADD COLUMN priority INTEGER DEFAULT 0")
            # Initialize existing jobs with priority based on creation order
            cursor.execute("""
                UPDATE jobs SET priority = (
                    SELECT COUNT(*) FROM jobs j2 WHERE j2.created_at <= jobs.created_at
                )
            """)
        except sqlite3.OperationalError:
            pass  # Column already exists

        # Add seed column for reproducible video generation
        try:
            cursor.execute("ALTER TABLE jobs ADD COLUMN seed INTEGER")
            # Backfill existing jobs with random seeds
            cursor.execute("SELECT id FROM jobs WHERE seed IS NULL")
            for row in cursor.fetchall():
                cursor.execute("UPDATE jobs SET seed = ? WHERE id = ?", (generate_seed(), row[0]))
        except sqlite3.OperationalError:
            pass  # Column already exists

        # Settings table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)

        # LoRA library table - grouped by base_name with high/low file variants
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lora_library (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                base_name TEXT UNIQUE NOT NULL,
                high_file TEXT,
                low_file TEXT,
                friendly_name TEXT,
                url TEXT,
                prompt_text TEXT,
                trigger_keywords TEXT,
                rating INTEGER DEFAULT NULL,
                preview_image_url TEXT,
                created_at TEXT,
                updated_at TEXT
            )
        """)

        # Migration: Add preview_image_url column if it doesn't exist
        try:
            cursor.execute("ALTER TABLE lora_library ADD COLUMN preview_image_url TEXT")
        except sqlite3.OperationalError:
            pass  # Column already exists

        # Migration: Add notes column if it doesn't exist
        try:
            cursor.execute("ALTER TABLE lora_library ADD COLUMN notes TEXT")
        except sqlite3.OperationalError:
            pass  # Column already exists

        # Migration: Add default weight columns if they don't exist
        try:
            cursor.execute("ALTER TABLE lora_library ADD COLUMN default_high_weight REAL DEFAULT 1.0")
        except sqlite3.OperationalError:
            pass  # Column already exists
        try:
            cursor.execute("ALTER TABLE lora_library ADD COLUMN default_low_weight REAL DEFAULT 1.0")
        except sqlite3.OperationalError:
            pass  # Column already exists

        # Image ratings table - stores ratings for images in the repository
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS image_ratings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                image_path TEXT UNIQUE NOT NULL,
                rating INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Hidden LoRAs table - tracks LoRA files user wants hidden from library
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS hidden_loras (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT UNIQUE NOT NULL,
                hidden_at TEXT NOT NULL
            )
        """)

        # Uploaded images table - tracks images uploaded to ComfyUI for deduplication
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS uploaded_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content_hash TEXT UNIQUE NOT NULL,
                comfyui_filename TEXT NOT NULL,
                original_filename TEXT,
                uploaded_at TEXT NOT NULL
            )
        """)

        # Job activity logs - tracks key events for debugging
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS job_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL,
                segment_index INTEGER,
                timestamp TEXT NOT NULL,
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                details TEXT,
                FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
            )
        """)

        # Index for fast log retrieval by job
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON job_logs(job_id)
        """)

        # Insert default settings if not exist
        # Note: comfyui_url should match config.py COMFYUI_SERVER_URL
        default_settings = {
            "comfyui_url": "http://localhost:8188",
            "default_checkpoint": "v1-5-pruned.safetensors",
            "default_steps": "20",
            "default_cfg": "7.0",
            "default_sampler": "euler",
            "default_scheduler": "normal",
            "default_width": "640",
            "default_height": "640",
            "auto_start_queue": "true",
            "image_repo_path": ""
        }

        for key, value in default_settings.items():
            cursor.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                (key, value)
            )


# ============== Job Functions ==============

def create_job(
    name: str,
    prompt: str,
    negative_prompt: str = "",
    workflow_type: str = "txt2img",
    parameters: Optional[Dict] = None,
    input_image: Optional[str] = None,
    seed: Optional[int] = None
) -> int:
    """Create a new job and return its ID.

    Args:
        seed: Optional seed for reproducible generation. If not provided, a random seed is generated.
              The same seed is used for all segments in a job.
    """
    if seed is None:
        seed = generate_seed()

    with get_connection() as conn:
        cursor = conn.cursor()
        # Get max priority to add new job at end of queue
        cursor.execute("SELECT COALESCE(MAX(priority), 0) + 1 FROM jobs")
        next_priority = cursor.fetchone()[0]
        cursor.execute("""
            INSERT INTO jobs (name, prompt, negative_prompt, workflow_type, parameters, input_image, created_at, priority, seed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            name,
            prompt,
            negative_prompt,
            workflow_type,
            json.dumps(parameters) if parameters else None,
            input_image,
            utc_now_iso(),
            next_priority,
            seed
        ))
        return cursor.lastrowid


def get_job(job_id: int) -> Optional[Dict[str, Any]]:
    """Get a job by ID."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        row = cursor.fetchone()
        if row:
            return _row_to_job_dict(row)
        return None


def get_all_jobs(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    """Get all jobs with pagination."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (limit, offset)
        )
        return [_row_to_job_dict(row) for row in cursor.fetchall()]


def get_pending_jobs() -> List[Dict[str, Any]]:
    """Get all pending jobs ordered by priority (lower number = higher priority)."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM jobs WHERE status = 'pending' ORDER BY priority ASC, created_at ASC"
        )
        return [_row_to_job_dict(row) for row in cursor.fetchall()]


def move_job_up(job_id: int) -> bool:
    """Move a job up in the queue (decrease priority number to run sooner).

    Swaps priority with the job that has the next lower priority number.
    Returns True if the job was moved, False if it's already at the top.
    """
    with get_connection() as conn:
        cursor = conn.cursor()

        # Get current job's priority
        cursor.execute("SELECT priority FROM jobs WHERE id = ? AND status = 'pending'", (job_id,))
        row = cursor.fetchone()
        if not row:
            return False
        current_priority = row[0]

        # Find the job with the next lower priority (the one above in queue)
        cursor.execute("""
            SELECT id, priority FROM jobs
            WHERE status = 'pending' AND priority < ?
            ORDER BY priority DESC LIMIT 1
        """, (current_priority,))
        swap_row = cursor.fetchone()

        if not swap_row:
            return False  # Already at top

        swap_id, swap_priority = swap_row

        # Swap priorities
        cursor.execute("UPDATE jobs SET priority = ? WHERE id = ?", (swap_priority, job_id))
        cursor.execute("UPDATE jobs SET priority = ? WHERE id = ?", (current_priority, swap_id))

        return True


def move_job_down(job_id: int) -> bool:
    """Move a job down in the queue (increase priority number to run later).

    Swaps priority with the job that has the next higher priority number.
    Returns True if the job was moved, False if it's already at the bottom.
    """
    with get_connection() as conn:
        cursor = conn.cursor()

        # Get current job's priority
        cursor.execute("SELECT priority FROM jobs WHERE id = ? AND status = 'pending'", (job_id,))
        row = cursor.fetchone()
        if not row:
            return False
        current_priority = row[0]

        # Find the job with the next higher priority (the one below in queue)
        cursor.execute("""
            SELECT id, priority FROM jobs
            WHERE status = 'pending' AND priority > ?
            ORDER BY priority ASC LIMIT 1
        """, (current_priority,))
        swap_row = cursor.fetchone()

        if not swap_row:
            return False  # Already at bottom

        swap_id, swap_priority = swap_row

        # Swap priorities
        cursor.execute("UPDATE jobs SET priority = ? WHERE id = ?", (swap_priority, job_id))
        cursor.execute("UPDATE jobs SET priority = ? WHERE id = ?", (current_priority, swap_id))

        return True


def move_job_to_bottom(job_id: int) -> bool:
    """Move a job to the bottom of the queue (set priority to MAX + 1).

    Used when retrying a job so it goes to the end of the queue.
    Returns True if the job was moved, False if job not found.
    """
    with get_connection() as conn:
        cursor = conn.cursor()

        # Verify job exists
        cursor.execute("SELECT id FROM jobs WHERE id = ?", (job_id,))
        if not cursor.fetchone():
            return False

        # Get max priority and set this job to max + 1
        cursor.execute("SELECT COALESCE(MAX(priority), 0) + 1 FROM jobs")
        next_priority = cursor.fetchone()[0]

        cursor.execute("UPDATE jobs SET priority = ? WHERE id = ?", (next_priority, job_id))
        return True


def reset_orphaned_running_jobs(comfyui_client=None):
    """Reset jobs/segments stuck in 'running' state (e.g., after backend restart).

    When the backend restarts while jobs are processing, they remain in 'running' state
    but are no longer being monitored. This function:
    1. Checks if 'running' segments have completed in ComfyUI (if client provided)
    2. Checks if the video file exists locally (fallback)
    3. Checks if the prompt is still running/pending in ComfyUI queue
    4. Marks completed ones as 'completed' or 'needs_recovery'
    5. Keeps actively running ones in 'running' state for continued monitoring
    6. Resets truly orphaned ones to 'pending' for retry

    Args:
        comfyui_client: Optional ComfyUIClient instance to check for completed prompts
    """
    import os

    with get_connection() as conn:
        cursor = conn.cursor()

        # Check running segments to see if they actually completed
        cursor.execute("""
            SELECT s.id, s.job_id, s.segment_index, s.video_path, s.comfyui_prompt_id,
                   j.id as job_id_check
            FROM job_segments s
            JOIN jobs j ON s.job_id = j.id
            WHERE s.status = 'running'
        """)
        running_segments = cursor.fetchall()

        segments_completed = 0
        segments_reset = 0
        segments_recovered = 0
        segments_still_running = 0

        # Get active prompt IDs from ComfyUI queue (running + pending)
        active_prompt_ids = set()
        if comfyui_client:
            queue_status = comfyui_client.get_queue_status()
            # Extract prompt IDs from running queue
            for item in queue_status.get("queue_running", []):
                if isinstance(item, list) and len(item) > 1:
                    active_prompt_ids.add(item[1])  # prompt_id is second element
            # Extract prompt IDs from pending queue
            for item in queue_status.get("queue_pending", []):
                if isinstance(item, list) and len(item) > 1:
                    active_prompt_ids.add(item[1])
            if active_prompt_ids:
                print(f"[Database] Found {len(active_prompt_ids)} active prompts in ComfyUI queue")

        for seg_row in running_segments:
            seg_id, job_id, seg_index, video_path, prompt_id, _ = seg_row

            # First, check if the segment's video file exists locally
            if video_path and os.path.exists(video_path):
                print(f"[Database] Segment {seg_index} of job {job_id} completed but not marked - updating status")
                cursor.execute(
                    "UPDATE job_segments SET status = 'completed' WHERE id = ?",
                    (seg_id,)
                )
                segments_completed += 1
                continue

            # If we have a ComfyUI client and a prompt_id, check various states
            if comfyui_client and prompt_id:
                # Check if prompt completed in ComfyUI history
                status = comfyui_client.get_prompt_status(prompt_id)
                if status.get("status") == "completed":
                    print(f"[Database] Segment {seg_index} of job {job_id} completed in ComfyUI - needs video recovery")
                    cursor.execute(
                        "UPDATE job_segments SET status = 'needs_recovery' WHERE id = ?",
                        (seg_id,)
                    )
                    segments_recovered += 1
                    continue

                # Check if prompt is still actively running/pending in ComfyUI queue
                if prompt_id in active_prompt_ids:
                    print(f"[Database] Segment {seg_index} of job {job_id} still running in ComfyUI - keeping status")
                    segments_still_running += 1
                    continue

            # Video doesn't exist, not in history, not in queue - reset to pending for retry
            print(f"[Database] Segment {seg_index} of job {job_id} not completed - resetting to pending")
            cursor.execute(
                "UPDATE job_segments SET status = 'pending' WHERE id = ?",
                (seg_id,)
            )
            segments_reset += 1

        # Only reset jobs that don't have actively running segments
        # Get job IDs that still have running segments
        cursor.execute("SELECT DISTINCT job_id FROM job_segments WHERE status = 'running'")
        jobs_with_running_segments = {row[0] for row in cursor.fetchall()}

        # Reset running jobs that don't have active segments
        cursor.execute("SELECT id FROM jobs WHERE status = 'running'")
        running_jobs = [row[0] for row in cursor.fetchall()]

        jobs_reset = 0
        for job_id in running_jobs:
            if job_id not in jobs_with_running_segments:
                cursor.execute("UPDATE jobs SET status = 'pending' WHERE id = ?", (job_id,))
                jobs_reset += 1
            else:
                print(f"[Database] Job {job_id} still has running segments in ComfyUI - keeping status")

        conn.commit()

        # Also fix segments that are "running" but their job is "failed"
        # This can happen when job fails but segment status wasn't updated
        # BUT: don't change segments still actively running in ComfyUI (they might complete)
        if active_prompt_ids:
            # Only sync segments not actively in ComfyUI queue
            cursor.execute("""
                UPDATE job_segments
                SET status = 'failed', error_message = 'Job failed during processing'
                WHERE status = 'running'
                AND job_id IN (SELECT id FROM jobs WHERE status = 'failed')
                AND (comfyui_prompt_id IS NULL OR comfyui_prompt_id NOT IN ({}))
            """.format(','.join('?' * len(active_prompt_ids))), list(active_prompt_ids))
        else:
            # No active prompts - safe to sync all
            cursor.execute("""
                UPDATE job_segments
                SET status = 'failed', error_message = 'Job failed during processing'
                WHERE status = 'running'
                AND job_id IN (SELECT id FROM jobs WHERE status = 'failed')
            """)
        segments_failed_sync = cursor.rowcount

        conn.commit()

        if jobs_reset > 0 or segments_reset > 0 or segments_completed > 0 or segments_recovered > 0 or segments_still_running > 0 or segments_failed_sync > 0:
            print(f"[Database] Startup cleanup: {jobs_reset} job(s) reset to pending, "
                  f"{segments_completed} segment(s) marked completed, "
                  f"{segments_reset} segment(s) reset to pending, "
                  f"{segments_recovered} segment(s) need recovery from ComfyUI, "
                  f"{segments_still_running} segment(s) still running in ComfyUI, "
                  f"{segments_failed_sync} segment(s) synced to failed status")

        return jobs_reset, segments_reset, segments_completed, segments_recovered


def get_segments_needing_recovery():
    """Get segments that need video recovery from ComfyUI."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.id, s.job_id, s.segment_index, s.comfyui_prompt_id, j.name
            FROM job_segments s
            JOIN jobs j ON s.job_id = j.id
            WHERE s.status = 'needs_recovery'
        """)
        rows = cursor.fetchall()
        return [
            {
                "id": row[0],
                "job_id": row[1],
                "segment_index": row[2],
                "comfyui_prompt_id": row[3],
                "job_name": row[4]
            }
            for row in rows
        ]


def update_job_status(
    job_id: int,
    status: str,
    error_message: Optional[str] = None,
    comfyui_prompt_id: Optional[str] = None,
    output_images: Optional[List[str]] = None
):
    """Update job status and related fields."""
    with get_connection() as conn:
        cursor = conn.cursor()

        updates = ["status = ?"]
        params = [status]

        if status == "running":
            updates.append("started_at = ?")
            params.append(utc_now_iso())

        if status in ("completed", "failed"):
            updates.append("completed_at = ?")
            params.append(utc_now_iso())

        if error_message is not None:
            updates.append("error_message = ?")
            params.append(error_message)

        if comfyui_prompt_id is not None:
            updates.append("comfyui_prompt_id = ?")
            params.append(comfyui_prompt_id)

        if output_images is not None:
            updates.append("output_images = ?")
            params.append(json.dumps(output_images))

        params.append(job_id)

        cursor.execute(
            f"UPDATE jobs SET {', '.join(updates)} WHERE id = ?",
            params
        )


def update_job_parameters(
    job_id: int,
    name: Optional[str] = None,
    prompt: Optional[str] = None,
    negative_prompt: Optional[str] = None,
    parameters: Optional[Dict[str, Any]] = None
):
    """Update job name, prompt, and parameters (only for pending jobs)."""
    with get_connection() as conn:
        cursor = conn.cursor()

        updates = []
        params = []

        if name is not None:
            updates.append("name = ?")
            params.append(name)

        if prompt is not None:
            updates.append("prompt = ?")
            params.append(prompt)

        if negative_prompt is not None:
            updates.append("negative_prompt = ?")
            params.append(negative_prompt)

        if parameters is not None:
            updates.append("parameters = ?")
            params.append(json.dumps(parameters))

        if not updates:
            return False

        params.append(job_id)

        cursor.execute(
            f"UPDATE jobs SET {', '.join(updates)} WHERE id = ? AND status IN ('pending', 'awaiting_prompt')",
            params
        )

        return cursor.rowcount > 0


def delete_job(job_id: int) -> bool:
    """Delete a job by ID."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        return cursor.rowcount > 0


def _row_to_job_dict(row: sqlite3.Row) -> Dict[str, Any]:
    """Convert a database row to a job dictionary."""
    job = dict(row)
    # Parse JSON fields
    if job.get("parameters"):
        job["parameters"] = json.loads(job["parameters"])
    if job.get("output_images"):
        job["output_images"] = json.loads(job["output_images"])
    return job


# ============== Settings Functions ==============

def get_all_settings() -> Dict[str, str]:
    """Get all settings as a dictionary."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM settings")
        return {row["key"]: row["value"] for row in cursor.fetchall()}


def get_setting(key: str, default: Optional[str] = None) -> Optional[str]:
    """Get a single setting by key."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
        row = cursor.fetchone()
        return row["value"] if row else default


def update_setting(key: str, value: str):
    """Update or insert a setting."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            (key, value)
        )


def update_settings(settings: Dict[str, str]):
    """Update multiple settings at once."""
    with get_connection() as conn:
        cursor = conn.cursor()
        for key, value in settings.items():
            cursor.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                (key, value)
            )


# ============== Job Logging Functions ==============

def add_job_log(
    job_id: int,
    level: str,
    message: str,
    segment_index: Optional[int] = None,
    details: Optional[str] = None
):
    """Add a log entry for a job.

    Args:
        job_id: The job ID
        level: Log level (INFO, WARN, ERROR)
        message: Short log message
        segment_index: Optional segment index if log is segment-specific
        details: Optional detailed information (JSON string or text)
    """
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO job_logs (job_id, segment_index, timestamp, level, message, details)
               VALUES (?, ?, datetime('now'), ?, ?, ?)""",
            (job_id, segment_index, level, message, details)
        )


def get_job_logs(job_id: int, limit: int = 100) -> List[Dict[str, Any]]:
    """Get log entries for a job, ordered by timestamp descending.

    Args:
        job_id: The job ID
        limit: Maximum number of logs to return

    Returns:
        List of log entries as dictionaries
    """
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """SELECT id, job_id, segment_index, timestamp, level, message, details
               FROM job_logs
               WHERE job_id = ?
               ORDER BY timestamp DESC, id DESC
               LIMIT ?""",
            (job_id, limit)
        )
        return [dict(row) for row in cursor.fetchall()]


def clear_job_logs(job_id: int):
    """Delete all log entries for a job."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM job_logs WHERE job_id = ?", (job_id,))


# ============== Segment Functions ==============

def create_first_segment(
    job_id: int,
    initial_prompt: str,
    start_image_url: str,
    high_loras: Optional[List[str]] = None,
    low_loras: Optional[List[str]] = None
):
    """Create the first segment for a job (on-demand workflow).

    In the new workflow, segments are created on-demand as prompts are provided.
    This creates segment 0 with the initial prompt, start image, and LoRA selections.

    Args:
        job_id: The job ID
        initial_prompt: The prompt for segment 0
        start_image_url: ComfyUI image URL for the starting image
        high_loras: List of high noise LoRA filenames (max 2)
        low_loras: List of low noise LoRA filenames (max 2)
    """
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO job_segments (job_id, segment_index, status, prompt, start_image_url, high_lora, low_lora)
            VALUES (?, ?, 'pending', ?, ?, ?, ?)
        """, (job_id, 0, initial_prompt, start_image_url,
              serialize_loras(high_loras), serialize_loras(low_loras)))


def create_next_segment(
    job_id: int,
    segment_index: int,
    prompt: str,
    start_image_url: str,
    high_loras: Optional[List[str]] = None,
    low_loras: Optional[List[str]] = None
):
    """Create the next segment for a job (on-demand workflow).

    Creates a new segment with the provided prompt and settings.

    Args:
        job_id: The job ID
        segment_index: The segment index (1, 2, 3, ...)
        prompt: The prompt for this segment
        start_image_url: ComfyUI image URL for the starting image
        high_loras: List of high noise LoRA filenames (max 2)
        low_loras: List of low noise LoRA filenames (max 2)
    """
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO job_segments (job_id, segment_index, status, prompt, start_image_url, high_lora, low_lora)
            VALUES (?, ?, 'pending', ?, ?, ?, ?)
        """, (job_id, segment_index, prompt, start_image_url,
              serialize_loras(high_loras), serialize_loras(low_loras)))


def create_segments_for_job(
    job_id: int,
    total_segments: int,
    initial_prompt: str,
    start_image_url: str,
    high_loras: Optional[List[str]] = None,
    low_loras: Optional[List[str]] = None
):
    """Create segment records for a job (legacy function for backward compatibility).

    Only segment 0 gets the initial prompt, start image, and LoRA selections.
    Subsequent segments are created with no prompt - user must provide one after each segment completes.

    Args:
        job_id: The job ID
        total_segments: Number of segments to create
        initial_prompt: The prompt for segment 0
        start_image_url: ComfyUI image URL for the starting image
        high_loras: List of high noise LoRA filenames (max 2)
        low_loras: List of low noise LoRA filenames (max 2)
    """
    with get_connection() as conn:
        cursor = conn.cursor()
        for i in range(total_segments):
            if i == 0:
                # First segment uses the uploaded image, initial prompt, and LoRA selections
                cursor.execute("""
                    INSERT INTO job_segments (job_id, segment_index, status, prompt, start_image_url, high_lora, low_lora)
                    VALUES (?, ?, 'pending', ?, ?, ?, ?)
                """, (job_id, i, initial_prompt, start_image_url,
                      serialize_loras(high_loras), serialize_loras(low_loras)))
            else:
                # Subsequent segments start with no prompt - user provides after previous segment completes
                cursor.execute("""
                    INSERT INTO job_segments (job_id, segment_index, status)
                    VALUES (?, ?, 'pending')
                """, (job_id, i))


def get_job_segments(job_id: int) -> List[Dict[str, Any]]:
    """Get all segments for a job, ordered by segment_index."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM job_segments WHERE job_id = ? ORDER BY segment_index ASC",
            (job_id,)
        )
        return [dict(row) for row in cursor.fetchall()]


def get_segment(job_id: int, segment_index: int) -> Optional[Dict[str, Any]]:
    """Get a specific segment by job_id and segment_index."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM job_segments WHERE job_id = ? AND segment_index = ?",
            (job_id, segment_index)
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def get_next_pending_segment(job_id: int) -> Optional[Dict[str, Any]]:
    """Get the next pending segment for a job."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM job_segments WHERE job_id = ? AND status = 'pending' ORDER BY segment_index ASC LIMIT 1",
            (job_id,)
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def update_segment_status(
    job_id: int,
    segment_index: int,
    status: str,
    comfyui_prompt_id: Optional[str] = None,
    end_frame_url: Optional[str] = None,
    video_path: Optional[str] = None,
    error_message: Optional[str] = None,
    execution_time: Optional[float] = None
):
    """Update a segment's status and related fields."""
    with get_connection() as conn:
        cursor = conn.cursor()
        
        updates = ["status = ?"]
        params = [status]
        
        if status == "completed":
            updates.append("completed_at = ?")
            params.append(utc_now_iso())
        
        if comfyui_prompt_id is not None:
            updates.append("comfyui_prompt_id = ?")
            params.append(comfyui_prompt_id)
        
        if end_frame_url is not None:
            updates.append("end_frame_url = ?")
            params.append(end_frame_url)
        
        if video_path is not None:
            updates.append("video_path = ?")
            params.append(video_path)
        
        if error_message is not None:
            updates.append("error_message = ?")
            params.append(error_message)
        
        if execution_time is not None:
            updates.append("execution_time = ?")
            params.append(execution_time)
        
        params.extend([job_id, segment_index])
        
        cursor.execute(
            f"UPDATE job_segments SET {', '.join(updates)} WHERE job_id = ? AND segment_index = ?",
            params
        )


def update_segment_prompt(
    job_id: int,
    segment_index: int,
    prompt: str,
    high_loras: Optional[List[str]] = None,
    low_loras: Optional[List[str]] = None
):
    """Update a segment's prompt and optionally its LoRA selections.

    Args:
        job_id: The job ID
        segment_index: The segment index
        prompt: The new prompt
        high_loras: List of high noise LoRA filenames (max 2), or None to not update
        low_loras: List of low noise LoRA filenames (max 2), or None to not update
    """
    with get_connection() as conn:
        cursor = conn.cursor()

        updates = ["prompt = ?"]
        params = [prompt]

        if high_loras is not None:
            updates.append("high_lora = ?")
            params.append(serialize_loras(high_loras))

        if low_loras is not None:
            updates.append("low_lora = ?")
            params.append(serialize_loras(low_loras))

        params.extend([job_id, segment_index])

        cursor.execute(
            f"UPDATE job_segments SET {', '.join(updates)} WHERE job_id = ? AND segment_index = ?",
            params
        )


def update_segment_start_image(job_id: int, segment_index: int, start_image_url: str):
    """Update a segment's start image URL."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE job_segments SET start_image_url = ? WHERE job_id = ? AND segment_index = ?",
            (start_image_url, job_id, segment_index)
        )


def get_completed_segments_count(job_id: int) -> int:
    """Get the count of completed segments for a job."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COUNT(*) FROM job_segments WHERE job_id = ? AND status = 'completed'",
            (job_id,)
        )
        return cursor.fetchone()[0]


def delete_job_segments(job_id: int):
    """Delete all segments for a job."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM job_segments WHERE job_id = ?", (job_id,))


def delete_segment(job_id: int, segment_index: int) -> bool:
    """Delete a specific segment from a job.

    Returns True if the segment was deleted, False otherwise.
    """
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM job_segments WHERE job_id = ? AND segment_index = ?",
            (job_id, segment_index)
        )
        return cursor.rowcount > 0


# ============== LoRA Library Functions ==============

import re

def _normalize_base_name(base: str) -> str:
    """Normalize base name by removing epoch numbers and other variable parts.

    This allows grouping LoRAs that are the same but have different epoch numbers,
    e.g., 'PENISLORA_22_i2v_{TYPE}_e320' and 'PENISLORA_22_i2v_{TYPE}_e496' -> same base.
    """
    # Remove .safetensors extension
    base = re.sub(r'\.safetensors$', '', base, flags=re.IGNORECASE)
    # Remove {TYPE} placeholder (before lowercase conversion)
    base = re.sub(r'\{TYPE\}', '', base)
    # Remove epoch patterns like _e320, -e496, _e8, -000005, _000030, etc.
    base = re.sub(r'[_-]e\d+', '', base)  # _e320, -e8
    base = re.sub(r'[_-]\d{5,}', '', base)  # _000005, -000030 (5+ digits)
    base = re.sub(r'[_-]\d+epoc', '', base)  # _100epoc, -154epoc
    # Normalize case for grouping (lowercase the whole thing)
    base = base.lower()
    # Strip leading/trailing separators and spaces
    base = base.strip('_- ')
    # Clean up any double underscores/hyphens left behind
    base = re.sub(r'[_-]+', '_', base)
    return base


def _get_lora_base_and_type(filename: str) -> tuple:
    """Extract base name and type (high/low/unknown) from a LoRA filename.

    Returns (base_name, type) where type is 'high', 'low', or 'unknown'.
    """
    name = filename.replace('wan2.2/', '')

    # First, strip epoch patterns from the original name before detecting HIGH/LOW
    # This ensures epoch numbers don't interfere with pattern matching
    name_stripped = re.sub(r'[_-]e\d+', '', name)  # _e320, -e8
    name_stripped = re.sub(r'[_-]\d{5,}', '', name_stripped)  # _000005, -000030
    name_stripped = re.sub(r'[_-]\d+epoc', '', name_stripped)  # _100epoc, -154epoc

    # Patterns for HIGH variants
    high_patterns = [
        r'^\d*[Hh]igh [Nn]oise[_-]',  # "23High noise-" prefix pattern
        r'[_-]?[Hh]igh[_-]?[Nn]oise',
        r'[_-]HIGH[_.-]',
        r'[_-]HIGH\.',
        r'[_-]high[_.]',
        r'[_-][Hh]igh-',  # _High- or -High- (underscore/dash before, dash after)
        r'-H-',
        r'-H\.',  # -H at end of name (before extension)
        r'_H\.',
        r'[_-]HN[_-]',
        r'_high_',
        r'-high-',
        r'_high\.',
        r'_High\.',  # Mixed case variant
    ]

    # Patterns for LOW variants
    low_patterns = [
        r'^\d*[Ll]ow [Nn]oise[_-]',  # "56Low noise-" prefix pattern
        r'[_-]?[Ll]ow[_-]?[Nn]oise',
        r'[_-]LOW[_.-]',
        r'[_-]LOW\.',
        r'[_-]low[_.]',
        r'[_-][Ll]ow-',  # _Low- or -Low- (underscore/dash before, dash after)
        r'-L-',
        r'-L\.',  # -L at end of name (before extension)
        r'_L\.',
        r'[_-]LN[_-]',
        r'_low_',
        r'-low-',
        r'_low\.',
        r'_Low\.',  # Mixed case variant
        r'[_-][Ll]ow[_-]',
    ]

    for pattern in high_patterns:
        if re.search(pattern, name_stripped):
            base = re.sub(pattern, '{TYPE}', name_stripped, count=1)
            base = _normalize_base_name(base)
            return base, 'high'

    for pattern in low_patterns:
        if re.search(pattern, name_stripped):
            base = re.sub(pattern, '{TYPE}', name_stripped, count=1)
            base = _normalize_base_name(base)
            return base, 'low'

    return _normalize_base_name(name_stripped), 'unknown'


def get_all_loras() -> List[Dict[str, Any]]:
    """Get all grouped LoRAs from the library."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, base_name, high_file, low_file, friendly_name, url,
                   prompt_text, trigger_keywords, rating, notes, preview_image_url,
                   default_high_weight, default_low_weight, created_at, updated_at
            FROM lora_library
            ORDER BY COALESCE(friendly_name, base_name) ASC
        """)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]


def get_lora(lora_id: int) -> Optional[Dict[str, Any]]:
    """Get a grouped LoRA by ID."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, base_name, high_file, low_file, friendly_name, url,
                   prompt_text, trigger_keywords, rating, notes, preview_image_url,
                   default_high_weight, default_low_weight, created_at, updated_at
            FROM lora_library
            WHERE id = ?
        """, (lora_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


def get_lora_by_base_name(base_name: str) -> Optional[Dict[str, Any]]:
    """Get a grouped LoRA by its base name."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, base_name, high_file, low_file, friendly_name, url,
                   prompt_text, trigger_keywords, rating, notes, preview_image_url,
                   default_high_weight, default_low_weight, created_at, updated_at
            FROM lora_library
            WHERE base_name = ?
        """, (base_name,))
        row = cursor.fetchone()
        return dict(row) if row else None


def get_lora_by_file(filename: str) -> Optional[Dict[str, Any]]:
    """Get a grouped LoRA by either its high or low filename."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, base_name, high_file, low_file, friendly_name, url,
                   prompt_text, trigger_keywords, rating, notes, preview_image_url,
                   default_high_weight, default_low_weight, created_at, updated_at
            FROM lora_library
            WHERE high_file = ? OR low_file = ?
        """, (filename, filename))
        row = cursor.fetchone()
        return dict(row) if row else None


_UNSET = object()  # Sentinel to distinguish "not provided" from "explicitly None"


def update_lora(lora_id: int, friendly_name=_UNSET,
                url=_UNSET, prompt_text=_UNSET,
                trigger_keywords=_UNSET, rating=_UNSET,
                notes=_UNSET,
                preview_image_url=_UNSET,
                default_high_weight=_UNSET,
                default_low_weight=_UNSET):
    """Update LoRA metadata.

    Only updates fields that are explicitly provided. Use the sentinel _UNSET
    as default so we can distinguish between "not provided" and "set to None".
    """
    with get_connection() as conn:
        cursor = conn.cursor()

        # Build dynamic update query - only update fields that were explicitly provided
        updates = []
        values = []

        if friendly_name is not _UNSET:
            updates.append("friendly_name = ?")
            values.append(friendly_name)
        if url is not _UNSET:
            updates.append("url = ?")
            values.append(url)
        if prompt_text is not _UNSET:
            updates.append("prompt_text = ?")
            values.append(prompt_text)
        if trigger_keywords is not _UNSET:
            updates.append("trigger_keywords = ?")
            values.append(trigger_keywords)
        if rating is not _UNSET:
            updates.append("rating = ?")
            values.append(rating)
        if notes is not _UNSET:
            updates.append("notes = ?")
            values.append(notes)
        if preview_image_url is not _UNSET:
            updates.append("preview_image_url = ?")
            values.append(preview_image_url)
        if default_high_weight is not _UNSET:
            updates.append("default_high_weight = ?")
            values.append(default_high_weight)
        if default_low_weight is not _UNSET:
            updates.append("default_low_weight = ?")
            values.append(default_low_weight)

        if not updates:
            return  # Nothing to update

        updates.append("updated_at = ?")
        values.append(utc_now_iso())
        values.append(lora_id)

        cursor.execute(f"""
            UPDATE lora_library
            SET {', '.join(updates)}
            WHERE id = ?
        """, values)


def delete_lora(lora_id: int):
    """Delete a LoRA from the library."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM lora_library WHERE id = ?", (lora_id,))


def _get_existing_filenames(cursor) -> set:
    """Get all filenames currently in the lora_library (both high and low)."""
    cursor.execute("SELECT high_file, low_file FROM lora_library")
    existing = set()
    for row in cursor.fetchall():
        if row['high_file']:
            existing.add(row['high_file'])
        if row['low_file']:
            existing.add(row['low_file'])
    return existing


def bulk_upsert_loras(lora_filenames: List[str]) -> int:
    """Bulk insert/update LoRAs from a list of filenames (typically from ComfyUI).

    Groups high/low variants together by base name.
    Skips any files that are in the hidden list.
    Deduplicates based on actual .safetensors filename - if a file already exists
    in the database, it won't be processed again.
    Returns the number of grouped LoRAs created/updated.
    """
    # Get hidden files to skip
    hidden_files = get_hidden_lora_filenames()

    with get_connection() as conn:
        cursor = conn.cursor()

        # Get all filenames already in the database for deduplication
        existing_filenames = _get_existing_filenames(cursor)

        # Group files by base name, skipping files already in the database
        groups: Dict[str, Dict[str, Optional[str]]] = {}

        for filename in lora_filenames:
            # Skip hidden files
            if filename in hidden_files:
                continue

            # Skip text-to-video LoRAs (this app only handles i2v)
            if '_t2v_' in filename.lower():
                continue

            # Skip files that already exist in the database (dedup by actual filename)
            if filename in existing_filenames:
                continue

            base_name, lora_type = _get_lora_base_and_type(filename)

            if base_name not in groups:
                groups[base_name] = {'high_file': None, 'low_file': None}

            if lora_type == 'high':
                groups[base_name]['high_file'] = filename
            elif lora_type == 'low':
                groups[base_name]['low_file'] = filename
            else:
                # Unknown type - store as high (single file LoRA)
                groups[base_name]['high_file'] = filename

        # Upsert each group
        now = utc_now_iso()

        for base_name, files in groups.items():
            # Check if exists by base_name
            cursor.execute("SELECT id, high_file, low_file FROM lora_library WHERE base_name = ?", (base_name,))
            existing = cursor.fetchone()

            if existing:
                # Update: only update file paths if new ones are provided
                new_high = files['high_file'] or existing['high_file']
                new_low = files['low_file'] or existing['low_file']
                cursor.execute("""
                    UPDATE lora_library
                    SET high_file = ?, low_file = ?, updated_at = ?
                    WHERE id = ?
                """, (new_high, new_low, now, existing['id']))
            else:
                # Insert new
                cursor.execute("""
                    INSERT INTO lora_library (base_name, high_file, low_file, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                """, (base_name, files['high_file'], files['low_file'], now, now))

        conn.commit()

    return len(groups)


def cleanup_duplicate_loras() -> dict:
    """Find and remove duplicate LoRA entries based on actual .safetensors filename.

    If the same filename appears in multiple rows, keeps the row with the most
    metadata (friendly_name, rating, url, etc.) and removes the filename from others.
    Returns a dict with cleanup stats.
    """
    with get_connection() as conn:
        cursor = conn.cursor()

        # Get all rows
        cursor.execute("""
            SELECT id, base_name, high_file, low_file, friendly_name, url,
                   prompt_text, trigger_keywords, rating, preview_image_url
            FROM lora_library
        """)
        rows = [dict(row) for row in cursor.fetchall()]

        # Track which filenames we've seen and which row "owns" them
        # filename -> (row_id, metadata_score)
        filename_owners: Dict[str, tuple] = {}
        duplicates_found = []

        def metadata_score(row):
            """Score how much metadata a row has (higher = more metadata)."""
            score = 0
            if row['friendly_name']:
                score += 10
            if row['rating']:
                score += 5
            if row['url']:
                score += 3
            if row['prompt_text']:
                score += 2
            if row['trigger_keywords']:
                score += 2
            if row['preview_image_url']:
                score += 2
            return score

        # First pass: determine which row should own each filename
        for row in rows:
            row_score = metadata_score(row)

            for file_col in ['high_file', 'low_file']:
                filename = row[file_col]
                if not filename:
                    continue

                if filename not in filename_owners:
                    filename_owners[filename] = (row['id'], row_score, file_col)
                else:
                    existing_id, existing_score, existing_col = filename_owners[filename]
                    if row_score > existing_score:
                        # This row has more metadata, it should own the filename
                        duplicates_found.append((existing_id, filename, existing_col))
                        filename_owners[filename] = (row['id'], row_score, file_col)
                    else:
                        # Existing row keeps ownership
                        duplicates_found.append((row['id'], filename, file_col))

        # Second pass: remove duplicate filenames from non-owner rows
        removed_count = 0
        for row_id, filename, file_col in duplicates_found:
            cursor.execute(f"""
                UPDATE lora_library
                SET {file_col} = NULL, updated_at = ?
                WHERE id = ? AND {file_col} = ?
            """, (utc_now_iso(), row_id, filename))
            if cursor.rowcount > 0:
                removed_count += 1

        # Third pass: delete rows that now have no files
        cursor.execute("""
            DELETE FROM lora_library
            WHERE high_file IS NULL AND low_file IS NULL
        """)
        deleted_empty_rows = cursor.rowcount

        conn.commit()

    return {
        'duplicates_found': len(duplicates_found),
        'duplicates_removed': removed_count,
        'empty_rows_deleted': deleted_empty_rows
    }


# ============== Hidden LoRA Functions ==============

def hide_lora_file(filename: str) -> bool:
    """Add a LoRA file to the hidden list.

    Returns True if added, False if already hidden.
    """
    with get_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT INTO hidden_loras (filename, hidden_at)
                VALUES (?, ?)
            """, (filename, utc_now_iso()))
            return True
        except sqlite3.IntegrityError:
            return False  # Already hidden


def unhide_lora_file(filename: str) -> bool:
    """Remove a LoRA file from the hidden list.

    Returns True if removed, False if wasn't hidden.
    """
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM hidden_loras WHERE filename = ?", (filename,))
        return cursor.rowcount > 0


def get_hidden_loras() -> List[Dict[str, Any]]:
    """Get all hidden LoRA filenames."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, filename, hidden_at
            FROM hidden_loras
            ORDER BY hidden_at DESC
        """)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]


def is_lora_hidden(filename: str) -> bool:
    """Check if a LoRA file is in the hidden list."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM hidden_loras WHERE filename = ?", (filename,))
        return cursor.fetchone() is not None


def get_hidden_lora_filenames() -> set:
    """Get set of all hidden LoRA filenames for efficient lookup."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT filename FROM hidden_loras")
        return {row['filename'] for row in cursor.fetchall()}


# ============== Image Rating Functions ==============

def get_image_rating(image_path: str) -> Optional[int]:
    """Get the rating for an image by its path."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT rating FROM image_ratings WHERE image_path = ?
        """, (image_path,))
        row = cursor.fetchone()
        return row['rating'] if row else None


def set_image_rating(image_path: str, rating: Optional[int]):
    """Set or update the rating for an image."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO image_ratings (image_path, rating, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(image_path) DO UPDATE SET rating = ?, updated_at = ?
        """, (image_path, rating, utc_now_iso(), rating, utc_now_iso()))
        conn.commit()


def get_all_image_ratings() -> Dict[str, int]:
    """Get all image ratings as a dictionary mapping path to rating."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT image_path, rating FROM image_ratings WHERE rating IS NOT NULL")
        rows = cursor.fetchall()
        return {row['image_path']: row['rating'] for row in rows}


# ============== Uploaded Images Functions (Deduplication) ==============

import hashlib


def get_image_by_hash(content_hash: str) -> Optional[Dict[str, Any]]:
    """Check if an image with this hash has already been uploaded.

    Returns the existing record if found, None otherwise.
    """
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, content_hash, comfyui_filename, original_filename, uploaded_at
            FROM uploaded_images
            WHERE content_hash = ?
        """, (content_hash,))
        row = cursor.fetchone()
        return dict(row) if row else None


def store_uploaded_image(content_hash: str, comfyui_filename: str, original_filename: str = None) -> bool:
    """Store a record of an uploaded image for future deduplication.

    Returns True if stored, False if hash already exists.
    """
    with get_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT INTO uploaded_images (content_hash, comfyui_filename, original_filename, uploaded_at)
                VALUES (?, ?, ?, ?)
            """, (content_hash, comfyui_filename, original_filename, utc_now_iso()))
            return True
        except sqlite3.IntegrityError:
            return False  # Hash already exists


def compute_image_hash(image_data: bytes) -> str:
    """Compute SHA256 hash of image data."""
    return hashlib.sha256(image_data).hexdigest()
