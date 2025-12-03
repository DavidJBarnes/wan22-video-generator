Wan22 Video Generator — Clarified Application Overview (For Development)
1. Purpose

The Wan22 Video Generator is a local React + Python application that connects to a local ComfyUI server via its REST API. Its purpose is to generate Wan22-based videos longer than ComfyUI's 5-second limit by automatically breaking the video into multiple segments and stitching them together.

2. High-Level Workflow
2.1 Segments

ComfyUI/Wan22 can only generate ~5-second clips.

To produce longer videos, the user defines the total duration and how many segments they want.

Example: A 10s video = 2 segments × 5 seconds each.

2.2 Segment Generation Loop

For each segment:

Segment 1

User provides:

A starting image

A prompt (text)

The app injects these into a Wan22 i2v workflow template and submits it to ComfyUI.

Segment N

After a segment finishes, the app:

Downloads the final frame of that segment from ComfyUI output.

Displays it in the UI as the starting image for the next segment.

User provides a new prompt for the next segment.

App submits the modified workflow to ComfyUI.

Completion

When all segments are finished, the Python backend stitches all individual MP4 files into a single final video.

3. Jobs and Queueing
3.1 Job Definition

A Job consists of:

One or more segments

Their corresponding:

Starting images

Prompts

Workflow settings

The final stitched video

3.2 Local Job Queue

A small local queue system runs inside the Python backend.
Purpose:

Prevent the user from submitting multiple ComfyUI tasks at once.

Ensure ComfyUI is only processing one workflow at a time.

Allow the UI to track:

Job status

Segment-level progress

ComfyUI task state

The queue manager:

Stores pending jobs locally (in memory or disk-based, TBD)

Submits only the next pending segment to ComfyUI

Waits for ComfyUI to finish and return outputs

Moves on to the next segment

Marks the job complete once all segments are processed and stitched

4. Application Architecture
4.1 Frontend (React)

Responsibilities:

Let the user configure a job (duration, segment count, prompts, starting image).

Display:

Segment outputs

Final-frame previews

Job status/progress

Final stitched video

Interact with backend via REST API.

4.2 Backend (Python)

Responsibilities:

Provide REST API endpoints for:

Creating jobs

Adding segments

Querying status

Triggering stitching

Maintain and process the local job queue.

Communicate with ComfyUI API to:

Submit workflows

Poll for output

Download image/video results

Extract the last frame of each segment.

Handle video stitching (e.g., ffmpeg).

5. ComfyUI Integration

The backend keeps a Wan22 i2v workflow template.

For each segment:

It injects runtime values:

Starting image

Prompt

Seed (optional)

Duration settings

Submits to ComfyUI’s /prompt or equivalent endpoint.

When ComfyUI completes:

The backend fetches the video

Extracts last frame

Stores both for UI access

6. Final Output

When all segments are generated:

Backend stitches segment MP4s into a full video.

Stores metadata including:

Total duration

Per-segment prompts

Timestamps

UI shows the final video to the user.
