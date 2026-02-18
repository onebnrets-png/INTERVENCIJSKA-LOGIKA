// components/DashboardPanel.tsx
// ═══════════════════════════════════════════════════════════════
// Persistent right-side dashboard panel
// v2.3 — 2026-02-18
//   - FIX: Collapse button now works! Internal state management
//   - FIX: Toggle button styled as matching pill (same as Sidebar)
//   - FIX: Props simplified — panel manages its own isCollapsed state
//   - Previous (v2.2): completeness fix, SKIP_KEYS, drag-and-drop
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { extractStructuralData } from '../services/DataExtractionService.ts';
import ChartRenderer from './ChartRenderer.tsx';
import { theme } from '../design/theme.ts';
import { getThemeMode, onThemeChange } from '../services/themeService.ts';
import { ProgressRing } from '../design/index.ts';
import { colors as lightColors, darkColors, shadows, radii, spacing, animation, typography, zIndex } from '../design/theme.ts';

// ─── Props ───────────────────────────────────────────────────

interface DashboardPanelProps {
  projectData: any;
  language: 'en' | 'si';
  onCollapseChange?: (collapsed: boolean) => void;
}

// ─── SVG Icons ───────────────────────────────────────────────

const icons = {
  document: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  tag: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  calendar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  play: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>,
  flag: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
  crosshair: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>,
  layers: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  checkSquare: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  package: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  trending: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  zap: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  key: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  shield: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  chevronLeft: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  chevronRight: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  dashboard: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  grip: <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="4" r="2"/><circle cx="16" cy="4" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="20" r="2"/><circle cx="16" cy="20" r="2"/></svg>,
};

// ─── Helpers: detect real user-entered content ───────────────

const SKIP_KEYS = new Set([
  'id', 'project_id', 'created_at', 'updated_at',
  'category', 'likelihood', 'impact', 'type', 'dependencies',
  'startDate', 'durationMonths', '_calculatedEndDate', '_projectTimeframe',
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
      if (Array.isArray(v)) return arrayHasRealContent(v);
      return false;
    });
  });
};

const objectHasRealContent = (obj: any): boolean => {
  if (!obj || typeof obj !== 'object') return false;
  if (Array.isArray(obj)) return arrayHasRealContent(obj);
  return Object.entries(obj).some(([k, v]) => {
    if (SKIP_KEYS.has(k)) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    if (Array.isArray(v)) return arrayHasRealContent(v);
    if (typeof v === 'object' && v !== null) return objectHasRealContent(v);
    return false;
  });
};

// ─── Completeness calculation ────────────────────────────────

