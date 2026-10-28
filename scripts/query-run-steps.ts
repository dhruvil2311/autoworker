import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const runId = "d1affb21-c3fc-4671-84ad-9659ceafaead";
  const { data: run } = await sb.from("execution_runs").select("*").eq("id", runId).single();
  console.log("=== RUN SUMMARY ===");
  console.log("Run:", run.id, "state:", run.state, "version:", run.workflow_version_id);
  console.log("Result summary:", JSON.stringify(run.result_summary, null, 2));

  const { data: steps } = await sb.from("execution_steps").select("*").eq("run_id", runId).order("created_at", { ascending: true });
  console.log(`\n=== EXECUTION STEPS (${steps?.length || 0}) ===`);
  for (const s of steps || []) {
    console.log(`Step ${s.step_id}: ${s.state}`);
    console.log(`  output:`, JSON.stringify(s.output_data).substring(0, 300));
  }
}

main().catch(console.error);
