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
//   - NEW: generateTargetedFill() — generates content ONLY for
//     specific empty items in an array section. Sends a focused
//     prompt with only the empty indices, then inserts generated
//     items at the correct positions. 100% deterministic fill.
//   - All previous changes preserved.
//
// v4.6 — 2026-02-15 — TEMPORAL INTEGRITY ENFORCER
//   - NEW: enforceTemporalIntegrity() post-processor — programmatically
//     forces ALL task/milestone dates within the project envelope
//     [projectStart, projectEnd] after AI generation. AI models cannot
//     reliably calculate dates, so this is the safety net.
//   - NEW: TEMPORAL_INTEGRITY_RULE imported from Instructions.ts and
//     injected at BEGINNING and END of activities prompt for maximum
//     AI attention to date constraints.
//   - All previous changes preserved.
//
// v4.5 — 2026-02-14 — DYNAMIC MAX_TOKENS
// v4.4 — 2026-02-14 — DELIVERABLE TITLE SCHEMA
// v4.3 — 2026-02-14 — PROMPT ORDER + SCHEMA FIX
// v4.1 — 2026-02-14 — SINGLE SOURCE OF TRUTH REFACTOR
// ═══════════════════════════════════════════════════════════════

import { storageService } from './storageService.ts';
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
import { detectProjectLanguage as detectLanguage } from '../utils.ts';
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

const detectInputLanguageMismatch = (
  projectData: any,
  uiLanguage: 'en' | 'si'
): string => {
  const collectStrings = (obj: any, depth: number = 0): string[] => {
    if (depth > 5 || !obj) return [];
    const strings: string[] = [];
    if (typeof obj === 'string' && obj.trim().length > 10) {
      strings.push(obj.trim());
    } else if (Array.isArray(obj)) {
      obj.forEach((item) => strings.push(...collectStrings(item, depth + 1)));
    } else if (typeof obj === 'object') {
      Object.values(obj).forEach((val) => strings.push(...collectStrings(val, depth + 1)));
    }
    return strings;
  };

  const allTexts = collectStrings(projectData);
  if (allTexts.length === 0) return '';

  const sample = allTexts.slice(0, 5).join(' ');

  const slovenianMarkers = /[čšžČŠŽ]|(\b(je|za|na|ki|ali|ter|pri|kot|ima|biti|sem|ker|tudi|vse|med|lahko|zelo|brez|kako|kateri|vendar|zato|skupaj|potrebno|obstoječi|dejavnosti|razvoj|sodelovanje|vzpostaviti|okrepiti|zagotoviti|vzroke|posledice)\b)/gi;
  const englishMarkers = /\b(the|is|are|was|were|been|being|have|has|had|will|would|shall|should|can|could|may|might|must|and|but|or|which|that|this|these|those|with|from|into|upon|about|between|through|during|before|after|above|below|against)\b/gi;

  const slMatches = (sample.match(slovenianMarkers) || []).length;
  const enMatches = (sample.match(englishMarkers) || []).length;

  let detectedLang: 'si' | 'en' | 'unknown' = 'unknown';
  if (slMatches > enMatches * 1.5) detectedLang = 'si';
  else if (enMatches > slMatches * 1.5) detectedLang = 'en';

  if (detectedLang === 'unknown' || detectedLang === uiLanguage) return '';

  return getLanguageMismatchNotice(detectedLang, uiLanguage);
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
};

const SECTION_TO_SCHEMA: Record<string, string> = {
  problemAnalysis: 'problemAnalysis', projectIdea: 'projectIdea',
  generalObjectives: 'objectives', specificObjectives: 'objectives',
  projectManagement: 'projectManagement', activities: 'activities',
  outputs: 'results', outcomes: 'results', impacts: 'results',
  risks: 'risks', kers: 'kers',
  expectedResults: 'results',
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

const buildTaskInstruction = (
  sectionKey: string,
  projectData: any,
  language: 'en' | 'si'
): string => {
  const placeholders: Record<string, string> = {};

  switch (sectionKey) {
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

  return getSectionTaskInstruction(sectionKey, language, placeholders);
};

// ─── PROMPT BUILDER ──────────────────────────────────────────────

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
  const titleRules = sectionKey === 'projectIdea' ? getProjectTitleRules(language) : '';

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

  const prompt = [
    temporalRuleBlock,                          // ★ FIRST for activities — highest priority
    langDirective,
    langMismatchNotice,
    taskInstruction,
    textSchema,
    qualityGate,
    context,
    modeInstruction,
    titleRules,
    academicRules,
    humanRules,
    `${globalRulesHeader}:\n${globalRules}`,
    sectionRules,
    temporalRuleBlock ? temporalRuleBlock : '', // ★ ALSO LAST — AI attends to end too
  ].filter(Boolean).join('\n\n');

  return { prompt, schema };
};

// ═══════════════════════════════════════════════════════════════
// ★ v4.7: TARGETED FILL — generates ONLY specific empty items
// ═══════════════════════════════════════════════════════════════

export const generateTargetedFill = async (
  sectionKey: string,
  projectData: any,
  language: 'en' | 'si',
  emptyIndices: number[]
): Promise<any[]> => {
  const currentData = projectData[sectionKey];

  if (!Array.isArray(currentData) || emptyIndices.length === 0) {
    return currentData || [];
  }

  const existingItems: string[] = [];
  const missingItems: string[] = [];

  currentData.forEach((item: any, index: number) => {
    if (emptyIndices.includes(index)) {
      const partialInfo = item && typeof item === 'object'
        ? Object.entries(item)
            .filter(([_, v]) => typeof v === 'string' && (v as string).trim().length > 0)
            .map(([k, v]) => `${k}: "${v}"`)
            .join(', ')
        : '';
      missingItems.push(
        language === 'si'
          ? `  - Element ${index + 1} (indeks ${index})${partialInfo ? ` — delni podatki: ${partialInfo}` : ' — popolnoma prazen'}`
          : `  - Item ${index + 1} (index ${index})${partialInfo ? ` — partial data: ${partialInfo}` : ' — completely empty'}`
      );
    } else {
      const title = item?.title || item?.description || `Item ${index + 1}`;
      existingItems.push(
        language === 'si'
          ? `  - Element ${index + 1}: "${title}" (OHRANI NESPREMENJENO)`
          : `  - Item ${index + 1}: "${title}" (KEEP UNCHANGED)`
      );
    }
  });

  const schemaKey = SECTION_TO_SCHEMA[sectionKey];
  const itemSchema = schemas[schemaKey]?.items;

  if (!itemSchema) {
    throw new Error(`No schema found for section: ${sectionKey}`);
  }

  const config = getProviderConfig();
  const needsTextSchema = config.provider !== 'gemini';
  const textSchema = needsTextSchema ? schemaToTextInstruction({
    type: Type.ARRAY,
    items: itemSchema
  }) : '';

  const context = getContext(projectData);
  const langDirective = getLanguageDirective(language);
  const academicRules = getAcademicRigorRules(language);
  const humanRules = getHumanizationRules(language);
  const sectionRules = getRulesForSection(sectionKey, language);

  const sectionLabel = sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1);

  const targetedPrompt = language === 'si'
    ? [
        langDirective,
        `NALOGA: Generiraj vsebino SAMO za manjkajoče elemente v razdelku "${sectionLabel}".`,
        `\nTrenutno stanje razdelka "${sectionLabel}" (${currentData.length} elementov):`,
        `\nOBSTOJEČI ELEMENTI (NE SPREMINJAJ):`,
        existingItems.join('\n'),
        `\nMANJKAJOČI ELEMENTI (GENERIRAJ TE):`,
        missingItems.join('\n'),
        `\nPRAVILA:`,
        `- Generiraj NATANKO ${emptyIndices.length} elementov — enega za vsak manjkajoči element.`,
        `- Vsak generiran element mora biti vsebinsko povezan s projektom in obstoječimi elementi.`,
        `- Vrni JSON array z NATANKO ${emptyIndices.length} elementi.`,
        `- Vrstni red v arrayu mora ustrezati vrstnemu redu manjkajočih indeksov: [${emptyIndices.join(', ')}].`,
        `- NE vračaj obstoječih elementov — SAMO nove.`,
        textSchema,
        context,
        academicRules,
        humanRules,
        sectionRules,
      ].filter(Boolean).join('\n\n')
    : [
        langDirective,
        `TASK: Generate content ONLY for the missing items in the "${sectionLabel}" section.`,
        `\nCurrent state of "${sectionLabel}" section (${currentData.length} items):`,
        `\nEXISTING ITEMS (DO NOT MODIFY):`,
        existingItems.join('\n'),
        `\nMISSING ITEMS (GENERATE THESE):`,
        missingItems.join('\n'),
        `\nRULES:`,
        `- Generate EXACTLY ${emptyIndices.length} items — one for each missing item.`,
        `- Each generated item must be contextually related to the project and existing items.`,
        `- Return a JSON array with EXACTLY ${emptyIndices.length} items.`,
        `- The order in the array must match the order of missing indices: [${emptyIndices.join(', ')}].`,
        `- Do NOT return existing items — ONLY new ones.`,
        textSchema,
        context,
        academicRules,
        humanRules,
        sectionRules,
      ].filter(Boolean).join('\n\n');

  const useNativeSchema = config.provider === 'gemini';

  const result = await generateContent({
    prompt: targetedPrompt,
    jsonSchema: useNativeSchema ? { type: Type.ARRAY, items: itemSchema } : undefined,
    jsonMode: !useNativeSchema,
    sectionKey: sectionKey,
  });

  const jsonStr = result.text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
  let generatedItems = JSON.parse(jsonStr);

  if (!Array.isArray(generatedItems)) {
    if (generatedItems && typeof generatedItems === 'object') {
      generatedItems = [generatedItems];
    } else {
      throw new Error('AI returned non-array for targeted fill');
    }
  }

  generatedItems = stripMarkdown(generatedItems);

  const filledData = [...currentData];

  for (let i = 0; i < emptyIndices.length; i++) {
    const targetIndex = emptyIndices[i];
    if (i < generatedItems.length && targetIndex < filledData.length) {
      const existing = filledData[targetIndex] || {};
      const generated = generatedItems[i];
      filledData[targetIndex] = { ...generated, ...Object.fromEntries(
        Object.entries(existing).filter(([_, v]) => typeof v === 'string' ? (v as string).trim().length > 0 : v != null)
      )};
    }
  }

    console.log(`[TargetedFill] ${sectionKey}: Filled ${Math.min(generatedItems.length, emptyIndices.length)} of ${emptyIndices.length} empty items at indices [${emptyIndices.join(', ')}]`);

  // ★ v5.0: Post-process activities with temporal integrity and dependency sanitization
  if (sectionKey === 'activities') {
    let processed = sanitizeActivities(filledData);
    processed = enforceTemporalIntegrity(processed, projectData);
    return processed;
  }

  return filledData;
};
// ═══════════════════════════════════════════════════════════════
// ★ v5.1: OBJECT FILL — generates ONLY empty fields in object sections
// For projectIdea, problemAnalysis, projectManagement etc.
// ═══════════════════════════════════════════════════════════════

