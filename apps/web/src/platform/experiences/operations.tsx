import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { platformApi } from "../api/resources.js";
import { Empty, ErrorAlert, Loading, PageHeader, Section, Status, useResource } from "../ui.js";
import { formatTime, isTerminal, shortId, technicalStatus } from "../status.js";
import { DecisionPanel, EvidenceGallery, RunControlsBar, StepList } from "../shared/RunPanels.js";

const STATE_FILTERS: Array<{ label: string; value: string }> = [
  { label: "Active and waiting", value: "QUEUED,STARTING,RUNNING,RESUMING,PAUSING,WAITING_FOR_HUMAN,HUMAN_CONTROL_ACTIVE,VERIFYING_HANDOFF" },
  { label: "Failed", value: "FAILED,TIMED_OUT" },
  { label: "Completed", value: "SUCCEEDED" },
  { label: "Cancelled", value: "CANCELLED" },
  { label: "All", value: "" }
];

export function OpsLiveRuns() {
  const [state, setState] = useState(STATE_FILTERS[0]!.value);
  const runs = useResource(() => platformApi.runs(state ? { state } : {}), [state], { pollMs: 5000 });
  return (
    <>
      <PageHeader title="Live runs" description="Execution records as stored by the platform. Refreshes every 5 seconds." />
      <div className="pf-filters">
        <div className="pf-field">
          <label htmlFor="state-filter">Show</label>
          <select id="state-filter" className="pf-select" value={state} onChange={e => setState(e.target.value)}>
            {STATE_FILTERS.map(f => <option key={f.label} value={f.value}>{f.label}</option>)}
          </select>
        </div>
      </div>
      {runs.loading && !runs.data && <Loading />}
      <ErrorAlert error={runs.error} onRetry={runs.refresh} />
      {runs.data && !runs.data.runs.length && <div className="pf-panel"><Empty title="No runs in this view" /></div>}
      {!!runs.data?.runs.length && (
        <div className="pf-panel pf-table-wrap">
          <table className="pf-table">
            <thead><tr><th>Run</th><th>Automation</th><th>Mode</th><th>Version</th><th>State</th><th>Updated</th></tr></thead>
            <tbody>
              {runs.data.runs.map(r => {
                const s = technicalStatus(r);
                return (
                  <tr key={r.id}>
                    <td><Link className="pf-mono" to={`/app/ops/runs/${r.id}`}>{shortId(r.id)}</Link></td>
                    <td>{r.workerName || "—"}</td>
                    <td className="pf-faint">{r.runMode || "—"}</td>
                    <td className="pf-mono">{shortId(r.workflowVersionId)}</td>
                    <td><Status label={s.label} tone={s.tone} /></td>
                    <td className="pf-muted">{formatTime(r.updatedAt)}</td>
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

/** Full technical view of one run: exact version, controls, failing step, evidence, raw result. */
export function TechnicalRunView({ runId, crumb, showControls }: { runId: string; crumb: React.ReactNode; showControls: boolean }) {
  const navigate = useNavigate();
  const [pollMs, setPollMs] = useState(3000);
  const detail = useResource(() => platformApi.runDetail(runId), [runId], { pollMs });
  const state = detail.data?.run.state;
  React.useEffect(() => { if (state) setPollMs(isTerminal(state) ? 0 : 3000); }, [state]);
  if (detail.loading && !detail.data) return <Loading />;
  if (detail.error) return <ErrorAlert error={detail.error} onRetry={detail.refresh} />;
  const d = detail.data!;
  const s = technicalStatus(d.run);
  const outcome: any = d.run.outcome;
  return (
    <>
      <PageHeader title={`Run ${shortId(d.run.id)}`} crumb={crumb} actions={<Status label={s.label} tone={s.tone} />} />
      <div className="pf-grid pf-grid-2">
        <div className="pf-panel pf-pad">
          <dl className="pf-kv">
            <dt>Run ID</dt><dd className="pf-mono" data-testid="run-id">{d.run.id}</dd>
            <dt>Automation</dt><dd>{d.worker?.name || "—"}</dd>
            <dt>Workflow version</dt><dd className="pf-mono" data-testid="run-version">{d.run.workflowVersionId}{d.workflow_version && (d.workflow_version as any).isPublished ? " (published)" : ""}</dd>
            <dt>Source recording</dt><dd className="pf-mono">{d.workflow_version?.sourceRecordingId || "—"}</dd>
            <dt>Mode</dt><dd>{d.run.runMode || "—"}</dd>
            <dt>Launched by</dt><dd className="pf-mono">{d.run.createdBy || "—"}</dd>
            <dt>Created</dt><dd>{formatTime(d.run.createdAt)}</dd>
            <dt>Last update</dt><dd>{formatTime(d.run.updatedAt)}</dd>
            <dt>Outcome</dt><dd>{outcome?.classification || "—"}{outcome?.reason ? ` — ${outcome.reason}` : ""}</dd>
          </dl>
        </div>
        {showControls && (
          <div className="pf-panel pf-pad">
            <strong>Controls</strong>
            <div style={{ marginTop: 10 }}>
              <RunControlsBar detail={d} onChanged={detail.refresh} onRetried={id => navigate(`/app/ops/runs/${id}`)} />
            </div>
          </div>
        )}
      </div>
      <div style={{ marginTop: 12 }}><DecisionPanel detail={d} onDecided={detail.refresh} /></div>
      <Section title="Steps (pinned workflow version)"><StepList detail={d} technical /></Section>
      <Section title="Evidence"><EvidenceGallery runId={d.run.id} /></Section>
      <Section title="Recorded result">
        {d.result_summary == null
          ? <div className="pf-faint">No result has been recorded yet.</div>
          : <pre className="pf-pre">{JSON.stringify(d.result_summary, (k, v) => (typeof v === "string" && v.startsWith("data:image/") ? "[image]" : v), 2)}</pre>}
      </Section>
    </>
  );
}

export function OpsRun() {
  const { runId = "" } = useParams();
  return <TechnicalRunView runId={runId} crumb={<Link to="/app/ops">Live runs</Link>} showControls />;
}

export function OpsIncidents() {
  const health = useResource(() => platformApi.health(), [], { pollMs: 15000 });
  const incidents = health.data?.incidents || [];
  return (
    <>
      <PageHeader title="Incidents" description="Failed, stuck and waiting work detected from execution records." />
      {health.loading && !health.data && <Loading />}
      <ErrorAlert error={health.error} onRetry={health.refresh} />
      {health.data && !incidents.length && <div className="pf-panel"><Empty title="No open incidents" /></div>}
      {!!incidents.length && (
        <div className="pf-panel pf-table-wrap">
          <table className="pf-table">
            <thead><tr><th>Severity</th><th>Kind</th><th>Detail</th><th>Run</th><th>When</th></tr></thead>
            <tbody>
              {incidents.map((i, n) => (
                <tr key={n}>
                  <td><Status label={i.severity} tone={i.severity === "critical" ? "bad" : "warn"} /></td>
                  <td className="pf-mono">{i.kind}</td>
                  <td>{i.message}</td>
                  <td>{i.runId ? <Link className="pf-mono" to={`/app/ops/runs/${i.runId}`}>{shortId(i.runId)}</Link> : "—"}</td>
                  <td className="pf-muted">{formatTime(i.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function OpsWorkers() {
  const workers = useResource(() => platformApi.workers(), [], { pollMs: 15000 });
  return (
    <>
      <PageHeader title="Workers" description="Automations, their published and candidate versions, and current status." />
      {workers.loading && !workers.data && <Loading />}
      <ErrorAlert error={workers.error} onRetry={workers.refresh} />
      {workers.data && !workers.data.ghost_workers.length && <div className="pf-panel"><Empty title="No workers" /></div>}
      {!!workers.data?.ghost_workers.length && (
        <div className="pf-panel pf-table-wrap">
          <table className="pf-table">
            <thead><tr><th>Worker</th><th>Type</th><th>Status</th><th>Published</th><th>Candidate</th><th>Updated</th></tr></thead>
            <tbody>
              {workers.data.ghost_workers.map(w => (
                <tr key={w.id}>
                  <td>{w.name}</td>
                  <td className="pf-faint">{w.workerType || "—"}</td>
                  <td><Status label={w.status} tone={w.status === "ACTIVE" ? "ok" : w.status === "NEEDS_ATTENTION" ? "bad" : "neutral"} /></td>
                  <td className="pf-mono">{shortId(w.publishedVersionId)}</td>
                  <td className="pf-mono">{shortId(w.activeVersionId)}</td>
                  <td className="pf-muted">{formatTime(w.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function OpsHealth() {
  const health = useResource(() => platformApi.health(), [], { pollMs: 15000 });
  return (
    <>
      <PageHeader title="Service health" description="Live checks of the API, database, execution worker and model provider." actions={<button className="pf-btn" onClick={health.refresh}>Check now</button>} />
      {health.loading && !health.data && <Loading />}
      <ErrorAlert error={health.error} onRetry={health.refresh} />
      {health.data && (
        <>
          <div className="pf-grid pf-grid-2">
            {health.data.components.map(c => (
              <div key={c.name} className="pf-panel pf-pad" data-testid={`health-${c.name}`}>
                <div className="pf-row" style={{ justifyContent: "space-between" }}>
                  <strong>{c.name}</strong>
                  <Status label={c.status} tone={c.status === "ok" ? "ok" : c.status === "degraded" ? "warn" : c.status === "down" ? "bad" : "neutral"} />
                </div>
                <div className="pf-muted" style={{ marginTop: 4 }}>{c.detail}{c.latencyMs !== undefined ? ` · ${c.latencyMs} ms` : ""}</div>
              </div>
            ))}
          </div>
          <Section title="Queue">
            <div className="pf-panel pf-pad">
              <dl className="pf-kv">
                {Object.entries(health.data.queue.byState).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}
                <dt>Oldest queued</dt><dd>{health.data.queue.oldestQueuedSeconds === null ? "none queued" : `${health.data.queue.oldestQueuedSeconds}s`}</dd>
                <dt>Stuck runs</dt><dd>{health.data.queue.stuckRuns.length}</dd>
              </dl>
            </div>
          </Section>
          <div className="pf-faint" style={{ marginTop: 8 }}>Checked {formatTime(health.data.checkedAt)}</div>
        </>
      )}
    </>
  );
}
