import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });
import { createStore } from "../apps/api/src/store.js";
import { loadConfig } from "../apps/api/src/config.js";
import { analyzeFromDocuments } from "../apps/api/src/bpi-service.js";
import { WorkflowCompiler } from "../apps/api/src/compiler.js";
import { RealSemanticBPIProvider } from "../apps/api/src/ai-provider.js";
import { runQueuedWorkflow } from "../apps/worker/src/worker.js";
import { parseSOPText } from "@ghost/bpi";

const SOP_CONTENT = `
Goal: Perform a complete end-to-end acceptance test of saucedemo.com

Instructions:
1. Open https://www.saucedemo.com/
2. Enter: standard_user in the username field.
3. Enter: secret_sauce in the password field.
4. Click Login.
5. Verify inventory page.
6. Open Sauce Labs Backpack.
7. Add Sauce Labs Backpack to cart.
8. Open cart.
9. Verify Sauce Labs Backpack exists.
10. Click Checkout.
11. Enter First Name: Test
12. Enter Last Name: User
13. Enter Postal Code: 400001
14. Click Continue.
15. Verify order summary page.
16. STOP. Do NOT click Finish. Do not place an order.
`.trim();

async function runFullSauceDemoVerification() {
  console.log("===============================================================");
  console.log("AUTOWORKER SAUCEDEMO FULL PIPELINE VERIFICATION");
  console.log("===============================================================");

  const config = loadConfig();
  const store = createStore(config);

  // Authenticate as the user
  const WORKER_ID = "d9caec0c-04d2-4675-9bcb-97fb21fa2eae";
  const auth = {
    tenantId: "fae45717-c844-4030-8f2a-586909c1a6c4",
    userId: "3e173143-edac-4814-af27-5f2c0f7702db"
  };

  const worker = await store.getGhostWorker(auth, WORKER_ID);
  if (!worker) throw new Error(`Worker ${WORKER_ID} not found`);
  console.log(`\n[1] Target Worker: ${worker.name} (id: ${worker.id})`);

  // Clean up older documents for this worker so we have exactly one clean SOP
  const supabase = (store as any).supabase;
  if (supabase) {
    await supabase.from("worker_documents").delete().eq("worker_id", worker.id);
  }

  // 1. Upload new SOP document
  console.log("\n[2] Uploading acceptance SOP document...");
  const parsedSop = parseSOPText(SOP_CONTENT);
  console.log(`    Parsed steps from document: ${parsedSop.steps.length}`);
  const doc = await store.createDocument(auth, {
    workerId: worker.id,
    type: "SOP",
    name: "SauceDemo Acceptance Test.sop",
    parsedJson: { ...parsedSop, rawText: SOP_CONTENT }
  });
  console.log(`    Uploaded Document ID: ${doc.id}`);

  // 2. Analyze documents via BPI
  console.log("\n[3] Running BPI Analysis from documents...");
  const bpiResult = await analyzeFromDocuments(config, store, auth, worker.id);
  console.log(`    BPS Created ID: ${bpiResult.bpsId}, Gaps: ${bpiResult.gaps.length}`);

  const bps = await store.getBPS(auth, bpiResult.bpsId);
  const spec = bps?.specificationJson as any;
  console.log(`    Specification step count: ${spec?.steps?.length}`);

  // 3. Compile BPS into WorkflowV2
  console.log("\n[4] Compiling BPS into WorkflowV2...");
  const aiProvider = new RealSemanticBPIProvider(config);
  const compiler = new WorkflowCompiler(aiProvider);
  const compiledWorkflow = await compiler.compile(spec, { version: "phase3-compiler-1.0" }) as any;
  const stepCount = compiledWorkflow.root_step?.children?.length ?? 0;
  console.log(`    Workflow compiled successfully!`);
  console.log(`    Workflow schema version: ${compiledWorkflow.workflow_version}`);
  console.log(`    Workflow step count: ${stepCount}`);

  if (stepCount < 10) {
    throw new Error(`Expected at least 10 compiled steps, got ${stepCount}`);
  }

  // Print compiled steps
  console.log("\n[5] Compiled Workflow Steps:");
  compiledWorkflow.root_step.children.forEach((s: any, idx: number) => {
    console.log(`    ${idx + 1}. [${s.operation}] ${s.id} -> ${s.description} (selector: ${s.args?.selector ?? "N/A"}, value: ${s.args?.value ?? "N/A"})`);
  });

  // 4. Create new workflow version and link to worker
  console.log("\n[6] Persisting Workflow Version to Database...");
  const version = await store.createWorkflowVersion(auth, compiledWorkflow);
  await store.updateGhostWorker(auth, worker.id, {
    workflowId: version.workflowId,
    activeVersionId: version.id,
    status: "ACTIVE"
  });
  console.log(`    Created Workflow Version ID: ${version.id}`);
  console.log(`    Linked to Worker ${worker.id}`);

  // 5. Create Run (Simulate 'Run Now')
  console.log("\n[7] Triggering Run Now...");
  const run = await store.createRun(auth, version.id, undefined, worker.id, "PRODUCTION");
  console.log(`    Created Execution Run ID: ${run.id}`);
  console.log(`    Initial Run State: ${run.state}`);

  // 6. Execute Run via Worker Runtime
  console.log("\n[8] Executing Run via Worker Runtime in Headed Browser...");
  console.log("    WATCH THE PLAYWRIGHT BROWSER WINDOW EXECUTE ALL 15 STEPS!");
  await runQueuedWorkflow(run.id);

  // 7. Verify Results in Database
  console.log("\n[9] Verifying Execution Results in Supabase...");
  const finalRun = await store.getRun(auth, run.id);
  console.log(`    Final Run State: ${finalRun?.state}`);

  const steps = await store.listExecutionSteps(auth, run.id);
  console.log(`    Persisted Execution Steps Count: ${steps.length}`);
  for (const s of steps) {
    console.log(`    - Step: ${s.stepId.padEnd(25)} | State: ${s.state.padEnd(10)} | Finished: ${s.finishedAt}`);
  }

  if (finalRun?.state !== "SUCCEEDED") {
    throw new Error(`Run ended in state ${finalRun?.state}, expected SUCCEEDED`);
  }

  if (steps.length < 10) {
    throw new Error(`Expected >= 10 persisted steps, got ${steps.length}`);
  }

  console.log("\n===============================================================");
  console.log("✅ ACCEPTANCE TEST PASSED! ALL STEPS EXECUTED AND PERSISTED!");
  console.log("===============================================================");
}

runFullSauceDemoVerification().catch((err) => {
  console.error("\n❌ VERIFICATION FAILED:", err);
  process.exit(1);
});
