// services/DataExtractionService.ts
// ═══════════════════════════════════════════════════════════════
// AI-powered extraction of empirical data points from text.
// Identifies numbers, percentages, statistics, comparisons,
// and returns structured data suitable for visualization.
//
// v1.3 — 2026-02-21
//   - NEW: extractStructuralData() now accepts `language` parameter
//     and returns localized titles, subtitles, labels for SI/EN
//   - All chart titles, subtitles, risk categories, severity labels,
//     and section names are now bilingual (Slovenian / English)
//
// v1.2 — 2026-02-18
//   - FIX: extractStructuralData() completeness calculation now correctly
//     handles empty/skeleton project data (default values like startDate,
//     durationMonths, empty readinessLevels, skeleton arrays no longer
//     inflate completeness percentages)
//   - FIX: arrayHasRealContent now skips default enum fields
//     (category, likelihood, impact, type, dependencies)
//   - FIX: Numbers no longer count as "real content" (prevents
//     durationMonths:24 from inflating percentages)
//
// ARCHITECTURE:
//   - Input: raw text string (from any project field)
//   - Output: ExtractedChartData[] — structured data points
//   - Uses the same AI provider as the main generation pipeline
//   - Falls back gracefully if extraction fails (returns [])
//
// IMPORTANT: This service extracts data for VISUALIZATION only.
//   It does NOT modify or generate project content.
// ═══════════════════════════════════════════════════════════════

import {
  generateContent,
  hasValidProviderKey,
  getProviderConfig,
} from './aiProvider.ts';
import { Type } from '@google/genai';

// ─── Types ───────────────────────────────────────────────────

export interface ExtractedDataPoint {
  label: string;
  value: number;
  unit?: string;
  category?: string;
  source?: string;
  year?: number;
}

export type ChartType =
  | 'comparison_bar'
  | 'donut'
  | 'line'
  | 'radar'
  | 'heatmap'
  | 'gauge'
  | 'stacked_bar'
  | 'progress'
  | 'sankey';

export interface ExtractedChartData {
  id: string;
  chartType: ChartType;
  title: string;
  subtitle?: string;
  dataPoints: ExtractedDataPoint[];
  source?: string;
  textSnippet: string;
  confidence: number;
}

// ─── JSON Schema for AI extraction ──────────────────────────

const extractionSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      subtitle: { type: Type.STRING },
      suggestedChartType: {
        type: Type.STRING,
        enum: ['comparison_bar', 'donut', 'line', 'radar', 'gauge', 'stacked_bar', 'progress']
      },
      dataPoints: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            label: { type: Type.STRING },
            value: { type: Type.NUMBER },
            unit: { type: Type.STRING },
            category: { type: Type.STRING },
            source: { type: Type.STRING },
            year: { type: Type.INTEGER },
          },
          required: ['label', 'value']
        }
      },
      source: { type: Type.STRING },
      textSnippet: { type: Type.STRING },
      confidence: { type: Type.NUMBER },
    },
    required: ['title', 'suggestedChartType', 'dataPoints', 'textSnippet', 'confidence']
  }
};

// ─── Schema to text (for OpenRouter) ─────────────────────────

const schemaToText = (schema: any): string => {
  try {
    return `\n\nRESPONSE JSON SCHEMA (follow exactly):\n${JSON.stringify(schema, null, 2)}\n`;
  } catch {
    return '';
  }
};

// ─── Extraction prompt ───────────────────────────────────────

const EXTRACTION_PROMPT = `You are a data extraction specialist. Analyze the following text and extract ALL empirical data points that could be visualized in a chart or graph.

WHAT TO EXTRACT:
- Percentages (e.g., "37% of citizens", "increased by 23%")
- Absolute numbers (e.g., "6,000 professionals", "35 EU projects")
- Comparisons (e.g., "50% perceive X while only 37% feel Y")
- Time series data (e.g., "grew from 12% in 2019 to 28% in 2023")
- Rankings or distributions (e.g., "Technical 40%, Social 30%, Economic 30%")
- Scores or levels (e.g., "TRL 4", "readiness level 6 out of 9")

RULES:
1. Extract ONLY data explicitly stated in the text — do NOT infer or calculate.
2. Each visualization should have 2–8 data points (not more).
3. Include the source/citation if mentioned in the text.
4. Include the exact text snippet that contains the data.
5. Set confidence: 0.9+ for explicit numbers, 0.7-0.9 for clear implications, below 0.7 for approximations.
6. If NO empirical data is found, return an empty array [].
7. suggestedChartType: use comparison_bar for comparisons, donut for distributions, line for time series, gauge for single metrics, progress for completion/readiness levels.

TEXT TO ANALYZE:
`;

