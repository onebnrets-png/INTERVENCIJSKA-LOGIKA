// services/translationDiffService.ts
// ═══════════════════════════════════════════════════════════════
// Granular diff-based translation engine.
// v4.1 — 2026-02-21 — CONSOLIDATED LANGUAGE DETECTION
//   - CHANGED: detectLanguageOfText() now delegates to shared
//     detectTextLanguage() from utils.ts for consistency.
//   - NEW: import detectTextLanguage from utils.ts
//
// v4.0 — 2026-02-15 — RELIABILITY OVERHAUL
//
// FIXES:
//   - Reduced batch size from 30 to 15 for higher AI reliability.
//   - Added post-translation LANGUAGE VERIFICATION: checks each
//     translated field to confirm it's actually in the target language.
//     Fields that fail verification are queued for individual retry.
//   - Individual retry for fields missing from batch AI response.
//   - Fallback NO LONGER copies source text — preserves existing
//     target text or marks field for retry.
//   - New forceTranslateAll option: ignores hashes, re-translates
//     every field. Useful when user notices bad translations.
//   - Added explicit source/target language labels in the prompt.
//   - Enhanced prompt with stronger instructions and examples.
//
// v3.4 — 2026-02-14 — getTranslationRules() safe formatting.
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabaseClient.ts';
import { generateContent } from './aiProvider.ts';
import { storageService } from './storageService.ts';
import { getTranslationRules } from './Instructions.ts';
import { detectTextLanguage } from '../utils.ts';

// ─── SIMPLE HASH ─────────────────────────────────────────────────

const simpleHash = (str: string): string => {
  let hash = 0;
  const s = str.trim();
  if (s.length === 0) return '0';
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
};

// ─── NON-TRANSLATABLE KEYS ──────────────────────────────────────

const SKIP_KEYS = new Set([
  'id', 'startDate', 'endDate', 'date', 'level',
  'category', 'likelihood', 'impact', 'type', 'predecessorId',
  'projectAcronym'
]);

const SKIP_VALUES = new Set([
  'Low', 'Medium', 'High', 'low', 'medium', 'high',
  'Technical', 'Social', 'Economic', 'Environmental',
  'technical', 'social', 'economic', 'environmental',
  'FS', 'SS', 'FF', 'SF'
]);

// ─── FLATTEN ─────────────────────────────────────────────────────

interface FieldEntry {
  path: string;
  value: string;
  hash: string;
}

const flattenTranslatableFields = (obj: any, prefix: string = ''): FieldEntry[] => {
  const entries: FieldEntry[] = [];
  if (obj === null || obj === undefined) return entries;

  if (typeof obj === 'string') {
    const trimmed = obj.trim();
    if (trimmed.length > 0 && !SKIP_VALUES.has(trimmed)) {
      entries.push({ path: prefix, value: trimmed, hash: simpleHash(trimmed) });
    }
    return entries;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      entries.push(...flattenTranslatableFields(item, `${prefix}[${index}]`));
    });
    return entries;
  }

  if (typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      if (SKIP_KEYS.has(key)) continue;
      const newPrefix = prefix ? `${prefix}.${key}` : key;
      entries.push(...flattenTranslatableFields(val, newPrefix));
    }
  }

  return entries;
};

// ─── PATH HELPERS ────────────────────────────────────────────────

const getByPath = (obj: any, path: string): any => {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    const idx = Number(part);
    current = Number.isNaN(idx) ? current[part] : current[idx];
  }
  return current;
};

const setByPath = (obj: any, path: string, value: any): void => {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const idx = Number(part);
    const nextKey = parts[i + 1];
    const nextIsArray = !Number.isNaN(Number(nextKey));
    if (Number.isNaN(idx)) {
      if (current[part] === undefined || current[part] === null) {
        current[part] = nextIsArray ? [] : {};
      }
      current = current[part];
    } else {
      if (current[idx] === undefined || current[idx] === null) {
        current[idx] = nextIsArray ? [] : {};
      }
      current = current[idx];
    }
  }
  const lastPart = parts[parts.length - 1];
  const lastIdx = Number(lastPart);
  if (Number.isNaN(lastIdx)) {
    current[lastPart] = value;
  } else {
    current[lastIdx] = value;
  }
};