export const generateObjectFill = async (
  sectionKey: string,
  projectData: any,
  language: 'en' | 'si',
  emptyFields: string[]
): Promise<any> => {
  const currentData = projectData[sectionKey];

  if (!currentData || typeof currentData !== 'object' || emptyFields.length === 0) {
    return currentData || {};
  }

  // Build context of what EXISTS (so AI can generate contextually relevant content)
  const existingFields: string[] = [];
  const missingFields: string[] = [];

  for (const [key, val] of Object.entries(currentData)) {
    if (emptyFields.includes(key)) {
      missingFields.push(
        language === 'si'
          ? `  - "${key}" — PRAZNO (GENERIRAJ)`
          : `  - "${key}" — EMPTY (GENERATE THIS)`
      );
    } else if (typeof val === 'string' && val.trim().length > 0) {
      const preview = val.length > 150 ? val.substring(0, 150) + '...' : val;
      existingFields.push(
        language === 'si'
          ? `  - "${key}": "${preview}" (OHRANI NESPREMENJENO)`
          : `  - "${key}": "${preview}" (KEEP UNCHANGED)`
      );
    } else if (val && typeof val === 'object') {
      existingFields.push(
        language === 'si'
          ? `  - "${key}": [objekt/array z vsebino] (OHRANI NESPREMENJENO)`
          : `  - "${key}": [object/array with content] (KEEP UNCHANGED)`
      );
    }
  }

  const schemaKey = SECTION_TO_SCHEMA[sectionKey];
  const fullSchema = schemas[schemaKey];

  if (!fullSchema) {
    throw new Error(`No schema found for section: ${sectionKey}`);
  }

  // Build a reduced schema containing ONLY the empty fields
  const reducedProperties: any = {};
  const reducedRequired: string[] = [];

  for (const fieldName of emptyFields) {
    if (fullSchema.properties && fullSchema.properties[fieldName]) {
      reducedProperties[fieldName] = fullSchema.properties[fieldName];
      reducedRequired.push(fieldName);
    }
  }

  const reducedSchema = {
    type: Type.OBJECT,
    properties: reducedProperties,
    required: reducedRequired,
  };

  const config = getProviderConfig();
  const useNativeSchema = config.provider === 'gemini';
  const needsTextSchema = !useNativeSchema;
  const textSchema = needsTextSchema ? schemaToTextInstruction(reducedSchema) : '';

  const context = getContext(projectData);
  const langDirective = getLanguageDirective(language);
  const academicRules = getAcademicRigorRules(language);
  const humanRules = getHumanizationRules(language);
  const sectionRules = getRulesForSection(sectionKey, language);
  const titleRules = sectionKey === 'projectIdea' ? getProjectTitleRules(language) : '';
  const qualityGate = getQualityGate(sectionKey, language);

  // Build task instruction with placeholders
  const taskInstruction = buildTaskInstruction(sectionKey, projectData, language);

  const sectionLabel = sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1);

  const objectFillPrompt = language === 'si'
    ? [
        langDirective,
        `NALOGA: Generiraj vsebino SAMO za manjkajoča polja v razdelku "${sectionLabel}".`,
        `\nOBSTOJEČA POLJA (NE SPREMINJAJ — uporabi kot kontekst):`,
        existingFields.join('\n'),
        `\nMANJKAJOČA POLJA (GENERIRAJ SAMO TE):`,
        missingFields.join('\n'),
        `\nPRAVILA:`,
        `- Vrni JSON objekt z NATANKO ${emptyFields.length} polji: ${emptyFields.map(f => `"${f}"`).join(', ')}.`,
        `- NE vračaj obstoječih polj — SAMO manjkajoča.`,
        `- Vsebina mora biti kontekstualno povezana z obstoječimi polji zgoraj.`,
        textSchema,
        taskInstruction,
        titleRules,
        context,
        academicRules,
        humanRules,
        sectionRules,
        qualityGate,
      ].filter(Boolean).join('\n\n')
    : [
        langDirective,
        `TASK: Generate content ONLY for the missing fields in the "${sectionLabel}" section.`,
        `\nEXISTING FIELDS (DO NOT MODIFY — use as context):`,
        existingFields.join('\n'),
        `\nMISSING FIELDS (GENERATE ONLY THESE):`,
        missingFields.join('\n'),
        `\nRULES:`,
        `- Return a JSON object with EXACTLY ${emptyFields.length} fields: ${emptyFields.map(f => `"${f}"`).join(', ')}.`,
        `- Do NOT return existing fields — ONLY the missing ones.`,
        `- Content must be contextually related to the existing fields above.`,
        textSchema,
        taskInstruction,
        titleRules,
        context,
        academicRules,
        humanRules,
        sectionRules,
        qualityGate,
      ].filter(Boolean).join('\n\n');

  const result = await generateContent({
    prompt: objectFillPrompt,
    jsonSchema: useNativeSchema ? reducedSchema : undefined,
    jsonMode: !useNativeSchema,
    sectionKey: sectionKey,
  });

  const jsonStr = result.text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
  let generatedFields = JSON.parse(jsonStr);

  generatedFields = stripMarkdown(generatedFields);

  // Sanitize project title if present
  if (sectionKey === 'projectIdea' && generatedFields.projectTitle) {
    generatedFields.projectTitle = sanitizeProjectTitle(generatedFields.projectTitle);
  }

  // Merge: keep ALL existing data, overlay ONLY the newly generated fields
  const merged = { ...currentData };
  for (const fieldName of emptyFields) {
    if (generatedFields[fieldName] !== undefined && generatedFields[fieldName] !== null) {
      // Only fill if the field is actually still empty (safety check)
      const existing = merged[fieldName];
      const isEmpty = !existing || (typeof existing === 'string' && existing.trim().length === 0);
      if (isEmpty) {
        merged[fieldName] = generatedFields[fieldName];
      }
    }
  }

  console.log(`[ObjectFill] ${sectionKey}: Generated ${emptyFields.length} fields: [${emptyFields.join(', ')}]`);

  return merged;
};

