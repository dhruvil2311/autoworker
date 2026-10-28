import type { WorkflowV2Step, DesktopActionPayload, DesktopActionType } from "@ghost/workflow-schema";
import type { RuntimeContext } from "../context.js";
import { VariableResolver } from "../context.js";
import type { ExecutionCapability, ExecutionResult } from "./index.js";
import { GhostDesktopAgent, type ExecutionActionResult } from "@ghost/desktop-agent";

export interface DesktopSessionDispatcher {
  dispatch(
    executionId: string,
    stepId: string,
    payload: DesktopActionPayload
  ): Promise<ExecutionActionResult>;
}

export class DesktopComputerExecutor implements ExecutionCapability {
  public readonly recoveryStrategy = "ALTERNATIVE_SELECTOR_OR_HITL";

  constructor(
    private localAgent?: GhostDesktopAgent,
    private sessionDispatcher?: DesktopSessionDispatcher
  ) {}

  canExecute(step: WorkflowV2Step): boolean {
    return (
      step.target === "DESKTOP" ||
      step.target === "DESKTOP_COMPUTER" ||
      step.operation.startsWith("DESKTOP_") ||
      step.operation === "FIND_UI_ELEMENT" ||
      step.operation === "CLICK_UI_ELEMENT" ||
      step.operation === "TYPE_IN_FIELD" ||
      step.operation === "SELECT_OPTION" ||
      step.operation === "READ_FIELD" ||
      step.operation === "WAIT_FOR_STATE"
    );
  }

  async execute(step: WorkflowV2Step, context: RuntimeContext): Promise<ExecutionResult> {
    const resolver = new VariableResolver(context);
    const executionId = context.getState().executionMetadata?.runId || "run_default";

    // 1. Resolve raw arguments using context variables
    const args = step.args || {};
    const resolvedText = args.text !== undefined ? resolver.resolve(args.text) : (args.value !== undefined ? resolver.resolve(args.value) : undefined);
    const resolvedApp = args.application !== undefined 
      ? resolver.resolve(args.application) 
      : (args.target?.application !== undefined ? resolver.resolve(args.target.application) : undefined);
    const resolvedWindow = args.windowTitle !== undefined 
      ? resolver.resolve(args.windowTitle) 
      : (args.target?.windowTitle !== undefined ? resolver.resolve(args.target.windowTitle) : undefined);
    const resolvedFilePath = args.filePath !== undefined ? resolver.resolve(args.filePath) : undefined;

    // 2. Build structured DesktopActionPayload
    const actionType: DesktopActionType = (args.action as DesktopActionType) || (step.operation as DesktopActionType);
    const payload: DesktopActionPayload = {
      action: actionType,
      application: resolvedApp,
      windowTitle: resolvedWindow,
      target: args.target,
      fallbackTarget: args.fallbackTarget,
      text: resolvedText,
      key: args.key,
      hotkey: args.hotkey,
      scrollDelta: args.scrollDelta,
      dragTo: args.dragTo,
      filePath: resolvedFilePath,
      expectedState: args.expectedState,
      riskLevel: args.riskLevel || "LOW",
      timeoutMs: args.timeoutMs || 10000,
      reason: step.description
    };

    // 3. Dispatch to local agent or remote session dispatcher
    let actionResult: ExecutionActionResult;

    if (this.sessionDispatcher) {
      actionResult = await this.sessionDispatcher.dispatch(executionId, step.id, payload);
    } else {
      if (!this.localAgent) {
        const tenantId = context.getState().executionMetadata?.tenantId || "default";
        this.localAgent = new GhostDesktopAgent({
          cloudConfig: {
            baseUrl: "http://localhost:3000",
            tenantId,
            agentId: `desktop_agent_${executionId}`,
            agentToken: "local_agent_token",
            deviceName: process.env.COMPUTERNAME || "Ghost-Host-PC"
          },
          useMockProvider: process.env.NODE_ENV === "test" || !process.platform.startsWith("win")
        });
      }
      actionResult = await this.localAgent.executeSingleAction(executionId, step.id, payload);
    }

    // 4. Update universal execution state handoff
    const finalApp = resolvedApp || payload.application || payload.target?.application || (actionResult.telemetry as any)?.application;
    const finalWindow = resolvedWindow || payload.windowTitle || payload.target?.windowTitle;
    context.updateDesktopContext({
      activeApplication: finalApp,
      activeWindowTitle: finalWindow,
      lastAction: actionType
    });
    if (resolvedFilePath) {
      context.updateFileContext({
        recentFiles: [resolvedFilePath]
      });
    }
    if (actionResult.state === "PAUSED_FOR_HUMAN") {
      context.recordHumanIntervention({
        interventionRequired: true,
        reason: actionResult.hitlReason || actionResult.message || "Desktop intervention required",
        triggeringStepId: step.id,
        pausedAt: new Date().toISOString()
      });
    }

    // 5. Transform into standardized ExecutionResult
    const outputs = actionResult.outputs || {};
    const result: ExecutionResult = {
      state: actionResult.state
    };
    if (actionResult.message !== undefined) result.message = actionResult.message;
    if (actionResult.hitlReason !== undefined) result.hitlReason = actionResult.hitlReason;

    if (actionResult.outputs !== undefined) {
      result.outputs = outputs;
    }

    return result;
  }
}
