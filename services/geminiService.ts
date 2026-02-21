// services/geminiService.ts
// ═══════════════════════════════════════════════════════════════
// AI content generation service — THIN LAYER.
//
// THIS FILE CONTAINS ZERO CONTENT RULES.
// ALL rules come from services/Instructions.ts.
// This file is responsible ONLY for:
//  - Building project context strings
//  - Assembling prompts from Instructions.ts rule blocks
//  - Calling the AI provider
//  - Post-processing (JSON parsing, sanitization, merging)
//
// v5.7 — 2026-02-21 — RE-EXPORT detectProjectLanguage
//   - NEW: Added re-export of detectProjectLanguage for backward compatibility
//     (useProjectManager.ts and any future consumers can import from here)
//   - All previous v5.6 changes preserved.
//
// v5.6 — 2026-02-21 — CONSOLIDATED LANGUAGE DETECTION
//   - CHANGED: detectInputLanguageMismatch() now uses detectTextLanguage from utils.ts
//   - CHANGED: import updated to include detectTextLanguage
//   - All previous v5.5 changes preserved.
//
// v5.5 — 2026-02-21 — KNOWLEDGE BASE INTEGRATION
//   - NEW: import knowledgeBaseService
//   - NEW: getKnowledgeBaseContext() — loads and caches KB documents for AI context
//   - CHANGED: generateSectionContent() — KB context injected into every prompt
//   - CHANGED: generateActivitiesPerWP() — KB context injected into scaffold + WP prompts
//   - All previous v5.4 changes preserved.
//
// v5.4 — 2026-02-16 — SUB-SECTION GENERATION
//   - NEW: Schemas, mappings, and prompt focus for 9 sub-sections:
//     coreProblem, causes, consequences, projectTitleAcronym, mainAim,
//     stateOfTheArt, proposedSolution, readinessLevels, policies.
//   - NEW: SUB_SECTION_FOCUS instructions injected at beginning and end of prompt.
//   - NEW: buildTaskInstruction maps sub-keys to parent for task instruction reuse.
//   - NEW: Post-processing unwraps string sub-sections (mainAim, stateOfTheArt, proposedSolution).
//   - All previous v5.0 changes preserved.
//
// v5.0 — 2026-02-16 — PER-WP GENERATION + DATE FIX + SUMMARY FIX + ACRONYM
//   - NEW: generateActivitiesPerWP() — 2-phase generation: first scaffold
//     (WP ids, titles, date ranges), then each WP individually with full
//     context of previously generated WPs for cross-WP dependencies.
//   - NEW: calculateProjectEndDate() helper — avoids JavaScript Date
//     month-overflow bugs (e.g., Jan 31 + 1 month → Mar 3). Replaces
//     manual date calculation at ALL locations in the file.
//   - NEW: projectAcronym added to schemas.projectIdea (properties + required)
//   - FIXED: enforceTemporalIntegrity() guards against empty activities array.
//   - FIXED: generateTargetedFill() now calls sanitizeActivities() and
//     enforceTemporalIntegrity() when sectionKey is 'activities'.
//   - FIXED: generateProjectSummary() uses condensation-only prompt
//     without academicRules/humanRules. Summary rules injected directly.
//   - All previous changes preserved.
//
// v4.7 — 2026-02-15 — TARGETED FILL
// v4.6 — 2026-02-15 — TEMPORAL INTEGRITY ENFORCER
// v4.5 — 2026-02-14 — DYNAMIC MAX_TOKENS
// v4.4 — 2026-02-14 — DELIVERABLE TITLE SCHEMA
// v4.3 — 2026-02-14 — PROMPT ORDER + SCHEMA FIX
// v4.1 — 2026-02-14 — SINGLE SOURCE OF TRUTH REFACTOR
// ═══════════════════════════════════════════════════════════════

import { storageService } from './storageService.ts';
// ★ v5.5 [A]: Knowledge Base import
import { knowledgeBaseService } from './knowledgeBaseService.ts';
import {
  getAppInstructions,
  getFieldRule,
  getTranslationRules,
  getSummaryRules,
  getLanguageDirective,
  getLanguageMismatchNotice,
  getAcademicRigorRules,
  getHumanizationRules,
  getProjectTitleRules,
  getModeInstruction,
  getQualityGate,
  getSectionTaskInstruction,
  TEMPORAL_INTEGRITY_RULE
} from './Instructions.ts';
// ★ v5.6: Added detectTextLanguage import for consolidated language detection
import { detectProjectLanguage as detectLanguage, detectTextLanguage } from '../utils.ts';
import {
  generateContent,
  hasValidProviderKey,
  validateProviderKey,
  getProviderConfig,
  type AIProviderType
} from './aiProvider.ts';

// ─── BACKWARD COMPATIBILITY EXPORTS ─────────────────────────────

export const hasValidApiKey = hasValidProviderKey;

export const validateApiKey = async (apiKey: string): Promise<boolean> => {
  const provider = storageService.getAIProvider() || 'gemini';
  return validateProviderKey(provider, apiKey);
};

export const validateProviderApiKey = validateProviderKey;

// ★ v5.7: Re-export detectProjectLanguage for backward compatibility
export { detectProjectLanguage } from '../utils.ts';

// ─── SAFE RULES FORMATTER ────────────────────────────────────────

const formatRules = (rules: string | string[]): string => {
  if (Array.isArray(rules)) return rules.join('\n');
  if (typeof rules === 'string' && rules.trim().length > 0) return rules;
  return '';
};

const formatRulesAsList = (rules: string | string[]): string => {
  if (Array.isArray(rules)) return rules.join('\n- ');
  if (typeof rules === 'string' && rules.trim().length > 0) return rules;
  return '';
};

// ─── SAFE PROJECT END DATE CALCULATOR ────────────────────────────
// ★ v5.0: Avoids JavaScript Date month-overflow bugs
// (e.g., Jan 31 + 1 month → setMonth produces Mar 3 instead of Feb 28)

