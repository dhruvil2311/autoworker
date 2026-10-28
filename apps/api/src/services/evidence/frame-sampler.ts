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

export interface FrameSamplingReport {
  inputFrames: number;
  missingFiles: number;
  duplicatesRemoved: number;
  retained: number;
  /** Frames dropped only to respect the frame budget; spread evenly so the whole recording stays covered. */
  droppedForBudget: number;
  coveredSeconds?: { start: number; end: number } | undefined;
}

export interface MediaExtractionReport {
  ok: boolean;
  error?: string | undefined;
  durationSeconds?: number | undefined;
  totalVideoFrames?: number | undefined;
  extracted: number;
  /** Timestamp of the last extracted frame; compared with duration to detect early termination. */
  lastTimestamp?: number | undefined;
}

export class FrameSampler {
  private config: FrameSamplingConfig;
  public lastSamplingReport: FrameSamplingReport | undefined;
  public lastExtractionReport: MediaExtractionReport | undefined;

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

    const candidates: FrameEvidence[] = [];
    let lastBuffer: Buffer | null = null;
    let missingFiles = 0;
    let duplicatesRemoved = 0;

    const sorted = [...rawFrames].sort((a, b) => a.timestamp - b.timestamp);

    for (const item of sorted) {
      if (!item || !fs.existsSync(item.filePath)) { missingFiles++; continue; }
      const buffer = fs.readFileSync(item.filePath);
      if (lastBuffer && this.computeVisualDifference(lastBuffer, buffer) < this.config.differenceThreshold) {
        duplicatesRemoved++;
        continue;
      }
      lastBuffer = buffer;
      candidates.push({ frameId: item.frameId, timestamp: item.timestamp, imagePath: item.filePath, base64: buffer.toString("base64") });
    }

    // Over budget: keep first and last and spread the rest evenly instead of truncating the tail.
    let sampled = candidates;
    if (candidates.length > this.config.maxFramesTotal) {
      const budget = Math.max(2, this.config.maxFramesTotal);
      const picked = new Set<number>();
      for (let i = 0; i < budget; i++) picked.add(Math.round((i * (candidates.length - 1)) / (budget - 1)));
      sampled = [...picked].sort((x, y) => x - y).map(i => candidates[i]!);
    }

    this.lastSamplingReport = {
      inputFrames: rawFrames.length,
      missingFiles,
      duplicatesRemoved,
      retained: sampled.length,
      droppedForBudget: candidates.length - sampled.length,
      coveredSeconds: sampled.length ? { start: sampled[0]!.timestamp, end: sampled[sampled.length - 1]!.timestamp } : undefined
    };
    logger.info(this.lastSamplingReport, "[FrameSampler] Sampling and deduplication complete");

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
        "total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)",
        "step = max(1, int(round(fps / max(0.1, sample_fps))))",
        "if total > 0 and total / step > max_frames: step = max(1, -(-total // max_frames))",
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
        "print(json.dumps({'frames': frames, 'fps': fps, 'total': total, 'duration': (total / fps) if total else None}))"
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
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024
      });

      const parsed = JSON.parse(stdout.trim());
      const frames = Array.isArray(parsed) ? parsed : (parsed.frames || []);
      const last = frames[frames.length - 1];
      this.lastExtractionReport = {
        ok: frames.length > 0,
        ...(frames.length ? {} : { error: "The video could not be decoded or contains no frames." }),
        durationSeconds: typeof parsed.duration === "number" ? parsed.duration : undefined,
        totalVideoFrames: typeof parsed.total === "number" ? parsed.total : undefined,
        extracted: frames.length,
        lastTimestamp: last?.timestamp
      };
      logger.info({ mediaPath, ...this.lastExtractionReport }, "[FrameSampler] Video frames extracted");
      return frames;
    } catch (e: any) {
      this.lastExtractionReport = { ok: false, error: `Local frame extraction failed: ${e.message}`, extracted: 0 };
      logger.warn({ err: e.message, mediaPath }, "[FrameSampler] Local frame extraction failed or timed out");
      return [];
    }
  }
}
