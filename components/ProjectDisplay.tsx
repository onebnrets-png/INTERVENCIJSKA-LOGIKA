// components/ProjectDisplay.tsx
// ═══════════════════════════════════════════════════════════════
// v4.8 — 2026-02-16 — SECTION GENERATE BUTTONS FOR ALL SUB-SECTIONS:
//   - NEW: Every sub-section now has its own "Generate with AI" button
//     that generates ONLY that specific sub-section (not the full chapter).
//   - Sub-section buttons call onGenerateSection() with sub-section keys:
//     coreProblem, causes, consequences, projectTitleAcronym, mainAim,
//     stateOfTheArt, proposedSolution, readinessLevels, policies,
//     generalObjectives, specificObjectives, risks, outputs, outcomes,
//     impacts, kers.
//   - Header button (top-right) still generates the FULL chapter.
//   - All sub-section generators receive full project context from AI
//     to prevent hallucination.
//   - All sub-section generators support 4-level smart logic
//     (translate / enhance / fill / regenerate).
//
// v4.7 — 2026-02-14 — FIXES:
//   - FIX 1: renderProjectManagement — removed duplicate "Implementation"
//     sub-heading. SectionHeader already shows the title.
//   - FIX 2: renderProjectManagement — id="quality-efficiency" → id="implementation"
//     so sidebar sub-step click scrolls correctly.
//   - FIX 3: renderProjectManagement — added id="organigram" wrapper div
//     so sidebar sub-step click scrolls correctly.
//   - FIX 4: renderRisks — all values lowercase (category, likelihood, impact)
//     to match types.ts and geminiService.ts schema.
//   - FIX 5: renderRisks — added <option value="environmental"> for new
//     RiskCategory enum value.
//   - FIX 6: renderRisks — trafficColors keys lowercase + case-insensitive lookup.
//   - FIX 7: renderActivities — deliverables onAddItem now includes title: ''.
//   - FIX 8: renderActivities — deliverables render now includes TextArea for title.
// ═══════════════════════════════════════════════════════════════

import React, { useRef, useEffect, useCallback } from 'react';
import { ICONS, getReadinessLevelsDefinitions, getSteps } from '../constants.tsx';
import { TEXT } from '../locales.ts';
import GanttChart from './GanttChart.tsx';
import PERTChart from './PERTChart.tsx';
import Organigram from './Organigram.tsx';
import { recalculateProjectSchedule } from '../utils.ts';
import InlineChart from './InlineChart.tsx';

const FieldHeader = ({ title, description, id = '' }) => (
    <div className="mb-2 pt-4" id={id}>
        <h3 className="text-lg font-semibold text-slate-700">{title}</h3>
        <p className="text-sm text-slate-500">{description}</p>
    </div>
);

const SectionHeader = ({ title, onAdd, addText, children }: { title: string; onAdd?: () => void; addText?: string; children?: React.ReactNode }) => (
    <div className="flex justify-between items-end mb-3 pt-6 border-b border-slate-200 pb-2">
        <h3 className="text-lg font-bold text-slate-700">{title}</h3>
        <div className="flex gap-2 items-center">
            {children}
            {onAdd && (
                <button onClick={onAdd} className="px-3 py-1.5 text-sm font-medium bg-sky-600 text-white rounded-md hover:bg-sky-700 shadow-sm transition-colors flex items-center gap-1">
                    <span className="text-lg leading-none">+</span> {addText}
                </button>
            )}
        </div>
    </div>
);

const RemoveButton = ({ onClick, text }) => (
    <button onClick={onClick} className="ml-2 px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors border border-red-100">
        {text}
    </button>
);

