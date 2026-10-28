import { z } from 'zod';

export const BusinessBeliefSchema = z.object({
  beliefId: z.string().uuid(),
  semanticMeaning: z.string(),
  structuredRule: z.any(),
  confidence: z.number(),
  evidenceCount: z.number(),
  supportingEvidence: z.array(z.string()),
  source: z.string(),
  sourceType: z.string(),
  author: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: z.enum(['ACTIVE', 'SUPERSEDED', 'RETIRED', 'CONFLICTED', 'EXPERIMENTAL', 'DRAFT', 'OBSERVED', 'VALIDATED', 'ARCHIVED']),
  supersededBy: z.string().uuid().optional(),
  supersedes: z.string().uuid().optional(),
  businessContext: z.object({
    region: z.string().optional(),
    department: z.string().optional(),
    season: z.string().optional(),
    workflow: z.string().optional()
  }),
  cognitiveAnalysis: z.object({
    detectedAmbiguities: z.array(z.string()).optional(),
    implicitAssumptions: z.array(z.string()).optional()
  }).optional(),
  reasoningTrace: z.string(),
  clarificationHistory: z.array(z.string()),
  versionHistory: z.array(z.string())
});

export type BusinessBelief = z.infer<typeof BusinessBeliefSchema>;

export const CandidateCourseSchema = z.object({
  id: z.string().uuid(),
  businessDescription: z.string(),
  industry: z.string(),
  objective: z.string(),
  inputs: z.array(z.string()), // e.g. ["Chrome Extension", "CSV"]
  observedRules: z.array(BusinessBeliefSchema),
  observedVariables: z.array(z.string()),
  observedLoops: z.array(z.string()),
  observedDecisions: z.array(z.string()),
  clarifications: z.array(z.string()),
  corrections: z.array(z.string()),
  finalBPS: z.any(), // The final Business Process Spec
  executionPlan: z.any(),
  executionHistory: z.array(z.any()),
  lessonsLearned: z.array(z.string()),
  knowledgeDelta: z.any(),
  status: z.enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED'])
});

export type CandidateCourse = z.infer<typeof CandidateCourseSchema>;

export const ApprovedCourseSchema = CandidateCourseSchema.extend({
  difficulty: z.enum(['Small', 'Medium', 'Large', 'Expert']),
  businessDomain: z.string(),
  automationType: z.string(),
  risk: z.enum(['Low', 'Medium', 'High']),
  requiredKnowledge: z.array(z.string()),
  expectedCompetencies: z.array(z.string()),
  version: z.string() // Semantic version, e.g. v1.0.0
});

export type ApprovedCourse = z.infer<typeof ApprovedCourseSchema>;
