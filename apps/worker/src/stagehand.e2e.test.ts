import { describe, expect, it } from "vitest";
import { BrowserbaseExecutionProvider } from "./browserbase.js";
import { executeWorkflowWithBrowserbase, ExecutionPersistence } from "./executor.js";
import { loadConfig } from "../../api/dist/config.js";
import type { Workflow } from "@ghost/workflow-schema";

describe("stagehand fallback e2e", () => {
  it("falls back to stagehand when deterministic selectors fail", async () => {
    const config = loadConfig();
    if (!config.browserbaseApiKey || !config.browserbaseProjectId) {
      return; // Skip if no real credentials
    }
    
    const provider = new BrowserbaseExecutionProvider(config as any);
    const workflow: Workflow = {
      workflow_version: "1.0",
      name: "Test workflow",
      description: "Test workflow description",
      expected_domains: ["example.com"],
      status: "ACTIVE",
      variables: [],
      secrets: [],
      anomaly_policies: [],
      compiler: { version: "1.0", model: "test", source_recording_id: "00000000-0000-4000-8000-000000000000", compiled_at: new Date().toISOString() },
      steps: [
        {
          id: "step_1",
          type: "NAVIGATE",
          description: "Go to example.com",
          target: { expected_url: "https://example.com/", selector_candidates: [] },
          input: null,
          preconditions: [],
          success_conditions: [],
          failure_policy: { retry_limit: 0, on_failure: "FAIL_RUN" },
          confidence: 1,
          destructive: false
        },
        {
          id: "step_2",
          type: "CLICK",
          description: "link containing 'information'",
          target: { 
            selector_candidates: [{ strategy: "css", value: "#bad_selector_will_fail", confidence: 0.9 }],
          },
          input: null,
          preconditions: [],
          success_conditions: [],
          failure_policy: { retry_limit: 0, on_failure: "FAIL_RUN" },
          confidence: 0.5,
          destructive: false
        }
      ]
    };

    const persistenceLogs: any[] = [];
    const persistence: ExecutionPersistence = {
      async recordStepStarted(stepId) { persistenceLogs.push({ stepId, action: "STARTED" }); },
      async recordStepCompleted(stepId, state, strategy, message) { persistenceLogs.push({ stepId, action: "COMPLETED", state, strategy, message }); },
      async recordRunState(state, sessionMetadata) { persistenceLogs.push({ action: "RUN_STATE", state, sessionMetadata }); },
      async recordHitlPause(stepId, challengeType) { persistenceLogs.push({ stepId, action: "HITL_PAUSE", challengeType }); }
    };

    const results = await executeWorkflowWithBrowserbase(provider, workflow, persistence);
    
    const clickResult = results.find(r => r.stepId === "step_2");
    expect(clickResult?.state).toBe("SUCCEEDED");
    expect(clickResult?.strategy).toBe("STAGEHAND");
    
    // Check persistence logs
    const completedLog = persistenceLogs.find(l => l.stepId === "step_2" && l.action === "COMPLETED");
    expect(completedLog?.strategy).toBe("STAGEHAND");
  }, 60000); // 60s timeout for browser operations
});
