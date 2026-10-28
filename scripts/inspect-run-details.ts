import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const runId = "05c5381b-40d3-48a4-bde8-d912f6c72c4a";

  const { data: steps } = await sb.from("execution_steps").select("*").eq("run_id", runId).order("created_at", { ascending: true });
  console.log(`=== RUN STEPS (${steps?.length || 0}) ===`);
  steps?.forEach((s: any, idx: number) => {
    console.log(`Step ${idx + 1}: [${s.step_id}] state=${s.state}, error=${s.error_message}`);
    console.log(`  output:`, JSON.stringify(s.output_data));
  });

  const { data: hitl } = await sb.from("hitl_requests").select("*").eq("run_id", runId);
  console.log(`\n=== HITL REQUESTS (${hitl?.length || 0}) ===`);
  console.log(JSON.stringify(hitl, null, 2));
}

main().catch(console.error);
