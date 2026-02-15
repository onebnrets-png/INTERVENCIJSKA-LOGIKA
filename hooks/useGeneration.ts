// hooks/useGeneration.ts
// ═══════════════════════════════════════════════════════════════
// AI content generation — sections, fields, summaries.
//
// v3.5.2 — 2026-02-14 — CHANGES:
//   - FIXED: Auto-generate projectManagement (Kakovost in učinkovitost
//     izvedbe) when generating activities — description field was left
//     empty because projectManagement is a separate key in ProjectData.
//   - FIXED: robustCheckSectionHasContent replaces broken parent check
//   - FIXED: checkOtherLanguageHasContent deep-checks ONLY the specific section
//   - FIXED: Level 2 modal — primary button is now "Generate/Enhance current"
//     (most common action), "Translate from XX" is secondary
//   - Clearer modal messages for better UX
//   - 3-option modal: Enhance Existing / Fill Missing / Regenerate All
//   - 'enhance' mode passed to geminiService for professional deepening
//
// SMART 4-LEVEL LOGIC for "Generate with AI" button:
//   1. OTHER language has content for THIS SECTION, CURRENT is empty
//      → "Translate from SI/EN" (primary) or "Generate new" (secondary)
//   2. BOTH languages have content for THIS SECTION
//      → "Generate/Enhance current" (primary) or "Translate from XX" (secondary)
//   3. CURRENT language has content, OTHER does not
//      → 3-option modal: Enhance / Fill / Regenerate
//   4. Nothing exists → generate without asking
// ═══════════════════════════════════════════════════════════════

import { useState, useCallback } from 'react';
import {
  generateSectionContent,
  generateFieldContent,
  generateProjectSummary,
} from '../services/geminiService.ts';
import { generateSummaryDocx } from '../services/docxGenerator.ts';
import { recalculateProjectSchedule, downloadBlob } from '../utils.ts';
import { TEXT } from '../locales.ts';
import { storageService } from '../services/storageService.ts';
import { smartTranslateProject } from '../services/translationDiffService.ts';

interface UseGenerationProps {
  projectData: any;
  setProjectData: (fn: any) => void;
  language: 'en' | 'si';
  ensureApiKey: () => boolean;
  setIsSettingsOpen: (val: boolean) => void;
  setHasUnsavedTranslationChanges: (val: boolean) => void;
  handleUpdateData: (path: (string | number)[], value: any) => void;
  checkSectionHasContent: (sectionKey: string) => boolean;
  setModalConfig: (config: any) => void;
  closeModal: () => void;
  currentProjectId: string | null;
  projectVersions: { en: any; si: any };
  setLanguage: (lang: 'en' | 'si') => void;
  setProjectVersions: (fn: (prev: { en: any; si: any }) => { en: any; si: any }) => void;
}

