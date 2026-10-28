import type { Observation } from "./index.js";

export interface ComplexityMetrics {
  totalEventCount: number;
  uniqueDomTargets: number;
  duplicateInteractionRatio: number;
  mouseMovementRatio: number;
  scrollRatio: number;
  typingRatio: number;
  navigationCount: number;
  pageTransitions: number;
  screenshotCount: number;
  estimatedPromptTokens: number;
  interactionEntropy: number;
  domMutationDensity: number;
  averageEventSpacingMs: number;

  complexityScore: number;           // 0 - 100
  estimatedCompressionBenefit: number; // 0 - 1
  estimatedLatencySavingsMs: number;
  estimatedTokenSavings: number;
  estimatedAccuracyImpact: number;   // e.g. -0.05 to +0.05
}

export class ComplexityAnalyzer {
  public analyze(observations: Observation[]): ComplexityMetrics {
    if (!observations || observations.length === 0) {
      return this.emptyMetrics();
    }

    const totalEventCount = observations.length;
    const uniqueTargets = new Set<string>();
    let duplicateInteractions = 0;
    
    let clickCount = 0;
    let inputCount = 0;
    let navCount = 0;
    let pageTransitions = 0;

    let totalTimeSpacing = 0;
    let previousTime: Date | null = null;
    let previousUrl: string | null = null;
    
    let previousTargetStr: string | null = null;

    for (const obs of observations) {
      if (obs.target?.dom_evidence) {
        const targetStr = JSON.stringify(obs.target.dom_evidence);
        uniqueTargets.add(targetStr);
        if (targetStr === previousTargetStr && obs.action === "CLICK") {
          duplicateInteractions++;
        }
        previousTargetStr = targetStr;
      } else {
        previousTargetStr = null;
      }

      if (obs.action === "CLICK") clickCount++;
      if (obs.action === "INPUT" || obs.action === "KEYBOARD") inputCount++;
      if (obs.action === "NAVIGATE") navCount++;

      if (obs.context?.url && obs.context.url !== previousUrl) {
        if (previousUrl !== null) {
          pageTransitions++;
        }
        previousUrl = obs.context.url;
      }

      if (obs.timestamp) {
        const current = new Date(obs.timestamp);
        if (previousTime) {
          totalTimeSpacing += Math.abs(current.getTime() - previousTime.getTime());
        }
        previousTime = current;
      }
    }

    const uniqueDomTargets = uniqueTargets.size;
    const duplicateInteractionRatio = totalEventCount > 0 ? duplicateInteractions / totalEventCount : 0;
    const typingRatio = totalEventCount > 0 ? inputCount / totalEventCount : 0;
    const averageEventSpacingMs = totalEventCount > 1 ? totalTimeSpacing / (totalEventCount - 1) : 0;
    
    // Estimate tokens: roughly 4 chars per token for JSON payload
    const rawString = JSON.stringify(observations);
    const estimatedPromptTokens = Math.ceil(rawString.length / 4);

    // Compute synthetic ratios for unsupported features so architecture is ready
    const mouseMovementRatio = 0; 
    const scrollRatio = 0;
    const screenshotCount = 0;
    const domMutationDensity = 0.1; // Default
    
    // Interaction Entropy (higher if many different targets are interacted with sparsely)
    const interactionEntropy = totalEventCount > 0 ? uniqueDomTargets / totalEventCount : 0;

    // Complexity Score (0-100)
    // Increases with total events, unique targets, and transitions.
    let score = (totalEventCount * 0.5) + (uniqueDomTargets * 2) + (pageTransitions * 5);
    score = Math.min(100, Math.max(0, score));

    // Benefit (0-1)
    // Small files (e.g. 1 event) have negative benefit.
    // Large files with many duplicates and events have high benefit.
    let benefit = 0;
    if (totalEventCount > 10 || pageTransitions > 1 || duplicateInteractionRatio > 0.2) {
      // It's worth compressing
      benefit = 0.5 + (duplicateInteractionRatio * 0.5);
    }
    
    if (totalEventCount < 5) {
      benefit = 0; // Not worth it
    }

    // Estimated Savings
    const compressionOverheadLatency = 500 + (totalEventCount * 10); // rough estimate of LLM latency to compress
    const rawInferenceLatency = 1500 + (totalEventCount * 50); // raw processing latency
    const compressedInferenceLatency = 1500 + ((totalEventCount * (1 - benefit)) * 50); // compressed processing latency
    const estimatedLatencySavingsMs = rawInferenceLatency - (compressedInferenceLatency + compressionOverheadLatency);

    const rawCost = estimatedPromptTokens;
    const compressedCost = Math.ceil(estimatedPromptTokens * (1 - benefit));
    const estimatedTokenSavings = rawCost - compressedCost;

    // Accuracy Impact: Compression might slightly drop accuracy if it over-summarizes
    const estimatedAccuracyImpact = benefit > 0.8 ? -0.02 : 0.01;

    return {
      totalEventCount,
      uniqueDomTargets,
      duplicateInteractionRatio,
      mouseMovementRatio,
      scrollRatio,
      typingRatio,
      navigationCount: navCount,
      pageTransitions,
      screenshotCount,
      estimatedPromptTokens,
      interactionEntropy,
      domMutationDensity,
      averageEventSpacingMs,
      complexityScore: score,
      estimatedCompressionBenefit: benefit,
      estimatedLatencySavingsMs,
      estimatedTokenSavings,
      estimatedAccuracyImpact
    };
  }

  private emptyMetrics(): ComplexityMetrics {
    return {
      totalEventCount: 0,
      uniqueDomTargets: 0,
      duplicateInteractionRatio: 0,
      mouseMovementRatio: 0,
      scrollRatio: 0,
      typingRatio: 0,
      navigationCount: 0,
      pageTransitions: 0,
      screenshotCount: 0,
      estimatedPromptTokens: 0,
      interactionEntropy: 0,
      domMutationDensity: 0,
      averageEventSpacingMs: 0,
      complexityScore: 0,
      estimatedCompressionBenefit: 0,
      estimatedLatencySavingsMs: 0,
      estimatedTokenSavings: 0,
      estimatedAccuracyImpact: 0
    };
  }
}
