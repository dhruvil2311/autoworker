import { describe, expect, it } from "vitest";
import { DesktopEvidenceBridge } from "./desktop-evidence-bridge.js";

describe("DesktopEvidenceBridge workflow grounding", () => {
  it("does not invent navigation, clicks, or verification when extraction found no actions", () => {
    const bridge = DesktopEvidenceBridge.getInstance();
    const demo = bridge.toNormalizedDemonstration({
      media_id: "recording-empty",
      mediaPath: "unreadable.webm",
      process_understanding: { task_intent: "Unknown task" },
      timeline: {
        applications_detected: ["Browser"],
        states: [{ browser_url: "https://example.test/" }]
      },
      semantic_actions: []
    }, "tenant-test");

    expect(demo.observations).toEqual([]);
  });

  it("preserves only actions extracted from the recording", () => {
    const bridge = DesktopEvidenceBridge.getInstance();
    const demo = bridge.toNormalizedDemonstration({
      media_id: "recording-with-action",
      mediaPath: "observed.webm",
      timeline: { states: [{ browser_url: "https://example.test/" }] },
      semantic_actions: [{
        action_type: "CLICK",
        summary: "Click Save",
        target_description: "Save button",
        parameters: { selector: "button[data-action='save']" },
        confidence: 0.93,
        start_timestamp: 3.2,
        provenance: { frame_ids: ["frame-3"] }
      }]
    }, "tenant-test");

    expect(demo.observations).toHaveLength(1);
    expect(demo.observations[0]?.context.url).toBe("https://example.test/");
    expect(demo.observations[0]?.target?.dom_evidence.attributes.selector).toBe("button[data-action='save']");
  });

  it("uses the full OCR-visible host when the local URL summary drops its subdomain", () => {
    const bridge = DesktopEvidenceBridge.getInstance();
    const demo = bridge.toNormalizedDemonstration({
      media_id: "recording-url-host",
      mediaPath: "fulfillment.webm",
      process_understanding: { task_intent: "Review a fulfillment sheet", detected_url: "https://google.com/spreadsheets/d/abc" },
      timeline: {
        applications_detected: ["Browser"],
        states: [{ browser_url: "https://google.com/spreadsheets/d/abc", visible_texts: ["docs.google.com/spreadsheets/d/abc123/edit"] }]
      },
      semantic_actions: [{ action_type: "NAVIGATE_WEB", summary: "Open sheet", parameters: { url: "https://google.com/spreadsheets/d/abc" } }]
    }, "tenant-test");

    expect(demo.observations[0]?.context.url).toBe("https://docs.google.com/spreadsheets/d/abc123/edit");
  });

  it("does not return an in-memory job to a different tenant", () => {
    const bridge = DesktopEvidenceBridge.getInstance();
    (bridge as any).jobs.set("tenant-bound-job", {
      jobId: "tenant-bound-job",
      tenantId: "tenant-a",
      workerId: "worker-a",
      status: "COMPLETED",
      progressPercent: 100,
      currentStage: "COMPLETE",
      mediaPath: "private.webm",
      mediaType: "VIDEO",
      result: { tenant_id: "tenant-a", semantic_actions: [] },
      createdAt: new Date().toISOString()
    });

    expect(bridge.getJob("tenant-bound-job", "tenant-a")?.workerId).toBe("worker-a");
    expect(bridge.getJob("tenant-bound-job", "tenant-b")).toBeUndefined();
  });
});
