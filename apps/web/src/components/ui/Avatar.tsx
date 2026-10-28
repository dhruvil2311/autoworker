import React from 'react';
import { User, Cpu, Zap, Globe, Building2 } from 'lucide-react';

export type EntityType = 'human' | 'worker' | 'automation' | 'external';

export interface IdentityBadgeProps {
  type: EntityType;
  title: string;
  subtitle?: string;
  department?: string;
  version?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function IdentityBadge({
  type,
  title,
  subtitle,
  department,
  version,
  size = 'md',
  className = '',
}: IdentityBadgeProps) {
  const iconMap: Record<EntityType, { icon: React.ReactNode; bg: string; border: string; color: string; label: string }> = {
    human: {
      icon: <User size={size === 'sm' ? 12 : 14} />,
      bg: 'rgba(255, 255, 255, 0.06)',
      border: 'rgba(255, 255, 255, 0.12)',
      color: '#f4f2ee',
      label: 'Supervisor',
    },
    worker: {
      icon: <Cpu size={size === 'sm' ? 12 : 14} />,
      bg: 'rgba(0, 194, 212, 0.12)',
      border: 'rgba(0, 194, 212, 0.28)',
      color: '#00c2d4',
      label: 'Digital Worker',
    },
    automation: {
      icon: <Zap size={size === 'sm' ? 12 : 14} />,
      bg: 'rgba(232, 148, 42, 0.12)',
      border: 'rgba(232, 148, 42, 0.28)',
      color: '#e8942a',
      label: 'Automation',
    },
    external: {
      icon: <Globe size={size === 'sm' ? 12 : 14} />,
      bg: 'rgba(59, 130, 246, 0.12)',
      border: 'rgba(59, 130, 246, 0.28)',
      color: '#3b82f6',
      label: 'Integration',
    },
  };

  const meta = iconMap[type];
  const avatarSize = size === 'sm' ? 'w-6 h-6' : size === 'lg' ? 'w-10 h-10' : 'w-8 h-8';

  return (
    <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
      <div
        className={`${avatarSize} rounded shrink-0 flex items-center justify-center transition-all`}
        style={{
          background: meta.bg,
          border: `1px solid ${meta.border}`,
          color: meta.color,
        }}
      >
        {meta.icon}
      </div>
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#f4f2ee] truncate">{title}</span>
          {version && (
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[rgba(0,194,212,0.12)] text-[#00c2d4] border border-[rgba(0,194,212,0.25)]">
              {version}
            </span>
          )}
          {department && (
            <span className="text-[9px] uppercase font-semibold tracking-wider text-[#8e92a4]">
              · {department}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-[#8e92a4] truncate">
          <span className="uppercase text-[9px] font-semibold tracking-wider" style={{ color: meta.color }}>
            {meta.label}
          </span>
          {subtitle && <span>— {subtitle}</span>}
        </div>
      </div>
    </div>
  );
}
