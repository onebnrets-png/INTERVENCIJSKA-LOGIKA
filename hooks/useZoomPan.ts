// hooks/useZoomPan.ts v1.3
// ═══════════════════════════════════════════════════════════════
// Universal zoom & pan hook for chart components
// CTRL+Scroll zoom (50%-200%), drag-to-pan, pinch-to-zoom, double-click reset
// ═══════════════════════════════════════════════════════════════
// CHANGELOG:
// v1.3 – FIX: Drag-to-pan now works at ANY zoom level (both < 100%
//         and > 100%). Previously only worked above 100%.
//         Changed all scale > 1.01 checks to |scale - 1| > 0.001.
// v1.1 – Added setScale() for programmatic zoom (Fit button),
//         onUserZoom callback so components can react to user zoom,
//         and improved drag behavior (only drag when scale !== 1 or
//         when explicitly enabled).
// v1.0 – Initial implementation.
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useCallback, useEffect } from 'react';

interface ZoomPanState {
  scale: number;
  translateX: number;
  translateY: number;
}

interface UseZoomPanOptions {
  minScale?: number;
  maxScale?: number;
  scaleStep?: number;
  /** Called whenever user changes zoom via CTRL+scroll or pinch (NOT on programmatic changes) */
  onUserZoom?: (newScale: number) => void;
  /** If false, drag-to-pan is disabled (useful when chart has its own click handlers) */
  enableDrag?: boolean;
}

interface UseZoomPanReturn {
  containerRef: React.RefObject<HTMLDivElement>;
  contentRef: React.RefObject<HTMLDivElement>;
  scale: number;
  translateX: number;
  translateY: number;
  resetZoom: () => void;
  /** Programmatically set scale (e.g. for "Fit" button). Resets translate to 0,0. */
  setScale: (newScale: number) => void;
  containerStyle: React.CSSProperties;
  contentStyle: React.CSSProperties;
  zoomBadgeText: string;
}

