#!/usr/bin/env python3
"""Migration script to add upscaled_videos table.

Run this on production before deploying the new code:
    cd backend
    python migrations/add_upscaled_videos_table.py

Or with custom database path:
    DATABASE_PATH=/path/to/queue.db python migrations/add_upscaled_videos_table.py
"""

import os
import sqlite3
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from database import DATABASE_PATH


def migrate():
    """Add upscaled_videos table to the database."""
    print(f"Connecting to database: {DATABASE_PATH}")

    if not os.path.exists(DATABASE_PATH):
        print(f"ERROR: Database not found at {DATABASE_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()

    # Check if table already exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='upscaled_videos'")
    if cursor.fetchone():
        print("Table 'upscaled_videos' already exists. Nothing to do.")
        conn.close()
        return

    print("Creating upscaled_videos table...")
    cursor.execute("""
        CREATE TABLE upscaled_videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            file_path TEXT NOT NULL,
            scale INTEGER NOT NULL,
            model TEXT NOT NULL,
            file_size INTEGER,
            created_at TEXT NOT NULL,
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
        )
    """)

    print("Creating index on job_id...")
    cursor.execute("""
        CREATE INDEX idx_upscaled_videos_job_id ON upscaled_videos(job_id)
    """)

    conn.commit()
    conn.close()

    print("Migration complete!")


if __name__ == "__main__":
    migrate()
