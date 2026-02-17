// components/ProjectDashboard.tsx
// ═══════════════════════════════════════════════════════════════
// Project Dashboard — overview with structural visualizations.
// Shows: Readiness Radar, Risk Categories, Completeness Bars,
//        Risk Severity, and project meta info.
//
// v1.0 — 2026-02-17
//
// USAGE: Opened from toolbar Dashboard button in App.tsx.
//   <ProjectDashboard
//     isOpen={isDashboardOpen}
//     onClose={() => setIsDashboardOpen(false)}
//     projectData={pm.projectData}
//     language={language}
//   />
// ═══════════════════════════════════════════════════════════════

import React, { useMemo } from 'react';
import { extractStructuralData } from '../services/DataExtractionService.ts';
import ChartRenderer from './ChartRenderer.tsx';
import { theme } from '../design/theme.ts';
import { ProgressRing } from '../design/index.ts';

// ─── Props ───────────────────────────────────────────────────

interface ProjectDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  projectData: any;
  language: 'en' | 'si';
}

// ─── Section completeness calculator ─────────────────────────

const calculateOverallCompleteness = (projectData: any): number => {
  const sections = [
    'problemAnalysis', 'projectIdea', 'generalObjectives',
    'specificObjectives', 'activities', 'outputs',
  ];

  let totalScore = 0;
  let totalSections = sections.length;

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

// ─── Meta info card ──────────────────────────────────────────

const MetaCard: React.FC<{ label: string; value: string; icon?: string }> = ({ label, value, icon }) => (
  <div style={{
    backgroundColor: 'white',
    borderRadius: theme.radii.lg,
    border: `1px solid ${theme.colors.border.light}`,
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  }}>
    {icon && <span style={{ fontSize: '24px' }}>{icon}</span>}
    <div>
      <p style={{ fontSize: '11px', fontWeight: 600, color: theme.colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
        {label}
      </p>
      <p style={{ fontSize: '16px', fontWeight: 700, color: theme.colors.text.heading, margin: '2px 0 0' }}>
        {value || '—'}
      </p>
    </div>
  </div>
);

// ─── Component ───────────────────────────────────────────────

const ProjectDashboard: React.FC<ProjectDashboardProps> = ({
  isOpen,
  onClose,
  projectData,
  language,
}) => {
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
        backgroundColor: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          backgroundColor: theme.colors.surface.background,
          borderRadius: theme.radii.xl,
          boxShadow: theme.shadows.xl,
          width: '100%',
          maxWidth: '1100px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: `1px solid ${theme.colors.border.light}`,
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: `1px solid ${theme.colors.border.light}`,
          backgroundColor: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: theme.colors.text.heading }}>
              {t.title}
            </h2>
            <ProgressRing
              value={overallCompleteness}
              size={48}
              strokeWidth={5}
              color={overallCompleteness >= 80 ? theme.colors.success[500] : overallCompleteness >= 40 ? theme.colors.warning[500] : theme.colors.error[500]}
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
              borderRadius: theme.radii.md,
              color: theme.colors.text.muted,
              fontSize: '20px',
              lineHeight: 1,
            }}
            onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.backgroundColor = theme.colors.surface.sidebar; }}
            onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* Meta cards row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            <MetaCard label={t.projectTitle} value={pi?.projectTitle || ''} icon="📋" />
            <MetaCard label={t.acronym} value={pi?.projectAcronym || ''} icon="🏷️" />
            <MetaCard label={t.duration} value={pi?.durationMonths ? `${pi.durationMonths} ${t.months}` : ''} icon="📅" />
            <MetaCard label={t.startDate} value={pi?.startDate || ''} icon="🚀" />
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
            <MetaCard label={t.workPackages} value={String(wpCount)} icon="📦" />
            <MetaCard label={t.risks} value={String(riskCount)} icon="⚠️" />
            <MetaCard label={t.objectives} value={String(objCount)} icon="🎯" />
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
              color: theme.colors.text.muted,
              fontSize: '14px',
            }}>
              {t.noData}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: `1px solid ${theme.colors.border.light}`,
          backgroundColor: 'white',
          display: 'flex',
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              fontSize: '14px',
              fontWeight: 600,
              color: theme.colors.text.body,
              backgroundColor: theme.colors.surface.sidebar,
              border: `1px solid ${theme.colors.border.light}`,
              borderRadius: theme.radii.md,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.backgroundColor = theme.colors.border.light; }}
            onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.backgroundColor = theme.colors.surface.sidebar; }}
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectDashboard;
