import React, { useState, useMemo } from 'react';
import * as THREE from 'three';
import { DeskLamp, CoffeeMug, NotebookAndPen, PaperStack } from '../landing/models/OfficeProps.js';

export interface WorkstationPrefabProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  department: string;
  worker?: any;
  isSelected?: boolean;
  onSelect?: () => void;
  onEnter?: () => void;
  onRun?: (e: React.MouseEvent) => void;
  isRunning?: boolean;
}

/**
 * Generate high-density procedural canvas texture for the operational monitor screens
 */
function createMonitorTexture(
  workerName: string,
  department: string,
  status: string,
  isRightScreen: boolean
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Base Screen Background
  ctx.fillStyle = '#06080d';
  ctx.fillRect(0, 0, 512, 320);

  const isWorking = status === 'WORKING' || status === 'ACTIVE' || status === 'RUNNING';
  const isAttention =
    status === 'WAITING_FOR_HUMAN' || status === 'NEEDS_CLARIFICATION' || status === 'EXCEPTION';
  const isCompleted = status === 'SUCCESS' || status === 'COMPLETED';

  const statusColor = isAttention
    ? '#e8942a'
    : isWorking
    ? '#00c2d4'
    : isCompleted
    ? '#1db87a'
    : '#686b78';

  // 1. Top OS Chrome Header
  ctx.fillStyle = '#0c0f17';
  ctx.fillRect(0, 0, 512, 34);

  // Status Indicator Dot
  ctx.fillStyle = statusColor;
  ctx.beginPath();
  ctx.arc(20, 17, 4.5, 0, Math.PI * 2);
  ctx.fill();

  // Header Title
  ctx.font = '600 12px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#f4f2ee';
  const headerText = isRightScreen
    ? `AUTOWORKER // SOP PROCEDURAL GRAPH v${workerName ? '1.4' : '0.1'}`
    : `${department.toUpperCase()} BAY // ${workerName.toUpperCase() || 'STANDBY WORKSTATION'}`;
  ctx.fillText(headerText, 32, 21);

  // State Tag
  ctx.font = '700 10px JetBrains Mono, monospace';
  ctx.fillStyle = statusColor;
  const stateLabel = isAttention
    ? '● ATTENTION REQ'
    : isWorking
    ? '● EXECUTING 60FPS'
    : isCompleted
    ? '● VERIFIED'
    : '● STANDBY';
  ctx.fillText(stateLabel, 400, 21);

  // 2. Main Screen Surface
  if (!isRightScreen) {
    // ── Left Screen: Target Enterprise ERP / Operations DOM ──
    ctx.fillStyle = '#090c13';
    ctx.fillRect(16, 48, 480, 252);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeRect(16, 48, 480, 252);

    // Table Header
    ctx.fillStyle = '#111522';
    ctx.fillRect(16, 48, 480, 28);
    ctx.font = '600 10px JetBrains Mono, monospace';
    ctx.fillStyle = '#8e92a4';
    ctx.fillText('BATCH ID', 28, 66);
    ctx.fillText('TARGET SYSTEM', 120, 66);
    ctx.fillText('STATUS', 280, 66);
    ctx.fillText('POLICY CHECK', 390, 66);

    // Operational Rows
    const rows = [
      { id: '#48219-A', sys: 'Apex Logistics ERP', st: isWorking ? 'SYNCHRONIZING' : 'VERIFIED', pol: 'PASS (100%)' },
      { id: '#48220-B', sys: 'NetSuite GL 3-Way', st: isAttention ? 'HOLD: MISMATCH' : 'COMMITTED', pol: isAttention ? 'FLAGGED' : 'PASS' },
      { id: '#48221-C', sys: 'Apex Logistics Bay', st: 'QUEUED', pol: 'VERIFIED' },
      { id: '#48222-D', sys: 'Stripe Ledger AP', st: 'MONITORED', pol: 'VERIFIED' },
      { id: '#48223-E', sys: 'Global Manifest SKU', st: 'IDLE', pol: 'PASS' },
    ];

    rows.forEach((r, idx) => {
      const y = 96 + idx * 36;
      ctx.fillStyle = idx % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'transparent';
      ctx.fillRect(16, y - 16, 480, 32);

      ctx.font = '500 10px JetBrains Mono, monospace';
      ctx.fillStyle = '#00c2d4';
      ctx.fillText(r.id, 28, y);

      ctx.fillStyle = '#d1d5db';
      ctx.fillText(r.sys, 120, y);

      ctx.fillStyle = r.st.includes('HOLD') ? '#e8942a' : r.st.includes('SYNC') ? '#00c2d4' : '#9ca3af';
      ctx.fillText(r.st, 280, y);

      ctx.fillStyle = r.pol.includes('FLAG') ? '#ef4444' : '#1db87a';
      ctx.fillText(r.pol, 390, y);
    });
  } else {
    // ── Right Screen: Procedural Graph & SOP Rules ──
    ctx.fillStyle = '#090c13';
    ctx.fillRect(16, 48, 480, 252);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeRect(16, 48, 480, 252);

    ctx.font = '600 11px Inter, sans-serif';
    ctx.fillStyle = '#f4f2ee';
    ctx.fillText('ACTIVE COMPILED WORKFLOW GRAPH', 30, 72);

    // Procedural steps
    const steps = [
      '1. Authenticate to ERP via enterprise session gateway',
      '2. Query open cross-dock batch manifests',
      '3. Cross-reference SKU stock count against Austin WH-02',
      isAttention ? '4. [!] Ambiguous selector: awaiting supervisor instruction' : '4. Commit inventory rebalance transaction',
      '5. Log verified audit trail to permanent memory',
    ];

    steps.forEach((step, idx) => {
      const y = 104 + idx * 30;
      ctx.fillStyle = step.includes('[!]')
        ? 'rgba(232, 148, 42, 0.15)'
        : idx < 3
        ? 'rgba(29, 184, 122, 0.1)'
        : 'rgba(255, 255, 255, 0.03)';
      ctx.fillRect(26, y - 14, 460, 24);

      ctx.font = '500 10px JetBrains Mono, monospace';
      ctx.fillStyle = step.includes('[!]')
        ? '#e8942a'
        : idx < 3
        ? '#1db87a'
        : '#9ca3af';
      ctx.fillText(step, 36, y + 2);
    });
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  return texture;
}

export function WorkstationPrefab({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  department,
  worker,
  isSelected = false,
  onSelect,
  onEnter,
  onRun,
  isRunning = false,
}: WorkstationPrefabProps) {
  const [hovered, setHovered] = useState(false);

  const status = worker?.status || 'IDLE';
  const isNeedsHelp =
    status === 'WAITING_FOR_HUMAN' ||
    status === 'NEEDS_CLARIFICATION' ||
    status === 'EXCEPTION';
  const isWorking = status === 'ACTIVE' || status === 'RUNNING' || isRunning;
  const isSuccess = status === 'SUCCESS' || status === 'COMPLETED';

  // Semantic state color
  const statusColor = isNeedsHelp
    ? '#e8942a'
    : isWorking
    ? '#00c2d4'
    : isSuccess
    ? '#1db87a'
    : worker
    ? '#00c2d4'
    : '#686b78';

  const lightIntensity = isNeedsHelp
    ? 1.2
    : isWorking
    ? 1.0
    : isSelected || hovered
    ? 0.8
    : 0.35;

  // Procedural Screen Textures (Zero 3D HTML cards)
  const leftScreenTexture = useMemo(
    () => createMonitorTexture(worker?.name || '', department, status, false),
    [worker?.name, department, status]
  );

  const rightScreenTexture = useMemo(
    () => createMonitorTexture(worker?.name || '', department, status, true),
    [worker?.name, department, status]
  );

  return (
    <group
      position={position}
      rotation={rotation}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = 'default';
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
    >
      {/* ══════════════════════════════════════════════════════════════════
          1. PHYSICAL DESK STRUCTURE (Rich American Walnut top at y = 0.74m)
          ══════════════════════════════════════════════════════════════════ */}
      {/* Solid American Walnut Desktop Surface with Chamfered Edge */}
      <mesh position={[0, 0.735, 0]} receiveShadow castShadow>
        <boxGeometry args={[2.0, 0.038, 0.88]} />
        <meshStandardMaterial
          color={hovered || isSelected ? '#8d5d3b' : '#72492d'}
          roughness={0.42}
          metalness={0.05}
        />
      </mesh>

      {/* Champagne Bronze Under-Bevel Reveal */}
      <mesh position={[0, 0.712, 0]} receiveShadow>
        <boxGeometry args={[1.96, 0.012, 0.84]} />
        <meshStandardMaterial color="#685441" roughness={0.35} metalness={0.85} />
      </mesh>

      {/* Brushed Titanium Architectural Leg Frames (y = 0 to 0.70m) */}
      <group position={[0, 0.35, 0]}>
        {/* Left Leg Frame */}
        <mesh position={[-0.88, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.045, 0.70, 0.74]} />
          <meshStandardMaterial color="#9aa0b0" roughness={0.28} metalness={0.85} />
        </mesh>
        {/* Right Leg Frame */}
        <mesh position={[0.88, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.045, 0.70, 0.74]} />
          <meshStandardMaterial color="#9aa0b0" roughness={0.28} metalness={0.85} />
        </mesh>
      </group>

      {/* Horizontal Stretcher / Structural Cable Raceway */}
      <mesh position={[0, 0.64, -0.26]} castShadow>
        <boxGeometry args={[1.72, 0.04, 0.06]} />
        <meshStandardMaterial color="#383c48" roughness={0.4} metalness={0.7} />
      </mesh>

      {/* ══════════════════════════════════════════════════════════════════
          2. HERMAN MILLER STYLE ERGONOMIC EXECUTIVE CHAIR ([0, 0, 0.55m])
          ══════════════════════════════════════════════════════════════════ */}
      <group position={[0, 0, 0.55]}>
        {/* 5-Star Polished Chrome Base (y = 0 to 0.12m) */}
        <group position={[0, 0.05, 0]}>
          {[0, 1, 2, 3, 4].map((i) => {
            const rad = (i * Math.PI * 2) / 5;
            return (
              <group key={`chair-arm-${i}`} rotation={[0, rad, 0]}>
                <mesh position={[0.16, 0, 0]} rotation={[0, 0, -0.06]} castShadow>
                  <boxGeometry args={[0.30, 0.02, 0.03]} />
                  <meshStandardMaterial color="#d4d8e0" roughness={0.18} metalness={0.95} />
                </mesh>
                {/* Caster Wheel */}
                <mesh position={[0.30, -0.02, 0]} castShadow>
                  <cylinderGeometry args={[0.025, 0.025, 0.02, 10]} />
                  <meshStandardMaterial color="#1a1c22" roughness={0.6} />
                </mesh>
              </group>
            );
          })}
        </group>

        {/* Polished Chrome Gas Lift Cylinder */}
        <mesh position={[0, 0.24, 0]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, 0.36, 16]} />
          <meshStandardMaterial color="#e0e4ec" roughness={0.12} metalness={0.98} />
        </mesh>

        {/* Ergonomic Contoured Seat Cushion */}
        <mesh position={[0, 0.44, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.48, 0.06, 0.46]} />
          <meshStandardMaterial color="#353944" roughness={0.85} />
        </mesh>

        {/* Breathable Mesh Ergonomic Backrest with Lumbar Curve */}
        <mesh position={[0, 0.72, 0.21]} rotation={[-0.08, 0, 0]} castShadow>
          <boxGeometry args={[0.44, 0.50, 0.025]} />
          <meshStandardMaterial color="#2d313c" roughness={0.9} />
        </mesh>
        {/* Structural Spine Support */}
        <mesh position={[0, 0.70, 0.23]} rotation={[-0.08, 0, 0]} castShadow>
          <boxGeometry args={[0.05, 0.46, 0.02]} />
          <meshStandardMaterial color="#9da3b2" roughness={0.25} metalness={0.88} />
        </mesh>

        {/* Polished Chrome Armrest Supports with Soft Pads */}
        {[-0.26, 0.26].map((x, i) => (
          <group key={`armrest-${i}`} position={[x, 0.58, 0.02]}>
            <mesh position={[0, -0.06, 0]} castShadow>
              <boxGeometry args={[0.025, 0.18, 0.04]} />
              <meshStandardMaterial color="#d4d8e0" roughness={0.2} metalness={0.92} />
            </mesh>
            <mesh position={[0, 0.04, 0]} castShadow>
              <boxGeometry args={[0.06, 0.025, 0.22]} />
              <meshStandardMaterial color="#22252e" roughness={0.7} />
            </mesh>
          </group>
        ))}
      </group>

      {/* ══════════════════════════════════════════════════════════════════
          3. DUAL 27" HIGH-DPI MONITORS WITH ARTICULATED ALUMINUM MOUNT
          ══════════════════════════════════════════════════════════════════ */}
      <group position={[0, 0.74, -0.28]}>
        {/* Desk Heavy Anodized Aluminum Clamp */}
        <mesh position={[0, 0.02, 0]} castShadow>
          <boxGeometry args={[0.11, 0.04, 0.09]} />
          <meshStandardMaterial color="#8b92a0" roughness={0.3} metalness={0.88} />
        </mesh>
        {/* Upright Column */}
        <mesh position={[0, 0.20, 0]} castShadow>
          <cylinderGeometry args={[0.018, 0.018, 0.38, 16]} />
          <meshStandardMaterial color="#8b92a0" roughness={0.3} metalness={0.88} />
        </mesh>
      </group>

      {/* Left Screen: Native Operational ERP & Execution DOM */}
      <group position={[-0.34, 1.06, -0.16]} rotation={[0, 0.12, 0]}>
        {/* Slim Titanium Bezel */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.62, 0.38, 0.014]} />
          <meshStandardMaterial color="#1f232c" roughness={0.3} metalness={0.85} />
        </mesh>
        {/* High-Resolution Operational Display Surface */}
        <mesh position={[0, 0, 0.008]}>
          <planeGeometry args={[0.60, 0.36]} />
          <meshStandardMaterial
            map={leftScreenTexture}
            roughness={0.15}
            metalness={0.1}
            emissive="#ffffff"
            emissiveMap={leftScreenTexture}
            emissiveIntensity={0.45}
            toneMapped={false}
          />
        </mesh>
      </group>

      {/* Right Screen: Procedural Graph & SOP Rules Stream */}
      <group position={[0.34, 1.06, -0.16]} rotation={[0, -0.12, 0]}>
        {/* Slim Titanium Bezel */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.62, 0.38, 0.014]} />
          <meshStandardMaterial color="#1f232c" roughness={0.3} metalness={0.85} />
        </mesh>
        {/* High-Resolution Operational Display Surface */}
        <mesh position={[0, 0, 0.008]}>
          <planeGeometry args={[0.60, 0.36]} />
          <meshStandardMaterial
            map={rightScreenTexture}
            roughness={0.15}
            metalness={0.1}
            emissive="#ffffff"
            emissiveMap={rightScreenTexture}
            emissiveIntensity={0.45}
            toneMapped={false}
          />
        </mesh>
      </group>

      {/* ══════════════════════════════════════════════════════════════════
          4. DESK PERIPHERALS & ARCHITECTURAL PROPS (Strictly Parented)
          ══════════════════════════════════════════════════════════════════ */}
      {/* Saddle Leather Desk Mat */}
      <mesh position={[0, 0.741, 0.08]} receiveShadow>
        <boxGeometry args={[0.82, 0.003, 0.38]} />
        <meshStandardMaterial color="#21242e" roughness={0.85} />
      </mesh>

      {/* Silver Anodized Low-Profile Keyboard */}
      <mesh position={[-0.06, 0.746, 0.10]} castShadow receiveShadow>
        <boxGeometry args={[0.38, 0.008, 0.12]} />
        <meshStandardMaterial color="#c8ccd4" metalness={0.85} roughness={0.22} />
      </mesh>

      {/* Precision Wireless Mouse */}
      <mesh position={[0.26, 0.746, 0.10]} castShadow receiveShadow>
        <boxGeometry args={[0.065, 0.014, 0.10]} />
        <meshStandardMaterial color="#d4d8e0" metalness={0.8} roughness={0.25} />
      </mesh>

      {/* Architectural Task Lamp */}
      <DeskLamp position={[-0.82, 0.74, -0.20]} rotation={[0, 0.35, 0]} />

      {/* Notebook & Pen */}
      <NotebookAndPen position={[0.72, 0.74, 0.15]} rotation={[0, -0.15, 0]} />

      {/* Ceramic Coffee Mug */}
      <CoffeeMug position={[-0.65, 0.74, 0.16]} />

      {/* Department-Specific Prop */}
      {department === 'Finance' && <PaperStack position={[0.75, 0.74, -0.15]} count={3} />}

      {/* Embossed Desk Nameplate */}
      <group position={[-0.78, 0.741, 0.28]} rotation={[0, 0.05, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.26, 0.015, 0.055]} />
          <meshStandardMaterial color="#181a22" roughness={0.4} metalness={0.8} />
        </mesh>
        <mesh position={[0, 0.009, 0]}>
          <planeGeometry args={[0.24, 0.04]} />
          <meshStandardMaterial color={statusColor} roughness={0.2} />
        </mesh>
      </group>

      {/* ══════════════════════════════════════════════════════════════════
          5. CALIBRATED TASK LIGHT & STATE BEACON
          ══════════════════════════════════════════════════════════════════ */}
      {/* Subtle Environmental Task Light */}
      <pointLight
        position={[0, 1.15, 0.05]}
        intensity={lightIntensity}
        color={statusColor}
        distance={2.4}
        decay={2}
      />

      {/* Under-Desk PDU Power/Status Indicator */}
      <mesh position={[0.65, 0.65, -0.26]}>
        <boxGeometry args={[0.04, 0.02, 0.02]} />
        <meshStandardMaterial emissive={statusColor} emissiveIntensity={0.8} color={statusColor} />
      </mesh>

      {/* Workstation Focus Ground Ring when Selected */}
      {isSelected && (
        <mesh position={[0, 0.003, 0.15]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.35, 1.38, 32]} />
          <meshBasicMaterial color="#00c2d4" transparent opacity={0.65} />
        </mesh>
      )}
    </group>
  );
}
