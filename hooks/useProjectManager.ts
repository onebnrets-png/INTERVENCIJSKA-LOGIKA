// hooks/useProjectManager.ts
// ═══════════════════════════════════════════════════════════════
// Project CRUD, import/export, save, auto-save, navigation.
// On login: shows project list instead of auto-loading last project.
// ═══════════════════════════════════════════════════════════════

import { useState, useCallback, useRef, useEffect } from 'react';
import { storageService } from '../services/storageService.ts';
import { detectProjectLanguage } from '../services/geminiService.ts';
import { generateDocx } from '../services/docxGenerator.ts';
import {
  set,
  createEmptyProjectData,
  downloadBlob,
  recalculateProjectSchedule,
  safeMerge,
} from '../utils.ts';
import html2canvas from 'html2canvas';

interface UseProjectManagerProps {
  language: 'en' | 'si';
  setLanguage: (lang: 'en' | 'si') => void;
  currentUser: string | null;
}

export const useProjectManager = ({
  language,
  setLanguage,
  currentUser,
}: UseProjectManagerProps) => {
  const [projectData, setProjectData] = useState(createEmptyProjectData());
  const [projectVersions, setProjectVersions] = useState<{ en: any; si: any }>({
    en: null,
    si: null,
  });
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [userProjects, setUserProjects] = useState<any[]>([]);
  const [hasUnsavedTranslationChanges, setHasUnsavedTranslationChanges] =
    useState(false);
  const [currentStepId, setCurrentStepId] = useState<number | null>(null);
  
  // NEW: Flag to show project list on login
  const [showProjectListOnLogin, setShowProjectListOnLogin] = useState(false);

  const importInputRef = useRef<HTMLInputElement | null>(null);

  // ─── Helpers ───────────────────────────────────────────────────

  const hasContent = useCallback((data: any): boolean => {
    if (!data) return false;
    return (
      (data.problemAnalysis?.coreProblem?.title || '') !== '' ||
      (data.projectIdea?.projectTitle || '') !== ''
    );
  }, []);

  const generateFilename = useCallback((extension: string): string => {
    const acronym = projectData.projectIdea?.projectAcronym?.trim();
    const title = projectData.projectIdea?.projectTitle?.trim();
    let baseName = 'eu-project';
    if (acronym && title) baseName = `${acronym} - ${title}`;
    else if (title) baseName = title;
    else if (acronym) baseName = acronym;
    const sanitized = baseName.replace(/[<>:"/\\|?*]/g, '_');
    return `${sanitized}.${extension}`;
  }, [projectData.projectIdea?.projectAcronym, projectData.projectIdea?.projectTitle]);

  const getNestedValue = (obj: any, path: (string | number)[]): any => {
    return path.reduce(
      (acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined),
      obj
    );
  };

  const checkSectionHasContent = useCallback((sectionKey: string): boolean => {
    const data = (projectData as any)[sectionKey];
    if (Array.isArray(data)) {
      return data.some(
        (item: any) =>
          (item.title && item.title.trim() !== '') ||
          (item.description && item.description.trim() !== '')
      );
    }
    if (sectionKey === 'problemAnalysis') {
      return (
        !!data.coreProblem.title ||
        data.causes.some((c: any) => c.title) ||
        data.consequences.some((c: any) => c.title)
      );
    }
    if (sectionKey === 'projectIdea') {
      return !!data.mainAim || !!data.proposedSolution;
    }
    return false;
  }, [projectData]);

  // ─── Project list ──────────────────────────────────────────────

  const refreshProjectList = useCallback(async () => {
    const list = await storageService.getUserProjects();
    setUserProjects(list);
    return list;
  }, []);

  // ─── Load active project ──────────────────────────────────────

  const loadActiveProject = useCallback(
    async (specificId: string | null = null) => {
      const loadedData = await storageService.loadProject(language, specificId);

      if (loadedData) {
        setProjectData(safeMerge(loadedData));

        const otherLang = language === 'en' ? 'si' : 'en';
        const otherData = await storageService.loadProject(otherLang, specificId);
        setProjectVersions({
          en: language === 'en' ? safeMerge(loadedData) : safeMerge(otherData),
          si: language === 'si' ? safeMerge(loadedData) : safeMerge(otherData),
        });
      } else {
        setProjectData(createEmptyProjectData());
      }

      const activeId = storageService.getCurrentProjectId();
      setCurrentProjectId(activeId);
    },
    [language]
  );

  // ─── Initialize on login ──────────────────────────────────────
  // CHANGED: Don't auto-load last project. Instead, load project list
  // and signal App.tsx to show the project selection modal.

  useEffect(() => {
    if (currentUser) {
      const init = async () => {
        await storageService.loadSettings();
        const projects = await refreshProjectList();
        
        // Always show project list on login so user can choose
        if (projects.length > 0) {
          setShowProjectListOnLogin(true);
        } else {
          // No projects — create first one and go directly
          const newProj = await storageService.createProject();
          if (newProj) {
            setCurrentProjectId(newProj.id);
            storageService.setCurrentProjectId(newProj.id);
            await loadActiveProject(newProj.id);
            await refreshProjectList();
          }
        }
      };
      init();
    }
  }, [currentUser]); // intentionally omit refreshProjectList, loadActiveProject

  // ─── Sync project versions ────────────────────────────────────

  useEffect(() => {
    setProjectVersions((prev) => ({
      en: language === 'en' ? projectData : prev.en,
      si: language === 'si' ? projectData : prev.si,
    }));
  }, [projectData, language]);

  // ─── Auto-save (debounced 2s) ─────────────────────────────────

  useEffect(() => {
    // Only auto-save if a project is actually loaded
    if (!currentProjectId) return;
    
    const timer = setTimeout(async () => {
      if (currentUser && hasContent(projectData)) {
        await storageService.saveProject(projectData, language, currentProjectId);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [projectData, currentUser, language, currentProjectId, hasContent]);

  // ─── Logout cleanup ───────────────────────────────────────────

  const resetOnLogout = useCallback(() => {
    setCurrentProjectId(null);
    setProjectData(createEmptyProjectData());
    setCurrentStepId(null);
    setHasUnsavedTranslationChanges(false);
    setShowProjectListOnLogin(false);
  }, []);

  // ─── CRUD handlers ────────────────────────────────────────────

  const handleSwitchProject = useCallback(
    async (projectId: string) => {
      if (projectId === currentProjectId) {
        // Even if same project, dismiss the login modal
        setShowProjectListOnLogin(false);
        return;
      }

      // Save current project before switching (if one is loaded)
      if (currentProjectId && hasContent(projectData)) {
        await storageService.saveProject(projectData, language, currentProjectId);
      }
      
      storageService.setCurrentProjectId(projectId);
      await loadActiveProject(projectId);
      setCurrentStepId(null);
      setHasUnsavedTranslationChanges(false);
      setShowProjectListOnLogin(false);
    },
    [currentProjectId, projectData, language, loadActiveProject, hasContent]
  );

  const handleCreateProject = useCallback(async () => {
    if (currentProjectId && hasContent(projectData)) {
      await storageService.saveProject(projectData, language, currentProjectId);
    }

    const newProj = await storageService.createProject();
    if (!newProj || !newProj.id) {
      throw new Error('Failed to create project. Check your session.');
    }

    await refreshProjectList();
    setCurrentProjectId(newProj.id);
    storageService.setCurrentProjectId(newProj.id);
    await loadActiveProject(newProj.id);
    setCurrentStepId(1);
    setShowProjectListOnLogin(false);
    return newProj;
  }, [currentProjectId, projectData, language, hasContent, refreshProjectList, loadActiveProject]);

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      await storageService.deleteProject(projectId);
      await refreshProjectList();

      if (projectId === currentProjectId) {
        setCurrentProjectId(null);
        setProjectData(createEmptyProjectData());
        setCurrentStepId(null);
      }
    },
    [currentProjectId, refreshProjectList]
  );

  // ─── Data update ──────────────────────────────────────────────

  const handleUpdateData = useCallback(
    (path: (string | number)[], value: any) => {
      setProjectData((prevData: any) => {
        let newData = set(prevData, path, value);
        if (path[0] === 'activities') {
          const scheduleResult = recalculateProjectSchedule(newData);
          newData = scheduleResult.projectData;
          if (scheduleResult.warnings.length > 0) {
            console.warn('Schedule warnings:', scheduleResult.warnings);
          }
        }
        return newData;
      });
      setHasUnsavedTranslationChanges(true);
    },
    []
  );

  const handleAddItem = useCallback(
    (path: (string | number)[], newItem: any) => {
      setProjectData((prev: any) => {
        const list = getNestedValue(prev, path) || [];
        return set(prev, path, [...list, newItem]);
      });
      setHasUnsavedTranslationChanges(true);
    },
    []
  );

  const handleRemoveItem = useCallback(
    (path: (string | number)[], index: number) => {
      setProjectData((prev: any) => {
        const list = getNestedValue(prev, path);
        if (!Array.isArray(list)) return prev;
        const newList = list.filter((_: any, i: number) => i !== index);
        return set(prev, path, newList);
      });
      setHasUnsavedTranslationChanges(true);
    },
    []
  );

  // ─── Save + Export JSON ────────────────────────────────────────

  const handleSaveToStorage = useCallback(async () => {
    if (!currentUser) {
      alert('Not logged in!');
      return;
    }

    try {
      await storageService.saveProject(projectData, language, currentProjectId);
      const otherLang = language === 'en' ? 'si' : 'en';
      if (projectVersions[otherLang]) {
        await storageService.saveProject(
          projectVersions[otherLang],
          otherLang,
          currentProjectId
        );
      }
      await refreshProjectList();

      const exportData = {
        meta: {
          version: '3.0',
          createdAt: new Date().toISOString(),
          activeLanguage: language,
          author: currentUser,
          projectId: currentProjectId,
        },
        data: {
          en: language === 'en' ? projectData : projectVersions.en || null,
          si: language === 'si' ? projectData : projectVersions.si || null,
        },
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      downloadBlob(blob, generateFilename('json'));
    } catch (e: any) {
      console.error('Save error:', e);
      alert('Error saving project: ' + e.message);
    }
  }, [currentUser, projectData, language, currentProjectId, projectVersions, refreshProjectList, generateFilename]);

  // ─── Import JSON ───────────────────────────────────────────────

  const handleImportProject = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      return new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const text = e.target?.result;
            if (typeof text !== 'string')
              throw new Error('File content is not valid text.');
            const importedJson = JSON.parse(text);

            const newProj = await storageService.createProject();
            if (!newProj || !newProj.id) {
              throw new Error(
                'Failed to create new project. Please check your login session.'
              );
            }

            let finalData = createEmptyProjectData();
            let targetLang: 'en' | 'si' = 'en';

            if (importedJson.meta && importedJson.data) {
              const { en, si } = importedJson.data;
              const preferredLang = importedJson.meta.activeLanguage || 'en';
              const safeEn = en ? safeMerge(en) : null;
              const safeSi = si ? safeMerge(si) : null;

              if (safeEn) await storageService.saveProject(safeEn, 'en', newProj.id);
              if (safeSi) await storageService.saveProject(safeSi, 'si', newProj.id);

              if (preferredLang === 'si' && safeSi) {
                finalData = safeSi;
                targetLang = 'si';
              } else {
                finalData = safeEn || safeSi || createEmptyProjectData();
                targetLang = safeEn ? 'en' : 'si';
              }
            } else if (importedJson.problemAnalysis) {
              const detectedLang = detectProjectLanguage(importedJson);
              finalData = safeMerge(importedJson);
              targetLang = detectedLang as 'en' | 'si';
              await storageService.saveProject(finalData, targetLang, newProj.id);
            } else {
              throw new Error(
                'Unrecognized JSON format. Expected project data with meta+data or problemAnalysis.'
              );
            }

            await refreshProjectList();
            setCurrentProjectId(newProj.id);
            storageService.setCurrentProjectId(newProj.id);
            setProjectData(finalData);
            setLanguage(targetLang);
            setCurrentStepId(1);
            setShowProjectListOnLogin(false);
            resolve();
          } catch (err: any) {
            reject(err);
          }
        };
        reader.readAsText(file);
        event.target.value = '';
      });
    },
    [refreshProjectList, setLanguage]
  );

  // ─── Export DOCX ───────────────────────────────────────────────

  const handleExportDocx = useCallback(
    async (setIsLoading: (val: boolean | string) => void) => {
      setIsLoading('Rendering Graphs...');
      await new Promise((r) => setTimeout(r, 2000));

      const exportOptions = {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        allowTaint: true,
      };

      let ganttData = null;
      const ganttEl = document.getElementById('gantt-chart-export');
      if (ganttEl) {
        try {
          const ganttExportOptions = {
            ...exportOptions,
            width: ganttEl.scrollWidth,
            height: ganttEl.scrollHeight,
            windowWidth: ganttEl.scrollWidth,
            windowHeight: ganttEl.scrollHeight,
          };
          const canvas = await html2canvas(ganttEl as HTMLElement, ganttExportOptions);
          ganttData = {
            dataUrl: canvas.toDataURL('image/png'),
            width: canvas.width,
            height: canvas.height,
          };
        } catch (e) {
          console.warn('Gantt capture failed', e);
        }
      }

      let pertData = null;
      const pertEl = document.getElementById('pert-chart-export');
      if (pertEl) {
        try {
          const canvas = await html2canvas(pertEl as HTMLElement, exportOptions);
          pertData = {
            dataUrl: canvas.toDataURL('image/png'),
            width: canvas.width,
            height: canvas.height,
          };
        } catch (e) {
          console.warn('PERT capture failed', e);
        }
      }

      let organigramData = null;
      const orgEl = document.getElementById('organigram-export');
      if (orgEl) {
        try {
          const canvas = await html2canvas(orgEl as HTMLElement, exportOptions);
          organigramData = {
            dataUrl: canvas.toDataURL('image/png'),
            width: canvas.width,
            height: canvas.height,
          };
        } catch (e) {
          console.warn('Organigram capture failed', e);
        }
      }

      setIsLoading('Generating DOCX...');
      try {
        const blob = await generateDocx(projectData, language, ganttData, pertData, organigramData);
        downloadBlob(blob, generateFilename('docx'));
      } catch (e: any) {
        throw new Error('Failed to generate DOCX file: ' + e.message);
      } finally {
        setIsLoading(false);
      }
    },
    [projectData, language, generateFilename]
  );

  // ─── Navigation ────────────────────────────────────────────────

  const handleStartEditing = useCallback((stepId: number) => {
    setCurrentStepId(stepId);
  }, []);

  const handleBackToWelcome = useCallback(() => {
    setCurrentStepId(null);
  }, []);

  const handleSubStepClick = useCallback((subStepId: string) => {
    const el = document.getElementById(subStepId);
    const container = document.getElementById('main-scroll-container');
    if (el && container) {
      const elRect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const relativeTop = elRect.top - containerRect.top;
      container.scrollBy({ top: relativeTop - 24, behavior: 'smooth' });
    } else if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return {
    projectData,
    setProjectData,
    projectVersions,
    setProjectVersions,
    currentProjectId,
    setCurrentProjectId,
    userProjects,
    currentStepId,
    setCurrentStepId,
    hasUnsavedTranslationChanges,
    setHasUnsavedTranslationChanges,
    showProjectListOnLogin,
    setShowProjectListOnLogin,
    importInputRef,
    hasContent,
    checkSectionHasContent,
    generateFilename,
    refreshProjectList,
    loadActiveProject,
    resetOnLogout,
    handleSwitchProject,
    handleCreateProject,
    handleDeleteProject,
    handleUpdateData,
    handleAddItem,
    handleRemoveItem,
    handleSaveToStorage,
    handleImportProject,
    handleExportDocx,
    handleStartEditing,
    handleBackToWelcome,
    handleSubStepClick,
  };
};