const GenerateButton = ({ onClick, isLoading, isField = false, title, text = '', missingApiKey = false }) => (
    <button
        onClick={onClick}
        disabled={!!isLoading}
        className={`flex items-center justify-center font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm
            ${isField 
                ? (missingApiKey ? 'p-1.5 bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100' : 'p-1.5 bg-white text-sky-600 border border-sky-200 hover:bg-sky-50')
                : (missingApiKey ? 'px-3 py-1.5 text-sm bg-amber-500 text-white hover:bg-amber-600' : 'px-3 py-1.5 text-sm bg-white text-sky-700 border border-sky-200 hover:bg-sky-50')
            }`
        }
        title={missingApiKey ? "Setup API Key" : title}
    >
        {missingApiKey ? <ICONS.LOCK className={`mr-1.5 ${isField ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} /> : <ICONS.SPARKLES className={`mr-1.5 ${isField ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />}
        {isField ? '' : text}
    </button>
);

const TextArea = ({ label, path, value, onUpdate, onGenerate, isLoading, placeholder, rows = 5, generateTitle, missingApiKey, className = "mb-5 w-full group" }) => {
    const enGen = TEXT.en.generating;
    const siGen = TEXT.si.generating;
    const fieldIsLoading = isLoading === `${enGen} ${String(path[path.length - 1])}...` || isLoading === `${siGen} ${String(path[path.length - 1])}...`;
    
    const textAreaRef = useRef(null);
    
    const adjustHeight = useCallback(() => {
        const el = textAreaRef.current;
        if (el) {
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
        }
    }, []);
    
    useEffect(() => {
        adjustHeight();
        const rafId = requestAnimationFrame(() => {
            adjustHeight();
        });
        return () => cancelAnimationFrame(rafId);
    }, [value, adjustHeight]);

    useEffect(() => {
        const el = textAreaRef.current;
        if (!el) return;
        const observer = new ResizeObserver(() => {
            adjustHeight();
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [adjustHeight]);

    useEffect(() => {
        const handleResize = () => adjustHeight();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [adjustHeight]);

    return (
        <div className={className}>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{label}</label>
            <div className="relative">
                <textarea
                    ref={textAreaRef}
                    data-path={path.join(',')}
                    value={value || ''}
                    onChange={(e) => onUpdate(path, e.target.value)}
                    onInput={adjustHeight}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 pr-10 resize-none overflow-hidden block text-base leading-relaxed shadow-sm transition-shadow hover:border-slate-400"
                    rows={rows}
                    placeholder={placeholder}
                />
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity focus-within:opacity-100">
                     <GenerateButton onClick={() => onGenerate(path)} isLoading={fieldIsLoading} isField title={generateTitle} missingApiKey={missingApiKey} />
                </div>
            </div>
        </div>
    );
};

// ★ v4.8: ReadinessLevelSelector now receives onGenerateSection
const ReadinessLevelSelector = ({ readinessLevels, onUpdateData, onGenerateField, onGenerateSection, isLoading, language, missingApiKey }) => {
    const t = TEXT[language] || TEXT['en'];
    const definitions = getReadinessLevelsDefinitions(language);

    const handleLevelChange = (levelKey, value) => {
        onUpdateData(['projectIdea', 'readinessLevels', levelKey, 'level'], value);
    };

    return (
        <div id="readiness-levels" className="mt-8">
            <div className="flex justify-between items-end mb-4 border-b border-slate-200 pb-2">
                <div>
                    <h3 className="text-lg font-bold text-slate-700">{t.readinessLevels}</h3>
                    <p className="text-sm text-slate-500 mt-1">{t.readinessLevelsDesc}</p>
                </div>
                <GenerateButton 
                    onClick={() => onGenerateSection('readinessLevels')} 
                    isLoading={isLoading === `${t.generating} readinessLevels...`} 
                    title={t.generateSection} 
                    text={t.generateAI} 
                    missingApiKey={missingApiKey} 
                />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Object.entries(definitions).map(([key, def]) => {
                    const levelKey = key;
                    const selectedLevelData = readinessLevels ? readinessLevels[levelKey] : { level: null, justification: '' };

                    return (
                        <div key={key} className="p-5 border border-slate-200 rounded-xl bg-white shadow-sm flex flex-col hover:shadow-md transition-shadow">
                            <div className="mb-3">
                                <h4 className="font-bold text-slate-800 text-base">{def.name}</h4>
                                <p className="text-xs text-slate-500 mt-1">{def.description}</p>
                            </div>
                            
                            <select
                                value={selectedLevelData?.level || ''}
                                onChange={(e) => handleLevelChange(levelKey, e.target.value ? parseInt(e.target.value, 10) : null)}
                                className="w-full p-2.5 border border-slate-300 rounded-lg mb-4 text-base bg-slate-50 focus:bg-white transition-colors"
                            >
                                <option value="">{t.notSelected}</option>
                                {def.levels.map(l => (
                                    <option key={l.level} value={l.level}>
                                        {`${key} ${l.level}: ${l.title}`}
                                    </option>
                                ))}
                            </select>
                            
                            <div className="flex-grow flex flex-col">
                                <TextArea
                                    label={t.justification}
                                    path={['projectIdea', 'readinessLevels', levelKey, 'justification']}
                                    value={selectedLevelData?.justification || ''}
                                    onUpdate={onUpdateData}
                                    onGenerate={onGenerateField}
                                    isLoading={isLoading}
                                    rows={2}
                                    placeholder={t.justificationPlaceholder}
                                    generateTitle={`${t.generateField} ${t.justification}`}
                                    missingApiKey={missingApiKey}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// --- Dependency Selector Component ---
const DependencySelector = ({ task, allTasks, onAddDependency, onRemoveDependency, language }) => {
    const t = TEXT[language] || TEXT['en'];
    const [selectedId, setSelectedId] = React.useState('');
    const [selectedType, setSelectedType] = React.useState('FS');

    const handleAdd = () => {
        if (selectedId) {
            onAddDependency({ predecessorId: selectedId, type: selectedType });
            setSelectedId('');
        }
    };

    const availableTasks = allTasks.filter(t => t.id !== task.id && !(task.dependencies || []).some(d => d.predecessorId === t.id));

    return (
        <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <h6 className="text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">{t.dependencies}</h6>
            <div className="flex gap-2 mb-2">
                <select 
                    className="flex-1 text-sm p-1.5 rounded border border-slate-300 bg-white" 
                    value={selectedId} 
                    onChange={e => setSelectedId(e.target.value)}
                >
                    <option value="">{t.predecessor}...</option>
                    {availableTasks.map(at => (
                        <option key={at.id} value={at.id}>{at.id}: {at.title.substring(0, 30)}...</option>
                    ))}
                </select>
                <select 
                    className="w-24 text-sm p-1.5 rounded border border-slate-300 bg-white"
                    value={selectedType}
                    onChange={e => setSelectedType(e.target.value)}
                >
                    {Object.keys(t.depTypes).map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <button onClick={handleAdd} disabled={!selectedId} className="px-3 bg-sky-600 text-white rounded font-bold hover:bg-sky-700 disabled:opacity-50 transition-colors">+</button>
            </div>
            <div className="space-y-1.5">
                {(task.dependencies || []).map((dep, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-white px-2 py-1.5 rounded border border-slate-200 text-xs shadow-sm">
                        <span className="text-slate-700">{t.predecessor}: <strong className="text-sky-700">{dep.predecessorId}</strong> <span className="text-slate-400">({dep.type})</span></span>
                        <button onClick={() => onRemoveDependency(idx)} className="text-red-400 hover:text-red-600 font-bold ml-2 px-1">✕</button>
                    </div>
                ))}
            </div>
        </div>
    );
};
// --- Section Renderers ---
const renderProblemAnalysis = (props) => {
    const { projectData, onUpdateData, onGenerateField, onGenerateSection, onAddItem, onRemoveItem, isLoading, language, missingApiKey } = props;
    const { coreProblem, causes, consequences } = projectData.problemAnalysis;
    const path = ['problemAnalysis'];
    const t = TEXT[language] || TEXT['en'];

    return (
        <>
            <div id="core-problem">
                <SectionHeader title={t.coreProblem}>
                    <GenerateButton 
                        onClick={() => onGenerateSection('coreProblem')} 
                        isLoading={isLoading === `${t.generating} coreProblem...`} 
                        title={t.generateSection} 
                        text={t.generateAI} 
                        missingApiKey={missingApiKey} 
                    />
                </SectionHeader>
                <p className="text-sm text-slate-500 mb-3 -mt-2">{t.coreProblemDesc}</p>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <TextArea label={t.title} path={[...path, 'coreProblem', 'title']} value={coreProblem.title} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.coreProblemTitlePlaceholder} generateTitle={`${t.generateField} ${t.coreProblem}`} missingApiKey={missingApiKey} />
                    <TextArea label={t.description} path={[...path, 'coreProblem', 'description']} value={coreProblem.description} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.coreProblemDescPlaceholder} generateTitle={`${t.generateField} ${t.description}`} missingApiKey={missingApiKey} />
                    <InlineChart text={coreProblem.description || ''} fieldContext="coreProblem" language={language} />
                </div>
            </div>

            <div id="causes" className="mt-8">
                <SectionHeader title={t.causes} onAdd={() => onAddItem([...path, 'causes'], { id: null, title: '', description: '' })} addText={t.add}>
                    <GenerateButton 
                        onClick={() => onGenerateSection('causes')} 
                        isLoading={isLoading === `${t.generating} causes...`} 
                        title={t.generateSection} 
                        text={t.generateAI} 
                        missingApiKey={missingApiKey} 
                    />
                </SectionHeader>
                {(causes || []).map((cause, index) => (
                    <div key={index} className="p-5 border border-slate-200 rounded-xl mb-4 bg-white shadow-sm relative group transition-all hover:shadow-md">
                         <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => onRemoveItem([...path, 'causes'], index)} text={t.remove} /></div>
                        <TextArea label={`${t.causeTitle} #${index + 1}`} path={[...path, 'causes', index, 'title']} value={cause.title} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.causePlaceholder} generateTitle={`${t.generateField} ${t.title}`} missingApiKey={missingApiKey} />
                        <TextArea label={t.description} path={[...path, 'causes', index, 'description']} value={cause.description} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.causeDescPlaceholder} generateTitle={`${t.generateField} ${t.description}`} missingApiKey={missingApiKey} />
                    </div>
                ))}
            </div>

            <div id="consequences" className="mt-8">
                <SectionHeader title={t.consequences} onAdd={() => onAddItem([...path, 'consequences'], { id: null, title: '', description: '' })} addText={t.add}>
                    <GenerateButton 
                        onClick={() => onGenerateSection('consequences')} 
                        isLoading={isLoading === `${t.generating} consequences...`} 
                        title={t.generateSection} 
                        text={t.generateAI} 
                        missingApiKey={missingApiKey} 
                    />
                </SectionHeader>
                {(consequences || []).map((consequence, index) => (
                    <div key={index} className="p-5 border border-slate-200 rounded-xl mb-4 bg-white shadow-sm relative group transition-all hover:shadow-md">
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => onRemoveItem([...path, 'consequences'], index)} text={t.remove} /></div>
                        <TextArea label={`${t.consequenceTitle} #${index + 1}`} path={[...path, 'consequences', index, 'title']} value={consequence.title} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.consequencePlaceholder} generateTitle={`${t.generateField} ${t.title}`} missingApiKey={missingApiKey} />
                        <TextArea label={t.description} path={[...path, 'consequences', index, 'description']} value={consequence.description} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.consequenceDescPlaceholder} generateTitle={`${t.generateField} ${t.description}`} missingApiKey={missingApiKey} />
                    </div>
                ))}
            </div>
        </>
    );
};

const renderProjectIdea = (props) => {
    const { projectData, onUpdateData, onGenerateField, onGenerateSection, onAddItem, onRemoveItem, isLoading, language, missingApiKey } = props;
    const { mainAim, stateOfTheArt, proposedSolution, policies, readinessLevels, projectTitle, projectAcronym, startDate } = projectData.projectIdea;
    const path = ['projectIdea'];
    const t = TEXT[language] || TEXT['en'];
    
    const isCoreProblemFilled = projectData.problemAnalysis.coreProblem.title.trim() !== '';
    const isMainAimFilled = mainAim.trim() !== '';
    const canEditTitle = isCoreProblemFilled && isMainAimFilled;

    return (
        <>
            <div className={`mb-8 p-6 border border-slate-200 rounded-xl bg-gradient-to-br from-white to-slate-50 shadow-sm transition-all duration-300 ${!canEditTitle ? 'filter blur-sm opacity-60 pointer-events-none' : ''}`}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-slate-800">{t.projectTitle}</h3>
                    <GenerateButton 
                        onClick={() => onGenerateSection('projectTitleAcronym')} 
                        isLoading={isLoading === `${t.generating} projectTitleAcronym...`} 
                        title={t.generateSection} 
                        text={t.generateAI} 
                        missingApiKey={missingApiKey} 
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <TextArea label={t.projectTitle} path={[...path, 'projectTitle']} value={projectTitle} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.projectTitlePlaceholder} generateTitle={`${t.generateField} ${t.projectTitle}`} missingApiKey={missingApiKey} />
                    <TextArea label={t.acronym} path={[...path, 'projectAcronym']} value={projectAcronym} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.projectAcronymPlaceholder} generateTitle={`${t.generateField} ${t.acronym}`} missingApiKey={missingApiKey} />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.projectStartDate}</label>
                        <input 
                            type="date"
                            value={startDate || ''}
                            onChange={(e) => onUpdateData([...path, 'startDate'], e.target.value)}
                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 shadow-sm text-base"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.projectDuration}</label>
                        <select
                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 shadow-sm text-base bg-white"
                            value={projectData.projectIdea?.durationMonths || 24}
                            onChange={(e) => onUpdateData(['projectIdea', 'durationMonths'], parseInt(e.target.value))}
                        >
                            {[6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 42, 48, 54, 60].map(m => (
                                <option key={m} value={m}>{m} {t.months}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.projectEndDate}</label>
                        <div className="p-2.5 border border-slate-200 rounded-lg bg-slate-50 text-base font-bold text-sky-700 shadow-sm">
                            {projectData.projectIdea?.startDate ? (() => {
                                const start = new Date(projectData.projectIdea.startDate);
                                const months = projectData.projectIdea?.durationMonths || 24;
                                const end = new Date(start);
                                end.setMonth(end.getMonth() + months);
                                end.setDate(end.getDate() - 1);
                                return end.toISOString().split('T')[0];
                            })() : '—'}
                        </div>
                    </div>
                </div>
                <p className="text-xs text-slate-400 mt-2">{t.projectDurationDesc}</p>
            </div>

            <div id="main-aim">
                <SectionHeader title={t.mainAim}>
                    <GenerateButton 
                        onClick={() => onGenerateSection('mainAim')} 
                        isLoading={isLoading === `${t.generating} mainAim...`} 
                        title={t.generateSection} 
                        text={t.generateAI} 
                        missingApiKey={missingApiKey} 
                    />
                </SectionHeader>
                <p className="text-sm text-slate-500 mb-3 -mt-2">{t.mainAimDesc}</p>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <TextArea label={t.mainAim} path={[...path, 'mainAim']} value={mainAim} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.mainAimPlaceholder} generateTitle={`${t.generateField} ${t.mainAim}`} missingApiKey={missingApiKey} />
                </div>
            </div>

            <div id="state-of-the-art" className="mt-6">
                <SectionHeader title={t.stateOfTheArt}>
                    <GenerateButton 
                        onClick={() => onGenerateSection('stateOfTheArt')} 
                        isLoading={isLoading === `${t.generating} stateOfTheArt...`} 
                        title={t.generateSection} 
                        text={t.generateAI} 
                        missingApiKey={missingApiKey} 
                    />
                </SectionHeader>
                <p className="text-sm text-slate-500 mb-3 -mt-2">{t.stateOfTheArtDesc}</p>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <TextArea label={t.stateOfTheArt} path={[...path, 'stateOfTheArt']} value={stateOfTheArt} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.stateOfTheArtPlaceholder} generateTitle={`${t.generateField} ${t.stateOfTheArt}`} missingApiKey={missingApiKey} />
                    <InlineChart text={stateOfTheArt || ''} fieldContext="stateOfTheArt" language={language} />
                </div>
            </div>

            <div id="proposed-solution" className="mt-6">
                <SectionHeader title={t.proposedSolution}>
                    <GenerateButton 
                        onClick={() => onGenerateSection('proposedSolution')} 
                        isLoading={isLoading === `${t.generating} proposedSolution...`} 
                        title={t.generateSection} 
                        text={t.generateAI} 
                        missingApiKey={missingApiKey} 
                    />
                </SectionHeader>
                <p className="text-sm text-slate-500 mb-3 -mt-2">{t.proposedSolutionDesc}</p>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <TextArea label={t.proposedSolution} path={[...path, 'proposedSolution']} value={proposedSolution} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.proposedSolutionPlaceholder} generateTitle={`${t.generateField} ${t.proposedSolution}`} missingApiKey={missingApiKey} />
                    <InlineChart text={proposedSolution || ''} fieldContext="proposedSolution" language={language} />
                </div>
            </div>
            
            <ReadinessLevelSelector 
                readinessLevels={readinessLevels} 
                onUpdateData={onUpdateData} 
                onGenerateField={onGenerateField}
                onGenerateSection={onGenerateSection}
                isLoading={isLoading}
                language={language}
                missingApiKey={missingApiKey}
            />

            <div id="eu-policies" className="mt-8">
                 <SectionHeader title={t.euPolicies} onAdd={() => onAddItem([...path, 'policies'], { id: null, name: '', description: '' })} addText={t.add}>
                    <GenerateButton 
                        onClick={() => onGenerateSection('policies')} 
                        isLoading={isLoading === `${t.generating} policies...`} 
                        title={t.generateSection} 
                        text={t.generateAI} 
                        missingApiKey={missingApiKey} 
                    />
                 </SectionHeader>
                 {(policies || []).map((policy, index) => (
                    <div key={index} className="p-5 border border-slate-200 rounded-xl mb-4 bg-white shadow-sm relative group hover:shadow-md transition-all">
                         <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => onRemoveItem([...path, 'policies'], index)} text={t.remove} /></div>
                        <TextArea label={`${t.policyName} #${index + 1}`} path={[...path, 'policies', index, 'name']} value={policy.name} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.policyPlaceholder} generateTitle={`${t.generateField} ${t.policyName}`} missingApiKey={missingApiKey} />
                        <TextArea label={t.policyDesc} path={[...path, 'policies', index, 'description']} value={policy.description} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.policyDescPlaceholder} generateTitle={`${t.generateField} ${t.description}`} missingApiKey={missingApiKey} />
                    </div>
                ))}
            </div>
        </>
    );
};

