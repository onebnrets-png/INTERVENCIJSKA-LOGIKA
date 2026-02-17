// services/Instructions.ts
// ═══════════════════════════════════════════════════════════════════
// SINGLE SOURCE OF TRUTH for ALL AI content rules.
// Version 4.6 – 2026-02-17
//
// ARCHITECTURE PRINCIPLE:
//   This file is the ONLY place where content rules are defined.
//   geminiService.ts reads from here — it has ZERO own rules.
//   Anything changed here IS THE LAW — no exceptions.
//
// CHANGES v4.6:
//   - NEW: Global Instructions override integration via globalInstructionsService.ts
//   - Every exported accessor function now checks getGlobalOverrideSync() first.
//   - If admin has set a global override for a specific key → that override is used.
//   - If no override exists → hardcoded default from this file is used (unchanged behavior).
//   - Key format: dot notation matching structure, e.g., "CHAPTERS.chapter1_problemAnalysis",
//     "QUALITY_GATES.activities.en", "SECTION_TASK_INSTRUCTIONS.projectIdea.si", etc.
//   - geminiService.ts remains UNCHANGED — zero modifications needed.
//   - All previous v4.5 changes preserved.
//
// CHANGES v4.5:
//   - NEW: projectAcronym field rule added to FIELD_RULES (EN+SI) [3A]
//   - NEW: ACRONYM RULES block added to SECTION_TASK_INSTRUCTIONS.projectIdea EN [3B]
//   - NEW: PRAVILA ZA AKRONIM block added to SECTION_TASK_INSTRUCTIONS.projectIdea SI [3C]
//   - NEW: Acronym quality checks added to QUALITY_GATES.projectIdea EN+SI [3D]
//   - NEW: SUMMARY_RULES moved here (condensation engine)
//   - NEW: TEMPORAL_INTEGRITY_RULE added for activities
//   - All previous v4.4 changes preserved.
//
// CHANGES v4.4:
//   - FIXED: projectManagement.si — added full FORMATIRANJE OPISA block
//     (mirror of EN FORMATTING OF DESCRIPTION). AI now structures
//     Slovenian implementation description into paragraphs with topic headers.
//   - FIXED: activities EN/SI — added TASK DEPENDENCIES rules:
//     every task (except first task T1.1) MUST have ≥1 dependency.
//     Dependencies use predecessorId + type (FS/SS/FF/SF).
//   - FIXED: activities EN/SI — added DELIVERABLE QUALITY rules:
//     each deliverable must have separate title, description (2–4 sentences),
//     and indicator (specific, measurable, includes verification method).
//   - FIXED: activities EN/SI — added WP DURATION RULES:
//     Project Management WP = M1–final month (full span).
//     Dissemination WP = M1–final month (full span).
//     Content/technical WPs are sequential with overlaps, none spans full period.
//     Tasks within a WP are sequential, not all sharing identical dates.
//   - FIXED: QUALITY_GATES.activities EN/SI — added 4 new checks for
//     dependencies, deliverable quality, and WP duration compliance.
//   - All previous v4.3 changes preserved.
//
// CHANGES v4.3:
//   - FIXED: chapter5_activities section 5B — WP ordering corrected:
//     Project Management WP is now defined as LAST (not WP1).
//     Dissemination WP is SECOND-TO-LAST. This aligns with
//     SECTION_TASK_INSTRUCTIONS.activities which already had
//     the correct ordering rule.
//   - FIXED: SECTION_TASK_INSTRUCTIONS.risks — added 'Environmental'
//     / 'Okoljsko' risk category to instructions.
//   - FIXED: chapter5_activities section 5C risk register — added
//     'Environmental' category alongside Technical, Societal, Economic.
//   - FIXED: chapter5_activities section 5B WP count — changed from
//     "Minimum 5 work packages" to "Between 6 and 10 work packages"
//     to match SECTION_TASK_INSTRUCTIONS.activities.
//   - All previous v4.2 changes preserved.
//
// CHANGES v4.2:
//   - FIXED: projectManagement section now has TWO distinct parts:
//     * description field → ALL detailed narrative content (Implementation)
//     * structure fields → SHORT role labels ONLY (for Organigram chart)
//   - Updated SECTION_TASK_INSTRUCTIONS.projectManagement (EN + SI)
//   - Updated CHAPTERS.chapter5_activities section 5A to enforce
//     short labels in structure fields and full prose in description
//   - All previous v4.1 changes preserved.
//
// CHANGES v4.1:
//   - TITLE FORMAT RULES: Infinitive verb ONLY for objectives.
//     Work packages, tasks, milestones, deliverables → noun phrase (action).
//     Outputs, outcomes, impacts → result-oriented noun phrase.
//     KERs → specific noun phrase (asset/product name).
//   - Updated CHAPTERS 5 and 6 to enforce correct title formats.
//   - Updated SECTION_TASK_INSTRUCTIONS for activities, outputs,
//     outcomes, impacts, risks, kers to use noun phrases.
//   - Updated QUALITY_GATES._default to enforce section-specific format.
//   - All previous v4.0 changes preserved.
//
// English-only default text (AI interprets rules in English regardless
// of output language). Slovenian prompt variants are stored alongside.
// ═══════════════════════════════════════════════════════════════════

import { storageService } from './storageService';
import { getGlobalOverrideSync } from './globalInstructionsService.ts';

// ───────────────────────────────────────────────────────────────
// LANGUAGE DIRECTIVES
// ───────────────────────────────────────────────────────────────

export const LANGUAGE_DIRECTIVES: Record<string, string> = {
  en: `═══ LANGUAGE DIRECTIVE (MANDATORY — OVERRIDES ALL OTHER INSTRUCTIONS) ═══
You MUST write ALL output content — every title, every description,
every indicator, every single text value — EXCLUSIVELY in British
English. Do NOT use any other language, even if the context below
is partially or fully in Slovenian.
═══════════════════════════════════════════════════════════════════`,

  si: `═══ LANGUAGE DIRECTIVE (MANDATORY — OVERRIDES ALL OTHER INSTRUCTIONS) ═══
You MUST write ALL output content — every title, every description,
every indicator, every single text value — EXCLUSIVELY in Slovenian
(slovenščina). Do NOT use English for ANY field value, even if the
context below is partially or fully in English. Translate concepts
into Slovenian; do not copy English phrases.
═══════════════════════════════════════════════════════════════════`
};

// ───────────────────────────────────────────────────────────────
// LANGUAGE MISMATCH TEMPLATE
// ───────────────────────────────────────────────────────────────

export const LANGUAGE_MISMATCH_TEMPLATE = `═══ INPUT LANGUAGE NOTICE ═══
The user's existing content appears to be written in {{detectedName}},
but the current application language is set to {{targetName}}.
INSTRUCTIONS:
1. UNDERSTAND and PRESERVE the semantic meaning of the user's input regardless of its language.
2. Generate ALL new content in {{targetName}} as required by the Language Directive.
3. If enhancing existing content, translate it into {{targetName}} while improving it.
4. Do NOT discard or ignore the user's input just because it is in a different language.
5. The user's input defines the TOPIC — always stay on that topic.
═══════════════════════════════════════════════════════════════════`;

// ───────────────────────────────────────────────────────────────
// ACADEMIC RIGOR RULES
// ───────────────────────────────────────────────────────────────

export const ACADEMIC_RIGOR_RULES: Record<string, string> = {
  en: `═══ MANDATORY ACADEMIC RIGOR & CITATION RULES ═══
These rules apply to ALL generated content WITHOUT EXCEPTION.

1. EVIDENCE-BASED CONTENT ONLY
   - Every claim, statistic, or trend MUST be supported by a verifiable source.
   - Do NOT generate plausible-sounding but unverifiable statements.
   - Preferred sources: Eurostat, OECD, World Bank, European Commission reports,
     UN agencies, peer-reviewed journals, national statistical offices, ACER, IEA,
     JRC, EEA, CEDEFOP, Eurofound, WHO.

2. CITATION FORMAT
   - Use inline citations: (Author/Organization, Year).
   - MINIMUM 2–3 citations per major paragraph or claim cluster.

3. ZERO-HALLUCINATION POLICY
   - NEVER invent organisation names, project names, or study titles.
   - NEVER fabricate statistics or percentages.
   - If a specific data point is needed but unknown, write:
     "[Insert verified data: <description of what is needed>]"

4. DOUBLE-VERIFICATION STANDARD
   - Before including any factual claim, verify:
     a) Does this organisation/report actually exist?
     b) Is this statistic plausible and from a credible source?
     c) Is the year/date accurate?
   - If ANY doubt exists, use the placeholder format from rule 3.
═══════════════════════════════════════════════════════════════════`,

  si: `═══ OBVEZNA PRAVILA AKADEMSKE STROGOSTI IN CITIRANJA ═══
Ta pravila veljajo za VSO generirano vsebino BREZ IZJEME.

1. VSEBINA TEMELJI IZKLJUČNO NA DOKAZIH
   - Vsaka trditev, statistika ali trend MORA biti podprta s preverljivim virom.
   - NE generiraj verjetno zvenečih, a nepreverivih izjav.
   - Prednostni viri: Eurostat, OECD, Svetovna banka, poročila Evropske komisije,
     agencije OZN, recenzirane revije, nacionalni statistični uradi, ACER, IEA,
     JRC, EEA, CEDEFOP, Eurofound, WHO.

2. FORMAT CITIRANJA
   - Uporabi inline citate: (Avtor/Organizacija, Leto).
   - MINIMUM 2–3 citati na večji odstavek ali skupino trditev.

3. POLITIKA NIČELNE HALUCINACIJE
   - NIKOLI ne izmišljuj imen organizacij, projektov ali študij.
   - NIKOLI ne izmišljuj statistik ali odstotkov.
   - Če ne poznaš specifičnega podatka, napiši:
     "[Vstavite preverjen podatek: <opis potrebnega>]"

4. STANDARD DVOJNE PREVERJAVE
   - Pred vključitvijo katerekoli dejstvene trditve preveri:
     a) Ali ta organizacija/poročilo dejansko obstaja?
     b) Ali je ta statistika verjetna in iz verodostojnega vira?
     c) Ali je leto/datum točen?
   - Če obstaja KAKRŠENKOLI dvom, uporabi format označbe iz pravila 3.
═══════════════════════════════════════════════════════════════════`
};

// ───────────────────────────────────────────────────────────────
// HUMANIZATION RULES
// ───────────────────────────────────────────────────────────────

