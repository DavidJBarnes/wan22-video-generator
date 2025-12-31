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


# LoRA node IDs for dynamic creation (high pass: 118, 120; low pass: 119, 121)
LORA_NODE_IDS = {
    "high": ["118", "120"],  # First LoRA high, Second LoRA high
    "low": ["119", "121"],   # First LoRA low, Second LoRA low
}


def _sanitize_filename(name: str) -> str:
    """Convert a string to a filesystem-friendly format."""
    # Replace spaces with underscores, keep only alphanumeric, dash, underscore
    safe = "".join(c if c.isalnum() or c in ('-', '_') else '_' for c in name)
    # Collapse multiple underscores and strip
    while '__' in safe:
        safe = safe.replace('__', '_')
    return safe.strip('_')


def build_wan_i2v_workflow(
    prompt: str,
    negative_prompt: str = "",
    width: int = 640,
    height: int = 640,
    frames: int = 81,
    start_image_filename: str = "",
    high_noise_model: str = "wan2.2_i2v_high_noise_14B_fp16.safetensors",
    low_noise_model: str = "wan2.2_i2v_low_noise_14B_fp16.safetensors",
    seed: Optional[int] = None,
    loras: Optional[List[Dict[str, str]]] = None,
    fps: int = 16,
    output_prefix: str = "",
) -> Dict[str, Any]:
    """Build a Wan2.2 i2v workflow by injecting values into the pre-converted template.

    Args:
        prompt: Positive prompt describing the video
        negative_prompt: Negative prompt (things to avoid)
        width: Video width in pixels
        height: Video height in pixels
        frames: Number of frames to generate
        start_image_filename: Filename of the uploaded start image
        high_noise_model: UNET model for high noise pass
        low_noise_model: UNET model for low noise pass
        seed: Random seed (auto-generated if not provided)
        loras: Optional list of LoRA pairs (max 2). Each dict has:
               - high_file: LoRA filename for high noise pass
               - low_file: LoRA filename for low noise pass
               If empty/None, no user LoRAs are applied (only lightx2v acceleration)
        fps: Frames per second for output video (default 16)
        output_prefix: Filename prefix for output video (sanitized job name)

    Returns:
        ComfyUI API workflow dict ready to submit
    """
    # Deep copy the template so we don't modify the original
    workflow = copy.deepcopy(WAN_I2V_API_WORKFLOW)

    # Generate seed if not provided
    if seed is None:
        seed = random.randint(0, 2**32 - 1)

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

    # Set random seed (node 86 - KSamplerAdvanced for high noise pass)
    workflow["86"]["inputs"]["noise_seed"] = seed
    print(f"[Workflow] Set seed: {seed}")

    # Add user-selected LoRA nodes dynamically (0-2 pairs)
    # Chain: UNET -> LoRA1 -> LoRA2 -> lightx2v
    # If no LoRAs: UNET -> lightx2v (already wired in template)
    loras = loras or []
    loras = [l for l in loras if l.get("high_file") or l.get("low_file")]  # Filter empty

    if loras:
        print(f"[Workflow] Adding {len(loras)} user LoRA pair(s)")

        # Track last node IDs in the chain (start with UNET loaders)
        last_high_node = "95"  # UNET high
        last_low_node = "96"   # UNET low

        for i, lora in enumerate(loras[:2]):  # Max 2 pairs
            high_file = lora.get("high_file")
            low_file = lora.get("low_file")

            high_node_id = LORA_NODE_IDS["high"][i]
            low_node_id = LORA_NODE_IDS["low"][i]

            # Add high noise LoRA node
            if high_file:
                workflow[high_node_id] = {
                    "class_type": "LoraLoaderModelOnly",
                    "inputs": {
                        "lora_name": high_file,
                        "strength_model": 1.0,
                        "model": [last_high_node, 0]
                    },
                    "_meta": {"title": f"User LoRA {i+1} High"}
                }
                last_high_node = high_node_id
                print(f"[Workflow] Added LoRA {i+1} high: {high_file}")

            # Add low noise LoRA node
            if low_file:
                workflow[low_node_id] = {
                    "class_type": "LoraLoaderModelOnly",
                    "inputs": {
                        "lora_name": low_file,
                        "strength_model": 1.0,
                        "model": [last_low_node, 0]
                    },
                    "_meta": {"title": f"User LoRA {i+1} Low"}
                }
                last_low_node = low_node_id
                print(f"[Workflow] Added LoRA {i+1} low: {low_file}")

        # Rewire lightx2v nodes (101, 102) to take input from last user LoRA
        workflow["101"]["inputs"]["model"] = [last_high_node, 0]
        workflow["102"]["inputs"]["model"] = [last_low_node, 0]
        print(f"[Workflow] Rewired lightx2v: high from {last_high_node}, low from {last_low_node}")
    else:
        print("[Workflow] No user LoRAs selected (using only lightx2v acceleration)")

    # Override FPS (node 94 - CreateVideo)
    workflow["94"]["inputs"]["fps"] = fps
    print(f"[Workflow] Set FPS: {fps}")

    # Override output filename prefix (node 108 - SaveVideo)
    # Use sanitized job name instead of "video/ComfyUI" subdirectory
    if output_prefix:
        safe_prefix = _sanitize_filename(output_prefix)
        workflow["108"]["inputs"]["filename_prefix"] = safe_prefix
        print(f"[Workflow] Set output prefix: {safe_prefix}")
    else:
        # Default to ComfyUI (no subdirectory)
        workflow["108"]["inputs"]["filename_prefix"] = "ComfyUI"

    return workflow
