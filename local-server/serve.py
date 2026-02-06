#!/usr/bin/env python3
"""
Local static file server for wan22-data directory.

Serves files with CORS headers so the frontend can load videos/images locally
instead of over the network. This dramatically improves playback for large videos.

Usage:
    python serve.py [--port PORT] [--data-dir PATH]

Examples:
    python serve.py                              # Serve ../wan22-data on port 8765
    python serve.py --port 9000                  # Custom port
    python serve.py --data-dir /path/to/data     # Custom data directory
"""

import argparse
import os
import sys
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler
from functools import partial


class CORSRequestHandler(SimpleHTTPRequestHandler):
    """HTTP request handler with CORS headers for cross-origin requests."""

    def __init__(self, *args, directory=None, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    def end_headers(self):
        """Add CORS headers to all responses."""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Range')
        self.send_header('Access-Control-Expose-Headers', 'Content-Length, Content-Range')
        super().end_headers()

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.end_headers()

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
    handler = partial(CORSRequestHandler, directory=str(data_dir))

    # Start server
    server = HTTPServer((args.bind, args.port), handler)

    print(f"\n{'='*60}")
    print(f"  Local Video Server")
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