// ─── MAIN GENERATION FUNCTIONS ───────────────────────────────────

export const generateSectionContent = async (
  sectionKey: string,
  projectData: any,
  language: 'en' | 'si' = 'en',
  mode: string = 'regenerate'
) => {
  // ★ Handle 'expectedResults' as a composite section
  if (sectionKey === 'expectedResults') {
    const subSections = ['outputs', 'outcomes', 'impacts'];
    const compositeResult: Record<string, any> = {};

    for (const subKey of subSections) {
      try {
        const currentSubData = projectData[subKey];
        const { prompt, schema } = getPromptAndSchemaForSection(
          subKey, projectData, language, mode, currentSubData
        );

        const config = getProviderConfig();
        const useNativeSchema = config.provider === 'gemini';

        const result = await generateContent({
          prompt,
          jsonSchema: useNativeSchema ? schema : undefined,
          jsonMode: !useNativeSchema,
          sectionKey: subKey,
        });

        const jsonStr = result.text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
        let parsedData = JSON.parse(jsonStr);

        if (mode === 'fill' && currentSubData) {
          parsedData = smartMerge(currentSubData, parsedData);
        }

        parsedData = stripMarkdown(parsedData);
        compositeResult[subKey] = parsedData;
      } catch (err) {
        console.warn(`[generateSectionContent] Failed to generate ${subKey}:`, err);
        compositeResult[subKey] = projectData[subKey] || [];
      }
    }

    return compositeResult;
  }

  // ─── Standard (non-composite) generation ───
  const currentSectionData = projectData[sectionKey];
  const { prompt, schema } = getPromptAndSchemaForSection(
    sectionKey, projectData, language, mode, currentSectionData
  );

  const config = getProviderConfig();
  const useNativeSchema = config.provider === 'gemini';

  const result = await generateContent({
    prompt,
    jsonSchema: useNativeSchema ? schema : undefined,
    jsonMode: !useNativeSchema,
    sectionKey: sectionKey,
  });

  const jsonStr = result.text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
  let parsedData = JSON.parse(jsonStr);

  if (sectionKey === 'projectIdea' && jsonStr.startsWith('[')) {
    throw new Error("API returned an array for projectIdea section, expected an object.");
  }

  if (sectionKey === 'activities' && Array.isArray(parsedData)) {
    parsedData = sanitizeActivities(parsedData);
    // ★ v4.6: FORCE all dates within project envelope
    parsedData = enforceTemporalIntegrity(parsedData, projectData);
  }

  if (sectionKey === 'projectIdea' && parsedData.proposedSolution) {
    let text = parsedData.proposedSolution;
    text = text.replace(
      /([^\n])\s*((?:Faza|Phase)\s+\d+(?::|\.))/g,
      '$1\n\n$2'
    );
    parsedData.proposedSolution = text;
  }

  if (sectionKey === 'projectIdea' && parsedData.projectTitle) {
    parsedData.projectTitle = sanitizeProjectTitle(parsedData.projectTitle);
  }

  if (mode === 'fill' && currentSectionData) {
    parsedData = smartMerge(currentSectionData, parsedData);
  }

  parsedData = stripMarkdown(parsedData);

  if (sectionKey === 'projectIdea' && parsedData.projectTitle) {
    parsedData.projectTitle = sanitizeProjectTitle(parsedData.projectTitle);
  }

  return parsedData;
};

// ─── FIELD CONTENT GENERATION ────────────────────────────────────

