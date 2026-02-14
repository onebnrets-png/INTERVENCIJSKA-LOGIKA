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
// v4.2 — 2026-02-14 — RISK SCHEMA FIX
//   - FIXED: schemas.risks category enum — added 'environmental',
//     changed all values to lowercase to match RiskCategory type
//     and Instructions.ts rules.
//   - FIXED: schemas.risks likelihood/impact enums — changed from
//     uppercase ('Low','Medium','High') to lowercase ('low','medium','high')
//     to match RiskLikelihood/RiskImpact types and ProjectDisplay.tsx.
//   - All other code unchanged from v4.1.
//
// v4.1 — 2026-02-14 — SINGLE SOURCE OF TRUTH REFACTOR
//   All rule functions removed. Every rule block is imported
//   from Instructions.ts. Changing Instructions.ts = changing the law.
//   Fixed SECTION_TO_CHAPTER mapping to match Instructions.ts keys.
//   Fixed getRulesForSection to read chapter text as string (not .RULES array).
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
  getSectionTaskInstruction
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
    sections.push(`Project Idea:\n${JSON.stringify(pi, null, 2)}`);
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
    required: ['projectTitle', 'mainAim', 'stateOfTheArt', 'proposedSolution', 'policies', 'readinessLevels']
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
              description: { type: Type.STRING },
              indicator: { type: Type.STRING }
            },
            required: ['id', 'description', 'indicator']
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

  // ═══════════════════════════════════════════════════════════════
  // v4.2 FIX: Risk schema — lowercase enums + added 'environmental'
  // These enum values MUST match:
  //   - types.ts → RiskCategory, RiskLikelihood, RiskImpact
  //   - Instructions.ts → SECTION_TASK_INSTRUCTIONS.risks
  //   - ProjectDisplay.tsx → <select> option values + trafficColors keys
  // ═══════════════════════════════════════════════════════════════
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
  }
};

// ─── MAPPINGS (v4.1 — FIXED to match Instructions.ts CHAPTERS keys) ─

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
};

const SECTION_TO_SCHEMA: Record<string, string> = {
  problemAnalysis: 'problemAnalysis', projectIdea: 'projectIdea',
  generalObjectives: 'objectives', specificObjectives: 'objectives',
  projectManagement: 'projectManagement', activities: 'activities',
  outputs: 'results', outcomes: 'results', impacts: 'results',
  risks: 'risks', kers: 'kers',
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

// ─── RULES ASSEMBLER (v4.1 — reads chapter TEXT, not .RULES array) ─

const getRulesForSection = (sectionKey: string, language: 'en' | 'si'): string => {
  const instructions = getAppInstructions(language);
  const chapterKey = SECTION_TO_CHAPTER[sectionKey];
  if (chapterKey && instructions.CHAPTERS?.[chapterKey]) {
    const chapterContent = instructions.CHAPTERS[chapterKey];
    // CHAPTERS values are strings (full chapter text), not objects with .RULES
    if (typeof chapterContent === 'string' && chapterContent.trim().length > 0) {
      const header = language === 'si' ? 'PODROBNA PRAVILA ZA TO POGLAVJE' : 'DETAILED CHAPTER RULES';
      return `\n${header}:\n${chapterContent}\n`;
    }
    // Backward compat: if someone stored an object with .RULES array
    if (typeof chapterContent === 'object' && Array.isArray(chapterContent.RULES) && chapterContent.RULES.length > 0) {
      const header = language === 'si' ? 'STROGA PRAVILA ZA TA RAZDELEK' : 'STRICT RULES FOR THIS SECTION';
      return `\n${header}:\n- ${chapterContent.RULES.join('\n- ')}\n`;
    }
  }
  return '';
};

// ─── TASK INSTRUCTION BUILDER (uses Instructions.ts templates) ───

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
      break;
    }
  }

  return getSectionTaskInstruction(sectionKey, language, placeholders);
};

