// components/DashboardHome.tsx
// ═══════════════════════════════════════════════════════════════════
// EURO-OFFICE Dashboard Home — Main view after login
// v4.4 — 2026-02-20
//
// CHANGES v4.4:
//   - NEW: ProgressRing (design system) shown in ProjectChartsCard
//   - NEW: calculateCompleteness function for accurate project progress
//   - KEEP: Cards resizable (◂ ▸), empty grid slots as drop targets
//   - KEEP: Project Charts card always full-width, horizontal chart scroll
//   - KEEP: AI Chatbot, KB search, drag-and-drop reorder
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { colors as lightColors, darkColors, shadows, radii, spacing, animation, typography } from '../design/theme.ts';
import { getThemeMode, onThemeChange } from '../services/themeService.ts';
import { storageService } from '../services/storageService.ts';
import { organizationService } from '../services/organizationService.ts';
import { knowledgeBaseService } from '../services/knowledgeBaseService.ts';
import { TEXT } from '../locales.ts';
import { generateContent } from '../services/aiProvider.ts';
import { extractStructuralData } from '../services/DataExtractionService.ts';
import type { ExtractedChartData } from '../services/DataExtractionService.ts';
import ChartRenderer from './ChartRenderer.tsx';
import { ProgressRing as DesignProgressRing } from '../design/index.ts';

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

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

type CardId = 'projects' | 'chatbot' | 'statistics' | 'admin' | 'organization' | 'aiSettings' | 'activity';

const DEFAULT_CARD_ORDER: CardId[] = ['projects', 'chatbot', 'statistics', 'admin', 'organization', 'aiSettings', 'activity'];

const CHAT_STORAGE_KEY = 'euro-office-chat-conversations';
const MAX_CONVERSATIONS = 20;
const GRID_COLS = 2;
const CHART_WIDTH = 260;
const CHART_HEIGHT = 160;

// ——— Helpers: detect real content (for completeness) ———————

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

// ——— Completeness calculation (same as DashboardPanel) ———

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

// ——— Simple progress helper (for project list) ————————

function getProjectProgress(projectData: any): number {
  if (!projectData) return 0;
  let filled = 0;
  const total = 8;
  if (projectData.problemAnalysis?.coreProblem?.title?.trim()) filled++;
  if (projectData.projectIdea?.mainAim?.trim()) filled++;
  if (projectData.generalObjectives?.some((o: any) => o.title?.trim())) filled++;
  if (projectData.specificObjectives?.some((o: any) => o.title?.trim())) filled++;
  if (projectData.activities?.some((a: any) => a.title?.trim())) filled++;
  if (projectData.outputs?.some((o: any) => o.title?.trim())) filled++;
  if (projectData.outcomes?.some((o: any) => o.title?.trim())) filled++;
  if (projectData.impacts?.some((o: any) => o.title?.trim())) filled++;
  return Math.round((filled / total) * 100);
}

// ——— Local ProgressRing (used in project list only) ————

const ProgressRing: React.FC<{ percent: number; size?: number; strokeWidth?: number; color: string; bgColor: string }> = ({
  percent, size = 64, strokeWidth = 6, color, bgColor
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={bgColor} strokeWidth={strokeWidth} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
    </svg>
  );
};

// ——— Card Wrapper — resizable + draggable ————————

interface CardProps {
  id: CardId; title: string; icon: string; children: React.ReactNode;
  isDark: boolean; colors: any; wide?: boolean;
  colSpan: number; language: 'en' | 'si';
  onResize: (id: CardId, span: number) => void;
  dragHandlers: {
    onDragStart: (e: React.DragEvent, id: CardId) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent, id: CardId) => void;
    onDragEnd: () => void;
  };
  draggingId: CardId | null;
}

