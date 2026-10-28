import { describe, it, expect, vi } from "vitest";
import { WorkflowRuntime } from "@ghost/runtime/src/runtime.js";
import { MCPExecutor } from "@ghost/runtime/src/executors/mcp-executor.js";
import { RuntimeContext } from "@ghost/runtime/src/context.js";
import type { ExecutionPlan } from "@ghost/runtime/src/planner.js";
import { fileURLToPath } from "node:url";

const mockExecutionPersistence = {
  recordStepStarted: vi.fn(),
  recordStepCompleted: vi.fn(),
  recordRunState: vi.fn(),
  recordHitlPause: vi.fn(),
  saveCheckpoint: vi.fn(),
  loadCheckpoint: vi.fn().mockResolvedValue(null),
  hasStepCompleted: vi.fn().mockResolvedValue(false),
};

describe("Actual MCP Execution", () => {
  it("invokes the mock MCP server and returns the result to context", async () => {
    const mcpExecutor = new MCPExecutor();
    const context = new RuntimeContext({
      inputs: {}, variables: {}, outputs: {}, artifacts: {},
      executionMetadata: { runId: "run-mcp-test", tenantId: "t-1", workflowVersionId: "wf-1" },
      scopes: []
    });
    const __filename = fileURLToPath(import.meta.url);
    const pathSegments = __filename.split(/[\\/]/);
    pathSegments.pop();
    const serverPath = `${pathSegments.join("/")}/__fixtures__/mock-mcp-server.ts`;
    context.set("__connection_mock-mcp-test", {
      command: "npx",
      args: ["tsx", serverPath]
    });
    
    // We create a mock ExecutionPlan that directly targets CALL_MCP
    const plan: ExecutionPlan = {
      id: "plan-1",
      workflowVersionId: "wf-1",
      workflow: {
        workflow_version: "2.0",
        name: "Test MCP",
        description: "",
        status: "ACTIVE",
        variables: [],
        secrets: [],
        expected_domains: [],
        compiler: { version: "3.5", source_specification_id: "bps-1", compiled_at: new Date().toISOString() },
        root_step: {
          id: "step-root",
          operation: "SEQUENCE",
          target: "DATA",
          description: "Root",
          children: [
            {
              id: "step-mcp",
              operation: "CALL_MCP",
              target: "MCP",
              description: "Call mock server",
              args: {
                capabilityId: "mock-cap-1",
                connectionId: "mock-mcp-test",
                toolName: "get_inventory",
                inputSchema: { properties: { sku: { type: "string" } }, required: ["sku"] },
                inputs: { sku: "WIDGET-1" },
                sideEffect: "READ"
              }
            }
          ]
        }
      }
    };

    const runtime = new WorkflowRuntime(plan, mockExecutionPersistence as any, [mcpExecutor], context.getState());
    await runtime.start();

    // The runtime should have executed the step successfully
    const stepRecord = mockExecutionPersistence.recordStepCompleted.mock.calls.find(c => c[0] === "step-mcp");
    expect(stepRecord).toBeDefined();
    expect(stepRecord[1]).toBe("SUCCEEDED");
    expect(stepRecord[4].mcp_response).toBeDefined();
    expect(JSON.parse(stepRecord[4].mcp_response[0].text).quantity).toBe(42);
  }, 10000); // 10s timeout for npx tsx execution
});
