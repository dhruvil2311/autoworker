/**
 * Phase 5 Adversarial Benchmark: Execution State Machine
 * 
 * Tests the ESM against 10 adversarial execution scenarios:
 * 1. API timeout mid-sequence
 * 2. DOM element missing (selector drift)
 * 3. Unexpected modal dialog
 * 4. Partial mutation with no rollback
 * 5. Contradictory runtime state
 * 6. Empty response from external system
 * 7. Rate limiting mid-batch
 * 8. Authentication token expiry
 * 9. Network partition during checkpoint
 * 10. Concurrent state mutation
 * 
 * Validates: correct state transitions, recovery selection, observation capture,
 * zero fabricated evidence.
 */

import { ExecutionStateMachine, StepExecutor, ESMConfig } from "../execution/ExecutionStateMachine.js";
import { VALID_TRANSITIONS, ExecutionState } from "../execution/types.js";
import { StepDescriptor } from "../execution/engines/risk-assessor.js";
import { OirGraph } from "../types.js";
import { OperationalUnderstanding } from "../reasoner/types.js";
import { SemanticUnderstanding } from "../semantic/types.js";
import { collectValidEvidenceIds } from "../intelligence/oir-serializer.js";

// ─── Test Infrastructure ────────────────────────────────────────────────────

interface BenchmarkScenario {
  name: string;
  description: string;
  executor: StepExecutor;
  step: StepDescriptor;
  expectedDecision: "CONTINUE" | "FAIL" | "PAUSE";
  config?: Partial<ESMConfig>;
}

function createGraph(): OirGraph {
  return {
    version: "1.0",
    businessGoal: "Process Customer Order",
    businessObjects: [{ id: "bo_order", name: "CustomerOrder", description: "Order entity", properties: { total: "number", status: "string" } }],
    variables: [
      { id: "var_auth", name: "auth_token", type: "string" },
      { id: "var_order_id", name: "order_id", type: "string" }
    ],
    constants: [{ id: "const_timeout", name: "API_TIMEOUT", value: 30000, type: "number" }],
    businessRules: [
      { id: "rule_auth", description: "Authentication required", condition: "auth_token != null", enforcementLevel: "STRICT" as const }
    ],
    externalSystems: [{ id: "sys_api", name: "OrderAPI", type: "API", url: "https://api.example.com" }],
    entities: [],
    evidenceLinks: [],
    knowledgeReferences: [],
    nodes: [
      { id: "action_login", name: "Login to system", type: "ACTION" as const, operation: "NAVIGATE", inputs: {}, outputs: ["var_auth"], sideEffects: false, confidence: 0.95, provenance: [{ source: "BROWSER_EVENT", evidenceId: "obs_login" }] },
      { id: "action_submit", name: "Submit order", type: "ACTION" as const, operation: "API_CALL", inputs: { auth: "var_auth", orderId: "var_order_id" }, outputs: [], sideEffects: true, confidence: 0.9, provenance: [{ source: "API_CALL", evidenceId: "obs_submit" }], systemId: "sys_api" },
      { id: "action_confirm", name: "Confirm submission", type: "ACTION" as const, operation: "CLICK", inputs: {}, outputs: [], sideEffects: false, confidence: 0.9, provenance: [{ source: "BROWSER_EVENT", evidenceId: "obs_confirm" }] }
    ],
    dependencies: [
      { sourceId: "action_login", targetId: "action_submit", type: "CONTROL" },
      { sourceId: "action_submit", targetId: "action_confirm", type: "CONTROL" }
    ],
    globalConfidence: 0.9,
    rootNodeId: "action_login"
  };
}

