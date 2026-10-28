import { DesktopEvidenceBridge } from "../../../api/dist/services/desktop-evidence-bridge.js";
import { WorkflowCompiler } from "../../../api/dist/compiler.js";
import { BusinessProcessIntelligence } from "@ghost/bpi";
import { BrowserbaseExecutionProvider } from "../browserbase.js";
import { V2BrowserExecutor } from "../executors-v2.js";
import { RuntimeContext } from "@ghost/runtime";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  console.log("=== Testing Universal Hybrid Evidence Pipeline End-to-End ===");

  const analysisPath = path.resolve(
    __dirname,
    "../../../../packages/desktop-evidence-engine/temp_output/test_job_3/analysis_result.json"
  );
  if (!fs.existsSync(analysisPath)) {
    throw new Error(`Analysis file not found at ${analysisPath}`);
  }

  const analysisResult = JSON.parse(fs.readFileSync(analysisPath, "utf-8"));
  console.log(`Loaded analysis with ${analysisResult.semantic_actions?.length} semantic actions`);

  // 1. Convert via DesktopEvidenceBridge
  const bridge = DesktopEvidenceBridge.getInstance();
  const demo = bridge.toNormalizedDemonstration(analysisResult, "tenant_test");
  console.log(`Converted to NormalizedDemonstration with ${demo.observations.length} observations`);

  // 2. Process via BPI
  const bpi = new BusinessProcessIntelligence();
  const bpiResult = await bpi.processDemonstration(demo);
  console.log(`BPI processed demonstration. Status: ${bpiResult.specification.status}`);

  // 3. Compile via WorkflowCompiler
  const compiler = new WorkflowCompiler(undefined as any);
  const workflow = await compiler.compile(bpiResult.specification, {
    version: "test-compiler-1.0"
  });
  console.log(`Workflow compiled successfully! Root children count: ${workflow.root_step.children?.length}`);
  for (const c of workflow.root_step.children || []) {
    console.log(`  - [${c.operation}] (${c.target}) ${c.description} -> sel: ${c.args?.selector || 'none'}`);
  }

  // 4. Execute via V2BrowserExecutor in Headless mode
  console.log("\n=== Executing Workflow in Headless Mode ===");
  process.env.WORKER_HEADLESS = "true";

  const bbProvider = new BrowserbaseExecutionProvider({
    browserbaseApiKey: "local",
    browserbaseProjectId: "local"
  });

  const executor = new V2BrowserExecutor(bbProvider);

  const context = new RuntimeContext({
    inputs: { url: "https://www.saucedemo.com/" },
    variables: {},
    outputs: {},
    artifacts: {},
    scopes: [],
    executionMetadata: {
      runId: "run_test_headless",
      tenantId: "tenant_test",
      workflowVersionId: "wv_test"
    }
  });

  let allSucceeded = true;
  for (const step of workflow.root_step.children || []) {
    if (step.target === "DATA" || step.operation === "BUILD_OUTPUT" || step.operation === "VERIFY_OUTPUT" || step.operation === "DELIVER_OUTPUT") {
      console.log(`Skipping output verification step in browser test: ${step.id}`);
      continue;
    }
    console.log(`\nExecuting step: [${step.operation}] ${step.description}...`);
    const res = await executor.execute(step, context);
    console.log(`Result: ${res.state}${res.hitlReason ? ` (HITL: ${res.hitlReason})` : ''}`);
    if (res.state !== "SUCCEEDED") {
      console.error(`Step failed or paused:`, res);
      allSucceeded = false;
      break;
    }
  }

  if (allSucceeded) {
    console.log("\n🎉 ALL STEPS EXECUTED TO COMPLETION WITH ZERO PAUSES OR HITL PROMPTS!");
  } else {
    console.error("\n❌ Workflow paused or failed.");
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
