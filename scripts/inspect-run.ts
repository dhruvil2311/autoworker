import * as dotenv from "dotenv";
dotenv.config();
import { createStore } from "../apps/api/src/store.js";
import { loadConfig } from "../apps/api/src/config.js";

async function main() {
  const config = loadConfig(process.env);
  const store = createStore(config);
  const auth = {
    userId: "00000000-0000-0000-0000-000000000002",
    tenantId: "6ef50df4-58bb-48e3-9796-d25ba85d4dac",
    role: "admin" as const
  };

  const queryId = process.argv[2] || "ab9319d5";
  const runs = await store.listRuns(auth);
  const run = runs.find(r => r.id.toLowerCase().startsWith(queryId.toLowerCase()));
  console.log("Full Run ID:", run?.id);
  console.log("State in DB:", run?.state);
  const steps = await store.listExecutionSteps(auth, run!.id);
  console.log("Steps count:", steps.length);
  for (const s of steps) {
    console.log(`Step [${s.stepId}] (${s.state}):`);
    console.log("  hasOutputs:", !!s.metadata?.outputs);
    if (s.metadata?.outputs) {
      console.log("  outputs keys:", Object.keys(s.metadata.outputs));
      console.log("  outputs summary:", JSON.stringify(s.metadata.outputs).slice(0, 200));
    }
  }
}

main().catch(console.error);
