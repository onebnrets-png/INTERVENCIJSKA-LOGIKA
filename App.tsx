import React, { useState, useMemo, useEffect } from 'react';

// ─── Components ───────────────────────────────────────────────
import WelcomeScreen from './components/WelcomeScreen';
import ProjectDisplay from './components/ProjectDisplay';
import PrintLayout from './components/PrintLayout';
import GanttChart from './components/GanttChart';
import PERTChart from './components/PERTChart';
import Organigram from './components/Organigram';
import ConfirmationModal from './components/ConfirmationModal';
import SettingsModal from './components/SettingsModal';
import ProjectListModal from './components/ProjectListModal';

// ─── Constants & Utilities ────────────────────────────────────
import { ICONS, TEXT, getSteps, getSubSteps } from './constants';
import { BRAND_ASSETS } from './constants';
import { downloadBlob } from './utils';

// ─── Hooks ────────────────────────────────────────────────────
import { useAuth } from './hooks/useAuth';
import { useProjectManager } from './hooks/useProjectManager';
import { useGeneration } from './hooks/useGeneration';
import { useTranslation } from './hooks/useTranslation';

// ─── Small UI Components ──────────────────────────────────────

const HamburgerIcon = ({ isOpen }: { isOpen: boolean }) => (
  <div className="w-6 h-5 relative flex flex-col justify-between">
    <span className={`block h-0.5 w-full bg-current transform transition-all duration-300 ${isOpen ? 'rotate-45 translate-y-2' : ''}`} />
    <span className={`block h-0.5 w-full bg-current transition-all duration-300 ${isOpen ? 'opacity-0' : ''}`} />
    <span className={`block h-0.5 w-full bg-current transform transition-all duration-300 ${isOpen ? '-rotate-45 -translate-y-2' : ''}`} />
  </div>
);

