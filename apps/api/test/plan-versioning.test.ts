import { describe, it, expect, vi } from "vitest";
import { WorkflowCompiler } from "../src/compiler.js";

describe("Execution Plan Versioning", () => {
  it("retains the same BPS version but generates a new execution plan version", async () => {
    const mockBPS: any = {
      id: "bps-versioned",
      status: "APPROVED",
      identity: { name: "Test" },
      intent: "Test",
      systems: [],
      dataFlow: [],
      transformations: [],
      variables: {},
      unresolvedGaps: []
    };

    const compiler = new WorkflowCompiler({} as any);
    const wf1 = await compiler.compile(mockBPS, { version: "3.5" }); // Without plan (Defaults to structure)
    const wf2 = await compiler.compile(mockBPS, { version: "3.5" }, { steps: [{ description: "x", semanticOperationId: "o", fallbackChain: [] }] });

    expect(wf1.root_step.children![0].id).toBe("step_navigate");
    expect(wf2.root_step.children![0].id).toBe("step_exec_0");
    
    expect(wf1.compiler.source_specification_id).toBe("bps-versioned");
    expect(wf2.compiler.source_specification_id).toBe("bps-versioned");
  });
});
