import { z } from "zod";

/**
 * HTTP contracts for the platform API, shared by the web client (runtime response validation) and
 * the API test-suite (asserting real responses). Schemas describe implemented behaviour; extra
 * fields are tolerated so additive backend changes do not break older clients.
 */

export const RunStateSchema = z.enum([
  "QUEUED", "STARTING", "RUNNING", "PAUSING", "WAITING_FOR_HUMAN", "HUMAN_CONTROL_ACTIVE",
  "VERIFYING_HANDOFF", "RESUMING", "SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"
]);
export type RunState = z.infer<typeof RunStateSchema>;

export const OutcomeClassificationSchema = z.enum([
  "VERIFIED_SUCCESS", "PARTIAL_COMPLETION", "WAITING_FOR_HUMAN", "FAILED", "UNABLE_TO_VERIFY"
]);
export type OutcomeClassification = z.infer<typeof OutcomeClassificationSchema>;

export const ExperienceSchema = z.enum(["business", "studio", "operations", "admin", "audit"]);
export type Experience = z.infer<typeof ExperienceSchema>;

export const RoleSchema = z.enum(["owner", "admin", "builder", "operator", "auditor", "member", "viewer", "worker"]);

export const ApiErrorSchema = z.looseObject({
  error: z.union([
    z.looseObject({ code: z.string(), message: z.string(), request_id: z.string().optional() }),
    z.string()
  ])
});

