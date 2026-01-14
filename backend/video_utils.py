"""Video utilities for frame extraction and video stitching."""

import os
import sys
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional, List
import httpx

# JOB_OUTPUT_PATH must be set via environment variable - no fallback allowed
JOB_OUTPUT_PATH = os.environ.get("JOB_OUTPUT_PATH")

if not JOB_OUTPUT_PATH:
    print("FATAL: JOB_OUTPUT_PATH environment variable is not set. Cannot start API.", file=sys.stderr)
    sys.exit(1)

OUTPUT_DIR = Path(JOB_OUTPUT_PATH)

if not OUTPUT_DIR.exists():
    print(f"FATAL: Output directory not found at path: {OUTPUT_DIR}. Cannot start API.", file=sys.stderr)
    sys.exit(1)

print(f"[VideoUtils] Output directory: {OUTPUT_DIR}")


def remux_video(input_path: str) -> str:
    """Remux a video to fix missing duration metadata.

    VHS_VideoCombine outputs videos without proper duration metadata.
    This remux operation rewrites the container without re-encoding,
    which fixes the duration metadata issue.

    Args:
        input_path: Path to the input video file

    Returns:
        The input path (modified in-place) on success, or original path on failure
    """
    temp_path = input_path + ".remux.mp4"
    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-c", "copy", temp_path],
            capture_output=True,
            text=True
        )
        if result.returncode == 0 and os.path.exists(temp_path):
            os.replace(temp_path, input_path)
            print(f"[VideoUtils] Remuxed video to fix duration metadata: {input_path}")
            return input_path
        else:
            print(f"[VideoUtils] Remux warning: {result.stderr}")
            if os.path.exists(temp_path):
                os.remove(temp_path)
            return input_path
    except Exception as e:
        print(f"[VideoUtils] Remux error (non-fatal): {e}")
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return input_path


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


