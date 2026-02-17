// design/components/ProgressRing.tsx
// ═══════════════════════════════════════════════════════════════
// Animated SVG progress ring — EURO-OFFICE Design System
// v1.0 — 2026-02-17
// Used for step completion, project overview dashboard
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { colors, animation, stepColors, type StepColorKey } from '../theme.ts';

interface ProgressRingProps {
  /** Progress value 0-100 */
  value: number;
  /** Size in pixels */
  size?: number;
  /** Stroke width */
  strokeWidth?: number;
  /** Color from step palette */
  color?: StepColorKey;
  /** Custom color override */
  customColor?: string;
  /** Show percentage text in center */
  showLabel?: boolean;
  /** Custom label (overrides percentage) */
  label?: string;
  /** Label font size */
  labelSize?: string;
  /** Animate on mount */
  animated?: boolean;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  value,
  size = 64,
  strokeWidth = 6,
  color,
  customColor,
  showLabel = true,
  label,
  labelSize,
  animated = true,
}) => {
  const [animatedValue, setAnimatedValue] = useState(animated ? 0 : value);

  useEffect(() => {
    if (!animated) {
      setAnimatedValue(value);
      return;
    }

    // Animate from current to target
    const timeout = setTimeout(() => {
      setAnimatedValue(value);
    }, 100); // Small delay for mount animation

    return () => clearTimeout(timeout);
  }, [value, animated]);

  const clampedValue = Math.min(100, Math.max(0, animatedValue));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedValue / 100) * circumference;

  const ringColor = customColor
    || (color && stepColors[color] ? stepColors[color].main : colors.primary[500]);

  const bgColor = (color && stepColors[color]) ? stepColors[color].light : colors.primary[50];

  const displayLabel = label || `${Math.round(value)}%`;
  const computedLabelSize = labelSize || (size <= 32 ? '0.55rem' : size <= 48 ? '0.65rem' : '0.8rem');

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={bgColor}
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{
            transition: animated
              ? `stroke-dashoffset ${animation.duration.slower} ${animation.easing.default}`
              : 'none',
          }}
        />
      </svg>
      {showLabel && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: computedLabelSize,
          fontWeight: '700',
          color: ringColor,
          lineHeight: 1,
        }}>
          {displayLabel}
        </div>
      )}
    </div>
  );
};

export default ProgressRing;
