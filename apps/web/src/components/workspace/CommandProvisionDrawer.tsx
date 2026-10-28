import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Building2, Plus, Sparkles, Check } from 'lucide-react';
import { api } from '../../api.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/Input.js';

interface CommandProvisionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onProvisioned?: () => void;
}

const DEPARTMENTS = [
  { id: 'operations', name: 'Operations Bay', bay: 'West Wing', desc: 'Order fulfillment, cross-docking, dispatch' },
  { id: 'finance', name: 'Finance & Ledger', bay: 'East Wing', desc: 'Invoices, 3-way reconciliation, payroll auditing' },
  { id: 'inventory', name: 'Inventory & SKU', bay: 'South-West', desc: 'Safety stock tracking, supplier portal re-orders' },
  { id: 'customer', name: 'Customer Operations', bay: 'South-East', desc: 'Tier-1 dispatch, returns authorization, refunds' },
  { id: 'research', name: 'Research & Intel', bay: 'North Central', desc: 'Competitive catalog indexing, pricing discovery' },
];

export const WORKER_TYPES = [
  {
    id: 'WEB_BROWSER',
    name: 'Web & Portal Specialist',
    badge: 'Browser Navigation',
    icon: '🌐',
    desc: 'Automates browser portals, SaaS apps, back-offices (e.g. Magento, Shopify, ERPs, Admin consoles).',
    capabilities: ['browser', 'api', 'human'],
  },
  {
    id: 'DESKTOP_AGENT',
    name: 'Native Desktop Operator',
    badge: 'OS / Desktop GUI',
    icon: '🖥️',
    desc: 'Navigates native desktop applications, local spreadsheets, accounting software, and file systems.',
    capabilities: ['desktop', 'api', 'human'],
  },
  {
    id: 'HYBRID_HITL',
    name: 'Hybrid HITL Specialist',
    badge: 'Human-in-the-Loop',
    icon: '🛡️',
    desc: 'Operates with automated sign-in / OTP auth barrier handling and supervisor escalation.',
    capabilities: ['browser', 'desktop', 'human', 'api'],
  },
  {
    id: 'API_PIPELINE',
    name: 'API & Integration Worker',
    badge: 'MCP / Webhooks',
    icon: '⚡',
    desc: 'Executes automated webhooks, headless MCP tools, data syncs, and backend reconciliation.',
    capabilities: ['api', 'mcp'],
  },
];