const ApiWarningBanner = ({
  language,
  onDismiss,
  onOpenSettings
}: {
  language: 'en' | 'si';
  onDismiss: () => void;
  onOpenSettings: () => void;
}) => {
  const t = TEXT[language];
  return (
    <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-4 rounded-r-lg">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <p className="text-sm text-amber-700 font-medium">{t.apiWarningTitle}</p>
          <p className="text-sm text-amber-600 mt-1">{t.apiWarningMessage}</p>
          <div className="mt-3 flex gap-2">
            <button onClick={onOpenSettings} className="text-sm bg-amber-100 hover:bg-amber-200 text-amber-800 px-3 py-1 rounded-md transition-colors">
              {t.openSettings}
            </button>
            <button onClick={onDismiss} className="text-sm text-amber-600 hover:text-amber-800 px-3 py-1 transition-colors">
              {t.dismiss}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main App Component ───────────────────────────────────────

const App: React.FC = () => {
  // ─── UI State ──────────────────────────────────────────────
  const [language, setLanguage] = useState<'en' | 'si'>('si');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProjectListOpen, setIsProjectListOpen] = useState(false);  // ← ONLY ONE declaration
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    onSecondary: undefined as (() => void) | undefined,
    onCancel: () => {},
    confirmText: '',
    secondaryText: undefined as string | undefined,
    cancelText: ''
  });

  // ─── Localization ──────────────────────────────────────────
  const t = TEXT[language];
  const steps = useMemo(() => getSteps(language), [language]);
  const subSteps = useMemo(() => getSubSteps(language), [language]);

  // ─── Auth Hook ─────────────────────────────────────────────
  const auth = useAuth();

  // ─── Project Manager Hook ─────────────────────────────────
  const pm = useProjectManager({
    language,
    setLanguage,
    currentUser: auth.currentUser,
    setModalConfig,
    steps,
    subSteps
  });

  // ─── Show project list on login ───────────────────────────
  useEffect(() => {
    if (pm.showProjectListOnLogin) {
      setIsProjectListOpen(true);
      pm.setShowProjectListOnLogin(false);
    }
  }, [pm.showProjectListOnLogin]);

  // ─── Generation Hook ──────────────────────────────────────
  const gen = useGeneration({
    projectData: pm.projectData,
    setProjectData: pm.handleUpdateData,
    language,
    ensureApiKey: auth.ensureApiKey,
    setModalConfig,
    setError: pm.setError,
    currentStep: pm.currentStep,
    currentSubStep: pm.currentSubStep
  });

  // ─── Translation Hook ─────────────────────────────────────
  const translation = useTranslation({
    language,
    setLanguage,
    projectData: pm.projectData,
    setProjectData: pm.handleUpdateData,
    projectVersions: pm.projectVersions,
    setProjectVersions: pm.setProjectVersions,
    currentUser: auth.currentUser,
    currentProjectId: pm.currentProjectId,
    hasUnsavedTranslationChanges: pm.hasUnsavedTranslationChanges,
    setHasUnsavedTranslationChanges: pm.setHasUnsavedTranslationChanges,
    ensureApiKey: auth.ensureApiKey,
    setModalConfig,
    setIsLoading: gen.setIsLoading,
    setLoadingMessage: gen.setLoadingMessage
  });

  // ─── Derived values ───────────────────────────────────────
  const isLoading = gen.isLoading;
  const loadingMessage = gen.loadingMessage;

  // ─── Handlers ─────────────────────────────────────────────
  const handleLanguageSwitch = (newLang: 'en' | 'si') => {
    translation.handleLanguageSwitchRequest(newLang);
  };

  const handleLogout = () => {
    auth.handleLogout();
    pm.resetProjectState();
  };

  const handleOpenSettings = () => {
    setIsSettingsOpen(true);
  };

  const handleOpenProjectList = () => {
    setIsProjectListOpen(true);
  };

  // ─── Login Screen ─────────────────────────────────────────
  if (!auth.currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 flex items-center justify-center p-4">
        {auth.shouldShowBanner && (
          <div className="fixed top-4 left-4 right-4 z-50">
            <ApiWarningBanner
              language={language}
              onDismiss={auth.dismissWarning}
              onOpenSettings={handleOpenSettings}
            />
          </div>
        )}
        <WelcomeScreen
          onLoginSuccess={auth.handleLoginSuccess}
          language={language}
          onLanguageSwitch={handleLanguageSwitch}
        />
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          language={language}
        />
      </div>
    );
  }

  // ─── Main Application Layout ──────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className={`fixed inset-y-0 left-0 z-30 bg-white shadow-xl transition-all duration-300 flex flex-col ${isSidebarOpen ? 'w-72' : 'w-0 overflow-hidden'}`}>
        {/* Sidebar header */}
        <div className="p-4 border-b border-gray-200 flex items-center gap-3">
          <img src={auth.appLogo || BRAND_ASSETS.logo} alt="Logo" className="h-8 w-auto" />
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-gray-800 truncate">{t.appTitle}</h1>
            <p className="text-xs text-gray-500 truncate">{auth.currentUser}</p>
          </div>
        </div>

        {/* Step navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {steps.map((step, stepIndex) => {
            const isActive = pm.currentStep === stepIndex;
            const isCompleted = pm.isStepCompleted(stepIndex);
            return (
              <div key={step.id}>
                <button
                  onClick={() => pm.handleStepClick(stepIndex)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-all ${isActive ? 'bg-sky-50 text-sky-700 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isCompleted ? 'bg-green-500 text-white' : isActive ? 'bg-sky-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {isCompleted ? '✓' : stepIndex + 1}
                  </span>
                  <span className="truncate">{step.title}</span>
                </button>

                {/* Sub-steps */}
                {isActive && subSteps[step.key] && (
                  <div className="ml-8 mt-1 space-y-0.5">
                    {subSteps[step.key].map((sub: any, subIndex: number) => {
                      const isSubActive = pm.currentSubStep === subIndex;
                      const isSubCompleted = pm.isSubStepCompleted(stepIndex, subIndex);
                      return (
                        <button
                          key={sub.id}
                          onClick={() => pm.handleSubStepClick(subIndex)}
                          className={`w-full text-left px-3 py-1.5 rounded text-xs flex items-center gap-2 transition-all ${isSubActive ? 'bg-sky-100 text-sky-700 font-medium' : 'text-gray-500 hover:bg-gray-50'}`}
                        >
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${isSubCompleted ? 'bg-green-400 text-white' : isSubActive ? 'bg-sky-400 text-white' : 'bg-gray-200 text-gray-400'}`}>
                            {isSubCompleted ? '✓' : ''}
                          </span>
                          <span className="truncate">{sub.title}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Sidebar footer */}
        <div className="p-3 border-t border-gray-200 space-y-2">
          {/* Language toggle */}
          <div className="flex items-center gap-2 px-2">
            <span className="text-xs text-gray-500">{t.language}:</span>
            <button
              onClick={() => handleLanguageSwitch('si')}
              className={`text-xs px-2 py-1 rounded ${language === 'si' ? 'bg-sky-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              SI
            </button>
            <button
              onClick={() => handleLanguageSwitch('en')}
              className={`text-xs px-2 py-1 rounded ${language === 'en' ? 'bg-sky-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              EN
            </button>
          </div>

          {/* Project list button */}
          <button
            onClick={handleOpenProjectList}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 flex items-center gap-2"
          >
            <span dangerouslySetInnerHTML={{ __html: ICONS.SAVE }} />
            <span>{t.myProjects || 'Moji projekti'}</span>
          </button>

          {/* Settings button */}
          <button
            onClick={handleOpenSettings}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 flex items-center gap-2"
          >
            ⚙️ <span>{t.settings || 'Nastavitve'}</span>
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
          >
            <span dangerouslySetInnerHTML={{ __html: ICONS.LOCK }} />
            <span>{t.logout}</span>
          </button>
        </div>
      </aside>

      {/* ── Main Content ────────────────────────────────────── */}
      <main className={`flex-1 transition-all duration-300 ${isSidebarOpen ? 'ml-72' : 'ml-0'}`}>
        {/* Toolbar */}
        <header className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">
            <HamburgerIcon isOpen={isSidebarOpen} />
          </button>

          <div className="flex-1" />

          {/* Save */}
          <button onClick={pm.handleSave} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors" title={t.save}>
            <span dangerouslySetInnerHTML={{ __html: ICONS.SAVE }} />
            <span className="hidden sm:inline">{t.save}</span>
          </button>

          {/* Import */}
          <label className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer" title={t.import}>
            <span dangerouslySetInnerHTML={{ __html: ICONS.IMPORT }} />
            <span className="hidden sm:inline">{t.import}</span>
            <input type="file" accept=".json" onChange={pm.handleImport} className="hidden" />
          </label>

          {/* Export JSON */}
          <button onClick={pm.handleExport} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors" title={t.export}>
            <span dangerouslySetInnerHTML={{ __html: ICONS.IMPORT }} />
            <span className="hidden sm:inline">{t.export}</span>
          </button>

          {/* Export DOCX */}
          <button onClick={pm.handleExportDocx} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors" title={t.exportDocx || 'Export DOCX'}>
            <span dangerouslySetInnerHTML={{ __html: ICONS.DOCX }} />
            <span className="hidden sm:inline">{t.exportDocx || 'DOCX'}</span>
          </button>

          {/* Print */}
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors" title={t.print}>
            <span dangerouslySetInnerHTML={{ __html: ICONS.PRINT }} />
            <span className="hidden sm:inline">{t.print}</span>
          </button>

          {/* Summary */}
          <button onClick={gen.handleExportSummary} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors" title={t.summary || 'Summary'}>
            <span dangerouslySetInnerHTML={{ __html: ICONS.SUMMARY }} />
            <span className="hidden sm:inline">{t.summary || 'Povzetek'}</span>
          </button>
        </header>

        {/* Project Display */}
        <ProjectDisplay
          projectData={pm.projectData}
          onUpdateData={pm.handleUpdateData}
          language={language}
          currentStep={pm.currentStep}
          currentSubStep={pm.currentSubStep}
          onGenerateSection={gen.handleGenerateSection}
          onGenerateCompositeSection={gen.handleGenerateCompositeSection}
          onGenerateField={gen.handleGenerateField}
          isLoading={isLoading}
          error={gen.error}
          steps={steps}
          subSteps={subSteps}
        />
      </main>

      {/* ── Loading Overlay ─────────────────────────────────── */}
      {isLoading && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm mx-4 text-center">
            <div className="animate-spin w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-700 font-medium">{loadingMessage || t.generating}</p>
          </div>
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────── */}
      <ConfirmationModal
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        onConfirm={modalConfig.onConfirm}
        onSecondary={modalConfig.onSecondary}
        onCancel={modalConfig.onCancel || (() => setModalConfig(prev => ({ ...prev, isOpen: false })))}
        confirmText={modalConfig.confirmText}
        secondaryText={modalConfig.secondaryText}
        cancelText={modalConfig.cancelText}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        language={language}
      />

      <ProjectListModal
        isOpen={isProjectListOpen}
        onClose={() => setIsProjectListOpen(false)}
        projects={pm.projects}
        onSelectProject={pm.handleSelectProject}
        onCreateProject={pm.handleCreateProject}
        onDeleteProject={pm.handleDeleteProject}
        currentProjectId={pm.currentProjectId}
        language={language}
      />

      {/* ── Summary Modal ───────────────────────────────────── */}
      {gen.showSummary && gen.summaryContent && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">{t.summary || 'Povzetek projekta'}</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={gen.handleDownloadSummaryDocx}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
                >
                  <span dangerouslySetInnerHTML={{ __html: ICONS.DOCX }} />
                  DOCX
                </button>
                <button onClick={() => gen.setShowSummary(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">✕</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: gen.summaryContent }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Print Layout (hidden, shown only when printing) ── */}
      <div className="hidden print:block">
        <PrintLayout
          projectData={pm.projectData}
          language={language}
          logo={auth.appLogo || BRAND_ASSETS.logo}
        />
      </div>

      {/* ── Hidden chart containers for export ───────────────── */}
      <div id="gantt-export-container" className="fixed -left-[9999px] w-[1200px]">
        <GanttChart projectData={pm.projectData} language={language} />
      </div>
      <div id="pert-export-container" className="fixed -left-[9999px] w-[1200px]">
        <PERTChart projectData={pm.projectData} language={language} />
      </div>
      <div id="organigram-export-container" className="fixed -left-[9999px] w-[1200px]">
        <Organigram projectData={pm.projectData} language={language} />
      </div>
    </div>
  );
};

export default App;
