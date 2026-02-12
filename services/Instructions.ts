
import { storageService } from './storageService.ts';

/**
 * APP STRUCTURE AND INSTRUCTIONS MASTER FILE
 * 
 * CONTENT GENERATION RULES ONLY.
 * Technical configuration is in TechnicalInstructions.ts.
 * 
 * NAVODILO ZA UPORABO (HARD CODING):
 * Če želite spremeniti instrukcije v kodi:
 * 1. Uredite objekt DEFAULT_INSTRUCTIONS spodaj.
 * 2. POVEČAJTE 'version' v _METADATA (npr. iz 1.2 na 1.3).
 * 3. Aplikacija bo zaznala novejšo verzijo in samodejno posodobila nastavitve uporabnika.
 */

export const DEFAULT_INSTRUCTIONS = {
    _METADATA: {
        version: 1.3, // INCREMENTED to force update
        lastUpdated: "HardCoded Update - Fix Export and Strict Rules"
    },
    GLOBAL_RULES: [
        "Language Strictness: If the user selects 'SI' (Slovenian), ALL AI output must be in Slovenian, regardless of the context language.",
        "Terminology: Use professional EU project terminology (e.g., 'Delovni sklopi' for WPs, 'Mejniki' for Milestones).",
        "Data Preservation: When 'Filling Missing' data, never overwrite existing user-entered text. Only merge empty fields.",
        "API Key: Never ask for the API key in the UI or code unless via the Settings modal. Handle missing keys gracefully."
    ],

    CHAPTERS: {
        "1": {
            title: "Problem Analysis (Analiza problemov)",
            subChapters: ["Core Problem", "Causes", "Consequences"],
            RULES: [
                "Depth: Descriptions must include global empirical data and citations (Source, Year).",
                "Quantity: Generate at least 4 Causes and 4 Consequences.",
                "Structure: Causes and Consequences are hierarchical (Tree structure logic)."
            ]
        },
        "2": {
            title: "Project Idea (Projektna ideja)",
            subChapters: ["Main Aim", "State of the Art", "Proposed Solution", "Readiness Levels", "EU Policies"],
            RULES: [
                "Main Aim: Must be a single, comprehensive sentence starting with 'The main aim of the Project is to...' (or Slovenian equivalent).",
                "Proposed Solution Formatting: Must use double line breaks ('\\n\\n') before starting a new Project Phase (e.g., 'Phase 1: ...').",
                "Readiness Levels: TRL, SRL, ORL, LRL must be selected (1-9) with specific justifications.",
                "Policies: List 2-3 specific EU policies, not generic financial instruments."
            ]
        },
        "3_AND_4": {
            title: "Objectives (Splošni in Specifični cilji)",
            subChapters: ["General Objectives (GO)", "Specific Objectives (SO)"],
            RULES: [
                "CRITICAL SYNTAX RULE: Titles MUST start with a VERB in the INFINITIVE form.",
                "FORBIDDEN: Nouns (Nominalization). E.g., DO NOT use 'Razvoj sistema' or 'Development of system'.",
                "REQUIRED: Infinitive Verbs. E.g., USE 'Razviti sistem' or 'To develop a system'.",
                "SMART: Specific objectives must be Specific, Measurable, Achievable, Relevant, Time-bound."
            ]
        },
        "5": {
            title: "Activities (Aktivnosti)",
            subChapters: ["Quality & Efficiency", "Workplan", "Gantt Chart", "PERT Chart", "Risk Mitigation"],
            RULES: [
                "Project Management (Quality & Efficiency):",
                " - STRICT ORGANIGRAM RULE: The Visual Organigram fields (Coordinator, Steering Committee, etc.) MUST CONTAIN ONLY THE ROLE TITLE (e.g., 'Project Coordinator', 'Steering Committee'). ABSOLUTELY NO DESCRIPTIONS IN THE BOXES.",
                " - TEXT DESCRIPTION RULE: All detailed descriptions of roles, responsibilities, decision-making mechanisms, and quality assurance workflows MUST be written in the main 'Description' text area.",
                " - MANDATORY CONTENT IN DESCRIPTION: Explicitly describe the roles found in the Organigram (PC, SC, AB, WPL) within the text description, not the visual chart.",
                " - REQUIRED SUB-SECTIONS: 1. Governance Structure, 2. Decision-Making Mechanisms, 3. Quality Assurance Procedures, 4. Risk Management Strategy.",
                
                "Workplan (WPs):",
                " - Structure: Minimum 3 core WPs + Management + Dissemination.",
                " - Tasks: At least 5 tasks per WP. Descriptions >3 sentences.",
                " - Dates: Task Start/End dates must respect dependency logic (FS, SS, etc.).",
                " - Parallelism: 'FS' dependency means Successor Start > Predecessor End. If dates overlap, change type to 'SS'.",

                "Risks:",
                " - Fields: ID, Category (Technical/Social/Economic), Title, Description, Likelihood (Low/Med/High), Impact (Low/Med/High), Mitigation."
            ]
        },
        "6": {
            title: "Expected Results (Pričakovani rezultati)",
            subChapters: ["Outputs", "Outcomes", "Impacts", "KERs"],
            RULES: [
                "Definitions: Outputs = Tangible deliverables. Outcomes = Medium-term effects. Impacts = Long-term societal changes.",
                "KERs (Key Exploitable Results): Must have a specific Title, Technical Description, and Exploitation Strategy.",
                "Quantity: At least 5-6 items per category."
            ]
        }
    }
};

// Accessor methods to get/set instructions via Storage Service logic
export const getAppInstructions = () => {
    const stored = storageService.getCustomInstructions();
    
    // Logic: If hard-coded version is NEWER than stored version, force update.
    if (stored && stored._METADATA && stored._METADATA.version >= DEFAULT_INSTRUCTIONS._METADATA.version) {
        return stored;
    }
    
    // If no stored instructions, or stored ones are old, return Hard Coded ones.
    // Also implicitly updates storage next time user saves, but ensures fresh start now.
    return DEFAULT_INSTRUCTIONS;
};

export const saveAppInstructions = (newInstructions) => {
    storageService.saveCustomInstructions(newInstructions);
};

export const resetAppInstructions = () => {
    storageService.saveCustomInstructions(null);
};
