"""ComfyUI Queue Manager - Main Application Entry Point."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from database import init_db, get_setting, reset_orphaned_running_jobs
from routes import router
from queue_manager import queue_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown."""
    # Startup
    print("Initializing ComfyUI Queue Manager...")

    # Initialize database
    init_db()
    print("Database initialized")

    # Reset any orphaned running jobs/segments from previous backend instance
    reset_orphaned_running_jobs()

    # Auto-start queue if enabled
    auto_start = get_setting("auto_start_queue", "true")
    if auto_start.lower() == "true":
        queue_manager.start()
        print("Queue manager auto-started")

    yield

    # Shutdown
    print("Shutting down...")
    queue_manager.stop()
    print("Queue manager stopped")


# Create FastAPI app
app = FastAPI(
    title="ComfyUI Queue Manager",
    description="A queue management system for ComfyUI workflows",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router, prefix="/api")

# Serve static files (frontend)
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(frontend_path):
    app.mount("/static", StaticFiles(directory=frontend_path), name="static")

    @app.get("/")
    async def serve_index():
        """Serve the main frontend page."""
        index_path = os.path.join(frontend_path, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return {"message": "Frontend not found. API is available at /api"}


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "queue_running": queue_manager.is_running
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)