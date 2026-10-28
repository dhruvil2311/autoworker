import { z } from "zod";
import type { WorkflowV2, WorkflowV2Step } from "@ghost/workflow-schema";
import { logger } from "@ghost/observability";

// Target schema for the multi-frame Vision AI Agent
export const VisionStepInteractionSchema = z.enum([
  "CLICK",
  "TYPE",
  "HOVER",
  "SELECT",
  "KEYPRESS",
  "DELAY",
  "NAVIGATE",
  "EXTRACT",
  "VERIFY"
]);

export const VisionSequenceFlowItemSchema = z.object({
  step: z.number(),
  estimated_frame_index: z.string().default(""),
  interaction: VisionStepInteractionSchema.default("CLICK"),
  target_element: z.string(),
  data_input: z.string().nullable().default(null),
  ui_state_transition: z.string().default("")
});

export const VisionDecisionLogicItemSchema = z.object({
  trigger_condition: z.string(),
  fallback_or_alternative_action: z.string()
});

export const VisionAIWorkflowSchema = z.object({
  workflow_summary: z.object({
    objective: z.string(),
    application_environment: z.string(),
    estimated_execution_time_seconds: z.number().default(0)
  }),
  sequence_flow: z.array(VisionSequenceFlowItemSchema).default([]),
  agent_decision_logic: z.array(VisionDecisionLogicItemSchema).default([])
});

export type VisionAIWorkflow = z.infer<typeof VisionAIWorkflowSchema>;

export class VisionWorkflowEngine {
  /**
   * Builds the exact prompt used to instruct multimodal vision LLMs.
   */
  public static getVisionPrompt(): string {
    return `You are an advanced, zero-cost Vision AI Agent specialized in Multi-Frame Video Analysis and Workflow Engineering. 

I am providing you with a chronological sequence of image frames extracted from a video. Each image represents a distinct point in time. Your job is to reconstruct these visual steps into a production-grade, executable automation workflow.

CRITICAL INSTRUCTIONS FOR MULTI-FRAME ACCURACY:
1. TRACK CHRONOLOGY: Look at the visual progression. Treat each frame as standard time tracking (e.g., Frame 1 -> Frame 2 -> Frame 3). Never mix up the order.
2. DETECT ACTIONS: Identify the exact action occurring between frames. Watch for changing cursor placements, highlighted text fields, changing URLs, loading spinners, state switches, or structural UI changes.
3. INFER LOGIC: If a user clicks a button and a menu pops up, capture that cause-and-effect loop. If an error message appears, treat it as a conditional branch.

OUTPUT FORMAT:
You must respond ONLY with a cleanly structured JSON object. Do not include markdown code block syntax (like \`\`\`json ... \`\`\`), no introductory sentences, and no conversational wrap-up. Output the raw data structure directly.

JSON TARGET SCHEMA STRUCTURE:
{
  "workflow_summary": {
    "objective": "Clear description of what process is being completed in the video",
    "application_environment": "Web browser, desktop software, mobile app, etc.",
    "estimated_execution_time_seconds": 0
  },
  "sequence_flow": [
    {
      "step": 1,
      "estimated_frame_index": "Identify which image index or range this occurs in",
      "interaction": "CLICK | TYPE | HOVER | SELECT | KEYPRESS | DELAY",
      "target_element": "The specific button, input box, menu option, or link interacted with",
      "data_input": "Value typed or selected, if applicable. If none, write null",
      "ui_state_transition": "Exact description of what changes on the screen immediately after this step"
    }
  ],
  "agent_decision_logic": [
    {
      "trigger_condition": "What situation forces a change in route (e.g., 'If invalid email popup displays')",
      "fallback_or_alternative_action": "How the workflow agent should handle this exception path"
    }
  ]
}`;
  }

  /**
   * Compiles the raw Vision AI analysis output into a production-grade executable WorkflowV2 definition.
   */
  public static compileToWorkflowV2(
    analysis: VisionAIWorkflow,
    options: {
      workflowName?: string;
      sourceRecordingId?: string;
      mediaName?: string;
      expectedDomains?: string[];
    } = {}
  ): WorkflowV2 {
    const summary = analysis.workflow_summary;
    const name = options.workflowName || summary.objective || "Vision AI Reconstructed Workflow";
    const env = summary.application_environment.toLowerCase();
    const isBrowser = env.includes("browser") || env.includes("web") || env.includes("http");

    // Extract detected domain if present in application_environment or sequence flow
    const extractedDomains: string[] = options.expectedDomains || [];
    const urlMatch = summary.application_environment.match(/https?:\/\/([^/\s)]+)/i);
    if (urlMatch && urlMatch[1]) {
      extractedDomains.push(urlMatch[1]);
    }

    const steps: WorkflowV2Step[] = [];

    // Ensure we start with a clean navigation step if in browser environment
    let hasNavigation = analysis.sequence_flow.some(s => s.interaction === "NAVIGATE" || s.target_element.startsWith("http"));
    if (isBrowser && urlMatch && !hasNavigation) {
      steps.push({
        id: "step_1_init_navigate",
        operation: "NAVIGATE",
        target: "BROWSER_DETERMINISTIC",
        description: `Open initial URL: ${urlMatch[0]}`,
        args: {
          url: urlMatch[0],
          timeoutMs: 15000
        },
        failure_policy: {
          retry_limit: 2,
          on_failure: "FAIL"
        }
      });
    }

