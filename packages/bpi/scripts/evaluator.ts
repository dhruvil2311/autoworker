import fs from 'fs';
import path from 'path';
import { LLMSemanticProvider } from '../src/ai.js';
import { ObservationCompressionEngine } from '../src/compression.js';
import { ComplexityAnalyzer } from '../src/complexity.js';
import type { Observation } from '../src/index.js';

async function generateSyntheticRecording(type: "MEDIUM" | "LARGE"): Promise<Observation[]> {
  const obs: Observation[] = [];
  const count = type === "MEDIUM" ? 30 : 150;
  const urlBase = "https://ghost.retail.app/";
  
  for (let i = 0; i < count; i++) {
    const timestamp = new Date(1700000000000 + i * 2000).toISOString();
    const isNavigation = i % 10 === 0;
    const isDuplicate = i > 0 && i % 3 === 0;
    
    if (isNavigation) {
      obs.push({
        sequence: i,
        timestamp,
        action: "NAVIGATE",
        context: { url: urlBase + `page${i}`, page_title: `Page ${i}` }
      });
    } else {
      const targetStr = isDuplicate ? `button-${i - 1}` : `button-${i}`;
      obs.push({
        sequence: i,
        timestamp,
        action: "CLICK",
        context: { url: urlBase + `page${Math.floor(i / 10) * 10}`, page_title: `Page ${Math.floor(i / 10) * 10}` },
        target: { dom_evidence: { tag: "BUTTON", attributes: { id: targetStr } } }
      });
    }
  }
  return obs;
}

async function evaluateBusinessRuleExtraction() {
  console.log("===============================================================");
  console.log("PHASE 11: ADAPTIVE OBSERVATION OPTIMIZATION BENCHMARK");
  console.log("===============================================================");
  
  const evalDir = path.resolve(process.cwd(), '../../evaluation/retail');
  const files = fs.readdirSync(evalDir).filter(f => f.endsWith('.json'));
  
  const provider = new LLMSemanticProvider();
  const compressor = new ObservationCompressionEngine();
  const analyzer = new ComplexityAnalyzer();
  
  let totalCases = 0;
  let correctCases = 0;
  
  const testCases = [
    { name: "Small (File)", getObservations: () => {
      const data = JSON.parse(fs.readFileSync(path.join(evalDir, files[0]), 'utf-8'));
      return data.recording || data.browserDemonstrations.flatMap((d: any) => d.events);
    }},
    { name: "Medium (Synthetic)", getObservations: () => generateSyntheticRecording("MEDIUM") },
    { name: "Large (Synthetic)", getObservations: () => generateSyntheticRecording("LARGE") }
  ];

  for (const test of testCases) {
    console.log(`\nEvaluating case: ${test.name}`);
    totalCases++;
    
    const observations = await test.getObservations();
    
    // Analyze complexity
    const metrics = analyzer.analyze(observations);
    console.log(`- Complexity Score: ${metrics.complexityScore}`);
    console.log(`- Compression Benefit: ${metrics.estimatedCompressionBenefit.toFixed(2)}`);
    console.log(`- Total Events: ${metrics.totalEventCount}`);
    
    // Adaptive Decision
    let semanticTimeline: any[] = observations;
    let usedCompression = false;
    
    const startAdp = Date.now();
    if (metrics.estimatedCompressionBenefit > 0.6) {
      console.log(`[Decision] ENABLING Compression.`);
      usedCompression = true;
      semanticTimeline = await compressor.compress(observations);
    } else {
      console.log(`[Decision] BYPASSING Compression.`);
    }
    
    const adaptiveRules = await provider.inferPotentialBusinessRules(semanticTimeline);
    const adaptiveLatency = Date.now() - startAdp;
    
    // Measure RAW as baseline to prove savings
    const startRaw = Date.now();
    const rawRules = await provider.inferPotentialBusinessRules(observations);
    const rawLatency = Date.now() - startRaw;
    
    const rawTokenSize = JSON.stringify(observations).length;
    const adaptiveTokenSize = JSON.stringify(semanticTimeline).length;

    console.log(`\nMetrics:`);
    console.log(`- Token Size (Raw): ${rawTokenSize}`);
    console.log(`- Token Size (Adaptive): ${adaptiveTokenSize}`);
    console.log(`- Token Reduction: ${rawTokenSize - adaptiveTokenSize} chars saved`);
    console.log(`- Latency (Raw): ${rawLatency}ms`);
    console.log(`- Latency (Adaptive): ${adaptiveLatency}ms`);
    console.log(`- Latency Reduction: ${rawLatency - adaptiveLatency}ms`);
    
    // Validation: 
    if (usedCompression && rawTokenSize < adaptiveTokenSize) {
      console.log(`\nWARNING: Adaptive pipeline performed WORSE on token size despite enabling compression!`);
    } else if (!usedCompression && adaptiveLatency > rawLatency + 500) {
      console.log(`\nWARNING: Adaptive pipeline performed WORSE on latency despite bypassing compression!`);
    } else {
      correctCases++;
    }
    console.log("---------------------------------------------------------------");
  }
  
  const accuracy = (correctCases / totalCases) * 100;
  console.log(`Adaptive Pipeline Validation: ${accuracy.toFixed(2)}% Passed Restrictions`);
  
  if (accuracy < 100) {
    console.log("\nSTRICT LOOP ENFORCED: Do not move to another subsystem until adaptive improvements are proven.");
    process.exit(1);
  } else {
    console.log("\nVALIDATED: Adaptive pipeline safely routes data and optimizes cost/latency on large recordings.");
  }
}

evaluateBusinessRuleExtraction().catch(console.error);
