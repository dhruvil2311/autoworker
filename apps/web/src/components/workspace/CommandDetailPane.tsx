import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Play,
  ArrowUpRight,
  GraduationCap,
  Building2,
  Cpu,
  Clock,
  ShieldAlert,
  CheckCircle2,
  Terminal,
  Layers,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { OperationalInlineStatus } from '../ui/Badge.js';
import { Button } from '../ui/button.js';

export interface CommandDetailPaneProps {
  isOpen: boolean;
  onClose: () => void;
  worker: any | null;
  run?: any | null;
  exception?: any | null;
  onRunWorker?: (workerId: string) => void;
  runningId?: string | null;
}

export function CommandDetailPane({
  isOpen,
  onClose,
  worker,
  run,
  exception,
  onRunWorker,
  runningId,
}: CommandDetailPaneProps) {
  const navigate = useNavigate();

  if (!isOpen || !worker) return null;

  // Resolve department from worker name/description
  const resolveDepartment = (w: any) => {
    const text = `${w.name || ''} ${w.description || ''}`.toLowerCase();
    if (text.includes('finance') || text.includes('invoice') || text.includes('ledger') || text.includes('payable')) {
      return { name: 'Finance & Ledger', bay: 'East Wing', mode: 'FINANCE_FOCUS' };
    }
    if (text.includes('inventory') || text.includes('sku') || text.includes('stock') || text.includes('warehouse')) {
      return { name: 'Inventory & SKU', bay: 'South-West Wing', mode: 'INVENTORY_FOCUS' };
    }
    if (text.includes('customer') || text.includes('support') || text.includes('ticket')) {
      return { name: 'Customer Operations', bay: 'South-East Wing', mode: 'CUSTOMER_FOCUS' };
    }
    return { name: 'Operations Bay', bay: 'West Wing', mode: 'OPERATIONS_FOCUS' };
  };

  const dept = resolveDepartment(worker);

  const handleGoToHQ = () => {
    onClose();
    navigate('/workforce', {
      state: {
        selectedWorkerId: worker.id,
        cameraMode: 'WORKER_DESK',
      },
    });
  };

  const handleEnterWorkstation = () => {
    onClose();
    navigate(`/workers/${worker.id}`);
  };

  const handleTeach = () => {
    onClose();
    navigate(`/workers/${worker.id}/teach`);
  };

  const isRunning = runningId === worker.id;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-hidden pointer-events-none">
        {/* Subtle Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
          className="absolute inset-0 bg-[#07080c]/60 backdrop-blur-[2px] pointer-events-auto"
        />

        {/* Side Panel */}
        <div className="fixed inset-y-0 right-0 max-w-full flex pl-8 pointer-events-none">
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="pointer-events-auto w-screen max-w-lg bg-[#0a0c12] border-l border-[rgba(255,255,255,0.08)] shadow-2xl flex flex-col justify-between"
          >
            {/* Header */}
            <div className="p-6 border-b border-[rgba(255,255,255,0.06)] flex items-start justify-between gap-4">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#00c2d4]">
                    {dept.name} · {dept.bay}
                  </span>
                  <span className="text-[#686b78]">/</span>
                  <span className="text-[10px] font-mono text-[#8e92a4]">
                    {worker.activeVersionId ? `v${worker.version || '1.0'}` : 'Untrained Desk'}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-[#f4f2ee] tracking-tight truncate">
                  {worker.name}
                </h2>
                <p className="text-xs text-[#8e92a4] mt-1 line-clamp-2 leading-relaxed">
                  {worker.description || 'General Autonomous Digital Worker assigned to operational tasks.'}
                </p>
              </div>

              <button
                onClick={onClose}
                className="p-1.5 text-[#8e92a4] hover:text-[#f4f2ee] hover:bg-[rgba(255,255,255,0.06)] rounded transition-colors cursor-pointer shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs select-none">
              {/* Operational State Section */}
              <div className="space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#686b78]">
                  Operational State
                </div>
                <div className="flex items-center justify-between py-2.5 px-3 bg-[#0e1017] border border-[rgba(255,255,255,0.05)] rounded">
                  <span className="text-[#8e92a4]">Supervisory Mode</span>
                  <OperationalInlineStatus state={worker.status} />
                </div>
              </div>

              {/* Exception Alert (if pending or active) */}
              {(exception || worker.status === 'WAITING_FOR_HUMAN' || worker.status === 'EXCEPTION') && (
                <div className="p-3.5 bg-[rgba(232,148,42,0.08)] border border-[rgba(232,148,42,0.25)] rounded space-y-1.5">
                  <div className="flex items-center gap-2 text-[#e8942a] font-semibold text-[11px] uppercase tracking-wider">
                    <ShieldAlert size={14} />
                    <span>Action Required · Operator Attention</span>
                  </div>
                  <p className="text-xs text-[#f4f2ee] leading-relaxed">
                    {exception?.reason ||
                      exception?.message ||
                      'Execution paused pending clarification or supervisor decision.'}
                  </p>
                  <div className="text-[10px] font-mono text-[#e8942a]/80 pt-1">
                    Halted at: {exception?.time ? new Date(exception.time).toLocaleTimeString() : 'Active session'}
                  </div>
                </div>
              )}

              {/* Current Task / Work Queue */}
              <div className="space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#686b78]">
                  Active Work Target & Queue
                </div>
                <div className="space-y-2 text-[#8e92a4]">
                  <div className="flex items-start justify-between py-2 border-b border-[rgba(255,255,255,0.04)]">
                    <span className="text-[#686b78]">Target System</span>
                    <span className="font-mono text-[#f4f2ee] text-right">
                      {worker.name.includes('Order') || worker.name.includes('Fulfillment')
                        ? 'Apex ERP / Logistics Web'
                        : worker.name.includes('Invoice')
                        ? 'NetSuite Ledger AP'
                        : 'Web Operations Portal'}
                    </span>
                  </div>

                  <div className="flex items-start justify-between py-2 border-b border-[rgba(255,255,255,0.04)]">
                    <span className="text-[#686b78]">Current Work</span>
                    <span className="text-[#f4f2ee] text-right font-medium">
                      {run?.description ||
                        (worker.status === 'WORKING'
                          ? 'Executing autonomous browser steps'
                          : worker.status === 'WAITING_FOR_HUMAN'
                          ? 'Waiting for supervisor confirmation'
                          : 'Idle / Awaiting scheduled trigger')}
                    </span>
                  </div>

                  <div className="flex items-start justify-between py-2 border-b border-[rgba(255,255,255,0.04)]">
                    <span className="text-[#686b78]">Total Executions</span>
                    <span className="font-mono text-[#f4f2ee]">{worker.runCount || 0} completed</span>
                  </div>
                </div>
              </div>

              {/* Execution Telemetry (if run data provided) */}
              {run && (
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#686b78]">
                    Current Execution Context
                  </div>
                  <div className="p-3 bg-[#0e1017] border border-[rgba(255,255,255,0.05)] rounded space-y-2 font-mono text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-[#686b78]">Run Identifier</span>
                      <span className="text-[#00c2d4]">#{run.id.substring(0, 10)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#686b78]">Status</span>
                      <OperationalInlineStatus state={run.state} />
                    </div>
                    {run.createdAt && (
                      <div className="flex items-center justify-between">
                        <span className="text-[#686b78]">Initiated</span>
                        <span className="text-[#8e92a4]">{new Date(run.createdAt).toLocaleTimeString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Spatial Office Placement */}
              <div className="space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#686b78]">
                  Spatial Placement in HQ
                </div>
                <div className="p-3 bg-[#0e1017] border border-[rgba(255,255,255,0.05)] rounded flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Building2 size={16} className="text-[#00c2d4]" />
                    <div>
                      <div className="font-medium text-[#f4f2ee]">{dept.name}</div>
                      <div className="text-[10px] text-[#686b78]">{dept.bay} · Dedicated Workstation</div>
                    </div>
                  </div>
                  <button
                    onClick={handleGoToHQ}
                    className="flex items-center gap-1 text-[#00c2d4] hover:underline text-[11px] font-medium cursor-pointer"
                  >
                    View in 3D <ArrowUpRight size={12} />
                  </button>
                </div>
              </div>
            </div>

            {/* Sticky Action Footer */}
            <div className="p-5 border-t border-[rgba(255,255,255,0.06)] bg-[#07080c] flex flex-col gap-2.5 shrink-0">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Building2 size={12} />}
                  onClick={handleGoToHQ}
                  className="w-full justify-center"
                >
                  Go to 3D Desk
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  icon={<GraduationCap size={12} />}
                  onClick={handleTeach}
                  className="w-full justify-center"
                >
                  Teach Worker
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  icon={<ArrowUpRight size={12} />}
                  onClick={handleEnterWorkstation}
                  className="flex-1 justify-center"
                >
                  Enter Workstation
                </Button>

                {onRunWorker && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Play size={10} fill="currentColor" />}
                    disabled={isRunning || !worker.activeVersionId}
                    onClick={() => onRunWorker(worker.id)}
                    className="border-[#00c2d4]/30 text-[#00c2d4] hover:bg-[#00c2d4]/10"
                  >
                    {isRunning ? 'Running...' : 'Run'}
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}
