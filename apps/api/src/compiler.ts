import type { BusinessProcessSpecification, ProcessStructure } from "@ghost/bpi";
import type { WorkflowV2, WorkflowV2Step, OutputContract, OutputType, OutputDestination } from "@ghost/workflow-schema";
import { validateWorkflowV2, translateToEnglish } from "@ghost/workflow-schema";
import { validateWorkflowPolicies, STANDARD_TASK_POLICIES } from "@ghost/security";
import type { RealSemanticBPIProvider } from "./ai-provider.js";
import type { GroundingReport } from "./services/evidence/grounding.js";
import { specificSelectorOnly } from "@ghost/workflow-schema";


export type CompilerOptions = {
  version: string;
  /**
   * Set when the specification was reconstructed from recorded evidence. Such workflows must be
   * built only from that evidence: no step caps, no synthesized defaults, no generated trees.
   */
  evidenceSourced?: boolean;
  grounding?: GroundingReport;
};

/** A record of how compilation changed the observed step list, so nothing is lost silently. */
export type ConsolidationRecord = { kept: number; mergedInto: number; reason: string };

export class WorkflowCompiler {
  constructor(private aiProvider: RealSemanticBPIProvider) {}

  public async compile(specification: BusinessProcessSpecification, options: CompilerOptions, plan?: any): Promise<WorkflowV2> {
    if (specification.status === "NEEDS_CLARIFICATION" || specification.unresolvedGaps.some(g => g.blocking)) {
      throw new Error(`Cannot compile specification ${specification.id}: unresolved blocking gaps exist.`);
    }

    const variables = Object.entries(specification.variables).map(([name, v]) => ({
      name,
      type: (v.inferred_type?.value as "string" | "number" | "boolean" | "date") || "string",
      required: true,
      default_value: v.classification.value === "CONSTANT" ? v.raw_value : undefined
    }));

    const outputContract = this.inferOutputContract(specification);

    // Generate root step from ExecutablePlan if available, otherwise ProcessStructure
    const consolidation: ConsolidationRecord[] = [];
    let rootStep: WorkflowV2Step;
    if (plan && plan.steps && plan.steps.length > 0) {
      rootStep = this.compileExecutablePlan(plan);
    } else {
      rootStep = await this.compileProcessStructure(specification.dataFlow, specification.variables, specification, options, consolidation);
    }

    const successCriteria = options.grounding?.successCriteria || [];
    if (options.evidenceSourced && successCriteria.length && rootStep.children?.some(c => c.target === "BROWSER_DETERMINISTIC")) {
      rootStep.children!.push({
        id: "step_verify_outcome",
        operation: "VERIFY",
        target: "BROWSER_DETERMINISTIC",
        description: "Check the application shows the demonstrated end state",
        args: { criteria: successCriteria }
      });
    }

    // Attach explicit output steps to ensure task delivers verified business outcome
    this.appendOutputSteps(rootStep, outputContract, specification.intent);

    const expectedDomains = options.evidenceSourced
      ? [...new Set((specification.systems || []).filter(h => typeof h === "string" && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(h)))]
      : specification.systems;

    const workflowCandidate: WorkflowV2 = {
      workflow_version: "2.0",
      name: specification.identity.name,
      description: specification.intent,
      status: "DRAFT",
      variables,
      secrets: [], // Process secrets from variables if needed
      expected_domains: expectedDomains,
      output_contract: outputContract,
      ...(options.evidenceSourced ? { success_criteria: successCriteria } : {}),
      root_step: rootStep,
      compiler: {
        version: options.version,
        source_specification_id: specification.id,
        compiled_at: new Date().toISOString(),
        ...(options.grounding ? { grounding: options.grounding } : {}),
        ...(consolidation.length ? { consolidation } : {})
      }
    };

    return this.validate(workflowCandidate);
  }

