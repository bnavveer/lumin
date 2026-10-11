import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUTES, candidateIds, gatewayToken, primaryModel, routeInfo } from '../src/llm/routes.js';
import { generateWithFallback, setLlmDeps } from '../src/llm/fallback.js';
import { EMBED_BATCH, embedTexts } from '../src/llm/embed.js';
import type { AiTask } from '../src/llm.js';

const KEYS = ['NEON_AI_GATEWAY_BASE_URL', 'NEON_AI_GATEWAY_TOKEN', 'NEON_AI_TOKEN_AGENT', 'NEON_AI_TOKEN_FAST',
  'NEON_AI_TOKEN_VISION', 'NEON_AI_TOKEN_KNOWLEDGE', 'AID_MODEL', 'AID_MODEL_AGENT', 'AID_MODEL_FAST'];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  setLlmDeps();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('route selection', () => {
  it('maps each task to its own primary model and token', () => {
    expect(primaryModel('agent')).toBe(ROUTES.agent.model);
    expect(ROUTES.agent.token).toBe('AGENT');
    expect(ROUTES.fast.token).toBe('FAST');
    expect(ROUTES.vision.token).toBe('VISION');
    expect(ROUTES.knowledge.token).toBe('KNOWLEDGE');
    expect(ROUTES.translate.token).toBe('FAST');
  });

  it('lets AID_MODEL_<TASK> override, and legacy AID_MODEL override only agent', () => {
    process.env.AID_MODEL = 'legacy-model';
    expect(primaryModel('agent')).toBe('legacy-model');
    expect(primaryModel('fast')).toBe(ROUTES.fast.model);
    process.env.AID_MODEL_AGENT = 'specific-model';
    process.env.AID_MODEL_FAST = 'fast-override';
    expect(primaryModel('agent')).toBe('specific-model');
    expect(primaryModel('fast')).toBe('fast-override');
  });

  it('candidateIds puts the primary first, then the fallbacks in order', () => {
    expect(candidateIds('agent')).toEqual([ROUTES.agent.model, ...ROUTES.agent.fallbacks]);
  });
});

describe('token choice', () => {
  it('uses the per-task token when set', () => {
    process.env.NEON_AI_TOKEN_FAST = 'tok-fast';
    process.env.NEON_AI_GATEWAY_TOKEN = 'tok-generic';
    expect(gatewayToken('FAST')).toBe('tok-fast');
  });
  it('falls back to the generic gateway token', () => {
    process.env.NEON_AI_GATEWAY_TOKEN = 'tok-generic';
    expect(gatewayToken('VISION')).toBe('tok-generic');
  });
  it('is undefined when nothing is set', () => {
    expect(gatewayToken('AGENT')).toBeUndefined();
  });
});

describe('fallback order', () => {
  it('moves to the next model when the first throws a 429', async () => {
    const tried: string[] = [];
    setLlmDeps({
      getModel: ((_t: AiTask, id: string) => id) as never,
      generateText: async (a) => {
        const id = a.model as string;
        tried.push(id);
        if (tried.length === 1) throw Object.assign(new Error('429 rate limited'), { statusCode: 429 });
        return { text: `ok from ${id}` };
      },
    });
    const r = await generateWithFallback('agent', { prompt: 'hi' });
    expect(tried).toEqual([ROUTES.agent.model, ROUTES.agent.fallbacks[0]]);
    expect(r.modelId).toBe(ROUTES.agent.fallbacks[0]);
    expect(r.text).toContain('ok from');
  });

  it('throws after every candidate fails', async () => {
    setLlmDeps({
      getModel: ((_t: AiTask, id: string) => id) as never,
      generateText: async () => { throw new Error('429'); },
    });
    await expect(generateWithFallback('knowledge', { prompt: 'x' })).rejects.toThrow(/all models failed/);
  });

  it('logs an llm_fallback event when a household id is given', async () => {
    const logEvent = vi.fn(async () => undefined);
    let n = 0;
    setLlmDeps({
      getModel: ((_t: AiTask, id: string) => id) as never,
      generateText: async () => { if (n++ === 0) throw new Error('429'); return { text: 'ok' }; },
      logEvent,
    });
    await generateWithFallback('fast', { prompt: 'x', householdId: 'h1' });
    expect(logEvent).toHaveBeenCalledWith('h1', { type: 'AgentToolCalled', value: 'llm_fallback:fast' });
  });
});

describe('embedTexts', () => {
  it('returns [] for empty input without calling fetch', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await embedTexts([])).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it('throws a clear error without gateway config', async () => {
    await expect(embedTexts(['a'])).rejects.toThrow(/NEON_AI_GATEWAY_BASE_URL/);
  });

  it('batches by EMBED_BATCH and preserves order across batches', async () => {
    process.env.NEON_AI_GATEWAY_BASE_URL = 'https://gw.example/';
    process.env.NEON_AI_TOKEN_KNOWLEDGE = 'secret-knowledge-token';
    const sizes: number[] = [];
    const f = vi.fn(async (_url: string, init: { body: string }) => {
      const { input } = JSON.parse(init.body) as { input: string[] };
      sizes.push(input.length);
      // return out of order to prove sorting by index
      const data = input.map((t, index) => ({ index, embedding: [Number(t)] })).reverse();
      return new Response(JSON.stringify({ data }), { status: 200 });
    });
    vi.stubGlobal('fetch', f);
    const texts = Array.from({ length: EMBED_BATCH + 5 }, (_, i) => String(i));
    const out = await embedTexts(texts);
    expect(sizes).toEqual([EMBED_BATCH, 5]);
    expect(out.map(v => v[0])).toEqual(texts.map(Number));
    const call = f.mock.calls[0]!;
    expect(call[0]).toBe('https://gw.example/v1/embeddings');
    expect((call[1] as unknown as { headers: Record<string, string> }).headers.Authorization).toBe('Bearer secret-knowledge-token');
  });

  it('throws on HTTP errors', async () => {
    process.env.NEON_AI_GATEWAY_BASE_URL = 'https://gw.example';
    process.env.NEON_AI_TOKEN_KNOWLEDGE = 't';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    await expect(embedTexts(['a'])).rejects.toThrow(/HTTP 500/);
  });
});

describe('routeInfo', () => {
  it('reports booleans only and never token values', () => {
    process.env.NEON_AI_GATEWAY_BASE_URL = 'https://gw.example';
    process.env.NEON_AI_TOKEN_AGENT = 'super-secret-agent';
    process.env.NEON_AI_GATEWAY_TOKEN = 'super-secret-generic';
    const info = routeInfo();
    const json = JSON.stringify(info);
    expect(json).not.toContain('super-secret');
    expect(info.gateway).toBe(true);
    expect(info.tokens.AGENT).toBe(true);
    expect(info.tokens.FAST).toBe(false);
    expect(info.routes.agent!.tokenPresent).toBe(true);
    expect(info.routes.embeddings!.model).toBeTruthy();
  });
});