export const generateFieldContent = async (
  path: (string | number)[],
  projectData: any,
  language: 'en' | 'si' = 'en'
) => {
  const context = getContext(projectData);
  const fieldName = String(path[path.length - 1]);
  const sectionName = String(path[0]);

  const instructions = getAppInstructions(language);
  const globalRules = formatRules(instructions.GLOBAL_RULES);
  const globalRulesHeader = language === 'si' ? 'GLOBALNA PRAVILA' : 'GLOBAL RULES';

  const langDirective = getLanguageDirective(language);
  const langMismatchNotice = detectInputLanguageMismatch(projectData, language);
  const academicRules = getAcademicRigorRules(language);
  const humanRules = getHumanizationRules(language);

  const fieldRule = getFieldRule(fieldName, language);
  const fieldRuleText = fieldRule
    ? `\n${language === 'si' ? 'PRAVILO ZA TO POLJE' : 'FIELD-SPECIFIC RULE'}:\n${fieldRule}\n`
    : '';

  const isProjectTitle = fieldName === 'projectTitle' ||
    (sectionName === 'projectIdea' && fieldName === 'title' && path.length <= 2);

  const titleRules = isProjectTitle ? getProjectTitleRules(language) : '';

  const sectionRules = getRulesForSection(sectionName, language);

  let siblingContext = '';
  try {
    let parentObj: any = projectData;
    for (let i = 0; i < path.length - 1; i++) {
      if (parentObj && parentObj[path[i]] !== undefined) parentObj = parentObj[path[i]];
      else { parentObj = null; break; }
    }
    if (parentObj && typeof parentObj === 'object') {
      const siblings: string[] = [];
      for (const [key, value] of Object.entries(parentObj)) {
        if (key !== fieldName && typeof value === 'string' && value.trim().length > 0) {
          siblings.push(`  ${key}: "${value}"`);
        }
      }
      if (siblings.length > 0) {
        const header = language === 'si'
          ? 'OBSTOJEČI PODATKI V ISTEM RAZDELKU (uporabi kot osnovo)'
          : 'EXISTING DATA IN THE SAME SECTION (use as the basis for generation)';
        siblingContext = `\n${header}:\n${siblings.join('\n')}\n`;
      }
    }
  } catch (e) {
    console.warn('[generateFieldContent] Could not extract sibling context:', e);
  }

  let specificContext = '';
  let extraInstruction = '';

  if (isProjectTitle) {
    const existingTitle = projectData.projectIdea?.projectTitle?.trim() || '';
    specificContext = language === 'si' ? 'naziv projekta (projectTitle)' : 'the project title (projectTitle)';
    extraInstruction = existingTitle
      ? (language === 'si'
        ? `\nUPORABNIKOV TRENUTNI NAZIV: "${existingTitle}"\nČe je primeren (30–200 znakov, imenski izraz, brez akronima, brez glagola), ga VRNI NESPREMENJENO.\nČe ni primeren, ga IZBOLJŠAJ v skladu s pravili za naziv zgoraj — ostani na isti temi.\nVrni SAMO naziv — brez navodil, brez razlage, brez narekovajev.\n`
        : `\nUSER'S CURRENT TITLE: "${existingTitle}"\nIf acceptable (30–200 chars, noun phrase, no acronym, no verb), RETURN IT UNCHANGED.\nIf not acceptable, IMPROVE it following the title rules above — stay on the same topic.\nReturn ONLY the title — no instructions, no explanation, no quotes.\n`)
      : (language === 'si'
        ? `\nGeneriraj primeren NAZIV PROJEKTA na podlagi konteksta projekta.\nUpoštevaj pravila za naziv zgoraj.\nVrni SAMO naziv — brez navodil, brez razlage, brez narekovajev.\n`
        : `\nGenerate an appropriate PROJECT TITLE based on the project context.\nFollow the title rules above.\nReturn ONLY the title — no instructions, no explanation, no quotes.\n`);
  } else if (path.includes('milestones')) {
    if (fieldName === 'date') {
      const projectStartDate = projectData.projectIdea?.startDate || new Date().toISOString().split('T')[0];
      const wpIdx = path[1];
      const msIdx = path[3];
      const milestoneDesc = projectData.activities?.[wpIdx as number]?.milestones?.[msIdx as number]?.description || '';
      specificContext = language === 'si' ? 'datum za mejnik' : 'a date for a Milestone';
      extraInstruction = `\nCONTEXT:\n- Project Start Date: ${projectStartDate}\n- Milestone Description: "${milestoneDesc}"\nTASK: Estimate a realistic completion date.\nFORMAT: Return ONLY 'YYYY-MM-DD'. No other text.`;
    } else {
      specificContext = language === 'si'
        ? `mejnik v delovnem sklopu na poti ${JSON.stringify(path)}`
        : `a Milestone in the Work Package defined in the path ${JSON.stringify(path)}`;
    }
  } else if (path.includes('tasks')) {
    specificContext = language === 'si' ? 'nalogo v delovnem sklopu' : 'a Task in the Work Package';
  } else if (path.includes('deliverables')) {
    specificContext = language === 'si' ? 'predvideni rezultat' : 'a Deliverable';
  } else if (path.includes('risks')) {
    specificContext = language === 'si' ? 'specifično tveganje' : 'a specific Risk';
  } else {
    specificContext = language === 'si' ? `polje "${fieldName}"` : `the field "${fieldName}"`;
  }

  const anchorNote = siblingContext
    ? (language === 'si'
      ? ' Generirano besedilo MORA biti neposredno vsebinsko povezano z obstoječimi podatki zgoraj.'
      : ' The generated text MUST be directly related to the existing data above.')
    : '';

  const taskLine = isProjectTitle
    ? (language === 'si'
      ? `Generiraj ali izboljšaj NAZIV PROJEKTA. Vrni SAMO golo besedilo naziva (30–200 znakov). Brez markdown, brez narekovajev, brez razlage.${anchorNote}`
      : `Generate or improve the PROJECT TITLE. Return ONLY the plain text title (30–200 characters). No markdown, no quotes, no explanation.${anchorNote}`)
    : (language === 'si'
      ? `Generiraj profesionalno vrednost za ${specificContext} znotraj "${sectionName}". Vrni samo golo besedilo brez markdown. Vključi citat iz REALNEGA vira če primerno. Če ne poznaš podatka: "[Vstavite preverjen podatek: ...]". Piši kot izkušen človeški svetovalec.${anchorNote}`
      : `Generate a professional value for ${specificContext} within "${sectionName}". Return only plain text, no markdown. Include citation from a REAL source where appropriate. If unknown: "[Insert verified data: ...]". Write like an experienced human consultant.${anchorNote}`);

  const prompt = [
    langDirective,
    langMismatchNotice,
    isProjectTitle ? '' : academicRules,
    isProjectTitle ? '' : humanRules,
    titleRules,
    context,
    siblingContext,
    `${globalRulesHeader}:\n${globalRules}`,
    sectionRules,
    fieldRuleText,
    extraInstruction,
    taskLine
  ].filter(Boolean).join('\n\n');

  const result = await generateContent({
    prompt,
    sectionKey: 'field',
  });

  let text = result.text;
  text = text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1');

  if (isProjectTitle) {
    text = sanitizeProjectTitle(text);
  }

  return text;
};

// ─── SUMMARY GENERATION (v5.0 — condensation-only, structured) ──

export const generateProjectSummary = async (
  projectData: any,
  language: 'en' | 'si' = 'en'
) => {
  const context = getContext(projectData);
  const summaryRules = getSummaryRules(language);
  const langDirective = getLanguageDirective(language);

  const extractionReminder = language === 'si'
    ? `KRITIČNO NAVODILO: Si KONDENZACIJSKI mehanizem. DESTILIRAJ projektne podatke v KRATEK povzetek — NAJVEČ 800 besed skupaj, 5 sekcij, brez alinej, brez kopiranja celih odstavkov. Zajemi samo BISTVO vsake sekcije.`
    : `CRITICAL INSTRUCTION: You are a CONDENSATION engine. DISTILL the project data into a SHORT summary — MAXIMUM 800 words total, 5 sections, no bullet points, no copy-pasting whole paragraphs. Capture only the ESSENCE of each section.`;

  const prompt = [
    langDirective,
    extractionReminder,
    summaryRules,
    `\n---\nPROJECT DATA TO SUMMARISE:\n---\n`,
    context,
    `\n---\n`,
    language === 'si'
      ? `KONČNI OPOMNIK: NAJVEČ 800 besed. 5 sekcij z ## naslovi. BREZ alinej. BREZ krepkega tiska. Samo tekoči odstavki proze. NE kopiraj — KONDENZIRAJ.`
      : `FINAL REMINDER: MAXIMUM 800 words. 5 sections with ## headings. NO bullet points. NO bold text. Only flowing prose paragraphs. Do NOT copy — CONDENSE.`
  ].filter(Boolean).join('\n\n');

  const result = await generateContent({
    prompt,
    sectionKey: 'summary',
  });
  return result.text;
};
// ═══════════════════════════════════════════════════════════════
// ★ v5.0: PER-WP GENERATION — generates activities one WP at a time
// Phase 1: Scaffold (WP ids, titles, date ranges)
// Phase 2: Each WP individually with cross-WP dependency context
// Phase 3: Post-processing (sanitize + temporal integrity)
// ═══════════════════════════════════════════════════════════════

