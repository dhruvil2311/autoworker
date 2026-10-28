import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Command, ArrowRight, Play, GraduationCap, Settings, Cpu, ShieldAlert, Sparkles, Building2 } from 'lucide-react';

export interface CommandItem {
  id: string;
  title: string;
  category: string;
  icon?: React.ReactNode;
  shortcut?: string;
  onSelect: () => void;
}

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  workers?: any[];
}

export function CommandPalette({ isOpen, onClose, workers = [] }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();

  // Keyboard shortcut listener: Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else onClose(); // parent toggles
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Built-in navigation commands
  const baseCommands: CommandItem[] = [
    {
      id: 'cmd-hq',
      title: 'Digital Operations Floor',
      category: 'Navigation',
      icon: <Building2 size={13} />,
      shortcut: 'G H',
      onSelect: () => { navigate('/workforce'); onClose(); },
    },
    {
      id: 'cmd-hire',
      title: 'Provision New Digital Workstation',
      category: 'Actions',
      icon: <Cpu size={13} />,
      onSelect: () => { navigate('/workforce?action=hire'); onClose(); },
    },
    {
      id: 'cmd-settings',
      title: 'Workspace Settings & API Keys',
      category: 'Navigation',
      icon: <Settings size={13} />,
      shortcut: 'G S',
      onSelect: () => { navigate('/settings'); onClose(); },
    },
  ];

  // Dynamic worker commands
  const workerCommands: CommandItem[] = workers.flatMap((w) => [
    {
      id: `worker-view-${w.id}`,
      title: `${w.name} · Open Workspace`,
      category: 'Workers',
      icon: <Cpu size={13} className="text-[#00c2d4]" />,
      onSelect: () => { navigate(`/workers/${w.id}`); onClose(); },
    },
    {
      id: `worker-teach-${w.id}`,
      title: `${w.name} · Teach SOP & Rules`,
      category: 'Workers',
      icon: <GraduationCap size={13} className="text-[#8b64d4]" />,
      onSelect: () => { navigate(`/workers/${w.id}/teach`); onClose(); },
    },
  ]);

  const allCommands = [...baseCommands, ...workerCommands];

  const filteredCommands = allCommands.filter((c) =>
    c.title.toLowerCase().includes(query.toLowerCase()) ||
    c.category.toLowerCase().includes(query.toLowerCase())
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filteredCommands.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % (filteredCommands.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredCommands[selectedIndex];
      if (selected) selected.onSelect();
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#07080c]/80 backdrop-blur-md"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -10 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            className="relative w-full max-w-xl bg-[#0e1017] border border-[rgba(255,255,255,0.1)] rounded-lg shadow-2xl overflow-hidden flex flex-col z-10"
          >
            {/* Search Input Bar */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[rgba(255,255,255,0.06)] bg-[#0b0d13]">
              <Search size={16} className="text-[#686b78] shrink-0" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Type a command, worker name, or navigation target..."
                className="w-full bg-transparent text-sm text-[#f4f2ee] placeholder-[#686b78] outline-none"
              />
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.06)] text-[#8e92a4] border border-[rgba(255,255,255,0.08)]">
                ESC
              </span>
            </div>

            {/* Results List */}
            <div className="max-h-[340px] overflow-y-auto p-2 divide-y divide-[rgba(255,255,255,0.02)]">
              {filteredCommands.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#686b78]">
                  No matching operations found for "{query}"
                </div>
              ) : (
                filteredCommands.map((cmd, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={cmd.id}
                      onClick={cmd.onSelect}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[rgba(0,194,212,0.12)] text-[#00c2d4]'
                          : 'text-[#a5a8b5] hover:bg-[rgba(255,255,255,0.03)]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="shrink-0 text-current">{cmd.icon}</span>
                        <span className="text-xs font-medium text-[#f4f2ee]">{cmd.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-semibold tracking-wider text-[#686b78]">
                          {cmd.category}
                        </span>
                        {cmd.shortcut && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[rgba(255,255,255,0.06)] text-[#8e92a4]">
                            {cmd.shortcut}
                          </span>
                        )}
                        <ArrowRight size={12} className="opacity-40" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer Help */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-[rgba(255,255,255,0.05)] bg-[#07080c] text-[10px] text-[#686b78]">
              <span>Navigate with ↑ ↓ · Select with ↵</span>
              <span>Autoworker Command Palette</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
