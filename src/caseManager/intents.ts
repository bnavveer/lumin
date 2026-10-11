// Deterministic intent layer: fast, free, checked before any LLM call. English + Spanish keywords.
import { LANGS, type Lang } from './state.js';

export type Intent =
  | { kind: 'stop' }
  | { kind: 'start' }
  | { kind: 'help' }
  | { kind: 'join'; code?: string }
  | { kind: 'yes' }
  | { kind: 'no' }
  | { kind: 'status' }
  | { kind: 'docs' }
  | { kind: 'human' }
  | { kind: 'lang'; lang: Lang }
  | { kind: 'renew' }
  | { kind: 'digit'; value: '1' | '2' }
  | { kind: 'none' };

/** Uppercase, strip accents and trailing punctuation: "  Sí! " -> "SI". */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
    .replace(/^[¡¿"'\s]+|[.!?,"'\s]+$/g, '').replace(/\s+/g, ' ').toUpperCase();
}

const STOP = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'ALTO', 'PARAR', 'BAJA']);
const START = new Set(['START', 'UNSTOP', 'SUBSCRIBE', 'INICIO', 'COMENZAR']);
const HELP = new Set(['HELP', 'INFO', 'AYUDA', 'MENU', 'MENÚ']);
const YES = new Set(['YES', 'Y', 'YEP', 'YEAH', 'OK', 'OKAY', 'SURE', 'SI', 'S', 'CLARO', 'DALE', 'VALE', 'APPROVE', 'CONFIRM']);
const NO = new Set(['NO', 'N', 'NOPE', 'NOT NOW', 'WAIT', 'ESPERA', 'TODAVIA NO', 'AHORA NO']);
const STATUS = new Set(['STATUS', 'ESTADO', 'ESTATUS']);
const DOCS = new Set(['DOCS', 'DOCUMENTS', 'DOCUMENTOS', 'DOCS?']);
const HUMAN = new Set(['HUMAN', 'PERSON', 'AGENT', 'CASEWORKER', 'REAL PERSON', 'HUMANO', 'PERSONA', 'AGENTE', 'TRABAJADOR']);
const RENEW = new Set(['RENEW', 'RENEWAL', 'RENOVAR', 'RENOVACION']);

const LANG_WORDS: Record<string, Lang> = {
  EN: 'en', ENGLISH: 'en', INGLES: 'en',
  ES: 'es', SPANISH: 'es', ESPANOL: 'es',
  ZH: 'zh', CHINESE: 'zh', '中文': 'zh',
  VI: 'vi', VIETNAMESE: 'vi',
  TL: 'tl', TAGALOG: 'tl',
};

export function parseIntent(text: string): Intent {
  const t = normalize(text);
  if (!t) return { kind: 'none' };
  if (STOP.has(t)) return { kind: 'stop' };
  if (START.has(t)) return { kind: 'start' };
  if (HELP.has(t)) return { kind: 'help' };
  const join = /^(?:JOIN|UNIR|UNIRME)(?:\s+([A-Z0-9-]{2,24}))?$/.exec(t);
  if (join) return join[1] ? { kind: 'join', code: join[1] } : { kind: 'join' };
  const lang = /^(?:LANG|LANGUAGE|IDIOMA)\s+(\S+)$/.exec(t);
  if (lang && LANG_WORDS[lang[1]!]) return { kind: 'lang', lang: LANG_WORDS[lang[1]!]! };
  if (t === '1' || t === '2') return { kind: 'digit', value: t };
  if (YES.has(t)) return { kind: 'yes' };
  if (NO.has(t)) return { kind: 'no' };
  if (STATUS.has(t)) return { kind: 'status' };
  if (DOCS.has(t)) return { kind: 'docs' };
  if (HUMAN.has(t)) return { kind: 'human' };
  if (RENEW.has(t)) return { kind: 'renew' };
  return { kind: 'none' };
}

export const isLang = (v: string): v is Lang => (LANGS as readonly string[]).includes(v);
