import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data } = await sb.from("execution_steps").select("*").eq("run_id", "d1affb21-c3fc-4671-84ad-9659ceafaead");
  for (const s of data || []) {
    const shot = s.metadata?.outputs?.screenshotUrl || s.metadata?.outputs?.screenshot;
    if (shot && shot.startsWith("data:image")) {
      const base64Data = shot.replace(/^data:image\/\w+;base64,/, "");
      const outPath = `C:/Users/dhruv/.gemini/antigravity-ide/brain/ea1500ab-70de-41b6-a2bd-fc8c3e3f0dfb/${s.step_id}_live_execution.png`;
      fs.writeFileSync(outPath, Buffer.from(base64Data, "base64"));
      console.log(`Saved screenshot for ${s.step_id} to ${outPath}`);
    }
  }
}

main().catch(console.error);