// ─── Main extraction function ────────────────────────────────

export const extractEmpiricalData = async (
  text: string,
  fieldContext?: string
): Promise<ExtractedChartData[]> => {
  if (!text || text.trim().length < 20) return [];
  if (!hasValidProviderKey()) return [];

  try {
    const config = getProviderConfig();
    const needsTextSchema = config.provider !== 'gemini';
    const textSchemaStr = needsTextSchema ? schemaToText(extractionSchema) : '';

    const contextNote = fieldContext
      ? `\n[Context: This text is from the "${fieldContext}" section of an EU project proposal.]\n`
      : '';

    const prompt = `${EXTRACTION_PROMPT}${contextNote}\n---\n${text}\n---${textSchemaStr}`;

    const result = await generateContent({
      prompt,
      jsonSchema: config.provider === 'gemini' ? extractionSchema : undefined,
      temperature: 0.2,
    });

    if (!result || !result.text) return [];

    let parsed: any[];
    const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return [];
    }

    if (!Array.isArray(parsed)) return [];

    const extracted: ExtractedChartData[] = parsed
      .filter((item: any) =>
        item.dataPoints &&
        Array.isArray(item.dataPoints) &&
        item.dataPoints.length >= 2 &&
        item.confidence >= 0.6
      )
      .map((item: any, index: number) => ({
        id: `chart-${Date.now()}-${index}`,
        chartType: item.suggestedChartType || 'comparison_bar',
        title: item.title || 'Data Visualization',
        subtitle: item.subtitle || undefined,
        dataPoints: item.dataPoints.map((dp: any) => ({
          label: dp.label || 'Unknown',
          value: typeof dp.value === 'number' ? dp.value : parseFloat(dp.value) || 0,
          unit: dp.unit || undefined,
          category: dp.category || undefined,
          source: dp.source || undefined,
          year: dp.year || undefined,
        })),
        source: item.source || undefined,
        textSnippet: item.textSnippet || '',
        confidence: typeof item.confidence === 'number' ? item.confidence : 0.7,
      }));

    console.log(`[DataExtraction] Extracted ${extracted.length} visualizable dataset(s) from text.`);
    return extracted;

  } catch (err: any) {
    console.warn('[DataExtraction] Extraction failed:', err.message);
    return [];
  }
};

// ─── Helpers for structural extraction ───────────────────────
// v1.2 FIX: These helpers ensure skeleton/default data is not
// counted as real user-entered content.
// - Skip enum defaults: category, likelihood, impact, type
// - Skip id-like fields: id, project_id, created_at, updated_at
// - Do NOT count numbers as real content (durationMonths:24, etc.)

const SKIP_KEYS = new Set([
  'id', 'project_id', 'created_at', 'updated_at',
  'category', 'likelihood', 'impact', 'type', 'dependencies',
]);

const hasRealString = (v: any): boolean =>
  typeof v === 'string' && v.trim().length > 0;

const arrayHasRealContent = (arr: any[]): boolean => {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  return arr.some((item: any) => {
    if (typeof item === 'string') return item.trim().length > 0;
    if (typeof item !== 'object' || item === null) return false;
    return Object.entries(item).some(([k, v]) => {
      if (SKIP_KEYS.has(k)) return false;
      if (typeof v === 'string') return v.trim().length > 0;
      if (Array.isArray(v)) return arrayHasRealContent(v);
      return false;
    });
  });
};

// ─── Per-section completeness calculator for chart ───────────
// v1.2 — Explicit checks per section, immune to default values

