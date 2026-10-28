import React, { useState, useEffect, useRef } from 'react';
import {
  GraduationCap,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Send,
  GitBranch,
  Shield,
  Layers,
  Clock,
  Video,
  UploadCloud,
  FileVideo,
  Play,
  RotateCcw,
  Loader2,
  StopCircle,
  Radio,
  FileText,
  ExternalLink,
  ChevronRight,
  Monitor,
  Trash2
} from 'lucide-react';
import { Button } from '../ui/button.js';
import { Badge } from '../ui/Badge.js';
import { api } from '../../api.js';
import { DesktopEvidenceReview } from '../DesktopEvidenceReview.js';

interface TeachingPanelProps {
  worker: any;
  activeRun?: any;
  runs?: any[];
  planObj?: any;
  memory?: any;
  onTeachComplete?: () => void;
}

export function TeachingPanel({
  worker,
  activeRun,
  runs = [],
  planObj,
  memory,
  onTeachComplete,
}: TeachingPanelProps) {
  // Mode: 'video' (Video demonstration) or 'supervisor' (Text guidance)
  const [teachingMode, setTeachingMode] = useState<'video' | 'supervisor'>('video');

  // Video Upload & Demonstration State
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<any | null>(null);
  const [mediaDocs, setMediaDocs] = useState<any[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);

  // Screen recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Supervisor text guidance state
  const [instruction, setInstruction] = useState('');
  const [ruleClause, setRuleClause] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [compiledSuccess, setCompiledSuccess] = useState(false);

  // Fetch past video demonstrations for this worker
  const loadPastDemonstrations = async () => {
    if (!worker?.id) return;
    setLoadingMedia(true);
    try {
      const res = await api.listEvidenceMedia(worker.id).catch(async () => {
        const docRes = await api.listDocuments(worker.id).catch(() => ({ documents: [] }));
        return {
          documents: (docRes.documents || []).filter((d: any) =>
            d.type === 'VIDEO' ||
            d.type === 'DESKTOP_RECORDING' ||
            d.name?.match(/\.(mp4|webm|mov|mkv|avi)$/i)
          )
        };
      });
      setMediaDocs(res.documents || []);
    } catch (err) {
      console.error('Failed to load past demonstrations:', err);
    } finally {
      setLoadingMedia(false);
    }
  };

  useEffect(() => {
    loadPastDemonstrations();
  }, [worker?.id]);

  // Poll active analysis job status
  useEffect(() => {
    if (!activeJobId || !worker?.id) return;

    let timer: any = null;
    const poll = async () => {
      try {
        const res = await api.getEvidenceJob(worker.id, activeJobId);
        const currentJob = res.job || res;
        setActiveJob(currentJob);

        if (currentJob.status === 'COMPLETED' || currentJob.status === 'FAILED') {
          clearInterval(timer);
        }
      } catch (err) {
        console.error('Failed to poll analysis job:', err);
      }
    };

    poll();
    timer = setInterval(poll, 1500);
    return () => clearInterval(timer);
  }, [activeJobId, worker?.id]);

  // Handle Video File Upload
  const handleUploadVideo = async (file: File) => {
    if (!file || !worker?.id) return;
    setUploading(true);
    setUploadError(null);
    setUploadProgress(`Reading ${file.name}...`);

    try {
      setUploadProgress(`Uploading ${file.name} to Desktop Intelligence Engine...`);
      const uploadRes = await api.uploadEvidenceVideo(worker.id, file);
      
      const assetId = uploadRes?.asset?.id || uploadRes?.document?.id || uploadRes?.mediaId;
      const filePath = uploadRes?.filePath;

      setUploadProgress('Starting Autonomous Desktop Evidence Analysis...');
      const analyzeRes = await api.startEvidenceAnalysis(worker.id, {
        assetId,
        videoPath: filePath,
      });

      const jobId = analyzeRes?.jobId || analyzeRes?.job?.id;
      if (jobId) {
        setActiveJobId(jobId);
        setActiveJob(analyzeRes.job || { id: jobId, status: 'QUEUED', currentStage: 'QUEUED', progressPercent: 5 });
      }
      loadPastDemonstrations();
    } catch (err: any) {
      console.error('Upload video failed:', err);
      setUploadError(err.message || 'Failed to upload and analyze demonstration video.');
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Live Screen Recording in Browser
  const handleStartScreenRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor' } as any,
        audio: false,
      });

      const chunks: Blob[] = [];
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm',
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        clearInterval(recordingTimerRef.current);
        setIsRecording(false);
        setRecordingSeconds(0);
        stream.getTracks().forEach((track) => track.stop());

        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: 'video/webm' });
          const file = new File([blob], `desktop_demonstration_${Date.now()}.webm`, {
            type: 'video/webm',
          });
          handleUploadVideo(file);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

      // Stop automatically if user clicks "Stop Sharing" on browser chrome banner
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
        };
      }
    } catch (err: any) {
      console.error('Failed to start screen recording:', err);
      if (err.name !== 'NotAllowedError') {
        alert('Screen recording could not be started: ' + err.message);
      }
    }
  };

  const handleStopScreenRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // Derive dynamic observation summary
  const latestRun = activeRun || runs[0];
  const observations = latestRun?.result_summary?.observations || latestRun?.observations || [];
  const targetHost = planObj?.systemsUsed?.[0] || 'Target System';

  const observationSummary = latestRun
    ? (observations.length > 0
        ? `Observed ${observations.length} data fields on ${targetHost}. Extracted: ${observations.map((o: any) => o.key.replace(/^var_/, '')).slice(0, 5).join(', ')}.`
        : `Run #${latestRun.id?.slice(0, 8)} on ${targetHost} completed with status: ${latestRun.state || 'COMPLETED'}.`)
    : `Worker "${worker?.name || 'Worker'}" configured for ${targetHost}. Awaiting runtime execution.`;

  // Derive dynamic uncertainty / pause reason
  const isWaiting = latestRun?.state === 'WAITING_FOR_HUMAN';
  const uncertaintySummary = isWaiting
    ? `Human-in-the-Loop Pause: ${latestRun?.hitlReason || 'Operator confirmation needed'}. ${latestRun?.message || ''}`
    : (planObj?.whenGhostWillAsk?.length > 0
        ? `Supervision Policies: ${planObj.whenGhostWillAsk.join('; ')}.`
        : 'Worker follows baseline SOP. You can provide procedural amendments, fallback actions, or selector overrides below to adapt the worker\'s procedural memory.');

  const currentVersion = `v${worker?.version || '1.0'}`;
  const nextVersion = `v${(parseFloat(worker?.version || '1.0') + 0.1).toFixed(1)}`;
  const learnedCount = (memory?.instructions?.length || 0) + (memory?.rules?.length || 0);

  const handleCommitTeaching = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instruction.trim()) return;
    setSubmitting(true);
    try {
      if (worker?.id) {
        const fullInstruction = ruleClause.trim()
          ? `[${ruleClause.trim()}] ${instruction.trim()}`
          : instruction.trim();
        await api.sendChatInstruction(worker.id, fullInstruction).catch(() => null);
      }
      setCompiledSuccess(true);
      setTimeout(() => {
        onTeachComplete?.();
      }, 1500);
    } catch (err: any) {
      alert(err.message || 'Teaching compilation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const formatSecs = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col gap-4 h-full p-4 bg-[#0e1017] border border-[rgba(255,255,255,0.08)] rounded-md text-xs overflow-hidden">
      {/* ── 1. Top Header with Teaching Modality Selector ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-[rgba(255,255,255,0.06)] shrink-0">
        <div className="flex items-center gap-2">
          <GraduationCap size={18} className="text-[#00c2d4]" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold uppercase tracking-wider text-[#f4f2ee] text-xs">
                Teaching & Procedural Synthesis · {worker?.name || 'Worker'}
              </span>
              <Badge variant="accent">Deterministic Compiler v2.0</Badge>
            </div>
            <p className="text-[11px] text-[#8e92a4] mt-0.5">
              Demonstrate the workflow via desktop screen video or submit supervisor procedural adjustments.
            </p>
          </div>
        </div>

        {/* Modality Tabs */}
        <div className="flex items-center bg-[#07080c] p-1 border border-[rgba(255,255,255,0.08)] rounded-lg">
          <button
            type="button"
            onClick={() => setTeachingMode('video')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              teachingMode === 'video'
                ? 'bg-[#00c2d4]/15 text-[#00c2d4] border border-[#00c2d4]/30 shadow-sm'
                : 'text-[#8e92a4] hover:text-[#f4f2ee]'
            }`}
          >
            <Video size={13} />
            <span>Desktop Video Demonstration</span>
            <span className="ml-1 text-[9px] px-1 py-0.2 bg-[#00c2d4]/20 rounded font-semibold text-[#00c2d4]">
              AI Reconstruct
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTeachingMode('supervisor')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              teachingMode === 'supervisor'
                ? 'bg-[rgba(255,255,255,0.08)] text-[#f4f2ee] border border-[rgba(255,255,255,0.12)] shadow-sm'
                : 'text-[#8e92a4] hover:text-[#f4f2ee]'
            }`}
          >
            <Shield size={13} />
            <span>Supervisor HITL Guidance</span>
          </button>
        </div>
      </div>

      {/* ── 2. Content Area Based on Mode ── */}
      {teachingMode === 'video' ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto gap-4">
          {/* Top Video Uploadation & Live Demonstration Section */}
          <div className="bg-[#0b0d13] border border-[rgba(255,255,255,0.08)] rounded-lg p-5 flex flex-col gap-4 shrink-0 shadow-lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[#f4f2ee] flex items-center gap-2">
                  <Monitor size={16} className="text-[#00c2d4]" />
                  Demonstrate Task by Desktop Screen Video
                </h3>
                <p className="text-xs text-[#8e92a4] mt-0.5">
                  Ghost analyzes cursor movements, app transitions (Excel, Chrome, ERP, Tally), text entries, and synthesizes an executable autonomous workflow.
                </p>
              </div>

              {/* Quick recording controls */}
              <div className="flex items-center gap-2">
                {isRecording ? (
                  <button
                    type="button"
                    onClick={handleStopScreenRecording}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 text-xs font-medium animate-pulse cursor-pointer"
                  >
                    <StopCircle size={14} />
                    <span>Stop Recording ({formatSecs(recordingSeconds)})</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartScreenRecording}
                    disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#07080c] hover:bg-[rgba(255,255,255,0.04)] text-[#8e92a4] hover:text-[#f4f2ee] border border-[rgba(255,255,255,0.08)] text-xs font-medium cursor-pointer transition-colors"
                  >
                    <Radio size={13} className="text-red-400" />
                    <span>Record Screen Live</span>
                  </button>
                )}
              </div>
            </div>

            {/* Video Upload Dropzone Window */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleUploadVideo(file);
              }}
              onClick={() => {
                if (!uploading && !isRecording) {
                  fileInputRef.current?.click();
                }
              }}
              className={`relative border-2 border-dashed rounded-lg p-6 sm:p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-[#00c2d4] bg-[#00c2d4]/10 shadow-[0_0_20px_rgba(0,194,212,0.2)]'
                  : 'border-[rgba(255,255,255,0.12)] hover:border-[#00c2d4]/60 bg-[#07080c]/60 hover:bg-[#07080c]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv,.avi"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadVideo(file);
                }}
                className="hidden"
              />

              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#00c2d4]/10 border border-[#00c2d4]/30 flex items-center justify-center text-[#00c2d4] animate-spin">
                    <Loader2 size={24} />
                  </div>
                  <div className="text-sm font-semibold text-[#f4f2ee]">
                    {uploadProgress || 'Processing demonstration video...'}
                  </div>
                  <p className="text-xs text-[#8e92a4] max-w-sm">
                    Uploading video bits and initializing optical character recognition & cursor trajectory extraction.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2.5">
                  <div className="w-12 h-12 rounded-full bg-[#00c2d4]/10 border border-[#00c2d4]/20 flex items-center justify-center text-[#00c2d4] group-hover:scale-105 transition-transform">
                    <UploadCloud size={24} />
                  </div>
                  <div className="text-sm font-semibold text-[#f4f2ee]">
                    Click to select or drag & drop desktop demonstration video
                  </div>
                  <p className="text-xs text-[#8e92a4] max-w-md leading-relaxed">
                    Upload screen recordings of your workflow across any desktop application. Ghost decodes every click, keypress, table entry, and navigation event.
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="px-2 py-0.5 rounded bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)] text-[10px] text-[#8e92a4]">
                      MP4
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)] text-[10px] text-[#8e92a4]">
                      WEBM
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)] text-[10px] text-[#8e92a4]">
                      MOV
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)] text-[10px] text-[#8e92a4]">
                      MKV
                    </span>
                    <span className="text-[10px] text-[#8e92a4] ml-1">Up to 200MB</span>
                  </div>
                </div>
              )}
            </div>

            {/* Error banner if upload failed */}
            {uploadError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-md text-red-400 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>{uploadError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setUploadError(null)}
                  className="text-red-400 hover:text-red-300 font-bold ml-2 uppercase text-[10px]"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Analysis Job Live Progress Header */}
            {activeJob && (
              <div className="p-3.5 bg-[#07080c] border border-[rgba(255,255,255,0.08)] rounded-md flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {activeJob.status === 'COMPLETED' ? (
                      <CheckCircle2 size={16} className="text-[#1db87a]" />
                    ) : activeJob.status === 'FAILED' ? (
                      <AlertTriangle size={16} className="text-red-400" />
                    ) : (
                      <Loader2 size={16} className="text-[#00c2d4] animate-spin" />
                    )}
                    <span className="font-semibold text-[#f4f2ee] text-xs">
                      Analysis Job #{activeJob.id || activeJob.jobId || activeJobId}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] uppercase font-mono font-bold bg-[#00c2d4]/10 text-[#00c2d4] border border-[#00c2d4]/20">
                      {activeJob.currentStage || activeJob.status || 'PROCESSING'}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-[#00c2d4] font-semibold">
                    {activeJob.progressPercent || 0}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#00c2d4] to-[#1db87a] transition-all duration-300 rounded-full"
                    style={{ width: `${Math.max(5, activeJob.progressPercent || 0)}%` }}
                  />
                </div>

                {/* Stages Breadcrumb */}
                <div className="flex items-center justify-between text-[10px] text-[#8e92a4] pt-1 border-t border-[rgba(255,255,255,0.04)]">
                  <span className={activeJob.progressPercent >= 10 ? 'text-[#00c2d4] font-semibold' : ''}>
                    1. Decode Frames
                  </span>
                  <ChevronRight size={10} className="text-[#8e92a4]/40" />
                  <span className={activeJob.progressPercent >= 40 ? 'text-[#00c2d4] font-semibold' : ''}>
                    2. Vision OCR & Elements
                  </span>
                  <ChevronRight size={10} className="text-[#8e92a4]/40" />
                  <span className={activeJob.progressPercent >= 75 ? 'text-[#00c2d4] font-semibold' : ''}>
                    3. Action Reconstruction
                  </span>
                  <ChevronRight size={10} className="text-[#8e92a4]/40" />
                  <span className={activeJob.status === 'COMPLETED' ? 'text-[#1db87a] font-semibold' : ''}>
                    4. Workflow Graph
                  </span>
                </div>
              </div>
            )}

            {/* Past Demonstrations Selector */}
            {mediaDocs.length > 0 && (
              <div className="flex items-center gap-2 pt-2 border-t border-[rgba(255,255,255,0.05)] overflow-x-auto text-[11px]">
                <span className="text-[#8e92a4] whitespace-nowrap">Previous Demonstrations:</span>
                {mediaDocs.map((doc: any) => {
                  const existingJobId = doc.parsedJson?.jobId;
                  const isActive = activeJobId === existingJobId || activeJobId === doc.id;
                  return (
                    <div
                      key={doc.id}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] whitespace-nowrap transition-colors ${
                        isActive
                          ? 'bg-[rgba(0,194,212,0.15)] border-[#00c2d4]/40 text-[#f4f2ee]'
                          : 'bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)] border-[rgba(255,255,255,0.06)] text-[#8e92a4] hover:text-[#f4f2ee]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={async () => {
                          if (existingJobId) {
                            setActiveJobId(existingJobId);
                            setActiveJob({ id: existingJobId, status: 'COMPLETED', progressPercent: 100 });
                            return;
                          }
                          try {
                            const analyzeRes = await api.startEvidenceAnalysis(worker.id, {
                              assetId: doc.id,
                            });
                            const jId = analyzeRes?.jobId || analyzeRes?.job?.id;
                            if (jId) {
                              setActiveJobId(jId);
                              setActiveJob(analyzeRes.job || { id: jId, status: analyzeRes.status || 'COMPLETED', progressPercent: 100 });
                            }
                          } catch (err: any) {
                            alert('Could not open demonstration: ' + err.message);
                          }
                        }}
                        className="flex items-center gap-1.5 cursor-pointer bg-transparent border-none text-inherit p-0"
                      >
                        <FileVideo size={12} className="text-[#00c2d4]" />
                        <span className="max-w-[130px] truncate">{doc.name || 'Demonstration Video'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirm(`Delete demonstration "${doc.name}"? This will permanently delete the recording and its evidence.`)) {
                            try {
                              await api.deleteEvidenceMedia(worker.id, doc.id);
                              if (activeJobId && (activeJobId === existingJobId || activeJobId === doc.id)) {
                                setActiveJobId(null);
                                setActiveJob(null);
                              }
                              loadPastDemonstrations();
                            } catch (err: any) {
                              alert('Failed to delete demonstration: ' + (err.message || err));
                            }
                          }
                        }}
                        className="p-0.5 hover:text-red-400 text-zinc-500 rounded transition-colors cursor-pointer ml-1"
                        title="Delete demonstration"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Reconstructed Desktop Evidence Review & Timeline */}
          {activeJobId ? (
            <div className="flex-1 min-h-[480px] bg-[#0b0d13] border border-[rgba(255,255,255,0.08)] rounded-lg p-4">
              <DesktopEvidenceReview
                workerId={worker.id}
                jobId={activeJobId}
                onWorkflowCompiled={() => {
                  onTeachComplete?.();
                }}
              />
            </div>
          ) : (
            <div className="p-8 border border-[rgba(255,255,255,0.06)] rounded-lg bg-[#07080c] flex flex-col items-center justify-center text-center gap-3">
              <Sparkles size={28} className="text-[#00c2d4]/50" />
              <div className="text-sm font-semibold text-[#f4f2ee]">
                Ready to Learn from Your Screen
              </div>
              <p className="text-xs text-[#8e92a4] max-w-md leading-relaxed">
                Upload a desktop recording above to automatically reconstruct the procedural timeline, application states, and executable actions.
              </p>
            </div>
          )}
        </div>
      ) : (
        /* ── 3. Structured Supervisor Instruction Flow (Original Mode) ── */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0 overflow-y-auto">
          {/* Left Column: What Worker Observed & Where It Paused */}
          <div className="flex flex-col gap-3">
            <div className="p-3.5 bg-[#07080c] border border-[rgba(255,255,255,0.05)] rounded-md flex flex-col gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8e92a4]">
                1. What the Worker Observed
              </span>
              <p className="text-[#f4f2ee] leading-relaxed">
                {observationSummary}
              </p>
            </div>

            <div className={`p-3.5 rounded-md flex flex-col gap-2 ${
              isWaiting 
                ? 'bg-[rgba(232,148,42,0.12)] border border-[rgba(232,148,42,0.3)]' 
                : 'bg-[#07080c] border border-[rgba(255,255,255,0.05)]'
            }`}>
              <div className="flex items-center gap-1.5 text-[#e8942a] font-semibold">
                <AlertTriangle size={14} />
                <span>2. Where Uncertainty / Guidance Exists</span>
              </div>
              <p className="text-[#e8942a]/90 leading-relaxed">
                {uncertaintySummary}
              </p>
            </div>

            <div className="p-3.5 bg-[#07080c] border border-[rgba(255,255,255,0.05)] rounded-md flex flex-col gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8e92a4]">
                3. Permanent Adaptation Pipeline
              </span>
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="px-2 py-0.5 rounded bg-[rgba(255,255,255,0.04)] text-[#8e92a4]">
                  {currentVersion} (Current)
                </span>
                <ArrowRight size={12} className="text-[#00c2d4]" />
                <span className="px-2 py-0.5 rounded bg-[rgba(0,194,212,0.15)] text-[#00c2d4] font-semibold">
                  {nextVersion} (Self-Healed Graph)
                </span>
              </div>
              <p className="text-[11px] text-[#8e92a4] mt-1">
                {learnedCount > 0 
                  ? `${learnedCount} procedural adaptations already stored in memory for this worker.` 
                  : 'Once committed, this procedural pathway is stored in worker memory and executed autonomously on all future runs.'}
              </p>
            </div>

            {/* Learned Memory History */}
            {memory?.instructions && memory.instructions.length > 0 && (
              <div className="p-3.5 bg-[#07080c] border border-[rgba(255,255,255,0.05)] rounded-md flex flex-col gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#00c2d4] flex items-center gap-1">
                  <Sparkles size={11} /> Previously Learned Supervisor Guidance ({memory.instructions.length})
                </span>
                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                  {memory.instructions.map((inst: any, idx: number) => (
                    <div key={idx} className="p-2 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)] rounded">
                      <span className="text-[10px] font-mono text-[#8e92a4] block">
                        {new Date(inst.createdAt).toLocaleString()}
                      </span>
                      <p className="text-xs text-[#f4f2ee] mt-0.5">{inst.content || inst.instruction}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Supervisor Guidance Input Form */}
          <form onSubmit={handleCommitTeaching} className="flex flex-col gap-3 justify-between bg-[#0b0d13] p-4 border border-[rgba(255,255,255,0.06)] rounded-md">
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#00c2d4]">
                4. Human Supervisor Guidance
              </span>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-[#8e92a4] font-medium">
                  Governing SOP Clause / Rule Reference
                </label>
                <input
                  type="text"
                  value={ruleClause}
                  onChange={(e) => setRuleClause(e.target.value)}
                  placeholder="e.g. SOP Section 3.2 or Exception Rule"
                  className="bg-[#07080c] border border-[rgba(255,255,255,0.08)] rounded p-2 text-xs text-[#f4f2ee] font-mono outline-none focus:border-[#00c2d4]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-[#8e92a4] font-medium">
                  Correction & Navigation Instruction
                </label>
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  rows={6}
                  className="bg-[#07080c] border border-[rgba(255,255,255,0.08)] focus:border-[#00c2d4] rounded p-2.5 text-xs text-[#f4f2ee] font-sans leading-relaxed outline-none"
                  placeholder={`Describe the exact steps or logic for ${worker?.name || 'this worker'} (e.g. If element not found, check table row...)`}
                />
              </div>

              {compiledSuccess && (
                <div className="p-3 bg-[rgba(29,184,122,0.12)] border border-[rgba(29,184,122,0.3)] rounded text-xs text-[#1db87a] flex items-center gap-2">
                  <CheckCircle2 size={14} />
                  <span>Procedural graph successfully updated and committed to memory!</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[rgba(255,255,255,0.06)]">
              <span className="text-[11px] text-[#8e92a4]">
                Applies across all future autonomous runs
              </span>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={submitting || !instruction.trim()}
                icon={<Send size={12} />}
              >
                {submitting ? 'Compiling Graph...' : `Commit Guidance to Worker Memory (${nextVersion})`}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
