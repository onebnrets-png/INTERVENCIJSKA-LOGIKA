// services/globalInstructionsService.ts
// ═══════════════════════════════════════════════════════════════
// Global Instructions Service — thin caching layer between
// Instructions.ts and Supabase global_settings.
//
// v1.0 — 2026-02-17
//
// ARCHITECTURE:
//   - Fetches global_settings from Supabase ONCE, caches in memory
//   - Provides getGlobalOverride(key) for Instructions.ts to check
//   - Cache is invalidated when admin saves new instructions
//   - Falls back gracefully to null (= use hardcoded defaults)
//
// IMPORTANT: This service does NOT replace Instructions.ts.
//   Instructions.ts remains the SINGLE SOURCE OF TRUTH.
//   Global overrides only SUPPLEMENT or REPLACE specific sections
//   when an admin has explicitly set them via Admin Panel.
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabaseClient.ts';

// ─── Types ───────────────────────────────────────────────────

interface GlobalInstructionsCache {
  instructions: Record<string, string> | null;
  loadedAt: number;
  isLoading: boolean;
}

// ─── State ───────────────────────────────────────────────────

let cache: GlobalInstructionsCache = {
  instructions: null,
  loadedAt: 0,
  isLoading: false,
};

// Cache TTL: 5 minutes (admin changes take effect within 5 min)
const CACHE_TTL_MS = 5 * 60 * 1000;

// ─── Load from Supabase ──────────────────────────────────────

const loadGlobalInstructions = async (): Promise<void> => {
  if (cache.isLoading) return;

  cache.isLoading = true;

  try {
    const { data, error } = await supabase
      .from('global_settings')
      .select('custom_instructions')
      .eq('id', 'global')
      .single();

    if (error) {
      console.warn('[GlobalInstructions] Failed to load from Supabase:', error.message);
      // Keep existing cache or null — graceful degradation
      cache.isLoading = false;
      return;
    }

    cache.instructions = data?.custom_instructions || null;
    cache.loadedAt = Date.now();

    if (cache.instructions) {
      const keys = Object.keys(cache.instructions);
      console.log(`[GlobalInstructions] Loaded ${keys.length} override(s): ${keys.join(', ')}`);
    } else {
      console.log('[GlobalInstructions] No global overrides set — using hardcoded defaults.');
    }
  } catch (err: any) {
    console.warn('[GlobalInstructions] Exception during load:', err.message);
  } finally {
    cache.isLoading = false;
  }
};

// ─── Ensure cache is fresh ───────────────────────────────────

const ensureLoaded = async (): Promise<void> => {
  const now = Date.now();
  const isExpired = now - cache.loadedAt > CACHE_TTL_MS;
  const isFirstLoad = cache.loadedAt === 0;

  if (isFirstLoad || isExpired) {
    await loadGlobalInstructions();
  }
};

// ─── Public API ──────────────────────────────────────────────

/**
 * Get a global override for a specific instruction key.
 * Returns the override string if set by admin, or null (= use default).
 *
 * Supported keys (match AdminPanel Instructions tab):
 *   - GLOBAL_RULES
 *   - ACADEMIC_RIGOR_RULES.en / ACADEMIC_RIGOR_RULES.si
 *   - HUMANIZATION_RULES.en / HUMANIZATION_RULES.si
 *   - PROJECT_TITLE_RULES.en / PROJECT_TITLE_RULES.si
 *   - SECTION_TASK_INSTRUCTIONS.<section>.<lang>
 *   - QUALITY_GATES.<section>.<lang>
 *   - CHAPTERS.<chapterKey>
 *   - FIELD_RULES.<fieldKey>.<lang>
 *   - SUMMARY_RULES.<lang>
 *   - LANGUAGE_DIRECTIVES.<lang>
 *
 * The key format uses dot notation matching the Instructions.ts structure.
 */
export const getGlobalOverride = async (key: string): Promise<string | null> => {
  await ensureLoaded();

  if (!cache.instructions) return null;

  const value = cache.instructions[key];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  return null;
};

/**
 * Synchronous version — returns cached value WITHOUT triggering a load.
 * Use this when you need a non-async path (e.g., inside getRulesForSection).
 * Call ensureGlobalInstructionsLoaded() at app start to prime the cache.
 */
export const getGlobalOverrideSync = (key: string): string | null => {
  if (!cache.instructions) return null;

  const value = cache.instructions[key];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  return null;
};

/**
 * Prime the cache — call this ONCE at app startup (e.g., after auth).
 * This ensures the synchronous getGlobalOverrideSync() has data.
 */
export const ensureGlobalInstructionsLoaded = async (): Promise<void> => {
  await ensureLoaded();
};

/**
 * Invalidate cache — call after admin saves new instructions.
 * Next getGlobalOverride() call will re-fetch from Supabase.
 */
export const invalidateGlobalInstructionsCache = (): void => {
  cache.loadedAt = 0;
  console.log('[GlobalInstructions] Cache invalidated — will reload on next access.');
};

/**
 * Get all current overrides (for debug/admin display).
 */
export const getAllGlobalOverrides = async (): Promise<Record<string, string> | null> => {
  await ensureLoaded();
  return cache.instructions;
};
