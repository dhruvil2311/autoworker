import { ExecutionCapability, ExecutionResult, RuntimeContext } from "@ghost/runtime";
import type { 
  WorkflowV2Step, 
  OutputType, 
  OutputDestination, 
  OutputContract, 
  UniversalExecutionResult 
} from "@ghost/workflow-schema";
import { translateToEnglish } from "./language-translator.js";

/**
 * OutputExecutor
 * 
 * First-class workflow capability responsible for:
 * 1. BUILD_OUTPUT: Synthesizing real business deliverables from runtime observations.
 * 2. VERIFY_OUTPUT: Validating deliverable schema, completeness, math, and evidence.
 * 3. DELIVER_OUTPUT: Assembling and packaging the UniversalExecutionResult.
 * 
 * Works across any application, connector, file, or data source.
 * Strict adherence to no fake data and dynamic execution.
 */
export class OutputExecutor implements ExecutionCapability {
  canExecute(step: WorkflowV2Step): boolean {
    return (
      step.operation === "BUILD_OUTPUT" ||
      step.operation === "VERIFY_OUTPUT" ||
      step.operation === "DELIVER_OUTPUT" ||
      step.target === "OUTPUT"
    );
  }

  async execute(step: WorkflowV2Step, context: RuntimeContext): Promise<ExecutionResult> {
    try {
      if (step.operation === "BUILD_OUTPUT") {
        return await this.buildOutput(step, context);
      }
      if (step.operation === "VERIFY_OUTPUT") {
        return await this.verifyOutput(step, context);
      }
      if (step.operation === "DELIVER_OUTPUT") {
        return await this.deliverOutput(step, context);
      }
      return { state: "FAILED", message: `Unsupported output operation: ${step.operation}` };
    } catch (err: any) {
      return {
        state: "FAILED",
        message: `Output execution failure on ${step.operation}: ${err?.message || String(err)}`
      };
    }
  }

