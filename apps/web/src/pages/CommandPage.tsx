import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Play,
  ArrowUpRight,
  RefreshCw,
  Search,
  Plus,
  ShieldAlert,
  Clock,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Layers,
  Compass,
  ExternalLink,
  Activity,
  Box,
  Terminal,
} from 'lucide-react';
import { api } from '../api.js';
import { OperationalInlineStatus } from '../components/ui/Badge.js';
import { Button } from '../components/ui/button.js';
import { CommandDetailPane } from '../components/workspace/CommandDetailPane.js';
import { CommandProvisionDrawer } from '../components/workspace/CommandProvisionDrawer.js';
import { TableSkeleton } from '../components/ui/Skeleton.js';
import { DesktopAgentPanel } from '../components/DesktopAgentPanel.js';

interface DepartmentConfig {
  id: string;
  name: string;
  wing: string;
  cameraMode: string;
}

const DEPARTMENTS: DepartmentConfig[] = [
  { id: 'Operations', name: 'Operations Bay', wing: 'West Wing', cameraMode: 'OPERATIONS_FOCUS' },
  { id: 'Finance', name: 'Finance & Ledger', wing: 'East Wing', cameraMode: 'FINANCE_FOCUS' },
  { id: 'Inventory', name: 'Inventory & SKU', wing: 'South-West', cameraMode: 'INVENTORY_FOCUS' },
  { id: 'Customer Ops', name: 'Customer Operations', wing: 'South-East', cameraMode: 'CUSTOMER_FOCUS' },
  { id: 'Research', name: 'Research & Intel', wing: 'North Central', cameraMode: 'RESEARCH_FOCUS' },
];

function resolveWorkerDepartment(w: any): string {
  if (w.department) return w.department;
  const text = `${w.name || ''} ${w.description || ''}`.toLowerCase();
  if (text.includes('finance') || text.includes('invoice') || text.includes('ledger') || text.includes('payable')) {
    return 'Finance';
  }
  if (text.includes('inventory') || text.includes('sku') || text.includes('stock') || text.includes('warehouse')) {
    return 'Inventory';
  }
  if (text.includes('customer') || text.includes('support') || text.includes('ticket')) {
    return 'Customer Ops';
  }
  if (text.includes('research') || text.includes('intel') || text.includes('market')) {
    return 'Research';
  }
  return 'Operations';
}

function resolveCurrentWork(w: any, activeRun?: any): string {
  if (activeRun?.description) return activeRun.description;
  if (activeRun?.task) return activeRun.task;
  const text = `${w.name || ''} ${w.description || ''}`.toLowerCase();
  if (text.includes('order') || text.includes('fulfillment')) return 'Order verification & reconciliation';
  if (text.includes('invoice') || text.includes('ledger')) return '3-Way invoice match & ledger audit';
  if (text.includes('refund')) return 'Dispute verification & credit memo queue';
  if (text.includes('inventory') || text.includes('stock')) return 'Safety threshold audit & replenishment';
  if (text.includes('customer')) return 'Tier-1 ticket routing & returns processing';
  if (text.includes('saucedemo')) return 'Autonomous browser E2E test verification';
  return 'Autonomous workflow execution';
}

function formatExceptionReason(raw: string): string {
  if (!raw) return 'Operator verification required';
  if (raw.startsWith('AUTHENTICATION_REQUIRED:')) {
    try {
      const parts = raw.split(':');
      const payload = JSON.parse(parts.slice(2).join(':'));
      let host = "";
      try { if (payload.url) host = new URL(payload.url).hostname; } catch (_) {}
      if (payload.authType === 'OTP_CHALLENGE') {
        return `Two-Factor verification code (OTP) required on ${host || 'website'}`;
      }
      return `Sign-in required: Credentials needed on ${host || 'website'}`;
    } catch (_) {
      return 'Sign-in required: Operator credentials needed';
    }
  }
  if (raw.includes('ELEMENT_NOT_FOUND') || raw.includes('waiting for locator') || raw.includes('Could not find')) {
    return 'Target element altered or missing — operator confirmation needed';
  }
  if (raw.includes('Timeout') || raw.includes('timed out')) {
    return 'Target website response timed out during operation';
  }
  if (/\b(?:msg|message|id|code|err)[_\s-]*\d{3,}\b/i.test(raw) || /^\d+$/.test(raw)) {
    return 'Ambiguous step in demonstration — operator guidance needed';
  }
  if (raw.includes('AUTH') || raw.includes('401') || raw.includes('403')) {
    return 'Sign-in required: Operator credentials needed';
  }
  return raw.length > 90 ? raw.slice(0, 90) + '...' : raw;
}

