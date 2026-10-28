import React, { useEffect, useState } from "react";
import { GhostCharacter, type GhostState } from "./GhostCharacter.js";
import { FileText, MessageSquare, Globe, CheckCircle2 } from "lucide-react";

type Beat = {
  state: GhostState;
  title: string;
  caption: string;
  scene: "evidence" | "chat" | "browser" | "success";
};

const BEATS: Beat[] = [
  { state: "entering", title: "You hire Ghost", caption: "A new digital worker joins your team — no process yet, just ready to learn.", scene: "evidence" },
  { state: "learning", title: "It reads your evidence", caption: "Upload an SOP, a spreadsheet, a screenshot. Ghost reads it like a new hire would.", scene: "evidence" },
  { state: "thinking", title: "Evidence becomes rules", caption: "\"Refunds only within 30 days.\" Ghost turns what it read into a real workflow.", scene: "chat" },
  { state: "working", title: "It does the task", caption: "Ghost opens the browser and works through the steps itself — for real.", scene: "browser" },
  { state: "needs-you", title: "It hits something new", caption: "An order is outside policy. Ghost pauses and asks, instead of guessing.", scene: "chat" },
  { state: "learned", title: "You correct it", caption: "\"Final sale items can't be refunded.\" Ghost saves that as a rule, permanently.", scene: "chat" },
  { state: "success", title: "It just works, next time", caption: "The workflow updates itself. The same situation never needs you again.", scene: "success" }
];

function EvidenceScene({ active }: { active: boolean }) {
  return (
    <div className={`flex items-center gap-3 bg-surface-container-lowest border border-outline-variant/25 rounded-lg px-4 py-3 transition-all duration-500 ${active ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>
      <FileText size={18} className="text-primary shrink-0" />
      <div className="text-left">
        <div className="text-xs font-bold text-on-surface">refund_policy.pdf</div>
        <div className="text-[11px] text-on-surface-variant">Extracting rules from 3 pages…</div>
      </div>
    </div>
  );
}

function ChatScene({ active, text, isCorrection }: { active: boolean; text: string; isCorrection?: boolean }) {
  return (
    <div className={`flex items-start gap-2 transition-all duration-500 ${active ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>
      <MessageSquare size={16} className={`shrink-0 mt-1 ${isCorrection ? "text-secondary-container" : "text-primary"}`} />
      <div className={`text-left text-xs px-3 py-2 rounded-lg rounded-tl-sm border ${isCorrection ? "bg-secondary-container/10 border-secondary-container/30 text-on-surface" : "bg-surface-container-lowest border-outline-variant/25 text-on-surface-variant"}`}>
        {text}
      </div>
    </div>
  );
}

function BrowserScene({ active }: { active: boolean }) {
  return (
    <div className={`w-full max-w-[220px] rounded-lg border border-outline-variant/25 bg-surface-container-lowest overflow-hidden transition-all duration-500 ${active ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-outline-variant/20 bg-surface-container">
        <Globe size={11} className="text-on-surface-variant" />
        <div className="h-1.5 w-16 rounded-full bg-outline-variant/30" />
      </div>
      <div className="p-3 flex flex-col gap-1.5">
        <div className="h-1.5 w-3/4 rounded-full bg-outline-variant/20" />
        <div className="h-1.5 w-1/2 rounded-full bg-outline-variant/20" />
        <div className="h-5 w-14 rounded bg-primary/25 border border-primary/40 mt-1" />
      </div>
    </div>
  );
}

function SuccessScene({ active }: { active: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-primary transition-all duration-500 ${active ? "opacity-100 scale-100" : "opacity-0 scale-90"}`}>
      <CheckCircle2 size={18} />
      <span className="text-xs font-bold">Refund processed automatically</span>
    </div>
  );
}

export function GhostStory() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % BEATS.length), 3200);
    return () => clearInterval(id);
  }, []);

  const beat = BEATS[index]!;

  return (
    <div className="glass-panel rounded-2xl border border-outline-variant/20 p-8 md:p-10 grid md:grid-cols-[auto_1fr] gap-8 items-center">
      <div className="flex flex-col items-center gap-3 mx-auto">
        <GhostCharacter state={beat.state} size={128} showLabel />
      </div>

      <div className="flex flex-col gap-5 min-h-[132px]">
        <div>
          <div className="font-headline-md text-lg font-bold text-on-surface mb-1.5">{beat.title}</div>
          <p className="text-sm text-on-surface-variant leading-relaxed max-w-[440px]">{beat.caption}</p>
        </div>

        <div className="h-[62px] flex items-center">
          {beat.scene === "evidence" && <EvidenceScene active={true} />}
          {beat.scene === "chat" && (
            <ChatScene
              active={true}
              text={beat.state === "learned" ? "Final sale items can't be refunded." : "This order is past the 30-day window — need your call."}
              isCorrection={beat.state === "learned"}
            />
          )}
          {beat.scene === "browser" && <BrowserScene active={true} />}
          {beat.scene === "success" && <SuccessScene active={true} />}
        </div>

        <div className="flex gap-1.5">
          {BEATS.map((b, i) => (
            <button
              key={b.title}
              onClick={() => setIndex(i)}
              aria-label={b.title}
              className={`h-1 rounded-full transition-all duration-300 ${i === index ? "w-8 bg-primary" : "w-3 bg-outline-variant/30 hover:bg-outline-variant/50"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
