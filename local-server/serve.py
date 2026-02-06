#!/usr/bin/env python3
"""
Local static file server for wan22-data directory.

Serves files with CORS headers and Range request support so the frontend
can load videos/images locally instead of over the network.

Usage:
    python serve.py [--port PORT] [--data-dir PATH]

Examples:
    python serve.py                              # Serve ../wan22-data on port 8765
    python serve.py --port 9000                  # Custom port
    python serve.py --data-dir /path/to/data     # Custom data directory
"""

import argparse
import json
import os
import subprocess
import sys
import re
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler
from functools import partial

# Sync script location
SYNC_SCRIPT = Path.home() / "projects" / "scripts" / "sync.sh"


class RangeRequestHandler(SimpleHTTPRequestHandler):
    """HTTP request handler with CORS headers and Range request support."""

    def __init__(self, *args, directory=None, **kwargs):
        self.data_directory = directory
        super().__init__(*args, directory=directory, **kwargs)

    def end_headers(self):
        """Add CORS headers to all responses."""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Range, Content-Type')
        self.send_header('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges')
        super().end_headers()

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS')
        self.end_headers()

    def do_POST(self):
        """Handle POST requests (for sync endpoint)."""
        if self.path == '/sync':
            self.handle_sync()
        else:
            self.send_error(404, "Not found")

    def handle_sync(self):
        """Run the sync script and return output."""
        if not SYNC_SCRIPT.exists():
            self._send_json_response(404, {
                "success": False,
                "error": f"Sync script not found: {SYNC_SCRIPT}"
            })
            return

        try:
            print(f"\033[94m[Sync] Running {SYNC_SCRIPT}...\033[0m")
            result = subprocess.run(
                ["bash", str(SYNC_SCRIPT)],
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )

            response = {
                "success": result.returncode == 0,
                "returncode": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "error": result.stderr.strip() if result.returncode != 0 else None
            }

            if result.returncode == 0:
                print(f"\033[92m[Sync] Completed successfully\033[0m")
            else:
                print(f"\033[91m[Sync] Failed with code {result.returncode}\033[0m")
                if result.stderr:
                    print(f"\033[91m[Sync] stderr: {result.stderr[:500]}\033[0m")

            self._send_json_response(200, response)

        except subprocess.TimeoutExpired:
            self._send_json_response(500, {
                "success": False,
                "error": "Sync timed out after 5 minutes"
            })
        except (BrokenPipeError, ConnectionResetError):
            # Client disconnected - ignore
            pass
        except Exception as e:
            self._send_json_response(500, {
                "success": False,
                "error": str(e)
            })

    def _send_json_response(self, status_code, data):
        """Send JSON response, handling client disconnects gracefully."""
        try:
            self.send_response(status_code)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())
        except (BrokenPipeError, ConnectionResetError):
            # Client disconnected - ignore
            pass

    def do_GET(self):
        """Handle GET requests with Range header support."""
        # Get the file path
        path = self.translate_path(self.path)

        if os.path.isdir(path):
            # Let parent handle directory listings
            return super().do_GET()

        if not os.path.exists(path):
            self.send_error(404, "File not found")
            return

        # Check for Range header
        range_header = self.headers.get('Range')

        if range_header:
            self.handle_range_request(path, range_header)
        else:
            # No range request - serve full file
            super().do_GET()

    def handle_range_request(self, path, range_header):
        """Handle HTTP Range requests for partial content."""
        try:
            file_size = os.path.getsize(path)

            # Parse Range header (e.g., "bytes=0-1023" or "bytes=1024-")
            match = re.match(r'bytes=(\d*)-(\d*)', range_header)
            if not match:
                self.send_error(400, "Invalid Range header")
                return

            start_str, end_str = match.groups()

            if start_str:
                start = int(start_str)
                end = int(end_str) if end_str else file_size - 1
            else:
                # Suffix range: "-500" means last 500 bytes
                start = file_size - int(end_str)
                end = file_size - 1

            # Validate range
            if start < 0 or end >= file_size or start > end:
                self.send_response(416)  # Range Not Satisfiable
                self.send_header('Content-Range', f'bytes */{file_size}')
                self.end_headers()
                return

            # Calculate content length
            content_length = end - start + 1

            # Get content type
            content_type = self.guess_type(path)

            # Send partial content response
            self.send_response(206)  # Partial Content
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(content_length))
            self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
            self.send_header('Accept-Ranges', 'bytes')
            self.end_headers()

            # Send the requested byte range
            with open(path, 'rb') as f:
                f.seek(start)
                remaining = content_length
                chunk_size = 64 * 1024  # 64KB chunks

                while remaining > 0:
                    chunk = f.read(min(chunk_size, remaining))
                    if not chunk:
                        break
                    try:
                        self.wfile.write(chunk)
                    except (BrokenPipeError, ConnectionResetError):
                        # Client disconnected - this is normal for video seeking
                        return
                    remaining -= len(chunk)

        except Exception as e:
            self.log_error(f"Error handling range request: {e}")
            self.send_error(500, str(e))

    def do_HEAD(self):
        """Handle HEAD requests with Accept-Ranges header."""
        path = self.translate_path(self.path)

        if os.path.isfile(path):
            file_size = os.path.getsize(path)
            content_type = self.guess_type(path)

            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(file_size))
            self.send_header('Accept-Ranges', 'bytes')
            self.end_headers()
        else:
            super().do_HEAD()

    def log_message(self, format, *args):
        """Custom log format with color coding."""
        status = args[1] if len(args) > 1 else ''
        if status.startswith('2'):
            color = '\033[92m'  # Green
        elif status.startswith('3'):
            color = '\033[93m'  # Yellow
        elif status.startswith('4'):
            color = '\033[91m'  # Red
        else:
            color = '\033[0m'   # Default

        reset = '\033[0m'
        print(f"{color}{self.address_string()} - {format % args}{reset}")


