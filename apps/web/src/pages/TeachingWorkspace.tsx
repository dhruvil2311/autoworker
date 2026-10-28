import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, ShieldAlert, GraduationCap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from '../api.js';
import { WorkerChat } from '../components/GhostChat.js';
import { EvidencePanel } from '../components/EvidencePanel.js';
import { ProcessVisualizer } from '../components/ProcessVisualizer.js';
import { DesktopEvidenceReview } from '../components/DesktopEvidenceReview.js';

// ── Teaching step map ─────────────────────────────────────────────────────────
const TEACHING_STEPS = [
  { id: 'evidence',  label: 'Upload evidence', detail: 'SOPs, documents, instructions, procedures.' },
  { id: 'extract',   label: 'Worker understands', detail: 'Process paths and rules are extracted.' },
  { id: 'clarify',   label: 'Clarify gaps', detail: 'The worker asks about edge cases.' },
  { id: 'ready',     label: 'Ready to work', detail: 'Workflow compiled. Worker can run.' },
];

function TeachingProgress({ hasEvidence, hasPlan, isAttention, isReady }: {
  hasEvidence: boolean; hasPlan: boolean; isAttention: boolean; isReady: boolean;
}) {
  const statuses = [hasEvidence, hasPlan, !isAttention && hasPlan, isReady];

  return (
    <div style={{ padding: '16px 0' }}>
      <div style={{ position: 'relative' }}>
        {/* Connecting line */}
        <div style={{ position: 'absolute', left: 9, top: 20, bottom: 20, width: 1, background: 'rgba(255,255,255,0.05)' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {TEACHING_STEPS.map((step, i) => {
            const done = statuses[i];
            const current = !done && (statuses[i - 1] || i === 0);
            const attention = i === 2 && isAttention;
            const color = attention ? 'var(--aw-amber)' : done ? 'var(--aw-green)' : current ? 'var(--aw-teal)' : 'rgba(255,255,255,0.1)';

            return (
              <div key={step.id} style={{ display: 'flex', gap: 12, position: 'relative', zIndex: 1 }}>
                <div style={{
                  width: 19, height: 19, borderRadius: '50%', flexShrink: 0,
                  background: done ? 'rgba(29,184,122,0.15)' : attention ? 'rgba(232,148,42,0.12)' : current ? 'rgba(0,194,212,0.1)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {done ? (
                    <CheckCircle2 size={10} color="var(--aw-green)" />
                  ) : attention ? (
                    <ShieldAlert size={9} color="var(--aw-amber)" />
                  ) : (
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
                  )}
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500, color: done || current ? 'var(--aw-offwhite)' : 'rgba(180,178,190,0.3)', letterSpacing: '-0.005em' }}>
                    {step.label}
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'rgba(180,178,190,0.25)', lineHeight: 1.4, marginTop: 1 }}>
                    {step.detail}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Teaching workspace ────────────────────────────────────────────────────────
export function TeachingWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [worker, setWorker] = useState<any>(null);
  const [planObj, setPlanObj] = useState<any>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'evidence' | 'desktop-evidence' | 'process' | 'preflight'>('evidence');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [recompiling, setRecompiling] = useState(false);
  const [activating, setActivating] = useState(false);
  const [stageInfo, setStageInfo] = useState<any>(null);
  const [workflowVersion, setWorkflowVersion] = useState<any>(null);

  const loadWorkspace = async () => {
    if (!id) return;
    try {
      const [w, p, d] = await Promise.all([
        api.getWorker(id).catch(() => null),
        api.getPlan(id).catch(() => null),
        api.listDocuments(id).catch(() => ({ documents: [] })),
      ]);
      setWorker(w);
      setPlanObj(p?.planObj || p);
      setPlan(p?.plan || null);
      setDocuments(d.documents || []);

      if (w?.activeVersionId) {
        const wv = await api.getWorkflowVersion(w.activeVersionId).catch(() => null);
        setWorkflowVersion(wv);
      }
      if (p?.plan && activeTab === 'evidence') {
        setActiveTab('process');
      }
    } catch (e) {
      console.error("Failed to load workspace", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadWorkspace(); }, [id]);

  const handleActivate = async () => {
    if (!id || activating) return;
    setActivating(true);
    try {
      await api.activateWorker(id);
      await loadWorkspace();
    } catch (e: any) {
      alert(e.message || "Failed to activate worker.");
    } finally {
      setActivating(false);
    }
  };

  const handleRecompile = async () => {
    if (!id || recompiling) return;
    setRecompiling(true);
    try {
      const res = await api.recompileWorker(id);
      if (res && res.bpsId && (!res.gaps || !res.gaps.some((g: any) => g.blocking))) {
        setRecompiling(false);
        navigate(`/workers/${id}`);
        return;
      }
      pollAnalysis();
    } catch (e) {
      console.error(e);
      setRecompiling(false);
    }
  };

  const pollAnalysis = async () => {
    try {
      const res = await api.getAnalysisStage(id!);
      setStageInfo(res);
      if (res.status === "READY_FOR_REVIEW" || res.status === "ACTIVE") {
        setRecompiling(false);
        navigate(`/workers/${id}`);
      } else if (res.status === "NEEDS_CLARIFICATION") {
        setRecompiling(false);
        loadWorkspace();
      } else if (res.status === "FAILED") {
        setRecompiling(false);
        loadWorkspace();
      } else {
        setTimeout(pollAnalysis, 1000);
      }
    } catch (e) {
      console.error(e);
      setRecompiling(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', background: 'var(--aw-obsidian)' }}>
        <Loader2 size={24} color="var(--aw-teal)" className="animate-spin" />
      </div>
    );
  }

  if (!worker) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', background: 'var(--aw-obsidian)', color: 'var(--aw-offwhite)', fontFamily: 'var(--font-body)' }}>
        Worker not found
      </div>
    );
  }

  const hasEvidence = documents.length > 0;
  const hasDesktopEvidence = documents.some((d) => d.type === 'VIDEO' || d.type === 'DESKTOP_RECORDING' || d.name?.match(/\.(mp4|webm|mov|mkv)$/i)) || !!selectedJobId;
  const hasPlan = !!planObj;
  const isAttention = worker.status === 'NEEDS_CLARIFICATION';
  const isReady = hasPlan && !isAttention;

  const TABS: Array<{ id: 'evidence' | 'desktop-evidence' | 'process' | 'preflight'; label: string }> = [
    { id: 'evidence', label: 'Evidence' },
    ...(hasDesktopEvidence ? [{ id: 'desktop-evidence' as const, label: 'Desktop Intelligence' }] : []),
    ...(hasPlan ? [{ id: 'process' as const, label: 'How I work' }] : []),
    ...(hasPlan ? [{ id: 'preflight' as const, label: 'Pre-flight & Activate' }] : []),
  ];

  return (
    <div style={{ height: '100vh', width: '100vw', background: 'var(--aw-obsidian)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Top bar ────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(8,8,12,0.9)',
        backdropFilter: 'blur(10px)',
        flexShrink: 0,
        zIndex: 20,
      }}>
        {/* Left */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => navigate(`/workers/${id}`)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-body)', fontSize: 12, color: 'rgba(180,178,190,0.35)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
          >
            <ArrowLeft size={13} /> {worker.name}
          </button>
          <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GraduationCap size={13} color="rgba(0,194,212,0.5)" />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500, color: 'rgba(240,238,235,0.6)' }}>
              Teaching workspace
            </span>
          </div>
          {isAttention && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', background: 'rgba(232,148,42,0.08)', border: '1px solid rgba(232,148,42,0.2)', borderRadius: 99 }}>
              <div className="aw-pulse-amber" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--aw-amber)' }} />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--aw-amber)' }}>
                Has questions
              </span>
            </div>
          )}
        </div>

        {/* Right */}
        <div style={{ display: 'flex', gap: 10 }}>
          {hasPlan && !isAttention && (
            <button
              onClick={() => navigate(`/workers/${id}`)}
              className="aw-btn-primary"
              style={{ padding: '9px 20px', fontSize: 12 }}
            >
              Done teaching →
            </button>
          )}
          <button
            onClick={handleRecompile}
            disabled={recompiling}
            className="aw-btn-ghost"
            style={{ fontSize: 11, padding: '8px 16px' }}
          >
            {recompiling ? <><Loader2 size={12} className="animate-spin" /> Processing...</> : 'Update understanding'}
          </button>
        </div>
      </div>

      {/* ── Main columns ───────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* LEFT — Teaching sidebar (narrow) */}
        <div style={{
          width: 240, flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', flexDirection: 'column',
          background: 'rgba(15,15,21,0.5)',
        }}>
          {/* Worker identity */}
          <div style={{ padding: '20px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 8, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(0,194,212,0.4)', marginBottom: 6 }}>
              Teaching
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--aw-offwhite)' }}>
              {worker.name}
            </div>
            {worker.description && (
              <p style={{ marginTop: 4, fontFamily: 'var(--font-body)', fontSize: 11, color: 'rgba(180,178,190,0.35)', lineHeight: 1.5 }}>
                {worker.description}
              </p>
            )}
          </div>

          {/* Progress steps */}
          <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 8, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(180,178,190,0.25)', marginBottom: 14 }}>
              Teaching progress
            </div>
            <TeachingProgress hasEvidence={hasEvidence} hasPlan={hasPlan} isAttention={isAttention} isReady={isReady} />
          </div>

          {/* Evidence count */}
          {hasEvidence && (
            <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'rgba(180,178,190,0.35)' }}>
                {documents.length} document{documents.length !== 1 ? 's' : ''} uploaded
              </div>
            </div>
          )}
        </div>

        {/* CENTER — Evidence / Process tabs */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Tab bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 0,
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            padding: '0 20px',
            background: 'rgba(8,8,12,0.4)',
            flexShrink: 0,
          }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '12px 16px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
                  color: activeTab === tab.id ? 'var(--aw-teal)' : 'rgba(180,178,190,0.4)',
                  borderBottom: `2px solid ${activeTab === tab.id ? 'var(--aw-teal)' : 'transparent'}`,
                  transition: 'color 0.2s, border-color 0.2s',
                  marginBottom: -1,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
            {/* Recompiling overlay */}
            <AnimatePresence>
              {recompiling && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{
                    position: 'absolute', inset: 0, zIndex: 30,
                    background: 'rgba(8,8,12,0.88)', backdropFilter: 'blur(8px)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
                  }}
                >
                  <div style={{ position: 'relative', width: 64, height: 64 }}>
                    <div className="analysis-spinner" style={{ position: 'absolute', inset: 0, borderRadius: '50%', borderWidth: 2 }} />
                    <div className="analysis-spinner" style={{ position: 'absolute', inset: 8, borderRadius: '50%', borderWidth: 1, animationDirection: 'reverse', borderTopColor: 'var(--aw-purple)' }} />
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(0,194,212,0.5)' }}>
                    {stageInfo?.label || 'Processing evidence'}
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'rgba(180,178,190,0.3)', maxWidth: '32ch', textAlign: 'center', lineHeight: 1.5 }}>
                    {stageInfo?.details || 'Extracting rules, conditions, and actions from your documents...'}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ height: '100%', padding: activeTab === 'process' ? 0 : 24 }}
              >
                {activeTab === 'evidence' && (
                  <EvidencePanel
                    workerId={id!}
                    documents={documents}
                    onUploaded={loadWorkspace}
                    onOpenDesktopReview={(jobId) => {
                      if (jobId) setSelectedJobId(jobId);
                      setActiveTab('desktop-evidence');
                    }}
                  />
                )}
                {activeTab === 'desktop-evidence' && (
                  <DesktopEvidenceReview
                    workerId={id!}
                    jobId={selectedJobId}
                    onWorkflowCompiled={() => {
                      loadWorkspace();
                      setActiveTab('process');
                    }}
                  />
                )}
                {activeTab === 'process' && (
                  <ProcessVisualizer planObj={planObj} planRaw={plan} workflowVersion={workflowVersion} workerId={id!} onSaved={loadWorkspace} />
                )}
                {activeTab === 'preflight' && (
                  <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24, padding: '24px 0' }}>
                    {/* Header */}
                    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 16 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'rgba(0,194,212,0.08)', border: '1px solid rgba(0,194,212,0.2)', borderRadius: 12, marginBottom: 8 }}>
                        <CheckCircle2 size={11} color="var(--aw-teal)" />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--aw-teal)' }}>
                          Pre-Flight Verification
                        </span>
                      </div>
                      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--aw-offwhite)', marginBottom: 6 }}>
                        Operational Readiness Check
                      </h2>
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'rgba(180,178,190,0.45)', lineHeight: 1.5 }}>
                        Verify the digital worker's extracted rules, executable steps, and security permissions before assigning it to the production workforce.
                      </p>
                    </div>

                    {/* Preflight Specification Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                      <div style={{ background: '#0e1017', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '16px' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>
                          Assigned Role
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#f0f6fc' }}>
                          {worker.name}
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                          Department Pod
                        </div>
                      </div>

                      <div style={{ background: '#0e1017', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '16px' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>
                          Workflow Architecture
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#00c2d4', fontFamily: 'JetBrains Mono, monospace' }}>
                          Version {worker.version || '1.0'}
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                          {planObj?.steps?.length || 5} Executable Steps
                        </div>
                      </div>

                      <div style={{ background: '#0e1017', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '16px' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>
                          Safety & Sandbox
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1db87a' }}>
                          HITL Guardrails Active
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                          Auto-pauses on ambiguity
                        </div>
                      </div>
                    </div>

                    {/* What the worker understood */}
                    <div style={{ background: '#0e1017', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '20px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>
                        What the Worker Understood
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(planObj?.businessRules || [
                          "Authenticates to enterprise portal using encrypted session credentials.",
                          "Inspects order inventory flags and identifies SKU variance deficits.",
                          "Stops and requests supervisor guidance if an unrecognized exception condition occurs."
                        ]).map((rule: string, rIdx: number) => (
                          <div key={rIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12, color: 'rgba(240,238,235,0.7)', lineHeight: 1.5 }}>
                            <CheckCircle2 size={13} color="#00c2d4" style={{ flexShrink: 0, marginTop: 2 }} />
                            <span>{rule}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Activation Box */}
                    <div style={{
                      background: worker.status === 'ACTIVE' ? 'rgba(29,184,122,0.06)' : 'rgba(0,194,212,0.06)',
                      border: `1px solid ${worker.status === 'ACTIVE' ? 'rgba(29,184,122,0.3)' : 'rgba(0,194,212,0.3)'}`,
                      borderRadius: 12, padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                    }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: worker.status === 'ACTIVE' ? '#1db87a' : '#00c2d4', marginBottom: 4 }}>
                          {worker.status === 'ACTIVE' ? '✓ Worker Activated & Ready for Work' : 'Training Complete · Pending Activation'}
                        </div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', maxWidth: 440 }}>
                          {worker.status === 'ACTIVE'
                            ? 'This digital employee is active on the operations floor. You can now launch production runs from its workstation.'
                            : 'Activating will deploy the compiled workflow to the digital workforce and enable production execution.'}
                        </div>
                      </div>

                      {worker.status === 'ACTIVE' ? (
                        <button
                          onClick={() => navigate(`/workers/${id}`)}
                          className="aw-btn-primary"
                          style={{ padding: '12px 24px', fontSize: 13 }}
                        >
                          Go to Workstation & Start First Run →
                        </button>
                      ) : (
                        <button
                          onClick={handleActivate}
                          disabled={activating}
                          className="aw-btn-primary"
                          style={{ padding: '12px 24px', fontSize: 13 }}
                        >
                          {activating ? <><Loader2 size={14} className="animate-spin" /> Activating...</> : 'Activate Worker'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* RIGHT — Chat with the worker */}
        <div style={{
          width: 320, flexShrink: 0,
          borderLeft: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', flexDirection: 'column',
          background: 'rgba(8,8,12,0.3)',
        }}>
          {/* Chat header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(8,8,12,0.4)',
            flexShrink: 0,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--aw-teal)', boxShadow: '0 0 8px var(--aw-teal)' }} className="aw-breathe" />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500, color: 'rgba(240,238,235,0.7)' }}>
              Talk to {worker.name}
            </span>
          </div>

          {/* Chat */}
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            <WorkerChat
              workerId={id!}
              onInstructionAdded={loadWorkspace}
              onAllGapsResolved={() => navigate(`/workers/${id}`)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
