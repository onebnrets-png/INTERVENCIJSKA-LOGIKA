
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { TEXT } from '../locales.ts';
import { ICONS } from '../constants.tsx';
import { downloadBlob } from '../utils.ts';
import { TECHNICAL_CONFIG } from '../services/TechnicalInstructions.ts';

// Extract constants from Technical Configuration
const { ONE_DAY_MS, MIN_BAR_WIDTH, HEADER_HEIGHT, ROW_HEIGHT, BAR_HEIGHT, BAR_OFFSET_Y, VIEW_SETTINGS } = TECHNICAL_CONFIG.GANTT;

// Helper to check if a date string is valid
const isValidDate = (d) => d && !isNaN(new Date(d).getTime());

type ViewMode = 'week' | 'month' | 'quarter' | 'semester' | 'year' | 'project';

const GanttChart = ({ activities, language = 'en', id = 'gantt-chart-content', forceViewMode = null, containerWidth: initialWidth = 1200 }) => {
    const [hoveredTask, setHoveredTask] = useState(null);
    const [viewModeState, setViewModeState] = useState<ViewMode>('project');
    const [containerWidth, setContainerWidth] = useState(initialWidth);
    const chartRef = useRef(null);
    const containerRef = useRef(null);
    const t = TEXT[language];

    // Use forced view mode if provided (for export), otherwise internal state
    const viewMode = forceViewMode || viewModeState;

    // Measure container width for "Project" view scaling, unless forced via prop
    useEffect(() => {
        if (!containerRef.current || forceViewMode) {
            // If forced mode (export), stick to the initialWidth prop
            setContainerWidth(initialWidth);
            return;
        }
        
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // Only update if we have a valid width to avoid collapsing to 0 when hidden
                if (entry.contentRect.width > 0) {
                    setContainerWidth(entry.contentRect.width);
                }
            }
        });

        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, [initialWidth, forceViewMode]);

    // 1. Flatten all tasks with valid dates to find min/max and create a map
    // Updated to include Milestones
    const { allItems, taskMap, rows } = useMemo(() => {
        const items = [];
        const map = {};
        const rowsList = [];

        activities.forEach(wp => {
            // Check for valid tasks first
            const validTasks = (wp.tasks || []).filter(t => isValidDate(t.startDate) && isValidDate(t.endDate));
            const validMilestones = (wp.milestones || []).filter(m => isValidDate(m.date));
            
            if (validTasks.length > 0 || validMilestones.length > 0) {
                rowsList.push({ type: 'wp', id: wp.id, title: wp.title }); // Add WP row

                validTasks.forEach(task => {
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

                validMilestones.forEach(ms => {
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
        
        // Sorting items by date for calculating range
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
    // Calculate raw bounds first
    const rawMin = Math.min(...allItems.map(t => t.type === 'milestone' ? t.date.getTime() : t.start.getTime()));
    const rawMax = Math.max(...allItems.map(t => t.type === 'milestone' ? t.date.getTime() : t.end.getTime()));
    
    let paddingDays = 0;
    if (viewMode === 'project') {
         const durationDays = (rawMax - rawMin) / ONE_DAY_MS;
         // Add 5% padding on each side (total 10%) or at least 10 days to ensure lines are visible
         paddingDays = Math.max(durationDays * 0.05, 10);
    } else {
         paddingDays = viewMode === 'week' ? 14 : viewMode === 'month' ? 30 : 90;
    }

    const minDate = new Date(rawMin - (paddingDays * ONE_DAY_MS));
    const maxDate = new Date(rawMax + (paddingDays * ONE_DAY_MS));
    
    // Snap dates based on view
    if (viewMode === 'year') minDate.setMonth(0, 1);
    else if (viewMode === 'month' || viewMode === 'quarter' || viewMode === 'project') minDate.setDate(1);
    else if (viewMode === 'semester') {
        minDate.setDate(1);
        const m = minDate.getMonth();
        minDate.setMonth(m < 6 ? 0 : 6);
    }

    const totalDays = Math.ceil((maxDate.getTime() - minDate.getTime()) / ONE_DAY_MS) + 1;

    // 3. Calculate Pixels Per Day
    let pixelsPerDay = VIEW_SETTINGS[viewMode]?.px;
    if (viewMode === 'project') {
        // Fit to container width (subtracting small padding for scrollbar/margins)
        // Ensure we don't divide by zero or have negative scale
        const availableWidth = Math.max(containerWidth - 20, 100); 
        pixelsPerDay = availableWidth / Math.max(totalDays, 1);
    }

    const chartWidth = totalDays * pixelsPerDay;
    // FIX: Add generous buffer (80px) to chart height to prevent bottom cutoff of arrows or last row
    const chartHeight = (rows.length * ROW_HEIGHT) + HEADER_HEIGHT + 80;

    // 4. Generate Timeline Markers
    // For 'project' view, we need an adaptive marker strategy to avoid clutter
    const markers = [];
    let currentDate = new Date(minDate);
    
    let markerMode = viewMode;
    if (viewMode === 'project') {
        // Adaptive strategy based on average px per label
        // Assume a label needs ~60px
        const maxLabels = containerWidth / 60;
        const daysPerLabel = totalDays / maxLabels;
        
        if (daysPerLabel > 365) markerMode = 'year';
        else if (daysPerLabel > 90) markerMode = 'semester'; // or year
        else if (daysPerLabel > 30) markerMode = 'quarter';
        else if (daysPerLabel > 7) markerMode = 'month';
        else markerMode = 'week';
    }

    // Align start date for week view logic if needed
    if (markerMode === 'week') {
        const day = currentDate.getDay();
        const diff = currentDate.getDate() - day + (day === 0 ? -6 : 1);
        currentDate.setDate(diff);
    }

    // Add buffer to loop end to ensure last label appears
    const loopEndDate = new Date(maxDate.getTime() + (365 * ONE_DAY_MS)); 

    while (currentDate <= loopEndDate) {
        markers.push(new Date(currentDate));
        
        // Increment based on effective marker mode
        switch(markerMode) {
            case 'week': currentDate.setDate(currentDate.getDate() + 7); break;
            case 'month': currentDate.setMonth(currentDate.getMonth() + 1); break;
            case 'quarter': currentDate.setMonth(currentDate.getMonth() + 3); break;
            case 'semester': currentDate.setMonth(currentDate.getMonth() + 6); break;
            case 'year': currentDate.setFullYear(currentDate.getFullYear() + 1); break;
            default: currentDate.setMonth(currentDate.getMonth() + 1);
        }
        
        if (markers.length > 1000) break; // Safety break
    }

    const getLeft = (date) => ((date.getTime() - minDate.getTime()) / ONE_DAY_MS) * pixelsPerDay;
    const getWidth = (start, end) => Math.max(((end.getTime() - start.getTime()) / ONE_DAY_MS) * pixelsPerDay, MIN_BAR_WIDTH);

    const getMarkerLabel = (date) => {
        // Use markerMode for formatting logic
        switch(markerMode) {
            case 'week': return date.toLocaleDateString(language, { day: 'numeric', month: 'short' });
            case 'month': return date.toLocaleDateString(language, { month: 'short', year: '2-digit' });
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
        const uidMap = {};

        // 1. Assign UIDs
        activities.forEach(wp => {
            uidMap[wp.id] = uidCounter++;
            (wp.tasks || []).forEach(t => {
                uidMap[t.id] = uidCounter++;
            });
            (wp.milestones || []).forEach(m => {
                if(isValidDate(m.date)) uidMap[m.id] = uidCounter++;
            });
        });

        // 2. Generate Nodes
        activities.forEach(wp => {
            xml += `  <Task>\n    <UID>${uidMap[wp.id]}</UID>\n    <ID>${uidMap[wp.id]}</ID>\n    <Name>${wp.id}: ${wp.title}</Name>\n    <Summary>1</Summary>\n  </Task>\n`;
            
            (wp.tasks || []).forEach(t => {
                if (isValidDate(t.startDate) && isValidDate(t.endDate)) {
                     xml += `  <Task>\n    <UID>${uidMap[t.id]}</UID>\n    <ID>${uidMap[t.id]}</ID>\n    <Name>${t.id}: ${t.title}</Name>\n    <Start>${t.startDate}T08:00:00</Start>\n    <Finish>${t.endDate}T17:00:00</Finish>\n    <Notes>${t.description || ''}</Notes>\n`;
                     
                     if (t.dependencies && t.dependencies.length > 0) {
                         t.dependencies.forEach(dep => {
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

            (wp.milestones || []).forEach(m => {
                if(isValidDate(m.date)) {
                    xml += `  <Task>\n    <UID>${uidMap[m.id]}</UID>\n    <ID>${uidMap[m.id]}</ID>\n    <Name>${m.id}: ${m.description}</Name>\n    <Start>${m.date}T08:00:00</Start>\n    <Finish>${m.date}T08:00:00</Finish>\n    <Milestone>1</Milestone>\n  </Task>\n`;
                }
            });
        });

        xml += `</Tasks>\n</Project>`;
        const blob = new Blob([xml], { type: 'application/xml' });
        downloadBlob(blob, 'project_gantt.xml');
    };

    // --- Orthogonal Dependency Path Logic ---
    const getOrthogonalPath = (startX, startY, endX, endY, type) => {
        const gap = 15; 
        let path = `M ${startX} ${startY}`;

        if (type === 'FS') {
            const p1X = startX + gap;
            
            if (endX < p1X) {
                path += ` L ${p1X} ${startY}`; 
                const safeY = endY - 10;
                path += ` L ${p1X} ${safeY}`; 
                path += ` L ${endX - gap} ${safeY}`; 
                path += ` L ${endX - gap} ${endY}`; 
                path += ` L ${endX} ${endY}`; 
            } else {
                path += ` L ${p1X} ${startY}`; 
                path += ` L ${p1X} ${endY}`;   
                path += ` L ${endX} ${endY}`;  
            }
        } 
        else if (type === 'SS') {
            const p1X = startX - gap;
            path += ` L ${p1X} ${startY}`;
            path += ` L ${p1X} ${endY}`;
            path += ` L ${endX} ${endY}`;
        }
        else if (type === 'FF') {
            const p1X = Math.max(startX, endX) + gap;
            path += ` L ${p1X} ${startY}`;
            path += ` L ${p1X} ${endY}`;
            path += ` L ${endX} ${endY}`;
        }
        else if (type === 'SF') {
            const p1X = startX - gap;
            if (endX > p1X) {
                 path += ` L ${p1X} ${startY}`;
                 path += ` L ${p1X} ${endY}`;
                 path += ` L ${endX} ${endY}`;
            } else {
                 path += ` L ${p1X} ${startY}`;
                 path += ` L ${p1X} ${endY}`;
                 path += ` L ${endX} ${endY}`;
            }
        }
        else {
             path += ` L ${endX} ${endY}`;
        }
        
        return path;
    };

    const renderDependencies = () => {
        const paths = [];
        const taskRowIndexMap = {};
        let currentRowIndex = 0;
        
        activities.forEach(wp => {
             const wpTasks = (wp.tasks || []).filter(t => isValidDate(t.startDate) && isValidDate(t.endDate));
             const wpMilestones = (wp.milestones || []).filter(m => isValidDate(m.date));
             
             if (wpTasks.length > 0 || wpMilestones.length > 0) {
                 currentRowIndex++; 
                 
                 const combinedItems = [
                     ...wpTasks.map(t => ({ id: t.id, start: new Date(t.startDate) })),
                     ...wpMilestones.map(m => ({ id: m.id, start: new Date(m.date) })) 
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

            item.dependencies.forEach(dep => {
                const predecessor = taskMap[dep.predecessorId];
                if (!predecessor) return; 

                const sourceRowIdx = taskRowIndexMap[predecessor.id];
                if (sourceRowIdx === undefined) return;
                const startY = (sourceRowIdx * ROW_HEIGHT) + HEADER_HEIGHT + (ROW_HEIGHT / 2) - 2;

                const pStart = getLeft(predecessor.start);
                const pEnd = pStart + getWidth(predecessor.start, predecessor.end);
                
                let startX, endX;
                const suffix = id; 
                let marker = `url(#arrowhead-right-${suffix})`; 

                switch(dep.type) {
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

    return (
        <div ref={containerRef} id={id} className="mt-8 border border-slate-200 rounded-xl bg-white shadow-sm font-sans print:border-none print:shadow-none overflow-hidden">
            {/* Toolbar */}
            {!forceViewMode && (
                <div className="gantt-toolbar bg-slate-50 border-b border-slate-200 p-4 flex flex-col sm:flex-row justify-between items-center gap-4 print:hidden rounded-t-xl">
                    <h3 className="text-lg font-bold text-slate-700 flex items-center">
                        <svg className="w-5 h-5 mr-2 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        {t.ganttChart}
                    </h3>
                    
                    <div className="flex gap-2">
                        <button onClick={handleExportXML} className="flex items-center px-3 py-1.5 bg-white border border-slate-300 rounded text-sm text-slate-700 hover:bg-slate-50">
                            <ICONS.DOCX className="w-4 h-4 mr-1"/> XML
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

            {/* Scrollable Area */}
            <div 
                id={forceViewMode ? `${id}-content` : 'gantt-chart-content'} 
                className="custom-scrollbar relative w-full bg-white" 
                ref={chartRef}
                style={{ 
                    overflow: viewMode === 'project' ? 'visible' : 'auto',
                    maxHeight: viewMode === 'project' ? 'none' : '700px',
                    height: viewMode === 'project' ? 'auto' : undefined
                }}
            >
                <div style={{ width: `${Math.max(chartWidth, 100)}px`, minWidth: '100%', height: `${chartHeight}px` }} className="relative bg-white">
                    
                    {/* SVG Layer for Dependencies */}
                    <svg className="absolute inset-0 pointer-events-none z-10" width="100%" height={chartHeight} style={{ minHeight: '100%' }}>
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

                    {/* Header: Time Markers */}
                    <div className="border-b border-slate-200 bg-slate-50 sticky top-0 z-20 flex text-xs font-semibold text-slate-500 overflow-hidden" style={{ height: `${HEADER_HEIGHT}px` }}>
                        {markers.map((m, i) => {
                            const left = getLeft(m);
                            if (left > chartWidth - 40) return null;
                            
                            return (
                                <div 
                                    key={i} 
                                    className="absolute border-l border-slate-300 pl-2 h-full flex items-center whitespace-nowrap overflow-hidden text-ellipsis"
                                    style={{ 
                                        left: `${left}px`,
                                        maxWidth: '100px'
                                    }}
                                >
                                    {getMarkerLabel(m)}
                                </div>
                            );
                        })}
                    </div>

                    {/* Grid Lines */}
                    <div className="absolute inset-0 z-0 pointer-events-none top-10">
                        {markers.map((m, i) => {
                             const left = getLeft(m);
                             if (left > chartWidth) return null;
                             return (
                                <div key={i} className="absolute border-l border-slate-100 h-full" style={{ left: `${left}px` }}></div>
                            );
                        })}
                    </div>

                    {/* Content Rows */}
                    <div className="relative z-0">
                        {activities.map((wp, wpIndex) => {
                            const wpTasks = (wp.tasks || []).filter(t => isValidDate(t.startDate) && isValidDate(t.endDate));
                            const wpMilestones = (wp.milestones || []).filter(m => isValidDate(m.date));
                            
                            if (wpTasks.length === 0 && wpMilestones.length === 0) return null;

                            // Calculate WP Bounds
                            const taskStarts = wpTasks.map(t => new Date(t.startDate).getTime());
                            const mileStarts = wpMilestones.map(m => new Date(m.date).getTime());
                            const taskEnds = wpTasks.map(t => new Date(t.endDate).getTime());
                            const allStarts = [...taskStarts, ...mileStarts];
                            const allEnds = [...taskEnds, ...mileStarts];

                            const wpStart = new Date(Math.min(...allStarts));
                            const wpEnd = new Date(Math.max(...allEnds));

                            const combinedItems = [
                                ...wpTasks.map(t => ({...t, type: 'task'})),
                                ...wpMilestones.map(m => ({...m, type: 'milestone'}))
                            ];
                            combinedItems.sort((a, b) => {
                                const startA = a.type === 'milestone' ? new Date(a.date).getTime() : new Date(a.startDate).getTime();
                                const startB = b.type === 'milestone' ? new Date(b.date).getTime() : new Date(b.startDate).getTime();
                                return startA - startB;
                            });

                            return (
                                <div key={wp.id} className="relative">
                                    {/* WP Row Header */}
                                    <div className="border-b border-slate-100 bg-slate-50/50 flex items-center px-4 font-bold text-xs text-slate-700 sticky left-0 z-10 w-full" style={{ height: `${ROW_HEIGHT}px` }}>
                                         <div 
                                            className="absolute bg-slate-700 rounded-md opacity-90"
                                            style={{ 
                                                left: `${getLeft(wpStart)}px`, 
                                                width: `${Math.max(getWidth(wpStart, wpEnd), 5)}px`, 
                                                height: `${BAR_HEIGHT}px`,
                                                top: `${BAR_OFFSET_Y}px` 
                                            }}
                                        ></div>
                                        <span className="relative z-10 bg-white/80 px-1 rounded">{wp.id}: {wp.title}</span>
                                    </div>

                                    {/* Tasks & Milestones Rows */}
                                    {combinedItems.map((item) => {
                                        const isHovered = hoveredTask === item.id;
                                        
                                        if (item.type === 'milestone') {
                                            const mDate = new Date(item.date);
                                            const left = getLeft(mDate);
                                            
                                            return (
                                                <div key={item.id} className="relative border-b border-slate-50 hover:bg-slate-50 transition-colors" style={{ height: `${ROW_HEIGHT}px` }}>
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
                                                    ></div>
                                                    
                                                    {/* Label */}
                                                    <div 
                                                        className="absolute text-[11px] font-bold text-slate-800 whitespace-nowrap px-2 pointer-events-none flex items-center"
                                                        style={{ 
                                                            left: `${left + 10}px`,
                                                            height: '100%',
                                                            top: 0
                                                        }}
                                                    >
                                                        {item.id}
                                                    </div>
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
                                            const fitsRight = (left + width + textWidth + 5) <= chartWidth;
                                            const fitsLeft = (left - textWidth - 5) >= 0;

                                            let labelPos = fitsInside ? 'inside' : (fitsRight ? 'right' : (fitsLeft ? 'left' : 'inside-truncate'));

                                            return (
                                                <div key={item.id} className="relative border-b border-slate-50 hover:bg-slate-50 transition-colors" style={{ height: `${ROW_HEIGHT}px` }}>
                                                    <div
                                                        className={`absolute rounded-md shadow-sm cursor-pointer transition-all duration-200 flex items-center ${labelPos.startsWith('inside') ? 'justify-start pl-2' : 'justify-center'} ${isHovered ? 'bg-indigo-500 z-20' : 'bg-indigo-400'}`}
                                                        style={{ 
                                                            left: `${left}px`, 
                                                            width: `${width}px`, 
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
