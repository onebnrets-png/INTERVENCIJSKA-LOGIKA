// components/Organigram.tsx v1.2
// ═══════════════════════════════════════════════════════════════
// CHANGELOG:
// v1.2 — FEAT: Responsive layout — removes min-w-[800px] on mobile,
//         stacks strategic layer vertically on narrow screens.
// v1.1 — FEAT: Added CTRL+Scroll zoom, drag-to-pan, pinch-to-zoom,
//         double-click reset, ZoomBadge.
// v1.0 — Initial implementation with hierarchical org chart layout.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { useZoomPan } from '../hooks/useZoomPan';
import { ZoomBadge } from '../hooks/ZoomBadge';

const Organigram = ({ structure, activities, language = 'en', id, forceViewMode = false, containerWidth: _cw, printMode = false, projectManagement }: any) => {
    const {
        containerRef: zoomContainerRef,
        containerStyle: zoomContainerStyle,
        contentStyle: zoomContentStyle,
        zoomBadgeText,
        resetZoom,
    } = useZoomPan({ minScale: 0.5, maxScale: 2.0, scaleStep: 0.1 });

    // ★ v1.2: Responsive breakpoint
    const [isNarrow, setIsNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
    useEffect(() => {
        if (printMode || forceViewMode) return;
        const handleResize = () => setIsNarrow(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [printMode, forceViewMode]);

    const coordinator = structure?.coordinator || "Project Coordinator";
    const steering = structure?.steeringCommittee || "Steering Committee";
    const advisory = structure?.advisoryBoard || "Advisory Board";
    const technical = structure?.technical || (language === 'si' ? "Tehnični vodja" : "Technical Manager");
    const wpLeaders = structure?.wpLeaders || (language === 'si' ? "Vodje DS" : "WP Leaders");

    const Card = ({ title, role, colorClass, icon, isCenter = false }: any) => (
        <div className={`
            relative z-10
            flex flex-col items-center justify-center
            bg-white p-4 rounded-xl shadow-lg border-t-4 ${colorClass}
            transition-all hover:-translate-y-1 hover:shadow-2xl duration-300
            ${isNarrow ? 'min-w-[160px] max-w-[200px]' : 'min-w-[200px] max-w-[240px]'}
            ${isCenter ? 'ring-4 ring-slate-100' : ''}
        `}>
            <div className={`mb-3 p-3 rounded-full shadow-inner ${colorClass.replace('border-t-', 'bg-').replace('500', '50').replace('600', '50')}`}>
                {icon}
            </div>
            <div className="text-center">
                <h5 className={`font-bold text-slate-800 leading-tight mb-1 ${isNarrow ? 'text-xs' : 'text-sm'}`}>{title}</h5>
                {role && <span className="inline-block px-2 py-0.5 bg-slate-100 text-[10px] text-slate-500 uppercase tracking-wider rounded-md font-semibold">{role}</span>}
            </div>
        </div>
    );

    const UserIcon = ({ color = "text-slate-600" }: any) => (
        <svg className={`${isNarrow ? 'w-6 h-6' : 'w-8 h-8'} ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    );

    const GroupIcon = ({ color = "text-slate-600" }: any) => (
        <svg className={`${isNarrow ? 'w-6 h-6' : 'w-8 h-8'} ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
    );

    const TechIcon = ({ color = "text-slate-600" }: any) => (
        <svg className={`${isNarrow ? 'w-6 h-6' : 'w-8 h-8'} ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
    );

    const WPIcon = ({ id: wpId }: any) => (
        <div className={`${isNarrow ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'} bg-gradient-to-br from-slate-100 to-slate-200 rounded-lg flex items-center justify-center shadow-sm border border-slate-300 text-slate-600 font-bold`}>
            {wpId}
        </div>
    );

    return (
        <div
            id={id}
            ref={zoomContainerRef}
            className="w-full p-8 bg-slate-50 relative rounded-xl border border-slate-200"
            style={{
                ...zoomContainerStyle,
                overflow: 'auto',
                padding: isNarrow ? '16px 8px' : undefined,
            }}
        >
            <ZoomBadge
                zoomText={zoomBadgeText}
                onReset={resetZoom}
                language={language === 'si' ? 'sl' : 'en'}
            />

            <div style={zoomContentStyle}>
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

                {/* ★ v1.2: Remove min-w-[800px] on mobile — allow natural flow */}
                <div className={`flex flex-col items-center relative z-10 ${isNarrow ? 'min-w-0' : 'min-w-[800px]'}`}>

                    <svg className="absolute w-full h-full pointer-events-none top-0 left-0" style={{ zIndex: 0 }}>
                        <defs>
                            <marker id="arrowhead-down" markerWidth="10" markerHeight="7" refX="5" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="#cbd5e1" />
                            </marker>
                        </defs>
                    </svg>

                    {/* Level 1: Strategic Layer — ★ v1.2: stack vertically on narrow */}
                    <div className={`${isNarrow ? 'flex flex-col items-center gap-6' : 'flex justify-center gap-20 items-start'} mb-16 relative w-full`}>
                        {/* Steering Committee */}
                        <div className={`flex flex-col items-center relative ${isNarrow ? '' : 'mt-8'} group`}>
                            <Card
                                title={steering}
                                role={language === 'si' ? "Odločanje" : "Decision Making"}
                                colorClass="border-t-amber-500"
                                icon={<GroupIcon color="text-amber-600"/>}
                            />
                            {!isNarrow && <div className="absolute top-1/2 left-full w-20 h-0.5 bg-slate-300 -z-10 group-hover:bg-amber-300 transition-colors"></div>}
                        </div>

                        {/* Coordinator (Center) */}
                        <div className="flex flex-col items-center z-10 relative">
                            {!isNarrow && <div className="absolute -top-12 text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2">Project Management</div>}
                            <Card
                                title={coordinator}
                                role={language === 'si' ? "Vodenje & Koordinacija" : "Management & Coordination"}
                                colorClass="border-t-sky-600"
                                icon={<UserIcon color="text-sky-700"/>}
                                isCenter={true}
                            />
                            <div className={`${isNarrow ? 'h-8' : 'h-16'} w-0.5 bg-slate-300 mx-auto`}></div>
                        </div>

                        {/* Advisory Board */}
                        <div className={`flex flex-col items-center relative ${isNarrow ? '' : 'mt-8'} group`}>
                            {!isNarrow && <div className="absolute top-1/2 right-full w-20 h-0.5 bg-slate-300 dashed -z-10 border-b-2 border-dashed border-slate-300 h-0 group-hover:border-purple-300 transition-colors"></div>}
                            <Card
                                title={advisory}
                                role={language === 'si' ? "Strokovno Svetovanje" : "Expert Consulting"}
                                colorClass="border-t-purple-500"
                                icon={<GroupIcon color="text-purple-600"/>}
                            />
                        </div>
                    </div>

                    {/* Level 2: Operational Management */}
                    <div className="flex flex-col items-center mb-12 relative w-full">
                        <Card
                            title={technical}
                            role={language === 'si' ? "Operativa & Kakovost" : "Ops & Quality Assurance"}
                            colorClass="border-t-emerald-500"
                            icon={<TechIcon color="text-emerald-600"/>}
                        />
                        <div className={`${isNarrow ? 'h-6' : 'h-12'} w-0.5 bg-slate-300 mx-auto`}></div>
                    </div>

                    {/* Level 3: Work Packages */}
                    <div className="relative w-full">
                        {!isNarrow && <div className="absolute top-0 left-[10%] right-[10%] h-4 border-t-2 border-slate-300 -z-10 rounded-t-xl"></div>}

                        <div className={`flex justify-center w-full ${isNarrow ? 'px-2 gap-3' : 'px-4 gap-6'} flex-wrap pt-4`}>
                            {activities && activities.map((wp: any, i: number) => (
                                <div key={i} className={`${isNarrow ? 'flex-1 min-w-[110px] max-w-[140px]' : 'flex-1 min-w-[140px] max-w-[180px]'} flex flex-col items-center relative`}>
                                    {!isNarrow && <div className="absolute -top-4 w-0.5 h-4 bg-slate-300"></div>}

                                    <div className="bg-white border-b-4 border-slate-300 p-4 rounded-xl shadow-md text-center hover:shadow-lg transition-all hover:-translate-y-1 h-full flex flex-col justify-start items-center w-full group hover:border-sky-400">
                                        <div className="mb-2 transform group-hover:scale-110 transition-transform">
                                            <WPIcon id={wp.id} />
                                        </div>
                                        <p className={`${isNarrow ? 'text-[10px]' : 'text-xs'} font-bold text-slate-700 leading-tight mb-2 line-clamp-3`} title={wp.title}>
                                            {wp.title || "Untitled WP"}
                                        </p>
                                        <div className="mt-auto pt-2 border-t border-slate-100 w-full">
                                            <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">{wpLeaders}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default Organigram;
