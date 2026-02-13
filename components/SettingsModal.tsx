import React, { useState, useEffect, useRef } from 'react';
import { storageService } from '../services/storageService.ts';
import { validateApiKey } from '../services/geminiService.ts';
import { getAppInstructions, saveAppInstructions, resetAppInstructions } from '../services/Instructions.ts';
import { TEXT } from '../locales.ts';

// ─── Lightweight TOTP helpers (no external dependency) ───
// Base32 decode
const base32Decode = (encoded: string): Uint8Array => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const char of encoded.toUpperCase()) {
        const val = alphabet.indexOf(char);
        if (val === -1) continue;
        bits += val.toString(2).padStart(5, '0');
    }
    const bytes = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
    }
    return bytes;
};

// HMAC-SHA1 via SubtleCrypto
const hmacSha1 = async (keyBytes: Uint8Array, message: Uint8Array): Promise<Uint8Array> => {
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, message);
    return new Uint8Array(sig);
};

// Generate current TOTP code from a base32 secret
const generateTOTP = async (secret: string, period = 30, digits = 6): Promise<string> => {
    const keyBytes = base32Decode(secret);
    const time = Math.floor(Date.now() / 1000 / period);
    const timeBytes = new Uint8Array(8);
    let t = time;
    for (let i = 7; i >= 0; i--) {
        timeBytes[i] = t & 0xff;
        t >>= 8;
    }
    const hmac = await hmacSha1(keyBytes, timeBytes);
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % (10 ** digits);
    return code.toString().padStart(digits, '0');
};

// Verify a user-entered code against a secret (checks current ± 1 window)
const verifyTOTP = async (secret: string, userCode: string): Promise<boolean> => {
    const period = 30;
    const keyBytes = base32Decode(secret);
    const now = Math.floor(Date.now() / 1000 / period);

    for (let window = -1; window <= 1; window++) {
        const time = now + window;
        const timeBytes = new Uint8Array(8);
        let t = time;
        for (let i = 7; i >= 0; i--) {
            timeBytes[i] = t & 0xff;
            t >>= 8;
        }
        const hmac = await hmacSha1(keyBytes, timeBytes);
        const offset = hmac[hmac.length - 1] & 0x0f;
        const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % 1000000;
        if (code.toString().padStart(6, '0') === userCode) return true;
    }
    return false;
};

// Build otpauth URI for QR code generation
const buildOtpAuthUri = (secret: string, email: string, issuer = 'INTERVENCIJSKA-LOGIKA'): string => {
    return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
};

