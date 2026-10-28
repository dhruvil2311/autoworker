import React, { useState, useMemo } from 'react';
import { Terminal, Globe, Code2, ArrowUpRight, Play, CheckCircle2, ShieldAlert, Layers } from 'lucide-react';
import { Button } from '../../ui/button.js';
import { Badge, OperationalStateBadge } from '../../ui/Badge.js';
import { DataGrid, ColumnDef } from '../../ui/DataGrid.js';

interface OrderItem {
  id: string;
  orderNumber: string;
  customer: string;
  destination: string;
  skus: string;
  status: 'QUEUED' | 'INSPECTING' | 'DISPATCHED' | 'EXCEPTION';
  units: number;
}

const SAMPLE_ORDERS: OrderItem[] = [
  { id: 'ord-1', orderNumber: '#48219', customer: 'Acme Wholesale Corp', destination: 'Bay 4 - Seattle Hub', skus: 'SKU-1092 (Industrial Bolt Pack)', units: 24, status: 'INSPECTING' },
  { id: 'ord-2', orderNumber: '#48220', customer: 'Global Freight Logistics', destination: 'Bay 2 - Portland Dock', skus: 'SKU-4911 (Pallet Shrink Wrap)', units: 110, status: 'EXCEPTION' },
  { id: 'ord-3', orderNumber: '#48221', customer: 'Pacific Retailers', destination: 'Seattle WH-01', skus: 'SKU-9941 (Heavy Duty Tape)', units: 48, status: 'DISPATCHED' },
  { id: 'ord-4', orderNumber: '#48222', customer: 'Meridian Trading', destination: 'Austin WH-02', skus: 'SKU-8422 (Tactical Backpack)', units: 12, status: 'QUEUED' },
  { id: 'ord-5', orderNumber: '#48223', customer: 'Summit Distribution', destination: 'Dallas WH-03', skus: 'SKU-3120 (Packing Peanuts)', units: 80, status: 'INSPECTING' },
];

export function OperationsWorkerWorkspace({
  worker,
  onInspectRun,
}: {
  worker: any;
  onInspectRun?: (runId?: string) => void;
}) {
  const [orders, setOrders] = useState<OrderItem[]>(SAMPLE_ORDERS);
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(SAMPLE_ORDERS[0] || null);

  const erpSystemName = useMemo(() => {
    const name = worker?.name?.toLowerCase() || '';
    if (name.includes('sauce')) return 'SauceDemo Logistics Portal';
    if (name.includes('heroku')) return 'The Internet Herokuapp Automation Hub';
    if (name.includes('webdriver')) return 'WebDriver University Portal';
    return 'Apex ERP · Wholesale Operations Dispatch';
  }, [worker?.name]);

  const columns: ColumnDef<OrderItem>[] = [
    {
      key: 'orderNumber',
      header: 'Order #',
      width: '90px',
      render: (r) => <span className="font-mono text-xs text-[#00c2d4]">{r.orderNumber}</span>,
    },
    {
      key: 'customer',
      header: 'Customer / Facility',
      render: (r) => (
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-[#f4f2ee]">{r.customer}</span>
          <span className="text-[10px] text-[#8e92a4]">{r.destination}</span>
        </div>
      ),
    },
    {
      key: 'skus',
      header: 'Payload SKU',
      render: (r) => <span className="text-xs font-mono text-[#8e92a4]">{r.skus}</span>,
    },
    {
      key: 'units',
      header: 'Units',
      width: '70px',
      render: (r) => <span className="text-xs font-mono text-[#f4f2ee]">{r.units}</span>,
    },
    {
      key: 'status',
      header: 'State',
      width: '110px',
      render: (r) => {
        if (r.status === 'INSPECTING') return <Badge variant="info" dot>Routing</Badge>;
        if (r.status === 'EXCEPTION') return <Badge variant="error" dot>Hold</Badge>;
        if (r.status === 'DISPATCHED') return <Badge variant="success" dot>Cleared</Badge>;
        return <Badge variant="neutral" dot>Queued</Badge>;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Top Operational Bar */}
      <div className="flex items-center justify-between p-3 bg-[#0b0d13] border border-[rgba(255,255,255,0.06)] rounded-md">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#8e92a4]">
            Target ERP System:
          </span>
          <span className="text-xs font-mono text-[#00c2d4] bg-[rgba(0,194,212,0.1)] px-2 py-0.5 rounded border border-[rgba(0,194,212,0.25)]">
            {erpSystemName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#1db87a] animate-pulse" />
          <span className="text-[11px] font-mono text-[#8e92a4]">60 FPS Browser Stream Active</span>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
        {/* Left 2 Cols: Order Queue Data Grid */}
        <div className="lg:col-span-2 flex flex-col min-h-0">
          <DataGrid
            data={orders}
            columns={columns}
            keyExtractor={(r) => r.id}
            selectedRowId={selectedOrder?.id}
            onRowClick={(r) => setSelectedOrder(r)}
            searchableKey="customer"
            searchPlaceholder="Filter incoming orders..."
            className="h-full"
          />
        </div>

        {/* Right 1 Col: Selected Order ERP Context & Action */}
        <div className="flex flex-col gap-3 p-4 bg-[#0e1017] border border-[rgba(255,255,255,0.08)] rounded-md overflow-y-auto">
          <div className="flex items-center justify-between pb-2 border-b border-[rgba(255,255,255,0.06)]">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8e92a4]">
              Active Order Inspection
            </span>
            {selectedOrder && <OperationalStateBadge state={selectedOrder.status} />}
          </div>

          {selectedOrder ? (
            <div className="flex flex-col gap-3.5">
              <div>
                <div className="text-sm font-bold text-[#f4f2ee] font-mono">
                  {selectedOrder.orderNumber}
                </div>
                <div className="text-xs text-[#a5a8b5] mt-0.5">{selectedOrder.customer}</div>
              </div>

              <div className="p-3 bg-[#07080c] border border-[rgba(255,255,255,0.05)] rounded space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-[#686b78]">Facility:</span>
                  <span className="text-[#f4f2ee] font-mono">{selectedOrder.destination}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#686b78]">Required Units:</span>
                  <span className="text-[#f4f2ee] font-mono">{selectedOrder.units} units</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#686b78]">Allocated SKU:</span>
                  <span className="text-[#00c2d4] font-mono">{selectedOrder.skus}</span>
                </div>
              </div>

              {selectedOrder.status === 'EXCEPTION' && (
                <div className="p-3 bg-[rgba(232,148,42,0.08)] border border-[rgba(232,148,42,0.25)] rounded text-xs text-[#e8942a] space-y-1.5">
                  <div className="font-semibold flex items-center gap-1.5">
                    <ShieldAlert size={13} />
                    <span>Cross-Dock Deficit Detected</span>
                  </div>
                  <p className="text-[11px] text-[#e8942a]/90 leading-relaxed">
                    Austin WH-02 lacks 4 units. Standard operating procedure Clause 4.2B requires triggering a secondary transfer from Chicago WH-04.
                  </p>
                </div>
              )}

              <Button
                variant="primary"
                className="w-full justify-center"
                icon={<ArrowUpRight size={13} />}
                onClick={() => onInspectRun?.()}
              >
                Inspect Live Browser Session
              </Button>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-[#686b78]">
              Select an order to inspect operational context
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
