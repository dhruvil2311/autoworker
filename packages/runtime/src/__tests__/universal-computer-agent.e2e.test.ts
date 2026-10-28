import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import * as http from "http";
import { WorkflowRuntime, type ExecutionPersistence } from "../runtime.js";
import { ExecutionPlanner } from "../planner.js";
import { RuntimeContext, RuntimeContextState } from "../context.js";
import { BrowserDeterministicExecutor } from "../executors/browser-deterministic.js";
import { DesktopComputerExecutor } from "../executors/desktop-executor.js";
import { ApiExecutor } from "../executors/api.js";
import { HumanExecutor } from "../executors/human.js";
import { GhostDesktopAgent, MockWindowsUIProvider } from "@ghost/desktop-agent";
import type { WorkflowV2 } from "@ghost/workflow-schema";

describe("Master Demonstration: Universal Computer Agent Closed-Loop Execution", () => {
  let server: http.Server;
  let serverPort: number;
  let portalUrl: string;
  let auditApiUrl: string;

  let agent: GhostDesktopAgent;
  let mockUIProvider: MockWindowsUIProvider;
  let browserExecutor: BrowserDeterministicExecutor;
  let desktopExecutor: DesktopComputerExecutor;
  let apiExecutor: ApiExecutor;
  let humanExecutor: HumanExecutor;

  let persistence: ExecutionPersistence;
  let executionStepsRecord: Array<{ stepId: string; state: string; outputs?: any }>;
  let hitlPauses: Array<{ stepId: string; challengeType: string }>;
  let checkpoints: Array<{ cursor: any; contextState: RuntimeContextState }>;
  let recordedRunState = "";

  beforeAll(async () => {
    return new Promise((resolve) => {
      server = http.createServer((req, res) => {
        if (req.url === "/portal") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>Customer Portal</title></head>
              <body>
                <h1>Acme Enterprise Gateway</h1>
                <div id="customer-id">CUST-8831</div>
                <div id="account-status">ACTIVE</div>
                <form action="/portal/upload" method="POST">
                  <input type="text" id="uploaded-invoice-ref" name="invoiceRef" value="INV-9021" />
                  <button type="submit" id="btn-submit-invoice">Submit Invoice</button>
                </form>
              </body>
            </html>
          `);
        } else if (req.url === "/portal/upload") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <!DOCTYPE html>
            <html>
              <body>
                <div id="confirmation-banner">Invoice INV-9021 processed successfully</div>
              </body>
            </html>
          `);
        } else if (req.url === "/api/audit" && req.method === "POST") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ audit_id: "AUDIT-10921", recorded: true }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      server.listen(0, () => {
        serverPort = (server.address() as any).port;
        portalUrl = `http://localhost:${serverPort}/portal`;
        auditApiUrl = `http://localhost:${serverPort}/api/audit`;
        resolve(undefined);
      });
    });
  });

  afterAll(async () => {
    if (browserExecutor) {
      await browserExecutor.closeAllSessions();
    }
    return new Promise((resolve) => {
      server.close(() => resolve(undefined));
    });
  });

  beforeEach(() => {
    agent = new GhostDesktopAgent({
      cloudConfig: {
        baseUrl: "http://localhost:3000",
        tenantId: "tenant-master-corp",
        agentId: "agent-master-01",
        agentToken: "master_token_sec",
        deviceName: "Dhruvil-Universal-PC"
      },
      useMockProvider: true
    });
    mockUIProvider = agent.windowsProvider as MockWindowsUIProvider;

    browserExecutor = new BrowserDeterministicExecutor();
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

  it("executes unified multi-environment journey: Browser → Excel → ERP → File Explorer → Browser → API without context loss", async () => {
    // 1. Setup multi-window desktop environment
    mockUIProvider.runningApps = [
      { pid: 101, name: "EXCEL.EXE", title: "Sales_Orders.xlsx - Excel" },
      { pid: 202, name: "TallyERP.exe", title: "Enterprise ERP - Invoice Creator" },
      { pid: 303, name: "explorer.exe", title: "File Explorer - C:\\GhostWork\\Invoices" }
    ];

    mockUIProvider.mockElements = [
      // Excel workbook elements
      {
        application: "EXCEL.EXE",
        processId: 101,
        windowTitle: "Sales_Orders.xlsx - Excel",
        controlType: "Edit",
        name: "OrderAmountCell",
        automationId: "Cell_Order_Amount",
        bounds: { x: 140, y: 220, width: 90, height: 25 },
        value: "1450.00",
        enabled: true,
        visible: true
      },
      // ERP software elements
      {
        application: "TallyERP.exe",
        processId: 202,
        windowTitle: "Enterprise ERP - Invoice Creator",
        controlType: "Edit",
        name: "CustomerNumberInput",
        automationId: "txt_cust_no",
        bounds: { x: 220, y: 160, width: 180, height: 30 },
        value: "",
        enabled: true,
        visible: true
      },
      {
        application: "TallyERP.exe",
        processId: 202,
        windowTitle: "Enterprise ERP - Invoice Creator",
        controlType: "Edit",
        name: "InvoiceTotalInput",
        automationId: "txt_inv_total",
        bounds: { x: 220, y: 210, width: 180, height: 30 },
        value: "",
        enabled: true,
        visible: true
      },
      {
        application: "TallyERP.exe",
        processId: 202,
        windowTitle: "Enterprise ERP - Invoice Creator",
        controlType: "Button",
        name: "GenerateInvoiceBtn",
        automationId: "btn_gen_inv",
        bounds: { x: 220, y: 280, width: 140, height: 35 },
        enabled: true,
        visible: true
      },
      {
        application: "TallyERP.exe",
        processId: 202,
        windowTitle: "Enterprise ERP - Invoice Creator",
        controlType: "Text",
        name: "InvoiceResultBadge",
        automationId: "lbl_inv_result",
        value: "INV-9021-CREATED",
        bounds: { x: 220, y: 340, width: 200, height: 25 },
        enabled: true,
        visible: true
      },
      // File Explorer dialog elements
      {
        application: "explorer.exe",
        processId: 303,
        windowTitle: "File Explorer - C:\\GhostWorkspace\\Invoices",
        controlType: "Button",
        name: "ConfirmSaveButton",
        automationId: "btn_explorer_save",
        bounds: { x: 500, y: 400, width: 100, height: 30 },
        enabled: true,
        visible: true
      }
    ];

    // 2. Define the Universal Workflow containing:
    // Browser -> Excel -> Desktop ERP -> File Explorer -> Browser -> API
    const universalWorkflow: WorkflowV2 = {
      workflow_version: "2.0",
      name: "Universal Computer Operator Master Flow",
      description: "Operates customer portal, Excel, enterprise accounting software, and file explorer",
      status: "ACTIVE",
      variables: [],
      secrets: [],
      expected_domains: ["localhost"],
      root_step: {
        id: "master_sequence",
        operation: "SEQUENCE",
        target: "DATA",
        description: "Root Sequence",
        children: [
          // Step 1: Browser -> Look up customer ID on portal
          {
            id: "step_1_browser_nav",
            description: "Open customer portal in browser",
            target: "BROWSER_DETERMINISTIC",
            operation: "NAVIGATE",
            args: { url: portalUrl }
          },
          {
            id: "step_2_browser_extract_customer",
            description: "Extract customer ID from portal DOM",
            target: "BROWSER_DETERMINISTIC",
            operation: "EXTRACT",
            args: { selector: "#customer-id" },
            bind_result_to: "extracted_customer"
          },
          // Step 3: Desktop -> Switch to Excel and read order amount
          {
            id: "step_3_focus_excel",
            description: "Switch application to Excel",
            target: "DESKTOP",
            operation: "DESKTOP_FOCUS_WINDOW",
            args: { windowTitle: "Sales_Orders.xlsx - Excel" }
          },
          {
            id: "step_4_read_excel_amount",
            description: "Read order amount from spreadsheet cell",
            target: "DESKTOP",
            operation: "DESKTOP_READ",
            args: {
              target: {
                strategy: "UIA",
                application: "EXCEL.EXE",
                automationId: "Cell_Order_Amount"
              }
            },
            bind_result_to: "extracted_amount"
          },
          // Step 5: Desktop -> Switch to ERP software and create invoice
          {
            id: "step_5_focus_erp",
            description: "Switch to Enterprise ERP application",
            target: "DESKTOP",
            operation: "DESKTOP_FOCUS_WINDOW",
            args: { windowTitle: "Enterprise ERP - Invoice Creator" }
          },
          {
            id: "step_6_enter_erp_customer",
            description: "Type customer ID into ERP",
            target: "DESKTOP",
            operation: "DESKTOP_TYPE",
            args: {
              target: {
                strategy: "UIA",
                application: "TallyERP.exe",
                automationId: "txt_cust_no"
              },
              value: "{{extracted_customer.extracted}}"
            }
          },
          {
            id: "step_7_enter_erp_amount",
            description: "Type order amount into ERP",
            target: "DESKTOP",
            operation: "DESKTOP_TYPE",
            args: {
              target: {
                strategy: "UIA",
                application: "TallyERP.exe",
                automationId: "txt_inv_total"
              },
              value: "{{extracted_amount.value}}"
            }
          },
          {
            id: "step_8_click_generate_invoice",
            description: "Click generate invoice in ERP with verification",
            target: "DESKTOP",
            operation: "DESKTOP_CLICK",
            args: {
              target: {
                strategy: "UIA",
                application: "TallyERP.exe",
                automationId: "btn_gen_inv"
              },
              expectedState: [
                {
                  type: "element_exists",
                  target: { strategy: "UIA", automationId: "lbl_inv_result" },
                  timeoutMs: 1000
                },
                {
                  type: "value_equals",
                  target: { strategy: "UIA", automationId: "lbl_inv_result" },
                  expectedValue: "INV-9021-CREATED",
                  timeoutMs: 1000
                }
              ]
            }
          },
          // Step 9: File System -> Focus File Explorer and save PDF
          {
            id: "step_9_focus_explorer",
            description: "Focus File Explorer to save generated document",
            target: "DESKTOP",
            operation: "DESKTOP_FOCUS_WINDOW",
            args: { windowTitle: "File Explorer - C:\\GhostWorkspace\\Invoices" }
          },
          {
            id: "step_10_save_file",
            description: "Confirm save in File Explorer",
            target: "DESKTOP",
            operation: "DESKTOP_CLICK",
            args: {
              target: {
                strategy: "UIA",
                application: "explorer.exe",
                automationId: "btn_explorer_save"
              },
              filePath: "C:\\GhostWorkspace\\Invoices\\INV-9021.pdf"
            }
          },
          // Step 11: Browser -> Return to Browser portal, submit invoice, verify confirmation
          {
            id: "step_11_browser_submit",
            description: "Return to browser and submit invoice confirmation",
            target: "BROWSER_DETERMINISTIC",
            operation: "CLICK",
            args: { selector: "#btn-submit-invoice" }
          },
          {
            id: "step_12_browser_verify_result",
            description: "Independently extract and verify portal confirmation",
            target: "BROWSER_DETERMINISTIC",
            operation: "EXTRACT",
            args: { selector: "#confirmation-banner" },
            bind_result_to: "final_portal_confirmation"
          },
          // Step 12: API -> Record audit log
          {
            id: "step_13_audit_api",
            description: "Send audit trail to internal API",
            target: "API",
            operation: "CALL_API",
            args: {
              url: "https://api.acme-corp.com/v1/audit/computer-runs",
              method: "POST",
              body: {
                customerId: "{{extracted_customer.extracted}}",
                orderAmount: "{{extracted_amount.value}}",
                status: "COMPLETED",
                verifiedConfirmation: "{{final_portal_confirmation.extracted}}"
              }
            },
            bind_result_to: "audit_response"
          }
        ]
      },
      compiler: {
        version: "2.0",
        source_specification_id: "master_spec_001",
        compiled_at: new Date().toISOString()
      }
    };

    // Mock global fetch for external audit API step
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async (url: any, opts: any) => {
      if (String(url).includes("api.acme-corp.com")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ audit_id: "AUDIT-10921", recorded: true })
        };
      }
      return originalFetch(url, opts);
    });

    const planner = new ExecutionPlanner();
    const plan = planner.createPlan("master_demo_plan", universalWorkflow);

    const contextState: RuntimeContextState = {
      inputs: {},
      variables: {},
      outputs: {},
      artifacts: {},
      scopes: [],
      executionMetadata: {
        runId: "run_master_demo_001",
        tenantId: "tenant-master-corp",
        workflowVersionId: "wf_master_v1"
      }
    };

    const runtime = new WorkflowRuntime(
      plan,
      persistence,
      [browserExecutor, desktopExecutor, apiExecutor, humanExecutor],
      contextState
    );

    try {
      // 3. Execute closed-loop Universal Agent
      await runtime.start();

      // 4. Assertions: Entire journey completed with terminal SUCCEEDED
      expect(recordedRunState).toBe("SUCCEEDED");

      // 5. Verify Context & Variable Handoff across transitions
      const ctx = runtime.getContext();
      expect(ctx.get("extracted_customer.extracted")).toBe("CUST-8831");
      expect(ctx.get("extracted_amount.value")).toBe("1450.00");
      expect(ctx.get("final_portal_confirmation.extracted")).toBe("Invoice INV-9021 processed successfully");
      const auditId = ctx.get("audit_response.data.audit_id") || ctx.get("audit_response.audit_id") || ctx.get("data.audit_id");
      // 6. Verify Universal State was tracked without breaking
      const browserCtx = ctx.getBrowserContext();
      expect(browserCtx.currentUrl).toBeDefined();
      expect(browserCtx.isRunning).toBe(true);

      const desktopCtx = ctx.getDesktopContext();
      expect(desktopCtx.activeApplication).toBe("explorer.exe");

      const fileCtx = ctx.getFileContext();
      expect(fileCtx.recentFiles).toContain("C:\\GhostWorkspace\\Invoices\\INV-9021.pdf");
    } finally {
      global.fetch = originalFetch;
    }
  }, 45000);

  it("handles intentional unexpected UI missing element: attempts recovery, pauses for HITL, allows human takeover, re-observes machine, and resumes to completion", async () => {
    // 1. Initial desktop mock environment where the button has moved / is missing
    mockUIProvider.runningApps = [
      { pid: 501, name: "TallyERP.exe", title: "Enterprise ERP - Order Processing" }
    ];

    mockUIProvider.mockElements = [
      {
        application: "TallyERP.exe",
        processId: 501,
        windowTitle: "Enterprise ERP - Order Processing",
        controlType: "Edit",
        name: "OrderReferenceInput",
        automationId: "txt_order_ref",
        bounds: { x: 200, y: 150, width: 160, height: 30 },
        value: "ORD-9901",
        enabled: true,
        visible: true
      }
    ];

    const failingWorkflow: WorkflowV2 = {
      workflow_version: "2.0",
      name: "Missing UI Button Workflow",
      description: "Validates closed loop failure handling and human takeover",
      status: "ACTIVE",
      variables: [],
      secrets: [],
      expected_domains: [],
      root_step: {
        id: "seq_hitl_root",
        operation: "SEQUENCE",
        target: "DATA",
        description: "Sequence Root",
        children: [
          {
            id: "step_click_missing_approve",
            description: "Click Approve Order button (intentionally missing)",
            target: "DESKTOP",
            operation: "DESKTOP_CLICK",
            failure_policy: {
              on_failure: "PAUSE_FOR_HUMAN"
            },
            args: {
              target: {
                strategy: "UIA",
                application: "TallyERP.exe",
                name: "MissingApproveButton"
              }
            }
          },
          {
            id: "step_verify_approved",
            description: "Verify approval status",
            target: "DESKTOP",
            operation: "DESKTOP_READ",
            args: {
              target: {
                strategy: "UIA",
                application: "TallyERP.exe",
                automationId: "txt_status_badge"
              }
            },
            bind_result_to: "order_status"
          }
        ]
      },
      compiler: {
        version: "2.0",
        source_specification_id: "spec_hitl_001",
        compiled_at: new Date().toISOString()
      }
    };

    const planner = new ExecutionPlanner();
    const plan = planner.createPlan("plan_hitl_recovery", failingWorkflow);

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
          runId: "run_hitl_takeover_001",
          tenantId: "tenant-master-corp",
          workflowVersionId: "wf_hitl_v1"
        }
      }
    );

    // 2. Ghost begins execution -> encounters missing element -> fails safely and pauses for human
    await runtime.start();
    expect(recordedRunState).toBe("WAITING_FOR_HUMAN");
    expect(hitlPauses.length).toBeGreaterThan(0);

    // 3. Human initiates Takeover (AnyDesk style control transfer)
    const takeoverSessionId = agent.initiateHumanTakeover("Operator relocating approval button in ERP");
    expect(takeoverSessionId).toBeDefined();
    expect(agent.status).toBe("WAITING_FOR_HUMAN");
    expect(agent.takeoverManager.isUnderHumanControl()).toBe(true);

    // 4. Human performs the fix on the computer (simulated by adding the relocated element & status badge)
    mockUIProvider.mockElements.push({
      application: "TallyERP.exe",
      processId: 501,
      windowTitle: "Enterprise ERP - Order Processing",
      controlType: "Button",
      name: "RelocatedApproveButton",
      automationId: "btn_approve_v2",
      bounds: { x: 300, y: 250, width: 120, height: 35 },
      enabled: true,
      visible: true
    });
    mockUIProvider.mockElements.push({
      application: "TallyERP.exe",
      processId: 501,
      windowTitle: "Enterprise ERP - Order Processing",
      controlType: "Text",
      name: "StatusBadge",
      automationId: "txt_status_badge",
      value: "APPROVED",
      bounds: { x: 300, y: 300, width: 120, height: 25 },
      enabled: true,
      visible: true
    });

    // 5. Operator captures human correction for Ghost's learning memory
    const correction = agent.takeoverManager.captureCorrection({
      workerId: "agent-master-01",
      runId: "run_hitl_takeover_001",
      stepId: "step_click_missing_approve",
      correctionType: "corrected_selector",
      originalAction: { target: "MissingApproveButton" },
      correctedAction: { target: "RelocatedApproveButton", automationId: "btn_approve_v2" },
      application: "TallyERP.exe",
      notes: "Button relocated to secondary toolbar in ERP build 2026.4"
    });
    expect(correction.category).toBe("UI_MEMORY");
    expect(correction.structuredData.confidence).toBe(1.0);

    // 6. User releases control -> MANDATORY RE-OBSERVATION of machine before resuming
    const reobservedState = await agent.releaseControlAndReObserve("checkpoint_before_approve");
    expect(reobservedState.stateVerified).toBe(true);
    expect(reobservedState.visibleElementCount).toBe(3); // txt_order_ref, btn_approve_v2, txt_status_badge
    expect(agent.status).toBe("IDLE");
    expect(agent.takeoverManager.isUnderHumanControl()).toBe(false);

    // 7. Recompile workflow with corrected selector knowledge and resume execution
    failingWorkflow.root_step.children![0]!.args = {
      target: {
        strategy: "UIA",
        application: "TallyERP.exe",
        automationId: "btn_approve_v2",
        name: "RelocatedApproveButton"
      }
    };

    const resumedPlan = planner.createPlan("plan_hitl_resumed", failingWorkflow);
    const resumedRuntime = new WorkflowRuntime(
      resumedPlan,
      persistence,
      [desktopExecutor, humanExecutor],
      runtime.getContext().getState()
    );

    await resumedRuntime.start();

    // 8. Assertions: Succeeded and verified final state
    expect(recordedRunState).toBe("SUCCEEDED");
    expect(resumedRuntime.getContext().get("order_status.value")).toBe("APPROVED");
  }, 35000);
});
