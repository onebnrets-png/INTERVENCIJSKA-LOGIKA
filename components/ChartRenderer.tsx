// components/ChartRenderer.tsx
// v1.3 — 2026-02-18 — FIX: Donut size back to 30/48, label lines SHORTER (8px)
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

const CHART_COLORS = [
  theme.colors.primary[500],
  theme.colors.secondary[500],
  theme.colors.success[500],
  theme.colors.warning[500],
  theme.colors.error[500],
  theme.colors.primary[300],
  theme.colors.secondary[300],
  theme.colors.success[300],
];

interface ChartRendererProps {
  data: ExtractedChartData;
  width?: number;
  height?: number;
  showTitle?: boolean;
  showSource?: boolean;
  className?: string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ backgroundColor: 'white', border: `1px solid ${theme.colors.border.light}`, borderRadius: theme.radii.md, padding: '8px 12px', boxShadow: theme.shadows.md, fontSize: '13px' }}>
      <p style={{ margin: 0, fontWeight: 600, color: theme.colors.text.heading }}>{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ margin: '2px 0 0', color: entry.color || theme.colors.text.body }}>{entry.name || 'Value'}: {entry.value}{entry.payload?.unit || ''}</p>
      ))}
    </div>
  );
};

/* ─── COMPARISON BAR ──────────────────────────────────────── */

const ComparisonBar: React.FC<{ data: ExtractedChartData; height: number }> = ({ data, height }) => {
  const chartData = data.dataPoints.map(dp => ({ name: dp.label, value: dp.value, unit: dp.unit || '' }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.border.light} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: theme.colors.text.body }} tickLine={false} />
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

/* ─── DONUT — v1.3: radii 30/48 (as before), SHORT label lines ── */

const DonutChart: React.FC<{ data: ExtractedChartData; height: number }> = ({ data, height }) => {
  const chartData = data.dataPoints.map(dp => ({ name: dp.label, value: dp.value, unit: dp.unit || '' }));
  const isSmall = height <= 180;

  // Original size — unchanged from v1.1
  const innerRadius = isSmall ? Math.min(height * 0.18, 30) : Math.min(height * 0.25, 60);
  const outerRadius = isSmall ? Math.min(height * 0.30, 48) : Math.min(height * 0.38, 90);

  const labelFontSize = isSmall ? 9 : 12;

  // Custom label: positioned only 8px from donut edge = SHORT arrows
  const renderLabel = ({ name, percent, midAngle, outerRadius: oR, cx, cy }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = oR + (isSmall ? 8 : 14);
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    const textAnchor = x > cx ? 'start' : 'end';
    const displayText = isSmall
      ? `${(percent * 100).toFixed(0)}%`
      : `${name} (${(percent * 100).toFixed(0)}%)`;
    return (
      <text
        x={x} y={y}
        fill={theme.colors.text.body}
        textAnchor={textAnchor}
        dominantBaseline="central"
        fontSize={labelFontSize}
        fontWeight={600}
      >
        {displayText}
      </text>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart margin={{ top: 4, right: 4, bottom: 2, left: 4 }}>
        <Pie
          data={chartData}
          cx="50%"
          cy={isSmall ? '42%' : '50%'}
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          paddingAngle={2}
          dataKey="value"
          label={renderLabel}
          labelLine={isSmall
            ? { strokeWidth: 1, stroke: theme.colors.border.medium, type: 'straight' as any }
            : { strokeWidth: 1 }
          }
        >
          {chartData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{
            fontSize: isSmall ? '9px' : '11px',
            lineHeight: isSmall ? '14px' : '18px',
          }}
          iconType="circle"
          iconSize={isSmall ? 6 : 8}
        />
      </PieChart>
    </ResponsiveContainer>
  );
};

/* ─── LINE CHART ──────────────────────────────────────────── */

const LineChartComponent: React.FC<{ data: ExtractedChartData; height: number }> = ({ data, height }) => {
  const chartData = data.dataPoints.sort((a, b) => (a.year || 0) - (b.year || 0)).map(dp => ({ name: dp.year ? String(dp.year) : dp.label, value: dp.value, unit: dp.unit || '' }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.border.light} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: theme.colors.text.body }} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: theme.colors.text.body }} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Line type="monotone" dataKey="value" stroke={theme.colors.primary[500]} strokeWidth={2} dot={{ fill: theme.colors.primary[500], r: 4 }} activeDot={{ r: 6, fill: theme.colors.primary[600] }} />
      </LineChart>
    </ResponsiveContainer>
  );
};

/* ─── RADAR CHART ─────────────────────────────────────────── */

const RadarChartComponent: React.FC<{ data: ExtractedChartData; height: number }> = ({ data, height }) => {
  const chartData = data.dataPoints.map(dp => ({ subject: dp.label, value: dp.value, fullMark: 9 }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid stroke={theme.colors.border.light} />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: theme.colors.text.body, fontWeight: 600 }} />
        <PolarRadiusAxis angle={90} domain={[0, 9]} tick={{ fontSize: 10, fill: theme.colors.text.muted }} />
        <Radar name="Level" dataKey="value" stroke={theme.colors.primary[500]} fill={theme.colors.primary[500]} fillOpacity={0.25} strokeWidth={2} />
        <Tooltip content={<CustomTooltip />} />
      </RadarChart>
    </ResponsiveContainer>
  );
};

