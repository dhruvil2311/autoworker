/**
 * RealBrowserSurface — Scene 04: EXECUTE
 *
 * This is the most important credibility scene.
 * Shows a real browser viewport with real chrome, a recognizable
 * form/table interface, a cursor moving and interacting, and a
 * sidebar execution trace.
 *
 * Looks like actual software someone could use tomorrow.
 * No fantasy interfaces.
 */
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Execution trace steps shown in sidebar
const TRACE_STEPS = [
  { id: 's1', label: 'Navigate', detail: 'vendorportal.internal/orders', status: 'done', time: '0.8s' },
  { id: 's2', label: 'Find search field', detail: 'aria[name="Order Reference"]', status: 'done', time: '0.3s' },
  { id: 's3', label: 'Type reference', detail: 'INV-2024-08821', status: 'done', time: '0.4s' },
  { id: 's4', label: 'Read status', detail: 'PENDING_APPROVAL · $8,400', status: 'active', time: '...' },
  { id: 's5', label: 'Apply rule', detail: 'total > 5000 → flag for manager', status: 'pending', time: '' },
  { id: 's6', label: 'Click More Actions', detail: 'button[data-action="more"]', status: 'pending', time: '' },
  { id: 's7', label: 'Select Approve', detail: 'menuitem[text="Approve Order"]', status: 'pending', time: '' },
  { id: 's8', label: 'Confirm', detail: 'dialog → confirm button', status: 'pending', time: '' },
];

