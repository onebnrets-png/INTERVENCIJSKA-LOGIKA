// components/DashboardHome.tsx
// ═══════════════════════════════════════════════════════════════
// EURO-OFFICE Dashboard Home — Main view after login
// v3.0 — 2026-02-19
//
// CHANGES v3.0:
//   - FIX: Admin card tabs use correct AdminPanel tab keys (errors, not errorLog)
//   - NEW: Activity card uses ChartRenderer + extractStructuralData (same as DashboardPanel)
//   - NEW: AI Chatbot with conversation history (up to 20 convos, localStorage)
//   - NEW: AI Chatbot searches Knowledge Base + Organization Rules before external AI
//   - NEW: Chat session management (new/switch/delete conversations)
//   - Reverted card titles to original names
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { colors as lightColors, darkColors, shadows, radii, spacing, animation, typography } from '../design/theme.ts';
import { getThemeMode, onThemeChange } from '../services/themeService.ts';
import { storageService } from '../services/storageService.ts';
import { organizationService } from '../services/organizationService.ts';
import { knowledgeBaseService } from '../services/knowledgeBaseService.ts';
import { TEXT } from '../locales.ts';
import { generateContent } from '../services/aiProvider.ts';
import { extractStructuralData } from '../services/DataExtractionService.ts';
import ChartRenderer from './ChartRenderer.tsx';

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

// ─── Helpers ─────────────────────────────────────────────────

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

// ─── Progress Ring SVG ──────────────────────────────────────

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

// ─── Card Wrapper Component ─────────────────────────────────

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
        gridColumn: wide ? 'span 2' : 'span 1',
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

