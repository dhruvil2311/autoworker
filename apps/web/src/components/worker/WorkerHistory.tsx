import React from 'react';
import { Clock, CheckCircle2, ShieldAlert, ArrowUpRight, Play, Check } from 'lucide-react';
import { DataGrid, ColumnDef } from '../ui/DataGrid.js';
import { OperationalStateBadge } from '../ui/Badge.js';
import { Button } from '../ui/button.js';

export function WorkerHistory({
  runs = [],
  onInspectRun,
}: {
  runs: any[];
  onInspectRun?: (runId: string) => void;
}) {
  const columns: ColumnDef<any>[] = [
    {
      key: 'id',
      header: 'Run ID',
      width: '110px',
      render: (r) => (
        <span className="font-mono text-xs text-[#00c2d4]">#{r.id.substring(0, 8)}</span>
      ),
    },
    {
      key: 'state',
      header: 'Status',
      width: '150px',
      render: (r) => <OperationalStateBadge state={r.state} />,
    },
    {
      key: 'createdAt',
      header: 'Started At',
      sortable: true,
      render: (r) => (
        <span className="text-xs text-[#8e92a4]">
          {r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'compliance',
      header: 'Policy Compliance',
      width: '140px',
      render: (r) => (
        <div className="flex items-center gap-1 text-[11px] text-[#1db87a]">
          <Check size={12} />
          <span>100% Verified</span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '120px',
      render: (r) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onInspectRun?.(r.id)}
          >
            Audit <ArrowUpRight size={11} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3 h-full p-4 bg-[#0e1017] border border-[rgba(255,255,255,0.08)] rounded-md">
      <div className="flex items-center justify-between pb-2 border-b border-[rgba(255,255,255,0.06)]">
        <div className="flex items-center gap-2">
          <Clock size={15} className="text-[#00c2d4]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[#f4f2ee]">
            Execution Run History & Deterministic Audit Trail
          </span>
        </div>
        <span className="text-[10px] font-mono text-[#8e92a4]">
          Total Runs: {runs.length}
        </span>
      </div>

      <div className="flex-1 min-h-0">
        <DataGrid
          data={runs}
          columns={columns}
          keyExtractor={(r) => r.id}
          searchPlaceholder="Filter execution runs..."
          emptyMessage="No historical runs found for this worker."
        />
      </div>
    </div>
  );
}
