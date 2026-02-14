// hooks/useGeneration.ts
// ═══════════════════════════════════════════════════════════════
// AI content generation — sections, fields, summaries.
//
// v3.4 — 2026-02-14 — CHANGES:
//   - FIXED: robustCheckSectionHasContent replaces broken parent check
//   - Recursively checks ALL fields (title, description, nested objects, arrays)
//   - 3-option modal now correctly shown when ANY field has content
//   - checkOtherLanguageHasContent also checks nested objects
//   - 'enhance' mode passed to geminiService for professional deepening
//
// SMART 4-LEVEL LOGIC for "Generate with AI" button:
//   1. Check if OTHER language has content, CURRENT is empty
//      → Offer "Translate from SI/EN" or "Generate new"
//   2. Check if BOTH languages have content
//      → Offer "Translate" or 3-option (Enhance/Fill/Regenerate)
//   3. Check if CURRENT language already has content
//      → 3-option modal: Enhance / Fill / Regenerate
//   4. If nothing exists → generate without asking
//
// Errors are handled gracefully with user-friendly modals.
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

  // ─── ROBUST content checker (v3.4 FIX) ─────────────────────────
  // The parent's checkSectionHasContent only checks top-level or
  // title fields. This version recursively checks ALL fields:
  // title, description, nested objects, arrays with items.
  // This ensures the 3-option modal appears when the user has
  // entered ANY content (e.g. just a description, not a title).

  const robustCheckSectionHasContent = useCallback(
    (sectionKey: string): boolean => {
      const section = projectData[sectionKey];
      if (!section) return false;

      const hasAnyContent = (obj: any): boolean => {
        if (!obj || typeof obj !== 'object') return false;
        for (const key of Object.keys(obj)) {
          const val = obj[key];
          // String field with actual text
          if (typeof val === 'string' && val.trim().length > 0) return true;
          // Array with at least one meaningful item
          if (Array.isArray(val) && val.length > 0) {
            if (
              val.some((item: any) => {
                if (typeof item === 'string') return item.trim().length > 0;
                if (typeof item === 'object') return hasAnyContent(item);
                return false;
              })
            )
              return true;
          }
          // Nested object
          if (typeof val === 'object' && !Array.isArray(val) && hasAnyContent(val)) {
            return true;
          }
        }
        return false;
      };

      return hasAnyContent(section);
    },
    [projectData]
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

  // ─── Check if other language has content for a section ─────────

  const checkOtherLanguageHasContent = useCallback(
    async (sectionKey: string): Promise<any | null> => {
      const otherLang = language === 'en' ? 'si' : 'en';

      // Recursive content checker (same logic as robustCheckSectionHasContent)
      const hasDeepContent = (data: any): boolean => {
        if (!data) return false;
        if (typeof data === 'string') return data.trim().length > 0;
        if (Array.isArray(data)) {
          return data.some((item: any) => hasDeepContent(item));
        }
        if (typeof data === 'object') {
          return Object.values(data).some((v: any) => hasDeepContent(v));
        }
        return false;
      };

      // First check in-memory versions
      const cached = projectVersions[otherLang];
      if (cached) {
        const sectionData = cached[sectionKey];
        if (sectionData && hasDeepContent(sectionData)) {
          return cached;
        }
      }

      // If not in memory, try loading from storage
      try {
        const loaded = await storageService.loadProject(otherLang, currentProjectId);
        if (loaded) {
          const sectionData = loaded[sectionKey];
          if (sectionData && hasDeepContent(sectionData)) {
            return loaded;
          }
        }
      } catch (e) {
        console.warn('[useGeneration] Could not load other language version:', e);
      }

      return null;
    },
    [language, projectVersions, currentProjectId]
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
        } else {
          newData[sectionKey] = generatedData;
        }

        if (sectionKey === 'activities') {
          const schedResult = recalculateProjectSchedule(newData);
          newData = schedResult.projectData;
          if (schedResult.warnings.length > 0) {
            console.warn('Schedule warnings:', schedResult.warnings);
          }

          // Auto-generate risks after activities
          setIsLoading(`${t.generating} ${t.subSteps.riskMitigation}...`);
          try {
            const risksContent = await generateSectionContent(
              'risks',
              newData,
              language,
              mode
            );
            newData.risks = risksContent;
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

  // ─── 3-option generation modal helper (v3.3) ──────────────────
  // Reusable function that shows Enhance / Fill / Regenerate modal

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

  // ─── SMART Handle generate (4-level logic — v3.4) ─────────────

  const handleGenerateSection = useCallback(
    async (sectionKey: string) => {
      if (!ensureApiKey()) {
        setIsSettingsOpen(true);
        return;
      }

      const otherLang = language === 'en' ? 'SI' : 'EN';

      // v3.4 FIX: Use robust check instead of parent's broken version
      const currentHasContent = robustCheckSectionHasContent(sectionKey);

      // LEVEL 1: Check if other language has content
      const otherLangData = await checkOtherLanguageHasContent(sectionKey);

      if (otherLangData && !currentHasContent) {
        // Other language has content, current is empty → translate or generate?
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
        // LEVEL 2: Both languages have content → translate or 3-option?
        setModalConfig({
          isOpen: true,
          title:
            language === 'si'
              ? `Vsebina obstaja v obeh jezikih`
              : `Content exists in both languages`,
          message:
            language === 'si'
              ? `To poglavje ima vsebino v obeh jezikih. Želite prevesti iz ${otherLang} ali delati s trenutno vsebino?`
              : `This section has content in both languages. Would you like to translate from ${otherLang} or work with current content?`,
          confirmText:
            language === 'si'
              ? `Prevedi iz ${otherLang}`
              : `Translate from ${otherLang}`,
          secondaryText:
            language === 'si' ? 'Uporabi trenutno vsebino' : 'Work with current content',
          cancelText: language === 'si' ? 'Prekliči' : 'Cancel',
          onConfirm: () => performTranslationFromOther(otherLangData),
          onSecondary: () => {
            // Close this modal and show the 3-option modal
            closeModal();
            setTimeout(() => {
              show3OptionModal(
                () => executeGeneration(sectionKey, 'enhance'),
                () => executeGeneration(sectionKey, 'fill'),
                () => executeGeneration(sectionKey, 'regenerate')
              );
            }, 100);
          },
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

      // v3.4 FIX: Use robust check
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

        try {
          for (const s of sections) {
            setIsLoading(`${t.generating} ${s}...`);
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
            await new Promise((r) => setTimeout(r, 100));
          }
          setHasUnsavedTranslationChanges(true);
        } catch (e: any) {
          handleAIError(e, 'generateComposite');
        } finally {
          setIsLoading(false);
        }
      };

      if (otherLangData && !hasContentInSections) {
        // Other language has results, current is empty
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
        // Both languages have content → translate or work with current
        setModalConfig({
          isOpen: true,
          title:
            language === 'si'
              ? `Rezultati obstajajo v obeh jezikih`
              : `Results exist in both languages`,
          message:
            language === 'si'
              ? `Želite prevesti iz ${otherLang} ali delati s trenutno vsebino?`
              : `Would you like to translate from ${otherLang} or work with current content?`,
          confirmText:
            language === 'si'
              ? `Prevedi iz ${otherLang}`
              : `Translate from ${otherLang}`,
          secondaryText:
            language === 'si'
              ? 'Uporabi trenutno vsebino'
              : 'Work with current content',
          cancelText: language === 'si' ? 'Prekliči' : 'Cancel',
          onConfirm: () => performTranslationFromOther(otherLangData),
          onSecondary: () => {
            closeModal();
            setTimeout(() => {
              show3OptionModal(
                () => runComposite('enhance'),
                () => runComposite('fill'),
                () => runComposite('regenerate')
              );
            }, 100);
          },
          onCancel: closeModal,
        });
      } else if (hasContentInSections) {
        // v3.3: 3-option modal for composite sections too
        show3OptionModal(
          () => runComposite('enhance'),
          () => runComposite('fill'),
          () => runComposite('regenerate')
        );
      } else {
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
