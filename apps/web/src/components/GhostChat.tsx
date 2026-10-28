import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Send, ShieldAlert, User } from "lucide-react";
import { api } from "../api.js";
import { WorkCore3D } from "./WorkCore3D.js";

type WorkerMessage = {
  role: "user" | "worker";
  text: string;
  data?: any;
};

export function WorkerChat({
  workerId,
  onInstructionAdded,
  onAllGapsResolved,
}: {
  workerId: string;
  onInstructionAdded: () => void;
  onAllGapsResolved?: () => void;
}) {
  const [messages, setMessages] = useState<WorkerMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [gaps, setGaps] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevCounts = useRef({ messages: 0, gaps: 0 });

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const grew =
      messages.length > prevCounts.current.messages ||
      gaps.length > prevCounts.current.gaps;
    const isFirstContent =
      prevCounts.current.messages === 0 &&
      prevCounts.current.gaps === 0 &&
      (messages.length > 0 || gaps.length > 0);
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 150;

    prevCounts.current = { messages: messages.length, gaps: gaps.length };

    if (grew && (isFirstContent || isNearBottom)) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, gaps]);

  useEffect(() => {
    let active = true;

    const pollGaps = async () => {
      try {
        const worker = await api.getWorker(workerId);
        if (!active) return;

        if (worker.status === "NEEDS_CLARIFICATION") {
          const res = await api.getGaps(workerId);
          if (active) setGaps(res.gaps?.filter((g: any) => !g.resolved) || []);
        } else {
          setGaps([]);
        }
      } catch {
        if (active) setGaps([]);
      }
    };

    pollGaps();
    const intervalId = window.setInterval(pollGaps, 1500);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [workerId]);

  const handleAnswerGap = async (gapId: string, answerText: string) => {
    if (!answerText.trim()) return;

    try {
      setSending(true);
      const answer = answerText.trim();
      const res = await api.answerGap(workerId, gapId, { type: "TEXT", value: answer, answer: answer, answer_type: "TEXT" });

      setMessages((prev) => [...prev, { role: "user", text: answer }]);

      let workerResponse: string;
      if (res.recompile_error) {
        workerResponse = `I saved that correction, but rebuilding the workflow failed: ${res.recompile_error}. Nothing is live yet.`;
      } else if (res.recompiled || res.remaining_gaps === 0) {
        workerResponse =
          "Correction received. Memory updated. The workflow is rebuilt and ready to run!";
      } else if (res.status === "NEEDS_CLARIFICATION") {
        workerResponse = `Saved. I still have ${res.remaining_gaps} more question${
          res.remaining_gaps === 1 ? "" : "s"
        } before I can rebuild the workflow.`;
      } else {
        workerResponse = "Saved that answer.";
      }

      setMessages((prev) => [...prev, { role: "worker", text: workerResponse, data: res }]);
      setGaps((prev) => prev.filter((gap) => (gap.gap_id || gap.id) !== gapId));
      onInstructionAdded();

      if ((res.recompiled || res.remaining_gaps === 0) && onAllGapsResolved) {
        setTimeout(() => {
          onAllGapsResolved();
        }, 1200);
      }
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: "worker", text: `I could not save that clarification: ${e.message}` },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || sending) return;

    const message = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: message }]);
    setSending(true);

    try {
      const res = await api.sendChatInstruction(workerId, message);

      let workerResponse: string;
      if (res.recompile_error) {
        workerResponse = `I saved that, but rebuilding the workflow failed: ${res.recompile_error}. The active workflow has not changed yet.`;
      } else if (res.workflow_updated) {
        workerResponse = res.extractedRules?.length
          ? "Understood. I added that rule, updated memory, and rebuilt the workflow."
          : "Workflow rebuilt and ready.";
      } else if (res.blocking_gaps > 0) {
        workerResponse = `Saved. I still need ${res.blocking_gaps} clarification${
          res.blocking_gaps > 1 ? "s" : ""
        } before I can rebuild the workflow.`;
      } else if (res.extractedRules?.length > 0) {
        workerResponse =
          "I extracted a rule from that. The current workflow did not need to change.";
      } else {
        workerResponse =
          "Noted. I did not find an actionable rule or correction in that message, so memory and workflow stayed the same.";
      }

      setMessages((prev) => [...prev, { role: "worker", text: workerResponse, data: res }]);
      onInstructionAdded();
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: "worker", text: `I could not apply that instruction: ${e.message}` },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col relative" style={{ background: "rgba(8,8,12,0.25)" }}>
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
        {messages.length === 0 && gaps.length === 0 && (
          <div className="mt-6 flex flex-col items-center text-center text-sm" style={{ color: "var(--aw-coolgray)" }}>
            <div className="h-16 w-16">
              <WorkCore3D state="DORMANT" hideBloom />
            </div>
            <p className="mt-2">
              Tell this worker about exceptions, rules,
              <br />
              or corrections to the process.
            </p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={`${msg.role}-${idx}`}
            className={`flex max-w-[85%] items-start gap-3 ${
              msg.role === "user" ? "self-end" : "self-start"
            }`}
          >
            {msg.role === "worker" && (
              <div className="h-8 w-8 shrink-0">
                <WorkCore3D state="DORMANT" hideBloom />
              </div>
            )}

            <div className={`flex flex-col gap-2 ${msg.role === "user" ? "items-end" : "items-start"}`}>
              <div
                className="p-4 text-sm leading-relaxed"
                style={{
                  borderRadius: msg.role === "user" ? "12px 4px 12px 12px" : "4px 12px 12px 12px",
                  background: msg.role === "user" ? "var(--aw-offwhite)" : "rgba(255,255,255,0.035)",
                  color: msg.role === "user" ? "var(--aw-obsidian)" : "rgba(240,238,235,0.78)",
                  border: msg.role === "user" ? "none" : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {msg.text}
              </div>

              {msg.data?.extractedRules?.map((rule: string, ruleIdx: number) => (
                <div
                  key={`${rule}-${ruleIdx}`}
                  className="mt-1 w-full p-3 text-xs"
                  style={{
                    background: "rgba(0,194,212,0.06)",
                    border: "1px solid rgba(0,194,212,0.18)",
                    borderLeft: "2px solid var(--aw-teal)",
                    borderRadius: 8,
                    color: "var(--aw-coolgray)",
                  }}
                >
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--aw-teal)" }}>
                    Rule added to memory
                  </div>
                  {rule}
                </div>
              ))}

              {(msg.data?.recompiled || msg.data?.workflow_updated) && (
                <div className="mt-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--aw-teal)" }}>
                  <CheckCircle2 size={13} />
                  Memory updated | workflow rebuilt
                </div>
              )}
            </div>

            {msg.role === "user" && (
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  color: "var(--aw-coolgray)",
                }}
              >
                <User size={16} />
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex items-center gap-3 self-start" style={{ color: "var(--aw-coolgray)" }}>
            <div className="h-8 w-8 shrink-0">
              <WorkCore3D state="UNDERSTANDING" hideBloom />
            </div>
            <div className="rounded-xl rounded-tl-sm px-4 py-3" style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <Loader2 size={16} className="animate-spin" style={{ color: "var(--aw-teal)" }} />
            </div>
          </div>
        )}

        {gaps.map((gap, gIdx) => {
          const gapId = gap.gap_id || gap.id || `gap_${gIdx}`;
          const rawQ = gap.question || gap.suggested_question?.question_text || gap.description || "";
          const isRawId = !rawQ || 
                          rawQ.startsWith("gap_") || 
                          rawQ.startsWith("GAP_") || 
                          !rawQ.includes(" ") || 
                          /^[a-z0-9_-]+$/i.test(rawQ) || 
                          /\b(?:msg|message|id|code|err)[_\s-]*\d{3,}\b/i.test(rawQ) || 
                          /^message\s*id\b/i.test(rawQ) || 
                          /^\d+$/.test(rawQ);
          const questionText = isRawId 
            ? (gap.target?.includes("login") || gapId.includes("auth") 
                ? "The demonstration showed an authentication step on the login page. What credentials or sign-in procedure should the autoworker follow?" 
                : "The autoworker encountered an ambiguous step in the demonstration. What solution or action should be performed here?")
            : rawQ;
          const options: string[] = gap.suggested_question?.suggested_options || [];

          return (
            <div key={gapId} className="flex max-w-[90%] items-start gap-3 self-start">
              <div className="h-11 w-11 shrink-0 -mt-1">
                <WorkCore3D state="NEEDS_HELP" hideBloom />
              </div>
              <div
                className="rounded-xl rounded-tl-sm p-5 text-sm w-full"
                style={{
                  background: "rgba(232,148,42,0.06)",
                  border: "1px solid rgba(232,148,42,0.28)",
                  color: "var(--aw-offwhite)",
                }}
              >
                <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--aw-amber)" }}>
                  <ShieldAlert size={12} />
                  Autoworker needs you
                </div>
                
                <div className="mb-2 font-medium text-sm text-[rgba(240,238,235,0.95)] leading-relaxed">
                  {questionText}
                </div>

                {gap.why_it_matters && (
                  <div className="mb-3 text-xs text-[rgba(180,178,190,0.55)] leading-normal">
                    {gap.why_it_matters}
                  </div>
                )}

                {options.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {options.map((opt, optIdx) => (
                      <button
                        key={optIdx}
                        onClick={() => handleAnswerGap(gapId, opt)}
                        className="rounded px-2.5 py-1 text-xs transition-colors hover:brightness-110"
                        style={{
                          background: "rgba(232,148,42,0.15)",
                          border: "1px solid rgba(232,148,42,0.35)",
                          color: "var(--aw-offwhite)",
                        }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Type custom answer..."
                    id={`gap-input-${gapId}`}
                    className="flex-1 rounded-md px-3 py-2 text-xs outline-none transition-colors"
                    style={{
                      background: "rgba(8,8,12,0.7)",
                      border: "1px solid rgba(232,148,42,0.25)",
                      color: "var(--aw-offwhite)",
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        handleAnswerGap(gapId, event.currentTarget.value);
                      }
                    }}
                  />
                  <button
                    className="rounded-md px-3.5 py-2 text-xs font-bold uppercase transition-colors shrink-0"
                    style={{ background: "var(--aw-amber)", color: "var(--aw-obsidian)" }}
                    onClick={() => {
                      const el = document.getElementById(`gap-input-${gapId}`) as HTMLInputElement | null;
                      if (el && el.value.trim()) handleAnswerGap(gapId, el.value.trim());
                    }}
                  >
                    Answer
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0 p-4" style={{ background: "rgba(15,15,21,0.75)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div
          className="flex items-center rounded-full px-4 py-1.5 transition-colors"
          style={{ background: "rgba(8,8,12,0.8)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <input
            type="text"
            className="flex-1 border-none bg-transparent py-2 text-sm outline-none"
            style={{ color: "var(--aw-offwhite)" }}
            placeholder="E.g. 'Final sale items cannot be refunded'"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && handleSend()}
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all"
            style={{
              background: input.trim() && !sending ? "var(--aw-offwhite)" : "transparent",
              color: input.trim() && !sending ? "var(--aw-obsidian)" : "rgba(180,178,190,0.35)",
              cursor: input.trim() && !sending ? "pointer" : "default",
            }}
            aria-label="Send instruction"
          >
            <Send size={16} className="ml-0.5" />
          </button>
        </div>
        <div className="mt-3 text-center text-[10px] uppercase tracking-wider opacity-70" style={{ color: "var(--aw-coolgray)" }}>
          Instructions are saved only when the worker can connect them to memory or workflow.
        </div>
      </div>
    </div>
  );
}

export const GhostChat = WorkerChat;