const renderGenericResults = (props, sectionKey) => {
    const { projectData, onUpdateData, onGenerateField, onGenerateSection, onAddItem, onRemoveItem, isLoading, language, missingApiKey } = props;
    const items = projectData[sectionKey];
    const t = TEXT[language] || TEXT['en'];
    const title = t[sectionKey];
    
    const getPrefix = (key) => {
        switch (key) {
            case 'outputs': return 'D';
            case 'outcomes': return 'R';
            case 'impacts': return 'I';
        }
    };

    const prefix = getPrefix(sectionKey);

    return (
        <div id={sectionKey} className="mt-8">
             <SectionHeader title={title} onAdd={() => onAddItem([sectionKey], { id: null, title: '', description: '', indicator: '' })} addText={t.add}>
                <GenerateButton 
                    onClick={() => onGenerateSection(sectionKey)} 
                    isLoading={isLoading === `${t.generating} ${sectionKey}...`} 
                    title={t.generateSection} 
                    text={t.generateAI} 
                    missingApiKey={missingApiKey} 
                />
             </SectionHeader>
             {(items || []).map((item, index) => (
                <div key={index} className="p-5 border border-slate-200 rounded-xl mb-4 bg-white shadow-sm relative group hover:shadow-md transition-all">
                     <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => onRemoveItem([sectionKey], index)} text={t.remove} /></div>
                    <TextArea label={`${prefix}${index + 1}`} path={[sectionKey, index, 'title']} value={item.title} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.enterTitle} generateTitle={`${t.generateField} ${t.title}`} missingApiKey={missingApiKey} />
                    <TextArea label={t.description} path={[sectionKey, index, 'description']} value={item.description} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.enterDesc} generateTitle={`${t.generateField} ${t.description}`} missingApiKey={missingApiKey} />
                    <TextArea label={t.indicator} path={[sectionKey, index, 'indicator']} value={item.indicator} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.indicatorPlaceholder} generateTitle={`${t.generateField} ${t.indicator}`} missingApiKey={missingApiKey} />
                </div>
            ))}
        </div>
    );
};

