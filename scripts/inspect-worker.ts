import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const workerId = "fc7bd603-082d-41b4-ba10-52e306e9caea";
  const { data: worker, error: wErr } = await supabase.from("ghost_workers").select("*").eq("id", workerId).single();
  if (wErr) {
    console.error("Worker fetch error:", wErr);
    return;
  }
  console.log("Worker:", {
    id: worker.id,
    name: worker.name,
    status: worker.status,
    workflowId: worker.workflow_id,
    activeVersionId: worker.active_version_id,
    bpsId: worker.bps_id
  });

  if (worker.active_version_id) {
    const { data: version } = await supabase.from("workflow_versions").select("*").eq("id", worker.active_version_id).single();
    console.log("Active Version ID:", version?.id);
    const def = version?.definition;
    const steps = def?.steps || def?.root_step?.children || [];
    console.log("Steps count:", steps.length);
    steps.forEach((s: any, idx: number) => {
      console.log(`Step ${idx}:`, s.id, s.operation, s.description, s.args);
    });
  }

  if (worker.bps_id) {
    const { data: bps } = await supabase.from("business_process_specifications").select("*").eq("id", worker.bps_id).single();
    console.log("BPS Status:", bps?.status, "Steps in spec:", bps?.specification_json?.steps?.length);
  }
}

run().catch(console.error);
