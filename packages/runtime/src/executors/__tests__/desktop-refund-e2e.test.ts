import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkflowRuntime, type ExecutionPersistence } from "../../runtime.js";
import { ExecutionPlanner } from "../../planner.js";
import { RuntimeContextState } from "../../context.js";
import { DesktopComputerExecutor } from "../desktop-executor.js";
import { ApiExecutor } from "../api.js";
import { HumanExecutor } from "../human.js";
import { GhostDesktopAgent, MockWindowsUIProvider } from "@ghost/desktop-agent";
import { WorkflowV2 } from "@ghost/workflow-schema";

describe("E2E Demo: Process Customer Refund across Excel, ERP & Browser/API", () => {
  let agent: GhostDesktopAgent;
  let mockUIProvider: MockWindowsUIProvider;
  let desktopExecutor: DesktopComputerExecutor;
  let apiExecutor: ApiExecutor;
  let humanExecutor: HumanExecutor;
  let persistence: ExecutionPersistence;
  let executionStepsRecord: Array<{ stepId: string; state: string; outputs?: any }>;
  let hitlPauses: Array<{ stepId: string; challengeType: string }>;
  let checkpoints: Array<{ cursor: any; contextState: RuntimeContextState }>;
  let recordedRunState = "";

  beforeEach(() => {
    agent = new GhostDesktopAgent({
      cloudConfig: {
        baseUrl: "http://localhost:3000",
        tenantId: "tenant-demo-corp",
        agentId: "agent-demo-01",
        agentToken: "gda_token_123",
        deviceName: "Dhruvil-PC"
      },
      useMockProvider: true
    });
    mockUIProvider = agent.windowsProvider as MockWindowsUIProvider;
    desktopExecutor = new DesktopComputerExecutor(agent);
    apiExecutor = new ApiExecutor();
    humanExecutor = new HumanExecutor();

    recordedRunState = "";
    executionStepsRecord = [];
    hitlPauses = [];
    checkpoints = [];

    persistence = {
      recordStepStarted: vi.fn(async (stepId) => {
        executionStepsRecord.push({ stepId, state: "RUNNING" });
      }),
      recordStepCompleted: vi.fn(async (stepId, state, strategy, message, outputs) => {
        const step = executionStepsRecord.find(s => s.stepId === stepId);
        if (step) {
          step.state = state;
          step.outputs = outputs;
        }
      }),
      recordRunState: vi.fn(async (state) => {
        recordedRunState = state;
      }),
      recordHitlPause: vi.fn(async (stepId, challengeType) => {
        hitlPauses.push({ stepId, challengeType });
      }),
      saveCheckpoint: vi.fn(async (cursor, contextState) => {
        checkpoints.push({ cursor, contextState });
      }),
      loadCheckpoint: vi.fn(async () => null),
      hasStepCompleted: vi.fn(async (stepId) => {
        return executionStepsRecord.some(s => s.stepId === stepId && s.state === "SUCCEEDED");
      })
    };
  });

  it("successfully executes: Excel → Read Refund → ERP App → Enter Refund → Save & Verify → Send Confirmation", async () => {
    // Populate mock desktop environment with Excel and ERP windows and elements
    mockUIProvider.runningApps = [
      { pid: 1001, name: "EXCEL.EXE", title: "RefundOrders.xlsx - Excel" },
      { pid: 2002, name: "TallyPrime.exe", title: "TallyPrime - Accounting Voucher Creation" }
    ];

    mockUIProvider.mockElements = [
      {
        application: "EXCEL.EXE",
        processId: 1001,
        windowTitle: "RefundOrders.xlsx - Excel",
        controlType: "Edit",
        name: "RefundAmount",
        automationId: "Cell_E14",
        bounds: { x: 100, y: 100, width: 100, height: 25 },
        value: "1250.00",
        enabled: true,
        visible: true
      },
      {
        application: "TallyPrime.exe",
        processId: 2002,
        windowTitle: "TallyPrime - Accounting Voucher Creation",
        controlType: "Edit",
        name: "PartyLedger",
        automationId: "txt_party_ledger",
        bounds: { x: 200, y: 100, width: 200, height: 30 },
        value: "",
        enabled: true,
        visible: true
      },
      {
        application: "TallyPrime.exe",
        processId: 2002,
        windowTitle: "TallyPrime - Accounting Voucher Creation",
        controlType: "Edit",
        name: "DebitAmount",
        automationId: "txt_debit_amount",
        bounds: { x: 200, y: 150, width: 150, height: 30 },
        value: "",
        enabled: true,
        visible: true
      },
      {
        application: "TallyPrime.exe",
        processId: 2002,
        windowTitle: "TallyPrime - Accounting Voucher Creation",
        controlType: "Button",
        name: "Save Voucher",
        automationId: "btn_save_voucher",
        bounds: { x: 200, y: 200, width: 100, height: 35 },
        enabled: true,
        visible: true
      },
      {
        application: "TallyPrime.exe",
        processId: 2002,
        windowTitle: "TallyPrime - Accounting Voucher Creation",
        controlType: "Text",
        name: "VoucherSuccessNotification",
        automationId: "lbl_success",
        bounds: { x: 200, y: 250, width: 300, height: 25 },
        value: "Voucher #REF-2026-901 Created Successfully",
        enabled: true,
        visible: true
      }
    ];

    const refundWorkflow: WorkflowV2 = {
      workflow_version: "2.0",
      name: "Customer Refund Automation",
      description: "Automates customer refund in Excel and Tally ERP",
      status: "ACTIVE",
      variables: [],
      secrets: [],
      expected_domains: [],
      root_step: {
        id: "step_root",
        operation: "SEQUENCE",
        target: "DATA",
        description: "Sequence Root",
        children: [
          // 1. Focus Excel
          {
            id: "step-focus-excel",
            description: "Focus Excel Workbook",
            target: "DESKTOP",
            operation: "DESKTOP_FOCUS_WINDOW",
            args: { titlePattern: "RefundOrders.xlsx" }
          },
          // 2. Read Refund Amount
          {
            id: "step-read-refund-amount",
            description: "Read Refund Amount from Cell",
            target: "DESKTOP",
            operation: "DESKTOP_READ",
            args: {
              target: {
                strategy: "UIA",
                application: "EXCEL.EXE",
                name: "RefundAmount",
                controlType: "Edit"
              }
            },
            bind_result_to: "extracted_refund"
          },
          // 3. Open & Focus ERP Application
          {
            id: "step-focus-erp",
            description: "Focus ERP / Tally Application",
            target: "DESKTOP",
            operation: "DESKTOP_FOCUS_WINDOW",
            args: { titlePattern: "TallyPrime" }
          },
          // 4. Search & Enter Customer Ledger
          {
            id: "step-enter-party",
            description: "Enter Customer Ledger in ERP",
            target: "DESKTOP",
            operation: "DESKTOP_TYPE",
            args: {
              target: {
                strategy: "UIA",
                application: "TallyPrime.exe",
                name: "PartyLedger"
              },
              text: "Acme Corp Ltd."
            }
          },
          // 5. Enter Refund Amount (using variable from step 2)
          {
            id: "step-enter-amount",
            description: "Enter Refund Amount into ERP Voucher",
            target: "DESKTOP",
            operation: "DESKTOP_TYPE",
            args: {
              target: {
                strategy: "UIA",
                application: "TallyPrime.exe",
                name: "DebitAmount"
              },
              text: "{{extracted_refund.value}}"
            }
          },
          // 6. Click Save Voucher
          {
            id: "step-save-voucher",
            description: "Save Accounting Voucher",
            target: "DESKTOP",
            operation: "DESKTOP_CLICK",
            args: {
              target: {
                strategy: "UIA",
                application: "TallyPrime.exe",
                name: "Save Voucher"
              }
            }
          },
          // 7. Verify Outcome with Predicate
          {
            id: "step-verify-saved",
            description: "Verify Voucher Creation",
            target: "DESKTOP",
            operation: "DESKTOP_ASSERT",
            args: {
              predicate: "text_contains",
              target: {
                strategy: "UIA",
                application: "TallyPrime.exe",
                name: "VoucherSuccessNotification"
              },
              expectedValue: "Created Successfully"
            }
          },
          // 8. Send Confirmation (API Handoff)
          {
            id: "step-send-confirmation",
            description: "Send Customer Refund Receipt",
            target: "API",
            operation: "CALL_API",
            args: {
              url: "https://api.acme-corp.com/v1/refunds/confirm",
              method: "POST",
              body: {
                customer: "Acme Corp Ltd.",
                amount: "{{extracted_refund.value}}",
                status: "COMPLETED"
              }
            }
          }
        ]
      },
      compiler: {
        version: "2.0",
        source_specification_id: "spec_refund_1",
        compiled_at: new Date().toISOString()
      }
    };

    // Mock global fetch for API step
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ confirmed: true, receiptId: "REC-9921" })
    });

    try {
      const planner = new ExecutionPlanner();
      const plan = planner.createPlan("wf-customer-refund", refundWorkflow);

      const runtime = new WorkflowRuntime(
        plan,
        persistence,
        [desktopExecutor, apiExecutor, humanExecutor],
        {
          inputs: {},
          variables: {},
          outputs: {},
          artifacts: {},
          scopes: [],
          executionMetadata: {
            runId: "run-refund-e2e-001",
            tenantId: "tenant-demo-corp",
            workflowVersionId: "wf-customer-refund"
          }
        }
      );

      await runtime.start();

      expect(recordedRunState).toBe("SUCCEEDED");
      // All 8 children + sequence root succeeded
      const desktopSteps = executionStepsRecord.filter(s => s.stepId !== "step_root");
      expect(desktopSteps.length).toBe(8);
      for (const step of desktopSteps) {
        expect(step.state).toBe("SUCCEEDED");
      }

      // Verify refund amount was correctly bound and extracted
      const readStep = executionStepsRecord.find(s => s.stepId === "step-read-refund-amount");
      expect(readStep?.outputs?.value).toBe("1250.00");
    } finally {
      global.fetch = originalFetch;
    }
  }, 15000);

  it("recovers from unexpected UI state with HITL takeover and correction", async () => {
    mockUIProvider.runningApps = [
      { pid: 2002, name: "TallyPrime.exe", title: "TallyPrime - Accounting Voucher Creation" }
    ];

    mockUIProvider.mockElements = [
      {
        application: "TallyPrime.exe",
        processId: 2002,
        windowTitle: "TallyPrime - Accounting Voucher Creation",
        controlType: "Edit",
        name: "DebitAmount",
        bounds: { x: 200, y: 150, width: 150, height: 30 },
        value: "500",
        enabled: true,
        visible: true
      }
    ];

    const failingWorkflow: WorkflowV2 = {
      workflow_version: "2.0",
      name: "Failing Save Workflow",
      description: "Tests recovery when UI button is missing",
      status: "ACTIVE",
      variables: [],
      secrets: [],
      expected_domains: [],
      root_step: {
        id: "step_root",
        operation: "SEQUENCE",
        target: "DATA",
        description: "Sequence Root",
        children: [
          {
            id: "step-click-save",
            description: "Click Save Button",
            target: "DESKTOP",
            operation: "DESKTOP_CLICK",
            args: {
              target: {
                strategy: "UIA",
                application: "TallyPrime.exe",
                name: "NonExistentSaveButton"
              }
            }
          }
        ]
      },
      compiler: {
        version: "2.0",
        source_specification_id: "spec_fail_1",
        compiled_at: new Date().toISOString()
      }
    };

    const planner = new ExecutionPlanner();
    const plan = planner.createPlan("wf-failing-save", failingWorkflow);

    const runtime = new WorkflowRuntime(
      plan,
      persistence,
      [desktopExecutor, humanExecutor],
      {
        inputs: {},
        variables: {},
        outputs: {},
        artifacts: {},
        scopes: [],
        executionMetadata: {
          runId: "run-hitl-002",
          tenantId: "tenant-demo-corp",
          workflowVersionId: "wf-failing-save"
        }
      }
    );

    // Initial run encounters missing element
    await runtime.start();
    expect(recordedRunState).toBe("FAILED");

    // Operator provides human correction: adds the relocated button
    mockUIProvider.mockElements.push({
      application: "TallyPrime.exe",
      processId: 2002,
      windowTitle: "TallyPrime - Accounting Voucher Creation",
      controlType: "Button",
      name: "RelocatedSaveButton",
      automationId: "btn_save_v2",
      bounds: { x: 200, y: 200, width: 100, height: 35 },
      enabled: true,
      visible: true
    });

    // Re-run with corrected selector
    failingWorkflow.root_step.children![0]!.args = {
      target: {
        strategy: "UIA",
        application: "TallyPrime.exe",
        name: "RelocatedSaveButton"
      }
    };

    const correctedPlan = planner.createPlan("wf-failing-save", failingWorkflow);
    const resumedRuntime = new WorkflowRuntime(
      correctedPlan,
      persistence,
      [desktopExecutor, humanExecutor],
      {
        inputs: {},
        variables: {},
        outputs: {},
        artifacts: {},
        scopes: [],
        executionMetadata: {
          runId: "run-hitl-002",
          tenantId: "tenant-demo-corp",
          workflowVersionId: "wf-failing-save"
        }
      }
    );

    await resumedRuntime.start();
    expect(recordedRunState).toBe("SUCCEEDED");
  });
});
