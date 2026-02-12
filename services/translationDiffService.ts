// services/translationDiffService.ts
// Granular diff-based translation engine.
// Tracks which fields changed since the last translation
// and only sends changed content to the AI.

import { supabase } from './supabaseClient.ts';
import { generateContent } from './aiProvider.ts';
import { storageService } from './storageService.ts';

// ─── SIMPLE HASH (fast, no crypto needed) ────────────────────────

const simpleHash = (str: string): string => {
  let hash = 0;
  const s = str.trim();
  if (s.length === 0) return '0';
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString(36);
};

// ─── NON-TRANSLATABLE KEYS (skip these) ──────────────────────────

const SKIP_KEYS = new Set([
  'id', 'startDate', 'endDate', 'date', 'level',
  'category', 'likelihood', 'impact', 'type', 'predecessorId',
  'projectAcronym', 'startDate'
]);

const SKIP_VALUES = new Set([
  'Low', 'Medium', 'High',
  'Technical', 'Social', 'Economic',
  'FS', 'SS', 'FF', 'SF'
]);

// ─── FLATTEN: Extract all translatable field paths + values ──────

interface FieldEntry {
  path: string;       // e.g. "problemAnalysis.coreProblem.title"
  value: string;      // the actual text
  hash: string;       // hash of the value
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
      const itemPrefix = `${prefix}[${index}]`;
      entries.push(...flattenTranslatableFields(item, itemPrefix));
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

// ─── GET/SET value by dot-bracket path ───────────────────────────

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

// ─── LOAD STORED HASHES FROM SUPABASE ────────────────────────────

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

// ─── SAVE HASHES TO SUPABASE (batch upsert) ─────────────────────

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

// ─── GROUP CHANGED FIELDS INTO SECTION CHUNKS ────────────────────

const groupBySection = (fields: FieldEntry[]): Map<string, FieldEntry[]> => {
  const groups = new Map<string, FieldEntry[]>();
  for (const field of fields) {
    // Extract top-level section: "problemAnalysis.coreProblem.title" → "problemAnalysis"
    const section = field.path.split('.')[0].split('[')[0];
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section)!.push(field);
  }
  return groups;
};

// ─── TRANSLATE A BATCH OF FIELDS ─────────────────────────────────

const translateFieldBatch = async (
  fields: FieldEntry[],
  targetLanguage: 'en' | 'si'
): Promise<Map<string, string>> => {
  const langName = targetLanguage === 'si' ? 'Slovenian' : 'English';

  // Build a simple key→value map for the AI
  const toTranslate: Record<string, string> = {};
  fields.forEach((f, i) => {
    toTranslate[`field_${i}`] = f.value;
  });

  const prompt = `You are a professional translator for EU Project Proposals.
Translate each value in the following JSON object into ${langName}.
RULES:
1. Keep all keys exactly as they are (field_0, field_1, etc.).
2. Translate ONLY the text values.
3. Use high-quality, professional EU project terminology.
4. Do NOT translate IDs (WP1, T1.1, M1, D1, R1, KER1), dates, or abbreviations.
5. Return ONLY valid JSON. No markdown, no explanation.

JSON:
${JSON.stringify(toTranslate, null, 2)}`;

  const result = await generateContent({ prompt, jsonMode: true });
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

// ─── MAIN: SMART INCREMENTAL TRANSLATION ─────────────────────────

export const smartTranslateProject = async (
  sourceData: any,
  targetLanguage: 'en' | 'si',
  existingTargetData: any,
  projectId: string
): Promise<{ translatedData: any; stats: { total: number; changed: number; translated: number; failed: number } }> => {

  const sourceLang = targetLanguage === 'si' ? 'en' : 'si';

  // 1. Flatten all translatable fields from source
  const sourceFields = flattenTranslatableFields(sourceData);
  console.log(`[TranslationDiff] Source has ${sourceFields.length} translatable fields.`);

  // 2. Load stored hashes from last translation
  const storedHashes = await loadStoredHashes(projectId, sourceLang, targetLanguage);
  console.log(`[TranslationDiff] Found ${storedHashes.size} stored hashes.`);

  // 3. Determine which fields changed
  const changedFields: FieldEntry[] = [];
  const unchangedFields: FieldEntry[] = [];

  for (const field of sourceFields) {
    const storedHash = storedHashes.get(field.path);
    if (storedHash && storedHash === field.hash) {
      // Hash matches → source unchanged since last translation → skip
      unchangedFields.push(field);
    } else {
      // Hash differs or missing → needs (re-)translation
      changedFields.push(field);
    }
  }

  console.log(`[TranslationDiff] ${changedFields.length} fields changed, ${unchangedFields.length} unchanged.`);

  // 4. Start with existing target data as base (preserves already-translated content)
  const translatedData = existingTargetData
    ? JSON.parse(JSON.stringify(existingTargetData))
    : JSON.parse(JSON.stringify(sourceData));

  // 5. Translate changed fields in section-based batches
  const stats = { total: sourceFields.length, changed: changedFields.length, translated: 0, failed: 0 };

  if (changedFields.length === 0) {
    console.log('[TranslationDiff] Nothing changed – no translation needed!');
    return { translatedData, stats };
  }

  const sectionGroups = groupBySection(changedFields);
  const successfullyTranslated: FieldEntry[] = [];

  for (const [section, fields] of sectionGroups) {
    console.log(`[TranslationDiff] Translating section "${section}" – ${fields.length} fields...`);

    // Split into batches of max 30 fields to avoid token limits
    const BATCH_SIZE = 30;
    for (let i = 0; i < fields.length; i += BATCH_SIZE) {
      const batch = fields.slice(i, i + BATCH_SIZE);

      try {
        const results = await translateFieldBatch(batch, targetLanguage);

        // Apply translated values to target data
        for (const [path, translatedValue] of results) {
          setByPath(translatedData, path, translatedValue);
          stats.translated++;
        }

        // Track successfully translated fields for hash storage
        batch.forEach(f => {
          if (results.has(f.path)) {
            successfullyTranslated.push(f);
          }
        });
      } catch (error: any) {
        console.warn(`[TranslationDiff] Batch failed for "${section}" (${batch.length} fields):`, error.message);
        stats.failed += batch.length;

        // Fallback: copy source values for failed fields
        for (const field of batch) {
          const existingTarget = getByPath(translatedData, field.path);
          if (!existingTarget || existingTarget.trim() === '' || existingTarget === field.value) {
            // Target is empty or same as source → copy source as fallback
            setByPath(translatedData, field.path, field.value);
          }
          // else: keep existing target (it's a previous translation)
        }
      }
    }
  }

  // 6. Save hashes for all successfully translated fields + unchanged fields
  const allToSave = [...successfullyTranslated, ...unchangedFields];
  await saveHashes(projectId, sourceLang, targetLanguage, allToSave);

  console.log(`[TranslationDiff] Done: ${stats.translated}/${stats.changed} translated, ${stats.failed} failed, ${unchangedFields.length} skipped.`);

  return { translatedData, stats };
};
