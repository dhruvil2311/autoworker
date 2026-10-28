import React from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { ArrowRight, Users } from 'lucide-react';

interface MeetingRoomProps {
  progress?: number;
}

export function MeetingRoom({ progress = 0 }: MeetingRoomProps) {
  // 75" Wall Presentation Display UI
  const PresentationScreenUI = (
    <div style={{
      width: '920px',
      height: '520px',
      background: '#0a0d14',
      color: '#e6edf3',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontSize: '13px',
      display: 'flex',
      flexDirection: 'column',
      userSelect: 'none',
      border: '1px solid #30363d',
      borderRadius: '3px',
      overflow: 'hidden',
      boxShadow: '0 16px 40px rgba(0,0,0,0.85)'
    }}>
      {/* Header */}
      <div style={{
        height: '44px',
        background: '#161b22',
        borderBottom: '1px solid #30363d',
        padding: '0 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            background: 'rgba(139, 100, 212, 0.15)',
            border: '1px solid rgba(139, 100, 212, 0.35)',
            borderRadius: '4px',
            padding: '3px 8px',
            fontSize: '11px',
            fontWeight: 800,
            color: '#8b64d4'
          }}>
            ENTERPRISE TELEMETRY
          </div>
          <span style={{ fontWeight: 700, fontSize: '13px', color: '#f0f6fc' }}>
            Q3 Cross-Department Procedure Friction & Backlog Analysis
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#8b949e' }}>
          <Users size={12} color="#8b64d4" />
          <span>Operations & Finance Review</span>
        </div>
      </div>

      {/* Main Metrics Grid */}
      <div style={{ padding: '18px 22px', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          <div style={{ background: '#12161f', border: '1px solid #30363d', borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Avg Cross-Dept Cycle Time
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#e8942a', marginTop: '4px' }}>
              4.8 Hours
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(240,238,235,0.6)', marginTop: '2px' }}>
              Handoff queue between ERP & AP
            </div>
          </div>

          <div style={{ background: '#12161f', border: '1px solid #30363d', borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Manual Routine Overhead
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#f0f6fc', marginTop: '4px' }}>
              35.2%
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(240,238,235,0.6)', marginTop: '2px' }}>
              Of worker day copying line items
            </div>
          </div>

          <div style={{ background: '#12161f', border: '1px solid #30363d', borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Autonomous Execution Feasibility
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#00c2d4', marginTop: '4px' }}>
              92.4%
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(240,238,235,0.6)', marginTop: '2px' }}>
              With Policy 4B exception routing
            </div>
          </div>
        </div>

        {/* Cross-Department Workflow Diagram */}
        <div style={{ flex: 1, background: '#12161f', border: '1px solid #30363d', borderRadius: '6px', padding: '14px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#f0f6fc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Information Flow: Operations ↔ Finance Reconciliation Loop
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 30px 1.4fr 30px 1.4fr', alignItems: 'center', gap: '6px' }}>
            <div style={{ background: '#161b22', border: '1px solid #00c2d4', borderRadius: '4px', padding: '8px 10px' }}>
              <div style={{ fontSize: '9px', color: '#00c2d4', fontWeight: 700 }}>1. OPERATIONS</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#fff' }}>EDI Order Ingest</div>
              <div style={{ fontSize: '9px', color: '#8b949e' }}>Deficit Flagged</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', color: '#8b949e' }}>
              <ArrowRight size={14} />
            </div>

            <div style={{ background: '#161b22', border: '1px solid #1db87a', borderRadius: '4px', padding: '8px 10px' }}>
              <div style={{ fontSize: '9px', color: '#1db87a', fontWeight: 700 }}>2. FINANCE</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#fff' }}>3-Way PO Match</div>
              <div style={{ fontSize: '9px', color: '#8b949e' }}>$5,890 Authorized</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', color: '#8b949e' }}>
              <ArrowRight size={14} />
            </div>

            <div style={{ background: '#161b22', border: '1px solid #8b64d4', borderRadius: '4px', padding: '8px 10px' }}>
              <div style={{ fontSize: '9px', color: '#8b64d4', fontWeight: 700 }}>3. AUTOWORKER</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#fff' }}>Learned Policy 4B</div>
              <div style={{ fontSize: '9px', color: '#8b949e' }}>Auto-Transfer & Waybill</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid #21262d', fontSize: '11px', color: '#8b949e' }}>
            <span>Target: Zero manual copy-paste handoffs across ERP & GL</span>
            <span style={{ color: '#00c2d4', fontWeight: 600 }}>Autoworker Autonomous Solution</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <group position={[-9.5, 0, 12.5]}>
      {/* ── 1. SOLID AMERICAN WALNUT CONFERENCE TABLE (Top at y = 0.75m) ── */}
      <group position={[0, 0, 0]}>
        <mesh position={[0, 0.735, 0]} receiveShadow castShadow>
          <boxGeometry args={[3.2, 0.038, 1.3]} />
          <meshStandardMaterial color="#342116" roughness={0.42} metalness={0.06} />
        </mesh>
        <mesh position={[0, 0.71, 0]} receiveShadow>
          <boxGeometry args={[3.14, 0.015, 1.24]} />
          <meshStandardMaterial color="#1a110a" roughness={0.6} />
        </mesh>

        {/* Dual Pedestal Bases */}
        {[-1.0, 1.0].map((x, i) => (
          <group key={`m-pedestal-${i}`} position={[x, 0.355, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.2, 0.71, 0.6]} />
              <meshStandardMaterial color="#14151a" roughness={0.4} metalness={0.85} />
            </mesh>
            <mesh position={[0, -0.34, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.4, 0.025, 0.8]} />
              <meshStandardMaterial color="#14151a" roughness={0.4} metalness={0.85} />
            </mesh>
          </group>
        ))}
      </group>

      {/* ── 2. SIX CONFERENCE CHAIRS (Seat at y = 0.46m) ── */}
      {/* North Side (facing South) */}
      {[-1.0, 0, 1.0].map((x, i) => (
        <group key={`m-n-chair-${i}`} position={[x, 0, -0.9]} rotation={[0, 0, 0]}>
          <mesh position={[0, 0.46, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.46, 0.05, 0.44]} />
            <meshStandardMaterial color="#1c1d24" roughness={0.92} />
          </mesh>
          <mesh position={[0, 0.72, -0.19]} rotation={[0.08, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.42, 0.48, 0.03]} />
            <meshStandardMaterial color="#191a20" roughness={0.94} />
          </mesh>
          <mesh position={[0, 0.23, 0]} castShadow>
            <cylinderGeometry args={[0.016, 0.016, 0.42, 16]} />
            <meshStandardMaterial color="#22242c" roughness={0.3} metalness={0.9} />
          </mesh>
        </group>
      ))}

      {/* South Side (facing North) */}
      {[-1.0, 0, 1.0].map((x, i) => (
        <group key={`m-s-chair-${i}`} position={[x, 0, 0.9]} rotation={[0, Math.PI, 0]}>
          <mesh position={[0, 0.46, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.46, 0.05, 0.44]} />
            <meshStandardMaterial color="#1c1d24" roughness={0.92} />
          </mesh>
          <mesh position={[0, 0.72, -0.19]} rotation={[0.08, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.42, 0.48, 0.03]} />
            <meshStandardMaterial color="#191a20" roughness={0.94} />
          </mesh>
          <mesh position={[0, 0.23, 0]} castShadow>
            <cylinderGeometry args={[0.016, 0.016, 0.42, 16]} />
            <meshStandardMaterial color="#22242c" roughness={0.3} metalness={0.9} />
          </mesh>
        </group>
      ))}

      {/* ── 3. LINEAR PENDANT LIGHT (Suspended at y = 2.6m) ── */}
      <group position={[0, 2.6, 0]}>
        <mesh position={[-1.1, 0.7, 0]}>
          <cylinderGeometry args={[0.003, 0.003, 1.4, 8]} />
          <meshStandardMaterial color="#14151a" />
        </mesh>
        <mesh position={[1.1, 0.7, 0]}>
          <cylinderGeometry args={[0.003, 0.003, 1.4, 8]} />
          <meshStandardMaterial color="#14151a" />
        </mesh>
        <mesh position={[0, 0, 0]} castShadow>
          <boxGeometry args={[2.6, 0.025, 0.05]} />
          <meshStandardMaterial color="#181920" roughness={0.3} metalness={0.85} />
        </mesh>
        <mesh position={[0, -0.014, 0]}>
          <boxGeometry args={[2.56, 0.006, 0.038]} />
          <meshStandardMaterial color="#fff5e6" emissive="#fff3df" emissiveIntensity={2.0} toneMapped={false} />
        </mesh>
      </group>

      {/* ── 4. 75" WALL PRESENTATION DISPLAY (Mounted on South wall at y = 2.1m, z = 2.85m) ── */}
      <group position={[0, 2.1, 2.86]} rotation={[0, Math.PI, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[2.2, 1.25, 0.035]} />
          <meshStandardMaterial color="#14151a" roughness={0.4} metalness={0.85} />
        </mesh>
        <mesh position={[0, 0, 0.019]}>
          <planeGeometry args={[2.14, 1.19]} />
          <meshStandardMaterial color="#0a0d14" roughness={0.2} metalness={0.1} />
        </mesh>

        <Html
          transform
          distanceFactor={1.52}
          position={[0, 0, 0.022]}
          style={{ pointerEvents: 'none' }}
        >
          {PresentationScreenUI}
        </Html>
      </group>
    </group>
  );
}
