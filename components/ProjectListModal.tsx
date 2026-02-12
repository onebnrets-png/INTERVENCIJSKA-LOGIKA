
import React from 'react';
import { ICONS } from '../constants.tsx';
import { TEXT } from '../locales.ts';

const ProjectListModal = ({ isOpen, onClose, projects, onSelectProject, onCreateProject, onDeleteProject, currentProjectId, language }) => {
  if (!isOpen) return null;

  const t = TEXT[language].projects;
  const tCommon = TEXT[language];

  const formatDate = (isoString) => {
      try {
          return new Date(isoString).toLocaleDateString(language, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      } catch (e) {
          return isoString;
      }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[80vh]">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <svg className="w-6 h-6 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
            {t.myProjects}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-100">
            {projects.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                    <p>{t.noProjects}</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {projects.map((proj) => {
                        const isCurrent = proj.id === currentProjectId;
                        return (
                            <div 
                                key={proj.id} 
                                className={`group flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border transition-all shadow-sm
                                    ${isCurrent ? 'bg-sky-50 border-sky-300 ring-1 ring-sky-200' : 'bg-white border-slate-200 hover:border-sky-200 hover:shadow-md'}
                                `}
                            >
                                <div className="flex-1 cursor-pointer" onClick={() => onSelectProject(proj.id)}>
                                    <h4 className={`font-semibold text-lg ${isCurrent ? 'text-sky-800' : 'text-slate-700'}`}>
                                        {proj.title || t.untitled}
                                        {isCurrent && <span className="ml-2 text-xs bg-sky-200 text-sky-700 px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Active</span>}
                                    </h4>
                                    <p className="text-xs text-slate-500 mt-1">
                                        {t.lastModified}: {formatDate(proj.updatedAt)}
                                    </p>
                                </div>
                                
                                <div className="flex items-center gap-3 mt-3 sm:mt-0 opacity-100 sm:opacity-60 sm:group-hover:opacity-100 transition-opacity">
                                    {!isCurrent && (
                                        <button 
                                            onClick={() => onSelectProject(proj.id)}
                                            className="px-3 py-1.5 text-sm bg-white border border-slate-300 rounded text-slate-600 hover:text-sky-600 hover:border-sky-300 shadow-sm"
                                        >
                                            {t.open}
                                        </button>
                                    )}
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onDeleteProject(proj.id); }}
                                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                        title={t.delete}
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex justify-between items-center">
            <button onClick={onClose} className="text-slate-500 text-sm hover:text-slate-800">
                {tCommon.modals.closeBtn}
            </button>
            <button 
                onClick={onCreateProject}
                className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700 shadow-lg hover:shadow-sky-200 transition-all transform hover:-translate-y-0.5"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"></path></svg>
                {t.createNew}
            </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectListModal;
