#!/usr/bin/env python3
"""
Convert existing MP4 final videos to WebM format for Firefox compatibility.
Updates the database output_images field to point to the new WebM files.
"""

import os
import json
import subprocess
import sqlite3
from pathlib import Path

DB_PATH = os.environ.get("DB_PATH", "comfyui_queue.db")

def convert_video(mp4_path: str) -> str | None:
    """Convert an MP4 to WebM, return new path or None on failure."""
    webm_path = mp4_path.rsplit('.', 1)[0] + '.webm'

    if os.path.exists(webm_path):
        print(f"  WebM already exists: {webm_path}")
        return webm_path

    if not os.path.exists(mp4_path):
        print(f"  MP4 not found: {mp4_path}")
        return None

    print(f"  Converting: {mp4_path} -> {webm_path}")

    cmd = [
        "ffmpeg",
        "-y",
        "-i", mp4_path,
        "-c:v", "libvpx-vp9",
        "-crf", "30",
        "-b:v", "0",
        "-pix_fmt", "yuv420p",
        "-deadline", "realtime",
        "-cpu-used", "8",
        "-row-mt", "1",
        webm_path
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode == 0 and os.path.exists(webm_path):
        print(f"  Success!")
        return webm_path
    else:
        print(f"  Failed: {result.stderr[:200] if result.stderr else 'Unknown error'}")
        return None


def main():
    print(f"Opening database: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Get all completed jobs with output_images
    cursor.execute("""
        SELECT id, name, output_images
        FROM jobs
        WHERE status = 'completed' AND output_images IS NOT NULL
    """)

    jobs = cursor.fetchall()
    print(f"Found {len(jobs)} completed jobs to check\n")

    updated = 0
    for job in jobs:
        job_id = job['id']
        job_name = job['name']
        output_images = json.loads(job['output_images']) if job['output_images'] else []

        if not output_images:
            continue

        print(f"Job {job_id}: {job_name}")

        new_output_images = []
        changed = False

        for path in output_images:
            if path.endswith('.mp4'):
                webm_path = convert_video(path)
                if webm_path:
                    new_output_images.append(webm_path)
                    changed = True
                else:
                    # Keep the mp4 if conversion failed
                    new_output_images.append(path)
            else:
                new_output_images.append(path)

        if changed:
            cursor.execute(
                "UPDATE jobs SET output_images = ? WHERE id = ?",
                (json.dumps(new_output_images), job_id)
            )
            updated += 1
            print(f"  Updated database entry\n")
        else:
            print(f"  No changes needed\n")

    conn.commit()
    conn.close()

    print(f"\nDone! Updated {updated} jobs.")


if __name__ == "__main__":
    main()