const calculateProjectEndDate = (startDateStr: string, durationMonths: number): string => {
  const parts = startDateStr.split('-').map(Number);
  const startYear = parts[0];
  const startMonth = parts[1] - 1; // 0-indexed
  const startDay = parts[2];

  let targetMonth = startMonth + durationMonths;
  const targetYear = startYear + Math.floor(targetMonth / 12);
  targetMonth = targetMonth % 12;

  // Days in the target month (day 0 of next month = last day of target month)
  const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const targetDay = Math.min(startDay, daysInTargetMonth);

  // Create date and subtract 1 day (project ends day before anniversary)
  const endDate = new Date(targetYear, targetMonth, targetDay);
  endDate.setDate(endDate.getDate() - 1);

  const y = endDate.getFullYear();
  const m = String(endDate.getMonth() + 1).padStart(2, '0');
  const d = String(endDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// ─── INPUT LANGUAGE DETECTION ────────────────────────────────────
// ★ v5.6 (2026-02-21): Consolidated language detection — uses shared detectTextLanguage

const detectInputLanguageMismatch = (
  projectData: any,
  uiLanguage: 'en' | 'si'
): string => {
  const sampleTexts: string[] = [];

  const collectStrings = (obj: any, depth = 0) => {
    if (depth > 3 || sampleTexts.length >= 5) return;
    if (typeof obj === 'string' && obj.length > 30) {
      sampleTexts.push(obj);
    } else if (typeof obj === 'object' && obj !== null) {
      for (const val of Object.values(obj)) {
        collectStrings(val, depth + 1);
        if (sampleTexts.length >= 5) break;
      }
    }
  };

  collectStrings(projectData?.problemAnalysis);
  collectStrings(projectData?.projectIdea);
  collectStrings(projectData?.objectives);

  if (sampleTexts.length === 0) return '';

  let mismatchCount = 0;
  const checked = Math.min(sampleTexts.length, 5);

  for (let i = 0; i < checked; i++) {
    const detected = detectTextLanguage(sampleTexts[i]);
    if (detected !== 'unknown' && detected !== uiLanguage) {
      mismatchCount++;
    }
  }

  if (mismatchCount > checked / 2) {
    return getLanguageMismatchNotice(
      uiLanguage === 'en' ? 'si' : 'en',
      uiLanguage
    );
  }

  return '';
};

// ─── SANITIZE PROJECT TITLE ─────────────────────────────────────

const sanitizeProjectTitle = (title: string): string => {
  if (!title || typeof title !== 'string') return title;

  let clean = title.trim();

  clean = clean
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1');

  clean = clean.replace(/^["'«»„""]|["'«»"""]$/g, '').trim();
  clean = clean.replace(/^(Project\s*Title|Naziv\s*projekta)\s*[:–—-]\s*/i, '').trim();

  const acronymPattern = /^[A-ZČŠŽ]{2,10}\s*[–—:-]\s*/;
  if (acronymPattern.test(clean)) {
    const withoutAcronym = clean.replace(acronymPattern, '').trim();
    if (withoutAcronym.length > 20) {
      clean = withoutAcronym;
    }
  }

  if (clean.length > 200) {
    clean = clean.substring(0, 200).replace(/\s+\S*$/, '').trim();
  }

  return clean;
};

// ─── STRIP MARKDOWN ──────────────────────────────────────────────

const stripMarkdown = (obj: any): any => {
  if (typeof obj === 'string') {
    return obj
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/`([^`]+)`/g, '$1');
  }
  if (Array.isArray(obj)) {
    return obj.map(item => stripMarkdown(item));
  }
  if (typeof obj === 'object' && obj !== null) {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      cleaned[key] = stripMarkdown(value);
    }
    return cleaned;
  }
  return obj;
};

// ═══════════════════════════════════════════════════════════════
// ★ v5.5 [B]: KNOWLEDGE BASE CONTEXT — loads KB docs for AI injection
// ═══════════════════════════════════════════════════════════════

let _kbCache: { orgId: string; texts: string; timestamp: number } | null = null;

const KB_CACHE_TTL = 60000; // 60 seconds

const getKnowledgeBaseContext = async (): Promise<string> => {
  try {
    const orgId = storageService.getActiveOrgId();
    if (!orgId) return '';

    if (_kbCache && _kbCache.orgId === orgId && (Date.now() - _kbCache.timestamp) < KB_CACHE_TTL) {
      return _kbCache.texts;
    }

    const documents = await knowledgeBaseService.getAllExtractedTexts(orgId);

    if (documents.length === 0) {
      _kbCache = { orgId, texts: '', timestamp: Date.now() };
      return '';
    }

    const header = '\u2550\u2550\u2550 MANDATORY KNOWLEDGE BASE DOCUMENTS \u2550\u2550\u2550\n' +
      'The following documents are uploaded by the organization admin.\n' +
      'You MUST consider this information when generating content.\n' +
      'Treat these as authoritative reference material.\n\n';

    const body = documents.map((doc, idx) =>
      `\u2500\u2500 Document ${idx + 1}: ${doc.fileName} \u2500\u2500\n${doc.text.substring(0, 8000)}`
    ).join('\n\n');

    const result = header + body;

    _kbCache = { orgId, texts: result, timestamp: Date.now() };

    console.log(`[KnowledgeBase] Injected ${documents.length} documents (${result.length} chars) into AI context`);

    return result;
  } catch (e) {
    console.warn('[KnowledgeBase] Failed to load KB context:', e);
    return '';
  }
};

// ─── PROJECT CONTEXT BUILDER ─────────────────────────────────────

const getContext = (projectData: any): string => {
  const sections: string[] = [];

  const pa = projectData.problemAnalysis;
  if (pa?.coreProblem?.title || pa?.coreProblem?.description ||
      pa?.causes?.length > 0 || pa?.consequences?.length > 0) {
    sections.push(`Problem Analysis:\n${JSON.stringify(pa, null, 2)}`);
  }

  const pi = projectData.projectIdea;
  if (pi?.mainAim || pi?.stateOfTheArt || pi?.proposedSolution || pi?.projectTitle) {
    let endDateStr = '';
    if (pi?.startDate && pi?.durationMonths) {
      endDateStr = calculateProjectEndDate(pi.startDate, pi.durationMonths);
    }
    const piWithDates = {
      ...pi,
      _calculatedEndDate: endDateStr,
      _projectTimeframe: pi?.startDate && endDateStr
        ? `Project runs from ${pi.startDate} to ${endDateStr} (${pi.durationMonths} months). ALL tasks, milestones, and deliverables MUST fall within this timeframe. NO exceptions.`
        : ''
    };
    sections.push(`Project Idea:\n${JSON.stringify(piWithDates, null, 2)}`);
  }

  if (projectData.generalObjectives?.length > 0)
    sections.push(`General Objectives:\n${JSON.stringify(projectData.generalObjectives, null, 2)}`);
  if (projectData.specificObjectives?.length > 0)
    sections.push(`Specific Objectives:\n${JSON.stringify(projectData.specificObjectives, null, 2)}`);
  if (projectData.activities?.length > 0)
    sections.push(`Activities (Work Packages):\n${JSON.stringify(projectData.activities, null, 2)}`);
  if (projectData.outputs?.length > 0)
    sections.push(`Outputs:\n${JSON.stringify(projectData.outputs, null, 2)}`);
  if (projectData.outcomes?.length > 0)
    sections.push(`Outcomes:\n${JSON.stringify(projectData.outcomes, null, 2)}`);
  if (projectData.impacts?.length > 0)
    sections.push(`Impacts:\n${JSON.stringify(projectData.impacts, null, 2)}`);

  return sections.length > 0
    ? `Here is the current project information (Context):\n${sections.join('\n')}`
    : 'No project data available yet.';
};

// ─── JSON SCHEMA TEXT INSTRUCTION (for OpenRouter) ───────────────

const schemaToTextInstruction = (schema: any): string => {
  try {
    const typeToString = (t: any): string => {
      if (!t) return 'string';
      if (typeof t === 'string') return t.toLowerCase();
      const str = String(t);
      return str ? str.toLowerCase() : 'string';
    };

    const simplify = (s: any): any => {
      if (!s) return 'any';
      const sType = typeToString(s.type);
      if (sType === 'object') {
        const props: any = {};
        if (s.properties) {
          for (const [key, val] of Object.entries(s.properties)) {
            props[key] = simplify(val);
          }
        }
        return { type: 'object', properties: props, required: s.required || [] };
      }
      if (sType === 'array') return { type: 'array', items: simplify(s.items) };
      if (s.enum) return { type: sType, enum: s.enum };
      return sType;
    };

    return `\n\nRESPONSE JSON SCHEMA (you MUST follow this structure exactly):\n${JSON.stringify(simplify(schema), null, 2)}\n`;
  } catch (e) {
    console.warn('[schemaToTextInstruction] Failed to convert schema:', e);
    return '';
  }
};

// ─── JSON SCHEMAS ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// v5.0 FIX [2A + 2B]: projectAcronym added to projectIdea schema
// ═══════════════════════════════════════════════════════════════

import { Type } from "@google/genai";

const problemNodeSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    description: { type: Type.STRING },
  },
  required: ['title', 'description']
};

const readinessLevelValueSchema = {
  type: Type.OBJECT,
  properties: {
    level: { type: Type.INTEGER },
    justification: { type: Type.STRING }
  },
  required: ['level', 'justification']
};

const schemas: Record<string, any> = {
  problemAnalysis: {
    type: Type.OBJECT,
    properties: {
      coreProblem: problemNodeSchema,
      causes: { type: Type.ARRAY, items: problemNodeSchema },
      consequences: { type: Type.ARRAY, items: problemNodeSchema }
    },
    required: ['coreProblem', 'causes', 'consequences']
  },
  projectIdea: {
    type: Type.OBJECT,
    properties: {
      projectTitle: { type: Type.STRING },
      projectAcronym: { type: Type.STRING },
      mainAim: { type: Type.STRING },
      stateOfTheArt: { type: Type.STRING },
      proposedSolution: { type: Type.STRING },
      policies: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: { name: { type: Type.STRING }, description: { type: Type.STRING } },
          required: ['name', 'description']
        }
      },
      readinessLevels: {
        type: Type.OBJECT,
        properties: {
          TRL: readinessLevelValueSchema,
          SRL: readinessLevelValueSchema,
          ORL: readinessLevelValueSchema,
          LRL: readinessLevelValueSchema,
        },
        required: ['TRL', 'SRL', 'ORL', 'LRL']
      }
    },
    required: ['projectTitle', 'projectAcronym', 'mainAim', 'stateOfTheArt', 'proposedSolution', 'policies', 'readinessLevels']
  },
  objectives: {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        indicator: { type: Type.STRING }
      },
      required: ['title', 'description', 'indicator']
    }
  },
  projectManagement: {
    type: Type.OBJECT,
    properties: {
      description: { type: Type.STRING },
      structure: {
        type: Type.OBJECT,
        properties: {
          coordinator: { type: Type.STRING },
          steeringCommittee: { type: Type.STRING },
          advisoryBoard: { type: Type.STRING },
          wpLeaders: { type: Type.STRING }
        },
        required: ['coordinator', 'steeringCommittee', 'wpLeaders']
      }
    },
    required: ['description', 'structure']
  },
  activities: {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        title: { type: Type.STRING },
        tasks: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              startDate: { type: Type.STRING },
              endDate: { type: Type.STRING },
              dependencies: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    predecessorId: { type: Type.STRING },
                    type: { type: Type.STRING, enum: ['FS', 'SS', 'FF', 'SF'] }
                  },
                  required: ['predecessorId', 'type']
                }
              }
            },
            required: ['id', 'title', 'description', 'startDate', 'endDate']
          }
        },
        milestones: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              description: { type: Type.STRING },
              date: { type: Type.STRING }
            },
            required: ['id', 'description', 'date']
          }
        },
        deliverables: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              indicator: { type: Type.STRING }
            },
            required: ['id', 'title', 'description', 'indicator']
          }
        }
      },
      required: ['id', 'title', 'tasks', 'milestones', 'deliverables']
    }
  },
  results: {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        indicator: { type: Type.STRING }
      },
      required: ['title', 'description', 'indicator']
    }
  },
  risks: {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        category: { type: Type.STRING, enum: ['technical', 'social', 'economic', 'environmental'] },
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        likelihood: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
        impact: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
        mitigation: { type: Type.STRING }
      },
      required: ['id', 'category', 'title', 'description', 'likelihood', 'impact', 'mitigation']
    }
  },
  kers: {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        exploitationStrategy: { type: Type.STRING }
      },
      required: ['id', 'title', 'description', 'exploitationStrategy']
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // ★ v5.4: SUB-SECTION SCHEMAS — for per-subsection generation
  // ═══════════════════════════════════════════════════════════════
  coreProblem: problemNodeSchema,
  causes: { type: Type.ARRAY, items: problemNodeSchema },
  consequences: { type: Type.ARRAY, items: problemNodeSchema },
  projectTitleAcronym: {
    type: Type.OBJECT,
    properties: {
      projectTitle: { type: Type.STRING },
      projectAcronym: { type: Type.STRING }
    },
    required: ['projectTitle', 'projectAcronym']
  },
  mainAim: {
    type: Type.OBJECT,
    properties: { mainAim: { type: Type.STRING } },
    required: ['mainAim']
  },
  stateOfTheArt: {
    type: Type.OBJECT,
    properties: { stateOfTheArt: { type: Type.STRING } },
    required: ['stateOfTheArt']
  },
  proposedSolution: {
    type: Type.OBJECT,
    properties: { proposedSolution: { type: Type.STRING } },
    required: ['proposedSolution']
  },
  readinessLevels: {
    type: Type.OBJECT,
    properties: {
      TRL: readinessLevelValueSchema,
      SRL: readinessLevelValueSchema,
      ORL: readinessLevelValueSchema,
      LRL: readinessLevelValueSchema,
    },
    required: ['TRL', 'SRL', 'ORL', 'LRL']
  },
  policies: {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: { name: { type: Type.STRING }, description: { type: Type.STRING } },
      required: ['name', 'description']
    }
  }
};

// ─── MAPPINGS ────────────────────────────────────────────────────
// ★ v5.4: Added sub-section mappings

const SECTION_TO_CHAPTER: Record<string, string> = {
  problemAnalysis: 'chapter1_problemAnalysis',
  projectIdea: 'chapter2_projectIdea',
  generalObjectives: 'chapter3_4_objectives',
  specificObjectives: 'chapter3_4_objectives',
  projectManagement: 'chapter5_activities',
  activities: 'chapter5_activities',
  risks: 'chapter5_activities',
  outputs: 'chapter6_results',
  outcomes: 'chapter6_results',
  impacts: 'chapter6_results',
  kers: 'chapter6_results',
  expectedResults: 'chapter6_results',
  // ★ v5.4: Sub-section mappings
  coreProblem: 'chapter1_problemAnalysis',
  causes: 'chapter1_problemAnalysis',
  consequences: 'chapter1_problemAnalysis',
  projectTitleAcronym: 'chapter2_projectIdea',
  mainAim: 'chapter2_projectIdea',
  stateOfTheArt: 'chapter2_projectIdea',
  proposedSolution: 'chapter2_projectIdea',
  readinessLevels: 'chapter2_projectIdea',
  policies: 'chapter2_projectIdea',
};

const SECTION_TO_SCHEMA: Record<string, string> = {
  problemAnalysis: 'problemAnalysis', projectIdea: 'projectIdea',
  generalObjectives: 'objectives', specificObjectives: 'objectives',
  projectManagement: 'projectManagement', activities: 'activities',
  outputs: 'results', outcomes: 'results', impacts: 'results',
  risks: 'risks', kers: 'kers',
  expectedResults: 'results',
  // ★ v5.4: Sub-section schema mappings
  coreProblem: 'coreProblem', causes: 'causes', consequences: 'consequences',
  projectTitleAcronym: 'projectTitleAcronym', mainAim: 'mainAim',
  stateOfTheArt: 'stateOfTheArt', proposedSolution: 'proposedSolution',
  readinessLevels: 'readinessLevels', policies: 'policies',
};

// ─── HELPERS ─────────────────────────────────────────────────────

const isValidDate = (d: any): boolean => d instanceof Date && !isNaN(d.getTime());

const sanitizeActivities = (activities: any[]): any[] => {
  const taskMap = new Map<string, { startDate: Date; endDate: Date }>();
  activities.forEach(wp => {
    if (wp.tasks) {
      wp.tasks.forEach((task: any) => {
        if (task.id && task.startDate && task.endDate) {
          taskMap.set(task.id, { startDate: new Date(task.startDate), endDate: new Date(task.endDate) });
        }
      });
    }
  });
  activities.forEach(wp => {
    if (wp.tasks) {
      wp.tasks.forEach((task: any) => {
        if (task.dependencies && Array.isArray(task.dependencies)) {
          task.dependencies.forEach((dep: any) => {
            const pred = taskMap.get(dep.predecessorId);
            const curr = taskMap.get(task.id);
            if (pred && curr && isValidDate(pred.startDate) && isValidDate(pred.endDate) && isValidDate(curr.startDate)) {
              if (dep.type === 'FS' && curr.startDate <= pred.endDate) dep.type = 'SS';
            }
          });
        }
      });
    }
  });
  return activities;
};

// ═══════════════════════════════════════════════════════════════
// ★ v4.6: TEMPORAL INTEGRITY ENFORCER (post-processing)
// ═══════════════════════════════════════════════════════════════

const enforceTemporalIntegrity = (activities: any[], projectData: any): any[] => {
  const startStr = projectData.projectIdea?.startDate;
  const months = projectData.projectIdea?.durationMonths || 24;

  if (!startStr) return activities;
  if (!activities || activities.length === 0) return activities;

  const startISO = startStr;
  const endISO = calculateProjectEndDate(startStr, months);
  const projectStart = new Date(startISO + 'T00:00:00Z');
  const projectEnd = new Date(endISO + 'T00:00:00Z');

  console.log(`[TemporalIntegrity] Enforcing project envelope: ${startISO} → ${endISO} (${months} months)`);

  let fixCount = 0;

  activities.forEach((wp) => {
    if (wp.tasks && Array.isArray(wp.tasks)) {
      wp.tasks.forEach((task: any) => {
        if (task.startDate) {
          const taskStart = new Date(task.startDate);
          if (taskStart < projectStart) {
            console.warn(`[TemporalIntegrity] FIX: ${task.id} startDate ${task.startDate} → ${startISO} (before project start)`);
            task.startDate = startISO;
            fixCount++;
          }
        }
        if (task.endDate) {
          const taskEnd = new Date(task.endDate);
          if (taskEnd > projectEnd) {
            console.warn(`[TemporalIntegrity] FIX: ${task.id} endDate ${task.endDate} → ${endISO} (after project end)`);
            task.endDate = endISO;
            fixCount++;
          }
        }
        if (task.startDate && task.endDate && task.startDate > task.endDate) {
          console.warn(`[TemporalIntegrity] FIX: ${task.id} startDate > endDate after clamping → setting startDate = endDate`);
          task.startDate = task.endDate;
          fixCount++;
        }
      });
    }

    if (wp.milestones && Array.isArray(wp.milestones)) {
      wp.milestones.forEach((ms: any) => {
        if (ms.date) {
          const msDate = new Date(ms.date);
          if (msDate < projectStart) {
            console.warn(`[TemporalIntegrity] FIX: milestone ${ms.id} date ${ms.date} → ${startISO}`);
            ms.date = startISO;
            fixCount++;
          }
          if (msDate > projectEnd) {
            console.warn(`[TemporalIntegrity] FIX: milestone ${ms.id} date ${ms.date} → ${endISO}`);
            ms.date = endISO;
            fixCount++;
          }
        }
      });
    }
  });

  if (activities.length >= 2) {
    const pmWP = activities[activities.length - 1];
    const dissWP = activities[activities.length - 2];

    [pmWP, dissWP].forEach((wp) => {
      if (wp.tasks && wp.tasks.length > 0) {
        const sorted = [...wp.tasks].sort((a: any, b: any) =>
          new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
        );
        if (sorted[0].startDate !== startISO) {
          console.warn(`[TemporalIntegrity] FIX: ${wp.id} first task startDate → ${startISO}`);
          sorted[0].startDate = startISO;
          fixCount++;
        }
        const lastTask = sorted[sorted.length - 1];
        if (lastTask.endDate !== endISO) {
          console.warn(`[TemporalIntegrity] FIX: ${wp.id} last task endDate → ${endISO}`);
          lastTask.endDate = endISO;
          fixCount++;
        }
      }
    });
  }

  if (fixCount > 0) {
    console.log(`[TemporalIntegrity] Applied ${fixCount} date corrections.`);
  } else {
    console.log(`[TemporalIntegrity] All dates within envelope. No corrections needed.`);
  }

  return activities;
};

// ─── SMART MERGE ─────────────────────────────────────────────────

const smartMerge = (original: any, generated: any): any => {
  if (original === undefined || original === null) return generated;
  if (generated === undefined || generated === null) return original;
  if (typeof original === 'string') return original.trim().length > 0 ? original : generated;
  if (Array.isArray(original) && Array.isArray(generated)) {
    const length = Math.max(original.length, generated.length);
    const mergedArray: any[] = [];
    for (let i = 0; i < length; i++) {
      mergedArray.push(i < original.length ? smartMerge(original[i], generated[i]) : generated[i]);
    }
    return mergedArray;
  }
  if (typeof original === 'object' && typeof generated === 'object') {
    const mergedObj = { ...generated };
    for (const key in original) {
      if (Object.prototype.hasOwnProperty.call(original, key)) {
        mergedObj[key] = smartMerge(original[key], generated?.[key]);
      }
    }
    return mergedObj;
  }
  return original !== null && original !== undefined ? original : generated;
};

// ─── RULES ASSEMBLER ─────────────────────────────────────────────

const getRulesForSection = (sectionKey: string, language: 'en' | 'si'): string => {
  const instructions = getAppInstructions(language);
  const chapterKey = SECTION_TO_CHAPTER[sectionKey];
  if (chapterKey && instructions.CHAPTERS?.[chapterKey]) {
    const chapterContent = instructions.CHAPTERS[chapterKey];
    if (typeof chapterContent === 'string' && chapterContent.trim().length > 0) {
      const header = language === 'si' ? 'PODROBNA PRAVILA ZA TO POGLAVJE' : 'DETAILED CHAPTER RULES';
      return `\n${header}:\n${chapterContent}\n`;
    }
    if (typeof chapterContent === 'object' && Array.isArray(chapterContent.RULES) && chapterContent.RULES.length > 0) {
      const header = language === 'si' ? 'STROGA PRAVILA ZA TA RAZDELEK' : 'STRICT RULES FOR THIS SECTION';
      return `\n${header}:\n- ${chapterContent.RULES.join('\n- ')}\n`;
    }
  }
  return '';
};

// ─── TASK INSTRUCTION BUILDER ────────────────────────────────────
// ★ v5.4: Maps sub-section keys to parent for task instruction lookup

const buildTaskInstruction = (
  sectionKey: string,
  projectData: any,
  language: 'en' | 'si'
): string => {
  const placeholders: Record<string, string> = {};

  const SUB_TO_PARENT_TASK: Record<string, string> = {
    coreProblem: 'problemAnalysis', causes: 'problemAnalysis', consequences: 'problemAnalysis',
    projectTitleAcronym: 'projectIdea', mainAim: 'projectIdea', stateOfTheArt: 'projectIdea',
    proposedSolution: 'projectIdea', readinessLevels: 'projectIdea', policies: 'projectIdea',
  };

  const effectiveKey = SUB_TO_PARENT_TASK[sectionKey] || sectionKey;

  switch (effectiveKey) {
    case 'problemAnalysis': {
      const cp = projectData.problemAnalysis?.coreProblem;
      const titleStr = cp?.title?.trim() || '';
      const descStr = cp?.description?.trim() || '';
      const contextParts: string[] = [];
      if (titleStr) contextParts.push(language === 'si' ? `Naslov: "${titleStr}"` : `Title: "${titleStr}"`);
      if (descStr) contextParts.push(language === 'si' ? `Opis: "${descStr}"` : `Description: "${descStr}"`);
      placeholders.userInput = contextParts.length > 0
        ? contextParts.join('\n')
        : (language === 'si' ? '(uporabnik še ni vnesel podatkov)' : '(no user input yet)');
      break;
    }

    case 'projectIdea': {
      const userTitle = projectData.projectIdea?.projectTitle?.trim() || '';
      if (userTitle) {
        placeholders.titleContext = language === 'si'
          ? `UPORABNIKOV VNOS ZA NAZIV PROJEKTA: "${userTitle}"\nPRAVILA ZA NAZIV:\n- Če je uporabnikov vnos primeren (30–200 znakov, imenski izraz, brez akronima), ga OHRANI NESPREMENJENO.\n- Če je uporabnikov vnos prekratek ali predolg ali vsebuje glagol, ga IZBOLJŠAJ v skladu s pravili za naziv projekta zgoraj.\n- NIKOLI ne generiraj popolnoma drugačnega naziva — ostani na temi uporabnikovega vnosa.\n\n`
          : `USER INPUT FOR PROJECT TITLE: "${userTitle}"\nTITLE RULES:\n- If the user's input is acceptable (30–200 chars, noun phrase, no acronym), KEEP IT UNCHANGED.\n- If the user's input is too short, too long, or contains a verb, IMPROVE it following the project title rules above.\n- NEVER generate a completely different title — stay on the user's topic.\n\n`;
      } else {
        placeholders.titleContext = '';
      }
      break;
    }

    case 'activities': {
      const today = new Date().toISOString().split('T')[0];
      placeholders.projectStart = projectData.projectIdea?.startDate || today;
      const months = projectData.projectIdea?.durationMonths || 24;
      placeholders.projectEnd = calculateProjectEndDate(placeholders.projectStart, months);
      placeholders.projectDurationMonths = String(months);
      break;
    }
  }

  return getSectionTaskInstruction(effectiveKey, language, placeholders);
};

