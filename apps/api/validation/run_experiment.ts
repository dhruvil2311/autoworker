import { createStore } from "../src/store.js";
import { loadConfig } from "../src/config.js";
import { analyzeRecording, applyClarification } from "../src/bpi-service.js";
import { RecordingUpload } from "@ghost/workflow-schema";
import { ExecutionPlanner } from "../src/planner/planner.js";
import { CapabilityRegistry } from "../src/capabilities/registry.js";
import { CapabilityResolver } from "../src/capabilities/resolver.js";
import { WorkflowCompiler } from "../src/compiler.js";
import { WorkflowRuntime } from "@ghost/runtime/src/runtime.js";
import { MCPExecutor } from "@ghost/runtime/src/executors/mcp-executor.js";
import * as fs from "fs";
import * as path from "path";
import { supplierDatabase, destinationDatabase, resetFixtures, SystemA, SystemB } from "./fixture-systems.js";
import { logger } from "@ghost/observability";

// We use the in-memory store for isolation, ensuring the test is clean
const config = { ...loadConfig(), storageProvider: "memory" as const };
const store = createStore(config);
const auth = { userId: "validation_user", tenantId: "tenant_val", roles: [] };

const runId = `experiment_${Date.now()}`;
const outDir = path.join(__dirname, "runs", runId);

function saveArtifact(name: string, data: any) {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, name), JSON.stringify(data, null, 2));
}

// ────────────────────────────────────────────────────────
// 1. DEMONSTRATION
// ────────────────────────────────────────────────────────
const demonstrationUpload: RecordingUpload = {
  recording_id: "rec-val-1",
  source: "browser-extension",
  started_at: new Date().toISOString(),
  events: [
    {
      sequence: 1,
      timestamp: Date.now(),
      event_type: "navigation",
      page: { url: "https://supplier.example.com", title: "Supplier System" }
    },
    {
      sequence: 2,
      timestamp: Date.now(),
      event_type: "input",
      input: { value: "SKU-001", value_placeholder: "SKU-001" },
      page: { url: "https://supplier.example.com/search", title: "Supplier System" },
      target: { tag: "input", role: "searchbox", accessible_name: "Search SKU", attributes: {} }
    },
    {
      sequence: 3,
      timestamp: Date.now(),
      event_type: "click", // reading the stock value
      page: { url: "https://supplier.example.com/product/SKU-001", title: "SKU-001" },
      target: { tag: "div", text: "150", role: "text", attributes: { "data-testid": "stock-value" } }
    },
    {
      sequence: 4,
      timestamp: Date.now(),
      event_type: "navigation",
      page: { url: "https://destination.example.com", title: "Destination Store" }
    },
    {
      sequence: 5,
      timestamp: Date.now(),
      event_type: "input",
      input: { value: "SKU-001", value_placeholder: "SKU-001" },
      page: { url: "https://destination.example.com/search", title: "Destination Store" },
      target: { tag: "input", role: "searchbox", accessible_name: "Search Product", attributes: {} }
    },
    {
      sequence: 6,
      timestamp: Date.now(),
      event_type: "input",
      input: { value: "145", value_placeholder: "145" }, // entering calculated stock
      page: { url: "https://destination.example.com/product/SKU-001", title: "SKU-001" },
      target: { tag: "input", role: "spinbutton", accessible_name: "Update Inventory", attributes: {} }
    },
    {
      sequence: 7,
      timestamp: Date.now(),
      event_type: "click",
      page: { url: "https://destination.example.com/product/SKU-001", title: "SKU-001" },
      target: { tag: "button", text: "Save", role: "button", attributes: {} }
    }
  ]
};

async function runValidation() {
  logger.info("Starting Validation Experiment");
  saveArtifact("raw-demonstration.json", demonstrationUpload);

  const worker = await store.createGhostWorker(auth, { name: "Inventory Sync Validator" });
  const recording = await store.createRecording(auth, demonstrationUpload);

  // ────────────────────────────────────────────────────────
  // 2. ANALYSIS
  // ────────────────────────────────────────────────────────
  logger.info("Running Semantic Analysis (BPI)...");
  let analysisResult;
  try {
    analysisResult = await analyzeRecording(config, store, auth, worker.id, recording.id);
  } catch (e: any) {
    logger.error("BPI Analysis Failed - Make sure GEMINI_API_KEY is configured.");
    throw e;
  }

  const preClarificationBPS = await store.getBPS(auth, analysisResult.bpsId);
  saveArtifact("pre-clarification-bps.json", preClarificationBPS);
  saveArtifact("generated-gaps.json", analysisResult.gaps);

  logger.info(`Found ${analysisResult.gaps.length} clarification gaps.`);

  // ────────────────────────────────────────────────────────
  // 3. CLARIFICATION 
  // ────────────────────────────────────────────────────────
  logger.info("Applying Clarification Answers...");
  let remainingGaps = analysisResult.gaps;

  // We simulate human answers for the expected gaps. 
  // We answer generic prompts like "Which products?", "How was 145 calculated?", "What happens on fail?"
  const answers = [
    "Process every active product in the supplier system.",
    "Get the product list from the supplier system.",
    "Subtract 5 units from the supplier stock to get destination stock.",
    "Never set inventory below zero (floor of 0).",
    "Ask me when a product cannot be confidently matched.",
    "Ask for approval if proposed inventory change exceeds 20% of current.",
    "Continue processing independent products when one requires attention."
  ];

  for (let i = 0; i < Math.min(remainingGaps.length, answers.length); i++) {
    const gap = remainingGaps[i];
    const result = await applyClarification(store, auth, worker.id, preClarificationBPS!.id, gap.id, {
      type: "TEXT",
      value: answers[i]
    });
    remainingGaps = result.remainingGaps;
  }

  const postClarificationBPS = await store.getBPS(auth, preClarificationBPS!.id);
  saveArtifact("post-clarification-bps.json", postClarificationBPS);

  // ────────────────────────────────────────────────────────
  // 4. PLAN & COMPILE
  // ────────────────────────────────────────────────────────
  logger.info("Generating Execution Plan...");

  // Register Capabilities for our Test Systems to test the planner
  const registry = new CapabilityRegistry(store);
  // (In a real test we'd add the test capability definitions here, 
  // but we can let the compiler just use standard capabilities if registry is empty)

  const resolver = new CapabilityResolver(registry);
  const planner = new ExecutionPlanner(resolver);

  const plan = await planner.plan(auth, postClarificationBPS!.specificationJson as any);
  saveArtifact("execution-plan.json", plan);

  const compiler = new WorkflowCompiler();
  const workflow = compiler.compile(postClarificationBPS!.specificationJson as any, { version: "3.5" }, plan);
  saveArtifact("compiled-workflow.json", workflow);

  logger.info("Workflow Compiled Successfully.");

  // For the actual execution (Part 14), we would need a full runner instantiation here.
  // We'll leave that to be run manually or in a separate pass if needed, but for now we validate to compilation.
  console.log(`Validation Phase 1-13 Complete. Artifacts stored in: ${outDir}`);
}

runValidation().catch(e => {
  console.error("Experiment Failed:", e);
  process.exit(1);
});
