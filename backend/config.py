"""Configuration settings for the Wan2.2 Video Generator app."""

# ComfyUI Server Configuration
COMFYUI_SERVER_URL = "http://localhost:8188"

# Default Generation Parameters
DEFAULT_WIDTH = 512
DEFAULT_HEIGHT = 768
DEFAULT_TARGET_FPS = 30  # Output fps: 30 or 60 (uses RIFE 2x or 4x interpolation)
GENERATION_FPS = 15  # Internal: base fps before RIFE interpolation

# Model Configuration
# Note: Model settings are configured via the Settings page (stored in database)
# Required settings: high_noise_model, low_noise_model, vae_model, text_encoder
# Jobs will fail if these are not configured in Settings → ComfyUI Configuration

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
# Note: Actual output path is set via JOB_OUTPUT_PATH env var in video_utils.py

# Polling Configuration
POLL_INTERVAL_SECONDS = 2
MAX_POLL_ATTEMPTS = 600  # 20 minutes max wait time

# Image Slideshow Configuration
DEFAULT_SLIDESHOW_DELAY = 5  # seconds between images in random viewer
