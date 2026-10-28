import fs from "fs";

const API_URL = "http://localhost:4000";
let TOKEN = "";

async function request(method: string, path: string, body?: any) {
  const headers: any = { "Content-Type": "application/json" };
  if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;
  
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API Error ${res.status} ${res.statusText}: ${errText}`);
  }
  
  return res.json();
}

async function run() {
  console.log("Starting E2E Verification...");
  
  // 1. Auth
  console.log("1. Authenticating...");
  const authRes = await request("POST", "/api/v1/auth/dev/login", { email: "admin@ghost.local", password: "Ghost@123456" });
  TOKEN = authRes.token;
  console.log("Authenticated. Token:", TOKEN.substring(0, 10) + "...");
  
  console.log("1.5 Bootstrapping Tenant...");
  const bootstrapRes = await request("POST", "/api/v1/auth/bootstrap");
  console.log("Bootstrap response:", JSON.stringify(bootstrapRes));
  const orgId = bootstrapRes.organization?.id || bootstrapRes.organization_id;
  const userId = authRes.user.id;
  TOKEN = `dev:${userId}:${orgId}:owner`;
  console.log("Tenant bootstrapped. Token updated:", TOKEN.substring(0, 20) + "...");
  
  // 2. Create Ghost Worker
  console.log("2. Creating Ghost Worker...");
  const workerRes = await request("POST", "/api/v1/ghost-workers", { name: "Refund Processing Ghost", description: "Processes Shopify refunds on the safe demo endpoint." });
  const workerId = workerRes.id;
  console.log("Worker created:", workerId);
  
  // 3. Upload Evidence
  console.log("3. Uploading Evidence...");
  await request("POST", `/api/v1/ghost-workers/${workerId}/documents`, {
    name: "Manual Instructions",
    type: "SOP",
    content: "Navigate to http://localhost:4000/demo/refund. If the policy warning says it is eligible for a refund, click the Process Refund button."
  });
  console.log("Evidence uploaded.");
  
  // 4. Analyze & Plan Verification
  console.log("4. Triggering Analysis...");
  await request("POST", `/api/v1/ghost-workers/${workerId}/analyze-documents`);
  
  console.log("Polling analysis stage...");
  let stage = "EXTRACTING_KNOWLEDGE";
  while (stage !== "READY_FOR_REVIEW" && stage !== "NEEDS_CLARIFICATION") {
    await new Promise(r => setTimeout(r, 2000));
    const stageRes = await request("GET", `/api/v1/ghost-workers/${workerId}/analysis-stage`);
    stage = stageRes.status;
    console.log("Current stage:", stage);
  }
  
  if (stage === "READY_FOR_REVIEW") {
      console.log("4.5 Compiling Ghost Worker...");
      await request("POST", `/api/v1/ghost-workers/${workerId}/compile`);

      // 5. Activate Ghost
      console.log("5. Activating Ghost...");
      await request("POST", `/api/v1/ghost-workers/${workerId}/activate`);
  } else {
      throw new Error("Unexpected stage: " + stage);
  }
  
  // 6. Real Browser Execution (Happy Path)
  console.log("6. Triggering Run Now (Happy Path)...");
  const runRes = await request("POST", `/api/v1/ghost-workers/${workerId}/run`);
  const runId = runRes.run.id;
  console.log("Run queued:", runId);
  
  console.log("Polling run detail...");
  let runState = "QUEUED";
  let detail: any;
  while (runState !== "SUCCEEDED" && runState !== "FAILED" && runState !== "WAITING_FOR_HUMAN") {
    await new Promise(r => setTimeout(r, 2000));
    detail = await request("GET", `/api/v1/runs/${runId}/detail`);
    runState = detail.run.state;
    console.log("Run state:", runState);
  }
  
  if (runState !== "SUCCEEDED") {
      throw new Error("Expected SUCCEEDED, got " + runState);
  }
  
  console.log("Happy Path Run SUCCEEDED.");
  
  // Verify Screenshot & Timeline
  const screenshotStep = detail.timeline.find((s: any) => s.screenshotUrl);
  if (!screenshotStep) {
      throw new Error("No screenshot captured in the timeline!");
  }
  console.log("Verified: Screenshot captured successfully in timeline.");
  
  // Verify Notification
  console.log("Verifying Notifications...");
  const notifRes = await request("GET", "/api/v1/notifications");
  const notif = notifRes.notifications.find((n: any) => n.resourceId === runId && (n.type === "RUN_COMPLETED" || n.type === "execution_completed" || n.type === "execution_result"));
  if (!notif) {
      throw new Error("No notification found for happy path run.");
  }
  console.log("Verified: Notification created successfully.");
  
  // 7. Failure & HITL (Human-in-the-Loop)
  console.log("7. Triggering Run Now (Failure Path)...");
  console.log("Uploading failure evidence...");
  await request("POST", `/api/v1/ghost-workers/${workerId}/documents`, {
    name: "Manual Instructions (Failure)",
    type: "SOP",
    content: "Navigate to http://localhost:4000/demo/refund?hide_button=true. If the policy warning says it is eligible for a refund, click the Process Refund button."
  });
  
  console.log("Triggering Re-Analysis...");
  await request("POST", `/api/v1/ghost-workers/${workerId}/analyze-documents`);
  
  stage = "EXTRACTING_KNOWLEDGE";
  while (stage !== "READY_FOR_REVIEW" && stage !== "NEEDS_CLARIFICATION") {
    await new Promise(r => setTimeout(r, 2000));
    const stageRes = await request("GET", `/api/v1/ghost-workers/${workerId}/analysis-stage`);
    stage = stageRes.status;
    console.log("Current stage:", stage);
  }
  
  console.log("Compiling Failure Ghost...");
  await request("POST", `/api/v1/ghost-workers/${workerId}/compile`);
  
  console.log("Activating Failure Ghost...");
  await request("POST", `/api/v1/ghost-workers/${workerId}/activate`);
  
  const failRunRes = await request("POST", `/api/v1/ghost-workers/${workerId}/run`);
  const failRunId = failRunRes.run.id;
  console.log("Failure Run queued:", failRunId);
  
  console.log("Polling run detail...");
  let failRunState = "QUEUED";
  let failDetail: any;
  while (failRunState !== "SUCCEEDED" && failRunState !== "FAILED" && failRunState !== "WAITING_FOR_HUMAN") {
    await new Promise(r => setTimeout(r, 2000));
    failDetail = await request("GET", `/api/v1/runs/${failRunId}/detail`);
    failRunState = failDetail.run.state;
    console.log("Failure Run state:", failRunState);
  }
  
  if (failRunState !== "WAITING_FOR_HUMAN") {
    console.error("Failure Run Detail:", JSON.stringify(failDetail, null, 2));
    throw new Error(`Expected WAITING_FOR_HUMAN, got ${failRunState}`);
  }
  
  console.log("Failure Run hit WAITING_FOR_HUMAN.");
  
  const hitlRequests = failDetail.hitl_requests;
  if (!hitlRequests || hitlRequests.length === 0) {
      throw new Error("No HITL requests found on the run.");
  }
  
  const hitlId = hitlRequests[0].id;
  console.log("Verified: HITL Request created. ID:", hitlId);
  
  // 8. Resume / Resolve HITL
  console.log("8. Resolving HITL...");
  await request("POST", `/api/v1/exceptions/${hitlId}/resolve`, {
      response: "The button is hidden. Abort or click something else."
  });
  
  console.log("HITL Resolved.");
  console.log("ALL 13 CAPABILITIES VERIFIED.");
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
