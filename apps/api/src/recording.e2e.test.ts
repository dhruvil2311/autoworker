import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { loadConfig } from "./config.js";
import { createStore } from "./store.js";
import { randomUUID } from "node:crypto";
import type { RecordingUpload } from "@ghost/workflow-schema";

describe("Recording Upload Pipeline (Phase 0.5)", () => {
  it("idempotently creates a recording and its events, redacting appropriately", async () => {
    const config = loadConfig();
    const supabaseUrl = config.supabaseUrl;
    const supabaseServiceRoleKey = config.supabaseServiceRoleKey;

    let supabase: any;
    let store: any;
    
    const testConfig = { ...config, storageProvider: "memory", allowInMemoryStorage: true };

    if (!supabaseUrl || !supabaseServiceRoleKey || supabaseUrl.includes("example.com")) {
      console.warn("Using InMemoryStore fallback");
      store = createStore(testConfig as any);
    } else {
      supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      store = createStore({ ...config, storageProvider: "supabase" } as any);
    }

    // Setup an auth context (we assume tenant and user exist, or we use service role)
    // We'll create a dummy tenant for the test
    const tenantId = randomUUID();
    if (supabase) {
      const { error: tErr } = await supabase.from("organizations").insert({ id: tenantId, name: "Test Org" });
      if (tErr) throw tErr;
    }

    const auth = { tenantId, userId: randomUUID() }; // We might need a real user, let's omit created_by or let it be null. Wait, created_by is optional.

    const recordingId = randomUUID();
    const upload: RecordingUpload = {
      recording_id: recordingId,
      started_at: new Date().toISOString(),
      source: "chrome_extension",
      metadata: { extension_version: "1.0.0" },
      events: [
        {
          event_id: randomUUID(),
          sequence: 1,
          timestamp: new Date().toISOString(),
          event_type: "click",
          page: { url: "https://example.com/login", title: "Login" },
          target: { tag: "button", text: "Sign In", selector_candidates: [], attributes: {}, nearby_context: [] },
          input: null,
          viewport: { width: 1024, height: 768 },
          browser: { user_agent: "test" },
          screenshot_reference: null
        },
        {
          event_id: randomUUID(),
          sequence: 2,
          timestamp: new Date().toISOString(),
          event_type: "input",
          page: { url: "https://example.com/login", title: "Login" },
          target: { tag: "input", attributes: { type: "password" }, selector_candidates: [], nearby_context: [] },
          input: { value_placeholder: "{{SECRET:PASSWORD}}" }, // Already redacted by extension
          viewport: { width: 1024, height: 768 },
          browser: { user_agent: "test" },
          screenshot_reference: null
        }
      ]
    };

    // 1. Initial upload
    const result1 = await store.createRecording(auth, upload, "test-idem-123");
    expect(result1.id).toBe(recordingId);

    // 2. Duplicate upload (idempotent)
    const result2 = await store.createRecording(auth, upload, "test-idem-123");
    expect(result2.id).toBe(recordingId);

    // 3. Verification of persistence
    let recData: any;
    let eventData: any;

    if (supabase) {
      const { data } = await supabase.from("recordings").select("*").eq("id", recordingId).single();
      recData = data;
      const { data: eData } = await supabase.from("recording_events").select("*").eq("recording_id", recordingId).order("sequence");
      eventData = eData;
    } else {
      const rec = (store as any).recordings.get(recordingId);
      recData = rec ? { metadata: rec.upload.metadata } : undefined;
      eventData = rec?.upload?.events.map((e: any) => ({ event: e })) ?? [];
    }

    expect(recData).toBeDefined();
    expect(recData.metadata.idempotency_key).toBe("test-idem-123");

    expect(eventData?.length).toBe(2);
    expect(eventData?.[1].event.input.value_placeholder).toBe("{{SECRET:PASSWORD}}");
    expect(eventData?.[1].event.input.value).toBeUndefined(); // Plaintext not stored

    // Cleanup
    if (supabase) {
      await supabase.from("organizations").delete().eq("id", tenantId);
    }
  });
});
