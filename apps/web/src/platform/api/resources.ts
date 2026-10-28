import { z } from "zod";
import {
  AuditEventsResponseSchema, DecisionResponseSchema, EvidenceResponseSchema, HealthResponseSchema, HitlListResponseSchema,
  MeResponseSchema, MembersResponseSchema, PoliciesResponseSchema, PublishResponseSchema, RunCreatedResponseSchema,
  RunDetailResponseSchema, RunListResponseSchema, TaskDetailResponseSchema, TaskListResponseSchema, UsageResponseSchema,
  VersionListResponseSchema, type Policies
} from "@ghost/shared-types/contracts";
import { apiRequest } from "./client.js";

/** One function per backend operation used by the experiences; each declares its contract. */

const enc = encodeURIComponent;
const query = (params: Record<string, string | undefined>) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  return entries.length ? `?${entries.map(([k, v]) => `${k}=${enc(v!)}`).join("&")}` : "";
};

const WorkerSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: z.string(),
  activeVersionId: z.string().optional(),
  publishedVersionId: z.string().optional(),
  workerType: z.string().optional(),
  trainingSource: z.any().optional(),
  updatedAt: z.string().optional()
});
export type Worker = z.infer<typeof WorkerSchema>;

const JobSchema = z.looseObject({
  jobId: z.string(),
  status: z.string(),
  currentStage: z.string().optional(),
  progressPercent: z.number().optional(),
  error: z.string().optional()
});
export type EvidenceJob = z.infer<typeof JobSchema>;

const TimelineSchema = z.looseObject({
  frames: z.array(z.looseObject({ frame_id: z.string(), timestamp_seconds: z.number().optional() })).nullable().optional(),
  semanticActions: z.array(z.any()).nullable().optional(),
  droppedActions: z.array(z.any()).optional(),
  processUnderstanding: z.any().optional(),
  grounding: z.any().nullable().optional(),
  compiledWorkflowVersionId: z.string().nullable().optional()
});
export type Timeline = z.infer<typeof TimelineSchema>;

const EvidenceDocsSchema = z.looseObject({ documents: z.array(z.looseObject({ id: z.string(), name: z.string(), type: z.string(), parsedJson: z.any().optional(), createdAt: z.string().optional() })) });
const ConnectionsSchema = z.looseObject({ connections: z.array(z.looseObject({ id: z.string(), name: z.string(), system: z.string(), connectionType: z.string().optional(), status: z.string().optional(), createdAt: z.string().optional() })) });

