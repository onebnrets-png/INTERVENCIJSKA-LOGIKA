// hooks/useGeneration.ts
// ═══════════════════════════════════════════════════════════════
// AI content generation — sections, fields, summaries.
// v3.9 — 2026-02-16 — PER-WP GENERATION COMPLETE
//   - FIX: Fill mode for incomplete WPs now uses generateActivitiesPerWP()
//     with existingScaffold + onlyIndices instead of broken generateSectionContent()
//     with unsupported _generateOnlyWP properties.
//   - FIX: Mandatory WP detection (PM/Dissemination) no longer destroys
//     existing WPs — now generates ONLY missing mandatory WPs and adds them
//     at the correct positions (PM=WP1, Dissemination=second-to-last).
//   - All previous v3.8 changes preserved.
//
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
  generateObjectFill,
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
  // v3.9 FIX: Fill mode now uses generateActivitiesPerWP() with
  // existingScaffold + onlyIndices. Mandatory WP detection adds
  // only missing WPs instead of destroying existing ones.

  const executeGeneration = useCallback(
    async (sectionKey: string, mode: string = 'regenerate') => {
      closeModal();
      setIsLoading(`${t.generating} ${sectionKey}...`);
      setError(null);

      try {
        let generatedData;

        // ★ v3.8/v3.9: Smart per-WP generation for activities
        if (sectionKey === 'activities') {
          const existingWPs = projectData.activities || [];
          const emptyWPIndices: number[] = [];

          // ────────────────────────────────────────────────────────
          // ★ v3.9: Mandatory WP detection — PM and Dissemination
          // ────────────────────────────────────────────────────────
          const hasPMWP = existingWPs.some((wp: any) => {
            const title = (wp.title || '').toLowerCase();
            return title.includes('management') || title.includes('coordination')
              || title.includes('upravljanje') || title.includes('koordinacija');
          });
          const hasDissWP = existingWPs.some((wp: any) => {
            const title = (wp.title || '').toLowerCase();
            return title.includes('dissemination') || title.includes('communication')
              || title.includes('diseminacija') || title.includes('komunikacija');
          });

          const missingPM = !hasPMWP && existingWPs.length > 0;
          const missingDiss = !hasDissWP && existingWPs.length > 0;
          const hasMissingMandatory = missingPM || missingDiss;

          // Detect which WPs are empty or missing content
          existingWPs.forEach((wp: any, idx: number) => {
            const hasTasks = wp.tasks && Array.isArray(wp.tasks) && wp.tasks.length > 0
              && wp.tasks.some((t: any) => t.title && t.title.trim().length > 0);
            const hasMilestones = wp.milestones && Array.isArray(wp.milestones) && wp.milestones.length > 0;
            const hasDeliverables = wp.deliverables && wp.deliverables.length > 0
              && wp.deliverables.some((d: any) => d.title && d.title.trim().length > 0);
            if (!hasTasks || !hasMilestones || !hasDeliverables) {
              emptyWPIndices.push(idx);
            }
          });

          if (mode === 'regenerate' || existingWPs.length === 0) {
            // ──────────────────────────────────────────────────────
            // REGENERATE: Generate all WPs from scratch via per-WP
            // ──────────────────────────────────────────────────────
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

          } else if (hasMissingMandatory && mode !== 'enhance') {
            // ──────────────────────────────────────────────────────
            // ★ v3.9: MISSING MANDATORY WPs — add only missing ones
            // Does NOT destroy existing WPs.
            // ──────────────────────────────────────────────────────
            const durationMonths = projectData.projectIdea?.durationMonths || 24;
            const augmentedWPs = [...existingWPs];
            const mandatoryIndicesToGenerate: number[] = [];

            const missingNames: string[] = [];

            if (missingPM) {
              missingNames.push(language === 'si' ? 'Upravljanje projekta' : 'Project Management');

              // PM goes as LAST WP (convention: last = PM)
              const pmPlaceholder = {
                id: `WP${augmentedWPs.length + 1}`,
                title: language === 'si' ? 'Upravljanje in koordinacija projekta' : 'Project Management and Coordination',
                startDate: projectData.projectIdea?.startDate || new Date().toISOString().split('T')[0],
                endDate: '', // will be filled by generator
                startMonth: 1,
                endMonth: durationMonths,
                tasks: [],
                milestones: [],
                deliverables: [],
                leader: '',
                participants: [],
              };
              augmentedWPs.push(pmPlaceholder);
              mandatoryIndicesToGenerate.push(augmentedWPs.length - 1);
            }

            if (missingDiss) {
              missingNames.push(language === 'si' ? 'Diseminacija' : 'Dissemination');

              // Dissemination goes as SECOND-TO-LAST WP
              // If PM was just added as last, insert Diss before PM
              const dissInsertIdx = missingPM ? augmentedWPs.length - 1 : augmentedWPs.length;
              const dissPlaceholder = {
                id: '', // will be renumbered below
                title: language === 'si' ? 'Diseminacija, komunikacija in izkoriščanje rezultatov' : 'Dissemination, Communication and Exploitation of Results',
                startDate: projectData.projectIdea?.startDate || new Date().toISOString().split('T')[0],
                endDate: '', // will be filled by generator
                startMonth: 1,
                endMonth: durationMonths,
                tasks: [],
                milestones: [],
                deliverables: [],
                leader: '',
                participants: [],
              };

              augmentedWPs.splice(dissInsertIdx, 0, dissPlaceholder);

              // If PM was added, its index shifted by 1 due to splice
              if (missingPM) {
                // PM index was augmentedWPs.length - 1 before splice, now it's augmentedWPs.length - 1 again
                // But mandatoryIndicesToGenerate already has the old index, update it
                mandatoryIndicesToGenerate[mandatoryIndicesToGenerate.length - 1] = augmentedWPs.length - 1;
              }
              mandatoryIndicesToGenerate.push(dissInsertIdx);
            }

            // Renumber ALL WP ids sequentially
            augmentedWPs.forEach((wp, idx) => {
              wp.id = `WP${idx + 1}`;
            });

            console.warn(`[Activities] Adding missing mandatory WPs: ${missingNames.join(', ')} — generating only indices [${mandatoryIndicesToGenerate.join(', ')}]`);

           // Re-detect empty indices in the augmented array (safer approach)
            const finalIndicesToGenerate: number[] = [];
            augmentedWPs.forEach((wp: any, idx: number) => {
              const hasTasks = wp.tasks && Array.isArray(wp.tasks) && wp.tasks.length > 0
                && wp.tasks.some((t: any) => t.title && t.title.trim().length > 0);
              const hasMilestones = wp.milestones && Array.isArray(wp.milestones) && wp.milestones.length > 0;
              const hasDeliverableContent = wp.deliverables && wp.deliverables.length > 0
                && wp.deliverables.some((d: any) => d.title && d.title.trim().length > 0);
              if (!hasTasks || !hasMilestones || !hasDeliverableContent) {
                finalIndicesToGenerate.push(idx);
              }
            });

            generatedData = await generateActivitiesPerWP(
              { ...projectData, activities: augmentedWPs },
              language,
              'fill',
              (wpIndex, wpTotal, wpTitle) => {
                if (wpIndex === -1) {
                  setIsLoading(
                    language === 'si'
                      ? `Dodajam manjkajoče DS (${missingNames.join(' + ')})...`
                      : `Adding missing WPs (${missingNames.join(' + ')})...`
                  );
                } else {
                  setIsLoading(
                    language === 'si'
                      ? `Generiram DS ${wpIndex + 1}/${wpTotal}: ${wpTitle}...`
                      : `Generating WP ${wpIndex + 1}/${wpTotal}: ${wpTitle}...`
                  );
                }
              },
              augmentedWPs,           // existingScaffold
              finalIndicesToGenerate   // onlyIndices
            );

          } else if (emptyWPIndices.length > 0) {
            // ──────────────────────────────────────────────────────
            // ★ v3.9 FIX: FILL incomplete WPs via per-WP generator
            // Uses existingScaffold + onlyIndices for focused generation
            // ──────────────────────────────────────────────────────
            generatedData = await generateActivitiesPerWP(
              projectData,
              language,
              'fill',
              (wpIndex, wpTotal, wpTitle) => {
                if (wpIndex === -1) {
                  setIsLoading(
                    language === 'si'
                      ? `Dopolnjujem ${emptyWPIndices.length} nepopolnih DS...`
                      : `Filling ${emptyWPIndices.length} incomplete WPs...`
                  );
                } else {
                  setIsLoading(
                    language === 'si'
                      ? `Dopolnjujem DS ${wpIndex + 1}/${wpTotal}: ${wpTitle}...`
                      : `Filling WP ${wpIndex + 1}/${wpTotal}: ${wpTitle}...`
                  );
                }
              },
              existingWPs,      // existingScaffold — keep all existing WPs
              emptyWPIndices    // onlyIndices — generate ONLY the incomplete ones
            );

          } else if (mode === 'enhance') {
            // ──────────────────────────────────────────────────────
            // ENHANCE: All WPs have content — enhance via standard generation
            // ──────────────────────────────────────────────────────
            generatedData = await generateSectionContent(
              sectionKey,
              projectData,
              language,
              mode
            );

          } else {
            // ──────────────────────────────────────────────────────
            // All WPs complete, fill mode — nothing to do
            // ──────────────────────────────────────────────────────
            generatedData = existingWPs;
          }

                } else if (
          mode === 'fill' &&
          ['projectIdea', 'problemAnalysis', 'projectManagement'].includes(sectionKey) &&
          projectData[sectionKey] &&
          typeof projectData[sectionKey] === 'object' &&
          !Array.isArray(projectData[sectionKey])
        ) {
          // ──────────────────────────────────────────────────────
          // ★ v4.0: SMART OBJECT FILL — identify empty fields,
          // generate ONLY those, show user which fields are being filled
          // ──────────────────────────────────────────────────────
          const sectionData = projectData[sectionKey];
          const emptyFields: string[] = [];

          // Identify empty string fields (top level)
          for (const [key, val] of Object.entries(sectionData)) {
            if (typeof val === 'string' && val.trim().length === 0) {
              emptyFields.push(key);
            }
          }

          // Also check for missing expected fields from schema
          const expectedFields: Record<string, string[]> = {
            projectIdea: ['projectTitle', 'projectAcronym', 'mainAim', 'stateOfTheArt', 'proposedSolution'],
            problemAnalysis: [],
            projectManagement: ['description'],
          };
          const expected = expectedFields[sectionKey] || [];
          for (const field of expected) {
            if (!sectionData[field] || (typeof sectionData[field] === 'string' && sectionData[field].trim().length === 0)) {
              if (!emptyFields.includes(field)) {
                emptyFields.push(field);
              }
            }
          }

          // Also check nested objects (e.g., readinessLevels, policies)
          if (sectionKey === 'projectIdea') {
            // Check readinessLevels
            const rl = sectionData.readinessLevels;
            if (!rl || !rl.TRL || !rl.SRL || !rl.ORL || !rl.LRL) {
              if (!emptyFields.includes('readinessLevels')) {
                emptyFields.push('readinessLevels');
              }
            } else {
              // Check if any level has empty justification
              for (const level of ['TRL', 'SRL', 'ORL', 'LRL']) {
                if (rl[level] && typeof rl[level].justification === 'string' && rl[level].justification.trim().length === 0) {
                  if (!emptyFields.includes('readinessLevels')) {
                    emptyFields.push('readinessLevels');
                  }
                  break;
                }
              }
            }

            // Check policies
            const policies = sectionData.policies;
            if (!policies || !Array.isArray(policies) || policies.length === 0) {
              if (!emptyFields.includes('policies')) {
                emptyFields.push('policies');
              }
            }
          }

          if (emptyFields.length === 0) {
            // Nothing to fill — show modal
            setModalConfig({
              isOpen: true,
              title: language === 'si' ? 'Vse je izpolnjeno' : 'Everything is filled',
              message: language === 'si'
                ? 'Vsa polja v tem razdelku so že izpolnjena. Če želite izboljšati vsebino, uporabite možnost "Izboljšaj obstoječe".'
                : 'All fields in this section are already filled. To improve content, use the "Enhance existing" option.',
              confirmText: language === 'si' ? 'V redu' : 'OK',
              secondaryText: '',
              cancelText: '',
              onConfirm: () => closeModal(),
              onSecondary: null,
              onCancel: () => closeModal(),
            });
            generatedData = sectionData;
          } else {
            // Show which fields are being generated
            const fieldNames = emptyFields.join(', ');
            console.log(`[ObjectFill] ${sectionKey}: Empty fields detected: [${fieldNames}]`);
            setIsLoading(
              language === 'si'
                ? `Dopolnjujem ${emptyFields.length} praznih polj: ${fieldNames}...`
                : `Filling ${emptyFields.length} empty fields: ${fieldNames}...`
            );

            generatedData = await generateObjectFill(
              sectionKey,
              projectData,
              language,
              emptyFields
            );
          }

                } else if (mode === 'fill') {
          // ──────────────────────────────────────────────────────
          // ★ v4.0: UNIVERSAL SMART FILL for non-activities sections
          // Handles both OBJECT sections (projectIdea, problemAnalysis,
          // projectManagement) and ARRAY sections (generalObjectives,
          // specificObjectives, risks).
          // ──────────────────────────────────────────────────────
          const sectionData = projectData[sectionKey];

          if (!sectionData || (Array.isArray(sectionData) && sectionData.length === 0) || !hasDeepContent(sectionData)) {
            // ── No data at all → full regeneration ──
            console.log(`[SmartFill] ${sectionKey}: No data → full regeneration`);
            setIsLoading(
              language === 'si'
                ? `Generiram ${sectionKey} (ni obstoječih podatkov)...`
                : `Generating ${sectionKey} (no existing data)...`
            );
            generatedData = await generateSectionContent(
              sectionKey,
              projectData,
              language,
              'regenerate'
            );

          } else if (Array.isArray(sectionData)) {
            // ── Array section (generalObjectives, specificObjectives, risks) ──
            const emptyIndices: number[] = [];
            sectionData.forEach((item: any, index: number) => {
              if (!item || !hasDeepContent(item)) {
                emptyIndices.push(index);
              } else {
                const hasEmptyFields = Object.entries(item).some(([key, val]) => {
                  if (key === 'id') return false;
                  return typeof val === 'string' && (val as string).trim().length === 0;
                });
                if (hasEmptyFields) {
                  emptyIndices.push(index);
                }
              }
            });

            if (emptyIndices.length === 0) {
              // All items complete → show modal
              console.log(`[SmartFill] ${sectionKey}: All ${sectionData.length} items complete → nothing to fill`);
              setModalConfig({
                isOpen: true,
                title: language === 'si' ? 'Vse je izpolnjeno' : 'Everything is filled',
                message: language === 'si'
                  ? `Vsi elementi v razdelku "${sectionKey}" so že izpolnjeni. Za izboljšanje vsebine uporabite "Izboljšaj obstoječe".`
                  : `All items in "${sectionKey}" are already filled. To improve content, use "Enhance existing".`,
                confirmText: language === 'si' ? 'V redu' : 'OK',
                secondaryText: '',
                cancelText: '',
                onConfirm: () => closeModal(),
                onSecondary: null,
                onCancel: () => closeModal(),
              });
              generatedData = sectionData;
            } else {
              console.log(`[SmartFill] ${sectionKey}: ${emptyIndices.length} of ${sectionData.length} items need filling at indices [${emptyIndices.join(', ')}]`);
              setIsLoading(
                language === 'si'
                  ? `Dopolnjujem ${emptyIndices.length} od ${sectionData.length} elementov v ${sectionKey}...`
                  : `Filling ${emptyIndices.length} of ${sectionData.length} items in ${sectionKey}...`
              );
              generatedData = await generateTargetedFill(
                sectionKey,
                projectData,
                language,
                emptyIndices
              );
            }

          } else if (typeof sectionData === 'object') {
            // ── Object section (projectIdea, problemAnalysis, projectManagement) ──
            const emptyFields: string[] = [];

            // Deep check for empty fields based on section type
            if (sectionKey === 'projectIdea') {
              // Top-level string fields
              for (const field of ['projectTitle', 'projectAcronym', 'mainAim', 'stateOfTheArt', 'proposedSolution']) {
                const val = sectionData[field];
                if (!val || (typeof val === 'string' && val.trim().length === 0)) {
                  emptyFields.push(field);
                }
              }
              // Nested: readinessLevels
              const rl = sectionData.readinessLevels;
              if (!rl || !rl.TRL || !rl.SRL || !rl.ORL || !rl.LRL) {
                emptyFields.push('readinessLevels');
              } else {
                for (const level of ['TRL', 'SRL', 'ORL', 'LRL']) {
                  if (rl[level] && (!rl[level].justification || rl[level].justification.trim().length === 0)) {
                    if (!emptyFields.includes('readinessLevels')) emptyFields.push('readinessLevels');
                    break;
                  }
                }
              }
              // Nested: policies
              const policies = sectionData.policies;
              if (!policies || !Array.isArray(policies) || policies.length === 0) {
                emptyFields.push('policies');
              } else {
                const hasEmptyPolicy = policies.some((p: any) =>
                  !p.name || p.name.trim().length === 0 || !p.description || p.description.trim().length === 0
                );
                if (hasEmptyPolicy && !emptyFields.includes('policies')) {
                  emptyFields.push('policies');
                }
              }

            } else if (sectionKey === 'problemAnalysis') {
              // coreProblem
              const cp = sectionData.coreProblem;
              if (!cp || !cp.title || cp.title.trim().length === 0 || !cp.description || cp.description.trim().length === 0) {
                emptyFields.push('coreProblem');
              }
              // causes array
              const causes = sectionData.causes;
              if (!causes || !Array.isArray(causes) || causes.length === 0) {
                emptyFields.push('causes');
              } else {
                const hasEmptyCause = causes.some((c: any) =>
                  !c.title || c.title.trim().length === 0 || !c.description || c.description.trim().length === 0
                );
                if (hasEmptyCause && !emptyFields.includes('causes')) {
                  emptyFields.push('causes');
                }
              }
              // consequences array
              const consequences = sectionData.consequences;
              if (!consequences || !Array.isArray(consequences) || consequences.length === 0) {
                emptyFields.push('consequences');
              } else {
                const hasEmptyConseq = consequences.some((c: any) =>
                  !c.title || c.title.trim().length === 0 || !c.description || c.description.trim().length === 0
                );
                if (hasEmptyConseq && !emptyFields.includes('consequences')) {
                  emptyFields.push('consequences');
                }
              }

            } else if (sectionKey === 'projectManagement') {
              // description
              if (!sectionData.description || sectionData.description.trim().length === 0) {
                emptyFields.push('description');
              }
              // structure fields
              const structure = sectionData.structure;
              if (!structure) {
                emptyFields.push('structure');
              } else {
                for (const field of ['coordinator', 'steeringCommittee', 'advisoryBoard', 'wpLeaders']) {
                  if (!structure[field] || structure[field].trim().length === 0) {
                    if (!emptyFields.includes('structure')) emptyFields.push('structure');
                    break;
                  }
                }
              }

            } else {
              // Generic object: check all top-level string fields
              for (const [key, val] of Object.entries(sectionData)) {
                if (typeof val === 'string' && val.trim().length === 0) {
                  emptyFields.push(key);
                }
              }
            }

            if (emptyFields.length === 0) {
              console.log(`[SmartFill] ${sectionKey}: All fields complete → nothing to fill`);
              setModalConfig({
                isOpen: true,
                title: language === 'si' ? 'Vse je izpolnjeno' : 'Everything is filled',
                message: language === 'si'
                  ? `Vsa polja v razdelku "${sectionKey}" so že izpolnjena. Za izboljšanje vsebine uporabite "Izboljšaj obstoječe".`
                  : `All fields in "${sectionKey}" are already filled. To improve content, use "Enhance existing".`,
                confirmText: language === 'si' ? 'V redu' : 'OK',
                secondaryText: '',
                cancelText: '',
                onConfirm: () => closeModal(),
                onSecondary: null,
                onCancel: () => closeModal(),
              });
              generatedData = sectionData;
            } else {
              const fieldNames = emptyFields.join(', ');
              console.log(`[SmartFill] ${sectionKey}: Empty fields detected: [${fieldNames}]`);
              setIsLoading(
                language === 'si'
                  ? `Dopolnjujem ${emptyFields.length} praznih polj (${fieldNames})...`
                  : `Filling ${emptyFields.length} empty fields (${fieldNames})...`
              );
              generatedData = await generateObjectFill(
                sectionKey,
                projectData,
                language,
                emptyFields
              );
            }

          } else {
            // ── Fallback: unknown section type ──
            generatedData = await generateSectionContent(
              sectionKey,
              projectData,
              language,
              mode
            );
          }

        } else {
          // ──────────────────────────────────────────────────────
          // Non-activities, non-fill mode (regenerate, enhance)
          // ──────────────────────────────────────────────────────
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
