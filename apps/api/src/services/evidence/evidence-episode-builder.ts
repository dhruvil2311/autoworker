import type {
  EvidenceEpisode,
  FrameEvidence,
  OcrFact,
  SemanticEvidencePacket
} from "../openrouter/types.js";
import type { RawVisualObservation } from "./task-relevance-engine.js";

export class EvidenceEpisodeBuilder {
  /**
   * Bundles visual observations, frames, and OCR facts into Before/Action/After Evidence Episodes.
   */
  public buildEpisodes(
    observations: RawVisualObservation[],
    frames: FrameEvidence[],
    ocrFacts: OcrFact[],
    context: { activeApp?: string | undefined; taskContext?: string | undefined } = {}
  ): EvidenceEpisode[] {
    if (!observations.length) {
      // If no discrete raw observations, create episode boundaries based on sampled frame transitions
      return this.buildEpisodesFromFrameTransitions(frames, ocrFacts, context);
    }

    const episodes: EvidenceEpisode[] = [];

    for (let i = 0; i < observations.length; i++) {
      const obs = observations[i];
      if (!obs) continue;

      const episodeId = `ep_${(i + 1).toString().padStart(2, "0")}`;
      // A missing timestamp is not invented; the episode is anchored to its neighbours' frames instead.
      const actionTime = typeof obs.timestamp === "number" && Number.isFinite(obs.timestamp) ? obs.timestamp : (frames[0]?.timestamp ?? 0);
      const startTime = Math.max(0, actionTime - 0.75);
      const endTime = actionTime + 0.75;

      // Find closest before frame and after frame
      const beforeFrames = frames.filter(f => f.timestamp <= actionTime).slice(-1);
      const afterFrames = frames.filter(f => f.timestamp > actionTime).slice(0, 1);

      // Associate OCR facts within time window
      const beforeOcr = ocrFacts.filter(o => (o.timestamp ?? 0) <= actionTime).slice(-10);
      const afterOcr = ocrFacts.filter(o => (o.timestamp ?? 0) > actionTime && (o.timestamp ?? 0) <= endTime + 1.0).slice(0, 20);

      let actionType: EvidenceEpisode["action"]["type"] = obs.isClickTarget || /click/i.test(obs.type || "") ? "CLICK" : "UNKNOWN";
      if (obs.type === "TYPE" || obs.isTextMutation || obs.value) {
        actionType = "TYPE";
      } else if (obs.type === "NAVIGATE" || (obs.targetText && obs.targetText.startsWith("http"))) {
        actionType = "NAVIGATE";
      } else if (obs.type === "SELECT") {
        actionType = "SELECT";
      }

      episodes.push({
        episodeId,
        timestampStart: startTime,
        timestampEnd: endTime,
        application: obs.application || context.activeApp || "Browser",
        windowTitle: obs.windowTitle,
        before: {
          frames: beforeFrames.length ? beforeFrames : (frames.slice(0, 1)),
          ocr: beforeOcr
        },
        action: {
          type: actionType,
          targetText: obs.targetText || obs.targetDescription || undefined,
          coordinates: obs.coordinates,
          value: obs.value,
          source: obs.isClickTarget ? "cursor-analysis" : (obs.isTextMutation ? "ocr-mutation" : "inferred"),
          confidence: typeof obs.confidence === "number" ? obs.confidence : 0.5
        },
        after: {
          frames: afterFrames.length ? afterFrames : (beforeFrames.length ? beforeFrames : frames.slice(-1)),
          ocr: afterOcr
        }
      });
    }

    return episodes;
  }

  private buildEpisodesFromFrameTransitions(
    frames: FrameEvidence[],
    ocrFacts: OcrFact[],
    context: { activeApp?: string | undefined }
  ): EvidenceEpisode[] {
    const episodes: EvidenceEpisode[] = [];
    for (let i = 0; i < frames.length - 1; i++) {
      const beforeFrame = frames[i];
      const afterFrame = frames[i + 1];
      if (!beforeFrame || !afterFrame) continue;

      const episodeId = `ep_${(i + 1).toString().padStart(2, "0")}`;
      const afterOcr = ocrFacts.filter(o => (o.timestamp ?? 0) >= beforeFrame.timestamp && (o.timestamp ?? 0) <= afterFrame.timestamp);

      episodes.push({
        episodeId,
        timestampStart: beforeFrame.timestamp,
        timestampEnd: afterFrame.timestamp,
        application: context.activeApp || "Browser",
        before: {
          frames: [beforeFrame],
          ocr: ocrFacts.filter(o => o.frameId === beforeFrame.frameId || o.timestamp === beforeFrame.timestamp)
        },
        // A visual change between two frames shows that something happened, not what was clicked.
        action: {
          type: "UNKNOWN",
          source: "inferred",
          confidence: 0.3
        },
        after: {
          frames: [afterFrame],
          ocr: afterOcr
        }
      });
    }
    return episodes;
  }

  /**
   * Packages episodes and contextual OCR facts into a SemanticEvidencePacket.
   */
  public packageEvidencePacket(
    episodes: EvidenceEpisode[],
    ocrFacts: OcrFact[],
    context: { taskContext?: string | undefined; activeApp?: string | undefined } = {}
  ): SemanticEvidencePacket {
    const startTime = episodes[0]?.timestampStart ?? 0;
    const endTime = episodes[episodes.length - 1]?.timestampEnd ?? (startTime + 10);

    return {
      packetId: `pkt_${Date.now()}`,
      taskContext: context.taskContext || "User demonstration execution",
      activeApplication: context.activeApp || episodes[0]?.application || "Browser",
      episodes,
      ocrFacts: dedupeOcr(ocrFacts).map(o => o.text),
      timedOcr: dedupeOcr(ocrFacts),
      confidence: 0.92,
      timestamps: { start: startTime, end: endTime }
    };
  }
}

/** Keeps the first occurrence of each OCR line across the timeline so later text is not crowded out. */
export function dedupeOcr(ocrFacts: OcrFact[]): Array<{ text: string; timestamp?: number | undefined; frameId?: string | undefined }> {
  const seen = new Set<string>();
  const out: Array<{ text: string; timestamp?: number | undefined; frameId?: string | undefined }> = [];
  for (const fact of [...ocrFacts].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))) {
    const key = String(fact.text || "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ text: fact.text.trim(), timestamp: fact.timestamp, frameId: fact.frameId });
  }
  return out;
}
