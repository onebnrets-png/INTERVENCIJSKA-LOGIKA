// components/ChartRenderer.tsx
// ═══════════════════════════════════════════════════════════════
// Universal chart renderer using Recharts.
// Renders ExtractedChartData into the appropriate chart type.
//
// v1.0 — 2026-02-17
//
// Supported types: comparison_bar, donut, line, radar,
//   gauge, stacked_bar, progress
// Not yet implemented: heatmap, sankey (placeholder)
// ═══════════════════════════════════════════════════════════════

import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
  LineChart, Line,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';
import { theme } from '../design/theme.ts';
import type { ExtractedChartData } from '../services/DataExtractionService.ts';

// ─── Color palette ───────────────────────────────────────────

const CHART_COLORS = [
  theme.colors.primary[500],    // indigo
  theme.colors.secondary[500],  // cyan
  theme.colors.success[500],    // emerald
  theme.colors.warning[500],    // amber
  theme.colors.error[500],      // red
  theme.colors.primary[300],    // light indigo
  theme.colors.secondary[300],  // light cyan
  theme.colors.success[300],    // light emerald
];

// ─── Props ───────────────────────────────────────────────────

interface ChartRendererProps {
  data: ExtractedChartData;
  width?: number;
  height?: number;
  showTitle?: boolean;
  showSource?: boolean;
  className?: string;
}

// ─── Custom tooltip ──────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <div style={{
      backgroundColor: 'white',
      border: `1px solid ${theme.colors.border.light}`,
      borderRadius: theme.radii.md,
      padding: '8px 12px',
      boxShadow: theme.shadows.md,
      fontSize: '13px',
    }}>
      <p style={{ margin: 0, fontWeight: 600, color: theme.colors.text.heading }}>
        {label}
      </p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ margin: '2px 0 0', color: entry.color || theme.colors.text.body }}>
          {entry.name || 'Value'}: {entry.value}{entry.payload?.unit || ''}
        </p>
      ))}
    </div>
  );
};

// ─── Chart renderers ─────────────────────────────────────────

const ComparisonBar: React.FC<{ data: ExtractedChartData; height: number }> = ({ data, height }) => {
  const chartData = data.dataPoints.map(dp => ({
    name: dp.label,
    value: dp.value,
    unit: dp.unit || '',
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.border.light} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: theme.colors.text.body }}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 11, fill: theme.colors.text.body }} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {chartData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

const DonutChart: React.FC<{ data: ExtractedChartData; height: number }> = ({ data, height }) => {
  const chartData = data.dataPoints.map(dp => ({
    name: dp.label,
    value: dp.value,
    unit: dp.unit || '',
  }));

  const innerRadius = Math.min(height * 0.25, 60);
  const outerRadius = Math.min(height * 0.38, 90);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          paddingAngle={2}
          dataKey="value"
          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
          labelLine={{ strokeWidth: 1 }}
        >
          {chartData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: '11px' }}
          iconType="circle"
          iconSize={8}
        />
      </PieChart>
    </ResponsiveContainer>
  );
};

