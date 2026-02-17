// components/SummaryModal.tsx
// ═══════════════════════════════════════════════════════════════
// Project summary modal — Design System Edition
// v1.0 — 2026-02-17
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useCallback } from 'react';
import { colors, shadows, radii, spacing, animation, typography } from '../design/theme.ts';
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
                color: colors.primary[700],
                background: colors.primary[50],
                border: `1px solid ${colors.primary[200]}`,
                borderRadius: radii.lg,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: `all ${animation.duration.fast}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.primary[100]; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = colors.primary[50]; }}
            >
              {t.modals.regenerateBtn}
            </button>
            <button
              onClick={onDownloadDocx}
              style={{
                padding: `${spacing.sm} ${spacing.lg}`,
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text.inverse,
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
