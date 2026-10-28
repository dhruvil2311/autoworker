import { type RecordingUpload, translateInstructionOrDocumentToEnglish } from "@ghost/workflow-schema";

import type { BusinessProcessSpecification, NormalizedDemonstration, Observation, ProcessGap } from "@ghost/bpi";
import { BusinessProcessIntelligence } from "@ghost/bpi";
import { RealSemanticBPIProvider } from "./ai-provider.js";
import type { ApiConfig } from "./config.js";
import type { AppStore, GhostWorkerRow } from "./store.js";
import type { AuthContext } from "@ghost/shared-types";
import { logger } from "@ghost/observability";
import { extractObservationsFromText } from "./ai-provider.js";

export type AnalysisStage =
  | "READING_DEMONSTRATION"
  | "UNDERSTANDING_DATA_MOVEMENT"
  | "IDENTIFYING_CHANGING_VALUES"
  | "CHECKING_BUSINESS_RULES"
  | "FINDING_MISSING_INFORMATION"
  | "PREPARING_QUESTIONS"
  | "COMPLETE"
  | "FAILED";

const STAGE_LABELS: Record<AnalysisStage, string> = {
  READING_DEMONSTRATION: "Reading demonstration",
  UNDERSTANDING_DATA_MOVEMENT: "Understanding data movement",
  IDENTIFYING_CHANGING_VALUES: "Identifying changing values",
  CHECKING_BUSINESS_RULES: "Checking business rules",
  FINDING_MISSING_INFORMATION: "Finding missing information",
  PREPARING_QUESTIONS: "Preparing questions",
  COMPLETE: "Analysis complete",
  FAILED: "Analysis failed"
};

export function getStageLabel(stage: AnalysisStage): string {
  return STAGE_LABELS[stage] ?? stage;
}

function normalizeRecordingToDemonstration(upload: RecordingUpload, tenantId: string): NormalizedDemonstration {
  const observations: Observation[] = upload.events.map((event) => {
    const actionMap: Record<string, Observation["action"]> = {
      click: "CLICK", input: "INPUT", change: "INPUT", select: "INPUT",
      keyboard: "KEYBOARD", submit: "SUBMIT", navigation: "NAVIGATE", url_change: "NAVIGATE"
    };

    const actionType = actionMap[event.event_type] ?? "WAIT";

    return {
      sequence: event.sequence,
      timestamp: event.timestamp,
      action: actionType,
      context: {
        url: event.page.url,
        page_title: event.page.title
      },
      target: event.target ? {
        dom_evidence: {
          tag: event.target.tag,
          role: event.target.role,
          name: event.target.accessible_name,
          text: event.target.text,
          attributes: event.target.attributes
        }
      } : undefined,
      value: event.input ? {
        raw_value: event.input.value,
        is_sensitive: Boolean(event.input.value_placeholder),
        placeholder: event.input.value_placeholder,
        classification: {
          value: "USER_INPUT",
          confidence: 1.0,
          classification: "OBSERVED_FACT",
          evidence: []
        }
      } : undefined
    } as any;
  });

  return {
    recording_id: upload.recording_id,
    tenant_id: tenantId,
    source: "recording",
    started_at: upload.started_at,
    ended_at: upload.ended_at ?? null,
    observations
  };
}

