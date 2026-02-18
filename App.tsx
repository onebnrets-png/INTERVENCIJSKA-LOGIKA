// App.tsx
// ═══════════════════════════════════════════════════════════════
// Main application shell — orchestration only.
// v2.3 — 2026-02-18
//   - REMOVED: WelcomeScreen — auto-starts on step 1
//   - NEW: StepNavigationBar in second toolbar row (horizontal circles with arrows)
//   - NEW: Auto-open ProjectListModal on login
//   - Previous (v2.2): Toolbar center acronym + title
// ═══════════════════════════════════════════════════════════════

import React, { useState, useMemo, useEffect } from 'react';
import ProjectDisplay from './components/ProjectDisplay.tsx';
import PrintLayout from './components/PrintLayout.tsx';
import GanttChart from './components/GanttChart.tsx';
import PERTChart from './components/PERTChart.tsx';
import Organigram from './components/Organigram.tsx';
import ConfirmationModal from './components/ConfirmationModal.tsx';
import AuthScreen from './components/AuthScreen.tsx';
import AdminPanel from './components/AdminPanel.tsx';
import ProjectListModal from './components/ProjectListModal.tsx';
import ProjectDashboard from './components/ProjectDashboard.tsx';
import DashboardPanel from './components/DashboardPanel.tsx';
import Sidebar from './components/Sidebar.tsx';
import SummaryModal from './components/SummaryModal.tsx';
import StepNavigationBar from './components/StepNavigationBar.tsx';
import { useAdmin } from './hooks/useAdmin.ts';
import { ensureGlobalInstructionsLoaded } from './services/globalInstructionsService.ts';
import { ICONS, getSteps, BRAND_ASSETS } from './constants.tsx';
import { TEXT } from './locales.ts';
import { isStepCompleted } from './utils.ts';
import { colors as lightColors, darkColors, shadows, radii, spacing, animation, typography } from './design/theme.ts';
import { initTheme, getThemeMode, onThemeChange } from './services/themeService.ts';

import { useAuth } from './hooks/useAuth.ts';
import { useProjectManager } from './hooks/useProjectManager.ts';
import { useTranslation } from './hooks/useTranslation.ts';
import { useGeneration } from './hooks/useGeneration.ts';

type ColorScheme = typeof lightColors | typeof darkColors;

const HamburgerIcon = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} className="p-2 rounded-md text-slate-500 hover:bg-slate-200 lg:hidden" style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 24, height: 24 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  </button>
);

const ToolbarButton = ({
  onClick, title, icon, disabled = false, variant = 'default', colors: c,
}: {
  onClick: () => void; title: string; icon: React.ReactNode; disabled?: boolean;
  variant?: 'default' | 'primary' | 'success' | 'warning'; colors: ColorScheme;
}) => {
  const variantColors: Record<string, { hover: string; active: string }> = {
    default: { hover: c.primary[50], active: c.primary[600] },
    primary: { hover: c.primary[50], active: c.primary[600] },
    success: { hover: c.success[50], active: c.success[600] },
    warning: { hover: c.warning[50], active: c.warning[600] },
  };
  const vc = variantColors[variant] || variantColors.default;
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{
        padding: spacing.sm, borderRadius: radii.lg, border: 'none', background: 'transparent',
        color: disabled ? c.text.muted : c.text.body, cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: `all ${animation.duration.fast} ${animation.easing.default}`, opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = vc.hover; e.currentTarget.style.color = vc.active; } }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = disabled ? c.text.muted : c.text.body; }}
    >
      {icon}
    </button>
  );
};

const ToolbarSeparator = ({ colors: c }: { colors: ColorScheme }) => (
  <div style={{ width: 1, height: 24, background: c.border.light, margin: `0 ${spacing.xs}`, flexShrink: 0 }} />
);

