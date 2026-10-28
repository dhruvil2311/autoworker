import { AppStore } from "./store.js";
import { TaskQueue } from "./queue.js";
import { logger } from "@ghost/observability";
import { WorkflowCompiler } from "./compiler.js";

// Standard development fallback UUID for queue workers
const DEV_TENANT_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Background worker process that continuously polls the TaskQueue and executes tasks.
 */
export class QueueWorker {
  private isRunning = false;

  constructor(
    private store: AppStore,
    private queue: TaskQueue
  ) {}

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info("Starting QueueWorker background processor");
    void this.loop();
  }

  stop() {
    this.isRunning = false;
  }

  private async loop() {
    while (this.isRunning) {
      try {
        const tasks = await this.queue.poll(5);
        if (tasks.length === 0) {
          // Sleep for 2s before polling again
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        for (const task of tasks) {
          await this.processTask(task);
        }
      } catch (err: any) {
        // Log detailed error information (message & stack trace) to expose SQL or poll failures
        logger.error(
          {
            errorMessage: err?.message || String(err),
            stack: err?.stack,
            code: err?.code,
            details: err?.details
          },
          "QueueWorker loop error"
        );
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }

  private async processTask(task: any) {
    logger.info({ taskId: task.id, type: task.type }, "Processing task");
    
    try {
      if (task.type === "RUN_WORKER") {
        await this.handleRunWorker(task);
      } else if (task.type === "WEBHOOK_DELIVERY") {
        await this.handleWebhook(task);
      } else {
        throw new Error(`Unknown task type: ${task.type}`);
      }
      
      await this.queue.complete(task.id);
    } catch (err) {
      await this.queue.fail(task.id, err);
    }
  }

  private async handleRunWorker(task: any) {
    // Ensure tenantId is a valid UUID fallback if missing or set to legacy string
    const tenantId =
      task.tenantId && task.tenantId !== "dev-tenant"
        ? task.tenantId
        : DEV_TENANT_ID;

    const auth = { tenantId, userId: "00000000-0000-0000-0000-000000000002" } as any;
    const worker = await this.store.getGhostWorker(auth, task.payload.workerId);
    if (!worker || !worker.activeVersionId) {
      throw new Error(`Worker ${task.payload.workerId} not found or has no active version`);
    }
    
    // In a full implementation, this would spawn the actual @ghost/runtime
    // For now, we simulate the run creation.
    const run = await this.store.createRun(auth, worker.activeVersionId, undefined, worker.id, "PRODUCTION");
    
    logger.info({ runId: run.id }, "Successfully spawned execution run from schedule");
  }

  private async handleWebhook(task: any) {
    // Deliver webhook payload
    logger.info({ webhookId: task.payload.webhookId }, "Delivering webhook");
  }
}