import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { TEXT } from '../locales.ts';

export function EnrollMFA({ onEnrolled, onCancelled, language }) {
    const t = TEXT[language] || TEXT['en'];
    const [factorId, setFactorId] = useState('');
    const [qr, setQR] = useState('');
    const [verifyCode, setVerifyCode] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            const { data, error } = await supabase.auth.mfa.enroll({
                factorType: 'totp',
            });
            if (error) {
                setError(error.message);
                setLoading(false);
                return;
            }
            setFactorId(data.id);
            setQR(data.totp.qr_code);
            setLoading(false);
        })();
    }, []);

    const onEnableClicked = async () => {
        setError('');
        setLoading(true);
        try {
            const challenge = await supabase.auth.mfa.challenge({ factorId });
            if (challenge.error) {
                setError(challenge.error.message);
                return;
            }
            const verify = await supabase.auth.mfa.verify({
                factorId,
                challengeId: challenge.data.id,
                code: verifyCode,
            });
            if (verify.error) {
                setError(verify.error.message);
                return;
            }
            onEnrolled();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full mx-4">
                <h2 className="text-xl font-bold text-slate-800 mb-2">
                    {language === 'si' ? 'Nastavi dvostopenjsko preverjanje' : 'Set up Two-Factor Authentication'}
                </h2>
                <p className="text-sm text-slate-500 mb-6">
                    {language === 'si' 
                        ? 'Skeniraj QR kodo s svojo authenticator aplikacijo (Google Authenticator, Microsoft Authenticator, Authy ...) in vnesi 6-mestno kodo.'
                        : 'Scan the QR code with your authenticator app (Google Authenticator, Microsoft Authenticator, Authy ...) and enter the 6-digit code.'}
                </p>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="text-center py-8 text-slate-500 animate-pulse">Loading...</div>
                ) : (
                    <>
                        <div className="flex justify-center mb-6">
                            <img src={qr} alt="QR Code" className="w-48 h-48" />
                        </div>

                        <input
                            type="text"
                            value={verifyCode}
                            onChange={(e) => setVerifyCode(e.target.value.trim())}
                            placeholder={language === 'si' ? '6-mestna koda' : '6-digit code'}
                            maxLength={6}
                            className="w-full p-3 border border-slate-300 rounded-lg text-center text-2xl tracking-widest font-mono focus:ring-2 focus:ring-sky-500 focus:border-sky-500 mb-4"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && verifyCode.length === 6 && onEnableClicked()}
                        />

                        <div className="flex gap-3">
                            <button
                                onClick={onCancelled}
                                className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                            >
                                {language === 'si' ? 'Prekliči' : 'Cancel'}
                            </button>
                            <button
                                onClick={onEnableClicked}
                                disabled={verifyCode.length !== 6}
                                className="flex-1 px-4 py-2.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {language === 'si' ? 'Omogoči 2FA' : 'Enable 2FA'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
