import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Layers,
  Code2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  FileIcon,
  Upload,
  Loader2,
  Eye,
  Clock,
  ChevronRight,
  Play,
  RotateCcw,
  Check,
  ExternalLink,
  ShieldAlert,
  FileSpreadsheet,
  Video,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { api } from '../../api.js';

interface EvidenceViewerProps {
  worker?: any;
  activeRun?: any;
  onRefresh?: () => void;
}

function inferDocType(fileName: string): { type: string; readAsText: boolean } {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') || lower.endsWith('.mkv') || lower.endsWith('.avi')) {
    return { type: 'VIDEO', readAsText: false };
  }
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return { type: 'EXCEL', readAsText: false };
  if (lower.endsWith('.csv')) return { type: 'CSV', readAsText: true };
  if (lower.endsWith('.pdf')) return { type: 'PDF', readAsText: false };
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) return { type: 'DOCX', readAsText: false };
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp')) {
    return { type: 'IMAGE', readAsText: false };
  }
  if (lower.endsWith('.txt')) return { type: 'TXT', readAsText: true };
  return { type: 'SOP', readAsText: true };
}

function readFile(file: File, readAsText: boolean) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(String(event.target?.result || ''));
    reader.onerror = reject;
    if (readAsText) reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}

function getDocData(doc: any) {
  if (!doc) return { steps: [], rules: [], rawText: '', summary: '' };
  const raw = doc.parsedJson ?? doc.parsed_json;
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { rawText: raw };
    }
  }
  const steps = Array.isArray(parsed?.steps) ? parsed.steps : [];
  const rules = Array.isArray(parsed?.rules) ? parsed.rules : [];
  const rawText = parsed?.rawText || parsed?.content || (typeof raw === 'string' ? raw : '');
  const summary = parsed?.summary || doc.description || '';
  return { steps, rules, rawText, summary };
}

function getDocIcon(type: string) {
  const t = (type || '').toUpperCase();
  if (t === 'VIDEO' || t === 'DESKTOP_RECORDING') return <Video size={15} className="text-[#00c2d4]" />;
  if (t === 'EXCEL' || t === 'CSV') return <FileSpreadsheet size={15} className="text-[#1db87a]" />;
  if (t === 'DOCX' || t === 'PDF') return <FileText size={15} className="text-[#00c2d4]" />;
  if (t === 'IMAGE') return <Camera size={15} className="text-[#e8942a]" />;
  return <FileIcon size={15} className="text-[#8e92a4]" />;
}

