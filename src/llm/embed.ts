// Embeddings via the gateway's OpenAI-compatible /v1/embeddings endpoint.
import { baseUrl, EMBED_MODEL, EMBED_TOKEN, gatewayToken } from './routes.js';

/** Verified live against qwen3-embedding-0-6b. */
export const EMBED_DIM = 1024;
export const EMBED_BATCH = 64;
const TIMEOUT_MS = 30_000;

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const base = baseUrl();
  const token = gatewayToken(EMBED_TOKEN);
  if (!base || !token) throw new Error('[llm] embeddings need NEON_AI_GATEWAY_BASE_URL and NEON_AI_TOKEN_KNOWLEDGE');
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const res = await fetch(`${base}/v1/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: batch }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`[llm] embeddings HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const j = (await res.json()) as { data?: Array<{ index?: number; embedding: number[] }> };
    const rows = [...(j.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    if (rows.length !== batch.length) throw new Error(`[llm] embeddings returned ${rows.length} of ${batch.length}`);
    out.push(...rows.map(r => r.embedding));
  }
  return out;
}
