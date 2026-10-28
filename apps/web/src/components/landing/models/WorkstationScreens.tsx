import React from 'react';
import { Html } from '@react-three/drei';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Database, 
  Sparkles, 
  Lock, 
  FileText, 
  ChevronDown, 
  ArrowRight, 
  Check, 
  Package, 
  Truck
} from 'lucide-react';

interface WorkstationScreensProps {
  progress: number;
}

export function WorkstationScreens({ progress }: WorkstationScreensProps) {
  // ── Exact V3 10-Phase Scroll Timeline State Mapping ───────────────────────
  // 0.00 – 0.10: ARRIVAL / OFFICE (Calm office, hero workstation visible)
  // 0.10 – 0.20: TASK ARRIVES (Order #48219 arrives in ERP queue, workstation awakens)
  // 0.20 – 0.35: CAMERA APPROACHES (Cursor activates and positions)
  // 0.35 – 0.50: WORKER EXECUTES (Run 1: Inspects line items, notes 4-unit deficit at WH-02)
  // 0.50 – 0.60: TEACHING / UNDERSTANDING (SOP-402 Rule Clause highlighted on right monitor)
  // 0.60 – 0.70: UNEXPECTED STATE (Action button missing from default toolbar, amber state)
  // 0.70 – 0.78: HUMAN CORRECTION (Chat prompt inside UI: "Open More Actions first.")
  // 0.78 – 0.88: LEARNING / WORKFLOW CHANGE (Graph transforms v1.0 -> v2.0, committed to memory)
  // 0.88 – 0.95: SECOND EXECUTION (Learned route: More Actions -> Cross-Dock, waybill created)
  // 0.95 – 1.00: PULL BACK / "IT REMEMBERED" (Subtle green indicator, grand pullback)

  const p = Math.max(0, Math.min(1.0, progress));

  const isIdle = p < 0.10;
  const isTaskArriving = p >= 0.10 && p < 0.20;
  const isApproaching = p >= 0.20 && p < 0.35;
  const isRun1 = p >= 0.35 && p < 0.50;
  const isTeaching = p >= 0.50 && p < 0.60;
  const isUncertain = p >= 0.60 && p < 0.70;
  const isHumanGuidance = p >= 0.70 && p < 0.78;
  const isWorkflowTransform = p >= 0.78 && p < 0.88;
  const isRun2 = p >= 0.88 && p < 0.95;
  const isComplete = p >= 0.95;

  // Compute realistic 2D cursor coordinates on the Left ERP screen (740 x 440)
  const getCursorState = () => {
    if (isIdle) {
      return { x: 700, y: 420, visible: false, clicking: false };
    }
    if (isTaskArriving) {
      const local = (p - 0.10) / 0.10;
      return { x: 700 - local * 420, y: 420 - local * 310, visible: true, clicking: false };
    }
    if (isApproaching) {
      const local = (p - 0.20) / 0.15;
      return { x: 280 + local * 60, y: 110 + local * 90, visible: true, clicking: false };
    }
    if (isRun1) {
      const local = (p - 0.35) / 0.15;
      if (local < 0.4) {
        // Inspecting row SKU-3381-F
        return { x: 340 + local * 50, y: 200 + local * 20, visible: true, clicking: local > 0.3 };
      } else {
        // Gliding to top right toolbar looking for direct fulfill
        const sub = (local - 0.4) / 0.6;
        return { x: 360 + sub * 250, y: 208 - sub * 98, visible: true, clicking: false };
      }
    }
    if (isTeaching || isUncertain || isHumanGuidance || isWorkflowTransform) {
      // Hovering in hesitation at top action bar
      return { x: 610 + Math.sin(p * 50) * 3, y: 110 + Math.cos(p * 50) * 2, visible: true, clicking: false };
    }
    if (isRun2) {
      const local = (p - 0.88) / 0.07;
      if (local < 0.3) {
        // Gliding to More Actions button
        const sub = local / 0.3;
        return { x: 610 - sub * 120, y: 110, visible: true, clicking: sub > 0.8 };
      } else if (local < 0.6) {
        // Moving down dropdown menu to Cross-Dock Transfer
        const sub = (local - 0.3) / 0.3;
        return { x: 490 + sub * 20, y: 110 + sub * 75, visible: true, clicking: sub > 0.8 };
      } else {
        // Finalizing dispatch confirmation
        const sub = (local - 0.6) / 0.4;
        return { x: 510 + sub * 130, y: 185 + sub * 200, visible: true, clicking: sub > 0.7 };
      }
    }
    // Completed state
    return { x: 680, y: 410, visible: true, clicking: false };
  };

  const cursor = getCursorState();

  // Dropdown menu state on Left Screen
  const showDropdown = isRun2 && (p >= 0.89 && p < 0.93);
  const isDeficitResolved = (isRun2 && p >= 0.92) || isComplete;

  // ══════════════════════════════════════════════════════════════════════════
  // 1. LEFT MONITOR: REAL APEX ENTERPRISE ERP (740 x 440 px)
  // ══════════════════════════════════════════════════════════════════════════
  const LeftMonitorUI = (
    <div style={{
      width: '740px',
      height: '440px',
      background: '#0d1117',
      color: '#e6edf3',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      fontSize: '12px',
      display: 'flex',
      flexDirection: 'column',
      userSelect: 'none',
      border: `1px solid ${isUncertain ? 'rgba(232, 148, 42, 0.6)' : isComplete ? 'rgba(39, 201, 63, 0.5)' : '#30363d'}`,
      borderRadius: '2px',
      overflow: 'hidden',
      position: 'relative',
      boxShadow: isUncertain 
        ? '0 0 25px rgba(232, 148, 42, 0.25), 0 12px 36px rgba(0,0,0,0.9)'
        : isComplete
        ? '0 0 25px rgba(39, 201, 63, 0.2), 0 12px 36px rgba(0,0,0,0.9)'
        : '0 12px 36px rgba(0,0,0,0.85)',
      transition: 'border-color 0.4s ease, box-shadow 0.4s ease'
    }}>
      {/* Chrome Browser Header */}
      <div style={{
        height: '34px',
        background: '#161b22',
        borderBottom: '1px solid #30363d',
        padding: '0 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', gap: '5px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ff5f56' }} />
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ffbd2e' }} />
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#27c93f' }} />
        </div>

        <div style={{
          background: '#0d1117',
          borderTop: '2px solid #00c2d4',
          borderRadius: '4px 4px 0 0',
          padding: '3px 10px',
          fontSize: '10px',
          color: '#e6edf3',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontWeight: 600
        }}>
          <Package size={11} color="#00c2d4" />
          <span>Apex ERP — Order #48219</span>
        </div>

        <div style={{
          flex: 1,
          background: '#090d12',
          border: '1px solid #30363d',
          borderRadius: '4px',
          padding: '2px 10px',
          fontSize: '10px',
          color: '#8b949e',
          fontFamily: 'monospace',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <Lock size={10} color="#27c93f" />
          <span>https://ops.apexlogistics.internal/orders/48219</span>
        </div>

        <div style={{
          background: isUncertain ? 'rgba(232, 148, 42, 0.15)' : isDeficitResolved ? 'rgba(39, 201, 63, 0.15)' : 'rgba(0, 194, 212, 0.15)',
          color: isUncertain ? '#e8942a' : isDeficitResolved ? '#27c93f' : '#00c2d4',
          border: `1px solid ${isUncertain ? 'rgba(232, 148, 42, 0.3)' : isDeficitResolved ? 'rgba(39, 201, 63, 0.3)' : 'rgba(0, 194, 212, 0.3)'}`,
          padding: '2px 8px',
          borderRadius: '3px',
          fontSize: '9px',
          fontWeight: 700
        }}>
          {isUncertain ? '⚠️ AWAITING INPUT' : isDeficitResolved ? '✓ READY TO SHIP' : isIdle ? 'STANDBY' : 'PROCESSING'}
        </div>
      </div>

      {/* Main ERP Interface Content */}
      <div style={{ padding: '14px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        
        {/* Order Header & Action Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #21262d', paddingBottom: '10px' }}>
          <div>
            <div style={{ fontSize: '10px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Wholesale Logistics • Tier-1 Priority SLA
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#f0f6fc', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
              <span>Order #48219</span>
              <span style={{ fontSize: '11px', color: '#8b949e', fontWeight: 400 }}>• Northstar Global Corp</span>
              {isDeficitResolved && (
                <span style={{ padding: '1px 6px', background: 'rgba(39, 201, 63, 0.15)', color: '#3fb950', fontSize: '10px', borderRadius: '3px', fontWeight: 600 }}>
                  ✓ Reconciled
                </span>
              )}
            </div>
          </div>

          {/* Action Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
            {/* More Actions Dropdown Button */}
            <button style={{
              background: showDropdown ? '#21262d' : '#161b22',
              border: `1px solid ${showDropdown ? '#00c2d4' : '#30363d'}`,
              color: showDropdown ? '#00c2d4' : '#c9d1d9',
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'default'
            }}>
              <span>More Actions</span>
              <ChevronDown size={11} />
            </button>

            {/* Direct Fulfill (Disabled/Missing during Run 1 to trigger uncertainty) */}
            <button style={{
              background: isDeficitResolved ? '#238636' : isUncertain ? '#30363d' : '#1f6feb',
              color: '#ffffff',
              border: 'none',
              padding: '4px 12px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              opacity: isUncertain ? 0.4 : 1,
              cursor: 'default'
            }}>
              {isDeficitResolved ? '✓ Order Dispatched' : 'Direct Fulfill'}
            </button>

            {/* Interactive Dropdown Menu Popover (Opens during Run 2) */}
            {showDropdown && (
              <div style={{
                position: 'absolute',
                top: '28px',
                left: 0,
                width: '190px',
                background: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '4px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
                zIndex: 40,
                padding: '4px 0',
                fontSize: '10px'
              }}>
                <div style={{ padding: '4px 10px', color: '#8b949e' }}>Order Sub-Actions</div>
                <div style={{ padding: '6px 10px', color: '#c9d1d9' }}>Re-route Carrier SLA</div>
                <div style={{
                  padding: '6px 10px',
                  background: 'rgba(0, 194, 212, 0.2)',
                  color: '#00c2d4',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <ArrowRight size={10} />
                  <span>Cross-Dock Transfer (WH-04)</span>
                </div>
                <div style={{ padding: '6px 10px', color: '#f85149' }}>Cancel Allocation</div>
              </div>
            )}
          </div>
        </div>

        {/* Order Line Items Table */}
        <div style={{ flex: 1, background: '#161b22', border: '1px solid #30363d', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2.4fr 0.8fr 1.6fr 1.4fr', padding: '7px 12px', background: '#090d12', borderBottom: '1px solid #30363d', fontSize: '10px', fontWeight: 600, color: '#8b949e' }}>
            <span>SKU CODE</span>
            <span>DESCRIPTION</span>
            <span>QTY</span>
            <span>INVENTORY FACILITY</span>
            <span style={{ textAlign: 'right' }}>LINE STATUS</span>
          </div>

          {/* Row 1: Normal item */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2.4fr 0.8fr 1.6fr 1.4fr', padding: '7px 12px', borderBottom: '1px solid #21262d', alignItems: 'center' }}>
            <span style={{ fontFamily: 'monospace', color: '#79c0ff' }}>SKU-9920-A</span>
            <span>Thermal Label Printer 300dpi</span>
            <span style={{ fontWeight: 600 }}>4</span>
            <span style={{ color: '#8b949e' }}>WH-02 (Austin Hub)</span>
            <span style={{ textAlign: 'right', color: '#3fb950', fontWeight: 600 }}>✓ Allocated</span>
          </div>

          {/* Row 2: The Deficit Item (The Protagonist Problem) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 2.4fr 0.8fr 1.6fr 1.4fr',
            padding: '7px 12px',
            borderBottom: '1px solid #21262d',
            alignItems: 'center',
            background: isUncertain 
              ? 'rgba(232, 148, 42, 0.12)' 
              : isDeficitResolved 
              ? 'rgba(39, 201, 63, 0.08)' 
              : isRun1 
              ? 'rgba(56, 139, 253, 0.08)' 
              : 'transparent',
            transition: 'background 0.3s ease'
          }}>
            <span style={{ fontFamily: 'monospace', color: '#79c0ff' }}>SKU-3381-F</span>
            <span>Industrial 2D Barcode Scanner</span>
            <span style={{ fontWeight: 600 }}>12</span>
            <span>
              {isDeficitResolved ? (
                <span style={{ color: '#3fb950', fontWeight: 600 }}>WH-04 (Chicago Spillover)</span>
              ) : (
                <span style={{ color: isUncertain ? '#e8942a' : '#c9d1d9' }}>WH-02 (Deficit: -4 units)</span>
              )}
            </span>
            <span style={{ textAlign: 'right' }}>
              {isDeficitResolved ? (
                <span style={{ color: '#3fb950', fontWeight: 600 }}>✓ Cross-Docked</span>
              ) : isUncertain ? (
                <span style={{ color: '#e8942a', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  <AlertTriangle size={10} /> Deficit Flag
                </span>
              ) : (
                <span style={{ color: '#8b949e' }}>Stock Check</span>
              )}
            </span>
          </div>

          {/* Row 3: Normal item */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2.4fr 0.8fr 1.6fr 1.4fr', padding: '7px 12px', alignItems: 'center' }}>
            <span style={{ fontFamily: 'monospace', color: '#79c0ff' }}>SKU-1049-C</span>
            <span>Cat6 Patch Cable Shielded 10m</span>
            <span style={{ fontWeight: 600 }}>30</span>
            <span style={{ color: '#8b949e' }}>WH-02 (Austin Hub)</span>
            <span style={{ textAlign: 'right', color: '#3fb950', fontWeight: 600 }}>✓ Allocated</span>
          </div>
        </div>

        {/* Footer Summary / Telemetry */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '2px', fontSize: '10px', color: '#8b949e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Truck size={12} color="#00c2d4" />
            <span>Carrier: <strong>FedEx Freight Priority</strong></span>
            <span>• Waybill: <strong style={{ color: isDeficitResolved ? '#3fb950' : '#8b949e' }}>{isDeficitResolved ? '#FX-99201' : 'Pending Allocation'}</strong></span>
          </div>
          <div>
            Total Consignment: <strong>$5,890.00 USD</strong>
          </div>
        </div>
      </div>

      {/* ── Realistic Operating Software Cursor ── */}
      {cursor.visible && (
        <div style={{
          position: 'absolute',
          left: `${cursor.x}px`,
          top: `${cursor.y}px`,
          transform: `scale(${cursor.clicking ? 0.88 : 1.0})`,
          transition: 'transform 0.15s ease',
          pointerEvents: 'none',
          zIndex: 100,
          filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.6))'
        }}>
          {/* Authentic OS Pointer SVG */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 3L10.07 20.97L13.58 13.58L20.97 10.07L3 3Z"
              fill={isUncertain ? '#e8942a' : isDeficitResolved ? '#27c93f' : '#ffffff'}
              stroke="#14151a"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 2. RIGHT MONITOR: AUTOWORKER OPERATING OS, SOP KNOWLEDGE & ADAPTIVE WORKFLOW
  // ══════════════════════════════════════════════════════════════════════════
  const RightMonitorUI = (
    <div style={{
      width: '740px',
      height: '440px',
      background: '#090d12',
      color: '#e6edf3',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      fontSize: '12px',
      display: 'flex',
      flexDirection: 'column',
      userSelect: 'none',
      border: `1px solid ${isUncertain ? 'rgba(232, 148, 42, 0.6)' : isComplete ? 'rgba(39, 201, 63, 0.5)' : '#30363d'}`,
      borderRadius: '2px',
      overflow: 'hidden',
      boxShadow: '0 12px 36px rgba(0,0,0,0.85)'
    }}>
      {/* Autoworker System Header */}
      <div style={{
        height: '34px',
        background: '#161b22',
        borderBottom: '1px solid #30363d',
        padding: '0 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '16px',
            height: '16px',
            background: 'rgba(0, 194, 212, 0.15)',
            border: '1px solid #00c2d4',
            borderRadius: '3px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            color: '#00c2d4',
            fontSize: '9px'
          }}>A</div>
          <span style={{ fontWeight: 700, fontSize: '11px', letterSpacing: '0.02em', color: '#f0f6fc' }}>
            AUTOWORKER EXECUTION ENVIRONMENT
          </span>
          <span style={{ fontSize: '10px', color: '#8b949e' }}>• Worker: Ops-Reconciler-01</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: isUncertain ? '#e8942a' : isComplete ? '#27c93f' : '#00c2d4',
            boxShadow: `0 0 6px ${isUncertain ? '#e8942a' : isComplete ? '#27c93f' : '#00c2d4'}`
          }} />
          <span style={{ fontSize: '10px', fontWeight: 700, color: isUncertain ? '#e8942a' : isComplete ? '#27c93f' : '#00c2d4' }}>
            {isIdle ? 'IDLE' : isUncertain ? 'PAUSED (UNCERTAIN)' : isHumanGuidance ? 'INPUT RECEIVED' : isWorkflowTransform ? 'UPDATING WORKFLOW' : isComplete ? 'TASK COMPLETE' : 'ACTIVE'}
          </span>
        </div>
      </div>

      {/* Main Autoworker Content Area */}
      <div style={{ padding: '12px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        
        {/* Top Header Card: SOP Reference vs Live Task */}
        <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '4px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={13} color="#00c2d4" />
            <div>
              <div style={{ fontSize: '9px', color: '#8b949e', textTransform: 'uppercase' }}>Source SOP Instruction</div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#f0f6fc' }}>
                SOP-402: Logistics Exception Handling & Cross-Dock Balancing
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '10px', color: '#8b949e' }}>
            Version: <strong style={{ color: isWorkflowTransform || isRun2 || isComplete ? '#00c2d4' : '#c9d1d9' }}>
              {isWorkflowTransform || isRun2 || isComplete ? 'v2.0 (Learned)' : 'v1.0 (Initial)'}
            </strong>
          </div>
        </div>

        {/* Dynamic Center Area: SOP Highlight, Human Assistance Prompt, or Live Workflow Graph */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          
          {/* Phase 5 (50-60%): Teaching / Understanding Moment */}
          {isTeaching ? (
            <div style={{
              flex: 1,
              background: 'rgba(0, 194, 212, 0.05)',
              border: '1px solid rgba(0, 194, 212, 0.25)',
              borderRadius: '4px',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ fontSize: '10px', color: '#00c2d4', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Sparkles size={11} />
                <span>IDENTIFIED BUSINESS RULE (SOP Clause 4.2B)</span>
              </div>
              <div style={{ fontSize: '11px', lineHeight: 1.5, color: '#f0f6fc', background: '#090d12', padding: '8px 10px', borderRadius: '3px', borderLeft: '2px solid #00c2d4' }}>
                “When WH-02 regional inventory is insufficient, cross-dock the deficit balance from secondary facility WH-04 prior to generating final bill of lading.”
              </div>
              <div style={{ fontSize: '10px', color: '#8b949e' }}>
                ✓ Assembling execution steps from procedure...
              </div>
            </div>
          ) : isUncertain || isHumanGuidance ? (
            /* Phase 6 & 7 (60-78%): Uncertainty & Natural Human Operator Clarification */
            <div style={{
              flex: 1,
              background: 'rgba(232, 148, 42, 0.06)',
              border: '1px solid rgba(232, 148, 42, 0.35)',
              borderRadius: '4px',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#e8942a', fontWeight: 700, fontSize: '11px' }}>
                <AlertTriangle size={12} />
                <span>Uncertainty Encountered: Action Button Not in Default Location</span>
              </div>

              {/* Bot Query Message */}
              <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '4px', padding: '8px 10px', fontSize: '11px', color: '#c9d1d9' }}>
                <div style={{ fontSize: '9px', color: '#8b949e', marginBottom: '2px' }}>AUTOWORKER QUERY:</div>
                “I encountered a stock deficit on Order #48219. The direct 'Fulfill' button is not available on this interface state. How should I proceed?”
              </div>

              {/* Human Response Message */}
              {isHumanGuidance && (
                <div style={{ background: 'rgba(0, 194, 212, 0.12)', border: '1px solid rgba(0, 194, 212, 0.35)', borderRadius: '4px', padding: '8px 10px', fontSize: '11px', color: '#00c2d4' }}>
                  <div style={{ fontSize: '9px', color: '#00c2d4', fontWeight: 700, marginBottom: '2px' }}>HUMAN OPERATOR CORRECTION:</div>
                  “Open 'More Actions' menu dropdown, then select 'Cross-Dock Transfer'.”
                </div>
              )}
            </div>
          ) : (
            /* Phases 8, 9, 10: The Workflow Graph (Visualizing v1 -> v2 Transformation) */
            <div style={{
              flex: 1,
              background: '#161b22',
              border: '1px solid #30363d',
              borderRadius: '4px',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                <span style={{ fontSize: '9px', color: '#8b949e', textTransform: 'uppercase' }}>Operating Workflow Graph</span>
                <span style={{ fontSize: '9px', color: isWorkflowTransform || isRun2 || isComplete ? '#00c2d4' : '#8b949e', fontWeight: 600 }}>
                  {isWorkflowTransform ? 'TRANSFORMING v1 → v2' : isRun2 || isComplete ? 'WORKFLOW v2 (ACTIVE)' : 'WORKFLOW v1'}
                </span>
              </div>

              {/* Visual Node Sequence */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {/* Node 1: Ingest */}
                <div style={{ padding: '4px 8px', background: '#0d1117', border: '1px solid #30363d', borderRadius: '3px', fontSize: '10px', color: '#c9d1d9', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Check size={10} color="#3fb950" />
                  <span>1. Ingest Order #48219</span>
                </div>

                <ArrowRight size={10} color="#8b949e" />

                {/* Node 2: Inspect */}
                <div style={{ padding: '4px 8px', background: '#0d1117', border: '1px solid #30363d', borderRadius: '3px', fontSize: '10px', color: '#c9d1d9', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Check size={10} color="#3fb950" />
                  <span>2. Check Deficit (-4)</span>
                </div>

                <ArrowRight size={10} color="#8b949e" />

                {/* Node 3: The Learned Modification */}
                {isWorkflowTransform || isRun2 || isComplete ? (
                  <>
                    <div style={{
                      padding: '4px 8px',
                      background: 'rgba(0, 194, 212, 0.15)',
                      border: '1px solid #00c2d4',
                      borderRadius: '3px',
                      fontSize: '10px',
                      color: '#00c2d4',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <Sparkles size={10} />
                      <span>3. More Actions Dropdown (Learned)</span>
                    </div>

                    <ArrowRight size={10} color="#00c2d4" />

                    <div style={{ padding: '4px 8px', background: '#0d1117', border: '1px solid #30363d', borderRadius: '3px', fontSize: '10px', color: '#c9d1d9', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Check size={10} color={isComplete ? '#3fb950' : '#8b949e'} />
                      <span>4. Cross-Dock WH-04</span>
                    </div>
                  </>
                ) : (
                  <div style={{ padding: '4px 8px', background: '#0d1117', border: '1px solid #30363d', borderRadius: '3px', fontSize: '10px', color: '#8b949e' }}>
                    <span>3. Direct Action</span>
                  </div>
                )}
              </div>

              {/* Execution Status Feedback */}
              <div style={{ marginTop: 'auto', paddingTop: '6px', borderTop: '1px solid #21262d', fontSize: '10px', color: '#8b949e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Execution Speed: <strong style={{ color: '#f0f6fc' }}>0.28s</strong></span>
                <span>Interventions: <strong style={{ color: isDeficitResolved ? '#3fb950' : '#8b949e' }}>{isDeficitResolved ? '0 (Autonomous)' : '1 (Taught)'}</strong></span>
              </div>
            </div>
          )}
        </div>

        {/* Permanent Knowledge Base Committal Bar */}
        <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '4px', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#8b949e' }}>
            <Database size={12} color="#00c2d4" />
            <span>Permanent Model Memory:</span>
            <strong style={{ color: isDeficitResolved || isComplete ? '#3fb950' : '#f0f6fc' }}>
              {isDeficitResolved || isComplete ? 'Policy 4B Committed to Memory' : 'Ops SOP v4.2'}
            </strong>
          </div>
          <div style={{ color: isComplete ? '#3fb950' : '#00c2d4', fontWeight: 700 }}>
            {isComplete ? '✓ IT REMEMBERED' : 'Sync: Active'}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <group position={[0, 0.75, 0]}>
      {/* ── LEFT 27" MONITOR (Positioned right above desk at y = 0.75 + 0.32 = 1.07m) ── */}
      <group position={[-0.34, 0.32, -0.16]} rotation={[0, 0.12, 0]}>
        {/* Monitor Housing */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.62, 0.38, 0.015]} />
          <meshStandardMaterial color="#14151a" roughness={0.4} metalness={0.85} />
        </mesh>
        {/* Anti-Glare Display Glass */}
        <mesh position={[0, 0, 0.009]}>
          <planeGeometry args={[0.60, 0.36]} />
          <meshStandardMaterial color="#0d1117" roughness={0.2} metalness={0.1} />
        </mesh>

        {/* Stable HTML in 3D */}
        <Html
          transform
          distanceFactor={0.52}
          position={[0, 0, 0.011]}
          style={{ pointerEvents: 'none' }}
        >
          {LeftMonitorUI}
        </Html>
      </group>

      {/* ── RIGHT 27" MONITOR ── */}
      <group position={[0.34, 0.32, -0.16]} rotation={[0, -0.12, 0]}>
        {/* Monitor Housing */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.62, 0.38, 0.015]} />
          <meshStandardMaterial color="#14151a" roughness={0.4} metalness={0.85} />
        </mesh>
        {/* Anti-Glare Display Glass */}
        <mesh position={[0, 0, 0.009]}>
          <planeGeometry args={[0.60, 0.36]} />
          <meshStandardMaterial color="#0d1117" roughness={0.2} metalness={0.1} />
        </mesh>

        {/* Stable HTML in 3D */}
        <Html
          transform
          distanceFactor={0.52}
          position={[0, 0, 0.011]}
          style={{ pointerEvents: 'none' }}
        >
          {RightMonitorUI}
        </Html>
      </group>
    </group>
  );
}