// ─── AI Chatbot with Conversations + Knowledge Base ─────────

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

  // Save to localStorage
  useEffect(() => {
    try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(conversations)); } catch {}
  }, [conversations]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const createNewConvo = useCallback(() => {
    const id = `chat-${Date.now()}`;
    const newConvo: ChatConversation = { id, title: language === 'si' ? 'Nov pogovor' : 'New conversation', messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    setConversations(prev => {
      let updated = [newConvo, ...prev];
      if (updated.length > MAX_CONVERSATIONS) {
        updated = updated.slice(0, MAX_CONVERSATIONS);
      }
      return updated;
    });
    setActiveConvoId(id);
    setShowHistory(false);
  }, [language]);

  const deleteConvo = useCallback((id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConvoId === id) {
      setActiveConvoId(null);
    }
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

    // Ensure we have an active conversation
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
      const provider = storageService.getAIProvider();
      let hasKey = false;
      if (provider === 'gemini') hasKey = !!(storageService.getApiKey());
      else if (provider === 'openai') hasKey = !!(storageService.getOpenAIKey());
      else if (provider === 'openrouter') hasKey = !!(storageService.getOpenRouterKey());

      if (!hasKey) {
        const errMsg: ChatMessage = { role: 'assistant', content: language === 'si' ? '⚠️ API ključ ni nastavljen.' : '⚠️ No API key configured.', timestamp: Date.now() };
        updateConvoMessages(convoId, [...currentMessages, errMsg]);
        setIsGenerating(false);
        return;
      }

      // ★ KNOWLEDGE BASE + RULES SEARCH
      let kbContext = '';
      let rulesContext = '';
      const orgId = activeOrg?.id || storageService.getActiveOrgId();

      if (orgId) {
        // Search knowledge base
        const kbResults = await knowledgeBaseService.searchKnowledgeBase(orgId, trimmed, 3);
        if (kbResults.length > 0) {
          kbContext = `\n\n=== KNOWLEDGE BASE (organization documents) ===\n${kbResults.join('\n\n')}\n=== END KNOWLEDGE BASE ===\n`;
        }

        // Get organization rules
        try {
          const orgInstructions = await organizationService.getActiveOrgInstructions();
          if (orgInstructions) {
            const rulesText = typeof orgInstructions === 'string' ? orgInstructions : JSON.stringify(orgInstructions);
            if (rulesText.length > 10) {
              rulesContext = `\n\n=== ORGANIZATION RULES ===\n${rulesText.substring(0, 3000)}\n=== END RULES ===\n`;
            }
          }
        } catch {}
      }

      const systemPrompt = language === 'si'
        ? `Si Euro-Office AI asistent, specializiran za EU projekt management in intervencijsko logiko. VEDNO najprej preveri priloženo BAZO ZNANJA in PRAVILA organizacije. Če najdeš relevantne informacije tam, jih uporabi kot primarni vir. Šele če v bazi znanja ni odgovora, uporabi svoje splošno znanje. Vedno navedi vir, če je iz baze znanja. Odgovarjaš v slovenščini.`
        : `You are the Euro-Office AI assistant, specialized in EU project management and intervention logic. ALWAYS check the attached KNOWLEDGE BASE and ORGANIZATION RULES first. If you find relevant information there, use it as the primary source. Only if the knowledge base doesn't contain the answer, use your general knowledge. Always cite the source if from the knowledge base. Be friendly, professional, and concise.`;

      const conversationHistory = currentMessages.slice(-10).map(m =>
        `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
      ).join('\n');

      const fullPrompt = `${systemPrompt}${kbContext}${rulesContext}\n\n${conversationHistory}\n\nAssistant:`;

      const result = await generateContent({ prompt: fullPrompt });

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: result.text || (language === 'si' ? 'Ni bilo mogoče generirati odgovora.' : 'Could not generate a response.'),
        timestamp: Date.now(),
      };
      updateConvoMessages(convoId, [...currentMessages, assistantMsg]);
    } catch (err: any) {
      const errMsg: ChatMessage = { role: 'assistant', content: `❌ ${err.message || 'Error'}`, timestamp: Date.now() };
      updateConvoMessages(convoId, [...currentMessages, errMsg]);
    } finally {
      setIsGenerating(false);
      inputRef.current?.focus();
    }
  }, [input, isGenerating, messages, language, activeConvoId, activeOrg, updateConvoMessages]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 320, maxHeight: 480 }}>
      {/* Conversation header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm, flexShrink: 0 }}>
        <button onClick={() => setShowHistory(!showHistory)} style={{
          padding: `2px ${spacing.sm}`, borderRadius: radii.md, border: `1px solid ${c.border.light}`,
          background: showHistory ? (isDark ? c.primary[900] : c.primary[50]) : 'transparent',
          color: c.text.body, cursor: 'pointer', fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.sans,
        }}>
          {language === 'si' ? `📋 ${conversations.length}` : `📋 ${conversations.length}`}
        </button>
        <button onClick={createNewConvo} style={{
          padding: `2px ${spacing.sm}`, borderRadius: radii.md, border: `1px solid ${c.border.light}`,
          background: 'transparent', color: c.primary[500], cursor: 'pointer', fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.sans,
        }}>
          + {language === 'si' ? 'Nov' : 'New'}
        </button>
        {activeConvo && (
          <span style={{ fontSize: typography.fontSize.xs, color: c.text.muted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeConvo.title}
          </span>
        )}
        {conversations.length >= MAX_CONVERSATIONS && (
          <span style={{ fontSize: '10px', color: c.warning[500] }}>⚠️ {MAX_CONVERSATIONS} max</span>
        )}
      </div>

      {/* History panel */}
      {showHistory && (
        <div style={{ maxHeight: 150, overflowY: 'auto', borderRadius: radii.md, border: `1px solid ${c.border.light}`, marginBottom: spacing.sm, flexShrink: 0 }}>
          {conversations.length === 0 ? (
            <p style={{ padding: spacing.sm, fontSize: typography.fontSize.xs, color: c.text.muted, textAlign: 'center', margin: 0 }}>
              {language === 'si' ? 'Ni pogovorov' : 'No conversations'}
            </p>
          ) : conversations.map(convo => (
            <div key={convo.id} style={{
              display: 'flex', alignItems: 'center', gap: spacing.xs, padding: `4px ${spacing.sm}`,
              background: convo.id === activeConvoId ? (isDark ? c.primary[900] : c.primary[50]) : 'transparent',
              borderBottom: `1px solid ${c.border.light}`, cursor: 'pointer',
            }} onClick={() => { setActiveConvoId(convo.id); setShowHistory(false); }}>
              <span style={{ flex: 1, fontSize: typography.fontSize.xs, color: c.text.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {convo.title}
              </span>
              <span style={{ fontSize: '10px', color: c.text.muted, flexShrink: 0 }}>
                {convo.messages.length} msg
              </span>
              <button onClick={(e) => { e.stopPropagation(); deleteConvo(convo.id); }} style={{
                background: 'none', border: 'none', color: c.error[400], cursor: 'pointer', padding: '2px', fontSize: '12px', flexShrink: 0,
              }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: spacing.sm, paddingRight: spacing.xs, minHeight: 0 }} className="custom-scrollbar">
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: spacing.xl, color: c.text.muted }}>
            <span style={{ fontSize: '32px', display: 'block', marginBottom: spacing.sm }}>🤖</span>
            <p style={{ fontSize: typography.fontSize.sm, margin: 0 }}>
              {language === 'si' ? 'Pozdravljeni! Vprašajte me karkoli — najprej preverim vašo bazo znanja.' : 'Hello! Ask me anything — I check your knowledge base first.'}
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '85%', padding: `${spacing.sm} ${spacing.md}`,
              borderRadius: msg.role === 'user' ? `${radii.lg} ${radii.lg} ${radii.sm} ${radii.lg}` : `${radii.lg} ${radii.lg} ${radii.lg} ${radii.sm}`,
              background: msg.role === 'user' ? (isDark ? c.primary[800] : c.primary[50]) : (isDark ? c.surface.sidebar : c.surface.background),
              border: `1px solid ${msg.role === 'user' ? (isDark ? c.primary[700] : c.primary[200]) : c.border.light}`,
              color: c.text.body, fontSize: typography.fontSize.sm, lineHeight: '1.5', whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
            }}>{msg.content}</div>
          </div>
        ))}
        {isGenerating && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: `${spacing.sm} ${spacing.md}`, borderRadius: `${radii.lg} ${radii.lg} ${radii.lg} ${radii.sm}`, background: isDark ? c.surface.sidebar : c.surface.background, border: `1px solid ${c.border.light}`, color: c.text.muted, fontSize: typography.fontSize.sm }}>
              <span style={{ animation: 'pulse 1.5s infinite' }}>●</span><span style={{ animation: 'pulse 1.5s infinite 0.3s' }}> ●</span><span style={{ animation: 'pulse 1.5s infinite 0.6s' }}> ●</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: spacing.sm, paddingTop: spacing.md, borderTop: `1px solid ${c.border.light}`, marginTop: spacing.sm, flexShrink: 0 }}>
        <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder={language === 'si' ? 'Vprašajte karkoli...' : 'Ask anything...'}
          disabled={isGenerating}
          style={{ flex: 1, padding: `${spacing.sm} ${spacing.md}`, borderRadius: radii.lg, border: `1px solid ${c.border.medium}`, background: isDark ? c.surface.background : '#FFFFFF', color: c.text.heading, fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.sans, outline: 'none' }}
        />
        <button onClick={handleSend} disabled={!input.trim() || isGenerating}
          style={{ padding: `${spacing.sm} ${spacing.md}`, borderRadius: radii.lg, border: 'none', background: c.primary[500], color: '#FFFFFF', cursor: !input.trim() || isGenerating ? 'not-allowed' : 'pointer', opacity: !input.trim() || isGenerating ? 0.5 : 1, display: 'flex', alignItems: 'center', fontWeight: typography.fontWeight.semibold, fontSize: typography.fontSize.sm }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
        </button>
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

  // Charts from DashboardPanel's extractStructuralData
  const structuralCharts = useMemo(() => extractStructuralData(projectData), [projectData]);

  const [cardOrder, setCardOrder] = useState<CardId[]>(() => {
    try { const s = localStorage.getItem('euro-office-dashboard-layout'); if (s) { const p = JSON.parse(s); if (Array.isArray(p) && p.length > 0) return p; } } catch {} return DEFAULT_CARD_ORDER;
  });
  const [draggingId, setDraggingId] = useState<CardId | null>(null);
  useEffect(() => { try { localStorage.setItem('euro-office-dashboard-layout', JSON.stringify(cardOrder)); } catch {} }, [cardOrder]);

  const dragHandlers = {
    onDragStart: (e: React.DragEvent, id: CardId) => { setDraggingId(id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; },
    onDrop: (e: React.DragEvent, targetId: CardId) => { e.preventDefault(); const sourceId = e.dataTransfer.getData('text/plain') as CardId; if (sourceId === targetId) return; setCardOrder(prev => { const n = [...prev]; const si = n.indexOf(sourceId); const ti = n.indexOf(targetId); if (si === -1 || ti === -1) return prev; n.splice(si, 1); n.splice(ti, 0, sourceId); return n; }); },
    onDragEnd: () => { setDraggingId(null); },
  };

  const visibleCards = cardOrder.filter(id => { if (id === 'admin' && !isAdmin && !isSuperAdmin) return false; return true; });

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
              ) : projectsMeta.slice(0, 5).map((proj: any) => (
                <button key={proj.id} onClick={() => onOpenProject(proj.id)} style={{ display: 'flex', alignItems: 'center', gap: spacing.md, padding: `${spacing.sm} ${spacing.md}`, borderRadius: radii.lg, border: `1px solid ${proj.id === currentProjectId ? c.primary[300] : c.border.light}`, background: proj.id === currentProjectId ? (isDark ? `${c.primary[500]}15` : c.primary[50]) : 'transparent', cursor: 'pointer', width: '100%', textAlign: 'left', fontFamily: typography.fontFamily.sans, transition: `all ${animation.duration.fast}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, color: c.text.heading, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proj.title || t.projects.untitled}</p>
                    <p style={{ margin: 0, fontSize: typography.fontSize.xs, color: c.text.muted }}>{new Date(proj.updatedAt || proj.createdAt).toLocaleDateString(language === 'si' ? 'sl-SI' : 'en-GB')}</p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.text.muted} strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                </button>
              ))}
              <button onClick={onCreateProject} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: `${spacing.sm} ${spacing.md}`, borderRadius: radii.lg, border: `1px dashed ${c.border.medium}`, background: 'transparent', color: c.primary[500], cursor: 'pointer', width: '100%', fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, fontFamily: typography.fontFamily.sans }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                {language === 'si' ? 'Nov projekt' : 'New Project'}
              </button>
            </div>
          </DashboardCard>
        );

      case 'chatbot':
        return (
          <DashboardCard key={id} id={id} title={language === 'si' ? 'AI Asistent' : 'AI Assistant'} icon="🤖" wide {...commonProps}>
            <AIChatbot language={language} isDark={isDark} colors={c} activeOrg={activeOrg} />
          </DashboardCard>
        );

      case 'statistics': {
        const progress = getProjectProgress(projectData);
        return (
          <DashboardCard key={id} id={id} title={language === 'si' ? 'Hitra statistika' : 'Quick Statistics'} icon="📊" {...commonProps}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <ProgressRing percent={progress} size={72} strokeWidth={7} color={c.primary[500]} bgColor={isDark ? c.border.light : '#E2E8F0'} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold, color: c.text.heading }}>{progress}%</div>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: c.text.heading }}>{projectsMeta.length} {language === 'si' ? 'projektov' : 'projects'}</p>
                  <p style={{ margin: `2px 0 0`, fontSize: typography.fontSize.xs, color: c.text.muted }}>{activeOrg?.name || '—'} · {storageService.getAIProvider()?.toUpperCase() || '—'}</p>
                </div>
              </div>
            </div>
          </DashboardCard>
        );
      }

      case 'admin':
        return (
          <DashboardCard key={id} id={id} title={isSuperAdmin ? 'Super Admin' : 'Admin'} icon={isSuperAdmin ? '👑' : '🛡️'} {...commonProps}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {[
                { label: language === 'si' ? 'Uporabniki' : 'Users', tab: 'users', icon: '👥' },
                { label: language === 'si' ? 'Dnevnik napak' : 'Error Log', tab: 'errors', icon: '📋' },
                { label: language === 'si' ? 'Pravila' : 'Instructions', tab: 'instructions', icon: '📝' },
                { label: language === 'si' ? 'Baza znanja' : 'Knowledge Base', tab: 'knowledge', icon: '📚' },
                { label: language === 'si' ? 'AI nastavitve' : 'AI Settings', tab: 'ai', icon: '⚙️' },
              ].map((item) => (
                <button key={item.tab} onClick={() => onOpenAdmin(item.tab)} style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, padding: `${spacing.sm} ${spacing.md}`, borderRadius: radii.lg, border: `1px solid ${c.border.light}`, background: 'transparent', color: c.text.body, cursor: 'pointer', width: '100%', textAlign: 'left', fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.sans, transition: `all ${animation.duration.fast}` }}>
                  <span>{item.icon}</span><span style={{ flex: 1 }}>{item.label}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.text.muted} strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
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
                <p style={{ margin: 0, fontSize: typography.fontSize.xs, color: c.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{language === 'si' ? 'Aktivna organizacija' : 'Active Organization'}</p>
                <p style={{ margin: `${spacing.xs} 0 0`, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, color: c.text.heading }}>{activeOrg?.name || '—'}</p>
              </div>
              <div style={{ display: 'flex', gap: spacing.lg }}>
                <div>
                  <p style={{ margin: 0, fontSize: typography.fontSize.xs, color: c.text.muted }}>{language === 'si' ? 'Organizacije' : 'Organizations'}</p>
                  <p style={{ margin: `2px 0 0`, fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: c.primary[500] }}>{userOrgs.length}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: typography.fontSize.xs, color: c.text.muted }}>{language === 'si' ? 'Vloga' : 'Role'}</p>
                  <p style={{ margin: `2px 0 0`, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: isSuperAdmin ? '#D97706' : c.primary[500] }}>{isSuperAdmin ? 'Super Admin' : isAdmin ? 'Admin' : 'User'}</p>
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
                <div style={{ width: 10, height: 10, borderRadius: radii.full, background: (storageService.getApiKey() || storageService.getOpenAIKey() || storageService.getOpenRouterKey()) ? c.success[500] : c.error[500] }} />
                <span style={{ fontSize: typography.fontSize.sm, color: c.text.body }}>{(storageService.getApiKey() || storageService.getOpenAIKey() || storageService.getOpenRouterKey()) ? (language === 'si' ? 'API ključ aktiven' : 'API key active') : (language === 'si' ? 'API ključ manjka' : 'API key missing')}</span>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: typography.fontSize.xs, color: c.text.muted }}>Provider</p>
                <p style={{ margin: `2px 0 0`, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: c.text.heading }}>{storageService.getAIProvider() === 'gemini' ? 'Google Gemini' : storageService.getAIProvider() === 'openai' ? 'OpenAI' : 'OpenRouter'}</p>
              </div>
              {storageService.getCustomModel() && (<div><p style={{ margin: 0, fontSize: typography.fontSize.xs, color: c.text.muted }}>Model</p><p style={{ margin: `2px 0 0`, fontSize: typography.fontSize.sm, color: c.text.heading, fontFamily: typography.fontFamily.mono }}>{storageService.getCustomModel()}</p></div>)}
              <button onClick={onOpenSettings} style={{ padding: `${spacing.sm} ${spacing.md}`, borderRadius: radii.lg, border: `1px solid ${c.primary[300]}`, background: 'transparent', color: c.primary[500], cursor: 'pointer', fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, fontFamily: typography.fontFamily.sans }}>{language === 'si' ? 'Spremeni nastavitve' : 'Change Settings'}</button>
            </div>
          </DashboardCard>
        );

      case 'activity':
        return (
          <DashboardCard key={id} id={id} title={language === 'si' ? 'Nedavna aktivnost' : 'Recent Activity'} icon="🕐" wide {...commonProps}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              {/* Charts from extractStructuralData — same as DashboardPanel */}
              {structuralCharts.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                  {structuralCharts.map(chart => (
                    <ChartRenderer key={chart.id} data={chart} height={180} showTitle={true} showSource={false} />
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: spacing.lg, color: c.text.muted }}>
                  <p style={{ margin: 0, fontSize: typography.fontSize.sm }}>
                    {language === 'si' ? 'Dodajte vsebino v projekt za prikaz grafov.' : 'Add content to your project to see charts.'}
                  </p>
                </div>
              )}

              {/* Project list */}
              {projectsMeta.length > 0 && (
                <div style={{ borderTop: `1px solid ${c.border.light}`, paddingTop: spacing.md }}>
                  <p style={{ margin: `0 0 ${spacing.sm}`, fontSize: typography.fontSize.xs, color: c.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: typography.fontWeight.semibold }}>
                    {language === 'si' ? 'Projekti' : 'Projects'}
                  </p>
                  {projectsMeta.slice(0, 5).map((proj: any, i: number) => (
                    <div key={proj.id || i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `3px 0` }}>
                      <button onClick={() => onOpenProject(proj.id)} style={{ fontSize: typography.fontSize.xs, color: c.primary[500], background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: typography.fontFamily.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%', textAlign: 'left' }}>
                        {proj.title || t.projects?.untitled || 'Untitled'}
                      </button>
                      <span style={{ fontSize: '10px', color: c.text.muted }}>{new Date(proj.updatedAt || proj.createdAt).toLocaleDateString(language === 'si' ? 'sl-SI' : 'en-GB')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DashboardCard>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: spacing.xl, background: c.surface.background }} className="custom-scrollbar">
      <div style={{ marginBottom: spacing.xl }}>
        <h1 style={{ margin: 0, fontSize: typography.fontSize['3xl'], fontWeight: typography.fontWeight.bold, color: c.text.heading }}>{language === 'si' ? 'Nadzorna plošča' : 'Dashboard'}</h1>
        <p style={{ margin: `${spacing.xs} 0 0`, fontSize: typography.fontSize.sm, color: c.text.muted }}>
          {language === 'si' ? `Dobrodošli nazaj! Imate ${projectsMeta.length} projekt${projectsMeta.length === 1 ? '' : projectsMeta.length < 5 ? 'e' : 'ov'}.` : `Welcome back! You have ${projectsMeta.length} project${projectsMeta.length !== 1 ? 's' : ''}.`}
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: spacing.lg, alignItems: 'start' }}>
        {visibleCards.map(id => renderCard(id))}
      </div>
    </div>
  );
};

export default DashboardHome;
