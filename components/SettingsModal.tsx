
import React, { useState, useEffect } from 'react';
import { storageService } from '../services/storageService.ts';
import { validateApiKey } from '../services/geminiService.ts';
import { getAppInstructions, saveAppInstructions, resetAppInstructions } from '../services/Instructions.ts';
import { TEXT } from '../locales.ts';

const SettingsModal = ({ isOpen, onClose, language }) => {
    const [activeTab, setActiveTab] = useState('general'); // 'general' | 'profile' | 'security' | 'instructions'
    const [isAdmin, setIsAdmin] = useState(false);
    
    // General State
    const [apiKey, setApiKey] = useState('');
    const [modelName, setModelName] = useState('');
    
    // Profile State (Logo)
    const [customLogo, setCustomLogo] = useState(null); 
    
    // Security State
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Instructions State
    const [instructions, setInstructions] = useState(null);

    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const t = TEXT[language].auth;

    useEffect(() => {
        if (isOpen) {
            const role = storageService.getUserRole();
            setIsAdmin(role === 'admin');

            // Load General Settings
            const key = storageService.getApiKey();
            if (key) setApiKey(key);
            
            const model = storageService.getCustomModel();
            if (model) setModelName(model);

            // Load Profile Settings
            const logo = storageService.getCustomLogo();
            setCustomLogo(logo);
            
            // Load Instructions
            setInstructions(getAppInstructions());

            // Reset
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setMessage('');
            setIsError(false);
            setActiveTab('general');
        }
    }, [isOpen]);

    const handleGeneralSave = async () => {
        setIsValidating(true);
        setMessage(t.validating || "Validating...");
        setIsError(false);

        const cleanKey = apiKey.trim();
        const cleanModel = modelName.trim();

        storageService.setCustomModel(cleanModel);

        if (cleanKey === '') {
            storageService.setApiKey('');
            setMessage(t.apiKeySaved);
            setIsValidating(false);
            setTimeout(() => { onClose(); }, 1000);
            return;
        }

        const isValidFormat = cleanKey.startsWith('AIza') && cleanKey.length >= 35;
        if (!isValidFormat) {
            setIsError(true);
            setMessage(t.invalidKey || "Invalid API Key format");
            setIsValidating(false);
            return;
        }

        const isValid = await validateApiKey(cleanKey);
        setIsValidating(false);

        if (isValid) {
            storageService.setApiKey(cleanKey);
            setMessage(t.apiKeySaved);
            setTimeout(() => { onClose(); }, 1000);
        } else {
            setIsError(true);
            setMessage(t.invalidKey || "Invalid API Key");
        }
    };

    const handlePasswordChange = async () => {
        setMessage('');
        setIsError(false);

        if (!currentPassword || !newPassword || !confirmPassword) {
            setIsError(true);
            setMessage("Please fill all password fields.");
            return;
        }

        if (newPassword !== confirmPassword) {
            setIsError(true);
            setMessage(t.passwordMismatch || "Passwords do not match.");
            return;
        }

        const result = await storageService.changePassword(currentPassword, newPassword);
        if (result.success) {
            setMessage(t.passwordChanged || "Password changed!");
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } else {
            setIsError(true);
            setMessage(t.incorrectPassword || "Incorrect current password.");
        }
    };

    const handleLogoUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result;
                setCustomLogo(base64String);
                storageService.saveCustomLogo(base64String);
                setMessage(t.logoUpdated || "Logo updated!");
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRemoveLogo = () => {
        setCustomLogo(null);
        storageService.saveCustomLogo(null);
        setMessage("Logo removed.");
    };

    // Instructions Handlers
    const handleInstructionsChange = (chapterKey, value) => {
        // Parse text back to array by new lines
        const lines = value.split('\n').filter(line => line.trim() !== '');
        
        setInstructions(prev => ({
            ...prev,
            CHAPTERS: {
                ...prev.CHAPTERS,
                [chapterKey]: {
                    ...prev.CHAPTERS[chapterKey],
                    RULES: lines
                }
            }
        }));
    };

    const handleGlobalRulesChange = (value) => {
        const lines = value.split('\n').filter(line => line.trim() !== '');
        setInstructions(prev => ({
            ...prev,
            GLOBAL_RULES: lines
        }));
    };

    const handleSaveInstructions = () => {
        saveAppInstructions(instructions);
        setMessage("Instructions updated successfully!");
    };

    const handleResetInstructions = () => {
        if(confirm("Are you sure? This will revert all instructions to system defaults.")) {
            resetAppInstructions();
            setInstructions(getAppInstructions());
            setMessage("Instructions reverted to default.");
        }
    };

    // Main Save Controller
    const handleSave = () => {
        if (activeTab === 'general') handleGeneralSave();
        else if (activeTab === 'security') handlePasswordChange();
        else if (activeTab === 'instructions') handleSaveInstructions();
        else if (activeTab === 'profile') onClose(); 
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
             <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-slate-800">{t.settings}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-xl">&times;</button>
                </div>

                <div className="flex border-b border-slate-200 overflow-x-auto">
                    <button className={`flex-1 py-3 px-4 text-sm font-semibold whitespace-nowrap ${activeTab === 'general' ? 'text-sky-600 border-b-2 border-sky-600 bg-sky-50' : 'text-slate-600 hover:bg-slate-50'}`} onClick={() => { setActiveTab('general'); setMessage(''); }}>{t.tabGeneral || "General"}</button>
                    <button className={`flex-1 py-3 px-4 text-sm font-semibold whitespace-nowrap ${activeTab === 'profile' ? 'text-sky-600 border-b-2 border-sky-600 bg-sky-50' : 'text-slate-600 hover:bg-slate-50'}`} onClick={() => { setActiveTab('profile'); setMessage(''); }}>{t.tabProfile || "Profile"}</button>
                    <button className={`flex-1 py-3 px-4 text-sm font-semibold whitespace-nowrap ${activeTab === 'security' ? 'text-sky-600 border-b-2 border-sky-600 bg-sky-50' : 'text-slate-600 hover:bg-slate-50'}`} onClick={() => { setActiveTab('security'); setMessage(''); }}>{t.tabSecurity || "Security"}</button>
                    {isAdmin && (
                        <button className={`flex-1 py-3 px-4 text-sm font-semibold whitespace-nowrap ${activeTab === 'instructions' ? 'text-sky-600 border-b-2 border-sky-600 bg-sky-50' : 'text-slate-600 hover:bg-slate-50'}`} onClick={() => { setActiveTab('instructions'); setMessage(''); }}>Instructions (Admin)</button>
                    )}
                </div>
                
                <div className="p-6 overflow-y-auto">
                    {activeTab === 'general' && (
                        <>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-slate-700 mb-1">{t.apiKeyLabel}</label>
                                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={t.apiKeyPlaceholder} className="w-full p-2 border border-slate-300 rounded-md focus:ring-sky-500 font-mono text-sm" />
                            </div>
                            <div className="mb-6 pt-4 border-t border-slate-100">
                                <label className="block text-sm font-medium text-slate-700 mb-1">{t.modelLabel || "AI Model Name"}</label>
                                <input type="text" value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder={t.modelPlaceholder} className="w-full p-2 border border-slate-300 rounded-md focus:ring-sky-500 font-mono text-sm" />
                            </div>
                        </>
                    )}

                    {activeTab === 'profile' && (
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-slate-700 mb-1">{t.logoLabel || "Custom Logo"}</label>
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 border border-slate-200 rounded-md flex items-center justify-center bg-slate-50 overflow-hidden">
                                    {customLogo ? <img src={customLogo} alt="Logo" className="w-full h-full object-contain" /> : <span className="text-xs text-slate-400">Default</span>}
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="cursor-pointer px-3 py-1.5 text-xs bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-700 text-center">
                                        {t.uploadLogo || "Upload"}
                                        <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                                    </label>
                                    {customLogo && <button onClick={handleRemoveLogo} className="px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 border border-red-100">{t.removeLogo || "Remove"}</button>}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'security' && (
                        <div>
                            <h4 className="font-bold text-slate-700 mb-3">{t.changePassword}</h4>
                            <div className="space-y-3">
                                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder={t.currentPassword} className="w-full p-2 border border-slate-300 rounded-md text-sm" />
                                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t.newPassword} className="w-full p-2 border border-slate-300 rounded-md text-sm" />
                                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t.confirmNewPassword} className="w-full p-2 border border-slate-300 rounded-md text-sm" />
                            </div>
                        </div>
                    )}

                    {activeTab === 'instructions' && instructions && (
                        <div className="space-y-6">
                            <div className="p-4 bg-sky-50 border border-sky-200 rounded text-sm text-sky-800">
                                <strong>Admin Mode:</strong> You can edit the specific rules the AI uses for generation. 
                                Each line represents a rule. Changes are saved locally and apply to all future generations.
                            </div>

                            <div>
                                <label className="block font-bold text-slate-700 mb-1">Global Rules (Apply to everything)</label>
                                <textarea 
                                    className="w-full p-2 border border-slate-300 rounded text-sm font-mono h-32"
                                    value={instructions.GLOBAL_RULES.join('\n')}
                                    onChange={(e) => handleGlobalRulesChange(e.target.value)}
                                />
                            </div>

                            {Object.entries(instructions.CHAPTERS).map(([key, chapter]: [string, any]) => (
                                <div key={key} className="border-t border-slate-200 pt-4">
                                    <h5 className="font-bold text-sky-700 mb-2">{chapter.title}</h5>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Specific Rules</label>
                                    <textarea 
                                        className="w-full p-2 border border-slate-300 rounded text-sm font-mono h-32"
                                        value={chapter.RULES.join('\n')}
                                        onChange={(e) => handleInstructionsChange(key, e.target.value)}
                                    />
                                </div>
                            ))}
                            
                            <div className="pt-2">
                                <button onClick={handleResetInstructions} className="text-red-500 text-xs hover:underline">Revert to System Defaults</button>
                            </div>
                        </div>
                    )}

                    {message && (
                        <div className={`mt-4 text-sm font-semibold p-2 rounded text-center ${isError ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                            {message}
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                    <button onClick={onClose} disabled={isValidating} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-md disabled:opacity-50">{TEXT[language].modals.closeBtn}</button>
                    <button onClick={handleSave} disabled={isValidating} className="px-4 py-2 text-sm bg-sky-600 text-white hover:bg-sky-700 rounded-md disabled:opacity-50 flex items-center gap-2">
                        {isValidating && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                        {activeTab === 'security' ? t.changePassword : t.save}
                    </button>
                </div>
             </div>
        </div>
    );
};

export default SettingsModal;
