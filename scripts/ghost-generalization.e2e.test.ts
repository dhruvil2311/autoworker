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
  console.log("Starting Journey 2 E2E Verification (Order Status Ghost)...");
  
  console.log("1. Authenticating...");
  const authRes = await request("POST", "/api/v1/auth/dev/login", { email: "admin@ghost.local", password: "Ghost@123456" });
  const userId = authRes.user.id;
  
  TOKEN = authRes.token;
  const realBootstrap = await request("POST", "/api/v1/auth/bootstrap");
  const orgId = realBootstrap.organization?.id || realBootstrap.organization_id;
  TOKEN = `dev:${userId}:${orgId}:owner`;
  console.log("Tenant bootstrapped. Token updated.");
  
  console.log("2. Creating Ghost Worker...");
  const workerRes = await request("POST", "/api/v1/ghost-workers", { name: "Order Status Ghost", description: "Checks order status on retail portal." });
  const workerId = workerRes.id;
  console.log("Worker created:", workerId);
  
  console.log("3. Uploading Evidence (SOP)...");
  await request("POST", `/api/v1/ghost-workers/${workerId}/documents`, {
    name: "Order Status SOP",
    type: "SOP",
    content: "Navigate to http://localhost:4000/demo/order-status. Extract the text of the order status from the page into a variable called 'current_status'. If 'current_status' is EQUALS to 'PROCESSING', click the 'Mark Checked' button."
  });
  
  console.log("4. Triggering Analysis...");
  await request("POST", `/api/v1/ghost-workers/${workerId}/analyze-documents`);
  
  let stage = "EXTRACTING_KNOWLEDGE";
  while (stage !== "READY_FOR_REVIEW" && stage !== "NEEDS_CLARIFICATION") {
    await new Promise(r => setTimeout(r, 2000));
    const stageRes = await request("GET", `/api/v1/ghost-workers/${workerId}/analysis-stage`);
    stage = stageRes.status;
  }
  console.log("Analysis stage:", stage);

  if (stage === "NEEDS_CLARIFICATION") {
    console.log("Answering gaps...");
    const gapsRes = await request("GET", `/api/v1/ghost-workers/${workerId}/gaps`);
    for (const gap of gapsRes.gaps) {
      if (gap.blocking) {
        console.log(`Answering gap: ${gap.description}`);
        const answerRes = await request("POST", `/api/v1/ghost-workers/${workerId}/gaps/${gap.gap_id}/answer`, {
          answer_type: "TEXT",
          answer: "Yes, it is a constant. That is correct."
        });
        stage = answerRes.status;
      }
    }
    console.log("After answering gaps, stage is:", stage);
  }

  if (stage !== "READY_FOR_REVIEW") {
    throw new Error(`Expected READY_FOR_REVIEW but got ${stage}`);
  }
  
  console.log("4.5 Editing via Chat...");
  await request("POST", `/api/v1/ghost-workers/${workerId}/chat`, {
    instruction: "If the status is DELAYED for more than 7 days, do not mark as checked. Instead, escalate to a human."
  });
  
  console.log("Re-compiling via Chat triggers (or manual compile)...");
  await request("POST", `/api/v1/ghost-workers/${workerId}/compile`);
  await request("POST", `/api/v1/ghost-workers/${workerId}/activate`);
  
  console.log("5. Run successfully (Status: PROCESSING)");
  const run1Res = await request("POST", `/api/v1/ghost-workers/${workerId}/run`);
  const run1Id = run1Res.run.id;
  
  let run1State = "QUEUED";
  let detail1: any;
  while (run1State !== "SUCCEEDED" && run1State !== "FAILED" && run1State !== "WAITING_FOR_HUMAN") {
    await new Promise(r => setTimeout(r, 2000));
    detail1 = await request("GET", `/api/v1/runs/${run1Id}/detail`);
    run1State = detail1.run.state;
  }
  if (run1State !== "SUCCEEDED") {
    console.error("RUN 1 FAILED:", JSON.stringify(detail1, null, 2));
    throw new Error("Expected SUCCEEDED for Run 1, got " + run1State);
  }
  console.log("Run 1 SUCCEEDED.");

  // For runs 6, 7, 8, the worker executor (Playwright) will need to be told to navigate to parameterized URLs, OR we can pass it as a run input if Ghost supports it. But Ghost uses deterministic URL from the compiler if not parameterized.
  // Actually, we can just test the fail path by uploading failure evidence with the parameterized URL, similar to `verify-e2e.ts`.
  console.log("6. Run failure (status=DELAYED) -> HITL Escalate...");
  await request("POST", `/api/v1/ghost-workers/${workerId}/documents`, {
    name: "Failure trigger SOP",
    type: "SOP",
    content: "Navigate to http://localhost:4000/demo/order-status?status=DELAYED. Extract the text of the order status from the page into a variable called 'current_status'. If 'current_status' is EQUALS to 'PROCESSING', click the 'Mark Checked' button. If the status is DELAYED for more than 7 days, do not mark as checked. Instead, escalate to a human."
  });
  
  await request("POST", `/api/v1/ghost-workers/${workerId}/analyze-documents`);
  
  stage = "EXTRACTING_KNOWLEDGE";
  while (stage !== "READY_FOR_REVIEW" && stage !== "NEEDS_CLARIFICATION") {
    await new Promise(r => setTimeout(r, 2000));
    const stageRes = await request("GET", `/api/v1/ghost-workers/${workerId}/analysis-stage`);
    stage = stageRes.status;
  }
  
  if (stage === "NEEDS_CLARIFICATION") {
    console.log("Answering gaps for second upload...");
    const gapsRes = await request("GET", `/api/v1/ghost-workers/${workerId}/gaps`);
    for (const gap of gapsRes.gaps) {
      const questionText = gap.description || gap.suggested_question?.question_text || "";
      console.log(`Answering gap: ${questionText}`);
      let answer = "Yes, do that.";
      if (questionText.includes("current_status")) {
        answer = "Yes, extract the order status text into the variable 'current_status'.";
      }
      if (questionText.includes("Mark Checked")) {
        answer = "Yes, it is mandatory to click the Mark Checked button if the condition is met.";
      }
      if (questionText.includes("status=DELAYED")) {
        answer = "Yes, the URL is http://localhost:4000/demo/order-status?status=DELAYED.";
      }
      await request("POST", `/api/v1/ghost-workers/${workerId}/gaps/${gap.gap_id}/answer`, { answer_type: "TEXT", answer });
    }
    const finalStageRes = await request("GET", `/api/v1/ghost-workers/${workerId}/analysis-stage`);
    console.log("After answering gaps, stage is:", finalStageRes.status);
  }
  
  await request("POST", `/api/v1/ghost-workers/${workerId}/compile`);
  await request("POST", `/api/v1/ghost-workers/${workerId}/activate`);
  
  const workerDetail = await request("GET", `/api/v1/ghost-workers/${workerId}`);
  console.log("COMPILED WORKFLOW:", JSON.stringify(workerDetail.active_workflow, null, 2));
  
  const failRunRes = await request("POST", `/api/v1/ghost-workers/${workerId}/run`);
  const failRunId = failRunRes.run.id;
  
  let failRunState = "QUEUED";
  let failDetail: any;
  while (failRunState !== "SUCCEEDED" && failRunState !== "FAILED" && failRunState !== "WAITING_FOR_HUMAN") {
    await new Promise(r => setTimeout(r, 2000));
    failDetail = await request("GET", `/api/v1/runs/${failRunId}/detail`);
    failRunState = failDetail.run.state;
  }
  
  if (failRunState !== "WAITING_FOR_HUMAN") {
    console.error("FAIL DETAIL:", JSON.stringify(failDetail, null, 2));
    throw new Error("Expected WAITING_FOR_HUMAN, got " + failRunState);
  }
  
  const hitlId = failDetail.hitl_requests[0].id;
  console.log("Verified: HITL Request created. ID:", hitlId);
  
  console.log("7. Resolving HITL...");
  await request("POST", `/api/v1/exceptions/${hitlId}/resolve`, {
      response: "Click the Mark Checked button anyway, even if it is delayed."
  });
  console.log("HITL Resolved. Waiting for background BPI re-analysis...");

  const oldVersionId = workerDetail.active_version_id;
  
  let recompileStage = "EXTRACTING_KNOWLEDGE";
  while (recompileStage !== "READY_FOR_REVIEW" && recompileStage !== "NEEDS_CLARIFICATION" && recompileStage !== "ACTIVE") {
    await new Promise(r => setTimeout(r, 2000));
    const stageRes = await request("GET", `/api/v1/ghost-workers/${workerId}/analysis-stage`);
    recompileStage = stageRes.status;
    console.log(`Polling recompile stage: ${recompileStage}`);
  }

  if (recompileStage === "NEEDS_CLARIFICATION") {
      console.log("Answering gaps for memory recompilation...");
      const gapsRes = await request("GET", `/api/v1/ghost-workers/${workerId}/gaps`);
      for (const gap of gapsRes.gaps) {
        console.log(`Answering gap: ${gap.description || gap.suggested_question?.question_text}`);
        let answerText = "Yes, exactly. Do as instructed.";
        if ((gap.description || "").includes("escalate") || (gap.description || "").includes("DELAYED")) {
            answerText = "Ignore the delay rule. Never escalate to a human. Always click the 'Mark Checked' button even if the status is DELAYED.";
        }
        await request("POST", `/api/v1/ghost-workers/${workerId}/gaps/${gap.gap_id}/answer`, { answer_type: "TEXT", answer: answerText });
      }
      // Trigger compiler with the clarified BPS
      await request("POST", `/api/v1/ghost-workers/${workerId}/compile`);
      await request("POST", `/api/v1/ghost-workers/${workerId}/activate`);
  } else {
      console.log("Background recompilation finished!");
      // If it compiled automatically in the background, we still need to make sure the latest version is active, but the background task does that.
  }
  
  const workerDetailV2 = await request("GET", `/api/v1/ghost-workers/${workerId}`);
  console.log("COMPILED WORKFLOW V2:", JSON.stringify(workerDetailV2.active_workflow, null, 2));

  console.log("9. Run Version 2 (Expected: Success)...");
  const failRunRes2 = await request("POST", `/api/v1/ghost-workers/${workerId}/run`);
  const failRunId2 = failRunRes2.run.id;
  
  let failRunState2 = "QUEUED";
  let failDetail2: any;
  while (failRunState2 !== "SUCCEEDED" && failRunState2 !== "FAILED" && failRunState2 !== "WAITING_FOR_HUMAN") {
    await new Promise(r => setTimeout(r, 2000));
    failDetail2 = await request("GET", `/api/v1/runs/${failRunId2}/detail`);
    failRunState2 = failDetail2.run.state;
  }
  
  if (failRunState2 !== "SUCCEEDED") {
    console.error("FAIL DETAIL V2:", JSON.stringify(failDetail2, null, 2));
    throw new Error("Expected SUCCEEDED on re-run, got " + failRunState2);
  }
  console.log("Run 2 SUCCEEDED.");

  console.log("ALL JOURNEY 2 VERIFIED.");
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
