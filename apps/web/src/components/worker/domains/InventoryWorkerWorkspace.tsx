import React, { useState } from 'react';
import { Package, ShieldAlert, ArrowRight, RefreshCw, Layers } from 'lucide-react';
import { Button } from '../../ui/button.js';
import { Badge } from '../../ui/Badge.js';
import { DataGrid, ColumnDef } from '../../ui/DataGrid.js';

interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  facility: string;
  currentStock: number;
  safetyThreshold: number;
  status: 'OPTIMAL' | 'DEFICIT' | 'REORDER_TRIGGERED';
}

const SAMPLE_INVENTORY: InventoryItem[] = [
  { id: 'sku-1', sku: 'SKU-8422', name: 'Tactical Fulfillment Backpack', facility: 'Austin WH-02', currentStock: 20, safetyThreshold: 24, status: 'DEFICIT' },
  { id: 'sku-2', sku: 'SKU-8422', name: 'Tactical Fulfillment Backpack', facility: 'Chicago WH-04', currentStock: 140, safetyThreshold: 30, status: 'OPTIMAL' },
  { id: 'sku-3', sku: 'SKU-1092', name: 'Fulfillment Packing Box L', facility: 'Austin WH-02', currentStock: 420, safetyThreshold: 100, status: 'OPTIMAL' },
  { id: 'sku-4', sku: 'SKU-9941', name: 'Industrial Poly Sealing Tape', facility: 'Seattle WH-01', currentStock: 18, safetyThreshold: 50, status: 'REORDER_TRIGGERED' },
  { id: 'sku-5', sku: 'SKU-3120', name: 'Biodegradable Packing Peanuts', facility: 'Dallas WH-03', currentStock: 85, safetyThreshold: 40, status: 'OPTIMAL' },
];

export function InventoryWorkerWorkspace({ worker }: { worker: any }) {
  const [items, setItems] = useState<InventoryItem[]>(SAMPLE_INVENTORY);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(SAMPLE_INVENTORY[0] || null);

  const handleReorder = (id: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, status: 'OPTIMAL', currentStock: it.currentStock + 50 } : it))
    );
  };

  const columns: ColumnDef<InventoryItem>[] = [
    {
      key: 'sku',
      header: 'SKU Code',
      width: '110px',
      render: (r) => <span className="font-mono text-xs text-[#e8942a]">{r.sku}</span>,
    },
    {
      key: 'name',
      header: 'Inventory Description',
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-medium text-xs text-[#f4f2ee]">{r.name}</span>
          <span className="text-[10px] text-[#686b78]">{r.facility}</span>
        </div>
      ),
    },
    {
      key: 'currentStock',
      header: 'On-Hand Stock',
      width: '120px',
      render: (r) => (
        <div className="flex items-center gap-2">
          <span
            className={`font-mono text-xs font-semibold ${
              r.currentStock < r.safetyThreshold ? 'text-[#e8942a]' : 'text-[#f4f2ee]'
            }`}
          >
            {r.currentStock} units
          </span>
          <span className="text-[10px] text-[#686b78]">/ min {r.safetyThreshold}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Safety Status',
      width: '140px',
      render: (r) => {
        if (r.status === 'DEFICIT') return <Badge variant="warning" dot>Deficit · Transfer</Badge>;
        if (r.status === 'REORDER_TRIGGERED') return <Badge variant="accent" dot>Reorder Active</Badge>;
        return <Badge variant="success" dot>Optimal</Badge>;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Top Operational Bar */}
      <div className="flex items-center justify-between p-3 bg-[#0b0d13] border border-[rgba(255,255,255,0.06)] rounded-md">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#8e92a4]">
            Warehouse Telemetry:
          </span>
          <span className="text-xs font-mono text-[#e8942a] bg-[rgba(232,148,42,0.1)] px-2 py-0.5 rounded border border-[rgba(232,148,42,0.25)]">
            Multi-Node Inventory Balancer · Austin WH-02 / Chicago WH-04
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#1db87a]" />
          <span className="text-[11px] font-mono text-[#8e92a4]">Safety Stock Polling Active</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
        <div className="lg:col-span-2 flex flex-col min-h-0">
          <DataGrid
            data={items}
            columns={columns}
            keyExtractor={(r) => r.id}
            selectedRowId={selectedItem?.id}
            onRowClick={(r) => setSelectedItem(r)}
            searchableKey="name"
            searchPlaceholder="Filter inventory by item..."
            className="h-full"
          />
        </div>

        {/* Selected SKU Telemetry Details */}
        <div className="flex flex-col gap-3 p-4 bg-[#0e1017] border border-[rgba(255,255,255,0.08)] rounded-md overflow-y-auto">
          <div className="flex items-center justify-between pb-2 border-b border-[rgba(255,255,255,0.06)]">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8e92a4]">
              SKU Stock Allocation
            </span>
            {selectedItem && (
              <span className="text-[10px] font-mono text-[#e8942a]">{selectedItem.sku}</span>
            )}
          </div>

          {selectedItem ? (
            <div className="flex flex-col gap-3.5">
              <div>
                <div className="text-sm font-bold text-[#f4f2ee]">{selectedItem.name}</div>
                <div className="text-xs text-[#a5a8b5] mt-0.5">{selectedItem.facility}</div>
              </div>

              <div className="p-3 bg-[#07080c] border border-[rgba(255,255,255,0.05)] rounded space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#686b78]">Current Safety Stock:</span>
                  <span className="text-[#f4f2ee] font-mono">{selectedItem.currentStock} units</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#686b78]">Minimum Buffer Threshold:</span>
                  <span className="text-[#f4f2ee] font-mono">{selectedItem.safetyThreshold} units</span>
                </div>
                <div className="flex justify-between border-t border-[rgba(255,255,255,0.05)] pt-1.5 font-semibold">
                  <span className="text-[#686b78]">Variance to Reorder:</span>
                  <span
                    className={`font-mono ${
                      selectedItem.currentStock < selectedItem.safetyThreshold
                        ? 'text-[#e8942a]'
                        : 'text-[#1db87a]'
                    }`}
                  >
                    {selectedItem.currentStock - selectedItem.safetyThreshold} units
                  </span>
                </div>
              </div>

              {selectedItem.status === 'DEFICIT' && (
                <div className="p-3 bg-[rgba(232,148,42,0.08)] border border-[rgba(232,148,42,0.25)] rounded text-xs text-[#e8942a] space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <ShieldAlert size={13} />
                    <span>Cross-Dock Balancing Recommended</span>
                  </div>
                  <p className="text-[11px] text-[#e8942a]/90 leading-relaxed">
                    Chicago WH-04 has 140 units on-hand. Transferring 4 units satisfies current fulfillment deficit.
                  </p>
                </div>
              )}

              <Button
                variant="primary"
                className="w-full justify-center"
                icon={<ArrowRight size={13} />}
                onClick={() => handleReorder(selectedItem.id)}
              >
                Trigger Automatic Replenishment
              </Button>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-[#686b78]">
              Select a SKU to inspect warehouse allocation
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