export const HUMANIZATION_RULES: Record<string, string> = {
  en: `═══ HUMANIZATION RULES (MANDATORY) ═══
Content must read as if written by an experienced human EU project consultant.
EU evaluators and AI detection tools easily identify machine-generated text.

1. SENTENCE STRUCTURE VARIATION
   - Mix short sentences (8–12 words) with medium (15–20) and occasional long (25–35).
   - NEVER write 3+ consecutive sentences of similar length or structure.
   - Start sentences with different parts of speech: noun, prepositional phrase,
     subordinate clause, adverb.

2. BANNED AI FINGERPRINT PHRASES — do NOT use:
   - "In today's rapidly evolving...", "It is important to note that..."
   - "plays a crucial/pivotal/key role", "aims to address"
   - "comprehensive/holistic/multifaceted approach"
   - "foster/leverage/synergy/harness/robust/cutting-edge"
   - "paving the way for", "serves as a catalyst", "the landscape of"
   - "navigating the complexities", "it is worth noting", "a testament to"
   - "in light of the above", "cannot be overstated"
   - Instead use direct, specific language a senior consultant would write.

3. PROFESSIONAL IMPERFECTION
   - Do NOT give every list item the same sentence structure or sentence count.
   - Vary description lengths slightly: some items 3 sentences, others 4 or 5.
   - Use occasional parenthetical remarks (like this) and em-dashes — for asides.

4. CONCRETE OVER ABSTRACT
   - Replace every abstract statement with a concrete, specific one.
   - WRONG: "Various stakeholders will benefit from improved digital capacities."
   - RIGHT: "Municipal energy managers in 12 partner regions will gain hands-on
     experience with the GridSense dashboard, reducing anomaly response time
     from 48 hours to under 4 hours."

5. VARIED LOGICAL CONNECTORS
   - Use: "Consequently,", "In parallel,", "A related challenge is",
     "Building on this,", "Against this backdrop,", "While progress has been
     made in X, the situation regarding Y remains critical."
   - Do NOT repeat: "Furthermore,", "Moreover,", "Additionally," — these are AI markers.

6. ACTIVE VOICE PREFERENCE
   - "The consortium will develop..." NOT "A platform will be developed..."
   - Use passive only when the actor is genuinely unknown.

7. QUANTIFIED SPECIFICITY
   - Never "significant improvement" — say "a 23% reduction in processing time."
   - Never "multiple partners" — say "7 partners across 4 EU Member States."
   - Never "various activities" — say "3 workshops, 2 pilots, and 1 hackathon."
═══════════════════════════════════════════════════════════════════`,

  si: `═══ PRAVILA ZA HUMANIZACIJO BESEDILA (OBVEZNO) ═══
Besedilo mora delovati kot da ga je napisal izkušen človeški EU svetovalec.
EU ocenjevalci in AI detektorji zlahka prepoznajo strojno generirano besedilo.

1. VARIACIJA STAVČNIH STRUKTUR
   - Mešaj kratke stavke (8–12 besed) s srednje dolgimi (15–20) in občasno daljšimi (25–35).
   - NIKOLI ne piši 3+ zaporednih stavkov enake dolžine ali strukture.
   - Začni stavke z različnimi besednimi vrstami: samostalnik, predložna fraza, podredni odvisnik, prislov.

2. PREPOVEDANE AI FRAZE — NE uporabljaj:
   - "V današnjem hitro spreminjajočem se okolju..."
   - "Pomembno je poudariti, da..."
   - "igra ključno/odločilno vlogo"
   - "celosten/holističen pristop"
   - "izkoriščati sinergije"
   - "služi kot katalizator"
   - "utira pot"
   - "večplasten pristop"
   - "v luči zgoraj navedenega"
   - "ni mogoče preceniti"
   - Namesto tega piši neposredno, specifično, kot bi pisal izkušen svetovalec.

3. PROFESIONALNA NEPOPOLNOST
   - Resnično človeško pisanje ni simetrično. NE dajaj vsakemu elementu v seznamu
     natančno enako strukturo stavkov ali enako število stavkov.
   - Rahlo variraj dolžine opisov: nekateri vzroki imajo 3 stavke, drugi 4 ali 5.
   - Občasno uporabi oklepaje (kot tukaj) za dodatni kontekst.
   - Občasno uporabi pomišljaje — za poudarek ali stransko opombo.

4. KONKRETNO NAD ABSTRAKTNIM
   - Zamenjaj vsako abstraktno trditev s konkretno, specifično.
   - NAPAČNO: "Različni deležniki bodo imeli koristi od izboljšanih zmogljivosti."
   - PRAVILNO: "Občinski upravljavci energije v 12 partnerskih regijah bodo pridobili
     praktične izkušnje z nadzorno ploščo, kar bo zmanjšalo odzivni čas s 48 ur na manj kot 4 ure."

5. RAZNOVRSTNI LOGIČNI POVEZOVALCI
   - Uporabljaj: "Posledično,", "Vzporedno s tem,", "Soroden izziv je",
     "Na podlagi tega,", "Ob tem ozadju,", "Čeprav je bil dosežen napredek pri X,
     stanje glede Y ostaja kritično."
   - NE ponavljaj: "Poleg tega,", "Nadalje,", "Prav tako," — to so AI markerji.

6. PREDNOST TVORNIKU
   - "Konzorcij bo razvil..." NE "Platforma bo razvita..."
   - Trpnik uporabi le kadar je akter resnično neznan ali nepomemben.

7. KVANTIFICIRANA SPECIFIČNOST
   - Nikoli "znatno izboljšanje" — ampak "23-odstotno zmanjšanje časa obdelave."
   - Nikoli "številni partnerji" — ampak "7 partnerjev iz 4 držav članic EU."
   - Nikoli "različne dejavnosti" — ampak "3 usposabljanja, 2 pilotni uvedbi in 1 hackathon."
═══════════════════════════════════════════════════════════════════`
};

// ───────────────────────────────────────────────────────────────
// PROJECT TITLE RULES
// ───────────────────────────────────────────────────────────────

export const PROJECT_TITLE_RULES: Record<string, string> = {
  en: `═══ STRICT RULES FOR PROJECT TITLE (projectTitle) ═══
ATTENTION: These rules apply ONLY to the "projectTitle" field (project name).
The acronym is generated SEPARATELY — the title MUST NOT contain an acronym.

1. LENGTH: between 30 and 200 characters (NOT shorter, NOT longer)
2. FORMAT: concise NOUN PHRASE — NOT a full sentence, NOT a verb form
3. NO ACRONYM — that is generated separately
4. NO CONJUGATED VERBS (NOT "The project will develop...", NOT "We develop...")
5. NO generic AI phrases ("An innovative approach to comprehensive development...")
6. NO comma-separated enumerations ("development, implementation, testing and dissemination...")
7. NO adjective chains ("Innovative, sustainable, comprehensive and advanced solution")
8. Title MUST answer: "What does this project DELIVER / ACHIEVE?"
9. Title is a PROJECT BRAND — concise, memorable, professional

GOOD TITLE EXAMPLES:
- "Digital Transformation of Artisan Skills in Cross-Border Regions"
- "Circular Economy in the Wood Processing Industry of the Danube Region"
- "Green Mobility Transition in Medium-Sized Cities"
- "Strengthening Digital Competences of Rural Youth"
- "Sustainable Food Supply Chain in the Alpine Space"
- "Intergenerational Knowledge Transfer in Cultural Heritage"

BAD TITLE EXAMPLES (FORBIDDEN):
- "Project for developing innovative solutions for sustainable transformation" (too generic)
- "We develop new approaches to comprehensively solving challenges" (sentence with verb)
- "Innovative, sustainable, comprehensive and advanced solution" (adjective chain)
- "GREENTRANS – Green Urban Transport Transformation" (contains acronym — FORBIDDEN)
- "The project will establish a platform for..." (sentence with verb — FORBIDDEN)
═══════════════════════════════════════════════════════════════════`,

  si: `═══ STROGA PRAVILA ZA NAZIV PROJEKTA (projectTitle) ═══
POZOR: To so pravila SAMO za polje "projectTitle" (naziv projekta).
Akronim se generira LOČENO — naziv NE sme vsebovati akronima.

1. DOLŽINA: med 30 in 200 znakov (NE krajši, NE daljši)
2. OBLIKA: jedrnata IMENSKI IZRAZ — NE cel stavek, NE glagolska oblika
3. BREZ AKRONIMA — ta se generira posebej
4. BREZ GLAGOLOV v osebni obliki (NE "Projekt bo razvil...", NE "Razvijamo...")
5. BREZ generičnih AI fraz ("Inovativen pristop k celovitemu razvoju...")
6. BREZ naštevanja s vejicami ("razvoj, implementacija, testiranje in diseminacija...")
7. BREZ naštevanja pridevnikov ("Inovativna, trajnostna, celovita in napredna rešitev")
8. Naziv MORA odgovoriti na vprašanje: "Kaj ta projekt PRINESE / NAREDI?"
9. Naziv je BLAGOVNA ZNAMKA projekta — jedrnat, zapomnljiv, strokoven

VZORCI DOBRIH NAZIVOV:
- "Digitalna preobrazba obrtniških veščin v čezmejnem prostoru"
- "Krožno gospodarstvo v lesnopredelovalni industriji Podonavja"
- "Zeleni prehod mobilnosti v srednje velikih mestih"
- "Krepitev digitalnih kompetenc mladih na podeželju"
- "Trajnostna prehranska veriga v alpskem prostoru"
- "Medgeneracijski prenos znanj v kulturni dediščini"

VZORCI SLABIH NAZIVOV (PREPOVEDANO):
- "Projekt za razvoj inovativnih rešitev za trajnostno preobrazbo" (preveč generično)
- "Razvijamo nove pristope k celovitemu reševanju izzivov" (stavek z glagolom)
- "Inovativna, trajnostna, celovita in napredna rešitev" (naštevanje pridevnikov)
- "GREENTRANS – Zelena preobrazba prometa" (vsebuje akronim — PREPOVEDANO)
- "Projekt bo vzpostavil platformo za..." (stavek z glagolom — PREPOVEDANO)
═══════════════════════════════════════════════════════════════════`
};

// ───────────────────────────────────────────────────────────────
// MODE INSTRUCTIONS (fill / enhance / regenerate)
// ───────────────────────────────────────────────────────────────

export const MODE_INSTRUCTIONS: Record<string, Record<string, string>> = {
  fill: {
    en: `MODE: FILL MISSING ONLY.
RULES:
1. KEEP all existing non-empty fields exactly as they are — do NOT modify them.
2. GENERATE professional content ONLY for fields that are empty strings ("") or missing.
3. If a list has fewer items than recommended, ADD NEW ITEMS.
4. Ensure valid JSON output.`,
    si: `NAČIN: DOPOLNJEVANJE MANJKAJOČEGA.
PRAVILA:
1. OHRANI vsa obstoječa neprazna polja natančno takšna, kot so — NE spreminjaj jih.
2. GENERIRAJ strokovno vsebino SAMO za polja, ki so prazni nizi ("") ali manjkajoča.
3. Če ima seznam manj elementov od priporočenega, DODAJ NOVE ELEMENTE.
4. Zagotovi veljaven JSON objekt.`
  },
  enhance: {
    en: `MODE: PROFESSIONAL ENHANCEMENT OF EXISTING CONTENT.

Task: PROFESSIONALLY ENHANCE, DEEPEN, and REFINE the existing content.

RULES:
1. PRESERVE the meaning and topic — do NOT change the thematic focus.
2. ENHANCE: add EU terminology, deepen arguments with evidence.
3. ADD CITATIONS from REAL sources.
4. EXPAND short fields to 3–5 sentences.
5. SUPPLEMENT: add new items if lists are short.
6. CORRECT errors.
7. NEVER REMOVE existing items.
8. ZERO HALLUCINATION — if unsure: "[Insert verified data: ...]".
9. NO MARKDOWN: do not use ** ## \`.
10. HUMANIZE: write like an experienced human consultant, vary sentence structure.
11. Ensure valid JSON output.`,
    si: `NAČIN: STROKOVNA IZBOLJŠAVA OBSTOJEČEGA BESEDILA.

Naloga: STROKOVNO IZBOLJŠAJ, POGLOBI in DODELAJ obstoječo vsebino.

PRAVILA:
1. OHRANI pomen in tematiko — NE spreminjaj vsebinskega fokusa.
2. IZBOLJŠAJ: dodaj strokovno EU terminologijo, poglobi argumente.
3. DODAJ CITATE iz REALNIH virov.
4. PODALJŠAJ: kratka polja razširi na vsaj 3–5 stavkov.
5. DOPOLNI: če je seznam kratek, DODAJ NOVE ELEMENTE.
6. POPRAVI napake.
7. NE BRIŠI obstoječih elementov.
8. NE HALUCINIRAJ — če nisi prepričan: "[Vstavite preverjen podatek: ...]".
9. BREZ MARKDOWN: ne uporabljaj ** ## \`.
10. HUMANIZIRAJ: piši kot izkušen človeški svetovalec, variraj stavke.
11. Zagotovi veljaven JSON objekt.`
  },
  regenerate: {
    en: `MODE: FULL REGENERATION.
Generate completely new, comprehensive, professional content. Every description MUST contain citations from REAL sources. NO markdown (**, ##, \`). Write like an experienced human consultant — vary sentence structures. If unknown: '[Insert verified data: ...]'.`,
    si: `NAČIN: POPOLNA PONOVNA GENERACIJA.
Generiraj popolnoma nov, celovit, strokoven odgovor. Vsak opis MORA vsebovati citate iz REALNIH virov. BREZ markdown (**, ##, \`). Piši kot izkušen človeški svetovalec — variraj stavčne strukture. Če ne poznaš podatka: '[Vstavite preverjen podatek: ...]'.`
  }
};