  public inferOutputContract(spec: BusinessProcessSpecification): OutputContract {
    const rawStepTexts = ((spec as any).steps || []).map((s: any) => 
      `${s.context?.page_title || ""} ${s.context?.description || ""} ${typeof s.value === "string" ? s.value : s.value?.raw_value || ""}`
    ).join(" ");

    const combinedRaw = `${spec.intent || ""} ${spec.identity?.name || ""} ${spec.businessRules?.map((r: any) => r.description || r).join(" ") || ""} ${rawStepTexts}`;
    const translated = translateToEnglish(combinedRaw);
    const text = (translated.translated || combinedRaw).toLowerCase();
    
    const matchedTypes: OutputType[] = [];

    // 1. COMPARISON
    if (text.includes("compare") || text.includes("difference") || text.includes("vs ") || text.includes("comparison") || text.includes("differ")) {
      matchedTypes.push("COMPARISON");
    }
    // 2. CALCULATION
    if (text.includes("calculate") || text.includes("combined total") || text.includes("sum ") || text.includes("total refund") || text.includes("arithmetic") || text.includes("math")) {
      matchedTypes.push("CALCULATION");
    }
    // 3. CLASSIFICATION
    if (text.includes("classify") || text.includes("categorize") || text.includes("exception or normal") || text.includes("label") || text.includes("classification")) {
      matchedTypes.push("CLASSIFICATION");
    }
    // 4. SUMMARY
    if (text.includes("summarize") || text.includes("summary") || text.includes("overview") || text.includes("breakdown")) {
      matchedTypes.push("SUMMARY");
    }
    // 5. RECOMMENDATION & DECISION
    if (text.includes("recommend") || text.includes("which order") || text.includes("escalat") || text.includes("priority")) {
      matchedTypes.push("RECOMMENDATION");
    }
    if (text.includes("decide") || text.includes("decision") || text.includes("choose between")) {
      matchedTypes.push("DECISION");
    }
    // 6. GENERATED_TEXT
    if (text.includes("generate email") || text.includes("draft email") || text.includes("write email") || text.includes("send email") || text.includes("message for each") || text.includes("generate text")) {
      matchedTypes.push("GENERATED_TEXT");
    }
    // 7. GENERATED_FILE / REPORT / TABLE
    if (text.includes("excel") || text.includes("spreadsheet") || text.includes("csv") || text.includes("download report") || text.includes("create file")) {
      matchedTypes.push("GENERATED_FILE");
    }
    if (text.includes("report") || text.includes("table")) {
      if (!matchedTypes.includes("GENERATED_FILE")) {
        matchedTypes.push("GENERATED_REPORT");
      }
    }
    // 8. UPDATED_RECORD & ACTION_CONFIRMATION
    if (text.includes("update") || text.includes("change status") || text.includes("mark as") || text.includes("modify")) {
      matchedTypes.push("UPDATED_RECORD");
    }
    if (text.includes("confirm") || text.includes("exported") || text.includes("submitted")) {
      matchedTypes.push("ACTION_CONFIRMATION");
    }
    // 9. HUMAN_APPROVAL_RESULT
    if (text.includes("ask me") || text.includes("approval") || text.includes("before executing") || text.includes("wait for human")) {
      matchedTypes.push("HUMAN_APPROVAL_RESULT");
    }
    // 10. EXTRACTION
    if (text.includes("tell me") || text.includes("extract") || text.includes("read ") || text.includes("record the following") || text.includes("customer name") || text.includes("order total")) {
      matchedTypes.push("EXTRACTION");
    }

    const outputType: OutputType = matchedTypes[0] || "EXTRACTION";
    
    let destination: OutputDestination = "CHAT";
    if (text.includes("excel") || text.includes("file") || text.includes("download") || text.includes("csv")) {
      destination = "FILE";
    } else if (text.includes("email")) {
      destination = "EMAIL";
    } else if (text.includes("ask me") || text.includes("approval")) {
      destination = "HUMAN_APPROVAL";
    }

    // Field lists are not invented here; extracted fields come from the workflow's own EXTRACT steps.
    let output_schema: Record<string, any> | undefined = undefined;
    if (outputType === "COMPARISON") {
      output_schema = { type: "comparison", include_differences: true };
    } else if (outputType === "EXTRACTION") {
      output_schema = { type: "extraction" };
    } else if (outputType === "CALCULATION") {
      output_schema = {
        type: "calculation",
        operations: ["sum", "total", "count"]
      };
    }

    return {
      output_required: true,
      output_type: outputType,
      output_types: matchedTypes.length > 1 ? matchedTypes : undefined,
      output_schema,
      delivery_destination: destination,
      source_requirements: ["observations", "extracted_variables"],
      verification_requirements: ["DELIVERABLE_NON_EMPTY", "EVIDENCE_BACKED"],
      completion_condition: `Business deliverable for ${outputType} produced and verified`
    };
  }


