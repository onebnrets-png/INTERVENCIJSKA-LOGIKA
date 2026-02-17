// App.tsx
// ═══════════════════════════════════════════════════════════════
// Main application shell — orchestration only.
// v1.4 — 2026-02-17
//   - NEW: Sidebar extracted to components/Sidebar.tsx (Design System)
//   - NEW: Toolbar redesign with grouped actions + design system tokens
//   - Previous: Admin Panel, ProjectDashboard, global instructions cache
// All business logic lives in hooks:
//   - useAuth           → authentication, session, API key check, MFA
//   - useProjectManager → CRUD, save/load, import/export, navigation
//   - useTranslation    → language switching, diff-based translation
//   - useGeneration     → AI content generation, summaries
// ═══════════════════════════════════════════════════════════════

import React, { useState, useMemo, useEffect } from 'react';
import WelcomeScreen from './components/WelcomeScreen.tsx';
import ProjectDisplay from './components/ProjectDisplay.tsx';
import PrintLayout from './components/PrintLayout.tsx';
import GanttChart from './components/GanttChart.tsx';
import PERTChart from './components/PERTChart.tsx';
import Organigram from './components/Organigram.tsx';
import ConfirmationModal from './components/ConfirmationModal.tsx';
import AuthScreen from './components/AuthScreen.tsx';
import SettingsModal from './components/SettingsModal.tsx';
import ProjectListModal from './components/ProjectListModal.tsx';
import AdminPanel from './components/AdminPanel.tsx';
import ProjectDashboard from './components/ProjectDashboard.tsx';
import Sidebar from './components/Sidebar.tsx';
import { useAdmin } from './hooks/useAdmin.ts';
import { ensureGlobalInstructionsLoaded } from './services/globalInstructionsService.ts';
import { ICONS, getSteps, BRAND_ASSETS } from './constants.tsx';
import { TEXT } from './locales.ts';
import { isStepCompleted } from './utils.ts';
import { colors, shadows, radii, spacing, animation, typography } from './design/theme.ts';

import { useAuth } from './hooks/useAuth.ts';
import { useProjectManager } from './hooks/useProjectManager.ts';
import { useTranslation } from './hooks/useTranslation.ts';
import { useGeneration } from './hooks/useGeneration.ts';

// ─── Small UI Components ─────────────────────────────────────────

const HamburgerIcon = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} className="p-2 rounded-md text-slate-500 hover:bg-slate-200 lg:hidden" style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 24, height: 24 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  </button>
);

// ─── Toolbar Button ──────────────────────────────────────────────

const ToolbarButton = ({
  onClick,
  title,
  icon,
  disabled = false,
  variant = 'default',
}: {
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'success' | 'warning';
}) => {
  const variantColors: Record<string, { hover: string; active: string }> = {
    default: { hover: colors.primary[50], active: colors.primary[600] },
    primary: { hover: colors.primary[50], active: colors.primary[600] },
    success: { hover: colors.success[50], active: colors.success[600] },
    warning: { hover: colors.warning[50], active: colors.warning[600] },
  };
  const vc = variantColors[variant] || variantColors.default;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: spacing.sm,
        borderRadius: radii.lg,
        border: 'none',
        background: 'transparent',
        color: disabled ? colors.text.muted : colors.text.body,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: `all ${animation.duration.fast} ${animation.easing.default}`,
        opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = vc.hover;
          e.currentTarget.style.color = vc.active;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = disabled ? colors.text.muted : colors.text.body;
      }}
    >
      {icon}
    </button>
  );
};

// ─── Toolbar Separator ───────────────────────────────────────────

const ToolbarSeparator = () => (
  <div style={{
    width: 1,
    height: 24,
    background: colors.border.light,
    margin: `0 ${spacing.xs}`,
    flexShrink: 0,
  }} />
);

