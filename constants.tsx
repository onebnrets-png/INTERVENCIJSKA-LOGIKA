// constants.tsx
// ═══════════════════════════════════════════════════════════════
// UI assets, step definitions, readiness-level definitions.
// v4.4 — 2026-02-14 — CHANGES:
//   - FIXED CRASH: removed references to non-existent TEXT[lang].rl.*
//   - Readiness level names/descriptions are now inline strings
//   - Fixed all Slovene diacritics in readiness level titles
//   - Sub-steps: 'implementation' + 'organigram' (no 'quality-efficiency')
// ═══════════════════════════════════════════════════════════════

import React from 'react';
import { TEXT } from './locales.ts';

// --- BRANDING ASSETS ---
export const BRAND_ASSETS = {
  logoText: "/logo.png" 
};

export const ICONS = {
  CHECK: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  ),
  CIRCLE_CHECK: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" {...props}>
      <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
    </svg>
  ),
  CIRCLE_X: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  ),
  SPARKLES: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
    </svg>
  ),
  SAVE: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  ),
  IMPORT: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
    </svg>
  ),
  DOCX: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  ),
  PRINT: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0c1.253 1.464 2.405 3.06 2.405 4.872A3.375 3.375 0 0 1 18.25 24H5.75A3.375 3.375 0 0 1 2.25 20.622c0-1.812 1.152-3.408 2.405-4.872M8.25 6h7.5v2.25h-7.5V6ZM12 10.5h.008v.008H12v-.008Z" />
    </svg>
  ),
  SUMMARY: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  ),
  LOCK: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0V10.5m-1.5 0h12a1.5 1.5 0 0 1 1.5 1.5v7.5a1.5 1.5 0 0 1-1.5 1.5h-12a1.5 1.5 0 0 1-1.5-1.5v-7.5a1.5 1.5 0 0 1 1.5-1.5Z" />
    </svg>
  )
};

// ─── STEP DEFINITIONS ────────────────────────────────────────────

export const getSteps = (lang = 'en') => [
  { id: 1, key: 'problemAnalysis', title: TEXT[lang].steps.problemAnalysis, color: 'bg-red-500' },
  { id: 2, key: 'projectIdea', title: TEXT[lang].steps.projectIdea, color: 'bg-orange-500' },
  { id: 3, key: 'generalObjectives', title: TEXT[lang].steps.generalObjectives, color: 'bg-amber-500' },
  { id: 4, key: 'specificObjectives', title: TEXT[lang].steps.specificObjectives, color: 'bg-yellow-500' },
  { id: 5, key: 'activities', title: TEXT[lang].steps.activities, color: 'bg-lime-500' },
  { id: 6, key: 'expectedResults', title: TEXT[lang].steps.expectedResults, color: 'bg-cyan-500' },
];

export const STEPS = getSteps('en'); 

// ─── SUB-STEP DEFINITIONS ───────────────────────────────────────

