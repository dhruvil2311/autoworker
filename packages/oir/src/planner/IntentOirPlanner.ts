import { validateOirGraph } from "../validators.js";
import { OirCritic } from "../critic/OirCritic.js";
import {
  BusinessRule,
  Dependency,
  EvidenceLink,
  ExternalSystem,
  OirGraph,
  OirNode,
  Provenance,
  Variable
} from "../types.js";
import { Observation } from "../builder/types.js";

export interface IntentPlanningInput {
  tenantId: string;
  merchant: string;
  businessGoal: string;
  observations: Observation[];
}

export interface IntentPlanningReport {
  graphValid: boolean;
  evidenceCompleteness: number;
  unsupportedClaims: string[];
  contradictions: string[];
  clarificationsRequired: string[];
  safetyBlockers: string[];
  latencyMs: number;
  criticFindings: number;
}

export interface IntentPlanningResult {
  graph: OirGraph;
  report: IntentPlanningReport;
}

interface PlannedAction {
  operation: string;
  name: string;
  inputs: Record<string, unknown>;
  sideEffects: boolean;
  evidenceId: string;
  source: Provenance["source"];
  confidence: number;
  systemId?: string;
}

const MUTATING_WORDS = /\b(update|create|cancel|refund|approve|reject|post|sync|send|notify|fulfill|restock)\b/i;
const READ_WORDS = /\b(check|lookup|look up|fetch|get|review|verify|find|reconcile|audit)\b/i;
const INJECTION_WORDS = /\b(ignore previous|bypass approval|disable audit|delete evidence|forget tenant|override policy)\b/i;

function normalizeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "item";
}

function sourceFor(observation: Observation): Provenance["source"] {
  switch (observation.type) {
    case "BROWSER_EVENT":
      return "BROWSER_EVENT";
    case "API_CALL":
      return "API_CALL";
    case "CSV_DATA":
      return "CSV";
    case "EXCEL_DATA":
      return "EXCEL";
    case "SOP_DOCUMENT":
      return "SOP";
    case "CLARIFICATION":
      return "CLARIFICATION";
    case "HITL_CORRECTION":
      return "HITL_CORRECTION";
    case "DOM_SNAPSHOT":
      return "DOM";
    case "DESKTOP_EVENT":
      return "DESKTOP_RECORDING";
    case "VIDEO_EVIDENCE":
      return "VIDEO_EVIDENCE";
    case "SCREENSHOT_EVIDENCE":
      return "SCREENSHOT_EVIDENCE";
    default:
      return "SOP";
  }
}

function provenance(observation: Observation, description: string): Provenance[] {
  return [{
    source: sourceFor(observation),
    timestamp: observation.timestamp,
    evidenceId: observation.id,
    description
  }];
}

