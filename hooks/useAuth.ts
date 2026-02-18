// hooks/useAuth.ts
// ═══════════════════════════════════════════════════════════════
// Authentication hook — login, logout, session restoration, MFA check.
// v1.1 — 2026-02-18
//   ★ v1.1: Use getEffectiveLogo() for hardcoded EURO-OFFICE logo
//     - Only superadmin sees custom logo if set
//     - All other users always see hardcoded logo
// v1.0 — 2026-02-17
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { storageService } from '../services/storageService.ts';
import { hasValidApiKey } from '../services/geminiService.ts';
import { BRAND_ASSETS } from '../constants.tsx';

export const useAuth = () => {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [showAiWarning, setShowAiWarning] = useState(false);
  const [isWarningDismissed, setIsWarningDismissed] = useState(false);
  const [appLogo, setAppLogo] = useState(BRAND_ASSETS.logoText);

  // ─── MFA State ─────────────────────────────────────────────────
  const [needsMFAVerify, setNeedsMFAVerify] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);

  // ─── Load logo — ★ v1.1: use getEffectiveLogo() ───────────────
  const loadCustomLogo = useCallback(() => {
    const effectiveLogo = storageService.getEffectiveLogo();
    setAppLogo(effectiveLogo);
  }, []);

  // ─── Check AAL level (MFA required?) ──────────────────────────
  const checkMFA = useCallback(async (): Promise<boolean> => {
    try {
      const { currentLevel, nextLevel } = await storageService.getAAL();
      if (nextLevel === 'aal2' && currentLevel !== 'aal2') {
        const { totp } = await storageService.getMFAFactors();
        const verifiedFactor = totp.find((f: any) => f.factor_type === 'totp' && f.status === 'verified');
        if (verifiedFactor) {
          setMfaFactorId(verifiedFactor.id);
          setNeedsMFAVerify(true);
          return true;
        }
      }
    } catch (err) {
      console.warn('checkMFA error:', err);
    }
    setNeedsMFAVerify(false);
    setMfaFactorId(null);
    return false;
  }, []);

  // ─── Restore session on mount ──────────────────────────────────
  useEffect(() => {
    const restoreSession = async () => {
      const email = await storageService.restoreSession();
      if (email) {
        const mfaNeeded = await checkMFA();
        if (!mfaNeeded) {
          setCurrentUser(email);
          loadCustomLogo();
        }
      }
    };
    restoreSession();
  }, [loadCustomLogo, checkMFA]);

  // ─── Check API key ────────────────────────────────────────────
  const checkApiKey = useCallback(async () => {
    await storageService.ensureSettingsLoaded();
    if (!hasValidApiKey()) {
      setShowAiWarning(true);
    } else {
      setShowAiWarning(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      checkApiKey();
    }
  }, [currentUser, checkApiKey]);

  // ─── Login ─────────────────────────────────────────────────────
  const handleLoginSuccess = useCallback(async (username: string) => {
    const mfaNeeded = await checkMFA();
    if (mfaNeeded) {
      return;
    }
    setCurrentUser(username);
    setTimeout(() => {
      loadCustomLogo();
    }, 100);
  }, [loadCustomLogo, checkMFA]);

  // ─── MFA Verified ──────────────────────────────────────────────
  const handleMFAVerified = useCallback(async () => {
    setNeedsMFAVerify(false);
    setMfaFactorId(null);
    const email = await storageService.restoreSession();
    if (email) {
      setCurrentUser(email);
      loadCustomLogo();
    }
  }, [loadCustomLogo]);

  // ─── Logout ────────────────────────────────────────────────────
  const handleLogout = useCallback(async () => {
    await storageService.logout();
    setCurrentUser(null);
    setIsWarningDismissed(false);
    setAppLogo(BRAND_ASSETS.logoText);
    setNeedsMFAVerify(false);
    setMfaFactorId(null);
  }, []);

  // ─── Dismiss warning ───────────────────────────────────────────
  const dismissWarning = useCallback(() => {
    setIsWarningDismissed(true);
  }, []);

  // ─── Computed ──────────────────────────────────────────────────
  const shouldShowBanner = showAiWarning && !isWarningDismissed;

  // ─── Ensure API key ────────────────────────────────────────────
  const ensureApiKey = useCallback((): boolean => {
    if (showAiWarning || !hasValidApiKey()) {
      return false;
    }
    return true;
  }, [showAiWarning]);

  return {
    currentUser,
    appLogo,
    showAiWarning,
    shouldShowBanner,
    handleLoginSuccess,
    handleLogout,
    checkApiKey,
    loadCustomLogo,
    dismissWarning,
    ensureApiKey,
    // MFA
    needsMFAVerify,
    mfaFactorId,
    handleMFAVerified,
  };
};