export const getSubSteps = (lang = 'en') => ({
  problemAnalysis: [
    { id: 'core-problem', key: 'coreProblem', title: TEXT[lang].subSteps.coreProblem },
    { id: 'causes', key: 'causes', title: TEXT[lang].subSteps.causes },
    { id: 'consequences', key: 'consequences', title: TEXT[lang].subSteps.consequences },
  ],
  projectIdea: [
    { id: 'main-aim', key: 'mainAim', title: TEXT[lang].subSteps.mainAim },
    { id: 'state-of-the-art', key: 'stateOfTheArt', title: TEXT[lang].subSteps.stateOfTheArt },
    { id: 'proposed-solution', key: 'proposedSolution', title: TEXT[lang].subSteps.proposedSolution },
    { id: 'readiness-levels', key: 'readinessLevels', title: TEXT[lang].subSteps.readinessLevels },
    { id: 'eu-policies', key: 'euPolicies', title: TEXT[lang].subSteps.euPolicies },
  ],
  generalObjectives: [],
  specificObjectives: [],
  activities: [
    { id: 'implementation', key: 'implementation', title: TEXT[lang].subSteps.implementation },
    { id: 'organigram', key: 'organigram', title: TEXT[lang].subSteps.organigram },
    { id: 'workplan', key: 'workplan', title: TEXT[lang].subSteps.workplan },
    { id: 'gantt-chart', key: 'ganttChart', title: TEXT[lang].subSteps.ganttChart },
    { id: 'pert-chart', key: 'pertChart', title: TEXT[lang].subSteps.pertChart },
    { id: 'risk-mitigation', key: 'riskMitigation', title: TEXT[lang].subSteps.riskMitigation },
  ],
  expectedResults: [
    { id: 'outputs', key: 'outputs', title: TEXT[lang].subSteps.outputs },
    { id: 'outcomes', key: 'outcomes', title: TEXT[lang].subSteps.outcomes },
    { id: 'impacts', key: 'impacts', title: TEXT[lang].subSteps.impacts },
    { id: 'kers', key: 'kers', title: TEXT[lang].subSteps.kers },
  ],
});

export const SUB_STEPS = getSubSteps('en');

// ─── READINESS LEVELS DEFINITIONS ────────────────────────────────
// Names and descriptions are inline (NOT from locales — locales has no 'rl' section)

