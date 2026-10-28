export type ApiError = {
  error: {
    code: string;
    message: string;
    request_id: string;
  };
};

export type AuthContext = {
  userId: string;
  tenantId: string;
  role: "owner" | "admin" | "builder" | "operator" | "auditor" | "member" | "viewer" | "worker";
};

export type QueueJob =
  | {
      type: "compile_recording";
      tenantId: string;
      recordingId: string;
    }
  | {
      type: "run_workflow";
      tenantId: string;
      runId: string;
      workflowVersionId: string;
    };
