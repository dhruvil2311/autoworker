import { z } from "zod";

export type OpenRouterErrorType =
  | "INVALID_REQUEST"
  | "AUTH_ERROR"
  | "PAYMENT_REQUIRED"
  | "ACCESS_DENIED"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "AI_QUOTA_EXHAUSTED"
  | "COST_GUARD_VIOLATION"
  | "MALFORMED_OUTPUT"
  | "OUTPUT_TRUNCATED"
  | "UNKNOWN_ERROR";

export class OpenRouterError extends Error {
  constructor(
    public readonly type: OpenRouterErrorType,
    message: string,
    public readonly statusCode?: number | undefined,
    public readonly details?: any
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

export interface FrameEvidence {
  frameId: string;
  timestamp: number;
  base64?: string | undefined;
  thumbnailPath?: string | undefined;
  imagePath?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
}

export interface OcrFact {
  text: string;
  box?: [number, number, number, number] | undefined;
  confidence?: number | undefined;
  timestamp?: number | undefined;
  frameId?: string | undefined;
}

export interface EvidenceEpisode {
  episodeId: string;
  timestampStart: number;
  timestampEnd: number;
  application: string;
  windowTitle?: string | undefined;
  before: {
    frames: FrameEvidence[];
    ocr: OcrFact[];
    uiState?: Record<string, any> | undefined;
  };
  action: {
    type: "CLICK" | "TYPE" | "NAVIGATE" | "SELECT" | "KEYPRESS" | "WAIT" | "HOTKEY" | "HOVER" | "UNKNOWN";
    targetText?: string | undefined;
    coordinates?: { x: number; y: number } | undefined;
    value?: string | undefined;
    source: "cursor-analysis" | "ocr-mutation" | "dom-event" | "inferred" | "native-event";
    confidence: number;
  };
  after: {
    frames: FrameEvidence[];
    ocr: OcrFact[];
    uiState?: Record<string, any> | undefined;
  };
}

export interface SemanticEvidencePacket {
  packetId: string;
  taskContext: string;
  activeApplication: string;
  episodes: EvidenceEpisode[];
  ocrFacts: string[];
  nativeEvents?: any[] | undefined;
  confidence: number;
  timestamps: { start: number; end: number };
  keyFrames?: FrameEvidence[] | undefined;
  /** Timestamped OCR lines for this packet's time range (preferred over the flat ocrFacts list). */
  timedOcr?: Array<{ text: string; timestamp?: number | undefined; frameId?: string | undefined }> | undefined;
  /** Summary of actions already reconstructed from earlier segments of the same recording. */
  precedingActions?: Array<{ action: string; target?: string | undefined; value?: string | undefined }> | undefined;
  segment?: { index: number; total: number } | undefined;
}

export const SemanticActionSchema = z.object({
  action: z.string(),
  arguments: z.record(z.any()).default({}),
  application: z.string().default("Browser"),
  evidenceEpisodeIds: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0),
  // An action the model did not explicitly mark as observed is not treated as observed.
  evidenceStatus: z.enum(["OBSERVED", "INFERRED", "UNKNOWN"]).default("UNKNOWN"),
  rationale: z.string().optional()
});

export type SemanticAction = z.infer<typeof SemanticActionSchema>;

export const ProcessUnderstandingResultSchema = z.object({
  taskIntent: z.string().default(""),
  applicationEnvironment: z.string().default("Web Browser"),
  processStructure: z.object({
    type: z.enum(["LINEAR", "LOOP", "CONDITIONAL"]).default("LINEAR"),
    stepIndices: z.array(z.number()).default([])
  }).default({ type: "LINEAR", stepIndices: [] }),
  variables: z.array(z.object({
    name: z.string(),
    type: z.enum(["string", "number", "boolean", "date"]).default("string"),
    classification: z.enum([
      "CONSTANT",
      "EXAMPLE_VALUE",
      "RUNTIME_VARIABLE",
      "EXTRACTED_VALUE",
      "DERIVED_VALUE"
    ]).default("RUNTIME_VARIABLE"),
    semanticRole: z.string().default("field"),
    defaultValue: z.any().optional()
  })).default([]),
  businessRules: z.array(z.object({
    rule: z.string(),
    confidence: z.number().min(0).max(1).default(0.8),
    reasoning: z.string().default("")
  })).default([]),
  expectedOutcomes: z.array(z.string()).default([]),
  exceptions: z.array(z.object({
    triggerCondition: z.string(),
    fallbackAction: z.string()
  })).default([]),
  confidence: z.number().min(0).max(1).default(0.85)
});

export type ProcessUnderstandingResult = z.infer<typeof ProcessUnderstandingResultSchema>;

export const SemanticActionsResultSchema = z.object({
  semanticActions: z.array(SemanticActionSchema).default([]),
  discardedNoise: z.array(z.string()).default([]),
  /** Things the model saw but could not interpret; surfaced to the user, never dropped. */
  unresolved: z.array(z.string()).default([]),
  processUnderstanding: ProcessUnderstandingResultSchema.optional()
});

export type SemanticActionsResult = z.infer<typeof SemanticActionsResultSchema>;

export interface ProcessReasoningContext {
  objective?: string | undefined;
  variables?: Array<{ name: string; type: string; exampleValue?: any }> | undefined;
  uncertainties?: string[] | undefined;
  tenantId?: string | undefined;
  workerId?: string | undefined;
}

export interface CriticResult {
  passed: boolean;
  unsupportedSteps: string[];
  hallucinatedVariables: string[];
  clutterDetected: string[];
  suggestions: string[];
}

export interface VisionReasoningProvider {
  extractSemanticActions(packet: SemanticEvidencePacket): Promise<SemanticActionsResult>;
  compileProcessUnderstanding(
    semanticActions: SemanticAction[],
    context: ProcessReasoningContext
  ): Promise<ProcessUnderstandingResult>;
  critiqueWorkflow?(workflow: any, evidence: SemanticEvidencePacket): Promise<CriticResult>;
}
