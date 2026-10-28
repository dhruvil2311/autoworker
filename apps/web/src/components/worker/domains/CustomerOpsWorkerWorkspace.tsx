import React, { useState } from 'react';
import { MessageSquare, User, ArrowUpRight, Send, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Button } from '../../ui/button.js';
import { Badge } from '../../ui/Badge.js';
import { DataGrid, ColumnDef } from '../../ui/DataGrid.js';

interface TicketItem {
  id: string;
  ticketNo: string;
  customer: string;
  subject: string;
  intent: string;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'FRUSTRATED';
  status: 'QUEUED' | 'RESOLVING' | 'RESOLVED' | 'ESCALATED';
}

const SAMPLE_TICKETS: TicketItem[] = [
  { id: 't-1', ticketNo: 'TCK-8812', customer: 'Elena Vance', subject: 'Change shipping address for Order #48219', intent: 'Address Correction', sentiment: 'FRUSTRATED', status: 'RESOLVING' },
  { id: 't-2', ticketNo: 'TCK-8813', customer: 'Marcus Brody', subject: 'Where is my shipment tracking number?', intent: 'Status Inquiry', sentiment: 'NEUTRAL', status: 'QUEUED' },
  { id: 't-3', ticketNo: 'TCK-8814', customer: 'Sarah Connor', subject: 'Product arrived with broken seal', intent: 'Damaged Item Return', sentiment: 'FRUSTRATED', status: 'ESCALATED' },
  { id: 't-4', ticketNo: 'TCK-8815', customer: 'David Bowman', subject: 'Inquiry regarding bulk wholesale discounts', intent: 'Sales Ingestion', sentiment: 'POSITIVE', status: 'RESOLVED' },
];

export function CustomerOpsWorkerWorkspace({ worker }: { worker: any }) {
  const [tickets, setTickets] = useState<TicketItem[]>(SAMPLE_TICKETS);
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(SAMPLE_TICKETS[0] || null);
  const [replyText, setReplyText] = useState('We have updated your delivery address on Order #48219 to Austin Facility Bay 4.');

  const handleResolve = (id: string) => {
    setTickets((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: 'RESOLVED' } : t))
    );
  };

  const columns: ColumnDef<TicketItem>[] = [
    {
      key: 'ticketNo',
      header: 'Ticket #',
      width: '100px',
      render: (r) => <span className="font-mono text-xs text-[#8b64d4]">{r.ticketNo}</span>,
    },
    {
      key: 'customer',
      header: 'Customer & Intent',
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-medium text-xs text-[#f4f2ee]">{r.customer}</span>
          <span className="text-[10px] text-[#8e92a4]">{r.intent}</span>
        </div>
      ),
    },
    {
      key: 'sentiment',
      header: 'Sentiment',
      width: '110px',
      render: (r) => {
        if (r.sentiment === 'FRUSTRATED') return <Badge variant="warning">Frustrated</Badge>;
        if (r.sentiment === 'POSITIVE') return <Badge variant="success">Positive</Badge>;
        return <Badge variant="neutral">Neutral</Badge>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      render: (r) => {
        if (r.status === 'RESOLVED') return <Badge variant="success" dot>Resolved</Badge>;
        if (r.status === 'RESOLVING') return <Badge variant="accent" dot>Resolving</Badge>;
        if (r.status === 'ESCALATED') return <Badge variant="error" dot>Escalated</Badge>;
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
            Customer Omnichannel Desk:
          </span>
          <span className="text-xs font-mono text-[#8b64d4] bg-[rgba(139,100,212,0.1)] px-2 py-0.5 rounded border border-[rgba(139,100,212,0.25)]">
            Tier-1 Ingestion & Autonomous Resolution Workflow
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#1db87a]" />
          <span className="text-[11px] font-mono text-[#8e92a4]">Intent Extraction Model Synced</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
        <div className="lg:col-span-2 flex flex-col min-h-0">
          <DataGrid
            data={tickets}
            columns={columns}
            keyExtractor={(r) => r.id}
            selectedRowId={selectedTicket?.id}
            onRowClick={(r) => setSelectedTicket(r)}
            searchableKey="customer"
            searchPlaceholder="Filter support tickets..."
            className="h-full"
          />
        </div>

        {/* Selected Conversation Thread */}
        <div className="flex flex-col gap-3 p-4 bg-[#0e1017] border border-[rgba(255,255,255,0.08)] rounded-md overflow-y-auto">
          <div className="flex items-center justify-between pb-2 border-b border-[rgba(255,255,255,0.06)]">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8e92a4]">
              Resolution Workflow
            </span>
            {selectedTicket && (
              <span className="text-[10px] font-mono text-[#8b64d4]">{selectedTicket.ticketNo}</span>
            )}
          </div>

          {selectedTicket ? (
            <div className="flex flex-col gap-3.5">
              <div>
                <div className="text-sm font-bold text-[#f4f2ee]">{selectedTicket.subject}</div>
                <div className="text-xs text-[#a5a8b5] mt-0.5">Requester: {selectedTicket.customer}</div>
              </div>

              {/* Message Context */}
              <div className="p-3 bg-[#07080c] border border-[rgba(255,255,255,0.05)] rounded space-y-2 text-xs">
                <div className="text-[11px] text-[#686b78]">Customer Message:</div>
                <p className="text-[#f4f2ee] leading-relaxed">
                  "I ordered fulfillment packages to the wrong delivery address by mistake. Can you please redirect Order #48219 to Austin Facility Bay 4?"
                </p>
              </div>

              {/* Autoworker Resolution Proposal */}
              <div className="p-3 bg-[rgba(139,100,212,0.08)] border border-[rgba(139,100,212,0.25)] rounded text-xs space-y-2">
                <div className="font-semibold text-[#8b64d4] flex items-center gap-1.5">
                  <CheckCircle2 size={13} />
                  <span>Autonomous ERP Action Proposed</span>
                </div>
                <p className="text-[11px] text-[#a5a8b5] leading-relaxed">
                  Worker verified Order #48219 status in ERP and prepared routing amendment API call.
                </p>
              </div>

              {/* Response Draft */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-[#8e92a4]">
                  Automated Response Draft
                </label>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={3}
                  className="w-full bg-[#07080c] border border-[rgba(255,255,255,0.08)] rounded p-2 text-xs text-[#f4f2ee] outline-none"
                />
              </div>

              {selectedTicket.status !== 'RESOLVED' && (
                <Button
                  variant="primary"
                  className="w-full justify-center"
                  icon={<Send size={12} />}
                  onClick={() => handleResolve(selectedTicket.id)}
                >
                  Execute ERP Amendment & Send Response
                </Button>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-[#686b78]">
              Select a ticket to inspect conversation thread
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
