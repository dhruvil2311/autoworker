import { BusinessBelief } from './schema.js';
import { CognitiveSemanticAnalyzer, CognitiveAssessment, RelationshipType } from './cognitive-analyzer.js';

export type ConflictType = 
  | 'Threshold Conflict'
  | 'Value Conflict'
  | 'Workflow Conflict'
  | 'Temporal Conflict'
  | 'Regional Conflict'
  | 'Department Conflict'
  | 'Authority Conflict'
  | 'Semantic Conflict';

export interface ConflictResolution {
  resolved: boolean;
  resolutionStrategy?: 'Context Resolution' | 'Authority Resolution' | 'Temporal Resolution' | 'Clarification' | 'HITL';
  resultingBeliefs: BusinessBelief[];
  escalationReason?: string;
  clarificationQuestion?: string;
}

export class BeliefConflictEngine {
  private cognitiveAnalyzer = new CognitiveSemanticAnalyzer();

  /**
   * Detects if there is a conflict between the new belief and any existing belief.
   */
  public detectConflicts(newBelief: BusinessBelief, existingBeliefs: BusinessBelief[]): { conflictingBelief?: BusinessBelief, conflictType?: ConflictType, assessment?: CognitiveAssessment } {
    for (const existing of existingBeliefs) {
      if (existing.status !== 'ACTIVE' && existing.status !== 'VALIDATED') {
        continue;
      }
      
      const assessment = this.cognitiveAnalyzer.analyzeRelationship(newBelief, existing);
      
      if (assessment.isRelated) {
         // Embed the cognitive assessment into the new belief
         newBelief.cognitiveAnalysis = {
             detectedAmbiguities: assessment.detectedAmbiguities,
             implicitAssumptions: assessment.implicitAssumptions
         };
         newBelief.reasoningTrace = assessment.reasoningTrace;

         if (assessment.relationshipType === 'CONTRADICTORY' || assessment.relationshipType === 'AMBIGUOUS' || assessment.relationshipType === 'SUBSUMED') {
            
            if (newBelief.businessContext?.region !== existing.businessContext?.region) {
              return { conflictingBelief: existing, conflictType: 'Regional Conflict', assessment };
            }
            if (newBelief.businessContext?.department !== existing.businessContext?.department) {
              return { conflictingBelief: existing, conflictType: 'Department Conflict', assessment };
            }
            if (newBelief.businessContext?.season !== existing.businessContext?.season) {
              return { conflictingBelief: existing, conflictType: 'Temporal Conflict', assessment };
            }
            if (newBelief.author !== existing.author) {
               if ((newBelief.author === 'CEO' && existing.author !== 'CEO') || (newBelief.author !== 'CEO' && existing.author === 'CEO')) {
                  return { conflictingBelief: existing, conflictType: 'Authority Conflict', assessment };
               }
            }

            if (newBelief.semanticMeaning.includes('>') && existing.semanticMeaning.includes('>')) {
               return { conflictingBelief: existing, conflictType: 'Threshold Conflict', assessment };
            }

            return { conflictingBelief: existing, conflictType: 'Semantic Conflict', assessment };
         }
      }
    }
    
    return {};
  }

  /**
   * Attempts to resolve a detected conflict between a new belief and an existing one.
   */
  public resolveConflict(newBelief: BusinessBelief, existingBelief: BusinessBelief, conflictType: ConflictType, assessment?: CognitiveAssessment): ConflictResolution {
    const updatedExisting = { ...existingBelief };
    const updatedNew = { ...newBelief };

    if (assessment?.relationshipType === 'AMBIGUOUS' || assessment?.relationshipType === 'SUBSUMED') {
      updatedNew.status = 'CONFLICTED';
      return {
        resolved: false,
        resolutionStrategy: 'Clarification',
        resultingBeliefs: [updatedExisting, updatedNew],
        clarificationQuestion: assessment.detectedAmbiguities?.[0] || assessment.reasoningTrace
      };
    }

    // 1. Context Resolution
    if (['Regional Conflict', 'Department Conflict', 'Temporal Conflict'].includes(conflictType)) {
      // Both are valid under different contexts, store both
      updatedNew.status = 'ACTIVE';
      updatedNew.reasoningTrace = `Context Resolution: Kept alongside ${existingBelief.beliefId} due to different context (${conflictType}).`;
      return {
        resolved: true,
        resolutionStrategy: 'Context Resolution',
        resultingBeliefs: [updatedExisting, updatedNew]
      };
    }

    // 2. Authority Resolution
    if (conflictType === 'Authority Conflict') {
      const newIsCeo = newBelief.author === 'CEO';
      const existingIsCeo = existingBelief.author === 'CEO';
      
      if (newIsCeo && !existingIsCeo) {
        updatedExisting.status = 'SUPERSEDED';
        updatedExisting.supersededBy = newBelief.beliefId;
        updatedNew.supersedes = existingBelief.beliefId;
        updatedNew.status = 'ACTIVE';
        updatedNew.reasoningTrace = `Authority Resolution: CEO overrides ${existingBelief.author}.`;
        return {
          resolved: true,
          resolutionStrategy: 'Authority Resolution',
          resultingBeliefs: [updatedExisting, updatedNew]
        };
      } else if (!newIsCeo && existingIsCeo) {
        updatedNew.status = 'RETIRED'; // Or rejected
        updatedNew.reasoningTrace = `Authority Resolution: Cannot override CEO policy.`;
        return {
          resolved: true,
          resolutionStrategy: 'Authority Resolution',
          resultingBeliefs: [updatedExisting, updatedNew] // Keep existing active, new is retired
        };
      }
    }

    // 3. Temporal Resolution (e.g. general policy update for same context)
    if (conflictType === 'Semantic Conflict' || conflictType === 'Threshold Conflict' || conflictType === 'Value Conflict') {
        // If authors are same, and it's not explicitly flagged as human inconsistency
        if (newBelief.author === existingBelief.author && !newBelief.reasoningTrace?.includes('Human inconsistency')) {
            updatedExisting.status = 'SUPERSEDED';
            updatedExisting.supersededBy = newBelief.beliefId;
            updatedNew.supersedes = existingBelief.beliefId;
            updatedNew.status = 'ACTIVE';
            updatedNew.reasoningTrace = `Temporal Resolution: New policy supersedes old. (Cognitive Trace: ${newBelief.reasoningTrace})`;
            return {
                resolved: true,
                resolutionStrategy: 'Temporal Resolution',
                resultingBeliefs: [updatedExisting, updatedNew]
            };
        }
    }
    
    // 4. Clarification / Escalation
    // If not resolved above, check confidence
    if (newBelief.confidence < 0.8) {
      updatedNew.status = 'CONFLICTED';
      return {
        resolved: false,
        resolutionStrategy: 'HITL',
        resultingBeliefs: [updatedExisting, updatedNew],
        escalationReason: `Unresolved ${conflictType} with low confidence.`
      };
    } else {
      updatedNew.status = 'CONFLICTED';
      return {
        resolved: false,
        resolutionStrategy: 'Clarification',
        resultingBeliefs: [updatedExisting, updatedNew],
        clarificationQuestion: `There is a ${conflictType} between "${newBelief.semanticMeaning}" (${newBelief.author}) and "${existingBelief.semanticMeaning}" (${existingBelief.author}). Which policy should be active?`
      };
    }
  }
  

}