export const generateActivitiesPerWP = async (
  projectData: any,
  language: 'en' | 'si' = 'en',
  mode: string = 'regenerate',
  onProgress?: (wpIndex: number, wpTotal: number, wpTitle: string) => void,
  existingScaffold?: any[],
  onlyIndices?: number[]
): Promise<any[]> => {

  const config = getProviderConfig();
  const useNativeSchema = config.provider === 'gemini';

  // ── Calculate project dates ──
  const today = new Date().toISOString().split('T')[0];
  const projectStart = projectData.projectIdea?.startDate || today;
  const durationMonths = projectData.projectIdea?.durationMonths || 24;
  const projectEnd = calculateProjectEndDate(projectStart, durationMonths);

  const context = getContext(projectData);
  const langDirective = getLanguageDirective(language);
  const academicRules = getAcademicRigorRules(language);
  const humanRules = getHumanizationRules(language);
  const sectionRules = getRulesForSection('activities', language);
  const qualityGate = getQualityGate('activities', language);

  // Build temporal rule with actual dates
  const temporalRule = (TEMPORAL_INTEGRITY_RULE[language] || TEMPORAL_INTEGRITY_RULE.en)
    .replace(/\{\{projectStart\}\}/g, projectStart)
    .replace(/\{\{projectEnd\}\}/g, projectEnd)
    .replace(/\{\{projectDurationMonths\}\}/g, String(durationMonths));

  // Build task instruction with placeholders filled
  const taskInstruction = getSectionTaskInstruction('activities', language, {
    projectStart,
    projectEnd,
    projectDurationMonths: String(durationMonths),
  });

    // ════════════════════════════════════════════════════════════
  // PHASE 1: Generate WP scaffold OR use existing one
  // ════════════════════════════════════════════════════════════

  let scaffold: any[];

  if (existingScaffold && existingScaffold.length > 0) {
    scaffold = existingScaffold;
    console.log(`[PerWP] Phase 1: Using existing scaffold with ${scaffold.length} WPs`);
  } else {
    console.log(`[PerWP] Phase 1: Generating scaffold...`);
    if (onProgress) onProgress(-1, 0, language === 'si' ? 'Generiranje strukture DS...' : 'Generating WP structure...');

    const scaffoldPrompt = [
      temporalRule,
      langDirective,
      language === 'si'
        ? `NALOGA: Generiraj SAMO strukturo delovnih sklopov (scaffold) — BREZ nalog, mejnikov ali dosežkov.
Za vsak DS vrni: id (WP1, WP2...), title (samostalniška zveza), startDate (YYYY-MM-DD), endDate (YYYY-MM-DD).
Projekt traja od ${projectStart} do ${projectEnd} (${durationMonths} mesecev).
Med 6 in 10 DS. Upoštevaj pravila za vrstni red DS (prvi je temeljni/analitični, predzadnji diseminacija, zadnji upravljanje).
Vrni JSON array: [{ "id": "WP1", "title": "...", "startDate": "...", "endDate": "..." }, ...]
BREZ nalog, mejnikov ali dosežkov — SAMO scaffold.`
        : `TASK: Generate ONLY the work package structure (scaffold) — WITHOUT tasks, milestones, or deliverables.
For each WP return: id (WP1, WP2...), title (noun phrase), startDate (YYYY-MM-DD), endDate (YYYY-MM-DD).
Project runs from ${projectStart} to ${projectEnd} (${durationMonths} months).
Between 6 and 10 WPs. Follow WP ordering rules (first is foundational/analytical, second-to-last is dissemination, last is project management).
Return a JSON array: [{ "id": "WP1", "title": "...", "startDate": "...", "endDate": "..." }, ...]
NO tasks, milestones, or deliverables — ONLY scaffold.`,
      taskInstruction,
      context,
      temporalRule,
    ].filter(Boolean).join('\n\n');

    const scaffoldSchema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          startDate: { type: Type.STRING },
          endDate: { type: Type.STRING },
        },
        required: ['id', 'title', 'startDate', 'endDate']
      }
    };

    const scaffoldResult = await generateContent({
      prompt: scaffoldPrompt,
      jsonSchema: useNativeSchema ? scaffoldSchema : undefined,
      jsonMode: !useNativeSchema,
      sectionKey: 'activities',
    });

    const scaffoldStr = scaffoldResult.text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    scaffold = JSON.parse(scaffoldStr);

    if (!Array.isArray(scaffold) || scaffold.length === 0) {
      throw new Error('AI returned invalid scaffold for per-WP generation');
    }
  }

  console.log(`[PerWP] Phase 1 complete: ${scaffold.length} WPs: ${scaffold.map(w => w.id).join(', ')}`);

  // ════════════════════════════════════════════════════════════
  // PHASE 2: Generate each WP's content individually
  // ════════════════════════════════════════════════════════════

  const fullActivities: any[] = [];
  const wpItemSchema = schemas.activities.items;

  const indicesToGenerate = onlyIndices || scaffold.map((_, idx) => idx);

  for (const i of indicesToGenerate) {
    if (i < 0 || i >= scaffold.length) continue;

    const wp = scaffold[i];
    const isLast = i === scaffold.length - 1;
    const isSecondToLast = i === scaffold.length - 2;
    const wpNum = wp.id.replace('WP', '');

    const progressIdx = indicesToGenerate.indexOf(i);
    console.log(`[PerWP] Phase 2: Generating ${wp.id} "${wp.title}" (${progressIdx + 1}/${indicesToGenerate.length})...`);
    if (onProgress) onProgress(progressIdx, indicesToGenerate.length, wp.title);

    let wpTypeInstruction: string;
           if (isLast) {
      // ★ v5.3: Expert identity + concrete dates + JSON example for PM WP
      const pmStart = new Date(projectStart + 'T00:00:00Z');
      const pmEnd = new Date(projectEnd + 'T00:00:00Z');
      const pmTotal = pmEnd.getTime() - pmStart.getTime();
      const toISO = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
      const pm_m3 = toISO(new Date(pmStart.getTime() + pmTotal * 0.08));
      const pm_closing = toISO(new Date(pmEnd.getTime() - pmTotal * 0.08));
      const pmWpNum = scaffold.length;

      wpTypeInstruction = language === 'si'
        ? `SI IZKUŠEN STROKOVNJAK ZA PROJEKTNO VODENJE (PMP/PRINCE2) z 20+ leti izkušenj pri EU projektih.
KOT STROKOVNJAK VEŠ: naloge projektnega vodenja (koordinacija, monitoring, kakovost, finance) TEČEJO VZPOREDNO skozi CELOTNO trajanje projekta. Koordinacija se NIKOLI ne konča pred zaključkom projekta. Finančno upravljanje je STALNA aktivnost. Spremljanje napredka je CIKLIČNO skozi celoten projekt. EDINA kratka naloga je zaključno poročilo na koncu.
NAPAČNO = zaporedne kratke naloge, naloge stisnjene v isto obdobje, naloge ki se končajo pred koncem projekta.

Ta DS je "Upravljanje in koordinacija projekta" (ZADNJI DS).

═══ ŽELEZNO PRAVILO ZA DATUME (KRŠITEV = ZAVRNITEV) ═══
VSAKA naloga razen zaključnega poročila MORA imeti endDate = ${projectEnd}.

OBVEZNI DATUMI:
  T${pmWpNum}.1: startDate="${projectStart}", endDate="${projectEnd}"
  T${pmWpNum}.2: startDate="${projectStart}", endDate="${projectEnd}"
  T${pmWpNum}.3: startDate="${pm_m3}",         endDate="${projectEnd}"
  T${pmWpNum}.4: startDate="${projectStart}", endDate="${projectEnd}"
  T${pmWpNum}.5: startDate="${pm_closing}",    endDate="${projectEnd}"

JSON PRIMER:
{"tasks":[
  {"id":"T${pmWpNum}.1","title":"Koordinacija konzorcija in operativno upravljanje","startDate":"${projectStart}","endDate":"${projectEnd}","dependencies":[],"description":"Celostna koordinacija projektnih aktivnosti, vključno z vodenjem sestankov konzorcija, upravljanjem komunikacije med partnerji in zagotavljanjem skladnosti z zavezami iz pogodbe o sofinanciranju."},
  {"id":"T${pmWpNum}.2","title":"Spremljanje napredka in ciklično poročanje","startDate":"${projectStart}","endDate":"${projectEnd}","dependencies":[{"predecessorId":"T${pmWpNum}.1","type":"SS"}],"description":"Kontinuirano spremljanje projektnega napredka z rednimi vmesnimi poročili, letnimi pregledi in mehanizmi za zgodnje zaznavanje odstopanj od načrta."},
  {"id":"T${pmWpNum}.3","title":"Zagotavljanje kakovosti in obvladovanje tveganj","startDate":"${pm_m3}","endDate":"${projectEnd}","dependencies":[{"predecessorId":"T${pmWpNum}.1","type":"SS"}],"description":"Vzpostavitev in izvajanje sistema kakovosti z notranjimi revizijami, medsebojnimi evalvacijami ter aktivnim upravljanjem registra tveganj."},
  {"id":"T${pmWpNum}.4","title":"Finančno upravljanje in revizijska pripravljenost","startDate":"${projectStart}","endDate":"${projectEnd}","dependencies":[{"predecessorId":"T${pmWpNum}.1","type":"SS"}],"description":"Upravljanje projektnega proračuna, spremljanje porabe po partnerjih, priprava finančnih poročil in zagotavljanje revizijske sledi."},
  {"id":"T${pmWpNum}.5","title":"Zaključno poročilo in zaprtje projekta","startDate":"${pm_closing}","endDate":"${projectEnd}","dependencies":[{"predecessorId":"T${pmWpNum}.2","type":"FF"}],"description":"Priprava zaključnega tehničnega in finančnega poročila, prenos znanja, arhiviranje dokumentacije in formalno zaprtje projekta."}
]}
Sledi temu vzorcu. Spremeni naslove in opise glede na kontekst projekta, ampak DATUMI morajo biti identični. Mejnik na ali pred ${projectEnd}.
═══════════════════════════════════════════════════════════════════`

        : `YOU ARE AN EXPERIENCED PROJECT MANAGEMENT EXPERT (PMP/PRINCE2) with 20+ years managing EU projects.
AS AN EXPERT YOU KNOW: PM tasks (coordination, monitoring, quality, finance) RUN IN PARALLEL throughout the ENTIRE project. Coordination NEVER ends before project closure. Financial management is ONGOING. Progress monitoring is CYCLICAL. The ONLY short task is the final report at the end.
WRONG = sequential short tasks, tasks compressed into same period, tasks ending before project end.

This WP is "Project Management and Coordination" (LAST WP).

═══ IRON RULE FOR DATES (VIOLATION = REJECTION) ═══
EVERY task except the final report MUST have endDate = ${projectEnd}.

MANDATORY DATES:
  T${pmWpNum}.1: startDate="${projectStart}", endDate="${projectEnd}"
  T${pmWpNum}.2: startDate="${projectStart}", endDate="${projectEnd}"
  T${pmWpNum}.3: startDate="${pm_m3}",         endDate="${projectEnd}"
  T${pmWpNum}.4: startDate="${projectStart}", endDate="${projectEnd}"
  T${pmWpNum}.5: startDate="${pm_closing}",    endDate="${projectEnd}"

JSON EXAMPLE:
{"tasks":[
  {"id":"T${pmWpNum}.1","title":"Consortium Coordination and Operational Management","startDate":"${projectStart}","endDate":"${projectEnd}","dependencies":[],"description":"Overall coordination of project activities including consortium meetings, partner communication management, and compliance with grant agreement obligations."},
  {"id":"T${pmWpNum}.2","title":"Progress Monitoring and Reporting Cycle Execution","startDate":"${projectStart}","endDate":"${projectEnd}","dependencies":[{"predecessorId":"T${pmWpNum}.1","type":"SS"}],"description":"Continuous monitoring of project progress through regular interim reports, annual reviews, and early warning mechanisms for deviations from the work plan."},
  {"id":"T${pmWpNum}.3","title":"Quality Assurance and Risk Management Framework","startDate":"${pm_m3}","endDate":"${projectEnd}","dependencies":[{"predecessorId":"T${pmWpNum}.1","type":"SS"}],"description":"Establishment and execution of the quality management system including internal audits, peer evaluations, and active risk register management."},
  {"id":"T${pmWpNum}.4","title":"Financial Management and Audit Preparation","startDate":"${projectStart}","endDate":"${projectEnd}","dependencies":[{"predecessorId":"T${pmWpNum}.1","type":"SS"}],"description":"Budget management, expenditure tracking per partner, financial reporting preparation, and audit trail maintenance."},
  {"id":"T${pmWpNum}.5","title":"Final Project Closure and Knowledge Transfer","startDate":"${pm_closing}","endDate":"${projectEnd}","dependencies":[{"predecessorId":"T${pmWpNum}.2","type":"FF"}],"description":"Preparation of final technical and financial reports, knowledge transfer activities, documentation archiving, and formal project closure."}
]}
Follow this pattern. Adapt titles and descriptions to the project context, but DATES must be identical. Milestone on or before ${projectEnd}.
═══════════════════════════════════════════════════════════════════`;

            } else if (isSecondToLast) {
      // ★ v5.3: Expert identity + concrete dates + JSON example for Dissemination WP
      const dissStart = new Date(projectStart + 'T00:00:00Z');
      const dissEnd = new Date(projectEnd + 'T00:00:00Z');
      const dissTotal = dissEnd.getTime() - dissStart.getTime();
      const toISOd = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
      const diss_setup_end = toISOd(new Date(dissStart.getTime() + dissTotal * 0.15));
      const diss_m2 = toISOd(new Date(dissStart.getTime() + dissTotal * 0.05));
      const diss_m6 = toISOd(new Date(dissStart.getTime() + dissTotal * 0.15));
      const diss_m12 = toISOd(new Date(dissStart.getTime() + dissTotal * 0.33));
      const dissWpNum = scaffold.length - 1;

      wpTypeInstruction = language === 'si'
        ? `SI IZKUŠEN STROKOVNJAK ZA DISEMINACIJO IN KOMUNIKACIJO V EU PROJEKTIH z 20+ leti izkušenj.
KOT STROKOVNJAK VEŠ: vizualna identiteta se vzpostavi NA ZAČETKU (kratka setup naloga). Spletna stran se upravlja od vzpostavitve DO KONCA. Dogodki se organizirajo od zgodnje faze DO KONCA. Publikacije se pripravljajo od sredine DO KONCA. Eksploatacijska strategija se razvija od ~33% projekta DO KONCA.
NAPAČNO = vse naloge stisnjene na konec, vse na začetek, naloge ki se končajo pred koncem projekta.

Ta DS je "Diseminacija, komunikacija in izkoriščanje rezultatov" (PREDZADNJI DS).

═══ ŽELEZNO PRAVILO ZA DATUME (KRŠITEV = ZAVRNITEV) ═══
Vse naloge RAZEN T${dissWpNum}.1 (setup) MORAJO imeti endDate = ${projectEnd}.

OBVEZNI DATUMI:
  T${dissWpNum}.1: startDate="${projectStart}", endDate="${diss_setup_end}"  ← SAMO ta je kratka
  T${dissWpNum}.2: startDate="${diss_m2}",      endDate="${projectEnd}"      ← do konca!
  T${dissWpNum}.3: startDate="${diss_m6}",      endDate="${projectEnd}"      ← do konca!
  T${dissWpNum}.4: startDate="${diss_m6}",      endDate="${projectEnd}"      ← do konca!
  T${dissWpNum}.5: startDate="${diss_m12}",     endDate="${projectEnd}"      ← do konca!

JSON PRIMER:
{"tasks":[
  {"id":"T${dissWpNum}.1","title":"Vzpostavitev vizualne identitete in komunikacijskih kanalov","startDate":"${projectStart}","endDate":"${diss_setup_end}","dependencies":[{"predecessorId":"T1.1","type":"SS"}],"description":"Oblikovanje projektne vizualne identitete, logotipa, grafične predloge in vzpostavitev komunikacijskih kanalov (spletna stran, profili na družbenih omrežjih)."},
  {"id":"T${dissWpNum}.2","title":"Upravljanje spletne strani in družbenih omrežij","startDate":"${diss_m2}","endDate":"${projectEnd}","dependencies":[{"predecessorId":"T${dissWpNum}.1","type":"FS"}],"description":"Tekoče upravljanje projektne spletne strani z rednimi objavami napredka, rezultatov in dogodkov ter aktivno upravljanje profilov na družbenih omrežjih."},
  {"id":"T${dissWpNum}.3","title":"Organizacija strokovnih dogodkov in delavnic","startDate":"${diss_m6}","endDate":"${projectEnd}","dependencies":[{"predecessorId":"T${dissWpNum}.1","type":"FS"}],"description":"Načrtovanje in izvedba strokovnih dogodkov, delavnic, seminarjev in zaključne konference za diseminacijo rezultatov med ciljnimi skupinami."},
  {"id":"T${dissWpNum}.4","title":"Priprava publikacij in diseminacijskih poročil","startDate":"${diss_m6}","endDate":"${projectEnd}","dependencies":[{"predecessorId":"T${dissWpNum}.2","type":"SS"}],"description":"Priprava strokovnih publikacij, policy briefov, newsletterjev in diseminacijskih poročil za različne ciljne skupine."},
  {"id":"T${dissWpNum}.5","title":"Razvoj strategije za izkoriščanje rezultatov","startDate":"${diss_m12}","endDate":"${projectEnd}","dependencies":[{"predecessorId":"T${dissWpNum}.3","type":"SS"}],"description":"Razvoj celovite strategije za izkoriščanje projektnih rezultatov, vključno z načrtom komercializacije, odprtega dostopa in integracije v politike."}
]}
Sledi temu vzorcu. Spremeni naslove in opise glede na kontekst, ampak DATUMI morajo biti identični. Mejnik na ali pred ${projectEnd}.
═══════════════════════════════════════════════════════════════════`

        : `YOU ARE AN EXPERIENCED EU PROJECT DISSEMINATION AND COMMUNICATION EXPERT with 20+ years of experience.
AS AN EXPERT YOU KNOW: visual identity is established AT THE START (short setup task). Website is managed from setup UNTIL THE END. Events are organised from early phase UNTIL THE END. Publications from mid-project UNTIL THE END. Exploitation strategy from ~33% UNTIL THE END.
WRONG = all tasks compressed to the end, all to the start, tasks ending before project end.

This WP is "Dissemination, Communication and Exploitation of Results" (SECOND-TO-LAST WP).

═══ IRON RULE FOR DATES (VIOLATION = REJECTION) ═══
All tasks EXCEPT T${dissWpNum}.1 (setup) MUST have endDate = ${projectEnd}.

MANDATORY DATES:
  T${dissWpNum}.1: startDate="${projectStart}", endDate="${diss_setup_end}"  ← ONLY this one is short
  T${dissWpNum}.2: startDate="${diss_m2}",      endDate="${projectEnd}"      ← to the end!
  T${dissWpNum}.3: startDate="${diss_m6}",      endDate="${projectEnd}"      ← to the end!
  T${dissWpNum}.4: startDate="${diss_m6}",      endDate="${projectEnd}"      ← to the end!
  T${dissWpNum}.5: startDate="${diss_m12}",     endDate="${projectEnd}"      ← to the end!

JSON EXAMPLE:
{"tasks":[
  {"id":"T${dissWpNum}.1","title":"Establishment of Visual Identity and Communication Channels","startDate":"${projectStart}","endDate":"${diss_setup_end}","dependencies":[{"predecessorId":"T1.1","type":"SS"}],"description":"Design of project visual identity, logo, graphic templates, and establishment of communication channels (website, social media profiles)."},
  {"id":"T${dissWpNum}.2","title":"Website and Social Media Management","startDate":"${diss_m2}","endDate":"${projectEnd}","dependencies":[{"predecessorId":"T${dissWpNum}.1","type":"FS"}],"description":"Ongoing management of project website with regular updates on progress, results, and events, plus active social media profile management."},
  {"id":"T${dissWpNum}.3","title":"Organisation of Professional Events and Workshops","startDate":"${diss_m6}","endDate":"${projectEnd}","dependencies":[{"predecessorId":"T${dissWpNum}.1","type":"FS"}],"description":"Planning and execution of professional events, workshops, seminars, and a closing conference for disseminating results to target groups."},
  {"id":"T${dissWpNum}.4","title":"Preparation of Publications and Dissemination Reports","startDate":"${diss_m6}","endDate":"${projectEnd}","dependencies":[{"predecessorId":"T${dissWpNum}.2","type":"SS"}],"description":"Preparation of professional publications, policy briefs, newsletters, and dissemination reports for various target audiences."},
  {"id":"T${dissWpNum}.5","title":"Development of Results Exploitation Strategy","startDate":"${diss_m12}","endDate":"${projectEnd}","dependencies":[{"predecessorId":"T${dissWpNum}.3","type":"SS"}],"description":"Development of a comprehensive exploitation strategy including commercialisation plan, open access provisions, and policy integration roadmap."}
]}
Follow this pattern. Adapt titles and descriptions to the project context, but DATES must be identical. Milestone on or before ${projectEnd}.
═══════════════════════════════════════════════════════════════════`;



    } else {
      wpTypeInstruction = language === 'si'
        ? `Ta DS je vsebinski/tehnični DS. Traja od ${wp.startDate} do ${wp.endDate}. NE sme trajati celotno obdobje projekta. Naloge so zaporedne ali zamaknjene znotraj tega obdobja.`
        : `This is a content/thematic WP. It runs from ${wp.startDate} to ${wp.endDate}. It MUST NOT span the entire project duration. Tasks are sequential or staggered within this period.`;
    }

    let prevWPsContext = '';
    if (fullActivities.length > 0) {
      const prevSummary = fullActivities.map(w => ({
        id: w.id,
        title: w.title,
        tasks: w.tasks?.map((t: any) => ({ id: t.id, title: t.title, startDate: t.startDate, endDate: t.endDate }))
      }));
      prevWPsContext = language === 'si'
        ? `\nŽE GENERIRANI DS (uporabi za cross-WP odvisnosti — tvoje naloge se MORAJO sklicevati na predhodnike iz teh DS kjer je logično):\n${JSON.stringify(prevSummary, null, 2)}`
        : `\nALREADY GENERATED WPs (use for cross-WP dependencies — your tasks MUST reference predecessors from these WPs where logical):\n${JSON.stringify(prevSummary, null, 2)}`;
    }

    const scaffoldOverview = language === 'si'
      ? `\nCELOTEN SCAFFOLD PROJEKTA:\n${scaffold.map(s => `  ${s.id}: "${s.title}" (${s.startDate} → ${s.endDate})`).join('\n')}`
      : `\nFULL PROJECT SCAFFOLD:\n${scaffold.map(s => `  ${s.id}: "${s.title}" (${s.startDate} → ${s.endDate})`).join('\n')}`;

    const firstTaskId = `T${wpNum}.1`;
    const isFirstWP = i === 0;

    const wpPrompt = [
      temporalRule,
      langDirective,
      language === 'si'
        ? `NALOGA: Generiraj CELOTEN delovni sklop ${wp.id}: "${wp.title}" z nalogami, mejniki in dosežki.
Vrni EN JSON objekt (ne array) s strukturo: { "id": "${wp.id}", "title": "${wp.title}", "tasks": [...], "milestones": [...], "deliverables": [...] }`
        : `TASK: Generate the COMPLETE work package ${wp.id}: "${wp.title}" with tasks, milestones, and deliverables.
Return ONE JSON object (not array): { "id": "${wp.id}", "title": "${wp.title}", "tasks": [...], "milestones": [...], "deliverables": [...] }`,
      wpTypeInstruction,
      scaffoldOverview,
      prevWPsContext,
      language === 'si'
        ? `\nPRAVILA ZA ${wp.id}:
- 2–5 nalog z zaporednimi/zamaknjenimi datumi znotraj ${wp.startDate} do ${wp.endDate}
- Task ID format: T${wpNum}.1, T${wpNum}.2, T${wpNum}.3...
- Vsaj 1 mejnik z datumom v YYYY-MM-DD
- Vsaj 1 dosežek s polji: title (samostalniška zveza), description (2–4 stavki), indicator (specifičen, merljiv)
- ${isFirstWP ? `Naloga ${firstTaskId} NIMA odvisnosti (je izhodišče projekta)` : `Naloga ${firstTaskId} MORA imeti vsaj 1 cross-WP odvisnost na nalogo iz predhodnega DS`}
- Vse ostale naloge v tem DS imajo vsaj 1 odvisnost (FS, SS, FF ali SF)
- Naslovi nalog: samostalniške zveze, NE nedoločniki
- BREZ markdown (**, ##, \`)
- Piši kot izkušen EU projektni svetovalec`
        : `\nRULES FOR ${wp.id}:
- 2–5 tasks with sequential/staggered dates within ${wp.startDate} to ${wp.endDate}
- Task ID format: T${wpNum}.1, T${wpNum}.2, T${wpNum}.3...
- At least 1 milestone with date in YYYY-MM-DD
- At least 1 deliverable with fields: title (noun phrase), description (2–4 sentences), indicator (specific, measurable)
- ${isFirstWP ? `Task ${firstTaskId} has NO dependencies (it is the project starting point)` : `Task ${firstTaskId} MUST have at least 1 cross-WP dependency on a task from a previous WP`}
- All other tasks in this WP have at least 1 dependency (FS, SS, FF, or SF)
- Task titles: noun phrases, NOT infinitive verbs
- NO markdown (**, ##, \`)
- Write like an experienced EU project consultant`,
      context,
      academicRules,
      humanRules,
      sectionRules,
      temporalRule,
    ].filter(Boolean).join('\n\n');

    const wpResult = await generateContent({
      prompt: wpPrompt,
      jsonSchema: useNativeSchema ? wpItemSchema : undefined,
      jsonMode: !useNativeSchema,
      sectionKey: 'activities',
    });

    const wpStr = wpResult.text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    let wpData = JSON.parse(wpStr);

    if (Array.isArray(wpData)) {
      wpData = wpData[0] || {};
    }

    wpData.id = wp.id;
    wpData.title = wpData.title || wp.title;

    wpData = stripMarkdown(wpData);

    fullActivities.push(wpData);

    console.log(`[PerWP] ${wp.id} generated: ${wpData.tasks?.length || 0} tasks, ${wpData.milestones?.length || 0} milestones, ${wpData.deliverables?.length || 0} deliverables`);

    if (progressIdx < indicesToGenerate.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // ════════════════════════════════════════════════════════════
  // PHASE 3: Post-processing
  // ════════════════════════════════════════════════════════════

  console.log(`[PerWP] Phase 3: Post-processing ${fullActivities.length} WPs...`);

  let mergedActivities: any[];
  if (onlyIndices && existingScaffold) {
    mergedActivities = [...(projectData.activities || [])];
    for (const wpData of fullActivities) {
      const idx = mergedActivities.findIndex((w: any) => w.id === wpData.id);
      if (idx >= 0) {
        const existing = mergedActivities[idx];
        const hasTasks = existing.tasks && existing.tasks.length > 0
          && existing.tasks.some((t: any) => t.title && t.title.trim().length > 0);
        const hasMilestones = existing.milestones && existing.milestones.length > 0
          && existing.milestones.some((m: any) => m.description && m.description.trim().length > 0);
        const hasDeliverables = existing.deliverables && existing.deliverables.length > 0
          && existing.deliverables.some((d: any) => d.title && d.title.trim().length > 0);

        mergedActivities[idx] = {
          ...existing,
          tasks: hasTasks ? existing.tasks : (wpData.tasks || existing.tasks || []),
          milestones: hasMilestones ? existing.milestones : (wpData.milestones || existing.milestones || []),
          deliverables: hasDeliverables ? existing.deliverables : (wpData.deliverables || existing.deliverables || []),
        };
      } else {
        mergedActivities.push(wpData);
      }
    }
  } else {
    mergedActivities = fullActivities;
  }

  let result = sanitizeActivities(mergedActivities);

  result = enforceTemporalIntegrity(result, projectData);

  console.log(`[PerWP] Complete! ${result.length} WPs with ${result.reduce((sum: number, wp: any) => sum + (wp.tasks?.length || 0), 0)} total tasks.`);

  return result;
};

// ─── TRANSLATION ─────────────────────────────────────────────────

export const translateProjectContent = async (
  projectData: any,
  targetLanguage: 'en' | 'si'
) => {
  const langName = targetLanguage === 'si' ? 'Slovenian' : 'English';
  const translationRules = getTranslationRules(targetLanguage);
  const formattedTranslationRules = formatRulesAsList(translationRules);

  const prompt = [
    `You are a professional translator for EU Project Proposals.`,
    `Translate the following JSON object strictly into ${langName}.`,
    `RULES:\n- ${formattedTranslationRules}`,
    `Return ONLY the valid JSON string.`,
    `\nJSON to Translate:\n${JSON.stringify(projectData)}`
  ].join('\n');

  const result = await generateContent({
    prompt,
    jsonMode: true,
    sectionKey: 'translation',
  });
  const jsonStr = result.text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
  return JSON.parse(jsonStr);
};

// ─── RE-EXPORTS ──────────────────────────────────────────────────

export const detectProjectLanguage = detectLanguage;

