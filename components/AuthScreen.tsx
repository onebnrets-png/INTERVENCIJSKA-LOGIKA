
import React, { useState, useEffect } from 'react';
import { storageService } from '../services/storageService.ts';
import { validateApiKey } from '../services/geminiService.ts';
import { isValidEmail, checkPasswordStrength, isPasswordSecure, generateDisplayNameFromEmail } from '../utils.ts';
import { TEXT } from '../locales.ts';

const AuthScreen = ({ onLoginSuccess, language, setLanguage, onOpenSettings }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [step, setStep] = useState(1); // 1: Creds, 2: 2FA Setup/Verify
    
    const [email, setEmail] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [apiKey, setApiKey] = useState('');
    
    const [twoFactorCode, setTwoFactorCode] = useState('');
    const [twoFactorSecret, setTwoFactorSecret] = useState(''); // For display during setup
    const [simulatedAppCode, setSimulatedAppCode] = useState(''); // To help user in "Mock" mode

    // UI States
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [isValidatingKey, setIsValidatingKey] = useState(false);

    const t = TEXT[language].auth;

    // Password Analysis
    const pwStrength = checkPasswordStrength(password);

    // Auto-generate display name if empty when typing email
    const handleEmailChange = (e) => {
        const val = e.target.value;
        setEmail(val);
        // Only auto-fill if user hasn't typed a custom name yet
        if (!isLogin && displayName === '') {
            // No action needed, placeholder handles it visually, submission handles logic
        }
    };

    // Effect to generate a "Simulated" code for the 2FA screen
    // FIX: Fetches code from storageService so verification will pass
    useEffect(() => {
        if (step === 2 && email) {
            const initSimulation = async () => {
                const code = await storageService.generateSimulatedTotp(email);
                if (code) setSimulatedAppCode(code);
            };
            initSimulation();
        }
    }, [step, email]);

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const result = await storageService.login(email, password);
        setLoading(false);

        if (result.success) {
            onLoginSuccess(result.displayName || email.split('@')[0]);
        } else {
            if (result.message === '2FA_REQUIRED' || result.message === 'SETUP_2FA_REQUIRED') {
                // Move to 2FA Step
                if (result.message === 'SETUP_2FA_REQUIRED') {
                    // Fetch secret for setup
                    const secretRes = await storageService.get2FASecret(email);
                    if (secretRes.success) setTwoFactorSecret(secretRes.secret);
                }
                setStep(2);
            } else {
                setError(t.errorAuth);
            }
        }
    };

    const handleRegisterSubmit = async (e) => {
        e.preventDefault();
        setError('');

        // 1. Email Validation
        if (!isValidEmail(email)) {
            setError(t.errorEmailFormat || "Invalid email format");
            return;
        }

        // 2. Password Validation
        if (!isPasswordSecure(password)) {
            setError(t.errorPasswordWeak || "Password is not secure enough");
            return;
        }

        if (password !== confirmPassword) {
            setError(t.errorMatch);
            return;
        }

        setLoading(true);

        // 3. API Key Validation (Optional)
        if (apiKey.trim() !== '') {
            setIsValidatingKey(true);
            const isValid = await validateApiKey(apiKey);
            setIsValidatingKey(false);
            
            if (!isValid) {
                setError(t.invalidKey);
                setLoading(false);
                return;
            }
        }

        const finalDisplayName = displayName.trim() || generateDisplayNameFromEmail(email);

        const result = await storageService.register(email, finalDisplayName, password, apiKey);
        setLoading(false);

        if (result.success) {
            // Go to 2FA Setup
            setTwoFactorSecret(result.twoFactorSecret);
            setStep(2);
        } else {
            setError(result.message === 'Username is taken' ? t.errorUsernameTaken : t.errorExists);
        }
    };

    const handle2FASubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const result = await storageService.verify2FA(email, twoFactorCode);
        setLoading(false);

        if (result.success) {
            onLoginSuccess(result.displayName);
        } else {
            setError(t.errorVerification);
        }
    };

    const getTitle = () => {
        if (step === 2) return t.twoFactorTitle || "Authenticator 2FA";
        return isLogin ? t.loginTitle : t.registerTitle;
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
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
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
                     <h1 className="text-3xl font-bold text-sky-800 mb-2">{getTitle()}</h1>
                     <p className="text-slate-500">EU Intervention Logic AI Assistant</p>
                </div>

                {/* STEP 1: Login / Register Form */}
                {step === 1 && (
                <form onSubmit={isLogin ? handleLoginSubmit : handleRegisterSubmit} className="space-y-4">
                    
                    {/* EMAIL FIELD - Always Required */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{t.emailLabel || "Email Address"}</label>
                        <input 
                            type="email" 
                            required
                            value={email}
                            onChange={handleEmailChange}
                            className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 transition-all"
                            placeholder="user@example.com"
                        />
                    </div>

                    {/* REGISTRATION ONLY FIELDS */}
                    {!isLogin && (
                        <>
                            {/* DISPLAY NAME */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">{t.displayNameLabel || "Username / Display Name"}</label>
                                <input 
                                    type="text" 
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 transition-all"
                                    placeholder={email.split('@')[0] || "Optional"}
                                />
                                <p className="text-xs text-slate-400 mt-1">{t.displayNameDesc || "If empty, we'll use your email prefix."}</p>
                            </div>
                        </>
                    )}

                    {/* PASSWORD FIELD */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{t.password}</label>
                        <div className="relative">
                            <input 
                                type={showPassword ? "text" : "password"}
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 transition-all pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-2 top-2.5 focus:outline-none"
                            >
                                {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
                            </button>
                        </div>
                        {/* PASSWORD STRENGTH INDICATORS (Registration Only) */}
                        {!isLogin && (
                            <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                                <span className={pwStrength.length ? "text-green-600 font-bold" : "text-slate-400"}>
                                    {pwStrength.length ? "✓" : "○"} {t.pwRuleChars || "8+ Characters"}
                                </span>
                                <span className={pwStrength.hasNumber ? "text-green-600 font-bold" : "text-slate-400"}>
                                    {pwStrength.hasNumber ? "✓" : "○"} {t.pwRuleNumber || "Number (0-9)"}
                                </span>
                                <span className={pwStrength.hasSpecial ? "text-green-600 font-bold" : "text-slate-400"}>
                                    {pwStrength.hasSpecial ? "✓" : "○"} {t.pwRuleSign || "Symbol (!@#)"}
                                </span>
                                <span className={(pwStrength.hasUpper || pwStrength.hasLower) ? "text-green-600 font-bold" : "text-slate-400"}>
                                    {(pwStrength.hasUpper || pwStrength.hasLower) ? "✓" : "○"} {t.pwRuleLetters || "Letters"}
                                </span>
                            </div>
                        )}
                    </div>

                    {!isLogin && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">{t.confirmPassword}</label>
                            <div className="relative">
                                <input 
                                    type={showConfirmPassword ? "text" : "password"}
                                    required
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 transition-all pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute right-2 top-2.5 focus:outline-none"
                                >
                                    {showConfirmPassword ? <EyeSlashIcon /> : <EyeIcon />}
                                </button>
                            </div>
                        </div>
                    )}

                    {!isLogin && (
                        <div className="bg-slate-50 p-3 rounded-md border border-slate-200 mt-2">
                            <label className="block text-sm font-bold text-sky-700 mb-1">{t.apiKeyLabel}</label>
                            <input 
                                type="password" 
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 font-mono text-xs"
                                placeholder={t.apiKeyPlaceholder}
                            />
                            <p className="text-xs text-slate-500 mt-1">{t.apiKeyDesc}</p>
                        </div>
                    )}

                    {error && <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded border border-red-100 animate-pulse">{error}</div>}
                    {isValidatingKey && <div className="text-sky-600 text-sm text-center bg-sky-50 p-2 rounded border border-sky-100">{t.validating || "Validating Key..."}</div>}

                    <button 
                        type="submit" 
                        disabled={loading || isValidatingKey}
                        className="w-full py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 font-semibold transition-colors disabled:opacity-50 shadow-sm"
                    >
                        {loading || isValidatingKey ? '...' : (isLogin ? t.loginBtn : t.registerBtn)}
                    </button>
                </form>
                )}

                {/* STEP 2: 2FA Setup/Verification */}
                {step === 2 && (
                    <form onSubmit={handle2FASubmit} className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                        {twoFactorSecret && (
                            <div className="bg-sky-50 border border-sky-100 p-4 rounded-md text-center mb-4">
                                <p className="text-sm text-sky-800 font-semibold mb-2">{t.setup2FADesc || "Scan this QR or enter Secret in Google Authenticator:"}</p>
                                <div className="font-mono font-bold text-lg bg-white p-2 rounded border border-sky-200 select-all tracking-wider mb-2">
                                    {twoFactorSecret}
                                </div>
                                <div className="flex justify-center items-center gap-2">
                                    <svg className="w-12 h-12 text-slate-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path></svg>
                                    <span className="text-xs text-slate-400">(QR Placeholder)</span>
                                </div>
                            </div>
                        )}

                        <div className="bg-amber-50 border border-amber-100 p-3 rounded-md text-xs text-amber-800 mb-4">
                            <strong>Testing / Simulation Mode:</strong><br/>
                            Since this is a local demo, enter this code:<br/>
                            <span className="font-mono font-bold text-lg cursor-pointer" onClick={() => setTwoFactorCode(simulatedAppCode)} title="Click to fill">{simulatedAppCode}</span>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">{t.twoFactorLabel || "Enter 6-digit Authenticator Code"}</label>
                            <input 
                                type="text" 
                                required
                                value={twoFactorCode}
                                onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g,''))}
                                className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 text-center tracking-[0.5em] font-bold text-xl"
                                placeholder="000000"
                                maxLength={6}
                            />
                        </div>

                        {error && <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded border border-red-100 animate-pulse">{error}</div>}

                        <button 
                            type="submit" 
                            disabled={loading}
                            className="w-full py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 font-semibold transition-colors disabled:opacity-50 shadow-sm"
                        >
                            {loading ? '...' : t.verifyBtn}
                        </button>
                        
                        <div className="text-center mt-2">
                            <button type="button" onClick={() => { setStep(1); setIsLogin(true); setError(''); }} className="text-xs text-slate-400 hover:text-slate-600">
                                {t.cancel}
                            </button>
                        </div>
                    </form>
                )}

                {step === 1 && (
                <div className="mt-6 text-center text-sm border-t border-slate-100 pt-4">
                    <p className="text-slate-600">
                        {isLogin ? t.switchMsg : t.switchMsgLogin}
                        <button 
                            onClick={() => { setIsLogin(!isLogin); setError(''); setEmail(''); setDisplayName(''); setPassword(''); setApiKey(''); }}
                            className="ml-2 text-sky-600 hover:underline font-semibold"
                        >
                            {isLogin ? t.switchAction : t.switchActionLogin}
                        </button>
                    </p>
                </div>
                )}
            </div>
        </div>
    );
};

export default AuthScreen;
