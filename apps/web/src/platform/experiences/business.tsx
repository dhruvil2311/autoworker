import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { TaskSummary } from "@ghost/shared-types/contracts";
import { platformApi } from "../api/resources.js";
import { ApiError, friendlyError } from "../api/client.js";
import { Alert, Empty, ErrorAlert, Loading, PageHeader, Section, Status, newIdempotencyKey, useResource } from "../ui.js";
import { businessStatus, formatTime, isActive, isTerminal, isWaiting } from "../status.js";
import { DecisionPanel, EvidenceGallery, StepList } from "../shared/RunPanels.js";

function TaskCard({ task }: { task: TaskSummary }) {
  return (
    <div className="pf-panel pf-pad" data-testid="task-card">
      <div className="pf-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{task.name}</div>
          {task.description && <div className="pf-muted" style={{ marginTop: 2 }}>{task.description}</div>}
        </div>
        {task.runnable ? <Status label="Available" tone="ok" /> : <Status label="Unavailable" tone="warn" />}
      </div>
      <div className="pf-faint" style={{ margin: "10px 0" }}>
        {task.inputs.length ? `Needs: ${task.inputs.map(i => i.name).join(", ")}` : "No inputs needed"}
        {task.lastRun && <> · Last run {formatTime(task.lastRun.createdAt)}</>}
        {task.pendingApprovals > 0 && <> · <span style={{ color: "var(--pf-warn)" }}>{task.pendingApprovals} waiting for approval</span></>}
      </div>
      <Link className={`pf-btn ${task.runnable ? "primary" : ""}`} to={`/app/business/tasks/${task.workerId}`}>{task.runnable ? "Open task" : "View details"}</Link>
    </div>
  );
}

export function BusinessHome() {
  const tasks = useResource(() => platformApi.tasks(), []);
  const runs = useResource(() => platformApi.runs(), [], { pollMs: 8000 });
  const approvals = useResource(() => platformApi.approvals(), [], { pollMs: 8000 });
  const pending = (approvals.data?.hitl_requests || []).filter(h => h.state === "PENDING");
  return (
    <>
      <PageHeader title="Home" description="Run approved tasks and follow their results." />
      {pending.length > 0 && (
        <Alert tone="warn" title={`${pending.length} run${pending.length > 1 ? "s" : ""} waiting for approval`}>
          <Link to="/app/business/approvals">Review approvals</Link>
        </Alert>
      )}
      <Section title="Tasks">
        {tasks.loading && !tasks.data && <Loading />}
        <ErrorAlert error={tasks.error} onRetry={tasks.refresh} />
        {tasks.data && !tasks.data.tasks.length && (
          <div className="pf-panel"><Empty title="No published tasks yet">Tasks appear here after an automation builder publishes them.</Empty></div>
        )}
        <div className="pf-grid pf-grid-3">{tasks.data?.tasks.map(t => <TaskCard key={t.workerId} task={t} />)}</div>
      </Section>
      <Section title="Recent runs">
        <RunTable runs={(runs.data?.runs || []).slice(0, 8)} loading={runs.loading && !runs.data} error={runs.error} />
      </Section>
    </>
  );
}

export function BusinessTasks() {
  const tasks = useResource(() => platformApi.tasks(), []);
  return (
    <>
      <PageHeader title="Tasks" description="Published processes you are allowed to run." />
      {tasks.loading && !tasks.data && <Loading />}
      <ErrorAlert error={tasks.error} onRetry={tasks.refresh} />
      {tasks.data && !tasks.data.tasks.length && <div className="pf-panel"><Empty title="No published tasks yet">Tasks appear here after an automation builder publishes them.</Empty></div>}
      <div className="pf-grid pf-grid-3">{tasks.data?.tasks.map(t => <TaskCard key={t.workerId} task={t} />)}</div>
    </>
  );
}