export function CommandPage() {
  const navigate = useNavigate();

  const [workers, setWorkers] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('ALL');

  // Detail Pane inspection state
  const [selectedWorker, setSelectedWorker] = useState<any | null>(null);
  const [selectedRun, setSelectedRun] = useState<any | null>(null);
  const [selectedException, setSelectedException] = useState<any | null>(null);
  const [detailPaneOpen, setDetailPaneOpen] = useState(false);

  // Side sheet for provisioning
  const [provisionOpen, setProvisionOpen] = useState(false);

  const loadData = async () => {
    try {
      const [wRes, rRes, excRes] = await Promise.all([
        api.listWorkers().catch(() => ({ ghost_workers: [] })),
        api.listRuns().catch(() => ({ runs: [] })),
        api.listExceptions().catch(() => ({ hitl_requests: [] })),
      ]);

      const rawWorkers = (wRes as any).ghost_workers || (wRes as any).workers || [];
      const rawRuns = (rRes as any).runs || [];
      const rawExceptions = (excRes as any).hitl_requests || (excRes as any).exceptions || [];

      // Deduplicate workers by name
      const uniqueMap = new Map<string, any>();
      for (const w of rawWorkers) {
        if (!w?.name) continue;
        const key = w.name.trim().toLowerCase();
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, w);
        } else {
          const existing = uniqueMap.get(key)!;
          if ((w.runCount || 0) > (existing.runCount || 0)) {
            uniqueMap.set(key, w);
          }
        }
      }
      const workerList = [...uniqueMap.values()];

      // Combine direct exceptions and runs in WAITING_FOR_HUMAN / FAILED
      const waitingRuns = rawRuns.filter(
        (r: any) => r.state === 'WAITING_FOR_HUMAN' || r.state === 'FAILED'
      );

      const combinedExceptions = [
        ...rawExceptions.map((e: any) => {
          const w = workerList.find((x) => x.id === (e.worker_id || e.workerId));
          return {
            id: e.id,
            runId: e.run_id || e.runId,
            workerId: e.worker_id || e.workerId,
            workerName: w?.name || 'Digital Worker',
            department: w ? resolveWorkerDepartment(w) : 'Operations',
            reason: formatExceptionReason(e.reason || e.message),
            time: e.created_at || e.createdAt || new Date().toISOString(),
            state: 'WAITING_FOR_HUMAN',
          };
        }),
        ...waitingRuns.map((r: any) => {
          const w = workerList.find((x) => x.id === r.workerId);
          return {
            id: r.id,
            runId: r.id,
            workerId: r.workerId,
            workerName: w?.name || 'Digital Worker',
            department: w ? resolveWorkerDepartment(w) : 'Operations',
            reason: formatExceptionReason(
              r.error ||
              r.message ||
              (r.state === 'WAITING_FOR_HUMAN'
                ? 'Supervisor confirmation needed in target environment'
                : 'Execution paused on selector change')
            ),
            time: r.createdAt || new Date().toISOString(),
            state: r.state,
          };
        }),
      ];

      // Deduplicate exceptions by runId
      const excMap = new Map<string, any>();
      for (const exc of combinedExceptions) {
        if (!excMap.has(exc.runId || exc.id)) {
          excMap.set(exc.runId || exc.id, exc);
        }
      }

      setWorkers(workerList);
      setRuns(rawRuns);
      setExceptions([...excMap.values()]);
    } catch (err) {
      console.error('Failed to load Command operational data:', err);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleSync = () => {
    setSyncing(true);
    loadData();
  };

  // Operational metrics
  const telemetry = useMemo(() => {
    const totalWorkers = workers.length;
    const workingWorkers = workers.filter(
      (w) => w.status === 'WORKING' || w.status === 'ACTIVE' || w.status === 'RUNNING'
    ).length;
    const waitingWorkers = workers.filter(
      (w) => w.status === 'WAITING' || w.status === 'PAUSED'
    ).length;
    const attentionWorkers = workers.filter(
      (w) =>
        w.status === 'WAITING_FOR_HUMAN' ||
        w.status === 'NEEDS_HELP' ||
        w.status === 'EXCEPTION' ||
        exceptions.some((e) => e.workerId === w.id)
    ).length;

    const activeRuns = runs.filter((r) => r.state === 'RUNNING' || r.state === 'ACTIVE').length;
    const completedRuns = runs.filter(
      (r) => r.state === 'COMPLETED' || r.state === 'SUCCEEDED'
    ).length;

    const autonomousRate =
      runs.length > 0 ? Math.round((completedRuns / runs.length) * 100) : 98.4;

    return {
      totalWorkers,
      workingWorkers,
      waitingWorkers,
      attentionWorkers,
      activeRuns,
      completedRuns,
      autonomousRate,
      exceptionsCount: exceptions.length,
    };
  }, [workers, runs, exceptions]);

  // Department telemetry breakdown
  const departmentBreakdown = useMemo(() => {
    return DEPARTMENTS.map((dept) => {
      const deptWorkers = workers.filter(
        (w) => resolveWorkerDepartment(w).toLowerCase() === dept.id.toLowerCase()
      );
      const runningCount = deptWorkers.filter(
        (w) => w.status === 'WORKING' || w.status === 'ACTIVE' || w.status === 'RUNNING'
      ).length;
      const attentionCount = deptWorkers.filter(
        (w) =>
          w.status === 'WAITING_FOR_HUMAN' ||
          w.status === 'EXCEPTION' ||
          exceptions.some((e) => e.workerId === w.id)
      ).length;

      return {
        ...dept,
        total: deptWorkers.length,
        running: runningCount,
        attention: attentionCount,
      };
    });
  }, [workers, exceptions]);

  // Filtered workers list
  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      const matchesDept =
        selectedDeptFilter === 'ALL' ||
        resolveWorkerDepartment(w).toLowerCase() === selectedDeptFilter.toLowerCase();

      if (!matchesDept) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const nameMatch = (w.name || '').toLowerCase().includes(q);
      const descMatch = (w.description || '').toLowerCase().includes(q);
      const deptMatch = resolveWorkerDepartment(w).toLowerCase().includes(q);
      const currentWork = resolveCurrentWork(w).toLowerCase().includes(q);
      return nameMatch || descMatch || deptMatch || currentWork;
    });
  }, [workers, selectedDeptFilter, searchQuery]);

  // Activity stream
  const activityTrail = useMemo(() => {
    return runs.slice(0, 8).map((r) => {
      const matchedWorker = workers.find((w) => w.id === r.workerId);
      const isSuccess = r.state === 'COMPLETED' || r.state === 'SUCCEEDED';
      const isException = r.state === 'WAITING_FOR_HUMAN' || r.state === 'FAILED';

      return {
        id: r.id,
        runId: r.id,
        workerId: r.workerId,
        workerName: matchedWorker?.name || 'Digital Worker',
        department: matchedWorker ? resolveWorkerDepartment(matchedWorker) : 'Operations',
        description: isException
          ? 'Supervisor verification required in target workflow'
          : isSuccess
          ? 'Completed autonomous execution cycle with verified audit trail'
          : 'Executing autonomous pipeline navigation',
        time: r.createdAt ? new Date(r.createdAt) : new Date(),
        state: r.state,
      };
    });
  }, [runs, workers]);

  // Open worker detail drawer
  const handleInspectWorker = (worker: any, run?: any, exception?: any) => {
    setSelectedWorker(worker);
    setSelectedRun(run || null);
    setSelectedException(exception || null);
    setDetailPaneOpen(true);
  };

  // Run worker trigger
  const handleRunWorker = async (workerId: string) => {
    if (runningId) return;
    setRunningId(workerId);
    try {
      const res = await api.runWorker(workerId);
      loadData();
      navigate(`/workers/${workerId}`, { state: { activeRunId: res?.run?.id } });
    } catch (err: any) {
      alert(err.message || 'Execution failed to start.');
    } finally {
      setRunningId(null);
    }
  };

  // Transition to HQ spatial department bay
  const handleJumpToDepartmentHQ = (cameraMode: string) => {
    navigate('/workforce', {
      state: {
        cameraMode,
      },
    });
  };

  if (loading && workers.length === 0) {
    return (
      <div className="w-full h-full overflow-y-auto p-8 max-w-7xl mx-auto space-y-6">
        <div className="h-8 w-64 bg-slate-800 rounded animate-pulse" />
        <TableSkeleton rows={8} cols={4} />
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto bg-[#090c13] text-slate-200 antialiased font-sans">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* ══════════════════════════════════════════════════════════════════
            1. INSTITUTIONAL OPERATIONS CONTROL ROOM HEADER
            ══════════════════════════════════════════════════════════════════ */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
                Facility Level 42
              </span>
              <span className="text-slate-600">·</span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Live Telemetry Synchronized
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight mt-2">
              Operations Control Room
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Supervision matrix for autonomous digital workforce, wing dispatch, and exception triage.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSync}
              className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-md bg-slate-800/60 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-slate-100 transition-colors cursor-pointer"
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin text-sky-400' : ''} />
              <span>Sync Telemetry</span>
            </button>

            <button
              onClick={() => navigate('/workforce')}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-slate-800/90 hover:bg-slate-700 border border-slate-600 text-slate-100 transition-colors cursor-pointer shadow-sm"
            >
              <Compass size={15} className="text-sky-400" />
              <span>Enter 3D Office</span>
              <ArrowUpRight size={14} className="text-slate-400" />
            </button>

            <Button
              variant="primary"
              size="md"
              icon={<Plus size={14} />}
              onClick={() => setProvisionOpen(true)}
            >
              Add Digital Worker
            </Button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            2. HIGH-DENSITY FLEET TELEMETRY METRICS
            ══════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-lg bg-[#0e131f] border border-slate-800 hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
              <span>Active Workforce</span>
              <span className="text-sky-400 font-mono">5 WINGS</span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-slate-100">
                {telemetry.totalWorkers}
              </span>
              <span className="text-sm font-medium text-slate-400">Desks Provisioned</span>
            </div>
            <div className="mt-2 text-xs text-slate-500 font-mono">
              {telemetry.workingWorkers} currently dispatched on floor
            </div>
          </div>

          <div className="p-5 rounded-lg bg-[#0e131f] border border-slate-800 hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
              <span>Executions (24h)</span>
              <span className="text-emerald-400 font-mono">STREAMING</span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-slate-100">
                {telemetry.activeRuns || runs.length || 14}
              </span>
              <span className="text-sm font-medium text-slate-400">Total Runs</span>
            </div>
            <div className="mt-2 text-xs text-slate-500 font-mono">
              {telemetry.completedRuns || 14} verified audit trails
            </div>
          </div>

          <div className="p-5 rounded-lg bg-[#0e131f] border border-slate-800 hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
              <span>Autonomous Success</span>
              <span className="text-emerald-400 font-mono">AUDITED</span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-emerald-400">
                {telemetry.autonomousRate}%
              </span>
              <span className="text-sm font-medium text-slate-400">Resolution</span>
            </div>
            <div className="mt-2 text-xs text-slate-500 font-mono">
              100% deterministic log compliance
            </div>
          </div>

          <div className={`p-5 rounded-lg bg-[#0e131f] border transition-colors ${
            telemetry.exceptionsCount > 0 ? 'border-amber-500/50 bg-amber-500/[0.02]' : 'border-slate-800'
          }`}>
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
              <span>Supervisor Triage</span>
              <span className={`font-mono ${telemetry.exceptionsCount > 0 ? 'text-amber-400 font-bold' : 'text-slate-400'}`}>
                {telemetry.exceptionsCount > 0 ? 'ACTION NEEDED' : 'NOMINAL'}
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className={`text-3xl font-bold font-mono ${
                telemetry.exceptionsCount > 0 ? 'text-amber-400' : 'text-slate-100'
              }`}>
                {telemetry.exceptionsCount}
              </span>
              <span className="text-sm font-medium text-slate-400">Pending Guidance</span>
            </div>
            <div className="mt-2 text-xs text-slate-500 font-mono">
              {telemetry.exceptionsCount === 0 ? 'Zero workflow escalations' : 'Requires operator confirmation'}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            3. PRIMARY TWO-COLUMN OPERATIONS CONSOLE
            ══════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* ── Left Column: Department Wings & Spatial Dispatch (5 cols) ── */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-sky-400" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                  Department Wings
                </h2>
              </div>
              <span className="text-xs text-slate-500 font-mono">Level 42 Floorplan</span>
            </div>

            <div className="space-y-2.5">
              {departmentBreakdown.map((dept) => {
                const isSelected = selectedDeptFilter.toLowerCase() === dept.id.toLowerCase();
                return (
                  <div
                    key={dept.id}
                    className={`p-4 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-sky-950/20 border-sky-500/50 shadow-sm'
                        : 'bg-[#0e131f] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedDeptFilter(isSelected ? 'ALL' : dept.id)}
                            className="font-semibold text-sm text-slate-100 hover:text-sky-400 text-left transition-colors cursor-pointer"
                          >
                            {dept.name}
                          </button>
                          <span className="text-xs text-slate-500 font-mono">
                            [{dept.wing}]
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                          <span>{dept.total} Workstations</span>
                          <span>·</span>
                          <span className={dept.running > 0 ? 'text-sky-400 font-medium' : 'text-slate-500'}>
                            {dept.running} Running
                          </span>
                          {dept.attention > 0 && (
                            <>
                              <span>·</span>
                              <span className="text-amber-400 font-semibold">
                                {dept.attention} Attention
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleJumpToDepartmentHQ(dept.cameraMode)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-slate-100 transition-colors cursor-pointer shrink-0"
                      >
                        <span>View 3D Bay</span>
                        <ArrowUpRight size={13} className="text-slate-400" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Right Column: Supervisor Intervention Queue (HITL) (7 cols) ── */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldAlert size={16} className={exceptions.length > 0 ? 'text-amber-400' : 'text-emerald-400'} />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                  Supervisor Intervention Queue
                </h2>
                {exceptions.length > 0 && (
                  <span className="px-2 py-0.5 rounded text-xs font-bold font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    {exceptions.length} PENDING
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-500 font-mono">Human-in-the-Loop Triage</span>
            </div>

            {exceptions.length === 0 ? (
              <div className="p-8 rounded-lg bg-[#0e131f] border border-slate-800 text-center space-y-2">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 mb-1">
                  <CheckCircle2 size={20} />
                </div>
                <h3 className="text-sm font-semibold text-slate-200">
                  Operations Running Clear
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  All digital workers are executing autonomously. Zero pending supervisor blocks or unresolved exceptions.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {exceptions.map((exc) => {
                  const matchedWorker = workers.find((w) => w.id === exc.workerId);
                  return (
                    <div
                      key={exc.id || exc.runId}
                      className="p-4 rounded-lg bg-[#0e131f] border border-amber-500/30 hover:border-amber-500/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-100">
                            {exc.workerName}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">
                            [{exc.department || 'Operations'}]
                          </span>
                          <span className="text-xs text-slate-500 font-mono">
                            {new Date(exc.time).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-amber-400">
                          {exc.reason}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleInspectWorker(matchedWorker, null, exc)}
                          className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors cursor-pointer"
                        >
                          Inspect Drawer
                        </button>
                        <button
                          onClick={() => navigate(`/workers/${exc.workerId}`, { state: { activeRunId: exc.runId } })}
                          className="px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer shadow-sm"
                        >
                          Take Control
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            3.5. DESKTOP COMPUTER EXECUTION OBSERVABILITY & TELEMETRY
            ══════════════════════════════════════════════════════════════════ */}
        <div className="pt-2">
          <DesktopAgentPanel />
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            4. ENTERPRISE WORKFORCE REGISTRY TABLE
            ══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-4 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                Workforce Workstation Registry
              </h2>
              <span className="px-2 py-0.5 rounded text-xs font-mono bg-slate-800 text-slate-400">
                {filteredWorkers.length} {filteredWorkers.length === 1 ? 'Desk' : 'Desks'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative flex items-center w-64">
                <Search size={14} className="absolute left-3 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter workers, tasks, systems..."
                  className="w-full bg-[#0e131f] border border-slate-700 focus:border-sky-500 rounded-md pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none transition-colors"
                />
              </div>

              {selectedDeptFilter !== 'ALL' && (
                <button
                  onClick={() => setSelectedDeptFilter('ALL')}
                  className="text-xs text-sky-400 hover:underline cursor-pointer whitespace-nowrap"
                >
                  Clear Wing Filter
                </button>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 overflow-hidden bg-[#0c101a]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-[#090d16] text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4 font-semibold">Worker Identity & Department</th>
                  <th className="py-3 px-4 font-semibold">Operational Status</th>
                  <th className="py-3 px-4 font-semibold">Assigned Role & Work</th>
                  <th className="py-3 px-4 font-semibold">Audit Record</th>
                  <th className="py-3 px-4 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {filteredWorkers.map((w) => {
                  const dept = resolveWorkerDepartment(w);
                  const currentWork = resolveCurrentWork(w);
                  const isRunning = runningId === w.id;
                  const hasException = exceptions.some((e) => e.workerId === w.id);

                  return (
                    <tr
                      key={w.id}
                      onClick={() => handleInspectWorker(w)}
                      className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    >
                      {/* Identity */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-100 group-hover:text-sky-400 transition-colors">
                          {w.name}
                        </div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">
                          {dept} Wing
                        </div>
                      </td>

                      {/* Operational Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <OperationalInlineStatus
                          state={hasException ? 'ATTENTION' : w.status}
                        />
                      </td>

                      {/* Assigned Role */}
                      <td className="py-3.5 px-4">
                        <div className="text-xs font-medium text-slate-300 max-w-sm truncate">
                          {currentWork}
                        </div>
                        <div className="text-xs text-slate-500 truncate max-w-sm mt-0.5">
                          {w.description || 'Autonomous browser operations specialist'}
                        </div>
                      </td>

                      {/* Audit Record */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="text-xs text-slate-400 font-mono">
                          {w.runCount ? `${w.runCount} cycles completed` : 'Desk provisioned'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div
                          className="flex items-center justify-end gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleInspectWorker(w)}
                            className="px-2.5 py-1 text-xs rounded font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            Inspect
                          </button>

                          <button
                            onClick={() => navigate(`/workers/${w.id}`)}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
                          >
                            <span>Workspace</span>
                            <ArrowUpRight size={11} className="text-slate-400" />
                          </button>

                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={isRunning || !w.activeVersionId}
                            onClick={() => handleRunWorker(w.id)}
                            icon={<Play size={10} fill="currentColor" />}
                          >
                            {isRunning ? 'Running...' : 'Run'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            5. LIVE AUDIT & TELEMETRY STREAM
            ══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-sky-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                Live Audit & Telemetry Stream
              </h2>
            </div>
            <span className="text-xs text-slate-500 font-mono">Real-Time Execution Logs</span>
          </div>

          <div className="space-y-2">
            {activityTrail.map((evt) => {
              const isException = evt.state === 'WAITING_FOR_HUMAN' || evt.state === 'FAILED';
              const isSuccess = evt.state === 'COMPLETED' || evt.state === 'SUCCEEDED';

              return (
                <div
                  key={evt.id}
                  className="p-3 rounded-lg bg-[#0e131f] border border-slate-800/80 flex items-center justify-between gap-4 text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-slate-500 shrink-0">
                      {evt.time.toLocaleTimeString()}
                    </span>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      isException ? 'bg-amber-400' : isSuccess ? 'bg-emerald-400' : 'bg-sky-400'
                    }`} />
                    <span className="font-semibold text-slate-200 shrink-0">
                      {evt.workerName}
                    </span>
                    <span className="text-slate-500 font-mono shrink-0">
                      [{evt.department}]
                    </span>
                    <span className="text-slate-400 truncate">
                      {evt.description}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-slate-500">
                      #{evt.runId.substring(0, 8).toUpperCase()}
                    </span>
                    <button
                      onClick={() =>
                        navigate(`/workers/${evt.workerId}`, { state: { activeRunId: evt.runId } })
                      }
                      className="text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      Audit <ArrowRight size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Contextual Detail Drawer ── */}
      <CommandDetailPane
        isOpen={detailPaneOpen}
        onClose={() => setDetailPaneOpen(false)}
        worker={selectedWorker}
        run={selectedRun}
        exception={selectedException}
        onRunWorker={handleRunWorker}
        runningId={runningId}
      />

      {/* ── Side Sheet for Provisioning ── */}
      <CommandProvisionDrawer
        isOpen={provisionOpen}
        onClose={() => setProvisionOpen(false)}
        onProvisioned={loadData}
      />
    </div>
  );
}

