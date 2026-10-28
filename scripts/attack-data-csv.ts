import * as path from 'path';
import { DataExecutor } from '../packages/runtime/src/executors/data.js';
import { RuntimeContext } from '../packages/runtime/src/context.js';
import type { WorkflowV2Step } from '@ghost/workflow-schema';

async function runAttack() {
  console.log("Starting Adversarial Attack: The Blind CSV Schema Bug");

  const context = new RuntimeContext({
    runId: "attack_run_2",
    workflowId: "wf_2",
    tenantId: "tenant_1",
    userId: "user_1"
  }, {});
  
  const executor = new DataExecutor();

  // The step expects columns "Order ID" and "Refund Amount" downstream,
  // but the file contains "Order Num" and "Total".
  const step: WorkflowV2Step = {
    id: "step_data",
    type: "ACTION",
    target: "DATA",
    operation: "PROCESS_FILE",
    args: {
      file: path.resolve(process.cwd(), "scripts/malformed_refunds.csv"),
      expectedSchema: ["Order ID", "Refund Amount"]
    },
    bind_result_to: "csvRows"
  };

  console.log("\nExecuting Ghost step...");
  const result = await executor.execute(step, context);
  
  console.log("\n--- EXPERIMENT RESULTS ---");
  console.log(`Ghost Executor State: ${result.state}`);
  
  if (result.state === "SUCCEEDED") {
    console.log("💥 ATTACK SUCCESSFUL: Ghost blindly ingested a malformed schema.");
    const parsedData = result.outputs?.csvRows || [];
    console.log(`Parsed Data length: ${parsedData.length}`);
    console.log(`Sample Row:`, parsedData[0]);
    
    // Simulating downstream silent failure
    const orderId = parsedData[0]['Order ID'];
    console.log(`\nSimulated Downstream Loop for Row 0:`);
    console.log(`Executing Refund for Order ID: ${orderId}`);
    if (orderId === undefined) {
      console.log(`⚠️ FATAL SILENT CORRUPTION: Ghost passed undefined as Order ID to the API.`);
    }
  } else {
    console.log("🛡️ DEFENSE HELD: Ghost detected the schema failure.");
    console.log(`Reason: ${result.message}`);
  }
}

runAttack().catch(console.error);
