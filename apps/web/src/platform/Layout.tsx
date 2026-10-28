import React from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import type { Experience } from "@ghost/shared-types/contracts";
import { usePlatformSession, devTokenRole, setDevTokenRole } from "./session.js";
import { Alert, Loading } from "./ui.js";
import "./platform.css";

export const EXPERIENCES: Array<{ id: Experience; label: string; path: string; nav: Array<{ to: string; label: string; end?: boolean }> }> = [
  { id: "business", label: "Workspace", path: "/app/business", nav: [
    { to: "/app/business", label: "Home", end: true },
    { to: "/app/business/tasks", label: "Tasks" },
    { to: "/app/business/reports", label: "Reports" },
    { to: "/app/business/approvals", label: "Approvals" }
  ] },
  { id: "studio", label: "Automation Studio", path: "/app/studio", nav: [
    { to: "/app/studio", label: "Recordings", end: true },
    { to: "/app/studio/workflows", label: "Workflows" },
    { to: "/app/studio/testing", label: "Testing" },
    { to: "/app/studio/executions", label: "Executions" }
  ] },
  { id: "operations", label: "Operations", path: "/app/ops", nav: [
    { to: "/app/ops", label: "Live runs", end: true },
    { to: "/app/ops/incidents", label: "Incidents" },
    { to: "/app/ops/workers", label: "Workers" },
    { to: "/app/ops/health", label: "Service health" }
  ] },
  { id: "admin", label: "Organization", path: "/app/admin", nav: [
    { to: "/app/admin", label: "People and access", end: true },
    { to: "/app/admin/connections", label: "Connections" },
    { to: "/app/admin/policies", label: "Policies" },
    { to: "/app/admin/usage", label: "Usage" }
  ] },
  { id: "audit", label: "Audit", path: "/app/audit", nav: [
    { to: "/app/audit", label: "Execution history", end: true },
    { to: "/app/audit/approvals", label: "Approvals" },
    { to: "/app/audit/evidence", label: "Evidence" },
    { to: "/app/audit/exports", label: "Exports" }
  ] }
];

const DEV_ROLES = ["owner", "admin", "builder", "operator", "auditor", "member", "viewer"];

export function PlatformLayout({ experience, children }: { experience: Experience; children: React.ReactNode }) {
  const { me, loading, error, hasExperience } = usePlatformSession();
  const location = useLocation();
  const current = EXPERIENCES.find(e => e.id === experience)!;
  const devRole = devTokenRole();

  return (
    <div className="pf">
      <header className="pf-top">
        <Link to="/app" className="pf-brand" style={{ textDecoration: "none" }}>Autoworker</Link>
        <nav className="pf-experiences" aria-label="Experiences">
          {EXPERIENCES.filter(e => hasExperience(e.id)).map(e => (
            <Link key={e.id} to={e.path} aria-current={e.id === experience ? "page" : undefined}>{e.label}</Link>
          ))}
        </nav>
        <div className="pf-top-right">
          {me && <span className="pf-role" title="Role assigned by your organization">{me.role}</span>}
          {devRole && import.meta.env.DEV && (
            <label className="pf-hide-sm pf-faint">
              Dev role{" "}
              <select className="pf-select" style={{ padding: "2px 6px" }} value={devRole} aria-label="Development sign-in role"
                onChange={e => { setDevTokenRole(e.target.value); window.location.assign("/app"); }}>
                {DEV_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          )}
          <Link to="/workforce" className="pf-hide-sm pf-faint">Classic workspace</Link>
        </div>
      </header>
      <div className="pf-body">
        <aside className="pf-side">
          <h2>{current.label}</h2>
          <nav aria-label={`${current.label} navigation`}>
            {current.nav.map(item => (
              <NavLink key={item.to} to={item.to} end={item.end ?? false} className={({ isActive }) => (isActive ? "active" : "")}>{item.label}</NavLink>
            ))}
          </nav>
        </aside>
        <main className="pf-main" key={location.pathname}>
          {loading && <Loading label="Checking your access…" />}
          {!loading && error && <Alert tone="bad" title="Could not confirm your access">{error}</Alert>}
          {!loading && me && !hasExperience(experience) && (
            <Alert tone="warn" title="Not available for your role">
              The {current.label} experience requires permissions your role ({me.role}) does not have.
            </Alert>
          )}
          {!loading && me && hasExperience(experience) && children}
        </main>
      </div>
    </div>
  );
}
