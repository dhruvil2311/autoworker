import React, { useState, useEffect } from 'react';
import {
  ArrowDown, LayoutTemplate, Trash2, Plus, Save,
  Play, CheckCircle2, ShieldAlert, Loader2, Activity, Code2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api.js';

// ── Operation color map ───────────────────────────────────────────────────────
const OPERATION_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  NAVIGATE: { color: '#00D9F5', bg: 'rgba(0,217,245,0.08)', label: 'NAV' },
  CLICK: { color: '#00D9F5', bg: 'rgba(0,217,245,0.06)', label: 'CLICK' },
  FILL: { color: '#A87DFF', bg: 'rgba(168,125,255,0.08)', label: 'FILL' },
  READ: { color: '#5588BB', bg: 'rgba(85,136,187,0.08)', label: 'READ' },
  IF: { color: '#F5A623', bg: 'rgba(245,166,35,0.08)', label: 'IF' },
  CONDITION: { color: '#F5A623', bg: 'rgba(245,166,35,0.08)', label: 'COND' },
  WAIT: { color: '#60607A', bg: 'rgba(96,96,122,0.08)', label: 'WAIT' },
  SEQUENCE: { color: '#334455', bg: 'rgba(51,68,85,0.08)', label: 'SEQ' },
  DEFAULT: { color: '#00D9F5', bg: 'rgba(0,217,245,0.06)', label: 'STEP' },
};

function getOpStyle(operation: string): { color: string; bg: string; label: string } {
  return OPERATION_COLORS[operation?.toUpperCase()] || OPERATION_COLORS.DEFAULT || { color: '#00D9F5', bg: 'rgba(0,217,245,0.06)', label: 'STEP' };
}