// ─── SUPABASE HASH STORAGE ──────────────────────────────────────

const loadStoredHashes = async (
  projectId: string,
  sourceLang: string,
  targetLang: string
): Promise<Map<string, string>> => {
  const { data, error } = await supabase
    .from('translation_hashes')
    .select('field_path, source_hash')
    .eq('project_id', projectId)
    .eq('source_lang', sourceLang)
    .eq('target_lang', targetLang);

  if (error) {
    console.warn('[TranslationDiff] Error loading hashes:', error.message);
    return new Map();
  }

  const map = new Map<string, string>();
  (data || []).forEach(row => map.set(row.field_path, row.source_hash));
  return map;
};

const saveHashes = async (
  projectId: string,
  sourceLang: string,
  targetLang: string,
  entries: FieldEntry[]
): Promise<void> => {
  if (entries.length === 0) return;

  const rows = entries.map(e => ({
    project_id: projectId,
    source_lang: sourceLang,
    target_lang: targetLang,
    field_path: e.path,
    source_hash: e.hash,
    updated_at: new Date().toISOString()
  }));

  const { error } = await supabase
    .from('translation_hashes')
    .upsert(rows, { onConflict: 'project_id,source_lang,target_lang,field_path' });

  if (error) {
    console.warn('[TranslationDiff] Error saving hashes:', error.message);
  }
};

// ─── LANGUAGE DETECTION HELPER ───────────────────────────────────
// ★ v4.1 (2026-02-21): Consolidated — uses shared detectTextLanguage from utils.ts

const detectLanguageOfText = (text: string): 'en' | 'si' | 'unknown' => {
  return detectTextLanguage(text);
};

// ─── VERIFY TRANSLATION LANGUAGE ─────────────────────────────────

const verifyTranslationLanguage = (
  translatedValue: string,
  sourceValue: string,
  targetLang: 'en' | 'si'
): boolean => {
  // Short strings (< 15 chars) are hard to detect — accept them
  if (translatedValue.trim().length < 15) return true;

  // If translated value is identical to source, it wasn't translated
  if (translatedValue.trim() === sourceValue.trim()) return false;

  // Check detected language
  const detected = detectLanguageOfText(translatedValue);
  if (detected === 'unknown') return true; // Can't determine — accept
  return detected === targetLang;
};

// ─── GROUP BY SECTION ────────────────────────────────────────────

const groupBySection = (fields: FieldEntry[]): Map<string, FieldEntry[]> => {
  const groups = new Map<string, FieldEntry[]>();
  for (const field of fields) {
    const section = field.path.split('.')[0].split('[')[0];
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section)!.push(field);
  }
  return groups;
};

// ─── SAFE RULES FORMATTER ────────────────────────────────────────

const formatRulesForPrompt = (rules: string | string[]): string => {
  if (Array.isArray(rules)) return rules.join('\n- ');
  if (typeof rules === 'string' && rules.trim().length > 0) return rules;
  return 'Translate professionally, preserving JSON structure and EU terminology.';
};

// ─── TRANSLATE A BATCH OF FIELDS ─────────────────────────────────

