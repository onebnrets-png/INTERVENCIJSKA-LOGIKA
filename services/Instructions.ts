import { storageService } from './storageService.ts';

/**
 * APP STRUCTURE AND INSTRUCTIONS MASTER FILE
 * ═══════════════════════════════════════════════════════════════
 * 
 * THIS IS THE SINGLE SOURCE OF TRUTH FOR ALL CONTENT GENERATION RULES.
 * 
 * ALL rules that govern AI-generated content MUST live here.
 * No other file (geminiService.ts, aiProvider.ts, etc.) may contain
 * hardcoded content instructions. They may only READ from this file.
 * 
 * Technical configuration (chart dimensions, UI settings) lives in
 * TechnicalInstructions.ts — that file is NOT used by the AI.
 *
 * Instructions are split by language (EN / SI) so the AI always receives
 * rules in the same language as the expected output.
 *
 * ADMIN ACCESS:
 * Administrators can edit these rules via Settings → Instructions tab.
 * Changes are stored in Supabase and override the defaults below.
 *
 * TO UPDATE HARD-CODED INSTRUCTIONS:
 * 1. Edit DEFAULT_INSTRUCTIONS_EN and/or DEFAULT_INSTRUCTIONS_SI below.
 * 2. INCREMENT 'version' in _METADATA (e.g., from 2.0 to 2.1).
 * 3. The app will detect the newer version and auto-update user settings.
 */

// ─── ENGLISH INSTRUCTIONS ────────────────────────────────────────

