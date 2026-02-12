
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
import { generateSectionContent, generateFieldContent, translateProjectContent, detectProjectLanguage, generateProjectSummary, hasValidApiKey, validateApiKey } from './services/geminiService.ts';
import { generateDocx, generateSummaryDocx } from './services/docxGenerator.ts';
import { set, isSubStepCompleted, createEmptyProjectData, isStepCompleted, downloadBlob, recalculateProjectSchedule, safeMerge } from './utils.ts';
import { ICONS, getSteps, getSubSteps, BRAND_ASSETS } from './constants.tsx';
import { TEXT } from './locales.ts';
import { storageService } from './services/storageService.ts';
import html2canvas from 'html2canvas';

const HamburgerIcon = ({ onClick }) => (
  <button onClick={onClick} className="p-2 rounded-md text-slate-500 hover:bg-slate-200 lg:hidden">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  </button>
);

const ApiWarningBanner = ({ onDismiss, onOpenSettings, language }) => {
    const t = TEXT[language || 'en'].auth;
    return (
        <div className="bg-amber-100 border-b border-amber-200 text-amber-800 px-4 py-2 text-sm flex justify-between items-center z-[100] relative print:hidden">
            <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <span className="font-medium">{t.manualModeBanner}</span>
            </div>
            <div className="flex items-center gap-3">
                <button onClick={onOpenSettings} className="underline hover:text-amber-900 font-bold">{t.enterKeyAction}</button>
                <button onClick={onDismiss} className="text-amber-600 hover:text-amber-900"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"></path></svg></button>
            </div>
        </div>
    );
};

