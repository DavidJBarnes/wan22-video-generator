"""Video upscaling using Real-ESRGAN locally."""

import os
import subprocess
import tempfile
import shutil
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Local tools configuration
TOOLS_DIR = Path.home() / "tools"
REALESRGAN_BIN = TOOLS_DIR / "realesrgan-ncnn-vulkan"
MODELS_DIR = TOOLS_DIR / "models"

# Output directory for upscaled videos (optional, defaults to same dir as input)
UPSCALE_SAVE_PATH = os.environ.get("UPSCALE_SAVE_PATH")

# Available models
MODELS = {
    "realesrgan-x4plus": {"scales": [2, 4], "default_scale": 4},
    "realesrgan-x4plus-anime": {"scales": [2, 4], "default_scale": 4},
    "realesr-animevideov3": {"scales": [2, 3, 4], "default_scale": 2},
}

DEFAULT_MODEL = "realesr-animevideov3"


def run_command(cmd: list, timeout: int = 600) -> tuple[int, str, str]:
    """Run a local command."""
    logger.info(f"Running: {' '.join(cmd)}")
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return -1, "", "Command timed out"
    except Exception as e:
        return -1, "", str(e)


def upscale_video(
    input_path: str,
    output_path: str = None,
    scale: int = 2,
    model: str = DEFAULT_MODEL,
    progress_callback=None
) -> dict:
    """
    Upscale a video using Real-ESRGAN locally.

    Args:
        input_path: Path to input video file
        output_path: Path for output video, auto-generated if None
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

    # Check if realesrgan binary exists
    if not REALESRGAN_BIN.exists():
        return {"status": "error", "error": f"Real-ESRGAN binary not found at {REALESRGAN_BIN}"}

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
        from datetime import datetime
        input_stem = Path(input_path).stem
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        if UPSCALE_SAVE_PATH:
            output_dir = Path(UPSCALE_SAVE_PATH)
            output_dir.mkdir(parents=True, exist_ok=True)
        else:
            output_dir = Path(input_path).parent
        output_path = str(output_dir / f"{input_stem}_upscaled_{scale}x_{timestamp}.mp4")

    # Create temp work directory
    work_dir = tempfile.mkdtemp(prefix="upscale_")
    frames_in = Path(work_dir) / "frames_in"
    frames_out = Path(work_dir) / "frames_out"
    frames_in.mkdir()
    frames_out.mkdir()

    try:
        report_progress("setup", 0, "Setting up work directory")

        # Extract frames using ffmpeg
        report_progress("extract", 10, "Extracting frames")
        ret, stdout, stderr = run_command([
            "ffmpeg", "-i", input_path,
            "-qscale:v", "2",
            str(frames_in / "frame_%06d.png"),
            "-y"
        ], timeout=300)

        if ret != 0:
            return {"status": "error", "error": f"Failed to extract frames: {stderr}"}

        # Count frames
        frame_files = list(frames_in.glob("*.png"))
        frame_count = len(frame_files)
        if frame_count == 0:
            return {"status": "error", "error": "No frames extracted from video"}
        logger.info(f"Extracted {frame_count} frames")

        # Get video framerate
        ret, stdout, stderr = run_command([
            "ffprobe", "-v", "0", "-of", "csv=p=0",
            "-select_streams", "v:0",
            "-show_entries", "stream=r_frame_rate",
            input_path
        ])

        fps = "30"  # default
        if ret == 0 and stdout.strip():
            fps_parts = stdout.strip().split('/')
            if len(fps_parts) == 2:
                fps = str(int(fps_parts[0]) // int(fps_parts[1]))
            else:
                fps = fps_parts[0]
        logger.info(f"Video FPS: {fps}")

        # Run Real-ESRGAN upscaling
        report_progress("upscale", 30, f"Upscaling {frame_count} frames with {model} ({scale}x)")
        ret, stdout, stderr = run_command([
            str(REALESRGAN_BIN),
            "-i", str(frames_in),
            "-o", str(frames_out),
            "-m", str(MODELS_DIR),
            "-n", model,
            "-s", str(scale),
            "-f", "png"
        ], timeout=1800)  # 30 min timeout for upscaling

        if ret != 0:
            return {"status": "error", "error": f"Upscaling failed: {stderr or stdout}"}

        # Check upscaled frames exist
        upscaled_files = list(frames_out.glob("*.png"))
        upscaled_count = len(upscaled_files)
        if upscaled_count == 0:
            return {"status": "error", "error": "No upscaled frames produced"}
        logger.info(f"Upscaled {upscaled_count} frames")

        # Check if input has audio
        ret, stdout, stderr = run_command([
            "ffprobe", "-v", "0",
            "-select_streams", "a",
            "-show_entries", "stream=codec_type",
            "-of", "csv=p=0",
            input_path
        ])
        has_audio = ret == 0 and "audio" in stdout

        # Reassemble video with ffmpeg
        report_progress("reassemble", 80, "Reassembling video")

        if has_audio:
            # Reassemble with audio from original
            ret, stdout, stderr = run_command([
                "ffmpeg",
                "-framerate", fps,
                "-i", str(frames_out / "frame_%06d.png"),
                "-i", input_path,
                "-map", "0:v",
                "-map", "1:a",
                "-c:v", "libx264",
                "-preset", "medium",
                "-crf", "18",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-shortest",
                output_path,
                "-y"
            ], timeout=300)
        else:
            # No audio
            ret, stdout, stderr = run_command([
                "ffmpeg",
                "-framerate", fps,
                "-i", str(frames_out / "frame_%06d.png"),
                "-c:v", "libx264",
                "-preset", "medium",
                "-crf", "18",
                "-pix_fmt", "yuv420p",
                output_path,
                "-y"
            ], timeout=300)

        if ret != 0:
            return {"status": "error", "error": f"Failed to reassemble video: {stderr or stdout}"}

        report_progress("complete", 100, "Upscaling complete")

        return {
            "status": "success",
            "output_path": output_path,
            "scale": scale,
            "model": model,
            "frames_processed": upscaled_count
        }

    finally:
        # Cleanup work directory
        logger.info(f"Cleaning up work directory: {work_dir}")
        shutil.rmtree(work_dir, ignore_errors=True)


def get_available_models() -> dict:
    """Return available upscaling models and their supported scales."""
    return MODELS
