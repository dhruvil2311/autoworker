import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ShieldAlert, Play, ArrowUpRight, Box, Layers, Users, Eye, Sparkles } from 'lucide-react';
import { WorkforceHQScene } from './WorkforceHQScene.js';
import { HQCameraMode } from './HQCameraController.js';
import { api } from '../../api.js';

interface HQOfficeFloorProps {
  workers: any[];
  onHire: () => void;
  onRunWorker?: ((e: React.MouseEvent, workerId: string) => void) | undefined;
  runningId?: string | null | undefined;
}

const DEPARTMENTS: { id: HQCameraMode; label: string; icon: string }[] = [
  { id: 'HQ_WIDE', label: 'Wide Floor Panorama', icon: '🏢' },
  { id: 'WAR_ROOM_FOCUS', label: 'Operations War-Room', icon: '🖥️' },
  { id: 'OPERATIONS_FOCUS', label: 'Operations Bay', icon: '📦' },
  { id: 'FINANCE_FOCUS', label: 'Finance & Ledger', icon: '💳' },
  { id: 'INVENTORY_FOCUS', label: 'Inventory & SKU', icon: '📊' },
  { id: 'CUSTOMER_FOCUS', label: 'Customer Ops', icon: '💬' },
  { id: 'RESEARCH_FOCUS', label: 'Executive Hub', icon: '⚡' },
  { id: 'SUPERVISION_FOCUS', label: 'Facility Telemetry', icon: '📡' },
];

export function HQOfficeFloor3D({ workers, onHire, onRunWorker, runningId }: HQOfficeFloorProps) {
  const [cameraMode, setCameraMode] = useState<HQCameraMode>('HQ_WIDE');
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const navigate = useNavigate();

  // Load real recent runs to feed the 75" supervision wall display
  useEffect(() => {
    api.listRuns()
      .then(res => setRuns(res.runs || []))
      .catch(() => setRuns([]));
  }, []);

  const handleSelectWorker = (workerId: string) => {
    setSelectedWorkerId(workerId);
    setCameraMode('WORKER_DESK');
  };

  const handleEnterWorker = (workerId: string) => {
    navigate(`/workers/${workerId}`);
  };

  const attentionWorkers = workers.filter(w => 
    w.status === 'WAITING_FOR_HUMAN' || w.status === 'NEEDS_CLARIFICATION' || w.status === 'EXCEPTION'
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '680px' }}>
      {/* ── 3D Spatial Workplace Canvas ── */}
      <WorkforceHQScene
        workers={workers}
        runs={runs}
        cameraMode={cameraMode}
        selectedWorkerId={selectedWorkerId}
        onSelectWorker={handleSelectWorker}
        onEnterWorker={handleEnterWorker}
        onRunWorker={onRunWorker}
        runningId={runningId}
      />

      {/* ── Top Spatial Navigation Overlay Bar ── */}
      <div style={{
        position: 'absolute',
        top: '16px',
        left: '20px',
        right: '20px',
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        pointerEvents: 'none',
      }}>
        {/* Left Badge */}
        <div style={{
          background: 'rgba(9, 11, 16, 0.92)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '8px 16px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          pointerEvents: 'auto',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, color: '#f4f2ee', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            HQ Operations Floor · {workers.length} Workstation{workers.length === 1 ? '' : 's'} Active
          </span>
        </div>

        {/* Right Actions */}
        <div style={{ display: 'flex', gap: '10px', pointerEvents: 'auto' }}>
          {attentionWorkers.length > 0 && (
            <button
              onClick={() => {
                const first = attentionWorkers[0];
                if (first) handleSelectWorker(first.id);
              }}
              style={{
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                color: '#f59e0b',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                backdropFilter: 'blur(12px)',
              }}
            >
              <ShieldAlert size={13} />
              {attentionWorkers.length} Needs Attention
            </button>
          )}

          {cameraMode !== 'HQ_WIDE' && (
            <button
              onClick={() => {
                setCameraMode('HQ_WIDE');
                setSelectedWorkerId(null);
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#f0f6fc',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                backdropFilter: 'blur(12px)',
              }}
            >
              <Eye size={12} /> Reset to Wide HQ
            </button>
          )}
        </div>
      </div>

      {/* ── Bottom Department Spatial Control Bar ── */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20,
        background: 'rgba(9, 11, 16, 0.92)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.09)',
        padding: '5px 6px',
        borderRadius: '10px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
      }}>
        {DEPARTMENTS.map(dept => {
          const isActive = cameraMode === dept.id;
          return (
            <button
              key={dept.id}
              onClick={() => {
                setSelectedWorkerId(null);
                setCameraMode(dept.id);
              }}
              style={{
                background: isActive ? '#f4f2ee' : 'transparent',
                border: `1px solid ${isActive ? '#ffffff' : 'transparent'}`,
                color: isActive ? '#080a0e' : 'rgba(240, 238, 235, 0.7)',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: isActive ? 700 : 500,
                fontFamily: 'Inter, sans-serif',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{dept.icon}</span>
              <span>{dept.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
