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

    def get_system_stats(self) -> Dict[str, Any]:
        """Get detailed system stats from ComfyUI.

        Returns dict with:
        - connected: bool
        - error: optional error message
        - system: system info (devices, memory, etc.) if connected
        """
        try:
            response = self.client.get(f"{self.base_url}/system_stats", timeout=10.0)
            if response.status_code == 200:
                data = response.json()
                return {
                    "connected": True,
                    "system": data
                }
            return {
                "connected": False,
                "error": f"Unexpected status: {response.status_code}"
            }
        except httpx.ConnectError:
            return {
                "connected": False,
                "error": "Connection refused - is ComfyUI running?"
            }
        except httpx.TimeoutException:
            return {
                "connected": False,
                "error": "Connection timed out - ComfyUI may be overloaded"
            }
        except Exception as e:
            return {
                "connected": False,
                "error": str(e)
            }

    def health_check(self) -> Dict[str, Any]:
        """Perform a comprehensive health check before submitting work.

        Returns dict with:
        - healthy: bool - True if ComfyUI is ready to accept work
        - connected: bool - True if ComfyUI is reachable
        - queue_ready: bool - True if queue is not overloaded
        - details: dict with queue_running, queue_pending, system stats
        - error: optional error message if unhealthy
        """
        result = {
            "healthy": False,
            "connected": False,
            "queue_ready": False,
            "details": {},
            "error": None
        }

        # Check system stats (basic connectivity)
        stats = self.get_system_stats()
        result["connected"] = stats.get("connected", False)

        if not result["connected"]:
            result["error"] = stats.get("error", "ComfyUI not reachable")
            return result

        result["details"]["system"] = stats.get("system", {})

        # Check queue status
        queue_status = self.get_queue_status()
        if not queue_status.get("connected", False):
            result["error"] = queue_status.get("error", "Failed to get queue status")
            return result

        queue_running = len(queue_status.get("queue_running", []))
        queue_pending = len(queue_status.get("queue_pending", []))

        result["details"]["queue_running"] = queue_running
        result["details"]["queue_pending"] = queue_pending

        # Consider queue ready if not overloaded (configurable threshold)
        max_queue_size = 10  # Fail-safe if queue is way too backed up
        result["queue_ready"] = (queue_running + queue_pending) < max_queue_size

        if not result["queue_ready"]:
            result["error"] = f"Queue overloaded: {queue_running} running, {queue_pending} pending"
            return result

        result["healthy"] = True
        return result

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
        duration_sec: float = 5.0,
        target_fps: int = 30,
        start_image_filename: str = "",
        high_noise_model: str = "wan2.2_i2v_high_noise_14B_fp16.safetensors",
        low_noise_model: str = "wan2.2_i2v_low_noise_14B_fp16.safetensors",
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
    ) -> Dict[str, Any]:
        """Build a Wan2.2 i2v workflow using the pre-converted API template.

        Delegates to workflow_templates.build_wan_i2v_workflow which injects
        user values into the pre-converted workflow constant.

        Args:
            duration_sec: Video duration in seconds (default 5.0)
            target_fps: Output fps - 30 or 60 (uses RIFE 2x or 4x interpolation)
            loras: Optional list of LoRA pairs (max 3). Each dict has:
                   - high_file: LoRA filename for high noise pass
                   - low_file: LoRA filename for low noise pass
            faceswap_enabled: Whether to enable face swapping via FaceFusion
            faceswap_image: Filename of the face image to swap in
            faceswap_faces_order: Order to process faces (left-right, right-left, etc.)
            faceswap_faces_index: Which face indices to process (e.g., "0", "0,1")
            faceswap_model: Face swapper model (hyperswap_1c_256, inswapper_128_fp16, etc.)
            faceswap_occluder: Occlusion detection model (xseg_1, xseg_2, xseg_3)
            faceswap_mask_blur: Face mask blur amount (0.0-1.0)
            faceswap_region_mask: Enable region-specific masking
            faceswap_score_threshold: Face detection confidence threshold (0.0-1.0)
            faceswap_pixel_boost: Resolution for face processing (256x256 to 1024x1024)
            faceswap_selector_mode: Face selection mode (one, many, reference)
            faceswap_detector_model: Face detector model (scrfd, retinaface, yolo_face, yunet, many)
        """
        return _build_wan_i2v_workflow(
            prompt=prompt,
            negative_prompt=negative_prompt,
            width=width,
            height=height,
            duration_sec=duration_sec,
            target_fps=target_fps,
            start_image_filename=start_image_filename,
            high_noise_model=high_noise_model,
            low_noise_model=low_noise_model,
            seed=seed,
            loras=loras,
            output_prefix=output_prefix,
            faceswap_enabled=faceswap_enabled,
            faceswap_image=faceswap_image,
            faceswap_faces_order=faceswap_faces_order,
            faceswap_faces_index=faceswap_faces_index,
            faceswap_model=faceswap_model,
            faceswap_occluder=faceswap_occluder,
            faceswap_mask_blur=faceswap_mask_blur,
            faceswap_region_mask=faceswap_region_mask,
            faceswap_score_threshold=faceswap_score_threshold,
            faceswap_pixel_boost=faceswap_pixel_boost,
            faceswap_selector_mode=faceswap_selector_mode,
            faceswap_detector_model=faceswap_detector_model,
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
        duration_sec: float = 5.0,
        target_fps: int = 30,
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
                duration_sec=duration_sec,
                target_fps=target_fps,
                start_image_filename=input_image or "",
                high_noise_model=high_noise_model,
                low_noise_model=low_noise_model,
            )

        # Get base template for simple workflows
        if workflow_type not in WORKFLOW_TEMPLATES:
            workflow_type = "txt2img"

        workflow = copy.deepcopy(WORKFLOW_TEMPLATES[workflow_type])

        # Set seed (fallback - normally provided by job)
        if seed is None:
            from database import generate_seed
            seed = generate_seed()

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
        """Get the status of a queued prompt.

        Returns a dict with:
        - status: "pending", "running", "completed", "not_found", "error", or "unknown"
        - data: output data if completed
        - error: error message if error/unknown (includes "connect" for connection errors)
        """
        try:
            # First check history for completed prompts
            response = self.client.get(f"{self.base_url}/history/{prompt_id}")
            if response.status_code == 200:
                data = response.json()
                if prompt_id in data:
                    return {
                        "status": "completed",
                        "data": data[prompt_id]
                    }

            # Not in history - check if it's in the queue
            queue_response = self.client.get(f"{self.base_url}/queue")
            if queue_response.status_code == 200:
                queue_data = queue_response.json()
                # Check running queue
                for item in queue_data.get("queue_running", []):
                    if isinstance(item, list) and len(item) > 1 and item[1] == prompt_id:
                        return {"status": "running"}
                # Check pending queue
                for item in queue_data.get("queue_pending", []):
                    if isinstance(item, list) and len(item) > 1 and item[1] == prompt_id:
                        return {"status": "pending"}

            # Not in history and not in queue - prompt is gone/lost
            return {"status": "not_found", "error": "Prompt not in history or queue"}
        except httpx.ConnectError:
            return {"status": "error", "error": "Connection refused - is ComfyUI running?"}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def get_queue_status(self) -> Dict[str, Any]:
        """Get current queue status.

        Returns a dict with:
        - queue_running: list of running jobs
        - queue_pending: list of pending jobs
        - connected: bool indicating if ComfyUI is reachable
        - error: optional error message if not connected
        """
        try:
            response = self.client.get(f"{self.base_url}/queue")
            if response.status_code == 200:
                result = response.json()
                result["connected"] = True
                return result
            return {
                "queue_running": [],
                "queue_pending": [],
                "connected": False,
                "error": f"Unexpected status code: {response.status_code}"
            }
        except httpx.ConnectError:
            return {
                "queue_running": [],
                "queue_pending": [],
                "connected": False,
                "error": "Connection refused - is ComfyUI running?"
            }
        except Exception as e:
            return {
                "queue_running": [],
                "queue_pending": [],
                "connected": False,
                "error": str(e)
            }

    def extract_execution_time_from_data(self, data: Dict[str, Any]) -> Optional[float]:
        """Extract execution time from already-fetched ComfyUI completion data."""
        if not data:
            return None

        # ComfyUI stores execution info in different locations depending on version
        status_info = data.get("status", {})

        # Try to get execution time from status.messages
        messages = status_info.get("messages", [])
        execution_start = None
        execution_end = None

        for msg in messages:
            if isinstance(msg, list) and len(msg) >= 2:
                msg_type = msg[0]
                msg_data = msg[1] if isinstance(msg[1], dict) else {}

                if msg_type == "execution_start":
                    execution_start = msg_data.get("timestamp")
                elif msg_type in ("execution_success", "execution_cached"):
                    execution_end = msg_data.get("timestamp")

        if execution_start and execution_end:
            try:
                # ComfyUI timestamps are in milliseconds, convert to seconds
                return (float(execution_end) - float(execution_start)) / 1000.0
            except (TypeError, ValueError):
                pass

        # Try prompt_outputs timing
        prompt_outputs = data.get("prompt_outputs", {})
        for node_id, output in prompt_outputs.items():
            if isinstance(output, dict) and "execution_time" in output:
                return output["execution_time"]

        return None

    def get_execution_time(self, prompt_id: str) -> Optional[float]:
        """Get the total execution time in seconds for a completed prompt."""
        status = self.get_prompt_status(prompt_id)
        if status.get("status") != "completed":
            return None

        data = status.get("data") or {}
        return self.extract_execution_time_from_data(data)

    def extract_media_urls_from_data(self, data: Dict[str, Any]) -> List[str]:
        """Extract media URLs from ComfyUI completion data (already fetched)."""
        media_urls = []
        outputs = data.get("outputs", {})

        print(f"[ComfyUI] extract_media_urls: outputs keys = {list(outputs.keys())}")

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

    def check_prompt_completion(self, prompt_id: str) -> Dict[str, Any]:
        """Check if a prompt completed and return completion info.

        This is specifically designed for timeout recovery - it checks
        ComfyUI's history to see if the job actually finished.

        Returns:
            Dict with:
            - completed: bool - True if the prompt finished successfully
            - data: dict - Full completion data if completed
            - video_info: dict - Video output info (filename, subfolder, type) if available
            - error: str - Error message if there was a ComfyUI execution error
        """
        result = {
            "completed": False,
            "data": None,
            "video_info": None,
            "error": None
        }

        try:
            response = self.client.get(f"{self.base_url}/history/{prompt_id}", timeout=10.0)
            if response.status_code != 200:
                return result

            data = response.json()
            if prompt_id not in data:
                return result

            prompt_data = data[prompt_id]
            result["data"] = prompt_data

            # Check for execution errors
            status_info = prompt_data.get("status", {})
            if status_info.get("status_str") == "error":
                messages = status_info.get("messages", [])
                for msg in messages:
                    if isinstance(msg, list) and len(msg) >= 2 and msg[0] == "execution_error":
                        error_data = msg[1] if isinstance(msg[1], dict) else {}
                        result["error"] = f"{error_data.get('exception_type', 'Error')}: {error_data.get('exception_message', 'Unknown error')}"
                        return result

            # Look for video output
            outputs = prompt_data.get("outputs", {})
            for node_id, node_output in outputs.items():
                for media_key in ("videos", "gifs", "images"):
                    if media_key in node_output and node_output[media_key]:
                        for media in node_output[media_key]:
                            filename = media.get("filename", "")
                            if any(ext in filename.lower() for ext in ['.mp4', '.webm', '.gif']):
                                result["completed"] = True
                                result["video_info"] = {
                                    "filename": filename,
                                    "subfolder": media.get("subfolder", ""),
                                    "type": media.get("type", "output")
                                }
                                return result

            # If we have outputs but no video, still mark as completed
            if outputs:
                result["completed"] = True

        except httpx.ConnectError:
            pass  # Connection error - can't check
        except Exception as e:
            print(f"[ComfyUI] Error checking prompt completion: {e}")

        return result

    def close(self):
        """Close the HTTP client."""
        self.client.close()