function createUnderstanding(): OperationalUnderstanding {
  return {
    version: "1.0", timestamp: new Date().toISOString(), sourceOirVersion: "1.0",
    goal: { description: "Process Customer Order", evidenceIds: ["action_login", "action_submit", "action_confirm"], confidence: { reasoning: 0.9, evidence: 0.9, semantic: 0.9, structural: 0.9, operational: 0.9, unknown: 0.1 }, alternatives: [] },
    intent: { description: "Submit order", notDescription: "", evidenceIds: ["action_submit"], confidence: { reasoning: 0.9, evidence: 0.9, semantic: 0.9, structural: 0.9, operational: 0.9, unknown: 0.1 } },
    businessObjects: ["CustomerOrder"],
    constraints: [
      { type: "DEPENDENCY" as const, description: "API must be available", evidenceIds: ["sys_api"], confidence: { reasoning: 0.9, evidence: 0.9, semantic: 0.9, structural: 0.9, operational: 0.9, unknown: 0.1 } },
      { type: "DEADLINE" as const, description: "30s timeout", evidenceIds: ["const_timeout"], confidence: { reasoning: 0.9, evidence: 0.9, semantic: 0.9, structural: 0.9, operational: 0.9, unknown: 0.1 } }
    ],
    rules: [{ description: "Auth required", classification: "EXPLICIT" as const, evidenceIds: ["rule_auth"], confidence: { reasoning: 1, evidence: 1, semantic: 1, structural: 1, operational: 1, unknown: 0 } }],
    assumptions: [],
    unknowns: [{ description: "No error handling for auth expiry", impact: "HIGH" as const, resolvableVia: "Add re-auth logic", evidenceIds: ["action_login"] }],
    evidence: [],
    confidence: { reasoning: 0.9, evidence: 0.9, semantic: 0.9, structural: 0.9, operational: 0.9, unknown: 0.1 },
    risks: [], alternatives: [], informationGains: [], clarifications: [],
    summary: { what: "Order processing", why: "Fulfill customer request", inputs: ["auth_token", "order_id"], outputs: [], businessImpact: "Revenue", dependencies: ["OrderAPI"], failureModes: ["API timeout", "Auth expiry"], humanExpectations: [] }
  };
}

function createSemantic(): SemanticUnderstanding {
  return {
    version: "2.0", timestamp: new Date().toISOString(), sourceOirVersion: "1.0",
    businessMeaning: { objective: { description: "Process order", evidenceIds: ["action_submit"], confidence: 0.9 }, capability: { description: "Order management", evidenceIds: [], confidence: 0.9 }, function: { description: "Sales", evidenceIds: [], confidence: 0.9 }, outcome: { description: "Order placed", evidenceIds: [], confidence: 0.9 }, kpi: { description: "Order completion rate", evidenceIds: [], confidence: 0.9 } },
    latentGoals: [], implicitPolicies: [],
    counterfactuals: [
      { description: "API down", whatIfCondition: "What if OrderAPI is offline?", expectedOutcome: "Order fails", operationalAlternatives: ["Queue order", "Retry later"], evidenceIds: ["sys_api"], confidence: 0.9 },
      { description: "Auth expired", whatIfCondition: "What if auth token expires?", expectedOutcome: "401 error", operationalAlternatives: ["Re-authenticate", "Refresh token"], evidenceIds: ["action_login"], confidence: 0.85 }
    ],
    simulations: [
      { description: "Happy path", simulatedScenario: "All OK", likelyFailures: [], policyViolations: [], financialConsequences: [], rollbackNeeds: [], successProbability: 0.95, evidenceIds: ["action_submit"], confidence: 0.9 },
      { description: "Failure after submit", simulatedScenario: "Failure after mutation", likelyFailures: ["Partial state"], policyViolations: [], financialConsequences: ["Duplicate order risk"], rollbackNeeds: ["Cancel order"], successProbability: 0.05, evidenceIds: ["action_submit"], confidence: 0.85 }
    ],
    businessBeliefs: [], causalChains: [],
    organizationalContext: { description: "Sales ops", rolesInvolved: ["Operator"], departments: ["Sales"], approvalChains: [], authorityLevel: "LOW" as const, evidenceIds: [], confidence: 0.7 },
    capabilityMappings: [], semanticContradictions: [],
    decisionQuality: { description: "OK", isGoodWorkflow: true, qualityScore: 0.8, flaws: [], efficiencies: [], evidenceIds: [], confidence: 0.8 },
    operationalStrategies: [], learningDeltas: [],
    verificationResult: { passed: true, unsupportedClaims: 0, fabricatedEvidenceIds: [], rejectionReasons: [] }
  };
}

