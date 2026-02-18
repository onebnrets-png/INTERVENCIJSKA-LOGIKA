// components/AdminPanel.tsx
// ═══════════════════════════════════════════════════════════════
// Unified Admin / Settings Panel
// v2.4 — 2026-02-18
//   ★ v2.4: Superadmin support
//     - Header shows 👑 for superadmin, 🛡️ for admin, ⚙️ for user
//     - Users tab: gold superadmin badge, protected label on role change
//     - Users tab: added "Super Admins" counter badge
//     - Profile tab: logo upload visible ONLY for superadmin
//     - Non-superadmin sees White-Label info notice instead of logo upload
//
//   ★ v2.3: OpenAI (ChatGPT) provider support in AI tab
//     - Third provider card for OpenAI
//     - openaiKey state + save/load logic
//     - Model list switches between GEMINI_MODELS, OPENAI_MODELS, OPENROUTER_MODELS
//     - handleProviderChange resets model per provider
//     - handleAISave saves openai_key via storageService
//
//   ★ v2.2: Full dark-mode audit — fixed:
//     - Stats badges, tab active color, table rows, Instructions sidebar,
//       AI Provider cards, info boxes, 2FA, error/success messages,
//       CollapsibleSection, QRCodeImage, toasts
//
//   ★ v2.1: EN-only Instructions display (SI variants removed)
//   v2.0: Merges AdminPanel + SettingsModal into single 5-tab / 2-tab modal
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from 'react';
import { useAdmin, type AdminUser, type AdminLogEntry } from '../hooks/useAdmin.ts';
import { Card, CardHeader } from '../design/components/Card.tsx';
import { Button, SparkleIcon } from '../design/components/Button.tsx';
import { Badge, RoleBadge } from '../design/components/Badge.tsx';
import { SkeletonTable, SkeletonText } from '../design/components/Skeleton.tsx';
import { colors as lightColors, darkColors, shadows, radii, animation, typography, spacing } from '../design/theme.ts';
import { getThemeMode, onThemeChange } from '../services/themeService.ts';
import { TEXT } from '../locales.ts';

// ─── Settings imports (from old SettingsModal) ────────────────
import { storageService } from '../services/storageService.ts';
import { validateProviderKey, OPENROUTER_MODELS, GEMINI_MODELS, OPENAI_MODELS, type AIProviderType } from '../services/aiProvider.ts';
import {
  getFullInstructions,
  getDefaultInstructions,
  saveAppInstructions,
  resetAppInstructions,
  LANGUAGE_DIRECTIVES,
  LANGUAGE_MISMATCH_TEMPLATE,
  ACADEMIC_RIGOR_RULES,
  HUMANIZATION_RULES,
  PROJECT_TITLE_RULES,
  MODE_INSTRUCTIONS,
  QUALITY_GATES,
  SECTION_TASK_INSTRUCTIONS,
  TEMPORAL_INTEGRITY_RULE,
  CHAPTER_LABELS,
  FIELD_RULE_LABELS,
  CHAPTERS,
  GLOBAL_RULES,
  FIELD_RULES,
  SUMMARY_RULES,
  TRANSLATION_RULES,
} from '../services/Instructions.ts';

// ─── Types ───────────────────────────────────────────────────

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'en' | 'si';
  initialTab?: string;
}

type TabId = 'users' | 'instructions' | 'ai' | 'profile' | 'audit';

// ─── Helpers: QR Code + Collapsible ─────────────────────────

