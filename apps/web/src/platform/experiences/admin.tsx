import React, { useEffect, useState } from "react";
import type { Policies } from "@ghost/shared-types/contracts";
import { platformApi } from "../api/resources.js";
import { ApiError, friendlyError } from "../api/client.js";
import { Alert, ConfirmDialog, Empty, ErrorAlert, Loading, PageHeader, Section, Status, useResource } from "../ui.js";
import { formatTime } from "../status.js";
import { usePlatformSession } from "../session.js";

export function AdminPeople() {
  const { me } = usePlatformSession();
  const members = useResource(() => platformApi.members(), []);
  const [pending, setPending] = useState<{ userId: string; role: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const apply = async () => {
    if (!pending) return;
    setBusy(true);
    setMessage(null);
    try {
      await platformApi.setMemberRole(pending.userId, pending.role);
      setMessage({ tone: "ok", text: `Role changed to ${pending.role}.` });
      members.refresh();
    } catch (err) {
      setMessage({ tone: "bad", text: friendlyError(err) });
    } finally {
      setBusy(false);
      setPending(null);
    }
  };
  return (
    <>
      <PageHeader title="People and access" description="Members of this organization and the role that decides what each can do. Roles are enforced by the server." />
      <Alert tone="info">Invitations are managed through your identity provider; this page changes roles of existing members.</Alert>
      {message && <Alert tone={message.tone} title={message.tone === "ok" ? "Saved" : "Not changed"}>{message.text}</Alert>}
      {members.loading && !members.data && <Loading />}
      <ErrorAlert error={members.error} onRetry={members.refresh} />
      {members.data && !members.data.members.length && <div className="pf-panel"><Empty title="No members found" /></div>}
      {!!members.data?.members.length && (
        <div className="pf-panel pf-table-wrap">
          <table className="pf-table">
            <thead><tr><th>Member</th><th>Joined</th><th>Role</th></tr></thead>
            <tbody>
              {members.data.members.map(m => (
                <tr key={m.userId}>
                  <td>{m.displayName || m.email || <span className="pf-mono">{m.userId}</span>}{m.userId === me?.user.id && <span className="pf-faint"> (you)</span>}</td>
                  <td className="pf-muted">{formatTime(m.joinedAt)}</td>
                  <td>
                    <select className="pf-select" aria-label={`Role for ${m.email || m.userId}`} value={m.role} disabled={m.userId === me?.user.id || busy}
                      onChange={e => setPending({ userId: m.userId, role: e.target.value })}>
                      {members.data!.assignableRoles.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pending && (
        <ConfirmDialog title="Change this member's role?" body={`The member's access changes to "${pending.role}" immediately.`} confirmLabel="Change role"
          busy={busy} onCancel={() => setPending(null)} onConfirm={apply} />
      )}
    </>
  );
}

export function AdminConnections() {
  const connections = useResource(() => platformApi.connections(), []);
  const [name, setName] = useState("");
  const [system, setSystem] = useState("");
  const [type, setType] = useState("browser_login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [remove, setRemove] = useState<string | null>(null);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await platformApi.createConnection(name.trim(), system.trim(), type);
      setName("");
      setSystem("");
      connections.refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const doRemove = async () => {
    if (!remove) return;
    setBusy(true);
    try {
      await platformApi.deleteConnection(remove);
      connections.refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      setRemove(null);
    }
  };
  return (
    <>
      <PageHeader title="Connections" description="Applications Autoworker works with. Secrets are never shown or stored in this page; sign-in happens on the live page through an approval." />
      <div className="pf-grid pf-grid-2" style={{ alignItems: "start" }}>
        <div className="pf-panel pf-table-wrap">
          {connections.loading && !connections.data && <div className="pf-pad"><Loading /></div>}
          <ErrorAlert error={connections.error} onRetry={connections.refresh} />
          {connections.data && !connections.data.connections.length && <Empty title="No connections" />}
          {!!connections.data?.connections.length && (
            <table className="pf-table">
              <thead><tr><th>Name</th><th>System</th><th>Type</th><th></th></tr></thead>
              <tbody>
                {connections.data.connections.map(c => (
                  <tr key={c.id}>
                    <td>{c.name}</td><td>{c.system}</td><td className="pf-faint">{c.connectionType || "—"}</td>
                    <td><button className="pf-btn danger" onClick={() => setRemove(c.id)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <form className="pf-panel pf-pad" onSubmit={create} aria-label="Add connection">
          <strong>Add connection</strong>
          <div className="pf-field" style={{ marginTop: 10 }}><label htmlFor="c-name">Name</label><input id="c-name" className="pf-input" value={name} onChange={e => setName(e.target.value)} required /></div>
          <div className="pf-field"><label htmlFor="c-system">Application</label><input id="c-system" className="pf-input" value={system} onChange={e => setSystem(e.target.value)} placeholder="orders.example.com" required /></div>
          <div className="pf-field"><label htmlFor="c-type">Access type</label>
            <select id="c-type" className="pf-select" value={type} onChange={e => setType(e.target.value)}>
              <option value="browser_login">Browser sign-in (entered by a person)</option>
              <option value="api_key">API (key held in the server secret store)</option>
            </select>
          </div>
          {error ? <ErrorAlert error={error} title="Not saved" /> : null}
          <button className="pf-btn primary" disabled={busy || !name.trim() || !system.trim()}>Add</button>
        </form>
      </div>
      {remove && <ConfirmDialog title="Remove this connection?" body="Workflows that depend on it will need a new connection." confirmLabel="Remove" tone="danger" busy={busy} onCancel={() => setRemove(null)} onConfirm={doRemove} />}
    </>
  );
}

export function AdminPolicies() {
  const policies = useResource(() => platformApi.policies(), []);
  const [draft, setDraft] = useState<Policies | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "bad"; text: string; fields?: Record<string, string> } | null>(null);
  useEffect(() => { if (policies.data) setDraft(policies.data.policies); }, [policies.data]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setResult(null);
    try {
      await platformApi.updatePolicies(draft);
      setResult({ tone: "ok", text: "Policies saved." });
      policies.refresh();
    } catch (err) {
      setResult({ tone: "bad", text: friendlyError(err), ...(err instanceof ApiError && err.details.fields ? { fields: err.details.fields as Record<string, string> } : {}) });
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <PageHeader title="Policies" description="Rules the platform enforces for every run in this organization." />
      {policies.loading && !policies.data && <Loading />}
      <ErrorAlert error={policies.error} onRetry={policies.refresh} />
      {draft && (
        <form className="pf-panel pf-pad" onSubmit={save} style={{ maxWidth: 640 }} aria-label="Organization policies">
          <div className="pf-field">
            <label htmlFor="p-timeout">Approval timeout (minutes)</label>
            <input id="p-timeout" type="number" className="pf-input" min={5} max={10080} value={draft.hitlTimeoutMinutes}
              onChange={e => setDraft({ ...draft, hitlTimeoutMinutes: Number(e.target.value) })} />
            <span className="pf-faint">A paused run times out if nobody decides within this time.</span>
            {result?.fields?.hitlTimeoutMinutes && <span className="pf-field-error">{result.fields.hitlTimeoutMinutes}</span>}
          </div>
          <label className="pf-row" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={draft.membersMayApproveOwnRuns} onChange={e => setDraft({ ...draft, membersMayApproveOwnRuns: e.target.checked })} />
            Business users may approve or reject runs they launched
          </label>
          <label className="pf-row" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={draft.retryRequiresOperator} onChange={e => setDraft({ ...draft, retryRequiresOperator: e.target.checked })} />
            Only operators may retry failed runs
          </label>
          <Alert tone="info">Approval checkpoints before irreversible actions are always required and cannot be turned off.</Alert>
          {result && <Alert tone={result.tone} title={result.tone === "ok" ? "Saved" : "Not saved"}>{result.text}</Alert>}
          <button className="pf-btn primary" disabled={saving}>{saving ? "Saving…" : "Save policies"}</button>
          <div className="pf-faint" style={{ marginTop: 8 }}>Last changed {formatTime(policies.data?.updatedAt)}</div>
        </form>
      )}
    </>
  );
}

export function AdminUsage() {
  const usage = useResource(() => platformApi.usage(), []);
  const u = usage.data;
  return (
    <>
      <PageHeader title="Usage" description="Activity in the last 30 days and the model provider's current state." />
      {usage.loading && !u && <Loading />}
      <ErrorAlert error={usage.error} onRetry={usage.refresh} />
      {u && (
        <div className="pf-grid pf-grid-3">
          <div className="pf-panel pf-pad"><div className="pf-faint">Runs</div><div style={{ fontSize: 24, fontWeight: 650 }}>{u.runs.total}</div></div>
          <div className="pf-panel pf-pad"><div className="pf-faint">Published tasks</div><div style={{ fontSize: 24, fontWeight: 650 }}>{u.publishedTasks}</div></div>
          <div className="pf-panel pf-pad"><div className="pf-faint">Workflow versions compiled</div><div style={{ fontSize: 24, fontWeight: 650 }}>{u.workflowVersions}</div></div>
          <div className="pf-panel pf-pad"><div className="pf-faint">Pending approvals</div><div style={{ fontSize: 24, fontWeight: 650 }}>{u.pendingApprovals}</div></div>
          <div className="pf-panel pf-pad">
            <div className="pf-faint">Model provider</div>
            <div className="pf-row" style={{ marginTop: 6 }}><Status label={u.provider.configured ? u.provider.state : "not configured"} tone={u.provider.state === "READY" ? "ok" : "warn"} /></div>
            <div className="pf-faint" style={{ marginTop: 6 }}>{u.provider.requestsToday} request(s) today</div>
          </div>
        </div>
      )}
      {u && (
        <Section title="Runs by outcome">
          <div className="pf-panel pf-pad">
            <dl className="pf-kv">
              {Object.entries(u.runs.byOutcome).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}
              {!Object.keys(u.runs.byOutcome).length && <><dt>—</dt><dd>No classified runs yet.</dd></>}
            </dl>
          </div>
        </Section>
      )}
    </>
  );
}
