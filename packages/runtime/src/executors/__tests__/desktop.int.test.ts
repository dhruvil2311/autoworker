import { describe, it, expect, beforeEach } from "vitest";
import { DesktopComputerExecutor } from "../desktop-executor.js";
import { RuntimeContext, VariableResolver } from "../../context.js";
import { WorkflowRuntime, type ExecutionPersistence } from "../../runtime.js";
import { ExecutionPlanner } from "../../planner.js";
import { GhostDesktopAgent } from "@ghost/desktop-agent";
import type { WorkflowV2, WorkflowV2Step } from "@ghost/workflow-schema";

describe("DesktopComputerExecutor Integration", () => {
  let agent: GhostDesktopAgent;
  let executor: DesktopComputerExecutor;
  let context: RuntimeContext;

  it("resolves nested variable path", () => {
    const ctx = new RuntimeContext({
      inputs: {},
      variables: {},
      outputs: {},
      artifacts: {},
      scopes: [],
      executionMetadata: { runId: "1", tenantId: "1", workflowVersionId: "1" }
    });
    ctx.set("extracted_amount", { value: "450.00" });
    const resolver = new VariableResolver(ctx);
    expect(resolver.resolve("{{extracted_amount.value}}")).toBe("450.00");
  });

  beforeEach(() => {
    agent = new GhostDesktopAgent({
      cloudConfig: {
        baseUrl: "http://localhost:3000",
        tenantId: "tenant_1",
        agentId: "agent_1",
        agentToken: "gda_token_123",
        deviceName: "Dhruvil-PC"
      },
      useMockProvider: true
    });
    executor = new DesktopComputerExecutor(agent);
    context = new RuntimeContext({
      inputs: {
        amount: "520.00",
        customerName: "Acme Logistics"
      },
      variables: {},
      outputs: {},
      artifacts: {},
      scopes: [],
      executionMetadata: {
        runId: "run_test_123",
        tenantId: "tenant_1",
        workflowVersionId: "wv_1"
      }
    });
  });

  it("identifies desktop targets and operations correctly in canExecute", () => {
    expect(executor.canExecute({ target: "DESKTOP", operation: "ACT", id: "1", description: "" })).toBe(true);
    expect(executor.canExecute({ target: "DESKTOP_COMPUTER", operation: "ACT", id: "2", description: "" })).toBe(true);
    expect(executor.canExecute({ target: "DATA", operation: "DESKTOP_CLICK", id: "3", description: "" })).toBe(true);
    expect(executor.canExecute({ target: "DATA", operation: "CLICK_UI_ELEMENT", id: "4", description: "" })).toBe(true);
    expect(executor.canExecute({ target: "API", operation: "CALL_API", id: "5", description: "" })).toBe(false);
  });

  it("resolves template variables and executes action on desktop agent", async () => {
    const step: WorkflowV2Step = {
      id: "step_type_amount",
      target: "DESKTOP",
      operation: "TYPE_IN_FIELD",
      description: "Enter refund amount in Tally",
      args: {
        application: "TallyPrime.exe",
        target: { strategy: "UIA", automationId: "Tally_Amount_Field" },
        text: "{{amount}}",
        expectedState: [
          {
            type: "element_exists",
            target: { strategy: "UIA", automationId: "Tally_Amount_Field" }
          }
        ]
      }
    };

    const result = await executor.execute(step, context);
    expect(result.state).toBe("SUCCEEDED");
  });

  it("propagates PAUSED_FOR_HUMAN when verification predicate fails", async () => {
    const step: WorkflowV2Step = {
      id: "step_verify_fail",
      target: "DESKTOP",
      operation: "DESKTOP_CLICK",
      description: "Click Save with missing state",
      args: {
        application: "TallyPrime.exe",
        target: { strategy: "UIA", automationId: "Tally_Save_Btn" },
        expectedState: [
          {
            type: "text_contains",
            expectedValue: "NonExistentSuccessBanner"
          }
        ]
      }
    };

    const result = await executor.execute(step, context);
    expect(result.state).toBe("PAUSED_FOR_HUMAN");
    expect(result.hitlReason).toBe("VERIFICATION_FAILED");
  });

  it("runs within full WorkflowRuntime engine", async () => {
    const workflow: WorkflowV2 = {
      workflow_version: "2.0",
      name: "Desktop Refund Workflow",
      description: "Reads Excel and inputs to Tally",
      status: "ACTIVE",
      variables: [
        { name: "amount", type: "string", required: true, default_value: "450.00" }
      ],
      secrets: [],
      expected_domains: [],
      root_step: {
        id: "step_root",
        operation: "SEQUENCE",
        target: "DATA",
        description: "Sequence Root",
        children: [
          {
            id: "step_1_read_excel",
            operation: "READ_FIELD",
            target: "DESKTOP",
            description: "Read refund amount from Excel",
            args: {
              application: "EXCEL.EXE",
              target: { strategy: "UIA", automationId: "Excel_Refund_Amount_Cell" }
            },
            bind_result_to: "extracted_amount"
          },
          {
            id: "step_2_type_tally",
            operation: "TYPE_IN_FIELD",
            target: "DESKTOP",
            description: "Type amount in Tally",
            args: {
              application: "TallyPrime.exe",
              target: { strategy: "UIA", automationId: "Tally_Amount_Field" },
              text: "{{extracted_amount.value}}"
            }
          }
        ]
      },
      compiler: {
        version: "2.0",
        source_specification_id: "spec_1",
        compiled_at: new Date().toISOString()
      }
    };

    const stepsStarted: string[] = [];
    const stepsCompleted: string[] = [];
    let recordedRunState = "";

    const persistence: ExecutionPersistence = {
      recordStepStarted: async (s) => { stepsStarted.push(s); },
      recordStepCompleted: async (s, state) => { stepsCompleted.push(`${s}:${state}`); },
      recordRunState: async (state) => { recordedRunState = state; },
      recordHitlPause: async (stepId, challenge) => { console.log('HITL PAUSED:', stepId, challenge); },
      saveCheckpoint: async () => {},
      loadCheckpoint: async () => null,
      hasStepCompleted: async () => false
    };

    const planner = new ExecutionPlanner();
    const plan = planner.createPlan("wv_1", workflow);

    const runtime = new WorkflowRuntime(plan, persistence, [executor]);
    await runtime.start();

    expect(recordedRunState).toBe("SUCCEEDED");
    expect(stepsStarted).toEqual(["step_1_read_excel", "step_2_type_tally"]);
    expect(stepsCompleted).toEqual([
      "step_1_read_excel:SUCCEEDED",
      "step_2_type_tally:SUCCEEDED"
    ]);
    expect(runtime.getContext().get("extracted_amount")).toEqual({
      value: "450.00",
      redactedValue: "450.00"
    });
  });
});
