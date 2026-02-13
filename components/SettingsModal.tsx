// components/SettingsModal.tsx
// Settings modal with AI provider, profile, security (MFA), and full Instructions editor.

import React, { useState, useEffect } from 'react';
import { storageService } from '../services/storageService.ts';
import { validateProviderKey, OPENROUTER_MODELS, GEMINI_MODELS, type AIProviderType } from '../services/aiProvider.ts';
import {
  getFullInstructions,
  getDefaultInstructions,
  saveAppInstructions,
  resetAppInstructions,
  CHAPTER_LABELS,
  FIELD_RULE_LABELS
} from '../services/Instructions.ts';
import { TEXT } from '../locales.ts';

// ─── QR Code via external service ────────────────────────────────
const QRCodeImage = ({ value, size = 200 }: { value: string; size?: number }) => {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&margin=8`;
  return <img src={url} alt="QR Code" width={size} height={size} className="rounded-lg border border-slate-200" />;
};

// ─── Collapsible Section ─────────────────────────────────────────
const CollapsibleSection = ({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <span className="font-semibold text-sm text-slate-700">{title}</span>
        <svg className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && <div className="p-4 border-t border-slate-200">{children}</div>}
    </div>
  );
};

// ─── Component ───────────────────────────────────────────────────
const SettingsModal = ({ isOpen, onClose, language }) => {
  const [activeTab, setActiveTab] = useState('general');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // General State
  const [aiProvider, setAiProvider] = useState<AIProviderType>('gemini');
  const [geminiKey, setGeminiKey] = useState('');
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [modelName, setModelName] = useState('');

  // Profile State
  const [customLogo, setCustomLogo] = useState<string | null>(null);

  // Security State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 2FA State
  const [mfaFactors, setMfaFactors] = useState<any[]>([]);
  const [mfaEnrolling, setMfaEnrolling] = useState(false);
  const [enrollData, setEnrollData] = useState<{ factorId: string; qrUri: string; secret: string } | null>(null);
  const [enrollCode, setEnrollCode] = useState('');
  const [enrollError, setEnrollError] = useState('');

  // Instructions State
  const [instructions, setInstructions] = useState<any>(null);
  const [instructionsSubTab, setInstructionsSubTab] = useState('global');
  const [instructionsChanged, setInstructionsChanged] = useState(false);

  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const t = TEXT[language].auth;

  useEffect(() => {
    if (isOpen) loadAllSettings();
  }, [isOpen]);

  const loadAllSettings = async () => {
    setIsLoading(true);
    const role = storageService.getUserRole();
    setIsAdmin(role === 'admin');

    await storageService.loadSettings();
    const provider = storageService.getAIProvider() || 'gemini';
    setAiProvider(provider);
    setGeminiKey(storageService.getApiKey() || '');
    setOpenRouterKey(storageService.getOpenRouterKey() || '');
    const model = storageService.getCustomModel();
    setModelName(model || (provider === 'gemini' ? 'gemini-3-pro-preview' : 'deepseek/deepseek-v3.2'));
    setCustomLogo(storageService.getCustomLogo());

    // Deep clone instructions to avoid mutating defaults
    setInstructions(JSON.parse(JSON.stringify(getFullInstructions())));
    setInstructionsChanged(false);

    try {
      const { totp } = await storageService.getMFAFactors();
      setMfaFactors(totp.filter((f: any) => f.status === 'verified'));
    } catch { setMfaFactors([]); }

    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    setMfaEnrolling(false); setEnrollData(null); setEnrollCode(''); setEnrollError('');
    setMessage(''); setIsError(false); setActiveTab('general'); setInstructionsSubTab('global');
    setIsLoading(false);
  };

  // ─── General Handlers ──────────────────────────────────────────
  const handleProviderChange = (provider: AIProviderType) => {
    setAiProvider(provider);
    if (provider === 'gemini' && !modelName.startsWith('gemini')) setModelName('gemini-3-pro-preview');
    else if (provider === 'openrouter' && modelName.startsWith('gemini')) setModelName('deepseek/deepseek-v3.2');
  };

  const handleGeneralSave = async () => {
    setIsValidating(true); setMessage(t.validating || "Validating..."); setIsError(false);
    await storageService.setAIProvider(aiProvider);
    await storageService.setCustomModel(modelName.trim());
    await storageService.setApiKey(geminiKey.trim());
    await storageService.setOpenRouterKey(openRouterKey.trim());
    const activeKey = aiProvider === 'gemini' ? geminiKey.trim() : openRouterKey.trim();
    if (activeKey === '') {
      setMessage(language === 'si' ? 'Nastavitve shranjene.' : 'Settings saved.');
      setIsValidating(false); setTimeout(() => onClose(), 1000); return;
    }
    const isValid = await validateProviderKey(aiProvider, activeKey);
    setIsValidating(false);
    if (isValid) { setMessage(language === 'si' ? 'API ključ potrjen in shranjen!' : 'API Key validated and saved!'); setTimeout(() => onClose(), 1000); }
    else { setIsError(true); setMessage(t.invalidKey || "Invalid API Key"); }
  };

  // ─── Password Handler ──────────────────────────────────────────
  const handlePasswordChange = async () => {
    setMessage(''); setIsError(false);
    if (!newPassword || !confirmPassword) { setIsError(true); setMessage(language === 'si' ? "Prosim izpolnite polja za novo geslo." : "Please fill password fields."); return; }
    if (newPassword !== confirmPassword) { setIsError(true); setMessage(t.passwordMismatch || "Passwords do not match."); return; }
    const result = await storageService.changePassword(currentPassword, newPassword);
    if (result.success) { setMessage(t.passwordChanged || "Password changed!"); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }
    else { setIsError(true); setMessage(result.message || t.incorrectPassword || "Password change failed."); }
  };

  // ─── Logo Handlers ─────────────────────────────────────────────
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => { const b64 = reader.result as string; setCustomLogo(b64); await storageService.saveCustomLogo(b64); setMessage(t.logoUpdated || "Logo updated!"); };
      reader.readAsDataURL(file);
    }
  };
  const handleRemoveLogo = async () => { setCustomLogo(null); await storageService.saveCustomLogo(null); setMessage(language === 'si' ? "Logo odstranjen." : "Logo removed."); };

  // ─── MFA Handlers ──────────────────────────────────────────────
  const handleStartMFAEnroll = async () => {
    setEnrollError(''); setEnrollCode('');
    const result = await storageService.enrollMFA();
    if (result) { setEnrollData(result); setMfaEnrolling(true); }
    else setEnrollError(language === 'si' ? 'Napaka pri inicializaciji 2FA.' : 'Failed to initialize 2FA.');
  };

  const handleVerifyMFAEnroll = async () => {
    setEnrollError('');
    if (enrollCode.length !== 6) { setEnrollError(language === 'si' ? 'Vnesi 6-mestno kodo.' : 'Enter a 6-digit code.'); return; }
    if (!enrollData) return;
    const result = await storageService.challengeAndVerifyMFA(enrollData.factorId, enrollCode);
    if (result.success) {
      setMfaEnrolling(false); setEnrollData(null);
      const { totp } = await storageService.getMFAFactors();
      setMfaFactors(totp.filter((f: any) => f.status === 'verified'));
      setMessage(language === 'si' ? '2FA uspešno aktiviran!' : '2FA enabled successfully!'); setIsError(false);
    } else { setEnrollError(result.message || (language === 'si' ? 'Napačna koda.' : 'Invalid code.')); setEnrollCode(''); }
  };

  const handleDisableMFA = async (factorId: string) => {
    if (!confirm(language === 'si' ? 'Ali res želiš deaktivirati 2FA?' : 'Disable two-factor authentication?')) return;
    const result = await storageService.unenrollMFA(factorId);
    if (result.success) { setMfaFactors(prev => prev.filter(f => f.id !== factorId)); setMessage(language === 'si' ? '2FA deaktiviran.' : '2FA disabled.'); setIsError(false); }
    else { setIsError(true); setMessage(result.message || (language === 'si' ? 'Napaka pri deaktivaciji.' : 'Failed to disable 2FA.')); }
  };

  // ─── Instructions Handlers (NEW – v3.2) ────────────────────────
  const updateInstructions = (updater: (prev: any) => any) => {
    setInstructions((prev: any) => updater(prev));
    setInstructionsChanged(true);
  };

  const handleGlobalRulesChange = (value: string) => {
    updateInstructions(prev => ({ ...prev, GLOBAL_RULES: value }));
  };

  const handleChapterChange = (key: string, value: string) => {
    updateInstructions(prev => ({ ...prev, CHAPTERS: { ...prev.CHAPTERS, [key]: value } }));
  };

  const handleFieldRuleChange = (key: string, value: string) => {
    updateInstructions(prev => ({ ...prev, FIELD_RULES: { ...prev.FIELD_RULES, [key]: value } }));
  };

  const handleTranslationRulesChange = (value: string) => {
    updateInstructions(prev => ({ ...prev, TRANSLATION_RULES: value }));
  };

  const handleSummaryRulesChange = (value: string) => {
    updateInstructions(prev => ({ ...prev, SUMMARY_RULES: value }));
  };

  const handleSaveInstructions = async () => {
    await saveAppInstructions(instructions);
    setInstructionsChanged(false);
    setMessage(language === 'si' ? "Navodila shranjena!" : "Instructions saved!");
    setIsError(false);
  };

  const handleResetInstructions = async () => {
    if (!confirm(language === 'si' ? "Povrni vsa navodila na privzete vrednosti? Vse spremembe bodo izgubljene." : "Revert ALL instructions to defaults? All changes will be lost.")) return;
    const defaults = await resetAppInstructions();
    setInstructions(JSON.parse(JSON.stringify(defaults)));
    setInstructionsChanged(false);
    setMessage(language === 'si' ? "Navodila povrnjena na privzete." : "Instructions reverted to defaults.");
    setIsError(false);
  };

  const handleResetSection = (sectionKey: string) => {
    const defaults = getDefaultInstructions();
    if (sectionKey === 'GLOBAL_RULES') {
      updateInstructions(prev => ({ ...prev, GLOBAL_RULES: defaults.GLOBAL_RULES }));
    } else if (sectionKey === 'TRANSLATION_RULES') {
      updateInstructions(prev => ({ ...prev, TRANSLATION_RULES: defaults.TRANSLATION_RULES }));
    } else if (sectionKey === 'SUMMARY_RULES') {
      updateInstructions(prev => ({ ...prev, SUMMARY_RULES: defaults.SUMMARY_RULES }));
    } else if (sectionKey.startsWith('chapter')) {
      updateInstructions(prev => ({ ...prev, CHAPTERS: { ...prev.CHAPTERS, [sectionKey]: defaults.CHAPTERS[sectionKey] } }));
    } else if (defaults.FIELD_RULES[sectionKey] !== undefined) {
      updateInstructions(prev => ({ ...prev, FIELD_RULES: { ...prev.FIELD_RULES, [sectionKey]: defaults.FIELD_RULES[sectionKey] } }));
    }
    setMessage(language === 'si' ? `Razdelek ponastavljen.` : `Section reset to default.`);
    setIsError(false);
  };

  // ─── Save Router ───────────────────────────────────────────────
  const handleSave = () => {
    if (activeTab === 'general') handleGeneralSave();
    else if (activeTab === 'security') handlePasswordChange();
    else if (activeTab === 'instructions') handleSaveInstructions();
    else if (activeTab === 'profile') onClose();
  };

  if (!isOpen) return null;

  const currentModels = aiProvider === 'gemini' ? GEMINI_MODELS : OPENROUTER_MODELS;
  const hasMFA = mfaFactors.length > 0;

  const instructionsSubTabs = [
    { id: 'global', label: 'Global Rules' },
    { id: 'chapters', label: 'Chapters' },
    { id: 'fields', label: 'Field Rules' },
    { id: 'translation', label: 'Translation' },
    { id: 'summary', label: 'Summary' }
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
          <h3 className="text-xl font-bold text-slate-800">{t.settings}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-xl">&times;</button>
        </div>

        {/* Main Tabs */}
        <div className="flex border-b border-slate-200 overflow-x-auto shrink-0">
          {['general', 'profile', 'security'].map(tab => (
            <button key={tab}
              className={`flex-1 py-3 px-4 text-sm font-semibold whitespace-nowrap ${activeTab === tab ? 'text-sky-600 border-b-2 border-sky-600 bg-sky-50' : 'text-slate-600 hover:bg-slate-50'}`}
              onClick={() => { setActiveTab(tab); setMessage(''); }}>
              {tab === 'general' ? (t.tabGeneral || "General") : tab === 'profile' ? (t.tabProfile || "Profile") : (t.tabSecurity || "Security")}
            </button>
          ))}
          {isAdmin && (
            <button
              className={`flex-1 py-3 px-4 text-sm font-semibold whitespace-nowrap ${activeTab === 'instructions' ? 'text-sky-600 border-b-2 border-sky-600 bg-sky-50' : 'text-slate-600 hover:bg-slate-50'}`}
              onClick={() => { setActiveTab('instructions'); setMessage(''); }}>
              {language === 'si' ? 'Navodila' : 'Instructions'}
              {instructionsChanged && <span className="ml-1 w-2 h-2 bg-amber-500 rounded-full inline-block"></span>}
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="ml-3 text-slate-500">{language === 'si' ? 'Nalaganje...' : 'Loading...'}</span>
            </div>
          ) : (
            <>
              {/* ═══ GENERAL TAB ═══ */}
              {activeTab === 'general' && (
                <>
                  <div className="mb-5">
                    <label className="block text-sm font-medium text-slate-700 mb-2">{language === 'si' ? 'AI ponudnik' : 'AI Provider'}</label>
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
                    <select value={currentModels.some(m => m.id === modelName) ? modelName : ''} onChange={(e) => setModelName(e.target.value)} className="w-full p-2 border border-slate-300 rounded-md focus:ring-sky-500 text-sm">
                      {!currentModels.some(m => m.id === modelName) && modelName && (<option value={modelName}>{modelName} ({language === 'si' ? 'ročno vnesen' : 'custom'})</option>)}
                      {currentModels.map(m => (<option key={m.id} value={m.id}>{m.name} – {m.description}</option>))}
                    </select>
                    <div className="mt-2">
                      <label className="block text-xs text-slate-500 mb-1">{language === 'si' ? 'Ali vnesite ID modela ročno:' : 'Or enter model ID manually:'}</label>
                      <input type="text" value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder={aiProvider === 'gemini' ? "gemini-3-pro-preview" : "e.g. openai/gpt-4o"} className="w-full p-2 border border-slate-300 rounded-md focus:ring-sky-500 font-mono text-xs" />
                    </div>
                  </div>
                  {aiProvider === 'gemini' && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-800">
                      <strong>Google Gemini</strong>{language === 'si' ? ' – brezplačna kvota za razvoj.' : ' – free tier for development.'}
                      <br /><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="underline font-semibold mt-1 inline-block">aistudio.google.com</a>
                    </div>
                  )}
                  {aiProvider === 'openrouter' && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
                      <strong>OpenRouter</strong>{language === 'si' ? ' omogoča dostop do 100+ AI modelov.' : ' gives you access to 100+ AI models.'}
                      <br /><a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="underline font-semibold mt-1 inline-block">openrouter.ai</a>
                    </div>
                  )}
                </>
              )}

              {/* ═══ PROFILE TAB ═══ */}
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

              {/* ═══ SECURITY TAB ═══ */}
              {activeTab === 'security' && (
                <div className="space-y-8">
                  <div>
                    <h4 className="font-bold text-slate-700 mb-3">{t.changePassword}</h4>
                    <p className="text-xs text-slate-500 mb-3">{language === 'si' ? 'Vnesite novo geslo.' : 'Enter your new password.'}</p>
                    <div className="space-y-3">
                      <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t.newPassword} className="w-full p-2 border border-slate-300 rounded-md text-sm" />
                      <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t.confirmNewPassword} className="w-full p-2 border border-slate-300 rounded-md text-sm" />
                    </div>
                  </div>
                  {/* 2FA Section */}
                  <div className="border-t border-slate-200 pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="font-bold text-slate-700">{language === 'si' ? 'Dvostopenjsko preverjanje (2FA)' : 'Two-Factor Authentication (2FA)'}</h4>
                        <p className="text-sm text-slate-500 mt-1">{language === 'si' ? 'Uporabi authenticator aplikacijo za dodatno zaščito.' : 'Use an authenticator app for extra security.'}</p>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-xs font-bold ${hasMFA ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {hasMFA ? (language === 'si' ? 'AKTIVNO' : 'ACTIVE') : (language === 'si' ? 'NEAKTIVNO' : 'INACTIVE')}
                      </div>
                    </div>
                    {hasMFA && !mfaEnrolling && (
                      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center gap-3 mb-3">
                          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                          <p className="text-sm text-green-800 font-medium">{language === 'si' ? 'Račun je zaščiten z 2FA.' : 'Account is protected with 2FA.'}</p>
                        </div>
                        {mfaFactors.map(factor => (
                          <div key={factor.id} className="flex items-center justify-between mt-2">
                            <span className="text-xs text-slate-600 font-mono">{factor.friendly_name || 'TOTP'}</span>
                            <button onClick={() => handleDisableMFA(factor.id)} className="px-4 py-2 text-sm bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium transition-colors">{language === 'si' ? 'Deaktiviraj' : 'Disable'}</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {!hasMFA && !mfaEnrolling && (
                      <>
                        {enrollError && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">{enrollError}</div>}
                        <button onClick={handleStartMFAEnroll} className="px-5 py-2.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 font-semibold transition-colors flex items-center gap-2 shadow-sm">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                          {language === 'si' ? 'Nastavi 2FA' : 'Set up 2FA'}
                        </button>
                      </>
                    )}
                    {mfaEnrolling && enrollData && (
                      <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-5">
                        <div>
                          <h5 className="font-bold text-slate-700 mb-2">{language === 'si' ? '1. Skeniraj QR kodo' : '1. Scan QR Code'}</h5>
                          <p className="text-sm text-slate-500 mb-4">{language === 'si' ? 'Odpri authenticator aplikacijo in skeniraj QR kodo.' : 'Open your authenticator app and scan the QR code.'}</p>
                          <div className="flex justify-center p-4 bg-white rounded-lg border border-slate-200"><QRCodeImage value={enrollData.qrUri} size={200} /></div>
                          <div className="mt-3 text-center">
                            <p className="text-xs text-slate-400 mb-1">{language === 'si' ? 'Ali ročno vnesi ključ:' : 'Or enter key manually:'}</p>
                            <code className="text-sm font-mono bg-white px-3 py-1.5 rounded border border-slate-200 text-slate-700 select-all tracking-widest">{enrollData.secret}</code>
                          </div>
                        </div>
                        <div className="border-t border-slate-200 pt-4">
                          <h5 className="font-bold text-slate-700 mb-2">{language === 'si' ? '2. Vnesi kodo' : '2. Enter Code'}</h5>
                          {enrollError && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">{enrollError}</div>}
                          <div className="flex gap-3">
                            <input type="text" value={enrollCode} onChange={(e) => setEnrollCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" maxLength={6}
                              className="flex-1 p-3 border border-slate-300 rounded-lg text-center text-xl tracking-widest font-mono focus:ring-2 focus:ring-sky-500" autoFocus
                              onKeyDown={(e) => e.key === 'Enter' && enrollCode.length === 6 && handleVerifyMFAEnroll()} />
                            <button onClick={handleVerifyMFAEnroll} disabled={enrollCode.length !== 6} className="px-5 py-3 bg-sky-600 text-white rounded-lg hover:bg-sky-700 font-semibold disabled:opacity-50 transition-colors">{language === 'si' ? 'Potrdi' : 'Verify'}</button>
                          </div>
                        </div>
                        <div className="text-right">
                          <button onClick={() => { setMfaEnrolling(false); setEnrollData(null); }} className="text-sm text-slate-500 hover:text-slate-700 underline">{language === 'si' ? 'Prekliči' : 'Cancel'}</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ═══ INSTRUCTIONS TAB (v3.2 – FULL EDITOR) ═══ */}
              {activeTab === 'instructions' && instructions && (
                <div className="space-y-4">
                  {/* Info banner */}
                  <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg text-sm text-sky-800 flex items-start gap-2">
                    <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <div>
                      <strong>Instructions Editor</strong> – All rules are in English. The AI uses these rules to generate content in both English and Slovenian.
                      {instructionsChanged && <span className="ml-2 text-amber-600 font-semibold">(unsaved changes)</span>}
                    </div>
                  </div>

                  {/* Sub-tabs */}
                  <div className="flex gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto">
                    {instructionsSubTabs.map(st => (
                      <button key={st.id}
                        onClick={() => setInstructionsSubTab(st.id)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-colors ${instructionsSubTab === st.id ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>
                        {st.label}
                      </button>
                    ))}
                  </div>

                  {/* ── Global Rules ── */}
                  {instructionsSubTab === 'global' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-slate-700 text-sm">Global Rules</label>
                        <button onClick={() => handleResetSection('GLOBAL_RULES')} className="text-xs text-red-500 hover:underline">Reset to default</button>
                      </div>
                      <p className="text-xs text-slate-500">Core rules that apply to ALL generated content: language, infinitive-verb rule, data preservation, evidence, logical coherence, cross-cutting priorities, formatting, etc.</p>
                      <textarea
                        className="w-full p-3 border border-slate-300 rounded-lg text-sm font-mono leading-relaxed resize-y min-h-[300px]"
                        value={instructions.GLOBAL_RULES || ''}
                        onChange={(e) => handleGlobalRulesChange(e.target.value)}
                        spellCheck={false}
                      />
                    </div>
                  )}

                  {/* ── Chapter Rules ── */}
                  {instructionsSubTab === 'chapters' && (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-500">Rules specific to each chapter of the intervention logic. Click a chapter to expand and edit.</p>
                      {Object.entries(CHAPTER_LABELS).map(([key, label]) => (
                        <CollapsibleSection key={key} title={label}>
                          <div className="flex justify-end mb-2">
                            <button onClick={() => handleResetSection(key)} className="text-xs text-red-500 hover:underline">Reset to default</button>
                          </div>
                          <textarea
                            className="w-full p-3 border border-slate-300 rounded-lg text-sm font-mono leading-relaxed resize-y min-h-[250px]"
                            value={instructions.CHAPTERS?.[key] || ''}
                            onChange={(e) => handleChapterChange(key, e.target.value)}
                            spellCheck={false}
                          />
                        </CollapsibleSection>
                      ))}
                    </div>
                  )}

                  {/* ── Field Rules ── */}
                  {instructionsSubTab === 'fields' && (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-500">Rules for individual form fields. Each rule tells the AI exactly how to generate content for that specific field.</p>
                      {Object.entries(FIELD_RULE_LABELS).map(([key, label]) => (
                        <CollapsibleSection key={key} title={label}>
                          <div className="flex justify-end mb-2">
                            <button onClick={() => handleResetSection(key)} className="text-xs text-red-500 hover:underline">Reset to default</button>
                          </div>
                          <textarea
                            className="w-full p-3 border border-slate-300 rounded-lg text-sm font-mono leading-relaxed resize-y min-h-[100px]"
                            value={instructions.FIELD_RULES?.[key] || ''}
                            onChange={(e) => handleFieldRuleChange(key, e.target.value)}
                            spellCheck={false}
                          />
                        </CollapsibleSection>
                      ))}
                    </div>
                  )}

                  {/* ── Translation Rules ── */}
                  {instructionsSubTab === 'translation' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-slate-700 text-sm">Translation Rules</label>
                        <button onClick={() => handleResetSection('TRANSLATION_RULES')} className="text-xs text-red-500 hover:underline">Reset to default</button>
                      </div>
                      <p className="text-xs text-slate-500">Rules governing how content is translated between English and Slovenian: structural integrity, terminology, infinitive-verb form, formatting.</p>
                      <textarea
                        className="w-full p-3 border border-slate-300 rounded-lg text-sm font-mono leading-relaxed resize-y min-h-[250px]"
                        value={instructions.TRANSLATION_RULES || ''}
                        onChange={(e) => handleTranslationRulesChange(e.target.value)}
                        spellCheck={false}
                      />
                    </div>
                  )}

                  {/* ── Summary Rules ── */}
                  {instructionsSubTab === 'summary' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-slate-700 text-sm">Summary Generation Rules</label>
                        <button onClick={() => handleResetSection('SUMMARY_RULES')} className="text-xs text-red-500 hover:underline">Reset to default</button>
                      </div>
                      <p className="text-xs text-slate-500">Rules for generating the one-page executive summary: format, mandatory sections, style, length.</p>
                      <textarea
                        className="w-full p-3 border border-slate-300 rounded-lg text-sm font-mono leading-relaxed resize-y min-h-[200px]"
                        value={instructions.SUMMARY_RULES || ''}
                        onChange={(e) => handleSummaryRulesChange(e.target.value)}
                        spellCheck={false}
                      />
                    </div>
                  )}

                  {/* Reset all button */}
                  <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                    <button onClick={handleResetInstructions} className="text-xs text-red-500 hover:underline flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      Revert ALL to defaults
                    </button>
                    <span className="text-xs text-slate-400">v{instructions.version || '3.2'}</span>
                  </div>
                </div>
              )}

              {/* Message */}
              {message && (
                <div className={`mt-4 text-sm font-semibold p-2 rounded text-center ${isError ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{message}</div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} disabled={isValidating} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-md disabled:opacity-50">{TEXT[language].modals.closeBtn}</button>
          <button onClick={handleSave} disabled={isValidating || isLoading} className="px-4 py-2 text-sm bg-sky-600 text-white hover:bg-sky-700 rounded-md disabled:opacity-50 flex items-center gap-2">
            {isValidating && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
            {activeTab === 'security' ? t.changePassword : (activeTab === 'instructions' ? (language === 'si' ? 'Shrani navodila' : 'Save Instructions') : t.save)}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
