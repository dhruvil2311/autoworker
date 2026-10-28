import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const workerId = "fc7bd603-082d-41b4-ba10-52e306e9caea";
  
  const { data: worker } = await supabase.from("ghost_workers").select("*").eq("id", workerId).single();
  console.log("Worker:", JSON.stringify(worker, null, 2));

  const { data: docs } = await supabase.from("documents").select("*").eq("worker_id", workerId);
  console.log("Docs:", JSON.stringify(docs, null, 2));

  const { data: runs } = await supabase.from("execution_runs").select("*").eq("worker_id", workerId);
  console.log("Runs count:", runs?.length);
  for (const r of runs || []) {
    console.log(`- Run ${r.id}: state=${r.state}, version=${r.workflow_version_id}, summary=${r.result_summary}`);
  }

  const { data: siblingRuns } = await supabase.from("execution_runs").select("*").eq("worker_id", "33e4bddb-0e91-49e5-97a0-bf3a873f5123");
  console.log("Sibling runs count:", siblingRuns?.length);
}

main().catch(console.error);
