import { describe, it, expect } from "vitest";
import { MCPExecutor } from "@ghost/runtime/src/executors/mcp-executor.js";
import { RuntimeContext } from "@ghost/runtime/src/context.js";
import { WorkflowV2Step } from "@ghost/workflow-schema";

describe("Capability Gap Handling", () => {
  it("fails safely with Capability Gap when connection is missing", async () => {
    const executor = new MCPExecutor();
    const context = new RuntimeContext({
      inputs: {}, variables: {}, outputs: {}, artifacts: {},
      scopes: [], executionMetadata: { runId: "r-1", tenantId: "t-1", workflowVersionId: "w-1" }
    });

    const step: WorkflowV2Step = {
      id: "step-1",
      operation: "CALL_MCP",
      target: "MCP",
      description: "Test Gap",
      args: {
        capabilityId: "cap-1",
        connectionId: "nonexistent-conn",
        toolName: "get_inventory",
        inputs: { sku: "W-1" }
      }
    };

    const res = await executor.execute(step, context);
    expect(res.state).toBe("FAILED");
    expect(res.message).toContain("Capability gap: NO_CONNECTION");
  });
});
