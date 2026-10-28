import React from 'react';
import { AlertTriangle, XCircle, RefreshCw } from 'lucide-react';

export function ErrorBanner({
  title = 'An operational error occurred',
  message,
  onRetry,
  className = '',
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`flex items-start gap-3 p-3.5 rounded bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] text-xs text-[#ef4444] ${className}`}
    >
      <AlertTriangle size={15} className="shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[#f4f2ee]">{title}</div>
        {message && <div className="mt-1 text-[11px] text-[#ef4444]/90">{message}</div>}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[rgba(239,68,68,0.15)] hover:bg-[rgba(239,68,68,0.25)] text-[10px] font-semibold uppercase tracking-wider text-[#f4f2ee] transition-colors"
        >
          <RefreshCw size={10} /> Retry
        </button>
      )}
    </div>
  );
}
