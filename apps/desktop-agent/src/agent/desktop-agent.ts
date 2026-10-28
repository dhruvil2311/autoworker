import { WindowsUIProvider, NativeWindowsUIProvider, MockWindowsUIProvider } from "../windows/provider.js";
import { MouseController } from "../mouse/mouse-controller.js";
import { KeyboardController } from "../keyboard/keyboard-controller.js";
import { TargetingResolver } from "../targeting/targeting-resolver.js";
import { ObservationEngine } from "../observation/observation-engine.js";
import { VerificationEngine } from "../verification/verification-engine.js";
import { SecurityPolicy } from "../security/security-policy.js";
import { ApplicationRegistry } from "../registry/application-registry.js";
import { DesktopRecorder } from "../recorder/desktop-recorder.js";
import { TakeoverManager, type ReObservedState } from "../hitl/takeover-manager.js";
import { DesktopExecutionEngine, type ExecutionActionResult } from "../execution/execution-engine.js";
import { CloudClient, type CloudClientConfig, type OutboundCommandMessage } from "../transport/cloud-client.js";
import { AuthManager } from "../authentication/auth-manager.js";
import { MockOCRProvider, MockComputerVisionProvider } from "../vision/vision-provider.js";
import type { DesktopActionPayload } from "@ghost/workflow-schema";

export type AgentStatus =
  | "CONNECTED"
  | "IDLE"
  | "RUNNING"
  | "PAUSED"
  | "WAITING_FOR_HUMAN"
  | "FAILED"
  | "COMPLETED"
  | "DISCONNECTED";

export interface DesktopAgentOptions {
  cloudConfig: CloudClientConfig;
  useMockProvider?: boolean;
  heartbeatIntervalMs?: number;
}

export class GhostDesktopAgent {
  public status: AgentStatus = "CONNECTED";
  public windowsProvider: WindowsUIProvider;
  public mouseController: MouseController;
  public keyboardController: KeyboardController;
  public targetingResolver: TargetingResolver;
  public observationEngine: ObservationEngine;
  public verificationEngine: VerificationEngine;
  public securityPolicy: SecurityPolicy;
  public applicationRegistry: ApplicationRegistry;
  public desktopRecorder: DesktopRecorder;
  public takeoverManager: TakeoverManager;
  public executionEngine: DesktopExecutionEngine;
  public cloudClient: CloudClient;
  public authManager: AuthManager;

  private heartbeatTimer?: NodeJS.Timeout;
  private isProcessing = false;

  constructor(options: DesktopAgentOptions) {
    this.authManager = new AuthManager();
    this.cloudClient = new CloudClient(options.cloudConfig, this.authManager);

    this.windowsProvider = options.useMockProvider
      ? new MockWindowsUIProvider()
      : (process.platform === "win32" ? new NativeWindowsUIProvider() : new MockWindowsUIProvider());

    this.mouseController = new MouseController();
    this.keyboardController = new KeyboardController();

    const mockOcr = new MockOCRProvider();
    const mockVision = new MockComputerVisionProvider();
    this.targetingResolver = new TargetingResolver(this.windowsProvider, mockOcr, mockVision);

    this.observationEngine = new ObservationEngine(this.windowsProvider);
    this.verificationEngine = new VerificationEngine(this.observationEngine);
    this.securityPolicy = new SecurityPolicy();
    this.applicationRegistry = new ApplicationRegistry();
    this.desktopRecorder = new DesktopRecorder(this.windowsProvider);
    this.takeoverManager = new TakeoverManager();

    this.executionEngine = new DesktopExecutionEngine(
      this.windowsProvider,
      this.mouseController,
      this.keyboardController,
      this.targetingResolver,
      this.observationEngine,
      this.verificationEngine,
      this.securityPolicy,
      this.applicationRegistry
    );

    if (options.heartbeatIntervalMs) {
      this.startHeartbeat(options.heartbeatIntervalMs);
    }
  }

  startHeartbeat(intervalMs = 5000): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(async () => {
      await this.cloudClient.sendHeartbeat(this.status);
    }, intervalMs);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * Puts agent in human takeover mode.
   * Execution pauses immediately while human controls the machine.
   */
  initiateHumanTakeover(reason: string): string {
    const sessionId = this.takeoverManager.initiateHumanTakeover(reason);
    this.status = "WAITING_FOR_HUMAN";
    return sessionId;
  }

