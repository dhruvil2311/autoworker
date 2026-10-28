import { createStore } from "../../../api/dist/store.js";
import { loadConfig } from "../../../api/dist/config.js";
import type { WorkflowV2 } from "@ghost/workflow-schema";
import crypto from "crypto";

async function request(method: string, endpoint: string, body?: any, token?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  if (token) headers["authorization"] = `Bearer ${token}`;
  
  const res = await fetch(`http://localhost:4000/api/v1${endpoint}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`API Error ${res.status} ${endpoint}: ${JSON.stringify(data)}`);
  return data;
}

async function queueRun() {
  const config = loadConfig();
  const store = createStore(config);

  const loginRes = await request("POST", "/auth/dev/login", { email: "admin@ghost.local", password: "Ghost@123456" });
  let token = loginRes.token;
  const authRes = await request("POST", "/auth/bootstrap", undefined, token);
  
  const tenantId = authRes.organization?.id;
  const userId = authRes.user?.id;
  if (!tenantId || !userId) throw new Error("Could not bootstrap tenant");
  console.log("Using Tenant:", tenantId);

  const auth = { tenantId, userId, role: "system" as any };

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(config.supabaseUrl!, config.supabaseServiceRoleKey!);

  // 1. Create a worker
  const workerId = crypto.randomUUID();
  const { error: wErr } = await supabase.from("ghost_workers").insert({
    id: workerId,
    tenant_id: auth.tenantId,
    name: "SauceDemo Runner",
    description: "Acceptance Test",
    status: "ACTIVE",
    trigger_type: "MANUAL",
    analysis_stage: "COMPLETED",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  if (wErr) throw wErr;
  console.log("Created Worker:", workerId);

  // 2. Create Workflow
  const workflowId = crypto.randomUUID();
  const { error: wfErr } = await supabase.from("workflows").insert({
    id: workflowId,
    tenant_id: auth.tenantId,
    name: "SauceDemo Workflow",
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  if (wfErr) throw wfErr;

  // 3. Create Workflow Version with SauceDemo SOP
  const workflowDefinition: WorkflowV2 = {
    workflow_version: "2.0",
    status: "ACTIVE",
    name: "SauceDemo E2E",
    description: "Perform SauceDemo acceptance",
    variables: [],
    secrets: [],
    expected_domains: ["www.saucedemo.com"],
    compiler: { version: "3.5", source_specification_id: "none", compiled_at: new Date().toISOString() },
    root_step: {
      id: "root",
      operation: "SEQUENCE", description: "Root", target: "PLATFORM_ADAPTER",
      children: [
        { id: "s1", operation: "NAVIGATE", description: "Open SauceDemo", target: "BROWSER_DETERMINISTIC", args: { url: "https://www.saucedemo.com/" } },
        { id: "s2", operation: "TYPE", description: "Enter username", target: "BROWSER_DETERMINISTIC", args: { selector: "#user-name", value: "standard_user" } },
        { id: "s3", operation: "TYPE", description: "Enter password", target: "BROWSER_DETERMINISTIC", args: { selector: "#password", value: "secret_sauce" } },
        { id: "s4", operation: "CLICK", description: "Click Login", target: "BROWSER_DETERMINISTIC", args: { selector: "#login-button" } },
        { id: "s5", operation: "EXTRACT", description: "Verify inventory", target: "BROWSER_DETERMINISTIC", args: { selector: ".title" }, bind_result_to: "inventory_title" },
        { id: "s6", operation: "CLICK", description: "Sort low to high", target: "BROWSER_SEMANTIC", args: { instruction: "Change the product sort order to Price (low to high) using the dropdown on the top right" } },
        { id: "s7", operation: "CLICK", description: "Open Sauce Labs Backpack", target: "BROWSER_DETERMINISTIC", args: { selector: "#item_4_title_link" } },
        { id: "s8", operation: "CLICK", description: "Return to inventory", target: "BROWSER_DETERMINISTIC", args: { selector: "#back-to-products" } },
        { id: "s9", operation: "CLICK", description: "Add Backpack to cart", target: "BROWSER_DETERMINISTIC", args: { selector: "#add-to-cart-sauce-labs-backpack" } },
        { id: "s10", operation: "CLICK", description: "Open cart", target: "BROWSER_DETERMINISTIC", args: { selector: ".shopping_cart_link" } },
        { id: "s11", operation: "EXTRACT", description: "Verify Backpack in cart", target: "BROWSER_DETERMINISTIC", args: { selector: ".inventory_item_name" }, bind_result_to: "cart_item" },
        { id: "s12", operation: "CLICK", description: "Remove product", target: "BROWSER_DETERMINISTIC", args: { selector: "#remove-sauce-labs-backpack" } },
        { id: "s13", operation: "CLICK", description: "Open menu", target: "BROWSER_DETERMINISTIC", args: { selector: "#react-burger-menu-btn" } },
        { id: "s14", operation: "WAIT", description: "Wait for menu", target: "BROWSER_DETERMINISTIC", args: { timeout: 1000 } },
        { id: "s15", operation: "CLICK", description: "Log out", target: "BROWSER_DETERMINISTIC", args: { selector: "#logout_sidebar_link" } }
      ]
    }
  };

  const versionId = crypto.randomUUID();
  const { error: wvErr } = await supabase.from("workflow_versions").insert({
    id: versionId,
    tenant_id: auth.tenantId,
    workflow_id: workflowId,
    version: 1,
    schema_version: "2.0",
    compiler_version: "3.5",
    compiler_model: "test_model",
    definition: workflowDefinition as any,
    created_at: new Date().toISOString()
  });
  if (wvErr) throw wvErr;

  await supabase.from("ghost_workers").update({ workflow_id: workflowId, active_version_id: versionId }).eq("id", workerId);
  console.log("Created Workflow Version:", versionId);

  // 4. Enqueue Run using the API!
  const run1Res = await request("POST", `/ghost-workers/${workerId}/run`, {
    inputs: { url: "https://www.saucedemo.com/" }
  }, `dev:${auth.userId}:${auth.tenantId}:owner`);
  console.log(`🚀 Enqueued Run via API: ${run1Res.runId}`);
  
  console.log("BROWSER MODE: HEADED");
  console.log("BROWSER ENGINE: Playwright (Local Chromium)");
  console.log("EXECUTOR: V2BrowserExecutor -> Stagehand/Playwright");
  console.log("TARGET: https://www.saucedemo.com/");
  console.log("The worker polling process will now pick this up and execute it headed!");
}

queueRun().catch(console.error);
