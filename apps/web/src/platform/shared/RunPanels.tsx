import React, { useState } from "react";
import type { RunDetailResponse } from "@ghost/shared-types/contracts";
import { platformApi } from "../api/resources.js";
import { friendlyError } from "../api/client.js";
import { Alert, ConfirmDialog, Empty, ErrorAlert, Loading, Status, newIdempotencyKey, useResource } from "../ui.js";
import { formatTime, stepTone } from "../status.js";

type Detail = RunDetailResponse;

/** Planned steps of the pinned workflow version, merged with what actually executed. */
export function StepList({ detail, technical }: { detail: Detail; technical: boolean }) {
  const executed = new Map<string, any>();
  for (const s of detail.steps) executed.set(s.stepId, s);
  const rows = detail.planned_steps.map((p: any) => ({ planned: p, step: executed.get(p.stepId) }));
  const firstFailure = rows.find(r => r.step && (r.step.state === "FAILED" || r.step.state === "PAUSED_FOR_HUMAN"));
  if (!rows.length) return <Empty title="This workflow version has no steps." />;
  return (
    <ol className="pf-steps pf-panel">
      {rows.map(({ planned, step }, i) => {
        const failing = firstFailure?.planned.stepId === planned.stepId;
        const message: string = step?.metadata?.message || "";
        return (
          <li key={planned.stepId} className={failing ? "failing" : ""} data-step-id={planned.stepId}>
            <span className="pf-step-n">{i + 1}</span>
            <div style={{ minWidth: 0 }}>
              <div>{planned.name}</div>
              {technical && <div className="pf-faint pf-mono">{planned.operation} · {planned.target} · {planned.stepId}</div>}
              {message && (failing || technical) && <div className={failing ? "" : "pf-faint"} style={{ marginTop: 4, color: failing ? "var(--pf-bad)" : undefined }}>{message}</div>}
              {technical && step && <div className="pf-faint">Started {formatTime(step.startedAt)} · Finished {formatTime(step.finishedAt)}</div>}
            </div>
            <Status label={step ? step.state.replace(/_/g, " ").toLowerCase() : "not started"} tone={step ? stepTone(step.state) : "neutral"} />
          </li>
        );
      })}
    </ol>
  );
}

/** Pending human decisions on this run, with approve / reject bound to the exact run and version. */
export function DecisionPanel({ detail, onDecided }: { detail: Detail; onDecided: () => void }) {
  const pending = detail.hitl_requests.filter(h => h.state === "PENDING" || h.state === "CONTROL_ACTIVE");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confirmReject, setConfirmReject] = useState<string | null>(null);
  if (!pending.length) return null;

  const decide = async (hitlId: string, action: "APPROVE" | "REJECT") => {
    setBusy(true);
    setError(null);
    try {
      await platformApi.decide(hitlId, action, { runId: detail.run.id, workflowVersionId: detail.run.workflowVersionId, ...(note ? { note } : {}) });
      setNote("");
      setConfirmReject(null);
      onDecided();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pf-panel pf-pad" style={{ borderColor: "var(--pf-warn)" }}>
      {pending.map(h => (
        <div key={h.id} style={{ marginBottom: 12 }}>
          <strong>Approval needed</strong>
          <div className="pf-muted" style={{ margin: "4px 0 8px" }}>{describeReason(h.reason)}</div>
          {h.expiresAt && <div className="pf-faint">Decide before {formatTime(h.expiresAt)}</div>}
          {!detail.controls.canDecide && <Alert tone="info">{detail.controls.reasons.decide || "You cannot decide this request."}</Alert>}
          {detail.controls.canDecide && (
            <>
              <div className="pf-field" style={{ marginTop: 8 }}>
                <label htmlFor={`note-${h.id}`}>Note (optional)</label>
                <input id={`note-${h.id}`} className="pf-input" value={note} onChange={e => setNote(e.target.value)} maxLength={500} />
              </div>
              <div className="pf-row">
                <button className="pf-btn primary" disabled={busy} onClick={() => decide(h.id, "APPROVE")}>Approve and continue</button>
                <button className="pf-btn danger" disabled={busy} onClick={() => setConfirmReject(h.id)}>Reject and stop</button>
              </div>
            </>
          )}
        </div>
      ))}
      {error ? <ErrorAlert error={error} title="The decision was not recorded" /> : null}
      {confirmReject && (
        <ConfirmDialog
          title="Reject and stop this run?"
          body="The run stops immediately and no further steps are executed. This cannot be undone."
          confirmLabel="Reject"
          tone="danger"
          busy={busy}
          onCancel={() => setConfirmReject(null)}
          onConfirm={() => decide(confirmReject, "REJECT")}
        />
      )}
    </div>
  );
}

