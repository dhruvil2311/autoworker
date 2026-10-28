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
  /** The recording tool itself; never part of the task. */
  private static readonly RECORDER_PATTERNS = [
    /is sharing your screen/i,
    /stop sharing/i,
    /\bautoworker\b/i,
    /localhost:5173/i,
    /localhost:4000/i,
    /spatial floor/i,
    /command room/i
  ];

  /**
   * Operating-system chrome. Matched only for passive observations or shell applications, so a
   * deliberate click on "Clock in" or "Volume discount" in a business application is kept.
   */
  private static readonly OS_CHROME_PATTERNS = [
    /\btaskbar\b/i,
    /system tray/i,
    /recycle bin/i,
    /desktop wallpaper/i,
    /start menu/i,
    /windows search/i,
    /action center/i,
    /\bnew tab\b/i,
    /\bbookmarks? bar\b/i,
    /\bclock\b/i,
    /\bbattery\b/i,
    /\bwi-?fi\b/i,
    /\bvolume\b/i,
    /\bnotifications?\b/i
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

    // 1. Recording-tool UI is always noise.
    for (const pattern of TaskRelevanceEngine.RECORDER_PATTERNS) {
      if (pattern.test(label)) {
        return { observationId: obs.id, relevance: "NOISE", score: 0, reason: `Recording tool interface: ${pattern}` };
      }
    }

    // 2. A navigation is a task step; its address is the evidence, not address-bar noise.
    if (/navigate/i.test(obs.type || "") && /^https?:\/\//i.test(obs.targetText || obs.value || "")) {
      return { observationId: obs.id, relevance: "HIGH", score: 60, reason: "Navigation to a demonstrated address" };
    }

    // 3. Operating-system chrome, unless the user deliberately interacted with a business application.
    const interacted = Boolean(obs.isClickTarget || obs.isTextMutation || (obs.value && obs.value.length > 0));
    const shellApp = /^(explorer|desktop|windows|shell|system|taskbar)$/i.test(obs.application || "");
    if (!interacted || shellApp) {
      for (const pattern of TaskRelevanceEngine.OS_CHROME_PATTERNS) {
        if (pattern.test(label)) {
          return { observationId: obs.id, relevance: "NOISE", score: 0, reason: `Operating-system chrome: ${pattern}` };
        }
      }
    }

    // 4. Interaction heuristics
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

    // 5. Application context alignment
    if (context.activeApp && obs.application && obs.application.toLowerCase() === context.activeApp.toLowerCase()) {
      score += 15;
      reasons.push("Matches active foreground application");
    }

    // 6. Down-rank static passive UI without interactions
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
