import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  Play,
  GraduationCap,
  Loader2,
  Camera,
  Clock,
  BookOpen,
  Layers,
  Terminal,
  Shield,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Plus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api.js';
import { OperationalStateBadge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/button.js';
import { RunInspector } from '../components/workspace/RunInspector.js';
import { EvidenceViewer } from '../components/worker/EvidenceViewer.js';
import { TeachingPanel } from '../components/worker/TeachingPanel.js';
import { WorkerMemoryMap } from '../components/worker/WorkerMemoryMap.js';
import { WorkerHistory } from '../components/worker/WorkerHistory.js';
import { DynamicWorkerWorkspace } from '../components/worker/DynamicWorkerWorkspace.js';
import { CommandProvisionDrawer } from '../components/workspace/CommandProvisionDrawer.js';

export function WorkerWorkstation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [worker, setWorker] = useState<any>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [planObj, setPlanObj] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [memory, setMemory] = useState<any>(null);
  const [workflow, setWorkflow] = useState<any>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(location.state?.activeRunId || null);
  const [loading, setLoading] = useState(true);
  const [runningNow, setRunningNow] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [provisionDrawerOpen, setProvisionDrawerOpen] = useState(false);

  type PrimaryTab = 'work' | 'live' | 'teach' | 'evidence' | 'memory' | 'history';
  const [activeTab, setActiveTab] = useState<PrimaryTab>(
    location.state?.activeRunId ? 'live' : 'work'
  );

  // Resolve worker's operational domain
  const workerDomain = useMemo(() => {
    const text = `${worker?.name || ''} ${worker?.description || ''}`.toLowerCase();
    if (text.includes('finance') || text.includes('invoice') || text.includes('ledger') || text.includes('payable')) return 'finance';
    if (text.includes('inventory') || text.includes('sku') || text.includes('stock') || text.includes('warehouse')) return 'inventory';
    if (text.includes('customer') || text.includes('support') || text.includes('ticket')) return 'customer';
    return 'operations';
  }, [worker]);

  const loadWorkerData = async () => {
    if (!id) return;
    try {
      const [w, p, r, docsRes, memoryRes] = await Promise.all([
        api.getWorker(id).catch(() => null),
        api.getPlan(id).catch(() => null),
        api.listRuns().catch(() => ({ runs: [] })),
        api.listDocuments(id).catch(() => ({ documents: [] })),
        api.getMemory(id).catch(() => ({ memory: { rules: [], instructions: [] } })),
      ]);

      let resolvedWorker = w;
      if (!resolvedWorker) {
        const workersRes: any = await api.listWorkers().catch(() => ({}));
        const all = workersRes.workers || workersRes.ghost_workers || [];
        resolvedWorker = all.find(
          (x: any) =>
            x.id === id ||
            x.allIds?.includes(id) ||
            (x.name && worker?.name && x.name.trim().toLowerCase() === worker.name.trim().toLowerCase())
        );
      }
      if (resolvedWorker) {
        setWorker(resolvedWorker);

        // Fetch workflow definition if active version exists
        if (resolvedWorker.activeVersionId) {
          const wfRes: any = await api.getWorkflowVersion(resolvedWorker.activeVersionId).catch(() => null);
          if (wfRes?.workflow) {
            setWorkflow(wfRes.workflow);
          } else {
            setWorkflow(null);
          }
        } else {
          setWorkflow(null);
        }
      } else {
        setWorkflow(null);
      }
      setPlan(p?.plan || null);
      setPlanObj(p?.planObj || null);
      setDocuments(docsRes?.documents || []);
      setMemory(memoryRes?.memory || null);

      const allRuns = r.runs || [];
      const matchedIds = new Set<string>([
        id,
        ...(resolvedWorker?.id ? [resolvedWorker.id] : []),
        ...(resolvedWorker?.allIds || [])
      ].filter(Boolean));
      const workerRuns = allRuns
        .filter((run: any) => {
          const runWorkerId = run.workerId || run.worker_id;
          return runWorkerId && matchedIds.has(runWorkerId);
        })
        .sort((a: any, b: any) => new Date(b.createdAt || b.created_at).getTime() - new Date(a.createdAt || a.created_at).getTime());
      setRuns(workerRuns);
    } catch (err) {
      console.error('Failed to load worker data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkerData();
    const interval = setInterval(loadWorkerData, 3500);
    return () => clearInterval(interval);
  }, [id]);

  const isStaleRun = (run: any) => {
    if (!run) return true;
    const createdAt = run.createdAt || run.created_at;
    if (!createdAt) return false;
    const ageMs = Date.now() - new Date(createdAt).getTime();
    return ageMs > 15 * 60 * 1000;
  };

  const activeRun = useMemo(() => {
    if (activeRunId) {
      return runs.find((r) => r.id === activeRunId) || { id: activeRunId, state: 'RUNNING' };
    }
    const freshRunning = runs.find(
      (r) => (r.state === 'RUNNING' || r.state === 'WAITING_FOR_HUMAN') && !isStaleRun(r)
    );
    return freshRunning || null;
  }, [runs, activeRunId]);

  const isRunActive = Boolean(
    activeRun && (activeRun.state === 'RUNNING' || activeRun.state === 'STARTING')
  );

  const handleRunNow = async () => {
    if (!id || runningNow) return;
    setRunningNow(true);
    setRunError(null);
    try {
      const res = await api.runWorker(worker?.id || id, worker?.activeVersionId, worker?.trainingSource?.jobId || worker?.recordingId);
      if (res?.run?.id) {
        setActiveRunId(res.run.id);
        setActiveTab('live');
      }
    } catch (err: any) {
      setRunError(err.message || 'Failed to start execution');
    } finally {
      setRunningNow(false);
    }
  };

  const departmentName = useMemo(() => {
    if (workerDomain === 'finance') return 'Finance & Ledger';
    if (workerDomain === 'inventory') return 'Inventory & SKU';
    if (workerDomain === 'customer') return 'Customer Operations';
    return 'Operations Bay';
  }, [workerDomain]);

  if (loading && !worker) {
    return (
      <div className="flex items-center justify-center h-full bg-[#07080c] text-xs text-[#8e92a4]">
        <Loader2 size={20} className="animate-spin text-[#00c2d4] mr-2" />
        Loading worker workstation...
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full bg-[#07080c] text-[#f4f2ee] select-none overflow-hidden">
      {/* ── 1. Lightweight Contextual Header (Section 11 Specification) ── */}
      <div className="flex items-center justify-between px-6 py-2.5 bg-[#080a0e] border-b border-[rgba(255,255,255,0.06)] shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/workforce')}
            className="flex items-center gap-1.5 text-xs text-[#8e92a4] hover:text-[#f4f2ee] transition-colors cursor-pointer"
          >
            <ArrowLeft size={13} />
            <span>HQ / {departmentName}</span>
          </button>

          <span className="text-[#686b78]">/</span>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#f4f2ee] tracking-tight">
              {worker?.name || 'Digital Worker'}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[rgba(255,255,255,0.04)] text-[#8e92a4]">
              {worker?.activeVersionId ? `v${worker.version || '1.0'}` : 'v1.0'}
            </span>
            <OperationalStateBadge state={worker?.status || 'IDLE'} />

            {/* Active Training Grounding Badge */}
            {worker?.trainingSource?.type === 'VIDEO_RECORDING' || workflow?.compiler?.source_type === 'VIDEO_RECORDING' || worker?.recordingId ? (
              <div 
                className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[rgba(0,194,212,0.12)] border border-[rgba(0,194,212,0.3)] text-[#00c2d4] text-[11px] font-medium"
                title={`Active task compiled from screen recording: ${worker?.trainingSource?.name || workflow?.compiler?.source_media_name || 'Video Demonstration'}`}
              >
                <Camera size={11} className="text-[#00c2d4]" />
                <span className="truncate max-w-[240px]">
                  Learned from Video: {worker?.trainingSource?.name || workflow?.compiler?.source_media_name || 'Screen Recording'}
                </span>
              </div>
            ) : worker?.trainingSource?.type === 'DOCUMENT_SOP' || (documents && documents.length > 0) ? (
              <div 
                className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[rgba(29,184,122,0.12)] border border-[rgba(29,184,122,0.3)] text-[#1db87a] text-[11px] font-medium"
                title="Active task compiled from SOP documentation"
              >
                <BookOpen size={11} className="text-[#1db87a]" />
                <span className="truncate max-w-[240px]">
                  Learned from SOP: {worker?.trainingSource?.name || documents[0]?.name || 'Document'}
                </span>
              </div>
            ) : worker?.activeVersionId ? (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[rgba(255,255,255,0.04)] text-[#8e92a4] text-[10px] font-mono">
                <span>Active Task: v{worker.version || '1.0'}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[rgba(232,148,42,0.1)] border border-[rgba(232,148,42,0.2)] text-[#e8942a] text-[10px] font-mono">
                <AlertTriangle size={10} />
                <span>Untrained</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {runError && <span className="text-[11px] text-[#ef4444] mr-2">{runError}</span>}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setProvisionDrawerOpen(true)}
            icon={<Plus size={12} />}
            title="Add a new digital worker"
          >
            Add Worker
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setActiveTab('teach')}
            icon={<GraduationCap size={12} />}
          >
            Teach
          </Button>

          <Button
            variant="primary"
            size="sm"
            disabled={runningNow || isRunActive}
            onClick={handleRunNow}
            icon={
              runningNow || isRunActive ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Play size={11} fill="currentColor" />
              )
            }
          >
            {runningNow || isRunActive ? 'Executing...' : 'Run Work'}
          </Button>
        </div>
      </div>

      {/* ── 2. The 5 Core Operational Surfaces ── */}
      <div className="flex items-center gap-1 px-6 bg-[#0b0d13] border-b border-[rgba(255,255,255,0.06)] shrink-0">
        <button
          onClick={() => setActiveTab('work')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
            activeTab === 'work'
              ? 'border-[#00c2d4] text-[#00c2d4] font-semibold'
              : 'border-transparent text-[#8e92a4] hover:text-[#f4f2ee]'
          }`}
        >
          <Layers size={13} />
          <span>Operational Workspace</span>
        </button>

        <button
          onClick={() => setActiveTab('live')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
            activeTab === 'live'
              ? 'border-[#00c2d4] text-[#00c2d4] font-semibold'
              : 'border-transparent text-[#8e92a4] hover:text-[#f4f2ee]'
          }`}
        >
          <Terminal size={13} />
          <span>Live Task Execution</span>
          {isRunActive && <span className="w-1.5 h-1.5 rounded-full bg-[#00c2d4] animate-ping" />}
        </button>

        <button
          onClick={() => setActiveTab('teach')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
            activeTab === 'teach'
              ? 'border-[#00c2d4] text-[#00c2d4] font-semibold'
              : 'border-transparent text-[#8e92a4] hover:text-[#f4f2ee]'
          }`}
        >
          <GraduationCap size={13} />
          <span>Teach</span>
        </button>

        <button
          onClick={() => setActiveTab('evidence')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
            activeTab === 'evidence'
              ? 'border-[#00c2d4] text-[#00c2d4] font-semibold'
              : 'border-transparent text-[#8e92a4] hover:text-[#f4f2ee]'
          }`}
        >
          <Camera size={13} />
          <span>Evidence</span>
        </button>

        <button
          onClick={() => setActiveTab('memory')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
            activeTab === 'memory'
              ? 'border-[#00c2d4] text-[#00c2d4] font-semibold'
              : 'border-transparent text-[#8e92a4] hover:text-[#f4f2ee]'
          }`}
        >
          <BookOpen size={13} />
          <span>Memory & SOP</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
            activeTab === 'history'
              ? 'border-[#00c2d4] text-[#00c2d4] font-semibold'
              : 'border-transparent text-[#8e92a4] hover:text-[#f4f2ee]'
          }`}
        >
          <Clock size={13} />
          <span>History ({runs.length})</span>
        </button>
      </div>

      {/* ── 3. Active Workspace Surface ── */}
      <div className="flex-1 min-h-0 p-4 overflow-hidden">
        {activeTab === 'work' && (
          <div className="h-full">
            <DynamicWorkerWorkspace
              worker={worker}
              runs={runs}
              activeRun={activeRun}
              planObj={planObj}
              workflow={workflow}
              documents={documents}
              onInspectRun={(runId) => {
                if (runId) setActiveRunId(runId);
                setActiveTab('live');
              }}
              onRunNow={handleRunNow}
              onTeach={() => setActiveTab('teach')}
              onViewMemory={() => setActiveTab('memory')}
            />
          </div>
        )}

        {activeTab === 'live' && (
          <div className="h-full">
            {!activeRun && !activeRunId ? (
              <div className="h-full flex flex-col items-center justify-center bg-[#0b0c12] border border-[rgba(255,255,255,0.06)] rounded-lg p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-[rgba(0,194,212,0.1)] border border-[rgba(0,194,212,0.2)] flex items-center justify-center mb-4">
                  <Terminal size={22} className="text-[#00c2d4]" />
                </div>
                <h3 className="text-base font-semibold text-white mb-2">No Live Execution In Progress</h3>
                {worker?.activeVersionId ? (
                  <>
                    <p className="text-xs text-[#8e92a4] max-w-md mb-6 leading-relaxed">
                      Worker &quot;{worker?.name}&quot; is idle and ready for execution under active version v{worker?.version || '1.0'}. Click Run Work to initiate an automated task.
                    </p>
                    <div className="flex items-center gap-3">
                      <Button
                        size="sm"
                        className="bg-[#00c2d4] hover:bg-[#00acc1] text-black font-semibold text-xs"
                        onClick={handleRunNow}
                        disabled={runningNow}
                      >
                        <Play size={13} className="mr-1.5 fill-current" /> Run Work
                      </Button>
                      {runs.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-[rgba(255,255,255,0.1)] text-[#8e92a4] hover:text-white text-xs"
                          onClick={() => setActiveRunId(runs[0].id)}
                        >
                          Inspect Recent Run (#{runs[0].id.slice(0, 8)})
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-[#8e92a4] max-w-md mb-6 leading-relaxed">
                      Worker has no compiled procedure, evidence, or active workflow steps. Teach the worker by uploading a video demonstration or SOP document to begin execution.
                    </p>
                    <div className="flex items-center gap-3">
                      <Button
                        size="sm"
                        className="bg-[#00c2d4] hover:bg-[#00acc1] text-black font-semibold text-xs"
                        onClick={() => setActiveTab('teach')}
                      >
                        <GraduationCap size={13} className="mr-1.5" /> Teach Worker
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-[rgba(255,255,255,0.1)] text-[#8e92a4] hover:text-white text-xs"
                        onClick={() => setActiveTab('evidence')}
                      >
                        Upload Evidence
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <RunInspector
                worker={worker}
                runId={activeRun?.id || activeRunId}
                hasPreviousRuns={runs.length > 0}
                onClose={() => {
                  setActiveRunId(null);
                  setActiveTab('work');
                }}
                onRunAgain={handleRunNow}
                onTeach={() => setActiveTab('teach')}
                onResolved={loadWorkerData}
              />
            )}
          </div>
        )}

        {activeTab === 'teach' && (
          <TeachingPanel
            worker={worker}
            activeRun={activeRun}
            runs={runs}
            planObj={planObj}
            memory={memory}
            onTeachComplete={() => {
              loadWorkerData();
              setActiveTab('work');
            }}
          />
        )}

        {activeTab === 'evidence' && (
          <EvidenceViewer worker={worker || (id ? { id } : null)} activeRun={activeRun} onRefresh={loadWorkerData} />
        )}

        {activeTab === 'memory' && (
          <WorkerMemoryMap
            worker={worker}
            rules={planObj?.businessRules || planObj?.rules || []}
            planObj={planObj}
            memory={memory}
            documents={documents}
            workflow={workflow}
            onRefresh={loadWorkerData}
          />
        )}

        {activeTab === 'history' && (
          <WorkerHistory
            runs={runs}
            onInspectRun={(runId) => {
              setActiveRunId(runId);
              setActiveTab('evidence');
            }}
          />
        )}
      </div>

      <CommandProvisionDrawer
        isOpen={provisionDrawerOpen}
        onClose={() => setProvisionDrawerOpen(false)}
        onProvisioned={() => loadWorkerData()}
      />
    </div>
  );
}