// ─── PROMPT BUILDER ──────────────────────────────────────────────
// ★ v5.4: Added SUB_SECTION_FOCUS for sub-section specific prompts

const getPromptAndSchemaForSection = (
  sectionKey: string,
  projectData: any,
  language: 'en' | 'si' = 'en',
  mode: string = 'regenerate',
  currentSectionData: any = null
) => {
  const context = getContext(projectData);
  const instructions = getAppInstructions(language);
  const globalRules = formatRules(instructions.GLOBAL_RULES);
  const sectionRules = getRulesForSection(sectionKey, language);
  const schemaKey = SECTION_TO_SCHEMA[sectionKey];
  const schema = schemas[schemaKey];

  if (!schema) throw new Error(`Unknown section key: ${sectionKey}`);

  const config = getProviderConfig();
  const needsTextSchema = config.provider !== 'gemini';
  const textSchema = needsTextSchema ? schemaToTextInstruction(schema) : '';

  const langDirective = getLanguageDirective(language);
  const langMismatchNotice = detectInputLanguageMismatch(projectData, language);
  const academicRules = getAcademicRigorRules(language);
  const humanRules = getHumanizationRules(language);
  const titleRules = (sectionKey === 'projectIdea' || sectionKey === 'projectTitleAcronym') ? getProjectTitleRules(language) : '';

  let modeInstruction = getModeInstruction(mode, language);
  if ((mode === 'fill' || mode === 'enhance') && currentSectionData) {
    const dataHeader = language === 'si' ? 'Obstoječi podatki' : 'Existing data';
    modeInstruction = `${modeInstruction}\n${dataHeader}: ${JSON.stringify(currentSectionData)}`;
  }

  const globalRulesHeader = language === 'si' ? 'GLOBALNA PRAVILA' : 'GLOBAL RULES';
  const taskInstruction = buildTaskInstruction(sectionKey, projectData, language);
  const qualityGate = getQualityGate(sectionKey, language);

  // ★ v4.6: For activities, inject TEMPORAL_INTEGRITY_RULE at BEGINNING and END
  let temporalRuleBlock = '';
  if (sectionKey === 'activities') {
    const today = new Date().toISOString().split('T')[0];
    const pStart = projectData.projectIdea?.startDate || today;
    const pMonths = projectData.projectIdea?.durationMonths || 24;
    const pEnd = calculateProjectEndDate(pStart, pMonths);

    temporalRuleBlock = (TEMPORAL_INTEGRITY_RULE[language] || TEMPORAL_INTEGRITY_RULE.en)
      .replace(/\{\{projectStart\}\}/g, pStart)
      .replace(/\{\{projectEnd\}\}/g, pEnd)
      .replace(/\{\{projectDurationMonths\}\}/g, String(pMonths));
  }

  // ★ v5.4: Sub-section focus instruction
  const SUB_SECTION_FOCUS: Record<string, Record<string, string>> = {
    coreProblem: {
      en: 'FOCUS: Generate ONLY the Core Problem (title + description). Do NOT generate causes or consequences.',
      si: 'FOKUS: Generiraj SAMO Osrednji problem (naslov + opis). NE generiraj vzrokov ali posledic.'
    },
    causes: {
      en: 'FOCUS: Generate ONLY the Causes array (4-6 causes, each with title + description + citation). Do NOT generate core problem or consequences.',
      si: 'FOKUS: Generiraj SAMO array Vzrokov (4-6 vzrokov, vsak z naslovom + opisom + citatom). NE generiraj osrednjega problema ali posledic.'
    },
    consequences: {
      en: 'FOCUS: Generate ONLY the Consequences array (4-6 consequences, each with title + description + citation). Do NOT generate core problem or causes.',
      si: 'FOKUS: Generiraj SAMO array Posledic (4-6 posledic, vsaka z naslovom + opisom + citatom). NE generiraj osrednjega problema ali vzrokov.'
    },
    projectTitleAcronym: {
      en: 'FOCUS: Generate ONLY projectTitle and projectAcronym. Follow the PROJECT TITLE RULES and ACRONYM RULES strictly. Return JSON object with exactly 2 fields.',
      si: 'FOKUS: Generiraj SAMO projectTitle in projectAcronym. Strogo upoštevaj PRAVILA ZA NAZIV PROJEKTA in PRAVILA ZA AKRONIM. Vrni JSON objekt z natanko 2 poljema.'
    },
    mainAim: {
      en: 'FOCUS: Generate ONLY the Main Aim — one comprehensive sentence starting with an infinitive verb. Return JSON object: { "mainAim": "..." }',
      si: 'FOKUS: Generiraj SAMO Glavni cilj — en celovit stavek, ki se začne z nedoločnikom. Vrni JSON objekt: { "mainAim": "..." }'
    },
    stateOfTheArt: {
      en: 'FOCUS: Generate ONLY the State of the Art — a thorough analysis of the current situation with ≥3 citations from real sources. Return JSON object: { "stateOfTheArt": "..." }',
      si: 'FOKUS: Generiraj SAMO Stanje tehnike — temeljito analizo trenutnega stanja z ≥3 citati iz realnih virov. Vrni JSON objekt: { "stateOfTheArt": "..." }'
    },
    proposedSolution: {
      en: 'FOCUS: Generate ONLY the Proposed Solution — start with 5-8 sentence introduction, then phases with plain text headers. Return JSON object: { "proposedSolution": "..." }',
      si: 'FOKUS: Generiraj SAMO Predlagano rešitev — začni s 5-8 stavčnim uvodom, nato faze z navadnimi besedilnimi naslovi. Vrni JSON objekt: { "proposedSolution": "..." }'
    },
    readinessLevels: {
      en: 'FOCUS: Generate ONLY the Readiness Levels (TRL, SRL, ORL, LRL) — each with a numeric level and justification. Return JSON object with exactly 4 sub-objects.',
      si: 'FOKUS: Generiraj SAMO Stopnje pripravljenosti (TRL, SRL, ORL, LRL) — vsaka s številčno stopnjo in utemeljitvijo. Vrni JSON objekt z natanko 4 pod-objekti.'
    },
    policies: {
      en: 'FOCUS: Generate ONLY the EU Policies array (3-5 policies, each with name + description). Do NOT generate other project idea fields.',
      si: 'FOKUS: Generiraj SAMO array EU politik (3-5 politik, vsaka z imenom + opisom). NE generiraj drugih polj projektne ideje.'
    }
  };

  const focusInstruction = SUB_SECTION_FOCUS[sectionKey]?.[language] || '';

  const prompt = [
    focusInstruction ? `★★★ ${focusInstruction} ★★★\n` : '',
    temporalRuleBlock ? `${temporalRuleBlock}\n` : '',
    langDirective,
    langMismatchNotice ? `\n${langMismatchNotice}\n` : '',
    `\n${globalRulesHeader}:\n${globalRules}`,
    sectionRules,
    academicRules ? `\n${academicRules}` : '',
    humanRules ? `\n${humanRules}` : '',
    titleRules ? `\n${titleRules}` : '',
    `\n${context}`,
    taskInstruction ? `\n${taskInstruction}` : '',
    modeInstruction ? `\n${modeInstruction}` : '',
    textSchema,
    qualityGate ? `\n${qualityGate}` : '',
    temporalRuleBlock ? `\n${temporalRuleBlock}` : '',
    focusInstruction ? `\n★★★ REMINDER: ${focusInstruction} ★★★` : ''
  ].filter(Boolean).join('\n');

  return { prompt, schema: needsTextSchema ? null : schema };
};