const renderObjectives = (props, sectionKey) => {
    const { projectData, onUpdateData, onGenerateField, onGenerateSection, onAddItem, onRemoveItem, isLoading, language, missingApiKey } = props;
    const items = projectData[sectionKey];
    const t = TEXT[language] || TEXT['en'];
    const title = sectionKey === 'generalObjectives' ? t.generalObjectives : t.specificObjectives;
    const prefix = sectionKey === 'generalObjectives' ? 'GO' : 'SO';
    
    return (
        <div className="mt-2">
             <SectionHeader title={title} onAdd={() => onAddItem([sectionKey], { id: null, title: '', description: '', indicator: '' })} addText={t.add}>
                <GenerateButton 
                    onClick={() => onGenerateSection(sectionKey)} 
                    isLoading={isLoading === `${t.generating} ${sectionKey}...`} 
                    title={t.generateSection} 
                    text={t.generateAI} 
                    missingApiKey={missingApiKey} 
                />
             </SectionHeader>
             {(items || []).map((item, index) => (
                <div key={index} className="p-5 border border-slate-200 rounded-xl mb-4 bg-white shadow-sm relative group hover:shadow-md transition-all">
                     <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => onRemoveItem([sectionKey], index)} text={t.remove} /></div>
                    <TextArea label={`${prefix}${index + 1}`} path={[sectionKey, index, 'title']} value={item.title} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.enterTitle} generateTitle={`${t.generateField} ${t.title}`} missingApiKey={missingApiKey} />
                    <TextArea label={t.description} path={[sectionKey, index, 'description']} value={item.description} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.enterDesc} generateTitle={`${t.generateField} ${t.description}`} missingApiKey={missingApiKey} />
                    <TextArea label={t.indicator} path={[sectionKey, index, 'indicator']} value={item.indicator} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.indicatorPlaceholder} generateTitle={`${t.generateField} ${t.indicator}`} missingApiKey={missingApiKey} />
                </div>
            ))}
        </div>
    );
}
const renderProjectManagement = (props) => {
    const { projectData, onUpdateData, onGenerateField, onGenerateSection, isLoading, language, missingApiKey } = props;
    const { projectManagement } = projectData;
    const t = TEXT[language] || TEXT['en'];
    const pmPath = ['projectManagement'];

    return (
        <div id="implementation" className="mb-10 pb-8">
            <SectionHeader title={t.management.title}>
                <GenerateButton 
                    onClick={() => onGenerateSection('projectManagement')} 
                    isLoading={isLoading === `${t.generating} projectManagement...`} 
                    title={t.generateSection} 
                    text={t.generateAI} 
                    missingApiKey={missingApiKey} 
                />
            </SectionHeader>
            
            <p className="text-sm text-slate-500 mb-6 -mt-2">{t.management.desc}</p>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-8">
                <TextArea 
                    label={t.description} 
                    path={[...pmPath, 'description']} 
                    value={projectManagement?.description || ''} 
                    onUpdate={onUpdateData} 
                    onGenerate={onGenerateField} 
                    isLoading={isLoading} 
                    placeholder={t.management.placeholder} 
                    generateTitle={`${t.generateField} ${t.description}`} 
                    missingApiKey={missingApiKey} 
                />
            </div>

            <div id="organigram">
                <div className="mb-3 border-b border-slate-200 pb-2">
                    <h4 className="text-lg font-bold text-slate-700">{t.management.organigram}</h4>
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50">
                    <Organigram 
                        structure={projectManagement?.structure} 
                        activities={projectData.activities}
                        language={language}
                        id="organigram-interactive"
                    />
                </div>
            </div>
        </div>
    );
};

