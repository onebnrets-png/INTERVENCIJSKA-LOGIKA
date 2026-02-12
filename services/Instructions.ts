import { storageService } from './storageService.ts';

/**
 * APP STRUCTURE AND INSTRUCTIONS MASTER FILE
 *
 * CONTENT GENERATION RULES ONLY.
 * Technical configuration is in TechnicalInstructions.ts.
 *
 * Instructions are split by language (EN / SI) so the AI always receives
 * rules in the same language as the expected output.
 *
 * To update hard-coded instructions:
 * 1. Edit DEFAULT_INSTRUCTIONS_EN and/or DEFAULT_INSTRUCTIONS_SI below.
 * 2. INCREMENT 'version' in _METADATA (e.g., from 1.4 to 1.5).
 * 3. The app will detect the newer version and auto-update user settings.
 */

// ─── ENGLISH INSTRUCTIONS ────────────────────────────────────────

const DEFAULT_INSTRUCTIONS_EN = {
  GLOBAL_RULES: [
    "Language: ALL AI output must be in English.",
    "Terminology: Use standard EU project terminology (e.g., 'Work Packages', 'Milestones', 'Deliverables', 'Key Exploitable Results').",
    "Data Preservation: When 'Filling Missing' data, never overwrite existing user-entered text. Only populate empty fields.",
    "Quality: Provide empirical data, references, and citations (Source, Year) wherever applicable.",
    "API Key: Never ask for the API key in the UI. Handle missing keys gracefully via the Settings modal."
  ],

  CHAPTERS: {
    "1": {
      title: "Problem Analysis",
      subChapters: ["Core Problem", "Causes", "Consequences"],
      RULES: [
        "Depth: Descriptions must include global empirical data and citations (Source, Year).",
        "Quantity: Generate at least 4 Causes and 4 Consequences.",
        "Structure: Causes and Consequences follow a hierarchical tree structure logic."
      ]
    },
    "2": {
      title: "Project Idea",
      subChapters: ["Main Aim", "State of the Art", "Proposed Solution", "Readiness Levels", "EU Policies"],
      RULES: [
        "Main Aim: Must be a single, comprehensive sentence starting with 'The main aim of the Project is to...'.",
        "Proposed Solution: Use double line breaks ('\\n\\n') before each new Project Phase (e.g., 'Phase 1: ...').",
        "Readiness Levels: TRL, SRL, ORL, LRL must be selected (1-9) with specific justifications for the chosen level.",
        "Policies: List 2-3 specific EU policies (e.g., 'European Green Deal', 'Digital Europe Programme'), not generic financial instruments."
      ]
    },
    "3_AND_4": {
      title: "Objectives (General and Specific)",
      subChapters: ["General Objectives (GO)", "Specific Objectives (SO)"],
      RULES: [
        "CRITICAL SYNTAX RULE: Titles MUST start with a VERB in the INFINITIVE form.",
        "FORBIDDEN: Nouns / Nominalization. E.g., DO NOT use 'Development of a system'.",
        "REQUIRED: Infinitive verbs. E.g., USE 'To develop a system'.",
        "SMART: Specific objectives must be Specific, Measurable, Achievable, Relevant, Time-bound.",
        "General Objectives describe the broad, long-term vision. Specific Objectives are concrete and measurable."
      ]
    },
    "5": {
      title: "Activities",
      subChapters: ["Quality & Efficiency", "Workplan", "Gantt Chart", "PERT Chart", "Risk Mitigation"],
      RULES: [
        "Project Management (Quality & Efficiency):",
        " - ORGANIGRAM RULE: Visual Organigram fields (Coordinator, Steering Committee, etc.) must contain ONLY the role title. No descriptions in the boxes.",
        " - TEXT DESCRIPTION RULE: All detailed descriptions of roles, responsibilities, decision-making mechanisms, and quality assurance workflows go in the main 'Description' text area.",
        " - MANDATORY IN DESCRIPTION: Explicitly describe the roles (PC, SC, AB, WPL) within the text, not the visual chart.",
        " - REQUIRED SUB-SECTIONS: 1. Governance Structure, 2. Decision-Making Mechanisms, 3. Quality Assurance Procedures, 4. Risk Management Strategy.",

        "Workplan (WPs):",
        " - Structure: Minimum 3 core WPs + Management WP + Dissemination WP.",
        " - Tasks: At least 5 tasks per WP. Descriptions must be at least 3 sentences.",
        " - Dates: Task Start/End dates must respect dependency logic (FS, SS, FF, SF).",
        " - Parallelism: 'FS' dependency means Successor Start > Predecessor End. If dates overlap, use 'SS' instead.",

        "Risks:",
        " - Required fields: ID, Category (Technical/Social/Economic), Title, Description, Likelihood (Low/Medium/High), Impact (Low/Medium/High), Mitigation strategy."
      ]
    },
    "6": {
      title: "Expected Results",
      subChapters: ["Outputs", "Outcomes", "Impacts", "KERs"],
      RULES: [
        "Definitions: Outputs = Tangible deliverables. Outcomes = Medium-term effects. Impacts = Long-term societal changes.",
        "KERs (Key Exploitable Results): Must have a specific Title, Technical Description, and Exploitation Strategy.",
        "Quantity: At least 5-6 items per category."
      ]
    }
  }
};

