import type { EvidenceEpisode, OcrFact, SemanticAction, SemanticEvidencePacket } from "../openrouter/types.js";

/**
 * Evidence grounding separates what the recording shows from what a model claims.
 *
 * The vision model proposes actions; this module decides, deterministically and per action,
 * whether each one is supported by the recording (episodes, frames, OCR), required by the
 * user's stated objective, or unsupported. It never adds actions and never removes one
 * silently: every rejected or uncovered item is reported with a reason.
 */

export type CanonicalAction =
  | "NAVIGATE"
  | "CLICK"
  | "TYPE"
  | "SELECT"
  | "KEYPRESS"
  | "SCROLL"
  | "WAIT"
  | "EXTRACT"
  | "VERIFY"
  | "UNSUPPORTED";

export type EvidenceBasis = "OBSERVED" | "INFERRED" | "REQUIRED_BY_OBJECTIVE" | "UNSUPPORTED";

export type GroundingIssueCode =
  | "UNSUPPORTED_ACTION_TYPE"
  | "UNGROUNDED_ACTION"
  | "UNGROUNDED_TARGET"
  | "UNCORROBORATED_TARGET"
  | "UNGROUNDED_URL"
  | "UNKNOWN_EVIDENCE_REFERENCE"
  | "MISSING_TARGET"
  | "MISSING_VALUE"
  | "CONFLICTING_VALUES"
  | "UNCOVERED_TRANSITION"
  | "DESTINATION_UNKNOWN"
  | "OBJECTIVE_CONFLICT"
  | "OBJECTIVE_MISSING"
  | "NO_ACTIONS";

export interface GroundingIssue {
  code: GroundingIssueCode;
  severity: "BLOCKING" | "WARNING";
  message: string;
  actionIndex?: number;
  episodeId?: string;
}

export interface TargetDescriptor {
  /** Visible text or accessible name demonstrated in the recording. */
  text?: string;
  /** Field label when the target is an input. */
  label?: string;
  /** Interaction role hint (button, link, textbox, ...) when the evidence states it. */
  role?: string;
  /** Only present when the evidence itself carried a concrete selector (e.g. DOM capture). */
  selector?: string;
}

export interface GroundedAction {
  index: number;
  action: CanonicalAction;
  rawAction: string;
  application: string;
  target?: TargetDescriptor;
  value?: string;
  url?: string;
  basis: EvidenceBasis;
  confidence: number;
  rationale?: string;
  irreversible: boolean;
  evidence: {
    episodeIds: string[];
    frameIds: string[];
    timestampStart?: number;
    timestampEnd?: number;
    corroboratingText: string[];
  };
}

export interface SuccessCriterion {
  id: string;
  type: "URL_CONTAINS" | "TEXT_VISIBLE";
  value: string;
  source: "USER_OBJECTIVE" | "DEMONSTRATION_FINAL_STATE";
  evidenceFrameIds: string[];
}

export interface CoverageReport {
  meaningfulTransitions: number;
  covered: number;
  uncovered: Array<{ episodeId: string; timestampStart: number; type: string; targetText?: string }>;
  fidelity: "COMPLETE" | "PARTIAL" | "UNKNOWN";
}

export interface GroundingReport {
  version: "grounding-1";
  objective: { text: string; source: "USER" | "MODEL" | "NONE" };
  destination?: { url: string; source: "NAVIGATE_ACTION" | "OCR" };
  actions: GroundedAction[];
  issues: GroundingIssue[];
  coverage: CoverageReport;
  successCriteria: SuccessCriterion[];
  blocking: boolean;
}

const ACTION_ALIASES: Array<[RegExp, CanonicalAction]> = [
  [/^(navigate|open_url|goto|go_to|browser_navigate|open_page|visit)/, "NAVIGATE"],
  [/^(type|enter|input|fill|enter_value|type_in_field|set_value|write)/, "TYPE"],
  [/^(select|choose|pick|select_option)/, "SELECT"],
  [/^(press|keypress|key_press|hotkey|submit_key)/, "KEYPRESS"],
  [/^(scroll)/, "SCROLL"],
  [/^(wait|wait_for)/, "WAIT"],
  [/^(verify|assert|confirm_state|check_state)/, "VERIFY"],
  [/^(extract|read|observe|inspect|record|read_data|read_field|copy_text)/, "EXTRACT"],
  [/^(click|tap|press_button|open|submit|double_click|toggle|check|uncheck|click_ui_element)/, "CLICK"]
];