// ───────────────────────────────────────────────────────────────
// QUALITY GATES (per section)
// ───────────────────────────────────────────────────────────────

export const QUALITY_GATES: Record<string, Record<string, string[]>> = {
  problemAnalysis: {
    en: [
      'Every cause description contains ≥1 specific citation in format (Source Name, Year)',
      'Every consequence description contains ≥1 specific citation in format (Source Name, Year)',
      'The core problem statement includes at least one quantitative indicator',
      'Every description paragraph has ≥3 substantive, analytical sentences — no filler',
      'No vague phrases such as "various stakeholders", "different aspects" — be specific',
      'At least 4 distinct, non-overlapping causes are listed',
      'At least 4 distinct consequences are listed, at least one referencing EU-level policy',
      'Causes are logically ordered: root causes first, then proximate causes',
      'All cited sources are real, verifiable — do NOT fabricate statistics',
      'If unsure about a number, use "[Insert verified data: ...]" placeholder',
      'No banned AI phrases (leverage, synergy, holistic, foster, cutting-edge, etc.)',
      'Sentence lengths vary — no 3+ consecutive sentences of similar length',
    ],
    si: [
      'Vsak opis vzroka vsebuje ≥1 specifičen citat v formatu (Ime vira, Leto)',
      'Vsak opis posledice vsebuje ≥1 specifičen citat v formatu (Ime vira, Leto)',
      'Izjava o osrednjem problemu vključuje vsaj en kvantitativni kazalnik',
      'Vsak opisni odstavek ima ≥3 vsebinske, analitične stavke — brez polnil',
      'Brez nejasnih fraz kot "različni deležniki", "različni vidiki" — bodi specifičen',
      'Navedenih je vsaj 5 ločenih, neprekrivajočih se vzrokov',
      'Navedene so vsaj 4 ločene posledice, vsaj ena se sklicuje na EU politiko',
      'Vzroki so logično urejeni: najprej temeljni vzroki, nato neposredni',
      'Vsi navedeni viri so resnični, preverljivi — NE izmišljuj statistik',
      'Če nisi prepričan o številki, uporabi "[Vstavite preverjen podatek: ...]"',
      'Brez prepovedanih AI fraz (sinergije, holističen, celosten, katalizator itd.)',
      'Dolžine stavkov se razlikujejo — brez 3+ zaporednih stavkov enake dolžine',
    ]
  },
  // ═══════════════════════════════════════════════════════════════
  // v4.5 FIX [3D]: Added projectAcronym quality checks
  // ═══════════════════════════════════════════════════════════════
  projectIdea: {
    en: [
      'projectTitle is a concise noun phrase (30–200 chars), NO acronym, NO full sentence',
      'projectAcronym is 3–8 uppercase letters, derived from projectTitle keywords, is pronounceable or a recognisable abbreviation, and is NOT a generic word (e.g., PROJECT, EUROPE)',
      'State of the Art references ≥3 specific existing projects/studies with names and years',
      'Proposed Solution BEGINS with a 5–8 sentence introductory paragraph BEFORE any phases',
      'Proposed Solution phases use plain text headers (no ** or ## markdown)',
      'Main Aim is one comprehensive sentence starting with an infinitive verb',
      'At least 3 relevant EU policies listed with specific alignment descriptions',
      'All readiness levels include a specific justification (not just the number)',
      'All cited projects and policies are real and verifiable — no fabricated names',
      'No banned AI phrases — write like a senior human consultant',
      'Sentence lengths and structures vary naturally throughout',
    ],
    si: [
      'projectTitle je jedrnata imenski izraz (30–200 znakov), BREZ akronima, BREZ celega stavka',
      'projectAcronym je 3–8 velikih črk, izpeljan iz ključnih besed projectTitle, je izgovorljiv ali prepoznavna kratica, in NI generična beseda (npr. PROJEKT, EVROPA)',
      'Stanje tehnike navaja ≥3 specifične obstoječe projekte/študije z imeni in letnicami',
      'Predlagana rešitev se ZAČNE s 5–8 stavkov dolgim uvodnim odstavkom PRED fazami',
      'Faze predlagane rešitve uporabljajo golo besedilo za naslove (brez ** ali ## markdown)',
      'Glavni cilj je en celovit stavek, ki se začne z glagolom v nedoločniku',
      'Navedene so vsaj 3 relevantne EU politike s specifičnimi opisi usklajenosti',
      'Vse stopnje pripravljenosti vključujejo specifično utemeljitev (ne samo številke)',
      'Vsi navedeni projekti in politike so resnični in preverljivi — brez izmišljenih imen',
      'Brez prepovedanih AI fraz — piši kot izkušen človeški svetovalec',
      'Dolžine in strukture stavkov se naravno razlikujejo skozi besedilo',
    ]
  },
  // ═══════════════════════════════════════════════════════════════
  // v4.4 FIX: Added dependency, deliverable, and WP duration checks
  // ═══════════════════════════════════════════════════════════════
  activities: {
    en: [
      'The LAST WP (highest number) is "Project Management and Coordination" — NOT any other topic',
      'The SECOND-TO-LAST WP is "Dissemination, Communication and Exploitation"',
      'WP1 is a foundational/analytical WP — NOT project management',
      'Total number of WPs is between 6 and 10',
      'Every WP has at least 1 milestone with a date in YYYY-MM-DD format',
      'Every WP has at least 1 deliverable with separate title and description fields',
      'Every task has startDate and endDate in YYYY-MM-DD format',
      'All WP and task titles use NOUN PHRASES, not infinitive verbs',
      'No markdown formatting in any text field',
      'Every task (except the very first task T1.1) has at least 1 dependency in its dependencies array',
      'Dependencies reference only valid predecessorId values from tasks that exist in the project',
      'Dependency types are valid: FS (Finish-to-Start), SS (Start-to-Start), FF (Finish-to-Finish), or SF (Start-to-Finish)',
      'Cross-WP dependencies exist — at least some tasks depend on tasks in OTHER work packages',
      'Every deliverable title is a concise noun phrase (3–10 words)',
      'Every deliverable description has 2–4 substantive sentences explaining scope, format, and content',
      'Every deliverable indicator is specific and measurable — includes quantity, format, and verification method',
      'Project Management WP spans the ENTIRE project duration (M1 to final month)',
      'Dissemination WP spans the ENTIRE project duration (M1 to final month)',
      'No content/technical WP spans the entire project — each covers a specific phase',
      'Tasks within each WP are sequential or staggered — NOT all sharing identical start and end dates',
      'NO task endDate exceeds the project end date ({{projectEnd}})',
      'NO milestone date exceeds the project end date ({{projectEnd}})',
      'Final reporting task and closing milestone are scheduled ON or BEFORE the project end date',
    ],
    si: [
      'ZADNJI DS (najvišja številka) je "Upravljanje in koordinacija projekta" — NE nobena druga tema',
      'PREDZADNJI DS je "Diseminacija, komunikacija in izkoriščanje rezultatov"',
      'DS1 je temeljni/analitični DS — NE projektno vodenje',
      'Skupno število DS je med 6 in 10',
      'Vsak DS ima vsaj 1 mejnik z datumom v formatu YYYY-MM-DD',
      'Vsak DS ima vsaj 1 dosežek z ločenima poljema naslov in opis',
      'Vsaka naloga ima startDate in endDate v formatu YYYY-MM-DD',
      'Vsi naslovi DS in nalog uporabljajo SAMOSTALNIŠKE ZVEZE, ne nedoločnik',
      'Brez markdown formatiranja v nobenem besedilnem polju',
      'Vsaka naloga (razen prve naloge T1.1) ima vsaj 1 odvisnost v polju dependencies',
      'Odvisnosti navajajo samo veljavne predecessorId vrednosti iz nalog, ki obstajajo v projektu',
      'Tipi odvisnosti so veljavni: FS (konec-začetek), SS (začetek-začetek), FF (konec-konec) ali SF (začetek-konec)',
      'Obstajajo meddelovne odvisnosti — vsaj nekatere naloge so odvisne od nalog v DRUGIH delovnih sklopih',
      'Vsak naslov dosežka je jedrnata samostalniška zveza (3–10 besed)',
      'Vsak opis dosežka ima 2–4 vsebinske stavke, ki pojasnjujejo obseg, format in vsebino',
      'Vsak kazalnik dosežka je specifičen in merljiv — vključuje količino, format in način preverjanja',
      'DS za upravljanje projekta traja CELOTNO trajanje projekta (M1 do zadnjega meseca)',
      'DS za diseminacijo traja CELOTNO trajanje projekta (M1 do zadnjega meseca)',
      'Noben vsebinski/tehnični DS ne traja celotno obdobje projekta — vsak pokriva specifično fazo',
      'Naloge znotraj vsakega DS so zaporedne ali zamaknjene — NE vse z enakimi začetnimi in končnimi datumi',
      'NOBEN endDate naloge ne presega datuma zaključka projekta ({{projectEnd}})',
      'NOBEN datum mejnika ne presega datuma zaključka projekta ({{projectEnd}})',
      'Zaključna poročevalska naloga in zaključni mejnik sta načrtovana NA ali PRED datumom zaključka projekta',
    ]
  },
  _default: {
    en: [
      'Every description has ≥3 substantive sentences',
      'All titles use the CORRECT format for their section (infinitive for objectives, noun phrase for activities/results/KERs) — see TITLE FORMAT RULES',
      'No vague filler phrases — be specific and analytical',
      'Content is directly linked to the project context and problem analysis',
      'Any cited source must be real and verifiable',
      'No markdown formatting (no **, no ##, no `) in output text',
      'No banned AI phrases (leverage, synergy, holistic, foster, cutting-edge, etc.)',
      'Sentence lengths vary — no 3+ consecutive sentences of similar length',
    ],
    si: [
      'Vsak opis ima ≥3 vsebinske stavke',
      'Vsi naslovi uporabljajo PRAVILNO obliko za svoj razdelek (nedoločnik za cilje, samostalniška zveza za aktivnosti/rezultate/KER) — glej PRAVILA ZA FORMAT NASLOVOV',
      'Brez nejasnih fraz — bodi specifičen in analitičen',
      'Vsebina je neposredno povezana s kontekstom projekta in analizo problemov',
      'Vsak naveden vir mora biti resničen in preverljiv',
      'Brez markdown formatiranja (brez **, brez ##, brez `)',
      'Brez prepovedanih AI fraz (sinergije, holističen, celosten, katalizator itd.)',
      'Dolžine stavkov se razlikujejo — brez 3+ zaporednih stavkov enake dolžine',
    ]
  }
};

