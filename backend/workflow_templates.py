"""Pre-converted ComfyUI workflow templates in API format.

These workflows are converted from ComfyUI UI format (nodes + links) to API format
once and stored here. At runtime, we just inject user values into the appropriate nodes.
"""

import copy
import random
from typing import Dict, Any, Optional, List


# Wan2.2 14B Image-to-Video workflow in ComfyUI API format
# Converted from video_wan2_2_14B_i2v.json
# 
# Key nodes to override:
# - "97" (LoadImage): image filename
# - "93" (CLIPTextEncode): positive prompt
# - "89" (CLIPTextEncode): negative prompt  
# - "98" (WanImageToVideo): width, height, length (frames)
# - "95" (UNETLoader): high noise model name
# - "96" (UNETLoader): low noise model name
# - "86" (KSamplerAdvanced): noise_seed for randomization
#
WAN_I2V_API_WORKFLOW = {
    "84": {
        "class_type": "CLIPLoader",
        "inputs": {
            "clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
            "type": "wan",
            "device": "default"
        }
    },
    "85": {
        "class_type": "KSamplerAdvanced",
        "inputs": {
            "add_noise": "disable",
            "noise_seed": 0,
            "control_after_generate": "fixed",
            "steps": 4,
            "cfg": 1,
            "sampler_name": "euler",
            "scheduler": "simple",
            "start_at_step": 2,
            "end_at_step": 4,
            "return_with_leftover_noise": "disable",
            "model": ["103", 0],
            "positive": ["98", 0],
            "negative": ["98", 1],
            "latent_image": ["86", 0]
        }
    },
    "86": {
        "class_type": "KSamplerAdvanced",
        "inputs": {
            "add_noise": "enable",
            "noise_seed": 138073435077572,
            "control_after_generate": "randomize",
            "steps": 4,
            "cfg": 1,
            "sampler_name": "euler",
            "scheduler": "simple",
            "start_at_step": 0,
            "end_at_step": 2,
            "return_with_leftover_noise": "enable",
            "model": ["104", 0],
            "positive": ["98", 0],
            "negative": ["98", 1],
            "latent_image": ["98", 2]
        }
    },
    "87": {
        "class_type": "VAEDecode",
        "inputs": {
            "samples": ["85", 0],
            "vae": ["90", 0]
        }
    },
    "89": {
        "class_type": "CLIPTextEncode",
        "inputs": {
            "text": "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走",
            "clip": ["84", 0]
        }
    },
    "90": {
        "class_type": "VAELoader",
        "inputs": {
            "vae_name": "wan_2.1_vae.safetensors"
        }
    },
    "93": {
        "class_type": "CLIPTextEncode",
        "inputs": {
            "text": "The white dragon warrior stands still, eyes full of determination and strength. The camera slowly moves closer or circles around the warrior, highlighting the powerful presence and heroic spirit of the character.",
            "clip": ["84", 0]
        }
    },
    "94": {
        "class_type": "CreateVideo",
        "inputs": {
            "fps": 16,
            "images": ["87", 0]
        }
    },
    "95": {
        "class_type": "UNETLoader",
        "inputs": {
            "unet_name": "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors",
            "weight_dtype": "default"
        }
    },
    "96": {
        "class_type": "UNETLoader",
        "inputs": {
            "unet_name": "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors",
            "weight_dtype": "default"
        }
    },
    "97": {
        "class_type": "LoadImage",
        "inputs": {
            "image": "input-18.jpg",
            "upload": "image"
        }
    },
    "98": {
        "class_type": "WanImageToVideo",
        "inputs": {
            "width": 640,
            "height": 640,
            "length": 81,
            "batch_size": 1,
            "positive": ["93", 0],
            "negative": ["89", 0],
            "vae": ["90", 0],
            "start_image": ["97", 0]
        }
    },
    "101": {
        "class_type": "LoraLoaderModelOnly",
        "inputs": {
            "lora_name": "wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors",
            "strength_model": 1.0,
            "model": ["95", 0]  # Default: takes model from UNET high (rewired if LoRAs added)
        }
    },
    "102": {
        "class_type": "LoraLoaderModelOnly",
        "inputs": {
            "lora_name": "wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors",
            "strength_model": 1.0,
            "model": ["96", 0]  # Default: takes model from UNET low (rewired if LoRAs added)
        }
    },
    "103": {
        "class_type": "ModelSamplingSD3",
        "inputs": {
            "shift": 5.0,
            "model": ["102", 0]
        }
    },
    "104": {
        "class_type": "ModelSamplingSD3",
        "inputs": {
            "shift": 5.0,
            "model": ["101", 0]
        }
    },
    "108": {
        "class_type": "SaveVideo",
        "inputs": {
            "filename_prefix": "video/ComfyUI",
            "format": "auto",
            "codec": "auto",
            "video": ["94", 0]
        }
    },
    # NOTE: User-selectable LoRA nodes (118, 119, 120, 121) are added dynamically
    # by build_wan_i2v_workflow() based on user's LoRA selections (0-2 pairs)
}


