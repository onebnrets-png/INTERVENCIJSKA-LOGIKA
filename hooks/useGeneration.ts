// hooks/useGeneration.ts
// ═══════════════════════════════════════════════════════════════
// AI content generation — sections, fields, summaries.
// v3.8 — 2026-02-16 — PER-WP GENERATION
//   - Activities in 'regenerate' mode now use generateActivitiesPerWP()
//     which generates each WP individually for better quality.
//   - Progress callback shows current WP being generated.
//   - 'fill' and 'enhance' modes still use generateSectionContent().
//   - All previous v3.7 changes preserved.
//
// v3.7 — 2026-02-15 — CHANGES:
//   - FIX: runComposite in FILL mode now detects which sections
//     actually need filling and generates ONLY those sections.
//   - FIX: Loading messages adapted to show actual work being done:
//     "Dopolnjujem Outputs (1/2)..." instead of always showing all 4.
//   - NEW: sectionNeedsGeneration() helper detects empty items in arrays
//     and empty fields in objects.
//   - All previous v3.6 changes preserved (retry, backoff, friendly modals).
//
// v3.6 — 2026-02-15 — CHANGES:
//   - FIX: runComposite — try/catch moved INSIDE the for loop so that
//     a single failed section (e.g. kers hitting 429 rate limit) does
//     NOT abort generation of remaining sections.
//   - FIX: runComposite — delay between API calls increased from 100ms
//     to 1500ms to reduce Gemini free-tier rate limit hits.
//   - FIX: runComposite — partial success reporting: user sees
//     "3/4 sections generated" instead of silent failure.
//   - All previous v3.5.2 changes preserved.
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
  generateTargetedFill,
  generateActivitiesPerWP,
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

  // ─── v3.7: Check if a section needs generation (has empty items) ──

  const sectionNeedsGeneration = useCallback(
    (sectionKey: string): { needsFill: boolean; needsFullGeneration: boolean; emptyIndices: number[] } => {
      const section = projectData[sectionKey];

      // No data at all → needs full generation
      if (!section) {
        return { needsFill: false, needsFullGeneration: true, emptyIndices: [] };
      }

      // Array sections (outputs, outcomes, impacts, kers)
      if (Array.isArray(section)) {
        if (section.length === 0) {
          return { needsFill: false, needsFullGeneration: true, emptyIndices: [] };
        }

        const emptyIndices: number[] = [];
        let hasAnyContent = false;

        section.forEach((item: any, index: number) => {
          if (!item || !hasDeepContent(item)) {
            // Completely empty item
            emptyIndices.push(index);
          } else {
            // Check if item has empty required fields
            const hasEmptyFields = Object.entries(item).some(([key, val]) => {
              if (key === 'id') return false; // id is auto-generated
              return typeof val === 'string' && val.trim().length === 0;
            });
            if (hasEmptyFields) {
              emptyIndices.push(index);
            }
            hasAnyContent = true;
          }
        });

        if (!hasAnyContent) {
          return { needsFill: false, needsFullGeneration: true, emptyIndices: [] };
        }

        if (emptyIndices.length > 0) {
          return { needsFill: true, needsFullGeneration: false, emptyIndices };
        }

        // All items have content — no generation needed
        return { needsFill: false, needsFullGeneration: false, emptyIndices: [] };
      }

      // Object sections
      if (typeof section === 'object') {
        const hasContent = hasDeepContent(section);
        if (!hasContent) {
          return { needsFill: false, needsFullGeneration: true, emptyIndices: [] };
        }
        // Check for empty fields
        const hasEmptyFields = Object.entries(section).some(([_key, val]) => {
          return typeof val === 'string' && val.trim().length === 0;
        });
        if (hasEmptyFields) {
          return { needsFill: true, needsFullGeneration: false, emptyIndices: [] };
        }
        return { needsFill: false, needsFullGeneration: false, emptyIndices: [] };
      }

      return { needsFill: false, needsFullGeneration: false, emptyIndices: [] };
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
        let generatedData;

                // ★ v3.8: Smart per-WP generation for activities (all modes)
        if (sectionKey === 'activities') {
          const existingWPs = projectData.activities || [];
          const emptyWPIndices: number[] = [];
          
          // Detect which WPs are empty or missing content
          existingWPs.forEach((wp: any, idx: number) => {
            const hasTasks = wp.tasks && Array.isArray(wp.tasks) && wp.tasks.length > 0 
              && wp.tasks.some((t: any) => t.title && t.title.trim().length > 0);
            const hasMilestones = wp.milestones && Array.isArray(wp.milestones) && wp.milestones.length > 0;
            const hasDeliverables = wp.deliverables && Array.isArray(wp.deliverables) && wp.deliverables.length > 0;
            if (!hasTasks || !hasMilestones || !hasDeliverables) {
              emptyWPIndices.push(idx);
            }
          });

          if (mode === 'regenerate' || existingWPs.length === 0) {
            // Full regeneration — generate all WPs from scratch
            generatedData = await generateActivitiesPerWP(
              projectData,
              language,
              mode,
              (wpIndex, wpTotal, wpTitle) => {
                if (wpIndex === -1) {
                  setIsLoading(language === 'si' ? 'Generiranje strukture DS...' : 'Generating WP structure...');
                } else {
                  setIsLoading(
                    language === 'si'
                      ? `Generiram DS ${wpIndex + 1}/${wpTotal}: ${wpTitle}...`
                      : `Generating WP ${wpIndex + 1}/${wpTotal}: ${wpTitle}...`
                  );
                }
              }
            );
          } else if (emptyWPIndices.length > 0) {
            // Fill/enhance — only generate empty/incomplete WPs
            setIsLoading(
              language === 'si'
                ? `Dopolnjujem ${emptyWPIndices.length} nepopolnih DS...`
                : `Filling ${emptyWPIndices.length} incomplete WPs...`
            );

            // Build a temporary project with only the scaffold of existing WPs
            // so the per-WP generator has context for cross-WP dependencies
            const filledActivities = [...existingWPs];

            for (let i = 0; i < emptyWPIndices.length; i++) {
              const wpIdx = emptyWPIndices[i];
              const wp = existingWPs[wpIdx];
              const wpNum = wp.id?.replace('WP', '') || String(wpIdx + 1);

              setIsLoading(
                language === 'si'
                  ? `Dopolnjujem DS ${i + 1}/${emptyWPIndices.length}: ${wp.title || wp.id}...`
                  : `Filling WP ${i + 1}/${emptyWPIndices.length}: ${wp.title || wp.id}...`
              );

              // Determine WP type
              const isLast = wpIdx === existingWPs.length - 1;
              const isSecondToLast = wpIdx === existingWPs.length - 2;

              const today = new Date().toISOString().split('T')[0];
              const pStart = projectData.projectIdea?.startDate || today;
              const pMonths = projectData.projectIdea?.durationMonths || 24;

              // Import calculateProjectEndDate indirectly through generateActivitiesPerWP context
              // We need to build a focused prompt for this single WP
              const singleWPData = await generateSectionContent(
                'activities',
                {
                  ...projectData,
                  activities: existingWPs,
                  _generateOnlyWP: wp.id,
                  _wpIndex: wpIdx,
                  _isLastWP: isLast,
                  _isSecondToLastWP: isSecondToLast,
                },
                language,
                'fill'
              );

              // Extract the generated WP that matches our target
              if (Array.isArray(singleWPData)) {
                const generatedWP = singleWPData.find((w: any) => w.id === wp.id) || singleWPData[wpIdx];
                if (generatedWP) {
                  filledActivities[wpIdx] = {
                    ...wp,
                    tasks: (wp.tasks && wp.tasks.length > 0 && wp.tasks.some((t: any) => t.title?.trim())) ? wp.tasks : generatedWP.tasks,
                    milestones: (wp.milestones && wp.milestones.length > 0) ? wp.milestones : generatedWP.milestones,
                    deliverables: (wp.deliverables && wp.deliverables.length > 0) ? wp.deliverables : generatedWP.deliverables,
                  };
                }
              }

              // Rate limit pause
              if (i < emptyWPIndices.length - 1) {
                await new Promise(r => setTimeout(r, 2000));
              }
            }

            generatedData = filledActivities;
          } else if (mode === 'enhance') {
            // All WPs have content — enhance all via standard generation
            generatedData = await generateSectionContent(
              sectionKey,
              projectData,
              language,
              mode
            );
          } else {
            // All WPs complete, fill mode — nothing to do
            generatedData = existingWPs;
          }
        } else {
          generatedData = await generateSectionContent(
            sectionKey,
            projectData,
            language,
            mode
          );
        }

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
  // ★ v3.7 SMART FILL: Only generates sections that actually need it.
  //   In fill mode, uses targeted fill for sections with empty items.
  // ★ v3.6: try/catch INSIDE for loop + retry with backoff + friendly modals

  const handleGenerateCompositeSection = useCallback(
    async (_sectionKey: string) => {
      if (!ensureApiKey()) {
        setIsSettingsOpen(true);
        return;
      }

      const allSections = ['outputs', 'outcomes', 'impacts', 'kers'];

      const hasContentInSections = allSections.some((s) =>
        robustCheckSectionHasContent(s)
      );

      const otherLang = language === 'en' ? 'SI' : 'EN';

      let otherLangData: any = null;
      for (const s of allSections) {
        otherLangData = await checkOtherLanguageHasContent(s);
        if (otherLangData) break;
      }

      const runComposite = async (mode: string) => {
        closeModal();
        setIsLoading(true);
        setError(null);

        let successCount = 0;
        let skippedCount = 0;
        let lastError: any = null;

        // ★ v3.7: Determine which sections actually need generation
        let sectionsToProcess: { key: string; action: 'fill' | 'generate' | 'enhance' | 'regenerate'; emptyIndices: number[] }[] = [];

        if (mode === 'fill') {
          // SMART FILL: Only process sections that have empty items
          for (const s of allSections) {
            const status = sectionNeedsGeneration(s);
            if (status.needsFullGeneration) {
              sectionsToProcess.push({ key: s, action: 'generate', emptyIndices: [] });
            } else if (status.needsFill) {
              sectionsToProcess.push({ key: s, action: 'fill', emptyIndices: status.emptyIndices });
            }
            // else: section is complete → skip
          }

          if (sectionsToProcess.length === 0) {
            // Everything is already filled!
            setModalConfig({
              isOpen: true,
              title: language === 'si' ? 'Vse je izpolnjeno' : 'Everything is filled',
              message: language === 'si'
                ? 'Vsi razdelki pričakovanih rezultatov so že izpolnjeni. Če želite izboljšati vsebino, uporabite možnost "Izboljšaj obstoječe".'
                : 'All expected results sections are already filled. To improve content, use the "Enhance existing" option.',
              confirmText: language === 'si' ? 'V redu' : 'OK',
              secondaryText: '',
              cancelText: '',
              onConfirm: () => closeModal(),
              onSecondary: null,
              onCancel: () => closeModal(),
            });
            setIsLoading(false);
            return;
          }
        } else if (mode === 'enhance') {
          // ENHANCE: Only process sections that have content (skip empty ones)
          for (const s of allSections) {
            const status = sectionNeedsGeneration(s);
            if (!status.needsFullGeneration) {
              // Has some content → enhance it
              sectionsToProcess.push({ key: s, action: 'enhance', emptyIndices: [] });
            }
            // Empty sections are skipped in enhance mode
          }
          if (sectionsToProcess.length === 0) {
            setModalConfig({
              isOpen: true,
              title: language === 'si' ? 'Ni vsebine za izboljšanje' : 'No content to enhance',
              message: language === 'si'
                ? 'Nobeden razdelek nima vsebine za izboljšanje. Uporabite možnost "Generiraj vse na novo".'
                : 'No sections have content to enhance. Use the "Regenerate all" option.',
              confirmText: language === 'si' ? 'V redu' : 'OK',
              secondaryText: '',
              cancelText: '',
              onConfirm: () => closeModal(),
              onSecondary: null,
              onCancel: () => closeModal(),
            });
            setIsLoading(false);
            return;
          }
        } else {
          // REGENERATE: Process all sections
          sectionsToProcess = allSections.map(s => ({ key: s, action: 'regenerate' as const, emptyIndices: [] }));
        }

        const totalToProcess = sectionsToProcess.length;
        skippedCount = allSections.length - totalToProcess;

        const modeLabels: Record<string, { si: string; en: string }> = {
          fill: { si: 'Dopolnjujem', en: 'Filling' },
          generate: { si: 'Generiram', en: 'Generating' },
          enhance: { si: 'Izboljšujem', en: 'Enhancing' },
          regenerate: { si: 'Generiram na novo', en: 'Regenerating' },
        };

        const waitLabel = language === 'si' ? 'Čakam na API kvoto' : 'Waiting for API quota';

        for (let idx = 0; idx < sectionsToProcess.length; idx++) {
          const { key: s, action, emptyIndices } = sectionsToProcess[idx];
          const label = modeLabels[action]?.[language] || modeLabels['generate'][language];
          const sectionLabel = s.charAt(0).toUpperCase() + s.slice(1);

          setIsLoading(`${label} ${sectionLabel} (${idx + 1}/${totalToProcess})...`);

          let success = false;
          let retries = 0;
          const maxRetries = 3;

          while (!success && retries <= maxRetries) {
            try {
              let generatedData: any;

              if (action === 'fill' && emptyIndices.length > 0) {
                // ★ v3.7: TARGETED FILL — only generate empty items
                generatedData = await generateTargetedFill(
                  s,
                  projectData,
                  language,
                  emptyIndices
                );
              } else {
                // Standard generation (generate, enhance, regenerate)
                const genMode = action === 'generate' ? 'regenerate' : action;
                generatedData = await generateSectionContent(
                  s,
                  projectData,
                  language,
                  genMode
                );
              }

              setProjectData((prev: any) => {
                const next = { ...prev };
                next[s] = generatedData;
                return next;
              });
              successCount++;
              success = true;
            } catch (e: any) {
              const emsg = e.message || '';
              const isRateLimit = emsg.includes('429') || emsg.includes('Quota') || emsg.includes('rate limit') || emsg.includes('RESOURCE_EXHAUSTED');

              if (isRateLimit && retries < maxRetries) {
                retries++;
                const waitSeconds = retries * 20;
                console.warn(`[runComposite] Rate limit on ${s}, retry ${retries}/${maxRetries} in ${waitSeconds}s...`);
                for (let countdown = waitSeconds; countdown > 0; countdown--) {
                  setIsLoading(`${waitLabel}... ${countdown}s → ${sectionLabel}`);
                  await new Promise((r) => setTimeout(r, 1000));
                }
              } else {
                console.error(`[runComposite] Failed to generate ${s}:`, e);
                lastError = e;
                break;
              }
            }
          }

          if (success) {
            await new Promise((r) => setTimeout(r, 3000));
          }
        }

        if (successCount > 0) {
          setHasUnsavedTranslationChanges(true);
        }

        // ★ v3.7: Show success modal with skip info
        if (!lastError && successCount === totalToProcess) {
          // Complete success
          if (skippedCount > 0) {
            const skippedNames = allSections
              .filter(s => !sectionsToProcess.find(sp => sp.key === s))
              .map(s => s.charAt(0).toUpperCase() + s.slice(1))
              .join(', ');

            setModalConfig({
              isOpen: true,
              title: language === 'si' ? 'Dopolnjevanje končano' : 'Fill complete',
              message: language === 'si'
                ? `Uspešno dopolnjeno: ${successCount} razdelkov.\n\nPreskočeni razdelki (že izpolnjeni): ${skippedNames}.`
                : `Successfully filled: ${successCount} sections.\n\nSkipped sections (already complete): ${skippedNames}.`,
              confirmText: language === 'si' ? 'V redu' : 'OK',
              secondaryText: '',
              cancelText: '',
              onConfirm: () => closeModal(),
              onSecondary: null,
              onCancel: () => closeModal(),
            });
          }
        } else if (lastError && successCount < totalToProcess) {
          const failedCount = totalToProcess - successCount;
          const emsg = lastError.message || '';
          const isRateLimit = emsg.includes('429') || emsg.includes('Quota') || emsg.includes('rate limit') || emsg.includes('RESOURCE_EXHAUSTED');
          const isCredits = emsg.includes('afford') || emsg.includes('credits') || emsg.includes('402');
          const isJSON = emsg.includes('JSON') || emsg.includes('Unexpected token') || emsg.includes('parse');
          const isNetwork = emsg.includes('fetch') || emsg.includes('network') || emsg.includes('Failed to fetch') || emsg.includes('ERR_');

          let modalTitle: string;
          let modalMessage: string;

          if (isRateLimit) {
            modalTitle = language === 'si' ? 'Omejitev API klicev' : 'API Rate Limit Reached';
            modalMessage = language === 'si'
              ? `Uspešno generirano: ${successCount} od ${totalToProcess} razdelkov.\n\n${failedCount} razdelkov ni bilo mogoče generirati, ker je bil dosežen limit AI ponudnika (15 zahtevkov/minuto).\n\nPočakajte 1–2 minuti in poskusite ponovno, ali preklopite na drug model v Nastavitvah.`
              : `Successfully generated: ${successCount} of ${totalToProcess} sections.\n\n${failedCount} sections could not be generated due to AI provider rate limits (15 requests/minute).\n\nWait 1–2 minutes and try again, or switch models in Settings.`;
          } else if (isCredits) {
            modalTitle = language === 'si' ? 'Nezadostna sredstva AI' : 'Insufficient AI Credits';
            modalMessage = language === 'si'
              ? `Uspešno generirano: ${successCount} od ${totalToProcess} razdelkov.\n\n${failedCount} razdelkov ni bilo mogoče generirati, ker vaš AI ponudnik nima dovolj sredstev.\n\nDopolnite kredit pri vašem ponudniku ali preklopite na drug model v Nastavitvah.`
              : `Successfully generated: ${successCount} of ${totalToProcess} sections.\n\n${failedCount} sections could not be generated due to insufficient AI credits.\n\nTop up your credits or switch models in Settings.`;
          } else if (isJSON) {
            modalTitle = language === 'si' ? 'Napaka formata' : 'Format Error';
            modalMessage = language === 'si'
              ? `Uspešno generirano: ${successCount} od ${totalToProcess} razdelkov.\n\n${failedCount} razdelkov ni bilo mogoče generirati, ker je AI vrnil nepravilen format.\n\nPoskusite ponovno — AI modeli občasno vrnejo nepopoln odgovor.`
              : `Successfully generated: ${successCount} of ${totalToProcess} sections.\n\n${failedCount} sections could not be generated because the AI returned an invalid format.\n\nPlease try again — AI models occasionally return incomplete responses.`;
          } else if (isNetwork) {
            modalTitle = language === 'si' ? 'Omrežna napaka' : 'Network Error';
            modalMessage = language === 'si'
              ? `Uspešno generirano: ${successCount} od ${totalToProcess} razdelkov.\n\n${failedCount} razdelkov ni bilo mogoče generirati zaradi omrežne napake.\n\nPreverite internetno povezavo in poskusite ponovno.`
              : `Successfully generated: ${successCount} of ${totalToProcess} sections.\n\n${failedCount} sections could not be generated due to a network error.\n\nCheck your internet connection and try again.`;
          } else {
            modalTitle = language === 'si' ? 'Delna generacija' : 'Partial Generation';
            modalMessage = language === 'si'
              ? `Uspešno generirano: ${successCount} od ${totalToProcess} razdelkov.\n\n${failedCount} razdelkov ni bilo mogoče generirati.\n\nPoskusite ponovno ali preklopite na drug AI model v Nastavitvah.`
              : `Successfully generated: ${successCount} of ${totalToProcess} sections.\n\n${failedCount} sections could not be generated.\n\nPlease try again or switch to a different AI model in Settings.`;
          }

          setModalConfig({
            isOpen: true,
            title: modalTitle,
            message: modalMessage,
            confirmText: language === 'si' ? 'V redu' : 'OK',
            secondaryText: language === 'si' ? 'Odpri nastavitve' : 'Open Settings',
            cancelText: '',
            onConfirm: () => closeModal(),
            onSecondary: () => { closeModal(); setIsSettingsOpen(true); },
            onCancel: () => closeModal(),
          });
        }

        setIsLoading(false);
      };

      if (otherLangData && !hasContentInSections) {
        setModalConfig({
          isOpen: true,
          title: language === 'si'
            ? `Rezultati obstajajo v ${otherLang}`
            : `Results exist in ${otherLang}`,
          message: language === 'si'
            ? `Pričakovani rezultati že obstajajo v ${otherLang} jeziku. Želite prevesti ali generirati na novo?`
            : `Expected results already exist in ${otherLang}. Would you like to translate or generate new?`,
          confirmText: language === 'si'
            ? `Prevedi iz ${otherLang}`
            : `Translate from ${otherLang}`,
          secondaryText: language === 'si' ? 'Generiraj novo' : 'Generate new',
          cancelText: language === 'si' ? 'Prekliči' : 'Cancel',
          onConfirm: () => performTranslationFromOther(otherLangData),
          onSecondary: () => runComposite('regenerate'),
          onCancel: closeModal,
        });
      } else if (otherLangData && hasContentInSections) {
        setModalConfig({
          isOpen: true,
          title: language === 'si'
            ? `Rezultati obstajajo v obeh jezikih`
            : `Results exist in both languages`,
          message: language === 'si'
            ? `Rezultati obstajajo v slovenščini in angleščini. Kaj želite storiti?`
            : `Results exist in both SI and EN. What would you like to do?`,
          confirmText: language === 'si'
            ? 'Generiraj / izboljšaj trenutno'
            : 'Generate / enhance current',
          secondaryText: language === 'si'
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
      sectionNeedsGeneration,
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