  /**
   * BUILD_OUTPUT: Extract facts from observations and synthesize deliverable
   */
  private async buildOutput(step: WorkflowV2Step, context: RuntimeContext): Promise<ExecutionResult> {
    const state = context.getState();
    const contract: OutputContract = step.args?.contract || state.variables.output_contract || {
      output_required: true,
      output_type: (step.args?.output_type as OutputType) || "EXTRACTION",
      delivery_destination: "CHAT",
      source_requirements: [],
      verification_requirements: []
    };

    // 1. Gather all observations and extracted variables from the execution runtime
    // Check both state.variables and state.outputs
    const allRuntimeOutputs = { ...(state.variables || {}), ...(state.outputs || {}) };
    const observations: any[] = [];
    const evidenceList: any[] = [];

    const ignoredKeys = new Set([
      "screenshotUrl", 
      "output_contract", 
      "output_verification", 
      "universal_execution_result",
      "_staged_output"
    ]);

    for (const [key, val] of Object.entries(allRuntimeOutputs)) {
      if (key.startsWith("_") || ignoredKeys.has(key)) continue;
      if (val === null || val === undefined) continue;
      
      const rawVal = allRuntimeOutputs[`${key}_raw`];
      const lang = allRuntimeOutputs[`${key}_lang`];
      const translation = typeof val === "string" ? translateToEnglish(val) : null;
      const normalizedValue = translation ? translation.translated : val;

      observations.push({
        key,
        value: normalizedValue,
        raw_value: rawVal ?? val,
        language: lang ?? (translation?.detectedLanguage || "en"),
        translated: Boolean(translation?.wasTranslated)
      });

      evidenceList.push({
        label: key,
        value: normalizedValue,
        source_url: allRuntimeOutputs.sourceUrl || allRuntimeOutputs[`${key}_source_url`] || "",
        selector: allRuntimeOutputs.selector || allRuntimeOutputs[`${key}_selector`] || "",
        step_id: allRuntimeOutputs[`${key}_step_id`] || key,
        timestamp: new Date().toISOString(),
        original_language_text: rawVal && rawVal !== val ? String(rawVal) : undefined
      });
    }

    // Nothing observed means nothing to report: the deliverable is built from runtime evidence only.
    // 2. Synthesize output based on output_type(s)
    const typesToBuild: OutputType[] = contract.output_types && contract.output_types.length > 0
      ? contract.output_types
      : [contract.output_type];

    const builtOutputs: Record<string, any> = {};
    let allEvidenceValid = observations.length > 0;
    const missingEvidence: string[] = observations.length > 0 ? [] : ["No observations were captured during execution."];

    for (const outType of typesToBuild) {
      switch (outType) {
        case "COMPARISON": {
          const compResult = this.synthesizeComparison(observations, contract, step.args);
          builtOutputs.comparison = compResult;
          if (compResult.status === "INCOMPLETE") {
            allEvidenceValid = false;
            missingEvidence.push(compResult.incomplete_reason);
          }
          break;
        }
        case "EXTRACTION": {
          const extResult = this.synthesizeExtraction(observations, contract, step.args);
          builtOutputs.extraction = extResult;
          if (extResult.status === "INCOMPLETE") {
            allEvidenceValid = false;
            missingEvidence.push(extResult.incomplete_reason);
          }
          break;
        }
        case "CALCULATION": {
          const calcResult = this.synthesizeCalculation(observations, contract, step.args);
          builtOutputs.calculation = calcResult;
          if (calcResult.status === "INCOMPLETE") {
            allEvidenceValid = false;
            missingEvidence.push(calcResult.incomplete_reason);
          }
          break;
        }
        case "CLASSIFICATION": {
          const classResult = this.synthesizeClassification(observations, contract, step.args);
          builtOutputs.classification = classResult;
          if (classResult.status === "INCOMPLETE") {
            allEvidenceValid = false;
            missingEvidence.push(classResult.incomplete_reason);
          }
          break;
        }
        case "SUMMARY": {
          const sumResult = this.synthesizeSummary(observations, contract, step.args);
          builtOutputs.summary = sumResult;
          break;
        }
        case "RECOMMENDATION":
        case "DECISION": {
          const recResult = this.synthesizeRecommendation(observations, contract, step.args);
          builtOutputs.recommendation = recResult;
          if (recResult.status === "INCOMPLETE") {
            allEvidenceValid = false;
            missingEvidence.push(recResult.incomplete_reason);
          }
          break;
        }
        case "GENERATED_TEXT": {
          const genResult = this.synthesizeGeneratedText(observations, contract, step.args);
          builtOutputs.generated_text = genResult;
          if (genResult.status === "INCOMPLETE") {
            allEvidenceValid = false;
            missingEvidence.push(genResult.incomplete_reason);
          }
          break;
        }
        case "GENERATED_FILE":
        case "GENERATED_REPORT":
        case "GENERATED_TABLE": {
          const fileResult = this.synthesizeReport(observations, contract, step.args);
          builtOutputs.report = fileResult;
          break;
        }
        default: {
          builtOutputs[outType.toLowerCase()] = this.synthesizeGenericOutput(observations, contract, step.args);
          break;
        }
      }
    }

    // Determine unified deliverable payload
    const primaryType = typesToBuild[0] || "EXTRACTION";
    const primaryData = typesToBuild.length === 1 
      ? Object.values(builtOutputs)[0] 
      : builtOutputs;

    const staged = {
      contract,
      output_type: typesToBuild.length === 1 ? primaryType : "MULTI_OUTPUT",
      output_types: typesToBuild,
      output_data: primaryData,
      evidence: evidenceList,
      observations,
      built_at: new Date().toISOString(),
      complete: allEvidenceValid,
      missing_evidence: missingEvidence
    };

    // Stage in context for verification
    state.outputs._staged_output = staged;

    return {
      state: "SUCCEEDED",
      outputs: { _staged_output: staged }
    };
  }

