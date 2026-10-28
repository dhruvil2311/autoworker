import React from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';
import { Workstation } from './Workstation.js';

interface OperationsAreaProps {
  progress?: number;
}

export function OperationsArea({ progress = 0 }: OperationsAreaProps) {
  // Authentic Enterprise Operations Dispatch Software UI (Apex Logistics)
  const OperationsScreenUI = (
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
      {/* Chrome App Bar */}
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
            background: 'rgba(0, 194, 212, 0.15)',
            border: '1px solid rgba(0, 194, 212, 0.3)',
            borderRadius: '3px',
            padding: '2px 6px',
            fontSize: '10px',
            fontWeight: 800,
            color: '#00c2d4'
          }}>
            APEX OPS
          </div>
          <span style={{ fontWeight: 700, fontSize: '11px', color: '#f0f6fc' }}>
            Regional Order Fulfillment & Dispatch Matrix
          </span>
          <span style={{ fontSize: '10px', color: '#8b949e' }}>• Queue: 18 Pending</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#27c93f', boxShadow: '0 0 6px #27c93f' }} />
          <span style={{ fontSize: '10px', color: '#8b949e', fontFamily: 'monospace' }}>EDI FEED: LIVE</span>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr', overflow: 'hidden' }}>
        {/* Left Side: Active Orders Queue */}
        <div style={{ background: '#12161f', borderRight: '1px solid #30363d', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Inbound Orders (Tier 1)
          </div>

          {[
            { id: 'ORD-8842', client: 'Northstar Global Corp', status: 'ACTION REQUIRED', statusColor: '#e8942a', active: true },
            { id: 'ORD-8841', client: 'Vanguard Medical Inc', status: 'ALLOCATED', statusColor: '#27c93f', active: false },
            { id: 'ORD-8840', client: 'Meridian Precision', status: 'INSPECTION', statusColor: '#58a6ff', active: false },
            { id: 'ORD-8839', client: 'Solstice Logistics', status: 'DISPATCHED', statusColor: '#27c93f', active: false },
          ].map((ord, idx) => (
            <div key={idx} style={{
              padding: '8px 10px',
              borderRadius: '4px',
              background: ord.active ? 'rgba(0, 194, 212, 0.08)' : 'rgba(255,255,255,0.02)',
              border: ord.active ? '1px solid rgba(0, 194, 212, 0.3)' : '1px solid rgba(255,255,255,0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: ord.active ? '#00c2d4' : '#f0f6fc', fontSize: '11px' }}>
                  #{ord.id}
                </span>
                <span style={{ fontSize: '8px', fontWeight: 700, color: ord.statusColor, padding: '1px 4px', borderRadius: '2px', background: `${ord.statusColor}18` }}>
                  {ord.status}
                </span>
              </div>
              <div style={{ fontSize: '10px', color: '#8b949e' }}>{ord.client}</div>
            </div>
          ))}

          <div style={{ marginTop: 'auto', padding: '6px 8px', background: '#161b22', borderRadius: '3px', fontSize: '10px', color: '#8b949e', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={10} className="animate-spin" />
            <span>Polling ERP backend...</span>
          </div>
        </div>

        {/* Right Side: Order Detail & Deficit Flag */}
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px', background: '#0d1117' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #21262d', paddingBottom: '8px' }}>
            <div>
              <div style={{ fontSize: '9px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Selected EDI Batch • Priority Wholesale
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#f0f6fc', marginTop: '2px' }}>
                Order #ORD-2026-8842
              </div>
            </div>
            <div style={{
              background: 'rgba(232, 148, 42, 0.12)',
              border: '1px solid rgba(232, 148, 42, 0.3)',
              borderRadius: '4px',
              padding: '3px 8px',
              color: '#e8942a',
              fontSize: '10px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <AlertTriangle size={11} />
              <span>Stock Deficit (-4 units)</span>
            </div>
          </div>

          {/* Allocation Matrix Table */}
          <div style={{ flex: 1, background: '#161b22', border: '1px solid #30363d', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2.4fr 0.8fr 1.6fr 1.4fr', padding: '6px 10px', background: '#090d13', borderBottom: '1px solid #30363d', fontSize: '9px', fontWeight: 600, color: '#8b949e' }}>
              <span>SKU</span>
              <span>ITEM DESCRIPTION</span>
              <span>QTY</span>
              <span>ASSIGNED NODE</span>
              <span style={{ textAlign: 'right' }}>STATUS</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2.4fr 0.8fr 1.6fr 1.4fr', padding: '8px 10px', borderBottom: '1px solid #21262d', fontSize: '10px', alignItems: 'center' }}>
              <span style={{ fontFamily: 'monospace', color: '#79c0ff' }}>SKU-9920-A</span>
              <span>Thermal Label Printer</span>
              <span style={{ fontWeight: 600 }}>4</span>
              <span style={{ color: '#8b949e' }}>WH-02 (Austin)</span>
              <span style={{ textAlign: 'right', color: '#27c93f', fontWeight: 600 }}>✓ Allocated</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2.4fr 0.8fr 1.6fr 1.4fr', padding: '8px 10px', borderBottom: '1px solid #21262d', fontSize: '10px', alignItems: 'center', background: 'rgba(232, 148, 42, 0.08)' }}>
              <span style={{ fontFamily: 'monospace', color: '#79c0ff' }}>SKU-3381-F</span>
              <span>2D Barcode Scanner</span>
              <span style={{ fontWeight: 600 }}>12</span>
              <span style={{ color: '#e8942a', fontWeight: 600 }}>WH-02 (Deficit -4)</span>
              <span style={{ textAlign: 'right', color: '#e8942a', fontWeight: 600 }}>⚠️ Re-route</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2.4fr 0.8fr 1.6fr 1.4fr', padding: '8px 10px', fontSize: '10px', alignItems: 'center' }}>
              <span style={{ fontFamily: 'monospace', color: '#79c0ff' }}>SKU-1049-C</span>
              <span>Cat6 Patch Cable 10m</span>
              <span style={{ fontWeight: 600 }}>30</span>
              <span style={{ color: '#8b949e' }}>WH-02 (Austin)</span>
              <span style={{ textAlign: 'right', color: '#27c93f', fontWeight: 600 }}>✓ Allocated</span>
            </div>
          </div>

          {/* Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '2px' }}>
            <div style={{ fontSize: '10px', color: '#8b949e' }}>
              Human Operator Routine: <strong style={{ color: '#f0f6fc' }}>Step 3 / 4 — Manual Warehouse Reallocation</strong>
            </div>
            <div style={{
              background: '#e8942a',
              color: '#0a0a0f',
              padding: '4px 10px',
              borderRadius: '3px',
              fontSize: '10px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <span>Manual Reallocation</span>
              <ArrowRight size={10} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <group position={[-12.5, 0, 0]}>
      {/* ── WORKSTATION 1: Primary Dispatch Desk (with live screen software) ── */}
      <group position={[0, 0, 0.8]} rotation={[0, 0.08, 0]}>
        <Workstation
          position={[0, 0, 0]}
          isActive={true}
          isAmber={true}
          isHuman={true}
        />

        {/* Live Operations Software Screen on Left Display */}
        <group position={[-0.34, 1.07, -0.16]} rotation={[0, 0.12, 0]}>
          <Html
            transform
            distanceFactor={0.52}
            position={[0, 0, 0.011]}
            style={{ pointerEvents: 'none' }}
          >
            {OperationsScreenUI}
          </Html>
        </group>
      </group>

      {/* ── WORKSTATION 2: Secondary Inventory Desk ── */}
      <group position={[0, 0, -2.6]} rotation={[0, -0.05, 0]}>
        <Workstation
          position={[0, 0, 0]}
          isActive={false}
          isHuman={true}
        />
      </group>

      {/* ── Storage Credenza ── */}
      <group position={[-3.2, 0, -0.8]} rotation={[0, Math.PI / 2, 0]}>
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
