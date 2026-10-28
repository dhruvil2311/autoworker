import { z } from "zod";

export const desktopTargetStrategySchema = z.enum([
  "NATIVE_API",
  "DOM",
  "UIA",
  "ACCESSIBILITY",
  "SEMANTIC_SELECTOR",
  "OCR",
  "VISION",
  "COORDINATE"
]);
export type DesktopTargetStrategy = z.infer<typeof desktopTargetStrategySchema>;

export const desktopUIElementBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number()
});
export type DesktopUIElementBounds = z.infer<typeof desktopUIElementBoundsSchema>;

export const desktopUIElementSchema = z.object({
  application: z.string(),
  processId: z.number().optional(),
  windowTitle: z.string(),
  controlType: z.string(),
  name: z.string().optional(),
  automationId: z.string().optional(),
  className: z.string().optional(),
  bounds: desktopUIElementBoundsSchema.optional(),
  enabled: z.boolean().default(true),
  visible: z.boolean().default(true),
  value: z.string().optional(),
  parentName: z.string().optional(),
  childrenCount: z.number().optional(),
  metadata: z.record(z.any()).optional()
});
export type DesktopUIElement = z.infer<typeof desktopUIElementSchema>;

export type DesktopTargetSelector = {
  strategy: DesktopTargetStrategy;
  application?: string | undefined;
  windowTitle?: string | undefined;
  controlType?: string | undefined;
  name?: string | undefined;
  automationId?: string | undefined;
  className?: string | undefined;
  text?: string | undefined;
  ocrText?: string | undefined;
  semanticRole?: string | undefined;
  visibleText?: string | undefined;
  context?: string | undefined;
  visionPrompt?: string | undefined;
  coordinate?: {
    x: number;
    y: number;
    monitorIndex?: number | undefined;
  } | undefined;
  fallback?: DesktopTargetSelector | undefined;
  confidence?: number | undefined;
};

export const desktopTargetSelectorSchema: z.ZodType<DesktopTargetSelector> = z.lazy(() => z.object({
  strategy: desktopTargetStrategySchema,
  application: z.string().optional(),
  windowTitle: z.string().optional(),
  controlType: z.string().optional(),
  name: z.string().optional(),
  automationId: z.string().optional(),
  className: z.string().optional(),
  text: z.string().optional(),
  ocrText: z.string().optional(),
  semanticRole: z.string().optional(),
  visibleText: z.string().optional(),
  context: z.string().optional(),
  visionPrompt: z.string().optional(),
  coordinate: z.object({
    x: z.number(),
    y: z.number(),
    monitorIndex: z.number().optional()
  }).optional(),
  fallback: desktopTargetSelectorSchema.optional(),
  confidence: z.number().optional()
}));

export const desktopVerificationPredicateSchema = z.object({
  type: z.enum([
    "element_exists",
    "element_visible",
    "element_enabled",
    "text_contains",
    "text_equals",
    "window_exists",
    "window_title_matches",
    "value_equals",
    "screenshot_changed",
    "application_running",
    "dialog_present",
    "file_exists"
  ]),
  target: desktopTargetSelectorSchema.optional(),
  expectedValue: z.any().optional(),
  path: z.string().optional(),
  timeoutMs: z.number().default(5000)
});
export type DesktopVerificationPredicate = z.infer<typeof desktopVerificationPredicateSchema>;

export const desktopRiskLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type DesktopRiskLevel = z.infer<typeof desktopRiskLevelSchema>;

export const desktopExecutionModeSchema = z.enum([
  "OBSERVE_ONLY",
  "SHADOW",
  "SUPERVISED",
  "AUTONOMOUS"
]);
export type DesktopExecutionMode = z.infer<typeof desktopExecutionModeSchema>;

export const computerErrorTypeSchema = z.enum([
  "TARGET_NOT_FOUND",
  "APPLICATION_NOT_FOUND",
  "WINDOW_NOT_FOUND",
  "STATE_UNEXPECTED",
  "ACTION_REJECTED",
  "LOW_CONFIDENCE",
  "TIMEOUT",
  "AUTHENTICATION_REQUIRED",
  "CAPTCHA",
  "MFA",
  "PERMISSION_DENIED",
  "NETWORK_FAILURE",
  "APPLICATION_CRASH",
  "UNKNOWN_STATE"
]);
export type ComputerErrorType = z.infer<typeof computerErrorTypeSchema>;

