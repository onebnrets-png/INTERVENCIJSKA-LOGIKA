// components/DashboardHome.tsx
// ═══════════════════════════════════════════════════════════════════
// EURO-OFFICE Dashboard Home — Main view after login
// v5.0 — 2026-02-20
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
    // Process inline: **bold**, *italic*, `code`
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let partIdx = 0;

    while (remaining.length > 0) {
      // Bold: **text**
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      // Italic: *text*
      const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);
      // Code: `text`
      const codeMatch = remaining.match(/`(.+?)`/);

      // Find earliest match
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
      // Text before match
      if (first.idx > 0) {
        parts.push(<span key={`${key}-${partIdx++}`}>{remaining.substring(0, first.idx)}</span>);
      }

      // Matched content
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

    // Headings: ### → h3, ## → h2, # → h1
    if (trimmed.startsWith('### ')) {
      elements.push(<div key={`l-${i}`} style={{ fontWeight: 700, fontSize: '1em', margin: '8px 0 4px' }}>{formatInline(trimmed.slice(4), `h3-${i}`)}</div>);
    } else if (trimmed.startsWith('## ')) {
      elements.push(<div key={`l-${i}`} style={{ fontWeight: 700, fontSize: '1.05em', margin: '8px 0 4px' }}>{formatInline(trimmed.slice(3), `h2-${i}`)}</div>);
    } else if (trimmed.startsWith('# ')) {
      elements.push(<div key={`l-${i}`} style={{ fontWeight: 700, fontSize: '1.1em', margin: '10px 0 4px' }}>{formatInline(trimmed.slice(2), `h1-${i}`)}</div>);
    }
    // Horizontal rule
    else if (trimmed === '---' || trimmed === '***') {
      elements.push(<hr key={`l-${i}`} style={{ border: 'none', borderTop: '1px solid rgba(128,128,128,0.2)', margin: '8px 0' }} />);
    }
    // Bullet list
    else if (/^[\*\-]\s/.test(trimmed)) {
      elements.push(<div key={`l-${i}`} style={{ paddingLeft: '12px', margin: '2px 0', display: 'flex', gap: '6px' }}><span style={{ flexShrink: 0 }}>•</span><span>{formatInline(trimmed.slice(2), `li-${i}`)}</span></div>);
    }
    // Numbered list
    else if (/^\d+\.\s/.test(trimmed)) {
      const numEnd = trimmed.indexOf('. ');
      const num = trimmed.substring(0, numEnd + 1);
      elements.push(<div key={`l-${i}`} style={{ paddingLeft: '12px', margin: '2px 0', display: 'flex', gap: '6px' }}><span style={{ flexShrink: 0 }}>{num}</span><span>{formatInline(trimmed.slice(numEnd + 2), `nl-${i}`)}</span></div>);
    }
    // Empty line
    else if (trimmed === '') {
      elements.push(<div key={`l-${i}`} style={{ height: '6px' }} />);
    }
    // Normal paragraph
    else {
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

  // ★ v5.0: Responsive chart dimensions based on colSpan
  const chartW = colSpan >= 2 ? CHART_WIDTH : Math.min(200, CHART_WIDTH);
  const chartH = colSpan >= 2 ? CHART_HEIGHT : Math.min(130, CHART_HEIGHT);
  const isNarrow = colSpan < 2;

  return (
    <div style={{ display: 'flex', flexDirection: isNarrow ? 'column' as const : 'row' as const, gap: spacing.md, minHeight: isNarrow ? 300 : 220 }}>
      {/* Left: acronyms */}
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

      {/* Right: charts */}
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

// ——— Organization Card — 3-tier visibility ————————
// Super Admin → ALL orgs, ALL users, ALL projects
// Org Admin → own org members + all org projects
// Member → own org info + self only

const OrganizationCard: React.FC<{
  language: 'en' | 'si'; isDark: boolean; colors: any;
  activeOrg: any | null; userOrgs: any[]; isAdmin: boolean;
  onSwitchOrg: (orgId: string) => void; onOpenProject: (projectId: string) => void;
}> = ({ language, isDark, colors: c, activeOrg, userOrgs, isAdmin, onSwitchOrg, onOpenProject }) => {
  const [allOrgs, setAllOrgs] = useState<any[]>([]);
  const [allMembers, setAllMembers] = useState<Record<string, OrganizationMember[]>>({});
  const [allProjects, setAllProjects] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'members' | 'projects'>('members');
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);
  const t = language === 'si';

  const isSuperAdmin = storageService.isSuperAdmin();
  const isOrgAdmin = isAdmin; // org-level admin

  useEffect(() => {
    setLoading(true);
    const loadData = async () => {
      try {
        if (isSuperAdmin) {
          // ★ SUPER ADMIN: Load ALL organizations
          const orgs = await organizationService.getAllOrgs();
          setAllOrgs(orgs);

          // Load members + projects for each org
          const membersMap: Record<string, OrganizationMember[]> = {};
          const projectsMap: Record<string, any[]> = {};

          for (const org of orgs) {
            const m = await organizationService.getOrgMembers(org.id);
            membersMap[org.id] = m;

            const { data: projects } = await supabase
              .from('projects')
              .select('id, title, owner_id, updated_at')
              .eq('organization_id', org.id)
              .order('updated_at', { ascending: false });
            projectsMap[org.id] = projects || [];
          }

          setAllMembers(membersMap);
          setAllProjects(projectsMap);

          // Auto-expand first org
          if (orgs.length > 0 && !expandedOrgId) {
            setExpandedOrgId(activeOrg?.id || orgs[0].id);
          }
        } else if (activeOrg?.id) {
          // ★ ORG ADMIN or MEMBER: Load only own org
          const orgs = [activeOrg];
          setAllOrgs(orgs);

          const m = await organizationService.getOrgMembers(activeOrg.id);

          if (isOrgAdmin) {
            // Admin sees all members
            setAllMembers({ [activeOrg.id]: m });
          } else {
            // Regular member sees only themselves
            const currentUserId = await storageService.getCurrentUserId();
            const selfOnly = m.filter(member => member.userId === currentUserId);
            setAllMembers({ [activeOrg.id]: selfOnly });
          }

          const { data: projects } = await supabase
            .from('projects')
            .select('id, title, owner_id, updated_at')
            .eq('organization_id', activeOrg.id)
            .order('updated_at', { ascending: false });

          if (isOrgAdmin) {
            // Admin sees all org projects
            setAllProjects({ [activeOrg.id]: projects || [] });
          } else {
            // Member sees only own projects
            const currentUserId = await storageService.getCurrentUserId();
            setAllProjects({ [activeOrg.id]: (projects || []).filter(p => p.owner_id === currentUserId) });
          }

          setExpandedOrgId(activeOrg.id);
        }
      } catch (err) {
        console.warn('OrganizationCard: failed to load data', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [activeOrg?.id, isSuperAdmin, isOrgAdmin]);

  const roleLabel = (role: string) => {
    const labels: Record<string, { en: string; si: string }> = {
      owner: { en: 'Owner', si: 'Lastnik' },
      admin: { en: 'Admin', si: 'Admin' },
      member: { en: 'Member', si: 'Član' },
    };
    return labels[role]?.[language] || role;
  };

  const roleBadgeColor = (role: string) => {
    if (role === 'owner') return c.warning[500];
    if (role === 'admin') return c.primary[500];
    return c.success[500];
  };

  const totalMembers = Object.values(allMembers).reduce((sum, arr) => sum + arr.length, 0);
  const totalProjects = Object.values(allProjects).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: spacing.sm }}>
      {/* ── Header: Super Admin badge + org count ── */}
      {isSuperAdmin && (
        <div style={{ padding: `${spacing.xs} ${spacing.sm}`, borderRadius: radii.md, background: `linear-gradient(135deg, ${c.warning[500]}15, ${c.primary[500]}15)`, border: `1px solid ${c.warning[300]}`, display: 'flex', alignItems: 'center', gap: spacing.xs }}>
          <span style={{ fontSize: '14px' }}>👑</span>
          <div>
            <div style={{ fontSize: '11px', fontWeight: typography.fontWeight.bold, color: c.warning[700] }}>Super Admin</div>
            <div style={{ fontSize: '9px', color: c.text.muted }}>
              {allOrgs.length} {t ? 'organizacij' : 'organizations'} · {totalMembers} {t ? 'uporabnikov' : 'users'} · {totalProjects} {t ? 'projektov' : 'projects'}
            </div>
          </div>
        </div>
      )}

      {/* ── Switch org (non-super-admin with multiple orgs) ── */}
      {!isSuperAdmin && userOrgs.length > 1 && (
        <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' as const }}>
          {userOrgs.map(org => (
            <button key={org.id} onClick={() => onSwitchOrg(org.id)}
              style={{ background: org.id === activeOrg?.id ? (isDark ? c.primary[900]+'60' : c.primary[100]) : 'transparent', border: `1px solid ${org.id === activeOrg?.id ? c.primary[400] : c.border.light}`, borderRadius: radii.md, padding: `3px ${spacing.sm}`, fontSize: '10px', cursor: 'pointer', color: org.id === activeOrg?.id ? c.primary[600] : c.text.body, fontWeight: org.id === activeOrg?.id ? typography.fontWeight.bold : typography.fontWeight.normal }}>
              {org.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Tabs: Members / Projects ── */}
      <div style={{ display: 'flex', gap: spacing.xs }}>
        <button onClick={() => setActiveTab('members')}
          style={{ flex: 1, padding: `${spacing.xs} ${spacing.sm}`, borderRadius: radii.md, border: `1px solid ${activeTab === 'members' ? c.primary[400] : c.border.light}`, background: activeTab === 'members' ? (isDark ? c.primary[900]+'40' : c.primary[50]) : 'transparent', color: activeTab === 'members' ? c.primary[600] : c.text.muted, fontSize: typography.fontSize.xs, cursor: 'pointer', fontWeight: activeTab === 'members' ? typography.fontWeight.semibold : typography.fontWeight.normal }}>
          {t ? `Člani (${totalMembers})` : `Members (${totalMembers})`}
        </button>
        <button onClick={() => setActiveTab('projects')}
          style={{ flex: 1, padding: `${spacing.xs} ${spacing.sm}`, borderRadius: radii.md, border: `1px solid ${activeTab === 'projects' ? c.primary[400] : c.border.light}`, background: activeTab === 'projects' ? (isDark ? c.primary[900]+'40' : c.primary[50]) : 'transparent', color: activeTab === 'projects' ? c.primary[600] : c.text.muted, fontSize: typography.fontSize.xs, cursor: 'pointer', fontWeight: activeTab === 'projects' ? typography.fontWeight.semibold : typography.fontWeight.normal }}>
          {t ? `Projekti (${totalProjects})` : `Projects (${totalProjects})`}
        </button>
      </div>

      {loading && <div style={{ fontSize: typography.fontSize.xs, color: c.text.muted, textAlign: 'center' as const, padding: spacing.sm }}>{t ? 'Nalagam...' : 'Loading...'}</div>}

      {/* ── Organization list (expandable) ── */}
      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: spacing.xs, maxHeight: 350, overflowY: 'auto' }}>
          {allOrgs.map(org => {
            const isExpanded = expandedOrgId === org.id;
            const orgMembers = allMembers[org.id] || [];
            const orgProjectList = allProjects[org.id] || [];
            const isCurrentOrg = org.id === activeOrg?.id;

            return (
              <div key={org.id} style={{ borderRadius: radii.md, border: `1px solid ${isCurrentOrg ? c.primary[300] : c.border.light}`, overflow: 'hidden' }}>
                {/* Org header — clickable to expand */}
                <div onClick={() => setExpandedOrgId(isExpanded ? null : org.id)}
                  style={{ padding: `${spacing.xs} ${spacing.sm}`, display: 'flex', alignItems: 'center', gap: spacing.sm, cursor: 'pointer', background: isExpanded ? (isDark ? c.primary[900]+'20' : c.primary[50]) : (isDark ? c.surface.sidebar : c.surface.main), transition: 'background 0.15s ease' }}
                  onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = isDark ? c.primary[900]+'15' : '#f8fafc'; }}
                  onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = isDark ? c.surface.sidebar : c.surface.main; }}>
                  {/* Expand arrow */}
                  <span style={{ fontSize: '10px', color: c.text.muted, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease', flexShrink: 0 }}>▶</span>
                  {/* Org icon */}
                  <div style={{ width: 28, height: 28, borderRadius: radii.sm, background: `linear-gradient(135deg, ${c.primary[400]}, ${c.secondary[400]})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
                    {org.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: c.text.heading, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{org.name}</div>
                    <div style={{ fontSize: '9px', color: c.text.muted }}>
                      {orgMembers.length} {t ? 'članov' : 'members'} · {orgProjectList.length} {t ? 'proj.' : 'proj.'}
                    </div>
                  </div>
                  {isCurrentOrg && <span style={{ fontSize: '8px', padding: '2px 6px', borderRadius: radii.full, background: c.success[500]+'20', color: c.success[600], fontWeight: 700, flexShrink: 0 }}>{t ? 'AKTIVNA' : 'ACTIVE'}</span>}
                  {!isCurrentOrg && isSuperAdmin && (
                    <button onClick={(e) => { e.stopPropagation(); onSwitchOrg(org.id); }}
                      style={{ fontSize: '9px', padding: '2px 6px', borderRadius: radii.md, border: `1px solid ${c.border.light}`, background: 'transparent', cursor: 'pointer', color: c.primary[500], flexShrink: 0 }}>
                      {t ? 'Preklopi' : 'Switch'}
                    </button>
                  )}
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ padding: `${spacing.xs} ${spacing.sm}`, borderTop: `1px solid ${c.border.light}`, background: isDark ? '#0f0f1a' : '#fafbfc' }}>
                    {activeTab === 'members' && (
                      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                        {orgMembers.length === 0 && <div style={{ fontSize: '10px', color: c.text.muted, fontStyle: 'italic', padding: spacing.xs }}>{t ? 'Ni članov' : 'No members'}</div>}
                        {orgMembers.map(m => {
                          const memberProjects = (allProjects[org.id] || []).filter(p => p.owner_id === m.userId);
                          return (
                            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, padding: '4px 6px', borderRadius: radii.sm, background: isDark ? c.surface.card : '#fff', border: `1px solid ${c.border.light}` }}>
                              <div style={{ width: 26, height: 26, borderRadius: '50%', background: `linear-gradient(135deg, ${roleBadgeColor(m.orgRole)}80, ${roleBadgeColor(m.orgRole)}40)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '10px', fontWeight: 700, flexShrink: 0 }}>
                                {(m.displayName || m.email || '?')[0].toUpperCase()}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '11px', fontWeight: typography.fontWeight.semibold, color: c.text.heading, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {m.displayName || m.email?.split('@')[0] || '—'}
                                </div>
                                <div style={{ fontSize: '9px', color: c.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</div>
                              </div>
                              {memberProjects.length > 0 && (
                                <span style={{ fontSize: '9px', color: c.primary[500], flexShrink: 0 }}>{memberProjects.length} {t ? 'proj.' : 'proj.'}</span>
                              )}
                              <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: radii.full, background: roleBadgeColor(m.orgRole)+'20', color: roleBadgeColor(m.orgRole), fontWeight: 700, textTransform: 'uppercase' as const, flexShrink: 0 }}>{roleLabel(m.orgRole)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {activeTab === 'projects' && (
                      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                        {orgProjectList.length === 0 && <div style={{ fontSize: '10px', color: c.text.muted, fontStyle: 'italic', padding: spacing.xs }}>{t ? 'Ni projektov' : 'No projects'}</div>}
                        {orgProjectList.map(p => {
                          const owner = orgMembers.find(m => m.userId === p.owner_id);
                          const canOpen = isSuperAdmin || isOrgAdmin || p.owner_id === orgMembers.find(m => true)?.userId;
                          return (
                            <div key={p.id}
                              onClick={() => { if (canOpen) onOpenProject(p.id); }}
                              style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, padding: '4px 6px', borderRadius: radii.sm, cursor: canOpen ? 'pointer' : 'default', background: isDark ? c.surface.card : '#fff', border: `1px solid ${c.border.light}`, transition: 'background 0.1s ease' }}
                              onMouseEnter={canOpen ? (e) => { e.currentTarget.style.background = isDark ? c.primary[900]+'20' : c.primary[50]; } : undefined}
                              onMouseLeave={canOpen ? (e) => { e.currentTarget.style.background = isDark ? c.surface.card : '#fff'; } : undefined}>
                              <div style={{ width: 24, height: 24, borderRadius: radii.sm, background: isDark ? '#334155' : c.primary[50], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', flexShrink: 0 }}>📄</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '11px', fontWeight: typography.fontWeight.semibold, color: c.text.heading, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || (t ? 'Brez imena' : 'Untitled')}</div>
                                <div style={{ fontSize: '9px', color: c.text.muted }}>
                                  {owner?.displayName || owner?.email?.split('@')[0] || (t ? 'Neznan' : 'Unknown')} · {new Date(p.updated_at).toLocaleDateString()}
                                </div>
                              </div>
                              {canOpen && <span style={{ fontSize: '9px', color: c.primary[400], flexShrink: 0 }}>→</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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

  // ★ v5.0: Scroll to bottom ONLY when new message is added (not on mount/switch)
  const prevMsgCountRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      // New message added — scroll to bottom
      requestAnimationFrame(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); });
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length]);

  // ★ v5.0: When switching conversation, scroll to TOP of chat container
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
      {/* ★ v5.0: Chat container with ref for scroll management */}
      <div ref={chatContainerRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column' as const, gap: spacing.xs, marginBottom: spacing.sm }}>
        {messages.length === 0 && <div style={{ textAlign: 'center' as const, color: c.text.muted, fontSize: typography.fontSize.xs, padding: spacing.xl }}>{language === 'si' ? 'Pozdravljen! Sem EURO-OFFICE AI pomočnik.' : 'Hello! I\'m the EURO-OFFICE AI Assistant.'}</div>}
        {messages.map((msg, idx) => (
          <div key={idx} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', background: msg.role === 'user' ? c.primary[500] : (isDark ? c.surface.sidebar : c.surface.main), color: msg.role === 'user' ? '#fff' : c.text.body, borderRadius: radii.lg, padding: `${spacing.xs} ${spacing.sm}`, fontSize: typography.fontSize.xs, border: msg.role === 'assistant' ? `1px solid ${c.border.light}` : 'none', wordBreak: 'break-word' as const, lineHeight: 1.5 }}>
            {/* ★ v5.0: Render formatted text instead of raw markdown */}
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
                <OrganizationCard language={language} isDark={isDark} colors={c} activeOrg={activeOrg} userOrgs={userOrgs} isAdmin={isAdmin} onSwitchOrg={onSwitchOrg} onOpenProject={onOpenProject} />
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
    </div>
  );
};

export default DashboardHome;