export class IntentOirPlanner {
  plan(input: IntentPlanningInput): IntentPlanningResult {
    const started = Date.now();
    const evidenceLinks = this.evidenceLinks(input.observations);
    const variables = this.variables(input.observations);
    const externalSystems = this.externalSystems(input.observations);
    const businessRules = this.businessRules(input.observations);
    const contradictions = this.detectContradictions(input.observations);
    const safetyBlockers = this.detectSafetyBlockers(input.observations);
    const actions = this.actions(input.observations, input.businessGoal);
    const clarificationsRequired: string[] = [];
    const unsupportedClaims: string[] = [];

    if (input.observations.length === 0) {
      unsupportedClaims.push("No observations were provided.");
      clarificationsRequired.push("What exact workflow steps should Ghost perform, and what evidence supports them?");
    }
    if (actions.length === 0) {
      clarificationsRequired.push("No evidence-backed executable actions were found.");
    }
    if (contradictions.length > 0) {
      clarificationsRequired.push("Resolve contradictory policy evidence before execution.");
    }
    if (safetyBlockers.length > 0) {
      clarificationsRequired.push("Remove or explicitly reject unsafe instructions before execution.");
    }

    const nodes = actions.length > 0
      ? actions.map((action, index): OirNode => ({
          id: `plan_action_${index + 1}_${normalizeId(action.operation)}`,
          name: action.name,
          type: "ACTION",
          operation: action.operation,
          inputs: action.inputs,
          outputs: [],
          sideEffects: action.sideEffects,
          systemId: action.systemId,
          provenance: [{
            source: action.source,
            evidenceId: action.evidenceId,
            description: `Planned from ${action.evidenceId}`
          }],
          confidence: action.confidence
        }))
      : [this.clarificationNode(input.businessGoal, input.observations[0])];

    const dependencies: Dependency[] = [];
    for (let index = 0; index < nodes.length - 1; index++) {
      const source = nodes[index];
      const target = nodes[index + 1];
      if (source && target) {
        dependencies.push({ sourceId: source.id, targetId: target.id, type: "CONTROL" });
      }
    }

    const graph: OirGraph = {
      version: "1.0",
      businessGoal: input.businessGoal,
      businessObjects: [{
        id: `merchant_${normalizeId(input.merchant)}`,
        name: input.merchant,
        description: `Merchant context for tenant ${input.tenantId}`,
        properties: { tenantId: input.tenantId }
      }],
      variables,
      constants: [],
      businessRules,
      externalSystems,
      entities: [],
      evidenceLinks,
      knowledgeReferences: [],
      nodes,
      dependencies,
      globalConfidence: this.globalConfidence(nodes, contradictions, safetyBlockers),
      globalUncertainty: [...contradictions, ...unsupportedClaims, ...clarificationsRequired, ...safetyBlockers],
      rootNodeId: nodes[0]?.id ?? "missing_root"
    };

    let graphValid = true;
    try {
      validateOirGraph(graph);
    } catch {
      graphValid = false;
    }

    const criticReport = new OirCritic().review(graph);
    return {
      graph,
      report: {
        graphValid,
        evidenceCompleteness: criticReport.metrics.evidenceCompleteness,
        unsupportedClaims,
        contradictions,
        clarificationsRequired,
        safetyBlockers,
        latencyMs: Date.now() - started,
        criticFindings: criticReport.metrics.totalCriticisms
      }
    };
  }

  private actions(observations: Observation[], goal: string): PlannedAction[] {
    const planned: PlannedAction[] = [];
    for (const observation of observations) {
      if (observation.type === "SOP_DOCUMENT") {
        planned.push(...this.actionsFromText(observation.content, observation, "SOP step"));
      }
      if (observation.type === "CLARIFICATION") {
        planned.push(...this.actionsFromText(observation.answer, observation, "Clarified step"));
      }
      if (observation.type === "BROWSER_EVENT" && (observation.eventType === "click" || observation.eventType === "input" || observation.eventType === "navigate")) {
        planned.push({
          operation: `browser.${observation.eventType}`,
          name: observation.targetText ?? observation.targetSelector ?? observation.url,
          inputs: {
            selector: observation.targetSelector,
            text: observation.targetText,
            value: observation.value,
            url: observation.url
          },
          sideEffects: observation.eventType !== "navigate",
          evidenceId: observation.id,
          source: "BROWSER_EVENT",
          confidence: observation.targetSelector || observation.targetText ? 0.82 : 0.64,
          systemId: "browser"
        });
      }
      if (observation.type === "API_CALL") {
        planned.push({
          operation: `api.${observation.method.toLowerCase()}`,
          name: `${observation.method} ${observation.endpoint}`,
          inputs: {
            endpoint: observation.endpoint,
            requestBody: observation.requestBody,
            statusCode: observation.statusCode
          },
          sideEffects: observation.method !== "GET",
          evidenceId: observation.id,
          source: "API_CALL",
          confidence: observation.statusCode >= 200 && observation.statusCode < 300 ? 0.86 : 0.52,
          systemId: this.systemIdFromEndpoint(observation.endpoint)
        });
      }
      if (observation.type === "CSV_DATA" || observation.type === "EXCEL_DATA") {
        planned.push({
          operation: "data.validate_rows",
          name: `Validate ${observation.filename}`,
          inputs: {
            filename: observation.filename,
            headers: observation.headers,
            rowCount: observation.rows.length,
            sheetName: observation.type === "EXCEL_DATA" ? observation.sheetName : undefined
          },
          sideEffects: false,
          evidenceId: observation.id,
          source: observation.type === "EXCEL_DATA" ? "EXCEL" : "CSV",
          confidence: observation.headers.length > 0 && observation.rows.length > 0 ? 0.84 : 0.48,
          systemId: "data"
        });
      }
    }

    if (planned.length === 0 && READ_WORDS.test(goal)) {
      return [];
    }
    return planned;
  }