function ExecutionTrace({ running }: { running: boolean }) {
  const [activeIdx, setActiveIdx] = useState(3);

  useEffect(() => {
    if (!running) { setActiveIdx(3); return; }
    const interval = setInterval(() => {
      setActiveIdx(prev => {
        if (prev >= TRACE_STEPS.length - 1) return prev;
        return prev + 1;
      });
    }, 1600);
    return () => clearInterval(interval);
  }, [running]);

  return (
    <div
      style={{
        width: 220,
        background: '#0a0a10',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
        padding: '12px 0',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '0 14px 10px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontSize: 8,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 600,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: 'rgba(0,194,212,0.5)',
          }}
        >
          Execution Trace
        </div>
      </div>

      {TRACE_STEPS.map((step, i) => {
        const isDone = i < activeIdx;
        const isActive = i === activeIdx;
        const isPending = i > activeIdx;

        return (
          <div
            key={step.id}
            style={{
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              background: isActive ? 'rgba(0,194,212,0.04)' : 'transparent',
            }}
          >
            {/* Status dot */}
            <div style={{ marginTop: 3, flexShrink: 0 }}>
              {isDone && (
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#1db87a' }} />
              )}
              {isActive && (
                <div
                  className="aw-breathe"
                  style={{ width: 6, height: 6, borderRadius: '50%', background: '#00c2d4' }}
                />
              )}
              {isPending && (
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
              )}
            </div>
            {/* Step info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 500,
                  color: isDone
                    ? 'rgba(240,238,235,0.5)'
                    : isActive
                    ? 'rgba(240,238,235,0.9)'
                    : 'rgba(240,238,235,0.2)',
                  marginBottom: 1,
                }}
              >
                {step.label}
              </div>
              <div
                style={{
                  fontSize: 8,
                  fontFamily: 'JetBrains Mono, monospace',
                  color: isDone
                    ? 'rgba(180,178,190,0.25)'
                    : isActive
                    ? 'rgba(0,194,212,0.6)'
                    : 'rgba(180,178,190,0.12)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {step.detail}
              </div>
            </div>
            {/* Time */}
            <div
              style={{
                fontSize: 8,
                fontFamily: 'JetBrains Mono, monospace',
                color: isDone ? '#1db87a66' : 'transparent',
                flexShrink: 0,
              }}
            >
              {step.time}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Simulated vendor portal interface
function VendorPortal({ halted }: { halted: boolean }) {
  return (
    <div style={{ flex: 1, padding: '16px', overflow: 'hidden' }}>
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          paddingBottom: 12,
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontFamily: 'Inter, sans-serif', fontWeight: 600, color: 'rgba(240,238,235,0.9)' }}>
            Order Management
          </div>
          <div style={{ fontSize: 9, fontFamily: 'Inter, sans-serif', color: 'rgba(180,178,190,0.4)' }}>
            Invoice Processing Queue
          </div>
        </div>
        <div
          style={{
            fontSize: 8,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: halted ? '#e8942a' : '#00c2d4',
            background: halted ? 'rgba(232,148,42,0.1)' : 'rgba(0,194,212,0.08)',
            border: `1px solid ${halted ? 'rgba(232,148,42,0.25)' : 'rgba(0,194,212,0.2)'}`,
            borderRadius: 4,
            padding: '3px 8px',
          }}
        >
          {halted ? 'Halted' : 'Processing'}
        </div>
      </div>

      {/* Order table */}
      <div style={{ fontSize: 9, fontFamily: 'Inter, sans-serif', marginBottom: 12 }}>
        {/* Column headers */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 0.7fr 0.5fr 0.6fr 0.7fr',
            gap: 4,
            padding: '4px 8px',
            background: 'rgba(255,255,255,0.02)',
            marginBottom: 2,
          }}
        >
          {['Reference', 'Vendor', 'Amount', 'Status', 'Action'].map(h => (
            <div
              key={h}
              style={{
                color: 'rgba(180,178,190,0.4)',
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                fontSize: 7,
              }}
            >
              {h}
            </div>
          ))}
        </div>

        {/* Data rows */}
        {[
          { ref: 'INV-2024-08821', vendor: 'Meridian Supply', amount: '$8,400', status: 'PENDING_APPROVAL', active: true },
          { ref: 'INV-2024-08820', vendor: 'Tech Parts Ltd', amount: '$1,200', status: 'APPROVED', active: false },
          { ref: 'INV-2024-08819', vendor: 'Office Basics', amount: '$340', status: 'APPROVED', active: false },
          { ref: 'INV-2024-08818', vendor: 'Fleet Services', amount: '$5,100', status: 'APPROVED', active: false },
        ].map((row) => (
          <div
            key={row.ref}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 0.7fr 0.5fr 0.6fr 0.7fr',
              gap: 4,
              padding: '6px 8px',
              background: row.active
                ? (halted ? 'rgba(232,148,42,0.06)' : 'rgba(0,194,212,0.04)')
                : 'transparent',
              borderLeft: row.active
                ? `2px solid ${halted ? '#e8942a' : '#00c2d4'}`
                : '2px solid transparent',
              marginBottom: 1,
            }}
          >
            <div style={{ color: row.active ? 'rgba(240,238,235,0.9)' : 'rgba(240,238,235,0.4)', fontFamily: 'JetBrains Mono, monospace', fontSize: 9 }}>
              {row.ref}
            </div>
            <div style={{ color: 'rgba(240,238,235,0.5)' }}>{row.vendor}</div>
            <div style={{ color: row.active ? (row.amount.replace('$','').replace(',','') > '5000' ? '#e8942a' : 'rgba(240,238,235,0.7)') : 'rgba(240,238,235,0.35)' }}>
              {row.amount}
            </div>
            <div>
              <span
                style={{
                  fontSize: 7,
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  color: row.status === 'APPROVED' ? '#1db87a88' : '#e8942a99',
                  background: row.status === 'APPROVED' ? 'rgba(29,184,122,0.08)' : 'rgba(232,148,42,0.08)',
                  padding: '1px 4px',
                  borderRadius: 3,
                }}
              >
                {row.status}
              </span>
            </div>
            <div>
              {row.active && !halted && (
                <div
                  style={{
                    fontSize: 7,
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    color: 'rgba(0,194,212,0.7)',
                    textTransform: 'uppercase',
                  }}
                >
                  ··· Acting
                </div>
              )}
              {row.active && halted && (
                <div
                  style={{
                    fontSize: 7,
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    color: 'rgba(232,148,42,0.7)',
                    textTransform: 'uppercase',
                  }}
                >
                  Halted
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WorkstationSurface({ visible, running, halted }: {
  visible: boolean;
  running: boolean;
  halted?: boolean;
}) {
  if (!visible) return null;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '65%',
        maxWidth: 680,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.3 } }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="aw-browser"
      >
        {/* Browser chrome */}
        <div className="aw-browser-bar">
          <div className="aw-browser-dot" style={{ background: '#c04040' }} />
          <div className="aw-browser-dot" style={{ background: '#c08030' }} />
          <div className="aw-browser-dot" style={{ background: '#409030' }} />
          <div className="aw-browser-url">vendorportal.internal/orders/queue</div>
          <div
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: running && !halted ? '#00c2d4' : halted ? '#e8942a' : 'rgba(255,255,255,0.15)',
              flexShrink: 0,
            }}
            className={running && !halted ? 'aw-breathe' : ''}
          />
        </div>

        {/* Browser body: portal + trace sidebar */}
        <div style={{ display: 'flex', height: 280 }}>
          <VendorPortal halted={!!halted} />
          <ExecutionTrace running={running && !halted} />
        </div>
      </motion.div>
    </div>
  );
}
