import { describe, it, expect, beforeAll } from "vitest";
import { loadConfig } from "../src/config.js";
import { createStore } from "../src/store.js";

describe("Atomic Background Task Queue", () => {
  const config = loadConfig();
  
  // Only run if Supabase is available
  const hasSupabase = Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);

  it.runIf(hasSupabase)("should strictly prevent concurrent workers from claiming the same task", async () => {
    const store = createStore(config); console.log("STORE METHODS", Object.getOwnPropertyNames(Object.getPrototypeOf(store)));
    const tenantId = crypto.randomUUID(); // Isolation for the test

    // Seed 5 tasks
    const taskIds = [];
    for (let i = 0; i < 5; i++) {
      const id = await store.enqueueTask(tenantId, "TEST_TASK", { data: i }, 0);
      taskIds.push(id);
    }

    // Simulate 10 concurrent worker polling requests
    const workerPromises = Array.from({ length: 10 }).map(() => store.pollTasks(2));
    
    // Wait for all to finish
    const results = await Promise.all(workerPromises);
    
    // Flatten the claimed tasks
    const claimedTasks = results.flat();
    
    // Filter to only the tasks we seeded for this tenant (in case other tests run)
    const ourClaimedTasks = claimedTasks.filter(t => t.tenantId === tenantId);

    // Verify exactly 5 tasks were claimed total across all workers
    expect(ourClaimedTasks.length).toBe(5);

    // Verify uniqueness (no task was claimed twice)
    const claimedIds = new Set(ourClaimedTasks.map(t => t.id));
    expect(claimedIds.size).toBe(5);

    // Cleanup
    for (const id of taskIds) {
      await store.completeTask(id).catch(() => {});
    }
  });
});
