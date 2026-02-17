// components/AdminPanel.tsx
// ═══════════════════════════════════════════════════════════════
// Admin Panel — User management, Instructions editor, Audit log
// v1.0 — 2026-02-17
// First component built with the new EURO-OFFICE Design System
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from 'react';
import { useAdmin, type AdminUser, type AdminLogEntry } from '../hooks/useAdmin.ts';
import { Card, CardHeader } from '../design/components/Card.tsx';
import { Button, SparkleIcon } from '../design/components/Button.tsx';
import { Badge, RoleBadge } from '../design/components/Badge.tsx';
import { SkeletonTable, SkeletonText } from '../design/components/Skeleton.tsx';
import { colors, shadows, radii, animation, typography } from '../design/theme.ts';
import { TEXT } from '../locales.ts';

// ─── Types ───────────────────────────────────────────────────

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'en' | 'si';
}

type TabId = 'users' | 'instructions' | 'log';

// ─── Localized texts ─────────────────────────────────────────

const ADMIN_TEXT = {
  en: {
    title: 'Admin Panel',
    subtitle: 'Manage users, AI instructions, and view audit log',
    tabs: {
      users: 'Users',
      instructions: 'Instructions',
      log: 'Audit Log',
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
    close: 'Close',
  },
  si: {
    title: 'Admin Panel',
    subtitle: 'Upravljanje uporabnikov, AI pravil in pregled dnevnika',
    tabs: {
      users: 'Uporabniki',
      instructions: 'Pravila',
      log: 'Dnevnik',
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
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
};

// ─── Helper: User initials avatar ────────────────────────────

const UserAvatar: React.FC<{ name: string; email: string; size?: number }> = ({
  name,
  email,
  size = 36,
}) => {
  const initials = (name || email || '?')
    .split(/[\s@]+/)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase() || '')
    .join('');

  // Generate consistent color from email
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;

  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: radii.full,
      background: `hsl(${hue}, 65%, 55%)`,
      color: '#FFFFFF',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: `${size * 0.38}px`,
      fontWeight: '700',
      flexShrink: 0,
      letterSpacing: '-0.5px',
    }}>
      {initials}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose, language }) => {
  const admin = useAdmin();
  const t = ADMIN_TEXT[language] || ADMIN_TEXT.en;

  const [activeTab, setActiveTab] = useState<TabId>('users');
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Instructions editor state
  const [editedInstructions, setEditedInstructions] = useState<Record<string, string>>({});
  const [activeInstructionSection, setActiveInstructionSection] = useState<string>('global');

  // ─── Load data on open ─────────────────────────────────────

  useEffect(() => {
    if (isOpen && admin.isAdmin) {
      admin.fetchUsers();
      admin.fetchGlobalInstructions();
    }
  }, [isOpen, admin.isAdmin]);

  // Load log when switching to log tab
  useEffect(() => {
    if (activeTab === 'log' && isOpen && admin.isAdmin) {
      admin.fetchAdminLog();
    }
  }, [activeTab, isOpen, admin.isAdmin]);

  // Sync edited instructions with fetched data
  useEffect(() => {
    if (admin.globalInstructions?.custom_instructions) {
      setEditedInstructions(admin.globalInstructions.custom_instructions);
    } else {
      setEditedInstructions({});
    }
  }, [admin.globalInstructions]);

  // ─── Toast auto-dismiss ────────────────────────────────────

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // ─── Handlers ──────────────────────────────────────────────

  const handleRoleChange = useCallback((user: AdminUser) => {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    const confirmMsg = user.role === 'admin'
      ? `${t.users.confirmRoleChange} "${user.email}" ${t.users.confirmToUser}`
      : `${t.users.confirmRoleChange} "${user.email}" ${t.users.confirmToAdmin}`;

    setConfirmModal({
      isOpen: true,
      title: t.users.changeRole,
      message: confirmMsg,
      onConfirm: async () => {
        setConfirmModal(null);
        const result = await admin.updateUserRole(user.id, newRole);
        if (result.success) {
          setToast({ message: t.users.roleUpdated, type: 'success' });
        } else {
          setToast({ message: `${t.users.roleUpdateFailed} ${result.message}`, type: 'error' });
        }
      },
    });
  }, [admin, t]);

  const handleSaveInstructions = useCallback(async () => {
    const result = await admin.saveGlobalInstructions(editedInstructions);
    if (result.success) {
      setToast({ message: t.instructions.saved, type: 'success' });
    } else {
      setToast({ message: `${t.instructions.saveFailed} ${result.message}`, type: 'error' });
    }
  }, [admin, editedInstructions, t]);

  const handleResetInstructions = useCallback(() => {
    setConfirmModal({
      isOpen: true,
      title: t.instructions.reset,
      message: t.instructions.resetConfirm,
      onConfirm: async () => {
        setConfirmModal(null);
        const result = await admin.resetInstructionsToDefault();
        if (result.success) {
          setEditedInstructions({});
          setToast({ message: t.instructions.resetDone, type: 'success' });
        } else {
          setToast({ message: `${t.instructions.resetFailed} ${result.message}`, type: 'error' });
        }
      },
    });
  }, [admin, t]);

  const handleInstructionChange = useCallback((section: string, value: string) => {
    setEditedInstructions(prev => ({
      ...prev,
      [section]: value,
    }));
  }, []);

  // ─── Don't render if not open ──────────────────────────────

  if (!isOpen) return null;

  // ─── Stats ─────────────────────────────────────────────────

  const totalUsers = admin.users.length;
  const totalAdmins = admin.users.filter(u => u.role === 'admin').length;

  // ─── Instruction sections ──────────────────────────────────

  const instructionSections = Object.keys(t.instructions.sections) as (keyof typeof t.instructions.sections)[];

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      background: colors.surface.overlay,
      backdropFilter: 'blur(4px)',
      animation: 'fadeIn 0.2s ease-out',
    }}>
      {/* ─── Main Panel ─────────────────────────────────────── */}
      <div style={{
        background: colors.surface.background,
        borderRadius: radii['2xl'],
        boxShadow: shadows['2xl'],
        width: '100%',
        maxWidth: '1100px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'scaleIn 0.25s ease-out',
      }}>

        {/* ─── Header ─────────────────────────────────────────── */}
        <div style={{
          background: colors.primary.gradient,
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{
              color: colors.text.inverse,
              fontSize: typography.fontSize['xl'],
              fontWeight: typography.fontWeight.bold,
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}>
              🛡️ {t.title}
            </h2>
            <p style={{
              color: 'rgba(255,255,255,0.75)',
              fontSize: typography.fontSize.sm,
              margin: '4px 0 0',
            }}>
              {t.subtitle}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              borderRadius: radii.lg,
              padding: '8px',
              cursor: 'pointer',
              color: colors.text.inverse,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: `background ${animation.duration.fast}`,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ─── Tabs ───────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          borderBottom: `1px solid ${colors.border.light}`,
          background: colors.surface.card,
          flexShrink: 0,
          padding: '0 24px',
        }}>
          {(['users', 'instructions', 'log'] as TabId[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 20px',
                fontSize: typography.fontSize.sm,
                fontWeight: activeTab === tab ? typography.fontWeight.semibold : typography.fontWeight.medium,
                color: activeTab === tab ? colors.primary[600] : colors.text.muted,
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab ? `2px solid ${colors.primary[500]}` : '2px solid transparent',
                cursor: 'pointer',
                transition: `all ${animation.duration.fast}`,
                marginBottom: '-1px',
              }}
              onMouseEnter={e => {
                if (activeTab !== tab) e.currentTarget.style.color = colors.text.body;
              }}
              onMouseLeave={e => {
                if (activeTab !== tab) e.currentTarget.style.color = colors.text.muted;
              }}
            >
              {tab === 'users' && '👥 '}{tab === 'instructions' && '📋 '}{tab === 'log' && '📜 '}
              {t.tabs[tab]}
            </button>
          ))}
        </div>

        {/* ─── Content ────────────────────────────────────────── */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          background: colors.surface.background,
        }}>

          {/* ═══ USERS TAB ═══ */}
          {activeTab === 'users' && (
            <div>
              {/* Stats bar */}
              <div style={{
                display: 'flex',
                gap: '16px',
                marginBottom: '20px',
              }}>
                <div style={{
                  background: colors.primary[50],
                  border: `1px solid ${colors.primary[200]}`,
                  borderRadius: radii.xl,
                  padding: '12px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <span style={{ fontSize: typography.fontSize['2xl'], fontWeight: typography.fontWeight.bold, color: colors.primary[600] }}>
                    {totalUsers}
                  </span>
                  <span style={{ fontSize: typography.fontSize.sm, color: colors.text.muted }}>
                    {t.users.totalUsers}
                  </span>
                </div>
                <div style={{
                  background: colors.warning[50],
                  border: `1px solid ${colors.warning[200]}`,
                  borderRadius: radii.xl,
                  padding: '12px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <span style={{ fontSize: typography.fontSize['2xl'], fontWeight: typography.fontWeight.bold, color: colors.warning[600] }}>
                    {totalAdmins}
                  </span>
                  <span style={{ fontSize: typography.fontSize.sm, color: colors.text.muted }}>
                    {t.users.totalAdmins}
                  </span>
                </div>
              </div>

              {/* Users table */}
              {admin.isLoadingUsers ? (
                <Card><SkeletonTable rows={5} cols={5} /></Card>
              ) : admin.users.length === 0 ? (
                <Card>
                  <p style={{ textAlign: 'center', color: colors.text.muted, padding: '40px 0' }}>
                    {t.users.noUsers}
                  </p>
                </Card>
              ) : (
                <Card padded={false}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typography.fontSize.sm }}>
                      <thead>
                        <tr style={{ borderBottom: `2px solid ${colors.border.light}`, background: colors.surface.sidebar }}>
                          <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: typography.fontWeight.semibold, color: colors.text.muted, fontSize: typography.fontSize.xs, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {t.users.displayName}
                          </th>
                          <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: typography.fontWeight.semibold, color: colors.text.muted, fontSize: typography.fontSize.xs, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {t.users.email}
                          </th>
                          <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: typography.fontWeight.semibold, color: colors.text.muted, fontSize: typography.fontSize.xs, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {t.users.role}
                          </th>
                          <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: typography.fontWeight.semibold, color: colors.text.muted, fontSize: typography.fontSize.xs, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {t.users.lastLogin}
                          </th>
                          <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: typography.fontWeight.semibold, color: colors.text.muted, fontSize: typography.fontSize.xs, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {t.users.actions}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {admin.users.map((user, idx) => (
                          <tr
                            key={user.id}
                            style={{
                              borderBottom: `1px solid ${colors.border.light}`,
                              transition: `background ${animation.duration.fast}`,
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = colors.primary[50])}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <UserAvatar name={user.displayName} email={user.email} />
                                <div>
                                  <div style={{ fontWeight: typography.fontWeight.semibold, color: colors.text.heading }}>
                                    {user.displayName}
                                  </div>
                                  <div style={{ fontSize: typography.fontSize.xs, color: colors.text.muted }}>
                                    {formatDate(user.createdAt, true)}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '12px 16px', color: colors.text.body }}>
                              {user.email}
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                              <RoleBadge role={user.role} language={language} />
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'center', color: colors.text.muted, fontSize: typography.fontSize.xs }}>
                              {user.lastSignIn ? formatDate(user.lastSignIn) : t.users.never}
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                              <Button
                                variant={user.role === 'admin' ? 'ghost' : 'secondary'}
                                size="sm"
                                onClick={() => handleRoleChange(user)}
                              >
                                {user.role === 'admin' ? t.users.makeUser : t.users.makeAdmin}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* ═══ INSTRUCTIONS TAB ═══ */}
          {activeTab === 'instructions' && (
            <div>
              {admin.isLoadingInstructions ? (
                <Card><SkeletonText lines={10} /></Card>
              ) : (
                <div style={{ display: 'flex', gap: '20px', minHeight: '500px' }}>
                  {/* Section list (left sidebar) */}
                  <div style={{
                    width: '220px',
                    flexShrink: 0,
                    background: colors.surface.card,
                    borderRadius: radii.xl,
                    border: `1px solid ${colors.border.light}`,
                    padding: '8px',
                    overflowY: 'auto',
                  }}>
                    {instructionSections.map((section) => (
                      <button
                        key={section}
                        onClick={() => setActiveInstructionSection(section)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 12px',
                          borderRadius: radii.lg,
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: typography.fontSize.sm,
                          fontWeight: activeInstructionSection === section
                            ? typography.fontWeight.semibold
                            : typography.fontWeight.normal,
                          color: activeInstructionSection === section
                            ? colors.primary[700]
                            : colors.text.body,
                          background: activeInstructionSection === section
                            ? colors.primary[50]
                            : 'transparent',
                          transition: `all ${animation.duration.fast}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                        onMouseEnter={e => {
                          if (activeInstructionSection !== section) {
                            e.currentTarget.style.background = colors.surface.sidebar;
                          }
                        }}
                        onMouseLeave={e => {
                          if (activeInstructionSection !== section) {
                            e.currentTarget.style.background = 'transparent';
                          }
                        }}
                      >
                        <span>{(t.instructions.sections as Record<string, string>)[section]}</span>
                        {editedInstructions[section] && (
                          <div style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: radii.full,
                            background: colors.primary[400],
                            flexShrink: 0,
                          }} />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Editor (right side) */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Info bar */}
                    {admin.globalInstructions?.updated_at ? (
                      <div style={{
                        fontSize: typography.fontSize.xs,
                        color: colors.text.muted,
                        padding: '8px 12px',
                        background: colors.surface.sidebar,
                        borderRadius: radii.lg,
                      }}>
                        {t.instructions.lastUpdated}: {formatDate(admin.globalInstructions.updated_at)}
                      </div>
                    ) : (
                      <div style={{
                        fontSize: typography.fontSize.xs,
                        color: colors.secondary[600],
                        padding: '8px 12px',
                        background: colors.secondary[50],
                        borderRadius: radii.lg,
                        border: `1px solid ${colors.secondary[200]}`,
                      }}>
                        ℹ️ {t.instructions.usingDefaults}
                      </div>
                    )}

                    {/* Textarea */}
                    <div style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                    }}>
                      <label style={{
                        fontSize: typography.fontSize.sm,
                        fontWeight: typography.fontWeight.semibold,
                        color: colors.text.heading,
                        marginBottom: '8px',
                      }}>
                        {(t.instructions.sections as Record<string, string>)[activeInstructionSection]}
                      </label>
                      <textarea
                        value={editedInstructions[activeInstructionSection] || ''}
                        onChange={(e) => handleInstructionChange(activeInstructionSection, e.target.value)}
                        placeholder={`Enter custom ${activeInstructionSection} instructions...`}
                        style={{
                          flex: 1,
                          minHeight: '300px',
                          padding: '16px',
                          borderRadius: radii.xl,
                          border: `1px solid ${colors.border.light}`,
                          fontSize: typography.fontSize.sm,
                          fontFamily: typography.fontFamily.mono,
                          lineHeight: typography.lineHeight.relaxed,
                          color: colors.text.body,
                          background: colors.surface.card,
                          resize: 'vertical',
                          outline: 'none',
                          transition: `border-color ${animation.duration.fast}`,
                        }}
                        onFocus={e => (e.currentTarget.style.borderColor = colors.primary[400])}
                        onBlur={e => (e.currentTarget.style.borderColor = colors.border.light)}
                      />
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={handleResetInstructions}
                        disabled={admin.isSavingInstructions}
                      >
                        {t.instructions.reset}
                      </Button>
                      <Button
                        variant="primary"
                        size="md"
                        onClick={handleSaveInstructions}
                        loading={admin.isSavingInstructions}
                      >
                        {t.instructions.save}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ AUDIT LOG TAB ═══ */}
          {activeTab === 'log' && (
            <div>
              {admin.isLoadingLog ? (
                <Card><SkeletonTable rows={8} cols={4} /></Card>
              ) : admin.adminLog.length === 0 ? (
                <Card>
                  <p style={{ textAlign: 'center', color: colors.text.muted, padding: '40px 0' }}>
                    {t.log.noEntries}
                  </p>
                </Card>
              ) : (
                <Card padded={false}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typography.fontSize.sm }}>
                      <thead>
                        <tr style={{ borderBottom: `2px solid ${colors.border.light}`, background: colors.surface.sidebar }}>
                          <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: typography.fontWeight.semibold, color: colors.text.muted, fontSize: typography.fontSize.xs, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {t.log.date}
                          </th>
                          <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: typography.fontWeight.semibold, color: colors.text.muted, fontSize: typography.fontSize.xs, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {t.log.admin}
                          </th>
                          <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: typography.fontWeight.semibold, color: colors.text.muted, fontSize: typography.fontSize.xs, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {t.log.action}
                          </th>
                          <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: typography.fontWeight.semibold, color: colors.text.muted, fontSize: typography.fontSize.xs, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {t.log.details}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {admin.adminLog.map((entry) => {
                          const actionLabel = (t.log.actions as Record<string, string>)[entry.action] || entry.action;
                          let badgeVariant: 'primary' | 'warning' | 'error' | 'neutral' = 'neutral';
                          if (entry.action === 'role_change') badgeVariant = 'warning';
                          if (entry.action === 'instructions_update') badgeVariant = 'primary';
                          if (entry.action === 'instructions_reset') badgeVariant = 'error';

                          let detailText = '';
                          if (entry.action === 'role_change' && entry.details) {
                            detailText = `${entry.targetEmail || '?'}: ${entry.details.old_role} → ${entry.details.new_role}`;
                          } else if (entry.action === 'instructions_update' && entry.details) {
                            detailText = `${entry.details.sections_updated || '?'} sections`;
                          } else if (entry.action === 'instructions_reset') {
                            detailText = 'Reset to default';
                          }

                          return (
                            <tr
                              key={entry.id}
                              style={{ borderBottom: `1px solid ${colors.border.light}` }}
                              onMouseEnter={e => (e.currentTarget.style.background = colors.surface.sidebar)}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              <td style={{ padding: '10px 16px', color: colors.text.muted, fontSize: typography.fontSize.xs, whiteSpace: 'nowrap' }}>
                                {formatDate(entry.createdAt)}
                              </td>
                              <td style={{ padding: '10px 16px', color: colors.text.body }}>
                                {entry.adminEmail}
                              </td>
                              <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                                <Badge variant={badgeVariant} size="sm">
                                  {actionLabel}
                                </Badge>
                              </td>
                              <td style={{ padding: '10px 16px', color: colors.text.body, fontSize: typography.fontSize.xs }}>
                                {detailText}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Confirm Modal ──────────────────────────────────── */}
      {confirmModal?.isOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 110,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          background: 'rgba(0,0,0,0.3)',
        }}>
          <div style={{
            background: colors.surface.card,
            borderRadius: radii['2xl'],
            boxShadow: shadows.xl,
            padding: '24px',
            maxWidth: '480px',
            width: '100%',
            animation: 'scaleIn 0.2s ease-out',
          }}>
            <h3 style={{
              fontSize: typography.fontSize.lg,
              fontWeight: typography.fontWeight.bold,
              color: colors.text.heading,
              marginBottom: '12px',
            }}>
              {confirmModal.title}
            </h3>
            <p style={{
              fontSize: typography.fontSize.sm,
              color: colors.text.body,
              lineHeight: typography.lineHeight.relaxed,
              marginBottom: '20px',
            }}>
              {confirmModal.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button variant="ghost" size="sm" onClick={() => setConfirmModal(null)}>
                {language === 'si' ? 'Prekliči' : 'Cancel'}
              </Button>
              <Button variant="primary" size="sm" onClick={confirmModal.onConfirm}>
                {language === 'si' ? 'Potrdi' : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Toast notification ─────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 120,
          padding: '12px 20px',
          borderRadius: radii.xl,
          background: toast.type === 'success' ? colors.success[600] : colors.error[600],
          color: colors.text.inverse,
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.medium,
          boxShadow: shadows.lg,
          animation: 'slideInRight 0.3s ease-out',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
