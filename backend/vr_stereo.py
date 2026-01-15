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


def unload_midas_model():
    """Unload MiDaS model from GPU memory to free VRAM.

    This should be called after VR generation is complete to release
    GPU memory for other tasks (like video generation).
    """
    global _midas_model, _midas_transform, _device

    if _midas_model is None:
        return

    import torch
    import gc

    print("[VRStereo] Unloading MiDaS model...")

    # Move model to CPU first (releases GPU memory)
    _midas_model.to("cpu")

    # Clear references
    _midas_model = None
    _midas_transform = None
    _device = None

    # Force garbage collection
    gc.collect()

    # Clear CUDA cache if available
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.synchronize()

    print("[VRStereo] MiDaS model unloaded, GPU memory freed")


# Default FOV values for equirectangular projection
DEFAULT_HORIZONTAL_FOV = 180  # degrees
DEFAULT_VERTICAL_FOV = 90     # degrees (90 = no projection correction needed)

# Validated Quest 3S defaults
DEFAULT_EYE_SEPARATION = 0.015   # Reduced from 0.03 to minimize eye strain
DEFAULT_DEPTH_STRENGTH = 0.5     # Moderate 3D effect
DEFAULT_EQUIRECTANGULAR = False  # Disabled - unnecessary at 90° FOV
DEFAULT_OUTPUT_WIDTH = 4128      # Quest 3S native width (per eye: 2064)
DEFAULT_OUTPUT_HEIGHT = 2208     # Quest 3S native height

# Quality enhancement defaults
DEFAULT_DEPTH_SMOOTHING = 2.0   # Gaussian blur sigma for depth map (0 = disabled)
DEFAULT_OUTPUT_SHARPENING = 0.3  # Unsharp mask strength (0 = disabled, max ~1.0)


def smooth_depth_map(depth: np.ndarray, sigma: float = DEFAULT_DEPTH_SMOOTHING) -> np.ndarray:
    """Apply Gaussian blur to depth map to smooth harsh stereo transitions.

    Args:
        depth: Depth map as numpy array (0-1 range)
        sigma: Gaussian blur sigma (0 = no smoothing, higher = more blur)

    Returns:
        Smoothed depth map
    """
    if sigma <= 0:
        return depth

    from scipy.ndimage import gaussian_filter
    return gaussian_filter(depth, sigma=sigma)


def apply_sharpening(image: np.ndarray, strength: float = DEFAULT_OUTPUT_SHARPENING) -> np.ndarray:
    """Apply unsharp mask to restore crispness lost during remapping.

    Args:
        image: Input image (BGR format from OpenCV)
        strength: Sharpening strength (0 = disabled, 0.3 = moderate, 1.0 = strong)

    Returns:
        Sharpened image
    """
    if strength <= 0:
        return image

    import cv2

    # Create blurred version for unsharp mask
    blurred = cv2.GaussianBlur(image, (0, 0), sigmaX=3)

    # Unsharp mask: sharpened = original + strength * (original - blurred)
    sharpened = cv2.addWeighted(image, 1.0 + strength, blurred, -strength, 0)

    return sharpened


