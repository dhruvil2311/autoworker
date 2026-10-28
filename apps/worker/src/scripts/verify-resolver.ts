import { RuntimeContext, VariableResolver } from "@ghost/runtime";
import * as assert from "assert";

function run() {
  const ctx = new RuntimeContext({
    inputs: {},
    variables: { supplier_stock: 150 },
    outputs: {},
    artifacts: {},
    scopes: [{ product: { name: "Widget", price: 10 } }],
    executionMetadata: { runId: "1", tenantId: "1", workflowVersionId: "1" }
  });

  const resolver = new VariableResolver(ctx);

  // 1. Reference Resolution
  const stock = resolver.resolve("{{supplier_stock}}");
  assert.strictEqual(typeof stock, "number");
  assert.strictEqual(stock, 150);

  // 2. String Interpolation
  const stockStr = resolver.resolve("Stock: {{supplier_stock}}");
  assert.strictEqual(typeof stockStr, "string");
  assert.strictEqual(stockStr, "Stock: 150");

  // 3. Object Reference Resolution
  const product = resolver.resolve("{{product}}");
  assert.strictEqual(typeof product, "object");
  assert.strictEqual(product.name, "Widget");

  // 4. Object String Interpolation
  const productStr = resolver.resolve("Selected: {{product}}");
  assert.strictEqual(productStr, 'Selected: {"name":"Widget","price":10}');

  // 5. Unknown reference rejection
  try {
    resolver.resolve("{{unknown}}");
    assert.fail("Should have thrown on unknown reference");
  } catch (e: any) {
    assert.ok(e.message.includes("Missing variable reference"));
  }

  // 6. Unsafe path rejection (__proto__)
  try {
    ctx.get("product.__proto__");
    assert.fail("Should have thrown on __proto__");
  } catch (e: any) {
    assert.ok(e.message.includes("Unsafe variable access"));
  }

  // 7. Unsafe path in substitution
  try {
    resolver.resolve("{{product.__proto__}}");
    assert.fail("Should have thrown on __proto__ via resolver");
  } catch (e: any) {
    assert.ok(e.message.includes("Unsafe variable access"));
  }

  console.log("VARIABLE RESOLVER VERIFIED!");
}

run();
