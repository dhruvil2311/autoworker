import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, ArrowUpRight, CheckCircle2, Clock, ShieldAlert, AlertCircle, RefreshCw } from 'lucide-react';
import { api } from '../../api.js';
import { DataGrid, ColumnDef } from '../ui/DataGrid.js';
import { OperationalStateBadge } from '../ui/Badge.js';
import { Button } from '../ui/button.js';
import { TableSkeleton } from '../ui/Skeleton.js';

export function TasksRunsTable() {
  const [runs, setRuns] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchRuns = async () => {
    try {
      const [rRes, wRes] = await Promise.all([
        api.listRuns().catch(() => ({ runs: [] })),
        api.listWorkers().catch(() => ({ ghost_workers: [] })),
      ]);
      const wList = (wRes as any).ghost_workers || (wRes as any).workers || [];
      const rList = (rRes as any).runs || [];
      setWorkers(wList);

      const enriched = rList.map((r: any) => {
        const matchedWorker = wList.find((w: any) => w.id === r.workerId);
        return {
          ...r,
          workerName: matchedWorker?.name || 'Digital Worker',
          department: matchedWorker?.department || 'Operations',
        };
      });
      setRuns(enriched);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
    const interval = setInterval(fetchRuns, 4000);
    return () => clearInterval(interval);
  }, []);

  const columns: ColumnDef<any>[] = [
    {
      key: 'id',
      header: 'Run ID',
      width: '120px',
      render: (r) => (
        <span className="font-mono text-xs text-[#00c2d4]">
          #{r.id.substring(0, 8)}
        </span>
      ),
    },
    {
      key: 'workerName',
      header: 'Assigned Worker',
      sortable: true,
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-medium text-xs text-[#f4f2ee]">{r.workerName}</span>
          <span className="text-[10px] text-[#686b78]">{r.department}</span>
        </div>
      ),
    },
    {
      key: 'state',
      header: 'Operational State',
      sortable: true,
      width: '160px',
      render: (r) => <OperationalStateBadge state={r.state} />,
    },
    {
      key: 'createdAt',
      header: 'Timestamp',
      sortable: true,
      width: '140px',
      render: (r) => (
        <span className="text-[11px] text-[#8e92a4]">
          {r.createdAt ? new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '130px',
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/workers/${r.workerId}`, { state: { activeRunId: r.id } })}
          >
            Audit <ArrowUpRight size={11} />
          </Button>
        </div>
      ),
    },
  ];

  if (loading && runs.length === 0) {
    return <TableSkeleton rows={6} cols={5} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#8e92a4]">
          Execution Logs & Automated Task History
        </span>
        <button
          onClick={fetchRuns}
          className="flex items-center gap-1 text-[11px] text-[#8e92a4] hover:text-[#f4f2ee]"
        >
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      <DataGrid
        data={runs}
        columns={columns}
        keyExtractor={(r) => r.id}
        searchableKey="workerName"
        searchPlaceholder="Filter runs by worker..."
        emptyMessage="No task runs recorded in this workspace."
      />
    </div>
  );
}