/* ─── GAUGE CHART ─────────────────────────────────────────── */

const GaugeChart: React.FC<{ data: ExtractedChartData; height: number }> = ({ data, height }) => {
  const value = data.dataPoints[0]?.value || 0;
  const maxVal = data.dataPoints[0]?.unit === '%' ? 100 : Math.max(value * 1.5, 10);
  const percentage = Math.min((value / maxVal) * 100, 100);
  const gaugeData = [{ name: 'value', value: percentage }, { name: 'remaining', value: 100 - percentage }];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={gaugeData} startAngle={180} endAngle={0} cx="50%" cy="75%" innerRadius={height * 0.3} outerRadius={height * 0.45} dataKey="value" stroke="none">
          <Cell fill={theme.colors.primary[500]} />
          <Cell fill={theme.colors.surface.sidebar} />
        </Pie>
        <text x="50%" y="65%" textAnchor="middle" style={{ fontSize: '24px', fontWeight: 700, fill: theme.colors.text.heading }}>{value}{data.dataPoints[0]?.unit || ''}</text>
        <text x="50%" y="80%" textAnchor="middle" style={{ fontSize: '12px', fill: theme.colors.text.muted }}>{data.dataPoints[0]?.label || ''}</text>
      </PieChart>
    </ResponsiveContainer>
  );
};

/* ─── STACKED BAR ─────────────────────────────────────────── */

const StackedBarChart: React.FC<{ data: ExtractedChartData; height: number }> = ({ data, height }) => {
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
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: theme.colors.text.body }} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: theme.colors.text.body }} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: '11px' }} />
        {categories.map((cat, i) => (
          <Bar key={cat} dataKey={cat} stackId="stack" fill={CHART_COLORS[i % CHART_COLORS.length]} radius={i === categories.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

/* ─── PROGRESS ────────────────────────────────────────────── */

const ProgressChart: React.FC<{ data: ExtractedChartData; height: number }> = ({ data, height }) => {
  return (
    <div style={{ height, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px', padding: '8px 0' }}>
      {data.dataPoints.map((dp, i) => {
        const pct = dp.unit === '%' ? dp.value : Math.min((dp.value / 9) * 100, 100);
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ minWidth: '100px', fontSize: '12px', fontWeight: 500, color: theme.colors.text.body, textAlign: 'right' }}>{dp.label}</span>
            <div style={{ flex: 1, height: '16px', backgroundColor: theme.colors.surface.sidebar, borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${CHART_COLORS[i % CHART_COLORS.length]}, ${CHART_COLORS[(i + 1) % CHART_COLORS.length]})`, borderRadius: '8px', transition: 'width 0.8s ease-out' }} />
            </div>
            <span style={{ minWidth: '45px', fontSize: '12px', fontWeight: 600, color: theme.colors.text.heading }}>{dp.value}{dp.unit || ''}</span>
          </div>
        );
      })}
    </div>
  );
};

/* ─── UNSUPPORTED ─────────────────────────────────────────── */

const UnsupportedChart: React.FC<{ data: ExtractedChartData; height: number }> = ({ data, height }) => (
  <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface.background, borderRadius: theme.radii.md, border: `1px dashed ${theme.colors.border.medium}`, color: theme.colors.text.muted, fontSize: '13px' }}>
    Chart type &quot;{data.chartType}&quot; — coming soon
  </div>
);

/* ─── COMPONENT MAP ───────────────────────────────────────── */

const CHART_COMPONENTS: Record<string, React.FC<{ data: ExtractedChartData; height: number }>> = {
  comparison_bar: ComparisonBar,
  donut: DonutChart,
  line: LineChartComponent,
  radar: RadarChartComponent,
  gauge: GaugeChart,
  stacked_bar: StackedBarChart,
  progress: ProgressChart,
};

/* ─── MAIN RENDERER ───────────────────────────────────────── */

const ChartRenderer: React.FC<ChartRendererProps> = ({ data, width, height = 250, showTitle = true, showSource = true, className = '' }) => {
  const ChartComponent = useMemo(() => CHART_COMPONENTS[data.chartType] || UnsupportedChart, [data.chartType]);
  return (
    <div className={className} style={{ width: width || '100%', backgroundColor: 'white', borderRadius: theme.radii.lg, border: `1px solid ${theme.colors.border.light}`, padding: '16px', boxShadow: theme.shadows.sm }}>
      {showTitle && (
        <div style={{ marginBottom: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: theme.colors.text.heading }}>{data.title}</h4>
          {data.subtitle && (<p style={{ margin: '2px 0 0', fontSize: '12px', color: theme.colors.text.muted }}>{data.subtitle}</p>)}
        </div>
      )}
      <ChartComponent data={data} height={height} />
      {showSource && data.source && (<p style={{ margin: '8px 0 0', fontSize: '10px', color: theme.colors.text.muted, fontStyle: 'italic' }}>Source: {data.source}</p>)}
    </div>
  );
};

export default ChartRenderer;
