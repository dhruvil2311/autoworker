import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2,
  Plus,
  Play,
  Loader2,
  ShieldAlert,
  Box,
  LayoutGrid,
  Activity,
  CheckCircle2,
  Layers,
  ArrowUpRight,
  GraduationCap,
  Sparkles,
  Search,
  Filter,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api.js';
import { HQOfficeFloor3D } from '../components/workspace/HQOfficeFloor3D.js';
import { ExceptionsQueue } from '../components/workspace/ExceptionsQueue.js';
import { TasksRunsTable } from '../components/workspace/TasksRunsTable.js';
import { ActivityStream } from '../components/workspace/ActivityStream.js';
import { DataGrid, ColumnDef } from '../components/ui/DataGrid.js';
import { OperationalStateBadge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/button.js';
import { Modal } from '../components/ui/Modal.js';
import { Input } from '../components/ui/Input.js';
import { TableSkeleton } from '../components/ui/Skeleton.js';
import { WORKER_TYPES } from '../components/workspace/CommandProvisionDrawer.js';

const DEPARTMENT_PRESETS = [
  {
    id: 'Operations',
    name: 'Operations Dispatch',
    icon: '📦',
    accent: '#00c2d4',
    defaultRole: 'Order Queue Reconciler',
    desc: 'Processes incoming fulfillment orders, checks inventory statuses, and updates shipping records in ERP.',
  },
  {
    id: 'Finance',
    name: 'Corporate Finance',
    icon: '💳',
    accent: '#1db87a',
    defaultRole: 'Invoice 3-Way Matcher',
    desc: 'Cross-checks vendor POs against delivered receipts and reconciles general ledger items with audit trail.',
  },
  {
    id: 'Inventory',
    name: 'Inventory & SKU',
    icon: '📊',
    accent: '#e8942a',
    defaultRole: 'Warehouse Stock Balancer',
    desc: 'Monitors warehouse safety stock thresholds and submits automated replenishment requisitions.',
  },
  {
    id: 'Customer Ops',
    name: 'Customer Operations',
    icon: '💬',
    accent: '#8b64d4',
    defaultRole: 'Tier-1 Ticket Specialist',
    desc: 'Extracts customer issue intents, routes address change requests, and resolves order status inquiries.',
  },
];

// ── Hire & Provisioning Modal ────────────────────────────────────────────────
function HireModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (w: any) => void;
}) {
  const [selectedDept, setSelectedDept] = useState(DEPARTMENT_PRESETS[0]!);
  const [workerType, setWorkerType] = useState('WEB_BROWSER');
  const [name, setName] = useState(selectedDept.defaultRole);
  const [description, setDescription] = useState(selectedDept.desc);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSelectDept = (dept: (typeof DEPARTMENT_PRESETS)[0]) => {
    setSelectedDept(dept);
    setName(dept.defaultRole);
    setDescription(dept.desc);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Worker role name is required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const selectedType = WORKER_TYPES.find((t) => t.id === workerType);
      const payload: any = {
        name: name.trim(),
        workerType,
        department: selectedDept.name,
        capabilities: selectedType?.capabilities || ['browser', 'api', 'human'],
        safetyPolicy: {
          workerType,
          department: selectedDept.name,
          capabilities: selectedType?.capabilities || ['browser', 'api', 'human'],
        },
        triggerConfig: {
          workerType,
        },
        status: 'NEW',
      };
      if (description.trim()) {
        payload.description = description.trim();
      }
      const w = await api.createWorker(payload);
      onCreated(w);
    } catch (err: any) {
      setError(err.message || 'Failed to provision worker.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Digital Worker"
      subtitle="Deploy a new intelligent autonomous worker with full operational runtime (Live Execution, Evidence, SOP Memory)."
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Step 1: Department Selection */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-[#8e92a4] block mb-2">
            1. Select Operational Department
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DEPARTMENT_PRESETS.map((dept) => {
              const isSelected = selectedDept.id === dept.id;
              return (
                <button
                  key={dept.id}
                  type="button"
                  onClick={() => handleSelectDept(dept)}
                  className={`p-3 rounded-md text-left transition-all border cursor-pointer flex flex-col gap-1.5 ${
                    isSelected
                      ? 'bg-[rgba(0,194,212,0.12)] border-[#00c2d4] text-[#f4f2ee]'
                      : 'bg-[#07080c] border-[rgba(255,255,255,0.06)] text-[#8e92a4] hover:border-[rgba(255,255,255,0.12)]'
                  }`}
                >
                  <span className="text-lg">{dept.icon}</span>
                  <span className="text-xs font-semibold">{dept.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Worker Execution Archetype */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-[#8e92a4] block mb-2">
            2. Select Worker Execution Archetype
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {WORKER_TYPES.map((t) => {
              const isSelected = workerType === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setWorkerType(t.id)}
                  className={`p-3 rounded-md text-left transition-all border cursor-pointer flex flex-col gap-1.5 ${
                    isSelected
                      ? 'bg-[rgba(0,194,212,0.12)] border-[#00c2d4] text-[#f4f2ee]'
                      : 'bg-[#07080c] border-[rgba(255,255,255,0.06)] text-[#8e92a4] hover:border-[rgba(255,255,255,0.12)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg">{t.icon}</span>
                    <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                      isSelected ? 'bg-[#00c2d4]/20 text-[#00c2d4]' : 'bg-white/[0.04] text-[#8e92a4]'
                    }`}>
                      {t.badge}
                    </span>
                  </div>
                  <span className={`text-xs font-semibold ${isSelected ? 'text-[#f4f2ee]' : 'text-slate-200'}`}>
                    {t.name}
                  </span>
                  <span className="text-[10px] text-[#686b78] leading-tight">
                    {t.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 3: Role Details */}
        <div className="flex flex-col gap-4">
          <Input
            label="3. Digital Worker Name / Role"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Order Fulfillment Specialist"
            required
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[#8e92a4]">
              4. Operational Responsibilities & SOP Target
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe what tasks and web software this worker will operate..."
              className="w-full bg-[#0b0d13] border border-[rgba(255,255,255,0.08)] focus:border-[#00c2d4] rounded p-2.5 text-xs text-[#f4f2ee] placeholder-[#686b78] outline-none transition-colors"
            />
          </div>
        </div>

        {error && (
          <div className="p-3 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] rounded text-xs text-[#ef4444]">
            {error}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[rgba(255,255,255,0.06)]">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={submitting}>
            Deploy Digital Worker
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Main Workforce Page ──────────────────────────────────────────────────────
export function Workforce() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const currentTab = searchParams.get('tab') || 'overview';
  const actionParam = searchParams.get('action');

  const [workers, setWorkers] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [showHireModal, setShowHireModal] = useState(actionParam === 'hire');
  const [viewMode, setViewMode] = useState<'3d' | 'grid'>('3d');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');

  const loadData = async () => {
    try {
      const [wRes, rRes] = await Promise.all([
        api.listWorkers().catch(() => ({ ghost_workers: [] })),
        api.listRuns().catch(() => ({ runs: [] })),
      ]);
      const rawList = (wRes as any).ghost_workers || (wRes as any).workers || [];
      const rawRuns = (rRes as any).runs || [];

      // Strictly deduplicate workers
      const uniqueMap = new Map<string, any>();
      for (const w of rawList) {
        if (!w?.name) continue;
        const key = w.name.trim().toLowerCase();
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, w);
        } else {
          const existing = uniqueMap.get(key)!;
          if (
            (!existing.activeVersionId && w.activeVersionId) ||
            (w.runCount || 0) > (existing.runCount || 0)
          ) {
            uniqueMap.set(key, w);
          }
        }
      }
      setWorkers([...uniqueMap.values()]);
      setRuns(rawRuns);
    } catch (err) {
      console.error('Failed to load workforce:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3500);
    return () => clearInterval(interval);
  }, []);

  const handleRun = async (e: React.MouseEvent, workerId: string) => {
    e.stopPropagation();
    if (runningId) return;
    setRunningId(workerId);
    try {
      const res = await api.runWorker(workerId);
      const targetWorkerId = res?.workerId || workerId;
      navigate(`/workers/${targetWorkerId}`, { state: { activeRunId: res?.run?.id } });
    } catch (err: any) {
      alert(err.message || 'Failed to start execution.');
    } finally {
      setRunningId(null);
    }
  };

  // Operational metrics calculation
  const metrics = useMemo(() => {
    const totalWorkers = workers.length;
    const activeExecutions = runs.filter(
      (r) => r.state === 'RUNNING' || r.state === 'ACTIVE' || r.state === 'STARTING'
    ).length;
    const attentionNeeded = workers.filter(
      (w) =>
        w.status === 'WAITING_FOR_HUMAN' ||
        w.status === 'NEEDS_CLARIFICATION' ||
        w.status === 'EXCEPTION'
    ).length;
    const completedRuns = runs.filter((r) => r.state === 'COMPLETED' || r.state === 'SUCCEEDED').length;
    const successRate = runs.length > 0 ? Math.round((completedRuns / runs.length) * 100) : 100;

    return { totalWorkers, activeExecutions, attentionNeeded, successRate, totalRuns: runs.length };
  }, [workers, runs]);

  // Filtered workers by department
  const filteredWorkers = useMemo(() => {
    if (departmentFilter === 'all') return workers;
    return workers.filter((w) => {
      const text = `${w.name} ${w.description || ''}`.toLowerCase();
      if (departmentFilter === 'operations') return text.includes('order') || text.includes('dispatch') || text.includes('fulfill') || text.includes('qa') || text.includes('sauce');
      if (departmentFilter === 'finance') return text.includes('finance') || text.includes('invoice') || text.includes('ledger') || text.includes('payable');
      if (departmentFilter === 'inventory') return text.includes('inventory') || text.includes('sku') || text.includes('stock') || text.includes('warehouse');
      if (departmentFilter === 'customer') return text.includes('customer') || text.includes('support') || text.includes('ticket');
      return true;
    });
  }, [workers, departmentFilter]);

  // Data grid column definitions
  const columns: ColumnDef<any>[] = [
    {
      key: 'name',
      header: 'Digital Worker Identity',
      sortable: true,
      render: (w) => (
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded bg-white/[0.06] border border-white/[0.12] flex items-center justify-center text-[#f4f2ee] font-semibold text-xs shrink-0 shadow-sm">
            {w.name.charAt(0)}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-xs text-[#f4f2ee] truncate">{w.name}</span>
            <span className="text-[10px] text-[#8e92a4] truncate max-w-xs">
              {w.description || 'Autonomous Workstation Session'}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Operational State',
      sortable: true,
      width: '140px',
      render: (w) => <OperationalStateBadge state={w.status} />,
    },
    {
      key: 'workerType',
      header: 'Worker Archetype',
      width: '160px',
      render: (w) => {
        const type = w.workerType || w.safetyPolicy?.workerType || w.triggerConfig?.workerType;
        if (type === 'DESKTOP_AGENT') {
          return (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <span>🖥️</span> Desktop Agent
            </span>
          );
        }
        if (type === 'HYBRID_HITL') {
          return (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <span>🛡️</span> Hybrid HITL
            </span>
          );
        }
        if (type === 'API_PIPELINE') {
          return (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <span>⚡</span> API / MCP
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <span>🌐</span> Browser Agent
          </span>
        );
      },
    },
    {
      key: 'version',
      header: 'Workflow Version',
      width: '130px',
      render: (w) => (
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)] text-[#8e92a4]">
          {w.activeVersionId ? `v${w.version || '1.0'}` : 'Untrained'}
        </span>
      ),
    },
    {
      key: 'runs',
      header: 'Executions',
      sortable: true,
      width: '100px',
      render: (w) => (
        <span className="font-mono text-xs text-[#f4f2ee]">{w.runCount || 0}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '180px',
      render: (w) => {
        const isRunning = runningId === w.id;
        return (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/workers/${w.id}`)}
            >
              Open <ArrowUpRight size={11} />
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={isRunning}
              disabled={isRunning || !w.activeVersionId}
              onClick={(e) => handleRun(e, w.id)}
              icon={<Play size={10} fill="currentColor" />}
            >
              Run
            </Button>
          </div>
        );
      },
    },
  ];

  if (loading && workers.length === 0) {
    return <TableSkeleton rows={8} cols={5} />;
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* ── 1. EXECUTIVE OPERATIONAL TELEMETRY SURFACE ── */}
      <div className="w-full bg-[#0b0e15] border border-white/[0.08] rounded-lg p-4 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 divide-y md:divide-y-0 md:divide-x divide-white/[0.06]">
          {/* Active Workstations */}
          <div className="flex flex-col justify-between pt-2 md:pt-0 md:px-3">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e94a0]">
                Workstation Roster
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-bold font-mono text-[#f4f2ee]">
                {metrics.totalWorkers}
              </span>
              <span className="text-xs text-[#8e92a4]">desks provisioned</span>
            </div>
          </div>

          {/* Active Executions */}
          <div className="flex flex-col justify-between pt-2 md:pt-0 md:px-3">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#60a5fa] animate-pulse" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e94a0]">
                Live Executions
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-bold font-mono text-[#60a5fa]">
                {metrics.activeExecutions}
              </span>
              <span className="text-xs text-[#8e92a4]">concurrent tasks</span>
            </div>
          </div>

          {/* Human Supervision Queue */}
          <div className="flex flex-col justify-between pt-2 md:pt-0 md:px-3">
            <div className="flex items-center gap-2">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  metrics.attentionNeeded > 0 ? 'bg-[#f59e0b]' : 'bg-[#10b981]'
                }`}
              />
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e94a0]">
                Human Guidance (HITL)
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span
                className={`text-2xl font-bold font-mono ${
                  metrics.attentionNeeded > 0 ? 'text-[#f59e0b]' : 'text-[#f4f2ee]'
                }`}
              >
                {metrics.attentionNeeded}
              </span>
              <span className="text-xs text-[#8e92a4]">pending supervisor</span>
            </div>
          </div>

          {/* Autonomous Success Rate */}
          <div className="flex flex-col justify-between pt-2 md:pt-0 md:px-3">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e94a0]">
                Success Accuracy
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-bold font-mono text-[#10b981]">
                {metrics.successRate}%
              </span>
              <span className="text-xs text-[#8e92a4]">{metrics.totalRuns} total runs</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. SUB-VIEW ROUTING (Tasks, Exceptions, Activity, Overview) ── */}
      {currentTab === 'tasks' ? (
        <TasksRunsTable />
      ) : currentTab === 'exceptions' ? (
        <ExceptionsQueue onResolve={loadData} />
      ) : currentTab === 'activity' ? (
        <ActivityStream runs={runs} workers={workers} />
      ) : (
        /* Default: Overview & Operations Bay */
        <div className="flex flex-col gap-5">
          {/* Controls Bar: Department Filters, 3D vs Grid Switcher & Provision Button */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
            {/* Department Facet Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0">
              {[
                { id: 'all', label: 'All Departments' },
                { id: 'operations', label: 'Operations Bay' },
                { id: 'finance', label: 'Finance & Ledger' },
                { id: 'inventory', label: 'Inventory & SKU' },
                { id: 'customer', label: 'Customer Ops' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDepartmentFilter(tab.id)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                    departmentFilter === tab.id
                      ? 'bg-white/[0.1] text-[#f4f2ee] font-semibold border border-white/[0.15]'
                      : 'text-[#8e92a4] hover:text-[#f4f2ee] hover:bg-white/[0.04]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* View Mode Switcher + Provision Action */}
            <div className="flex items-center gap-3 shrink-0 ml-auto">
              <div className="flex bg-[#0b0d13] border border-white/[0.08] rounded p-0.5">
                <button
                  onClick={() => setViewMode('3d')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium cursor-pointer transition-all ${
                    viewMode === '3d'
                      ? 'bg-[#f4f2ee] text-[#080a0e] font-semibold shadow-sm'
                      : 'text-[#8e92a4] hover:text-[#f4f2ee]'
                  }`}
                >
                  <Box size={13} /> 3D Spatial Floor
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium cursor-pointer transition-all ${
                    viewMode === 'grid'
                      ? 'bg-[#f4f2ee] text-[#080a0e] font-semibold shadow-sm'
                      : 'text-[#8e92a4] hover:text-[#f4f2ee]'
                  }`}
                >
                  <LayoutGrid size={13} /> Tactical Grid
                </button>
              </div>

              <Button
                variant="primary"
                size="sm"
                icon={<Plus size={13} />}
                onClick={() => setShowHireModal(true)}
              >
                Add Digital Worker
              </Button>
            </div>
          </div>

          {/* 3D Spatial Workplace Floor */}
          {viewMode === '3d' && (
            <div className="flex flex-col gap-2">
              <HQOfficeFloor3D
                workers={filteredWorkers}
                onHire={() => setShowHireModal(true)}
                onRunWorker={handleRun}
                runningId={runningId}
              />
            </div>
          )}

          {/* Tactical Operational Data Grid */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#8e92a4]">
                Assigned Workers ({filteredWorkers.length})
              </span>
            </div>

            <DataGrid
              data={filteredWorkers}
              columns={columns}
              keyExtractor={(w) => w.id}
              searchableKey="name"
              searchPlaceholder="Filter workers by role..."
              onRowClick={(w) => navigate(`/workers/${w.id}`)}
              emptyMessage="No digital workers found for the selected department."
            />
          </div>
        </div>
      )}

      {/* Provisioning Modal */}
      <HireModal
        isOpen={showHireModal}
        onClose={() => {
          setShowHireModal(false);
          if (actionParam) setSearchParams({});
        }}
        onCreated={(w) => {
          setShowHireModal(false);
          navigate(`/workers/${w.id}`);
        }}
      />
    </div>
  );
}
