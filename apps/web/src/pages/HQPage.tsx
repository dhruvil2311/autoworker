import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Building2,
  Plus,
  Play,
  ArrowUpRight,
  ShieldAlert,
  CheckCircle2,
  Loader2,
  X,
  Compass,
  ArrowLeft,
  Terminal,
  ChevronRight,
} from 'lucide-react';
import { api } from '../api.js';
import { WorkforceHQScene } from '../components/workspace/WorkforceHQScene.js';
import { HQCameraMode } from '../components/workspace/HQCameraController.js';
import { Button } from '../components/ui/button.js';
import { CommandDetailPane } from '../components/workspace/CommandDetailPane.js';
import { CommandProvisionDrawer } from '../components/workspace/CommandProvisionDrawer.js';

const DEPARTMENTS = [
  { id: 'all', mode: 'HQ_WIDE' as HQCameraMode, name: 'HQ Campus', count: '5 Wings' },
  { id: 'war', mode: 'WAR_ROOM_FOCUS' as HQCameraMode, name: 'Command Wall', count: 'Live Telemetry' },
  { id: 'ops', mode: 'OPERATIONS_FOCUS' as HQCameraMode, name: 'Operations Bay', count: 'West Wing' },
  { id: 'fin', mode: 'FINANCE_FOCUS' as HQCameraMode, name: 'Finance & Ledger', count: 'East Wing' },
  { id: 'inv', mode: 'INVENTORY_FOCUS' as HQCameraMode, name: 'Inventory & SKU', count: 'South-West' },
  { id: 'cust', mode: 'CUSTOMER_FOCUS' as HQCameraMode, name: 'Customer Ops', count: 'South-East' },
  { id: 'res', mode: 'RESEARCH_FOCUS' as HQCameraMode, name: 'Executive Hub', count: 'North Central' },
];

