import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRef } from 'react';
import { HQ_WORKSTATION_SLOTS } from './DepartmentWorkstations.js';

export type HQCameraMode =
  | 'HQ_WIDE'
  | 'WAR_ROOM_FOCUS'
  | 'OPERATIONS_FOCUS'
  | 'FINANCE_FOCUS'
  | 'INVENTORY_FOCUS'
  | 'CUSTOMER_FOCUS'
  | 'RESEARCH_FOCUS'
  | 'SUPERVISION_FOCUS'
  | 'WORKER_DESK';

interface HQCameraControllerProps {
  mode: HQCameraMode;
  selectedWorkerId: string | null;
  workers: any[];
}

export const HQ_CAMERA_PRESETS: Record<
  Exclude<HQCameraMode, 'WORKER_DESK'>,
  { pos: [number, number, number]; lookAt: [number, number, number] }
> = {
  HQ_WIDE: {
    pos: [0, 3.3, 11.2],
    lookAt: [0, 1.35, -0.8],
  },
  WAR_ROOM_FOCUS: {
    pos: [0, 2.25, 5.8],
    lookAt: [0, 2.25, -5.58],
  },
  OPERATIONS_FOCUS: {
    pos: [-4.6, 2.1, 2.2],
    lookAt: [-8.8, 1.1, -1.0],
  },
  FINANCE_FOCUS: {
    pos: [4.6, 2.1, 2.2],
    lookAt: [8.8, 1.1, -1.0],
  },
  INVENTORY_FOCUS: {
    pos: [-4.6, 2.1, 7.2],
    lookAt: [-8.0, 1.1, 3.8],
  },
  CUSTOMER_FOCUS: {
    pos: [4.6, 2.1, 7.2],
    lookAt: [8.0, 1.1, 3.8],
  },
  RESEARCH_FOCUS: {
    pos: [0, 1.9, 0.6],
    lookAt: [0, 1.15, -3.2],
  },
  SUPERVISION_FOCUS: {
    pos: [0, 2.2, 9.5],
    lookAt: [0, 2.4, 14.2],
  },
};

export function HQCameraController({
  mode,
  selectedWorkerId,
  workers,
}: HQCameraControllerProps) {
  const { camera, pointer } = useThree();
  const targetCamPos = useRef(new THREE.Vector3(0, 3.2, 9.6));
  const targetLookAt = useRef(new THREE.Vector3(0, 1.1, 0.6));
  const currentLookAt = useRef(new THREE.Vector3(0, 1.1, 0.6));

  useFrame((_, delta) => {
    // ── 1. Calculate Target Camera Position & LookAt ──
    if (mode === 'WORKER_DESK' && selectedWorkerId) {
      const workerIndex = workers.findIndex((w) => w.id === selectedWorkerId);
      const slot =
        (workerIndex !== -1
          ? HQ_WORKSTATION_SLOTS[workerIndex % HQ_WORKSTATION_SLOTS.length]
          : null) || HQ_WORKSTATION_SLOTS[0]!;

      const [sx, sy, sz] = slot.position;
      const rotY = slot.rotation[1] || 0;

      // Position camera at natural supervisor eye level (1.25m) facing the monitors
      const camOffsetX = Math.sin(rotY) * 1.35;
      const camOffsetZ = Math.cos(rotY) * 1.35;

      targetCamPos.current.set(sx + camOffsetX, sy + 1.25, sz + camOffsetZ);
      targetLookAt.current.set(sx, sy + 1.05, sz - 0.15);
    } else {
      const preset =
        HQ_CAMERA_PRESETS[mode === 'WORKER_DESK' ? 'HQ_WIDE' : mode] ||
        HQ_CAMERA_PRESETS.HQ_WIDE;
      targetCamPos.current.set(...preset.pos);
      targetLookAt.current.set(...preset.lookAt);
    }

    // ── 2. Subtle Parallax for Depth Perception ──
    const parallaxX = pointer.x * 0.08;
    const parallaxY = pointer.y * 0.04;

    const finalCamPos = new THREE.Vector3(
      targetCamPos.current.x + parallaxX,
      targetCamPos.current.y + parallaxY,
      targetCamPos.current.z
    );

    // ── 3. Smooth Physical Camera Damping ──
    camera.position.lerp(finalCamPos, delta * 3.6);
    currentLookAt.current.lerp(targetLookAt.current, delta * 3.8);
    camera.lookAt(currentLookAt.current);
  });

  return null;
}
