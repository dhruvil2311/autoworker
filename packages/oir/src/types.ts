import { z } from "zod";

// Base primitives for metrics and lineage
export const confidenceSchema = z.number().min(0).max(1);
export const uncertaintySchema = z.string();

export const provenanceSchema = z.object({
  source: z.enum([
    "BROWSER_EVENT",
    "DOM",
    "API_CALL",
    "CSV",
    "EXCEL",
    "SOP",
    "CLARIFICATION",
    "HITL_CORRECTION",
    "LLM_INFERENCE",
    "VIDEO_EVIDENCE",
    "SCREENSHOT_EVIDENCE",
    "DESKTOP_RECORDING"
  ]),
  timestamp: z.string().datetime().optional(),
  evidenceId: z.string().optional(),
  description: z.string().optional(),
  startTimestamp: z.number().optional(),
  endTimestamp: z.number().optional(),
  frameIds: z.array(z.string()).optional()
});

export const evidenceLinkSchema = z.object({
  id: z.string(),
  type: z.string(),
  uri: z.string(),
  excerpt: z.string().optional()
});

export const knowledgeReferenceSchema = z.object({
  id: z.string(),
  topic: z.string(),
  summary: z.string(),
  link: z.string().optional()
});

export const externalSystemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["API", "DATABASE", "WEB_UI", "FILE_SYSTEM", "OTHER"]),
  url: z.string().optional()
});

// Structural metadata
export const variableSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  defaultValue: z.any().optional(),
  description: z.string().optional()
});

export const constantSchema = z.object({
  id: z.string(),
  name: z.string(),
  value: z.any(),
  type: z.string()
});

// Domain modeling
export const businessObjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  properties: z.record(z.string(), z.any()) // Map of property name to schema/type info
});

export const entitySchema = z.object({
  id: z.string(),
  type: z.string(), // Refers to BusinessObject name/id
  value: z.any(),
  confidence: confidenceSchema
});

export const businessRuleSchema = z.object({
  id: z.string(),
  description: z.string(),
  condition: z.string(), // Logic expression
  enforcementLevel: z.enum(["STRICT", "WARNING", "GUIDELINE"])
});

export const dependencySchema = z.object({
  sourceId: z.string(),
  targetId: z.string(),
  type: z.enum(["DATA", "CONTROL", "TIMING", "RESOURCE"])
});

// Execution Nodes
export const baseNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  provenance: z.array(provenanceSchema).optional(),
  confidence: confidenceSchema.optional()
});

export const actionSchema = baseNodeSchema.extend({
  type: z.literal("ACTION"),
  operation: z.string(),
  inputs: z.record(z.string(), z.any()),
  outputs: z.array(z.string()), // Variable IDs
  sideEffects: z.boolean().default(false),
  systemId: z.string().optional()
});

export const conditionSchema = baseNodeSchema.extend({
  type: z.literal("CONDITION"),
  expression: z.string(),
  trueBranchId: z.string().optional(),
  falseBranchId: z.string().optional()
});

export const loopSchema = baseNodeSchema.extend({
  type: z.literal("LOOP"),
  collectionVariableId: z.string(),
  itemVariableId: z.string(),
  bodyNodeId: z.string()
});

export const decisionPointSchema = baseNodeSchema.extend({
  type: z.literal("DECISION_POINT"),
  question: z.string(),
  options: z.array(z.object({
    label: z.string(),
    nextNodeId: z.string()
  }))
});

export const exceptionSchema = baseNodeSchema.extend({
  type: z.literal("EXCEPTION"),
  errorType: z.string(),
  message: z.string(),
  fallbackNodeId: z.string().optional(),
  isFatal: z.boolean().default(false)
});

export const oirNodeSchema = z.discriminatedUnion("type", [
  actionSchema,
  conditionSchema,
  loopSchema,
  decisionPointSchema,
  exceptionSchema
]);

// The Root OIR Graph
export const oirGraphSchema = z.object({
  version: z.literal("1.0"),
  businessGoal: z.string(),
  
  // Definitions
  businessObjects: z.array(businessObjectSchema),
  variables: z.array(variableSchema),
  constants: z.array(constantSchema),
  businessRules: z.array(businessRuleSchema),
  externalSystems: z.array(externalSystemSchema),
  
  // Instance Data
  entities: z.array(entitySchema),
  evidenceLinks: z.array(evidenceLinkSchema),
  knowledgeReferences: z.array(knowledgeReferenceSchema),
  
  // Execution Graph
  nodes: z.array(oirNodeSchema),
  dependencies: z.array(dependencySchema),
  
  // Global Metrics
  globalConfidence: confidenceSchema,
  globalUncertainty: z.array(uncertaintySchema).optional(),
  
  rootNodeId: z.string()
});

// TypeScript Types
export type Confidence = z.infer<typeof confidenceSchema>;
export type Provenance = z.infer<typeof provenanceSchema>;
export type EvidenceLink = z.infer<typeof evidenceLinkSchema>;
export type KnowledgeReference = z.infer<typeof knowledgeReferenceSchema>;
export type ExternalSystem = z.infer<typeof externalSystemSchema>;
export type Variable = z.infer<typeof variableSchema>;
export type Constant = z.infer<typeof constantSchema>;
export type BusinessObject = z.infer<typeof businessObjectSchema>;
export type Entity = z.infer<typeof entitySchema>;
export type BusinessRule = z.infer<typeof businessRuleSchema>;
export type Dependency = z.infer<typeof dependencySchema>;

export type OirNode = z.infer<typeof oirNodeSchema>;
export type ActionNode = z.infer<typeof actionSchema>;
export type ConditionNode = z.infer<typeof conditionSchema>;
export type LoopNode = z.infer<typeof loopSchema>;
export type DecisionPointNode = z.infer<typeof decisionPointSchema>;
export type ExceptionNode = z.infer<typeof exceptionSchema>;

export type OirGraph = z.infer<typeof oirGraphSchema>;