  /**
   * Releases human control and MANDATORILY re-observes the computer before resumption.
   * Inspects active application, window, and UI elements to reconstruct verified state.
   */
  async releaseControlAndReObserve(expectedCheckpoint?: string): Promise<ReObservedState> {
    this.takeoverManager.releaseControl();

    // Mandatory re-observation before resumption:
    const obs = await this.observationEngine.observeCurrentState();
    const focusedApp = obs.runningApplications.find(a => a.title === obs.focusedWindow);

    const reobserved: ReObservedState = {
      timestamp: obs.timestamp,
      activeApplication: focusedApp?.name || obs.focusedWindow,
      activeWindow: obs.focusedWindow,
      visibleElementCount: obs.visibleElements.length,
      screenshotBase64: obs.screenshotBase64,
      activeDialogCount: obs.activeDialogs.length,
      stateVerified: true,
      verifiedCheckpoint: expectedCheckpoint,
      notes: `Re-observed computer state: focused='${obs.focusedWindow || "Desktop"}', visibleElements=${obs.visibleElements.length}, dialogs=${obs.activeDialogs.length}`
    };

    this.takeoverManager.recordReobservation(reobserved);
    this.status = "IDLE";
    return reobserved;
  }

  async executeSingleAction(
    executionId: string,
    stepId: string,
    payload: DesktopActionPayload
  ): Promise<ExecutionActionResult> {
    this.status = "RUNNING";
    const result = await this.executionEngine.executeAction(executionId, stepId, payload);
    if (result.state === "PAUSED_FOR_HUMAN") {
      this.status = "WAITING_FOR_HUMAN";
    } else if (result.state === "FAILED") {
      this.status = "FAILED";
    } else {
      this.status = "IDLE";
    }
    return result;
  }

  async processIncomingCommand(command: OutboundCommandMessage): Promise<ExecutionActionResult> {
    if (command.message_type === "EMERGENCY_STOP") {
      this.securityPolicy.triggerEmergencyStop();
      this.status = "FAILED";
      const res: ExecutionActionResult = {
        success: false,
        state: "FAILED",
        message: "EMERGENCY_STOP_TRIGGERED: Agent execution stopped immediately",
        telemetry: {
          executionId: command.execution_id,
          stepId: command.step_id,
          action: "DESKTOP_WAIT",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          result: "FAILED",
          recoveryAttempted: false,
          humanIntervention: false,
          details: { emergencyStop: true }
        }
      };
      await this.cloudClient.reportCommandResult(command.id, res);
      return res;
    }

    if (command.message_type === "PAUSE") {
      this.status = "PAUSED";
      const res: ExecutionActionResult = {
        success: true,
        state: "PAUSED_FOR_HUMAN",
        message: "Execution paused by cloud request",
        telemetry: {
          executionId: command.execution_id,
          stepId: command.step_id,
          action: "DESKTOP_WAIT",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          result: "PAUSED_FOR_HUMAN",
          recoveryAttempted: false,
          humanIntervention: false
        }
      };
      await this.cloudClient.reportCommandResult(command.id, res);
      return res;
    }

    if (command.message_type === "TAKE_CONTROL") {
      const sessionId = this.initiateHumanTakeover(command.payload?.reason || "Human takeover requested");
      const res: ExecutionActionResult = {
        success: true,
        state: "PAUSED_FOR_HUMAN",
        message: `Human takeover active: sessionId=${sessionId}`,
        hitlReason: "HUMAN_TAKEOVER_ACTIVE",
        telemetry: {
          executionId: command.execution_id,
          stepId: command.step_id,
          action: "DESKTOP_WAIT",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          result: "PAUSED_FOR_HUMAN",
          recoveryAttempted: false,
          humanIntervention: true,
          details: { sessionId, takeover: true }
        }
      };
      await this.cloudClient.reportCommandResult(command.id, res);
      return res;
    }

    if (command.message_type === "RELEASE_CONTROL") {
      const reobserved = await this.releaseControlAndReObserve(command.step_id);
      const res: ExecutionActionResult = {
        success: true,
        state: "SUCCEEDED",
        message: `Human control released and machine re-observed: ${reobserved.notes}`,
        outputs: { reobservedState: reobserved },
        telemetry: {
          executionId: command.execution_id,
          stepId: command.step_id,
          action: "DESKTOP_WAIT",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          result: "SUCCEEDED",
          recoveryAttempted: false,
          humanIntervention: true,
          details: { reobserved }
        }
      };
      await this.cloudClient.reportCommandResult(command.id, res);
      return res;
    }

    const actionResult = await this.executeSingleAction(
      command.execution_id,
      command.step_id,
      command.payload
    );

    await this.cloudClient.reportCommandResult(command.id, actionResult);
    return actionResult;
  }

  async startPollLoop(intervalMs = 1000): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    const poll = async () => {
      if (!this.isProcessing) return;
      try {
        if (this.status !== "PAUSED" && this.status !== "WAITING_FOR_HUMAN") {
          const commands = await this.cloudClient.pollPendingCommands();
          for (const cmd of commands) {
            await this.processIncomingCommand(cmd);
          }
        }
      } catch {}
      if (this.isProcessing) {
        setTimeout(poll, intervalMs);
      }
    };

    poll();
  }

  stopPollLoop(): void {
    this.isProcessing = false;
    this.status = "DISCONNECTED";
    this.stopHeartbeat();
  }
}
