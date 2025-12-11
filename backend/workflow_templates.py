"""Pre-converted ComfyUI workflow templates in API format.

These workflows are converted from ComfyUI UI format (nodes + links) to API format
once and stored here. At runtime, we just inject user values into the appropriate nodes.
"""

import copy
import random
from typing import Dict, Any, Optional


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
            "model": ["118", 0]  # Takes model from High LoRA node
        }
    },
    "102": {
        "class_type": "LoraLoaderModelOnly",
        "inputs": {
            "lora_name": "wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors",
            "strength_model": 1.0,
            "model": ["119", 0]  # Takes model from Low LoRA node
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
    # User-selectable LoRA nodes (optional per segment)
    # Default to NSFW LoRAs if user doesn't select any
    "118": {
        "class_type": "LoraLoaderModelOnly",
        "inputs": {
            "lora_name": "wan2.2/NSFW-22-H-e8.safetensors",  # Default high noise LoRA
            "strength_model": 1.0,
            "model": ["95", 0]  # Takes model from UNET high noise loader
        },
        "_meta": {
            "title": "High Lora"
        }
    },
    "119": {
        "class_type": "LoraLoaderModelOnly",
        "inputs": {
            "lora_name": "wan2.2/NSFW-22-L-e8.safetensors",  # Default low noise LoRA
            "strength_model": 1.0,
            "model": ["96", 0]  # Takes model from UNET low noise loader
        },
        "_meta": {
            "title": "Low Lora"
        }
    },
}


# Default LoRA names (used when user doesn't select any)
DEFAULT_HIGH_LORA = "wan2.2/NSFW-22-H-e8.safetensors"
DEFAULT_LOW_LORA = "wan2.2/NSFW-22-L-e8.safetensors"


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
    high_lora: Optional[str] = None,
    low_lora: Optional[str] = None,
    fps: int = 16,
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
        high_lora: Optional LoRA for high noise path (None = use default)
        low_lora: Optional LoRA for low noise path (None = use default)
        fps: Frames per second for output video (default 16)

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
    
    # Override LoRA selections (nodes 118 and 119)
    # Use default LoRAs if user doesn't select any
    high_lora_name = high_lora if high_lora else DEFAULT_HIGH_LORA
    low_lora_name = low_lora if low_lora else DEFAULT_LOW_LORA
    
    workflow["118"]["inputs"]["lora_name"] = high_lora_name
    workflow["119"]["inputs"]["lora_name"] = low_lora_name
    print(f"[Workflow] Set high LoRA: {high_lora_name}")
    print(f"[Workflow] Set low LoRA: {low_lora_name}")

    # Override FPS (node 94 - CreateVideo)
    workflow["94"]["inputs"]["fps"] = fps
    print(f"[Workflow] Set FPS: {fps}")

    return workflow
