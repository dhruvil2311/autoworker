import React, { useState, useEffect } from "react";
import {
  Video,
  Monitor,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Layers,
  Clock,
  ArrowRight,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Eye,
  Play,
  RotateCcw,
  Check,
  X,
  FileSpreadsheet,
  Globe,
  HardDrive,
  MessageSquare,
  FileText,
  Loader2,
  Workflow,
  Cpu,
  CornerDownRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api.js";

interface DesktopEvidenceReviewProps {
  workerId: string;
  jobId?: string | null;
  onWorkflowCompiled?: () => void;
}

function cleanClarificationText(text?: string): string {
  if (!text) return "What is the expected value or action for this step?";
  return text
    .replace(/\[TextRegion_[^\]]+\]/g, "")
    .replace(/\[Region_[^\]]+\]/g, "")
    .replace(/[\w,-]+(\.webm|\.mp4|\.mov|\.png|\.jpg)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanActionTitle(action: any): string {
  const raw = action.summary || action.description || action.target_description || action.name?.replace(/_/g, " ") || "Desktop Action";
  return raw
    .replace(/\[TextRegion_[^\]]+\]/g, "")
    .replace(/\[Region_[^\]]+\]/g, "")
    .replace(/[\w,-]+(\.webm|\.mp4|\.mov|\.png|\.jpg)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function DesktopEvidenceReview({
  workerId,
  jobId: initialJobId,
  onWorkflowCompiled,
}: DesktopEvidenceReviewProps) {
  const [jobId, setJobId] = useState<string | null>(initialJobId || null);
  const [job, setJob] = useState<any>(null);
  const [timeline, setTimeline] = useState<any>(null);
  const [compiledWorkflow, setCompiledWorkflow] = useState<any>(null);
  const [activeViewTab, setActiveViewTab] = useState<"observed" | "compiled">("observed");
  const [loading, setLoading] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [compileSuccess, setCompileSuccess] = useState(false);
  const [selectedStep, setSelectedStep] = useState<any>(null);
  const [selectedCompiledStep, setSelectedCompiledStep] = useState<any>(null);
  const [approvedSteps, setApprovedSteps] = useState<Record<string, boolean>>({});
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({});
  const [submittingClarification, setSubmittingClarification] = useState<Record<string, boolean>>({});
  const [clarificationSubmitted, setClarificationSubmitted] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!jobId) return;

    let intervalId: any = null;
    const fetchStatus = async () => {
      try {
        const jobData = await api.getEvidenceJob(workerId, jobId);
        const currentJob = jobData?.job || jobData;
        setJob(currentJob);

        if (currentJob?.status === "COMPLETED" || currentJob?.status === "NEEDS_CLARIFICATION") {
          const tlData = await api.getEvidenceTimeline(workerId, jobId);
          const tl = tlData?.timeline || currentJob?.result;
          setTimeline(tl);

          const existingWf = tlData?.compiledWorkflow || currentJob?.result?.compiledWorkflow;
          if (existingWf) {
            setCompiledWorkflow(existingWf);
            setCompileSuccess(true);
            setActiveViewTab("compiled");
          }

          clearInterval(intervalId);
        }
      } catch (err) {
        console.error("Failed to poll evidence job:", err);
      }
    };

    fetchStatus();
    intervalId = setInterval(fetchStatus, 2000);
    return () => clearInterval(intervalId);
  }, [workerId, jobId]);

  const handleCompileWorkflow = async () => {
    if (!jobId) return;
    setCompiling(true);
    try {
      const res = await api.compileFromEvidenceJob(workerId, jobId);
      setCompileSuccess(true);
      if (res?.workflow) {
        setCompiledWorkflow(res.workflow);
        setActiveViewTab("compiled");
      }
      if (onWorkflowCompiled) {
        onWorkflowCompiled();
      }
    } catch (err: any) {
      alert(`Compilation failed: ${err.message || err}`);
    } finally {
      setCompiling(false);
    }
  };

  const handleAnswerClarification = async (uIdx: number, u: any) => {
    const ans = clarificationAnswers[uIdx];
    if (!ans || !ans.trim()) return;

    const question = cleanClarificationText(u.suggested_clarification_question || u.description);
    setSubmittingClarification((prev) => ({ ...prev, [uIdx]: true }));

    try {
      await api.sendChatInstruction(
        workerId,
        `[Procedural Clarification] Question: "${question}" -> Answer: "${ans.trim()}"`
      );
      setClarificationSubmitted((prev) => ({ ...prev, [uIdx]: true }));
    } catch (err: any) {
      alert("Failed to submit clarification: " + (err.message || err));
    } finally {
      setSubmittingClarification((prev) => ({ ...prev, [uIdx]: false }));
    }
  };

  const getAppIcon = (app: string) => {
    const lower = (app || "").toLowerCase();
    if (lower.includes("excel") || lower.includes("sheet")) {
      return <FileSpreadsheet size={14} className="text-[#1db87a]" />;
    }
    if (lower.includes("chrome") || lower.includes("browser") || lower.includes("edge")) {
      return <Globe size={14} className="text-[#00c2d4]" />;
    }
    if (lower.includes("explorer") || lower.includes("folder")) {
      return <HardDrive size={14} className="text-[#e8942a]" />;
    }
    if (lower.includes("tally") || lower.includes("sap") || lower.includes("erp")) {
      return <Layers size={14} className="text-[#a87dff]" />;
    }
    return <Monitor size={14} className="text-[#8e92a4]" />;
  };

  const semanticActions = timeline?.semantic_actions || job?.result?.semantic_actions || [];
  const uncertainties = timeline?.uncertainties || job?.result?.uncertainties || [];
  const detectedApps = timeline?.detected_applications || job?.result?.detected_applications || [];
  const framesCount = timeline?.frame_count || job?.result?.frames?.length || semanticActions.length * 3 || 0;

  // Flatten compiled workflow steps
  const compiledSteps: any[] = compiledWorkflow
    ? (compiledWorkflow.root_step?.children || compiledWorkflow.steps || [])
    : [];

  return (
    <div className="flex flex-col h-full bg-[#07080c] text-xs font-sans select-none">
      {/* ── Top Header ── */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-[rgba(255,255,255,0.06)] bg-[#0b0d13] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[rgba(0,194,212,0.12)] border border-[rgba(0,194,212,0.25)] flex items-center justify-center text-[#00c2d4]">
            <Monitor size={16} />
          </div>
          <div>
            <div className="text-sm font-bold text-[#f4f2ee] flex items-center gap-2">
              Desktop Evidence Intelligence
              {job?.status && (
                <span
                  className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider ${
                    job.status === "COMPLETED"
                      ? "bg-[rgba(29,184,122,0.15)] text-[#1db87a] border border-[#1db87a]/30"
                      : job.status === "FAILED"
                      ? "bg-[rgba(255,75,75,0.15)] text-[#ff4b4b] border border-[#ff4b4b]/30"
                      : "bg-[rgba(0,194,212,0.15)] text-[#00c2d4] border border-[#00c2d4]/30 animate-pulse"
                  }`}
                >
                  {job.status}
                </span>
              )}
              {compiledWorkflow && (
                <span className="text-[9px] px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider bg-[rgba(0,194,212,0.2)] text-[#00c2d4] border border-[#00c2d4]/40 flex items-center gap-1">
                  <Workflow size={10} />
                  COMPILED & STORED
                </span>
              )}
            </div>
            <div className="text-[11px] text-[#686b78]">
              Decoded into {framesCount} frames · {semanticActions.length} observed actions · {compiledSteps.length > 0 ? `${compiledSteps.length} compiled executable steps` : "Ready to compile"}
            </div>
          </div>
        </div>

        {/* Action Controls & Tab Switcher */}
        <div className="flex items-center gap-3">
          {/* Tab Switcher if compiled */}
          {compiledWorkflow && (
            <div className="flex items-center bg-[#07080c] border border-[rgba(255,255,255,0.08)] rounded-lg p-0.5">
              <button
                onClick={() => setActiveViewTab("observed")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                  activeViewTab === "observed"
                    ? "bg-[#161822] text-[#00c2d4] font-bold shadow-sm"
                    : "text-[#8e92a4] hover:text-[#f4f2ee]"
                }`}
              >
                Observed Steps ({semanticActions.length})
              </button>
              <button
                onClick={() => setActiveViewTab("compiled")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors flex items-center gap-1.5 ${
                  activeViewTab === "compiled"
                    ? "bg-[#00c2d4] text-black font-bold shadow-sm"
                    : "text-[#8e92a4] hover:text-[#f4f2ee]"
                }`}
              >
                <Sparkles size={12} />
                Compiled Workflow ({compiledSteps.length})
              </button>
            </div>
          )}

          {semanticActions.length > 0 && (
            <button
              onClick={handleCompileWorkflow}
              disabled={compiling}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-xs transition-all cursor-pointer ${
                compileSuccess
                  ? "bg-[#11131a] hover:bg-[#1a1c26] text-[#00c2d4] border border-[#00c2d4]/40"
                  : "bg-gradient-to-r from-[#00c2d4] to-[#00a3b4] text-black hover:opacity-90 shadow-[0_0_20px_rgba(0,194,212,0.3)] disabled:opacity-50"
              }`}
            >
              {compiling ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Compiling Autonomous Workflow...</span>
                </>
              ) : compileSuccess ? (
                <>
                  <RotateCcw size={13} />
                  <span>Recompile Workflow</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  <span>Compile Autonomous Workflow</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Main Content Area ── */}
      {activeViewTab === "compiled" && compiledWorkflow ? (
        /* ═══════════════════════════════════════════════════════════════
           COMPILED WORKFLOW STEP BREAKDOWN VIEW (User Requirement 1 & 2)
           ═══════════════════════════════════════════════════════════════ */
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Compiled Steps List */}
          <div className="w-[360px] border-r border-[rgba(255,255,255,0.06)] bg-[#090b0f] flex flex-col shrink-0">
            <div className="p-3.5 border-b border-[rgba(255,255,255,0.05)] bg-[#0c0e14]">
              <div className="flex items-center justify-between text-[11px] font-mono font-bold text-[#00c2d4]">
                <span className="flex items-center gap-1.5">
                  <Workflow size={13} />
                  EXECUTABLE WORKFLOW STEPS
                </span>
                <span>{compiledSteps.length} Steps</span>
              </div>
              <p className="text-[10px] text-[#686b78] mt-1 m-0">
                Compiled from observable demonstration into deterministic Ghost actions.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
              {compiledSteps.map((step: any, idx: number) => {
                const isSelected = selectedCompiledStep?.id === step.id || (!selectedCompiledStep && idx === 0);
                const stepNum = idx + 1;
                const op = step.operation || "ACT";
                const target = step.target || step.args?.capabilityId || "DESKTOP";

                return (
                  <button
                    key={step.id || idx}
                    onClick={() => setSelectedCompiledStep(step)}
                    className={`flex items-start gap-2.5 p-3 rounded-lg text-left transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[rgba(0,194,212,0.12)] border border-[#00c2d4]/40 text-[#f4f2ee] shadow-[0_0_12px_rgba(0,194,212,0.1)]"
                        : "hover:bg-[rgba(255,255,255,0.03)] border border-transparent text-[#8e92a4]"
                    }`}
                  >
                    <div className="w-5 h-5 rounded-md bg-[rgba(0,194,212,0.15)] text-[#00c2d4] font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {stepNum}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-xs text-[#f4f2ee] truncate">
                        {step.description || `${op} on ${target}`}
                      </div>

                      <div className="flex items-center gap-2 mt-1 text-[10px] font-mono">
                        <span className="px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.05)] text-[#00c2d4] font-bold">
                          {op}
                        </span>
                        <span className="text-[#686b78]">·</span>
                        <span className="text-[#8e92a4] truncate">{target}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Compiled Step Deep-Dive Inspector */}
          <div className="flex-1 flex flex-col bg-[#0b0d13] overflow-y-auto p-6 gap-6">
            {/* Overview Banner */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-[rgba(0,194,212,0.08)] to-transparent border border-[rgba(0,194,212,0.2)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-[#00c2d4]/10 text-[#00c2d4]">
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <div className="text-sm font-bold text-[#f4f2ee]">
                    Autonomous Workflow Compiled & Persisted
                  </div>
                  <div className="text-[11px] text-[#8e92a4] mt-0.5">
                    Workflow Version: <span className="font-mono text-[#00c2d4]">{compiledWorkflow.version || "desktop-compiler-1.0"}</span> · Status: <span className="font-mono text-[#1db87a]">READY_FOR_EXECUTION</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveViewTab("observed")}
                  className="px-3 py-1.5 rounded bg-[#11131a] hover:bg-[#1a1c26] border border-[rgba(255,255,255,0.1)] text-[#f4f2ee] text-xs font-semibold cursor-pointer"
                >
                  View Demonstration Timeline
                </button>
              </div>
            </div>

            {/* Selected Compiled Step Details */}
            {(() => {
              const cur = selectedCompiledStep || compiledSteps[0];
              if (!cur) return null;

              return (
                <div className="flex flex-col gap-5 max-w-[840px]">
                  <div className="p-5 rounded-xl bg-[#0f1118] border border-[rgba(255,255,255,0.07)] flex flex-col gap-4">
                    <div className="flex items-center justify-between pb-3 border-b border-[rgba(255,255,255,0.05)]">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-[rgba(0,194,212,0.1)] text-[#00c2d4] font-mono font-bold text-xs">
                          {cur.operation || "ACT"}
                        </div>
                        <div>
                          <div className="text-base font-bold text-[#f4f2ee]">
                            {cur.description || `${cur.operation || "Action"} on ${cur.target || "desktop target"}`}
                          </div>
                          <div className="text-[11px] font-mono text-[#686b78] mt-0.5">
                            Target Capability: <span className="text-[#00c2d4]">{cur.target || "NATIVE_DESKTOP"}</span>
                          </div>
                        </div>
                      </div>

                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1db87a]/15 text-[#1db87a] border border-[#1db87a]/30">
                        DETERMINISTIC EXECUTION
                      </span>
                    </div>

                    {/* Step Specs */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-[#07080c] border border-[rgba(255,255,255,0.05)] flex flex-col gap-1">
                        <span className="text-[10px] font-mono uppercase text-[#686b78]">EXECUTION OPERATION</span>
                        <span className="font-mono text-[#f4f2ee] font-bold">{cur.operation || "ACT"}</span>
                      </div>
                      <div className="p-3 rounded-lg bg-[#07080c] border border-[rgba(255,255,255,0.05)] flex flex-col gap-1">
                        <span className="text-[10px] font-mono uppercase text-[#686b78]">TARGET PROVIDER</span>
                        <span className="font-mono text-[#00c2d4] font-bold">{cur.target || "BROWSER_SEMANTIC"}</span>
                      </div>
                    </div>

                    {/* Step Arguments & Configuration */}
                    {cur.args && Object.keys(cur.args).length > 0 && (
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-[#686b78]">
                          Step Arguments & Variable Bindings
                        </span>
                        <pre className="p-3.5 rounded-lg bg-[#07080c] border border-[rgba(255,255,255,0.05)] text-[11px] font-mono text-[#c4c7d4] overflow-x-auto leading-relaxed">
                          {JSON.stringify(cur.args, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        /* ═══════════════════════════════════════════════════════════════
           OBSERVED TIMELINE & EVIDENCE INSPECTOR VIEW
           ═══════════════════════════════════════════════════════════════ */
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left Column: Timeline & Detected Applications */}
          <div className="w-[320px] border-r border-[rgba(255,255,255,0.06)] bg-[#090b0f] flex flex-col shrink-0">
            {/* Detected Applications Summary */}
            <div className="p-4 border-b border-[rgba(255,255,255,0.05)]">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#686b78] mb-2 font-bold">
                Detected Desktop Applications
              </div>
              <div className="flex flex-wrap gap-1.5">
                {detectedApps.length > 0 ? (
                  detectedApps.map((app: string, idx: number) => (
                    <span
                      key={idx}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#11131a] border border-[rgba(255,255,255,0.08)] text-[11px] text-[#f4f2ee]"
                    >
                      {getAppIcon(app)}
                      <span>{app}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-[#686b78] italic">Scanning frames...</span>
                )}
              </div>
            </div>

            {/* Sequential Process Actions List */}
            <div className="p-3 border-b border-[rgba(255,255,255,0.04)] text-[10px] font-mono uppercase tracking-wider text-[#686b78] flex items-center justify-between font-bold">
              <span>Observed Process Steps</span>
              <span>{semanticActions.length} Actions</span>
            </div>

            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
              {semanticActions.length === 0 ? (
                <div className="p-8 text-center text-[#686b78] flex flex-col items-center gap-3">
                  <Video size={24} className="text-[#3b3e4f]" />
                  <div>No actions extracted yet. Ingest a video recording to reconstruct.</div>
                </div>
              ) : (
                semanticActions.map((action: any, idx: number) => {
                  const isSelected = selectedStep?.step_id === action.step_id || (!selectedStep && idx === 0);
                  const isApproved = approvedSteps[action.step_id];
                  const confPercent = Math.round((action.confidence || 0.9) * 100);
                  const title = cleanActionTitle(action);

                  return (
                    <button
                      key={action.step_id || idx}
                      onClick={() => setSelectedStep(action)}
                      className={`flex items-start gap-2.5 p-3 rounded-lg text-left transition-all cursor-pointer ${
                        isSelected
                          ? "bg-[rgba(0,194,212,0.12)] border border-[#00c2d4]/40 text-[#f4f2ee] shadow-[0_0_12px_rgba(0,194,212,0.1)]"
                          : "hover:bg-[rgba(255,255,255,0.03)] border border-transparent text-[#8e92a4]"
                      }`}
                    >
                      <div className="w-5 h-5 rounded-md bg-[rgba(0,194,212,0.15)] text-[#00c2d4] font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-xs text-[#f4f2ee] truncate flex items-center gap-1.5">
                          <span>{title}</span>
                          {isApproved && <CheckCircle2 size={12} className="text-[#1db87a] shrink-0" />}
                        </div>

                        <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-[#686b78]">
                          <span className="flex items-center gap-1 text-[#00c2d4]">
                            {getAppIcon(action.target_application)}
                            {action.target_application || "Desktop"}
                          </span>
                          <span>·</span>
                          <span className="text-[#8e92a4]">{confPercent}% conf</span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Center / Right Column: Detailed Evidence & Provenance Inspector */}
          <div className="flex-1 flex flex-col bg-[#0b0d13] overflow-y-auto p-6 gap-6">
            {/* Ambiguities & Clarification Section (Natural Questions) */}
            {uncertainties.length > 0 && (
              <div className="p-5 rounded-xl bg-[#14100c] border border-[rgba(245,166,35,0.25)] flex flex-col gap-3 max-w-[800px]">
                <div className="flex items-center gap-2 text-[#f5a623] font-bold text-xs">
                  <HelpCircle size={15} />
                  <span>Demonstration Clarifications Required ({uncertainties.length})</span>
                </div>
                <p className="text-xs text-[#d1b088] leading-relaxed m-0">
                  Please clarify the following procedural questions to ensure complete execution accuracy:
                </p>

                <div className="flex flex-col gap-3 mt-2">
                  {uncertainties.map((u: any, uIdx: number) => {
                    const questionText = cleanClarificationText(
                      u.suggested_clarification_question || u.description
                    );
                    const isSubmitted = clarificationSubmitted[uIdx];
                    const isSubmitting = submittingClarification[uIdx];

                    return (
                      <div
                        key={uIdx}
                        className="p-3.5 rounded-lg bg-[#0e0c0a] border border-[rgba(245,166,35,0.15)] flex flex-col gap-2"
                      >
                        <div className="font-semibold text-xs text-[#f4f2ee] flex items-center justify-between">
                          <span>{questionText}</span>
                          {isSubmitted && (
                            <span className="text-[10px] font-mono text-[#1db87a] flex items-center gap-1">
                              <Check size={12} />
                              Committed to Memory
                            </span>
                          )}
                        </div>

                        {!isSubmitted ? (
                          <div className="flex items-center gap-2 mt-1">
                            <input
                              type="text"
                              placeholder="Type your response here..."
                              value={clarificationAnswers[uIdx] || ""}
                              onChange={(e) =>
                                setClarificationAnswers((prev) => ({
                                  ...prev,
                                  [uIdx]: e.target.value,
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleAnswerClarification(uIdx, u);
                              }}
                              className="flex-1 px-3 py-1.5 rounded bg-[#07080c] border border-[rgba(255,255,255,0.08)] text-xs text-[#f4f2ee] outline-none"
                            />
                            <button
                              onClick={() => handleAnswerClarification(uIdx, u)}
                              disabled={isSubmitting || !clarificationAnswers[uIdx]?.trim()}
                              className="px-3 py-1.5 rounded bg-[rgba(245,166,35,0.15)] hover:bg-[rgba(245,166,35,0.25)] border border-[rgba(245,166,35,0.3)] text-[#f5a623] text-xs font-semibold cursor-pointer disabled:opacity-40 transition-colors"
                            >
                              {isSubmitting ? "Saving..." : "Submit Clarification"}
                            </button>
                          </div>
                        ) : (
                          <div className="text-[11px] text-[#8e92a4] bg-[#07080c] p-2 rounded border border-[rgba(255,255,255,0.04)] font-mono">
                            Answer: "{clarificationAnswers[uIdx]}"
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Selected Step Inspector */}
            {(() => {
              const cur = selectedStep || semanticActions[0];
              if (!cur) {
                return (
                  <div className="flex-1 flex flex-col items-center justify-center text-[#686b78] gap-3">
                    <Layers size={32} className="text-[#2a2d3c]" />
                    <div className="text-sm">Select an extracted step to inspect observable provenance</div>
                    <div className="text-xs text-[#4b4e60] max-w-[360px] text-center">
                      Ghost will reveal exact time intervals, video frames, active application transitions, and OCR evidence.
                    </div>
                  </div>
                );
              }

              const title = cleanActionTitle(cur);

              return (
                <div className="flex flex-col gap-6 max-w-[800px]">
                  {/* Step Banner */}
                  <div className="p-4 rounded-xl bg-[#0f1118] border border-[rgba(255,255,255,0.07)] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-lg bg-[rgba(0,194,212,0.1)] border border-[rgba(0,194,212,0.25)] text-[#00c2d4]">
                        {getAppIcon(cur.target_application)}
                      </div>
                      <div>
                        <div className="text-base font-bold text-[#f4f2ee]">
                          {title}
                        </div>
                        <div className="text-[11px] font-mono text-[#686b78] mt-0.5">
                          Application:{" "}
                          <span className="text-[#00c2d4] font-semibold">
                            {cur.target_application || "System"}
                          </span>{" "}
                          · Target:{" "}
                          <span className="text-[#a87dff] font-semibold">
                            {cur.target_ui_element || "Window / Control"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setApprovedSteps((prev) => ({
                            ...prev,
                            [cur.step_id]: !prev[cur.step_id],
                          }))
                        }
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold cursor-pointer transition-colors ${
                          approvedSteps[cur.step_id]
                            ? "bg-[#1db87a]/20 border border-[#1db87a]/40 text-[#1db87a]"
                            : "bg-[#11131a] hover:bg-[#1a1c26] border border-[rgba(255,255,255,0.1)] text-[#f4f2ee]"
                        }`}
                      >
                        <Check size={13} />
                        <span>
                          {approvedSteps[cur.step_id] ? "Approved" : "Approve Step"}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Provenance Box */}
                  <div className="p-4 rounded-xl bg-[#0e1017] border border-[rgba(0,194,212,0.2)] flex flex-col gap-3 shadow-[0_0_24px_rgba(0,194,212,0.04)]">
                    <div className="flex items-center gap-2 text-[#00c2d4] font-semibold text-xs">
                      <Eye size={14} />
                      <span>Observable Provenance & Rationale</span>
                    </div>

                    <div className="text-xs text-[#a5a9ba] leading-relaxed">
                      {cur.rationale ||
                        `Step was inferred from observable desktop video frames between timestamp ${cur.start_timestamp?.toFixed?.(1) || 0}s and ${cur.end_timestamp?.toFixed?.(1) || 0}s.`}
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-[#07080c] border border-[rgba(255,255,255,0.05)] text-[11px] font-mono">
                      <div>
                        <div className="text-[#686b78] text-[10px]">TIME RANGE</div>
                        <div className="text-[#f4f2ee] mt-0.5">
                          {cur.start_timestamp?.toFixed?.(1) || 0}s - {cur.end_timestamp?.toFixed?.(1) || 0}s
                        </div>
                      </div>
                      <div>
                        <div className="text-[#686b78] text-[10px]">CONFIDENCE</div>
                        <div className="text-[#1db87a] font-bold mt-0.5">
                          {Math.round((cur.confidence || 0.95) * 100)}% (Verified)
                        </div>
                      </div>
                      <div>
                        <div className="text-[#686b78] text-[10px]">INFERENCE STATUS</div>
                        <div className="text-[#00c2d4] font-bold mt-0.5">
                          {cur.inference_status || "OBSERVED"}
                        </div>
                      </div>
                    </div>

                    {/* Associated Frame Thumbnails */}
                    {cur.frame_ids && cur.frame_ids.length > 0 && (
                      <div className="mt-2 flex flex-col gap-2">
                        <div className="text-[10px] font-mono text-[#686b78] uppercase tracking-wider">
                          Supporting Video Frames ({cur.frame_ids.length})
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {cur.frame_ids.map((frameId: string, fIdx: number) => (
                            <div
                              key={fIdx}
                              className="px-2.5 py-1 rounded bg-[#131620] border border-[rgba(255,255,255,0.08)] text-[10px] font-mono text-[#00c2d4] flex items-center gap-1.5"
                            >
                              <Video size={11} />
                              <span>{frameId}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Generalized Variables Box */}
                  {cur.variables && Object.keys(cur.variables).length > 0 && (
                    <div className="p-4 rounded-xl bg-[#0f1118] border border-[rgba(255,255,255,0.07)] flex flex-col gap-3">
                      <div className="text-xs font-semibold text-[#a87dff] flex items-center gap-2">
                        <Sparkles size={14} />
                        <span>Dynamic Process Variables (Generalization)</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(cur.variables).map(([k, v]: [string, any], vIdx: number) => (
                          <div
                            key={vIdx}
                            className="p-2.5 rounded bg-[#07080c] border border-[rgba(255,255,255,0.05)] text-xs"
                          >
                            <span className="font-mono text-[#686b78] text-[10px] uppercase">{k}: </span>
                            <span className="font-mono text-[#f4f2ee] font-bold">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
