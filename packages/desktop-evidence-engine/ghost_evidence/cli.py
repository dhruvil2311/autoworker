"""Command Line Interface for ghost-desktop-evidence-engine."""

import sys
import os
import argparse
import json
from ghost_evidence.pipeline import DesktopEvidencePipeline


def main():
    parser = argparse.ArgumentParser(description="Ghost Desktop Evidence Intelligence Engine")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # analyze command
    analyze_parser = subparsers.add_parser("analyze", help="Analyze media file (video or screenshot)")
    analyze_parser.add_argument("--media", required=True, help="Path to video or screenshot file")
    analyze_parser.add_argument("--output-dir", required=True, help="Output directory for frames & results")
    analyze_parser.add_argument("--tenant-id", default="tenant_default", help="Tenant ID")
    analyze_parser.add_argument("--worker-id", default=None, help="Worker ID")
    analyze_parser.add_argument("--job-id", default=None, help="Analysis job ID")

    # server command
    server_parser = subparsers.add_parser("server", help="Start background HTTP analysis server")
    server_parser.add_argument("--port", type=int, default=8765, help="HTTP server port")
    server_parser.add_argument("--host", default="127.0.0.1", help="HTTP server host")

    args = parser.parse_args()

    if args.command == "analyze":
        pipeline = DesktopEvidencePipeline()
        try:
            result = pipeline.process_media(
                media_path=args.media,
                output_dir=args.output_dir,
                tenant_id=args.tenant_id,
                worker_id=args.worker_id,
                job_id=args.job_id,
            )
            # Print lightweight summary JSON to stdout so standard output is never clogged
            summary = {
                "status": "COMPLETED",
                "media_id": result.get("media_id"),
                "semantic_actions_count": len(result.get("semantic_actions", [])),
                "frames_count": len(result.get("frames", [])),
                "result_file": os.path.join(args.output_dir, args.job_id or result.get("media_id"), "analysis_result.json"),
            }
            print(json.dumps(summary), flush=True)
            sys.exit(0)
        except Exception as e:
            err = {"status": "FAILED", "error": str(e)}
            print(json.dumps(err), file=sys.stderr)
            sys.exit(1)

    elif args.command == "server":
        from ghost_evidence.server import run_server
        run_server(host=args.host, port=args.port)

    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