const renderRisks = (props) => {
    const { projectData, onUpdateData, onGenerateField, onGenerateSection, onAddItem, onRemoveItem, isLoading, language, missingApiKey } = props;
    const { risks } = projectData;
    const path = ['risks'];
    const t = TEXT[language] || TEXT['en'];

    const trafficColors = {
        low: 'bg-green-100 border-green-300 text-green-800',
        medium: 'bg-yellow-100 border-yellow-300 text-yellow-800',
        high: 'bg-red-100 border-red-300 text-red-800'
    };

    const getTrafficColor = (value) => {
        if (!value) return trafficColors.low;
        return trafficColors[value.toLowerCase()] || trafficColors.low;
    };
    
    return (
        <div id="risk-mitigation" className="mt-12 border-t-2 border-slate-200 pt-8">
            <SectionHeader title={t.subSteps.riskMitigation} onAdd={() => onAddItem(path, { id: `RISK${risks.length + 1}`, category: 'technical', title: '', description: '', likelihood: 'low', impact: 'low', mitigation: '' })} addText={t.add}>
                <GenerateButton 
                    onClick={() => onGenerateSection('risks')} 
                    isLoading={isLoading === `${t.generating} risks...`} 
                    title={t.generateSection} 
                    text={t.generateAI} 
                    missingApiKey={missingApiKey} 
                />
            </SectionHeader>
            {(risks || []).map((risk, index) => {
                const likelihoodLoading = isLoading === `${t.generating} likelihood...`;
                const impactLoading = isLoading === `${t.generating} impact...`;

                return (
                <div key={index} className="p-5 border border-slate-200 rounded-xl mb-4 bg-white shadow-sm relative group hover:shadow-md transition-all">
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => onRemoveItem(path, index)} text={t.remove} /></div>
                    
                    <div className="flex flex-wrap gap-4 mb-4">
                        <div className="w-28">
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.risks.riskId}</label>
                            <input type="text" value={risk.id || ''} onChange={(e) => onUpdateData([...path, index, 'id'], e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 font-bold bg-slate-50 text-base" />
                        </div>
                        <div className="w-48">
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.risks.category}</label>
                            <select value={risk.category || 'technical'} onChange={(e) => onUpdateData([...path, index, 'category'], e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg bg-white text-base">
                                <option value="technical">{t.risks.categories.technical}</option>
                                <option value="social">{t.risks.categories.social}</option>
                                <option value="economic">{t.risks.categories.economic}</option>
                                <option value="environmental">{t.risks.categories.environmental}</option>
                            </select>
                        </div>
                        <div className="flex-1 min-w-[200px]">
                             <TextArea label={t.risks.riskTitle} path={[...path, index, 'title']} value={risk.title} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.risks.titlePlaceholder} generateTitle={`${t.generateField} ${t.title}`} missingApiKey={missingApiKey} className="w-full group" />
                        </div>
                    </div>

                    <TextArea label={t.risks.riskDescription} path={[...path, index, 'description']} value={risk.description} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.risks.descPlaceholder} generateTitle={`${t.generateField} ${t.description}`} missingApiKey={missingApiKey} />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.risks.likelihood}</label>
                            <div className="relative">
                                <select value={risk.likelihood} onChange={(e) => onUpdateData([...path, index, 'likelihood'], e.target.value)} className={`w-full p-2.5 border rounded-lg font-bold ${getTrafficColor(risk.likelihood)} pr-10 appearance-none transition-colors cursor-pointer text-base`}>
                                    <option value="low" className="bg-white text-slate-800">{t.risks.levels.low}</option>
                                    <option value="medium" className="bg-white text-slate-800">{t.risks.levels.medium}</option>
                                    <option value="high" className="bg-white text-slate-800">{t.risks.levels.high}</option>
                                </select>
                                <div className="absolute top-1.5 right-1.5">
                                    <GenerateButton onClick={() => onGenerateField([...path, index, 'likelihood'])} isLoading={likelihoodLoading} isField title={t.generateAI} missingApiKey={missingApiKey} />
                                </div>
                            </div>
                        </div>
                         <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.risks.impact}</label>
                             <div className="relative">
                                <select value={risk.impact} onChange={(e) => onUpdateData([...path, index, 'impact'], e.target.value)} className={`w-full p-2.5 border rounded-lg font-bold ${getTrafficColor(risk.impact)} pr-10 appearance-none transition-colors cursor-pointer text-base`}>
                                    <option value="low" className="bg-white text-slate-800">{t.risks.levels.low}</option>
                                    <option value="medium" className="bg-white text-slate-800">{t.risks.levels.medium}</option>
                                    <option value="high" className="bg-white text-slate-800">{t.risks.levels.high}</option>
                                </select>
                                <div className="absolute top-1.5 right-1.5">
                                    <GenerateButton onClick={() => onGenerateField([...path, index, 'impact'])} isLoading={impactLoading} isField title={t.generateAI} missingApiKey={missingApiKey} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <TextArea label={t.risks.mitigation} path={[...path, index, 'mitigation']} value={risk.mitigation} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.risks.mitigationPlaceholder} generateTitle={`${t.generateField} ${t.risks.mitigation}`} missingApiKey={missingApiKey} />
                </div>
            )})}
        </div>
    );
};