export const MeResponseSchema = z.object({
  user: z.looseObject({ id: z.string(), email: z.string().optional() }),
  organization: z.looseObject({ id: z.string(), name: z.string().optional() }),
  role: RoleSchema,
  permissions: z.array(z.string()),
  experiences: z.array(ExperienceSchema)
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const OutcomeSchema = z.looseObject({
  classification: OutcomeClassificationSchema.optional(),
  reason: z.string().optional()
});

export const RunSummarySchema = z.looseObject({
  id: z.string(),
  workflowVersionId: z.string(),
  workerId: z.string().optional(),
  workerName: z.string().optional(),
  state: RunStateSchema,
  runMode: z.string().optional(),
  createdBy: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  outcome: OutcomeSchema.nullable().optional()
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

export const RunListResponseSchema = z.object({ runs: z.array(RunSummarySchema) });

export const RunControlsSchema = z.object({
  canPause: z.boolean(),
  canResume: z.boolean(),
  canCancel: z.boolean(),
  canRetry: z.boolean(),
  canDecide: z.boolean(),
  reasons: z.record(z.string(), z.string())
});
export type RunControls = z.infer<typeof RunControlsSchema>;

export const ExecutionStepSchema = z.looseObject({
  stepId: z.string(),
  state: z.string(),
  strategy: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
  metadata: z.any().optional()
});

export const HitlRequestSchema = z.looseObject({
  id: z.string(),
  runId: z.string(),
  state: z.string(),
  reason: z.string(),
  workflowStepId: z.string().optional(),
  workflowVersionId: z.string().optional(),
  decision: z.string().optional(),
  decidedBy: z.string().optional(),
  decidedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  createdAt: z.string()
});
export type HitlRequest = z.infer<typeof HitlRequestSchema>;

export const PlannedStepSchema = z.looseObject({
  stepId: z.string(),
  name: z.string(),
  operation: z.string(),
  target: z.string()
});

export const RunDetailResponseSchema = z.looseObject({
  run: RunSummarySchema,
  steps: z.array(ExecutionStepSchema),
  planned_steps: z.array(PlannedStepSchema),
  hitl_requests: z.array(HitlRequestSchema),
  result_summary: z.any().nullable(),
  controls: RunControlsSchema,
  workflow_version: z.looseObject({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    createdAt: z.string(),
    status: z.string().optional(),
    stepCount: z.number(),
    sourceRecordingId: z.string().optional()
  }).nullable(),
  worker: z.looseObject({ id: z.string(), name: z.string() }).nullable()
});
export type RunDetailResponse = z.infer<typeof RunDetailResponseSchema>;

export const TaskInputSchema = z.object({ name: z.string(), type: z.string(), required: z.boolean() });

export const TaskSummarySchema = z.object({
  workerId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  publishedVersionId: z.string(),
  publishedAt: z.string().optional(),
  inputs: z.array(TaskInputSchema),
  runnable: z.boolean(),
  blockingIssues: z.array(z.string()),
  lastRun: RunSummarySchema.nullable(),
  pendingApprovals: z.number()
});
export type TaskSummary = z.infer<typeof TaskSummarySchema>;

export const TaskListResponseSchema = z.object({ tasks: z.array(TaskSummarySchema) });
export const TaskDetailResponseSchema = z.object({ task: TaskSummarySchema, recentRuns: z.array(RunSummarySchema) });
export const RunCreatedResponseSchema = z.looseObject({ run: RunSummarySchema });

export const VersionSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  status: z.string(),
  isActive: z.boolean(),
  isPublished: z.boolean(),
  sourceType: z.string().optional(),
  sourceRecordingId: z.string().optional(),
  stepCount: z.number(),
  executable: z.boolean(),
  blockingIssues: z.array(z.string()),
  fidelity: z.string().optional()
});
export type VersionSummary = z.infer<typeof VersionSummarySchema>;
export const VersionListResponseSchema = z.object({ versions: z.array(VersionSummarySchema) });
export const PublishResponseSchema = z.object({
  worker: z.object({ id: z.string(), publishedVersionId: z.string() }),
  version: VersionSummarySchema
});

export const HealthComponentSchema = z.object({
  name: z.string(),
  status: z.enum(["ok", "degraded", "down", "unknown"]),
  detail: z.string(),
  latencyMs: z.number().optional()
});
export const HealthResponseSchema = z.object({
  checkedAt: z.string(),
  components: z.array(HealthComponentSchema),
  queue: z.object({
    byState: z.record(z.string(), z.number()),
    oldestQueuedSeconds: z.number().nullable(),
    stuckRuns: z.array(z.string())
  }),
  incidents: z.array(z.object({
    kind: z.string(),
    severity: z.enum(["critical", "warning"]),
    message: z.string(),
    runId: z.string().optional(),
    at: z.string()
  }))
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const MemberSchema = z.object({
  userId: z.string(),
  role: z.string(),
  email: z.string().optional(),
  displayName: z.string().optional(),
  joinedAt: z.string().optional()
});
export const MembersResponseSchema = z.object({ members: z.array(MemberSchema), assignableRoles: z.array(z.string()) });

export const PoliciesSchema = z.object({
  hitlTimeoutMinutes: z.number().int(),
  membersMayApproveOwnRuns: z.boolean(),
  retryRequiresOperator: z.boolean()
});
export type Policies = z.infer<typeof PoliciesSchema>;
export const PoliciesResponseSchema = z.object({ policies: PoliciesSchema, updatedAt: z.string().nullable() });

export const UsageResponseSchema = z.object({
  periodDays: z.number(),
  runs: z.object({ total: z.number(), byState: z.record(z.string(), z.number()), byOutcome: z.record(z.string(), z.number()) }),
  workflowVersions: z.number(),
  publishedTasks: z.number(),
  pendingApprovals: z.number(),
  provider: z.looseObject({ configured: z.boolean(), state: z.string(), requestsToday: z.number() })
});

export const AuditEventSchema = z.object({
  id: z.string(),
  actorId: z.string().optional(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().optional(),
  metadata: z.record(z.string(), z.any()),
  createdAt: z.string()
});
export const AuditEventsResponseSchema = z.object({ events: z.array(AuditEventSchema) });

export const EvidenceItemSchema = z.object({
  stepId: z.string(),
  kind: z.enum(["screenshot", "verification", "extraction"]),
  capturedAt: z.string().optional(),
  contentType: z.string(),
  data: z.any()
});
export const EvidenceResponseSchema = z.object({ runId: z.string(), workflowVersionId: z.string(), items: z.array(EvidenceItemSchema) });

export const HitlListResponseSchema = z.looseObject({ hitl_requests: z.array(HitlRequestSchema) });
export const DecisionResponseSchema = z.object({ status: z.enum(["APPLIED", "DUPLICATE"]), hitl_request: HitlRequestSchema, run: RunSummarySchema });
