// @ts-nocheck
/**
 * WorkProcessEngine — The Autoworker signature 3D object.
 *
 * Design intent: A precision-engineered workflow routing device.
 * NOT a sphere, orb, reactor, robot, or sci-fi construct.
 *
 * Physical metaphor:
 *   A matte dark instrument housing — like the interior of a precision
 *   industrial controller — with an etched grid chassis, connection arms
 *   extending to corner nodes, a central elevated processing plane,
 *   and fine illuminated trace lines that activate with work state.
 *
 * It should look like something that could be manufactured.
 */
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WorkCoreState } from './WorkCore3D.js';

// ── State configuration — restrained, purposeful ──────────────────────────────
const STATE: Record<WorkCoreState, {
  traceColor: string;
  traceOpacity: number;
  centerGlow: string;
  centerIntensity: number;
  rotationSpeed: number;
  chassisLit: boolean;
}> = {
  DORMANT: {
    traceColor: '#1e2030', traceOpacity: 0.0,
    centerGlow: '#1a1a22', centerIntensity: 0,
    rotationSpeed: 0.04, chassisLit: false,
  },
  EVIDENCE: {
    traceColor: '#2a3855', traceOpacity: 0.35,
    centerGlow: '#253050', centerIntensity: 0.4,
    rotationSpeed: 0.06, chassisLit: false,
  },
  UNDERSTANDING: {
    traceColor: '#5040a0', traceOpacity: 0.55,
    centerGlow: '#3a2880', centerIntensity: 0.8,
    rotationSpeed: 0.10, chassisLit: true,
  },
  WORKING: {
    traceColor: '#00b8cc', traceOpacity: 0.75,
    centerGlow: '#007a90', centerIntensity: 1.2,
    rotationSpeed: 0.08, chassisLit: true,
  },
  NEEDS_HELP: {
    traceColor: '#c07020', traceOpacity: 0.60,
    centerGlow: '#904a10', centerIntensity: 1.0,
    rotationSpeed: 0.02, chassisLit: true,
  },
  CORRECTION: {
    traceColor: '#d08030', traceOpacity: 0.70,
    centerGlow: '#a06020', centerIntensity: 1.4,
    rotationSpeed: 0.12, chassisLit: true,
  },
  SUCCESS: {
    traceColor: '#1a9060', traceOpacity: 0.65,
    centerGlow: '#106040', centerIntensity: 1.1,
    rotationSpeed: 0.06, chassisLit: true,
  },
  FAILED: {
    traceColor: '#881818', traceOpacity: 0.40,
    centerGlow: '#600000', centerIntensity: 0.6,
    rotationSpeed: 0.00, chassisLit: false,
  },
};

// ── Chassis: the main body of the device ─────────────────────────────────────
function Chassis() {
  const edgesRef = useRef<THREE.LineSegments>(null);

  const geometry = useMemo(() => new THREE.BoxGeometry(2.4, 1.4, 0.32), []);
  const edgeGeo = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);

  return (
    <group>
      {/* Solid matte body */}
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color="#0d0d14"
          metalness={0.6}
          roughness={0.7}
        />
      </mesh>
      {/* Precise edge lines */}
      <lineSegments ref={edgesRef} geometry={edgeGeo}>
        <lineBasicMaterial color="#2a2a38" transparent opacity={0.6} />
      </lineSegments>
    </group>
  );
}

// ── GridSurface: etched grid lines on the chassis face ────────────────────────
function GridSurface() {
  const linesRef = useRef<THREE.Group>(null);

  const hLines = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions: number[] = [];
    for (let y = -0.5; y <= 0.5; y += 0.1) {
      positions.push(-1.1, y, 0.17, 1.1, y, 0.17);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, []);

  const vLines = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions: number[] = [];
    for (let x = -1.0; x <= 1.0; x += 0.2) {
      positions.push(x, -0.65, 0.17, x, 0.65, 0.17);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, []);

  return (
    <group ref={linesRef}>
      <lineSegments geometry={hLines}>
        <lineBasicMaterial color="#1e2030" transparent opacity={0.5} />
      </lineSegments>
      <lineSegments geometry={vLines}>
        <lineBasicMaterial color="#1e2030" transparent opacity={0.5} />
      </lineSegments>
    </group>
  );
}

// ── ConnectionArm: a thin rod from chassis corner to a joint node ─────────────
function ConnectionArm({ from, to, color, opacity }: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  opacity: number;
}) {
  const lineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...from, ...to], 3));
    return g;
  }, [from, to]);

  return (
    <group>
      {/* Arm line */}
      <lineSegments geometry={lineGeo}>
        <lineBasicMaterial color={color} transparent opacity={opacity * 0.7} />
      </lineSegments>
      {/* Joint sphere at endpoint */}
      <mesh position={to}>
        <sphereGeometry args={[0.035, 6, 6]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={opacity * 0.8}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>
    </group>
  );
}

// ── TraceLine: an illuminated data trace path along the chassis ───────────────
function TraceLine({ points, color, opacity }: {
  points: [number, number, number][];
  color: string;
  opacity: number;
}) {
  const matRef = useRef<THREE.LineBasicMaterial>(null);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions = points.flatMap(p => p);
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [points]);

  useFrame((_, delta) => {
    if (matRef.current) {
      matRef.current.opacity = THREE.MathUtils.lerp(
        matRef.current.opacity, opacity, delta * 2.5
      );
    }
  });

  return (
    <line geometry={geo}>
      <lineBasicMaterial ref={matRef} color={color} transparent opacity={0} />
    </line>
  );
}

