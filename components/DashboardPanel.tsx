// components/DashboardPanel.tsx
// ═══════════════════════════════════════════════════════════════
// Persistent right-side dashboard panel — always visible.
// v2.1 — 2026-02-18
//   - FIX: Empty projects now correctly show 0% completeness
//   - FIX: skeleton arrays, default durationMonths, empty readinessLevels
//          no longer inflate completeness percentage
//   - Charts no longer clipped (removed overflow:hidden, proper width)
//   - Full stats grid — Gen.Obj, Spec.Obj, WPs, Tasks, Outputs,
//          Outcomes, Impacts, KERs, Risks (all with counts)
//   - Drag & drop reordering of stat items
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { extractStructuralData } from '../services/DataExtractionService.ts';
import ChartRenderer from './ChartRenderer.tsx';
import { lightColors, darkColors, shadows, radii, spacing, typography, animation } from '../design/theme.ts';
import { getThemeMode, onThemeChange } from '../services/themeService.ts';
import { ProgressRing } from '../design/index.ts';

// ─── Props ───────────────────────────────────────────────────

interface DashboardPanelProps {
  projectData: any;
  language: 'en' | 'si';
  onCollapseChange?: (collapsed: boolean) => void;
}

// ─── Professional SVG Icons ─────────────────────────────────

const Icons = {
  document: (c: string) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  tag: (c: string) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  ),
  calendar: (c: string) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  play: (c: string) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="10 8 16 12 10 16 10 8" />
    </svg>
  ),
  flag: (c: string) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  ),
  crosshair: (c: string) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="22" y1="12" x2="18" y2="12" /><line x1="6" y1="12" x2="2" y2="12" />
      <line x1="12" y1="6" x2="12" y2="2" /><line x1="12" y1="22" x2="12" y2="18" />
    </svg>
  ),
  layers: (c: string) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  ),
  checkSquare: (c: string) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  package: (c: string) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  trending: (c: string) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  zap: (c: string) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  key: (c: string) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  ),
  shield: (c: string) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  chevronLeft: (c: string) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  chevronRight: (c: string) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  dashboard: (c: string) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
  grip: (c: string) => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill={c} stroke="none">
      <circle cx="9" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" /><circle cx="15" cy="19" r="1.5" />
    </svg>
  ),
};

// ─── Helper: Check if a value represents real user-entered content ──
// v2.2 FIX: Skip default enum fields (category, likelihood, impact, type)
// and id-like fields — these are skeleton defaults, not user content

const SKIP_KEYS = new Set([
  'id', 'project_id', 'created_at', 'updated_at',
  'category', 'likelihood', 'impact', 'type', 'dependencies',
]);

const hasRealStringContent = (v: any): boolean =>
  typeof v === 'string' && v.trim().length > 0;

const arrayHasRealContent = (arr: any[]): boolean => {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  return arr.some((item: any) => {
    if (typeof item === 'string') return item.trim().length > 0;
    if (typeof item !== 'object' || item === null) return false;
    return Object.entries(item).some(([k, v]) => {
      if (SKIP_KEYS.has(k)) return false;
      if (typeof v === 'string') return v.trim().length > 0;
      // DO NOT count numbers as real content (durationMonths:24, etc.)
      if (Array.isArray(v)) return arrayHasRealContent(v);
      return false;
    });
  });
};

const objectHasRealContent = (obj: any, skipKeys: Set<string>): boolean => {
  if (!obj || typeof obj !== 'object') return false;
  return Object.entries(obj).some(([k, v]) => {
    if (skipKeys.has(k) || SKIP_KEYS.has(k)) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    if (Array.isArray(v)) return arrayHasRealContent(v);
    if (typeof v === 'object' && v !== null) return objectHasRealContent(v, skipKeys);
    return false;
  });
};

const objectHasRealContent = (obj: any, skipKeys: Set<string>): boolean => {
  if (!obj || typeof obj !== 'object') return false;
  return Object.entries(obj).some(([k, v]) => {
    if (skipKeys.has(k)) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    if (typeof v === 'number') return true;
    if (Array.isArray(v)) return arrayHasRealContent(v);
    if (typeof v === 'object' && v !== null) return objectHasRealContent(v, skipKeys);
    return false;
  });
};

