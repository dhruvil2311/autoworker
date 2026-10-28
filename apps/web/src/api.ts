const BASE_URL = localStorage.getItem("ghost_api_url") || "http://localhost:4000";

const DEV_USER_ID = "00000000-0000-0000-0000-000000000002";

function getToken(): string {
  let token = localStorage.getItem("ghost_api_token");
  if (!token || token === `dev:${DEV_USER_ID}` || token === "dev:dev-user" || token.split(":").length < 3) {
    token = `dev:${DEV_USER_ID}:6ef50df4-58bb-48e3-9796-d25ba85d4dac:owner`;
    localStorage.setItem("ghost_api_token", token);
  }
  return token;
}

async function request<T>(method: string, path: string, body?: unknown, skipUnauthorized = false, timeoutMs = 120000, idempotencyKey?: string): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`
  };
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  
  // Heavy compilation and evidence analysis operations can take longer
  const effectiveTimeout = path.includes("/compile") || path.includes("/analyze") || path.includes("/recompile")
    ? 300000 // 5 minutes for compilation/analysis
    : timeoutMs;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      signal: controller.signal,
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      if (res.status === 401 && !skipUnauthorized && typeof window !== "undefined") {
        window.dispatchEvent(new Event("ghost:unauthorized"));
      }
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err?.error?.message ?? err?.error ?? `API ${res.status}`);
    }
    return res.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError' || err.message?.includes('aborted')) {
      throw new Error("Request timed out. Please check if the API server is responding.");
    }
    throw err;
  }
}

export const api = {
  bootstrap: async () => {
    try {
      // A signed-in session (Supabase or a complete development token) is never replaced: auto-login
      // would silently switch the user to the development owner account.
      const existing = (localStorage.getItem("ghost_api_token") || "").replace(/^Bearer\s+/i, "") || null;
      const hasSession = Boolean(existing) && (!existing!.startsWith("dev:") || existing!.split(":").length >= 3);
      if (!hasSession) {
        const loginRes = await request<any>("POST", "/api/v1/auth/dev/login", {
          email: "admin@ghost.local",
          password: "Ghost@123456"
        }, true).catch(() => null);
        if (loginRes?.token) {
          localStorage.setItem("ghost_api_token", loginRes.token);
        }
      }

      const res = await request<any>("POST", "/api/v1/auth/bootstrap", undefined, true);
      const current = (localStorage.getItem("ghost_api_token") || "").replace(/^Bearer\s+/i, "");
      if (res?.organization?.id && current.startsWith("dev:")) {
        const userId = res.user?.id || DEV_USER_ID;
        // Keep the user and role of the current development sign-in; the server enforces what that role may do.
        const currentRole = current.split(":")[3] || "owner";
        localStorage.setItem("ghost_api_token", `dev:${userId}:${res.organization.id}:${currentRole}`);
      }
      return res;
    } catch (err) {
      console.warn("Bootstrap fallback:", err);
      return { user: { id: DEV_USER_ID }, organization: { id: "default" }, role: "owner" };
    }
  },
  devLogin: (email: string, password: string) => request<any>("POST", "/api/v1/auth/dev/login", { email, password }),

  // Overview
  getOverview: () => request<any>("GET", "/api/v1/overview"),

  // Ghost Workers
  listWorkers: async () => {
    const data = await request<any>("GET", "/api/v1/ghost-workers");
    return { ghost_workers: data.ghost_workers || data.workers || [] };
  },
  getWorker: (id: string) => request<any>("GET", `/api/v1/ghost-workers/${id}`),
  createWorker: (data: {
    name: string;
    description?: string | undefined;
    workerType?: string | undefined;
    department?: string | undefined;
    capabilities?: string[] | undefined;
    safetyPolicy?: any;
    triggerConfig?: any;
    status?: string | undefined;
  }) => request<any>("POST", "/api/v1/ghost-workers", data),
  updateWorker: (id: string, data: any) => request<any>("POST", `/api/v1/ghost-workers/${id}`, data),
  activateWorker: (id: string) => request<any>("POST", `/api/v1/ghost-workers/${id}/activate`),
  uploadDocument: (id: string, data: { name: string; type: string; content: string }) => request<any>("POST", `/api/v1/ghost-workers/${id}/documents`, data),
  listDocuments: (id: string) => request<any>("GET", `/api/v1/ghost-workers/${id}/documents`),
  deleteDocument: (workerId: string, docId: string) => request<any>("DELETE", `/api/v1/ghost-workers/${workerId}/documents/${docId}`),

  // Analysis
  analyzeWorker: (id: string, recordingId?: string) => request<any>("POST", `/api/v1/ghost-workers/${id}/analyze`, recordingId ? { recording_id: recordingId } : {}),
  analyzeFromDocuments: (id: string) => request<any>("POST", `/api/v1/ghost-workers/${id}/analyze-documents`),
  getAnalysisStage: (id: string) => request<any>("GET", `/api/v1/ghost-workers/${id}/analysis-stage`),

  // Gaps & Clarification
  getGaps: (id: string) => request<any>("GET", `/api/v1/ghost-workers/${id}/gaps`),
  answerGap: (workerId: string, gapId: string, answer: any) => request<any>("POST", `/api/v1/ghost-workers/${workerId}/gaps/${gapId}/answer`, answer),

  // Teaching Loop (Iteration 2)
  sendChatInstruction: (id: string, message: string) => request<any>("POST", `/api/v1/ghost-workers/${id}/chat`, { instruction: message }),
  getMemory: (id: string) => request<any>("GET", `/api/v1/ghost-workers/${id}/memory`),
  deleteMemory: (workerId: string, memoryId: string) => request<any>("DELETE", `/api/v1/ghost-workers/${workerId}/memory/${memoryId}`),
  purgeWorkerMemory: (workerId: string) => request<any>("DELETE", `/api/v1/ghost-workers/${workerId}/memory`),
  getEvidence: (id: string) => request<any>("GET", `/api/v1/ghost-workers/${id}/evidence`),
  recompileWorker: (id: string) => request<any>("POST", `/api/v1/ghost-workers/${id}/recompile`),

  // Plan & Workflow
  getPlan: (id: string) => request<any>("GET", `/api/v1/ghost-workers/${id}/plan`),
  getWorkflowVersion: (versionId: string) => request<any>("GET", `/api/v1/workflows/${versionId}`),
  editWorkflow: (id: string, workflowData: any) => request<any>("POST", `/api/v1/ghost-workers/${id}/workflow/edit`, workflowData),

  // Desktop Evidence Intelligence
  uploadEvidenceVideo: async (id: string, file: File): Promise<any> => {
    return new Promise<any>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await request<any>("POST", `/api/v1/ghost-workers/${id}/evidence/upload`, {
            name: file.name,
            type: "VIDEO",
            content: reader.result as string,
          });
          resolve(res);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read video file"));
      reader.readAsDataURL(file);
    });
  },
  listEvidenceMedia: (id: string) =>
    request<{ documents: any[] }>("GET", `/api/v1/ghost-workers/${id}/evidence`),
  deleteEvidenceMedia: (id: string, docId: string) =>
    request<any>("DELETE", `/api/v1/ghost-workers/${id}/evidence/${docId}`),
  startEvidenceAnalysis: (id: string, data: { assetId?: string; videoPath?: string; options?: any }) =>
    request<any>("POST", `/api/v1/ghost-workers/${id}/evidence/analyze`, data),
  getEvidenceJob: (id: string, jobId: string) =>
    request<any>("GET", `/api/v1/ghost-workers/${id}/evidence/jobs/${jobId}`),
  getEvidenceTimeline: (id: string, jobId: string) =>
    request<any>("GET", `/api/v1/ghost-workers/${id}/evidence/jobs/${jobId}/timeline`),
  compileFromEvidenceJob: (id: string, jobId: string, taskObjective?: string) =>
    request<any>("POST", `/api/v1/ghost-workers/${id}/evidence/compile-from-job/${jobId}`, taskObjective ? { taskObjective } : {}),

  // Compilation
  compileWorker: (id: string) => request<any>("POST", `/api/v1/ghost-workers/${id}/compile`),

  // Test & Run
  testWorker: (id: string) => request<any>("POST", `/api/v1/ghost-workers/${id}/test`),
  runWorker: async (id: string, workflowVersionId?: string, recordingId?: string) => {
    if (!workflowVersionId) throw new Error("This worker has no selected compiled workflow version. Compile a workflow before running.");
    const keyName = `ghost:run:${id}:${workflowVersionId}`;
    let idempotencyKey = sessionStorage.getItem(keyName);
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      sessionStorage.setItem(keyName, idempotencyKey);
    }
    const result = await request<any>("POST", `/api/v1/ghost-workers/${id}/run`, {
      workflow_version_id: workflowVersionId,
      ...(recordingId ? { recording_id: recordingId } : {})
    }, false, 120000, idempotencyKey);
    sessionStorage.removeItem(keyName);
    return result;
  },

  // Runs
  listRuns: () => request<{ runs: any[] }>("GET", "/api/v1/runs"),
  getRunDetail: (id: string) => request<any>("GET", `/api/v1/runs/${id}/detail`),

  // Recordings
  listRecordings: () => request<{ recordings: any[] }>("GET", "/api/v1/recordings"),

  // HITL / Exceptions
  listExceptions: async () => {
    const data = await request<any>("GET", "/api/v1/exceptions");
    return { hitl_requests: data.hitl_requests || data.exceptions || [] };
  },
  resolveException: (id: string, resolution: any) => request<any>("POST", `/api/v1/exceptions/${id}/resolve`, resolution),
  decideHitl: (id: string, action: "APPROVE" | "REJECT" | "PROVIDE_VALUE", options: { value?: unknown; note?: string; runId?: string; workflowVersionId?: string } = {}) =>
    request<any>("POST", `/api/v1/hitl/${id}/decision`, { action, value: options.value, note: options.note, run_id: options.runId, workflow_version_id: options.workflowVersionId }),
  cancelRun: (runId: string) => request<any>("POST", `/api/v1/runs/${runId}/cancel`),
  takeControl: (runId: string) => request<any>("POST", `/api/v1/runs/${runId}/hitl/take-control`),
  completeHitl: (runId: string) => request<any>("POST", `/api/v1/runs/${runId}/hitl/complete`),

  // Schedules
  listSchedules: (workerId: string) => request<any>("GET", `/api/v1/ghost-workers/${workerId}/schedules`),
  createSchedule: (workerId: string, cron: string) => request<any>("POST", `/api/v1/ghost-workers/${workerId}/schedules`, { cron_expression: cron }),
  deleteSchedule: (id: string) => request<any>("DELETE", `/api/v1/schedules/${id}`),

  // Connections
  listConnections: () => request<{ connections: any[] }>("GET", "/api/v1/connections"),
  createConnection: (data: any) => request<any>("POST", "/api/v1/connections", data),
  deleteConnection: (id: string) => request<any>("DELETE", `/api/v1/connections/${id}`),

  // Notifications
  listNotifications: () => request<{ notifications: any[] }>("GET", "/api/v1/notifications"),
  markRead: (id: string) => request<any>("POST", `/api/v1/notifications/${id}/read`),

  getSettings: () => request<{ settings: Record<string, any> }>("GET", "/api/v1/settings"),
  updateSettings: (patch: Record<string, any>) => request<{ settings: Record<string, any> }>("PATCH", "/api/v1/settings", patch),

  // Desktop Computer Execution
  listDesktopAgents: () => request<{ agents: any[] }>("GET", "/api/v1/desktop/agents"),
  getDesktopAgent: (id: string) => request<any>("GET", `/api/v1/desktop/agents/${id}`),
  emergencyStopDesktop: (agentId?: string) => request<any>("POST", "/api/v1/desktop/emergency-stop", { agentId }),
  listDesktopCorrections: (executionId?: string) => request<{ corrections: any[] }>("GET", `/api/v1/desktop/corrections${executionId ? `?executionId=${executionId}` : ''}`),

  // Config
  setApiUrl: (url: string) => localStorage.setItem("ghost_api_url", url),
  setToken: (token: string) => localStorage.setItem("ghost_api_token", token),
  getApiUrl: () => localStorage.getItem("ghost_api_url") || "http://localhost:4000",
  getTokenValue: () => localStorage.getItem("ghost_api_token") || ""
};