def apply_equirectangular_projection(
    image: np.ndarray,
    fov_horizontal: float = DEFAULT_HORIZONTAL_FOV,
    fov_vertical: float = DEFAULT_VERTICAL_FOV
) -> np.ndarray:
    """Apply pincushion distortion to pre-warp image for VR 180 viewing.

    When VR players map images to a sphere, they apply barrel distortion.
    We apply the inverse (pincushion) distortion so the two cancel out,
    resulting in straight edges in the final VR view.

    Uses radial polynomial model: r' = r * (1 + k * r²)
    Positive k produces pincushion distortion (edges bow outward).

    Args:
        image: Input image (BGR format from OpenCV)
        fov_horizontal: Horizontal field of view in degrees (unused, kept for API compatibility)
        fov_vertical: Vertical field of view in degrees (90-180, controls distortion strength)

    Returns:
        Pre-warped image with pincushion distortion
    """
    import cv2

    height, width = image.shape[:2]

    # Scale distortion coefficient based on vertical FOV
    # 180° = full correction (k=0.3), 90° = no correction (k=0)
    # Linear interpolation between these extremes
    k_max = 0.3  # Maximum distortion coefficient at 180°
    fov_normalized = (fov_vertical - 90.0) / 90.0  # 0 at 90°, 1 at 180°
    fov_normalized = np.clip(fov_normalized, 0.0, 1.0)
    k = k_max * fov_normalized

    # Create normalized coordinate grids centered at image center
    # Range: -1 to 1 from edge to edge
    u = np.linspace(-1.0, 1.0, width).astype(np.float32)
    v = np.linspace(-1.0, 1.0, height).astype(np.float32)
    u_grid, v_grid = np.meshgrid(u, v)

    # Calculate radial distance from center (normalized)
    r = np.sqrt(u_grid**2 + v_grid**2)

    # Apply pincushion distortion: r' = r * (1 + k * r²)
    # This pushes pixels outward, making edges bow outward
    r_distorted = r * (1.0 + k * r**2)

    # Avoid division by zero at center
    scale = np.where(r > 1e-10, r_distorted / r, 1.0)

    # Apply distortion to coordinates
    u_distorted = u_grid * scale
    v_distorted = v_grid * scale

    # Convert back to pixel coordinates
    map_x = ((u_distorted + 1.0) * 0.5 * width).astype(np.float32)
    map_y = ((v_distorted + 1.0) * 0.5 * height).astype(np.float32)

    # Remap the image with edge replication for cleaner borders
    result = cv2.remap(image, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

    return result


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
    eye_separation: float = DEFAULT_EYE_SEPARATION,
    depth_strength: float = DEFAULT_DEPTH_STRENGTH,
    equirectangular: bool = DEFAULT_EQUIRECTANGULAR,
    vertical_fov: float = DEFAULT_VERTICAL_FOV,
    depth_smoothing: float = DEFAULT_DEPTH_SMOOTHING,
    output_sharpening: float = DEFAULT_OUTPUT_SHARPENING,
    output_width: int = DEFAULT_OUTPUT_WIDTH,
    output_height: int = DEFAULT_OUTPUT_HEIGHT
) -> Tuple[bool, str]:
    """Generate a VR 180 stereo image from a single image.

    Args:
        image_path: Path to the input image
        output_path: Path for the output stereo image
        eye_separation: Horizontal displacement factor (default 0.015)
        depth_strength: Multiplier for depth-based displacement (default 0.5)
        equirectangular: Apply equirectangular projection for VR 180 display (default False)
        vertical_fov: Vertical field of view in degrees (90-180, default 90)
        depth_smoothing: Gaussian blur sigma for depth map (0 = disabled, default 2.0)
        output_sharpening: Unsharp mask strength for final output (0 = disabled, default 0.3)
        output_width: Final stereo image width (default 4128 for Quest 3S)
        output_height: Final stereo image height (default 2208 for Quest 3S)

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

        # Apply depth smoothing to reduce harsh stereo transitions
        if depth_smoothing > 0:
            print(f"[VRStereo] Applying depth smoothing (sigma={depth_smoothing})...")
            depth = smooth_depth_map(depth, depth_smoothing)

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

        # Apply equirectangular projection for proper VR 180 display
        if equirectangular:
            print(f"[VRStereo] Applying equirectangular projection (vertical FOV: {vertical_fov}°)...")
            left_eye = apply_equirectangular_projection(left_eye, DEFAULT_HORIZONTAL_FOV, vertical_fov)
            right_eye = apply_equirectangular_projection(right_eye, DEFAULT_HORIZONTAL_FOV, vertical_fov)

        # Create side-by-side stereo image (left | right)
        stereo = np.hstack([left_eye, right_eye])

        # Resize to target output dimensions (after depth processing, before sharpening)
        current_height, current_width = stereo.shape[:2]
        if current_width != output_width or current_height != output_height:
            print(f"[VRStereo] Resizing from {current_width}x{current_height} to {output_width}x{output_height}...")
            stereo = cv2.resize(stereo, (output_width, output_height), interpolation=cv2.INTER_LANCZOS4)

        # Apply output sharpening to restore crispness (after resize to counteract upscaling softness)
        if output_sharpening > 0:
            print(f"[VRStereo] Applying output sharpening (strength={output_sharpening})...")
            stereo = apply_sharpening(stereo, output_sharpening)

        # Save the stereo image
        print(f"[VRStereo] Saving stereo image: {output_path}")
        cv2.imwrite(output_path, stereo, [cv2.IMWRITE_JPEG_QUALITY, 95])

        return True, f"Stereo image generated: {output_width}x{output_height}"

    except Exception as e:
        print(f"[VRStereo] Error: {e}")
        import traceback
        traceback.print_exc()
        return False, str(e)

    finally:
        # Always unload the model to free GPU memory
        unload_midas_model()


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
