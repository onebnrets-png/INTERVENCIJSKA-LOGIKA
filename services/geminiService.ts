// services/geminiService.ts

import { storageService } from './storageService.ts';
import { getAppInstructions } from './Instructions.ts';
import { detectProjectLanguage as detectLanguage } from '../utils.ts';
import {
  generateContent,
  hasValidProviderKey,
  validateProviderKey,
  getProviderConfig,
  type AIProviderType
} from './aiProvider.ts';

// Re-export for backward compatibility
export const hasValidApiKey = hasValidProviderKey;

export const validateApiKey = async (apiKey: string): Promise<boolean> => {
  const provider = storageService.getAIProvider() || 'gemini';
  return validateProviderKey(provider, apiKey);
};

export const validateProviderApiKey = validateProviderKey;

// Helper to stringify project data for prompts
const getContext = (projectData: any): string => {
  let context = "Here is the current project information (Context):\n";
  if (projectData.problemAnalysis?.coreProblem?.title) {
    context += `Problem Analysis: ${JSON.stringify(projectData.problemAnalysis, null, 2)}\n`;
  }
  if (projectData.projectIdea?.mainAim) {
    context += `Project Idea: ${JSON.stringify(projectData.projectIdea, null, 2)}\n`;
  }
  if (projectData.generalObjectives?.length > 0) {
    context += `General Objectives: ${JSON.stringify(projectData.generalObjectives, null, 2)}\n`;
  }
  if (projectData.specificObjectives?.length > 0) {
    context += `Specific Objectives: ${JSON.stringify(projectData.specificObjectives, null, 2)}\n`;
  }
  if (projectData.activities?.length > 0) {
    context += `Activities (Work Packages): ${JSON.stringify(projectData.activities, null, 2)}\n`;
  }
  if (projectData.outputs?.length > 0) {
    context += `Outputs: ${JSON.stringify(projectData.outputs, null, 2)}\n`;
  }
  if (projectData.outcomes?.length > 0) {
    context += `Outcomes: ${JSON.stringify(projectData.outcomes, null, 2)}\n`;
  }
  if (projectData.impacts?.length > 0) {
    context += `Impacts: ${JSON.stringify(projectData.impacts, null, 2)}\n`;
  }
  return context;
};

// --- JSON SCHEMA INSTRUCTION (for OpenRouter / non-Gemini providers) ---
// FIXED: safely handles @google/genai Type enum values without .toLowerCase() crash

const schemaToTextInstruction = (schema: any): string => {
  try {
    const typeToString = (t: any): string => {
      if (!t) return 'string';
      if (typeof t === 'string') return t.toLowerCase();
      // Handle @google/genai Type enum values (Type.STRING, Type.OBJECT, etc.)
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

// --- SCHEMAS ---
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
          TRL: readinessLevelValueSchema, SRL: readinessLevelValueSchema,
          ORL: readinessLevelValueSchema, LRL: readinessLevelValueSchema,
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
      properties: { title: { type: Type.STRING }, description: { type: Type.STRING }, indicator: { type: Type.STRING } },
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
          coordinator: { type: Type.STRING }, steeringCommittee: { type: Type.STRING },
          advisoryBoard: { type: Type.STRING }, wpLeaders: { type: Type.STRING }
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
        id: { type: Type.STRING }, title: { type: Type.STRING },
        tasks: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING }, title: { type: Type.STRING }, description: { type: Type.STRING },
              startDate: { type: Type.STRING }, endDate: { type: Type.STRING },
              dependencies: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: { predecessorId: { type: Type.STRING }, type: { type: Type.STRING, enum: ['FS', 'SS', 'FF', 'SF'] } },
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
            properties: { id: { type: Type.STRING }, description: { type: Type.STRING } },
            required: ['id', 'description']
          }
        },
        deliverables: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { id: { type: Type.STRING }, description: { type: Type.STRING }, indicator: { type: Type.STRING } },
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
      properties: { title: { type: Type.STRING }, description: { type: Type.STRING }, indicator: { type: Type.STRING } },
      required: ['title', 'description', 'indicator']
    }
  },
  risks: {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING }, category: { type: Type.STRING, enum: ['Technical', 'Social', 'Economic'] },
        title: { type: Type.STRING }, description: { type: Type.STRING },
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
        id: { type: Type.STRING }, title: { type: Type.STRING },
        description: { type: Type.STRING }, exploitationStrategy: { type: Type.STRING }
      },
      required: ['id', 'title', 'description', 'exploitationStrategy']
    }
  }
};