// ═══════════════════════════════════════════════════════════════
// PUBLIC API: SECTION GENERATION
// ═══════════════════════════════════════════════════════════════

export const generateSectionContent = async (
  sectionKey: string,
  projectData: any,
  language: 'en' | 'si' = 'en',
  mode: string = 'regenerate',
  currentSectionData: any = null
): Promise<any> => {
  const { prompt, schema } = getPromptAndSchemaForSection(sectionKey, projectData, language, mode, currentSectionData);

  // ★ v5.5: Inject Knowledge Base context
  const kbContext = await getKnowledgeBaseContext();
  const fullPrompt = kbContext ? `${kbContext}\n\n${prompt}` : prompt;

  const result = await generateContent({
    prompt: fullPrompt,
    schema: schema || undefined,
    jsonMode: true,
    sectionKey
  });

  let parsed: any;
  try {
    const jsonStr = result.text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    console.error('[geminiService] Failed to parse AI response as JSON:', e);
    throw new Error('AI response was not valid JSON');
  }

  // Strip markdown from all string values
  parsed = stripMarkdown(parsed);

  // ★ v5.4: Post-process sub-sections — unwrap string values
  if (['mainAim', 'stateOfTheArt', 'proposedSolution'].includes(sectionKey)) {
    if (parsed && typeof parsed === 'object' && parsed[sectionKey]) {
      return parsed[sectionKey];
    }
  }

  // ★ v5.0: Sanitize project title
  if (sectionKey === 'projectIdea' && parsed?.projectTitle) {
    parsed.projectTitle = sanitizeProjectTitle(parsed.projectTitle);
  }
  if (sectionKey === 'projectTitleAcronym' && parsed?.projectTitle) {
    parsed.projectTitle = sanitizeProjectTitle(parsed.projectTitle);
  }

  // ★ v4.6: For activities, enforce temporal integrity
  if (sectionKey === 'activities' && Array.isArray(parsed)) {
    parsed = sanitizeActivities(parsed);
    parsed = enforceTemporalIntegrity(parsed, projectData);
  }

  // ★ Fill mode: merge with existing data
  if (mode === 'fill' && currentSectionData) {
    return smartMerge(currentSectionData, parsed);
  }

  return parsed;
};