export const computerRecoveryStrategySchema = z.enum([
  "RETRY",
  "ALTERNATIVE_TARGET",
  "ALTERNATIVE_MECHANISM",
  "WINDOW_REFOCUS",
  "RELOAD",
  "PAUSE_FOR_HUMAN"
]);
export type ComputerRecoveryStrategy = z.infer<typeof computerRecoveryStrategySchema>;

export const computerErrorClassificationSchema = z.object({
  code: computerErrorTypeSchema,
  message: z.string(),
  recoveryStrategy: computerRecoveryStrategySchema,
  hitlPolicy: z.enum(["IMMEDIATE", "AFTER_RETRY", "POLICY_APPROVAL"]),
  auditEvent: z.string()
});
export type ComputerErrorClassification = z.infer<typeof computerErrorClassificationSchema>;

export const desktopActionTypeSchema = z.enum([
  // Legacy / Desktop Specific Action Types
  "DESKTOP_OPEN_APPLICATION",
  "DESKTOP_FOCUS_WINDOW",
  "DESKTOP_CLICK",
  "DESKTOP_DOUBLE_CLICK",
  "DESKTOP_RIGHT_CLICK",
  "DESKTOP_MOUSE_DOWN",
  "DESKTOP_MOUSE_UP",
  "DESKTOP_TYPE",
  "DESKTOP_KEY_PRESS",
  "DESKTOP_HOTKEY",
  "DESKTOP_SCROLL",
  "DESKTOP_SELECT",
  "DESKTOP_DRAG",
  "DESKTOP_WAIT",
  "DESKTOP_READ",
  "DESKTOP_SCREENSHOT",
  "DESKTOP_ASSERT",
  "DESKTOP_UPLOAD_FILE",
  "DESKTOP_DOWNLOAD_FILE",
  "DESKTOP_CLOSE_APPLICATION",
  "FIND_UI_ELEMENT",
  "CLICK_UI_ELEMENT",
  "TYPE_IN_FIELD",
  "SELECT_OPTION",
  "READ_FIELD",
  "WAIT_FOR_STATE",

  // Universal Computer Actions
  "OPEN_APPLICATION",
  "CLOSE_APPLICATION",
  "SWITCH_APPLICATION",
  "FOCUS_WINDOW",
  "CLICK",
  "DOUBLE_CLICK",
  "RIGHT_CLICK",
  "MOVE_POINTER",
  "DRAG",
  "TYPE",
  "PRESS_KEY",
  "HOTKEY",
  "PASTE",
  "COPY",
  "SCROLL",
  "SELECT",
  "READ",
  "WAIT",
  "FIND_ELEMENT",
  "FIND_TEXT",
  "FIND_WINDOW",
  "FIND_FILE",
  "OPEN_FILE",
  "SAVE_FILE",
  "UPLOAD_FILE",
  "DOWNLOAD_FILE",
  "BROWSER_NAVIGATE",
  "BROWSER_BACK",
  "BROWSER_FORWARD",
  "API_CALL",
  "MCP_CALL",
  "ASSERT",
  "VERIFY",
  "REQUEST_HUMAN",
  "HUMAN_TAKEOVER"
]);
export type DesktopActionType = z.infer<typeof desktopActionTypeSchema>;

