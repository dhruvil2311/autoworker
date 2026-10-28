import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { loadConfig } from "./config.js";
import { createStore } from "./store.js";
import { randomUUID } from "node:crypto";
import type { RecordingUpload } from "@ghost/workflow-schema";

describe("Live Supabase Integration (Phase 1B)", () => {
  it("persists recordings securely and enforces tenant isolation", async () => {
    const config = loadConfig();
    const supabaseUrl = config.supabaseUrl;
    const supabaseServiceRoleKey = config.supabaseServiceRoleKey;

    if (!supabaseUrl || !supabaseServiceRoleKey || supabaseUrl.includes("example.com")) {
      console.log("Skipping live Supabase test (external credentials missing)");
      return;
    }

    const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    // Real store backed by Supabase
    const storeConfig = { ...config, allowInMemoryStorage: false, storageProvider: "supabase" as const };
    const store = createStore(storeConfig);

    const tenantA = randomUUID();
    const tenantB = randomUUID();

    // Create tenants
    await adminSupabase.from("organizations").insert([{ id: tenantA, name: "Tenant A" }, { id: tenantB, name: "Tenant B" }]);

    const authA = { tenantId: tenantA, userId: randomUUID(), role: "admin" as const };
    const authB = { tenantId: tenantB, userId: randomUUID(), role: "admin" as const };

    const recordingId = randomUUID();
    const upload: RecordingUpload = {
      recording_id: recordingId,
      started_at: new Date().toISOString(),
      source: "chrome_extension", metadata: {},
      events: []
    };

    try {
      // 1. Tenant A writes a recording
      const result = await store.createRecording(authA, upload);
      expect(result.id).toBe(recordingId);

      // 2. Tenant A reads their recording
      const readA = await store.getRecording(authA, recordingId);
      expect(readA).toBeDefined();
      expect(readA?.tenantId).toBe(tenantA);

      // 3. Tenant B tries to read Tenant A's recording
      const readB = await store.getRecording(authB, recordingId);
      expect(readB).toBeUndefined(); // Store queries always filter by auth.tenantId, ensuring isolation

      // 4. Admin reads (raw check)
      const { data: raw } = await adminSupabase.from("recordings").select("*").eq("id", recordingId).single();
      expect(raw.id).toBe(recordingId);

    } finally {
      // Cleanup
      await adminSupabase.from("organizations").delete().in("id", [tenantA, tenantB]);
    }
  });
});
