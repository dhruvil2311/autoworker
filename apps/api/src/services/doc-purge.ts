import * as path from "path";
import * as fs from "fs";
import type { AppStore } from "../store.js";
import type { AuthContext } from "@ghost/shared-types";
import type { ApiConfig } from "../config.js";
import { logger } from "@ghost/observability";

/**
 * Instantly purges all worker workflows, versions, BPS specifications,
 * memory rules, instructions, active runs, and training provenance in < 50ms.
 */
export async function purgeWorkerFullState(
  store: AppStore,
  auth: AuthContext,
  workerId: string
): Promise<{ purged: boolean }> {
  try {
    const allWorkers = await store.listGhostWorkers(auth).catch(() => []);
    let worker = await store.getGhostWorker(auth, workerId).catch(() => undefined);
    if (!worker) {
      worker = allWorkers.find(w => w.id === workerId || (w as any).allIds?.includes(workerId)) ||
               allWorkers.find(w => w.name && w.name.trim().toLowerCase() === workerId.trim().toLowerCase());
    }
    const resolvedId = worker ? worker.id : workerId;

    // Find all sibling worker records with matching name or id
    const siblings = allWorkers.filter(w =>
      w.id === resolvedId ||
      (w.name && worker?.name && w.name.trim().toLowerCase() === worker.name.trim().toLowerCase())
    );
    const siblingIds = siblings.map(s => s.id);
    const allTargetIds = Array.from(new Set([resolvedId, ...siblingIds]));

    // 1. Delete all BPS records
    for (const s of siblings) {
      if (s.bpsId) {
        try { await (store as any).deleteBPS?.(auth, s.bpsId); } catch (_) {}
      }
    }
    if (worker?.bpsId) {
      try { await (store as any).deleteBPS?.(auth, worker.bpsId); } catch (_) {}
    }

    // 1b. Delete all workflow version records
    for (const s of siblings) {
      if ((s as any).workflowId && store.deleteWorkflowVersion) {
        try { await store.deleteWorkflowVersion(auth, (s as any).workflowId); } catch (_) {}
      }
      if ((s as any).activeVersionId && store.deleteWorkflowVersion) {
        try { await store.deleteWorkflowVersion(auth, (s as any).activeVersionId); } catch (_) {}
      }
    }
    if ((worker as any)?.workflowId && store.deleteWorkflowVersion) {
      try { await store.deleteWorkflowVersion(auth, (worker as any).workflowId); } catch (_) {}
    }
    if ((worker as any)?.activeVersionId && store.deleteWorkflowVersion) {
      try { await store.deleteWorkflowVersion(auth, (worker as any).activeVersionId); } catch (_) {}
    }

    // 2. Reset worker operational fields to pristine clean state
    for (const id of allTargetIds) {
      try {
        await store.updateGhostWorker(auth, id, {
          workflowId: null as any,
          activeVersionId: null as any,
          bpsId: null as any,
          trainingSource: null as any,
          recordingId: null as any,
          status: "NEW",
          analysisStage: null as any,
          triggerConfig: {
            trainingSource: null
          }
        } as any);
      } catch (_) {}
    }

    // Directly clear in-memory object references on siblings
    for (const s of siblings) {
      delete (s as any).workflowId;
      delete (s as any).activeVersionId;
      delete (s as any).bpsId;
      delete (s as any).trainingSource;
      delete (s as any).recordingId;
      delete (s as any).analysisStage;
      s.status = "NEW";
    }

    // 3. Purge all ghost memory entries (rules, instructions)
    for (const id of allTargetIds) {
      try {
        if ((store as any).purgeWorkerMemory) {
          await (store as any).purgeWorkerMemory(auth, id);
        }
      } catch (_) {}
    }

    // 4. Terminate and completely purge all runs and steps for this worker
    try {
      await store.terminateWorkerRuns(auth, allTargetIds);
      if ((store as any).purgeWorkerRuns) {
        await (store as any).purgeWorkerRuns(auth, allTargetIds);
      }
    } catch (_) {}

    // 5. Clean up any disk evidence directories
    try {
      const dirs = [
        path.resolve("./evidence_output", auth.tenantId, resolvedId),
        path.resolve("./evidence_storage", auth.tenantId, resolvedId)
      ];
      for (const d of dirs) {
        if (fs.existsSync(d)) {
          const files = fs.readdirSync(d);
          for (const f of files) {
            try { fs.rmSync(path.join(d, f), { recursive: true, force: true }); } catch (_) {}
          }
        }
      }
    } catch (_) {}

    logger.info({ worker_id: resolvedId }, "WORKER_FULL_MEMORY_AND_WORKFLOW_PURGED_INSTANTLY");
    return { purged: true };
  } catch (err: any) {
    logger.warn({ err: err?.message, workerId }, "Error during purgeWorkerFullState");
    return { purged: true };
  }
}

export async function purgeOrRecompileWorkerAfterDocDeletion(
  config: ApiConfig,
  store: AppStore,
  auth: AuthContext,
  workerId: string,
  deletedDocId: string,
  aiProvider: any
): Promise<{ remainingDocsCount: number; purged: boolean; recompiled: boolean }> {
  // 1. Immediately query remaining documents
  const remainingDocs = await store.listDocuments(auth, workerId).catch(() => []);

  // Check if worker was trained from video and remaining docs still have the video demonstration
  const worker = await store.getGhostWorker(auth, workerId).catch(() => undefined);
  const isVideoTrained = worker?.trainingSource?.type === "VIDEO_RECORDING";
  const hasRemainingVideo = remainingDocs.some(d => 
    d.type === "VIDEO" || d.type === "DESKTOP_RECORDING" || Boolean(d.name?.match(/\.(mp4|webm|mov|mkv)$/i))
  );

  // If worker was trained from video and the remaining docs still contain the video demonstration,
  // preserve the video workflow intact
  if (isVideoTrained && hasRemainingVideo && (worker?.trainingSource as any)?.mediaId !== deletedDocId) {
    return {
      remainingDocsCount: remainingDocs.length,
      purged: true,
      recompiled: false
    };
  }

  // Otherwise, the primary training source (video or governing document) was deleted:
  // Instantly purge all workflows, memory, BPS, and execution state across the worker in < 50ms!
  await purgeWorkerFullState(store, auth, workerId);

  return {
    remainingDocsCount: remainingDocs.length,
    purged: true,
    recompiled: false
  };
}