def _extract_last_frame_approximate(video_path: str, output_image_path: str) -> bool:
    """Fallback: extract approximate last frame using sseof."""
    cmd = [
        "ffmpeg",
        "-y",
        "-sseof", "-0.1",
        "-i", video_path,
        "-frames:v", "1",
        output_image_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0 and os.path.exists(output_image_path):
        print(f"[VideoUtils] Extracted approximate last frame to {output_image_path}")
        return True
    else:
        print(f"[VideoUtils] ffmpeg error: {result.stderr}")
        return False


def extract_last_frame(video_path: str, output_image_path: str) -> bool:
    """Extract the exact last frame from a video using ffmpeg.

    Uses ffprobe to get the exact frame count, then extracts that specific frame.
    Falls back to approximate method if frame count cannot be determined.

    Args:
        video_path: Path to the input video file
        output_image_path: Path where the extracted frame should be saved (use .png for lossless)

    Returns:
        True if extraction was successful, False otherwise
    """
    try:
        # First, get the total frame count
        probe_cmd = [
            "ffprobe",
            "-v", "error",
            "-select_streams", "v:0",
            "-count_frames",
            "-show_entries", "stream=nb_read_frames",
            "-of", "csv=p=0",
            video_path
        ]
        result = subprocess.run(probe_cmd, capture_output=True, text=True)

        if result.returncode != 0 or not result.stdout.strip():
            # Fallback to original method if probe fails
            print(f"[VideoUtils] Frame count probe failed, using approximate method")
            return _extract_last_frame_approximate(video_path, output_image_path)

        total_frames = int(result.stdout.strip())

        # Extract the exact last frame using select filter
        cmd = [
            "ffmpeg",
            "-y",
            "-i", video_path,
            "-vf", f"select=eq(n\\,{total_frames - 1})",
            "-frames:v", "1",
            output_image_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode == 0 and os.path.exists(output_image_path):
            print(f"[VideoUtils] Extracted exact last frame (frame {total_frames - 1}) to {output_image_path}")
            return True
        else:
            print(f"[VideoUtils] ffmpeg error: {result.stderr}")
            # Try fallback
            return _extract_last_frame_approximate(video_path, output_image_path)

    except Exception as e:
        print(f"[VideoUtils] Error extracting last frame: {e}")
        return _extract_last_frame_approximate(video_path, output_image_path)


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


def get_video_durations(video_paths: List[str]) -> List[Optional[float]]:
    """Get durations of multiple videos in parallel.

    Args:
        video_paths: List of paths to video files

    Returns:
        List of durations in seconds (or None for failures), in same order as input
    """
    with ThreadPoolExecutor(max_workers=4) as executor:
        return list(executor.map(get_video_duration, video_paths))


def get_video_info(video_path: str) -> Optional[dict]:
    """Get video metadata including duration, frame count, and fps.

    Returns:
        Dict with 'duration', 'frame_count', 'fps' keys, or None if probe fails.
    """
    try:
        cmd = [
            "ffprobe",
            "-v", "error",
            "-select_streams", "v:0",
            "-count_frames",
            "-show_entries", "stream=nb_read_frames,r_frame_rate:format=duration",
            "-of", "json",
            video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            import json
            data = json.loads(result.stdout)

            duration = float(data.get("format", {}).get("duration", 0))
            frame_count = int(data.get("streams", [{}])[0].get("nb_read_frames", 0))

            # Parse frame rate (can be "30/1" or "30000/1001" format)
            fps_str = data.get("streams", [{}])[0].get("r_frame_rate", "0/1")
            num, den = map(int, fps_str.split("/"))
            fps = num / den if den != 0 else 0

            return {
                "duration": duration,
                "frame_count": frame_count,
                "fps": fps
            }
    except Exception as e:
        print(f"[VideoUtils] Error getting video info: {e}")
    return None


def get_video_info_batch(video_paths: List[str]) -> List[Optional[dict]]:
    """Get video info for multiple videos in parallel.

    Args:
        video_paths: List of paths to video files

    Returns:
        List of info dicts (or None for failures), in same order as input
    """
    with ThreadPoolExecutor(max_workers=4) as executor:
        return list(executor.map(get_video_info, video_paths))


def apply_fade_effects(input_path: str, output_path: str, fade_in: bool = False, fade_out: bool = False,
                       fade_duration: float = 2.0) -> bool:
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


def stitch_videos(video_paths: List[str], output_path: str, segment_info: Optional[List[dict]] = None,
                  high_quality: bool = False) -> bool:
    """Stitch multiple videos together using ffmpeg filter_complex.

    Drops the first frame from segments 1+ to eliminate duplicate frames at boundaries
    (since each segment's first frame is identical to the previous segment's last frame).

    Args:
        video_paths: List of paths to video files to concatenate
        output_path: Path where the final stitched video should be saved
        segment_info: Optional list of dicts with segment metadata. If provided,
                     should have same length as video_paths. Each dict can contain:
                     - fade_to_black: bool - whether to apply fade-to-black transition after this segment
        high_quality: If True, use slower but higher quality VP9 encoding settings.
                     Recommended for final exports. Default False for fast previews.

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
    print(
        f"[VideoUtils] stitch_videos called with {len(video_paths)} videos, segment_info={segment_info}, high_quality={high_quality}")

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

    # Define VP9 encoding parameters based on quality setting
    if high_quality:
        # Higher quality for final exports (slower encoding)
        vp9_params = [
            "-c:v", "libvpx-vp9",
            "-crf", "18",  # Better quality (lower = better)
            "-b:v", "0",  # Variable bitrate
            "-pix_fmt", "yuv420p",
            "-deadline", "good",  # Better quality than realtime
            "-cpu-used", "2",  # Much better quality (0-8, lower = better)
            "-row-mt", "1",  # Multi-threaded row encoding
            "-auto-alt-ref", "1",  # Better compression efficiency
            "-lag-in-frames", "25",  # Look-ahead for better bitrate decisions
        ]
        print("[VideoUtils] Using high-quality VP9 encoding settings")
    else:
        # Fast preview quality
        vp9_params = [
            "-c:v", "libvpx-vp9",
            "-crf", "30",  # Moderate quality
            "-b:v", "0",
            "-pix_fmt", "yuv420p",
            "-deadline", "realtime",  # Fastest encoding
            "-cpu-used", "8",  # Maximum speed
            "-row-mt", "1",
        ]
        print("[VideoUtils] Using fast preview VP9 encoding settings")

    try:
        if len(processed_paths) == 1:
            # Single video - re-encode to WebM for Firefox compatibility
            cmd = [
                "ffmpeg",
                "-y",
                "-i", processed_paths[0],
                *vp9_params,
                output_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0 and os.path.exists(output_path):
                print(f"[VideoUtils] Single video encoded to {output_path}")
                for temp_file in temp_files:
                    if os.path.exists(temp_file):
                        os.remove(temp_file)
                return True
            else:
                print(f"[VideoUtils] ffmpeg error: {result.stderr}")
                return False

        # Multiple segments: use filter_complex to drop first frame from segments 1+
        # This eliminates the duplicate frame at segment boundaries
        filter_parts = []
        concat_inputs = []

        for i in range(len(processed_paths)):
            if i == 0:
                # First segment: use all frames
                filter_parts.append(f"[{i}:v]setpts=PTS-STARTPTS[v{i}]")
            else:
                # Subsequent segments: drop first frame (it's a duplicate of previous segment's last frame)
                filter_parts.append(f"[{i}:v]trim=start_frame=1,setpts=PTS-STARTPTS[v{i}]")
            concat_inputs.append(f"[v{i}]")

        # Concatenate all processed streams
        filter_parts.append(f"{''.join(concat_inputs)}concat=n={len(processed_paths)}:v=1:a=0[outv]")
        filter_complex = ";".join(filter_parts)

        # Build ffmpeg command with all inputs
        cmd = ["ffmpeg", "-y"]
        for video_path in processed_paths:
            cmd.extend(["-i", video_path])
        cmd.extend([
            "-filter_complex", filter_complex,
            "-map", "[outv]",
            *vp9_params,
            output_path
        ])

        print(f"[VideoUtils] Running ffmpeg with filter_complex to drop duplicate boundary frames")
        result = subprocess.run(cmd, capture_output=True, text=True)

        # Clean up temp files
        for temp_file in temp_files:
            if os.path.exists(temp_file):
                os.remove(temp_file)

        if result.returncode == 0 and os.path.exists(output_path):
            print(
                f"[VideoUtils] Stitched {len(processed_paths)} videos to {output_path} (dropped {len(processed_paths) - 1} duplicate frames)")
            return True
        else:
            print(f"[VideoUtils] ffmpeg stitch error: {result.stderr}")
            return False

    except Exception as e:
        print(f"[VideoUtils] Error stitching videos: {e}")
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


def get_segment_frame_path(job_id: int, segment_index: int, frame_type: str = "last", for_writing: bool = False) -> str:
    """Get the path where a segment's frame should be stored.

    Args:
        job_id: The job ID
        segment_index: The segment index
        frame_type: Either "last" for the last frame or "start" for the start frame
        for_writing: If True, always returns .png path for new frames.
                    If False (default), checks for existing .jpg fallback for backward compatibility.

    Returns:
        Path to the frame file (PNG format for new files, may return .jpg for existing legacy files)
    """
    job_dir = get_job_output_dir(job_id)
    png_path = str(job_dir / f"segment_{segment_index}_{frame_type}_frame.png")

    if for_writing:
        # Always use PNG for new frames
        return png_path

    # For reading: check if PNG exists, fall back to legacy JPG if not
    if os.path.exists(png_path):
        return png_path

    jpg_path = str(job_dir / f"segment_{segment_index}_{frame_type}_frame.jpg")
    if os.path.exists(jpg_path):
        print(f"[VideoUtils] Using legacy JPG frame: {jpg_path}")
        return jpg_path

    # Neither exists, return PNG path (caller will handle missing file)
    return png_path


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
