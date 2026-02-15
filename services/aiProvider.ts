// services/aiProvider.ts
// ═══════════════════════════════════════════════════════════════
// Universal AI Provider Abstraction Layer – v2.0 (2026-02-14)
// ═══════════════════════════════════════════════════════════════
// CHANGELOG:
// v2.0 – FIX: Added dynamic max_tokens for OpenRouter based on
//         section key. Prevents 402 "insufficient credits" errors
//         by requesting only the tokens actually needed instead of
//         the model default (65536). Also improved 402 error handling
//         with user-friendly message.
// v1.0 – Initial version.
// ═══════════════════════════════════════════════════════════════

import { GoogleGenAI, Type } from "@google/genai";
import { storageService } from './storageService.ts';
import { OPENROUTER_SYSTEM_PROMPT } from './Instructions.ts';

// ─── TYPES ───────────────────────────────────────────────────────

export type AIProviderType = 'gemini' | 'openrouter';

export interface AIProviderConfig {
  provider: AIProviderType;
  apiKey: string;
  model: string;
}

export interface AIGenerateOptions {
  prompt: string;
  jsonSchema?: any;
  jsonMode?: boolean;
  temperature?: number;
  sectionKey?: string;  // ★ FIX v2.0: pass section key for dynamic max_tokens
}

export interface AIGenerateResult {
  text: string;
}

// ─── ★ FIX v2.0: DYNAMIC MAX_TOKENS PER SECTION ─────────────────
// OpenRouter pre-charges credits for the FULL max_tokens budget.
// By right-sizing per section, we use 4–16× fewer credits per call.
// These values are generous upper bounds – actual output is usually 30-60% of this.

const SECTION_MAX_TOKENS: Record<string, number> = {
  // Large structured sections
  activities:          16384,  // Multiple WPs with tasks, milestones, deliverables
  expectedResults:     8192,   // Composite: outputs + outcomes + impacts
  
  // Medium sections
  projectManagement:   8192,   // Implementation + organigram description
  risks:               6144,   // Risk table with mitigations
  objectives:          6144,   // General + specific objectives
  
  // Smaller sections
  problemAnalysis:     4096,   // Core problem, causes, consequences
  projectIdea:         4096,   // Title, acronym, summary, state of the art
  outputs:             4096,
  outcomes:            4096,
  impacts:             4096,
  kers:                4096,   // Key Expected Results
  
  // Single field generation (used by generateFieldContent)
  field:               2048,
  
  // Summary & translation
  summary:             4096,
  translation:         8192,
};

const DEFAULT_MAX_TOKENS = 4096;

function getMaxTokensForSection(sectionKey?: string): number {
  if (!sectionKey) return DEFAULT_MAX_TOKENS;
  return SECTION_MAX_TOKENS[sectionKey] || DEFAULT_MAX_TOKENS;
}

// ─── GEMINI MODELS ───────────────────────────────────────────────

export const GEMINI_MODELS = [
  // ═══ GENERATION 3 (Latest) ═══
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (Preview)', description: 'Most intelligent — multimodal, agentic, reasoning' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview)', description: 'Balanced speed & intelligence' },

  // ═══ GENERATION 2.5 (Stable) ═══
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Advanced thinking — code, math, STEM, long context' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Best price-performance — fast, thinking enabled' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', description: 'Ultra fast — cost-efficient, high throughput' },

  // ═══ GENERATION 2.5 (Preview) ═══
  { id: 'gemini-2.5-flash-preview-09-2025', name: 'Gemini 2.5 Flash Preview (Sep 2025)', description: 'Latest Flash preview with enhancements' },
  { id: 'gemini-2.5-flash-lite-preview-09-2025', name: 'Gemini 2.5 Flash-Lite Preview (Sep 2025)', description: 'Latest Flash-Lite preview' },

  // ═══ GENERATION 2.0 (Deprecated March 2026) ═══
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (⚠ deprecated)', description: 'Shutdown March 31, 2026 — migrate to 2.5+' },
  { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash-Lite (⚠ deprecated)', description: 'Shutdown March 31, 2026 — migrate to 2.5+' },
];

// ─── OPENROUTER POPULAR MODELS ───────────────────────────────────

