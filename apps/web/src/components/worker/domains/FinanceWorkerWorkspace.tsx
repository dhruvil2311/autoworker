import React, { useState } from 'react';
import { CreditCard, CheckCircle2, AlertTriangle, ArrowUpRight, Check, FileText } from 'lucide-react';
import { Button } from '../../ui/button.js';
import { Badge } from '../../ui/Badge.js';
import { DataGrid, ColumnDef } from '../../ui/DataGrid.js';

interface InvoiceMatch {
  id: string;
  invoiceNo: string;
  vendor: string;
  poNumber: string;
  poAmount: number;
  invoiceAmount: number;
  variance: number;
  status: 'MATCHED' | 'DISCREPANCY' | 'PENDING_APPROVAL';
  lineItems: number;
}

const SAMPLE_INVOICES: InvoiceMatch[] = [
  { id: 'inv-1', invoiceNo: 'INV-2026-901', vendor: 'Apex Packaging Supplies', poNumber: 'PO-8812', poAmount: 4850.00, invoiceAmount: 4850.00, variance: 0, status: 'MATCHED', lineItems: 4 },
  { id: 'inv-2', invoiceNo: 'INV-2026-902', vendor: 'Starlight Freight Carriers', poNumber: 'PO-8814', poAmount: 12200.00, invoiceAmount: 12480.00, variance: 280.00, status: 'DISCREPANCY', lineItems: 2 },
  { id: 'inv-3', invoiceNo: 'INV-2026-903', vendor: 'Omni Microelectronics', poNumber: 'PO-8819', poAmount: 8900.00, invoiceAmount: 8900.00, variance: 0, status: 'MATCHED', lineItems: 12 },
  { id: 'inv-4', invoiceNo: 'INV-2026-904', vendor: 'Pacific Logistics Warehousing', poNumber: 'PO-8822', poAmount: 3100.00, invoiceAmount: 3100.00, variance: 0, status: 'PENDING_APPROVAL', lineItems: 3 },
];

export function FinanceWorkerWorkspace({ worker }: { worker: any }) {
  const [invoices, setInvoices] = useState<InvoiceMatch[]>(SAMPLE_INVOICES);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceMatch | null>(SAMPLE_INVOICES[1] || null);

  const handleApprove = (id: string) => {
    setInvoices((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'MATCHED', variance: 0 } : item))
    );
  };

  const columns: ColumnDef<InvoiceMatch>[] = [
    {
      key: 'invoiceNo',
      header: 'Invoice #',
      width: '120px',
      render: (r) => <span className="font-mono text-xs text-[#1db87a]">{r.invoiceNo}</span>,
    },
    {
      key: 'vendor',
      header: 'Vendor & PO Reference',
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-medium text-xs text-[#f4f2ee]">{r.vendor}</span>
          <span className="text-[10px] text-[#686b78]">Matched to {r.poNumber}</span>
        </div>
      ),
    },
    {
      key: 'invoiceAmount',
      header: 'Billed Amount',
      width: '110px',
      render: (r) => (
        <span className="font-mono text-xs text-[#f4f2ee]">
          ${r.invoiceAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      key: 'variance',
      header: 'Variance',
      width: '90px',
      render: (r) => (
        <span
          className={`font-mono text-xs ${
            r.variance > 0 ? 'text-[#e8942a] font-semibold' : 'text-[#8e92a4]'
          }`}
        >
          {r.variance > 0 ? `+$${r.variance.toFixed(2)}` : '$0.00'}
        </span>
      ),
    },
    {
      key: 'status',
      header: '3-Way Match Status',
      width: '140px',
      render: (r) => {
        if (r.status === 'MATCHED') return <Badge variant="success" dot>Reconciled</Badge>;
        if (r.status === 'DISCREPANCY') return <Badge variant="warning" dot>Price Variance</Badge>;
        return <Badge variant="neutral" dot>Pending Approval</Badge>;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Top Operational Bar */}
      <div className="flex items-center justify-between p-3 bg-[#0b0d13] border border-[rgba(255,255,255,0.06)] rounded-md">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#8e92a4]">
            General Ledger:
          </span>
          <span className="text-xs font-mono text-[#1db87a] bg-[rgba(29,184,122,0.1)] px-2 py-0.5 rounded border border-[rgba(29,184,122,0.25)]">
            Accounts Payable 3-Way Match Engine · SAP / NetSuite Synced
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#1db87a]" />
          <span className="text-[11px] font-mono text-[#8e92a4]">Automated Audit Rules Active</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
        <div className="lg:col-span-2 flex flex-col min-h-0">
          <DataGrid
            data={invoices}
            columns={columns}
            keyExtractor={(r) => r.id}
            selectedRowId={selectedInvoice?.id}
            onRowClick={(r) => setSelectedInvoice(r)}
            searchableKey="vendor"
            searchPlaceholder="Filter vendor invoices..."
            className="h-full"
          />
        </div>

        {/* Selected 3-Way Reconciliation Audit Card */}
        <div className="flex flex-col gap-3 p-4 bg-[#0e1017] border border-[rgba(255,255,255,0.08)] rounded-md overflow-y-auto">
          <div className="flex items-center justify-between pb-2 border-b border-[rgba(255,255,255,0.06)]">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8e92a4]">
              Reconciliation Audit Trail
            </span>
            {selectedInvoice && (
              <span className="text-[10px] font-mono text-[#1db87a]">{selectedInvoice.poNumber}</span>
            )}
          </div>

          {selectedInvoice ? (
            <div className="flex flex-col gap-3.5">
              <div>
                <div className="text-sm font-bold text-[#f4f2ee] font-mono">
                  {selectedInvoice.invoiceNo}
                </div>
                <div className="text-xs text-[#a5a8b5] mt-0.5">{selectedInvoice.vendor}</div>
              </div>

              {/* 3-Way Comparison Breakdown */}
              <div className="p-3 bg-[#07080c] border border-[rgba(255,255,255,0.05)] rounded space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#686b78]">1. Purchase Order Amount:</span>
                  <span className="text-[#f4f2ee] font-mono">${selectedInvoice.poAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#686b78]">2. Receiving Dock Receipt:</span>
                  <span className="text-[#f4f2ee] font-mono">Verified ({selectedInvoice.lineItems} items)</span>
                </div>
                <div className="flex justify-between border-t border-[rgba(255,255,255,0.05)] pt-1.5 font-semibold">
                  <span className="text-[#686b78]">3. Billed Invoice Total:</span>
                  <span className="text-[#f4f2ee] font-mono">${selectedInvoice.invoiceAmount.toFixed(2)}</span>
                </div>
              </div>

              {selectedInvoice.variance > 0 && (
                <div className="p-3 bg-[rgba(232,148,42,0.08)] border border-[rgba(232,148,42,0.25)] rounded text-xs text-[#e8942a] space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle size={13} />
                    <span>Freight Surcharge Variance</span>
                  </div>
                  <p className="text-[11px] text-[#e8942a]/90 leading-relaxed">
                    Vendor billed a $280.00 fuel escalation charge not documented in original PO-8814.
                  </p>
                </div>
              )}

              {selectedInvoice.status !== 'MATCHED' && (
                <Button
                  variant="primary"
                  className="w-full justify-center"
                  icon={<Check size={13} />}
                  onClick={() => handleApprove(selectedInvoice.id)}
                >
                  Clear Variance & Approve Payment
                </Button>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-[#686b78]">
              Select an invoice to inspect line-item reconciliation
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
