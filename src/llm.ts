// One place to get Aid's Claude model. Routes through Neon AI Gateway when its credential is set
// (NEON_AI_GATEWAY_TOKEN / NEON_AI_GATEWAY_BASE_URL), otherwise falls back to ANTHROPIC_API_KEY.
import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';
import { optionalEnv } from './env.js';

// Gateway catalog has claude-opus-5-5 and claude-sonnet-5 (no sonnet-5-5); override with AID_MODEL.
export const DEFAULT_MODEL = 'claude-opus-5-5';

let provider: ReturnType<typeof createAnthropic> | undefined;

function getProvider(): ReturnType<typeof createAnthropic> {
  if (provider) return provider;
  const token = optionalEnv('NEON_AI_GATEWAY_TOKEN');
  const base = optionalEnv('NEON_AI_GATEWAY_BASE_URL');
  provider = token && base
    ? createAnthropic({ baseURL: `${base}/anthropic/v1`, apiKey: token, headers: { Authorization: `Bearer ${token}` } })
    : createAnthropic({ apiKey: optionalEnv('ANTHROPIC_API_KEY') ?? '' });
  return provider;
}

export const hasModel = (): boolean =>
  Boolean((optionalEnv('NEON_AI_GATEWAY_TOKEN') && optionalEnv('NEON_AI_GATEWAY_BASE_URL')) || optionalEnv('ANTHROPIC_API_KEY'));

export function model(id: string = optionalEnv('AID_MODEL') ?? DEFAULT_MODEL): LanguageModel {
  return getProvider()(id);
}
