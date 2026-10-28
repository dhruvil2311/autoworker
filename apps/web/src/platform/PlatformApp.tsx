import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import type { Experience } from "@ghost/shared-types/contracts";
import { PlatformSessionProvider, usePlatformSession } from "./session.js";
import { EXPERIENCES, PlatformLayout } from "./Layout.js";
import { Alert, Loading } from "./ui.js";
import { BusinessApprovals, BusinessHome, BusinessReports, BusinessRun, BusinessTask, BusinessTasks } from "./experiences/business.js";
import { StudioExecutions, StudioRecordings, StudioRun, StudioTesting, StudioWorker, StudioWorkflows } from "./experiences/studio.js";
import { OpsHealth, OpsIncidents, OpsLiveRuns, OpsRun, OpsWorkers } from "./experiences/operations.js";
import { AdminConnections, AdminPeople, AdminPolicies, AdminUsage } from "./experiences/admin.js";
import { AuditApprovals, AuditEvidence, AuditExports, AuditHistory, AuditRun } from "./experiences/audit.js";

function Landing() {
  const { me, loading, error } = usePlatformSession();
  if (loading) return <div className="pf" style={{ display: "grid", placeItems: "center" }}><Loading label="Checking your access…" /></div>;
  if (error || !me) return <div className="pf" style={{ padding: 24 }}><Alert tone="bad" title="Could not confirm your access">{error}</Alert></div>;
  const first = EXPERIENCES.find(e => me.experiences.includes(e.id));
  if (!first) return <div className="pf" style={{ padding: 24 }}><Alert tone="warn" title="No experiences available">Your role ({me.role}) has no access to any workspace. Ask an administrator.</Alert></div>;
  return <Navigate to={first.path} replace />;
}

const page = (experience: Experience, element: React.ReactNode) => <PlatformLayout experience={experience}>{element}</PlatformLayout>;

/** Role-specific experiences over the shared platform API. */
export function PlatformApp() {
  return (
    <PlatformSessionProvider>
      <Routes>
        <Route index element={<Landing />} />
        <Route path="business" element={page("business", <BusinessHome />)} />
        <Route path="business/tasks" element={page("business", <BusinessTasks />)} />
        <Route path="business/tasks/:workerId" element={page("business", <BusinessTask />)} />
        <Route path="business/runs/:runId" element={page("business", <BusinessRun />)} />
        <Route path="business/reports" element={page("business", <BusinessReports />)} />
        <Route path="business/approvals" element={page("business", <BusinessApprovals />)} />

        <Route path="studio" element={page("studio", <StudioRecordings />)} />
        <Route path="studio/workers/:workerId" element={page("studio", <StudioWorker />)} />
        <Route path="studio/workflows" element={page("studio", <StudioWorkflows />)} />
        <Route path="studio/testing" element={page("studio", <StudioTesting />)} />
        <Route path="studio/executions" element={page("studio", <StudioExecutions />)} />
        <Route path="studio/runs/:runId" element={page("studio", <StudioRun />)} />

        <Route path="ops" element={page("operations", <OpsLiveRuns />)} />
        <Route path="ops/runs/:runId" element={page("operations", <OpsRun />)} />
        <Route path="ops/incidents" element={page("operations", <OpsIncidents />)} />
        <Route path="ops/workers" element={page("operations", <OpsWorkers />)} />
        <Route path="ops/health" element={page("operations", <OpsHealth />)} />

        <Route path="admin" element={page("admin", <AdminPeople />)} />
        <Route path="admin/connections" element={page("admin", <AdminConnections />)} />
        <Route path="admin/policies" element={page("admin", <AdminPolicies />)} />
        <Route path="admin/usage" element={page("admin", <AdminUsage />)} />

        <Route path="audit" element={page("audit", <AuditHistory />)} />
        <Route path="audit/runs/:runId" element={page("audit", <AuditRun />)} />
        <Route path="audit/approvals" element={page("audit", <AuditApprovals />)} />
        <Route path="audit/evidence" element={page("audit", <AuditEvidence />)} />
        <Route path="audit/exports" element={page("audit", <AuditExports />)} />

        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </PlatformSessionProvider>
  );
}