# LoRA node IDs for dynamic creation (high pass: 118, 120, 122; low pass: 119, 121, 123)
LORA_NODE_IDS = {
    "high": ["118", "120", "122"],  # First, Second, Third LoRA high
    "low": ["119", "121", "123"],   # First, Second, Third LoRA low
}


def _sanitize_filename(name: str) -> str:
    """Convert a string to a filesystem-friendly format."""
    # Replace spaces with underscores, keep only alphanumeric, dash, underscore
    safe = "".join(c if c.isalnum() or c in ('-', '_') else '_' for c in name)
    # Collapse multiple underscores and strip
    while '__' in safe:
        safe = safe.replace('__', '_')
    return safe.strip('_')


# Generation FPS is fixed at 15fps - RIFE interpolation brings it to target fps
GENERATION_FPS = 15


def calculate_generation_params(target_fps: int, duration_sec: float) -> Dict[str, Any]:
    """Calculate internal generation parameters from user-facing target fps.

    Args:
        target_fps: User-selected output fps (30, 60, or 90)
        duration_sec: Video duration in seconds

    Returns:
        Dict with:
        - generation_fps: Base fps before interpolation (always 15)
        - wan_frames: Number of frames for WanImageToVideo node
        - rife_multiplier: RIFE interpolation factor (2 for 30fps, 4 for 60fps, 6 for 90fps)
        - output_fps: Final output fps (same as target_fps)
    """
    # Calculate RIFE multiplier to reach target fps from 15fps base
    rife_multiplier = target_fps // GENERATION_FPS  # 30/15=2, 60/15=4

    # Calculate frames for Wan generation (at 15fps)
    wan_frames = int(duration_sec * GENERATION_FPS) + 1

    return {
        "generation_fps": GENERATION_FPS,
        "wan_frames": wan_frames,
        "rife_multiplier": rife_multiplier,
        "output_fps": target_fps,
    }


