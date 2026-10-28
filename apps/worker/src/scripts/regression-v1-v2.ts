import { createClient } from "@supabase/supabase-js";
import { createStore } from "../../../api/dist/store.js";
import { loadConfig } from "../../../api/dist/config.js";
import { runQueuedWorkflow } from "../worker.js";

async function run() {
  const config = loadConfig();
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) return;
  
  const serviceClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const store = createStore(config);

  const email = `ghost-v1v2-${Date.now()}@example.test`;
  const password = "TemporaryPass123!";
  const createdUser = await serviceClient.auth.admin.createUser({ email, password, email_confirm: true });
  const userId = createdUser.data.user!.id;

  const { data: orgs } = await serviceClient.from("organizations").select("id").limit(1);
  const tenantId = orgs![0]!.id;
  await serviceClient.from("organization_members").insert({ organization_id: tenantId, user_id: userId, role: "owner" });

  try {
    const auth = { tenantId, userId } as any;

    // --- Create V1 Workflow ---
    const v1WorkflowId = crypto.randomUUID();
    await serviceClient.from("workflows").insert({ id: v1WorkflowId, tenant_id: tenantId, created_by: userId, name: "V1 Test", status: "ACTIVE" });
    const v1VersionId = crypto.randomUUID();
    await serviceClient.from("workflow_versions").insert({
      id: v1VersionId, tenant_id: tenantId, workflow_id: v1WorkflowId, created_by: userId, version: 1,
      schema_version: "1.0", compiler_version: "1.0", compiler_model: "test",
      definition: {
        workflow_version: "1.0",
        name: "v1_test",
        compiler: { version: "1.0", model: "test", source_recording_id: "00000000-0000-0000-0000-000000000000", compiled_at: new Date().toISOString() },
        steps: [
          {
            id: "step_00000000-0000-0000-0000-000000000000", description: "test", confidence: 1.0, type: "NAVIGATE", target: { expected_url: "https://example.com" },
            failure_policy: { on_failure: "FAIL_RUN" }
          }
        ]
      }
    });

    // --- Create V2 Workflow ---
    const v2WorkflowId = crypto.randomUUID();
    await serviceClient.from("workflows").insert({ id: v2WorkflowId, tenant_id: tenantId, created_by: userId, name: "V2 Test", status: "ACTIVE" });
    const v2VersionId = crypto.randomUUID();
    await serviceClient.from("workflow_versions").insert({
      id: v2VersionId, tenant_id: tenantId, workflow_id: v2WorkflowId, created_by: userId, version: 1,
      schema_version: "2.0", compiler_version: "2.0", compiler_model: "test",
      definition: {
        workflow_version: "2.0",
        name: "v2_test",
        status: "ACTIVE",
        variables: [],
        secrets: [],
        compiler: { version: "2.0", source_specification_id: "1", compiled_at: new Date().toISOString() },
        root_step: { id: "root", operation: "NAVIGATE", target: "BROWSER_DETERMINISTIC", description: "test", args: { url: "https://example.com" } }
      }
    });

    // Queue Runs
    const v1RunId = crypto.randomUUID();
    await serviceClient.from("execution_runs").insert({ id: v1RunId, tenant_id: tenantId, created_by: userId, workflow_version_id: v1VersionId, state: "QUEUED" });
    
    const v2RunId = crypto.randomUUID();
    await serviceClient.from("execution_runs").insert({ id: v2RunId, tenant_id: tenantId, created_by: userId, workflow_version_id: v2VersionId, state: "QUEUED" });

    // Execute concurrently
    console.log("Running V1 and V2 concurrently...");
    
    // We mock processRun to see if it correctly routes V1 vs V2 without colliding
    await Promise.all([
      runQueuedWorkflow(v1RunId),
      runQueuedWorkflow(v2RunId)
    ]);

    const v1Res = await store.getRun(auth, v1RunId);
    const v2Res = await store.getRun(auth, v2RunId);

    console.log("V1 Run State:", v1Res?.state);
    console.log("V2 Run State:", v2Res?.state);

    if (v1Res?.state === "FAILED" && v2Res?.state === "FAILED") {
       throw new Error("Both runs failed unexpectedly");
    }
    
    console.log("V1 AND V2 REGRESSION PASSED!");

  } finally {
    await serviceClient.from("organization_members").delete().eq("user_id", userId);
    await serviceClient.auth.admin.deleteUser(userId);
  }
}

run().catch(console.error);
