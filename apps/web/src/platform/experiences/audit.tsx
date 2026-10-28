import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { platformApi } from "../api/resources.js";
import { friendlyError } from "../api/client.js";
import { Alert, Empty, ErrorAlert, Loading, PageHeader, Section, Status, download, useResource } from "../ui.js";
import { formatTime, shortId, technicalStatus } from "../status.js";
import { EvidenceGallery, StepList } from "../shared/RunPanels.js";

const OUTCOMES = ["", "VERIFIED_SUCCESS", "PARTIAL_COMPLETION", "FAILED", "UNABLE_TO_VERIFY"];
const STATES = ["", "SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT", "WAITING_FOR_HUMAN", "RUNNING", "QUEUED"];

export function AuditHistory() {
  const [filters, setFilters] = useState({ state: "", outcome: "", from: "", to: "" });
  const [applied, setApplied] = useState(filters);
  const runs = useResource(() => platformApi.runs({
    ...(applied.state ? { state: applied.state } : {}),
    ...(applied.outcome ? { outcome: applied.outcome } : {}),
    ...(applied.from ? { from: new Date(applied.from).toISOString() } : {}),
    ...(applied.to ? { to: new Date(`${applied.to}T23:59:59`).toISOString() } : {})
  }), [applied]);
  return (
    <>
      <PageHeader title="Execution history" description="Persisted execution records. Each run shows the exact workflow version it executed." />
      <form className="pf-filters" onSubmit={e => { e.preventDefault(); setApplied(filters); }} aria-label="Filter history">
        <div className="pf-field"><label htmlFor="f-state">State</label>
          <select id="f-state" className="pf-select" value={filters.state} onChange={e => setFilters({ ...filters, state: e.target.value })}>{STATES.map(s => <option key={s} value={s}>{s || "Any"}</option>)}</select></div>
        <div className="pf-field"><label htmlFor="f-outcome">Outcome</label>
          <select id="f-outcome" className="pf-select" value={filters.outcome} onChange={e => setFilters({ ...filters, outcome: e.target.value })}>{OUTCOMES.map(s => <option key={s} value={s}>{s || "Any"}</option>)}</select></div>
        <div className="pf-field"><label htmlFor="f-from">From</label><input id="f-from" type="date" className="pf-input" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /></div>
        <div className="pf-field"><label htmlFor="f-to">To</label><input id="f-to" type="date" className="pf-input" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} /></div>
        <button className="pf-btn">Search</button>
      </form>
      {runs.loading && !runs.data && <Loading />}
      <ErrorAlert error={runs.error} onRetry={runs.refresh} />
      {runs.data && !runs.data.runs.length && <div className="pf-panel"><Empty title="No runs match these filters" /></div>}
      {!!runs.data?.runs.length && (
        <div className="pf-panel pf-table-wrap">
          <table className="pf-table">
            <thead><tr><th>Run</th><th>Automation</th><th>Workflow version</th><th>State</th><th>Launched by</th><th>Created</th></tr></thead>
            <tbody>
              {runs.data.runs.map(r => {
                const s = technicalStatus(r);
                return (
                  <tr key={r.id}>
                    <td><Link className="pf-mono" to={`/app/audit/runs/${r.id}`}>{shortId(r.id)}</Link></td>
                    <td>{r.workerName || "—"}</td>
                    <td className="pf-mono">{r.workflowVersionId}</td>
                    <td><Status label={s.label} tone={s.tone} /></td>
                    <td className="pf-mono">{shortId(r.createdBy)}</td>
                    <td className="pf-muted">{formatTime(r.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function AuditRun() {
  const { runId = "" } = useParams();
  const detail = useResource(() => platformApi.runDetail(runId), [runId]);
  const events = useResource(() => platformApi.auditEvents({ resource_id: runId }), [runId]);
  const [reportError, setReportError] = useState<string | null>(null);
  if (detail.loading && !detail.data) return <Loading />;
  if (detail.error) return <ErrorAlert error={detail.error} onRetry={detail.refresh} />;
  const d = detail.data!;
  const s = technicalStatus(d.run);
  const decisions = d.hitl_requests;
  const exportReport = async () => {
    setReportError(null);
    try {
      const report = await platformApi.runReport(d.run.id);
      download(`run-${d.run.id}.json`, JSON.stringify(report, null, 2), "application/json");
    } catch (err) {
      setReportError(friendlyError(err));
    }
  };
  return (
    <>
      <PageHeader title={`Run ${shortId(d.run.id)}`} crumb={<Link to="/app/audit">Execution history</Link>}
        actions={<><Status label={s.label} tone={s.tone} /><button className="pf-btn" onClick={exportReport}>Download report</button></>} />
      {reportError && <Alert tone="bad" title="Report not exported">{reportError}</Alert>}
      <div className="pf-panel pf-pad">
        <dl className="pf-kv">
          <dt>Run ID</dt><dd className="pf-mono" data-testid="audit-run-id">{d.run.id}</dd>
          <dt>Workflow version</dt><dd className="pf-mono" data-testid="audit-run-version">{d.run.workflowVersionId}</dd>
          <dt>Version created</dt><dd>{formatTime(d.workflow_version?.createdAt)}</dd>
          <dt>Source recording</dt><dd className="pf-mono">{d.workflow_version?.sourceRecordingId || "—"}</dd>
          <dt>Automation</dt><dd>{d.worker?.name || "—"}</dd>
          <dt>Launched by</dt><dd className="pf-mono">{d.run.createdBy || "—"}</dd>
          <dt>Inputs</dt><dd className="pf-mono">{JSON.stringify((d.run as any).metadata?.inputs || {})}</dd>
          <dt>Outcome</dt><dd>{d.run.outcome?.classification || "—"}{d.run.outcome?.reason ? ` — ${d.run.outcome.reason}` : ""}</dd>
        </dl>
      </div>
      <Section title="Decisions">
        {!decisions.length ? <div className="pf-panel"><Empty title="No human decisions on this run" /></div> : (
          <div className="pf-panel pf-table-wrap">
            <table className="pf-table">
              <thead><tr><th>Requested</th><th>Step</th><th>Reason</th><th>Decision</th><th>By</th><th>At</th></tr></thead>
              <tbody>
                {decisions.map(h => (
                  <tr key={h.id}>
                    <td className="pf-muted">{formatTime(h.createdAt)}</td>
                    <td className="pf-mono">{h.workflowStepId || "—"}</td>
                    <td>{h.reason.split(":")[0]}</td>
                    <td>{h.decision ? <Status label={h.decision} tone={h.decision === "REJECT" ? "bad" : "ok"} /> : <span className="pf-faint">{h.state}</span>}</td>
                    <td className="pf-mono">{shortId(h.decidedBy)}</td>
                    <td className="pf-muted">{formatTime(h.decidedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <Section title="Steps"><StepList detail={d} technical /></Section>
      <Section title="Evidence"><EvidenceGallery runId={d.run.id} /></Section>
      <Section title="Audit events">
        <ErrorAlert error={events.error} />
        <AuditEventTable events={events.data?.events || []} />
      </Section>
    </>
  );
}

function AuditEventTable({ events }: { events: Array<{ id: string; action: string; actorId?: string | undefined; resourceType: string; resourceId?: string | undefined; metadata: Record<string, any>; createdAt: string }> }) {
  if (!events.length) return <div className="pf-panel"><Empty title="No audit events" /></div>;
  return (
    <div className="pf-panel pf-table-wrap">
      <table className="pf-table">
        <thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Resource</th><th>Details</th></tr></thead>
        <tbody>
          {events.map(e => (
            <tr key={e.id}>
              <td className="pf-muted">{formatTime(e.createdAt)}</td>
              <td className="pf-mono">{e.action}</td>
              <td className="pf-mono">{shortId(e.actorId)}</td>
              <td className="pf-faint">{e.resourceType} {shortId(e.resourceId)}</td>
              <td className="pf-mono" style={{ maxWidth: 360 }}>{JSON.stringify(e.metadata)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AuditApprovals() {
  const approvals = useResource(() => platformApi.approvals(), []);
  const rows = approvals.data?.hitl_requests || [];
  return (
    <>
      <PageHeader title="Approvals" description="Every human decision requested on a run, with who decided and when." />
      {approvals.loading && !approvals.data && <Loading />}
      <ErrorAlert error={approvals.error} onRetry={approvals.refresh} />
      {approvals.data && !rows.length && <div className="pf-panel"><Empty title="No approvals recorded" /></div>}
      {!!rows.length && (
        <div className="pf-panel pf-table-wrap">
          <table className="pf-table">
            <thead><tr><th>Requested</th><th>Run</th><th>Workflow version</th><th>Reason</th><th>State</th><th>Decision</th><th>By</th></tr></thead>
            <tbody>
              {rows.map(h => (
                <tr key={h.id}>
                  <td className="pf-muted">{formatTime(h.createdAt)}</td>
                  <td><Link className="pf-mono" to={`/app/audit/runs/${h.runId}`}>{shortId(h.runId)}</Link></td>
                  <td className="pf-mono">{shortId(h.workflowVersionId)}</td>
                  <td>{h.reason.split(":")[0]}</td>
                  <td className="pf-faint">{h.state}</td>
                  <td>{h.decision || "—"}</td>
                  <td className="pf-mono">{shortId(h.decidedBy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function AuditEvidence() {
  const runs = useResource(() => platformApi.runs({ state: "SUCCEEDED,FAILED,CANCELLED,TIMED_OUT,WAITING_FOR_HUMAN" }), []);
  const [selected, setSelected] = useState("");
  return (
    <>
      <PageHeader title="Evidence" description="Screenshots, verification checks and extracted data recorded during runs." />
      <div className="pf-filters">
        <div className="pf-field">
          <label htmlFor="ev-run">Run</label>
          <select id="ev-run" className="pf-select" value={selected} onChange={e => setSelected(e.target.value)}>
            <option value="">Choose a run…</option>
            {(runs.data?.runs || []).map(r => <option key={r.id} value={r.id}>{shortId(r.id)} · {r.workerName || "—"} · {r.state}</option>)}
          </select>
        </div>
      </div>
      <ErrorAlert error={runs.error} />
      {selected ? <EvidenceGallery runId={selected} /> : <div className="pf-panel"><Empty title="Choose a run to see its evidence" /></div>}
    </>
  );
}

export function AuditExports() {
  const [state, setState] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const events = useResource(() => platformApi.auditEvents(), []);
  const exportRuns = async (format: "csv" | "json") => {
    setBusy(true);
    setMessage(null);
    try {
      const body = await platformApi.exportRuns(format, state ? { state } : {});
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      download(`autoworker-runs-${stamp}.${format}`, body, format === "csv" ? "text/csv" : "application/json");
      const rows = format === "csv" ? Math.max(0, body.trim().split(/\r?\n/).length - 1) : (JSON.parse(body).rows?.length ?? 0);
      setMessage({ tone: "ok", text: `Exported ${rows} run(s) as ${format.toUpperCase()}. The export is recorded in the audit log.` });
      events.refresh();
    } catch (err) {
      setMessage({ tone: "bad", text: friendlyError(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title="Exports" description="Download execution records for review outside Autoworker." />
      <div className="pf-panel pf-pad" style={{ maxWidth: 560 }}>
        <div className="pf-field">
          <label htmlFor="x-state">Runs in state</label>
          <select id="x-state" className="pf-select" value={state} onChange={e => setState(e.target.value)}>{STATES.map(s => <option key={s} value={s}>{s || "Any"}</option>)}</select>
        </div>
        <div className="pf-row">
          <button className="pf-btn primary" disabled={busy} onClick={() => exportRuns("csv")}>Export CSV</button>
          <button className="pf-btn" disabled={busy} onClick={() => exportRuns("json")}>Export JSON</button>
        </div>
        {message && <div style={{ marginTop: 12 }}><Alert tone={message.tone}>{message.text}</Alert></div>}
      </div>
      <Section title="Recent audit events">
        <ErrorAlert error={events.error} />
        <AuditEventTable events={(events.data?.events || []).slice(0, 50)} />
      </Section>
    </>
  );
}
