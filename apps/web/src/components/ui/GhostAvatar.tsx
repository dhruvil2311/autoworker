import React from "react";
import { WorkCore3D } from "../WorkCore3D.js";

export function WorkerCoreAvatar({ size = 40 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "var(--r-md)",
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.07)",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      <WorkCore3D state="DORMANT" hideBloom />
    </div>
  );
}

export const GhostAvatar = WorkerCoreAvatar;
