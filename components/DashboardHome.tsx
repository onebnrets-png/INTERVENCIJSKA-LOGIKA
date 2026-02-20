// components/DashboardHome.tsx
// ═══════════════════════════════════════════════════════════════════
// EURO-OFFICE Dashboard Home — Main view after login
// v6.0 — 2026-02-20
//
// CHANGES v6.0:
//   - NEW: EmailModal — fullscreen overlay za pošiljanje emaila članu
//   - NEW: 3 send opcije: Gmail, Outlook, Default email klient
//   - NEW: Modal se odpre IZVEN kartice (fullscreen overlay z backdrop blur)
//   - FIX: Removed inline compose from OrganizationCard (replaced with modal trigger)
//
// CHANGES v5.0:
//   - FIX: AI chat markdown symbols now rendered as formatted text
//   - FIX: AI chat scroll positioning fixed (no more 20-line jump)
//   - REMOVED: Quick Statistics card
//   - REMOVED: AI Settings card
//   - NEW: Organization card shows members + their projects
//   - NEW: Project Charts card is now resizable (not forced wide)
//   - NEW: Modern Bento-grid inspired fluid layout
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { colors as lightColors, darkColors, shadows, radii, spacing, animation, typography } from '../design/theme.ts';
import { getThemeMode, onThemeChange } from '../services/themeService.ts';
import { storageService } from '../services/storageService.ts';
import { organizationService } from '../services/organizationService.ts';
import type { OrganizationMember } from '../services/organizationService.ts';
import { knowledgeBaseService } from '../services/knowledgeBaseService.ts';
import { TEXT } from '../locales.ts';
import { generateContent } from '../services/aiProvider.ts';
import { extractStructuralData } from '../services/DataExtractionService.ts';
import type { ExtractedChartData } from '../services/DataExtractionService.ts';
import ChartRenderer from './ChartRenderer.tsx';
import { ProgressRing as DesignProgressRing } from '../design/index.ts';
import { supabase } from '../services/supabaseClient.ts';

// ——— Types ———————————————————————————————————————

interface DashboardHomeProps {
  language: 'en' | 'si';
  projectsMeta: any[];
  currentProjectId: string | null;
  projectData: any;
  activeOrg: any | null;
  userOrgs: any[];
  isAdmin: boolean;
  onOpenProject: (projectId: string) => void;
  onCreateProject: () => void;
  onOpenAdmin: (tab?: string) => void;
  onOpenSettings: () => void;
  onSwitchOrg: (orgId: string) => void;
}

interface ChatMessage { role: 'user' | 'assistant'; content: string; timestamp: number; }
interface ChatConversation { id: string; title: string; messages: ChatMessage[]; createdAt: number; updatedAt: number; }

type CardId = 'projects' | 'chatbot' | 'admin' | 'organization' | 'activity';

const DEFAULT_CARD_ORDER: CardId[] = ['projects', 'chatbot', 'organization', 'admin', 'activity'];
const DEFAULT_CARD_SIZES: Record<string, number> = { projects: 1, chatbot: 1, organization: 1, admin: 1, activity: 2 };

const CHAT_STORAGE_KEY = 'euro-office-chat-conversations';
const MAX_CONVERSATIONS = 20;
const GRID_COLS = 2;
const CHART_WIDTH = 260;
const CHART_HEIGHT = 160;

// ——— Markdown → Formatted Text (NO visible markdown symbols) ——

function renderFormattedText(text: string): React.ReactNode {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  const formatInline = (line: string, key: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let partIdx = 0;

    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);
      const codeMatch = remaining.match(/`(.+?)`/);

      const matches = [
        boldMatch ? { type: 'bold', match: boldMatch, idx: remaining.indexOf(boldMatch[0]) } : null,
        italicMatch ? { type: 'italic', match: italicMatch, idx: remaining.indexOf(italicMatch[0]) } : null,
        codeMatch ? { type: 'code', match: codeMatch, idx: remaining.indexOf(codeMatch[0]) } : null,
      ].filter(Boolean).sort((a, b) => a!.idx - b!.idx);

      if (matches.length === 0) {
        parts.push(<span key={`${key}-${partIdx++}`}>{remaining}</span>);
        break;
      }

      const first = matches[0]!;
      if (first.idx > 0) {
        parts.push(<span key={`${key}-${partIdx++}`}>{remaining.substring(0, first.idx)}</span>);
      }

      const inner = first.match[1];
      if (first.type === 'bold') {
        parts.push(<strong key={`${key}-${partIdx++}`} style={{ fontWeight: 700 }}>{inner}</strong>);
      } else if (first.type === 'italic') {
        parts.push(<em key={`${key}-${partIdx++}`}>{inner}</em>);
      } else if (first.type === 'code') {
        parts.push(<code key={`${key}-${partIdx++}`} style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 4px', borderRadius: '3px', fontSize: '0.9em', fontFamily: 'monospace' }}>{inner}</code>);
      }

      remaining = remaining.substring(first.idx + first.match[0].length);
    }

    return <span key={key}>{parts}</span>;
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('### ')) {
      elements.push(<div key={`l-${i}`} style={{ fontWeight: 700, fontSize: '1em', margin: '8px 0 4px' }}>{formatInline(trimmed.slice(4), `h3-${i}`)}</div>);
    } else if (trimmed.startsWith('## ')) {
      elements.push(<div key={`l-${i}`} style={{ fontWeight: 700, fontSize: '1.05em', margin: '8px 0 4px' }}>{formatInline(trimmed.slice(3), `h2-${i}`)}</div>);
    } else if (trimmed.startsWith('# ')) {
      elements.push(<div key={`l-${i}`} style={{ fontWeight: 700, fontSize: '1.1em', margin: '10px 0 4px' }}>{formatInline(trimmed.slice(2), `h1-${i}`)}</div>);
    } else if (trimmed === '---' || trimmed === '***') {
      elements.push(<hr key={`l-${i}`} style={{ border: 'none', borderTop: '1px solid rgba(128,128,128,0.2)', margin: '8px 0' }} />);
    } else if (/^[\*\-]\s/.test(trimmed)) {
      elements.push(<div key={`l-${i}`} style={{ paddingLeft: '12px', margin: '2px 0', display: 'flex', gap: '6px' }}><span style={{ flexShrink: 0 }}>•</span><span>{formatInline(trimmed.slice(2), `li-${i}`)}</span></div>);
    } else if (/^\d+\.\s/.test(trimmed)) {
      const numEnd = trimmed.indexOf('. ');
      const num = trimmed.substring(0, numEnd + 1);
      elements.push(<div key={`l-${i}`} style={{ paddingLeft: '12px', margin: '2px 0', display: 'flex', gap: '6px' }}><span style={{ flexShrink: 0 }}>{num}</span><span>{formatInline(trimmed.slice(numEnd + 2), `nl-${i}`)}</span></div>);
    } else if (trimmed === '') {
      elements.push(<div key={`l-${i}`} style={{ height: '6px' }} />);
    } else {
      elements.push(<div key={`l-${i}`} style={{ margin: '2px 0' }}>{formatInline(trimmed, `p-${i}`)}</div>);
    }
  });

  return <>{elements}</>;
}

// ——— Completeness helpers ————————————————————

