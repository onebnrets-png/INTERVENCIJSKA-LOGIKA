// services/storageService.ts
// Supabase-backed storage service — replaces localStorage completely
//
// v3.0 — 2026-02-19
// CHANGES:
//   - ★ v3.0: Multi-Tenant Organization integration
//     - login() and restoreSession() call organizationService.loadActiveOrg()
//     - register() auto-loads active org after signup
//     - logout() calls organizationService.clearCache()
//     - createProject() sets organization_id from active org
//     - getUserProjects() filters by active organization
//     - NEW: getActiveOrgId(), getActiveOrgName()
//
// v2.2 — 2026-02-18
//   - isSuperAdmin(), isAdminOrSuperAdmin(), getSuperAdminEmail()
//   - getEffectiveLogo(), saveCustomLogo() guarded
//
// v2.1 — 2026-02-18
//   - OpenAI key support, register() accepts apiProvider
//
// v2.0 — 2026-02-17
//   - DB-1/DB-2/DB-3 fixes

import { supabase } from './supabaseClient.ts';
import { createEmptyProjectData } from '../utils.ts';
import type { AIProviderType } from './aiProvider.ts';
import { BRAND_ASSETS } from '../constants.tsx';
import { organizationService } from './organizationService.ts'; // ★ v3.0

// ─── ID GENERATOR ────────────────────────────────────────────────
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

// ─── SUPERADMIN EMAIL (genesis, hardcoded) ───────────────────────
const SUPERADMIN_EMAIL = 'beno.stern@infinita.si';

// ─── LOCAL CACHE ─────────────────────────────────────────────────
let cachedUser: { id: string; email: string; displayName: string; role: string } | null = null;
let cachedSettings: Record<string, any> | null = null;
let cachedProjectsMeta: any[] | null = null;

// ─── HELPER ──────────────────────────────────────────────────────
async function getAuthUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
}

