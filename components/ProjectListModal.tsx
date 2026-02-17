// components/ProjectListModal.tsx
// v3.0 - 2026-02-17  Dark-mode: isDark + colors pattern
import React, { useState, useEffect, useCallback } from 'react';
import { lightColors, darkColors, shadows, radii, spacing, animation, typography } from '../design/theme.ts';
import { getThemeMode, onThemeChange } from '../services/themeService.ts';
import { TEXT } from '../locales.ts';

interface ProjectListModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: any[];
  currentProjectId: string | null;
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  onDeleteProject: (id: string) => void;
  language: 'en' | 'si';
}

const ProjectListModal: React.FC<ProjectListModalProps> = ({
  isOpen, onClose, projects, currentProjectId,
  onSelectProject, onCreateProject, onDeleteProject, language
}) => {
  const [isDark, setIsDark] = useState(getThemeMode() === 'dark');
  useEffect(() => {
    const unsub = onThemeChange((m) => setIsDark(m === 'dark'));
    return unsub;
  }, []);
  const colors = isDark ? darkColors : lightColors;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const tLang = TEXT[language] || TEXT['en'];
  const t = tLang.projects;

  const formatDate = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleDateString(
        language === 'si' ? 'sl-SI' : 'en-GB',
        { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
      );
    } catch { return isoString; }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.lg,
        background: colors.surface.overlayBlur,
        backdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: colors.surface.card,
        borderRadius: radii['2xl'],
        boxShadow: shadows['2xl'],
        maxWidth: 640,
        width: '100%',
        overflow: 'hidden',
        border: `1px solid ${colors.border.light}`,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '80vh',
        animation: 'scaleIn 0.2s ease-out',
        fontFamily: typography.fontFamily.sans,
      }}>
        {/* Header */}
        <div style={{
          padding: `${spacing.lg} ${spacing['2xl']}`,
          borderBottom: `1px solid ${colors.border.light}`,
          background: colors.surface.sidebar,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}>
          <h3 style={{
            fontSize: typography.fontSize.xl,
            fontWeight: typography.fontWeight.bold,
            color: colors.text.heading,
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: spacing.sm,
          }}>
            <svg style={{ width: 24, height: 24, color: colors.primary[500] }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            {t.myProjects}
          </h3>
          <button
            onClick={onClose}
            style={{
              padding: spacing.xs,
              borderRadius: radii.full,
              border: 'none',
              background: 'transparent',
              color: colors.text.muted,
              cursor: 'pointer',
              display: 'flex',
              transition: `all ${animation.duration.fast}`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = colors.border.light; e.currentTarget.style.color = colors.text.body; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = colors.text.muted; }}
          >
            <svg style={{ width: 24, height: 24 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* List */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: spacing.lg,
          background: colors.surface.background,
        }} className="custom-scrollbar">
          {projects.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: `${spacing['5xl']} ${spacing.lg}`,
              color: colors.text.muted,
            }}>
              <svg style={{ width: 48, height: 48, margin: '0 auto 16px', opacity: 0.3 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p style={{ fontSize: typography.fontSize.sm }}>{t.noProjects}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              {projects.map((proj: any) => {
                const isCurrent = proj.id === currentProjectId;
                return (
                  <div
                    key={proj.id}
                    style={{
                      padding: spacing.lg,
                      borderRadius: radii.xl,
                      border: `2px solid ${isCurrent ? colors.primary[300] : colors.border.light}`,
                      background: isCurrent ? (isDark ? 'rgba(99,102,241,0.15)' : colors.primary[50]) : colors.surface.card,
                      boxShadow: shadows.card,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: spacing.md,
                      cursor: 'pointer',
                      transition: `all ${animation.duration.fast} ${animation.easing.default}`,
                    }}
                    onClick={() => onSelectProject(proj.id)}
                    onMouseEnter={(e) => {
                      if (!isCurrent) {
                        e.currentTarget.style.borderColor = colors.primary[200];
                        e.currentTarget.style.boxShadow = shadows.cardHover;
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isCurrent) {
                        e.currentTarget.style.borderColor = colors.border.light;
                        e.currentTarget.style.boxShadow = shadows.card;
                        e.currentTarget.style.transform = 'none';
                      }
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                        <h4 style={{
                          fontSize: typography.fontSize.base,
                          fontWeight: typography.fontWeight.semibold,
                          color: isCurrent ? colors.primary[isDark ? 200 : 800] : colors.text.heading,
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {proj.title || t.untitled}
                        </h4>
                        {isCurrent && (
                          <span style={{
                            fontSize: '10px',
                            background: colors.primary[isDark ? 700 : 200],
                            color: colors.primary[isDark ? 200 : 700],
                            padding: '2px 8px',
                            borderRadius: radii.full,
                            fontWeight: typography.fontWeight.bold,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            flexShrink: 0,
                          }}>
                            Active
                          </span>
                        )}
                      </div>
                      <p style={{
                        fontSize: typography.fontSize.xs,
                        color: colors.text.muted,
                        marginTop: 4,
                      }}>
                        {t.lastModified}: {formatDate(proj.updatedAt)}
                      </p>
                    </div>

                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteProject(proj.id); }}
                      style={{
                        padding: spacing.sm,
                        borderRadius: radii.lg,
                        border: 'none',
                        background: 'transparent',
                        color: colors.error[300],
                        cursor: 'pointer',
                        display: 'flex',
                        transition: `all ${animation.duration.fast}`,
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = isDark ? 'rgba(239,68,68,0.15)' : colors.error[50];
                        e.currentTarget.style.color = colors.error[500];
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = colors.error[300];
                      }}
                      title={t.delete}
                    >
                      <svg style={{ width: 20, height: 20 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: `${spacing.lg} ${spacing['2xl']}`,
          borderTop: `1px solid ${colors.border.light}`,
          background: colors.surface.card,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              fontSize: typography.fontSize.sm,
              color: colors.text.muted,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {tLang.modals.closeBtn}
          </button>
          <button
            onClick={onCreateProject}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.sm,
              padding: `${spacing.md} ${spacing.xl}`,
              background: colors.primary.gradient,
              color: '#FFFFFF',
              fontWeight: typography.fontWeight.semibold,
              fontSize: typography.fontSize.sm,
              borderRadius: radii.xl,
              border: 'none',
              cursor: 'pointer',
              boxShadow: shadows.lg,
              transition: `all ${animation.duration.fast} ${animation.easing.default}`,
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.primary.gradientHover;
              e.currentTarget.style.boxShadow = shadows.primaryGlow;
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = colors.primary.gradient;
              e.currentTarget.style.boxShadow = shadows.lg;
              e.currentTarget.style.transform = 'none';
            }}
          >
            <svg style={{ width: 20, height: 20 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t.createNew}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectListModal;
