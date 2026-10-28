import React from 'react';
import { WorkstationPrefab } from './WorkstationPrefab.js';

interface DepartmentWorkstationsProps {
  workers: any[];
  selectedWorkerId: string | null;
  onSelectWorker: (workerId: string) => void;
  onEnterWorker: (workerId: string) => void;
  onRunWorker?: ((e: React.MouseEvent, workerId: string) => void) | undefined;
  runningId?: string | null | undefined;
}

export interface WorkstationSlot {
  slotId: string;
  department: 'Operations' | 'Finance' | 'Inventory' | 'Customer Ops' | 'Research' | 'Lead';
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  accentColor: string;
  defaultSoftware: string;
}

// ── Department Bays Spatially Aligned to Real Office Wings ──
export const HQ_WORKSTATION_SLOTS: WorkstationSlot[] = [
  // ── Central Executive Orchestration Hub (North Central) ──
  {
    slotId: 'slot-lead',
    department: 'Lead',
    name: 'Autonomous Operations Lead',
    position: [0, 0, -3.2],
    rotation: [0, 0, 0],
    accentColor: '#00c2d4',
    defaultSoftware: 'Executive Orchestration Matrix',
  },
  // ── Operations Bay (West Wing) ──
  {
    slotId: 'slot-ops-1',
    department: 'Operations',
    name: 'Order Fulfillment Specialist',
    position: [-8.0, 0, -1.8],
    rotation: [0, 0.05, 0],
    accentColor: '#00c2d4',
    defaultSoftware: 'Apex ERP · Wholesale Order Queue #48219',
  },
  {
    slotId: 'slot-ops-2',
    department: 'Operations',
    name: 'Wholesale Dispatch Router',
    position: [-10.4, 0, 0.4],
    rotation: [0, 0.15, 0],
    accentColor: '#00c2d4',
    defaultSoftware: 'Apex ERP · Logistics Cross-Dock API',
  },
  // ── Finance Bay (East Wing) ──
  {
    slotId: 'slot-fin-1',
    department: 'Finance',
    name: 'Invoice 3-Way Matcher',
    position: [8.0, 0, -1.8],
    rotation: [0, -0.05, 0],
    accentColor: '#1db87a',
    defaultSoftware: 'General Ledger Reconciliation',
  },
  {
    slotId: 'slot-fin-2',
    department: 'Finance',
    name: 'Accounts Payable Auditor',
    position: [10.4, 0, 0.4],
    rotation: [0, -0.15, 0],
    accentColor: '#1db87a',
    defaultSoftware: 'NetSuite AP 3-Way Verification',
  },
  // ── Inventory & SKU Bay (South-West) ──
  {
    slotId: 'slot-inv-1',
    department: 'Inventory',
    name: 'Warehouse SKU Balancer',
    position: [-8.0, 0, 3.8],
    rotation: [0, 0.08, 0],
    accentColor: '#e8942a',
    defaultSoftware: 'Austin WH-02 Stock Telemetry',
  },
  // ── Customer Operations Bay (South-East) ──
  {
    slotId: 'slot-cust-1',
    department: 'Customer Ops',
    name: 'Tier-1 Ticket Specialist',
    position: [8.0, 0, 3.8],
    rotation: [0, -0.08, 0],
    accentColor: '#8b64d4',
    defaultSoftware: 'Customer Inquiry Resolution Queue',
  },
];

export function DepartmentWorkstations({
  workers,
  selectedWorkerId,
  onSelectWorker,
  onEnterWorker,
  onRunWorker,
  runningId,
}: DepartmentWorkstationsProps) {
  return (
    <group>
      {HQ_WORKSTATION_SLOTS.map((slot, index) => {
        // Map backend workers into departmental slots
        const assignedWorker =
          workers.find((w: any) => {
            const name = (w.name || '').toLowerCase();
            const desc = (w.description || '').toLowerCase();
            if (slot.department === 'Operations')
              return (
                name.includes('order') ||
                name.includes('sauce') ||
                desc.includes('ops') ||
                name.includes('logistics') ||
                name.includes('fulfill')
              );
            if (slot.department === 'Finance')
              return (
                name.includes('finance') ||
                name.includes('invoice') ||
                desc.includes('ledger') ||
                desc.includes('payable')
              );
            if (slot.department === 'Inventory')
              return name.includes('inventory') || name.includes('sku') || desc.includes('warehouse') || desc.includes('stock');
            if (slot.department === 'Customer Ops')
              return name.includes('customer') || name.includes('support') || desc.includes('ticket') || desc.includes('refund');
            if (slot.department === 'Lead')
              return name.includes('lead') || name.includes('orchestrat') || name.includes('exec');
            return false;
          }) || workers[index % Math.max(1, workers.length)];

        const workerId = assignedWorker?.id;
        const isSelected = Boolean(workerId && selectedWorkerId === workerId);
        const isRunning = Boolean(workerId && runningId === workerId);

        return (
          <WorkstationPrefab
            key={slot.slotId}
            position={slot.position}
            rotation={slot.rotation}
            department={slot.department}
            worker={assignedWorker}
            isSelected={isSelected}
            onSelect={() => workerId && onSelectWorker(workerId)}
            onEnter={() => workerId && onEnterWorker(workerId)}
            onRun={(e) => workerId && onRunWorker?.(e, workerId)}
            isRunning={isRunning}
          />
        );
      })}
    </group>
  );
}