export function classifyComputerFailure(
  error: Error | string,
  context?: { action?: string; application?: string; target?: DesktopTargetSelector }
): ComputerErrorClassification {
  const msg = typeof error === "string" ? error : error.message || "Unknown error";
  const lower = msg.toLowerCase();

  if (lower.includes("not locate element") || lower.includes("target not found") || lower.includes("could not find element") || lower.includes("element not found")) {
    return {
      code: "TARGET_NOT_FOUND",
      message: msg,
      recoveryStrategy: "ALTERNATIVE_TARGET",
      hitlPolicy: "AFTER_RETRY",
      auditEvent: "COMPUTER_TARGET_NOT_FOUND"
    };
  }
  if (lower.includes("window not found") || lower.includes("could not find window")) {
    return {
      code: "WINDOW_NOT_FOUND",
      message: msg,
      recoveryStrategy: "WINDOW_REFOCUS",
      hitlPolicy: "AFTER_RETRY",
      auditEvent: "COMPUTER_WINDOW_NOT_FOUND"
    };
  }
  if (lower.includes("application not found") || lower.includes("app not running") || lower.includes("app not found")) {
    return {
      code: "APPLICATION_NOT_FOUND",
      message: msg,
      recoveryStrategy: "ALTERNATIVE_MECHANISM",
      hitlPolicy: "IMMEDIATE",
      auditEvent: "COMPUTER_APP_NOT_FOUND"
    };
  }
  if (lower.includes("verification failed") || lower.includes("expected state not reached") || lower.includes("state mismatch")) {
    return {
      code: "STATE_UNEXPECTED",
      message: msg,
      recoveryStrategy: "ALTERNATIVE_TARGET",
      hitlPolicy: "IMMEDIATE",
      auditEvent: "COMPUTER_STATE_UNEXPECTED"
    };
  }
  if (lower.includes("captcha")) {
    return {
      code: "CAPTCHA",
      message: msg,
      recoveryStrategy: "PAUSE_FOR_HUMAN",
      hitlPolicy: "IMMEDIATE",
      auditEvent: "COMPUTER_CAPTCHA_DETECTED"
    };
  }
  if (lower.includes("mfa") || lower.includes("two-factor") || lower.includes("otp")) {
    return {
      code: "MFA",
      message: msg,
      recoveryStrategy: "PAUSE_FOR_HUMAN",
      hitlPolicy: "IMMEDIATE",
      auditEvent: "COMPUTER_MFA_REQUIRED"
    };
  }
  if (lower.includes("permission denied") || lower.includes("access denied") || lower.includes("unauthorized")) {
    return {
      code: "PERMISSION_DENIED",
      message: msg,
      recoveryStrategy: "PAUSE_FOR_HUMAN",
      hitlPolicy: "POLICY_APPROVAL",
      auditEvent: "COMPUTER_PERMISSION_DENIED"
    };
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return {
      code: "TIMEOUT",
      message: msg,
      recoveryStrategy: "RETRY",
      hitlPolicy: "AFTER_RETRY",
      auditEvent: "COMPUTER_TIMEOUT"
    };
  }
  if (lower.includes("crash") || lower.includes("process exited unexpectedly")) {
    return {
      code: "APPLICATION_CRASH",
      message: msg,
      recoveryStrategy: "ALTERNATIVE_MECHANISM",
      hitlPolicy: "IMMEDIATE",
      auditEvent: "COMPUTER_APP_CRASHED"
    };
  }
  if (lower.includes("low confidence")) {
    return {
      code: "LOW_CONFIDENCE",
      message: msg,
      recoveryStrategy: "ALTERNATIVE_TARGET",
      hitlPolicy: "IMMEDIATE",
      auditEvent: "COMPUTER_LOW_CONFIDENCE"
    };
  }

  return {
    code: "UNKNOWN_STATE",
    message: msg,
    recoveryStrategy: "PAUSE_FOR_HUMAN",
    hitlPolicy: "IMMEDIATE",
    auditEvent: "COMPUTER_UNKNOWN_FAILURE"
  };
}

export const desktopActionPayloadSchema = z.object({
  action: desktopActionTypeSchema,
  application: z.string().optional(),
  windowTitle: z.string().optional(),
  target: desktopTargetSelectorSchema.optional(),
  fallbackTarget: desktopTargetSelectorSchema.optional(),
  text: z.string().optional(),
  key: z.string().optional(),
  hotkey: z.array(z.string()).optional(),
  scrollDelta: z.number().optional(),
  dragTo: z.object({ x: z.number(), y: z.number() }).optional(),
  filePath: z.string().optional(),
  expectedState: z.array(desktopVerificationPredicateSchema).optional(),
  riskLevel: desktopRiskLevelSchema.optional().default("LOW"),
  timeoutMs: z.number().optional().default(10000),
  reason: z.string().optional()
});
export type DesktopActionPayload = z.infer<typeof desktopActionPayloadSchema>;

export const desktopTelemetryEventSchema = z.object({
  executionId: z.string(),
  stepId: z.string(),
  application: z.string().optional(),
  action: desktopActionTypeSchema,
  targetingStrategy: desktopTargetStrategySchema.optional(),
  target: desktopTargetSelectorSchema.optional(),
  confidence: z.number().optional(),
  startedAt: z.string(),
  completedAt: z.string(),
  result: z.enum(["SUCCEEDED", "FAILED", "RECOVERED", "PAUSED_FOR_HUMAN"]),
  screenshotBefore: z.string().optional(),
  screenshotAfter: z.string().optional(),
  recoveryAttempted: z.boolean().optional().default(false),
  humanIntervention: z.boolean().optional().default(false),
  details: z.record(z.any()).optional()
});
export type DesktopTelemetryEvent = z.infer<typeof desktopTelemetryEventSchema>;
