// hooks/useOrganization.ts
// ═══════════════════════════════════════════════════════════════
// Organization hook — org switching, member management,
// org-level instructions.
// v1.0 — 2026-02-19
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { organizationService, type Organization, type OrganizationMember, type OrgRole } from '../services/organizationService.ts';
import { invalidateOrgInstructionsCache } from '../services/globalInstructionsService.ts';
import { storageService } from '../services/storageService.ts';

export const useOrganization = () => {
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null);
  const [userOrgs, setUserOrgs] = useState<Organization[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrganizationMember[]>([]);
  const [orgInstructions, setOrgInstructions] = useState<Record<string, string> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Load active org + user orgs on mount ──────────────────

  const loadOrgs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const active = await organizationService.loadActiveOrg();
      setActiveOrg(active);

      const orgs = await organizationService.getUserOrgs(true);
      setUserOrgs(orgs);
    } catch (err: any) {
      console.error('loadOrgs error:', err);
      setError(err.message || 'Failed to load organizations');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ─── Switch organization ───────────────────────────────────

  const switchOrg = useCallback(async (orgId: string): Promise<{ success: boolean; message?: string }> => {
    setIsSwitching(true);
    setError(null);

    try {
      const result = await organizationService.switchOrg(orgId);
      if (result.success) {
        const newActive = organizationService.getActiveOrg();
        setActiveOrg(newActive);
        invalidateOrgInstructionsCache();
        console.log(`[useOrganization] Switched to org: ${newActive?.name}`);
      } else {
        setError(result.message || 'Failed to switch organization');
      }
      return result;
    } catch (err: any) {
      const msg = err.message || 'Failed to switch organization';
      setError(msg);
      return { success: false, message: msg };
    } finally {
      setIsSwitching(false);
    }
  }, []);

  // ─── Load org members ──────────────────────────────────────

  const loadOrgMembers = useCallback(async (orgId?: string) => {
    const targetOrgId = orgId || activeOrg?.id;
    if (!targetOrgId) return;

    setIsLoading(true);
    try {
      const members = await organizationService.getOrgMembers(targetOrgId);
      setOrgMembers(members);
    } catch (err: any) {
      console.error('loadOrgMembers error:', err);
      setError(err.message || 'Failed to load members');
    } finally {
      setIsLoading(false);
    }
  }, [activeOrg]);

  // ─── Add member ────────────────────────────────────────────

  const addMember = useCallback(async (
    orgId: string, userId: string, role: OrgRole = 'member'
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const result = await organizationService.addMember(orgId, userId, role);
      if (result.success) {
        await loadOrgMembers(orgId);
      }
      return result;
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }, [loadOrgMembers]);

  // ─── Update member role ────────────────────────────────────

  const updateMemberRole = useCallback(async (
    orgId: string, userId: string, newRole: OrgRole
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const result = await organizationService.updateMemberRole(orgId, userId, newRole);
      if (result.success) {
        setOrgMembers(prev =>
          prev.map(m => m.userId === userId && m.organizationId === orgId
            ? { ...m, orgRole: newRole }
            : m
          )
        );
      }
      return result;
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }, []);

  // ─── Remove member ─────────────────────────────────────────

  const removeMember = useCallback(async (
    orgId: string, userId: string
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const result = await organizationService.removeMember(orgId, userId);
      if (result.success) {
        setOrgMembers(prev => prev.filter(m => !(m.userId === userId && m.organizationId === orgId)));
      }
      return result;
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }, []);

  // ─── Org Instructions ──────────────────────────────────────

  const loadOrgInstructions = useCallback(async (orgId?: string) => {
    const targetOrgId = orgId || activeOrg?.id;
    if (!targetOrgId) return;

    try {
      const result = await organizationService.getOrgInstructions(targetOrgId);
      setOrgInstructions(result.instructions);
    } catch (err: any) {
      console.error('loadOrgInstructions error:', err);
    }
  }, [activeOrg]);

  const saveOrgInstructions = useCallback(async (
    orgId: string, instructions: Record<string, string>
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const result = await organizationService.saveOrgInstructions(orgId, instructions);
      if (result.success) {
        setOrgInstructions(instructions);
        invalidateOrgInstructionsCache();
      }
      return result;
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }, []);

  const resetOrgInstructions = useCallback(async (
    orgId: string
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const result = await organizationService.resetOrgInstructions(orgId);
      if (result.success) {
        setOrgInstructions({});
        invalidateOrgInstructionsCache();
      }
      return result;
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }, []);

  // ─── Create org (superadmin) ───────────────────────────────

  const createOrg = useCallback(async (
    name: string, slug: string
  ): Promise<{ success: boolean; org?: Organization; message?: string }> => {
    try {
      const result = await organizationService.createOrg(name, slug);
      if (result.success) {
        const orgs = await organizationService.getUserOrgs(true);
        setUserOrgs(orgs);
      }
      return result;
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }, []);

  // ─── Delete org (superadmin) ───────────────────────────────

  const deleteOrg = useCallback(async (
    orgId: string
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const result = await organizationService.deleteOrg(orgId);
      if (result.success) {
        setUserOrgs(prev => prev.filter(o => o.id !== orgId));
        if (activeOrg?.id === orgId) {
          setActiveOrg(null);
        }
      }
      return result;
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }, [activeOrg]);

  // ─── Get all orgs (superadmin) ─────────────────────────────

  const getAllOrgs = useCallback(async (): Promise<Organization[]> => {
    return await organizationService.getAllOrgs();
  }, []);

  // ─── Return ────────────────────────────────────────────────

  return {
    // State
    activeOrg,
    userOrgs,
    orgMembers,
    orgInstructions,
    isLoading,
    isSwitching,
    error,

    // Actions
    loadOrgs,
    switchOrg,
    loadOrgMembers,
    addMember,
    updateMemberRole,
    removeMember,
    loadOrgInstructions,
    saveOrgInstructions,
    resetOrgInstructions,
    createOrg,
    deleteOrg,
    getAllOrgs,
    clearError: () => setError(null),
  };
};

export default useOrganization;