const renderKERs = (props) => {
    const { projectData, onUpdateData, onGenerateField, onGenerateSection, onAddItem, onRemoveItem, isLoading, language, missingApiKey } = props;
    const { kers } = projectData;
    const path = ['kers'];
    const t = TEXT[language] || TEXT['en'];

    return (
        <div id="kers" className="mt-12 border-t-2 border-slate-200 pt-8">
            <SectionHeader title={t.subSteps.kers} onAdd={() => onAddItem(path, { id: `KER${kers.length + 1}`, title: '', description: '', exploitationStrategy: '' })} addText={t.add}>
                <GenerateButton 
                    onClick={() => onGenerateSection('kers')} 
                    isLoading={isLoading === `${t.generating} kers...`} 
                    title={t.generateSection} 
                    text={t.generateAI} 
                    missingApiKey={missingApiKey} 
                />
            </SectionHeader>
            {(kers || []).map((ker, index) => (
                 <div key={index} className="p-5 border border-slate-200 rounded-xl mb-4 bg-white shadow-sm relative group hover:shadow-md transition-all">
                     <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => onRemoveItem(path, index)} text={t.remove} /></div>
                     <div className="flex flex-wrap gap-4 mb-4">
                        <div className="w-28">
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.kers.kerId}</label>
                            <input type="text" value={ker.id || ''} onChange={(e) => onUpdateData([...path, index, 'id'], e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 font-bold bg-slate-50 text-base" />
                        </div>
                        <div className="flex-1 min-w-[200px]">
                             <TextArea label={t.kers.kerTitle} path={[...path, index, 'title']} value={ker.title} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.kers.titlePlaceholder} generateTitle={`${t.generateField} ${t.title}`} missingApiKey={missingApiKey} className="w-full group" />
                        </div>
                     </div>
                     <TextArea label={t.kers.kerDesc} path={[...path, index, 'description']} value={ker.description} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.kers.descPlaceholder} generateTitle={`${t.generateField} ${t.description}`} missingApiKey={missingApiKey} />
                     <TextArea label={t.kers.exploitationStrategy} path={[...path, index, 'exploitationStrategy']} value={ker.exploitationStrategy} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.kers.strategyPlaceholder} generateTitle={`${t.generateField} ${t.kers.exploitationStrategy}`} missingApiKey={missingApiKey} />
                </div>
            ))}
        </div>
    );
};