// ─── QR Code generation (pure JS, no dependency) ───
// Minimal QR code as SVG using the Google Charts API fallback as <img>
const QRCodeImage = ({ value, size = 200 }: { value: string; size?: number }) => {
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&margin=8`;
    return <img src={url} alt="QR Code" width={size} height={size} className="rounded-lg border border-slate-200" />;
};


const SettingsModal = ({ isOpen, onClose, language }) => {
    const [activeTab, setActiveTab] = useState('general');
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

    // 2FA State
    const [twoFASecret, setTwoFASecret] = useState('');
    const [twoFAEnabled, setTwoFAEnabled] = useState(false);
    const [showEnroll2FA, setShowEnroll2FA] = useState(false);
    const [enrollVerifyCode, setEnrollVerifyCode] = useState('');
    const [enrollError, setEnrollError] = useState('');

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

            // Load 2FA status
            const email = storageService.getCurrentUser();
            if (email) {
                storageService.get2FASecret(email).then(result => {
                    if (result.success && result.secret) {
                        setTwoFASecret(result.secret);
                        // Check if user has already verified 2FA
                        const users = JSON.parse(localStorage.getItem('eu_app_users') || '[]');
                        const user = users.find(u => u.email === email);
                        setTwoFAEnabled(user?.isVerified === true);
                    }
                });
            }
            
            // Load Instructions
            setInstructions(getAppInstructions());

            // Reset
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setShowEnroll2FA(false);
            setEnrollVerifyCode('');
            setEnrollError('');
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

    // ─── 2FA Enrollment ───
    const handleStart2FAEnroll = () => {
        setShowEnroll2FA(true);
        setEnrollVerifyCode('');
        setEnrollError('');
    };

    const handleVerify2FAEnroll = async () => {
        setEnrollError('');
        if (enrollVerifyCode.length !== 6) {
            setEnrollError(language === 'si' ? 'Vnesi 6-mestno kodo.' : 'Enter a 6-digit code.');
            return;
        }
        
        const isValid = await verifyTOTP(twoFASecret, enrollVerifyCode);
        
        if (isValid) {
            // Mark user as 2FA verified in localStorage
            const email = storageService.getCurrentUser();
            const users = JSON.parse(localStorage.getItem('eu_app_users') || '[]');
            const userIndex = users.findIndex(u => u.email === email);
            if (userIndex !== -1) {
                users[userIndex].isVerified = true;
                localStorage.setItem('eu_app_users', JSON.stringify(users));
            }
            setTwoFAEnabled(true);
            setShowEnroll2FA(false);
            setMessage(language === 'si' ? '2FA uspešno aktiviran!' : '2FA enabled successfully!');
            setIsError(false);
        } else {
            setEnrollError(language === 'si' ? 'Napačna koda. Poskusi znova.' : 'Invalid code. Try again.');
        }
    };

    const handleDisable2FA = () => {
        const confirmMsg = language === 'si' 
            ? 'Ali res želiš deaktivirati dvostopenjsko preverjanje?' 
            : 'Are you sure you want to disable two-factor authentication?';
        
        if (confirm(confirmMsg)) {
            const email = storageService.getCurrentUser();
            const users = JSON.parse(localStorage.getItem('eu_app_users') || '[]');
            const userIndex = users.findIndex(u => u.email === email);
            if (userIndex !== -1) {
                users[userIndex].isVerified = false;
                // Generate a new secret for next time
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
                let newSecret = '';
                for (let i = 0; i < 16; i++) newSecret += chars.charAt(Math.floor(Math.random() * chars.length));
                users[userIndex].twoFactorSecret = newSecret;
                localStorage.setItem('eu_app_users', JSON.stringify(users));
                setTwoFASecret(newSecret);
            }
            setTwoFAEnabled(false);
            setShowEnroll2FA(false);
            setMessage(language === 'si' ? '2FA deaktiviran.' : '2FA disabled.');
            setIsError(false);
        }
    };

    // Instructions Handlers
    const handleInstructionsChange = (chapterKey, value) => {
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

    const email = storageService.getCurrentUser() || '';
    const otpAuthUri = buildOtpAuthUri(twoFASecret, email);

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
                    {/* ═══ GENERAL TAB ═══ */}
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
                            {/* Password Change Section */}
                            <div>
                                <h4 className="font-bold text-slate-700 mb-3">{t.changePassword}</h4>
                                <div className="space-y-3">
                                    <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder={t.currentPassword} className="w-full p-2 border border-slate-300 rounded-md text-sm" />
                                    <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t.newPassword} className="w-full p-2 border border-slate-300 rounded-md text-sm" />
                                    <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t.confirmNewPassword} className="w-full p-2 border border-slate-300 rounded-md text-sm" />
                                </div>
                            </div>

                            {/* ─── 2FA Section ─── */}
                            <div className="border-t border-slate-200 pt-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h4 className="font-bold text-slate-700">
                                            {language === 'si' ? 'Dvostopenjsko preverjanje (2FA)' : 'Two-Factor Authentication (2FA)'}
                                        </h4>
                                        <p className="text-sm text-slate-500 mt-1">
                                            {language === 'si' 
                                                ? 'Uporabi authenticator aplikacijo za dodatno zaščito računa.' 
                                                : 'Use an authenticator app for extra account security.'}
                                        </p>
                                    </div>
                                    <div className={`px-3 py-1 rounded-full text-xs font-bold ${twoFAEnabled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                        {twoFAEnabled 
                                            ? (language === 'si' ? 'AKTIVNO' : 'ACTIVE') 
                                            : (language === 'si' ? 'NEAKTIVNO' : 'INACTIVE')}
                                    </div>
                                </div>

                                {/* 2FA is ENABLED — show disable option */}
                                {twoFAEnabled && !showEnroll2FA && (
                                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                                        <div className="flex items-center gap-3 mb-3">
                                            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                            </svg>
                                            <p className="text-sm text-green-800 font-medium">
                                                {language === 'si' 
                                                    ? 'Tvoj račun je zaščiten z dvostopenjskim preverjanjem.' 
                                                    : 'Your account is protected with two-factor authentication.'}
                                            </p>
                                        </div>
                                        <button 
                                            onClick={handleDisable2FA}
                                            className="px-4 py-2 text-sm bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium transition-colors"
                                        >
                                            {language === 'si' ? 'Deaktiviraj 2FA' : 'Disable 2FA'}
                                        </button>
                                    </div>
                                )}

                                {/* 2FA is NOT ENABLED — show setup button or enrollment */}
                                {!twoFAEnabled && !showEnroll2FA && (
                                    <button 
                                        onClick={handleStart2FAEnroll}
                                        className="px-5 py-2.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 font-semibold transition-colors flex items-center gap-2 shadow-sm"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                        </svg>
                                        {language === 'si' ? 'Nastavi 2FA' : 'Set up 2FA'}
                                    </button>
                                )}

                                {/* 2FA ENROLLMENT FLOW */}
                                {showEnroll2FA && (
                                    <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-5">
                                        <div>
                                            <h5 className="font-bold text-slate-700 mb-2">
                                                {language === 'si' ? '1. Skeniraj QR kodo' : '1. Scan QR Code'}
                                            </h5>
                                            <p className="text-sm text-slate-500 mb-4">
                                                {language === 'si' 
                                                    ? 'Odpri svojo authenticator aplikacijo (Google Authenticator, Microsoft Authenticator, Authy ...) in skeniraj spodnjo QR kodo.'
                                                    : 'Open your authenticator app (Google Authenticator, Microsoft Authenticator, Authy ...) and scan the QR code below.'}
                                            </p>
                                            <div className="flex justify-center p-4 bg-white rounded-lg border border-slate-200">
                                                <QRCodeImage value={otpAuthUri} size={200} />
                                            </div>
                                            <div className="mt-3 text-center">
                                                <p className="text-xs text-slate-400 mb-1">
                                                    {language === 'si' ? 'Ali ročno vnesi ta ključ:' : 'Or manually enter this key:'}
                                                </p>
                                                <code className="text-sm font-mono bg-white px-3 py-1.5 rounded border border-slate-200 text-slate-700 select-all tracking-widest">
                                                    {twoFASecret}
                                                </code>
                                            </div>
                                        </div>

                                        <div className="border-t border-slate-200 pt-4">
                                            <h5 className="font-bold text-slate-700 mb-2">
                                                {language === 'si' ? '2. Vnesi verifikacijsko kodo' : '2. Enter Verification Code'}
                                            </h5>
                                            <p className="text-sm text-slate-500 mb-3">
                                                {language === 'si' 
                                                    ? 'Vnesi 6-mestno kodo iz authenticator aplikacije za potrditev.'
                                                    : 'Enter the 6-digit code from your authenticator app to confirm.'}
                                            </p>
                                            
                                            {enrollError && (
                                                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">
                                                    {enrollError}
                                                </div>
                                            )}
                                            
                                            <div className="flex gap-3">
                                                <input
                                                    type="text"
                                                    value={enrollVerifyCode}
                                                    onChange={(e) => setEnrollVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                    placeholder="000000"
                                                    maxLength={6}
                                                    className="flex-1 p-3 border border-slate-300 rounded-lg text-center text-xl tracking-widest font-mono focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                                                    autoFocus
                                                    onKeyDown={(e) => e.key === 'Enter' && enrollVerifyCode.length === 6 && handleVerify2FAEnroll()}
                                                />
                                                <button
                                                    onClick={handleVerify2FAEnroll}
                                                    disabled={enrollVerifyCode.length !== 6}
                                                    className="px-5 py-3 bg-sky-600 text-white rounded-lg hover:bg-sky-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                >
                                                    {language === 'si' ? 'Potrdi' : 'Verify'}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="text-right">
                                            <button 
                                                onClick={() => setShowEnroll2FA(false)}
                                                className="text-sm text-slate-500 hover:text-slate-700 underline"
                                            >
                                                {language === 'si' ? 'Prekliči' : 'Cancel'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ═══ INSTRUCTIONS TAB (ADMIN) ═══ */}
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
