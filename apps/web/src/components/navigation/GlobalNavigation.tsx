import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Building2,
  Sliders,
  Search,
  Activity,
  User,
  LogOut,
  ChevronDown,
  Layers,
  Sparkles,
  ShieldCheck,
  Radio,
  Plus,
} from 'lucide-react';
import { useAuth } from '../AuthContext.js';
import { CommandPalette } from '../ui/CommandPalette.js';
import { Drawer } from '../ui/Drawer.js';
import { ActivityStream } from '../workspace/ActivityStream.js';
import { CommandProvisionDrawer } from '../workspace/CommandProvisionDrawer.js';
import { BrandLogo } from '../ui/BrandLogo.js';
import { api } from '../../api.js';

export function GlobalNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, signOut } = useAuth();

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [activityDrawerOpen, setActivityDrawerOpen] = useState(false);
  const [provisionDrawerOpen, setProvisionDrawerOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [apiOnline, setApiOnline] = useState(true);

  const [workers, setWorkers] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [wRes, rRes] = await Promise.all([
          api.listWorkers().catch(() => ({ ghost_workers: [] })),
          api.listRuns().catch(() => ({ runs: [] })),
        ]);
        const wList = (wRes as any).ghost_workers || (wRes as any).workers || [];
        setWorkers(wList);
        setRuns((rRes as any).runs || []);
        setApiOnline(true);
      } catch {
        setApiOnline(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, []);

  const isHQ = location.pathname === '/workforce' || location.pathname === '/hq' || location.pathname === '/';
  const isCommand = location.pathname === '/command';

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-12 z-50 bg-[#080a0e]/90 backdrop-blur-md border-b border-white/[0.07] px-4 flex items-center justify-between text-xs select-none">
        {/* Left: Autoworker Institutional Mark & Organization */}
        <div className="flex items-center gap-3">
          <Link
            to="/workforce"
            className="flex items-center text-[#f4f2ee] hover:text-white transition-opacity group no-underline"
          >
            <BrandLogo variant="nav" />
          </Link>

          <span className="text-[#4b4e5c]">/</span>
          <span className="text-[11px] font-medium text-[#8e92a4] truncate max-w-[140px] sm:max-w-none">
            Operations HQ
          </span>
        </div>

        {/* Center: Primary Modes (HQ Spatial vs Command Operational) */}
        <nav className="flex items-center bg-[#0d0f15] border border-white/[0.08] rounded p-0.5 shadow-inner">
          <button
            onClick={() => navigate('/workforce')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
              isHQ
                ? 'bg-[#f4f2ee] text-[#080a0e] font-semibold shadow-sm'
                : 'text-[#8e92a4] hover:text-[#f4f2ee]'
            }`}
          >
            <Building2 size={12} />
            <span>HQ · Spatial Floor</span>
          </button>

          <button
            onClick={() => navigate('/command')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
              isCommand
                ? 'bg-[#f4f2ee] text-[#080a0e] font-semibold shadow-sm'
                : 'text-[#8e92a4] hover:text-[#f4f2ee]'
            }`}
          >
            <Sliders size={12} />
            <span>Command Room</span>
          </button>
        </nav>

        {/* Right: Search, Activity, Telemetry, Account */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Hire / Add Worker Quick Trigger */}
          <button
            onClick={() => setProvisionDrawerOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#00c2d4]/15 hover:bg-[#00c2d4]/25 border border-[#00c2d4]/40 text-[#00c2d4] hover:text-[#22d3ee] text-xs font-semibold transition-all cursor-pointer shadow-sm"
            title="Hire or provision a new digital worker"
          >
            <Plus size={12} />
            <span className="hidden xs:inline">Hire Worker</span>
          </button>

          {/* Universal Search (⌘K) */}
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded bg-[#0e1017] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.15)] text-[#8e92a4] text-xs transition-colors cursor-pointer"
          >
            <Search size={12} />
            <span className="text-[11px]">Search...</span>
            <kbd className="px-1 py-0.2 bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)] rounded text-[9px] font-mono">
              ⌘K
            </kbd>
          </button>

          {/* Activity Drawer Trigger */}
          <button
            onClick={() => setActivityDrawerOpen(true)}
            className="flex items-center gap-1 px-2 py-1 rounded text-[#8e92a4] hover:text-[#f4f2ee] hover:bg-[rgba(255,255,255,0.04)] transition-colors cursor-pointer"
            title="Real-time Activity Stream"
          >
            <Activity size={13} />
            <span className="hidden md:inline text-[11px]">Activity</span>
          </button>

          {/* Live Telemetry Pulse */}
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] text-[10px] font-mono text-[#8e92a4]"
            title={apiOnline ? 'Autonomous Engine Synced' : 'Disconnected'}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                apiOnline ? 'bg-[#1db87a] animate-pulse' : 'bg-[#ef4444]'
              }`}
            />
            <span className="hidden lg:inline">{apiOnline ? '60 FPS' : 'OFFLINE'}</span>
          </div>

          {/* Account & Profile Menu */}
          <div className="relative">
            <button
              onClick={() => setAccountMenuOpen(!accountMenuOpen)}
              className="flex items-center gap-1.5 p-1 rounded hover:bg-[rgba(255,255,255,0.05)] text-[#8e92a4] hover:text-[#f4f2ee] transition-colors cursor-pointer"
            >
              <div className="w-5 h-5 rounded-full bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.12)] flex items-center justify-center text-[10px] font-semibold text-[#f4f2ee]">
                {session?.user?.email?.charAt(0).toUpperCase() || 'O'}
              </div>
              <ChevronDown size={11} />
            </button>

            {accountMenuOpen && (
              <div
                className="absolute right-0 mt-1.5 w-48 bg-[#0e1017] border border-[rgba(255,255,255,0.08)] rounded-md shadow-xl py-1 z-50 text-xs flex flex-col"
                onMouseLeave={() => setAccountMenuOpen(false)}
              >
                <div className="px-3 py-2 border-b border-[rgba(255,255,255,0.06)]">
                  <div className="font-medium text-[#f4f2ee] truncate">
                    {session?.user?.email || 'Operations Lead'}
                  </div>
                  <div className="text-[10px] text-[#686b78]">Supervisor Role</div>
                </div>

                <Link
                  to="/settings"
                  onClick={() => setAccountMenuOpen(false)}
                  className="px-3 py-2 text-[#8e92a4] hover:text-[#f4f2ee] hover:bg-[rgba(255,255,255,0.04)] flex items-center gap-2"
                >
                  <User size={12} /> Workplace Settings
                </Link>

                <button
                  onClick={() => {
                    setAccountMenuOpen(false);
                    signOut();
                  }}
                  className="px-3 py-2 text-[#ef4444] hover:bg-[rgba(239,68,68,0.08)] flex items-center gap-2 w-full text-left cursor-pointer"
                >
                  <LogOut size={12} /> Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global Command Palette (⌘K) */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        workers={workers}
      />

      {/* Contextual Activity Drawer */}
      <Drawer
        isOpen={activityDrawerOpen}
        onClose={() => setActivityDrawerOpen(false)}
        title="Real-Time Workplace Activity"
        subtitle="Chronological operations log across human and digital workers"
        width="md"
      >
        <ActivityStream runs={runs} workers={workers} />
      </Drawer>

      {/* Global Worker Provision Drawer */}
      <CommandProvisionDrawer
        isOpen={provisionDrawerOpen}
        onClose={() => setProvisionDrawerOpen(false)}
        onProvisioned={() => {
          setProvisionDrawerOpen(false);
          api.listWorkers().then(wRes => {
            const wList = (wRes as any).ghost_workers || (wRes as any).workers || [];
            setWorkers(wList);
          }).catch(() => {});
        }}
      />
    </>
  );
}