const renderActivities = (props) => {
    const { projectData, onUpdateData, onGenerateField, onGenerateSection, onAddItem, onRemoveItem, isLoading, language, missingApiKey } = props;
    const path = ['activities'];
    const t = TEXT[language] || TEXT['en'];

    const rawActivities = projectData.activities;
    const activities = Array.isArray(rawActivities)
        ? rawActivities
        : (rawActivities && Array.isArray(rawActivities.activities))
            ? rawActivities.activities
            : (rawActivities && typeof rawActivities === 'object' && rawActivities.id)
                ? [rawActivities]
                : [];

    const allTasks = activities.flatMap(wp => wp.tasks || []);

    const handleTaskUpdate = (itemPath, value) => {
        if (itemPath.includes('tasks')) {
            const tempProjectData = JSON.parse(JSON.stringify(projectData));
            let current = tempProjectData;
            for(let i=0; i<itemPath.length-1; i++) {
                current = current[itemPath[i]];
            }
            current[itemPath[itemPath.length-1]] = value;
            const scheduledProjectData = recalculateProjectSchedule(tempProjectData);
            onUpdateData(['activities'], scheduledProjectData.activities);
        } else {
            onUpdateData(itemPath, value);
        }
    };

    return (
        <>
            {renderProjectManagement(props)}

            <div id="workplan">
                <SectionHeader title={t.subSteps.workplan} onAdd={() => onAddItem(path, { id: `WP${activities.length + 1}`, title: '', tasks: [], milestones: [], deliverables: [] })} addText={t.add}>
                    <GenerateButton onClick={() => onGenerateSection('activities')} isLoading={isLoading === `${t.generating} activities...`} title={t.generateSection} text={t.generateAI} missingApiKey={missingApiKey} />
                </SectionHeader>
                
                {(activities || []).map((wp, wpIndex) => (
                    <div key={wpIndex} className="p-6 border border-slate-200 rounded-xl mb-8 bg-white shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                            <h4 className="text-lg font-bold text-sky-800 flex items-center gap-2">
                                <span className="bg-sky-100 text-sky-800 px-2 py-0.5 rounded text-sm">{wp.id}</span> 
                                <span className="truncate">{wp.title || t.untitled}</span>
                            </h4>
                            <RemoveButton onClick={() => onRemoveItem(path, wpIndex)} text={t.remove} />
                        </div>
                        <TextArea label={t.wpTitle} path={[...path, wpIndex, 'title']} value={wp.title} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.wpTitlePlaceholder} generateTitle={`${t.generateField} ${t.title}`} missingApiKey={missingApiKey} />
                        
                        <div className="mt-6 pl-4 border-l-4 border-sky-100">
                            <SectionHeader title={t.tasks} onAdd={() => onAddItem([...path, wpIndex, 'tasks'], { id: `T${wpIndex + 1}.${(wp.tasks || []).length + 1}`, title: '', description: '', startDate: '', endDate: '', dependencies: [] })} addText={t.add} />
                            {(wp.tasks || []).map((task, taskIndex) => (
                                <div key={taskIndex} className="p-4 border border-slate-200 rounded-lg mb-4 bg-slate-50 relative group">
                                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => onRemoveItem([...path, wpIndex, 'tasks'], taskIndex)} text={t.remove} /></div>
                                    <h5 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                                        <span className="bg-white border border-slate-200 px-2 py-0.5 rounded text-xs text-slate-500">{task.id}</span>
                                        {task.title || t.untitled}
                                    </h5>
                                    <TextArea label={t.taskTitle} path={[...path, wpIndex, 'tasks', taskIndex, 'title']} value={task.title} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.taskTitlePlaceholder} generateTitle={`${t.generateField} ${t.title}`} missingApiKey={missingApiKey} />
                                    <TextArea label={t.taskDesc} path={[...path, wpIndex, 'tasks', taskIndex, 'description']} value={task.description} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.taskDescPlaceholder} generateTitle={`${t.generateField} ${t.description}`} missingApiKey={missingApiKey} />
                                    <div className="grid grid-cols-2 gap-4 mt-2">
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.startDate}</label>
                                            <input type="date" value={task.startDate || ''} onChange={(e) => handleTaskUpdate([...path, wpIndex, 'tasks', taskIndex, 'startDate'], e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white text-base" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.endDate}</label>
                                            <input type="date" value={task.endDate || ''} onChange={(e) => handleTaskUpdate([...path, wpIndex, 'tasks', taskIndex, 'endDate'], e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white text-base" />
                                        </div>
                                    </div>
                                    <DependencySelector task={task} allTasks={allTasks} language={language}
                                        onAddDependency={(dep) => { const deps = task.dependencies || []; handleTaskUpdate([...path, wpIndex, 'tasks', taskIndex, 'dependencies'], [...deps, dep]); }}
                                        onRemoveDependency={(depIdx) => { const deps = task.dependencies || []; handleTaskUpdate([...path, wpIndex, 'tasks', taskIndex, 'dependencies'], deps.filter((_, i) => i !== depIdx)); }}
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 pl-4 border-l-4 border-amber-100">
                            <SectionHeader title={t.milestones} onAdd={() => onAddItem([...path, wpIndex, 'milestones'], { id: `M${wpIndex + 1}.${(wp.milestones || []).length + 1}`, description: '', date: '' })} addText={t.add} />
                            {(wp.milestones || []).map((milestone, msIndex) => {
                                const enGen = TEXT.en.generating;
                                const siGen = TEXT.si.generating;
                                const dateLoading = isLoading === `${enGen} date...` || isLoading === `${siGen} date...`;
                                return (
                                    <div key={msIndex} className="relative mb-3 bg-amber-50/50 p-4 rounded-lg border border-amber-100 group">
                                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => onRemoveItem([...path, wpIndex, 'milestones'], msIndex)} text={t.remove} /></div>
                                        <div className="flex flex-col md:flex-row gap-4">
                                            <div className="flex-1">
                                                <TextArea label={`Milestone ${milestone.id}`} path={[...path, wpIndex, 'milestones', msIndex, 'description']} value={milestone.description} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.milestonePlaceholder} generateTitle={`${t.generateField} ${t.description}`} missingApiKey={missingApiKey} className="w-full group" />
                                            </div>
                                            <div className="w-full md:w-48">
                                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.dates}</label>
                                                <div className="flex gap-1 items-end">
                                                    <input type="date" value={milestone.date || ''} onChange={(e) => onUpdateData([...path, wpIndex, 'milestones', msIndex, 'date'], e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white text-base flex-1" />
                                                    <GenerateButton onClick={() => onGenerateField([...path, wpIndex, 'milestones', msIndex, 'date'])} isLoading={dateLoading} isField title={t.generateAI} missingApiKey={missingApiKey} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-6 pl-4 border-l-4 border-indigo-100">
                            <SectionHeader title={t.deliverables} onAdd={() => onAddItem([...path, wpIndex, 'deliverables'], { id: `D${wpIndex + 1}.${(wp.deliverables || []).length + 1}`, title: '', description: '', indicator: '' })} addText={t.add} />
                            {(wp.deliverables || []).map((deliverable, dIndex) => (
                                <div key={dIndex} className="relative mb-4 bg-indigo-50/50 p-4 rounded-lg border border-indigo-100 group">
                                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => onRemoveItem([...path, wpIndex, 'deliverables'], dIndex)} text={t.remove} /></div>
                                    <h5 className="font-semibold text-slate-700 mb-3">{deliverable.id}</h5>
                                    <TextArea label={t.deliverableTitle || 'Deliverable Title'} path={[...path, wpIndex, 'deliverables', dIndex, 'title']} value={deliverable.title} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.deliverableTitlePlaceholder || 'Enter deliverable title...'} generateTitle={`${t.generateField} ${t.title}`} missingApiKey={missingApiKey} />
                                    <TextArea label={t.description} path={[...path, wpIndex, 'deliverables', dIndex, 'description']} value={deliverable.description} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.deliverableDescPlaceholder} generateTitle={`${t.generateField} ${t.description}`} missingApiKey={missingApiKey} />
                                    <TextArea label={t.indicator} path={[...path, wpIndex, 'deliverables', dIndex, 'indicator']} value={deliverable.indicator} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.indicatorPlaceholder} generateTitle={`${t.generateField} ${t.indicator}`} missingApiKey={missingApiKey} />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div id="gantt-chart" className="mt-12 mb-8 border-t-2 border-slate-200 pt-8">
                 <h3 className="text-xl font-bold text-slate-700 mb-4">{t.subSteps.ganttChart}</h3>
                <GanttChart activities={activities} language={language} id="gantt-chart-interactive" />
            </div>

            <div id="pert-chart" className="mt-12 mb-8 border-t-2 border-slate-200 pt-8">
                 <h3 className="text-xl font-bold text-slate-700 mb-4">{t.subSteps.pertChart}</h3>
                <PERTChart activities={activities} language={language} />
            </div>

            {renderRisks(props)}
        </>
    );
};

const renderExpectedResults = (props) => {
    return (
        <>
            {renderGenericResults(props, 'outputs')}
            {renderGenericResults(props, 'outcomes')}
            {renderGenericResults(props, 'impacts')}
            {renderKERs(props)}
        </>
    );
};

const ProjectDisplay = (props) => {
  const { activeStepId, onGenerateSection, isLoading, error, language, missingApiKey } = props;
  const STEPS = getSteps(language);
  const activeStep = STEPS.find(step => step.id === activeStepId);
  const t = TEXT[language] || TEXT['en'];

  if (!activeStep) return <div className="p-8 text-center text-red-500">Error: Invalid Step Selected</div>;

  const sectionKey = activeStep.key;

  const renderContent = () => {
    switch (sectionKey) {
        case 'problemAnalysis': return renderProblemAnalysis(props);
        case 'projectIdea': return renderProjectIdea(props);
        case 'generalObjectives': return renderObjectives(props, 'generalObjectives');
        case 'specificObjectives': return renderObjectives(props, 'specificObjectives');
        case 'activities': return renderActivities(props);
        case 'expectedResults': return renderExpectedResults(props);
      default: return <div className="p-8 text-center text-slate-500">{t.selectStep}</div>;
    }
  };

  const showGenerateButton = ['problemAnalysis', 'projectIdea', 'generalObjectives', 'specificObjectives', 'activities', 'expectedResults'].includes(sectionKey);

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-slate-50/30">
      <header className="bg-white border-b border-slate-200 px-6 py-5 flex justify-between items-center flex-shrink-0 sticky top-0 z-20 shadow-sm">
          <div>
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight">{activeStep.title}</h2>
              <p className="text-sm text-slate-500 mt-0.5">{t.stepSubtitle}</p>
          </div>
            <div className="flex items-center gap-4">
              {showGenerateButton && (
                  sectionKey === 'expectedResults'
                    ? <GenerateButton onClick={() => props.onGenerateCompositeSection('expectedResults')} isLoading={!!isLoading} title={t.generateSection} text={t.generateAI} missingApiKey={missingApiKey} />
                    : <GenerateButton onClick={() => onGenerateSection(sectionKey)} isLoading={isLoading === `${t.generating} ${sectionKey}...`} title={t.generateSection} text={t.generateAI} missingApiKey={missingApiKey} />
              )}
          </div>
      </header>

      {error && <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 m-6 rounded-r shadow-sm" role="alert"><p className="font-bold">Error</p><p>{error}</p></div>}
      
      {isLoading && <div className="p-4 m-6 text-center text-sky-700 bg-sky-50 rounded-lg animate-pulse border border-sky-100 font-medium">{typeof isLoading === 'string' ? isLoading : t.loading}</div>}

      <div id="main-scroll-container" className="flex-1 overflow-y-auto p-6 scroll-smooth relative">
        <div className="max-w-5xl mx-auto pb-20">
          {renderContent()}
        </div>
      </div>
    </main>
  );
};

export default ProjectDisplay;
