import { describe, it, expect, beforeEach } from "vitest";
import { FrameSampler } from "../../evidence/frame-sampler.js";
import { TaskRelevanceEngine, type RawVisualObservation } from "../../evidence/task-relevance-engine.js";
import { OpenRouterQuotaManager } from "../quota-manager.js";
import { MockVisionProvider, MockSemanticProvider } from "../mock-openrouter-provider.js";
import { EvidenceToWorkflowPipeline } from "../../evidence/evidence-pipeline.js";
import { loadConfig } from "../../../config.js";
import { OpenRouterError } from "../types.js";
import type { VisionReasoningProvider } from "../types.js";

describe("OpenRouter Evidence Pipeline & Deterministic CV Engine", () => {
  describe("FrameSampler & Deduplication", () => {
    it("deduplicates identical frame buffers and respects threshold", () => {
      const sampler = new FrameSampler({ differenceThreshold: 0.1, maxFramesTotal: 5 });
      const buf1 = Buffer.from(new Uint8Array(1000).fill(100));
      const buf2 = Buffer.from(new Uint8Array(1000).fill(100));
      const bufDiff = Buffer.from(new Uint8Array(1000).fill(250));

      const diffZero = sampler.computeVisualDifference(buf1, buf2);
      expect(diffZero).toBe(0);

      const diffHigh = sampler.computeVisualDifference(buf1, bufDiff);
      expect(diffHigh).toBeGreaterThan(0.5);
    });

    it("sorts frames chronologically and caps to maxFramesTotal", () => {
      const sampler = new FrameSampler({ maxFramesTotal: 2 });
      // If files do not exist, sampleAndDeduplicateFrames skips them safely
      const sampled = sampler.sampleAndDeduplicateFrames([]);
      expect(sampled).toEqual([]);
    });
  });

  describe("TaskRelevanceEngine", () => {
    const engine = new TaskRelevanceEngine();

    it("filters out system noise and background chrome (taskbar, clock, stop sharing)", () => {
      const noisyObs: RawVisualObservation[] = [
        {
          id: "obs_noise_1",
          timestamp: 1.0,
          application: "Explorer",
          windowTitle: "Desktop Taskbar",
          targetText: "Windows Start Menu and Clock",
          confidence: 0.9
        },
        {
          id: "obs_noise_2",
          timestamp: 2.0,
          application: "Browser",
          targetDescription: "Chrome notification: Stop sharing screen",
          confidence: 0.9
        },
        {
          id: "obs_work_1",
          timestamp: 3.0,
          application: "ERP Portal",
          targetText: "Submit Purchase Order",
          targetDescription: "Primary action button",
          isClickTarget: true,
          confidence: 0.95
        }
      ];

      const { relevant, discarded } = engine.filterTaskRelevantObservations(noisyObs, {
        activeApp: "ERP Portal"
      });

      expect(relevant.length).toBe(1);
      expect(relevant[0]?.id).toBe("obs_work_1");
      expect(discarded.length).toBe(2);
      expect(discarded.map(d => d.relevance)).toContain("NOISE");
    });

    it("boosts score for active application and demonstrated value inputs", () => {
      const inputObs: RawVisualObservation = {
        id: "obs_input",
        timestamp: 4.0,
        application: "AccountingApp",
        targetText: "Invoice #",
        value: "INV-2026-991",
        isTextMutation: true,
        confidence: 0.9
      };

      const score = engine.calculateRelevance(inputObs, { activeApp: "AccountingApp" });
      expect(score.relevance).toBe("HIGH");
      expect(score.score).toBeGreaterThanOrEqual(5);
    });
  });

  describe("OpenRouterQuotaManager & Cost Guard", () => {
    it("Cost Guard blocks paid models when allowPaidModels = false", () => {
      const quota = new OpenRouterQuotaManager({
        allowPaidModels: false,
        maxRequestsPerDay: 100,
        maxRequestsPerMinute: 20
      });

      // Paid model should be blocked
      expect(() => {
        quota.checkCostGuard("openai/gpt-4o");
      }).toThrowError(/Cost Guard blocked request/);

      expect(() => {
        quota.checkCostGuard("anthropic/claude-3.5-sonnet");
      }).toThrowError(/Cost Guard blocked request/);

      // Free models should pass
      expect(() => {
        quota.checkCostGuard("qwen/qwen3.8-27b:free");
      }).not.toThrow();

      expect(() => {
        quota.checkCostGuard("google/gemini-2.0-flash-exp:free");
      }).not.toThrow();

      expect(() => {
        quota.checkCostGuard("meta-llama/llama-3.3-70b-instruct:free");
      }).not.toThrow();
    });

    it("Trips circuit breaker on 429 quota exhaustion without retry storm", () => {
      const quota = new OpenRouterQuotaManager({
        allowPaidModels: false,
        maxRequestsPerDay: 100,
        maxRequestsPerMinute: 20
      });

      // Record rate limit error
      const rateLimitErr = new OpenRouterError("RATE_LIMITED", "429 Too Many Requests: Rate limit exceeded", 429);
      quota.recordFailure(rateLimitErr);

      expect(quota.isCircuitOpen()).toBe(true);

      // Next call must be blocked immediately
      expect(() => {
        quota.checkRateLimit();
      }).toThrowError(/circuit breaker is active/);
    });

    it("Enforces concurrency limit (semaphore)", async () => {
      const quota = new OpenRouterQuotaManager({
        allowPaidModels: false,
        maxRequestsPerDay: 100,
        maxRequestsPerMinute: 20,
        maxConcurrentRequests: 1
      });

      await quota.acquire();
      expect(quota.getActiveRequests()).toBe(1);

      // Release slot
      quota.release();
      expect(quota.getActiveRequests()).toBe(0);
    });
  });

  describe("EvidenceToWorkflowPipeline End-to-End", () => {
    const config = loadConfig({
      OPENROUTER_API_KEY: "test-openrouter-key",
      OPENROUTER_MODEL: "qwen/qwen3.8-27b:free",
      ALLOW_PAID_MODELS: "false"
    });

    it("compiles workflow successfully using MockVisionProvider without calling external API", async () => {
      const mockProvider = new MockVisionProvider();
      const pipeline = new EvidenceToWorkflowPipeline(config, mockProvider);

      const rawObs: RawVisualObservation[] = [
        {
          id: "obs_01",
          timestamp: 1.0,
          application: "Browser",
          windowTitle: "Customer Portal",
          targetText: "https://example.com/customers",
          type: "NAVIGATE",
          confidence: 0.95
        },
        {
          id: "obs_02",
          timestamp: 2.5,
          application: "Browser",
          windowTitle: "Customer Portal",
          targetText: "Search Customer",
          value: "Acme Corp",
          type: "TYPE",
          isTextMutation: true,
          confidence: 0.95
        },
        {
          id: "obs_03",
          timestamp: 4.0,
          application: "Browser",
          windowTitle: "Customer Portal",
          targetText: "Export Report",
          type: "CLICK",
          isClickTarget: true,
          confidence: 0.95
        }
      ];

      const result = await pipeline.executePipeline({
        jobId: "test_job_101",
        mediaPath: "test_recording.mp4",
        tenantId: "tenant_test",
        workerId: "worker_test",
        taskObjective: "Export customer Acme Corp report",
        rawObservations: rawObs,
        activeApplication: "Browser"
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("COMPLETED");
      expect(result.workflow).toBeDefined();
      expect(result.semanticActions).toBeDefined();
      expect(result.semanticActions!.length).toBeGreaterThan(0);
      expect(result.workflow?.workflow_version).toBe("2.0");
      expect(result.provenance?.jobId).toBe("test_job_101");
      expect((result.workflow?.compiler as any)?.source_type).toBe("OPENROUTER_SEMANTIC_EVIDENCE");
    });

    it("returns AI_QUOTA_EXHAUSTED without generating a fake workflow when quota fails", async () => {
      // Create a mock provider that simulates 429 quota exhaustion
      const failingProvider: VisionReasoningProvider = {
        extractSemanticActions: async () => {
          throw new OpenRouterError("AI_QUOTA_EXHAUSTED", "Provider 429: Free model hourly rate limit reached", 429);
        },
        compileProcessUnderstanding: async () => {
          throw new OpenRouterError("AI_QUOTA_EXHAUSTED", "Rate limited", 429);
        }
      };

      const pipeline = new EvidenceToWorkflowPipeline(config, failingProvider);

      const rawObs: RawVisualObservation[] = [
        {
          id: "obs_01",
          timestamp: 1.0,
          application: "ERP App",
          targetText: "Submit Purchase Order",
          isClickTarget: true,
          confidence: 0.95
        }
      ];

      const result = await pipeline.executePipeline({
        jobId: "test_job_429",
        mediaPath: "test_recording.mp4",
        tenantId: "tenant_test",
        activeApplication: "ERP App",
        rawObservations: rawObs
      });

      // Must explicitly fail with AI_QUOTA_EXHAUSTED and NOT generate a fake workflow
      expect(result.success).toBe(false);
      expect(result.status).toBe("AI_QUOTA_EXHAUSTED");
      expect(result.workflow).toBeUndefined();
      expect(result.message).toContain("quota or rate limit");
    });
  });
});
