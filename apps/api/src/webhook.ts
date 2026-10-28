import crypto from "node:crypto";

/**
 * HMAC-SHA256 webhook signing for Ghost Worker event notifications.
 * Implements timestamp + event_id + signature to prevent replay attacks.
 */

export interface WebhookPayload {
  event_id: string;
  event_type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface SignedWebhookHeaders {
  "x-ghost-event-id": string;
  "x-ghost-timestamp": string;
  "x-ghost-signature": string;
}

export function signWebhookPayload(payload: WebhookPayload, secret: string): SignedWebhookHeaders {
  const signatureInput = `${payload.timestamp}.${payload.event_id}.${JSON.stringify(payload.data)}`;
  const signature = crypto.createHmac("sha256", secret).update(signatureInput).digest("hex");

  return {
    "x-ghost-event-id": payload.event_id,
    "x-ghost-timestamp": payload.timestamp,
    "x-ghost-signature": `sha256=${signature}`
  };
}

export function verifyWebhookSignature(
  payload: WebhookPayload,
  signature: string,
  secret: string,
  maxAgeSeconds: number = 300
): boolean {
  // Check timestamp freshness (prevent replay)
  const payloadTime = new Date(payload.timestamp).getTime();
  const now = Date.now();
  if (Math.abs(now - payloadTime) > maxAgeSeconds * 1000) {
    return false;
  }

  const signatureInput = `${payload.timestamp}.${payload.event_id}.${JSON.stringify(payload.data)}`;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(signatureInput).digest("hex")}`;

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function createWebhookPayload(
  eventType: string,
  data: Record<string, unknown>
): WebhookPayload {
  return {
    event_id: crypto.randomUUID(),
    event_type: eventType,
    timestamp: new Date().toISOString(),
    data
  };
}