// ── CentralPlane: the elevated processing surface in the middle ───────────────
function CentralPlane({ state }: { state: WorkCoreState }) {
  const cfg = STATE[state] || STATE.DORMANT;
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((_, delta) => {
    if (matRef.current) {
      const targetColor = new THREE.Color(cfg.centerGlow);
      matRef.current.color.lerp(targetColor, delta * 2);
      matRef.current.emissive.lerp(targetColor, delta * 2);
      matRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        matRef.current.emissiveIntensity, cfg.centerIntensity, delta * 2
      );
    }
  });

  return (
    <group position={[0, 0, 0.22]}>
      {/* Elevated processing plate */}
      <mesh>
        <boxGeometry args={[1.4, 0.72, 0.04]} />
        <meshStandardMaterial
          ref={matRef}
          color={cfg.centerGlow}
          emissive={cfg.centerGlow}
          emissiveIntensity={cfg.centerIntensity}
          metalness={0.7}
          roughness={0.4}
        />
      </mesh>
      {/* Plate edge */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(1.4, 0.72, 0.04)]} />
        <lineBasicMaterial color={cfg.chassisLit ? cfg.traceColor : '#252535'} transparent opacity={0.5} />
      </lineSegments>
    </group>
  );
}

// ── The complete WorkProcessEngine ────────────────────────────────────────────
export function AutoworkerCoreScene({ state }: { state: WorkCoreState }) {
  const cfg = STATE[state] || STATE.DORMANT;
  const groupRef = useRef<THREE.Group>(null);

  // Define connection arms: chassis corners → joint nodes slightly outside
  const arms = useMemo(() => [
    { from: [-1.2,  0.7, 0.16] as [number, number, number], to: [-1.8,  1.1, 0.6] as [number, number, number] },
    { from: [ 1.2,  0.7, 0.16] as [number, number, number], to: [ 1.8,  1.1, 0.6] as [number, number, number] },
    { from: [-1.2, -0.7, 0.16] as [number, number, number], to: [-1.8, -1.1, 0.6] as [number, number, number] },
    { from: [ 1.2, -0.7, 0.16] as [number, number, number], to: [ 1.8, -1.1, 0.6] as [number, number, number] },
    { from: [ 0.0,  0.7, 0.16] as [number, number, number], to: [ 0.0,  1.6, 0.3] as [number, number, number] },
    { from: [ 0.0, -0.7, 0.16] as [number, number, number], to: [ 0.0, -1.6, 0.3] as [number, number, number] },
  ], []);

  // Trace paths running across the chassis surface
  const traces = useMemo(() => [
    { points: [[-1.0, 0.2, 0.18], [-0.4, 0.2, 0.18], [0.0, 0.2, 0.22], [0.4, 0.2, 0.18], [1.0, 0.2, 0.18]] as [number,number,number][] },
    { points: [[-1.0,-0.2, 0.18], [-0.4,-0.2, 0.18], [0.0,-0.2, 0.22], [0.4,-0.2, 0.18], [1.0,-0.2, 0.18]] as [number,number,number][] },
    { points: [[ 0.6, 0.6, 0.18], [ 0.6, 0.2, 0.18], [ 0.6,-0.2, 0.18], [ 0.6,-0.6, 0.18]] as [number,number,number][] },
    { points: [[-0.6, 0.6, 0.18], [-0.6, 0.2, 0.18], [-0.6,-0.2, 0.18], [-0.6,-0.6, 0.18]] as [number,number,number][] },
  ], []);

  useFrame((_, delta) => {
    if (groupRef.current) {
      // Slow, deliberate Y-axis rotation only — no bouncing, no floating
      groupRef.current.rotation.y += delta * cfg.rotationSpeed;
      // Minimal X tilt that shifts slightly based on state
      const targetX = cfg.chassisLit ? -0.08 : -0.04;
      groupRef.current.rotation.x = THREE.MathUtils.lerp(
        groupRef.current.rotation.x, targetX, delta * 0.5
      );
    }
  });

  return (
    <group ref={groupRef}>
      <Chassis />
      <GridSurface />
      <CentralPlane state={state} />

      {/* Connection arms — visible in active states */}
      {arms.map((arm, i) => (
        <ConnectionArm
          key={i}
          from={arm.from}
          to={arm.to}
          color={cfg.traceColor}
          opacity={cfg.traceOpacity * 0.8}
        />
      ))}

      {/* Data trace lines */}
      {traces.map((trace, i) => (
        <TraceLine
          key={i}
          points={trace.points}
          color={cfg.traceColor}
          opacity={cfg.traceOpacity}
        />
      ))}

      {/* Internal lighting — teal/amber/green only when active */}
      {cfg.chassisLit && (
        <pointLight
          position={[0, 0, 0.5]}
          intensity={cfg.centerIntensity * 1.5}
          color={cfg.centerGlow}
          distance={4}
          decay={2}
        />
      )}
    </group>
  );
}
