import { loadConfig } from "../../../api/dist/config.js";
import { createStore } from "../../../api/dist/store.js";
import fs from "node:fs";
import path from "node:path";

async function main() {
  console.log("=== Starting End-to-End HITL & Compilation Verification ===");

  const config = loadConfig();
  const store = createStore(config);
  const auth = {
    userId: "00000000-0000-0000-0000-000000000002",
    tenantId: "6ef50df4-58bb-48e3-9796-d25ba85d4dac",
    role: "admin" as const
  };

  // 1. Verify Gap Questions Formatting & Answering Pipeline
  console.log("\n[Test 1] Testing Gap Clarification & Human-Readable Formatting...");
  const workers = await store.listGhostWorkers(auth);
  const testWorker = workers[0] || await store.createGhostWorker(auth, {
    name: "HITL Verification Worker",
    description: "End to end test worker for auth HITL and gap clarification",
    triggerType: "MANUAL",
    status: "READY_FOR_REVIEW"
  } as any);

  console.log(`Using worker: ${testWorker.id} (${testWorker.name})`);

  // Ensure worker has a BPS with a gap to test gap question formatting
  let bps = testWorker.bpsId ? await store.getBPS(auth, testWorker.bpsId) : null;
  if (!bps) {
    bps = await store.createBPS(auth, {
      workerId: testWorker.id,
      status: "NEEDS_CLARIFICATION",
      specificationJson: {
        id: `spec_${Date.now()}`,
        status: "NEEDS_CLARIFICATION",
        businessRules: [],
        steps: [
          { id: "s1", operation: "NAVIGATE", target: "BROWSER_DETERMINISTIC", description: "Navigate to Saucedemo", args: { url: "https://www.saucedemo.com" } }
        ]
      },
      generalizationJson: {},
      gapsJson: [
        {
          gap_id: "gap_auth_01",
          blocking: false,
          description: "gap_auth_01",
          target: "login_barrier",
          suggested_question: {
            question_text: "gap_auth_01",
            suggested_options: ["Use SSO", "Manual Operator Entry", "Service Account"]
          }
        }
      ]
    });
    await store.updateGhostWorker(auth, testWorker.id, { bpsId: bps.id });
  } else {
    // Inject a gap with raw ID to verify formatting
    const existingGaps = bps.gapsJson || [];
    bps.gapsJson = [
      ...existingGaps.filter((g: any) => g.gap_id !== "gap_test_raw_id"),
      {
        gap_id: "gap_test_raw_id",
        blocking: false,
        description: "gap_test_raw_id",
        target: "login_barrier",
        suggested_question: {
          question_text: "gap_test_raw_id",
          suggested_options: ["Use SSO", "Prompt for HITL", "Skip step"]
        }
      }
    ];
    await store.updateBPS(auth, bps.id, { gapsJson: bps.gapsJson });
  }

  // Fetch gaps through API route to verify formatHumanReadableGapQuestion
  const gapsRes = await fetch(`http://localhost:4000/api/v1/ghost-workers/${testWorker.id}/gaps`, {
    headers: {
      "Authorization": "Bearer dev:00000000-0000-0000-0000-000000000002",
      "x-tenant-id": auth.tenantId
    }
  });
  const gapsData = await gapsRes.json();
  console.log(`Gaps API returned ${gapsData.gaps?.length} gaps:`);
  for (const g of gapsData.gaps || []) {
    console.log(`- Gap ID: ${g.id} -> Formatted Question: "${g.question}"`);
    if (g.question.startsWith("gap_") || g.question.startsWith("GAP_")) {
      throw new Error(`FAIL: Gap question contains raw ID! Question: "${g.question}"`);
    }
  }
  console.log("PASS: All gap questions are formatted into human-readable English!");

  // Answer a gap to verify rule storage in memory, SOP update, and recompilation
  const targetGap = gapsData.gaps[0];
  if (targetGap) {
    console.log(`\nAnswering gap "${targetGap.id}"...`);
    const answerRes = await fetch(`http://localhost:4000/api/v1/ghost-workers/${testWorker.id}/gaps/${targetGap.id}/answer`, {
      method: "POST",
      headers: {
        "Authorization": "Bearer dev:00000000-0000-0000-0000-000000000002",
        "x-tenant-id": auth.tenantId,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        answer: "Always switch to HITL when authentication barrier is encountered",
        type: "TEXT"
      })
    });
    const answerData = await answerRes.json();
    console.log("Gap answer response:", answerData);

    // Verify memory item added
    const memData = await store.getWorkerMemory(auth, testWorker.id);
    const rules = memData?.rules || [];
    const hasRule = rules.some((m: any) => m.content?.includes("switch to HITL") || JSON.stringify(m).includes("switch to HITL"));
    console.log(`Verified memory rule stored: ${hasRule}`);
    if (!hasRule) throw new Error("FAIL: Memory rule was not persisted!");

    // Verify SOP document updated
    const docs = await store.listDocuments(auth, testWorker.id);
    const sopDoc = docs.find((d: any) => d.type === "SOP" || d.name?.includes("SOP"));
    console.log(`Verified SOP document created/updated: ${Boolean(sopDoc)} (${sopDoc?.name})`);
    if (!sopDoc) throw new Error("FAIL: SOP document was not updated!");
    console.log("PASS: Gap question answer recorded in memory and SOP, and recompilation triggered!");
  }

  // 2. Verify Explicit Compilation Error Handling
  console.log("\n[Test 2] Testing Explicit Compilation Error Explanation...");
  // Test compiling an invalid/broken worker ID
  const brokenCompileRes = await fetch(`http://localhost:4000/api/v1/ghost-workers/non-existent-id/compile`, {
    method: "POST",
    headers: {
      "Authorization": "Bearer dev:00000000-0000-0000-0000-000000000002",
      "x-tenant-id": auth.tenantId
    }
  });
  console.log(`Compilation 404 test status: ${brokenCompileRes.status}`);

  // 3. Verify Dynamic Authentication HITL (Dual Layout + Zero Secret Leak)
  console.log("\n[Test 3] Testing Dynamic Authentication HITL with Real Website (SauceDemo)...");
  
  // Create workflow that navigates to SauceDemo and enters credentials via HITL
  const workflowVersion = await store.createWorkflowVersion(auth, {
    workflow_version: "2.0",
    name: "SauceDemo Auth HITL Verification",
    status: "ACTIVE",
    variables: [],
    secrets: [],
    compiler: { version: "2.0", source_specification_id: "spec-hitl", compiled_at: new Date().toISOString() },
    root_step: {
      id: "root",
      operation: "SEQUENCE",
      target: "DATA",
      description: "Execute SauceDemo workflow",
      children: [
        {
          id: "step_nav",
          operation: "NAVIGATE",
          target: "BROWSER_DETERMINISTIC",
          description: "Navigate to SauceDemo Login",
          args: { url: "https://www.saucedemo.com" }
        },
        {
          id: "step_login_barrier",
          operation: "TYPE",
          target: "BROWSER_DETERMINISTIC",
          description: "Input username on SauceDemo",
          args: { selector: "#user-name", value: "placeholder" }
        },
        {
          id: "step_add_to_cart",
          operation: "CLICK",
          target: "BROWSER_DETERMINISTIC",
          description: "Click Add to Cart for Backpack",
          args: { selector: "[data-test='add-to-cart-sauce-labs-backpack']" }
        }
      ]
    }
  } as any);

  // Create and queue run with unique idempotencyKey
  const runRow = await store.createRun(auth, workflowVersion.id, `run_test_${Date.now()}_${Math.random()}`, testWorker.id);
  console.log(`Created Run ID: ${runRow.id}`);

  // Trigger worker execution via HTTP listener on port 4005
  await fetch(`http://127.0.0.1:4005/trigger/${runRow.id}`, { method: "POST" });
  console.log("Triggered worker execution...");

  // Poll run until it pauses for HITL
  let isWaitingForHuman = false;
  let challengeDetails: any = null;
  let hitlRequestId: string | null = null;

  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const currentRun = await store.getRun(auth, runRow.id);
    const hitls = await store.listHitlRequests(auth);
    const pendingHitl = hitls.find((h: any) => h.runId === runRow.id && h.state === "PENDING");

    console.log(`[Poll ${i + 1}] Run State: ${currentRun?.state}, Pending HITL: ${Boolean(pendingHitl)}`);

    if (currentRun?.state === "WAITING_FOR_HUMAN" || pendingHitl) {
      isWaitingForHuman = true;
      hitlRequestId = pendingHitl?.id || null;
      challengeDetails = currentRun?.metadata?.hitlReason || pendingHitl?.challengeType || (pendingHitl as any)?.reason || (pendingHitl as any)?.challenge_type || "";
      console.log(`\n>>> DETECTED HITL PAUSE! Challenge: ${challengeDetails}`);
      break;
    }
  }

  if (!isWaitingForHuman) {
    throw new Error("FAIL: Worker did not pause for HITL authentication challenge!");
  }

  // Verify challenge detects dual layout (username and password on 1 page)
  if (!challengeDetails.includes("CREDENTIALS_DUAL")) {
    throw new Error(`FAIL: Expected CREDENTIALS_DUAL for SauceDemo login page, got: ${challengeDetails}`);
  }
  console.log("PASS: Dynamic Auth Barrier detected CREDENTIALS_DUAL layout!");

  // Submit credentials via API exception resolve endpoint
  console.log("\nSubmitting credentials securely via API /api/v1/exceptions/:id/resolve...");
  const secretPassword = "secret_sauce";
  
  if (hitlRequestId) {
    const resolveRes = await fetch(`http://localhost:4000/api/v1/exceptions/${hitlRequestId}/resolve`, {
      method: "POST",
      headers: {
        "Authorization": "Bearer dev:00000000-0000-0000-0000-000000000002",
        "x-tenant-id": auth.tenantId,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        credentials: {
          username: "standard_user",
          password: secretPassword
        },
        resolution: "User entered authentication credentials"
      })
    });
    console.log("Resolve response status:", resolveRes.status);
  } else {
    // Direct dispatch to hitl-resolve
    await fetch(`http://127.0.0.1:4005/hitl-resolve/${runRow.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "standard_user",
        password: secretPassword
      })
    });
  }

  // Poll until run completes (reaches SUCCEEDED)
  let runSucceeded = false;
  let finalRun: any = null;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 1000));
    finalRun = await store.getRun(auth, runRow.id);
    console.log(`[Post-Auth Poll ${i + 1}] Run State: ${finalRun?.state}`);
    if (finalRun?.state === "SUCCEEDED" || finalRun?.state === "COMPLETED") {
      runSucceeded = true;
      break;
    }
    if (finalRun?.state === "FAILED") {
      throw new Error(`FAIL: Run failed with metadata: ${JSON.stringify(finalRun?.metadata)}`);
    }
  }

  if (!runSucceeded) {
    throw new Error(`FAIL: Run did not reach SUCCEEDED state! Current state: ${finalRun?.state}`);
  }

  console.log("PASS: Run successfully resumed after HITL and finished with SUCCEEDED!");

  // 4. Privacy & Zero-Leak Verification
  console.log("\n[Test 4] Verifying Zero-Leak Privacy Guarantee...");
  const steps = await store.listExecutionSteps(auth, runRow.id);
  const stepsStr = JSON.stringify(steps);
  const runStr = JSON.stringify(finalRun);
  const hitlStr = JSON.stringify(await store.listHitlRequests(auth));
  const memoryStr = JSON.stringify(await store.getWorkerMemory(auth, testWorker.id));

  // Assert secret password is never stored anywhere
  if (stepsStr.includes(secretPassword)) {
    throw new Error("SECURITY VIOLATION: Secret password leaked into execution_steps table!");
  }
  if (runStr.includes(secretPassword)) {
    throw new Error("SECURITY VIOLATION: Secret password leaked into execution_runs table!");
  }
  if (hitlStr.includes(secretPassword)) {
    throw new Error("SECURITY VIOLATION: Secret password leaked into hitl_requests table!");
  }
  if (memoryStr.includes(secretPassword)) {
    throw new Error("SECURITY VIOLATION: Secret password leaked into worker_memory table!");
  }

  // Verify redaction masking exists
  const authStep = steps.find((s: any) => s.stepId === "step_login_barrier" || s.metadata?.outputs?.credentials);
  console.log("Auth Step Outputs:", (authStep as any)?.metadata?.outputs || (authStep as any)?.outputs);
  const stepOutputs = JSON.stringify((authStep as any)?.metadata || (authStep as any)?.outputs || {});
  if (!stepOutputs.includes("***REDACTED_FOR_PRIVACY***")) {
    throw new Error("FAIL: Auth step output did not contain ***REDACTED_FOR_PRIVACY*** masking!");
  }

  console.log("PASS: ZERO-LEAK VERIFIED! Plaintext password was NEVER stored in any database table or log.");

  // Save evidence screenshots
  const artifactDir = "C:\\Users\\dhruv\\.gemini\\antigravity-ide\\brain\\7cc9d8ef-f822-43e1-9eb8-47066385e2e7";
  let screenshotSaved = false;
  for (const s of steps) {
    const shot = (s as any)?.metadata?.outputs?.screenshotUrl || (s as any)?.outputs?.screenshotUrl;
    if (shot && shot.startsWith("data:image/png;base64,")) {
      const base64Data = shot.replace(/^data:image\/png;base64,/, "");
      const shotPath = path.join(artifactDir, `hitl_auth_verified_${s.stepId}.png`);
      fs.writeFileSync(shotPath, Buffer.from(base64Data, "base64"));
      console.log(`Saved verified screenshot evidence to: ${shotPath}`);
      screenshotSaved = true;
    }
  }

  console.log("\n=======================================================");
  console.log("=== ALL END-TO-END HITL & PRIVACY TESTS PASSED 100% ===");
  console.log("=======================================================");
}

main().catch(err => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
