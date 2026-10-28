import { describe, it, expect } from "vitest";
import { InMemoryStore } from "../src/store.js";
import { TaskQueue } from "../src/queue.js";

describe("Durable Queue Verification", () => {
  it("enqueues, polls, and fails tasks accurately in the AppStore", async () => {
    const store = new InMemoryStore(); // We use the InMemory implementation of the AppStore interface which mimics the Supabase durable queue
    const queue = new TaskQueue(store);

    const taskId = await queue.enqueue("tenant-1", "RUN_WORKER", { workerId: "w-1" });
    expect(taskId).toBeDefined();

    const polled = await queue.poll(5);
    expect(polled.length).toBe(1);
    expect(polled[0].id).toBe(taskId);
    expect(polled[0].status).toBe("PROCESSING");

    // Fail it
    await queue.fail(taskId, new Error("Test fail"));

    // Verify it doesn't immediately poll again due to backoff
    const polled2 = await queue.poll(5);
    expect(polled2.length).toBe(0); // Due to delayMs / backoff scheduling
  });
});
