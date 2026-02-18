// services/DataExtractionService.ts
// ═══════════════════════════════════════════════════════════════
// AI-powered extraction of empirical data points from text.
// Identifies numbers, percentages, statistics, comparisons,
// and returns structured data suitable for visualization.
//
// v1.1 — 2026-02-18
//   - FIX: extractStructuralData() completeness calculation now correctly
//     handles empty/skeleton project data (default values like startDate,
//     durationMonths, empty readinessLevels, skeleton arrays no longer
//     inflate completeness percentages)
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
// v1.1 FIX: These helpers ensure skeleton/default data is not
// counted as real user-entered content.

const hasRealString = (v: any): boolean =>
  typeof v === 'string' && v.trim().length > 0;

const arrayHasRealContent = (arr: any[]): boolean => {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  return arr.some((item: any) => {
    if (typeof item === 'string') return item.trim().length > 0;
    if (typeof item !== 'object' || item === null) return false;
    return Object.entries(item).some(([k, v]) => {
      if (['id', 'project_id', 'created_at', 'updated_at'].includes(k)) return false;
      if (typeof v === 'string') return v.trim().length > 0;
      if (Array.isArray(v)) return arrayHasRealContent(v);
      return false;
    });
  });
};

// ─── Per-section completeness calculator for chart ───────────
// v1.1 — Explicit checks per section, immune to default values

const getSectionCompleteness = (projectData: any, sectionKey: string): number => {
  const data = projectData?.[sectionKey];
  if (!data) return 0;

  switch (sectionKey) {
    case 'problemAnalysis': {
      // Object: check coreProblem, causes, consequences
      let score = 0, total = 3;
      if (hasRealString(data.coreProblem?.title) || hasRealString(data.coreProblem?.description)) score++;
      if (arrayHasRealContent(data.causes)) score++;
      if (arrayHasRealContent(data.consequences)) score++;
      return Math.round((score / total) * 100);
    }

    case 'projectIdea': {
      // Object: check only user-entered fields, NOT startDate/durationMonths/readinessLevels defaults
      let score = 0, total = 5;
      if (hasRealString(data.projectTitle)) score++;
      if (hasRealString(data.projectAcronym)) score++;
      if (hasRealString(data.mainAim)) score++;
      if (hasRealString(data.stateOfTheArt)) score++;
      if (hasRealString(data.proposedSolution)) score++;
      // Bonus: policies with real content
      if (arrayHasRealContent(data.policies)) { score++; total++; }
      // Bonus: readiness levels actually set (not null)
      const rl = data.readinessLevels;
      if (rl && (rl.TRL?.level !== null || rl.SRL?.level !== null || rl.ORL?.level !== null || rl.LRL?.level !== null)) {
        score++; total++;
      }
      return total === 0 ? 0 : Math.round((score / total) * 100);
    }

    case 'generalObjectives':
    case 'specificObjectives': {
      // Array: count items with real title or description
      if (!Array.isArray(data) || data.length === 0) return 0;
      const filled = data.filter((item: any) =>
        hasRealString(item.title) || hasRealString(item.description)
      );
      return filled.length === 0 ? 0 : Math.round((filled.length / data.length) * 100);
    }

    case 'activities': {
      // Array of WPs: check if any WP has real title or tasks with real content
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
      // Array: count items with real title or description
      if (!Array.isArray(data) || data.length === 0) return 0;
      const filled = data.filter((item: any) =>
        hasRealString(item.title) || hasRealString(item.description)
      );
      return filled.length === 0 ? 0 : Math.round((filled.length / data.length) * 100);
    }

    case 'risks': {
      // Array: count risks with real title or description
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

export const extractStructuralData = (projectData: any): ExtractedChartData[] => {
  const results: ExtractedChartData[] = [];

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
          unit: 'level',
          category: 'readiness',
        });
      }
    }

    if (hasData && dataPoints.length >= 2) {
      results.push({
        id: 'structural-readiness-radar',
        chartType: 'radar',
        title: 'Readiness Levels',
        subtitle: 'TRL / SRL / ORL / LRL',
        dataPoints,
        textSnippet: 'Project readiness levels assessment',
        confidence: 1.0,
      });
    }
  }

  // 2. Risk Matrix Summary
  const risks = projectData?.risks;
  if (risks && Array.isArray(risks) && risks.length >= 2) {
    // Only process if risks have real content
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

      const catPoints: ExtractedDataPoint[] = Object.entries(categoryCounts)
        .filter(([, count]) => count > 0)
        .map(([cat, count]) => ({
          label: cat.charAt(0).toUpperCase() + cat.slice(1),
          value: count,
          unit: 'risks',
          category: 'risk_category',
        }));

      if (catPoints.length >= 2) {
        results.push({
          id: 'structural-risk-categories',
          chartType: 'donut',
          title: 'Risks by Category',
          dataPoints: catPoints,
          textSnippet: 'Project risk register distribution',
          confidence: 1.0,
        });
      }

      const severityPoints: ExtractedDataPoint[] = [
        { label: 'High Likelihood', value: likelihoodCounts.high || 0, category: 'likelihood' },
        { label: 'Medium Likelihood', value: likelihoodCounts.medium || 0, category: 'likelihood' },
        { label: 'Low Likelihood', value: likelihoodCounts.low || 0, category: 'likelihood' },
        { label: 'High Impact', value: impactCounts.high || 0, category: 'impact' },
        { label: 'Medium Impact', value: impactCounts.medium || 0, category: 'impact' },
        { label: 'Low Impact', value: impactCounts.low || 0, category: 'impact' },
      ].filter(p => p.value > 0);

      if (severityPoints.length >= 3) {
        results.push({
          id: 'structural-risk-severity',
          chartType: 'stacked_bar',
          title: 'Risk Severity Distribution',
          subtitle: 'Likelihood vs Impact',
          dataPoints: severityPoints,
          textSnippet: 'Risk likelihood and impact analysis',
          confidence: 1.0,
        });
      }
    }
  }

  // 3. Project Completeness (per section)
  // v1.1 FIX: Uses explicit per-section checks instead of generic field counting
  const sections = [
    { key: 'problemAnalysis', label: 'Problem Analysis' },
    { key: 'projectIdea', label: 'Project Idea' },
    { key: 'generalObjectives', label: 'General Obj.' },
    { key: 'specificObjectives', label: 'Specific Obj.' },
    { key: 'activities', label: 'Activities' },
    { key: 'outputs', label: 'Expected Results' },
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
      title: 'Project Completeness',
      subtitle: 'Section-by-section progress',
      dataPoints: completenessPoints,
      textSnippet: 'Project completion status overview',
      confidence: 1.0,
    });
  }

  return results;
};
