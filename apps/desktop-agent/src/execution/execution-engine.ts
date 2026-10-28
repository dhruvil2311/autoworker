import {
  type DesktopActionPayload,
  type DesktopTelemetryEvent,
  type DesktopUIElement,
  classifyComputerFailure,
  type ComputerErrorClassification
} from "@ghost/workflow-schema";
import type { WindowsUIProvider } from "../windows/provider.js";
import type { MouseController } from "../mouse/mouse-controller.js";
import type { KeyboardController } from "../keyboard/keyboard-controller.js";
import type { TargetingResolver, ResolvedTargetLocation } from "../targeting/targeting-resolver.js";
import type { ObservationEngine } from "../observation/observation-engine.js";
import type { VerificationEngine, StateVerificationResult } from "../verification/verification-engine.js";
import type { SecurityPolicy } from "../security/security-policy.js";
import type { ApplicationRegistry } from "../registry/application-registry.js";

export interface ExecutionActionResult {
  success: boolean;
  state: "SUCCEEDED" | "FAILED" | "PAUSED_FOR_HUMAN";
  message?: string | undefined;
  outputs?: Record<string, any> | undefined;
  hitlReason?: string | undefined;
  telemetry: DesktopTelemetryEvent;
  verification?: StateVerificationResult | undefined;
}

export class DesktopExecutionEngine {
  constructor(
    private windowsUIProvider: WindowsUIProvider,
    private mouseController: MouseController,
    private keyboardController: KeyboardController,
    private targetingResolver: TargetingResolver,
    private observationEngine: ObservationEngine,
    private verificationEngine: VerificationEngine,
    private securityPolicy: SecurityPolicy,
    private applicationRegistry: ApplicationRegistry
  ) {}