// --- HELPERS ---

const isValidDate = (d: any): boolean => d instanceof Date && !isNaN(d.getTime());

const sanitizeActivities = (activities: any[]): any[] => {
  const taskMap = new Map();
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

// --- RULES FROM INSTRUCTIONS (language-aware) ---
const getRulesForSection = (sectionKey: string, language: 'en' | 'si' = 'en'): string => {
  const instructions = getAppInstructions(language);
  let chapterKey: string | null = null;

  if (sectionKey === 'problemAnalysis') chapterKey = "1";
  else if (sectionKey === 'projectIdea') chapterKey = "2";
  else if (['generalObjectives', 'specificObjectives'].includes(sectionKey)) chapterKey = "3_AND_4";
  else if (['activities', 'projectManagement', 'risks'].includes(sectionKey)) chapterKey = "5";
  else if (['outputs', 'outcomes', 'impacts', 'kers'].includes(sectionKey)) chapterKey = "6";

  if (chapterKey && instructions.CHAPTERS[chapterKey]) {
    const rules = instructions.CHAPTERS[chapterKey].RULES || [];
    return rules.length > 0 ? `\nSTRICT RULES FOR THIS SECTION:\n- ${rules.join('\n- ')}\n` : '';
  }
  return '';
};

// --- PROMPT BUILDER ---

const getPromptAndSchemaForSection = (sectionKey: string, projectData: any, language: 'en' | 'si' = 'en', mode: string = 'regenerate', currentSectionData: any = null) => {
  const context = getContext(projectData);
  let prompt = '';
  let schema: any;

  const rules = getRulesForSection(sectionKey, language);
  const instructions = getAppInstructions(language);
  const globalRules = instructions.GLOBAL_RULES.join('\n');

  const languageInstruction = language === 'si'
    ? "KRITIČNO: Uporabnik je izbral SLOVENŠČINO. Celoten odgovor (naslovi, opisi, kazalniki itd.) MORA biti v SLOVENSKEM jeziku. Tudi če je podan kontekst v angleščini, MORA generirati novo vsebino v slovenščini. Zagotovi visokokakovostno strokovno slovensko terminologijo."
    : "CRITICAL: The user has selected ENGLISH language. Write the response in English. If the context is in Slovenian, translate the logic/ideas into English for the new content.";

  const fillInstruction = mode === 'fill'
    ? `\nIMPORTANT: COMPLETION MODE.\nThe user has provided existing data for this section: ${JSON.stringify(currentSectionData)}.\nYour task is to COMPLETE this data structure.\nRULES:\n1. KEEP all existing non-empty fields exactly as they are.\n2. GENERATE professional content ONLY for fields that are empty strings ("") or missing.\n3. If a list has fewer items than recommended (see RULES below), ADD NEW ITEMS.\n4. Ensure the final output is a valid JSON object matching the full schema.\n`
    : (language === 'si'
      ? "Generiraj popolnoma nov, celovit odgovor za ta razdelek na podlagi konteksta."
      : "Generate a completely new, full response for this section based on the context.");

  const commonPromptStart = `${context}\n${languageInstruction}\n${fillInstruction}\n\n${language === 'si' ? 'GLOBALNA PRAVILA' : 'GLOBAL RULES'}:\n${globalRules}\n\n${rules}\n`;

  // Determine if we need to add schema as text (for OpenRouter)
  const config = getProviderConfig();
  const needsTextSchema = config.provider !== 'gemini';

  switch (sectionKey) {
    case 'problemAnalysis':
      schema = schemas.problemAnalysis;
      prompt = `${commonPromptStart}${needsTextSchema ? schemaToTextInstruction(schema) : ''}\n${language === 'si'
        ? `Na podlagi osrednjega problema "${projectData.problemAnalysis?.coreProblem?.title || ''}" ustvari (ali dopolni) zelo podrobno analizo problemov v skladu s pravili.`
        : `Based on the core problem "${projectData.problemAnalysis?.coreProblem?.title || ''}", create (or complete) a very detailed problem analysis following the rules provided.`}`;
      break;
    case 'projectIdea':
      schema = schemas.projectIdea;
      prompt = `${commonPromptStart}${needsTextSchema ? schemaToTextInstruction(schema) : ''}\n${language === 'si'
        ? 'Na podlagi analize problemov razvij (ali dopolni) celovito projektno idejo. Upoštevaj posebna pravila oblikovanja za predlagano rešitev.'
        : 'Based on the problem analysis, develop (or complete) a comprehensive project idea. Follow the specific formatting rules for the Proposed Solution.'}`;
      break;
    case 'generalObjectives':
      schema = schemas.objectives;
      prompt = `${commonPromptStart}${needsTextSchema ? schemaToTextInstruction(schema) : ''}\n${language === 'si'
        ? 'Opredeli (ali dopolni) 3 do 5 širokih splošnih ciljev. Dosledno upoštevaj pravilo skladnje z GLAGOLOM V NEDOLOČNIKU.'
        : 'Define (or complete) 3 to 5 broader, overall general objectives. Adhere strictly to the INFINITIVE VERB syntax rule.'}`;
      break;
    case 'specificObjectives':
      schema = schemas.objectives;
      prompt = `${commonPromptStart}${needsTextSchema ? schemaToTextInstruction(schema) : ''}\n${language === 'si'
        ? 'Opredeli (ali dopolni) vsaj 5 ustvarjalnih, specifičnih S.M.A.R.T. ciljev. Dosledno upoštevaj pravilo skladnje z GLAGOLOM V NEDOLOČNIKU.'
        : 'Define (or complete) at least 5 creative, specific S.M.A.R.T. objectives. Adhere strictly to the INFINITIVE VERB syntax rule.'}`;
      break;
    case 'projectManagement':
      schema = schemas.projectManagement;
      prompt = `${commonPromptStart}${needsTextSchema ? schemaToTextInstruction(schema) : ''}\n${language === 'si'
        ? 'Ustvari VISOKO PROFESIONALEN, PODROBEN razdelek \'Upravljanje in organizacija\' v skladu s strogimi EU najboljšimi praksami in posebnimi vsebinskimi pravili.'
        : 'Create a HIGHLY PROFESSIONAL, DETAILED \'Management and Organization\' section following strict EU best practices and the specific content rules provided.'}`;
      break;
    case 'activities': {
      const today = new Date().toISOString().split('T')[0];
      const projectStart = projectData.projectIdea?.startDate || today;
      const startDateInstruction = language === 'si'
        ? `Projekt se strogo začne dne ${projectStart}. Vsi začetni datumi nalog MORAJO biti na ali po tem datumu.`
        : `The project is strictly scheduled to start on ${projectStart}. All task Start Dates MUST be on or after this date.`;
      schema = schemas.activities;
      prompt = `${commonPromptStart}${needsTextSchema ? schemaToTextInstruction(schema) : ''}\n${startDateInstruction}\n${language === 'si'
        ? 'Na podlagi specifičnih ciljev in rezultatov oblikuj (ali dopolni) podroben nabor delovnih sklopov (DS) v skladu s pravili glede količine, nalog in logike.'
        : 'Based on the specific objectives and outputs, design (or complete) a detailed set of Work Packages (WPs) following the rules regarding quantity, tasks, and logic.'}`;
      break;
    }
    case 'outputs':
      schema = schemas.results;
      prompt = `${commonPromptStart}${needsTextSchema ? schemaToTextInstruction(schema) : ''}\n${language === 'si'
        ? 'Navedi (ali dopolni) vsaj 6 zelo podrobnih, oprijemljivih neposrednih rezultatov (predvidenih rezultatov).'
        : 'List (or complete) at least 6 very detailed, tangible results (deliverables).'}`;
      break;
    case 'outcomes':
      schema = schemas.results;
      prompt = `${commonPromptStart}${needsTextSchema ? schemaToTextInstruction(schema) : ''}\n${language === 'si'
        ? 'Opiši (ali dopolni) vsaj 6 vmesnih učinkov (srednjeročne spremembe).'
        : 'Describe (or complete) at least 6 intangible results (medium-term changes).'}`;
      break;
    case 'impacts':
      schema = schemas.results;
      prompt = `${commonPromptStart}${needsTextSchema ? schemaToTextInstruction(schema) : ''}\n${language === 'si'
        ? 'Opiši (ali dopolni) vsaj 6 dolgoročnih vplivov.'
        : 'Describe (or complete) at least 6 long-term impacts.'}`;
      break;
    case 'risks':
      schema = schemas.risks;
      prompt = `${commonPromptStart}${needsTextSchema ? schemaToTextInstruction(schema) : ''}\n${language === 'si'
        ? 'Identificiraj (ali dopolni) vsaj 5 potencialnih kritičnih tveganj (Tehnično, Družbeno, Ekonomsko) z ustrezno logiko semaforja za izvoz v Docx.'
        : 'Identify (or complete) at least 5 potential critical risks (Technical, Social, Economic) with correct Traffic Light coloring logic for Docx export in mind.'}`;
      break;
    case 'kers':
      schema = schemas.kers;
      prompt = `${commonPromptStart}${needsTextSchema ? schemaToTextInstruction(schema) : ''}\n${language === 'si'
        ? 'Identificiraj (ali dopolni) vsaj 5 ključnih izkoriščljivih rezultatov (KIR).'
        : 'Identify (or complete) at least 5 Key Exploitable Results (KERs).'}`;
      break;
    default:
      throw new Error(`Unknown section key: ${String(sectionKey)}`);
  }
  return { prompt, schema };
};

// --- MAIN GENERATION FUNCTIONS ---

export const generateSectionContent = async (sectionKey: string, projectData: any, language: 'en' | 'si' = 'en', mode: string = 'regenerate') => {
  const currentSectionData = projectData[sectionKey];
  const { prompt, schema } = getPromptAndSchemaForSection(sectionKey, projectData, language, mode, currentSectionData);

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
    text = text.replace(/([^\n])\s*((?:\*\*|__)?(?:Faza|Phase)\s+\d+(?::|\.)(?:\*\*|__)?)/g, '$1\n\n$2');
    parsedData.proposedSolution = text;
  }

  if (mode === 'fill' && currentSectionData) {
    parsedData = smartMerge(currentSectionData, parsedData);
  }

  return parsedData;
};

