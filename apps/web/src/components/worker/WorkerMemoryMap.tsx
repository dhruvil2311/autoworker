import React, { useMemo } from 'react';
import { 
  Shield, 
  Sparkles, 
  BookOpen, 
  FileText, 
  CheckCircle2, 
  Clock, 
  Layers,
  ExternalLink,
  Lock,
  ArrowRight,
  Trash2,
  Video
} from 'lucide-react';
import { Badge } from '../ui/Badge.js';
import { api } from '../../api.js';

interface WorkerMemoryMapProps {
  worker: any;
  rules?: string[];
  planObj?: any;
  memory?: any;
  documents?: any[];
  workflow?: any;
  onRefresh?: () => void;
}

export function WorkerMemoryMap({
  worker,
  rules = [],
  planObj,
  memory,
  documents = [],
  workflow,
  onRefresh,
}: WorkerMemoryMapProps) {
  const currentVersion = worker?.activeVersionId ? `v${worker.version || '1.0'}` : 'v1.0';

  // Compute training lineage & grounding (Video Recording vs Document vs Prior Task)
  const trainingGrounding = useMemo(() => {
    if (!worker?.activeVersionId) {
      return {
        isVideo: false,
        isDoc: false,
        recordingName: null,
        recordingId: null,
        actionCount: 0,
        frameCount: null,
        compiledAt: null
      };
    }

    const ts = worker?.trainingSource || {};
    const compiler = workflow?.compiler || {};
    const hasVideoDoc = documents.some((d: any) => 
      d.type === 'VIDEO' || 
      d.type === 'DESKTOP_RECORDING' || 
      Boolean(d.name?.match(/\.(mp4|webm|mov|mkv|avi)$/i))
    );
    const isVideo = ts.type === 'VIDEO_RECORDING' || 
                    compiler.source_type === 'VIDEO_RECORDING' || 
                    !!compiler.source_media_name || 
                    !!worker?.recordingId ||
                    hasVideoDoc;
    const isDoc = (ts.type === 'DOCUMENT' || ts.type === 'DOCUMENT_SOP' || !isVideo) && documents.length > 0;

    const recordingName = ts.recordingName || ts.name || compiler.source_media_name || (isVideo ? 'Desktop Screen Demonstration' : null);
    const recordingId = ts.recordingId || ts.jobId || compiler.source_recording_id || worker?.recordingId;
    const actionCount = isVideo
      ? (ts.actionCount ?? compiler.action_count ?? (workflow?.steps?.length || workflow?.root_step?.children?.length || 0))
      : (documents.length > 0 ? (ts.actionCount ?? (workflow?.steps?.length || workflow?.root_step?.children?.length || 0)) : 0);
    const frameCount = isVideo ? (ts.frameCount ?? compiler.frame_count) : null;
    const compiledAt = (isVideo || documents.length > 0)
      ? (ts.compiledAt || workflow?.created_at || worker?.updatedAt)
      : null;

    return {
      isVideo,
      isDoc,
      recordingName,
      recordingId,
      actionCount,
      frameCount,
      compiledAt
    };
  }, [worker, workflow, documents]);

  // Extract procedural steps learned from video recording
  const videoWorkflowSteps = useMemo(() => {
    if (!worker?.activeVersionId || !trainingGrounding.isVideo || !workflow) return [];
    const wfSteps = workflow.root_step?.children || workflow.steps || [];
    return wfSteps.map((s: any, idx: number) => ({
      index: idx + 1,
      id: s.id || `step_${idx + 1}`,
      name: s.description || s.name || s.operation || `Action ${idx + 1}`,
      operation: s.operation || 'ACTION',
      target: s.args?.url || s.args?.selector || s.args?.value || s.target || ''
    }));
  }, [worker?.activeVersionId, trainingGrounding.isVideo, workflow]);

  // Extract rules from documents & plan
  const documentRules = useMemo(() => {
    const collected: string[] = [];
    if (rules && rules.length > 0) {
      collected.push(...rules);
    }
    if (planObj?.businessRules && Array.isArray(planObj.businessRules)) {
      for (const r of planObj.businessRules) {
        const text = typeof r === 'string' ? r : r.description || r.rule;
        if (text && !collected.includes(text)) collected.push(text);
      }
    }
    for (const doc of documents) {
      const parsed = doc.parsedJson;
      if (!parsed) continue;
      if (parsed.rules && Array.isArray(parsed.rules)) {
        for (const r of parsed.rules) {
          const text = typeof r === 'string' ? r : r.description || r.text;
          if (text && !collected.includes(text)) collected.push(text);
        }
      }
      if (parsed.constraints && Array.isArray(parsed.constraints)) {
        for (const c of parsed.constraints) {
          const text = typeof c === 'string' ? c : c.description || c.text;
          if (text && !collected.includes(`Constraint: ${text}`)) collected.push(`Constraint: ${text}`);
        }
      }
    }
    return collected;
  }, [rules, planObj, documents]);

  // Extract safety policies
  const safetyPolicies = useMemo(() => {
    const collected: string[] = [];
    if (planObj?.whenGhostWillAsk && Array.isArray(planObj.whenGhostWillAsk)) {
      for (const cond of planObj.whenGhostWillAsk) {
        collected.push(`Safety Policy: Escalate to supervisor when "${cond}".`);
      }
    }
    return collected;
  }, [planObj]);

  // Combined fallback for backward compatibility
  const dynamicRules = useMemo(() => {
    return [...documentRules, ...safetyPolicies];
  }, [documentRules, safetyPolicies]);

  // Extract real learned supervisor instructions
  const learnedInstructions = memory?.instructions || [];
  const learnedRules = memory?.rules || [];
  const hasLearnedMemory = learnedInstructions.length > 0 || learnedRules.length > 0;

  return (
    <div className="flex flex-col gap-4 p-4 bg-[#0e1017] border border-[rgba(255,255,255,0.08)] rounded-md text-xs h-full overflow-y-auto">
      {/* ── 1. Top Header Bar ── */}
      <div className="flex items-center justify-between pb-3 border-b border-[rgba(255,255,255,0.06)]">
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-[#00c2d4]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[#f4f2ee]">
            Operational Procedural Memory & SOP Rules · {worker?.name || 'Worker'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[#8e92a4]">
            Active Version: {currentVersion}
          </span>
          {documents.length > 0 && (
            <Badge variant="accent">{documents.length} SOP Source Document{documents.length > 1 ? 's' : ''}</Badge>
          )}
          <button
            onClick={async () => {
              if (confirm(`Purge all operational memory, documents, and compiled workflows for ${worker?.name || 'this worker'}? This will completely reset the worker to clean state instantly.`)) {
                try {
                  await api.purgeWorkerMemory(worker.id);
                  onRefresh?.();
                } catch (err: any) {
                  alert("Purge failed: " + (err.message || err));
                }
              }
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] font-semibold transition-colors cursor-pointer ml-1"
            title="Instantly purge all memory, workflows, and training data"
          >
            <Trash2 size={11} />
            <span>Purge Memory & Workflow</span>
          </button>
        </div>
      </div>

      {/* ── 1.5 Active Training Grounding & Source Attribution ── */}
      <div className={`p-3.5 rounded-md border flex flex-col gap-2 ${
        trainingGrounding.isVideo 
          ? 'bg-[rgba(0,194,212,0.04)] border-[rgba(0,194,212,0.25)]' 
          : 'bg-[#07080c] border-[rgba(255,255,255,0.06)]'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {trainingGrounding.isVideo ? (
              <Video size={14} className="text-[#00c2d4]" />
            ) : (
              <Layers size={14} className="text-purple-400" />
            )}
            <span className="text-xs font-semibold text-[#f4f2ee]">
              Active Operational Training Grounding
            </span>
          </div>
          <Badge variant={trainingGrounding.isVideo ? 'accent' : (trainingGrounding.isDoc ? 'success' : 'neutral')}>
            {trainingGrounding.isVideo ? 'Trained from Video Recording' : (trainingGrounding.isDoc ? 'Trained from SOP Document' : 'Untrained / No SOP')}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[#8e92a4] pt-1">
          {trainingGrounding.isVideo ? (
            <>
              <div>
                <span className="text-zinc-500">Source Recording: </span>
                <span className="font-mono text-[#f4f2ee] font-semibold">{trainingGrounding.recordingName}</span>
              </div>
              {trainingGrounding.actionCount > 0 && (
                <div>
                  <span className="text-zinc-500">Actions Learned: </span>
                  <span className="font-mono text-[#00c2d4] font-semibold">{trainingGrounding.actionCount} compiled steps</span>
                </div>
              )}
              {trainingGrounding.frameCount ? (
                <div>
                  <span className="text-zinc-500">Video Keyframes: </span>
                  <span className="font-mono text-[#f4f2ee]">{trainingGrounding.frameCount}</span>
                </div>
              ) : null}
              {trainingGrounding.compiledAt && (
                <div>
                  <span className="text-zinc-500">Compiled: </span>
                  <span className="font-mono text-[#8e92a4]">{new Date(trainingGrounding.compiledAt).toLocaleString()}</span>
                </div>
              )}
            </>
          ) : (
            <div>
              <span className="text-zinc-500">Baseline Source: </span>
              <span className="font-mono text-[#f4f2ee]">
                {documents[0]?.name || (trainingGrounding.isVideo ? 'Video Recording Demonstration' : 'No SOP Document Ingested')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── 2. Governing SOP Documents Section (if present) ── */}
      {documents.length > 0 && (
        <div className="p-3.5 bg-[#07080c] border border-[rgba(255,255,255,0.05)] rounded-md flex flex-col gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8e92a4] flex items-center gap-1.5">
            <FileText size={12} className="text-[#00c2d4]" /> Ingested Governing SOP Documents ({documents.length})
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
            {documents.map((doc: any, i: number) => (
              <div key={i} className="p-2.5 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded flex items-center justify-between">
                <div className="flex flex-col min-w-0 flex-1 mr-2">
                  <span className="font-semibold text-[#f4f2ee] font-mono text-xs truncate">{doc.name}</span>
                  <span className="text-[10px] text-[#8e92a4]">
                    Type: {doc.type} · Ingested {new Date(doc.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="success">Verified</Badge>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (confirm(`Delete SOP document "${doc.name}"? This will permanently purge it and all its rules from the worker's memory.`)) {
                        try {
                          await api.deleteDocument(worker.id, doc.id);
                          onRefresh?.();
                        } catch (err: any) {
                          alert("Failed to delete SOP document: " + (err.message || err));
                        }
                      }
                    }}
                    className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
                    title="Delete SOP Document"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 3. Learned Memory & Supervisor Guidance Delta ── */}
      {hasLearnedMemory ? (
        <div className="p-3.5 bg-[rgba(0,194,212,0.06)] border border-[rgba(0,194,212,0.25)] rounded-md flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-[#00c2d4]" />
              <span className="text-xs font-semibold text-[#00c2d4]">
                Supervisor Guidance Committed to Memory ({learnedInstructions.length + learnedRules.length})
              </span>
            </div>
            <Badge variant="accent">Adapted Procedural Memory</Badge>
          </div>

          <div className="flex flex-col gap-2">
            {learnedInstructions.map((inst: any, idx: number) => (
              <div key={inst.id || idx} className="p-2.5 bg-[#07080c] border border-[rgba(0,194,212,0.2)] rounded flex flex-col gap-1">
                <div className="flex items-center justify-between text-[10px] text-[#8e92a4]">
                  <span className="font-semibold text-[#00c2d4]">Guidance #{idx + 1}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{new Date(inst.createdAt).toLocaleString()}</span>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm(`Delete this supervisor guidance? It will be permanently purged from the worker's operational memory.`)) {
                          try {
                            await api.deleteMemory(worker.id, inst.id);
                            onRefresh?.();
                          } catch (err: any) {
                            alert("Failed to delete memory item: " + (err.message || err));
                          }
                        }
                      }}
                      className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
                      title="Delete guidance"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <p className="text-[#f4f2ee] leading-relaxed">{inst.content || inst.instruction}</p>
              </div>
            ))}

            {learnedRules.map((r: any, idx: number) => (
              <div key={r.id || idx} className="p-2.5 bg-[#07080c] border border-[rgba(0,194,212,0.2)] rounded flex flex-col gap-1">
                <div className="flex items-center justify-between text-[10px] text-[#8e92a4]">
                  <span className="font-semibold text-[#00c2d4]">Adapted Rule #{idx + 1}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{new Date(r.createdAt).toLocaleString()}</span>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm(`Delete this adapted rule? It will be permanently purged from the worker's operational memory.`)) {
                          try {
                            await api.deleteMemory(worker.id, r.id);
                            onRefresh?.();
                          } catch (err: any) {
                            alert("Failed to delete rule: " + (err.message || err));
                          }
                        }
                      }}
                      className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
                      title="Delete rule"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <p className="text-[#f4f2ee] leading-relaxed">{r.content || r.statement}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-3 bg-[#07080c] border border-[rgba(255,255,255,0.04)] rounded-md flex items-center gap-2.5 text-[#8e92a4]">
          <Shield size={14} className="text-[#1db87a]" />
          <span>No supervisor overrides recorded yet. Worker operates autonomously under baseline SOP rules.</span>
        </div>
      )}

      {/* ── 4a. Procedural Workflow Actions Learned from Video ── */}
      {videoWorkflowSteps.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#00c2d4] flex items-center gap-1.5">
            <Video size={12} />
            Procedural Actions Learned from Video Recording ({videoWorkflowSteps.length})
          </span>
          <div className="flex flex-col gap-1.5 overflow-y-auto pr-1 max-h-56">
            {videoWorkflowSteps.map((st: any) => (
              <div
                key={st.id}
                className="flex items-center justify-between p-2.5 bg-[#07080c] border border-[rgba(0,194,212,0.15)] hover:border-[rgba(0,194,212,0.3)] transition-colors rounded text-xs text-[#f4f2ee]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-5 h-5 rounded-full bg-[rgba(0,194,212,0.1)] border border-[rgba(0,194,212,0.25)] flex items-center justify-center text-[#00c2d4] text-[9px] font-mono shrink-0">
                    {st.index}
                  </div>
                  <span className="font-medium truncate text-[#f4f2ee]">{st.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.04)] text-[#8e92a4] border border-[rgba(255,255,255,0.06)]">
                    {st.operation}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 4b. Procedural SOP Rules & Constraints List ── */}
      <div className="flex flex-col gap-2 flex-1 min-h-0">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8e92a4]">
          Standard Operating Procedure Clauses & Constraints ({dynamicRules.length})
        </span>

        {dynamicRules.length > 0 ? (
          <div className="flex flex-col gap-1.5 overflow-y-auto pr-1">
            {dynamicRules.map((rule, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 p-2.5 bg-[#07080c] border border-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.08)] transition-colors rounded text-xs text-[#f4f2ee]"
              >
                <div className="w-5 h-5 rounded-full bg-[rgba(0,194,212,0.1)] border border-[rgba(0,194,212,0.25)] flex items-center justify-center text-[#00c2d4] text-[9px] font-mono shrink-0 mt-0.5">
                  {idx + 1}
                </div>
                <p className="leading-relaxed text-[#c4c7d4]">{rule}</p>
              </div>
            ))}
          </div>
        ) : videoWorkflowSteps.length === 0 ? (
          <div className="p-6 bg-[#07080c] border border-[rgba(255,255,255,0.04)] rounded-md flex flex-col items-center justify-center text-center text-[#8e92a4]">
            <BookOpen size={24} className="opacity-40 mb-2" />
            <span className="text-xs font-semibold text-[#f4f2ee]">No Procedural Rules Defined Yet</span>
            <p className="text-[11px] text-[#8e92a4] mt-1 max-w-sm">
              Upload an SOP document (.docx / .pdf) in worker settings or teach instructions in the Teach tab to populate this worker's memory map.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
