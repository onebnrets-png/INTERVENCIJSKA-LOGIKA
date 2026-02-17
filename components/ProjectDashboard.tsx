// components/ProjectDashboard.tsx
// v2.0 - 2026-02-17  Dark-mode: isDark + colors pattern
import React, { useState, useEffect, useMemo } from 'react';
import { extractStructuralData } from '../services/DataExtractionService.ts';
import ChartRenderer from './ChartRenderer.tsx';
import { lightColors, darkColors, shadows, radii, spacing, typography } from '../design/theme.ts';
import { getThemeMode, onThemeChange } from '../services/themeService.ts';
import { ProgressRing } from '../design/index.ts';

// --- Props ---
interface ProjectDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  projectData: any;
  language: 'en' | 'si';
}

// --- Section completeness calculator ---
const calculateOverallCompleteness = (projectData: any): number => {
  const sections = [
    'problemAnalysis', 'projectIdea', 'generalObjectives',
    'specificObjectives', 'activities', 'outputs',
  ];
  let totalScore = 0;
  const totalSections = sections.length;
  for (const key of sections) {
    const data = projectData?.[key];
    if (!data) continue;
    if (Array.isArray(data)) {
      if (data.length === 0) continue;
      const filled = data.filter((item: any) => {
        const hasTitle = item.title && item.title.trim().length > 0;
        const hasDesc = item.description && item.description.trim().length > 0;
        return hasTitle || hasDesc;
      });
      totalScore += filled.length / data.length;
    } else if (typeof data === 'object') {
      const values = Object.values(data);
      if (values.length === 0) continue;
      const filled = values.filter((v: any) => {
        if (typeof v === 'string') return v.trim().length > 0;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'object' && v !== null) {
          return Object.values(v).some((sv: any) =>
            typeof sv === 'string' ? sv.trim().length > 0 : sv !== null
          );
        }
        return false;
      });
      totalScore += filled.length / values.length;
    }
  }
  return Math.round((totalScore / totalSections) * 100);
};

// --- Component ---
const ProjectDashboard: React.FC<ProjectDashboardProps> = ({
  isOpen, onClose, projectData, language,
}) => {
  const [isDark, setIsDark] = useState(getThemeMode() === 'dark');
  useEffect(() => {
    const unsub = onThemeChange((m) => setIsDark(m === 'dark'));
    return unsub;
  }, []);
  const colors = isDark ? darkColors : lightColors;

  const t = language === 'si' ? {
    title: 'Pregled projekta',
    projectTitle: 'Naziv projekta',
    acronym: 'Akronim',
    duration: 'Trajanje',
    startDate: 'Začetek',
    months: 'mesecev',
    overallProgress: 'Skupni napredek',
    noData: 'Še ni podatkov za vizualizacijo.',
    close: 'Zapri',
    workPackages: 'Delovni sklopi',
    risks: 'Tveganja',
    objectives: 'Cilji',
  } : {
    title: 'Project Dashboard',
    projectTitle: 'Project Title',
    acronym: 'Acronym',
    duration: 'Duration',
    startDate: 'Start Date',
    months: 'months',
    overallProgress: 'Overall Progress',
    noData: 'No data available for visualization yet.',
    close: 'Close',
    workPackages: 'Work Packages',
    risks: 'Risks',
    objectives: 'Objectives',
  };

  const structuralCharts = useMemo(
    () => extractStructuralData(projectData),
    [projectData]
  );

  const overallCompleteness = useMemo(
    () => calculateOverallCompleteness(projectData),
    [projectData]
  );

  const pi = projectData?.projectIdea;
  const wpCount = projectData?.activities?.length || 0;
  const riskCount = projectData?.risks?.length || 0;
  const objCount = (projectData?.generalObjectives?.length || 0) + (projectData?.specificObjectives?.length || 0);

  if (!isOpen) return null;

  // Meta info card (inline)
  const MetaCard = ({ label, value, icon }: { label: string; value: string; icon?: string }) => (
    <div style={{
      backgroundColor: colors.surface.card,
      borderRadius: radii.lg,
      border: `1px solid ${colors.border.light}`,
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    }}>
      {icon && <span style={{ fontSize: '24px' }}>{icon}</span>}
      <div>
        <p style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
          {label}
        </p>
        <p style={{ fontSize: '16px', fontWeight: 700, color: colors.text.heading, margin: '2px 0 0' }}>
          {value || '\u2014'}
        </p>
      </div>
    </div>
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backgroundColor: colors.surface.overlayBlur,
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          backgroundColor: colors.surface.background,
          borderRadius: radii.xl,
          boxShadow: shadows.xl,
          width: '100%',
          maxWidth: '1100px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: `1px solid ${colors.border.light}`,
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: `1px solid ${colors.border.light}`,
          backgroundColor: colors.surface.card,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: colors.text.heading }}>
              {t.title}
            </h2>
            <ProgressRing
              value={overallCompleteness}
              size={48}
              strokeWidth={5}
              color={overallCompleteness >= 80 ? colors.success[500] : overallCompleteness >= 40 ? colors.warning[500] : colors.error[500]}
              label={`${overallCompleteness}%`}
            />
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: radii.md,
              color: colors.text.muted,
              fontSize: '20px',
              lineHeight: 1,
            }}
            onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.backgroundColor = colors.surface.sidebar; }}
            onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
          >
            \u2715
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* Meta cards row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            <MetaCard label={t.projectTitle} value={pi?.projectTitle || ''} icon="\uD83D\uDCCB" />
            <MetaCard label={t.acronym} value={pi?.projectAcronym || ''} icon="\uD83C\uDFF7\uFE0F" />
            <MetaCard label={t.duration} value={pi?.durationMonths ? `${pi.durationMonths} ${t.months}` : ''} icon="\uD83D\uDCC5" />
            <MetaCard label={t.startDate} value={pi?.startDate || ''} icon="\uD83D\uDE80" />
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
            <MetaCard label={t.workPackages} value={String(wpCount)} icon="\uD83D\uDCE6" />
            <MetaCard label={t.risks} value={String(riskCount)} icon="\u26A0\uFE0F" />
            <MetaCard label={t.objectives} value={String(objCount)} icon="\uD83C\uDFAF" />
          </div>

          {/* Charts */}
          {structuralCharts.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '16px' }}>
              {structuralCharts.map(chart => (
                <ChartRenderer
                  key={chart.id}
                  data={chart}
                  height={280}
                  showTitle={true}
                  showSource={false}
                />
              ))}
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: colors.text.muted,
              fontSize: '14px',
            }}>
              {t.noData}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: `1px solid ${colors.border.light}`,
          backgroundColor: colors.surface.card,
          display: 'flex',
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              fontSize: '14px',
              fontWeight: 600,
              color: colors.text.body,
              backgroundColor: colors.surface.sidebar,
              border: `1px solid ${colors.border.light}`,
              borderRadius: radii.md,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.backgroundColor = colors.border.light; }}
            onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.backgroundColor = colors.surface.sidebar; }}
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectDashboard;
