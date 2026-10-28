import type { DesktopUIElement } from "@ghost/workflow-schema";

export type CorrectionType =
  | "corrected_selector"
  | "application_mapping"
  | "business_rule"
  | "exception_rule"
  | "recovery_strategy"
  | "approval_policy"
  | "ui_navigation_pattern";

export type MemoryCategory = "PROCESS_MEMORY" | "UI_MEMORY";

export interface StructuredCorrectionArtifact {
  id: string;
  workerId?: string;
  runId?: string;
  stepId: string;
  correctionType: CorrectionType;
  category: MemoryCategory;
  originalAction: Record<string, any>;
  correctedAction: Record<string, any>;
  structuredData: {
    ruleOrSelectorText: string;
    application: string;
    elementName?: string;
    automationId?: string;
    confidence: number;
    notes?: string;
  };
  timestamp: string;
}

export interface ReObservedState {
  timestamp: string;
  activeApplication?: string;
  activeWindow?: string;
  visibleElementCount: number;
  screenshotBase64: string;
  activeDialogCount: number;
  stateVerified: boolean;
  verifiedCheckpoint?: string;
  notes?: string;
}

export interface TakeoverSessionRecord {
  sessionId: string;
  initiatedAt: string;
  releasedAt?: string;
  reason: string;
  reobservedState?: ReObservedState;
}

export class TakeoverManager {
  private isTakeoverActive = false;
  private currentPauseReason?: string;
  private currentSessionId?: string;
  private corrections: StructuredCorrectionArtifact[] = [];
  private sessionHistory: TakeoverSessionRecord[] = [];
  private lastReobservedState?: ReObservedState;

  isUnderHumanControl(): boolean {
    return this.isTakeoverActive;
  }

  getCurrentPauseReason(): string | undefined {
    return this.currentPauseReason;
  }

  initiateHumanTakeover(reason: string): string {
    const sessionId = crypto.randomUUID();
    this.isTakeoverActive = true;
    this.currentPauseReason = reason;
    this.currentSessionId = sessionId;

    this.sessionHistory.push({
      sessionId,
      initiatedAt: new Date().toISOString(),
      reason
    });

    return sessionId;
  }

  releaseControl(): void {
    this.isTakeoverActive = false;
    this.currentPauseReason = undefined;

    if (this.currentSessionId) {
      const sess = this.sessionHistory.find(s => s.sessionId === this.currentSessionId);
      if (sess) {
        sess.releasedAt = new Date().toISOString();
      }
    }
  }

  recordReobservation(reobserved: ReObservedState): void {
    this.lastReobservedState = reobserved;
    if (this.currentSessionId) {
      const sess = this.sessionHistory.find(s => s.sessionId === this.currentSessionId);
      if (sess) {
        sess.reobservedState = reobserved;
      }
      this.currentSessionId = undefined;
    }
  }

  getLastReobservedState(): ReObservedState | undefined {
    return this.lastReobservedState;
  }

  getSessionHistory(): TakeoverSessionRecord[] {
    return [...this.sessionHistory];
  }

  /**
   * Captures a structured human correction during Takeover or HITL intervention.
   * Categorizes into PROCESS MEMORY (business logic) vs UI MEMORY (selectors/navigation).
   */
  captureCorrection(params: {
    workerId?: string;
    runId?: string;
    stepId: string;
    correctionType: CorrectionType;
    originalAction: Record<string, any>;
    correctedAction: Record<string, any>;
    application: string;
    element?: DesktopUIElement;
    ruleText?: string;
    notes?: string;
  }): StructuredCorrectionArtifact {
    // Determine whether this is Process Memory or UI Memory
    const isUiMemory = 
      params.correctionType === "corrected_selector" ||
      params.correctionType === "ui_navigation_pattern" ||
      params.correctionType === "application_mapping";

    const category: MemoryCategory = isUiMemory ? "UI_MEMORY" : "PROCESS_MEMORY";

    const ruleOrSelectorText = params.ruleText || 
      (isUiMemory 
        ? `Use selector "${params.element?.automationId || params.element?.name}" for ${params.application}`
        : `Business rule correction: ${params.notes || "Custom human rule"}`);

    const artifact: StructuredCorrectionArtifact = {
      id: crypto.randomUUID(),
      workerId: params.workerId,
      runId: params.runId,
      stepId: params.stepId,
      correctionType: params.correctionType,
      category,
      originalAction: params.originalAction,
      correctedAction: params.correctedAction,
      structuredData: {
        ruleOrSelectorText,
        application: params.application,
        elementName: params.element?.name,
        automationId: params.element?.automationId,
        confidence: 1.0, // Human corrections start at 100% confidence
        notes: params.notes
      },
      timestamp: new Date().toISOString()
    };

    this.corrections.push(artifact);
    return artifact;
  }

  getCorrections(): StructuredCorrectionArtifact[] {
    return [...this.corrections];
  }
}