// ═══════════════════════════════════════════════════════════════
// PUBLIC API: PER-WP ACTIVITIES GENERATION
// ═══════════════════════════════════════════════════════════════

export const generateActivitiesPerWP = async (
  projectData: any,
  language: 'en' | 'si' = 'en',
  mode: string = 'regenerate',
  existingActivities: any[] = [],
  onProgress?: (msg: string) => void
): Promise<any[]> => {
  const context = getContext(projectData);
  const instructions = getAppInstructions(language);
  const globalRules = formatRules(instructions.GLOBAL_RULES);
  const sectionRules = getRulesForSection('activities', language);
  const academicRules = getAcademicRigorRules(language);
  const humanRules = getHumanizationRules(language);

  const today = new Date().toISOString().split('T')[0];
  const pStart = projectData.projectIdea?.startDate || today;
  const pMonths = projectData.projectIdea?.durationMonths || 24;
  const pEnd = calculateProjectEndDate(pStart, pMonths);

  const temporalRule = (TEMPORAL_INTEGRITY_RULE[language] || TEMPORAL_INTEGRITY_RULE.en)
    .replace(/\{\{projectStart\}\}/g, pStart)
    .replace(/\{\{projectEnd\}\}/g, pEnd)
    .replace(/\{\{projectDurationMonths\}\}/g, String(pMonths));

  // ★ v5.5: Knowledge Base context
  const kbContext = await getKnowledgeBaseContext();

  // PHASE 1: Generate scaffold (WP IDs, titles, date ranges)
  const scaffoldPrompt = [
    kbContext || '',
    temporalRule,
    getLanguageDirective(language),
    `\n${language === 'si' ? 'GLOBALNA PRAVILA' : 'GLOBAL RULES'}:\n${globalRules}`,
    sectionRules,
    academicRules ? `\n${academicRules}` : '',
    humanRules ? `\n${humanRules}` : '',
    `\n${context}`,
    `\n${language === 'si'
      ? `NALOGA: Ustvari SCAFFOLD (ogrodje) za delovne pakete. Vrni JSON array z objekti, ki imajo SAMO: id, title, dateRange (startDate, endDate). Ne generiraj nalog, mejnikov ali deliverables.
OBVEZNA WP-ja: Predzadnji WP MORA biti "Dissemination, Communication & Exploitation", zadnji WP MORA biti "Project Management & Coordination". Oba morata trajati celotno trajanje projekta (${pStart} do ${pEnd}).
Skupno 5-8 WP-jev.`
      : `TASK: Create a SCAFFOLD for work packages. Return a JSON array of objects with ONLY: id, title, dateRange (startDate, endDate). Do NOT generate tasks, milestones, or deliverables.
MANDATORY WPs: Second-to-last WP MUST be "Dissemination, Communication & Exploitation", last WP MUST be "Project Management & Coordination". Both must span the full project duration (${pStart} to ${pEnd}).
Total 5-8 WPs.`}`,
    `\n${temporalRule}`
  ].filter(Boolean).join('\n');

  if (onProgress) onProgress(language === 'si' ? 'Generiranje ogrodja delovnih paketov...' : 'Generating work package scaffold...');

  const scaffoldResult = await generateContent({
    prompt: scaffoldPrompt,
    jsonMode: true,
    sectionKey: 'activities'
  });

  let scaffold: any[];
  try {
    const jsonStr = scaffoldResult.text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    scaffold = JSON.parse(jsonStr);
    if (!Array.isArray(scaffold)) throw new Error('Scaffold is not an array');
  } catch (e) {
    console.error('[geminiService] Failed to parse scaffold:', e);
    throw new Error('AI scaffold response was not valid JSON');
  }

  // PHASE 2: Generate each WP individually
  const fullActivities: any[] = [];

  for (let wpIdx = 0; wpIdx < scaffold.length; wpIdx++) {
    const wpScaffold = scaffold[wpIdx];
    const wpId = wpScaffold.id || `WP${wpIdx + 1}`;

    if (onProgress) {
      onProgress(language === 'si'
        ? `Generiranje ${wpId}: ${wpScaffold.title || ''}...`
        : `Generating ${wpId}: ${wpScaffold.title || ''}...`);
    }

    // Build context of previously generated WPs
    const previousWPsContext = fullActivities.length > 0
      ? `\n${language === 'si' ? 'ŽE GENERIRANI DELOVNI PAKETI' : 'ALREADY GENERATED WORK PACKAGES'}:\n${JSON.stringify(fullActivities, null, 2)}`
      : '';

    const wpPrompt = [
      kbContext || '',
      temporalRule,
      getLanguageDirective(language),
      `\n${language === 'si' ? 'GLOBALNA PRAVILA' : 'GLOBAL RULES'}:\n${globalRules}`,
      sectionRules,
      academicRules ? `\n${academicRules}` : '',
      humanRules ? `\n${humanRules}` : '',
      `\n${context}`,
      previousWPsContext,
      `\nSCAFFOLD:\n${JSON.stringify(scaffold, null, 2)}`,
      `\n${language === 'si'
        ? `NALOGA: Generiraj CELOTEN delovni paket ${wpId} ("${wpScaffold.title}").
Vrni EN JSON objekt z: id, title, tasks (3-5 nalog z id, title, description, startDate, endDate, dependencies), milestones (1-2), deliverables (1-3 z id, title, description, indicator).
Vse naloge morajo imeti datume znotraj ${wpScaffold.dateRange?.startDate || pStart} - ${wpScaffold.dateRange?.endDate || pEnd}.
Upoštevaj odvisnosti od nalog v prejšnjih WP-jih.`
        : `TASK: Generate the COMPLETE work package ${wpId} ("${wpScaffold.title}").
Return ONE JSON object with: id, title, tasks (3-5 tasks with id, title, description, startDate, endDate, dependencies), milestones (1-2), deliverables (1-3 with id, title, description, indicator).
All task dates must be within ${wpScaffold.dateRange?.startDate || pStart} - ${wpScaffold.dateRange?.endDate || pEnd}.
Consider dependencies on tasks in previous WPs.`}`,
      `\n${temporalRule}`
    ].filter(Boolean).join('\n');

    // Rate limit between WP generations
    if (wpIdx > 0) {
      await new Promise(r => setTimeout(r, 1500));
    }

    const wpResult = await generateContent({
      prompt: wpPrompt,
      jsonMode: true,
      sectionKey: 'activities'
    });

    try {
      const jsonStr = wpResult.text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
      let wpData = JSON.parse(jsonStr);

      // Handle case where AI returns an array with one element
      if (Array.isArray(wpData)) {
        wpData = wpData[0] || wpData;
      }

      wpData = stripMarkdown(wpData);
      fullActivities.push(wpData);
    } catch (e) {
      console.error(`[geminiService] Failed to parse WP ${wpId}:`, e);
      // Use scaffold data as fallback
      fullActivities.push({
        id: wpId,
        title: wpScaffold.title || '',
        tasks: [],
        milestones: [],
        deliverables: []
      });
    }
  }

  // Post-process: sanitize and enforce temporal integrity
  let result = sanitizeActivities(fullActivities);
  result = enforceTemporalIntegrity(result, projectData);

  return result;
};