// ─── Completeness calculator ─────────────────────────────────
// v2.1 — Correctly returns 0% for empty/skeleton projects

const calculateCompleteness = (projectData: any): number => {
  if (!projectData) return 0;

  // Fields to skip — these are metadata or default values, not user content
  const SKIP = new Set([
    'startDate', 'durationMonths', '_calculatedEndDate', '_projectTimeframe',
    'id', 'project_id', 'created_at', 'updated_at',
  ]);

  // Define what "filled" means for each section
  const sectionChecks: { key: string; check: (data: any) => boolean }[] = [
    {
      key: 'problemAnalysis',
      check: (d) => {
        if (!d) return false;
        const hasCoreTitle = hasRealStringContent(d.coreProblem?.title);
        const hasCoreDesc = hasRealStringContent(d.coreProblem?.description);
        const hasCauses = arrayHasRealContent(d.causes);
        const hasConsequences = arrayHasRealContent(d.consequences);
        return hasCoreTitle || hasCoreDesc || hasCauses || hasConsequences;
      },
    },
    {
      key: 'projectIdea',
      check: (d) => {
        if (!d) return false;
        return (
          hasRealStringContent(d.projectTitle) ||
          hasRealStringContent(d.projectAcronym) ||
          hasRealStringContent(d.mainAim) ||
          hasRealStringContent(d.stateOfTheArt) ||
          hasRealStringContent(d.proposedSolution) ||
          arrayHasRealContent(d.policies) ||
          (d.readinessLevels && (
            d.readinessLevels.TRL?.level !== null ||
            d.readinessLevels.SRL?.level !== null ||
            d.readinessLevels.ORL?.level !== null ||
            d.readinessLevels.LRL?.level !== null
          ))
        );
      },
    },
    {
      key: 'generalObjectives',
      check: (d) => arrayHasRealContent(d),
    },
    {
      key: 'specificObjectives',
      check: (d) => arrayHasRealContent(d),
    },
    {
      key: 'projectManagement',
      check: (d) => {
        if (!d) return false;
        return hasRealStringContent(d.description) || objectHasRealContent(d.structure, SKIP);
      },
    },
    {
      key: 'activities',
      check: (d) => {
        if (!Array.isArray(d)) return false;
        return d.some((wp: any) =>
          hasRealStringContent(wp.title) ||
          arrayHasRealContent(wp.tasks) ||
          arrayHasRealContent(wp.milestones) ||
          arrayHasRealContent(wp.deliverables)
        );
      },
    },
    { key: 'outputs', check: (d) => arrayHasRealContent(d) },
    { key: 'outcomes', check: (d) => arrayHasRealContent(d) },
    { key: 'impacts', check: (d) => arrayHasRealContent(d) },
    { key: 'risks', check: (d) => arrayHasRealContent(d) },
    { key: 'kers', check: (d) => arrayHasRealContent(d) },
  ];

  let filledCount = 0;
  let totalCount = 0;

  for (const { key, check } of sectionChecks) {
    const data = projectData?.[key];
    if (data === undefined || data === null) continue;
    totalCount++;
    if (check(data)) filledCount++;
  }

  return totalCount === 0 ? 0 : Math.round((filledCount / totalCount) * 100);
};

// ─── Stat item type ──────────────────────────────────────────

interface StatItem {
  id: string;
  labelEN: string;
  labelSI: string;
  icon: (c: string) => React.ReactNode;
  color: string;
  getValue: (pd: any) => number;
}

// ─── Default stat definitions ────────────────────────────────