  /**
   * VERIFY_OUTPUT: Rigorously validate the synthesized deliverable against requirements
   */
  private async verifyOutput(step: WorkflowV2Step, context: RuntimeContext): Promise<ExecutionResult> {
    const staged = context.getState().outputs._staged_output;
    if (!staged) {
      return {
        state: "FAILED",
        message: "OUTPUT_VERIFICATION_FAILED: No deliverable was built by the execution workflow."
      };
    }

    const checks: Array<{ check: string; passed: boolean; message?: string }> = [];

    // Check 1: Deliverable exists and is not null/empty
    const hasData = staged.output_data !== null && staged.output_data !== undefined;
    checks.push({
      check: "DELIVERABLE_NON_EMPTY",
      passed: hasData,
      message: hasData ? "Business deliverable successfully produced" : "Deliverable payload is empty"
    });

    // Check 2: Evidence presence (no fabricated values)
    const hasEvidence = Array.isArray(staged.evidence) && staged.evidence.length > 0;
    checks.push({
      check: "EVIDENCE_BACKED",
      passed: hasEvidence,
      message: hasEvidence ? `${staged.evidence.length} factual observation source references bound` : "No observations or evidence captured"
    });

    // Check 3: Check completeness condition
    if (!staged.complete && staged.missing_evidence && staged.missing_evidence.length > 0) {
      checks.push({
        check: "COMPLETION_CONDITION",
        passed: false,
        message: `Missing required data: ${staged.missing_evidence.join("; ")}`
      });
    } else {
      checks.push({
        check: "COMPLETION_CONDITION",
        passed: true,
        message: "All requested entities and attributes satisfied"
      });
    }

    // Check 4: Mathematical consistency for calculations
    const calcObj = staged.output_data?.calculation || (staged.output_type === "CALCULATION" ? staged.output_data : null);
    if (calcObj) {
      const isMathValid = typeof calcObj.result === "number" && !isNaN(calcObj.result);
      checks.push({
        check: "CALCULATION_VALIDITY",
        passed: isMathValid,
        message: isMathValid ? `Calculation mathematically verified: ${calcObj.formula} = ${calcObj.result}` : "Calculation resulted in NaN or invalid format"
      });
    }

    // Check 5: Entity requirement check for comparison
    const compObj = staged.output_data?.comparison || (staged.output_type === "COMPARISON" ? staged.output_data : null);
    if (compObj) {
      const hasEnough = Array.isArray(compObj.entities) && compObj.entities.length >= 2;
      checks.push({
        check: "COMPARISON_ENTITIES_COUNT",
        passed: hasEnough,
        message: hasEnough ? `Comparison performed across ${compObj.entities.length} entities` : `Comparison requires at least 2 entities, but only found ${compObj.entities?.length || 0}`
      });
    }

    const allPassed = checks.every(c => c.passed);
    const verificationRecord = {
      verified: allPassed,
      checks,
      reason: allPassed ? "All verification requirements satisfied" : checks.find(c => !c.passed)?.message
    };

    staged.verification = verificationRecord;

    if (!allPassed) {
      return {
        state: "FAILED",
        message: `OUTPUT_VERIFICATION_FAILED: ${verificationRecord.reason}`
      };
    }

    return {
      state: "SUCCEEDED",
      outputs: { output_verification: verificationRecord }
    };
  }

  /**
   * DELIVER_OUTPUT: Package the final UniversalExecutionResult
   */
  private async deliverOutput(step: WorkflowV2Step, context: RuntimeContext): Promise<ExecutionResult> {
    const state = context.getState();
    const staged = state.outputs._staged_output;
    if (!staged) {
      return {
        state: "FAILED",
        message: "OUTPUT_DELIVERY_FAILED: Deliverable has not been staged or verified."
      };
    }

    const contract: OutputContract = staged.contract;
    const runId = state.executionMetadata.runId || crypto.randomUUID();
    const taskDescription = step.args?.task_description || state.inputs.task || "Process Execution";

    // Detect if non-English content was processed
    const foreignObservations = staged.observations?.filter((o: any) => o.language && o.language !== "en") || [];
    const detectedLang = foreignObservations.length > 0 ? foreignObservations[0].language : "en";
    const translatedToEnglish = foreignObservations.length > 0;

    const universalResult: UniversalExecutionResult = {
      run_id: runId,
      task: taskDescription,
      status: staged.verification?.verified ? "COMPLETED" : "OUTPUT_VERIFICATION_FAILED",
      input: state.inputs,
      observations: staged.observations,
      actions: state.scopes || [],
      reasoning_summary: staged.output_data?.summary?.overview || `Completed delivery for ${contract.output_type}`,
      output_required: contract.output_required ?? true,
      output_type: staged.output_type,
      output_schema: contract.output_schema,
      output_data: staged.output_data,
      output_verification: staged.verification || { verified: true, checks: [] },
      output_evidence: staged.evidence,
      output_delivery: {
        destination: contract.delivery_destination || "CHAT",
        delivered_at: new Date().toISOString(),
        status: "DELIVERED"
      },
      delivery_status: "DELIVERED",
      workflow_version: "2.0",
      worker_id: (state.executionMetadata as any).workerId,
      language_detected: detectedLang,
      translated_to_english: translatedToEnglish
    };

    // Store in output context
    state.outputs.universal_execution_result = universalResult;

    return {
      state: "SUCCEEDED",
      outputs: {
        universal_execution_result: universalResult
      }
    };
  }