export function HQPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [workers, setWorkers] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);

  const [cameraMode, setCameraMode] = useState<HQCameraMode>(
    location.state?.cameraMode || (location.state?.selectedWorkerId ? 'WORKER_DESK' : 'HQ_WIDE')
  );
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(
    location.state?.selectedWorkerId || null
  );
  const [showProvisionDrawer, setShowProvisionDrawer] = useState(false);
  const [detailPaneOpen, setDetailPaneOpen] = useState(Boolean(location.state?.selectedWorkerId));

  useEffect(() => {
    if (location.state?.selectedWorkerId) {
      setSelectedWorkerId(location.state.selectedWorkerId);
      setCameraMode('WORKER_DESK');
      setDetailPaneOpen(true);
    } else if (location.state?.cameraMode) {
      setCameraMode(location.state.cameraMode);
      setSelectedWorkerId(null);
      setDetailPaneOpen(false);
    }
  }, [location.state]);

  // Load workers and runs
  const loadData = async () => {
    try {
      const [wRes, rRes] = await Promise.all([
        api.listWorkers().catch(() => ({ ghost_workers: [] })),
        api.listRuns().catch(() => ({ runs: [] })),
      ]);
      const rawWorkers = (wRes as any).ghost_workers || (wRes as any).workers || [];
      const rawRuns = (rRes as any).runs || [];

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
      setWorkers([...uniqueMap.values()]);
      setRuns(rawRuns);
    } catch (err) {
      console.error('Failed to load HQ data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, []);

  const selectedWorker = useMemo(() => {
    return workers.find((w) => w.id === selectedWorkerId) || null;
  }, [workers, selectedWorkerId]);

  // Handle clicking on a worker desk in 3D
  const handleSelectWorker = (workerId: string) => {
    setSelectedWorkerId(workerId);
    setCameraMode('WORKER_DESK');
    setDetailPaneOpen(true);
  };

  // Handle entering the dedicated worker workspace
  const handleEnterWorker = (workerId: string) => {
    navigate(`/workers/${workerId}`);
  };

  // Run execution handler
  const handleRunWorker = async (workerId: string) => {
    if (runningId) return;
    setRunningId(workerId);
    try {
      const worker = workers.find((item) => item.id === workerId);
      const res = await api.runWorker(workerId, worker?.activeVersionId, worker?.trainingSource?.jobId || worker?.recordingId);
      navigate(`/workers/${workerId}`, { state: { activeRunId: res?.run?.id } });
    } catch (err: any) {
      alert(err.message || 'Execution failed to start.');
    } finally {
      setRunningId(null);
    }
  };

  // Reset to wider department or HQ view
  const handleResetCamera = (mode: HQCameraMode) => {
    setCameraMode(mode);
    if (mode !== 'WORKER_DESK') {
      setSelectedWorkerId(null);
      setDetailPaneOpen(false);
    }
  };

  const currentDeptName = useMemo(() => {
    const dept = DEPARTMENTS.find((d) => d.mode === cameraMode);
    return dept?.name || 'HQ Campus';
  }, [cameraMode]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#07080c] select-none">
      {/* ── 1. The 3D Digital Workplace (100% Screen Ownership) ── */}
      <div className="w-full h-full">
        <WorkforceHQScene
          workers={workers}
          runs={runs}
          cameraMode={cameraMode}
          selectedWorkerId={selectedWorkerId}
          onSelectWorker={handleSelectWorker}
          onEnterWorker={handleEnterWorker}
          onRunWorker={(e, wid) => handleRunWorker(wid)}
          runningId={runningId}
        />
      </div>

      {/* ── 2. Top-Left Spatial Breadcrumb (Context Awareness) ── */}
      <div className="absolute top-4 left-6 z-30 flex items-center gap-2 px-3 py-1.5 bg-[#080a0e]/90 backdrop-blur-md border border-[rgba(255,255,255,0.08)] rounded-md text-xs font-mono text-[#8e92a4]">
        <Building2 size={13} className="text-[#a3a8b8]" />
        <span>Operations HQ</span>
        <ChevronRight size={12} className="text-[#555a68]" />
        <span className="text-[#f4f2ee] font-medium">{currentDeptName}</span>
        {selectedWorker && (
          <>
            <ChevronRight size={12} className="text-[#555a68]" />
            <span className="text-[#60a5fa] font-semibold">{selectedWorker.name}</span>
          </>
        )}
        {cameraMode !== 'HQ_WIDE' && (
          <button
            onClick={() => handleResetCamera('HQ_WIDE')}
            className="ml-2 text-[11px] text-[#93c5fd] hover:text-white transition-colors cursor-pointer"
          >
            [Reset to Campus]
          </button>
        )}
      </div>

      {/* ── 3. Minimalist Spatial Navigation Bar (Floating Bottom HUD) ── */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 p-1 bg-[#080a0e]/90 backdrop-blur-md border border-[rgba(255,255,255,0.08)] rounded-lg shadow-2xl max-w-[95vw] overflow-x-auto">
        <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-mono text-[#8e92a4] border-r border-[rgba(255,255,255,0.08)] shrink-0">
          <Compass size={12} className="text-[#a3a8b8]" />
          <span className="hidden sm:inline tracking-wider">FACILITY WINGS</span>
        </div>

        {DEPARTMENTS.map((dept) => {
          const isActive = cameraMode === dept.mode && !selectedWorkerId;
          return (
            <button
              key={dept.id}
              onClick={() => handleResetCamera(dept.mode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-[#f4f2ee] text-[#080a0e] font-semibold shadow-sm'
                  : 'text-[#8e92a4] hover:text-[#f4f2ee] hover:bg-[rgba(255,255,255,0.04)]'
              }`}
            >
              <span>{dept.name}</span>
              <span className={`text-[10px] ${isActive ? 'text-[#080a0e]/70' : 'text-[#686b78]'}`}>
                {dept.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── 4. Quick Workstation Provisioning Trigger (Bottom Right) ── */}
      <div className="absolute bottom-6 right-6 z-30">
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus size={13} />}
          onClick={() => setShowProvisionDrawer(true)}
          className="bg-[#080a0e]/85 backdrop-blur-md shadow-xl border-[rgba(255,255,255,0.1)]"
        >
          Add Digital Worker
        </Button>
      </div>

      {/* ── 5. Contextual Workstation Detail Side Sheet (Zero 3D Clutter) ── */}
      <CommandDetailPane
        isOpen={detailPaneOpen && Boolean(selectedWorker)}
        onClose={() => {
          setDetailPaneOpen(false);
          setSelectedWorkerId(null);
          setCameraMode('HQ_WIDE');
        }}
        worker={selectedWorker}
        onRunWorker={handleRunWorker}
        runningId={runningId}
      />

      {/* ── 6. Operational Workstation Provisioning Drawer ── */}
      <CommandProvisionDrawer
        isOpen={showProvisionDrawer}
        onClose={() => setShowProvisionDrawer(false)}
        onProvisioned={loadData}
      />
    </div>
  );
}
