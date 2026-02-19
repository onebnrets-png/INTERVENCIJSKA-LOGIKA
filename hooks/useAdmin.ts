// hooks/useAdmin.ts
// ═══════════════════════════════════════════════════════════════
// Admin hook — user management, role changes, delete users,
// delete organizations, self-delete, instructions, audit log.
//
// v1.2 — 2026-02-19
//   ★ v1.2: Delete capabilities (3 levels)
//     - deleteUser(): SuperAdmin deletes any user
//     - deleteOrgUser(): Org owner/admin deletes user from their org
//     - deleteSelf(): User deletes own account
//     - deleteOrganization(): Org owner/SuperAdmin deletes entire org
//   ★ v1.1: Superadmin support
//   v1.0: Initial implementation
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient.ts';
import { storageService } from '../services/storageService.ts';
import { organizationService } from '../services/organizationService.ts';
import { invalidateGlobalInstructionsCache } from '../services/globalInstructionsService.ts';

// ─── Types ───────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user' | 'superadmin';
  createdAt: string;
  lastSignIn: string | null;
}

export interface AdminLogEntry {
  id: string;
  adminId: string;
  adminEmail?: string;
  action: string;
  targetUserId: string | null;
  targetEmail?: string;
  details: Record<string, any>;
  createdAt: string;
}

export interface GlobalInstructions {
  custom_instructions: Record<string, string> | null;
  updated_at: string | null;
  updated_by: string | null;
}

// ─── Hook ────────────────────────────────────────────────────

