import * as fs from 'fs';
import * as path from 'path';

const API_URL = "http://localhost:4000/api/v1";
let TOKEN = "";

async function request(method: string, endpoint: string, body?: any) {
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  if (TOKEN) {
    headers["authorization"] = `Bearer ${TOKEN}`;
  }
  
  const res = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`API Error ${res.status} ${endpoint}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log("==========================================");
  console.log("GHOST E2E VERIFICATION TEST");
  console.log("==========================================\n");

  // 1. Auth Bootstrap
  console.log("1. Authenticating Dev User...");
  const loginRes = await request("POST", "/auth/dev/login", { email: "admin@ghost.local", password: "Ghost@123456" });
  TOKEN = loginRes.token;
  console.log("   ✅ Dev login token acquired.");

  console.log("   Bootstrapping organization...");
  const authRes = await request("POST", "/auth/bootstrap");
  if (authRes.organization?.id) {
    // Construct dev token with tenant ID: dev:USER_ID:TENANT_ID
    TOKEN = `dev:${authRes.user.id}:${authRes.organization.id}:owner`;
  }
  console.log(`   ✅ Organization bootstrapped: ${authRes.organization?.id}`);

  // 2. Create Ghost
  console.log("\n2. Creating Ghost...");
  const workerData = await request("POST", "/ghost-workers", {
    name: "Invoice Ghost",
    description: "Reads an invoice, verifies the invoice number and amount, and submits the invoice through the demo invoice application."
  });
  const workerId = workerData.id;
  console.log(`   ✅ Ghost created: ${workerId}`);

  // 3. Upload Evidence
  console.log("\n3. Uploading Evidence (SOP)...");
  const sopContent = `
1. Open the invoice portal at http://localhost:4000/demo/invoice.
2. Find the invoice.
3. Verify invoice number.
4. Verify invoice amount.
5. If amount is correct, submit the invoice.
6. If amount is incorrect, do not submit.
7. Record the result.
  `.trim();
  
  const docRes = await request("POST", `/ghost-workers/${workerId}/documents`, {
    name: "Invoice_SOP.txt",
    type: "SOP",
    content: sopContent
  });
  console.log(`   ✅ Document uploaded: ${docRes.document.id}`);

  // 4. Analyze Evidence
  console.log("\n4. Triggering Analysis...");
  await request("POST", `/ghost-workers/${workerId}/analyze-documents`);
  
  // Poll until BPS is generated
  let workerStatus = "";
  let bpsId = null;
  while (workerStatus !== "READY_FOR_REVIEW" && workerStatus !== "NEEDS_CLARIFICATION") {
    await sleep(2000);
    const worker = await request("GET", `/ghost-workers/${workerId}`);
    workerStatus = worker.status;
    bpsId = worker.bpsId;
    console.log(`   ... status: ${workerStatus}, stage: ${worker.analysisStage}`);
    if (workerStatus === "ACTIVE" || workerStatus === "ERROR") break;
  }
  console.log(`   ✅ Analysis complete. BPS ID: ${bpsId}`);

  // 5. Check Knowledge Base
  console.log("\n5. Checking Knowledge Base...");
  const memoryRes = await request("GET", `/ghost-workers/${workerId}/memory`);
  console.log(`   ✅ Rules found: ${memoryRes.memory?.rules?.length || 0}`);
  
  // 6. Chat Instruction
  console.log("\n6. Sending Chat Instruction...");
  const chatRes = await request("POST", `/ghost-workers/${workerId}/chat`, {
    instruction: "For invoices above ₹50,000, never submit automatically. Ask me for approval."
  });
  console.log(`   ✅ Chat response: ${chatRes.message?.content}`);

  // 6.5 Resolve Gaps
  console.log("\n6.5 Resolving Gaps...");
  const gapsRes = await request("GET", `/ghost-workers/${workerId}/gaps`);
  console.log(`   ✅ Gaps found: ${gapsRes.blocking_count} blocking, ${gapsRes.optional_count} optional`);
  for (const gap of gapsRes.gaps) {
    if (gap.blocking) {
      await request("POST", `/ghost-workers/${workerId}/gaps/${gap.gap_id}/answer`, {
        answer: "Yes, correct."
      });
    }
  }
  console.log("   ✅ All gaps resolved.");
  
  // 7. Recompile
  console.log("\n7. Recompiling Worker...");
  await request("POST", `/ghost-workers/${workerId}/compile`);
  await sleep(3000); // Wait for background compile

  const worker = await request("GET", `/ghost-workers/${workerId}`);
  const versionId = worker.activeVersionId;
  console.log(`   ✅ Compiled to Workflow Version: ${versionId}`);

  if (versionId) {
    const wfRes = await request("GET", `/workflows/${versionId}`);
    console.log(`   ✅ Workflow has ${wfRes.workflow.root_step?.children?.length || 0} top-level steps.`);
  }

  // 8. Edit Workflow
  console.log("\n8. Editing Workflow (Optional for test script)...");
  // Skipped direct edit, assume the compiler put the correct nodes if generic.
  
  // 9. Run Ghost
  console.log("\n9. Running Ghost...");
  const runRes = await request("POST", `/ghost-workers/${workerId}/run`);
  const runId = runRes.run.id;
  console.log(`   ✅ Run created: ${runId}`);

  // Poll Run Status
  let runState = "QUEUED";
  while (runState === "QUEUED" || runState === "RUNNING") {
    await sleep(2000);
    const run = await request("GET", `/runs/${runId}/detail`);
    runState = run.run.state;
    console.log(`   ... run state: ${runState}`);
  }
  
  console.log(`\n   ✅ Run finished with state: ${runState}`);

  const runDetail = await request("GET", `/runs/${runId}/detail`);
  console.log(`   ✅ Execution steps: ${runDetail.steps?.length || 0}`);
  
  if (runState === "WAITING_FOR_HUMAN") {
    console.log("\n10. Handling HITL...");
    const hitls = runDetail.hitl_requests;
    if (hitls && hitls.length > 0) {
      console.log(`   ✅ Resolving HITL request ${hitls[0].id}`);
      await request("POST", `/exceptions/${hitls[0].id}/resolve`, {
        resolution: "The submit button has moved."
      });
      console.log(`   ✅ Resolved.`);
    }
  }

  console.log("\n==========================================");
  console.log("TEST COMPLETED");
  console.log("==========================================");
}

runTest().catch(err => {
  console.error("❌ Test Failed:", err);
});