  private appendOutputSteps(rootStep: WorkflowV2Step, contract: OutputContract, intent: string) {
    if (!rootStep.children) {
      rootStep.children = [];
    }

    const hasBuildOutput = rootStep.children.some(c => c.operation === "BUILD_OUTPUT");
    if (hasBuildOutput) return;

    const buildStep: WorkflowV2Step = {
      id: "step_build_output",
      operation: "BUILD_OUTPUT",
      target: "OUTPUT",
      description: `Synthesize ${contract.output_type.toLowerCase()} deliverable from collected data`,
      args: {
        contract,
        task_description: intent
      }
    };

    const verifyStep: WorkflowV2Step = {
      id: "step_verify_output",
      operation: "VERIFY_OUTPUT",
      target: "OUTPUT",
      description: `Verify ${contract.output_type.toLowerCase()} deliverable meets contract criteria`,
      args: {
        contract
      }
    };

    const deliverStep: WorkflowV2Step = {
      id: "step_deliver_output",
      operation: "DELIVER_OUTPUT",
      target: "OUTPUT",
      description: `Deliver ${contract.output_type.toLowerCase()} result to ${contract.delivery_destination}`,
      args: {
        contract,
        task_description: intent
      }
    };

    rootStep.children.push(buildStep, verifyStep, deliverStep);
  }

  private compileExecutablePlan(plan: any): WorkflowV2Step {
    const children: WorkflowV2Step[] = plan.steps.map((step: any, index: number) => {
      // Pick highest priority capability
      const primaryBinding = step.fallbackChain[0];
      
      let operation = "ACT";
      let target = "BROWSER_SEMANTIC";
      
      if (primaryBinding) {
        if (primaryBinding.providerType === "MCP") {
          operation = "CALL_MCP";
          target = "MCP";
        } else if (primaryBinding.providerType === "API") {
          operation = "CALL_API";
          target = "API";
        } else if (primaryBinding.providerType === "BROWSER_DETERMINISTIC") {
          target = "BROWSER_DETERMINISTIC";
        }
      }

      const wfStep: WorkflowV2Step = {
        id: `step_exec_${index}`,
        operation: operation as any,
        target: target as any,
        description: step.description,
        args: {
          semanticOperationId: step.semanticOperationId,
          capabilityId: primaryBinding?.capabilityId,
          connectionId: primaryBinding?.connectionId,
          fallbackChain: step.fallbackChain.slice(1) // Keep the rest for runtime fallback
        }
      };

      // Add failure policy for fallbacks
      if (step.fallbackChain.length > 1) {
        wfStep.failure_policy = {
          on_failure: "RUN_FALLBACK",
          retry_limit: 1
        };
      }

      return wfStep;
    });

    return {
      id: "step_root",
      operation: "SEQUENCE",
      target: "DATA",
      description: "Execution Plan Root",
      children
    };
  }