export const OPENROUTER_MODELS = [
  // ═══ PROPRIETARY FLAGSHIP MODELS ═══
  { id: 'openai/gpt-4o', name: 'OpenAI GPT-4o', description: 'Most capable OpenAI model' },
  { id: 'openai/gpt-4o-mini', name: 'OpenAI GPT-4o Mini', description: 'Fast & affordable OpenAI' },
  { id: 'openai/o3-mini', name: 'OpenAI o3-mini', description: 'OpenAI reasoning model' },
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', description: 'Anthropic balanced model' },
  { id: 'anthropic/claude-opus-4', name: 'Claude Opus 4', description: 'Anthropic most capable' },
  { id: 'google/gemini-2.5-pro-preview', name: 'Gemini 2.5 Pro (via OpenRouter)', description: 'Google via OpenRouter' },

  // ═══ OPEN-SOURCE — CHINESE FLAGSHIP 🇨🇳 ═══
  { id: 'deepseek/deepseek-v3.2', name: '🇨🇳 DeepSeek V3.2', description: 'DeepSeek flagship – top open-source, MoE 671B' },
  { id: 'deepseek/deepseek-r1', name: '🇨🇳 DeepSeek R1', description: 'DeepSeek reasoning model – rivals OpenAI o1' },
  { id: 'deepseek/deepseek-r1-0528', name: '🇨🇳 DeepSeek R1 0528', description: 'Latest R1 update – enhanced reasoning' },
  { id: 'moonshotai/kimi-k2.5', name: '🇨🇳 Kimi K2.5 (Moonshot AI)', description: '#1 open-source – reasoning + visual coding' },
  { id: 'moonshotai/kimi-k2', name: '🇨🇳 Kimi K2 (Moonshot AI)', description: '1T param MoE – coding & agentic tasks' },
  { id: 'z-ai/glm-5', name: '🇨🇳 GLM-5 (Zhipu AI)', description: 'Z.AI latest flagship – frontier open-source' },
  { id: 'z-ai/glm-4.5-air:free', name: '🇨🇳 GLM-4.5 Air (FREE)', description: 'Zhipu AI – free lightweight model' },
  { id: 'qwen/qwen3-235b-a22b', name: '🇨🇳 Qwen3 235B A22B (Alibaba)', description: 'Alibaba MoE 235B – top reasoning & coding' },
  { id: 'qwen/qwen3-max', name: '🇨🇳 Qwen3 Max (Alibaba)', description: 'Alibaba cloud-hosted flagship' },
  { id: 'qwen/qwen3-coder', name: '🇨🇳 Qwen3 Coder (Alibaba)', description: 'Alibaba coding specialist – 480B MoE' },
  { id: 'minimax/minimax-m2.1', name: '🇨🇳 MiniMax M2.1', description: 'MiniMax flagship – coding & agents, efficient' },
  { id: 'minimax/minimax-m2', name: '🇨🇳 MiniMax M2', description: 'MiniMax – compact high-performance model' },

  // ═══ OPEN-SOURCE — META LLAMA 🦙 ═══
  { id: 'meta-llama/llama-4-maverick', name: '🦙 Llama 4 Maverick (Meta)', description: 'Meta MoE 128 experts – top Llama model' },
  { id: 'meta-llama/llama-4-scout', name: '🦙 Llama 4 Scout (Meta)', description: 'Meta MoE 16 experts – fast & efficient' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: '🦙 Llama 3.3 70B (Meta)', description: 'Meta proven workhorse – great price/quality' },

  // ═══ OPEN-SOURCE — MISTRAL 🇫🇷 ═══
  { id: 'mistralai/mistral-large-2512', name: '🇫🇷 Mistral Large 3 (Dec 2025)', description: 'Mistral flagship – 262K context' },
  { id: 'mistralai/devstral-2512', name: '🇫🇷 Devstral 2 (Mistral)', description: 'Mistral agentic coding specialist – 123B MoE' },
  { id: 'mistralai/mistral-small-2503', name: '🇫🇷 Mistral Small (Mar 2025)', description: 'Mistral lightweight – fast responses' },
];

// ─── PROVIDER DETECTION ──────────────────────────────────────────

export function getProviderConfig(): AIProviderConfig {
  const provider = storageService.getAIProvider() || 'gemini';
  const model = storageService.getCustomModel() || getDefaultModel(provider);

  let apiKey = '';
  if (provider === 'gemini') {
    apiKey = storageService.getApiKey() || '';
    if (!apiKey && typeof process !== 'undefined' && process.env?.API_KEY) {
      apiKey = process.env.API_KEY;
    }
  } else if (provider === 'openrouter') {
    apiKey = storageService.getOpenRouterKey() || '';
  }

  return { provider, apiKey, model };
}

export function getDefaultModel(provider: AIProviderType): string {
  if (provider === 'openrouter') return 'deepseek/deepseek-v3.2';
  return 'gemini-3-pro-preview';
}

// ─── VALIDATION ──────────────────────────────────────────────────

export async function validateProviderKey(provider: AIProviderType, apiKey: string): Promise<boolean> {
  if (!apiKey || apiKey.trim().length < 10) return false;

  try {
    if (provider === 'gemini') {
      if (!apiKey.startsWith('AIza') || apiKey.length < 35) return false;
      const client = new GoogleGenAI({ apiKey });
      await client.models.countTokens({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ text: "test" }] }]
      });
      return true;
    }

    if (provider === 'openrouter') {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      return response.ok;
    }

    return false;
  } catch (error) {
    console.error(`${provider} API Key Validation Failed:`, error);
    return false;
  }
}