export const generateFieldContent = async (path: (string | number)[], projectData: any, language: 'en' | 'si' = 'en') => {
  const context = getContext(projectData);
  const fieldName = path[path.length - 1];
  const sectionName = path[0];

  const languageInstruction = language === 'si'
    ? "POMEMBNO: Odgovor napiši strogo v slovenskem jeziku."
    : "Provide the response in English.";

  const instructions = getAppInstructions(language);
  const globalRules = instructions.GLOBAL_RULES.join('\n');

  let extraInstruction = "";
  if (fieldName === 'likelihood' || fieldName === 'impact') {
    extraInstruction = "RETURN ONLY ONE WORD: 'Low', 'Medium', or 'High'.";
  }

  let specificContext = "";
  if (path.includes('milestones')) {
    if (fieldName === 'date') {
      const projectStartDate = projectData.projectIdea?.startDate || new Date().toISOString().split('T')[0];
      const wpIdx = path[1];
      const msIdx = path[3];
      const milestoneDesc = projectData.activities?.[wpIdx as number]?.milestones?.[msIdx as number]?.description || "the current milestone";
      specificContext = language === 'si' ? "datum za mejnik" : "a date for a Milestone";
      extraInstruction += `\nCONTEXT:\n- Project Start Date: ${projectStartDate}\n- Milestone Description: "${milestoneDesc}"\nTASK: Estimate a realistic completion date.\nFORMAT: Return ONLY 'YYYY-MM-DD'. No other text.`;
    } else {
      specificContext = language === 'si' ? `mejnik v delovnem sklopu na poti ${JSON.stringify(path)}` : `a Milestone in the Work Package defined in the path ${JSON.stringify(path)}`;
    }
  } else if (path.includes('tasks')) {
    specificContext = language === 'si' ? `nalogo v delovnem sklopu` : `a Task in the Work Package`;
  } else if (path.includes('deliverables')) {
    specificContext = language === 'si' ? `predvideni rezultat` : `a Deliverable`;
  } else if (path.includes('risks')) {
    specificContext = language === 'si' ? "specifično tveganje" : "a specific Risk";
  } else {
    specificContext = language === 'si' ? `polje "${String(fieldName)}"` : `the field "${String(fieldName)}"`;
  }

  const prompt = `${context}\n${languageInstruction}\n${language === 'si' ? 'GLOBALNA PRAVILA' : 'GLOBAL RULES'}:\n${globalRules}\n\n${extraInstruction}\n${language === 'si'
    ? `Generiraj profesionalno vrednost za ${specificContext} znotraj razdelka "${String(sectionName)}". Vrni samo besedilo.`
    : `Generate a professional value for ${specificContext} within "${String(sectionName)}". Just return the text value.`}`;

  const result = await generateContent({ prompt });
  return result.text;
};

