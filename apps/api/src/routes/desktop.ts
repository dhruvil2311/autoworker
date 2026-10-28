import { Router, type Request, type Response } from "express";
import { AppStore } from "../store.js";
import { logger } from "@ghost/observability";

const asyncHandler = (fn: (req: Request, res: Response) => Promise<any>) => 
  (req: Request, res: Response, next: any) => 
    Promise.resolve(fn(req, res)).catch(next);

const param = (req: Request, name: string): string => {
  const value = req.params[name];
  if (!value) throw new Error(`Missing route parameter: ${name}`);
  return Array.isArray(value) ? value[0]! : value;
};

export function createDesktopRouter(store: AppStore): Router {
  const router = Router();

  // 1. Register Desktop Agent Device
  router.post("/agents/register", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { name, hostname, osVersion, capabilities } = req.body;
    if (!name || !hostname) {
      return res.status(400).json({ error: "Missing required fields: name, hostname" });
    }

    const result = await store.registerDesktopAgent(auth, {
      name,
      hostname,
      osVersion: osVersion || "Windows",
      capabilities: Array.isArray(capabilities) ? capabilities : ["UI_AUTOMATION", "MOUSE", "KEYBOARD", "SCREEN"]
    });

    logger.info({ agentId: result.agent.id, tenantId: auth.tenantId }, "Desktop agent registered");
    res.status(201).json(result);
  }));

  // 2. List Desktop Agents for Tenant
  router.get("/agents", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const agents = await store.listDesktopAgents(auth);
    res.json({ agents });
  }));

  // 3. Get Desktop Agent Details
  router.get("/agents/:id", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const agent = await store.getDesktopAgent(auth, param(req, "id"));
    if (!agent) {
      return res.status(404).json({ error: "Desktop agent not found" });
    }
    res.json(agent);
  }));

  // 4. Heartbeat
  router.post("/agents/:id/heartbeat", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { status } = req.body || {};
    await store.updateDesktopAgentHeartbeat(auth, param(req, "id"), status);
    res.json({ ok: true });
  }));

  // 5. Revoke Desktop Agent
  router.post("/agents/:id/revoke", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const agentId = param(req, "id");
    await store.revokeDesktopAgent(auth, agentId);
    logger.warn({ agentId, tenantId: auth.tenantId }, "Desktop agent revoked");
    res.json({ ok: true, status: "REVOKED" });
  }));

  // 6. Create Execution Command for Agent (dispatched by worker or test)
  router.post("/agents/:id/commands", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { executionId, stepId, sequenceNumber, actionType, payload } = req.body;
    if (!executionId || !stepId || !actionType) {
      return res.status(400).json({ error: "Missing executionId, stepId, or actionType" });
    }

    const command = await store.createDesktopCommand(auth, {
      agentId: param(req, "id"),
      executionId,
      stepId,
      sequenceNumber: sequenceNumber ?? 1,
      actionType,
      payload: payload ?? {}
    });

    res.status(201).json(command);
  }));

  // 7. Poll Pending Commands (Agent pulls commands)
  router.get("/agents/:id/commands", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const commands = await store.pollDesktopCommands(auth, param(req, "id"));
    res.json({ commands });
  }));

  // 8. Report Command Result (Agent pushes completion / error)
  router.post("/commands/:id/result", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { status, result, error } = req.body || {};
    if (!status) {
      return res.status(400).json({ error: "Missing status field" });
    }

    await store.updateDesktopCommandStatus(auth, param(req, "id"), status, result, error);
    res.json({ ok: true });
  }));

  // 9. Ingest Execution Telemetry Events
  router.post("/events", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { agentId, executionId, stepId, eventType, payload } = req.body;
    if (!agentId || !executionId || !stepId || !eventType) {
      return res.status(400).json({ error: "Missing required telemetry fields" });
    }

    await store.recordDesktopEvent(auth, {
      agentId,
      executionId,
      stepId,
      eventType,
      payload: payload ?? {}
    });

    res.status(201).json({ ok: true });
  }));

  // 10. List Events for an Execution
  router.get("/executions/:id/events", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const events = await store.listDesktopEvents(auth, param(req, "id"));
    res.json({ events });
  }));

  // 11. Save Human Takeover / HITL Correction
  router.post("/corrections", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { agentId, executionId, stepId, correctionType, originalAction, correctedAction, ruleOrSelector, notes, status } = req.body;
    if (!correctionType || !ruleOrSelector) {
      return res.status(400).json({ error: "Missing correctionType or ruleOrSelector" });
    }

    const row = await store.saveDesktopCorrection(auth, {
      agentId,
      executionId,
      stepId,
      correctionType,
      originalAction,
      correctedAction,
      ruleOrSelector,
      notes,
      status: status || "PROPOSED"
    });

    logger.info({ correctionId: row.id, tenantId: auth.tenantId, type: correctionType }, "Desktop correction saved");
    res.status(201).json(row);
  }));

  // 12. List Corrections
  router.get("/corrections", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const executionId = typeof req.query.executionId === "string" ? req.query.executionId : undefined;
    const corrections = await store.listDesktopCorrections(auth, executionId);
    res.json({ corrections });
  }));

  // 13. Register Desktop Application
  router.post("/applications", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { applicationId, displayName, executablePath, windowTitlePatterns, capabilities, metadata } = req.body;
    if (!applicationId || !displayName) {
      return res.status(400).json({ error: "Missing applicationId or displayName" });
    }

    const row = await store.registerDesktopApplication(auth, {
      applicationId,
      displayName,
      executablePath,
      windowTitlePatterns: Array.isArray(windowTitlePatterns) ? windowTitlePatterns : [],
      capabilities: Array.isArray(capabilities) ? capabilities : ["UI_AUTOMATION", "MOUSE", "KEYBOARD"],
      metadata
    });

    res.status(201).json(row);
  }));

  // 14. List Desktop Applications
  router.get("/applications", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const applications = await store.listDesktopApplications(auth);
    res.json({ applications });
  }));

  // 15. Emergency Stop
  router.post("/emergency-stop", asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { agentId } = req.body || {};
    
    if (agentId) {
      await store.revokeDesktopAgent(auth, agentId);
    } else {
      const agents = await store.listDesktopAgents(auth);
      for (const agent of agents) {
        await store.revokeDesktopAgent(auth, agent.id);
      }
    }

    logger.warn({ tenantId: auth.tenantId, agentId }, "Desktop emergency stop triggered");
    res.json({ ok: true, stopped: true });
  }));

  return router;
}
