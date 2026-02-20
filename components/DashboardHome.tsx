// components/DashboardHome.tsx
// ═══════════════════════════════════════════════════════════════════
// EURO-OFFICE Dashboard Home — Main view after login
// v4.2 — 2026-02-20
//
// CHANGES v4.2:
//   - FIX: Project Charts card = full-width (span 2), LEFT = acronym list,
//     RIGHT = horizontal scrollable row of charts (same size as DashboardPanel: 260×160)
//   - FIX: Scroll-to-top on mount
//   - FIX: Stable 2-column grid for all cards
//   - NOTE: NO Ajax — pure React + HTML5 drag-and-drop
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

// Chart size constants — SAME as DashboardPanel (width=260, height=160)
const CHART_WIDTH = 260;
const CHART_HEIGHT = 160;

// ——— Helpers —————————————————————————————————————

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

// ——— Progress Ring SVG ——————————————————————————

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

// ——— Card Wrapper Component ————————————————————

interface CardProps {
  id: CardId; title: string; icon: string; children: React.ReactNode;
  isDark: boolean; colors: any; wide?: boolean;
  dragHandlers: { onDragStart: (e: React.DragEvent, id: CardId) => void; onDragOver: (e: React.DragEvent) => void; onDrop: (e: React.DragEvent, id: CardId) => void; onDragEnd: () => void; };
  draggingId: CardId | null;
}

