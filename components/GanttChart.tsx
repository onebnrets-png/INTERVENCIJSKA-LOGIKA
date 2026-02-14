// components/GanttChart.tsx
// ═══════════════════════════════════════════════════════════════
// Gantt Chart Component – v4.7 (2026-02-14)
// ═══════════════════════════════════════════════════════════════
// CHANGELOG:
// v4.7 – FIX: Added visual inner padding (LEFT_PAD / RIGHT_PAD) so that
//         bars, labels, markers, grid lines, and dependency paths do not
//         touch the left or right edge of the container. All getLeft()
//         values are offset by LEFT_PAD. chartWidth calculation reserves
//         space for both pads. Milestone diamonds, WP bars, task bars,
//         marker labels, grid lines, and SVG dependency paths all respect
//         the new padding. Works for both "project" and scrollable views.
// v4.6 – FIX: Multiple overflow prevention measures for "Project" view:
//         1. SVG gets explicit width=chartWidth + overflow="hidden"
//         2. Marker label filter tightened (chartWidth - 60)
//         3. Task labels in project view never use 'right' position
//            if they would overflow — forced to 'inside-truncate'
//         4. Container div gets maxWidth:100% + boxSizing:border-box
//         5. Inner chart div gets overflow:hidden in project view
//         6. Milestone labels clipped when exceeding chartWidth
// v4.5 – FIX: "Project" view no longer overflows container.
//         chartWidth capped to availableWidth; scrollable div uses
//         overflow:hidden + height:auto for project view.
//         Inner div uses minWidth:'100%' only when NOT in project view
//         to prevent horizontal expansion. Added SIDE_PADDING constant.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { TEXT } from '../locales.ts';
import { ICONS } from '../constants.tsx';
import { downloadBlob } from '../utils.ts';
import { TECHNICAL_CONFIG } from '../services/TechnicalInstructions.ts';

// Extract constants from Technical Configuration
const { ONE_DAY_MS, MIN_BAR_WIDTH, HEADER_HEIGHT, ROW_HEIGHT, BAR_HEIGHT, BAR_OFFSET_Y, VIEW_SETTINGS } = TECHNICAL_CONFIG.GANTT;

// ★ FIX v4.7: Visual inner padding on left and right so content never touches edges
const LEFT_PAD = 20;
const RIGHT_PAD = 20;
const SIDE_PADDING = LEFT_PAD + RIGHT_PAD; // total reserved space (replaces old SIDE_PADDING = 40)

// Helper to check if a date string is valid
const isValidDate = (d: string | undefined | null): boolean => !!d && !isNaN(new Date(d).getTime());

type ViewMode = 'week' | 'month' | 'quarter' | 'semester' | 'year' | 'project';

interface GanttChartProps {
    activities: any[];
    language?: string;
    id?: string;
    forceViewMode?: ViewMode | null;
    containerWidth?: number;
}

