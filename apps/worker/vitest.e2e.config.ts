import { defineConfig } from "vitest/config";

// Platform end-to-end suite: real web build, API, worker and Chromium. See src/platform.e2e.test.ts.
export default defineConfig({
  test: {
    include: ["src/platform.e2e.test.ts"],
    env: { PLATFORM_E2E: "1" },
    pool: "forks",
    maxWorkers: 1,
    testTimeout: 600_000,
    hookTimeout: 120_000
  }
});
