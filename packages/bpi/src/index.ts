export interface NormalizedDemonstration {
  recording_id: string;
  tenant_id: string;
  source: string;
  started_at: string;
  ended_at: string | null;
  observations: Observation[];
}

export interface Observation {
  sequence: number;
  timestamp: string;
  action: "CLICK" | "INPUT" | "NAVIGATE" | "SUBMIT" | "KEYBOARD" | "EXTRACT" | "WAIT";
  context: {
    url: string;
    page_title: string;
  };
  target?: BusinessEntityCandidate;
  value?: VariableCandidate;
}

export interface SemanticEvent {
  description: string;
  original_sequences: number[];
  timestamp: string;
  context_url?: string;
}

export type FactType = "OBSERVED_FACT" | "INFERRED_RULE" | "ASSUMPTION" | "UNKNOWN";

export interface EvidenceReference {
  type: "OBSERVATION" | "EVENT" | "PAGE_STATE" | "DOM_NODE" | "SCREENSHOT";
  id: string;
  description: string;
}

export interface Inference<T> {
  value: T;
  confidence: number;
  classification: FactType;
  evidence: EvidenceReference[];
  reasoningSummary?: string;
}

export interface BusinessEntityCandidate {
  semantic_name?: Inference<string>; 
  dom_evidence: {
    tag: string;
    role?: string;
    name?: string;
    text?: string;
    attributes: Record<string, string>;
  };
}

export type VariableClassification = 
  | "CONSTANT" 
  | "EXAMPLE_VALUE" 
  | "RUNTIME_VARIABLE" 
  | "EXTRACTED_VALUE" 
  | "DERIVED_VALUE" 
  | "USER_INPUT" 
  | "CONFIGURATION" 
  | "SECRET_REFERENCE";

export interface VariableCandidate {
  raw_value?: string;
  is_sensitive: boolean;
  placeholder?: string;
  classification: Inference<VariableClassification>;
  inferred_type?: Inference<"string" | "number" | "boolean" | "date">;
  semantic_role?: Inference<string>;
}

export interface DataFlowEdge {
  source_observation_sequence: number; 
  target_observation_sequence: number; 
  variable_name: string;
}

export interface ProcessGeneralization {
  workflow_intent: Inference<string>;
  facts: Inference<string>[];
  variables: Record<string, VariableCandidate>;
  data_flow: DataFlowEdge[];
  structure: Inference<ProcessStructure>;
  businessRules: Inference<string>[];
  ambiguities: string[];
}

export interface ProcessStructure {
  type: "LINEAR" | "LOOP" | "CONDITIONAL";
  steps: number[];
  condition?: string;
  children?: ProcessStructure[];
}

export type GapCategory = 
  | "SCOPE" 
  | "SOURCE_OF_TRUTH" 
  | "MATCHING" 
  | "TRIGGER" 
  | "MISSING_RECORD" 
  | "DUPLICATE" 
  | "BUSINESS_RULE" 
  | "TRANSFORMATION" 
  | "FAILURE_POLICY" 
  | "SAFETY" 
  | "SUCCESS_CRITERIA" 
  | "AUTHENTICATION" 
  | "DATA_SOURCE"
  | "ITERATION";

export interface ProcessGap {
  gap_id: string;
  category: GapCategory;
  description: string;
  why_it_matters: string;
  risk_level: "HIGH" | "MEDIUM" | "LOW";
  blocking: boolean;
  related_inference?: any;
  supporting_evidence: EvidenceReference[];
  suggested_question?: ClarificationQuestion;
  discover_during_test: boolean;
}

export interface ClarificationQuestion {
  question_text: string;
  suggested_options?: string[];
}

export type BPSLifecycleState = 
  | "ANALYZING"
  | "NEEDS_CLARIFICATION"
  | "READY_FOR_TEST_COMPILATION"
  | "TESTING"
  | "NEEDS_REFINEMENT"
  | "READY_FOR_APPROVAL"
  | "APPROVED"
  | "SUPERSEDED";

export interface BusinessProcessSpecification {
  id: string;
  version: string;
  status: BPSLifecycleState;
  identity: {
    process_id: string;
    name: string;
  };
  intent: string;
  steps: Observation[];
  systems: string[];
  scope: string;
  entities: Record<string, any>;
  variables: Record<string, VariableCandidate>;
  dataSources: any[];
  dataFlow: DataFlowEdge[];
  matchingRules: any[];
  businessRules: any[];
  transformations: any[];
  exceptionPolicies: any[];
  safetyPolicies: any[];
  successCriteria: string[];
  assumptions: string[];
  unresolvedGaps: ProcessGap[];
  confidence: number;
}

export * from "./pipeline.js";
export * from "./document-parser.js";