  private async compileProcessStructure(
    dataFlow: any[],
    vars: Record<string, any>,
    spec: BusinessProcessSpecification,
    options: CompilerOptions = { version: "unknown" },
    consolidation: ConsolidationRecord[] = []
  ): Promise<WorkflowV2Step> {
    const specAny = spec as any;

    if (specAny.steps && specAny.steps.length > 0) {
      // 1. Layout artefacts from the CV engine are not user actions; record each one removed.
      const validSteps = (specAny.steps as any[]).filter((obs: any, index: number) => {
        const desc = String(obs.context?.page_title || obs.context?.description || obs.description || "");
        const val = typeof obs.value === "string" ? obs.value : (obs.value?.raw_value || "");
        const artefact = (typeof val === "string" && val.includes("TextRegion_")) || desc.includes("TextRegion_");
        if (artefact) consolidation.push({ kept: -1, mergedInto: index, reason: "CV layout artefact (TextRegion) is not an action" });
        return !artefact;
      });

      // 2. Only consecutive edits of the same identified field are merged (the final value is what
      // the user left). Distinct actions are never capped or deduplicated away.
      const targetKey = (obs: any): string => {
        const g = obs.grounding;
        const text = g?.target?.label || g?.target?.text || obs.target?.dom_evidence?.name || obs.target?.dom_evidence?.text || "";
        const selector = specificSelectorOnly(obs.target?.selector || obs.target?.dom_evidence?.attributes?.selector) || "";
        return `${String(text).trim().toLowerCase()}|${selector}`;
      };
      const consolidatedSteps: any[] = [];
      for (const obs of validSteps) {
        const last = consolidatedSteps[consolidatedSteps.length - 1];
        const isTyping = (obs.action === "INPUT" || obs.action === "TYPE") && (last?.action === "INPUT" || last?.action === "TYPE");
        const key = targetKey(obs);
        if (last && isTyping && key !== "|" && key === targetKey(last) && !obs.grounding?.irreversible) {
          consolidation.push({ kept: consolidatedSteps.length - 1, mergedInto: obs.sequence, reason: "Consecutive edits of the same field; the final value is kept" });
          last.value = obs.value;
          if (last.grounding && obs.grounding) last.grounding = { ...last.grounding, value: obs.grounding.value };
          continue;
        }
        consolidatedSteps.push(obs);
      }

      if (!consolidatedSteps.length && options.evidenceSourced) {
        throw new Error("NO_GROUNDED_STEPS: the evidence contains no executable actions; nothing was compiled.");
      }

      const children: WorkflowV2Step[] = [];
      consolidatedSteps.forEach((obs: any, index: number) => {
        const step = obs.grounding ? this.compileGroundedStep(obs, index) : this.compileObservedStep(obs, index);
        if (step.args?.irreversible) {
          children.push({
            id: `approve_${step.id}`,
            operation: "REQUIRE_APPROVAL",
            target: "HUMAN",
            description: `Approve before: ${step.description}`,
            args: {
              gates_step_id: step.id,
              reason: "This action commits a change in the target application and cannot be undone automatically."
            }
          });
        }
        children.push(step);
      });

      return {
        id: "step_root",
        operation: "SEQUENCE",
        target: "DATA",
        description: "Execution Plan Root",
        children
      };
    }

    if (options.evidenceSourced) {
      throw new Error("NO_GROUNDED_STEPS: the evidence contains no executable actions; nothing was compiled.");
    }

    if (this.aiProvider?.generateWorkflowTree) {
      try {
        const generatedRoot = await this.aiProvider.generateWorkflowTree(spec.intent, spec.businessRules?.map((r: any) => r.description || r) || [], vars);
        if (!generatedRoot.id) generatedRoot.id = "step_root";
        return generatedRoot;
      } catch (err) {
        console.warn("AI Workflow Compilation fallback to default structure", err);
      }
    }

    return {
      id: "step_root",
      operation: "SEQUENCE",
      target: "DATA",
      description: "Default Process Structure",
      children: [
        {
          id: "step_navigate",
          operation: "NAVIGATE",
          target: "BROWSER_DETERMINISTIC",
          description: "Navigate to target system",
          args: { url: "{{url}}" }
        }
      ]
    };
  }

