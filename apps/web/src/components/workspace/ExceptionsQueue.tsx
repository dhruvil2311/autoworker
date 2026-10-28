import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, AlertCircle, ArrowRight, Play, RefreshCw, UserCheck } from 'lucide-react';
import { api } from '../../api.js';
import { OperationalStateBadge } from '../ui/Badge.js';
import { Button } from '../ui/button.js';
import { TableSkeleton } from '../ui/Skeleton.js';

export function ExceptionsQueue({ onResolve }: { onResolve?: () => void }) {
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchExceptions = async () => {
    try {
      const [excRes, runsRes, workersRes] = await Promise.all([
        api.listExceptions().catch(() => ({ hitl_requests: [] })),
        api.listRuns().catch(() => ({ runs: [] })),
        api.listWorkers().catch(() => ({ ghost_workers: [] })),
      ]);

      const hitlList = (excRes as any).hitl_requests || (excRes as any).exceptions || [];
      const allRuns = (runsRes as any).runs || [];
      const allWorkers = (workersRes as any).ghost_workers || (workersRes as any).workers || [];

      // Combine direct HITL requests and runs in WAITING_FOR_HUMAN / FAILED state
      const waitingRuns = allRuns.filter(
        (r: any) => r.state === 'WAITING_FOR_HUMAN' || r.state === 'FAILED'
      );

function formatExceptionDisplayReason(raw: string): string {
  if (!raw) return 'Operator intervention required';
  if (raw.startsWith('AUTHENTICATION_REQUIRED:')) {
    try {
      const parts = raw.split(':');
      const payload = JSON.parse(parts.slice(2).join(':'));
      let host = "";
      try { if (payload.url) host = new URL(payload.url).hostname; } catch (_) {}
      if (payload.authType === 'OTP_CHALLENGE') {
        return `Two-Factor verification code (OTP) required on ${host || 'the website'}`;
      }
      return `Sign-in required: Credentials needed on ${host || 'the website'}`;
    } catch (_) {
      return 'Sign-in required: Operator credentials needed';
    }
  }
  if (raw.includes('ELEMENT_NOT_FOUND') || raw.includes('Could not find') || raw.includes('waiting for selector')) {
    return 'Target element altered or missing — operator confirmation needed';
  }
  if (raw.includes('Timeout') || raw.includes('timed out')) {
    return 'Target website response timed out during operation';
  }
  if (/\b(?:msg|message|id|code|err)[_\s-]*\d{3,}\b/i.test(raw) || /^\d+$/.test(raw)) {
    return 'Ambiguous step in demonstration — operator guidance needed';
  }
  return raw.length > 100 ? raw.slice(0, 100) + '...' : raw;
}

      const combined = [
        ...hitlList.map((e: any) => ({
          id: e.id,
          runId: e.run_id || e.runId,
          workerId: e.worker_id || e.workerId,
          reason: formatExceptionDisplayReason(e.reason || e.message || e.challenge_type || e.challengeType),
          state: 'WAITING_FOR_HUMAN',
          time: e.created_at || e.createdAt || new Date().toISOString(),
        })),
        ...waitingRuns.map((r: any) => ({
          id: r.id,
          runId: r.id,
          workerId: r.workerId,
          reason: formatExceptionDisplayReason(
            r.error || r.message || (r.state === 'WAITING_FOR_HUMAN' ? 'Operator guidance needed on active page' : 'Step execution halted')
          ),
          state: r.state,
          time: r.createdAt || new Date().toISOString(),
        })),
      ];

      // Deduplicate by runId
      const unique = new Map<string, any>();
      for (const item of combined) {
        if (!unique.has(item.runId)) {
          const w = allWorkers.find((x: any) => x.id === item.workerId);
          unique.set(item.runId, { ...item, workerName: w?.name || 'Digital Worker' });
        }
      }

      setExceptions([...unique.values()]);
    } catch (err) {
      console.error('Failed to load exceptions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExceptions();
    const interval = setInterval(fetchExceptions, 3000);
    return () => clearInterval(interval);
  }, []);

  if (loading && exceptions.length === 0) {
    return <TableSkeleton rows={4} cols={5} />;
  }

  if (exceptions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-[#0e1017] border border-[rgba(255,255,255,0.06)] rounded-md text-center">
        <div className="w-10 h-10 rounded-full bg-[rgba(29,184,122,0.12)] border border-[rgba(29,184,122,0.3)] flex items-center justify-center text-[#1db87a] mb-3">
          <UserCheck size={18} />
        </div>
        <h3 className="text-sm font-semibold text-[#f4f2ee]">Human-in-the-Loop Queue is Clear</h3>
        <p className="text-xs text-[#8e92a4] max-w-sm mt-1">
          All digital workers are executing autonomously with no pending clarification requests or halted operations.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#e8942a] animate-ping" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[#e8942a]">
            {exceptions.length} Operational Exception{exceptions.length === 1 ? '' : 's'} Requiring Guidance
          </span>
        </div>
        <button
          onClick={fetchExceptions}
          className="flex items-center gap-1 text-[11px] text-[#8e92a4] hover:text-[#f4f2ee]"
        >
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {exceptions.map((exc) => (
          <div
            key={exc.id}
            className="flex items-center justify-between p-3.5 bg-[#0e1017] border border-[rgba(232,148,42,0.25)] hover:border-[rgba(232,148,42,0.45)] rounded-md transition-all gap-4"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-8 h-8 rounded bg-[rgba(232,148,42,0.12)] border border-[rgba(232,148,42,0.3)] flex items-center justify-center text-[#e8942a] shrink-0 mt-0.5">
                <ShieldAlert size={15} />
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#f4f2ee]">{exc.workerName}</span>
                  <OperationalStateBadge state={exc.state} />
                  <span className="text-[10px] font-mono text-[#686b78]">
                    Run #{exc.runId.substring(0, 8)}
                  </span>
                </div>
                <p className="text-xs text-[#e8942a] mt-1 line-clamp-1">
                  {exc.reason}
                </p>
                <span className="text-[10px] text-[#686b78] mt-0.5">
                  Triggered at {new Date(exc.time).toLocaleTimeString()}
                </span>
              </div>
            </div>

            <Button
              variant="primary"
              size="sm"
              icon={<ArrowRight size={12} />}
              onClick={() => {
                navigate(`/workers/${exc.workerId}`, { state: { activeRunId: exc.runId } });
              }}
            >
              Provide Guidance
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
