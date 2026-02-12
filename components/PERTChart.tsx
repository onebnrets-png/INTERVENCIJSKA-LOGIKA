
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { TEXT } from '../locales.ts';
import { TECHNICAL_CONFIG } from '../services/TechnicalInstructions.ts';

// Extract constants
const { NODE_WIDTH, NODE_HEIGHT, X_GAP, Y_GAP, STYLES } = TECHNICAL_CONFIG.PERT;

const PERTChart = ({ activities, language = 'en', id = 'pert-chart-content', printMode = false, containerWidth: initialWidth = 1200 }) => {
    const [hoveredNode, setHoveredNode] = useState(null);
    const [zoom, setZoom] = useState(1);
    const [containerWidth, setContainerWidth] = useState(initialWidth);
    const [containerHeight, setContainerHeight] = useState(600);
    // Default to 'fit' mode
    const [viewMode, setViewMode] = useState<'fit' | 'manual'>('fit');
    
    const containerRef = useRef(null);
    const t = TEXT[language];

    // Measure container size for auto-fit logic
    useEffect(() => {
        if (!containerRef.current || printMode) {
            setContainerWidth(initialWidth);
            return;
        }
        
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentRect.width > 0) {
                    setContainerWidth(entry.contentRect.width);
                    setContainerHeight(entry.contentRect.height);
                }
            }
        });

        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, [printMode, initialWidth]);

    // 1. Process Data into Graph Structure & Calculate Critical Path
    const { nodes, edges, chartDimensions, criticalPathNodes, criticalPathEdges } = useMemo(() => {
        const nodeList = [];
        const nodeMap = new Map();
        const edgeList = [];

        // Flatten tasks and parse dates for logic
        activities.forEach((wp, wpIndex) => {
            (wp.tasks || []).forEach((task) => {
                if (task.id) {
                    const node = {
                        id: task.id,
                        title: task.title,
                        wpTitle: wp.title,
                        dependencies: task.dependencies || [],
                        startDate: task.startDate ? new Date(task.startDate) : null,
                        endDate: task.endDate ? new Date(task.endDate) : null,
                        duration: 0,
                        level: 0,
                        x: 0,
                        y: 0,
                        wpIndex 
                    };
                    
                    if (node.startDate && node.endDate) {
                        const diffTime = Math.abs(node.endDate.getTime() - node.startDate.getTime());
                        node.duration = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                    }

                    nodeList.push(node);
                    nodeMap.set(task.id, node);
                }
            });
        });

        // 2. Topological Sort / Level Calculation
        const levelCache = new Map();
        const getLevel = (nodeId, visited = new Set()) => {
            if (visited.has(nodeId)) return 0; // Cycle detection
            if (levelCache.has(nodeId)) return levelCache.get(nodeId);

            const node = nodeMap.get(nodeId);
            if (!node || !node.dependencies || node.dependencies.length === 0) {
                levelCache.set(nodeId, 0);
                return 0;
            }

            visited.add(nodeId);
            let maxPredLevel = -1;

            node.dependencies.forEach(dep => {
                const predLevel = getLevel(dep.predecessorId, new Set(visited));
                if (predLevel > maxPredLevel) maxPredLevel = predLevel;
            });

            const level = maxPredLevel + 1;
            levelCache.set(nodeId, level);
            return level;
        };

        nodeList.forEach(node => node.level = getLevel(node.id));

        // 3. Identify Critical Path (Heuristic: Longest Path logic based on End Dates)
        // Find maximum end date in project
        let maxEndDate = 0;
        nodeList.forEach(n => {
            if (n.endDate && n.endDate.getTime() > maxEndDate) maxEndDate = n.endDate.getTime();
        });

        const criticalNodesSet = new Set();
        const criticalEdgesSet = new Set();

        // Helper to trace back critical path
        const traceCriticalPath = (node) => {
            criticalNodesSet.add(node.id);
            if (!node.dependencies || node.dependencies.length === 0) return;

            let drivingDep = null;
            let latestPredEnd = 0;

            node.dependencies.forEach(dep => {
                const pred = nodeMap.get(dep.predecessorId);
                if (pred && pred.endDate) {
                    if (pred.endDate.getTime() > latestPredEnd) {
                        latestPredEnd = pred.endDate.getTime();
                        drivingDep = dep;
                    }
                }
            });

            if (drivingDep) {
                criticalEdgesSet.add(`${drivingDep.predecessorId}-${node.id}`);
                const predNode = nodeMap.get(drivingDep.predecessorId);
                if (predNode && !criticalNodesSet.has(predNode.id)) {
                    traceCriticalPath(predNode);
                }
            }
        };

        nodeList.forEach(n => {
            if (n.endDate && Math.abs(n.endDate.getTime() - maxEndDate) < (24 * 60 * 60 * 1000)) {
                traceCriticalPath(n);
            }
        });

        // 4. Layout Calculation (Vertical Centering)
        const levels = {};
        nodeList.forEach(node => {
            if (!levels[node.level]) levels[node.level] = [];
            levels[node.level].push(node);
        });

        let maxLevel = 0;
        let maxNodesInLevel = 0;
        
        Object.keys(levels).forEach(lvl => {
            const levelNum = parseInt(lvl);
            if (levelNum > maxLevel) maxLevel = levelNum;
            if (levels[lvl].length > maxNodesInLevel) maxNodesInLevel = levels[lvl].length;
        });

        const totalChartHeight = maxNodesInLevel * (NODE_HEIGHT + Y_GAP);

        Object.keys(levels).forEach(lvl => {
            const levelNum = parseInt(lvl);
            const nodesInLevel = levels[lvl];
            const levelHeight = nodesInLevel.length * (NODE_HEIGHT + Y_GAP) - Y_GAP;
            const startY = (totalChartHeight - levelHeight) / 2;

            nodesInLevel.forEach((node, idx) => {
                node.x = levelNum * (NODE_WIDTH + X_GAP) + 50;
                node.y = startY + (idx * (NODE_HEIGHT + Y_GAP)) + 50;
            });
        });

        // Generate Edges
        nodeList.forEach(node => {
            node.dependencies.forEach(dep => {
                const predecessor = nodeMap.get(dep.predecessorId);
                if (predecessor) {
                    edgeList.push({
                        from: predecessor,
                        to: node,
                        type: dep.type
                    });
                }
            });
        });

        return {
            nodes: nodeList,
            edges: edgeList,
            criticalPathNodes: criticalNodesSet,
            criticalPathEdges: criticalEdgesSet,
            chartDimensions: {
                width: (maxLevel + 1) * (NODE_WIDTH + X_GAP) + 100,
                height: Math.max(totalChartHeight + 100, 500)
            }
        };
    }, [activities]);

    // Calculate dynamic zoom for "Fit" mode
    useEffect(() => {
        if (viewMode === 'fit' && !printMode && containerWidth > 0 && containerHeight > 0) {
            const padding = 40;
            const availableWidth = containerWidth - padding;
            const availableHeight = containerHeight - padding;
            
            const scaleX = availableWidth / Math.max(chartDimensions.width, 1);
            const scaleY = availableHeight / Math.max(chartDimensions.height, 1);
            
            // Use the smaller scale to fit both dimensions, capped at 1.0 (no upscaling pixelation)
            const fitScale = Math.min(scaleX, scaleY, 1.0);
            setZoom(fitScale);
        }
    }, [viewMode, chartDimensions, containerWidth, containerHeight, printMode]);

    if (nodes.length === 0) {
        return (
            <div id={id} className="p-8 text-center bg-slate-50 border border-slate-200 rounded-lg text-slate-500 italic">
                {t.noDates || "No data available"}
            </div>
        );
    }

    const getPath = (startNode, endNode) => {
        const startX = startNode.x + NODE_WIDTH;
        const startY = startNode.y + (NODE_HEIGHT / 2);
        const endX = endNode.x;
        const endY = endNode.y + (NODE_HEIGHT / 2);

        const dist = Math.abs(endX - startX);
        const controlPoint1X = startX + (dist / 2);
        const controlPoint1Y = startY;
        const controlPoint2X = endX - (dist / 2);
        const controlPoint2Y = endY;

        return `M ${startX} ${startY} C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${endX} ${endY}`;
    };

    const handleZoomIn = () => {
        setViewMode('manual');
        setZoom(prev => Math.min(prev + 0.1, 2.0));
    };
    
    const handleZoomOut = () => {
        setViewMode('manual');
        setZoom(prev => Math.max(prev - 0.1, 0.2));
    };
    
    const handleResetZoom = () => {
        setViewMode('manual');
        setZoom(1);
    };

    const handleFitScreen = () => {
        setViewMode('fit');
    };

    // Apply styles based on printMode
    const containerClasses = printMode 
        ? "border border-slate-300 bg-white" // Print style
        : "mt-8 border border-slate-200 rounded-xl bg-white shadow-sm font-sans overflow-hidden"; // Interactive style

    const svgWidth = Math.max(chartDimensions.width, 100);
    const svgHeight = Math.max(chartDimensions.height, 100);

    return (
        <div id={id} ref={containerRef} className={containerClasses}>
            {!printMode && (
                <div className="bg-slate-50 border-b border-slate-200 p-4 flex flex-wrap gap-4 justify-between items-center rounded-t-xl">
                    <h3 className="text-lg font-bold text-slate-700 flex items-center">
                        <svg className="w-5 h-5 mr-2 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path></svg>
                        {t.pertChart}
                    </h3>
                    
                    <div className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 p-1 shadow-sm">
                        <button onClick={handleFitScreen} className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'fit' ? 'bg-sky-100 text-sky-700 font-bold' : 'hover:bg-slate-100 text-slate-600'}`}>
                            {t.views?.project || "Full Project"}
                        </button>
                        <div className="w-px h-4 bg-slate-200 mx-1"></div>
                        <button onClick={handleZoomOut} className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors" title="Zoom Out">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607ZM13 10H7" />
                            </svg>
                        </button>
                        <span className="text-xs font-mono w-10 text-center text-slate-500 select-none">{Math.round(zoom * 100)}%</span>
                        <button onClick={handleZoomIn} className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors" title="Zoom In">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607ZM10.5 7.5v6m3-3h-6" />
                            </svg>
                        </button>
                        <div className="w-px h-4 bg-slate-200 mx-1"></div>
                        <button onClick={handleResetZoom} className="px-2 py-1 text-xs hover:bg-slate-100 rounded text-slate-600 font-medium transition-colors">
                            100%
                        </button>
                    </div>
                </div>
            )}

            <div className="relative" style={{ height: printMode ? 'auto' : '600px' }}>
                {/* Legend Overlay */}
                {!printMode && (
                    <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-sm p-3 rounded-lg border border-slate-200 shadow text-xs z-50 pointer-events-none select-none">
                        <div className="font-bold text-slate-700 mb-2 border-b border-slate-100 pb-1">{t.pertLegend?.legend || "Legend"}</div>
                        
                        <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-8 h-1 bg-red-600"></div>
                            <span className="text-slate-600 font-semibold">{t.pertLegend?.critical || "Critical Path"}</span>
                        </div>

                        <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-8 h-0.5 bg-slate-300"></div>
                            <span className="text-slate-600">{t.pertLegend?.dependency || "Dependency"}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-8 h-0.5 bg-green-500"></div>
                            <span className="text-slate-600">{t.pertLegend?.incoming || "Predecessor"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-0.5 bg-sky-600"></div>
                            <span className="text-slate-600">{t.pertLegend?.outgoing || "Successor"}</span>
                        </div>
                    </div>
                )}

                <div 
                    className={`${printMode ? '' : 'overflow-auto custom-scrollbar'} bg-slate-50 relative w-full h-full`}
                    style={{ 
                        overflow: printMode ? 'visible' : 'auto' 
                    }}
                >
                    <svg 
                        width={printMode ? '100%' : Math.max(svgWidth * zoom, 100)} 
                        height={printMode ? '100%' : Math.max(svgHeight * zoom, 100)}
                        viewBox={printMode ? `0 0 ${svgWidth} ${svgHeight}` : undefined}
                        style={{ display: 'block' }} // Remove bottom gap
                    >
                        <defs>
                            <marker id="arrowhead-pert" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="#cbd5e1" />
                            </marker>
                            <marker id="arrowhead-pert-blue" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="#0284c7" />
                            </marker>
                            <marker id="arrowhead-pert-green" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="#22c55e" />
                            </marker>
                            <marker id="arrowhead-pert-critical" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                {/* RED marker for critical path */}
                                <polygon points="0 0, 10 3.5, 0 7" fill="#dc2626" />
                            </marker>
                        </defs>

                        <g transform={printMode ? '' : `scale(${zoom})`} style={{ transformOrigin: '0 0' }}>
                            {/* Connections */}
                            {edges.map((edge) => {
                                const isActive = hoveredNode && (hoveredNode === edge.from.id || hoveredNode === edge.to.id);
                                const isIncoming = hoveredNode === edge.to.id; 
                                const isOutgoing = hoveredNode === edge.from.id; 
                                const isCritical = criticalPathEdges.has(`${edge.from.id}-${edge.to.id}`);
                                
                                let strokeColor = STYLES.EDGE_DEFAULT;
                                let marker = "url(#arrowhead-pert)";
                                let strokeWidth = "2";
                                let opacity = "1";

                                if (isCritical) {
                                    strokeColor = STYLES.EDGE_CRITICAL;
                                    strokeWidth = "4"; 
                                    marker = "url(#arrowhead-pert-critical)";
                                }

                                if (isActive && !printMode) {
                                    strokeWidth = "3";
                                    opacity = "1";
                                    if (isIncoming) {
                                        strokeColor = STYLES.EDGE_ACTIVE_INCOMING; 
                                        marker = "url(#arrowhead-pert-green)"; 
                                    } else if (isOutgoing) {
                                        strokeColor = STYLES.EDGE_ACTIVE_OUTGOING; 
                                        marker = "url(#arrowhead-pert-blue)";
                                    }
                                } else if (hoveredNode && !isCritical && !printMode) {
                                     opacity = "0.2";
                                }

                                return (
                                    <path
                                        key={`${edge.from.id}-${edge.to.id}`}
                                        d={getPath(edge.from, edge.to)}
                                        fill="none"
                                        stroke={strokeColor}
                                        strokeWidth={strokeWidth}
                                        markerEnd={marker}
                                        style={{ opacity, transition: 'opacity 0.2s, stroke 0.2s' }}
                                    />
                                );
                            })}

                            {/* Nodes */}
                            {nodes.map((node) => {
                                const isHovered = hoveredNode === node.id;
                                const isCritical = criticalPathNodes.has(node.id);
                                
                                const colors = ['border-l-sky-500', 'border-l-indigo-500', 'border-l-purple-500', 'border-l-pink-500', 'border-l-orange-500'];
                                let borderColorClass = colors[node.wpIndex % colors.length];
                                
                                let shadowClass = "shadow-sm";
                                if (isCritical) {
                                    borderColorClass = "border-l-red-600 ring-1 ring-red-300"; 
                                    shadowClass = "shadow-md shadow-red-100";
                                }

                                return (
                                    <g 
                                        key={node.id} 
                                        transform={`translate(${node.x}, ${node.y})`}
                                        onMouseEnter={() => !printMode && setHoveredNode(node.id)}
                                        onMouseLeave={() => !printMode && setHoveredNode(null)}
                                        className={printMode ? "" : "cursor-pointer"}
                                    >
                                        <foreignObject width={NODE_WIDTH} height={NODE_HEIGHT}>
                                            <div 
                                                className={`
                                                    h-full w-full bg-white rounded-xl border flex flex-col justify-between p-3
                                                    ${isHovered && !printMode ? 'shadow-xl scale-105 z-10' : shadowClass}
                                                    ${isCritical ? STYLES.NODE_BORDER_CRITICAL : STYLES.NODE_BORDER_DEFAULT}
                                                    border-l-4 ${borderColorClass}
                                                    ${!printMode ? 'transition-all duration-200' : ''}
                                                `}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <span className={`font-bold text-xs ${isCritical ? 'text-red-700' : 'text-slate-500'}`}>{node.id}</span>
                                                    {node.duration > 0 && (
                                                        <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded-full text-slate-500 font-mono">
                                                            {node.duration}d
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs font-semibold text-slate-800 leading-tight line-clamp-2 mt-1">
                                                    {node.title || "Untitled Task"}
                                                </div>
                                            </div>
                                        </foreignObject>
                                    </g>
                                );
                            })}
                        </g>
                    </svg>
                </div>
            </div>
             {!printMode && (
                 <div className="bg-slate-50 p-3 text-xs text-slate-500 border-t border-slate-200 text-center rounded-b-xl">
                     {t.pertChartDesc}
                </div>
             )}
        </div>
    );
};

export default PERTChart;
