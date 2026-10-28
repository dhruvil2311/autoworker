/**
 * Autoworker Enterprise Design Token System
 * Single source of truth for color, typography, spacing, radius, elevation, and motion.
 */

export const colors = {
  // Base Obsidian & Charcoal Digital Surfaces
  background: '#07080c',
  surfaceBase: '#0b0d13',
  surfaceSubtle: '#0f1118',
  surfaceElevated: '#141722',
  surfaceInteractive: '#1a1e2c',
  surfaceOverlay: 'rgba(11, 13, 19, 0.88)',

  // Borders & Dividers
  borderSubtle: 'rgba(255, 255, 255, 0.05)',
  borderDefault: 'rgba(255, 255, 255, 0.08)',
  borderHighlight: 'rgba(255, 255, 255, 0.16)',
  borderFocus: 'rgba(0, 194, 212, 0.45)',

  // Typography Colors
  textPrimary: '#f4f2ee',
  textSecondary: '#a5a8b5',
  textMuted: '#686b78',
  textDisabled: '#404350',
  textInverse: '#07080c',

  // Autoworker Core Accent (Restrained Electric Teal / Cyan)
  accent: {
    base: '#00c2d4',
    dim: 'rgba(0, 194, 212, 0.10)',
    subtle: 'rgba(0, 194, 212, 0.04)',
    border: 'rgba(0, 194, 212, 0.25)',
    hover: '#1ad3e4',
    glow: 'rgba(0, 194, 212, 0.35)',
  },

  // Semantic Status Colors
  status: {
    success: {
      text: '#1db87a',
      bg: 'rgba(29, 184, 122, 0.10)',
      border: 'rgba(29, 184, 122, 0.25)',
      dot: '#1db87a',
    },
    warning: {
      text: '#e8942a',
      bg: 'rgba(232, 148, 42, 0.10)',
      border: 'rgba(232, 148, 42, 0.28)',
      dot: '#e8942a',
    },
    error: {
      text: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.10)',
      border: 'rgba(239, 68, 68, 0.28)',
      dot: '#ef4444',
    },
    info: {
      text: '#3b82f6',
      bg: 'rgba(59, 130, 246, 0.10)',
      border: 'rgba(59, 130, 246, 0.25)',
      dot: '#3b82f6',
    },
    dormant: {
      text: '#76798a',
      bg: 'rgba(255, 255, 255, 0.04)',
      border: 'rgba(255, 255, 255, 0.08)',
      dot: '#4d505e',
    },
    learning: {
      text: '#8b64d4',
      bg: 'rgba(139, 100, 212, 0.10)',
      border: 'rgba(139, 100, 212, 0.28)',
      dot: '#8b64d4',
    },
  },

  // Department & Domain Semantic Accents
  department: {
    operations: '#00c2d4', // Cyan
    finance: '#1db87a',    // Emerald Green
    inventory: '#e8942a',  // Amber / Gold
    customer: '#8b64d4',   // Purple
    research: '#3b82f6',   // High-tech Blue
    supervision: '#00c2d4' // Teal
  }
} as const;

export const typography = {
  fontDisplay: "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontBody: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontMono: "'JetBrains Mono', 'Fira Code', Menlo, monospace",

  scale: {
    display: {
      fontSize: 'clamp(2.8rem, 5vw, 4.5rem)',
      lineHeight: '1.0',
      letterSpacing: '-0.04em',
      fontWeight: '700',
    },
    pageTitle: {
      fontSize: 'clamp(1.5rem, 2.5vw, 2.25rem)',
      lineHeight: '1.15',
      letterSpacing: '-0.03em',
      fontWeight: '700',
    },
    heading: {
      fontSize: '1.25rem',
      lineHeight: '1.3',
      letterSpacing: '-0.02em',
      fontWeight: '600',
    },
    subheading: {
      fontSize: '1rem',
      lineHeight: '1.4',
      letterSpacing: '-0.01em',
      fontWeight: '500',
    },
    body: {
      fontSize: '0.875rem',
      lineHeight: '1.55',
      letterSpacing: '-0.005em',
      fontWeight: '400',
    },
    bodySmall: {
      fontSize: '0.75rem',
      lineHeight: '1.5',
      letterSpacing: '0',
      fontWeight: '400',
    },
    label: {
      fontSize: '0.6875rem',
      lineHeight: '1.4',
      letterSpacing: '0.06em',
      fontWeight: '600',
      textTransform: 'uppercase' as const,
    },
    telemetry: {
      fontSize: '0.75rem',
      lineHeight: '1.4',
      letterSpacing: '0.02em',
      fontFamily: "'JetBrains Mono', monospace",
      fontWeight: '500',
    },
  },
} as const;

export const spacing = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const;

export const radii = {
  none: '0px',
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px',
  full: '9999px',
} as const;

export const elevation = {
  level0: 'none',
  level1: '0 1px 3px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)',
  level2: '0 8px 24px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)',
  level3: '0 24px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.12)',
  popover: '0 12px 36px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.1)',
} as const;

export const transitions = {
  fast: '150ms cubic-bezier(0.2, 0, 0, 1)',
  normal: '250ms cubic-bezier(0.2, 0, 0, 1)',
  slow: '400ms cubic-bezier(0.16, 1, 0.3, 1)',
} as const;
