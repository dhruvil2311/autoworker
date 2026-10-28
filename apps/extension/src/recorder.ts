import { safeInputPayload } from "./privacy.js";

type RecorderState = "IDLE" | "RECORDING" | "PAUSED" | "STOPPING" | "UPLOADING" | "COMPLETED" | "FAILED";

let state: RecorderState = "IDLE";
let sequence = 0;

function selectorCandidates(element: Element) {
  const candidates = [];
  const html = element as HTMLElement;
  if (html.dataset.testid) candidates.push({ strategy: "testid", value: `[data-testid="${CSS.escape(html.dataset.testid)}"]`, confidence: 0.95 });
  if (html.id) candidates.push({ strategy: "css", value: `#${CSS.escape(html.id)}`, confidence: 0.9 });
  const name = element.getAttribute("aria-label") ?? html.innerText?.trim();
  if (name) candidates.push({ strategy: "text", value: name.slice(0, 200), confidence: 0.65 });
  candidates.push({ strategy: "css", value: element.tagName.toLowerCase(), confidence: 0.25 });
  return candidates.slice(0, 8);
}

function targetEvidence(element: Element) {
  const html = element as HTMLElement;
  return {
    tag: element.tagName.toLowerCase(),
    role: element.getAttribute("role") ?? undefined,
    accessible_name: element.getAttribute("aria-label") ?? undefined,
    text: html.innerText?.trim().slice(0, 1000) || undefined,
    selector_candidates: selectorCandidates(element),
    attributes: {
      id: html.id,
      name: (element as HTMLInputElement).name,
      type: (element as HTMLInputElement).type,
      placeholder: (element as HTMLInputElement).placeholder
    },
    nearby_context: [html.closest("form")?.getAttribute("aria-label") ?? "", html.closest("form")?.id ?? ""].filter(Boolean)
  };
}

async function emit(event: Record<string, unknown>) {
  if (state !== "RECORDING") return;
  sequence += 1;
  await chrome.runtime.sendMessage({
    kind: "recording:event",
    event: {
      event_id: crypto.randomUUID(),
      sequence,
      timestamp: new Date().toISOString(),
      page: { url: location.href, title: document.title },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      browser: { user_agent: navigator.userAgent },
      screenshot_reference: null,
      ...event
    }
  });
}

export function startRecorder() {
  if (state === "RECORDING") return;
  state = "RECORDING";
  sequence = 0;
}

export function pauseRecorder() {
  if (state === "RECORDING") {
    state = "PAUSED";
  }
}

export function resumeRecorder() {
  if (state === "PAUSED") {
    state = "RECORDING";
  }
}

export function stopRecorder() {
  state = "STOPPING";
}

document.addEventListener(
  "click",
  (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    void emit({ event_type: "click", target: targetEvidence(target), input: null });
  },
  true
);

document.addEventListener(
  "input",
  (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
    void emit({ event_type: "input", target: targetEvidence(target), input: safeInputPayload(target) });
  },
  true
);

document.addEventListener(
  "change",
  (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
    void emit({ event_type: "change", target: targetEvidence(target), input: safeInputPayload(target) });
  },
  true
);

document.addEventListener(
  "keydown",
  (event) => {
    if (!(["Enter", "Tab", "Escape"].includes(event.key))) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    void emit({ event_type: "keyboard", target: targetEvidence(target), input: { value: event.key } });
  },
  true
);

document.addEventListener(
  "submit",
  (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    void emit({ event_type: "submit", target: targetEvidence(target), input: null });
  },
  true
);

window.addEventListener("hashchange", () => void emit({ event_type: "url_change", input: null }));
window.addEventListener("popstate", () => void emit({ event_type: "navigation", input: null }));