def build_wan_i2v_workflow(
    prompt: str,
    negative_prompt: str = "",
    width: int = 640,
    height: int = 640,
    duration_sec: float = 5.0,
    target_fps: int = 30,
    start_image_filename: str = "",
    high_noise_model: str = "",
    low_noise_model: str = "",
    vae_model: str = "",
    text_encoder: str = "",
    seed: Optional[int] = None,
    loras: Optional[List[Dict[str, str]]] = None,
    output_prefix: str = "",
    faceswap_enabled: bool = False,
    faceswap_image: str = "",
    faceswap_faces_order: str = "left-right",
    faceswap_faces_index: str = "0",
    faceswap_model: str = "inswapper_128",
    faceswap_occluder: str = "xseg_1",
    faceswap_mask_blur: float = 0.3,
    faceswap_region_mask: bool = False,
    faceswap_score_threshold: float = 0.5,
    faceswap_pixel_boost: str = "512x512",
    faceswap_selector_mode: str = "reference",
    faceswap_detector_model: str = "retinaface",
    faceswap_reference_distance: float = 0.8,
) -> Dict[str, Any]:
    """Build a Wan2.2 i2v workflow by injecting values into the pre-converted template.

    Args:
        prompt: Positive prompt describing the video
        negative_prompt: Negative prompt (things to avoid)
        width: Video width in pixels
        height: Video height in pixels
        duration_sec: Video duration in seconds (default 5.0)
        target_fps: Output fps - 30, 60, or 90 (uses RIFE 2x, 4x, or 6x interpolation)
        start_image_filename: Filename of the uploaded start image
        high_noise_model: UNET model for high noise pass (required)
        low_noise_model: UNET model for low noise pass (required)
        vae_model: VAE model filename (required)
        text_encoder: Text encoder/CLIP model filename (required)
        seed: Random seed (auto-generated if not provided)
        loras: Optional list of LoRA pairs (max 3). Each dict has:
               - high_file: LoRA filename for high noise pass
               - low_file: LoRA filename for low noise pass
               If empty/None, no user LoRAs are applied (only lightx2v acceleration)
        output_prefix: Filename prefix for output video (sanitized job name)
        faceswap_enabled: Whether to enable face swapping via FaceFusion
        faceswap_image: Filename of the face image to swap in (in ComfyUI input folder)
        faceswap_pixel_boost: Resolution for face processing (256x256 to 1024x1024, higher = better quality but slower)

    Returns:
        ComfyUI API workflow dict ready to submit
    """
    # Calculate generation parameters from target fps
    gen_params = calculate_generation_params(target_fps, duration_sec)
    frames = gen_params["wan_frames"]
    generation_fps = gen_params["generation_fps"]
    rife_multiplier = gen_params["rife_multiplier"]
    output_fps = gen_params["output_fps"]
    print(f"[Workflow] Target {target_fps}fps: generating {frames} frames @ {generation_fps}fps, RIFE {rife_multiplier}x → {output_fps}fps")
    # Deep copy the template so we don't modify the original
    workflow = copy.deepcopy(WAN_I2V_API_WORKFLOW)

    # Generate seed if not provided (fallback - normally provided by job)
    if seed is None:
        from database import generate_seed
        seed = generate_seed()

    # Override start image filename (node 97 - LoadImage)
    workflow["97"]["inputs"]["image"] = start_image_filename
    print(f"[Workflow] Set LoadImage to: {start_image_filename}")

    # Override positive prompt (node 93 - CLIPTextEncode)
    workflow["93"]["inputs"]["text"] = prompt
    print(f"[Workflow] Set positive prompt: {prompt[:50]}...")

    # Override negative prompt (node 89 - CLIPTextEncode)
    if negative_prompt:
        workflow["89"]["inputs"]["text"] = negative_prompt
        print(f"[Workflow] Set negative prompt: {negative_prompt[:50]}...")

    # Override video dimensions and frames (node 98 - WanImageToVideo)
    workflow["98"]["inputs"]["width"] = width
    workflow["98"]["inputs"]["height"] = height
    workflow["98"]["inputs"]["length"] = frames
    print(f"[Workflow] Set WanImageToVideo: {width}x{height}, {frames} frames")

    # Override UNET model names (nodes 95 and 96)
    workflow["95"]["inputs"]["unet_name"] = high_noise_model
    workflow["96"]["inputs"]["unet_name"] = low_noise_model
    print(f"[Workflow] Set high noise model: {high_noise_model}")
    print(f"[Workflow] Set low noise model: {low_noise_model}")

    # Override VAE model (node 90)
    if vae_model:
        workflow["90"]["inputs"]["vae_name"] = vae_model
        print(f"[Workflow] Set VAE model: {vae_model}")

    # Override text encoder (node 84)
    if text_encoder:
        workflow["84"]["inputs"]["clip_name"] = text_encoder
        print(f"[Workflow] Set text encoder: {text_encoder}")

    # Set random seed (node 86 - KSamplerAdvanced for high noise pass)
    workflow["86"]["inputs"]["noise_seed"] = seed
    print(f"[Workflow] Set seed: {seed}")

    # Add user-selected LoRA nodes dynamically (0-3 pairs)
    # Chain: UNET -> LoRA1 -> LoRA2 -> LoRA3 -> lightx2v
    # If no LoRAs: UNET -> lightx2v (already wired in template)
    # Each lora dict can have: high_file, high_weight, low_file, low_weight
    loras = loras or []
    loras = [l for l in loras if l.get("high_file") or l.get("low_file")]  # Filter empty

    if loras:
        print(f"[Workflow] Adding {len(loras)} user LoRA pair(s)")

        # Track last node IDs in the chain (start with UNET loaders)
        last_high_node = "95"  # UNET high
        last_low_node = "96"   # UNET low

        for i, lora in enumerate(loras[:3]):  # Max 3 pairs
            high_file = lora.get("high_file")
            high_weight = float(lora.get("high_weight", 1.0))
            low_file = lora.get("low_file")
            low_weight = float(lora.get("low_weight", 1.0))

            high_node_id = LORA_NODE_IDS["high"][i]
            low_node_id = LORA_NODE_IDS["low"][i]

            # Add high noise LoRA node
            if high_file:
                workflow[high_node_id] = {
                    "class_type": "LoraLoaderModelOnly",
                    "inputs": {
                        "lora_name": high_file,
                        "strength_model": high_weight,
                        "model": [last_high_node, 0]
                    },
                    "_meta": {"title": f"User LoRA {i+1} High"}
                }
                last_high_node = high_node_id
                print(f"[Workflow] Added LoRA {i+1} high: {high_file} (weight={high_weight})")

            # Add low noise LoRA node
            if low_file:
                workflow[low_node_id] = {
                    "class_type": "LoraLoaderModelOnly",
                    "inputs": {
                        "lora_name": low_file,
                        "strength_model": low_weight,
                        "model": [last_low_node, 0]
                    },
                    "_meta": {"title": f"User LoRA {i+1} Low"}
                }
                last_low_node = low_node_id
                print(f"[Workflow] Added LoRA {i+1} low: {low_file} (weight={low_weight})")

        # Rewire lightx2v nodes (101, 102) to take input from last user LoRA
        workflow["101"]["inputs"]["model"] = [last_high_node, 0]
        workflow["102"]["inputs"]["model"] = [last_low_node, 0]
        print(f"[Workflow] Rewired lightx2v: high from {last_high_node}, low from {last_low_node}")
    else:
        print("[Workflow] No user LoRAs selected (using only lightx2v acceleration)")

    # Note: FPS for the base CreateVideo node is set to generation_fps
    # This may be overwritten below when RIFE is added (which uses VHS_VideoCombine instead)
    workflow["94"]["inputs"]["fps"] = generation_fps
    print(f"[Workflow] Set base FPS: {generation_fps}")

    # Override output filename prefix
    safe_prefix = _sanitize_filename(output_prefix) if output_prefix else "ComfyUI"

    # Handle faceswap or standard output
    if faceswap_enabled:
        print(f"[Workflow] Faceswap enabled with image: {faceswap_image}")

        # Remove standard video nodes (we'll use VHS_VideoCombine instead)
        del workflow["94"]   # CreateVideo
        del workflow["108"]  # SaveVideo

        # Add LoadImage node for face swap source (node 188)
        workflow["188"] = {
            "class_type": "LoadImage",
            "inputs": {
                "image": faceswap_image
            },
            "_meta": {"title": "Face Swap Source"}
        }

        # Add FaceFusion AdvancedSwapFaceImage node (node 183)
        # Replaces ReActor - has built-in occlusion detection for hands, tongue, etc.
        # Processes video frames as a batch internally
        facefusion_inputs = {
            "source_images": ["188", 0],       # Face to swap in
            "target_image": ["87", 0],         # Decoded video frames from VAEDecode
            "api_token": "-1",                 # Local mode, no API
            "face_swapper_model": faceswap_model,       # Configurable model
            "face_detector_model": faceswap_detector_model,  # Configurable detector
            "pixel_boost": faceswap_pixel_boost,  # Resolution for face processing
            "face_occluder_model": faceswap_occluder,   # Configurable occlusion model
            "face_parser_model": "bisenet_resnet_34",   # Face parsing for regions
            "face_mask_blur": faceswap_mask_blur,       # Configurable blur
            "face_selector_mode": faceswap_selector_mode,  # Configurable: one, many, reference
            "face_position": int(faceswap_faces_index),  # Which face to swap (0-indexed)
            "sort_order": faceswap_faces_order.replace("-", "-"),  # Face sorting order
            "score_threshold": faceswap_score_threshold,  # Configurable detection confidence
            "use_box_mask": True,              # Use rectangular mask
            "use_occlusion_mask": True,        # ENABLE OCCLUSION DETECTION
            "use_area_mask": False,            # Don't use area mask
            "use_region_mask": faceswap_region_mask,    # Configurable region mask
            "face_mask_areas": "upper-face,lower-face,mouth",
            "face_mask_regions": "skin,nose,mouth,upper-lip,lower-lip",
            "face_mask_padding": "0,0,0,0"     # No padding
        }

        # In reference mode, use the source face image as the reference for tracking
        if faceswap_selector_mode == "reference":
            facefusion_inputs["reference_image"] = ["188", 0]  # Same as source
            facefusion_inputs["reference_face_distance"] = faceswap_reference_distance

        workflow["183"] = {
            "class_type": "AdvancedSwapFaceImage",
            "inputs": facefusion_inputs,
            "_meta": {"title": "FaceFusion Face Swap"}
        }

        # Add VHS_VideoCombine node (node 186)
        # Combines face-swapped frames into video (fps updated below with RIFE)
        workflow["186"] = {
            "class_type": "VHS_VideoCombine",
            "inputs": {
                "frame_rate": output_fps,  # Will be target fps after RIFE
                "loop_count": 0,
                "filename_prefix": safe_prefix,
                "format": "video/h264-mp4",
                "pix_fmt": "yuv420p",
                "crf": 15,
                "save_metadata": True,
                "trim_to_audio": False,
                "pingpong": False,
                "save_output": True,
                "images": ["183", 0]  # Face-swapped frames from FaceFusion (rewired below for RIFE)
            },
            "_meta": {"title": "Video Combine (Faceswap)"}
        }

        print(f"[Workflow] Added faceswap nodes: 188 (LoadImage), 183 (FaceFusion), 186 (VHS_VideoCombine)")
        print(f"[Workflow] FaceFusion: {faceswap_model}, detector={faceswap_detector_model}, mode={faceswap_selector_mode}")
        print(f"[Workflow] FaceFusion: {faceswap_occluder} occlusion, pixel_boost={faceswap_pixel_boost}")
        print(f"[Workflow] Removed node 108 (SaveVideo)")

    # Always add RIFE frame interpolation (required for both 30fps and 60fps output)
    print(f"[Workflow] Adding RIFE {rife_multiplier}x frame interpolation")

    # Add RIFE VFI node (node 200)
    workflow["200"] = {
        "class_type": "RIFE VFI",
        "inputs": {
            "ckpt_name": "rife49.pth",  # rife49 has better quality, less VRAM than rife47
            "clear_cache_after_n_frames": 10,  # Clear frequently to reduce system RAM usage
            "multiplier": rife_multiplier,  # 2 for 30fps, 4 for 60fps
            "fast_mode": True,  # Ignored in v4.5+ but kept for compatibility
            "ensemble": True,
            "scale_factor": 1,
            # frames input will be wired below
        },
        "_meta": {"title": f"RIFE {rife_multiplier}x Interpolation"}
    }

    if faceswap_enabled:
        # With faceswap: 183 (FaceFusion) → 200 (RIFE) → 186 (VHS_VideoCombine)
        workflow["200"]["inputs"]["frames"] = ["183", 0]
        workflow["186"]["inputs"]["images"] = ["200", 0]
        workflow["186"]["inputs"]["frame_rate"] = output_fps
        print(f"[Workflow] RIFE wired: FaceFusion(183) → RIFE(200) → VHS_VideoCombine(186) @ {output_fps}fps ({rife_multiplier}x interpolated)")
    else:
        # Without faceswap: use VHS_VideoCombine instead of CreateVideo+SaveVideo
        # Remove CreateVideo and SaveVideo nodes
        del workflow["94"]
        del workflow["108"]

        # Add VHS_VideoCombine node (node 186)
        workflow["186"] = {
            "class_type": "VHS_VideoCombine",
            "inputs": {
                "frame_rate": output_fps,
                "loop_count": 0,
                "filename_prefix": safe_prefix,
                "format": "video/h264-mp4",
                "pix_fmt": "yuv420p",
                "crf": 15,
                "save_metadata": True,
                "trim_to_audio": False,
                "pingpong": False,
                "save_output": True,
                "images": ["200", 0]  # From RIFE output
            },
            "_meta": {"title": "Video Combine (RIFE)"}
        }

        # Wire: VAEDecode(87) → RIFE(200) → VHS_VideoCombine(186)
        workflow["200"]["inputs"]["frames"] = ["87", 0]
        print(f"[Workflow] RIFE wired: VAEDecode(87) → RIFE(200) → VHS_VideoCombine(186) @ {output_fps}fps ({rife_multiplier}x interpolated)")

    return workflow
