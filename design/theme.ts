// design/theme.ts
// ═══════════════════════════════════════════════════════════════
// EURO-OFFICE Design System — Central Theme Configuration
// v1.0 — 2026-02-17
// 
// Single source of truth for all visual tokens.
// All components reference this file — NEVER hardcode colors/sizes.
// ═══════════════════════════════════════════════════════════════

// ─── COLOR PALETTE ───────────────────────────────────────────

export const colors = {
  // Primary (Indigo → Violet gradient)
  primary: {
    50:  '#EEF2FF',
    100: '#E0E7FF',
    200: '#C7D2FE',
    300: '#A5B4FC',
    400: '#818CF8',
    500: '#6366F1',
    600: '#4F46E5',
    700: '#4338CA',
    800: '#3730A3',
    900: '#312E81',
    gradient: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
    gradientHover: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
  },

  // Secondary (Cyan)
  secondary: {
    50:  '#ECFEFF',
    100: '#CFFAFE',
    200: '#A5F3FC',
    300: '#67E8F9',
    400: '#22D3EE',
    500: '#06B6D4',
    600: '#0891B2',
    700: '#0E7490',
    800: '#155E75',
    900: '#164E63',
    gradient: 'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)',
  },

  // Success (Emerald)
  success: {
    50:  '#ECFDF5',
    100: '#D1FAE5',
    200: '#A7F3D0',
    300: '#6EE7B7',
    400: '#34D399',
    500: '#10B981',
    600: '#059669',
    700: '#047857',
    800: '#065F46',
    900: '#064E3B',
  },

  // Warning (Amber)
  warning: {
    50:  '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
  },

  // Error (Red)
  error: {
    50:  '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
  },

  // Surfaces
  surface: {
    background: '#F8FAFC',
    card: '#FFFFFF',
    sidebar: '#F1F5F9',
    overlay: 'rgba(15, 23, 42, 0.5)',
    overlayBlur: 'rgba(15, 23, 42, 0.3)',
  },

  // Text
  text: {
    heading: '#0F172A',
    body: '#334155',
    muted: '#94A3B8',
    inverse: '#FFFFFF',
    link: '#6366F1',
    linkHover: '#4F46E5',
  },

  // Borders
  border: {
    light: '#E2E8F0',
    medium: '#CBD5E1',
    heavy: '#94A3B8',
    focus: '#6366F1',
  },
} as const;

// ─── STEP COLORS (6 korakov, vsak s svojo identiteto) ────────

