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
//   1. getContext() includes sections when EITHER title OR description exists
//   2. generateFieldContent() injects sibling field values into prompt
//   3. Strong bilingual language directive in every prompt
//   4. New 'enhance' mode for professional deepening of existing content
//   5. Quality Enforcement block at the end of every section prompt
//   6. Strengthened section-specific task instructions with explicit
//      citation/depth requirements
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

// ─── QUALITY ENFORCEMENT (appended to every section prompt) ──────

const getQualityEnforcement = (sectionKey: string, language: 'en' | 'si'): string => {
  const checks: Record<string, { en: string[]; si: string[] }> = {
    problemAnalysis: {
      en: [
        'Every cause description contains ≥1 specific citation in format (Source Name, Year) — e.g. (Eurostat, 2023)',
        'Every consequence description contains ≥1 specific citation in format (Source Name, Year)',
        'The core problem statement includes at least one quantitative indicator (percentage, number, trend)',
        'Every description paragraph has ≥3 substantive, analytical sentences — no filler',
        'No vague phrases such as "various stakeholders", "different aspects", "multiple factors" — be specific',
        'At least 4 distinct, non-overlapping causes are listed',
        'At least 4 distinct consequences are listed, with at least one referencing an EU-level policy concern',
        'Causes are logically ordered: root causes first, then proximate causes',
        'All cited sources are real, verifiable EU/international publications — do NOT fabricate statistics',
      ],
      si: [
        'Vsak opis vzroka vsebuje ≥1 specifičen citat v formatu (Ime vira, Leto) — npr. (Eurostat, 2023)',
        'Vsak opis posledice vsebuje ≥1 specifičen citat v formatu (Ime vira, Leto)',
        'Izjava o osrednjem problemu vključuje vsaj en kvantitativni kazalnik (odstotek, število, trend)',
        'Vsak opisni odstavek ima ≥3 vsebinske, analitične stavke — brez polnil',
        'Brez nejasnih fraz kot "različni deležniki", "različni vidiki", "številni dejavniki" — bodi specifičen',
        'Navedenih je vsaj 5 ločenih, neprekrivajočih se vzrokov',
        'Navedene so vsaj 4 ločene posledice, vsaj ena se sklicuje na skrb na ravni EU politike',
        'Vzroki so logično urejeni: najprej temeljni vzroki, nato neposredni',
        'Vsi navedeni viri so resnični, preverljivi EU/mednarodni dokumenti — NE izmišljuj statistik',
      ]
    },
    projectIdea: {
      en: [
        'State of the Art references ≥3 specific existing projects, products, or studies with names and years',
        'Proposed Solution is structured in clear phases with specific methodological descriptions',
        'Main Aim is one comprehensive sentence starting with "The main aim..."',
        'At least 3 relevant EU policies are listed with specific descriptions of alignment',
        'All readiness levels include a specific justification (not just the number)',
      ],
      si: [
        'Stanje tehnike navaja ≥3 specifične obstoječe projekte, produkte ali študije z imeni in letnicami',
        'Predlagana rešitev je strukturirana v jasne faze s specifičnimi metodološkimi opisi',
        'Glavni cilj je en celovit stavek, ki se začne z "Glavni cilj..."',
        'Navedene so vsaj 3 relevantne EU politike s specifičnimi opisi usklajenosti',
        'Vse stopnje pripravljenosti vključujejo specifično utemeljitev (ne samo številke)',
      ]
    },
    _default: {
      en: [
        'Every description has ≥3 substantive sentences',
        'All titles begin with an infinitive verb',
        'No vague filler phrases — be specific and analytical',
        'Content is directly linked to the project context and problem analysis',
      ],
      si: [
        'Vsak opis ima ≥3 vsebinske stavke',
        'Vsi naslovi se začnejo z glagolom v nedoločniku',
        'Brez nejasnih fraz — bodi specifičen in analitičen',
        'Vsebina je neposredno povezana s kontekstom projekta in analizo problemov',
      ]
    }
  };

  const lang = language;
  const sectionChecks = checks[sectionKey]?.[lang] || checks._default[lang];

  const header = language === 'si'
    ? '═══ KONTROLA KAKOVOSTI — PREVERI PRED ODDAJO ODGOVORA ═══'
    : '═══ QUALITY GATE — VERIFY BEFORE RETURNING YOUR RESPONSE ═══';
  const footer = language === 'si'
    ? 'Če katerakoli točka NI izpolnjena, POPRAVI odgovor preden ga vrneš.'
    : 'If ANY check FAILS, REVISE your response before returning it.';

  return `\n${header}\n${sectionChecks.map((c, i) => `☐ ${i + 1}. ${c}`).join('\n')}\n${footer}\n═══════════════════════════════════════════════════════════════════`;
};