export async function analyzeRecording(
  config: ApiConfig,
  store: AppStore,
  auth: AuthContext,
  workerId: string,
  recordingId: string
): Promise<{ bpsId: string; gaps: ProcessGap[] }> {
  // Fetch recording from store
  const recording = await store.getRecording(auth, recordingId);
  if (!recording) throw new Error("Recording not found");

  // Normalize recording to demonstration format
  const demo = normalizeRecordingToDemonstration(recording.upload, auth.tenantId);

  // Update worker stage
  await store.updateGhostWorker(auth, workerId, { status: "ANALYZING" } as any);
  await updateAnalysisStage(store, auth, workerId, "READING_DEMONSTRATION");

  // Create BPI instance with real or mock provider
  let bpi: BusinessProcessIntelligence;
  if (config.geminiApiKey) {
    const provider = new RealSemanticBPIProvider(config);
    bpi = new BusinessProcessIntelligence(provider as any);
    logger.info({ worker_id: workerId }, "bpi_using_real_provider");
  } else {
    logger.warn({ worker_id: workerId }, "bpi_using_mock_provider");
    bpi = new BusinessProcessIntelligence();
  }

  await updateAnalysisStage(store, auth, workerId, "UNDERSTANDING_DATA_MOVEMENT");

  // Fetch updated memory for the worker
  const memory = await store.getWorkerMemory(auth, workerId);

  // Inject user-defined rules from memory
  if (memory.rules.length > 0) {
    demo.observations.push({
      sequence: demo.observations.length,
      timestamp: new Date().getTime(),
      action: "EXTRACT",
      context: { url: "user_memory", page_title: "User Provided Rules" },
      value: {
        raw_value: memory.rules.map((r: any) => r.content).join("\n"),
        is_sensitive: false,
        placeholder: "Explicit Business Rules",
        classification: {
          value: "BUSINESS_RULES",
          confidence: 1.0,
          classification: "INFERRED_RULE",
          evidence: []
        }
      }
    } as any);
  }

  await updateAnalysisStage(store, auth, workerId, "IDENTIFYING_CHANGING_VALUES");

  // Process demonstration through BPI pipeline
  const result = await bpi.processDemonstration(demo);

  await updateAnalysisStage(store, auth, workerId, "CHECKING_BUSINESS_RULES");
  await updateAnalysisStage(store, auth, workerId, "FINDING_MISSING_INFORMATION");

  // Persist BPS
  const bps = await store.createBPS(auth, {
    workerId,
    recordingId,
    status: result.specification.status,
    specificationJson: result.specification,
    generalizationJson: result.generalization,
    gapsJson: result.gaps
  });

  await updateAnalysisStage(store, auth, workerId, "PREPARING_QUESTIONS");

  // Update worker with BPS reference and status
  const workerStatus = result.gaps.some((g: any) => g.blocking) ? "NEEDS_CLARIFICATION" : "READY_FOR_REVIEW";
  await store.updateGhostWorker(auth, workerId, {
    status: workerStatus,
    bpsId: bps.id,
    recordingId
  } as any);

  await updateAnalysisStage(store, auth, workerId, "COMPLETE");

  logger.info({ worker_id: workerId, bps_id: bps.id, gap_count: result.gaps.length }, "bpi_analysis_complete");

  return { bpsId: bps.id, gaps: result.gaps };
}

