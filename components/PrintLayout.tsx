
import React from 'react';
import { getSteps, getReadinessLevelsDefinitions, BRAND_ASSETS } from '../constants.tsx';
import { TEXT } from '../locales.ts';
import GanttChart from './GanttChart.tsx';
import PERTChart from './PERTChart.tsx';
import Organigram from './Organigram.tsx';

interface SectionProps {
    title: string;
    children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, children }) => (
    <section className="mb-8" style={{ pageBreakInside: 'avoid' }}>
        <h2 className="text-2xl font-bold border-b-2 border-gray-300 pb-2 mb-4">{title}</h2>
        {children}
    </section>
);

interface SubSectionProps {
    title: string;
    children: React.ReactNode;
}

const SubSection: React.FC<SubSectionProps> = ({ title, children }) => (
    <div className="mb-6">
        <h3 className="text-xl font-semibold text-gray-800">{title}</h3>
        <div className="pl-4 border-l-2 border-gray-200 mt-2">{children}</div>
    </div>
);

interface ItemProps {
    title?: string;
    description?: string;
    indicator?: string;
    indicatorLabel?: string;
}

const Item: React.FC<ItemProps> = ({ title, description, indicator, indicatorLabel }) => (
    <div className="mb-4">
        <h4 className="text-lg font-bold text-gray-700">{title}</h4>
        {description && <p className="text-gray-600 whitespace-pre-wrap">{description}</p>}
        {indicator && <p className="text-sm text-gray-500 mt-1"><strong>{indicatorLabel || 'Indicator'}:</strong> {indicator}</p>}
    </div>
);

interface ProblemNodeDisplayProps {
    node: { title: string; description: string };
    prefix: string;
}

const ProblemNodeDisplay: React.FC<ProblemNodeDisplayProps> = ({ node, prefix }) => {
    if (!node.title) return null;
    return <Item title={`${prefix}: ${node.title}`} description={node.description} />;
};

interface ResultsListProps {
    items: { title: string; description: string; indicator: string }[];
    prefix: string;
    indicatorLabel: string;
}

const ResultsList: React.FC<ResultsListProps> = ({ items, prefix, indicatorLabel }) => (
    <>
        {items.map((item, index) => item.title && (
            <Item key={index} title={`${prefix}${index + 1}: ${item.title}`} description={item.description} indicator={item.indicator} indicatorLabel={indicatorLabel} />
        ))}
    </>
);

