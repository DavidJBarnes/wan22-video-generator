"""ComfyUI API client for workflow submission and monitoring."""

import httpx
import json
import uuid
import base64
from typing import Optional, Dict, Any, List, Tuple
from pathlib import Path

# Import the pre-converted workflow builder
from workflow_templates import build_wan_i2v_workflow as _build_wan_i2v_workflow

# Default workflow templates
WORKFLOW_TEMPLATES = {
    "txt2img": {
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "cfg": 7,
                "denoise": 1,
                "latent_image": ["5", 0],
                "model": ["4", 0],
                "negative": ["7", 0],
                "positive": ["6", 0],
                "sampler_name": "euler",
                "scheduler": "normal",
                "seed": 0,
                "steps": 20
            }
        },
        "4": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {
                "ckpt_name": "v1-5-pruned.safetensors"
            }
        },
        "5": {
            "class_type": "EmptyLatentImage",
            "inputs": {
                "batch_size": 1,
                "height": 512,
                "width": 512
            }
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "clip": ["4", 1],
                "text": ""
            }
        },
        "7": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "clip": ["4", 1],
                "text": ""
            }
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["3", 0],
                "vae": ["4", 2]
            }
        },
        "9": {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": "ComfyUI",
                "images": ["8", 0]
            }
        }
    },
    "img2img": {
        "1": {
            "class_type": "LoadImage",
            "inputs": {
                "image": ""
            }
        },
        "2": {
            "class_type": "VAEEncode",
            "inputs": {
                "pixels": ["1", 0],
                "vae": ["4", 2]
            }
        },
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "cfg": 7,
                "denoise": 0.75,
                "latent_image": ["2", 0],
                "model": ["4", 0],
                "negative": ["7", 0],
                "positive": ["6", 0],
                "sampler_name": "euler",
                "scheduler": "normal",
                "seed": 0,
                "steps": 20
            }
        },
        "4": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {
                "ckpt_name": "v1-5-pruned.safetensors"
            }
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "clip": ["4", 1],
                "text": ""
            }
        },
        "7": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "clip": ["4", 1],
                "text": ""
            }
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["3", 0],
                "vae": ["4", 2]
            }
        },
        "9": {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": "ComfyUI",
                "images": ["8", 0]
            }
        }
    }
}


