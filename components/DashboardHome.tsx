// components/DashboardHome.tsx
// ═══════════════════════════════════════════════════════════════
// EURO-OFFICE Dashboard Home — Main view after login
// v1.0 — 2026-02-19
//
// FEATURES:
//   - 7 draggable cards (drag & drop reordering)
//   - Card layout saved to user_settings.dashboard_layout
//   - AI Chatbot card with full conversation UI
//   - Responsive grid: 3 columns desktop, 2 tablet, 1 mobile
//   - Dark mode support via theme system
//
// CARDS:
//   1. My Projects — list with progress, open/create
//   2. AI Chatbot — chat interface with AI assistant
//   3. Quick Statistics — project count, org, last activity
//   4. Admin Panel — admin/superadmin only quick links
//   5. Organization — name, members, role
//   6. AI Settings — provider, model, API key status
//   7. Recent Activity — last 5 changes
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { colors as lightColors, darkColors, shadows, radii, spacing, animation, typography } from '../design/theme.ts';
import { getThemeMode, onThemeChange } from '../services/themeService.ts';
import { storageService } from '../services/storageService.ts';
import { organizationService } from '../services/organizationService.ts';
import { TEXT } from '../locales.ts';
import { sendMessage as aiSendMessage } from '../services/aiProvider.ts';

// ─── Types ───────────────────────────────────────────────────

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

type CardId = 'projects' | 'chatbot' | 'statistics' | 'admin' | 'organization' | 'aiSettings' | 'activity';

const DEFAULT_CARD_ORDER: CardId[] = ['projects', 'chatbot', 'statistics', 'admin', 'organization', 'aiSettings', 'activity'];

// ─── Helpers ─────────────────────────────────────────────────

function getProjectProgress(projectData: any): number {
  if (!projectData) return 0;
  let filled = 0;
  let total = 6;
  if (projectData.problemAnalysis?.coreProblem?.title?.trim()) filled++;
  if (projectData.projectIdea?.mainAim?.trim()) filled++;
  if (projectData.generalObjectives?.some((o: any) => o.title?.trim())) filled++;
  if (projectData.specificObjectives?.some((o: any) => o.title?.trim())) filled++;
  if (projectData.activities?.some((a: any) => a.title?.trim())) filled++;
  if (projectData.outputs?.some((o: any) => o.title?.trim())) filled++;
  return Math.round((filled / total) * 100);
}

// ─── Card Wrapper Component ─────────────────────────────────

interface CardProps {
  id: CardId;
  title: string;
  icon: string;
  children: React.ReactNode;
  isDark: boolean;
  colors: any;
  wide?: boolean;
  dragHandlers: {
    onDragStart: (e: React.DragEvent, id: CardId) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent, id: CardId) => void;
    onDragEnd: () => void;
  };
  draggingId: CardId | null;
}