const GanttChart: React.FC<GanttChartProps> = ({
    activities,
    language = 'en',
    id = 'gantt-chart-content',
    forceViewMode = null,
    containerWidth: initialWidth = 1200
}) => {
    const [hoveredTask, setHoveredTask] = useState<string | null>(null);
    const [viewModeState, setViewModeState] = useState<ViewMode>('project');
    const [containerWidth, setContainerWidth] = useState(initialWidth);
    const chartRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const t = TEXT[language] || TEXT['en'];

    // Use forced view mode if provided (for export), otherwise internal state
    const viewMode: ViewMode = forceViewMode || viewModeState;

    // Measure container width for "Project" view scaling, unless forced via prop
    useEffect(() => {
        if (!containerRef.current || forceViewMode) {
            setContainerWidth(initialWidth);
            return;
        }

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentRect.width > 0) {
                    setContainerWidth(entry.contentRect.width);
                }
            }
        });

        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, [initialWidth, forceViewMode]);

    // 1. Flatten all tasks with valid dates to find min/max and create a map
    const { allItems, taskMap, rows } = useMemo(() => {
        const items: any[] = [];
        const map: Record<string, any> = {};
        const rowsList: any[] = [];

        activities.forEach(wp => {
            const validTasks = (wp.tasks || []).filter((t: any) => isValidDate(t.startDate) && isValidDate(t.endDate));
            const validMilestones = (wp.milestones || []).filter((m: any) => isValidDate(m.date));

            if (validTasks.length > 0 || validMilestones.length > 0) {
                rowsList.push({ type: 'wp', id: wp.id, title: wp.title });

                validTasks.forEach((task: any) => {
                    const tObj = {
                        ...task,
                        type: 'task',
                        wpId: wp.id,
                        wpTitle: wp.title,
                        start: new Date(task.startDate),
                        end: new Date(task.endDate),
                        dependencies: task.dependencies || []
                    };
                    items.push(tObj);
                    map[task.id] = tObj;
                    rowsList.push({ type: 'task', data: tObj });
                });

                validMilestones.forEach((ms: any) => {
                    const mObj = {
                        ...ms,
                        type: 'milestone',
                        wpId: wp.id,
                        wpTitle: wp.title,
                        date: new Date(ms.date)
                    };
                    items.push(mObj);
                    rowsList.push({ type: 'milestone', data: mObj });
                });
            }
        });

        items.sort((a, b) => {
            const timeA = a.type === 'milestone' ? a.date.getTime() : a.start.getTime();
            const timeB = b.type === 'milestone' ? b.date.getTime() : b.start.getTime();
            return timeA - timeB;
        });

        return { allItems: items, taskMap: map, rows: rowsList };
    }, [activities]);

    if (allItems.length === 0) {
        return (
            <div id={id} className="p-8 text-center bg-slate-50 border border-slate-200 rounded-lg text-slate-500 italic">
                {t.noDates}
            </div>
        );
    }

    // 2. Determine Timeline Bounds
    const rawMin = Math.min(...allItems.map(t => t.type === 'milestone' ? t.date.getTime() : t.start.getTime()));
    const rawMax = Math.max(...allItems.map(t => t.type === 'milestone' ? t.date.getTime() : t.end.getTime()));

    let paddingDays = 0;
    if (viewMode === 'project') {
        const durationDays = (rawMax - rawMin) / ONE_DAY_MS;
        paddingDays = Math.max(durationDays * 0.05, 10);
    } else {
        paddingDays = viewMode === 'week' ? 14 : viewMode === 'month' ? 30 : 90;
    }

    const minDate = new Date(rawMin - (paddingDays * ONE_DAY_MS));
    const maxDate = new Date(rawMax + (paddingDays * ONE_DAY_MS));

    // Snap dates based on view
    if (viewMode === 'year') {
        minDate.setMonth(0, 1);
    } else if (viewMode === 'month' || viewMode === 'quarter' || viewMode === 'project') {
        minDate.setDate(1);
    } else if (viewMode === 'semester') {
        minDate.setDate(1);
        const m = minDate.getMonth();
        minDate.setMonth(m < 6 ? 0 : 6);
    }

    const totalDays = Math.ceil((maxDate.getTime() - minDate.getTime()) / ONE_DAY_MS) + 1;

    // 3. Calculate Pixels Per Day
    // ★ FIX v4.7: Reserve LEFT_PAD + RIGHT_PAD inside the available space.
    //   The "drawable" timeline area is (chartWidth - LEFT_PAD - RIGHT_PAD) wide,
    //   but we keep chartWidth = full container width so the SVG and containers
    //   span the whole area. getLeft() adds LEFT_PAD as offset.
    let pixelsPerDay: number;
    let chartWidth: number;

    if (viewMode === 'project') {
        const availableWidth = Math.max(containerWidth, 100);
        const drawableWidth = availableWidth - SIDE_PADDING; // ★ FIX v4.7
        pixelsPerDay = drawableWidth / Math.max(totalDays, 1);
        chartWidth = availableWidth; // Full container width (pads are inside)
    } else {
        pixelsPerDay = VIEW_SETTINGS[viewMode]?.px || 4;
        chartWidth = (totalDays * pixelsPerDay) + SIDE_PADDING; // ★ FIX v4.7: add padding for scrollable views too
    }

    // Add generous buffer (80px) to chart height to prevent bottom cutoff
    const chartHeight = (rows.length * ROW_HEIGHT) + HEADER_HEIGHT + 80;

    // 4. Generate Timeline Markers
    const markers: Date[] = [];
    let currentDate = new Date(minDate);

    let markerMode: ViewMode = viewMode;
    if (viewMode === 'project') {
        const maxLabels = containerWidth / 60;
        const daysPerLabel = totalDays / maxLabels;

        if (daysPerLabel > 365) markerMode = 'year';
        else if (daysPerLabel > 90) markerMode = 'semester';
        else if (daysPerLabel > 30) markerMode = 'quarter';
        else if (daysPerLabel > 7) markerMode = 'month';
        else markerMode = 'week';
    }

    // Align start date for week view
    if (markerMode === 'week') {
        const day = currentDate.getDay();
        const diff = currentDate.getDate() - day + (day === 0 ? -6 : 1);
        currentDate.setDate(diff);
    }

    const loopEndDate = new Date(maxDate.getTime() + (365 * ONE_DAY_MS));

    while (currentDate <= loopEndDate) {
        markers.push(new Date(currentDate));

        switch (markerMode) {
            case 'week': currentDate.setDate(currentDate.getDate() + 7); break;
            case 'month': currentDate.setMonth(currentDate.getMonth() + 1); break;
            case 'quarter': currentDate.setMonth(currentDate.getMonth() + 3); break;
            case 'semester': currentDate.setMonth(currentDate.getMonth() + 6); break;
            case 'year': currentDate.setFullYear(currentDate.getFullYear() + 1); break;
            default: currentDate.setMonth(currentDate.getMonth() + 1);
        }

        if (markers.length > 1000) break;
    }

    // ★ FIX v4.7: getLeft now adds LEFT_PAD so all content starts offset from the left edge
    const getLeft = (date: Date): number =>
        LEFT_PAD + ((date.getTime() - minDate.getTime()) / ONE_DAY_MS) * pixelsPerDay;

    const getWidth = (start: Date, end: Date): number =>
        Math.max(((end.getTime() - start.getTime()) / ONE_DAY_MS) * pixelsPerDay, MIN_BAR_WIDTH);

    const getMarkerLabel = (date: Date): string => {
        const loc = language === 'si' ? 'sl-SI' : language;
        switch (markerMode) {
            case 'week': return date.toLocaleDateString(loc, { day: 'numeric', month: 'short' });
            case 'month': return date.toLocaleDateString(loc, { month: 'short', year: '2-digit' });
            case 'quarter':
                const q = Math.floor(date.getMonth() / 3) + 1;
                return `Q${q} '${date.getFullYear().toString().substr(2)}`;
            case 'semester':
                const h = date.getMonth() < 6 ? 1 : 2;
                return `H${h} '${date.getFullYear().toString().substr(2)}`;
            case 'year': return date.getFullYear().toString();
            default: return '';
        }
    };

    // --- Export XML Logic ---
    const handleExportXML = () => {
        let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Project xmlns="http://schemas.microsoft.com/project">\n<Tasks>\n`;
        let uidCounter = 1;
        const uidMap: Record<string, number> = {};

        activities.forEach(wp => {
            uidMap[wp.id] = uidCounter++;
            (wp.tasks || []).forEach((t: any) => {
                uidMap[t.id] = uidCounter++;
            });
            (wp.milestones || []).forEach((m: any) => {
                if (isValidDate(m.date)) uidMap[m.id] = uidCounter++;
            });
        });

        activities.forEach(wp => {
            xml += `  <Task>\n    <UID>${uidMap[wp.id]}</UID>\n    <ID>${uidMap[wp.id]}</ID>\n    <Name>${wp.id}: ${wp.title}</Name>\n    <Summary>1</Summary>\n  </Task>\n`;

            (wp.tasks || []).forEach((t: any) => {
                if (isValidDate(t.startDate) && isValidDate(t.endDate)) {
                    xml += `  <Task>\n    <UID>${uidMap[t.id]}</UID>\n    <ID>${uidMap[t.id]}</ID>\n    <Name>${t.id}: ${t.title}</Name>\n    <Start>${t.startDate}T08:00:00</Start>\n    <Finish>${t.endDate}T17:00:00</Finish>\n    <Notes>${t.description || ''}</Notes>\n`;

                    if (t.dependencies && t.dependencies.length > 0) {
                        t.dependencies.forEach((dep: any) => {
                            if (uidMap[dep.predecessorId]) {
                                let typeCode = 1;
                                if (dep.type === 'SS') typeCode = 0;
                                if (dep.type === 'SF') typeCode = 2;
                                if (dep.type === 'FF') typeCode = 3;

                                xml += `    <PredecessorLink>\n      <PredecessorUID>${uidMap[dep.predecessorId]}</PredecessorUID>\n      <Type>${typeCode}</Type>\n    </PredecessorLink>\n`;
                            }
                        });
                    }
                    xml += `  </Task>\n`;
                }
            });

            (wp.milestones || []).forEach((m: any) => {
                if (isValidDate(m.date)) {
                    xml += `  <Task>\n    <UID>${uidMap[m.id]}</UID>\n    <ID>${uidMap[m.id]}</ID>\n    <Name>${m.id}: ${m.description}</Name>\n    <Start>${m.date}T08:00:00</Start>\n    <Finish>${m.date}T08:00:00</Finish>\n    <Milestone>1</Milestone>\n  </Task>\n`;
                }
            });
        });

        xml += `</Tasks>\n</Project>`;
        const blob = new Blob([xml], { type: 'application/xml' });
        downloadBlob(blob, 'project_gantt.xml');
    };

    // --- Orthogonal Dependency Path Logic ---
    // v4.6+v4.7: Clamp path coordinates to [0, chartWidth] in project view
    const clampX = (x: number): number => {
        if (!isProjectView) return x;
        return Math.max(0, Math.min(x, chartWidth));
    };

    const getOrthogonalPath = (startX: number, startY: number, endX: number, endY: number, type: string): string => {
        const gap = 15;
        const sX = clampX(startX);
        const eX = clampX(endX);
        let path = `M ${sX} ${startY}`;

        if (type === 'FS') {
            const p1X = clampX(sX + gap);
            if (eX < p1X) {
                path += ` L ${p1X} ${startY}`;
                const safeY = endY - 10;
                path += ` L ${p1X} ${safeY}`;
                path += ` L ${clampX(eX - gap)} ${safeY}`;
                path += ` L ${clampX(eX - gap)} ${endY}`;
                path += ` L ${eX} ${endY}`;
            } else {
                path += ` L ${p1X} ${startY}`;
                path += ` L ${p1X} ${endY}`;
                path += ` L ${eX} ${endY}`;
            }
        } else if (type === 'SS') {
            const p1X = clampX(sX - gap);
            path += ` L ${p1X} ${startY}`;
            path += ` L ${p1X} ${endY}`;
            path += ` L ${eX} ${endY}`;
        } else if (type === 'FF') {
            const p1X = clampX(Math.max(sX, eX) + gap);
            path += ` L ${p1X} ${startY}`;
            path += ` L ${p1X} ${endY}`;
            path += ` L ${eX} ${endY}`;
        } else if (type === 'SF') {
            const p1X = clampX(sX - gap);
            path += ` L ${p1X} ${startY}`;
            path += ` L ${p1X} ${endY}`;
            path += ` L ${eX} ${endY}`;
        } else {
            path += ` L ${eX} ${endY}`;
        }

        return path;
    };

    const renderDependencies = () => {
        const paths: React.ReactElement[] = [];
        const taskRowIndexMap: Record<string, number> = {};
        let currentRowIndex = 0;

        activities.forEach(wp => {
            const wpTasks = (wp.tasks || []).filter((t: any) => isValidDate(t.startDate) && isValidDate(t.endDate));
            const wpMilestones = (wp.milestones || []).filter((m: any) => isValidDate(m.date));

            if (wpTasks.length > 0 || wpMilestones.length > 0) {
                currentRowIndex++; // WP header row

                const combinedItems = [
                    ...wpTasks.map((t: any) => ({ id: t.id, start: new Date(t.startDate) })),
                    ...wpMilestones.map((m: any) => ({ id: m.id, start: new Date(m.date) }))
                ];

                combinedItems.sort((a, b) => a.start.getTime() - b.start.getTime());

                combinedItems.forEach(item => {
                    taskRowIndexMap[item.id] = currentRowIndex;
                    currentRowIndex++;
                });
            }
        });

        allItems.forEach(item => {
            if (item.type !== 'task' || !item.dependencies) return;

            const targetRowIdx = taskRowIndexMap[item.id];
            if (targetRowIdx === undefined) return;
            const targetY = (targetRowIdx * ROW_HEIGHT) + HEADER_HEIGHT + (ROW_HEIGHT / 2) - 2;

            const tStart = getLeft(item.start);
            const tEnd = tStart + getWidth(item.start, item.end);

            item.dependencies.forEach((dep: any) => {
                const predecessor = taskMap[dep.predecessorId];
                if (!predecessor) return;

                const sourceRowIdx = taskRowIndexMap[predecessor.id];
                if (sourceRowIdx === undefined) return;
                const startY = (sourceRowIdx * ROW_HEIGHT) + HEADER_HEIGHT + (ROW_HEIGHT / 2) - 2;

                const pStart = getLeft(predecessor.start);
                const pEnd = pStart + getWidth(predecessor.start, predecessor.end);

                let startX: number, endX: number;
                const suffix = id;
                let marker = `url(#arrowhead-right-${suffix})`;

                switch (dep.type) {
                    case 'FS':
                        startX = pEnd;
                        endX = tStart;
                        break;
                    case 'SS':
                        startX = pStart;
                        endX = tStart;
                        break;
                    case 'FF':
                        startX = pEnd;
                        endX = tEnd;
                        marker = `url(#arrowhead-left-${suffix})`;
                        break;
                    case 'SF':
                        startX = pStart;
                        endX = tEnd;
                        marker = `url(#arrowhead-left-${suffix})`;
                        break;
                    default:
                        startX = pEnd;
                        endX = tStart;
                }

                if (isNaN(startX) || isNaN(endX)) return;

                const pathData = getOrthogonalPath(startX, startY, endX, targetY, dep.type);

                paths.push(
                    <path
                        key={`${item.id}-${dep.predecessorId}`}
                        d={pathData}
                        fill="none"
                        stroke="#64748b"
                        strokeWidth="1.5"
                        markerEnd={marker}
                        className="opacity-70 hover:opacity-100 hover:stroke-sky-600 hover:stroke-2 transition-all"
                    />
                );
            });
        });

        return paths;
    };

    // ─── Determine if we are in "project" (fit-to-container) mode ───
    const isProjectView = viewMode === 'project';

    // ★ FIX v4.7: Maximum right edge for content (bars, labels) – respects RIGHT_PAD
    const maxContentRight = chartWidth - RIGHT_PAD;

    return (
        <div
            ref={containerRef}
            id={id}
            className="mt-8 border border-slate-200 rounded-xl bg-white shadow-sm font-sans print:border-none print:shadow-none overflow-hidden"
            style={{ maxWidth: '100%', boxSizing: 'border-box' }}
        >
            {/* Toolbar */}
            {!forceViewMode && (
                <div className="gantt-toolbar bg-slate-50 border-b border-slate-200 p-4 flex flex-col sm:flex-row justify-between items-center gap-4 print:hidden rounded-t-xl">
                    <h3 className="text-lg font-bold text-slate-700 flex items-center">
                        <svg className="w-5 h-5 mr-2 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {t.ganttChart}
                    </h3>

                    <div className="flex gap-2">
                        <button onClick={handleExportXML} className="flex items-center px-3 py-1.5 bg-white border border-slate-300 rounded text-sm text-slate-700 hover:bg-slate-50">
                            <ICONS.DOCX className="w-4 h-4 mr-1" /> XML
                        </button>
                        <div className="flex bg-slate-200 rounded-lg p-1 ml-2">
                            {(Object.keys(VIEW_SETTINGS) as ViewMode[]).map((mode) => (
                                <button
                                    key={mode}
                                    onClick={() => setViewModeState(mode)}
                                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewModeState === mode ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                                >
                                    {t.views[mode]}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Scrollable / Fit-to-container Area */}
            <div
                id={forceViewMode ? `${id}-content` : 'gantt-chart-content'}
                className="custom-scrollbar relative w-full bg-white"
                ref={chartRef}
                style={{
                    overflowX: isProjectView ? 'hidden' : 'auto',
                    overflowY: isProjectView ? 'visible' : 'auto',
                    maxHeight: isProjectView ? 'none' : '700px',
                    height: isProjectView ? 'auto' : undefined
                }}
            >
                <div
                    style={{
                        width: isProjectView ? '100%' : `${Math.max(chartWidth, 100)}px`,
                        maxWidth: isProjectView ? '100%' : undefined,
                        minWidth: isProjectView ? undefined : '100%',
                        height: `${chartHeight}px`,
                        overflow: isProjectView ? 'hidden' : undefined
                    }}
                    className="relative bg-white"
                >
                    {/* SVG Layer for Dependencies */}
                    <svg
                        className="absolute inset-0 pointer-events-none z-10"
                        width={isProjectView ? chartWidth : '100%'}
                        height={chartHeight}
                        style={{ minHeight: '100%', overflow: 'hidden' }}
                        overflow="hidden"
                    >
                        <defs>
                            <marker id={`arrowhead-right-${id}`} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
                            </marker>
                            <marker id={`arrowhead-left-${id}`} markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                                <polygon points="10 0, 0 3.5, 10 7" fill="#64748b" />
                            </marker>
                        </defs>
                        {renderDependencies()}
                    </svg>

                    {/* Header: Time Markers — ★ FIX v4.7: uses LEFT_PAD-aware getLeft + maxContentRight */}
                    <div
                        className="border-b border-slate-200 bg-slate-50 sticky top-0 z-20 flex text-xs font-semibold text-slate-500 overflow-hidden"
                        style={{ height: `${HEADER_HEIGHT}px` }}
                    >
                        {markers.map((m, i) => {
                            const left = getLeft(m);
                            // ★ FIX v4.7: filter markers that would overflow past right pad
                            if (left > maxContentRight - 40) return null;
                            // Also skip markers that would be before the left pad
                            if (left < LEFT_PAD - 5) return null;

                            return (
                                <div
                                    key={i}
                                    className="absolute border-l border-slate-300 pl-2 h-full flex items-center whitespace-nowrap overflow-hidden text-ellipsis"
                                    style={{
                                        left: `${left}px`,
                                        maxWidth: isProjectView ? `${Math.max(maxContentRight - left - 5, 30)}px` : '100px'
                                    }}
                                >
                                    {getMarkerLabel(m)}
                                </div>
                            );
                        })}
                    </div>

                    {/* Grid Lines — ★ FIX v4.7: uses LEFT_PAD-aware getLeft */}
                    <div className="absolute inset-0 z-0 pointer-events-none top-10">
                        {markers.map((m, i) => {
                            const left = getLeft(m);
                            if (left > maxContentRight) return null;
                            if (left < LEFT_PAD - 5) return null;
                            return (
                                <div key={i} className="absolute border-l border-slate-100 h-full" style={{ left: `${left}px` }} />
                            );
                        })}
                    </div>

                    {/* Content Rows */}
                    <div className="relative z-0">
                        {activities.map((wp) => {
                            const wpTasks = (wp.tasks || []).filter((t: any) => isValidDate(t.startDate) && isValidDate(t.endDate));
                            const wpMilestones = (wp.milestones || []).filter((m: any) => isValidDate(m.date));

                            if (wpTasks.length === 0 && wpMilestones.length === 0) return null;

                            // Calculate WP Bounds
                            const taskStarts = wpTasks.map((t: any) => new Date(t.startDate).getTime());
                            const mileStarts = wpMilestones.map((m: any) => new Date(m.date).getTime());
                            const taskEnds = wpTasks.map((t: any) => new Date(t.endDate).getTime());
                            const allStarts = [...taskStarts, ...mileStarts];
                            const allEnds = [...taskEnds, ...mileStarts];

                            const wpStart = new Date(Math.min(...allStarts));
                            const wpEnd = new Date(Math.max(...allEnds));

                            const combinedItems = [
                                ...wpTasks.map((t: any) => ({ ...t, type: 'task' as const })),
                                ...wpMilestones.map((m: any) => ({ ...m, type: 'milestone' as const }))
                            ];
                            combinedItems.sort((a, b) => {
                                const startA = a.type === 'milestone' ? new Date(a.date).getTime() : new Date(a.startDate).getTime();
                                const startB = b.type === 'milestone' ? new Date(b.date).getTime() : new Date(b.startDate).getTime();
                                return startA - startB;
                            });

                            return (
                                <div key={wp.id} className="relative">
                                    {/* WP Row Header */}
                                    <div
                                        className="border-b border-slate-100 bg-slate-50/50 flex items-center px-4 font-bold text-xs text-slate-700 sticky left-0 z-10 w-full"
                                        style={{ height: `${ROW_HEIGHT}px` }}
                                    >
                                        {/* ★ FIX v4.7: WP bar uses getLeft which already includes LEFT_PAD */}
                                        <div
                                            className="absolute bg-slate-700 rounded-md opacity-90"
                                            style={{
                                                left: `${getLeft(wpStart)}px`,
                                                width: `${Math.max(Math.min(getWidth(wpStart, wpEnd), maxContentRight - getLeft(wpStart)), 5)}px`,
                                                height: `${BAR_HEIGHT}px`,
                                                top: `${BAR_OFFSET_Y}px`
                                            }}
                                        />
                                        <span className="relative z-10 bg-white/80 px-1 rounded">
                                            {wp.id}: {wp.title}
                                        </span>
                                    </div>

                                    {/* Tasks & Milestones Rows */}
                                    {combinedItems.map((item: any) => {
                                        const isHovered = hoveredTask === item.id;

                                        if (item.type === 'milestone') {
                                            const mDate = new Date(item.date);
                                            const left = getLeft(mDate);

                                            return (
                                                <div
                                                    key={item.id}
                                                    className="relative border-b border-slate-50 hover:bg-slate-50 transition-colors"
                                                    style={{ height: `${ROW_HEIGHT}px` }}
                                                >
                                                    {/* Diamond Marker */}
                                                    <div
                                                        className="absolute w-3.5 h-3.5 bg-black transform rotate-45 z-20 cursor-pointer hover:scale-125 transition-transform"
                                                        style={{
                                                            left: `${left - 7}px`,
                                                            top: `${(ROW_HEIGHT - 14) / 2}px`
                                                        }}
                                                        onMouseEnter={() => setHoveredTask(item.id)}
                                                        onMouseLeave={() => setHoveredTask(null)}
                                                        title={`${item.id}: ${item.description}`}
                                                    />

                                                    {/* Label — ★ FIX v4.7: uses maxContentRight */}
                                                    {(left + 10 < maxContentRight - 10) && (
                                                        <div
                                                            className="absolute text-[11px] font-bold text-slate-800 whitespace-nowrap px-2 pointer-events-none flex items-center overflow-hidden"
                                                            style={{
                                                                left: `${left + 10}px`,
                                                                maxWidth: isProjectView ? `${Math.max(maxContentRight - left - 15, 20)}px` : undefined,
                                                                height: '100%',
                                                                top: 0
                                                            }}
                                                        >
                                                            {item.id}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        } else {
                                            // Task Rendering
                                            const start = new Date(item.startDate);
                                            const end = new Date(item.endDate);
                                            const width = getWidth(start, end);
                                            const left = getLeft(start);

                                            const fullLabel = `${item.id}: ${item.title}`;
                                            const textWidth = fullLabel.length * 7 + 16;
                                            const fitsInside = width >= textWidth;
                                            // ★ FIX v4.7: use maxContentRight instead of chartWidth
                                            const fitsRight = (left + width + textWidth + 5) <= maxContentRight;
                                            const fitsLeft = (left - textWidth - 5) >= LEFT_PAD;

                                            // v4.6+v4.7: In project view, never use 'right' if it would overflow
                                            let labelPos = fitsInside
                                                ? 'inside'
                                                : (fitsRight && !isProjectView ? 'right' : (fitsLeft ? 'left' : 'inside-truncate'));

                                            // ★ FIX v4.7: Clamp bar width so it doesn't exceed right pad
                                            const clampedBarWidth = Math.min(width, maxContentRight - left);

                                            return (
                                                <div
                                                    key={item.id}
                                                    className="relative border-b border-slate-50 hover:bg-slate-50 transition-colors"
                                                    style={{ height: `${ROW_HEIGHT}px` }}
                                                >
                                                    <div
                                                        className={`absolute rounded-md shadow-sm cursor-pointer transition-all duration-200 flex items-center ${labelPos.startsWith('inside') ? 'justify-start pl-2' : 'justify-center'} ${isHovered ? 'bg-indigo-500 z-20' : 'bg-indigo-400'}`}
                                                        style={{
                                                            left: `${left}px`,
                                                            width: `${clampedBarWidth}px`,
                                                            height: `${BAR_HEIGHT}px`,
                                                            top: `${BAR_OFFSET_Y}px`
                                                        }}
                                                        onMouseEnter={() => setHoveredTask(item.id)}
                                                        onMouseLeave={() => setHoveredTask(null)}
                                                    >
                                                        {labelPos.startsWith('inside') && (
                                                            <span className="text-[11px] font-semibold text-white whitespace-nowrap overflow-hidden text-ellipsis w-full block px-1">
                                                                {fullLabel}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {(labelPos === 'right' || labelPos === 'left') && (
                                                        <div
                                                            className="absolute text-[11px] font-medium text-slate-600 whitespace-nowrap px-2 pointer-events-none flex items-center"
                                                            style={{
                                                                left: labelPos === 'left' ? `${left - 5}px` : `${left + width + 5}px`,
                                                                transform: labelPos === 'left' ? 'translateX(-100%)' : 'none',
                                                                height: '100%',
                                                                top: 0
                                                            }}
                                                        >
                                                            {fullLabel}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        }
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {!forceViewMode && (
                <div className="bg-slate-50 p-3 text-xs text-slate-500 border-t border-slate-200 text-center print:hidden rounded-b-xl">
                    {t.ganttChartDesc}
                </div>
            )}
        </div>
    );
};

export default GanttChart;