/** Controls whose activation commits a change outside the browser session. */
const IRREVERSIBLE_PATTERN = /\b(submit|save|delete|remove|pay|purchase|buy|place order|checkout|confirm|send|transfer|approve|reject|publish|post|refund|cancel order|finali[sz]e|complete order|book|apply)\b/i;

export function normalizeActionType(raw: string): CanonicalAction {
  const key = String(raw || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!key) return "UNSUPPORTED";
  for (const [pattern, canonical] of ACTION_ALIASES) {
    if (pattern.test(key)) return canonical;
  }
  return "UNSUPPORTED";
}

export function normalizeText(text: unknown): string {
  return String(text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function textCorroborated(needle: string | undefined, haystack: string[]): string | undefined {
  const n = normalizeText(needle);
  if (n.length < 2) return undefined;
  return haystack.find(h => normalizeText(h).includes(n));
}

function parseHttpUrl(raw: unknown): URL | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const candidate = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
  try {
    const url = new URL(candidate);
    return url.hostname.includes(".") || url.hostname === "localhost" ? url : undefined;
  } catch {
    return undefined;
  }
}

/** Same site when one host is equal to, or a subdomain of, the other. */
export function sameSite(a: string, b: string): boolean {
  const ha = a.toLowerCase().replace(/^www\./, "");
  const hb = b.toLowerCase().replace(/^www\./, "");
  return ha === hb || ha.endsWith(`.${hb}`) || hb.endsWith(`.${ha}`);
}

export function isIrreversibleTarget(action: CanonicalAction, target?: TargetDescriptor, value?: string): boolean {
  if (action === "CLICK") return IRREVERSIBLE_PATTERN.test(`${target?.text || ""} ${target?.label || ""}`);
  if (action === "KEYPRESS") return /enter|return/i.test(value || "") && IRREVERSIBLE_PATTERN.test(`${target?.text || ""} ${target?.label || ""}`);
  return false;
}

function stripVerb(text: string): string {
  return text.replace(/^(?:click(?: on)?|press|tap|select|open|type(?: into)?|enter(?: into)?|fill(?: in)?)\s+/i, "")
    .replace(/\s+(?:button|link|field|input|tab|menu item)$/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

function buildTarget(action: SemanticAction, canonical: CanonicalAction): TargetDescriptor | undefined {
  const args = action.arguments || {};
  const text = [args.target, args.name, args.label, args.text].find(v => typeof v === "string" && v.trim());
  const descriptor: TargetDescriptor = {};
  if (typeof text === "string") {
    const cleaned = stripVerb(text);
    if (canonical === "TYPE" || canonical === "SELECT") descriptor.label = cleaned;
    else descriptor.text = cleaned;
  }
  if (typeof args.role === "string" && args.role.trim()) descriptor.role = args.role.trim().toLowerCase();
  // A selector is kept only if the evidence pipeline produced it; model-written CSS is a guess.
  if (typeof args.selector === "string" && args.selector.trim() && args.selectorSource === "DOM_EVIDENCE") {
    descriptor.selector = args.selector.trim();
  }
  return Object.keys(descriptor).length ? descriptor : undefined;
}

function frameIdsOf(episode: EvidenceEpisode): string[] {
  return [...episode.before.frames, ...episode.after.frames].map(f => f.frameId);
}

function episodeTexts(episode: EvidenceEpisode): string[] {
  const texts = [...episode.before.ocr, ...episode.after.ocr].map(o => o.text);
  if (episode.action.targetText) texts.push(episode.action.targetText);
  if (episode.action.value) texts.push(episode.action.value);
  if (episode.windowTitle) texts.push(episode.windowTitle);
  return texts;
}

export interface GroundingInput {
  actions: SemanticAction[];
  packet: SemanticEvidencePacket;
  ocrFacts: OcrFact[];
  userObjective?: string | undefined;
  modelObjective?: string | undefined;
  discardedNoise?: string[] | undefined;
  /** Frame ids that were sent to the vision model, labelled so it can cite them. */
  citedFrameIds?: string[] | undefined;
}

export function groundSemanticActions(input: GroundingInput): GroundingReport {
  const { actions, packet, ocrFacts } = input;
  const issues: GroundingIssue[] = [];
  const episodesById = new Map(packet.episodes.map(ep => [ep.episodeId, ep]));
  const knownFrameIds = new Set<string>([
    ...(input.citedFrameIds || []),
    ...(packet.keyFrames || []).map(f => f.frameId),
    ...packet.episodes.flatMap(frameIdsOf)
  ]);
  const allOcrTexts = ocrFacts.map(o => o.text).filter(t => typeof t === "string" && t.trim());
  const userObjective = (input.userObjective || "").trim();
  const modelObjective = (input.modelObjective || "").trim();
  const objective = userObjective
    ? { text: userObjective, source: "USER" as const }
    : modelObjective
      ? { text: modelObjective, source: "MODEL" as const }
      : { text: "", source: "NONE" as const };

  if (!objective.text) {
    issues.push({ code: "OBJECTIVE_MISSING", severity: "BLOCKING", message: "Neither the user nor the evidence established what the task is meant to achieve." });
  }
  if (!actions.length) {
    issues.push({ code: "NO_ACTIONS", severity: "BLOCKING", message: "No actions were reconstructed from the recording." });
  }

  const grounded: GroundedAction[] = actions.map((act, index) => {
    const canonical = normalizeActionType(act.action);
    const args = act.arguments || {};
    const refs = Array.isArray(act.evidenceEpisodeIds) ? act.evidenceEpisodeIds.map(String) : [];
    const episodeIds = refs.filter(r => episodesById.has(r));
    const frameIds = refs.filter(r => !episodesById.has(r) && knownFrameIds.has(r));
    const unknownRefs = refs.filter(r => !episodesById.has(r) && !knownFrameIds.has(r));
    if (unknownRefs.length) {
      issues.push({
        code: "UNKNOWN_EVIDENCE_REFERENCE",
        severity: "WARNING",
        actionIndex: index,
        message: `Action ${index + 1} cites evidence that does not exist in this recording (${unknownRefs.join(", ")}); the citation was ignored.`
      });
    }

    const referencedEpisodes = episodeIds.map(id => episodesById.get(id)!);
    const localTexts = referencedEpisodes.flatMap(episodeTexts);
    const target = buildTarget(act, canonical);
    const value = typeof args.value === "string" ? args.value : (args.value !== undefined && args.value !== null ? String(args.value) : undefined);
    const urlCandidate = parseHttpUrl(args.url);
    const targetText = target?.text || target?.label;

    const corroborating: string[] = [];
    const localHit = textCorroborated(targetText, localTexts);
    const globalHit = localHit ? undefined : textCorroborated(targetText, allOcrTexts);
    if (localHit) corroborating.push(localHit);
    if (globalHit) corroborating.push(globalHit);
    const valueHit = value ? textCorroborated(value, [...localTexts, ...allOcrTexts]) : undefined;
    if (valueHit) corroborating.push(valueHit);
    const urlHit = urlCandidate
      ? allOcrTexts.find(t => normalizeText(t).includes(urlCandidate.hostname.replace(/^www\./, "")))
      : undefined;
    if (urlHit) corroborating.push(urlHit);
    const objectiveMentions = Boolean(userObjective && (
      (targetText && normalizeText(userObjective).includes(normalizeText(targetText))) ||
      (value && normalizeText(userObjective).includes(normalizeText(value))) ||
      (urlCandidate && normalizeText(userObjective).includes(urlCandidate.hostname))
    ));

    const cited = episodeIds.length + frameIds.length > 0;
    const corroborated = Boolean(localHit || globalHit || valueHit || urlHit);
    const claimed = act.evidenceStatus;
    let basis: EvidenceBasis;
    if (cited && claimed === "OBSERVED") basis = "OBSERVED";
    else if (cited || corroborated) basis = "INFERRED";
    else if (objectiveMentions) basis = "REQUIRED_BY_OBJECTIVE";
    else basis = "UNSUPPORTED";

    const consequential = canonical === "CLICK" || canonical === "TYPE" || canonical === "SELECT" || canonical === "NAVIGATE" || canonical === "KEYPRESS";

    if (canonical === "UNSUPPORTED") {
      issues.push({
        code: "UNSUPPORTED_ACTION_TYPE",
        severity: "BLOCKING",
        actionIndex: index,
        message: `Action ${index + 1} ("${act.action}") cannot be performed by the current executor.`
      });
    }
    if (basis === "UNSUPPORTED") {
      issues.push({
        code: "UNGROUNDED_ACTION",
        severity: consequential ? "BLOCKING" : "WARNING",
        actionIndex: index,
        message: `Action ${index + 1} (${canonical}${targetText ? ` "${targetText}"` : ""}) has no supporting frame, episode, on-screen text, or task instruction.`
      });
    } else if (cited && targetText && !localHit && localTexts.length > 0 && consequential && canonical !== "NAVIGATE") {
      issues.push({
        code: "UNCORROBORATED_TARGET",
        severity: "WARNING",
        actionIndex: index,
        message: `Action ${index + 1} target "${targetText}" was not found in the on-screen text of the cited evidence.`
      });
    }
    if ((canonical === "CLICK" || canonical === "TYPE" || canonical === "SELECT") && !targetText && !target?.selector) {
      issues.push({ code: "MISSING_TARGET", severity: "BLOCKING", actionIndex: index, message: `Action ${index + 1} (${canonical}) does not identify which control it acts on.` });
    }
    if ((canonical === "TYPE" || canonical === "SELECT") && (value === undefined || value === "")) {
      const credential = /pass(word)?|pwd|otp|one[- ]time|pin\b/i.test(targetText || "");
      issues.push({
        code: "MISSING_VALUE",
        severity: credential ? "WARNING" : "BLOCKING",
        actionIndex: index,
        message: credential
          ? `Action ${index + 1} enters a credential; the value will be requested from a human at run time.`
          : `Action ${index + 1} enters data into "${targetText || "a field"}" but the value is not visible in the evidence.`
      });
    }
    if (canonical === "NAVIGATE" && !urlCandidate) {
      issues.push({ code: "UNGROUNDED_URL", severity: "BLOCKING", actionIndex: index, message: `Navigation action ${index + 1} has no readable destination URL.` });
    } else if (canonical === "NAVIGATE" && urlCandidate && !urlHit && !cited) {
      issues.push({ code: "UNGROUNDED_URL", severity: "BLOCKING", actionIndex: index, message: `Navigation target ${urlCandidate.hostname} does not appear anywhere in the recording.` });
    }

    const timestamps = referencedEpisodes.length
      ? { timestampStart: Math.min(...referencedEpisodes.map(e => e.timestampStart)), timestampEnd: Math.max(...referencedEpisodes.map(e => e.timestampEnd)) }
      : {};
    const evidenceFrameIds = Array.from(new Set([...frameIds, ...referencedEpisodes.flatMap(frameIdsOf)]));

    const groundedAction: GroundedAction = {
      index,
      action: canonical,
      rawAction: act.action,
      application: act.application || packet.activeApplication || "Browser",
      basis,
      confidence: typeof act.confidence === "number" ? act.confidence : 0,
      irreversible: isIrreversibleTarget(canonical, target, value),
      evidence: { episodeIds, frameIds: evidenceFrameIds, ...timestamps, corroboratingText: Array.from(new Set(corroborating)) }
    };
    if (target) groundedAction.target = target;
    if (value !== undefined) groundedAction.value = value;
    if (urlCandidate) groundedAction.url = urlCandidate.toString();
    if (act.rationale) groundedAction.rationale = act.rationale;
    return groundedAction;
  });

  // Conflicting values for the same field across non-adjacent edits.
  const lastValueByField = new Map<string, { value: string; index: number }>();
  for (const g of grounded) {
    if (g.action !== "TYPE" || !g.value) continue;
    const key = normalizeText(g.target?.label || g.target?.text);
    if (!key) continue;
    const prior = lastValueByField.get(key);
    if (prior && prior.value !== g.value && g.index - prior.index > 1) {
      issues.push({
        code: "CONFLICTING_VALUES",
        severity: "WARNING",
        actionIndex: g.index,
        message: `Field "${key}" receives "${prior.value}" at step ${prior.index + 1} and "${g.value}" at step ${g.index + 1}; confirm which value is intended.`
      });
    }
    lastValueByField.set(key, { value: g.value, index: g.index });
  }

  // Destination: the first navigation the evidence supports, otherwise none.
  const firstNav = grounded.find(g => g.action === "NAVIGATE" && g.url && g.basis !== "UNSUPPORTED");
  const destination = firstNav?.url ? { url: firstNav.url, source: "NAVIGATE_ACTION" as const } : undefined;
  const usesBrowser = grounded.some(g => /browser|web|chrome|edge|firefox|safari/i.test(g.application) && g.action !== "UNSUPPORTED");
  if (usesBrowser && !destination) {
    issues.push({
      code: "DESTINATION_UNKNOWN",
      severity: "BLOCKING",
      message: "The recording does not establish which web address the workflow starts from."
    });
  }
  if (destination && userObjective) {
    const objectiveHosts = (userObjective.match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/gi) || [])
      .map(parseHttpUrl).filter((u): u is URL => Boolean(u)).map(u => u.hostname);
    const destHost = new URL(destination.url).hostname;
    if (objectiveHosts.length && !objectiveHosts.some(h => sameSite(h, destHost))) {
      issues.push({
        code: "OBJECTIVE_CONFLICT",
        severity: "BLOCKING",
        message: `The task objective names ${objectiveHosts.join(", ")}, but the recording navigates to ${destHost}.`
      });
    }
  }

  const coverage = assessCoverage(packet.episodes, grounded, input.discardedNoise || []);
  for (const gap of coverage.uncovered) {
    issues.push({
      code: "UNCOVERED_TRANSITION",
      severity: "WARNING",
      episodeId: gap.episodeId,
      message: `A ${gap.type.toLowerCase()} at ${gap.timestampStart.toFixed(1)}s${gap.targetText ? ` on "${gap.targetText}"` : ""} is not represented in the workflow or explicitly discarded.`
    });
  }

  const report: GroundingReport = {
    version: "grounding-1",
    objective,
    actions: grounded,
    issues,
    coverage,
    successCriteria: deriveSuccessCriteria({ packet, ocrFacts, userObjective, destination: destination?.url }),
    blocking: issues.some(i => i.severity === "BLOCKING")
  };
  if (destination) report.destination = destination;
  if (coverage.fidelity === "COMPLETE" && grounded.some(g => g.basis === "UNSUPPORTED")) report.coverage.fidelity = "PARTIAL";
  return report;
}

const MEANINGFUL_EPISODE_TYPES = new Set(["CLICK", "TYPE", "NAVIGATE", "SELECT", "KEYPRESS", "HOTKEY"]);

/**
 * Compares observed action transitions with reconstructed actions. Several frames may describe one
 * action, so coverage is measured per episode (a before/action/after transition), not per frame.
 */
export function assessCoverage(episodes: EvidenceEpisode[], actions: GroundedAction[], discardedNoise: string[]): CoverageReport {
  const meaningful = episodes.filter(ep => MEANINGFUL_EPISODE_TYPES.has(ep.action.type) && ep.action.source !== "inferred");
  if (!meaningful.length) {
    return { meaningfulTransitions: 0, covered: 0, uncovered: [], fidelity: episodes.length ? "UNKNOWN" : "UNKNOWN" };
  }
  const cited = new Set(actions.flatMap(a => a.evidence.episodeIds));
  const actionTexts = actions.map(a => normalizeText(`${a.target?.text || ""} ${a.target?.label || ""} ${a.value || ""} ${a.url || ""}`));
  const discarded = discardedNoise.map(normalizeText);
  const uncovered: CoverageReport["uncovered"] = [];
  let covered = 0;
  for (const ep of meaningful) {
    const target = normalizeText(ep.action.targetText || ep.action.value);
    const matchedByText = target.length >= 3 && actionTexts.some(t => t.includes(target) || (t.length >= 3 && target.includes(t.trim())));
    const discardedExplicitly = target.length >= 3 && discarded.some(d => d.includes(target));
    if (cited.has(ep.episodeId) || matchedByText || discardedExplicitly) {
      covered++;
    } else {
      const gap: CoverageReport["uncovered"][number] = { episodeId: ep.episodeId, timestampStart: ep.timestampStart, type: ep.action.type };
      if (ep.action.targetText) gap.targetText = ep.action.targetText;
      uncovered.push(gap);
    }
  }
  return {
    meaningfulTransitions: meaningful.length,
    covered,
    uncovered,
    fidelity: uncovered.length ? "PARTIAL" : "COMPLETE"
  };
}

const CONFIRMATION_PATTERN = /\b(success(fully)?|saved|updated|submitted|completed?|confirmed|created|added|thank you|order (number|#)|has been)\b/i;

/**
 * Success conditions come from the demonstrated final state or the user's explicit objective.
 * A model's description of the expected outcome is not used unless the final frames show it.
 */
export function deriveSuccessCriteria(input: {
  packet: SemanticEvidencePacket;
  ocrFacts: OcrFact[];
  userObjective?: string | undefined;
  destination?: string | undefined;
}): SuccessCriterion[] {
  const criteria: SuccessCriterion[] = [];
  const timed = input.ocrFacts.filter(o => typeof o.timestamp === "number" && typeof o.text === "string");
  if (!timed.length) return criteria;
  const end = Math.max(...timed.map(o => o.timestamp!));
  const start = Math.min(...timed.map(o => o.timestamp!));
  const span = Math.max(1, end - start);
  const finalWindow = timed.filter(o => o.timestamp! >= end - Math.min(3, span * 0.15));
  const earlyTexts = new Set(timed.filter(o => o.timestamp! <= start + Math.min(3, span * 0.15)).map(o => normalizeText(o.text)));

  const seen = new Set<string>();
  for (const fact of finalWindow) {
    const text = fact.text.trim();
    const norm = normalizeText(text);
    if (!text || text.length > 80 || seen.has(norm) || earlyTexts.has(norm)) continue;
    if (!CONFIRMATION_PATTERN.test(text)) continue;
    // Literal identifiers (order numbers, timestamps) differ on every run; keep only stable wording.
    if (/\d{3,}/.test(text)) continue;
    seen.add(norm);
    criteria.push({
      id: `sc_text_${criteria.length + 1}`,
      type: "TEXT_VISIBLE",
      value: text,
      source: "DEMONSTRATION_FINAL_STATE",
      evidenceFrameIds: fact.frameId ? [fact.frameId] : []
    });
  }

  if (input.destination) {
    const destHost = new URL(input.destination).hostname;
    const finalUrls = finalWindow
      .map(f => parseHttpUrl((f.text.match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s]*)?/i) || [])[0]))
      .filter((u): u is URL => Boolean(u) && sameSite(u!.hostname, destHost));
    const finalUrl = finalUrls[finalUrls.length - 1];
    if (finalUrl && finalUrl.pathname && finalUrl.pathname !== "/") {
      criteria.push({
        id: `sc_url_${criteria.length + 1}`,
        type: "URL_CONTAINS",
        value: finalUrl.pathname.replace(/\/$/, ""),
        source: "DEMONSTRATION_FINAL_STATE",
        evidenceFrameIds: finalWindow.filter(f => f.text.includes(finalUrl.hostname)).map(f => f.frameId!).filter(Boolean)
      });
    }
  }

  const expected = (input.userObjective || "").match(/(?:expect(?:ed)?|until|confirm(?:ation)?|should (?:show|display|see))[^"“]*["“]([^"”]{3,80})["”]/i);
  if (expected?.[1]) {
    criteria.push({ id: `sc_user_${criteria.length + 1}`, type: "TEXT_VISIBLE", value: expected[1].trim(), source: "USER_OBJECTIVE", evidenceFrameIds: [] });
  }
  return criteria;
}

/**
 * Refines a model-transcribed URL with OCR of the address bar, without moving the navigation
 * somewhere else: an OCR URL is used only when it is the same site and either names a more
 * specific host (docs.google.com for google.com) or extends the transcribed path. When OCR carries
 * timestamps, only text visible up to shortly after the navigation counts, so a later page of the
 * same site is never mistaken for the starting address.
 */
export function refineUrlWithOcr(
  modelUrl: string | undefined,
  ocrUrls: Array<string | { url: string; timestamp?: number | undefined }>,
  navigationEndTimestamp?: number
): string | undefined {
  const base = parseHttpUrl(modelUrl);
  if (!base) return undefined;
  const basePath = base.pathname.replace(/\/$/, "");
  const candidates = ocrUrls
    .map(entry => (typeof entry === "string" ? { url: entry, timestamp: undefined } : entry))
    .filter(entry => navigationEndTimestamp === undefined || entry.timestamp === undefined || entry.timestamp <= navigationEndTimestamp + 2)
    .map(entry => parseHttpUrl(entry.url))
    .filter((u): u is URL => Boolean(u) && sameSite(u!.hostname, base.hostname))
    .filter(u => {
      const moreSpecificHost = u.hostname.split(".").length > base.hostname.split(".").length;
      const extendsPath = u.hostname === base.hostname && u.pathname.replace(/\/$/, "").startsWith(basePath) && u.pathname.length > base.pathname.length;
      return moreSpecificHost || extendsPath;
    });
  if (!candidates.length) return base.toString();
  const score = (u: URL) => u.hostname.split(".").length * 10_000 + u.pathname.length;
  return candidates.sort((a, b) => score(b) - score(a))[0]!.toString();
}