// ───────────────────────────────────────────────────────────────
// SECTION TASK INSTRUCTIONS
// Templates with {{placeholders}} replaced at runtime
// ───────────────────────────────────────────────────────────────

export const SECTION_TASK_INSTRUCTIONS: Record<string, Record<string, string>> = {
  problemAnalysis: {
    en: `USER INPUT FOR CORE PROBLEM:
{{userInput}}

TASK: Based STRICTLY on the USER INPUT ABOVE, create (or complete) a detailed problem analysis.

MANDATORY:
- Title and description MUST be directly related to user's input.
- Do NOT invent unrelated topics.
- Every CAUSE: title + 3–5 sentence description + at least 1 citation from REAL source.
- Every CONSEQUENCE: title + 3–5 sentence description + at least 1 citation from REAL source.
- Core problem MUST include a quantitative indicator.
- NEVER write generic descriptions without evidence.
- If unknown: "[Insert verified data: <description>]".
- NO markdown (**, ##, \`).
- Write like an experienced human consultant — vary sentence structures.`,
    si: `UPORABNIKOV VNOS ZA OSREDNJI PROBLEM:
{{userInput}}

NALOGA: Na podlagi ZGORNJEGA VNOSA ustvari (ali dopolni) podrobno analizo problemov.

OBVEZNE ZAHTEVE:
- Generirani naslov in opis MORATA biti neposredno povezana z uporabnikovim vnosom.
- NE izmišljuj nepovezanih tem.
- Vsak VZROK: naslov + opis s 3–5 stavki + vsaj 1 citat iz REALNEGA vira.
- Vsaka POSLEDICA: naslov + opis s 3–5 stavki + vsaj 1 citat iz REALNEGA vira.
- Osrednji problem MORA vključevati kvantitativni kazalnik.
- NIKOLI generičnih opisov brez podatkov.
- Če ne poznaš podatka: "[Vstavite preverjen podatek: <opis>]".
- BREZ markdown (**, ##, \`).
- Piši kot izkušen človeški svetovalec — variraj stavke.`
  },
  // ═══════════════════════════════════════════════════════════════
  // v4.5 FIX [3B + 3C]: Added ACRONYM RULES blocks
  // ═══════════════════════════════════════════════════════════════
  projectIdea: {
    en: `{{titleContext}}Based on the problem analysis, develop (or complete) a comprehensive project idea.

ACRONYM RULES (projectAcronym field):
- Generate a project ACRONYM derived from the key words of the projectTitle.
- LENGTH: 3–8 uppercase letters. Example: "GREENTRANS", "DIGI-CRAFT", "ALPSUST".
- The acronym MUST be pronounceable or a recognisable abbreviation.
- The acronym MUST NOT be a generic word (e.g., "PROJECT", "EUROPE", "DIGITAL").
- The acronym MUST NOT duplicate the full title — it is a SHORT code.
- If the title contains a geographic or thematic keyword, try to include it.
- Hyphens are allowed (e.g., "DIGI-CRAFT") but not required.
- Place the acronym ONLY in the "projectAcronym" field — NOT inside projectTitle.

MANDATORY:
- State of the Art MUST reference at least 3 REAL existing projects/studies with names and years.
- Proposed Solution MUST BEGIN with a COMPREHENSIVE INTRODUCTORY PARAGRAPH (5–8 sentences) before phases.
- Phase headers: plain text "Phase 1: Title" — NOT "**Phase 1: Title**".
- EU policies must be real and verifiable.
- If unknown project: "[Insert verified project: <topic>]".
- NO markdown (**, ##, \`).
- Write like an experienced human consultant — vary sentences, avoid AI phrases.`,
    si: `{{titleContext}}Na podlagi analize problemov razvij (ali dopolni) celovito projektno idejo.

PRAVILA ZA AKRONIM (polje projectAcronym):
- Generiraj projektni AKRONIM, izpeljan iz ključnih besed polja projectTitle.
- DOLŽINA: 3–8 velikih črk. Primer: "GREENTRANS", "DIGI-CRAFT", "ALPSUST".
- Akronim MORA biti izgovorljiv ali prepoznavna kratica.
- Akronim NE SME biti generična beseda (npr. "PROJEKT", "EVROPA", "DIGITAL").
- Akronim NE SME podvajati celotnega naziva — je KRATKA koda.
- Če naziv vsebuje geografsko ali tematsko ključno besedo, jo poskusi vključiti.
- Vezaji so dovoljeni (npr. "DIGI-CRAFT"), ampak niso obvezni.
- Akronim vstavi SAMO v polje "projectAcronym" — NE v projectTitle.

OBVEZNE ZAHTEVE:
- Stanje tehnike MORA navajati vsaj 3 RESNIČNE obstoječe projekte/študije z imeni in letnicami.
- Predlagana rešitev MORA začeti s CELOVITIM UVODNIM ODSTAVKOM (5–8 stavkov) pred fazami.
- Faze: golo besedilo "Faza 1: Naslov" — NE "**Faza 1: Naslov**".
- EU politike morajo biti resnične in preverljive.
- Če ne poznaš projekta: "[Vstavite preverjen projekt: <tematika>]".
- BREZ markdown (**, ##, \`).
- Piši kot izkušen človeški svetovalec — variraj stavke, izogibaj se AI frazam.`
  },
  generalObjectives: {
    en: 'Define 3–5 general objectives.\nMANDATORY: Title MUST use INFINITIVE VERB (e.g., "Strengthen…", "Develop…"). At least 3 substantive sentences. No markdown. Vary sentence structures.',
    si: 'Opredeli 3–5 splošnih ciljev.\nOBVEZNO: Naslov MORA uporabljati NEDOLOČNIK (npr. "Okrepiti…", "Razviti…"). Vsaj 3 vsebinske stavke. BREZ markdown. Variraj stavčne strukture.'
  },
  specificObjectives: {
    en: 'Define at least 5 S.M.A.R.T. objectives.\nMANDATORY: Title MUST use INFINITIVE VERB (e.g., "Develop…", "Increase…"). Measurable KPI. No markdown. Vary sentence structures.',
    si: 'Opredeli vsaj 5 S.M.A.R.T. ciljev.\nOBVEZNO: Naslov MORA uporabljati NEDOLOČNIK (npr. "Razviti…", "Povečati…"). Merljiv KPI. BREZ markdown. Variraj stavčne strukture.'
  },

  // ═══════════════════════════════════════════════════════════════
  // v4.4 FIX: SI block now has full FORMATIRANJE OPISA section
  // ═══════════════════════════════════════════════════════════════
  projectManagement: {
    en: `Create a DETAILED project management section with TWO distinct parts:

PART 1 — DESCRIPTION FIELD (projectManagement.description):
This is the MAIN content field. It MUST contain a comprehensive text (minimum 500 words) covering ALL of the following:
1. MANAGEMENT STRUCTURE – Roles with EU abbreviations: PK, UO, SO, VDS. Responsibilities and authority of each.
2. DECISION-MAKING MECHANISMS – Operational, strategic, escalation levels. Voting, quorum, meeting frequency.
3. QUALITY ASSURANCE – Internal reviews, peer evaluations, external audits, benchmarks, reporting standards.
4. RISK MANAGEMENT APPROACH – Identification, assessment, monitoring, mitigation. Reference risk register (5C).
5. INTERNAL COMMUNICATION – Tools, schedules, reporting chains, document management.
6. CONFLICT RESOLUTION – Escalation: informal → mediation by coordinator → formal arbitration.
7. DATA MANAGEMENT AND OPEN SCIENCE – FAIR principles, access types, repository details.
Write as flowing prose paragraphs, not bullet lists. No markdown. Write like an experienced consultant.

FORMATTING OF DESCRIPTION:
- Structure the description into CLEAR PARAGRAPHS separated by double newlines (\\n\\n).
- Each major topic (management structure, decision-making, quality assurance, risk management, communication, conflict resolution, data management) should be its OWN PARAGRAPH.
- Begin each paragraph with the topic as a plain text header on its own line, e.g.: "Management Structure" followed by a newline, then the descriptive text.
- Do NOT write one continuous block of text. The text must be readable with clear visual separation between topics.

PART 2 — STRUCTURE FIELDS (projectManagement.structure):
These fields appear as LABELS in the organigram chart. They MUST contain ONLY short role titles (max 5–8 words each):
- coordinator: e.g., "Project Coordinator (PK)"
- steeringCommittee: e.g., "Steering Committee (UO)"
- advisoryBoard: e.g., "Advisory Board (SO)"
- wpLeaders: e.g., "WP Leaders (VDS)"
CRITICAL: Do NOT put descriptions, explanations, or long text in structure fields. These are chart labels ONLY. All detailed descriptions go in the description field above.`,

    si: `Ustvari PODROBEN razdelek o upravljanju projekta z DVEMA ločenima deloma:

DEL 1 — POLJE OPIS (projectManagement.description):
To je GLAVNO vsebinsko polje. MORA vsebovati celovito besedilo (najmanj 500 besed), ki pokriva VSE naslednje:
1. UPRAVLJAVSKA STRUKTURA – Vloge z EU kraticami: PK, UO, SO, VDS. Odgovornosti in pooblastila vsake vloge.
2. MEHANIZMI ODLOČANJA – Operativna, strateška, eskalacijska raven. Glasovanje, sklepčnost, pogostost sestankov.
3. ZAGOTAVLJANJE KAKOVOSTI – Notranje revizije, medsebojne evalvacije, zunanje presoje, referenčne točke, standardi poročanja.
4. PRISTOP K OBVLADOVANJU TVEGANJ – Identifikacija, ocena, spremljanje, blaženje. Referenca na register tveganj (5C).
5. NOTRANJE KOMUNICIRANJE – Orodja, urniki, verige poročanja, upravljanje dokumentov.
6. REŠEVANJE KONFLIKTOV – Eskalacija: neformalno → mediacija koordinatorja → formalna arbitraža.
7. UPRAVLJANJE PODATKOV IN ODPRTA ZNANOST – Načela FAIR, vrste dostopa, podrobnosti repozitorija.
Piši v tekočih odstavkih proze, NE v točkastih seznamih. Brez markdown. Piši kot izkušen svetovalec.

FORMATIRANJE OPISA:
- Opis strukturiraj v JASNE ODSTAVKE, ločene z dvojnimi novimi vrsticami (\\n\\n).
- Vsaka večja tema (upravljavska struktura, mehanizmi odločanja, zagotavljanje kakovosti, obvladovanje tveganj, komuniciranje, reševanje konfliktov, upravljanje podatkov) mora biti SVOJ ODSTAVEK.
- Vsak odstavek začni z naslovom teme v goli besedilni obliki v svoji vrstici, npr.: "Upravljavska struktura" in nato nova vrstica s tekočim opisnim besedilom.
- NE piši enega neprekinjenega bloka besedila. Besedilo mora biti berljivo z jasno vizualno ločitvijo med temami.

DEL 2 — STRUKTURNA POLJA (projectManagement.structure):
Ta polja se prikazujejo kot OZNAKE v organigramu. MORAJO vsebovati SAMO kratke nazive vlog (največ 5–8 besed):
- coordinator: npr. "Koordinator projekta (PK)"
- steeringCommittee: npr. "Usmerjevalni odbor (UO)"
- advisoryBoard: npr. "Svetovalni odbor (SO)"
- wpLeaders: npr. "Vodja delovnega sklopa (VDS)"
KLJUČNO: V strukturna polja NE vstavljaj opisov, pojasnil ali dolgega besedila. To so SAMO oznake za grafikon. Vsi podrobni opisi gredo v polje opis zgoraj.`
  },

  // ═══════════════════════════════════════════════════════════════
  // v4.4 FIX: Added TASK DEPENDENCIES, DELIVERABLE QUALITY, and
  //           WP DURATION RULES to activities instructions
  // ═══════════════════════════════════════════════════════════════
  activities: {
    en: `Generate between 6 and 10 Work Packages with tasks, milestones and deliverables.

ABSOLUTE PROJECT TIMEFRAME CONSTRAINT:
- Project START date: {{projectStart}}
- Project END date: {{projectEnd}} ({{projectDurationMonths}} months total)
- EVERY task startDate MUST be ≥ {{projectStart}}
- EVERY task endDate MUST be ≤ {{projectEnd}}
- EVERY milestone date MUST be ≤ {{projectEnd}}
- EVERY WP must start on or after {{projectStart}} and end on or before {{projectEnd}}
- NO activity, task, milestone, or deliverable may be scheduled AFTER {{projectEnd}}
- Dissemination, exploitation, and reporting tasks MUST be completed by {{projectEnd}}
- The final project report and closing milestone MUST be on or before {{projectEnd}}
- This is NON-NEGOTIABLE — any date outside this range is a FATAL ERROR

TITLE FORMAT RULES:
- WP titles: noun phrase (e.g., "Baseline Analysis and Stakeholder Mapping")
- Task titles: noun phrase (e.g., "Development of Training Curriculum")
- Milestone descriptions: noun phrase (e.g., "Completion of Pilot Phase")
- Deliverable titles: noun phrase (e.g., "Stakeholder Engagement Report")
- Do NOT use infinitive verbs for any of these.

WORK PACKAGE ORDERING (MANDATORY):
- WP1: foundational/analytical (e.g., "Baseline Analysis and Needs Assessment")
- WP2–WP(N-2): content/thematic work packages in logical sequence
- WP(N-1) (second-to-last): "Dissemination, Communication and Exploitation of Results"
- WP(N) (last): "Project Management and Coordination"

WP DURATION RULES (MANDATORY):
- "Project Management and Coordination" WP MUST span the ENTIRE project duration — from the first month (M1) to the final month.
- "Dissemination, Communication and Exploitation" WP MUST also span the ENTIRE project duration — from M1 to the final month.
- Content/thematic WPs (WP1 to WP(N-2)) should be SEQUENTIAL with partial overlaps. Example for a 36-month project: WP1 covers M1–M10, WP2 covers M6–M18, WP3 covers M14–M26, WP4 covers M22–M34, etc.
- NO content/thematic WP should span the entire project duration.
- Tasks WITHIN each WP must be sequential or staggered — do NOT give all tasks in a WP the same startDate and endDate.

TASK DEPENDENCIES (MANDATORY):
- The very first task of the project (T1.1) has NO dependencies (it is the starting point).
- EVERY OTHER task MUST have at least 1 dependency in its "dependencies" array.
- Each dependency object has: { "predecessorId": "T<wp>.<task>", "type": "FS" | "SS" | "FF" | "SF" }
- FS (Finish-to-Start) is the most common: the successor starts after the predecessor finishes.
- SS (Start-to-Start): both tasks start at the same time.
- FF (Finish-to-Finish): both tasks finish at the same time.
- SF (Start-to-Finish): the successor finishes when the predecessor starts (rare).
- CROSS-WP dependencies MUST exist: e.g., T2.1 depends on T1.3 (FS), T3.1 depends on T2.2 (FS).
- Within a WP, sequential tasks should have FS dependencies: T1.2 depends on T1.1, T1.3 depends on T1.2, etc.
- Parallel tasks within a WP can use SS dependencies.

DELIVERABLE FIELDS (MANDATORY):
- Each deliverable MUST have THREE separate fields:
  1. "title" — a concise noun phrase (3–10 words), e.g., "Stakeholder Engagement Report"
  2. "description" — 2–4 substantive sentences explaining what the deliverable contains, its format, scope, and intended audience. Do NOT just repeat the title.
  3. "indicator" — a SPECIFIC and MEASURABLE verification criterion. Include: quantity/format (e.g., "1 PDF report"), scope (e.g., "covering all 12 partner regions"), and verification method (e.g., "reviewed and approved by the Steering Committee").
- WRONG indicator: "Report delivered" (too vague)
- RIGHT indicator: "1 PDF report (min. 40 pages) covering baseline data from 12 regions, peer-reviewed by 2 external experts and approved by the Steering Committee by M10"

TASKS:
- Each WP must have 2–5 tasks.
- Each task: id, title, description (2–4 sentences), startDate, endDate, dependencies.
- Task descriptions should explain methodology, not just restate the title.

MILESTONES:
- Each WP must have at least 1 milestone.
- Milestone date in YYYY-MM-DD format. Place at logical completion points.

No markdown. Write like an experienced EU project consultant.`,
    si: `Generiraj med 6 in 10 delovnih sklopov z nalogami, mejniki in dosežki.

ABSOLUTNA ČASOVNA OMEJITEV PROJEKTA:
- Datum ZAČETKA projekta: {{projectStart}}
- Datum KONCA projekta: {{projectEnd}} (skupno {{projectDurationMonths}} mesecev)
- VSAK startDate naloge MORA biti ≥ {{projectStart}}
- VSAK endDate naloge MORA biti ≤ {{projectEnd}}
- VSAK datum mejnika MORA biti ≤ {{projectEnd}}
- VSAK DS se mora začeti na ali po {{projectStart}} in končati na ali pred {{projectEnd}}
- NOBENA aktivnost, naloga, mejnik ali dosežek NE SME biti načrtovan PO {{projectEnd}}
- Naloge diseminacije, eksploatacije in poročanja MORAJO biti zaključene do {{projectEnd}}
- Zaključno projektno poročilo in zaključni mejnik MORATA biti na ali pred {{projectEnd}}
- To je NEIZPODBOJNO — vsak datum izven tega obsega je USODNA NAPAKA

PRAVILA ZA FORMAT NASLOVOV:
- Naslovi DS: samostalniška zveza (npr. "Izhodiščna analiza in kartiranje deležnikov")
- Naslovi nalog: samostalniška zveza (npr. "Razvoj učnega kurikula")
- Opisi mejnikov: samostalniška zveza (npr. "Zaključek pilotne faze")
- Naslovi dosežkov: samostalniška zveza (npr. "Poročilo o vključevanju deležnikov")
- NE uporabljaj nedoločnikov za nobeno od teh.

VRSTNI RED DELOVNIH SKLOPOV (OBVEZNO):
- DS1: temeljni/analitični (npr. "Izhodiščna analiza in ocena potreb")
- DS2–DS(N-2): vsebinski/tematski delovni sklopi v logičnem zaporedju
- DS(N-1) (predzadnji): "Diseminacija, komunikacija in izkoriščanje rezultatov"
- DS(N) (zadnji): "Upravljanje in koordinacija projekta"

PRAVILA ZA TRAJANJE DS (OBVEZNO):
- DS "Upravljanje in koordinacija projekta" MORA trajati CELOTNO obdobje projekta — od prvega meseca (M1) do zadnjega meseca.
- DS "Diseminacija, komunikacija in izkoriščanje rezultatov" MORA prav tako trajati CELOTNO obdobje projekta — od M1 do zadnjega meseca.
- Vsebinski/tematski DS (DS1 do DS(N-2)) morajo biti ZAPOREDNI z delnim prekrivanjem. Primer za 36-mesečni projekt: DS1 pokriva M1–M10, DS2 pokriva M6–M18, DS3 pokriva M14–M26, DS4 pokriva M22–M34, itd.
- NOBEN vsebinski/tematski DS ne sme trajati celotno obdobje projekta.
- Naloge ZNOTRAJ vsakega DS morajo biti zaporedne ali zamaknjene — NE dajaj vsem nalogam v DS enakega startDate in endDate.

SOODVISNOSTI NALOG (OBVEZNO):
- Prva naloga projekta (T1.1) NIMA odvisnosti (je izhodišče).
- VSAKA DRUGA naloga MORA imeti vsaj 1 odvisnost v svojem polju "dependencies".
- Vsak objekt odvisnosti ima: { "predecessorId": "T<ds>.<naloga>", "type": "FS" | "SS" | "FF" | "SF" }
- FS (konec-začetek) je najpogostejši: naslednica se začne po zaključku predhodnice.
- SS (začetek-začetek): obe nalogi se začneta istočasno.
- FF (konec-konec): obe nalogi se zaključita istočasno.
- SF (začetek-konec): naslednica se zaključi, ko se predhodnica začne (redko).
- MEDDELOVNE odvisnosti MORAJO obstajati: npr. T2.1 je odvisna od T1.3 (FS), T3.1 od T2.2 (FS).
- Znotraj DS imajo zaporedne naloge FS odvisnosti: T1.2 je odvisna od T1.1, T1.3 od T1.2 itd.
- Vzporedne naloge znotraj DS lahko uporabijo SS odvisnosti.

POLJA DOSEŽKOV (OBVEZNO):
- Vsak dosežek MORA imeti TRI ločena polja:
  1. "title" — jedrnata samostalniška zveza (3–10 besed), npr. "Poročilo o vključevanju deležnikov"
  2. "description" — 2–4 vsebinski stavki, ki pojasnjujejo kaj dosežek vsebuje, njegov format, obseg in ciljno publiko. NE ponavljaj samo naslova.
  3. "indicator" — SPECIFIČEN in MERLJIV kriterij preverjanja. Vključi: količino/format (npr. "1 PDF poročilo"), obseg (npr. "ki pokriva vseh 12 partnerskih regij") in način preverjanja (npr. "pregledano in potrjeno s strani Usmerjevalnega odbora").
- NAPAČEN kazalnik: "Poročilo oddano" (preveč nejasno)
- PRAVILEN kazalnik: "1 PDF poročilo (min. 40 strani) z izhodiščnimi podatki iz 12 regij, recenzirano s strani 2 zunanjih strokovnjakov in potrjeno s strani Usmerjevalnega odbora do M10"

NALOGE:
- Vsak DS mora imeti 2–5 nalog.
- Vsaka naloga: id, title, description (2–4 stavki), startDate, endDate, dependencies.
- Opisi nalog morajo pojasniti metodologijo, ne le ponoviti naslova.

MEJNIKI:
- Vsak DS mora imeti vsaj 1 mejnik.
- Datum mejnika v formatu YYYY-MM-DD. Postavi na logične zaključne točke.

Brez markdown. Piši kot izkušen EU projektni svetovalec.`
  },

  outputs: {
    en: `Generate 5–8 concrete project outputs (direct deliverables).
Each output: title (result-oriented noun phrase), description (3–5 sentences, mentions specific WP link), measurable indicator.
Title MUST be a result-oriented noun phrase: "Digital Competence Curriculum" NOT "Develop a curriculum".
No markdown. Vary sentence structures.`,
    si: `Generiraj 5–8 konkretnih neposrednih rezultatov projekta (outputi).
Vsak rezultat: naslov (rezultatsko usmerjena samostalniška zveza), opis (3–5 stavkov, navede povezavo z DS), merljiv kazalnik.
Naslov MORA biti rezultatsko usmerjena samostalniška zveza: "Kurikul digitalnih kompetenc" NE "Razviti kurikul".
Brez markdown. Variraj stavčne strukture.`
  },
  outcomes: {
    en: `Generate 4–6 medium-term project outcomes (changes resulting from outputs).
Each outcome: title (result-oriented noun phrase), description (3–5 sentences), indicator with target value and timeline.
Title MUST be result-oriented noun phrase: "Increased Digital Literacy Among Rural Youth" NOT "Increase digital literacy".
No markdown. Vary sentence structures.`,
    si: `Generiraj 4–6 srednjeročnih rezultatov projekta (outcomes).
Vsak rezultat: naslov (rezultatsko usmerjena samostalniška zveza), opis (3–5 stavkov), kazalnik s ciljno vrednostjo in časovnico.
Naslov MORA biti rezultatsko usmerjena samostalniška zveza: "Povečana digitalna pismenost mladih na podeželju" NE "Povečati digitalno pismenost".
Brez markdown. Variraj stavčne strukture.`
  },
  impacts: {
    en: `Generate 3–5 long-term strategic impacts aligned with EU policy objectives.
Each impact: title (result-oriented noun phrase), description (3–5 sentences linking to EU goals), indicator with baseline and target.
Title MUST be result-oriented noun phrase: "Enhanced Cross-Border Innovation Ecosystem" NOT "Enhance the ecosystem".
No markdown. Vary sentence structures.`,
    si: `Generiraj 3–5 dolgoročnih strateških učinkov, usklajenih s cilji politik EU.
Vsak učinek: naslov (rezultatsko usmerjena samostalniška zveza), opis (3–5 stavkov s povezavo na EU cilje), kazalnik z izhodiščem in ciljno vrednostjo.
Naslov MORA biti rezultatsko usmerjena samostalniška zveza: "Okrepljen čezmejni inovacijski ekosistem" NE "Okrepiti ekosistem".
Brez markdown. Variraj stavčne strukture.`
  },
  risks: {
    en: `Generate 8–12 project risks across ALL FOUR categories:
- technical (technology failures, integration issues)
- social (stakeholder resistance, low engagement)
- economic (budget overruns, market changes)
- environmental (climate events, regulatory changes, environmental compliance)

Each risk: id, category (lowercase: technical/social/economic/environmental), title, description (2–4 sentences), likelihood (low/medium/high), impact (low/medium/high), mitigation strategy (2–4 sentences).
Use NOUN PHRASES for titles: "Insufficient Partner Engagement" NOT "Partners might not engage".
No markdown. Vary sentence structures.`,
    si: `Generiraj 8–12 projektnih tveganj v VSEH ŠTIRIH kategorijah:
- technical (tehnološke napake, integracijske težave)
- social (odpor deležnikov, nizka udeležba)
- economic (prekoračitev proračuna, tržne spremembe)
- environmental (podnebni dogodki, regulativne spremembe, okoljska skladnost)

Vsako tveganje: id, category (male črke: technical/social/economic/environmental), naslov, opis (2–4 stavki), likelihood (low/medium/high), impact (low/medium/high), strategija blaženja (2–4 stavki).
Naslove napiši kot SAMOSTALNIŠKE ZVEZE: "Nezadostna vključenost partnerjev" NE "Partnerji se morda ne bodo vključili".
Brez markdown. Variraj stavčne strukture.`
  },
  kers: {
    en: `Generate 4–6 Key Exploitable Results (KERs).
Each KER: id, title (specific noun phrase — the product/asset name), description (3–5 sentences about what it is, who will use it, and how it differs from existing solutions), exploitation strategy (3–5 sentences detailing commercialisation, licensing, open-access, or policy integration plan).
Title MUST be a specific asset/product name: "GreenGrid Decision Support Tool" NOT "Development of a tool".
No markdown. Vary sentence structures.`,
    si: `Generiraj 4–6 ključnih rezultatov za izkoriščanje (KER).
Vsak KER: id, naslov (specifična samostalniška zveza — ime produkta/sredstva), opis (3–5 stavkov o tem, kaj je, kdo bo to uporabljal in kako se razlikuje od obstoječih rešitev), strategija izkoriščanja (3–5 stavkov s podrobnostmi o komercializaciji, licenciranju, odprtem dostopu ali načrtu integracije v politike).
Naslov MORA biti specifično ime sredstva/produkta: "Orodje za podporo odločanju GreenGrid" NE "Razvoj orodja".
Brez markdown. Variraj stavčne strukture.`
  }
};

