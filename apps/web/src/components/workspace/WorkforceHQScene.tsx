import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { OfficeEnvironment } from '../landing/models/OfficeEnvironment.js';
import { OfficeWingArchitecture } from '../landing/models/OfficeWingArchitecture.js';
import { LightingSystem } from '../landing/models/LightingSystem.js';
import {
  LargeFloorPlant,
  PottedPlant,
  ModernLoungeSofa,
  LoungeCoffeeTable,
  GlassWhiteboard,
  WaterCooler,
} from '../landing/models/OfficeProps.js';
import { DepartmentWorkstations } from './DepartmentWorkstations.js';
import { SupervisionWallDisplay } from './SupervisionWallDisplay.js';
import { GiantOperationsDisplay } from './GiantOperationsDisplay.js';
import { HQCameraController, HQCameraMode } from './HQCameraController.js';

interface WorkforceHQSceneProps {
  workers: any[];
  runs: any[];
  cameraMode: HQCameraMode;
  selectedWorkerId: string | null;
  onSelectWorker: (workerId: string) => void;
  onEnterWorker: (workerId: string) => void;
  onRunWorker?: ((e: React.MouseEvent, workerId: string) => void) | undefined;
  runningId?: string | null | undefined;
}

export function WorkforceHQScene({
  workers,
  runs,
  cameraMode,
  selectedWorkerId,
  onSelectWorker,
  onEnterWorker,
  onRunWorker,
  runningId,
}: WorkforceHQSceneProps) {
  return (
    <div className="w-full h-full relative overflow-hidden bg-[#07080c] select-none">
      <Canvas
        shadows
        camera={{ position: [0, 3.2, 9.6], fov: 38, near: 0.1, far: 240 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
        }}
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <Suspense fallback={null}>
          {/* ── 1. Architectural Lighting System ── */}
          <LightingSystem />

          {/* ── 2. Base Architectural Office & Wing Geometry ── */}
          <OfficeEnvironment />
          <OfficeWingArchitecture />

          {/* ── 3. Multi-Department Differentiated Workstations ── */}
          <DepartmentWorkstations
            workers={workers}
            selectedWorkerId={selectedWorkerId}
            onSelectWorker={onSelectWorker}
            onEnterWorker={onEnterWorker}
            onRunWorker={onRunWorker}
            runningId={runningId}
          />

          {/* ── 4. Architectural Telemetry Display on South Wall ── */}
          <SupervisionWallDisplay workers={workers} runs={runs} />

          {/* ── 4b. Giant Central Operations War-Room Video Wall on North Wall ── */}
          <GiantOperationsDisplay onSelectWorker={onSelectWorker} />

          {/* ── 5. Minimalist 1:1 Metric Props Along Circulation Margins ── */}
          {/* Perimeter Plants */}
          <LargeFloorPlant position={[-5.8, 0, 1.2]} />
          <LargeFloorPlant position={[5.8, 0, 1.2]} />
          <PottedPlant position={[-5.4, 0, -1.8]} />
          <PottedPlant position={[5.4, 0, -1.8]} />

          {/* Hydration Station & Glass Whiteboard */}
          <WaterCooler position={[-5.8, 0, 3.2]} rotation={[0, 0.4, 0]} />
          <GlassWhiteboard position={[-5.8, 0, -3.2]} rotation={[0, 0.25, 0]} />

          {/* South Corridor Executive Breakout Lounge */}
          <group position={[0, 0, 5.6]}>
            <ModernLoungeSofa position={[0, 0, 0]} />
            <LoungeCoffeeTable position={[0, 0, 1.4]} />
          </group>

          {/* ── 6. Active Camera Controller Rig ── */}
          <HQCameraController
            mode={cameraMode}
            selectedWorkerId={selectedWorkerId}
            workers={workers}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