const DashboardCard: React.FC<CardProps> = ({ id, title, icon, children, isDark, colors: c, wide, dragHandlers, draggingId }) => {
  const isDragging = draggingId === id;

  return (
    <div
      draggable
      onDragStart={(e) => dragHandlers.onDragStart(e, id)}
      onDragOver={dragHandlers.onDragOver}
      onDrop={(e) => dragHandlers.onDrop(e, id)}
      onDragEnd={dragHandlers.onDragEnd}
      style={{
        background: c.surface.card,
        borderRadius: radii.xl,
        border: `1px solid ${isDragging ? c.primary[400] : c.border.light}`,
        boxShadow: isDragging ? shadows.xl : shadows.card,
        overflow: 'hidden',
        opacity: isDragging ? 0.7 : 1,
        transform: isDragging ? 'scale(1.02)' : 'scale(1)',
        transition: `all ${animation.duration.fast} ${animation.easing.default}`,
        gridColumn: wide ? 'span 2' : 'span 1',
        display: 'flex',
        flexDirection: 'column' as const,
        cursor: 'grab',
        minHeight: 0,
      }}
    >
      {/* Card header */}
      <div style={{
        padding: `${spacing.md} ${spacing.lg}`,
        borderBottom: `1px solid ${c.border.light}`,
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '18px' }}>{icon}</span>
        <h3 style={{
          margin: 0,
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.semibold,
          color: c.text.heading,
          flex: 1,
        }}>{title}</h3>
        <div style={{ cursor: 'grab', color: c.text.muted, display: 'flex' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="3" r="1.5" /><circle cx="11" cy="3" r="1.5" />
            <circle cx="5" cy="8" r="1.5" /><circle cx="11" cy="8" r="1.5" />
            <circle cx="5" cy="13" r="1.5" /><circle cx="11" cy="13" r="1.5" />
          </svg>
        </div>
      </div>
      {/* Card body */}
      <div style={{ padding: spacing.lg, flex: 1, overflow: 'auto', minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
};

// ─── AI Chatbot Component ───────────────────────────────────

const AIChatbot: React.FC<{ language: 'en' | 'si'; isDark: boolean; colors: any }> = ({ language, isDark, colors: c }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem('euro-office-chat');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { sessionStorage.setItem('euro-office-chat', JSON.stringify(messages)); } catch {}
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating) return;

    const userMsg: ChatMessage = { role: 'user', content: trimmed, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsGenerating(true);

        try {
      // Check if any API key is configured (generateContent reads it internally)
      const provider = storageService.getAIProvider();
      let hasKey = false;
      if (provider === 'gemini') hasKey = !!(storageService.getApiKey());
      else if (provider === 'openai') hasKey = !!(storageService.getOpenAIKey());
      else if (provider === 'openrouter') hasKey = !!(storageService.getOpenRouterKey());

      if (!hasKey) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: language === 'si'
            ? '⚠️ API ključ ni nastavljen. Prosim, dodajte API ključ v nastavitvah.'
            : '⚠️ No API key configured. Please add your API key in Settings.',
          timestamp: Date.now(),
        }]);
        setIsGenerating(false);
        return;
      }

      const systemPrompt = language === 'si'
        ? `Si Euro-Office AI asistent, specializiran za EU projekt management, intervencijsko logiko, in pripravo EU projektnih predlogov. Odgovarjaš v slovenščini. Si prijazen, strokoven in jedrnat. Če uporabnik vpraša o nečem kar ni povezano z EU projekti, vseeno pomagaš.`
        : `You are the Euro-Office AI assistant, specialized in EU project management, intervention logic, and EU project proposal preparation. You are friendly, professional, and concise. If the user asks about something unrelated to EU projects, you still help.`;

      const conversationHistory = messages.slice(-10).map(m =>
        `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
      ).join('\n');

      const fullPrompt = `${systemPrompt}\n\n${conversationHistory}\nUser: ${trimmed}\n\nAssistant:`;

      const result = await generateContent({ prompt: fullPrompt });

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: result.text || (language === 'si' ? 'Ni bilo mogoče generirati odgovora.' : 'Could not generate a response.'),
        timestamp: Date.now(),
      }]);
    }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ ${err.message || 'Error generating response'}`,
        timestamp: Date.now(),
      }]);
    } finally {
      setIsGenerating(false);
      inputRef.current?.focus();
    }
  }, [input, isGenerating, messages, language]);

  const handleClear = () => {
    setMessages([]);
    sessionStorage.removeItem('euro-office-chat');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 300, maxHeight: 450 }}>
      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: spacing.sm,
        paddingRight: spacing.xs, minHeight: 0,
      }} className="custom-scrollbar">
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: spacing.xl, color: c.text.muted }}>
            <span style={{ fontSize: '32px', display: 'block', marginBottom: spacing.sm }}>🤖</span>
            <p style={{ fontSize: typography.fontSize.sm, margin: 0 }}>
              {language === 'si' ? 'Pozdravljeni! Kako vam lahko pomagam z vašim EU projektom?' : 'Hello! How can I help you with your EU project?'}
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '85%',
              padding: `${spacing.sm} ${spacing.md}`,
              borderRadius: msg.role === 'user' ? `${radii.lg} ${radii.lg} ${radii.sm} ${radii.lg}` : `${radii.lg} ${radii.lg} ${radii.lg} ${radii.sm}`,
              background: msg.role === 'user'
                ? (isDark ? c.primary[800] : c.primary[50])
                : (isDark ? c.surface.sidebar : c.surface.background),
              border: `1px solid ${msg.role === 'user' ? (isDark ? c.primary[700] : c.primary[200]) : c.border.light}`,
              color: c.text.body,
              fontSize: typography.fontSize.sm,
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap' as const,
              wordBreak: 'break-word' as const,
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {isGenerating && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: `${spacing.sm} ${spacing.md}`,
              borderRadius: `${radii.lg} ${radii.lg} ${radii.lg} ${radii.sm}`,
              background: isDark ? c.surface.sidebar : c.surface.background,
              border: `1px solid ${c.border.light}`,
              color: c.text.muted,
              fontSize: typography.fontSize.sm,
            }}>
              <span style={{ animation: 'pulse 1.5s infinite' }}>●</span>
              <span style={{ animation: 'pulse 1.5s infinite 0.3s' }}> ●</span>
              <span style={{ animation: 'pulse 1.5s infinite 0.6s' }}> ●</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div style={{
        display: 'flex', gap: spacing.sm, paddingTop: spacing.md,
        borderTop: `1px solid ${c.border.light}`, marginTop: spacing.sm, flexShrink: 0,
      }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder={language === 'si' ? 'Vprašajte karkoli...' : 'Ask anything...'}
          disabled={isGenerating}
          style={{
            flex: 1,
            padding: `${spacing.sm} ${spacing.md}`,
            borderRadius: radii.lg,
            border: `1px solid ${c.border.medium}`,
            background: isDark ? c.surface.background : '#FFFFFF',
            color: c.text.heading,
            fontSize: typography.fontSize.sm,
            fontFamily: typography.fontFamily.sans,
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isGenerating}
          style={{
            padding: `${spacing.sm} ${spacing.md}`,
            borderRadius: radii.lg,
            border: 'none',
            background: c.primary[500],
            color: '#FFFFFF',
            cursor: !input.trim() || isGenerating ? 'not-allowed' : 'pointer',
            opacity: !input.trim() || isGenerating ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            fontWeight: typography.fontWeight.semibold,
            fontSize: typography.fontSize.sm,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
        </button>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            title={language === 'si' ? 'Počisti' : 'Clear'}
            style={{
              padding: spacing.sm,
              borderRadius: radii.lg,
              border: `1px solid ${c.border.light}`,
              background: 'transparent',
              color: c.text.muted,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// MAIN DASHBOARD COMPONENT
// ═══════════════════════════════════════════════════════════════

const DashboardHome: React.FC<DashboardHomeProps> = ({
  language, projectsMeta, currentProjectId, projectData, activeOrg, userOrgs,
  isAdmin, onOpenProject, onCreateProject, onOpenAdmin, onOpenSettings, onSwitchOrg,
}) => {
  const [isDark, setIsDark] = useState(getThemeMode() === 'dark');
  useEffect(() => { const unsub = onThemeChange((m) => setIsDark(m === 'dark')); return unsub; }, []);
  const c = isDark ? darkColors : lightColors;

  const isSuperAdmin = storageService.isSuperAdmin();
  const t = TEXT[language] || TEXT['en'];

  // ─── Card order (drag & drop) ─────────────────────────────

  const [cardOrder, setCardOrder] = useState<CardId[]>(() => {
    try {
      const saved = localStorage.getItem('euro-office-dashboard-layout');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_CARD_ORDER;
  });

  const [draggingId, setDraggingId] = useState<CardId | null>(null);

  useEffect(() => {
    try { localStorage.setItem('euro-office-dashboard-layout', JSON.stringify(cardOrder)); } catch {}
  }, [cardOrder]);

  const dragHandlers = {
    onDragStart: (e: React.DragEvent, id: CardId) => {
      setDraggingId(id);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    onDrop: (e: React.DragEvent, targetId: CardId) => {
      e.preventDefault();
      const sourceId = e.dataTransfer.getData('text/plain') as CardId;
      if (sourceId === targetId) return;
      setCardOrder(prev => {
        const newOrder = [...prev];
        const sourceIdx = newOrder.indexOf(sourceId);
        const targetIdx = newOrder.indexOf(targetId);
        if (sourceIdx === -1 || targetIdx === -1) return prev;
        newOrder.splice(sourceIdx, 1);
        newOrder.splice(targetIdx, 0, sourceId);
        return newOrder;
      });
    },
    onDragEnd: () => { setDraggingId(null); },
  };

  // ─── Card visibility ──────────────────────────────────────

  const visibleCards = cardOrder.filter(id => {
    if (id === 'admin' && !isAdmin && !isSuperAdmin) return false;
    return true;
  });

  // ─── Card renderers ───────────────────────────────────────

  const renderCard = (id: CardId) => {
    const commonProps = { isDark, colors: c, dragHandlers, draggingId };

    switch (id) {
      case 'projects':
        return (
          <DashboardCard key={id} id={id} title={language === 'si' ? 'Moji projekti' : 'My Projects'} icon="📁" {...commonProps}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {projectsMeta.length === 0 ? (
                <p style={{ color: c.text.muted, fontSize: typography.fontSize.sm, textAlign: 'center', padding: spacing.lg }}>
                  {language === 'si' ? 'Še nimate projektov. Ustvarite prvega!' : 'No projects yet. Create your first one!'}
                </p>
              ) : (
                projectsMeta.slice(0, 5).map((proj: any) => (
                  <button
                    key={proj.id}
                    onClick={() => onOpenProject(proj.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: spacing.md,
                      padding: `${spacing.sm} ${spacing.md}`,
                      borderRadius: radii.lg,
                      border: `1px solid ${proj.id === currentProjectId ? c.primary[300] : c.border.light}`,
                      background: proj.id === currentProjectId ? (isDark ? `${c.primary[500]}15` : c.primary[50]) : 'transparent',
                      cursor: 'pointer', width: '100%', textAlign: 'left',
                      fontFamily: typography.fontFamily.sans,
                      transition: `all ${animation.duration.fast}`,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        margin: 0, fontSize: typography.fontSize.sm,
                        fontWeight: typography.fontWeight.medium, color: c.text.heading,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{proj.title || t.projects.untitled}</p>
                      <p style={{ margin: 0, fontSize: typography.fontSize.xs, color: c.text.muted }}>
                        {new Date(proj.updatedAt || proj.createdAt).toLocaleDateString(language === 'si' ? 'sl-SI' : 'en-GB')}
                      </p>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.text.muted} strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))
              )}
              <button
                onClick={onCreateProject}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
                  padding: `${spacing.sm} ${spacing.md}`,
                  borderRadius: radii.lg,
                  border: `1px dashed ${c.border.medium}`,
                  background: 'transparent',
                  color: c.primary[500],
                  cursor: 'pointer', width: '100%',
                  fontSize: typography.fontSize.sm,
                  fontWeight: typography.fontWeight.medium,
                  fontFamily: typography.fontFamily.sans,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                {language === 'si' ? 'Nov projekt' : 'New Project'}
              </button>
            </div>
          </DashboardCard>
        );

      case 'chatbot':
        return (
          <DashboardCard key={id} id={id} title={language === 'si' ? 'AI Asistent' : 'AI Assistant'} icon="🤖" wide {...commonProps}>
            <AIChatbot language={language} isDark={isDark} colors={c} />
          </DashboardCard>
        );

      case 'statistics':
        return (
          <DashboardCard key={id} id={id} title={language === 'si' ? 'Hitra statistika' : 'Quick Statistics'} icon="📊" {...commonProps}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.md }}>
              {[
                { label: language === 'si' ? 'Projekti' : 'Projects', value: String(projectsMeta.length), color: c.primary[500] },
                { label: language === 'si' ? 'Napredek' : 'Progress', value: `${getProjectProgress(projectData)}%`, color: c.success[500] },
                { label: language === 'si' ? 'Organizacija' : 'Organization', value: activeOrg?.name?.substring(0, 12) || '—', color: c.secondary[500] },
                { label: 'AI Provider', value: storageService.getAIProvider()?.toUpperCase() || '—', color: c.warning[500] },
              ].map((stat, i) => (
                <div key={i} style={{
                  padding: spacing.md, borderRadius: radii.lg,
                  background: isDark ? `${stat.color}10` : `${stat.color}08`,
                  border: `1px solid ${isDark ? `${stat.color}25` : `${stat.color}20`}`,
                  textAlign: 'center',
                }}>
                  <p style={{ margin: 0, fontSize: typography.fontSize['2xl'], fontWeight: typography.fontWeight.bold, color: stat.color }}>{stat.value}</p>
                  <p style={{ margin: `${spacing.xs} 0 0`, fontSize: typography.fontSize.xs, color: c.text.muted }}>{stat.label}</p>
                </div>
              ))}
            </div>
          </DashboardCard>
        );

      case 'admin':
        return (
          <DashboardCard key={id} id={id} title={isSuperAdmin ? 'Super Admin' : 'Admin'} icon={isSuperAdmin ? '👑' : '🛡️'} {...commonProps}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {[
                { label: language === 'si' ? 'Uporabniki' : 'Users', tab: 'users', icon: '👥' },
                { label: language === 'si' ? 'Dnevnik napak' : 'Error Log', tab: 'errorLog', icon: '📋' },
                { label: language === 'si' ? 'Pravila' : 'Instructions', tab: 'instructions', icon: '📝' },
                { label: language === 'si' ? 'Nastavitve' : 'Settings', tab: 'ai', icon: '⚙️' },
              ].map((item) => (
                <button
                  key={item.tab}
                  onClick={() => onOpenAdmin(item.tab)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: spacing.sm,
                    padding: `${spacing.sm} ${spacing.md}`,
                    borderRadius: radii.lg,
                    border: `1px solid ${c.border.light}`,
                    background: 'transparent',
                    color: c.text.body,
                    cursor: 'pointer', width: '100%', textAlign: 'left',
                    fontSize: typography.fontSize.sm,
                    fontFamily: typography.fontFamily.sans,
                    transition: `all ${animation.duration.fast}`,
                  }}
                >
                  <span>{item.icon}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.text.muted} strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </DashboardCard>
        );

      case 'organization':
        return (
          <DashboardCard key={id} id={id} title={language === 'si' ? 'Organizacija' : 'Organization'} icon="🏢" {...commonProps}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              <div>
                <p style={{ margin: 0, fontSize: typography.fontSize.xs, color: c.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {language === 'si' ? 'Aktivna organizacija' : 'Active Organization'}
                </p>
                <p style={{ margin: `${spacing.xs} 0 0`, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, color: c.text.heading }}>
                  {activeOrg?.name || '—'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: spacing.lg }}>
                <div>
                  <p style={{ margin: 0, fontSize: typography.fontSize.xs, color: c.text.muted }}>{language === 'si' ? 'Organizacije' : 'Organizations'}</p>
                  <p style={{ margin: `2px 0 0`, fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: c.primary[500] }}>{userOrgs.length}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: typography.fontSize.xs, color: c.text.muted }}>{language === 'si' ? 'Vloga' : 'Role'}</p>
                  <p style={{ margin: `2px 0 0`, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: isSuperAdmin ? '#D97706' : c.primary[500] }}>
                    {isSuperAdmin ? 'Super Admin' : isAdmin ? 'Admin' : 'User'}
                  </p>
                </div>
              </div>
            </div>
          </DashboardCard>
        );

      case 'aiSettings':
        return (
          <DashboardCard key={id} id={id} title={language === 'si' ? 'AI nastavitve' : 'AI Settings'} icon="⚡" {...commonProps}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                <div style={{
                  width: 10, height: 10, borderRadius: radii.full,
                  background: (storageService.getApiKey() || storageService.getOpenAIKey() || storageService.getOpenRouterKey()) ? c.success[500] : c.error[500],
                }} />
                <span style={{ fontSize: typography.fontSize.sm, color: c.text.body }}>
                  {(storageService.getApiKey() || storageService.getOpenAIKey() || storageService.getOpenRouterKey())
                    ? (language === 'si' ? 'API ključ aktiven' : 'API key active')
                    : (language === 'si' ? 'API ključ manjka' : 'API key missing')}
                </span>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: typography.fontSize.xs, color: c.text.muted }}>Provider</p>
                <p style={{ margin: `2px 0 0`, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: c.text.heading }}>
                  {storageService.getAIProvider() === 'gemini' ? 'Google Gemini' : storageService.getAIProvider() === 'openai' ? 'OpenAI' : 'OpenRouter'}
                </p>
              </div>
              {storageService.getCustomModel() && (
                <div>
                  <p style={{ margin: 0, fontSize: typography.fontSize.xs, color: c.text.muted }}>Model</p>
                  <p style={{ margin: `2px 0 0`, fontSize: typography.fontSize.sm, color: c.text.heading, fontFamily: typography.fontFamily.mono }}>{storageService.getCustomModel()}</p>
                </div>
              )}
              <button
                onClick={onOpenSettings}
                style={{
                  padding: `${spacing.sm} ${spacing.md}`,
                  borderRadius: radii.lg,
                  border: `1px solid ${c.primary[300]}`,
                  background: 'transparent',
                  color: c.primary[500],
                  cursor: 'pointer',
                  fontSize: typography.fontSize.sm,
                  fontWeight: typography.fontWeight.medium,
                  fontFamily: typography.fontFamily.sans,
                }}
              >
                {language === 'si' ? 'Spremeni nastavitve' : 'Change Settings'}
              </button>
            </div>
          </DashboardCard>
        );

      case 'activity':
        return (
          <DashboardCard key={id} id={id} title={language === 'si' ? 'Nedavna aktivnost' : 'Recent Activity'} icon="🕐" {...commonProps}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {projectsMeta.length === 0 ? (
                <p style={{ color: c.text.muted, fontSize: typography.fontSize.sm, textAlign: 'center' }}>
                  {language === 'si' ? 'Ni aktivnosti' : 'No activity yet'}
                </p>
              ) : (
                projectsMeta.slice(0, 5).map((proj: any, i: number) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: spacing.sm,
                    padding: `${spacing.xs} 0`,
                    borderBottom: i < Math.min(projectsMeta.length, 5) - 1 ? `1px solid ${c.border.light}` : 'none',
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: radii.full,
                      background: c.primary[400], flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        margin: 0, fontSize: typography.fontSize.xs, color: c.text.body,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {proj.title || t.projects.untitled}
                      </p>
                    </div>
                    <span style={{ fontSize: typography.fontSize.xs, color: c.text.muted, flexShrink: 0 }}>
                      {new Date(proj.updatedAt || proj.createdAt).toLocaleDateString(language === 'si' ? 'sl-SI' : 'en-GB')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </DashboardCard>
        );

      default:
        return null;
    }
  };

  // ─── Main Render ──────────────────────────────────────────

  return (
    <div style={{
      flex: 1, overflow: 'auto', padding: spacing.xl,
      background: c.surface.background,
    }} className="custom-scrollbar">
      {/* Header */}
      <div style={{ marginBottom: spacing.xl }}>
        <h1 style={{
          margin: 0, fontSize: typography.fontSize['3xl'],
          fontWeight: typography.fontWeight.bold, color: c.text.heading,
        }}>
          {language === 'si' ? 'Nadzorna plošča' : 'Dashboard'}
        </h1>
        <p style={{
          margin: `${spacing.xs} 0 0`, fontSize: typography.fontSize.sm,
          color: c.text.muted,
        }}>
          {language === 'si'
            ? `Dobrodošli nazaj! Imate ${projectsMeta.length} projekt${projectsMeta.length === 1 ? '' : projectsMeta.length < 5 ? 'e' : 'ov'}.`
            : `Welcome back! You have ${projectsMeta.length} project${projectsMeta.length !== 1 ? 's' : ''}.`}
        </p>
      </div>

      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: spacing.lg,
        alignItems: 'start',
      }}>
        {visibleCards.map(id => renderCard(id))}
      </div>
    </div>
  );
};

export default DashboardHome;