export function CommandProvisionDrawer({
  isOpen,
  onClose,
  onProvisioned,
}: CommandProvisionDrawerProps) {
  const navigate = useNavigate();
  const [roleName, setRoleName] = useState('Order Fulfillment Specialist');
  const [workerType, setWorkerType] = useState('WEB_BROWSER');
  const [department, setDepartment] = useState('operations');
  const [roleDesc, setRoleDesc] = useState('');
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([
    'api', 'mcp', 'browser', 'desktop', 'human'
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectWorkerType = (typeId: string) => {
    setWorkerType(typeId);
    const matched = WORKER_TYPES.find(t => t.id === typeId);
    if (matched) {
      setSelectedCapabilities(matched.capabilities);
      if (!roleName || roleName === 'Order Fulfillment Specialist' || WORKER_TYPES.some(t => t.name === roleName)) {
        setRoleName(matched.name);
      }
    }
  };

  const toggleCapability = (id: string) => {
    setSelectedCapabilities(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const selectedDept = DEPARTMENTS.find((d) => d.id === department);
      const selectedType = WORKER_TYPES.find((t) => t.id === workerType);
      const finalName = roleName.trim() || selectedType?.name || 'Order Fulfillment Specialist';
      const fullDesc = roleDesc.trim()
        ? `[${selectedDept?.name}] ${roleDesc.trim()}`
        : `[${selectedDept?.name}] ${selectedType?.name} dedicated to ${selectedDept?.desc}.`;

      const res = await api.createWorker({
        name: finalName,
        description: fullDesc,
        workerType,
        department: selectedDept?.name,
        capabilities: selectedCapabilities,
        safetyPolicy: {
          workerType,
          department: selectedDept?.name,
          capabilities: selectedCapabilities,
        },
        triggerConfig: {
          workerType,
        },
        status: 'NEW',
      });

      onClose();
      onProvisioned?.();

      if (res?.id) {
        navigate(`/workers/${res.id}`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to provision worker');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-hidden pointer-events-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
          className="absolute inset-0 bg-[#07080c]/60 backdrop-blur-[2px] pointer-events-auto"
        />

        {/* Side Sheet */}
        <div className="fixed inset-y-0 right-0 max-w-full flex pl-8 pointer-events-none">
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="pointer-events-auto w-screen max-w-md bg-[#0a0c12] border-l border-[rgba(255,255,255,0.08)] shadow-2xl flex flex-col justify-between"
          >
            {/* Header */}
            <div className="p-6 border-b border-[rgba(255,255,255,0.06)] flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Building2 size={13} className="text-[#00c2d4]" />
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#00c2d4]">
                    Digital Worker Provisioning
                  </span>
                </div>
                <h2 className="text-base font-bold text-[#f4f2ee] tracking-tight">
                  Add Digital Worker
                </h2>
                <p className="text-xs text-[#8e92a4] mt-0.5 leading-relaxed">
                  Deploy a new autonomous worker connected to live execution, operational runs, and evidence telemetry.
                </p>
              </div>

              <button
                onClick={onClose}
                className="p-1.5 text-[#8e92a4] hover:text-[#f4f2ee] hover:bg-[rgba(255,255,255,0.06)] rounded transition-colors cursor-pointer shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              {error && (
                <div className="p-3 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.25)] rounded text-xs text-[#ef4444]">
                  {error}
                </div>
              )}

              {/* Step 1: Worker Execution Archetype */}
              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#8e92a4] flex items-center justify-between">
                  <span>1. Worker Execution Archetype</span>
                  <span className="text-[10px] text-[#00c2d4] font-mono">Select Type</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {WORKER_TYPES.map((t) => {
                    const isSelected = workerType === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleSelectWorkerType(t.id)}
                        className={`p-2.5 rounded border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                          isSelected
                            ? 'bg-[#00c2d4]/12 border-[#00c2d4] text-[#f4f2ee]'
                            : 'bg-[#0e1017] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.15)] text-[#8e92a4]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-base">{t.icon}</span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                            isSelected ? 'bg-[#00c2d4]/20 text-[#00c2d4]' : 'bg-white/[0.04] text-[#8e92a4]'
                          }`}>
                            {t.badge}
                          </span>
                        </div>
                        <span className={`text-xs font-semibold ${isSelected ? 'text-[#f4f2ee]' : 'text-slate-200'}`}>
                          {t.name}
                        </span>
                        <span className="text-[10px] text-[#686b78] leading-tight line-clamp-2">
                          {t.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Worker Role Title */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#8e92a4]">
                  2. Worker Role & Title
                </label>
                <input
                  type="text"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder="e.g. Accounts Payable Auditor"
                  required
                  className="w-full bg-[#0e1017] border border-[rgba(255,255,255,0.08)] focus:border-[#00c2d4] rounded p-2.5 text-xs text-[#f4f2ee] placeholder-[#686b78] outline-none transition-colors"
                />
              </div>

              {/* Department Bay Assignment */}
              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#8e92a4]">
                  Assigned Operational Wing
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {DEPARTMENTS.map((dept) => {
                    const isSelected = department === dept.id;
                    return (
                      <div
                        key={dept.id}
                        onClick={() => setDepartment(dept.id)}
                        className={`p-3 rounded border transition-all cursor-pointer flex items-start justify-between ${
                          isSelected
                            ? 'bg-[#00c2d4]/10 border-[#00c2d4]/40 text-[#f4f2ee]'
                            : 'bg-[#0e1017] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.15)] text-[#8e92a4]'
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className={`font-medium ${isSelected ? 'text-[#00c2d4]' : 'text-[#f4f2ee]'}`}>
                            {dept.name} · {dept.bay}
                          </span>
                          <span className="text-[11px] text-[#686b78] mt-0.5">{dept.desc}</span>
                        </div>
                        {isSelected && <Check size={14} className="text-[#00c2d4] shrink-0 mt-0.5" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Operational Responsibility */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#8e92a4]">
                  Operational Scope & Software Target
                </label>
                <textarea
                  rows={3}
                  value={roleDesc}
                  onChange={(e) => setRoleDesc(e.target.value)}
                  placeholder="e.g. Cross-references PO numbers in NetSuite against courier tracking manifests..."
                  className="w-full bg-[#0e1017] border border-[rgba(255,255,255,0.08)] focus:border-[#00c2d4] rounded p-2.5 text-xs text-[#f4f2ee] placeholder-[#686b78] outline-none transition-colors"
                />
              </div>

              {/* Execution Capability Selection */}
              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#8e92a4]">
                  How Should This Ghost Operate?
                </label>
                <div className="grid grid-cols-1 gap-1.5 text-xs">
                  {[
                    { id: 'api', label: 'APIs', desc: 'Direct REST/GraphQL endpoints' },
                    { id: 'mcp', label: 'MCP', desc: 'Model Context Protocol tool servers' },
                    { id: 'browser', label: 'Browser', desc: 'Web automation & portal navigation' },
                    { id: 'desktop', label: 'Desktop Computer', desc: 'Real Windows apps: Excel, Tally, SAP, ERP, legacy software' },
                    { id: 'human', label: 'Human Approval', desc: 'Supervised approval gates for high-risk actions' },
                  ].map((cap) => {
                    const isChecked = selectedCapabilities.includes(cap.id);
                    return (
                      <div
                        key={cap.id}
                        onClick={() => toggleCapability(cap.id)}
                        className={`p-2.5 rounded border transition-all cursor-pointer flex items-center justify-between ${
                          isChecked 
                            ? 'bg-[#00c2d4]/10 border-[#00c2d4]/40 text-[#f4f2ee]' 
                            : 'bg-[#0e1017] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] text-[#8e92a4]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox" 
                            checked={isChecked} 
                            onChange={() => {}} 
                            className="rounded border-[rgba(255,255,255,0.2)] bg-[#151822] text-[#00c2d4]" 
                          />
                          <div>
                            <span className={`font-medium ${isChecked ? 'text-[#00c2d4]' : 'text-[#f4f2ee]'}`}>{cap.label}</span>
                            <span className="text-[10px] text-[#686b78] ml-2">{cap.desc}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </form>

            {/* Footer */}
            <div className="p-5 border-t border-[rgba(255,255,255,0.06)] bg-[#07080c] flex items-center justify-end gap-2.5 shrink-0">
              <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<Plus size={12} />}
                disabled={submitting}
                onClick={handleSubmit}
              >
                {submitting ? 'Deploying...' : 'Deploy Digital Worker'}
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}
