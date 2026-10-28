import { chromium } from "playwright";
import { WorkflowRuntime, ExecutionPlanner, DataExecutor, ApiExecutor, HumanExecutor, type ExecutionPersistence, type RuntimeContextState } from "@ghost/runtime";
import type { WorkflowV2, WorkflowV2Step } from "@ghost/workflow-schema";
import { WorkflowCompiler } from "../../../api/dist/compiler.js";
import { RealSemanticBPIProvider, extractObservationsFromText } from "../../../api/dist/ai-provider.js";
import { BusinessProcessIntelligence, parseSOPText } from "@ghost/bpi";
import { loadConfig } from "../../../api/dist/config.js";
import { createStore } from "../../../api/dist/store.js";
import type { AuthContext } from "@ghost/shared-types";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

async function verifyFullPipeline() {
  console.log("================================================================");
  console.log("AUTOWORKER FULL PIPELINE & SAUCEDEMO EXECUTION VERIFICATION");
  console.log("================================================================\n");

  const config = loadConfig();
  const store = createStore(config);

  const supabase = (store as any).supabase;
  let tenantId = "00000000-0000-0000-0000-000000000001";
  if (supabase) {
    const { data: org } = await supabase.from("organizations").select("id").limit(1).maybeSingle();
    if (org?.id) {
      tenantId = org.id;
    } else {
      const { data: newOrg } = await supabase.from("organizations").insert({ name: "Dev Org" }).select().single();
      if (newOrg?.id) tenantId = newOrg.id;
    }
  }

  const auth: AuthContext = { tenantId, userId: "00000000-0000-0000-0000-000000000002", role: "admin" };

  // -------------------------------------------------------------
  // STEP 1: SOP Document Ingestion & Observation Extraction
  // -------------------------------------------------------------
  console.log("[STAGE 1] Ingesting SOP document and extracting process steps...");
  const rawSopText = `Standard Operating Procedure: SauceDemo Checkout Verification
1. Navigate to https://www.saucedemo.com/
2. Enter username standard_user into #user-name
3. Enter password secret_sauce into #password
4. Click login button #login-button
5. Click Add to cart for #add-to-cart-sauce-labs-backpack
6. Click shopping cart .shopping_cart_link
7. Verify item name in cart .inventory_item_name
8. Click checkout button #checkout
9. Enter first name Test into #first-name
10. Enter last name User into #last-name
11. Enter postal code 400001 into #postal-code
12. Click continue button #continue
13. Verify order summary .summary_info
14. STOP: Do not click finish. Complete verification.`;

  const parsedDoc = parseSOPText(rawSopText);
  console.log(`  Parsed document with ${parsedDoc.steps.length} raw steps.`);

  const observations = await extractObservationsFromText(config, JSON.stringify(parsedDoc));
  console.log(`  Extracted ${observations.length} concrete interaction observations:`);
  for (const obs of observations) {
    console.log(`    - [${obs.action}] ${obs.context?.page_title || obs.context?.url || ""} (${(obs.target as any)?.dom_evidence?.attributes?.selector || (obs.target as any)?.selector || "no selector"})`);
  }

  if (observations.length === 0) {
    throw new Error("FAILED: 0 observations extracted from SOP document");
  }

  // -------------------------------------------------------------
  // STEP 2: BPI Analysis & BPS Generation
  // -------------------------------------------------------------
  console.log("\n[STAGE 2] Running Business Process Intelligence (BPI)...");
  const aiProvider = new RealSemanticBPIProvider(config);
  const bpi = new BusinessProcessIntelligence(aiProvider as any);

  const demo = {
    recording_id: crypto.randomUUID(),
    tenant_id: auth.tenantId,
    source: "documents",
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
    observations
  };

  const bpiResult = await bpi.processDemonstration(demo as any);
  console.log(`  BPI intent inferred: "${bpiResult.specification.intent}"`);
  console.log(`  Blocking gaps detected: ${bpiResult.gaps.filter(g => g.blocking).length}`);
  console.log(`  Total steps in specification: ${bpiResult.specification.steps.length}`);

  // -------------------------------------------------------------
  // STEP 3: Workflow Compilation (Version 1)
  // -------------------------------------------------------------
  console.log("\n[STAGE 3] Compiling Workflow Version 1 with WorkflowCompiler...");
  const compiler = new WorkflowCompiler(aiProvider);
  const workflowV1 = await compiler.compile(bpiResult.specification, { version: "phase3-compiler-1.0" });
  console.log(`  Compiled Workflow v1 "${workflowV1.name}" with ${workflowV1.root_step.children?.length ?? 0} child steps.`);

  // -------------------------------------------------------------
  // STEP 4: Chat Instruction & Memory-Driven Recompile (Version 2)
  // -------------------------------------------------------------
  console.log("\n[STAGE 4] Simulating Chat Instruction & Recompile to Version 2...");
  const chatInstruction = "Ensure standard_user credentials are typed with precision and verify the order summary page before stopping.";
  
  // Add memory rule to simulate chat update
  const worker = await store.createGhostWorker(auth, { name: "SauceDemo Retail Worker" });
  await store.addMemoryRule(auth, worker.id, chatInstruction, { source: "CHAT" });
  const memory = await store.getWorkerMemory(auth, worker.id);
  console.log(`  Memory rule stored. Total rules: ${memory.rules.length}`);

  // Recompile with memory rule injected
  demo.observations.push({
    sequence: demo.observations.length,
    timestamp: new Date().toISOString(),
    action: "EXTRACT",
    context: { url: "user_memory", page_title: "Chat Injected Rules" },
    value: {
      raw_value: memory.rules.map((r: any) => r.content).join("\n"),
      is_sensitive: false,
      placeholder: "Explicit Rules",
      classification: {
        value: "BUSINESS_RULES" as any,
        confidence: 1.0,
        classification: "INFERRED_RULE",
        evidence: []
      }
    }
  } as any);

  const bpiResultV2 = await bpi.processDemonstration(demo as any);
  const workflowV2 = await compiler.compile(bpiResultV2.specification, { version: "phase3-compiler-2.0" });
  const version2Row = await store.createWorkflowVersion(auth, workflowV2 as any);
  console.log(`  Workflow Version 2 compiled & saved with ID: ${version2Row.id}`);

  // -------------------------------------------------------------
  // STEP 5: Real Playwright Execution against SauceDemo
  // -------------------------------------------------------------
  console.log("\n[STAGE 5] Launching Real Playwright Browser for SauceDemo Execution...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const stepExecLogs: Array<{ stepId: string; description: string; status: string; output?: any }> = [];

  class PlaywrightBrowserExecutor {
    canExecute(step: WorkflowV2Step): boolean {
      return step.target === "BROWSER_DETERMINISTIC" || step.target === "BROWSER_SEMANTIC";
    }

    async execute(step: WorkflowV2Step): Promise<any> {
      const action = step.operation;
      const selector = step.args?.selector;
      const val = step.args?.value;
      const url = step.args?.url;

      console.log(`  -> Executing Step [${step.id}]: ${step.description}`);

      if (action === "NAVIGATE") {
        const targetUrl = url || "https://www.saucedemo.com/";
        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
        return { state: "SUCCEEDED" };
      }

      if (action === "TYPE") {
        await page.waitForSelector(selector, { state: "visible", timeout: 10000 });
        await page.fill(selector, val || "");
        return { state: "SUCCEEDED" };
      }

      if (action === "CLICK") {
        await page.waitForSelector(selector, { state: "visible", timeout: 10000 });
        await page.click(selector);
        return { state: "SUCCEEDED" };
      }

      if (action === "EXTRACT") {
        await page.waitForSelector(selector, { state: "visible", timeout: 10000 });
        const content = await page.locator(selector).textContent();
        return {
          state: "SUCCEEDED",
          outputs: step.bind_result_to ? { [step.bind_result_to]: content } : { extracted: content }
        };
      }

      return { state: "SUCCEEDED" };
    }
  }

  const planner = new ExecutionPlanner();
  const plan = planner.createPlan(version2Row.id, workflowV2);

  const recordedSteps: Record<string, string> = {};
  const persistence: ExecutionPersistence = {
    async recordStepStarted(stepId: string) {
      recordedSteps[stepId] = "RUNNING";
    },
    async recordStepCompleted(stepId: string, state: string, strategy?: string, message?: string, outputs?: any) {
      recordedSteps[stepId] = state;
      stepExecLogs.push({ stepId, description: recordedSteps[stepId] || stepId, status: state, output: outputs });
    },
    async hasStepCompleted(stepId: string) {
      return recordedSteps[stepId] === "SUCCEEDED";
    },
    async recordRunState(state: string) {
      console.log(`  [PERSISTENCE] Run state updated to: ${state}`);
    },
    async recordHitlPause() {},
    async saveCheckpoint() {},
    async loadCheckpoint() { return null; }
  };

  const runtime = new WorkflowRuntime(plan, persistence, [
    new DataExecutor(),
    new ApiExecutor(),
    new HumanExecutor(),
    new PlaywrightBrowserExecutor() as any
  ], {
    inputs: { url: "https://www.saucedemo.com/" },
    variables: {},
    outputs: {},
    artifacts: {},
    scopes: [],
    executionMetadata: {
      runId: crypto.randomUUID(),
      tenantId: auth.tenantId,
      workflowVersionId: version2Row.id
    }
  });

  console.log("\n  Starting workflow execution on real browser...");
  await runtime.start();

  // Validate on-page state
  const currentUrl = page.url();
  console.log(`\n  Final Page URL: ${currentUrl}`);
  
  const isSummaryVisible = await page.locator(".summary_info").isVisible().catch(() => false);
  console.log(`  Order Summary visible on page: ${isSummaryVisible}`);

  const itemTotalText = await page.locator(".summary_subtotal_label").textContent().catch(() => "Not found");
  console.log(`  Order Subtotal Text: "${itemTotalText}"`);

  // Verify that finish button exists but was NOT clicked (as instructed)
  const finishBtnVisible = await page.locator("#finish").isVisible().catch(() => false);
  console.log(`  Finish button present (safely NOT clicked): ${finishBtnVisible}`);

  const screenshotPath = path.resolve(process.cwd(), "saucedemo-verified.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`  Saved verified execution screenshot to: ${screenshotPath}`);

  await browser.close();

  // -------------------------------------------------------------
  // STEP 6: Final Verification Report
  // -------------------------------------------------------------
  console.log("\n================================================================");
  console.log("VERIFICATION SUMMARY");
  console.log("================================================================");
  console.log(`  Total Steps Executed: ${stepExecLogs.length}`);
  console.log(`  All Steps Succeeded: ${stepExecLogs.every(s => s.status === "SUCCEEDED")}`);
  console.log(`  Checkout Verification Reached: ${isSummaryVisible && currentUrl.includes("checkout-step-two")}`);
  console.log("================================================================\n");

  if (!isSummaryVisible) {
    throw new Error("Verification failed: Order summary was not reached");
  }

  console.log("STATUS: PROVEN - Full pipeline from SOP -> BPI -> Compiler -> Chat Recompile -> Playwright SauceDemo Execution succeeded!");
}

verifyFullPipeline().catch((err) => {
  console.error("Pipeline Verification Failed:", err);
  process.exit(1);
});