export function hasValidProviderKey(): boolean {
  const config = getProviderConfig();
  if (config.provider === 'gemini') {
    return config.apiKey.startsWith('AIza') && config.apiKey.length >= 35;
  }
  if (config.provider === 'openrouter') {
    return config.apiKey.length > 10;
  }
  return false;
}

// ─── GENERATION ──────────────────────────────────────────────────

export async function generateContent(options: AIGenerateOptions): Promise<AIGenerateResult> {
  const config = getProviderConfig();

  if (!config.apiKey) {
    throw new Error('MISSING_API_KEY');
  }

  if (config.provider === 'gemini') {
    return generateWithGemini(config, options);
  }

  if (config.provider === 'openrouter') {
    return generateWithOpenRouter(config, options);
  }

  throw new Error(`Unknown AI provider: ${config.provider}`);
}

// ─── GEMINI ADAPTER ──────────────────────────────────────────────

async function generateWithGemini(config: AIProviderConfig, options: AIGenerateOptions): Promise<AIGenerateResult> {
  const client = new GoogleGenAI({ apiKey: config.apiKey });

  const generateConfig: any = {};
  if (options.jsonSchema) {
    generateConfig.responseMimeType = "application/json";
    generateConfig.responseSchema = options.jsonSchema;
  }
  if (options.temperature !== undefined) {
    generateConfig.temperature = options.temperature;
  }

  try {
    const response = await client.models.generateContent({
      model: config.model,
      contents: options.prompt,
      config: Object.keys(generateConfig).length > 0 ? generateConfig : undefined,
    });

    return { text: response.text.trim() };
  } catch (e: any) {
    handleProviderError(e, 'gemini');
    throw e;
  }
}

// ─── OPENROUTER ADAPTER ─────────────────────────────────────────
// ★ FIX v2.0: Now includes dynamic max_tokens + 402 error handling

async function generateWithOpenRouter(config: AIProviderConfig, options: AIGenerateOptions): Promise<AIGenerateResult> {
  const messages: any[] = [
    { role: 'user', content: options.prompt }
  ];

    if (options.jsonSchema || options.jsonMode) {
    messages.unshift({
      role: 'system',
      content: OPENROUTER_SYSTEM_PROMPT
    });
  }

  // ★ FIX v2.0: Calculate appropriate max_tokens for this section
  const maxTokens = getMaxTokensForSection(options.sectionKey);

  const body: any = {
    model: config.model,
    messages: messages,
    max_tokens: maxTokens,  // ★ FIX v2.0: explicit limit instead of model default (65536)
  };

  if (options.jsonSchema || options.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  if (options.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'EU Intervention Logic AI Assistant'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || `HTTP ${response.status}`;

      if (response.status === 401 || response.status === 403) {
        throw new Error('MISSING_API_KEY');
      }
      if (response.status === 429) {
        throw new Error('API Quota Exceeded. You have reached the rate limit. Please try again later or switch to a different model/plan.');
      }
      // ★ FIX v2.0: Handle 402 (insufficient credits) with clear message
      if (response.status === 402) {
        throw new Error(`Insufficient OpenRouter credits. Requested ${maxTokens} max_tokens for "${options.sectionKey || 'unknown'}" section. Please add credits at https://openrouter.ai/settings/credits or switch to a free/cheaper model.`);
      }
      throw new Error(`OpenRouter Error: ${errorMsg}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';

    if (!text) {
      throw new Error('OpenRouter returned empty response');
    }

    return { text };
  } catch (e: any) {
    if (e.message === 'MISSING_API_KEY' || e.message?.includes('Quota') || e.message?.includes('Insufficient OpenRouter')) {
      throw e;
    }
    handleProviderError(e, 'openrouter');
    throw e;
  }
}

// ─── ERROR HANDLING ──────────────────────────────────────────────

function handleProviderError(e: any, provider: string): never {
  const msg = e.message || e.toString();

  if (msg === 'MISSING_API_KEY' || msg.includes('400') || msg.includes('403') || msg.includes('API key not valid') || msg.includes('401')) {
    throw new Error('MISSING_API_KEY');
  }

  if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('rate limit')) {
    throw new Error("API Quota Exceeded. You have reached the rate limit. Please try again later or switch to a different model/plan.");
  }

  // ★ FIX v2.0: Pass through 402 / credits errors without wrapping
  if (msg.includes('402') || msg.includes('credits') || msg.includes('Insufficient')) {
    throw e;
  }

  console.error(`${provider} API Error:`, e);
  throw new Error(`AI Generation Failed (${provider}): ${msg.substring(0, 150)}...`);
}