// ─── PROMPT BUILDER (v4.1 — ALL RULES FROM Instructions.ts) ─────

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

  // ALL rule blocks from Instructions.ts
  const langDirective = getLanguageDirective(language);
  const langMismatchNotice = detectInputLanguageMismatch(projectData, language);
  const academicRules = getAcademicRigorRules(language);
  const humanRules = getHumanizationRules(language);
  const titleRules = sectionKey === 'projectIdea' ? getProjectTitleRules(language) : '';

  // Mode instruction from Instructions.ts + existing data injection
  let modeInstruction = getModeInstruction(mode, language);
  if ((mode === 'fill' || mode === 'enhance') && currentSectionData) {
    const dataHeader = language === 'si' ? 'Obstoječi podatki' : 'Existing data';
    modeInstruction = `${modeInstruction}\n${dataHeader}: ${JSON.stringify(currentSectionData)}`;
  }

  const globalRulesHeader = language === 'si' ? 'GLOBALNA PRAVILA' : 'GLOBAL RULES';
  const taskInstruction = buildTaskInstruction(sectionKey, projectData, language);
  const qualityGate = getQualityGate(sectionKey, language);

  // Prompt assembly — order matters
  const prompt = [
    langDirective,
    langMismatchNotice,
    academicRules,
    humanRules,
    titleRules,
    context,
    modeInstruction,
    `${globalRulesHeader}:\n${globalRules}`,
    sectionRules,
    textSchema,
    taskInstruction,
    qualityGate
  ].filter(Boolean).join('\n\n');

  return { prompt, schema };
};

// ─── MAIN GENERATION FUNCTIONS ───────────────────────────────────

export const generateSectionContent = async (
  sectionKey: string,
  projectData: any,
  language: 'en' | 'si' = 'en',
  mode: string = 'regenerate'
) => {
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
  });

  const jsonStr = result.text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
  let parsedData = JSON.parse(jsonStr);

  if (sectionKey === 'projectIdea' && jsonStr.startsWith('[')) {
    throw new Error("API returned an array for projectIdea section, expected an object.");
  }

  if (sectionKey === 'activities' && Array.isArray(parsedData)) {
    parsedData = sanitizeActivities(parsedData);
  }

  if (sectionKey === 'projectIdea' && parsedData.proposedSolution) {
    let text = parsedData.proposedSolution;
    text = text.replace(
      /([^\n])\s*((?:Faza|Phase)\s+\d+(?::|\.))/g,
      '$1\n\n$2'
    );
    parsedData.proposedSolution = text;
  }

  // Sanitize project title
  if (sectionKey === 'projectIdea' && parsedData.projectTitle) {
    parsedData.projectTitle = sanitizeProjectTitle(parsedData.projectTitle);
  }

  if (mode === 'fill' && currentSectionData) {
    parsedData = smartMerge(currentSectionData, parsedData);
  }

  // Strip markdown from all string values
  parsedData = stripMarkdown(parsedData);

  // Re-sanitize title after stripMarkdown
  if (sectionKey === 'projectIdea' && parsedData.projectTitle) {
    parsedData.projectTitle = sanitizeProjectTitle(parsedData.projectTitle);
  }

  return parsedData;
};

// ─── FIELD CONTENT GENERATION (v4.1) ─────────────────────────────

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

  // ALL rule blocks from Instructions.ts
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

  // v4.1: Include chapter rules for field-level generation too
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

  const result = await generateContent({ prompt });

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

export const generateProjectSummary = async (
  projectData: any,
  language: 'en' | 'si' = 'en'
) => {
  const context = getContext(projectData);
  const summaryRules = getSummaryRules(language);
  const summaryRulesHeader = language === 'si' ? 'PRAVILA ZA POVZETEK' : 'SUMMARY RULES';
  const langDirective = getLanguageDirective(language);
  const academicRules = getAcademicRigorRules(language);
  const humanRules = getHumanizationRules(language);
  const formattedSummaryRules = formatRulesAsList(summaryRules);

  const prompt = [
    langDirective,
    academicRules,
    humanRules,
    context,
    `${summaryRulesHeader}:\n- ${formattedSummaryRules}`
  ].join('\n\n');

  const result = await generateContent({ prompt });
  return result.text;
};

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

  const result = await generateContent({ prompt, jsonMode: true });
  const jsonStr = result.text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
  return JSON.parse(jsonStr);
};

export const detectProjectLanguage = detectLanguage;