// ─── Scenarios ──────────────────────────────────────────────────────────────

const scenarios: BenchmarkScenario[] = [
  {
    name: "1. API Timeout",
    description: "External API times out on first call, succeeds on retry",
    step: { stepId: "step_submit", stepName: "Submit order", operation: "API_CALL", target: "API", hasSideEffects: true, inputVariables: ["auth_token"], outputVariables: [] },
    executor: (() => {
      let calls = 0;
      return {
        execute: async () => {
          calls++;
          if (calls <= 1) return { succeeded: false, error: { type: "Timeout", message: "API timeout after 30s", isTransient: true, isRecoverable: true }, durationMs: 30000 };
          return { succeeded: true, outputs: { orderId: "ORD-123" }, durationMs: 200 };
        }
      };
    })(),
    expectedDecision: "CONTINUE"
  },
  {
    name: "2. DOM Selector Drift",
    description: "Element not found because selector changed",
    step: { stepId: "step_click", stepName: "Click confirm button", operation: "CLICK", target: "BROWSER_DETERMINISTIC", hasSideEffects: false, inputVariables: [], outputVariables: [] },
    executor: { execute: async () => ({ succeeded: false, error: { type: "ElementNotFound", message: "Selector #confirm-btn not found", isTransient: false, isRecoverable: false }, durationMs: 50 }) },
    expectedDecision: "PAUSE"  // Non-recoverable → escalate
  },
  {
    name: "3. Unexpected Modal",
    description: "Cookie consent modal blocks interaction",
    step: { stepId: "step_nav", stepName: "Navigate to dashboard", operation: "NAVIGATE", target: "BROWSER_DETERMINISTIC", hasSideEffects: false, inputVariables: [], outputVariables: [] },
    executor: (() => {
      let calls = 0;
      return {
        execute: async () => {
          calls++;
          if (calls <= 1) return { succeeded: false, error: { type: "UnexpectedModal", message: "Unexpected modal blocking interaction", isTransient: true, isRecoverable: true }, durationMs: 100 };
          return { succeeded: true, durationMs: 50 };
        }
      };
    })(),
    expectedDecision: "CONTINUE",  // Transient → retry should work (mock will succeed on retry concept)
    config: { maxRecoveryAttempts: 1 }  // Limit so we hit FAIL on persistent transient
  },
  {
    name: "4. Partial Mutation No Rollback",
    description: "Step with side effects partially completes then fails",
    step: { stepId: "step_mutate", stepName: "Update inventory", operation: "API_CALL", target: "API", hasSideEffects: true, inputVariables: ["order_id"], outputVariables: [] },
    executor: { execute: async () => ({ succeeded: false, error: { type: "PartialWrite", message: "Connection reset after partial write", isTransient: false, isRecoverable: false }, durationMs: 500, sideEffectsDetected: ["Inventory decremented by 1"] }) },
    expectedDecision: "PAUSE"  // Side effects + non-recoverable → must escalate
  },
  {
    name: "5. Contradictory State",
    description: "Runtime state contradicts expectations",
    step: { stepId: "step_verify", stepName: "Verify order status", operation: "READ", target: "API", hasSideEffects: false, inputVariables: ["order_id"], outputVariables: ["status"] },
    executor: { execute: async () => ({ succeeded: false, error: { type: "StateContradiction", message: "Order status is CANCELLED but expected PENDING", isTransient: false, isRecoverable: false }, durationMs: 100 }) },
    expectedDecision: "PAUSE"
  },
  {
    name: "6. Empty API Response",
    description: "API returns empty response body",
    step: { stepId: "step_fetch", stepName: "Fetch order details", operation: "API_CALL", target: "API", hasSideEffects: false, inputVariables: ["order_id"], outputVariables: ["details"] },
    executor: (() => {
      let calls = 0;
      return {
        execute: async () => {
          calls++;
          if (calls <= 1) return { succeeded: false, error: { type: "EmptyResponse", message: "API returned empty body", isTransient: true, isRecoverable: true }, durationMs: 200 };
          return { succeeded: true, outputs: { details: "ok" }, durationMs: 100 };
        }
      };
    })(),
    expectedDecision: "CONTINUE",  // Transient → retry
    config: { maxRecoveryAttempts: 1 }
  },
  {
    name: "7. Rate Limiting",
    description: "API returns 429 Too Many Requests",
    step: { stepId: "step_batch", stepName: "Process batch item", operation: "API_CALL", target: "API", hasSideEffects: false, inputVariables: [], outputVariables: [] },
    executor: (() => {
      let calls = 0;
      return {
        execute: async () => {
          calls++;
          if (calls <= 1) return { succeeded: false, error: { type: "RateLimit", message: "429 Too Many Requests", isTransient: true, isRecoverable: true }, durationMs: 50 };
          return { succeeded: true, durationMs: 100 };
        }
      };
    })(),
    expectedDecision: "CONTINUE"
  },
  {
    name: "8. Auth Token Expiry",
    description: "Authentication token has expired during execution",
    step: { stepId: "step_auth_call", stepName: "Call authenticated endpoint", operation: "API_CALL", target: "API", hasSideEffects: false, inputVariables: ["auth_token"], outputVariables: [] },
    executor: { execute: async () => ({ succeeded: false, error: { type: "AuthExpired", message: "401 Unauthorized: Token expired", isTransient: false, isRecoverable: false }, durationMs: 100 }) },
    expectedDecision: "PAUSE"
  },
  {
    name: "9. Network Partition",
    description: "Network connection drops during checkpoint save",
    step: { stepId: "step_save", stepName: "Save checkpoint", operation: "CHECKPOINT", target: "SYSTEM", hasSideEffects: true, inputVariables: [], outputVariables: [] },
    executor: (() => {
      let calls = 0;
      return {
        execute: async () => {
          calls++;
          if (calls <= 1) return { succeeded: false, error: { type: "NetworkError", message: "ECONNRESET: Connection reset by peer", isTransient: true, isRecoverable: true }, durationMs: 5000 };
          return { succeeded: true, durationMs: 1000 };
        }
      };
    })(),
    expectedDecision: "CONTINUE",
    config: { maxRecoveryAttempts: 1 }
  },
  {
    name: "10. Concurrent State Mutation",
    description: "Another process modified the record while we were working",
    step: { stepId: "step_update", stepName: "Update order record", operation: "API_CALL", target: "API", hasSideEffects: true, inputVariables: ["order_id"], outputVariables: [] },
    executor: { execute: async () => ({ succeeded: false, error: { type: "ConcurrentModification", message: "Record version conflict: expected v3 got v4", isTransient: false, isRecoverable: false }, durationMs: 200, sideEffectsDetected: [] }) },
    expectedDecision: "PAUSE"
  }
];

