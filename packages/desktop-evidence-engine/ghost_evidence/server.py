"""HTTP server exposing asynchronous media analysis job API."""

import json
import os
import threading
import uuid
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from typing import Dict, Any

from ghost_evidence.pipeline import DesktopEvidencePipeline


# Global in-memory job registry (for persistence, results are also written to disk)
JOB_REGISTRY: Dict[str, Dict[str, Any]] = {}
PIPELINE = DesktopEvidencePipeline()


def run_job_async(job_id: str, media_path: str, output_dir: str, tenant_id: str, worker_id: str):
    try:
        JOB_REGISTRY[job_id]["status"] = "RUNNING"
        JOB_REGISTRY[job_id]["current_stage"] = "EXTRACTING"
        JOB_REGISTRY[job_id]["progress_percent"] = 15

        # Execute analysis
        res = PIPELINE.process_media(
            media_path=media_path,
            output_dir=output_dir,
            tenant_id=tenant_id,
            worker_id=worker_id,
            job_id=job_id,
        )

        JOB_REGISTRY[job_id]["status"] = "COMPLETED"
        JOB_REGISTRY[job_id]["current_stage"] = "COMPLETE"
        JOB_REGISTRY[job_id]["progress_percent"] = 100
        JOB_REGISTRY[job_id]["result"] = res

    except Exception as e:
        JOB_REGISTRY[job_id]["status"] = "FAILED"
        JOB_REGISTRY[job_id]["current_stage"] = "FAILED"
        JOB_REGISTRY[job_id]["error"] = str(e)


class AnalysisRequestHandler(BaseHTTPRequestHandler):

    def _send_json(self, status_code: int, data: Dict[str, Any]):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/health":
            self._send_json(200, {"ok": True, "service": "ghost-desktop-evidence-engine"})
            return

        # GET /jobs/:id
        if path.startswith("/jobs/"):
            parts = path.split("/")
            job_id = parts[2] if len(parts) > 2 else ""
            if job_id in JOB_REGISTRY:
                job_info = JOB_REGISTRY[job_id]
                # Return result or progress
                self._send_json(200, job_info)
                return
            else:
                self._send_json(404, {"error": "Job not found"})
                return

        self._send_json(404, {"error": "Not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/jobs/submit":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body.decode("utf-8"))
            except Exception:
                self._send_json(400, {"error": "Invalid JSON payload"})
                return

            media_path = data.get("media_path")
            output_dir = data.get("output_dir", "./evidence_output")
            tenant_id = data.get("tenant_id", "tenant_default")
            worker_id = data.get("worker_id", "worker_default")

            if not media_path or not os.path.exists(media_path):
                self._send_json(400, {"error": f"Invalid or non-existent media_path: {media_path}"})
                return

            job_id = f"job_{uuid.uuid4().hex[:12]}"
            JOB_REGISTRY[job_id] = {
                "job_id": job_id,
                "status": "QUEUED",
                "current_stage": "QUEUED",
                "progress_percent": 0,
                "media_path": media_path,
                "tenant_id": tenant_id,
                "worker_id": worker_id,
                "result": None,
                "error": None,
            }

            thread = threading.Thread(
                target=run_job_async,
                args=(job_id, media_path, output_dir, tenant_id, worker_id),
                daemon=True,
            )
            thread.start()

            self._send_json(202, {
                "job_id": job_id,
                "status": "QUEUED",
                "progress_percent": 0,
            })
            return

        self._send_json(404, {"error": "Not found"})


def run_server(host: str = "127.0.0.1", port: int = 8765):
    server = HTTPServer((host, port), AnalysisRequestHandler)
    print(f"Ghost Desktop Evidence Engine running on http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
