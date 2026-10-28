import express from 'express';
import { ApiExecutor } from '../packages/runtime/src/executors/api.js';
import { RuntimeContext } from '../packages/runtime/src/context.js';
import type { WorkflowV2Step } from '@ghost/workflow-schema';

async function runAttack() {
  console.log("Starting Adversarial Attack: The 200 OK Bug");

  // Mock global fetch to simulate external API returning 200 OK with business error
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    return new Response(JSON.stringify({
      success: false,
      errorCode: "INSUFFICIENT_FUNDS",
      message: "Refund failed because account has insufficient funds."
    }), {
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' })
    });
  };

  try {
    // 2. Setup Ghost Context and Executor
    const context = new RuntimeContext({
      runId: "attack_run_1",
      workflowId: "wf_1",
      tenantId: "tenant_1",
      userId: "user_1"
    }, {});
    
    const executor = new ApiExecutor();

    // 3. Define the step
    const step: WorkflowV2Step = {
      id: "step_1",
      type: "ACTION",
      target: "API",
      operation: "CALL_API",
      args: {
        url: "https://api.external-saas.com/v1/legacy/refund",
        method: "GET",
        successCondition: "data.success === true"
      }
    };

    console.log("\nExecuting Ghost step...");
    const result = await executor.execute(step, context);
    
    console.log("\n--- EXPERIMENT RESULTS ---");
    console.log(`Ghost Executor State: ${result.state}`);
    
    if (result.state === "SUCCEEDED") {
      console.log("💥 ATTACK SUCCESSFUL: Ghost blindly assumed 200 OK meant business success.");
      console.log(`Ghost Output Payload: ${JSON.stringify(result.outputs)}`);
    } else {
      console.log("🛡️ DEFENSE HELD: Ghost detected the business failure.");
      console.log(`Reason: ${result.message}`);
    }

  } finally {
    global.fetch = originalFetch;
  }
}

runAttack().catch(console.error);