const getSectionCompleteness = (projectData: any, sectionKey: string): number => {
  const data = projectData?.[sectionKey];
  if (!data) return 0;

  switch (sectionKey) {
    case 'problemAnalysis': {
      let score = 0, total = 3;
      if (hasRealString(data.coreProblem?.title) || hasRealString(data.coreProblem?.description)) score++;
      if (arrayHasRealContent(data.causes)) score++;
      if (arrayHasRealContent(data.consequences)) score++;
      return Math.round((score / total) * 100);
    }

    case 'projectIdea': {
      let score = 0, total = 5;
      if (hasRealString(data.projectTitle)) score++;
      if (hasRealString(data.projectAcronym)) score++;
      if (hasRealString(data.mainAim)) score++;
      if (hasRealString(data.stateOfTheArt)) score++;
      if (hasRealString(data.proposedSolution)) score++;
      if (arrayHasRealContent(data.policies)) { score++; total++; }
      const rl = data.readinessLevels;
      if (rl && (rl.TRL?.level !== null || rl.SRL?.level !== null || rl.ORL?.level !== null || rl.LRL?.level !== null)) {
        // Only count if at least one level is a real number > 0
        const hasAnyLevel = [rl.TRL, rl.SRL, rl.ORL, rl.LRL].some(
          (r: any) => typeof r?.level === 'number' && r.level > 0
        );
        if (hasAnyLevel) { score++; total++; }
      }
      return total === 0 ? 0 : Math.round((score / total) * 100);
    }

    case 'generalObjectives':
    case 'specificObjectives': {
      if (!Array.isArray(data) || data.length === 0) return 0;
      const filled = data.filter((item: any) =>
        hasRealString(item.title) || hasRealString(item.description)
      );
      return filled.length === 0 ? 0 : Math.round((filled.length / data.length) * 100);
    }

    case 'activities': {
      if (!Array.isArray(data) || data.length === 0) return 0;
      const filled = data.filter((wp: any) =>
        hasRealString(wp.title) ||
        arrayHasRealContent(wp.tasks) ||
        arrayHasRealContent(wp.milestones) ||
        arrayHasRealContent(wp.deliverables)
      );
      return filled.length === 0 ? 0 : Math.round((filled.length / data.length) * 100);
    }

    case 'outputs':
    case 'outcomes':
    case 'impacts':
    case 'kers': {
      if (!Array.isArray(data) || data.length === 0) return 0;
      const filled = data.filter((item: any) =>
        hasRealString(item.title) || hasRealString(item.description)
      );
      return filled.length === 0 ? 0 : Math.round((filled.length / data.length) * 100);
    }

    case 'risks': {
      if (!Array.isArray(data) || data.length === 0) return 0;
      const filled = data.filter((item: any) =>
        hasRealString(item.title) || hasRealString(item.description) || hasRealString(item.mitigation)
      );
      return filled.length === 0 ? 0 : Math.round((filled.length / data.length) * 100);
    }

    default:
      return 0;
  }
};

// ─── Extract from structured project data ────────────────────
// Extracts visualization data from project's structured fields
// (readiness levels, risks, objectives, etc.) WITHOUT using AI.
//
// ★ v1.3: Now accepts `language` parameter for bilingual output.

