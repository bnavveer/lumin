// Small language utilities built on the 'translate' and 'fast' tasks.
import { generateWithFallback } from './fallback.js';

const TRANSLATE_SYSTEM = `You translate benefits-office messages for applicants. Write plain, friendly language at a 6th-grade reading level.
Keep numbers, dates, times, phone numbers and URLs exactly as written. Never translate or alter program names (CalFresh, Medi-Cal, CalWORKs, General Relief, CFAP, Section 8).
Output ONLY the translation, with no notes or quotes.`;

export async function translate(text: string, targetLang: string): Promise<string> {
  const { text: out } = await generateWithFallback('translate', {
    system: TRANSLATE_SYSTEM, prompt: `Target language: ${targetLang}\n\n${text}`, maxOutputTokens: 1000,
  });
  const t = out.trim();
  if (!t) throw new Error('[llm] translate returned empty text');
  return t;
}

/** ISO 639-1 code of the message's language ('en', 'es', 'zh', ...); 'en' if unsure. */
export async function detectLanguage(text: string): Promise<string> {
  const { text: out } = await generateWithFallback('fast', {
    system: 'Identify the language of the user text. Reply with ONLY its lowercase ISO 639-1 code (for example en, es, zh, vi, tl).',
    prompt: text.slice(0, 1000), maxOutputTokens: 10,
  });
  const m = /\b[a-z]{2}\b/.exec(out.toLowerCase());
  return m ? m[0] : 'en';
}
