import { describe, it, expect } from "vitest";
import { MCPExecutor } from "@ghost/runtime/src/executors/mcp-executor.js";
import { RuntimeContext } from "@ghost/runtime/src/context.js";
import { WorkflowV2Step } from "@ghost/workflow-schema";

describe("Input Schema Validation", () => {
  it("fails safely if a required field is missing or wrong type", async () => {
    const executor = new MCPExecutor();
    const context = new RuntimeContext({
      inputs: {}, variables: {}, outputs: {}, artifacts: {},
      scopes: [], executionMetadata: { runId: "r-1", tenantId: "t-1", workflowVersionId: "w-1" }
    });

    const step: WorkflowV2Step = {
      id: "step-1",
      operation: "CALL_MCP",
      target: "MCP",
      description: "Test Schema",
      args: {
        capabilityId: "cap-1",
        connectionId: "mock-mcp-test",
        toolName: "update_inventory",
        inputSchema: {
          properties: { sku: { type: "string" }, qty: { type: "number" } },
          required: ["sku", "qty"]
        },
        inputs: { sku: "WIDGET-1" } // Missing qty
      }
    };

    const resMissing = await executor.execute(step, context);
    expect(resMissing.state).toBe("FAILED");
    expect(resMissing.message).toContain("Missing required field: qty");

    step.args!.inputs = { sku: "WIDGET-1", qty: "ten" }; // wrong type
    const resType = await executor.execute(step, context);
    expect(resType.state).toBe("FAILED");
    expect(resType.message).toContain("Field qty must be a number");
  });
});