// ── Plan step card (read-only) ────────────────────────────────────────────────
function PlanStepCard({ step, idx, delay }: { step: any; idx: number; delay: number }) {
  const isCondition = step.description?.toLowerCase().includes('if')
    || step.description?.toLowerCase().includes('check')
    || step.description?.toLowerCase().includes('verify');

  const color = isCondition ? '#F5A623' : '#00D9F5';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, x: -10 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative pl-20"
    >
      {/* Connector line from spine */}
      <div
        className="absolute left-8 top-5 h-px w-12"
        style={{ background: `linear-gradient(to right, ${color}60, transparent)` }}
      />

      {/* Step number badge */}
      <div
        className="absolute left-3 top-2 w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-bold"
        style={{
          background: `${color}15`,
          border: `1px solid ${color}44`,
          color,
          boxShadow: `0 0 16px ${color}22`,
        }}
      >
        {String(idx + 1).padStart(2, '0')}
      </div>

      {/* Card */}
      <motion.div
        whileHover={{ x: 4, transition: { duration: 0.2 } }}
        className="rounded-2xl p-5 mb-1"
        style={{
          background: `#0d0d12`,
          border: `1px solid ${color}22`,
          boxShadow: `0 4px 24px rgba(0,0,0,0.3)`,
          transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.borderColor = color + '44';
          (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 32px rgba(0,0,0,0.4), 0 0 20px ${color}12`;
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.borderColor = color + '22';
          (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 24px rgba(0,0,0,0.3)';
        }}
      >
        <p
          className="m-0 text-sm leading-relaxed font-medium"
          style={{ color: isCondition ? '#F5A623CC' : 'rgba(235,235,235,0.85)' }}
        >
          {step.description}
        </p>

        {/* Children / sub-steps */}
        {step.children && step.children.length > 0 && (
          <div
            className="mt-4 pl-4 border-l flex flex-col gap-2"
            style={{ borderColor: color + '22' }}
          >
            {step.children.map((child: any, ci: number) => (
              <div key={ci} className="flex items-start gap-2">
                <div
                  className="w-1 h-1 rounded-full flex-shrink-0 mt-1.5"
                  style={{ background: color + '66' }}
                />
                <span className="text-[12px] leading-relaxed" style={{ color: 'var(--aw-coolgray)' }}>
                  {child.description}
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── Editable workflow step ────────────────────────────────────────────────────
function EditableStepCard({ step, index, onUpdate, onRemove, onAddAfter }: {
  step: any;
  index: number;
  onUpdate: (field: string, value: any) => void;
  onRemove: () => void;
  onAddAfter: () => void;
}) {
  const [showJson, setShowJson] = useState(false);
  const opStyle = getOpStyle(step.operation);

  return (
    <div className="flex flex-col items-center w-full max-w-[640px]">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.4 }}
        className="w-full rounded-2xl overflow-hidden relative"
        style={{
          background: '#0d0d12',
          border: `1px solid ${opStyle.color}22`,
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}
      >
        {/* Operation type header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: opStyle.color + '22', background: opStyle.bg }}
        >
          <div className="flex items-center gap-3">
            <span
              className="aw-label text-[10px] px-2 py-1 rounded"
              style={{
                background: opStyle.color + '18',
                border: `1px solid ${opStyle.color}33`,
                color: opStyle.color,
              }}
            >
              {step.operation || 'STEP'}
            </span>
            <span className="aw-mono text-[11px]" style={{ color: 'var(--aw-coolgray)' }}>
              #{String(index + 1).padStart(2, '0')}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowJson(!showJson)}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: showJson ? opStyle.color : 'var(--aw-coolgray)' }}
              title="Toggle JSON view"
            >
              <Code2 size={14} />
            </button>
            <button
              onClick={onRemove}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--aw-coolgray)' }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-3">
          {/* Video / Window Provenance Tag if extracted from desktop recording */}
          {(step.metadata?.sourceWindow || step.metadata?.frameIndex !== undefined) && (
            <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono mb-0.5">
              <span className="text-[#00D9F5] font-semibold">📹 Video Evidence:</span>
              {step.metadata?.sourceWindow && (
                <span className="px-1.5 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/50 text-zinc-300">
                  App: {step.metadata.sourceWindow}
                </span>
              )}
              {step.metadata?.frameIndex !== undefined && (
                <span className="text-zinc-500">
                  frame #{step.metadata.frameIndex}
                </span>
              )}
            </div>
          )}

          {/* Description input */}
          <input
            type="text"
            value={step.description || ''}
            onChange={e => onUpdate('description', e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl text-sm transition-all outline-none"
            style={{
              background: '#0a0a0f',
              border: '1px solid rgba(255,255,255,0.06)',
              color: 'var(--aw-offwhite)',
            }}
            placeholder="Step description"
            onFocus={e => {
              (e.target as HTMLElement).style.borderColor = opStyle.color + '55';
              (e.target as HTMLElement).style.boxShadow = `0 0 0 2px ${opStyle.color}15`;
            }}
            onBlur={e => {
              (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)';
              (e.target as HTMLElement).style.boxShadow = 'none';
            }}
          />

          {/* Target input */}
          <input
            type="text"
            value={step.target || ''}
            onChange={e => onUpdate('target', e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl text-sm transition-all outline-none aw-mono"
            style={{
              background: '#0a0a0f',
              border: '1px solid rgba(255,255,255,0.06)',
              color: 'var(--aw-coolgray)',
              fontSize: 11,
            }}
            placeholder="Target (e.g. BROWSER_SEMANTIC)"
            onFocus={e => {
              (e.target as HTMLElement).style.borderColor = opStyle.color + '44';
            }}
            onBlur={e => {
              (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)';
            }}
          />

          {/* JSON args — only when expanded */}
          <AnimatePresence>
            {showJson && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="aw-label text-[9px] mb-1.5" style={{ color: 'var(--aw-coolgray)' }}>
                  ARGS (JSON)
                </div>
                <textarea
                  value={JSON.stringify(step.args || {}, null, 2)}
                  onChange={e => {
                    try { onUpdate('args', JSON.parse(e.target.value)); } catch (_) {}
                  }}
                  className="w-full px-3 py-2.5 rounded-xl resize-none outline-none aw-mono"
                  style={{
                    background: '#050507',
                    border: '1px solid rgba(255,255,255,0.05)',
                    color: opStyle.color + 'CC',
                    fontSize: 10,
                    minHeight: 80,
                  }}
                  rows={4}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Add-step connector */}
      <div className="relative flex flex-col items-center py-1 group w-full">
        <div
          className="w-px h-6 transition-colors"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        />
        <button
          onClick={onAddAfter}
          className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
          style={{
            background: '#0a0a0f',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--aw-coolgray)',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget;
            el.style.background = opStyle.color + '22';
            el.style.borderColor = opStyle.color + '55';
            el.style.color = opStyle.color;
          }}
          onMouseLeave={e => {
            const el = e.currentTarget;
            el.style.background = '#0a0a0f';
            el.style.borderColor = 'rgba(255,255,255,0.08)';
            el.style.color = 'var(--aw-coolgray)';
          }}
        >
          <Plus size={14} />
        </button>
        <div
          className="w-px h-3 transition-colors"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        />
      </div>
    </div>
  );
}

// ── Main ProcessVisualizer ────────────────────────────────────────────────────
export function ProcessVisualizer({
  planObj, planRaw, workflowVersion, workerId, onSaved,
}: {
  planObj?: any;
  planRaw?: string | null;
  workflowVersion?: any;
  workerId?: string | undefined;
  onSaved?: () => void;
}) {
  const [editingWorkflow, setEditingWorkflow] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (workflowVersion) {
      // `workflowVersion` from the API is a *version row*: { id, workflowId, workflow: { root_step, ... } }.
      // The actual compiled workflow (with root_step) lives under `.workflow`.
      // Previously we cloned the row itself, so `editingWorkflow.root_step` was
      // always undefined and the graph always rendered as empty (Start -> End only).
      const rawWorkflow = workflowVersion.workflow ?? workflowVersion;
      setEditingWorkflow(JSON.parse(JSON.stringify(rawWorkflow)));
    }
  }, [workflowVersion]);

  // ── EMPTY STATE ────────────────────────────────────────────────────────────
  if (!planObj && !workflowVersion && !planRaw) {
    return (
      <div className="flex flex-col items-center justify-center p-16 h-full text-center gap-6">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center aw-breathe"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <LayoutTemplate size={24} style={{ color: 'var(--aw-coolgray)' }} />
        </div>
        <div>
          <div className="font-['Outfit'] font-semibold text-lg mb-2" style={{ color: 'var(--aw-offwhite)' }}>
            No Process Mapped
          </div>
          <p className="text-sm max-w-sm leading-relaxed" style={{ color: 'var(--aw-coolgray)' }}>
            Upload evidence and instruct the worker to begin understanding. The process will appear here.
          </p>
        </div>
      </div>
    );
  }

  // ── READ-ONLY: planObj ─────────────────────────────────────────────────────
  if (!workflowVersion && planObj) {
    return (
      <div className="flex flex-col p-8 overflow-y-auto h-full">
        {/* Goal summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-6 mb-10 relative overflow-hidden"
          style={{
            background: '#0d0d12',
            border: '1px solid rgba(0,217,245,0.2)',
            boxShadow: '0 0 40px rgba(0,217,245,0.06), 0 20px 40px rgba(0,0,0,0.4)',
          }}
        >
          {/* Teal left bar */}
          <div
            className="absolute left-0 top-0 bottom-0 w-0.5"
            style={{ background: '#00D9F5', boxShadow: '0 0 15px #00D9F5' }}
          />
          <div className="aw-label text-[10px] mb-2 flex items-center gap-2" style={{ color: '#00D9F5AA' }}>
            <Activity size={11} />
            EXECUTION DIRECTIVE
          </div>
          <p className="m-0 text-base font-medium leading-relaxed pl-4" style={{ color: 'var(--aw-offwhite)' }}>
            {planObj.summary}
          </p>
        </motion.div>

        {/* Vertical node graph */}
        <div className="relative pl-0">
          {/* Glowing vertical spine */}
          <div
            className="absolute left-7 top-0 bottom-0 w-px"
            style={{
              background: 'linear-gradient(to bottom, rgba(0,217,245,0.4), rgba(0,217,245,0.1), transparent)',
            }}
          />

          <div className="flex flex-col gap-6">
            {planObj.steps?.map((step: any, idx: number) => (
              <PlanStepCard
                key={idx}
                step={step}
                idx={idx}
                delay={idx * 0.1}
              />
            ))}

            {/* End node */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: (planObj.steps?.length || 0) * 0.1 + 0.1 }}
              className="relative pl-20"
            >
              <div
                className="absolute left-3 top-1.5 w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  background: 'rgba(0,217,122,0.1)',
                  border: '1px solid rgba(0,217,122,0.3)',
                  boxShadow: '0 0 16px rgba(0,217,122,0.2)',
                }}
              >
                <CheckCircle2 size={16} style={{ color: '#00D97A' }} />
              </div>
              <div className="aw-label text-[10px] mt-2" style={{ color: '#00D97AAA' }}>
                COMPLETE
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  // ── READ-ONLY: raw markdown plan ───────────────────────────────────────────
  if (!workflowVersion && planRaw) {
    return (
      <div
        className="p-6 aw-mono text-[12px] leading-loose overflow-y-auto h-full"
        style={{ color: 'var(--aw-coolgray)' }}
        dangerouslySetInnerHTML={{ __html: planRaw.replace(/\n/g, '<br/>') }}
      />
    );
  }

  // ── EDITABLE MODE ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!editingWorkflow || !workerId) return;
    setSaving(true);
    setError(null);
    try {
      await api.editWorkflow(workerId, editingWorkflow);
      if (onSaved) onSaved();
    } catch (e: any) {
      setError(
        e.response?.data?.error?.message ||
        e.response?.data?.error ||
        e.message ||
        'Failed to save workflow'
      );
    } finally {
      setSaving(false);
    }
  };

  const addStep = (afterIndex: number) => {
    const newWorkflow = { ...editingWorkflow };
    if (!newWorkflow.root_step) {
      newWorkflow.root_step = { id: 'root', operation: 'SEQUENCE', description: 'Root', children: [] };
    }
    if (!newWorkflow.root_step.children) newWorkflow.root_step.children = [];
    newWorkflow.root_step.children.splice(afterIndex + 1, 0, {
      id: `step_${Date.now()}`,
      operation: 'WAIT',
      target: 'BROWSER_DETERMINISTIC',
      description: 'New step',
      args: { timeout: 1000 },
    });
    setEditingWorkflow({ ...newWorkflow });
  };

  const removeStep = (index: number) => {
    const newWorkflow = { ...editingWorkflow };
    newWorkflow.root_step.children.splice(index, 1);
    setEditingWorkflow({ ...newWorkflow });
  };

  const updateStep = (index: number, field: string, value: any) => {
    const newWorkflow = { ...editingWorkflow };
    newWorkflow.root_step.children[index] = {
      ...newWorkflow.root_step.children[index],
      [field]: value,
    };
    setEditingWorkflow({ ...newWorkflow });
  };

  const steps = editingWorkflow?.root_step?.children || [];

  return (
    <div className="flex flex-col items-center py-8 pb-28 overflow-y-auto h-full px-6 gap-0">
      {/* Header */}
      <div
        className="w-full max-w-[640px] flex justify-between items-center rounded-2xl px-5 py-4 mb-6"
        style={{ background: '#0d0d12', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div>
          <div className="font-['Outfit'] font-semibold text-base mb-0.5 flex items-center gap-2" style={{ color: 'var(--aw-offwhite)' }}>
            <span>Workflow Editor</span>
            {(editingWorkflow?.compiler?.source_type === 'VIDEO_RECORDING' || editingWorkflow?.compiler?.source_media_name) && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[rgba(0,194,212,0.1)] text-[#00c2d4] border border-[rgba(0,194,212,0.25)] flex items-center gap-1 font-semibold">
                📹 Learned from Video
              </span>
            )}
          </div>
          <div className="aw-mono text-[11px]" style={{ color: 'var(--aw-coolgray)' }}>
            {editingWorkflow?.compiler?.source_media_name ? (
              <span>Source recording: <strong className="text-zinc-300 font-mono">{editingWorkflow.compiler.source_media_name}</strong></span>
            ) : (
              'Manual override of compiled steps'
            )}
          </div>
        </div>
        {editingWorkflow && (
          <button
            className="aw-btn-primary text-[10px] px-5 py-2"
            onClick={handleSave}
            disabled={saving}
            data-interactive="true"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? 'SAVING' : 'SAVE'}
          </button>
        )}
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-[640px] mb-4 px-5 py-4 rounded-xl flex items-center gap-3 text-sm"
            style={{
              background: 'rgba(245,61,61,0.08)',
              border: '1px solid rgba(245,61,61,0.2)',
              color: '#F53D3D',
            }}
          >
            <ShieldAlert size={16} />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* START node */}
      <div
        className="flex items-center gap-2 px-5 py-2.5 rounded-full mb-1"
        style={{
          background: 'rgba(0,217,245,0.08)',
          border: '1px solid rgba(0,217,245,0.2)',
        }}
      >
        <Play size={12} style={{ color: '#00D9F5' }} fill="#00D9F5" />
        <span className="aw-label text-[10px]" style={{ color: '#00D9F5' }}>WORKFLOW START</span>
      </div>

      <div
        className="w-px h-6"
        style={{ background: 'rgba(0,217,245,0.2)' }}
      />

      {steps.length === 0 && (
        <button
          onClick={() => addStep(-1)}
          className="w-8 h-8 rounded-full flex items-center justify-center mb-1 transition-all"
          style={{
            background: '#0a0a0f',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--aw-coolgray)',
          }}
        >
          <Plus size={16} />
        </button>
      )}

      <AnimatePresence>
        {steps.map((step: any, idx: number) => (
          <EditableStepCard
            key={step.id || idx}
            step={step}
            index={idx}
            onUpdate={(field, value) => updateStep(idx, field, value)}
            onRemove={() => removeStep(idx)}
            onAddAfter={() => addStep(idx)}
          />
        ))}
      </AnimatePresence>

      {/* END node */}
      <div
        className="flex items-center gap-2 px-5 py-2.5 rounded-full"
        style={{
          background: 'rgba(0,217,122,0.06)',
          border: '1px solid rgba(0,217,122,0.2)',
        }}
      >
        <CheckCircle2 size={12} style={{ color: '#00D97A' }} />
        <span className="aw-label text-[10px]" style={{ color: '#00D97A' }}>WORKFLOW END</span>
      </div>
    </div>
  );
}