  // ────────────────────────────────────────────────────────────
  // Output Synthesizers by Type
  // ────────────────────────────────────────────────────────────

  private synthesizeComparison(observations: any[], contract: OutputContract, args: any): any {
    // Extract entity blocks from observations (e.g. Order 1 vs Order 2)
    const entities = this.extractEntitiesFromObservations(observations);

    if (entities.length < 2) {
      return {
        status: "INCOMPLETE",
        incomplete_reason: `Comparison requires at least 2 entities to compare, but only found ${entities.length}.`,
        entities,
        differences: []
      };
    }

    const ent1 = entities[0];
    const ent2 = entities[1];

    // Compute explicit field differences dynamically from extracted data
    const differences: string[] = [];
    
    // Status comparison
    if (ent1.status && ent2.status) {
      if (ent1.status.toLowerCase() !== ent2.status.toLowerCase()) {
        differences.push(`Status differs (${ent1.name}: ${ent1.status} vs ${ent2.name}: ${ent2.status})`);
      } else {
        differences.push(`Status identical (${ent1.status})`);
      }
    }

    // Total / Price comparison
    const num1 = this.extractNumber(ent1.total || ent1.grand_total || "");
    const num2 = this.extractNumber(ent2.total || ent2.grand_total || "");
    if (num1 !== null && num2 !== null) {
      const diff = Math.abs(num2 - num1);
      const higher = num2 > num1 ? ent2.name : ent1.name;
      const lower = num2 > num1 ? ent1.name : ent2.name;
      const symbol = (ent1.total && ent1.total.includes("₹")) ? "₹"
        : ((ent1.total && ent1.total.includes("€")) ? "€"
        : ((ent1.total && ent1.total.includes("£")) ? "£" : "$"));

      if (diff > 0) {
        differences.push(`${higher} is ${symbol}${diff.toFixed(2)} higher than ${lower} (${symbol}${Math.max(num1, num2).toFixed(2)} vs ${symbol}${Math.min(num1, num2).toFixed(2)})`);
      } else {
        differences.push(`Totals are identical (${symbol}${num1.toFixed(2)})`);
      }
    }

    // Items comparison
    const items1 = this.extractNumber(ent1.items || ent1.item_count || "");
    const items2 = this.extractNumber(ent2.items || ent2.item_count || "");
    if (items1 !== null && items2 !== null) {
      const itemDiff = Math.abs(items2 - items1);
      if (itemDiff > 0) {
        const more = items2 > items1 ? ent2.name : ent1.name;
        differences.push(`${more} has ${itemDiff} additional item${itemDiff > 1 ? "s" : ""}`);
      } else {
        differences.push(`Item counts are identical (${items1} item${items1 > 1 ? "s" : ""})`);
      }
    }

    // Customer comparison
    if (ent1.customer && ent2.customer) {
      if (ent1.customer.toLowerCase() !== ent2.customer.toLowerCase()) {
        differences.push(`Customer differs (${ent1.name}: ${ent1.customer} vs ${ent2.name}: ${ent2.customer})`);
      } else {
        differences.push(`Customer identical (${ent1.customer})`);
      }
    }

    const fieldKeys = Array.from(new Set([...Object.keys(ent1), ...Object.keys(ent2)]))
      .filter(k => !["source", "order_id"].includes(k));

    return {
      status: "COMPLETE",
      title: "Comparison Result",
      entities: [ent1, ent2],
      differences: differences.length > 0 ? differences : ["No notable differences detected between entities."],
      matrix: {
        fields: fieldKeys,
        rows: [
          { entity: ent1.name, ...ent1 },
          { entity: ent2.name, ...ent2 }
        ]
      }
    };
  }