const translateFieldBatch = async (
  fields: FieldEntry[],
  targetLanguage: 'en' | 'si',
  sourceLanguage: 'en' | 'si'
): Promise<Map<string, string>> => {
  const targetName = targetLanguage === 'si' ? 'Slovenian (slovenščina)' : 'English (British English)';
  const sourceName = sourceLanguage === 'si' ? 'Slovenian' : 'English';

  const translationRules = getTranslationRules(targetLanguage);
  const formattedRules = formatRulesForPrompt(translationRules);

  // Build key→value map
  const toTranslate: Record<string, string> = {};
  fields.forEach((f, i) => {
    toTranslate[`field_${i}`] = f.value;
  });

  const prompt = [
    `You are a PROFESSIONAL TRANSLATOR specializing in EU Project Proposals.`,
    ``,
    `SOURCE LANGUAGE: ${sourceName}`,
    `TARGET LANGUAGE: ${targetName}`,
    ``,
    `CRITICAL RULES:`,
    `- You MUST translate EVERY field value from ${sourceName} to ${targetName}.`,
    `- Do NOT copy source text unchanged — every field MUST be translated.`,
    `- Do NOT leave any field in ${sourceName} — ALL output must be in ${targetName}.`,
    `- If a field contains technical EU terminology, translate it using the correct official ${targetName} term.`,
    `- Preserve professional, academic tone appropriate for EU project proposals.`,
    `- Keep all JSON keys exactly as they are (field_0, field_1, etc.).`,
    `- Return ONLY valid JSON. No markdown, no explanation, no wrapper.`,
    ``,
    `TRANSLATION QUALITY RULES:`,
    `- ${formattedRules}`,
    ``,
    `VERIFICATION: After translating, CHECK each field:`,
    `- Is it actually in ${targetName}? If not, fix it.`,
    `- Is the meaning preserved? If not, improve it.`,
    `- Is the EU terminology correct? If not, correct it.`,
    ``,
    `TRANSLATE THIS JSON (${fields.length} fields):`,
    JSON.stringify(toTranslate, null, 2)
  ].join('\n');

  const result = await generateContent({
    prompt,
    jsonMode: true,
    sectionKey: 'translation'
  });

  const jsonStr = result.text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
  const translated = JSON.parse(jsonStr);

  const resultMap = new Map<string, string>();
  fields.forEach((f, i) => {
    const key = `field_${i}`;
    if (translated[key] && typeof translated[key] === 'string') {
      resultMap.set(f.path, translated[key]);
    }
  });

  return resultMap;
};

// ─── TRANSLATE SINGLE FIELD (retry for failed fields) ────────────

const translateSingleField = async (
  field: FieldEntry,
  targetLanguage: 'en' | 'si',
  sourceLanguage: 'en' | 'si'
): Promise<string | null> => {
  const targetName = targetLanguage === 'si' ? 'Slovenian (slovenščina)' : 'English (British English)';
  const sourceName = sourceLanguage === 'si' ? 'Slovenian' : 'English';

  const prompt = [
    `Translate the following text from ${sourceName} to ${targetName}.`,
    `This is EU project proposal content — use correct EU terminology.`,
    `Return ONLY the translated text, nothing else. No quotes, no explanation.`,
    ``,
    `TEXT TO TRANSLATE:`,
    field.value
  ].join('\n');

  try {
    const result = await generateContent({
      prompt,
      sectionKey: 'field'
    });
    const translated = result.text.trim();
    if (translated && translated !== field.value) {
      return translated;
    }
    return null;
  } catch (e) {
    console.warn(`[TranslationDiff] Single-field retry failed for ${field.path}:`, (e as any).message);
    return null;
  }
};

// ─── TRANSLATE WITH RETRY ────────────────────────────────────────

const MAX_RETRIES = 3;

