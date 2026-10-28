import { AppStore } from "./store.js";
import { logger } from "@ghost/observability";

export interface QueueTask {
  id: string;
  type: "RUN_WORKER" | "WEBHOOK_DELIVERY";
  payload: any;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  retryCount: number;
  scheduledFor: string;
}

/**
 * A lightweight queue implementation using Supabase (or InMemory fallback)
 * Instead of setting up Redis/BullMQ right now, this provides a durable,
 * persistent queue that integrates directly with our existing store structure.
 */
export class TaskQueue {
  constructor(private store: AppStore) {}

  async enqueue(tenantId: string, type: QueueTask["type"], payload: any, delayMs: number = 0): Promise<string> {
    const taskId = await this.store.enqueueTask(tenantId, type, payload, delayMs);
    logger.info({ taskId, type, tenantId }, "Task enqueued to durable store");
    return taskId;
  }

  async poll(limit: number = 10): Promise<(QueueTask & { tenantId: string })[]> {
    return this.store.pollTasks(limit);
  }

  async complete(taskId: string): Promise<void> {
    await this.store.completeTask(taskId);
    logger.info({ taskId }, "Task completed in durable store");
  }

  async fail(taskId: string, error: unknown): Promise<void> {
    await this.store.failTask(taskId, error);
    logger.error({ taskId, err: error }, "Task failed in durable store");
  }
}
