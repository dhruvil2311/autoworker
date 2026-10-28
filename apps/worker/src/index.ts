import path from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
for (const envPath of [path.resolve(projectRoot, ".env"), path.resolve(process.cwd(), ".env")]) {
  dotenv.config({ path: envPath, override: true });
}

import { loadConfig } from "../../api/dist/config.js";
import { createStore } from "../../api/dist/store.js";
import { runQueuedWorkflow } from "./worker.js";
import { logger } from "@ghost/observability";
import { createClient } from "@supabase/supabase-js";

const config = loadConfig();
const store = createStore(config);

const supabase = createClient(config.supabaseUrl!, config.supabaseServiceRoleKey!);

import http from "node:http";

let isRunning = true;

// Active runs set to prevent duplicate trigger invocations
const activeRuns = new Set<string>();

async function executeRunSafely(runId: string) {
  if (activeRuns.has(runId)) return;
  activeRuns.add(runId);
  try {
    await runQueuedWorkflow(runId);
  } catch (err: any) {
    logger.error({ error: err?.message, run_id: runId }, "Run processing failed");
  } finally {
    activeRuns.delete(runId);
  }
}

import { hitlBus } from "./hitl-bus.js";

// Lightweight HTTP server for instant execution triggers and live HITL resolutions
const triggerServer = http.createServer((req, res) => {
  if (req.method === "POST" && req.url?.startsWith("/trigger/")) {
    const runId = req.url.replace("/trigger/", "").trim();
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, runId }));
    if (runId) {
      void executeRunSafely(runId);
    }
    return;
  }

  if (req.method === "POST" && req.url?.startsWith("/hitl-resolve/")) {
    const runId = req.url.replace("/hitl-resolve/", "").trim();
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        const handled = hitlBus.resolve(runId, payload);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, handled, runId }));
        // If not handled by an in-flight waiter, re-trigger execution safely to resume
        if (!handled) {
          void executeRunSafely(runId);
        }
      } catch (err: any) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

triggerServer.listen(4005, "127.0.0.1", () => {
  logger.info("Worker trigger listener listening on http://127.0.0.1:4005");
});

process.on("unhandledRejection", (reason) => {
  logger.warn({ reason }, "Worker process caught unhandled rejection, continuing operation");
});
process.on("uncaughtException", (err) => {
  logger.warn({ err: err?.message }, "Worker process caught uncaught exception, continuing operation");
});

async function pollQueue() {
  logger.info("Started Worker Polling for QUEUED runs (800ms)");
  while (isRunning) {
    try {
      const { data: runs, error } = await supabase
        .from("execution_runs")
        .select("id, tenant_id")
        .in("state", ["QUEUED", "STARTING", "VERIFYING_HANDOFF", "RESUMING"])
        .order("created_at", { ascending: true })
        .limit(1);

      if (error) {
        logger.warn({ error: error.message }, "Transient error polling execution_runs");
        await new Promise(r => setTimeout(r, 2000));
      } else if (runs && runs.length > 0) {
        for (const run of runs) {
          if (!activeRuns.has(run.id)) {
            logger.info({ run_id: run.id }, "Picked up QUEUED run from poll loop");
            void executeRunSafely(run.id);
          }
        }
      }
    } catch (err: any) {
      logger.warn({ error: err?.message }, "Unexpected error in worker poll loop, retrying in 2s");
      await new Promise(r => setTimeout(r, 2000));
    }
    
    // Poll every 800ms
    await new Promise(r => setTimeout(r, 800));
  }
}

pollQueue();
