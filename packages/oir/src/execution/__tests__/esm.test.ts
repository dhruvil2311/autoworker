/**
 * Execution State Machine — Unit Tests
 * 
 * Tests:
 * 1. Valid state transitions
 * 2. Invalid state transitions (must throw)
 * 3. Risk assessment integration
 * 4. Recovery strategy selection
 * 5. Observation capture correctness
 * 6. Terminal state enforcement
 * 7. Human escalation path
 * 8. Max recovery attempts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExecutionStateMachine, StepExecutor } from "../ExecutionStateMachine.js";
import { VALID_TRANSITIONS, ExecutionState } from "../types.js";
import { OirGraph } from "../../types.js";
import { OperationalUnderstanding } from "../../reasoner/types.js";
import { SemanticUnderstanding } from "../../semantic/types.js";
import { StepDescriptor } from "../engines/risk-assessor.js";

// ─── Mock the LLM Client ────────────────────────────────────────────────────

vi.mock("../../intelligence/llm-client.js", () => ({
  callLlm: vi.fn().mockImplementation(async (options: any) => {
    const prompt = options.userPrompt as string;

    // Risk Assessor mock
    if (prompt.includes("Pre-Execution Risk Assessor")) {
      const hasSideEffects = prompt.includes("Has Side Effects: true");
      return {
        data: {
          stepId: "test_step",
          riskLevel: hasSideEffects ? "MEDIUM" : "LOW",
          recommendation: "PROCEED",
          risks: [{
            description: "Mock risk",
            likelihood: 0.3,
            impact: "Low impact",
            mitigations: ["Monitor"],
            evidenceIds: []
          }],
          applicableConstraints: [],
          applicableUnknowns: [],
          preconditions: [{
            description: "System available",
            satisfied: true,
            evidenceIds: []
          }],
          reasoning: "Mock risk assessment",
          confidence: 0.9
        },
        model: "mock", promptTokens: 50, completionTokens: 30, latencyMs: 5
      };
    }

    // Recovery Selector mock
    if (prompt.includes("step has FAILED")) {
      const isTransient = prompt.includes("Is Transient: true");
      return {
        data: {
          strategies: [
            {
              action: isTransient ? "RETRY" : "ESCALATE_TO_HUMAN",
              reasoning: isTransient ? "Transient error, retry" : "Non-transient, escalate",
              confidence: 0.9,
              evidenceIds: [],
              successProbability: isTransient ? 0.8 : 0.95,
              recoveryRisks: [],
              maxRetries: isTransient ? 3 : undefined
            }
          ],
          overallReasoning: "Mock recovery decision"
        },
        model: "mock", promptTokens: 50, completionTokens: 30, latencyMs: 5
      };
    }

    return { data: {}, model: "mock", promptTokens: 0, completionTokens: 0, latencyMs: 0 };
  })
}));

// ─── Test Fixtures ──────────────────────────────────────────────────────────

function createTestGraph(): OirGraph {
  return {
    version: "1.0",
    businessGoal: "Test Workflow",
    businessObjects: [],
    variables: [{ id: "var_1", name: "test_var", type: "string" }],
    constants: [],
    businessRules: [],
    externalSystems: [{ id: "sys_1", name: "TestAPI", type: "REST" }],
    entities: [],
    evidenceLinks: [],
    knowledgeReferences: [],
    nodes: [
      {
        id: "action_1",
        name: "Submit Form",
        type: "ACTION" as const,
        operation: "CLICK",
        inputs: {},
        outputs: ["var_1"],
        sideEffects: true,
        confidence: 0.9,
        provenance: [{ source: "BROWSER_EVENT", evidenceId: "obs_1" }]
      },
      {
        id: "action_2",
        name: "Confirm Submission",
        type: "ACTION" as const,
        operation: "CLICK",
        inputs: {},
        outputs: [],
        sideEffects: false,
        confidence: 0.9,
        provenance: [{ source: "BROWSER_EVENT", evidenceId: "obs_2" }]
      }
    ],
    dependencies: [{ sourceId: "action_1", targetId: "action_2", type: "CONTROL" }],
    globalConfidence: 0.9,
    rootNodeId: "action_1"
  };
}

function createTestUnderstanding(): OperationalUnderstanding {
  return {
    version: "1.0", timestamp: new Date().toISOString(), sourceOirVersion: "1.0",
    goal: { description: "Submit form", evidenceIds: ["action_1"], confidence: { reasoning: 1, evidence: 1, semantic: 1, structural: 1, operational: 1, unknown: 0 }, alternatives: [] },
    intent: { description: "Submit data", notDescription: "", evidenceIds: ["action_1"], confidence: { reasoning: 1, evidence: 1, semantic: 1, structural: 1, operational: 1, unknown: 0 } },
    businessObjects: [], constraints: [{ type: "SYSTEM", description: "API must be available", evidenceIds: ["sys_1"], confidence: { reasoning: 1, evidence: 1, semantic: 1, structural: 1, operational: 1, unknown: 0 } }],
    rules: [], assumptions: [],
    unknowns: [{ description: "No error handling", impact: "HIGH", resolvableVia: "Add exception handler", evidenceIds: ["action_1"] }],
    evidence: [],
    confidence: { reasoning: 1, evidence: 1, semantic: 1, structural: 1, operational: 1, unknown: 0 },
    risks: [], alternatives: [], informationGains: [], clarifications: [],
    summary: { what: "Submit form", why: "Data entry", inputs: [], outputs: [], businessImpact: "Low", dependencies: [], failureModes: [], humanExpectations: [] }
  };
}

function createTestSemanticUnderstanding(): SemanticUnderstanding {
  return {
    version: "2.0", timestamp: new Date().toISOString(), sourceOirVersion: "1.0",
    businessMeaning: { objective: { description: "Submit", evidenceIds: [], confidence: 0.9 }, capability: { description: "Form", evidenceIds: [], confidence: 0.9 }, function: { description: "Data Entry", evidenceIds: [], confidence: 0.9 }, outcome: { description: "Submitted", evidenceIds: [], confidence: 0.9 }, kpi: { description: "Speed", evidenceIds: [], confidence: 0.9 } },
    latentGoals: [], implicitPolicies: [],
    counterfactuals: [{ description: "API down", whatIfCondition: "What if API is offline?", expectedOutcome: "Submission fails", operationalAlternatives: ["Queue locally"], evidenceIds: ["sys_1"], confidence: 0.9 }],
    simulations: [{ description: "Happy path", simulatedScenario: "All OK", likelyFailures: [], policyViolations: [], financialConsequences: [], rollbackNeeds: [], successProbability: 0.95, evidenceIds: ["action_1"], confidence: 0.9 }],
    businessBeliefs: [], causalChains: [],
    organizationalContext: { description: "Ops", rolesInvolved: ["Operator"], departments: ["Operations"], approvalChains: [], authorityLevel: "LOW", evidenceIds: [], confidence: 0.7 },
    capabilityMappings: [], semanticContradictions: [],
    decisionQuality: { description: "OK", isGoodWorkflow: true, qualityScore: 0.8, flaws: [], efficiencies: [], evidenceIds: [], confidence: 0.8 },
    operationalStrategies: [], learningDeltas: [],
    verificationResult: { passed: true, unsupportedClaims: 0, fabricatedEvidenceIds: [], rejectionReasons: [] }
  };
}

function createTestStep(overrides: Partial<StepDescriptor> = {}): StepDescriptor {
  return {
    stepId: "step_1",
    stepName: "Submit Form",
    operation: "CLICK",
    target: "BROWSER_DETERMINISTIC",
    hasSideEffects: true,
    inputVariables: ["var_1"],
    outputVariables: [],
    ...overrides
  };
}

function createSuccessExecutor(): StepExecutor {
  return {
    execute: async () => ({
      succeeded: true,
      outputs: { result: "ok" },
      durationMs: 150,
      sideEffectsDetected: []
    })
  };
}

function createFailExecutor(isTransient = false): StepExecutor {
  return {
    execute: async () => ({
      succeeded: false,
      error: { type: "ElementNotFound", message: "Selector #submit not found", isTransient, isRecoverable: isTransient },
      durationMs: 50,
      sideEffectsDetected: []
    })
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("State Transition Table", () => {
  it("should define valid transitions for every state", () => {
    const allStates: ExecutionState[] = ["READY", "PRE_ANALYSIS", "EXECUTING", "OBSERVING", "ASSESSING", "DECIDING", "RECOVERING", "COMPLETED", "FAILED", "PAUSED"];
    for (const state of allStates) {
      expect(VALID_TRANSITIONS[state]).toBeDefined();
      expect(Array.isArray(VALID_TRANSITIONS[state])).toBe(true);
    }
  });

  it("should have no outgoing transitions from terminal states", () => {
    expect(VALID_TRANSITIONS["COMPLETED"]).toEqual([]);
    expect(VALID_TRANSITIONS["FAILED"]).toEqual([]);
  });

  it("should allow PAUSED to resume", () => {
    expect(VALID_TRANSITIONS["PAUSED"]).toContain("PRE_ANALYSIS");
    expect(VALID_TRANSITIONS["PAUSED"]).toContain("EXECUTING");
  });
});

describe("ESM — Successful Execution", () => {
  it("should execute a step successfully and produce a CONTINUE decision", async () => {
    const graph = createTestGraph();
    const understanding = createTestUnderstanding();
    const semantic = createTestSemanticUnderstanding();
    const executor = createSuccessExecutor();

    const esm = new ExecutionStateMachine(graph, understanding, semantic, executor);
    expect(esm.getState()).toBe("READY");

    const decision = await esm.executeStep(createTestStep());

    expect(decision.decision).toBe("CONTINUE");
    expect(decision.triggeringObservation.outcomeMatch).toBe("EXACT");
    expect(decision.triggeringObservation.error).toBeUndefined();
    expect(decision.confidence).toBeGreaterThan(0.5);
  });

  it("should produce a valid execution trace", async () => {
    const graph = createTestGraph();
    const esm = new ExecutionStateMachine(graph, createTestUnderstanding(), createTestSemanticUnderstanding(), createSuccessExecutor());

    await esm.executeStep(createTestStep());
    const trace = esm.getTrace();

    expect(trace.entries.length).toBeGreaterThan(0);
    expect(trace.totalObservations).toBeGreaterThan(0);
    // Verify no invalid transitions in the trace
    for (const entry of trace.entries) {
      expect(VALID_TRANSITIONS[entry.fromState]).toContain(entry.toState);
    }
  });
});

describe("ESM — Failed Execution with Recovery", () => {
  it("should attempt recovery on transient failure", async () => {
    let callCount = 0;
    const executor: StepExecutor = {
      execute: async () => {
        callCount++;
        if (callCount <= 1) {
          return {
            succeeded: false,
            error: { type: "Timeout", message: "API timeout", isTransient: true, isRecoverable: true },
            durationMs: 5000
          };
        }
        return { succeeded: true, outputs: {}, durationMs: 200 };
      }
    };

    const esm = new ExecutionStateMachine(
      createTestGraph(), createTestUnderstanding(), createTestSemanticUnderstanding(), executor
    );

    const decision = await esm.executeStep(createTestStep());
    expect(decision.decision).toBe("CONTINUE");
    expect(callCount).toBe(2); // Original + 1 retry
  });

  it("should escalate to human after max recovery attempts", async () => {
    const executor = createFailExecutor(true);
    const esm = new ExecutionStateMachine(
      createTestGraph(), createTestUnderstanding(), createTestSemanticUnderstanding(), executor,
      { maxRecoveryAttempts: 2, riskConfidenceThreshold: 0.6, humanApprovalRiskLevels: ["CRITICAL"], abortOnCriticalRisk: false }
    );

    const decision = await esm.executeStep(createTestStep());
    // After exceeding max recovery attempts, should FAIL
    expect(decision.decision).toBe("FAIL");
  });
});

describe("ESM — Observation Integrity", () => {
  it("should capture observations with real evidence IDs only", async () => {
    const graph = createTestGraph();
    const esm = new ExecutionStateMachine(graph, createTestUnderstanding(), createTestSemanticUnderstanding(), createSuccessExecutor());

    const decision = await esm.executeStep(createTestStep());
    const obs = decision.triggeringObservation;

    // All evidence IDs in observations must exist in the graph
    const validIds = new Set<string>();
    for (const node of graph.nodes) {
      validIds.add(node.id);
      if (node.provenance) {
        for (const p of node.provenance) {
          if (p.evidenceId) validIds.add(p.evidenceId);
        }
      }
    }
    for (const v of graph.variables) validIds.add(v.id);
    for (const es of graph.externalSystems) validIds.add(es.id);

    for (const id of obs.evidenceIds) {
      expect(validIds.has(id)).toBe(true);
    }
  });

  it("should detect deviations on failure", async () => {
    const esm = new ExecutionStateMachine(
      createTestGraph(), createTestUnderstanding(), createTestSemanticUnderstanding(), createFailExecutor()
    );

    const decision = await esm.executeStep(createTestStep());
    // The observation should record the failure
    const trace = esm.getTrace();
    const observations = trace.entries.filter(e => e.observation);
    expect(observations.length).toBeGreaterThan(0);
    
    const failObs = observations.find(o => o.observation!.outcomeMatch === "MISMATCH");
    expect(failObs).toBeDefined();
    expect(failObs!.observation!.deviations.length).toBeGreaterThan(0);
  });
});

describe("ESM — Illegal Transitions", () => {
  it("should throw on illegal state transition", () => {
    const esm = new ExecutionStateMachine(
      createTestGraph(), createTestUnderstanding(), createTestSemanticUnderstanding(), createSuccessExecutor()
    );

    // ESM starts in READY. Trying to go directly to COMPLETING should fail.
    expect(() => (esm as any).transition("COMPLETED")).toThrow("ILLEGAL STATE TRANSITION");
  });

  it("should not allow transitions from terminal states", async () => {
    const esm = new ExecutionStateMachine(
      createTestGraph(), createTestUnderstanding(), createTestSemanticUnderstanding(), createSuccessExecutor()
    );

    await esm.executeStep(createTestStep());
    esm.complete();

    expect(esm.isTerminal()).toBe(true);
    expect(() => (esm as any).transition("EXECUTING")).toThrow("ILLEGAL STATE TRANSITION");
  });
});
