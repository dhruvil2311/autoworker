import { z } from "zod";

export const workflowSchemaV2Version = "2.0" as const;

export const executionTargetSchema = z.enum([
  "MCP",
  "API",
  "DATA",
  "OUTPUT",
  "PLATFORM_ADAPTER",
  "BROWSER_DETERMINISTIC",
  "BROWSER_SEMANTIC",
  "DESKTOP",
  "DESKTOP_COMPUTER",
  "HUMAN"
]);

export const operationSchema = z.enum([
  // Control Flow
  "SEQUENCE", "FOR_EACH", "IF", "ELSE",
  // Data Operations
  "SET_VARIABLE", "EXTRACT", "TRANSFORM", "VALIDATE", "MATCH",
  // Output Operations
  "BUILD_OUTPUT", "VERIFY_OUTPUT", "DELIVER_OUTPUT",
  // Execution Operations
  "NAVIGATE", "ACT", "CLICK", "TYPE", "SELECT", "WAIT", "ASSERT", 
  "DOWNLOAD", "UPLOAD", "PROCESS_FILE", "CALL_API", "CALL_MCP",
  // Universal Computer Operations
  "OPEN_APPLICATION", "CLOSE_APPLICATION", "SWITCH_APPLICATION", "FOCUS_WINDOW",
  "DOUBLE_CLICK", "RIGHT_CLICK", "MOVE_POINTER", "DRAG",
  "PRESS_KEY", "HOTKEY", "PASTE", "COPY", "SCROLL", "READ",
  "FIND_ELEMENT", "FIND_TEXT", "FIND_WINDOW", "FIND_FILE",
  "OPEN_FILE", "SAVE_FILE", "UPLOAD_FILE", "DOWNLOAD_FILE",
  "BROWSER_NAVIGATE", "BROWSER_BACK", "BROWSER_FORWARD",
  "VERIFY", "REQUEST_HUMAN", "HUMAN_TAKEOVER",
  // Desktop Execution Operations
  "DESKTOP_OPEN_APPLICATION", "DESKTOP_FOCUS_WINDOW", "DESKTOP_CLICK", "DESKTOP_DOUBLE_CLICK",
  "DESKTOP_RIGHT_CLICK", "DESKTOP_MOUSE_DOWN", "DESKTOP_MOUSE_UP",
  "DESKTOP_TYPE", "DESKTOP_KEY_PRESS", "DESKTOP_HOTKEY", "DESKTOP_SCROLL", 
  "DESKTOP_SELECT", "DESKTOP_DRAG", "DESKTOP_WAIT", "DESKTOP_READ", 
  "DESKTOP_SCREENSHOT", "DESKTOP_ASSERT", "DESKTOP_UPLOAD_FILE", "DESKTOP_DOWNLOAD_FILE", 
  "DESKTOP_CLOSE_APPLICATION",
  // Higher-level Semantic Desktop Operations
  "FIND_UI_ELEMENT", "CLICK_UI_ELEMENT", "TYPE_IN_FIELD", "SELECT_OPTION", "READ_FIELD", "WAIT_FOR_STATE",
  // Safety Operations
  "REQUIRE_APPROVAL", "CHECKPOINT"
]);

export const outputTypeSchema = z.enum([
  "EXTRACTION",
  "COMPARISON",
  "CALCULATION",
  "CLASSIFICATION",
  "SUMMARY",
  "RECOMMENDATION",
  "DECISION",
  "GENERATED_TEXT",
  "GENERATED_TABLE",
  "GENERATED_REPORT",
  "GENERATED_FILE",
  "ACTION_CONFIRMATION",
  "UPDATED_RECORD",
  "HUMAN_APPROVAL_RESULT",
  "CUSTOM_STRUCTURED_OUTPUT"
]);

export const outputDestinationSchema = z.enum([
  "CHAT",
  "FILE",
  "DOWNLOAD",
  "BUSINESS_SYSTEM",
  "EMAIL",
  "HUMAN_APPROVAL"
]);

export const outputContractSchema = z.object({
  output_required: z.boolean().default(true),
  output_type: outputTypeSchema,
  output_types: z.array(outputTypeSchema).optional(),
  output_schema: z.record(z.any()).optional(),
  source_requirements: z.array(z.string()).default([]),
  verification_requirements: z.array(z.string()).default([]),
  delivery_destination: outputDestinationSchema.default("CHAT"),
  completion_condition: z.string().optional()
});

