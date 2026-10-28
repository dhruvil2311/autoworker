import { describe, expect, it } from "vitest";
import { assertSafeNavigationUrl, evaluateAnomalyPolicy, redactText, sanitizeInputValue } from "./index.js";

describe("security utilities", () => {
  it("replaces password values with semantic placeholders", () => {
    expect(sanitizeInputValue("hunter2", { type: "password", name: "shopify_password" })).toEqual({
      value_placeholder: "{{SECRET:SHOPIFY_PASSWORD}}"
    });
  });

  it("redacts common PII and secrets from text", () => {
    expect(redactText("email test@example.com card 4111 1111 1111 1111")).toContain("[REDACTED_EMAIL]");
    expect(redactText("email test@example.com card 4111 1111 1111 1111")).toContain("[REDACTED_PAYMENT]");
    expect(redactText("id 00000000-0000-4000-8000-000000000001")).toContain("00000000-0000-4000-8000-000000000001");
  });

  it("blocks private and metadata URLs", () => {
    expect(() => assertSafeNavigationUrl("http://127.0.0.1/admin")).toThrow();
    expect(() => assertSafeNavigationUrl("http://169.254.169.254/latest")).toThrow();
  });

  it("evaluates anomaly policies", () => {
    expect(evaluateAnomalyPolicy({ metric: "inventory_change_percentage", operator: ">", threshold: 20, action: "PAUSE" }, 25)).toBe(true);
  });

  it("permits searching and inspecting products under product research policy", async () => {
    const { validateWorkflowPolicies, STANDARD_TASK_POLICIES } = await import("./index.js");
    const allowedWorkflow = {
      id: "root",
      children: [
        { id: "step_1", operation: "NAVIGATE", args: { url: "https://www.amazon.com/s?k=ergonomic+mouse" }, description: "Search for ergonomic mouse" },
        { id: "step_2", operation: "EXTRACT", args: { selector: ".s-result-item" }, description: "Extract observed price and title" },
        { id: "step_3", operation: "BUILD_OUTPUT", args: {}, description: "Generate price comparison report" }
      ]
    };
    const result = validateWorkflowPolicies(allowedWorkflow, STANDARD_TASK_POLICIES.PRODUCT_RESEARCH!);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("strictly blocks prohibited actions (Add to Cart, Buy Now, Checkout) under product research policy", async () => {
    const { validateWorkflowPolicies, STANDARD_TASK_POLICIES } = await import("./index.js");
    const prohibitedWorkflow = {
      id: "root",
      children: [
        { id: "step_1", operation: "NAVIGATE", args: { url: "https://www.amazon.com" }, description: "Navigate to store" },
        { id: "step_2", operation: "CLICK", args: { selector: "#add-to-cart-button" }, description: "Add item to cart" },
        { id: "step_3", operation: "CLICK", args: { selector: "#buy-now-button" }, description: "Buy now" }
      ]
    };
    const result = validateWorkflowPolicies(prohibitedWorkflow, STANDARD_TASK_POLICIES.PRODUCT_RESEARCH!);
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
    expect(result.violations.some(v => v.ruleId === "NO_CART_ADDITION")).toBe(true);
    expect(result.violations.some(v => v.ruleId === "NO_PURCHASE_OR_CHECKOUT")).toBe(true);
  });
});
