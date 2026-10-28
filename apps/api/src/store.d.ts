import { type SupabaseClient } from "@supabase/supabase-js";
import type { RecordingUpload, AnyWorkflow } from "@ghost/workflow-schema";
import type { AuthContext } from "@ghost/shared-types";
import type { ApiConfig } from "./config.js";
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
    workerId?: string;
    runMode?: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
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
    state: "PENDING" | "CONTROL_ACTIVE" | "VERIFYING" | "RESOLVED" | "EXPIRED" | "CANCELLED";
    createdAt: string;
};
export type AuditAction = "RECORDING_CREATED" | "RECORDING_COMPILED" | "WORKFLOW_CREATED" | "WORKFLOW_ACTIVATED" | "RUN_CREATED" | "EXECUTION_PAUSED" | "EXECUTION_RESUMED" | "RUN_CANCELLED";
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
    recordingId?: string;
    bpsId?: string;
    triggerType?: string;
    triggerConfig?: Record<string, unknown>;
    analysisStage?: string;
    safetyPolicy: Record<string, unknown>;
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
export interface AppStore {
    bootstrapWorkspace(userId: string): Promise<{
        organizationId: string;
        role: string;
    }>;
    createRecording(auth: AuthContext, upload: RecordingUpload, idempotencyKey?: string): Promise<RecordingRow>;
    startRecording(auth: AuthContext, data: {
        source: string;
        metadata?: Record<string, unknown>;
    }, idempotencyKey?: string): Promise<RecordingRow>;
    appendRecordingEvents(auth: AuthContext, recordingId: string, events: any[]): Promise<void>;
    finishRecording(auth: AuthContext, recordingId: string, endedAt: string): Promise<RecordingRow>;
    listRecordings(auth: AuthContext): Promise<RecordingRow[]>;
    getRecording(auth: AuthContext, id: string): Promise<RecordingRow | undefined>;
    createGhostWorker(auth: AuthContext, data: {
        name: string;
        description?: string;
    }): Promise<GhostWorkerRow>;
    listGhostWorkers(auth: AuthContext): Promise<GhostWorkerRow[]>;
    getGhostWorker(auth: AuthContext, id: string): Promise<GhostWorkerRow | undefined>;
    updateGhostWorker(auth: AuthContext, id: string, updates: Partial<GhostWorkerRow>): Promise<GhostWorkerRow | undefined>;
    addChatInstruction(auth: AuthContext, workerId: string, instruction: string): Promise<any>;
    addMemoryRule(auth: AuthContext, workerId: string, rule: string, structuredData?: any): Promise<any>;
    getWorkerMemory(auth: AuthContext, workerId: string): Promise<any>;
    getWorkerEvidence(auth: AuthContext, workerId: string): Promise<any>;
    createWorkflowVersion(auth: AuthContext, workflow: AnyWorkflow): Promise<WorkflowVersionRow>;
    listWorkflows(auth: AuthContext): Promise<WorkflowVersionRow[]>;
    getWorkflowVersion(auth: AuthContext, id: string): Promise<WorkflowVersionRow | undefined>;
    activateWorkflowVersion(auth: AuthContext, versionId: string): Promise<WorkflowVersionRow | undefined>;
    createRun(auth: AuthContext, workflowVersionId: string, idempotencyKey?: string, workerId?: string, runMode?: string, inputs?: Record<string, unknown>): Promise<RunRow>;
    takeHitlControl(tenantId: string, userId: string, runId: string): Promise<{
        run: RunRow;
        hitlRequest: any;
    }>;
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
    createHitlRequest(auth: AuthContext, params: {
        runId: string;
        workflowStepId: string;
        challengeType: string;
        expiresAt: string;
    }): Promise<void>;
    listHitlRequests(auth: AuthContext): Promise<HitlRequestRow[]>;
    writeAudit(auth: AuthContext, action: AuditAction, resourceType: string, resourceId?: string, metadata?: Record<string, unknown>): Promise<void>;
    listAudits(auth: AuthContext): Promise<any[]>;
    createBPS(auth: AuthContext, data: {
        workerId: string;
        recordingId?: string;
        status: string;
        specificationJson: any;
        generalizationJson: any;
        gapsJson: any[];
    }): Promise<BPSRow>;
    getBPS(auth: AuthContext, id: string): Promise<BPSRow | undefined>;
    updateBPS(auth: AuthContext, id: string, updates: Partial<BPSRow>): Promise<BPSRow | undefined>;
    listBPSByWorker(auth: AuthContext, workerId: string): Promise<BPSRow[]>;
    deleteBPS(auth: AuthContext, id: string): Promise<boolean>;
    terminateWorkerRuns(auth: AuthContext, workerIds: string[]): Promise<void>;
    submitClarificationAnswer(auth: AuthContext, data: {
        bpsId: string;
        gapId: string;
        answerType: string;
        answerJson: any;
    }): Promise<ClarificationAnswerRow>;
    listClarificationAnswers(auth: AuthContext, bpsId: string): Promise<ClarificationAnswerRow[]>;
    createSchedule(auth: AuthContext, data: {
        workerId: string;
        cronExpression: string;
    }): Promise<ScheduleRow>;
    getSchedule(auth: AuthContext, id: string): Promise<ScheduleRow | undefined>;
    updateSchedule(auth: AuthContext, id: string, updates: Partial<ScheduleRow>): Promise<ScheduleRow | undefined>;
    deleteSchedule(auth: AuthContext, id: string): Promise<boolean>;
    listSchedules(auth: AuthContext, workerId?: string): Promise<ScheduleRow[]>;
    listDueSchedules(): Promise<ScheduleRow[]>;
    createConnection(auth: AuthContext, data: {
        name: string;
        system: string;
        connectionType: string;
        secretRef: string;
    }): Promise<ConnectionRow>;
    listConnections(auth: AuthContext): Promise<ConnectionRow[]>;
    getConnection(auth: AuthContext, id: string): Promise<ConnectionRow | undefined>;
    deleteConnection(auth: AuthContext, id: string): Promise<boolean>;
    createNotification(auth: AuthContext, data: {
        type: string;
        channel: string;
        title: string;
        body?: string;
        resourceType?: string;
        resourceId?: string;
    }): Promise<NotificationRow>;
    listNotifications(auth: AuthContext): Promise<NotificationRow[]>;
    markNotificationRead(auth: AuthContext, id: string): Promise<void>;
    updateRunResult(auth: AuthContext, runId: string, resultSummary: any): Promise<void>;
    createDocument(auth: AuthContext, data: {
        workerId: string;
        type: "CSV" | "SOP" | "EXCEL" | "PDF" | "DOCX" | "TXT" | "IMAGE" | "VIDEO" | "DESKTOP_RECORDING";
        name: string;
        parsedJson: any;
    }): Promise<DocumentRow>;
    listDocuments(auth: AuthContext, workerId: string): Promise<DocumentRow[]>;
    getDocument(auth: AuthContext, id: string): Promise<DocumentRow | undefined>;
    enqueueTask(tenantId: string, type: string, payload: any, delayMs?: number): Promise<string>;
    pollTasks(limit?: number): Promise<any[]>;
    completeTask(taskId: string): Promise<void>;
    failTask(taskId: string, error: unknown): Promise<void>;
}
export declare function createStore(config: ApiConfig): AppStore;
export declare class InMemoryStore implements AppStore {
    recordings: Map<string, RecordingRow>;
    workflows: Map<string, WorkflowVersionRow>;
    runs: Map<string, any>;
    steps: Map<string, ExecutionStepRow>;
    hitl: Map<string, HitlRequestRow>;
    checkpoints: Map<string, ExecutionCheckpointRow>;
    workers: Map<string, GhostWorkerRow>;
    bpsList: Map<string, BPSRow>;
    clarifications: Map<string, ClarificationAnswerRow>;
    schedulesList: Map<string, ScheduleRow>;
    connectionsList: Map<string, ConnectionRow>;
    notificationsList: Map<string, NotificationRow>;
    documentsList: Map<string, DocumentRow>;
    auditsList: Map<string, any>;
    memoryList: Map<string, any>;
    constructor();
    bootstrapWorkspace(userId: string): Promise<{
        organizationId: string;
        role: string;
    }>;
    createGhostWorker(auth: AuthContext, data: {
        name: string;
        description?: string;
    }): Promise<GhostWorkerRow>;
    listGhostWorkers(auth: AuthContext): Promise<GhostWorkerRow[]>;
    getGhostWorker(auth: AuthContext, id: string): Promise<GhostWorkerRow | undefined>;
    addChatInstruction(auth: AuthContext, workerId: string, instruction: string): Promise<{
        id: `${string}-${string}-${string}-${string}-${string}`;
        tenantId: string;
        workerId: string;
        type: string;
        content: string;
        structured_data: {};
        createdAt: string;
    }>;
    addMemoryRule(auth: AuthContext, workerId: string, rule: string, structuredData?: any): Promise<{
        id: `${string}-${string}-${string}-${string}-${string}`;
        tenantId: string;
        workerId: string;
        type: string;
        content: string;
        structured_data: any;
        createdAt: string;
    }>;
    getWorkerMemory(auth: AuthContext, workerId: string): Promise<{
        rules: any[];
        instructions: any[];
    }>;
    getWorkerEvidence(auth: AuthContext, workerId: string): Promise<{
        documents: never[];
        recordings: never[];
    }>;
    updateGhostWorker(auth: AuthContext, id: string, updates: Partial<GhostWorkerRow>): Promise<GhostWorkerRow | undefined>;
    createRecording(auth: AuthContext, upload: RecordingUpload, idempotencyKey?: string): Promise<RecordingRow>;
    startRecording(auth: AuthContext, data: {
        source: string;
        metadata?: Record<string, unknown>;
    }, idempotencyKey?: string): Promise<RecordingRow>;
    appendRecordingEvents(auth: AuthContext, recordingId: string, events: any[]): Promise<void>;
    finishRecording(auth: AuthContext, recordingId: string, endedAt: string): Promise<RecordingRow>;
    listRecordings(auth: AuthContext): Promise<RecordingRow[]>;
    getRecording(auth: AuthContext, id: string): Promise<RecordingRow | undefined>;
    createWorkflowVersion(auth: AuthContext, workflow: AnyWorkflow): Promise<WorkflowVersionRow>;
    listWorkflows(auth: AuthContext): Promise<WorkflowVersionRow[]>;
    getWorkflowVersion(auth: AuthContext, id: string): Promise<WorkflowVersionRow | undefined>;
    activateWorkflowVersion(auth: AuthContext, versionId: string): Promise<WorkflowVersionRow | undefined>;
    createRun(auth: AuthContext, workflowVersionId: string, idempotencyKey?: string, workerId?: string, runMode?: string): Promise<RunRow>;
    takeHitlControl(tenantId: string, userId: string, runId: string): Promise<{
        run: RunRow;
        hitlRequest: any;
    }>;
    completeHitlIntervention(tenantId: string, runId: string): Promise<void>;
    claimRun(auth: AuthContext, runId: string): Promise<RunRow | undefined>;
    updateRunState(auth: AuthContext, runId: string, state?: string, metadata?: any): Promise<RunRow | undefined>;
    getRun(auth: AuthContext, runId: string): Promise<RunRow | undefined>;
    listRuns(auth: AuthContext): Promise<RunRow[]>;
    createExecutionStep(auth: AuthContext, step: ExecutionStepRow): Promise<void>;
    updateExecutionStep(auth: AuthContext, runId: string, stepId: string, updates: Partial<ExecutionStepRow>): Promise<void>;
    listExecutionSteps(auth: AuthContext, runId: string): Promise<ExecutionStepRow[]>;
    saveExecutionCheckpoint(auth: AuthContext, checkpoint: Omit<ExecutionCheckpointRow, "id" | "createdAt">): Promise<void>;
    loadExecutionCheckpoint(auth: AuthContext, runId: string): Promise<ExecutionCheckpointRow | undefined>;
    createHitlRequest(auth: AuthContext, params: {
        runId: string;
        workflowStepId: string;
        challengeType: string;
        expiresAt: string;
    }): Promise<void>;
    listHitlRequests(auth: AuthContext): Promise<HitlRequestRow[]>;
    writeAudit(auth: AuthContext, action: AuditAction, resourceType: string, resourceId?: string, metadata?: Record<string, unknown>): Promise<void>;
    listAudits(auth: AuthContext): Promise<any[]>;
    createBPS(auth: AuthContext, data: {
        workerId: string;
        recordingId?: string;
        status: string;
        specificationJson: any;
        generalizationJson: any;
        gapsJson: any[];
    }): Promise<BPSRow>;
    getBPS(auth: AuthContext, id: string): Promise<BPSRow | undefined>;
    updateBPS(auth: AuthContext, id: string, updates: Partial<BPSRow>): Promise<BPSRow | undefined>;
    listBPSByWorker(auth: AuthContext, workerId: string): Promise<BPSRow[]>;
    submitClarificationAnswer(auth: AuthContext, data: {
        bpsId: string;
        gapId: string;
        answerType: string;
        answerJson: any;
    }): Promise<ClarificationAnswerRow>;
    listClarificationAnswers(auth: AuthContext, bpsId: string): Promise<ClarificationAnswerRow[]>;
    createSchedule(auth: AuthContext, data: {
        workerId: string;
        cronExpression: string;
    }): Promise<ScheduleRow>;
    getSchedule(auth: AuthContext, id: string): Promise<ScheduleRow | undefined>;
    updateSchedule(auth: AuthContext, id: string, updates: Partial<ScheduleRow>): Promise<ScheduleRow | undefined>;
    deleteSchedule(auth: AuthContext, id: string): Promise<boolean>;
    listSchedules(auth: AuthContext, workerId?: string): Promise<ScheduleRow[]>;
    listDueSchedules(): Promise<ScheduleRow[]>;
    createConnection(auth: AuthContext, data: {
        name: string;
        system: string;
        connectionType: string;
        secretRef: string;
    }): Promise<ConnectionRow>;
    listConnections(auth: AuthContext): Promise<ConnectionRow[]>;
    getConnection(auth: AuthContext, id: string): Promise<ConnectionRow | undefined>;
    deleteConnection(auth: AuthContext, id: string): Promise<boolean>;
    createNotification(auth: AuthContext, data: {
        type: string;
        channel: string;
        title: string;
        body?: string;
        resourceType?: string;
        resourceId?: string;
    }): Promise<NotificationRow>;
    createDocument(auth: AuthContext, data: {
        workerId: string;
        type: "CSV" | "SOP" | "EXCEL" | "PDF" | "DOCX" | "TXT" | "IMAGE" | "VIDEO" | "DESKTOP_RECORDING";
        name: string;
        parsedJson: any;
    }): Promise<DocumentRow>;
    listDocuments(auth: AuthContext, workerId: string): Promise<DocumentRow[]>;
    getDocument(auth: AuthContext, id: string): Promise<DocumentRow | undefined>;
    listNotifications(auth: AuthContext): Promise<NotificationRow[]>;
    markNotificationRead(auth: AuthContext, id: string): Promise<void>;
    updateRunResult(auth: AuthContext, runId: string, resultSummary: any): Promise<void>;
    private memoryQueue;
    enqueueTask(tenantId: string, type: string, payload: any, delayMs?: number): Promise<string>;
    pollTasks(limit?: number): Promise<any[]>;
    completeTask(taskId: string): Promise<void>;
    failTask(taskId: string, error: unknown): Promise<void>;
}
export declare class SupabaseStore implements AppStore {
    private readonly supabase;
    constructor(supabase: SupabaseClient);
    bootstrapWorkspace(userId: string): Promise<{
        organizationId: any;
        role: any;
    }>;
    createGhostWorker(auth: AuthContext, data: {
        name: string;
        description?: string;
    }): Promise<GhostWorkerRow>;
    listGhostWorkers(auth: AuthContext): Promise<GhostWorkerRow[]>;
    getGhostWorker(auth: AuthContext, id: string): Promise<GhostWorkerRow | undefined>;
    addChatInstruction(auth: AuthContext, workerId: string, instruction: string): Promise<any>;
    addMemoryRule(auth: AuthContext, workerId: string, rule: string, structuredData?: any): Promise<any>;
    getWorkerMemory(auth: AuthContext, workerId: string): Promise<{
        rules: any[];
        instructions: any[];
    }>;
    getWorkerEvidence(auth: AuthContext, workerId: string): Promise<{
        documents: any[];
        recordings: {
            id: any;
            created_at: any;
        }[];
    }>;
    updateGhostWorker(auth: AuthContext, id: string, updates: Partial<GhostWorkerRow>): Promise<GhostWorkerRow | undefined>;
    createRecording(auth: AuthContext, upload: RecordingUpload, idempotencyKey?: string): Promise<RecordingRow>;
    startRecording(auth: AuthContext, data: {
        source: string;
        metadata?: Record<string, unknown>;
    }, idempotencyKey?: string): Promise<RecordingRow>;
    appendRecordingEvents(auth: AuthContext, recordingId: string, events: any[]): Promise<void>;
    finishRecording(auth: AuthContext, recordingId: string, endedAt: string): Promise<RecordingRow>;
    listAudits(auth: AuthContext): Promise<any[]>;
    listRecordings(auth: AuthContext): Promise<RecordingRow[]>;
    getRecording(auth: AuthContext, id: string): Promise<RecordingRow | undefined>;
    createWorkflowVersion(auth: AuthContext, workflow: AnyWorkflow): Promise<WorkflowVersionRow>;
    listWorkflows(auth: AuthContext): Promise<WorkflowVersionRow[]>;
    getWorkflowVersion(auth: AuthContext, id: string): Promise<WorkflowVersionRow | undefined>;
    activateWorkflowVersion(auth: AuthContext, versionId: string): Promise<WorkflowVersionRow | undefined>;
    createRun(auth: AuthContext, workflowVersionId: string, idempotencyKey?: string, workerId?: string, runMode?: string): Promise<RunRow>;
    takeHitlControl(tenantId: string, userId: string, runId: string): Promise<{
        run: RunRow;
        hitlRequest: any;
    }>;
    completeHitlIntervention(tenantId: string, runId: string): Promise<void>;
    claimRun(auth: AuthContext, runId: string): Promise<RunRow | undefined>;
    updateRunState(auth: AuthContext, runId: string, state: string, metadata?: any): Promise<RunRow | undefined>;
    getRun(auth: AuthContext, runId: string): Promise<RunRow | undefined>;
    listRuns(auth: AuthContext): Promise<RunRow[]>;
    createExecutionStep(auth: AuthContext, step: ExecutionStepRow): Promise<void>;
    updateExecutionStep(auth: AuthContext, runId: string, stepId: string, updates: Partial<ExecutionStepRow>): Promise<void>;
    saveExecutionCheckpoint(auth: AuthContext, checkpoint: Omit<ExecutionCheckpointRow, "id" | "createdAt">): Promise<void>;
    loadExecutionCheckpoint(auth: AuthContext, runId: string): Promise<ExecutionCheckpointRow | undefined>;
    listExecutionSteps(auth: AuthContext, runId: string): Promise<ExecutionStepRow[]>;
    createHitlRequest(auth: AuthContext, params: {
        runId: string;
        workflowStepId: string;
        challengeType: string;
        expiresAt: string;
    }): Promise<void>;
    listHitlRequests(auth: AuthContext): Promise<HitlRequestRow[]>;
    writeAudit(auth: AuthContext, action: AuditAction, resourceType: string, resourceId?: string, metadata?: Record<string, unknown>): Promise<void>;
    createBPS(auth: AuthContext, data: {
        workerId: string;
        recordingId?: string;
        status: string;
        specificationJson: any;
        generalizationJson: any;
        gapsJson: any[];
    }): Promise<BPSRow>;
    getBPS(auth: AuthContext, id: string): Promise<BPSRow | undefined>;
    updateBPS(auth: AuthContext, id: string, updates: Partial<BPSRow>): Promise<BPSRow | undefined>;
    listBPSByWorker(auth: AuthContext, workerId: string): Promise<BPSRow[]>;
    submitClarificationAnswer(auth: AuthContext, data: {
        bpsId: string;
        gapId: string;
        answerType: string;
        answerJson: any;
    }): Promise<ClarificationAnswerRow>;
    listClarificationAnswers(auth: AuthContext, bpsId: string): Promise<ClarificationAnswerRow[]>;
    createSchedule(auth: AuthContext, data: {
        workerId: string;
        cronExpression: string;
    }): Promise<ScheduleRow>;
    getSchedule(auth: AuthContext, id: string): Promise<ScheduleRow | undefined>;
    updateSchedule(auth: AuthContext, id: string, updates: Partial<ScheduleRow>): Promise<ScheduleRow | undefined>;
    deleteSchedule(auth: AuthContext, id: string): Promise<boolean>;
    listSchedules(auth: AuthContext, workerId?: string): Promise<ScheduleRow[]>;
    listDueSchedules(): Promise<ScheduleRow[]>;
    createConnection(auth: AuthContext, data: {
        name: string;
        system: string;
        connectionType: string;
        secretRef: string;
    }): Promise<ConnectionRow>;
    listConnections(auth: AuthContext): Promise<ConnectionRow[]>;
    getConnection(auth: AuthContext, id: string): Promise<ConnectionRow | undefined>;
    deleteConnection(auth: AuthContext, id: string): Promise<boolean>;
    createNotification(auth: AuthContext, data: {
        type: string;
        channel: string;
        title: string;
        body?: string;
        resourceType?: string;
        resourceId?: string;
    }): Promise<NotificationRow>;
    listNotifications(auth: AuthContext): Promise<NotificationRow[]>;
    markNotificationRead(auth: AuthContext, id: string): Promise<void>;
    updateRunResult(auth: AuthContext, runId: string, resultSummary: any): Promise<void>;
    createDocument(auth: AuthContext, data: {
        workerId: string;
        type: "CSV" | "SOP" | "EXCEL" | "PDF" | "DOCX" | "TXT" | "IMAGE" | "VIDEO" | "DESKTOP_RECORDING";
        name: string;
        parsedJson: any;
    }): Promise<DocumentRow>;
    listDocuments(auth: AuthContext, workerId: string): Promise<DocumentRow[]>;
    getDocument(auth: AuthContext, id: string): Promise<DocumentRow | undefined>;
    private workerFromRow;
    private recordingFromRow;
    private workflowVersionFromRow;
    private runFromRow;
    private executionStepFromRow;
    private hitlFromRow;
    private toIsoString;
    private bpsFromRow;
    private scheduleFromRow;
    private connectionFromRow;
    private throwOnError;
    enqueueTask(tenantId: string, type: string, payload: any, delayMs?: number): Promise<string>;
    pollTasks(limit?: number): Promise<any[]>;
    completeTask(taskId: string): Promise<void>;
    failTask(taskId: string, error: unknown): Promise<void>;
}
