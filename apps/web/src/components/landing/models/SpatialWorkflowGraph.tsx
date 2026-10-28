import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';

interface SpatialWorkflowGraphProps {
  progress: number;
}

export function SpatialWorkflowGraph({ progress }: SpatialWorkflowGraphProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Active during stages 07 (Understand: 0.40 - 0.48), 08 (Build: 0.48 - 0.60), 
  // 10 (Uncertainty: 0.60 - 0.68), 11 (Correction: 0.68 - 0.76), 12/13 (Learning/Success: 0.76 - 0.92)
  const isVisible = progress >= 0.38 && progress < 0.92;
  const isUnderstand = progress >= 0.38 && progress < 0.48; // Stage 07
  const isBuild = progress >= 0.48 && progress < 0.60;      // Stage 08, 09
  const isUncertain = progress >= 0.60 && progress < 0.68;  // Stage 10
  const isCorrection = progress >= 0.68 && progress < 0.76; // Stage 11
  const isLearned = progress >= 0.76 && progress < 0.92;    // Stage 12, 13

  useFrame((state, delta) => {
    if (groupRef.current) {
      // Gentle floating animation
      const targetY = isVisible ? 4.8 + Math.sin(state.clock.elapsedTime * 1.5) * 0.08 : 0;
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, targetY, delta * 4);
    }
  });

  if (!isVisible) return null;

  return (
    <group ref={groupRef} position={[0, 4.8, 0]}>
      {/* ── STAGE 07: UNDERSTAND (Unstructured to Structured Understanding) ── */}
      {isUnderstand && (
        <group position={[0, 0, 0]}>
          <Html center transform distanceFactor={4} position={[0, 0, 0]}>
            <div style={{
              width: '560px',
              background: 'rgba(14, 14, 20, 0.94)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(0, 194, 212, 0.25)',
              borderRadius: '12px',
              padding: '20px 24px',
              color: '#f0eeeb',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6), 0 0 30px rgba(0,194,212,0.15)',
              fontFamily: 'Inter, sans-serif'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00c2d4', boxShadow: '0 0 10px #00c2d4' }} />
                  <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#00c2d4' }}>
                    Knowledge Extraction System
                  </span>
                </div>
                <span style={{ fontSize: '10px', color: 'rgba(240,238,235,0.4)', fontFamily: 'JetBrains Mono, monospace' }}>
                  SOP-INVOICES.PDF → PARSED
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 600, color: '#8b64d4', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' }}>01 / RULES</div>
                  <div style={{ fontSize: '12px', fontWeight: 500 }}>Vendor = Acme Corp</div>
                  <div style={{ fontSize: '10px', color: 'rgba(240,238,235,0.5)', marginTop: '4px' }}>Match Tax ID & PO#</div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 600, color: '#00c2d4', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' }}>02 / CONDITIONS</div>
                  <div style={{ fontSize: '12px', fontWeight: 500 }}>Amount &lt; $50,000</div>
                  <div style={{ fontSize: '10px', color: 'rgba(240,238,235,0.5)', marginTop: '4px' }}>Auto-reconcile threshold</div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 600, color: '#1db87a', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' }}>03 / ACTIONS</div>
                  <div style={{ fontSize: '12px', fontWeight: 500 }}>Approve & Route</div>
                  <div style={{ fontSize: '10px', color: 'rgba(240,238,235,0.5)', marginTop: '4px' }}>Post to NetSuite ERP</div>
                </div>
              </div>
            </div>
          </Html>
        </group>
      )}

      {/* ── STAGE 08: BUILD (Deterministic Pathway Graph v1) ── */}
      {(isBuild || isUncertain) && (
        <group position={[0, 0, 0]}>
          <Html center transform distanceFactor={4.2} position={[0, 0.4, 0]}>
            <div style={{
              width: '640px',
              background: 'rgba(12, 12, 18, 0.95)',
              backdropFilter: 'blur(16px)',
              border: `1px solid ${isUncertain ? 'rgba(232, 148, 42, 0.4)' : 'rgba(0, 194, 212, 0.3)'}`,
              borderRadius: '14px',
              padding: '18px 22px',
              color: '#f0eeeb',
              boxShadow: isUncertain ? '0 20px 60px rgba(0,0,0,0.7), 0 0 35px rgba(232,148,42,0.2)' : '0 20px 60px rgba(0,0,0,0.7), 0 0 35px rgba(0,194,212,0.18)',
              fontFamily: 'Inter, sans-serif'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isUncertain ? '#e8942a' : '#00c2d4', boxShadow: `0 0 10px ${isUncertain ? '#e8942a' : '#00c2d4'}` }} />
                  <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: isUncertain ? '#e8942a' : '#00c2d4' }}>
                    {isUncertain ? 'Execution Paused — Uncertainty' : 'Compiled Workflow v1.0'}
                  </span>
                </div>
                <span style={{ fontSize: '10px', color: 'rgba(240,238,235,0.4)', fontFamily: 'JetBrains Mono, monospace' }}>
                  DETERMINISTIC SEQUENCE
                </span>
              </div>

              {/* Physical Process Flow Nodes */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', overflowX: 'auto', padding: '4px 0' }}>
                {[
                  { label: 'OPEN PORTAL', sub: 'Enterprise ERP', done: true },
                  { label: 'FIND ORDER', sub: '#ORD-992', done: true },
                  { label: 'READ STATUS', sub: 'Pending Verification', done: true },
                  { label: 'APPLY RULE', sub: 'Amount < $50k', done: !isUncertain, error: isUncertain },
                  { label: 'APPROVE', sub: 'Click Action', done: false, dimmed: isUncertain },
                  { label: 'VERIFY', sub: 'Ledger Synced', done: false, dimmed: isUncertain },
                ].map((node, i) => (
                  <React.Fragment key={i}>
                    <div style={{
                      background: node.error ? 'rgba(232, 148, 42, 0.12)' : node.done ? 'rgba(0, 194, 212, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                      border: `1px solid ${node.error ? '#e8942a' : node.done ? 'rgba(0, 194, 212, 0.4)' : 'rgba(255, 255, 255, 0.06)'}`,
                      borderRadius: '8px',
                      padding: '8px 10px',
                      minWidth: '88px',
                      textAlign: 'center',
                      opacity: node.dimmed ? 0.35 : 1,
                      transition: 'all 0.3s ease'
                    }}>
                      <div style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.04em', color: node.error ? '#e8942a' : node.done ? '#00c2d4' : 'rgba(240,238,235,0.8)' }}>
                        {node.label}
                      </div>
                      <div style={{ fontSize: '8px', color: 'rgba(240,238,235,0.4)', marginTop: '2px', fontFamily: 'JetBrains Mono, monospace' }}>
                        {node.sub}
                      </div>
                    </div>
                    {i < 5 && (
                      <div style={{ color: node.done ? '#00c2d4' : 'rgba(255,255,255,0.15)', fontSize: '10px', fontWeight: 'bold' }}>
                        →
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </Html>
        </group>
      )}

      {/* ── STAGE 11: HUMAN CORRECTION (Guidance enters experience memory) ── */}
      {isCorrection && (
        <group position={[0, 0, 0]}>
          <Html center transform distanceFactor={4} position={[0, 0.3, 0]}>
            <div style={{
              width: '540px',
              background: 'rgba(14, 14, 20, 0.95)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(232, 148, 42, 0.35)',
              borderRadius: '14px',
              padding: '20px 24px',
              color: '#f0eeeb',
              boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 30px rgba(232,148,42,0.15)',
              fontFamily: 'Inter, sans-serif'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#e8942a', boxShadow: '0 0 10px #e8942a' }} />
                <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#e8942a' }}>
                  Human Guidance Received
                </span>
              </div>
              <div style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                padding: '14px 16px',
                fontSize: '14px',
                fontStyle: 'italic',
                color: '#fff',
                marginBottom: '14px'
              }}>
                “Open More Actions dropdown first, then click Approve Vendor.”
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(240,238,235,0.5)' }}>
                <span>Encoding into worker long-term memory...</span>
                <span style={{ color: '#00c2d4', fontWeight: 600 }}>Synthesizing Workflow v2</span>
              </div>
            </div>
          </Html>
        </group>
      )}

      {/* ── STAGE 12 & 13: LEARNING & WORK AGAIN (Workflow v2.0 - Verified) ── */}
      {isLearned && (
        <group position={[0, 0, 0]}>
          <Html center transform distanceFactor={4.2} position={[0, 0.4, 0]}>
            <div style={{
              width: '680px',
              background: 'rgba(12, 12, 18, 0.95)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(29, 184, 122, 0.4)',
              borderRadius: '14px',
              padding: '18px 22px',
              color: '#f0eeeb',
              boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 35px rgba(29,184,122,0.2)',
              fontFamily: 'Inter, sans-serif'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1db87a', boxShadow: '0 0 10px #1db87a' }} />
                  <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1db87a' }}>
                    Compiled Workflow v2.0 (Learned from Correction)
                  </span>
                </div>
                <span style={{ fontSize: '10px', color: '#1db87a', fontFamily: 'JetBrains Mono, monospace', background: 'rgba(29,184,122,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                  ✓ VERIFIED SUCCESS
                </span>
              </div>

              {/* Enhanced Flow with the Newly Learned Node */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '5px', overflowX: 'auto', padding: '4px 0' }}>
                {[
                  { label: 'OPEN PORTAL', sub: 'Enterprise ERP', done: true },
                  { label: 'FIND ORDER', sub: '#ORD-992', done: true },
                  { label: 'READ STATUS', sub: 'Pending Verification', done: true },
                  { label: 'MORE ACTIONS', sub: 'Learned Step', done: true, highlight: true },
                  { label: 'APPROVE', sub: 'Vendor Approved', done: true },
                  { label: 'VERIFY', sub: 'Ledger Synced', done: true },
                ].map((node, i) => (
                  <React.Fragment key={i}>
                    <div style={{
                      background: node.highlight ? 'rgba(29, 184, 122, 0.15)' : 'rgba(0, 194, 212, 0.08)',
                      border: `1px solid ${node.highlight ? '#1db87a' : 'rgba(0, 194, 212, 0.4)'}`,
                      borderRadius: '8px',
                      padding: '8px 10px',
                      minWidth: '88px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.04em', color: node.highlight ? '#1db87a' : '#00c2d4' }}>
                        {node.label}
                      </div>
                      <div style={{ fontSize: '8px', color: 'rgba(240,238,235,0.5)', marginTop: '2px', fontFamily: 'JetBrains Mono, monospace' }}>
                        {node.sub}
                      </div>
                    </div>
                    {i < 5 && (
                      <div style={{ color: '#1db87a', fontSize: '10px', fontWeight: 'bold' }}>
                        →
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}
