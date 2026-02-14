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
// v3.5.3 — 2026-02-14 — CHANGES:
//   1. getContext() includes sections when EITHER title OR description exists
//   2. generateFieldContent() injects sibling field values into prompt
//   3. Strong bilingual language directive in every prompt
//   4. New 'enhance' mode for professional deepening of existing content
//   5. Quality Enforcement block at the end of every section prompt
//   6. Strengthened section-specific task instructions with explicit
//      citation/depth requirements
//   7. INPUT LANGUAGE DETECTION — detects mismatch between UI language
//      and actual text language, warns in prompt
//   8. ACADEMIC RIGOR RULES — mandatory anti-hallucination block
//   9. stripMarkdown() post-processor removes ** ## ` from all output
//  10. proposedSolution task instruction requires introductory paragraph
//  11. Safe handling of GLOBAL_RULES as string or array
//  12. Safe handling of translationRules/summaryRules as string or array
//  13. HUMANIZATION RULES — anti-AI-fingerprint, sentence variation,
//      banned phrases, concrete specificity, active voice
//  14. PROJECT TITLE RULES — specific rules for generating project names
//      (30–200 chars, noun phrase, no acronym, no full sentences)
//  15. sanitizeProjectTitle() — post-processing to enforce length limits
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

// ─── INPUT LANGUAGE DETECTION (v3.4) ─────────────────────────────

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

  const detectedName = detectedLang === 'si' ? 'Slovenian' : 'English';
  const targetName = uiLanguage === 'si' ? 'Slovenian' : 'English';

  return `═══ INPUT LANGUAGE NOTICE ═══
The user's existing content appears to be written in ${detectedName},
but the current application language is set to ${targetName}.
INSTRUCTIONS:
1. UNDERSTAND and PRESERVE the semantic meaning of the user's input regardless of its language.
2. Generate ALL new content in ${targetName} as required by the Language Directive.
3. If enhancing existing content, translate it into ${targetName} while improving it.
4. Do NOT discard or ignore the user's input just because it is in a different language.
5. The user's input defines the TOPIC — always stay on that topic.
═══════════════════════════════════════════════════════════════════`;
};

// ─── ACADEMIC RIGOR RULES (v3.4) ────────────────────────────────

const getAcademicRigorRules = (language: 'en' | 'si'): string => {
  if (language === 'si') {
    return `═══ OBVEZNA PRAVILA AKADEMSKE STROGOSTI IN CITIRANJA ═══
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
═══════════════════════════════════════════════════════════════════`;
  }

  return `═══ MANDATORY ACADEMIC RIGOR & CITATION RULES ═══
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
═══════════════════════════════════════════════════════════════════`;
};

// ─── HUMANIZATION RULES (v3.5.2) ────────────────────────────────

const getHumanizationRules = (language: 'en' | 'si'): string => {
  if (language === 'si') {
    return `═══ PRAVILA ZA HUMANIZACIJO BESEDILA (OBVEZNO) ═══
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
═══════════════════════════════════════════════════════════════════`;
  }

  return `═══ HUMANIZATION RULES (MANDATORY) ═══
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
═══════════════════════════════════════════════════════════════════`;
};

// ─── PROJECT TITLE RULES (v3.5.3 — NEW) ─────────────────────────
// Specific rules for generating the project name (projectTitle field).
// The acronym is generated separately — this is ONLY the full name.

const getProjectTitleRules = (language: 'en' | 'si'): string => {
  if (language === 'si') {
    return `═══ STROGA PRAVILA ZA NAZIV PROJEKTA (projectTitle) ═══
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
═══════════════════════════════════════════════════════════════════`;
  }

  return `═══ STRICT RULES FOR PROJECT TITLE (projectTitle) ═══
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
═══════════════════════════════════════════════════════════════════`;
};

// ─── SANITIZE PROJECT TITLE (v3.5.3 — NEW) ──────────────────────
// Post-processing to enforce title constraints after AI generation.

