import { loadConfig } from "../config.js";
import { RealSemanticBPIProvider } from "../ai-provider.js";
import { BusinessProcessIntelligence } from "@ghost/bpi/dist/pipeline.js";
import type { NormalizedDemonstration } from "@ghost/bpi";

async function main() {
  const config = loadConfig();
  
  if (!config.geminiApiKey) {
    console.log("SKIPPED_MISSING_CONFIGURATION");
    process.exit(0);
  }

  const demo: NormalizedDemonstration = {
    recording_id: "rec_live_test",
    tenant_id: "tenant_live",
    source: "ext",
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
    observations: [
      { sequence: 1, timestamp: new Date().toISOString(), action: "INPUT", context: { url: "https://example.com/login", page_title: "Login" }, value: { raw_value: "testuser", is_sensitive: false, classification: { value: "RUNTIME_VARIABLE", confidence: 0, classification: "OBSERVED_FACT", evidence: [] } } }
    ]
  };

  try {
    const provider = new RealSemanticBPIProvider(config);
    const bpi = new BusinessProcessIntelligence(provider as any);

    const { specification } = await bpi.processDemonstration(demo, "test");
    
    if (specification && specification.intent) {
      console.log("EXECUTED_AND_PASSED");
    } else {
      console.log("EXECUTED_AND_FAILED");
    }
  } catch (error: any) {
    if (error.message?.includes("402") || error.message?.includes("429") || error.message?.includes("insufficient_quota")) {
      console.log("BLOCKED_PROVIDER: " + error.message);
    } else {
      console.error(error);
      console.log("EXECUTED_AND_FAILED");
    }
    process.exit(1);
  }
}

main().catch(console.error);
