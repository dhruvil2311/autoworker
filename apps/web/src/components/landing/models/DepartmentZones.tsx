import React from 'react';
import { Html } from '@react-three/drei';
import { Workstation } from './Workstation.js';
import { Chair } from './Chair.js';
import { PottedPlant, DeskLamp } from './OfficeProps.js';

interface DepartmentZonesProps {
  progress: number;
}

export function DepartmentZones({ progress }: DepartmentZonesProps) {
  // ── 1. Operations Department Software UI ──
  const OperationsUI = (
    <div style={{ width: '800px', height: '480px', background: '#0e1117', color: '#c9d1d9', fontFamily: 'Inter, sans-serif', fontSize: '13px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: '44px', background: '#161b22', borderBottom: '1px solid #30363d', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#00c2d4' }} />
          <span style={{ fontWeight: 600, color: '#f0f6fc', letterSpacing: '0.02em' }}>Operations Flow · Order Dispatch Portal</span>
        </div>
        <span style={{ fontSize: '11px', color: '#8b949e', fontFamily: 'JetBrains Mono, monospace' }}>QUEUE: 14 ACTIVE</span>
      </div>
      <div style={{ padding: '16px 20px', flex: 1, display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
        <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: '#21262d', fontSize: '12px', fontWeight: 600, color: '#8b949e' }}>Incoming Orders</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
            <thead>
              <tr style={{ color: '#8b949e', borderBottom: '1px solid #30363d' }}>
                <th style={{ padding: '8px 12px' }}>Order ID</th>
                <th>SKU</th>
                <th>Destination</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #21262d' }}>
                <td style={{ padding: '8px 12px', color: '#58a6ff' }}>#ORD-992</td>
                <td>SKU-4409</td>
                <td>Chicago, IL</td>
                <td><span style={{ background: 'rgba(0,194,212,0.15)', color: '#00c2d4', padding: '2px 6px', borderRadius: '4px' }}>Processing</span></td>
              </tr>
              <tr style={{ borderBottom: '1px solid #21262d' }}>
                <td style={{ padding: '8px 12px', color: '#58a6ff' }}>#ORD-991</td>
                <td>SKU-1120</td>
                <td>Austin, TX</td>
                <td><span style={{ background: 'rgba(29,184,122,0.15)', color: '#1db87a', padding: '2px 6px', borderRadius: '4px' }}>Dispatched</span></td>
              </tr>
              <tr>
                <td style={{ padding: '8px 12px', color: '#58a6ff' }}>#ORD-990</td>
                <td>SKU-8821</td>
                <td>Seattle, WA</td>
                <td><span style={{ background: 'rgba(232,148,42,0.15)', color: '#e8942a', padding: '2px 6px', borderRadius: '4px' }}>Routing Hold</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '14px' }}>
            <div style={{ fontSize: '11px', color: '#8b949e', textTransform: 'uppercase' }}>Fulfillment Rate</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#f0f6fc', marginTop: '4px' }}>99.2%</div>
            <div style={{ fontSize: '11px', color: '#1db87a', marginTop: '2px' }}>↑ +1.4% vs last shift</div>
          </div>
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '14px' }}>
            <div style={{ fontSize: '11px', color: '#8b949e', textTransform: 'uppercase' }}>Active Gateway</div>
            <div style={{ fontSize: '13px', color: '#f0f6fc', marginTop: '4px', fontWeight: 500 }}>Apex Logistics Dispatch API</div>
            <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '2px' }}>Latency: 28ms · Healthy</div>
          </div>
        </div>
      </div>
    </div>
  );

  // ── 2. Finance Department Software UI ──
  const FinanceUI = (
    <div style={{ width: '800px', height: '480px', background: '#0b0f14', color: '#d0d7de', fontFamily: 'Inter, sans-serif', fontSize: '13px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: '44px', background: '#121820', borderBottom: '1px solid #202b38', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#1db87a' }} />
          <span style={{ fontWeight: 600, color: '#f0f6fc', letterSpacing: '0.02em' }}>Corporate Finance · General Ledger Reconciliation</span>
        </div>
        <span style={{ fontSize: '11px', color: '#1db87a', background: 'rgba(29,184,122,0.1)', padding: '2px 8px', borderRadius: '4px' }}>PERIOD: Q3 CLOSE</span>
      </div>
      <div style={{ padding: '16px 20px', flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={{ background: '#121820', border: '1px solid #202b38', borderRadius: '6px', padding: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e', marginBottom: '10px' }}>Pending Invoices for Approval</div>
          <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #1a2330' }}>
                <td style={{ padding: '8px 0', fontWeight: 500 }}>INV-2024-881</td>
                <td>Acme Logistics</td>
                <td style={{ fontWeight: 600 }}>$14,250.00</td>
                <td style={{ color: '#e8942a' }}>Pending</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #1a2330' }}>
                <td style={{ padding: '8px 0', fontWeight: 500 }}>INV-2024-880</td>
                <td>CloudScale SaaS</td>
                <td style={{ fontWeight: 600 }}>$3,840.00</td>
                <td style={{ color: '#1db87a' }}>Matched</td>
              </tr>
              <tr>
                <td style={{ padding: '8px 0', fontWeight: 500 }}>INV-2024-879</td>
                <td>Global Office Supply</td>
                <td style={{ fontWeight: 600 }}>$920.50</td>
                <td style={{ color: '#1db87a' }}>Matched</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ background: '#121820', border: '1px solid #202b38', borderRadius: '6px', padding: '14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e', marginBottom: '6px' }}>Reconciliation Accuracy</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#1db87a' }}>100.0%</div>
            <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '4px' }}>Automated matching rule: 3-way PO, Receipt & Invoice</div>
          </div>
          <div style={{ background: '#18202c', padding: '10px', borderRadius: '4px', fontSize: '11px', color: '#8b949e' }}>
            Net Ledger Delta: <strong style={{ color: '#f0f6fc' }}>$0.00</strong> (Zero variance)
          </div>
        </div>
      </div>
    </div>
  );

  // ── 3. Inventory & Logistics Software UI ──
  const InventoryUI = (
    <div style={{ width: '800px', height: '480px', background: '#0f1115', color: '#c5cbd3', fontFamily: 'Inter, sans-serif', fontSize: '13px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: '44px', background: '#181c24', borderBottom: '1px solid #282e3c', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#e8942a' }} />
          <span style={{ fontWeight: 600, color: '#fff', letterSpacing: '0.02em' }}>Inventory Operations · SKU Telemetry</span>
        </div>
        <span style={{ fontSize: '11px', color: '#e8942a', background: 'rgba(232,148,42,0.1)', padding: '2px 8px', borderRadius: '4px' }}>4 WAREHOUSES LIVE</span>
      </div>
      <div style={{ padding: '16px 20px', flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={{ background: '#181c24', border: '1px solid #282e3c', borderRadius: '6px', padding: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e', marginBottom: '8px' }}>Critical Stock Thresholds</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px', background: '#202632', borderRadius: '4px' }}>
              <span>SKU-4409 (Thermal Sensor)</span>
              <strong style={{ color: '#1db87a' }}>1,420 units</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px', background: '#202632', borderRadius: '4px' }}>
              <span>SKU-1120 (Fiber Coupler)</span>
              <strong style={{ color: '#e8942a' }}>84 units (Restock)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px', background: '#202632', borderRadius: '4px' }}>
              <span>SKU-8821 (Logic Controller)</span>
              <strong style={{ color: '#1db87a' }}>610 units</strong>
            </div>
          </div>
        </div>
        <div style={{ background: '#181c24', border: '1px solid #282e3c', borderRadius: '6px', padding: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e', marginBottom: '8px' }}>Logistics Transit Status</div>
          <div style={{ fontSize: '11px', color: '#8b949e', lineHeight: 1.6 }}>
            Inbound: 12 Shipments (On Schedule)<br/>
            Outbound: 48 Pallets Dispatched<br/>
            Average Pick Time: <span style={{ color: '#00c2d4', fontWeight: 600 }}>1.8 mins</span>
          </div>
        </div>
      </div>
    </div>
  );

  // ── 4. Customer Operations Software UI ──
  const CustomerOpsUI = (
    <div style={{ width: '800px', height: '480px', background: '#0e1017', color: '#c9d1d9', fontFamily: 'Inter, sans-serif', fontSize: '13px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: '44px', background: '#171b26', borderBottom: '1px solid #293042', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#8b64d4' }} />
          <span style={{ fontWeight: 600, color: '#fff', letterSpacing: '0.02em' }}>Customer Operations · Real-Time Incident Stream</span>
        </div>
        <span style={{ fontSize: '11px', color: '#8b64d4', background: 'rgba(139,100,212,0.1)', padding: '2px 8px', borderRadius: '4px' }}>SLA 99.8%</span>
      </div>
      <div style={{ padding: '16px 20px', flex: 1, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
        <div style={{ background: '#171b26', border: '1px solid #293042', borderRadius: '6px', padding: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e', marginBottom: '8px' }}>Active Conversation Stream</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
            <div style={{ padding: '8px', background: '#1f2433', borderRadius: '4px', borderLeft: '3px solid #8b64d4' }}>
              <div style={{ fontWeight: 600, color: '#fff' }}>Ticket #8912 · Acme Corp</div>
              <div style={{ color: '#8b949e', marginTop: '2px' }}>"Inquiry on invoice #881 payment status."</div>
              <div style={{ color: '#1db87a', marginTop: '4px', fontSize: '10px' }}>✓ Resolved by Digital Worker (1.2s)</div>
            </div>
            <div style={{ padding: '8px', background: '#1f2433', borderRadius: '4px', borderLeft: '3px solid #00c2d4' }}>
              <div style={{ fontWeight: 600, color: '#fff' }}>Ticket #8911 · Delta Labs</div>
              <div style={{ color: '#8b949e', marginTop: '2px' }}>"Address change requested for order #992."</div>
              <div style={{ color: '#00c2d4', marginTop: '4px', fontSize: '10px' }}>⚙ Routing to ERP update workflow</div>
            </div>
          </div>
        </div>
        <div style={{ background: '#171b26', border: '1px solid #293042', borderRadius: '6px', padding: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e' }}>Mean Resolution Time</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#00c2d4', marginTop: '6px' }}>420 ms</div>
          <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '8px', lineHeight: 1.5 }}>
            Automated ticket categorization, intent classification, and instant database response.
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <group>
      {/* ── DEPARTMENT 1: OPERATIONS (Front Left Zone) ── */}
      <Workstation
        position={[-22, 0, 8]}
        rotation={[0, Math.PI / 4, 0]}
        uiElement={OperationsUI}
        isActive={progress < 0.28 || progress > 0.88}
        isHuman={true}
      />

      {/* ── DEPARTMENT 2: FINANCE (Rear Left Zone) ── */}
      <Workstation
        position={[-18, 0, -22]}
        rotation={[0, Math.PI / 3, 0]}
        uiElement={FinanceUI}
        isActive={progress < 0.28 || progress > 0.88}
        isHuman={true}
      />

      {/* ── DEPARTMENT 3: INVENTORY & LOGISTICS (Rear Right Zone) ── */}
      <Workstation
        position={[20, 0, -20]}
        rotation={[0, -Math.PI / 3, 0]}
        uiElement={InventoryUI}
        isActive={progress < 0.28 || progress > 0.88}
        isHuman={true}
      />

      {/* ── DEPARTMENT 4: CUSTOMER OPERATIONS (Front Right Zone) ── */}
      <Workstation
        position={[24, 0, 6]}
        rotation={[0, -Math.PI / 2.2, 0]}
        uiElement={CustomerOpsUI}
        isActive={progress < 0.28 || progress > 0.88}
        isHuman={true}
      />

      {/* ── DEPARTMENT 5: RESEARCH & STRATEGY (Mid Left Area) ── */}
      <Workstation
        position={[-32, 0, -8]}
        rotation={[0, Math.PI / 2, 0]}
        isActive={progress < 0.28 || progress > 0.88}
        isHuman={true}
      />

      {/* ── RECEPTION & ENTRANCE (Scene 01 Foreground Zone at z = 22) ── */}
      <group position={[0, 0, 22]}>
        {/* Slatted Dark Walnut Feature Wall Behind Reception */}
        <group position={[0, 6, 4]}>
          <mesh receiveShadow castShadow>
            <boxGeometry args={[14, 12, 0.4]} />
            <meshStandardMaterial color="#101015" roughness={0.9} />
          </mesh>
          {/* Vertical Walnut Louvers */}
          {[...Array(20)].map((_, i) => (
            <mesh key={`louver-${i}`} position={[-6.2 + i * 0.65, 0, 0.25]} castShadow>
              <boxGeometry args={[0.18, 12, 0.15]} />
              <meshStandardMaterial color="#241810" roughness={0.42} />
            </mesh>
          ))}
          {/* Architectural Halo Glow */}
          <pointLight position={[0, 0, 0.6]} intensity={1.1} distance={8} color="#fff4e0" />
        </group>

        {/* Sculptural Dark Walnut Reception Desk */}
        <mesh position={[0, 1.8, 0]} castShadow receiveShadow>
          <boxGeometry args={[10, 3.6, 2.4]} />
          <meshStandardMaterial color="#1a120c" roughness={0.45} metalness={0.1} />
        </mesh>
        {/* Polished Black Granite Top Surface */}
        <mesh position={[0, 3.65, 0]} receiveShadow>
          <boxGeometry args={[10.4, 0.1, 2.6]} />
          <meshStandardMaterial color="#0c0c10" roughness={0.2} metalness={0.4} />
        </mesh>
        {/* Warm Linear LED Accent Under Plinth */}
        <mesh position={[0, 0.1, 1.25]}>
          <boxGeometry args={[9.8, 0.05, 0.1]} />
          <meshStandardMaterial color="#fff4e0" emissive="#fff4e0" emissiveIntensity={1.8} toneMapped={false} />
        </mesh>

        {/* Receptionist Ergonomic Chair */}
        <group position={[0, 0, -2]}>
          <Chair />
        </group>
        {/* Reception Desk Task Lamp */}
        <group position={[-3.5, 3.7, 0.4]} scale={0.85}>
          <DeskLamp />
        </group>

        {/* ── Executive Reception Terminal & Welcome Directory Display ── */}
        <group position={[0, 3.7, 0.2]}>
          {/* Terminal Stand */}
          <mesh position={[0, 0.15, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.14, 0.3, 16]} />
            <meshStandardMaterial color="#1a1e28" roughness={0.3} metalness={0.9} />
          </mesh>
          <mesh position={[0, 0.01, 0]}>
            <cylinderGeometry args={[0.22, 0.24, 0.02, 24]} />
            <meshStandardMaterial color="#14161f" roughness={0.2} metalness={0.9} />
          </mesh>

          {/* Ultra-Wide 38" Curved Architectural Terminal Frame */}
          <mesh position={[0, 0.45, 0]} castShadow>
            <boxGeometry args={[1.4, 0.52, 0.04]} />
            <meshStandardMaterial color="#0c0d12" roughness={0.25} metalness={0.85} />
          </mesh>

          {/* Active Lit Screen Surface */}
          <mesh position={[0, 0.45, 0.022]}>
            <planeGeometry args={[1.36, 0.48]} />
            <meshStandardMaterial
              color="#0d111a"
              emissive="#1e293b"
              emissiveIntensity={0.6}
              roughness={0.1}
              metalness={0.2}
              toneMapped={false}
            />
          </mesh>

          {/* Screen Content UI */}
          <Html position={[0, 0.45, 0.025]} center transform distanceFactor={2.4}>
            <div style={{
              width: '420px',
              padding: '14px 18px',
              background: 'rgba(9, 12, 18, 0.95)',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              fontFamily: 'Inter, sans-serif',
              color: '#f4f2ee',
              userSelect: 'none',
              boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
                  <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    AUTOWORKER // OPERATIONS HQ
                  </span>
                </div>
                <span style={{ fontSize: '9px', fontFamily: 'JetBrains Mono, monospace', color: '#60a5fa' }}>
                  LEVEL 42 · ACTIVE
                </span>
              </div>
              <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ fontSize: '8px', color: '#8e94a0', textTransform: 'uppercase' }}>Digital Employees</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#f4f2ee', fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>7 Provisioned</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ fontSize: '8px', color: '#8e94a0', textTransform: 'uppercase' }}>Facility Uptime</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#10b981', fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>99.98% · 60 FPS</div>
                </div>
              </div>
              <div style={{ marginTop: '8px', fontSize: '9px', color: '#8e92a4', fontFamily: 'JetBrains Mono, monospace' }}>
                ORIENT: OPERATIONS (BAY 01) · FINANCE (BAY 02) · INVENTORY (BAY 03)
              </div>
            </div>
          </Html>

          {/* Terminal Screen Ambient Illumination */}
          <pointLight position={[0, 0.45, 0.3]} intensity={0.9} distance={2.5} color="#93c5fd" />
        </group>

        {/* Potted Indoor Ficus Trees */}
        <group position={[-6.2, 0, 0.5]} scale={1.3}>
          <PottedPlant />
        </group>
        <group position={[6.2, 0, 0.5]} scale={1.3}>
          <PottedPlant />
        </group>

        {/* Embossed Architectural Wall Typography */}
        <group position={[0, 7.8, 4.3]}>
          <mesh receiveShadow>
            <boxGeometry args={[5.8, 0.8, 0.04]} />
            <meshStandardMaterial color="#121218" roughness={0.5} />
          </mesh>
          {/* Subtle Ambient Branding */}
          <Html position={[0, 0, 0.04]} center transform distanceFactor={5}>
            <div style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'rgba(240, 238, 235, 0.75)',
              userSelect: 'none'
            }}>
              AUTOWORKER HEADQUARTERS
            </div>
          </Html>
        </group>
      </group>

      {/* ── GLASS CONFERENCE ROOM / EXECUTIVE CABIN (Right Zone at x = 34, z = -8) ── */}
      <group position={[34, 0, -8]}>
        {/* Solid Walnut Boardroom Table */}
        <mesh position={[0, 2.9, 0]} castShadow receiveShadow>
          <boxGeometry args={[4.6, 0.16, 11.5]} />
          <meshStandardMaterial color="#241810" roughness={0.4} metalness={0.1} />
        </mesh>
        {/* Table Bases */}
        <mesh position={[0, 1.45, -3.8]} castShadow>
          <boxGeometry args={[0.8, 2.9, 0.8]} />
          <meshStandardMaterial color="#0e0e14" metalness={0.8} />
        </mesh>
        <mesh position={[0, 1.45, 3.8]} castShadow>
          <boxGeometry args={[0.8, 2.9, 0.8]} />
          <meshStandardMaterial color="#0e0e14" metalness={0.8} />
        </mesh>

        {/* 8 Conference Chairs */}
        {[-3.6, -1.2, 1.2, 3.6].map((zPos, i) => (
          <React.Fragment key={`conf-chair-${i}`}>
            <group position={[-3.2, 0, zPos]} rotation={[0, Math.PI / 2, 0]}>
              <Chair />
            </group>
            <group position={[3.2, 0, zPos]} rotation={[0, -Math.PI / 2, 0]}>
              <Chair />
            </group>
          </React.Fragment>
        ))}

        {/* 85-inch 4K Executive Operational Screen */}
        <group position={[7.8, 6.2, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <mesh receiveShadow castShadow>
            <boxGeometry args={[8.4, 4.4, 0.1]} />
            <meshStandardMaterial color="#0e0e14" roughness={0.5} />
          </mesh>
          <Html transform position={[0, 0, 0.06]} scale={0.105} occlude>
            <div style={{ width: '800px', height: '420px', background: '#0a0d14', color: '#f0f6fc', padding: '24px', fontFamily: 'Inter, sans-serif', borderRadius: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #202b38', paddingBottom: '12px', marginBottom: '16px' }}>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>Executive Operations Dashboard · Q3 Enterprise Fleet</div>
                <div style={{ color: '#1db87a', fontWeight: 600, fontSize: '13px' }}>● 100% OPERATIONAL</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                <div style={{ background: '#121820', padding: '16px', borderRadius: '8px', border: '1px solid #202b38' }}>
                  <div style={{ color: '#8b949e', fontSize: '12px' }}>Total Tasks Executed</div>
                  <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '6px' }}>142,890</div>
                  <div style={{ color: '#1db87a', fontSize: '11px', marginTop: '4px' }}>↑ 18% vs last month</div>
                </div>
                <div style={{ background: '#121820', padding: '16px', borderRadius: '8px', border: '1px solid #202b38' }}>
                  <div style={{ color: '#8b949e', fontSize: '12px' }}>Exception Auto-Resolution</div>
                  <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '6px', color: '#00c2d4' }}>99.4%</div>
                  <div style={{ color: '#8b949e', fontSize: '11px', marginTop: '4px' }}>Learned from 32 human inputs</div>
                </div>
                <div style={{ background: '#121820', padding: '16px', borderRadius: '8px', border: '1px solid #202b38' }}>
                  <div style={{ color: '#8b949e', fontSize: '12px' }}>Human Hours Saved</div>
                  <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '6px', color: '#1db87a' }}>3,410 hrs</div>
                  <div style={{ color: '#8b949e', fontSize: '11px', marginTop: '4px' }}>Zero overtime required</div>
                </div>
              </div>
            </div>
          </Html>
        </group>

        {/* Potted Indoor Trees in Meeting Room */}
        <group position={[-6.2, 0, 8.2]} scale={1.2}>
          <PottedPlant />
        </group>
        <group position={[6.2, 0, 8.2]} scale={1.2}>
          <PottedPlant />
        </group>
      </group>
    </group>
  );
}
