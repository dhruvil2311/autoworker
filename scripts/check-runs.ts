import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  const { data: runs } = await supabase.from("execution_runs").select("*").order("created_at", { ascending: false }).limit(5);
  for (const r of runs || []) {
    console.log("=== RUN:", r.id, "state:", r.state, "worker_id:", r.worker_id, "version_id:", r.workflow_version_id);
    const { data: version } = await supabase.from("workflow_versions").select("*").eq("id", r.workflow_version_id).single();
    console.log("Workflow Definition:", JSON.stringify(version?.definition, null, 2));
    const { data: steps } = await supabase.from("execution_steps").select("*").eq("run_id", r.id);
    console.log("Execution steps:", steps);
  }
}

check().catch(console.error);
