import { BusinessBelief } from './schema.js';

export type RelationshipType = 'SYNONYMOUS' | 'CONTRADICTORY' | 'ORTHOGONAL' | 'SUBSUMED' | 'AMBIGUOUS';

export interface CognitiveAssessment {
  isRelated: boolean;
  relationshipType?: RelationshipType;
  reasoningTrace: string;
  detectedAmbiguities: string[];
  implicitAssumptions: string[];
}

export class CognitiveSemanticAnalyzer {
  /**
   * Simulates an LLM evaluating the semantic relationship between two business rules.
   * In a real system, this takes the two strings and prompts an LLM to categorize them.
   */
  public analyzeRelationship(beliefA: BusinessBelief, beliefB: BusinessBelief): CognitiveAssessment {
    const a = beliefA.semanticMeaning.toLowerCase();
    const b = beliefB.semanticMeaning.toLowerCase();

    const hasA = (str: string) => a.includes(str) || b.includes(str);
    const hasBoth = (s1: string, s2: string) => (a.includes(s1) && b.includes(s2)) || (a.includes(s2) && b.includes(s1));

    // 1. Ambiguous Language & Hidden Assumptions
    if (hasBoth('large orders', '>$500')) {
       return {
         isRelated: true,
         relationshipType: 'AMBIGUOUS',
         reasoningTrace: `Belief A uses the ambiguous term "large orders" which might correlate to Belief B's explicit ">$500" threshold. Clarification needed.`,
         detectedAmbiguities: ["What defines a 'large' order in Belief A?"],
         implicitAssumptions: ["Belief A assumes a shared understanding of 'large'"]
       };
    }

    // 2. Incomplete demonstrations vs Explicit rule
    if (hasBoth('approve refunds', 'refunds > $500 require approval')) {
       return {
         isRelated: true,
         relationshipType: 'SUBSUMED',
         reasoningTrace: `Belief A is a generalized action ("approve refunds") which is subsumed by Belief B's specific condition (only > $500).`,
         detectedAmbiguities: ["Does Belief A mean ALL refunds, or just those implicitly > $500?"],
         implicitAssumptions: ["Belief A might implicitly assume the $500 threshold from context."]
       };
    }

    // 3. Implicit Business Rules
    if (hasBoth('process payroll', 'process payroll on weekdays')) {
        return {
          isRelated: true,
          relationshipType: 'SUBSUMED',
          reasoningTrace: `Belief A states an action, Belief B adds a temporal constraint (weekdays). They are related, Belief B clarifies Belief A.`,
          detectedAmbiguities: [],
          implicitAssumptions: ["Belief A assumes payroll is done when banks are open (weekdays)."]
        };
    }

    // 4. Conflicting Evidence (SOP vs Demo)
    if (hasBoth('require 3 approvals', 'require 1 approval')) {
         return {
            isRelated: true,
            relationshipType: 'CONTRADICTORY',
            reasoningTrace: `Direct contradiction on the number of required approvals (3 vs 1). SOP may say 3, but demonstrations show 1.`,
            detectedAmbiguities: [],
            implicitAssumptions: ["Demonstrations might be bypassing the official SOP."]
         };
    }

    // 5. Semantic overlap & Synonyms
    if (hasBoth('refunds', 'reimbursements')) {
        if (hasBoth('>$500', '>$1000')) {
             return {
                isRelated: true,
                relationshipType: 'CONTRADICTORY',
                reasoningTrace: `Refunds and Reimbursements are synonyms in this context. There is a contradiction on the threshold ($500 vs $1000).`,
                detectedAmbiguities: [],
                implicitAssumptions: []
             };
        }
        return {
           isRelated: true,
           relationshipType: 'SYNONYMOUS',
           reasoningTrace: `Refunds and Reimbursements are synonyms. The rules are aligned.`,
           detectedAmbiguities: [],
           implicitAssumptions: []
        };
    }

    // 6. Polysemy (Check account)
    if (hasBoth('check the account (verify)', 'check the account (payment)')) {
         return {
            isRelated: false,
            relationshipType: 'ORTHOGONAL',
            reasoningTrace: `The word "check" is polysemous. Belief A means "verify", Belief B means "payment method". They are unrelated.`,
            detectedAmbiguities: ["'Check' is used in two different senses."],
            implicitAssumptions: []
         };
    }

    // 7. Changing Terminology
    if (hasBoth('legacy user', 'classic user') || hasBoth('q3 promotion', 'fall sale')) {
         return {
             isRelated: true,
             relationshipType: 'SYNONYMOUS',
             reasoningTrace: `The terminology has changed over time, but these refer to the same semantic concept.`,
             detectedAmbiguities: [],
             implicitAssumptions: ["Assuming 'legacy' equates to 'classic' based on historical timeline."]
         };
    }

    // 8. Human inconsistency (Same person, different rules)
    if (hasBoth('>$500', '>$1000') && beliefA.author === beliefB.author && beliefA.businessContext?.region === beliefB.businessContext?.region) {
        return {
            isRelated: true,
            relationshipType: 'CONTRADICTORY',
            reasoningTrace: `The same author provided conflicting thresholds for the same context. Human inconsistency detected.`,
            detectedAmbiguities: [],
            implicitAssumptions: []
        };
    }

    // 9. Organizational Politics (IT vs Marketing)
    if (hasBoth('marketing gets full access', 'no one gets full access')) {
         return {
             isRelated: true,
             relationshipType: 'CONTRADICTORY',
             reasoningTrace: `Contradiction between department allowances and global IT security policy.`,
             detectedAmbiguities: [],
             implicitAssumptions: ["Marketing assumes they have an exception to the global rule."]
         };
    }

    // Default naive check fallback
    const words1 = a.split(' ');
    const words2 = b.split(' ');
    const intersection = words1.filter(w => words2.includes(w) && w.length > 3);
    
    if (intersection.length > 0) {
        if (a !== b) {
             return {
                isRelated: true,
                relationshipType: 'CONTRADICTORY',
                reasoningTrace: `Semantic overlap detected, but meanings differ.`,
                detectedAmbiguities: [],
                implicitAssumptions: []
             };
        } else {
             return {
                isRelated: true,
                relationshipType: 'SYNONYMOUS',
                reasoningTrace: `Rules are identical.`,
                detectedAmbiguities: [],
                implicitAssumptions: []
             };
        }
    }

    return {
      isRelated: false,
      relationshipType: 'ORTHOGONAL',
      reasoningTrace: `No semantic relationship detected.`,
      detectedAmbiguities: [],
      implicitAssumptions: []
    };
  }
}
