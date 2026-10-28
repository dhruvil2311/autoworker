import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { InMemoryStore } from "../../store.js";
import { loadConfig, type ApiConfig } from "../../config.js";

describe("Desktop API Routes & Tenant Isolation", () => {
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

  const tenantA = "tenant-a-1111-1111-1111";
  const tenantB = "tenant-b-2222-2222-2222";

  const tokenTenantA = `dev:user-a:${tenantA}:owner`;
  const tokenTenantB = `dev:user-b:${tenantB}:owner`;

  beforeEach(() => {
    store = new InMemoryStore();
    app = createApp(mockConfig, store);
  });

  it("registers a desktop agent and returns auth session", async () => {
    const res = await request(app)
      .post("/api/v1/desktop/agents/register")
      .set("Authorization", `Bearer ${tokenTenantA}`)
      .send({
        name: "Finance-PC-01",
        hostname: "DESKTOP-FIN01",
        osVersion: "Windows 11 Pro",
        capabilities: ["UI_AUTOMATION", "MOUSE", "KEYBOARD"]
      });

    expect(res.status).toBe(201);
    expect(res.body.agent).toBeDefined();
    expect(res.body.agent.id).toBeDefined();
    expect(res.body.agent.name).toBe("Finance-PC-01");
    expect(res.body.agent.tenantId).toBe(tenantA);
    expect(res.body.session).toBeDefined();
    expect(res.body.token).toMatch(/^dsk_/);
  });

  it("enforces tenant isolation between Tenant A and Tenant B", async () => {
    // Tenant A registers an agent
    const regRes = await request(app)
      .post("/api/v1/desktop/agents/register")
      .set("Authorization", `Bearer ${tokenTenantA}`)
      .send({
        name: "TenantA-Agent",
        hostname: "HOST-A",
        osVersion: "Windows 11",
        capabilities: ["UI_AUTOMATION"]
      });
    const agentId = regRes.body.agent.id;

    // Tenant B cannot see Tenant A's agent in list
    const listRes = await request(app)
      .get("/api/v1/desktop/agents")
      .set("Authorization", `Bearer ${tokenTenantB}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.agents).toHaveLength(0);

    // Tenant B cannot get Tenant A's agent directly
    const getRes = await request(app)
      .get(`/api/v1/desktop/agents/${agentId}`)
      .set("Authorization", `Bearer ${tokenTenantB}`);
    expect(getRes.status).toBe(404);

    // Tenant A can see their agent
    const tenantAList = await request(app)
      .get("/api/v1/desktop/agents")
      .set("Authorization", `Bearer ${tokenTenantA}`);
    expect(tenantAList.status).toBe(200);
    expect(tenantAList.body.agents).toHaveLength(1);
    expect(tenantAList.body.agents[0].id).toBe(agentId);
  });

  it("supports heartbeat updates and revocation", async () => {
    const reg = await request(app)
      .post("/api/v1/desktop/agents/register")
      .set("Authorization", `Bearer ${tokenTenantA}`)
      .send({ name: "Workstation", hostname: "WS-1", osVersion: "Win11", capabilities: [] });
    const agentId = reg.body.agent.id;

    // Send heartbeat
    const hbRes = await request(app)
      .post(`/api/v1/desktop/agents/${agentId}/heartbeat`)
      .set("Authorization", `Bearer ${tokenTenantA}`)
      .send({ status: "BUSY" });
    expect(hbRes.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/v1/desktop/agents/${agentId}`)
      .set("Authorization", `Bearer ${tokenTenantA}`);
    expect(getRes.body.status).toBe("BUSY");

    // Revoke
    const revokeRes = await request(app)
      .post(`/api/v1/desktop/agents/${agentId}/revoke`)
      .set("Authorization", `Bearer ${tokenTenantA}`);
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.status).toBe("REVOKED");
  });

  it("handles command queue dispatch, polling, and results", async () => {
    const reg = await request(app)
      .post("/api/v1/desktop/agents/register")
      .set("Authorization", `Bearer ${tokenTenantA}`)
      .send({ name: "Agent1", hostname: "HOST-1", osVersion: "Win11", capabilities: [] });
    const agentId = reg.body.agent.id;

    // Create a command
    const cmdRes = await request(app)
      .post(`/api/v1/desktop/agents/${agentId}/commands`)
      .set("Authorization", `Bearer ${tokenTenantA}`)
      .send({
        executionId: "exec-100",
        stepId: "step-1",
        sequenceNumber: 1,
        actionType: "DESKTOP_CLICK",
        payload: { target: { strategy: "UIA", name: "Save" } }
      });
    expect(cmdRes.status).toBe(201);
    const commandId = cmdRes.body.id;

    // Agent polls for command
    const pollRes = await request(app)
      .get(`/api/v1/desktop/agents/${agentId}/commands`)
      .set("Authorization", `Bearer ${tokenTenantA}`);
    expect(pollRes.status).toBe(200);
    expect(pollRes.body.commands).toHaveLength(1);
    expect(pollRes.body.commands[0].id).toBe(commandId);

    // Agent reports success result
    const resultRes = await request(app)
      .post(`/api/v1/desktop/commands/${commandId}/result`)
      .set("Authorization", `Bearer ${tokenTenantA}`)
      .send({ status: "SUCCEEDED", result: { clicked: true } });
    expect(resultRes.status).toBe(200);
  });

  it("stores and lists structured corrections for learning loop", async () => {
    const correctionRes = await request(app)
      .post("/api/v1/desktop/corrections")
      .set("Authorization", `Bearer ${tokenTenantA}`)
      .send({
        executionId: "exec-200",
        stepId: "step-5",
        correctionType: "UI_MEMORY",
        ruleOrSelector: "Excel > Ribbon > ExportPDF",
        notes: "Export button was relocated to tab 2 in Office 365 update"
      });
    expect(correctionRes.status).toBe(201);
    expect(correctionRes.body.correctionType).toBe("UI_MEMORY");

    const listRes = await request(app)
      .get("/api/v1/desktop/corrections?executionId=exec-200")
      .set("Authorization", `Bearer ${tokenTenantA}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.corrections).toHaveLength(1);
    expect(listRes.body.corrections[0].ruleOrSelector).toBe("Excel > Ribbon > ExportPDF");
  });

  it("handles emergency stop", async () => {
    const reg = await request(app)
      .post("/api/v1/desktop/agents/register")
      .set("Authorization", `Bearer ${tokenTenantA}`)
      .send({ name: "E-Stop-Agent", hostname: "HOST-ES", osVersion: "Win11", capabilities: [] });
    const agentId = reg.body.agent.id;

    const stopRes = await request(app)
      .post("/api/v1/desktop/emergency-stop")
      .set("Authorization", `Bearer ${tokenTenantA}`)
      .send({ agentId });
    expect(stopRes.status).toBe(200);
    expect(stopRes.body.stopped).toBe(true);

    const checkRes = await request(app)
      .get(`/api/v1/desktop/agents/${agentId}`)
      .set("Authorization", `Bearer ${tokenTenantA}`);
    expect(checkRes.body.status).toBe("REVOKED");
  });
});
