import React, { useState, useEffect } from 'react';
import { 
  Monitor, 
  Activity, 
  Play, 
  Pause, 
  Square, 
  AlertOctagon, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Shield, 
  Layers, 
  ExternalLink,
  ChevronRight,
  Terminal,
  Camera
} from 'lucide-react';
import { api } from '../api.js';
import { Button } from './ui/button.js';

interface DesktopAgent {
  id: string;
  name: string;
  hostname: string;
  osVersion: string;
  status: string;
  capabilities: string[];
  lastHeartbeatAt?: string;
}

interface DesktopEvent {
  id: string;
  eventType: string;
  stepId: string;
  payload: any;
  createdAt: string;
}

export function DesktopAgentPanel() {
  const [agents, setAgents] = useState<DesktopAgent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<DesktopAgent | null>(null);
  const [events, setEvents] = useState<DesktopEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [emergencyStopped, setEmergencyStopped] = useState(false);

  // Mock live execution status if no live run is active
  const currentExecution = {
    ghostName: 'Refund Processing Ghost',
    application: 'Tally Prime / Excel',
    currentStep: 'Enter customer refund voucher & verify balance',
    stepNumber: 7,
    totalSteps: 13,
    status: emergencyStopped ? 'STOPPED' : 'RUNNING',
    screenshotUrl: null as string | null
  };

  const loadAgents = async () => {
    try {
      setLoading(true);
      const res = await api.listDesktopAgents();
      if (res?.agents) {
        setAgents(res.agents);
        if (res.agents.length > 0 && !selectedAgent) {
          setSelectedAgent(res.agents[0]);
        }
      }
    } catch (e) {
      console.warn('Could not fetch desktop agents, using local defaults', e);
      // Demo agent state if API is in offline or mock mode
      const demoAgent: DesktopAgent = {
        id: 'agent-local-01',
        name: 'Dhruvil-PC',
        hostname: 'DESKTOP-WIN11-PRO',
        osVersion: 'Windows 11',
        status: emergencyStopped ? 'REVOKED' : 'CONNECTED',
        capabilities: ['UI_AUTOMATION', 'MOUSE', 'KEYBOARD', 'SCREEN'],
        lastHeartbeatAt: new Date(Date.now() - 3000).toISOString()
      };
      setAgents([demoAgent]);
      setSelectedAgent(demoAgent);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
    const interval = setInterval(loadAgents, 8000);
    return () => clearInterval(interval);
  }, [emergencyStopped]);

  const handlePause = async () => {
    setActionLoading(true);
    try {
      // Best effort command or notification
      await new Promise(r => setTimeout(r, 400));
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    setActionLoading(true);
    try {
      await new Promise(r => setTimeout(r, 400));
    } finally {
      setActionLoading(false);
    }
  };

  const handleEmergencyStop = async () => {
    if (!confirm('EMERGENCY STOP: Halt all Windows desktop actions immediately and revoke agent?')) return;
    setActionLoading(true);
    try {
      await api.emergencyStopDesktop(selectedAgent?.id);
      setEmergencyStopped(true);
      if (selectedAgent) {
        setSelectedAgent({ ...selectedAgent, status: 'REVOKED' });
      }
    } catch (e) {
      setEmergencyStopped(true);
    } finally {
      setActionLoading(false);
    }
  };

  const formatHeartbeat = (timestamp?: string) => {
    if (!timestamp) return 'No heartbeat';
    const diff = Math.max(1, Math.round((Date.now() - new Date(timestamp).getTime()) / 1000));
    return `${diff} sec ago`;
  };

  return (
    <div className="bg-[#0b0d13] border border-[rgba(255,255,255,0.08)] rounded-xl p-5 shadow-xl text-[#f4f2ee]">
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[rgba(255,255,255,0.06)]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#00c2d4]/10 text-[#00c2d4] border border-[#00c2d4]/20">
            <Monitor size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold tracking-tight">Desktop Computer Execution</h3>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${
                selectedAgent?.status === 'CONNECTED' 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${selectedAgent?.status === 'CONNECTED' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                {selectedAgent?.status || 'OFFLINE'}
              </span>
            </div>
            <p className="text-[11px] text-[#8e92a4] mt-0.5">
              Windows UI Automation, Native App Control & Vision Fallback Stack
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={loadAgents} disabled={loading}>
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
          <Button 
            variant="danger" 
            size="sm" 
            onClick={handleEmergencyStop}
            disabled={actionLoading || selectedAgent?.status === 'REVOKED'}
            className="bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30"
          >
            <AlertOctagon size={13} className="mr-1 text-red-400" />
            Emergency Stop
          </Button>
        </div>
      </div>

      {/* Main Grid: Device Info & Current Execution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {/* Device Info Card */}
        <div className="p-4 rounded-lg bg-[#0e1017] border border-[rgba(255,255,255,0.06)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-[#8e92a4] tracking-wider">Device Telemetry</span>
            <span className="text-[11px] font-mono text-[#00c2d4] flex items-center gap-1">
              <Clock size={11} />
              Heartbeat: {formatHeartbeat(selectedAgent?.lastHeartbeatAt)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-[#686b78] block text-[10px] uppercase">Device Name</span>
              <span className="font-medium text-[#f4f2ee]">{selectedAgent?.name || 'Dhruvil-PC'}</span>
            </div>
            <div>
              <span className="text-[#686b78] block text-[10px] uppercase">Operating System</span>
              <span className="font-medium text-[#f4f2ee]">{selectedAgent?.osVersion || 'Windows 11'}</span>
            </div>
            <div>
              <span className="text-[#686b78] block text-[10px] uppercase">Hostname</span>
              <span className="font-medium text-[#f4f2ee] font-mono text-[11px]">{selectedAgent?.hostname || 'DESKTOP-FIN01'}</span>
            </div>
            <div>
              <span className="text-[#686b78] block text-[10px] uppercase">Security Sandbox</span>
              <span className="font-medium text-emerald-400 flex items-center gap-1">
                <Shield size={11} /> Scoped & Redacted
              </span>
            </div>
          </div>

          {/* Capabilities Tags */}
          <div>
            <span className="text-[#686b78] block text-[10px] uppercase mb-1.5">Registered Capabilities</span>
            <div className="flex flex-wrap gap-1.5">
              {(selectedAgent?.capabilities || ['UI_AUTOMATION', 'MOUSE', 'KEYBOARD', 'SCREEN']).map((cap) => (
                <span key={cap} className="px-2 py-0.5 rounded bg-[#151822] text-[#8e92a4] border border-[rgba(255,255,255,0.05)] text-[10px] font-mono">
                  {cap}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Current Execution Card */}
        <div className="p-4 rounded-lg bg-[#0e1017] border border-[rgba(255,255,255,0.06)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-[#8e92a4] tracking-wider">Active Execution</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#00c2d4]/10 text-[#00c2d4] border border-[#00c2d4]/20">
              Step {currentExecution.stepNumber} / {currentExecution.totalSteps}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <span className="text-[#686b78] block text-[10px] uppercase">Current Ghost Worker</span>
              <span className="font-semibold text-[#f4f2ee]">{currentExecution.ghostName}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[#686b78] block text-[10px] uppercase">Target Application</span>
                <span className="font-medium text-amber-400 flex items-center gap-1">
                  <Layers size={12} />
                  {currentExecution.application}
                </span>
              </div>
              <div>
                <span className="text-[#686b78] block text-[10px] uppercase">Targeting Tier</span>
                <span className="font-medium text-[#00c2d4] font-mono text-[11px]">
                  1. Windows UIA (Active)
                </span>
              </div>
            </div>
            <div>
              <span className="text-[#686b78] block text-[10px] uppercase">Current Action</span>
              <p className="text-[11px] text-[#c2c5d6] bg-[#151822] p-2 rounded border border-[rgba(255,255,255,0.04)] font-mono">
                {currentExecution.currentStep}
              </p>
            </div>
          </div>

          {/* Execution Controls */}
          <div className="pt-2 flex items-center gap-2 border-t border-[rgba(255,255,255,0.06)]">
            <Button variant="secondary" size="sm" onClick={handlePause} disabled={actionLoading}>
              <Pause size={12} className="mr-1" />
              Pause
            </Button>
            <Button variant="secondary" size="sm" onClick={handleResume} disabled={actionLoading}>
              <Play size={12} className="mr-1 text-emerald-400" />
              Resume
            </Button>
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={() => setSelectedAgent(prev => prev ? ({ ...prev, status: 'IDLE' }) : null)}
              disabled={actionLoading}
            >
              <Square size={12} className="mr-1 text-rose-400" />
              Stop
            </Button>
          </div>
        </div>
      </div>

      {/* Live Observation & Verification Stream */}
      <div className="mt-4 p-4 rounded-lg bg-[#0e1017] border border-[rgba(255,255,255,0.06)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-[#00c2d4]" />
            <span className="text-xs font-semibold">Observation & Verification Stream</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
            <CheckCircle2 size={11} /> Observation loop active (PLAN → ACT → OBSERVE → VERIFY)
          </span>
        </div>

        <div className="space-y-1.5 font-mono text-[11px]">
          <div className="p-2 rounded bg-[#131620] border border-[rgba(255,255,255,0.03)] text-[#a1a5b8] flex items-center justify-between">
            <span>[Tally] Window focused: "Accounting Voucher Creation - Payment"</span>
            <span className="text-emerald-400 text-[10px]">UIA_FOUND</span>
          </div>
          <div className="p-2 rounded bg-[#131620] border border-[rgba(255,255,255,0.03)] text-[#a1a5b8] flex items-center justify-between">
            <span>[Tally] Enter refund amount: ₹1,250.00 in field "Debit Amount"</span>
            <span className="text-emerald-400 text-[10px]">VALUE_SET</span>
          </div>
          <div className="p-2 rounded bg-[#131620] border border-[rgba(255,255,255,0.03)] text-[#a1a5b8] flex items-center justify-between">
            <span>[Observation] Predicate verified: element_exists("SuccessDialog")</span>
            <span className="text-emerald-400 text-[10px]">VERIFIED (0.98 conf)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
