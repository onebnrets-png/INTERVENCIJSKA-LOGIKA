// components/AuthScreen.tsx
// Supabase Auth — Email/Password login & registration + MFA verification

import React, { useState } from 'react';
import { storageService } from '../services/storageService.ts';
import { isValidEmail, checkPasswordStrength, isPasswordSecure, generateDisplayNameFromEmail } from '../utils.ts';
import { TEXT } from '../locales.ts';
import type { Language } from '../types.ts';

// ─── Prop Interfaces ────────────────────────────────────────────
interface MFAVerifyScreenProps {
  factorId: string;
  language: Language;
  onVerified: () => void;
  onCancel: () => void;
}

interface AuthScreenProps {
  onLoginSuccess: () => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  onOpenSettings: () => void;
  needsMFAVerify?: boolean;
  mfaFactorId?: string;
  onMFAVerified: () => void;
  onMFACancel: () => void;
}

// ─── MFA Verification Sub-Component ─────────────────────────────
const MFAVerifyScreen: React.FC<MFAVerifyScreenProps> = ({ factorId, language, onVerified, onCancel }) => {
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleVerify = async () => {
        setError('');
        if (code.length !== 6) {
            setError(language === 'si' ? 'Vnesi 6-mestno kodo.' : 'Enter a 6-digit code.');
            return;
        }
        setLoading(true);
        const result = await storageService.challengeAndVerifyMFA(factorId, code);
        setLoading(false);
        if (result.success) {
            onVerified();
        } else {
            setError(result.message || (language === 'si' ? 'Napačna koda.' : 'Invalid code.'));
            setCode('');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-200 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-8 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-sky-400 to-sky-600"></div>

                <div className="text-center mb-8">
                    <div className="mx-auto w-16 h-16 bg-sky-100 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-sky-800 mb-2">
                        {language === 'si' ? 'Dvostopenjsko preverjanje' : 'Two-Factor Authentication'}
                    </h1>
                    <p className="text-slate-500 text-sm">
                        {language === 'si'
                            ? 'Odpri authenticator aplikacijo in vnesi 6-mestno kodo.'
                            : 'Open your authenticator app and enter the 6-digit code.'}
                    </p>
                </div>

                {error && (
                    <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded border border-red-100 mb-4 animate-pulse">
                        {error}
                    </div>
                )}

                <div className="flex gap-3 mb-6">
                    <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        maxLength={6}
                        className="flex-1 p-4 border border-slate-300 rounded-lg text-center text-2xl tracking-[0.5em] font-mono focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && handleVerify()}
                    />
                </div>

                <button
                    onClick={handleVerify}
                    disabled={loading || code.length !== 6}
                    className="w-full py-3 bg-sky-600 text-white rounded-lg hover:bg-sky-700 font-semibold transition-colors disabled:opacity-50 shadow-sm text-lg"
                >
                    {loading ? '...' : (language === 'si' ? 'Potrdi' : 'Verify')}
                </button>

                <div className="mt-4 text-center">
                    <button onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-700 underline">
                        {language === 'si' ? 'Prekliči in odjava' : 'Cancel and sign out'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Main AuthScreen ─────────────────────────────────────────────

const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginSuccess, language, setLanguage, onOpenSettings, needsMFAVerify, mfaFactorId, onMFAVerified, onMFACancel }) => {
    const [isLogin, setIsLogin] = useState(true);

    const [email, setEmail] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [apiKey, setApiKey] = useState('');

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    const t = TEXT[language].auth;
    const pwStrength = checkPasswordStrength(password);

    // ─── If MFA verification is needed, show MFA screen ──────────
    if (needsMFAVerify && mfaFactorId) {
        return (
            <MFAVerifyScreen
                factorId={mfaFactorId}
                language={language}
                onVerified={onMFAVerified}
                onCancel={onMFACancel}
            />
        );
    }

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const result = await storageService.login(email, password);
        setLoading(false);

        if (result.success) {
            onLoginSuccess(result.displayName || email.split('@')[0]);
        } else {
            setError(result.message === 'Invalid login credentials'
                ? t.errorAuth
                : result.message || t.errorAuth);
        }
    };

    const handleRegisterSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');

        if (!isValidEmail(email)) {
            setError(t.errorEmailFormat || "Invalid email format");
            return;
        }

        if (!isPasswordSecure(password)) {
            setError(t.errorPasswordWeak || "Password is not secure enough");
            return;
        }

        if (password !== confirmPassword) {
            setError(t.errorMatch);
            return;
        }

        setLoading(true);

        const finalDisplayName = displayName.trim() || generateDisplayNameFromEmail(email);
        const result = await storageService.register(email, finalDisplayName, password, apiKey);

        setLoading(false);

        if (result.success) {
            onLoginSuccess(result.displayName || email.split('@')[0]);
        } else {
            setError(result.message || t.errorExists);
        }
    };

    const EyeIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-400 hover:text-slate-600">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
    );

    const EyeSlashIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-400 hover:text-slate-600">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
        </svg>
    );

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-200 p-4">
            <div className="absolute top-4 right-4 z-10 flex gap-2">
                <button
                    onClick={onOpenSettings}
                    className="p-2 bg-white rounded-md shadow-sm border border-slate-300 text-slate-600 hover:bg-slate-50"
                    title={t.settings}
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                </button>

                <div className="bg-white rounded-md shadow-sm border border-slate-300 flex overflow-hidden">
                    <button onClick={() => setLanguage('si')} className={`px-3 py-1 text-sm font-medium ${language === 'si' ? 'bg-sky-100 text-sky-700' : 'text-slate-600 hover:bg-slate-50'}`}>SI</button>
                    <div className="w-px bg-slate-300"></div>
                    <button onClick={() => setLanguage('en')} className={`px-3 py-1 text-sm font-medium ${language === 'en' ? 'bg-sky-100 text-sky-700' : 'text-slate-600 hover:bg-slate-50'}`}>EN</button>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-8 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-sky-400 to-sky-600"></div>

                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-sky-800 mb-2">
                        {isLogin ? t.loginTitle : t.registerTitle}
                    </h1>
                    <p className="text-slate-500">EU Intervention Logic AI Assistant</p>
                </div>

                <form onSubmit={isLogin ? handleLoginSubmit : handleRegisterSubmit} className="space-y-4">

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{t.emailLabel || "Email Address"}</label>
                        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 transition-all" placeholder="user@example.com" />
                    </div>

                    {!isLogin && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">{t.displayNameLabel || "Username / Display Name"}</label>
                            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 transition-all" placeholder={email.split('@')[0] || "Optional"} />
                            <p className="text-xs text-slate-400 mt-1">{t.displayNameDesc || "If empty, we'll use your email prefix."}</p>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{t.password}</label>
                        <div className="relative">
                            <input type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 transition-all pr-10" />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-2.5 focus:outline-none">
                                {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
                            </button>
                        </div>
                        {!isLogin && (
                            <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                                <span className={pwStrength.length ? "text-green-600 font-bold" : "text-slate-400"}>{pwStrength.length ? "✓" : "○"} {t.pwRuleChars || "8+ Characters"}</span>
                                <span className={pwStrength.hasNumber ? "text-green-600 font-bold" : "text-slate-400"}>{pwStrength.hasNumber ? "✓" : "○"} {t.pwRuleNumber || "Number (0-9)"}</span>
                                <span className={pwStrength.hasSpecial ? "text-green-600 font-bold" : "text-slate-400"}>{pwStrength.hasSpecial ? "✓" : "○"} {t.pwRuleSign || "Symbol (!@#)"}</span>
                                <span className={(pwStrength.hasUpper || pwStrength.hasLower) ? "text-green-600 font-bold" : "text-slate-400"}>{(pwStrength.hasUpper || pwStrength.hasLower) ? "✓" : "○"} {t.pwRuleLetters || "Letters"}</span>
                            </div>
                        )}
                    </div>

                    {!isLogin && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">{t.confirmPassword}</label>
                            <div className="relative">
                                <input type={showConfirmPassword ? "text" : "password"} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 transition-all pr-10" />
                                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-2 top-2.5 focus:outline-none">
                                    {showConfirmPassword ? <EyeSlashIcon /> : <EyeIcon />}
                                </button>
                            </div>
                        </div>
                    )}

                    {!isLogin && (
                        <div className="bg-slate-50 p-3 rounded-md border border-slate-200 mt-2">
                            <label className="block text-sm font-bold text-sky-700 mb-1">{t.apiKeyLabel}</label>
                            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 font-mono text-xs" placeholder={t.apiKeyPlaceholder} />
                            <p className="text-xs text-slate-500 mt-1">{t.apiKeyDesc}</p>
                        </div>
                    )}

                    {error && (<div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded border border-red-100 animate-pulse">{error}</div>)}
                    {successMessage && (<div className="text-green-600 text-sm text-center bg-green-50 p-2 rounded border border-green-100">{successMessage}</div>)}

                    <button type="submit" disabled={loading} className="w-full py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 font-semibold transition-colors disabled:opacity-50 shadow-sm">
                        {loading ? '...' : (isLogin ? t.loginBtn : t.registerBtn)}
                    </button>
                </form>

                <div className="mt-6 text-center text-sm border-t border-slate-100 pt-4">
                    <p className="text-slate-600">
                        {isLogin ? t.switchMsg : t.switchMsgLogin}
                        <button onClick={() => { setIsLogin(!isLogin); setError(''); setEmail(''); setDisplayName(''); setPassword(''); setApiKey(''); setSuccessMessage(''); }} className="ml-2 text-sky-600 hover:underline font-semibold">
                            {isLogin ? t.switchAction : t.switchActionLogin}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AuthScreen;