// ─── Benchmark Runner ───────────────────────────────────────────────────────

interface BenchmarkResult {
  scenario: string;
  passed: boolean;
  decision: string;
  expectedDecision: string;
  fabricatedEvidence: number;
  invalidTransitions: number;
  observationsRecorded: number;
  latencyMs: number;
  error?: string;
}

async function runBenchmark() {
  console.log("═══════════════════════════════════════════════════");
  console.log("PHASE 5 BENCHMARK: Execution State Machine");
  console.log("═══════════════════════════════════════════════════\n");

  const graph = createGraph();
  const understanding = createUnderstanding();
  const semantic = createSemantic();
  const validIds = collectValidEvidenceIds(graph);
  const results: BenchmarkResult[] = [];

  for (const scenario of scenarios) {
    console.log(`Testing: ${scenario.name}`);
    console.log(`  ${scenario.description}`);

    const startMs = Date.now();
    const config: ESMConfig = {
      maxRecoveryAttempts: scenario.config?.maxRecoveryAttempts ?? 3,
      riskConfidenceThreshold: 0.6,
      humanApprovalRiskLevels: ["CRITICAL"],
      abortOnCriticalRisk: false
    };

    try {
      const esm = new ExecutionStateMachine(graph, understanding, semantic, scenario.executor, config);
      const decision = await esm.executeStep(scenario.step);
      const trace = esm.getTrace();
      const latencyMs = Date.now() - startMs;

      // Validate: no fabricated evidence
      let fabricatedCount = 0;
      for (const entry of trace.entries) {
        if (entry.observation) {
          for (const id of entry.observation.evidenceIds) {
            if (!validIds.has(id)) fabricatedCount++;
          }
        }
        if (entry.decision) {
          for (const id of entry.decision.evidenceIds) {
            if (!validIds.has(id)) fabricatedCount++;
          }
        }
      }

      // Validate: all transitions are legal
      let invalidTransitions = 0;
      for (const entry of trace.entries) {
        if (!VALID_TRANSITIONS[entry.fromState].includes(entry.toState)) {
          invalidTransitions++;
        }
      }

      const passed = decision.decision === scenario.expectedDecision && fabricatedCount === 0 && invalidTransitions === 0;

      results.push({
        scenario: scenario.name,
        passed,
        decision: decision.decision,
        expectedDecision: scenario.expectedDecision,
        fabricatedEvidence: fabricatedCount,
        invalidTransitions,
        observationsRecorded: trace.totalObservations,
        latencyMs
      });

      console.log(`  ${passed ? "✅" : "❌"} Decision: ${decision.decision} (expected: ${scenario.expectedDecision})`);
      console.log(`     Observations: ${trace.totalObservations} | Fabricated: ${fabricatedCount} | Invalid Transitions: ${invalidTransitions}`);
      console.log(`     Latency: ${latencyMs}ms\n`);

    } catch (err: any) {
      results.push({
        scenario: scenario.name,
        passed: false,
        decision: "ERROR",
        expectedDecision: scenario.expectedDecision,
        fabricatedEvidence: 0,
        invalidTransitions: 0,
        observationsRecorded: 0,
        latencyMs: Date.now() - startMs,
        error: err.message
      });
      console.log(`  ❌ ERROR: ${err.message}\n`);
    }
  }

  // Summary
  const totalPassed = results.filter(r => r.passed).length;
  const totalFabricated = results.reduce((sum, r) => sum + r.fabricatedEvidence, 0);
  const totalInvalid = results.reduce((sum, r) => sum + r.invalidTransitions, 0);
  const avgLatency = Math.round(results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length);

  console.log("═══════════════════════════════════════════════════");
  console.log("PHASE 5 BENCHMARK RESULTS");
  console.log("═══════════════════════════════════════════════════");
  console.log(`Total Scenarios:            ${results.length}`);
  console.log(`Passed:                     ${totalPassed}/${results.length} (${Math.round(totalPassed / results.length * 100)}%)`);
  console.log(`Fabricated Evidence:        ${totalFabricated}`);
  console.log(`Invalid State Transitions:  ${totalInvalid}`);
  console.log(`Avg Latency per Scenario:   ${avgLatency}ms`);
  
  if (totalPassed === results.length && totalFabricated === 0 && totalInvalid === 0) {
    console.log("\nVERDICT: 🟢 PROVEN");
  } else {
    console.log("\nVERDICT: ❌ FAILED — Tuning required");
    console.log("\nFailed scenarios:");
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  - ${r.scenario}: got ${r.decision}, expected ${r.expectedDecision}${r.error ? ` (error: ${r.error})` : ""}`);
    }
  }
}

runBenchmark().catch(console.error);