// ───────────────────────────────────────────────────────────────
// CHAPTERS (long-form rules for each section)
// ───────────────────────────────────────────────────────────────

export const CHAPTERS: Record<string, string> = {
  chapter1_problemAnalysis: `CHAPTER 1 — PROBLEM ANALYSIS

The Problem Analysis is the foundation of the entire intervention logic.
It must demonstrate a rigorous understanding of the problem the project addresses.

STRUCTURE:
1. Core Problem — a clear, concise statement of the central problem with at least one quantitative indicator.
2. Causes — at least 4 distinct root and proximate causes, each with a citation.
3. Consequences — at least 4 distinct consequences, at least one linking to EU-level policy.

QUALITY:
- Every cause and consequence must have a title AND a detailed description (3–5 sentences).
- Descriptions must include evidence-based arguments with inline citations.
- Causes must be logically ordered: structural/root causes first, proximate causes second.
- Consequences must show the chain: local → regional → national → EU impact.`,

  chapter2_projectIdea: `CHAPTER 2 — PROJECT IDEA

The Project Idea translates the problem analysis into a proposed intervention.

STRUCTURE:
1. Main Aim — ONE comprehensive sentence starting with an infinitive verb.
2. State of the Art — references to at least 3 REAL existing projects/studies.
3. Proposed Solution — begins with 5–8 sentence overview paragraph, then phases.
4. Readiness Levels — TRL, SRL, ORL, LRL with justifications.
5. EU Policies — at least 3 relevant EU policies with alignment descriptions.
6. Project Acronym — a short, memorable code (3–8 uppercase letters) derived from the project title keywords.

TITLE RULES:
- Project title: noun phrase, 30–200 characters, no acronym, no verb.
- Project acronym: 3–8 uppercase letters, pronounceable or recognisable, placed ONLY in projectAcronym field.`,

  chapter3_4_objectives: `CHAPTERS 3–4 — OBJECTIVES

General Objectives (3–5):
- Each title uses INFINITIVE VERB: "Strengthen…", "Develop…", "Enhance…"
- Each description: 3–5 sentences linking to broader EU goals.

Specific Objectives (≥5):
- S.M.A.R.T. format: Specific, Measurable, Achievable, Relevant, Time-bound.
- Each title uses INFINITIVE VERB.
- Each must have a measurable KPI indicator.`,

  chapter5_activities: `CHAPTER 5 — ACTIVITIES, MANAGEMENT AND RISKS

SECTION 5A — PROJECT MANAGEMENT (projectManagement):
The projectManagement object has TWO parts:
1. description field — detailed narrative (≥500 words) covering management structure,
   decision-making, quality assurance, risk management, communication, conflict resolution,
   data management. Written as prose paragraphs separated by \\n\\n. Each topic gets its own paragraph
   with a plain-text header on the first line. Structure fields contain ONLY short labels for the organigram.
2. structure fields — short role labels (5–8 words max) for organigram chart display.

SECTION 5B — WORK PLAN (activities):
Between 6 and 10 work packages (WPs):
- WP1: foundational/analytical (NOT project management)
- WP2 to WP(N-2): content/thematic WPs in logical sequence
- WP(N-1): Dissemination, Communication and Exploitation of Results — spans ENTIRE project (M1–final month)
- WP(N): Project Management and Coordination — spans ENTIRE project (M1–final month)

Content/thematic WPs are sequential with overlaps — none spans the entire project.
Tasks within each WP are sequential or staggered, not all identical dates.

Each WP: id (WP1, WP2…), title (noun phrase), tasks (2–5 each), milestones (≥1), deliverables (≥1).
Each task: id (T1.1, T1.2…), title, description, startDate, endDate, dependencies.
Each deliverable: id, title (noun phrase), description (2–4 sentences), indicator (specific, measurable).
All task dates in YYYY-MM-DD.

Task dependencies are MANDATORY:
- T1.1 has no dependencies.
- Every other task has ≥1 dependency with predecessorId and type (FS/SS/FF/SF).
- Cross-WP dependencies must exist.

TITLE FORMAT:
- WP, task, milestone, deliverable titles: NOUN PHRASES.
- NOT infinitive verbs.

SECTION 5C — RISK REGISTER (risks):
8–12 risks across categories: technical, social, economic, environmental.
Each: id, category (lowercase), title, description, likelihood, impact, mitigation.`,

  chapter6_results: `CHAPTER 6 — EXPECTED RESULTS AND KEY EXPLOITABLE RESULTS

SECTION 6A — OUTPUTS (5–8 direct deliverables)
Title format: result-oriented noun phrase.

SECTION 6B — OUTCOMES (4–6 medium-term changes)
Title format: result-oriented noun phrase.

SECTION 6C — IMPACTS (3–5 long-term strategic changes)
Title format: result-oriented noun phrase.
Must link to EU policy objectives.

SECTION 6D — KEY EXPLOITABLE RESULTS (4–6 KERs)
Title format: specific asset/product name (noun phrase).
Each includes exploitation strategy.`
};

