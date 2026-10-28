import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const workerId = "fc7bd603-082d-41b4-ba10-52e306e9caea";

  // 1. Purge all existing runs for this worker so slate is clean
  const { data: oldRuns } = await sb.from("execution_runs").select("id").eq("worker_id", workerId);
  if (oldRuns?.length) {
    const ids = oldRuns.map(r => r.id);
    await sb.from("hitl_requests").delete().in("run_id", ids);
    await sb.from("execution_steps").delete().in("run_id", ids);
    await sb.from("execution_runs").delete().in("id", ids);
    console.log(`Cleared ${ids.length} existing runs.`);
  }

  // 2. Trigger run via API
  const res = await fetch(`http://localhost:4000/api/v1/ghost-workers/${workerId}/run`, {
    method: "POST",
    headers: {
      "Authorization": "Bearer dev:dev-user:6ef50df4-58bb-48e3-9796-d25ba85d4dac:owner",
      "Content-Type": "application/json"
    }
  });

  const resJson = await res.json();
  console.log("Trigger response:", res.status, resJson);

  const runId = resJson.run?.id;
  if (!runId) {
    console.error("No run ID returned!");
    return;
  }

  console.log(`Watching run: ${runId}...`);

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const { data: run } = await sb.from("execution_runs").select("*").eq("id", runId).single();
    console.log(`[${(i + 1) * 2}s] State: ${run?.state}`);

    if (run?.state === "SUCCEEDED" || run?.state === "FAILED" || run?.state === "WAITING_FOR_HUMAN") {
      const { data: steps } = await sb.from("execution_steps").select("*").eq("run_id", runId).order("created_at", { ascending: true });
      console.log(`\n=== FINAL RUN STEPS (${steps?.length || 0}) ===`);
      steps?.forEach((s, idx) => {
        console.log(`Step ${idx + 1}: [${s.step_id}] state=${s.state}, error=${s.error_message || 'none'}`);
        if (s.output_data?.screenshotUrl || s.output_data?.screenshot) {
          console.log(`  Screenshot captured!`);
        }
      });

      if (run?.state === "WAITING_FOR_HUMAN") {
        const { data: hitls } = await sb.from("hitl_requests").select("*").eq("run_id", runId);
        console.log("HITL requests:", hitls);
      }
      break;
    }
  }
}

main().catch(console.error);