export const stepColors = {
  problemAnalysis:     { main: '#EF4444', light: '#FEF2F2', border: '#FECACA', text: '#991B1B' },
  projectIdea:         { main: '#6366F1', light: '#EEF2FF', border: '#C7D2FE', text: '#3730A3' },
  generalObjectives:   { main: '#06B6D4', light: '#ECFEFF', border: '#A5F3FC', text: '#155E75' },
  specificObjectives:  { main: '#8B5CF6', light: '#F5F3FF', border: '#DDD6FE', text: '#5B21B6' },
  activities:          { main: '#F59E0B', light: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
  expectedResults:     { main: '#10B981', light: '#ECFDF5', border: '#A7F3D0', text: '#065F46' },
} as const;

export type StepColorKey = keyof typeof stepColors;

// ─── SPACING SCALE ───────────────────────────────────────────

export const spacing = {
  xs:  '4px',
  sm:  '8px',
  md:  '12px',
  lg:  '16px',
  xl:  '20px',
  '2xl': '24px',
  '3xl': '32px',
  '4xl': '40px',
  '5xl': '48px',
  '6xl': '64px',
} as const;

// ─── SHADOW SCALE ────────────────────────────────────────────

export const shadows = {
  none: 'none',
  xs:   '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  sm:   '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
  md:   '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg:   '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  xl:   '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  '2xl':'0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  // Card specific
  card:      '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
  cardHover: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 4px 10px -4px rgba(0, 0, 0, 0.08)',
  // Glow effects (for primary actions)
  primaryGlow: '0 0 20px rgba(99, 102, 241, 0.3)',
  successGlow: '0 0 20px rgba(16, 185, 129, 0.3)',
} as const;

// ─── BORDER RADIUS ───────────────────────────────────────────

export const radii = {
  none: '0',
  sm:   '4px',
  md:   '6px',
  lg:   '8px',
  xl:   '12px',
  '2xl':'16px',
  '3xl':'24px',
  full: '9999px',
} as const;

// ─── Z-INDEX SCALE ───────────────────────────────────────────

export const zIndex = {
  base:       0,
  card:       1,
  dropdown:   10,
  sticky:     20,
  sidebar:    30,
  overlay:    40,
  modal:      50,
  loading:    60,
  tooltip:    70,
  toast:      80,
  max:        100,
} as const;

// ─── ANIMATION ───────────────────────────────────────────────

export const animation = {
  duration: {
    fast:    '150ms',
    normal:  '250ms',
    slow:    '350ms',
    slower:  '500ms',
  },
  easing: {
    default: 'cubic-bezier(0.4, 0, 0.2, 1)',
    in:      'cubic-bezier(0.4, 0, 1, 1)',
    out:     'cubic-bezier(0, 0, 0.2, 1)',
    inOut:   'cubic-bezier(0.4, 0, 0.2, 1)',
    bounce:  'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
} as const;

// ─── TYPOGRAPHY ──────────────────────────────────────────────

export const typography = {
  fontFamily: {
    sans:  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    mono:  "'JetBrains Mono', 'Fira Code', monospace",
  },
  fontSize: {
    xs:   '0.75rem',    // 12px
    sm:   '0.875rem',   // 14px
    base: '1rem',       // 16px
    lg:   '1.125rem',   // 18px
    xl:   '1.25rem',    // 20px
    '2xl':'1.5rem',     // 24px
    '3xl':'1.875rem',   // 30px
    '4xl':'2.25rem',    // 36px
  },
  fontWeight: {
    normal:   '400',
    medium:   '500',
    semibold: '600',
    bold:     '700',
    extrabold:'800',
  },
  lineHeight: {
    tight:  '1.25',
    normal: '1.5',
    relaxed:'1.75',
  },
} as const;

// ─── BREAKPOINTS ─────────────────────────────────────────────

export const breakpoints = {
  sm:  '640px',
  md:  '768px',
  lg:  '1024px',
  xl:  '1280px',
  '2xl':'1536px',
} as const;

// ─── ROLE BADGES ─────────────────────────────────────────────

export const roleBadge = {
  admin: {
    bg: colors.primary[100],
    text: colors.primary[700],
    border: colors.primary[200],
    icon: '🛡️',
    label: { en: 'Admin', si: 'Admin' },
  },
  user: {
    bg: colors.secondary[50],
    text: colors.secondary[700],
    border: colors.secondary[200],
    icon: '👤',
    label: { en: 'User', si: 'Uporabnik' },
  },
} as const;

// ─── CHART COLORS (for empirical data visualizations) ────────

export const chartColors = {
  // Sequential palette (for ordered data)
  sequential: ['#6366F1', '#818CF8', '#A5B4FC', '#C7D2FE', '#E0E7FF'],
  
  // Categorical palette (for distinct categories)
  categorical: [
    '#6366F1', // indigo
    '#06B6D4', // cyan
    '#10B981', // emerald
    '#F59E0B', // amber
    '#EF4444', // red
    '#8B5CF6', // violet
    '#EC4899', // pink
    '#14B8A6', // teal
  ],

  // Diverging palette (for comparison: good vs bad)
  diverging: {
    positive: '#10B981',
    neutral:  '#94A3B8',
    negative: '#EF4444',
  },

  // Risk heatmap
  riskMatrix: {
    low_low:     '#D1FAE5',
    low_med:     '#FEF3C7',
    low_high:    '#FDE68A',
    med_low:     '#CFFAFE',
    med_med:     '#FDE68A',
    med_high:    '#FECACA',
    high_low:    '#FEF3C7',
    high_med:    '#FECACA',
    high_high:   '#FEE2E2',
  },

  // Gradient fills for area/bar charts
  gradientFills: {
    primary:   { start: '#6366F1', end: '#8B5CF6' },
    secondary: { start: '#06B6D4', end: '#0891B2' },
    success:   { start: '#10B981', end: '#059669' },
    warning:   { start: '#F59E0B', end: '#D97706' },
    danger:    { start: '#EF4444', end: '#DC2626' },
  },
} as const;

// ─── DARK MODE COLORS ────────────────────────────────────────

export const darkColors = {
  primary: { ...colors.primary },
  secondary: { ...colors.secondary },
  success: { ...colors.success },
  warning: { ...colors.warning },
  error: { ...colors.error },

  surface: {
    background: '#0F172A',
    card: '#1E293B',
    sidebar: '#1A2332',
    overlay: 'rgba(0, 0, 0, 0.6)',
    overlayBlur: 'rgba(0, 0, 0, 0.5)',
  },

  text: {
    heading: '#F1F5F9',
    body: '#CBD5E1',
    muted: '#64748B',
    inverse: '#0F172A',
    link: '#818CF8',
    linkHover: '#A5B4FC',
  },

  border: {
    light: '#334155',
    medium: '#475569',
    heavy: '#64748B',
    focus: '#818CF8',
  },
} as const;

// ─── EXPORT COMPLETE THEME ───────────────────────────────────

export const theme = {
  colors,
  darkColors,
  stepColors,
  spacing,
  shadows,
  radii,
  zIndex,
  animation,
  typography,
  breakpoints,
  roleBadge,
  chartColors,
} as const;

export type Theme = typeof theme;
export default theme;