export const universalExecutionResultSchema = z.object({
  run_id: z.string(),
  task: z.string(),
  status: z.enum([
    "COMPLETED",
    "OUTPUT_GENERATION_FAILED",
    "OUTPUT_VERIFICATION_FAILED",
    "OUTPUT_DELIVERY_FAILED",
    "FAILED",
    "WAITING_FOR_HUMAN"
  ]),
  input: z.record(z.any()).default({}),
  observations: z.array(z.any()).default([]),
  actions: z.array(z.any()).default([]),
  reasoning_summary: z.string().default(""),
  output_required: z.boolean().default(true),
  output_type: z.union([outputTypeSchema, z.string()]),
  output_schema: z.any().optional(),
  output_data: z.any(),
  output_verification: z.object({
    verified: z.boolean(),
    checks: z.array(z.object({
      check: z.string(),
      passed: z.boolean(),
      message: z.string().optional()
    })).default([]),
    reason: z.string().optional()
  }),
  output_evidence: z.array(z.object({
    label: z.string(),
    value: z.any(),
    source_url: z.string().optional(),
    selector: z.string().optional(),
    step_id: z.string().optional(),
    timestamp: z.string().optional(),
    original_language_text: z.string().optional()
  })).default([]),
  output_delivery: z.object({
    destination: outputDestinationSchema,
    delivered_at: z.string().optional(),
    status: z.enum(["DELIVERED", "PENDING", "FAILED"]).default("DELIVERED"),
    message: z.string().optional()
  }),
  delivery_status: z.string().default("DELIVERED"),
  workflow_version: z.string().default("2.0"),
  worker_id: z.string().optional(),
  memory_used: z.any().optional(),
  language_detected: z.string().optional(),
  translated_to_english: z.boolean().optional()
});

export const variableReferenceSchema = z.string().regex(/^\{\{[a-zA-Z0-9_.]+\}\}$/, "Must be a valid variable reference like {{var.name}}");

export type WorkflowV2Step = {
  id: string;
  operation: Operation;
  target: ExecutionTarget;
  description: string;
  args?: Record<string, any> | undefined;
  bind_result_to?: string | undefined;
  children?: WorkflowV2Step[] | undefined;
  failure_policy?: {
    retry_limit?: number | undefined;
    on_failure?: "FAIL" | "CONTINUE" | "PAUSE_FOR_HUMAN" | "RUN_FALLBACK" | "SKIP_ITEM" | "RETRY_ITEM" | undefined;
    fallback_step_id?: string | undefined;
  } | undefined;
};

export const workflowV2StepSchema: z.ZodType<WorkflowV2Step> = z.lazy(() => z.object({
  id: z.string(),
  operation: operationSchema,
  target: executionTargetSchema,
  description: z.string(),
  
  // Arguments/Configuration for the operation
  args: z.record(z.any()).default({}),
  
  // Expected variable to bind the result to (if applicable)
  bind_result_to: z.string().optional(),
  
  // Control Flow nested steps
  children: z.array(workflowV2StepSchema).optional(),
  
  // Safety/Failure Policies
  failure_policy: z.object({
    retry_limit: z.number().int().min(0).max(10).optional(),
    on_failure: z.enum(["FAIL", "CONTINUE", "PAUSE_FOR_HUMAN", "RUN_FALLBACK", "SKIP_ITEM", "RETRY_ITEM"]).optional(),
    fallback_step_id: z.string().optional()
  }).optional()
}));

export const workflowV2Schema = z.object({
  workflow_version: z.literal("2.0"),
  name: z.string(),
  description: z.string().default(""),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED", "SUPERSEDED"]),
  
  variables: z.array(z.object({
    name: z.string(),
    type: z.preprocess((val) => typeof val === "string" ? val.toLowerCase() : val, z.enum(["string", "number", "boolean", "date", "object", "array"])),
    required: z.boolean().default(true),
    default_value: z.any().optional()
  })),
  
  secrets: z.array(z.string()),
  expected_domains: z.array(z.string()).default([]),
  
  output_contract: outputContractSchema.optional(),

  // Observable conditions that must hold after execution for the outcome to count as verified.
  success_criteria: z.array(z.object({
    id: z.string(),
    type: z.enum(["URL_CONTAINS", "TEXT_VISIBLE"]),
    value: z.string().min(1),
    source: z.enum(["USER_OBJECTIVE", "DEMONSTRATION_FINAL_STATE"]),
    evidenceFrameIds: z.array(z.string()).default([])
  })).optional(),

  root_step: workflowV2StepSchema,
  
  compiler: z.object({
    version: z.string(),
    source_specification_id: z.string(),
    compiled_at: z.string(),
    source_type: z.string().optional(),
    source_recording_id: z.string().optional(),
    source_media_name: z.string().optional(),
    source_media_id: z.string().optional(),
    action_count: z.number().optional(),
    frame_count: z.number().optional(),
    compiled_from: z.string().optional()
  }).passthrough()
});

export type WorkflowV2 = z.infer<typeof workflowV2Schema>;
export type ExecutionTarget = z.infer<typeof executionTargetSchema>;
export type Operation = z.infer<typeof operationSchema>;
export type OutputType = z.infer<typeof outputTypeSchema>;
export type OutputDestination = z.infer<typeof outputDestinationSchema>;
export type OutputContract = z.infer<typeof outputContractSchema>;
export type UniversalExecutionResult = z.infer<typeof universalExecutionResultSchema>;

export function validateWorkflowV2(data: unknown): WorkflowV2 {
  return workflowV2Schema.parse(data);
}

