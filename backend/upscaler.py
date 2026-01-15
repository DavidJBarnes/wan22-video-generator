"""Real-ESRGAN image upscaling for VR stereo pipeline."""

import numpy as np
from typing import Optional

# Lazy-load heavy dependencies
_upscaler = None
_current_scale = None


def _load_realesrgan(scale: int = 2):
    """Lazy load Real-ESRGAN model on first use.

    Args:
        scale: Upscale factor (2 or 4)

    Returns:
        RealESRGANer instance
    """
    global _upscaler, _current_scale

    # Return cached model if scale matches
    if _upscaler is not None and _current_scale == scale:
        return _upscaler

    # Unload existing model if scale changed
    if _upscaler is not None:
        unload_upscaler()

    import torch
    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan import RealESRGANer

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[Upscaler] Loading Real-ESRGAN {scale}x model on {device}...")

    # Select model based on scale factor
    if scale == 4:
        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
        model_path = None  # Will use default from realesrgan package
        netscale = 4
    else:
        # Use 2x model (RealESRGAN_x2plus)
        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=2)
        model_path = None
        netscale = 2

    _upscaler = RealESRGANer(
        scale=netscale,
        model_path=model_path,
        model=model,
        tile=0,  # 0 = no tiling (faster for smaller images)
        tile_pad=10,
        pre_pad=0,
        half=torch.cuda.is_available(),  # Use FP16 on GPU
        device=device
    )
    _current_scale = scale

    print(f"[Upscaler] Real-ESRGAN {scale}x model loaded successfully")
    return _upscaler


def unload_upscaler():
    """Unload Real-ESRGAN model from GPU memory."""
    global _upscaler, _current_scale

    if _upscaler is None:
        return

    import torch
    import gc

    print("[Upscaler] Unloading Real-ESRGAN model...")

    # Clear references
    _upscaler = None
    _current_scale = None

    # Force garbage collection
    gc.collect()

    # Clear CUDA cache if available
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.synchronize()

    print("[Upscaler] Real-ESRGAN model unloaded, GPU memory freed")


def upscale_image(
    image: np.ndarray,
    scale: int = 2,
    outscale: Optional[float] = None
) -> np.ndarray:
    """Upscale an image using Real-ESRGAN.

    Args:
        image: Input image as numpy array (BGR format from OpenCV)
        scale: Model scale factor (2 or 4)
        outscale: Final output scale (if different from model scale)

    Returns:
        Upscaled image as numpy array (BGR format)
    """
    if scale not in (2, 4):
        raise ValueError(f"Scale must be 2 or 4, got {scale}")

    upscaler = _load_realesrgan(scale)

    # Real-ESRGAN expects BGR input (OpenCV format)
    output, _ = upscaler.enhance(image, outscale=outscale or scale)

    return output


def should_upscale(width: int, threshold: int = 1500) -> bool:
    """Determine if an image should be upscaled based on width.

    Args:
        width: Image width in pixels
        threshold: Width threshold below which upscaling is recommended

    Returns:
        True if image should be upscaled
    """
    return width < threshold
