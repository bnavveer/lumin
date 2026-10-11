// parseWhen: "now", "in 5 minutes", "tomorrow at 10am", "Thursday 2pm", ISO times -> Date.
// Deterministic for common phrasings; anything else goes to an optional LLM fallback that returns an ISO time.

export const DEFAULT_TZ = 'America/Los_Angeles';
export const MAX_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;
const PAST_GRACE_MS = 60_000;

export class WhenError extends Error {}

/** LLM fallback: returns an ISO 8601 time (with offset) or null when the text is not a time. */
export type WhenLlm = (text: string, now: Date, tz: string) => Promise<string | null>;

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const UNIT_MS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 };

interface Wall { y: number; mo: number; d: number; h: number; mi: number; wd: number }

function wallClock(at: Date, tz: string): Wall {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
    weekday: 'long', hourCycle: 'h23',
  }).formatToParts(at).map(p => [p.type, p.value]));
  return {
    y: Number(parts.year), mo: Number(parts.month), d: Number(parts.day), h: Number(parts.hour) % 24,
    mi: Number(parts.minute), wd: WEEKDAYS.indexOf(String(parts.weekday).toLowerCase()),
  };
}

/** The UTC instant for a wall-clock time in tz (DST-safe for normal hours). */
export function zonedTime(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (ts: number) => {
    const w = wallClock(new Date(ts), tz);
    return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi) - ts;
  };
  const first = guess - offsetAt(guess);
  return new Date(guess - offsetAt(first));
}

function addDays(w: Wall, days: number): { y: number; mo: number; d: number } {
  const t = new Date(Date.UTC(w.y, w.mo - 1, w.d + days));
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function parseClock(s: string): { h: number; mi: number } | null {
  if (/\bnoon\b/.test(s)) return { h: 12, mi: 0 };
  if (/\bmidnight\b/.test(s)) return { h: 0, mi: 0 };
  const m = s.match(/(?:^|\s|at\s*)(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?=\s|$)/);
  if (!m) return null;
  let h = Number(m[1]);
  const mi = m[2] ? Number(m[2]) : 0;
  const mer = m[3]?.replace(/\./g, '');
  if (h > 23 || mi > 59) return null;
  if (!m[2] && !mer && !/\bat\s*\d/.test(s)) return null; // a bare number is not a time
  if (mer === 'pm' && h < 12) h += 12;
  else if (mer === 'am' && h === 12) h = 0;
  else if (!mer && h >= 1 && h <= 7) h += 12; // "at 2" in office hours means 2pm
  return { h, mi };
}

/** Deterministic parse. Returns null when the phrasing is not recognized. */
export function parseWhenDeterministic(text: string, now: Date, tz = DEFAULT_TZ): Date | null {
  const s = text.trim().toLowerCase().replace(/[,!?]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (/^(right )?now$|^asap$|^immediately$|^right away$/.test(s)) return new Date(now);
  const iso = text.trim();
  if (/^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}(:\d{2}(\.\d+)?)?(z|[+-]\d{2}:?\d{2})$/i.test(iso)) {
    const t = Date.parse(iso);
    return Number.isNaN(t) ? null : new Date(t);
  }
  const rel = s.match(/^in (an?|\d+(?:\.\d+)?) ?(m|mins?|minutes?|h|hrs?|hours?|d|days?)$/);
  if (rel) {
    const n = rel[1] === 'a' || rel[1] === 'an' ? 1 : Number(rel[1]);
    return new Date(now.getTime() + n * UNIT_MS[rel[2]![0]!]!);
  }
  const clock = parseClock(s);
  const today = wallClock(now, tz);
  const dayWord = s.match(/\b(today|tonight|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)?.[1];
  const leftover = s
    .replace(/\b(today|tonight|tomorrow|this|next|on|at|sunday|monday|tuesday|wednesday|thursday|friday|saturday|morning|afternoon|evening|noon|midnight)\b/g, '')
    .replace(/\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?)?/g, '').trim();
  if (leftover) return null; // something we don't understand ("the 14th", "after lunch"): let the LLM try
  if (!clock && !dayWord) return null;
  const { h, mi } = clock ?? { h: 10, mi: 0 }; // a day with no time: 10am
  let offset = 0;
  if (dayWord === 'tomorrow') offset = 1;
  else if (dayWord && dayWord !== 'today' && dayWord !== 'tonight') {
    offset = (WEEKDAYS.indexOf(dayWord) - today.wd + 7) % 7;
    if (offset === 0 && (/\bnext\b/.test(s) || zonedTime(today.y, today.mo, today.d, h, mi, tz) <= now)) offset = 7;
  }
  const day = addDays(today, offset);
  const at = zonedTime(day.y, day.mo, day.d, h, mi, tz);
  if (!dayWord && at.getTime() <= now.getTime()) { // "at 9am" after 9am means tomorrow
    const next = addDays(today, 1);
    return zonedTime(next.y, next.mo, next.d, h, mi, tz);
  }
  return at;
}

/** Throws WhenError for unknown, past, or too-far-ahead times. */
export function checkWhen(at: Date, now: Date): Date {
  if (Number.isNaN(at.getTime())) throw new WhenError('I could not tell what time you meant.');
  if (at.getTime() < now.getTime() - PAST_GRACE_MS) throw new WhenError('That time is in the past.');
  if (at.getTime() > now.getTime() + MAX_AHEAD_MS) throw new WhenError('I can only schedule calls up to 30 days ahead.');
  return at.getTime() < now.getTime() ? new Date(now) : at;
}

export async function parseWhen(text: string, now = new Date(), tz = DEFAULT_TZ, llm?: WhenLlm): Promise<Date> {
  let at = parseWhenDeterministic(text, now, tz);
  if (!at && llm) {
    const iso = await llm(text, now, tz).catch(() => null);
    at = iso ? new Date(iso) : null;
  }
  if (!at) throw new WhenError(`I could not tell what time "${text.slice(0, 60)}" means. Try "tomorrow at 10am" or "in 30 minutes".`);
  return checkWhen(at, now);
}

/** "Mon, Oct 12, 10:00 AM PDT" */
export function formatLocal(at: Date, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(at);
}
