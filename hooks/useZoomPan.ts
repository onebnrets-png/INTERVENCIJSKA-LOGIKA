// hooks/useZoomPan.ts v1.4
// ═══════════════════════════════════════════════════════════════
// Universal zoom & pan hook for chart components
// CTRL+Scroll zoom (50%-200%), drag-to-pan, pinch-to-zoom, double-click reset
// ═══════════════════════════════════════════════════════════════
// CHANGELOG:
// v1.4 – FIX: Ensured e.preventDefault() + e.stopPropagation() in
//         wheel handler to fully block browser Ctrl+Scroll zoom.
//         Uses stateRef pattern to avoid stale closures — all native
//         event listeners now read from refs, not from state directly.
//         This means useEffect dependencies can be [] (empty), so
//         listeners are registered ONCE and never re-attached.
// v1.3 – Drag-to-pan works at ANY zoom level (< 100% and > 100%).
// v1.1 – Added setScale(), onUserZoom callback, improved drag.
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
    onUserZoom?: (newScale: number) => void;
    enableDrag?: boolean;
}

interface UseZoomPanReturn {
    containerRef: React.RefObject<HTMLDivElement>;
    contentRef: React.RefObject<HTMLDivElement>;
    scale: number;
    translateX: number;
    translateY: number;
    resetZoom: () => void;
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

    // ★ v1.4: stateRef pattern — native listeners always read fresh state
    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);

    // Refs for options (avoid stale closures)
    const onUserZoomRef = useRef(onUserZoom);
    onUserZoomRef.current = onUserZoom;
    const enableDragRef = useRef(enableDrag);
    enableDragRef.current = enableDrag;
    const minScaleRef = useRef(minScale);
    minScaleRef.current = minScale;
    const maxScaleRef = useRef(maxScale);
    maxScaleRef.current = maxScale;
    const scaleStepRef = useRef(scaleStep);
    scaleStepRef.current = scaleStep;

    // Drag state
    const isDragging = useRef(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const translateStart = useRef({ x: 0, y: 0 });

    // Pinch state
    const lastPinchDist = useRef<number | null>(null);

    // Helper — is scale different from 100%?
    const isZoomed = (scale: number): boolean => Math.abs(scale - 1) > 0.001;

    // Clamp helper
    const clampScale = useCallback(
        (s: number) => {
            const mn = minScaleRef.current;
            const mx = maxScaleRef.current;
            return Math.min(mx, Math.max(mn, Math.round(s * 100) / 100));
        },
        []
    );

    // Reset to 100%
    const resetZoom = useCallback(() => {
        setState({ scale: 1, translateX: 0, translateY: 0 });
    }, []);

    // Programmatic scale set
    const setScale = useCallback((newScale: number) => {
        const clamped = clampScale(newScale);
        setState({ scale: clamped, translateX: 0, translateY: 0 });
    }, [clampScale]);

    // ============================================================
    // CTRL + Scroll Zoom — native, { passive: false }
    // ============================================================
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.metaKey) return;

            // ★ v1.4: Block browser zoom
            e.preventDefault();
            e.stopPropagation();

            const rect = container.getBoundingClientRect();
            const cursorX = e.clientX - rect.left;
            const cursorY = e.clientY - rect.top;

            const prev = stateRef.current;
            const direction = e.deltaY < 0 ? 1 : -1;
            const newScale = clampScale(prev.scale + direction * scaleStepRef.current);
            const ratio = newScale / prev.scale;

            const newTranslateX = cursorX - ratio * (cursorX - prev.translateX);
            const newTranslateY = cursorY - ratio * (cursorY - prev.translateY);

            setState({
                scale: newScale,
                translateX: newTranslateX,
                translateY: newTranslateY,
            });

            if (newScale !== prev.scale && onUserZoomRef.current) {
                setTimeout(() => onUserZoomRef.current?.(newScale), 0);
            }
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, [clampScale]);

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
    // Drag-to-pan (mouse) — native listeners, stateRef pattern
    // ============================================================
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleMouseDown = (e: MouseEvent) => {
            if (e.button !== 0) return;
            if (!enableDragRef.current) return;
            if (!isZoomed(stateRef.current.scale)) return;

            isDragging.current = true;
            dragStart.current = { x: e.clientX, y: e.clientY };
            translateStart.current = {
                x: stateRef.current.translateX,
                y: stateRef.current.translateY,
            };
            container.style.cursor = 'grabbing';
            e.preventDefault();
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging.current) return;
            const dx = e.clientX - dragStart.current.x;
            const dy = e.clientY - dragStart.current.y;
            setState(prev => ({
                ...prev,
                translateX: translateStart.current.x + dx,
                translateY: translateStart.current.y + dy,
            }));
        };

        const handleMouseUp = () => {
            if (isDragging.current) {
                isDragging.current = false;
                if (containerRef.current) {
                    containerRef.current.style.cursor = isZoomed(stateRef.current.scale) ? 'grab' : 'default';
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
    }, []); // ★ v1.4: empty deps — stateRef keeps values fresh

    // ============================================================
    // Pinch-to-zoom (touch) — native listeners, stateRef pattern
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
            } else if (e.touches.length === 1 && enableDragRef.current && isZoomed(stateRef.current.scale)) {
                isDragging.current = true;
                dragStart.current = {
                    x: e.touches[0].clientX,
                    y: e.touches[0].clientY,
                };
                translateStart.current = {
                    x: stateRef.current.translateX,
                    y: stateRef.current.translateY,
                };
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2 && lastPinchDist.current !== null) {
                e.preventDefault();
                const newDist = getPinchDist(e.touches);
                const delta = newDist - lastPinchDist.current;

                const rect = container.getBoundingClientRect();
                const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
                const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

                const prev = stateRef.current;
                const scaleChange = delta * 0.005;
                const newScale = clampScale(prev.scale + scaleChange);
                const ratio = newScale / prev.scale;

                setState({
                    scale: newScale,
                    translateX: centerX - ratio * (centerX - prev.translateX),
                    translateY: centerY - ratio * (centerY - prev.translateY),
                });

                if (newScale !== prev.scale && onUserZoomRef.current) {
                    setTimeout(() => onUserZoomRef.current?.(newScale), 0);
                }

                lastPinchDist.current = newDist;
            } else if (e.touches.length === 1 && isDragging.current) {
                const dx = e.touches[0].clientX - dragStart.current.x;
                const dy = e.touches[0].clientY - dragStart.current.y;
                setState(prev => ({
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

        container.addEventListener('touchstart', handleTouchStart, { passive: false });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd);

        return () => {
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
        };
    }, [clampScale]); // ★ v1.4: minimal deps — stateRef keeps values fresh

    // ============================================================
    // Computed styles
    // ============================================================
    const containerStyle: React.CSSProperties = {
        overflow: 'hidden',
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

    const zoomBadgeText = state.scale === 1 ? '' : `${Math.round(state.scale * 100)}%`;

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