  async executeAction(
    executionId: string,
    stepId: string,
    payload: DesktopActionPayload
  ): Promise<ExecutionActionResult> {
    const startedAt = new Date().toISOString();

    // 1. Security & Safety Gate
    const safetyCheck = this.securityPolicy.assertExecutionAllowed(
      payload.action,
      payload.riskLevel || "LOW",
      payload.application
    );

    if (!safetyCheck.allowed) {
      const completedAt = new Date().toISOString();
      return {
        success: false,
        state: safetyCheck.requiresHumanApproval ? "PAUSED_FOR_HUMAN" : "FAILED",
        message: safetyCheck.reason,
        hitlReason: safetyCheck.requiresHumanApproval ? "POLICY_APPROVAL_REQUIRED" : undefined,
        telemetry: {
          executionId,
          stepId,
          application: payload.application,
          action: payload.action,
          startedAt,
          completedAt,
          result: safetyCheck.requiresHumanApproval ? "PAUSED_FOR_HUMAN" : "FAILED",
          recoveryAttempted: false,
          humanIntervention: safetyCheck.requiresHumanApproval,
          details: { error: safetyCheck.reason }
        }
      };
    }

    // 2. Filesystem sandbox check if action involves files
    if (payload.filePath) {
      const fileCheck = this.securityPolicy.assertFileAccessAllowed(payload.filePath);
      if (!fileCheck.allowed) {
        const completedAt = new Date().toISOString();
        return {
          success: false,
          state: "FAILED",
          message: fileCheck.reason,
          telemetry: {
            executionId,
            stepId,
            action: payload.action,
            startedAt,
            completedAt,
            result: "FAILED",
            recoveryAttempted: false,
            humanIntervention: false,
            details: { error: fileCheck.reason }
          }
        };
      }
    }

    // 3. Pre-Action Observation (ACT -> OBSERVE -> VERIFY loop)
    const preObs = await this.observationEngine.observeCurrentState(payload.windowTitle);
    let targetLocation: ResolvedTargetLocation | undefined = undefined;
    let outputs: Record<string, any> = {};
    let recoveryAttempted = false;

    try {
      // 4. Resolve Target if selector present
      if (payload.target) {
        try {
          targetLocation = await this.targetingResolver.resolveTarget(
            payload.target,
            preObs.screenshotBase64
          );
        } catch (targetingErr: any) {
          // If primary targeting fails and a fallback target is provided, attempt recovery via fallback
          if (payload.fallbackTarget) {
            recoveryAttempted = true;
            try {
              targetLocation = await this.targetingResolver.resolveTarget(
                payload.fallbackTarget,
                preObs.screenshotBase64
              );
            } catch (fallbackErr: any) {
              const diag = classifyComputerFailure(fallbackErr.message || targetingErr.message);
              const completedAt = new Date().toISOString();
              return {
                success: false,
                state: "FAILED",
                message: `[${diag.code}] Targeting failed: ${targetingErr.message}. Fallback also failed: ${fallbackErr.message}`,
                hitlReason: diag.code,
                telemetry: {
                  executionId,
                  stepId,
                  application: payload.application,
                  action: payload.action,
                  startedAt,
                  completedAt,
                  result: "FAILED",
                  recoveryAttempted: true,
                  humanIntervention: false,
                  details: { error: targetingErr.message, errorClassification: diag }
                }
              };
            }
          } else {
            const diag = classifyComputerFailure(targetingErr.message);
            const completedAt = new Date().toISOString();
            return {
              success: false,
              state: "FAILED",
              message: `[${diag.code}] ${targetingErr.message}`,
              hitlReason: diag.code,
              telemetry: {
                executionId,
                stepId,
                application: payload.application,
                action: payload.action,
                startedAt,
                completedAt,
                result: "FAILED",
                recoveryAttempted: false,
                humanIntervention: false,
                details: { error: targetingErr.message, errorClassification: diag }
              }
            };
          }
        }
      }

      // 5. ACT Phase
      switch (payload.action) {
        case "DESKTOP_OPEN_APPLICATION": {
          const targetApp = payload.application || payload.target?.application || "";
          const regApp = this.applicationRegistry.findApplication(targetApp);
          const launchPath = regApp?.processName || targetApp;
          await this.windowsUIProvider.launchApplication(launchPath);
          await new Promise(r => setTimeout(r, 600));
          break;
        }

        case "DESKTOP_FOCUS_WINDOW": {
          const title = payload.windowTitle || payload.target?.windowTitle;
          await this.windowsUIProvider.focusWindow({ title });
          break;
        }

        case "DESKTOP_CLOSE_APPLICATION": {
          const appName = payload.application || payload.target?.application;
          await this.windowsUIProvider.closeApplication({ processName: appName });
          break;
        }

        case "CLICK_UI_ELEMENT":
        case "DESKTOP_CLICK": {
          if (targetLocation) {
            await this.mouseController.click(
              targetLocation.centerCoordinates.x,
              targetLocation.centerCoordinates.y
            );
          } else {
            await this.mouseController.click();
          }
          break;
        }

        case "DESKTOP_DOUBLE_CLICK": {
          if (targetLocation) {
            await this.mouseController.doubleClick(
              targetLocation.centerCoordinates.x,
              targetLocation.centerCoordinates.y
            );
          } else {
            await this.mouseController.doubleClick();
          }
          break;
        }

        case "DESKTOP_RIGHT_CLICK": {
          if (targetLocation) {
            await this.mouseController.rightClick(
              targetLocation.centerCoordinates.x,
              targetLocation.centerCoordinates.y
            );
          } else {
            await this.mouseController.rightClick();
          }
          break;
        }

        case "TYPE_IN_FIELD":
        case "DESKTOP_TYPE": {
          if (targetLocation) {
            await this.mouseController.click(
              targetLocation.centerCoordinates.x,
              targetLocation.centerCoordinates.y
            );
            await new Promise(r => setTimeout(r, 50));
          }
          if (payload.text) {
            await this.keyboardController.type(payload.text);
          }
          break;
        }

        case "DESKTOP_KEY_PRESS": {
          if (payload.key) {
            await this.keyboardController.keyPress(payload.key);
          }
          break;
        }

        case "DESKTOP_HOTKEY": {
          if (payload.hotkey) {
            await this.keyboardController.hotkey(payload.hotkey);
          }
          break;
        }

        case "DESKTOP_SCROLL": {
          await this.mouseController.scroll(payload.scrollDelta || -120);
          break;
        }

        case "DESKTOP_DRAG": {
          if (payload.dragTo) {
            const start = targetLocation ? targetLocation.centerCoordinates : { x: 100, y: 100 };
            await this.mouseController.drag(start, payload.dragTo);
          }
          break;
        }

        case "DESKTOP_WAIT":
        case "WAIT_FOR_STATE": {
          const ms = payload.timeoutMs || 1000;
          await new Promise(r => setTimeout(r, ms));
          break;
        }

        case "READ_FIELD":
        case "DESKTOP_READ": {
          let readVal = "";
          if (payload.target) {
            const el = await this.windowsUIProvider.findElement(payload.target);
            readVal = el?.value || el?.name || "";
          }
          outputs = {
            value: readVal,
            redactedValue: this.securityPolicy.redactSensitiveData(readVal)
          };
          break;
        }

        case "DESKTOP_SCREENSHOT": {
          const shot = await this.windowsUIProvider.captureScreenshot();
          outputs = { screenshotUrl: shot.dataUrl };
          break;
        }

        default:
          break;
      }

      // 6. Post-Action Observation (ACT -> OBSERVE -> VERIFY)
      const postObs = await this.observationEngine.observeCurrentState(payload.windowTitle);

      // 7. Verification Phase
      let verification: StateVerificationResult = { verified: true, checks: [] };
      if (payload.expectedState && payload.expectedState.length > 0) {
        verification = await this.verificationEngine.verify(
          payload.expectedState,
          postObs,
          preObs.screenshotBase64
        );
      }

      const completedAt = new Date().toISOString();

      if (!verification.verified) {
        const errorDiag = classifyComputerFailure(verification.failureReason || "State verification failed");
        return {
          success: false,
          state: "PAUSED_FOR_HUMAN",
          message: `[${errorDiag.code}] Verification failed: ${verification.failureReason}`,
          hitlReason: "VERIFICATION_FAILED",
          verification,
          telemetry: {
            executionId,
            stepId,
            application: payload.application,
            action: payload.action,
            targetingStrategy: targetLocation?.strategyUsed,
            target: payload.target,
            confidence: targetLocation?.confidence,
            startedAt,
            completedAt,
            result: "PAUSED_FOR_HUMAN",
            recoveryAttempted,
            humanIntervention: true,
            details: {
              verificationChecks: verification.checks,
              errorClassification: errorDiag
            }
          }
        };
      }

      return {
        success: true,
        state: "SUCCEEDED",
        outputs,
        verification,
        telemetry: {
          executionId,
          stepId,
          application: payload.application,
          action: payload.action,
          targetingStrategy: targetLocation?.strategyUsed,
          target: payload.target,
          confidence: targetLocation?.confidence,
          startedAt,
          completedAt,
          result: "SUCCEEDED",
          recoveryAttempted,
          humanIntervention: false,
          details: {
            outputs,
            targetingEvidence: targetLocation?.evidence
          }
        }
      };
    } catch (err: any) {
      const errorDiag = classifyComputerFailure(err.message);
      const completedAt = new Date().toISOString();

      // Check whether error requires immediate interactive human credentials
      const isHumanNeeded =
        errorDiag.code === "AUTHENTICATION_REQUIRED" ||
        errorDiag.code === "CAPTCHA" ||
        errorDiag.code === "MFA";

      return {
        success: false,
        state: isHumanNeeded ? "PAUSED_FOR_HUMAN" : "FAILED",
        message: `[${errorDiag.code}] ${err.message}`,
        hitlReason: isHumanNeeded ? errorDiag.code : undefined,
        telemetry: {
          executionId,
          stepId,
          application: payload.application,
          action: payload.action,
          startedAt,
          completedAt,
          result: isHumanNeeded ? "PAUSED_FOR_HUMAN" : "FAILED",
          recoveryAttempted,
          humanIntervention: isHumanNeeded,
          details: {
            error: err.message,
            errorClassification: errorDiag
          }
        }
      };
    }
  }
}
