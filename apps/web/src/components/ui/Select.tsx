import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { label: string; value: string }[];
  error?: string;
}

export function Select({
  label,
  options,
  error,
  className = '',
  id,
  ...props
}: SelectProps) {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label htmlFor={selectId} className="text-[11px] font-semibold uppercase tracking-wider text-[#8e92a4]">
          {label}
        </label>
      )}
      <div className="relative flex items-center w-full">
        <select
          id={selectId}
          className={`w-full bg-[#0b0d13] border rounded text-xs text-[#f4f2ee] outline-none transition-all duration-150 py-2 pl-3 pr-8 appearance-none cursor-pointer ${
            error
              ? 'border-[#ef4444] focus:ring-1 focus:ring-[#ef4444]'
              : 'border-[rgba(255,255,255,0.08)] focus:border-[#00c2d4] focus:ring-1 focus:ring-[rgba(0,194,212,0.25)]'
          } ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-[#0e1017] text-[#f4f2ee]">
              {opt.label}
            </option>
          ))}
        </select>
        <span className="absolute right-2.5 pointer-events-none text-[#686b78]">
          <ChevronDown size={13} />
        </span>
      </div>
      {error && <span className="text-[11px] text-[#ef4444]">{error}</span>}
    </div>
  );
}
