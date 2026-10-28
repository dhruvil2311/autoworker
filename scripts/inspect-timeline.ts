import fs from "fs";

const json = JSON.parse(fs.readFileSync("apps/api/evidence_output/6ef50df4-58bb-48e3-9796-d25ba85d4dac/fc7bd603-082d-41b4-ba10-52e306e9caea/job_1793185102680_uzejxi/analysis_result.json", "utf8"));

console.log("semantic_actions count:", json.semantic_actions?.length);
json.semantic_actions?.forEach((act: any, i: number) => {
  console.log(`Action #${i}: type=${act.action_type}, summary="${act.summary}", desc="${act.target_description}", params=`, JSON.stringify(act.parameters));
});
