import React from 'react';
import { motion } from 'framer-motion';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
  variant?: 'pill' | 'underline';
}

export function Tabs({
  items,
  activeId,
  onChange,
  className = '',
  variant = 'pill',
}: TabsProps) {
  return (
    <div
      role="tablist"
      className={`flex items-center gap-1 select-none ${
        variant === 'pill'
          ? 'bg-[#0b0d13] p-1 rounded border border-[rgba(255,255,255,0.06)]'
          : 'border-b border-[rgba(255,255,255,0.06)] gap-4'
      } ${className}`}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;

        if (variant === 'underline') {
          return (
            <button
              key={item.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(item.id)}
              className={`relative pb-2.5 pt-1 text-xs font-medium transition-colors flex items-center gap-2 cursor-pointer ${
                isActive ? 'text-[#f4f2ee] font-semibold' : 'text-[#8e92a4] hover:text-[#f4f2ee]'
              }`}
            >
              {item.icon && <span className="shrink-0 text-current">{item.icon}</span>}
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                    isActive
                      ? 'bg-[rgba(0,194,212,0.15)] text-[#00c2d4]'
                      : 'bg-[rgba(255,255,255,0.06)] text-[#8e92a4]'
                  }`}
                >
                  {item.badge}
                </span>
              )}
              {isActive && (
                <motion.div
                  layoutId="tabs-underline"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#00c2d4]"
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}
            </button>
          );
        }

        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.id)}
            className={`relative px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-2 cursor-pointer z-10 ${
              isActive ? 'text-[#00c2d4] font-semibold' : 'text-[#8e92a4] hover:text-[#f4f2ee]'
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="tabs-pill"
                className="absolute inset-0 rounded bg-[rgba(0,194,212,0.12)] border border-[rgba(0,194,212,0.3)] -z-10"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            {item.icon && <span className="shrink-0 text-current">{item.icon}</span>}
            <span>{item.label}</span>
            {item.badge !== undefined && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                  isActive
                    ? 'bg-[rgba(0,194,212,0.2)] text-[#00c2d4]'
                    : 'bg-[rgba(255,255,255,0.06)] text-[#8e92a4]'
                }`}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