  private actionsFromText(text: string, observation: Observation, label: string): PlannedAction[] {
    return text
      .split(/\r?\n|(?<=\.)\s+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line) => MUTATING_WORDS.test(line) || READ_WORDS.test(line))
      .map((line): PlannedAction => ({
        operation: this.operationFromSentence(line),
        name: `${label}: ${line.slice(0, 80)}`,
        inputs: { instruction: line },
        sideEffects: MUTATING_WORDS.test(line),
        evidenceId: observation.id,
        source: sourceFor(observation),
        confidence: INJECTION_WORDS.test(line) ? 0.25 : 0.76
      }));
  }

  private operationFromSentence(sentence: string): string {
    const lower = sentence.toLowerCase();
    if (lower.includes("refund")) return "commerce.refund";
    if (lower.includes("inventory") || lower.includes("stock")) return "commerce.update_inventory";
    if (lower.includes("order")) return "commerce.process_order";
    if (lower.includes("notify") || lower.includes("send")) return "communications.notify";
    if (lower.includes("approve")) return "policy.approve";
    if (READ_WORDS.test(lower)) return "data.lookup";
    return "business.execute_step";
  }

  private businessRules(observations: Observation[]): BusinessRule[] {
    const rules: BusinessRule[] = [];
    for (const observation of observations) {
      if (observation.type !== "SOP_DOCUMENT" && observation.type !== "CLARIFICATION") {
        continue;
      }
      const text = observation.type === "SOP_DOCUMENT" ? observation.content : observation.answer;
      const thresholdMatch = text.match(/refunds?\s+(?:over|above|>)\s*\$?(\d+)/i);
      if (thresholdMatch?.[1]) {
        rules.push({
          id: `rule_${normalizeId(observation.id)}_refund_threshold`,
          description: `Refund approval threshold from ${observation.id}`,
          condition: `refund.amount > ${thresholdMatch[1]}`,
          enforcementLevel: "STRICT"
        });
      }
    }
    return rules;
  }

  private variables(observations: Observation[]): Variable[] {
    const variables = new Map<string, Variable>();
    for (const observation of observations) {
      if (observation.type === "CSV_DATA" || observation.type === "EXCEL_DATA") {
        for (const header of observation.headers) {
          const id = `${observation.type === "EXCEL_DATA" ? "excel" : "csv"}_${normalizeId(header)}`;
          variables.set(id, {
            id,
            name: header,
            type: observation.type === "EXCEL_DATA" ? "excel_column" : "csv_column",
            description: `Column from ${observation.filename}`
          });
        }
      }
    }
    return [...variables.values()];
  }

  private evidenceLinks(observations: Observation[]): EvidenceLink[] {
    return observations.map((observation) => ({
      id: observation.id,
      type: observation.type,
      uri: observation.sourceUri ?? `memory://${observation.id}`,
      excerpt: this.excerpt(observation)
    }));
  }

  private externalSystems(observations: Observation[]): ExternalSystem[] {
    const systems = new Map<string, ExternalSystem>();
    for (const observation of observations) {
      if (observation.type === "API_CALL") {
        const id = this.systemIdFromEndpoint(observation.endpoint);
        systems.set(id, {
          id,
          name: id,
          type: "API",
          url: observation.endpoint
        });
      }
      if (observation.type === "BROWSER_EVENT") {
        systems.set("browser", {
          id: "browser",
          name: "Browser UI",
          type: "WEB_UI",
          url: observation.url
        });
      }
    }
    return [...systems.values()];
  }

  private detectContradictions(observations: Observation[]): string[] {
    const thresholds = new Map<string, string>();
    const contradictions: string[] = [];
    for (const observation of observations) {
      if (observation.type !== "SOP_DOCUMENT" && observation.type !== "CLARIFICATION") {
        continue;
      }
      const text = observation.type === "SOP_DOCUMENT" ? observation.content : observation.answer;
      const match = text.match(/refunds?\s+(?:over|above|>)\s*\$?(\d+)/i);
      if (!match?.[1]) {
        continue;
      }
      const previous = thresholds.get("refund.approval.threshold");
      if (previous && previous !== match[1]) {
        contradictions.push(`Refund threshold conflict: ${previous} vs ${match[1]} (${observation.id}).`);
      }
      thresholds.set("refund.approval.threshold", match[1]);
    }
    return contradictions;
  }

  private detectSafetyBlockers(observations: Observation[]): string[] {
    const blockers: string[] = [];
    for (const observation of observations) {
      const text = this.excerpt(observation);
      if (INJECTION_WORDS.test(text)) {
        blockers.push(`Unsafe instruction detected in ${observation.id}.`);
      }
    }
    return blockers;
  }

  private clarificationNode(goal: string, observation?: Observation): OirNode {
    return {
      id: "plan_clarification_required",
      name: "Clarification required",
      type: "DECISION_POINT",
      question: `What evidence-backed steps are required to achieve: ${goal}?`,
      options: [],
      provenance: observation ? provenance(observation, "Insufficient evidence for executable planning.") : [{
        source: "LLM_INFERENCE",
        description: "No evidence was provided; this node is non-executable."
      }],
      confidence: 0.2
    };
  }

  private excerpt(observation: Observation): string {
    switch (observation.type) {
      case "SOP_DOCUMENT":
        return observation.content.slice(0, 240);
      case "CLARIFICATION":
        return `${observation.question} ${observation.answer}`.slice(0, 240);
      case "CSV_DATA":
        return `${observation.filename}: ${observation.headers.join(", ")}`;
      case "EXCEL_DATA":
        return `${observation.filename} (${observation.sheetName ?? "sheet1"}): ${observation.headers.join(", ")}`;
      case "API_CALL":
        return `${observation.method} ${observation.endpoint} -> ${observation.statusCode}`;
      case "BROWSER_EVENT":
        return `${observation.eventType} ${observation.targetText ?? observation.targetSelector ?? observation.url}`;
      case "DOM_SNAPSHOT":
        return observation.html.slice(0, 240);
      case "HITL_CORRECTION":
        return observation.correctionDetail.slice(0, 240);
      case "DESKTOP_EVENT":
        return `${observation.action} on ${observation.application}: ${observation.value ?? ""}`.slice(0, 240);
      case "VIDEO_EVIDENCE":
        return `Video ${observation.application}: ${observation.semanticAction} (${observation.startSeconds}s-${observation.endSeconds}s)`.slice(0, 240);
      case "SCREENSHOT_EVIDENCE":
        return `Screenshot ${observation.application ?? ""}: ${observation.detectedText ?? ""}`.slice(0, 240);
      default:
        return "Observation evidence";
    }
  }

  private systemIdFromEndpoint(endpoint: string): string {
    try {
      const url = new URL(endpoint);
      return normalizeId(url.hostname);
    } catch {
      return normalizeId(endpoint.split("/")[0] ?? "api");
    }
  }

  private globalConfidence(nodes: OirNode[], contradictions: string[], safetyBlockers: string[]): number {
    const nodeConfidence = nodes.reduce((sum, node) => sum + (node.confidence ?? 0), 0) / Math.max(nodes.length, 1);
    const penalty = contradictions.length * 0.15 + safetyBlockers.length * 0.25;
    return Math.max(0, Math.min(1, Number((nodeConfidence - penalty).toFixed(2))));
  }
}
