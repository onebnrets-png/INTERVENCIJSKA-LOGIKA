// services/geminiService.ts
// ═══════════════════════════════════════════════════════════════
// AI content generation service.
//
// THIS FILE CONTAINS NO CONTENT RULES.
// All content rules, field rules, translation rules, and summary
// rules are read from services/Instructions.ts — the single
// source of truth.
//
// This file is responsible only for:
//  - Building project context strings
//  - Assembling prompts by combining Instructions rules + context
//  - Calling the AI provider
//  - Post-processing responses (JSON parsing, sanitization, merging)
//
// v3.3 — 2026-02-14 — FIXES:
//   1. getContext() now includes sections when EITHER title OR description exists
//   2. generateFieldContent() injects sibling field values into prompt
//   3. Strong bilingual language directive in every prompt
// ═══════════════════════════════════════════════════════════════

import { storageService } from './storageService.ts';
import {
  getAppInstructions,
  getFieldRule,
  getTranslationRules,
  getSummaryRules
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

// ─── STRONG LANGUAGE DIRECTIVE (used in every prompt) ────────────

const getLanguageDirective = (language: 'en' | 'si'): string => {
  if (language === 'si') {
    return `═══ LANGUAGE DIRECTIVE (MANDATORY — OVERRIDES ALL OTHER INSTRUCTIONS) ═══
You MUST write ALL output content — every title, every description,
every indicator, every single text value — EXCLUSIVELY in Slovenian
(slovenščina). Do NOT use English for ANY field value, even if the
context below is partially or fully in English. Translate concepts
into Slovenian; do not copy English phrases.
═══════════════════════════════════════════════════════════════════`;
  }
  return `═══ LANGUAGE DIRECTIVE (MANDATORY — OVERRIDES ALL OTHER INSTRUCTIONS) ═══
You MUST write ALL output content — every title, every description,
every indicator, every single text value — EXCLUSIVELY in British
English. Do NOT use any other language, even if the context below
is partially or fully in Slovenian.
═══════════════════════════════════════════════════════════════════`;
};

// ─── PROJECT CONTEXT BUILDER (v3.3 — fixed) ─────────────────────
// FIX: check title OR description for every section, so user-entered
//      descriptions are passed to the AI even when title is still empty.

const getContext = (projectData: any): string => {
  const sections: string[] = [];

  // FIX v3.3: check title OR description (was: title only)
  const pa = projectData.problemAnalysis;
  if (pa?.coreProblem?.title || pa?.coreProblem?.description ||
      pa?.causes?.length > 0 || pa?.consequences?.length > 0) {
    sections.push(`Problem Analysis:\n${JSON.stringify(pa, null, 2)}`);
  }

  // FIX v3.3: check mainAim OR stateOfTheArt OR proposedSolution
  const pi = projectData.projectIdea;
  if (pi?.mainAim || pi?.stateOfTheArt || pi?.proposedSolution) {
    sections.push(`Project Idea:\n${JSON.stringify(pi, null, 2)}`);
  }

  if (projectData.generalObjectives?.length > 0) {
    sections.push(`General Objectives:\n${JSON.stringify(projectData.generalObjectives, null, 2)}`);
  }
  if (projectData.specificObjectives?.length > 0) {
    sections.push(`Specific Objectives:\n${JSON.stringify(projectData.specificObjectives, null, 2)}`);
  }
  if (projectData.activities?.length > 0) {
    sections.push(`Activities (Work Packages):\n${JSON.stringify(projectData.activities, null, 2)}`);
  }
  if (projectData.outputs?.length > 0) {
    sections.push(`Outputs:\n${JSON.stringify(projectData.outputs, null, 2)}`);
  }
  if (projectData.outcomes?.length > 0) {
    sections.push(`Outcomes:\n${JSON.stringify(projectData.outcomes, null, 2)}`);
  }
  if (projectData.impacts?.length > 0) {
    sections.push(`Impacts:\n${JSON.stringify(projectData.impacts, null, 2)}`);
  }

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
      if (sType === 'array') {
        return { type: 'array', items: simplify(s.items) };
      }
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
    required: ['mainAim', 'stateOfTheArt', 'proposedSolution', 'policies', 'readinessLevels']
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
              description: { type: Type.STRING }
            },
            required: ['id', 'description']
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
  risks: {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        category: { type: Type.STRING, enum: ['Technical', 'Social', 'Economic'] },
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        likelihood: { type: Type.STRING, enum: ['Low', 'Medium', 'High'] },
        impact: { type: Type.STRING, enum: ['Low', 'Medium', 'High'] },
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

// ─── SECTION → CHAPTER MAPPING ───────────────────────────────────

const SECTION_TO_CHAPTER: Record<string, string> = {
  problemAnalysis: '1',
  projectIdea: '2',
  generalObjectives: '3_AND_4',
  specificObjectives: '3_AND_4',
  projectManagement: '5',
  activities: '5',
  risks: '5',
  outputs: '6',
  outcomes: '6',
  impacts: '6',
  kers: '6',
};

// ─── SECTION → SCHEMA MAPPING ────────────────────────────────────

const SECTION_TO_SCHEMA: Record<string, string> = {
  problemAnalysis: 'problemAnalysis',
  projectIdea: 'projectIdea',
  generalObjectives: 'objectives',
  specificObjectives: 'objectives',
  projectManagement: 'projectManagement',
  activities: 'activities',
  outputs: 'results',
  outcomes: 'results',
  impacts: 'results',
  risks: 'risks',
  kers: 'kers',
};

// ─── HELPERS ─────────────────────────────────────────────────────

const isValidDate = (d: any): boolean => d instanceof Date && !isNaN(d.getTime());

const sanitizeActivities = (activities: any[]): any[] => {
  const taskMap = new Map<string, { startDate: Date; endDate: Date }>();

  activities.forEach(wp => {
    if (wp.tasks) {
      wp.tasks.forEach((task: any) => {
        if (task.id && task.startDate && task.endDate) {
          taskMap.set(task.id, {
            startDate: new Date(task.startDate),
            endDate: new Date(task.endDate)
          });
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
            if (
              pred && curr &&
              isValidDate(pred.startDate) && isValidDate(pred.endDate) &&
              isValidDate(curr.startDate)
            ) {
              if (dep.type === 'FS' && curr.startDate <= pred.endDate) {
                dep.type = 'SS';
              }
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
      mergedArray.push(
        i < original.length ? smartMerge(original[i], generated[i]) : generated[i]
      );
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

// ─── RULES ASSEMBLER (reads from Instructions.ts) ───────────────

const getRulesForSection = (sectionKey: string, language: 'en' | 'si'): string => {
  const instructions = getAppInstructions(language);
  const chapterKey = SECTION_TO_CHAPTER[sectionKey];

  if (chapterKey && instructions.CHAPTERS?.[chapterKey]) {
    const rules = instructions.CHAPTERS[chapterKey].RULES || [];
    if (rules.length > 0) {
      const header = language === 'si'
        ? 'STROGA PRAVILA ZA TA RAZDELEK'
        : 'STRICT RULES FOR THIS SECTION';
      return `\n${header}:\n- ${rules.join('\n- ')}\n`;
    }
  }
  return '';
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
  const globalRules = instructions.GLOBAL_RULES.join('\n');
  const sectionRules = getRulesForSection(sectionKey, language);
  const schemaKey = SECTION_TO_SCHEMA[sectionKey];
  const schema = schemas[schemaKey];

  if (!schema) {
    throw new Error(`Unknown section key: ${sectionKey}`);
  }

  const config = getProviderConfig();
  const needsTextSchema = config.provider !== 'gemini';
  const textSchema = needsTextSchema ? schemaToTextInstruction(schema) : '';

  // v3.3: Strong language directive
  const langDirective = getLanguageDirective(language);

  // Fill vs regenerate instruction
  const fillInstruction = mode === 'fill'
    ? (language === 'si'
      ? `\nPOMEMBNO: NAČIN DOPOLNJEVANJA.\nUporabnik je podal obstoječe podatke za ta razdelek: ${JSON.stringify(currentSectionData)}.\nNaloga: DOPOLNI to podatkovno strukturo.\nPRAVILA:\n1. OHRANI vsa obstoječa neprazna polja natančno takšna, kot so.\n2. GENERIRAJ strokovno vsebino SAMO za polja, ki so prazni nizi ("") ali manjkajoča.\n3. Če ima seznam manj elementov od priporočenega (glej PRAVILA spodaj), DODAJ NOVE ELEMENTE.\n4. Zagotovi, da je končni izhod veljaven JSON objekt, ki ustreza celotni shemi.\n`
      : `\nIMPORTANT: COMPLETION MODE.\nThe user has provided existing data for this section: ${JSON.stringify(currentSectionData)}.\nYour task is to COMPLETE this data structure.\nRULES:\n1. KEEP all existing non-empty fields exactly as they are.\n2. GENERATE professional content ONLY for fields that are empty strings ("") or missing.\n3. If a list has fewer items than recommended (see RULES below), ADD NEW ITEMS.\n4. Ensure the final output is a valid JSON object matching the full schema.\n`)
    : (language === 'si'
      ? "Generiraj popolnoma nov, celovit odgovor za ta razdelek na podlagi konteksta."
      : "Generate a completely new, full response for this section based on the context.");

  const globalRulesHeader = language === 'si' ? 'GLOBALNA PRAVILA' : 'GLOBAL RULES';

  // Section-specific task instruction
  const taskInstruction = getSectionTaskInstruction(sectionKey, projectData, language);

  // v3.3: Language directive is FIRST — before everything else
  const prompt = [
    langDirective,
    context,
    fillInstruction,
    `${globalRulesHeader}:\n${globalRules}`,
    sectionRules,
    textSchema,
    taskInstruction
  ].filter(Boolean).join('\n\n');

  return { prompt, schema };
};

// ─── SECTION-SPECIFIC TASK INSTRUCTIONS ──────────────────────────
// v3.3: Now references BOTH title AND description of core problem

const getSectionTaskInstruction = (
  sectionKey: string,
  projectData: any,
  language: 'en' | 'si'
): string => {
  switch (sectionKey) {
    case 'problemAnalysis': {
      // v3.3 FIX: include BOTH title and description in the instruction
      const cp = projectData.problemAnalysis?.coreProblem;
      const titleStr = cp?.title?.trim() || '';
      const descStr = cp?.description?.trim() || '';

      let contextParts: string[] = [];
      if (titleStr) contextParts.push(language === 'si' ? `Naslov: "${titleStr}"` : `Title: "${titleStr}"`);
      if (descStr) contextParts.push(language === 'si' ? `Opis: "${descStr}"` : `Description: "${descStr}"`);

      const userInput = contextParts.length > 0
        ? contextParts.join('\n')
        : (language === 'si' ? '(uporabnik še ni vnesel podatkov)' : '(no user input yet)');

      return language === 'si'
        ? `UPORABNIKOV VNOS ZA OSREDNJI PROBLEM:\n${userInput}\n\nNa podlagi ZGORNJEGA VNOSA ustvari (ali dopolni) zelo podrobno analizo problemov v skladu s pravili. Generirani naslov in opis MORATA biti neposredno vsebinsko povezana z uporabnikovim vnosom. NE izmišljuj nepovezanih tem.`
        : `USER INPUT FOR CORE PROBLEM:\n${userInput}\n\nBased STRICTLY on the USER INPUT ABOVE, create (or complete) a very detailed problem analysis following the rules provided. The generated title and description MUST be directly and substantively related to the user's input. Do NOT invent unrelated topics.`;
    }

    case 'projectIdea':
      return language === 'si'
        ? 'Na podlagi analize problemov razvij (ali dopolni) celovito projektno idejo. Upoštevaj posebna pravila oblikovanja za predlagano rešitev.'
        : 'Based on the problem analysis, develop (or complete) a comprehensive project idea. Follow the specific formatting rules for the Proposed Solution.';

    case 'generalObjectives':
      return language === 'si'
        ? 'Opredeli (ali dopolni) 3 do 5 širokih splošnih ciljev. Dosledno upoštevaj pravilo skladnje z GLAGOLOM V NEDOLOČNIKU.'
        : 'Define (or complete) 3 to 5 broader, overall general objectives. Adhere strictly to the INFINITIVE VERB syntax rule.';

    case 'specificObjectives':
      return language === 'si'
        ? 'Opredeli (ali dopolni) vsaj 5 ustvarjalnih, specifičnih S.M.A.R.T. ciljev. Dosledno upoštevaj pravilo skladnje z GLAGOLOM V NEDOLOČNIKU.'
        : 'Define (or complete) at least 5 creative, specific S.M.A.R.T. objectives. Adhere strictly to the INFINITIVE VERB syntax rule.';

    case 'projectManagement':
      return language === 'si'
        ? 'Ustvari VISOKO PROFESIONALEN, PODROBEN razdelek \'Upravljanje in organizacija\' v skladu s strogimi EU najboljšimi praksami in posebnimi vsebinskimi pravili.'
        : "Create a HIGHLY PROFESSIONAL, DETAILED 'Management and Organization' section following strict EU best practices and the specific content rules provided.";

    case 'activities': {
      const today = new Date().toISOString().split('T')[0];
      const projectStart = projectData.projectIdea?.startDate || today;
      const dateNote = language === 'si'
        ? `Projekt se strogo začne dne ${projectStart}. Vsi začetni datumi nalog MORAJO biti na ali po tem datumu.`
        : `The project is strictly scheduled to start on ${projectStart}. All task Start Dates MUST be on or after this date.`;
      const task = language === 'si'
        ? 'Na podlagi specifičnih ciljev in rezultatov oblikuj (ali dopolni) podroben nabor delovnih sklopov (DS) v skladu s pravili glede količine, nalog in logike.'
        : 'Based on the specific objectives and outputs, design (or complete) a detailed set of Work Packages (WPs) following the rules regarding quantity, tasks, and logic.';
      return `${dateNote}\n${task}`;
    }

    case 'outputs':
      return language === 'si'
        ? 'Navedi (ali dopolni) vsaj 6 zelo podrobnih, oprijemljivih neposrednih rezultatov (predvidenih rezultatov).'
        : 'List (or complete) at least 6 very detailed, tangible results (deliverables).';

    case 'outcomes':
      return language === 'si'
        ? 'Opiši (ali dopolni) vsaj 6 vmesnih učinkov (srednjeročne spremembe).'
        : 'Describe (or complete) at least 6 intangible results (medium-term changes).';

    case 'impacts':
      return language === 'si'
        ? 'Opiši (ali dopolni) vsaj 6 dolgoročnih vplivov.'
        : 'Describe (or complete) at least 6 long-term impacts.';

    case 'risks':
      return language === 'si'
        ? 'Identificiraj (ali dopolni) vsaj 5 potencialnih kritičnih tveganj (Tehnično, Družbeno, Ekonomsko) z ustrezno logiko semaforja za izvoz v Docx.'
        : 'Identify (or complete) at least 5 potential critical risks (Technical, Social, Economic) with correct Traffic Light coloring logic for Docx export in mind.';

    case 'kers':
      return language === 'si'
        ? 'Identificiraj (ali dopolni) vsaj 5 ključnih izkoriščljivih rezultatov (KIR).'
        : 'Identify (or complete) at least 5 Key Exploitable Results (KERs).';

    default:
      return '';
  }
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
      /([^\n])\s*((?:\*\*|__)?(?:Faza|Phase)\s+\d+(?::|\.)(?:\*\*|__)?)/g,
      '$1\n\n$2'
    );
    parsedData.proposedSolution = text;
  }

  if (mode === 'fill' && currentSectionData) {
    parsedData = smartMerge(currentSectionData, parsedData);
  }

  return parsedData;
};

// ─── FIELD CONTENT GENERATION (v3.3 — major fix) ─────────────────
// FIX: Now injects sibling field values so AI always has context
//      even when generating a single field (e.g., title from description)

export const generateFieldContent = async (
  path: (string | number)[],
  projectData: any,
  language: 'en' | 'si' = 'en'
) => {
  const context = getContext(projectData);
  const fieldName = String(path[path.length - 1]);
  const sectionName = String(path[0]);

  const instructions = getAppInstructions(language);
  const globalRules = instructions.GLOBAL_RULES.join('\n');
  const globalRulesHeader = language === 'si' ? 'GLOBALNA PRAVILA' : 'GLOBAL RULES';

  // v3.3: Strong language directive
  const langDirective = getLanguageDirective(language);

  // Get field-specific rule from Instructions.ts
  const fieldRule = getFieldRule(fieldName, language);
  const fieldRuleText = fieldRule
    ? `\n${language === 'si' ? 'PRAVILO ZA TO POLJE' : 'FIELD-SPECIFIC RULE'}:\n${fieldRule}\n`
    : '';

  // ──────────────────────────────────────────────────────────────
  // v3.3 FIX: Inject sibling field values as direct context
  // This ensures the AI sees user-entered data in related fields
  // ──────────────────────────────────────────────────────────────
  let siblingContext = '';
  try {
    let parentObj: any = projectData;
    // Navigate to the parent object of the field being generated
    for (let i = 0; i < path.length - 1; i++) {
      if (parentObj && parentObj[path[i]] !== undefined) {
        parentObj = parentObj[path[i]];
      } else {
        parentObj = null;
        break;
      }
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
          ? 'OBSTOJEČI PODATKI V ISTEM RAZDELKU (uporabi kot osnovo za generiranje)'
          : 'EXISTING DATA IN THE SAME SECTION (use as the basis for generation)';
        siblingContext = `\n${header}:\n${siblings.join('\n')}\n`;
      }
    }
  } catch (e) {
    console.warn('[generateFieldContent] Could not extract sibling context:', e);
  }

  // Build contextual information based on the field path
  let specificContext = '';
  let extraInstruction = '';

  if (path.includes('milestones')) {
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
    specificContext = language === 'si'
      ? `polje "${fieldName}"`
      : `the field "${fieldName}"`;
  }

  // v3.3: Enhanced task line — explicitly tells AI to base output on sibling data
  const anchorNote = siblingContext
    ? (language === 'si'
      ? ' Generirano besedilo MORA biti neposredno vsebinsko povezano z obstoječimi podatki zgoraj.'
      : ' The generated text MUST be directly and substantively related to the existing data above.')
    : '';

  const taskLine = language === 'si'
    ? `Generiraj profesionalno vrednost za ${specificContext} znotraj razdelka "${sectionName}". Vrni samo besedilo.${anchorNote}`
    : `Generate a professional value for ${specificContext} within "${sectionName}". Just return the text value.${anchorNote}`;

  // v3.3: Language directive FIRST, sibling context prominently placed
  const prompt = [
    langDirective,
    context,
    siblingContext,
    `${globalRulesHeader}:\n${globalRules}`,
    fieldRuleText,
    extraInstruction,
    taskLine
  ].filter(Boolean).join('\n\n');

  const result = await generateContent({ prompt });
  return result.text;
};

export const generateProjectSummary = async (
  projectData: any,
  language: 'en' | 'si' = 'en'
) => {
  const context = getContext(projectData);
  const summaryRules = getSummaryRules(language);
  const summaryRulesHeader = language === 'si' ? 'PRAVILA ZA POVZETEK' : 'SUMMARY RULES';

  // v3.3: Strong language directive
  const langDirective = getLanguageDirective(language);

  const prompt = [
    langDirective,
    context,
    `${summaryRulesHeader}:\n- ${summaryRules.join('\n- ')}`
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

  const prompt = [
    `You are a professional translator for EU Project Proposals.`,
    `Translate the following JSON object strictly into ${langName}.`,
    `RULES:\n- ${translationRules.join('\n- ')}`,
    `Return ONLY the valid JSON string.`,
    `\nJSON to Translate:\n${JSON.stringify(projectData)}`
  ].join('\n');

  const result = await generateContent({ prompt, jsonMode: true });
  const jsonStr = result.text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
  return JSON.parse(jsonStr);
};

export const detectProjectLanguage = detectLanguage;
