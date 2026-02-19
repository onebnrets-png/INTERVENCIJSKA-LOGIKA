// services/globalInstructionsService.ts
// ═══════════════════════════════════════════════════════════════
// Global + Organization Instructions Service
// v2.0 — 2026-02-19
//
// CHANGES v2.0 (Multi-Tenant):
//   - NEW: Org-level instructions integration
//   - getEffectiveOverride(key) merges: global → org (org wins if set)
//   - getEffectiveOverrideSync(key) — sync version for Instructions.ts
//   - ensureAllInstructionsLoaded() — primes both caches
//   - Backward compatible: getGlobalOverride/Sync still work
//
// ARCHITECTURE:
//   When AI generates content, instructions are merged in this order:
//     1. Hardcoded rules (Instructions.ts) — base layer
//     2. Global overrides (superadmin) — middle layer
//     3. Org overrides (org admin) — top layer (wins if set)
//
//   This means:
//     - Superadmin sets rules that apply to ALL orgs by default
//     - Org admin can OVERRIDE specific rules for their org
//     - If org doesn't override a rule, global version applies
//     - If neither overrides, hardcoded default applies
//
// v1.0 — 2026-02-17 (original)
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabaseClient.ts';
import { organizationService } from './organizationService.ts';

// ─── Types ───────────────────────────────────────────────────

interface InstructionsCache {
  instructions: Record<string, string> | null;
  loadedAt: number;
  isLoading: boolean;
}

// ─── State ───────────────────────────────────────────────────

let globalCache: InstructionsCache = {
  instructions: null,
  loadedAt: 0,
  isLoading: false,
};

// Cache TTL: 5 minutes
const CACHE_TTL_MS = 5 * 60 * 1000;

// ─── Load Global from Supabase ───────────────────────────────

const loadGlobalInstructions = async (): Promise<void> => {
  if (globalCache.isLoading) return;
  globalCache.isLoading = true;

  try {
    const { data, error } = await supabase
      .from('global_settings')
      .select('custom_instructions')
      .eq('id', 'global')
      .single();

    if (error) {
      console.warn('[GlobalInstructions] Failed to load from Supabase:', error.message);
      globalCache.isLoading = false;
      return;
    }

    globalCache.instructions = data?.custom_instructions || null;
    globalCache.loadedAt = Date.now();

    if (globalCache.instructions) {
      const keys = Object.keys(globalCache.instructions);
      console.log(`[GlobalInstructions] Loaded ${keys.length} global override(s): ${keys.join(', ')}`);
    } else {
      console.log('[GlobalInstructions] No global overrides set — using hardcoded defaults.');
    }
  } catch (err: any) {
    console.warn('[GlobalInstructions] Exception during load:', err.message);
  } finally {
    globalCache.isLoading = false;
  }
};

// ─── Ensure Global Cache Fresh ───────────────────────────────

const ensureGlobalLoaded = async (): Promise<void> => {
  const now = Date.now();
  const isExpired = now - globalCache.loadedAt > CACHE_TTL_MS;
  const isFirstLoad = globalCache.loadedAt === 0;

  if (isFirstLoad || isExpired) {
    await loadGlobalInstructions();
  }
};

// ═══════════════════════════════════════════════════════════════
// PUBLIC API — GLOBAL OVERRIDES (backward compatible)
// ═══════════════════════════════════════════════════════════════

/**
 * Get a global override for a specific instruction key.
 * Returns the override string if set by superadmin, or null.
 */
export const getGlobalOverride = async (key: string): Promise<string | null> => {
  await ensureGlobalLoaded();

  if (!globalCache.instructions) return null;

  const value = globalCache.instructions[key];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  return null;
};

/**
 * Synchronous version — returns cached global value.
 */
export const getGlobalOverrideSync = (key: string): string | null => {
  if (!globalCache.instructions) return null;

  const value = globalCache.instructions[key];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  return null;
};

// ═══════════════════════════════════════════════════════════════
// PUBLIC API — EFFECTIVE OVERRIDES (★ v2.0: global + org merged)
// ═══════════════════════════════════════════════════════════════

/**
 * ★ v2.0: Get the EFFECTIVE override for a key.
 * Merge order: org override > global override > null (hardcoded default)
 *
 * This is what Instructions.ts should call instead of getGlobalOverrideSync.
 */
export const getEffectiveOverrideSync = (key: string): string | null => {
  // 1. Check org-level override first (highest priority)
  const orgInstructions = organizationService.getActiveOrgInstructionsSync();
  if (orgInstructions) {
    const orgValue = orgInstructions[key];
    if (typeof orgValue === 'string' && orgValue.trim().length > 0) {
      return orgValue;
    }
  }

  // 2. Fall back to global override (superadmin)
  if (globalCache.instructions) {
    const globalValue = globalCache.instructions[key];
    if (typeof globalValue === 'string' && globalValue.trim().length > 0) {
      return globalValue;
    }
  }

  // 3. No override — Instructions.ts will use hardcoded default
  return null;
};

/**
 * ★ v2.0: Async version of effective override.
 */
export const getEffectiveOverride = async (key: string): Promise<string | null> => {
  await ensureGlobalLoaded();
  await organizationService.getActiveOrgInstructions(); // ensures org cache is primed

  return getEffectiveOverrideSync(key);
};

// ═══════════════════════════════════════════════════════════════
// PUBLIC API — INITIALIZATION & CACHE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * ★ v2.0: Prime BOTH caches — call ONCE at app startup after auth.
 */
export const ensureAllInstructionsLoaded = async (): Promise<void> => {
  await ensureGlobalLoaded();
  await organizationService.getActiveOrgInstructions();
  console.log('[Instructions] Both global and org instruction caches primed.');
};

/**
 * Backward compatible alias.
 */
export const ensureGlobalInstructionsLoaded = ensureAllInstructionsLoaded;

/**
 * Invalidate global cache — call after superadmin saves global instructions.
 */
export const invalidateGlobalInstructionsCache = (): void => {
  globalCache.loadedAt = 0;
  console.log('[GlobalInstructions] Global cache invalidated — will reload on next access.');
};

/**
 * ★ v2.0: Invalidate org instructions cache — call after org admin saves.
 */
export const invalidateOrgInstructionsCache = (): void => {
  organizationService.invalidateOrgInstructionsCache();
  console.log('[OrgInstructions] Org cache invalidated — will reload on next access.');
};

/**
 * ★ v2.0: Invalidate ALL instruction caches (both global + org).
 */
export const invalidateAllInstructionsCaches = (): void => {
  invalidateGlobalInstructionsCache();
  invalidateOrgInstructionsCache();
};

/**
 * Get all current global overrides (for admin display).
 */
export const getAllGlobalOverrides = async (): Promise<Record<string, string> | null> => {
  await ensureGlobalLoaded();
  return globalCache.instructions;
};
