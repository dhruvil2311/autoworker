import type {
  NormalizedDemonstration,
  ProcessGeneralization,
  ProcessGap,
  BusinessProcessSpecification,
  Observation
} from "./index.js";
import type { SemanticBPIProvider } from "./ai.js";
import { LLMSemanticProvider, MockSemanticProvider } from "./ai.js";
import { DeterministicEvidenceExtractor } from "./deterministic.js";
import { CandidateReconciler } from "./reconciler.js";
import { GapDetector } from "./gaps.js";
import { SpecificationBuilder } from "./specification.js";
import { ObservationCompressionEngine } from "./compression.js";
import { ComplexityAnalyzer } from "./complexity.js";

export class BusinessProcessIntelligence {
  private extractor = new DeterministicEvidenceExtractor();
  private reconciler = new CandidateReconciler();
  private gapDetector = new GapDetector();
  private specBuilder = new SpecificationBuilder();
  private compressor = new ObservationCompressionEngine();
  private complexityAnalyzer = new ComplexityAnalyzer();

  constructor(private readonly provider: SemanticBPIProvider = new LLMSemanticProvider()) {}

  async processDemonstration(
    demo: NormalizedDemonstration, 
    contextStr: string = "",
    forcePipeline?: "RAW" | "COMPRESSED"
  ): Promise<{
    generalization: ProcessGeneralization;
    gaps: ProcessGap[];
    specification: BusinessProcessSpecification;
  }> {
    const observations = demo.observations.map(obs => ({ ...obs }));

    // 1. Deterministic Extraction Phase
    const deterministicDataFlow = this.extractor.extractDataFlow(observations);
    const deterministicValues = this.extractor.extractValues(observations);

    // 2. Adaptive Decision Engine & Compression
    const complexityMetrics = this.complexityAnalyzer.analyze(observations);
    let semanticTimeline: Observation[] | any[] = observations;
    
    // Threshold for enabling compression
    // [REDESIGN - VALIDATION FAILED]
    // Adaptive compression is mathematically unsafe because altering token structure shifts LLM attention,
    // resulting in 0% Business Rule recall and fabricated semantics during zero-shot inference.
    // Compression is strictly disabled until Semantic Analysis (Priority 2) replaces string-matching.
    if (forcePipeline === "COMPRESSED") {
      console.warn(`[WARNING] Forcing UNSAFE compression pipeline for testing.`);
      semanticTimeline = await this.compressor.compress(observations);
    } else {
      if (!forcePipeline) console.log(`[Adaptive Decision] BYPASSING compression to preserve 100% semantic safety. Benefit score ignored.`);
    }

    // 3. Semantic Inference Phase (Executed sequentially to avoid 429 quota/rate limit exhaustion on free tiers)
    const targets = Object.fromEntries(observations.filter(o => o.target).map(o => [o.sequence, o.target]));
    
    const intentInference = await this.provider.inferBusinessIntent(semanticTimeline);
    const entitiesInference = Object.keys(targets).length > 0 
      ? await this.provider.inferEntities(targets) 
      : {};
    const valueClassifications = Object.keys(deterministicValues).length > 0 
      ? await this.provider.classifyAmbiguousValues(deterministicValues, contextStr) 
      : {};
    const structureInference = await this.provider.inferProcessStructure(semanticTimeline);
    const businessRulesRaw = await this.provider.inferPotentialBusinessRules(semanticTimeline);
    const ambiguities = await this.provider.identifySemanticAmbiguities(semanticTimeline);

    // 4. Reconciliation & Candidate Generation
    const entities = this.reconciler.reconcileEntities(observations, entitiesInference);
    const variables = this.reconciler.reconcileVariables(observations, valueClassifications, deterministicDataFlow);
    
    // 5. Generalization
    const generalization: ProcessGeneralization = {
      workflow_intent: {
        value: intentInference.intent,
        confidence: intentInference.confidence,
        classification: "INFERRED_RULE",
        evidence: [],
        reasoningSummary: intentInference.reasoning
      },
      facts: [
        { 
          value: `Demonstration contains ${observations.length} actions.`, 
          confidence: 1.0, 
          classification: "OBSERVED_FACT",
          evidence: [] 
        }
      ],
      variables,
      data_flow: deterministicDataFlow,
      structure: {
        value: structureInference.structure,
        confidence: structureInference.confidence,
        classification: "INFERRED_RULE",
        evidence: [],
        reasoningSummary: structureInference.reasoning
      },
      businessRules: businessRulesRaw.map(rule => ({
        value: rule,
        confidence: 0.7,
        classification: "INFERRED_RULE" as const,
        evidence: []
      })),
      ambiguities
    };

    // 6. Gap Detection
    const gaps = this.gapDetector.detectGaps(generalization);

    // 7. Specification Generation
    const specification = this.specBuilder.generateSpecification(demo, generalization, gaps);

    return { generalization, gaps, specification };
  }

  public applyClarificationAnswer(spec: BusinessProcessSpecification, gapId: string, answer: string, actor: string): BusinessProcessSpecification {
    return this.specBuilder.applyClarificationAnswer(spec, gapId, answer, actor);
  }
}
