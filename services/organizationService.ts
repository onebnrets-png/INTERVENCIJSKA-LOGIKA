// services/organizationService.ts
// ═══════════════════════════════════════════════════════════════
// Organization Service — Multi-Tenant organization management
// v1.2 — 2026-02-19
//
// CHANGES:
//   ★ v1.2: createOrg() — slug is now optional (auto-generated from name)
//           — return now includes orgId for convenience
//   v1.1: Complete implementation of all service methods
//
// ARCHITECTURE:
//   - Manages organizations, members, and org-level instructions
//   - Provides organization switching (active_organization_id)
//   - Caches active org data in memory
//   - Used by useOrganization hook and storageService
//
// TABLES:
//   - organizations
//   - organization_members
//   - organization_instructions
//   - profiles.active_organization_id
//   - projects.organization_id
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabaseClient.ts';

// ─── Types ───────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  orgRole: 'member' | 'admin' | 'owner';
  joinedAt: string;
  email?: string;
  displayName?: string;
}

export interface OrganizationInstructions {
  instructions: Record<string, string> | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export type OrgRole = 'member' | 'admin' | 'owner';

// ─── Cache ───────────────────────────────────────────────────

let cachedActiveOrg: Organization | null = null;
let cachedUserOrgs: Organization[] | null = null;
let cachedOrgInstructions: Record<string, string> | null = null;
let cachedOrgInstructionsOrgId: string | null = null;

// ─── Helpers ─────────────────────────────────────────────────

async function getAuthUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
}

function mapOrg(row: any): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logo_url || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * ★ v1.2: Generate a URL-safe slug from organization name.
 * "Moje Podjetje d.o.o." → "moje-podjetje-doo"
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[čćž]/g, (c) => ({ 'č': 'c', 'ć': 'c', 'ž': 'z' }[c] || c))
    .replace(/[šđ]/g, (c) => ({ 'š': 's', 'đ': 'd' }[c] || c))
    .replace(/[^a-z0-9]+/g, '-')   // non-alphanumeric → dash
    .replace(/^-+|-+$/g, '')        // trim leading/trailing dashes
    .slice(0, 60)                   // max 60 chars
    + '-' + Date.now().toString(36); // append unique suffix
}

// ─── Public API ──────────────────────────────────────────────

