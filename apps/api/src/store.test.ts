import { describe, expect, it } from "vitest";
import type { AuthContext } from "@ghost/shared-types";
import { InMemoryStore } from "./store.js";

describe("InMemoryStore execution state handling", () => {
  const auth: AuthContext = { userId: "user-1", tenantId: "tenant-1", role: "operator" };

  it("claims a queued run only once", async () => {
    const store = new InMemoryStore();
    const run = await store.createRun(auth, "workflow-version-1");

    const firstClaim = await store.claimRun(auth, run.id);
    const secondClaim = await store.claimRun(auth, run.id);

    expect(firstClaim?.state).toBe("STARTING");
    expect(secondClaim).toBeUndefined();
  });

  it("rejects illegal execution state transitions", async () => {
    const store = new InMemoryStore();
    const run = await store.createRun(auth, "workflow-version-2");

    const updated = await store.updateRunState(auth, run.id, "SUCCEEDED");

    expect(updated).toBeUndefined();
  });
});