  /** Builds a step from a grounded action: semantic target, real value, evidence provenance. */
  private compileGroundedStep(obs: any, index: number): WorkflowV2Step {
    const g = obs.grounding;
    const desc = obs.context?.page_title || g.rationale || g.rawAction;
    const isBrowser = obs.target?.dom_evidence?.tag === "browser_element" || /browser|web/i.test(g.application || "");
    const provenance = {
      basis: g.basis,
      episode_ids: g.evidence?.episodeIds || [],
      frame_ids: g.evidence?.frameIds || [],
      start_timestamp: g.evidence?.timestampStart,
      end_timestamp: g.evidence?.timestampEnd,
      corroborating_text: g.evidence?.corroboratingText || [],
      rationale: g.rationale,
      source_action_index: g.index
    };
    const target = g.target ? { ...g.target } : undefined;
    const selector = specificSelectorOnly(g.target?.selector);
    const base: Record<string, any> = { application: g.application, provenance };
    if (target) base.target = target;
    if (selector) base.selector = selector;
    const opTarget: WorkflowV2Step["target"] = isBrowser ? "BROWSER_DETERMINISTIC" : "DESKTOP";
    const id = (op: string) => `step_${index}_${op}`;
    const credential = /pass(word)?|pwd|otp|one[- ]time|pin\b/i.test(`${g.target?.label || ""} ${g.target?.text || ""}`);

    switch (g.action) {
      case "NAVIGATE":
        return { id: id("navigate"), operation: "NAVIGATE", target: opTarget, description: desc, args: { ...base, ...(obs.context?.url ? { url: obs.context.url } : {}) } };
      case "TYPE":
        return { id: id("type"), operation: isBrowser ? "TYPE" : "DESKTOP_TYPE", target: opTarget, description: desc, args: {
          ...base,
          ...(g.value !== undefined && g.value !== "" ? { value: g.value, text: g.value } : {}),
          ...(credential && !g.value ? { requires_human_value: true } : {}),
          ...(credential ? { sensitive: true } : {})
        } };
      case "SELECT":
        return { id: id("select"), operation: isBrowser ? "SELECT" : "DESKTOP_SELECT", target: opTarget, description: desc, args: { ...base, value: g.value } };
      case "KEYPRESS":
        return { id: id("press_key"), operation: isBrowser ? "PRESS_KEY" : "DESKTOP_KEY_PRESS", target: opTarget, description: desc, args: { ...base, key: g.value || "Enter", irreversible: Boolean(g.irreversible) } };
      case "EXTRACT":
        return { id: id("extract"), operation: isBrowser ? "EXTRACT" : "DESKTOP_READ", target: opTarget, description: desc, args: { ...base, instruction: desc }, bind_result_to: `var_ext_${index}` };
      case "VERIFY":
        return { id: id("verify"), operation: isBrowser ? "VERIFY" : "DESKTOP_ASSERT", target: opTarget, description: desc, args: {
          ...base,
          criteria: target?.text ? [{ id: `sc_step_${index}`, type: "TEXT_VISIBLE", value: target.text, source: "DEMONSTRATION_FINAL_STATE", evidenceFrameIds: provenance.frame_ids }] : []
        } };
      case "SCROLL":
        return { id: id("scroll"), operation: isBrowser ? "SCROLL" : "DESKTOP_SCROLL", target: opTarget, description: desc, args: base };
      case "WAIT":
        return { id: id("wait"), operation: isBrowser ? "WAIT" : "DESKTOP_WAIT", target: opTarget, description: desc, args: { ...base, timeout: 1500 } };
      case "CLICK":
      default:
        return { id: id("click"), operation: isBrowser ? "CLICK" : "DESKTOP_CLICK", target: opTarget, description: desc, args: { ...base, irreversible: Boolean(g.irreversible) } };
    }
  }

