"""Video utilities for frame extraction and video stitching."""

import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional, List
import httpx


# Output directory for downloaded videos and extracted frames
# JOB_OUTPUT_PATH can be overridden via environment variable
BACKEND_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = Path(os.environ.get("JOB_OUTPUT_PATH", str(BACKEND_DIR / "output")))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

print(f"[VideoUtils] Output directory: {OUTPUT_DIR}")


def optimize_video_for_web(video_path: str) -> bool:
    """Optimize an MP4 video for web streaming by moving moov atom to start.

    This uses ffmpeg's faststart flag to enable progressive download/streaming.
    """
    try:
        temp_path = video_path + ".temp.mp4"
        cmd = [
            "ffmpeg",
            "-y",
            "-i", video_path,
            "-c", "copy",  # No re-encoding, just remux
            "-movflags", "+faststart",
            temp_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode == 0 and os.path.exists(temp_path):
            # Replace original with optimized version
            os.replace(temp_path, video_path)
            print(f"[VideoUtils] Optimized video for web: {video_path}")
            return True
        else:
            print(f"[VideoUtils] ffmpeg optimization error: {result.stderr}")
            # Clean up temp file if it exists
            if os.path.exists(temp_path):
                os.remove(temp_path)
            return False

    except Exception as e:
        print(f"[VideoUtils] Error optimizing video: {e}")
        return False


def download_video_from_comfyui(video_url: str, output_path: str) -> bool:
    """Download a video from ComfyUI to a local path and optimize for web.

    Handles ComfyUI's date-based subfolder organization by trying alternate
    subfolder paths if the initial download fails with 404.
    """
    import urllib.parse
    from datetime import datetime, timedelta

    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.get(video_url)
            if response.status_code == 200:
                with open(output_path, "wb") as f:
                    f.write(response.content)
                print(f"[VideoUtils] Downloaded video to {output_path}")

                # Optimize for web streaming and create marker file
                if optimize_video_for_web(output_path):
                    marker_path = output_path + '.web_optimized'
                    Path(marker_path).touch()

                return True
            elif response.status_code == 404:
                # ComfyUI may have saved to a date-based subfolder without reporting it
                # Try date-based subfolders: today and yesterday
                print(f"[VideoUtils] Got 404, trying date-based subfolders...")

                # Parse the original URL to extract filename and base URL
                parsed = urllib.parse.urlparse(video_url)
                query_params = urllib.parse.parse_qs(parsed.query)
                filename = query_params.get("filename", [None])[0]
                media_type = query_params.get("type", ["output"])[0]

                if filename:
                    base_url = f"{parsed.scheme}://{parsed.netloc}/view"

                    # Try today's date and yesterday's date as subfolders
                    dates_to_try = [
                        datetime.now().strftime("%Y-%m-%d"),
                        (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d"),
                    ]

                    for date_subfolder in dates_to_try:
                        alt_url = f"{base_url}?filename={filename}&subfolder={date_subfolder}&type={media_type}"
                        print(f"[VideoUtils] Trying: {alt_url}")
                        alt_response = client.get(alt_url)

                        if alt_response.status_code == 200:
                            with open(output_path, "wb") as f:
                                f.write(alt_response.content)
                            print(f"[VideoUtils] Downloaded video from {date_subfolder}/ subfolder to {output_path}")

                            if optimize_video_for_web(output_path):
                                marker_path = output_path + '.web_optimized'
                                Path(marker_path).touch()

                            return True

                print(f"[VideoUtils] Failed to download video: 404 (file not found in any subfolder)")
                return False
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


def get_video_duration(video_path: str) -> Optional[float]:
    """Get the duration of a video file in seconds using ffprobe.

    Returns:
        Duration in seconds, or None if unable to determine.
    """
    try:
        cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            return float(result.stdout.strip())
    except Exception as e:
        print(f"[VideoUtils] Error getting video duration: {e}")
    return None


def apply_fade_effects(input_path: str, output_path: str, fade_in: bool = False, fade_out: bool = False, fade_duration: float = 2.0) -> bool:
    """Apply fade-in and/or fade-out effects to a video.

    Args:
        input_path: Path to the input video
        output_path: Path where the faded video should be saved
        fade_in: Whether to fade in from black at the start
        fade_out: Whether to fade out to black at the end
        fade_duration: Duration of each fade effect in seconds (default 2.0)

    Returns:
        True if successful, False otherwise
    """
    if not fade_in and not fade_out:
        return False

    try:
        # Get video duration to calculate fade start time for fade out
        duration = get_video_duration(input_path)
        if duration is None:
            print(f"[VideoUtils] Could not determine duration of {input_path}")
            return False

        # Build filter string
        filters = []
        if fade_in:
            filters.append(f"fade=t=in:st=0:d={fade_duration}")
        if fade_out:
            fade_start = max(0, duration - fade_duration)
            filters.append(f"fade=t=out:st={fade_start}:d={fade_duration}")

        filter_string = ",".join(filters)

        cmd = [
            "ffmpeg",
            "-y",
            "-i", input_path,
            "-vf", filter_string,
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "18",
            "-pix_fmt", "yuv420p",
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode == 0 and os.path.exists(output_path):
            effects = []
            if fade_in:
                effects.append("fade-in")
            if fade_out:
                effects.append("fade-out")
            print(f"[VideoUtils] Applied {' + '.join(effects)} to {input_path}")
            return True
        else:
            print(f"[VideoUtils] ffmpeg fade error: {result.stderr}")
            return False

    except Exception as e:
        print(f"[VideoUtils] Error applying fade: {e}")
        return False


def stitch_videos(video_paths: List[str], output_path: str, segment_info: Optional[List[dict]] = None) -> bool:
    """Stitch multiple videos together using ffmpeg concat demuxer.

    Args:
        video_paths: List of paths to video files to concatenate
        output_path: Path where the final stitched video should be saved
        segment_info: Optional list of dicts with segment metadata. If provided,
                     should have same length as video_paths. Each dict can contain:
                     - fade_to_black: bool - whether to apply fade-to-black transition after this segment

    Returns:
        True if stitching was successful, False otherwise
    """
    if not video_paths:
        print("[VideoUtils] No videos to stitch")
        return False

    # Determine which segments need fade effects
    # fade_to_black on segment[i] means:
    #   - fade OUT at end of segment[i]
    #   - fade IN at start of segment[i+1] (if exists)
    processed_paths = []
    temp_files = []

    # Debug: log segment_info
    print(f"[VideoUtils] stitch_videos called with {len(video_paths)} videos, segment_info={segment_info}")

    for i, video_path in enumerate(video_paths):
        # Check if this segment needs fade-out (has fade_to_black enabled)
        needs_fade_out = False
        if segment_info and i < len(segment_info):
            needs_fade_out = segment_info[i].get("fade_to_black", False)

        # Check if previous segment had fade_to_black (this segment needs fade-in)
        needs_fade_in = False
        if segment_info and i > 0 and i - 1 < len(segment_info):
            needs_fade_in = segment_info[i - 1].get("fade_to_black", False)

        print(f"[VideoUtils] Segment {i}: fade_in={needs_fade_in}, fade_out={needs_fade_out}")

        if needs_fade_in or needs_fade_out:
            temp_path = video_path.replace(".mp4", "_faded.mp4")
            if apply_fade_effects(video_path, temp_path, fade_in=needs_fade_in, fade_out=needs_fade_out):
                processed_paths.append(temp_path)
                temp_files.append(temp_path)
            else:
                print(f"[VideoUtils] Fade failed for segment {i}, using original")
                processed_paths.append(video_path)
        else:
            processed_paths.append(video_path)

    try:
        if len(processed_paths) == 1:
            # Re-encode single video to WebM for Firefox compatibility
            cmd = [
                "ffmpeg",
                "-y",
                "-i", processed_paths[0],
                "-c:v", "libvpx-vp9",
                "-crf", "30",
                "-b:v", "0",
                "-pix_fmt", "yuv420p",
                "-deadline", "realtime",
                "-cpu-used", "8",  # Max speed (0-8, higher = faster)
                "-row-mt", "1",  # Multi-threaded row encoding
                output_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0 and os.path.exists(output_path):
                print(f"[VideoUtils] Single video encoded to {output_path}")
                # Clean up temp files
                for temp_file in temp_files:
                    if os.path.exists(temp_file):
                        os.remove(temp_file)
                return True
            else:
                print(f"[VideoUtils] ffmpeg error: {result.stderr}")
                return False

        # Create a temporary file listing all videos for concat
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            for video_path in processed_paths:
                # Escape single quotes in path
                escaped_path = video_path.replace("'", "'\\''")
                f.write(f"file '{escaped_path}'\n")
            concat_file = f.name

        # Use VP9/WebM for native Firefox support (no H.264 codec issues)
        cmd = [
            "ffmpeg",
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file,
            "-c:v", "libvpx-vp9",
            "-crf", "30",  # Quality (lower = better, 30 is good balance)
            "-b:v", "0",  # Variable bitrate
            "-pix_fmt", "yuv420p",
            "-deadline", "realtime",
            "-cpu-used", "8",  # Max speed (0-8, higher = faster)
            "-row-mt", "1",  # Multi-threaded row encoding
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        # Clean up temp files
        os.unlink(concat_file)
        for temp_file in temp_files:
            if os.path.exists(temp_file):
                os.remove(temp_file)

        if result.returncode == 0 and os.path.exists(output_path):
            print(f"[VideoUtils] Stitched {len(processed_paths)} videos to {output_path}")
            return True
        else:
            print(f"[VideoUtils] ffmpeg stitch error: {result.stderr}")
            return False

    except Exception as e:
        print(f"[VideoUtils] Error stitching videos: {e}")
        # Clean up temp files on error
        for temp_file in temp_files:
            if os.path.exists(temp_file):
                os.remove(temp_file)
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


def _sanitize_filename(name: str) -> str:
    """Convert a string to a filesystem-friendly format."""
    # Replace spaces with underscores, keep only alphanumeric, dash, underscore
    safe = "".join(c if c.isalnum() or c in ('-', '_') else '_' for c in name)
    # Collapse multiple underscores and strip
    while '__' in safe:
        safe = safe.replace('__', '_')
    return safe.strip('_')


def get_final_video_path(job_id: int, job_name: str = None) -> str:
    """Get the path where the final stitched video should be stored.

    Args:
        job_id: The job ID
        job_name: Job name (should include metadata like duration/fps)

    Returns:
        Path to the final video file
        Format: {job_name}-{job_id}.webm
    """
    job_dir = get_job_output_dir(job_id)

    if job_name:
        safe_name = _sanitize_filename(job_name)
        filename = f"{safe_name}-{job_id}.webm"
    else:
        filename = f"job_{job_id}.webm"

    return str(job_dir / filename)
