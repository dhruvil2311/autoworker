import React, { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { VersionSummary } from "@ghost/shared-types/contracts";
import { platformApi } from "../api/resources.js";
import { ApiError, friendlyError } from "../api/client.js";
import { Alert, AuthImage, ConfirmDialog, Empty, ErrorAlert, Loading, PageHeader, Section, Status, newIdempotencyKey, useResource } from "../ui.js";
import { formatTime, shortId, technicalStatus } from "../status.js";
import { usePlatformSession } from "../session.js";
import { TechnicalRunView } from "./operations.js";

const MAX_UPLOAD_BYTES = 35 * 1024 * 1024;

export function StudioRecordings() {
  const workers = useResource(() => platformApi.workers(), []);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await platformApi.createWorker(name.trim(), description.trim());
      setName("");
      setDescription("");
      workers.refresh();
    } catch (err) {
      setError(err);
    } finally {
      setCreating(false);
    }
  };
  return (
    <>
      <PageHeader title="Recordings" description="Each automation is trained from its own recordings. Open one to upload a demonstration, inspect the evidence and compile a workflow." />
      <div className="pf-grid pf-grid-2" style={{ alignItems: "start" }}>
        <div className="pf-panel pf-table-wrap">
          {workers.loading && !workers.data && <div className="pf-pad"><Loading /></div>}
          <ErrorAlert error={workers.error} onRetry={workers.refresh} />
          {workers.data && !workers.data.ghost_workers.length && <Empty title="No automations yet">Create one to start.</Empty>}
          {!!workers.data?.ghost_workers.length && (
            <table className="pf-table">
              <thead><tr><th>Automation</th><th>Status</th><th>Versions</th></tr></thead>
              <tbody>
                {workers.data.ghost_workers.map(w => (
                  <tr key={w.id}>
                    <td><Link to={`/app/studio/workers/${w.id}`}>{w.name}</Link></td>
                    <td><Status label={w.status} tone={w.status === "ACTIVE" ? "ok" : w.status === "NEEDS_ATTENTION" ? "bad" : "neutral"} /></td>
                    <td className="pf-faint">{w.publishedVersionId ? `published ${shortId(w.publishedVersionId)}` : "not published"}{w.activeVersionId ? ` · candidate ${shortId(w.activeVersionId)}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <form className="pf-panel pf-pad" onSubmit={create} aria-label="Create automation">
          <strong>New automation</strong>
          <div className="pf-field" style={{ marginTop: 10 }}>
            <label htmlFor="w-name">Name</label>
            <input id="w-name" className="pf-input" value={name} onChange={e => setName(e.target.value)} required maxLength={120} />
          </div>
          <div className="pf-field">
            <label htmlFor="w-desc">Purpose</label>
            <textarea id="w-desc" className="pf-textarea" value={description} onChange={e => setDescription(e.target.value)} maxLength={500} />
          </div>
          {error ? <ErrorAlert error={error} title="Not created" /> : null}
          <button className="pf-btn primary" disabled={creating || !name.trim()}>{creating ? "Creating…" : "Create"}</button>
        </form>
      </div>
    </>
  );
}

export function StudioWorker() {
  const { workerId = "" } = useParams();
  const [search, setSearch] = useSearchParams();
  const jobId = search.get("job") || "";
  const versionParam = search.get("version") || "";
  const { can } = usePlatformSession();
  const worker = useResource(() => platformApi.worker(workerId), [workerId]);
  const docs = useResource(() => platformApi.evidenceDocuments(workerId), [workerId]);
  const versions = useResource(() => platformApi.versions(workerId), [workerId]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<unknown>(null);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value); else next.delete(key);
    setSearch(next, { replace: true });
  };

  const upload = async (file: File) => {
    setUploadError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(new Error(`The file is ${(file.size / 1048576).toFixed(1)} MB; the limit is ${MAX_UPLOAD_BYTES / 1048576} MB.`));
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("The file could not be read."));
        reader.readAsDataURL(file);
      });
      const uploaded = await platformApi.uploadRecording(workerId, file.name, dataUrl);
      docs.refresh();
      const job = await platformApi.analyzeRecording(workerId, uploaded.document.id);
      setParam("job", job.jobId);
    } catch (err) {
      setUploadError(err);
    } finally {
      setUploading(false);
    }
  };

  const analyze = async (documentId: string) => {
    setUploadError(null);
    try {
      const job = await platformApi.analyzeRecording(workerId, documentId);
      setParam("job", job.jobId);
    } catch (err) {
      setUploadError(err);
    }
  };

  if (worker.loading && !worker.data) return <Loading />;
  if (worker.error) return <ErrorAlert error={worker.error} onRetry={worker.refresh} />;
  const w = worker.data!;

  return (
    <>
      <PageHeader title={w.name} description={w.description} crumb={<Link to="/app/studio">Recordings</Link>}
        actions={<Status label={w.status} tone={w.status === "ACTIVE" ? "ok" : "neutral"} />} />

      <Section title="Recordings">
        <div className="pf-panel pf-pad">
          <div className="pf-field">
            <label htmlFor="rec-file">Upload a screen recording (webm, mp4, mov, mkv, avi; up to {MAX_UPLOAD_BYTES / 1048576} MB)</label>
            <input id="rec-file" type="file" accept="video/*,.webm,.mkv,.mp4,.mov,.avi" disabled={uploading}
              onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
          </div>
          {uploading && <Loading label="Uploading and validating the recording…" />}
          {uploadError ? <ErrorAlert error={uploadError} title="The recording was not accepted" /> : null}
          {docs.data && (
            <table className="pf-table">
              <thead><tr><th>File</th><th>Uploaded</th><th>Content hash</th><th></th></tr></thead>
              <tbody>
                {docs.data.documents.filter(d => d.type === "VIDEO" || d.type === "IMAGE" || d.type === "DESKTOP_RECORDING").map(d => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td className="pf-muted">{formatTime(d.parsedJson?.uploadedAt || d.createdAt)}</td>
                    <td className="pf-mono">{String(d.parsedJson?.sha256 || "").slice(0, 12) || "—"}</td>
                    <td><button className="pf-btn" onClick={() => analyze(d.id)}>Analyze</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Section>

      {jobId && <AnalysisPanel workerId={workerId} jobId={jobId} onCompiled={() => { versions.refresh(); worker.refresh(); }} />}

      <Section title="Workflow versions">
        <ErrorAlert error={versions.error} onRetry={versions.refresh} />
        {versions.data && !versions.data.versions.length && <div className="pf-panel"><Empty title="No compiled versions yet" /></div>}
        {!!versions.data?.versions.length && (
          <VersionTable workerId={workerId} versions={versions.data.versions} canPublish={can("workflows.publish")}
            selected={versionParam} onSelect={v => setParam("version", v)} onChanged={() => { versions.refresh(); worker.refresh(); }} />
        )}
      </Section>
      {versionParam && <VersionSteps versionId={versionParam} />}
    </>
  );
}

function AnalysisPanel({ workerId, jobId, onCompiled }: { workerId: string; jobId: string; onCompiled: () => void }) {
  const [done, setDone] = useState(false);
  const job = useResource(() => platformApi.job(workerId, jobId), [workerId, jobId], { pollMs: done ? 0 : 2500 });
  const status = job.data?.status;
  React.useEffect(() => { if (status === "COMPLETED" || status === "FAILED") setDone(true); }, [status]);
  const timeline = useResource(() => (status === "COMPLETED" ? platformApi.timeline(workerId, jobId) : Promise.resolve(undefined)), [workerId, jobId, status]);
  const [objective, setObjective] = useState("");
  const [compiling, setCompiling] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; body: any } | null>(null);

  const compile = async () => {
    setCompiling(true);
    setResult(null);
    try {
      const body = await platformApi.compileJob(workerId, jobId, objective.trim());
      setResult({ ok: true, body });
      onCompiled();
    } catch (err) {
      setResult({ ok: false, body: err instanceof ApiError ? { ...err.details, status: err.status, code: err.code, message: err.message } : { message: friendlyError(err) } });
      if (err instanceof ApiError && (err.details as any).draftWorkflowVersionId) onCompiled();
    } finally {
      setCompiling(false);
      timeline.refresh();
    }
  };

  const t = timeline.data;
  const grounding = result?.body?.grounding || t?.grounding;
  return (
    <Section title={`Analysis ${shortId(jobId)}`}>
      <div className="pf-panel pf-pad">
        <ErrorAlert error={job.error} />
        {job.data && (
          <div className="pf-row" style={{ justifyContent: "space-between" }}>
            <div>{job.data.currentStage || job.data.status}</div>
            <Status label={job.data.status} tone={job.data.status === "COMPLETED" ? "ok" : job.data.status === "FAILED" ? "bad" : "info"} />
          </div>
        )}
        {job.data && !done && <div className="pf-progress" style={{ marginTop: 8 }}><div style={{ width: `${job.data.progressPercent ?? 5}%` }} /></div>}
        {job.data?.status === "FAILED" && <Alert tone="bad" title="Analysis failed">{job.data.error || "The recording could not be analysed."}</Alert>}
      </div>

      {t && (
        <>
          <h3 className="pf-faint" style={{ margin: "16px 0 8px" }}>Extracted frames ({t.frames?.length || 0})</h3>
          <div className="pf-thumbs">
            {(t.frames || []).slice(0, 24).map(f => (
              <figure key={f.frame_id}>
                <AuthImage path={platformApi.frameUrl(workerId, jobId, f.frame_id)} alt={`Frame ${f.frame_id}`} />
                <figcaption>{f.frame_id} · {typeof f.timestamp_seconds === "number" ? `${f.timestamp_seconds.toFixed(1)}s` : "time unknown"}</figcaption>
              </figure>
            ))}
          </div>
          <h3 className="pf-faint" style={{ margin: "16px 0 8px" }}>Actions detected by local analysis</h3>
          <div className="pf-panel pf-table-wrap">
            <table className="pf-table">
              <thead><tr><th>Time</th><th>Action</th><th>Target</th><th>Basis</th></tr></thead>
              <tbody>
                {(t.semanticActions || []).map((a: any, i: number) => (
                  <tr key={i}>
                    <td className="pf-mono">{typeof a.start_timestamp === "number" ? `${a.start_timestamp.toFixed(1)}s` : "—"}</td>
                    <td>{a.action_type}</td>
                    <td>{a.target_description || a.parameters?.url || "—"}</td>
                    <td className="pf-faint">{a.inference_status || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!!t.droppedActions?.length && (
            <Alert tone="info" title={`${t.droppedActions.length} detection(s) were not used`}>
              <ul style={{ margin: 0, paddingLeft: 18 }}>{t.droppedActions.map((d: any, i: number) => <li key={i}>{d.summary}: {d.reason}</li>)}</ul>
            </Alert>
          )}

          <h3 className="pf-faint" style={{ margin: "16px 0 8px" }}>Compile a workflow from this recording</h3>
          <div className="pf-panel pf-pad">
            <div className="pf-field">
              <label htmlFor="objective">Task objective (what the recording should accomplish)</label>
              <textarea id="objective" className="pf-textarea" value={objective} onChange={e => setObjective(e.target.value)} maxLength={1000}
                placeholder="Example: Mark order 42 as shipped and add the dispatch note" />
            </div>
            <button className="pf-btn primary" onClick={compile} disabled={compiling}>{compiling ? "Compiling… this can take a few minutes" : "Compile workflow"}</button>
            {result && <CompileResult result={result} />}
          </div>
          {grounding && <GroundingReport grounding={grounding} />}
        </>
      )}
    </Section>
  );
}

function CompileResult({ result }: { result: { ok: boolean; body: any } }) {
  const b = result.body;
  if (result.ok) {
    return (
      <Alert tone="ok" title="Workflow compiled and saved">
        Version {shortId(b.workflowVersionId)} via {b.analysisPath === "LOCAL_CV" ? "local analysis" : "multimodal model analysis"}.
        {!!b.readiness?.length && <div className="pf-faint">{b.readiness.length} readiness note(s).</div>}
      </Alert>
    );
  }
  const title = b.code === "AI_QUOTA_EXHAUSTED" || b.status === 429 ? "The model provider is unavailable"
    : b.code === "NEEDS_CLARIFICATION" || b.status === 422 ? "More information is needed before compiling"
    : "Compilation failed";
  const clarifications: any[] = b.clarifications || [];
  const readiness: any[] = Array.isArray(b.readiness) ? b.readiness : [];
  return (
    <Alert tone={b.status === 422 ? "warn" : "bad"} title={title}>
      <div>{b.message}</div>
      {b.draftWorkflowVersionId && <div className="pf-faint">Saved as draft {shortId(b.draftWorkflowVersionId)}; it was not activated.</div>}
      {!!clarifications.length && <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{clarifications.map((c, i) => <li key={i}>{c.message}</li>)}</ul>}
      {!!readiness.length && <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{readiness.map((c, i) => <li key={i}>{c.message}</li>)}</ul>}
      {b.providerFailure && <div className="pf-faint" style={{ marginTop: 6 }}>Provider: {b.providerFailure.status}</div>}
    </Alert>
  );
}

function GroundingReport({ grounding }: { grounding: any }) {
  return (
    <div className="pf-panel pf-pad" style={{ marginTop: 12 }}>
      <div className="pf-row" style={{ justifyContent: "space-between" }}>
        <strong>Model interpretation and evidence check</strong>
        <Status label={`coverage ${grounding.coverage?.fidelity || "unknown"}`} tone={grounding.coverage?.fidelity === "COMPLETE" ? "ok" : "warn"} />
      </div>
      <dl className="pf-kv" style={{ marginTop: 10 }}>
        <dt>Objective</dt><dd>{grounding.objective?.text || "—"} <span className="pf-faint">({grounding.objective?.source})</span></dd>
        <dt>Destination</dt><dd className="pf-mono">{grounding.destination?.url || "not established"}</dd>
      </dl>
      <table className="pf-table" style={{ marginTop: 10 }}>
        <thead><tr><th>#</th><th>Action</th><th>Target / value</th><th>Basis</th><th>Evidence</th></tr></thead>
        <tbody>
          {(grounding.actions || []).map((a: any) => (
            <tr key={a.index}>
              <td className="pf-mono">{a.index + 1}</td>
              <td>{a.action}{a.irreversible ? " · needs approval" : ""}</td>
              <td>{a.target?.text || a.target?.label || a.url || "—"}{a.value !== undefined ? ` = “${a.value}”` : ""}</td>
              <td><Status label={a.basis} tone={a.basis === "OBSERVED" ? "ok" : a.basis === "UNSUPPORTED" ? "bad" : "warn"} /></td>
              <td className="pf-faint">{[...(a.evidence?.episodeIds || []), ...(a.evidence?.frameIds || [])].slice(0, 4).join(", ") || "none"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!!grounding.issues?.length && (
        <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
          {grounding.issues.map((i: any, n: number) => <li key={n} style={{ color: i.severity === "BLOCKING" ? "var(--pf-bad)" : undefined }}>{i.severity}: {i.message}</li>)}
        </ul>
      )}
    </div>
  );
}

function VersionTable({ workerId, versions, canPublish, selected, onSelect, onChanged }: {
  workerId: string; versions: VersionSummary[]; canPublish: boolean; selected: string; onSelect: (id: string) => void; onChanged: () => void;
}) {
  const [confirm, setConfirm] = useState<VersionSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const publish = async (v: VersionSummary) => {
    setBusy(true);
    setMessage(null);
    try {
      await platformApi.publish(v.id, workerId);
      setMessage({ tone: "ok", text: `Version ${shortId(v.id)} is now the published task version.` });
      onChanged();
    } catch (err) {
      setMessage({ tone: "bad", text: friendlyError(err) });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };
  const test = async (v: VersionSummary) => {
    setBusy(true);
    setMessage(null);
    try {
      const { run } = await platformApi.testRun(workerId, v.id, newIdempotencyKey());
      setMessage({ tone: "ok", text: `Test run ${shortId(run.id)} started.` });
    } catch (err) {
      setMessage({ tone: "bad", text: friendlyError(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {message && <Alert tone={message.tone} title={message.tone === "ok" ? "Done" : "Not completed"}>{message.text}{message.tone === "ok" && message.text.startsWith("Test run") && <> <Link to="/app/studio/testing">View tests</Link></>}</Alert>}
      <div className="pf-panel pf-table-wrap">
        <table className="pf-table">
          <thead><tr><th>Version</th><th>Created</th><th>Source</th><th>Steps</th><th>State</th><th>Readiness</th><th></th></tr></thead>
          <tbody>
            {versions.map(v => (
              <tr key={v.id} aria-selected={selected === v.id}>
                <td className="pf-mono">{shortId(v.id)}</td>
                <td className="pf-muted">{formatTime(v.createdAt)}</td>
                <td className="pf-faint">{v.sourceType || "—"}{v.fidelity ? ` · ${v.fidelity}` : ""}</td>
                <td>{v.stepCount}</td>
                <td>
                  {v.isPublished && <Status label="published" tone="ok" />} {v.isActive && <Status label="candidate" tone="info" />}
                  {!v.isPublished && !v.isActive && <span className="pf-faint" title="Neither the candidate nor the published version">inactive</span>}
                </td>
                <td>{v.executable ? <Status label="executable" tone="ok" /> : <span title={v.blockingIssues.join("\n")}><Status label={`${v.blockingIssues.length} blocking`} tone="bad" /></span>}</td>
                <td>
                  <div className="pf-row">
                    <button className="pf-btn ghost" onClick={() => onSelect(v.id)}>Steps</button>
                    <button className="pf-btn" disabled={busy || !v.isActive || !v.executable} title={!v.isActive ? "Only the current candidate can be tested" : undefined} onClick={() => test(v)}>Test</button>
                    {canPublish && <button className="pf-btn primary" disabled={busy || !v.executable || v.isPublished} onClick={() => setConfirm(v)}>Publish</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {confirm && (
        <ConfirmDialog title={`Publish version ${shortId(confirm.id)}?`}
          body="Business users will run this exact version from now on. Runs already in progress keep the version they started with."
          confirmLabel="Publish" busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => publish(confirm)} />
      )}
    </>
  );
}

function VersionSteps({ versionId }: { versionId: string }) {
  const v = useResource(() => platformApi.workflowVersion(versionId), [versionId]);
  if (v.loading && !v.data) return <Loading />;
  if (v.error) return <ErrorAlert error={v.error} />;
  const wf = v.data!.workflow;
  const leaves: any[] = [];
  const walk = (s: any) => { if (s?.children?.length) s.children.forEach(walk); else if (s) leaves.push(s); };
  walk(wf?.root_step);
  return (
    <Section title={`Steps of version ${shortId(versionId)}`}>
      <div className="pf-panel pf-table-wrap">
        <table className="pf-table">
          <thead><tr><th>#</th><th>Operation</th><th>Description</th><th>Target</th><th>Evidence basis</th></tr></thead>
          <tbody>
            {leaves.map((s, i) => (
              <tr key={s.id}>
                <td className="pf-mono">{i + 1}</td>
                <td className="pf-mono">{s.operation}</td>
                <td>{s.description}</td>
                <td className="pf-mono">{s.args?.url || s.args?.target?.text || s.args?.target?.label || s.args?.selector || "—"}</td>
                <td className="pf-faint">{s.args?.provenance?.basis || "—"}{s.args?.provenance?.episode_ids?.length ? ` · ${s.args.provenance.episode_ids.join(",")}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!!wf?.success_criteria?.length && (
        <div className="pf-panel pf-pad" style={{ marginTop: 8 }}>
          <strong>Success criteria</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{wf.success_criteria.map((c: any) => <li key={c.id}>{c.type} “{c.value}” <span className="pf-faint">({c.source})</span></li>)}</ul>
        </div>
      )}
    </Section>
  );
}

export function StudioWorkflows() {
  const workers = useResource(() => platformApi.workers(), []);
  return (
    <>
      <PageHeader title="Workflows" description="Published and candidate versions for each automation." />
      {workers.loading && !workers.data && <Loading />}
      <ErrorAlert error={workers.error} onRetry={workers.refresh} />
      {workers.data?.ghost_workers.map(w => <WorkerVersions key={w.id} workerId={w.id} name={w.name} />)}
      {workers.data && !workers.data.ghost_workers.length && <div className="pf-panel"><Empty title="No automations yet" /></div>}
    </>
  );
}

function WorkerVersions({ workerId, name }: { workerId: string; name: string }) {
  const versions = useResource(() => platformApi.versions(workerId), [workerId]);
  return (
    <Section title={name} actions={<Link className="pf-btn ghost" to={`/app/studio/workers/${workerId}`}>Open</Link>}>
      <ErrorAlert error={versions.error} />
      {versions.data && !versions.data.versions.length && <div className="pf-faint">No versions.</div>}
      {!!versions.data?.versions.length && (
        <div className="pf-panel pf-table-wrap">
          <table className="pf-table">
            <thead><tr><th>Version</th><th>Created</th><th>State</th><th>Readiness</th></tr></thead>
            <tbody>
              {versions.data.versions.map(v => (
                <tr key={v.id}>
                  <td><Link className="pf-mono" to={`/app/studio/workers/${workerId}?version=${v.id}`}>{shortId(v.id)}</Link></td>
                  <td className="pf-muted">{formatTime(v.createdAt)}</td>
                  <td>{v.isPublished ? "published" : v.isActive ? "candidate" : "inactive"}</td>
                  <td>{v.executable ? "executable" : `${v.blockingIssues.length} blocking issue(s)`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function RunsTable({ filter, base }: { filter: (r: any) => boolean; base: string }) {
  const runs = useResource(() => platformApi.runs(), [], { pollMs: 6000 });
  const rows = (runs.data?.runs || []).filter(filter);
  return (
    <>
      {runs.loading && !runs.data && <Loading />}
      <ErrorAlert error={runs.error} onRetry={runs.refresh} />
      {runs.data && !rows.length && <div className="pf-panel"><Empty title="No runs" /></div>}
      {!!rows.length && (
        <div className="pf-panel pf-table-wrap">
          <table className="pf-table">
            <thead><tr><th>Run</th><th>Automation</th><th>Version</th><th>State</th><th>Started</th></tr></thead>
            <tbody>
              {rows.map(r => {
                const s = technicalStatus(r);
                return (
                  <tr key={r.id}>
                    <td><Link className="pf-mono" to={`${base}/${r.id}`}>{shortId(r.id)}</Link></td>
                    <td>{r.workerName || "—"}</td>
                    <td className="pf-mono">{shortId(r.workflowVersionId)}</td>
                    <td><Status label={s.label} tone={s.tone} /></td>
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

export function StudioTesting() {
  return (
    <>
      <PageHeader title="Testing" description="Test runs of candidate versions before they are published." />
      <RunsTable filter={r => r.runMode === "TEST"} base="/app/studio/runs" />
    </>
  );
}

export function StudioExecutions() {
  return (
    <>
      <PageHeader title="Executions" description="All runs, with the exact workflow version each one executed." />
      <RunsTable filter={() => true} base="/app/studio/runs" />
    </>
  );
}

export function StudioRun() {
  const { runId = "" } = useParams();
  return <TechnicalRunView runId={runId} crumb={<Link to="/app/studio/executions">Executions</Link>} showControls={false} />;
}
