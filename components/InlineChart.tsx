// components/InlineChart.tsx
// ═══════════════════════════════════════════════════════════════
// Inline chart component — sits next to text fields and displays
// automatically extracted empirical data visualizations.
//
// v1.0 — 2026-02-17
//
// USAGE:
//   <InlineChart
//     text={fieldValue}
//     fieldContext="stateOfTheArt"
//     language={language}
//   />
//
// The component automatically:
//   1. Extracts empirical data from the text (via DataExtractionService)
//   2. Resolves optimal chart types (via ChartTypeResolver)
//   3. Renders charts (via ChartRenderer)
//   4. Shows/hides with a toggle button
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { extractEmpiricalData, type ExtractedChartData } from '../services/DataExtractionService.ts';
import { resolveAllChartTypes } from '../services/ChartTypeResolver.ts';
import ChartRenderer from './ChartRenderer.tsx';
import { theme } from '../design/theme.ts';

// ─── Props ───────────────────────────────────────────────────

interface InlineChartProps {
  text: string;
  fieldContext?: string;
  language?: 'en' | 'si';
  minTextLength?: number;
  maxCharts?: number;
}

// ─── Chart icon SVG ──────────────────────────────────────────

const ChartIcon: React.FC<{ size?: number; color?: string }> = ({ size = 16, color }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="8" width="3" height="7" rx="0.5" fill={color || theme.colors.secondary[500]} opacity="0.8" />
    <rect x="5.5" y="4" width="3" height="11" rx="0.5" fill={color || theme.colors.primary[500]} opacity="0.8" />
    <rect x="10" y="1" width="3" height="14" rx="0.5" fill={color || theme.colors.success[500]} opacity="0.8" />
  </svg>
);

// ─── Component ───────────────────────────────────────────────

const InlineChart: React.FC<InlineChartProps> = ({
  text,
  fieldContext,
  language = 'en',
  minTextLength = 50,
  maxCharts = 3,
}) => {
  const [charts, setCharts] = useState<ExtractedChartData[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasExtracted, setHasExtracted] = useState(false);
  const lastTextRef = useRef<string>('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Extract data on text change (debounced) ─────────────

  const doExtraction = useCallback(async (currentText: string) => {
    if (currentText.length < minTextLength) {
      setCharts([]);
      setHasExtracted(false);
      return;
    }

    setIsLoading(true);
    try {
      const extracted = await extractEmpiricalData(currentText, fieldContext);
      const resolved = resolveAllChartTypes(extracted);
      const limited = resolved.slice(0, maxCharts);
      setCharts(limited);
      setHasExtracted(true);
    } catch (err) {
      console.warn('[InlineChart] Extraction failed:', err);
      setCharts([]);
    } finally {
      setIsLoading(false);
    }
  }, [fieldContext, minTextLength, maxCharts]);

  useEffect(() => {
    // Only re-extract if text actually changed significantly
    if (text === lastTextRef.current) return;

    // Check if change is meaningful (>20 chars difference)
    const lengthDiff = Math.abs(text.length - lastTextRef.current.length);
    if (hasExtracted && lengthDiff < 20) return;

    lastTextRef.current = text;

    // Debounce: wait 2s after last change
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doExtraction(text);
    }, 2000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [text, doExtraction, hasExtracted]);

  // ─── Render nothing if no charts ─────────────────────────

  if (!hasExtracted && !isLoading) return null;
  if (hasExtracted && charts.length === 0 && !isLoading) return null;

  // ─── Toggle button ────────────────────────────────────────

  const buttonLabel = language === 'si'
    ? `${isExpanded ? 'Skrij' : 'Prikaži'} vizualizacije (${charts.length})`
    : `${isExpanded ? 'Hide' : 'Show'} visualizations (${charts.length})`;

  return (
    <div style={{ marginTop: '8px' }}>
      {/* Toggle button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        disabled={isLoading}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          fontSize: '12px',
          fontWeight: 500,
          color: isLoading ? theme.colors.text.muted : theme.colors.secondary[600],
          backgroundColor: isLoading ? theme.colors.surface.background : theme.colors.secondary[50],
          border: `1px solid ${isLoading ? theme.colors.border.light : theme.colors.secondary[200]}`,
          borderRadius: theme.radii.full,
          cursor: isLoading ? 'wait' : 'pointer',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          if (!isLoading) {
            (e.target as HTMLButtonElement).style.backgroundColor = theme.colors.secondary[100];
          }
        }}
        onMouseLeave={(e) => {
          if (!isLoading) {
            (e.target as HTMLButtonElement).style.backgroundColor = theme.colors.secondary[50];
          }
        }}
      >
        {isLoading ? (
          <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>&#x27F3;</span>
        ) : (
          <ChartIcon size={14} />
        )}
        {isLoading
          ? (language === 'si' ? 'Analiziram podatke...' : 'Analyzing data...')
          : buttonLabel
        }
      </button>

      {/* Charts panel */}
      {isExpanded && charts.length > 0 && (
        <div style={{
          marginTop: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          animation: 'fadeIn 0.3s ease-out',
        }}>
          {charts.map(chart => (
            <ChartRenderer
              key={chart.id}
              data={chart}
              height={220}
              showTitle={true}
              showSource={true}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default InlineChart;
