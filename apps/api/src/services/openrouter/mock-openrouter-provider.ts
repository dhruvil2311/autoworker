import type {
  VisionReasoningProvider,
  SemanticEvidencePacket,
  SemanticActionsResult,
  SemanticAction,
  ProcessReasoningContext,
  ProcessUnderstandingResult,
  CriticResult
} from "./types.js";

export class MockVisionProvider implements VisionReasoningProvider {
  public customSemanticActions?: SemanticAction[];
  public customProcessUnderstanding?: ProcessUnderstandingResult;
  public simulateQuotaError: boolean = false;
  public simulateMalformedJson: boolean = false;
  public callCount: number = 0;

  async extractSemanticActions(packet: SemanticEvidencePacket): Promise<SemanticActionsResult> {
    this.callCount++;

    if (this.simulateQuotaError) {
      throw new Error("AI_QUOTA_EXHAUSTED: Mock quota exceeded (429)");
    }
    if (this.simulateMalformedJson) {
      throw new Error("MALFORMED_OUTPUT: Mock returned unparseable text");
    }

    if (this.customSemanticActions) {
      return {
        semanticActions: this.customSemanticActions,
        discardedNoise: ["mock_ignored_taskbar", "mock_ignored_inactive_tab"],
        unresolved: []
      };
    }

    // Default high-quality simulated actions from evidence episodes
    const actions: SemanticAction[] = packet.episodes.map((ep, idx) => ({
      action: ep.action.type === "CLICK" ? `INTERACT_${ep.action.targetText?.toUpperCase().replace(/[^A-Z0-9]/g, "_") || "BUTTON"}` : `ENTER_${ep.action.targetText?.toUpperCase().replace(/[^A-Z0-9]/g, "_") || "VALUE"}`,
      arguments: ep.action.value ? { value: ep.action.value } : { target: ep.action.targetText },
      application: ep.application || "Browser",
      evidenceEpisodeIds: [ep.episodeId],
      confidence: ep.action.confidence || 0.95,
      evidenceStatus: "OBSERVED",
      rationale: `Simulated semantic extraction from episode ${ep.episodeId}`
    }));

    return {
      semanticActions: actions,
      discardedNoise: ["static_wallpaper", "inactive_tab_gmail", "taskbar_clock"],
      unresolved: []
    };
  }

  async compileProcessUnderstanding(
    semanticActions: SemanticAction[],
    context: ProcessReasoningContext
  ): Promise<ProcessUnderstandingResult> {
    this.callCount++;

    if (this.simulateQuotaError) {
      throw new Error("AI_QUOTA_EXHAUSTED: Mock quota exceeded (429)");
    }

    if (this.customProcessUnderstanding) {
      return this.customProcessUnderstanding;
    }

    return {
      taskIntent: context.objective || "Automate verified multi-step business workflow",
      applicationEnvironment: semanticActions[0]?.application || "Web Browser",
      processStructure: {
        type: "LINEAR",
        stepIndices: semanticActions.map((_, i) => i)
      },
      variables: [
        {
          name: "username",
          type: "string",
          classification: "EXAMPLE_VALUE",
          semanticRole: "user_credential",
          defaultValue: "standard_user"
        }
      ],
      businessRules: [
        {
          rule: "Navigate to base login page if unauthenticated redirect error displays",
          confidence: 0.95,
          reasoning: "Observed access restriction error banner"
        }
      ],
      expectedOutcomes: ["Target process completes successfully with verified output deliverable"],
      exceptions: [
        {
          triggerCondition: "Authentication error or redirect to login",
          fallbackAction: "Re-authenticate using valid credentials"
        }
      ],
      confidence: 0.95
    };
  }

  async critiqueWorkflow(_workflow: any, _evidence: SemanticEvidencePacket): Promise<CriticResult> {
    return {
      passed: true,
      unsupportedSteps: [],
      hallucinatedVariables: [],
      clutterDetected: [],
      suggestions: []
    };
  }
}

export const MockSemanticProvider = MockVisionProvider;