const QRCodeImage = ({ value, size = 200, colors: c }: { value: string; size?: number; colors?: typeof lightColors }) => {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&margin=8`;
  const borderColor = c ? c.border.light : lightColors.border.light;
  return <img src={url} alt="QR Code" width={size} height={size} style={{ borderRadius: radii.lg, border: `1px solid ${borderColor}` }} />;
};

const CollapsibleSection = ({ title, defaultOpen = false, children, colors: c }: { title: string; defaultOpen?: boolean; children: React.ReactNode; colors: typeof lightColors }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div style={{ border: `1px solid ${c.border.light}`, borderRadius: radii.lg, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', background: c.surface.sidebar, border: 'none', cursor: 'pointer',
          textAlign: 'left', transition: `background ${animation.duration.fast}`,
          color: c.text.heading, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold,
        }}
      >
        <span>{title}</span>
        <svg style={{ width: 16, height: 16, color: c.text.muted, transition: `transform ${animation.duration.fast}`, transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && <div style={{ padding: '16px', borderTop: `1px solid ${c.border.light}`, background: c.surface.card }}>{children}</div>}
    </div>
  );
};

// ─── Localized texts ─────────────────────────────────────────

const ADMIN_TEXT = {
  en: {
    title: 'Admin / Settings',
    titleRegular: 'Settings',
    // ★ v2.4: Superadmin title
    titleSuperAdmin: 'Super Admin / Settings',
    subtitle: 'Manage users, AI settings, instructions, and view audit log',
    subtitleRegular: 'Configure AI provider, profile and security',
    // ★ v2.4: Superadmin subtitle
    subtitleSuperAdmin: 'Full system control — users, AI, instructions, branding & audit',
    tabs: {
      users: 'Users',
      instructions: 'Instructions',
      ai: 'AI Provider',
      profile: 'Profile & Security',
      audit: 'Audit Log',
    },
    users: {
      title: 'User Management',
      subtitle: 'View and manage all registered users',
      email: 'Email',
      displayName: 'Name',
      role: 'Role',
      registered: 'Registered',
      lastLogin: 'Last Login',
      actions: 'Actions',
      changeRole: 'Change Role',
      makeAdmin: 'Make Admin',
      makeUser: 'Make User',
      confirmRoleChange: 'Are you sure you want to change the role of',
      confirmToAdmin: 'to Admin? They will have full access to all settings and user management.',
      confirmToUser: 'to User? They will lose access to the Admin Panel and Instructions editor.',
      selfProtection: 'You cannot remove your own admin role.',
      roleUpdated: 'Role updated successfully.',
      roleUpdateFailed: 'Failed to update role:',
      noUsers: 'No users found.',
      totalUsers: 'Total users',
      totalAdmins: 'Admins',
      // ★ v2.4
      totalSuperAdmins: 'Super Admins',
      protected: 'Protected',
      never: 'Never',
    },
    instructions: {
      title: 'AI Instructions',
      subtitle: 'Edit the global AI instructions that apply to all users',
      save: 'Save Instructions',
      reset: 'Reset to Default',
      saved: 'Instructions saved successfully.',
      saveFailed: 'Failed to save instructions:',
      resetConfirm: 'Are you sure you want to reset all instructions to their default values? This cannot be undone.',
      resetDone: 'Instructions reset to default.',
      resetFailed: 'Failed to reset instructions:',
      lastUpdated: 'Last updated',
      by: 'by',
      usingDefaults: 'Currently using default instructions (no custom overrides).',
      sections: {
        global: 'Global Rules',
        language: 'Language Rules',
        academic: 'Academic Writing',
        humanization: 'Humanization',
        projectTitle: 'Project Title',
        mode: 'Mode Rules',
        qualityGates: 'Quality Gates',
        sectionTask: 'Section Tasks',
        fieldRules: 'Field Rules',
        translation: 'Translation',
        summary: 'Summary',
        chapter: 'Chapter Mapping',
        temporal: 'Temporal Integrity',
      },
    },
    log: {
      title: 'Audit Log',
      subtitle: 'Track all administrative actions',
      admin: 'Admin',
      action: 'Action',
      target: 'Target',
      details: 'Details',
      date: 'Date',
      noEntries: 'No log entries found.',
      actions: {
        role_change: 'Role Change',
        instructions_update: 'Instructions Updated',
        instructions_reset: 'Instructions Reset',
        user_block: 'User Blocked',
      },
    },
    // ★ v2.4: White-label notice
    whiteLabel: {
      logoTitle: 'Custom Logo',
      logoNotice: 'Logo customization is available only in the White-Label version. Contact us for more information.',
    },
    close: 'Close',
  },
  si: {
    title: 'Admin / Nastavitve',
    titleRegular: 'Nastavitve',
    // ★ v2.4: Superadmin title
    titleSuperAdmin: 'Super Admin / Nastavitve',
    subtitle: 'Upravljanje uporabnikov, AI nastavitev, pravil in pregled dnevnika',
    subtitleRegular: 'Nastavi AI ponudnika, profil in varnost',
    // ★ v2.4: Superadmin subtitle
    subtitleSuperAdmin: 'Polni nadzor sistema — uporabniki, AI, pravila, blagovna znamka & dnevnik',
    tabs: {
      users: 'Uporabniki',
      instructions: 'Pravila',
      ai: 'AI Ponudnik',
      profile: 'Profil & Varnost',
      audit: 'Dnevnik',
    },
    users: {
      title: 'Upravljanje uporabnikov',
      subtitle: 'Pregled in upravljanje vseh registriranih uporabnikov',
      email: 'E-pošta',
      displayName: 'Ime',
      role: 'Vloga',
      registered: 'Registriran',
      lastLogin: 'Zadnja prijava',
      actions: 'Akcije',
      changeRole: 'Spremeni vlogo',
      makeAdmin: 'Nastavi kot Admin',
      makeUser: 'Nastavi kot Uporabnik',
      confirmRoleChange: 'Ali ste prepričani, da želite spremeniti vlogo uporabnika',
      confirmToAdmin: 'v Admin? Imel bo poln dostop do vseh nastavitev in upravljanja uporabnikov.',
      confirmToUser: 'v Uporabnik? Izgubil bo dostop do Admin Panela in urejevalnika pravil.',
      selfProtection: 'Ne morete odstraniti lastne admin vloge.',
      roleUpdated: 'Vloga uspešno posodobljena.',
      roleUpdateFailed: 'Napaka pri posodobitvi vloge:',
      noUsers: 'Ni najdenih uporabnikov.',
      totalUsers: 'Skupaj uporabnikov',
      totalAdmins: 'Adminov',
      // ★ v2.4
      totalSuperAdmins: 'Super Adminov',
      protected: 'Zaščiteno',
      never: 'Nikoli',
    },
    instructions: {
      title: 'AI Pravila',
      subtitle: 'Urejanje globalnih AI pravil, ki veljajo za vse uporabnike',
      save: 'Shrani pravila',
      reset: 'Ponastavi na privzeto',
      saved: 'Pravila uspešno shranjena.',
      saveFailed: 'Napaka pri shranjevanju pravil:',
      resetConfirm: 'Ali ste prepričani, da želite ponastaviti vsa pravila na privzete vrednosti? Tega ni mogoče razveljaviti.',
      resetDone: 'Pravila ponastavljena na privzeto.',
      resetFailed: 'Napaka pri ponastavitvi pravil:',
      lastUpdated: 'Zadnja posodobitev',
      by: 'avtor',
      usingDefaults: 'Trenutno se uporabljajo privzeta pravila (brez prilagoditev).',
      sections: {
        global: 'Globalna pravila',
        language: 'Jezikovna pravila',
        academic: 'Akademsko pisanje',
        humanization: 'Humanizacija',
        projectTitle: 'Naslov projekta',
        mode: 'Pravila načina',
        qualityGates: 'Kontrola kakovosti',
        sectionTask: 'Naloge sklopov',
        fieldRules: 'Pravila polj',
        translation: 'Prevod',
        summary: 'Povzetek',
        chapter: 'Mapiranje poglavij',
        temporal: 'Časovna celovitost',
      },
    },
    log: {
      title: 'Dnevnik sprememb',
      subtitle: 'Sledenje vsem administrativnim akcijam',
      admin: 'Admin',
      action: 'Akcija',
      target: 'Cilj',
      details: 'Podrobnosti',
      date: 'Datum',
      noEntries: 'Ni vnosov v dnevniku.',
      actions: {
        role_change: 'Sprememba vloge',
        instructions_update: 'Pravila posodobljena',
        instructions_reset: 'Pravila ponastavljena',
        user_block: 'Uporabnik blokiran',
      },
    },
    // ★ v2.4: White-label notice
    whiteLabel: {
      logoTitle: 'Logotip',
      logoNotice: 'Prilagoditev logotipa je na voljo samo v White-Label verziji. Kontaktirajte nas za več informacij.',
    },
    close: 'Zapri',
  },
} as const;

// ─── Helper: Format date ─────────────────────────────────────

const formatDate = (dateStr: string | null, short = false): string => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (short) {
      return d.toLocaleDateString('sl-SI', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return d.toLocaleString('sl-SI', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
};

// ─── Helper: User initials avatar ────────────────────────────

const UserAvatar: React.FC<{ name: string; email: string; size?: number }> = ({ name, email, size = 36 }) => {
  const initials = (name || email || '?').split(/[\s@]+/).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('');
  let hash = 0;
  for (let i = 0; i < email.length; i++) { hash = email.charCodeAt(i) + ((hash << 5) - hash); }
  const hue = Math.abs(hash) % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: radii.full, background: `hsl(${hue}, 65%, 55%)`,
      color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: `${size * 0.38}px`, fontWeight: '700', flexShrink: 0, letterSpacing: '-0.5px',
    }}>{initials}</div>
  );
};

// ─── Build default instructions for display — EN only ────────

const buildDefaultInstructionsDisplay = (): Record<string, string> => {
  const fmtGates = (gates: string[]): string => gates.map((g, i) => `  ${i + 1}. ${g}`).join('\n');
  return {
    global: `═══ GLOBAL RULES ═══\nThese are the master rules that govern ALL AI content generation.\n\nARCHITECTURE PRINCIPLE:\n  Instructions.ts is the SINGLE SOURCE OF TRUTH for all AI rules.\n  geminiService.ts reads from here — it has ZERO own rules.\n\n${GLOBAL_RULES}`,
    language: `═══ LANGUAGE DIRECTIVES ═══\n\n── English ──\n${LANGUAGE_DIRECTIVES.en}\n\n── Slovenščina ──\n${LANGUAGE_DIRECTIVES.si}\n\n── Language Mismatch Template ──\n${LANGUAGE_MISMATCH_TEMPLATE}\n\nNOTE: Language Directives are the ONLY section that retains both EN and SI.\nThis tells the AI which language to WRITE in.`,
    academic: `═══ ACADEMIC RIGOR & CITATION RULES ═══\n\n${ACADEMIC_RIGOR_RULES.en}`,
    humanization: `═══ HUMANIZATION RULES ═══\n\n${HUMANIZATION_RULES.en}`,
    projectTitle: `═══ PROJECT TITLE RULES ═══\n\n${PROJECT_TITLE_RULES.en}`,
    mode: `═══ MODE INSTRUCTIONS ═══\n\n${Object.entries(MODE_INSTRUCTIONS).map(([mode, langs]) => `── ${mode.toUpperCase()} ──\n\n${langs.en}`).join('\n\n════════════════════════════════════\n\n')}`,
    qualityGates: `═══ QUALITY GATES ═══\n\n${Object.entries(QUALITY_GATES).map(([section, langs]) => `── ${section} ──\n\n${fmtGates(langs.en || [])}`).join('\n\n════════════════════════════════════\n\n')}`,
    sectionTask: `═══ SECTION TASK INSTRUCTIONS ═══\n\n${Object.entries(SECTION_TASK_INSTRUCTIONS).map(([section, langs]) => `── ${section} ──\n\n${langs.en || '(empty)'}`).join('\n\n════════════════════════════════════\n\n')}`,
    fieldRules: `═══ FIELD RULES ═══\n\n${Object.entries(FIELD_RULES).map(([key, val]) => { const label = (FIELD_RULE_LABELS as Record<string, string>)[key] || key; return `── ${label} ──\n${val.en || '(empty)'}`; }).join('\n\n')}`,
    translation: `═══ TRANSLATION RULES ═══\n\n${TRANSLATION_RULES.en.map((r: string, i: number) => `  ${i + 1}. ${r}`).join('\n')}`,
    summary: `═══ SUMMARY RULES ═══\n\n${SUMMARY_RULES.en}`,
    chapter: `═══ CHAPTER RULES ═══\n\n${Object.entries(CHAPTERS).map(([key, val]) => { const label = (CHAPTER_LABELS as Record<string, string>)[key] || key; return `── ${label} ──\n${val}`; }).join('\n\n════════════════════════════════════\n\n')}`,
    temporal: `═══ TEMPORAL INTEGRITY RULE ═══\n\n${TEMPORAL_INTEGRITY_RULE.en}`,
  };
};

const getDefaultPlaceholder = (section: string): string => {
  const defaults = buildDefaultInstructionsDisplay();
  return defaults[section] || `Enter custom ${section} instructions...`;
};
// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose, language, initialTab }) => {
  const admin = useAdmin();
  const t = ADMIN_TEXT[language] || ADMIN_TEXT.en;
  const tAuth = TEXT[language].auth;

  const [isDark, setIsDark] = useState(() => getThemeMode() === 'dark');
  useEffect(() => { const unsub = onThemeChange((mode) => setIsDark(mode === 'dark')); return unsub; }, []);
  const colors = isDark ? darkColors : lightColors;

  const isUserAdmin = admin.isAdmin;
  // ★ v2.4: Superadmin detection
  const isUserSuperAdmin = admin.isSuperAdmin;
  const adminTabs: TabId[] = ['users', 'instructions', 'ai', 'profile', 'audit'];
  const regularTabs: TabId[] = ['ai', 'profile'];
  const availableTabs = isUserAdmin ? adminTabs : regularTabs;
  const defaultTab = initialTab && availableTabs.includes(initialTab as TabId) ? (initialTab as TabId) : (isUserAdmin ? 'users' : 'ai');

  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);
  useEffect(() => { if (isOpen) { admin.checkAdminStatus(); } }, [isOpen]);
  useEffect(() => { if (isOpen) { const tab = initialTab && availableTabs.includes(initialTab as TabId) ? (initialTab as TabId) : (isUserAdmin ? 'users' : 'ai'); setActiveTab(tab); } }, [isOpen, initialTab, isUserAdmin]);

  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [editedInstructions, setEditedInstructions] = useState<Record<string, string>>({});
  const [activeInstructionSection, setActiveInstructionSection] = useState<string>('global');

  // ★ v2.3: Added openaiKey state
  const [aiProvider, setAiProvider] = useState<AIProviderType>('gemini');
  const [geminiKey, setGeminiKey] = useState('');
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [modelName, setModelName] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);

  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mfaFactors, setMfaFactors] = useState<any[]>([]);
  const [mfaEnrolling, setMfaEnrolling] = useState(false);
  const [enrollData, setEnrollData] = useState<{ factorId: string; qrUri: string; secret: string } | null>(null);
  const [enrollCode, setEnrollCode] = useState('');
  const [enrollError, setEnrollError] = useState('');

  const [appInstructions, setAppInstructions] = useState<any>(null);
  const [instructionsSubTab, setInstructionsSubTab] = useState('global');
  const [instructionsChanged, setInstructionsChanged] = useState(false);

  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  useEffect(() => { if (isOpen) { if (isUserAdmin) { admin.fetchUsers(); admin.fetchGlobalInstructions(); } loadSettingsData(); } }, [isOpen, isUserAdmin]);
  useEffect(() => { if (activeTab === 'audit' && isOpen && isUserAdmin) { admin.fetchAdminLog(); } }, [activeTab, isOpen, isUserAdmin]);
  useEffect(() => {
    const defaults = buildDefaultInstructionsDisplay();
    const overrides = admin.globalInstructions?.custom_instructions || {};
    const merged: Record<string, string> = {};
    for (const key of Object.keys(defaults)) { merged[key] = (overrides[key] !== undefined && overrides[key] !== null) ? overrides[key] : defaults[key]; }
    for (const key of Object.keys(overrides)) { if (!(key in merged)) { merged[key] = overrides[key]; } }
    setEditedInstructions(merged);
  }, [admin.globalInstructions, language]);

  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(null), 4000); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => { if (message) { const timer = setTimeout(() => setMessage(''), 4000); return () => clearTimeout(timer); } }, [message]);

  // ★ v2.3: Updated loadSettingsData to load OpenAI key
  const loadSettingsData = async () => {
    setSettingsLoading(true);
    try {
      await storageService.loadSettings();
      const provider = storageService.getAIProvider() || 'gemini';
      setAiProvider(provider);
      setGeminiKey(storageService.getApiKey() || '');
      setOpenRouterKey(storageService.getOpenRouterKey() || '');
      setOpenaiKey(storageService.getOpenAIKey() || '');
      const model = storageService.getCustomModel();
      setModelName(model || (provider === 'gemini' ? 'gemini-3-pro-preview' : provider === 'openai' ? 'gpt-5.2' : 'deepseek/deepseek-v3.2'));
      setCustomLogo(storageService.getCustomLogo());
      setAppInstructions(JSON.parse(JSON.stringify(getFullInstructions())));
      setInstructionsChanged(false);
      try { const { totp } = await storageService.getMFAFactors(); setMfaFactors(totp.filter((f: any) => f.status === 'verified')); } catch { setMfaFactors([]); }
      setNewPassword(''); setConfirmPassword('');
      setMfaEnrolling(false); setEnrollData(null); setEnrollCode(''); setEnrollError('');
      setMessage(''); setIsError(false); setInstructionsSubTab('global');
    } finally { setSettingsLoading(false); }
  };

  const handleRoleChange = useCallback((user: AdminUser) => {
    // ★ v2.4: Block role changes on superadmin users
    if (user.role === 'superadmin') return;
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    const confirmMsg = user.role === 'admin' ? `${t.users.confirmRoleChange} "${user.email}" ${t.users.confirmToUser}` : `${t.users.confirmRoleChange} "${user.email}" ${t.users.confirmToAdmin}`;
    setConfirmModal({ isOpen: true, title: t.users.changeRole, message: confirmMsg, onConfirm: async () => { setConfirmModal(null); const result = await admin.updateUserRole(user.id, newRole); if (result.success) { setToast({ message: t.users.roleUpdated, type: 'success' }); } else { setToast({ message: `${t.users.roleUpdateFailed} ${result.message}`, type: 'error' }); } } });
  }, [admin, t]);

  const handleSaveGlobalInstructions = useCallback(async () => {
    const result = await admin.saveGlobalInstructions(editedInstructions);
    if (result.success) { setToast({ message: t.instructions.saved, type: 'success' }); } else { setToast({ message: `${t.instructions.saveFailed} ${result.message}`, type: 'error' }); }
  }, [admin, editedInstructions, t]);

  const handleResetGlobalInstructions = useCallback(() => {
    setConfirmModal({ isOpen: true, title: t.instructions.reset, message: t.instructions.resetConfirm, onConfirm: async () => { setConfirmModal(null); const result = await admin.resetInstructionsToDefault(); if (result.success) { setEditedInstructions({}); setToast({ message: t.instructions.resetDone, type: 'success' }); } else { setToast({ message: `${t.instructions.resetFailed} ${result.message}`, type: 'error' }); } } });
  }, [admin, t]);

  const handleInstructionChange = useCallback((section: string, value: string) => { setEditedInstructions(prev => ({ ...prev, [section]: value })); }, []);

  // ★ v2.3: Updated handleProviderChange — resets model per provider
  const handleProviderChange = (provider: AIProviderType) => {
    setAiProvider(provider);
    if (provider === 'gemini') setModelName('gemini-3-pro-preview');
    else if (provider === 'openai') setModelName('gpt-5.2');
    else if (provider === 'openrouter') setModelName('deepseek/deepseek-v3.2');
  };

  // ★ v2.3: Updated handleAISave — saves OpenAI key
  const handleAISave = async () => {
    setIsValidating(true); setMessage(tAuth.validating || "Validating..."); setIsError(false);
    await storageService.setAIProvider(aiProvider);
    await storageService.setCustomModel(modelName.trim());
    await storageService.setApiKey(geminiKey.trim());
    await storageService.setOpenRouterKey(openRouterKey.trim());
    await storageService.setOpenAIKey(openaiKey.trim());
    const activeKey = aiProvider === 'gemini' ? geminiKey.trim()
                    : aiProvider === 'openai' ? openaiKey.trim()
                    : openRouterKey.trim();
    if (activeKey === '') { setMessage(language === 'si' ? 'Nastavitve shranjene.' : 'Settings saved.'); setIsValidating(false); setTimeout(() => onClose(), 1000); return; }
    const isValid = await validateProviderKey(aiProvider, activeKey);
    setIsValidating(false);
    if (isValid) { setMessage(language === 'si' ? 'API ključ potrjen in shranjen!' : 'API Key validated and saved!'); setTimeout(() => onClose(), 1000); }
    else { setIsError(true); setMessage(tAuth.invalidKey || "Invalid API Key"); }
  };

  const handlePasswordChange = async () => {
    setMessage(''); setIsError(false);
    if (!newPassword || !confirmPassword) { setIsError(true); setMessage(language === 'si' ? "Prosim izpolnite polja za novo geslo." : "Please fill password fields."); return; }
    if (newPassword !== confirmPassword) { setIsError(true); setMessage(tAuth.passwordMismatch || "Passwords do not match."); return; }
    const result = await storageService.changePassword('', newPassword);
    if (result.success) { setMessage(tAuth.passwordChanged || "Password changed!"); setNewPassword(''); setConfirmPassword(''); }
    else { setIsError(true); setMessage(result.message || tAuth.incorrectPassword || "Password change failed."); }
  };

  // ★ v2.4: Logo upload guarded to superadmin in storageService.saveCustomLogo()
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { const reader = new FileReader(); reader.onloadend = async () => { const b64 = reader.result as string; setCustomLogo(b64); await storageService.saveCustomLogo(b64); setMessage(tAuth.logoUpdated || "Logo updated!"); }; reader.readAsDataURL(file); }
  };
  const handleRemoveLogo = async () => { setCustomLogo(null); await storageService.saveCustomLogo(null); setMessage(language === 'si' ? "Logo odstranjen." : "Logo removed."); };

  const handleStartMFAEnroll = async () => {
    setEnrollError(''); setEnrollCode('');
    const result = await storageService.enrollMFA();
    if (result) { setEnrollData(result); setMfaEnrolling(true); }
    else setEnrollError(language === 'si' ? 'Napaka pri inicializaciji 2FA.' : 'Failed to initialize 2FA.');
  };

  const handleVerifyMFAEnroll = async () => {
    setEnrollError('');
    if (enrollCode.length !== 6) { setEnrollError(language === 'si' ? 'Vnesi 6-mestno kodo.' : 'Enter a 6-digit code.'); return; }
    if (!enrollData) return;
    const result = await storageService.challengeAndVerifyMFA(enrollData.factorId, enrollCode);
    if (result.success) { setMfaEnrolling(false); setEnrollData(null); const { totp } = await storageService.getMFAFactors(); setMfaFactors(totp.filter((f: any) => f.status === 'verified')); setMessage(language === 'si' ? '2FA uspešno aktiviran!' : '2FA enabled successfully!'); setIsError(false); }
    else { setEnrollError(result.message || (language === 'si' ? 'Napačna koda.' : 'Invalid code.')); setEnrollCode(''); }
  };

  const handleDisableMFA = async (factorId: string) => {
    if (!confirm(language === 'si' ? 'Ali res želiš deaktivirati 2FA?' : 'Disable two-factor authentication?')) return;
    const result = await storageService.unenrollMFA(factorId);
    if (result.success) { setMfaFactors(prev => prev.filter(f => f.id !== factorId)); setMessage(language === 'si' ? '2FA deaktiviran.' : '2FA disabled.'); setIsError(false); }
    else { setIsError(true); setMessage(result.message || (language === 'si' ? 'Napaka pri deaktivaciji.' : 'Failed to disable 2FA.')); }
  };

  const updateAppInstructions = (updater: (prev: any) => any) => { setAppInstructions((prev: any) => updater(prev)); setInstructionsChanged(true); };
  const handleSaveAppInstructions = async () => { await saveAppInstructions(appInstructions); setInstructionsChanged(false); setMessage(language === 'si' ? "Navodila shranjena!" : "Instructions saved!"); setIsError(false); };
  const handleResetAppInstructions = async () => { if (!confirm(language === 'si' ? "Povrni vsa navodila na privzete vrednosti? Vse spremembe bodo izgubljene." : "Revert ALL instructions to defaults? All changes will be lost.")) return; const defaults = await resetAppInstructions(); setAppInstructions(JSON.parse(JSON.stringify(defaults))); setInstructionsChanged(false); setMessage(language === 'si' ? "Navodila povrnjena na privzete." : "Instructions reverted to defaults."); setIsError(false); };
  const handleResetAppSection = (sectionKey: string) => {
    const defaults = getDefaultInstructions();
    if (sectionKey === 'GLOBAL_RULES') { updateAppInstructions(prev => ({ ...prev, GLOBAL_RULES: defaults.GLOBAL_RULES })); }
    else if (sectionKey === 'TRANSLATION_RULES') { updateAppInstructions(prev => ({ ...prev, TRANSLATION_RULES: defaults.TRANSLATION_RULES })); }
    else if (sectionKey === 'SUMMARY_RULES') { updateAppInstructions(prev => ({ ...prev, SUMMARY_RULES: defaults.SUMMARY_RULES })); }
    else if (sectionKey.startsWith('chapter')) { updateAppInstructions(prev => ({ ...prev, CHAPTERS: { ...prev.CHAPTERS, [sectionKey]: defaults.CHAPTERS[sectionKey] } })); }
    else if (defaults.FIELD_RULES[sectionKey] !== undefined) { updateAppInstructions(prev => ({ ...prev, FIELD_RULES: { ...prev.FIELD_RULES, [sectionKey]: defaults.FIELD_RULES[sectionKey] } })); }
    setMessage(language === 'si' ? `Razdelek ponastavljen.` : `Section reset to default.`); setIsError(false);
  };

  const handleSave = () => { if (activeTab === 'ai') handleAISave(); else if (activeTab === 'profile') handlePasswordChange(); else if (activeTab === 'instructions') handleSaveGlobalInstructions(); };

  if (!isOpen) return null;

  const totalUsers = admin.users.length;
  const totalAdmins = admin.users.filter(u => u.role === 'admin').length;
  // ★ v2.4: Superadmin counter
  const totalSuperAdmins = admin.users.filter(u => u.role === 'superadmin').length;
  const instructionSections = Object.keys(t.instructions.sections) as (keyof typeof t.instructions.sections)[];
  const TAB_ICONS: Record<TabId, string> = { users: '👥', instructions: '📋', ai: '🤖', profile: '👤', audit: '📜' };
  // ★ v2.3: Model list switches per provider
  const currentModels = aiProvider === 'gemini' ? GEMINI_MODELS
                      : aiProvider === 'openai' ? OPENAI_MODELS
                      : OPENROUTER_MODELS;
  const hasMFA = mfaFactors.length > 0;
  const appInstructionsSubTabs = [ { id: 'global', label: 'Global Rules' }, { id: 'chapters', label: 'Chapters' }, { id: 'fields', label: 'Field Rules' }, { id: 'translation', label: 'Translation' }, { id: 'summary', label: 'Summary' } ];

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: `1px solid ${colors.border.light}`, borderRadius: radii.lg,
    fontSize: typography.fontSize.sm, color: colors.text.body, background: colors.surface.card,
    outline: 'none', transition: `border-color ${animation.duration.fast}`, fontFamily: typography.fontFamily.mono,
  };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, color: colors.text.heading, marginBottom: '6px' };

  // ★ v2.2: Dark-aware style helpers
  const successBg = isDark ? 'rgba(16,185,129,0.12)' : lightColors.success[50];
  const successBorder = isDark ? 'rgba(16,185,129,0.25)' : lightColors.success[200];
  const successText = isDark ? '#6EE7B7' : lightColors.success[700];
  const errorBg = isDark ? 'rgba(239,68,68,0.12)' : lightColors.error[50];
  const errorBorder = isDark ? 'rgba(239,68,68,0.25)' : lightColors.error[200];
  const errorText = isDark ? '#FCA5A5' : lightColors.error[600];
  const primaryBadgeBg = isDark ? 'rgba(99,102,241,0.12)' : lightColors.primary[50];
  const primaryBadgeBorder = isDark ? 'rgba(99,102,241,0.25)' : lightColors.primary[200];
  const primaryBadgeText = isDark ? '#A5B4FC' : lightColors.primary[600];
  const warningBadgeBg = isDark ? 'rgba(245,158,11,0.12)' : lightColors.warning[50];
  const warningBadgeBorder = isDark ? 'rgba(245,158,11,0.25)' : lightColors.warning[200];
  const warningBadgeText = isDark ? '#FDE68A' : lightColors.warning[600];
  const secondaryInfoBg = isDark ? 'rgba(6,182,212,0.10)' : lightColors.secondary[50];
  const secondaryInfoBorder = isDark ? 'rgba(6,182,212,0.25)' : lightColors.secondary[200];
  const secondaryInfoText = isDark ? '#67E8F9' : lightColors.secondary[700];
  const warningInfoBg = isDark ? 'rgba(245,158,11,0.10)' : lightColors.warning[50];
  const warningInfoBorder = isDark ? 'rgba(245,158,11,0.25)' : lightColors.warning[200];
  const warningInfoText = isDark ? '#FDE68A' : lightColors.warning[700];
  const rowHoverBg = isDark ? '#1C2940' : lightColors.primary[50];
  const rowDefaultBg = isDark ? '#162032' : 'transparent';
  const tabActiveColor = isDark ? '#A5B4FC' : lightColors.primary[600];
  const tabActiveBorder = isDark ? '#818CF8' : lightColors.primary[500];

  // ★ v2.4: Superadmin gold style helpers
  const superadminBadgeBg = isDark ? 'rgba(251,191,36,0.15)' : '#FEF3C7';
  const superadminBadgeBorder = isDark ? 'rgba(251,191,36,0.35)' : '#FDE68A';
  const superadminBadgeText = isDark ? '#FDE68A' : '#92400E';

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px', background: colors.surface.overlay, backdropFilter: 'blur(4px)', animation: 'fadeIn 0.2s ease-out',
    }}>
      <div style={{
        background: colors.surface.background, borderRadius: radii['2xl'], boxShadow: shadows['2xl'],
        width: '100%', maxWidth: '1100px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'scaleIn 0.25s ease-out',
      }}>

        {/* ─── Header ─── */}
        {/* ★ v2.4: Superadmin-aware header icon and title */}
        <div style={{ background: colors.primary.gradient, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h2 style={{ color: colors.text.inverse, fontSize: typography.fontSize['xl'], fontWeight: typography.fontWeight.bold, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
              {isUserSuperAdmin ? '👑' : isUserAdmin ? '🛡️' : '⚙️'}{' '}
              {isUserSuperAdmin ? t.titleSuperAdmin : isUserAdmin ? t.title : t.titleRegular}
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: typography.fontSize.sm, margin: '4px 0 0' }}>
              {isUserSuperAdmin ? t.subtitleSuperAdmin : isUserAdmin ? t.subtitle : t.subtitleRegular}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: radii.lg, padding: '8px', cursor: 'pointer', color: colors.text.inverse, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: `background ${animation.duration.fast}` }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* ─── Tabs ─── */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${colors.border.light}`, background: colors.surface.card, flexShrink: 0, padding: '0 24px', overflowX: 'auto' }}>
          {availableTabs.map((tab) => (
            <button key={tab} onClick={() => { setActiveTab(tab); setMessage(''); }}
              style={{
                padding: '12px 20px', fontSize: typography.fontSize.sm,
                fontWeight: activeTab === tab ? typography.fontWeight.semibold : typography.fontWeight.medium,
                color: activeTab === tab ? tabActiveColor : colors.text.muted,
                background: 'transparent', border: 'none',
                borderBottom: activeTab === tab ? `2px solid ${tabActiveBorder}` : '2px solid transparent',
                cursor: 'pointer', transition: `all ${animation.duration.fast}`, marginBottom: '-1px', whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { if (activeTab !== tab) e.currentTarget.style.color = colors.text.body; }}
              onMouseLeave={e => { if (activeTab !== tab) e.currentTarget.style.color = colors.text.muted; }}
            >{TAB_ICONS[tab]} {t.tabs[tab]}</button>
          ))}
        </div>

        {/* ─── Content ─── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: colors.surface.background }}>
          {settingsLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
              <div style={{ width: 24, height: 24, border: `2px solid ${colors.primary[500]}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <span style={{ marginLeft: '12px', color: colors.text.muted }}>{language === 'si' ? 'Nalaganje...' : 'Loading...'}</span>
            </div>
          ) : (
            <>

          {/* ═══ USERS TAB ═══ */}
          {activeTab === 'users' && isUserAdmin && (
            <div>
              {/* ★ v2.4: Added superadmin counter badge */}
              <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <div style={{ background: primaryBadgeBg, border: `1px solid ${primaryBadgeBorder}`, borderRadius: radii.xl, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: typography.fontSize['2xl'], fontWeight: typography.fontWeight.bold, color: primaryBadgeText }}>{totalUsers}</span>
                  <span style={{ fontSize: typography.fontSize.sm, color: colors.text.muted }}>{t.users.totalUsers}</span>
                </div>
                <div style={{ background: warningBadgeBg, border: `1px solid ${warningBadgeBorder}`, borderRadius: radii.xl, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: typography.fontSize['2xl'], fontWeight: typography.fontWeight.bold, color: warningBadgeText }}>{totalAdmins}</span>
                  <span style={{ fontSize: typography.fontSize.sm, color: colors.text.muted }}>{t.users.totalAdmins}</span>
                </div>
                {/* ★ v2.4: Superadmin counter — gold */}
                <div style={{ background: superadminBadgeBg, border: `1px solid ${superadminBadgeBorder}`, borderRadius: radii.xl, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: typography.fontSize['2xl'], fontWeight: typography.fontWeight.bold, color: superadminBadgeText }}>{totalSuperAdmins}</span>
                  <span style={{ fontSize: typography.fontSize.sm, color: colors.text.muted }}>{t.users.totalSuperAdmins}</span>
                </div>
              </div>

              {admin.isLoadingUsers ? (
                <Card><SkeletonTable rows={5} cols={5} /></Card>
              ) : admin.users.length === 0 ? (
                <Card><p style={{ textAlign: 'center', color: colors.text.muted, padding: '40px 0' }}>{t.users.noUsers}</p></Card>
              ) : (
                <div style={{ borderRadius: radii.xl, border: `1px solid ${colors.border.light}`, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: isDark ? '#1A2332' : colors.surface.sidebar }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.users.email}</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.users.displayName}</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.users.role}</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.users.registered}</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.users.actions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {admin.users.map((user) => (
                        <tr key={user.id} style={{ borderTop: `1px solid ${colors.border.light}`, background: rowDefaultBg, transition: `background ${animation.duration.fast}` }}
                          onMouseEnter={e => (e.currentTarget.style.background = rowHoverBg)}
                          onMouseLeave={e => (e.currentTarget.style.background = rowDefaultBg)}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <UserAvatar name={user.display_name || ''} email={user.email} size={32} />
                              <span style={{ fontSize: typography.fontSize.sm, color: colors.text.body }}>{user.email}</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: typography.fontSize.sm, color: colors.text.body }}>{user.display_name || '—'}</td>
                          {/* ★ v2.4: Superadmin-aware role badge */}
                          <td style={{ padding: '12px 16px' }}>
                            {user.role === 'superadmin' ? (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                padding: '2px 10px', borderRadius: radii.full, fontSize: typography.fontSize.xs,
                                fontWeight: typography.fontWeight.semibold,
                                background: superadminBadgeBg, color: superadminBadgeText,
                                border: `1px solid ${superadminBadgeBorder}`,
                              }}>
                                👑 Super Admin
                              </span>
                            ) : (
                              <RoleBadge role={user.role as 'admin' | 'user'} />
                            )}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: typography.fontSize.xs, color: colors.text.muted }}>{formatDate(user.created_at, true)}</td>
                          {/* ★ v2.4: Protect superadmin role from being changed */}
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            {user.role === 'superadmin' ? (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                padding: '4px 12px', fontSize: typography.fontSize.xs, borderRadius: radii.md,
                                background: superadminBadgeBg, color: superadminBadgeText,
                                border: `1px solid ${superadminBadgeBorder}`,
                              }}>
                                🔒 {t.users.protected}
                              </span>
                            ) : (
                              <button
                                onClick={() => handleRoleChange(user)}
                                style={{
                                  padding: '4px 12px', fontSize: typography.fontSize.xs, borderRadius: radii.md,
                                  border: `1px solid ${colors.border.light}`, background: 'transparent',
                                  color: colors.text.body, cursor: 'pointer', transition: `all ${animation.duration.fast}`,
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = primaryBadgeBg; e.currentTarget.style.color = primaryBadgeText; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = colors.text.body; }}
                              >
                                {user.role === 'admin' ? t.users.makeUser : t.users.makeAdmin}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ═══ INSTRUCTIONS TAB ═══ */}
          {activeTab === 'instructions' && isUserAdmin && (
            <div style={{ display: 'flex', gap: '20px', minHeight: '400px' }}>
              {/* Sidebar */}
              <div style={{ width: '200px', flexShrink: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {instructionSections.map((section) => (
                    <button
                      key={section}
                      onClick={() => setActiveInstructionSection(section)}
                      style={{
                        padding: '8px 12px', fontSize: typography.fontSize.xs, textAlign: 'left',
                        borderRadius: radii.md, border: 'none', cursor: 'pointer',
                        background: activeInstructionSection === section ? primaryBadgeBg : 'transparent',
                        color: activeInstructionSection === section ? primaryBadgeText : colors.text.body,
                        fontWeight: activeInstructionSection === section ? typography.fontWeight.semibold : typography.fontWeight.medium,
                        transition: `all ${animation.duration.fast}`,
                      }}
                      onMouseEnter={e => { if (activeInstructionSection !== section) e.currentTarget.style.background = isDark ? 'rgba(99,102,241,0.06)' : lightColors.primary[50]; }}
                      onMouseLeave={e => { if (activeInstructionSection !== section) e.currentTarget.style.background = 'transparent'; }}
                    >
                      {t.instructions.sections[section]}
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button onClick={handleSaveGlobalInstructions} style={{ width: '100%', padding: '8px', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, background: colors.primary.gradient, color: '#FFFFFF', border: 'none', borderRadius: radii.md, cursor: 'pointer' }}>
                    {t.instructions.save}
                  </button>
                  <button onClick={handleResetGlobalInstructions} style={{ width: '100%', padding: '8px', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, background: 'transparent', color: colors.text.muted, border: `1px solid ${colors.border.light}`, borderRadius: radii.md, cursor: 'pointer' }}>
                    {t.instructions.reset}
                  </button>
                </div>
              </div>

              {/* Editor */}
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text.heading, margin: '0 0 12px' }}>
                  {t.instructions.sections[activeInstructionSection as keyof typeof t.instructions.sections] || activeInstructionSection}
                </h3>
                <textarea
                  value={editedInstructions[activeInstructionSection] || ''}
                  onChange={(e) => handleInstructionChange(activeInstructionSection, e.target.value)}
                  placeholder={getDefaultPlaceholder(activeInstructionSection)}
                  style={{
                    width: '100%', minHeight: '400px', padding: '12px', border: `1px solid ${colors.border.light}`,
                    borderRadius: radii.lg, fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.mono,
                    color: colors.text.body, background: colors.surface.card, resize: 'vertical',
                    lineHeight: typography.lineHeight.relaxed, outline: 'none',
                  }}
                />
              </div>
            </div>
          )}

          {/* ═══ AI PROVIDER TAB ═══ */}
          {activeTab === 'ai' && (
            <div style={{ maxWidth: '600px' }}>
              <h3 style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text.heading, margin: '0 0 4px' }}>
                {language === 'si' ? 'AI Ponudnik' : 'AI Provider'}
              </h3>
              <p style={{ fontSize: typography.fontSize.sm, color: colors.text.muted, margin: '0 0 20px' }}>
                {language === 'si' ? 'Izberi ponudnika AI in vnesi API ključ.' : 'Select your AI provider and enter your API key.'}
              </p>

              {/* ★ v2.3: Provider cards — now 3 cards */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                {/* Gemini card */}
                <div
                  onClick={() => handleProviderChange('gemini')}
                  style={{
                    flex: 1, padding: spacing.lg, borderRadius: radii.xl, cursor: 'pointer',
                    border: `2px solid ${aiProvider === 'gemini' ? (isDark ? '#818CF8' : colors.primary[500]) : colors.border.light}`,
                    background: aiProvider === 'gemini' ? primaryBadgeBg : 'transparent',
                    transition: `all ${animation.duration.fast}`,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '28px', marginBottom: spacing.sm }}>✨</div>
                  <div style={{ fontWeight: typography.fontWeight.semibold, color: colors.text.heading, fontSize: typography.fontSize.sm }}>Gemini</div>
                  <div style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, marginTop: '2px' }}>Google AI Studio</div>
                </div>

                {/* ★ v2.3: OpenAI card */}
                <div
                  onClick={() => handleProviderChange('openai')}
                  style={{
                    flex: 1, padding: spacing.lg, borderRadius: radii.xl, cursor: 'pointer',
                    border: `2px solid ${aiProvider === 'openai' ? (isDark ? '#818CF8' : colors.primary[500]) : colors.border.light}`,
                    background: aiProvider === 'openai' ? primaryBadgeBg : 'transparent',
                    transition: `all ${animation.duration.fast}`,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '28px', marginBottom: spacing.sm }}>🤖</div>
                  <div style={{ fontWeight: typography.fontWeight.semibold, color: colors.text.heading, fontSize: typography.fontSize.sm }}>OpenAI</div>
                  <div style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, marginTop: '2px' }}>ChatGPT / GPT-5.2</div>
                </div>

                {/* OpenRouter card */}
                <div
                  onClick={() => handleProviderChange('openrouter')}
                  style={{
                    flex: 1, padding: spacing.lg, borderRadius: radii.xl, cursor: 'pointer',
                    border: `2px solid ${aiProvider === 'openrouter' ? (isDark ? '#818CF8' : colors.primary[500]) : colors.border.light}`,
                    background: aiProvider === 'openrouter' ? primaryBadgeBg : 'transparent',
                    transition: `all ${animation.duration.fast}`,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '28px', marginBottom: spacing.sm }}>🔀</div>
                  <div style={{ fontWeight: typography.fontWeight.semibold, color: colors.text.heading, fontSize: typography.fontSize.sm }}>OpenRouter</div>
                  <div style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, marginTop: '2px' }}>200+ Models</div>
                </div>
              </div>

              {/* API Key input — conditional per provider */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Gemini key */}
                {aiProvider === 'gemini' && (
                  <div>
                    <label style={labelStyle}>Gemini API Key</label>
                    <input type="password" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} style={inputStyle} placeholder="AIza..." />
                    <p style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, marginTop: '4px' }}>
                      {language === 'si' ? 'Pridobi brezplačni ključ na ' : 'Get your free key at '}
                      <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: colors.primary[isDark ? 300 : 600] }}>Google AI Studio</a>
                    </p>
                  </div>
                )}

                {/* ★ v2.3: OpenAI key */}
                {aiProvider === 'openai' && (
                  <div>
                    <label style={labelStyle}>OpenAI API Key</label>
                    <input type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} style={inputStyle} placeholder="sk-..." />
                    <p style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, marginTop: '4px' }}>
                      {language === 'si' ? 'Pridobi ključ na ' : 'Get your key at '}
                      <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: colors.primary[isDark ? 300 : 600] }}>platform.openai.com</a>
                    </p>
                  </div>
                )}

                {/* OpenRouter key */}
                {aiProvider === 'openrouter' && (
                  <div>
                    <label style={labelStyle}>OpenRouter API Key</label>
                    <input type="password" value={openRouterKey} onChange={(e) => setOpenRouterKey(e.target.value)} style={inputStyle} placeholder="sk-or-..." />
                    <p style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, marginTop: '4px' }}>
                      {language === 'si' ? 'Pridobi ključ na ' : 'Get your key at '}
                      <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" style={{ color: colors.primary[isDark ? 300 : 600] }}>openrouter.ai</a>
                    </p>
                  </div>
                )}

                {/* Model selector */}
                <div>
                  <label style={labelStyle}>{language === 'si' ? 'Model' : 'Model'}</label>
                  <select
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    style={{
                      ...inputStyle, fontFamily: typography.fontFamily.sans, cursor: 'pointer',
                      appearance: 'none',
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394A3B8' d='M2 4l4 4 4-4'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 12px center',
                      paddingRight: '36px',
                    }}
                  >
                    {currentModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.name} — {m.description}</option>
                    ))}
                  </select>
                </div>

                {/* Info box per provider */}
                {aiProvider === 'gemini' && (
                  <div style={{ background: secondaryInfoBg, border: `1px solid ${secondaryInfoBorder}`, borderRadius: radii.lg, padding: '12px 16px' }}>
                    <p style={{ fontSize: typography.fontSize.xs, color: secondaryInfoText, margin: 0 }}>
                      {language === 'si'
                        ? '💡 Gemini 3 Pro je privzeti model — najzmogljivejši za EU projektno pisanje. Gemini API ključ je brezplačen za osebno uporabo.'
                        : '💡 Gemini 3 Pro is the default model — most capable for EU project writing. Gemini API key is free for personal use.'}
                    </p>
                  </div>
                )}

                {aiProvider === 'openai' && (
                  <div style={{ background: secondaryInfoBg, border: `1px solid ${secondaryInfoBorder}`, borderRadius: radii.lg, padding: '12px 16px' }}>
                    <p style={{ fontSize: typography.fontSize.xs, color: secondaryInfoText, margin: 0 }}>
                      {language === 'si'
                        ? '💡 GPT-5.2 je privzeti model — najnovejši OpenAI flagship. Zahteva plačljivi API račun na platform.openai.com.'
                        : '💡 GPT-5.2 is the default model — latest OpenAI flagship. Requires a paid API account at platform.openai.com.'}
                    </p>
                  </div>
                )}

                {aiProvider === 'openrouter' && (
                  <div style={{ background: warningInfoBg, border: `1px solid ${warningInfoBorder}`, borderRadius: radii.lg, padding: '12px 16px' }}>
                    <p style={{ fontSize: typography.fontSize.xs, color: warningInfoText, margin: 0 }}>
                      {language === 'si'
                        ? '⚠️ OpenRouter omogoča dostop do 200+ modelov (DeepSeek, Llama, Mistral, Claude...). Nekateri modeli so brezplačni. Preveri kredite na openrouter.ai.'
                        : '⚠️ OpenRouter gives you access to 200+ models (DeepSeek, Llama, Mistral, Claude...). Some models are free. Check your credits at openrouter.ai.'}
                    </p>
                  </div>
                )}

                {/* Message */}
                {message && (
                  <div style={{
                    padding: '10px 16px', borderRadius: radii.lg, fontSize: typography.fontSize.sm, textAlign: 'center',
                    background: isError ? errorBg : successBg,
                    border: `1px solid ${isError ? errorBorder : successBorder}`,
                    color: isError ? errorText : successText,
                  }}>
                    {message}
                  </div>
                )}

                {/* Save button */}
                <button
                  onClick={handleAISave}
                  disabled={isValidating}
                  style={{
                    width: '100%', padding: '12px', fontSize: typography.fontSize.sm,
                    fontWeight: typography.fontWeight.semibold, background: colors.primary.gradient,
                    color: '#FFFFFF', border: 'none', borderRadius: radii.lg, cursor: isValidating ? 'not-allowed' : 'pointer',
                    opacity: isValidating ? 0.6 : 1, boxShadow: shadows.sm,
                  }}
                >
                  {isValidating
                    ? (language === 'si' ? 'Preverjam...' : 'Validating...')
                    : (language === 'si' ? 'Shrani & Preveri' : 'Save & Validate')}
                </button>
              </div>
            </div>
          )}
          {/* ═══ PROFILE & SECURITY TAB ═══ */}
          {activeTab === 'profile' && (
            <div style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {/* ★ v2.4: Custom Logo — SUPERADMIN ONLY or White-Label notice */}
              {storageService.isSuperAdmin() ? (
                /* Superadmin sees full logo upload UI */
                <div>
                  <h3 style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text.heading, margin: '0 0 12px' }}>
                    {t.whiteLabel.logoTitle}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {customLogo && (
                      <img src={customLogo} alt="Logo" style={{ height: 48, width: 'auto', borderRadius: radii.md, border: `1px solid ${colors.border.light}` }} />
                    )}
                    <label style={{
                      padding: '8px 16px', fontSize: typography.fontSize.sm, borderRadius: radii.md,
                      border: `1px solid ${colors.border.light}`, background: 'transparent',
                      color: colors.text.body, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
                    }}>
                      <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      {language === 'si' ? 'Naloži logo' : 'Upload Logo'}
                      <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                    </label>
                    {customLogo && (
                      <button
                        onClick={handleRemoveLogo}
                        style={{
                          padding: '8px 12px', fontSize: typography.fontSize.xs, borderRadius: radii.md,
                          border: `1px solid ${errorBorder}`, background: errorBg,
                          color: errorText, cursor: 'pointer',
                        }}
                      >
                        {language === 'si' ? 'Odstrani' : 'Remove'}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* ★ v2.4: Non-superadmin sees White-Label notice */
                <div>
                  <h3 style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text.heading, margin: '0 0 12px' }}>
                    {t.whiteLabel.logoTitle}
                  </h3>
                  <div style={{
                    background: isDark ? 'rgba(251,191,36,0.08)' : '#FFFBEB',
                    border: `1px solid ${isDark ? 'rgba(251,191,36,0.2)' : '#FDE68A'}`,
                    borderRadius: radii.lg, padding: '16px', display: 'flex', alignItems: 'center', gap: '12px',
                  }}>
                    <span style={{ fontSize: '20px', flexShrink: 0 }}>🏷️</span>
                    <p style={{ fontSize: typography.fontSize.sm, color: isDark ? '#FDE68A' : '#92400E', margin: 0, lineHeight: typography.lineHeight.relaxed }}>
                      {t.whiteLabel.logoNotice}
                    </p>
                  </div>
                </div>
              )}

              {/* Change Password */}
              <div>
                <h3 style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text.heading, margin: '0 0 12px' }}>
                  {language === 'si' ? 'Spremeni geslo' : 'Change Password'}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>{language === 'si' ? 'Novo geslo' : 'New Password'}</label>
                    <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={{ ...inputStyle, fontFamily: typography.fontFamily.sans }} />
                  </div>
                  <div>
                    <label style={labelStyle}>{language === 'si' ? 'Potrdi geslo' : 'Confirm Password'}</label>
                    <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={{ ...inputStyle, fontFamily: typography.fontFamily.sans }} />
                  </div>
                  <button onClick={handlePasswordChange} style={{ padding: '10px 20px', fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, background: colors.primary.gradient, color: '#FFFFFF', border: 'none', borderRadius: radii.lg, cursor: 'pointer', alignSelf: 'flex-start' }}>
                    {language === 'si' ? 'Spremeni geslo' : 'Change Password'}
                  </button>
                </div>
              </div>

              {/* 2FA */}
              <div>
                <h3 style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text.heading, margin: '0 0 12px' }}>
                  {language === 'si' ? 'Dvostopenjsko preverjanje (2FA)' : 'Two-Factor Authentication (2FA)'}
                </h3>

                {hasMFA ? (
                  <div style={{ background: successBg, border: `1px solid ${successBorder}`, borderRadius: radii.lg, padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '18px' }}>✅</span>
                      <span style={{ fontWeight: typography.fontWeight.semibold, color: successText, fontSize: typography.fontSize.sm }}>
                        {language === 'si' ? '2FA je aktiviran' : '2FA is enabled'}
                      </span>
                    </div>
                    {mfaFactors.map((factor) => (
                      <div key={factor.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                        <span style={{ fontSize: typography.fontSize.sm, color: colors.text.body }}>{factor.friendly_name || 'TOTP'}</span>
                        <button
                          onClick={() => handleDisableMFA(factor.id)}
                          style={{ padding: '4px 12px', fontSize: typography.fontSize.xs, borderRadius: radii.md, border: `1px solid ${errorBorder}`, background: errorBg, color: errorText, cursor: 'pointer' }}
                        >
                          {language === 'si' ? 'Deaktiviraj' : 'Disable'}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : mfaEnrolling && enrollData ? (
                  <div style={{ background: colors.surface.card, border: `1px solid ${colors.border.light}`, borderRadius: radii.lg, padding: '20px' }}>
                    <p style={{ fontSize: typography.fontSize.sm, color: colors.text.body, marginBottom: '16px' }}>
                      {language === 'si' ? 'Skeniraj QR kodo z authenticator aplikacijo:' : 'Scan this QR code with your authenticator app:'}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                      <QRCodeImage value={enrollData.qrUri} size={180} colors={colors} />
                    </div>
                    <p style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, textAlign: 'center', marginBottom: '16px', fontFamily: typography.fontFamily.mono, wordBreak: 'break-all' }}>
                      {enrollData.secret}
                    </p>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <input
                        type="text" value={enrollCode}
                        onChange={(e) => setEnrollCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000" maxLength={6}
                        style={{ ...inputStyle, textAlign: 'center', letterSpacing: '0.3em', fontFamily: typography.fontFamily.mono, fontSize: typography.fontSize.lg, flex: 1 }}
                        onKeyDown={(e) => e.key === 'Enter' && enrollCode.length === 6 && handleVerifyMFAEnroll()}
                      />
                      <button onClick={handleVerifyMFAEnroll} disabled={enrollCode.length !== 6} style={{ padding: '10px 20px', fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, background: colors.primary.gradient, color: '#FFFFFF', border: 'none', borderRadius: radii.lg, cursor: enrollCode.length !== 6 ? 'not-allowed' : 'pointer', opacity: enrollCode.length !== 6 ? 0.5 : 1 }}>
                        {language === 'si' ? 'Potrdi' : 'Verify'}
                      </button>
                    </div>
                    {enrollError && <p style={{ color: errorText, fontSize: typography.fontSize.xs, margin: '8px 0 0' }}>{enrollError}</p>}
                    <button onClick={() => { setMfaEnrolling(false); setEnrollData(null); }} style={{ marginTop: '8px', fontSize: typography.fontSize.xs, color: colors.text.muted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                      {language === 'si' ? 'Prekliči' : 'Cancel'}
                    </button>
                  </div>
                ) : (
                  <button onClick={handleStartMFAEnroll} style={{ padding: '10px 20px', fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, background: colors.primary.gradient, color: '#FFFFFF', border: 'none', borderRadius: radii.lg, cursor: 'pointer' }}>
                    {language === 'si' ? 'Aktiviraj 2FA' : 'Enable 2FA'}
                  </button>
                )}
                {enrollError && !mfaEnrolling && <p style={{ color: errorText, fontSize: typography.fontSize.xs, marginTop: '8px' }}>{enrollError}</p>}
              </div>

              {/* Profile message */}
              {message && (
                <div style={{
                  padding: '10px 16px', borderRadius: radii.lg, fontSize: typography.fontSize.sm, textAlign: 'center',
                  background: isError ? errorBg : successBg,
                  border: `1px solid ${isError ? errorBorder : successBorder}`,
                  color: isError ? errorText : successText,
                }}>
                  {message}
                </div>
              )}
            </div>
          )}

          {/* ═══ AUDIT LOG TAB ═══ */}
          {activeTab === 'audit' && isUserAdmin && (
            <div>
              <h3 style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text.heading, margin: '0 0 4px' }}>{t.log.title}</h3>
              <p style={{ fontSize: typography.fontSize.sm, color: colors.text.muted, margin: '0 0 20px' }}>{t.log.subtitle}</p>

              {admin.isLoadingLog ? (
                <Card><SkeletonTable rows={5} cols={4} /></Card>
              ) : admin.adminLog.length === 0 ? (
                <Card><p style={{ textAlign: 'center', color: colors.text.muted, padding: '40px 0' }}>{t.log.noEntries}</p></Card>
              ) : (
                <div style={{ borderRadius: radii.xl, border: `1px solid ${colors.border.light}`, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: isDark ? '#1A2332' : colors.surface.sidebar }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.log.date}</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.log.admin}</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.log.action}</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.log.details}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {admin.adminLog.map((entry: AdminLogEntry) => (
                        <tr key={entry.id} style={{ borderTop: `1px solid ${colors.border.light}`, background: rowDefaultBg, transition: `background ${animation.duration.fast}` }}
                          onMouseEnter={e => (e.currentTarget.style.background = rowHoverBg)}
                          onMouseLeave={e => (e.currentTarget.style.background = rowDefaultBg)}>
                          <td style={{ padding: '12px 16px', fontSize: typography.fontSize.xs, color: colors.text.muted }}>{formatDate(entry.created_at)}</td>
                          <td style={{ padding: '12px 16px', fontSize: typography.fontSize.sm, color: colors.text.body }}>{entry.admin_email || '—'}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <Badge variant={entry.action === 'role_change' ? 'primary' : entry.action === 'instructions_reset' ? 'warning' : 'secondary'}>
                              {(t.log.actions as Record<string, string>)[entry.action] || entry.action}
                            </Badge>
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: typography.fontSize.xs, color: colors.text.muted, maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {entry.target_email && <span>{entry.target_email} </span>}
                            {entry.details && <span>{typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details)}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

            </>
          )}
        </div>

        {/* ─── Toast ─── */}
        {toast && (
          <div style={{
            position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
            padding: '10px 24px', borderRadius: radii.lg, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium,
            background: toast.type === 'success' ? successBg : errorBg,
            border: `1px solid ${toast.type === 'success' ? successBorder : errorBorder}`,
            color: toast.type === 'success' ? successText : errorText,
            boxShadow: shadows.lg, animation: 'fadeIn 0.2s ease-out', zIndex: 10,
          }}>
            {toast.type === 'success' ? '✓ ' : '✗ '}{toast.message}
          </div>
        )}

        {/* ─── Confirm Modal ─── */}
        {confirmModal?.isOpen && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: radii['2xl'],
          }}>
            <div style={{
              background: colors.surface.card, borderRadius: radii.xl, padding: '24px',
              maxWidth: '400px', width: '90%', boxShadow: shadows['2xl'], border: `1px solid ${colors.border.light}`,
            }}>
              <h3 style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text.heading, margin: '0 0 12px' }}>
                {confirmModal.title}
              </h3>
              <p style={{ fontSize: typography.fontSize.sm, color: colors.text.body, margin: '0 0 20px', lineHeight: typography.lineHeight.relaxed }}>
                {confirmModal.message}
              </p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setConfirmModal(null)}
                  style={{ padding: '8px 16px', fontSize: typography.fontSize.sm, borderRadius: radii.md, border: `1px solid ${colors.border.light}`, background: 'transparent', color: colors.text.body, cursor: 'pointer' }}
                >
                  {language === 'si' ? 'Prekliči' : 'Cancel'}
                </button>
                <button
                  onClick={confirmModal.onConfirm}
                  style={{ padding: '8px 16px', fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, borderRadius: radii.md, border: 'none', background: colors.primary.gradient, color: '#FFFFFF', cursor: 'pointer' }}
                >
                  {language === 'si' ? 'Potrdi' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