// ─── SLOVENIAN INSTRUCTIONS ──────────────────────────────────────

const DEFAULT_INSTRUCTIONS_SI = {
  GLOBAL_RULES: [
    "Jezik: VSE AI generirane vsebine MORAJO biti v slovenščini.",
    "Terminologija: Uporabljaj strokovno EU projektno terminologijo (npr. 'Delovni sklopi', 'Mejniki', 'Predvideni rezultati', 'Ključni izkoriščljivi rezultati').",
    "Ohranjanje podatkov: Pri funkciji 'Izpolni manjkajoče' nikoli ne prepiši obstoječega uporabnikovega besedila. Izpolni samo prazna polja.",
    "Kakovost: Navajaj empirične podatke, reference in vire (Vir, Leto) povsod, kjer je to smiselno.",
    "API ključ: Nikoli ne sprašuj po API ključu v uporabniškem vmesniku. Manjkajoče ključe obravnavaj prek modala Nastavitve."
  ],

  CHAPTERS: {
    "1": {
      title: "Analiza problemov",
      subChapters: ["Osrednji problem", "Vzroki", "Posledice"],
      RULES: [
        "Globina: Opisi morajo vključevati globalne empirične podatke in navedbe virov (Vir, Leto).",
        "Količina: Generiraj vsaj 4 vzroke in 4 posledice.",
        "Struktura: Vzroki in posledice sledijo hierarhični drevesni strukturi."
      ]
    },
    "2": {
      title: "Projektna ideja",
      subChapters: ["Glavni cilj", "Stanje razvoja", "Predlagana rešitev", "Stopnje pripravljenosti", "EU politike"],
      RULES: [
        "Glavni cilj: Mora biti en sam, celovit stavek, ki se začne z 'Glavni cilj projekta je ...'.",
        "Predlagana rešitev: Uporabi dvojne prelome vrstic ('\\n\\n') pred vsako novo projektno fazo (npr. 'Faza 1: ...').",
        "Stopnje pripravljenosti: TRL, SRL, ORL, LRL morajo biti izbrane (1-9) s specifičnimi utemeljitvami za izbrano stopnjo.",
        "Politike: Navedi 2-3 specifične EU politike (npr. 'Evropski zeleni dogovor', 'Program Digitalna Evropa'), ne generičnih finančnih instrumentov."
      ]
    },
    "3_AND_4": {
      title: "Cilji (Splošni in Specifični)",
      subChapters: ["Splošni cilji (SC)", "Specifični cilji (SP)"],
      RULES: [
        "KRITIČNO PRAVILO SKLADNJE: Naslovi ciljev se MORAJO začeti z GLAGOLOM v NEDOLOČNIKU.",
        "PREPOVEDANO: Samostalniki / Posamostaljenja. Npr. NE uporabljaj 'Razvoj sistema'.",
        "ZAHTEVANO: Glagoli v nedoločniku. Npr. UPORABI 'Razviti sistem'.",
        "SMART: Specifični cilji morajo biti Specifični, Merljivi, Dosegljivi, Relevantni, Časovno določeni.",
        "Splošni cilji opisujejo široko, dolgoročno vizijo. Specifični cilji so konkretni in merljivi."
      ]
    },
    "5": {
      title: "Aktivnosti",
      subChapters: ["Kakovost in učinkovitost", "Delovni načrt", "Ganttov diagram", "PERT diagram", "Obvladovanje tveganj"],
      RULES: [
        "Upravljanje projekta (Kakovost in učinkovitost):",
        " - PRAVILO ORGANIGRAMA: Vizualna polja organigrama (Koordinator, Usmerjevalni odbor itd.) morajo vsebovati SAMO naziv vloge. Brez opisov v okvirčkih.",
        " - PRAVILO OPISA: Vsi podrobni opisi vlog, odgovornosti, mehanizmov odločanja in postopkov zagotavljanja kakovosti se zapišejo v glavno besedilno polje 'Opis'.",
        " - OBVEZNO V OPISU: Eksplicitno opiši vloge iz organigrama (PK, UO, SO, VDS) v besedilu, ne v vizualnem diagramu.",
        " - ZAHTEVANI PODRAZDELKI: 1. Upravljavska struktura, 2. Mehanizmi odločanja, 3. Postopki zagotavljanja kakovosti, 4. Strategija obvladovanja tveganj.",

        "Delovni načrt (DS-ji):",
        " - Struktura: Najmanj 3 vsebinski DS-ji + DS za upravljanje + DS za diseminacijo.",
        " - Naloge: Vsaj 5 nalog na DS. Opisi morajo imeti vsaj 3 stavke.",
        " - Datumi: Začetni/končni datumi nalog morajo upoštevati logiko odvisnosti (FS, SS, FF, SF).",
        " - Vzporednost: Odvisnost 'FS' pomeni, da se naslednik začne PO koncu predhodnika. Če se datumi prekrivajo, uporabi 'SS'.",

        "Tveganja:",
        " - Zahtevana polja: ID, Kategorija (Tehnično/Družbeno/Ekonomsko), Naslov, Opis, Verjetnost (Nizka/Srednja/Visoka), Učinek (Nizek/Srednji/Visok), Strategija obvladovanja."
      ]
    },
    "6": {
      title: "Pričakovani rezultati",
      subChapters: ["Neposredni rezultati", "Vmesni učinki", "Dolgoročni vplivi", "KIR-ji"],
      RULES: [
        "Definicije: Neposredni rezultati (Outputs) = Oprijemljivi rezultati. Vmesni učinki (Outcomes) = Srednjeročni učinki. Dolgoročni vplivi (Impacts) = Dolgoročne družbene spremembe.",
        "KIR-ji (Ključni izkoriščljivi rezultati): Morajo imeti specifičen naslov, tehnični opis in strategijo izkoriščanja.",
        "Količina: Vsaj 5-6 elementov na kategorijo."
      ]
    }
  }
};

