import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractObservationsFromText,
  safeParseStructuredJson,
  ExtractedStepsResponseSchema,
  cleanJsonText,
  repairJsonString
} from "./ai-provider.js";
import { analyzeFromDocuments } from "./bpi-service.js";
import { InMemoryStore } from "./store.js";
import { loadConfig, type ApiConfig } from "./config.js";
import type { AuthContext } from "@ghost/shared-types";
import { WorkflowCompiler } from "./compiler.js";
import { RealSemanticBPIProvider } from "./ai-provider.js";

const testConfig: ApiConfig = loadConfig({
  NODE_ENV: "test",
  PORT: "4000",
  APP_URL: "http://localhost:5173",
  API_URL: "http://localhost:4000",
  STORAGE_PROVIDER: "memory",
  ALLOW_DEV_AUTH: "true",
  DEV_AUTH_ENABLED: "true",
  ALLOW_MEMORY_STORAGE: "true",
  GEMINI_API_KEY: "test-gemini-key",
  GEMINI_MODEL: "gemini-2.5-flash"
});

const testAuth: AuthContext = {
  tenantId: "tenant-1",
  userId: "user-1",
  role: "admin"
};

describe("BPI Extraction & JSON Robustness Regression Test", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("JSON Parser and Repair Utility", () => {
    it("parses clean JSON matching schema", () => {
      const json = JSON.stringify({
        steps: [
          {
            action: "NAVIGATE",
            context: { url: "https://example.com", description: "Example" },
            target: { selector: "body" },
            value: ""
          }
        ],
        rules: ["Rule 1"]
      });

      const res = safeParseStructuredJson(json, ExtractedStepsResponseSchema);
      expect(res.success).toBe(true);
      if (res.success && res.data.steps) {
        expect(res.data.steps).toHaveLength(1);
        expect(res.data.steps[0]?.action).toBe("NAVIGATE");
      }
    });

    it("strips markdown code blocks", () => {
      const fenced = "```json\n" + JSON.stringify({
        steps: [{ action: "CLICK", target: { selector: "#submit" } }]
      }) + "\n```";

      const res = safeParseStructuredJson(fenced, ExtractedStepsResponseSchema);
      expect(res.success).toBe(true);
      if (res.success && res.data.steps) {
        expect(res.data.steps[0]?.action).toBe("CLICK");
      }
    });

    it("repairs trailing commas in JSON", () => {
      const malformed = `{\n  "steps": [\n    {\n      "action": "TYPE",\n      "target": { "selector": "#user", },\n      "value": "admin",\n    },\n  ],\n}`;
      const res = safeParseStructuredJson(malformed, ExtractedStepsResponseSchema);
      expect(res.success).toBe(true);
      if (res.success && res.data.steps) {
        expect(res.data.steps[0]?.action).toBe("TYPE");
        expect(res.data.steps[0]?.value).toBe("admin");
      }
    });

    it("extracts JSON payload when surrounded by preamble/postamble conversational text", () => {
      const noisy = `Here is the structured JSON you requested:\n\n` +
        JSON.stringify({
          steps: [{ action: "NAVIGATE", context: { url: "https://saucedemo.com" } }]
        }) + `\n\nI hope this helps your automation!`;

      const res = safeParseStructuredJson(noisy, ExtractedStepsResponseSchema);
      expect(res.success).toBe(true);
      if (res.success && res.data.steps) {
        expect(res.data.steps[0]?.action).toBe("NAVIGATE");
      }
    });
  });

  describe("Regression: Malformed LLM output never produces false BPI success", () => {
    it("FAILS explicitly when LLM returns malformed JSON and retry fails", async () => {
      // Mock LLM returning malformed string
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '{"steps": [{"action": "NAVIGATE", "context": {"url": "https://unfinis'
              }
            }
          ]
        })
      }) as typeof fetch;

      const store = new InMemoryStore();
      const worker = await store.createGhostWorker(testAuth, {
        name: "Test Worker",
        description: "Testing extraction failure"
      });

      // Upload document with valid text that cannot be parsed by simple heuristic
      await store.createDocument(testAuth, {
        workerId: worker.id,
        name: "complex-manual.txt",
        type: "TXT",
        parsedJson: "Enterprise Process Manual: Invoicing reconciliation with multiple external vendors and complex calculations."
      });

      // Expect analyzeFromDocuments to throw an explicit error rather than succeeding with gap_count: 0
      await expect(analyzeFromDocuments(testConfig, store, testAuth, worker.id))
        .rejects.toThrow(/BPI_EXTRACTION_FAILED/);

      // Verify worker status is FAILED and analysisStage is FAILED
      const updatedWorker = await store.getGhostWorker(testAuth, worker.id);
      expect(updatedWorker?.status).toBe("FAILED");
      expect(updatedWorker?.analysisStage).toBe("FAILED");
    });

    it("SUCCEEDS and compiles workflow when LLM returns valid structured steps", async () => {
      // Mock LLM returning valid steps
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  steps: [
                    {
                      action: "NAVIGATE",
                      context: { url: "https://www.saucedemo.com/", description: "SauceDemo" },
                      target: { selector: "body" },
                      value: ""
                    },
                    {
                      action: "TYPE",
                      context: { url: "https://www.saucedemo.com/", description: "Username" },
                      target: { selector: "#user-name" },
                      value: "standard_user"
                    },
                    {
                      action: "CLICK",
                      context: { url: "https://www.saucedemo.com/", description: "Login button" },
                      target: { selector: "#login-button" },
                      value: ""
                    }
                  ],
                  rules: ["Verify valid login before proceeding"]
                })
              }
            }
          ]
        })
      }) as typeof fetch;

      const store = new InMemoryStore();
      const worker = await store.createGhostWorker(testAuth, {
        name: "SauceDemo Worker",
        description: "Valid extraction test"
      });

      await store.createDocument(testAuth, {
        workerId: worker.id,
        name: "saucedemo-sop.txt",
        type: "TXT",
        parsedJson: "1. Open https://www.saucedemo.com/\n2. Enter username standard_user\n3. Click login"
      });

      const result = await analyzeFromDocuments(testConfig, store, testAuth, worker.id);

      expect(result.bpsId).toBeDefined();
      const updatedWorker = await store.getGhostWorker(testAuth, worker.id);
      expect(updatedWorker?.status).toBe("READY_FOR_REVIEW");
      expect(updatedWorker?.analysisStage).toBe("COMPLETE");

      // Verify BPS has extracted steps
      const bps = await store.getBPS(testAuth, result.bpsId);
      expect(bps).toBeDefined();
      expect(bps?.specificationJson.steps.length).toBeGreaterThan(0);

      // Verify Workflow Compiler can compile this specification
      const provider = new RealSemanticBPIProvider(testConfig);
      const compiler = new WorkflowCompiler(provider);
      const compiledWorkflow = await compiler.compile(bps!.specificationJson, { version: "phase3-compiler-1.0" });
      expect(compiledWorkflow).toBeDefined();
      expect(compiledWorkflow.root_step).toBeDefined();
    });
  });

  describe("Distinguishing States A, B, and C", () => {
    it("State B: Informational document with 0 executable steps produces NEEDS_CLARIFICATION with blocking gap", async () => {
      // Mock LLM returning valid JSON with 0 executable steps (e.g. policy document)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  steps: [],
                  rules: ["Company policy: All orders over $100 require manager approval."]
                })
              }
            }
          ]
        })
      }) as typeof fetch;

      const store = new InMemoryStore();
      const worker = await store.createGhostWorker(testAuth, {
        name: "Policy Worker",
        description: "Informational document test"
      });

      await store.createDocument(testAuth, {
        workerId: worker.id,
        name: "policy.txt",
        type: "TXT",
        parsedJson: "Corporate Policy Document: All orders over $100 require manager approval."
      });

      const result = await analyzeFromDocuments(testConfig, store, testAuth, worker.id);

      // State B: Must have 1 blocking gap explaining no executable steps were found
      expect(result.gaps.length).toBe(1);
      expect(result.gaps[0]?.blocking).toBe(true);
      expect(result.gaps[0]?.gap_id).toBe("gap_no_executable_steps");

      const updatedWorker = await store.getGhostWorker(testAuth, worker.id);
      expect(updatedWorker?.status).toBe("NEEDS_CLARIFICATION");
      expect(updatedWorker?.analysisStage).toBe("PREPARING_QUESTIONS");
    });
  });

  describe("Multi-Format Document Parsing & Extraction", () => {
    it("handles parsed SOP text document format", async () => {
      const parsedSopDoc = {
        summary: "SauceDemo Login and Checkout SOP",
        steps: [
          "Navigate to https://www.saucedemo.com/",
          "Enter standard_user into #user-name",
          "Enter secret_sauce into #password",
          "Click #login-button"
        ],
        rules: ["Only standard_user is supported"]
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  steps: [
                    { action: "NAVIGATE", context: { url: "https://www.saucedemo.com/" }, target: { selector: "body" } },
                    { action: "TYPE", target: { selector: "#user-name" }, value: "standard_user" },
                    { action: "TYPE", target: { selector: "#password" }, value: "secret_sauce" },
                    { action: "CLICK", target: { selector: "#login-button" } }
                  ]
                })
              }
            }
          ]
        })
      }) as typeof fetch;

      const observations = await extractObservationsFromText(testConfig, JSON.stringify(parsedSopDoc));
      expect(observations).toHaveLength(4);
      expect(observations[0]?.action).toBe("NAVIGATE");
      expect(observations[1]?.action).toBe("INPUT");
      expect(observations[2]?.action).toBe("INPUT");
      expect(observations[3]?.action).toBe("CLICK");
    });
  });
});
