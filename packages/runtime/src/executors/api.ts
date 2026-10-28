import type { WorkflowV2Step } from "@ghost/workflow-schema";
import type { RuntimeContext } from "../context.js";
import { VariableResolver } from "../context.js";
import type { ExecutionCapability, ExecutionResult } from "./index.js";
import { z } from "zod";
import { logger } from "@ghost/observability";

// --- Exposed Schemas ---
export const ApiInputSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]),
  headers: z.record(z.string()).optional(),
  body: z.any().optional(),
  timeoutMs: z.number().optional().default(10000),
  retryCount: z.number().optional().default(3),
  authConnectionId: z.string().optional(),
  successCondition: z.string().optional() // e.g. "data.success === true"
});

export const ApiResultSchema = z.object({
  status: z.number(),
  data: z.any(),
  headers: z.record(z.string())
});

export const ApiErrorSchema = z.object({
  status: z.number().optional(),
  code: z.string(),
  message: z.string()
});

export const ApiAuditEvents = z.enum([
  "API_REQUEST_STARTED",
  "API_REQUEST_RETRY",
  "API_REQUEST_SUCCEEDED",
  "API_REQUEST_FAILED"
]);

// Basic SSRF protection list for demonstration
const BLOCKED_IPS = ["127.0.0.1", "localhost", "169.254.169.254", "0.0.0.0", "10.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31."];

export class ApiExecutor implements ExecutionCapability {
  public readonly recoveryStrategy = "EXPONENTIAL_BACKOFF";

  canExecute(step: WorkflowV2Step): boolean {
    return step.target === "API";
  }

  async execute(step: WorkflowV2Step, context: RuntimeContext): Promise<ExecutionResult> {
    if (step.operation !== "CALL_API") {
      return { state: "FAILED", message: "ApiExecutor only supports CALL_API" };
    }

    const resolver = new VariableResolver(context);
    
    // Resolve basic args to parse with schema
    const rawArgs = {
      url: resolver.resolve(step.args?.url),
      method: String(step.args?.method || "GET").toUpperCase(),
      headers: typeof step.args?.headers === "object" ? resolver.resolve(step.args?.headers) : {},
      body: step.args?.body,
      timeoutMs: step.args?.timeoutMs,
      retryCount: step.args?.retryCount,
      authConnectionId: step.args?.authConnectionId,
      successCondition: step.args?.successCondition
    };

    const parseResult = ApiInputSchema.safeParse(rawArgs);
    if (!parseResult.success) {
      return { state: "FAILED", message: `Invalid API Inputs: ${parseResult.error.message}` };
    }

    const { url, method, headers = {}, body, timeoutMs, retryCount, authConnectionId, successCondition } = parseResult.data;

    try {
      // SSRF check
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        throw new Error("Invalid protocol. Only http and https are allowed.");
      }

      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      if (BLOCKED_IPS.some(ip => hostname === ip || hostname.startsWith(ip))) {
        throw new Error("SSRF Protection: Access to internal network is blocked");
      }

      // Dynamic Auth Injection (Resolves tokens from context securely)
      if (authConnectionId) {
        const token = context.get(`__connection_${authConnectionId}_token`);
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
      }

      // Idempotency injection for Mutations
      if (method !== "GET" && method !== "HEAD") {
        const idempotencyKey = `${context.executionMetadata.runId}_${step.id}`;
        headers["Idempotency-Key"] = idempotencyKey;
      }

      let attempt = 0;
      let lastError: Error | null = null;
      let response: Response | null = null;

      while (attempt <= retryCount) {
        attempt++;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const fetchOptions: RequestInit = {
          method,
          headers: headers as Record<string, string>,
          signal: controller.signal
        };

        if (method !== "GET" && method !== "HEAD") {
          fetchOptions.body = typeof body === "string" ? resolver.resolve(body) : JSON.stringify(resolver.resolve(body));
        }

        try {
          // Emit audit event
          logger.info({ event: ApiAuditEvents.enum.API_REQUEST_STARTED, url, method, attempt }, "API request started");
          
          response = await fetch(url, fetchOptions);
          clearTimeout(timeoutId);

          if (response.ok || (response.status >= 400 && response.status < 500)) {
            // Success or Client Error (don't retry client errors unless 429)
            if (response.status !== 429) break; 
          }
          
          // Retryable status codes (429, 5xx)
          if (attempt <= retryCount) {
            logger.warn({ event: ApiAuditEvents.enum.API_REQUEST_RETRY, url, status: response.status }, "API request retrying");
            const backoff = Math.min(1000 * Math.pow(2, attempt), 10000);
            await new Promise(r => setTimeout(r, backoff));
          }
        } catch (e: any) {
          clearTimeout(timeoutId);
          lastError = e;
          if (e.name === 'AbortError' && attempt <= retryCount) {
             logger.warn({ event: ApiAuditEvents.enum.API_REQUEST_RETRY, url, reason: "timeout" }, "API request retrying after timeout");
             continue;
          }
          break; // Stop on network fatal
        }
      }

      if (!response) {
        logger.error({ event: ApiAuditEvents.enum.API_REQUEST_FAILED, url, error: lastError?.message }, "API request failed completely");
        return { state: "FAILED", message: lastError?.message || "API request failed completely" };
      }

      const contentType = response.headers.get("content-type");
      let data;
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => { responseHeaders[k] = v; });

      const finalResult = { status: response.status, data, headers: responseHeaders };

      if (!response.ok) {
        logger.error({ event: ApiAuditEvents.enum.API_REQUEST_FAILED, url, status: response.status }, "API request returned error status");
        return { state: "FAILED", message: `API request failed with status ${response.status}: ${JSON.stringify(data)}` };
      }

      // Adversarial Fix: Check for application-layer success conditions
      if (successCondition && data) {
        try {
          // Extremely simple evaluator using Function constructor (in a real system this would be an isolated sandbox or JSONPath expression)
          // E.g. successCondition: "data.success === true"
          const evaluate = new Function('data', `return ${successCondition};`);
          const isBusinessSuccess = evaluate(data);
          if (!isBusinessSuccess) {
             logger.error({ event: ApiAuditEvents.enum.API_REQUEST_FAILED, url, reason: "successCondition failed" }, "API request succeeded HTTP but failed business rules");
             return { state: "FAILED", message: `Application error (200 OK): successCondition '${successCondition}' evaluated to false. Payload: ${JSON.stringify(data)}` };
          }
        } catch (e: any) {
          return { state: "FAILED", message: `Failed to evaluate successCondition: ${e.message}` };
        }
      }

      logger.info({ event: ApiAuditEvents.enum.API_REQUEST_SUCCEEDED, url, status: response.status }, "API request succeeded");
      return {
        state: "SUCCEEDED",
        outputs: step.bind_result_to ? { [step.bind_result_to]: finalResult } : finalResult
      };
    } catch (e: any) {
      return { state: "FAILED", message: e.message };
    }
  }
}
