import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createStore } from "../../api/dist/store.js";
import { loadConfig } from "../../api/dist/config.js";

describe("atomic run claiming concurrency", () => {
  it("prevents multiple workers from claiming the same run", async () => {
    const config = loadConfig();
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) return;
    
    const serviceClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const store = createStore(config);

    const email = `ghost-concurrency-${Date.now()}@example.test`;
    const password = "TemporaryPass123!";
    const createdUser = await serviceClient.auth.admin.createUser({ email, password, email_confirm: true });
    const userId = createdUser.data.user!.id;

    const { data: orgs } = await serviceClient.from("organizations").select("id").limit(1);
    const tenantId = orgs![0]!.id;
    await serviceClient.from("organization_members").insert({ organization_id: tenantId, user_id: userId, role: "owner" });

    try {
      // Just manually insert into workflows, workflow_versions and execution_runs to bypass validation layers
      const workflowId = crypto.randomUUID();
      await serviceClient.from("workflows").insert({ id: workflowId, tenant_id: tenantId, created_by: userId, name: "Test", status: "ACTIVE" });
      
      const versionId = crypto.randomUUID();
      await serviceClient.from("workflow_versions").insert({
        id: versionId,
        tenant_id: tenantId,
        workflow_id: workflowId,
        created_by: userId,
        version: 1,
        schema_version: "1.0",
        compiler_version: "1.0",
        compiler_model: "test",
        definition: {}
      });

      const runId = crypto.randomUUID();
      await serviceClient.from("execution_runs").insert({
        id: runId,
        tenant_id: tenantId,
        created_by: userId,
        workflow_version_id: versionId,
        state: "QUEUED"
      });

      const claims = await Promise.allSettled([
        store.claimRun({ tenantId, userId } as any, runId),
        store.claimRun({ tenantId, userId } as any, runId),
        store.claimRun({ tenantId, userId } as any, runId)
      ]);

      const successfulClaims = claims.filter(c => c.status === "fulfilled" && c.value !== undefined);
      expect(successfulClaims.length).toBe(1);
      
      const finalRun = await store.getRun({ tenantId, userId } as any, runId);
      expect(finalRun?.state).toBe("STARTING");
    } finally {
      await serviceClient.from("organization_members").delete().eq("user_id", userId);
      await serviceClient.auth.admin.deleteUser(userId);
    }
  });
});

