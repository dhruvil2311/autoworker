import React, { useEffect, useState } from "react";
import { api } from "../api.js";

export function BootstrapWrapper({ children }: { children: React.ReactNode }) {
  const [bootstrapped, setBootstrapped] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    
    // Safety fallback: Never trap the user on black screen for > 2 seconds
    const safetyTimer = setTimeout(() => {
      if (mounted) setBootstrapped(true);
    }, 2000);

    api.bootstrap()
      .then(() => {
        if (mounted) setBootstrapped(true);
      })
      .catch((err) => {
        console.warn("Bootstrap warning:", err);
        if (mounted) setBootstrapped(true);
      })
      .finally(() => {
        clearTimeout(safetyTimer);
      });

    return () => { 
      mounted = false; 
      clearTimeout(safetyTimer);
    };
  }, []);

  if (error) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: '24px', textAlign: 'center', background: 'var(--aw-obsidian)', color: 'var(--aw-offwhite)' }}>
        <div style={{ maxWidth: '400px' }}>
          <div style={{ width: 48, height: 48, background: 'rgba(214,64,64,0.08)', color: 'var(--aw-red)', border: '1px solid rgba(214,64,64,0.24)', borderRadius: 12, display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <h2 style={{ marginBottom: '8px', fontFamily: 'var(--font-display)', fontWeight: 700 }}>Workspace initialization stopped</h2>
          <p style={{ color: 'var(--aw-coolgray)', marginBottom: '24px', fontSize: 14, lineHeight: 1.6 }}>{error}</p>
          <button className="aw-btn-primary" onClick={() => window.location.reload()}>Retry initialization</button>
        </div>
      </div>
    );
  }

  if (!bootstrapped) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', background: 'var(--aw-obsidian)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="analysis-spinner" style={{ width: 40, height: 40, borderWidth: 2, margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--aw-coolgray)' }}>Opening Autoworker HQ.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