function describeReason(reason: string): string {
  if (reason === "MANUAL_APPROVAL") return "The next step commits a change in the application. Review it before it runs.";
  if (reason.startsWith("AUTHENTICATION_REQUIRED")) return "The application asks for sign-in. Credentials are entered by a person, never stored.";
  if (reason === "INTERRUPTED_SIDE_EFFECT_UNVERIFIED") return "A step was interrupted before its result was recorded. Confirm whether it took effect before continuing.";
  if (reason.startsWith("TARGET_")) return "The demonstrated control could not be found on the page.";
  return reason.replace(/_/g, " ").toLowerCase();
}

/** Screenshots, verification checks and extracted text recorded for the run's steps. */
export function EvidenceGallery({ runId }: { runId: string }) {
  const { data, error, loading, refresh } = useResource(signal => platformApi.runEvidence(runId), [runId]);
  if (loading && !data) return <Loading label="Loading evidence…" />;
  if (error) return <ErrorAlert error={error} onRetry={refresh} />;
  const items = data?.items || [];
  if (!items.length) return <Empty title="No evidence was recorded for this run yet." />;
  const shots = items.filter(i => i.kind === "screenshot");
  const checks = items.filter(i => i.kind === "verification");
  const extracts = items.filter(i => i.kind === "extraction");
  return (
    <div className="pf-grid">
      {checks.map((c, i) => (
        <div key={`v${i}`} className="pf-panel pf-pad">
          <div className="pf-row" style={{ justifyContent: "space-between" }}>
            <strong>Outcome verification · {c.stepId}</strong>
            <Status label={c.data?.verified ? "verified" : "not met"} tone={c.data?.verified ? "ok" : "bad"} />
          </div>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {(c.data?.checks || []).map((ck: any, j: number) => (
              <li key={j}>{ck.type} “{ck.expected}” — {ck.passed ? "observed" : `not observed (${ck.observed})`}</li>
            ))}
          </ul>
        </div>
      ))}
      {extracts.map((x, i) => (
        <div key={`x${i}`} className="pf-panel pf-pad">
          <strong>Extracted text · {x.stepId}</strong>
          <pre className="pf-pre" style={{ marginTop: 8 }}>{String(x.data)}</pre>
        </div>
      ))}
      {shots.length > 0 && (
        <div className="pf-thumbs">
          {shots.map((s, i) => (
            <figure key={`s${i}`}>
              <img src={s.data} alt={`Screenshot after ${s.stepId}`} />
              <figcaption>{s.stepId} · {formatTime(s.capturedAt)}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

/** Operator controls; each is enabled only when the backend says it is allowed now. */
export function RunControlsBar({ detail, onChanged, onRetried }: { detail: Detail; onChanged: () => void; onRetried: (runId: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "cancel" | "retry">(null);
  const c = detail.controls;
  const act = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setError(null);
    try {
      const result: any = await fn();
      if (name === "retry" && result?.run?.id) onRetried(result.run.id);
      onChanged();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };
  return (
    <div>
      <div className="pf-row">
        <button className="pf-btn" disabled={!c.canPause || Boolean(busy)} title={c.reasons.pause} onClick={() => act("pause", () => platformApi.pauseRun(detail.run.id, "Paused by operator"))}>Pause</button>
        <button className="pf-btn" disabled={!c.canResume || Boolean(busy)} title={c.reasons.resume} onClick={() => act("resume", () => platformApi.resumeRun(detail.run.id))}>Resume</button>
        <button className="pf-btn" disabled={!c.canRetry || Boolean(busy)} title={c.reasons.retry} onClick={() => setConfirm("retry")}>Retry as new run</button>
        <button className="pf-btn danger" disabled={!c.canCancel || Boolean(busy)} title={c.reasons.cancel} onClick={() => setConfirm("cancel")}>Cancel run</button>
      </div>
      <ul className="pf-faint" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
        {Object.entries(c.reasons).filter(([k]) => k !== "decide").map(([k, v]) => <li key={k}><strong style={{ display: "inline", fontWeight: 600 }}>{k}:</strong> {v}</li>)}
      </ul>
      {error && <Alert tone="bad" title="The action was not performed">{error}</Alert>}
      {confirm === "cancel" && (
        <ConfirmDialog title="Cancel this run?" body="No further steps will run. Steps already completed are not undone." confirmLabel="Cancel run" tone="danger"
          busy={busy === "cancel"} onCancel={() => setConfirm(null)} onConfirm={() => act("cancel", () => platformApi.cancelRun(detail.run.id))} />
      )}
      {confirm === "retry" && (
        <ConfirmDialog title="Retry as a new run?" body="A new run starts from the first step on the same workflow version. This run stays in history unchanged." confirmLabel="Start new run"
          busy={busy === "retry"} onCancel={() => setConfirm(null)} onConfirm={() => act("retry", () => platformApi.retryRun(detail.run.id, newIdempotencyKey()))} />
      )}
    </div>
  );
}