class ComfyUIClient:
    """Client for interacting with ComfyUI API."""

    def __init__(self, base_url: str = "http://127.0.0.1:8188"):
        self.base_url = base_url.rstrip("/")
        self.client = httpx.Client(timeout=30.0)

    def check_connection(self) -> Tuple[bool, str]:
        """Check if ComfyUI is reachable."""
        try:
            response = self.client.get(f"{self.base_url}/system_stats")
            if response.status_code == 200:
                return True, "Connected"
            return False, f"Unexpected status: {response.status_code}"
        except httpx.ConnectError:
            return False, "Connection refused - is ComfyUI running?"
        except Exception as e:
            return False, str(e)

    def get_checkpoints(self) -> List[str]:
        """Get list of available checkpoint models."""
        try:
            response = self.client.get(f"{self.base_url}/object_info/CheckpointLoaderSimple")
            if response.status_code == 200:
                data = response.json()
                return data.get("CheckpointLoaderSimple", {}).get("input", {}).get("required", {}).get("ckpt_name", [[]])[0]
            return []
        except Exception:
            return []

    def get_samplers(self) -> List[str]:
        """Get list of available samplers."""
        try:
            response = self.client.get(f"{self.base_url}/object_info/KSampler")
            if response.status_code == 200:
                data = response.json()
                return data.get("KSampler", {}).get("input", {}).get("required", {}).get("sampler_name", [[]])[0]
            return ["euler", "euler_ancestral", "heun", "dpm_2", "dpm_2_ancestral",
                    "lms", "dpm_fast", "dpm_adaptive", "dpmpp_2s_ancestral",
                    "dpmpp_sde", "dpmpp_2m", "ddim", "uni_pc"]
        except Exception:
            return ["euler", "euler_ancestral", "heun", "dpm_2", "ddim"]

    def get_schedulers(self) -> List[str]:
        """Get list of available schedulers."""
        try:
            response = self.client.get(f"{self.base_url}/object_info/KSampler")
            if response.status_code == 200:
                data = response.json()
                return data.get("KSampler", {}).get("input", {}).get("required", {}).get("scheduler", [[]])[0]
            return ["normal", "karras", "exponential", "sgm_uniform", "simple", "ddim_uniform"]
        except Exception:
            return ["normal", "karras", "exponential", "simple"]

    def get_loras(self) -> List[str]:
        """Get list of available LoRA models from ComfyUI.

        Only returns LoRAs in the wan2.2/ subdirectory.
        """
        try:
            response = self.client.get(f"{self.base_url}/models/loras")
            if response.status_code == 200:
                loras = response.json()
                if isinstance(loras, list):
                    # Filter to only wan2.2 LoRAs
                    wan_loras = [l for l in loras if l.startswith("wan2.2/")]
                    return sorted(wan_loras)
            return []
        except Exception as e:
            print(f"[ComfyUI] Error fetching LoRAs: {e}")
            return []

    def upload_image(self, image_data: bytes, filename: str) -> Optional[str]:
        """Upload an image to ComfyUI and return the filename."""
        try:
            files = {
                "image": (filename, image_data, "image/png")
            }
            response = self.client.post(
                f"{self.base_url}/upload/image",
                files=files
            )
            if response.status_code == 200:
                data = response.json()
                return data.get("name")
            return None
        except Exception as e:
            print(f"Image upload error: {e}")
            return None

    def build_wan_i2v_workflow(
        self,
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
        """Build a Wan2.2 i2v workflow using the pre-converted API template.

        Delegates to workflow_templates.build_wan_i2v_workflow which injects
        user values into the pre-converted workflow constant.
        """
        return _build_wan_i2v_workflow(
            prompt=prompt,
            negative_prompt=negative_prompt,
            width=width,
            height=height,
            frames=frames,
            start_image_filename=start_image_filename,
            high_noise_model=high_noise_model,
            low_noise_model=low_noise_model,
            seed=seed,
            high_lora=high_lora,
            low_lora=low_lora,
            fps=fps,
        )

    def build_workflow(
        self,
        workflow_type: str,
        prompt: str,
        negative_prompt: str = "",
        checkpoint: str = "v1-5-pruned.safetensors",
        steps: int = 20,
        cfg: float = 7.0,
        sampler: str = "euler",
        scheduler: str = "normal",
        width: int = 512,
        height: int = 512,
        seed: Optional[int] = None,
        denoise: float = 0.75,
        input_image: Optional[str] = None,
        frames: int = 81,
        high_noise_model: str = "wan2.2_i2v_high_noise_14B_fp16.safetensors",
        low_noise_model: str = "wan2.2_i2v_low_noise_14B_fp16.safetensors",
    ) -> Dict[str, Any]:
        """Build a workflow from template with given parameters."""
        import copy
        import random

        # Use Wan2.2 i2v workflow for video generation
        if workflow_type in ("i2v", "wan_i2v", "wan_video"):
            print(f"[Workflow] Building Wan2.2 i2v workflow")
            return self.build_wan_i2v_workflow(
                prompt=prompt,
                negative_prompt=negative_prompt,
                width=width,
                height=height,
                frames=frames,
                start_image_filename=input_image or "",
                high_noise_model=high_noise_model,
                low_noise_model=low_noise_model,
            )

        # Get base template for simple workflows
        if workflow_type not in WORKFLOW_TEMPLATES:
            workflow_type = "txt2img"

        workflow = copy.deepcopy(WORKFLOW_TEMPLATES[workflow_type])

        # Set seed
        if seed is None:
            seed = random.randint(0, 2**32 - 1)

        # Update common parameters
        if "3" in workflow:  # KSampler node
            workflow["3"]["inputs"]["seed"] = seed
            workflow["3"]["inputs"]["steps"] = steps
            workflow["3"]["inputs"]["cfg"] = cfg
            workflow["3"]["inputs"]["sampler_name"] = sampler
            workflow["3"]["inputs"]["scheduler"] = scheduler
            if workflow_type == "img2img":
                workflow["3"]["inputs"]["denoise"] = denoise

        if "4" in workflow:  # Checkpoint loader
            workflow["4"]["inputs"]["ckpt_name"] = checkpoint

        if "5" in workflow:  # Empty latent (txt2img)
            workflow["5"]["inputs"]["width"] = width
            workflow["5"]["inputs"]["height"] = height

        if "6" in workflow:  # Positive prompt
            workflow["6"]["inputs"]["text"] = prompt

        if "7" in workflow:  # Negative prompt
            workflow["7"]["inputs"]["text"] = negative_prompt

        # img2img specific
        if workflow_type == "img2img" and input_image and "1" in workflow:
            workflow["1"]["inputs"]["image"] = input_image

        return workflow

    def queue_prompt(self, workflow: Dict[str, Any]) -> Tuple[bool, str]:
        """Submit a workflow to ComfyUI queue."""
        try:
            client_id = str(uuid.uuid4())
            payload = {
                "prompt": workflow,
                "client_id": client_id
            }

            response = self.client.post(
                f"{self.base_url}/prompt",
                json=payload
            )

            if response.status_code == 200:
                data = response.json()
                prompt_id = data.get("prompt_id")
                if prompt_id:
                    return True, prompt_id
                return False, "No prompt_id in response"
            else:
                if response.headers.get("content-type", "").startswith("application/json"):
                    error_data = response.json()
                    # Log full error for debugging including node_errors
                    print(f"[ComfyUI] queue_prompt error: {json.dumps(error_data, indent=2, ensure_ascii=False)}")
                    
                    # Extract detailed node errors if available
                    node_errors = error_data.get("node_errors", {})
                    if node_errors:
                        for node_id, node_error in node_errors.items():
                            class_type = node_error.get("class_type", "unknown")
                            errors = node_error.get("errors", [])
                            print(f"[ComfyUI] Node {node_id} ({class_type}) errors: {errors}")
                    
                    error_msg = error_data.get("error", {}).get("message", response.text)
                    return False, f"Error: {error_msg}"
                else:
                    return False, response.text
        except Exception as e:
            return False, str(e)

    def get_prompt_status(self, prompt_id: str) -> Dict[str, Any]:
        """Get the status of a queued prompt."""
        try:
            response = self.client.get(f"{self.base_url}/history/{prompt_id}")
            if response.status_code == 200:
                data = response.json()
                if prompt_id in data:
                    return {
                        "status": "completed",
                        "data": data[prompt_id]
                    }
                return {"status": "pending"}
            return {"status": "unknown", "error": f"Status code: {response.status_code}"}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def get_queue_status(self) -> Dict[str, Any]:
        """Get current queue status."""
        try:
            response = self.client.get(f"{self.base_url}/queue")
            if response.status_code == 200:
                return response.json()
            return {"queue_running": [], "queue_pending": []}
        except Exception:
            return {"queue_running": [], "queue_pending": []}

    def get_execution_time(self, prompt_id: str) -> Optional[float]:
        """Get the total execution time in seconds for a completed prompt."""
        status = self.get_prompt_status(prompt_id)
        if status.get("status") != "completed":
            return None
        
        data = status.get("data") or {}
        
        # ComfyUI stores execution time in status.execution_time or status.execution_cached
        # The structure varies by version, so we check multiple locations
        status_info = data.get("status", {})
        
        # Try to get execution time from status
        exec_time = status_info.get("execution_time")
        if exec_time is not None:
            return float(exec_time)
        
        # Alternative: calculate from prompt timestamps if available
        prompt_info = data.get("prompt", [])
        if len(prompt_info) >= 2:
            # prompt_info[0] is the prompt number, prompt_info[1] is the prompt_id
            # Some versions include timestamps
            pass
        
        return None

    def get_output_images(self, prompt_id: str) -> List[str]:
        """Get output media URLs (images, videos, gifs) for a completed prompt."""
        status = self.get_prompt_status(prompt_id)
        if status.get("status") != "completed":
            return []

        media_urls = []
        
        # Handle both possible response structures
        data = status.get("data") or status
        outputs = data.get("outputs", {})
        
        print(f"[ComfyUI] get_output_images: outputs keys = {list(outputs.keys())}")

        for node_id, node_output in outputs.items():
            # Check for images, videos, and gifs (different node types use different keys)
            for media_key in ("images", "videos", "gifs"):
                if media_key in node_output:
                    print(f"[ComfyUI] Found {media_key} in node {node_id}: {len(node_output[media_key])} items")
                    for media in node_output[media_key]:
                        filename = media.get("filename")
                        subfolder = media.get("subfolder", "")
                        media_type = media.get("type", "output")
                        if filename:
                            url = f"{self.base_url}/view?filename={filename}&subfolder={subfolder}&type={media_type}"
                            media_urls.append(url)
                            print(f"[ComfyUI] Added media URL: {url}")

        return media_urls

    def close(self):
        """Close the HTTP client."""
        self.client.close()