const DashboardCard: React.FC<CardProps> = ({ id, title, icon, children, isDark, colors: c, wide, dragHandlers, draggingId }) => {
  const isDragging = draggingId === id;
  return (
    <div draggable onDragStart={(e) => dragHandlers.onDragStart(e, id)} onDragOver={dragHandlers.onDragOver} onDrop={(e) => dragHandlers.onDrop(e, id)} onDragEnd={dragHandlers.onDragEnd}
      style={{
        background: c.surface.card, borderRadius: radii.xl,
        border: `1px solid ${isDragging ? c.primary[400] : c.border.light}`,
        boxShadow: isDragging ? shadows.xl : shadows.card, overflow: 'hidden',
        opacity: isDragging ? 0.7 : 1, transform: isDragging ? 'scale(1.02)' : 'scale(1)',
        transition: `all ${animation.duration.fast} ${animation.easing.default}`,
        gridColumn: wide ? '1 / -1' : 'span 1',
        display: 'flex', flexDirection: 'column' as const, cursor: 'grab', minHeight: 0,
      }}>
      <div style={{ padding: `${spacing.md} ${spacing.lg}`, borderBottom: `1px solid ${c.border.light}`, display: 'flex', alignItems: 'center', gap: spacing.sm, flexShrink: 0 }}>
        <span style={{ fontSize: '18px' }}>{icon}</span>
        <h3 style={{ margin: 0, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: c.text.heading, flex: 1 }}>{title}</h3>
        <div style={{ cursor: 'grab', color: c.text.muted, display: 'flex' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="3" r="1.5"/><circle cx="11" cy="3" r="1.5"/><circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/><circle cx="5" cy="13" r="1.5"/><circle cx="11" cy="13" r="1.5"/></svg>
        </div>
      </div>
      <div style={{ padding: spacing.lg, flex: 1, overflow: 'auto', minHeight: 0 }}>{children}</div>
    </div>
  );
};

// ——— Project Charts Card — HORIZONTAL layout ———————

const ProjectChartsCard: React.FC<{
  language: 'en' | 'si';
  isDark: boolean;
  colors: any;
  projectsMeta: any[];
  projectData: any;
  currentProjectId: string | null;
  onOpenProject: (projectId: string) => void;
}> = ({ language, isDark, colors: c, projectsMeta, projectData, currentProjectId, onOpenProject }) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);

  const activeId = selectedProjectId || currentProjectId || (projectsMeta.length > 0 ? projectsMeta[0]?.id : null);

  const chartsData: ExtractedChartData[] | null = useMemo(() => {
    if (!activeId || !projectData || activeId !== currentProjectId) return null;
    try {
      return extractStructuralData(projectData);
    } catch {
      return null;
    }
  }, [activeId, currentProjectId, projectData]);

  const handleProjectClick = useCallback((projectId: string) => {
    setSelectedProjectId(prev => prev === projectId ? null : projectId);
  }, []);

  const handleMouseEnter = useCallback((projectId: string) => {
    setHoveredProjectId(projectId);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredProjectId(null);
  }, []);

  return (
    <div style={{ display: 'flex', gap: spacing.md, minHeight: 220 }}>
      {/* LEFT: Acronym list — narrow column */}
      <div style={{
        width: 140, minWidth: 120, flexShrink: 0,
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
          return (
            <div
              key={p.id}
              onMouseEnter={() => handleMouseEnter(p.id)}
              onMouseLeave={handleMouseLeave}
              onClick={() => handleProjectClick(p.id)}
              style={{
                padding: `4px ${spacing.xs}`,
                borderRadius: radii.sm,
                cursor: 'pointer',
                background: isActive
                  ? (isDark ? c.primary[900] + '60' : c.primary[100])
                  : isHovered
                    ? (isDark ? c.primary[900] + '25' : c.primary[50])
                    : 'transparent',
                borderLeft: isActive
                  ? `3px solid ${c.primary[500]}`
                  : isHovered
                    ? `3px solid ${c.primary[300]}`
                    : '3px solid transparent',
                marginBottom: 2,
                transition: 'background 0.15s ease, border-left 0.15s ease',
              }}
            >
              {/* Acronym — bold, primary line */}
              <div style={{
                fontSize: '12px',
                fontWeight: isActive ? typography.fontWeight.bold : typography.fontWeight.semibold,
                color: isActive ? c.primary[600] : c.text.heading,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {p.acronym || p.title?.substring(0, 10) || '—'}
              </div>
              {/* Title — small, secondary line */}
              <div style={{
                fontSize: '9px', color: c.text.muted,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {p.title || p.name || (language === 'si' ? 'Brez imena' : 'Untitled')}
              </div>
              {isCurrent && (
                <div style={{ fontSize: '8px', color: c.success[600], fontWeight: typography.fontWeight.semibold }}>
                  ● {language === 'si' ? 'naložen' : 'loaded'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* RIGHT: Charts — HORIZONTAL scroll, same size as DashboardPanel */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' as const, gap: spacing.xs }}>
        {/* Project name header */}
        {activeId && (() => {
          const meta = projectsMeta.find(p => p.id === (hoveredProjectId || activeId));
          if (!meta) return null;
          return (
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
              {meta.acronym && (
                <span style={{
                  fontSize: '11px', background: isDark ? c.primary[900] : c.primary[100], color: c.primary[700],
                  padding: '2px 8px', borderRadius: radii.full, fontWeight: typography.fontWeight.bold,
                }}>
                  {meta.acronym}
                </span>
              )}
              <span style={{ fontSize: typography.fontSize.xs, color: c.text.heading, fontWeight: typography.fontWeight.semibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {meta.title || meta.name || ''}
              </span>
            </div>
          );
        })()}

        {/* No project selected */}
        {!activeId && (
          <div style={{ color: c.text.muted, fontSize: typography.fontSize.sm, textAlign: 'center' as const, padding: spacing.xl, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {language === 'si' ? 'Izberite projekt za prikaz grafik' : 'Select a project to view charts'}
          </div>
        )}

        {/* Project not loaded — offer to open */}
        {activeId && activeId !== currentProjectId && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
            <div style={{ fontSize: typography.fontSize.xs, color: c.text.muted, textAlign: 'center' as const }}>
              {language === 'si'
                ? 'Odprite projekt za prikaz grafik.'
                : 'Open this project to view its charts.'}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onOpenProject(activeId); }}
              style={{
                background: c.primary[500], color: '#fff', border: 'none', borderRadius: radii.md,
                padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.fontSize.xs,
                cursor: 'pointer', fontWeight: typography.fontWeight.semibold,
              }}
            >
              {language === 'si' ? 'Odpri projekt' : 'Open project'}
            </button>
          </div>
        )}

        {/* ★ v4.2: HORIZONTAL chart row — scrollable, same size as DashboardPanel */}
        {activeId && activeId === currentProjectId && chartsData && chartsData.length > 0 && (
          <div style={{
            flex: 1,
            overflowX: 'auto',
            overflowY: 'hidden',
            display: 'flex',
            flexDirection: 'row' as const,
            gap: spacing.sm,
            paddingBottom: spacing.xs,
            alignItems: 'flex-start',
          }}>
            {chartsData.map((chart: ExtractedChartData, idx: number) => (
              <div key={`chart-${idx}-${chart.chartType}`} style={{
                flexShrink: 0,
                width: CHART_WIDTH,
              }}>
                <ChartRenderer
                  data={chart}
                  width={CHART_WIDTH}
                  height={CHART_HEIGHT}
                  showTitle={true}
                  showSource={false}
                />
              </div>
            ))}
          </div>
        )}

        {/* No chart data */}
        {activeId && activeId === currentProjectId && (!chartsData || chartsData.length === 0) && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: spacing.xs }}>
            <div style={{ fontSize: typography.fontSize.xs, color: c.text.muted, textAlign: 'center' as const }}>
              {language === 'si'
                ? 'Ni podatkov za grafike. Izpolnite projektne sekcije.'
                : 'No chart data. Fill in project sections first.'}
            </div>
            <div style={{ fontSize: '10px', color: c.text.muted, fontStyle: 'italic', textAlign: 'center' as const }}>
              {language === 'si'
                ? 'Grafike se prikažejo ko izpolnite vsaj 2 sekciji.'
                : 'Charts appear when at least 2 sections have content.'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ——— Project Charts Card (replaces old Recent Activity) ———————

const ProjectChartsCard: React.FC<{
  language: 'en' | 'si';
  isDark: boolean;
  colors: any;
  projectsMeta: any[];
  projectData: any;
  currentProjectId: string | null;
  onOpenProject: (projectId: string) => void;
}> = ({ language, isDark, colors: c, projectsMeta, projectData, currentProjectId, onOpenProject }) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);

  // Stabilize: only use selectedProjectId for chart display, hover just highlights
  const activeId = selectedProjectId || (projectsMeta.length > 0 && currentProjectId ? currentProjectId : projectsMeta[0]?.id || null);

  // Memoize charts data to prevent recalculation on every render
  const chartsData = useMemo(() => {
    if (!activeId || !projectData || activeId !== currentProjectId) return null;
    try {
      return extractStructuralData(projectData);
    } catch {
      return null;
    }
  }, [activeId, currentProjectId, projectData]);

  const activeMeta = useMemo(() => {
    return projectsMeta.find(p => p.id === (hoveredProjectId || activeId));
  }, [projectsMeta, hoveredProjectId, activeId]);

  // Stable click handler – no state thrashing
  const handleProjectClick = useCallback((projectId: string) => {
    setSelectedProjectId(prev => prev === projectId ? null : projectId);
  }, []);

  const handleMouseEnter = useCallback((projectId: string) => {
    setHoveredProjectId(projectId);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredProjectId(null);
  }, []);

  return (
    <div style={{ display: 'flex', gap: spacing.md, height: '100%', minHeight: 280 }}>
      {/* LEFT: Project list */}
      <div style={{
        width: 200, minWidth: 180, flexShrink: 0,
        borderRight: `1px solid ${c.border.light}`,
        overflowY: 'auto', paddingRight: spacing.sm,
      }}>
        <div style={{ fontSize: typography.fontSize.xs, color: c.text.muted, fontWeight: typography.fontWeight.semibold, marginBottom: spacing.sm, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
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
          const isHighlighted = isSelected || (isHovered && !selectedProjectId);
          return (
            <div
              key={p.id}
              onMouseEnter={() => handleMouseEnter(p.id)}
              onMouseLeave={handleMouseLeave}
              onClick={() => handleProjectClick(p.id)}
              style={{
                padding: `${spacing.xs} ${spacing.sm}`,
                borderRadius: radii.md,
                cursor: 'pointer',
                background: isSelected
                  ? (isDark ? c.primary[900] + '60' : c.primary[100])
                  : isHovered
                    ? (isDark ? c.primary[900] + '25' : c.primary[50])
                    : 'transparent',
                borderLeft: isSelected
                  ? `3px solid ${c.primary[500]}`
                  : isHovered
                    ? `3px solid ${c.primary[300]}`
                    : '3px solid transparent',
                marginBottom: 2,
                transition: 'background 0.15s ease, border-left 0.15s ease',
              }}
            >
              <div style={{
                fontSize: typography.fontSize.xs,
                fontWeight: isHighlighted ? typography.fontWeight.semibold : typography.fontWeight.medium,
                color: isSelected ? c.primary[700] : isHovered ? c.primary[600] : c.text.body,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {p.title || p.name || (language === 'si' ? 'Brez imena' : 'Untitled')}
              </div>
              {p.acronym && (
                <div style={{ fontSize: '10px', color: c.text.muted }}>{p.acronym}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* RIGHT: Charts for selected project */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' as const, gap: spacing.sm }}>
        {activeMeta && (
          <div style={{ marginBottom: spacing.xs, flexShrink: 0 }}>
            <div style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: c.text.heading }}>
              {activeMeta.title || activeMeta.name || 'Project'}
            </div>
            {activeMeta.acronym && (
              <span style={{
                fontSize: '10px', background: isDark ? c.primary[900] : c.primary[100], color: c.primary[700],
                padding: '1px 6px', borderRadius: radii.full, fontWeight: typography.fontWeight.semibold,
              }}>
                {activeMeta.acronym}
              </span>
            )}
          </div>
        )}

        {!activeId && (
          <div style={{ color: c.text.muted, fontSize: typography.fontSize.sm, textAlign: 'center' as const, padding: spacing.xl }}>
            {language === 'si' ? 'Izberite projekt za prikaz grafik' : 'Select a project to view charts'}
          </div>
        )}

        {activeId && activeId !== currentProjectId && (
          <div style={{ color: c.text.muted, fontSize: typography.fontSize.xs, textAlign: 'center' as const, padding: spacing.lg }}>
            <div style={{ marginBottom: spacing.sm }}>
              {language === 'si'
                ? 'Grafike so prikazane za trenutno naložen projekt. Odprite ta projekt za prikaz.'
                : 'Charts are shown for the currently loaded project. Open this project to view its charts.'}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onOpenProject(activeId); }}
              style={{
                background: c.primary[500], color: '#fff', border: 'none', borderRadius: radii.md,
                padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.fontSize.xs,
                cursor: 'pointer', fontWeight: typography.fontWeight.semibold,
              }}
            >
              {language === 'si' ? 'Odpri projekt' : 'Open project'}
            </button>
          </div>
        )}

        {activeId && activeId === currentProjectId && chartsData && chartsData.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: spacing.sm,
          }}>
            {chartsData.map((chart: any, idx: number) => (
              <div key={`chart-${idx}-${chart.type}`} style={{
                background: isDark ? c.surface.sidebar : c.surface.main,
                borderRadius: radii.lg,
                border: `1px solid ${c.border.light}`,
                padding: spacing.sm,
                minHeight: 160,
              }}>
                <div style={{
                  fontSize: '10px', fontWeight: typography.fontWeight.semibold,
                  color: c.text.muted, marginBottom: spacing.xs,
                  textTransform: 'uppercase' as const, letterSpacing: '0.05em',
                }}>
                  {chart.title || chart.type}
                </div>
                <div style={{ height: 140 }}>
                  <ChartRenderer data={chart} compact={true} />
                </div>
              </div>
            ))}
          </div>
        )}

        {activeId && activeId === currentProjectId && (!chartsData || chartsData.length === 0) && (
          <div style={{ color: c.text.muted, fontSize: typography.fontSize.xs, textAlign: 'center' as const, padding: spacing.lg }}>
            {language === 'si' ? 'Ni podatkov za grafike. Izpolnite projektne sekcije.' : 'No chart data. Fill in project sections first.'}
          </div>
        )}
      </div>
    </div>
  );
};

// ——— AI Chatbot with Conversations + Knowledge Base ———————————

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

  const activeConvo = conversations.find(c => c.id === activeConvoId) || null;
  const messages = activeConvo?.messages || [];

  useEffect(() => {
    try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(conversations)); } catch {}
  }, [conversations]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const createNewConvo = useCallback(() => {
    const id = `chat-${Date.now()}`;
    const newConvo: ChatConversation = { id, title: language === 'si' ? 'Nov pogovor' : 'New conversation', messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    setConversations(prev => {
      let updated = [newConvo, ...prev];
      if (updated.length > MAX_CONVERSATIONS) updated = updated.slice(0, MAX_CONVERSATIONS);
      return updated;
    });
    setActiveConvoId(id);
    setShowHistory(false);
  }, [language]);

  const deleteConvo = useCallback((id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConvoId === id) setActiveConvoId(null);
  }, [activeConvoId]);

  const updateConvoMessages = useCallback((convoId: string, newMessages: ChatMessage[]) => {
    setConversations(prev => prev.map(c => {
      if (c.id !== convoId) return c;
      const title = newMessages.find(m => m.role === 'user')?.content.substring(0, 40) || c.title;
      return { ...c, messages: newMessages, title, updatedAt: Date.now() };
    }));
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating) return;

    let convoId = activeConvoId;
    if (!convoId) {
      convoId = `chat-${Date.now()}`;
      const newConvo: ChatConversation = { id: convoId, title: trimmed.substring(0, 40), messages: [], createdAt: Date.now(), updatedAt: Date.now() };
      setConversations(prev => {
        let updated = [newConvo, ...prev];
        if (updated.length > MAX_CONVERSATIONS) updated = updated.slice(0, MAX_CONVERSATIONS);
        return updated;
      });
      setActiveConvoId(convoId);
    }

    const userMsg: ChatMessage = { role: 'user', content: trimmed, timestamp: Date.now() };
    const currentMessages = [...messages, userMsg];
    updateConvoMessages(convoId, currentMessages);
    setInput('');
    setIsGenerating(true);

    try {
      let kbContext = '';
      let orgRules = '';

      if (activeOrg?.id) {
        try {
          const kbResults = await knowledgeBaseService.searchKnowledgeBase(activeOrg.id, trimmed, 5);
          if (kbResults.length > 0) kbContext = '\n\n--- KNOWLEDGE BASE (internal documents) ---\n' + kbResults.join('\n\n');
        } catch (e) { console.warn('[Chatbot] KB search failed:', e); }

        try {
          const instructions = await organizationService.getActiveOrgInstructions?.(activeOrg.id);
          if (instructions) orgRules = '\n\n--- ORGANIZATION RULES ---\n' + instructions;
        } catch {}
      }

      const historyContext = currentMessages.slice(-10).map(m =>
        `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
      ).join('\n');

      const fullPrompt = `You are EURO-OFFICE AI Assistant, helping with EU project management (intervention logic).
Language: ${language === 'si' ? 'Slovenian' : 'English'}
${kbContext}
${orgRules}

Conversation history:
${historyContext}

User: ${trimmed}

Instructions:
- FIRST check the KNOWLEDGE BASE context above for relevant information
- THEN check ORGANIZATION RULES for any specific guidelines
- Answer in ${language === 'si' ? 'Slovenian' : 'English'}
- Be helpful, precise, and professional
- If the knowledge base has relevant info, cite the source document name
Assistant:`;

      const result = await generateContent({ prompt: fullPrompt });
      const aiResponse = result?.text || (language === 'si' ? 'Napaka pri generiranju odgovora.' : 'Error generating response.');
      const assistantMsg: ChatMessage = { role: 'assistant', content: aiResponse, timestamp: Date.now() };
      updateConvoMessages(convoId, [...currentMessages, assistantMsg]);
    } catch (e: any) {
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: language === 'si'
          ? `Napaka: ${e.message || 'Neznana napaka'}. Preverite AI nastavitve.`
          : `Error: ${e.message || 'Unknown error'}. Check AI settings.`,
        timestamp: Date.now()
      };
      updateConvoMessages(convoId, [...currentMessages, errorMsg]);
    } finally {
      setIsGenerating(false);
      inputRef.current?.focus();
    }
  }, [input, isGenerating, activeConvoId, messages, activeOrg, language, updateConvoMessages]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, height: '100%', minHeight: 300 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm, flexShrink: 0 }}>
        <button onClick={createNewConvo} style={{
          background: c.primary[500], color: '#fff', border: 'none', borderRadius: radii.md,
          padding: `${spacing.xs} ${spacing.sm}`, fontSize: typography.fontSize.xs,
          cursor: 'pointer', fontWeight: typography.fontWeight.semibold, display: 'flex', alignItems: 'center', gap: '4px',
        }}>
          + {language === 'si' ? 'Nov pogovor' : 'New chat'}
        </button>
        <button onClick={() => setShowHistory(!showHistory)} style={{
          background: showHistory ? c.primary[100] : 'transparent', color: c.text.body,
          border: `1px solid ${c.border.light}`, borderRadius: radii.md,
          padding: `${spacing.xs} ${spacing.sm}`, fontSize: typography.fontSize.xs, cursor: 'pointer',
        }}>
          {language === 'si' ? `Zgodovina (${conversations.length})` : `History (${conversations.length})`}
        </button>
        {conversations.length >= MAX_CONVERSATIONS && (
          <span style={{ fontSize: '10px', color: c.warning[600] }}>
            {language === 'si' ? 'Maks. dosežen!' : 'Max reached!'}
          </span>
        )}
      </div>

      {showHistory && (
        <div style={{
          maxHeight: 150, overflowY: 'auto', marginBottom: spacing.sm,
          border: `1px solid ${c.border.light}`, borderRadius: radii.md,
          background: isDark ? c.surface.sidebar : c.surface.main,
        }}>
          {conversations.length === 0 && (
            <div style={{ padding: spacing.sm, fontSize: typography.fontSize.xs, color: c.text.muted, textAlign: 'center' as const }}>
              {language === 'si' ? 'Ni pogovorov' : 'No conversations'}
            </div>
          )}
          {conversations.map(conv => (
            <div key={conv.id} style={{
              display: 'flex', alignItems: 'center', gap: spacing.xs,
              padding: `${spacing.xs} ${spacing.sm}`,
              background: conv.id === activeConvoId ? (isDark ? c.primary[900] + '30' : c.primary[50]) : 'transparent',
              cursor: 'pointer', borderBottom: `1px solid ${c.border.light}`,
            }}>
              <div onClick={() => { setActiveConvoId(conv.id); setShowHistory(false); }}
                style={{ flex: 1, fontSize: typography.fontSize.xs, color: c.text.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {conv.title}
              </div>
              <div style={{ fontSize: '9px', color: c.text.muted, flexShrink: 0 }}>
                {new Date(conv.updatedAt).toLocaleDateString()}
              </div>
              <button onClick={(e) => { e.stopPropagation(); deleteConvo(conv.id); }}
                style={{ background: 'none', border: 'none', color: c.error[500], cursor: 'pointer', fontSize: '14px', padding: '2px', lineHeight: 1 }}
                title={language === 'si' ? 'Izbriši' : 'Delete'}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{
        flex: 1, overflowY: 'auto', minHeight: 0,
        display: 'flex', flexDirection: 'column' as const, gap: spacing.xs, marginBottom: spacing.sm,
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center' as const, color: c.text.muted, fontSize: typography.fontSize.xs, padding: spacing.xl }}>
            {language === 'si'
              ? 'Pozdravljen! Sem EURO-OFFICE AI pomočnik. Vprašajte me karkoli o EU projektih.'
              : 'Hello! I\'m the EURO-OFFICE AI Assistant. Ask me anything about EU projects.'}
          </div>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} style={{
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
            background: msg.role === 'user' ? c.primary[500] : (isDark ? c.surface.sidebar : c.surface.main),
            color: msg.role === 'user' ? '#fff' : c.text.body,
            borderRadius: radii.lg,
            padding: `${spacing.xs} ${spacing.sm}`,
            fontSize: typography.fontSize.xs,
            border: msg.role === 'assistant' ? `1px solid ${c.border.light}` : 'none',
            whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
          }}>
            {msg.content}
          </div>
        ))}
        {isGenerating && (
          <div style={{
            alignSelf: 'flex-start', maxWidth: '85%',
            background: isDark ? c.surface.sidebar : c.surface.main,
            borderRadius: radii.lg, padding: `${spacing.xs} ${spacing.sm}`,
            fontSize: typography.fontSize.xs, color: c.text.muted,
            border: `1px solid ${c.border.light}`,
          }}>
            {language === 'si' ? 'Generiram...' : 'Generating...'}
            <span style={{ animation: 'pulse 1.5s infinite' }}> ●</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div style={{ display: 'flex', gap: spacing.xs, flexShrink: 0 }}>
        <input ref={inputRef} value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={language === 'si' ? 'Vprašajte AI pomočnika...' : 'Ask the AI assistant...'}
          disabled={isGenerating}
          style={{
            flex: 1, padding: `${spacing.xs} ${spacing.sm}`,
            borderRadius: radii.md, border: `1px solid ${c.border.light}`,
            background: isDark ? c.surface.sidebar : c.surface.main,
            color: c.text.body, fontSize: typography.fontSize.xs, outline: 'none',
          }}
        />
        <button onClick={handleSend} disabled={isGenerating || !input.trim()}
          style={{
            background: c.primary[500], color: '#fff', border: 'none',
            borderRadius: radii.md, padding: `${spacing.xs} ${spacing.md}`,
            fontSize: typography.fontSize.xs, cursor: isGenerating ? 'not-allowed' : 'pointer',
            opacity: isGenerating || !input.trim() ? 0.5 : 1, fontWeight: typography.fontWeight.semibold,
          }}>
          {isGenerating ? '...' : '➤'}
        </button>
      </div>
    </div>
  );
};

// ——— Main DashboardHome Component ————————————————

const DashboardHome: React.FC<DashboardHomeProps> = ({
  language, projectsMeta, currentProjectId, projectData, activeOrg, userOrgs,
  isAdmin, onOpenProject, onCreateProject, onOpenAdmin, onOpenSettings, onSwitchOrg,
}) => {
  const [isDark, setIsDark] = useState(getThemeMode() === 'dark');
  const c = isDark ? darkColors : lightColors;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onThemeChange((mode) => setIsDark(mode === 'dark'));
    return unsub;
  }, []);

  // ★ v4.2: Scroll to top on mount
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
    const contentArea = document.getElementById('main-content-area');
    if (contentArea) contentArea.scrollTop = 0;
    window.scrollTo(0, 0);
  }, []);

  // Card order + drag-and-drop (HTML5 Drag-and-Drop API — NOT Ajax!)
  const [cardOrder, setCardOrder] = useState<CardId[]>(() => {
    try {
      const saved = localStorage.getItem('euro-office-card-order');
      if (saved) {
        const parsed = JSON.parse(saved);
        const allCards = [...new Set([...parsed.filter((c: string) => DEFAULT_CARD_ORDER.includes(c as CardId)), ...DEFAULT_CARD_ORDER])];
        return allCards as CardId[];
      }
    } catch {}
    return DEFAULT_CARD_ORDER;
  });
  const [draggingId, setDraggingId] = useState<CardId | null>(null);

  useEffect(() => {
    try { localStorage.setItem('euro-office-card-order', JSON.stringify(cardOrder)); } catch {}
  }, [cardOrder]);

  const dragHandlers = useMemo(() => ({
    onDragStart: (e: React.DragEvent, id: CardId) => {
      setDraggingId(id);
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    onDrop: (e: React.DragEvent, targetId: CardId) => {
      e.preventDefault();
      if (!draggingId || draggingId === targetId) return;
      setCardOrder(prev => {
        const newOrder = [...prev];
        const fromIdx = newOrder.indexOf(draggingId);
        const toIdx = newOrder.indexOf(targetId);
        if (fromIdx === -1 || toIdx === -1) return prev;
        newOrder.splice(fromIdx, 1);
        newOrder.splice(toIdx, 0, draggingId);
        return newOrder;
      });
      setDraggingId(null);
    },
    onDragEnd: () => setDraggingId(null),
  }), [draggingId]);

  const totalProjects = projectsMeta.length;
  const currentProgress = getProjectProgress(projectData);
  const orgName = activeOrg?.name || (language === 'si' ? 'Osebni prostor' : 'Personal workspace');
  const t = TEXT[language] || TEXT.en;

  return (
    <div ref={containerRef} style={{
      padding: spacing.xl,
      maxWidth: 1400, margin: '0 auto',
      display: 'flex', flexDirection: 'column' as const, gap: spacing.lg,
    }}>
      {/* Header */}
      <div style={{ marginBottom: spacing.sm }}>
        <h1 style={{
          margin: 0, fontSize: typography.fontSize['2xl'],
          fontWeight: typography.fontWeight.bold, color: c.text.heading,
        }}>
          {language === 'si' ? 'Nadzorna plošča' : 'Dashboard'}
        </h1>
        <p style={{ margin: `${spacing.xs} 0 0`, color: c.text.muted, fontSize: typography.fontSize.sm }}>
          {orgName}
          {totalProjects > 0 && ` · ${totalProjects} ${language === 'si' ? 'projektov' : 'projects'}`}
        </p>
      </div>

      {/* Cards Grid — 2-column, activity card spans full width */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: spacing.lg,
        alignItems: 'start',
      }}>
        {cardOrder.map(cardId => {
          if (cardId === 'admin' && !isAdmin) return null;

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

          return (
            <DashboardCard
              key={cardId} id={cardId}
              title={config.title} icon={config.icon}
              isDark={isDark} colors={c}
              wide={config.wide}
              dragHandlers={dragHandlers} draggingId={draggingId}
            >
              {/* ═══ PROJECTS CARD ═══ */}
              {cardId === 'projects' && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: spacing.sm }}>
                  <button onClick={onCreateProject} style={{
                    background: c.primary[500], color: '#fff', border: 'none', borderRadius: radii.md,
                    padding: `${spacing.sm} ${spacing.md}`, fontSize: typography.fontSize.sm,
                    cursor: 'pointer', fontWeight: typography.fontWeight.semibold,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
                  }}>
                    + {language === 'si' ? 'Nov projekt' : 'New Project'}
                  </button>
                  {projectsMeta.length === 0 && (
                    <div style={{ textAlign: 'center' as const, color: c.text.muted, fontSize: typography.fontSize.xs, padding: spacing.md }}>
                      {language === 'si' ? 'Še nimate projektov. Ustvarite prvega!' : 'No projects yet. Create your first one!'}
                    </div>
                  )}
                  {projectsMeta.map(p => {
                    const progress = getProjectProgress(p.id === currentProjectId ? projectData : null);
                    return (
                      <div key={p.id} onClick={() => onOpenProject(p.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: spacing.sm,
                          padding: spacing.sm, borderRadius: radii.md,
                          border: `1px solid ${p.id === currentProjectId ? c.primary[400] : c.border.light}`,
                          cursor: 'pointer', background: p.id === currentProjectId ? (isDark ? c.primary[900] + '20' : c.primary[50]) : 'transparent',
                          transition: `all ${animation.duration.fast} ${animation.easing.default}`,
                        }}>
                        <ProgressRing percent={progress} size={40} strokeWidth={4} color={c.primary[500]} bgColor={c.border.light} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: c.text.heading, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.title || p.name || (language === 'si' ? 'Brez imena' : 'Untitled')}
                          </div>
                          {p.acronym && <div style={{ fontSize: '10px', color: c.text.muted }}>{p.acronym}</div>}
                        </div>
                        <div style={{ fontSize: typography.fontSize.xs, color: c.text.muted, flexShrink: 0 }}>{progress}%</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ═══ AI CHATBOT CARD ═══ */}
              {cardId === 'chatbot' && (
                <AIChatbot language={language} isDark={isDark} colors={c} activeOrg={activeOrg} />
              )}

              {/* ═══ STATISTICS CARD ═══ */}
              {cardId === 'statistics' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.md }}>
                  <div style={{ textAlign: 'center' as const }}>
                    <ProgressRing percent={currentProgress} size={80} strokeWidth={8} color={c.primary[500]} bgColor={c.border.light} />
                    <div style={{ fontSize: typography.fontSize.xs, color: c.text.muted, marginTop: spacing.xs }}>
                      {language === 'si' ? 'Trenutni projekt' : 'Current Project'}
                    </div>
                    <div style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: c.text.heading }}>
                      {currentProgress}%
                    </div>
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

              {/* ═══ ADMIN CARD ═══ */}
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
                    <button key={item.tab} onClick={() => onOpenAdmin(item.tab)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: spacing.xs,
                        padding: spacing.sm, borderRadius: radii.md,
                        border: `1px solid ${c.border.light}`, background: 'transparent',
                        cursor: 'pointer', color: c.text.body, fontSize: typography.fontSize.xs,
                        transition: `all ${animation.duration.fast} ${animation.easing.default}`,
                        textAlign: 'left' as const,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? c.primary[900] + '30' : c.primary[50]; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                      <span>{item.icon}</span> {item.label}
                    </button>
                  ))}
                </div>
              )}

              {/* ═══ ORGANIZATION CARD ═══ */}
              {cardId === 'organization' && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: spacing.sm }}>
                  <div style={{
                    padding: spacing.sm, borderRadius: radii.md,
                    background: isDark ? c.primary[900] + '20' : c.primary[50],
                    border: `1px solid ${c.primary[200]}`,
                  }}>
                    <div style={{ fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: c.primary[700] }}>
                      {language === 'si' ? 'Trenutna organizacija' : 'Current Organization'}
                    </div>
                    <div style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold, color: c.text.heading, marginTop: 2 }}>
                      {orgName}
                    </div>
                  </div>
                  {userOrgs.length > 1 && (
                    <>
                      <div style={{ fontSize: typography.fontSize.xs, color: c.text.muted, fontWeight: typography.fontWeight.semibold }}>
                        {language === 'si' ? 'Preklopi organizacijo:' : 'Switch organization:'}
                      </div>
                      {userOrgs.filter(o => o.id !== activeOrg?.id).map(org => (
                        <button key={org.id} onClick={() => onSwitchOrg(org.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: spacing.sm,
                            padding: spacing.sm, borderRadius: radii.md,
                            border: `1px solid ${c.border.light}`, background: 'transparent',
                            cursor: 'pointer', color: c.text.body, fontSize: typography.fontSize.xs,
                            textAlign: 'left' as const, width: '100%',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? c.surface.sidebar : c.surface.main; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                          🏢 {org.name}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}

              {/* ═══ AI SETTINGS CARD ═══ */}
              {cardId === 'aiSettings' && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: spacing.sm }}>
                  <p style={{ fontSize: typography.fontSize.xs, color: c.text.muted, margin: 0 }}>
                    {language === 'si' ? 'Konfigurirajte AI ponudnika in API ključ za generiranje vsebin.' : 'Configure your AI provider and API key for content generation.'}
                  </p>
                  <button onClick={onOpenSettings} style={{
                    background: c.primary[500], color: '#fff', border: 'none', borderRadius: radii.md,
                    padding: `${spacing.sm} ${spacing.md}`, fontSize: typography.fontSize.xs,
                    cursor: 'pointer', fontWeight: typography.fontWeight.semibold,
                  }}>
                    {language === 'si' ? 'Odpri nastavitve' : 'Open Settings'}
                  </button>
                </div>
              )}

              {/* ═══ PROJECT CHARTS CARD (wide = span 2) ═══ */}
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
      </div>
    </div>
  );
};

export default DashboardHome;