export async function analyzeFromDocuments(
  config: ApiConfig,
  store: AppStore,
  auth: AuthContext,
  workerId: string
): Promise<{ bpsId: string; gaps: ProcessGap[] }> {
  // Update worker stage
  await store.updateGhostWorker(auth, workerId, { status: "ANALYZING" } as any);
  await updateAnalysisStage(store, auth, workerId, "READING_DEMONSTRATION");

  // Fetch documents for the worker
  const documents = await store.listDocuments(auth, workerId);
  if (!documents.length) {
    await store.updateGhostWorker(auth, workerId, { status: "FAILED" } as any);
    await updateAnalysisStage(store, auth, workerId, "FAILED");
    throw new Error("DOCUMENT_CONTENT_EMPTY: No documents found for worker");
  }

  await updateAnalysisStage(store, auth, workerId, "UNDERSTANDING_DATA_MOVEMENT");

  // Create BPI instance with real or mock provider
  let bpi: BusinessProcessIntelligence;
  if (config.geminiApiKey) {
    const provider = new RealSemanticBPIProvider(config);
    bpi = new BusinessProcessIntelligence(provider as any);
    logger.info({ worker_id: workerId }, "bpi_using_real_provider_for_documents");
  } else {
    logger.warn({ worker_id: workerId }, "bpi_using_mock_provider_for_documents");
    bpi = new BusinessProcessIntelligence();
  }

  await updateAnalysisStage(store, auth, workerId, "IDENTIFYING_CHANGING_VALUES");

  const demo: NormalizedDemonstration = {
    recording_id: crypto.randomUUID(),
    tenant_id: auth.tenantId,
    source: "documents",
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
    observations: []
  };

  const extractionErrors: string[] = [];

  // Extract steps from documents and inject into observations
  for (const doc of documents) {
    const text = typeof doc.parsedJson === "string" ? doc.parsedJson : (doc.parsedJson?.rawText || JSON.stringify(doc.parsedJson));
    try {
      const extractedSteps = await extractObservationsFromText(config, text, {
        documentId: doc.id,
        workerId,
        fileType: doc.type
      });

      // Adjust sequence numbers and append
      const startIndex = demo.observations.length;
      for (const step of extractedSteps) {
        step.sequence = startIndex + step.sequence;
        demo.observations.push(step);
      }
      logger.info({ worker_id: workerId, document_id: doc.id, step_count: extractedSteps.length }, "bpi_extraction_succeeded");
    } catch (extractErr: any) {
      logger.error({ worker_id: workerId, document_id: doc.id, err: extractErr?.message }, "BPI_EXTRACTION_FAILED");
      extractionErrors.push(extractErr?.message || "Step extraction failed");
    }
  }

  // STATE C: Extraction failed with errors and yielded NO observations
  if (demo.observations.length === 0 && extractionErrors.length > 0) {
    await store.updateGhostWorker(auth, workerId, { status: "FAILED" } as any);
    await updateAnalysisStage(store, auth, workerId, "FAILED");
    throw new Error(`BPI_EXTRACTION_FAILED: ${extractionErrors.join("; ")}`);
  }

  // STATE B: Valid extraction, but 0 executable steps found in document (purely informational)
  if (demo.observations.length === 0) {
    const noStepsGap: ProcessGap = {
      gap_id: "gap_no_executable_steps",
      category: "SCOPE",
      description: "The uploaded document contains no executable browser interaction steps. Please provide an SOP with actionable navigation, inputs, or clicks.",
      why_it_matters: "A workflow requires concrete step-by-step browser interactions to execute.",
      risk_level: "HIGH",
      blocking: true,
      supporting_evidence: [],
      discover_during_test: false
    };

    const emptySpec: BusinessProcessSpecification = {
      id: `bps_${demo.recording_id}`,
      version: "1.0",
      status: "NEEDS_CLARIFICATION",
      identity: {
        process_id: `proc_${demo.recording_id}`,
        name: "Informational Document (No Steps)"
      },
      intent: "Uploaded document contained no executable interaction steps",
      steps: [],
      systems: [],
      scope: "Discovered from documents",
      entities: {},
      variables: {},
      dataSources: [],
      dataFlow: [],
      matchingRules: [],
      businessRules: [],
      transformations: [],
      exceptionPolicies: [],
      safetyPolicies: [],
      successCriteria: [],
      assumptions: [],
      unresolvedGaps: [noStepsGap],
      confidence: 0.1
    };

    const bps = await store.createBPS(auth, {
      workerId,
      status: "NEEDS_CLARIFICATION",
      specificationJson: emptySpec,
      generalizationJson: {} as any,
      gapsJson: [noStepsGap]
    });

    await store.updateGhostWorker(auth, workerId, {
      status: "NEEDS_CLARIFICATION",
      bpsId: bps.id
    } as any);
    await updateAnalysisStage(store, auth, workerId, "PREPARING_QUESTIONS");

    logger.warn({ worker_id: workerId, bps_id: bps.id, gap_count: 1 }, "bpi_analysis_needs_clarification_no_steps");
    return { bpsId: bps.id, gaps: [noStepsGap] };
  }

  // STATE A: Executable observations present -> Run BPI pipeline
  const result = await bpi.processDemonstration(demo);

  // Attach user-defined rules from memory to business rules (not as dummy browser steps)
  const memory = await store.getWorkerMemory(auth, workerId);
  if (memory?.rules?.length > 0) {
    for (const r of memory.rules) {
      if (!result.specification.businessRules.some((br: any) => br.statement === r.content)) {
        result.specification.businessRules.push({
          id: `rule_mem_${crypto.randomUUID()}`,
          name: "User Provided Rule",
          statement: r.content,
          type: "INVARIANT",
          source: "USER_SPECIFIED",
          confidence: 1.0
        } as any);
      }
    }
  }

  await updateAnalysisStage(store, auth, workerId, "CHECKING_BUSINESS_RULES");
  await updateAnalysisStage(store, auth, workerId, "FINDING_MISSING_INFORMATION");

  // Persist BPS
  const bps = await store.createBPS(auth, {
    workerId,
    status: result.specification.status,
    specificationJson: result.specification,
    generalizationJson: result.generalization,
    gapsJson: result.gaps
  });

  await updateAnalysisStage(store, auth, workerId, "PREPARING_QUESTIONS");

  // Update worker with BPS reference and status
  const workerStatus = result.gaps.some((g: any) => g.blocking) ? "NEEDS_CLARIFICATION" : "READY_FOR_REVIEW";
  await store.updateGhostWorker(auth, workerId, {
    status: workerStatus,
    bpsId: bps.id
  } as any);

  await updateAnalysisStage(store, auth, workerId, "COMPLETE");
  logger.info({ worker_id: workerId, bps_id: bps.id, gap_count: result.gaps.length, step_count: demo.observations.length }, "BPI_ANALYSIS_COMPLETE");

  return { bpsId: bps.id, gaps: result.gaps };
}

