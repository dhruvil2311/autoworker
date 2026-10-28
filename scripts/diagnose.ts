import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function diagnose() {
  console.log("Checking Supabase connection...");
  const { data: workers, error: wErr } = await supabase.from("ghost_workers").select("*");
  if (wErr) {
    console.error("Workers error:", wErr);
  } else {
    console.log(`Found ${workers.length} workers:`);
    for (const w of workers) {
      console.log(`- Worker: ${w.name} (${w.id}), status: ${w.status}, active_version_id: ${w.active_version_id}`);
    }
  }

  const { data: runs, error: rErr } = await supabase.from("execution_runs").select("*").order("created_at", { ascending: false }).limit(10);
  if (rErr) {
    console.error("Runs error:", rErr);
  } else {
    console.log(`\nFound ${runs.length} recent runs:`);
    for (const r of runs) {
      console.log(`- Run: ${r.id}, state: ${r.state}, worker_id: ${r.worker_id}, version: ${r.workflow_version_id}, error/metadata: ${JSON.stringify(r.metadata || r.session_metadata)}`);
    }
  }

  const { data: queued, error: qErr } = await supabase.from("execution_runs").select("id, tenant_id, state").eq("state", "QUEUED");
  console.log(`\nQUEUED runs count: ${queued?.length}`);
  if (queued && queued.length > 0) {
    console.log("Queued runs:", queued);
  }
}

diagnose().catch(console.error);