const DEFAULT_STAT_ORDER: StatItem[] = [
  {
    id: 'genObj',
    labelEN: 'General Objectives',
    labelSI: 'Splošni cilji',
    icon: Icons.flag,
    color: 'primary',
    getValue: (pd) => pd?.generalObjectives?.filter((o: any) => o.title?.trim()).length || 0,
  },
  {
    id: 'specObj',
    labelEN: 'Specific Objectives',
    labelSI: 'Specifični cilji',
    icon: Icons.crosshair,
    color: 'secondary',
    getValue: (pd) => pd?.specificObjectives?.filter((o: any) => o.title?.trim()).length || 0,
  },
  {
    id: 'wps',
    labelEN: 'Work Packages',
    labelSI: 'Delovni sklopi',
    icon: Icons.layers,
    color: 'primary',
    getValue: (pd) => pd?.activities?.filter((wp: any) => wp.title?.trim()).length || 0,
  },
  {
    id: 'tasks',
    labelEN: 'Tasks',
    labelSI: 'Naloge',
    icon: Icons.checkSquare,
    color: 'primary',
    getValue: (pd) => {
      if (!pd?.activities) return 0;
      return pd.activities.reduce((sum: number, wp: any) =>
        sum + (wp.tasks?.filter((t: any) => t.title?.trim()).length || 0), 0);
    },
  },
  {
    id: 'outputs',
    labelEN: 'Outputs',
    labelSI: 'Rezultati',
    icon: Icons.package,
    color: 'success',
    getValue: (pd) => pd?.outputs?.filter((o: any) => o.title?.trim()).length || 0,
  },
  {
    id: 'outcomes',
    labelEN: 'Outcomes',
    labelSI: 'Učinki',
    icon: Icons.trending,
    color: 'success',
    getValue: (pd) => pd?.outcomes?.filter((o: any) => o.title?.trim()).length || 0,
  },
  {
    id: 'impacts',
    labelEN: 'Impacts',
    labelSI: 'Vplivi',
    icon: Icons.zap,
    color: 'warning',
    getValue: (pd) => pd?.impacts?.filter((o: any) => o.title?.trim()).length || 0,
  },
  {
    id: 'kers',
    labelEN: 'KERs',
    labelSI: 'KERs',
    icon: Icons.key,
    color: 'success',
    getValue: (pd) => pd?.kers?.filter((k: any) => k.title?.trim()).length || 0,
  },
  {
    id: 'risks',
    labelEN: 'Risks',
    labelSI: 'Tveganja',
    icon: Icons.shield,
    color: 'warning',
    getValue: (pd) => pd?.risks?.filter((r: any) => r.title?.trim()).length || 0,
  },
];

// ─── Local storage key for stat order ────────────────────────

const STAT_ORDER_KEY = 'dashboard_stat_order';

const loadStatOrder = (): string[] => {
  try {
    const saved = localStorage.getItem(STAT_ORDER_KEY);
    if (saved) {
      const ids = JSON.parse(saved);
      if (Array.isArray(ids) && ids.length === DEFAULT_STAT_ORDER.length) return ids;
    }
  } catch {}
  return DEFAULT_STAT_ORDER.map(s => s.id);
};

const saveStatOrder = (ids: string[]) => {
  try { localStorage.setItem(STAT_ORDER_KEY, JSON.stringify(ids)); } catch {}
};

// ─── Component ───────────────────────────────────────────────