const App = () => {
  const [currentUser, setCurrentUser] = useState(storageService.getCurrentUser());
  const [projectData, setProjectData] = useState(createEmptyProjectData());
  const [projectVersions, setProjectVersions] = useState<{ en: any; si: any }>({
      en: null, 
      si: null
  });
  
  // Project Management State
  const [currentProjectId, setCurrentProjectId] = useState(storageService.getCurrentProjectId());
  const [userProjects, setUserProjects] = useState([]);
  const [isProjectListOpen, setIsProjectListOpen] = useState(false);

  const [hasUnsavedTranslationChanges, setHasUnsavedTranslationChanges] = useState(false);

  const [currentStepId, setCurrentStepId] = useState(null);
  const [language, setLanguage] = useState<'en' | 'si'>('en');
  const [isLoading, setIsLoading] = useState<boolean | string>(false);
  const [error, setError] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showAiWarning, setShowAiWarning] = useState(false);
  const [isWarningDismissed, setIsWarningDismissed] = useState(false);
  const importInputRef = useRef(null);

  // Custom Logo State
  const [appLogo, setAppLogo] = useState(BRAND_ASSETS.logoText);

  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  const [modalConfig, setModalConfig] = useState({
      isOpen: false,
      title: '',
      message: '',
      onConfirm: () => {},
      onSecondary: null as (() => void) | null,
      onCancel: () => {},
      confirmText: '',
      secondaryText: '',
      cancelText: ''
  });

  const closeModal = () => {
    setModalConfig(prev => ({ ...prev, isOpen: false }));
  };

  // Ensure TEXT[language] exists before accessing
  const t = TEXT[language] || TEXT['en'];
  const STEPS = getSteps(language);
  const SUB_STEPS = getSubSteps(language);

  const completedStepsStatus = useMemo(() => {
    return STEPS.map(step => isStepCompleted(projectData, step.key));
  }, [projectData, language, STEPS]);

  // --- Auth & Data Loading Effects ---

  // Load Projects on Login
  useEffect(() => {
      if (currentUser) {
          refreshProjectList();
          loadActiveProject(); // This will load specific ID or create default if none
          loadCustomLogo(); // Load logo
      }
  }, [currentUser]);

  const loadCustomLogo = () => {
      const custom = storageService.getCustomLogo();
      if (custom) {
          setAppLogo(custom);
      } else {
          setAppLogo(BRAND_ASSETS.logoText);
      }
  };

  const refreshProjectList = () => {
      const list = storageService.getUserProjects();
      setUserProjects(list);
  };

  const loadActiveProject = (specificId = null) => {
      // 1. Load Data
      const loadedData = storageService.loadProject(language, specificId);
      
      // 2. Update State
      if (loadedData) {
          setProjectData(loadedData);
          // Try loading opposite language too
          const otherLang = language === 'en' ? 'si' : 'en';
          const otherData = storageService.loadProject(otherLang, specificId);
          setProjectVersions({
              en: language === 'en' ? loadedData : otherData,
              si: language === 'si' ? loadedData : otherData
          });
      } else {
          setProjectData(createEmptyProjectData());
      }

      // 3. Update Current ID Ref
      const activeId = storageService.getCurrentProjectId();
      setCurrentProjectId(activeId);
  };

  // Sync versions state when active project changes content
  useEffect(() => {
      setProjectVersions(prev => ({
          en: language === 'en' ? projectData : prev.en,
          si: language === 'si' ? projectData : prev.si
      }));
  }, [projectData, language]);

  // Check API Key Status when user logs in or settings close
  const checkApiKey = useCallback(async () => {
      const storedKey = storageService.getApiKey();
      if (!storedKey) {
          setShowAiWarning(true);
          return;
      }
      const isValid = await validateApiKey(storedKey);
      if (!isValid) {
          storageService.clearApiKey();
          setShowAiWarning(true);
      } else {
          setShowAiWarning(false);
      }
  }, []);

  useEffect(() => {
      if (currentUser) {
          checkApiKey();
      }
  }, [currentUser, checkApiKey]);

  // --- Handlers ---

  const handleLoginSuccess = (username) => {
      setCurrentUser(username);
  };

  const handleLogout = () => {
      storageService.logout();
      setCurrentUser(null);
      setCurrentProjectId(null);
      setProjectData(createEmptyProjectData());
      setIsWarningDismissed(false); 
      setAppLogo(BRAND_ASSETS.logoText); // Reset logo on logout
  };

  // --- Project Management Handlers ---

  const handleSwitchProject = (projectId) => {
      if (projectId === currentProjectId) {
          setIsProjectListOpen(false);
          return;
      }

      // 1. Save current state before switching
      storageService.saveProject(projectData, language, currentProjectId);
      
      // 2. Update active ID
      storageService.setCurrentProjectId(projectId);
      
      // 3. Load new project
      loadActiveProject(projectId);
      setIsProjectListOpen(false);
      
      // 4. Reset view
      setCurrentStepId(null); 
      setHasUnsavedTranslationChanges(false);
  };

  const handleCreateProject = () => {
      // 1. Save current
      if (currentProjectId) {
          storageService.saveProject(projectData, language, currentProjectId);
      }

      // 2. Create New
      const newProj = storageService.createProject();
      
      // 3. Switch to it
      refreshProjectList();
      setCurrentProjectId(newProj.id);
      loadActiveProject(newProj.id);
      
      setIsProjectListOpen(false);
      setCurrentStepId(1); // Go to step 1 of new project
  };

  const handleDeleteProject = (projectId) => {
      storageService.deleteProject(projectId);
      refreshProjectList();
      
      // If we deleted the active one, load whatever remains (or create new)
      if (projectId === currentProjectId) {
          loadActiveProject(); 
          setCurrentStepId(null);
      }
  };

  // --- File Logic ---

  const generateFilename = (extension: string): string => {
    const acronym = projectData.projectIdea.projectAcronym?.trim();
    const title = projectData.projectIdea.projectTitle?.trim();
    
    let baseName = 'eu-project';
    if (acronym && title) {
        baseName = `${acronym} - ${title}`;
    } else if (title) {
        baseName = title;
    } else if (acronym) {
        baseName = acronym;
    }

    const sanitized = baseName.replace(/[<>:"/\\|?*]/g, '_');
    return `${sanitized}.${extension}`;
  };

  const handleSaveToStorage = () => {
      try {
          if (currentUser) {
              // 1. Save to Local Browser Storage (Background)
              storageService.saveProject(projectData, language, currentProjectId);
              const otherLang = language === 'en' ? 'si' : 'en';
              if (projectVersions[otherLang]) {
                  storageService.saveProject(projectVersions[otherLang], otherLang, currentProjectId);
              }
              refreshProjectList(); // Update metadata in list if title changed

              // 2. DOWNLOAD JSON TO DISK (Foreground)
              const exportData = {
                  meta: {
                      version: '2.1', // Bumped for multi-project support
                      createdAt: new Date().toISOString(),
                      activeLanguage: language,
                      author: currentUser,
                      projectId: currentProjectId
                  },
                  data: {
                      en: language === 'en' ? projectData : (projectVersions.en || null),
                      si: language === 'si' ? projectData : (projectVersions.si || null)
                  }
              };

              const jsonString = JSON.stringify(exportData, null, 2);
              const blob = new Blob([jsonString], { type: 'application/json' });
              downloadBlob(blob, generateFilename('json'));
          } else {
              alert("Not logged in!");
          }
      } catch (e) {
          console.error("Save error:", e);
          alert("Error saving project: " + e.message);
      }
  };

  // --- Utility to Enforce API Key ---
  const ensureApiKey = () => {
      if (showAiWarning || !hasValidApiKey()) {
          setIsSettingsOpen(true);
          return false;
      }
      return true;
  };

  const hasContent = (data) => {
    if (!data) return false;
    return (data.problemAnalysis?.coreProblem?.title || '') !== '' || (data.projectIdea?.projectTitle || '') !== '';
  };

  const performTranslation = async (targetLang, sourceData) => {
      if (!ensureApiKey()) return;

      const tTarget = TEXT[targetLang] || TEXT['en'];
      setIsLoading(`${tTarget.generating} (Translation)...`);
      try {
          const translatedData = await translateProjectContent(sourceData, targetLang);
          setProjectData(translatedData);
          setLanguage(targetLang);
          setHasUnsavedTranslationChanges(false);
          // Auto-save translation
          storageService.saveProject(translatedData, targetLang, currentProjectId);
      } catch (e) {
         if (e.message === 'MISSING_API_KEY') {
             setIsSettingsOpen(true);
         } else {
             console.error("Translation failed", e);
             let userMessage = targetLang === 'si' 
                  ? "Napaka pri prevajanju. Preverite kvoto ali ključ."
                  : "Translation failed. Check quota or key.";
             setError(userMessage);
         }
      } finally {
          setIsLoading(false);
      }
  };

  const performCopy = (targetLang, sourceData) => {
      setProjectData(sourceData);
      setLanguage(targetLang);
      setHasUnsavedTranslationChanges(true);
  };

  const performSwitchOnly = (targetLang, cachedData) => {
      setProjectData(cachedData);
      setLanguage(targetLang);
      setHasUnsavedTranslationChanges(false);
  };

  const handleLanguageSwitchRequest = (newLang) => {
    if (newLang === language) return;
    
    // Auto-save current
    if (currentUser) {
       storageService.saveProject(projectData, language, currentProjectId);
    }

    if (!hasContent(projectData)) {
      setLanguage(newLang);
      // Try load from DB for new lang based on ID
      const loaded = storageService.loadProject(newLang, currentProjectId);
      setProjectData(loaded || createEmptyProjectData());
      setHasUnsavedTranslationChanges(false);
      return;
    }

    // Check if we have a version in memory or storage
    let cachedVersion = projectVersions[newLang];
    if (!cachedVersion) {
        cachedVersion = storageService.loadProject(newLang, currentProjectId);
    }
    const tCurrent = TEXT[language] || TEXT['en'];

    if (!hasContent(cachedVersion)) {
        setModalConfig({
            isOpen: true,
            title: tCurrent.modals.missingTranslationTitle,
            message: tCurrent.modals.missingTranslationMsg,
            confirmText: tCurrent.modals.translateBtn,
            secondaryText: tCurrent.modals.copyBtn,
            cancelText: tCurrent.modals.cancel,
            onConfirm: () => {
                closeModal();
                performTranslation(newLang, projectData);
            },
            onSecondary: () => {
                closeModal();
                performCopy(newLang, projectData);
            },
            onCancel: closeModal
        });
        return;
    }

    if (hasUnsavedTranslationChanges) {
        setModalConfig({
            isOpen: true,
            title: tCurrent.modals.updateTranslationTitle,
            message: tCurrent.modals.updateTranslationMsg,
            confirmText: tCurrent.modals.updateBtn,
            secondaryText: tCurrent.modals.switchBtn,
            cancelText: tCurrent.modals.cancel,
            onConfirm: () => {
                closeModal();
                performTranslation(newLang, projectData);
            },
            onSecondary: () => {
                closeModal();
                performSwitchOnly(newLang, cachedVersion);
            },
            onCancel: closeModal
        });
        return;
    }

    performSwitchOnly(newLang, cachedVersion);
  };

  const handleUpdateData = useCallback((path, value) => {
    setProjectData(prevData => {
        let newData = set(prevData, path, value);
        if (path[0] === 'activities') {
             newData = recalculateProjectSchedule(newData);
        }
        return newData;
    });
    setHasUnsavedTranslationChanges(true);
  }, []);

  // Save on significant updates
  useEffect(() => {
     const timer = setTimeout(() => {
         if (currentUser && hasContent(projectData)) {
             storageService.saveProject(projectData, language, currentProjectId);
         }
     }, 2000);
     return () => clearTimeout(timer);
  }, [projectData, currentUser, language, currentProjectId]);

  const executeGenerationWithID = async (sectionKey, mode = 'regenerate') => {
    closeModal();
    setIsLoading(`${t.generating} ${sectionKey}...`);
    setError(null);
    try {
      const generatedData = await generateSectionContent(sectionKey, projectData, language, mode);
      
      let newData = { ...projectData };
      if (['problemAnalysis', 'projectIdea'].includes(sectionKey)) {
           newData[sectionKey] = { ...newData[sectionKey], ...generatedData };
      } else {
           newData[sectionKey] = generatedData;
      }
      
      if (sectionKey === 'activities') {
          newData = recalculateProjectSchedule(newData);
          setIsLoading(`${t.generating} ${t.subSteps.riskMitigation}...`);
          try {
             const risksContent = await generateSectionContent('risks', newData, language, mode);
             newData.risks = risksContent; 
          } catch (e) { console.error(e); }
      }

      setProjectData(newData);
      setHasUnsavedTranslationChanges(true);
    } catch (e) {
       if (e.message === 'MISSING_API_KEY') setIsSettingsOpen(true);
       else setError(`${t.error}: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportProject = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') throw new Error('File content is not valid text.');
        const importedJson = JSON.parse(text);
        
        // Handle Import logic: Ask to overwrite current or create new?
        // For simplicity: Creates a new project from import
        const newProj = storageService.createProject();
        let finalData = createEmptyProjectData();
        let targetLang = 'en';

        if (importedJson.meta && importedJson.data) {
             const { en, si } = importedJson.data;
             const preferredLang = importedJson.meta.activeLanguage || 'en';
             const safeEn = en ? safeMerge(en) : null;
             const safeSi = si ? safeMerge(si) : null;
             
             // Save both versions to new ID
             if (safeEn) storageService.saveProject(safeEn, 'en', newProj.id);
             if (safeSi) storageService.saveProject(safeSi, 'si', newProj.id);

             if (preferredLang === 'si' && safeSi) { finalData = safeSi; targetLang = 'si'; }
             else { finalData = safeEn || safeSi; targetLang = safeEn ? 'en' : 'si'; }
             
        } else if (importedJson.problemAnalysis) {
          const detectedLang = detectProjectLanguage(importedJson);
          finalData = safeMerge(importedJson);
          targetLang = detectedLang as 'en' | 'si';
          storageService.saveProject(finalData, targetLang, newProj.id);
        }

        // Switch to new project
        refreshProjectList();
        setCurrentProjectId(newProj.id);
        setProjectData(finalData);
        setLanguage(targetLang as 'en' | 'si');
        setCurrentStepId(1);
        
      } catch (err) {
        setError(`Failed to import: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const checkSectionHasContent = (sectionKey) => {
    const data = projectData[sectionKey];
    if (Array.isArray(data)) {
        return data.some(item => (item.title && item.title.trim() !== '') || (item.description && item.description.trim() !== ''));
    }
    // Object checks
    if (sectionKey === 'problemAnalysis') {
        return !!data.coreProblem.title || data.causes.some(c => c.title) || data.consequences.some(c => c.title);
    }
    if (sectionKey === 'projectIdea') {
        return !!data.mainAim || !!data.proposedSolution;
    }
    return false;
  };

  const handleGenerateSection = (sectionKey) => {
    if (!ensureApiKey()) return;

    if (checkSectionHasContent(sectionKey)) {
        setModalConfig({
            isOpen: true,
            title: t.modals.generationChoiceTitle,
            message: t.modals.generationChoiceMsg,
            confirmText: t.modals.regenerateAllBtn,
            secondaryText: t.modals.fillMissingBtn,
            cancelText: t.modals.cancel,
            onConfirm: () => executeGenerationWithID(sectionKey, 'regenerate'),
            onSecondary: () => executeGenerationWithID(sectionKey, 'fill'),
            onCancel: closeModal
        });
    } else {
        executeGenerationWithID(sectionKey, 'regenerate');
    }
  };

  const handleGenerateCompositeSection = (sectionKey) => {
    if (!ensureApiKey()) return;

    const sections = ['outputs', 'outcomes', 'impacts', 'kers'];
    const hasContent = sections.some(s => checkSectionHasContent(s));

    const runComposite = async (mode) => {
        closeModal();
        setIsLoading(true);
        try {
            for (const s of sections) {
                setIsLoading(`${t.generating} ${s}...`);
                const generatedData = await generateSectionContent(s, projectData, language, mode);
                setProjectData(prev => {
                    const next = { ...prev };
                    next[s] = generatedData;
                    return next;
                });
                await new Promise(r => setTimeout(r, 100));
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setIsLoading(false);
            setHasUnsavedTranslationChanges(true);
        }
    };

    if (hasContent) {
        setModalConfig({
            isOpen: true,
            title: t.modals.generationChoiceTitle,
            message: t.modals.generationChoiceMsg,
            confirmText: t.modals.regenerateAllBtn,
            secondaryText: t.modals.fillMissingBtn,
            cancelText: t.modals.cancel,
            onConfirm: () => runComposite('regenerate'),
            onSecondary: () => runComposite('fill'),
            onCancel: closeModal
        });
    } else {
        runComposite('regenerate');
    }
  };

  const handleGenerateField = async (path) => {
    if (!ensureApiKey()) return;
    
    const fieldName = path[path.length - 1];
    setIsLoading(`${t.generating} ${fieldName}...`);
    try {
        const content = await generateFieldContent(path, projectData, language);
        handleUpdateData(path, content);
    } catch (e) {
        if (e.message === 'MISSING_API_KEY') setIsSettingsOpen(true);
        else console.error(e);
    } finally {
        setIsLoading(false);
    }
  };

  const getNestedValue = (obj, path) => {
    return path.reduce((acc, key) => (acc && acc[key] !== undefined) ? acc[key] : undefined, obj);
  }

  const handleAddItem = (path, newItem) => {
    setProjectData(prev => {
        const list = getNestedValue(prev, path) || [];
        return set(prev, path, [...list, newItem]);
    });
    setHasUnsavedTranslationChanges(true);
  };

  const handleRemoveItem = (path, index) => {
    setProjectData(prev => {
         const list = getNestedValue(prev, path);
         if (!Array.isArray(list)) return prev;
         const newList = list.filter((_, i) => i !== index);
         return set(prev, path, newList);
    });
    setHasUnsavedTranslationChanges(true);
  };

  const handleStartEditing = (stepId) => {
    setCurrentStepId(stepId);
  };

  const handleBackToWelcome = () => {
    setCurrentStepId(null);
  };

  const handleSubStepClick = (subStepId) => {
    const el = document.getElementById(subStepId);
    const container = document.getElementById('main-scroll-container');
    
    if (el && container) {
        const elRect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        // Calculate the position of the element relative to the container's current view
        const relativeTop = elRect.top - containerRect.top;
        
        // Scroll the container
        container.scrollBy({
            top: relativeTop - 24, // 24px padding top for breathing room
            behavior: 'smooth'
        });
    } else if (el) {
        // Fallback for sub-steps not in the main scroll container (unlikely)
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const runSummaryGeneration = async () => {
    setIsGeneratingSummary(true);
    setSummaryText("");
    try {
        const text = await generateProjectSummary(projectData, language);
        setSummaryText(text);
    } catch (e) {
        setSummaryText("Error generating summary: " + e.message);
    } finally {
        setIsGeneratingSummary(false);
    }
  };

  const handleDownloadSummaryDocx = async () => {
    try {
        const blob = await generateSummaryDocx(summaryText, projectData.projectIdea?.projectTitle, language);
        downloadBlob(blob, `Summary - ${projectData.projectIdea?.projectTitle || 'Project'}.docx`);
    } catch (e) {
        console.error(e);
        alert("Failed to generate DOCX");
    }
  };

  const handleExportDocx = async () => {
    setIsLoading("Preparing document...");
    // Force a small delay to allow React to render any pending state changes
    // even though the export components are technically always there.
    await new Promise(r => setTimeout(r, 100));

    let ganttData = null;
    const ganttEl = document.getElementById('gantt-chart-export');
    if (ganttEl) {
        try {
             const canvas = await html2canvas(ganttEl as HTMLElement, { 
                 scale: 2, 
                 backgroundColor: '#ffffff'
             });
             ganttData = {
                 dataUrl: canvas.toDataURL('image/png'),
                 width: canvas.width,
                 height: canvas.height
             };
        } catch(e) {
            console.warn("Gantt capture failed", e);
        }
    }

    let pertData = null;
    const pertEl = document.getElementById('pert-chart-export');
    if (pertEl) {
        try {
             const canvas = await html2canvas(pertEl as HTMLElement, { 
                 scale: 2, 
                 backgroundColor: '#ffffff'
             });
             pertData = {
                 dataUrl: canvas.toDataURL('image/png'),
                 width: canvas.width,
                 height: canvas.height
             };
        } catch(e) {
            console.warn("PERT capture failed", e);
        }
    }

    let organigramData = null;
    const orgEl = document.getElementById('organigram-export');
    if (orgEl) {
        try {
                const canvas = await html2canvas(orgEl as HTMLElement, { 
                    scale: 2, 
                    backgroundColor: '#ffffff'
                });
                organigramData = {
                    dataUrl: canvas.toDataURL('image/png'),
                    width: canvas.width,
                    height: canvas.height
                };
        } catch(e) {
            console.warn("Organigram capture failed", e);
        }
    }
    
    try {
        const blob = await generateDocx(projectData, language, ganttData, pertData, organigramData);
        downloadBlob(blob, generateFilename('docx'));
    } catch (e) {
        alert("Failed to generate DOCX file: " + e.message);
    } finally {
        setIsLoading(false);
    }
  };

  const handleExportSummary = () => {
    setSummaryModalOpen(true);
    if (!summaryText) {
        runSummaryGeneration();
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Determine if banner should be displayed
  const shouldShowBanner = showAiWarning && !isWarningDismissed;

  const currentProjectMeta = userProjects.find(p => p.id === currentProjectId);
  const displayTitle = currentProjectMeta?.title || projectData.projectIdea?.projectTitle || t.projects.untitled;

  if (!currentUser) {
      return (
        <>
            {shouldShowBanner && <ApiWarningBanner onDismiss={() => setIsWarningDismissed(true)} onOpenSettings={() => setIsSettingsOpen(true)} language={language} />}
            <SettingsModal isOpen={isSettingsOpen} onClose={() => { setIsSettingsOpen(false); checkApiKey(); }} language={language} />
            <AuthScreen 
                onLoginSuccess={handleLoginSuccess} 
                language={language} 
                setLanguage={(lang) => setLanguage(lang as 'en' | 'si')} 
                onOpenSettings={() => setIsSettingsOpen(true)}
            />
        </>
      );
  }

  return (
    <>
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => { 
            setIsSettingsOpen(false); 
            checkApiKey(); 
            loadCustomLogo(); // Refresh logo if changed in settings
        }} 
        language={language} 
      />
      <ConfirmationModal isOpen={modalConfig.isOpen} {...modalConfig} />
      <ProjectListModal 
          isOpen={isProjectListOpen} 
          onClose={() => setIsProjectListOpen(false)}
          projects={userProjects}
          currentProjectId={currentProjectId}
          onSelectProject={handleSwitchProject}
          onCreateProject={handleCreateProject}
          onDeleteProject={handleDeleteProject}
          language={language}
      />
      
      {/* ... Summary Modal Code ... */}
      {summaryModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm print:hidden">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full border border-slate-200 flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-800">{t.modals.summaryTitle}</h3>
                    <button onClick={() => setSummaryModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="p-6 overflow-y-auto flex-1">
                    {isGeneratingSummary ? (
                        <div className="flex flex-col items-center justify-center h-48">
                            <div className="inline-block w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p className="text-slate-500">{t.generating}</p>
                        </div>
                    ) : (
                        <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap">{summaryText}</div>
                    )}
                </div>
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between gap-3">
                     <button onClick={() => setSummaryModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md">{t.modals.closeBtn}</button>
                    <div className="flex gap-2">
                        <button onClick={runSummaryGeneration} className="px-4 py-2 text-sm font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-md">{t.modals.regenerateBtn}</button>
                        <button onClick={handleDownloadSummaryDocx} className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md shadow-sm">{t.modals.downloadDocxBtn}</button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {currentStepId === null ? (
          /* WELCOME SCREEN */
          <div className="flex flex-col h-[100dvh] bg-slate-200 overflow-hidden font-sans print:hidden">
            {shouldShowBanner && <ApiWarningBanner onDismiss={() => setIsWarningDismissed(true)} onOpenSettings={() => setIsSettingsOpen(true)} language={language} />}
            
            <div className="absolute top-4 left-4 z-20 flex gap-2" style={{ top: shouldShowBanner ? '4rem' : '1rem' }}>
                 {/* Project Switcher in Welcome Screen Header */}
                 <button onClick={() => setIsProjectListOpen(true)} className="px-3 py-1 bg-white/80 backdrop-blur rounded shadow text-sm font-semibold text-slate-700 hover:bg-white flex items-center gap-1 cursor-pointer border border-slate-300">
                     <svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                     <span className="max-w-[150px] truncate">{displayTitle}</span>
                 </button>
                 <button onClick={() => setIsSettingsOpen(true)} className="px-3 py-1 bg-white/80 backdrop-blur rounded shadow text-sm font-semibold text-slate-700 hover:bg-white flex items-center gap-1 cursor-pointer">
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                     {t.auth.settings}
                 </button>
                 <button onClick={handleLogout} className="px-3 py-1 bg-white/80 backdrop-blur rounded shadow text-sm font-semibold text-slate-700 hover:bg-white flex items-center gap-1 cursor-pointer">
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                     {t.auth.logout}
                 </button>
            </div>

            <div className="flex-1 overflow-auto relative">
                <WelcomeScreen
                onStartEditing={handleStartEditing}
                completedSteps={completedStepsStatus}
                projectIdea={projectData.projectIdea}
                language={language}
                setLanguage={handleLanguageSwitchRequest}
                logo={appLogo}
                />
            </div>
        </div>
      ) : (
      /* MAIN APP LAYOUT */
      <div className="flex flex-col h-[100dvh] bg-slate-100 font-sans overflow-hidden print:hidden">
        {shouldShowBanner && <ApiWarningBanner onDismiss={() => setIsWarningDismissed(true)} onOpenSettings={() => setIsSettingsOpen(true)} language={language} />}

        <div className="flex flex-1 overflow-hidden relative">
            {isLoading && (
                <div className="fixed inset-0 bg-white/50 z-[60] flex items-center justify-center backdrop-blur-sm cursor-wait">
                    <div className="bg-white p-6 rounded-lg shadow-xl text-center border border-slate-200">
                        <div className="inline-block w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="font-semibold text-slate-800">{typeof isLoading === 'string' ? isLoading : t.loading}</p>
                    </div>
                </div>
            )}

            {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/30 z-20 lg:hidden" aria-hidden="true" />}
            
            <aside className={`fixed inset-y-0 left-0 z-50 bg-white border-r border-slate-200 p-5 flex flex-col flex-shrink-0 transform transition-transform duration-300 ease-in-out w-72 lg:w-64 xl:w-72 lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex flex-col mb-4 flex-shrink-0">
                    <div className="flex justify-between items-center mb-6">
                        <button onClick={handleBackToWelcome} className="flex items-center gap-2 text-xl font-bold text-slate-800 text-left hover:opacity-80 transition-opacity mr-5 max-w-[150px]">
                            <img src={appLogo} alt="Logo" className="h-10 w-auto object-contain object-left" />
                        </button>
                        <div className="flex bg-slate-100 rounded-md p-1 flex-shrink-0">
                            <button onClick={() => handleLanguageSwitchRequest('si')} disabled={!!isLoading} className={`px-2 py-0.5 text-xs font-semibold rounded ${language === 'si' ? 'bg-white shadow text-sky-700' : 'text-slate-500'} disabled:opacity-50`}>SI</button>
                            <button onClick={() => handleLanguageSwitchRequest('en')} disabled={!!isLoading} className={`px-2 py-0.5 text-xs font-semibold rounded ${language === 'en' ? 'bg-white shadow text-sky-700' : 'text-slate-500'} disabled:opacity-50`}>EN</button>
                        </div>
                    </div>
                    
                    {/* PROJECT SWITCHER WIDGET */}
                    <div className="mb-4 bg-slate-50 rounded-lg p-3 border border-slate-200">
                        <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">{t.projects.currentProject}</p>
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-slate-800 truncate pr-2" title={displayTitle}>{displayTitle}</h3>
                            <button onClick={() => setIsProjectListOpen(true)} className="text-sky-600 hover:text-sky-800 p-1 hover:bg-sky-50 rounded" title={t.projects.switchProject}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                            </button>
                        </div>
                    </div>

                    <div className="text-xs text-slate-500 flex justify-between items-center">
                        <span>{t.auth.welcome} <strong>{currentUser}</strong></span>
                        <button onClick={() => setIsSettingsOpen(true)} className="text-sky-600 hover:underline">{t.auth.settings}</button>
                    </div>
                </div>
            
                <nav className="flex-1 flex flex-col space-y-1 overflow-y-auto custom-scrollbar min-h-0">
                    {STEPS.map((step, idx) => {
                    const isStepCompletedStatus = completedStepsStatus[idx];
                    const isClickable = step.id === 1 || completedStepsStatus[0]; 
                    
                    return (
                        <div key={step.id}>
                        <button 
                            onClick={() => isClickable && setCurrentStepId(step.id)} 
                            disabled={!isClickable} 
                            className={`w-full text-left px-4 py-3 rounded-md transition-colors flex items-center justify-between ${currentStepId === step.id ? 'bg-sky-100 text-sky-700 font-semibold' : 'text-slate-600 hover:bg-slate-100'} ${!isClickable ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <span>{step.title}</span>
                            {isStepCompletedStatus 
                                ? <ICONS.CHECK className="h-5 w-5 text-green-500 flex-shrink-0" />
                                : (currentStepId === step.id && <div className="h-2 w-2 rounded-full bg-sky-400"></div>)
                            }
                        </button>
                        
                        {currentStepId === step.id && SUB_STEPS[step.key] && SUB_STEPS[step.key].length > 0 && (
                            <div className="pl-4 mt-1 space-y-1 border-l-2 border-sky-200 ml-4 mb-2">
                            {SUB_STEPS[step.key].map(subStep => {
                                const isSubDone = isSubStepCompleted(projectData, step.key, subStep.id);
                                return (
                                <button 
                                    key={subStep.id} 
                                    onClick={() => handleSubStepClick(subStep.id)} 
                                    className="w-full text-left px-2 py-1.5 rounded-md text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800 flex items-center justify-between"
                                >
                                    <span>{subStep.title}</span>
                                    {isSubDone 
                                        ? <ICONS.CIRCLE_CHECK className="h-4 w-4 text-green-500 flex-shrink-0" />
                                        : <ICONS.CIRCLE_X className="h-4 w-4 text-red-400 flex-shrink-0 opacity-60" />
                                    }
                                </button>
                                );
                            })}
                            </div>
                        )}
                        </div>
                    );
                    })}
                </nav>
                
                <div className="mt-auto pt-4 border-t border-slate-200 flex-shrink-0 bg-white z-10 pb-4 lg:pb-0">
                    <h3 className="px-4 text-xs font-semibold uppercase text-slate-400 tracking-wider">{t.projectActions}</h3>
                    <div className="mt-2 space-y-1">
                    <button onClick={handleSaveToStorage} className="w-full text-left px-4 py-2 rounded-md text-slate-600 hover:bg-slate-100 flex items-center gap-3 cursor-pointer">
                        <ICONS.SAVE className="h-5 w-5" /> {t.saveProject}
                    </button>
                    <button onClick={() => importInputRef.current?.click()} className="w-full text-left px-4 py-2 rounded-md text-slate-600 hover:bg-slate-100 flex items-center gap-3 cursor-pointer">
                        <ICONS.IMPORT className="h-5 w-5" /> {t.importProject}
                    </button>
                    <input type="file" ref={importInputRef} onChange={handleImportProject} className="hidden" accept=".json" />
                    <button onClick={handleExportDocx} className="w-full text-left px-4 py-2 rounded-md text-slate-600 hover:bg-slate-100 flex items-center gap-3 cursor-pointer">
                        <ICONS.DOCX className="h-5 w-5" /> {t.exportDocx}
                    </button>
                    <button onClick={handleExportSummary} className="w-full text-left px-4 py-2 rounded-md text-slate-600 hover:bg-slate-100 flex items-center gap-3 cursor-pointer">
                        <ICONS.SUMMARY className="h-5 w-5" /> {t.exportSummary}
                    </button>
                    <button onClick={handlePrint} className="w-full text-left px-4 py-2 rounded-md text-slate-600 hover:bg-slate-100 flex items-center gap-3 cursor-pointer">
                        <ICONS.PRINT className="h-5 w-5" /> {t.print}
                    </button>
                    <button onClick={handleLogout} className="w-full text-left px-4 py-2 rounded-md text-red-600 hover:bg-red-50 flex items-center gap-3 border-t border-slate-100 mt-2 cursor-pointer">
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg> 
                        {t.auth.logout}
                    </button>
                    </div>
                </div>
            </aside>

            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-shrink-0 bg-white border-b border-slate-200 p-2 pl-4 lg:hidden">
                    <HamburgerIcon onClick={() => setIsSidebarOpen(true)} />
                </div>

                <ProjectDisplay
                    projectData={projectData}
                    activeStepId={currentStepId}
                    onUpdateData={handleUpdateData}
                    onGenerateSection={sectionKey => sectionKey === 'expectedResults' ? handleGenerateCompositeSection(sectionKey) : handleGenerateSection(sectionKey)}
                    onGenerateField={handleGenerateField}
                    onAddItem={handleAddItem}
                    onRemoveItem={handleRemoveItem}
                    isLoading={isLoading}
                    error={error}
                    language={language}
                    missingApiKey={showAiWarning}
                />
            </div>
        </div>
      </div>
      )}
      
      {/* FIX: pointer-events-none added to ensure PrintLayout never blocks clicks when hidden */}
      <div className="hidden print:block fixed inset-0 bg-white z-[9999] overflow-visible w-full h-full pointer-events-none print:pointer-events-auto">
        <PrintLayout projectData={projectData} language={language} logo={appLogo} />
      </div>
      
      {/* EXPORT CHARTS: Always rendered in background with FIXED dimensions to avoid ResizeObserver race conditions */}
      <div id="export-container" style={{ position: 'fixed', top: 0, left: 0, width: '1200px', zIndex: -1000, opacity: 0.01, background: 'white' }}>
           <GanttChart activities={projectData.activities} language={language} id="gantt-chart-export" forceViewMode="project" containerWidth={1200} />
           <PERTChart activities={projectData.activities} language={language} id="pert-chart-export" printMode={true} containerWidth={1200} />
           <div style={{ width: '1200px' }}>
                <Organigram 
                    structure={projectData.projectManagement?.structure} 
                    activities={projectData.activities} 
                    language={language} 
                    id="organigram-export" 
                />
           </div>
      </div>
    </>
  );
};

export default App;