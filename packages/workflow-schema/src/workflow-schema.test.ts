import { describe, expect, it } from "vitest";
import { validateWorkflow, workflowSchemaVersion } from "./index.js";

describe("workflow schema", () => {
  it("rejects unknown action types", () => {
    expect(() =>
      validateWorkflow({
        workflow_version: workflowSchemaVersion,
        name: "Bad workflow",
        steps: [{ id: "step_001", type: "EVAL_CODE", description: "run code", confidence: 1 }],
        compiler: {
          version: "test",
          model: "test",
          source_recording_id: "00000000-0000-4000-8000-000000000000",
          compiled_at: new Date().toISOString()
        }
      })
    ).toThrow();
  });
});
