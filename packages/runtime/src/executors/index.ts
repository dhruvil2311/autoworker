import type { WorkflowV2Step } from "@ghost/workflow-schema";
import type { RuntimeContext } from "../context.js";

export interface ExecutionResult {
  state: "SUCCEEDED" | "FAILED" | "PAUSED_FOR_HUMAN";
  message?: string;
  outputs?: Record<string, any>;
  hitlReason?: string;
}

export interface ExecutionCapability {
  canExecute(step: WorkflowV2Step, context: RuntimeContext): boolean;
  execute(step: WorkflowV2Step, context: RuntimeContext): Promise<ExecutionResult>;
}

export * from "./data.js";
export * from "./human.js";
export * from "./api.js";
export * from "./browser-deterministic.js";
export * from "./browser-semantic.js";
export * from "./mcp-executor.js";
export * from "./desktop-executor.js";
