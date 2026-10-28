import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { EndToEndEvaluator } from './evaluator';
import { ScenarioDefinition } from './schema';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runAllScenarios() {
  const evaluator = new EndToEndEvaluator();
  const evaluationRoot = path.join(__dirname, '..');
  const domains = ['shopify', 'amazon', 'woocommerce', 'erp', 'warehouse', 'retail', 'crm', 'finance', 'shipping', 'b2b'];
  
  let totalScenarios = 0;
  let passedScenarios = 0;
  
  console.log("========================================================");
  console.log("GHOST END-TO-END COGNITIVE VALIDATION RUNNER");
  console.log("========================================================\n");

  for (const domain of domains) {
    const domainPath = path.join(evaluationRoot, domain);
    if (!fs.existsSync(domainPath)) continue;
    
    const files = fs.readdirSync(domainPath).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const scenarioPath = path.join(domainPath, file);
      const scenarioContent = fs.readFileSync(scenarioPath, 'utf-8');
      const scenario: ScenarioDefinition = JSON.parse(scenarioContent);
      
      console.log(`\nRunning Scenario: ${file} (Domain: ${domain})`);
      try {
        const metrics = await evaluator.evaluateScenario(scenario);
        console.log(`Pipeline Accuracy: ${metrics.pipelineAccuracy}%`);
        console.log(`Business Understanding Score: ${metrics.businessUnderstandingScore}%`);
        console.log(`Clarification Score: ${metrics.clarificationScore}%`);
        console.log(`Knowledge Retention Score: ${metrics.knowledgeRetentionScore}%`);
        console.log(`Execution Score: ${metrics.executionScore}%`);
        console.log(`Learning Score: ${metrics.learningScore}%`);
        console.log(`Overall Ghost Score: ${metrics.overallGhostScore}%`);
        
        if (metrics.overallGhostScore >= 95) {
          console.log(`✅ Scenario Passed!`);
          passedScenarios++;
        } else {
          console.log(`❌ Scenario Failed. Score < 95%`);
        }
      } catch (e) {
        console.error(`❌ Scenario Failed with Error:`, e);
      }
      totalScenarios++;
    }
  }

  console.log("\n========================================================");
  console.log(`TOTAL SCENARIOS RUN: ${totalScenarios}`);
  console.log(`PASSED: ${passedScenarios} / ${totalScenarios}`);
  console.log("========================================================");
}

runAllScenarios().catch(console.error);
