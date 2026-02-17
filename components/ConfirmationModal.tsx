// components/ConfirmationModal.tsx
// v3.0 - 2026-02-17  Dark-mode: isDark + colors pattern
import React, { useState, useEffect, useCallback } from 'react';
import { lightColors, darkColors, shadows, radii, spacing, animation, typography } from '../design/theme.ts';
import { getThemeMode, onThemeChange } from '../services/themeService.ts';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onSecondary?: (() => void) | null;
  onTertiary?: (() => void) | null;
  onCancel: () => void;
  confirmText: string;
  secondaryText?: string;
  tertiaryText?: string;
  cancelText: string;
  confirmDesc?: string;
  secondaryDesc?: string;
  tertiaryDesc?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen, title, message,
  onConfirm, onSecondary, onTertiary, onCancel,
  confirmText, secondaryText, tertiaryText, cancelText,
  confirmDesc, secondaryDesc, tertiaryDesc
}) => {
  const [isDark, setIsDark] = useState(getThemeMode() === 'dark');
  useEffect(() => {
    const unsub = onThemeChange((m) => setIsDark(m === 'dark'));
    return unsub;
  }, []);
  const colors = isDark ? darkColors : lightColors;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onCancel();
  }, [onCancel]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const isThreeOptionLayout = !!(onSecondary && onTertiary);

  const optionCards = isThreeOptionLayout ? [
    { onClick: onConfirm, text: confirmText, desc: confirmDesc, icon: '\u2726', color: colors.success },
    { onClick: onSecondary!, text: secondaryText, desc: secondaryDesc, icon: '+', color: colors.primary },
    { onClick: onTertiary!, text: tertiaryText, desc: tertiaryDesc, icon: '\u21BB', color: colors.warning },
  ] : [];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.lg,
        background: colors.surface.overlayBlur,
        backdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        style={{
          background: colors.surface.card,
          borderRadius: radii['2xl'],
          boxShadow: shadows['2xl'],
          maxWidth: isThreeOptionLayout ? 520 : 440,
          width: '100%',
          overflow: 'hidden',
          border: `1px solid ${colors.border.light}`,
          animation: 'scaleIn 0.2s ease-out',
          fontFamily: typography.fontFamily.sans,
        }}
      >
        {/* Header */}
        <div style={{
          padding: `${spacing.lg} ${spacing['2xl']}`,
          borderBottom: `1px solid ${colors.border.light}`,
          background: colors.surface.sidebar,
        }}>
          <h3 style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.bold,
            color: colors.text.heading,
            margin: 0,
          }}>
            {title}
          </h3>
        </div>

        {/* Body */}
        <div style={{ padding: spacing['2xl'] }}>
          <p style={{
            color: colors.text.body,
            lineHeight: typography.lineHeight.relaxed,
            marginBottom: isThreeOptionLayout ? spacing.xl : spacing.lg,
            fontSize: typography.fontSize.sm,
            whiteSpace: 'pre-line',
          }}>
            {message}
          </p>

          {isThreeOptionLayout && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              {optionCards.map((card, idx) => (
                <button
                  key={idx}
                  onClick={card.onClick}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: spacing.lg,
                    borderRadius: radii.xl,
                    border: `2px solid ${isDark ? card.color[700] : card.color[200]}`,
                    background: isDark ? `rgba(${idx === 0 ? '16,185,129' : idx === 1 ? '99,102,241' : '245,158,11'}, 0.1)` : card.color[50],
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.md,
                    transition: `all ${animation.duration.fast} ${animation.easing.default}`,
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = isDark ? `rgba(${idx === 0 ? '16,185,129' : idx === 1 ? '99,102,241' : '245,158,11'}, 0.2)` : card.color[100];
                    e.currentTarget.style.borderColor = isDark ? card.color[500] : card.color[300];
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = shadows.md;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isDark ? `rgba(${idx === 0 ? '16,185,129' : idx === 1 ? '99,102,241' : '245,158,11'}, 0.1)` : card.color[50];
                    e.currentTarget.style.borderColor = isDark ? card.color[700] : card.color[200];
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: radii.full,
                    background: card.color[500],
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: typography.fontSize.sm,
                    fontWeight: typography.fontWeight.bold,
                    flexShrink: 0,
                  }}>
                    {card.icon}
                  </div>
                  <div>
                    <div style={{
                      fontWeight: typography.fontWeight.semibold,
                      color: isDark ? card.color[200] : card.color[800],
                      fontSize: typography.fontSize.sm,
                    }}>
                      {card.text}
                    </div>
                    {card.desc && (
                      <div style={{
                        fontSize: typography.fontSize.xs,
                        color: isDark ? card.color[300] : card.color[600],
                        marginTop: 2,
                      }}>
                        {card.desc}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: `${spacing.lg} ${spacing['2xl']}`,
          borderTop: `1px solid ${colors.border.light}`,
          background: colors.surface.sidebar,
          display: 'flex',
          justifyContent: isThreeOptionLayout ? 'center' : 'flex-end',
          gap: spacing.md,
        }}>
          <button
            onClick={onCancel}
            style={{
              padding: `${spacing.sm} ${spacing.lg}`,
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
              color: colors.text.muted,
              background: 'transparent',
              border: 'none',
              borderRadius: radii.lg,
              cursor: 'pointer',
              transition: `all ${animation.duration.fast}`,
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.surface.sidebar;
              e.currentTarget.style.color = colors.text.body;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = colors.text.muted;
            }}
          >
            {cancelText}
          </button>

          {!isThreeOptionLayout && (
            <>
              {onSecondary && secondaryText && (
                <button
                  onClick={onSecondary}
                  style={{
                    padding: `${spacing.sm} ${spacing.lg}`,
                    fontSize: typography.fontSize.sm,
                    fontWeight: typography.fontWeight.medium,
                    color: colors.primary[isDark ? 200 : 700],
                    background: isDark ? 'rgba(99,102,241,0.1)' : colors.primary[50],
                    border: `1px solid ${colors.primary[isDark ? 700 : 200]}`,
                    borderRadius: radii.lg,
                    cursor: 'pointer',
                    transition: `all ${animation.duration.fast}`,
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = isDark ? 'rgba(99,102,241,0.2)' : colors.primary[100];
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isDark ? 'rgba(99,102,241,0.1)' : colors.primary[50];
                  }}
                >
                  {secondaryText}
                </button>
              )}
              <button
                onClick={onConfirm}
                style={{
                  padding: `${spacing.sm} ${spacing.xl}`,
                  fontSize: typography.fontSize.sm,
                  fontWeight: typography.fontWeight.semibold,
                  color: '#FFFFFF',
                  background: colors.primary.gradient,
                  border: 'none',
                  borderRadius: radii.lg,
                  cursor: 'pointer',
                  boxShadow: shadows.sm,
                  transition: `all ${animation.duration.fast}`,
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colors.primary.gradientHover;
                  e.currentTarget.style.boxShadow = shadows.primaryGlow;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = colors.primary.gradient;
                  e.currentTarget.style.boxShadow = shadows.sm;
                }}
              >
                {confirmText}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
