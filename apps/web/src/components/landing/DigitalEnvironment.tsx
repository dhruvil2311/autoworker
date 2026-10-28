import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { SoftShadows } from '@react-three/drei';
import * as THREE from 'three';
import { CameraController } from './CameraController.js';
import { SceneManager } from './SceneManager.js';
import { LightingSystem } from './models/LightingSystem.js';

interface DigitalEnvironmentProps {
  scrollProgress: number | { get: () => number };
}

export function DigitalEnvironment({ scrollProgress }: DigitalEnvironmentProps) {
  return (
    <Canvas
      camera={{ position: [-1.4, 1.6, 3.4], fov: 38, near: 0.1, far: 240 }}
      gl={{
        antialias: true,
        alpha: false,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
      dpr={[1, 2]}
      shadows
      style={{ background: '#0a0a0e', position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      <SoftShadows size={25} samples={16} focus={0.5} />
      <CameraController scrollProgress={scrollProgress} />

      <Suspense fallback={null}>
        <LightingSystem />
        <SceneManager progress={scrollProgress} />
      </Suspense>
    </Canvas>
  );
}
