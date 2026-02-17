// services/storageService.ts
// Supabase-backed storage service – replaces localStorage completely
// All data now lives in PostgreSQL via Supabase
//
// v2.0 — 2026-02-17
// FIXES:
//   - FIX DB-1: login() now sets cachedUser even when profiles query fails
//     (fallback to auth.user metadata). This prevents the silent-logout bug
//     where Supabase auth succeeds but the app thinks nobody is logged in.
//   - FIX DB-2: restoreSession() same fallback — never returns null when
//     there IS a valid auth session.
//   - FIX DB-3: login() / restoreSession() log profile-query errors clearly
//     so DB permission issues are visible in the console.

import { supabase } from './supabaseClient.ts';
import { createEmptyProjectData } from '../utils.ts';

// ─── ID GENERATOR ────────────────────────────────────────────────
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

// ─── LOCAL CACHE (in-memory, avoids excessive DB reads) ──────────
let cachedUser: { id: string; email: string; displayName: string; role: string } | null = null;
let cachedSettings: Record<string, any> | null = null;
let cachedProjectsMeta: any[] | null = null;

// ─── HELPER: Get current Supabase user ID ────────────────────────
async function getAuthUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
}

export const storageService = {

  // ═══════════════════════════════════════════════════════════════
  // AUTHENTICATION (Supabase Auth)
  // ═══════════════════════════════════════════════════════════════

  async login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return { success: false, message: error.message };
    }

    if (data.user) {
      // ★ FIX DB-1: Query profile, but ALWAYS set cachedUser (even if query fails)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profileError) {
        console.warn('login: profiles query failed:', profileError.message,
          '— falling back to auth.user metadata. Check RLS policies on profiles table.');
      }

      // Always set cachedUser: prefer profile data, fall back to auth.user metadata
      cachedUser = {
        id: data.user.id,
        email: profile?.email || data.user.email || email,
        displayName: profile?.display_name
          || data.user.user_metadata?.display_name
          || email.split('@')[0],
        role: profile?.role || 'user'
      };

      // Pre-load settings into cache on login
      await this.loadSettings();

      return {
        success: true,
        email: cachedUser.email,
        displayName: cachedUser.displayName,
        role: cachedUser.role
      };
    }

    return { success: false, message: 'Login failed' };
  },

  async register(email: string, displayName: string, password: string, apiKey: string = '') {
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
      // Wait for the DB trigger to create profile + user_settings row
      await new Promise(r => setTimeout(r, 1500));

      // ★ FIX: Use upsert instead of update, and also set ai_provider
      if (apiKey && apiKey.trim() !== '') {
        const { error: keyError } = await supabase
          .from('user_settings')
          .upsert(
            {
              user_id: data.user.id,
              gemini_key: apiKey.trim(),
              ai_provider: 'gemini'
            },
            { onConflict: 'user_id' }
          );

        if (keyError) {
          console.warn('register: Failed to save API key via upsert, trying update...', keyError.message);
          // Fallback: retry with update (in case upsert isn't allowed by RLS)
          await supabase
            .from('user_settings')
            .update({ gemini_key: apiKey.trim(), ai_provider: 'gemini' })
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

      // ★ FIX: Load settings AFTER the key has been written
      await this.loadSettings();

      // ★ FIX: If settings still don't have the key, force it into cache
      if (apiKey && apiKey.trim() !== '' && !cachedSettings?.gemini_key) {
        console.warn('register: API key not found in loaded settings, forcing into cache');
        if (cachedSettings === null) cachedSettings = {};
        cachedSettings.gemini_key = apiKey.trim();
        cachedSettings.ai_provider = 'gemini';
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

  async getCurrentUserId(): Promise<string | null> {
    if (cachedUser?.id) return cachedUser.id;
    return await getAuthUserId();
  },

  async restoreSession() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      const userId = data.session.user.id;
      const authUser = data.session.user;

      // ★ FIX DB-2: Query profile but NEVER fail silently
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.warn('restoreSession: profiles query failed:', profileError.message,
          '— falling back to auth.user metadata. Check RLS policies on profiles table.');
      }

      // Always build cachedUser: prefer profile, fall back to auth metadata
      cachedUser = {
        id: userId,
        email: profile?.email || authUser.email || '',
        displayName: profile?.display_name
          || authUser.user_metadata?.display_name
          || authUser.email?.split('@')[0]
          || 'User',
        role: profile?.role || 'user'
      };

      // Pre-load settings on session restore
      await this.loadSettings();

      return cachedUser.email;
    }
    return null;
  },

  // ═══════════════════════════════════════════════════════════════
  // USER SETTINGS (AI Provider, Keys, Model, Logo, Instructions)
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

  // FIX: Ensure cache is always initialized, even if loadSettings wasn't called yet
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

    // FIX: Always update cache, initialize if null
    if (cachedSettings === null) {
      cachedSettings = { ...updates };
    } else {
      cachedSettings = { ...cachedSettings, ...updates };
    }
  },

  // --- AI Provider ---
  getAIProvider(): 'gemini' | 'openrouter' {
    return (cachedSettings?.ai_provider as 'gemini' | 'openrouter') || 'gemini';
  },

  async setAIProvider(provider: 'gemini' | 'openrouter') {
    await this.updateSettings({ ai_provider: provider });
  },

  // --- API Keys ---
  getApiKey(): string | null {
    return cachedSettings?.gemini_key || null;
  },

  async setApiKey(key: string) {
    await this.updateSettings({ gemini_key: key.trim() || null });
  },

  async clearApiKey() {
    await this.updateSettings({ gemini_key: null });
  },

  getOpenRouterKey(): string | null {
    return cachedSettings?.openrouter_key || null;
  },

  async setOpenRouterKey(key: string) {
    await this.updateSettings({ openrouter_key: key.trim() || null });
  },

  // --- Custom Model ---
  getCustomModel(): string | null {
    return cachedSettings?.model || null;
  },

  async setCustomModel(model: string) {
    await this.updateSettings({ model: model.trim() || null });
  },

  // --- Custom Logo ---
  getCustomLogo(): string | null {
    return cachedSettings?.custom_logo || null;
  },

  async saveCustomLogo(base64Data: string | null) {
    await this.updateSettings({ custom_logo: base64Data });
  },

  // --- Custom Instructions (Admin) ---
  getCustomInstructions(): any {
    return cachedSettings?.custom_instructions || null;
  },

  async saveCustomInstructions(instructions: any) {
    await this.updateSettings({ custom_instructions: instructions });
  },

  // ═══════════════════════════════════════════════════════════════
  // PROJECT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  async getUserProjects(): Promise<any[]> {
    const userId = await this.getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from('projects')
      .select('id, title, created_at, updated_at')
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
      updatedAt: p.updated_at
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

    const { error: projError } = await supabase
      .from('projects')
      .insert({
        id: newId,
        owner_id: userId,
        title: 'New Project'
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
      updatedAt: new Date().toISOString()
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

  // --- Current Project ID (stored locally since it's session-specific) ---
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
  // MFA (Supabase Auth TOTP)
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
