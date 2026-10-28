import pino from "pino";
import { sanitizeLogMetadata } from "@ghost/security";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: ["req.headers.authorization", "*.password", "*.token", "*.secret", "*.apiKey"],
    censor: "[REDACTED]"
  },
  formatters: {
    log(object) {
      return sanitizeLogMetadata(object) as Record<string, unknown>;
    }
  }
});

export function createRequestId(): string {
  return crypto.randomUUID();
}
