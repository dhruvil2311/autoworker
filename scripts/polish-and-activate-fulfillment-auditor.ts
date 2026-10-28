import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const versionId = "0781ea1a-dd56-47fe-ad1f-a3f2267706db";
  const workerId = "fc7bd603-082d-41b4-ba10-52e306e9caea";
  const siblingId = "33e4bddb-0e91-49e5-97a0-bf3a873f5123";

  // 1. Fetch current version definition
  const { data: v } = await sb.from("workflow_versions").select("*").eq("id", versionId).single();
  if (!v) throw new Error("Version not found");

  const definition = v.definition;
  const children = definition.root_step.children;

  // Enhance Step 2 selector for precise matching on SVKM portal
  if (children[1]) {
    children[1].description = "Enter Username";
    children[1].args.selector = "#userName, input[name='username'], input[placeholder*='Username' i], input[type='text']";
    children[1].args.value = "70092400c";
  }

  // Enhance Step 3 selector
  if (children[2]) {
    children[2].description = "Verify SVKM Login Portal";
    children[2].args.selector = "input[type='submit'], .loginBtn, input[value='Login'], #userLogin, button[type='submit']";
    children[2].args.instruction = "Verify SVKM NMIMS University login portal loaded with username entered";
  }

  // Update workflow version in Supabase
  await sb.from("workflow_versions").update({
    definition
  }).eq("id", versionId);
  console.log("Updated workflow_version definition.");

  // 2. Set worker status to ACTIVE and ensure active_version_id is set
  await sb.from("ghost_workers").update({
    status: "ACTIVE",
    active_version_id: versionId
  }).eq("id", workerId);

  await sb.from("ghost_workers").update({
    status: "ACTIVE",
    active_version_id: versionId
  }).eq("id", siblingId);

  // 3. Purge all old runs for both worker IDs
  const { data: oldRuns } = await sb.from("execution_runs").select("id").in("worker_id", [workerId, siblingId]);
  if (oldRuns && oldRuns.length > 0) {
    const runIds = oldRuns.map(r => r.id);
    await sb.from("execution_steps").delete().in("run_id", runIds);
    await sb.from("hitl_requests").delete().in("run_id", runIds);
    await sb.from("execution_runs").delete().in("id", runIds);
    console.log(`Purged ${runIds.length} stale runs for Fulfillment Auditor workers.`);
  } else {
    console.log("No stale runs remaining.");
  }

  console.log("Fulfillment Auditor is now ACTIVE and synchronized with video demonstration workflow.");
}

main().catch(console.error);