export function useZoomPan(options?: UseZoomPanOptions): UseZoomPanReturn {
  const {
    minScale = 0.5,
    maxScale = 2.0,
    scaleStep = 0.1,
    onUserZoom,
    enableDrag = true,
  } = options || {};

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [state, setState] = useState<ZoomPanState>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });

  // Refs for callbacks to avoid stale closures
  const onUserZoomRef = useRef(onUserZoom);
  onUserZoomRef.current = onUserZoom;

  // --- Drag-to-pan state ---
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const translateStart = useRef({ x: 0, y: 0 });

  // --- Pinch-to-zoom state ---
  const lastPinchDist = useRef<number | null>(null);

  // ★ v1.3: Helper — is scale different from 100%?
  const isZoomed = (scale: number): boolean => Math.abs(scale - 1) > 0.001;

  // --- Reset to 100% ---
  const resetZoom = useCallback(() => {
    setState({ scale: 1, translateX: 0, translateY: 0 });
  }, []);

  // --- Programmatic scale set ---
  const setScale = useCallback((newScale: number) => {
    const clamped = Math.min(maxScale, Math.max(minScale, Math.round(newScale * 100) / 100));
    setState({ scale: clamped, translateX: 0, translateY: 0 });
  }, [minScale, maxScale]);

  // --- Clamp helper ---
  const clampScale = useCallback(
    (s: number) => Math.min(maxScale, Math.max(minScale, Math.round(s * 100) / 100)),
    [minScale, maxScale]
  );

  // ============================================================
  // CTRL + Scroll Zoom (zooms toward cursor position)
  // ============================================================
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      setState((prev) => {
        const direction = e.deltaY < 0 ? 1 : -1;
        const newScale = clampScale(prev.scale + direction * scaleStep);
        const ratio = newScale / prev.scale;

        const newTranslateX = cursorX - ratio * (cursorX - prev.translateX);
        const newTranslateY = cursorY - ratio * (cursorY - prev.translateY);

        // Notify component about user-initiated zoom
        if (newScale !== prev.scale && onUserZoomRef.current) {
          setTimeout(() => onUserZoomRef.current?.(newScale), 0);
        }

        return {
          scale: newScale,
          translateX: newTranslateX,
          translateY: newTranslateY,
        };
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [clampScale, scaleStep]);

  // ============================================================
  // Double-click to reset
  // ============================================================
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleDblClick = (e: MouseEvent) => {
      e.preventDefault();
      resetZoom();
      if (onUserZoomRef.current) {
        setTimeout(() => onUserZoomRef.current?.(1), 0);
      }
    };

    container.addEventListener('dblclick', handleDblClick);
    return () => container.removeEventListener('dblclick', handleDblClick);
  }, [resetZoom]);

  // ============================================================
  // Drag-to-pan (mouse) — only when enableDrag is true
  // ============================================================
  useEffect(() => {
    if (!enableDrag) return;

    const container = containerRef.current;
    if (!container) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      // ★ v1.3: Allow drag at ANY zoom level except exactly 100%
      if (!isZoomed(state.scale)) return;

      isDragging.current = true;
      dragStart.current = { x: e.clientX, y: e.clientY };
      translateStart.current = {
        x: state.translateX,
        y: state.translateY,
      };
      container.style.cursor = 'grabbing';
      e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setState((prev) => ({
        ...prev,
        translateX: translateStart.current.x + dx,
        translateY: translateStart.current.y + dy,
      }));
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        if (containerRef.current) {
          // ★ v1.3: Show grab cursor at any zoom level except 100%
          containerRef.current.style.cursor = isZoomed(state.scale) ? 'grab' : 'default';
        }
      }
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [enableDrag, state.scale, state.translateX, state.translateY]);

  // ============================================================
  // Pinch-to-zoom (touch)
  // ============================================================
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getPinchDist = (touches: TouchList): number => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        lastPinchDist.current = getPinchDist(e.touches);
        e.preventDefault();
      // ★ v1.3: Allow touch drag at any zoom level except 100%
      } else if (e.touches.length === 1 && enableDrag && isZoomed(state.scale)) {
        isDragging.current = true;
        dragStart.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
        translateStart.current = {
          x: state.translateX,
          y: state.translateY,
        };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && lastPinchDist.current !== null) {
        e.preventDefault();
        const newDist = getPinchDist(e.touches);
        const delta = newDist - lastPinchDist.current;

        const rect = container.getBoundingClientRect();
        const centerX =
          (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const centerY =
          (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

        setState((prev) => {
          const scaleChange = delta * 0.005;
          const newScale = clampScale(prev.scale + scaleChange);
          const ratio = newScale / prev.scale;

          if (newScale !== prev.scale && onUserZoomRef.current) {
            setTimeout(() => onUserZoomRef.current?.(newScale), 0);
          }

          return {
            scale: newScale,
            translateX: centerX - ratio * (centerX - prev.translateX),
            translateY: centerY - ratio * (centerY - prev.translateY),
          };
        });

        lastPinchDist.current = newDist;
      } else if (e.touches.length === 1 && isDragging.current) {
        const dx = e.touches[0].clientX - dragStart.current.x;
        const dy = e.touches[0].clientY - dragStart.current.y;
        setState((prev) => ({
          ...prev,
          translateX: translateStart.current.x + dx,
          translateY: translateStart.current.y + dy,
        }));
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        lastPinchDist.current = null;
      }
      if (e.touches.length === 0) {
        isDragging.current = false;
      }
    };

    container.addEventListener('touchstart', handleTouchStart, {
      passive: false,
    });
    container.addEventListener('touchmove', handleTouchMove, {
      passive: false,
    });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [clampScale, enableDrag, state.scale, state.translateX, state.translateY]);

  // ============================================================
  // Computed styles
  // ============================================================
  const containerStyle: React.CSSProperties = {
    overflow: 'hidden',
    // ★ v1.3: Show grab cursor at any zoom level except 100%
    cursor: isZoomed(state.scale) ? 'grab' : 'default',
    position: 'relative',
    touchAction: 'none',
  };

  const contentStyle: React.CSSProperties = {
    transform: `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`,
    transformOrigin: '0 0',
    transition: isDragging.current ? 'none' : 'transform 0.15s ease-out',
    willChange: 'transform',
  };

  const zoomBadgeText =
    state.scale === 1 ? '' : `${Math.round(state.scale * 100)}%`;

  return {
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
    contentRef: contentRef as React.RefObject<HTMLDivElement>,
    scale: state.scale,
    translateX: state.translateX,
    translateY: state.translateY,
    resetZoom,
    setScale,
    containerStyle,
    contentStyle,
    zoomBadgeText,
  };
}
