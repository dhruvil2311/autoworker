import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiBaseUrl, authorizationHeader, friendlyError } from "./api/client.js";
import type { Tone } from "./status.js";

/**
 * Server state for one resource. Responses that arrive after a newer request started are ignored,
 * and polling stops while the tab is hidden, so the screen always shows the latest backend truth.
 */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, deps: React.DependencyList, options: { pollMs?: number } = {}) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const loader = useRef(load);
  loader.current = load;

  const refresh = useCallback(() => {
    const id = ++seq.current;
    const controller = new AbortController();
    setLoading(prev => prev || data === undefined);
    loader.current(controller.signal)
      .then(result => { if (id === seq.current) { setData(result); setError(undefined); } })
      .catch(err => { if (id === seq.current && !controller.signal.aborted) setError(err); })
      .finally(() => { if (id === seq.current) setLoading(false); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    setData(undefined);
    const cancel = refresh();
    if (!options.pollMs) return cancel;
    const timer = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, options.pollMs);
    return () => { cancel(); clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, options.pollMs]);

  return { data, error, loading, refresh };
}

export function PageHeader({ title, description, crumb, actions }: { title: string; description?: string | undefined; crumb?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="pf-header">
      <div>
        {crumb && <div className="pf-crumb">{crumb}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="pf-row">{actions}</div>}
    </div>
  );
}

export function Status({ label, tone }: { label: string; tone: Tone }) {
  return <span className={`pf-status ${tone}`}>{label}</span>;
}

export function Alert({ tone = "info", title, children }: { tone?: Tone; title?: string; children?: React.ReactNode }) {
  return (
    <div className={`pf-alert ${tone}`} role={tone === "bad" ? "alert" : "status"}>
      {title && <strong>{title}</strong>}
      {children}
    </div>
  );
}

export function ErrorAlert({ error, title = "Could not load this information", onRetry }: { error: unknown; title?: string; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <Alert tone="bad" title={title}>
      <span>{friendlyError(error)}</span>
      {onRetry && <div style={{ marginTop: 8 }}><button className="pf-btn" onClick={onRetry}>Try again</button></div>}
    </Alert>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="pf-empty"><strong>{title}</strong>{children}</div>;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="pf-loading" aria-live="polite">{label}</div>;
}

export function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="pf-section">
      <div className="pf-row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--pf-text-3)", margin: "0 0 10px" }}>{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function ConfirmDialog({ title, body, confirmLabel, tone = "primary", onConfirm, onCancel, busy }: {
  title: string; body: React.ReactNode; confirmLabel: string; tone?: "primary" | "danger"; onConfirm: () => void; onCancel: () => void; busy?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="pf-dialog-backdrop" role="presentation" onClick={onCancel}>
      <div className="pf-dialog" role="dialog" aria-modal="true" aria-labelledby="pf-dialog-title" onClick={e => e.stopPropagation()}>
        <h2 id="pf-dialog-title">{title}</h2>
        <div className="pf-muted" style={{ marginBottom: 16 }}>{body}</div>
        <div className="pf-row" style={{ justifyContent: "flex-end" }}>
          <button className="pf-btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={`pf-btn ${tone}`} onClick={onConfirm} disabled={busy} autoFocus>{busy ? "Working…" : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/** Image from an authenticated endpoint (img tags cannot send the Authorization header). */
export function AuthImage({ path, alt }: { path: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url: string | null = null;
    const controller = new AbortController();
    const authorization = authorizationHeader();
    fetch(`${apiBaseUrl()}${path}`, { headers: authorization ? { authorization } : {}, signal: controller.signal })
      .then(r => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then(blob => { url = URL.createObjectURL(blob); setSrc(url); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [path]);
  if (failed) return <div className="pf-faint" style={{ padding: 12 }}>Frame unavailable</div>;
  return src ? <img src={src} alt={alt} /> : <div className="pf-faint" style={{ padding: 12 }}>Loading frame…</div>;
}

export function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