export const getReadinessLevelsDefinitions = (lang = 'en') => ({
  TRL: {
    name: lang === 'si' ? "Stopnja tehnološke pripravljenosti (TRL)" : "Technology Readiness Level (TRL)",
    description: lang === 'si' ? "Ocena zrelosti tehnologije od osnovnih načel do dokazanega sistema." : "Assessment of technology maturity from basic principles to proven system.",
    levels: [
      { level: 1, title: lang === 'si' ? "Opažena so osnovna načela" : "Basic principles observed" },
      { level: 2, title: lang === 'si' ? "Oblikovan koncept tehnologije" : "Technology concept formulated" },
      { level: 3, title: lang === 'si' ? "Eksperimentalni dokaz koncepta" : "Experimental proof of concept" },
      { level: 4, title: lang === 'si' ? "Tehnologija potrjena v laboratoriju" : "Technology validated in lab" },
      { level: 5, title: lang === 'si' ? "Tehnologija potrjena v ustreznem okolju" : "Technology validated in relevant environment" },
      { level: 6, title: lang === 'si' ? "Tehnologija prikazana v ustreznem okolju" : "Technology demonstrated in relevant environment" },
      { level: 7, title: lang === 'si' ? "Prikaz prototipa sistema v operativnem okolju" : "System prototype demonstration in operational environment" },
      { level: 8, title: lang === 'si' ? "Sistem popoln in kvalificiran" : "System complete and qualified" },
      { level: 9, title: lang === 'si' ? "Dejanski sistem dokazan v operativnem okolju" : "Actual system proven in operational environment" },
    ],
  },
  SRL: {
    name: lang === 'si' ? "Stopnja družbene pripravljenosti (SRL)" : "Societal Readiness Level (SRL)",
    description: lang === 'si' ? "Ocena družbene sprejemljivosti in vključenosti deležnikov." : "Assessment of societal acceptance and stakeholder engagement.",
    levels: [
      { level: 1, title: lang === 'si' ? "Problem identificiran" : "Problem identified" },
      { level: 2, title: lang === 'si' ? "Družbena potreba oblikovana" : "Societal need formulated" },
      { level: 3, title: lang === 'si' ? "Začetno vključevanje deležnikov" : "Initial stakeholder engagement" },
      { level: 4, title: lang === 'si' ? "Vzpostavljena mreža deležnikov" : "Stakeholder network established" },
      { level: 5, title: lang === 'si' ? "Soustvarjanje z deležniki" : "Co-creation with stakeholders" },
      { level: 6, title: lang === 'si' ? "Družbena sprejemljivost dokazana" : "Societal acceptance demonstrated" },
      { level: 7, title: lang === 'si' ? "Rešitev prikazana v družbenem kontekstu" : "Solution demonstrated in societal context" },
      { level: 8, title: lang === 'si' ? "Rešitev pripravljena za družbeno implementacijo" : "Solution ready for societal implementation" },
      { level: 9, title: lang === 'si' ? "Rešitev dokazana v družbi" : "Solution proven in society" },
    ],
  },
  ORL: {
    name: lang === 'si' ? "Stopnja organizacijske pripravljenosti (ORL)" : "Organisational Readiness Level (ORL)",
    description: lang === 'si' ? "Ocena pripravljenosti organizacije za sprejetje sprememb." : "Assessment of organizational readiness to adopt changes.",
    levels: [
      { level: 1, title: lang === 'si' ? "Zavedanje o potrebi po spremembi" : "Awareness of the need for change" },
      { level: 2, title: lang === 'si' ? "Konceptualizacija potrebne organizacijske spremembe" : "Conceptualization of the required organizational change" },
      { level: 3, title: lang === 'si' ? "Začetna ocena organizacijskega vpliva" : "Initial assessment of organizational impact" },
      { level: 4, title: lang === 'si' ? "Razvit načrt za upravljanje sprememb" : "Change management plan developed" },
      { level: 5, title: lang === 'si' ? "Viri za spremembe dodeljeni" : "Resources for change allocated" },
      { level: 6, title: lang === 'si' ? "Organizacijske strukture prilagojene" : "Organizational structures adapted" },
      { level: 7, title: lang === 'si' ? "Pilotna implementacija znotraj organizacije" : "Pilot implementation within the organization" },
      { level: 8, title: lang === 'si' ? "Implementacija v polnem obsegu in usposabljanje" : "Full-scale implementation and training" },
      { level: 9, title: lang === 'si' ? "Novi procesi popolnoma integrirani in optimizirani" : "New processes fully integrated and optimized" },
    ]
  },
  LRL: {
    name: lang === 'si' ? "Stopnja pravne/etične pripravljenosti (LRL)" : "Legal/Ethical Readiness Level (LRL)",
    description: lang === 'si' ? "Ocena pravne in etične skladnosti rešitve." : "Assessment of legal and ethical compliance of the solution.",
    levels: [
      { level: 1, title: lang === 'si' ? "Začetna identifikacija potencialnih pravnih/etičnih vprašanj" : "Initial identification of potential legal/ethical issues" },
      { level: 2, title: lang === 'si' ? "Osnovne raziskave ustreznih pravnih okvirov" : "Basic research on relevant legal frameworks" },
      { level: 3, title: lang === 'si' ? "Predhodna pravna in etična analiza" : "Preliminary legal and ethical analysis" },
      { level: 4, title: lang === 'si' ? "Podrobna analiza pravnega/etičnega okvira" : "Detailed legal/ethical framework analysis" },
      { level: 5, title: lang === 'si' ? "Razvita strategija za pravno/etično skladnost" : "Strategy for legal/ethical compliance developed" },
      { level: 6, title: lang === 'si' ? "Ukrepi skladnosti dokazani" : "Compliance measures demonstrated" },
      { level: 7, title: lang === 'si' ? "Etična/pravna odobritev pridobljena (če je primerno)" : "Ethical/legal approval obtained (if applicable)" },
      { level: 8, title: lang === 'si' ? "Pravni okvir popolnoma naslovljen" : "Legal framework fully addressed" },
      { level: 9, title: lang === 'si' ? "Neprekinjeno spremljanje skladnosti vzpostavljeno" : "Continuous compliance monitoring in place" },
    ]
  }
});

export const READINESS_LEVELS_DEFINITIONS = getReadinessLevelsDefinitions('en');