const PrintLayout = ({ projectData, language = 'en', logo }) => {
    const { problemAnalysis, projectIdea, generalObjectives, specificObjectives, activities, outputs, outcomes, impacts, risks, kers, projectManagement } = projectData;
    const STEPS = getSteps(language);
    const t = TEXT[language];
    const READINESS_LEVELS_DEFINITIONS = getReadinessLevelsDefinitions(language);

    const displayLogo = logo || BRAND_ASSETS.logoText;

    return (
        <div className="p-8 bg-white text-black font-sans relative">
            <header className="text-center mb-12 relative">
                <div className="absolute top-0 right-0">
                    <img src={displayLogo} alt="Logo" className="h-12 w-auto object-contain" />
                </div>
                <h1 className="text-4xl font-bold mb-2 pt-4">{projectIdea.projectTitle || 'Project Proposal'}</h1>
                {projectIdea.projectAcronym && <p className="text-2xl font-semibold text-gray-600">({projectIdea.projectAcronym})</p>}
            </header>

            <main>
                {/* 1. Problem Analysis */}
                <Section title={STEPS[0].title}>
                    <SubSection title={t.coreProblem} children={
                        <Item title={problemAnalysis.coreProblem.title} description={problemAnalysis.coreProblem.description} />
                    } />
                    <SubSection title={t.causes} children={
                        problemAnalysis.causes.map((cause, i) => <ProblemNodeDisplay key={i} node={cause} prefix={`${t.causeTitle} #${i + 1}`} />)
                    } />
                    <SubSection title={t.consequences} children={
                        problemAnalysis.consequences.map((con, i) => <ProblemNodeDisplay key={i} node={con} prefix={`${t.consequenceTitle} #${i + 1}`} />)
                    } />
                </Section>

                {/* 2. Project Idea */}
                <Section title={STEPS[1].title}>
                    <SubSection title={t.mainAim} children={<p className="whitespace-pre-wrap">{projectIdea.mainAim}</p>} />
                    <SubSection title={t.stateOfTheArt} children={<p className="whitespace-pre-wrap">{projectIdea.stateOfTheArt}</p>} />
                    <SubSection title={t.proposedSolution} children={<p className="whitespace-pre-wrap">{projectIdea.proposedSolution}</p>} />
                    <SubSection title={t.readinessLevels} children={
                        (Object.keys(projectIdea.readinessLevels)).map((key) => {
                            const value = projectIdea.readinessLevels[key];
                            const def = READINESS_LEVELS_DEFINITIONS[key];
                            if (value.level === null) return null;
                            const levelInfo = def.levels.find(l => l.level === value.level);
                            return <Item key={key} title={def.name} description={value.justification} indicator={`Level ${value.level}: ${levelInfo?.title}`} indicatorLabel={t.indicator} />;
                        })
                    } />
                    <SubSection title={t.euPolicies} children={
                        projectIdea.policies.map((policy, i) => policy.name && <Item key={i} title={policy.name} description={policy.description} />)
                    } />
                </Section>
                
                {/* 3. General Objectives */}
                <Section title={STEPS[2].title}><ResultsList items={generalObjectives} prefix="GO" indicatorLabel={t.indicator} /></Section>
                
                {/* 4. Specific Objectives */}
                <Section title={STEPS[3].title}><ResultsList items={specificObjectives} prefix="SO" indicatorLabel={t.indicator} /></Section>

                {/* 5. Activities (Includes Workplan, Gantt, Risks) */}
                <Section title={STEPS[4].title}>
                    
                    {/* Management Section */}
                    {projectManagement?.description && (
                        <SubSection title={t.management.title}>
                            <p className="whitespace-pre-wrap mb-4">{projectManagement.description}</p>
                            <h4 className="font-bold mb-2">{t.management.organigram}</h4>
                            <Organigram structure={projectManagement.structure} activities={activities} language={language} id="organigram-print" />
                        </SubSection>
                    )}

                    {/* Workplan */}
                    <SubSection title={t.subSteps.workplan}>
                        {activities.map((wp) => wp.title && (
                            <div key={wp.id} className="mb-6">
                                <h4 className="text-lg font-bold text-gray-800">{wp.id}: {wp.title}</h4>
                                <h5 className="font-bold text-gray-700 mt-2 mb-1">{t.tasks}</h5>
                                <table className="w-full border-collapse border border-gray-300 text-sm mb-2">
                                    <thead>
                                        <tr className="bg-gray-100">
                                            <th className="border border-gray-300 p-2 text-left w-16">{t.id}</th>
                                            <th className="border border-gray-300 p-2 text-left">{t.title}</th>
                                            <th className="border border-gray-300 p-2 text-left">{t.description}</th>
                                            <th className="border border-gray-300 p-2 text-left w-32">{t.dates}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {wp.tasks.map(task => (
                                            <tr key={task.id}>
                                                <td className="border border-gray-300 p-2">{task.id}</td>
                                                <td className="border border-gray-300 p-2">{task.title}</td>
                                                <td className="border border-gray-300 p-2 whitespace-pre-wrap">{task.description}</td>
                                                <td className="border border-gray-300 p-2">{task.startDate}<br/>{task.endDate}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {wp.milestones?.length > 0 && wp.milestones.some(m => m.description) && (
                                    <div className="mb-2">
                                        <h5 className="font-bold text-gray-700">{t.milestones}</h5>
                                        <ul className="list-disc pl-5 text-sm">
                                            {wp.milestones.map(m => m.description && <li key={m.id}><strong>{m.id}:</strong> {m.description}</li>)}
                                        </ul>
                                    </div>
                                )}
                                {wp.deliverables?.length > 0 && wp.deliverables.some(d => d.description) && (
                                    <div>
                                        <h5 className="font-bold text-gray-700">{t.deliverables}</h5>
                                        <ul className="list-disc pl-5 text-sm">
                                            {wp.deliverables.map(d => d.description && <li key={d.id}><strong>{d.id}:</strong> {d.description} ({t.indicator}: {d.indicator})</li>)}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        ))}
                    </SubSection>

                    {/* Gantt Chart (Visual) */}
                    <div style={{ pageBreakInside: 'avoid', marginTop: '1.5rem', marginBottom: '1.5rem' }}>
                         <h3 className="text-xl font-semibold text-gray-800 mb-2">{t.subSteps.ganttChart}</h3>
                         <div className="border border-gray-300 rounded overflow-hidden">
                             <GanttChart activities={activities} language={language} id="gantt-chart-print" forceViewMode="project" />
                         </div>
                    </div>

                    {/* PERT Chart (Visual) - ADDED HERE */}
                    <div style={{ pageBreakInside: 'avoid', marginTop: '1.5rem', marginBottom: '1.5rem' }}>
                         <h3 className="text-xl font-semibold text-gray-800 mb-2">{t.subSteps.pertChart}</h3>
                         <div className="border border-gray-300 rounded overflow-hidden">
                             <PERTChart activities={activities} language={language} id="pert-chart-print" printMode={true} />
                         </div>
                    </div>

                    {/* Risks */}
                    <SubSection title={t.subSteps.riskMitigation}>
                        {risks.map((risk, i) => risk.description && (
                            <div key={i} className="mb-4 border-b border-gray-100 pb-2">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                         <h4 className="font-bold text-gray-800">{risk.id || `Risk ${i+1}`}: {risk.title}</h4>
                                         <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600 border border-gray-300">{t.risks.categories[risk.category.toLowerCase()] || risk.category}</span>
                                    </div>
                                </div>
                                <p className="text-gray-700 mb-1">{risk.description}</p>
                                <div className="flex gap-4 text-sm mb-1">
                                    <span><strong>{t.risks.likelihood}:</strong> {t.risks.levels[risk.likelihood.toLowerCase()] || risk.likelihood}</span>
                                    <span><strong>{t.risks.impact}:</strong> {t.risks.levels[risk.impact.toLowerCase()] || risk.impact}</span>
                                </div>
                                <p className="text-sm"><strong>{t.risks.mitigation}:</strong> {risk.mitigation}</p>
                            </div>
                        ))}
                    </SubSection>
                </Section>

                {/* 6. Expected Results */}
                <Section title={STEPS[5].title}>
                    <SubSection title={t.outputs}>
                        <ResultsList items={outputs} prefix="D" indicatorLabel={t.indicator} />
                    </SubSection>
                    <SubSection title={t.outcomes}>
                        <ResultsList items={outcomes} prefix="R" indicatorLabel={t.indicator} />
                    </SubSection>
                    <SubSection title={t.impacts}>
                        <ResultsList items={impacts} prefix="I" indicatorLabel={t.indicator} />
                    </SubSection>
                    <SubSection title={t.kers.kerTitle}>
                        {kers.map((ker, i) => ker.title && (
                            <Item 
                                key={i} 
                                title={`${ker.id || `KER${i+1}`}: ${ker.title}`} 
                                description={ker.description} 
                                indicator={ker.exploitationStrategy} 
                                indicatorLabel={t.kers.exploitationStrategy} 
                            />
                        ))}
                    </SubSection>
                </Section>
            </main>
        </div>
    );
};

export default PrintLayout;