const sanitizeProjectTitle = (title: string): string => {
  if (!title || typeof title !== 'string') return title;

  let clean = title.trim();

  // Remove markdown
  clean = clean
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1');

  // Remove surrounding quotes
  clean = clean.replace(/^["'«»„""]|["'«»"""]$/g, '').trim();

  // Remove leading "Project Title:" or "Naziv projekta:" prefix if AI added it
  clean = clean.replace(/^(Project\s*Title|Naziv\s*projekta)\s*[:–—-]\s*/i, '').trim();

  // Remove acronym prefix if AI added it despite instructions (e.g., "ACRONYM – Title")
  // Pattern: 2-10 uppercase letters followed by separator then the real title
  const acronymPattern = /^[A-ZČŠŽ]{2,10}\s*[–—:-]\s*/;
  if (acronymPattern.test(clean)) {
    const withoutAcronym = clean.replace(acronymPattern, '').trim();
    // Only remove if remaining text is substantial (>20 chars)
    if (withoutAcronym.length > 20) {
      clean = withoutAcronym;
    }
  }

  // Enforce max 200 characters — cut at last word boundary
  if (clean.length > 200) {
    clean = clean.substring(0, 200).replace(/\s+\S*$/, '').trim();
  }

  return clean;
};

// ─── QUALITY ENFORCEMENT (appended to every section prompt) ──────

const getQualityEnforcement = (sectionKey: string, language: 'en' | 'si'): string => {
  const checks: Record<string, { en: string[]; si: string[] }> = {
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
    projectIdea: {
      en: [
        'projectTitle is a concise noun phrase (30–200 chars), NO acronym, NO full sentence',
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
    _default: {
      en: [
        'Every description has ≥3 substantive sentences',
        'All titles begin with an infinitive verb',
        'No vague filler phrases — be specific and analytical',
        'Content is directly linked to the project context and problem analysis',
        'Any cited source must be real and verifiable',
        'No markdown formatting (no **, no ##, no `) in output text',
        'No banned AI phrases (leverage, synergy, holistic, foster, cutting-edge, etc.)',
        'Sentence lengths vary — no 3+ consecutive sentences of similar length',
      ],
      si: [
        'Vsak opis ima ≥3 vsebinske stavke',
        'Vsi naslovi se začnejo z glagolom v nedoločniku',
        'Brez nejasnih fraz — bodi specifičen in analitičen',
        'Vsebina je neposredno povezana s kontekstom projekta in analizo problemov',
        'Vsak naveden vir mora biti resničen in preverljiv',
        'Brez markdown formatiranja (brez **, brez ##, brez `)',
        'Brez prepovedanih AI fraz (sinergije, holističen, celosten, katalizator itd.)',
        'Dolžine stavkov se razlikujejo — brez 3+ zaporednih stavkov enake dolžine',
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

// ─── STRIP MARKDOWN (v3.5.1 — post-processor) ───────────────────

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

// ─── MAPPINGS ────────────────────────────────────────────────────

const SECTION_TO_CHAPTER: Record<string, string> = {
  problemAnalysis: '1', projectIdea: '2',
  generalObjectives: '3_AND_4', specificObjectives: '3_AND_4',
  projectManagement: '5', activities: '5', risks: '5',
  outputs: '6', outcomes: '6', impacts: '6', kers: '6',
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

// ─── RULES ASSEMBLER ─────────────────────────────────────────────

const getRulesForSection = (sectionKey: string, language: 'en' | 'si'): string => {
  const instructions = getAppInstructions(language);
  const chapterKey = SECTION_TO_CHAPTER[sectionKey];
  if (chapterKey && instructions.CHAPTERS?.[chapterKey]) {
    const rules = instructions.CHAPTERS[chapterKey].RULES || [];
    if (Array.isArray(rules) && rules.length > 0) {
      const header = language === 'si' ? 'STROGA PRAVILA ZA TA RAZDELEK' : 'STRICT RULES FOR THIS SECTION';
      return `\n${header}:\n- ${rules.join('\n- ')}\n`;
    }
  }
  return '';
};

// ─── PROMPT BUILDER (v3.5.3) ─────────────────────────────────────

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

  // v3.5.3: Inject project title rules when generating projectIdea section
  const titleRules = sectionKey === 'projectIdea' ? getProjectTitleRules(language) : '';

  let modeInstruction: string;

  if (mode === 'fill') {
    modeInstruction = language === 'si'
      ? `\nNAČIN: DOPOLNJEVANJE MANJKAJOČEGA.\nObstoječi podatki: ${JSON.stringify(currentSectionData)}\nPRAVILA:\n1. OHRANI vsa obstoječa neprazna polja natančno takšna, kot so — NE spreminjaj jih.\n2. GENERIRAJ strokovno vsebino SAMO za polja, ki so prazni nizi ("") ali manjkajoča.\n3. Če ima seznam manj elementov od priporočenega, DODAJ NOVE ELEMENTE.\n4. Zagotovi veljaven JSON objekt.\n`
      : `\nMODE: FILL MISSING ONLY.\nExisting data: ${JSON.stringify(currentSectionData)}\nRULES:\n1. KEEP all existing non-empty fields exactly as they are — do NOT modify them.\n2. GENERATE professional content ONLY for fields that are empty strings ("") or missing.\n3. If a list has fewer items than recommended, ADD NEW ITEMS.\n4. Ensure valid JSON output.\n`;
  } else if (mode === 'enhance') {
    modeInstruction = language === 'si'
      ? `\nNAČIN: STROKOVNA IZBOLJŠAVA OBSTOJEČEGA BESEDILA.\nObstoječi podatki: ${JSON.stringify(currentSectionData)}\n\nNaloga: STROKOVNO IZBOLJŠAJ, POGLOBI in DODELAJ obstoječo vsebino.\n\nPRAVILA:\n1. OHRANI pomen in tematiko — NE spreminjaj vsebinskega fokusa.\n2. IZBOLJŠAJ: dodaj strokovno EU terminologijo, poglobi argumente.\n3. DODAJ CITATE iz REALNIH virov.\n4. PODALJŠAJ: kratka polja razširi na vsaj 3–5 stavkov.\n5. DOPOLNI: če je seznam kratek, DODAJ NOVE ELEMENTE.\n6. POPRAVI napake.\n7. NE BRIŠI obstoječih elementov.\n8. NE HALUCIENIRAJ — če nisi prepričan: "[Vstavite preverjen podatek: ...]".\n9. BREZ MARKDOWN: ne uporabljaj ** ## \`.\n10. HUMANIZIRAJ: piši kot izkušen človeški svetovalec, variraj stavke.\n11. Zagotovi veljaven JSON objekt.\n`
      : `\nMODE: PROFESSIONAL ENHANCEMENT OF EXISTING CONTENT.\nExisting data: ${JSON.stringify(currentSectionData)}\n\nTask: PROFESSIONALLY ENHANCE, DEEPEN, and REFINE the existing content.\n\nRULES:\n1. PRESERVE the meaning and topic — do NOT change the thematic focus.\n2. ENHANCE: add EU terminology, deepen arguments with evidence.\n3. ADD CITATIONS from REAL sources.\n4. EXPAND short fields to 3–5 sentences.\n5. SUPPLEMENT: add new items if lists are short.\n6. CORRECT errors.\n7. NEVER REMOVE existing items.\n8. ZERO HALLUCINATION — if unsure: "[Insert verified data: ...]".\n9. NO MARKDOWN: do not use ** ## \`.\n10. HUMANIZE: write like an experienced human consultant, vary sentence structure.\n11. Ensure valid JSON output.\n`;
  } else {
    modeInstruction = language === 'si'
      ? "NAČIN: POPOLNA PONOVNA GENERACIJA.\nGeneriraj popolnoma nov, celovit, strokoven odgovor. Vsak opis MORA vsebovati citate iz REALNIH virov. BREZ markdown (**, ##, `). Piši kot izkušen človeški svetovalec — variraj stavčne strukture. Če ne poznaš podatka: '[Vstavite preverjen podatek: ...]'."
      : "MODE: FULL REGENERATION.\nGenerate completely new, comprehensive, professional content. Every description MUST contain citations from REAL sources. NO markdown (**, ##, `). Write like an experienced human consultant — vary sentence structures. If unknown: '[Insert verified data: ...]'.";
  }

  const globalRulesHeader = language === 'si' ? 'GLOBALNA PRAVILA' : 'GLOBAL RULES';
  const taskInstruction = getSectionTaskInstruction(sectionKey, projectData, language);
  const qualityGate = getQualityEnforcement(sectionKey, language);

  // v3.5.3: Prompt order — title rules injected for projectIdea
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

// ─── SECTION-SPECIFIC TASK INSTRUCTIONS (v3.5.3) ────────────────

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
      const userInput = contextParts.length > 0 ? contextParts.join('\n') : (language === 'si' ? '(uporabnik še ni vnesel podatkov)' : '(no user input yet)');

      return language === 'si'
        ? `UPORABNIKOV VNOS ZA OSREDNJI PROBLEM:\n${userInput}\n\nNALOGA: Na podlagi ZGORNJEGA VNOSA ustvari (ali dopolni) podrobno analizo problemov.\n\nOBVEZNE ZAHTEVE:\n- Generirani naslov in opis MORATA biti neposredno povezana z uporabnikovim vnosom.\n- NE izmišljuj nepovezanih tem.\n- Vsak VZROK: naslov + opis s 3–5 stavki + vsaj 1 citat iz REALNEGA vira.\n- Vsaka POSLEDICA: naslov + opis s 3–5 stavki + vsaj 1 citat iz REALNEGA vira.\n- Osrednji problem MORA vključevati kvantitativni kazalnik.\n- NIKOLI generičnih opisov brez podatkov.\n- Če ne poznaš podatka: "[Vstavite preverjen podatek: <opis>]".\n- BREZ markdown (**, ##, \`).\n- Piši kot izkušen človeški svetovalec — variraj stavke.`
        : `USER INPUT FOR CORE PROBLEM:\n${userInput}\n\nTASK: Based STRICTLY on the USER INPUT ABOVE, create (or complete) a detailed problem analysis.\n\nMANDATORY:\n- Title and description MUST be directly related to user's input.\n- Do NOT invent unrelated topics.\n- Every CAUSE: title + 3–5 sentence description + at least 1 citation from REAL source.\n- Every CONSEQUENCE: title + 3–5 sentence description + at least 1 citation from REAL source.\n- Core problem MUST include a quantitative indicator.\n- NEVER write generic descriptions without evidence.\n- If unknown: "[Insert verified data: <description>]".\n- NO markdown (**, ##, \`).\n- Write like an experienced human consultant — vary sentence structures.`;
    }

    case 'projectIdea': {
      // v3.5.3: Extract user-entered project title for explicit instruction
      const userTitle = projectData.projectIdea?.projectTitle?.trim() || '';
      const titleContext = userTitle
        ? (language === 'si'
          ? `\nUPORABNIKOV VNOS ZA NAZIV PROJEKTA: "${userTitle}"\nPRAVILA ZA NAZIV:\n- Če je uporabnikov vnos primeren (30–200 znakov, imenski izraz, brez akronima), ga OHRANI NESPREMENJENO.\n- Če je uporabnikov vnos prekratek ali predolg ali vsebuje glagol, ga IZBOLJŠAJ v skladu s pravili za naziv projekta zgoraj.\n- NIKOLI ne generiraj popolnoma drugačnega naziva — ostani na temi uporabnikovega vnosa.\n`
          : `\nUSER INPUT FOR PROJECT TITLE: "${userTitle}"\nTITLE RULES:\n- If the user's input is acceptable (30–200 chars, noun phrase, no acronym), KEEP IT UNCHANGED.\n- If the user's input is too short, too long, or contains a verb, IMPROVE it following the project title rules above.\n- NEVER generate a completely different title — stay on the user's topic.\n`)
        : '';

      return language === 'si'
        ? `${titleContext}Na podlagi analize problemov razvij (ali dopolni) celovito projektno idejo.\n\nOBVEZNE ZAHTEVE:\n- Stanje tehnike MORA navajati vsaj 3 RESNIČNE obstoječe projekte/študije z imeni in letnicami.\n- Predlagana rešitev MORA začeti s CELOVITIM UVODNIM ODSTAVKOM (5–8 stavkov) pred fazami.\n- Faze: golo besedilo "Faza 1: Naslov" — NE "**Faza 1: Naslov**".\n- EU politike morajo biti resnične in preverljive.\n- Če ne poznaš projekta: "[Vstavite preverjen projekt: <tematika>]".\n- BREZ markdown (**, ##, \`).\n- Piši kot izkušen človeški svetovalec — variraj stavke, izogibaj se AI frazam.`
        : `${titleContext}Based on the problem analysis, develop (or complete) a comprehensive project idea.\n\nMANDATORY:\n- State of the Art MUST reference at least 3 REAL existing projects/studies with names and years.\n- Proposed Solution MUST BEGIN with a COMPREHENSIVE INTRODUCTORY PARAGRAPH (5–8 sentences) before phases.\n- Phase headers: plain text "Phase 1: Title" — NOT "**Phase 1: Title**".\n- EU policies must be real and verifiable.\n- If unknown project: "[Insert verified project: <topic>]".\n- NO markdown (**, ##, \`).\n- Write like an experienced human consultant — vary sentences, avoid AI phrases.`;
    }

    case 'generalObjectives':
      return language === 'si'
        ? 'Opredeli 3–5 splošnih ciljev.\nOBVEZNO: Naslov z nedoločniškim glagolom. Vsaj 3 vsebinske stavke. BREZ markdown. Variraj stavčne strukture.'
        : 'Define 3–5 general objectives.\nMANDATORY: Title with infinitive verb. At least 3 substantive sentences. No markdown. Vary sentence structures.';

    case 'specificObjectives':
      return language === 'si'
        ? 'Opredeli vsaj 5 S.M.A.R.T. ciljev.\nOBVEZNO: Naslov z nedoločniškim glagolom. Merljiv KPI. BREZ markdown. Variraj stavčne strukture.'
        : 'Define at least 5 S.M.A.R.T. objectives.\nMANDATORY: Title with infinitive verb. Measurable KPI. No markdown. Vary sentence structures.';

    case 'projectManagement':
      return language === 'si'
        ? 'Ustvari PODROBEN razdelek o upravljanju projekta.\nVsebovati mora: koordinacijo, usmerjevalni odbor, WP voditelje, odločanje, kakovost, konflikte, poročanje.\nBREZ markdown. Piši kot izkušen svetovalec.'
        : 'Create a DETAILED project management section.\nMust include: coordination, steering committee, WP leaders, decision-making, quality, conflicts, reporting.\nNo markdown. Write like an experienced consultant.';

    case 'activities': {
      const today = new Date().toISOString().split('T')[0];
      const projectStart = projectData.projectIdea?.startDate || today;
      return language === 'si'
        ? `Začetek projekta: ${projectStart}. Vsi datumi nalog na ali po tem datumu.\nOblikuj delovne sklope na podlagi ciljev.\nOBVEZNO: Naslov z nedoločniškim glagolom, vsaj 3 naloge, 1 mejnik, 1 dosežek.\nDosežki preverljivi z desk review. BREZ nejasnih opisov. BREZ markdown. Variraj stavke.`
        : `Project starts: ${projectStart}. All task dates on or after this.\nDesign Work Packages based on objectives.\nMANDATORY: Title with infinitive verb, at least 3 tasks, 1 milestone, 1 deliverable.\nDeliverables verifiable via desk review. No vague descriptions. No markdown. Vary sentences.`;
    }

    case 'outputs':
      return language === 'si'
        ? 'Vsaj 6 podrobnih neposrednih rezultatov.\nNaslov z nedoločniškim glagolom, opis 3+ stavki, merljiv kazalnik.\nBREZ markdown. Variraj stavke.'
        : 'At least 6 detailed tangible outputs.\nTitle with infinitive verb, description 3+ sentences, measurable indicator.\nNo markdown. Vary sentences.';

    case 'outcomes':
      return language === 'si'
        ? 'Vsaj 6 vmesnih učinkov.\nNaslov z nedoločniškim glagolom, opis 3+ stavki, merljiv kazalnik.\nBREZ markdown. Variraj stavke.'
        : 'At least 6 medium-term outcomes.\nTitle with infinitive verb, description 3+ sentences, measurable indicator.\nNo markdown. Vary sentences.';

    case 'impacts':
      return language === 'si'
        ? 'Vsaj 6 dolgoročnih vplivov.\nNaslov z nedoločniškim glagolom, opis 3+ stavki s Pathway to Impact, merljiv kazalnik.\nBREZ markdown. Variraj stavke.'
        : 'At least 6 long-term impacts.\nTitle with infinitive verb, description 3+ sentences with Pathway to Impact, measurable indicator.\nNo markdown. Vary sentences.';

    case 'risks':
      return language === 'si'
        ? 'Vsaj 5 tveganj (Tehnično, Družbeno, Ekonomsko).\nSpecifičen naslov, podroben opis, verjetnost, vpliv, ukrepi za ublažitev.\nBREZ markdown. Variraj stavke.'
        : 'At least 5 risks (Technical, Social, Economic).\nSpecific title, detailed description, likelihood, impact, mitigation.\nNo markdown. Vary sentences.';

    case 'kers':
      return language === 'si'
        ? 'Vsaj 5 ključnih izkoriščljivih rezultatov.\nSpecifičen naslov, podroben opis, strategija izkoriščanja.\nBREZ markdown. Variraj stavke.'
        : 'At least 5 Key Exploitable Results.\nSpecific title, detailed description, exploitation strategy.\nNo markdown. Vary sentences.';

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
      /([^\n])\s*((?:Faza|Phase)\s+\d+(?::|\.))/g,
      '$1\n\n$2'
    );
    parsedData.proposedSolution = text;
  }

  // v3.5.3: Sanitize project title after generation
  if (sectionKey === 'projectIdea' && parsedData.projectTitle) {
    parsedData.projectTitle = sanitizeProjectTitle(parsedData.projectTitle);
  }

  if (mode === 'fill' && currentSectionData) {
    parsedData = smartMerge(currentSectionData, parsedData);
  }

  // Strip markdown formatting from all string values
  parsedData = stripMarkdown(parsedData);

  // v3.5.3: Re-sanitize title after stripMarkdown (in case merge reintroduced issues)
  if (sectionKey === 'projectIdea' && parsedData.projectTitle) {
    parsedData.projectTitle = sanitizeProjectTitle(parsedData.projectTitle);
  }

  return parsedData;
};

// ─── FIELD CONTENT GENERATION (v3.5.3) ───────────────────────────

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

  // v3.5.3: Special handling for projectTitle field
  const isProjectTitle = fieldName === 'projectTitle' ||
    (sectionName === 'projectIdea' && fieldName === 'title' && path.length <= 2);

  const titleRules = isProjectTitle ? getProjectTitleRules(language) : '';

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
    // v3.5.3: Dedicated project title generation
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
    isProjectTitle ? '' : academicRules,   // No citations needed for a title
    isProjectTitle ? '' : humanRules,       // Humanization not relevant for short title
    titleRules,
    context,
    siblingContext,
    `${globalRulesHeader}:\n${globalRules}`,
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

  // v3.5.3: Apply title sanitization if this was a projectTitle field
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