export const useGeneration = ({
  projectData,
  setProjectData,
  language,
  ensureApiKey,
  setIsSettingsOpen,
  setHasUnsavedTranslationChanges,
  handleUpdateData,
  checkSectionHasContent, // kept in interface for compatibility, overridden below
  setModalConfig,
  closeModal,
  currentProjectId,
  projectVersions,
  setLanguage,
  setProjectVersions,
}: UseGenerationProps) => {
  const [isLoading, setIsLoading] = useState<boolean | string>(false);
  const [error, setError] = useState<string | null>(null);

  // Summary state
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  const t = TEXT[language] || TEXT['en'];

  // ─── DEEP CONTENT CHECKER (shared utility) ─────────────────────
  // Returns true only if the given data contains actual meaningful
  // text — not just empty strings, empty arrays, or empty objects.

  const hasDeepContent = useCallback((data: any): boolean => {
    if (!data) return false;
    if (typeof data === 'string') return data.trim().length > 0;
    if (Array.isArray(data)) {
      return data.length > 0 && data.some((item: any) => hasDeepContent(item));
    }
    if (typeof data === 'object') {
      return Object.values(data).some((v: any) => hasDeepContent(v));
    }
    return false;
  }, []);

  // ─── ROBUST content checker (v3.4 FIX) ─────────────────────────

  const robustCheckSectionHasContent = useCallback(
    (sectionKey: string): boolean => {
      const section = projectData[sectionKey];
      if (!section) return false;
      return hasDeepContent(section);
    },
    [projectData, hasDeepContent]
  );

  // ─── Friendly error handler ────────────────────────────────────

  const handleAIError = useCallback(
    (e: any, context: string = '') => {
      const msg = e.message || e.toString();

      if (msg === 'MISSING_API_KEY') {
        setIsSettingsOpen(true);
        return;
      }

      if (
        msg.includes('Quota') ||
        msg.includes('credits') ||
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('rate limit') ||
        msg.includes('afford')
      ) {
        setModalConfig({
          isOpen: true,
          title: language === 'si' ? 'Nezadostna sredstva AI' : 'Insufficient AI Credits',
          message:
            language === 'si'
              ? 'Vaš AI ponudnik nima dovolj sredstev za to zahtevo. Možne rešitve:\n\n• Dopolnite kredit pri vašem AI ponudniku\n• V Nastavitvah zamenjajte na cenejši model\n• V Nastavitvah preklopite na drugega AI ponudnika'
              : 'Your AI provider does not have enough credits for this request. Possible solutions:\n\n• Top up credits with your AI provider\n• Switch to a cheaper model in Settings\n• Switch to a different AI provider in Settings',
          confirmText: language === 'si' ? 'Odpri nastavitve' : 'Open Settings',
          secondaryText: '',
          cancelText: language === 'si' ? 'Zapri' : 'Close',
          onConfirm: () => {
            closeModal();
            setIsSettingsOpen(true);
          },
          onSecondary: null,
          onCancel: closeModal,
        });
        return;
      }

      if (msg.includes('JSON') || msg.includes('Unexpected token') || msg.includes('parse')) {
        setError(
          language === 'si'
            ? 'AI je vrnil nepravilen format. Poskusite ponovno.'
            : 'AI returned an invalid format. Please try again.'
        );
        return;
      }

      if (
        msg.includes('fetch') ||
        msg.includes('network') ||
        msg.includes('Failed to fetch') ||
        msg.includes('ERR_')
      ) {
        setError(
          language === 'si'
            ? 'Omrežna napaka. Preverite internetno povezavo in poskusite ponovno.'
            : 'Network error. Check your internet connection and try again.'
        );
        return;
      }

      console.error(`[AI Error] ${context}:`, e);
      setError(
        language === 'si'
          ? 'Napaka pri generiranju. Preverite konzolo (F12) za podrobnosti.'
          : 'Generation error. Check console (F12) for details.'
      );
    },
    [language, setIsSettingsOpen, setModalConfig, closeModal]
  );

  // ─── Check if other language has content FOR THIS SECTION (v3.5) ──

  const checkOtherLanguageHasContent = useCallback(
    async (sectionKey: string): Promise<any | null> => {
      const otherLang = language === 'en' ? 'si' : 'en';

      // Helper: check if a specific project version has content
      // in the EXACT section we're asking about — not anywhere else
      const checkVersion = (projectVersion: any): any | null => {
        if (!projectVersion) return null;
        const sectionData = projectVersion[sectionKey];
        if (!sectionData) return null;
        // Only return the project if THIS SPECIFIC SECTION has real content
        if (hasDeepContent(sectionData)) {
          return projectVersion;
        }
        return null;
      };

      // First check in-memory versions
      const cachedResult = checkVersion(projectVersions[otherLang]);
      if (cachedResult) return cachedResult;

      // If not in memory, try loading from storage
      try {
        const loaded = await storageService.loadProject(otherLang, currentProjectId);
        const loadedResult = checkVersion(loaded);
        if (loadedResult) return loadedResult;
      } catch (e) {
        console.warn('[useGeneration] Could not load other language version:', e);
      }

      return null;
    },
    [language, projectVersions, currentProjectId, hasDeepContent]
  );

  // ─── Perform translation from other language ───────────────────

  const performTranslationFromOther = useCallback(
    async (otherLangData: any) => {
      closeModal();
      setIsLoading(language === 'si' ? 'Prevajanje iz EN...' : 'Translating from SI...');
      setError(null);

      try {
        const { translatedData, stats } = await smartTranslateProject(
          otherLangData,
          language,
          projectData,
          currentProjectId!
        );

        if (stats.failed > 0 && stats.translated === 0) {
          throw new Error('credits');
        }

        setProjectData(translatedData);
        setHasUnsavedTranslationChanges(false);
        await storageService.saveProject(translatedData, language, currentProjectId);

        setProjectVersions((prev) => ({
          ...prev,
          [language]: translatedData,
        }));

        if (stats.failed > 0) {
          setError(
            language === 'si'
              ? `Prevod delno uspel: ${stats.translated}/${stats.changed} polj prevedenih.`
              : `Translation partially done: ${stats.translated}/${stats.changed} fields translated.`
          );
        }
      } catch (e: any) {
        handleAIError(e, 'translateFromOtherLanguage');
      } finally {
        setIsLoading(false);
      }
    },
    [
      language,
      projectData,
      currentProjectId,
      closeModal,
      setProjectData,
      setHasUnsavedTranslationChanges,
      setProjectVersions,
      handleAIError,
    ]
  );

  // ─── Execute section generation ────────────────────────────────
  // v3.5.2 FIX: When generating 'activities', also auto-generate
  // 'projectManagement' (Kakovost in učinkovitost izvedbe) BEFORE
  // risks, so the description field is populated.

  const executeGeneration = useCallback(
    async (sectionKey: string, mode: string = 'regenerate') => {
      closeModal();
      setIsLoading(`${t.generating} ${sectionKey}...`);
      setError(null);

      try {
        const generatedData = await generateSectionContent(
          sectionKey,
          projectData,
          language,
          mode
        );

        let newData = { ...projectData };
        if (['problemAnalysis', 'projectIdea'].includes(sectionKey)) {
          newData[sectionKey] = { ...newData[sectionKey], ...generatedData };
        } else if (sectionKey === 'activities') {
          // ★ FIX: AI sometimes returns { activities: [...] } wrapper or single object
          if (Array.isArray(generatedData)) {
            newData[sectionKey] = generatedData;
          } else if (generatedData && Array.isArray(generatedData.activities)) {
            newData[sectionKey] = generatedData.activities;
          } else if (generatedData && typeof generatedData === 'object' && !Array.isArray(generatedData)) {
            newData[sectionKey] = [generatedData];
          } else {
            console.warn('[executeGeneration] activities: unexpected format, keeping original');
          }
        } else if (sectionKey === 'expectedResults') {
          // ★ FIX v4.5: Composite result — unpack outputs/outcomes/impacts
          const compositeData = generatedData as any;
          if (compositeData.outputs) newData.outputs = compositeData.outputs;
          if (compositeData.outcomes) newData.outcomes = compositeData.outcomes;
          if (compositeData.impacts) newData.impacts = compositeData.impacts;
        } else {
          newData[sectionKey] = generatedData;
        }

        if (sectionKey === 'activities') {
          const schedResult = recalculateProjectSchedule(newData);
          newData = schedResult.projectData;
          if (schedResult.warnings.length > 0) {
            console.warn('Schedule warnings:', schedResult.warnings);
          }

          // ────────────────────────────────────────────────────────
          // v3.5.2 FIX: Auto-generate projectManagement
          // (Kakovost in učinkovitost izvedbe — description + structure)
          // Generated BEFORE risks so it has full activities context,
          // and risks in turn have full projectManagement context.
          // ────────────────────────────────────────────────────────
          setIsLoading(`${t.generating} ${t.subSteps.implementation}...`);
          try {
            const pmContent = await generateSectionContent(
              'projectManagement',
              newData,
              language,
              mode
            );
            // Deep merge to preserve any manually entered structure fields
            newData.projectManagement = {
              ...newData.projectManagement,
              ...pmContent,
              structure: {
                ...(newData.projectManagement?.structure || {}),
                ...(pmContent?.structure || {}),
              },
            };
          } catch (e) {
            console.error('[Auto-gen projectManagement]:', e);
          }

          // Auto-generate risks after activities + projectManagement
          setIsLoading(`${t.generating} ${t.subSteps.riskMitigation}...`);
          try {
              const risksContent = await generateSectionContent(
              'risks',
              newData,
              language,
              mode
            );
            // ★ FIX: Ensure risks is always an array
            if (Array.isArray(risksContent)) {
              newData.risks = risksContent;
            } else if (risksContent && Array.isArray(risksContent.risks)) {
              newData.risks = risksContent.risks;
            } else {
              console.warn('[executeGeneration] risks: unexpected format, keeping original');
            }

          } catch (e) {
            console.error(e);
          }
        }

        setProjectData(newData);
        setHasUnsavedTranslationChanges(true);
      } catch (e: any) {
        handleAIError(e, `generateSection(${sectionKey})`);
      } finally {
        setIsLoading(false);
      }
    },
    [
      projectData,
      language,
      t,
      closeModal,
      setProjectData,
      setHasUnsavedTranslationChanges,
      handleAIError,
    ]
  );

  // ─── 3-option generation modal helper ──────────────────────────

  const show3OptionModal = useCallback(
    (onEnhance: () => void, onFill: () => void, onRegenerate: () => void) => {
      setModalConfig({
        isOpen: true,
        title: t.modals.generationChoiceTitle,
        message: t.modals.generationChoiceMsg,

        // Option 1: Enhance Existing (green — primary)
        confirmText: t.modals.enhanceExistingBtn,
        confirmDesc: t.modals.enhanceExistingDesc,
        onConfirm: onEnhance,

        // Option 2: Fill Missing (blue — secondary)
        secondaryText: t.modals.fillMissingBtn,
        secondaryDesc: t.modals.fillMissingDesc,
        onSecondary: onFill,

        // Option 3: Regenerate All (amber — tertiary)
        tertiaryText: t.modals.regenerateAllBtn,
        tertiaryDesc: t.modals.regenerateAllDesc,
        onTertiary: onRegenerate,

        cancelText: language === 'si' ? 'Prekliči' : 'Cancel',
        onCancel: closeModal,
      });
    },
    [t, language, setModalConfig, closeModal]
  );

  // ─── SMART Handle generate (4-level logic — v3.5.1) ────────────

  const handleGenerateSection = useCallback(
    async (sectionKey: string) => {
      if (!ensureApiKey()) {
        setIsSettingsOpen(true);
        return;
      }

      const otherLang = language === 'en' ? 'SI' : 'EN';

      // v3.4/3.5 FIX: Use robust check
      const currentHasContent = robustCheckSectionHasContent(sectionKey);

      // Check if other language has content FOR THIS SPECIFIC SECTION
      const otherLangData = await checkOtherLanguageHasContent(sectionKey);

      if (otherLangData && !currentHasContent) {
        // LEVEL 1: Other language has content for THIS section, current is empty
        // → Primary action: Translate (most useful when current is empty)
        setModalConfig({
          isOpen: true,
          title:
            language === 'si'
              ? `Vsebina obstaja v ${otherLang}`
              : `Content exists in ${otherLang}`,
          message:
            language === 'si'
              ? `To poglavje že ima vsebino v ${otherLang} jeziku. Želite prevesti obstoječo vsebino ali generirati novo?`
              : `This section already has content in ${otherLang}. Would you like to translate existing content or generate new?`,
          confirmText:
            language === 'si'
              ? `Prevedi iz ${otherLang}`
              : `Translate from ${otherLang}`,
          secondaryText: language === 'si' ? 'Generiraj novo' : 'Generate new',
          cancelText: language === 'si' ? 'Prekliči' : 'Cancel',
          onConfirm: () => performTranslationFromOther(otherLangData),
          onSecondary: () => executeGeneration(sectionKey, 'regenerate'),
          onCancel: closeModal,
        });
        return;
      }

      if (otherLangData && currentHasContent) {
        // LEVEL 2: Both languages have content for THIS section
        // v3.5.1 FIX: Primary button = "Generate/Enhance" (most common action)
        //             Secondary button = "Translate" (less common)
        setModalConfig({
          isOpen: true,
          title:
            language === 'si'
              ? `Vsebina obstaja v obeh jezikih`
              : `Content exists in both languages`,
          message:
            language === 'si'
              ? `To poglavje ima vsebino v slovenščini in angleščini. Kaj želite storiti?`
              : `This section has content in both SI and EN. What would you like to do?`,
          confirmText:
            language === 'si'
              ? 'Generiraj / izboljšaj trenutno'
              : 'Generate / enhance current',
          secondaryText:
            language === 'si'
              ? `Prevedi iz ${otherLang}`
              : `Translate from ${otherLang}`,
          cancelText: language === 'si' ? 'Prekliči' : 'Cancel',
          onConfirm: () => {
            // Primary action: show 3-option modal
            closeModal();
            setTimeout(() => {
              show3OptionModal(
                () => executeGeneration(sectionKey, 'enhance'),
                () => executeGeneration(sectionKey, 'fill'),
                () => executeGeneration(sectionKey, 'regenerate')
              );
            }, 100);
          },
          onSecondary: () => performTranslationFromOther(otherLangData),
          onCancel: closeModal,
        });
        return;
      }

      // LEVEL 3: Only current language has content → 3-option modal
      if (currentHasContent) {
        show3OptionModal(
          () => executeGeneration(sectionKey, 'enhance'),
          () => executeGeneration(sectionKey, 'fill'),
          () => executeGeneration(sectionKey, 'regenerate')
        );
        return;
      }

      // LEVEL 4: Nothing exists anywhere → just generate
      executeGeneration(sectionKey, 'regenerate');
    },
    [
      ensureApiKey,
      language,
      robustCheckSectionHasContent,
      checkOtherLanguageHasContent,
      executeGeneration,
      performTranslationFromOther,
      show3OptionModal,
      setModalConfig,
      closeModal,
      setIsSettingsOpen,
    ]
  );

  // ─── Composite generation (outputs + outcomes + impacts + KERs) ─

  const handleGenerateCompositeSection = useCallback(
    async (_sectionKey: string) => {
      if (!ensureApiKey()) {
        setIsSettingsOpen(true);
        return;
      }

      const sections = ['outputs', 'outcomes', 'impacts', 'kers'];

      // v3.4/3.5 FIX: Use robust check
      const hasContentInSections = sections.some((s) =>
        robustCheckSectionHasContent(s)
      );

      const otherLang = language === 'en' ? 'SI' : 'EN';

      // Check if other language has content in any of the composite sections
      let otherLangData: any = null;
      for (const s of sections) {
        otherLangData = await checkOtherLanguageHasContent(s);
        if (otherLangData) break;
      }

      const runComposite = async (mode: string) => {
    closeModal();
    setIsLoading(true);
    setError(null);

    let successCount = 0;
    let lastError: any = null;

    for (const s of sections) {
        setIsLoading(`${t.generating} ${s}...`);
        try {
            const generatedData = await generateSectionContent(
                s,
                projectData,
                language,
                mode
            );
            setProjectData((prev: any) => {
                const next = { ...prev };
                next[s] = generatedData;
                return next;
            });
            successCount++;
        } catch (e: any) {
            console.error(`[runComposite] Failed to generate ${s}:`, e);
            lastError = e;
            // Continue with next section — don't break the loop
        }
        // Delay between calls to avoid rate limits (especially Gemini free tier)
        await new Promise((r) => setTimeout(r, 1500));
    }

    if (successCount > 0) {
        setHasUnsavedTranslationChanges(true);
    }

    if (lastError && successCount < sections.length) {
        const failedCount = sections.length - successCount;
        setError(
            language === 'si'
                ? `${successCount}/${sections.length} razdelkov uspešno generiranih. ${failedCount} ni uspelo — poskusite ponovno.`
                : `${successCount}/${sections.length} sections generated successfully. ${failedCount} failed — please try again.`
        );
    }

    setIsLoading(false);
};


      if (otherLangData && !hasContentInSections) {
        // LEVEL 1: Other language has results, current is empty
        setModalConfig({
          isOpen: true,
          title:
            language === 'si'
              ? `Rezultati obstajajo v ${otherLang}`
              : `Results exist in ${otherLang}`,
          message:
            language === 'si'
              ? `Pričakovani rezultati že obstajajo v ${otherLang} jeziku. Želite prevesti ali generirati na novo?`
              : `Expected results already exist in ${otherLang}. Would you like to translate or generate new?`,
          confirmText:
            language === 'si'
              ? `Prevedi iz ${otherLang}`
              : `Translate from ${otherLang}`,
          secondaryText: language === 'si' ? 'Generiraj novo' : 'Generate new',
          cancelText: language === 'si' ? 'Prekliči' : 'Cancel',
          onConfirm: () => performTranslationFromOther(otherLangData),
          onSecondary: () => runComposite('regenerate'),
          onCancel: closeModal,
        });
      } else if (otherLangData && hasContentInSections) {
        // LEVEL 2: Both languages have content
        // v3.5.1 FIX: Primary = Generate/Enhance, Secondary = Translate
        setModalConfig({
          isOpen: true,
          title:
            language === 'si'
              ? `Rezultati obstajajo v obeh jezikih`
              : `Results exist in both languages`,
          message:
            language === 'si'
              ? `Rezultati obstajajo v slovenščini in angleščini. Kaj želite storiti?`
              : `Results exist in both SI and EN. What would you like to do?`,
          confirmText:
            language === 'si'
              ? 'Generiraj / izboljšaj trenutno'
              : 'Generate / enhance current',
          secondaryText:
            language === 'si'
              ? `Prevedi iz ${otherLang}`
              : `Translate from ${otherLang}`,
          cancelText: language === 'si' ? 'Prekliči' : 'Cancel',
          onConfirm: () => {
            closeModal();
            setTimeout(() => {
              show3OptionModal(
                () => runComposite('enhance'),
                () => runComposite('fill'),
                () => runComposite('regenerate')
              );
            }, 100);
          },
          onSecondary: () => performTranslationFromOther(otherLangData),
          onCancel: closeModal,
        });
      } else if (hasContentInSections) {
        // LEVEL 3: Only current language has content → 3-option modal
        show3OptionModal(
          () => runComposite('enhance'),
          () => runComposite('fill'),
          () => runComposite('regenerate')
        );
      } else {
        // LEVEL 4: Nothing exists → just generate
        runComposite('regenerate');
      }
    },
    [
      ensureApiKey,
      robustCheckSectionHasContent,
      checkOtherLanguageHasContent,
      projectData,
      language,
      t,
      closeModal,
      setProjectData,
      setHasUnsavedTranslationChanges,
      setIsSettingsOpen,
      setModalConfig,
      handleAIError,
      performTranslationFromOther,
      show3OptionModal,
    ]
  );

  // ─── Single field generation ───────────────────────────────────

  const handleGenerateField = useCallback(
    async (path: (string | number)[]) => {
      if (!ensureApiKey()) {
        setIsSettingsOpen(true);
        return;
      }

      const fieldName = path[path.length - 1];
      setIsLoading(`${t.generating} ${String(fieldName)}...`);
      setError(null);

      try {
        const content = await generateFieldContent(path, projectData, language);
        handleUpdateData(path, content);
      } catch (e: any) {
        handleAIError(e, `generateField(${String(fieldName)})`);
      } finally {
        setIsLoading(false);
      }
    },
    [ensureApiKey, projectData, language, t, handleUpdateData, setIsSettingsOpen, handleAIError]
  );

  // ─── Summary generation ────────────────────────────────────────

  const runSummaryGeneration = useCallback(async () => {
    setIsGeneratingSummary(true);
    setSummaryText('');
    try {
      const text = await generateProjectSummary(projectData, language);
      setSummaryText(text);
    } catch (e: any) {
      const msg = e.message || '';
      if (msg.includes('credits') || msg.includes('Quota') || msg.includes('afford')) {
        setSummaryText(
          language === 'si'
            ? 'Nezadostna sredstva AI. Dopolnite kredit ali zamenjajte model v Nastavitvah.'
            : 'Insufficient AI credits. Top up credits or switch model in Settings.'
        );
      } else {
        setSummaryText(
          language === 'si'
            ? 'Napaka pri generiranju povzetka. Poskusite ponovno.'
            : 'Error generating summary. Please try again.'
        );
      }
      console.error('[Summary Error]:', e);
    } finally {
      setIsGeneratingSummary(false);
    }
  }, [projectData, language]);

  const handleExportSummary = useCallback(() => {
    setSummaryModalOpen(true);
    if (!summaryText) {
      runSummaryGeneration();
    }
  }, [summaryText, runSummaryGeneration]);

  const handleDownloadSummaryDocx = useCallback(async () => {
    try {
      const blob = await generateSummaryDocx(
        summaryText,
        projectData.projectIdea?.projectTitle,
        language
      );
      downloadBlob(
        blob,
        `Summary - ${projectData.projectIdea?.projectTitle || 'Project'}.docx`
      );
    } catch (e: any) {
      console.error(e);
      alert(
        language === 'si'
          ? 'Napaka pri generiranju DOCX datoteke.'
          : 'Failed to generate DOCX file.'
      );
    }
  }, [summaryText, projectData, language]);

  return {
    isLoading,
    setIsLoading,
    error,
    setError,
    summaryModalOpen,
    setSummaryModalOpen,
    summaryText,
    isGeneratingSummary,
    handleGenerateSection,
    handleGenerateCompositeSection,
    handleGenerateField,
    handleExportSummary,
    runSummaryGeneration,
    handleDownloadSummaryDocx,
  };
};
