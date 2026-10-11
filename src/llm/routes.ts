// Task -> model routing through Neon AI Gateway. One gateway, many providers, one credential per task.
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { optionalEnv } from '../env.js';

export type AiTask = 'agent' | 'fast' | 'vision' | 'translate' | 'knowledge' | 'audio';
export type TokenName = 'AGENT' | 'FAST' | 'VISION' | 'KNOWLEDGE';
export interface Route { model: string; token: TokenName; fallbacks: string[] }

// Gateway catalog has claude-opus-5-5 and claude-sonnet-5 (no sonnet-5-5).
export const DEFAULT_MODEL = 'claude-opus-5-5';
export const EMBED_MODEL = 'qwen3-embedding-0-6b';
export const EMBED_TOKEN: TokenName = 'KNOWLEDGE';

export const ROUTES: Record<AiTask, Route> = {
  agent: { model: DEFAULT_MODEL, token: 'AGENT', fallbacks: ['gpt-6-astra', 'gemini-3-1-pro'] },
  fast: { model: 'gemini-3-5-flash-lite', token: 'FAST', fallbacks: ['gpt-5-nano', 'claude-haiku-4-5'] },
  vision: { model: DEFAULT_MODEL, token: 'VISION', fallbacks: ['gemini-3-6-flash', 'gpt-5-4'] },
  translate: { model: 'gemini-3-6-flash', token: 'FAST', fallbacks: ['gpt-5-4-mini', 'claude-sonnet-5'] },
  knowledge: { model: 'claude-sonnet-5', token: 'KNOWLEDGE', fallbacks: ['gpt-5-4-mini'] },
  audio: { model: 'gemini-3-6-flash', token: 'FAST', fallbacks: [] },
};

export const isClaude = (id: string): boolean => id.startsWith('claude-');
export const baseUrl = (): string | undefined => optionalEnv('NEON_AI_GATEWAY_BASE_URL')?.replace(/\/+$/, '');

/** Primary model id for a task; AID_MODEL_<TASK> overrides (legacy AID_MODEL overrides 'agent'). */
export function primaryModel(task: AiTask): string {
  return optionalEnv(`AID_MODEL_${task.toUpperCase()}`) ?? (task === 'agent' ? optionalEnv('AID_MODEL') : undefined) ?? ROUTES[task].model;
}
export const candidateIds = (task: AiTask): string[] => [primaryModel(task), ...ROUTES[task].fallbacks];

/** Task token, then the generic gateway token. */
export const gatewayToken = (name: TokenName): string | undefined =>
  optionalEnv(`NEON_AI_TOKEN_${name}`) ?? optionalEnv('NEON_AI_GATEWAY_TOKEN');

type Provider = (id: string) => LanguageModel;
const providers = new Map<string, Provider>();

function providerFor(kind: 'anthropic' | 'compat', token: string, base: string): Provider {
  const key = `${kind}:${token}`;
  let p = providers.get(key);
  if (!p) {
    const headers = { Authorization: `Bearer ${token}` };
    p = kind === 'anthropic'
      ? createAnthropic({ baseURL: `${base}/anthropic/v1`, apiKey: token, headers })
      : createOpenAICompatible({ name: 'neon-gateway', supportsStructuredOutputs: true, baseURL: `${base}/v1`, apiKey: token, headers });
    providers.set(key, p);
  }
  return p;
}

export function modelFor(task: AiTask, id: string): LanguageModel {
  const base = baseUrl();
  const token = gatewayToken(ROUTES[task].token);
  if (base && token) return providerFor(isClaude(id) ? 'anthropic' : 'compat', token, base)(id);
  const direct = optionalEnv('ANTHROPIC_API_KEY');
  if (isClaude(id) && direct) return createAnthropic({ apiKey: direct })(id);
  throw new Error(`[llm] no credential for task "${task}" (set NEON_AI_TOKEN_${ROUTES[task].token} or NEON_AI_GATEWAY_TOKEN)`);
}

/** LanguageModel for a task. Zero-arg means the 'agent' task. */
export function model(task: AiTask = 'agent', idOverride?: string): LanguageModel {
  return modelFor(task, idOverride ?? primaryModel(task));
}

export const hasModel = (): boolean =>
  Boolean((baseUrl() && (optionalEnv('NEON_AI_GATEWAY_TOKEN') || optionalEnv('NEON_AI_TOKEN_AGENT'))) || optionalEnv('ANTHROPIC_API_KEY'));

/** Dashboard/health view: task -> model table and which tokens exist (booleans only, never values). */
export function routeInfo(): {
  gateway: boolean;
  routes: Record<string, { model: string; fallbacks: string[]; token: TokenName; tokenPresent: boolean }>;
  tokens: Record<string, boolean>;
} {
  const routes: ReturnType<typeof routeInfo>['routes'] = {};
  for (const task of Object.keys(ROUTES) as AiTask[]) {
    const r = ROUTES[task];
    routes[task] = { model: primaryModel(task), fallbacks: r.fallbacks, token: r.token, tokenPresent: Boolean(gatewayToken(r.token)) };
  }
  routes.embeddings = { model: EMBED_MODEL, fallbacks: [], token: EMBED_TOKEN, tokenPresent: Boolean(gatewayToken(EMBED_TOKEN)) };
  const tokens: Record<string, boolean> = { GENERIC: Boolean(optionalEnv('NEON_AI_GATEWAY_TOKEN')) };
  for (const n of ['AGENT', 'FAST', 'VISION', 'KNOWLEDGE'] as TokenName[]) tokens[n] = Boolean(optionalEnv(`NEON_AI_TOKEN_${n}`));
  return { gateway: Boolean(baseUrl()), routes, tokens };
}