export const storageService = {

  // ═══════════════════════════════════════════════════════════════
  // AUTHENTICATION
  // ═══════════════════════════════════════════════════════════════

  async login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return { success: false, message: error.message };
    }

    if (data.user) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profileError) {
        console.warn('login: profiles query failed:', profileError.message,
          '— falling back to auth.user metadata. Check RLS policies on profiles table.');
      }

      cachedUser = {
        id: data.user.id,
        email: profile?.email || data.user.email || email,
        displayName: profile?.display_name
          || data.user.user_metadata?.display_name
          || email.split('@')[0],
        role: profile?.role || 'user'
      };

      await this.loadSettings();

      // ★ v3.0: Load active organization
      await organizationService.loadActiveOrg();

      return {
        success: true,
        email: cachedUser.email,
        displayName: cachedUser.displayName,
        role: cachedUser.role
      };
    }

    return { success: false, message: 'Login failed' };
  },

  async register(email: string, displayName: string, password: string, apiKey: string = '', apiProvider: AIProviderType = 'gemini') {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName || email.split('@')[0]
        }
      }
    });

    if (error) {
      if (error.message.includes('already registered')) {
        return { success: false, message: 'Email already registered' };
      }
      return { success: false, message: error.message };
    }

    if (data.user) {
      // Wait for DB trigger to create profile + user_settings + org membership
      await new Promise(r => setTimeout(r, 1500));

      // Save key to correct column based on provider
      if (apiKey && apiKey.trim() !== '') {
        const keyColumn = apiProvider === 'openai' ? 'openai_key'
                        : apiProvider === 'openrouter' ? 'openrouter_key'
                        : 'gemini_key';

        const { error: keyError } = await supabase
          .from('user_settings')
          .upsert(
            {
              user_id: data.user.id,
              [keyColumn]: apiKey.trim(),
              ai_provider: apiProvider
            },
            { onConflict: 'user_id' }
          );

        if (keyError) {
          console.warn('register: Failed to save API key via upsert, trying update...', keyError.message);
          await supabase
            .from('user_settings')
            .update({ [keyColumn]: apiKey.trim(), ai_provider: apiProvider })
            .eq('user_id', data.user.id);
        }
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      cachedUser = {
        id: data.user.id,
        email: email,
        displayName: profile?.display_name || displayName || email.split('@')[0],
        role: profile?.role || 'user'
      };

      await this.loadSettings();

      // ★ v3.0: Load active organization (auto-assigned by trigger)
      await organizationService.loadActiveOrg();

      // Force key into cache if not loaded
      if (apiKey && apiKey.trim() !== '' && cachedSettings) {
        const keyColumn = apiProvider === 'openai' ? 'openai_key'
                        : apiProvider === 'openrouter' ? 'openrouter_key'
                        : 'gemini_key';
        if (!cachedSettings[keyColumn]) {
          console.warn('register: API key not found in loaded settings, forcing into cache');
          cachedSettings[keyColumn] = apiKey.trim();
          cachedSettings.ai_provider = apiProvider;
        }
      } else if (apiKey && apiKey.trim() !== '' && !cachedSettings) {
        const keyColumn = apiProvider === 'openai' ? 'openai_key'
                        : apiProvider === 'openrouter' ? 'openrouter_key'
                        : 'gemini_key';
        cachedSettings = { [keyColumn]: apiKey.trim(), ai_provider: apiProvider };
      }

      return {
        success: true,
        email,
        displayName: cachedUser.displayName,
        role: cachedUser.role
      };
    }

    return { success: false, message: 'Registration failed' };
  },

  async changePassword(currentPassword: string, newPassword: string) {
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) {
      return { success: false, message: error.message };
    }
    return { success: true };
  },

  // ═══════════════════════════════════════════════════════════════
  // SESSION
  // ═══════════════════════════════════════════════════════════════

  async logout() {
    await supabase.auth.signOut();
    cachedUser = null;
    cachedSettings = null;
    cachedProjectsMeta = null;
    // ★ v3.0: Clear org cache
    organizationService.clearCache();
  },

  getCurrentUser(): string | null {
    return cachedUser?.email || null;
  },

  getCurrentUserDisplayName(): string | null {
    return cachedUser?.displayName || null;
  },

  getUserRole(): string {
    return cachedUser?.role || 'user';
  },

  // ★ v2.2: Superadmin helpers
  isSuperAdmin(): boolean {
    return cachedUser?.role === 'superadmin';
  },

  isAdminOrSuperAdmin(): boolean {
    return cachedUser?.role === 'admin' || cachedUser?.role === 'superadmin';
  },

  getSuperAdminEmail(): string {
    return SUPERADMIN_EMAIL;
  },

  // ★ v3.0: Organization helpers
  getActiveOrgId(): string | null {
    return organizationService.getActiveOrgId();
  },

  getActiveOrgName(): string {
    return organizationService.getActiveOrgName();
  },

  async getCurrentUserId(): Promise<string | null> {
    if (cachedUser?.id) return cachedUser.id;
    return await getAuthUserId();
  },

  async restoreSession() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      const userId = data.session.user.id;
      const authUser = data.session.user;

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.warn('restoreSession: profiles query failed:', profileError.message,
          '— falling back to auth.user metadata. Check RLS policies on profiles table.');
      }

      cachedUser = {
        id: userId,
        email: profile?.email || authUser.email || '',
        displayName: profile?.display_name
          || authUser.user_metadata?.display_name
          || authUser.email?.split('@')[0]
          || 'User',
        role: profile?.role || 'user'
      };

      await this.loadSettings();

      // ★ v3.0: Load active organization
      await organizationService.loadActiveOrg();

      return cachedUser.email;
    }
    return null;
  },

  // ═══════════════════════════════════════════════════════════════
  // USER SETTINGS
  // ═══════════════════════════════════════════════════════════════

  async loadSettings() {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      cachedSettings = {};
      return null;
    }

    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.warn('loadSettings error:', error.message);
      cachedSettings = {};
      return null;
    }

    cachedSettings = data || {};
    return data;
  },

  async ensureSettingsLoaded() {
    if (cachedSettings === null) {
      await this.loadSettings();
    }
  },

  async updateSettings(updates: Record<string, any>) {
    const userId = await this.getCurrentUserId();
    if (!userId) return;

    const { error } = await supabase
      .from('user_settings')
      .update(updates)
      .eq('user_id', userId);

    if (error) {
      console.error('updateSettings error:', error.message);
      return;
    }

    if (cachedSettings === null) {
      cachedSettings = { ...updates };
    } else {
      cachedSettings = { ...cachedSettings, ...updates };
    }
  },

  // --- AI Provider ---
  getAIProvider(): AIProviderType {
    return (cachedSettings?.ai_provider as AIProviderType) || 'gemini';
  },

  async setAIProvider(provider: AIProviderType) {
    await this.updateSettings({ ai_provider: provider });
  },

  // --- Gemini Key ---
  getApiKey(): string | null {
    return cachedSettings?.gemini_key || null;
  },

  async setApiKey(key: string) {
    await this.updateSettings({ gemini_key: key.trim() || null });
  },

  async clearApiKey() {
    await this.updateSettings({ gemini_key: null });
  },

  // --- OpenRouter Key ---
  getOpenRouterKey(): string | null {
    return cachedSettings?.openrouter_key || null;
  },

  async setOpenRouterKey(key: string) {
    await this.updateSettings({ openrouter_key: key.trim() || null });
  },

  // --- OpenAI Key ---
  getOpenAIKey(): string | null {
    return cachedSettings?.openai_key || null;
  },

  async setOpenAIKey(key: string) {
    await this.updateSettings({ openai_key: key.trim() || null });
  },

  // --- Custom Model ---
  getCustomModel(): string | null {
    return cachedSettings?.model || null;
  },

  async setCustomModel(model: string) {
    await this.updateSettings({ model: model.trim() || null });
  },

  // --- Custom Logo --- ★ v2.2: Superadmin only
  getCustomLogo(): string | null {
    if (this.isSuperAdmin()) {
      return cachedSettings?.custom_logo || null;
    }
    return null;
  },

  // ★ v2.2: Effective logo — what should actually be displayed
  getEffectiveLogo(): string {
    if (this.isSuperAdmin()) {
      const customLogo = cachedSettings?.custom_logo;
      if (customLogo) return customLogo;
    }
    return BRAND_ASSETS.logoText;
  },

  async saveCustomLogo(base64Data: string | null) {
    // ★ v2.2: Only superadmin can change the logo
    if (!this.isSuperAdmin()) {
      console.warn('saveCustomLogo: Only superadmin can change the logo.');
      return;
    }
    await this.updateSettings({ custom_logo: base64Data });
  },

  // --- Custom Instructions ---
  getCustomInstructions(): any {
    return cachedSettings?.custom_instructions || null;
  },

  async saveCustomInstructions(instructions: any) {
    await this.updateSettings({ custom_instructions: instructions });
  },

  // ═══════════════════════════════════════════════════════════════
  // PROJECT MANAGEMENT — ★ v3.0: Organization-scoped
  // ═══════════════════════════════════════════════════════════════

  async getUserProjects(): Promise<any[]> {
    const userId = await this.getCurrentUserId();
    if (!userId) return [];

    // ★ v3.0: RLS handles org filtering via get_active_org_id()
    const { data, error } = await supabase
      .from('projects')
      .select('id, title, created_at, updated_at, organization_id')
      .eq('owner_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error loading projects:', error);
      return [];
    }

    const projects = (data || []).map(p => ({
      id: p.id,
      title: p.title,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      organizationId: p.organization_id,
    }));

    cachedProjectsMeta = projects;
    return projects;
  },

  async createProject(initialData: any = null): Promise<any> {
    const userId = await this.getCurrentUserId();
    if (!userId) {
      console.error('createProject: No user ID');
      return null;
    }

    const newId = generateId();
    const dataToSave = initialData || createEmptyProjectData();

    // ★ v3.0: Set organization_id from active org
    const activeOrgId = organizationService.getActiveOrgId();

    const { error: projError } = await supabase
      .from('projects')
      .insert({
        id: newId,
        owner_id: userId,
        title: 'New Project',
        organization_id: activeOrgId,
      });

    if (projError) {
      console.error('Error creating project:', projError);
      return null;
    }

    const { error: dataError } = await supabase
      .from('project_data')
      .insert([
        { project_id: newId, language: 'en', data: dataToSave },
        { project_id: newId, language: 'si', data: dataToSave }
      ]);

    if (dataError) {
      console.error('Error creating project data:', dataError);
    }

    const meta = {
      id: newId,
      title: 'New Project',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      organizationId: activeOrgId,
    };

    cachedProjectsMeta = null;
    return meta;
  },

  async deleteProject(projectId: string) {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      console.error('Error deleting project:', error);
    }

    cachedProjectsMeta = null;
  },

  setCurrentProjectId(projectId: string) {
    sessionStorage.setItem('current_project_id', projectId);
  },

  getCurrentProjectId(): string | null {
    return sessionStorage.getItem('current_project_id');
  },

  async loadProject(language: string = 'en', projectId: string | null = null): Promise<any> {
    const userId = await this.getCurrentUserId();
    if (!userId) return createEmptyProjectData();

    let targetId = projectId || this.getCurrentProjectId();

    if (!targetId) {
      const projects = await this.getUserProjects();
      if (projects.length > 0) {
        targetId = projects[0].id;
        this.setCurrentProjectId(targetId);
      } else {
        const newProj = await this.createProject();
        if (newProj) {
          targetId = newProj.id;
          this.setCurrentProjectId(targetId);
        } else {
          return createEmptyProjectData();
        }
      }
    }

    const { data, error } = await supabase
      .from('project_data')
      .select('data')
      .eq('project_id', targetId)
      .eq('language', language)
      .single();

    if (error || !data) {
      return createEmptyProjectData();
    }

    return data.data;
  },

  async saveProject(projectData: any, language: string = 'en', projectId: string | null = null) {
    const userId = await this.getCurrentUserId();
    if (!userId) return;

    let targetId = projectId || this.getCurrentProjectId();

    if (!targetId) {
      const newProj = await this.createProject(projectData);
      if (newProj) {
        targetId = newProj.id;
        this.setCurrentProjectId(targetId);
      } else {
        return;
      }
    }

    const { error: dataError } = await supabase
      .from('project_data')
      .upsert(
        {
          project_id: targetId,
          language: language,
          data: projectData
        },
        { onConflict: 'project_id,language' }
      );

    if (dataError) {
      console.error('Error saving project data:', dataError);
    }

    const newTitle = projectData.projectIdea?.projectTitle;
    if (newTitle && newTitle.trim() !== '') {
      await supabase
        .from('projects')
        .update({ title: newTitle.trim() })
        .eq('id', targetId);
    }

    cachedProjectsMeta = null;
  },

  // ═══════════════════════════════════════════════════════════════
  // MFA
  // ═══════════════════════════════════════════════════════════════

  async getMFAFactors(): Promise<{ totp: any[] }> {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      console.warn('getMFAFactors error:', error.message);
      return { totp: [] };
    }
    return { totp: data?.totp || [] };
  },

  async enrollMFA(): Promise<{ factorId: string; qrUri: string; secret: string } | null> {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'INTERVENCIJSKA-LOGIKA'
    });
    if (error) {
      console.error('enrollMFA error:', error.message);
      return null;
    }
    return {
      factorId: data.id,
      qrUri: data.totp.uri,
      secret: data.totp.secret
    };
  },

  async challengeAndVerifyMFA(factorId: string, code: string): Promise<{ success: boolean; message?: string }> {
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) {
      return { success: false, message: challengeError.message };
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code
    });

    if (verifyError) {
      return { success: false, message: verifyError.message };
    }

    return { success: true };
  },

  async unenrollMFA(factorId: string): Promise<{ success: boolean; message?: string }> {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      return { success: false, message: error.message };
    }
    return { success: true };
  },

  async getAAL(): Promise<{ currentLevel: string; nextLevel: string }> {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) {
      console.warn('getAAL error:', error.message);
      return { currentLevel: 'aal1', nextLevel: 'aal1' };
    }
    return {
      currentLevel: data.currentLevel || 'aal1',
      nextLevel: data.nextLevel || 'aal1'
    };
  }
};
