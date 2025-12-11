"""Configuration settings for the Wan2.2 Video Generator app."""

# ComfyUI Server Configuration
COMFYUI_SERVER_URL = "http://localhost:8188"

# Default Generation Parameters
DEFAULT_WIDTH = 512
DEFAULT_HEIGHT = 768
DEFAULT_FPS = 16
DEFAULT_FRAMES_PER_SEGMENT = 81  # 5 seconds at 16 FPS

# Model Names
# Note: Update these to match the models available on your ComfyUI server
# Common variants: fp16 (full precision) or fp8_scaled (quantized)
MODELS = {
    "high_noise": "wan2.2_i2v_high_noise_14B_fp16.safetensors",
    "low_noise": "wan2.2_i2v_low_noise_14B_fp16.safetensors",
    "vae": "wan_2.1_vae.safetensors",
    "text_encoder": "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
}

# LoRA Configuration (optional)
LORA_CONFIG = {
    "enabled": False,
    "high_noise_lora": "wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors",
    "low_noise_lora": "wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors",
    "strength": 1.0,
}

# Generation Parameters (Two-Pass Sampling)
GENERATION_PARAMS = {
    "first_pass": {
        "steps": 20,
        "cfg": 3.5,
        "sampler_name": "euler",
        "scheduler": "simple",
        "start_at_step": 0,
        "end_at_step": 10,
        "add_noise": "enable",
        "return_with_leftover_noise": "enable",
    },
    "second_pass": {
        "steps": 20,
        "cfg": 3.5,
        "sampler_name": "euler",
        "scheduler": "simple",
        "start_at_step": 10,
        "end_at_step": 10000,
        "add_noise": "disable",
        "return_with_leftover_noise": "disable",
    },
    "model_sampling_shift": 8.0,
}

# Negative Prompt (from reference workflow)
DEFAULT_NEGATIVE_PROMPT = (
    "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，"
    "JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，"
    "形态畸形的肢体，手指融合，静止不动的画面，悲乱的背景，三条腿，背景人很多，倒着走"
)

# Output Directories
OUTPUT_DIR = "output"
SEGMENTS_DIR = "output/segments"
FRAMES_DIR = "output/frames"

# Segment Duration Options (frames at 16 FPS)
SEGMENT_DURATIONS = {
    3: 49,   # 3 seconds
    4: 65,   # 4 seconds
    5: 81,   # 5 seconds
}

# Polling Configuration
POLL_INTERVAL_SECONDS = 2
MAX_POLL_ATTEMPTS = 600  # 20 minutes max wait time
