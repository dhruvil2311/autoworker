/**
 * Live GoalInference Benchmark
 * 
 * Tests the LLM-backed GoalInference engine against REAL API calls.
 * Uses 3 diverse scenarios across different industries.
 * 
 * This is NOT a unit test. This is a live evaluation.
 */

import { inferGoal } from "../reasoner/engines/goal-inference.js";
import { OirGraph } from "../types.js";

// ─── Scenario 1: Financial (Refund Processing) ─────────────────────────────

const financialGraph: OirGraph = {
  version: "1.0",
  businessGoal: "Process Customer Refund",
  businessObjects: [
    { id: "bo_order", name: "Order", description: "Customer order", properties: { orderId: "string", total: "number" } }
  ],
  variables: [
    { id: "var_amount", name: "refund_amount", type: "number", description: "Amount to refund" },
    { id: "var_reason", name: "refund_reason", type: "string" }
  ],
  constants: [],
  businessRules: [
    { id: "rule_limit", description: "Refunds over $500 require manager approval", condition: "amount > 500", enforcementLevel: "STRICT" }
  ],
  externalSystems: [
    { id: "sys_stripe", name: "Stripe Payment Gateway", type: "API", url: "https://api.stripe.com" }
  ],
  entities: [],
  evidenceLinks: [],
  knowledgeReferences: [],
  nodes: [
    {
      id: "action_lookup", name: "GET /api/orders/123", type: "ACTION",
      operation: "API_CALL", inputs: { orderId: "123" }, outputs: ["var_amount"],
      sideEffects: false, provenance: [{ source: "API_CALL", evidenceId: "obs_1" }], confidence: 0.95
    },
    {
      id: "action_refund", name: "POST /api/refund", type: "ACTION",
      operation: "API_CALL", inputs: { amount: 150, reason: "defective" }, outputs: [],
      sideEffects: true, systemId: "sys_stripe",
      provenance: [{ source: "API_CALL", evidenceId: "obs_2" }], confidence: 0.9
    }
  ],
  dependencies: [
    { sourceId: "action_lookup", targetId: "action_refund", type: "DATA" }
  ],
  globalConfidence: 0.9,
  rootNodeId: "action_lookup"
};

// ─── Scenario 2: Supply Chain (Inventory Restock) ───────────────────────────

const supplyChainGraph: OirGraph = {
  version: "1.0",
  businessGoal: "Restock Low-Stock Items",
  businessObjects: [],
  variables: [
    { id: "var_sku", name: "sku", type: "string" },
    { id: "var_stock_level", name: "current_stock", type: "number" }
  ],
  constants: [
    { id: "const_threshold", name: "restock_threshold", value: 10, type: "number" }
  ],
  businessRules: [
    { id: "rule_threshold", description: "Auto-restock when stock < 10", condition: "stock < 10", enforcementLevel: "STRICT" }
  ],
  externalSystems: [
    { id: "sys_erp", name: "SAP ERP", type: "API", url: "https://sap.example.com" },
    { id: "sys_warehouse", name: "Warehouse Management System", type: "API" }
  ],
  entities: [],
  evidenceLinks: [],
  knowledgeReferences: [],
  nodes: [
    {
      id: "action_check", name: "GET /api/inventory/levels", type: "ACTION",
      operation: "API_CALL", inputs: {}, outputs: ["var_stock_level"],
      sideEffects: false, systemId: "sys_erp",
      provenance: [{ source: "API_CALL", evidenceId: "obs_1" }], confidence: 0.95
    },
    {
      id: "action_order", name: "POST /api/purchase-orders", type: "ACTION",
      operation: "API_CALL", inputs: { sku: "W001", quantity: 500 }, outputs: [],
      sideEffects: true, systemId: "sys_erp",
      provenance: [{ source: "API_CALL", evidenceId: "obs_2" }], confidence: 0.9
    },
    {
      id: "action_notify_warehouse", name: "POST /api/warehouse/receive", type: "ACTION",
      operation: "API_CALL", inputs: {}, outputs: [],
      sideEffects: true, systemId: "sys_warehouse",
      provenance: [{ source: "API_CALL", evidenceId: "obs_3" }], confidence: 0.85
    }
  ],
  dependencies: [
    { sourceId: "action_check", targetId: "action_order", type: "DATA" },
    { sourceId: "action_order", targetId: "action_notify_warehouse", type: "CONTROL" }
  ],
  globalConfidence: 0.85,
  rootNodeId: "action_check"
};

