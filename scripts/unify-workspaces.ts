import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });
import { createClient } from "@supabase/supabase-js";

const TARGET_TENANT = "6ef50df4-58bb-48e3-9796-d25ba85d4dac";
const SOURCE_TENANT = "fae45717-c844-4030-8f2a-586909c1a6c4";

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  console.log(`Starting workspace unification: ${SOURCE_TENANT} -> ${TARGET_TENANT}...`);

  // 1. Add admin user to TARGET_TENANT organization_members if not present
  const adminUserId = "3e173143-edac-4814-af27-5f2c0f7702db";
  const { data: existingMember } = await supabase
    .from("organization_members")
    .select("*")
    .eq("organization_id", TARGET_TENANT)
    .eq("user_id", adminUserId)
    .maybeSingle();

  if (!existingMember) {
    console.log("Adding admin user to TARGET_TENANT organization_members...");
    const { error: memberErr } = await supabase.from("organization_members").insert({
      organization_id: TARGET_TENANT,
      user_id: adminUserId,
      role: "owner"
    });
    if (memberErr) console.warn("memberErr:", memberErr.message);
    else console.log("Added admin to TARGET_TENANT.");
  } else {
    console.log("Admin user already member of TARGET_TENANT.");
  }

  // 2. Tables to update tenant_id
  const tables = [
    "workflows",
    "workflow_versions",
    "ghost_workers",
    "execution_runs",
    "execution_steps",
    "worker_documents",
    "ghost_memory",
    "hitl_requests",
    "recordings",
    "recording_events",
    "ghost_worker_schedules",
    "connections"
  ];

  for (const table of tables) {
    const { data: rows, error: selectErr } = await supabase
      .from(table)
      .select("id")
      .eq("tenant_id", SOURCE_TENANT);

    if (selectErr) {
      console.log(`Table ${table} select error or table not found:`, selectErr.message);
      continue;
    }

    if (!rows || rows.length === 0) {
      console.log(`Table ${table}: 0 rows to update.`);
      continue;
    }

    console.log(`Table ${table}: Updating ${rows.length} rows to ${TARGET_TENANT}...`);
    const { error: updateErr } = await supabase
      .from(table)
      .update({ tenant_id: TARGET_TENANT })
      .eq("tenant_id", SOURCE_TENANT);

    if (updateErr) {
      console.error(`Error updating table ${table}:`, updateErr.message);
    } else {
      console.log(`Table ${table}: Successfully updated.`);
    }
  }

  console.log("Unification complete!");
}

main().catch(console.error);