export const extractStructuralData = (projectData: any, language: 'en' | 'si' = 'en'): ExtractedChartData[] => {
  const results: ExtractedChartData[] = [];
  const si = language === 'si';

  // 1. Readiness Levels Radar
  const rl = projectData?.projectIdea?.readinessLevels;
  if (rl) {
    const dataPoints: ExtractedDataPoint[] = [];
    const keys = ['TRL', 'SRL', 'ORL', 'LRL'] as const;
    let hasData = false;

    for (const key of keys) {
      const level = rl[key]?.level;
      if (typeof level === 'number' && level > 0) {
        hasData = true;
        dataPoints.push({
          label: key,
          value: level,
          unit: si ? 'stopnja' : 'level',
          category: 'readiness',
        });
      }
    }

    if (hasData && dataPoints.length >= 2) {
      results.push({
        id: 'structural-readiness-radar',
        chartType: 'radar',
        title: si ? 'Stopnje pripravljenosti' : 'Readiness Levels',
        subtitle: 'TRL / SRL / ORL / LRL',
        dataPoints,
        textSnippet: si ? 'Ocena stopenj pripravljenosti projekta' : 'Project readiness levels assessment',
        confidence: 1.0,
      });
    }
  }

  // 2. Risk Matrix Summary
  const risks = projectData?.risks;
  if (risks && Array.isArray(risks) && risks.length >= 2) {
    const realRisks = risks.filter((r: any) =>
      hasRealString(r.title) || hasRealString(r.description)
    );

    if (realRisks.length >= 2) {
      const categoryCounts: Record<string, number> = {};
      const likelihoodCounts: Record<string, number> = { low: 0, medium: 0, high: 0 };
      const impactCounts: Record<string, number> = { low: 0, medium: 0, high: 0 };

      realRisks.forEach((r: any) => {
        if (r.likelihood) likelihoodCounts[r.likelihood] = (likelihoodCounts[r.likelihood] || 0) + 1;
        if (r.impact) impactCounts[r.impact] = (impactCounts[r.impact] || 0) + 1;
        if (r.category) categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;
      });

      // ★ v1.3: Bilingual category labels
      const categoryLabels: Record<string, { en: string; si: string }> = {
        technical: { en: 'Technical', si: 'Tehnično' },
        social: { en: 'Social', si: 'Družbeno' },
        economic: { en: 'Economic', si: 'Ekonomsko' },
        environmental: { en: 'Environmental', si: 'Okoljsko' },
      };

      const catPoints: ExtractedDataPoint[] = Object.entries(categoryCounts)
        .filter(([, count]) => count > 0)
        .map(([cat, count]) => ({
          label: categoryLabels[cat]?.[language] || (cat.charAt(0).toUpperCase() + cat.slice(1)),
          value: count,
          unit: si ? 'tveganj' : 'risks',
          category: 'risk_category',
        }));

      if (catPoints.length >= 2) {
        results.push({
          id: 'structural-risk-categories',
          chartType: 'donut',
          title: si ? 'Tveganja po kategorijah' : 'Risks by Category',
          dataPoints: catPoints,
          textSnippet: si ? 'Porazdelitev registra tveganj projekta' : 'Project risk register distribution',
          confidence: 1.0,
        });
      }

      // ★ v1.3: Bilingual severity labels
      const severityPoints: ExtractedDataPoint[] = [
        { label: si ? 'Visoka verjetnost' : 'High Likelihood', value: likelihoodCounts.high || 0, category: 'likelihood' },
        { label: si ? 'Srednja verjetnost' : 'Medium Likelihood', value: likelihoodCounts.medium || 0, category: 'likelihood' },
        { label: si ? 'Nizka verjetnost' : 'Low Likelihood', value: likelihoodCounts.low || 0, category: 'likelihood' },
        { label: si ? 'Visok vpliv' : 'High Impact', value: impactCounts.high || 0, category: 'impact' },
        { label: si ? 'Srednji vpliv' : 'Medium Impact', value: impactCounts.medium || 0, category: 'impact' },
        { label: si ? 'Nizek vpliv' : 'Low Impact', value: impactCounts.low || 0, category: 'impact' },
      ].filter(p => p.value > 0);

      if (severityPoints.length >= 3) {
        results.push({
          id: 'structural-risk-severity',
          chartType: 'stacked_bar',
          title: si ? 'Porazdelitev resnosti tveganj' : 'Risk Severity Distribution',
          subtitle: si ? 'Verjetnost in vpliv' : 'Likelihood vs Impact',
          dataPoints: severityPoints,
          textSnippet: si ? 'Analiza verjetnosti in vpliva tveganj' : 'Risk likelihood and impact analysis',
          confidence: 1.0,
        });
      }
    }
  }

  // 3. Project Completeness (per section)
  // v1.2 FIX: Uses explicit per-section checks instead of generic field counting
  // ★ v1.3: Bilingual section labels
  const sections = [
    { key: 'problemAnalysis', label: si ? 'Analiza problema' : 'Problem Analysis' },
    { key: 'projectIdea', label: si ? 'Projektna ideja' : 'Project Idea' },
    { key: 'generalObjectives', label: si ? 'Splošni cilji' : 'General Obj.' },
    { key: 'specificObjectives', label: si ? 'Specifični cilji' : 'Specific Obj.' },
    { key: 'activities', label: si ? 'Aktivnosti' : 'Activities' },
    { key: 'outputs', label: si ? 'Pričak. rezultati' : 'Expected Results' },
  ];

  const completenessPoints: ExtractedDataPoint[] = [];

  for (const section of sections) {
    const completeness = getSectionCompleteness(projectData, section.key);
    completenessPoints.push({
      label: section.label,
      value: completeness,
      unit: '%',
    });
  }

  // Only show chart if at least one section has real content
  if (completenessPoints.some(p => p.value > 0)) {
    results.push({
      id: 'structural-completeness',
      chartType: 'comparison_bar',
      title: si ? 'Zapolnjenost projekta' : 'Project Completeness',
      subtitle: si ? 'Napredek po razdelkih' : 'Section-by-section progress',
      dataPoints: completenessPoints,
      textSnippet: si ? 'Pregled stanja zapolnjenosti projekta' : 'Project completion status overview',
      confidence: 1.0,
    });
  }

  return results;
};