export const platformApi = {
  me: () => apiRequest("/api/v1/me", { schema: MeResponseSchema }),

  // Business
  tasks: () => apiRequest("/api/v1/tasks", { schema: TaskListResponseSchema }),
  task: (workerId: string) => apiRequest(`/api/v1/tasks/${enc(workerId)}`, { schema: TaskDetailResponseSchema }),
  launchTask: (workerId: string, versionId: string, inputs: Record<string, string>, idempotencyKey: string) =>
    apiRequest(`/api/v1/tasks/${enc(workerId)}/runs`, { method: "POST", body: { workflow_version_id: versionId, inputs }, schema: RunCreatedResponseSchema, idempotencyKey }),

  // Runs
  runs: (filters: { state?: string; worker_id?: string; outcome?: string; from?: string; to?: string; workflow_version_id?: string } = {}) =>
    apiRequest(`/api/v1/runs${query(filters)}`, { schema: RunListResponseSchema }),
  runDetail: (runId: string) => apiRequest(`/api/v1/runs/${enc(runId)}/detail`, { schema: RunDetailResponseSchema }),
  runEvidence: (runId: string) => apiRequest(`/api/v1/runs/${enc(runId)}/evidence`, { schema: EvidenceResponseSchema }),
  runReport: (runId: string) => apiRequest<Record<string, unknown>>(`/api/v1/runs/${enc(runId)}/report`),
  pauseRun: (runId: string, reason: string) => apiRequest(`/api/v1/runs/${enc(runId)}/pause`, { method: "POST", body: { reason } }),
  resumeRun: (runId: string) => apiRequest(`/api/v1/runs/${enc(runId)}/resume`, { method: "POST" }),
  cancelRun: (runId: string) => apiRequest(`/api/v1/runs/${enc(runId)}/cancel`, { method: "POST" }),
  retryRun: (runId: string, idempotencyKey: string) => apiRequest(`/api/v1/runs/${enc(runId)}/retry`, { method: "POST", schema: RunCreatedResponseSchema, idempotencyKey }),

  // Approvals
  approvals: () => apiRequest("/api/v1/hitl", { schema: HitlListResponseSchema }),
  decide: (hitlId: string, action: "APPROVE" | "REJECT", context: { runId?: string; workflowVersionId?: string; note?: string }) =>
    apiRequest(`/api/v1/hitl/${enc(hitlId)}/decision`, {
      method: "POST",
      body: { action, note: context.note, run_id: context.runId, workflow_version_id: context.workflowVersionId },
      schema: DecisionResponseSchema
    }),

  // Studio
  workers: () => apiRequest("/api/v1/ghost-workers", { schema: z.looseObject({ ghost_workers: z.array(WorkerSchema) }) }),
  worker: (id: string) => apiRequest(`/api/v1/ghost-workers/${enc(id)}`, { schema: WorkerSchema }),
  createWorker: (name: string, description: string) =>
    apiRequest("/api/v1/ghost-workers", { method: "POST", body: { name, description, workerType: "WEB_BROWSER" }, schema: z.looseObject({ id: z.string() }) }),
  evidenceDocuments: (workerId: string) => apiRequest(`/api/v1/ghost-workers/${enc(workerId)}/evidence`, { schema: EvidenceDocsSchema }),
  uploadRecording: (workerId: string, name: string, dataUrl: string) =>
    apiRequest(`/api/v1/ghost-workers/${enc(workerId)}/evidence/upload`, {
      method: "POST", body: { name, content: dataUrl }, timeoutMs: 120_000,
      schema: z.looseObject({ document: z.looseObject({ id: z.string(), name: z.string() }), duplicateOf: z.string().optional() })
    }),
  analyzeRecording: (workerId: string, documentId: string) =>
    apiRequest(`/api/v1/ghost-workers/${enc(workerId)}/evidence/analyze`, { method: "POST", body: { documentId }, schema: z.looseObject({ jobId: z.string(), status: z.string() }) }),
  job: (workerId: string, jobId: string) => apiRequest(`/api/v1/ghost-workers/${enc(workerId)}/evidence/jobs/${enc(jobId)}`, { schema: JobSchema }),
  timeline: (workerId: string, jobId: string) => apiRequest(`/api/v1/ghost-workers/${enc(workerId)}/evidence/jobs/${enc(jobId)}/timeline`, { schema: TimelineSchema }),
  frameUrl: (workerId: string, jobId: string, frameId: string) => `/api/v1/ghost-workers/${enc(workerId)}/evidence/jobs/${enc(jobId)}/frames/${enc(frameId)}`,
  compileJob: (workerId: string, jobId: string, taskObjective: string) =>
    apiRequest<Record<string, any>>(`/api/v1/ghost-workers/${enc(workerId)}/evidence/compile-from-job/${enc(jobId)}`, {
      method: "POST", body: taskObjective ? { taskObjective } : {}, timeoutMs: 300_000
    }),
  versions: (workerId: string) => apiRequest(`/api/v1/ghost-workers/${enc(workerId)}/versions`, { schema: VersionListResponseSchema }),
  workflowVersion: (versionId: string) => apiRequest<{ id: string; workflow: any; createdAt: string }>(`/api/v1/workflows/${enc(versionId)}`),
  publish: (versionId: string, workerId: string) => apiRequest(`/api/v1/workflows/${enc(versionId)}/publish`, { method: "POST", body: { worker_id: workerId }, schema: PublishResponseSchema }),
  testRun: (workerId: string, versionId: string, idempotencyKey: string) =>
    apiRequest(`/api/v1/ghost-workers/${enc(workerId)}/test`, { method: "POST", body: { workflow_version_id: versionId }, schema: RunCreatedResponseSchema, idempotencyKey }),

  // Operations
  health: () => apiRequest("/api/v1/ops/health", { schema: HealthResponseSchema, timeoutMs: 10_000 }),

  // Admin
  members: () => apiRequest("/api/v1/org/members", { schema: MembersResponseSchema }),
  setMemberRole: (userId: string, role: string) => apiRequest(`/api/v1/org/members/${enc(userId)}`, { method: "PATCH", body: { role } }),
  policies: () => apiRequest("/api/v1/org/policies", { schema: PoliciesResponseSchema }),
  updatePolicies: (patch: Partial<Policies>) => apiRequest("/api/v1/org/policies", { method: "PATCH", body: patch, schema: PoliciesResponseSchema }),
  usage: () => apiRequest("/api/v1/org/usage", { schema: UsageResponseSchema }),
  connections: () => apiRequest("/api/v1/connections", { schema: ConnectionsSchema }),
  createConnection: (name: string, system: string, connectionType: string) =>
    apiRequest("/api/v1/connections", { method: "POST", body: { name, system, connection_type: connectionType } }),
  deleteConnection: (id: string) => apiRequest(`/api/v1/connections/${enc(id)}`, { method: "DELETE" }),

  // Audit
  auditEvents: (filters: { action?: string; resource_id?: string; actor_id?: string; from?: string; to?: string } = {}) =>
    apiRequest(`/api/v1/audit/events${query(filters)}`, { schema: AuditEventsResponseSchema }),
  exportRuns: (format: "csv" | "json", filters: { state?: string; from?: string; to?: string } = {}) =>
    apiRequest<string>(`/api/v1/audit/runs/export${query({ format, ...filters })}`, { raw: true })
};
