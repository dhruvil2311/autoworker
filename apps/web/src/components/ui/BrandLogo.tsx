import React from 'react';

interface BrandLogoProps {
  variant?: 'nav' | 'hero' | 'badge' | 'compact';
  className?: string;
  showSubtitle?: boolean;
}

/**
 * Autoworker Institutional Brand Identity
 * Precision architectural monogram with crisp geometric linework,
 * paired with tracking-wide typography and enterprise tier indicator.
 * Eliminates cheap "vibe-coded" neon square styling.
 */
export function BrandLogo({ variant = 'nav', className = '', showSubtitle = true }: BrandLogoProps) {
  if (variant === 'compact') {
    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="shrink-0"
        >
          {/* Architectural Hexagonal / Chevron Monogram */}
          <polygon
            points="16,2 30,10 30,22 16,30 2,22 2,10"
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="1.5"
            fill="#0f121a"
          />
          {/* Interlocking 'A' & 'W' Structural Pillars */}
          <path
            d="M8 21L16 7L24 21"
            stroke="#f4f2ee"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M11 16H21"
            stroke="#f4f2ee"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M13 21L16 14L19 21"
            stroke="#3b82f6"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="font-semibold text-xs tracking-wider text-[#f4f2ee] font-sans">
          AUTOWORKER
        </span>
      </div>
    );
  }

  if (variant === 'hero') {
    return (
      <div className={`flex flex-col items-center text-center ${className}`}>
        <div className="relative mb-4">
          <svg
            width="56"
            height="56"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)]"
          >
            {/* Outer Architectural Facet */}
            <polygon
              points="16,2 30,10 30,22 16,30 2,22 2,10"
              stroke="rgba(255,255,255,0.25)"
              strokeWidth="1.5"
              fill="#0e1118"
            />
            {/* Inner Structural Struts */}
            <path
              d="M16 2V14M30 10L16 14M2 10L16 14"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
            />
            {/* Monumental 'A' & 'W' Nexus */}
            <path
              d="M7 22L16 6L25 22"
              stroke="#f4f2ee"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M10 16.5H22"
              stroke="#f4f2ee"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M12.5 22L16 14.5L19.5 22"
              stroke="#60a5fa"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="16" cy="6" r="1.5" fill="#f4f2ee" />
          </svg>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-xl md:text-2xl font-bold tracking-[0.14em] text-[#f4f2ee] font-sans">
            AUTOWORKER
          </span>
          <span className="text-[10px] font-mono font-semibold tracking-widest px-2 py-0.5 rounded bg-white/[0.06] border border-white/[0.12] text-[#a3a8b8] uppercase">
            ENTERPRISE HQ
          </span>
        </div>

        {showSubtitle && (
          <p className="text-xs text-[#8e92a4] mt-1.5 font-medium tracking-wide">
            Autonomous Workforce Supervision System · Enterprise Operations
          </p>
        )}
      </div>
    );
  }

  // Default: 'nav'
  return (
    <div className={`inline-flex items-center gap-2.5 no-underline select-none ${className}`}>
      <svg
        width="26"
        height="26"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 transition-transform duration-200 group-hover:scale-105"
      >
        <polygon
          points="16,2 30,10 30,22 16,30 2,22 2,10"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="1.5"
          fill="#11141d"
        />
        <path
          d="M8 21L16 7L24 21"
          stroke="#f4f2ee"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M11 16H21"
          stroke="#f4f2ee"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M13 21L16 14.5L19 21"
          stroke="#3b82f6"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div className="flex items-center gap-2">
        <span className="font-bold text-xs tracking-[0.1em] text-[#f4f2ee] font-sans">
          AUTOWORKER
        </span>
        <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-white/[0.05] border border-white/[0.08] text-[#8e94a0] tracking-wider uppercase">
          HQ
        </span>
      </div>
    </div>
  );
}