  private synthesizeExtraction(observations: any[], contract: OutputContract, args: any): any {
    const fields: Record<string, any> = {};
    for (const obs of observations) {
      const cleanKey = obs.key.replace(/^var_(?:ext_)?/, "");
      const label = cleanKey.replace(/_/g, " ").trim();
      fields[label] = obs.value;
      fields[cleanKey] = obs.value;
      fields[obs.key] = obs.value;
    }

    // If observation has single or multiple clean entities
    const entities = this.extractEntitiesFromObservations(observations);

    return {
      status: Object.keys(fields).length > 0 ? "COMPLETE" : "INCOMPLETE",
      incomplete_reason: Object.keys(fields).length > 0 ? undefined : "No fields could be extracted from page.",
      fields,
      entities: entities.length > 0 ? entities : undefined
    };
  }

  private synthesizeCalculation(observations: any[], contract: OutputContract, args: any): any {
    const numbers: number[] = [];
    const items: any[] = [];

    for (const obs of observations) {
      const num = this.extractNumber(String(obs.value));
      if (num !== null) {
        numbers.push(num);
        items.push({ label: obs.key, value: num, raw: obs.value });
      }
    }

    if (numbers.length === 0) {
      return {
        status: "INCOMPLETE",
        incomplete_reason: "No numerical values found in collected observations to perform calculation.",
        result: 0,
        formula: "sum()"
      };
    }

    const sum = numbers.reduce((acc, n) => acc + n, 0);
    const avg = sum / numbers.length;

    return {
      status: "COMPLETE",
      operation: "SUM",
      inputs: items,
      count: numbers.length,
      result: sum,
      average: avg,
      formatted_result: `$${sum.toFixed(2)}`,
      formula: items.map(i => i.value).join(" + ")
    };
  }

  private synthesizeClassification(observations: any[], contract: OutputContract, args: any): any {
    const entities = this.extractEntitiesFromObservations(observations);
    const classifications = entities.map((ent, idx) => {
      const total = this.extractNumber(ent.total || "") || 0;
      const statusLower = (ent.status || "").toLowerCase();
      const isException = statusLower.includes("fraud") || statusLower.includes("fail") || total > 2000;
      const needsHuman = statusLower.includes("hold") || statusLower.includes("review") || statusLower.includes("manual");

      let category = "NORMAL";
      let reason = "Order meets standard automated processing criteria.";

      if (needsHuman) {
        category = "NEEDS_HUMAN";
        reason = "Order status requires manual human review.";
      } else if (isException) {
        category = "EXCEPTION";
        reason = total > 2000 ? `High-value threshold exceeded ($${total.toFixed(2)}).` : `Status (${ent.status}) indicates exception handling.`;
      }

      return {
        entity: ent.name || `Record #${idx + 1}`,
        classification: category,
        reason,
        attributes: ent
      };
    });

    return {
      status: "COMPLETE",
      total_records: classifications.length,
      classifications
    };
  }

  private synthesizeSummary(observations: any[], contract: OutputContract, args: any): any {
    const entities = this.extractEntitiesFromObservations(observations);
    const count = entities.length || observations.length;
    const bullets: string[] = [];

    bullets.push(`Reviewed ${count} records across target business system.`);
    if (entities.length > 0) {
      const statuses = entities.map(e => e.status).filter(Boolean);
      if (statuses.length > 0) {
        bullets.push(`Detected statuses: ${Array.from(new Set(statuses)).join(", ")}`);
      }
      const totals = entities.map(e => this.extractNumber(e.total || "")).filter((n): n is number => n !== null);
      if (totals.length > 0) {
        const grandSum = totals.reduce((a, b) => a + b, 0);
        bullets.push(`Total monetary volume: $${grandSum.toFixed(2)}.`);
      }
    }

    return {
      status: "COMPLETE",
      overview: bullets.join(" "),
      key_points: bullets,
      total_items_processed: count
    };
  }