// ───────────────────────────────────────────────────────────────
// GLOBAL RULES
// ───────────────────────────────────────────────────────────────

export const GLOBAL_RULES = `
1. All content must be directly relevant to the specific project context.
2. Every claim must be evidence-based with verifiable citations.
3. No markdown formatting (**, ##, \`) in any output text.
4. Write like an experienced human EU project consultant.
5. Vary sentence structures and lengths — no AI-pattern repetition.
6. No banned AI phrases (see HUMANIZATION RULES).
7. If a data point is uncertain, use "[Insert verified data: ...]".
8. Dates must be in YYYY-MM-DD format.
9. All content must support the intervention logic chain: Problem → Objectives → Activities → Results.
10. Quantify wherever possible — no vague statements.
`;

// ───────────────────────────────────────────────────────────────
// FIELD-SPECIFIC RULES
// ═══════════════════════════════════════════════════════════════
// v4.5 FIX [3A]: Added projectAcronym field rule
// ═══════════════════════════════════════════════════════════════
// ───────────────────────────────────────────────────────────────

export const FIELD_RULES: Record<string, Record<string, string>> = {
  title: {
    en: 'Generate a concise, professional title. Follow the title format rules for this section type.',
    si: 'Generiraj jedrnat, strokoven naslov. Upoštevaj pravila za format naslova za ta tip razdelka.'
  },
  description: {
    en: 'Generate a detailed professional description. Minimum 3 substantive sentences. Include evidence and citations where appropriate. No markdown.',
    si: 'Generiraj podroben strokoven opis. Najmanj 3 vsebinski stavki. Vključi dokaze in citate, kjer je primerno. Brez markdown.'
  },
  indicator: {
    en: 'Generate a specific, measurable indicator. Include target value, timeline, and verification method. Example: "23% increase in digital literacy scores among 500 participants by M24, measured via pre/post assessment."',
    si: 'Generiraj specifičen, merljiv kazalnik. Vključi ciljno vrednost, časovnico in način preverjanja. Primer: "23-odstotno povečanje digitalnih kompetenc med 500 udeleženci do M24, merjeno s pred/po ocenjevanjem."'
  },
  mitigation: {
    en: 'Generate a detailed risk mitigation strategy. 2–4 sentences covering preventive measures, contingency plans, responsible parties, and monitoring triggers.',
    si: 'Generiraj podrobno strategijo blaženja tveganja. 2–4 stavki, ki pokrivajo preventivne ukrepe, načrt ukrepanja, odgovorne osebe in sprožilce spremljanja.'
  },
  exploitationStrategy: {
    en: 'Generate a detailed exploitation strategy. 3–5 sentences covering commercialisation pathway, target market, IPR approach, sustainability plan, and scaling potential.',
    si: 'Generiraj podrobno strategijo izkoriščanja. 3–5 stavkov, ki pokrivajo pot komercializacije, ciljni trg, pristop k intelektualni lastnini, načrt trajnosti in potencial za širjenje.'
  },
  mainAim: {
    en: 'Generate the project main aim as ONE comprehensive sentence starting with an infinitive verb (e.g., "To establish...", "To develop..."). Must capture the project\'s core purpose.',
    si: 'Generiraj glavni cilj projekta kot EN celovit stavek, ki se začne z nedoločnikom (npr. "Vzpostaviti...", "Razviti..."). Mora zajeti bistvo projekta.'
  },
  projectTitle: {
    en: 'Generate a project title following the STRICT PROJECT TITLE RULES: noun phrase, 30–200 characters, no acronym, no verb, no generic AI phrases. Must be a project brand.',
    si: 'Generiraj naziv projekta po STROGIH PRAVILIH ZA NAZIV: imenski izraz, 30–200 znakov, brez akronima, brez glagola, brez generičnih AI fraz. Mora biti blagovna znamka projekta.'
  },
  projectAcronym: {
    en: 'Generate a project acronym: 3–8 uppercase letters derived from the project title keywords. Must be pronounceable or a recognisable abbreviation. Must NOT be a generic word (e.g., PROJECT, EUROPE). Place ONLY in projectAcronym field, never inside projectTitle. Hyphens allowed (e.g., DIGI-CRAFT).',
    si: 'Generiraj projektni akronim: 3–8 velikih črk, izpeljanih iz ključnih besed naziva projekta. Mora biti izgovorljiv ali prepoznavna kratica. NE sme biti generična beseda (npr. PROJEKT, EVROPA). Vstavi SAMO v polje projectAcronym, nikoli v projectTitle. Vezaji dovoljeni (npr. DIGI-CRAFT).'
  }
};

