// components/SummaryModal.tsx
// v2.0 - 2026-02-17  Dark-mode: isDark + colors pattern
import React, { useState, useEffect, useCallback } from 'react';
import { lightColors, darkColors, shadows, radii, spacing, animation, typography } from '../design/theme.ts';
import { getThemeMode, onThemeChange } from '../services/themeService.ts';
import { TEXT } from '../locales.ts';

interface SummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  summaryText: string;
  isGenerating: boolean;
  onRegenerate: () => void;
  onDownloadDocx: () => void;
  language: 'en' | 'si';
}

const SummaryModal: React.FC<SummaryModalProps> = ({
  isOpen, onClose, summaryText, isGenerating,
  onRegenerate, onDownloadDocx, language
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

  const t = TEXT[language] || TEXT['en'];

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
      className="print:hidden"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: colors.surface.card,
        borderRadius: radii['2xl'],
        boxShadow: shadows['2xl'],
        maxWidth: 680,
        width: '100%',
        overflow: 'hidden',
        border: `1px solid ${colors.border.light}`,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '90vh',
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
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.bold,
            color: colors.text.heading,
            margin: 0,
          }}>
            {t.modals.summaryTitle}
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
            onMouseEnter={(e) => { e.currentTarget.style.background = colors.border.light; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <svg style={{ width: 24, height: 24 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{
          padding: spacing['2xl'],
          overflowY: 'auto',
          flex: 1,
        }} className="custom-scrollbar">
          {isGenerating ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: 192,
            }}>
              <div style={{
                width: 32,
                height: 32,
                border: `4px solid ${colors.primary[500]}`,
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                marginBottom: spacing.lg,
              }} />
              <p style={{ color: colors.text.muted, margin: 0 }}>{t.generating}</p>
            </div>
          ) : (
            <div style={{
              color: colors.text.body,
              fontSize: typography.fontSize.sm,
              lineHeight: typography.lineHeight.relaxed,
              whiteSpace: 'pre-wrap',
            }}>
              {summaryText}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: `${spacing.lg} ${spacing['2xl']}`,
          borderTop: `1px solid ${colors.border.light}`,
          background: colors.surface.sidebar,
          display: 'flex',
          justifyContent: 'space-between',
          gap: spacing.md,
          flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: `${spacing.sm} ${spacing.lg}`,
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
              color: colors.text.muted,
              background: 'transparent',
              border: 'none',
              borderRadius: radii.lg,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t.modals.closeBtn}
          </button>
          <div style={{ display: 'flex', gap: spacing.sm }}>
            <button
              onClick={onRegenerate}
              style={{
                padding: `${spacing.sm} ${spacing.lg}`,
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.medium,
                color: colors.primary[isDark ? 200 : 700],
                background: isDark ? 'rgba(99,102,241,0.1)' : colors.primary[50],
                border: `1px solid ${colors.primary[isDark ? 700 : 200]}`,
                borderRadius: radii.lg,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: `all ${animation.duration.fast}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(99,102,241,0.2)' : colors.primary[100]; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = isDark ? 'rgba(99,102,241,0.1)' : colors.primary[50]; }}
            >
              {t.modals.regenerateBtn}
            </button>
            <button
              onClick={onDownloadDocx}
              style={{
                padding: `${spacing.sm} ${spacing.lg}`,
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.semibold,
                color: '#FFFFFF',
                background: colors.success[600],
                border: 'none',
                borderRadius: radii.lg,
                cursor: 'pointer',
                boxShadow: shadows.sm,
                fontFamily: 'inherit',
                transition: `all ${animation.duration.fast}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.success[700]; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = colors.success[600]; }}
            >
              {t.modals.downloadDocxBtn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SummaryModal;
