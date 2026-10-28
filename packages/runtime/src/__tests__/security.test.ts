import { describe, it, expect } from "vitest";
import { RuntimeContext, VariableResolver } from "../context.js";

describe("VariableResolver Security Tests", () => {
  it("rejects prototype pollution in context set", () => {
    const context = new RuntimeContext({
      inputs: {}, variables: {}, outputs: {}, artifacts: {}, scopes: [],
      executionMetadata: { runId: "1", tenantId: "t1", workflowVersionId: "v1" }
    });

    expect(() => context.set("variables.__proto__.admin", true)).toThrowError(/Unsafe variable modification/);
    expect(() => context.set("constructor.prototype.hacked", true)).toThrowError(/Unsafe variable modification/);
  });

  it("rejects prototype pollution in context get", () => {
    const context = new RuntimeContext({
      inputs: {}, variables: {}, outputs: {}, artifacts: {}, scopes: [],
      executionMetadata: { runId: "1", tenantId: "t1", workflowVersionId: "v1" }
    });

    expect(() => context.get("__proto__")).toThrowError(/Unsafe variable access/);
    expect(() => context.get("variables.constructor")).toThrowError(/Unsafe variable access/);
  });

  it("rejects prototype pollution through VariableResolver templates", () => {
    const context = new RuntimeContext({
      inputs: {}, variables: {}, outputs: {}, artifacts: {}, scopes: [],
      executionMetadata: { runId: "1", tenantId: "t1", workflowVersionId: "v1" }
    });
    const resolver = new VariableResolver(context);

    expect(() => resolver.resolve("{{__proto__}}")).toThrowError(/Unsafe variable access/);
    expect(() => resolver.resolve("Value is {{variables.constructor.prototype}}")).toThrowError(/Unsafe variable access/);
  });
});