// ───────────────────────────────────────────────────────────────
// SUMMARY RULES (v4.5 – 2026-02-16)
// Executive Summary — EXTRACTION + CONDENSATION engine
// ───────────────────────────────────────────────────────────────

export const SUMMARY_RULES: Record<string, string> = {
  en: `
YOU ARE A CONDENSATION ENGINE — NOT A COPY-PASTE ENGINE.
Your job is to DISTILL the project into a SHORT executive summary.
You must RADICALLY SHORTEN every section — capture only the ESSENCE.

TOTAL MAXIMUM: 800 words. If your output exceeds 800 words, it is REJECTED.

MANDATORY STRUCTURE — exactly 5 sections with ## headings:

## 1. Project Overview
MAXIMUM 80 WORDS. Extract: title, acronym, duration, budget, programme/call (only if they exist in the data). Add 1-2 sentences capturing the core idea. Nothing more.

## 2. Problem & Need
MAXIMUM 120 WORDS. State the core problem in 2-3 sentences. Mention only the 2-3 MOST IMPORTANT causes — do NOT list all causes. Do NOT list all consequences. Capture the ESSENCE, not the detail. No bullet points.

## 3. Solution & Approach
MAXIMUM 150 WORDS. Describe the solution concept in 2-3 sentences. List work packages ONLY by name in one sentence (e.g., "The project is structured into 6 work packages covering baseline analysis, agent development, digital twin validation, pilot demonstrations, dissemination, and project management."). Do NOT describe each WP in detail. No bullet points.

## 4. Key Results & Impact
MAXIMUM 200 WORDS. Mention only the 3-4 MOST SIGNIFICANT outputs/deliverables in 1-2 sentences. State 2-3 key measurable outcomes. State 2-3 long-term impacts. Do NOT list every single output, outcome, impact, objective, and KER. RADICALLY SELECT only the most important. No bullet points — write flowing prose.

## 5. EU Added Value & Relevance
MAXIMUM 100 WORDS. Mention EU policy alignment ONLY if the user wrote about it. 2-4 sentences maximum. If no EU relevance content exists in the project, write: "Not yet defined in the project."

STRICT FORMATTING RULES:
- NO bullet points (*, -, •) anywhere in the summary — write ONLY flowing prose paragraphs
- NO bold text (**) anywhere
- NO numbered sub-lists within sections
- Each section is 1-2 short paragraphs of prose, nothing more
- Use ## headings ONLY for the 5 section titles
- Preserve the user's terminology where possible but CONDENSE drastically
- Do NOT copy-paste entire paragraphs from the project — REPHRASE and SHORTEN
- If data for a section does not exist, write: "Not yet defined in the project."
- NEVER add content that is not in the project data
- NO preamble before section 1, NO closing after section 5
`,

  si: `
SI MEHANIZEM ZA KONDENZACIJO — NE ZA KOPIRANJE.
Tvoja naloga je DESTILIRATI projekt v KRATEK izvršni povzetek.
Vsako sekcijo RADIKALNO SKRAJŠAJ — zajemi samo BISTVO.

SKUPNI MAKSIMUM: 800 besed. Če tvoj izhod presega 800 besed, je ZAVRNJEN.

OBVEZNA STRUKTURA — natanko 5 sekcij z ## naslovi:

## 1. Pregled projekta
NAJVEČ 80 BESED. Izvleci: naslov, akronim, trajanje, proračun, program/razpis (samo če obstajajo v podatkih). Dodaj 1-2 stavka, ki zajameta bistvo ideje. Nič več.

## 2. Problem in potreba
NAJVEČ 120 BESED. Navedi osrednji problem v 2-3 stavkih. Omeni samo 2-3 NAJPOMEMBNEJŠE vzroke — NE naštevaj vseh vzrokov. NE naštevaj vseh posledic. Zajemi BISTVO, ne podrobnosti. Brez alinej.

## 3. Rešitev in pristop
NAJVEČ 150 BESED. Opiši koncept rešitve v 2-3 stavkih. Naštej delovne pakete SAMO po imenu v enem stavku (npr. "Projekt je strukturiran v 6 delovnih paketov, ki pokrivajo izhodiščno analizo, razvoj agentov, validacijo digitalnega dvojčka, pilotne demonstracije, diseminacijo in upravljanje projekta."). NE opisuj vsakega DS podrobno. Brez alinej.

## 4. Ključni rezultati in učinek
NAJVEČ 200 BESED. Omeni samo 3-4 NAJPOMEMBNEJŠE outpute/dosežke v 1-2 stavkih. Navedi 2-3 ključne merljive izide. Navedi 2-3 dolgoročne učinke. NE naštevaj vsakega posameznega outputa, izida, učinka, cilja in KER-ja. RADIKALNO IZBERI le najpomembnejše. Brez alinej — piši tekoče odstavke proze.

## 5. Dodana vrednost EU in relevantnost
NAJVEČ 100 BESED. Omeni usklajenost s politikami EU SAMO, če je uporabnik pisal o tem. 2-4 stavki, največ. Če v projektu ni vsebine o relevantnosti EU, napiši: "V projektu še ni opredeljeno."

STROGA PRAVILA OBLIKOVANJA:
- BREZ alinej (*, -, •) kjerkoli v povzetku — piši SAMO tekoče odstavke proze
- BREZ krepkega tiska (**) kjerkoli
- BREZ oštevilčenih pod-seznamov znotraj sekcij
- Vsaka sekcija je 1-2 kratka odstavka proze, nič več
- Uporabi ## naslove SAMO za 5 naslovov sekcij
- Ohrani uporabnikovo terminologijo, kjer je mogoče, ampak DRASTIČNO KONDENZIRAJ
- NE kopiraj celih odstavkov iz projekta — PREOBLIKUJ in SKRAJŠAJ
- Če podatki za sekcijo ne obstajajo, napiši: "V projektu še ni opredeljeno."
- NIKOLI ne dodajaj vsebine, ki ni v projektnih podatkih
- BREZ uvoda pred sekcijo 1, BREZ zaključka po sekciji 5
`
};


// ───────────────────────────────────────────────────────────────
// TRANSLATION RULES
// ───────────────────────────────────────────────────────────────

export const TRANSLATION_RULES: Record<string, string[]> = {
  en: [
    'Translate all text values to British English',
    'Keep JSON structure identical — do not add/remove keys',
    'Maintain professional EU project terminology',
    'Keep citations in original format (Author, Year)',
    'Do not translate proper nouns, organization names, or acronyms',
    'Preserve all dates in YYYY-MM-DD format',
    'Translate technical terms accurately with domain-specific vocabulary',
  ],
  si: [
    'Prevedi vse besedilne vrednosti v slovenščino',
    'Ohrani strukturo JSON identično — ne dodajaj/odstranjuj ključev',
    'Ohranjaj strokovno EU projektno terminologijo',
    'Ohrani citate v izvirnem formatu (Avtor, Leto)',
    'Ne prevajaj lastnih imen, imen organizacij ali akronimov',
    'Ohrani vse datume v formatu YYYY-MM-DD',
    'Prevajaj strokovne izraze natančno z domensko specifičnim besediščem',
  ]
};

// ───────────────────────────────────────────────────────────────
// EXPORTED ACCESSOR FUNCTIONS
// ───────────────────────────────────────────────────────────────

export const getAppInstructions = (language: 'en' | 'si' = 'en') => ({
  GLOBAL_RULES: getGlobalOverrideSync('GLOBAL_RULES') || GLOBAL_RULES,
  CHAPTERS: (() => {
    const overridden: Record<string, string> = {};
    for (const key of Object.keys(CHAPTERS)) {
      overridden[key] = getGlobalOverrideSync(`CHAPTERS.${key}`) || CHAPTERS[key];
    }
    return overridden;
  })()
});

export const getFieldRule = (fieldName: string, language: 'en' | 'si' = 'en'): string => {
  return getGlobalOverrideSync(`FIELD_RULES.${fieldName}.${language}`) || FIELD_RULES[fieldName]?.[language] || '';
};

export const getTranslationRules = (language: 'en' | 'si' = 'en'): string[] => {
  const override = getGlobalOverrideSync(`TRANSLATION_RULES.${language}`);
  if (override) return override.split('\n').filter((line: string) => line.trim().length > 0);
  return TRANSLATION_RULES[language] || TRANSLATION_RULES.en;
};

export const getSummaryRules = (language: 'en' | 'si' = 'en'): string => {
  return getGlobalOverrideSync(`SUMMARY_RULES.${language}`) || SUMMARY_RULES[language] || SUMMARY_RULES.en;
};

export const getLanguageDirective = (language: 'en' | 'si' = 'en'): string => {
  return getGlobalOverrideSync(`LANGUAGE_DIRECTIVES.${language}`) || LANGUAGE_DIRECTIVES[language] || LANGUAGE_DIRECTIVES.en;
};

export const getLanguageMismatchNotice = (
  detectedLang: 'en' | 'si',
  targetLang: 'en' | 'si'
): string => {
  const langNames: Record<string, string> = { en: 'English', si: 'Slovenian' };
  return LANGUAGE_MISMATCH_TEMPLATE
    .replace(/{{detectedName}}/g, langNames[detectedLang])
    .replace(/{{targetName}}/g, langNames[targetLang]);
};