async function updateAnalysisStage(store: AppStore, auth: AuthContext, workerId: string, stage: AnalysisStage) {
  await store.updateGhostWorker(auth, workerId, { analysisStage: stage } as any);
}

export async function applyClarification(
  store: AppStore,
  auth: AuthContext,
  workerId: string,
  bpsId: string,
  gapId: string,
  answer: { type?: string; value?: any; answer?: any; answer_type?: string }
): Promise<{ remainingGaps: ProcessGap[] }> {
  const bps = await store.getBPS(auth, bpsId);
  if (!bps) throw new Error("BPS not found");

  const rawVal = answer?.value !== undefined ? answer.value : (answer?.answer !== undefined ? answer.answer : (typeof answer === "string" ? answer : ""));
  const answerStr = typeof rawVal === "string" ? rawVal : (rawVal !== null && rawVal !== undefined ? JSON.stringify(rawVal) : "");
  const answerType = (answer?.type || answer?.answer_type || "TEXT").toUpperCase();

  const spec = bps.specificationJson as BusinessProcessSpecification;
  const bpi = new BusinessProcessIntelligence();
  const updated = bpi.applyClarificationAnswer(spec, gapId, answerStr, auth.userId);

  // Store the answer in clarification answers
  await store.submitClarificationAnswer(auth, {
    bpsId,
    gapId,
    answerType,
    answerJson: { type: answerType, value: rawVal }
  });

  // Learn: Persist clarified answer into long-term memory so future compilations retain this knowledge
  if (answerStr.trim()) {
    try {
      await store.addMemoryRule(auth, workerId, `Clarification for ${gapId}: ${answerStr.trim()}`, {
        gap_id: gapId,
        clarification_answer: answerStr.trim(),
        learned_at: new Date().toISOString()
      });
    } catch (memErr) {
      logger.warn({ err: memErr, worker_id: workerId, gap_id: gapId }, "failed_to_save_clarification_memory_rule");
    }
  }

  // Update BPS
  await store.updateBPS(auth, bpsId, {
    specificationJson: updated,
    status: updated.status,
    gapsJson: updated.unresolvedGaps
  });

  // Update worker status
  const newStatus = updated.unresolvedGaps.some((g: ProcessGap) => g.blocking) ? "NEEDS_CLARIFICATION" : "READY_FOR_REVIEW";
  await store.updateGhostWorker(auth, workerId, { status: newStatus } as any);

  return { remainingGaps: updated.unresolvedGaps };
}

export async function classifyChatInstruction(instruction: string, config?: ApiConfig): Promise<{ type: "RULE" | "FACT" | "EXCEPTION" | "UNKNOWN"; ruleText?: string }> {
  // Normalize non-English instruction (Polish, German, French, Spanish, etc.)
  const trans = translateInstructionOrDocumentToEnglish(instruction);
  const normalizedInstruction = trans.translated || instruction;

  if (config?.geminiApiKey) {
    try {
      const { classifyChatInstructionWithLLM } = await import("./ai-provider.js");
      const result = await classifyChatInstructionWithLLM(config, normalizedInstruction);
      if (result) return result;
    } catch (e) {
      logger.warn({ err: e }, "chat_classification_llm_failed_falling_back_to_heuristic");
    }
  }

  // Heuristic fallback used only when no LLM is configured (or the call failed).
  const lower = normalizedInstruction.toLowerCase();

  if (lower.includes("must") || lower.includes("always") || lower.includes("never") || lower.includes("required") || lower.includes("only if")) {
    return { type: "RULE", ruleText: normalizedInstruction };
  }

  if (lower.includes("exception") || lower.includes("unless") || lower.includes("fail") || lower.includes("error")) {
    return { type: "EXCEPTION", ruleText: normalizedInstruction };
  }

  if (lower.includes("is") || lower.includes("are") || lower.includes("means")) {
    return { type: "FACT", ruleText: normalizedInstruction };
  }

  // Default to rule if it looks substantial
  if (normalizedInstruction.length > 15) {
    return { type: "RULE", ruleText: normalizedInstruction };
  }

  return { type: "UNKNOWN" };
}