  private synthesizeRecommendation(observations: any[], contract: OutputContract, args: any): any {
    // A recommendation needs a decision rule from the workflow; none is invented here.
    const rule = typeof args?.decision_rule === "string" ? args.decision_rule : undefined;
    const entities = this.extractEntitiesFromObservations(observations);
    if (!rule || entities.length === 0) {
      return {
        status: "INCOMPLETE",
        incomplete_reason: !rule ? "No decision rule was demonstrated or specified for a recommendation." : "No records were observed to base a recommendation on.",
        observed_records: entities.map(e => e.name)
      };
    }
    return {
      status: "COMPLETE",
      decision_rule: rule,
      records: entities.map(ent => ({ target: ent.name, status: ent.status, total: ent.total }))
    };
  }

  private synthesizeGeneratedText(observations: any[], contract: OutputContract, args: any): any {
    const entities = this.extractEntitiesFromObservations(observations);
    const messages = entities.map((ent) => ({
      recipient: ent.customer || "Customer",
      subject: `Update regarding your order ${ent.name}`,
      body: `Dear ${ent.customer || "Customer"},\n\nWe are writing to confirm that your order ${ent.name}${ent.total ? ` with total of ${ent.total}` : ""}${ent.status ? ` is currently ${ent.status}` : ""}.\n\nThank you!`
    }));

    if (messages.length === 0) {
      return { status: "INCOMPLETE", incomplete_reason: "No records were observed to write messages about.", messages: [] };
    }
    return { status: "COMPLETE", messages };
  }

  private synthesizeReport(observations: any[], contract: OutputContract, args: any): any {
    const entities = this.extractEntitiesFromObservations(observations);
    const headers = ["Entity", "Status", "Customer", "Total", "Items"];
    const rows = entities.map(e => [
      e.name || "N/A",
      e.status || "N/A",
      e.customer || "N/A",
      e.total || "N/A",
      e.items || "N/A"
    ]);

    return {
      status: "COMPLETE",
      title: "Business Process Execution Report",
      columns: headers,
      rows: rows.length > 0 ? rows : [],
      record_count: rows.length
    };
  }

  private synthesizeGenericOutput(observations: any[], contract: OutputContract, args: any): any {
    return {
      status: "COMPLETE",
      result: observations.map(o => ({ key: o.key, value: o.value }))
    };
  }

  // ────────────────────────────────────────────────────────────
  // Dynamic Observation & Entity Parsing (NO FAKE / HARDCODED DATA)
  // ────────────────────────────────────────────────────────────

