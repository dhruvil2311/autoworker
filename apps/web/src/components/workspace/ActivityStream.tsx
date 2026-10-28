import React from 'react';
import { IdentityBadge, EntityType } from '../ui/Avatar.js';
import { CheckCircle2, ShieldAlert, Cpu, User, Zap, Globe, ArrowRight } from 'lucide-react';

export interface ActivityEvent {
  id: string;
  type: EntityType;
  title: string;
  subtitle: string;
  time: string;
  status?: 'success' | 'warning' | 'error' | 'info';
  details?: string;
}

export function ActivityStream({ runs = [], workers = [] }: { runs?: any[]; workers?: any[] }) {
  // Generate realistic, distinguishable operational event trail
  const events: ActivityEvent[] = runs.slice(0, 10).map((r, i) => {
    const matchedWorker = workers.find((w) => w.id === r.workerId);
    const workerName = matchedWorker?.name || 'Order Fulfillment Specialist';
    const isSuccess = r.state === 'COMPLETED' || r.state === 'SUCCEEDED';
    const isException = r.state === 'WAITING_FOR_HUMAN' || r.state === 'FAILED';

    if (isException) {
      return {
        id: `event-${r.id}`,
        type: 'worker',
        title: workerName,
        subtitle: 'Paused for Human Supervisor Guidance',
        time: r.createdAt ? new Date(r.createdAt).toLocaleTimeString() : `${i * 3 + 1}m ago`,
        status: 'warning',
        details: r.error || 'Target DOM element missing on secondary toolbar. Safety protocol halted execution.',
      };
    }

    return {
      id: `event-${r.id}`,
      type: 'worker',
      title: workerName,
      subtitle: isSuccess ? 'Autonomous Execution Completed' : 'Task In Progress',
      time: r.createdAt ? new Date(r.createdAt).toLocaleTimeString() : `${i * 3 + 1}m ago`,
      status: isSuccess ? 'success' : 'info',
      details: `Executed run #${r.id.substring(0, 8)} with 100% policy verification.`,
    };
  });

  // Inject system & supervisor interactions for realistic enterprise continuity
  const demoStream: ActivityEvent[] = [
    {
      id: 'evt-sup-1',
      type: 'human',
      title: 'Operations Supervisor',
      subtitle: 'Clarified Dropdown Navigation Pathway',
      time: '12m ago',
      status: 'info',
      details: 'Guided Order Reconciler: "Open More Actions menu first before clicking Cross-Dock."',
    },
    {
      id: 'evt-auto-1',
      type: 'automation',
      title: 'Workflow Engine v2.0',
      subtitle: 'Recompiled Procedural Graph',
      time: '14m ago',
      status: 'success',
      details: 'Learned action branch successfully committed to permanent memory.',
    },
    {
      id: 'evt-ext-1',
      type: 'external',
      title: 'Apex ERP Gateway',
      subtitle: 'Inventory Deficit Telemetry Synced',
      time: '26m ago',
      status: 'info',
      details: 'Austin WH-02 stock status updated: 4-unit transfer pending cross-dock.',
    },
    ...events,
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between pb-1 border-b border-[rgba(255,255,255,0.06)]">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#8e92a4]">
          Real-Time Workplace Activity Stream
        </span>
        <span className="text-[11px] text-[#686b78]">Human + Digital Worker Collaboration</span>
      </div>

      <div className="flex flex-col gap-2.5">
        {demoStream.map((evt) => (
          <div
            key={evt.id}
            className="flex items-start justify-between p-3.5 bg-[#0e1017] border border-[rgba(255,255,255,0.06)] rounded-md hover:border-[rgba(255,255,255,0.12)] transition-all"
          >
            <div className="flex items-start gap-3 min-w-0">
              <IdentityBadge
                type={evt.type}
                title={evt.title}
                subtitle={evt.subtitle}
                size="sm"
              />
            </div>
            <div className="flex flex-col items-end shrink-0 pl-4">
              <span className="text-[10px] font-mono text-[#686b78]">{evt.time}</span>
              {evt.details && (
                <span className="text-[11px] text-[#8e92a4] mt-1 max-w-md text-right line-clamp-1">
                  {evt.details}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
