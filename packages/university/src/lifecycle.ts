import { CandidateCourse, ApprovedCourse, BusinessBelief } from './schema.js';
import { BeliefConflictEngine } from './conflict-engine.js';

export class KnowledgeLifecycleManager {
  /**
   * Promotes a Candidate Course to an Approved Course, applying versioning and metadata.
   */
  approveCandidate(
    candidate: CandidateCourse, 
    metadata: {
      difficulty: 'Small' | 'Medium' | 'Large' | 'Expert';
      businessDomain: string;
      automationType: string;
      risk: 'Low' | 'Medium' | 'High';
      requiredKnowledge: string[];
      expectedCompetencies: string[];
    },
    previousVersion?: ApprovedCourse
  ): ApprovedCourse {
    let nextVersion = 'v1.0.0';
    let retainedRules: BusinessBelief[] = [...candidate.observedRules];

    if (previousVersion) {
      // Basic semantic version bump for course evolution
      const parts = previousVersion.version.replace('v', '').split('.');
      const major = parts[0] ?? '1';
      const minor = parseInt(parts[1] ?? '0', 10) + 1;
      nextVersion = `v${major}.${minor}.0`;
      
      const engine = new BeliefConflictEngine();
      const resultingRules = new Map<string, BusinessBelief>();

      // Seed with existing active rules
      for (const rule of previousVersion.observedRules) {
        if (rule.status === 'ACTIVE' || rule.status === 'VALIDATED') {
           resultingRules.set(rule.beliefId, rule);
        } else {
           resultingRules.set(rule.beliefId, rule); // Keep history
        }
      }

      // Process new rules
      for (const newRule of candidate.observedRules) {
         const existingActive = Array.from(resultingRules.values()).filter(r => r.status === 'ACTIVE');
         const { conflictingBelief, conflictType, assessment } = engine.detectConflicts(newRule, existingActive);
         
         if (conflictingBelief && conflictType) {
             const resolution = engine.resolveConflict(newRule, conflictingBelief, conflictType, assessment);
             
             if (resolution.resolved) {
                 for (const rb of resolution.resultingBeliefs) {
                     resultingRules.set(rb.beliefId, rb);
                 }
             } else {
                 // For test purposes, keep both but mark new as conflicted
                 resultingRules.set(conflictingBelief.beliefId, conflictingBelief);
                 for (const rb of resolution.resultingBeliefs) {
                     if (rb.beliefId === newRule.beliefId) {
                         resultingRules.set(rb.beliefId, rb);
                     }
                 }
                 console.warn(`[Lifecycle] Unresolved conflict (${conflictType}). Action required: ${resolution.clarificationQuestion || resolution.escalationReason}`);
             }
         } else {
             newRule.status = 'ACTIVE';
             resultingRules.set(newRule.beliefId, newRule);
         }
      }

      retainedRules = Array.from(resultingRules.values());
    }

    return {
      ...candidate,
      ...metadata,
      observedRules: retainedRules,
      status: 'APPROVED',
      version: nextVersion
    };
  }

  private retireDeprecatedRules(oldCourse: ApprovedCourse, newCourse: CandidateCourse) {
    // Logic to identify and formally retire rules that existed in oldCourse but contradict newCourse
    console.log(`[Lifecycle] Retiring deprecated rules from ${oldCourse.id}`);
  }
}