// ─── Scenario 3: Customer Support (Ticket Resolution) ──────────────────────

const supportGraph: OirGraph = {
  version: "1.0",
  businessGoal: "Resolve Customer Support Ticket",
  businessObjects: [
    { id: "bo_ticket", name: "SupportTicket", description: "Customer support ticket", properties: { ticketId: "string", priority: "string", status: "string" } }
  ],
  variables: [
    { id: "var_ticket_id", name: "ticket_id", type: "string" },
    { id: "var_resolution", name: "resolution_notes", type: "string" }
  ],
  constants: [],
  businessRules: [
    { id: "rule_sla", description: "P1 tickets must be resolved within 4 hours", condition: "priority == P1", enforcementLevel: "STRICT" }
  ],
  externalSystems: [
    { id: "sys_zendesk", name: "Zendesk", type: "WEB_UI", url: "https://support.example.zendesk.com" }
  ],
  entities: [],
  evidenceLinks: [],
  knowledgeReferences: [],
  nodes: [
    {
      id: "action_open_ticket", name: "Navigate to Zendesk ticket", type: "ACTION",
      operation: "NAVIGATE", inputs: { url: "https://support.example.zendesk.com/tickets/456" }, outputs: [],
      sideEffects: false, systemId: "sys_zendesk",
      provenance: [{ source: "BROWSER_EVENT", evidenceId: "obs_1" }], confidence: 0.95
    },
    {
      id: "action_add_note", name: "Add resolution note", type: "ACTION",
      operation: "INPUT", inputs: { text: "Replaced defective unit. Shipping tracking #XYZ." }, outputs: ["var_resolution"],
      sideEffects: true, systemId: "sys_zendesk",
      provenance: [{ source: "BROWSER_EVENT", evidenceId: "obs_2" }], confidence: 0.9
    },
    {
      id: "action_close", name: "Click Close Ticket", type: "ACTION",
      operation: "CLICK", inputs: { selector: "#close-ticket-btn" }, outputs: [],
      sideEffects: true, systemId: "sys_zendesk",
      provenance: [{ source: "BROWSER_EVENT", evidenceId: "obs_3" }], confidence: 0.85
    }
  ],
  dependencies: [
    { sourceId: "action_open_ticket", targetId: "action_add_note", type: "CONTROL" },
    { sourceId: "action_add_note", targetId: "action_close", type: "CONTROL" }
  ],
  globalConfidence: 0.85,
  rootNodeId: "action_open_ticket"
};

// ─── Run Benchmark ──────────────────────────────────────────────────────────

interface BenchmarkResult {
  scenario: string;
  expectedGoal: string;
  inferredGoal: string;
  goalMatch: boolean;
  evidenceIdsValid: boolean;
  evidenceCount: number;
  alternativeCount: number;
  confidence: Record<string, number>;
  latencyMs?: number;
  error?: string;
}