const SKIP_KEYS = new Set(['id','project_id','created_at','updated_at','category','likelihood','impact','type','dependencies','startDate','durationMonths','_calculatedEndDate','_projectTimeframe']);
const hasRealStringContent = (v: any): boolean => typeof v === 'string' && v.trim().length > 0;
const arrayHasRealContent = (arr: any[]): boolean => {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  return arr.some((item: any) => {
    if (typeof item === 'string') return item.trim().length > 0;
    if (typeof item !== 'object' || item === null) return false;
    return Object.entries(item).some(([k, v]) => { if (SKIP_KEYS.has(k)) return false; if (typeof v === 'string') return v.trim().length > 0; if (Array.isArray(v)) return arrayHasRealContent(v); return false; });
  });
};
const objectHasRealContent = (obj: any): boolean => {
  if (!obj || typeof obj !== 'object') return false;
  if (Array.isArray(obj)) return arrayHasRealContent(obj);
  return Object.entries(obj).some(([k, v]) => { if (SKIP_KEYS.has(k)) return false; if (typeof v === 'string') return v.trim().length > 0; if (Array.isArray(v)) return arrayHasRealContent(v); if (typeof v === 'object' && v !== null) return objectHasRealContent(v); return false; });
};

const calculateCompleteness = (pd: any): number => {
  if (!pd) return 0;
  const checks: { key: string; check: (d: any) => boolean }[] = [
    { key: 'problemAnalysis', check: (d) => d && (hasRealStringContent(d.coreProblem?.title) || hasRealStringContent(d.coreProblem?.description) || arrayHasRealContent(d.causes) || arrayHasRealContent(d.consequences)) },
    { key: 'projectIdea', check: (d) => d && (hasRealStringContent(d.projectTitle) || hasRealStringContent(d.projectAcronym) || hasRealStringContent(d.mainAim) || hasRealStringContent(d.stateOfTheArt) || hasRealStringContent(d.proposedSolution) || arrayHasRealContent(d.policies) || (d.readinessLevels && [d.readinessLevels.TRL, d.readinessLevels.SRL, d.readinessLevels.ORL, d.readinessLevels.LRL].some((r: any) => typeof r?.level === 'number' && r.level > 0))) },
    { key: 'generalObjectives', check: (d) => arrayHasRealContent(d) },
    { key: 'specificObjectives', check: (d) => arrayHasRealContent(d) },
    { key: 'projectManagement', check: (d) => d && (hasRealStringContent(d.description) || objectHasRealContent(d.structure)) },
    { key: 'activities', check: (d) => Array.isArray(d) && d.some((wp: any) => hasRealStringContent(wp.title) || arrayHasRealContent(wp.tasks) || arrayHasRealContent(wp.milestones) || arrayHasRealContent(wp.deliverables)) },
    { key: 'outputs', check: (d) => arrayHasRealContent(d) },
    { key: 'outcomes', check: (d) => arrayHasRealContent(d) },
    { key: 'impacts', check: (d) => arrayHasRealContent(d) },
    { key: 'risks', check: (d) => Array.isArray(d) && d.some((r: any) => hasRealStringContent(r.title) || hasRealStringContent(r.description) || hasRealStringContent(r.mitigation)) },
    { key: 'kers', check: (d) => arrayHasRealContent(d) },
  ];
  let filled = 0, total = 0;
  for (const { key, check } of checks) { const data = pd?.[key]; if (data === undefined || data === null) continue; total++; if (check(data)) filled++; }
  return total === 0 ? 0 : Math.round((filled / total) * 100);
};

function getProjectProgress(pd: any): number {
  if (!pd) return 0;
  let f = 0; const t = 8;
  if (pd.problemAnalysis?.coreProblem?.title?.trim()) f++;
  if (pd.projectIdea?.mainAim?.trim()) f++;
  if (pd.generalObjectives?.some((o: any) => o.title?.trim())) f++;
  if (pd.specificObjectives?.some((o: any) => o.title?.trim())) f++;
  if (pd.activities?.some((a: any) => a.title?.trim())) f++;
  if (pd.outputs?.some((o: any) => o.title?.trim())) f++;
  if (pd.outcomes?.some((o: any) => o.title?.trim())) f++;
  if (pd.impacts?.some((o: any) => o.title?.trim())) f++;
  return Math.round((f / t) * 100);
}

const LocalProgressRing: React.FC<{ percent: number; size?: number; strokeWidth?: number; color: string; bgColor: string }> = ({ percent, size = 64, strokeWidth = 6, color, bgColor }) => {
  const r = (size - strokeWidth) / 2; const c = 2 * Math.PI * r; const o = c - (percent / 100) * c;
  return (<svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={bgColor} strokeWidth={strokeWidth}/><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={c} strokeDashoffset={o} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.6s ease' }}/></svg>);
};

// ——— DashboardCard ————————————————————————

interface CardProps {
  id: CardId; title: string; icon: string; children: React.ReactNode;
  isDark: boolean; colors: any; colSpan: number; language: 'en' | 'si';
  onResize: (id: CardId, span: number) => void;
  dragHandlers: { onDragStart: (e: React.DragEvent, id: CardId) => void; onDragOver: (e: React.DragEvent) => void; onDrop: (e: React.DragEvent, id: CardId) => void; onDragEnd: () => void; };
  draggingId: CardId | null;
}

const DashboardCard: React.FC<CardProps> = ({ id, title, icon, children, isDark, colors: c, colSpan, language, onResize, dragHandlers, draggingId }) => {
  const isDragging = draggingId === id;
  const span = Math.min(colSpan, GRID_COLS);
  return (
    <div draggable onDragStart={(e) => dragHandlers.onDragStart(e, id)} onDragOver={dragHandlers.onDragOver} onDrop={(e) => dragHandlers.onDrop(e, id)} onDragEnd={dragHandlers.onDragEnd}
      style={{ background: c.surface.card, borderRadius: radii.xl, border: `1px solid ${isDragging ? c.primary[400] : c.border.light}`, boxShadow: isDragging ? shadows.xl : shadows.card, overflow: 'hidden', opacity: isDragging ? 0.7 : 1, transform: isDragging ? 'scale(1.02)' : 'scale(1)', transition: `all ${animation.duration.fast} ${animation.easing.default}`, gridColumn: `span ${span}`, display: 'flex', flexDirection: 'column' as const, cursor: 'grab', minHeight: 0 }}>
      <div style={{ padding: `${spacing.md} ${spacing.lg}`, borderBottom: `1px solid ${c.border.light}`, display: 'flex', alignItems: 'center', gap: spacing.sm, flexShrink: 0 }}>
        <span style={{ fontSize: '18px' }}>{icon}</span>
        <h3 style={{ margin: 0, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: c.text.heading, flex: 1 }}>{title}</h3>
        <div style={{ display: 'flex', gap: '2px', marginRight: spacing.xs }}>
          {span > 1 && <button onClick={(e) => { e.stopPropagation(); onResize(id, span - 1); }} draggable={false} title={language === 'si' ? 'Zoži' : 'Narrow'} style={{ background: 'none', border: `1px solid ${c.border.light}`, borderRadius: radii.sm, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: c.text.muted, fontSize: '12px' }} onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? c.primary[900]+'30' : c.primary[50]; e.currentTarget.style.color = c.primary[600]; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = c.text.muted; }}>◂</button>}
          {span < GRID_COLS && <button onClick={(e) => { e.stopPropagation(); onResize(id, span + 1); }} draggable={false} title={language === 'si' ? 'Razširi' : 'Widen'} style={{ background: 'none', border: `1px solid ${c.border.light}`, borderRadius: radii.sm, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: c.text.muted, fontSize: '12px' }} onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? c.primary[900]+'30' : c.primary[50]; e.currentTarget.style.color = c.primary[600]; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = c.text.muted; }}>▸</button>}
        </div>
        <div style={{ cursor: 'grab', color: c.text.muted, display: 'flex' }}><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="3" r="1.5"/><circle cx="11" cy="3" r="1.5"/><circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/><circle cx="5" cy="13" r="1.5"/><circle cx="11" cy="13" r="1.5"/></svg></div>
      </div>
      <div style={{ padding: spacing.lg, flex: 1, overflow: 'auto', minHeight: 0 }}>{children}</div>
    </div>
  );
};

