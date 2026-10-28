import { config as dotenvConfig } from "dotenv";
dotenvConfig();

import { loadConfig } from "../apps/api/src/config.js";
import { OpenRouterProvider } from "../apps/api/src/services/openrouter/openrouter-provider.js";
import { OpenRouterQuotaManager } from "../apps/api/src/services/openrouter/quota-manager.js";
import type { SemanticEvidencePacket } from "../apps/api/src/services/openrouter/types.js";
import { OpenRouterError } from "../apps/api/src/services/openrouter/types.js";

async function run() {
  console.log("================================================================================");
  console.log("  GHOST — OPENROUTER SINGLE EVIDENCE PACKET VERIFICATION");
  console.log("================================================================================");

  const config = loadConfig(process.env);
  const quota = OpenRouterQuotaManager.getInstance({
    allowPaidModels: config.allowPaidModels,
    maxConcurrentRequests: config.openRouterMaxConcurrentRequests,
    maxRequestsPerMinute: 20
  });

  console.log(`Configured Model: ${config.openRouterModel}`);
  console.log(`Allow Paid Models (Cost Guard): ${config.allowPaidModels}`);
  console.log(`Base URL: ${config.openRouterBaseUrl}`);
  console.log(`API Key Provided: ${Boolean(config.openRouterApiKey && !config.openRouterApiKey.includes("placeholder"))}`);

  if (!config.openRouterApiKey || config.openRouterApiKey.includes("placeholder")) {
    console.error("\n[ABORTED] No valid OPENROUTER_API_KEY found in .env.");
    console.error("Please provide a valid OpenRouter API key to run live cloud verification.");
    process.exit(1);
  }

  const provider = new OpenRouterProvider(config, quota);

  // Construct a single, realistic evidence packet (Before / Action / After)
  // Simple transparent 1x1 png base64 for compact visual verification
  const sample1x1Png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  const samplePacket: SemanticEvidencePacket = {
    packetId: `pkt_verify_${Date.now()}`,
    taskContext: "Invoice status verification in accounting portal",
    activeApplication: "Google Chrome",
    timestamps: { start: 0.0, end: 3.5 },
    confidence: 0.95,
    ocrFacts: [
      "ERP Billing Portal - Invoices",
      "Invoice #INV-2026-081",
      "Status: Pending Review",
      "Action: Approve Invoice",
      "Customer: Global Logistics Inc",
      "Total Amount: $4,850.00"
    ],
    episodes: [
      {
        episodeId: "ep_01",
        timestampStart: 0.5,
        timestampEnd: 2.5,
        application: "Google Chrome",
        windowTitle: "ERP Billing Portal",
        before: {
          frames: [
            {
              frameId: "f_before",
              timestamp: 0.5,
              base64: sample1x1Png
            }
          ],
          ocr: [{ text: "Status: Pending Review", timestamp: 0.5 }]
        },
        action: {
          type: "CLICK",
          targetText: "Approve Invoice",
          coordinates: { x: 742, y: 310 },
          source: "cursor-analysis",
          confidence: 0.95
        },
        after: {
          frames: [
            {
              frameId: "f_after",
              timestamp: 2.5,
              base64: sample1x1Png
            }
          ],
          ocr: [{ text: "Status: Approved", timestamp: 2.5 }]
        }
      }
    ]
  };

  console.log("\n[1/2] Dispatching single evidence packet to OpenRouter...");
  const startTime = Date.now();

  try {
    const result = await provider.extractSemanticActions(samplePacket);
    const elapsed = Date.now() - startTime;

    console.log(`\n[SUCCESS] Response received in ${elapsed}ms!`);
    console.log(`Model Used: ${config.openRouterModel}`);
    console.log(`Semantic Actions Extracted: ${result.semanticActions.length}`);
    console.log("\nExtracted Actions:");
    for (const act of result.semanticActions) {
      console.log(`  - [${act.action}] ${act.rationale || "Observed action"}`);
      console.log(`    App: ${act.application}`);
      if (act.arguments && Object.keys(act.arguments).length > 0) {
        console.log(`    Arguments: ${JSON.stringify(act.arguments)}`);
      }
      console.log(`    Confidence: ${(act.confidence * 100).toFixed(0)}%`);
    }

    console.log("\n[2/2] Quota Snapshot:");
    console.log(JSON.stringify(quota.getSnapshot(), null, 2));
    console.log("\nOpenRouter verification completed successfully!");
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    console.error(`\n[FAILED] Request failed after ${elapsed}ms:`);
    if (err instanceof OpenRouterError) {
      console.error(`  Error Type: ${err.type}`);
      console.error(`  Status Code: ${err.statusCode}`);
      console.error(`  Message: ${err.message}`);
    } else {
      console.error(`  Message: ${err.message}`);
    }

    console.log("\nQuota Snapshot on Failure:");
    console.log(JSON.stringify(quota.getSnapshot(), null, 2));
    process.exit(1);
  }
}

run();