const DashboardCard: React.FC<CardProps> = ({
  id, title, icon, children, isDark, colors: c, wide, colSpan, language,
  onResize, dragHandlers, draggingId,
}) => {
  const isDragging = draggingId === id;
  const effectiveSpan = wide ? GRID_COLS : Math.min(colSpan, GRID_COLS);

  return (
    <div
      draggable
      onDragStart={(e) => dragHandlers.onDragStart(e, id)}
      onDragOver={dragHandlers.onDragOver}
      onDrop={(e) => dragHandlers.onDrop(e, id)}
      onDragEnd={dragHandlers.onDragEnd}
      style={{
        background: c.surface.card, borderRadius: radii.xl,
        border: `1px solid ${isDragging ? c.primary[400] : c.border.light}`,
        boxShadow: isDragging ? shadows.xl : shadows.card, overflow: 'hidden',
        opacity: isDragging ? 0.7 : 1,
        transform: isDragging ? 'scale(1.02)' : 'scale(1)',
        transition: `all ${animation.duration.fast} ${animation.easing.default}`,
        gridColumn: `span ${effectiveSpan}`,
        display: 'flex', flexDirection: 'column' as const,
        cursor: 'grab', minHeight: 0,
      }}
    >
      <div style={{
        padding: `${spacing.md} ${spacing.lg}`,
        borderBottom: `1px solid ${c.border.light}`,
        display: 'flex', alignItems: 'center', gap: spacing.sm, flexShrink: 0,
      }}>
        <span style={{ fontSize: '18px' }}>{icon}</span>
        <h3 style={{
          margin: 0, fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.semibold,
          color: c.text.heading, flex: 1,
        }}>{title}</h3>

        {!wide && (
          <div style={{ display: 'flex', gap: '2px', marginRight: spacing.xs }}>
            {effectiveSpan > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); onResize(id, effectiveSpan - 1); }}
                draggable={false}
                title={language === 'si' ? 'Zoži' : 'Narrow'}
                style={{
                  background: 'none', border: `1px solid ${c.border.light}`,
                  borderRadius: radii.sm, width: 22, height: 22,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: c.text.muted, fontSize: '12px',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? c.primary[900] + '30' : c.primary[50]; e.currentTarget.style.color = c.primary[600]; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = c.text.muted; }}
              >◂</button>
            )}
            {effectiveSpan < GRID_COLS && (
              <button
                onClick={(e) => { e.stopPropagation(); onResize(id, effectiveSpan + 1); }}
                draggable={false}
                title={language === 'si' ? 'Razširi' : 'Widen'}
                style={{
                  background: 'none', border: `1px solid ${c.border.light}`,
                  borderRadius: radii.sm, width: 22, height: 22,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: c.text.muted, fontSize: '12px',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? c.primary[900] + '30' : c.primary[50]; e.currentTarget.style.color = c.primary[600]; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = c.text.muted; }}
              >▸</button>
            )}
          </div>
        )}

        <div style={{ cursor: 'grab', color: c.text.muted, display: 'flex' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="3" r="1.5"/><circle cx="11" cy="3" r="1.5"/>
            <circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/>
            <circle cx="5" cy="13" r="1.5"/><circle cx="11" cy="13" r="1.5"/>
          </svg>
        </div>
      </div>
      <div style={{ padding: spacing.lg, flex: 1, overflow: 'auto', minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
};

// ——— Drop Zone — invisible placeholder for empty grid slots ———

const DropZone: React.FC<{
  index: number; isDark: boolean; colors: any;
  draggingId: CardId | null;
  onDropAtEnd: (e: React.DragEvent) => void;
}> = ({ index, isDark, colors: c, draggingId, onDropAtEnd }) => {
  const [isOver, setIsOver] = useState(false);

  if (!draggingId) return null;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setIsOver(true); }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsOver(false); onDropAtEnd(e); }}
      style={{
        gridColumn: 'span 1',
        minHeight: 80,
        borderRadius: radii.xl,
        border: `2px dashed ${isOver ? c.primary[400] : c.border.light}`,
        background: isOver ? (isDark ? c.primary[900] + '20' : c.primary[50]) : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.2s ease',
        color: c.text.muted, fontSize: typography.fontSize.xs,
      }}
    >
      {isOver ? '↓' : ''}
    </div>
  );
};
// ——— Project Charts Card — horizontal layout WITH ProgressRing ———

