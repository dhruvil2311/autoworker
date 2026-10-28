import { describe, it, expect, beforeEach } from "vitest";
import { MockWindowsUIProvider } from "../windows/provider.js";
import { MouseController } from "../mouse/mouse-controller.js";
import { KeyboardController } from "../keyboard/keyboard-controller.js";
import { TargetingResolver } from "../targeting/targeting-resolver.js";
import { ObservationEngine } from "../observation/observation-engine.js";
import { VerificationEngine } from "../verification/verification-engine.js";
import { SecurityPolicy } from "../security/security-policy.js";
import { ApplicationRegistry } from "../registry/application-registry.js";
import { DesktopRecorder } from "../recorder/desktop-recorder.js";
import { TakeoverManager } from "../hitl/takeover-manager.js";
import { DesktopExecutionEngine } from "../execution/execution-engine.js";
import { GhostDesktopAgent } from "../agent/desktop-agent.js";
import { MockOCRProvider, MockComputerVisionProvider } from "../vision/vision-provider.js";
import type { DesktopActionPayload } from "@ghost/workflow-schema";

describe("Desktop Agent Execution Layer", () => {
  let mockProvider: MockWindowsUIProvider;
  let mouseController: MouseController;
  let keyboardController: KeyboardController;
  let ocrProvider: MockOCRProvider;
  let visionProvider: MockComputerVisionProvider;
  let targetingResolver: TargetingResolver;
  let observationEngine: ObservationEngine;
  let verificationEngine: VerificationEngine;
  let securityPolicy: SecurityPolicy;
  let appRegistry: ApplicationRegistry;
  let executionEngine: DesktopExecutionEngine;

  beforeEach(() => {
    mockProvider = new MockWindowsUIProvider();
    mouseController = new MouseController();
    keyboardController = new KeyboardController();
    ocrProvider = new MockOCRProvider([
      {
        text: "Submit Order",
        confidence: 0.94,
        bounds: { x: 400, y: 500, width: 120, height: 40 }
      }
    ]);
    visionProvider = new MockComputerVisionProvider();
    targetingResolver = new TargetingResolver(mockProvider, ocrProvider, visionProvider);
    observationEngine = new ObservationEngine(mockProvider);
    verificationEngine = new VerificationEngine(observationEngine);
    securityPolicy = new SecurityPolicy();
    appRegistry = new ApplicationRegistry();

    executionEngine = new DesktopExecutionEngine(
      mockProvider,
      mouseController,
      keyboardController,
      targetingResolver,
      observationEngine,
      verificationEngine,
      securityPolicy,
      appRegistry
    );
  });

  describe("Targeting Hierarchy", () => {
    it("resolves target via Windows UI Automation when element exists", async () => {
      const target = await targetingResolver.resolveTarget({
        strategy: "UIA",
        automationId: "Excel_Refund_Amount_Cell"
      });

      expect(target.strategyUsed).toBe("UIA");
      expect(target.confidence).toBeGreaterThan(0.95);
      expect(target.centerCoordinates).toEqual({ x: 170, y: 262.5 });
      expect(target.elementName).toBe("Refund Amount");
    });

    it("falls back to OCR when UIA element is not found", async () => {
      const target = await targetingResolver.resolveTarget(
        {
          strategy: "OCR",
          ocrText: "Submit Order"
        },
        "fake-screenshot-data"
      );

      expect(target.strategyUsed).toBe("OCR");
      expect(target.confidence).toBe(0.94);
      expect(target.centerCoordinates).toEqual({ x: 460, y: 520 });
    });

    it("falls back to Vision localization when requested", async () => {
      const target = await targetingResolver.resolveTarget(
        {
          strategy: "VISION",
          visionPrompt: "Save button icon"
        },
        "fake-screenshot-data"
      );

      expect(target.strategyUsed).toBe("VISION");
      expect(target.confidence).toBeGreaterThanOrEqual(0.85);
      expect(target.centerCoordinates).toBeDefined();
    });

    it("falls back to coordinate targeting as last resort", async () => {
      const target = await targetingResolver.resolveTarget({
        strategy: "COORDINATE",
        coordinate: { x: 847, y: 512 }
      });

      expect(target.strategyUsed).toBe("COORDINATE");
      expect(target.centerCoordinates).toEqual({ x: 847, y: 512 });
      expect(target.evidence).toBeDefined();
      expect(target.evidence.strategyUsed).toBe("COORDINATE");
    });

    it("returns structured evidence with strategy rank and details", async () => {
      const target = await targetingResolver.resolveTarget({
        strategy: "UIA",
        automationId: "Excel_Refund_Amount_Cell"
      });

      expect(target.evidence).toBeDefined();
      expect(target.evidence.strategyUsed).toBe("UIA");
      expect(target.evidence.strategyRank).toBeGreaterThan(0);
      expect(target.evidence.matchedDetails).toBeDefined();
      expect(target.evidence.timestamp).toBeDefined();
    });

    it("supports configurable targeting hierarchy order", () => {
      const customOrder = ["OCR" as const, "UIA" as const, "COORDINATE" as const];
      targetingResolver.setHierarchyOrder(customOrder);
      expect(targetingResolver.getHierarchyOrder()).toEqual(customOrder);
    });
  });

  describe("Observation and State Verification Loop", () => {
    it("successfully verifies element_exists and value_equals predicates", async () => {
      const state = await observationEngine.observeCurrentState();
      const result = await verificationEngine.verify(
        [
          {
            type: "element_exists",
            target: { strategy: "UIA", automationId: "Excel_Refund_Amount_Cell" },
            timeoutMs: 1000
          },
          {
            type: "value_equals",
            target: { strategy: "UIA", automationId: "Excel_Refund_Amount_Cell" },
            expectedValue: "450.00",
            timeoutMs: 1000
          }
        ],
        state
      );

      expect(result.verified).toBe(true);
      expect(result.checks.length).toBe(2);
      expect(result.checks.every(c => c.passed)).toBe(true);
    });

    it("detects verification failure and returns recommended recovery action", async () => {
      const state = await observationEngine.observeCurrentState();
      const result = await verificationEngine.verify(
        [
          {
            type: "text_contains",
            expectedValue: "NonExistentConfirmationBanner",
            timeoutMs: 1000
          }
        ],
        state
      );

      expect(result.verified).toBe(false);
      expect(result.failureReason).toContain("NonExistentConfirmationBanner");
      expect(result.recommendedAction).toBe("RETRY");
    });
  });

  describe("Security Policy, Sandbox, and PII Redaction", () => {
    it("blocks access to restricted operating system directories", () => {
      const check = securityPolicy.assertFileAccessAllowed("C:\\Windows\\System32\\cmd.exe");
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain("FILESYSTEM_ACCESS_DENIED");
    });

    it("blocks execution of unapproved executable applications", () => {
      const check = securityPolicy.assertExecutionAllowed("DESKTOP_CLICK", "LOW", "malware.exe");
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain("SECURITY_VIOLATION");
    });

    it("enforces human confirmation for CRITICAL risk actions", () => {
      const check = securityPolicy.assertExecutionAllowed("TRANSFER_FUNDS", "CRITICAL", "TallyPrime.exe");
      expect(check.allowed).toBe(false);
      expect(check.requiresHumanApproval).toBe(true);
      expect(check.reason).toContain("CRITICAL_ACTION");
    });

    it("redacts sensitive credit card, OTP, and secret tokens from text", () => {
      const rawText = "Customer paid with 4111 2222 3333 4444 and entered OTP: 839201 using sk-abcdef1234567890abcdef1234567890";
      const redacted = securityPolicy.redactSensitiveData(rawText);
      expect(redacted).not.toContain("4111 2222 3333 4444");
      expect(redacted).not.toContain("839201");
      expect(redacted).not.toContain("sk-abcdef");
      expect(redacted).toContain("[REDACTED_CREDIT_CARD]");
      expect(redacted).toContain("[REDACTED_OTP]");
      expect(redacted).toContain("[REDACTED_SECRET]");
    });
  });

  describe("Teach Mode Desktop Recording to Semantic Trace", () => {
    it("converts raw click and type events into semantic business actions", () => {
      const recorder = new DesktopRecorder(mockProvider);
      recorder.startRecording();

      recorder.recordEvent({
        eventType: "APP_LAUNCH",
        application: "Microsoft Excel",
        windowTitle: "Sales_Orders.xlsx - Excel"
      });

      recorder.recordEvent({
        eventType: "MOUSE_CLICK",
        application: "Microsoft Excel",
        uiElement: mockProvider.mockElements[0] // Refund Amount cell
      });

      recorder.recordEvent({
        eventType: "APP_LAUNCH",
        application: "TallyPrime",
        windowTitle: "TallyPrime - Gateway of Tally"
      });

      recorder.recordEvent({
        eventType: "KEYBOARD_INPUT",
        application: "TallyPrime",
        inputValue: "Acme Corp",
        uiElement: mockProvider.mockElements[1] // Search customer
      });

      recorder.recordEvent({
        eventType: "MOUSE_CLICK",
        application: "TallyPrime",
        uiElement: mockProvider.mockElements[3] // Save button
      });

      const { semanticTrace } = recorder.stopRecording();

      expect(semanticTrace.length).toBe(5);
      expect(semanticTrace[0]?.semanticAction).toBe("OPEN_APPLICATION");
      expect(semanticTrace[1]?.semanticAction).toBe("READ_FIELD");
      expect(semanticTrace[2]?.semanticAction).toBe("OPEN_APPLICATION");
      expect(semanticTrace[3]?.semanticAction).toBe("SEARCH_CUSTOMER");
      expect(semanticTrace[4]?.semanticAction).toBe("SAVE_INVOICE");
    });
  });

  describe("Learning Loop: Process Memory vs UI Memory", () => {
    it("separates UI memory from Process memory during corrections", () => {
      const takeover = new TakeoverManager();

      // Human corrects a UI selector
      const uiCorrection = takeover.captureCorrection({
        stepId: "step_enter_amount",
        correctionType: "corrected_selector",
        application: "TallyPrime.exe",
        element: {
          application: "TallyPrime.exe",
          windowTitle: "TallyPrime",
          controlType: "Edit",
          automationId: "Corrected_Amount_Input_Id",
          name: "Invoice Amount",
          enabled: true,
          visible: true
        },
        originalAction: { target: "Amount_Wrong_Id" },
        correctedAction: { target: "Corrected_Amount_Input_Id" }
      });

      expect(uiCorrection.category).toBe("UI_MEMORY");
      expect(uiCorrection.structuredData.automationId).toBe("Corrected_Amount_Input_Id");

      // Human corrects a business policy
      const processCorrection = takeover.captureCorrection({
        stepId: "step_approve_refund",
        correctionType: "business_rule",
        application: "TallyPrime.exe",
        ruleText: "Refunds over ₹5,000 require manager approval",
        notes: "Company financial audit policy",
        originalAction: { autoApprove: true },
        correctedAction: { autoApprove: false, requireManagerSignoff: true }
      });

      expect(processCorrection.category).toBe("PROCESS_MEMORY");
      expect(processCorrection.structuredData.ruleOrSelectorText).toBe("Refunds over ₹5,000 require manager approval");
    });
  });

  describe("End-to-End Closed Loop Execution", () => {
    it("executes read from Excel and writes to Tally with verification", async () => {
      // 1. Focus Excel and read refund amount
      const readPayload: DesktopActionPayload = {
        action: "READ_FIELD",
        application: "EXCEL.EXE",
        target: { strategy: "UIA", automationId: "Excel_Refund_Amount_Cell" },
        riskLevel: "LOW",
        timeoutMs: 1000
      };
      const readRes = await executionEngine.executeAction("run_123", "step_read", readPayload);
      expect(readRes.state).toBe("SUCCEEDED");
      expect(readRes.outputs?.value).toBe("450.00");

      // 2. Open / Focus Tally and enter amount
      const typePayload: DesktopActionPayload = {
        action: "TYPE_IN_FIELD",
        application: "TallyPrime.exe",
        target: { strategy: "UIA", automationId: "Tally_Amount_Field" },
        text: readRes.outputs?.value,
        riskLevel: "LOW",
        expectedState: [
          {
            type: "element_exists",
            target: { strategy: "UIA", automationId: "Tally_Amount_Field" },
            timeoutMs: 1000
          }
        ],
        timeoutMs: 1000
      };
      const typeRes = await executionEngine.executeAction("run_123", "step_type", typePayload);
      expect(typeRes.state).toBe("SUCCEEDED");
      expect(typeRes.verification?.verified).toBe(true);

      // 3. Click Save and verify transaction saved
      const savePayload: DesktopActionPayload = {
        action: "CLICK_UI_ELEMENT",
        application: "TallyPrime.exe",
        target: { strategy: "UIA", automationId: "Tally_Save_Btn" },
        riskLevel: "LOW",
        expectedState: [
          {
            type: "text_contains",
            expectedValue: "Saved",
            timeoutMs: 1000
          }
        ],
        timeoutMs: 1000
      };
      const saveRes = await executionEngine.executeAction("run_123", "step_save", savePayload);
      expect(saveRes.state).toBe("SUCCEEDED");
      expect(saveRes.verification?.verified).toBe(true);
    });

    it("pauses for HITL when state verification fails", async () => {
      const payload: DesktopActionPayload = {
        action: "CLICK_UI_ELEMENT",
        application: "TallyPrime.exe",
        target: { strategy: "UIA", automationId: "Tally_Save_Btn" },
        riskLevel: "LOW",
        expectedState: [
          {
            type: "text_contains",
            expectedValue: "ExpectedSuccessFlagNeverSeen",
            timeoutMs: 1000
          }
        ],
        timeoutMs: 1000
      };

      const res = await executionEngine.executeAction("run_123", "step_fail", payload);
      expect(res.state).toBe("PAUSED_FOR_HUMAN");
      expect(res.hitlReason).toBe("VERIFICATION_FAILED");
      expect(res.telemetry.result).toBe("PAUSED_FOR_HUMAN");
    });

    it("recovers via fallback target when primary target is not found", async () => {
      const payload: DesktopActionPayload = {
        action: "CLICK_UI_ELEMENT",
        application: "Excel.exe",
        target: { strategy: "UIA", automationId: "NonExistentPrimarySelector" },
        fallbackTarget: { strategy: "UIA", automationId: "Excel_Refund_Amount_Cell" },
        riskLevel: "LOW",
        timeoutMs: 1000
      };

      const res = await executionEngine.executeAction("run_123", "step_fallback", payload);
      expect(res.state).toBe("SUCCEEDED");
      expect(res.telemetry.recoveryAttempted).toBe(true);
      expect(res.telemetry.targetingStrategy).toBe("UIA");
    });

    it("manages human takeover lifecycle and performs mandatory machine re-observation upon release", async () => {
      const agent = new GhostDesktopAgent({
        cloudConfig: {
          baseUrl: "http://localhost:3000",
          tenantId: "test_tenant",
          agentId: "agent_takeover_test",
          agentToken: "test_token",
          deviceName: "Test-PC"
        },
        useMockProvider: true
      });

      // 1. Initial agent state
      expect(agent.status).toBe("CONNECTED");

      // 2. Human initiates takeover
      const sessionId = agent.initiateHumanTakeover("User inspecting order discrepancy in ERP");
      expect(sessionId).toBeDefined();
      expect(agent.status).toBe("WAITING_FOR_HUMAN");
      expect(agent.takeoverManager.isUnderHumanControl()).toBe(true);

      // 3. User releases control -> Ghost MUST NOT blindly resume, but re-observe machine state
      const reobserved = await agent.releaseControlAndReObserve("checkpoint_order_step");
      expect(agent.status).toBe("IDLE");
      expect(agent.takeoverManager.isUnderHumanControl()).toBe(false);
      expect(reobserved.stateVerified).toBe(true);
      expect(reobserved.verifiedCheckpoint).toBe("checkpoint_order_step");
      expect(reobserved.screenshotBase64).toBeDefined();
      expect(reobserved.visibleElementCount).toBeGreaterThan(0);
      expect(agent.takeoverManager.getLastReobservedState()).toEqual(reobserved);
    });
  });
});

