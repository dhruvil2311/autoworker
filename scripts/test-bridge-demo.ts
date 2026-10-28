import fs from "fs";
import { DesktopEvidenceBridge } from "../apps/api/src/services/desktop-evidence-bridge.js";

const json = JSON.parse(fs.readFileSync("apps/api/evidence_output/6ef50df4-58bb-48e3-9796-d25ba85d4dac/fc7bd603-082d-41b4-ba10-52e306e9caea/job_1793185102680_uzejxi/analysis_result.json", "utf8"));

const bridge = DesktopEvidenceBridge.getInstance();
const demo = bridge.toNormalizedDemonstration(json, "6ef50df4-58bb-48e3-9796-d25ba85d4dac");

console.log("=== NORMALIZED DEMONSTRATION OBSERVATIONS ===");
demo.observations.forEach((obs: any, i: number) => {
  console.log(`Step #${i}: action=${obs.action}, desc="${obs.context?.page_title}", url="${obs.context?.url}", value=`, obs.value?.raw_value, "selector=", obs.target?.dom_evidence?.attributes?.selector);
});
