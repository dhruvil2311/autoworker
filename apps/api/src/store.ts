import crypto from "node:crypto";
import { isLegalRunTransition, validateHitlDecision, HitlDecisionError, HUMAN_WAIT_STATES, TERMINAL_RUN_STATES, type HitlDecisionInput } from "./run-state.js";
import fs from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RecordingUpload, Workflow, AnyWorkflow } from "@ghost/workflow-schema";
import { validateRecordingUpload, validateWorkflow } from "@ghost/workflow-schema";
import { logger } from "@ghost/observability";
// import { ZodError } from "zod";
import type { AuthContext } from "@ghost/shared-types";
import type { ApiConfig } from "./config.js";

function isUUID(str: unknown): str is string {
  return typeof str === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export type RecordingRow = {
  id: string;
  tenantId: string;
  upload: RecordingUpload;
  createdAt: string;
};

export type WorkflowVersionRow = {
  id: string;
  tenantId: string;
  workflowId: string;
  version: number;
  workflow: AnyWorkflow;
  createdAt: string;
};

export type RunRow = {
  id: string;
  tenantId: string;
  workflowVersionId: string;
  state: string;
  idempotencyKey?: string;
  idempotentReplay?: boolean;
  workerId?: string;
  runMode?: string;
  metadata?: Record<string, unknown>;
  resultSummary?: any;
  /** User who launched the run. */
  createdBy?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export type MemberRow = {
  userId: string;
  role: string;
  email?: string | undefined;
  displayName?: string | undefined;
  joinedAt?: string | undefined;
};

export type AuditEventRow = {
  id: string;
  tenantId: string;
  actorId?: string | undefined;
  action: string;
  resourceType: string;
  resourceId?: string | undefined;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ExecutionStepRow = {
  id: string;
  tenantId: string;
  runId: string;
  stepId: string;
  state: string;
  strategy?: string;
  metadata: Record<string, unknown>;
  startedAt?: string;
  finishedAt?: string;
};

export type HitlRequestRow = {
  id: string;
  tenantId: string;
  runId: string;
  reason: string;
  challengeType?: string;
  state: "PENDING" | "CONTROL_ACTIVE" | "VERIFYING" | "RESOLVED" | "EXPIRED" | "CANCELLED";
  workflowStepId?: string | undefined;
  workflowVersionId?: string | undefined;
  expiresAt?: string | undefined;
  decision?: "APPROVE" | "REJECT" | "PROVIDE_VALUE" | undefined;
  decisionPayload?: Record<string, unknown> | undefined;
  decidedBy?: string | undefined;
  decidedAt?: string | undefined;
  createdAt: string;
};

export type HitlDecisionResult = {
  status: "APPLIED" | "DUPLICATE";
  hitl: HitlRequestRow;
  run: RunRow;
};

export type AuditAction =
  | "RECORDING_CREATED"
  | "RECORDING_COMPILED"
  | "WORKFLOW_CREATED"
  | "WORKFLOW_ACTIVATED"
  | "RUN_CREATED"
  | "EXECUTION_PAUSED"
  | "EXECUTION_RESUMED"
  | "RUN_CANCELLED"
  | "HITL_DECISION"
  | "RUNS_SUPERSEDED"
  | "WORKFLOW_PUBLISHED"
  | "RUN_RETRIED"
  | "MEMBER_ROLE_CHANGED"
  | "POLICIES_UPDATED"
  | "AUDIT_EXPORTED";

export interface ExecutionCheckpointRow {
  id: string;
  tenantId: string;
  runId: string;
  workflowVersionId: string;
  sequenceNumber: number;
  cursorJson: string;
  runtimeContextJson: any;
  controlFlowJson: any[];
  sideEffectStateJson: Record<string, string>;
  createdAt: string;
}

export type GhostWorkerRow = {
  id: string;
  tenantId: string;
  name: string;
  description?: string | undefined;
  status: string;
  workflowId?: string;
  activeVersionId?: string;
  /** Version business users run; changes only when a builder publishes. */
  publishedVersionId?: string;
  recordingId?: string;
  bpsId?: string;
  triggerType?: string;
  triggerConfig?: Record<string, unknown>;
  trainingSource?: {
    type: "VIDEO_RECORDING" | "DESKTOP_RECORDING" | "DOCUMENT_SOP" | "CHAT_INSTRUCTION";
    name: string;
    mediaId?: string;
    jobId?: string;
    actionCount?: number;
    frameCount?: number;
    compiledAt?: string;
  } | undefined;
  analysisStage?: string;
  safetyPolicy: Record<string, unknown>;
  workerType?: string | undefined;
  department?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export type ConnectionRow = {
  id: string;
  tenantId: string;
  name: string;
  system: string;
  connectionType: string;
  status: string;
  secretRef: string;
  requiresAttention: boolean;
  lastVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type BPSRow = {
  id: string;
  tenantId: string;
  workerId?: string | undefined;
  recordingId?: string | undefined;
  status: string;
  specificationJson: any;
  generalizationJson: any;
  gapsJson: any[];
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ClarificationAnswerRow = {
  id: string;
  tenantId: string;
  bpsId: string;
  gapId: string;
  answerType: string;
  answerJson: any;
  answeredBy?: string;
  createdAt: string;
};

export type ScheduleRow = {
  id: string;
  tenantId: string;
  workerId: string;
  cronExpression: string;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type NotificationRow = {
  id: string;
  tenantId: string;
  type: string;
  channel: string;
  title: string;
  body?: string | undefined;
  resourceType?: string | undefined;
  resourceId?: string | undefined;
  read: boolean;
  sentAt?: string;
  createdAt: string;
};

export type DocumentRow = {
  id: string;
  tenantId: string;
  workerId: string;
  type: "CSV" | "SOP" | "EXCEL" | "PDF" | "DOCX" | "TXT" | "IMAGE" | "VIDEO" | "DESKTOP_RECORDING";
  name: string;
  parsedJson: any;
  createdAt: string;
};

export type DesktopAgentRow = {
  id: string;
  tenantId: string;
  name: string;
  hostname: string;
  osVersion: string;
  status: "OFFLINE" | "CONNECTED" | "BUSY" | "ERROR" | "REVOKED";
  capabilities: string[];
  activeSessionId?: string | undefined;
  lastHeartbeatAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export type DesktopAgentSessionRow = {
  id: string;
  tenantId: string;
  agentId: string;
  tokenHash: string;
  status: "ACTIVE" | "PAUSED" | "TERMINATED" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
};

export type DesktopExecutionCommandRow = {
  id: string;
  tenantId: string;
  agentId: string;
  executionId: string;
  stepId: string;
  sequenceNumber: number;
  actionType: string;
  payload: any;
  status: "PENDING" | "DISPATCHED" | "EXECUTING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  result?: any;
  error?: string | undefined;
  createdAt: string;
  completedAt?: string | undefined;
};

export type DesktopExecutionEventRow = {
  id: string;
  tenantId: string;
  agentId: string;
  executionId: string;
  stepId: string;
  eventType: string;
  payload: any;
  createdAt: string;
};

export type DesktopCorrectionRow = {
  id: string;
  tenantId: string;
  agentId?: string | undefined;
  executionId?: string | undefined;
  stepId?: string | undefined;
  correctionType: "PROCESS_MEMORY" | "UI_MEMORY";
  originalAction?: any;
  correctedAction?: any;
  ruleOrSelector: string;
  notes?: string | undefined;
  status: "PROPOSED" | "APPLIED" | "DISCARDED";
  createdAt: string;
};

export type DesktopApplicationRegistryRow = {
  id: string;
  tenantId: string;
  applicationId: string;
  displayName: string;
  executablePath?: string | undefined;
  windowTitlePatterns: string[];
  capabilities: string[];
  metadata?: Record<string, unknown> | undefined;
  createdAt: string;
};

export interface AppStore {
  bootstrapWorkspace(userId: string): Promise<{ organizationId: string, role: string }>;
  createRecording(auth: AuthContext, upload: RecordingUpload, idempotencyKey?: string): Promise<RecordingRow>;
  startRecording(auth: AuthContext, data: { source: string; metadata?: Record<string, unknown> }, idempotencyKey?: string): Promise<RecordingRow>;
  appendRecordingEvents(auth: AuthContext, recordingId: string, events: any[]): Promise<void>;
  finishRecording(auth: AuthContext, recordingId: string, endedAt: string): Promise<RecordingRow>;
  listRecordings(auth: AuthContext): Promise<RecordingRow[]>;
  getRecording(auth: AuthContext, id: string): Promise<RecordingRow | undefined>;
  
  createGhostWorker(auth: AuthContext, data: {
    name: string;
    description?: string;
    workerType?: string;
    department?: string;
    capabilities?: string[];
    safetyPolicy?: Record<string, unknown>;
    triggerConfig?: Record<string, unknown>;
    status?: string;
  }): Promise<GhostWorkerRow>;
  listGhostWorkers(auth: AuthContext): Promise<GhostWorkerRow[]>;
  getGhostWorker(auth: AuthContext, id: string): Promise<GhostWorkerRow | undefined>;
  updateGhostWorker(auth: AuthContext, id: string, updates: Partial<GhostWorkerRow>): Promise<GhostWorkerRow | undefined>;
  
  addChatInstruction(auth: AuthContext, workerId: string, instruction: string): Promise<any>;
  addMemoryRule(auth: AuthContext, workerId: string, rule: string, structuredData?: any): Promise<any>;
  getWorkerMemory(auth: AuthContext, workerId: string): Promise<any>;
  deleteMemoryItem(auth: AuthContext, workerId: string, memoryId: string): Promise<boolean>;
  purgeWorkerMemory?(auth: AuthContext, workerId: string): Promise<boolean>;
  getWorkerEvidence(auth: AuthContext, workerId: string): Promise<any>;
  
  createWorkflowVersion(auth: AuthContext, workflow: AnyWorkflow): Promise<WorkflowVersionRow>;
  listWorkflows(auth: AuthContext): Promise<WorkflowVersionRow[]>;
  deleteWorkflowVersion?(auth: AuthContext, id: string): Promise<boolean>;
  getWorkflowVersion(auth: AuthContext, id: string): Promise<WorkflowVersionRow | undefined>;
  activateWorkflowVersion(auth: AuthContext, versionId: string): Promise<WorkflowVersionRow | undefined>;
  createRun(auth: AuthContext, workflowVersionId: string, idempotencyKey?: string, workerId?: string, runMode?: string, inputs?: Record<string, unknown>): Promise<RunRow>;
  takeHitlControl(tenantId: string, userId: string, runId: string): Promise<{ run: RunRow; hitlRequest: any }>;
  completeHitlIntervention(tenantId: string, runId: string): Promise<void>;
  claimRun(auth: AuthContext, runId: string): Promise<RunRow | undefined>;
  updateRunState(auth: AuthContext, runId: string, state: string, metadata?: any): Promise<RunRow | undefined>;
  getRun(auth: AuthContext, runId: string): Promise<RunRow | undefined>;
  listRuns(auth: AuthContext): Promise<RunRow[]>;
  createExecutionStep(auth: AuthContext, step: ExecutionStepRow): Promise<void>;
  updateExecutionStep(auth: AuthContext, runId: string, stepId: string, updates: Partial<ExecutionStepRow>): Promise<void>;
  listExecutionSteps(auth: AuthContext, runId: string): Promise<ExecutionStepRow[]>;
  saveExecutionCheckpoint(auth: AuthContext, checkpoint: Omit<ExecutionCheckpointRow, "id" | "createdAt">): Promise<void>;
  loadExecutionCheckpoint(auth: AuthContext, runId: string): Promise<ExecutionCheckpointRow | undefined>;
  createHitlRequest(auth: AuthContext, params: { runId: string, workflowStepId: string, challengeType: string, expiresAt: string }): Promise<void>;
  listHitlRequests(auth: AuthContext): Promise<HitlRequestRow[]>;
  /**
   * Records an approval, rejection or provided value for a pending HITL request and moves the run
   * accordingly. Idempotent for an identical repeat; a conflicting or late decision is rejected.
   */
  decideHitlRequest(auth: AuthContext, hitlId: string, decision: HitlDecisionInput): Promise<HitlDecisionResult>;
  /** Cancels a worker's in-flight runs (history is kept) when its workflow is replaced. */
  supersedeWorkerRuns(auth: AuthContext, workerId: string, reason: string): Promise<number>;
  writeAudit(auth: AuthContext, action: AuditAction, resourceType: string, resourceId?: string, metadata?: Record<string, unknown>): Promise<void>;
  listAudits(auth: AuthContext): Promise<AuditEventRow[]>;
  listMembers(auth: AuthContext): Promise<MemberRow[]>;
  /** Registers the caller as a member if absent (development auth only). */
  ensureMember(auth: AuthContext): Promise<void>;
  updateMemberRole(auth: AuthContext, userId: string, role: string): Promise<MemberRow | undefined>;
  getOrgSettings(auth: AuthContext): Promise<Record<string, any>>;
  updateOrgSettings(auth: AuthContext, patch: Record<string, any>): Promise<Record<string, any>>;
  listWorkflowVersionsForWorker(auth: AuthContext, workerId: string, knownIds?: string[]): Promise<WorkflowVersionRow[]>;

  // BPS
  createBPS(auth: AuthContext, data: { workerId: string; recordingId?: string; status: string; specificationJson: any; generalizationJson: any; gapsJson: any[] }): Promise<BPSRow>;
  getBPS(auth: AuthContext, id: string): Promise<BPSRow | undefined>;
  updateBPS(auth: AuthContext, id: string, updates: Partial<BPSRow>): Promise<BPSRow | undefined>;
  listBPSByWorker(auth: AuthContext, workerId: string): Promise<BPSRow[]>;
  terminateWorkerRuns(auth: AuthContext, workerIds: string[]): Promise<void>;
  purgeWorkerRuns(auth: AuthContext, workerIds: string[]): Promise<void>;

  // Clarification
  submitClarificationAnswer(auth: AuthContext, data: { bpsId: string; gapId: string; answerType: string; answerJson: any }): Promise<ClarificationAnswerRow>;
  listClarificationAnswers(auth: AuthContext, bpsId: string): Promise<ClarificationAnswerRow[]>;

  // Schedules
  createSchedule(auth: AuthContext, data: { workerId: string; cronExpression: string }): Promise<ScheduleRow>;
  getSchedule(auth: AuthContext, id: string): Promise<ScheduleRow | undefined>;
  updateSchedule(auth: AuthContext, id: string, updates: Partial<ScheduleRow>): Promise<ScheduleRow | undefined>;
  deleteSchedule(auth: AuthContext, id: string): Promise<boolean>;
  listSchedules(auth: AuthContext, workerId?: string): Promise<ScheduleRow[]>;
  listDueSchedules(): Promise<ScheduleRow[]>;

  // Connections
  createConnection(auth: AuthContext, data: { name: string; system: string; connectionType: string; secretRef: string }): Promise<ConnectionRow>;
  listConnections(auth: AuthContext): Promise<ConnectionRow[]>;
  getConnection(auth: AuthContext, id: string): Promise<ConnectionRow | undefined>;
  deleteConnection(auth: AuthContext, id: string): Promise<boolean>;

  // Notifications
  createNotification(auth: AuthContext, data: { type: string; channel: string; title: string; body?: string; resourceType?: string; resourceId?: string }): Promise<NotificationRow>;
  listNotifications(auth: AuthContext): Promise<NotificationRow[]>;
  markNotificationRead(auth: AuthContext, id: string): Promise<void>;

  // Run result
  updateRunResult(auth: AuthContext, runId: string, resultSummary: any): Promise<void>;

  // Documents
  createDocument(auth: AuthContext, data: { workerId: string; type: "CSV" | "SOP" | "EXCEL" | "PDF" | "DOCX" | "TXT" | "IMAGE" | "VIDEO" | "DESKTOP_RECORDING"; name: string; parsedJson: any }): Promise<DocumentRow>;
  listDocuments(auth: AuthContext, workerId: string): Promise<DocumentRow[]>;
  getDocument(auth: AuthContext, id: string): Promise<DocumentRow | undefined>;
  deleteDocument(auth: AuthContext, id: string): Promise<boolean>;

  // Background Tasks (Durable Queue)
  enqueueTask(tenantId: string, type: string, payload: any, delayMs?: number): Promise<string>;
  pollTasks(limit?: number): Promise<any[]>;
  completeTask(taskId: string): Promise<void>;
  failTask(taskId: string, error: unknown): Promise<void>;

  // Desktop Computer Execution
  registerDesktopAgent(auth: AuthContext, data: { name: string; hostname: string; osVersion: string; capabilities: string[] }): Promise<{ agent: DesktopAgentRow; session: DesktopAgentSessionRow; token: string }>;
  getDesktopAgent(auth: AuthContext, id: string): Promise<DesktopAgentRow | undefined>;
  listDesktopAgents(auth: AuthContext): Promise<DesktopAgentRow[]>;
  updateDesktopAgentHeartbeat(auth: AuthContext, agentId: string, status?: string): Promise<void>;
  revokeDesktopAgent(auth: AuthContext, agentId: string): Promise<void>;

  createDesktopCommand(auth: AuthContext, data: Omit<DesktopExecutionCommandRow, "id" | "tenantId" | "status" | "createdAt">): Promise<DesktopExecutionCommandRow>;
  pollDesktopCommands(auth: AuthContext, agentId: string): Promise<DesktopExecutionCommandRow[]>;
  updateDesktopCommandStatus(auth: AuthContext, commandId: string, status: string, result?: any, error?: string): Promise<void>;

  recordDesktopEvent(auth: AuthContext, event: Omit<DesktopExecutionEventRow, "id" | "tenantId" | "createdAt">): Promise<void>;
  listDesktopEvents(auth: AuthContext, executionId: string): Promise<DesktopExecutionEventRow[]>;

  saveDesktopCorrection(auth: AuthContext, data: Omit<DesktopCorrectionRow, "id" | "tenantId" | "createdAt">): Promise<DesktopCorrectionRow>;
  listDesktopCorrections(auth: AuthContext, executionId?: string): Promise<DesktopCorrectionRow[]>;

  registerDesktopApplication(auth: AuthContext, data: Omit<DesktopApplicationRegistryRow, "id" | "tenantId" | "createdAt">): Promise<DesktopApplicationRegistryRow>;
  listDesktopApplications(auth: AuthContext): Promise<DesktopApplicationRegistryRow[]>;
}

export function createStore(config: ApiConfig): AppStore {
  if (config.storageProvider === "memory") {
    if (config.nodeEnv === "production") {
      throw new Error("Memory storage is strictly forbidden in production. Set STORAGE_PROVIDER=supabase.");
    }
    if (!config.allowInMemoryStorage) {
      throw new Error("Memory storage must be explicitly enabled via ALLOW_MEMORY_STORAGE=true");
    }
    return new InMemoryStore();
  }

  const hasSupabaseConfig = Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);
  if (hasSupabaseConfig) {
    return new SupabaseStore(createClient(config.supabaseUrl!, config.supabaseServiceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false }
    }));
  }

  if (config.nodeEnv === "production" || config.storageProvider === "supabase") {
    throw new Error("Supabase storage requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }

  if (!config.allowInMemoryStorage) {
    throw new Error("No storage backend configured. Set STORAGE_PROVIDER=supabase or enable ALLOW_MEMORY_STORAGE=true");
  }

  return new InMemoryStore();
}

export class InMemoryStore implements AppStore {
  recordings = new Map<string, RecordingRow>();
  workflows = new Map<string, WorkflowVersionRow>();
  runs = new Map<string, any>();
  steps = new Map<string, ExecutionStepRow>();
  hitl = new Map<string, HitlRequestRow>();
  checkpoints = new Map<string, ExecutionCheckpointRow>();
  workers = new Map<string, GhostWorkerRow>();
  bpsList = new Map<string, BPSRow>();
  clarifications = new Map<string, ClarificationAnswerRow>();
  schedulesList = new Map<string, ScheduleRow>();
  connectionsList = new Map<string, ConnectionRow>();
  notificationsList = new Map<string, NotificationRow>();
  documentsList = new Map<string, DocumentRow>();
  auditsList = new Map<string, any>();
  memoryList = new Map<string, any>();
  desktopAgents = new Map<string, DesktopAgentRow>();
  desktopSessions = new Map<string, DesktopAgentSessionRow>();
  desktopCommands = new Map<string, DesktopExecutionCommandRow>();
  desktopEventsList: DesktopExecutionEventRow[] = [];
  desktopCorrectionsList = new Map<string, DesktopCorrectionRow>();
  desktopAppRegistryList = new Map<string, DesktopApplicationRegistryRow>();
  membersList = new Map<string, MemberRow & { tenantId: string }>();
  orgSettings = new Map<string, Record<string, any>>();

  constructor() {}

  async bootstrapWorkspace(userId: string) {
    return { organizationId: "6ef50df4-58bb-48e3-9796-d25ba85d4dac", role: "owner" };
  }

  seedDefaultWorkers(auth: AuthContext) {
    // Only workers created from real evidence are listed
  }

  async createGhostWorker(auth: AuthContext, data: {
    name: string;
    description?: string;
    workerType?: string;
    department?: string;
    capabilities?: string[];
    safetyPolicy?: Record<string, unknown>;
    triggerConfig?: Record<string, unknown>;
    status?: string;
  }): Promise<GhostWorkerRow> {
    const workerType = data.workerType || (data.safetyPolicy as any)?.workerType || "WEB_BROWSER";
    const department = data.department || (data.safetyPolicy as any)?.department;
    const safetyPolicy: Record<string, unknown> = {
      ...(data.safetyPolicy || {}),
      workerType,
      department,
      capabilities: data.capabilities || (data.safetyPolicy as any)?.capabilities || ["browser", "desktop", "human", "api"]
    };
    const row: GhostWorkerRow = {
      id: crypto.randomUUID(),
      tenantId: auth.tenantId,
      name: data.name,
      description: data.description,
      status: data.status || "NEW",
      workerType,
      department,
      safetyPolicy,
      triggerConfig: { ...(data.triggerConfig || {}), workerType },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.workers.set(row.id, row);
    return row;
  }

  async listGhostWorkers(auth: AuthContext): Promise<GhostWorkerRow[]> {
    const workerMap = new Map<string, GhostWorkerRow>();
    for (const w of this.workers.values()) {
      if (w.tenantId === auth.tenantId) {
        const key = (w.name || "").trim().toLowerCase();
        if (!workerMap.has(key)) {
          workerMap.set(key, w);
        } else {
          const existing = workerMap.get(key)!;
          if (!existing.activeVersionId && w.activeVersionId) {
            workerMap.set(key, w);
          }
        }
      }
    }
    return [...workerMap.values()];
  }

  async getGhostWorker(auth: AuthContext, id: string): Promise<GhostWorkerRow | undefined> {
    let row = this.workers.get(id);
    if (!row) {
      row = [...this.workers.values()].find(w => (w.id === id || w.name.toLowerCase() === id.toLowerCase()) && (!auth?.tenantId || w.tenantId === auth.tenantId));
    }
    if (row && auth?.tenantId && row.tenantId !== auth.tenantId) {
      return undefined;
    }
    // A worker's workflow is its own: never borrow another (same-named) worker's active version.
    return row;
  }

  async addChatInstruction(auth: AuthContext, workerId: string, instruction: string) {
    const row = { id: crypto.randomUUID(), tenantId: auth.tenantId, workerId, type: "INSTRUCTION", content: instruction, structured_data: {}, createdAt: new Date().toISOString() };
    this.memoryList.set(row.id, row);
    return row;
  }

  async addMemoryRule(auth: AuthContext, workerId: string, rule: string, structuredData?: any) {
    const row = { id: crypto.randomUUID(), tenantId: auth.tenantId, workerId, type: "RULE", content: rule, structured_data: structuredData || {}, createdAt: new Date().toISOString() };
    this.memoryList.set(row.id, row);
    return row;
  }

  async getWorkerMemory(auth: AuthContext, workerId: string) {
    const memory = [...this.memoryList.values()].filter(m => m.tenantId === auth.tenantId && m.workerId === workerId);
    return { 
      rules: memory.filter(m => m.type === "RULE"), 
      instructions: memory.filter(m => m.type === "INSTRUCTION") 
    };
  }

  async deleteMemoryItem(auth: AuthContext, workerId: string, memoryId: string): Promise<boolean> {
    const memory = this.memoryList.get(memoryId);
    if (!memory || memory.tenantId !== auth.tenantId) {
      return false;
    }
    return this.memoryList.delete(memoryId);
  }

  async purgeWorkerMemory(auth: AuthContext, workerId: string): Promise<boolean> {
    for (const [id, m] of this.memoryList.entries()) {
      if (m.workerId === workerId && m.tenantId === auth.tenantId) {
        this.memoryList.delete(id);
      }
    }
    return true;
  }

  async getWorkerEvidence(auth: AuthContext, workerId: string) {
    return { documents: [], recordings: [] };
  }

  async updateGhostWorker(auth: AuthContext, id: string, updates: Partial<GhostWorkerRow>): Promise<GhostWorkerRow | undefined> {
    const row = this.workers.get(id);
    if (!row || row.tenantId !== auth.tenantId) return undefined;
    Object.assign(row, updates);
    // A field is cleared only when the update names it explicitly with null/undefined; omitting a
    // field (e.g. a status-only update) must leave the worker's workflow binding intact.
    for (const key of ["activeVersionId", "publishedVersionId", "workflowId", "bpsId", "trainingSource"] as const) {
      if (key in updates && (updates as any)[key] == null) delete (row as any)[key];
    }
    row.updatedAt = new Date().toISOString();
    return row;
  }

  async createRecording(auth: AuthContext, upload: RecordingUpload, idempotencyKey?: string): Promise<RecordingRow> {
    const existingById = this.recordings.get(upload.recording_id);
    if (existingById?.tenantId === auth.tenantId) return existingById;

    const existingByKey = idempotencyKey
      ? [...this.recordings.values()].find((row) => row.tenantId === auth.tenantId && row.upload.metadata?.idempotency_key === idempotencyKey)
      : undefined;
    if (existingByKey) return existingByKey;

    const metadata = { ...(upload.metadata ?? {}), ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}) };
    const row = { id: upload.recording_id, tenantId: auth.tenantId, upload: { ...upload, metadata }, createdAt: new Date().toISOString() };
    this.recordings.set(row.id, row);
    return row;
  }

  async startRecording(auth: AuthContext, data: { source: string; metadata?: Record<string, unknown> }, idempotencyKey?: string): Promise<RecordingRow> {
    const existingByKey = idempotencyKey
      ? [...this.recordings.values()].find((row) => row.tenantId === auth.tenantId && row.upload.metadata?.idempotency_key === idempotencyKey)
      : undefined;
    if (existingByKey) return existingByKey;

    const recordingId = crypto.randomUUID();
    const metadata = { ...(data.metadata ?? {}), ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}) };
    const row = { 
      id: recordingId, 
      tenantId: auth.tenantId, 
      upload: { 
        recording_id: recordingId,
        source: data.source as "chrome_extension" | "test_harness",
        started_at: new Date().toISOString(),
        metadata,
        events: []
      }, 
      createdAt: new Date().toISOString() 
    };
    this.recordings.set(row.id, row);
    return row;
  }

  async appendRecordingEvents(auth: AuthContext, recordingId: string, events: any[]): Promise<void> {
    const row = this.recordings.get(recordingId);
    if (row && row.tenantId === auth.tenantId) {
      row.upload.events.push(...events);
    }
  }

  async finishRecording(auth: AuthContext, recordingId: string, endedAt: string): Promise<RecordingRow> {
    const row = this.recordings.get(recordingId);
    if (!row || row.tenantId !== auth.tenantId) throw new Error("Recording not found");
    row.upload.ended_at = endedAt;
    return row;
  }

  async listRecordings(auth: AuthContext): Promise<RecordingRow[]> {
    return [...this.recordings.values()].filter((row) => row.tenantId === auth.tenantId);
  }

  async getRecording(auth: AuthContext, id: string): Promise<RecordingRow | undefined> {
    const row = this.recordings.get(id);
    return row?.tenantId === auth.tenantId ? row : undefined;
  }

  async createWorkflowVersion(auth: AuthContext, workflow: AnyWorkflow): Promise<WorkflowVersionRow> {
    const workflowId = crypto.randomUUID();
    const row = {
      id: crypto.randomUUID(),
      tenantId: auth.tenantId,
      workflowId,
      version: 1,
      workflow,
      createdAt: new Date().toISOString()
    };
    this.workflows.set(row.id, row);
    return row;
  }

  async listWorkflows(auth: AuthContext): Promise<WorkflowVersionRow[]> {
    return [...this.workflows.values()].filter((row) => row.tenantId === auth.tenantId);
  }

  async deleteWorkflowVersion(auth: AuthContext, id: string): Promise<boolean> {
    for (const [key, row] of this.workflows.entries()) {
      if ((row.id === id || row.workflowId === id) && row.tenantId === auth.tenantId) {
        this.workflows.delete(key);
      }
    }
    return true;
  }

  async getWorkflowVersion(auth: AuthContext, id: string): Promise<WorkflowVersionRow | undefined> {
    const row = this.workflows.get(id);
    return row?.tenantId === auth.tenantId ? row : undefined;
  }

  async activateWorkflowVersion(auth: AuthContext, versionId: string): Promise<WorkflowVersionRow | undefined> {
    const row = await this.getWorkflowVersion(auth, versionId);
    if (!row) return undefined;
    row.workflow.status = "ACTIVE";
    return row;
  }

  async createRun(auth: AuthContext, workflowVersionId: string, idempotencyKey?: string, workerId?: string, runMode?: string, inputs?: Record<string, unknown>): Promise<RunRow> {
    if (idempotencyKey) {
      const existing = [...this.runs.values()].find((run) => run.tenantId === auth.tenantId && run.idempotencyKey === idempotencyKey);
      if (existing) return { ...existing, idempotentReplay: true };
    }
    const now = new Date().toISOString();
    const row: RunRow = {
      id: crypto.randomUUID(),
      tenantId: auth.tenantId,
      workflowVersionId,
      state: "QUEUED",
      createdBy: auth.userId,
      createdAt: now,
      updatedAt: now
    };
    if (inputs && Object.keys(inputs).length) row.metadata = { inputs };
    if (idempotencyKey) row.idempotencyKey = idempotencyKey;
    if (workerId) row.workerId = workerId;
    if (runMode) row.runMode = runMode;
    this.runs.set(row.id, row);
    return row;
  }

  async takeHitlControl(tenantId: string, userId: string, runId: string): Promise<{ run: RunRow; hitlRequest: any }> {
    const run = this.runs.get(runId);
    if (!run || run.tenantId !== tenantId) throw new Error("Run not found");
    if (run.state !== "WAITING_FOR_HUMAN") throw new Error("Run is not waiting for human");
    run.state = "HUMAN_CONTROL_ACTIVE";
    return { run, hitlRequest: { id: crypto.randomUUID(), state: "CONTROL_ACTIVE" } };
  }

  async completeHitlIntervention(tenantId: string, runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run || run.tenantId !== tenantId) throw new Error("Run not found");
    if (run.state !== "HUMAN_CONTROL_ACTIVE") throw new Error("Run is not under human control");
    run.state = "VERIFYING_HANDOFF";
  }

  async claimRun(auth: AuthContext, runId: string): Promise<RunRow | undefined> {
    const row = this.runs.get(runId);
    if (!row || row.tenantId !== auth.tenantId || row.state !== "QUEUED") return undefined;
    row.state = "STARTING";
    return row;
  }

  async updateRunState(auth: AuthContext, runId: string, state?: string, metadata?: any): Promise<RunRow | undefined> {
    const run = this.runs.get(runId);
    if (!run || run.tenantId !== auth.tenantId) return undefined;
    
    if (state && run.state !== state) {
      if (!isLegalRunTransition(run.state, state)) return undefined;
      run.state = state;
    }
    if (metadata) {
      run.metadata = { ...(run.metadata || {}), ...metadata };
      if (metadata.resultSummary) {
        run.resultSummary = metadata.resultSummary;
      }
    }
    run.updatedAt = new Date().toISOString();
    return run;
  }

  async getRun(auth: AuthContext, runId: string): Promise<RunRow | undefined> {
    const row = this.runs.get(runId);
    if (!row || row.tenantId !== auth.tenantId) return undefined;
    if (["RUNNING", "STARTING", "QUEUED"].includes(row.state)) {
      const ageMs = Date.now() - new Date(row.createdAt).getTime();
      if (ageMs > 15 * 60 * 1000) {
        row.state = "FAILED";
        row.resultSummary = "Execution timed out (zombie run expired)";
      }
    }
    return row;
  }

  async listRuns(auth: AuthContext): Promise<RunRow[]> {
    const runs = [...this.runs.values()].filter((row) => row.tenantId === auth.tenantId);
    const now = Date.now();
    for (const row of runs) {
      if (["RUNNING", "STARTING", "QUEUED"].includes(row.state)) {
        const ageMs = now - new Date(row.createdAt).getTime();
        if (ageMs > 15 * 60 * 1000) {
          row.state = "FAILED";
          row.resultSummary = "Execution timed out (zombie run expired)";
        }
      }
    }
    return runs;
  }

  async createExecutionStep(auth: AuthContext, step: ExecutionStepRow): Promise<void> {
    this.steps.set(`${step.runId}:${step.stepId}`, step);
  }
  
  async updateExecutionStep(auth: AuthContext, runId: string, stepId: string, updates: Partial<ExecutionStepRow>): Promise<void> {
    const key = `${runId}:${stepId}`;
    const step = this.steps.get(key);
    if (step) {
      Object.assign(step, updates);
    }
  }

  async listExecutionSteps(auth: AuthContext, runId: string): Promise<ExecutionStepRow[]> {
    return [...this.steps.values()].filter((row) => row.tenantId === auth.tenantId && row.runId === runId);
  }

  async saveExecutionCheckpoint(auth: AuthContext, checkpoint: Omit<ExecutionCheckpointRow, "id" | "createdAt">): Promise<void> {
    const row: ExecutionCheckpointRow = {
      id: crypto.randomUUID(),
      ...checkpoint,
      createdAt: new Date().toISOString()
    };
    // Replace any existing checkpoint for this run
    for (const [key, val] of this.checkpoints.entries()) {
      if (val.tenantId === auth.tenantId && val.runId === checkpoint.runId) {
        this.checkpoints.delete(key);
      }
    }
    this.checkpoints.set(row.id, row);
  }

  async loadExecutionCheckpoint(auth: AuthContext, runId: string): Promise<ExecutionCheckpointRow | undefined> {
    const checkpoint = [...this.checkpoints.values()].find((row) => row.tenantId === auth.tenantId && row.runId === runId);
    return checkpoint;
  }

  async createHitlRequest(auth: AuthContext, params: { runId: string, workflowStepId: string, challengeType: string, expiresAt: string }): Promise<void> {
    const run = this.runs.get(params.runId);
    const id = crypto.randomUUID();
    this.hitl.set(id, {
      id,
      tenantId: auth.tenantId,
      runId: params.runId,
      reason: params.challengeType,
      challengeType: params.challengeType,
      state: "PENDING",
      workflowStepId: params.workflowStepId,
      workflowVersionId: run?.workflowVersionId,
      expiresAt: params.expiresAt,
      createdAt: new Date().toISOString()
    });
    
    await this.createNotification(auth, {
      type: "HITL",
      channel: "in_app",
      title: "Human Action Required",
      body: `A ghost requires your help to proceed. Reason: ${params.challengeType}`,
      resourceType: "run",
      resourceId: params.runId
    });
  }

  async listHitlRequests(auth: AuthContext): Promise<HitlRequestRow[]> {
    return [...this.hitl.values()].filter((row) => row.tenantId === auth.tenantId);
  }

  async decideHitlRequest(auth: AuthContext, hitlId: string, decision: HitlDecisionInput): Promise<HitlDecisionResult> {
    validateHitlDecision(decision);
    const hitl = this.hitl.get(hitlId);
    if (!hitl || hitl.tenantId !== auth.tenantId) throw new HitlDecisionError("NOT_FOUND", "HITL request not found");
    const run = this.runs.get(hitl.runId);
    if (!run || run.tenantId !== auth.tenantId) throw new HitlDecisionError("NOT_FOUND", "Linked run not found");
    const payload = { value: decision.value, note: decision.note };

    if (hitl.state === "RESOLVED") {
      if (hitl.decision === decision.action && JSON.stringify(hitl.decisionPayload?.value) === JSON.stringify(decision.value)) {
        return { status: "DUPLICATE", hitl, run };
      }
      throw new HitlDecisionError("STALE_DECISION", `This request was already decided (${hitl.decision}).`);
    }
    if (hitl.state !== "PENDING" && hitl.state !== "CONTROL_ACTIVE") {
      throw new HitlDecisionError("STALE_DECISION", `This request is ${hitl.state.toLowerCase()} and can no longer be decided.`);
    }
    if (decision.expectedRunId && decision.expectedRunId !== hitl.runId) {
      throw new HitlDecisionError("STALE_DECISION", "The decision refers to a different run.");
    }
    if (decision.expectedWorkflowVersionId && decision.expectedWorkflowVersionId !== run.workflowVersionId) {
      throw new HitlDecisionError("STALE_DECISION", "The decision refers to a different workflow version than the paused run.");
    }
    if (hitl.expiresAt && Date.parse(hitl.expiresAt) < Date.now()) {
      hitl.state = "EXPIRED";
      if (isLegalRunTransition(run.state, "TIMED_OUT")) {
        run.state = "TIMED_OUT";
        run.resultSummary = { outcome: "WAITING_FOR_HUMAN_TIMED_OUT", hitlRequestId: hitl.id };
        run.updatedAt = new Date().toISOString();
      }
      throw new HitlDecisionError("EXPIRED", "The approval window for this request has expired.");
    }
    if (!HUMAN_WAIT_STATES.has(run.state)) {
      throw new HitlDecisionError("RUN_NOT_WAITING", `The run is ${run.state}; it is not waiting for a decision.`);
    }

    hitl.state = "RESOLVED";
    hitl.decision = decision.action;
    hitl.decisionPayload = payload;
    hitl.decidedBy = auth.userId;
    hitl.decidedAt = new Date().toISOString();

    if (decision.action === "REJECT") {
      run.state = "CANCELLED";
      run.resultSummary = { outcome: "REJECTED_BY_HUMAN", hitlRequestId: hitl.id, stepId: hitl.workflowStepId, note: decision.note };
      for (const other of this.hitl.values()) {
        if (other.runId === run.id && other.id !== hitl.id && (other.state === "PENDING" || other.state === "CONTROL_ACTIVE")) other.state = "CANCELLED";
      }
    } else {
      if (run.state === "HUMAN_CONTROL_ACTIVE") run.state = "VERIFYING_HANDOFF";
      run.state = "RESUMING";
    }
    run.updatedAt = new Date().toISOString();
    await this.writeAudit(auth, "HITL_DECISION", "execution_run", run.id, {
      hitl_request_id: hitl.id, decision: decision.action, step_id: hitl.workflowStepId,
      workflow_version_id: run.workflowVersionId, resulting_state: run.state, note: decision.note
    });
    return { status: "APPLIED", hitl, run };
  }

  async supersedeWorkerRuns(auth: AuthContext, workerId: string, reason: string): Promise<number> {
    let count = 0;
    for (const run of this.runs.values()) {
      if (run.tenantId !== auth.tenantId || run.workerId !== workerId || TERMINAL_RUN_STATES.has(run.state)) continue;
      run.state = "CANCELLED";
      run.resultSummary = { outcome: "SUPERSEDED", reason };
      run.updatedAt = new Date().toISOString();
      count++;
    }
    if (count) await this.writeAudit(auth, "RUNS_SUPERSEDED", "ghost_worker", workerId, { cancelled_runs: count, reason });
    return count;
  }

  async writeAudit(auth: AuthContext, action: AuditAction, resourceType: string, resourceId?: string, metadata?: Record<string, unknown>): Promise<void> {
    const auditId = crypto.randomUUID();
    this.auditsList.set(auditId, {
      id: auditId,
      tenantId: auth.tenantId,
      actorId: auth.userId,
      action,
      resourceType,
      resourceId,
      metadata,
      createdAt: new Date().toISOString()
    });
  }

  async listAudits(auth: AuthContext): Promise<AuditEventRow[]> {
    return Array.from(this.auditsList.values())
      .filter(a => a.tenantId === auth.tenantId)
      .map(a => ({ ...a, metadata: a.metadata || {} }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async listMembers(auth: AuthContext): Promise<MemberRow[]> {
    return [...this.membersList.values()].filter(m => m.tenantId === auth.tenantId).map(({ tenantId, ...m }) => m);
  }

  async ensureMember(auth: AuthContext): Promise<void> {
    const key = `${auth.tenantId}:${auth.userId}`;
    if (!this.membersList.has(key)) {
      this.membersList.set(key, { tenantId: auth.tenantId, userId: auth.userId, role: auth.role, joinedAt: new Date().toISOString() });
    }
  }

  async updateMemberRole(auth: AuthContext, userId: string, role: string): Promise<MemberRow | undefined> {
    const member = this.membersList.get(`${auth.tenantId}:${userId}`);
    if (!member) return undefined;
    member.role = role;
    const { tenantId, ...rest } = member;
    return rest;
  }

  async getOrgSettings(auth: AuthContext): Promise<Record<string, any>> {
    return { ...(this.orgSettings.get(auth.tenantId) || {}) };
  }

  async updateOrgSettings(auth: AuthContext, patch: Record<string, any>): Promise<Record<string, any>> {
    const next = { ...(this.orgSettings.get(auth.tenantId) || {}), ...patch };
    this.orgSettings.set(auth.tenantId, next);
    return { ...next };
  }

  async listWorkflowVersionsForWorker(auth: AuthContext, workerId: string, knownIds: string[] = []): Promise<WorkflowVersionRow[]> {
    return [...this.workflows.values()]
      .filter(v => v.tenantId === auth.tenantId && ((v.workflow as any)?.compiler?.worker_id === workerId || knownIds.includes(v.id)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // BPS
  async createBPS(auth: AuthContext, data: { workerId: string; recordingId?: string; status: string; specificationJson: any; generalizationJson: any; gapsJson: any[] }): Promise<BPSRow> {
    const row: BPSRow = {
      id: crypto.randomUUID(), tenantId: auth.tenantId, workerId: data.workerId, recordingId: data.recordingId,
      status: data.status, specificationJson: data.specificationJson, generalizationJson: data.generalizationJson,
      gapsJson: data.gapsJson, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    this.bpsList.set(row.id, row);
    return row;
  }
  async getBPS(auth: AuthContext, id: string): Promise<BPSRow | undefined> {
    const row = this.bpsList.get(id);
    return row?.tenantId === auth.tenantId ? row : undefined;
  }
  async updateBPS(auth: AuthContext, id: string, updates: Partial<BPSRow>): Promise<BPSRow | undefined> {
    const row = this.bpsList.get(id);
    if (!row || row.tenantId !== auth.tenantId) return undefined;
    Object.assign(row, updates, { updatedAt: new Date().toISOString() });
    return row;
  }
  async listBPSByWorker(auth: AuthContext, workerId: string): Promise<BPSRow[]> {
    return [...this.bpsList.values()].filter(r => r.tenantId === auth.tenantId && r.workerId === workerId);
  }
  async deleteBPS(auth: AuthContext, id: string): Promise<boolean> {
    const row = this.bpsList.get(id);
    if (!row || row.tenantId !== auth.tenantId) return false;
    return this.bpsList.delete(id);
  }

  async terminateWorkerRuns(auth: AuthContext, workerIds: string[]): Promise<void> {
    for (const [, run] of this.runs.entries()) {
      if (run.workerId && workerIds.includes(run.workerId)) {
        if (["RUNNING", "WAITING_FOR_HUMAN", "STARTING", "QUEUED"].includes(run.state)) {
          run.state = "FAILED";
          run.resultSummary = "Worker purged upon document deletion";
        }
      }
    }
  }

  async purgeWorkerRuns(auth: AuthContext, workerIds: string[]): Promise<void> {
    const runIdsToDelete: string[] = [];
    for (const [id, run] of this.runs.entries()) {
      if (run.workerId && workerIds.includes(run.workerId)) {
        runIdsToDelete.push(id);
      }
    }
    for (const id of runIdsToDelete) {
      this.runs.delete(id);
    }
    for (const [id, step] of this.steps.entries()) {
      if (runIdsToDelete.includes(step.runId)) {
        this.steps.delete(id);
      }
    }
  }

  // Clarification
  async submitClarificationAnswer(auth: AuthContext, data: { bpsId: string; gapId: string; answerType: string; answerJson: any }): Promise<ClarificationAnswerRow> {
    const validAnswerTypes = ["TEXT", "NUMBER", "YES_NO", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "FILE_REFERENCE", "CONNECTION_REFERENCE"];
    const rawType = (data.answerType || "TEXT").toUpperCase();
    const answerType = validAnswerTypes.includes(rawType) ? rawType : (rawType === "BOOLEAN" ? "YES_NO" : (rawType === "CHOICE" ? "SINGLE_CHOICE" : "TEXT"));

    const row: ClarificationAnswerRow = {
      id: crypto.randomUUID(), tenantId: auth.tenantId, bpsId: data.bpsId, gapId: data.gapId,
      answerType: answerType, answerJson: data.answerJson, answeredBy: auth.userId, createdAt: new Date().toISOString()
    };
    this.clarifications.set(row.id, row);
    return row;
  }
  async listClarificationAnswers(auth: AuthContext, bpsId: string): Promise<ClarificationAnswerRow[]> {
    return [...this.clarifications.values()].filter(r => r.tenantId === auth.tenantId && r.bpsId === bpsId);
  }

  // Schedules
  async createSchedule(auth: AuthContext, data: { workerId: string; cronExpression: string }): Promise<ScheduleRow> {
    const row: ScheduleRow = {
      id: crypto.randomUUID(), tenantId: auth.tenantId, workerId: data.workerId,
      cronExpression: data.cronExpression, enabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    this.schedulesList.set(row.id, row);
    return row;
  }
  async getSchedule(auth: AuthContext, id: string): Promise<ScheduleRow | undefined> {
    const row = this.schedulesList.get(id);
    return row?.tenantId === auth.tenantId ? row : undefined;
  }
  async updateSchedule(auth: AuthContext, id: string, updates: Partial<ScheduleRow>): Promise<ScheduleRow | undefined> {
    const row = this.schedulesList.get(id);
    if (!row || row.tenantId !== auth.tenantId) return undefined;
    Object.assign(row, updates, { updatedAt: new Date().toISOString() });
    return row;
  }
  async deleteSchedule(auth: AuthContext, id: string): Promise<boolean> {
    const row = this.schedulesList.get(id);
    if (!row || row.tenantId !== auth.tenantId) return false;
    return this.schedulesList.delete(id);
  }
  async listSchedules(auth: AuthContext, workerId?: string): Promise<ScheduleRow[]> {
    return [...this.schedulesList.values()].filter(r => r.tenantId === auth.tenantId && (!workerId || r.workerId === workerId));
  }
  async listDueSchedules(): Promise<ScheduleRow[]> {
    const now = new Date();
    return [...this.schedulesList.values()].filter(r => r.enabled && r.nextRunAt && new Date(r.nextRunAt) <= now);
  }

  // Connections
  async createConnection(auth: AuthContext, data: { name: string; system: string; connectionType: string; secretRef: string }): Promise<ConnectionRow> {
    const row: ConnectionRow = {
      id: crypto.randomUUID(), tenantId: auth.tenantId, name: data.name, system: data.system,
      connectionType: data.connectionType, status: "PENDING", secretRef: data.secretRef, requiresAttention: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    this.connectionsList.set(row.id, row);
    return row;
  }
  async listConnections(auth: AuthContext): Promise<ConnectionRow[]> {
    return [...this.connectionsList.values()].filter(r => r.tenantId === auth.tenantId);
  }
  async getConnection(auth: AuthContext, id: string): Promise<ConnectionRow | undefined> {
    const row = this.connectionsList.get(id);
    return row?.tenantId === auth.tenantId ? row : undefined;
  }
  async deleteConnection(auth: AuthContext, id: string): Promise<boolean> {
    const row = this.connectionsList.get(id);
    if (!row || row.tenantId !== auth.tenantId) return false;
    return this.connectionsList.delete(id);
  }

  // Notifications
  async createNotification(auth: AuthContext, data: { type: string; channel: string; title: string; body?: string; resourceType?: string; resourceId?: string }): Promise<NotificationRow> {
    const row: NotificationRow = {
      id: crypto.randomUUID(), tenantId: auth.tenantId, type: data.type, channel: data.channel,
      title: data.title, body: data.body, resourceType: data.resourceType, resourceId: data.resourceId,
      read: false, createdAt: new Date().toISOString()
    };
    this.notificationsList.set(row.id, row);
    return row;
  }

  async createDocument(auth: AuthContext, data: { workerId: string; type: "CSV" | "SOP" | "EXCEL" | "PDF" | "DOCX" | "TXT" | "IMAGE" | "VIDEO" | "DESKTOP_RECORDING"; name: string; parsedJson: any }): Promise<DocumentRow> {
    const row: DocumentRow = {
      id: crypto.randomUUID(),
      tenantId: auth.tenantId,
      workerId: data.workerId,
      type: data.type,
      name: data.name,
      parsedJson: data.parsedJson,
      createdAt: new Date().toISOString()
    };
    this.documentsList.set(row.id, row);
    return row;
  }

  async listDocuments(auth: AuthContext, workerId: string): Promise<DocumentRow[]> {
    return [...this.documentsList.values()].filter((row) => row.tenantId === auth.tenantId && row.workerId === workerId);
  }

  async getDocument(auth: AuthContext, id: string): Promise<DocumentRow | undefined> {
    const row = this.documentsList.get(id);
    return row?.tenantId === auth.tenantId ? row : undefined;
  }

  async deleteDocument(auth: AuthContext, id: string): Promise<boolean> {
    const row = this.documentsList.get(id);
    if (!row || row.tenantId !== auth.tenantId) return false;
    try {
      const filePath = (row?.parsedJson as any)?.filePath;
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {}
    return this.documentsList.delete(id);
  }
  async listNotifications(auth: AuthContext): Promise<NotificationRow[]> {
    return [...this.notificationsList.values()].filter(r => r.tenantId === auth.tenantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async markNotificationRead(auth: AuthContext, id: string): Promise<void> {
    const row = this.notificationsList.get(id);
    if (row && row.tenantId === auth.tenantId) row.read = true;
  }

  // Run result
  async updateRunResult(auth: AuthContext, runId: string, resultSummary: any): Promise<void> {
    const run = this.runs.get(runId);
    if (run && run.tenantId === auth.tenantId) {
      run.metadata = { ...(run.metadata || {}), resultSummary };
    }
  }

  // Background Tasks
  private memoryQueue: Array<any & { id: string, tenantId: string, status: string, scheduledFor: string, retryCount: number }> = [];

  async enqueueTask(tenantId: string, type: string, payload: any, delayMs: number = 0): Promise<string> {
    const id = crypto.randomUUID();
    this.memoryQueue.push({
      id, tenantId, type, payload,
      status: "PENDING", retryCount: 0,
      scheduledFor: new Date(Date.now() + delayMs).toISOString()
    });
    return id;
  }

  async pollTasks(limit: number = 10): Promise<any[]> {
    const now = new Date().toISOString();
    const tasks = this.memoryQueue.filter(t => t.status === "PENDING" && t.scheduledFor <= now).slice(0, limit);
    tasks.forEach(t => t.status = "PROCESSING");
    return tasks;
  }

  async completeTask(taskId: string): Promise<void> {
    const idx = this.memoryQueue.findIndex(t => t.id === taskId);
    if (idx >= 0) this.memoryQueue[idx].status = "COMPLETED";
  }

  async failTask(taskId: string, error: unknown): Promise<void> {
    const idx = this.memoryQueue.findIndex(t => t.id === taskId);
    if (idx >= 0) {
      const t = this.memoryQueue[idx];
      t.retryCount += 1;
      if (t.retryCount < 3) {
        t.status = "PENDING";
        t.scheduledFor = new Date(Date.now() + Math.pow(2, t.retryCount) * 1000).toISOString();
      } else {
        t.status = "FAILED";
      }
    }
  }

  // Desktop Computer Execution
  async registerDesktopAgent(auth: AuthContext, data: { name: string; hostname: string; osVersion: string; capabilities: string[] }): Promise<{ agent: DesktopAgentRow; session: DesktopAgentSessionRow; token: string }> {
    const agentId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const token = `dsk_${crypto.randomUUID().replace(/-/g, "")}`;
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const agent: DesktopAgentRow = {
      id: agentId,
      tenantId: auth.tenantId,
      name: data.name,
      hostname: data.hostname,
      osVersion: data.osVersion,
      status: "CONNECTED",
      capabilities: data.capabilities,
      activeSessionId: sessionId,
      lastHeartbeatAt: now,
      createdAt: now,
      updatedAt: now
    };

    const session: DesktopAgentSessionRow = {
      id: sessionId,
      tenantId: auth.tenantId,
      agentId,
      tokenHash,
      status: "ACTIVE",
      expiresAt,
      createdAt: now
    };

    this.desktopAgents.set(agentId, agent);
    this.desktopSessions.set(sessionId, session);
    return { agent, session, token };
  }

  async getDesktopAgent(auth: AuthContext, id: string): Promise<DesktopAgentRow | undefined> {
    const agent = this.desktopAgents.get(id);
    if (!agent || agent.tenantId !== auth.tenantId) return undefined;
    return agent;
  }

  async listDesktopAgents(auth: AuthContext): Promise<DesktopAgentRow[]> {
    return Array.from(this.desktopAgents.values()).filter(a => a.tenantId === auth.tenantId);
  }

  async updateDesktopAgentHeartbeat(auth: AuthContext, agentId: string, status?: string): Promise<void> {
    const agent = this.desktopAgents.get(agentId);
    if (!agent || agent.tenantId !== auth.tenantId) return;
    agent.lastHeartbeatAt = new Date().toISOString();
    agent.updatedAt = agent.lastHeartbeatAt;
    if (status && ["OFFLINE", "CONNECTED", "BUSY", "ERROR", "REVOKED"].includes(status)) {
      agent.status = status as any;
    }
  }

  async revokeDesktopAgent(auth: AuthContext, agentId: string): Promise<void> {
    const agent = this.desktopAgents.get(agentId);
    if (!agent || agent.tenantId !== auth.tenantId) return;
    agent.status = "REVOKED";
    agent.updatedAt = new Date().toISOString();
    if (agent.activeSessionId) {
      const session = this.desktopSessions.get(agent.activeSessionId);
      if (session) session.status = "TERMINATED";
    }
  }

  async createDesktopCommand(auth: AuthContext, data: Omit<DesktopExecutionCommandRow, "id" | "tenantId" | "status" | "createdAt">): Promise<DesktopExecutionCommandRow> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const command: DesktopExecutionCommandRow = {
      id,
      tenantId: auth.tenantId,
      status: "PENDING",
      createdAt: now,
      ...data
    };
    this.desktopCommands.set(id, command);
    return command;
  }

  async pollDesktopCommands(auth: AuthContext, agentId: string): Promise<DesktopExecutionCommandRow[]> {
    const pending = Array.from(this.desktopCommands.values()).filter(
      cmd => cmd.tenantId === auth.tenantId && cmd.agentId === agentId && cmd.status === "PENDING"
    ).sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    for (const cmd of pending) {
      cmd.status = "DISPATCHED";
    }
    return pending;
  }

  async updateDesktopCommandStatus(auth: AuthContext, commandId: string, status: string, result?: any, error?: string): Promise<void> {
    const cmd = this.desktopCommands.get(commandId);
    if (!cmd || cmd.tenantId !== auth.tenantId) return;
    cmd.status = status as any;
    if (result !== undefined) cmd.result = result;
    if (error !== undefined) cmd.error = error;
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(status)) {
      cmd.completedAt = new Date().toISOString();
    }
  }

  async recordDesktopEvent(auth: AuthContext, event: Omit<DesktopExecutionEventRow, "id" | "tenantId" | "createdAt">): Promise<void> {
    this.desktopEventsList.push({
      id: crypto.randomUUID(),
      tenantId: auth.tenantId,
      createdAt: new Date().toISOString(),
      ...event
    });
  }

  async listDesktopEvents(auth: AuthContext, executionId: string): Promise<DesktopExecutionEventRow[]> {
    return this.desktopEventsList.filter(e => e.tenantId === auth.tenantId && e.executionId === executionId);
  }

  async saveDesktopCorrection(auth: AuthContext, data: Omit<DesktopCorrectionRow, "id" | "tenantId" | "createdAt">): Promise<DesktopCorrectionRow> {
    const id = crypto.randomUUID();
    const row: DesktopCorrectionRow = {
      id,
      tenantId: auth.tenantId,
      createdAt: new Date().toISOString(),
      ...data
    };
    this.desktopCorrectionsList.set(id, row);
    return row;
  }

  async listDesktopCorrections(auth: AuthContext, executionId?: string): Promise<DesktopCorrectionRow[]> {
    return Array.from(this.desktopCorrectionsList.values()).filter(
      c => c.tenantId === auth.tenantId && (!executionId || c.executionId === executionId)
    );
  }

  async registerDesktopApplication(auth: AuthContext, data: Omit<DesktopApplicationRegistryRow, "id" | "tenantId" | "createdAt">): Promise<DesktopApplicationRegistryRow> {
    const id = crypto.randomUUID();
    const row: DesktopApplicationRegistryRow = {
      id,
      tenantId: auth.tenantId,
      createdAt: new Date().toISOString(),
      ...data
    };
    this.desktopAppRegistryList.set(row.applicationId, row);
    return row;
  }

  async listDesktopApplications(auth: AuthContext): Promise<DesktopApplicationRegistryRow[]> {
    return Array.from(this.desktopAppRegistryList.values()).filter(a => a.tenantId === auth.tenantId);
  }
}

const WORKSPACE_TENANTS = [
  "6ef50df4-58bb-48e3-9796-d25ba85d4dac",
  "fae45717-c844-4030-8f2a-586909c1a6c4"
];

function getTenantScope(tenantId?: string): string[] {
  if (!tenantId) return WORKSPACE_TENANTS;
  if (WORKSPACE_TENANTS.includes(tenantId)) {
    return WORKSPACE_TENANTS;
  }
  return [tenantId];
}

export class SupabaseStore implements AppStore {
  private readonly desktopFallback = new InMemoryStore();
  private warnedMissingDesktopTables = false;

  constructor(private readonly supabase: SupabaseClient) {}

  private isMissingTableError(error: any): boolean {
    if (!error) return false;
    const msg = typeof error === "string" ? error : (error.message || "");
    const code = error.code || "";
    return (
      code === "PGRST204" ||
      code === "PGRST205" ||
      code === "42P01" ||
      msg.includes("Could not find the table") ||
      (msg.includes("relation") && msg.includes("does not exist"))
    );
  }

  private handleDesktopMissingTable(table: string): void {
    if (!this.warnedMissingDesktopTables) {
      this.warnedMissingDesktopTables = true;
      console.warn(
        `[SupabaseStore] Notice: 'public.${table}' table not found in Supabase schema cache. Seamlessly using in-memory fallback for desktop execution. Run supabase/migrations/202609200001_desktop_execution.sql in your Supabase SQL editor to enable persistent storage.`
      );
    }
  }

  async bootstrapWorkspace(userId: string) {
    const { data, error } = await this.supabase.rpc("ensure_user_workspace", { user_id_val: userId });
    if (error) {
      throw new Error(`Failed to bootstrap workspace: ${error.message}`);
    }
    return { organizationId: data[0].organization_id, role: data[0].role };
  }

  async createGhostWorker(auth: AuthContext, data: {
    name: string;
    description?: string;
    workerType?: string;
    department?: string;
    capabilities?: string[];
    safetyPolicy?: Record<string, unknown>;
    triggerConfig?: Record<string, unknown>;
    status?: string;
  }): Promise<GhostWorkerRow> {
    const workerType = data.workerType || (data.safetyPolicy as any)?.workerType || "WEB_BROWSER";
    const department = data.department || (data.safetyPolicy as any)?.department;
    const safetyPolicy = {
      ...(data.safetyPolicy || {}),
      workerType,
      department,
      capabilities: data.capabilities || (data.safetyPolicy as any)?.capabilities || ["browser", "desktop", "human", "api"]
    };
    const triggerConfig = {
      ...(data.triggerConfig || {}),
      workerType
    };
    const insertPayload: any = {
      tenant_id: auth.tenantId,
      name: data.name,
      description: data.description,
      status: data.status || "NEW",
      safety_policy: safetyPolicy,
      trigger_config: triggerConfig,
      created_by: auth.userId
    };
    const { data: row, error } = await this.supabase.from("ghost_workers").insert(insertPayload).select("*").single();
    if (error) throw error;
    return this.workerFromRow(row);
  }

  async listGhostWorkers(auth: AuthContext): Promise<GhostWorkerRow[]> {
    const scope = getTenantScope(auth.tenantId);
    const { data, error } = await this.supabase.from("ghost_workers").select("*").in("tenant_id", scope).order("created_at", { ascending: false });
    if (error) throw error;
    const all = (data ?? []).map((r) => this.workerFromRow(r));
    const nameMap = new Map<string, GhostWorkerRow & { allIds: string[] }>();
    for (const w of all) {
      if (!w || !w.name) continue;
      const key = w.name.trim().toLowerCase();
      if (!nameMap.has(key)) {
        nameMap.set(key, { ...w, allIds: [w.id] });
      } else {
        const existing = nameMap.get(key)!;
        existing.allIds = existing.allIds || [existing.id];
        if (!existing.allIds.includes(w.id)) {
          existing.allIds.push(w.id);
        }
        if (!existing.activeVersionId && w.activeVersionId) {
          const allIds = existing.allIds;
          nameMap.set(key, { ...w, allIds });
        }
      }
    }
    return [...nameMap.values()];
  }

  async getGhostWorker(auth: AuthContext, id: string): Promise<GhostWorkerRow | undefined> {
    if (!id) return undefined;
    const scope = getTenantScope(auth.tenantId);
    let data: any = null;
    // Lookups are always tenant-scoped, and a worker never inherits another worker's workflow.
    if (isUUID(id)) {
      const res = await this.supabase.from("ghost_workers").select("*").in("tenant_id", scope).eq("id", id).maybeSingle();
      data = res.data;
    }
    if (!data) {
      const res = await this.supabase.from("ghost_workers").select("*").in("tenant_id", scope).ilike("name", id).order("created_at", { ascending: false }).limit(1);
      data = res?.data?.[0];
    }
    if (!data) return undefined;
    return this.workerFromRow(data);
  }

  async addChatInstruction(auth: AuthContext, workerId: string, instruction: string) {
    const { data, error } = await this.supabase.from("ghost_memory").insert({
      tenant_id: auth.tenantId,
      worker_id: workerId,
      type: "INSTRUCTION",
      content: instruction,
      structured_data: {}
    }).select("*").single();
    if (error) throw error;
    return data;
  }

  async addMemoryRule(auth: AuthContext, workerId: string, rule: string, structuredData?: any) {
    const { data, error } = await this.supabase.from("ghost_memory").insert({
      tenant_id: auth.tenantId,
      worker_id: workerId,
      type: "RULE",
      content: rule,
      structured_data: structuredData || {}
    }).select("*").single();
    if (error) throw error;
    return data;
  }

  async getWorkerMemory(auth: AuthContext, workerId: string) {
    const scope = getTenantScope(auth.tenantId);
    let { data, error } = await this.supabase
      .from("ghost_memory")
      .select("*")
      .in("tenant_id", scope)
      .eq("worker_id", workerId)
      .order("created_at", { ascending: true });
    if (!data || data.length === 0) {
      const fallback = await this.supabase
        .from("ghost_memory")
        .select("*")
        .eq("worker_id", workerId)
        .order("created_at", { ascending: true });
      if (fallback.data && fallback.data.length > 0) data = fallback.data;
    }
    if (error) throw error;
    return { rules: data?.filter(m => m.type === 'RULE') || [], instructions: data?.filter(m => m.type === 'INSTRUCTION') || [] };
  }

  async deleteMemoryItem(auth: AuthContext, workerId: string, memoryId: string): Promise<boolean> {
    const scope = getTenantScope(auth.tenantId);
    let { error, count } = await this.supabase
      .from("ghost_memory")
      .delete({ count: "exact" })
      .eq("id", memoryId)
      .in("tenant_id", scope);
    if (error || (count ?? 0) === 0) {
      // Fallback without tenant_id filter if dev scope
      const res = await this.supabase
        .from("ghost_memory")
        .delete({ count: "exact" })
        .eq("id", memoryId);
      if (res.error) {
        logger.warn({ error: res.error.message, memoryId }, "Failed to delete memory item from ghost_memory");
        return false;
      }
      count = res.count;
    }
    return (count ?? 1) > 0;
  }

  async purgeWorkerMemory(auth: AuthContext, workerId: string): Promise<boolean> {
    try {
      await this.supabase
        .from("ghost_memory")
        .delete()
        .eq("worker_id", workerId);
      return true;
    } catch (err: any) {
      logger.warn({ err: err?.message, workerId }, "Failed to purge worker memory in Supabase");
      return false;
    }
  }

  async getWorkerEvidence(auth: AuthContext, workerId: string) {
    const scope = getTenantScope(auth.tenantId);

    // Resolve worker and any aliases / same-name siblings
    let targetIds = [workerId];
    try {
      const allWorkers = await this.listGhostWorkers(auth).catch(() => []);
      const workerObj = allWorkers.find(w => w.id === workerId || (w as any).allIds?.includes(workerId)) ||
                       allWorkers.find(w => w.name && w.name.trim().toLowerCase() === workerId.trim().toLowerCase());
      const workerName = workerObj?.name?.trim().toLowerCase();
      const siblingIds = workerName
        ? allWorkers.filter(w => w.name && w.name.trim().toLowerCase() === workerName).map(w => w.id)
        : [];
      targetIds = Array.from(new Set([
        workerId,
        ...(workerObj ? [workerObj.id] : []),
        ...siblingIds,
        ...((workerObj as any)?.allIds || [])
      ].filter(Boolean)));
    } catch (_) {}

    // 1. Worker Documents
    let { data: documents } = await this.supabase
      .from("worker_documents")
      .select("*")
      .in("worker_id", targetIds)
      .order("created_at", { ascending: false });

    if (!documents || documents.length === 0) {
      const fallbackDocs = await this.supabase
        .from("worker_documents")
        .select("*")
        .eq("worker_id", workerId)
        .order("created_at", { ascending: false });
      if (fallbackDocs.data && fallbackDocs.data.length > 0) documents = fallbackDocs.data;
    }

    // 2. Execution Runs for this worker
    let { data: runs } = await this.supabase
      .from("execution_runs")
      .select("*")
      .in("worker_id", targetIds)
      .order("created_at", { ascending: false })
      .limit(10);

    // 3. Execution steps for these runs
    let executionSteps: any[] = [];
    if (runs && runs.length > 0) {
      const runIds = runs.map(r => r.id);
      const { data: steps } = await this.supabase
        .from("execution_steps")
        .select("*")
        .in("run_id", runIds)
        .order("started_at", { ascending: true });
      executionSteps = steps || [];
    }

    // 4. Memory rules
    const { data: memory } = await this.supabase
      .from("ghost_memory")
      .select("*")
      .in("worker_id", targetIds);

    // 5. Recordings
    const { data: recordings } = await this.supabase
      .from("recordings")
      .select("id, created_at")
      .in("tenant_id", scope)
      .order("created_at", { ascending: false })
      .limit(5);

    return { 
      documents: (documents || []).map((doc: any) => ({
        id: doc.id,
        workerId: doc.worker_id,
        name: doc.name,
        type: doc.type,
        parsedJson: doc.parsed_json,
        createdAt: doc.created_at
      })),
      runs: (runs || []).map((r: any) => this.runFromRow(r)),
      executionSteps: (executionSteps || []).map((s: any) => this.executionStepFromRow(s)),
      memory: memory || [],
      recordings: recordings || [] 
    };
  }

  async updateGhostWorker(auth: AuthContext, id: string, updates: Partial<GhostWorkerRow>): Promise<GhostWorkerRow | undefined> {
    const payload: any = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.workflowId !== undefined) payload.workflow_id = updates.workflowId;
    if (updates.activeVersionId !== undefined) payload.active_version_id = updates.activeVersionId;
    if (updates.publishedVersionId !== undefined) payload.published_version_id = updates.publishedVersionId;
    if (updates.safetyPolicy !== undefined) payload.safety_policy = updates.safetyPolicy;
    if (updates.bpsId !== undefined) payload.bps_id = updates.bpsId;
    if (updates.recordingId !== undefined) {
      payload.recording_id = (typeof updates.recordingId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(updates.recordingId)) ? updates.recordingId : null;
    }
    if (updates.analysisStage !== undefined) payload.analysis_stage = updates.analysisStage;
    if (updates.triggerType !== undefined) payload.trigger_type = updates.triggerType;
    if (updates.triggerConfig !== undefined) payload.trigger_config = updates.triggerConfig;

    const { data, error } = await this.supabase.from("ghost_workers").update(payload).eq("tenant_id", auth.tenantId).eq("id", id).select("*").maybeSingle();
    if (error) throw error;
    return data ? this.workerFromRow(data) : undefined;
  }

  async createRecording(auth: AuthContext, upload: RecordingUpload, idempotencyKey?: string): Promise<RecordingRow> {
    const metadata = { ...(upload.metadata ?? {}), ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}) };

    if (idempotencyKey) {
      const { data: existing, error: existingError } = await this.supabase
        .from("recordings")
        .select("*")
        .eq("tenant_id", auth.tenantId)
        .contains("metadata", { idempotency_key: idempotencyKey })
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        const existingRow = this.recordingFromRow(existing);
        if (existingRow) return existingRow;
        throw new Error("Existing recording could not be hydrated");
      }
    }

    await this.throwOnError(
      this.supabase.from("recordings").upsert({
        id: upload.recording_id,
        tenant_id: auth.tenantId,
        created_by: auth.userId,
        source: upload.source,
        started_at: upload.started_at,
        ended_at: upload.ended_at ?? null,
        metadata
      })
    );

    if (upload.events.length > 0) {
      await this.throwOnError(
        this.supabase.from("recording_events").upsert(
          upload.events.map((event) => ({
            id: event.event_id,
            tenant_id: auth.tenantId,
            recording_id: upload.recording_id,
            sequence: event.sequence,
            event_type: event.event_type,
            event
          })),
          { onConflict: "recording_id,sequence" }
        )
      );
    }

    await this.writeAudit(auth, "RECORDING_CREATED", "recording", upload.recording_id, { event_count: upload.events.length, idempotency_key: idempotencyKey ?? null });
    return { id: upload.recording_id, tenantId: auth.tenantId, upload: { ...upload, metadata }, createdAt: new Date().toISOString() };
  }

  async startRecording(auth: AuthContext, data: { source: string; metadata?: Record<string, unknown> }, idempotencyKey?: string): Promise<RecordingRow> {
    const recordingId = crypto.randomUUID();
    const metadata = { ...(data.metadata ?? {}), ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}) };

    if (idempotencyKey) {
      const { data: existing, error: existingError } = await this.supabase
        .from("recordings")
        .select("*")
        .eq("tenant_id", auth.tenantId)
        .contains("metadata", { idempotency_key: idempotencyKey })
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        const existingRow = this.recordingFromRow(existing);
        if (existingRow) return existingRow;
        throw new Error("Existing recording could not be hydrated");
      }
    }

    await this.throwOnError(
      this.supabase.from("recordings").insert({
        id: recordingId,
        tenant_id: auth.tenantId,
        created_by: auth.userId,
        source: data.source,
        started_at: new Date().toISOString(),
        metadata
      })
    );
    
    return { 
      id: recordingId, 
      tenantId: auth.tenantId, 
      upload: { recording_id: recordingId, source: data.source as "chrome_extension" | "test_harness", started_at: new Date().toISOString(), events: [], metadata }, 
      createdAt: new Date().toISOString() 
    };
  }

  async appendRecordingEvents(auth: AuthContext, recordingId: string, events: any[]): Promise<void> {
    if (!events.length) return;
    
    await this.throwOnError(
      this.supabase.from("recording_events").upsert(
        events.map((event) => ({
          id: event.event_id,
          tenant_id: auth.tenantId,
          recording_id: recordingId,
          sequence: event.sequence,
          event_type: event.event_type,
          event
        })),
        { onConflict: "recording_id,sequence" }
      )
    );
  }

  async finishRecording(auth: AuthContext, recordingId: string, endedAt: string): Promise<RecordingRow> {
    await this.throwOnError(
      this.supabase.from("recordings").update({ ended_at: endedAt }).eq("id", recordingId).eq("tenant_id", auth.tenantId)
    );
    
    const row = await this.getRecording(auth, recordingId);
    if (!row) throw new Error("Failed to fetch finished recording");
    
    await this.writeAudit(auth, "RECORDING_CREATED", "recording", recordingId, { event_count: row.upload.events.length });
    return row;
  }

  async listAudits(auth: AuthContext): Promise<AuditEventRow[]> {
    // writeAudit inserts into audit_logs; reading any other table returns nothing or fails.
    const { data, error } = await this.supabase
      .from("audit_logs")
      .select("*")
      .eq("tenant_id", auth.tenantId)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      tenantId: row.tenant_id,
      actorId: row.actor_id ?? undefined,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id ?? undefined,
      metadata: row.metadata || {},
      createdAt: row.created_at
    }));
  }

  async listMembers(auth: AuthContext): Promise<MemberRow[]> {
    const { data, error } = await this.supabase.from("organization_members").select("user_id, role, created_at").eq("organization_id", auth.tenantId);
    if (error) throw error;
    const ids = (data || []).map((m: any) => m.user_id);
    const profiles = ids.length
      ? (await this.supabase.from("profiles").select("id, email, display_name").in("id", ids)).data || []
      : [];
    return (data || []).map((m: any) => {
      const profile = profiles.find((p: any) => p.id === m.user_id);
      return { userId: m.user_id, role: m.role, email: profile?.email ?? undefined, displayName: profile?.display_name ?? undefined, joinedAt: m.created_at };
    });
  }

  async ensureMember(_auth: AuthContext): Promise<void> {
    // Supabase memberships are created by sign-up/bootstrap, never implicitly by a request.
  }

  async updateMemberRole(auth: AuthContext, userId: string, role: string): Promise<MemberRow | undefined> {
    const { data, error } = await this.supabase.from("organization_members").update({ role })
      .eq("organization_id", auth.tenantId).eq("user_id", userId).select("user_id, role, created_at").maybeSingle();
    if (error) throw error;
    return data ? { userId: data.user_id, role: data.role, joinedAt: data.created_at } : undefined;
  }

  async getOrgSettings(auth: AuthContext): Promise<Record<string, any>> {
    const { data, error } = await this.supabase.from("organizations").select("settings").eq("id", auth.tenantId).maybeSingle();
    if (error) throw error;
    return { ...((data as any)?.settings || {}) };
  }

  async updateOrgSettings(auth: AuthContext, patch: Record<string, any>): Promise<Record<string, any>> {
    const next = { ...(await this.getOrgSettings(auth)), ...patch };
    const { error } = await this.supabase.from("organizations").update({ settings: next, updated_at: new Date().toISOString() }).eq("id", auth.tenantId);
    if (error) throw error;
    return next;
  }

  async listWorkflowVersionsForWorker(auth: AuthContext, workerId: string, knownIds: string[] = []): Promise<WorkflowVersionRow[]> {
    const byWorker = await this.supabase.from("workflow_versions").select("*").eq("tenant_id", auth.tenantId)
      .eq("definition->compiler->>worker_id", workerId).order("created_at", { ascending: false }).limit(100);
    if (byWorker.error) throw byWorker.error;
    const rows = [...(byWorker.data || [])];
    const missing = knownIds.filter(id => isUUID(id) && !rows.some((r: any) => r.id === id));
    if (missing.length) {
      const extra = await this.supabase.from("workflow_versions").select("*").eq("tenant_id", auth.tenantId).in("id", missing);
      if (extra.error) throw extra.error;
      rows.push(...(extra.data || []));
    }
    return rows.map(r => this.workflowVersionFromRow(r)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listRecordings(auth: AuthContext): Promise<RecordingRow[]> {
    const { data, error } = await this.supabase
      .from("recordings")
      .select("*, recording_events(event)")
      .eq("tenant_id", auth.tenantId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []).map((row) => this.recordingFromRow(row)).filter((row): row is RecordingRow => Boolean(row));
  }

  async getRecording(auth: AuthContext, id: string): Promise<RecordingRow | undefined> {
    const { data, error } = await this.supabase
      .from("recordings")
      .select("*, recording_events(event)")
      .eq("tenant_id", auth.tenantId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? this.recordingFromRow(data) : undefined;
  }

  async createWorkflowVersion(auth: AuthContext, workflow: AnyWorkflow): Promise<WorkflowVersionRow> {
    const workflowInsert = await this.supabase
      .from("workflows")
      .insert({ tenant_id: auth.tenantId, name: workflow.name, status: workflow.status, created_by: auth.userId })
      .select("*")
      .single();
    if (workflowInsert.error) throw workflowInsert.error;

    const versionInsert = await this.supabase
      .from("workflow_versions")
      .insert({
        tenant_id: auth.tenantId,
        workflow_id: workflowInsert.data.id,
        version: 1,
        schema_version: workflow.workflow_version,
        compiler_version: workflow.workflow_version === "1.0" ? workflow.compiler.version : ((workflow.compiler as any)?.version || "v2-compiler"),
        compiler_model: workflow.workflow_version === "1.0" ? workflow.compiler.model : ((workflow.compiler as any)?.source_type || "v2-model"),
        source_recording_id: (() => {
          const rawId = workflow.workflow_version === "1.0" ? workflow.compiler.source_recording_id : ((workflow.compiler as any)?.source_recording_id || null);
          return (typeof rawId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId)) ? rawId : null;
        })(),
        definition: workflow,
        created_by: auth.userId
      })
      .select("*")
      .single();
    if (versionInsert.error) throw versionInsert.error;

    await this.writeAudit(auth, "WORKFLOW_CREATED", "workflow", workflowInsert.data.id, { workflow_version_id: versionInsert.data.id });
    return this.workflowVersionFromRow(versionInsert.data);
  }

  async listWorkflows(auth: AuthContext): Promise<WorkflowVersionRow[]> {
    const scope = getTenantScope(auth.tenantId);
    const { data, error } = await this.supabase
      .from("workflow_versions")
      .select("*")
      .in("tenant_id", scope)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []).map((row) => this.workflowVersionFromRow(row));
  }

  async getWorkflowVersion(auth: AuthContext, id: string): Promise<WorkflowVersionRow | undefined> {
    if (!id || !isUUID(id)) return undefined;
    const scope = getTenantScope(auth.tenantId);
    const { data, error } = await this.supabase
      .from("workflow_versions")
      .select("*")
      .in("tenant_id", scope)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? this.workflowVersionFromRow(data) : undefined;
  }

  async deleteWorkflowVersion(auth: AuthContext, id: string): Promise<boolean> {
    try {
      await (this.supabase.from("workflow_versions").delete() as any).or(`id.eq.${id},workflow_id.eq.${id}`);
      await (this.supabase.from("workflows").delete() as any).eq("id", id);
      return true;
    } catch {
      return false;
    }
  }

  async activateWorkflowVersion(auth: AuthContext, versionId: string): Promise<WorkflowVersionRow | undefined> {
    const row = await this.getWorkflowVersion(auth, versionId);
    if (!row) return undefined;
    const workflow = validateWorkflow({ ...row.workflow, status: "ACTIVE" });
    await this.throwOnError(this.supabase.from("workflows").update({ status: "ACTIVE", updated_at: new Date().toISOString() }).eq("tenant_id", auth.tenantId).eq("id", row.workflowId));
    await this.throwOnError(this.supabase.from("workflow_versions").update({ definition: workflow }).eq("tenant_id", auth.tenantId).eq("id", versionId));
    await this.writeAudit(auth, "WORKFLOW_ACTIVATED", "workflow_version", versionId);
    return { ...row, workflow };
  }

  async createRun(auth: AuthContext, workflowVersionId: string, idempotencyKey?: string, workerId?: string, runMode?: string, inputs?: Record<string, unknown>): Promise<RunRow> {
    if (idempotencyKey) {
      const existing = await this.supabase
        .from("execution_runs")
        .select("*")
        .eq("tenant_id", auth.tenantId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) return { ...this.runFromRow(existing.data), idempotentReplay: true };
    }
    const payload: any = { tenant_id: auth.tenantId, workflow_version_id: workflowVersionId, state: "QUEUED", idempotency_key: idempotencyKey ?? null, created_by: auth.userId };
    if (workerId) payload.worker_id = workerId;
    if (runMode) payload.run_mode = runMode;
    if (inputs && Object.keys(inputs).length) payload.metadata = { inputs };

    const { data, error } = await this.supabase
      .from("execution_runs")
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      if (idempotencyKey && error.code === "23505") {
        const replay = await this.supabase
          .from("execution_runs")
          .select("*")
          .eq("tenant_id", auth.tenantId)
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (replay.error) throw replay.error;
        if (replay.data) return { ...this.runFromRow(replay.data), idempotentReplay: true };
      }
      throw error;
    }
    await this.writeAudit(auth, "RUN_CREATED", "execution_run", data.id, { workflow_version_id: workflowVersionId });
    return this.runFromRow(data);
  }

  async takeHitlControl(tenantId: string, userId: string, runId: string): Promise<{ run: RunRow; hitlRequest: any }> {
    const { data: run, error: runError } = await this.supabase
      .from("execution_runs")
      .select("*")
      .eq("id", runId)
      .eq("tenant_id", tenantId)
      .single();
    if (runError) throw runError;
    
    if (run.state !== "WAITING_FOR_HUMAN") {
      throw new Error(`Invalid state transition. Run is currently in state: ${run.state}`);
    }

    const { data: activeRequest, error: reqError } = await this.supabase
      .from("hitl_requests")
      .select("*")
      .eq("run_id", runId)
      .eq("tenant_id", tenantId)
      .eq("state", "PENDING")
      .single();
      
    if (reqError || !activeRequest) {
      throw new Error("No pending HITL request found for this run");
    }

    if (activeRequest.expires_at && new Date(activeRequest.expires_at) < new Date()) {
      throw new Error("HITL request has expired");
    }

    const { data: updatedRun, error: updateError } = await this.supabase
      .from("execution_runs")
      .update({ state: "HUMAN_CONTROL_ACTIVE" })
      .eq("id", runId)
      .eq("state", "WAITING_FOR_HUMAN") 
      .select()
      .single();

    if (updateError || !updatedRun) {
      throw new Error("Failed to acquire control. Another user may have already claimed it.");
    }

    const { data: updatedReq } = await this.supabase
      .from("hitl_requests")
      .update({ state: "CONTROL_ACTIVE", resolver_id: userId })
      .eq("id", activeRequest.id)
      .select()
      .single();

    return { run: updatedRun, hitlRequest: updatedReq };
  }

  async completeHitlIntervention(tenantId: string, runId: string): Promise<void> {
    const { data: updatedRun, error } = await this.supabase
      .from("execution_runs")
      .update({ state: "VERIFYING_HANDOFF" })
      .eq("id", runId)
      .eq("tenant_id", tenantId)
      .eq("state", "HUMAN_CONTROL_ACTIVE")
      .select()
      .single();
      
    if (error || !updatedRun) {
      throw new Error("Failed to complete intervention. Run may not be active.");
    }
  }

  async claimRun(auth: AuthContext, runId: string): Promise<RunRow | undefined> {
    const { data, error } = await this.supabase
      .from("execution_runs")
      .update({ state: "STARTING", updated_at: new Date().toISOString() })
      .eq("tenant_id", auth.tenantId)
      .eq("id", runId)
      .eq("state", "QUEUED")
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? this.runFromRow(data) : undefined;
  }

  async updateRunState(auth: AuthContext, runId: string, state: string, metadata?: any): Promise<RunRow | undefined> {
    const current = await this.getRun(auth, runId);
    if (!current) return undefined;
    if (current.state !== state && !isLegalRunTransition(current.state, state)) return undefined;
    const updatePayload: Record<string, unknown> = { state, updated_at: new Date().toISOString() };
    if (metadata?.providerSessionId) updatePayload.provider_session_id = metadata.providerSessionId;
    if (metadata?.createdAt) updatePayload.provider_session_created_at = metadata.createdAt;
    if (metadata?.expiresAt) updatePayload.provider_session_expires_at = metadata.expiresAt;
    if (metadata?.hitlDeadlineAt) updatePayload.hitl_deadline_at = metadata.hitlDeadlineAt;
    if (metadata?.resultSummary) {
      updatePayload.result_summary = metadata.resultSummary;
      updatePayload.metadata = { ...(current.metadata || {}), ...(metadata.metadata || {}), resultSummary: metadata.resultSummary };
    } else if (metadata?.metadata) {
      updatePayload.metadata = { ...(current.metadata || {}), ...metadata.metadata };
    }
    // Compare-and-set on the state we validated, so concurrent writers cannot make an illegal jump.
    const { data, error } = await this.supabase
      .from("execution_runs")
      .update(updatePayload)
      .eq("tenant_id", auth.tenantId)
      .eq("id", runId)
      .eq("state", current.state)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? this.runFromRow(data) : undefined;
  }

  async getRun(auth: AuthContext, runId: string): Promise<RunRow | undefined> {
    if (!runId || !isUUID(runId)) return undefined;
    const scope = getTenantScope(auth.tenantId);
    const { data, error } = await this.supabase.from("execution_runs").select("*").in("tenant_id", scope).eq("id", runId).maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    const run = this.runFromRow(data);
    if (run && (run.state === "RUNNING" || run.state === "STARTING" || run.state === "QUEUED")) {
      const ageMs = Date.now() - new Date(run.createdAt).getTime();
      if (ageMs > 15 * 60 * 1000) {
        run.state = "FAILED";
        run.resultSummary = "Execution timed out (zombie run expired)";
        void this.supabase.from("execution_runs").update({ state: "FAILED", result_summary: run.resultSummary }).eq("id", run.id).then(() => {}, () => {});
      }
    }
    return run;
  }

  async listRuns(auth: AuthContext): Promise<RunRow[]> {
    const scope = getTenantScope(auth.tenantId);
    const { data, error } = await this.supabase.from("execution_runs").select("*").in("tenant_id", scope).order("created_at", { ascending: false }).limit(150);
    if (error) throw error;
    const runs = (data ?? []).map((row) => this.runFromRow(row));
    const now = Date.now();
    for (const run of runs) {
      if (run && (run.state === "RUNNING" || run.state === "STARTING" || run.state === "QUEUED")) {
        const ageMs = now - new Date(run.createdAt).getTime();
        if (ageMs > 15 * 60 * 1000) {
          run.state = "FAILED";
          run.resultSummary = "Execution timed out (zombie run expired)";
          void this.supabase.from("execution_runs").update({ state: "FAILED", result_summary: run.resultSummary }).eq("id", run.id).then(() => {}, () => {});
        }
      }
    }
    return runs;
  }

  async createExecutionStep(auth: AuthContext, step: ExecutionStepRow): Promise<void> {
    const { error } = await this.supabase
      .from("execution_steps")
      .insert({
        id: step.id,
        tenant_id: auth.tenantId,
        run_id: step.runId,
        step_id: step.stepId,
        state: step.state,
        strategy: step.strategy ?? null,
        started_at: step.startedAt ?? null,
        finished_at: step.finishedAt ?? null,
        metadata: step.metadata
      });
    if (error) throw error;
  }

  async updateExecutionStep(auth: AuthContext, runId: string, stepId: string, updates: Partial<ExecutionStepRow>): Promise<void> {
    const { error } = await this.supabase
      .from("execution_steps")
      .update({
        state: updates.state,
        strategy: updates.strategy ?? null,
        finished_at: updates.finishedAt ?? null,
        metadata: updates.metadata
      })
      .eq("tenant_id", auth.tenantId)
      .eq("run_id", runId)
      .eq("step_id", stepId);
    if (error) throw error;
  }

  async saveExecutionCheckpoint(auth: AuthContext, checkpoint: Omit<ExecutionCheckpointRow, "id" | "createdAt">): Promise<void> {
    const { error } = await this.supabase
      .from("execution_checkpoints")
      .upsert({
        tenant_id: auth.tenantId,
        run_id: checkpoint.runId,
        workflow_version_id: checkpoint.workflowVersionId,
        sequence_number: checkpoint.sequenceNumber,
        cursor_json: checkpoint.cursorJson,
        runtime_context_json: checkpoint.runtimeContextJson,
        control_flow_json: checkpoint.controlFlowJson,
        side_effect_state_json: checkpoint.sideEffectStateJson
      }, { onConflict: "run_id" });
    
    if (error) throw error;
  }

  async loadExecutionCheckpoint(auth: AuthContext, runId: string): Promise<ExecutionCheckpointRow | undefined> {
    const { data, error } = await this.supabase
      .from("execution_checkpoints")
      .select("*")
      .eq("tenant_id", auth.tenantId)
      .eq("run_id", runId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return undefined;

    return {
      id: data.id,
      tenantId: data.tenant_id,
      runId: data.run_id,
      workflowVersionId: data.workflow_version_id,
      sequenceNumber: data.sequence_number,
      cursorJson: data.cursor_json,
      runtimeContextJson: data.runtime_context_json,
      controlFlowJson: data.control_flow_json,
      sideEffectStateJson: data.side_effect_state_json,
      createdAt: data.created_at
    };
  }

  async listExecutionSteps(auth: AuthContext, runId: string): Promise<ExecutionStepRow[]> {
    const scope = getTenantScope(auth.tenantId);
    const { data, error } = await this.supabase.from("execution_steps").select("*").in("tenant_id", scope).eq("run_id", runId);
    if (error) throw error;
    return (data ?? []).map((row) => this.executionStepFromRow(row));
  }

  async createHitlRequest(auth: AuthContext, params: { runId: string; workflowStepId: string; challengeType: string; expiresAt: string }): Promise<void> {
    const run = await this.getRun(auth, params.runId);
    const { data, error } = await this.supabase.from("hitl_requests").insert({
      tenant_id: auth.tenantId,
      run_id: params.runId,
      reason: params.challengeType,
      state: "PENDING",
      workflow_step_id: params.workflowStepId,
      workflow_version_id: run?.workflowVersionId ?? null,
      challenge_type: params.challengeType,
      expires_at: params.expiresAt
    }).select("*").single();
    if (error) throw error;
    await this.writeAudit(auth, "EXECUTION_PAUSED", "execution_run", params.runId, { hitl_request_id: data.id });
    await this.createNotification(auth, {
      type: "HITL",
      channel: "in_app",
      title: "Human Action Required",
      body: `A ghost requires your help to proceed. Reason: ${params.challengeType}`,
      resourceType: "execution_run",
      resourceId: params.runId
    });
  }

  async listHitlRequests(auth: AuthContext): Promise<HitlRequestRow[]> {
    const { data, error } = await this.supabase.from("hitl_requests").select("*").eq("tenant_id", auth.tenantId).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return (data ?? []).map((row) => this.hitlFromRow(row));
  }

  async decideHitlRequest(auth: AuthContext, hitlId: string, decision: HitlDecisionInput): Promise<HitlDecisionResult> {
    validateHitlDecision(decision);
    if (!isUUID(hitlId)) throw new HitlDecisionError("NOT_FOUND", "HITL request not found");
    const { data: row, error } = await this.supabase.from("hitl_requests").select("*").eq("tenant_id", auth.tenantId).eq("id", hitlId).maybeSingle();
    if (error) throw error;
    if (!row) throw new HitlDecisionError("NOT_FOUND", "HITL request not found");
    const hitl = this.hitlFromRow(row);
    const run = await this.getRun(auth, hitl.runId);
    if (!run) throw new HitlDecisionError("NOT_FOUND", "Linked run not found");
    const payload = { value: decision.value ?? null, note: decision.note ?? null };

    if (hitl.state === "RESOLVED") {
      if (hitl.decision === decision.action && JSON.stringify(hitl.decisionPayload?.value ?? null) === JSON.stringify(payload.value)) {
        return { status: "DUPLICATE", hitl, run };
      }
      throw new HitlDecisionError("STALE_DECISION", `This request was already decided (${hitl.decision ?? "resolved"}).`);
    }
    if (hitl.state !== "PENDING" && hitl.state !== "CONTROL_ACTIVE") {
      throw new HitlDecisionError("STALE_DECISION", `This request is ${hitl.state.toLowerCase()} and can no longer be decided.`);
    }
    if (decision.expectedRunId && decision.expectedRunId !== hitl.runId) {
      throw new HitlDecisionError("STALE_DECISION", "The decision refers to a different run.");
    }
    const pausedVersion = hitl.workflowVersionId || run.workflowVersionId;
    if (decision.expectedWorkflowVersionId && decision.expectedWorkflowVersionId !== pausedVersion) {
      throw new HitlDecisionError("STALE_DECISION", "The decision refers to a different workflow version than the paused run.");
    }
    if (hitl.expiresAt && Date.parse(hitl.expiresAt) < Date.now()) {
      await this.supabase.from("hitl_requests").update({ state: "EXPIRED" }).eq("tenant_id", auth.tenantId).eq("id", hitl.id).in("state", ["PENDING", "CONTROL_ACTIVE"]);
      await this.updateRunState(auth, run.id, "TIMED_OUT", { resultSummary: { outcome: "WAITING_FOR_HUMAN_TIMED_OUT", hitlRequestId: hitl.id } });
      throw new HitlDecisionError("EXPIRED", "The approval window for this request has expired.");
    }
    if (!HUMAN_WAIT_STATES.has(run.state)) {
      throw new HitlDecisionError("RUN_NOT_WAITING", `The run is ${run.state}; it is not waiting for a decision.`);
    }

    // Claim the request atomically: only one decision can move it out of PENDING/CONTROL_ACTIVE.
    const decidedAt = new Date().toISOString();
    const claim = await this.supabase.from("hitl_requests").update({
      state: "RESOLVED",
      resolved_at: decidedAt,
      resolver_id: isUUID(auth.userId) ? auth.userId : null,
      decision: decision.action,
      decision_payload: payload,
      decided_by: isUUID(auth.userId) ? auth.userId : null,
      decided_at: decidedAt
    }).eq("tenant_id", auth.tenantId).eq("id", hitl.id).in("state", ["PENDING", "CONTROL_ACTIVE"]).select("*").maybeSingle();
    if (claim.error) {
      throw new Error(`Could not record the HITL decision durably (${claim.error.message}). Apply migration 202610290001_hitl_decisions.sql.`);
    }
    if (!claim.data) {
      return this.decideHitlRequest(auth, hitlId, decision);
    }

    let updatedRun: RunRow | undefined;
    if (decision.action === "REJECT") {
      updatedRun = await this.updateRunState(auth, run.id, "CANCELLED", {
        resultSummary: { outcome: "REJECTED_BY_HUMAN", hitlRequestId: hitl.id, stepId: hitl.workflowStepId, note: decision.note }
      });
      await this.supabase.from("hitl_requests").update({ state: "CANCELLED" }).eq("tenant_id", auth.tenantId).eq("run_id", run.id).in("state", ["PENDING", "CONTROL_ACTIVE"]);
    } else {
      if (run.state === "HUMAN_CONTROL_ACTIVE") await this.updateRunState(auth, run.id, "VERIFYING_HANDOFF");
      updatedRun = await this.updateRunState(auth, run.id, "RESUMING");
    }
    await this.writeAudit(auth, "HITL_DECISION", "execution_run", run.id, {
      hitl_request_id: hitl.id, decision: decision.action, step_id: hitl.workflowStepId,
      workflow_version_id: pausedVersion, resulting_state: updatedRun?.state ?? run.state, note: decision.note ?? null
    });
    return { status: "APPLIED", hitl: this.hitlFromRow(claim.data), run: updatedRun ?? run };
  }

  async supersedeWorkerRuns(auth: AuthContext, workerId: string, reason: string): Promise<number> {
    const { data, error } = await this.supabase
      .from("execution_runs")
      .update({ state: "CANCELLED", result_summary: { outcome: "SUPERSEDED", reason }, updated_at: new Date().toISOString() })
      .eq("tenant_id", auth.tenantId)
      .eq("worker_id", workerId)
      .in("state", ["QUEUED", "STARTING", "RUNNING", "PAUSING", "WAITING_FOR_HUMAN", "HUMAN_CONTROL_ACTIVE", "VERIFYING_HANDOFF", "RESUMING"])
      .select("id");
    if (error) throw error;
    const count = data?.length ?? 0;
    if (count) await this.writeAudit(auth, "RUNS_SUPERSEDED", "ghost_worker", workerId, { cancelled_runs: count, reason });
    return count;
  }

  async writeAudit(auth: AuthContext, action: AuditAction, resourceType: string, resourceId?: string, metadata: Record<string, unknown> = {}): Promise<void> {
    await this.throwOnError(
      this.supabase.from("audit_logs").insert({
        tenant_id: auth.tenantId,
        actor_id: auth.userId,
        action,
        resource_type: resourceType,
        resource_id: resourceId ?? null,
        metadata
      })
    );
  }

  // --- BPS ---
  async createBPS(auth: AuthContext, data: { workerId: string; recordingId?: string; status: string; specificationJson: any; generalizationJson: any; gapsJson: any[] }): Promise<BPSRow> {
    const payload: any = {
      tenant_id: auth.tenantId, worker_id: data.workerId,
      status: data.status, specification_json: data.specificationJson, generalization_json: data.generalizationJson,
      gaps_json: data.gapsJson, created_by: auth.userId
    };
    if (data.recordingId) payload.recording_id = data.recordingId;

    const { data: row, error } = await this.supabase.from("business_process_specifications").insert(payload).select("*").single();
    if (error) throw error;
    return this.bpsFromRow(row);
  }
  async getBPS(auth: AuthContext, id: string): Promise<BPSRow | undefined> {
    if (!id || !isUUID(id)) return undefined;
    const { data, error } = await this.supabase.from("business_process_specifications").select("*").eq("tenant_id", auth.tenantId).eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? this.bpsFromRow(data) : undefined;
  }
  async updateBPS(auth: AuthContext, id: string, updates: Partial<BPSRow>): Promise<BPSRow | undefined> {
    const payload: any = { updated_at: new Date().toISOString() };
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.specificationJson !== undefined) payload.specification_json = updates.specificationJson;
    if (updates.gapsJson !== undefined) payload.gaps_json = updates.gapsJson;
    const { data, error } = await this.supabase.from("business_process_specifications").update(payload).eq("tenant_id", auth.tenantId).eq("id", id).select("*").maybeSingle();
    if (error) throw error;
    return data ? this.bpsFromRow(data) : undefined;
  }
  async listBPSByWorker(auth: AuthContext, workerId: string): Promise<BPSRow[]> {
    const { data, error } = await this.supabase.from("business_process_specifications").select("*").eq("tenant_id", auth.tenantId).eq("worker_id", workerId).order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(r => this.bpsFromRow(r));
  }
  async deleteBPS(auth: AuthContext, id: string): Promise<boolean> {
    if (!id || !isUUID(id)) return false;
    const { error } = await this.supabase.from("business_process_specifications").delete().eq("tenant_id", auth.tenantId).eq("id", id);
    return !error;
  }

  async terminateWorkerRuns(auth: AuthContext, workerIds: string[]): Promise<void> {
    if (!workerIds || workerIds.length === 0) return;
    try {
      await this.supabase
        .from("execution_runs")
        .update({
          state: "FAILED",
          result_summary: "Worker purged upon document deletion",
          updated_at: new Date().toISOString()
        })
        .in("worker_id", workerIds)
        .in("state", ["RUNNING", "WAITING_FOR_HUMAN", "STARTING", "QUEUED"]);
    } catch (err) {
      logger.warn({ err, workerIds }, "FAILED_TERMINATING_PURGED_WORKER_RUNS");
    }
  }

  async purgeWorkerRuns(auth: AuthContext, workerIds: string[]): Promise<void> {
    if (!workerIds || workerIds.length === 0) return;
    try {
      const { data: runs } = await this.supabase
        .from("execution_runs")
        .select("id")
        .in("worker_id", workerIds);
      if (runs && runs.length > 0) {
        const runIds = runs.map((r: any) => r.id);
        await this.supabase.from("execution_steps").delete().in("run_id", runIds);
        await this.supabase.from("hitl_requests").delete().in("run_id", runIds);
        await this.supabase.from("execution_checkpoints").delete().in("run_id", runIds);
        await this.supabase.from("execution_runs").delete().in("id", runIds);
      }
    } catch (err) {
      logger.warn({ err, workerIds }, "FAILED_PURGING_WORKER_RUNS");
    }
  }

  // --- Clarification ---
  async submitClarificationAnswer(auth: AuthContext, data: { bpsId: string; gapId: string; answerType: string; answerJson: any }): Promise<ClarificationAnswerRow> {
    const validAnswerTypes = ["TEXT", "NUMBER", "YES_NO", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "FILE_REFERENCE", "CONNECTION_REFERENCE"];
    const rawType = (data.answerType || "TEXT").toUpperCase();
    const answerType = validAnswerTypes.includes(rawType) ? rawType : (rawType === "BOOLEAN" ? "YES_NO" : (rawType === "CHOICE" ? "SINGLE_CHOICE" : "TEXT"));

    const { data: row, error } = await this.supabase.from("clarification_answers").insert({
      tenant_id: auth.tenantId, bps_id: data.bpsId, gap_id: data.gapId,
      answer_type: answerType, answer_json: data.answerJson, answered_by: auth.userId
    }).select("*").single();
    if (error) throw error;
    return { id: row.id, tenantId: row.tenant_id, bpsId: row.bps_id, gapId: row.gap_id, answerType: row.answer_type, answerJson: row.answer_json, answeredBy: row.answered_by, createdAt: row.created_at };
  }
  async listClarificationAnswers(auth: AuthContext, bpsId: string): Promise<ClarificationAnswerRow[]> {
    const { data, error } = await this.supabase.from("clarification_answers").select("*").eq("tenant_id", auth.tenantId).eq("bps_id", bpsId);
    if (error) throw error;
    return (data ?? []).map(r => ({ id: r.id, tenantId: r.tenant_id, bpsId: r.bps_id, gapId: r.gap_id, answerType: r.answer_type, answerJson: r.answer_json, answeredBy: r.answered_by, createdAt: r.created_at }));
  }

  // --- Schedules ---
  async createSchedule(auth: AuthContext, data: { workerId: string; cronExpression: string }): Promise<ScheduleRow> {
    const { data: row, error } = await this.supabase.from("ghost_worker_schedules").insert({
      tenant_id: auth.tenantId, worker_id: data.workerId, cron_expression: data.cronExpression
    }).select("*").single();
    if (error) throw error;
    return this.scheduleFromRow(row);
  }
  async getSchedule(auth: AuthContext, id: string): Promise<ScheduleRow | undefined> {
    const { data, error } = await this.supabase.from("ghost_worker_schedules").select("*").eq("tenant_id", auth.tenantId).eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? this.scheduleFromRow(data) : undefined;
  }
  async updateSchedule(auth: AuthContext, id: string, updates: Partial<ScheduleRow>): Promise<ScheduleRow | undefined> {
    const payload: any = { updated_at: new Date().toISOString() };
    if (updates.cronExpression !== undefined) payload.cron_expression = updates.cronExpression;
    if (updates.enabled !== undefined) payload.enabled = updates.enabled;
    if (updates.nextRunAt !== undefined) payload.next_run_at = updates.nextRunAt;
    if (updates.lastRunAt !== undefined) payload.last_run_at = updates.lastRunAt;
    const { data, error } = await this.supabase.from("ghost_worker_schedules").update(payload).eq("tenant_id", auth.tenantId).eq("id", id).select("*").maybeSingle();
    if (error) throw error;
    return data ? this.scheduleFromRow(data) : undefined;
  }
  async deleteSchedule(auth: AuthContext, id: string): Promise<boolean> {
    const { data, error } = await this.supabase.from("ghost_worker_schedules").delete().eq("tenant_id", auth.tenantId).eq("id", id).select("id");
    return !error && (data?.length ?? 0) > 0;
  }
  async listSchedules(auth: AuthContext, workerId?: string): Promise<ScheduleRow[]> {
    let q = this.supabase.from("ghost_worker_schedules").select("*").eq("tenant_id", auth.tenantId);
    if (workerId) q = q.eq("worker_id", workerId);
    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(r => this.scheduleFromRow(r));
  }
  async listDueSchedules(): Promise<ScheduleRow[]> {
    const { data, error } = await this.supabase.from("ghost_worker_schedules").select("*").eq("enabled", true).lte("next_run_at", new Date().toISOString());
    if (error) throw error;
    return (data ?? []).map(r => this.scheduleFromRow(r));
  }

  // --- Connections ---
  async createConnection(auth: AuthContext, data: { name: string; system: string; connectionType: string; secretRef: string }): Promise<ConnectionRow> {
    const { data: row, error } = await this.supabase.from("connections").insert({
      tenant_id: auth.tenantId, name: data.name, system: data.system, secret_ref: data.secretRef, created_by: auth.userId
    }).select("*").single();
    if (error) throw error;
    return this.connectionFromRow(row);
  }
  async listConnections(auth: AuthContext): Promise<ConnectionRow[]> {
    const { data, error } = await this.supabase.from("connections").select("*").eq("tenant_id", auth.tenantId).order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(r => this.connectionFromRow(r));
  }
  async getConnection(auth: AuthContext, id: string): Promise<ConnectionRow | undefined> {
    const { data, error } = await this.supabase.from("connections").select("*").eq("tenant_id", auth.tenantId).eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? this.connectionFromRow(data) : undefined;
  }
  async deleteConnection(auth: AuthContext, id: string): Promise<boolean> {
    const { error } = await this.supabase.from("connections").delete().eq("tenant_id", auth.tenantId).eq("id", id);
    return !error;
  }

  // --- Notifications ---
  async createNotification(auth: AuthContext, data: { type: string; channel: string; title: string; body?: string; resourceType?: string; resourceId?: string }): Promise<NotificationRow> {
    const { data: row, error } = await this.supabase.from("notifications").insert({
      tenant_id: auth.tenantId, type: data.type, channel: data.channel, title: data.title,
      body: data.body ?? null, resource_type: data.resourceType ?? null, resource_id: data.resourceId ?? null
    }).select("*").single();
    if (error) throw error;
    return { id: row.id, tenantId: row.tenant_id, type: row.type, channel: row.channel, title: row.title, body: row.body, resourceType: row.resource_type, resourceId: row.resource_id, read: row.read, sentAt: row.sent_at, createdAt: row.created_at };
  }
  async listNotifications(auth: AuthContext): Promise<NotificationRow[]> {
    const { data, error } = await this.supabase.from("notifications").select("*").eq("tenant_id", auth.tenantId).order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return (data ?? []).map(r => ({ id: r.id, tenantId: r.tenant_id, type: r.type, channel: r.channel, title: r.title, body: r.body, resourceType: r.resource_type, resourceId: r.resource_id, read: r.read, sentAt: r.sent_at, createdAt: r.created_at }));
  }
  async markNotificationRead(auth: AuthContext, id: string): Promise<void> {
    await this.supabase.from("notifications").update({ read: true }).eq("tenant_id", auth.tenantId).eq("id", id);
  }

  // --- Run result ---
  async updateRunResult(auth: AuthContext, runId: string, resultSummary: any): Promise<void> {
    await this.supabase.from("execution_runs").update({ result_summary: resultSummary }).eq("tenant_id", auth.tenantId).eq("id", runId);
  }

  // --- Documents ---
  async createDocument(auth: AuthContext, data: { workerId: string; type: "CSV" | "SOP" | "EXCEL" | "PDF" | "DOCX" | "TXT" | "IMAGE" | "VIDEO" | "DESKTOP_RECORDING"; name: string; parsedJson: any }): Promise<DocumentRow> {
    const doc = {
      id: crypto.randomUUID(),
      tenant_id: auth.tenantId,
      worker_id: data.workerId,
      type: data.type,
      name: data.name,
      parsed_json: data.parsedJson,
      created_at: new Date().toISOString()
    };
    await this.throwOnError(this.supabase.from("worker_documents").insert(doc));
    return {
      id: doc.id,
      tenantId: doc.tenant_id,
      workerId: doc.worker_id,
      type: doc.type as "CSV" | "SOP",
      name: doc.name,
      parsedJson: doc.parsed_json,
      createdAt: doc.created_at
    };
  }
  
  async listDocuments(auth: AuthContext, workerId: string): Promise<DocumentRow[]> {
    let targetIds = [workerId];
    try {
      const allWorkers = await this.listGhostWorkers(auth).catch(() => []);
      const workerObj = allWorkers.find(w => w.id === workerId || (w as any).allIds?.includes(workerId)) ||
                       allWorkers.find(w => w.name && w.name.trim().toLowerCase() === workerId.trim().toLowerCase());
      const workerName = workerObj?.name?.trim().toLowerCase();
      const siblingIds = workerName
        ? allWorkers.filter(w => w.name && w.name.trim().toLowerCase() === workerName).map(w => w.id)
        : [];
      targetIds = Array.from(new Set([
        workerId,
        ...(workerObj ? [workerObj.id] : []),
        ...siblingIds,
        ...((workerObj as any)?.allIds || [])
      ].filter(Boolean)));
    } catch (_) {}

    let { data, error } = await this.supabase
      .from("worker_documents")
      .select("*")
      .in("worker_id", targetIds)
      .order("created_at", { ascending: false });

    if (!data || data.length === 0) {
      const fallback = await this.supabase
        .from("worker_documents")
        .select("*")
        .in("worker_id", targetIds)
        .order("created_at", { ascending: false });
      if (fallback.data && fallback.data.length > 0) {
        data = fallback.data;
      }
    }
    if (error && (!data || data.length === 0)) throw error;
    return (data ?? []).map(r => ({
      id: r.id,
      tenantId: r.tenant_id,
      workerId: r.worker_id,
      type: r.type,
      name: r.name,
      parsedJson: r.parsed_json,
      createdAt: r.created_at
    }));
  }
  
  async getDocument(auth: AuthContext, id: string): Promise<DocumentRow | undefined> {
    if (!id || !isUUID(id)) return undefined;
    const { data, error } = await this.supabase.from("worker_documents").select("*").eq("tenant_id", auth.tenantId).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    return {
      id: data.id,
      tenantId: data.tenant_id,
      workerId: data.worker_id,
      type: data.type,
      name: data.name,
      parsedJson: data.parsed_json,
      createdAt: data.created_at
    };
  }

  async deleteDocument(auth: AuthContext, id: string): Promise<boolean> {
    if (!id) return false;
    const scope = getTenantScope(auth.tenantId);

    // Delete physical file from disk if local path exists
    try {
      const doc = await this.getDocument(auth, id);
      const filePath = (doc?.parsedJson as any)?.filePath;
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {}

    let { error, count } = await this.supabase
      .from("worker_documents")
      .delete({ count: "exact" })
      .eq("id", id)
      .in("tenant_id", scope);

    if (error || (count ?? 0) === 0) {
      const res = await this.supabase
        .from("worker_documents")
        .delete({ count: "exact" })
        .eq("id", id);
      if (res.error) {
        logger.warn({ error: res.error.message, id }, "Failed to delete document from worker_documents");
        return false;
      }
      count = res.count;
    }
    return (count ?? 1) > 0;
  }

  private workerFromRow(row: any): GhostWorkerRow {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      description: row.description ?? undefined,
      status: row.status,
      workflowId: row.workflow_id ?? undefined,
      activeVersionId: row.active_version_id ?? undefined,
      publishedVersionId: row.published_version_id ?? undefined,
      recordingId: row.recording_id ?? undefined,
      bpsId: row.bps_id ?? undefined,
      triggerType: row.trigger_type ?? undefined,
      triggerConfig: row.trigger_config ?? undefined,
      trainingSource: row.trigger_config?.trainingSource ?? row.training_source ?? undefined,
      analysisStage: row.analysis_stage ?? undefined,
      safetyPolicy: row.safety_policy ?? {},
      workerType: row.safety_policy?.workerType || row.trigger_config?.workerType || "WEB_BROWSER",
      department: row.safety_policy?.department ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private recordingFromRow(row: any): RecordingRow | undefined {
    const rawEvents = Array.isArray(row.recording_events) ? row.recording_events : [];
    const events = rawEvents
      .map((eventRow: any) => {
        const candidate = eventRow?.event ?? eventRow;
        if (!candidate || typeof candidate !== "object") return undefined;
        return {
          ...candidate,
          event_id: candidate.event_id ?? candidate.id ?? row.id,
          sequence: typeof candidate.sequence === "number" ? candidate.sequence : 0,
          timestamp: normalizeTimestamp(candidate.timestamp),
          page: candidate.page && typeof candidate.page === "object" ? candidate.page : { url: "https://example.invalid", title: "Unknown" },
          target: candidate.target && typeof candidate.target === "object" ? candidate.target : undefined,
          input: candidate.input ?? null,
          viewport: candidate.viewport && typeof candidate.viewport === "object" ? candidate.viewport : { width: 1280, height: 720 },
          browser: candidate.browser && typeof candidate.browser === "object" ? candidate.browser : { user_agent: "unknown" }
        };
      })
      .filter((event: any): event is Record<string, unknown> => Boolean(event))
      .sort((a: any, b: any) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0));
    try {
      const upload = validateRecordingUpload({
        recording_id: row.id,
        started_at: normalizeTimestamp(row.started_at),
        ended_at: row.ended_at ? normalizeTimestamp(row.ended_at) : undefined,
        source: row.source,
        events,
        metadata: row.metadata ?? {}
      });
      return { id: row.id, tenantId: row.tenant_id, upload, createdAt: this.toIsoString(row.created_at) };
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
        return undefined;
      }
      throw error;
    }
  }

  private workflowVersionFromRow(row: any): WorkflowVersionRow {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      workflowId: row.workflow_id,
      version: row.version,
      workflow: validateWorkflow(row.definition),
      createdAt: row.created_at
    };
  }

  private runFromRow(row: any): RunRow {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      workflowVersionId: row.workflow_version_id,
      state: row.state,
      idempotencyKey: row.idempotency_key ?? undefined,
      workerId: row.worker_id ?? undefined,
      runMode: row.run_mode ?? undefined,
      createdBy: row.created_by ?? undefined,
      metadata: row.metadata ?? undefined,
      resultSummary: row.result_summary ?? row.metadata?.resultSummary ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private executionStepFromRow(row: any): ExecutionStepRow {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      runId: row.run_id,
      stepId: row.step_id,
      state: row.state,
      strategy: row.strategy ?? undefined,
      metadata: row.metadata ?? {},
      startedAt: row.started_at ?? undefined,
      finishedAt: row.finished_at ?? undefined
    };
  }

  private hitlFromRow(row: any): HitlRequestRow {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      runId: row.run_id,
      reason: row.reason,
      challengeType: row.challenge_type || row.reason,
      state: row.state,
      workflowStepId: row.workflow_step_id ?? undefined,
      workflowVersionId: row.workflow_version_id ?? undefined,
      expiresAt: row.expires_at ?? undefined,
      decision: row.decision ?? undefined,
      decisionPayload: row.decision_payload ?? undefined,
      decidedBy: row.decided_by ?? undefined,
      decidedAt: row.decided_at ?? undefined,
      createdAt: row.created_at
    };
  }

  private toIsoString(value: unknown): string {
    return normalizeTimestamp(value);
  }

  private bpsFromRow(row: any): BPSRow {
    return {
      id: row.id, tenantId: row.tenant_id, workerId: row.worker_id, recordingId: row.recording_id,
      status: row.status, specificationJson: row.specification_json, generalizationJson: row.generalization_json,
      gapsJson: row.gaps_json, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at
    };
  }

  private scheduleFromRow(row: any): ScheduleRow {
    return {
      id: row.id, tenantId: row.tenant_id, workerId: row.worker_id,
      cronExpression: row.cron_expression, enabled: row.enabled,
      lastRunAt: row.last_run_at, nextRunAt: row.next_run_at,
      createdAt: row.created_at, updatedAt: row.updated_at
    };
  }

  private connectionFromRow(row: any): ConnectionRow {
    return {
      id: row.id, tenantId: row.tenant_id, name: row.name, system: row.system,
      connectionType: row.connection_type ?? "browser_login", status: row.status,
      secretRef: row.secret_ref, requiresAttention: row.requires_attention,
      lastVerifiedAt: row.last_verified_at, createdAt: row.created_at, updatedAt: row.updated_at
    };
  }

  private async throwOnError<T>(query: PromiseLike<{ error: unknown } | { error: null; data: T }>): Promise<void> {
    const result = await query;
    if (result.error) throw result.error;
  }

  // Background Tasks
  async enqueueTask(tenantId: string, type: string, payload: any, delayMs: number = 0): Promise<string> {
    const scheduledFor = new Date(Date.now() + delayMs).toISOString();
    const { data, error } = await this.supabase.from("background_tasks").insert({
      tenant_id: tenantId,
      type,
      payload,
      status: "PENDING",
      retry_count: 0,
      scheduled_for: scheduledFor
    }).select("id").single();
    if (error) throw error;
    return data.id;
  }

  async pollTasks(limit: number = 10): Promise<any[]> {
    // Uses Postgres SKIP LOCKED via our custom RPC function
    try {
      const { data, error } = await this.supabase
        .rpc("claim_background_task", { claim_limit: limit });
        
      if (error) {
        const msg = error.message || "";
        // If transient network failure (e.g. Node fetch dropped during sleep or timeout), warn instead of throwing fatal loop error
        if (msg.includes("fetch failed") || msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT") || msg.includes("network")) {
          console.warn(`[SupabaseStore] Transient network failure polling background tasks: ${msg}`);
          return [];
        }
        throw new Error(`Failed to claim tasks via RPC: ${error.message}`);
      }
      
      if (!data || data.length === 0) return [];

      return data.map((d: any) => ({
        id: d.id, 
        tenantId: d.tenant_id, 
        type: d.type, 
        payload: d.payload,
        status: d.status, 
        retryCount: d.retry_count, 
        scheduledFor: d.scheduled_for
      }));
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes("fetch failed") || msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT") || msg.includes("network")) {
        console.warn(`[SupabaseStore] Transient network failure polling background tasks: ${msg}`);
        return [];
      }
      throw err;
    }
  }

  async completeTask(taskId: string): Promise<void> {
    await this.throwOnError(this.supabase.from("background_tasks").update({ status: "COMPLETED", completed_at: new Date().toISOString() }).eq("id", taskId));
  }

  async failTask(taskId: string, error: unknown): Promise<void> {
    // Read retry count
    const { data } = await this.supabase.from("background_tasks").select("retry_count").eq("id", taskId).single();
    if (!data) return;
    
    const retryCount = (data.retry_count || 0) + 1;
    let status = "PENDING";
    let scheduledFor = new Date(Date.now() + Math.pow(2, retryCount) * 1000).toISOString();
    
    if (retryCount >= 3) {
      status = "FAILED";
      scheduledFor = new Date().toISOString();
    }
    
    await this.throwOnError(this.supabase.from("background_tasks").update({
      status,
      retry_count: retryCount,
      scheduled_for: scheduledFor,
      error_message: String(error)
    }).eq("id", taskId));
  }

  // Desktop Execution Supabase methods
  async registerDesktopAgent(auth: AuthContext, data: { name: string; hostname: string; osVersion: string; capabilities: string[] }): Promise<{ agent: DesktopAgentRow; session: DesktopAgentSessionRow; token: string }> {
    try {
      const token = `dsk_${crypto.randomUUID().replace(/-/g, "")}`;
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { data: agentData, error: agentError } = await this.supabase
        .from("desktop_agents")
        .insert({
          tenant_id: auth.tenantId,
          name: data.name,
          hostname: data.hostname,
          os_version: data.osVersion,
          capabilities: data.capabilities,
          status: "CONNECTED"
        })
        .select("*")
        .single();
      if (agentError) {
        if (this.isMissingTableError(agentError)) {
          this.handleDesktopMissingTable("desktop_agents");
          return this.desktopFallback.registerDesktopAgent(auth, data);
        }
        throw agentError;
      }

      const { data: sessionData, error: sessionError } = await this.supabase
        .from("desktop_agent_sessions")
        .insert({
          tenant_id: auth.tenantId,
          agent_id: agentData.id,
          token_hash: tokenHash,
          status: "ACTIVE",
          expires_at: expiresAt
        })
        .select("*")
        .single();
      if (sessionError) {
        if (this.isMissingTableError(sessionError)) {
          this.handleDesktopMissingTable("desktop_agent_sessions");
          return this.desktopFallback.registerDesktopAgent(auth, data);
        }
        throw sessionError;
      }

      await this.supabase
        .from("desktop_agents")
        .update({ active_session_id: sessionData.id })
        .eq("id", agentData.id);

      const agent: DesktopAgentRow = {
        id: agentData.id,
        tenantId: agentData.tenant_id,
        name: agentData.name,
        hostname: agentData.hostname,
        osVersion: agentData.os_version,
        status: agentData.status,
        capabilities: agentData.capabilities || [],
        activeSessionId: sessionData.id,
        lastHeartbeatAt: agentData.last_heartbeat_at,
        createdAt: agentData.created_at,
        updatedAt: agentData.updated_at
      };

      const session: DesktopAgentSessionRow = {
        id: sessionData.id,
        tenantId: sessionData.tenant_id,
        agentId: sessionData.agent_id,
        tokenHash: sessionData.token_hash,
        status: sessionData.status,
        expiresAt: sessionData.expires_at,
        createdAt: sessionData.created_at
      };

      return { agent, session, token };
    } catch (err: any) {
      if (this.isMissingTableError(err)) {
        this.handleDesktopMissingTable("desktop_agents");
        return this.desktopFallback.registerDesktopAgent(auth, data);
      }
      throw err;
    }
  }

  async getDesktopAgent(auth: AuthContext, id: string): Promise<DesktopAgentRow | undefined> {
    try {
      const { data, error } = await this.supabase
        .from("desktop_agents")
        .select("*")
        .eq("tenant_id", auth.tenantId)
        .eq("id", id)
        .maybeSingle();
      if (error) {
        if (this.isMissingTableError(error)) {
          this.handleDesktopMissingTable("desktop_agents");
          return this.desktopFallback.getDesktopAgent(auth, id);
        }
        throw error;
      }
      if (!data) return this.desktopFallback.getDesktopAgent(auth, id);

      return {
        id: data.id,
        tenantId: data.tenant_id,
        name: data.name,
        hostname: data.hostname,
        osVersion: data.os_version,
        status: data.status,
        capabilities: data.capabilities || [],
        activeSessionId: data.active_session_id,
        lastHeartbeatAt: data.last_heartbeat_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
    } catch (err: any) {
      if (this.isMissingTableError(err)) {
        this.handleDesktopMissingTable("desktop_agents");
        return this.desktopFallback.getDesktopAgent(auth, id);
      }
      throw err;
    }
  }

  async listDesktopAgents(auth: AuthContext): Promise<DesktopAgentRow[]> {
    try {
      const { data, error } = await this.supabase
        .from("desktop_agents")
        .select("*")
        .eq("tenant_id", auth.tenantId)
        .order("created_at", { ascending: false });
      if (error) {
        if (this.isMissingTableError(error)) {
          this.handleDesktopMissingTable("desktop_agents");
          return this.desktopFallback.listDesktopAgents(auth);
        }
        throw error;
      }

      const rows: DesktopAgentRow[] = (data || []).map((d: any) => ({
        id: d.id,
        tenantId: d.tenant_id,
        name: d.name,
        hostname: d.hostname,
        osVersion: d.os_version,
        status: d.status,
        capabilities: d.capabilities || [],
        activeSessionId: d.active_session_id,
        lastHeartbeatAt: d.last_heartbeat_at,
        createdAt: d.created_at,
        updatedAt: d.updated_at
      }));

      const fallbackItems = await this.desktopFallback.listDesktopAgents(auth);
      const combined: DesktopAgentRow[] = [...rows];
      for (const fb of fallbackItems) {
        if (!combined.some(c => c.id === fb.id)) {
          combined.push(fb);
        }
      }
      return combined;
    } catch (err: any) {
      if (this.isMissingTableError(err)) {
        this.handleDesktopMissingTable("desktop_agents");
        return this.desktopFallback.listDesktopAgents(auth);
      }
      throw err;
    }
  }

  async updateDesktopAgentHeartbeat(auth: AuthContext, agentId: string, status?: string): Promise<void> {
    try {
      const payload: any = {
        last_heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      if (status) payload.status = status;

      const { error } = await this.supabase
        .from("desktop_agents")
        .update(payload)
        .eq("tenant_id", auth.tenantId)
        .eq("id", agentId);
      if (error) {
        if (this.isMissingTableError(error)) {
          this.handleDesktopMissingTable("desktop_agents");
          return this.desktopFallback.updateDesktopAgentHeartbeat(auth, agentId, status);
        }
        throw error;
      }
    } catch (err: any) {
      if (this.isMissingTableError(err)) {
        this.handleDesktopMissingTable("desktop_agents");
        return this.desktopFallback.updateDesktopAgentHeartbeat(auth, agentId, status);
      }
      throw err;
    }
  }

  async revokeDesktopAgent(auth: AuthContext, agentId: string): Promise<void> {
    try {
      const { error: agentError } = await this.supabase
        .from("desktop_agents")
        .update({ status: "REVOKED", updated_at: new Date().toISOString() })
        .eq("tenant_id", auth.tenantId)
        .eq("id", agentId);
      if (agentError && this.isMissingTableError(agentError)) {
        this.handleDesktopMissingTable("desktop_agents");
        return this.desktopFallback.revokeDesktopAgent(auth, agentId);
      }
      await this.supabase
        .from("desktop_agent_sessions")
        .update({ status: "TERMINATED" })
        .eq("tenant_id", auth.tenantId)
        .eq("agent_id", agentId);
    } catch (err: any) {
      if (this.isMissingTableError(err)) {
        this.handleDesktopMissingTable("desktop_agents");
        return this.desktopFallback.revokeDesktopAgent(auth, agentId);
      }
      throw err;
    }
  }

  async createDesktopCommand(auth: AuthContext, data: Omit<DesktopExecutionCommandRow, "id" | "tenantId" | "status" | "createdAt">): Promise<DesktopExecutionCommandRow> {
    try {
      const { data: row, error } = await this.supabase
        .from("desktop_execution_commands")
        .insert({
          tenant_id: auth.tenantId,
          agent_id: data.agentId,
          execution_id: data.executionId,
          step_id: data.stepId,
          sequence_number: data.sequenceNumber,
          action_type: data.actionType,
          payload: data.payload,
          status: "PENDING"
        })
        .select("*")
        .single();
      if (error) {
        if (this.isMissingTableError(error)) {
          this.handleDesktopMissingTable("desktop_execution_commands");
          return this.desktopFallback.createDesktopCommand(auth, data);
        }
        throw error;
      }

      return {
        id: row.id,
        tenantId: row.tenant_id,
        agentId: row.agent_id,
        executionId: row.execution_id,
        stepId: row.step_id,
        sequenceNumber: row.sequence_number,
        actionType: row.action_type,
        payload: row.payload,
        status: row.status,
        createdAt: row.created_at
      };
    } catch (err: any) {
      if (this.isMissingTableError(err)) {
        this.handleDesktopMissingTable("desktop_execution_commands");
        return this.desktopFallback.createDesktopCommand(auth, data);
      }
      throw err;
    }
  }

  async pollDesktopCommands(auth: AuthContext, agentId: string): Promise<DesktopExecutionCommandRow[]> {
    try {
      const { data, error } = await this.supabase
        .from("desktop_execution_commands")
        .select("*")
        .eq("tenant_id", auth.tenantId)
        .eq("agent_id", agentId)
        .eq("status", "PENDING")
        .order("sequence_number", { ascending: true });
      if (error) {
        if (this.isMissingTableError(error)) {
          this.handleDesktopMissingTable("desktop_execution_commands");
          return this.desktopFallback.pollDesktopCommands(auth, agentId);
        }
        throw error;
      }

      if (data && data.length > 0) {
        const ids = data.map((d: any) => d.id);
        await this.supabase
          .from("desktop_execution_commands")
          .update({ status: "DISPATCHED" })
          .in("id", ids);
      }

      const items: DesktopExecutionCommandRow[] = (data || []).map((row: any) => ({
        id: row.id,
        tenantId: row.tenant_id,
        agentId: row.agent_id,
        executionId: row.execution_id,
        stepId: row.step_id,
        sequenceNumber: row.sequence_number,
        actionType: row.action_type,
        payload: row.payload,
        status: "DISPATCHED" as const,
        createdAt: row.created_at
      }));

      const fallbackItems = await this.desktopFallback.pollDesktopCommands(auth, agentId);
      return [...items, ...fallbackItems];
    } catch (err: any) {
      if (this.isMissingTableError(err)) {
        this.handleDesktopMissingTable("desktop_execution_commands");
        return this.desktopFallback.pollDesktopCommands(auth, agentId);
      }
      throw err;
    }
  }

  async updateDesktopCommandStatus(auth: AuthContext, commandId: string, status: string, result?: any, error?: string): Promise<void> {
    try {
      const payload: any = { status };
      if (result !== undefined) payload.result = result;
      if (error !== undefined) payload.error = error;
      if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(status)) {
        payload.completed_at = new Date().toISOString();
      }

      const { error: updateError } = await this.supabase
        .from("desktop_execution_commands")
        .update(payload)
        .eq("tenant_id", auth.tenantId)
        .eq("id", commandId);
      if (updateError) {
        if (this.isMissingTableError(updateError)) {
          this.handleDesktopMissingTable("desktop_execution_commands");
          return this.desktopFallback.updateDesktopCommandStatus(auth, commandId, status, result, error);
        }
        throw updateError;
      }
    } catch (err: any) {
      if (this.isMissingTableError(err)) {
        this.handleDesktopMissingTable("desktop_execution_commands");
        return this.desktopFallback.updateDesktopCommandStatus(auth, commandId, status, result, error);
      }
      throw err;
    }
  }

  async recordDesktopEvent(auth: AuthContext, event: Omit<DesktopExecutionEventRow, "id" | "tenantId" | "createdAt">): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("desktop_execution_events")
        .insert({
          tenant_id: auth.tenantId,
          agent_id: event.agentId,
          execution_id: event.executionId,
          step_id: event.stepId,
          event_type: event.eventType,
          payload: event.payload
        });
      if (error) {
        if (this.isMissingTableError(error)) {
          this.handleDesktopMissingTable("desktop_execution_events");
          return this.desktopFallback.recordDesktopEvent(auth, event);
        }
        throw error;
      }
    } catch (err: any) {
      if (this.isMissingTableError(err)) {
        this.handleDesktopMissingTable("desktop_execution_events");
        return this.desktopFallback.recordDesktopEvent(auth, event);
      }
      throw err;
    }
  }

  async listDesktopEvents(auth: AuthContext, executionId: string): Promise<DesktopExecutionEventRow[]> {
    try {
      const { data, error } = await this.supabase
        .from("desktop_execution_events")
        .select("*")
        .eq("tenant_id", auth.tenantId)
        .eq("execution_id", executionId)
        .order("created_at", { ascending: true });
      if (error) {
        if (this.isMissingTableError(error)) {
          this.handleDesktopMissingTable("desktop_execution_events");
          return this.desktopFallback.listDesktopEvents(auth, executionId);
        }
        throw error;
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        tenantId: row.tenant_id,
        agentId: row.agent_id,
        executionId: row.execution_id,
        stepId: row.step_id,
        eventType: row.event_type,
        payload: row.payload,
        createdAt: row.created_at
      }));
    } catch (err: any) {
      if (this.isMissingTableError(err)) {
        this.handleDesktopMissingTable("desktop_execution_events");
        return this.desktopFallback.listDesktopEvents(auth, executionId);
      }
      throw err;
    }
  }

  async saveDesktopCorrection(auth: AuthContext, data: Omit<DesktopCorrectionRow, "id" | "tenantId" | "createdAt">): Promise<DesktopCorrectionRow> {
    try {
      const { data: row, error } = await this.supabase
        .from("desktop_corrections")
        .insert({
          tenant_id: auth.tenantId,
          agent_id: data.agentId,
          execution_id: data.executionId,
          step_id: data.stepId,
          correction_type: data.correctionType,
          original_action: data.originalAction,
          corrected_action: data.correctedAction,
          rule_or_selector: data.ruleOrSelector,
          notes: data.notes,
          status: data.status
        })
        .select("*")
        .single();
      if (error) {
        if (this.isMissingTableError(error)) {
          this.handleDesktopMissingTable("desktop_corrections");
          return this.desktopFallback.saveDesktopCorrection(auth, data);
        }
        throw error;
      }

      return {
        id: row.id,
        tenantId: row.tenant_id,
        agentId: row.agent_id,
        executionId: row.execution_id,
        stepId: row.step_id,
        correctionType: row.correction_type,
        originalAction: row.original_action,
        correctedAction: row.corrected_action,
        ruleOrSelector: row.rule_or_selector,
        notes: row.notes,
        status: row.status,
        createdAt: row.created_at
      };
    } catch (err: any) {
      if (this.isMissingTableError(err)) {
        this.handleDesktopMissingTable("desktop_corrections");
        return this.desktopFallback.saveDesktopCorrection(auth, data);
      }
      throw err;
    }
  }

  async listDesktopCorrections(auth: AuthContext, executionId?: string): Promise<DesktopCorrectionRow[]> {
    try {
      let query = this.supabase
        .from("desktop_corrections")
        .select("*")
        .eq("tenant_id", auth.tenantId)
        .order("created_at", { ascending: false });

      if (executionId) {
        query = query.eq("execution_id", executionId);
      }

      const { data, error } = await query;
      if (error) {
        if (this.isMissingTableError(error)) {
          this.handleDesktopMissingTable("desktop_corrections");
          return this.desktopFallback.listDesktopCorrections(auth, executionId);
        }
        throw error;
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        tenantId: row.tenant_id,
        agentId: row.agent_id,
        executionId: row.execution_id,
        stepId: row.step_id,
        correctionType: row.correction_type,
        originalAction: row.original_action,
        correctedAction: row.corrected_action,
        ruleOrSelector: row.rule_or_selector,
        notes: row.notes,
        status: row.status,
        createdAt: row.created_at
      }));
    } catch (err: any) {
      if (this.isMissingTableError(err)) {
        this.handleDesktopMissingTable("desktop_corrections");
        return this.desktopFallback.listDesktopCorrections(auth, executionId);
      }
      throw err;
    }
  }

  async registerDesktopApplication(auth: AuthContext, data: Omit<DesktopApplicationRegistryRow, "id" | "tenantId" | "createdAt">): Promise<DesktopApplicationRegistryRow> {
    try {
      const { data: row, error } = await this.supabase
        .from("desktop_application_registry")
        .insert({
          tenant_id: auth.tenantId,
          application_id: data.applicationId,
          display_name: data.displayName,
          executable_path: data.executablePath,
          window_title_patterns: data.windowTitlePatterns,
          capabilities: data.capabilities,
          metadata: data.metadata
        })
        .select("*")
        .single();
      if (error) {
        if (this.isMissingTableError(error)) {
          this.handleDesktopMissingTable("desktop_application_registry");
          return this.desktopFallback.registerDesktopApplication(auth, data);
        }
        throw error;
      }

      return {
        id: row.id,
        tenantId: row.tenant_id,
        applicationId: row.application_id,
        displayName: row.display_name,
        executablePath: row.executable_path,
        windowTitlePatterns: row.window_title_patterns || [],
        capabilities: row.capabilities || [],
        metadata: row.metadata,
        createdAt: row.created_at
      };
    } catch (err: any) {
      if (this.isMissingTableError(err)) {
        this.handleDesktopMissingTable("desktop_application_registry");
        return this.desktopFallback.registerDesktopApplication(auth, data);
      }
      throw err;
    }
  }

  async listDesktopApplications(auth: AuthContext): Promise<DesktopApplicationRegistryRow[]> {
    try {
      const { data, error } = await this.supabase
        .from("desktop_application_registry")
        .select("*")
        .eq("tenant_id", auth.tenantId)
        .order("display_name", { ascending: true });
      if (error) {
        if (this.isMissingTableError(error)) {
          this.handleDesktopMissingTable("desktop_application_registry");
          return this.desktopFallback.listDesktopApplications(auth);
        }
        throw error;
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        tenantId: row.tenant_id,
        applicationId: row.application_id,
        displayName: row.display_name,
        executablePath: row.executable_path,
        windowTitlePatterns: row.window_title_patterns || [],
        capabilities: row.capabilities || [],
        metadata: row.metadata,
        createdAt: row.created_at
      }));
    } catch (err: any) {
      if (this.isMissingTableError(err)) {
        this.handleDesktopMissingTable("desktop_application_registry");
        return this.desktopFallback.listDesktopApplications(auth);
      }
      throw err;
    }
  }
}


function normalizeTimestamp(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return new Date(0).toISOString();
    const asDate = new Date(trimmed);
    if (!Number.isNaN(asDate.valueOf())) return asDate.toISOString();
    return trimmed;
  }
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object" && "toISOString" in value && typeof (value as { toISOString: unknown }).toISOString === "function") {
    return (value as { toISOString: () => string }).toISOString();
  }
  return new Date(value as string | number | Date).toISOString();
}

