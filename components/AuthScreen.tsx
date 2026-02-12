import React, { useState, useEffect, useRef } from 'react';
import { storageService } from '../services/storageService.ts';
import { validateApiKey } from '../services/geminiService.ts';
import { isValidEmail, checkPasswordStrength, isPasswordSecure, generateDisplayNameFromEmail } from '../utils.ts';
import { TEXT } from '../locales.ts';

// Lightweight QR Code generator (Canvas-based, no external dependency)
// Generates QR code as data URL from a string
async function generateQRCodeDataUrl(text: string, size: number = 256): Promise<string> {
    // We use a dynamic import of the 'qrcode' package
    const QRCode = await import('qrcode');
    return QRCode.toDataURL(text, { width: size, margin: 2, color: { dark: '#0c4a6e', light: '#ffffff' } });
}

const AuthScreen = ({ onLoginSuccess, language, setLanguage, onOpenSettings }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [step, setStep] = useState(1); // 1: Creds, 2: 2FA Setup/Verify

    const [email, setEmail] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [apiKey, setApiKey] = useState('');

    const [twoFactorCode, setTwoFactorCode] = useState('');
    const [twoFactorSecret, setTwoFactorSecret] = useState('');
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');

    // UI States
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [isValidatingKey, setIsValidatingKey] = useState(false);
    const [secretCopied, setSecretCopied] = useState(false);

    const t = TEXT[language].auth;

    // Password Analysis
    const pwStrength = checkPasswordStrength(password);

    const handleEmailChange = (e) => {
        const val = e.target.value;
        setEmail(val);
    };

    // Generate QR code when entering 2FA setup step
    useEffect(() => {
        if (step === 2 && email) {
            const generateQR = async () => {
                // Get the otpauth:// URI for the authenticator app
                const uri = storageService.get2FASetupUri(email);
                if (uri) {
                    try {
                        const dataUrl = await generateQRCodeDataUrl(uri);
                        setQrCodeDataUrl(dataUrl);
                    } catch (err) {
                        console.error('QR code generation failed:', err);
                        setQrCodeDataUrl('');
                    }
                }

                // Get the raw secret for manual entry
                const secretRes = await storageService.get2FASecret(email);
                if (secretRes.success && secretRes.secret) {
                    setTwoFactorSecret(secretRes.secret);
                }
            };
            generateQR();
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
                setStep(2);
            } else {
                setError(t.errorAuth);
            }
        }
    };

    const handleRegisterSubmit = async (e) => {
        e.preventDefault();
        setError('');

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

    const handleCopySecret = () => {
        navigator.clipboard.writeText(twoFactorSecret).then(() => {
            setSecretCopied(true);
            setTimeout(() => setSecretCopied(false), 2000);
        });
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

    const ShieldIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
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

                        {/* EMAIL FIELD */}
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
                            {!isLogin && (
                                <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                                    <span className={pwStrength.length ? "text-green-600 font-bold" : "text-slate-400"}>
                                        {pwStrength.length ? "" : ""} {t.pwRuleChars || "8+ Characters"}
                                    </span>
                                    <span className={pwStrength.hasNumber ? "text-green-600 font-bold" : "text-slate-400"}>
                                        {pwStrength.hasNumber ? "" : ""} {t.pwRuleNumber || "Number (0-9)"}
                                    </span>
                                    <span className={pwStrength.hasSpecial ? "text-green-600 font-bold" : "text-slate-400"}>
                                        {pwStrength.hasSpecial ? "" : ""} {t.pwRuleSign || "Symbol (!@#)"}
                                    </span>
                                    <span className={(pwStrength.hasUpper || pwStrength.hasLower) ? "text-green-600 font-bold" : "text-slate-400"}>
                                        {(pwStrength.hasUpper || pwStrength.hasLower) ? "" : ""} {t.pwRuleLetters || "Letters"}
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

                {/* STEP 2: 2FA Setup/Verification with REAL Authenticator */}
                {step === 2 && (
                    <form onSubmit={handle2FASubmit} className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">

                        {/* Authenticator Setup Instructions */}
                        <div className="bg-sky-50 border border-sky-100 p-4 rounded-md text-center mb-4">
                            <div className="flex justify-center mb-3 text-sky-700">
                                <ShieldIcon />
                            </div>
                            <p className="text-sm text-sky-800 font-semibold mb-3">
                                {language === 'si'
                                    ? 'Skenirajte QR kodo z aplikacijo za preverjanje pristnosti:'
                                    : 'Scan the QR code with your authenticator app:'}
                            </p>
                            <p className="text-xs text-sky-600 mb-3">
                                Google Authenticator, Microsoft Authenticator, Authy, 1Password...
                            </p>

                            {/* QR Code */}
                            {qrCodeDataUrl ? (
                                <div className="flex justify-center mb-3">
                                    <img
                                        src={qrCodeDataUrl}
                                        alt="2FA QR Code"
                                        className="rounded-lg shadow-sm border border-sky-200"
                                        style={{ width: 200, height: 200 }}
                                    />
                                </div>
                            ) : (
                                <div className="flex justify-center items-center mb-3">
                                    <div className="w-[200px] h-[200px] bg-white rounded-lg border border-sky-200 flex items-center justify-center">
                                        <span className="text-slate-400 text-sm">
                                            {language === 'si' ? 'Nalaganje QR kode...' : 'Loading QR code...'}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Manual Secret Entry */}
                            {twoFactorSecret && (
                                <div className="mt-2">
                                    <p className="text-xs text-sky-600 mb-1">
                                        {language === 'si'
                                            ? 'Ali ročno vnesite ključ v aplikacijo:'
                                            : 'Or enter the key manually in your app:'}
                                    </p>
                                    <div className="flex items-center justify-center gap-2">
                                        <code className="bg-white px-3 py-1.5 rounded border border-sky-200 text-sky-900 font-mono tracking-widest text-sm select-all">
                                            {twoFactorSecret}
                                        </code>
                                        <button
                                            type="button"
                                            onClick={handleCopySecret}
                                            className="p-1.5 bg-white rounded border border-sky-200 hover:bg-sky-50 transition-colors"
                                            title={language === 'si' ? 'Kopiraj' : 'Copy'}
                                        >
                                            {secretCopied ? (
                                                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                            ) : (
                                                <svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Code Entry */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                {t.twoFactorLabel || (language === 'si' ? 'Vnesite 6-mestno kodo iz aplikacije' : 'Enter 6-digit code from your app')}
                            </label>
                            <input
                                type="text"
                                required
                                value={twoFactorCode}
                                onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                                className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 text-center tracking-[0.5em] font-bold text-xl"
                                placeholder="000000"
                                maxLength={6}
                                autoFocus
                            />
                        </div>

                        {error && <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded border border-red-100 animate-pulse">{error}</div>}

                        <button
                            type="submit"
                            disabled={loading || twoFactorCode.length !== 6}
                            className="w-full py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 font-semibold transition-colors disabled:opacity-50 shadow-sm"
                        >
                            {loading ? '...' : t.verifyBtn}
                        </button>

                        <div className="text-center mt-2">
                            <button type="button" onClick={() => { setStep(1); setIsLogin(true); setError(''); setQrCodeDataUrl(''); setTwoFactorSecret(''); setTwoFactorCode(''); }} className="text-xs text-slate-400 hover:text-slate-600">
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