async function runBenchmark(): Promise<void> {
  const scenarios: Array<{ name: string; graph: OirGraph; expected: string }> = [
    { name: "Financial: Refund Processing", graph: financialGraph, expected: "Process Customer Refund" },
    { name: "Supply Chain: Inventory Restock", graph: supplyChainGraph, expected: "Restock Low-Stock Items" },
    { name: "Customer Support: Ticket Resolution", graph: supportGraph, expected: "Resolve Customer Support Ticket" }
  ];

  const results: BenchmarkResult[] = [];

  for (const scenario of scenarios) {
    console.log(`\n─── ${scenario.name} ───`);
    const startMs = Date.now();

    try {
      const goal = await inferGoal(scenario.graph);
      const latencyMs = Date.now() - startMs;

      // Validate evidence IDs
      const validIds = new Set<string>();
      for (const node of scenario.graph.nodes) {
        validIds.add(node.id);
        if (node.provenance) {
          for (const p of node.provenance) {
            if (p.evidenceId) validIds.add(p.evidenceId);
          }
        }
      }
      for (const v of scenario.graph.variables) validIds.add(v.id);
      for (const c of scenario.graph.constants) validIds.add(c.id);
      for (const bo of scenario.graph.businessObjects) validIds.add(bo.id);
      for (const br of scenario.graph.businessRules) validIds.add(br.id);
      for (const es of scenario.graph.externalSystems) validIds.add(es.id);

      const allEvidenceValid = goal.evidenceIds.every(id => validIds.has(id));
      const expectedPrefix = scenario.expected.toLowerCase().split(" ")[0] ?? "";
      const goalMatchesExpected = (goal.description ?? "").toLowerCase().includes(expectedPrefix);

      const result: BenchmarkResult = {
        scenario: scenario.name,
        expectedGoal: scenario.expected,
        inferredGoal: goal.description,
        goalMatch: goalMatchesExpected,
        evidenceIdsValid: allEvidenceValid,
        evidenceCount: goal.evidenceIds.length,
        alternativeCount: goal.alternatives.length,
        confidence: {
          reasoning: goal.confidence.reasoning,
          evidence: goal.confidence.evidence,
          semantic: goal.confidence.semantic,
          structural: goal.confidence.structural,
          operational: goal.confidence.operational,
          unknown: goal.confidence.unknown
        },
        latencyMs
      };

      results.push(result);

      console.log(`  Inferred: "${goal.description}"`);
      console.log(`  Expected: "${scenario.expected}"`);
      console.log(`  Match: ${goalMatchesExpected ? "✓" : "✗"}`);
      console.log(`  Evidence IDs valid: ${allEvidenceValid ? "✓" : "✗"} (${goal.evidenceIds.length} IDs)`);
      console.log(`  Alternatives: ${goal.alternatives.length}`);
      console.log(`  Confidence: reasoning=${goal.confidence.reasoning} evidence=${goal.confidence.evidence} unknown=${goal.confidence.unknown}`);
      console.log(`  Latency: ${latencyMs}ms`);
    } catch (error: any) {
      console.error(`  ERROR: ${error.message}`);
      if (error.stack) {
        console.error(`  STACK: ${error.stack}`);
      }
      results.push({
        scenario: scenario.name,
        expectedGoal: scenario.expected,
        inferredGoal: "ERROR",
        goalMatch: false,
        evidenceIdsValid: false,
        evidenceCount: 0,
        alternativeCount: 0,
        confidence: { reasoning: 0, evidence: 0, semantic: 0, structural: 0, operational: 0, unknown: 1 },
        error: error.message
      });
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════");
  console.log("GOAL INFERENCE BENCHMARK RESULTS");
  console.log("═══════════════════════════════════════════════════");

  const passed = results.filter(r => r.goalMatch && r.evidenceIdsValid);
  const fabrications = results.filter(r => !r.evidenceIdsValid && !r.error);

  console.log(`Total scenarios:     ${results.length}`);
  console.log(`Goal matched:        ${results.filter(r => r.goalMatch).length}/${results.length}`);
  console.log(`Evidence valid:      ${results.filter(r => r.evidenceIdsValid).length}/${results.length}`);
  console.log(`Fabrications:        ${fabrications.length}`);
  console.log(`Errors:              ${results.filter(r => r.error).length}`);
  console.log(`Avg latency:         ${Math.round(results.filter(r => r.latencyMs).reduce((s, r) => s + (r.latencyMs || 0), 0) / results.filter(r => r.latencyMs).length)}ms`);

  const verdict = passed.length === results.length ? "PROVEN" :
    passed.length > 0 ? "PARTIALLY PROVEN" : "UNPROVEN";

  console.log(`\nVERDICT: GoalInference is ${verdict}`);
  console.log(`Evidence: ${passed.length}/${results.length} scenarios passed (goal match + zero fabrication)`);
}

runBenchmark().catch(console.error);
