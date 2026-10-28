import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'default';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  ...props
}: ButtonProps) {
  // Normalize legacy 'default' to 'primary' and 'outline' to 'secondary'
  const effectiveVariant = variant === 'default' ? 'primary' : variant === 'outline' ? 'secondary' : variant;

  const baseStyles = 'inline-flex items-center justify-center font-medium transition-all duration-150 rounded cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap';

  const sizeStyles = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5',
    md: 'text-xs px-3.5 py-2 gap-2',
    lg: 'text-sm px-4.5 py-2.5 gap-2.5',
    icon: 'p-2 text-xs',
  };

  const variantStyles = {
    primary: 'bg-[#f4f2ee] text-[#080a0e] font-semibold hover:bg-white hover:shadow-[0_4px_16px_rgba(255,255,255,0.12)] active:translate-y-[1px]',
    secondary: 'bg-white/[0.05] text-[#f4f2ee] border border-white/[0.1] hover:bg-white/[0.1] hover:border-white/[0.18]',
    ghost: 'bg-transparent text-[#a5a8b5] hover:text-[#f4f2ee] hover:bg-white/[0.05] border border-transparent',
    danger: 'bg-[rgba(239,68,68,0.12)] text-[#ef4444] border border-[rgba(239,68,68,0.28)] hover:bg-[rgba(239,68,68,0.22)]',
  };

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[effectiveVariant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 size={13} className="animate-spin text-current" />
      ) : icon ? (
        <span className="shrink-0 flex items-center">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
