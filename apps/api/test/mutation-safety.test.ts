import { describe, it, expect } from "vitest";
import { MCPExecutor } from "@ghost/runtime/src/executors/mcp-executor.js";
import { RuntimeContext } from "@ghost/runtime/src/context.js";
import { WorkflowV2Step } from "@ghost/workflow-schema";

describe("Mutation Safety and Side Effect Tracking", () => {
  it("prevents blind retries when a side-effect is uncertain", async () => {
    const executor = new MCPExecutor();
    const context = new RuntimeContext({
      inputs: {}, variables: {}, outputs: {}, artifacts: {},
      scopes: [], executionMetadata: { runId: "run-crash-test", tenantId: "t-1", workflowVersionId: "w-1" }
    });

    // Simulate that the context indicates this mutation started but crashed (is uncertain)
    context.set("__uncertain_run-crash-test_step-mutation", true);

    const step: WorkflowV2Step = {
      id: "step-mutation",
      operation: "CALL_MCP",
      target: "MCP",
      description: "Update critical record",
      args: {
        capabilityId: "cap-1",
        connectionId: "mock-mcp-test",
        toolName: "update_inventory",
        inputs: { sku: "W-1", quantity: 10 },
        sideEffect: "MUTATION"
      }
    };

    const result = await executor.execute(step, context);
    
    // Instead of executing, it should pause for human due to the uncertain mutation state
    expect(result.state).toBe("PAUSED_FOR_HUMAN");
    expect(result.hitlReason).toBe("UNVERIFIED_MUTATION_CAPABILITY");
  });
});