const DEFAULT_INSTRUCTIONS_EN = {
  GLOBAL_RULES: [
    "Language: ALL AI output must be in English.",
    "Terminology: Use standard EU project terminology (e.g., 'Work Packages', 'Milestones', 'Deliverables', 'Key Exploitable Results').",
    "Data Preservation: When 'Filling Missing' data, never overwrite existing user-entered text. Only populate empty fields.",
    "Quality: Provide empirical data, references, and citations (Source, Year) wherever applicable.",
    "API Key: Never ask for the API key in the UI. Handle missing keys gracefully via the Settings modal.",
    "Depth: All generated descriptions must be professional, substantive, and at least 3 sentences long unless explicitly stated otherwise.",
    "Consistency: Maintain logical coherence across all sections. Objectives must link to the problem analysis. Activities must serve the objectives. Results must flow from activities."
  ],

  CHAPTERS: {
    "1": {
      title: "Problem Analysis",
      subChapters: ["Core Problem", "Causes", "Consequences"],
      RULES: [
        "Depth: Descriptions must include global empirical data and citations (Source, Year).",
        "Quantity: Generate at least 4 Causes and 4 Consequences.",
        "Structure: Causes and Consequences follow a hierarchical tree structure logic.",
        "Core Problem: Must be a clear, focused statement of the central issue. The description must provide evidence-based context with statistical data.",
        "Causes: Each cause must be distinct and directly contribute to the core problem. Avoid overlapping causes.",
        "Consequences: Each consequence must be a direct or indirect result of the core problem. Include societal, economic, and environmental dimensions."
      ]
    },
    "2": {
      title: "Project Idea",
      subChapters: ["Main Aim", "State of the Art", "Proposed Solution", "Readiness Levels", "EU Policies"],
      RULES: [
        "Main Aim: Must be a single, comprehensive sentence starting with 'The main aim of the Project is to...'.",
        "State of the Art: Must reference existing projects, products, services, and research. Include specific names, dates, and outcomes of comparable initiatives.",
        "Proposed Solution: Use double line breaks ('\\n\\n') before each new Project Phase (e.g., '**Phase 1: Discovery & Analysis**').",
        "Proposed Solution Structure: Organize into clear phases. Each phase must describe: objectives, methods, tools, and expected intermediate results.",
        "Proposed Solution Innovation: Clearly articulate what is NEW and INNOVATIVE compared to the State of the Art.",
        "Readiness Levels: TRL, SRL, ORL, LRL must be selected (1-9) with specific justifications for the chosen level. Justification must reference the current project status.",
        "Policies: List 2-3 specific EU policies (e.g., 'European Green Deal', 'Digital Europe Programme'), not generic financial instruments. Describe concrete alignment.",
        "Project Title: Must be concise (max 15 words), descriptive, and reflect the core innovation.",
        "Project Acronym: Must be memorable, pronounceable, and ideally form a meaningful word or abbreviation (3-8 characters)."
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
        "General Objectives: Describe the broad, long-term vision (3-5 objectives). These are strategic and aspirational.",
        "Specific Objectives: Are concrete and measurable (at least 5). Each must have a clear, quantifiable indicator.",
        "Indicators: Must be SMART — include numbers, percentages, timeframes. E.g., 'Increase by 25% within 12 months'.",
        "Linkage: Every Specific Objective must clearly support at least one General Objective.",
        "Descriptions: Must explain HOW the objective will be achieved, not just WHAT it is."
      ]
    },
    "5": {
      title: "Activities",
      subChapters: ["Quality & Efficiency", "Workplan", "Gantt Chart", "PERT Chart", "Risk Mitigation"],
      RULES: [
        "--- PROJECT MANAGEMENT (Quality & Efficiency) ---",
        "ORGANIGRAM RULE: Visual Organigram fields (Coordinator, Steering Committee, etc.) must contain ONLY the role title. No descriptions in the boxes.",
        "TEXT DESCRIPTION RULE: All detailed descriptions of roles, responsibilities, decision-making mechanisms, and quality assurance workflows go in the main 'Description' text area.",
        "MANDATORY IN DESCRIPTION: Explicitly describe the roles (PC, SC, AB, WPL) within the text, not the visual chart.",
        "REQUIRED SUB-SECTIONS IN DESCRIPTION: 1. Governance Structure, 2. Decision-Making Mechanisms, 3. Quality Assurance Procedures, 4. Risk Management Strategy, 5. Internal Communication Plan, 6. Conflict Resolution Procedures.",
        "Description must be at least 500 words, professionally structured with clear paragraphs.",
        "",
        "--- WORKPLAN (Work Packages) ---",
        "Structure: Minimum 3 core content WPs + 1 Management WP (WP1) + 1 Dissemination & Exploitation WP (last WP).",
        "WP Titles: Must be descriptive and action-oriented (e.g., 'WP3: Development and Testing of Digital Platform').",
        "Tasks: At least 5 tasks per WP. Each task description must be at least 3 sentences long.",
        "Task Descriptions: Must include methodology, responsible parties, and expected outputs.",
        "Dates: Task Start/End dates must respect dependency logic (FS, SS, FF, SF).",
        "Parallelism: 'FS' dependency means Successor Start > Predecessor End. If dates overlap, use 'SS' instead.",
        "Project Start Date: All tasks must start on or after the defined project start date.",
        "Milestones: Each WP must have at least 1 milestone. Milestones mark significant achievements or decision points.",
        "Deliverables: Each WP must have at least 1 deliverable with a measurable indicator.",
        "Dependencies: Tasks should have logical dependencies. Avoid isolated tasks with no predecessors or successors (except for WP1 initial tasks).",
        "",
        "--- RISKS ---",
        "Quantity: At least 5 distinct risks covering all categories.",
        "Categories: Must include at least one Technical, one Social, and one Economic risk.",
        "Required fields: ID, Category (Technical/Social/Economic), Title (concise summary), Description (detailed), Likelihood (Low/Medium/High), Impact (Low/Medium/High), Mitigation strategy (specific and actionable).",
        "Mitigation strategies must be SPECIFIC and ACTIONABLE — not generic statements like 'We will manage the risk'.",
        "Risk IDs: Follow format RISK1, RISK2, etc.",
        "High-impact risks must have more detailed mitigation strategies (at least 3 sentences)."
      ]
    },
    "6": {
      title: "Expected Results",
      subChapters: ["Outputs", "Outcomes", "Impacts", "KERs"],
      RULES: [
        "--- DEFINITIONS ---",
        "Outputs = Tangible, direct deliverables produced by the project (e.g., reports, tools, platforms, prototypes).",
        "Outcomes = Medium-term effects and changes resulting from the use of outputs (e.g., increased awareness, changed behaviors, improved processes).",
        "Impacts = Long-term, broad societal, economic, or environmental changes (e.g., reduced inequality, improved public health).",
        "",
        "--- OUTPUTS ---",
        "Quantity: At least 6 outputs.",
        "Each output must have a specific title, detailed description, and a measurable indicator.",
        "Outputs must directly correspond to deliverables from the Work Packages.",
        "",
        "--- OUTCOMES ---",
        "Quantity: At least 6 outcomes.",
        "Outcomes must describe CHANGES that happen because of the outputs.",
        "Include target groups and timeframes in indicators.",
        "",
        "--- IMPACTS ---",
        "Quantity: At least 6 impacts.",
        "Impacts must describe long-term societal transformations.",
        "Reference EU-level policy goals where applicable.",
        "",
        "--- KERs (Key Exploitable Results) ---",
        "Quantity: At least 5 KERs.",
        "Title: Must be specific and technical (e.g., 'AI-powered diagnostic algorithm for early detection').",
        "Description: Must be a deep, precise technical description of the result. At least 4 sentences.",
        "Exploitation Strategy: Must describe WHO will use it, HOW it will be exploited (commercialization, open-source, policy input, etc.), and WHEN (timeline).",
        "KER IDs: Follow format KER1, KER2, etc."
      ]
    }
  },

  // ─── FIELD-LEVEL GENERATION RULES ──────────────────────────────
  FIELD_RULES: {
    "projectTitle": "Generate a concise, descriptive project title (max 15 words) that reflects the core innovation and problem being solved.",
    "projectAcronym": "Generate a memorable, pronounceable acronym (3-8 characters) that ideally forms a meaningful word.",
    "mainAim": "Generate a single comprehensive sentence starting with 'The main aim of the Project is to...'.",
    "stateOfTheArt": "Review existing projects, products, and services related to the problem. Include specific names, dates, and references.",
    "proposedSolution": "Describe the innovative solution with clear phases. Use double line breaks before each Phase heading.",
    "justification": "Explain why this specific readiness level was chosen. Reference the current project status and evidence.",
    "milestone_date": "Estimate a realistic completion date based on the project timeline and milestone description. Return ONLY 'YYYY-MM-DD'.",
    "likelihood": "Assess the probability of this risk occurring. Return ONLY one word: 'Low', 'Medium', or 'High'.",
    "impact": "Assess the severity if this risk materializes. Return ONLY one word: 'Low', 'Medium', or 'High'."
  },

  // ─── TRANSLATION RULES ─────────────────────────────────────────
  TRANSLATION_RULES: [
    "Maintain the EXACT JSON structure — translate only text values.",
    "Use high-quality, professional EU project terminology.",
    "Do NOT translate: IDs (WP1, T1.1, M1, D1, R1, KER1), dates, abbreviations, or technical codes.",
    "Preserve formatting: line breaks, bullet points, phase numbering.",
    "Ensure gender-appropriate and grammatically correct translations."
  ],

  // ─── SUMMARY GENERATION RULES ──────────────────────────────────
  SUMMARY_RULES: [
    "Create a concise, highly professional, and persuasive 1-page summary.",
    "CRITICAL SYNTAX RULE: When listing Key Objectives or Goals, MUST use INFINITIVE verbs.",
    "Use standard EU Intervention Logic terminology.",
    "Format the output using simple Markdown for structure.",
    "Include: Project title, Problem statement, Main aim, Key objectives, Methodology overview, Expected results, and EU policy alignment."
  ]
};

