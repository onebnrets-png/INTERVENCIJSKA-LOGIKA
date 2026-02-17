// services/ChartTypeResolver.ts
// ═══════════════════════════════════════════════════════════════
// Rule-based chart type resolver. Takes AI-suggested chart type
// and extracted data characteristics, and determines the optimal
// visualization type.
//
// v1.0 — 2026-02-17
//
// RULES:
//   - AI suggestion is a HINT, not final — this service overrides
//     when data characteristics don't match the suggested type.
//   - 2 data points → comparison_bar or gauge
//   - 3-6 data points → comparison_bar, donut, or radar
//   - Time series (year field) → line
//   - Single value with total → gauge or progress
//   - Categories present → stacked_bar
//   - All values sum to ~100 → donut
// ═══════════════════════════════════════════════════════════════

import type { ExtractedChartData, ChartType, ExtractedDataPoint } from './DataExtractionService.ts';

// ─── Resolution rules ────────────────────────────────────────

interface ResolutionContext {
  dataPointCount: number;
  hasYears: boolean;
  hasCategories: boolean;
  allPercentages: boolean;
  sumApprox100: boolean;
  hasSingleValue: boolean;
  maxValue: number;
  minValue: number;
  suggested: ChartType;
}

const buildContext = (chart: ExtractedChartData): ResolutionContext => {
  const dps = chart.dataPoints;
  const count = dps.length;
  const hasYears = dps.some(dp => dp.year !== undefined && dp.year !== null);
  const hasCategories = dps.some(dp => dp.category !== undefined && dp.category !== null);
  const allPercentages = dps.every(dp => dp.unit === '%' || dp.unit === 'percent');
  const sum = dps.reduce((acc, dp) => acc + dp.value, 0);
  const sumApprox100 = allPercentages && sum >= 90 && sum <= 110;
  const values = dps.map(dp => dp.value);

  return {
    dataPointCount: count,
    hasYears,
    hasCategories,
    allPercentages,
    sumApprox100,
    hasSingleValue: count === 1,
    maxValue: Math.max(...values),
    minValue: Math.min(...values),
    suggested: chart.chartType,
  };
};

// ─── Resolution logic ────────────────────────────────────────

export const resolveChartType = (chart: ExtractedChartData): ChartType => {
  const ctx = buildContext(chart);

  // Single value → gauge
  if (ctx.hasSingleValue) {
    return 'gauge';
  }

  // Time series data → line chart
  if (ctx.hasYears && ctx.dataPointCount >= 3) {
    return 'line';
  }

  // Values sum to ~100% → donut (distribution)
  if (ctx.sumApprox100 && ctx.dataPointCount >= 3 && ctx.dataPointCount <= 8) {
    return 'donut';
  }

  // Categories with multiple groups → stacked_bar
  if (ctx.hasCategories) {
    const uniqueCategories = new Set(chart.dataPoints.map(dp => dp.category)).size;
    if (uniqueCategories >= 2 && ctx.dataPointCount >= 4) {
      return 'stacked_bar';
    }
  }

  // Radar: 3-8 dimensions, especially for readiness/scores
  if (ctx.suggested === 'radar' && ctx.dataPointCount >= 3 && ctx.dataPointCount <= 8) {
    return 'radar';
  }

  // 2 data points comparison → comparison_bar
  if (ctx.dataPointCount === 2) {
    return 'comparison_bar';
  }

  // 3-8 data points → comparison_bar (default best for most comparisons)
  if (ctx.dataPointCount >= 3 && ctx.dataPointCount <= 8) {
    // If AI suggested donut and data fits → keep donut
    if (ctx.suggested === 'donut' && ctx.allPercentages) {
      return 'donut';
    }
    return 'comparison_bar';
  }

  // Progress: single metric against a known max
  if (ctx.suggested === 'progress') {
    return 'progress';
  }

  // Fallback: trust AI suggestion if it's valid
  const validTypes: ChartType[] = [
    'comparison_bar', 'donut', 'line', 'radar',
    'heatmap', 'gauge', 'stacked_bar', 'progress', 'sankey'
  ];

  if (validTypes.includes(ctx.suggested)) {
    return ctx.suggested;
  }

  // Ultimate fallback
  return 'comparison_bar';
};

// ─── Resolve all charts in a batch ───────────────────────────

export const resolveAllChartTypes = (charts: ExtractedChartData[]): ExtractedChartData[] => {
  return charts.map(chart => ({
    ...chart,
    chartType: resolveChartType(chart),
  }));
};

// ─── Utility: Check if chart type is supported for rendering ─

export const isSupportedChartType = (type: string): type is ChartType => {
  const supported: string[] = [
    'comparison_bar', 'donut', 'line', 'radar',
    'heatmap', 'gauge', 'stacked_bar', 'progress', 'sankey'
  ];
  return supported.includes(type);
};
