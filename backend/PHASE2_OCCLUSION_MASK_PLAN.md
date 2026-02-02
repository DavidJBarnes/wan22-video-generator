# Phase 2: OcclusionMask Integration Plan

## Problem Statement

ReActorMaskHelper is **incompatible with video workflows** because SAM (Segment Anything Model) doesn't support batch processing. When processing video frames (4D tensor), it fails with:
```
ValueError: pic should be 2/3 dimensional. Got 4 dimensions.
```

## Proposed Solution: OcclusionMask Node

[OcclusionMask](https://github.com/ialhabbal/OcclusionMask) is a ComfyUI node that:
- **Supports batch processing** of images
- Uses ONNX models (faster than SAM)
- Provides three mask types: Occluder, XSeg, Object-only
- Returns both original image and mask

## Installation (on 3090.zero)

```bash
cd ~/StabilityMatrix-linux-x64/Data/Packages/ComfyUI/custom_nodes
git clone https://github.com/ialhabbal/OcclusionMask
cd OcclusionMask
# Install requirements (many already present from ReActor)
pip install -r requirements.txt
# Restart ComfyUI to load the new node
```

Models (`occluder.onnx`, `XSeg_model.onnx`) are included in the repository.

## Proposed Workflow

### Current Pipeline (no occlusion handling)
```
VAEDecode(87) → ReActorFaceSwapOpt(183) → RIFE(200) → VHS_VideoCombine(186)
```

### New Pipeline (with occlusion masking)
```
VAEDecode(87) ─┬─→ OcclusionMask(191) ─→ mask output ─┐
               │                                       │
               └─→ ReActorFaceSwapOpt(183) ───────────┼─→ ImageCompositeMasked(192) → RIFE(200) → VHS_VideoCombine(186)
                                                       │
               └───────────────────────────────────────┘
                        (original frames for compositing)
```

### Logic
1. **OcclusionMask (191)**: Detect occluding objects (hands, hair, glasses) on original frames
2. **ReActorFaceSwapOpt (183)**: Swap faces (may have artifacts where occlusions are)
3. **ImageCompositeMasked (192)**: Blend swapped frames with original using occlusion mask
   - `swapped_image * (1 - mask) + original_image * mask`
   - This puts original occluding objects back on top of swapped face

## OcclusionMask Node Configuration

```python
workflow["191"] = {
    "class_type": "OcclusionMask",
    "inputs": {
        "image": ["87", 0],              # Original frames from VAEDecode
        "mask_type": "Occluder",         # Best for detecting hands/objects over face
        "object_mask_threshold": 0.5,    # Detection sensitivity
        "feather_radius": 8,             # Blur mask edges for smooth blending
        "grow_left": 0,
        "grow_right": 0,
        "grow_up": 0,
        "grow_down": 0,
        "dilation_radius": 4,            # Expand mask slightly
        "expansion_iterations": 1.0
    },
    "_meta": {"title": "Occlusion Mask"}
}
```

## Compositing Node

Need to verify ComfyUI has a suitable compositing node. Options:
- `ImageCompositeMasked` (built-in)
- `ImageBlend` with mask
- Custom node if needed

```python
workflow["192"] = {
    "class_type": "ImageCompositeMasked",
    "inputs": {
        "destination": ["183", 0],    # Swapped frames (background)
        "source": ["87", 0],          # Original frames (foreground - occlusions)
        "mask": ["191", 1],           # Occlusion mask from OcclusionMask
        "x": 0,
        "y": 0,
        "resize_source": False
    },
    "_meta": {"title": "Composite Occlusions"}
}
```

## Implementation Steps

### Step 1: Verify OcclusionMask Installation
- Confirm node loads in ComfyUI
- Test with single image first
- Verify batch processing works with video frames

### Step 2: Test Workflow in ComfyUI GUI
- Build the workflow manually in ComfyUI
- Test with a short video segment
- Verify mask quality and compositing result

### Step 3: Integrate into workflow_templates.py
- Add OcclusionMask node (191)
- Add compositing node (192)
- Wire RIFE to compositing output
- Add parameter for enabling/disabling occlusion masking

### Step 4: Add UI Controls (optional)
- `faceswap_occlusion_masking`: boolean toggle
- `occlusion_mask_type`: dropdown (Occluder, XSeg, Object-only)
- `occlusion_threshold`: slider (0.0-1.0)

## Testing Checklist

- [ ] OcclusionMask installed and loads
- [ ] Batch processing works (76 frames)
- [ ] Mask quality is acceptable
- [ ] Compositing produces clean results
- [ ] No performance regression (check execution time)
- [ ] Memory usage acceptable

## Fallback Plan

If OcclusionMask also fails with batches:
1. Process frames individually in a loop (slower but reliable)
2. Use a different masking approach (e.g., depth-based)
3. Accept that occlusion masking isn't feasible for video workflows

## References

- [OcclusionMask GitHub](https://github.com/ialhabbal/OcclusionMask)
- [OcclusionMask Guide](https://www.runcomfy.com/comfyui-nodes/OcclusionMask)
- [ComfyUI ImageCompositeMasked](https://docs.comfy.org/essentials/core_nodes/image/composite)
