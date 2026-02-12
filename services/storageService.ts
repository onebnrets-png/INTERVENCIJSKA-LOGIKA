// services/storageService.ts
// Supabase-backed storage service – replaces localStorage completely
// All data now lives in PostgreSQL via Supabase

import { supabase } from './supabaseClient.ts';
import { createEmptyProjectData } from '../utils.ts';

// ─── ID GENERATOR ────────────────────────────────────────────────
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

// ─── LOCAL CACHE (in-memory, avoids excessive DB reads) ──────────
let cachedUser: { id: string; email: string; displayName: string; role: string } | null = null;
let cachedSettings: any = null;
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
      // Load profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profile) {
        cachedUser = {
          id: data.user.id,
          email: profile.email,
          displayName: profile.display_name,
          role: profile.role
        };
      }

      return {
        success: true,
        email: data.user.email,
        displayName: profile?.display_name || email.split('@')[0],
        role: profile?.role || 'user'
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
      // Wait briefly for the trigger to create profile + settings
      await new Promise(r => setTimeout(r, 1000));

      // Save API key if provided
      if (apiKey && apiKey.trim() !== '') {
        await supabase
          .from('user_settings')
          .update({ gemini_key: apiKey.trim() })
          .eq('user_id', data.user.id);
      }

      // Load the created profile
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
    // Supabase handles password change directly
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

  // Restore session on page reload
  async restoreSession() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      const userId = data.session.user.id;
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profile) {
        cachedUser = {
          id: userId,
          email: profile.email,
          displayName: profile.display_name,
          role: profile.role
        };
        return profile.email;
      }
    }
    return null;
  },

  // ═══════════════════════════════════════════════════════════════
  // USER SETTINGS (AI Provider, Keys, Model, Logo, Instructions)
  // ═══════════════════════════════════════════════════════════════

  async loadSettings() {
    const userId = await this.getCurrentUserId();
    if (!userId) return null;

    const { data } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    cachedSettings = data;
    return data;
  },

  async updateSettings(updates: Record<string, any>) {
    const userId = await this.getCurrentUserId();
    if (!userId) return;

    await supabase
      .from('user_settings')
      .update(updates)
      .eq('user_id', userId);

    // Update cache
    if (cachedSettings) {
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

    // Map to existing format
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
    if (!userId) return null;

    const newId = generateId();
    const dataToSave = initialData || createEmptyProjectData();

    // Create project record
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

    // Create data rows for both languages
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

    // Invalidate cache
    cachedProjectsMeta = null;

    return meta;
  },

  async deleteProject(projectId: string) {
    // CASCADE will handle project_data deletion
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
      // Load most recent project
      const projects = await this.getUserProjects();
      if (projects.length > 0) {
        targetId = projects[0].id;
        this.setCurrentProjectId(targetId);
      } else {
        // Create a default project
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

    // Upsert project data
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

    // Update project title from data
    const newTitle = projectData.projectIdea?.projectTitle;
    if (newTitle && newTitle.trim() !== '') {
      await supabase
        .from('projects')
        .update({ title: newTitle.trim() })
        .eq('id', targetId);
    }

    cachedProjectsMeta = null;
  }
};
