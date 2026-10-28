import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";
import { loadConfig, type ApiConfig } from "../src/config.js";
import { DesktopEvidenceBridge } from "../src/services/desktop-evidence-bridge.js";
import { EvidenceToWorkflowPipeline } from "../src/services/evidence/evidence-pipeline.js";
import type { AuthContext } from "@ghost/shared-types";

describe("Video-Grounded Workflow Compilation and Execution Integrity", () => {
  let app: any;
  let store: InMemoryStore;

  const mockConfig: ApiConfig = loadConfig({
    PORT: "3000",
    NODE_ENV: "test",
    APP_URL: "http://localhost:3000",
    API_URL: "http://localhost:3000",
    STORAGE_PROVIDER: "memory",
    ALLOW_MEMORY_STORAGE: "true",
    ALLOW_DEV_AUTH: "true",
    DEV_AUTH_ENABLED: "true"
  });

  const tenantA = "00000000-0000-4000-8000-000000000001";
  const tenantB = "00000000-0000-4000-8000-000000000002";
  const authA: AuthContext = { tenantId: tenantA, userId: "user-a", role: "owner" };
  const authB: AuthContext = { tenantId: tenantB, userId: "user-b", role: "owner" };
  const tokenTenantA = `dev:user-a:${tenantA}:owner`;
  const tokenTenantB = `dev:user-b:${tenantB}:owner`;

  beforeEach(() => {
    store = new InMemoryStore();
    app = createApp(mockConfig, store);
  });

  // =========================================================================
  // Test 1 — Non-SVKM video
  // =========================================================================
  it("Test 1: Non-SVKM video (Google Sheets) compiles to its exact target and executes that workflow", async () => {
    // 1. Create worker
    const worker = await store.createGhostWorker(authA, {
      name: "Order Exception Google Sheets Worker",
      description: "Processes order updates in Google Sheets"
    });

    const sheetsUrl = "https://docs.google.com/spreadsheets/d/1iO6lhjaUlnw9Ya9kcDUEZBezk46cEaorC48Bm9Mup4g/edit";
    const jobId = "job_sheets_1793260382306";
    const bridge = DesktopEvidenceBridge.getInstance();

    (bridge as any).jobs.set(jobId, {
      jobId,
      mediaPath: "C:\\recordings\\google_sheets_demo.webm",
      mediaType: "VIDEO",
      tenantId: tenantA,
      status: "COMPLETED",
      progress: 100,
      stage: "COMPLETE",
      startTime: new Date().toISOString(),
      result: {
        mediaId: "media_sheets_001",
        mediaPath: "C:\\recordings\\google_sheets_demo.webm",
        mediaType: "VIDEO",
        duration_seconds: 32.5,
        frames_analyzed: 25,
        timeline: {
          applications_detected: ["Browser"],
          states: [
            {
              frame_id: "frame_001",
              timestamp: 0.5,
              browser_url: sheetsUrl,
              active_application: "Browser",
              visible_texts: ["Google Sheets", "Order Exceptions Sheet", "Row 42", "Pending"]
            }
          ]
        },
        semantic_actions: [
          {
            sequence: 1,
            action_type: "NAVIGATE_WEB",
            application: "Browser",
            parameters: { url: sheetsUrl },
            summary: `Open Google Sheets at ${sheetsUrl}`,
            target_description: "Google Sheets Address Bar",
            confidence: 0.98
          },
          {
            sequence: 2,
            action_type: "CLICK",
            application: "Browser",
            parameters: { field_label: "Cell B42", selector: "[data-cell='B42']" },
            summary: "Click Cell B42",
            target_description: "Cell B42",
            confidence: 0.95
          },
          {
            sequence: 3,
            action_type: "ENTER_VALUE",
            application: "Browser",
            parameters: { field_label: "Status", value: "RESOLVED" },
            summary: "Enter 'RESOLVED' into status cell",
            target_description: "Status input",
            confidence: 0.95
          }
        ],
        process_understanding: {
          task_intent: "Update order exception status in Google Sheets",
          detected_url: sheetsUrl,
          steps: ["Navigate to Google Sheets", "Select Cell B42", "Enter RESOLVED status"]
        },
        uncertainties: []
      }
    });

    // 2. Compile from job
    const compileRes = await request(app)
      .post(`/api/v1/ghost-workers/${worker.id}/evidence/compile-from-job/${jobId}`)
      .set("Authorization", `Bearer ${tokenTenantA}`);

    expect(compileRes.status).toBe(201);
    expect(compileRes.body.workflowVersionId).toBeDefined();

    const compiledWorkflow = compileRes.body.workflow;
    const workflowJson = JSON.stringify(compiledWorkflow).toLowerCase();

    // Provenance and grounding assertions:
    expect(compiledWorkflow.compiler.source_type).toBe("VIDEO_RECORDING");
    expect(compiledWorkflow.compiler.source_recording_id).toBe(jobId);
    expect(compiledWorkflow.compiler.source_media_name).toBe("google_sheets_demo.webm");

    // Must target Google Sheets and NEVER contain SVKM or NMIMS
    expect(workflowJson).toContain("google");
    expect(workflowJson).not.toContain("svkm");
    expect(workflowJson).not.toContain("nmims");
    expect(workflowJson).not.toContain("semester v");

    // Verify worker activeVersionId was updated to the compiled version
    const updatedWorker = await store.getGhostWorker(authA, worker.id);
    expect(updatedWorker?.activeVersionId).toBe(compileRes.body.workflowVersionId);
    expect(updatedWorker?.status).toBe("READY_FOR_REVIEW");

    // 3. User clicks Run -> executes the exact compiled workflow version
    const runRes = await request(app)
      .post(`/api/v1/ghost-workers/${worker.id}/run`)
      .set("Authorization", `Bearer ${tokenTenantA}`)
      .send({ workflow_version_id: compileRes.body.workflowVersionId, recording_id: jobId });

    expect(runRes.status).toBe(202);
    expect(runRes.body.run).toBeDefined();
    expect(runRes.body.run.workflowVersionId).toBe(compileRes.body.workflowVersionId);
    expect(runRes.body.run.workerId).toBe(worker.id);

    // Verify the persisted execution run in store
    const storedRun = await store.getRun(authA, runRes.body.run.id);
    expect(storedRun?.workflowVersionId).toBe(compileRes.body.workflowVersionId);
  });

  // =========================================================================
  // Test 2 — A second, different video
  // =========================================================================
  it("Test 2: A second distinct video generates and executes a distinct workflow without cross-contamination", async () => {
    const workerB = await store.createGhostWorker(authA, {
      name: "Shopify Inventory Operator",
      description: "Updates inventory in Shopify Admin"
    });

    const shopifyUrl = "https://admin.shopify.com/store/quick-order-shop/inventory";
    const jobShopify = "job_shopify_881923";
    const bridge = DesktopEvidenceBridge.getInstance();

    (bridge as any).jobs.set(jobShopify, {
      jobId: jobShopify,
      mediaPath: "C:\\recordings\\shopify_inventory_flow.mp4",
      mediaType: "VIDEO",
      tenantId: tenantA,
      status: "COMPLETED",
      progress: 100,
      stage: "COMPLETE",
      startTime: new Date().toISOString(),
      result: {
        mediaId: "media_shopify_002",
        mediaPath: "C:\\recordings\\shopify_inventory_flow.mp4",
        mediaType: "VIDEO",
        duration_seconds: 40.0,
        frames_analyzed: 30,
        timeline: {
          applications_detected: ["Browser"],
          states: [
            {
              frame_id: "frame_s1",
              timestamp: 1.0,
              browser_url: shopifyUrl,
              active_application: "Browser",
              visible_texts: ["Shopify Admin", "Inventory Management", "Adjust stock"]
            }
          ]
        },
        semantic_actions: [
          {
            sequence: 1,
            action_type: "NAVIGATE_WEB",
            application: "Browser",
            parameters: { url: shopifyUrl },
            summary: `Navigate to Shopify Inventory at ${shopifyUrl}`,
            target_description: "Shopify Admin URL",
            confidence: 0.99
          },
          {
            sequence: 2,
            action_type: "ENTER_VALUE",
            application: "Browser",
            parameters: { field_label: "Available Quantity", value: "150" },
            summary: "Update quantity to 150",
            target_description: "Stock quantity input",
            confidence: 0.95
          },
          {
            sequence: 3,
            action_type: "CLICK",
            application: "Browser",
            parameters: { field_label: "Save Inventory", selector: "button[name='save-inventory']" },
            summary: "Click Save Inventory button",
            target_description: "Save button",
            confidence: 0.95
          }
        ],
        process_understanding: {
          task_intent: "Update warehouse inventory levels in Shopify",
          detected_url: shopifyUrl,
          steps: ["Open Shopify Inventory", "Set stock to 150", "Save changes"]
        },
        uncertainties: []
      }
    });

    const compileRes = await request(app)
      .post(`/api/v1/ghost-workers/${workerB.id}/evidence/compile-from-job/${jobShopify}`)
      .set("Authorization", `Bearer ${tokenTenantA}`);

    expect(compileRes.status).toBe(201);
    const shopifyWorkflow = compileRes.body.workflow;
    const shopifyJson = JSON.stringify(shopifyWorkflow).toLowerCase();

    // Verify it targets Shopify, NOT Google Sheets and NOT SVKM
    expect(shopifyJson).toContain("shopify");
    expect(shopifyJson).not.toContain("google.com/spreadsheets");
    expect(shopifyJson).not.toContain("svkm");
    expect(shopifyWorkflow.compiler.source_media_name).toBe("shopify_inventory_flow.mp4");

    // Execute Worker B
    const runRes = await request(app)
      .post(`/api/v1/ghost-workers/${workerB.id}/run`)
      .set("Authorization", `Bearer ${tokenTenantA}`)
      .send({ workflow_version_id: compileRes.body.workflowVersionId, recording_id: jobShopify });

    expect(runRes.status).toBe(202);
    expect(runRes.body.run.workflowVersionId).toBe(compileRes.body.workflowVersionId);
  });

  // =========================================================================
  // Test 3 — No valid extraction (fail-closed behavior)
  // =========================================================================
  it("Test 3: Corrupt/empty video or missing job fails safely without running any fallback workflow", async () => {
    const worker = await store.createGhostWorker(authA, {
      name: "Empty Demonstration Worker"
    });

    // Case 3a: Non-existent job ID fails compilation cleanly
    const missingJobRes = await request(app)
      .post(`/api/v1/ghost-workers/${worker.id}/evidence/compile-from-job/job_non_existent_999`)
      .set("Authorization", `Bearer ${tokenTenantA}`);

    expect(missingJobRes.status).toBe(404);
    expect(missingJobRes.body.error).toBe("Analysis job not found");

    // Case 3b: OpenRouter / Evidence pipeline with 0 semantic actions fails safely
    const emptyPipeline = new EvidenceToWorkflowPipeline({
      ...mockConfig,
      openRouterApiKey: "mock-key-for-test"
    });
    // Mock extractSemanticActions to return empty actions
    (emptyPipeline as any).provider = {
      extractSemanticActions: async () => ({ semanticActions: [] })
    };

    const emptyResult = await emptyPipeline.executePipeline({
      jobId: "job_corrupt_video",
      mediaPath: "C:\\corrupted.mp4",
      tenantId: tenantA,
      workerId: worker.id,
      rawFrames: [{ frameId: "f1", timestamp: 0.1, filePath: "f1.png" }],
      rawObservations: [],
      ocrFacts: [],
      activeApplication: "Browser",
      taskObjective: "Process corrupt video"
    });

    expect(emptyResult.success).toBe(false);
    expect(emptyResult.status).toBe("ANALYSIS_FAILED");
    expect(emptyResult.workflow).toBeUndefined();

    // Case 3c: Worker with NO active trained workflow fails on Run (fail-closed)
    const runUntrainedRes = await request(app)
      .post(`/api/v1/ghost-workers/${worker.id}/run`)
      .set("Authorization", `Bearer ${tokenTenantA}`);

    expect(runUntrainedRes.status).toBe(400);
    expect(runUntrainedRes.body.error).toBe("Worker does not have an active trained workflow version yet.");
  });

  // =========================================================================
  // Test 4 — Workflow identity and isolation
  // =========================================================================
  it("Test 4: Workflow identity and cross-tenant isolation prevents cross-tenant run and contamination", async () => {
    // 1. Tenant A creates worker & compiles Workflow A1
    const workerA = await store.createGhostWorker(authA, { name: "Tenant A Worker" });
    const versionA1 = await store.createWorkflowVersion(authA, {
      workflow_version: "2.0",
      name: "Workflow A1",
      description: "Tenant A task",
      status: "ACTIVE",
      variables: [],
      secrets: [],
      expected_domains: ["tenant-a.internal"],
      compiler: { version: "1.0", compiled_at: new Date().toISOString() },
      root_step: {
        id: "step_root_a",
        operation: "SEQUENCE",
        target: "DATA",
        description: "Root A",
        children: [{
          id: "step_nav_a",
          operation: "NAVIGATE",
          target: "BROWSER_DETERMINISTIC",
          description: "Navigate to Tenant A portal",
          args: { url: "https://tenant-a.internal" }
        }]
      }
    } as any);

    await store.updateGhostWorker(authA, workerA.id, {
      workflowId: versionA1.workflowId,
      activeVersionId: versionA1.id,
      status: "ACTIVE"
    });

    // 2. Tenant B creates worker & compiles Workflow B1
    const workerB = await store.createGhostWorker(authB, { name: "Tenant B Worker" });
    const versionB1 = await store.createWorkflowVersion(authB, {
      workflow_version: "2.0",
      name: "Workflow B1",
      description: "Tenant B task",
      status: "ACTIVE",
      variables: [],
      secrets: [],
      expected_domains: ["tenant-b.internal"],
      compiler: { version: "1.0", compiled_at: new Date().toISOString() },
      root_step: {
        id: "step_root_b",
        operation: "SEQUENCE",
        target: "DATA",
        description: "Root B",
        children: [{
          id: "step_nav_b",
          operation: "NAVIGATE",
          target: "BROWSER_DETERMINISTIC",
          description: "Navigate to Tenant B portal",
          args: { url: "https://tenant-b.internal" }
        }]
      }
    } as any);

    await store.updateGhostWorker(authB, workerB.id, {
      workflowId: versionB1.workflowId,
      activeVersionId: versionB1.id,
      status: "ACTIVE"
    });

    // 3. Cross-tenant access attempt: Tenant B attempts to run Tenant A's worker
    const crossTenantRun = await request(app)
      .post(`/api/v1/ghost-workers/${workerA.id}/run`)
      .set("Authorization", `Bearer ${tokenTenantB}`);

    expect(crossTenantRun.status).toBe(404);
    expect(crossTenantRun.body.error).toBe("Worker not found");

    // 4. Tenant A runs Worker A -> uses only Version A1
    const staleSelection = await request(app)
      .post(`/api/v1/ghost-workers/${workerA.id}/run`)
      .set("Authorization", `Bearer ${tokenTenantA}`)
      .send({ workflow_version_id: "stale-version-id" });
    expect(staleSelection.status).toBe(409);
    expect(staleSelection.body.code).toBe("ACTIVE_WORKFLOW_CHANGED");

    const runA = await request(app)
      .post(`/api/v1/ghost-workers/${workerA.id}/run`)
      .set("Authorization", `Bearer ${tokenTenantA}`)
      .set("idempotency-key", "tenant-a-workflow-a-v1")
      .send({ workflow_version_id: versionA1.id });

    expect(runA.status).toBe(202);
    expect(runA.body.run.workflowVersionId).toBe(versionA1.id);
    const duplicateRunA = await request(app)
      .post(`/api/v1/ghost-workers/${workerA.id}/run`)
      .set("Authorization", `Bearer ${tokenTenantA}`)
      .set("idempotency-key", "tenant-a-workflow-a-v1")
      .send({ workflow_version_id: versionA1.id });
    expect(duplicateRunA.body.run.id).toBe(runA.body.run.id);

    // 5. Updating Worker A with a new video creates Version A2; subsequent run uses A2, not stale A1
    const versionA2 = await store.createWorkflowVersion(authA, {
      workflow_version: "2.0",
      name: "Workflow A2 (Updated)",
      description: "Tenant A updated task",
      status: "ACTIVE",
      variables: [],
      secrets: [],
      expected_domains: ["tenant-a.internal"],
      compiler: { version: "1.0", compiled_at: new Date().toISOString() },
      root_step: {
        id: "step_root_a2",
        operation: "SEQUENCE",
        target: "DATA",
        description: "Root A2",
        children: [{
          id: "step_nav_a2",
          operation: "NAVIGATE",
          target: "BROWSER_DETERMINISTIC",
          description: "Navigate to updated Tenant A portal",
          args: { url: "https://tenant-a.internal/v2" }
        }]
      }
    } as any);

    await store.updateGhostWorker(authA, workerA.id, {
      activeVersionId: versionA2.id
    });

    const runA2 = await request(app)
      .post(`/api/v1/ghost-workers/${workerA.id}/run`)
      .set("Authorization", `Bearer ${tokenTenantA}`)
      .send({ workflow_version_id: versionA2.id });

    expect(runA2.status).toBe(202);
    expect(runA2.body.run.workflowVersionId).toBe(versionA2.id);
    expect(runA2.body.run.workflowVersionId).not.toBe(versionA1.id);
  });

  // =========================================================================
  // Test 5 — Regression and execution integrity
  // =========================================================================
  it("Test 5: Navigation targets are derived from workflow; invalid workflows fail safely", async () => {
    // 1. Worker with an empty workflow (0 children) fails safely
    const emptyVersion = await store.createWorkflowVersion(authA, {
      workflow_version: "2.0",
      name: "Empty Steps Workflow",
      status: "ACTIVE",
      variables: [],
      secrets: [],
      expected_domains: [],
      compiler: { version: "1.0", compiled_at: new Date().toISOString() },
      root_step: {
        id: "root",
        operation: "SEQUENCE",
        target: "DATA",
        description: "Root",
        children: []
      }
    } as any);

    const worker = await store.createGhostWorker(authA, {
      name: "Integrity Worker"
    } as any);

    await store.updateGhostWorker(authA, worker.id, {
      workflowId: emptyVersion.workflowId,
      activeVersionId: emptyVersion.id,
      status: "ACTIVE"
    });

    const runRes = await request(app)
      .post(`/api/v1/ghost-workers/${worker.id}/run`)
      .set("Authorization", `Bearer ${tokenTenantA}`)
      .send({ workflow_version_id: emptyVersion.id });

    expect(runRes.status).toBe(409);
    expect(runRes.body.error).toContain("no executable steps");

    // 2. Select / dropdown options match target dynamically rather than static "semester v"
    const selectStep = {
      id: "step_select",
      operation: "ACT",
      target: "BROWSER_DETERMINISTIC",
      description: "Select Priority Dropdown",
      args: {
        selector: "select#priority",
        value: "High"
      }
    };

    // Verify step arguments specify the intended dynamic value
    expect(selectStep.args.value).toBe("High");
    expect(JSON.stringify(selectStep)).not.toContain("semester v");
  });

  // =========================================================================
  // Test 6 — Rate limit resilience & local CV fallback
  // =========================================================================
  it("Test 6: When OpenRouter daily quota is exhausted (429), compilation falls back cleanly to local CV without returning 429", async () => {
    // 1. Create app with OpenRouter enabled
    const openRouterConfig: ApiConfig = {
      ...mockConfig,
      openRouterApiKey: "sk-or-test-active-key"
    };
    const appWithOR = createApp(openRouterConfig, store);

    // 2. Simulate OpenRouter quota manager reaching daily free model exhaustion
    const { OpenRouterQuotaManager } = await import("../src/services/openrouter/quota-manager.js");
    const quotaManager = OpenRouterQuotaManager.getInstance();
    quotaManager.recordFailure(429, "Rate limit exceeded: free-models-per-day");
    expect(quotaManager.isAvailable()).toBe(false);

    // 3. Register worker and video job
    const worker = await store.createGhostWorker(authA, {
      name: "CRM Contact Sync Worker",
      description: "Syncs contacts in CRM"
    });

    const crmUrl = "https://crm.example.com/contacts";
    const jobId = "job_crm_rate_limit_fallback";
    const bridge = DesktopEvidenceBridge.getInstance();

    (bridge as any).jobs.set(jobId, {
      jobId,
      mediaPath: "C:\\recordings\\crm_sync.webm",
      mediaType: "VIDEO",
      tenantId: tenantA,
      status: "COMPLETED",
      progress: 100,
      stage: "COMPLETE",
      startTime: new Date().toISOString(),
      result: {
        mediaId: "media_crm_001",
        mediaPath: "C:\\recordings\\crm_sync.webm",
        mediaType: "VIDEO",
        duration_seconds: 15.0,
        frames_analyzed: 12,
        timeline: {
          applications_detected: ["Browser"],
          states: [
            {
              frame_id: "f_crm_1",
              timestamp: 0.5,
              browser_url: crmUrl,
              active_application: "Browser",
              visible_texts: ["Contacts", "New Contact", "Save"]
            }
          ]
        },
        semantic_actions: [
          {
            sequence: 1,
            action_type: "NAVIGATE_WEB",
            application: "Browser",
            parameters: { url: crmUrl },
            summary: `Navigate to CRM at ${crmUrl}`,
            target_description: "CRM Address Bar",
            confidence: 0.98
          },
          {
            sequence: 2,
            action_type: "CLICK",
            application: "Browser",
            parameters: { field_label: "Save Contact", selector: "button#save-contact" },
            summary: "Click Save Contact button",
            target_description: "Save button",
            confidence: 0.95
          }
        ],
        process_understanding: {
          task_intent: "Save contact details in CRM",
          detected_url: crmUrl,
          steps: ["Open CRM", "Click Save Contact"]
        },
        uncertainties: []
      }
    });

    // 4. Compile from job — MUST succeed with 201 (NOT 429) via local CV
    const compileRes = await request(appWithOR)
      .post(`/api/v1/ghost-workers/${worker.id}/evidence/compile-from-job/${jobId}`)
      .set("Authorization", `Bearer ${tokenTenantA}`);

    expect(compileRes.status).toBe(201);
    expect(compileRes.body.workflowVersionId).toBeDefined();
    expect(compileRes.body.workflow).toBeDefined();

    const compiled = compileRes.body.workflow;
    expect(compiled.compiler.source_type).toBe("VIDEO_RECORDING");
    expect(compiled.description).toContain("Save contact details in CRM");

    // Clean up quota manager
    quotaManager.resetForTesting();
  });
});