const ProjectChartsCard: React.FC<{
  language: 'en' | 'si'; isDark: boolean; colors: any;
  projectsMeta: any[]; projectData: any;
  currentProjectId: string | null;
  onOpenProject: (projectId: string) => void;
}> = ({ language, isDark, colors: c, projectsMeta, projectData, currentProjectId, onOpenProject }) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);

  const activeId = selectedProjectId || currentProjectId || (projectsMeta.length > 0 ? projectsMeta[0]?.id : null);

  const chartsData: ExtractedChartData[] | null = useMemo(() => {
    if (!activeId || !projectData || activeId !== currentProjectId) return null;
    try { return extractStructuralData(projectData); } catch { return null; }
  }, [activeId, currentProjectId, projectData]);

  // ★ v4.4: Calculate completeness for the loaded project
  const completeness = useMemo(() => {
    if (!activeId || !projectData || activeId !== currentProjectId) return 0;
    return calculateCompleteness(projectData);
  }, [activeId, currentProjectId, projectData]);

  const handleProjectClick = useCallback((projectId: string) => {
    setSelectedProjectId(prev => prev === projectId ? null : projectId);
  }, []);
  const handleMouseEnter = useCallback((projectId: string) => { setHoveredProjectId(projectId); }, []);
  const handleMouseLeave = useCallback(() => { setHoveredProjectId(null); }, []);

  return (
    <div style={{ display: 'flex', gap: spacing.md, minHeight: 220 }}>
      {/* ── Left pane: project list with mini progress rings ── */}
      <div style={{
        width: 160, minWidth: 140, flexShrink: 0,
        borderRight: `1px solid ${c.border.light}`,
        overflowY: 'auto', paddingRight: spacing.sm,
      }}>
        <div style={{ fontSize: '10px', color: c.text.muted, fontWeight: typography.fontWeight.semibold, marginBottom: spacing.sm, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
          {language === 'si' ? 'Projekti' : 'Projects'} ({projectsMeta.length})
        </div>
        {projectsMeta.length === 0 && (
          <div style={{ fontSize: typography.fontSize.xs, color: c.text.muted, fontStyle: 'italic' }}>
            {language === 'si' ? 'Ni projektov' : 'No projects'}
          </div>
        )}
        {projectsMeta.map(p => {
          const isSelected = p.id === selectedProjectId;
          const isHovered = p.id === hoveredProjectId;
          const isCurrent = p.id === currentProjectId;
          const isActive = isSelected || (!selectedProjectId && isCurrent);
          // ★ v4.4: Mini completeness for the loaded project
          const miniCompleteness = isCurrent && projectData ? calculateCompleteness(projectData) : 0;
          return (
            <div key={p.id}
              onMouseEnter={() => handleMouseEnter(p.id)}
              onMouseLeave={handleMouseLeave}
              onClick={() => handleProjectClick(p.id)}
              style={{
                padding: `4px ${spacing.xs}`, borderRadius: radii.sm, cursor: 'pointer',
                background: isActive ? (isDark ? c.primary[900] + '60' : c.primary[100]) : isHovered ? (isDark ? c.primary[900] + '25' : c.primary[50]) : 'transparent',
                borderLeft: isActive ? `3px solid ${c.primary[500]}` : isHovered ? `3px solid ${c.primary[300]}` : '3px solid transparent',
                marginBottom: 2, transition: 'background 0.15s ease, border-left 0.15s ease',
                display: 'flex', alignItems: 'center', gap: spacing.xs,
              }}>
              {/* ★ v4.4: Mini ProgressRing per project */}
              {isCurrent ? (
                <DesignProgressRing value={miniCompleteness} size={24} strokeWidth={3} showLabel={true} labelSize="0.45rem" />
              ) : (
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                  background: isDark ? '#334155' : c.primary[50],
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '10px', color: c.text.muted, fontWeight: 700,
                }}>
                  {(p.acronym || '?')[0]}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: isActive ? typography.fontWeight.bold : typography.fontWeight.semibold, color: isActive ? c.primary[600] : c.text.heading, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.acronym || p.title?.substring(0, 10) || '—'}
                </div>
                <div style={{ fontSize: '9px', color: c.text.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.title || p.name || (language === 'si' ? 'Brez imena' : 'Untitled')}
                </div>
                {isCurrent && <div style={{ fontSize: '8px', color: c.success[600], fontWeight: typography.fontWeight.semibold }}>● {language === 'si' ? 'naložen' : 'loaded'}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Right pane: ProgressRing + charts (horizontal scroll) ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' as const, gap: spacing.xs }}>
        {activeId && (() => {
          const meta = projectsMeta.find(p => p.id === (hoveredProjectId || activeId));
          if (!meta) return null;
          return (
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
              {meta.acronym && <span style={{ fontSize: '11px', background: isDark ? c.primary[900] : c.primary[100], color: c.primary[700], padding: '2px 8px', borderRadius: radii.full, fontWeight: typography.fontWeight.bold }}>{meta.acronym}</span>}
              <span style={{ fontSize: typography.fontSize.xs, color: c.text.heading, fontWeight: typography.fontWeight.semibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.title || meta.name || ''}</span>
            </div>
          );
        })()}

        {!activeId && (
          <div style={{ color: c.text.muted, fontSize: typography.fontSize.sm, textAlign: 'center' as const, padding: spacing.xl, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {language === 'si' ? 'Izberite projekt za prikaz grafik' : 'Select a project to view charts'}
          </div>
        )}

        {activeId && activeId !== currentProjectId && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
            <div style={{ fontSize: typography.fontSize.xs, color: c.text.muted, textAlign: 'center' as const }}>
              {language === 'si' ? 'Odprite projekt za prikaz grafik.' : 'Open this project to view its charts.'}
            </div>
            <button onClick={(e) => { e.stopPropagation(); onOpenProject(activeId); }}
              style={{ background: c.primary[500], color: '#fff', border: 'none', borderRadius: radii.md, padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.fontSize.xs, cursor: 'pointer', fontWeight: typography.fontWeight.semibold }}>
              {language === 'si' ? 'Odpri projekt' : 'Open project'}
            </button>
          </div>
        )}

        {activeId && activeId === currentProjectId && (
          <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', display: 'flex', flexDirection: 'row' as const, gap: spacing.sm, paddingBottom: spacing.xs, alignItems: 'flex-start' }}>
            {/* ★ v4.4: ProgressRing as FIRST element in the chart row */}
            <div style={{
              flexShrink: 0, width: CHART_WIDTH,
              display: 'flex', flexDirection: 'column' as const,
              alignItems: 'center', justifyContent: 'center',
              gap: spacing.sm, padding: spacing.md,
              background: isDark ? '#1e1e2e' : '#f8fafc',
              borderRadius: radii.lg,
              border: `1px solid ${c.border.light}`,
              minHeight: CHART_HEIGHT,
            }}>
              <DesignProgressRing value={completeness} size={80} strokeWidth={6} showLabel={true} labelSize="0.8rem" />
              <div style={{ textAlign: 'center' as const }}>
                <div style={{ fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: c.text.heading }}>
                  {language === 'si' ? 'Zapolnjenost' : 'Completeness'}
                </div>
                <div style={{ fontSize: '10px', color: c.text.muted }}>
                  {completeness}%
                </div>
              </div>
            </div>

            {/* Charts */}
            {chartsData && chartsData.length > 0 && chartsData.map((chart: ExtractedChartData, idx: number) => (
              <div key={`chart-${idx}-${chart.chartType}`} style={{ flexShrink: 0, width: CHART_WIDTH }}>
                <ChartRenderer data={chart} width={CHART_WIDTH} height={CHART_HEIGHT} showTitle={true} showSource={false} />
              </div>
            ))}

            {(!chartsData || chartsData.length === 0) && (
              <div style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: typography.fontSize.xs, color: c.text.muted, padding: spacing.lg,
                fontStyle: 'italic',
              }}>
                {language === 'si' ? 'Ni podatkov za grafike. Izpolnite projektne sekcije.' : 'No chart data. Fill in project sections first.'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ——— AI Chatbot ———————————————————————————————————

const AIChatbot: React.FC<{ language: 'en' | 'si'; isDark: boolean; colors: any; activeOrg: any | null }> = ({ language, isDark, colors: c, activeOrg }) => {
  const [conversations, setConversations] = useState<ChatConversation[]>(() => {
    try { const s = localStorage.getItem(CHAT_STORAGE_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [activeConvoId, setActiveConvoId] = useState<string | null>(() => conversations[0]?.id || null);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeConvo = conversations.find(cv => cv.id === activeConvoId) || null;
  const messages = activeConvo?.messages || [];

  useEffect(() => { try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(conversations)); } catch {} }, [conversations]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const createNewConvo = useCallback(() => {
    const id = `chat-${Date.now()}`;
    const newConvo: ChatConversation = { id, title: language === 'si' ? 'Nov pogovor' : 'New conversation', messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    setConversations(prev => { let u = [newConvo, ...prev]; if (u.length > MAX_CONVERSATIONS) u = u.slice(0, MAX_CONVERSATIONS); return u; });
    setActiveConvoId(id); setShowHistory(false);
  }, [language]);

  const deleteConvo = useCallback((id: string) => {
    setConversations(prev => prev.filter(cv => cv.id !== id));
    if (activeConvoId === id) setActiveConvoId(null);
  }, [activeConvoId]);

  const updateConvoMessages = useCallback((convoId: string, newMessages: ChatMessage[]) => {
    setConversations(prev => prev.map(cv => {
      if (cv.id !== convoId) return cv;
      const title = newMessages.find(m => m.role === 'user')?.content.substring(0, 40) || cv.title;
      return { ...cv, messages: newMessages, title, updatedAt: Date.now() };
    }));
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating) return;
    let convoId = activeConvoId;
    if (!convoId) {
      convoId = `chat-${Date.now()}`;
      const newConvo: ChatConversation = { id: convoId, title: trimmed.substring(0, 40), messages: [], createdAt: Date.now(), updatedAt: Date.now() };
      setConversations(prev => { let u = [newConvo, ...prev]; if (u.length > MAX_CONVERSATIONS) u = u.slice(0, MAX_CONVERSATIONS); return u; });
      setActiveConvoId(convoId);
    }
    const userMsg: ChatMessage = { role: 'user', content: trimmed, timestamp: Date.now() };
    const currentMessages = [...messages, userMsg];
    updateConvoMessages(convoId, currentMessages); setInput(''); setIsGenerating(true);
    try {
      let kbContext = '', orgRules = '';
      if (activeOrg?.id) {
        try { const kb = await knowledgeBaseService.searchKnowledgeBase(activeOrg.id, trimmed, 5); if (kb.length > 0) kbContext = '\n\n--- KNOWLEDGE BASE ---\n' + kb.join('\n\n'); } catch {}
        try { const ins = await organizationService.getActiveOrgInstructions?.(activeOrg.id); if (ins) orgRules = '\n\n--- ORGANIZATION RULES ---\n' + ins; } catch {}
      }
      const hist = currentMessages.slice(-10).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
      const prompt = `You are EURO-OFFICE AI Assistant.\nLanguage: ${language === 'si' ? 'Slovenian' : 'English'}${kbContext}${orgRules}\n\nConversation:\n${hist}\n\nUser: ${trimmed}\nAssistant:`;
      const result = await generateContent({ prompt });
      const aiResp = result?.text || (language === 'si' ? 'Napaka.' : 'Error.');
      updateConvoMessages(convoId, [...currentMessages, { role: 'assistant', content: aiResp, timestamp: Date.now() }]);
    } catch (e: any) {
      updateConvoMessages(convoId, [...currentMessages, { role: 'assistant', content: `Error: ${e.message}`, timestamp: Date.now() }]);
    } finally { setIsGenerating(false); inputRef.current?.focus(); }
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
            <div key={conv.id} style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, padding: `${spacing.xs} ${spacing.sm}`, background: conv.id === activeConvoId ? (isDark ? c.primary[900] + '30' : c.primary[50]) : 'transparent', cursor: 'pointer', borderBottom: `1px solid ${c.border.light}` }}>
              <div onClick={() => { setActiveConvoId(conv.id); setShowHistory(false); }} style={{ flex: 1, fontSize: typography.fontSize.xs, color: c.text.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.title}</div>
              <div style={{ fontSize: '9px', color: c.text.muted, flexShrink: 0 }}>{new Date(conv.updatedAt).toLocaleDateString()}</div>
              <button onClick={(e) => { e.stopPropagation(); deleteConvo(conv.id); }} style={{ background: 'none', border: 'none', color: c.error[500], cursor: 'pointer', fontSize: '14px', padding: '2px', lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column' as const, gap: spacing.xs, marginBottom: spacing.sm }}>
        {messages.length === 0 && <div style={{ textAlign: 'center' as const, color: c.text.muted, fontSize: typography.fontSize.xs, padding: spacing.xl }}>{language === 'si' ? 'Pozdravljen! Sem EURO-OFFICE AI pomočnik.' : 'Hello! I\'m the EURO-OFFICE AI Assistant.'}</div>}
        {messages.map((msg, idx) => (
          <div key={idx} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', background: msg.role === 'user' ? c.primary[500] : (isDark ? c.surface.sidebar : c.surface.main), color: msg.role === 'user' ? '#fff' : c.text.body, borderRadius: radii.lg, padding: `${spacing.xs} ${spacing.sm}`, fontSize: typography.fontSize.xs, border: msg.role === 'assistant' ? `1px solid ${c.border.light}` : 'none', whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const }}>{msg.content}</div>
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
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
    const ca = document.getElementById('main-content-area');
    if (ca) ca.scrollTop = 0;
    window.scrollTo(0, 0);
  }, []);

  // Card order
  const [cardOrder, setCardOrder] = useState<CardId[]>(() => {
    try { const s = localStorage.getItem('euro-office-card-order'); if (s) { const p = JSON.parse(s); return [...new Set([...p.filter((x: string) => DEFAULT_CARD_ORDER.includes(x as CardId)), ...DEFAULT_CARD_ORDER])] as CardId[]; } } catch {}
    return DEFAULT_CARD_ORDER;
  });

  // Card sizes (colSpan per card)
  const [cardSizes, setCardSizes] = useState<Record<string, number>>(() => {
    try { const s = localStorage.getItem('euro-office-card-sizes'); if (s) return JSON.parse(s); } catch {}
    return {};
  });

  const [draggingId, setDraggingId] = useState<CardId | null>(null);

  useEffect(() => { try { localStorage.setItem('euro-office-card-order', JSON.stringify(cardOrder)); } catch {} }, [cardOrder]);
  useEffect(() => { try { localStorage.setItem('euro-office-card-sizes', JSON.stringify(cardSizes)); } catch {} }, [cardSizes]);

  const handleResize = useCallback((id: CardId, span: number) => {
    setCardSizes(prev => ({ ...prev, [id]: span }));
  }, []);

  const dragHandlers = useMemo(() => ({
    onDragStart: (e: React.DragEvent, id: CardId) => { setDraggingId(id); e.dataTransfer.effectAllowed = 'move'; },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; },
    onDrop: (e: React.DragEvent, targetId: CardId) => {
      e.preventDefault();
      if (!draggingId || draggingId === targetId) return;
      setCardOrder(prev => {
        const n = [...prev]; const fi = n.indexOf(draggingId); const ti = n.indexOf(targetId);
        if (fi === -1 || ti === -1) return prev;
        n.splice(fi, 1); n.splice(ti, 0, draggingId); return n;
      });
      setDraggingId(null);
    },
    onDragEnd: () => setDraggingId(null),
  }), [draggingId]);

  const handleDropAtEnd = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!draggingId) return;
    setCardOrder(prev => {
      const n = prev.filter(id => id !== draggingId);
      n.push(draggingId);
      return n;
    });
    setDraggingId(null);
  }, [draggingId]);

  const totalProjects = projectsMeta.length;
  const currentProgress = getProjectProgress(projectData);
  const orgName = activeOrg?.name || (language === 'si' ? 'Osebni prostor' : 'Personal workspace');
  const t = TEXT[language] || TEXT.en;

  // Visible cards (filter admin for non-admins)
  const visibleCards = cardOrder.filter(id => !(id === 'admin' && !isAdmin));

  return (
    <div ref={containerRef} style={{ padding: spacing.xl, maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column' as const, gap: spacing.lg }}>
      <div style={{ marginBottom: spacing.sm }}>
        <h1 style={{ margin: 0, fontSize: typography.fontSize['2xl'], fontWeight: typography.fontWeight.bold, color: c.text.heading }}>
          {language === 'si' ? 'Nadzorna plošča' : 'Dashboard'}
        </h1>
        <p style={{ margin: `${spacing.xs} 0 0`, color: c.text.muted, fontSize: typography.fontSize.sm }}>
          {orgName}{totalProjects > 0 && ` · ${totalProjects} ${language === 'si' ? 'projektov' : 'projects'}`}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`, gap: spacing.lg, alignItems: 'start' }}>
        {visibleCards.map(cardId => {
          const cardConfig: Record<CardId, { title: string; icon: string; wide?: boolean }> = {
            projects: { title: language === 'si' ? 'Moji projekti' : 'My Projects', icon: '📁' },
            chatbot: { title: language === 'si' ? 'AI Pomočnik' : 'AI Chatbot', icon: '🤖' },
            statistics: { title: language === 'si' ? 'Hitra statistika' : 'Quick Statistics', icon: '📊' },
            admin: { title: 'Super Admin', icon: '🛡️' },
            organization: { title: language === 'si' ? 'Organizacija' : 'Organization', icon: '🏢' },
            aiSettings: { title: language === 'si' ? 'AI Nastavitve' : 'AI Settings', icon: '⚙️' },
            activity: { title: language === 'si' ? 'Projektne grafike' : 'Project Charts', icon: '📈', wide: true },
          };
          const config = cardConfig[cardId];
          if (!config) return null;
          const colSpan = config.wide ? GRID_COLS : (cardSizes[cardId] || 1);

          return (
            <DashboardCard key={cardId} id={cardId} title={config.title} icon={config.icon}
              isDark={isDark} colors={c} wide={config.wide} colSpan={colSpan} language={language}
              onResize={handleResize} dragHandlers={dragHandlers} draggingId={draggingId}>

              {cardId === 'projects' && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: spacing.sm }}>
                  <button onClick={onCreateProject} style={{ background: c.primary[500], color: '#fff', border: 'none', borderRadius: radii.md, padding: `${spacing.sm} ${spacing.md}`, fontSize: typography.fontSize.sm, cursor: 'pointer', fontWeight: typography.fontWeight.semibold, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.xs }}>+ {language === 'si' ? 'Nov projekt' : 'New Project'}</button>
                  {projectsMeta.length === 0 && <div style={{ textAlign: 'center' as const, color: c.text.muted, fontSize: typography.fontSize.xs, padding: spacing.md }}>{language === 'si' ? 'Še nimate projektov.' : 'No projects yet.'}</div>}
                  {projectsMeta.map(p => {
                    const progress = getProjectProgress(p.id === currentProjectId ? projectData : null);
                    return (
                      <div key={p.id} onClick={() => onOpenProject(p.id)} style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radii.md, border: `1px solid ${p.id === currentProjectId ? c.primary[400] : c.border.light}`, cursor: 'pointer', background: p.id === currentProjectId ? (isDark ? c.primary[900] + '20' : c.primary[50]) : 'transparent', transition: `all ${animation.duration.fast} ${animation.easing.default}` }}>
                        <ProgressRing percent={progress} size={40} strokeWidth={4} color={c.primary[500]} bgColor={c.border.light} />
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

              {cardId === 'statistics' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.md }}>
                  <div style={{ textAlign: 'center' as const }}>
                    <ProgressRing percent={currentProgress} size={80} strokeWidth={8} color={c.primary[500]} bgColor={c.border.light} />
                    <div style={{ fontSize: typography.fontSize.xs, color: c.text.muted, marginTop: spacing.xs }}>{language === 'si' ? 'Trenutni projekt' : 'Current Project'}</div>
                    <div style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: c.text.heading }}>{currentProgress}%</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: spacing.sm, justifyContent: 'center' }}>
                    <div style={{ padding: spacing.sm, borderRadius: radii.md, background: isDark ? c.surface.sidebar : c.surface.main, border: `1px solid ${c.border.light}` }}>
                      <div style={{ fontSize: '20px', fontWeight: typography.fontWeight.bold, color: c.primary[600] }}>{totalProjects}</div>
                      <div style={{ fontSize: typography.fontSize.xs, color: c.text.muted }}>{language === 'si' ? 'Skupaj projektov' : 'Total Projects'}</div>
                    </div>
                    <div style={{ padding: spacing.sm, borderRadius: radii.md, background: isDark ? c.surface.sidebar : c.surface.main, border: `1px solid ${c.border.light}` }}>
                      <div style={{ fontSize: '20px', fontWeight: typography.fontWeight.bold, color: c.success[600] }}>{userOrgs.length}</div>
                      <div style={{ fontSize: typography.fontSize.xs, color: c.text.muted }}>{language === 'si' ? 'Organizacije' : 'Organizations'}</div>
                    </div>
                  </div>
                </div>
              )}

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
                      onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? c.primary[900] + '30' : c.primary[50]; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                      <span>{item.icon}</span> {item.label}
                    </button>
                  ))}
                </div>
              )}

              {cardId === 'organization' && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: spacing.sm }}>
                  <div style={{ padding: spacing.sm, borderRadius: radii.md, background: isDark ? c.primary[900] + '20' : c.primary[50], border: `1px solid ${c.primary[200]}` }}>
                    <div style={{ fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: c.primary[700] }}>{language === 'si' ? 'Trenutna organizacija' : 'Current Organization'}</div>
                    <div style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold, color: c.text.heading, marginTop: '2px' }}>{orgName}</div>
                  </div>
                  {userOrgs.length > 1 && (
                    <>
                      <div style={{ fontSize: typography.fontSize.xs, color: c.text.muted, fontWeight: typography.fontWeight.semibold }}>{language === 'si' ? 'Zamenjaj organizacijo:' : 'Switch organization:'}</div>
                      {userOrgs.filter(o => o.id !== activeOrg?.id).map(org => (
                        <button key={org.id} onClick={() => onSwitchOrg(org.id)} style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, borderRadius: radii.md, border: `1px solid ${c.border.light}`, background: 'transparent', cursor: 'pointer', color: c.text.body, fontSize: typography.fontSize.xs, textAlign: 'left' as const }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? c.primary[900] + '30' : c.primary[50]; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                          🏢 {org.name}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}

              {cardId === 'aiSettings' && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: spacing.sm }}>
                  <p style={{ margin: 0, fontSize: typography.fontSize.xs, color: c.text.muted }}>{language === 'si' ? 'Upravljajte AI nastavitve, ponudnike in modele.' : 'Manage AI settings, providers and models.'}</p>
                  <button onClick={onOpenSettings} style={{ background: c.primary[500], color: '#fff', border: 'none', borderRadius: radii.md, padding: `${spacing.sm} ${spacing.md}`, fontSize: typography.fontSize.xs, cursor: 'pointer', fontWeight: typography.fontWeight.semibold }}>⚙️ {language === 'si' ? 'Odpri nastavitve' : 'Open Settings'}</button>
                </div>
              )}

              {cardId === 'activity' && (
                <ProjectChartsCard
                  language={language} isDark={isDark} colors={c}
                  projectsMeta={projectsMeta} projectData={projectData}
                  currentProjectId={currentProjectId} onOpenProject={onOpenProject}
                />
              )}
            </DashboardCard>
          );
        })}

        {/* Drop zone at the end of the grid */}
        <DropZone index={visibleCards.length} isDark={isDark} colors={c} draggingId={draggingId} onDropAtEnd={handleDropAtEnd} />
      </div>
    </div>
  );
};

export default DashboardHome;
