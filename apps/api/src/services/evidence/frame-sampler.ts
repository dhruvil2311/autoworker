import * as fs from "fs";
import * as path from "path";
import { logger } from "@ghost/observability";
import type { FrameEvidence } from "../openrouter/types.js";

import { execFileSync } from "child_process";

export interface FrameSamplingConfig {
  sampleFps: number;
  maxFramesTotal: number;
  differenceThreshold: number; // 0 to 1
  maxWidth: number;
  maxHeight: number;
}

export class FrameSampler {
  private config: FrameSamplingConfig;

  constructor(config?: Partial<FrameSamplingConfig>) {
    this.config = {
      sampleFps: config?.sampleFps ?? 1,
      maxFramesTotal: config?.maxFramesTotal ?? 120,
      differenceThreshold: config?.differenceThreshold ?? 0.05, // 5% visual change
      maxWidth: config?.maxWidth ?? 1280,
      maxHeight: config?.maxHeight ?? 720
    };
  }

  /**
   * Fast, deterministic difference computation between two buffer frames or file paths.
   * Compares pixel sample points across grid to detect state change without heavy external deps.
   */
  public computeVisualDifference(bufferA: Buffer, bufferB: Buffer): number {
    if (bufferA.length === bufferB.length && bufferA.equals(bufferB)) {
      return 0;
    }
    // Sub-sample bytes across the buffer to estimate visual difference
    const samplePoints = 500;
    const stepA = Math.max(1, Math.floor(bufferA.length / samplePoints));
    const stepB = Math.max(1, Math.floor(bufferB.length / samplePoints));
    let diff = 0;

    for (let i = 0; i < samplePoints; i++) {
      const byteA = bufferA[i * stepA] ?? 0;
      const byteB = bufferB[i * stepB] ?? 0;
      if (Math.abs(byteA - byteB) > 15) {
        diff++;
      }
    }

    return diff / samplePoints;
  }

  /**
   * Samples, deduplicates, and compresses an incoming array of frame files.
   */
  public sampleAndDeduplicateFrames(
    rawFrames: Array<{ frameId: string; timestamp: number; filePath: string }>
  ): FrameEvidence[] {
    if (!rawFrames.length) return [];

    const sampled: FrameEvidence[] = [];
    let lastBuffer: Buffer | null = null;

    // 1. Sort chronologically
    const sorted = [...rawFrames].sort((a, b) => a.timestamp - b.timestamp);

    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      if (!item || !fs.existsSync(item.filePath)) continue;

      const buffer = fs.readFileSync(item.filePath);

      // Check for visual duplication against previous frame
      if (lastBuffer) {
        const diff = this.computeVisualDifference(lastBuffer, buffer);
        if (diff < this.config.differenceThreshold) {
          // Nearly identical frame, skip duplicate
          continue;
        }
      }

      lastBuffer = buffer;

      // Encode to compressed base64 representation
      const base64 = buffer.toString("base64");
      sampled.push({
        frameId: item.frameId,
        timestamp: item.timestamp,
        imagePath: item.filePath,
        base64
      });

      if (sampled.length >= this.config.maxFramesTotal) {
        logger.info(
          { total: rawFrames.length, sampled: sampled.length, max: this.config.maxFramesTotal },
          "[FrameSampler] Reached max LLM frame limit"
        );
        break;
      }
    }

    logger.info(
      { inputFrames: rawFrames.length, retainedFrames: sampled.length },
      "[FrameSampler] Multi-stage sampling and deduplication complete"
    );

    return sampled;
  }

  /**
   * Deterministically extracts keyframes from a video file or single screenshot using local tooling.
   */
  public extractFramesFromMedia(
    mediaPath: string,
    outputDir: string
  ): Array<{ frameId: string; timestamp: number; filePath: string }> {
    if (!fs.existsSync(mediaPath)) return [];

    const ext = path.extname(mediaPath).toLowerCase();
    const framesDir = path.join(outputDir, "frames");
    fs.mkdirSync(framesDir, { recursive: true });

    // 1. Screenshot / Image handling
    if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
      return [{
        frameId: "frame_000000",
        timestamp: 0,
        filePath: mediaPath
      }];
    }

    // 2. Video frame extraction via local OpenCV / Python
    try {
      const pythonScript = [
        "import cv2, os, sys, json",
        "video_path = sys.argv[1]",
        "out_dir = sys.argv[2]",
        "sample_fps = float(sys.argv[3])",
        "max_frames = int(sys.argv[4])",
        "cap = cv2.VideoCapture(video_path)",
        "if not cap.isOpened():",
        "    print(json.dumps([]))",
        "    sys.exit(0)",
        "fps = cap.get(cv2.CAP_PROP_FPS) or 30.0",
        "step = max(1, int(round(fps / max(0.1, sample_fps))))",
        "frames = []",
        "idx = 0",
        "saved = 0",
        "while cap.isOpened() and saved < max_frames:",
        "    ret, frame = cap.read()",
        "    if not ret: break",
        "    if idx % step == 0:",
        "        ts = round(idx / fps, 2)",
        "        fid = f'frame_{saved:06d}'",
        "        fpath = os.path.join(out_dir, f'{fid}.jpg')",
        "        cv2.imwrite(fpath, frame)",
        "        frames.append({'frameId': fid, 'timestamp': ts, 'filePath': fpath})",
        "        saved += 1",
        "    idx += 1",
        "cap.release()",
        "print(json.dumps(frames))"
      ].join("\n");

      const stdout = execFileSync("python", [
        "-c",
        pythonScript,
        mediaPath,
        framesDir,
        String(this.config.sampleFps),
        String(this.config.maxFramesTotal)
      ], {
        encoding: "utf-8",
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024
      });

      const parsed = JSON.parse(stdout.trim());
      logger.info({ mediaPath, extractedFramesCount: parsed.length }, "[FrameSampler] Video frames extracted");
      return parsed;
    } catch (e: any) {
      logger.warn({ err: e.message, mediaPath }, "[FrameSampler] Local frame extraction failed or timed out");
      return [];
    }
  }
}