export const organizationService = {

  // ═══════════════════════════════════════════════════════════
  // ACTIVE ORGANIZATION
  // ═══════════════════════════════════════════════════════════

  getActiveOrg(): Organization | null {
    return cachedActiveOrg;
  },

  getActiveOrgId(): string | null {
    return cachedActiveOrg?.id || null;
  },

  getActiveOrgName(): string {
    return cachedActiveOrg?.name || 'No Organization';
  },

  async loadActiveOrg(): Promise<Organization | null> {
    const userId = await getAuthUserId();
    if (!userId) return null;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('active_organization_id')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.active_organization_id) {
      cachedActiveOrg = null;
      return null;
    }

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', profile.active_organization_id)
      .single();

    if (orgError || !org) {
      cachedActiveOrg = null;
      return null;
    }

    cachedActiveOrg = mapOrg(org);
    return cachedActiveOrg;
  },

  async switchOrg(orgId: string): Promise<{ success: boolean; message?: string }> {
    const userId = await getAuthUserId();
    if (!userId) return { success: false, message: 'Not authenticated' };

    // Verify user is member of this org
    const { data: membership, error: memError } = await supabase
      .from('organization_members')
      .select('id')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .single();

    if (memError || !membership) {
      return { success: false, message: 'You are not a member of this organization' };
    }

    // Update active_organization_id in profiles
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ active_organization_id: orgId })
      .eq('id', userId);

    if (updateError) {
      console.error('[OrgService] Failed to switch org:', updateError.message);
      return { success: false, message: updateError.message };
    }

    // Refresh cache
    await this.loadActiveOrg();

    // Invalidate org instructions cache (new org = new rules)
    cachedOrgInstructions = null;
    cachedOrgInstructionsOrgId = null;

    console.log(`[OrgService] Switched to org: ${cachedActiveOrg?.name || orgId}`);
    return { success: true };
  },

  // ═══════════════════════════════════════════════════════════
  // USER'S ORGANIZATIONS
  // ═══════════════════════════════════════════════════════════

  async getUserOrgs(): Promise<Organization[]> {
    const userId = await getAuthUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from('organization_members')
      .select('organization_id, organizations(*)')
      .eq('user_id', userId);

    if (error || !data) {
      console.warn('[OrgService] Failed to load user orgs:', error?.message);
      return [];
    }

    cachedUserOrgs = data
      .map((row: any) => row.organizations)
      .filter(Boolean)
      .map(mapOrg);

    return cachedUserOrgs;
  },

  async getUserOrgRole(orgId: string): Promise<OrgRole | null> {
    const userId = await getAuthUserId();
    if (!userId) return null;

    const { data, error } = await supabase
      .from('organization_members')
      .select('org_role')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .single();

    if (error || !data) return null;
    return data.org_role as OrgRole;
  },

  // ═══════════════════════════════════════════════════════════
  // ORGANIZATION CRUD
  // ═══════════════════════════════════════════════════════════

  /**
   * ★ v1.2: slug is now optional — auto-generated from name if not provided.
   * Returns orgId for direct use in storageService.register().
   */
  async createOrg(name: string, slug?: string): Promise<{ success: boolean; orgId?: string; org?: Organization; message?: string }> {
    const userId = await getAuthUserId();
    if (!userId) return { success: false, message: 'Not authenticated' };

    const finalSlug = slug?.trim() || generateSlug(name);

    const { data, error } = await supabase
      .from('organizations')
      .insert({ name, slug: finalSlug, created_by: userId })
      .select()
      .single();

    if (error) {
      return { success: false, message: error.message };
    }

    // Auto-add creator as owner
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert({ organization_id: data.id, user_id: userId, org_role: 'owner' });

    if (memberError) {
      console.warn('[OrgService] createOrg: Failed to add owner membership:', memberError.message);
      // Org was created — continue but warn
    }

    // Create empty instructions row
    await supabase
      .from('organization_instructions')
      .insert({ organization_id: data.id, instructions: null, updated_by: userId });

    const org = mapOrg(data);
    cachedUserOrgs = null; // invalidate
    return { success: true, orgId: data.id, org };
  },

  async updateOrg(orgId: string, updates: { name?: string; slug?: string; logo_url?: string | null }): Promise<{ success: boolean; message?: string }> {
    const { error } = await supabase
      .from('organizations')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', orgId);

    if (error) return { success: false, message: error.message };

    // Refresh cache if active org was updated
    if (cachedActiveOrg?.id === orgId) {
      await this.loadActiveOrg();
    }
    cachedUserOrgs = null;
    return { success: true };
  },

  async deleteOrg(orgId: string): Promise<{ success: boolean; message?: string }> {
    const { error } = await supabase
      .from('organizations')
      .delete()
      .eq('id', orgId);

    if (error) return { success: false, message: error.message };

    if (cachedActiveOrg?.id === orgId) {
      cachedActiveOrg = null;
    }
    cachedUserOrgs = null;
    return { success: true };
  },

  async getAllOrgs(): Promise<Organization[]> {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .order('name');

    if (error || !data) return [];
    return data.map(mapOrg);
  },

  // ═══════════════════════════════════════════════════════════
  // MEMBER MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  async getOrgMembers(orgId: string): Promise<OrganizationMember[]> {
    const { data, error } = await supabase
      .from('organization_members')
      .select('*, profiles(email, display_name)')
      .eq('organization_id', orgId)
      .order('joined_at');

    if (error || !data) return [];

    return data.map((row: any) => ({
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      orgRole: row.org_role as OrgRole,
      joinedAt: row.joined_at,
      email: row.profiles?.email || '',
      displayName: row.profiles?.display_name || '',
    }));
  },

  async addMember(orgId: string, userEmail: string, role: OrgRole = 'member'): Promise<{ success: boolean; message?: string }> {
    // Find user by email
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', userEmail)
      .single();

    if (profileError || !profile) {
      return { success: false, message: 'User not found with this email' };
    }

    // Check if already member
    const { data: existing } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', orgId)
      .eq('user_id', profile.id)
      .single();

    if (existing) {
      return { success: false, message: 'User is already a member of this organization' };
    }

    const { error } = await supabase
      .from('organization_members')
      .insert({ organization_id: orgId, user_id: profile.id, org_role: role });

    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  async updateMemberRole(orgId: string, userId: string, newRole: OrgRole): Promise<{ success: boolean; message?: string }> {
    const { error } = await supabase
      .from('organization_members')
      .update({ org_role: newRole })
      .eq('organization_id', orgId)
      .eq('user_id', userId);

    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  async removeMember(orgId: string, userId: string): Promise<{ success: boolean; message?: string }> {
    const { error } = await supabase
      .from('organization_members')
      .delete()
      .eq('organization_id', orgId)
      .eq('user_id', userId);

    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  // ═══════════════════════════════════════════════════════════
  // ORGANIZATION INSTRUCTIONS
  // ═══════════════════════════════════════════════════════════

  async getOrgInstructions(orgId: string): Promise<OrganizationInstructions | null> {
    const { data, error } = await supabase
      .from('organization_instructions')
      .select('*')
      .eq('organization_id', orgId)
      .single();

    if (error || !data) return null;

    return {
      instructions: data.instructions || null,
      updatedAt: data.updated_at || null,
      updatedBy: data.updated_by || null,
    };
  },

  async getActiveOrgInstructions(): Promise<Record<string, string> | null> {
    const orgId = cachedActiveOrg?.id;
    if (!orgId) return null;

    // Return cached if same org
    if (cachedOrgInstructionsOrgId === orgId && cachedOrgInstructions !== undefined) {
      return cachedOrgInstructions;
    }

    const result = await this.getOrgInstructions(orgId);
    cachedOrgInstructions = result?.instructions || null;
    cachedOrgInstructionsOrgId = orgId;
    return cachedOrgInstructions;
  },

  /**
   * Synchronous version — returns cached org instructions.
   * Used by Instructions.ts via getEffectiveOverrideSync.
   */
  getActiveOrgInstructionsSync(): Record<string, string> | null {
    if (cachedOrgInstructionsOrgId === cachedActiveOrg?.id) {
      return cachedOrgInstructions;
    }
    return null;
  },

  async saveOrgInstructions(orgId: string, instructions: Record<string, string>): Promise<{ success: boolean; message?: string }> {
    const userId = await getAuthUserId();

    const { error } = await supabase
      .from('organization_instructions')
      .upsert(
        {
          organization_id: orgId,
          instructions,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        },
        { onConflict: 'organization_id' }
      );

    if (error) return { success: false, message: error.message };

    // Update cache if active org
    if (cachedActiveOrg?.id === orgId) {
      cachedOrgInstructions = instructions;
      cachedOrgInstructionsOrgId = orgId;
    }

    return { success: true };
  },

  async resetOrgInstructions(orgId: string): Promise<{ success: boolean; message?: string }> {
    const userId = await getAuthUserId();

    const { error } = await supabase
      .from('organization_instructions')
      .upsert(
        {
          organization_id: orgId,
          instructions: null,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        },
        { onConflict: 'organization_id' }
      );

    if (error) return { success: false, message: error.message };

    if (cachedActiveOrg?.id === orgId) {
      cachedOrgInstructions = null;
      cachedOrgInstructionsOrgId = orgId;
    }

    return { success: true };
  },

  // ═══════════════════════════════════════════════════════════
  // CACHE MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  invalidateOrgInstructionsCache(): void {
    cachedOrgInstructions = null;
    cachedOrgInstructionsOrgId = null;
  },

  clearCache(): void {
    cachedActiveOrg = null;
    cachedUserOrgs = null;
    cachedOrgInstructions = null;
    cachedOrgInstructionsOrgId = null;
  },
};
