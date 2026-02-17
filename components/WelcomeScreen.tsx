import React from 'react';
import { ICONS, getSteps, BRAND_ASSETS } from '../constants.tsx';
import { TEXT } from '../locales.ts';
import type { Language, ProjectIdea } from '../types.ts';

interface WelcomeScreenProps {
  onStartEditing: (stepId: number) => void;
  completedSteps: boolean[];
  projectIdea: ProjectIdea;
  language: Language;
  setLanguage: (lang: Language) => void;
  logo?: string;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStartEditing, completedSteps, projectIdea, language, setLanguage, logo }) => {
  const STEPS = getSteps(language);
  const t = TEXT[language];

  // Fallback to default if no custom logo provided
  const displayLogo = logo || BRAND_ASSETS.logoText;

  const renderModuleButton = (step, index, isCircular) => {
    const isProblemAnalysisComplete = completedSteps[0];
    const isCompleted = completedSteps[index];
    const isClickable = step.id === 1 || isProblemAnalysisComplete;

    let style = {};
    if (isCircular) {
      const radius = 280;
      const angle = (index / STEPS.length) * 2 * Math.PI - Math.PI / 2;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      style = {
        position: 'absolute',
        top: `calc(50% + ${y}px)`,
        left: `calc(50% + ${x}px)`,
        transform: 'translate(-50%, -50%)',
        width: '9rem',
        height: '9rem',
      };
    } else {
        style = {
            width: '9rem',
            height: '9rem',
            animation: `fadeInScale 0.5s ease-out ${index * 0.1}s forwards`,
            opacity: 0,
        }
    }

    const moduleClasses = `rounded-full flex flex-col items-center justify-center text-center p-2 text-white font-semibold shadow-lg transform transition-all duration-300 relative
      ${step.color} 
      ${!isClickable 
        ? 'filter grayscale opacity-60 cursor-not-allowed' 
        : 'cursor-pointer hover:scale-110 hover:shadow-xl'
      }`;

    return (
      <button
        key={step.id}
        disabled={!isClickable}
        onClick={() => onStartEditing(step.id)}
        className={moduleClasses}
        style={style}
        title={!isClickable ? (language === 'si' ? 'Najprej morate zaključiti analizo problemov' : 'You must complete Problem Analysis first') : step.title}
      >
         {isCompleted && (
          <div className="absolute top-2 right-2 bg-white rounded-full p-0.5 shadow-md">
            <ICONS.CHECK className="h-6 w-6 text-green-500" />
          </div>
        )}
        <span className="text-sm md:text-base">{step.title}</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-200 font-sans p-4 overflow-hidden relative">
        <div className="absolute top-4 right-4 z-10">
            <div className="bg-white rounded-md shadow-sm border border-slate-300 flex overflow-hidden">
                <button 
                    onClick={() => setLanguage('si')}
                    className={`px-3 py-1 text-sm font-medium ${language === 'si' ? 'bg-sky-100 text-sky-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                    SI
                </button>
                <div className="w-px bg-slate-300"></div>
                <button 
                    onClick={() => setLanguage('en')}
                    className={`px-3 py-1 text-sm font-medium ${language === 'en' ? 'bg-sky-100 text-sky-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                    EN
                </button>
            </div>
        </div>

      {/* fadeInScale keyframe moved to index.css */}
      
      <div className="text-center mb-16 relative z-20">
        <div className="flex flex-col items-center justify-center gap-6 mb-4">
            <h1 className="text-4xl md:text-5xl font-bold text-slate-800 tracking-tight">{t.appTitle}</h1>
        </div>
        
        {projectIdea.projectTitle ? (
             <div className="mt-4" style={{ animation: `fadeIn 1s ease-out`}}>
                 <h2 className="text-2xl font-semibold text-sky-700">{projectIdea.projectTitle}</h2>
                 {projectIdea.projectAcronym && (
                    <p className="text-xl md:text-2xl font-bold text-orange-600 tracking-widest">({projectIdea.projectAcronym})</p>
                 )}
             </div>
        ) : (
            <p className="text-lg text-slate-600 max-w-lg mx-auto mt-2">{t.clickToStart}</p>
        )}
      </div>

      {/* Responsive Layout (Mobile & Tablet) */}
      <div className="flex flex-wrap justify-center items-center gap-10 lg:hidden w-full max-w-4xl px-4 z-10">
        {STEPS.map((step, index) => renderModuleButton(step, index, false))}
      </div>

      {/* Desktop Circular Layout */}
      <div
        className="hidden lg:relative lg:flex items-center justify-center z-10"
        style={{ width: '720px', height: '720px' }}
      >
        <div className="absolute w-full h-full border-2 border-dashed border-slate-300 rounded-full animate-[spin_60s_linear_infinite]"></div>
        <div className="absolute text-center px-8 flex flex-col items-center justify-center">
             <img src={displayLogo} alt="Logo" className="h-12 w-auto mb-3 opacity-90 object-contain max-w-[150px]"/>
            <h2 className="text-xl font-semibold text-slate-600">{t.appTitle}</h2>
            <p className="text-slate-400 text-sm">{t.subtitle}</p>
        </div>
        {STEPS.map((step, index) => renderModuleButton(step, index, true))}
      </div>

      {/* ★ COPYRIGHT FOOTER */}
      <div className="absolute bottom-4 left-0 right-0 text-center z-20">
        <p className="text-xs text-slate-400">{t.copyright}</p>
      </div>
    </div>
  );
};

export default WelcomeScreen;
