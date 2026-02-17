// components/AuthScreen.tsx
// Supabase Auth - Email/Password login & registration + MFA verification
// v2.0 - 2026-02-17  Dark-mode: isDark + colors pattern

import React, { useState, useEffect } from 'react';
import { storageService } from '../services/storageService.ts';
import { isValidEmail, checkPasswordStrength, isPasswordSecure, generateDisplayNameFromEmail } from '../utils.ts';
import { TEXT } from '../locales.ts';
import type { Language } from '../types.ts';
import { lightColors, darkColors, spacing, radii, shadows, typography } from '../design/theme.ts';
import { getThemeMode, onThemeChange } from '../services/themeService.ts';

// --- Prop Interfaces ---
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

// --- MFA Verification Sub-Component ---
const MFAVerifyScreen: React.FC<MFAVerifyScreenProps> = ({ factorId, language, onVerified, onCancel }) => {
    const [isDark, setIsDark] = useState(getThemeMode() === 'dark');
    useEffect(() => {
      const unsub = onThemeChange((m) => setIsDark(m === 'dark'));
      return unsub;
    }, []);
    const colors = isDark ? darkColors : lightColors;

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
        <div style={{ background: colors.surface.background, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
            <div style={{ background: colors.surface.card, borderRadius: radii.lg, boxShadow: shadows['2xl'], width: '100%', maxWidth: 448, padding: spacing['3xl'], position: 'relative', overflow: 'hidden', border: `1px solid ${colors.border.light}` }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 4, background: colors.primary.gradient }}></div>

                <div style={{ textAlign: 'center', marginBottom: spacing['3xl'] }}>
                    <div style={{ margin: '0 auto', width: 64, height: 64, background: isDark ? 'rgba(99,102,241,0.15)' : '#E0F2FE', borderRadius: radii.full, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg }}>
                        <svg style={{ width: 32, height: 32, color: colors.primary[500] }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h1 style={{ fontSize: typography.fontSize['2xl'], fontWeight: typography.fontWeight.bold, color: colors.text.heading, marginBottom: spacing.sm }}>
                        {language === 'si' ? 'Dvostopenjsko preverjanje' : 'Two-Factor Authentication'}
                    </h1>
                    <p style={{ color: colors.text.muted, fontSize: typography.fontSize.sm }}>
                        {language === 'si'
                            ? 'Odpri authenticator aplikacijo in vnesi 6-mestno kodo.'
                            : 'Open your authenticator app and enter the 6-digit code.'}
                    </p>
                </div>

                {error && (
                    <div style={{ color: colors.error[500], fontSize: typography.fontSize.sm, textAlign: 'center', background: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2', padding: spacing.sm, borderRadius: radii.md, border: `1px solid ${isDark ? 'rgba(239,68,68,0.2)' : '#FEE2E2'}`, marginBottom: spacing.lg }}>
                        {error}
                    </div>
                )}

                <div style={{ display: 'flex', gap: spacing.md, marginBottom: spacing.xl }}>
                    <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        maxLength={6}
                        style={{ flex: 1, padding: spacing.lg, border: `1px solid ${colors.border.medium}`, borderRadius: radii.lg, textAlign: 'center', fontSize: typography.fontSize['2xl'], letterSpacing: '0.5em', fontFamily: typography.fontFamily.mono, background: isDark ? colors.surface.background : '#FFFFFF', color: colors.text.heading }}
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && handleVerify()}
                    />
                </div>

                <button
                    onClick={handleVerify}
                    disabled={loading || code.length !== 6}
                    style={{ width: '100%', padding: `${spacing.md} 0`, background: colors.primary.gradient, color: '#FFFFFF', borderRadius: radii.lg, fontWeight: typography.fontWeight.semibold, fontSize: typography.fontSize.lg, border: 'none', cursor: loading || code.length !== 6 ? 'not-allowed' : 'pointer', opacity: loading || code.length !== 6 ? 0.5 : 1, boxShadow: shadows.sm }}
                >
                    {loading ? '...' : (language === 'si' ? 'Potrdi' : 'Verify')}
                </button>

                <div style={{ marginTop: spacing.lg, textAlign: 'center' }}>
                    <button onClick={onCancel} style={{ fontSize: typography.fontSize.sm, color: colors.text.muted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                        {language === 'si' ? 'Prekliči in odjava' : 'Cancel and sign out'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Main AuthScreen ---

const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginSuccess, language, setLanguage, onOpenSettings, needsMFAVerify, mfaFactorId, onMFAVerified, onMFACancel }) => {
    const [isDark, setIsDark] = useState(getThemeMode() === 'dark');
    useEffect(() => {
      const unsub = onThemeChange((m) => setIsDark(m === 'dark'));
      return unsub;
    }, []);
    const colors = isDark ? darkColors : lightColors;

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

    if (needsMFAVerify && mfaFactorId) {
        return (
            <MFAVerifyScreen factorId={mfaFactorId} language={language} onVerified={onMFAVerified} onCancel={onMFACancel} />
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
            setError(result.message === 'Invalid login credentials' ? t.errorAuth : result.message || t.errorAuth);
        }
    };

    const handleRegisterSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');
        if (!isValidEmail(email)) { setError(t.errorEmailFormat || "Invalid email format"); return; }
        if (!isPasswordSecure(password)) { setError(t.errorPasswordWeak || "Password is not secure enough"); return; }
        if (password !== confirmPassword) { setError(t.errorMatch); return; }
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
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 20, height: 20, color: colors.text.muted }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
    );

    const EyeSlashIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 20, height: 20, color: colors.text.muted }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
        </svg>
    );

    // Shared input style
    const inputStyle: React.CSSProperties = {
      width: '100%',
      padding: spacing.sm,
      border: `1px solid ${colors.border.medium}`,
      borderRadius: radii.md,
      background: isDark ? colors.surface.background : '#FFFFFF',
      color: colors.text.heading,
      fontSize: typography.fontSize.sm,
    };

    const labelStyle: React.CSSProperties = {
      display: 'block',
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium as any,
      color: colors.text.body,
      marginBottom: '4px',
    };

    return (
        <div style={{ background: colors.surface.background, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
            {/* Top right controls */}
            <div style={{ position: 'absolute', top: spacing.lg, right: spacing.lg, zIndex: 10, display: 'flex', gap: spacing.sm }}>
                <button
                    onClick={onOpenSettings}
                    style={{ padding: spacing.sm, background: colors.surface.card, borderRadius: radii.md, boxShadow: shadows.sm, border: `1px solid ${colors.border.light}`, color: colors.text.body, cursor: 'pointer', display: 'flex' }}
                    title={t.settings}
                >
                    <svg style={{ width: 20, height: 20 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                </button>

                <div style={{ background: colors.surface.card, borderRadius: radii.md, boxShadow: shadows.sm, border: `1px solid ${colors.border.light}`, display: 'flex', overflow: 'hidden' }}>
                    <button onClick={() => setLanguage('si')} style={{ padding: '4px 12px', fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium as any, ...(language === 'si' ? { background: isDark ? colors.primary[800] : '#E0F2FE', color: isDark ? colors.primary[200] : '#0369A1' } : { color: colors.text.body, background: 'transparent' }), border: 'none', cursor: 'pointer' }}>SI</button>
                    <div style={{ width: 1, background: colors.border.light }}></div>
                    <button onClick={() => setLanguage('en')} style={{ padding: '4px 12px', fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium as any, ...(language === 'en' ? { background: isDark ? colors.primary[800] : '#E0F2FE', color: isDark ? colors.primary[200] : '#0369A1' } : { color: colors.text.body, background: 'transparent' }), border: 'none', cursor: 'pointer' }}>EN</button>
                </div>
            </div>

            {/* Card */}
            <div style={{ background: colors.surface.card, borderRadius: radii.lg, boxShadow: shadows['2xl'], width: '100%', maxWidth: 448, padding: spacing['3xl'], position: 'relative', overflow: 'hidden', border: `1px solid ${colors.border.light}` }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 4, background: colors.primary.gradient }}></div>

                <div style={{ textAlign: 'center', marginBottom: spacing['3xl'] }}>
                    <h1 style={{ fontSize: typography.fontSize['3xl'], fontWeight: typography.fontWeight.bold, color: colors.text.heading, marginBottom: spacing.sm }}>
                        {isLogin ? t.loginTitle : t.registerTitle}
                    </h1>
                    <p style={{ color: colors.text.muted }}>EU Intervention Logic AI Assistant</p>
                </div>

                <form onSubmit={isLogin ? handleLoginSubmit : handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>

                    <div>
                        <label style={labelStyle}>{t.emailLabel || "Email Address"}</label>
                        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="user@example.com" />
                    </div>

                    {!isLogin && (
                        <div>
                            <label style={labelStyle}>{t.displayNameLabel || "Username / Display Name"}</label>
                            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} placeholder={email.split('@')[0] || "Optional"} />
                            <p style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, marginTop: '4px' }}>{t.displayNameDesc || "If empty, we'll use your email prefix."}</p>
                        </div>
                    )}

                    <div>
                        <label style={labelStyle}>{t.password}</label>
                        <div style={{ position: 'relative' }}>
                            <input type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...inputStyle, paddingRight: '40px' }} />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 8, top: 8, background: 'none', border: 'none', cursor: 'pointer' }}>
                                {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
                            </button>
                        </div>
                        {!isLogin && (
                            <div style={{ marginTop: spacing.sm, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: typography.fontSize.xs }}>
                                <span style={{ color: pwStrength.length ? colors.success[500] : colors.text.muted, fontWeight: pwStrength.length ? 700 : 400 }}>{pwStrength.length ? "\u2713" : "\u25CB"} {t.pwRuleChars || "8+ Characters"}</span>
                                <span style={{ color: pwStrength.hasNumber ? colors.success[500] : colors.text.muted, fontWeight: pwStrength.hasNumber ? 700 : 400 }}>{pwStrength.hasNumber ? "\u2713" : "\u25CB"} {t.pwRuleNumber || "Number (0-9)"}</span>
                                <span style={{ color: pwStrength.hasSpecial ? colors.success[500] : colors.text.muted, fontWeight: pwStrength.hasSpecial ? 700 : 400 }}>{pwStrength.hasSpecial ? "\u2713" : "\u25CB"} {t.pwRuleSign || "Symbol (!@#)"}</span>
                                <span style={{ color: (pwStrength.hasUpper || pwStrength.hasLower) ? colors.success[500] : colors.text.muted, fontWeight: (pwStrength.hasUpper || pwStrength.hasLower) ? 700 : 400 }}>{(pwStrength.hasUpper || pwStrength.hasLower) ? "\u2713" : "\u25CB"} {t.pwRuleLetters || "Letters"}</span>
                            </div>
                        )}
                    </div>

                    {!isLogin && (
                        <div>
                            <label style={labelStyle}>{t.confirmPassword}</label>
                            <div style={{ position: 'relative' }}>
                                <input type={showConfirmPassword ? "text" : "password"} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={{ ...inputStyle, paddingRight: '40px' }} />
                                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} style={{ position: 'absolute', right: 8, top: 8, background: 'none', border: 'none', cursor: 'pointer' }}>
                                    {showConfirmPassword ? <EyeSlashIcon /> : <EyeIcon />}
                                </button>
                            </div>
                        </div>
                    )}

                    {!isLogin && (
                        <div style={{ background: colors.surface.sidebar, padding: spacing.md, borderRadius: radii.md, border: `1px solid ${colors.border.light}`, marginTop: spacing.sm }}>
                            <label style={{ display: 'block', fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold as any, color: colors.primary[isDark ? 300 : 700], marginBottom: '4px' }}>{t.apiKeyLabel}</label>
                            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} style={{ ...inputStyle, fontFamily: typography.fontFamily.mono, fontSize: typography.fontSize.xs }} placeholder={t.apiKeyPlaceholder} />
                            <p style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, marginTop: '4px' }}>{t.apiKeyDesc}</p>
                        </div>
                    )}

                    {error && (<div style={{ color: colors.error[500], fontSize: typography.fontSize.sm, textAlign: 'center', background: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2', padding: spacing.sm, borderRadius: radii.md, border: `1px solid ${isDark ? 'rgba(239,68,68,0.2)' : '#FEE2E2'}` }}>{error}</div>)}
                    {successMessage && (<div style={{ color: colors.success[500], fontSize: typography.fontSize.sm, textAlign: 'center', background: isDark ? 'rgba(16,185,129,0.1)' : '#ECFDF5', padding: spacing.sm, borderRadius: radii.md, border: `1px solid ${isDark ? 'rgba(16,185,129,0.2)' : '#D1FAE5'}` }}>{successMessage}</div>)}

                    <button type="submit" disabled={loading} style={{ width: '100%', padding: `${spacing.sm} 0`, background: colors.primary.gradient, color: '#FFFFFF', borderRadius: radii.md, fontWeight: typography.fontWeight.semibold as any, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1, boxShadow: shadows.sm, fontSize: typography.fontSize.base }}>
                        {loading ? '...' : (isLogin ? t.loginBtn : t.registerBtn)}
                    </button>
                </form>

                <div style={{ marginTop: spacing.xl, textAlign: 'center', fontSize: typography.fontSize.sm, borderTop: `1px solid ${colors.border.light}`, paddingTop: spacing.lg }}>
                    <p style={{ color: colors.text.body }}>
                        {isLogin ? t.switchMsg : t.switchMsgLogin}
                        <button onClick={() => { setIsLogin(!isLogin); setError(''); setEmail(''); setDisplayName(''); setPassword(''); setApiKey(''); setSuccessMessage(''); }} style={{ marginLeft: spacing.sm, color: colors.primary[isDark ? 300 : 600], background: 'none', border: 'none', cursor: 'pointer', fontWeight: typography.fontWeight.semibold as any, textDecoration: 'underline' }}>
                            {isLogin ? t.switchAction : t.switchActionLogin}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AuthScreen;