// ═══════════════════════════════════════════════════════════════
// PUBLIC API: TARGETED FILL (fill empty fields only)
// ═══════════════════════════════════════════════════════════════

export const generateTargetedFill = async (
  sectionKey: string,
  projectData: any,
  currentData: any,
  language: 'en' | 'si' = 'en'
): Promise<any> => {
  const result = await generateSectionContent(sectionKey, projectData, language, 'fill', currentData);

  // ★ v5.0 FIX: sanitize and enforce temporal integrity for activities
  if (sectionKey === 'activities' && Array.isArray(result)) {
    let processed = sanitizeActivities(result);
    processed = enforceTemporalIntegrity(processed, projectData);
    return processed;
  }

  return result;
};

// ═══════════════════════════════════════════════════════════════
// PUBLIC API: OBJECT FILL (fill empty fields in an object)
// ═══════════════════════════════════════════════════════════════

export const generateObjectFill = async (
  sectionKey: string,
  projectData: any,
  currentData: any,
  emptyFields: string[],
  language: 'en' | 'si' = 'en'
): Promise<any> => {
  const { prompt, schema } = getPromptAndSchemaForSection(sectionKey, projectData, language, 'fill', currentData);

  const fillInstruction = language === 'si'
    ? `\nPRAZNA POLJA ZA IZPOLNITEV: ${emptyFields.join(', ')}\nIzpolni SAMO navedena prazna polja. Obstoječe podatke OHRANI nespremenjene.`
    : `\nEMPTY FIELDS TO FILL: ${emptyFields.join(', ')}\nFill ONLY the listed empty fields. Keep existing data UNCHANGED.`;

  const fullPrompt = prompt + fillInstruction;

  const kbContext = await getKnowledgeBaseContext();
  const finalPrompt = kbContext ? `${kbContext}\n\n${fullPrompt}` : fullPrompt;

  const result = await generateContent({
    prompt: finalPrompt,
    schema: schema || undefined,
    jsonMode: true,
    sectionKey
  });

  let parsed: any;
  try {
    const jsonStr = result.text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    console.error('[geminiService] Failed to parse fill response:', e);
    throw new Error('AI fill response was not valid JSON');
  }

  parsed = stripMarkdown(parsed);

  // Merge: keep existing, fill empty
  return smartMerge(currentData, parsed);
};

