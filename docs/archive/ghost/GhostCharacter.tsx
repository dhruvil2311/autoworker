import React from "react";
import { FileText, Loader2, MousePointer2, HelpCircle, Sparkles, CheckCircle2, XCircle, Clock } from "lucide-react";

export type GhostState =
  | "idle"
  | "entering"
  | "learning"
  | "thinking"
  | "working"
  | "waiting"
  | "needs-you"
  | "learned"
  | "success"
  | "failed";

const STATE_COLOR: Record<GhostState, string> = {
  idle: "#6bd8cb",
  entering: "#6bd8cb",
  learning: "#6bd8cb",
  thinking: "#6bd8cb",
  working: "#6bd8cb",
  waiting: "#879391",
  "needs-you": "#ee9800",
  learned: "#10b981",
  success: "#10b981",
  failed: "#ef4444"
};

const STATE_LABEL: Record<GhostState, string> = {
  idle: "Idle",
  entering: "Arriving",
  learning: "Learning",
  thinking: "Thinking",
  working: "Working",
  waiting: "Waiting",
  "needs-you": "Needs you",
  learned: "Learned",
  success: "Success",
  failed: "Failed"
};

const BADGE_ICON: Partial<Record<GhostState, React.ComponentType<any>>> = {
  learning: FileText,
  thinking: Loader2,
  working: MousePointer2,
  waiting: Clock,
  "needs-you": HelpCircle,
  learned: Sparkles,
  success: CheckCircle2,
  failed: XCircle
};

export function GhostCharacter({
  state,
  size = 140,
  showLabel = false,
  hideBadge = false,
  className = ""
}: {
  state: GhostState;
  size?: number;
  showLabel?: boolean;
  hideBadge?: boolean;
  className?: string;
}) {
  const color = STATE_COLOR[state];
  const Badge = BADGE_ICON[state];
  const turned = state === "needs-you";
  const drooped = state === "failed";
  const alert = state === "needs-you";

  return (
    <div className={`ghost-char inline-flex flex-col items-center gap-2 ${className}`} style={{ width: size }}>
      <div
        className={`ghost-char-body ${alert ? "ghost-char-alert" : ""} ${drooped ? "ghost-char-droop" : ""}`}
        style={{
          width: size,
          height: size * 1.1,
          transform: turned ? "rotate(-4deg)" : undefined,
          transition: "transform 0.6s cubic-bezier(.34,1.56,.64,1)"
        }}
      >
        <svg viewBox="0 0 200 220" width="100%" height="100%" style={{ overflow: "visible" }}>
          <defs>
            <filter id="ghost-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="9" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="ghost-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e5e1e4" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#e5e1e4" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Ambient status glow behind the body — the only color signal that changes broadly */}
          <ellipse cx="100" cy="120" rx="70" ry="80" fill={color} opacity="0.16" filter="url(#ghost-glow)" className="ghost-char-glow" />

          {/* Body: translucent, blurred, bordered — literally the same glass material as the app's panels */}
          <path
            className="ghost-char-body-path"
            d="M50,178
               L50,118
               A50,78 0 0 1 150,118
               L150,178
               C150,178 141,163 133,178
               C125,193 117,163 108,178
               C100,193 92,163 83,178
               C75,193 67,163 58,178
               C55,181 52,180 50,178 Z"
            fill="url(#ghost-fill)"
            stroke={color}
            strokeOpacity="0.55"
            strokeWidth="1.75"
            style={{ backdropFilter: "blur(6px)", transition: "stroke 0.5s ease" }}
          />

          {/* Eyes — the only element that swaps per state, everything else is continuous */}
          <g className="ghost-char-eyes">
            {state === "learning" && (
              <>
                <rect x="70" y="104" width="18" height="7" rx="3.5" fill={color} className="ghost-eye-scan-l" />
                <rect x="112" y="104" width="18" height="7" rx="3.5" fill={color} className="ghost-eye-scan-r" />
              </>
            )}
            {state === "thinking" && (
              <>
                <path d="M70,110 Q79,102 88,110" stroke={color} strokeWidth="4" strokeLinecap="round" fill="none" />
                <path d="M112,110 Q121,102 130,110" stroke={color} strokeWidth="4" strokeLinecap="round" fill="none" />
              </>
            )}
            {state === "needs-you" && (
              <>
                <path d="M68,106 Q79,98 90,104" stroke={color} strokeWidth="4" strokeLinecap="round" fill="none" />
                <circle cx="121" cy="108" r="6.5" fill={color} />
              </>
            )}
            {(state === "success" || state === "learned") && (
              <>
                <path d="M70,110 Q79,100 88,110" stroke={color} strokeWidth="4.5" strokeLinecap="round" fill="none" />
                <path d="M112,110 Q121,100 130,110" stroke={color} strokeWidth="4.5" strokeLinecap="round" fill="none" />
              </>
            )}
            {state === "failed" && (
              <>
                <rect x="70" y="108" width="18" height="4" rx="2" fill={color} />
                <rect x="112" y="108" width="18" height="4" rx="2" fill={color} />
              </>
            )}
            {(state === "idle" || state === "entering" || state === "waiting" || state === "working") && (
              <>
                <circle cx="79" cy="109" r="6.5" fill={color} className="ghost-eye-blink" />
                <circle cx="121" cy="109" r="6.5" fill={color} className="ghost-eye-blink" style={{ animationDelay: "0.15s" }} />
              </>
            )}
          </g>
        </svg>

        {Badge && !hideBadge && (
          <div
            className="ghost-char-badge"
            style={{ background: color }}
          >
            <Badge size={13} strokeWidth={2.5} className={state === "thinking" ? "animate-spin" : ""} color="#0e0e10" />
          </div>
        )}
      </div>
      {showLabel && (
        <span className="font-label-caps text-[10px] tracking-wider font-bold" style={{ color }}>
          {STATE_LABEL[state].toUpperCase()}
        </span>
      )}
    </div>
  );
}
