import { describe, expect, it } from "vitest";
import { OirCritic, validateOirGraph } from "../index.js";
import { IntentOirPlanner } from "./IntentOirPlanner.js";
import { plannerBenchmarkDataset, runIntentPlannerBenchmark } from "./benchmark.js";

describe("IntentOirPlanner", () => {
  it("builds a valid evidence-backed OIR from Shopify SOP, CSV, and API evidence", () => {
    const scenario = plannerBenchmarkDataset()[0];
    const result = new IntentOirPlanner().plan({
      tenantId: "tenant-a",
      merchant: "Acme Shopify",
      businessGoal: "Process Shopify refunds safely",
      observations: scenario!.observations
    });

    validateOirGraph(result.graph);
    expect(result.report.graphValid).toBe(true);
    expect(result.report.evidenceCompleteness).toBe(100);
    expect(result.report.unsupportedClaims).toEqual([]);
    expect(result.graph.nodes.length).toBeGreaterThanOrEqual(3);
    expect(result.graph.evidenceLinks.map((link) => link.id)).toContain("sop-refunds-v1");
  });

  it("requires clarification for contradictory refund thresholds", () => {
    const scenario = plannerBenchmarkDataset()[1];
    const result = new IntentOirPlanner().plan({
      tenantId: "tenant-a",
      merchant: "Acme Shopify",
      businessGoal: "Process Shopify refunds safely",
      observations: scenario!.observations
    });

    expect(result.report.contradictions).toHaveLength(1);
    expect(result.report.clarificationsRequired).toContain("Resolve contradictory policy evidence before execution.");
    expect(result.graph.globalUncertainty?.some((item) => item.includes("Refund threshold conflict"))).toBe(true);
  });

  it("detects unsafe injected SOP instructions without fabricating clean policy", () => {
    const scenario = plannerBenchmarkDataset()[2];
    const result = new IntentOirPlanner().plan({
      tenantId: "tenant-a",
      merchant: "Acme Shopify",
      businessGoal: "Process Shopify refunds safely",
      observations: scenario!.observations
    });

    expect(result.report.safetyBlockers).toHaveLength(1);
    expect(result.graph.globalConfidence).toBeLessThan(0.6);
    expect(result.graph.globalUncertainty?.some((item) => item.includes("Unsafe instruction"))).toBe(true);
  });

  it("critic respects dependency-linked sequential nodes", () => {
    const scenario = plannerBenchmarkDataset()[0];
    const result = new IntentOirPlanner().plan({
      tenantId: "tenant-a",
      merchant: "Acme Shopify",
      businessGoal: "Process Shopify refunds safely",
      observations: scenario!.observations
    });
    const review = new OirCritic().review(result.graph);

    expect(review.criticisms.filter((criticism) => criticism.problem === "Disconnected Graph Region")).toEqual([]);
  });

  it("treats Excel uploads as structured evidence for onboarding", () => {
    const result = new IntentOirPlanner().plan({
      tenantId: "tenant-a",
      merchant: "Acme Shopify",
      businessGoal: "Process Shopify refunds safely",
      observations: [
        {
          id: "excel-refund-queue",
          type: "EXCEL_DATA",
          timestamp: "2026-08-08T00:00:00.000Z",
          filename: "refund_queue.xlsx",
          sheetName: "Refunds",
          headers: ["order_id", "refund_amount", "customer_email"],
          rows: [{ order_id: "1002", refund_amount: "250.00", customer_email: "b@example.com" }]
        } as any
      ]
    });

    expect(result.report.graphValid).toBe(true);
    expect(result.graph.nodes.some((node) => node.operation === "data.validate_rows")).toBe(true);
    expect(result.graph.variables.some((variable) => variable.name === "refund_amount")).toBe(true);
  });

  it("runs reproducible benchmark and keeps truth status below PROVEN", () => {
    const report = runIntentPlannerBenchmark();

    expect(report.scenarios).toBe(3);
    expect(report.graphValidity).toBe(1);
    expect(report.evidenceCompleteness).toBe(100);
    expect(report.contradictionDetection).toBe(1);
    expect(report.safetyDetection).toBe(1);
    expect(report.truthStatus).toBe("PARTIALLY_PROVEN");
  });
});
