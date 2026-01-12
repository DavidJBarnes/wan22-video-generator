"""Video upscaling using Real-ESRGAN on remote 3090 server."""

import os
import subprocess
import tempfile
import shutil
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Remote server configuration
REMOTE_HOST = "david@3090.zero"
REMOTE_TOOLS_DIR = "/home/david/tools"
REALESRGAN_BIN = f"{REMOTE_TOOLS_DIR}/realesrgan-ncnn-vulkan"
REMOTE_WORK_DIR = "/tmp/upscale_work"

# Available models
MODELS = {
    "realesrgan-x4plus": {"scales": [2, 4], "default_scale": 4},
    "realesrgan-x4plus-anime": {"scales": [2, 4], "default_scale": 4},
    "realesr-animevideov3": {"scales": [2, 3, 4], "default_scale": 2},
}

DEFAULT_MODEL = "realesr-animevideov3"


def run_ssh_command(cmd: str, timeout: int = 600) -> tuple[int, str, str]:
    """Run a command on the remote server via SSH."""
    full_cmd = f'ssh {REMOTE_HOST} "{cmd}"'
    logger.info(f"SSH: {cmd}")
    try:
        result = subprocess.run(
            full_cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return -1, "", "Command timed out"


def scp_to_remote(local_path: str, remote_path: str) -> bool:
    """Copy a file to the remote server."""
    cmd = f"scp {local_path} {REMOTE_HOST}:{remote_path}"
    logger.info(f"SCP upload: {local_path} -> {remote_path}")
    result = subprocess.run(cmd, shell=True, capture_output=True)
    return result.returncode == 0


def scp_from_remote(remote_path: str, local_path: str) -> bool:
    """Copy a file from the remote server."""
    cmd = f"scp {REMOTE_HOST}:{remote_path} {local_path}"
    logger.info(f"SCP download: {remote_path} -> {local_path}")
    result = subprocess.run(cmd, shell=True, capture_output=True)
    return result.returncode == 0


def upscale_video(
    input_path: str,
    output_path: str = None,
    scale: int = 2,
    model: str = DEFAULT_MODEL,
    progress_callback=None
) -> dict:
    """
    Upscale a video using Real-ESRGAN on the remote 3090 server.

    Args:
        input_path: Path to input video file (local)
        output_path: Path for output video (local), auto-generated if None
        scale: Upscale factor (2, 3, or 4 depending on model)
        model: Model name (realesrgan-x4plus, realesr-animevideov3, etc.)
        progress_callback: Optional callback(stage, percent, message)

    Returns:
        dict with status, output_path, and any error message
    """

    def report_progress(stage: str, percent: int, message: str = ""):
        logger.info(f"[{stage}] {percent}% - {message}")
        if progress_callback:
            progress_callback(stage, percent, message)

    # Validate inputs
    if not os.path.exists(input_path):
        return {"status": "error", "error": f"Input file not found: {input_path}"}

    if model not in MODELS:
        return {"status": "error", "error": f"Unknown model: {model}. Available: {list(MODELS.keys())}"}

    model_info = MODELS[model]
    if scale not in model_info["scales"]:
        return {"status": "error", "error": f"Scale {scale} not supported for {model}. Available: {model_info['scales']}"}

    # Generate output path if not provided
    if output_path is None:
        input_stem = Path(input_path).stem
        input_dir = Path(input_path).parent
        output_path = str(input_dir / f"{input_stem}_upscaled_{scale}x.mp4")

    # Create unique work directory on remote
    import uuid
    work_id = str(uuid.uuid4())[:8]
    remote_work = f"{REMOTE_WORK_DIR}/{work_id}"

    try:
        report_progress("setup", 0, "Creating remote work directory")

        # Create work directory on remote
        ret, _, err = run_ssh_command(f"mkdir -p {remote_work}/frames_in {remote_work}/frames_out")
        if ret != 0:
            return {"status": "error", "error": f"Failed to create work directory: {err}"}

        # Upload video to remote
        report_progress("upload", 5, "Uploading video to server")
        remote_input = f"{remote_work}/input{Path(input_path).suffix}"
        if not scp_to_remote(input_path, remote_input):
            return {"status": "error", "error": "Failed to upload video"}

        # Extract frames using ffmpeg on remote
        report_progress("extract", 15, "Extracting frames")
        ret, stdout, stderr = run_ssh_command(
            f"ffmpeg -i {remote_input} -qscale:v 2 {remote_work}/frames_in/frame_%06d.png -y 2>&1",
            timeout=300
        )
        if ret != 0:
            return {"status": "error", "error": f"Failed to extract frames: {stderr}"}

        # Count frames
        ret, stdout, _ = run_ssh_command(f"ls {remote_work}/frames_in | wc -l")
        frame_count = int(stdout.strip()) if ret == 0 else 0
        logger.info(f"Extracted {frame_count} frames")

        # Get video framerate
        ret, stdout, _ = run_ssh_command(
            f"ffprobe -v 0 -of csv=p=0 -select_streams v:0 -show_entries stream=r_frame_rate {remote_input}"
        )
        fps = "30" # default
        if ret == 0 and stdout.strip():
            fps_parts = stdout.strip().split('/')
            if len(fps_parts) == 2:
                fps = str(int(fps_parts[0]) // int(fps_parts[1]))
            else:
                fps = fps_parts[0]
        logger.info(f"Video FPS: {fps}")

        # Run Real-ESRGAN upscaling
        report_progress("upscale", 30, f"Upscaling {frame_count} frames with {model} ({scale}x)")
        ret, stdout, stderr = run_ssh_command(
            f"cd {REMOTE_TOOLS_DIR} && ./realesrgan-ncnn-vulkan "
            f"-i {remote_work}/frames_in "
            f"-o {remote_work}/frames_out "
            f"-n {model} -s {scale} -f png 2>&1",
            timeout=1800  # 30 min timeout for upscaling
        )
        if ret != 0:
            return {"status": "error", "error": f"Upscaling failed: {stderr or stdout}"}

        # Check upscaled frames exist
        ret, stdout, _ = run_ssh_command(f"ls {remote_work}/frames_out | wc -l")
        upscaled_count = int(stdout.strip()) if ret == 0 else 0
        if upscaled_count == 0:
            return {"status": "error", "error": "No upscaled frames produced"}
        logger.info(f"Upscaled {upscaled_count} frames")

        # Reassemble video with ffmpeg
        report_progress("reassemble", 80, "Reassembling video")
        remote_output = f"{remote_work}/output.mp4"

        # Check if input has audio
        ret, stdout, _ = run_ssh_command(
            f"ffprobe -v 0 -select_streams a -show_entries stream=codec_type -of csv=p=0 {remote_input}"
        )
        has_audio = ret == 0 and "audio" in stdout

        if has_audio:
            # Reassemble with audio from original
            ret, stdout, stderr = run_ssh_command(
                f"ffmpeg -framerate {fps} -i {remote_work}/frames_out/frame_%06d.png "
                f"-i {remote_input} -map 0:v -map 1:a -c:v libx264 -preset medium "
                f"-crf 18 -pix_fmt yuv420p -c:a aac -shortest {remote_output} -y 2>&1",
                timeout=300
            )
        else:
            # No audio
            ret, stdout, stderr = run_ssh_command(
                f"ffmpeg -framerate {fps} -i {remote_work}/frames_out/frame_%06d.png "
                f"-c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p {remote_output} -y 2>&1",
                timeout=300
            )

        if ret != 0:
            return {"status": "error", "error": f"Failed to reassemble video: {stderr or stdout}"}

        # Download result
        report_progress("download", 90, "Downloading upscaled video")
        if not scp_from_remote(remote_output, output_path):
            return {"status": "error", "error": "Failed to download upscaled video"}

        report_progress("complete", 100, "Upscaling complete")

        return {
            "status": "success",
            "output_path": output_path,
            "scale": scale,
            "model": model,
            "frames_processed": upscaled_count
        }

    finally:
        # Cleanup remote work directory
        logger.info(f"Cleaning up remote work directory: {remote_work}")
        run_ssh_command(f"rm -rf {remote_work}", timeout=60)


def get_available_models() -> dict:
    """Return available upscaling models and their supported scales."""
    return MODELS
