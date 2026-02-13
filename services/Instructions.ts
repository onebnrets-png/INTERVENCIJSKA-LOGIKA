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
 * 2. INCREMENT 'version' in _METADATA (e.g., from 3.0 to 3.1).
 * 3. The app will detect the newer version and auto-update user settings.
 */

// ─── ENGLISH INSTRUCTIONS ────────────────────────────────────────

const DEFAULT_INSTRUCTIONS_EN = {
  GLOBAL_RULES: [
    "Language: Every piece of AI-generated text — titles, descriptions, indicators, strategies, and all other content — MUST be written entirely in English. Even if the user-provided context is in another language, generate all new content in English.",
    "EU Terminology: Consistently use standard European Union project terminology throughout. This includes terms such as 'Work Packages' (not 'work streams'), 'Milestones', 'Deliverables', 'Key Exploitable Results (KERs)', 'Intervention Logic', 'Outputs', 'Outcomes', and 'Impacts'. Never invent non-standard terminology.",
    "Infinitive Verb Rule (Universal): Whenever a title for an objective, goal, aim, or purpose is generated, it MUST begin with a verb in the infinitive form (e.g., 'To develop...', 'To establish...', 'To increase...'). NEVER use nominalizations such as 'Development of...' or 'Establishment of...' in titles. This rule applies globally across all chapters — in objectives, summaries, KER exploitation strategies, and anywhere a goal or purpose is stated.",
    "Data Preservation: When the system operates in 'Fill Missing' mode, you must NEVER overwrite, alter, or rephrase any existing user-entered text. Your task is exclusively to populate fields that are empty strings (\"\") or entirely missing. Treat all existing content as final and untouchable.",
    "Evidence and Citations: Wherever factual claims, statistics, or contextual statements are made, support them with empirical data, references, and citations in the format (Source, Year). Use credible sources: Eurostat, World Bank, OECD, WHO, peer-reviewed journals, EU policy documents, or recognised industry reports.",
    "Depth and Substance: Every generated description must be professional, substantive, and contain meaningful analytical content. Minimum length is 3 complete sentences unless a specific field rule explicitly states otherwise. Avoid generic filler phrases such as 'This is important because...' or 'This will contribute to...' without concrete specifics.",
    "Logical Coherence Across Sections: Maintain strict logical coherence across the entire project structure. The Problem Analysis must logically lead to the Project Idea. General Objectives must address the identified problems. Specific Objectives must operationalise the General Objectives. Activities (Work Packages) must directly serve the Specific Objectives. Outputs must be produced by Activities. Outcomes must result from the use of Outputs. Impacts must describe the long-term societal change enabled by Outcomes. KERs must be traceable back to specific Outputs and Activities.",
    "ID Continuity: When generating new items (Work Packages, Tasks, Risks, KERs, etc.), always check what IDs already exist in the project data and continue the numbering sequence. For example, if WP1–WP3 already exist, new Work Packages must start from WP4. Never restart numbering from 1.",
    "Maximum Length Discipline: While depth is required, avoid unnecessarily verbose or repetitive content. Descriptions should be comprehensive but focused. A single field description should not exceed 500 words unless the specific rule for that section explicitly calls for a longer text (e.g., Project Management description).",
    "Cross-Referencing: Where appropriate, explicitly reference related elements from other sections. For example, a KER description should mention which Work Package produced it. An Outcome should reference which Outputs it builds upon. A Risk should mention which Activities or Work Packages it affects."
  ],

  CHAPTERS: {
    "1": {
      title: "Problem Analysis",
      subChapters: ["Core Problem", "Causes", "Consequences"],
      RULES: [
        "Core Problem Statement: The core problem must be expressed as a single, clear, and focused statement that identifies the central issue the project addresses. The accompanying description must provide evidence-based context using statistical data, citing at least 2 credible sources with (Source, Year) format. The description should explain who is affected, how severely, and why the problem persists.",
        "Causes — Quantity and Quality: Generate at least 4 distinct causes. Each cause must be a genuine root factor that directly contributes to the core problem. Causes must not overlap or repeat the same idea in different words. Each cause title must be concise (max 10 words), and each description must explain the causal mechanism — HOW and WHY this factor leads to the core problem — in at least 3 sentences with supporting evidence.",
        "Consequences — Quantity and Quality: Generate at least 4 distinct consequences. Each consequence must be a verifiable effect that results from the core problem if left unaddressed. Include consequences across multiple dimensions: societal, economic, environmental, and/or institutional. Each description must explain the severity and scope of the consequence with evidence.",
        "Hierarchical Tree Structure: Causes and consequences must follow a logical hierarchical tree structure where the core problem sits at the centre. Causes feed INTO the problem (upstream). Consequences flow FROM the problem (downstream). This structure must be visually and logically coherent when rendered as a problem tree diagram.",
        "No Circular Logic: Ensure that no cause is simultaneously listed as a consequence, and vice versa. Each element must occupy a distinct and logically defensible position in the causal chain."
      ]
    },
    "2": {
      title: "Project Idea",
      subChapters: ["Main Aim", "State of the Art", "Proposed Solution", "Readiness Levels", "EU Policies"],
      RULES: [
        "Main Aim: Must be formulated as a single, comprehensive sentence that begins with 'The main aim of the Project is to...' followed by a clear articulation of the overarching goal. This sentence must encapsulate WHAT the project will achieve, for WHOM, and through WHAT general approach. Do not use multiple sentences or bullet points.",
        "State of the Art: Must provide a thorough review of the current landscape — existing projects, products, services, technologies, and academic research relevant to the problem domain. Include at least 3 specific references with names, dates, institutions, and outcomes. Clearly identify the gaps, limitations, and shortcomings of the current state that justify the need for this project.",
        "Proposed Solution — Phase Structure: Organise the solution into clearly defined project phases (e.g., 'Phase 1: Discovery & Analysis', 'Phase 2: Development & Prototyping'). Insert a double line break (\\n\\n) before each phase heading. Each phase heading must be bold (using **Phase N: Title** format).",
        "Proposed Solution — Phase Content: Each phase must describe: (a) the specific objectives of that phase, (b) the methodology and tools to be used, (c) who is responsible, and (d) the expected intermediate results or deliverables. Each phase description must be at least 4 sentences long.",
        "Proposed Solution — Innovation: Explicitly and prominently articulate what is NEW and INNOVATIVE about the proposed solution compared to the State of the Art. The innovation statement must not be vague — it must specify the technical, methodological, or conceptual advancement.",
        "Readiness Levels: All four readiness levels (TRL, SRL, ORL, LRL) must be assessed on a scale of 1–9. Each level must include a specific justification of at least 2 sentences that references the current project status, existing evidence, and the rationale for the chosen level. Do not leave justifications generic.",
        "EU Policies: List 2–3 specific EU policies, strategies, or frameworks (e.g., 'European Green Deal', 'Digital Europe Programme', 'EU Strategy for the Rights of Persons with Disabilities 2021-2030'). Do NOT list generic financial instruments (e.g., 'Horizon Europe' is a funding programme, not a policy). For each policy, describe the concrete alignment — which specific policy goals or targets does the project contribute to.",
        "Project Title: Must be concise (maximum 15 words), descriptive, and clearly reflect the core innovation and the problem being addressed. Avoid generic titles. The title should be understandable to a non-specialist.",
        "Project Acronym: Must be memorable, pronounceable, and ideally form a meaningful word or abbreviation. Length: 3–8 characters. Must relate to the project's theme or objectives."
      ]
    },
    "3_AND_4": {
      title: "Objectives (General and Specific)",
      subChapters: ["General Objectives (GO)", "Specific Objectives (SO)"],
      RULES: [
        "CRITICAL SYNTAX RULE — INFINITIVE VERBS IN TITLES: Every objective title MUST begin with a verb in the infinitive form. Correct examples: 'To develop a cross-border digital platform', 'To strengthen institutional capacity for climate adaptation', 'To reduce youth unemployment by 15% in target regions'. INCORRECT examples (FORBIDDEN): 'Development of a platform', 'Strengthening of capacity', 'Reduction of unemployment'. This rule is absolute and applies to every single objective without exception.",
        "General Objectives — Scope and Quantity: Generate 3 to 5 General Objectives. These represent the broad, long-term strategic vision that the project contributes to. They describe the desired societal change at a macro level. General Objectives are aspirational and may extend beyond the project's direct control, but the project must demonstrably contribute to them.",
        "General Objectives — Descriptions: Each General Objective description must explain (a) what long-term change is envisioned, (b) who benefits, and (c) how the project's work contributes to this broader change. Minimum 3 sentences.",
        "Specific Objectives — Scope and Quantity: Generate at least 5 Specific Objectives. These are concrete, operational, and directly achievable within the project's timeframe and resources. Every Specific Objective must be S.M.A.R.T.: Specific (clearly defined scope), Measurable (quantifiable indicator), Achievable (realistic given resources), Relevant (linked to General Objectives and the problem), Time-bound (achievable within the project duration).",
        "Specific Objectives — Indicators: Each Specific Objective MUST have a clear, quantifiable indicator that makes measurement unambiguous. Include numbers, percentages, absolute values, or concrete deliverables with timeframes. Example: 'Train at least 200 professionals in digital skills within 18 months'. AVOID vague indicators like 'Improved awareness' or 'Better performance'.",
        "Specific Objectives — Descriptions: Each description must explain HOW the objective will be achieved (methodology, approach), not just WHAT it is. Link the objective to specific planned activities or Work Packages where possible.",
        "Linkage Between Objectives: Every Specific Objective must explicitly support at least one General Objective. The connection must be logically clear — a reader should understand immediately why achieving the Specific Objective helps achieve the General Objective.",
        "No Duplication: Objectives must not overlap or repeat the same idea with different wording. Each objective must address a distinct aspect of the project."
      ]
    },
    "5": {
      title: "Activities",
      subChapters: ["Quality & Efficiency", "Workplan", "Gantt Chart", "PERT Chart", "Risk Mitigation"],
      RULES: [
        "--- PROJECT MANAGEMENT (Quality & Efficiency) ---",
        "Organigram Visual Fields: The visual organigram fields (Coordinator, Steering Committee, Advisory Board, WP Leaders) must contain ONLY the role title or the name of the body. Do NOT place descriptions, responsibilities, or procedural text inside the organigram boxes. These boxes are rendered visually and must be concise labels.",
        "Management Description — Content: All detailed descriptions of roles, responsibilities, decision-making mechanisms, reporting lines, quality assurance workflows, and communication procedures MUST be written in the main 'Description' text area, NOT in the organigram fields.",
        "Management Description — Mandatory Sub-Sections: The description must explicitly cover all of the following: (1) Governance Structure — who leads, who reports to whom, frequency of meetings; (2) Decision-Making Mechanisms — how decisions are made, voting rules, escalation procedures; (3) Quality Assurance Procedures — review cycles, peer review, external evaluation; (4) Risk Management Strategy — how risks are identified, monitored, and mitigated during implementation; (5) Internal Communication Plan — tools, frequency, formats for internal coordination; (6) Conflict Resolution Procedures — steps for resolving disagreements among partners.",
        "Management Description — Length: The description must be at least 500 words, professionally structured with clear paragraphs and sub-headings. It must read as a credible management section of an EU project proposal.",
        "",
        "--- WORKPLAN (Work Packages) ---",
        "Work Package Structure: The project must contain a minimum of 5 Work Packages: WP1 must be dedicated to Project Management and Coordination; the final WP must be dedicated to Dissemination, Communication, and Exploitation; the remaining WPs (at least 3) must cover the core content, research, development, and/or implementation activities of the project.",
        "Work Package Titles: Must be descriptive and action-oriented, clearly indicating the scope of work. Example: 'WP3: Development and Pilot Testing of the AI-Powered Diagnostic Tool'. Avoid vague titles like 'WP3: Development'.",
        "Tasks — Quantity and Quality: Each Work Package must contain at least 5 tasks. Each task description must be at least 3 complete sentences and must include: (a) what will be done (methodology), (b) who is responsible (lead partner or role), and (c) what the expected output or result of the task is.",
        "Task Date Logic: Task Start and End dates must strictly respect dependency logic. Finish-to-Start (FS) means the successor task cannot begin until the predecessor task has ended. If tasks run in parallel, use Start-to-Start (SS). If task dates overlap but an FS dependency is set, automatically correct it to SS. All tasks must start on or after the defined project start date.",
        "Milestones: Each Work Package must have at least 1 milestone. Milestones mark significant achievements, decision points, or gate reviews — not routine task completions. Milestone descriptions must specify what is achieved and what decision or evaluation occurs. Milestones should be distributed across the project timeline, not clustered at the end.",
        "Deliverables: Each Work Package must produce at least 1 deliverable with a clear title, description, and measurable indicator. Deliverables must be tangible and verifiable (e.g., a report, a prototype, a dataset, a training curriculum).",
        "Task Dependencies: Tasks must have logical dependencies reflecting the real workflow. Avoid isolated tasks that have no predecessor and no successor (except for initial tasks in WP1). The dependency network must form a coherent flow when visualised in a PERT chart.",
        "",
        "--- RISKS ---",
        "Risk Quantity and Coverage: Generate at least 5 distinct risks. The set must include at least one risk from each of the three categories: Technical, Social, and Economic. Risks must be realistic and specific to the project — avoid generic risks that could apply to any project.",
        "Risk Fields: Each risk must include: ID (format: RISK1, RISK2, ...), Category (Technical / Social / Economic), Title (concise summary, max 10 words), Description (detailed explanation of the risk, its trigger conditions, and potential consequences — at least 3 sentences), Likelihood (Low / Medium / High), Impact (Low / Medium / High), Mitigation Strategy.",
        "Mitigation Strategies: Every mitigation strategy must be SPECIFIC and ACTIONABLE. It must describe concrete steps, tools, or procedures that will be implemented. FORBIDDEN: vague statements such as 'We will manage the risk', 'The team will address this', or 'Appropriate measures will be taken'. REQUIRED: specific actions such as 'Implement weekly automated backup procedures using AWS S3 versioning' or 'Establish a user feedback loop with bi-weekly surveys to detect adoption barriers early'.",
        "High-Impact Risk Detail: Risks rated as 'High' impact must have more detailed mitigation strategies — at least 3 sentences describing the preventive measures, the contingency plan, and the responsible party.",
        "Risk-Activity Linkage: Where possible, each risk should reference which Work Packages or Activities it primarily affects, enabling clear traceability."
      ]
    },
    "6": {
      title: "Expected Results",
      subChapters: ["Outputs", "Outcomes", "Impacts", "KERs"],
      RULES: [
        "--- DEFINITIONS (Strict Adherence Required) ---",
        "Outputs are the tangible, direct, and immediate deliverables produced by the project's activities. They are concrete products: reports, tools, platforms, prototypes, datasets, training materials, methodologies, policy briefs. Outputs exist because the project created them.",
        "Outcomes are the medium-term effects, changes, and improvements that result from the USE and ADOPTION of the project's Outputs by target groups. Outcomes describe changed behaviours, increased capacities, improved processes, or enhanced awareness. Outcomes happen because stakeholders engage with the Outputs.",
        "Impacts are the long-term, broad, and systemic societal, economic, or environmental transformations that the project contributes to. Impacts extend beyond the project's direct control but are enabled by the chain of Outputs → Outcomes → Impacts. Impacts align with EU-level policy goals.",
        "",
        "--- OUTPUTS ---",
        "Quantity: Generate at least 6 distinct Outputs.",
        "Content: Each Output must have a specific and descriptive title, a detailed description (at least 3 sentences explaining what it is, how it was produced, and who it serves), and a measurable indicator (quantifiable: number of reports, platform users, trained participants, etc.).",
        "Traceability: Every Output must correspond to a specific deliverable or set of deliverables from the Work Packages. When generating, reference the relevant WP (e.g., 'Produced in WP3, Task 3.2').",
        "",
        "--- OUTCOMES ---",
        "Quantity: Generate at least 6 distinct Outcomes.",
        "Content: Each Outcome must describe a concrete CHANGE that occurs because target groups use or adopt the Outputs. Do not restate Outputs — focus on the transformation they enable. Each description must identify: the target group affected, the nature of the change, and the expected timeframe.",
        "Indicators: Must include the target group and a measurable change metric. Example: '70% of trained professionals report improved diagnostic confidence within 6 months of training completion'.",
        "",
        "--- IMPACTS ---",
        "Quantity: Generate at least 6 distinct Impacts.",
        "Content: Each Impact must describe a long-term systemic transformation at societal, sectoral, or policy level. Impacts must be ambitious but plausible given the chain of Outputs and Outcomes. Each description must reference at least one EU policy goal or strategic framework that the Impact aligns with.",
        "Indicators: Must describe long-term measurable change at population or system level. Example: 'Contribute to a 10% reduction in regional youth unemployment aligned with the European Pillar of Social Rights Action Plan by 2030'.",
        "",
        "--- KERs (Key Exploitable Results) ---",
        "Quantity: Generate at least 5 KERs.",
        "Title: Must be specific and technical, clearly identifying the exploitable asset. Example: 'AI-powered diagnostic algorithm for early detection of crop diseases'. AVOID vague titles like 'Project tool' or 'New methodology'.",
        "Description: Must be a deep, precise, and technically detailed description of the result — what it does, how it works, what makes it unique, and what problem it solves. Minimum 4 sentences. The description must make the innovation and value proposition clear to a potential adopter or investor.",
        "Exploitation Strategy: Must answer three questions: (1) WHO will use or adopt this result? (identify specific target groups, sectors, or organisations), (2) HOW will it be exploited? (commercialisation, open-source release, policy input, licensing, integration into existing systems, spin-off creation, etc.), (3) WHEN? (provide a realistic timeline for exploitation activities — during and after the project).",
        "Traceability: Each KER must reference the Work Package and Output(s) from which it originates. Example: 'Developed in WP4 (Task 4.3), building on Output O4: Digital Platform Prototype'.",
        "KER IDs: Follow the format KER1, KER2, KER3, etc. Never restart numbering if KERs already exist in the project data."
      ]
    }
  },

  FIELD_RULES: {
    "projectTitle": "Generate a concise project title of maximum 15 words. The title must be descriptive, clearly reflect the core innovation and the problem being addressed, and be understandable to a non-specialist reader. Avoid jargon-heavy or overly academic phrasing.",
    "projectAcronym": "Generate a memorable and pronounceable acronym of 3–8 characters. It should ideally form a meaningful word or clever abbreviation that relates to the project's theme. The acronym must be unique and distinctive.",
    "mainAim": "Generate exactly one comprehensive sentence that begins with 'The main aim of the Project is to...' and encapsulates the overarching goal, the target beneficiaries, and the general approach. Do not use multiple sentences.",
    "stateOfTheArt": "Provide a thorough review of existing projects, products, services, and research relevant to the problem domain. Include at least 3 specific references with names, dates, and outcomes. Identify clear gaps that justify the project.",
    "proposedSolution": "Describe the innovative solution organised into clear phases. Use double line breaks (\\n\\n) before each phase heading formatted as **Phase N: Title**. Each phase must describe objectives, methodology, responsibilities, and expected intermediate results.",
    "justification": "Explain in at least 2 sentences why this specific readiness level was selected. Reference the current project status, available evidence, and concrete indicators that support the chosen level.",
    "milestone_date": "Estimate a realistic completion date for this milestone based on the overall project timeline, the milestone's position in the workflow, and the descriptions of preceding tasks. Return ONLY a date in 'YYYY-MM-DD' format with no additional text.",
    "likelihood": "Assess the probability of this risk occurring based on the project context. Return ONLY one of three words: 'Low', 'Medium', or 'High'. No other text.",
    "impact": "Assess the severity of consequences if this risk materialises. Return ONLY one of three words: 'Low', 'Medium', or 'High'. No other text.",
    "description": "Generate a professional, substantive description of at least 3 sentences. Include specific details about methodology, scope, and expected results. Avoid generic filler content.",
    "indicator": "Generate a SMART indicator that is Specific, Measurable, Achievable, Relevant, and Time-bound. Include concrete numbers, percentages, or deliverables with clear timeframes. Example: 'Train 200 professionals within 18 months'.",
    "mitigation": "Describe specific, actionable steps to prevent or reduce the risk. Include concrete tools, procedures, or contingency plans. Never use vague language such as 'We will manage this risk'.",
    "exploitationStrategy": "Describe WHO will use this result, HOW it will be exploited (commercialisation, open-source, policy input, licensing, etc.), and WHEN (timeline for exploitation during and after the project)."
  },

  TRANSLATION_RULES: [
    "Preserve the EXACT JSON structure — translate only the text values of string fields. Never alter keys, array structures, or nesting.",
    "Use high-quality, professional EU project terminology appropriate for official programme documents. Consult standard Slovenian/English EU glossaries for correct terminology.",
    "Do NOT translate: IDs (WP1, T1.1, M1.1, D1.1, RISK1, KER1, GO1, SO1), dates (YYYY-MM-DD), technical abbreviations (TRL, SRL, ORL, LRL, PERT, SMART), dependency types (FS, SS, FF, SF), or category values (Technical, Social, Economic, Low, Medium, High).",
    "Preserve all formatting: line breaks (\\n), double line breaks (\\n\\n), bold markers (**text**), bullet structures, and phase numbering.",
    "Ensure grammatically correct, gender-appropriate, and stylistically natural translations. Avoid literal word-for-word translation — convey the professional meaning faithfully.",
    "Maintain the infinitive verb rule in objective titles when translating. English 'To develop...' must become Slovenian 'Razviti...' (not 'Razvoj...')."
  ],

  SUMMARY_RULES: [
    "Create a concise, highly professional, and persuasive 1-page executive summary suitable for decision-makers and evaluators.",
    "CRITICAL SYNTAX RULE: When listing Key Objectives, Goals, or Aims, MUST use INFINITIVE verbs (e.g., 'To develop...', 'To establish...'). NEVER use nominalizations (e.g., 'Development of...').",
    "Use standard EU Intervention Logic terminology consistently throughout the summary.",
    "Format the output using simple Markdown: use headings (##), bold (**text**), and short paragraphs. Do not use bullet lists for the main narrative — use flowing prose.",
    "The summary must include all of the following sections: Project Title and Acronym, Problem Statement (what problem is being addressed and why it matters), Main Aim (one sentence), Key Objectives (3-5 most important, in infinitive form), Methodology Overview (how the project will achieve its objectives), Expected Results (key Outputs, Outcomes, and Impacts), EU Policy Alignment (which EU strategies the project supports).",
    "The summary must be compelling and persuasive — written as if it were the opening page of a winning EU project proposal."
  ]
};

