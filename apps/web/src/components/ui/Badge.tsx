import React from 'react';
import { CheckCircle2, ShieldAlert, AlertCircle, Clock, Zap, Pause, Sparkles } from 'lucide-react';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'accent' | 'purple';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  dot?: boolean;
  className?: string;
}

export function Badge({
  children,
  variant = 'neutral',
  size = 'md',
  icon,
  dot = false,
  className = '',
}: BadgeProps) {
  const variantStyles: Record<BadgeVariant, { bg: string; text: string; border: string; dotColor: string }> = {
    neutral: {
      bg: 'rgba(255, 255, 255, 0.04)',
      text: '#a5a8b5',
      border: 'rgba(255, 255, 255, 0.08)',
      dotColor: '#686b78',
    },
    success: {
      bg: 'rgba(29, 184, 122, 0.10)',
      text: '#1db87a',
      border: 'rgba(29, 184, 122, 0.28)',
      dotColor: '#1db87a',
    },
    warning: {
      bg: 'rgba(232, 148, 42, 0.10)',
      text: '#e8942a',
      border: 'rgba(232, 148, 42, 0.28)',
      dotColor: '#e8942a',
    },
    error: {
      bg: 'rgba(239, 68, 68, 0.10)',
      text: '#ef4444',
      border: 'rgba(239, 68, 68, 0.28)',
      dotColor: '#ef4444',
    },
    info: {
      bg: 'rgba(59, 130, 246, 0.10)',
      text: '#3b82f6',
      border: 'rgba(59, 130, 246, 0.28)',
      dotColor: '#3b82f6',
    },
    accent: {
      bg: 'rgba(0, 194, 212, 0.10)',
      text: '#00c2d4',
      border: 'rgba(0, 194, 212, 0.28)',
      dotColor: '#00c2d4',
    },
    purple: {
      bg: 'rgba(139, 100, 212, 0.10)',
      text: '#8b64d4',
      border: 'rgba(139, 100, 212, 0.28)',
      dotColor: '#8b64d4',
    },
  };

  const current = variantStyles[variant];
  const sizeStyles = size === 'sm' ? 'text-[10px] px-2 py-0.5 gap-1.5' : 'text-[11px] px-2.5 py-1 gap-1.5';

  return (
    <span
      className={`inline-flex items-center font-medium rounded uppercase tracking-wider select-none shrink-0 ${sizeStyles} ${className}`}
      style={{
        background: current.bg,
        color: current.text,
        border: `1px solid ${current.border}`,
      }}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: current.dotColor }}
        />
      )}
      {icon && <span className="shrink-0 flex items-center">{icon}</span>}
      {children}
    </span>
  );
}

export function OperationalStateBadge({ state }: { state: string }) {
  const norm = state?.toUpperCase() || 'DORMANT';

  if (['ACTIVE', 'RUNNING', 'WORKING'].includes(norm)) {
    return (
      <Badge variant="accent" dot icon={<Zap size={11} />}>
        At Work
      </Badge>
    );
  }
  if (['WAITING_FOR_HUMAN', 'NEEDS_HELP', 'NEEDS_CLARIFICATION', 'EXCEPTION'].includes(norm)) {
    return (
      <Badge variant="warning" dot icon={<ShieldAlert size={11} />}>
        Needs You
      </Badge>
    );
  }
  if (['SUCCESS', 'COMPLETED', 'SUCCEEDED'].includes(norm)) {
    return (
      <Badge variant="success" dot icon={<CheckCircle2 size={11} />}>
        Success
      </Badge>
    );
  }
  if (['FAILED', 'ERROR', 'TIMED_OUT'].includes(norm)) {
    return (
      <Badge variant="error" dot icon={<AlertCircle size={11} />}>
        Halted
      </Badge>
    );
  }
  if (['LEARNING', 'ANALYZING', 'UNDERSTANDING'].includes(norm)) {
    return (
      <Badge variant="purple" dot icon={<Sparkles size={11} />}>
        Learning
      </Badge>
    );
  }
  if (['PAUSED'].includes(norm)) {
    return (
      <Badge variant="neutral" dot icon={<Pause size={11} />}>
        Paused
      </Badge>
    );
  }

  return (
    <Badge variant="neutral" dot icon={<Clock size={11} />}>
      {norm.replace(/_/g, ' ')}
    </Badge>
  );
}

export function OperationalInlineStatus({
  state,
  className = '',
}: {
  state?: string;
  className?: string;
}) {
  const norm = state?.toUpperCase() || 'DORMANT';

  if (['ACTIVE', 'RUNNING', 'WORKING'].includes(norm)) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium text-[#00c2d4] ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-[#00c2d4] animate-pulse shrink-0" />
        Working
      </span>
    );
  }
  if (['WAITING_FOR_HUMAN', 'NEEDS_HELP', 'NEEDS_CLARIFICATION', 'EXCEPTION', 'ATTENTION'].includes(norm)) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium text-[#e8942a] ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-[#e8942a] shrink-0" />
        Attention
      </span>
    );
  }
  if (['SUCCESS', 'COMPLETED', 'SUCCEEDED'].includes(norm)) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium text-[#1db87a] ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-[#1db87a] shrink-0" />
        Completed
      </span>
    );
  }
  if (['FAILED', 'ERROR', 'TIMED_OUT'].includes(norm)) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium text-[#ef4444] ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444] shrink-0" />
        Halted
      </span>
    );
  }
  if (['LEARNING', 'ANALYZING', 'UNDERSTANDING'].includes(norm)) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium text-[#8b64d4] ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-[#8b64d4] animate-pulse shrink-0" />
        Learning
      </span>
    );
  }
  if (['PAUSED', 'WAITING'].includes(norm)) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium text-[#a5a8b5] ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-[#686b78] shrink-0" />
        Waiting
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium text-[#686b78] ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-[#4d505e] shrink-0" />
      Standby
    </span>
  );
}

