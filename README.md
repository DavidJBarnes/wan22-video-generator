# ComfyUI Queue Manager

A web-based queue management system for ComfyUI workflows.

## Features

- **Job Queue Management**: Create, view, cancel, retry, and delete jobs
- **Text-to-Image**: Generate images from text prompts
- **Image-to-Image**: Transform existing images with prompts
- **Settings Management**: Configure ComfyUI connection and default parameters
- **Background Processing**: Automatic queue processing with status updates
- **Real-time Status**: Live updates for ComfyUI connection and queue status

## Project Structure

```
comfyui-queue/
├── backend/
│   ├── main.py           # FastAPI app entry point
│   ├── routes.py         # All API endpoints
│   ├── database.py       # SQLite database operations
│   ├── queue_manager.py  # Background job processor
│   └── comfyui_client.py # ComfyUI API integration
├── frontend/
│   ├── index.html        # Main HTML page
│   ├── css/
│   │   └── styles.css    # Application styles
│   └── js/
│       ├── api.js        # API helper module
│       ├── app.js        # Main app initialization
│       ├── queue.js      # Queue page logic
│       ├── create.js     # Job creation logic
│       └── settings.js   # Settings page logic
└── requirements.txt      # Python dependencies
```

## Installation

1. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Run the server:
   ```bash
   cd backend
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```

3. Open your browser to `http://localhost:8000`

## API Endpoints

### Jobs
- `GET /api/jobs` - List all jobs
- `GET /api/jobs/{id}` - Get job details
- `POST /api/jobs` - Create new job
- `DELETE /api/jobs/{id}` - Delete job
- `POST /api/jobs/{id}/cancel` - Cancel pending job
- `POST /api/jobs/{id}/retry` - Retry failed job

### Settings
- `GET /api/settings` - Get all settings
- `PUT /api/settings` - Update settings

### Queue Control
- `GET /api/queue/status` - Get queue status
- `POST /api/queue/start` - Start queue processing
- `POST /api/queue/stop` - Stop queue processing

### ComfyUI Info
- `GET /api/comfyui/status` - Check ComfyUI connection
- `GET /api/comfyui/checkpoints` - List available checkpoints
- `GET /api/comfyui/samplers` - List available samplers
- `GET /api/comfyui/schedulers` - List available schedulers

### Image Upload
- `POST /api/upload/image` - Upload image file
- `POST /api/upload/image/base64` - Upload base64 image

## Configuration

Default settings can be modified via the Settings page:

- **ComfyUI URL**: Default `http://127.0.0.1:8188`
- **Default Checkpoint**: Model to use
- **Default Steps**: 20
- **Default CFG Scale**: 7.0
- **Default Sampler**: euler
- **Default Scheduler**: normal
- **Default Size**: 512x512
- **Auto-start Queue**: Enabled

## Requirements

- Python 3.10+
- ComfyUI running locally or accessible via network
- SQLite (included with Python)