function RunTable({ runs, loading, error }: { runs: any[]; loading: boolean; error: unknown }) {
  if (loading) return <Loading />;
  if (error) return <ErrorAlert error={error} />;
  if (!runs.length) return <div className="pf-panel"><Empty title="No runs yet" /></div>;
  return (
    <div className="pf-panel pf-table-wrap">
      <table className="pf-table">
        <thead><tr><th>Task</th><th>Status</th><th>Started</th><th></th></tr></thead>
        <tbody>
          {runs.map(r => {
            const s = businessStatus(r);
            return (
              <tr key={r.id}>
                <td>{r.workerName || "Task"}</td>
                <td><Status label={s.label} tone={s.tone} /></td>
                <td className="pf-muted">{formatTime(r.createdAt)}</td>
                <td><Link to={`/app/business/runs/${r.id}`}>View</Link></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function BusinessTask() {
  const { workerId = "" } = useParams();
  const navigate = useNavigate();
  const detail = useResource(() => platformApi.task(workerId), [workerId]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [idempotencyKey] = useState(newIdempotencyKey);

  if (detail.loading && !detail.data) return <Loading />;
  if (detail.error) return <ErrorAlert error={detail.error} onRetry={detail.refresh} />;
  const task = detail.data!.task;

  const launch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLaunching(true);
    setLaunchError(null);
    setFieldErrors({});
    try {
      const { run } = await platformApi.launchTask(task.workerId, task.publishedVersionId, inputs, idempotencyKey);
      navigate(`/app/business/runs/${run.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.details.fields) setFieldErrors(err.details.fields as Record<string, string>);
      setLaunchError(err);
      if (err instanceof ApiError && err.code === "TASK_VERSION_CHANGED") detail.refresh();
    } finally {
      setLaunching(false);
    }
  };

  return (
    <>
      <PageHeader title={task.name} description={task.description} crumb={<Link to="/app/business/tasks">Tasks</Link>} />
      <div className="pf-grid pf-grid-2">
        <form className="pf-panel pf-pad" onSubmit={launch} aria-label="Run task">
          {!task.runnable && (
            <Alert tone="warn" title="This task cannot run right now">
              <ul style={{ margin: 0, paddingLeft: 18 }}>{task.blockingIssues.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </Alert>
          )}
          {task.inputs.map(input => (
            <div className="pf-field" key={input.name}>
              <label htmlFor={`in-${input.name}`}>{input.name.replace(/_/g, " ")}{input.required ? "" : " (optional)"}</label>
              <input id={`in-${input.name}`} className="pf-input" value={inputs[input.name] || ""} required={input.required}
                onChange={e => setInputs(prev => ({ ...prev, [input.name]: e.target.value }))} />
              {fieldErrors[input.name] && <span className="pf-field-error">{fieldErrors[input.name]}</span>}
            </div>
          ))}
          {!task.inputs.length && <p className="pf-muted" style={{ marginTop: 0 }}>This task needs no input. It runs exactly as it was published.</p>}
          {launchError ? <Alert tone="bad" title="The task did not start">{friendlyError(launchError)}</Alert> : null}
          <button type="submit" className="pf-btn primary" disabled={!task.runnable || launching}>{launching ? "Starting…" : "Run task"}</button>
          <div className="pf-faint" style={{ marginTop: 10 }}>Version published {formatTime(task.publishedAt)}</div>
        </form>
        <div>
          <h2 className="pf-faint" style={{ margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Recent runs</h2>
          <RunTable runs={detail.data!.recentRuns} loading={false} error={null} />
        </div>
      </div>
    </>
  );
}

export function BusinessRun() {
  const { runId = "" } = useParams();
  const [pollMs, setPollMs] = useState(3000);
  const detail = useResource(() => platformApi.runDetail(runId), [runId], { pollMs });
  const run = detail.data?.run;
  React.useEffect(() => {
    if (run) setPollMs(isTerminal(run.state) ? 0 : 3000);
  }, [run?.state]);

  if (detail.loading && !detail.data) return <Loading />;
  if (detail.error) return <ErrorAlert error={detail.error} onRetry={detail.refresh} />;
  const d = detail.data!;
  const status = businessStatus(d.run);
  const outcome: any = d.run.outcome;
  return (
    <>
      <PageHeader
        title={d.worker?.name || "Task run"}
        crumb={<><Link to="/app/business">Home</Link> / Run {d.run.id.slice(0, 8)}</>}
        actions={<Status label={status.label} tone={status.tone} />}
      />
      {isWaiting(d.run.state) && <DecisionPanel detail={d} onDecided={detail.refresh} />}
      {isActive(d.run.state) && <Alert tone="info" title="Running">This page updates automatically.</Alert>}
      {isTerminal(d.run.state) && (
        <Section title="Result">
          <div className="pf-panel pf-pad">
            <div style={{ fontWeight: 600 }}>{status.label}</div>
            <div className="pf-muted" style={{ marginTop: 4 }}>{outcome?.reason || "No outcome was recorded for this run."}</div>
            {d.run.state === "SUCCEEDED" && outcome?.classification !== "VERIFIED_SUCCESS" && (
              <Alert tone="warn" title="Result not independently verified">The steps ran, but this task has no observable success condition, so Autoworker cannot confirm the result.</Alert>
            )}
          </div>
        </Section>
      )}
      <Section title="Evidence"><EvidenceGallery runId={d.run.id} /></Section>
      <Section title="Progress"><StepList detail={d} technical={false} /></Section>
    </>
  );
}

export function BusinessReports() {
  const runs = useResource(() => platformApi.runs({ state: "SUCCEEDED,FAILED,CANCELLED,TIMED_OUT" }), []);
  return (
    <>
      <PageHeader title="Reports" description="Results of finished runs, as recorded by the platform." />
      <RunTable runs={runs.data?.runs || []} loading={runs.loading && !runs.data} error={runs.error} />
    </>
  );
}

export function BusinessApprovals() {
  const approvals = useResource(() => platformApi.approvals(), [], { pollMs: 8000 });
  const pending = (approvals.data?.hitl_requests || []).filter(h => h.state === "PENDING" || h.state === "CONTROL_ACTIVE");
  return (
    <>
      <PageHeader title="Approvals" description="Runs paused until someone approves the next step." />
      {approvals.loading && !approvals.data && <Loading />}
      <ErrorAlert error={approvals.error} onRetry={approvals.refresh} />
      {approvals.data && !pending.length && <div className="pf-panel"><Empty title="Nothing waiting for approval" /></div>}
      {pending.length > 0 && (
        <div className="pf-panel pf-table-wrap">
          <table className="pf-table">
            <thead><tr><th>Waiting since</th><th>Reason</th><th></th></tr></thead>
            <tbody>
              {pending.map(h => (
                <tr key={h.id}>
                  <td className="pf-muted">{formatTime(h.createdAt)}</td>
                  <td>{h.reason === "MANUAL_APPROVAL" ? "Approve the next step" : h.reason.split(":")[0]!.replace(/_/g, " ").toLowerCase()}</td>
                  <td><Link className="pf-btn" to={`/app/business/runs/${h.runId}`}>Review</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