const ApiWarningBanner = ({ onDismiss, onOpenSettings, language }: { onDismiss: () => void; onOpenSettings: () => void; language: 'en' | 'si'; }) => {
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
        <button onClick={onOpenSettings} className="underline hover:text-amber-900 font-bold">{t.enterKeyAction}</button>
        <button onClick={onDismiss} className="text-amber-600 hover:text-amber-900">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

const App = () => {
  const [language, setLanguage] = useState<'en' | 'si'>('en');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [adminPanelInitialTab, setAdminPanelInitialTab] = useState<string | undefined>(undefined);
  const [isProjectListOpen, setIsProjectListOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const adminHook = useAdmin();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dashboardCollapsed, setDashboardCollapsed] = useState(false);
  const [isDark, setIsDark] = useState(getThemeMode() === 'dark');
  const colors = isDark ? darkColors : lightColors;

  useEffect(() => {
    const unsub = onThemeChange((mode) => setIsDark(mode === 'dark'));
    return unsub;
  }, []);

  const [modalConfig, setModalConfig] = useState({
    isOpen: false, title: '', message: '',
    onConfirm: () => {}, onSecondary: null as (() => void) | null,
    onCancel: () => {}, confirmText: '', secondaryText: '', cancelText: '',
  });
  const closeModal = () => { setModalConfig((prev) => ({ ...prev, isOpen: false })); };

  const auth = useAuth();
  const pm = useProjectManager({ language, setLanguage, currentUser: auth.currentUser });
  const openSettingsFromHook = (val: boolean) => { if (val) { setAdminPanelInitialTab('ai'); } setIsSettingsOpen(val); };

  const generation = useGeneration({
    projectData: pm.projectData, setProjectData: pm.setProjectData, language,
    ensureApiKey: auth.ensureApiKey, setIsSettingsOpen: openSettingsFromHook,
    setHasUnsavedTranslationChanges: pm.setHasUnsavedTranslationChanges,
    handleUpdateData: pm.handleUpdateData, checkSectionHasContent: pm.checkSectionHasContent,
    setModalConfig, closeModal, currentProjectId: pm.currentProjectId,
    projectVersions: pm.projectVersions, setLanguage, setProjectVersions: pm.setProjectVersions,
  });

  const translation = useTranslation({
    language, setLanguage, projectData: pm.projectData, setProjectData: pm.setProjectData,
    projectVersions: pm.projectVersions, setProjectVersions: pm.setProjectVersions,
    currentProjectId: pm.currentProjectId, currentUser: auth.currentUser,
    hasUnsavedTranslationChanges: pm.hasUnsavedTranslationChanges,
    setHasUnsavedTranslationChanges: pm.setHasUnsavedTranslationChanges,
    hasContent: pm.hasContent, ensureApiKey: auth.ensureApiKey,
    setIsLoading: generation.setIsLoading, setError: generation.setError,
    setIsSettingsOpen: openSettingsFromHook, setModalConfig, closeModal,
  });

  useEffect(() => { if (auth.currentUser) { ensureGlobalInstructionsLoaded(); adminHook.checkAdminStatus(); } }, [auth.currentUser]);
  useEffect(() => { initTheme(); const unsub = onThemeChange((m) => setIsDark(m === 'dark')); return unsub; }, []);
  useEffect(() => { if (pm.showProjectListOnLogin) { setIsProjectListOpen(true); pm.setShowProjectListOnLogin(false); } }, [pm.showProjectListOnLogin]);

  // ★ v2.3: Auto-start on step 1 — no more WelcomeScreen
  useEffect(() => {
    if (auth.currentUser && pm.currentStepId === null) {
      pm.setCurrentStepId(1);
      setIsProjectListOpen(true);
    }
  }, [auth.currentUser]);

  const t = TEXT[language] || TEXT['en'];
  const STEPS = getSteps(language);
  const completedStepsStatus = useMemo(() => STEPS.map((step) => isStepCompleted(pm.projectData, step.key)), [pm.projectData, language, STEPS]);
  const currentProjectMeta = pm.userProjects.find((p: any) => p.id === pm.currentProjectId);
  const displayTitle = currentProjectMeta?.title || pm.projectData.projectIdea?.projectTitle || t.projects.untitled;

  const handleSettingsClose = async () => { setIsSettingsOpen(false); setIsAdminPanelOpen(false); setAdminPanelInitialTab(undefined); await auth.checkApiKey(); auth.loadCustomLogo(); };
  const handleLogout = async () => { await auth.handleLogout(); pm.resetOnLogout(); };
  const handleSwitchProjectAndClose = async (projectId: string) => { await pm.handleSwitchProject(projectId); setIsProjectListOpen(false); };
  const handleCreateProjectAndClose = async () => { try { await pm.handleCreateProject(); setIsProjectListOpen(false); } catch (e: any) { generation.setError(e.message); } };
  const handlePrint = () => window.print();
  const handleExportDocx = async () => { try { await pm.handleExportDocx(generation.setIsLoading); } catch (e: any) { alert(e.message); } };
  const handleImportProject = async (event: React.ChangeEvent<HTMLInputElement>) => { generation.setIsLoading(true); try { await pm.handleImportProject(event); } catch (e: any) { generation.setError(`Failed to import: ${e.message}`); } finally { generation.setIsLoading(false); } };

  // ═══════════════════════════════════════════════════════════════
  // RENDER: Not logged in
  // ═══════════════════════════════════════════════════════════════
  if (!auth.currentUser) {
    return (
      <>
        {auth.shouldShowBanner && (
          <ApiWarningBanner onDismiss={auth.dismissWarning} onOpenSettings={() => { setAdminPanelInitialTab('ai'); setIsSettingsOpen(true); }} language={language} />
        )}
        <AdminPanel isOpen={isSettingsOpen} onClose={handleSettingsClose} language={language} initialTab="ai" />
        <AuthScreen
          onLoginSuccess={auth.handleLoginSuccess} language={language}
          setLanguage={(lang: string) => setLanguage(lang as 'en' | 'si')}
          onOpenSettings={() => { setAdminPanelInitialTab('ai'); setIsSettingsOpen(true); }}
          needsMFAVerify={auth.needsMFAVerify} mfaFactorId={auth.mfaFactorId}
          onMFAVerified={auth.handleMFAVerified} onMFACancel={handleLogout}
        />
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER: Logged in — always shows main app layout (no WelcomeScreen)
  // ═══════════════════════════════════════════════════════════════
  return (
    <>
      <ConfirmationModal isOpen={modalConfig.isOpen} {...modalConfig} />
      <AdminPanel isOpen={isAdminPanelOpen || isSettingsOpen} onClose={handleSettingsClose} language={language} initialTab={adminPanelInitialTab} />
      <ProjectDashboard isOpen={isDashboardOpen} onClose={() => setIsDashboardOpen(false)} projectData={pm.projectData} language={language} />
      <ProjectListModal
        isOpen={isProjectListOpen} onClose={() => setIsProjectListOpen(false)}
        projects={pm.userProjects} currentProjectId={pm.currentProjectId}
        onSelectProject={handleSwitchProjectAndClose} onCreateProject={handleCreateProjectAndClose}
        onDeleteProject={pm.handleDeleteProject} language={language}
      />
      <SummaryModal
        isOpen={generation.summaryModalOpen} onClose={() => generation.setSummaryModalOpen(false)}
        summaryText={generation.summaryText} isGenerating={generation.isGeneratingSummary}
        onRegenerate={generation.runSummaryGeneration} onDownloadDocx={generation.handleDownloadSummaryDocx}
        language={language}
      />

      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: colors.surface.background, fontFamily: typography.fontFamily.sans, overflow: 'hidden' }} className="print:hidden">
        {auth.shouldShowBanner && (
          <ApiWarningBanner onDismiss={auth.dismissWarning} onOpenSettings={() => { setAdminPanelInitialTab('ai'); setIsSettingsOpen(true); }} language={language} />
        )}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
          {generation.isLoading && (
            <div style={{ position: 'fixed', inset: 0, background: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', cursor: 'wait' }}>
              <div style={{ background: colors.surface.card, padding: spacing['3xl'], borderRadius: radii.xl, boxShadow: shadows.xl, textAlign: 'center', border: `1px solid ${colors.border.light}` }}>
                <div style={{ width: 32, height: 32, border: `4px solid ${colors.primary[500]}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                <p style={{ fontWeight: typography.fontWeight.semibold, color: colors.text.heading, margin: 0 }}>
                  {typeof generation.isLoading === 'string' ? generation.isLoading : t.loading}
                </p>
              </div>
            </div>
          )}

          <Sidebar
            language={language} projectData={pm.projectData} currentStepId={pm.currentStepId}
            setCurrentStepId={pm.setCurrentStepId} completedStepsStatus={completedStepsStatus}
            displayTitle={displayTitle} currentUser={auth.currentUser} appLogo={auth.appLogo}
            isAdmin={adminHook.isAdmin} isSidebarOpen={isSidebarOpen}
            onCloseSidebar={() => setIsSidebarOpen(false)}
            onBackToWelcome={() => pm.setCurrentStepId(1)}
            onOpenProjectList={() => setIsProjectListOpen(true)}
            onOpenAdminPanel={(tab?: string) => { setAdminPanelInitialTab(tab); setIsAdminPanelOpen(true); }}
            onLogout={handleLogout} onLanguageSwitch={translation.handleLanguageSwitchRequest}
            onSubStepClick={pm.handleSubStepClick} isLoading={!!generation.isLoading}
            onCollapseChange={setSidebarCollapsed}
          />

          <main style={{
            flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
            marginLeft: sidebarCollapsed ? 64 : 280, marginRight: 0,
            transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}>
            {/* ═══ TOOLBAR ROW 1: Acronym + Title + Action Buttons ═══ */}
            <div style={{
              background: colors.surface.card, borderBottom: `1px solid ${colors.border.light}`,
              padding: `${spacing.sm} ${spacing.lg}`, display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: spacing.sm, flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flexShrink: 0 }}>
                <div className="lg:hidden">
                  <HamburgerIcon onClick={() => setIsSidebarOpen(true)} />
                </div>
              </div>

              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', minWidth: 0, overflow: 'hidden', padding: `0 ${spacing.md}` }}>
                {pm.projectData?.projectIdea?.projectAcronym?.trim() ? (
                  <>
                    <span style={{
                      fontSize: '13px', fontWeight: 800, color: colors.primary[600],
                      background: isDark ? colors.primary[900] + '40' : colors.primary[50],
                      border: `1.5px solid ${isDark ? colors.primary[700] : colors.primary[200]}`,
                      padding: '3px 10px', borderRadius: radii.md, letterSpacing: '0.06em',
                      whiteSpace: 'nowrap', flexShrink: 0, textTransform: 'uppercase',
                    }}>
                      {pm.projectData.projectIdea.projectAcronym.trim()}
                    </span>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: colors.border.medium, flexShrink: 0 }} />
                    <span style={{
                      fontSize: '13px', fontWeight: 600, color: colors.text.heading,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
                    }} title={pm.projectData.projectIdea.projectTitle || ''}>
                      {pm.projectData.projectIdea.projectTitle?.trim() || ''}
                    </span>
                  </>
                ) : pm.projectData?.projectIdea?.projectTitle?.trim() ? (
                  <span style={{
                    fontSize: '13px', fontWeight: 600, color: colors.text.heading,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
                  }} title={pm.projectData.projectIdea.projectTitle}>
                    {pm.projectData.projectIdea.projectTitle.trim()}
                  </span>
                ) : (
                  <span style={{
                    fontSize: '13px', fontWeight: 500, color: colors.text.muted,
                    fontStyle: 'italic', letterSpacing: '0.03em', opacity: 0.6, whiteSpace: 'nowrap',
                  }}>
                    {language === 'si' ? 'NAZIV PROJEKTA' : 'PROJECT TITLE'}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                <ToolbarButton colors={colors} onClick={() => setIsDashboardOpen(true)} title={language === 'si' ? 'Pregled projekta' : 'Project Dashboard'} variant="primary"
                  icon={<svg style={{ width: 20, height: 20 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>}
                />
                <ToolbarSeparator colors={colors} />
                <ToolbarButton colors={colors} onClick={pm.handleSaveToStorage} title={t.saveProject} variant="success" icon={<ICONS.SAVE style={{ width: 20, height: 20 }} />} />
                <label style={{ padding: spacing.sm, borderRadius: radii.lg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: `all ${animation.duration.fast}`, color: colors.text.body }} title={t.importProject}>
                  <ICONS.IMPORT style={{ width: 20, height: 20 }} />
                  <input ref={pm.importInputRef} type="file" accept=".json" onChange={handleImportProject} style={{ display: 'none' }} />
                </label>
                <ToolbarSeparator colors={colors} />
                <ToolbarButton colors={colors} onClick={handleExportDocx} title={t.exportDocx} icon={<ICONS.DOCX style={{ width: 20, height: 20 }} />} />
                <ToolbarButton colors={colors} onClick={generation.handleExportSummary} title={t.exportSummary} disabled={auth.showAiWarning} variant={auth.showAiWarning ? 'warning' : 'default'} icon={<ICONS.SUMMARY style={{ width: 20, height: 20 }} />} />
                <ToolbarButton colors={colors} onClick={handlePrint} title={t.print} icon={<ICONS.PRINT style={{ width: 20, height: 20 }} />} />
              </div>
            </div>

            {/* ═══ TOOLBAR ROW 2: Step Title + Navigation Circles ═══ */}
            <div style={{
              background: colors.surface.card, borderBottom: `1px solid ${colors.border.light}`,
              padding: `6px ${spacing.lg}`, display: 'flex', alignItems: 'center',
              gap: spacing.md, flexShrink: 0, minHeight: 52,
            }}>
              <div style={{ flexShrink: 0, maxWidth: '200px' }}>
                <h2 style={{
                  fontSize: '14px', fontWeight: 700, color: colors.text.heading,
                  margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {STEPS.find(s => s.id === (pm.currentStepId || 1))?.title || ''}
                </h2>
              </div>

              <div style={{ flex: 1, display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
                <StepNavigationBar
                  language={language}
                  currentStepId={pm.currentStepId || 1}
                  completedStepsStatus={completedStepsStatus}
                  onStepClick={(id) => pm.setCurrentStepId(id)}
                  isProblemAnalysisComplete={completedStepsStatus[0]}
                />
              </div>

              <div style={{ width: '200px', flexShrink: 0 }} />
            </div>

            {/* ═══ SCROLLABLE CONTENT ═══ */}
            <ProjectDisplay
              projectData={pm.projectData} activeStepId={pm.currentStepId || 1} language={language}
              onUpdateData={pm.handleUpdateData} onGenerateSection={generation.handleGenerateSection}
              onGenerateCompositeSection={generation.handleGenerateCompositeSection}
              onGenerateField={generation.handleGenerateField} onAddItem={pm.handleAddItem}
              onRemoveItem={pm.handleRemoveItem} isLoading={generation.isLoading}
              error={generation.error} missingApiKey={auth.showAiWarning}
            />
          </main>

          <DashboardPanel projectData={pm.projectData} language={language} onCollapseChange={setDashboardCollapsed} />
        </div>
      </div>

      <div className="hidden print:block">
        <PrintLayout projectData={pm.projectData} language={language} logo={auth.appLogo} />
      </div>

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
