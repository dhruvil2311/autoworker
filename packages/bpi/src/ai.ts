import type { 
  Observation, 
  SemanticEvent,
  VariableClassification,
  ProcessStructure
} from "./index.js";

export interface SemanticBPIProvider {
  inferBusinessIntent(events: Observation[] | SemanticEvent[]): Promise<{ intent: string; confidence: number; reasoning: string }>;
  inferEntities(targets: Record<number, any>): Promise<Record<number, { name: string; confidence: number; reasoning: string }>>;
  classifyAmbiguousValues(values: Record<string, string>, context: string): Promise<Record<string, { classification: VariableClassification; type: "string" | "number" | "boolean" | "date"; semantic_role: string; confidence: number; reasoning: string }>>;
  inferProcessStructure(events: Observation[] | SemanticEvent[]): Promise<{ structure: ProcessStructure; confidence: number; reasoning: string }>;
  inferPotentialBusinessRules(events: Observation[] | SemanticEvent[]): Promise<string[]>;
  identifySemanticAmbiguities(events: Observation[] | SemanticEvent[]): Promise<string[]>;
}

import { extractStructuredData } from "./llm.js";

export class LLMSemanticProvider implements SemanticBPIProvider {
  async inferBusinessIntent(events: Observation[] | SemanticEvent[]) {
    const schema = `{ "intent": "string", "confidence": "number (0-1)", "reasoning": "string" }`;
    const prompt = `Analyze these events and infer the overall business intent: ${JSON.stringify(events)}`;
    const res = await extractStructuredData<{ intent: string, confidence: number, reasoning: string }>(prompt, schema);
    return {
      intent: res?.intent || "Business Process Automation",
      confidence: typeof res?.confidence === "number" ? res.confidence : 1.0,
      reasoning: res?.reasoning || "Extracted from observations"
    };
  }

  async inferEntities(targets: Record<number, any>) {
    const schema = `{ "entities": { "[sequence_number]": { "name": "string", "confidence": "number (0-1)", "reasoning": "string" } } }`;
    const prompt = `Analyze these DOM targets and infer business entities: ${JSON.stringify(targets)}`;
    const res = await extractStructuredData<{ entities: Record<number, { name: string, confidence: number, reasoning: string }> }>(prompt, schema);
    return res?.entities || {};
  }

  async classifyAmbiguousValues(values: Record<string, string>, context: string) {
    const schema = `{ "classifications": { "[key]": { "classification": "CONSTANT|EXAMPLE_VALUE|RUNTIME_VARIABLE|EXTRACTED_VALUE|DERIVED_VALUE|USER_INPUT|CONFIGURATION|SECRET_REFERENCE", "type": "string|number|boolean|date", "semantic_role": "string", "confidence": "number (0-1)", "reasoning": "string" } } }`;
    const prompt = `Context: ${context}\nValues: ${JSON.stringify(values)}\nClassify the values.`;
    const res = await extractStructuredData<{ classifications: any }>(prompt, schema);
    return res?.classifications || {};
  }

  async inferProcessStructure(events: Observation[] | SemanticEvent[]) {
    const schema = `{ "structure": { "type": "LINEAR|LOOP|CONDITIONAL", "steps": [ "number" ], "condition": "string", "children": [] }, "confidence": "number (0-1)", "reasoning": "string" }`;
    const prompt = `Analyze these events and infer process structure: ${JSON.stringify(events)}`;
    const res = await extractStructuredData<{ structure: ProcessStructure, confidence: number, reasoning: string }>(prompt, schema);
    return {
      structure: res?.structure || { type: "LINEAR" as const, steps: (events as any[]).map(e => e.sequence) },
      confidence: typeof res?.confidence === "number" ? res.confidence : 1.0,
      reasoning: res?.reasoning || "Linear sequence"
    };
  }

  async inferPotentialBusinessRules(events: Observation[] | SemanticEvent[]) {
    if (!events || !Array.isArray(events)) return [];
    
    const schema = `{ "rules": [ "string" ], "confidence": "number (0-1)", "reasoning": "string" }`;
    const prompt = `Analyze these events and infer any implicit business rules, thresholds, exceptions, or loop logic. Return a concise list of rules.\nEvents: ${JSON.stringify(events)}`;
    const res = await extractStructuredData<{ rules: string[], confidence: number, reasoning: string }>(prompt, schema);
    return res?.rules || [];
  }

  async identifySemanticAmbiguities(events: Observation[] | SemanticEvent[]) {
    if (!events || !Array.isArray(events)) return [];
    
    const schema = `{ "ambiguities": [ "string" ] }`;
    const prompt = `Identify semantic ambiguities in these events: ${JSON.stringify(events)}`;
    const res = await extractStructuredData<{ ambiguities: string[] }>(prompt, schema);
    return res?.ambiguities || [];
  }
}

// Keep export for backward compatibility during transition
export { LLMSemanticProvider as MockSemanticProvider };
