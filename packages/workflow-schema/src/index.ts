import { z } from "zod";
import { workflowV2Schema, type WorkflowV2 } from "./v2.js";

export const workflowSchemaVersion = "1.0" as const;

export const recordingStateSchema = z.enum([
  "IDLE",
  "RECORDING",
  "STOPPING",
  "PROCESSING",
  "UPLOADING",
  "COMPLETED",
  "FAILED"
]);

export const actionTypeSchema = z.enum([
  "NAVIGATE",
  "CLICK",
  "TYPE",
  "SELECT",
  "UPLOAD",
  "DOWNLOAD",
  "WAIT",
  "EXTRACT",
  "ASSERT",
  "CONDITIONAL",
  "LOOP",
  "HUMAN_INPUT",
  "PAUSE"
]);

export const runStateSchema = z.enum([
  "QUEUED",
  "STARTING",
  "RUNNING",
  "PAUSING",
  "PAUSED",
  "WAITING_FOR_HUMAN",
  "HUMAN_CONTROL_ACTIVE",
  "VERIFYING_HANDOFF",
  "RESUMING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT"
]);

export const stepStateSchema = z.enum([
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "SKIPPED",
  "WAITING_FOR_HUMAN"
]);

export const selectorCandidateSchema = z.object({
  strategy: z.enum(["css", "xpath", "role", "text", "label", "placeholder", "testid"]),
  value: z.string().min(1).max(2048),
  confidence: z.number().min(0).max(1)
});

export const targetEvidenceSchema = z.object({
  tag: z.string().max(80).optional(),
  role: z.string().max(120).optional(),
  accessible_name: z.string().max(500).optional(),
  text: z.string().max(1000).optional(),
  selector_candidates: z.array(selectorCandidateSchema).max(20).default([]),
  attributes: z.record(z.string().max(500)).default({}),
  nearby_context: z.array(z.string().max(500)).max(20).default([])
});

export const recordingEventSchema = z.object({
  event_id: z.string().uuid(),
  sequence: z.number().int().positive(),
  timestamp: z.string().datetime(),
  event_type: z.enum(["click", "input", "change", "select", "keyboard", "submit", "navigation", "url_change"]),
  page: z.object({
    url: z.string().url(),
    title: z.string().max(500)
  }),
  target: targetEvidenceSchema.optional(),
  input: z
    .object({
      value: z.string().max(5000).optional(),
      value_placeholder: z.string().max(200).optional(),
      input_type: z.string().max(80).optional()
    })
    .nullable()
    .default(null),
  screenshot_reference: z.string().max(1000).nullable().default(null),
  viewport: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive()
  }),
  browser: z.object({
    user_agent: z.string().max(1000)
  })
});

export const recordingUploadSchema = z.object({
  recording_id: z.string().uuid(),
  started_at: z.string().datetime(),
  ended_at: z.string().datetime().optional(),
  source: z.enum(["chrome_extension", "test_harness"]),
  events: z.array(recordingEventSchema).min(1).max(2000),
  metadata: z.record(z.unknown()).default({})
});

const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "Only HTTP(S) URLs are allowed");

export const workflowTargetSchema = z.object({
  role: z.string().max(120).optional(),
  name: z.string().max(500).optional(),
  selector_candidates: z.array(selectorCandidateSchema).max(20).default([]),
  expected_url: httpUrlSchema.optional()
});

export const workflowStepSchema = z.object({
  id: z.string().regex(/^step_[a-zA-Z0-9_-]+$/),
  type: actionTypeSchema,
  description: z.string().min(1).max(1000),
  target: workflowTargetSchema.optional(),
  input: z
    .object({
      value: z.string().max(5000).optional(),
      secret_ref: z.string().regex(/^[a-zA-Z0-9_.:-]+$/).optional(),
      file_ref: z.string().max(1000).optional()
    })
    .nullable()
    .default(null),
  preconditions: z.array(z.string().max(1000)).default([]),
  success_conditions: z.array(z.string().max(1000)).default([]),
  failure_policy: z
    .object({
      retry_limit: z.number().int().min(0).max(5).default(1),
      on_failure: z.enum(["FAIL_RUN", "PAUSE_FOR_HUMAN", "SKIP_STEP"]).default("FAIL_RUN")
    })
    .default({ retry_limit: 1, on_failure: "FAIL_RUN" }),
  confidence: z.number().min(0).max(1),
  destructive: z.boolean().default(false)
});

export const anomalyPolicySchema = z.object({
  metric: z.string().min(1).max(120),
  operator: z.enum([">", ">=", "<", "<=", "==", "!="]),
  threshold: z.number(),
  action: z.enum(["REQUIRE_APPROVAL", "PAUSE", "FAIL_RUN"])
});

export const workflowSchema = z.object({
  workflow_version: z.literal(workflowSchemaVersion),
  name: z.string().min(1).max(160),
  description: z.string().max(2000).default(""),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).default("DRAFT"),
  variables: z.array(z.object({ name: z.string().min(1), description: z.string().default("") })).default([]),
  secrets: z.array(z.object({ secret_ref: z.string().min(1), label: z.string().min(1) })).default([]),
  expected_domains: z.array(z.string().min(1)).default([]),
  anomaly_policies: z.array(anomalyPolicySchema).default([]),
  steps: z.array(workflowStepSchema).min(1).max(500),
  compiler: z.object({
    version: z.string().min(1),
    model: z.string().min(1),
    source_recording_id: z.string().uuid(),
    compiled_at: z.string().datetime()
  })
});

export type RecordingState = z.infer<typeof recordingStateSchema>;
export type RecordingEvent = z.infer<typeof recordingEventSchema>;
export type RecordingUpload = z.infer<typeof recordingUploadSchema>;
export type Workflow = z.infer<typeof workflowSchema>;
export type AnyWorkflow = Workflow | WorkflowV2;
export type WorkflowStep = z.infer<typeof workflowStepSchema>;
export type RunState = z.infer<typeof runStateSchema>;
export type StepState = z.infer<typeof stepStateSchema>;
export type AnomalyPolicy = z.infer<typeof anomalyPolicySchema>;

export function validateWorkflow(data: any): Workflow | WorkflowV2 {
  if (data?.workflow_version === "2.0") {
    return workflowV2Schema.parse(data);
  }
  return workflowSchema.parse(data);
}

export * from "./v2.js";
export * from "./semantic-operations.js";
export * from "./language-translator.js";
export * from "./desktop.js";
export * from "./readiness.js";

export function validateRecordingUpload(value: unknown): RecordingUpload {
  return recordingUploadSchema.parse(value);
}

