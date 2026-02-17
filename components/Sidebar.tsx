// components/Sidebar.tsx
// ═══════════════════════════════════════════════════════════════
// EURO-OFFICE Sidebar — Design System Edition
// v1.2 — 2026-02-17
//   - NEW: Dark mode toggle button (sun/moon icon) in footer
//   - NEW: Dynamic sidebar background via isDark + darkColors
//   - NEW: themeService integration (getThemeMode, toggleTheme, onThemeChange)
//   - FIX: JS-based isDesktop (matchMedia 1024px) replaces Tailwind lg: breakpoint
//          so sidebar is always visible on desktop without relying on CSS classes
//
// FEATURES:
//   - Gradient background with design system tokens
//   - ProgressRing per step (completion %)
//   - Collapsible icon-only mode (~60px)
//   - Step colors from theme.stepColors
//   - Smooth expand/collapse animation
//   - Sub-steps with step accent color
//   - Admin button, logout, copyright
// ═══════════════════════════════════════════════════════════════

import React, { useState, useMemo } from 'react';
import { colors, darkColors, stepColors, shadows, radii, spacing, animation, typography, zIndex, type StepColorKey } from '../design/theme.ts';
import { ProgressRing } from '../design/components/ProgressRing.tsx';
import { ICONS, getSteps, getSubSteps } from '../constants.tsx';
import { TEXT } from '../locales.ts';
import { isSubStepCompleted } from '../utils.ts';
import { getThemeMode, toggleTheme, getActiveColors, onThemeChange } from '../services/themeService.ts';
import type { ProjectData } from '../types.ts';

// ─── Step Icons (SVG for collapsed mode) ─────────────────────

const STEP_ICONS: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  problemAnalysis: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
  ),
  projectIdea: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
    </svg>
  ),
  generalObjectives: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
    </svg>
  ),
  specificObjectives: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
    </svg>
  ),
  activities: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
    </svg>
  ),
  expectedResults: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.996.178-1.768.563-2.204 1.074m14.204-1.074c.996.178 1.768.563 2.204 1.074M12 2.25c2.209 0 4.335.2 6.25.566M12 2.25c-2.209 0-4.335.2-6.25.566M12 2.25V4.5m0-2.25L9.75 4.5M12 4.5l2.25-2.25M12 4.5v3" />
    </svg>
  ),
};

// ─── Step completion percentage calculation ──────────────────

const STEP_KEYS: StepColorKey[] = ['problemAnalysis', 'projectIdea', 'generalObjectives', 'specificObjectives', 'activities', 'expectedResults'];

function getStepCompletionPercent(projectData: ProjectData, stepKey: string): number {
  // Problem Analysis
  if (stepKey === 'problemAnalysis') {
    let filled = 0;
    const total = 3;
    const pa = projectData.problemAnalysis;
    if (pa?.coreProblem?.title && pa.coreProblem.title.trim()) filled++;
    if (pa?.causes && pa.causes.length > 0 && pa.causes.some((c: any) => c.title?.trim())) filled++;
    if (pa?.consequences && pa.consequences.length > 0 && pa.consequences.some((c: any) => c.title?.trim())) filled++;
    return Math.round((filled / total) * 100);
  }

  // Project Idea
  if (stepKey === 'projectIdea') {
    let filled = 0;
    const total = 5;
    const pi = projectData.projectIdea;
    if (pi?.mainAim?.trim()) filled++;
    if (pi?.stateOfTheArt?.trim()) filled++;
    if (pi?.proposedSolution?.trim()) filled++;
    if (pi?.readinessLevels && Object.values(pi.readinessLevels).some((rl: any) => rl?.level > 0)) filled++;
    if (pi?.policies && pi.policies.length > 0 && pi.policies.some((p: any) => p.name?.trim())) filled++;
    return Math.round((filled / total) * 100);
  }

  // General Objectives
  if (stepKey === 'generalObjectives') {
    const objs = projectData.generalObjectives;
    if (!objs || objs.length === 0) return 0;
    const withContent = objs.filter((o: any) => o.title?.trim() && o.description?.trim()).length;
    return Math.round((Math.min(withContent, 5) / 5) * 100);
  }

  // Specific Objectives
  if (stepKey === 'specificObjectives') {
    const objs = projectData.specificObjectives;
    if (!objs || objs.length === 0) return 0;
    const withContent = objs.filter((o: any) => o.title?.trim() && o.description?.trim() && o.indicator?.trim()).length;
    return Math.round((Math.min(withContent, 5) / 5) * 100);
  }

  // Activities
  if (stepKey === 'activities') {
    let filled = 0;
    const total = 3;
    if (projectData.activities && projectData.activities.length > 0) filled++;
    if (projectData.projectManagement?.description?.trim()) filled++;
    if (projectData.risks && projectData.risks.length > 0) filled++;
    return Math.round((filled / total) * 100);
  }

  // Expected Results
  if (stepKey === 'expectedResults') {
    let filled = 0;
    const total = 4;
    if (projectData.outputs && projectData.outputs.length > 0) filled++;
    if (projectData.outcomes && projectData.outcomes.length > 0) filled++;
    if (projectData.impacts && projectData.impacts.length > 0) filled++;
    if (projectData.kers && projectData.kers.length > 0) filled++;
    return Math.round((filled / total) * 100);
  }

  return 0;
}

