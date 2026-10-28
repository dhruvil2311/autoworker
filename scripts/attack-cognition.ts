import { KnowledgeLifecycleManager } from '../packages/university/src/lifecycle.js';
import { ApprovedCourse, CandidateCourse, BusinessBelief } from '../packages/university/src/schema.js';
import { randomUUID } from 'crypto';

function createBelief(overrides: Partial<BusinessBelief>): BusinessBelief {
  return {
    beliefId: randomUUID(),
    semanticMeaning: "Test Rule",
    structuredRule: {},
    confidence: 0.9,
    evidenceCount: 1,
    supportingEvidence: [],
    source: "Test",
    sourceType: "Human",
    author: "Manager",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'ACTIVE',
    businessContext: {},
    reasoningTrace: "Test trace",
    clarificationHistory: [],
    versionHistory: [],
    ...overrides
  };
}

function runAdversarialAttacks() {
  console.log("--- RUNNING COGNITIVE ATTACKS ---");
  const manager = new KnowledgeLifecycleManager();
  
  let passedCount = 0;
  const totalTests = 10;
  
  const baseCourse: ApprovedCourse = {
    id: randomUUID(),
    status: "APPROVED",
    version: "v1.0.0",
    businessDomain: "Test",
    automationType: "Full",
    difficulty: "Medium",
    risk: "Low",
    requiredKnowledge: [],
    expectedCompetencies: [],
    businessDescription: "Test",
    industry: "Test",
    objective: "Test",
    inputs: [],
    observedRules: [],
    observedVariables: [],
    observedLoops: [],
    observedDecisions: [],
    clarifications: [],
    corrections: [],
    finalBPS: {},
    executionPlan: { steps: [] },
    executionHistory: [],
    lessonsLearned: [],
    knowledgeDelta: {}
  };

  const promote = (previous: ApprovedCourse, rules: BusinessBelief[]) => {
      const candidate: CandidateCourse = {
          ...baseCourse,
          observedRules: rules
      };
      return manager.approveCandidate(candidate, {
          difficulty: "Medium",
          businessDomain: "Test",
          automationType: "Full",
          risk: "Low",
          requiredKnowledge: [],
          expectedCompetencies: []
      }, previous);
  };

  // Test 1: Ambiguous language
  {
    console.log("\n[1] Ambiguous language");
    const b1 = createBelief({ semanticMeaning: "Expedite large orders" });
    let c1 = promote(baseCourse, [b1]);
    
    const b2 = createBelief({ semanticMeaning: "Expedite orders >$500" });
    c1 = promote(c1, [b2]);
    
    const b2Result = c1.observedRules.find(r => r.beliefId === b2.beliefId);
    if (b2Result?.status === 'CONFLICTED' && b2Result.cognitiveAnalysis?.detectedAmbiguities?.length) {
      console.log("PASS: Ambiguous language correctly flagged for clarification.");
      passedCount++;
    } else {
      console.error("FAIL: Ambiguous language not caught.");
    }
  }

  // Test 2: Incomplete demonstrations vs Explicit rule
  {
    console.log("\n[2] Incomplete demonstrations vs Explicit rule");
    const b1 = createBelief({ semanticMeaning: "Refunds > $500 require approval" });
    let c1 = promote(baseCourse, [b1]);
    
    const b2 = createBelief({ semanticMeaning: "Approve refunds" });
    c1 = promote(c1, [b2]);
    
    const b2Result = c1.observedRules.find(r => r.beliefId === b2.beliefId);
    if (b2Result?.status === 'CONFLICTED' && b2Result.cognitiveAnalysis?.implicitAssumptions?.length) {
      console.log("PASS: Incomplete demonstration correctly linked as subsumed/ambiguous.");
      passedCount++;
    } else {
      console.error("FAIL: Incomplete demonstration missed.");
    }
  }

  // Test 3: Implicit Business Rules
  {
    console.log("\n[3] Implicit Business Rules");
    const b1 = createBelief({ semanticMeaning: "Process payroll" });
    let c1 = promote(baseCourse, [b1]);
    
    const b2 = createBelief({ semanticMeaning: "Process payroll on weekdays" });
    c1 = promote(c1, [b2]);
    
    const b2Result = c1.observedRules.find(r => r.beliefId === b2.beliefId);
    if (b2Result?.status === 'CONFLICTED' && b2Result.cognitiveAnalysis?.implicitAssumptions?.length) {
      console.log("PASS: Implicit business rule extracted and reasoned about.");
      passedCount++;
    } else {
      console.error("FAIL: Implicit business rule not reasoned about.");
    }
  }

  // Test 4: Conflicting Evidence (SOP vs Demo)
  {
    console.log("\n[4] Conflicting Evidence");
    const b1 = createBelief({ semanticMeaning: "Require 3 approvals", source: "SOP", author: "Compliance Team" });
    let c1 = promote(baseCourse, [b1]);
    
    const b2 = createBelief({ semanticMeaning: "Require 1 approval", source: "Demonstration", author: "Operations Manager" });
    c1 = promote(c1, [b2]);
    
    const b2Result = c1.observedRules.find(r => r.beliefId === b2.beliefId);
    if (b2Result?.status === 'CONFLICTED' && b2Result.reasoningTrace.toLowerCase().includes('contradiction')) {
      console.log("PASS: Conflicting evidence correctly flagged.");
      passedCount++;
    } else {
      console.error("FAIL: Conflicting evidence missed.");
    }
  }

  // Test 5: Semantic overlap & Synonyms
  {
    console.log("\n[5] Semantic overlap & Synonyms");
    const b1 = createBelief({ semanticMeaning: "Refunds >$500", author: "Manager A" });
    let c1 = promote(baseCourse, [b1]);
    
    const b2 = createBelief({ semanticMeaning: "Reimbursements >$1000", author: "Manager B" });
    c1 = promote(c1, [b2]);
    
    const b2Result = c1.observedRules.find(r => r.beliefId === b2.beliefId);
    if (b2Result?.status === 'CONFLICTED') {
      console.log("PASS: Synonyms correctly evaluated as conflicting.");
      passedCount++;
    } else {
      console.error("FAIL: Synonyms missed (treated as orthogonal).");
    }
  }

  // Test 6: Polysemy (Check account)
  {
    console.log("\n[6] Polysemy");
    const b1 = createBelief({ semanticMeaning: "Check the account (verify)" });
    let c1 = promote(baseCourse, [b1]);
    
    const b2 = createBelief({ semanticMeaning: "Check the account (payment)" });
    c1 = promote(c1, [b2]);
    
    const b1Result = c1.observedRules.find(r => r.beliefId === b1.beliefId);
    const b2Result = c1.observedRules.find(r => r.beliefId === b2.beliefId);
    // Orthogonal means they don't conflict, so both should be active.
    if (b1Result?.status === 'ACTIVE' && b2Result?.status === 'ACTIVE') {
      console.log("PASS: Polysemous words correctly evaluated as orthogonal (no conflict).");
      passedCount++;
    } else {
      console.error("FAIL: Polysemy triggered a false positive conflict.");
    }
  }

  // Test 7: Changing Terminology
  {
    console.log("\n[7] Changing Terminology");
    const b1 = createBelief({ semanticMeaning: "Legacy User gets discount" });
    let c1 = promote(baseCourse, [b1]);
    
    const b2 = createBelief({ semanticMeaning: "Classic User gets discount" });
    c1 = promote(c1, [b2]);
    
    const b2Result = c1.observedRules.find(r => r.beliefId === b2.beliefId);
    if (b2Result?.status === 'ACTIVE') {
      console.log("PASS: Terminology change handled seamlessly.");
      passedCount++;
    } else {
      console.error("FAIL: Terminology change caused false conflict.");
    }
  }

  // Test 8: Human inconsistency
  {
    console.log("\n[8] Human inconsistency");
    const b1 = createBelief({ semanticMeaning: "Refunds >$500", author: "Bob" });
    let c1 = promote(baseCourse, [b1]);
    
    const b2 = createBelief({ semanticMeaning: "Refunds >$1000", author: "Bob" });
    c1 = promote(c1, [b2]);
    
    const b2Result = c1.observedRules.find(r => r.beliefId === b2.beliefId);
    if (b2Result?.status === 'CONFLICTED' && b2Result.reasoningTrace.includes('Human inconsistency')) {
      console.log("PASS: Human inconsistency detected and flagged.");
      passedCount++;
    } else {
      console.error("FAIL: Human inconsistency missed.");
    }
  }

  // Test 9: Organizational Politics
  {
    console.log("\n[9] Organizational Politics");
    const b1 = createBelief({ semanticMeaning: "Marketing gets full access", author: "Marketing Manager" });
    let c1 = promote(baseCourse, [b1]);
    
    const b2 = createBelief({ semanticMeaning: "No one gets full access", author: "IT Admin" });
    c1 = promote(c1, [b2]);
    
    const b2Result = c1.observedRules.find(r => r.beliefId === b2.beliefId);
    if (b2Result?.status === 'CONFLICTED' && b2Result.reasoningTrace.includes('department allowances')) {
      console.log("PASS: Organizational politics detected.");
      passedCount++;
    } else {
      console.error("FAIL: Organizational politics missed.");
    }
  }

  // Test 10: Hidden business assumptions
  {
    console.log("\n[10] Hidden business assumptions");
    // Handled inherently by [1], [2], [3] showing implicitAssumptions population.
    const b1 = createBelief({ semanticMeaning: "Approve refunds" });
    const b2 = createBelief({ semanticMeaning: "Refunds > $500 require approval" });
    
    let c1 = promote(baseCourse, [b1]);
    c1 = promote(c1, [b2]);
    
    const b2Result = c1.observedRules.find(r => r.beliefId === b2.beliefId);
    if (b2Result?.cognitiveAnalysis?.implicitAssumptions && b2Result.cognitiveAnalysis.implicitAssumptions.length > 0) {
      console.log("PASS: Hidden business assumptions extracted to cognitive structure.");
      passedCount++;
    } else {
      console.error("FAIL: Hidden business assumptions not extracted.");
    }
  }

  console.log(`\nRESULTS: ${passedCount} / ${totalTests} tests passed.`);
  if (passedCount !== totalTests) {
    process.exit(1);
  }
}

runAdversarialAttacks();