const ApiWarningBanner = ({
  onDismiss,
  onOpenSettings,
  language,
}: {
  onDismiss: () => void;
  onOpenSettings: () => void;
  language: 'en' | 'si';
}) => {
  const t = TEXT[language || 'en'].auth;
  return (
    <div className="bg-amber-100 border-b border-amber-200 text-amber-800 px-4 py-2 text-sm flex justify-between items-center z-[100] relative print:hidden">
      <div className="flex items-center gap-2">
        <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="font-medium">{t.manualModeBanner}</span>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={onOpenSettings} className="underline hover:text-amber-900 font-bold">
          {t.enterKeyAction}
        </button>
        <button onClick={onDismiss} className="text-amber-600 hover:text-amber-900">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

// ─── Main App Component ──────────────────────────────────────────

const App = () => {
  // ─── UI State (local to App) ───────────────────────────────────
  const [language, setLanguage] = useState<'en' | 'si'>('en');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProjectListOpen, setIsProjectListOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const adminHook = useAdmin();

  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    onSecondary: null as (() => void) | null,
    onCancel: () => {},
    confirmText: '',
    secondaryText: '',
    cancelText: '',
  });

  const closeModal = () => {
    setModalConfig((prev) => ({ ...prev, isOpen: false }));
  };

  // ─── Hooks ─────────────────────────────────────────────────────

  const auth = useAuth(); // ★ MFA: now also exposes needsMFAVerify, mfaFactorId, handleMFAVerified

  const pm = useProjectManager({
    language,
    setLanguage,
    currentUser: auth.currentUser,
  });

  const generation = useGeneration({
    projectData: pm.projectData,
    setProjectData: pm.setProjectData,
    language,
    ensureApiKey: auth.ensureApiKey,
    setIsSettingsOpen,
    setHasUnsavedTranslationChanges: pm.setHasUnsavedTranslationChanges,
    handleUpdateData: pm.handleUpdateData,
    checkSectionHasContent: pm.checkSectionHasContent,
    setModalConfig,
    closeModal,
    currentProjectId: pm.currentProjectId,
    projectVersions: pm.projectVersions,
    setLanguage,
    setProjectVersions: pm.setProjectVersions,
  });

  const translation = useTranslation({
    language,
    setLanguage,
    projectData: pm.projectData,
    setProjectData: pm.setProjectData,
    projectVersions: pm.projectVersions,
    setProjectVersions: pm.setProjectVersions,
    currentProjectId: pm.currentProjectId,
    currentUser: auth.currentUser,
    hasUnsavedTranslationChanges: pm.hasUnsavedTranslationChanges,
    setHasUnsavedTranslationChanges: pm.setHasUnsavedTranslationChanges,
    hasContent: pm.hasContent,
    ensureApiKey: auth.ensureApiKey,
    setIsLoading: generation.setIsLoading,
    setError: generation.setError,
    setIsSettingsOpen,
    setModalConfig,
    closeModal,
  });

  // ═══════════════════════════════════════════════════════════════
  // CRITICAL: All useEffect hooks MUST be BEFORE any conditional
  // return statement. React requires hooks to be called in the
  // same order on every render.
  // ═══════════════════════════════════════════════════════════════

  // ─── Prime global instructions cache after auth ───────────────
  useEffect(() => {
    if (auth.currentUser) {
      ensureGlobalInstructionsLoaded();
    }
  }, [auth.currentUser]);

  // ─── Show project list on login ────────────────────────────────
  useEffect(() => {
    if (pm.showProjectListOnLogin) {
      setIsProjectListOpen(true);
      pm.setShowProjectListOnLogin(false);
    }
  }, [pm.showProjectListOnLogin]);

  // ─── Derived values ────────────────────────────────────────────

  const t = TEXT[language] || TEXT['en'];
  const STEPS = getSteps(language);

  const completedStepsStatus = useMemo(() => {
    return STEPS.map((step) => isStepCompleted(pm.projectData, step.key));
  }, [pm.projectData, language, STEPS]);

  const currentProjectMeta = pm.userProjects.find(
    (p: any) => p.id === pm.currentProjectId
  );
  const displayTitle =
    currentProjectMeta?.title ||
    pm.projectData.projectIdea?.projectTitle ||
    t.projects.untitled;

  // ─── Coordinated handlers ──────────────────────────────────────

  const handleSettingsClose = async () => {
    setIsSettingsOpen(false);
    await auth.checkApiKey();
    auth.loadCustomLogo();
  };

  const handleLogout = async () => {
    await auth.handleLogout();
    pm.resetOnLogout();
  };

  const handleSwitchProjectAndClose = async (projectId: string) => {
    await pm.handleSwitchProject(projectId);
    setIsProjectListOpen(false);
  };

  const handleCreateProjectAndClose = async () => {
    try {
      await pm.handleCreateProject();
      setIsProjectListOpen(false);
    } catch (e: any) {
      generation.setError(e.message);
    }
  };

  const handlePrint = () => window.print();

  const handleExportDocx = async () => {
    try {
      await pm.handleExportDocx(generation.setIsLoading);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleImportProject = async (event: React.ChangeEvent<HTMLInputElement>) => {
    generation.setIsLoading(true);
    try {
      await pm.handleImportProject(event);
    } catch (e: any) {
      generation.setError(`Failed to import: ${e.message}`);
    } finally {
      generation.setIsLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER: Not logged in (or MFA verification pending)       ★ MFA
  // ═══════════════════════════════════════════════════════════════
  if (!auth.currentUser) {
    return (
      <>
        {auth.shouldShowBanner && (
          <ApiWarningBanner
            onDismiss={auth.dismissWarning}
            onOpenSettings={() => setIsSettingsOpen(true)}
            language={language}
          />
        )}
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={handleSettingsClose}
          language={language}
        />
        <AuthScreen
          onLoginSuccess={auth.handleLoginSuccess}
          language={language}
          setLanguage={(lang: string) => setLanguage(lang as 'en' | 'si')}
          onOpenSettings={() => setIsSettingsOpen(true)}
          needsMFAVerify={auth.needsMFAVerify}       // ★ MFA
          mfaFactorId={auth.mfaFactorId}             // ★ MFA
          onMFAVerified={auth.handleMFAVerified}     // ★ MFA
          onMFACancel={handleLogout}                  // ★ MFA
        />
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER: Logged in
  // ═══════════════════════════════════════════════════════════════
  return (
    <>
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleSettingsClose}
        language={language}
      />
      <ConfirmationModal isOpen={modalConfig.isOpen} {...modalConfig} />
      <AdminPanel
        isOpen={isAdminPanelOpen}
        onClose={() => setIsAdminPanelOpen(false)}
        language={language}
      />
      <ProjectDashboard
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
        projectData={pm.projectData}
        language={language}
      />
      <ProjectListModal
        isOpen={isProjectListOpen}
        onClose={() => setIsProjectListOpen(false)}
        projects={pm.userProjects}
        currentProjectId={pm.currentProjectId}
        onSelectProject={handleSwitchProjectAndClose}
        onCreateProject={handleCreateProjectAndClose}
        onDeleteProject={pm.handleDeleteProject}
        language={language}
      />

      {/* Summary Modal */}
      {generation.summaryModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm print:hidden">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">{t.modals.summaryTitle}</h3>
              <button onClick={() => generation.setSummaryModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {generation.isGeneratingSummary ? (
                <div className="flex flex-col items-center justify-center h-48">
                  <div className="inline-block w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="text-slate-500">{t.generating}</p>
                </div>
              ) : (
                <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap">{generation.summaryText}</div>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between gap-3">
              <button onClick={() => generation.setSummaryModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md">
                {t.modals.closeBtn}
              </button>
              <div className="flex gap-2">
                <button onClick={generation.runSummaryGeneration} className="px-4 py-2 text-sm font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-md">
                  {t.modals.regenerateBtn}
                </button>
                <button onClick={generation.handleDownloadSummaryDocx} className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md shadow-sm">
                  {t.modals.downloadDocxBtn}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pm.currentStepId === null ? (
        /* ═══ WELCOME SCREEN ═══ */
        <div className="flex flex-col h-[100dvh] bg-slate-200 overflow-hidden font-sans print:hidden">
          {auth.shouldShowBanner && (
            <ApiWarningBanner
              onDismiss={auth.dismissWarning}
              onOpenSettings={() => setIsSettingsOpen(true)}
              language={language}
            />
          )}

          <div className="absolute top-4 left-4 z-20 flex gap-2" style={{ top: auth.shouldShowBanner ? '4rem' : '1rem' }}>
            <button onClick={() => setIsProjectListOpen(true)} className="px-3 py-1 bg-white/80 backdrop-blur rounded shadow text-sm font-semibold text-slate-700 hover:bg-white flex items-center gap-1 cursor-pointer border border-slate-300">
              <svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span className="max-w-[150px] truncate">{displayTitle}</span>
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="px-3 py-1 bg-white/80 backdrop-blur rounded shadow text-sm font-semibold text-slate-700 hover:bg-white flex items-center gap-1 cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {t.auth.settings}
            </button>
            <button onClick={handleLogout} className="px-3 py-1 bg-white/80 backdrop-blur rounded shadow text-sm font-semibold text-slate-700 hover:bg-white flex items-center gap-1 cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {t.auth.logout}
            </button>
          </div>

          <div className="flex-1 overflow-auto relative">
            <WelcomeScreen
              onStartEditing={pm.handleStartEditing}
              completedSteps={completedStepsStatus}
              projectIdea={pm.projectData.projectIdea}
              language={language}
              setLanguage={translation.handleLanguageSwitchRequest}
              logo={auth.appLogo}
            />
          </div>
        </div>
      ) : (
        /* ═══ MAIN APP LAYOUT ═══ */
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100dvh',
          background: colors.surface.background,
          fontFamily: typography.fontFamily.sans,
          overflow: 'hidden',
        }} className="print:hidden">
          {auth.shouldShowBanner && (
            <ApiWarningBanner
              onDismiss={auth.dismissWarning}
              onOpenSettings={() => setIsSettingsOpen(true)}
              language={language}
            />
          )}

          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
            {/* Loading overlay */}
            {generation.isLoading && (
              <div style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(255,255,255,0.5)',
                zIndex: 60,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(4px)',
                cursor: 'wait',
              }}>
                <div style={{
                  background: colors.surface.card,
                  padding: spacing['3xl'],
                  borderRadius: radii.xl,
                  boxShadow: shadows.xl,
                  textAlign: 'center',
                  border: `1px solid ${colors.border.light}`,
                }}>
                  <div style={{
                    width: 32,
                    height: 32,
                    border: `4px solid ${colors.primary[500]}`,
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto 16px',
                  }} />
                  <p style={{
                    fontWeight: typography.fontWeight.semibold,
                    color: colors.text.heading,
                    margin: 0,
                  }}>
                    {typeof generation.isLoading === 'string' ? generation.isLoading : t.loading}
                  </p>
                </div>
              </div>
            )}

            {/* ═══ SIDEBAR ═══ */}
            <Sidebar
              language={language}
              projectData={pm.projectData}
              currentStepId={pm.currentStepId}
              setCurrentStepId={pm.setCurrentStepId}
              completedStepsStatus={completedStepsStatus}
              displayTitle={displayTitle}
              currentUser={auth.currentUser}
              appLogo={auth.appLogo}
              isAdmin={adminHook.isAdmin}
              isSidebarOpen={isSidebarOpen}
              onCloseSidebar={() => setIsSidebarOpen(false)}
              onBackToWelcome={pm.handleBackToWelcome}
              onOpenProjectList={() => setIsProjectListOpen(true)}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenAdminPanel={() => setIsAdminPanelOpen(true)}
              onLogout={handleLogout}
              onLanguageSwitch={translation.handleLanguageSwitchRequest}
              onSubStepClick={pm.handleSubStepClick}
              isLoading={!!generation.isLoading}
            />

            {/* ═══ MAIN CONTENT ═══ */}
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* ═══ TOOLBAR ═══ */}
              <div style={{
                background: colors.surface.card,
                borderBottom: `1px solid ${colors.border.light}`,
                padding: `${spacing.sm} ${spacing.lg}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: spacing.sm,
                flexShrink: 0,
              }}>
                {/* Left: hamburger (mobile) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                  <div className="lg:hidden">
                    <HamburgerIcon onClick={() => setIsSidebarOpen(true)} />
                  </div>
                </div>

                {/* Right: Action buttons, grouped */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  {/* Group 1: Dashboard */}
                  <ToolbarButton
                    onClick={() => setIsDashboardOpen(true)}
                    title={language === 'si' ? 'Pregled projekta' : 'Project Dashboard'}
                    variant="primary"
                    icon={
                      <svg style={{ width: 20, height: 20 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                      </svg>
                    }
                  />

                  <ToolbarSeparator />

                  {/* Group 2: Save + Import */}
                  <ToolbarButton
                    onClick={pm.handleSaveToStorage}
                    title={t.saveProject}
                    variant="success"
                    icon={<ICONS.SAVE style={{ width: 20, height: 20 }} />}
                  />
                  <label style={{
                    padding: spacing.sm,
                    borderRadius: radii.lg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: `all ${animation.duration.fast}`,
                    color: colors.text.body,
                  }} title={t.importProject}>
                    <ICONS.IMPORT style={{ width: 20, height: 20 }} />
                    <input ref={pm.importInputRef} type="file" accept=".json" onChange={handleImportProject} style={{ display: 'none' }} />
                  </label>

                  <ToolbarSeparator />

                  {/* Group 3: Export (DOCX + Summary + Print) */}
                  <ToolbarButton
                    onClick={handleExportDocx}
                    title={t.exportDocx}
                    icon={<ICONS.DOCX style={{ width: 20, height: 20 }} />}
                  />
                  <ToolbarButton
                    onClick={generation.handleExportSummary}
                    title={t.exportSummary}
                    disabled={auth.showAiWarning}
                    variant={auth.showAiWarning ? 'warning' : 'default'}
                    icon={<ICONS.SUMMARY style={{ width: 20, height: 20 }} />}
                  />
                  <ToolbarButton
                    onClick={handlePrint}
                    title={t.print}
                    icon={<ICONS.PRINT style={{ width: 20, height: 20 }} />}
                  />
                </div>
              </div>

              {/* SCROLLABLE CONTENT — ProjectDisplay */}
              <ProjectDisplay
                projectData={pm.projectData}
                activeStepId={pm.currentStepId}
                language={language}
                onUpdateData={pm.handleUpdateData}
                onGenerateSection={generation.handleGenerateSection}
                onGenerateCompositeSection={generation.handleGenerateCompositeSection}
                onGenerateField={generation.handleGenerateField}
                onAddItem={pm.handleAddItem}
                onRemoveItem={pm.handleRemoveItem}
                isLoading={generation.isLoading}
                error={generation.error}
                missingApiKey={auth.showAiWarning}
              />
            </main>
          </div>
        </div>
      )}

      {/* PRINT LAYOUT – hidden on screen, visible only when printing */}
      <div className="hidden print:block">
        <PrintLayout projectData={pm.projectData} language={language} logo={auth.appLogo} />
      </div>

      {/* EXPORT-ONLY CHART CONTAINERS (hidden, used by html2canvas) */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', pointerEvents: 'none' }}>
        <div id="gantt-chart-export" style={{ width: '2400px', background: 'white', padding: '20px', overflow: 'visible' }}>
          <GanttChart activities={pm.projectData.activities} language={language} forceViewMode="project" containerWidth={2400} printMode={true} id="gantt-export" />
        </div>
        <div id="pert-chart-export" style={{ width: '1200px', background: 'white', padding: '20px' }}>
          <PERTChart activities={pm.projectData.activities} language={language} forceViewMode={true} containerWidth={1200} printMode={true} />
        </div>
        <div id="organigram-export" style={{ width: '1000px', background: 'white', padding: '20px' }}>
          <Organigram projectManagement={pm.projectData.projectManagement} activities={pm.projectData.activities} language={language} forceViewMode={true} containerWidth={1000} printMode={true} />
        </div>
      </div>
    </>
  );
};

export default App;
