"""Database module for job and settings persistence."""

import sqlite3
import json
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from contextlib import contextmanager


def utc_now_iso():
    """Return current UTC time as ISO string with Z suffix for proper browser parsing."""
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

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

        # Settings table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)

        # Insert default settings if not exist
        # Note: comfyui_url should match config.py COMFYUI_SERVER_URL
        default_settings = {
            "comfyui_url": "http://3090.zero:8188",
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
    input_image: Optional[str] = None
) -> int:
    """Create a new job and return its ID."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO jobs (name, prompt, negative_prompt, workflow_type, parameters, input_image, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            name,
            prompt,
            negative_prompt,
            workflow_type,
            json.dumps(parameters) if parameters else None,
            input_image,
            utc_now_iso()
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
    """Get all pending jobs ordered by creation time."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at ASC"
        )
        return [_row_to_job_dict(row) for row in cursor.fetchall()]


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


# ============== Segment Functions ==============

def create_first_segment(
    job_id: int,
    initial_prompt: str,
    start_image_url: str,
    high_lora: Optional[str] = None,
    low_lora: Optional[str] = None
):
    """Create the first segment for a job (on-demand workflow).

    In the new workflow, segments are created on-demand as prompts are provided.
    This creates segment 0 with the initial prompt, start image, and LoRA selections.
    """
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO job_segments (job_id, segment_index, status, prompt, start_image_url, high_lora, low_lora)
            VALUES (?, ?, 'pending', ?, ?, ?, ?)
        """, (job_id, 0, initial_prompt, start_image_url, high_lora, low_lora))


def create_next_segment(
    job_id: int,
    segment_index: int,
    prompt: str,
    start_image_url: str,
    high_lora: Optional[str] = None,
    low_lora: Optional[str] = None
):
    """Create the next segment for a job (on-demand workflow).

    Creates a new segment with the provided prompt and settings.
    """
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO job_segments (job_id, segment_index, status, prompt, start_image_url, high_lora, low_lora)
            VALUES (?, ?, 'pending', ?, ?, ?, ?)
        """, (job_id, segment_index, prompt, start_image_url, high_lora, low_lora))


def create_segments_for_job(
    job_id: int,
    total_segments: int,
    initial_prompt: str,
    start_image_url: str,
    high_lora: Optional[str] = None,
    low_lora: Optional[str] = None
):
    """Create segment records for a job (legacy function for backward compatibility).

    Only segment 0 gets the initial prompt, start image, and LoRA selections.
    Subsequent segments are created with no prompt - user must provide one after each segment completes.
    """
    with get_connection() as conn:
        cursor = conn.cursor()
        for i in range(total_segments):
            if i == 0:
                # First segment uses the uploaded image, initial prompt, and LoRA selections
                cursor.execute("""
                    INSERT INTO job_segments (job_id, segment_index, status, prompt, start_image_url, high_lora, low_lora)
                    VALUES (?, ?, 'pending', ?, ?, ?, ?)
                """, (job_id, i, initial_prompt, start_image_url, high_lora, low_lora))
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
    high_lora: Optional[str] = None,
    low_lora: Optional[str] = None
):
    """Update a segment's prompt and optionally its LoRA selections."""
    with get_connection() as conn:
        cursor = conn.cursor()
        
        updates = ["prompt = ?"]
        params = [prompt]
        
        if high_lora is not None:
            updates.append("high_lora = ?")
            params.append(high_lora)
        
        if low_lora is not None:
            updates.append("low_lora = ?")
            params.append(low_lora)
        
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