export const useAdmin = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [adminLog, setAdminLog] = useState<AdminLogEntry[]>([]);
  const [globalInstructions, setGlobalInstructions] = useState<GlobalInstructions | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingLog, setIsLoadingLog] = useState(false);
  const [isLoadingInstructions, setIsLoadingInstructions] = useState(false);
  const [isSavingInstructions, setIsSavingInstructions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Check admin status ────────────────────────────────────

  const checkAdminStatus = useCallback(() => {
    const role = storageService.getUserRole();
    const isAdminRole = role === 'admin' || role === 'superadmin';
    const isSuperRole = role === 'superadmin';
    setIsAdmin(isAdminRole);
    setIsSuperAdmin(isSuperRole);
    return isAdminRole;
  }, []);

  useEffect(() => {
    checkAdminStatus();
  }, [checkAdminStatus]);

  // ─── Fetch all users ──────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    if (!checkAdminStatus()) return;

    setIsLoadingUsers(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('id, email, display_name, role, created_at, last_sign_in')
        .order('created_at', { ascending: true });

      if (fetchError) {
        console.error('fetchUsers error:', fetchError.message);
        setError(fetchError.message);
        return;
      }

      const mapped: AdminUser[] = (data || []).map((p: any) => ({
        id: p.id,
        email: p.email,
        displayName: p.display_name || p.email?.split('@')[0] || 'Unknown',
        role: p.role || 'user',
        createdAt: p.created_at,
        lastSignIn: p.last_sign_in,
      }));

      setUsers(mapped);
    } catch (err: any) {
      console.error('fetchUsers exception:', err);
      setError(err.message || 'Failed to fetch users');
    } finally {
      setIsLoadingUsers(false);
    }
  }, [checkAdminStatus]);

  // ─── Update user role ──────────────────────────────────────

  const updateUserRole = useCallback(async (
    targetUserId: string,
    newRole: 'admin' | 'user' | 'superadmin'
  ): Promise<{ success: boolean; message?: string }> => {
    if (!checkAdminStatus()) {
      return { success: false, message: 'Not authorized' };
    }

    const currentUserId = await storageService.getCurrentUserId();
    if (targetUserId === currentUserId) {
      return { success: false, message: 'You cannot change your own role' };
    }

    const targetUser = users.find(u => u.id === targetUserId);
    if ((newRole === 'superadmin' || targetUser?.role === 'superadmin') && !storageService.isSuperAdmin()) {
      return { success: false, message: 'Only Super Admin can modify Super Admin roles' };
    }

    try {
      const oldRole = targetUser?.role || 'user';
      if (oldRole === newRole) return { success: true, message: 'Role unchanged' };

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', targetUserId);

      if (updateError) return { success: false, message: updateError.message };

      await supabase.from('admin_log').insert({
        admin_id: currentUserId,
        action: 'role_change',
        target_user_id: targetUserId,
        details: { old_role: oldRole, new_role: newRole, target_email: targetUser?.email || 'unknown' },
      });

      setUsers(prev => prev.map(u => u.id === targetUserId ? { ...u, role: newRole } : u));
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to update role' };
    }
  }, [checkAdminStatus, users]);

  // ═══════════════════════════════════════════════════════════
  // ★ v1.2: DELETE OPERATIONS — 3 LEVELS
  // ═══════════════════════════════════════════════════════════

  /**
   * Internal helper: Remove all data for a given user ID.
   * Deletes: project_data → projects → user_settings → org_memberships → profile
   */
  const _purgeUserData = useCallback(async (userId: string): Promise<{ success: boolean; message?: string }> => {
    try {
      // 1. Get user's projects
      const { data: userProjects } = await supabase
        .from('projects')
        .select('id')
        .eq('owner_id', userId);

      // 2. Delete project_data for those projects
      if (userProjects && userProjects.length > 0) {
        for (const p of userProjects) {
          await supabase.from('project_data').delete().eq('project_id', p.id);
        }
        // 3. Delete projects
        await supabase.from('projects').delete().eq('owner_id', userId);
      }

      // 4. Delete user_settings
      await supabase.from('user_settings').delete().eq('user_id', userId);

      // 5. Delete organization_members entries
      await supabase.from('organization_members').delete().eq('user_id', userId);

      // 6. Delete profile
      const { error: profileError } = await supabase.from('profiles').delete().eq('id', userId);
      if (profileError) {
        console.error('_purgeUserData: profiles delete error:', profileError.message);
        return { success: false, message: `Profile delete failed: ${profileError.message}` };
      }

      return { success: true };
    } catch (err: any) {
      console.error('_purgeUserData error:', err);
      return { success: false, message: err.message || 'Purge failed' };
    }
  }, []);

  /**
   * LEVEL 1: SuperAdmin deletes ANY user.
   */
  const deleteUser = useCallback(async (userId: string): Promise<{ success: boolean; message?: string }> => {
    if (!storageService.isSuperAdmin()) {
      return { success: false, message: 'Only SuperAdmin can delete users globally.' };
    }

    const currentUserId = await storageService.getCurrentUserId();
    if (userId === currentUserId) {
      return { success: false, message: 'Cannot delete your own account from here. Use "Delete my account" instead.' };
    }

    const targetUser = users.find(u => u.id === userId);
    if (targetUser?.role === 'superadmin') {
      return { success: false, message: 'Cannot delete another SuperAdmin.' };
    }

    try {
      const result = await _purgeUserData(userId);
      if (!result.success) return result;

      // Try to delete auth user (may fail without service_role key)
      try {
        await supabase.auth.admin.deleteUser(userId);
      } catch (e) {
        console.warn('deleteUser: auth.admin.deleteUser not available (expected in client-side).');
      }

      // Audit log
      await supabase.from('admin_log').insert({
        admin_id: currentUserId,
        action: 'user_delete',
        target_user_id: userId,
        details: {
          deleted_email: targetUser?.email || 'unknown',
          deleted_by: 'superadmin',
          deleted_at: new Date().toISOString(),
        },
      });

      await fetchUsers();
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Delete failed' };
    }
  }, [users, _purgeUserData, fetchUsers]);

  /**
   * LEVEL 2: Org Owner/Admin removes a user from THEIR organization.
   * - Removes membership + user's projects in that org
   * - If user has no remaining org memberships → full account purge
   * - If alsoDeleteAccount=true → force full purge
   */
  const deleteOrgUser = useCallback(async (
    userId: string,
    orgId: string,
    alsoDeleteAccount: boolean = false
  ): Promise<{ success: boolean; message?: string }> => {
    const currentUserId = await storageService.getCurrentUserId();
    if (!currentUserId) return { success: false, message: 'Not authenticated' };

    if (userId === currentUserId) {
      return { success: false, message: 'Cannot remove yourself. Use "Delete my account" instead.' };
    }

    // Check caller is owner/admin of this org, or superadmin
    const callerOrgRole = await organizationService.getUserOrgRole(orgId);
    const callerIsSuperAdmin = storageService.isSuperAdmin();

    if (!callerIsSuperAdmin && callerOrgRole !== 'owner' && callerOrgRole !== 'admin') {
      return { success: false, message: 'Only organization owner, admin, or SuperAdmin can remove users.' };
    }

    // Check target's role in org — cannot remove owner unless superadmin
    const { data: targetMembership } = await supabase
      .from('organization_members')
      .select('org_role')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .single();

    if (targetMembership?.org_role === 'owner' && !callerIsSuperAdmin) {
      return { success: false, message: 'Cannot remove the organization owner. Only SuperAdmin can do this.' };
    }

    try {
      // 1. Delete user's projects that belong to this org
      const { data: orgProjects } = await supabase
        .from('projects')
        .select('id')
        .eq('owner_id', userId)
        .eq('organization_id', orgId);

      if (orgProjects && orgProjects.length > 0) {
        for (const p of orgProjects) {
          await supabase.from('project_data').delete().eq('project_id', p.id);
        }
        await supabase.from('projects').delete().eq('owner_id', userId).eq('organization_id', orgId);
      }

      // 2. Remove membership
      await supabase
        .from('organization_members')
        .delete()
        .eq('organization_id', orgId)
        .eq('user_id', userId);

      // 3. If user's active_org was this org, clear it
      await supabase
        .from('profiles')
        .update({ active_organization_id: null })
        .eq('id', userId)
        .eq('active_organization_id', orgId);

      // 4. Check remaining memberships
      const { data: remainingMemberships } = await supabase
        .from('organization_members')
        .select('id')
        .eq('user_id', userId);

      // 5. Full purge if requested or no orgs left
      if (alsoDeleteAccount || !remainingMemberships || remainingMemberships.length === 0) {
        await _purgeUserData(userId);
        try { await supabase.auth.admin.deleteUser(userId); } catch (e) { /* expected */ }
      }

      // Audit log
      const targetUser = users.find(u => u.id === userId);
      await supabase.from('admin_log').insert({
        admin_id: currentUserId,
        action: 'org_user_remove',
        target_user_id: userId,
        details: {
          org_id: orgId,
          removed_email: targetUser?.email || 'unknown',
          also_deleted_account: alsoDeleteAccount || (!remainingMemberships || remainingMemberships.length === 0),
          deleted_at: new Date().toISOString(),
        },
      });

      await fetchUsers();
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Remove failed' };
    }
  }, [users, _purgeUserData, fetchUsers]);

  /**
   * LEVEL 3: User deletes their OWN account (self-delete).
   * - If owner of org with no other members → deletes org too
   * - If owner of org WITH other members → blocks (must transfer first)
   * - Removes all data and logs out
   */
  const deleteSelf = useCallback(async (): Promise<{ success: boolean; message?: string }> => {
    const currentUserId = await storageService.getCurrentUserId();
    if (!currentUserId) return { success: false, message: 'Not authenticated' };

    // SuperAdmin cannot self-delete (safety)
    if (storageService.isSuperAdmin()) {
      return { success: false, message: 'SuperAdmin cannot delete own account. Demote yourself first.' };
    }

    try {
      // Check if user is owner of any org
      const { data: ownedOrgs } = await supabase
        .from('organization_members')
        .select('organization_id, organizations(name)')
        .eq('user_id', currentUserId)
        .eq('org_role', 'owner');

      if (ownedOrgs && ownedOrgs.length > 0) {
        for (const oo of ownedOrgs) {
          const { data: otherMembers } = await supabase
            .from('organization_members')
            .select('id')
            .eq('organization_id', oo.organization_id)
            .neq('user_id', currentUserId);

          if (otherMembers && otherMembers.length > 0) {
            const orgName = (oo as any).organizations?.name || oo.organization_id;
            return {
              success: false,
              message: `You are the owner of "${orgName}" which has other members. Transfer ownership or remove all members first.`
            };
          }

          // No other members → delete the entire org
          await supabase.from('organization_instructions').delete().eq('organization_id', oo.organization_id);

          const { data: orgProjects } = await supabase
            .from('projects')
            .select('id')
            .eq('organization_id', oo.organization_id);

          if (orgProjects) {
            for (const p of orgProjects) {
              await supabase.from('project_data').delete().eq('project_id', p.id);
            }
            await supabase.from('projects').delete().eq('organization_id', oo.organization_id);
          }

          await supabase.from('organization_members').delete().eq('organization_id', oo.organization_id);
          await supabase.from('organizations').delete().eq('id', oo.organization_id);
        }
      }

      // Purge user's own data (remaining projects, settings, memberships, profile)
      const result = await _purgeUserData(currentUserId);
      if (!result.success) return result;

      // Logout
      await storageService.logout();

      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Self-delete failed' };
    }
  }, [_purgeUserData]);

  /**
   * Delete an entire organization and ALL its data.
   * Only org owner or superadmin can do this.
   * Does NOT delete user accounts — only removes memberships.
   */
  const deleteOrganization = useCallback(async (orgId: string): Promise<{ success: boolean; message?: string }> => {
    const currentUserId = await storageService.getCurrentUserId();
    if (!currentUserId) return { success: false, message: 'Not authenticated' };

    const callerOrgRole = await organizationService.getUserOrgRole(orgId);
    const callerIsSuperAdmin = storageService.isSuperAdmin();

    if (!callerIsSuperAdmin && callerOrgRole !== 'owner') {
      return { success: false, message: 'Only the organization owner or SuperAdmin can delete an organization.' };
    }

    try {
      // 1. Get all projects in this org
      const { data: orgProjects } = await supabase
        .from('projects')
        .select('id')
        .eq('organization_id', orgId);

      // 2. Delete project_data
      if (orgProjects && orgProjects.length > 0) {
        for (const p of orgProjects) {
          await supabase.from('project_data').delete().eq('project_id', p.id);
        }
        // 3. Delete projects
        await supabase.from('projects').delete().eq('organization_id', orgId);
      }

      // 4. Delete org instructions
      await supabase.from('organization_instructions').delete().eq('organization_id', orgId);

      // 5. Get members before deleting
      const { data: members } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', orgId);

      // 6. Delete all memberships
      await supabase.from('organization_members').delete().eq('organization_id', orgId);

      // 7. Clear active_organization_id for affected users
      if (members && members.length > 0) {
        for (const m of members) {
          await supabase
            .from('profiles')
            .update({ active_organization_id: null })
            .eq('id', m.user_id)
            .eq('active_organization_id', orgId);
        }
      }

      // 8. Delete the organization
      const { error: deleteError } = await supabase
        .from('organizations')
        .delete()
        .eq('id', orgId);

      if (deleteError) {
        return { success: false, message: `Failed to delete org: ${deleteError.message}` };
      }

      // Audit log
      await supabase.from('admin_log').insert({
        admin_id: currentUserId,
        action: 'org_delete',
        target_user_id: null,
        details: {
          org_id: orgId,
          projects_deleted: orgProjects?.length || 0,
          members_affected: members?.length || 0,
          deleted_at: new Date().toISOString(),
        },
      });

      organizationService.clearCache();
      await fetchUsers();
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Organization delete failed' };
    }
  }, [fetchUsers]);

  // ─── Fetch audit log ───────────────────────────────────────

  const fetchAdminLog = useCallback(async (limit: number = 50) => {
    if (!checkAdminStatus()) return;

    setIsLoadingLog(true);
    setError(null);

    try {
      const { data: logData, error: logError } = await supabase
        .from('admin_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (logError) {
        console.error('fetchAdminLog error:', logError.message);
        setError(logError.message);
        return;
      }

      const entries: AdminLogEntry[] = (logData || []).map((entry: any) => {
        const adminUser = users.find(u => u.id === entry.admin_id);
        const targetUser = users.find(u => u.id === entry.target_user_id);

        return {
          id: entry.id,
          adminId: entry.admin_id,
          adminEmail: adminUser?.email || entry.details?.admin_email || 'Unknown',
          action: entry.action,
          targetUserId: entry.target_user_id,
          targetEmail: targetUser?.email || entry.details?.target_email || entry.details?.deleted_email || entry.details?.removed_email || null,
          details: entry.details || {},
          createdAt: entry.created_at,
        };
      });

      setAdminLog(entries);
    } catch (err: any) {
      console.error('fetchAdminLog exception:', err);
      setError(err.message || 'Failed to fetch audit log');
    } finally {
      setIsLoadingLog(false);
    }
  }, [checkAdminStatus, users]);

  // ─── Fetch global instructions ─────────────────────────────

  const fetchGlobalInstructions = useCallback(async () => {
    setIsLoadingInstructions(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('global_settings')
        .select('*')
        .eq('id', 'global')
        .single();

      if (fetchError) {
        console.error('fetchGlobalInstructions error:', fetchError.message);
        setError(fetchError.message);
        return;
      }

      setGlobalInstructions({
        custom_instructions: data?.custom_instructions || null,
        updated_at: data?.updated_at || null,
        updated_by: data?.updated_by || null,
      });
    } catch (err: any) {
      console.error('fetchGlobalInstructions exception:', err);
      setError(err.message || 'Failed to fetch instructions');
    } finally {
      setIsLoadingInstructions(false);
    }
  }, []);

  // ─── Save global instructions ──────────────────────────────

  const saveGlobalInstructions = useCallback(async (
    instructions: Record<string, string>
  ): Promise<{ success: boolean; message?: string }> => {
    if (!checkAdminStatus()) return { success: false, message: 'Not authorized' };

    setIsSavingInstructions(true);

    try {
      const currentUserId = await storageService.getCurrentUserId();

      const { error: updateError } = await supabase
        .from('global_settings')
        .update({
          custom_instructions: instructions,
          updated_at: new Date().toISOString(),
          updated_by: currentUserId,
        })
        .eq('id', 'global');

      if (updateError) return { success: false, message: updateError.message };

      await supabase.from('admin_log').insert({
        admin_id: currentUserId,
        action: 'instructions_update',
        target_user_id: null,
        details: { sections_updated: Object.keys(instructions).length, timestamp: new Date().toISOString() },
      });

      setGlobalInstructions(prev => ({
        ...prev!,
        custom_instructions: instructions,
        updated_at: new Date().toISOString(),
        updated_by: currentUserId,
      }));

      invalidateGlobalInstructionsCache();
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to save instructions' };
    } finally {
      setIsSavingInstructions(false);
    }
  }, [checkAdminStatus]);

  // ─── Reset instructions to default ─────────────────────────

  const resetInstructionsToDefault = useCallback(async (): Promise<{ success: boolean; message?: string }> => {
    if (!checkAdminStatus()) return { success: false, message: 'Not authorized' };

    setIsSavingInstructions(true);

    try {
      const currentUserId = await storageService.getCurrentUserId();

      const { error: updateError } = await supabase
        .from('global_settings')
        .update({
          custom_instructions: null,
          updated_at: new Date().toISOString(),
          updated_by: currentUserId,
        })
        .eq('id', 'global');

      if (updateError) return { success: false, message: updateError.message };

      await supabase.from('admin_log').insert({
        admin_id: currentUserId,
        action: 'instructions_reset',
        target_user_id: null,
        details: { reset_to: 'default', timestamp: new Date().toISOString() },
      });

      setGlobalInstructions(prev => ({
        ...prev!,
        custom_instructions: null,
        updated_at: new Date().toISOString(),
        updated_by: currentUserId,
      }));

      invalidateGlobalInstructionsCache();
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to reset' };
    } finally {
      setIsSavingInstructions(false);
    }
  }, [checkAdminStatus]);

  // ─── Return ────────────────────────────────────────────────

  return {
    // State
    isAdmin,
    isSuperAdmin,
    users,
    adminLog,
    globalInstructions,
    isLoadingUsers,
    isLoadingLog,
    isLoadingInstructions,
    isSavingInstructions,
    error,

    // Actions — existing
    checkAdminStatus,
    fetchUsers,
    updateUserRole,
    fetchAdminLog,
    fetchGlobalInstructions,
    saveGlobalInstructions,
    resetInstructionsToDefault,
    clearError: () => setError(null),

    // ★ v1.2: Delete actions
    deleteUser,          // Level 1: SuperAdmin deletes any user
    deleteOrgUser,       // Level 2: Org owner/admin removes user from org
    deleteSelf,          // Level 3: User deletes own account
    deleteOrganization,  // Org owner/SuperAdmin deletes entire org
  };
};

export default useAdmin;
