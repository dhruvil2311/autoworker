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
  console.log("--- RUNNING CONTRADICTORY HUMAN TEACHING ATTACKS ---");
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

  // Test 1: Conflicting Managers
  {
    console.log("\n[1] Conflicting Managers");
    const b1 = createBelief({ semanticMeaning: "Refunds > $500 require approval", author: "Manager A" });
    let c1 = promote({ ...baseCourse, observedRules: [b1] }, []);
    
    const b2 = createBelief({ semanticMeaning: "Refunds > $1000 require approval", author: "Manager B" });
    c1 = promote(c1, [b2]);
    
    const b2Result = c1.observedRules.find(r => r.beliefId === b2.beliefId);
    if (b2Result?.status === 'CONFLICTED' || c1.observedRules.length === 2) {
      console.log("PASS: Conflicting managers correctly escalated or kept parallel contexts without silent overwrite.");
      passedCount++;
    } else {
      console.error("FAIL: Silent overwrite occurred.");
    }
  }

  // Test 2: CEO Overrides
  {
    console.log("\n[2] CEO Overrides");
    const b1 = createBelief({ semanticMeaning: "Refunds > $500 require approval", author: "Manager A" });
    let c1 = promote({ ...baseCourse, observedRules: [b1] }, []);
    
    const b2 = createBelief({ semanticMeaning: "Refunds > $1000 require approval", author: "CEO" });
    c1 = promote(c1, [b2]);
    
    const b1Result = c1.observedRules.find(r => r.beliefId === b1.beliefId);
    const b2Result = c1.observedRules.find(r => r.beliefId === b2.beliefId);
    if (b1Result?.status === 'SUPERSEDED' && b2Result?.status === 'ACTIVE') {
      console.log("PASS: CEO overrides manager successfully, retaining history.");
      passedCount++;
    } else {
      console.error("FAIL: CEO override failed.");
    }
  }

  // Test 3: Seasonal policy changes
  {
    console.log("\n[3] Seasonal policy changes");
    const b1 = createBelief({ semanticMeaning: "Refunds > $500", businessContext: { season: "Summer" } });
    let c1 = promote({ ...baseCourse, observedRules: [b1] }, []);
    
    const b2 = createBelief({ semanticMeaning: "Refunds > $1000", businessContext: { season: "Winter" } });
    c1 = promote(c1, [b2]);
    
    const b1Result = c1.observedRules.find(r => r.beliefId === b1.beliefId);
    const b2Result = c1.observedRules.find(r => r.beliefId === b2.beliefId);
    if (b1Result?.status === 'ACTIVE' && b2Result?.status === 'ACTIVE') {
      console.log("PASS: Both seasonal contexts kept active.");
      passedCount++;
    } else {
      console.error("FAIL: Seasonal conflict incorrectly resolved.");
    }
  }

  // Test 4: Regional policy changes
  {
    console.log("\n[4] Regional policy changes");
    const b1 = createBelief({ semanticMeaning: "Refunds > $500", businessContext: { region: "US" } });
    let c1 = promote({ ...baseCourse, observedRules: [b1] }, []);
    
    const b2 = createBelief({ semanticMeaning: "Refunds > $1000", businessContext: { region: "EU" } });
    c1 = promote(c1, [b2]);
    
    const b1Result = c1.observedRules.find(r => r.beliefId === b1.beliefId);
    const b2Result = c1.observedRules.find(r => r.beliefId === b2.beliefId);
    if (b1Result?.status === 'ACTIVE' && b2Result?.status === 'ACTIVE') {
      console.log("PASS: Both regional contexts kept active.");
      passedCount++;
    } else {
      console.error("FAIL: Regional conflict incorrectly resolved.");
    }
  }

  // Test 5: Department disagreement
  {
    console.log("\n[5] Department disagreement");
    const b1 = createBelief({ semanticMeaning: "Refunds > $500", businessContext: { department: "Sales" } });
    let c1 = promote({ ...baseCourse, observedRules: [b1] }, []);
    
    const b2 = createBelief({ semanticMeaning: "Refunds > $1000", businessContext: { department: "Support" } });
    c1 = promote(c1, [b2]);
    
    const b1Result = c1.observedRules.find(r => r.beliefId === b1.beliefId);
    const b2Result = c1.observedRules.find(r => r.beliefId === b2.beliefId);
    if (b1Result?.status === 'ACTIVE' && b2Result?.status === 'ACTIVE') {
      console.log("PASS: Both departmental contexts kept active.");
      passedCount++;
    } else {
      console.error("FAIL: Department conflict incorrectly resolved.");
    }
  }

  // Test 6: Historical policy evolution
  {
    console.log("\n[6] Historical policy evolution");
    const b1 = createBelief({ semanticMeaning: "Refunds > $500", author: "Manager A" });
    let c1 = promote({ ...baseCourse, observedRules: [b1] }, []);
    
    const b2 = createBelief({ semanticMeaning: "Refunds > $1000", author: "Manager A" });
    c1 = promote(c1, [b2]);
    
    const b1Result = c1.observedRules.find(r => r.beliefId === b1.beliefId);
    const b2Result = c1.observedRules.find(r => r.beliefId === b2.beliefId);
    if (b1Result?.status === 'SUPERSEDED' && b2Result?.status === 'ACTIVE') {
      console.log("PASS: Historical policy evolution correctly superseded the old policy.");
      passedCount++;
    } else {
      console.error("FAIL: Historical evolution failed.");
    }
  }

  // Test 7: Incorrect human correction
  {
    console.log("\n[7] Incorrect human correction");
    const b1 = createBelief({ semanticMeaning: "Refunds > $500", author: "Manager A", confidence: 1.0 });
    let c1 = promote({ ...baseCourse, observedRules: [b1] }, []);
    
    const b2 = createBelief({ semanticMeaning: "Refunds > $9999", author: "Intern", confidence: 0.5 });
    c1 = promote(c1, [b2]);
    
    const b2Result = c1.observedRules.find(r => r.beliefId === b2.beliefId);
    if (b2Result?.status === 'CONFLICTED' || b2Result?.status === 'RETIRED') {
      console.log("PASS: Low confidence incorrect correction correctly flagged/escalated.");
      passedCount++;
    } else {
      console.error("FAIL: Allowed incorrect low-confidence correction.");
    }
  }

  // Test 8: Policy rollback
  {
    console.log("\n[8] Policy rollback");
    const b1 = createBelief({ semanticMeaning: "Refunds > $500", author: "Manager A" });
    let c1 = promote({ ...baseCourse, observedRules: [b1] }, []);
    
    const b2 = createBelief({ semanticMeaning: "Refunds > $1000", author: "Manager A" });
    c1 = promote(c1, [b2]);
    
    const b3 = createBelief({ semanticMeaning: "Refunds > $500", author: "Manager A" });
    c1 = promote(c1, [b3]);
    
    const b3Result = c1.observedRules.find(r => r.beliefId === b3.beliefId);
    if (b3Result?.status === 'ACTIVE' && c1.observedRules.length >= 3) {
      console.log("PASS: Policy rolled back correctly by adding new belief.");
      passedCount++;
    } else {
      console.error("FAIL: Policy rollback did not keep full history.");
    }
  }

  // Test 9: Partial policy updates
  {
    console.log("\n[9] Partial policy updates");
    const b1 = createBelief({ semanticMeaning: "Refunds > $500", author: "Manager A" });
    const b2 = createBelief({ semanticMeaning: "No refunds on software", author: "Manager A" });
    let c1 = promote({ ...baseCourse, observedRules: [b1, b2] }, []);
    
    const b3 = createBelief({ semanticMeaning: "Refunds > $1000", author: "Manager A" });
    c1 = promote(c1, [b3]);
    
    const b1Result = c1.observedRules.find(r => r.beliefId === b1.beliefId);
    const b2Result = c1.observedRules.find(r => r.beliefId === b2.beliefId);
    const b3Result = c1.observedRules.find(r => r.beliefId === b3.beliefId);
    
    if (b1Result?.status === 'SUPERSEDED' && b2Result?.status === 'ACTIVE' && b3Result?.status === 'ACTIVE') {
      console.log("PASS: Partial policy updates kept unrelated policies active.");
      passedCount++;
    } else {
      console.error("FAIL: Unrelated policy was corrupted.");
    }
  }

  // Test 10: Simultaneous conflicting demonstrations
  {
    console.log("\n[10] Simultaneous conflicting demonstrations");
    let c1 = promote({ ...baseCourse, observedRules: [] }, []);
    
    const b1 = createBelief({ semanticMeaning: "Refunds > $500", author: "Manager A" });
    const b2 = createBelief({ semanticMeaning: "Refunds > $1000", author: "Manager B" });
    
    c1 = promote(c1, [b1]);
    c1 = promote(c1, [b2]);
    
    const b1Result = c1.observedRules.find(r => r.beliefId === b1.beliefId);
    const b2Result = c1.observedRules.find(r => r.beliefId === b2.beliefId);
    if ((b1Result?.status === 'ACTIVE' && b2Result?.status === 'CONFLICTED') || (b1Result?.status === 'CONFLICTED' && b2Result?.status === 'ACTIVE')) {
       console.log("PASS: Simultaneous conflicts flagged for clarification.");
       passedCount++;
    } else {
       console.error("FAIL: Simultaneous conflict not correctly handled.");
    }
  }

  console.log(`\nRESULTS: ${passedCount} / ${totalTests} tests passed.`);
  if (passedCount !== totalTests) {
    process.exit(1);
  }
}

runAdversarialAttacks();