// ─── PROJECT CONTEXT BUILDER (v3.3 — fixed) ─────────────────────

const getContext = (projectData: any): string => {
  const sections: string[] = [];

  const pa = projectData.problemAnalysis;
  if (pa?.coreProblem?.title || pa?.coreProblem?.description ||
      pa?.causes?.length > 0 || pa?.consequences?.length > 0) {
    sections.push(`Problem Analysis:\n${JSON.stringify(pa, null, 2)}`);
  }

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

// ─── PROMPT BUILDER (v3.3) ───────────────────────────────────────

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

  // v3.3: Mode instruction (fill / enhance / regenerate)
  let modeInstruction: string;

  if (mode === 'fill') {
    modeInstruction = language === 'si'
      ? `\nNAČIN: DOPOLNJEVANJE MANJKAJOČEGA.\nObstoječi podatki: ${JSON.stringify(currentSectionData)}\nPRAVILA:\n1. OHRANI vsa obstoječa neprazna polja natančno takšna, kot so — NE spreminjaj jih.\n2. GENERIRAJ strokovno vsebino SAMO za polja, ki so prazni nizi ("") ali manjkajoča.\n3. Če ima seznam manj elementov od priporočenega, DODAJ NOVE ELEMENTE.\n4. Zagotovi veljaven JSON objekt.\n`
      : `\nMODE: FILL MISSING ONLY.\nExisting data: ${JSON.stringify(currentSectionData)}\nRULES:\n1. KEEP all existing non-empty fields exactly as they are — do NOT modify them.\n2. GENERATE professional content ONLY for fields that are empty strings ("") or missing.\n3. If a list has fewer items than recommended, ADD NEW ITEMS.\n4. Ensure valid JSON output.\n`;

  } else if (mode === 'enhance') {
    modeInstruction = language === 'si'
      ? `\nNAČIN: STROKOVNA IZBOLJŠAVA OBSTOJEČEGA BESEDILA.\nObstoječi podatki: ${JSON.stringify(currentSectionData)}\n\nNaloga: STROKOVNO IZBOLJŠAJ, POGLOBI in DODELAJ obstoječo vsebino po pravilih EU projektov.\n\nPRAVILA:\n1. OHRANI pomen in tematiko — NE spreminjaj vsebinskega fokusa ali teme.\n2. IZBOLJŠAJ: dodaj strokovno EU terminologijo, poglobi argumente.\n3. DODAJ CITATE: vsak vzrok/posledica/opis MORA vsebovati vsaj en specifičen citat iz realnega vira v formatu (Ime vira, Leto) — npr. (Eurostat, 2023), (OECD, 2024), (Evropska komisija, 2023).\n4. PODALJŠAJ: kratka polja razširi na vsaj 3–5 vsebinskih, analitičnih stavkov.\n5. DOPOLNI: če je seznam kratek, DODAJ NOVE ELEMENTE.\n6. POPRAVI: odpravi slovnične napake, nedoslednosti, nejasnosti.\n7. NE BRIŠI: nikoli ne odstranjuj obstoječih elementov.\n8. FORMATIRAJ: zagotovi skladnost z globalnimi pravili (nedoločniški glagoli, citati, EU terminologija).\n9. Zagotovi veljaven JSON objekt.\n`
      : `\nMODE: PROFESSIONAL ENHANCEMENT OF EXISTING CONTENT.\nExisting data: ${JSON.stringify(currentSectionData)}\n\nTask: PROFESSIONALLY ENHANCE, DEEPEN, and REFINE the existing content according to EU project proposal standards.\n\nRULES:\n1. PRESERVE the meaning and topic of every field — do NOT change the subject or thematic focus.\n2. ENHANCE: add professional EU terminology, deepen arguments with specific evidence.\n3. ADD CITATIONS: every cause/consequence/description MUST contain at least one specific citation from a real source in format (Source Name, Year) — e.g. (Eurostat, 2023), (OECD, 2024), (European Commission, 2023).\n4. EXPAND: extend short fields to at least 3–5 substantive, analytical sentences.\n5. SUPPLEMENT: if a list has fewer items than recommended, ADD NEW ITEMS.\n6. CORRECT: fix grammatical errors, inconsistencies, ambiguities.\n7. NEVER REMOVE: do not delete existing items or list entries.\n8. FORMAT: ensure compliance with all global rules (infinitive verbs in titles, citations, EU terminology).\n9. Ensure valid JSON output.\n`;

  } else {
    modeInstruction = language === 'si'
      ? "NAČIN: POPOLNA PONOVNA GENERACIJA.\nGeneriraj popolnoma nov, celovit, strokoven odgovor za ta razdelek na podlagi konteksta. Vsak opis MORA vsebovati specifične citate iz realnih virov."
      : "MODE: FULL REGENERATION.\nGenerate a completely new, comprehensive, professional response for this section based on the context. Every description MUST contain specific citations from real sources.";
  }

  const globalRulesHeader = language === 'si' ? 'GLOBALNA PRAVILA' : 'GLOBAL RULES';

  // Section-specific task instruction
  const taskInstruction = getSectionTaskInstruction(sectionKey, projectData, language);

  // v3.3: Quality enforcement as the LAST element (highest attention)
  const qualityGate = getQualityEnforcement(sectionKey, language);

  // v3.3: Prompt order optimized for AI attention:
  // 1. Language (FIRST — highest priority)
  // 2. Context (what the project is about)
  // 3. Mode (what to do)
  // 4. Global rules
  // 5. Section rules
  // 6. Schema (if needed)
  // 7. Task instruction
  // 8. Quality gate (LAST — second highest priority due to recency bias)
  const prompt = [
    langDirective,
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

// ─── SECTION-SPECIFIC TASK INSTRUCTIONS (v3.3 — strengthened) ────

const getSectionTaskInstruction = (
  sectionKey: string,
  projectData: any,
  language: 'en' | 'si'
): string => {
  switch (sectionKey) {
    case 'problemAnalysis': {
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
        ? `UPORABNIKOV VNOS ZA OSREDNJI PROBLEM:\n${userInput}\n\nNALOGA: Na podlagi ZGORNJEGA VNOSA ustvari (ali dopolni) podrobno analizo problemov.\n\nOBVEZNE ZAHTEVE:\n- Generirani naslov in opis MORATA biti neposredno vsebinsko povezana z uporabnikovim vnosom.\n- NE izmišljuj nepovezanih tem.\n- Vsak VZROK mora vsebovati: naslov (samostalnik ali gerund), opis s 3–5 stavki, IN vsaj 1 specifičen statistični podatek s citacijo iz realnega vira — npr. "(Eurostat, 2023: 47 % energetskih omrežij v EU...)".\n- Vsaka POSLEDICA mora vsebovati: naslov, opis s 3–5 stavki, IN vsaj 1 citat iz realnega vira.\n- Osrednji problem MORA vključevati vsaj en kvantitativni kazalnik.\n- NIKOLI ne piši generičnih opisov brez podatkov.`
        : `USER INPUT FOR CORE PROBLEM:\n${userInput}\n\nTASK: Based STRICTLY on the USER INPUT ABOVE, create (or complete) a detailed problem analysis.\n\nMANDATORY REQUIREMENTS:\n- The generated title and description MUST be directly related to the user's input.\n- Do NOT invent unrelated topics.\n- Every CAUSE must contain: a title (noun/gerund), a 3–5 sentence description, AND at least 1 specific statistical data point with citation from a real source — e.g. "(Eurostat, 2023: 47% of EU energy grids...)".\n- Every CONSEQUENCE must contain: a title, a 3–5 sentence description, AND at least 1 citation from a real source.\n- The core problem MUST include at least one quantitative indicator.\n- NEVER write generic descriptions without evidence.`;
    }

    case 'projectIdea':
      return language === 'si'
        ? 'Na podlagi analize problemov razvij (ali dopolni) celovito projektno idejo.\n\nOBVEZNE ZAHTEVE:\n- Stanje tehnike (State of the Art) MORA navajati vsaj 3 specifične obstoječe projekte ali študije z imeni in letnicami.\n- Predlagana rešitev MORA biti strukturirana v jasne faze (Faza 1, 2, 3...) s specifičnimi metodami.\n- EU politike morajo biti resnične in preverljive — NE izmišljuj imen politik.'
        : 'Based on the problem analysis, develop (or complete) a comprehensive project idea.\n\nMANDATORY REQUIREMENTS:\n- State of the Art MUST reference at least 3 specific existing projects or studies with names and years.\n- Proposed Solution MUST be structured in clear phases (Phase 1, 2, 3...) with specific methods.\n- EU policies must be real and verifiable — do NOT invent policy names.';

    case 'generalObjectives':
      return language === 'si'
        ? 'Opredeli (ali dopolni) 3 do 5 širokih splošnih ciljev.\n\nOBVEZNO: Vsak naslov cilja se MORA začeti z glagolom v nedoločniku (npr. "Okrepiti...", "Razviti...", "Vzpostaviti...").\nVsak opis mora imeti vsaj 3 vsebinske stavke.'
        : 'Define (or complete) 3 to 5 broader general objectives.\n\nMANDATORY: Every objective title MUST begin with an infinitive verb (e.g. "Strengthen...", "Develop...", "Establish...").\nEvery description must have at least 3 substantive sentences.';

    case 'specificObjectives':
      return language === 'si'
        ? 'Opredeli (ali dopolni) vsaj 5 specifičnih S.M.A.R.T. ciljev.\n\nOBVEZNO: Vsak naslov cilja se MORA začeti z glagolom v nedoločniku.\nVsak cilj mora imeti merljiv kazalnik (KPI), ki meri uspeh, ne le dokončanje naloge.'
        : 'Define (or complete) at least 5 specific S.M.A.R.T. objectives.\n\nMANDATORY: Every objective title MUST begin with an infinitive verb.\nEvery objective must have a measurable indicator (KPI) that measures success, not just task completion.';

    case 'projectManagement':
      return language === 'si'
        ? 'Ustvari VISOKO PROFESIONALEN, PODROBEN razdelek o upravljanju in organizaciji projekta.\n\nVsebovati mora: koordinacijo, usmerjevalni odbor, WP voditelje, mehanizme odločanja, zagotavljanje kakovosti, obvladovanje konfliktov in poročanje.'
        : "Create a HIGHLY PROFESSIONAL, DETAILED project management and organization section.\n\nMust include: coordination structure, steering committee, WP leaders, decision-making mechanisms, quality assurance, conflict resolution, and reporting.";

    case 'activities': {
      const today = new Date().toISOString().split('T')[0];
      const projectStart = projectData.projectIdea?.startDate || today;
      return language === 'si'
        ? `Projekt se strogo začne dne ${projectStart}. Vsi začetni datumi nalog MORAJO biti na ali po tem datumu.\n\nNa podlagi specifičnih ciljev oblikuj (ali dopolni) podroben nabor delovnih sklopov (DS).\n\nOBVEZNO:\n- Vsak DS mora imeti: naslov z nedoločniškim glagolom, vsaj 3 naloge, vsaj 1 mejnik, vsaj 1 predvideni rezultat.\n- Predvideni rezultati morajo biti preverljivi z "desk review" — konkretni dokazi (PDF poročilo, spletna platforma, podpisan seznam prisotnih).\n- NE uporabljaj nejasnih opisov kot "izboljšano sodelovanje".`
        : `The project starts strictly on ${projectStart}. All task Start Dates MUST be on or after this date.\n\nBased on specific objectives, design (or complete) a detailed set of Work Packages (WPs).\n\nMANDATORY:\n- Each WP must have: title with infinitive verb, at least 3 tasks, at least 1 milestone, at least 1 deliverable.\n- Deliverables must be verifiable via desk review — concrete evidence (PDF report, web platform, signed attendance list).\n- Do NOT use vague descriptions like "improved cooperation".`;
    }

    case 'outputs':
      return language === 'si'
        ? 'Navedi (ali dopolni) vsaj 6 zelo podrobnih, oprijemljivih neposrednih rezultatov.\n\nVsak rezultat mora imeti: naslov z nedoločniškim glagolom, opis s 3+ stavki, in merljiv kazalnik.'
        : 'List (or complete) at least 6 very detailed, tangible outputs.\n\nEach output must have: title with infinitive verb, description with 3+ sentences, and a measurable indicator.';

    case 'outcomes':
      return language === 'si'
        ? 'Opiši (ali dopolni) vsaj 6 vmesnih učinkov (srednjeročne spremembe).\n\nVsak učinek mora imeti: naslov z nedoločniškim glagolom, opis s 3+ stavki, in merljiv kazalnik.'
        : 'Describe (or complete) at least 6 medium-term outcomes.\n\nEach outcome must have: title with infinitive verb, description with 3+ sentences, and a measurable indicator.';

    case 'impacts':
      return language === 'si'
        ? 'Opiši (ali dopolni) vsaj 6 dolgoročnih vplivov.\n\nVsak vpliv mora imeti: naslov z nedoločniškim glagolom, opis s 3+ stavki (vključno s Pathway to Impact narativom), in merljiv kazalnik.'
        : 'Describe (or complete) at least 6 long-term impacts.\n\nEach impact must have: title with infinitive verb, description with 3+ sentences (including Pathway to Impact narrative), and a measurable indicator.';

    case 'risks':
      return language === 'si'
        ? 'Identificiraj (ali dopolni) vsaj 5 potencialnih kritičnih tveganj (Tehnično, Družbeno, Ekonomsko).\n\nVsako tveganje mora imeti: specifičen naslov, podroben opis, utemeljeno verjetnost in vpliv, ter konkretne ukrepe za ublažitev.'
        : 'Identify (or complete) at least 5 potential critical risks (Technical, Social, Economic).\n\nEach risk must have: specific title, detailed description, justified likelihood and impact, and concrete mitigation measures.';

    case 'kers':
      return language === 'si'
        ? 'Identificiraj (ali dopolni) vsaj 5 ključnih izkoriščljivih rezultatov (KIR).\n\nVsak KIR mora imeti: specifičen naslov, podroben opis, in konkretno strategijo izkoriščanja.'
        : 'Identify (or complete) at least 5 Key Exploitable Results (KERs).\n\nEach KER must have: specific title, detailed description, and a concrete exploitation strategy.';

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

  // v3.3: Only smartMerge in 'fill' mode
  // 'enhance' mode: AI returns the full improved version — use directly
  // 'regenerate' mode: AI returns completely new content — use directly
  if (mode === 'fill' && currentSectionData) {
    parsedData = smartMerge(currentSectionData, parsedData);
  }

  return parsedData;
};

// ─── FIELD CONTENT GENERATION (v3.3) ─────────────────────────────

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

  const langDirective = getLanguageDirective(language);

  const fieldRule = getFieldRule(fieldName, language);
  const fieldRuleText = fieldRule
    ? `\n${language === 'si' ? 'PRAVILO ZA TO POLJE' : 'FIELD-SPECIFIC RULE'}:\n${fieldRule}\n`
    : '';

  // v3.3: Inject sibling field values
  let siblingContext = '';
  try {
    let parentObj: any = projectData;
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

  const anchorNote = siblingContext
    ? (language === 'si'
      ? ' Generirano besedilo MORA biti neposredno vsebinsko povezano z obstoječimi podatki zgoraj.'
      : ' The generated text MUST be directly and substantively related to the existing data above.')
    : '';

  const taskLine = language === 'si'
    ? `Generiraj profesionalno, strokovno vrednost za ${specificContext} znotraj razdelka "${sectionName}". Vrni samo besedilo. Če je primerno, vključi specifičen citat iz realnega vira.${anchorNote}`
    : `Generate a professional, expert-level value for ${specificContext} within "${sectionName}". Just return the text value. Where appropriate, include a specific citation from a real source.${anchorNote}`;

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
