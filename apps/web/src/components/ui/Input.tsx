import React from 'react';
import { Search } from 'lucide-react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
}

export function Input({
  label,
  error,
  hint,
  icon,
  className = '',
  id,
  ...props
}: InputProps) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label htmlFor={inputId} className="text-[11px] font-semibold uppercase tracking-wider text-[#8e92a4]">
          {label}
        </label>
      )}
      <div className="relative flex items-center w-full">
        {icon && (
          <span className="absolute left-3 text-[#686b78] pointer-events-none flex items-center">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          className={`w-full bg-[#0b0d13] border rounded text-xs text-[#f4f2ee] placeholder-[#686b78] outline-none transition-all duration-150 py-2 ${
            icon ? 'pl-9 pr-3' : 'px-3'
          } ${
            error
              ? 'border-[#ef4444] focus:ring-1 focus:ring-[#ef4444]'
              : 'border-[rgba(255,255,255,0.08)] focus:border-[#00c2d4] focus:ring-1 focus:ring-[rgba(0,194,212,0.25)]'
          } ${className}`}
          {...props}
        />
      </div>
      {error ? (
        <span className="text-[11px] text-[#ef4444]">{error}</span>
      ) : hint ? (
        <span className="text-[11px] text-[#686b78]">{hint}</span>
      ) : null}
    </div>
  );
}

export function SearchInput({ className = '', ...props }: Omit<InputProps, 'icon'>) {
  return <Input icon={<Search size={13} />} placeholder="Filter & search..." className={className} {...props} />;
}