// ─── SLOVENIAN INSTRUCTIONS ──────────────────────────────────────

const DEFAULT_INSTRUCTIONS_SI = {
  GLOBAL_RULES: [
    "Jezik: VSE AI generirane vsebine MORAJO biti v slovenščini.",
    "Terminologija: Uporabljaj strokovno EU projektno terminologijo (npr. 'Delovni sklopi', 'Mejniki', 'Predvideni rezultati', 'Ključni izkoriščljivi rezultati').",
    "Ohranjanje podatkov: Pri funkciji 'Izpolni manjkajoče' nikoli ne prepiši obstoječega uporabnikovega besedila. Izpolni samo prazna polja.",
    "Kakovost: Navajaj empirične podatke, reference in vire (Vir, Leto) povsod, kjer je to smiselno.",
    "API ključ: Nikoli ne sprašuj po API ključu v uporabniškem vmesniku. Manjkajoče ključe obravnavaj prek modala Nastavitve.",
    "Globina: Vsi generirani opisi morajo biti profesionalni, vsebinski in dolgi vsaj 3 stavke, razen če je izrecno navedeno drugače.",
    "Skladnost: Vzdržuj logično skladnost med vsemi razdelki. Cilji morajo biti povezani z analizo problemov. Aktivnosti morajo služiti ciljem. Rezultati morajo izhajati iz aktivnosti."
  ],

  CHAPTERS: {
    "1": {
      title: "Analiza problemov",
      subChapters: ["Osrednji problem", "Vzroki", "Posledice"],
      RULES: [
        "Globina: Opisi morajo vključevati globalne empirične podatke in navedbe virov (Vir, Leto).",
        "Količina: Generiraj vsaj 4 vzroke in 4 posledice.",
        "Struktura: Vzroki in posledice sledijo hierarhični drevesni strukturi.",
        "Osrednji problem: Mora biti jasna, osredotočena izjava o glavnem vprašanju. Opis mora vsebovati kontekst, podprt z dokazi in statističnimi podatki.",
        "Vzroki: Vsak vzrok mora biti razločen in neposredno prispevati k osrednjemu problemu. Izogibaj se prekrivajočim se vzrokom.",
        "Posledice: Vsaka posledica mora biti neposreden ali posreden rezultat osrednjega problema. Vključi družbene, ekonomske in okoljske razsežnosti."
      ]
    },
    "2": {
      title: "Projektna ideja",
      subChapters: ["Glavni cilj", "Stanje razvoja", "Predlagana rešitev", "Stopnje pripravljenosti", "EU politike"],
      RULES: [
        "Glavni cilj: Mora biti en sam, celovit stavek, ki se začne z 'Glavni cilj projekta je ...'.",
        "Stanje razvoja: Mora vključevati obstoječe projekte, izdelke, storitve in raziskave. Vključi konkretna imena, datume in rezultate primerljivih pobud.",
        "Predlagana rešitev: Uporabi dvojne prelome vrstic ('\\n\\n') pred vsako novo projektno fazo (npr. '**Faza 1: Odkrivanje in analiza**').",
        "Struktura predlagane rešitve: Organiziraj v jasne faze. Vsaka faza mora opisati: cilje, metode, orodja in pričakovane vmesne rezultate.",
        "Inovativnost predlagane rešitve: Jasno artikuliraj, kaj je NOVO in INOVATIVNO v primerjavi s stanjem razvoja.",
        "Stopnje pripravljenosti: TRL, SRL, ORL, LRL morajo biti izbrane (1-9) s specifičnimi utemeljitvami za izbrano stopnjo. Utemeljitev mora navajati trenutni status projekta.",
        "Politike: Navedi 2-3 specifične EU politike (npr. 'Evropski zeleni dogovor', 'Program Digitalna Evropa'), ne generičnih finančnih instrumentov. Opiši konkretno usklajenost.",
        "Naziv projekta: Mora biti jedrnat (največ 15 besed), opisujoč in odražati osrednjo inovacijo.",
        "Akronim projekta: Mora biti zapomnljiv, izgovorljiv in idealno tvoriti smiselno besedo ali okrajšavo (3-8 znakov)."
      ]
    },
    "3_AND_4": {
      title: "Cilji (Splošni in specifični)",
      subChapters: ["Splošni cilji (SC)", "Specifični cilji (SP)"],
      RULES: [
        "KRITIČNO PRAVILO SKLADNJE: Naslovi ciljev se MORAJO začeti z GLAGOLOM v NEDOLOČNIKU.",
        "PREPOVEDANO: Samostalniki / Posamostaljenja. Npr. NE uporabljaj 'Razvoj sistema'.",
        "ZAHTEVANO: Glagoli v nedoločniku. Npr. UPORABI 'Razviti sistem'.",
        "SMART: Specifični cilji morajo biti Specifični, Merljivi, Dosegljivi, Relevantni, Časovno določeni.",
        "Splošni cilji: Opisujejo široko, dolgoročno vizijo (3-5 ciljev). So strateški in ambiciozni.",
        "Specifični cilji: So konkretni in merljivi (vsaj 5). Vsak mora imeti jasen, kvantificiran kazalnik.",
        "Kazalniki: Morajo biti SMART — vključi številke, odstotke, časovne okvire. Npr. 'Povečati za 25 % v 12 mesecih'.",
        "Povezanost: Vsak specifični cilj mora jasno podpirati vsaj en splošni cilj.",
        "Opisi: Morajo pojasniti, KAKO bo cilj dosežen, ne samo KAJ je."
      ]
    },
    "5": {
      title: "Aktivnosti",
      subChapters: ["Kakovost in učinkovitost", "Delovni načrt", "Ganttov diagram", "PERT diagram", "Obvladovanje tveganj"],
      RULES: [
        "--- UPRAVLJANJE PROJEKTA (Kakovost in učinkovitost) ---",
        "PRAVILO ORGANIGRAMA: Vizualna polja organigrama (Koordinator, Usmerjevalni odbor itd.) morajo vsebovati SAMO naziv vloge. Brez opisov v okvirčkih.",
        "PRAVILO OPISA: Vsi podrobni opisi vlog, odgovornosti, mehanizmov odločanja in postopkov zagotavljanja kakovosti se zapišejo v glavno besedilno polje 'Opis'.",
        "OBVEZNO V OPISU: Eksplicitno opiši vloge iz organigrama (PK, UO, SO, VDS) v besedilu, ne v vizualnem diagramu.",
        "ZAHTEVANI PODRAZDELKI V OPISU: 1. Upravljavska struktura, 2. Mehanizmi odločanja, 3. Postopki zagotavljanja kakovosti, 4. Strategija obvladovanja tveganj, 5. Načrt notranje komunikacije, 6. Postopki reševanja sporov.",
        "Opis mora biti dolg vsaj 500 besed, strokovno strukturiran z jasnimi odstavki.",
        "",
        "--- DELOVNI NAČRT (Delovni sklopi) ---",
        "Struktura: Najmanj 3 vsebinski DS-ji + 1 DS za upravljanje (DS1) + 1 DS za diseminacijo in izkoriščanje (zadnji DS).",
        "Naslovi DS: Morajo biti opisni in akcijsko usmerjeni (npr. 'DS3: Razvoj in testiranje digitalne platforme').",
        "Naloge: Vsaj 5 nalog na DS. Opis vsake naloge mora biti dolg vsaj 3 stavke.",
        "Opisi nalog: Morajo vključevati metodologijo, odgovorne osebe in pričakovane rezultate.",
        "Datumi: Začetni/končni datumi nalog morajo upoštevati logiko odvisnosti (FS, SS, FF, SF).",
        "Vzporednost: Odvisnost 'FS' pomeni, da se naslednik začne PO koncu predhodnika. Če se datumi prekrivajo, uporabi 'SS'.",
        "Datum začetka projekta: Vse naloge se morajo začeti na ali po opredeljenem datumu začetka projekta.",
        "Mejniki: Vsak DS mora imeti vsaj 1 mejnik. Mejniki označujejo pomembne dosežke ali točke odločanja.",
        "Predvideni rezultati: Vsak DS mora imeti vsaj 1 predvideni rezultat z merljivim kazalnikom.",
        "Odvisnosti: Naloge morajo imeti logične odvisnosti. Izogibaj se izoliranim nalogam brez predhodnikov ali naslednikov (razen začetnih nalog DS1).",
        "",
        "--- TVEGANJA ---",
        "Količina: Vsaj 5 različnih tveganj, ki pokrivajo vse kategorije.",
        "Kategorije: Mora vključevati vsaj eno tehnično, eno družbeno in eno ekonomsko tveganje.",
        "Zahtevana polja: ID, Kategorija (Tehnično/Družbeno/Ekonomsko), Naslov (jedrnaten povzetek), Opis (podroben), Verjetnost (Nizka/Srednja/Visoka), Učinek (Nizek/Srednji/Visok), Strategija obvladovanja (specifična in izvedljiva).",
        "Strategije obvladovanja morajo biti SPECIFIČNE in IZVEDLJIVE — ne generične izjave kot 'Obvladovali bomo tveganje'.",
        "ID tveganj: Sledijo formatu RISK1, RISK2, itd.",
        "Tveganja z visokim učinkom morajo imeti podrobnejše strategije obvladovanja (vsaj 3 stavki)."
      ]
    },
    "6": {
      title: "Pričakovani rezultati",
      subChapters: ["Neposredni rezultati", "Vmesni učinki", "Dolgoročni vplivi", "KIR-ji"],
      RULES: [
        "--- DEFINICIJE ---",
        "Neposredni rezultati (Outputs) = Oprijemljivi, neposredni izdelki projekta (npr. poročila, orodja, platforme, prototipi).",
        "Vmesni učinki (Outcomes) = Srednjeročni učinki in spremembe, ki izhajajo iz uporabe neposrednih rezultatov (npr. povečana ozaveščenost, spremenjeno vedenje, izboljšani procesi).",
        "Dolgoročni vplivi (Impacts) = Dolgoročne, široke družbene, ekonomske ali okoljske spremembe (npr. zmanjšana neenakost, izboljšano javno zdravje).",
        "",
        "--- NEPOSREDNI REZULTATI (Outputs) ---",
        "Količina: Vsaj 6 neposrednih rezultatov.",
        "Vsak rezultat mora imeti specifičen naslov, podroben opis in merljiv kazalnik.",
        "Rezultati morajo neposredno ustrezati predvidenim rezultatom iz delovnih sklopov.",
        "",
        "--- VMESNI UČINKI (Outcomes) ---",
        "Količina: Vsaj 6 vmesnih učinkov.",
        "Vmesni učinki morajo opisovati SPREMEMBE, ki nastanejo zaradi neposrednih rezultatov.",
        "V kazalnikih vključi ciljne skupine in časovne okvire.",
        "",
        "--- DOLGOROČNI VPLIVI (Impacts) ---",
        "Količina: Vsaj 6 dolgoročnih vplivov.",
        "Vplivi morajo opisovati dolgoročne družbene transformacije.",
        "Kjer je primerno, navedi cilje politik na ravni EU.",
        "",
        "--- KIR-ji (Ključni izkoriščljivi rezultati) ---",
        "Količina: Vsaj 5 KIR-jev.",
        "Naslov: Mora biti specifičen in tehničen (npr. 'Z UI podprt diagnostični algoritem za zgodnje odkrivanje').",
        "Opis: Mora biti poglobljen, natančen tehničen opis rezultata. Vsaj 4 stavki.",
        "Strategija izkoriščanja: Mora opisati, KDO jo bo uporabil, KAKO bo izkoriščena (komercializacija, odprta koda, prispevek k politikam itd.) in KDAJ (časovnica).",
        "ID KIR-jev: Sledijo formatu KER1, KER2, itd."
      ]
    }
  },

  // ─── PRAVILA ZA GENERIRANJE POSAMEZNIH POLJ ───────────────────
  FIELD_RULES: {
    "projectTitle": "Generiraj jedrnaten, opisujoč naziv projekta (največ 15 besed), ki odraža osrednjo inovacijo in problem, ki se rešuje.",
    "projectAcronym": "Generiraj zapomnljiv, izgovorljiv akronim (3-8 znakov), ki idealno tvori smiselno besedo.",
    "mainAim": "Generiraj en sam celovit stavek, ki se začne z 'Glavni cilj projekta je ...'.",
    "stateOfTheArt": "Preglej obstoječe projekte, izdelke in storitve, povezane s problemom. Vključi konkretna imena, datume in reference.",
    "proposedSolution": "Opiši inovativno rešitev z jasnimi fazami. Uporabi dvojne prelome vrstic pred vsakim naslovom faze.",
    "justification": "Pojasni, zakaj je bila izbrana ta specifična stopnja pripravljenosti. Navedi trenutni status projekta in dokaze.",
    "milestone_date": "Oceni realističen datum zaključka na podlagi časovnice projekta in opisa mejnika. Vrni SAMO 'LLLL-MM-DD'.",
    "likelihood": "Oceni verjetnost nastopa tega tveganja. Vrni SAMO eno besedo: 'Low', 'Medium' ali 'High'.",
    "impact": "Oceni resnost, če se to tveganje uresniči. Vrni SAMO eno besedo: 'Low', 'Medium' ali 'High'."
  },

  // ─── PRAVILA ZA PREVAJANJE ─────────────────────────────────────
  TRANSLATION_RULES: [
    "Ohrani NATANČNO strukturo JSON — prevajaj samo besedilne vrednosti.",
    "Uporabljaj visokokakovostno, strokovno EU projektno terminologijo.",
    "NE prevajaj: ID-jev (WP1, T1.1, M1, D1, R1, KER1), datumov, okrajšav ali tehničnih kod.",
    "Ohrani oblikovanje: prelome vrstic, alineje, številčenje faz.",
    "Zagotovi spolno ustrezne in slovnično pravilne prevode."
  ],

  // ─── PRAVILA ZA GENERIRANJE POVZETKA ───────────────────────────
  SUMMARY_RULES: [
    "Ustvari jedrnaten, visoko profesionalen in prepričljiv enostranski povzetek.",
    "KRITIČNO PRAVILO SKLADNJE: Ko navaja ključne cilje, MORA uporabiti GLAGOLE V NEDOLOČNIKU.",
    "Uporabi standardno slovensko EU terminologijo intervencijske logike.",
    "Oblikuj izhod z uporabo enostavnega Markdowna za strukturo.",
    "Vključi: Naziv projekta, Opis problema, Glavni cilj, Ključne cilje, Pregled metodologije, Pričakovane rezultate in usklajenost z EU politikami."
  ]
};

