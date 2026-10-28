import type { ZodType } from "zod";

/**
 * Shared HTTP client for the role-specific experiences. Every response is validated against the
 * contract schema the caller supplies, so a backend change that breaks the contract surfaces as an
 * explicit CONTRACT_MISMATCH error instead of rendering wrong data.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
    public readonly requestId?: string
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isForbidden() { return this.status === 403; }
  get isNotFound() { return this.status === 404; }
  get isConflict() { return this.status === 409; }
  get isNetwork() { return this.status === 0; }
}

export function apiBaseUrl(): string {
  try {
    return (localStorage.getItem("ghost_api_url") || "http://localhost:4000").replace(/\/+$/, "");
  } catch {
    return "http://localhost:4000";
  }
}

/** The stored session token without any "Bearer " prefix (the classic client stores it prefixed). */
export function currentToken(): string | null {
  try {
    const raw = localStorage.getItem("ghost_api_token");
    return raw ? raw.replace(/^Bearer\s+/i, "") : null;
  } catch {
    return null;
  }
}

/** Authorization header value for the current session, or undefined when signed out. */
export function authorizationHeader(): string | undefined {
  const token = currentToken();
  return token ? `Bearer ${token}` : undefined;
}

interface RequestOptions<T> {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  schema?: ZodType<T>;
  timeoutMs?: number;
  signal?: AbortSignal;
  idempotencyKey?: string;
  /** Return the raw text body (exports). */
  raw?: boolean;
}

export async function apiRequest<T = unknown>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  const authorization = authorizationHeader();
  if (authorization) headers.authorization = authorization;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), options.timeoutMs ?? 30_000);
  const onAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", onAbort, { once: true });

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      method: options.method ?? "GET",
      headers,
      signal: controller.signal,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
    });
  } catch (err: any) {
    if (options.signal?.aborted) throw err;
    const timedOut = err?.name === "TimeoutError" || controller.signal.reason?.name === "TimeoutError";
    throw new ApiError(0, timedOut ? "TIMEOUT" : "NETWORK", timedOut ? "The server did not respond in time." : "The server could not be reached.");
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }

  const requestId = response.headers.get("x-request-id") ?? undefined;
  if (!response.ok) {
    const body: any = await response.json().catch(() => ({}));
    // Two error shapes exist: { error: { code, message, ... } } and { error: "text", status, ...fields }.
    // Both keep every field so callers can show reasons (issues, draft ids) and not just a message.
    const err = typeof body?.error === "object" && body.error
      ? body.error
      : { ...body, code: body?.status && typeof body.status === "string" ? body.status : undefined, message: typeof body?.error === "string" ? body.error : (body?.message || response.statusText) };
    const { code, message, request_id, error: _error, ...details } = err;
    if (response.status === 401) window.dispatchEvent(new Event("ghost:unauthorized"));
    throw new ApiError(response.status, code || `HTTP_${response.status}`, message || `Request failed (${response.status})`, details, request_id ?? requestId);
  }

  if (options.raw) return (await response.text()) as unknown as T;
  const data = await response.json();
  if (!options.schema) return data as T;
  const parsed = options.schema.safeParse(data);
  if (!parsed.success) {
    console.error(`Contract mismatch for ${path}`, parsed.error.issues);
    throw new ApiError(response.status, "CONTRACT_MISMATCH", "The server returned data in an unexpected shape.", { issues: parsed.error.issues.slice(0, 5) }, requestId);
  }
  return parsed.data;
}

/** Human-readable explanation of an error for non-technical screens. */
export function friendlyError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.isNetwork) return err.code === "TIMEOUT" ? "The server took too long to respond. Try again in a moment." : "Autoworker's server could not be reached. Check your connection and try again.";
    if (err.isForbidden) return "Your role does not allow this action. Ask an administrator if you need access.";
    if (err.isNotFound) return "This item no longer exists or you do not have access to it.";
    return err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}