// ─── COMBINED INSTRUCTIONS WITH METADATA ─────────────────────────

export const DEFAULT_INSTRUCTIONS = {
  _METADATA: {
    version: 1.4,
    lastUpdated: "Language-split instructions – EN/SI separated"
  },
  en: DEFAULT_INSTRUCTIONS_EN,
  si: DEFAULT_INSTRUCTIONS_SI,

  // Legacy flat access for backward compatibility (English as default)
  GLOBAL_RULES: DEFAULT_INSTRUCTIONS_EN.GLOBAL_RULES,
  CHAPTERS: DEFAULT_INSTRUCTIONS_EN.CHAPTERS
};

// ─── ACCESSOR METHODS ────────────────────────────────────────────

/**
 * Get instructions for a specific language.
 * Falls back to English if language not found.
 */
export const getAppInstructions = (language: 'en' | 'si' = 'en') => {
  const stored = storageService.getCustomInstructions();

  // If stored version is current or newer, use it
  if (stored && stored._METADATA && stored._METADATA.version >= DEFAULT_INSTRUCTIONS._METADATA.version) {
    // Return language-specific if available, otherwise fall back to flat structure
    if (stored[language]) {
      return stored[language];
    }
    // Legacy format: return the flat GLOBAL_RULES + CHAPTERS
    return {
      GLOBAL_RULES: stored.GLOBAL_RULES || DEFAULT_INSTRUCTIONS_EN.GLOBAL_RULES,
      CHAPTERS: stored.CHAPTERS || DEFAULT_INSTRUCTIONS_EN.CHAPTERS
    };
  }

  // Return hard-coded instructions for the requested language
  return language === 'si' ? DEFAULT_INSTRUCTIONS_SI : DEFAULT_INSTRUCTIONS_EN;
};

/**
 * Get the full instructions object (both languages + metadata).
 * Used by the admin settings panel.
 */
export const getFullInstructions = () => {
  const stored = storageService.getCustomInstructions();

  if (stored && stored._METADATA && stored._METADATA.version >= DEFAULT_INSTRUCTIONS._METADATA.version) {
    return stored;
  }

  return DEFAULT_INSTRUCTIONS;
};

export const saveAppInstructions = (newInstructions: any): void => {
  storageService.saveCustomInstructions(newInstructions);
};

export const resetAppInstructions = (): void => {
  storageService.saveCustomInstructions(null);
};
