import { KnowledgeLifecycleManager } from '../packages/university/src/lifecycle.js';
import type { ApprovedCourse, CandidateCourse } from '../packages/university/src/schema.js';

function runAttack() {
  console.log("Starting Adversarial Attack: Catastrophic Forgetting");

  const manager = new KnowledgeLifecycleManager();

  // 1. Mock historical knowledge base (e.g. 1 year of accumulated operations)
  const previousCourse: ApprovedCourse = {
    id: "course_1",
    status: "APPROVED",
    version: "v1.0.0",
    businessDomain: "Refunds",
    automationType: "Full",
    difficulty: "Medium",
    risk: "Low",
    requiredKnowledge: ["Stripe"],
    expectedCompetencies: ["API"],
    businessDescription: "Process refunds",
    industry: "E-Commerce",
    objective: "Refund",
    inputs: [],
    observedRules: [
      "Rule A: Refund VIPs instantly",
      "Rule B: Charge restocking fee for electronics"
    ],
    observedVariables: [],
    observedLoops: [],
    observedDecisions: [],
    clarifications: [],
    corrections: [],
    finalBPS: { status: "READY_FOR_TEST_COMPILATION" },
    executionPlan: { steps: [] },
    executionHistory: [],
    lessonsLearned: [],
    knowledgeDelta: { before: {}, after: {}, diff: [] }
  };

  // 2. Mock a new demonstration of an edge case
  const newCandidate: CandidateCourse = {
    id: "candidate_2",
    status: "PENDING_REVIEW",
    businessDescription: "Process refunds for damaged goods",
    industry: "E-Commerce",
    objective: "Refund",
    inputs: [],
    observedRules: [
      "Rule C: Damaged goods require photo evidence"
    ],
    observedVariables: [],
    observedLoops: [],
    observedDecisions: [],
    clarifications: [],
    corrections: [],
    finalBPS: { status: "READY_FOR_TEST_COMPILATION" },
    executionPlan: { steps: [] },
    executionHistory: [],
    lessonsLearned: [],
    knowledgeDelta: { before: {}, after: {}, diff: [] }
  };

  console.log("\nSimulating Business Evolution (Promoting Candidate)...");
  const newCourse = manager.approveCandidate(newCandidate, {
    difficulty: "Medium",
    businessDomain: "Refunds",
    automationType: "Full",
    risk: "Low",
    requiredKnowledge: ["Stripe"],
    expectedCompetencies: ["API"]
  }, previousCourse);

  console.log("\n--- EXPERIMENT RESULTS ---");
  console.log(`New Course Version: ${newCourse.version}`);
  console.log(`Retained Rules Count: ${newCourse.observedRules.length}`);
  
  if (newCourse.observedRules.includes("Rule A: Refund VIPs instantly")) {
    console.log("🛡️ DEFENSE HELD: Ghost retained historical knowledge.");
  } else {
    console.log("💥 ATTACK SUCCESSFUL: Ghost suffered Catastrophic Forgetting.");
    console.log("Rules present in memory:");
    console.log(newCourse.observedRules);
  }
}

runAttack();