const DashboardPanel: React.FC<DashboardPanelProps> = ({ projectData, language, onCollapseChange }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDark, setIsDark] = useState(getThemeMode() === 'dark');
  const [statOrder, setStatOrder] = useState<string[]>(loadStatOrder);

  // Drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);

  useEffect(() => {
    const unsub = onThemeChange((m) => setIsDark(m === 'dark'));
    return unsub;
  }, []);

  const colors = isDark ? darkColors : lightColors;
  const PANEL_WIDTH = 300;
  const COLLAPSED_WIDTH = 52;

  const handleToggle = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    onCollapseChange?.(next);
  };

  const completeness = useMemo(() => calculateCompleteness(projectData), [projectData]);

  const pi = projectData?.projectIdea;

  // Build ordered stats from saved order
  const orderedStats = useMemo(() => {
    const map = new Map(DEFAULT_STAT_ORDER.map(s => [s.id, s]));
    const ordered = statOrder
      .map(id => map.get(id))
      .filter(Boolean) as StatItem[];
    DEFAULT_STAT_ORDER.forEach(s => {
      if (!ordered.find(o => o.id === s.id)) ordered.push(s);
    });
    return ordered;
  }, [statOrder]);

  // Drag handlers
  const handleDragStart = useCallback((idx: number) => {
    setDragIdx(idx);
    dragRef.current = idx;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setOverIdx(idx);
  }, []);

  const handleDrop = useCallback((idx: number) => {
    const from = dragRef.current;
    if (from === null || from === idx) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }
    const newOrder = [...statOrder];
    const [moved] = newOrder.splice(from, 1);
    newOrder.splice(idx, 0, moved);
    setStatOrder(newOrder);
    saveStatOrder(newOrder);
    setDragIdx(null);
    setOverIdx(null);
  }, [statOrder]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setOverIdx(null);
  }, []);

  const structuralCharts = useMemo(() => extractStructuralData(projectData), [projectData]);

  const colorMap: Record<string, string> = {
    primary: colors.primary[500],
    secondary: colors.secondary[500],
    warning: colors.warning[500],
    success: colors.success[500],
  };

  const t = language === 'si' ? {
    title: 'Dashboard',
    projectTitle: 'Naziv',
    acronym: 'Akronim',
    duration: 'Trajanje',
    startDate: 'Začetek',
    months: 'mes.',
    stats: 'Statistika',
    charts: 'Grafike',
    dragHint: 'Povleci za preureditev',
  } : {
    title: 'Dashboard',
    projectTitle: 'Title',
    acronym: 'Acronym',
    duration: 'Duration',
    startDate: 'Start',
    months: 'mo.',
    stats: 'Statistics',
    charts: 'Charts',
    dragHint: 'Drag to reorder',
  };

  // ─── Collapsed view ────────────────────────────────────────

  if (isCollapsed) {
    return (
      <div style={{
        width: COLLAPSED_WIDTH,
        height: '100%',
        background: colors.surface.card,
        borderLeft: `1px solid ${colors.border.light}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: spacing.md,
        gap: spacing.sm,
        flexShrink: 0,
        position: 'relative',
        transition: `width 0.3s cubic-bezier(0.4, 0, 0.2, 1)`,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        <button onClick={handleToggle} title="Expand dashboard" style={{
          width: 32, height: 32, borderRadius: radii.md,
          border: `1px solid ${colors.border.light}`, background: colors.surface.sidebar,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: colors.text.muted, transition: `all ${animation.duration.fast}`,
          flexShrink: 0,
        }}
          onMouseEnter={e => { e.currentTarget.style.background = colors.primary[50]; e.currentTarget.style.color = colors.primary[600]; }}
          onMouseLeave={e => { e.currentTarget.style.background = colors.surface.sidebar; e.currentTarget.style.color = colors.text.muted; }}
        >
          {Icons.chevronLeft(colors.text.muted)}
        </button>

        <ProgressRing value={completeness} size={36} strokeWidth={4}
          color={completeness >= 80 ? colors.success[500] : completeness >= 40 ? colors.warning[500] : colors.error[500]}
          label={`${completeness}`}
        />

        {/* Mini stats — all categories */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
          {orderedStats.map(stat => {
            const val = stat.getValue(projectData);
            return (
              <div key={stat.id} title={language === 'si' ? stat.labelSI : stat.labelEN}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {stat.icon(colorMap[stat.color] || colors.primary[500])}
                <span style={{ fontSize: '9px', fontWeight: 700, color: colors.text.heading, marginTop: '1px' }}>{val}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Expanded view ─────────────────────────────────────────

  const MetaRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0',
    }}>
      <div style={{ flexShrink: 0, opacity: 0.7 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '10px', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
        <div style={{
          fontSize: '12px', fontWeight: 600, color: colors.text.heading,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{value || '—'}</div>
      </div>
    </div>
  );

  return (
    <div style={{
      width: PANEL_WIDTH,
      height: '100%',
      background: colors.surface.card,
      borderLeft: `1px solid ${colors.border.light}`,
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflow: 'hidden',
      transition: `width 0.3s cubic-bezier(0.4, 0, 0.2, 1)`,
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${colors.border.light}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {Icons.dashboard(colors.primary[500])}
          <span style={{ fontSize: '13px', fontWeight: 700, color: colors.text.heading }}>{t.title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ProgressRing value={completeness} size={32} strokeWidth={3}
            color={completeness >= 80 ? colors.success[500] : completeness >= 40 ? colors.warning[500] : colors.error[500]}
            label={`${completeness}`}
          />
          <button onClick={handleToggle} title="Collapse dashboard" style={{
            width: 28, height: 28, borderRadius: radii.md,
            border: `1px solid ${colors.border.light}`, background: 'transparent',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: colors.text.muted, transition: `all ${animation.duration.fast}`,
          }}
            onMouseEnter={e => { e.currentTarget.style.background = colors.primary[50]; e.currentTarget.style.color = colors.primary[600]; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = colors.text.muted; }}
          >
            {Icons.chevronRight(colors.text.muted)}
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Project meta */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <MetaRow icon={Icons.document(colors.primary[500])} label={t.projectTitle} value={pi?.projectTitle || ''} />
          <MetaRow icon={Icons.tag(colors.secondary[500])} label={t.acronym} value={pi?.projectAcronym || ''} />
          <MetaRow icon={Icons.calendar(colors.primary[500])} label={t.duration} value={pi?.durationMonths ? `${pi.durationMonths} ${t.months}` : ''} />
          <MetaRow icon={Icons.play(colors.success[500])} label={t.startDate} value={pi?.startDate || ''} />
        </div>

        {/* Separator */}
        <hr style={{ border: 'none', borderTop: `1px solid ${colors.border.light}`, margin: 0 }} />

        {/* Section label + drag hint */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t.stats}
          </span>
          <span style={{ fontSize: '9px', color: colors.text.muted, opacity: 0.6 }}>
            {t.dragHint}
          </span>
        </div>

        {/* Stats — draggable grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {orderedStats.map((stat, idx) => {
            const val = stat.getValue(projectData);
            const isDragging = dragIdx === idx;
            const isOver = overIdx === idx;
            const iconColor = colorMap[stat.color] || colors.primary[500];

            return (
              <div
                key={stat.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={() => handleDrop(idx)}
                onDragEnd={handleDragEnd}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '5px 8px',
                  borderRadius: radii.md,
                  background: isOver
                    ? (isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)')
                    : isDragging
                      ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)')
                      : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                  opacity: isDragging ? 0.5 : 1,
                  cursor: 'grab',
                  transition: `background ${animation.duration.fast}, opacity ${animation.duration.fast}`,
                  borderTop: isOver && dragIdx !== null && dragIdx < idx ? `2px solid ${colors.primary[400]}` : '2px solid transparent',
                  borderBottom: isOver && dragIdx !== null && dragIdx > idx ? `2px solid ${colors.primary[400]}` : '2px solid transparent',
                }}
              >
                {/* Drag handle */}
                <div style={{ flexShrink: 0, opacity: 0.3, cursor: 'grab' }}>
                  {Icons.grip(colors.text.muted)}
                </div>
                {/* Icon */}
                <div style={{ flexShrink: 0 }}>
                  {stat.icon(iconColor)}
                </div>
                {/* Label */}
                <span style={{
                  flex: 1, fontSize: '11px', color: colors.text.body,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {language === 'si' ? stat.labelSI : stat.labelEN}
                </span>
                {/* Value */}
                <span style={{
                  fontSize: '13px', fontWeight: 700, color: val > 0 ? colors.text.heading : colors.text.muted,
                  minWidth: '20px', textAlign: 'right',
                }}>
                  {val}
                </span>
              </div>
            );
          })}
        </div>

        {/* Separator */}
        <hr style={{ border: 'none', borderTop: `1px solid ${colors.border.light}`, margin: 0 }} />

        {/* Charts section label */}
        {structuralCharts.length > 0 && (
          <span style={{ fontSize: '10px', fontWeight: 700, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t.charts}
          </span>
        )}

        {/* Mini charts — with proper width to prevent clipping */}
        {structuralCharts.map(chart => (
          <div key={chart.id} style={{
            borderRadius: radii.lg,
            border: `1px solid ${colors.border.light}`,
            padding: '8px',
            background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
            width: '100%',
            boxSizing: 'border-box',
          }}>
            <ChartRenderer
              data={chart}
              height={160}
              showTitle={true}
              showSource={false}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default DashboardPanel;
