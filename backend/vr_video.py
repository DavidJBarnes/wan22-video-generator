"""VR 180 Stereo Video Conversion using MiDaS depth estimation."""

import os
import sys
import json
import subprocess
import shutil
import tempfile
from pathlib import Path
from typing import Optional, Tuple, Callable
import numpy as np

# Check for required environment variable
VR_OUTPUT_PATH = os.environ.get("VR_OUTPUT_PATH")
if not VR_OUTPUT_PATH:
    print("WARNING: VR_OUTPUT_PATH not set, VR video generation will be disabled", file=sys.stderr)
    VR_OUTPUT_PATH = None
else:
    VR_OUTPUT_DIR = Path(VR_OUTPUT_PATH)
    if not VR_OUTPUT_DIR.exists():
        VR_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        print(f"[VRVideo] Created output directory: {VR_OUTPUT_DIR}")


def get_video_info(video_path: str) -> Optional[dict]:
    """Get video metadata including duration, frame count, fps, and dimensions.

    Returns:
        Dict with metadata, or None if probe fails.
    """
    try:
        cmd = [
            "ffprobe",
            "-v", "error",
            "-select_streams", "v:0",
            "-count_frames",
            "-show_entries", "stream=nb_read_frames,r_frame_rate,width,height:format=duration",
            "-of", "json",
            video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            data = json.loads(result.stdout)

            duration = float(data.get("format", {}).get("duration", 0))
            stream = data.get("streams", [{}])[0]
            frame_count = int(stream.get("nb_read_frames", 0))
            width = int(stream.get("width", 0))
            height = int(stream.get("height", 0))

            # Parse frame rate (can be "30/1" or "30000/1001" format)
            fps_str = stream.get("r_frame_rate", "0/1")
            num, den = map(int, fps_str.split("/"))
            fps = num / den if den != 0 else 0

            # Check for audio stream
            audio_cmd = [
                "ffprobe",
                "-v", "error",
                "-select_streams", "a:0",
                "-show_entries", "stream=codec_type",
                "-of", "json",
                video_path
            ]
            audio_result = subprocess.run(audio_cmd, capture_output=True, text=True)
            has_audio = False
            if audio_result.returncode == 0:
                audio_data = json.loads(audio_result.stdout)
                has_audio = len(audio_data.get("streams", [])) > 0

            return {
                "duration": duration,
                "frame_count": frame_count,
                "fps": fps,
                "width": width,
                "height": height,
                "has_audio": has_audio
            }
    except Exception as e:
        print(f"[VRVideo] Error getting video info: {e}")
    return None


def extract_frames(video_path: str, output_dir: str, fps: Optional[float] = None) -> Tuple[bool, int]:
    """Extract frames from a video as PNG files.

    Args:
        video_path: Path to source video
        output_dir: Directory to save extracted frames
        fps: Optional frame rate override (None = extract all frames)

    Returns:
        Tuple of (success, frame_count)
    """
    try:
        os.makedirs(output_dir, exist_ok=True)

        cmd = [
            "ffmpeg",
            "-y",
            "-i", video_path,
        ]

        if fps:
            cmd.extend(["-vf", f"fps={fps}"])

        cmd.extend([
            "-start_number", "0",
            os.path.join(output_dir, "frame_%06d.png")
        ])

        print(f"[VRVideo] Extracting frames from {video_path}...")
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            print(f"[VRVideo] FFmpeg error: {result.stderr}")
            return False, 0

        # Count extracted frames
        frame_count = len([f for f in os.listdir(output_dir) if f.startswith("frame_") and f.endswith(".png")])
        print(f"[VRVideo] Extracted {frame_count} frames")
        return True, frame_count

    except Exception as e:
        print(f"[VRVideo] Error extracting frames: {e}")
        return False, 0


def process_frame_to_stereo(
    frame: np.ndarray,
    eye_separation: float = 0.015,
    depth_strength: float = 0.5,
    equirectangular: bool = False,
    vertical_fov: float = 90,
    depth_smoothing: float = 2.0
) -> np.ndarray:
    """Convert a single frame to stereo pair.

    Args:
        frame: Input frame as numpy array (BGR format)
        eye_separation: Horizontal displacement factor
        depth_strength: Multiplier for depth-based displacement
        equirectangular: Apply equirectangular projection
        vertical_fov: Vertical field of view in degrees
        depth_smoothing: Gaussian blur sigma for depth map

    Returns:
        Stereo pair as numpy array (side-by-side)
    """
    import cv2
    from vr_stereo import (
        estimate_depth, smooth_depth_map, apply_equirectangular_projection,
        DEFAULT_HORIZONTAL_FOV
    )

    height, width = frame.shape[:2]

    # Estimate depth from frame
    depth = estimate_depth(frame)

    # Apply depth smoothing
    if depth_smoothing > 0:
        depth = smooth_depth_map(depth, depth_smoothing)

    # Calculate pixel displacement
    max_displacement = int(width * eye_separation * depth_strength)
    displacement = (depth * max_displacement).astype(np.float32)

    # Create meshgrid for remapping
    x, y = np.meshgrid(np.arange(width), np.arange(height))
    x = x.astype(np.float32)
    y = y.astype(np.float32)

    # Generate left eye view
    left_x = x + displacement
    left_x = np.clip(left_x, 0, width - 1)
    left_eye = cv2.remap(frame, left_x, y, cv2.INTER_LINEAR)

    # Generate right eye view
    right_x = x - displacement
    right_x = np.clip(right_x, 0, width - 1)
    right_eye = cv2.remap(frame, right_x, y, cv2.INTER_LINEAR)

    # Fill holes using inpainting
    left_mask = (left_x < 1).astype(np.uint8) * 255
    right_mask = (right_x > width - 2).astype(np.uint8) * 255

    if np.any(left_mask):
        left_eye = cv2.inpaint(left_eye, left_mask, 3, cv2.INPAINT_TELEA)
    if np.any(right_mask):
        right_eye = cv2.inpaint(right_eye, right_mask, 3, cv2.INPAINT_TELEA)

    # Apply equirectangular projection if enabled
    if equirectangular:
        left_eye = apply_equirectangular_projection(left_eye, DEFAULT_HORIZONTAL_FOV, vertical_fov)
        right_eye = apply_equirectangular_projection(right_eye, DEFAULT_HORIZONTAL_FOV, vertical_fov)

    # Create side-by-side stereo
    stereo = np.hstack([left_eye, right_eye])

    return stereo


def process_frames_to_stereo(
    input_dir: str,
    output_dir: str,
    frame_count: int,
    eye_separation: float = 0.015,
    depth_strength: float = 0.5,
    equirectangular: bool = False,
    vertical_fov: float = 90,
    depth_smoothing: float = 2.0,
    output_sharpening: float = 0.3,
    output_width: int = 4128,
    output_height: int = 2208,
    upscale_enabled: bool = False,
    upscale_factor: int = 2,
    upscale_threshold: int = 1500,
    progress_callback: Optional[Callable[[int, int, str], None]] = None
) -> Tuple[bool, str]:
    """Process all extracted frames to stereo pairs.

    Args:
        input_dir: Directory containing extracted frames
        output_dir: Directory to save stereo frames
        frame_count: Total number of frames to process
        upscale_enabled: Enable Real-ESRGAN upscaling for low-res frames
        upscale_factor: Upscale factor 2 or 4
        upscale_threshold: Upscale if frame width below this
        progress_callback: Optional callback(current_frame, total_frames, stage)

    Returns:
        Tuple of (success, message)
    """
    import cv2
    from vr_stereo import apply_sharpening, unload_midas_model

    # Lazy import upscaler only if needed
    upscaler_loaded = False
    upscale_image = None
    unload_upscaler = None

    try:
        os.makedirs(output_dir, exist_ok=True)

        for i in range(frame_count):
            frame_path = os.path.join(input_dir, f"frame_{i:06d}.png")

            if not os.path.exists(frame_path):
                return False, f"Frame not found: {frame_path}"

            # Load frame
            frame = cv2.imread(frame_path)
            if frame is None:
                return False, f"Could not load frame: {frame_path}"

            # Progress callback
            if progress_callback:
                progress_callback(i + 1, frame_count, "stereo_conversion")

            print(f"[VRVideo] Processing frame {i + 1}/{frame_count}...")

            # AI upscaling for low-resolution frames
            height, width = frame.shape[:2]
            if upscale_enabled and width < upscale_threshold:
                try:
                    if not upscaler_loaded:
                        from upscaler import upscale_image as _upscale, unload_upscaler as _unload
                        upscale_image = _upscale
                        unload_upscaler = _unload
                        upscaler_loaded = True
                        print(f"[VRVideo] Frame width {width} < threshold {upscale_threshold}, enabling Real-ESRGAN {upscale_factor}x upscaling")
                    frame = upscale_image(frame, scale=upscale_factor)
                    height, width = frame.shape[:2]
                    if i == 0:
                        print(f"[VRVideo] Upscaled frame to: {width}x{height}")
                except ImportError as e:
                    if i == 0:
                        print(f"[VRVideo] Real-ESRGAN not available, skipping upscale: {e}")
                except Exception as e:
                    if i == 0:
                        print(f"[VRVideo] Upscaling failed, continuing without: {e}")

            # Convert to stereo
            stereo = process_frame_to_stereo(
                frame,
                eye_separation=eye_separation,
                depth_strength=depth_strength,
                equirectangular=equirectangular,
                vertical_fov=vertical_fov,
                depth_smoothing=depth_smoothing
            )

            # Resize to output dimensions
            current_height, current_width = stereo.shape[:2]
            if current_width != output_width or current_height != output_height:
                stereo = cv2.resize(stereo, (output_width, output_height), interpolation=cv2.INTER_LANCZOS4)

            # Apply sharpening
            if output_sharpening > 0:
                stereo = apply_sharpening(stereo, output_sharpening)

            # Save stereo frame
            output_path = os.path.join(output_dir, f"stereo_{i:06d}.png")
            cv2.imwrite(output_path, stereo)

        # Unload models to free GPU memory
        unload_midas_model()
        if upscaler_loaded and unload_upscaler:
            unload_upscaler()

        return True, f"Processed {frame_count} frames"

    except Exception as e:
        import traceback
        traceback.print_exc()
        unload_midas_model()
        if upscaler_loaded and unload_upscaler:
            unload_upscaler()
        return False, str(e)


def reassemble_video(
    frames_dir: str,
    output_path: str,
    fps: float,
    source_video: Optional[str] = None
) -> Tuple[bool, str]:
    """Reassemble stereo frames into a video, optionally with audio from source.

    Args:
        frames_dir: Directory containing stereo frames
        output_path: Path for output video
        fps: Frame rate for output video
        source_video: Optional source video to copy audio from

    Returns:
        Tuple of (success, message)
    """
    try:
        # Build ffmpeg command
        cmd = [
            "ffmpeg",
            "-y",
            "-framerate", str(fps),
            "-i", os.path.join(frames_dir, "stereo_%06d.png"),
        ]

        # Add audio from source if available
        if source_video:
            # Check if source has audio
            info = get_video_info(source_video)
            if info and info.get("has_audio"):
                cmd.extend(["-i", source_video, "-map", "0:v", "-map", "1:a", "-shortest"])

        cmd.extend([
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "18",
            "-pix_fmt", "yuv420p",
        ])

        # Copy audio codec if we have audio
        if source_video:
            info = get_video_info(source_video)
            if info and info.get("has_audio"):
                cmd.extend(["-c:a", "aac", "-b:a", "192k"])

        cmd.append(output_path)

        print(f"[VRVideo] Reassembling video: {output_path}")
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            print(f"[VRVideo] FFmpeg error: {result.stderr}")
            return False, f"FFmpeg error: {result.stderr}"

        if os.path.exists(output_path):
            return True, f"Video created: {output_path}"
        else:
            return False, "Output file not created"

    except Exception as e:
        print(f"[VRVideo] Error reassembling video: {e}")
        return False, str(e)


def convert_video_to_vr180(
    video_path: str,
    output_path: str,
    eye_separation: float = 0.015,
    depth_strength: float = 0.5,
    equirectangular: bool = False,
    vertical_fov: float = 90,
    depth_smoothing: float = 2.0,
    output_sharpening: float = 0.3,
    output_width: int = 4128,
    output_height: int = 2208,
    upscale_enabled: bool = False,
    upscale_factor: int = 2,
    upscale_threshold: int = 1500,
    progress_callback: Optional[Callable[[int, int, str], None]] = None
) -> Tuple[bool, str]:
    """Main pipeline: Convert a regular video to VR 180 stereo video.

    Args:
        video_path: Path to source video
        output_path: Path for output VR video
        upscale_enabled: Enable Real-ESRGAN upscaling for low-res frames
        upscale_factor: Upscale factor 2 or 4
        upscale_threshold: Upscale if frame width below this
        progress_callback: Optional callback(current, total, stage) for progress updates

    Returns:
        Tuple of (success, message)
    """
    if not VR_OUTPUT_PATH:
        return False, "VR_OUTPUT_PATH not configured"

    # Create temporary directory for processing
    temp_dir = tempfile.mkdtemp(prefix="vr_video_")
    frames_dir = os.path.join(temp_dir, "frames")
    stereo_dir = os.path.join(temp_dir, "stereo")

    try:
        # Stage 1: Get video info
        print(f"[VRVideo] Analyzing video: {video_path}")
        info = get_video_info(video_path)
        if not info:
            return False, "Could not get video info"

        frame_count = info["frame_count"]
        fps = info["fps"]
        print(f"[VRVideo] Video: {frame_count} frames at {fps} fps, {info['width']}x{info['height']}")

        if progress_callback:
            progress_callback(0, frame_count, "analyzing")

        # Stage 2: Extract frames
        print("[VRVideo] Stage 1: Extracting frames...")
        if progress_callback:
            progress_callback(0, frame_count, "extracting")

        success, extracted_count = extract_frames(video_path, frames_dir)
        if not success:
            return False, "Failed to extract frames"

        # Use actual extracted count if different
        if extracted_count != frame_count:
            print(f"[VRVideo] Adjusted frame count: {extracted_count}")
            frame_count = extracted_count

        # Stage 3: Process frames to stereo
        print("[VRVideo] Stage 2: Converting frames to stereo...")
        success, message = process_frames_to_stereo(
            frames_dir,
            stereo_dir,
            frame_count,
            eye_separation=eye_separation,
            depth_strength=depth_strength,
            equirectangular=equirectangular,
            vertical_fov=vertical_fov,
            depth_smoothing=depth_smoothing,
            output_sharpening=output_sharpening,
            output_width=output_width,
            output_height=output_height,
            upscale_enabled=upscale_enabled,
            upscale_factor=upscale_factor,
            upscale_threshold=upscale_threshold,
            progress_callback=progress_callback
        )

        if not success:
            return False, f"Stereo conversion failed: {message}"

        # Stage 4: Reassemble video
        print("[VRVideo] Stage 3: Reassembling video...")
        if progress_callback:
            progress_callback(frame_count, frame_count, "reassembling")

        success, message = reassemble_video(stereo_dir, output_path, fps, video_path)
        if not success:
            return False, f"Video reassembly failed: {message}"

        print(f"[VRVideo] Conversion complete: {output_path}")
        return True, f"VR video created: {output_path}"

    except Exception as e:
        import traceback
        traceback.print_exc()
        return False, str(e)

    finally:
        # Clean up temporary directory
        if os.path.exists(temp_dir):
            print(f"[VRVideo] Cleaning up temp directory: {temp_dir}")
            shutil.rmtree(temp_dir, ignore_errors=True)


def get_vr_video_output_path(source_video: str, vr_video_id: int) -> str:
    """Generate output path for a VR video.

    Args:
        source_video: Original video filename
        vr_video_id: Database ID for the VR video record

    Returns:
        Full path for the VR output video
    """
    if not VR_OUTPUT_PATH:
        raise ValueError("VR_OUTPUT_PATH not configured")

    base_name = Path(source_video).stem
    output_name = f"{base_name}_vr180_{vr_video_id}.mp4"

    return str(Path(VR_OUTPUT_PATH) / output_name)