def main():
    parser = argparse.ArgumentParser(
        description='Local static file server for wan22-data',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
URL mapping examples:
  Local:  http://localhost:8765/job_output/job_1000/segment_0.webm
  Local:  http://localhost:8765/thumbnail_cache/job_1000_thumb.jpg
        """
    )
    parser.add_argument(
        '--port', '-p',
        type=int,
        default=8765,
        help='Port to serve on (default: 8765)'
    )
    parser.add_argument(
        '--data-dir', '-d',
        type=str,
        default=None,
        help='Path to wan22-data directory (default: ../wan22-data relative to script)'
    )
    parser.add_argument(
        '--bind', '-b',
        type=str,
        default='0.0.0.0',
        help='Address to bind to (default: 0.0.0.0)'
    )

    args = parser.parse_args()

    # Determine data directory
    if args.data_dir:
        data_dir = Path(args.data_dir).resolve()
    else:
        # Default: look for wan22-data in common locations
        script_dir = Path(__file__).parent.resolve()
        possible_paths = [
            script_dir.parent / 'wan22-data',           # ../wan22-data
            Path.home() / 'projects' / 'wan22-data',    # ~/projects/wan22-data
            Path('/home/david/projects/wan22-data'),    # Absolute fallback
        ]

        data_dir = None
        for p in possible_paths:
            if p.exists():
                data_dir = p
                break

        if not data_dir:
            print("Error: Could not find wan22-data directory.", file=sys.stderr)
            print("Searched:", file=sys.stderr)
            for p in possible_paths:
                print(f"  - {p}", file=sys.stderr)
            print("\nSpecify manually with --data-dir", file=sys.stderr)
            sys.exit(1)

    if not data_dir.exists():
        print(f"Error: Data directory does not exist: {data_dir}", file=sys.stderr)
        sys.exit(1)

    # Create handler with the data directory
    handler = partial(RangeRequestHandler, directory=str(data_dir))

    # Start server
    server = HTTPServer((args.bind, args.port), handler)

    print(f"\n{'='*60}")
    print(f"  Local Video Server (with Range request support)")
    print(f"{'='*60}")
    print(f"  Serving:  {data_dir}")
    print(f"  URL:      http://localhost:{args.port}")
    print(f"  Binding:  {args.bind}:{args.port}")
    print(f"{'='*60}")
    print(f"\nAdd this URL to Settings > Local Server URL in the web UI")
    print(f"Press Ctrl+C to stop\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()


if __name__ == '__main__':
    main()