// ─── Overall completion ──────────────────────────────────────

function getOverallCompletion(projectData: ProjectData): number {
  const percentages = STEP_KEYS.map((key) => getStepCompletionPercent(projectData, key));
  return Math.round(percentages.reduce((sum, v) => sum + v, 0) / percentages.length);
}

// ─── Props ───────────────────────────────────────────────────

interface SidebarProps {
  language: 'en' | 'si';
  projectData: ProjectData;
  currentStepId: number | null;
  setCurrentStepId: (id: number) => void;
  completedStepsStatus: boolean[];
  displayTitle: string;
  currentUser: string;
  appLogo: string;
  isAdmin: boolean;
  isSidebarOpen: boolean;
  onCloseSidebar: () => void;
  onBackToWelcome: () => void;
  onOpenProjectList: () => void;
  onOpenSettings: () => void;
  onOpenAdminPanel: () => void;
  onLogout: () => void;
  onLanguageSwitch: (lang: 'en' | 'si') => void;
  onSubStepClick: (subStepId: string) => void;
  isLoading: boolean;
}

// ─── Component ───────────────────────────────────────────────

const Sidebar: React.FC<SidebarProps> = ({
  language,
  projectData,
  currentStepId,
  setCurrentStepId,
  completedStepsStatus,
  displayTitle,
  currentUser,
  appLogo,
  isAdmin,
  isSidebarOpen,
  onCloseSidebar,
  onBackToWelcome,
  onOpenProjectList,
  onOpenSettings,
  onOpenAdminPanel,
  onLogout,
  onLanguageSwitch,
  onSubStepClick,
  isLoading,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDark, setIsDark] = useState(() => getThemeMode() === 'dark');

  // Desktop detection — replaces Tailwind lg: breakpoint
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);
  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Subscribe to theme changes
  React.useEffect(() => {
    return onThemeChange((mode) => setIsDark(mode === 'dark'));
  }, []);

  const activeColors = getActiveColors();

  const t = TEXT[language] || TEXT['en'];
  const STEPS = getSteps(language);
  const SUB_STEPS = getSubSteps(language);

  const overallCompletion = useMemo(() => getOverallCompletion(projectData), [projectData]);

  const collapsedWidth = 64;
  const expandedWidth = 280;
  const sidebarWidth = isCollapsed ? collapsedWidth : expandedWidth;

  // ─── Styles ────────────────────────────────────────────────

  const sidebarStyle: React.CSSProperties = {
    position: 'fixed' as const,
    inset: '0 auto 0 0',
    zIndex: zIndex.sidebar,
    width: sidebarWidth,
    background: isDark
      ? `linear-gradient(180deg, ${darkColors.surface.card} 0%, ${darkColors.surface.sidebar} 100%)`
      : `linear-gradient(180deg, ${colors.surface.card} 0%, ${colors.surface.sidebar} 100%)`,
    borderRight: `1px solid ${isDark ? darkColors.border.light : colors.border.light}`,
    display: 'flex',
    flexDirection: 'column',
    transition: `width ${animation.duration.normal} ${animation.easing.default}, transform ${animation.duration.normal} ${animation.easing.default}`,
    overflow: 'hidden',
    boxShadow: shadows.lg,
    fontFamily: typography.fontFamily.sans,
  };

  // Mobile transform
  const mobileTransform = isDesktop || isSidebarOpen ? 'translateX(0)' : 'translateX(-100%)';

  const responsiveStyle: React.CSSProperties = {
    ...sidebarStyle,
    transform: mobileTransform,
  };

  // ─── Collapse toggle button ────────────────────────────────

  const CollapseToggle = () => (
    <button
      onClick={() => setIsCollapsed(!isCollapsed)}
      style={{
        position: 'absolute',
        top: 12,
        right: -12,
        width: 24,
        height: 24,
        borderRadius: radii.full,
        background: colors.primary[500],
        border: `2px solid ${colors.surface.card}`,
        color: colors.text.inverse,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: 10,
        boxShadow: shadows.md,
        transition: `transform ${animation.duration.fast} ${animation.easing.default}`,
      }}
      title={isCollapsed ? 'Expand' : 'Collapse'}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d={isCollapsed ? "M4 2L8 6L4 10" : "M8 2L4 6L8 10"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );

  // ─── Render ────────────────────────────────────────────────

  return (
    <>
      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div
          onClick={onCloseSidebar}
          style={{
            position: 'fixed',
            inset: 0,
            background: colors.surface.overlay,
            zIndex: zIndex.sidebar - 1,
          }}
          className="lg:hidden"
        />
      )}

      <aside
        style={responsiveStyle}
      >
        <CollapseToggle />

        {/* ═══ HEADER ═══ */}
        <div style={{
          padding: isCollapsed ? `${spacing.md} ${spacing.sm}` : `${spacing.lg} ${spacing.lg}`,
          borderBottom: `1px solid ${colors.border.light}`,
          flexShrink: 0,
        }}>
          {/* Logo + Language */}
          <div style={{
            display: 'flex',
            justifyContent: isCollapsed ? 'center' : 'space-between',
            alignItems: 'center',
            marginBottom: isCollapsed ? spacing.sm : spacing.lg,
          }}>
            <button
              onClick={onBackToWelcome}
              style={{
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
              }}
              title={t.backToHome}
            >
              <img
                src={appLogo}
                alt="Logo"
                style={{
                  height: isCollapsed ? 28 : 36,
                  width: 'auto',
                  objectFit: 'contain',
                  transition: `height ${animation.duration.normal}`,
                }}
              />
            </button>

            {!isCollapsed && (
              <div style={{
                display: 'flex',
                background: colors.surface.sidebar,
                borderRadius: radii.md,
                padding: '2px',
                border: `1px solid ${colors.border.light}`,
              }}>
                {(['si', 'en'] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => onLanguageSwitch(lang)}
                    disabled={isLoading}
                    style={{
                      padding: '2px 8px',
                      fontSize: typography.fontSize.xs,
                      fontWeight: language === lang ? typography.fontWeight.bold : typography.fontWeight.medium,
                      borderRadius: radii.sm,
                      border: 'none',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      background: language === lang ? colors.surface.card : 'transparent',
                      color: language === lang ? colors.primary[600] : colors.text.muted,
                      boxShadow: language === lang ? shadows.xs : 'none',
                      transition: `all ${animation.duration.fast}`,
                      opacity: isLoading ? 0.5 : 1,
                    }}
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Overall Progress (collapsed = mini ring, expanded = full card) */}
          {isCollapsed ? (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: spacing.sm }}>
              <ProgressRing value={overallCompletion} size={40} strokeWidth={4} showLabel={true} labelSize="0.6rem" />
            </div>
          ) : (
            <>
              {/* Project Card */}
              <div style={{
                background: colors.surface.card,
                borderRadius: radii.lg,
                padding: spacing.md,
                border: `1px solid ${colors.border.light}`,
                marginBottom: spacing.md,
              }}>
                <p style={{
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  fontWeight: typography.fontWeight.bold,
                  color: colors.text.muted,
                  marginBottom: '4px',
                  letterSpacing: '0.05em',
                  margin: '0 0 4px 0',
                }}>
                  {t.projects.currentProject}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{
                    fontSize: typography.fontSize.sm,
                    fontWeight: typography.fontWeight.semibold,
                    color: colors.text.heading,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    paddingRight: spacing.sm,
                    margin: 0,
                  }} title={displayTitle}>
                    {displayTitle}
                  </h3>
                  <button
                    onClick={onOpenProjectList}
                    style={{
                      padding: '4px',
                      borderRadius: radii.sm,
                      border: 'none',
                      background: 'transparent',
                      color: colors.primary[500],
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title={t.projects.switchProject}
                  >
                    <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Overall Progress Bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
                <ProgressRing value={overallCompletion} size={36} strokeWidth={4} showLabel={true} labelSize="0.55rem" />
                <div style={{ flex: 1 }}>
                  <p style={{
                    fontSize: typography.fontSize.xs,
                    color: colors.text.muted,
                    margin: 0,
                  }}>
                    {language === 'si' ? 'Skupni napredek' : 'Overall Progress'}
                  </p>
                  <div style={{
                    height: 4,
                    background: colors.border.light,
                    borderRadius: radii.full,
                    marginTop: 4,
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${overallCompletion}%`,
                      background: colors.primary.gradient,
                      borderRadius: radii.full,
                      transition: `width ${animation.duration.slower} ${animation.easing.default}`,
                    }} />
                  </div>
                </div>
              </div>

              {/* User info */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: typography.fontSize.xs,
                color: colors.text.muted,
              }}>
                <span>{t.auth.welcome} <strong style={{ color: colors.text.body }}>{currentUser}</strong></span>
                <button
                  onClick={onOpenSettings}
                  style={{
                    border: 'none',
                    background: 'none',
                    color: colors.primary[500],
                    cursor: 'pointer',
                    fontSize: typography.fontSize.xs,
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  {t.auth.settings}
                </button>
              </div>
            </>
          )}
        </div>

        {/* ═══ STEP NAVIGATION ═══ */}
        <nav style={{
          flex: 1,
          overflowY: 'auto',
          padding: isCollapsed ? `${spacing.sm} ${spacing.xs}` : `${spacing.md} ${spacing.md}`,
          minHeight: 0,
        }} className="custom-scrollbar">
          <div style={{ display: 'flex', flexDirection: 'column', gap: isCollapsed ? spacing.sm : '2px' }}>
            {STEPS.map((step: any, idx: number) => {
              const stepKey = step.key as StepColorKey;
              const stepColor = stepColors[stepKey];
              const isActive = currentStepId === step.id;
              const isCompleted = completedStepsStatus[idx];
              const isClickable = step.id === 1 || completedStepsStatus[0];
              const completionPct = getStepCompletionPercent(projectData, step.key);
              const StepIcon = STEP_ICONS[step.key];

              return (
                <div key={step.id}>
                  <button
                    onClick={() => isClickable && setCurrentStepId(step.id)}
                    disabled={!isClickable}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: isCollapsed ? `${spacing.sm} 0` : `${spacing.md} ${spacing.lg}`,
                      borderRadius: radii.lg,
                      border: isActive ? `1.5px solid ${stepColor.border}` : '1.5px solid transparent',
                      background: isActive ? stepColor.light : 'transparent',
                      cursor: isClickable ? 'pointer' : 'not-allowed',
                      opacity: isClickable ? 1 : 0.4,
                      display: 'flex',
                      alignItems: 'center',
                      gap: isCollapsed ? '0' : spacing.md,
                      justifyContent: isCollapsed ? 'center' : 'flex-start',
                      transition: `all ${animation.duration.fast} ${animation.easing.default}`,
                      fontFamily: 'inherit',
                    }}
                    title={isCollapsed ? step.title : undefined}
                  >
                    {/* Step indicator: ProgressRing or icon */}
                    {isCollapsed ? (
                      <div style={{ position: 'relative' }}>
                        <ProgressRing
                          value={completionPct}
                          size={36}
                          strokeWidth={3}
                          customColor={stepColor.main}
                          showLabel={false}
                        />
                        {StepIcon && (
                          <div style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            <StepIcon style={{
                              width: 16,
                              height: 16,
                              color: isActive ? stepColor.main : colors.text.muted,
                            }} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <ProgressRing
                        value={completionPct}
                        size={32}
                        strokeWidth={3}
                        customColor={stepColor.main}
                        showLabel={true}
                        labelSize="0.5rem"
                      />
                    )}

                    {/* Step title (hidden when collapsed) */}
                    {!isCollapsed && (
                      <span style={{
                        flex: 1,
                        fontSize: typography.fontSize.sm,
                        fontWeight: isActive ? typography.fontWeight.semibold : typography.fontWeight.medium,
                        color: isActive ? stepColor.text : colors.text.body,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        transition: `color ${animation.duration.fast}`,
                      }}>
                        {step.title}
                      </span>
                    )}

                    {/* Completed check (expanded only) */}
                    {!isCollapsed && isCompleted && (
                      <ICONS.CHECK style={{
                        width: 18,
                        height: 18,
                        color: stepColor.main,
                        flexShrink: 0,
                      }} />
                    )}
                  </button>

                  {/* Sub-steps (expanded + active only) */}
                  {!isCollapsed && isActive && SUB_STEPS[step.key as keyof typeof SUB_STEPS] && (SUB_STEPS[step.key as keyof typeof SUB_STEPS] as any[]).length > 0 && (
                    <div style={{
                      paddingLeft: spacing['2xl'],
                      marginTop: '2px',
                      marginBottom: spacing.sm,
                      borderLeft: `2px solid ${stepColor.border}`,
                      marginLeft: spacing.xl,
                    }}>
                      {(SUB_STEPS[step.key as keyof typeof SUB_STEPS] as any[]).map((subStep: any) => {
                        const subCompleted = isSubStepCompleted(projectData, step.key, subStep.id);
                        return (
                          <button
                            key={subStep.id}
                            onClick={() => onSubStepClick(subStep.id)}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              padding: `${spacing.xs} ${spacing.md}`,
                              borderRadius: radii.md,
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: spacing.sm,
                              fontSize: typography.fontSize.xs,
                              color: subCompleted ? stepColor.text : colors.text.muted,
                              fontFamily: 'inherit',
                              transition: `all ${animation.duration.fast}`,
                            }}
                          >
                            {subCompleted ? (
                              <ICONS.CHECK style={{
                                width: 14,
                                height: 14,
                                color: stepColor.main,
                                flexShrink: 0,
                              }} />
                            ) : (
                              <div style={{
                                width: 6,
                                height: 6,
                                borderRadius: radii.full,
                                background: colors.border.medium,
                                flexShrink: 0,
                              }} />
                            )}
                            <span>{subStep.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>

        {/* ═══ FOOTER ═══ */}
        <div style={{
          padding: isCollapsed ? `${spacing.md} ${spacing.sm}` : spacing.lg,
          borderTop: `1px solid ${colors.border.light}`,
          flexShrink: 0,
        }}>
          {isAdmin && !isCollapsed && (
            <button
              onClick={onOpenAdminPanel}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: `${spacing.sm} ${spacing.lg}`,
                borderRadius: radii.lg,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: typography.fontSize.sm,
                color: colors.primary[600],
                fontWeight: typography.fontWeight.medium,
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                marginBottom: '2px',
                fontFamily: 'inherit',
              }}
            >
              <span>🛡️</span>
              Admin Panel
            </button>
          )}

          {isAdmin && isCollapsed && (
            <button
              onClick={onOpenAdminPanel}
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'center',
                padding: `${spacing.sm} 0`,
                borderRadius: radii.lg,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                marginBottom: '2px',
              }}
              title="Admin Panel"
            >
              <span style={{ fontSize: '18px' }}>🛡️</span>
            </button>
          )}

          {/* Dark mode toggle — expanded */}
          {!isCollapsed && (
            <button
              onClick={() => { toggleTheme(); }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: `${spacing.sm} ${spacing.lg}`,
                borderRadius: radii.lg,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: typography.fontSize.sm,
                color: colors.text.muted,
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                marginBottom: '2px',
                fontFamily: 'inherit',
              }}
            >
              {isDark ? (
                <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
              <span>{isDark ? (language === 'si' ? 'Svetli način' : 'Light Mode') : (language === 'si' ? 'Temni način' : 'Dark Mode')}</span>
            </button>
          )}

          {/* Dark mode toggle — collapsed */}
          {isCollapsed && (
            <button
              onClick={() => { toggleTheme(); }}
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'center',
                padding: `${spacing.sm} 0`,
                borderRadius: radii.lg,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                marginBottom: '2px',
                color: colors.text.muted,
              }}
              title={isDark ? 'Light Mode' : 'Dark Mode'}
            >
              {isDark ? (
                <svg style={{ width: 18, height: 18 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg style={{ width: 18, height: 18 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          )}

          <button
            onClick={onLogout}
            style={{
              width: '100%',
              textAlign: isCollapsed ? 'center' : 'left',
              padding: `${spacing.sm} ${isCollapsed ? '0' : spacing.lg}`,
              borderRadius: radii.lg,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: typography.fontSize.sm,
              color: colors.text.muted,
              display: 'flex',
              alignItems: 'center',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              gap: spacing.sm,
              fontFamily: 'inherit',
              transition: `color ${animation.duration.fast}`,
            }}
          >
            <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {!isCollapsed && <span>{t.auth.logout}</span>}
          </button>

          {!isCollapsed && (
            <p style={{
              fontSize: '10px',
              color: colors.text.muted,
              textAlign: 'center',
              marginTop: spacing.sm,
              opacity: 0.6,
            }}>
              © 2026 INFINITA d.o.o.
            </p>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
