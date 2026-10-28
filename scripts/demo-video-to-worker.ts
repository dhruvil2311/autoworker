import { config as dotenvConfig } from "dotenv";
dotenvConfig();

import * as path from "path";
import { loadConfig } from "../apps/api/src/config.js";
import { EvidenceToWorkflowPipeline } from "../apps/api/src/services/evidence/evidence-pipeline.js";
import { MockVisionProvider } from "../apps/api/src/services/openrouter/mock-openrouter-provider.js";
import { OpenRouterProvider } from "../apps/api/src/services/openrouter/openrouter-provider.js";
import { OpenRouterQuotaManager } from "../apps/api/src/services/openrouter/quota-manager.js";
import type { RawVisualObservation } from "../apps/api/src/services/evidence/task-relevance-engine.js";

async function runDemo() {
  console.log("================================================================================");
  console.log("  GHOST — EVIDENCE-TO-WORKER INTELLIGENCE PIPELINE DEMO");
  console.log("================================================================================");

  const config = loadConfig(process.env);
  const hasRealKey = Boolean(config.openRouterApiKey && !config.openRouterApiKey.includes("placeholder") && config.openRouterApiKey.startsWith("sk-or-"));

  let provider;
  if (hasRealKey) {
    console.log(`[MODE] Using LIVE OpenRouter Provider (Model: ${config.openRouterModel})`);
    const quota = OpenRouterQuotaManager.getInstance({
      allowPaidModels: config.allowPaidModels,
      maxConcurrentRequests: config.openRouterMaxConcurrentRequests
    });
    provider = new OpenRouterProvider(config, quota);
  } else {
    console.log(`[MODE] Using Offline MockVisionProvider (Zero API cost, deterministic reasoning)`);
    provider = new MockVisionProvider();
  }

  const pipeline = new EvidenceToWorkflowPipeline(config, provider);

  // Simulated visual demonstration recorded from screen
  const rawObservations: RawVisualObservation[] = [
    // 1. Noise: Taskbar / Windows clock
    {
      id: "obs_00",
      timestamp: 0.1,
      application: "Explorer",
      windowTitle: "Desktop Shell",
      targetText: "Windows Start Menu 12:45 PM Battery 98%",
      confidence: 0.99
    },
    // 2. Work: Open Billing Portal
    {
      id: "obs_01",
      timestamp: 1.0,
      application: "Google Chrome",
      windowTitle: "Corporate ERP - Billing System",
      targetText: "https://erp.internal.acme.com/invoices",
      type: "NAVIGATE",
      confidence: 0.98
    },
    // 3. Noise: Chrome screen sharing banner
    {
      id: "obs_02",
      timestamp: 2.0,
      application: "Google Chrome",
      targetDescription: "Chrome notification banner: Stop sharing your screen",
      confidence: 0.95
    },
    // 4. Work: Type Search Query
    {
      id: "obs_03",
      timestamp: 3.5,
      application: "Google Chrome",
      windowTitle: "Corporate ERP - Invoices List",
      targetText: "Search Invoice ID",
      value: "INV-2026-904",
      type: "TYPE",
      isTextMutation: true,
      confidence: 0.96
    },
    // 5. Work: Click Approve Button
    {
      id: "obs_04",
      timestamp: 5.2,
      application: "Google Chrome",
      windowTitle: "Corporate ERP - Invoice INV-2026-904",
      targetText: "Approve Invoice",
      targetDescription: "Primary action button in invoice review row",
      type: "CLICK",
      isClickTarget: true,
      confidence: 0.97
    }
  ];

  console.log(`\nInput Recording:`);
  console.log(`  Raw Observations Detected: ${rawObservations.length}`);
  console.log(`  Active Application: Google Chrome`);
  console.log(`  Task Objective: Search for invoice INV-2026-904 and approve it in ERP`);

  console.log(`\nExecuting Pipeline (Local CV -> Relevance Filter -> OpenRouter Call #1 -> Call #2 -> BPI -> Compiler)...`);
  const startTime = Date.now();

  const result = await pipeline.executePipeline({
    jobId: `demo_job_${Date.now()}`,
    mediaPath: "recordings/invoice_approval_demo.mp4",
    tenantId: "tenant_demo",
    workerId: "worker_billing_agent",
    taskObjective: "Approve pending invoice in ERP billing system",
    rawObservations,
    activeApplication: "Google Chrome"
  });

  const elapsed = Date.now() - startTime;

  if (!result.success || !result.workflow) {
    console.error(`\n[PIPELINE FAILED] Status: ${result.status}`);
    console.error(`Message: ${result.message}`);
    process.exit(1);
  }

  console.log(`\n================================================================================`);
  console.log(`  PIPELINE EXECUTION COMPLETED IN ${elapsed}ms`);
  console.log(`================================================================================`);
  console.log(`Status: ${result.status}`);
  console.log(`Message: ${result.message}`);

  console.log(`\n--- [Stage 1 & 2: Local CV & Task Relevance Filtering] ---`);
  console.log(`  Discarded Noise Count: ${result.provenance?.discardedNoiseCount ?? 0} (e.g. taskbar, screen-share banners)`);
  console.log(`  Evidence Episodes Constructed: ${result.provenance?.episodesCount ?? 0}`);

  console.log(`\n--- [Stage 3: Extracted Semantic Actions] ---`);
  for (const act of result.semanticActions || []) {
    console.log(`  * [${act.action}] ${act.rationale || JSON.stringify(act.arguments)}`);
    console.log(`    App: ${act.application} | Confidence: ${(act.confidence * 100).toFixed(0)}%`);
  }

  console.log(`\n--- [Stage 4: Process Understanding] ---`);
  console.log(`  Task Intent: ${result.processUnderstanding?.taskIntent}`);
  console.log(`  Application Environment: ${result.processUnderstanding?.applicationEnvironment}`);
  console.log(`  Variables Identified: ${result.processUnderstanding?.variables.length ?? 0}`);
  for (const v of result.processUnderstanding?.variables || []) {
    console.log(`    - ${v.name} (${v.type}): ${v.semanticRole}`);
  }
  console.log(`  Business Rules: ${result.processUnderstanding?.businessRules.length ?? 0}`);
  for (const r of result.processUnderstanding?.businessRules || []) {
    console.log(`    - ${r.rule}`);
  }
  console.log(`  Overall Confidence: ${((result.processUnderstanding?.confidence || 0.9) * 100).toFixed(0)}%`);

  console.log(`\n--- [Stage 5: Authoritative Compiled Workflow V2] ---`);
  console.log(`  Workflow Version: ${result.workflow.workflow_version}`);
  console.log(`  Workflow Name: ${result.workflow.name}`);
  console.log(`  Total Root Steps: ${result.workflow.root_step?.children?.length ?? 1}`);
  console.log(`  Compiler Provenance:`);
  console.log(`    Source Type: ${(result.workflow.compiler as any)?.source_type}`);
  console.log(`    Source Recording: ${(result.workflow.compiler as any)?.source_recording_id}`);
  console.log(`    Media Name: ${(result.workflow.compiler as any)?.source_media_name}`);

  console.log(`\n[SUCCESS] The video demonstration was converted into an authoritative Ghost Worker workflow!`);
}

runDemo().catch(err => {
  console.error("Demo failed with exception:", err);
  process.exit(1);
});
