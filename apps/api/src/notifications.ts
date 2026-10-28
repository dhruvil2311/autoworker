import { logger } from "@ghost/observability";
import type { AppStore } from "./store.js";
import type { AuthContext } from "@ghost/shared-types";
import { createWebhookPayload, signWebhookPayload } from "./webhook.js";

export type NotificationType =
  | "RUN_COMPLETED"
  | "RUN_FAILED"
  | "NEEDS_ATTENTION"
  | "EXCEPTION_CREATED"
  | "WORKER_ACTIVATED"
  | "TEST_COMPLETED";

export type NotificationChannel = "in_app" | "email" | "webhook";

export interface NotificationRequest {
  type: NotificationType;
  title: string;
  body?: string;
  resourceType?: string;
  resourceId?: string;
}

const SETTINGS_KEY_BY_TYPE: Partial<Record<NotificationType, string>> = {
  RUN_COMPLETED: "notify_on_run_completed",
  RUN_FAILED: "notify_on_run_failed",
  TEST_COMPLETED: "notify_on_run_completed",
  NEEDS_ATTENTION: "notify_on_needs_attention",
  EXCEPTION_CREATED: "notify_on_needs_attention"
};

export async function sendNotification(
  store: AppStore,
  auth: AuthContext,
  request: NotificationRequest,
  channels: NotificationChannel[] = ["in_app"]
): Promise<void> {
  for (const channel of channels) {
    try {
      if (channel === "in_app") {
        await store.createNotification(auth, {
          type: request.type,
          channel: "in_app",
          title: request.title,
          ...(request.body !== undefined && { body: request.body }),
          ...(request.resourceType !== undefined && { resourceType: request.resourceType }),
          ...(request.resourceId !== undefined && { resourceId: request.resourceId })
        });
      }

      if (channel === "webhook") {
        // Webhook dispatch would be wired here with the webhook endpoints from DB
        logger.info({ type: request.type }, "webhook_notification_queued");
      }
    } catch (err) {
      logger.warn({ err, channel, type: request.type }, "notification_send_failed");
    }
  }
}

export function sanitizeEventPayload(data: Record<string, unknown>): Record<string, unknown> {
  const safe = { ...data };
  // Never include secrets, tokens, or raw runtime state
  const sensitiveKeys = ["token", "secret", "password", "key", "credential", "session_id", "cookie"];
  for (const key of Object.keys(safe)) {
    if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
      delete safe[key];
    }
  }
  return safe;
}