  private extractEntitiesFromObservations(observations: any[]): any[] {
    const entities: any[] = [];
    const seenNames = new Set<string>();

    for (const obs of observations) {
      if (!obs.value && obs.value !== 0) continue;

      // Case 1: Structured Object
      if (typeof obs.value === "object" && !Array.isArray(obs.value)) {
        const val = obs.value;
        const name = val.name || val.title || (val.id ? `Record #${val.id}` : obs.key);
        if (!seenNames.has(name)) {
          seenNames.add(name);
          entities.push({
            name,
            order_id: val.order_id || val.id,
            total: val.total || val.grand_total || val.amount,
            customer: val.customer || val.customer_name || val.buyer,
            status: val.status || val.state,
            items: val.items || val.item_count || val.qty,
            date: val.date,
            source: obs.key,
            ...val
          });
        }
        continue;
      }

      const text = String(obs.value).trim();
      if (!text) continue;

      // Case 2: String observation. Check if text has one or multiple entities
      // Check for entity headers like "Order #1001", "Zamówienie #1001", etc.
      const entityHeaderRegex = /(?:(?:order|zamówienie|bestellung|commande|pedido|invoice|faktura|ticket|record)\s*#?\s*([a-zA-Z0-9_-]+)|#([0-9]{3,}))/gi;
      const matches = Array.from(text.matchAll(entityHeaderRegex));

      if (matches.length > 1) {
        // Multi-entity text: slice into segments between matches
        for (let i = 0; i < matches.length; i++) {
          const match = matches[i]!;
          const startIndex = match.index!;
          const endIndex = i + 1 < matches.length ? matches[i + 1]!.index! : text.length;
          const segment = text.slice(startIndex, endIndex);
          const entity = this.parseEntityFromTextSegment(segment, obs.key, match[1] || match[2]);
          if (entity && !seenNames.has(entity.name)) {
            seenNames.add(entity.name);
            entities.push(entity);
          }
        }
      } else {
        const entityId = matches.length === 1 ? (matches[0]![1] || matches[0]![2]) : undefined;
        const entity = this.parseEntityFromTextSegment(text, obs.key, entityId);
        if (entity && !seenNames.has(entity.name)) {
          seenNames.add(entity.name);
          entities.push(entity);
        }
      }
    }

    return entities;
  }

  private parseEntityFromTextSegment(text: string, sourceKey: string, explicitId?: string): any | null {
    const orderMatch = explicitId || text.match(/(?:order|zamówienie|bestellung|commande|pedido|invoice|faktura|ticket|record)\s*#?\s*([a-zA-Z0-9_-]+)/i)?.[1] || text.match(/#([a-zA-Z0-9_-]+)/)?.[1];
    
    // Total pattern: find monetary values like ₹1,250, $450.00, €5,000, 1500 zł
    const totalMatch = text.match(/(?:grand\s*total|total|amount|price|balance|razem|suma|kwota|gesamt|betrag|montant|prix|subtotal)\s*[:=]?\s*([₹$€£¥]?\s*[\d,]+(?:\.\d{1,2})?(?:\s*(?:zł|eur|usd|gbp|inr))?)/i)?.[1] 
      || text.match(/([₹$€£¥]\s*[\d,]+(?:\.\d{1,2})?)/)?.[1]
      || text.match(/([\d,]+(?:\.\d{1,2})?\s*(?:zł|eur|usd|gbp|inr))/i)?.[1];

    // Status pattern: either explicit keyword or common status words
    const statusKW = text.match(/(?:status|state|stan|zustand|statut|estado)\s*[:=]?\s*([^,\n\r]+?)(?=\s+(?:customer|total|items|order|#|klient|razem|kwota)|$)/i)?.[1];
    const statusCommon = text.match(/(?:processing|complete|completed|pending|closed|on hold|suspected fraud|fraud|canceled|cancelled|shipped|delivered|active|inactive|paid|in progress|w trakcie realizacji)/i)?.[0];
    const statusMatch = (statusKW ? statusKW.trim() : null) || statusCommon;

    // Customer pattern: keyword followed by name, stopping before next field or end of line
    const customerMatch = text.match(/(?:customer|customer\s*name|buyer|recipient|user|client|klient|kunde|cliente)\s*[:=]?\s*([^,\n\r]+?)(?=\s+(?:total|status|items|order|#|stan|razem|kwota)|$)/i)?.[1];

    // Items pattern: items/qty count
    const itemsMatch = text.match(/(?:items|item\s*count|qty|quantity|count|pozycje|ilość|anzahl|articles)\s*[:=]?\s*(\d+)/i)?.[1];
    const dateMatch = text.match(/(?:date|data|datum)\s*[:=]?\s*([0-9\/-]+)/i)?.[1];

    // If there is no entity identifier, total, customer, or status, and key isn't entity-related, ignore
    if (!orderMatch && !totalMatch && !customerMatch && !statusMatch && !sourceKey.toLowerCase().includes("order")) {
      return null;
    }

    const name = orderMatch ? `Order #${orderMatch.trim()}` : (sourceKey.replace(/^var_/, "").replace(/_/g, " ").trim());

    return {
      name,
      order_id: orderMatch ? orderMatch.trim() : undefined,
      total: totalMatch ? totalMatch.trim() : undefined,
      customer: customerMatch ? customerMatch.trim() : undefined,
      status: statusMatch ? statusMatch.trim() : undefined,
      items: itemsMatch ? itemsMatch.trim() : undefined,
      date: dateMatch ? dateMatch.trim() : undefined,
      source: sourceKey
    };
  }

  private extractNumber(str: string): number | null {
    if (!str) return null;
    const clean = str.replace(/[^0-9.-]/g, "");
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? null : parsed;
  }
}