// ─── COMBINED INSTRUCTIONS WITH METADATA ─────────────────────────

export const DEFAULT_INSTRUCTIONS = {
  _METADATA: {
    version: 2.0,
    lastUpdated: "Centralized single source of truth — all content rules consolidated"
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
      CHAPTERS: stored.CHAPTERS || DEFAULT_INSTRUCTIONS_EN.CHAPTERS,
      FIELD_RULES: stored.FIELD_RULES || DEFAULT_INSTRUCTIONS_EN.FIELD_RULES,
      TRANSLATION_RULES: stored.TRANSLATION_RULES || DEFAULT_INSTRUCTIONS_EN.TRANSLATION_RULES,
      SUMMARY_RULES: stored.SUMMARY_RULES || DEFAULT_INSTRUCTIONS_EN.SUMMARY_RULES
    };
  }

  // Return hard-coded instructions for the requested language
  return language === 'si' ? DEFAULT_INSTRUCTIONS_SI : DEFAULT_INSTRUCTIONS_EN;
};

/**
 * Get field-specific generation rule.
 * Returns a string instruction for a given field name, or empty string if none found.
 */
export const getFieldRule = (fieldName: string, language: 'en' | 'si' = 'en'): string => {
  const instructions = getAppInstructions(language);
  return instructions.FIELD_RULES?.[fieldName] || '';
};

/**
 * Get translation rules.
 */
export const getTranslationRules = (language: 'en' | 'si' = 'en'): string[] => {
  const instructions = getAppInstructions(language);
  return instructions.TRANSLATION_RULES || [];
};

/**
 * Get summary generation rules.
 */
export const getSummaryRules = (language: 'en' | 'si' = 'en'): string[] => {
  const instructions = getAppInstructions(language);
  return instructions.SUMMARY_RULES || [];
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