const DropZone: React.FC<{ index: number; isDark: boolean; colors: any; draggingId: CardId | null; onDropAtEnd: (e: React.DragEvent) => void }> = ({ isDark, colors: c, draggingId, onDropAtEnd }) => {
  const [isOver, setIsOver] = useState(false);
  if (!draggingId) return null;
  return (<div onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setIsOver(true); }} onDragLeave={() => setIsOver(false)} onDrop={(e) => { e.preventDefault(); setIsOver(false); onDropAtEnd(e); }} style={{ gridColumn: 'span 1', minHeight: 80, borderRadius: radii.xl, border: `2px dashed ${isOver ? c.primary[400] : c.border.light}`, background: isOver ? (isDark ? c.primary[900]+'20' : c.primary[50]) : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease', color: c.text.muted, fontSize: typography.fontSize.xs }}>{isOver ? '↓' : ''}</div>);
};

// ——— Project Charts Card — resizable + auto-load ————————

const ProjectChartsCard: React.FC<{
  language: 'en' | 'si'; isDark: boolean; colors: any; colSpan: number;
  projectsMeta: any[]; projectData: any;
  currentProjectId: string | null;
  onOpenProject: (projectId: string) => void;
}> = ({ language, isDark, colors: c, colSpan, projectsMeta, projectData, currentProjectId, onOpenProject }) => {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [loadedData, setLoadedData] = useState<Record<string, any>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (currentProjectId && projectData) {
      setLoadedData(prev => ({ ...prev, [currentProjectId]: projectData }));
      if (!activeProjectId) setActiveProjectId(currentProjectId);
    }
  }, [currentProjectId, projectData]);

  const loadProjectData = useCallback(async (projectId: string) => {
    if (loadedData[projectId]) { setActiveProjectId(projectId); return; }
    if (projectId === currentProjectId && projectData) { setLoadedData(prev => ({ ...prev, [projectId]: projectData })); setActiveProjectId(projectId); return; }
    setLoadingId(projectId); setActiveProjectId(projectId);
    try { const data = await storageService.loadProject(language, projectId); if (data) setLoadedData(prev => ({ ...prev, [projectId]: data })); } catch (err) { console.warn('ProjectChartsCard: Failed to load', projectId, err); } finally { setLoadingId(null); }
  }, [loadedData, currentProjectId, projectData, language]);

  const handleClick = useCallback((pid: string) => { loadProjectData(pid); }, [loadProjectData]);
  const handleMouseEnter = useCallback((pid: string) => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); hoverTimerRef.current = setTimeout(() => loadProjectData(pid), 300); }, [loadProjectData]);
  const handleMouseLeave = useCallback(() => { if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; } }, []);
  useEffect(() => { return () => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); }; }, []);

  const activeData = activeProjectId ? loadedData[activeProjectId] : null;
  const chartsData = useMemo(() => { if (!activeData) return null; try { return extractStructuralData(activeData); } catch { return null; } }, [activeData]);
  const completeness = useMemo(() => activeData ? calculateCompleteness(activeData) : 0, [activeData]);
  const isLoading = loadingId === activeProjectId;

  const chartW = colSpan >= 2 ? CHART_WIDTH : Math.min(200, CHART_WIDTH);
  const chartH = colSpan >= 2 ? CHART_HEIGHT : Math.min(130, CHART_HEIGHT);
  const isNarrow = colSpan < 2;

  return (
    <div style={{ display: 'flex', flexDirection: isNarrow ? 'column' as const : 'row' as const, gap: spacing.md, minHeight: isNarrow ? 300 : 220 }}>
      <div style={{ width: isNarrow ? '100%' : 120, minWidth: isNarrow ? undefined : 100, flexShrink: 0, borderRight: isNarrow ? 'none' : `1px solid ${c.border.light}`, borderBottom: isNarrow ? `1px solid ${c.border.light}` : 'none', overflowY: 'auto', overflowX: isNarrow ? 'auto' : 'hidden', paddingRight: isNarrow ? 0 : spacing.xs, paddingBottom: isNarrow ? spacing.xs : 0, display: isNarrow ? 'flex' : 'block', gap: isNarrow ? spacing.xs : undefined, maxHeight: isNarrow ? 60 : undefined }}>
        {!isNarrow && <div style={{ fontSize: '10px', color: c.text.muted, fontWeight: typography.fontWeight.semibold, marginBottom: spacing.sm, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{language === 'si' ? 'Projekti' : 'Projects'} ({projectsMeta.length})</div>}
        {projectsMeta.map(p => {
          const isCurrent = p.id === currentProjectId;
          const isActive = p.id === activeProjectId;
          const acronym = p.acronym || p.title?.substring(0, 6) || '—';
          return (
            <div key={p.id} onMouseEnter={() => handleMouseEnter(p.id)} onMouseLeave={handleMouseLeave} onClick={() => handleClick(p.id)}
              style={{ padding: isNarrow ? `3px 8px` : `6px ${spacing.xs}`, borderRadius: radii.sm, cursor: 'pointer', background: isActive ? (isDark ? c.primary[900]+'60' : c.primary[100]) : 'transparent', borderLeft: isNarrow ? 'none' : (isActive ? `3px solid ${c.primary[500]}` : '3px solid transparent'), borderBottom: isNarrow ? (isActive ? `2px solid ${c.primary[500]}` : '2px solid transparent') : 'none', marginBottom: isNarrow ? 0 : 3, transition: 'background 0.15s ease', display: 'flex', alignItems: 'center', gap: spacing.xs, flexShrink: 0 }}>
              {loadedData[p.id] ? <DesignProgressRing value={calculateCompleteness(loadedData[p.id])} size={22} strokeWidth={3} showLabel={true} labelSize="0.4rem" /> :
                <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: isDark ? '#334155' : c.primary[50], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: c.text.muted, fontWeight: 700 }}>{p.id === loadingId ? '…' : acronym[0]}</div>}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: isActive ? typography.fontWeight.bold : typography.fontWeight.semibold, color: isActive ? c.primary[600] : c.text.heading, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{acronym}</div>
                {isCurrent && !isNarrow && <div style={{ fontSize: '7px', color: c.success[600], fontWeight: typography.fontWeight.semibold }}>● {language === 'si' ? 'naložen' : 'loaded'}</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' as const, gap: spacing.xs }}>
        {activeProjectId && (() => { const meta = projectsMeta.find(p => p.id === activeProjectId); if (!meta) return null; return (<div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>{meta.acronym && <span style={{ fontSize: '11px', background: isDark ? c.primary[900] : c.primary[100], color: c.primary[700], padding: '2px 8px', borderRadius: radii.full, fontWeight: typography.fontWeight.bold }}>{meta.acronym}</span>}<span style={{ fontSize: typography.fontSize.xs, color: c.text.heading, fontWeight: typography.fontWeight.semibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.title || meta.name || ''}</span>{activeProjectId !== currentProjectId && <button onClick={(e) => { e.stopPropagation(); onOpenProject(activeProjectId); }} style={{ background: 'none', border: `1px solid ${c.border.light}`, borderRadius: radii.md, padding: '2px 8px', fontSize: '10px', cursor: 'pointer', color: c.primary[600], fontWeight: typography.fontWeight.semibold, marginLeft: 'auto', flexShrink: 0 }}>{language === 'si' ? 'Odpri' : 'Open'}</button>}</div>); })()}
        {!activeProjectId && <div style={{ color: c.text.muted, fontSize: typography.fontSize.sm, textAlign: 'center' as const, padding: spacing.xl, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{language === 'si' ? 'Izberite projekt' : 'Select a project'}</div>}
        {activeProjectId && isLoading && <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ fontSize: typography.fontSize.xs, color: c.text.muted }}>{language === 'si' ? 'Nalagam...' : 'Loading...'}<span style={{ animation: 'pulse 1.5s infinite' }}> ●</span></div></div>}
        {activeProjectId && !isLoading && activeData && (
          <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', display: 'flex', flexDirection: 'row' as const, flexWrap: isNarrow ? 'wrap' as const : 'nowrap' as const, gap: spacing.sm, paddingBottom: spacing.xs, alignItems: 'flex-start' }}>
            <div style={{ flexShrink: 0, width: chartW, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.md, background: isDark ? '#1e1e2e' : '#f8fafc', borderRadius: radii.lg, border: `1px solid ${c.border.light}`, minHeight: chartH }}>
              <DesignProgressRing value={completeness} size={isNarrow ? 60 : 80} strokeWidth={6} showLabel={true} labelSize={isNarrow ? '0.65rem' : '0.8rem'} />
              <div style={{ textAlign: 'center' as const }}><div style={{ fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: c.text.heading }}>{language === 'si' ? 'Zapolnjenost' : 'Completeness'}</div><div style={{ fontSize: '10px', color: c.text.muted }}>{completeness}%</div></div>
            </div>
            {chartsData && chartsData.length > 0 && chartsData.map((chart: ExtractedChartData, idx: number) => (<div key={`c-${idx}-${chart.chartType}`} style={{ flexShrink: 0, width: chartW }}><ChartRenderer data={chart} width={chartW} height={chartH} showTitle={true} showSource={false} /></div>))}
            {(!chartsData || chartsData.length === 0) && <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: typography.fontSize.xs, color: c.text.muted, padding: spacing.lg, fontStyle: 'italic' }}>{language === 'si' ? 'Ni podatkov za grafike.' : 'No chart data.'}</div>}
          </div>
        )}
        {activeProjectId && !isLoading && !activeData && <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ fontSize: typography.fontSize.xs, color: c.text.muted, fontStyle: 'italic' }}>{language === 'si' ? 'Podatki niso na voljo.' : 'Data not available.'}</div></div>}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// EMAIL MODAL — v6.0 — Fullscreen overlay with Gmail/Outlook/Mailto
// ═══════════════════════════════════════════════════════════

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipientName: string;
  recipientEmail: string;
  orgName: string;
  senderName: string;
  language: 'en' | 'si';
  isDarkMode: boolean;
}

const EmailModal: React.FC<EmailModalProps> = ({
  isOpen, onClose, recipientName, recipientEmail, orgName, senderName, language, isDarkMode,
}) => {
  const t = (en: string, si: string) => language === 'si' ? si : en;
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sent, setSent] = useState(false);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setSubject(`EURO-OFFICE: ${t('Message from', 'Sporočilo od')} ${senderName}`);
      setBody('');
      setSent(false);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && isOpen) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const c = isDarkMode ? darkColors : lightColors;

  const buildSignature = () =>
    `\n\n---\n${t('Sent via EURO-OFFICE', 'Poslano prek EURO-OFFICE')}\n${t('Organization', 'Organizacija')}: ${orgName}\n${t('From', 'Od')}: ${senderName}`;

  const fullBody = body + buildSignature();

  const handleGmail = () => {
    const url = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(recipientEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(fullBody)}`;
    window.open(url, '_blank');
    setSent(true);
    setTimeout(onClose, 600);
  };

  const handleOutlook = () => {
    const url = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(recipientEmail)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(fullBody)}`;
    window.open(url, '_blank');
    setSent(true);
    setTimeout(onClose, 600);
  };

  const handleMailto = () => {
    window.open(`mailto:${recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(fullBody)}`, '_blank');
    setSent(true);
    setTimeout(onClose, 600);
  };

  const canSend = subject.trim().length > 0 && body.trim().length > 0;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 8,
    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
    background: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
    color: c.text?.heading || c.text, fontSize: 14, outline: 'none',
    boxSizing: 'border-box' as const, fontFamily: 'inherit',
    transition: 'border-color 0.2s',
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000, backdropFilter: 'blur(4px)', padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: isDarkMode ? '#1e1e2e' : '#ffffff',
          borderRadius: 16, width: '100%', maxWidth: 600, maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 25px 60px rgba(0,0,0,0.35)',
          border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontSize: 18,
          }}>
            ✉
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: c.text?.heading || c.text }}>
              {t('Send Message', 'Pošlji sporočilo')}
            </div>
            <div style={{ fontSize: 13, color: c.text?.muted || c.textSecondary, marginTop: 2 }}>
              {orgName}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: c.text?.muted || c.textSecondary, fontSize: 22, padding: 4,
            lineHeight: 1, borderRadius: 6,
          }}>
            ✕
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Recipient */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: c.text?.muted || c.textSecondary, display: 'block', marginBottom: 6 }}>
              {t('Recipient', 'Prejemnik')}
            </label>
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
              border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0,
              }}>
                {recipientName.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: c.text?.heading || c.text }}>{recipientName}</div>
                <div style={{ fontSize: 12, color: c.text?.muted || c.textSecondary }}>{recipientEmail}</div>
              </div>
            </div>
          </div>

          {/* Subject */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: c.text?.muted || c.textSecondary, display: 'block', marginBottom: 6 }}>
              {t('Subject', 'Zadeva')}
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#6366f1'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'; }}
            />
          </div>

          {/* Message */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: c.text?.muted || c.textSecondary, display: 'block', marginBottom: 6 }}>
              {t('Message', 'Sporočilo')}
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder={t('Write your message here...', 'Napišite svoje sporočilo tukaj...')}
              style={{
                ...inputStyle,
                resize: 'vertical' as const,
                minHeight: 180,
                lineHeight: 1.6,
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#6366f1'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'; }}
            />
          </div>

          {/* Info */}
          <div style={{
            fontSize: 12, color: c.text?.muted || c.textSecondary, padding: '10px 12px',
            background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            borderRadius: 8, lineHeight: 1.5,
          }}>
            {t(
              'Choose your preferred email service below. The message will be pre-filled in a new tab.',
              'Izberite želeno email storitev spodaj. Sporočilo bo vnaprej izpolnjeno v novem zavihku.'
            )}
          </div>
        </div>

        {/* ── Footer — Send buttons ── */}
        <div style={{
          padding: '16px 24px',
          borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
          display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', alignItems: 'center',
        }}>
          {sent && (
            <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 600, marginRight: 'auto' }}>
              {t('Opening email client...', 'Odpiranje email odjemalca...')}
            </span>
          )}

          <button onClick={onClose} style={{
            padding: '9px 18px', borderRadius: 8,
            border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
            background: 'transparent', color: c.text?.muted || c.textSecondary,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            {t('Cancel', 'Prekliči')}
          </button>

          <button onClick={handleGmail} disabled={!canSend} style={{
            padding: '9px 18px', borderRadius: 8, border: 'none',
            background: canSend ? '#EA4335' : (isDarkMode ? '#334' : '#ddd'),
            color: canSend ? '#fff' : (c.text?.muted || '#999'),
            fontSize: 13, fontWeight: 700, cursor: canSend ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
          }}>
            Gmail
          </button>

          <button onClick={handleOutlook} disabled={!canSend} style={{
            padding: '9px 18px', borderRadius: 8, border: 'none',
            background: canSend ? '#0078D4' : (isDarkMode ? '#334' : '#ddd'),
            color: canSend ? '#fff' : (c.text?.muted || '#999'),
            fontSize: 13, fontWeight: 700, cursor: canSend ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
          }}>
            Outlook
          </button>

          <button onClick={handleMailto} disabled={!canSend} style={{
            padding: '9px 18px', borderRadius: 8, border: 'none',
            background: canSend ? '#6366f1' : (isDarkMode ? '#334' : '#ddd'),
            color: canSend ? '#fff' : (c.text?.muted || '#999'),
            fontSize: 13, fontWeight: 700, cursor: canSend ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
          }}>
            ✉ {t('Email Client', 'Email odjemalec')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// OrganizationCard — v6.0 — 2026-02-20
// ★ Replaced inline compose with EmailModal trigger
// ═══════════════════════════════════════════════════════════════

const OrganizationCard: React.FC<{
  language: 'en' | 'si';
  isDark: boolean;
  colors: any;
  activeOrg: any;
  userOrgs: any[];
  isAdmin: boolean;
  onSwitchOrg: (orgId: string) => void;
  onOpenProject?: (projectId: string) => void;
  onOpenEmailModal: (recipient: { name: string; email: string; orgName: string }) => void;
}> = ({ language, isDark, colors, activeOrg, userOrgs, isAdmin, onSwitchOrg, onOpenProject, onOpenEmailModal }) => {
  const t = (en: string, si: string) => language === 'si' ? si : en;

  interface OrgData {
    id: string;
    name: string;
    slug: string;
    members: {
      userId: string;
      displayName: string;
      email: string;
      orgRole: string;
      joinedAt: string;
      projectCount: number;
    }[];
    projects: {
      id: string;
      title: string;
      ownerName: string;
      ownerEmail: string;
      updatedAt: string;
    }[];
  }

  const [orgDataList, setOrgDataList] = React.useState<OrgData[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [expandedOrgId, setExpandedOrgId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<'members' | 'projects'>('members');

  const isSuperAdmin = storageService.isSuperAdmin();
  const isOrgAdmin = isAdmin;

  React.useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        let orgsToShow: any[] = [];

        if (isSuperAdmin) {
          orgsToShow = await organizationService.getAllOrgs();
        } else if (isOrgAdmin && activeOrg) {
          orgsToShow = [activeOrg];
        } else if (activeOrg) {
          orgsToShow = [activeOrg];
        }

        if (cancelled) return;

        const results: OrgData[] = [];

        for (const org of orgsToShow) {
          let members: any[] = [];
          try {
            members = await organizationService.getOrgMembers(org.id);
          } catch (e) {
            console.warn(`Failed to load members for org ${org.name}:`, e);
          }

          if (!isSuperAdmin && !isOrgAdmin) {
            const currentUserId = await storageService.getCurrentUserId();
            members = members.filter(m => m.userId === currentUserId);
          }

          let projects: any[] = [];
          try {
            const { data: projData, error: projErr } = await supabase
              .from('projects')
              .select('id, title, owner_id, updated_at')
              .eq('organization_id', org.id)
              .order('updated_at', { ascending: false });

            if (!projErr && projData) {
              if (!isSuperAdmin && !isOrgAdmin) {
                const currentUserId = await storageService.getCurrentUserId();
                projects = projData.filter(p => p.owner_id === currentUserId);
              } else {
                projects = projData;
              }
            }
          } catch (e) {
            console.warn(`Failed to load projects for org ${org.name}:`, e);
          }

          const memberMap = new Map(members.map(m => [m.userId, m]));
          const mappedProjects = projects.map(p => ({
            id: p.id,
            title: p.title || 'Untitled',
            ownerName: memberMap.get(p.owner_id)?.displayName || 'Unknown',
            ownerEmail: memberMap.get(p.owner_id)?.email || '',
            updatedAt: p.updated_at,
          }));

          const memberProjectCounts = new Map<string, number>();
          projects.forEach(p => {
            memberProjectCounts.set(p.owner_id, (memberProjectCounts.get(p.owner_id) || 0) + 1);
          });

          results.push({
            id: org.id,
            name: org.name,
            slug: org.slug || '',
            members: members.map(m => ({
              userId: m.userId,
              displayName: m.displayName || m.email?.split('@')[0] || 'Unknown',
              email: m.email || '',
              orgRole: m.orgRole || 'member',
              joinedAt: m.joinedAt || '',
              projectCount: memberProjectCounts.get(m.userId) || 0,
            })),
            projects: mappedProjects,
          });
        }

        if (!cancelled) {
          setOrgDataList(results);
          if (results.length === 1) {
            setExpandedOrgId(results[0].id);
          } else if (activeOrg) {
            setExpandedOrgId(activeOrg.id);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load organization data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [isSuperAdmin, isOrgAdmin, activeOrg?.id]);

  const roleColors: Record<string, string> = {
    owner: '#f59e0b',
    admin: '#3b82f6',
    member: '#10b981',
    superadmin: '#ef4444',
  };

  const roleLabels: Record<string, string> = {
    owner: t('Owner', 'Lastnik'),
    admin: 'Admin',
    member: t('Member', 'Član'),
    superadmin: 'Super Admin',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflow: 'auto' }}>
      {/* SuperAdmin badge */}
      {isSuperAdmin && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 8,
          background: isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${isDark ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.2)'}`,
        }}>
          <span style={{ fontSize: 16 }}>👑</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#ef4444' }}>SUPER ADMIN</span>
          <span style={{ fontSize: 12, color: colors.textSecondary, marginLeft: 'auto' }}>
            {orgDataList.length} {t('organizations', 'organizacij')} · {' '}
            {orgDataList.reduce((s, o) => s + o.members.length, 0)} {t('users', 'uporabnikov')} · {' '}
            {orgDataList.reduce((s, o) => s + o.projects.length, 0)} {t('projects', 'projektov')}
          </span>
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, color: colors.textSecondary }}>
          <span style={{ fontSize: 13 }}>{t('Loading...', 'Nalaganje...')}</span>
        </div>
      )}

      {error && (
        <div style={{ padding: 12, borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Tabs */}
      {!loading && !error && (
        <div style={{ display: 'flex', gap: 4, padding: '2px', borderRadius: 8, background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }}>
          {(['members', 'projects'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              flex: 1, padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, transition: 'all 0.2s',
              background: activeTab === tab ? colors.primary : 'transparent',
              color: activeTab === tab ? '#fff' : colors.textSecondary,
            }}>
              {tab === 'members' ? t('Members', 'Člani') : t('Projects', 'Projekti')}
            </button>
          ))}
        </div>
      )}

      {/* Organization list */}
      {!loading && !error && orgDataList.map(org => {
        const isExpanded = expandedOrgId === org.id;
        const isActive = activeOrg?.id === org.id;

        return (
          <div key={org.id} style={{
            borderRadius: 10, overflow: 'hidden',
            border: `1px solid ${isActive ? colors.primary + '60' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')}`,
            background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          }}>
            {/* Org header */}
            <div
              onClick={() => setExpandedOrgId(isExpanded ? null : org.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', cursor: 'pointer',
                background: isExpanded ? (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)') : 'transparent',
                transition: 'background 0.2s',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive ? colors.primary : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'),
                color: isActive ? '#fff' : colors.textSecondary,
                fontWeight: 700, fontSize: 15,
              }}>
                {org.name.charAt(0).toUpperCase()}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {org.name}
                </div>
                <div style={{ fontSize: 11, color: colors.textSecondary }}>
                  {org.members.length} {t('members', 'članov')} · {org.projects.length} {t('projects', 'projektov')}
                </div>
              </div>

              {isActive && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                  background: colors.primary + '20', color: colors.primary,
                }}>ACTIVE</span>
              )}

              {isSuperAdmin && !isActive && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSwitchOrg(org.id); }}
                  style={{
                    padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 600, background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                    color: colors.textSecondary,
                  }}
                >
                  {t('Switch', 'Preklopi')}
                </button>
              )}

              <span style={{ fontSize: 14, color: colors.textSecondary, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                ▼
              </span>
            </div>

            {/* Expanded content */}
            {isExpanded && (
              <div style={{ padding: '4px 14px 14px' }}>
                {/* MEMBERS TAB */}
                {activeTab === 'members' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {org.members.length === 0 && (
                      <div style={{ padding: 16, textAlign: 'center', color: colors.textSecondary, fontSize: 13 }}>
                        {t('No members found', 'Ni najdenih članov')}
                      </div>
                    )}
                    {org.members.map(member => (
                      <div key={member.userId} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', borderRadius: 8,
                        background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`,
                      }}>
                        {/* Avatar */}
                        <div style={{
                          width: 34, height: 34, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: roleColors[member.orgRole] + '20',
                          color: roleColors[member.orgRole] || colors.primary,
                          fontWeight: 700, fontSize: 14, flexShrink: 0,
                        }}>
                          {member.displayName.charAt(0).toUpperCase()}
                        </div>

                        {/* Name + email */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {member.displayName}
                          </div>
                          <div style={{ fontSize: 11, color: colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {member.email}
                          </div>
                        </div>

                        {/* Role badge */}
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                          background: (roleColors[member.orgRole] || '#666') + '20',
                          color: roleColors[member.orgRole] || '#666',
                          textTransform: 'uppercase', flexShrink: 0,
                        }}>
                          {roleLabels[member.orgRole] || member.orgRole}
                        </span>

                        {/* Project count */}
                        <span style={{ fontSize: 11, color: colors.textSecondary, display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                          📁 {member.projectCount}
                        </span>

                        {/* ★ v6.0: Message button — opens fullscreen EmailModal */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenEmailModal({ name: member.displayName, email: member.email, orgName: org.name });
                          }}
                          title={t(`Send message to ${member.displayName}`, `Pošlji sporočilo ${member.displayName}`)}
                          style={{
                            width: 30, height: 30, borderRadius: '50%', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            background: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)',
                            color: colors.primary, fontSize: 14,
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = isDark ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.18)';
                            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)';
                            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                          }}
                        >
                          ✉
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* PROJECTS TAB */}
                {activeTab === 'projects' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {org.projects.length === 0 && (
                      <div style={{ padding: 16, textAlign: 'center', color: colors.textSecondary, fontSize: 13 }}>
                        {t('No projects found', 'Ni najdenih projektov')}
                      </div>
                    )}
                    {org.projects.map(project => (
                      <div
                        key={project.id}
                        onClick={() => onOpenProject?.(project.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px', borderRadius: 8, cursor: onOpenProject ? 'pointer' : 'default',
                          background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                          border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`,
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'; }}
                      >
                        <div style={{
                          width: 34, height: 34, borderRadius: 8,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: colors.primary + '15', color: colors.primary, fontSize: 16, flexShrink: 0,
                        }}>📋</div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {project.title}
                          </div>
                          <div style={{ fontSize: 11, color: colors.textSecondary }}>
                            {project.ownerName} {project.ownerEmail ? `(${project.ownerEmail})` : ''}
                          </div>
                        </div>

                        <span style={{ fontSize: 11, color: colors.textSecondary, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString(language === 'si' ? 'sl-SI' : 'en-GB') : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Empty state */}
      {!loading && !error && orgDataList.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: colors.textSecondary, fontSize: 13 }}>
          {t('No organizations found', 'Ni najdenih organizacij')}
        </div>
      )}
    </div>
  );
};

// ——— AI Chatbot — with formatted text + scroll fix ————————

const AIChatbot: React.FC<{ language: 'en' | 'si'; isDark: boolean; colors: any; activeOrg: any | null }> = ({ language, isDark, colors: c, activeOrg }) => {
  const [conversations, setConversations] = useState<ChatConversation[]>(() => { try { const s = localStorage.getItem(CHAT_STORAGE_KEY); return s ? JSON.parse(s) : []; } catch { return []; } });
  const [activeConvoId, setActiveConvoId] = useState<string | null>(() => conversations[0]?.id || null);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeConvo = conversations.find(cv => cv.id === activeConvoId) || null;
  const messages = activeConvo?.messages || [];

  useEffect(() => { try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(conversations)); } catch {} }, [conversations]);

  const prevMsgCountRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      requestAnimationFrame(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); });
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = 0;
    }
  }, [activeConvoId]);

  const createNewConvo = useCallback(() => {
    const id = `chat-${Date.now()}`;
    const newConvo: ChatConversation = { id, title: language === 'si' ? 'Nov pogovor' : 'New conversation', messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    setConversations(prev => { let u = [newConvo, ...prev]; if (u.length > MAX_CONVERSATIONS) u = u.slice(0, MAX_CONVERSATIONS); return u; });
    setActiveConvoId(id); setShowHistory(false);
  }, [language]);

  const deleteConvo = useCallback((id: string) => { setConversations(prev => prev.filter(cv => cv.id !== id)); if (activeConvoId === id) setActiveConvoId(null); }, [activeConvoId]);

  const updateConvoMessages = useCallback((convoId: string, newMessages: ChatMessage[]) => {
    setConversations(prev => prev.map(cv => { if (cv.id !== convoId) return cv; const title = newMessages.find(m => m.role === 'user')?.content.substring(0, 40) || cv.title; return { ...cv, messages: newMessages, title, updatedAt: Date.now() }; }));
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim(); if (!trimmed || isGenerating) return;
    let convoId = activeConvoId;
    if (!convoId) { convoId = `chat-${Date.now()}`; const newConvo: ChatConversation = { id: convoId, title: trimmed.substring(0, 40), messages: [], createdAt: Date.now(), updatedAt: Date.now() }; setConversations(prev => { let u = [newConvo, ...prev]; if (u.length > MAX_CONVERSATIONS) u = u.slice(0, MAX_CONVERSATIONS); return u; }); setActiveConvoId(convoId); }
    const userMsg: ChatMessage = { role: 'user', content: trimmed, timestamp: Date.now() };
    const currentMessages = [...messages, userMsg];
    updateConvoMessages(convoId, currentMessages); setInput(''); setIsGenerating(true);
    try {
      let kbContext = '', orgRules = '';
      if (activeOrg?.id) { try { const kb = await knowledgeBaseService.searchKnowledgeBase(activeOrg.id, trimmed, 5); if (kb.length > 0) kbContext = '\n\n--- KNOWLEDGE BASE ---\n' + kb.join('\n\n'); } catch {} try { const ins = await organizationService.getActiveOrgInstructions?.(); if (ins) orgRules = '\n\n--- ORGANIZATION RULES ---\n' + JSON.stringify(ins); } catch {} }
      const hist = currentMessages.slice(-10).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
      const prompt = `You are EURO-OFFICE AI Assistant.\nLanguage: ${language === 'si' ? 'Slovenian' : 'English'}${kbContext}${orgRules}\n\nConversation:\n${hist}\n\nUser: ${trimmed}\nAssistant:`;
      const result = await generateContent({ prompt });
      const aiResp = result?.text || (language === 'si' ? 'Napaka.' : 'Error.');
      updateConvoMessages(convoId, [...currentMessages, { role: 'assistant', content: aiResp, timestamp: Date.now() }]);
    } catch (e: any) { updateConvoMessages(convoId, [...currentMessages, { role: 'assistant', content: `Error: ${e.message}`, timestamp: Date.now() }]); }
    finally { setIsGenerating(false); inputRef.current?.focus(); }
  }, [input, isGenerating, activeConvoId, messages, activeOrg, language, updateConvoMessages]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, height: '100%', minHeight: 300 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm, flexShrink: 0 }}>
        <button onClick={createNewConvo} style={{ background: c.primary[500], color: '#fff', border: 'none', borderRadius: radii.md, padding: `${spacing.xs} ${spacing.sm}`, fontSize: typography.fontSize.xs, cursor: 'pointer', fontWeight: typography.fontWeight.semibold }}>+ {language === 'si' ? 'Nov pogovor' : 'New chat'}</button>
        <button onClick={() => setShowHistory(!showHistory)} style={{ background: showHistory ? c.primary[100] : 'transparent', color: c.text.body, border: `1px solid ${c.border.light}`, borderRadius: radii.md, padding: `${spacing.xs} ${spacing.sm}`, fontSize: typography.fontSize.xs, cursor: 'pointer' }}>{language === 'si' ? `Zgodovina (${conversations.length})` : `History (${conversations.length})`}</button>
      </div>
      {showHistory && (
        <div style={{ maxHeight: 150, overflowY: 'auto', marginBottom: spacing.sm, border: `1px solid ${c.border.light}`, borderRadius: radii.md, background: isDark ? c.surface.sidebar : c.surface.main }}>
          {conversations.length === 0 && <div style={{ padding: spacing.sm, fontSize: typography.fontSize.xs, color: c.text.muted, textAlign: 'center' as const }}>{language === 'si' ? 'Ni pogovorov' : 'No conversations'}</div>}
          {conversations.map(conv => (
            <div key={conv.id} style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, padding: `${spacing.xs} ${spacing.sm}`, background: conv.id === activeConvoId ? (isDark ? c.primary[900]+'30' : c.primary[50]) : 'transparent', cursor: 'pointer', borderBottom: `1px solid ${c.border.light}` }}>
              <div onClick={() => { setActiveConvoId(conv.id); setShowHistory(false); }} style={{ flex: 1, fontSize: typography.fontSize.xs, color: c.text.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.title}</div>
              <div style={{ fontSize: '9px', color: c.text.muted, flexShrink: 0 }}>{new Date(conv.updatedAt).toLocaleDateString()}</div>
              <button onClick={(e) => { e.stopPropagation(); deleteConvo(conv.id); }} style={{ background: 'none', border: 'none', color: c.error[500], cursor: 'pointer', fontSize: '14px', padding: '2px', lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>
      )}
      <div ref={chatContainerRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column' as const, gap: spacing.xs, marginBottom: spacing.sm }}>
        {messages.length === 0 && <div style={{ textAlign: 'center' as const, color: c.text.muted, fontSize: typography.fontSize.xs, padding: spacing.xl }}>{language === 'si' ? 'Pozdravljen! Sem EURO-OFFICE AI pomočnik.' : 'Hello! I\'m the EURO-OFFICE AI Assistant.'}</div>}
        {messages.map((msg, idx) => (
          <div key={idx} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', background: msg.role === 'user' ? c.primary[500] : (isDark ? c.surface.sidebar : c.surface.main), color: msg.role === 'user' ? '#fff' : c.text.body, borderRadius: radii.lg, padding: `${spacing.xs} ${spacing.sm}`, fontSize: typography.fontSize.xs, border: msg.role === 'assistant' ? `1px solid ${c.border.light}` : 'none', wordBreak: 'break-word' as const, lineHeight: 1.5 }}>
            {msg.role === 'assistant' ? renderFormattedText(msg.content) : msg.content}
          </div>
        ))}
        {isGenerating && <div style={{ alignSelf: 'flex-start', maxWidth: '85%', background: isDark ? c.surface.sidebar : c.surface.main, borderRadius: radii.lg, padding: `${spacing.xs} ${spacing.sm}`, fontSize: typography.fontSize.xs, color: c.text.muted, border: `1px solid ${c.border.light}` }}>{language === 'si' ? 'Generiram...' : 'Generating...'}<span style={{ animation: 'pulse 1.5s infinite' }}> ●</span></div>}
        <div ref={chatEndRef} />
      </div>
      <div style={{ display: 'flex', gap: spacing.xs, flexShrink: 0 }}>
        <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder={language === 'si' ? 'Vprašajte AI pomočnika...' : 'Ask the AI assistant...'} disabled={isGenerating} style={{ flex: 1, padding: `${spacing.xs} ${spacing.sm}`, borderRadius: radii.md, border: `1px solid ${c.border.light}`, background: isDark ? c.surface.sidebar : c.surface.main, color: c.text.body, fontSize: typography.fontSize.xs, outline: 'none' }} />
        <button onClick={handleSend} disabled={isGenerating || !input.trim()} style={{ background: c.primary[500], color: '#fff', border: 'none', borderRadius: radii.md, padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.fontSize.xs, cursor: isGenerating ? 'not-allowed' : 'pointer', opacity: isGenerating || !input.trim() ? 0.5 : 1, fontWeight: typography.fontWeight.semibold }}>{isGenerating ? '...' : '➤'}</button>
      </div>
    </div>
  );
};

// ——— Main DashboardHome ————————————————————————

const DashboardHome: React.FC<DashboardHomeProps> = ({
  language, projectsMeta, currentProjectId, projectData, activeOrg, userOrgs,
  isAdmin, onOpenProject, onCreateProject, onOpenAdmin, onOpenSettings, onSwitchOrg,
}) => {
  const [isDark, setIsDark] = useState(getThemeMode() === 'dark');
  const c = isDark ? darkColors : lightColors;
  const containerRef = useRef<HTMLDivElement>(null);

  // ★ v6.0: Email modal state — lives at DashboardHome level so it renders OUTSIDE all cards
  const [emailModal, setEmailModal] = useState<{ name: string; email: string; orgName: string } | null>(null);
  const currentUserName = storageService.getCurrentUserDisplayName() || 'User';

  useEffect(() => { const u = onThemeChange((m) => setIsDark(m === 'dark')); return u; }, []);
  useEffect(() => { if (containerRef.current) containerRef.current.scrollTop = 0; const ca = document.getElementById('main-content-area'); if (ca) ca.scrollTop = 0; window.scrollTo(0, 0); }, []);

  const [cardOrder, setCardOrder] = useState<CardId[]>(() => {
    try { const s = localStorage.getItem('euro-office-card-order'); if (s) { const p = JSON.parse(s); const valid = p.filter((x: string) => DEFAULT_CARD_ORDER.includes(x as CardId)); return [...new Set([...valid, ...DEFAULT_CARD_ORDER])] as CardId[]; } } catch {}
    return DEFAULT_CARD_ORDER;
  });

  const [cardSizes, setCardSizes] = useState<Record<string, number>>(() => {
    try { const s = localStorage.getItem('euro-office-card-sizes'); if (s) return { ...DEFAULT_CARD_SIZES, ...JSON.parse(s) }; } catch {}
    return { ...DEFAULT_CARD_SIZES };
  });

  const [draggingId, setDraggingId] = useState<CardId | null>(null);

  useEffect(() => { try { localStorage.setItem('euro-office-card-order', JSON.stringify(cardOrder)); } catch {} }, [cardOrder]);
  useEffect(() => { try { localStorage.setItem('euro-office-card-sizes', JSON.stringify(cardSizes)); } catch {} }, [cardSizes]);

  const handleResize = useCallback((id: CardId, span: number) => { setCardSizes(prev => ({ ...prev, [id]: span })); }, []);

  const dragHandlers = useMemo(() => ({
    onDragStart: (e: React.DragEvent, id: CardId) => { setDraggingId(id); e.dataTransfer.effectAllowed = 'move'; },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; },
    onDrop: (e: React.DragEvent, targetId: CardId) => {
      e.preventDefault(); if (!draggingId || draggingId === targetId) return;
      setCardOrder(prev => { const n = [...prev]; const fi = n.indexOf(draggingId); const ti = n.indexOf(targetId); if (fi === -1 || ti === -1) return prev; n.splice(fi, 1); n.splice(ti, 0, draggingId); return n; });
      setDraggingId(null);
    },
    onDragEnd: () => setDraggingId(null),
  }), [draggingId]);

  const handleDropAtEnd = useCallback((e: React.DragEvent) => {
    e.preventDefault(); if (!draggingId) return;
    setCardOrder(prev => { const n = prev.filter(id => id !== draggingId); n.push(draggingId); return n; });
    setDraggingId(null);
  }, [draggingId]);

  const totalProjects = projectsMeta.length;
  const orgName = activeOrg?.name || (language === 'si' ? 'Osebni prostor' : 'Personal workspace');

  const visibleCards = cardOrder.filter(id => !(id === 'admin' && !isAdmin));

  return (
    <div ref={containerRef} style={{ padding: spacing.xl, maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column' as const, gap: spacing.lg }}>
      <div style={{ marginBottom: spacing.sm }}>
        <h1 style={{ margin: 0, fontSize: typography.fontSize['2xl'], fontWeight: typography.fontWeight.bold, color: c.text.heading }}>{language === 'si' ? 'Nadzorna plošča' : 'Dashboard'}</h1>
        <p style={{ margin: `${spacing.xs} 0 0`, color: c.text.muted, fontSize: typography.fontSize.sm }}>{orgName}{totalProjects > 0 && ` · ${totalProjects} ${language === 'si' ? 'projektov' : 'projects'}`}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`, gap: spacing.lg, alignItems: 'start' }}>
        {visibleCards.map(cardId => {
          const cardConfig: Record<CardId, { title: string; icon: string }> = {
            projects: { title: language === 'si' ? 'Moji projekti' : 'My Projects', icon: '📁' },
            chatbot: { title: language === 'si' ? 'AI Pomočnik' : 'AI Chatbot', icon: '🤖' },
            admin: { title: 'Super Admin', icon: '🛡️' },
            organization: { title: language === 'si' ? 'Organizacija' : 'Organization', icon: '🏢' },
            activity: { title: language === 'si' ? 'Projektne grafike' : 'Project Charts', icon: '📈' },
          };
          const config = cardConfig[cardId];
          if (!config) return null;
          const colSpan = cardSizes[cardId] || DEFAULT_CARD_SIZES[cardId] || 1;

          return (
            <DashboardCard key={cardId} id={cardId} title={config.title} icon={config.icon}
              isDark={isDark} colors={c} colSpan={colSpan} language={language}
              onResize={handleResize} dragHandlers={dragHandlers} draggingId={draggingId}>

              {cardId === 'projects' && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: spacing.sm }}>
                  <button onClick={onCreateProject} style={{ background: c.primary[500], color: '#fff', border: 'none', borderRadius: radii.md, padding: `${spacing.sm} ${spacing.md}`, fontSize: typography.fontSize.sm, cursor: 'pointer', fontWeight: typography.fontWeight.semibold, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.xs }}>+ {language === 'si' ? 'Nov projekt' : 'New Project'}</button>
                  {projectsMeta.length === 0 && <div style={{ textAlign: 'center' as const, color: c.text.muted, fontSize: typography.fontSize.xs, padding: spacing.md }}>{language === 'si' ? 'Še nimate projektov.' : 'No projects yet.'}</div>}
                  {projectsMeta.map(p => {
                    const progress = getProjectProgress(p.id === currentProjectId ? projectData : null);
                    return (
                      <div key={p.id} onClick={() => onOpenProject(p.id)} style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radii.md, border: `1px solid ${p.id === currentProjectId ? c.primary[400] : c.border.light}`, cursor: 'pointer', background: p.id === currentProjectId ? (isDark ? c.primary[900]+'20' : c.primary[50]) : 'transparent', transition: `all ${animation.duration.fast} ${animation.easing.default}` }}>
                        <LocalProgressRing percent={progress} size={40} strokeWidth={4} color={c.primary[500]} bgColor={c.border.light} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: c.text.heading, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || p.name || (language === 'si' ? 'Brez imena' : 'Untitled')}</div>
                          {p.acronym && <div style={{ fontSize: '10px', color: c.text.muted }}>{p.acronym}</div>}
                        </div>
                        <div style={{ fontSize: typography.fontSize.xs, color: c.text.muted, flexShrink: 0 }}>{progress}%</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {cardId === 'chatbot' && <AIChatbot language={language} isDark={isDark} colors={c} activeOrg={activeOrg} />}

              {cardId === 'admin' && isAdmin && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.xs }}>
                  {[
                    { label: language === 'si' ? 'Uporabniki' : 'Users', tab: 'users', icon: '👥' },
                    { label: language === 'si' ? 'Navodila' : 'Instructions', tab: 'instructions', icon: '📝' },
                    { label: language === 'si' ? 'AI nastavitve' : 'AI Settings', tab: 'ai', icon: '🤖' },
                    { label: language === 'si' ? 'Dnevnik napak' : 'Error Log', tab: 'errors', icon: '🐛' },
                    { label: language === 'si' ? 'Revizijska sled' : 'Audit Trail', tab: 'audit', icon: '📋' },
                    { label: language === 'si' ? 'Profil' : 'Profile', tab: 'profile', icon: '👤' },
                    { label: language === 'si' ? 'Baza znanja' : 'Knowledge Base', tab: 'knowledge', icon: '📚' },
                  ].map(item => (
                    <button key={item.tab} onClick={() => onOpenAdmin(item.tab)} style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, borderRadius: radii.md, border: `1px solid ${c.border.light}`, background: 'transparent', cursor: 'pointer', color: c.text.body, fontSize: typography.fontSize.xs, textAlign: 'left' as const }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? c.primary[900]+'30' : c.primary[50]; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                      <span>{item.icon}</span> {item.label}
                    </button>
                  ))}
                </div>
              )}

              {cardId === 'organization' && (
                <OrganizationCard
                  language={language} isDark={isDark} colors={c}
                  activeOrg={activeOrg} userOrgs={userOrgs} isAdmin={isAdmin}
                  onSwitchOrg={onSwitchOrg} onOpenProject={onOpenProject}
                  onOpenEmailModal={(recipient) => setEmailModal(recipient)}
                />
              )}

              {cardId === 'activity' && (
                <ProjectChartsCard language={language} isDark={isDark} colors={c} colSpan={colSpan}
                  projectsMeta={projectsMeta} projectData={projectData}
                  currentProjectId={currentProjectId} onOpenProject={onOpenProject} />
              )}
            </DashboardCard>
          );
        })}

        <DropZone index={visibleCards.length} isDark={isDark} colors={c} draggingId={draggingId} onDropAtEnd={handleDropAtEnd} />
      </div>

      {/* ★ v6.0: EmailModal — renders at root level, OUTSIDE all cards */}
      <EmailModal
        isOpen={emailModal !== null}
        onClose={() => setEmailModal(null)}
        recipientName={emailModal?.name || ''}
        recipientEmail={emailModal?.email || ''}
        orgName={emailModal?.orgName || ''}
        senderName={currentUserName}
        language={language}
        isDarkMode={isDark}
      />
    </div>
  );
};

export default DashboardHome;