  /** Maps an observation that did not pass through evidence grounding (documents, local CV, extension). */
  private compileObservedStep(obs: any, index: number): WorkflowV2Step {
    const desc = obs.context?.page_title || obs.context?.description || obs.description || "";
    const lowerDesc = desc.toLowerCase();
    let action = obs.action === "INPUT" ? "TYPE" : (obs.action || "CLICK");

    const appName = obs.application || obs.context?.application;
    const pageTitle = (obs.context?.page_title || "").toLowerCase();
    const url = (obs.context?.url || "").toLowerCase();
    const isWeb = appName?.toLowerCase() === "browser" || appName?.toLowerCase() === "web" || url.startsWith("http") || pageTitle.includes("browser");
    const isDesktopApp = appName && appName !== "Browser" && appName !== "web" && !isWeb;

    let target: "DESKTOP" | "BROWSER_DETERMINISTIC" | "HUMAN" | "API" | "MCP" | "DATA" = "BROWSER_DETERMINISTIC";

    if (
      isDesktopApp ||
      String(action).startsWith("DESKTOP_") ||
      ["FIND_UI_ELEMENT", "CLICK_UI_ELEMENT", "TYPE_IN_FIELD", "SELECT_OPTION", "READ_FIELD", "WAIT_FOR_STATE", "OPEN_APPLICATION", "SWITCH_APPLICATION"].includes(action)
    ) {
      target = "DESKTOP";
      if (action === "OPEN_APPLICATION" || action === "SWITCH_APPLICATION") {
        action = "DESKTOP_OPEN_APPLICATION";
      } else if (action === "CLICK" || action === "CLICK_UI_ELEMENT") {
        action = "DESKTOP_CLICK";
      } else if (action === "TYPE" || action === "TYPE_IN_FIELD" || action === "INPUT") {
        action = "DESKTOP_TYPE";
      } else if (action === "READ_FIELD" || action === "READ_DATA" || action === "EXTRACT" || action === "READ") {
        action = "DESKTOP_READ";
      } else if (!String(action).startsWith("DESKTOP_")) {
        action = `DESKTOP_${action}`;
      }
    } else if (action === "REQUIRE_APPROVAL" || action === "HUMAN_INPUT" || action === "HUMAN_TAKEOVER") {
      target = "HUMAN";
      action = "REQUIRE_APPROVAL";
    } else if (action === "CALL_API") {
      target = "API";
    } else if (action === "CALL_MCP") {
      target = "MCP";
    } else {
      target = "BROWSER_DETERMINISTIC";
      if (action !== "NAVIGATE" && action !== "TYPE" &&
          (lowerDesc.includes("read and record") || lowerDesc.includes("repeat the same inspection") || lowerDesc.includes("inspect and record") || lowerDesc.includes("extract") || (lowerDesc.includes("record") && lowerDesc.includes("order")))) {
        action = "EXTRACT";
      }
    }

    const stepId = `step_${index}_${action.toLowerCase()}`;
    const targetUrl = obs.context?.url;
    const selector = specificSelectorOnly(obs.target?.dom_evidence?.attributes?.selector || obs.target?.selector);
    const targetName = obs.target?.dom_evidence?.name || obs.target?.dom_evidence?.text || obs.target?.name;
    const val = typeof obs.value === "string" ? obs.value : (obs.value?.raw_value || "");

    const args: any = {
      application: appName,
      provenance: obs.provenance || {
        source_media_id: obs.source_media_id,
        start_timestamp: obs.start_timestamp ?? obs.timestamp,
        end_timestamp: obs.end_timestamp ?? obs.timestamp,
        frame_ids: obs.frame_ids || (obs.frame_id ? [obs.frame_id] : []),
        basis: obs.inference_status,
        rationale: obs.rationale || desc
      }
    };
    let bind_result_to: string | undefined = undefined;

    if (target === "DESKTOP") {
      args.application = appName || "Desktop";
      args.windowTitle = obs.window_title || obs.context?.page_title;
      args.text = val || obs.text;
      args.target = obs.target_selector || (obs.target ? { strategy: "UIA", name: targetName || selector } : undefined);
      if (action === "DESKTOP_READ") {
        bind_result_to = `var_desktop_${index}`;
      }
    } else if (action === "NAVIGATE") {
      if (typeof targetUrl === "string" && /^https?:\/\//i.test(targetUrl)) args.url = targetUrl;
    } else if (action === "TYPE" || action === "CLICK" || action === "SELECT") {
      if (selector) args.selector = selector;
      if (targetName) args.target = { [action === "CLICK" ? "text" : "label"]: String(targetName) };
      if (action !== "CLICK") args.value = val;
      if (action === "CLICK" && /\b(submit|save|delete|remove|pay|purchase|buy|place order|checkout|confirm|send|transfer|approve|publish|post)\b/i.test(String(targetName || ""))) {
        args.irreversible = true;
      }
    } else if (action === "EXTRACT") {
      if (selector) args.selector = selector;
      if (targetName) args.target = { text: String(targetName) };
      args.instruction = val || desc || "Extract content";
      bind_result_to = `var_ext_${index}`;
    } else {
      args.instruction = val || desc || "Perform action";
    }

    return {
      id: stepId,
      operation: action as any,
      target: target as any,
      description: desc || `${action} in ${appName || "System"}`,
      args,
      ...(bind_result_to ? { bind_result_to } : {})
    };
  }

  private validate(candidate: WorkflowV2): WorkflowV2 {
    // 1. Zod schema validation
    const validated = validateWorkflowV2(candidate);

    // 2. Domain logic validation
    this.validateVariables(validated);
    this.validateControlFlow(validated);
    this.validateTaskPolicies(validated);

    return validated;
  }

  private validateVariables(workflow: WorkflowV2) {
    const declaredVars = new Set(workflow.variables.map(v => v.name));
    
    // Pass 1: Collect variables bound by EXTRACT (bind_result_to)
    const collectBindings = (step: WorkflowV2Step) => {
       if (step.bind_result_to) {
          declaredVars.add(step.bind_result_to);
       }
       if (step.children) {
         step.children.forEach(collectBindings);
       }
    };
    collectBindings(workflow.root_step);

    // Pass 2: Check variable usage
    const findVariables = (step: WorkflowV2Step) => {
       const argsStr = JSON.stringify(step.args);
       const matches = argsStr.match(/\{\{([a-zA-Z0-9_.]+)\}\}/g) || [];
       for (const m of matches) {
          const varName = m.replace("{{", "").replace("}}", "");
          // Allow standard workflow variables like `url` or internal loop properties like `orders` or `item`
          if (!declaredVars.has(varName) && !varName.startsWith("item") && !varName.startsWith("orders") && varName !== "url") {
             throw new Error(`Workflow validation failed: Unresolved variable reference '${varName}' in step ${step.id}.`);
          }
       }
       if (step.children) {
         step.children.forEach(findVariables);
       }
    };
    findVariables(workflow.root_step);
  }

  private validateControlFlow(workflow: WorkflowV2) {
    const findLoops = (step: WorkflowV2Step) => {
      if (step.operation === "FOR_EACH") {
         if (!step.args?.collection) {
            throw new Error(`Workflow validation failed: FOR_EACH step ${step.id} has no collection bound.`);
         }
         // Validate bounded loop
         if (step.args?.max_iterations && step.args.max_iterations > 1000) {
            throw new Error(`Workflow validation failed: FOR_EACH max_iterations cannot exceed 1000.`);
         }
      }
      if (step.children) step.children.forEach(findLoops);
    };
    findLoops(workflow.root_step);
  }

  private validateTaskPolicies(workflow: WorkflowV2) {
    const textToCheck = `${workflow.name} ${workflow.description || ""}`.toLowerCase();
    const isProductResearch = textToCheck.includes("research") || 
                              textToCheck.includes("product") || 
                              textToCheck.includes("amazon") || 
                              textToCheck.includes("compare") || 
                              textToCheck.includes("price");

    if (isProductResearch && STANDARD_TASK_POLICIES.PRODUCT_RESEARCH) {
      const policyResult = validateWorkflowPolicies(workflow.root_step, STANDARD_TASK_POLICIES.PRODUCT_RESEARCH);
      if (!policyResult.valid) {
        const violationDetails = policyResult.violations.map(v => `${v.ruleName}: ${v.reason}`).join("; ");
        throw new Error(`Workflow safety policy violation: Task is configured as read-only research, but prohibited steps were detected: ${violationDetails}`);
      }
    }
  }
}
