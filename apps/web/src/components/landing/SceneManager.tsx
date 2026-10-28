import React from 'react';
import { OfficeEnvironment } from './models/OfficeEnvironment.js';
import { OfficeWingArchitecture } from './models/OfficeWingArchitecture.js';
import { DepartmentWorkstations } from '../workspace/DepartmentWorkstations.js';
import { SupervisionWallDisplay } from '../workspace/SupervisionWallDisplay.js';
import { GiantOperationsDisplay } from '../workspace/GiantOperationsDisplay.js';
import {
  LargeFloorPlant,
  PottedPlant,
  ModernLoungeSofa,
  LoungeCoffeeTable,
  GlassWhiteboard,
  WaterCooler,
} from './models/OfficeProps.js';

interface SceneManagerProps {
  progress?: number | { get: () => number };
}

// Live digital workforce roster for the spatial office tour
const LANDING_WORKFORCE = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Order Fulfillment Specialist',
    description: 'Apex ERP · Wholesale Order Queue #48219',
    status: 'ACTIVE',
    version: 'v1.0',
    department: 'Operations',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Wholesale Dispatch Router',
    description: 'Enterprise ERP Cross-Dock Transfer',
    status: 'RUNNING',
    version: 'v1.0',
    department: 'Operations',
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    name: 'Invoice 3-Way Matcher',
    description: 'General Ledger Reconciliation',
    status: 'ACTIVE',
    version: 'v1.0',
    department: 'Finance',
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    name: 'Accounts Payable Auditor',
    description: 'Vendor Purchase Order Verification',
    status: 'WAITING_FOR_HUMAN',
    version: 'v1.0',
    department: 'Finance',
  },
  {
    id: '00000000-0000-0000-0000-000000000005',
    name: 'Warehouse SKU Balancer',
    description: 'Austin WH-02 Real-Time Stock Telemetry',
    status: 'RUNNING',
    version: 'v1.0',
    department: 'Inventory',
  },
  {
    id: '00000000-0000-0000-0000-000000000006',
    name: 'Tier-1 Ticket Specialist',
    description: 'Omnichannel Customer Issue Resolution',
    status: 'ACTIVE',
    version: 'v1.0',
    department: 'Customer Ops',
  },
];

export function SceneManager({ progress }: SceneManagerProps) {
  const numericProgress = typeof progress === 'number' ? progress : (progress?.get?.() ?? 0);
  const isUncertain = numericProgress >= 0.50 && numericProgress < 0.68;
  const isLearned = numericProgress >= 0.68;

  const dynamicWorkers = React.useMemo(() => {
    return LANDING_WORKFORCE.map((w, idx) => {
      if (idx === 0) {
        return {
          ...w,
          status: isUncertain ? 'WAITING_FOR_HUMAN' : isLearned ? 'ACTIVE' : 'RUNNING',
          version: isLearned ? 'v2.0' : 'v1.0',
        };
      }
      return w;
    });
  }, [isUncertain, isLearned]);

  return (
    <group>
      {/* ── 1. Normalized Architectural Office Envelope ── */}
      <OfficeEnvironment />

      {/* ── 2. Department Wings & Acoustic Carpet Tiles ── */}
      <OfficeWingArchitecture />

      {/* ── 3. Data-Driven Department Workstations Across Real Wings ── */}
      <DepartmentWorkstations
        workers={dynamicWorkers}
        selectedWorkerId={dynamicWorkers[0]!.id}
        onSelectWorker={() => {}}
        onEnterWorker={() => {}}
      />

      {/* ── 4. Architectural Telemetry Display on South Wall ── */}
      <SupervisionWallDisplay workers={dynamicWorkers} runs={[]} />

      {/* ── 4b. Giant Central Operations War-Room Video Wall on North Wall ── */}
      <GiantOperationsDisplay />

      {/* ── 5. Minimalist 1:1 Metric Props Along Circulation Margins ── */}
      <LargeFloorPlant position={[-3.6, 0, 1.2]} />
      <LargeFloorPlant position={[3.6, 0, 1.2]} />
      <PottedPlant position={[-2.4, 0, -1.8]} />
      <PottedPlant position={[2.4, 0, -1.8]} />

      <WaterCooler position={[-3.6, 0, 3.2]} rotation={[0, 0.4, 0]} />
      <GlassWhiteboard position={[-3.6, 0, -3.2]} rotation={[0, 0.25, 0]} />

      <group position={[0, 0, 5.6]}>
        <ModernLoungeSofa position={[0, 0, 0]} />
        <LoungeCoffeeTable position={[0, 0, 1.4]} />
      </group>
    </group>
  );
}
