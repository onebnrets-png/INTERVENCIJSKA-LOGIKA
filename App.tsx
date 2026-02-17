// // App.tsx
// ═══════════════════════════════════════════════════════════════
// Main application shell — orchestration only.
// v1.1 — 2026-02-15 — Added copyright footer in sidebar.
// Main application shell — orchestration only.
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
import { useAdmin } from './hooks/useAdmin.ts';
import { ensureGlobalInstructionsLoaded } from './services/globalInstructionsService.ts';
import { ICONS, getSteps, getSubSteps, BRAND_ASSETS } from './constants.tsx';
import { TEXT } from './locales.ts';
import { isStepCompleted, isSubStepCompleted } from './utils.ts';

import { useAuth } from './hooks/useAuth.ts';
import { useProjectManager } from './hooks/useProjectManager.ts';
import { useTranslation } from './hooks/useTranslation.ts';
import { useGeneration } from './hooks/useGeneration.ts';

// ─── Small UI Components ─────────────────────────────────────────

const HamburgerIcon = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} className="p-2 rounded-md text-slate-500 hover:bg-slate-200 lg:hidden">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  </button>
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
  const SUB_STEPS = getSubSteps(language);

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
        <div className="flex flex-col h-[100dvh] bg-slate-100 font-sans overflow-hidden print:hidden">
          {auth.shouldShowBanner && (
            <ApiWarningBanner
              onDismiss={auth.dismissWarning}
              onOpenSettings={() => setIsSettingsOpen(true)}
              language={language}
            />
          )}

          <div className="flex flex-1 overflow-hidden relative">
            {/* Loading overlay */}
            {generation.isLoading && (
              <div className="fixed inset-0 bg-white/50 z-[60] flex items-center justify-center backdrop-blur-sm cursor-wait">
                <div className="bg-white p-6 rounded-lg shadow-xl text-center border border-slate-200">
                  <div className="inline-block w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="font-semibold text-slate-800">
                    {typeof generation.isLoading === 'string' ? generation.isLoading : t.loading}
                  </p>
                </div>
              </div>
            )}

            {/* Mobile sidebar overlay */}
            {isSidebarOpen && (
              <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/30 z-20 lg:hidden" aria-hidden="true" />
            )}

            {/* ═══ SIDEBAR ═══ */}
            <aside className={`fixed inset-y-0 left-0 z-50 bg-white border-r border-slate-200 p-5 flex flex-col flex-shrink-0 transform transition-transform duration-300 ease-in-out w-72 lg:w-64 xl:w-72 lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
              <div className="flex flex-col mb-4 flex-shrink-0">
                <div className="flex justify-between items-center mb-6">
                  <button onClick={pm.handleBackToWelcome} className="flex items-center gap-2 text-xl font-bold text-slate-800 text-left hover:opacity-80 transition-opacity mr-5 max-w-[150px]">
                    <img src={auth.appLogo} alt="Logo" className="h-10 w-auto object-contain object-left" />
                  </button>
                  <div className="flex bg-slate-100 rounded-md p-1 flex-shrink-0">
                    <button
                      onClick={() => translation.handleLanguageSwitchRequest('si')}
                      disabled={!!generation.isLoading}
                      className={`px-2 py-0.5 text-xs font-semibold rounded ${language === 'si' ? 'bg-white shadow text-sky-700' : 'text-slate-500'} disabled:opacity-50`}
                    >SI</button>
                    <button
                      onClick={() => translation.handleLanguageSwitchRequest('en')}
                      disabled={!!generation.isLoading}
                      className={`px-2 py-0.5 text-xs font-semibold rounded ${language === 'en' ? 'bg-white shadow text-sky-700' : 'text-slate-500'} disabled:opacity-50`}
                    >EN</button>
                  </div>
                </div>

                <div className="mb-4 bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">{t.projects.currentProject}</p>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-800 truncate pr-2" title={displayTitle}>{displayTitle}</h3>
                    <button onClick={() => setIsProjectListOpen(true)} className="text-sky-600 hover:text-sky-800 p-1 hover:bg-sky-50 rounded" title={t.projects.switchProject}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="text-xs text-slate-500 flex justify-between items-center">
                  <span>{t.auth.welcome} <strong>{auth.currentUser}</strong></span>
                  <button onClick={() => setIsSettingsOpen(true)} className="text-sky-600 hover:underline">{t.auth.settings}</button>
                </div>
              </div>

              {/* Step Navigation */}
              <nav className="flex-1 flex flex-col space-y-1 overflow-y-auto custom-scrollbar min-h-0">
                {STEPS.map((step, idx) => {
                  const isStepCompletedStatus = completedStepsStatus[idx];
                  const isClickable = step.id === 1 || completedStepsStatus[0];

                  return (
                    <div key={step.id}>
                      <button
                        onClick={() => isClickable && pm.setCurrentStepId(step.id)}
                        disabled={!isClickable}
                        className={`w-full text-left px-4 py-3 rounded-md transition-colors flex items-center justify-between ${pm.currentStepId === step.id ? 'bg-sky-100 text-sky-700 font-semibold' : 'text-slate-600 hover:bg-slate-100'} ${!isClickable ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span>{step.title}</span>
                        {isStepCompletedStatus
                          ? <ICONS.CHECK className="h-5 w-5 text-green-500 flex-shrink-0" />
                          : (pm.currentStepId === step.id && <div className="h-2 w-2 rounded-full bg-sky-400"></div>)
                        }
                      </button>

                      {pm.currentStepId === step.id && SUB_STEPS[step.key] && SUB_STEPS[step.key].length > 0 && (
                        <div className="pl-4 mt-1 space-y-1 border-l-2 border-sky-200 ml-4 mb-2">
                          {SUB_STEPS[step.key].map((subStep: any) => (
                            <button
                              key={subStep.id}
                              onClick={() => pm.handleSubStepClick(subStep.id)}
                              className="w-full text-left px-3 py-1.5 rounded text-xs text-slate-500 hover:text-sky-700 hover:bg-sky-50 flex items-center gap-2"
                            >
                              {isSubStepCompleted(pm.projectData, step.key, subStep.id)
                                ? <ICONS.CHECK className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                                : <div className="h-1.5 w-1.5 rounded-full bg-slate-300 flex-shrink-0"></div>
                              }
                              <span>{subStep.title}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>

              {/* Sidebar Footer */}
              <div className="mt-4 pt-4 border-t border-slate-200 flex-shrink-0">
                {adminHook.isAdmin && (
                  <button
                    onClick={() => setIsAdminPanelOpen(true)}
                    className="w-full text-left px-4 py-2 rounded-md text-sm text-indigo-600 hover:bg-indigo-50 font-medium flex items-center gap-2 mb-1"
                  >
                    <span>🛡️</span>
                    {language === 'si' ? 'Admin Panel' : 'Admin Panel'}
                  </button>
                )}
                <button onClick={handleLogout} className="w-full text-left px-4 py-2 rounded-md text-sm text-slate-500 hover:bg-red-50 hover:text-red-600">
                  {t.auth.logout}
                </button>
                <p className="text-[10px] text-slate-300 text-center mt-2">{t.copyright}</p>
              </div>
            </aside>

            {/* ═══ MAIN CONTENT ═══ */}
            <main className="flex-1 flex flex-col overflow-hidden">
              {/* TOOLBAR */}
              <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between gap-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <HamburgerIcon onClick={() => setIsSidebarOpen(true)} />
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={pm.handleSaveToStorage} className="p-2 rounded-md text-slate-500 hover:bg-slate-100 hover:text-sky-600" title={t.saveProject}>
                    <ICONS.SAVE className="h-5 w-5" />
                  </button>
                  <label className="p-2 rounded-md text-slate-500 hover:bg-slate-100 hover:text-sky-600 cursor-pointer" title={t.importProject}>
                    <ICONS.IMPORT className="h-5 w-5" />
                    <input ref={pm.importInputRef} type="file" accept=".json" onChange={handleImportProject} className="hidden" />
                  </label>
                  <button onClick={handleExportDocx} className="p-2 rounded-md text-slate-500 hover:bg-slate-100 hover:text-sky-600" title={t.exportDocx}>
                    <ICONS.DOCX className="h-5 w-5" />
                  </button>
                  <button
                    onClick={generation.handleExportSummary}
                    className={`p-2 rounded-md hover:bg-slate-100 ${auth.showAiWarning ? 'text-amber-400 cursor-not-allowed' : 'text-slate-500 hover:text-sky-600'}`}
                    title={t.exportSummary}
                    disabled={auth.showAiWarning}
                  >
                    <ICONS.SUMMARY className="h-5 w-5" />
                  </button>
                  <button onClick={handlePrint} className="p-2 rounded-md text-slate-500 hover:bg-slate-100 hover:text-sky-600" title={t.print}>
                    <ICONS.PRINT className="h-5 w-5" />
                  </button>
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
