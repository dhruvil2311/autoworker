import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const versionId = "0781ea1a-dd56-47fe-ad1f-a3f2267706db";
  const { data: v, error } = await sb.from("workflow_versions").select("*").eq("id", versionId).single();
  if (error) {
    console.error("Error fetching version:", error);
    return;
  }

  const steps = v.definition?.root_step?.children || [];
  console.log(`=== COMPILED WORKFLOW STEPS (${steps.length}) ===`);
  steps.forEach((s: any, idx: number) => {
    console.log(`Step ${idx + 1}: [${s.operation}] ${s.description}`);
    console.log(`  args:`, JSON.stringify(s.args));
  });

  const { data: worker } = await sb.from("ghost_workers").select("id, name, status, active_version_id, updated_at").eq("id", "fc7bd603-082d-41b4-ba10-52e306e9caea").single();
  console.log("\n=== WORKER STATE ===");
  console.log(worker);

  const { data: runs } = await sb.from("execution_runs").select("id, state, created_at, result_summary").eq("worker_id", "fc7bd603-082d-41b4-ba10-52e306e9caea");
  console.log(`\n=== REMAINING RUNS (${runs?.length || 0}) ===`);
  runs?.forEach((r: any) => console.log(`- ${r.id} (${r.state}): ${r.result_summary}`));
}

main().catch(console.error);
