"""Video utilities for frame extraction and video stitching."""

import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional, List
import httpx


# Output directory for downloaded videos and extracted frames
# Use absolute path based on the backend directory to avoid CWD issues
BACKEND_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BACKEND_DIR / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

print(f"[VideoUtils] Output directory: {OUTPUT_DIR}")


def download_video_from_comfyui(video_url: str, output_path: str) -> bool:
    """Download a video from ComfyUI to a local path."""
    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.get(video_url)
            if response.status_code == 200:
                with open(output_path, "wb") as f:
                    f.write(response.content)
                print(f"[VideoUtils] Downloaded video to {output_path}")
                return True
            else:
                print(f"[VideoUtils] Failed to download video: {response.status_code}")
                return False
    except Exception as e:
        print(f"[VideoUtils] Error downloading video: {e}")
        return False


def extract_last_frame(video_path: str, output_image_path: str) -> bool:
    """Extract the last frame from a video using ffmpeg.
    
    Args:
        video_path: Path to the input video file
        output_image_path: Path where the extracted frame should be saved
        
    Returns:
        True if extraction was successful, False otherwise
    """
    try:
        # Use ffmpeg to extract the last frame
        # -sseof -1 seeks to 1 second before the end
        # -frames:v 1 extracts only 1 frame
        cmd = [
            "ffmpeg",
            "-y",  # Overwrite output file if exists
            "-sseof", "-0.1",  # Seek to 0.1 seconds before end
            "-i", video_path,
            "-frames:v", "1",
            "-q:v", "2",  # High quality JPEG
            output_image_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0 and os.path.exists(output_image_path):
            print(f"[VideoUtils] Extracted last frame to {output_image_path}")
            return True
        else:
            print(f"[VideoUtils] ffmpeg error: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"[VideoUtils] Error extracting last frame: {e}")
        return False


def stitch_videos(video_paths: List[str], output_path: str) -> bool:
    """Stitch multiple videos together using ffmpeg concat demuxer.
    
    Args:
        video_paths: List of paths to video files to concatenate
        output_path: Path where the final stitched video should be saved
        
    Returns:
        True if stitching was successful, False otherwise
    """
    if not video_paths:
        print("[VideoUtils] No videos to stitch")
        return False
    
    if len(video_paths) == 1:
        # Just copy the single video
        try:
            import shutil
            shutil.copy(video_paths[0], output_path)
            print(f"[VideoUtils] Single video copied to {output_path}")
            return True
        except Exception as e:
            print(f"[VideoUtils] Error copying video: {e}")
            return False
    
    try:
        # Create a temporary file listing all videos for concat
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            for video_path in video_paths:
                # Escape single quotes in path
                escaped_path = video_path.replace("'", "'\\''")
                f.write(f"file '{escaped_path}'\n")
            concat_file = f.name
        
        # Use ffmpeg concat demuxer
        cmd = [
            "ffmpeg",
            "-y",  # Overwrite output file if exists
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file,
            "-c", "copy",  # Copy streams without re-encoding
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        # Clean up temp file
        os.unlink(concat_file)
        
        if result.returncode == 0 and os.path.exists(output_path):
            print(f"[VideoUtils] Stitched {len(video_paths)} videos to {output_path}")
            return True
        else:
            print(f"[VideoUtils] ffmpeg stitch error: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"[VideoUtils] Error stitching videos: {e}")
        return False


def get_job_output_dir(job_id: int) -> Path:
    """Get the output directory for a job, creating it if needed."""
    job_dir = OUTPUT_DIR / f"job_{job_id}"
    job_dir.mkdir(exist_ok=True)
    return job_dir


def get_segment_video_path(job_id: int, segment_index: int) -> str:
    """Get the path where a segment's video should be stored."""
    job_dir = get_job_output_dir(job_id)
    return str(job_dir / f"segment_{segment_index}.mp4")


def get_segment_frame_path(job_id: int, segment_index: int, frame_type: str = "last") -> str:
    """Get the path where a segment's frame should be stored.
    
    Args:
        job_id: The job ID
        segment_index: The segment index
        frame_type: Either "last" for the last frame or "start" for the start frame
    """
    job_dir = get_job_output_dir(job_id)
    return str(job_dir / f"segment_{segment_index}_{frame_type}_frame.jpg")


def get_final_video_path(job_id: int) -> str:
    """Get the path where the final stitched video should be stored."""
    job_dir = get_job_output_dir(job_id)
    return str(job_dir / "final_video.mp4")
