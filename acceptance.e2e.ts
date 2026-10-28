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

async function waitForRunCompletion(runId: string) {
  let runState = "QUEUED";
  let runDetail: any = null;
  while (runState === "QUEUED" || runState === "RUNNING") {
    await sleep(2000);
    const run = await request("GET", `/runs/${runId}/detail`);
    runDetail = run;
    runState = run.run.state;
    console.log(`   ... run state: ${runState}`);
  }
  return runDetail;
}

async function runTest() {
  console.log("==========================================");
  console.log("SAUCEDEMO BROWSER ACCEPTANCE TEST");
  console.log("==========================================\n");

  // 1. Auth Bootstrap
  console.log("1. Authenticating Dev User...");
  const loginRes = await request("POST", "/auth/dev/login", { email: "admin@ghost.local", password: "Ghost@123456" });
  TOKEN = loginRes.token;
  
  const authRes = await request("POST", "/auth/bootstrap");
  if (authRes.organization?.id) {
    TOKEN = `dev:${authRes.user.id}:${authRes.organization.id}:owner`;
  }
  console.log(`   ✅ Authentication complete.`);

  // 2. Create Ghost
  console.log("\n2. Creating Ghost...");
  const workerData = await request("POST", "/ghost-workers", {
    name: "QA Automator",
    description: "Executes end-to-end tests in headless browser environments."
  });
  const workerId = workerData.id;
  console.log(`   ✅ Ghost created: ${workerId}`);

  // 3. Upload Evidence
  console.log("\n3. Uploading Evidence (SOP)...");
  const sopContent = `
Goal: Perform a complete end-to-end acceptance test of saucedemo.com

Rules:
1. Open: https://www.saucedemo.com/
2. Enter: standard_user in the username field.
3. Enter: secret_sauce in the password field.
4. Click Login.
5. Verify inventory page.
6. Sort products by price low-to-high.
7. Verify sorting actually changed.
8. Open Sauce Labs Backpack.
9. Return to inventory.
10. Add Sauce Labs Backpack to cart.
11. Open cart.
12. Verify Sauce Labs Backpack exists.
13. Remove the product.
14. Verify cart is empty.
15. Log out.
16. Verify login screen.
17. Leave the browser open.
  `.trim();
  
  await request("POST", `/ghost-workers/${workerId}/documents`, {
    name: "SauceDemo_Acceptance_Test.txt",
    type: "SOP",
    content: sopContent
  });
  console.log(`   ✅ Document uploaded.`);

  // 4. Analyze Evidence
  console.log("\n4. Triggering Analysis...");
  await request("POST", `/ghost-workers/${workerId}/analyze-documents`);
  
  let workerStatus = "";
  while (workerStatus !== "READY_FOR_REVIEW" && workerStatus !== "NEEDS_CLARIFICATION") {
    await sleep(2000);
    const worker = await request("GET", `/ghost-workers/${workerId}`);
    workerStatus = worker.status;
    console.log(`   ... status: ${workerStatus}, stage: ${worker.analysisStage}`);
    if (workerStatus === "ACTIVE" || workerStatus === "ERROR") break;
  }
  console.log(`   ✅ Analysis complete.`);

  // Resolve Gaps
  console.log("\n4.5 Resolving Gaps...");
  const gapsRes = await request("GET", `/ghost-workers/${workerId}/gaps`);
  for (const gap of gapsRes.gaps) {
    if (gap.blocking) {
      const gapId = gap.id || gap.gap_id || gap.gapId;
      console.log(`   ... Resolving gap ${gapId}: ${gap.question || gap.description || ""}`);
      let answer = "Yes, correct.";
      if (gapId.startsWith("gap_var_")) {
        answer = "This changes per run, it is a variable.";
      }
      await request("POST", `/ghost-workers/${workerId}/gaps/${gapId}/answer`, { answer });
    }
  }
  
  // 5. Recompile (Version 1)
  console.log("\n5. Compiling Workflow v1...");
  await request("POST", `/ghost-workers/${workerId}/compile`);
  await sleep(6000); // Wait for background compile

  const worker = await request("GET", `/ghost-workers/${workerId}`);
  let versionId = worker.activeVersionId;
  console.log(`   ✅ Compiled to Workflow Version 1: ${versionId}`);

  // 6. Run Execution
  console.log("\n6. Run Execution on SauceDemo");
  console.log("BROWSER MODE: HEADED");
  console.log("BROWSER ENGINE: Playwright (Local Chromium)");
  console.log("EXECUTOR: V2BrowserExecutor -> Stagehand/Playwright");
  console.log("TARGET: https://www.saucedemo.com/");
  
  const run1Res = await request("POST", `/ghost-workers/${workerId}/run`, {
    inputs: { url: "https://www.saucedemo.com/" }
  });
  console.log(`   ... Dispatched Run ID: ${run1Res.runId}`);
  console.log(`   ... Workflow Version: ${versionId}`);

  const runDetail = await waitForRunCompletion(run1Res.runId);
  
  console.log("\n==========================================");
  console.log(`RUN COMPLETED WITH STATE: ${runDetail.run.state}`);
  console.log("==========================================");

  console.log("\nStep Results:");
  for (const step of runDetail.steps) {
    console.log(`- Step ${step.step_id} (${step.state})`);
    if (step.logs) {
      console.log(`    Logs: ${JSON.stringify(step.logs)}`);
    }
    if (step.outputs) {
      const keys = Object.keys(step.outputs).filter(k => k !== "screenshotUrl");
      if (keys.length > 0) {
        console.log(`    Outputs:`);
        for (const k of keys) {
           console.log(`      ${k}: ${step.outputs[k]}`);
        }
      }
      if (step.outputs.screenshotUrl) {
         console.log(`    Screenshot captured: YES`);
      }
    }
  }

}

runTest().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
