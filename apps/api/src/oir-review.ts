import { IntentOirPlanner, type IntentPlanningResult } from "@ghost/oir";
import type { Observation } from "@ghost/oir";
import type { AuthContext } from "@ghost/shared-types";
import type { AppStore, DocumentRow, GhostWorkerRow } from "./store.js";

export interface OirDraftRequest {
  business_goal?: string;
  api_spec?: {
    name?: string;
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    endpoint?: string;
    request_body?: unknown;
    response_body?: unknown;
    status_code?: number;
  };
  clarifications?: Array<{ question: string; answer: string }>;
}

export interface OirReviewEnvelope {
  kind: "OIR_REVIEW";
  status: "DRAFT" | "APPROVED";
  tenantId: string;
  workerId: string;
  createdAt: string;
  approvedAt?: string;
  graph: IntentPlanningResult["graph"];
  report: IntentPlanningResult["report"];
}

export async function createOirDraft(
  store: AppStore,
  auth: AuthContext,
  worker: GhostWorkerRow,
  request: OirDraftRequest
): Promise<OirReviewEnvelope> {
  const documents = await store.listDocuments(auth, worker.id);
  const recording = worker.recordingId ? await store.getRecording(auth, worker.recordingId) : undefined;
  const observations = [
    ...documents.flatMap(documentToObservations),
    ...((recording?.upload.events ?? []).map((event): Observation => {
      const browserObservation: Observation = {
        id: event.event_id,
        type: "BROWSER_EVENT",
        timestamp: event.timestamp,
        eventType: browserEventType(event.event_type),
        url: event.page.url ?? ""
      } as Observation;
      const targetSelector = event.target?.selector_candidates?.[0]?.value;
      const targetText = event.target?.accessible_name ?? event.target?.text;
      const value = event.input?.value;
      if (targetSelector) {
        (browserObservation as any).targetSelector = targetSelector;
      }
      if (targetText) {
        (browserObservation as any).targetText = targetText;
      }
      if (value) {
        (browserObservation as any).value = value;
      }
      return browserObservation;
    })),
    ...apiSpecToObservations(request),
    ...(request.clarifications ?? []).map((clarification, index): Observation => ({
      id: `clarification-${index + 1}`,
      type: "CLARIFICATION",
      timestamp: new Date().toISOString(),
      question: clarification.question,
      answer: clarification.answer
    }))
  ];

  const planner = new IntentOirPlanner();
  const result = planner.plan({
    tenantId: auth.tenantId,
    merchant: worker.name,
    businessGoal: request.business_goal ?? worker.description ?? worker.name,
    observations
  });

  const envelope: OirReviewEnvelope = {
    kind: "OIR_REVIEW",
    status: "DRAFT",
    tenantId: auth.tenantId,
    workerId: worker.id,
    createdAt: new Date().toISOString(),
    graph: result.graph,
    report: result.report
  };

  await store.updateGhostWorker(auth, worker.id, {
    status: result.report.clarificationsRequired.length > 0 ? "NEEDS_CLARIFICATION" : "READY_FOR_REVIEW",
    safetyPolicy: {
      ...(worker.safetyPolicy ?? {}),
      oirReview: envelope
    }
  });

  return envelope;
}

export async function approveOirDraft(store: AppStore, auth: AuthContext, worker: GhostWorkerRow): Promise<OirReviewEnvelope> {
  const envelope = readOirReview(worker);
  if (!envelope) {
    throw new Error("No OIR draft exists for this worker.");
  }
  if (!envelope.report.graphValid) {
    throw new Error("Cannot approve invalid OIR graph.");
  }
  if (envelope.report.safetyBlockers.length > 0) {
    throw new Error("Cannot approve OIR with safety blockers.");
  }
  if (envelope.report.contradictions.length > 0) {
    throw new Error("Cannot approve OIR with unresolved contradictions.");
  }
  if (envelope.report.unsupportedClaims.length > 0) {
    throw new Error("Cannot approve OIR with unsupported claims.");
  }

  const approved: OirReviewEnvelope = {
    ...envelope,
    status: "APPROVED",
    approvedAt: new Date().toISOString()
  };
  await store.updateGhostWorker(auth, worker.id, {
    status: "READY_FOR_APPROVAL",
    safetyPolicy: {
      ...(worker.safetyPolicy ?? {}),
      oirReview: approved
    }
  });
  return approved;
}

export function readOirReview(worker: GhostWorkerRow): OirReviewEnvelope | undefined {
  const candidate = worker.safetyPolicy?.oirReview;
  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }
  return candidate as OirReviewEnvelope;
}

function documentToObservations(document: DocumentRow): Observation[] {
  if (document.type === "SOP") {
    const parsed = document.parsedJson as { summary?: string; steps?: string[]; rules?: string[]; constraints?: string[] };
    return [{
      id: document.id,
      type: "SOP_DOCUMENT",
      timestamp: document.createdAt,
      title: document.name,
      content: [
        parsed.summary,
        ...(parsed.steps ?? []),
        ...(parsed.rules ?? []),
        ...(parsed.constraints ?? [])
      ].filter(Boolean).join("\n")
    }];
  }

  const parsed = document.parsedJson as { headers?: string[]; rows?: Record<string, unknown>[] };
  return [{
    id: document.id,
    type: "CSV_DATA",
    timestamp: document.createdAt,
    filename: document.name,
    headers: parsed.headers ?? [],
    rows: parsed.rows ?? []
  }];
}

function apiSpecToObservations(request: OirDraftRequest): Observation[] {
  if (!request.api_spec?.endpoint) {
    return [];
  }
  return [{
    id: "api-spec-1",
    type: "API_CALL",
    timestamp: new Date().toISOString(),
    method: request.api_spec.method ?? "GET",
    endpoint: request.api_spec.endpoint,
    requestBody: request.api_spec.request_body,
    responseBody: request.api_spec.response_body,
    statusCode: request.api_spec.status_code ?? 200
  }];
}

function browserEventType(eventType: string): "click" | "input" | "navigate" | "scroll" | "keydown" {
  if (eventType === "click") return "click";
  if (eventType === "input" || eventType === "change" || eventType === "select") return "input";
  if (eventType === "navigation" || eventType === "url_change") return "navigate";
  if (eventType === "keyboard") return "keydown";
  return "click";
}