const LineChartComponent: React.FC<{ data: ExtractedChartData; height: number }> = ({ data, height }) => {
  const chartData = data.dataPoints
    .sort((a, b) => (a.year || 0) - (b.year || 0))
    .map(dp => ({
      name: dp.year ? String(dp.year) : dp.label,
      value: dp.value,
      unit: dp.unit || '',
    }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.border.light} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: theme.colors.text.body }}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 11, fill: theme.colors.text.body }} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="value"
          stroke={theme.colors.primary[500]}
          strokeWidth={2}
          dot={{ fill: theme.colors.primary[500], r: 4 }}
          activeDot={{ r: 6, fill: theme.colors.primary[600] }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

const RadarChartComponent: React.FC<{ data: ExtractedChartData; height: number }> = ({ data, height }) => {
  const chartData = data.dataPoints.map(dp => ({
    subject: dp.label,
    value: dp.value,
    fullMark: 9, // max readiness level
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid stroke={theme.colors.border.light} />
        <PolarAngleAxis
          dataKey="subject"
          tick={{ fontSize: 12, fill: theme.colors.text.body, fontWeight: 600 }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 9]}
          tick={{ fontSize: 10, fill: theme.colors.text.muted }}
        />
        <Radar
          name="Level"
          dataKey="value"
          stroke={theme.colors.primary[500]}
          fill={theme.colors.primary[500]}
          fillOpacity={0.25}
          strokeWidth={2}
        />
        <Tooltip content={<CustomTooltip />} />
      </RadarChart>
    </ResponsiveContainer>
  );
};

const GaugeChart: React.FC<{ data: ExtractedChartData; height: number }> = ({ data, height }) => {
  const value = data.dataPoints[0]?.value || 0;
  const maxVal = data.dataPoints[0]?.unit === '%' ? 100 : Math.max(value * 1.5, 10);
  const percentage = Math.min((value / maxVal) * 100, 100);

  const gaugeData = [
    { name: 'value', value: percentage },
    { name: 'remaining', value: 100 - percentage },
  ];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={gaugeData}
          startAngle={180}
          endAngle={0}
          cx="50%"
          cy="75%"
          innerRadius={height * 0.3}
          outerRadius={height * 0.45}
          dataKey="value"
          stroke="none"
        >
          <Cell fill={theme.colors.primary[500]} />
          <Cell fill={theme.colors.surface.sidebar} />
        </Pie>
        <text
          x="50%"
          y="65%"
          textAnchor="middle"
          style={{ fontSize: '24px', fontWeight: 700, fill: theme.colors.text.heading }}
        >
          {value}{data.dataPoints[0]?.unit || ''}
        </text>
        <text
          x="50%"
          y="80%"
          textAnchor="middle"
          style={{ fontSize: '12px', fill: theme.colors.text.muted }}
        >
          {data.dataPoints[0]?.label || ''}
        </text>
      </PieChart>
    </ResponsiveContainer>
  );
};

const StackedBarChart: React.FC<{ data: ExtractedChartData; height: number }> = ({ data, height }) => {
  // Group by category
  const categories: string[] = Array.from(new Set(data.dataPoints.map(dp => dp.category || 'default')));
  const labels: string[] = Array.from(new Set(data.dataPoints.map(dp => dp.label)));

  const chartData = labels.map(label => {
    const row: any = { name: label };
    categories.forEach(cat => {
      const dp = data.dataPoints.find(d => d.label === label && (d.category || 'default') === cat);
      row[cat] = dp?.value || 0;
    });
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.border.light} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: theme.colors.text.body }}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 11, fill: theme.colors.text.body }} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: '11px' }} />
        {categories.map((cat, i) => (
          <Bar
            key={cat}
            dataKey={cat}
            stackId="stack"
            fill={CHART_COLORS[i % CHART_COLORS.length]}
            radius={i === categories.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

const ProgressChart: React.FC<{ data: ExtractedChartData; height: number }> = ({ data, height }) => {
  return (
    <div style={{ height, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px', padding: '8px 0' }}>
      {data.dataPoints.map((dp, i) => {
        const pct = dp.unit === '%' ? dp.value : Math.min((dp.value / 9) * 100, 100);
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              minWidth: '100px',
              fontSize: '12px',
              fontWeight: 500,
              color: theme.colors.text.body,
              textAlign: 'right',
            }}>
              {dp.label}
            </span>
            <div style={{
              flex: 1,
              height: '16px',
              backgroundColor: theme.colors.surface.sidebar,
              borderRadius: '8px',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${pct}%`,
                height: '100%',
                background: `linear-gradient(90deg, ${CHART_COLORS[i % CHART_COLORS.length]}, ${CHART_COLORS[(i + 1) % CHART_COLORS.length]})`,
                borderRadius: '8px',
                transition: 'width 0.8s ease-out',
              }} />
            </div>
            <span style={{
              minWidth: '45px',
              fontSize: '12px',
              fontWeight: 600,
              color: theme.colors.text.heading,
            }}>
              {dp.value}{dp.unit || ''}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ─── Unsupported placeholder ─────────────────────────────────

const UnsupportedChart: React.FC<{ data: ExtractedChartData; height: number }> = ({ data, height }) => (
  <div style={{
    height,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface.background,
    borderRadius: theme.radii.md,
    border: `1px dashed ${theme.colors.border.medium}`,
    color: theme.colors.text.muted,
    fontSize: '13px',
  }}>
    Chart type "{data.chartType}" — coming soon
  </div>
);

// ─── Main renderer ───────────────────────────────────────────

const CHART_COMPONENTS: Record<string, React.FC<{ data: ExtractedChartData; height: number }>> = {
  comparison_bar: ComparisonBar,
  donut: DonutChart,
  line: LineChartComponent,
  radar: RadarChartComponent,
  gauge: GaugeChart,
  stacked_bar: StackedBarChart,
  progress: ProgressChart,
};

const ChartRenderer: React.FC<ChartRendererProps> = ({
  data,
  width,
  height = 250,
  showTitle = true,
  showSource = true,
  className = '',
}) => {
  const ChartComponent = useMemo(
    () => CHART_COMPONENTS[data.chartType] || UnsupportedChart,
    [data.chartType]
  );

  return (
    <div
      className={className}
      style={{
        width: width || '100%',
        backgroundColor: 'white',
        borderRadius: theme.radii.lg,
        border: `1px solid ${theme.colors.border.light}`,
        padding: '16px',
        boxShadow: theme.shadows.sm,
      }}
    >
      {showTitle && (
        <div style={{ marginBottom: '12px' }}>
          <h4 style={{
            margin: 0,
            fontSize: '14px',
            fontWeight: 600,
            color: theme.colors.text.heading,
          }}>
            {data.title}
          </h4>
          {data.subtitle && (
            <p style={{
              margin: '2px 0 0',
              fontSize: '12px',
              color: theme.colors.text.muted,
            }}>
              {data.subtitle}
            </p>
          )}
        </div>
      )}

      <ChartComponent data={data} height={height} />

      {showSource && data.source && (
        <p style={{
          margin: '8px 0 0',
          fontSize: '10px',
          color: theme.colors.text.muted,
          fontStyle: 'italic',
        }}>
          Source: {data.source}
        </p>
      )}
    </div>
  );
};

export default ChartRenderer;