export function EvidenceViewer({ worker, activeRun, onRefresh }: EvidenceViewerProps) {
  const [evidenceTab, setEvidenceTab] = useState<'documents' | 'execution'>('documents');
  const [loading, setLoading] = useState(false);
  const [compilingDocId, setCompilingDocId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(activeRun?.id || null);
  const [selectedRunDetail, setSelectedRunDetail] = useState<any>(null);
  const [selectedStepIdx, setSelectedStepIdx] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'screenshot' | 'dom' | 'rationale' | 'trace'>('screenshot');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const routeParams = typeof window !== 'undefined' ? window.location.pathname.match(/\/workers\/([^/]+)/) : null;
  const urlWorkerId = routeParams ? routeParams[1] : null;
  const workerId = worker?.id || (worker as any)?.workerId || urlWorkerId;
  const workerAliases = Array.from(new Set([workerId, ...(worker?.allIds || [])])).filter(Boolean);

  const fetchEvidence = async () => {
    if (!workerId) {
      setLoading(false);
      return;
    }
    try {
      const [evidenceRes, docRes, runsRes] = await Promise.all([
        api.getEvidence(workerId).catch(() => ({})),
        api.listDocuments(workerId).catch(() => ({ documents: [] })),
        api.listRuns().catch(() => ({ runs: [] })),
      ]);

      // Merge and deduplicate documents from all evidence and document sources
      const docsFromEvidence = evidenceRes?.evidence?.documents || [];
      const mediaDocsFromEvidence = evidenceRes?.documents || [];
      const allDocsFromEvidence = evidenceRes?.allDocuments || [];
      const docsFromList = docRes?.documents || [];
      const combinedDocs = [
        ...docsFromEvidence,
        ...mediaDocsFromEvidence,
        ...allDocsFromEvidence,
        ...docsFromList
      ];
      const seenDocIds = new Set<string>();
      const uniqueDocs: any[] = [];
      for (const d of combinedDocs) {
        if (d?.id && !seenDocIds.has(d.id)) {
          seenDocIds.add(d.id);
          uniqueDocs.push(d);
        }
      }
      setDocuments(uniqueDocs);
      if (uniqueDocs.length > 0) {
        setSelectedDoc((prev: any) => prev && uniqueDocs.some(u => u.id === prev.id) ? prev : uniqueDocs[0]);
      } else {
        setSelectedDoc(null);
      }

      // Filter and merge runs for this worker
      const runsFromEvidence = evidenceRes?.evidence?.runs || [];
      const allRuns = runsRes?.runs || [];
      const targetIds = new Set(workerAliases);
      const workerRunsFromList = allRuns.filter((r: any) => targetIds.has(r.workerId) || targetIds.has(r.worker_id));
      const combinedRuns = [...runsFromEvidence, ...workerRunsFromList];
      const seenRunIds = new Set<string>();
      const uniqueRuns: any[] = [];
      for (const r of combinedRuns) {
        if (r?.id && !seenRunIds.has(r.id)) {
          seenRunIds.add(r.id);
          uniqueRuns.push(r);
        }
      }
      setRuns(uniqueRuns);

      const targetRunId = selectedRunId || activeRun?.id || uniqueRuns[0]?.id;
      if (targetRunId) {
        setSelectedRunId(targetRunId);
        const detail = await api.getRunDetail(targetRunId).catch(() => null);
        setSelectedRunDetail(detail);
      }
    } catch (e: any) {
      console.error('Failed to load evidence:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvidence();
    const safetyTimer = setTimeout(() => setLoading(false), 2000);
    return () => clearTimeout(safetyTimer);
  }, [workerId, activeRun?.id]);

  useEffect(() => {
    if (selectedRunId) {
      api.getRunDetail(selectedRunId).then(setSelectedRunDetail).catch(() => null);
    }
  }, [selectedRunId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !workerId) return;

    setUploading(true);
    setUploadError(null);

    try {
      for (const file of files) {
        const { type, readAsText } = inferDocType(file.name);
        if (type === 'VIDEO') {
          await api.uploadEvidenceVideo(workerId, file);
        } else {
          const content = await readFile(file, readAsText);
          await api.uploadDocument(workerId, { name: file.name, type, content });
        }
      }
      await fetchEvidence();
      onRefresh?.();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload document evidence');
    } finally {
      setUploading(false);
    }
  };

  const handleCompileVideo = async (doc: any) => {
    if (!workerId || !doc?.id) return;
    setCompilingDocId(doc.id);
    try {
      let jobId = doc.parsedJson?.jobId;
      if (!jobId) {
        const analyzeRes = await api.startEvidenceAnalysis(workerId, { assetId: doc.id });
        jobId = analyzeRes?.jobId || analyzeRes?.job?.id;
      }
      if (jobId) {
        await api.compileFromEvidenceJob(workerId, jobId);
      } else {
        await api.recompileWorker(workerId);
      }
      await fetchEvidence();
      onRefresh?.();
      alert('Workflow successfully compiled from video demonstration!');
    } catch (err: any) {
      alert('Video compilation failed: ' + (err.message || err));
    } finally {
      setCompilingDocId(null);
    }
  };

  const handlePurgeAll = async () => {
    if (!workerId) return;
    if (window.confirm(`Purge all evidence files, memory, and compiled workflows for this worker? This will completely reset the worker instantly with zero timeouts.`)) {
      setDocuments([]);
      setSelectedDoc(null);
      try {
        await api.purgeWorkerMemory(workerId);
        onRefresh?.();
        await fetchEvidence();
      } catch (err: any) {
        alert('Failed to purge memory: ' + (err.message || err));
      }
    }
  };

  const handleDeleteEvidence = async (doc: any) => {
    if (!workerId || !doc?.id) return;
    if (window.confirm(`Delete evidence "${doc.name}"? This will permanently purge it and all derived operational steps and rules from worker memory.`)) {
      // Optimistically remove instantly from UI
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      if (selectedDoc?.id === doc.id) {
        setSelectedDoc(null);
      }
      try {
        await Promise.all([
          api.deleteDocument(workerId, doc.id).catch(() => null),
          api.deleteEvidenceMedia(workerId, doc.id).catch(() => null)
        ]);
        onRefresh?.();
      } catch (err: any) {
        alert('Failed to delete evidence: ' + (err.message || err));
        await fetchEvidence();
      }
    }
  };

  const currentSteps = selectedRunDetail?.steps || [];
  const currentTimeline = selectedRunDetail?.timeline || [];
  const activeStepsList = currentTimeline.length > 0 ? currentTimeline : currentSteps;
  const currentStep = activeStepsList[selectedStepIdx] || activeStepsList[0] || null;
  const currentScreenshot =
    currentStep?.screenshotUrl ||
    currentStep?.metadata?.screenshotUrl ||
    currentStep?.metadata?.outputs?.screenshotUrl ||
    null;

  return (
    <div className="flex flex-col h-full bg-[#07080c] border border-[rgba(255,255,255,0.06)] rounded-md overflow-hidden text-xs">
      {/* ── 1. Top Evidence Control & Category Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0b0d13] border-b border-[rgba(255,255,255,0.06)] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#f4f2ee]">
            <Camera size={14} className="text-[#00c2d4]" />
            <span>Forensic Evidence & Artifacts</span>
          </div>

          <span className="text-[#686b78]">/</span>

          <div className="flex items-center gap-1 bg-[#07080c] p-0.5 rounded border border-[rgba(255,255,255,0.06)]">
            <button
              onClick={() => setEvidenceTab('documents')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                evidenceTab === 'documents'
                  ? 'bg-[rgba(0,194,212,0.15)] text-[#00c2d4] font-semibold'
                  : 'text-[#8e92a4] hover:text-[#f4f2ee]'
              }`}
            >
              Uploaded Documents ({documents.length})
            </button>
            <button
              onClick={() => setEvidenceTab('execution')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                evidenceTab === 'execution'
                  ? 'bg-[rgba(0,194,212,0.15)] text-[#00c2d4] font-semibold'
                  : 'text-[#8e92a4] hover:text-[#f4f2ee]'
              }`}
            >
              Execution Evidence ({runs.length} runs)
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {uploadError && <span className="text-[10px] text-[#ff4b4b]">{uploadError}</span>}

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            multiple
            accept=".docx,.doc,.txt,.sop,.csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.mp4,.webm,.mov,.mkv,.avi,video/*"
            className="hidden"
          />

          <button
            onClick={handlePurgeAll}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-[11px] font-semibold hover:bg-red-500/20 transition-colors cursor-pointer"
            title="Purge all memory, evidence, and compiled workflows"
          >
            <Trash2 size={12} />
            <span>Purge Memory & Workflows</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[rgba(0,194,212,0.1)] border border-[rgba(0,194,212,0.3)] text-[#00c2d4] text-[11px] font-semibold hover:bg-[rgba(0,194,212,0.18)] transition-colors cursor-pointer disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                <span>Uploading...</span>
              </>
            ) : (
              <>
                <Upload size={12} />
                <span>Upload Source Evidence</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── 2. TAB A: UPLOADED SOURCE DOCUMENTS & SOPS ── */}
      {evidenceTab === 'documents' && (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 min-h-0 overflow-hidden">
          {/* Left Column: Documents Directory */}
          <div className="border-r border-[rgba(255,255,255,0.06)] bg-[#080a0e] overflow-y-auto flex flex-col">
            <div className="p-3 border-b border-[rgba(255,255,255,0.04)] flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[#686b78]">
              <span>Ingested Source Files</span>
              <span>{documents.length} Files</span>
            </div>

            <div className="p-2 flex flex-col gap-1.5">
              {documents.length === 0 ? (
                <div className="p-6 text-center text-[#8e92a4] flex flex-col items-center gap-3">
                  <FileText size={24} className="text-[#686b78]" />
                  <div>No source documents uploaded for this worker yet.</div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded bg-[#00c2d4]/10 border border-[#00c2d4]/30 text-[#00c2d4] text-xs font-semibold cursor-pointer"
                  >
                    Upload SOP or Document
                  </button>
                </div>
              ) : (
                documents.map((doc) => {
                  const isSelected = selectedDoc?.id === doc.id;
                  const docInfo = getDocData(doc);
                  const stepCount = docInfo.steps.length;
                  const ruleCount = docInfo.rules.length;

                  return (
                    <div
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      className={`group flex items-start justify-between gap-2 p-2.5 rounded text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[rgba(0,194,212,0.12)] border border-[#00c2d4]/40 text-[#f4f2ee]'
                          : 'hover:bg-[rgba(255,255,255,0.03)] border border-transparent text-[#8e92a4]'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <div className="mt-0.5 shrink-0">{getDocIcon(doc.type)}</div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="font-semibold text-xs text-[#f4f2ee] truncate">
                            {doc.name || 'Untitled Source'}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-[#686b78]">
                            <span className="uppercase px-1 py-0.2 rounded bg-[rgba(255,255,255,0.05)]">
                              {doc.type}
                            </span>
                            <span>·</span>
                            <span>{stepCount} steps</span>
                            {ruleCount > 0 && (
                              <>
                                <span>·</span>
                                <span>{ruleCount} rules</span>
                              </>
                            )}
                          </div>
                          <div className="text-[9px] font-mono text-[#4a4d5c] mt-0.5">
                            {doc.createdAt || doc.created_at
                              ? new Date(doc.createdAt || doc.created_at).toLocaleString()
                              : 'Historical Ingestion'}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteEvidence(doc);
                        }}
                        className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors cursor-pointer shrink-0 opacity-40 group-hover:opacity-100"
                        title="Delete evidence document"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right 2 Columns: Document Content, Extracted Rules & Steps Viewer */}
          <div className="md:col-span-2 flex flex-col bg-[#0b0d13] overflow-y-auto p-4 gap-4">
            {selectedDoc ? (() => {
              const docInfo = getDocData(selectedDoc);
              const isVideo = selectedDoc.type === 'VIDEO' ||
                              selectedDoc.type === 'DESKTOP_RECORDING' ||
                              Boolean(selectedDoc.name?.match(/\.(mp4|webm|mov|mkv|avi)$/i));
              return (
                <>
                  {/* Document Metadata Banner */}
                  <div className="flex items-center justify-between p-3.5 bg-[#0e1017] border border-[rgba(255,255,255,0.06)] rounded-md">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded bg-[rgba(0,194,212,0.1)] border border-[rgba(0,194,212,0.2)]">
                        {getDocIcon(selectedDoc.type)}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-[#f4f2ee]">{selectedDoc.name}</div>
                        <div className="text-[11px] font-mono text-[#8e92a4] mt-0.5">
                          Format: <span className="text-[#00c2d4] font-semibold">{selectedDoc.type}</span> · ID: {selectedDoc.id.substring(0, 13)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      {isVideo && (
                        <button
                          onClick={() => handleCompileVideo(selectedDoc)}
                          disabled={compilingDocId === selectedDoc.id}
                          className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#00c2d4]/15 hover:bg-[#00c2d4]/25 border border-[#00c2d4]/40 text-[#00c2d4] text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {compilingDocId === selectedDoc.id ? (
                            <>
                              <Loader2 size={12} className="animate-spin" />
                              <span>Compiling...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles size={12} />
                              <span>Compile Workflow</span>
                            </>
                          )}
                        </button>
                      )}
                      <span className="text-[10px] font-mono px-2 py-1 rounded bg-[rgba(29,184,122,0.1)] text-[#1db87a] border border-[rgba(29,184,122,0.25)] font-semibold uppercase">
                        Verified Source Evidence
                      </span>
                      <button
                        onClick={() => handleDeleteEvidence(selectedDoc)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-semibold transition-colors cursor-pointer"
                        title="Delete this evidence source"
                      >
                        <Trash2 size={12} />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>

                  {/* Video Demonstration Ready Card */}
                  {isVideo && docInfo.steps.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-8 bg-[#0e1017] border border-[rgba(255,255,255,0.06)] rounded-md text-center gap-3">
                      <Video size={32} className="text-[#00c2d4]/70" />
                      <div className="text-sm font-semibold text-[#f4f2ee]">Video Demonstration Ready</div>
                      <p className="text-xs text-[#8e92a4] max-w-md leading-relaxed">
                        This demonstration video has been uploaded and registered. Compile the workflow to extract procedural steps, window titles, and input rules.
                      </p>
                      <button
                        onClick={() => handleCompileVideo(selectedDoc)}
                        disabled={compilingDocId === selectedDoc.id}
                        className="flex items-center gap-2 px-4 py-2 rounded bg-[#00c2d4]/20 hover:bg-[#00c2d4]/30 border border-[#00c2d4]/50 text-[#00c2d4] text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {compilingDocId === selectedDoc.id ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            <span>Compiling Workflow (Optimized Pipeline)...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles size={14} />
                            <span>Compile Workflow from Video</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Extracted Process Steps Section */}
                  {docInfo.steps.length > 0 && (
                    <div className="flex flex-col gap-2 bg-[#0e1017] border border-[rgba(255,255,255,0.06)] rounded-md p-3.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#00c2d4] flex items-center justify-between">
                        <span>Extracted Operating Sequence</span>
                        <span className="font-mono text-[10px]">
                          {docInfo.steps.length} Actions
                        </span>
                      </div>

                      <div className="flex flex-col gap-1.5 mt-1">
                        {docInfo.steps.map(
                          (stepText: any, idx: number) => (
                            <div
                              key={idx}
                              className="flex items-start gap-2.5 p-2 rounded bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)]"
                            >
                              <span className="w-4 h-4 rounded bg-[rgba(0,194,212,0.15)] text-[#00c2d4] text-[9px] font-mono flex items-center justify-center shrink-0 mt-0.5 font-bold">
                                {idx + 1}
                              </span>
                              <span className="text-xs text-[#f4f2ee] font-mono leading-relaxed">
                                {typeof stepText === 'string' ? stepText : (stepText.description || stepText.action || JSON.stringify(stepText))}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {/* Extracted Business Rules & Constraints Section */}
                  {docInfo.rules.length > 0 && (
                    <div className="flex flex-col gap-2 bg-[#0e1017] border border-[rgba(255,255,255,0.06)] rounded-md p-3.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#e8942a]">
                        Operational Policy Rules & Exceptions
                      </div>
                      <div className="flex flex-col gap-1.5 mt-1">
                        {docInfo.rules.map(
                          (rule: any, idx: number) => (
                            <div
                              key={idx}
                              className="p-2 rounded bg-[rgba(232,148,42,0.05)] border border-[rgba(232,148,42,0.15)] text-xs text-[#e8942a]"
                            >
                              {typeof rule === 'string' ? rule : JSON.stringify(rule)}
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {/* Raw Document Text Preview */}
                  {(docInfo.rawText || docInfo.summary) && (
                    <div className="flex flex-col gap-2 bg-[#0e1017] border border-[rgba(255,255,255,0.06)] rounded-md p-3.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#8e92a4]">
                        Ingested Document Raw Content
                      </div>
                      <pre className="text-[11px] font-mono text-[#8e92a4] bg-[rgba(0,0,0,0.5)] p-3 rounded border border-[rgba(255,255,255,0.04)] whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-60">
                        {docInfo.rawText || docInfo.summary}
                      </pre>
                    </div>
                  )}
                </>
              );
            })() : (
              <div className="flex flex-col items-center justify-center h-full text-[#8e92a4] gap-2">
                <FileText size={20} className="text-[#686b78]" />
                <span>Select a document from the left rail to inspect forensic parsed evidence</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 3. TAB B: EXECUTION RUNS & FORENSIC SCREENSHOTS ── */}
      {evidenceTab === 'execution' && (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 min-h-0 overflow-hidden">
          {/* Left Column: Runs & Sequential Events */}
          <div className="border-r border-[rgba(255,255,255,0.06)] bg-[#080a0e] overflow-y-auto flex flex-col">
            {/* Run Selection Picker */}
            <div className="p-2.5 border-b border-[rgba(255,255,255,0.06)] flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#686b78]">
                Execution Runs ({runs.length})
              </span>
              <select
                value={selectedRunId || ''}
                onChange={(e) => {
                  setSelectedRunId(e.target.value);
                  setSelectedStepIdx(0);
                }}
                className="bg-[#0e1017] border border-[rgba(255,255,255,0.1)] text-[#f4f2ee] rounded px-2 py-1.5 text-xs font-mono"
              >
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    #{r.id.substring(0, 8)} · {r.state} · {new Date(r.createdAt || r.created_at).toLocaleTimeString()}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-2.5 border-b border-[rgba(255,255,255,0.04)] text-[10px] font-semibold uppercase tracking-wider text-[#686b78]">
              Execution Steps ({activeStepsList.length})
            </div>

            <div className="flex flex-col p-1.5 gap-1 overflow-y-auto flex-1">
              {activeStepsList.length === 0 ? (
                <div className="p-6 text-center text-[#8e92a4]">
                  No recorded steps for this run.
                </div>
              ) : (
                activeStepsList.map((st: any, idx: number) => {
                  const isSelected = selectedStepIdx === idx;
                  const isPassed = st.status === 'SUCCEEDED' || st.status === 'COMPLETED' || st.state === 'SUCCEEDED';
                  const isPaused = st.status === 'WAITING_FOR_HUMAN' || st.status === 'PAUSED_FOR_HUMAN' || st.state === 'WAITING_FOR_HUMAN';
                  const isFailed = st.status === 'FAILED' || st.state === 'FAILED';

                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedStepIdx(idx)}
                      className={`flex items-start gap-2.5 p-2 rounded text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[rgba(0,194,212,0.12)] border border-[#00c2d4]/40 text-[#f4f2ee]'
                          : 'hover:bg-[rgba(255,255,255,0.03)] border border-transparent text-[#8e92a4]'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center text-[9px] font-mono shrink-0 mt-0.5 font-bold ${
                          isPassed
                            ? 'bg-[rgba(29,184,122,0.15)] text-[#1db87a]'
                            : isPaused
                            ? 'bg-[rgba(232,148,42,0.2)] text-[#e8942a]'
                            : isFailed
                            ? 'bg-[rgba(255,75,75,0.2)] text-[#ff4b4b]'
                            : 'bg-[rgba(255,255,255,0.05)] text-[#8e92a4]'
                        }`}
                      >
                        {idx + 1}
                      </div>

                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-medium text-xs text-[#f4f2ee] truncate">
                          {st.name || st.stepId || st.event || st.operation || 'Step execution'}
                        </span>
                        <span className="text-[10px] font-mono text-[#686b78] truncate mt-0.5">
                          {st.metadata?.selector || st.metadata?.target || st.args?.selector || st.args?.url || 'DOM Action'}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right 2 Columns: Step Inspection & Screenshot Canvas */}
          <div className="md:col-span-2 flex flex-col bg-[#0b0d13] overflow-hidden">
            {/* View Mode Bar */}
            <div className="flex items-center justify-between p-2.5 border-b border-[rgba(255,255,255,0.06)] bg-[#080a0e] shrink-0">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setViewMode('screenshot')}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    viewMode === 'screenshot'
                      ? 'bg-[rgba(255,255,255,0.1)] text-[#f4f2ee] font-semibold'
                      : 'text-[#8e92a4] hover:text-[#f4f2ee]'
                  }`}
                >
                  Captured Screenshot
                </button>
                <button
                  onClick={() => setViewMode('dom')}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    viewMode === 'dom'
                      ? 'bg-[rgba(255,255,255,0.1)] text-[#f4f2ee] font-semibold'
                      : 'text-[#8e92a4] hover:text-[#f4f2ee]'
                  }`}
                >
                  DOM State & Diff
                </button>
                <button
                  onClick={() => setViewMode('trace')}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    viewMode === 'trace'
                      ? 'bg-[rgba(255,255,255,0.1)] text-[#f4f2ee] font-semibold'
                      : 'text-[#8e92a4] hover:text-[#f4f2ee]'
                  }`}
                >
                  Action Trace
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-[#686b78]">Step:</span>
                <span className="text-[10px] font-mono text-[#00c2d4] bg-[#00c2d4]/10 px-2 py-0.5 rounded border border-[#00c2d4]/20">
                  {selectedStepIdx + 1} of {activeStepsList.length || 1}
                </span>
              </div>
            </div>

            {/* Main Visual Surface */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center">
              {viewMode === 'screenshot' && (
                currentScreenshot ? (
                  <div className="flex flex-col items-center justify-center w-full h-full relative">
                    <img
                      src={currentScreenshot}
                      alt="Execution evidence screenshot"
                      className="max-h-[85%] max-w-full object-contain rounded border border-[rgba(255,255,255,0.1)] shadow-2xl"
                    />
                    <div className="mt-3 text-[10px] font-mono text-[#00c2d4] flex items-center gap-1.5 bg-[#0e1017] px-3 py-1 rounded border border-[#00c2d4]/30">
                      <CheckCircle2 size={11} />
                      <span>Captured Forensic Screenshot · Step {selectedStepIdx + 1}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-[#8e92a4] gap-2 p-8 text-center">
                    <Camera size={28} className="text-[#686b78]" />
                    <div>No screenshot captured for this specific step.</div>
                    <div className="text-[11px] text-[#686b78]">
                      Target: {currentStep?.metadata?.url || currentStep?.metadata?.selector || currentStep?.name || 'DOM Evaluation'}
                    </div>
                  </div>
                )
              )}

              {viewMode === 'dom' && (
                <div className="w-full h-full flex flex-col gap-3">
                  <div className="text-xs font-semibold text-[#f4f2ee] flex items-center gap-2">
                    <Code2 size={13} className="text-[#00c2d4]" />
                    <span>DOM Snapshot & Element Mutation</span>
                  </div>
                  <pre className="flex-1 bg-[#07080c] p-3 rounded border border-[rgba(255,255,255,0.06)] font-mono text-[11px] text-[#00c2d4] overflow-auto whitespace-pre-wrap leading-relaxed">
                    {currentStep?.domDiff ||
                      currentStep?.metadata?.domDiff ||
                      JSON.stringify(currentStep?.metadata || {}, null, 2)}
                  </pre>
                </div>
              )}

              {viewMode === 'trace' && (
                <div className="w-full h-full flex flex-col gap-3">
                  <div className="text-xs font-semibold text-[#f4f2ee] flex items-center gap-2">
                    <Layers size={13} className="text-[#00c2d4]" />
                    <span>Execution Payload & Machine Decision</span>
                  </div>
                  <pre className="flex-1 bg-[#07080c] p-3 rounded border border-[rgba(255,255,255,0.06)] font-mono text-[11px] text-[#f4f2ee] overflow-auto whitespace-pre-wrap leading-relaxed">
                    {JSON.stringify(currentStep || {}, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
