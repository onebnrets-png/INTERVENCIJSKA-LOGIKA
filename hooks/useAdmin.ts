// hooks/useAdmin.ts
// ═══════════════════════════════════════════════════════════════
// Admin hook — user management, role changes, instructions,
// audit log. All admin operations go through this hook.
// v1.0 — 2026-02-17
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient.ts';
import { storageService } from '../services/storageService.ts';
import { invalidateGlobalInstructionsCache } from '../services/globalInstructionsService.ts';

// ─── Types ───────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
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
    setIsAdmin(role === 'admin');
    return role === 'admin';
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
    newRole: 'admin' | 'user'
  ): Promise<{ success: boolean; message?: string }> => {
    if (!checkAdminStatus()) {
      return { success: false, message: 'Not authorized' };
    }

    // Safety: admin cannot remove their own admin role
    const currentUserId = await storageService.getCurrentUserId();
    if (targetUserId === currentUserId && newRole === 'user') {
      return { success: false, message: 'You cannot remove your own admin role' };
    }

    try {
      // Get the old role for audit log
      const targetUser = users.find(u => u.id === targetUserId);
      const oldRole = targetUser?.role || 'user';

      if (oldRole === newRole) {
        return { success: true, message: 'Role unchanged' };
      }

      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', targetUserId);

      if (updateError) {
        console.error('updateUserRole error:', updateError.message);
        return { success: false, message: updateError.message };
      }

      // Write audit log
      const { error: logError } = await supabase
        .from('admin_log')
        .insert({
          admin_id: currentUserId,
          action: 'role_change',
          target_user_id: targetUserId,
          details: {
            old_role: oldRole,
            new_role: newRole,
            target_email: targetUser?.email || 'unknown',
          },
        });

      if (logError) {
        console.warn('Audit log write failed:', logError.message);
        // Don't fail the whole operation for a log write failure
      }

      // Update local state
      setUsers(prev =>
        prev.map(u =>
          u.id === targetUserId ? { ...u, role: newRole } : u
        )
      );

      return { success: true };
    } catch (err: any) {
      console.error('updateUserRole exception:', err);
      return { success: false, message: err.message || 'Failed to update role' };
    }
  }, [checkAdminStatus, users]);

  // ─── Fetch audit log ───────────────────────────────────────

  const fetchAdminLog = useCallback(async (limit: number = 50) => {
    if (!checkAdminStatus()) return;

    setIsLoadingLog(true);
    setError(null);

    try {
      // Fetch log entries
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

      // Enrich with emails from profiles (we already have users loaded)
      const entries: AdminLogEntry[] = (logData || []).map((entry: any) => {
        const adminUser = users.find(u => u.id === entry.admin_id);
        const targetUser = users.find(u => u.id === entry.target_user_id);

        return {
          id: entry.id,
          adminId: entry.admin_id,
          adminEmail: adminUser?.email || entry.details?.admin_email || 'Unknown',
          action: entry.action,
          targetUserId: entry.target_user_id,
          targetEmail: targetUser?.email || entry.details?.target_email || null,
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
    if (!checkAdminStatus()) {
      return { success: false, message: 'Not authorized' };
    }

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

      if (updateError) {
        console.error('saveGlobalInstructions error:', updateError.message);
        return { success: false, message: updateError.message };
      }

      // Write audit log
      const { error: logError } = await supabase
        .from('admin_log')
        .insert({
          admin_id: currentUserId,
          action: 'instructions_update',
          target_user_id: null,
          details: {
            sections_updated: Object.keys(instructions).length,
            timestamp: new Date().toISOString(),
          },
        });

      if (logError) {
        console.warn('Audit log write failed:', logError.message);
      }

      // Update local state
      setGlobalInstructions(prev => ({
        ...prev!,
        custom_instructions: instructions,
        updated_at: new Date().toISOString(),
        updated_by: currentUserId,
      }));

      // Invalidate cached instructions so next AI call uses new overrides
      invalidateGlobalInstructionsCache();

      return { success: true };
    } catch (err: any) {
      console.error('saveGlobalInstructions exception:', err);
      return { success: false, message: err.message || 'Failed to save instructions' };
    } finally {
      setIsSavingInstructions(false);
    }
  }, [checkAdminStatus]);

  // ─── Reset instructions to default ─────────────────────────

  const resetInstructionsToDefault = useCallback(async (): Promise<{ success: boolean; message?: string }> => {
    if (!checkAdminStatus()) {
      return { success: false, message: 'Not authorized' };
    }

    setIsSavingInstructions(true);

    try {
      const currentUserId = await storageService.getCurrentUserId();

      const { error: updateError } = await supabase
        .from('global_settings')
        .update({
          custom_instructions: null, // null = use hardcoded defaults from Instructions.ts
          updated_at: new Date().toISOString(),
          updated_by: currentUserId,
        })
        .eq('id', 'global');

      if (updateError) {
        return { success: false, message: updateError.message };
      }

      // Audit log
      await supabase
        .from('admin_log')
        .insert({
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
    users,
    adminLog,
    globalInstructions,
    isLoadingUsers,
    isLoadingLog,
    isLoadingInstructions,
    isSavingInstructions,
    error,

    // Actions
    checkAdminStatus,
    fetchUsers,
    updateUserRole,
    fetchAdminLog,
    fetchGlobalInstructions,
    saveGlobalInstructions,
    resetInstructionsToDefault,
    clearError: () => setError(null),
  };
};

export default useAdmin;