    for (const flow of analysis.sequence_flow) {
      const stepIndex = steps.length + 1;
      const stepId = `step_${stepIndex}_${flow.interaction.toLowerCase()}`;
      const targetStr = flow.target_element.trim();

      // Resolve smart selector candidates from the target description
      const selector = this.deriveSelector(targetStr, flow.interaction);

      if (flow.interaction === "TYPE") {
        const isAuthInput = targetStr.toLowerCase().includes("pass") || targetStr.toLowerCase().includes("pwd") || selector.toLowerCase().includes("pass") || selector.toLowerCase().includes("pwd") || targetStr.toLowerCase().includes("credential") || targetStr.toLowerCase().includes("secret") || targetStr.toLowerCase().includes("token");
        steps.push({
          id: stepId,
          operation: "TYPE",
          target: isBrowser ? "BROWSER_DETERMINISTIC" : "DESKTOP",
          description: `Enter value into ${targetStr} (${flow.estimated_frame_index || "frame " + flow.step})`,
          args: {
            selector,
            text: isAuthInput ? "" : (flow.data_input || ""),
            value: isAuthInput ? "" : (flow.data_input || ""),
            timeoutMs: 10000
          }
        });
      } else if (flow.interaction === "NAVIGATE" || targetStr.startsWith("http")) {
        const destUrl = targetStr.startsWith("http") ? targetStr : (urlMatch ? urlMatch[0] : "https://saucedemo.com/");
        steps.push({
          id: stepId,
          operation: "NAVIGATE",
          target: "BROWSER_DETERMINISTIC",
          description: `Navigate to ${destUrl}`,
          args: {
            url: destUrl,
            timeoutMs: 15000
          }
        });
      } else if (flow.interaction === "EXTRACT" || flow.interaction === "VERIFY") {
        steps.push({
          id: stepId,
          operation: "EXTRACT",
          target: isBrowser ? "BROWSER_DETERMINISTIC" : "DESKTOP",
          description: `Verify element state: ${targetStr}`,
          args: {
            selector,
            timeoutMs: 10000
          },
          bind_result_to: `extracted_step_${stepIndex}`
        });
      } else if (flow.interaction === "DELAY") {
        steps.push({
          id: stepId,
          operation: "WAIT",
          target: isBrowser ? "BROWSER_DETERMINISTIC" : "DESKTOP",
          description: `Wait for UI transition: ${flow.ui_state_transition || "settle UI"}`,
          args: {
            durationMs: 2000
          }
        });
      } else {
        // Default: CLICK / HOVER / SELECT
        steps.push({
          id: stepId,
          operation: "CLICK",
          target: isBrowser ? "BROWSER_DETERMINISTIC" : "DESKTOP",
          description: `Click ${targetStr} (${flow.estimated_frame_index || "frame " + flow.step})`,
          args: {
            selector,
            timeoutMs: 10000
          }
        });
      }
    }

    // Add completion deliverable steps
    steps.push({
      id: `step_${steps.length + 1}_deliverable`,
      operation: "BUILD_OUTPUT",
      target: "DATA",
      description: "Synthesize deliverable from visual demonstration execution",
      args: {
        contract: {
          output_type: "EXTRACTION",
          output_required: true,
          completion_condition: "All sequenced actions executed and verified",
          delivery_destination: "CHAT",
          verification_requirements: ["DELIVERABLE_NON_EMPTY"]
        }
      }
    });

    const workflow: WorkflowV2 = {
      workflow_version: "2.0",
      name,
      description: summary.objective,
      status: "ACTIVE",
      expected_domains: Array.from(new Set(extractedDomains)),
      variables: [],
      secrets: [],
      compiler: {
        version: "vision-ai-video-engineering-v1",
        source_specification_id: options.sourceRecordingId || "vision-demonstration",
        compiled_at: new Date().toISOString(),
        source_type: "VISION_AI_MULTI_FRAME_ANALYSIS",
        source_media_name: options.mediaName || "Desktop Demonstration Recording",
        action_count: steps.length,
        workflow_summary: summary,
        agent_decision_logic: analysis.agent_decision_logic
      } as any,
      root_step: {
        id: "root_sequence",
        operation: "SEQUENCE",
        target: "DATA",
        description: `Root sequence for ${name}`,
        children: steps
      }
    };

    return workflow;
  }

  private static deriveSelector(targetStr: string, interaction: string): string {
    // Check if target already includes id or selector hints
    const idMatch = targetStr.match(/id=['"]?([^'"\s)]+)['"]?/i);
    if (idMatch && idMatch[1]) {
      return `#${idMatch[1]}`;
    }

    // Common standard input and button patterns
    const clean = targetStr.replace(/^(?:click|press|submit|select|open|add|type|enter|fill)\s+/i, '')
      .replace(/[()"'[\]]/g, '')
      .trim();
    const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const candidates: string[] = [];
    if (slug) {
      if (slug.includes("user") || slug.includes("username") || slug.includes("email")) {
        candidates.push("#user-name", "input[name='user-name']", "[data-test='username']", "input[type='text']");
      } else if (slug.includes("password")) {
        candidates.push("#password", "input[name='password']", "[data-test='password']", "input[type='password']");
      } else if (slug.includes("login") || slug.includes("submit")) {
        candidates.push("#login-button", "[data-test='login-button']", "input[type='submit']", "button[type='submit']", "button:has-text('Login')");
      } else {
        candidates.push(`[data-test='${slug}']`, `#${slug}`);
        if (interaction === "TYPE") {
          candidates.push(`input[name='${slug}']`, `input[placeholder*='${clean}' i]`);
        } else {
          candidates.push(`button:has-text('${clean}')`, `a:has-text('${clean}')`);
        }
      }
    }

    return Array.from(new Set(candidates.filter(Boolean))).join(", ") || targetStr;
  }
}
