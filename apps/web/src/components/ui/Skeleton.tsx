import React from 'react';

export function Skeleton({
  className = '',
  width,
  height,
}: {
  className?: string;
  width?: string | number;
  height?: string | number;
}) {
  return (
    <div
      style={{ width, height }}
      className={`bg-[rgba(255,255,255,0.04)] rounded animate-pulse ${className}`}
    />
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="flex flex-col gap-2 p-4 bg-[#0e1017] border border-[rgba(255,255,255,0.08)] rounded-md">
      <div className="flex gap-4 pb-2 border-b border-[rgba(255,255,255,0.06)]">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 py-2 border-b border-[rgba(255,255,255,0.02)]">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
