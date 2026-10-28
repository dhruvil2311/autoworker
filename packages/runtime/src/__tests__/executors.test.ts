import { describe, it, expect } from "vitest";
import { ApiExecutor, DataExecutor } from "../executors/index.js";
import { RuntimeContext } from "../context.js";
import type { WorkflowV2Step } from "@ghost/workflow-schema";

describe("Executor Verification", () => {
  describe("ApiExecutor", () => {
    it("blocks SSRF attempts to internal networks", async () => {
      const executor = new ApiExecutor();
      const context = new RuntimeContext({
        inputs: {}, variables: {}, outputs: {}, artifacts: {}, scopes: [],
        executionMetadata: { runId: "1", tenantId: "1", workflowVersionId: "1" }
      });
      
      const step: WorkflowV2Step = {
        id: "step1", operation: "CALL_API", target: "API",
        args: { url: "http://169.254.169.254/latest/meta-data/" }
      };

      const result = await executor.execute(step, context);
      expect(result.state).toBe("FAILED");
      expect(result.message).toContain("SSRF Protection");
    });
    
    it("blocks non-http protocols", async () => {
      const executor = new ApiExecutor();
      const context = new RuntimeContext({
        inputs: {}, variables: {}, outputs: {}, artifacts: {}, scopes: [],
        executionMetadata: { runId: "1", tenantId: "1", workflowVersionId: "1" }
      });
      
      const step: WorkflowV2Step = {
        id: "step1", operation: "CALL_API", target: "API",
        args: { url: "file:///etc/passwd" }
      };

      const result = await executor.execute(step, context);
      expect(result.state).toBe("FAILED");
      expect(result.message).toContain("Invalid protocol");
    });
  });

  describe("DataExecutor", () => {
    it("performs mathematical transformations", async () => {
      const executor = new DataExecutor();
      const context = new RuntimeContext({
        inputs: {}, variables: { price: 100, taxRate: 0.2 }, outputs: {}, artifacts: {}, scopes: [],
        executionMetadata: { runId: "1", tenantId: "1", workflowVersionId: "1" }
      });

      const step: WorkflowV2Step = {
        id: "step1", operation: "TRANSFORM", target: "DATA",
        bind_result_to: "taxAmount",
        args: {
          formula: {
            op: "MULTIPLY",
            left: { type: "VAR", name: "price" },
            right: { type: "VAR", name: "taxRate" }
          },
          variables: {
            price: "{{price}}",
            taxRate: "{{taxRate}}"
          }
        }
      };

      const result = await executor.execute(step, context);
      expect(result.state).toBe("SUCCEEDED");
      expect(result.outputs?.taxAmount).toBe(20);
    });

    it("prevents division by zero", async () => {
      const executor = new DataExecutor();
      const context = new RuntimeContext({
        inputs: {}, variables: { amount: 100, zero: 0 }, outputs: {}, artifacts: {}, scopes: [],
        executionMetadata: { runId: "1", tenantId: "1", workflowVersionId: "1" }
      });

      const step: WorkflowV2Step = {
        id: "step1", operation: "TRANSFORM", target: "DATA",
        args: {
          formula: {
            op: "DIVIDE",
            left: { type: "VAR", name: "amount" },
            right: { type: "VAR", name: "zero" }
          },
          variables: {
            amount: "{{amount}}",
            zero: "{{zero}}"
          }
        }
      };

      const result = await executor.execute(step, context);
      expect(result.state).toBe("FAILED");
      expect(result.message).toContain("Division by zero");
    });
  });
});