// ─── SLOVENIAN INSTRUCTIONS ──────────────────────────────────────

const DEFAULT_INSTRUCTIONS_SI = {
  GLOBAL_RULES: [
    "Jezik: Vsak kos AI-generirane vsebine — naslovi, opisi, kazalniki, strategije in vsa ostala besedila — MORA biti napisan v celoti v slovenščini. Tudi če je uporabnikov kontekst v drugem jeziku, generiraj vso novo vsebino v slovenščini. Uporablja visokokakovostno strokovno slovensko terminologijo.",
    "EU terminologija: Dosledno uporabljaj standardno terminologijo Evropske unije za projektno upravljanje. To vključuje izraze kot so 'Delovni sklopi' (ne 'delovni tokovi'), 'Mejniki', 'Predvideni rezultati', 'Ključni izkoriščljivi rezultati (KIR-ji)', 'Intervencijska logika', 'Neposredni rezultati (Outputs)', 'Vmesni učinki (Outcomes)' in 'Dolgoročni vplivi (Impacts)'. Nikoli ne izmišljuj nestandardne terminologije.",
    "Pravilo nedoločnika (univerzalno): Kadarkoli se generira naslov cilja, namena ali namere, se ta MORA začeti z GLAGOLOM V NEDOLOČNIKU (npr. 'Razviti...', 'Vzpostaviti...', 'Povečati...'). NIKOLI ne uporabljaj posamostaljenj kot 'Razvoj...', 'Vzpostavitev...' ali 'Povečanje...' v naslovih. To pravilo velja globalno v vseh poglavjih — pri ciljih, povzetkih, strategijah izkoriščanja KIR-jev in povsod, kjer se izraža namen ali cilj.",
    "Ohranjanje podatkov: Ko sistem deluje v načinu 'Izpolni manjkajoče', NIKOLI ne smeš prepisati, spremeniti ali preoblikovati obstoječega uporabnikovega besedila. Tvoja naloga je izključno zapolniti polja, ki so prazni nizi (\"\") ali popolnoma manjkajoča. Obravnavaj vso obstoječo vsebino kot dokončno in nedotakljivo.",
    "Dokazi in citati: Povsod, kjer se navajajo dejstva, statistični podatki ali kontekstualne trditve, jih podpri z empiričnimi podatki, referencami in citati v formatu (Vir, Leto). Uporabljaj verodostojne vire: Eurostat, Svetovna banka, OECD, WHO, recenzirane revije, dokumente EU politik ali priznana sektorska poročila.",
    "Globina in vsebina: Vsak generiran opis mora biti strokoven, vsebinsko bogat in vsebovati smiselno analitično vsebino. Najmanjša dolžina je 3 polni stavki, razen če pravilo za specifično polje izrecno določa drugače. Izogibaj se generičnim polnilnim frazam kot 'To je pomembno, ker...' ali 'To bo prispevalo k...' brez konkretnih podrobnosti.",
    "Logična skladnost med razdelki: Vzdržuj strogo logično skladnost v celotni strukturi projekta. Analiza problemov mora logično voditi k Projektni ideji. Splošni cilji morajo naslavljati identificirane probleme. Specifični cilji morajo operacionalizirati Splošne cilje. Aktivnosti (Delovni sklopi) morajo neposredno služiti Specifičnim ciljem. Neposredni rezultati morajo biti proizvod Aktivnosti. Vmesni učinki morajo izhajati iz uporabe Neposrednih rezultatov. Dolgoročni vplivi morajo opisovati sistemske družbene spremembe, ki jih omogočajo Vmesni učinki. KIR-ji morajo biti sledljivi nazaj do specifičnih Neposrednih rezultatov in Aktivnosti.",
    "Kontinuiteta ID-jev: Ko generiraš nove elemente (Delovne sklope, Naloge, Tveganja, KIR-je itd.), vedno preveri, kateri ID-ji že obstajajo v projektnih podatkih, in nadaljuj zaporedje številčenja. Na primer, če že obstajajo DS1–DS3, morajo novi Delovni sklopi začeti z DS4. Nikoli ne začni številčenja znova od 1.",
    "Disciplina dolžine: Čeprav je globina zahtevana, se izogibaj nepotrebno večbesednemu ali ponavljajočemu se besedilu. Opisi morajo biti celoviti, a osredotočeni. Posamezen opis polja ne sme presegati 500 besed, razen če pravilo za specifičen razdelek izrecno zahteva daljše besedilo (npr. opis Upravljanja projekta).",
    "Navzkrižno sklicevanje: Kjer je primerno, se eksplicitno sklicuj na povezane elemente iz drugih razdelkov. Na primer, opis KIR-ja naj omeni, kateri Delovni sklop ga je proizvedel. Vmesni učinek naj navede, na katerih Neposrednih rezultatih temelji. Tveganje naj omeni, katere Aktivnosti ali Delovne sklope zadeva."
  ],

  CHAPTERS: {
    "1": {
      title: "Analiza problemov",
      subChapters: ["Osrednji problem", "Vzroki", "Posledice"],
      RULES: [
        "Izjava o osrednjem problemu: Osrednji problem mora biti izražen kot ena sama, jasna in osredotočena izjava, ki identificira glavno vprašanje, ki ga projekt naslavlja. Spremljajoči opis mora zagotoviti kontekst, podprt z dokazi, z uporabo statističnih podatkov in navedbami vsaj 2 verodostojnih virov v formatu (Vir, Leto). Opis mora pojasniti, kdo je prizadet, kako resno in zakaj problem vztraja.",
        "Vzroki — Količina in kakovost: Generiraj vsaj 4 razločne vzroke. Vsak vzrok mora biti pristen korenski dejavnik, ki neposredno prispeva k osrednjemu problemu. Vzroki se ne smejo prekrivati ali ponavljati iste ideje z drugačnimi besedami. Naslov vsakega vzroka mora biti jedrnaten (največ 10 besed), opis pa mora pojasniti vzročni mehanizem — KAKO in ZAKAJ ta dejavnik vodi k osrednjemu problemu — v vsaj 3 stavkih s podpirajočimi dokazi.",
        "Posledice — Količina in kakovost: Generiraj vsaj 4 razločne posledice. Vsaka posledica mora biti preverljiv učinek, ki izhaja iz osrednjega problema, če ta ostane neobravnavan. Vključi posledice v več razsežnostih: družbeni, ekonomski, okoljski in/ali institucionalni. Vsak opis mora s pomočjo dokazov pojasniti resnost in obseg posledice.",
        "Hierarhična drevesna struktura: Vzroki in posledice morajo slediti logični hierarhični drevesni strukturi, kjer osrednji problem stoji v središču. Vzroki se stekajo V problem (navzgor). Posledice iztekajo IZ problema (navzdol). Ta struktura mora biti vizualno in logično koherentna, ko se upodobi kot diagram drevesa problemov.",
        "Brez krožne logike: Zagotovi, da noben vzrok ni hkrati naveden tudi kot posledica in obratno. Vsak element mora zasedati razločno in logično utemeljeno mesto v vzročni verigi."
      ]
    },
    "2": {
      title: "Projektna ideja",
      subChapters: ["Glavni cilj", "Stanje razvoja", "Predlagana rešitev", "Stopnje pripravljenosti", "EU politike"],
      RULES: [
        "Glavni cilj: Mora biti oblikovan kot en sam, celovit stavek, ki se začne z 'Glavni cilj projekta je ...' in mu sledi jasna artikulacija krovnega cilja. Ta stavek mora zajeti, KAJ bo projekt dosegel, za KOGA in s KAKŠNIM splošnim pristopom. Ne uporabljaj več stavkov ali alinej.",
        "Stanje razvoja: Mora zagotoviti temeljit pregled trenutne krajine — obstoječi projekti, izdelki, storitve, tehnologije in akademske raziskave, relevantne za problemsko domeno. Vključi vsaj 3 specifične reference z imeni, datumi, institucijami in rezultati. Jasno identificiraj vrzeli, omejitve in pomanjkljivosti trenutnega stanja, ki utemeljujejo potrebo po tem projektu.",
        "Predlagana rešitev — Fazna struktura: Organiziraj rešitev v jasno definirane projektne faze (npr. 'Faza 1: Odkrivanje in analiza', 'Faza 2: Razvoj in prototipiranje'). Vstavi dvojni prelom vrstice (\\n\\n) pred vsakim naslovom faze. Vsak naslov faze mora biti odebeljen (z uporabo formata **Faza N: Naslov**).",
        "Predlagana rešitev — Vsebina faz: Vsaka faza mora opisati: (a) specifične cilje te faze, (b) metodologijo in orodja, ki bodo uporabljena, (c) kdo je odgovoren, in (d) pričakovane vmesne rezultate ali predvidene rezultate. Vsak opis faze mora biti dolg vsaj 4 stavke.",
        "Predlagana rešitev — Inovativnost: Eksplicitno in izrazito artikuliraj, kaj je NOVO in INOVATIVNO pri predlagani rešitvi v primerjavi s stanjem razvoja. Izjava o inovativnosti ne sme biti nejasna — specificirati mora tehnični, metodološki ali konceptualni napredek.",
        "Stopnje pripravljenosti: Vse štiri stopnje pripravljenosti (TRL, SRL, ORL, LRL) morajo biti ocenjene na lestvici 1–9. Vsaka stopnja mora vključevati specifično utemeljitev vsaj 2 stavkov, ki se sklicuje na trenutni status projekta, razpoložljive dokaze in utemeljitev za izbrano stopnjo. Utemeljitev ne sme biti generična.",
        "EU politike: Navedi 2–3 specifične EU politike, strategije ali okvire (npr. 'Evropski zeleni dogovor', 'Program Digitalna Evropa', 'Strategija EU za pravice invalidov 2021-2030'). NE navajaj generičnih finančnih instrumentov (npr. 'Obzorje Evropa' je program financiranja, ne politika). Za vsako politiko opiši konkretno usklajenost — katerim specifičnim ciljem ali tarčam politike projekt prispeva.",
        "Naziv projekta: Mora biti jedrnaten (največ 15 besed), opisujoč in jasno odražati osrednjo inovacijo ter problem, ki se naslavlja. Izogibaj se generičnim naslovom. Naslov mora biti razumljiv nespecialistu.",
        "Akronim projekta: Mora biti zapomnljiv, izgovorljiv in idealno tvoriti smiselno besedo ali domiselno okrajšavo. Dolžina: 3–8 znakov. Mora se nanašati na temo ali cilje projekta."
      ]
    },
    "3_AND_4": {
      title: "Cilji (Splošni in specifični)",
      subChapters: ["Splošni cilji (SC)", "Specifični cilji (SP)"],
      RULES: [
        "KRITIČNO PRAVILO SKLADNJE — NEDOLOČNIK V NASLOVIH: Vsak naslov cilja se MORA začeti z GLAGOLOM V NEDOLOČNIKU. Pravilni primeri: 'Razviti čezmejno digitalno platformo', 'Okrepiti institucionalne zmogljivosti za podnebno prilagajanje', 'Zmanjšati brezposelnost mladih za 15 % v ciljnih regijah'. NEPRAVILNI primeri (PREPOVEDANO): 'Razvoj platforme', 'Krepitev zmogljivosti', 'Zmanjšanje brezposelnosti'. To pravilo je absolutno in velja za vsak posamezen cilj brez izjeme.",
        "Splošni cilji — Obseg in količina: Generiraj 3 do 5 Splošnih ciljev. Ti predstavljajo široko, dolgoročno strateško vizijo, h kateri projekt prispeva. Opisujejo želeno družbeno spremembo na makro ravni. Splošni cilji so ambiciozni in lahko presegajo neposredni nadzor projekta, vendar mora projekt dokazljivo prispevati k njim.",
        "Splošni cilji — Opisi: Vsak opis Splošnega cilja mora pojasniti (a) kakšna dolgoročna sprememba je predvidena, (b) kdo ima korist, in (c) kako delo projekta prispeva k tej širši spremembi. Najmanj 3 stavki.",
        "Specifični cilji — Obseg in količina: Generiraj vsaj 5 Specifičnih ciljev. Ti so konkretni, operativni in neposredno dosegljivi v časovnem okviru in z viri projekta. Vsak Specifični cilj mora biti S.M.A.R.T.: Specifičen (jasno opredeljen obseg), Merljiv (kvantificiran kazalnik), Dosegljiv (realističen glede na vire), Relevanten (povezan s Splošnimi cilji in problemom), Časovno določen (dosegljiv v trajanju projekta).",
        "Specifični cilji — Kazalniki: Vsak Specifični cilj MORA imeti jasen, kvantificiran kazalnik, ki naredi merjenje nedvoumno. Vključi številke, odstotke, absolutne vrednosti ali konkretne predvidene rezultate s časovnimi okviri. Primer: 'Usposobiti vsaj 200 strokovnjakov na področju digitalnih veščin v 18 mesecih'. IZOGIBAJ SE nejasnim kazalnikom kot 'Izboljšana ozaveščenost' ali 'Boljša učinkovitost'.",
        "Specifični cilji — Opisi: Vsak opis mora pojasniti, KAKO bo cilj dosežen (metodologija, pristop), ne samo KAJ je. Poveži cilj s specifičnimi načrtovanimi aktivnostmi ali Delovnimi sklopi, kjer je to mogoče.",
        "Povezanost med cilji: Vsak Specifični cilj mora eksplicitno podpirati vsaj en Splošni cilj. Povezava mora biti logično jasna — bralec mora takoj razumeti, zakaj doseganje Specifičnega cilja pomaga doseči Splošni cilj.",
        "Brez podvajanja: Cilji se ne smejo prekrivati ali ponavljati iste ideje z drugačnimi besedami. Vsak cilj mora naslavljati razločen vidik projekta."
      ]
    },
    "5": {
      title: "Aktivnosti",
      subChapters: ["Kakovost in učinkovitost", "Delovni načrt", "Ganttov diagram", "PERT diagram", "Obvladovanje tveganj"],
      RULES: [
        "--- UPRAVLJANJE PROJEKTA (Kakovost in učinkovitost) ---",
        "Vizualna polja organigrama: Vizualna polja organigrama (Koordinator, Usmerjevalni odbor, Svetovalni odbor, Vodje DS) morajo vsebovati SAMO naziv vloge ali ime telesa. NE vstavljaj opisov, odgovornosti ali procesnih besedil v okvirčke organigrama. Ti okvirčki so vizualno upodobljeni in morajo biti jedrnate oznake.",
        "Opis upravljanja — Vsebina: Vsi podrobni opisi vlog, odgovornosti, mehanizmov odločanja, poročevalskih linij, postopkov zagotavljanja kakovosti in komunikacijskih procesov MORAJO biti zapisani v glavnem besedilnem polju 'Opis', NE v poljih organigrama.",
        "Opis upravljanja — Obvezni podrazdelki: Opis mora eksplicitno pokriti vse naslednje: (1) Upravljavska struktura — kdo vodi, kdo poroča komu, pogostost sestankov; (2) Mehanizmi odločanja — kako se sprejemajo odločitve, pravila glasovanja, eskalacijski postopki; (3) Postopki zagotavljanja kakovosti — cikli pregleda, medsebojni pregledi, zunanja evalvacija; (4) Strategija obvladovanja tveganj — kako se tveganja identificirajo, spremljajo in obvladujejo med izvajanjem; (5) Načrt notranje komunikacije — orodja, pogostost, formati za notranjo koordinacijo; (6) Postopki reševanja sporov — koraki za reševanje nesoglasij med partnerji.",
        "Opis upravljanja — Dolžina: Opis mora biti dolg vsaj 500 besed, strokovno strukturiran z jasnimi odstavki in podnaslovi. Brati se mora kot verodostojen razdelek upravljanja v prijavi EU projekta.",
        "",
        "--- DELOVNI NAČRT (Delovni sklopi) ---",
        "Struktura delovnih sklopov: Projekt mora vsebovati najmanj 5 Delovnih sklopov: DS1 mora biti namenjen Upravljanju in koordinaciji projekta; zadnji DS mora biti namenjen Diseminaciji, komunikaciji in izkoriščanju; preostali DS-ji (vsaj 3) morajo pokrivati osrednje vsebinske, raziskovalne, razvojne in/ali implementacijske aktivnosti projekta.",
        "Naslovi delovnih sklopov: Morajo biti opisni in akcijsko usmerjeni ter jasno nakazovati obseg dela. Primer: 'DS3: Razvoj in pilotno testiranje diagnostičnega orodja z umetno inteligenco'. Izogibaj se nejasnim naslovom kot 'DS3: Razvoj'.",
        "Naloge — Količina in kakovost: Vsak Delovni sklop mora vsebovati vsaj 5 nalog. Opis vsake naloge mora biti dolg vsaj 3 polne stavke in mora vključevati: (a) kaj bo narejeno (metodologija), (b) kdo je odgovoren (vodilni partner ali vloga), in (c) kakšen je pričakovan rezultat naloge.",
        "Logika datumov nalog: Začetni in končni datumi nalog morajo strogo upoštevati logiko odvisnosti. Konec-začetek (FS) pomeni, da se naslednica ne more začeti, dokler se predhodnica ni končala. Če naloge tečejo vzporedno, uporabi Začetek-začetek (SS). Če se datumi nalog prekrivajo, a je nastavljena odvisnost FS, jo samodejno popravi v SS. Vse naloge se morajo začeti na ali po opredeljenem datumu začetka projekta.",
        "Mejniki: Vsak Delovni sklop mora imeti vsaj 1 mejnik. Mejniki označujejo pomembne dosežke, točke odločanja ali pregledne točke — ne rutinskih zaključkov nalog. Opisi mejnikov morajo specificirati, kaj je doseženo in kakšna odločitev ali evalvacija se izvede. Mejniki morajo biti porazdeljeni vzdolž časovnice projekta, ne zgolj na koncu.",
        "Predvideni rezultati: Vsak Delovni sklop mora proizvesti vsaj 1 predvideni rezultat z jasnim naslovom, opisom in merljivim kazalnikom. Predvideni rezultati morajo biti oprijemljivi in preverljivi (npr. poročilo, prototip, zbirka podatkov, učni program).",
        "Odvisnosti nalog: Naloge morajo imeti logične odvisnosti, ki odražajo realni potek dela. Izogibaj se izoliranim nalogam brez predhodnikov in naslednikov (razen začetnih nalog v DS1). Mreža odvisnosti mora tvoriti koherentni tok, ko se vizualizira v PERT diagramu.",
        "",
        "--- TVEGANJA ---",
        "Količina in pokritost tveganj: Generiraj vsaj 5 razločnih tveganj. Nabor mora vključevati vsaj eno tveganje iz vsake od treh kategorij: Tehnično, Družbeno in Ekonomsko. Tveganja morajo biti realistična in specifična za projekt — izogibaj se generičnim tveganjem, ki bi se lahko nanašala na katerikoli projekt.",
        "Polja tveganj: Vsako tveganje mora vključevati: ID (format: RISK1, RISK2, ...), Kategorija (Technical / Social / Economic), Naslov (jedrnaten povzetek, največ 10 besed), Opis (podrobna razlaga tveganja, njegovih sprožilnih pogojev in morebitnih posledic — vsaj 3 stavki), Verjetnost (Low / Medium / High), Učinek (Low / Medium / High), Strategija obvladovanja.",
        "Strategije obvladovanja: Vsaka strategija obvladovanja mora biti SPECIFIČNA in IZVEDLJIVA. Opisovati mora konkretne korake, orodja ali postopke, ki bodo uvedeni. PREPOVEDANO: nejasne izjave kot 'Obvladovali bomo tveganje', 'Ekipa bo to naslovila' ali 'Sprejeti bodo ustrezni ukrepi'. ZAHTEVANO: specifična dejanja kot 'Uvesti tedenske avtomatizirane varnostne kopije z uporabo AWS S3 verzioniranja' ali 'Vzpostaviti povratno zanko z uporabniki z dvotedenskimi anketami za zgodnje odkrivanje ovir pri sprejetju'.",
        "Podrobnosti tveganj z visokim učinkom: Tveganja, ocenjena z 'High' učinkom, morajo imeti podrobnejše strategije obvladovanja — vsaj 3 stavki, ki opisujejo preventivne ukrepe, načrt ukrepanja ob uresničitvi in odgovorno osebo.",
        "Povezanost tveganj z aktivnostmi: Kjer je mogoče, naj vsako tveganje navede, katere Delovne sklope ali Aktivnosti primarno zadeva, kar omogoča jasno sledljivost."
      ]
    },
    "6": {
      title: "Pričakovani rezultati",
      subChapters: ["Neposredni rezultati", "Vmesni učinki", "Dolgoročni vplivi", "KIR-ji"],
      RULES: [
        "--- DEFINICIJE (Zahtevano strogo upoštevanje) ---",
        "Neposredni rezultati (Outputs) so oprijemljivi, neposredni in takojšnji izdelki, ki jih proizvedejo aktivnosti projekta. So konkretni produkti: poročila, orodja, platforme, prototipi, zbirke podatkov, učna gradiva, metodologije, kratki politični dokumenti. Neposredni rezultati obstajajo, ker jih je projekt ustvaril.",
        "Vmesni učinki (Outcomes) so srednjeročni učinki, spremembe in izboljšave, ki izhajajo iz UPORABE in SPREJETJA projektovih Neposrednih rezultatov s strani ciljnih skupin. Vmesni učinki opisujejo spremenjena vedenja, povečane zmogljivosti, izboljšane procese ali povečano ozaveščenost. Vmesni učinki nastanejo, ker se deležniki vključijo v Neposredne rezultate.",
        "Dolgoročni vplivi (Impacts) so dolgoročne, široke in sistemske družbene, ekonomske ali okoljske transformacije, h katerim projekt prispeva. Vplivi presegajo neposredni nadzor projekta, a jih omogoča veriga Neposredni rezultati → Vmesni učinki → Dolgoročni vplivi. Vplivi so usklajeni s cilji politik na ravni EU.",
        "",
        "--- NEPOSREDNI REZULTATI (Outputs) ---",
        "Količina: Generiraj vsaj 6 razločnih Neposrednih rezultatov.",
        "Vsebina: Vsak Neposredni rezultat mora imeti specifičen in opisujoč naslov, podroben opis (vsaj 3 stavki, ki pojasnjujejo, kaj je, kako je bil proizveden in komu služi) ter merljiv kazalnik (kvantificiran: število poročil, uporabnikov platforme, usposobljenih udeležencev itd.).",
        "Sledljivost: Vsak Neposredni rezultat mora ustrezati specifičnemu predvidenemu rezultatu ali naboru predvidenih rezultatov iz Delovnih sklopov. Pri generiranju navedi ustrezni DS (npr. 'Proizveden v DS3, Naloga 3.2').",
        "",
        "--- VMESNI UČINKI (Outcomes) ---",
        "Količina: Generiraj vsaj 6 razločnih Vmesnih učinkov.",
        "Vsebina: Vsak Vmesni učinek mora opisati konkretno SPREMEMBO, ki nastane, ker ciljne skupine uporabijo ali sprejmejo Neposredne rezultate. Ne ponavljaj Neposrednih rezultatov — osredotoči se na transformacijo, ki jo ti omogočajo. Vsak opis mora identificirati: prizadeto ciljno skupino, naravo spremembe in pričakovani časovni okvir.",
        "Kazalniki: Morajo vključevati ciljno skupino in merljivo metriko spremembe. Primer: '70 % usposobljenih strokovnjakov poroča o izboljšanem diagnostičnem zaupanju v 6 mesecih po zaključku usposabljanja'.",
        "",
        "--- DOLGOROČNI VPLIVI (Impacts) ---",
        "Količina: Generiraj vsaj 6 razločnih Dolgoročnih vplivov.",
        "Vsebina: Vsak Vpliv mora opisati dolgoročno sistemsko transformacijo na družbeni, sektorski ali politični ravni. Vplivi morajo biti ambiciozni, a verjetni glede na verigo Neposrednih rezultatov in Vmesnih učinkov. Vsak opis mora navesti vsaj en cilj EU politike ali strateški okvir, s katerim je Vpliv usklajen.",
        "Kazalniki: Morajo opisovati dolgoročno merljivo spremembo na ravni populacije ali sistema. Primer: 'Prispevati k 10 % zmanjšanju regionalne brezposelnosti mladih v skladu z Akcijskim načrtom Evropskega stebra socialnih pravic do leta 2030'.",
        "",
        "--- KIR-ji (Ključni izkoriščljivi rezultati) ---",
        "Količina: Generiraj vsaj 5 KIR-jev.",
        "Naslov: Mora biti specifičen in tehničen ter jasno identificirati izkoriščljivo sredstvo. Primer: 'Z umetno inteligenco podprt diagnostični algoritem za zgodnje odkrivanje bolezni rastlin'. IZOGIBAJ SE nejasnim naslovom kot 'Projektno orodje' ali 'Nova metodologija'.",
        "Opis: Mora biti poglobljen, natančen in tehnično podroben opis rezultata — kaj počne, kako deluje, kaj ga dela edinstvenega in kakšen problem rešuje. Najmanj 4 stavki. Opis mora inovacijo in vrednostno ponudbo narediti jasni potencialnemu uporabniku ali investitorju.",
        "Strategija izkoriščanja: Mora odgovoriti na tri vprašanja: (1) KDO bo ta rezultat uporabil ali sprejel? (identificiraj specifične ciljne skupine, sektorje ali organizacije), (2) KAKO bo izkoriščen? (komercializacija, odprta koda, prispevek k politikam, licenciranje, integracija v obstoječe sisteme, ustanovitev spin-off podjetja itd.), (3) KDAJ? (zagotovi realistično časovnico za aktivnosti izkoriščanja — med projektom in po njem).",
        "Sledljivost: Vsak KIR mora navesti Delovni sklop in Neposredni rezultat(-e), iz katerih izvira. Primer: 'Razvit v DS4 (Naloga 4.3), ki temelji na Neposrednem rezultatu NR4: Prototip digitalne platforme'.",
        "ID KIR-jev: Sledijo formatu KER1, KER2, KER3, itd. Nikoli ne začni številčenja znova, če KIR-ji že obstajajo v projektnih podatkih."
      ]
    }
  },

  FIELD_RULES: {
    "projectTitle": "Generiraj jedrnaten naziv projekta z največ 15 besedami. Naslov mora biti opisujoč, jasno odražati osrednjo inovacijo in problem, ki se naslavlja, ter biti razumljiv bralcu, ki ni specialist. Izogibaj se žargonsko obteženemu ali pretirano akademskemu jeziku.",
    "projectAcronym": "Generiraj zapomnljiv in izgovorljiv akronim dolžine 3–8 znakov. Idealno naj tvori smiselno besedo ali domiselno okrajšavo, ki se nanaša na temo projekta. Akronim mora biti edinstven in prepoznaven.",
    "mainAim": "Generiraj natanko en celovit stavek, ki se začne z 'Glavni cilj projekta je ...' in zajame krovni cilj, ciljne upravičence in splošni pristop. Ne uporabljaj več stavkov.",
    "stateOfTheArt": "Zagotovi temeljit pregled obstoječih projektov, izdelkov, storitev in raziskav, relevantnih za problemsko domeno. Vključi vsaj 3 specifične reference z imeni, datumi in rezultati. Identificiraj jasne vrzeli, ki utemeljujejo projekt.",
    "proposedSolution": "Opiši inovativno rešitev, organizirano v jasne faze. Uporabi dvojne prelome vrstic (\\n\\n) pred vsakim naslovom faze, oblikovanim kot **Faza N: Naslov**. Vsaka faza mora opisati cilje, metodologijo, odgovornosti in pričakovane vmesne rezultate.",
    "justification": "V vsaj 2 stavkih pojasni, zakaj je bila izbrana ta specifična stopnja pripravljenosti. Navedi trenutni status projekta, razpoložljive dokaze in konkretne kazalnike, ki podpirajo izbrano stopnjo.",
    "milestone_date": "Oceni realističen datum zaključka za ta mejnik na podlagi celotne časovnice projekta, položaja mejnika v delovnem toku in opisov predhodnih nalog. Vrni SAMO datum v formatu 'LLLL-MM-DD' brez kakršnegakoli dodatnega besedila.",
    "likelihood": "Oceni verjetnost nastopa tega tveganja na podlagi konteksta projekta. Vrni SAMO eno od treh besed: 'Low', 'Medium' ali 'High'. Brez drugega besedila.",
    "impact": "Oceni resnost posledic, če se to tveganje uresniči. Vrni SAMO eno od treh besed: 'Low', 'Medium' ali 'High'. Brez drugega besedila.",
    "description": "Generiraj strokoven, vsebinsko bogat opis z najmanj 3 stavki. Vključi specifične podrobnosti o metodologiji, obsegu in pričakovanih rezultatih. Izogibaj se generičnim polnilnim vsebinam.",
    "indicator": "Generiraj SMART kazalnik, ki je Specifičen, Merljiv, Dosegljiv, Relevanten in Časovno določen. Vključi konkretne številke, odstotke ali predvidene rezultate z jasnimi časovnimi okviri. Primer: 'Usposobiti 200 strokovnjakov v 18 mesecih'.",
    "mitigation": "Opiši specifične, izvedljive korake za preprečitev ali zmanjšanje tveganja. Vključi konkretna orodja, postopke ali načrte ukrepanja. Nikoli ne uporabljaj nejasnega jezika kot 'Obvladovali bomo to tveganje'.",
    "exploitationStrategy": "Opiši, KDO bo ta rezultat uporabil, KAKO bo izkoriščen (komercializacija, odprta koda, prispevek k politikam, licenciranje itd.) in KDAJ (časovnica za izkoriščanje med projektom in po njem)."
  },

  TRANSLATION_RULES: [
    "Ohrani NATANKO strukturo JSON — prevajaj samo besedilne vrednosti niznih polj. Nikoli ne spreminjaj ključev, struktur polj ali gnezdenja.",
    "Uporabljaj visokokakovostno, strokovno EU projektno terminologijo, primerno za uradne programske dokumente. Za pravilno terminologijo se posvetuj s standardnimi slovensko-angleškimi EU glosarji.",
    "NE prevajaj: ID-jev (WP1, T1.1, M1.1, D1.1, RISK1, KER1, GO1, SO1), datumov (YYYY-MM-DD), tehničnih okrajšav (TRL, SRL, ORL, LRL, PERT, SMART), tipov odvisnosti (FS, SS, FF, SF) ali vrednosti kategorij (Technical, Social, Economic, Low, Medium, High).",
    "Ohrani vse oblikovanje: prelome vrstic (\\n), dvojne prelome vrstic (\\n\\n), oznake za odebelitev (**besedilo**), strukture alinej in številčenje faz.",
    "Zagotovi slovnično pravilne, spolno ustrezne in slogovno naravne prevode. Izogibaj se dobesednemu prevajanju besedo za besedo — zvesto posreduj strokoven pomen.",
    "Ohrani pravilo nedoločnika v naslovih ciljev pri prevajanju. Angleški 'To develop...' mora postati slovenski 'Razviti...' (ne 'Razvoj...')."
  ],

  SUMMARY_RULES: [
    "Ustvari jedrnaten, visoko profesionalen in prepričljiv enostranski izvršni povzetek, primeren za odločevalce in evalvatorje.",
    "KRITIČNO PRAVILO SKLADNJE: Ko navaja Ključne cilje, Namene ali Vizije, MORA uporabiti GLAGOLE V NEDOLOČNIKU (npr. 'Razviti...', 'Vzpostaviti...'). NIKOLI ne uporabljaj posamostaljenj (npr. 'Razvoj...').",
    "Dosledno uporabljaj standardno slovensko EU terminologijo intervencijske logike v celotnem povzetku.",
    "Oblikuj izhod z uporabo enostavnega Markdowna: uporabi naslove (##), odebelitev (**besedilo**) in kratke odstavke. Ne uporabljaj alinej za glavno pripoved — uporabi tekoče besedilo.",
    "Povzetek mora vključevati vse naslednje razdelke: Naziv in akronim projekta, Opis problema (kateri problem se naslavlja in zakaj je pomemben), Glavni cilj (en stavek), Ključne cilje (3-5 najpomembnejših, v nedoločniški obliki), Pregled metodologije (kako bo projekt dosegel svoje cilje), Pričakovane rezultate (ključne Neposredne rezultate, Vmesne učinke in Dolgoročne vplive), Usklajenost z EU politikami (katere EU strategije projekt podpira).",
    "Povzetek mora biti prepričljiv in privlačen — napisan, kot da bi bil uvodna stran zmagovite prijave EU projekta."
  ]
};

// ─── COMBINED INSTRUCTIONS WITH METADATA ─────────────────────────

export const DEFAULT_INSTRUCTIONS = {
  _METADATA: {
    version: 3.0,
    lastUpdated: "v3.0 — Deep rewrite: infinitive rule globalised, cross-referencing, ID continuity, max length, field rules expanded, all rules deepened and linguistically refined"
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
