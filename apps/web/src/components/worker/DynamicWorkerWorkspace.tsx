import React, { useState, useMemo } from 'react';
import { 
  Globe, 
  Terminal, 
  Layers, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  ArrowUpRight, 
  Sparkles, 
  FileText,
  ExternalLink,
  ChevronRight,
  Shield,
  Search
} from 'lucide-react';
import { Button } from '../ui/button.js';
import { Badge, OperationalStateBadge } from '../ui/Badge.js';
import { DataGrid, ColumnDef } from '../ui/DataGrid.js';

interface DynamicWorkerWorkspaceProps {
  worker: any;
  runs: any[];
  activeRun: any;
  planObj: any;
  workflow: any;
  documents: any[];
  onInspectRun?: (runId?: string) => void;
  onRunNow?: () => void;
  onTeach?: () => void;
  onViewMemory?: () => void;
}

export function DynamicWorkerWorkspace({
  worker,
  runs,
  activeRun,
  planObj,
  workflow,
  documents,
  onInspectRun,
  onRunNow,
  onTeach,
  onViewMemory,
}: DynamicWorkerWorkspaceProps) {
  const [selectedRow, setSelectedRow] = useState<any | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // 1. Resolve Target Business System & URL
  const targetSystem = useMemo(() => {
    // Check plan systems
    const sysUsed = planObj?.systemsUsed?.[0];
    if (sysUsed && sysUsed.trim()) {
      return {
        name: sysUsed.includes('magento') ? 'Magento 2 Admin Portal'
          : sysUsed.includes('shopify') ? 'Shopify Operations Hub'
          : sysUsed.includes('sauce') ? 'SauceDemo Logistics Portal'
          : `${sysUsed} Portal`,
        domain: sysUsed,
        url: sysUsed.startsWith('http') ? sysUsed : `https://${sysUsed}`
      };
    }

    // Check workflow steps for URL
    const wfSteps = workflow?.root_step?.children || workflow?.steps || [];
    const navStep = wfSteps.find((s: any) => s.operation === 'NAVIGATE' || s.args?.url);
    if (navStep?.args?.url) {
      const url = navStep.args.url;
      try {
        const host = new URL(url).hostname;
        return {
          name: host.includes('magento') ? 'Magento 2 Admin Portal'
            : host.includes('shopify') ? 'Shopify Operations Hub'
            : `${host} Interface`,
          domain: host,
          url
        };
      } catch {
        return { name: 'Target Web Application', domain: url, url };
      }
    }

    // Fallback from worker description / name
    const workerName = worker?.name || 'Enterprise System';
    return {
      name: `${workerName} Workspace`,
      domain: 'Enterprise Cloud',
      url: '#'
    };
  }, [planObj, workflow, worker]);

  // 2. Extract Real Operational Deliverables & Entities from Runs
  const latestRun = activeRun || runs[0];
  const outputData = latestRun?.result_summary?.output_data || latestRun?.metadata?.resultSummary?.output_data;
  const comparisonData = outputData?.comparison || (outputData?.entities ? outputData : null);

  // Extract entities list from comparison or extraction
  const operationalEntities = useMemo(() => {
    // If run produced real comparison entities
    if (comparisonData?.entities && Array.isArray(comparisonData.entities) && comparisonData.entities.length > 0) {
      return comparisonData.entities.map((ent: any, idx: number) => ({
        id: ent.order_id || ent.id || `ent-${idx + 1}`,
        title: ent.name || `Order #${ent.order_id || idx + 1}`,
        customer: ent.customer || 'Customer Record',
        total: ent.total || 'N/A',
        status: ent.status || 'Complete',
        items: ent.items || '1',
        source: ent.source || 'DOM Inspection',
        raw: ent
      }));
    }

    // If run produced extraction fields
    if (outputData?.extraction?.fields || outputData?.fields) {
      const fields = outputData?.extraction?.fields || outputData?.fields;
      return Object.entries(fields).map(([key, val], idx) => ({
        id: `field-${idx}`,
        title: key.replace(/_/g, ' ').toUpperCase(),
        customer: String(val),
        total: '-',
        status: 'Extracted',
        items: '1',
        source: 'Variable Extraction',
        raw: { [key]: val }
      }));
    }

    // If worker has runs without output data, show real run executions as rows
    if (runs && runs.length > 0) {
      return runs.map((run: any, idx: number) => ({
        id: run.id,
        title: `Execution Run #${run.id.slice(0, 8)}`,
        customer: run.task || worker?.name || 'Process Task',
        total: run.duration ? `${(run.duration / 1000).toFixed(1)}s` : 'Completed',
        status: run.state || 'COMPLETED',
        items: run.steps?.length ? `${run.steps.length} steps` : 'Verified',
        source: new Date(run.createdAt || run.created_at).toLocaleTimeString(),
        raw: run
      }));
    }

    // If no runs yet, show planned procedural steps from the SOP
    const steps = planObj?.steps || [];
    if (steps.length > 0) {
      return steps.map((s: any) => ({
        id: `step-${s.number}`,
        title: `Step ${s.number}: ${s.description}`,
        customer: targetSystem.name,
        total: 'Planned',
        status: 'QUEUED',
        items: s.isLoop ? 'Loop' : 'Sequential',
        source: 'Workflow Specification',
        raw: s
      }));
    }

    return [];
  }, [comparisonData, outputData, runs, planObj, targetSystem, worker]);

  // Filter entities
  const filteredEntities = useMemo(() => {
    if (!searchFilter.trim()) return operationalEntities;
    const q = searchFilter.toLowerCase();
    return operationalEntities.filter((e: any) =>
      e.title.toLowerCase().includes(q) ||
      e.customer.toLowerCase().includes(q) ||
      e.status.toLowerCase().includes(q)
    );
  }, [operationalEntities, searchFilter]);

  const selectedEntity = selectedRow || filteredEntities[0] || null;

  // Grid column definitions
  const columns: ColumnDef<any>[] = [
    {
      key: 'title',
      header: 'Operational Entity / Record',
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-semibold text-xs text-[#00c2d4] font-mono">{r.title}</span>
          <span className="text-[10px] text-[#8e92a4] truncate max-w-[200px]">{r.source}</span>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer / Context',
      render: (r) => (
        <span className="text-xs text-[#f4f2ee] font-medium">{r.customer}</span>
      ),
    },
    {
      key: 'total',
      header: 'Amount / Metric',
      width: '120px',
      render: (r) => (
        <span className="text-xs font-mono font-semibold text-[#1db87a]">
          {r.total}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Operational State',
      width: '130px',
      render: (r) => {
        const s = (r.status || '').toUpperCase();
        if (s.includes('COMPLETE') || s.includes('SUCCEEDED') || s.includes('OPTIMAL')) {
          return <Badge variant="success" dot>{r.status}</Badge>;
        }
        if (s.includes('PROCESS') || s.includes('EXTRACT') || s.includes('RUNNING')) {
          return <Badge variant="info" dot>{r.status}</Badge>;
        }
        if (s.includes('HOLD') || s.includes('WAITING') || s.includes('EXCEPTION')) {
          return <Badge variant="warning" dot>{r.status}</Badge>;
        }
        if (s.includes('FAIL') || s.includes('ERROR')) {
          return <Badge variant="error" dot>{r.status}</Badge>;
        }
        return <Badge variant="neutral" dot>{r.status}</Badge>;
      },
    },
  ];

  // 0. Resolve Active Training Provenance
  const resolvedTrainingSource = useMemo(() => {
    if (worker?.trainingSource) return worker.trainingSource;
    if (worker?.triggerConfig?.trainingSource) return worker.triggerConfig.trainingSource;
    if (workflow?.compiler?.source_type === 'VIDEO_RECORDING' || workflow?.compiler?.source_media_name) {
      return {
        type: 'VIDEO_RECORDING',
        name: workflow.compiler.source_media_name || 'Screen Recording Demonstration',
        jobId: workflow.compiler.source_recording_id,
        actionCount: workflow.compiler.action_count || workflow.root_step?.children?.length,
        frameCount: workflow.compiler.frame_count,
        compiledAt: workflow.compiler.compiled_at
      };
    }
    if (worker?.recordingId) {
      return {
        type: 'VIDEO_RECORDING',
        name: 'Screen Recording Demonstration',
        jobId: worker.recordingId,
      };
    }
    if (documents && documents.length > 0) {
      return {
        type: 'DOCUMENT_SOP',
        name: documents[0].name || 'Governing SOP Document',
        count: documents.length
      };
    }
    return null;
  }, [worker, workflow, documents]);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* ── 0. Active Workflow Grounding & Lineage Banner ── */}
      <div className="p-3.5 bg-[#0b0d13] border border-[rgba(255,255,255,0.08)] rounded-md flex flex-col md:flex-row md:items-center justify-between gap-3 relative overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{
            background: resolvedTrainingSource?.type === 'VIDEO_RECORDING' ? 'rgba(0,194,212,0.15)' : resolvedTrainingSource?.type === 'DOCUMENT_SOP' ? 'rgba(29,184,122,0.15)' : 'rgba(255,255,255,0.05)',
            color: resolvedTrainingSource?.type === 'VIDEO_RECORDING' ? '#00c2d4' : resolvedTrainingSource?.type === 'DOCUMENT_SOP' ? '#1db87a' : '#8e92a4'
          }}>
            {resolvedTrainingSource?.type === 'VIDEO_RECORDING' ? <Terminal size={18} /> : <FileText size={18} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#f4f2ee]">
                {resolvedTrainingSource?.type === 'VIDEO_RECORDING' ? 'Active Operational Model: Trained from Video Recording' : resolvedTrainingSource?.type === 'DOCUMENT_SOP' ? 'Active Operational Model: Trained from Document SOP' : 'Active Operational Model: Default Plan'}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[rgba(0,194,212,0.1)] text-[#00c2d4] border border-[rgba(0,194,212,0.2)]">
                {worker?.activeVersionId ? `v${worker.version || '1.0'}` : 'DRAFT'}
              </span>
            </div>
            <p className="text-[11px] text-[#8e92a4] mt-0.5 flex flex-wrap items-center gap-1.5">
              <span>Grounding:</span>
              <span className="font-semibold text-[#f4f2ee]">
                {resolvedTrainingSource?.name || 'Standard Operational Procedure'}
              </span>
              {resolvedTrainingSource?.actionCount && (
                <>
                  <span>·</span>
                  <span className="text-[#00c2d4] font-mono">{resolvedTrainingSource.actionCount} observed actions</span>
                </>
              )}
              {resolvedTrainingSource?.compiledAt && (
                <>
                  <span>·</span>
                  <span className="text-[#686b78]">Compiled {new Date(resolvedTrainingSource.compiledAt).toLocaleTimeString()}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {resolvedTrainingSource?.type === 'VIDEO_RECORDING' ? (
            <span className="px-2.5 py-1 rounded bg-[#00c2d4]/10 text-[#00c2d4] text-[10px] font-mono border border-[#00c2d4]/20 flex items-center gap-1">
              <CheckCircle2 size={11} /> Running Based On Your Uploaded Video
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded bg-[#8e92a4]/10 text-[#8e92a4] text-[10px] font-mono border border-[rgba(255,255,255,0.06)] flex items-center gap-1">
              Running Based On Document / Prior Task
            </span>
          )}
          {onTeach && (
            <Button variant="secondary" size="sm" onClick={onTeach}>
              Re-Teach / Switch
            </Button>
          )}
        </div>
      </div>

      {/* ── 1. Real Target System Telemetry Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#0b0d13] border border-[rgba(255,255,255,0.06)] rounded-md">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#8e92a4]">
            Target Business System:
          </span>
          <span className="text-xs font-mono text-[#00c2d4] bg-[rgba(0,194,212,0.1)] px-2.5 py-1 rounded border border-[rgba(0,194,212,0.25)] flex items-center gap-1.5">
            <Globe size={12} />
            {targetSystem.name} ({targetSystem.domain})
          </span>
          {targetSystem.url && targetSystem.url !== '#' && (
            <a
              href={targetSystem.url}
              target="_blank"
              rel="noreferrer"
              className="text-[#8e92a4] hover:text-[#00c2d4] transition-colors"
              title="Open Target Interface"
            >
              <ExternalLink size={12} />
            </a>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#1db87a] animate-pulse" />
            <span className="text-[11px] font-mono text-[#8e92a4]">
              {runs.length > 0 ? `${runs.length} Execution Runs Recorded` : 'Autonomous Worker Standby'}
            </span>
          </div>
          <OperationalStateBadge state={worker?.status || 'IDLE'} />
        </div>
      </div>

      {/* ── 2. Two-Column Workspace Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
        
        {/* Left 2 Cols: Operational Records & Entity Grid */}
        <div className="lg:col-span-2 flex flex-col min-h-0 bg-[#0b0d13] border border-[rgba(255,255,255,0.06)] rounded-md p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Layers size={15} className="text-[#00c2d4]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-[#f4f2ee]">
                Live Operational Records ({filteredEntities.length})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-2 text-[#8e92a4]" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter records..."
                  className="bg-[#07080c] border border-[rgba(255,255,255,0.08)] rounded pl-7 pr-2.5 py-1 text-xs text-[#f4f2ee] outline-none focus:border-[#00c2d4] w-44"
                />
              </div>

              {onInspectRun && latestRun && (
                <Button variant="secondary" size="sm" onClick={() => onInspectRun(latestRun.id)}>
                  Inspect Run
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {filteredEntities.length > 0 ? (
              <DataGrid
                data={filteredEntities}
                columns={columns}
                keyExtractor={(row: any) => row.id}
                selectedRowId={selectedEntity?.id}
                onRowClick={(row: any) => setSelectedRow(row)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 text-[#8e92a4]">
                <Layers size={28} className="text-[#8e92a4]/40 mb-2" />
                <span className="text-xs font-semibold text-[#f4f2ee]">No Operational Records Found</span>
                <p className="text-[11px] text-[#8e92a4] mt-1 max-w-sm">
                  This worker has not yet completed a run or produced structured entities. Click "Run Work" to execute this worker on {targetSystem.name}.
                </p>
                {onRunNow && (
                  <Button variant="primary" size="sm" onClick={onRunNow} className="mt-3">
                    Execute Initial Run
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Entity / Run Detail & Action Drawer */}
        <div className="flex flex-col gap-4 min-h-0 bg-[#0b0d13] border border-[rgba(255,255,255,0.06)] rounded-md p-4">
          <div className="flex items-center justify-between pb-3 border-b border-[rgba(255,255,255,0.06)]">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#8e92a4]">
              Entity Telemetry Detail
            </span>
            {selectedEntity?.status && (
              <Badge variant="accent">{selectedEntity.status}</Badge>
            )}
          </div>

          {selectedEntity ? (
            <div className="flex flex-col gap-3 flex-1 overflow-y-auto text-xs">
              <div className="p-3 bg-[#07080c] border border-[rgba(255,255,255,0.04)] rounded flex flex-col gap-1">
                <span className="text-[10px] uppercase font-semibold text-[#8e92a4]">Entity Identifier</span>
                <span className="text-sm font-bold text-[#f4f2ee] font-mono">{selectedEntity.title}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 bg-[#07080c] border border-[rgba(255,255,255,0.04)] rounded">
                  <span className="text-[10px] uppercase text-[#8e92a4] block mb-0.5">Account / Customer</span>
                  <span className="font-semibold text-[#f4f2ee]">{selectedEntity.customer}</span>
                </div>
                <div className="p-2.5 bg-[#07080c] border border-[rgba(255,255,255,0.04)] rounded">
                  <span className="text-[10px] uppercase text-[#8e92a4] block mb-0.5">Amount / Value</span>
                  <span className="font-bold text-[#1db87a] font-mono">{selectedEntity.total}</span>
                </div>
              </div>

              {/* Explicit differences if present in comparison deliverable */}
              {comparisonData?.differences && comparisonData.differences.length > 0 && (
                <div className="p-3 bg-[rgba(232,148,42,0.08)] border border-[rgba(232,148,42,0.25)] rounded flex flex-col gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#e8942a] flex items-center gap-1">
                    <Sparkles size={11} /> Identified Entity Differences
                  </span>
                  <ul className="list-disc list-inside text-[11px] text-[#e8942a]/90 space-y-1">
                    {comparisonData.differences.map((diff: string, i: number) => (
                      <li key={i}>{diff}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-auto pt-3 border-t border-[rgba(255,255,255,0.06)] flex flex-col gap-2">
                {onRunNow && (
                  <Button variant="primary" size="md" onClick={onRunNow} className="w-full justify-center">
                    <Play size={12} fill="currentColor" /> Trigger Autonomous Run
                  </Button>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {onTeach && (
                    <Button variant="secondary" size="sm" onClick={onTeach} className="w-full justify-center">
                      Teach Guidance
                    </Button>
                  )}
                  {onViewMemory && (
                    <Button variant="secondary" size="sm" onClick={onViewMemory} className="w-full justify-center">
                      Memory & SOP
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center text-[#8e92a4]">
              <FileText size={24} className="opacity-30 mb-2" />
              <span className="text-xs">Select an entity to view telemetry details</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
