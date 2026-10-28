import React from "react";

export type WorkerStatus =
  | "NEW" | "LEARNING" | "NEEDS_CLARIFICATION" | "READY"
  | "ACTIVE" | "RUNNING" | "WAITING_FOR_HUMAN" | "FAILED" | "PAUSED";

export const STATUS_LABELS: Record<WorkerStatus, string> = {
  NEW: "New",
  LEARNING: "Learning",
  NEEDS_CLARIFICATION: "Needs Clarification",
  READY: "Ready",
  ACTIVE: "Active",
  RUNNING: "Running",
  WAITING_FOR_HUMAN: "Waiting for Human",
  FAILED: "Failed",
  PAUSED: "Paused"
};

export const STATUS_COLORS: Record<WorkerStatus, string> = {
  NEW: "rgba(180, 178, 190, 0.55)", // aw-coolgray
  LEARNING: "#8b64d4", // aw-purple
  NEEDS_CLARIFICATION: "#e8942a", // aw-amber
  READY: "#1db87a", // aw-green
  ACTIVE: "#00c2d4", // aw-teal
  RUNNING: "#00c2d4", // aw-teal
  WAITING_FOR_HUMAN: "#e8942a", // aw-amber
  FAILED: "#d64040", // aw-red
  PAUSED: "rgba(180, 178, 190, 0.55)" // aw-coolgray
};

export function StatusBadge({ status }: { status: WorkerStatus | string }) {
  const color = STATUS_COLORS[status as WorkerStatus] || "rgba(180, 178, 190, 0.55)";
  const label = STATUS_LABELS[status as WorkerStatus] || status;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "3px 8px",
        borderRadius: "4px",
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
        color: color,
        fontSize: "10px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        fontFamily: "var(--font-body)"
      }}
    >
      <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

export function RunStateBadge({ state }: { state: string }) {
  let color = "rgba(180, 178, 190, 0.55)";
  if (["SUCCEEDED", "SUCCESS"].includes(state)) color = "#1db87a";
  else if (["FAILED", "TIMED_OUT", "CANCELLED", "ERROR"].includes(state)) color = "#d64040";
  else if (["WAITING_FOR_HUMAN", "NEEDS_ATTENTION", "HUMAN_CONTROL_ACTIVE"].includes(state)) color = "#e8942a";
  else if (["RUNNING", "STARTING", "RESUMING", "ACTIVE"].includes(state)) color = "#00c2d4";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "3px 8px",
        borderRadius: "4px",
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
        color: color,
        fontSize: "10px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        fontFamily: "var(--font-body)"
      }}
    >
      <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: color }} />
      {state.replace(/_/g, " ")}
    </span>
  );
}
