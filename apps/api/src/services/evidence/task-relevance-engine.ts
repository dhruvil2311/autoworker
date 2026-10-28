import { logger } from "@ghost/observability";

export interface RawVisualObservation {
  id: string;
  timestamp: number;
  type?: string | undefined;
  application?: string | undefined;
  windowTitle?: string | undefined;
  targetText?: string | undefined;
  targetDescription?: string | undefined;
  coordinates?: { x: number; y: number } | undefined;
  boundingBox?: [number, number, number, number] | undefined;
  isPointerTarget?: boolean | undefined;
  isTextMutation?: boolean | undefined;
  isClickTarget?: boolean | undefined;
  isFocusTarget?: boolean | undefined;
  value?: string | undefined;
  confidence?: number | undefined;
}

export interface RelevanceScore {
  observationId: string;
  relevance: "HIGH" | "MEDIUM" | "LOW" | "NOISE";
  score: number;
  reason: string;
}

export class TaskRelevanceEngine {
  private static readonly NOISE_PATTERNS = [
    // Browser noise
    /^https?:\/\//i, // static raw address bar unless navigation
    /new tab/i,
    /bookmark/i,
    /is sharing your screen/i,
    /stop sharing/i,
    /autoworker/i,
    /localhost:5173/i,
    /localhost:4000/i,
    /spatial floor/i,
    /command room/i,
    /live session/i,
    /roadmap/i,
    // Desktop noise
    /taskbar/i,
    /system tray/i,
    /notification/i,
    /recycle bin/i,
    /desktop wallpaper/i,
    /start menu/i,
    /windows search/i,
    /clock/i,
    /battery/i,
    /wi-fi/i,
    /volume/i,
    /action center/i
  ];

  /**
   * Filters and scores visual observations to distinguish true work from background noise.
   */
  public filterTaskRelevantObservations(
    observations: RawVisualObservation[],
    context: { activeApp?: string | undefined; activeWindow?: string | undefined } = {}
  ): { relevant: RawVisualObservation[]; discarded: RelevanceScore[] } {
    const relevant: RawVisualObservation[] = [];
    const discarded: RelevanceScore[] = [];

    for (const obs of observations) {
      const score = this.calculateRelevance(obs, context);
      if (score.relevance === "HIGH" || score.relevance === "MEDIUM") {
        relevant.push(obs);
      } else {
        discarded.push(score);
      }
    }

    logger.debug(
      { total: observations.length, retained: relevant.length, filtered: discarded.length },
      "[TaskRelevanceEngine] Filtered raw observations into task-relevant evidence"
    );

    return { relevant, discarded };
  }

  public calculateRelevance(
    obs: RawVisualObservation,
    context: { activeApp?: string | undefined; activeWindow?: string | undefined } = {}
  ): RelevanceScore {
    let score = 0;
    const reasons: string[] = [];

    const label = `${obs.targetText || ""} ${obs.targetDescription || ""} ${obs.windowTitle || ""}`.trim();

    // 1. Check Noise Patterns
    for (const pattern of TaskRelevanceEngine.NOISE_PATTERNS) {
      if (pattern.test(label)) {
        return {
          observationId: obs.id,
          relevance: "NOISE",
          score: 0,
          reason: `Matched visual noise pattern: ${pattern}`
        };
      }
    }

    // 2. Interaction heuristics
    if (obs.isClickTarget) {
      score += 50;
      reasons.push("Click target");
    }
    if (obs.isTextMutation) {
      score += 40;
      reasons.push("Visual text mutation");
    }
    if (obs.isPointerTarget) {
      score += 25;
      reasons.push("Pointer trajectory intersection");
    }
    if (obs.isFocusTarget) {
      score += 20;
      reasons.push("Focus received");
    }
    if (obs.value && obs.value.length > 0) {
      score += 30;
      reasons.push("Data input demonstrated");
    }

    // 3. Application context alignment
    if (context.activeApp && obs.application && obs.application.toLowerCase() === context.activeApp.toLowerCase()) {
      score += 15;
      reasons.push("Matches active foreground application");
    }

    // 4. Down-rank static passive UI without interactions
    if (!obs.isClickTarget && !obs.isTextMutation && !obs.isPointerTarget && !obs.value) {
      score -= 30;
      reasons.push("Passive untouched UI");
    }

    let relevance: RelevanceScore["relevance"] = "LOW";
    if (score >= 45) {
      relevance = "HIGH";
    } else if (score >= 20) {
      relevance = "MEDIUM";
    } else if (score > 0) {
      relevance = "LOW";
    } else {
      relevance = "NOISE";
    }

    return {
      observationId: obs.id,
      relevance,
      score: Math.max(0, score),
      reason: reasons.join(", ") || "Baseline passive score"
    };
  }
}
