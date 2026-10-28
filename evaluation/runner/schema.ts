export interface BrowserDemonstration {
  id: string;
  url: string;
  events: any[]; // Simplified for this prototype
  intentionalObstacle?: string;
}

export interface ScenarioDefinition {
  id: string;
  businessDescription: string;
  industry: string;
  goal: string;
  sop: string;
  csv: Record<string, string>[];
  apiMetadata?: Record<string, any>;
  browserDemonstrations: BrowserDemonstration[];
  merchantClarificationAnswers: Record<string, string>;
  expectedBusinessProcessSpecification: Record<string, any>;
  expectedExecutionPlan: Record<string, any>;
  expectedRuntimeBehaviour: string[];
  expectedLearningAfterCorrection: string;
}

export interface EvaluationMetrics {
  pipelineAccuracy: number;
  businessUnderstandingScore: number;
  clarificationScore: number;
  knowledgeRetentionScore: number;
  executionScore: number;
  learningScore: number;
  overallGhostScore: number;
}
