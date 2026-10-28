import React from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { FileText, CheckCircle2, ArrowRight } from 'lucide-react';
import { Workstation } from './Workstation.js';

interface FinanceAreaProps {
  progress?: number;
}

export function FinanceArea({ progress = 0 }: FinanceAreaProps) {
  // Authentic Enterprise Finance Software UI (Enterprise Ledger 3-Way Match)
  const FinanceScreenUI = (
    <div style={{
      width: '740px',
      height: '440px',
      background: '#0d1117',
      color: '#e6edf3',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontSize: '12px',
      display: 'flex',
      flexDirection: 'column',
      userSelect: 'none',
      border: '1px solid #30363d',
      borderRadius: '2px',
      overflow: 'hidden',
      boxShadow: '0 12px 36px rgba(0,0,0,0.85)'
    }}>
      {/* Top Header */}
      <div style={{
        height: '36px',
        background: '#161b22',
        borderBottom: '1px solid #30363d',
        padding: '0 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            background: 'rgba(29, 184, 122, 0.15)',
            border: '1px solid rgba(29, 184, 122, 0.3)',
            borderRadius: '3px',
            padding: '2px 6px',
            fontSize: '10px',
            fontWeight: 800,
            color: '#1db87a'
          }}>
            FINANCE GL
          </div>
          <span style={{ fontWeight: 700, fontSize: '11px', color: '#f0f6fc' }}>
            Accounts Payable & 3-Way Match Verification
          </span>
          <span style={{ fontSize: '10px', color: '#8b949e' }}>• Fiscal Q3 Reconciliation</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#1db87a', boxShadow: '0 0 6px #1db87a' }} />
          <span style={{ fontSize: '10px', color: '#8b949e', fontFamily: 'monospace' }}>ORACLE GL: SYNCED</span>
        </div>
      </div>

      {/* Main Finance Workspace Layout */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr', overflow: 'hidden' }}>
        {/* Left Side: Invoice Batch List */}
        <div style={{ background: '#12161f', borderRight: '1px solid #30363d', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Vendor Invoice Queue
          </div>

          {[
            { inv: 'INV-2049', po: 'PO-9912', amount: '$5,890.00', status: 'VARIANCE CHECK', statusColor: '#e8942a', active: true },
            { inv: 'INV-2048', po: 'PO-9908', amount: '$12,450.00', status: 'MATCHED', statusColor: '#27c93f', active: false },
            { inv: 'INV-2047', po: 'PO-9901', amount: '$1,200.00', status: 'POSTED', statusColor: '#27c93f', active: false },
            { inv: 'INV-2046', po: 'PO-9894', amount: '$8,720.00', status: 'HOLD: FREIGHT', statusColor: '#e8942a', active: false },
          ].map((item, idx) => (
            <div key={idx} style={{
              padding: '8px 10px',
              borderRadius: '4px',
              background: item.active ? 'rgba(29, 184, 122, 0.08)' : 'rgba(255,255,255,0.02)',
              border: item.active ? '1px solid rgba(29, 184, 122, 0.3)' : '1px solid rgba(255,255,255,0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: item.active ? '#1db87a' : '#f0f6fc', fontSize: '11px' }}>
                  {item.inv}
                </span>
                <span style={{ fontSize: '8px', fontWeight: 700, color: item.statusColor, padding: '1px 4px', borderRadius: '2px', background: `${item.statusColor}18` }}>
                  {item.status}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#8b949e' }}>
                <span>Ref: {item.po}</span>
                <strong style={{ color: '#f0f6fc' }}>{item.amount}</strong>
              </div>
            </div>
          ))}

          <div style={{ marginTop: 'auto', padding: '6px 8px', background: '#161b22', borderRadius: '3px', fontSize: '10px', color: '#8b949e', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={11} color="#1db87a" />
            <span>Audit Trail: SOX compliant</span>
          </div>
        </div>

        {/* Right Side: 3-Way Match Comparison */}
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px', background: '#0d1117' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #21262d', paddingBottom: '8px' }}>
            <div>
              <div style={{ fontSize: '9px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                3-Way Match Verification Matrix
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#f0f6fc', marginTop: '2px' }}>
                Invoice #INV-2049 ↔ PO #PO-9912 (Order #8842)
              </div>
            </div>
            <div style={{
              background: 'rgba(29, 184, 122, 0.12)',
              border: '1px solid rgba(29, 184, 122, 0.3)',
              borderRadius: '4px',
              padding: '3px 8px',
              color: '#1db87a',
              fontSize: '10px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <CheckCircle2 size={11} />
              <span>Awaiting Ops Allocation</span>
            </div>
          </div>

          {/* 3-Way Match Columns */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '4px', padding: '8px 10px' }}>
              <div style={{ fontSize: '9px', color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                1. Purchase Order
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#f0f6fc' }}>PO #PO-9912</div>
              <div style={{ fontSize: '10px', color: '#8b949e', marginTop: '2px' }}>Qty: 46 units</div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#f0f6fc', marginTop: '4px' }}>$5,890.00 USD</div>
            </div>

            <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '4px', padding: '8px 10px' }}>
              <div style={{ fontSize: '9px', color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                2. Waybill / BOL
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#f0f6fc' }}>BOL #FX-99201</div>
              <div style={{ fontSize: '10px', color: '#e8942a', marginTop: '2px' }}>WH-02 Deficit</div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#27c93f', marginTop: '4px' }}>✓ 46 Verified</div>
            </div>

            <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '4px', padding: '8px 10px' }}>
              <div style={{ fontSize: '9px', color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                3. Vendor Invoice
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#f0f6fc' }}>INV-2049 (Net 30)</div>
              <div style={{ fontSize: '10px', color: '#8b949e', marginTop: '2px' }}>Tax Itemized</div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#f0f6fc', marginTop: '4px' }}>$5,890.00 USD</div>
            </div>
          </div>

          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '4px', padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '10px', color: '#8b949e' }}>
              GL Code: <span style={{ fontFamily: 'monospace', color: '#79c0ff' }}>GL-4010-EXP-FULFILLMENT</span>
            </div>
            <div style={{ fontSize: '10px', color: '#1db87a', fontWeight: 700 }}>
              ✓ 3-Way Delta: $0.00
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '2px' }}>
            <div style={{ fontSize: '10px', color: '#8b949e' }}>
              Human Finance Routine: <strong style={{ color: '#f0f6fc' }}>Step 2 / 3 — Reconcile PO</strong>
            </div>
            <div style={{
              background: '#1db87a',
              color: '#0a0a0f',
              padding: '4px 10px',
              borderRadius: '3px',
              fontSize: '10px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <span>Authorize GL Post</span>
              <ArrowRight size={10} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <group position={[12.5, 0, 0]}>
      {/* ── WORKSTATION 1: Primary Finance Reconciler (with live 3-Way Match UI) ── */}
      <group position={[0, 0, 0.8]} rotation={[0, -0.08, 0]}>
        <Workstation
          position={[0, 0, 0]}
          isActive={true}
          isGreen={true}
          isHuman={true}
        />

        {/* Live Finance Software Screen on Left Display */}
        <group position={[-0.34, 1.07, -0.16]} rotation={[0, 0.12, 0]}>
          <Html
            transform
            distanceFactor={0.52}
            position={[0, 0, 0.011]}
            style={{ pointerEvents: 'none' }}
          >
            {FinanceScreenUI}
          </Html>
        </group>
      </group>

      {/* ── WORKSTATION 2: Secondary AP Desk ── */}
      <group position={[0, 0, -2.6]} rotation={[0, 0.05, 0]}>
        <Workstation
          position={[0, 0, 0]}
          isActive={false}
          isHuman={true}
        />
      </group>

      {/* ── Storage Credenza ── */}
      <group position={[3.2, 0, -0.8]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.0, 0.58, 0.42]} />
          <meshStandardMaterial color="#2c1c12" roughness={0.45} metalness={0.06} />
        </mesh>
        <mesh position={[-0.85, 0.045, 0]} castShadow>
          <boxGeometry args={[0.04, 0.09, 0.36]} />
          <meshStandardMaterial color="#14151a" roughness={0.5} metalness={0.85} />
        </mesh>
        <mesh position={[0.85, 0.045, 0]} castShadow>
          <boxGeometry args={[0.04, 0.09, 0.36]} />
          <meshStandardMaterial color="#14151a" roughness={0.5} metalness={0.85} />
        </mesh>
      </group>
    </group>
  );
}
