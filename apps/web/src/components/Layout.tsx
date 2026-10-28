import React from 'react';
import { GlobalNavigation } from './navigation/GlobalNavigation.js';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-[#07080c] text-[#f4f2ee]">
      {/* ── 1. Lightweight Global Navigation Chrome (48px) ── */}
      <GlobalNavigation />

      {/* ── 2. Full-Bleed Primary Workplace Surface (100% Screen Ownership) ── */}
      <main className="flex-1 w-full h-[calc(100vh-48px)] mt-12 overflow-hidden relative">
        {children}
      </main>
    </div>
  );
}