export const generateProjectSummary = async (projectData: any, language: 'en' | 'si' = 'en') => {
  const context = getContext(projectData);

  const prompt = language === 'si'
    ? `${context}\nNapiši povzetek v profesionalnem slovenskem jeziku.\nUstvari jedrnat, visoko profesionalen in prepričljiv 1-stranski povzetek tega projektnega predloga.\nKRITIČNO PRAVILO SKLADNJE: Ko navajaš ključne cilje, MORA uporabiti GLAGOLE V NEDOLOČNIKU.\nTERMINOLOGIJA: Uporabi standardno EU terminologijo intervencijske logike v slovenščini.\nOblikuj izhod z uporabo enostavnega Markdown za strukturo.`
    : `${context}\nWrite the summary in professional English.\nCreate a concise, highly professional, and persuasive 1-page summary of this project proposal.\nCRITICAL SYNTAX RULE: When listing Key Objectives or Goals, you MUST use INFINITIVE verbs.\nTERMINOLOGY: Use standard EU Intervention Logic terminology.\nFormat the output using simple Markdown for structure.`;

  const result = await generateContent({ prompt });
  return result.text;
};

export const translateProjectContent = async (projectData: any, targetLanguage: 'en' | 'si') => {
  const langName = targetLanguage === 'si' ? 'Slovenian' : 'English';
  const prompt = `You are a professional translator for EU Project Proposals.\nTranslate the following JSON object strictly into ${langName}.\nRULES:\n1. Maintain the EXACT JSON structure.\n2. Only translate the text values (strings).\n3. Ensure high-quality, professional terminology.\n4. Return ONLY the valid JSON string.\n\nJSON to Translate:\n${JSON.stringify(projectData)}`;

  const result = await generateContent({ prompt, jsonMode: true });
  const jsonStr = result.text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
  return JSON.parse(jsonStr);
};

export const detectProjectLanguage = detectLanguage;
