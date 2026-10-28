import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useMemo, useRef } from 'react';

interface CameraControllerProps {
  scrollProgress: number | { get: () => number };
}

interface CameraKeyframe {
  t: number;
  pos: THREE.Vector3;
  lookAt: THREE.Vector3;
}

export function CameraController({ scrollProgress }: CameraControllerProps) {
  const { camera, pointer } = useThree();
  const currentLookAtRef = useRef(new THREE.Vector3(0, 1.1, 0.6));

  // ── Exact 6-Chapter Architectural Office Tour Keyframes ─────────────────
  // Smooth continuous camera movement through the calibrated physical digital workplace:
  // 1. RECEPTION & ORIENTATION (0.00 – 0.15)
  // 2. OPERATIONS FLOOR (0.15 – 0.32)
  // 3. WORKSTATION & LIVE WORK (0.32 – 0.50)
  // 4. TEACHING & UNCERTAINTY (0.50 – 0.68)
  // 5. MEMORY & EXECUTIVE HUB (0.68 – 0.84)
  // 6. HQ PANORAMA & ENTER (0.84 – 1.00)
  const keyframes: CameraKeyframe[] = useMemo(
    () => [
      // 01: 0.00 – 0.15: Reception / Campus View
      { t: 0.0, pos: new THREE.Vector3(0.0, 3.2, 9.6), lookAt: new THREE.Vector3(0.0, 1.1, 0.6) },
      { t: 0.15, pos: new THREE.Vector3(-2.2, 2.6, 6.8), lookAt: new THREE.Vector3(-4.8, 1.1, 0.8) },

      // 02: 0.15 – 0.32: Move into Operations Floor (West Wing)
      { t: 0.24, pos: new THREE.Vector3(-4.6, 2.1, 2.2), lookAt: new THREE.Vector3(-8.0, 1.1, -1.8) },
      { t: 0.32, pos: new THREE.Vector3(-6.5, 1.6, 0.4), lookAt: new THREE.Vector3(-8.0, 1.05, -1.8) },

      // 03: 0.32 – 0.50: Approach Order Fulfillment Workstation & Dual Monitors
      { t: 0.42, pos: new THREE.Vector3(-8.0, 1.25, -0.45), lookAt: new THREE.Vector3(-8.0, 1.05, -1.95) },
      { t: 0.5, pos: new THREE.Vector3(-8.0, 1.25, -0.45), lookAt: new THREE.Vector3(-8.34, 1.06, -1.96) },

      // 04: 0.50 – 0.68: Uncertainty & Teaching (Right Screen Focus)
      { t: 0.58, pos: new THREE.Vector3(-8.0, 1.25, -0.45), lookAt: new THREE.Vector3(-7.66, 1.06, -1.96) },
      { t: 0.68, pos: new THREE.Vector3(-6.8, 1.6, 0.8), lookAt: new THREE.Vector3(-7.8, 1.05, -1.8) },

      // 05: 0.68 – 0.84: Procedural Memory & Executive Orchestration Hub
      { t: 0.76, pos: new THREE.Vector3(-2.4, 2.1, 0.2), lookAt: new THREE.Vector3(0.0, 1.1, -3.2) },
      { t: 0.84, pos: new THREE.Vector3(0.0, 2.2, -1.2), lookAt: new THREE.Vector3(0.0, 1.1, -3.2) },

      // 06: 0.84 – 1.00: Rise to Full HQ Campus Panorama
      { t: 0.92, pos: new THREE.Vector3(0.0, 2.8, 7.8), lookAt: new THREE.Vector3(0.0, 1.1, 0.6) },
      { t: 1.0, pos: new THREE.Vector3(0.0, 3.2, 9.6), lookAt: new THREE.Vector3(0.0, 1.1, 0.6) },
    ],
    []
  );

  useFrame((_, delta) => {
    const rawP = typeof scrollProgress === 'number' ? scrollProgress : scrollProgress.get();
    const p = Math.max(0, Math.min(1.0, rawP || 0));

    // Find active keyframe segment
    let fromIdx = 0;
    for (let i = 0; i < keyframes.length - 1; i++) {
      if (p >= keyframes[i]!.t && p <= keyframes[i + 1]!.t) {
        fromIdx = i;
        break;
      }
    }
    const toIdx = Math.min(keyframes.length - 1, fromIdx + 1);

    const fromKF = keyframes[fromIdx]!;
    const toKF = keyframes[toIdx]!;

    const segmentSpan = toKF.t - fromKF.t;
    const localT = segmentSpan > 0 ? (p - fromKF.t) / segmentSpan : 0;

    // Smoothstep interpolation for natural cinematic inertia
    const ease = THREE.MathUtils.smoothstep(localT, 0.0, 1.0);

    const targetPos = new THREE.Vector3().lerpVectors(fromKF.pos, toKF.pos, ease);
    const targetLook = new THREE.Vector3().lerpVectors(fromKF.lookAt, toKF.lookAt, ease);

    // Subtle pointer parallax for physical depth awareness
    const parallaxX = pointer.x * 0.04;
    const parallaxY = pointer.y * 0.02;
    targetPos.x += parallaxX;
    targetPos.y += parallaxY;

    // Smooth physical damping
    camera.position.lerp(targetPos, delta * 3.6);
    currentLookAtRef.current.lerp(targetLook, delta * 3.8);
    camera.lookAt(currentLookAtRef.current);
  });

  return null;
}
