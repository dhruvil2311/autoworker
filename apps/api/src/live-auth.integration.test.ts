import request from "supertest";
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createStore } from "./store.js";

function sampleRecording(recordingId: string) {
  const eventId = crypto.randomUUID();
  return {
    recording_id: recordingId,
    started_at: new Date().toISOString(),
    source: "chrome_extension",
    events: [
      {
        event_id: eventId,
        sequence: 1,
        timestamp: new Date().toISOString(),
        event_type: "click",
        page: { url: "https://example.com/live-auth", title: "Live Auth" },
        target: {
          tag: "button",
          role: "button",
          accessible_name: "Continue",
          selector_candidates: [{ strategy: "css", value: "#continue", confidence: 0.9 }],
          attributes: {},
          nearby_context: []
        },
        input: null,
        screenshot_reference: null,
        viewport: { width: 1280, height: 720 },
        browser: { user_agent: "vitest-live-auth" }
      }
    ],
    metadata: {}
  };
}

describe("live supabase auth integration", () => {
  it.skip(
    "persists a recording through the authenticated API using a real Supabase session",
    async () => {
      const config = loadConfig();
    if (!config.supabaseUrl || !config.supabaseAnonKey || !config.supabaseServiceRoleKey) {
      return;
    }

    const serviceClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    try {
      await serviceClient.from("organizations").select("id").limit(1);
    } catch {
      console.log("Supabase not reachable, skipping test.");
      return;
    }


    const email = `ghost-vitest-${Date.now()}@example.test`;
    const password = "TemporaryPass123!";
    const recordingId = `00000000-0000-4000-8000-${Date.now().toString().slice(-12)}`;

      const createdUser = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { source: "vitest-live-auth" }
      });
      if (createdUser.error) throw createdUser.error;

      const { data: organizations, error: organizationError } = await serviceClient
        .from("organizations")
        .select("id")
        .limit(1);
      if (organizationError) throw organizationError;

      const organizationId = organizations?.[0]?.id;
      if (!organizationId) throw new Error("No organization found for live auth integration test");

      const membershipInsert = await serviceClient.from("organization_members").insert({
        organization_id: organizationId,
        user_id: createdUser.data.user.id,
        role: "owner"
      });
      if (membershipInsert.error) throw membershipInsert.error;

      try {
        const anonClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
          auth: { persistSession: false, autoRefreshToken: false }
        });
        const signIn = await anonClient.auth.signInWithPassword({ email, password });
        if (signIn.error || !signIn.data.session) throw signIn.error ?? new Error("No Supabase session returned");

        const app = createApp(config, createStore(config));
        const response = await request(app)
          .post("/api/v1/recordings")
          .set("Authorization", `Bearer ${signIn.data.session.access_token}`)
          .send(sampleRecording(recordingId));

        expect(response.status).toBe(201);
        expect(response.body.recording_id).toBe(recordingId);

        const listResponse = await request(app)
          .get("/api/v1/recordings")
          .set("Authorization", `Bearer ${signIn.data.session.access_token}`);

        expect(listResponse.status).toBe(200);
        expect(Array.isArray(listResponse.body.recordings)).toBe(true);
      } finally {
        await serviceClient.from("organization_members").delete().eq("user_id", createdUser.data.user.id);
        await serviceClient.auth.admin.deleteUser(createdUser.data.user.id);
      }
    }, 20_000
  );
});
