"""VR 180 Stereo Image Generation using MiDaS depth estimation."""

import os
import sys
from pathlib import Path
from typing import Optional, Tuple
import numpy as np

# Check for required environment variable
VR_OUTPUT_PATH = os.environ.get("VR_OUTPUT_PATH")
if not VR_OUTPUT_PATH:
    print("WARNING: VR_OUTPUT_PATH not set, VR image generation will be disabled", file=sys.stderr)
    VR_OUTPUT_PATH = None
else:
    VR_OUTPUT_DIR = Path(VR_OUTPUT_PATH)
    if not VR_OUTPUT_DIR.exists():
        VR_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        print(f"[VRStereo] Created output directory: {VR_OUTPUT_DIR}")

# Lazy-load heavy dependencies
_midas_model = None
_midas_transform = None
_device = None


def _load_midas():
    """Lazy load MiDaS model on first use."""
    global _midas_model, _midas_transform, _device

    if _midas_model is not None:
        return _midas_model, _midas_transform, _device

    import torch

    _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[VRStereo] Loading MiDaS model on {_device}...")

    # Use MiDaS v3.1 DPT-Large for best quality
    _midas_model = torch.hub.load("intel-isl/MiDaS", "DPT_Large")
    _midas_model.to(_device)
    _midas_model.eval()

    midas_transforms = torch.hub.load("intel-isl/MiDaS", "transforms")
    _midas_transform = midas_transforms.dpt_transform

    print("[VRStereo] MiDaS model loaded successfully")
    return _midas_model, _midas_transform, _device


def estimate_depth(image_path: str) -> np.ndarray:
    """Estimate depth map from an image using MiDaS.

    Args:
        image_path: Path to the input image

    Returns:
        Depth map as numpy array (higher values = closer to camera)
    """
    import torch
    import cv2

    model, transform, device = _load_midas()

    # Load and preprocess image
    img = cv2.imread(image_path)
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    input_batch = transform(img).to(device)

    with torch.no_grad():
        prediction = model(input_batch)
        prediction = torch.nn.functional.interpolate(
            prediction.unsqueeze(1),
            size=img.shape[:2],
            mode="bicubic",
            align_corners=False,
        ).squeeze()

    depth = prediction.cpu().numpy()

    # Normalize depth to 0-1 range
    depth = (depth - depth.min()) / (depth.max() - depth.min() + 1e-8)

    return depth


def generate_stereo_pair(
    image_path: str,
    output_path: str,
    eye_separation: float = 0.03,
    depth_strength: float = 1.0
) -> Tuple[bool, str]:
    """Generate a VR 180 stereo image from a single image.

    Args:
        image_path: Path to the input image
        output_path: Path for the output stereo image
        eye_separation: Horizontal displacement factor (default 0.03 = 3% of image width)
        depth_strength: Multiplier for depth-based displacement (default 1.0)

    Returns:
        Tuple of (success, message)
    """
    import cv2
    from scipy import ndimage

    if not VR_OUTPUT_PATH:
        return False, "VR_OUTPUT_PATH not configured"

    try:
        # Load original image
        img = cv2.imread(image_path)
        if img is None:
            return False, f"Could not load image: {image_path}"

        height, width = img.shape[:2]
        print(f"[VRStereo] Processing image: {width}x{height}")

        # Estimate depth
        print("[VRStereo] Estimating depth...")
        depth = estimate_depth(image_path)

        # Calculate pixel displacement based on depth
        # Closer objects (higher depth) should have more displacement
        max_displacement = int(width * eye_separation * depth_strength)
        displacement = (depth * max_displacement).astype(np.float32)

        # Create meshgrid for remapping
        x, y = np.meshgrid(np.arange(width), np.arange(height))
        x = x.astype(np.float32)
        y = y.astype(np.float32)

        # Generate left eye view (shift right for objects closer to camera)
        left_x = x + displacement
        left_x = np.clip(left_x, 0, width - 1)
        left_eye = cv2.remap(img, left_x, y, cv2.INTER_LINEAR)

        # Generate right eye view (shift left for objects closer to camera)
        right_x = x - displacement
        right_x = np.clip(right_x, 0, width - 1)
        right_eye = cv2.remap(img, right_x, y, cv2.INTER_LINEAR)

        # Fill holes caused by remapping using inpainting
        # Create masks for areas that need inpainting
        left_mask = (left_x < 1).astype(np.uint8) * 255
        right_mask = (right_x > width - 2).astype(np.uint8) * 255

        if np.any(left_mask):
            left_eye = cv2.inpaint(left_eye, left_mask, 3, cv2.INPAINT_TELEA)
        if np.any(right_mask):
            right_eye = cv2.inpaint(right_eye, right_mask, 3, cv2.INPAINT_TELEA)

        # Create side-by-side stereo image (left | right)
        stereo = np.hstack([left_eye, right_eye])

        # Save the stereo image
        print(f"[VRStereo] Saving stereo image: {output_path}")
        cv2.imwrite(output_path, stereo, [cv2.IMWRITE_JPEG_QUALITY, 95])

        return True, f"Stereo image generated: {width*2}x{height}"

    except Exception as e:
        print(f"[VRStereo] Error: {e}")
        import traceback
        traceback.print_exc()
        return False, str(e)


def get_vr_output_path(source_image: str, vr_id: int) -> str:
    """Generate output path for a VR image.

    Args:
        source_image: Original image filename
        vr_id: Database ID for the VR image record

    Returns:
        Full path for the VR output image
    """
    if not VR_OUTPUT_PATH:
        raise ValueError("VR_OUTPUT_PATH not configured")

    # Create filename based on source and ID
    base_name = Path(source_image).stem
    output_name = f"{base_name}_vr180_{vr_id}.jpg"

    return str(Path(VR_OUTPUT_PATH) / output_name)
