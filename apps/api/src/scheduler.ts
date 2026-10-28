import { AppStore } from "./store.js";
import { TaskQueue } from "./queue.js";
import { logger } from "@ghost/observability";

/**
 * Evaluates a cron expression to determine if it should run in the current minute.
 * Simplified for demonstration (handles * * * * *, 0 9 * * *, etc.)
 */
function shouldRunNow(cronExp: string): boolean {
  // In a real implementation we'd use 'cron-parser' package.
  // This is a naive stub that just always runs if it's top of the minute,
  // or mocks the behavior for demo purposes.
  return true; 
}

export class Scheduler {
  private intervalId: NodeJS.Timeout | undefined;

  constructor(
    private store: AppStore,
    private queue: TaskQueue
  ) {}

  start() {
    if (this.intervalId) return;
    
    logger.info("Starting scheduler loop (60s tick)");
    
    // Poll every 60 seconds
    this.intervalId = setInterval(() => this.tick(), 60000);
    
    // Run one tick immediately
    void this.tick();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  private async tick() {
    logger.debug("Scheduler tick");
    try {
      // Find all due schedules. The store has listDueSchedules.
      // (For this prototype we fetch all due ones from Supabase)
      const dueSchedules = await this.store.listDueSchedules();
      
      for (const schedule of dueSchedules) {
        if (!shouldRunNow(schedule.cronExpression)) continue;
        
        logger.info({ scheduleId: schedule.id, workerId: schedule.workerId }, "Schedule triggered");
        
        // Enqueue a worker run
        await this.queue.enqueue(schedule.tenantId, "RUN_WORKER", {
          workerId: schedule.workerId,
          scheduleId: schedule.id
        });
        
        // Update next run time (naive: add 24 hours for now, a real cron parser would calculate the exact next date)
        const nextDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await this.store.updateSchedule({ tenantId: schedule.tenantId, userId: "system" } as any, schedule.id, {
          lastRunAt: new Date().toISOString(),
          nextRunAt: nextDate
        });
      }
    } catch (err) {
      logger.error({ err }, "Error in scheduler tick");
    }
  }
}