// ═══════════════════════════════════════════════════════════════
// PUBLIC API: PROJECT SUMMARY GENERATION
// ═══════════════════════════════════════════════════════════════

export const generateProjectSummary = async (
  projectData: any,
  language: 'en' | 'si' = 'en'
): Promise<string> => {
  const context = getContext(projectData);
  const summaryRules = getSummaryRules(language);
  const langDirective = getLanguageDirective(language);

  const prompt = [
    langDirective,
    `\n${context}`,
    `\n${language === 'si' ? 'PRAVILA ZA POVZETEK' : 'SUMMARY RULES'}:`,
    formatRules(summaryRules),
    `\n${language === 'si'
      ? 'NALOGA: Napiši povzetek projekta na podlagi zgornjih podatkov. Povzetek naj bo 150-300 besed, strukturiran v 3-4 odstavke. Ne dodajaj novih informacij — samo kondenziraj obstoječe podatke.'
      : 'TASK: Write a project summary based on the data above. The summary should be 150-300 words, structured in 3-4 paragraphs. Do not add new information — only condense existing data.'}`
  ].filter(Boolean).join('\n');

  const kbContext = await getKnowledgeBaseContext();
  const finalPrompt = kbContext ? `${kbContext}\n\n${prompt}` : prompt;

  const result = await generateContent({
    prompt: finalPrompt,
    sectionKey: 'summary'
  });

  return result.text.trim();
};

// ═══════════════════════════════════════════════════════════════
// PUBLIC API: FIELD-LEVEL GENERATION
// ═══════════════════════════════════════════════════════════════

export const generateFieldContent = async (
  fieldPath: string,
  projectData: any,
  language: 'en' | 'si' = 'en'
): Promise<string> => {
  const fieldRule = getFieldRule(fieldPath, language);
  const context = getContext(projectData);
  const langDirective = getLanguageDirective(language);

  const prompt = [
    langDirective,
    `\n${context}`,
    `\n${language === 'si' ? 'PRAVILO ZA POLJE' : 'FIELD RULE'}: ${fieldRule}`,
    `\n${language === 'si'
      ? `NALOGA: Generiraj vsebino za polje "${fieldPath}" na podlagi konteksta projekta in pravila za polje.`
      : `TASK: Generate content for the field "${fieldPath}" based on the project context and field rule.`}`
  ].filter(Boolean).join('\n');

  const result = await generateContent({
    prompt,
    sectionKey: 'field'
  });

  return stripMarkdown(result.text.trim());
};
