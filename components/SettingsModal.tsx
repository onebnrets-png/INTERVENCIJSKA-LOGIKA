// components/SettingsModal.tsx
// Updated for async Supabase-backed storageService

import React, { useState, useEffect } from 'react';
import { storageService } from '../services/storageService.ts';
import { validateProviderKey, OPENROUTER_MODELS, type AIProviderType } from '../services/aiProvider.ts';
import { getAppInstructions, getFullInstructions, saveAppInstructions, resetAppInstructions } from '../services/Instructions.ts';
import { TEXT } from '../locales.ts';

const SettingsModal = ({ isOpen, onClose, language }) => {
    const [activeTab, setActiveTab] = useState('general');
    const [isAdmin, setIsAdmin] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // General State
    const [aiProvider, setAiProvider] = useState<AIProviderType>('gemini');
    const [geminiKey, setGeminiKey] = useState('');
    const [openRouterKey, setOpenRouterKey] = useState('');
    const [modelName, setModelName] = useState('');

    // Profile State (Logo)
    const [customLogo, setCustomLogo] = useState<string | null>(null);

    // Security State
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Instructions State
    const [instructions, setInstructions] = useState<any>(null);

    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const t = TEXT[language].auth;

    useEffect(() => {
        if (isOpen) {
            loadAllSettings();
        }
    }, [isOpen]);

    const loadAllSettings = async () => {
        setIsLoading(true);

        const role = storageService.getUserRole();
        setIsAdmin(role === 'admin');

        // Load settings from Supabase (via cache)
        await storageService.loadSettings();

        const provider = storageService.getAIProvider() || 'gemini';
        setAiProvider(provider);

        const gKey = storageService.getApiKey();
        if (gKey) setGeminiKey(gKey);

        const orKey = storageService.getOpenRouterKey();
        if (orKey) setOpenRouterKey(orKey);

        const model = storageService.getCustomModel();
        if (model) setModelName(model);

        const logo = storageService.getCustomLogo();
        setCustomLogo(logo);

        setInstructions(getFullInstructions());

        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setMessage('');
        setIsError(false);
        setActiveTab('general');
        setIsLoading(false);
    };

    const handleProviderChange = (provider: AIProviderType) => {
        setAiProvider(provider);
        if (provider === 'gemini' && !modelName.startsWith('gemini')) {
            setModelName('gemini-3-pro-preview');
        } else if (provider === 'openrouter' && modelName.startsWith('gemini')) {
            setModelName('openai/gpt-4o');
        }
    };

    const handleGeneralSave = async () => {
        setIsValidating(true);
        setMessage(t.validating || "Validating...");
        setIsError(false);

        // Save all settings to Supabase
        await storageService.setAIProvider(aiProvider);
        await storageService.setCustomModel(modelName.trim());
        await storageService.setApiKey(geminiKey.trim());
        await storageService.setOpenRouterKey(openRouterKey.trim());

        const activeKey = aiProvider === 'gemini' ? geminiKey.trim() : openRouterKey.trim();

        if (activeKey === '') {
            setMessage(language === 'si' ? 'Nastavitve shranjene.' : 'Settings saved.');
            setIsValidating(false);
            setTimeout(() => { onClose(); }, 1000);
            return;
        }

        const isValid = await validateProviderKey(aiProvider, activeKey);
        setIsValidating(false);

        if (isValid) {
            setMessage(language === 'si' ? 'API ključ potrjen in shranjen!' : 'API Key validated and saved!');
            setTimeout(() => { onClose(); }, 1000);
        } else {
            setIsError(true);
            setMessage(t.invalidKey || "Invalid API Key");
        }
    };

    const handlePasswordChange = async () => {
        setMessage('');
        setIsError(false);

        if (!newPassword || !confirmPassword) {
            setIsError(true);
            setMessage(language === 'si' ? "Prosim izpolnite polja za novo geslo." : "Please fill password fields.");
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
            setMessage(result.message || t.incorrectPassword || "Password change failed.");
        }
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64String = reader.result as string;
                setCustomLogo(base64String);
                await storageService.saveCustomLogo(base64String);
                setMessage(t.logoUpdated || "Logo updated!");
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRemoveLogo = async () => {
        setCustomLogo(null);
        await storageService.saveCustomLogo(null);
        setMessage(language === 'si' ? "Logo odstranjen." : "Logo removed.");
    };

    const handleInstructionsChange = (chapterKey: string, value: string) => {
        const lines = value.split('\n').filter(line => line.trim() !== '');
        setInstructions((prev: any) => ({
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

    const handleGlobalRulesChange = (value: string) => {
        const lines = value.split('\n').filter(line => line.trim() !== '');
        setInstructions((prev: any) => ({
            ...prev,
            GLOBAL_RULES: lines
        }));
    };

    const handleSaveInstructions = async () => {
        await saveAppInstructions(instructions);
        setMessage(language === 'si' ? "Navodila posodobljena!" : "Instructions updated successfully!");
    };

    const handleResetInstructions = async () => {
        const msg = language === 'si'
            ? "Ali ste prepričani? To bo povrnilo vsa navodila na sistemske privzete vrednosti."
            : "Are you sure? This will revert all instructions to system defaults.";
        if (confirm(msg)) {
            await resetAppInstructions();
            setInstructions(getFullInstructions());
            setMessage(language === 'si' ? "Navodila povrnjena na privzeto." : "Instructions reverted to default.");
        }
    };

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
                        <button className={`flex-1 py-3 px-4 text-sm font-semibold whitespace-nowrap ${activeTab === 'instructions' ? 'text-sky-600 border-b-2 border-sky-600 bg-sky-50' : 'text-slate-600 hover:bg-slate-50'}`} onClick={() => { setActiveTab('instructions'); setMessage(''); }}>
                            {language === 'si' ? 'Navodila (Admin)' : 'Instructions (Admin)'}
                        </button>
                    )}
                </div>

                <div className="p-6 overflow-y-auto">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin"></div>
                            <span className="ml-3 text-slate-500">{language === 'si' ? 'Nalaganje...' : 'Loading...'}</span>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'general' && (
                                <>
                                    <div className="mb-5">
                                        <label className="block text-sm font-medium text-slate-700 mb-2">
                                            {language === 'si' ? 'AI ponudnik' : 'AI Provider'}
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button type="button" onClick={() => handleProviderChange('gemini')}
                                                className={`p-3 rounded-lg border-2 text-left transition-all ${aiProvider === 'gemini' ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-500' : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
                                                <div className="font-semibold text-sm text-slate-800">Google Gemini</div>
                                                <div className="text-xs text-slate-500 mt-0.5">{language === 'si' ? 'Direktna povezava' : 'Direct connection'}</div>
                                            </button>
                                            <button type="button" onClick={() => handleProviderChange('openrouter')}
                                                className={`p-3 rounded-lg border-2 text-left transition-all ${aiProvider === 'openrouter' ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-500' : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
                                                <div className="font-semibold text-sm text-slate-800">OpenRouter</div>
                                                <div className="text-xs text-slate-500 mt-0.5">GPT-4o, Claude, Mistral...</div>
                                            </button>
                                        </div>
                                    </div>

                                    {aiProvider === 'gemini' && (
                                        <div className="mb-4">
                                            <label className="block text-sm font-medium text-slate-700 mb-1">{language === 'si' ? 'Google Gemini API ključ' : 'Google Gemini API Key'}</label>
                                            <input type="password" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} placeholder="AIza..." className="w-full p-2 border border-slate-300 rounded-md focus:ring-sky-500 font-mono text-sm" />
                                            <p className="text-xs text-slate-400 mt-1">{language === 'si' ? 'Pridobite ključ na aistudio.google.com' : 'Get your key at aistudio.google.com'}</p>
                                        </div>
                                    )}

                                    {aiProvider === 'openrouter' && (
                                        <div className="mb-4">
                                            <label className="block text-sm font-medium text-slate-700 mb-1">OpenRouter API Key</label>
                                            <input type="password" value={openRouterKey} onChange={(e) => setOpenRouterKey(e.target.value)} placeholder="sk-or-..." className="w-full p-2 border border-slate-300 rounded-md focus:ring-sky-500 font-mono text-sm" />
                                            <p className="text-xs text-slate-400 mt-1">{language === 'si' ? 'Pridobite ključ na openrouter.ai/keys' : 'Get your key at openrouter.ai/keys'}</p>
                                        </div>
                                    )}

                                    <div className="mb-4 pt-4 border-t border-slate-100">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">{language === 'si' ? 'AI model' : 'AI Model'}</label>
                                        {aiProvider === 'openrouter' ? (
                                            <>
                                                <select value={modelName} onChange={(e) => setModelName(e.target.value)} className="w-full p-2 border border-slate-300 rounded-md focus:ring-sky-500 text-sm">
                                                    {OPENROUTER_MODELS.map(m => (<option key={m.id} value={m.id}>{m.name} – {m.description}</option>))}
                                                </select>
                                                <div className="mt-2">
                                                    <label className="block text-xs text-slate-500 mb-1">{language === 'si' ? 'Ali vnesite ID modela ročno:' : 'Or enter model ID manually:'}</label>
                                                    <input type="text" value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="e.g. openai/gpt-4o" className="w-full p-2 border border-slate-300 rounded-md focus:ring-sky-500 font-mono text-xs" />
                                                </div>
                                            </>
                                        ) : (
                                            <input type="text" value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder={t.modelPlaceholder || "gemini-3-pro-preview"} className="w-full p-2 border border-slate-300 rounded-md focus:ring-sky-500 font-mono text-sm" />
                                        )}
                                    </div>

                                    {aiProvider === 'openrouter' && (
                                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
                                            <strong>OpenRouter</strong>
                                            {language === 'si' ? ' omogoča dostop do 100+ AI modelov z enim samim API ključem.' : ' gives you access to 100+ AI models with a single API key.'}
                                            <br /><a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="underline font-semibold mt-1 inline-block">openrouter.ai</a>
                                        </div>
                                    )}
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
                                    <p className="text-xs text-slate-500 mb-3">
                                        {language === 'si' ? 'Supabase avtentikacija – vnesite samo novo geslo.' : 'Supabase authentication – just enter your new password.'}
                                    </p>
                                    <div className="space-y-3">
                                        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t.newPassword} className="w-full p-2 border border-slate-300 rounded-md text-sm" />
                                        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t.confirmNewPassword} className="w-full p-2 border border-slate-300 rounded-md text-sm" />
                                    </div>
                                </div>
                            )}

                            {activeTab === 'instructions' && instructions && (
                                <div className="space-y-6">
                                    <div className="p-4 bg-sky-50 border border-sky-200 rounded text-sm text-sky-800">
                                        <strong>{language === 'si' ? 'Administratorski način' : 'Admin Mode'}:</strong>{' '}
                                        {language === 'si' ? 'Uredite pravila, ki jih AI uporablja pri generiranju.' : 'Edit the rules the AI uses for generation.'}
                                    </div>

                                    <div>
                                        <label className="block font-bold text-slate-700 mb-1">{language === 'si' ? 'Globalna pravila' : 'Global Rules'}</label>
                                        <textarea className="w-full p-2 border border-slate-300 rounded text-sm font-mono h-32" value={instructions.GLOBAL_RULES?.join('\n') || ''} onChange={(e) => handleGlobalRulesChange(e.target.value)} />
                                    </div>

                                    {instructions.CHAPTERS && Object.entries(instructions.CHAPTERS).map(([key, chapter]: [string, any]) => (
                                        <div key={key} className="border-t border-slate-200 pt-4">
                                            <h5 className="font-bold text-sky-700 mb-2">{chapter.title}</h5>
                                            <textarea className="w-full p-2 border border-slate-300 rounded text-sm font-mono h-32" value={chapter.RULES?.join('\n') || ''} onChange={(e) => handleInstructionsChange(key, e.target.value)} />
                                        </div>
                                    ))}

                                    <button onClick={handleResetInstructions} className="text-red-500 text-xs hover:underline">
                                        {language === 'si' ? 'Povrni na privzete vrednosti' : 'Revert to System Defaults'}
                                    </button>
                                </div>
                            )}

                            {message && (
                                <div className={`mt-4 text-sm font-semibold p-2 rounded text-center ${isError ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                    {message}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                    <button onClick={onClose} disabled={isValidating} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-md disabled:opacity-50">{TEXT[language].modals.closeBtn}</button>
                    <button onClick={handleSave} disabled={isValidating || isLoading} className="px-4 py-2 text-sm bg-sky-600 text-white hover:bg-sky-700 rounded-md disabled:opacity-50 flex items-center gap-2">
                        {isValidating && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                        {activeTab === 'security' ? t.changePassword : t.save}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
