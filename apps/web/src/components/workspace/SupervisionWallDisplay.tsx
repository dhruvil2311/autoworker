import React, { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';

interface SupervisionWallDisplayProps {
  workers: any[];
  runs: any[];
  onSelectWorker?: (id: string) => void;
}

/**
 * Creates the Front Operations Supervision Canvas Texture (Faces North / Central Floor)
 */
function createSupervisionCanvas(workers: any[], runs: any[]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Obsidian Surface
  ctx.fillStyle = '#080a10';
  ctx.fillRect(0, 0, 1024, 512);

  // Precision Hairline Grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let x = 32; x < 1024; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }

  // Header Bar
  ctx.fillStyle = '#0f121a';
  ctx.fillRect(8, 8, 1008, 56);

  // Live Pulse Beacon (Emerald Operational)
  ctx.fillStyle = '#10b981';
  ctx.beginPath();
  ctx.arc(36, 36, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = '700 16px Inter, sans-serif';
  ctx.fillStyle = '#f4f2ee';
  ctx.fillText('AUTOWORKER // FACILITY SUPERVISION MATRIX', 56, 42);

  ctx.font = '600 12px JetBrains Mono, monospace';
  ctx.fillStyle = '#10b981';
  ctx.fillText('FACILITY STATUS: OPERATIONAL · 60 FPS · 18MS', 660, 42);

  // Operational Department Rows
  const departments = [
    { name: 'OPERATIONS BAY', wing: 'West Wing', desks: '2 Workstations Active', st: 'RUNNING', color: '#60a5fa' },
    { name: 'FINANCE & LEDGER', wing: 'East Wing', desks: '2 Workstations Active', st: 'RECONCILING', color: '#10b981' },
    { name: 'INVENTORY & SKU', wing: 'South-West', desks: '1 Workstation Active', st: 'SYNCHRONIZING', color: '#f59e0b' },
    { name: 'CUSTOMER OPERATIONS', wing: 'South-East', desks: '1 Workstation Active', st: 'DISPATCHING', color: '#a78bfa' },
    { name: 'EXECUTIVE COMMAND', wing: 'North Central', desks: '1 Workstation Active', st: 'SUPERVISING', color: '#3b82f6' },
  ];

  departments.forEach((dept, i) => {
    const y = 90 + i * 58;

    ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.01)';
    ctx.fillRect(16, y - 8, 992, 50);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.strokeRect(16, y - 8, 992, 50);

    // Accent strip
    ctx.fillStyle = dept.color;
    ctx.fillRect(16, y - 8, 4, 50);

    // Department Name
    ctx.font = '700 14px Inter, sans-serif';
    ctx.fillStyle = '#f4f2ee';
    ctx.fillText(dept.name, 36, y + 22);

    ctx.font = '500 12px JetBrains Mono, monospace';
    ctx.fillStyle = '#8e94a0';
    ctx.fillText(`(${dept.wing})`, 270, y + 22);

    // Desks Count
    ctx.font = '600 13px JetBrains Mono, monospace';
    ctx.fillStyle = '#d1d5db';
    ctx.fillText(dept.desks, 450, y + 22);

    // State Indicator
    ctx.fillStyle = dept.color;
    ctx.beginPath();
    ctx.arc(760, y + 17, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '700 12px JetBrains Mono, monospace';
    ctx.fillText(dept.st, 775, y + 22);
  });

  // Telemetry Footer Strip
  ctx.fillStyle = '#0c0f16';
  ctx.fillRect(8, 440, 1008, 64);

  ctx.font = '500 12px JetBrains Mono, monospace';
  ctx.fillStyle = '#a3a8b8';
  const totalW = workers.length || 7;
  const activeR = runs.filter((r: any) => r.state === 'RUNNING' || r.state === 'ACTIVE').length;
  ctx.fillText(
    `WORKFORCE ROSTER: ${totalW} PROVISIONED · ${activeR || 4} EXECUTING · 100% AUDIT TRAIL VERIFIED`,
    32,
    478
  );

  return canvas;
}

/**
 * Creates the Rear Reception Welcome Canvas Texture (Faces South / Reception Entrance)
 */
function createReceptionCanvas(workers: any[]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Premium Dark Obsidian Texture
  ctx.fillStyle = '#090b11';
  ctx.fillRect(0, 0, 1024, 512);

  // Subtle Linear Grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  for (let y = 0; y < 512; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y);
    ctx.stroke();
  }

  // Header Banner
  ctx.fillStyle = '#111520';
  ctx.fillRect(12, 12, 1000, 64);

  // Institutional Monogram
  ctx.strokeStyle = '#60a5fa';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(32, 24, 40, 40);
  ctx.font = '700 18px Inter, sans-serif';
  ctx.fillStyle = '#f4f2ee';
  ctx.fillText('AW', 40, 50);

  ctx.font = '700 18px Inter, sans-serif';
  ctx.fillStyle = '#f4f2ee';
  ctx.fillText('AUTOWORKER // OPERATIONS HEADQUARTERS', 90, 44);

  ctx.font = '500 12px JetBrains Mono, monospace';
  ctx.fillStyle = '#8e92a4';
  ctx.fillText('FACILITY ENTRANCE & RECEPTION DIRECTORY · LEVEL 42', 90, 62);

  // Status Badge
  ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(810, 24, 180, 40);
  ctx.fillRect(810, 24, 180, 40);

  ctx.fillStyle = '#10b981';
  ctx.beginPath();
  ctx.arc(830, 44, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '700 12px JetBrains Mono, monospace';
  ctx.fillText('FACILITY ACTIVE', 845, 48);

  // Welcome Content Cards
  const cards = [
    { title: 'AUTONOMOUS OPERATIONS', desc: 'Active digital employees running order reconciliation, general ledger audit & SKU telemetry.' },
    { title: 'SUPERVISION DIRECTORY', desc: `${workers.length || 7} provisioned workstations across Operations, Finance, Inventory & Customer bays.` },
    { title: 'SECURITY PROTOCOL', desc: 'End-to-end encrypted action dispatch, human-in-the-loop fallback & continuous verification.' },
  ];

  cards.forEach((card, idx) => {
    const y = 100 + idx * 105;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
    ctx.fillRect(24, y, 976, 92);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.strokeRect(24, y, 976, 92);

    ctx.fillStyle = '#60a5fa';
    ctx.fillRect(24, y, 5, 92);

    ctx.font = '700 15px Inter, sans-serif';
    ctx.fillStyle = '#f4f2ee';
    ctx.fillText(card.title, 48, y + 36);

    ctx.font = '400 13px Inter, sans-serif';
    ctx.fillStyle = '#a3a8b8';
    ctx.fillText(card.desc, 48, y + 64);
  });

  // Footer
  ctx.fillStyle = '#0c0f16';
  ctx.fillRect(12, 440, 1000, 60);
  ctx.font = '500 12px JetBrains Mono, monospace';
  ctx.fillStyle = '#686b78';
  ctx.fillText('AUTOWORKER ENTERPRISE OS · SYSTEM CLOCK: 2026-09-05 · OPERATIONAL CLUSTER', 32, 476);

  return canvas;
}

export function SupervisionWallDisplay({ workers, runs }: SupervisionWallDisplayProps) {
  const frontCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rearCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const frontTexture = useMemo(() => {
    const canvas = createSupervisionCanvas(workers, runs);
    frontCanvasRef.current = canvas;
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }, [workers, runs]);

  const rearTexture = useMemo(() => {
    const canvas = createReceptionCanvas(workers);
    rearCanvasRef.current = canvas;
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }, [workers]);

  useEffect(() => {
    if (frontTexture) frontTexture.needsUpdate = true;
    if (rearTexture) rearTexture.needsUpdate = true;
  }, [frontTexture, rearTexture]);

  return (
    <group position={[0, 2.4, 14.2]}>
      {/* ── Architectural Media Bezel Housing (Both Sides Screen Array) ── */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[4.8, 2.4, 0.12]} />
        <meshStandardMaterial color="#0f1118" roughness={0.3} metalness={0.8} />
      </mesh>

      {/* Titanium Frame Border */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[4.84, 2.44, 0.1]} />
        <meshStandardMaterial color="#222838" roughness={0.2} metalness={0.9} />
      </mesh>

      {/* ── 1. North Face Display (Facing Central Operations Floor: -Z) ── */}
      <mesh position={[0, 0, -0.065]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[4.64, 2.24]} />
        <meshStandardMaterial
          map={frontTexture}
          roughness={0.1}
          metalness={0.1}
          emissive="#ffffff"
          emissiveMap={frontTexture}
          emissiveIntensity={0.45}
          toneMapped={false}
        />
      </mesh>

      {/* ── 2. South Face Display (Facing Reception / Entrance: +Z) ── */}
      {/* This guarantees visitors at Reception (z = 9.6) see a stunning lit screen, NOT A BLACK BOX! */}
      <mesh position={[0, 0, 0.065]}>
        <planeGeometry args={[4.64, 2.24]} />
        <meshStandardMaterial
          map={rearTexture}
          roughness={0.1}
          metalness={0.1}
          emissive="#ffffff"
          emissiveMap={rearTexture}
          emissiveIntensity={0.45}
          toneMapped={false}
        />
      </mesh>

      {/* Downlight Ambient Glow */}
      <pointLight position={[0, 1.4, 0]} intensity={0.8} distance={4} color="#e2effa" />
    </group>
  );
}