export const getAcademicRigorRules = (language: 'en' | 'si' = 'en'): string => {
  return getGlobalOverrideSync(`ACADEMIC_RIGOR_RULES.${language}`) || ACADEMIC_RIGOR_RULES[language] || ACADEMIC_RIGOR_RULES.en;
};

export const getHumanizationRules = (language: 'en' | 'si' = 'en'): string => {
  return getGlobalOverrideSync(`HUMANIZATION_RULES.${language}`) || HUMANIZATION_RULES[language] || HUMANIZATION_RULES.en;
};

export const getProjectTitleRules = (language: 'en' | 'si' = 'en'): string => {
  return getGlobalOverrideSync(`PROJECT_TITLE_RULES.${language}`) || PROJECT_TITLE_RULES[language] || PROJECT_TITLE_RULES.en;
};

export const getModeInstruction = (mode: string, language: 'en' | 'si' = 'en'): string => {
  return getGlobalOverrideSync(`MODE_INSTRUCTIONS.${mode}.${language}`) || MODE_INSTRUCTIONS[mode]?.[language] || MODE_INSTRUCTIONS.regenerate[language];
};

export const getQualityGate = (sectionKey: string, language: 'en' | 'si' = 'en'): string => {
  const fullOverride = getGlobalOverrideSync(`QUALITY_GATES.${sectionKey}.${language}`);
  if (fullOverride) return fullOverride;
  const gates = QUALITY_GATES[sectionKey]?.[language] || QUALITY_GATES._default[language];
  const header = language === 'si' ? 'KONTROLNA LISTA KAKOVOSTI' : 'QUALITY CHECKLIST';
  return `═══ ${header} ═══\nBefore returning the JSON, verify ALL of the following:\n- ${gates.join('\n- ')}\n═══════════════════════════════════════════════════════════════════`;
};

export const getSectionTaskInstruction = (
  sectionKey: string,
  language: 'en' | 'si' = 'en',
  placeholders: Record<string, string> = {}
): string => {
  let template = getGlobalOverrideSync(`SECTION_TASK_INSTRUCTIONS.${sectionKey}.${language}`) || SECTION_TASK_INSTRUCTIONS[sectionKey]?.[language] || '';
  for (const [key, value] of Object.entries(placeholders)) {
    template = template.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return template;
};
// ═══════════════════════════════════════════════════════════════════
// SETTINGS MODAL SUPPORT — v4.5
// Exports consumed by SettingsModal.tsx (Instructions editor tab)
// Storage via storageService.getCustomInstructions / saveCustomInstructions
// ═══════════════════════════════════════════════════════════════════

export const CHAPTER_LABELS: Record<string, string> = {
  chapter1_problemAnalysis: 'Chapter 1 — Problem Analysis',
  chapter2_projectIdea: 'Chapter 2 — Project Idea',
  chapter3_4_objectives: 'Chapters 3–4 — Objectives',
  chapter5_activities: 'Chapter 5 — Activities, Management & Risks',
  chapter6_results: 'Chapter 6 — Results & KERs',
};

export const FIELD_RULE_LABELS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  indicator: 'Indicator',
  mitigation: 'Mitigation Strategy',
  exploitationStrategy: 'Exploitation Strategy',
  mainAim: 'Main Aim',
  projectTitle: 'Project Title',
  projectAcronym: 'Project Acronym',
};

const INSTRUCTIONS_VERSION = '4.5';

function buildDefaultInstructions() {
  return {
    version: INSTRUCTIONS_VERSION,
    GLOBAL_RULES: GLOBAL_RULES,
    CHAPTERS: { ...CHAPTERS },
    FIELD_RULES: Object.fromEntries(
      Object.entries(FIELD_RULES).map(([key, val]) => [key, val.en])
    ),
    TRANSLATION_RULES: TRANSLATION_RULES.en.join('\n'),
    SUMMARY_RULES: SUMMARY_RULES.en,
  };
}

export function getDefaultInstructions() {
  return buildDefaultInstructions();
}

export function getFullInstructions() {
  try {
    const saved = storageService.getCustomInstructions();
    if (saved) {
      const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
      if (parsed && parsed.version === INSTRUCTIONS_VERSION) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('[Instructions] Could not load saved instructions, using defaults:', e);
  }
  return buildDefaultInstructions();
}

export async function saveAppInstructions(instructions: any): Promise<void> {
  const toSave = { ...instructions, version: INSTRUCTIONS_VERSION };
  await storageService.saveCustomInstructions(toSave);
}

export async function resetAppInstructions(): Promise<any> {
  const defaults = buildDefaultInstructions();
  await storageService.saveCustomInstructions(defaults);
  return defaults;
}
// ───────────────────────────────────────────────────────────────
// ★ v4.5 NEW: TEMPORAL INTEGRITY RULE
// ───────────────────────────────────────────────────────────────

export const TEMPORAL_INTEGRITY_RULE: Record<string, string> = {
  en: `═══ TEMPORAL INTEGRITY RULE (SUPREME — OVERRIDES ALL OTHER SCHEDULING) ═══

★★★ THIS IS THE #1 MOST IMPORTANT RULE IN THE ENTIRE PROMPT. ★★★
ANY DATE VIOLATION MAKES THE ENTIRE OUTPUT INVALID AND UNUSABLE.

THE IRON LAW:
The Project Management WP (LAST WP) = the MAXIMUM TEMPORAL ENVELOPE.
NOTHING in the entire project may have a date outside this envelope.

PROJECT BOUNDARIES (ABSOLUTE, NON-NEGOTIABLE):
  Start: {{projectStart}}
  End:   {{projectEnd}}
  Duration: {{projectDurationMonths}} months exactly

FORMAL CONSTRAINTS:
1. PM WP (last WP): starts EXACTLY {{projectStart}}, ends EXACTLY {{projectEnd}}.
2. Dissemination WP (second-to-last): starts EXACTLY {{projectStart}}, ends EXACTLY {{projectEnd}}.
   - Dissemination WP MUST NOT extend even 1 day beyond PM WP.
   - Both WPs end on the SAME date: {{projectEnd}}.
3. ALL tasks across ALL WPs: startDate ≥ {{projectStart}} AND endDate ≤ {{projectEnd}}.
4. ALL milestones: date ≥ {{projectStart}} AND date ≤ {{projectEnd}}.
5. Content/technical WPs: each covers only a PHASE, NONE spans the full duration.

COMMON AI MISTAKES — YOU MUST AVOID THESE:
✗ Dissemination WP ending 1–3 months AFTER PM WP → WRONG. They end SAME day.
✗ "Final report" task scheduled after {{projectEnd}} → WRONG. Must be ON or BEFORE.
✗ Exploitation tasks extending beyond project → WRONG. All within envelope.
✗ 28-month schedule for 24-month project → WRONG. Count precisely.
✗ Last task of Dissemination ending later than last task of PM → WRONG. NEVER.

SELF-CHECK (MANDATORY before returning JSON):
For EVERY task: is endDate ≤ {{projectEnd}}? If NO → set it to {{projectEnd}} or earlier.
For EVERY milestone: is date ≤ {{projectEnd}}? If NO → set it to {{projectEnd}} or earlier.
Does PM WP last task end exactly on {{projectEnd}}? Must be YES.
Does Dissemination last task end ≤ {{projectEnd}}? Must be YES.

VIOLATION OF ANY OF THE ABOVE = ENTIRE JSON IS REJECTED.
═══════════════════════════════════════════════════════════════════`,

  si: `═══ PRAVILO ČASOVNE CELOVITOSTI (VRHOVNI ZAKON — PREGLASI VSE DRUGO) ═══

★★★ TO JE NAJPOMEMBNEJŠE PRAVILO V CELOTNEM NAVODILU. ★★★
VSAKA KRŠITEV DATUMA NAREDI CELOTEN IZHOD NEVELJAVEN IN NEUPORABEN.

ŽELEZNI ZAKON:
DS Upravljanja projekta (ZADNJI DS) = NAJVEČJI ČASOVNI OKVIR.
NIČ v celotnem projektu ne sme imeti datuma izven tega okvira.

MEJE PROJEKTA (ABSOLUTNE, NEPRELOMNE):
  Začetek: {{projectStart}}
  Konec:   {{projectEnd}}
  Trajanje: natančno {{projectDurationMonths}} mesecev

FORMALNE OMEJITVE:
1. DS upravljanja (zadnji DS): začne se NATANČNO {{projectStart}}, konča NATANČNO {{projectEnd}}.
2. DS diseminacije (predzadnji): začne se NATANČNO {{projectStart}}, konča NATANČNO {{projectEnd}}.
   - DS diseminacije NE SME trajati niti 1 dan dlje od DS upravljanja.
   - Oba DS se končata na ISTI datum: {{projectEnd}}.
3. VSE naloge v VSEH DS: startDate ≥ {{projectStart}} IN endDate ≤ {{projectEnd}}.
4. VSI mejniki: date ≥ {{projectStart}} IN date ≤ {{projectEnd}}.
5. Vsebinski/tehnični DS: vsak pokriva le FAZO, NOBEN ne traja celotno trajanje.

POGOSTE NAPAKE AI — TEM SE MORAŠ IZOGNITI:
✗ DS diseminacije se konča 1–3 mesece PO DS upravljanja → NAPAČNO. Končata se ISTI dan.
✗ Naloga "Zaključno poročilo" načrtovana po {{projectEnd}} → NAPAČNO. Mora biti NA ali PRED.
✗ Naloge eksploatacije presegajo projekt → NAPAČNO. Vse znotraj okvira.
✗ 28-mesečni urnik za 24-mesečni projekt → NAPAČNO. Natančno preštej.
✗ Zadnja naloga diseminacije se konča pozneje kot zadnja naloga upravljanja → NAPAČNO. NIKOLI.

SAMOPREVERJANJE (OBVEZNO pred vrnitvijo JSON):
Za VSAKO nalogo: ali je endDate ≤ {{projectEnd}}? Če NE → nastavi na {{projectEnd}} ali prej.
Za VSAK mejnik: ali je date ≤ {{projectEnd}}? Če NE → nastavi na {{projectEnd}} ali prej.
Ali se zadnja naloga DS upravljanja konča natančno na {{projectEnd}}? Mora biti DA.
Ali se zadnja naloga DS diseminacije konča ≤ {{projectEnd}}? Mora biti DA.

KRŠITEV KATEREGAKOLI ZGORNJEGA = CELOTEN JSON JE ZAVRNJEN.
═══════════════════════════════════════════════════════════════════`
};
// ───────────────────────────────────────────────────────────────
// OPENROUTER SYSTEM PROMPT
// ───────────────────────────────────────────────────────────────

export const OPENROUTER_SYSTEM_PROMPT = `You are a professional EU project proposal writing assistant with deep expertise in EU funding programmes (Horizon Europe, Interreg, Erasmus+, LIFE, Digital Europe, etc.).

RESPONSE FORMAT RULES:
1. You MUST respond with valid JSON only.
2. No markdown, no code fences, no explanations — just the raw JSON object or array.
3. Do NOT wrap your response in \`\`\`json ... \`\`\` or any other formatting.
4. The JSON must be parseable by JSON.parse() without any preprocessing.
5. All string values must be properly escaped (no unescaped newlines, quotes, or backslashes).
6. Follow the exact schema/structure specified in the user prompt.`;