const calculateCompleteness = (projectData: any): number => {
  if (!projectData) return 0;

  const sectionChecks: { key: string; check: (data: any) => boolean }[] = [
    {
      key: 'problemAnalysis',
      check: (d) => {
        if (!d) return false;
        return (
          hasRealStringContent(d.coreProblem?.title) ||
          hasRealStringContent(d.coreProblem?.description) ||
          arrayHasRealContent(d.causes) ||
          arrayHasRealContent(d.consequences)
        );
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
          (d.readinessLevels && [
            d.readinessLevels.TRL,
            d.readinessLevels.SRL,
            d.readinessLevels.ORL,
            d.readinessLevels.LRL,
          ].some((r: any) => typeof r?.level === 'number' && r.level > 0))
        );
      },
    },
    { key: 'generalObjectives', check: (d) => arrayHasRealContent(d) },
    { key: 'specificObjectives', check: (d) => arrayHasRealContent(d) },
    {
      key: 'projectManagement',
      check: (d) => {
        if (!d) return false;
        return hasRealStringContent(d.description) || objectHasRealContent(d.structure);
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
    {
      key: 'risks',
      check: (d) => {
        if (!Array.isArray(d)) return false;
        return d.some((r: any) =>
          hasRealStringContent(r.title) ||
          hasRealStringContent(r.description) ||
          hasRealStringContent(r.mitigation)
        );
      },
    },
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

// ─── Stat definitions ────────────────────────────────────────

interface StatItem {
  id: string;
  labelEn: string;
  labelSi: string;
  icon: React.ReactNode;
  getValue: (data: any) => number;
  color: string;
}

const STAT_DEFINITIONS: StatItem[] = [
  { id: 'genObj', labelEn: 'General Objectives', labelSi: 'Splošni cilji', icon: icons.crosshair, getValue: (d) => d?.generalObjectives?.filter((o: any) => hasRealStringContent(o.title)).length || 0, color: theme.colors.primary[500] },
  { id: 'specObj', labelEn: 'Specific Objectives', labelSi: 'Specifični cilji', icon: icons.flag, getValue: (d) => d?.specificObjectives?.filter((o: any) => hasRealStringContent(o.title)).length || 0, color: theme.colors.secondary[500] },
  { id: 'wp', labelEn: 'Work Packages', labelSi: 'Delovni sklopi', icon: icons.layers, getValue: (d) => d?.activities?.filter((wp: any) => hasRealStringContent(wp.title)).length || 0, color: theme.colors.success[500] },
  { id: 'tasks', labelEn: 'Tasks', labelSi: 'Naloge', icon: icons.checkSquare, getValue: (d) => { let c = 0; d?.activities?.forEach((wp: any) => { c += wp.tasks?.filter((t: any) => hasRealStringContent(t.title)).length || 0; }); return c; }, color: theme.colors.warning[500] },
  { id: 'outputs', labelEn: 'Outputs', labelSi: 'Rezultati', icon: icons.package, getValue: (d) => d?.outputs?.filter((o: any) => hasRealStringContent(o.title) || hasRealStringContent(o.description)).length || 0, color: theme.colors.error[500] },
  { id: 'outcomes', labelEn: 'Outcomes', labelSi: 'Učinki', icon: icons.trending, getValue: (d) => d?.outcomes?.filter((o: any) => hasRealStringContent(o.title) || hasRealStringContent(o.description)).length || 0, color: theme.colors.primary[300] },
  { id: 'impacts', labelEn: 'Impacts', labelSi: 'Vplivi', icon: icons.zap, getValue: (d) => d?.impacts?.filter((o: any) => hasRealStringContent(o.title) || hasRealStringContent(o.description)).length || 0, color: theme.colors.secondary[300] },
  { id: 'kers', labelEn: 'KERs', labelSi: 'KER-i', icon: icons.key, getValue: (d) => d?.kers?.filter((k: any) => hasRealStringContent(k.title) || hasRealStringContent(k.result)).length || 0, color: theme.colors.success[300] },
  { id: 'risks', labelEn: 'Risks', labelSi: 'Tveganja', icon: icons.shield, getValue: (d) => d?.risks?.filter((r: any) => hasRealStringContent(r.title)).length || 0, color: theme.colors.warning[300] },
];

const STORAGE_KEY = 'dashboard_stat_order';

// ─── Constants ───────────────────────────────────────────────

const COLLAPSED_WIDTH = 52;
const EXPANDED_WIDTH = 300;

// ─── Component ───────────────────────────────────────────────

const DashboardPanel: React.FC<DashboardPanelProps> = ({
  projectData, language, onCollapseChange,
}) => {
  // ★ v2.3: Internal collapse state — panel manages itself
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDark, setIsDark] = useState(getThemeMode() === 'dark');

  useEffect(() => {
    const unsub = onThemeChange((m) => setIsDark(m === 'dark'));
    return unsub;
  }, []);

  const activeColors = isDark ? darkColors : lightColors;
  const panelWidth = isCollapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  // ★ v2.3: Toggle handler — updates internal state + notifies parent
  const handleToggle = useCallback(() => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    onCollapseChange?.(next);
  }, [isCollapsed, onCollapseChange]);

  // Drag-and-drop stat order
  const [statOrder, setStatOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === STAT_DEFINITIONS.length) return parsed;
      }
    } catch {}
    return STAT_DEFINITIONS.map(s => s.id);
  });

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleDragStart = useCallback((idx: number) => { setDragIdx(idx); }, []);
  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx); }, []);
  const handleDrop = useCallback((idx: number) => {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return; }
    setStatOrder(prev => {
      const newOrder = [...prev];
      const [moved] = newOrder.splice(dragIdx, 1);
      newOrder.splice(idx, 0, moved);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newOrder));
      return newOrder;
    });
    setDragIdx(null);
    setDragOverIdx(null);
  }, [dragIdx]);
  const handleDragEnd = useCallback(() => { setDragIdx(null); setDragOverIdx(null); }, []);

  const completeness = useMemo(() => calculateCompleteness(projectData), [projectData]);
  const structuralCharts = useMemo(() => extractStructuralData(projectData), [projectData]);

  const orderedStats = useMemo(() => {
    return statOrder.map(id => STAT_DEFINITIONS.find(s => s.id === id)).filter(Boolean) as StatItem[];
  }, [statOrder]);

  const pi = projectData?.projectIdea;
  const t = language === 'si';

  // ─── Collapsed view ─────────────────────────────────────

  if (isCollapsed) {
    return (
      <>
        <div style={{
          width: COLLAPSED_WIDTH,
          height: '100%',
          backgroundColor: isDark ? '#1e1e2e' : '#ffffff',
          borderLeft: `1px solid ${isDark ? '#2d2d3f' : theme.colors.border.light}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 16,
          gap: 12,
          position: 'relative',
          flexShrink: 0,
        }}>
          <ProgressRing value={completeness} size={36} strokeWidth={4} showLabel={true} labelSize="0.55rem" />
          <div style={{ width: 24, height: 1, backgroundColor: isDark ? '#2d2d3f' : theme.colors.border.light, margin: '4px 0' }} />
          {orderedStats.slice(0, 6).map(stat => (
            <div key={stat.id} title={t ? stat.labelSi : stat.labelEn} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              color: stat.color, fontSize: '10px', fontWeight: 700,
            }}>
              {stat.icon}
              <span>{stat.getValue(projectData)}</span>
            </div>
          ))}
        </div>

        {/* ★ v2.3: External toggle pill — same style as Sidebar */}
        <button
          onClick={handleToggle}
          style={{
            position: 'fixed',
            top: 12,
            right: COLLAPSED_WIDTH - 12,
            width: 24,
            height: 24,
            borderRadius: radii.full,
            background: activeColors.primary[500],
            border: `2px solid ${activeColors.surface.card}`,
            color: activeColors.text.inverse,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: zIndex.sidebar + 1,
            boxShadow: shadows.md,
            transition: `right ${animation.duration.normal} ${animation.easing.default}, transform ${animation.duration.fast} ${animation.easing.default}`,
          }}
          title="Expand"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M8 2L4 6L8 10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </>
    );
  }

  // ─── Expanded view ──────────────────────────────────────

  return (
    <>
      <div style={{
        width: EXPANDED_WIDTH,
        height: '100%',
        backgroundColor: isDark ? '#1e1e2e' : '#ffffff',
        borderLeft: `1px solid ${isDark ? '#2d2d3f' : theme.colors.border.light}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 16px',
          borderBottom: `1px solid ${isDark ? '#2d2d3f' : theme.colors.border.light}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: isDark ? '#a0a0b8' : theme.colors.text.muted }}>{icons.dashboard}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: isDark ? '#e0e0f0' : theme.colors.text.heading }}>
              {t ? 'Nadzorna plošča' : 'Dashboard'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ProgressRing value={completeness} size={32} strokeWidth={4} showLabel={true} labelSize="0.5rem" />
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {/* Project meta */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: isDark ? '#8080a0' : theme.colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>
              {t ? 'Projekt' : 'Project'}
            </p>
            <p style={{ fontSize: '14px', fontWeight: 700, color: isDark ? '#e0e0f0' : theme.colors.text.heading, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pi?.projectTitle || '—'}
            </p>
            <div style={{ display: 'flex', gap: 12, fontSize: '11px', color: isDark ? '#8080a0' : theme.colors.text.muted, marginTop: 4 }}>
              {pi?.projectAcronym && <span>{pi.projectAcronym}</span>}
              {pi?.durationMonths && <span>{pi.durationMonths} {t ? 'mes.' : 'mo.'}</span>}
              {pi?.startDate && <span>{pi.startDate}</span>}
            </div>
          </div>

          {/* Stats grid — draggable */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: isDark ? '#8080a0' : theme.colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>
              {t ? 'Statistika' : 'Statistics'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {orderedStats.map((stat, idx) => {
                const val = stat.getValue(projectData);
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
                      gap: 8,
                      padding: '6px 8px',
                      borderRadius: theme.radii.md,
                      backgroundColor: dragOverIdx === idx
                        ? (isDark ? '#2d2d4f' : '#f0f0ff')
                        : 'transparent',
                      opacity: dragIdx === idx ? 0.4 : 1,
                      cursor: 'grab',
                      transition: 'background-color 0.15s',
                    }}
                  >
                    <span style={{ color: isDark ? '#606078' : '#c0c0d0', flexShrink: 0 }}>{icons.grip}</span>
                    <span style={{ color: stat.color, flexShrink: 0 }}>{stat.icon}</span>
                    <span style={{ flex: 1, fontSize: '12px', color: isDark ? '#c0c0d8' : theme.colors.text.body }}>
                      {t ? stat.labelSi : stat.labelEn}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: isDark ? '#e0e0f0' : theme.colors.text.heading, minWidth: 20, textAlign: 'right' }}>
                      {val}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Charts */}
          {structuralCharts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: isDark ? '#8080a0' : theme.colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                {t ? 'Grafi' : 'Charts'}
              </p>
              {structuralCharts.map(chart => (
                <ChartRenderer
                  key={chart.id}
                  data={chart}
                  height={160}
                  showTitle={true}
                  showSource={false}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ★ v2.3: External toggle pill — same style as Sidebar */}
      <button
        onClick={handleToggle}
        style={{
          position: 'fixed',
          top: 12,
          right: EXPANDED_WIDTH - 12,
          width: 24,
          height: 24,
          borderRadius: radii.full,
          background: activeColors.primary[500],
          border: `2px solid ${activeColors.surface.card}`,
          color: activeColors.text.inverse,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: zIndex.sidebar + 1,
          boxShadow: shadows.md,
          transition: `right ${animation.duration.normal} ${animation.easing.default}, transform ${animation.duration.fast} ${animation.easing.default}`,
        }}
        title="Collapse"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M4 2L8 6L4 10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </>
  );
};

export default DashboardPanel;
