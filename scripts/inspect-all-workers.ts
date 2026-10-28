import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: workers } = await supabase.from("ghost_workers").select("*");
  console.log("=== ALL WORKERS (" + workers?.length + ") ===");
  for (const w of workers || []) {
    console.log(`Worker: [${w.id}] "${w.name}" - status: ${w.status}, version: ${w.active_version_id}, recording_id: ${w.recording_id}`);
    const { data: docs } = await supabase.from("documents").select("id, name, type, storage_path").eq("worker_id", w.id);
    if (docs?.length) {
      console.log(`  Docs:`, docs);
    }
  }

  const { data: recordings } = await supabase.from("recordings").select("id, name, status, file_path, storage_path, duration_seconds, metadata");
  console.log("=== ALL RECORDINGS (" + recordings?.length + ") ===");
  for (const r of recordings || []) {
    console.log(`Recording: [${r.id}] "${r.name}" - status: ${r.status}, file: ${r.file_path}, storage: ${r.storage_path}`);
  }
}

main().catch(console.error);