const translateFieldBatchWithRetry = async (
  fields: FieldEntry[],
  targetLanguage: 'en' | 'si',
  sourceLanguage: 'en' | 'si'
): Promise<Map<string, string>> => {
  let lastError: any = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = 2000 * Math.pow(2, attempt);
        console.log(`[TranslationDiff] Rate limited — retry ${attempt}/${MAX_RETRIES}, waiting ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
      return await translateFieldBatch(fields, targetLanguage, sourceLanguage);
    } catch (e: any) {
      lastError = e;
      const msg = e.message || '';
      const isRateLimit = msg.includes('429') || msg.includes('Quota') ||
        msg.includes('RESOURCE_EXHAUSTED') || msg.includes('rate limit') ||
        msg.includes('Rate Limit') || msg.includes('Too Many Requests');

      if (!isRateLimit || attempt === MAX_RETRIES) throw e;
    }
  }
  throw lastError;
};

// ─── COPY NON-TRANSLATABLE DATA ─────────────────────────────────

const copyNonTranslatableFromSource = (source: any, target: any): void => {
  if (!source || typeof source !== 'object') return;

  if (Array.isArray(source)) {
    for (let i = 0; i < source.length; i++) {
      if (target[i] === undefined || target[i] === null) {
        if (typeof source[i] === 'object' && source[i] !== null) {
          target[i] = Array.isArray(source[i]) ? [] : {};
        } else {
          target[i] = source[i];
          continue;
        }
      }
      if (typeof source[i] === 'object' && source[i] !== null) {
        copyNonTranslatableFromSource(source[i], target[i]);
      }
    }
    return;
  }

  for (const [key, val] of Object.entries(source)) {
    if (SKIP_KEYS.has(key)) {
      target[key] = val;
    } else if (typeof val === 'object' && val !== null) {
      if (target[key] === undefined || target[key] === null) {
        target[key] = Array.isArray(val) ? [] : {};
      }
      copyNonTranslatableFromSource(val, target[key]);
    }
  }
};

// ═══════════════════════════════════════════════════════════════
// MAIN: SMART INCREMENTAL TRANSLATION
// ═══════════════════════════════════════════════════════════════

export const smartTranslateProject = async (
  sourceData: any,
  targetLanguage: 'en' | 'si',
  existingTargetData: any,
  projectId: string,
  forceTranslateAll: boolean = false
): Promise<{
  translatedData: any;
  stats: { total: number; changed: number; translated: number; failed: number; verified: number; retried: number };
}> => {
  const sourceLang: 'en' | 'si' = targetLanguage === 'si' ? 'en' : 'si';

  // 1. Flatten all translatable fields
  const sourceFields = flattenTranslatableFields(sourceData);
  console.log(`[TranslationDiff] Source has ${sourceFields.length} translatable fields.`);

  // 2. Determine which fields need translation
  let changedFields: FieldEntry[];
  let unchangedFields: FieldEntry[];

  if (forceTranslateAll) {
    // Force mode: translate EVERYTHING regardless of hashes
    console.log(`[TranslationDiff] FORCE MODE: translating ALL ${sourceFields.length} fields.`);
    changedFields = sourceFields;
    unchangedFields = [];
  } else {
    // Normal mode: use hash diff
    const storedHashes = await loadStoredHashes(projectId, sourceLang, targetLanguage);
    console.log(`[TranslationDiff] Found ${storedHashes.size} stored hashes.`);

    changedFields = [];
    unchangedFields = [];

    for (const field of sourceFields) {
      const storedHash = storedHashes.get(field.path);
      if (storedHash && storedHash === field.hash) {
        // ★ v4.0: Even if hash matches, verify the existing translation
        // is actually in the target language (not just copied source)
        const existingTranslation = existingTargetData
          ? getByPath(existingTargetData, field.path)
          : null;

        if (existingTranslation && typeof existingTranslation === 'string') {
          const isCorrectLang = verifyTranslationLanguage(existingTranslation, field.value, targetLanguage);
          if (!isCorrectLang) {
            console.warn(`[TranslationDiff] Field "${field.path}" hash matches but translation is in WRONG LANGUAGE — re-translating.`);
            changedFields.push(field);
            continue;
          }
        }

        unchangedFields.push(field);
      } else {
        changedFields.push(field);
      }
    }
  }

  console.log(`[TranslationDiff] ${changedFields.length} fields to translate, ${unchangedFields.length} unchanged.`);

  // 3. Start with existing target data or deep copy of source
  const translatedData = existingTargetData
    ? JSON.parse(JSON.stringify(existingTargetData))
    : JSON.parse(JSON.stringify(sourceData));

  // 4. Copy non-translatable data
  copyNonTranslatableFromSource(sourceData, translatedData);
  console.log(`[TranslationDiff] Non-translatable fields copied from source.`);

  // 5. Translate changed fields
  const stats = {
    total: sourceFields.length,
    changed: changedFields.length,
    translated: 0,
    failed: 0,
    verified: 0,
    retried: 0,
  };

  if (changedFields.length === 0) {
    console.log('[TranslationDiff] Nothing changed – no translation needed!');
    return { translatedData, stats };
  }

  const sectionGroups = groupBySection(changedFields);
  const successfullyTranslated: FieldEntry[] = [];
  const fieldsNeedingRetry: FieldEntry[] = [];
  let batchIndex = 0;

  // ★ v4.0: Reduced batch size from 30 to 15 for better reliability
  const BATCH_SIZE = 15;

  for (const [section, fields] of sectionGroups) {
    console.log(`[TranslationDiff] Translating section "${section}" – ${fields.length} fields...`);

    for (let i = 0; i < fields.length; i += BATCH_SIZE) {
      const batch = fields.slice(i, i + BATCH_SIZE);

      // Rate limit: 2s between batches
      if (batchIndex > 0) {
        await new Promise(r => setTimeout(r, 2000));
      }
      batchIndex++;

      try {
        const results = await translateFieldBatchWithRetry(batch, targetLanguage, sourceLang);

        for (const field of batch) {
          const translatedValue = results.get(field.path);

          if (!translatedValue) {
            // ★ v4.0: Field missing from AI response — queue for individual retry
            console.warn(`[TranslationDiff] Field "${field.path}" missing from batch response — queuing for retry.`);
            fieldsNeedingRetry.push(field);
            continue;
          }

          // ★ v4.0: Verify the translation is actually in the target language
          const isCorrectLang = verifyTranslationLanguage(translatedValue, field.value, targetLanguage);

          if (!isCorrectLang) {
            console.warn(`[TranslationDiff] Field "${field.path}" translation appears to be in wrong language — queuing for retry.`);
            fieldsNeedingRetry.push(field);
            continue;
          }

          // Translation is good — apply it
          setByPath(translatedData, field.path, translatedValue);
          stats.translated++;
          stats.verified++;
          successfullyTranslated.push(field);
        }
      } catch (error: any) {
        console.warn(`[TranslationDiff] Batch failed for "${section}" (${batch.length} fields):`, error.message);

        // ★ v4.0: Do NOT copy source! Instead, queue all batch fields for retry
        for (const field of batch) {
          fieldsNeedingRetry.push(field);
        }
      }
    }
  }

  // ═══ v4.0: RETRY PHASE — individually retry all failed/unverified fields ═══
  if (fieldsNeedingRetry.length > 0) {
    console.log(`[TranslationDiff] RETRY PHASE: ${fieldsNeedingRetry.length} fields need individual translation...`);

    for (const field of fieldsNeedingRetry) {
      // Rate limit between individual retries
      await new Promise(r => setTimeout(r, 500));

      try {
        const translated = await translateSingleField(field, targetLanguage, sourceLang);

        if (translated) {
          const isCorrectLang = verifyTranslationLanguage(translated, field.value, targetLanguage);

          if (isCorrectLang) {
            setByPath(translatedData, field.path, translated);
            stats.translated++;
            stats.retried++;
            stats.verified++;
            successfullyTranslated.push(field);
            console.log(`[TranslationDiff] ✓ Retry succeeded for "${field.path}"`);
          } else {
            // Still wrong language after retry — apply it anyway (better than source)
            // but log the issue
            console.warn(`[TranslationDiff] ✗ Retry for "${field.path}" still wrong language — applying best effort.`);
            setByPath(translatedData, field.path, translated);
            stats.translated++;
            stats.retried++;
            successfullyTranslated.push(field);
          }
        } else {
          // ★ v4.0: If retry also fails, keep existing target value (don't copy source)
          const existingTarget = getByPath(translatedData, field.path);
          if (!existingTarget || (typeof existingTarget === 'string' && existingTarget.trim() === '')) {
            // Only as ABSOLUTE last resort, copy source — but mark as failed
            setByPath(translatedData, field.path, field.value);
          }
          stats.failed++;
          console.warn(`[TranslationDiff] ✗ Retry failed for "${field.path}" — keeping existing value.`);
        }
      } catch (e: any) {
        stats.failed++;
        console.warn(`[TranslationDiff] ✗ Retry error for "${field.path}":`, (e as any).message);
      }
    }
  }

  // 7. Save hashes
  const allToSave = [...successfullyTranslated, ...unchangedFields];
  await saveHashes(projectId, sourceLang, targetLanguage, allToSave);

  console.log(`[TranslationDiff] DONE: ${stats.translated}/${stats.changed} translated, ${stats.verified} verified, ${stats.retried} retried, ${stats.failed} failed, ${unchangedFields.length} skipped.`);

  return { translatedData, stats };
};
