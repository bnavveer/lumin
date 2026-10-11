import type { Program } from './contracts.js';

// Deterministic county-email classifier: keyword/regex rules plus date/time parsing. No LLM.
export type EmailCategory =
  | 'interview_scheduled' | 'documents_requested' | 'approved' | 'denied' | 'renewal_due' | 'other';

export interface Extracted {
  at?: number;          // unix seconds (interview / renewal date)
  atIso?: string;
  docs?: string[];
  deadlineIso?: string;
  program?: Program;
  reason?: string;
}
export interface Classification { category: EmailCategory; extracted: Extracted }

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
  'october', 'november', 'december'];
const TZ = 'America/Los_Angeles';

function tzOffsetMs(utcMs: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
    }).formatToParts(new Date(utcMs)).map((x) => [x.type, Number(x.value)]),
  ) as Record<string, number>;
  return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!) - Math.floor(utcMs / 60000) * 60000;
}

/** Wall-clock Pacific time to unix seconds (handles DST). */
export function pacificToUnix(y: number, mo: number, d: number, h = 9, mi = 0): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let ms = guess - tzOffsetMs(guess);
  ms = guess - tzOffsetMs(ms);
  return Math.floor(ms / 1000);
}

const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const NAMED_DATE = new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, 'i');
const NUM_DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/;
const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\b\.?/i;

interface YMD { y: number; m: number; d: number; index: number }

function findDate(text: string, now: Date, from = 0): YMD | undefined {
  const s = text.slice(from);
  const named = NAMED_DATE.exec(s);
  const num = NUM_DATE.exec(s);
  const pick = [named, num].filter((x): x is RegExpExecArray => !!x).sort((a, b) => a.index - b.index)[0];
  if (!pick) return undefined;
  if (pick === named) {
    const m = MONTHS.findIndex((n) => n.startsWith(pick[1]!.toLowerCase().slice(0, 3))) + 1;
    let y = pick[3] ? Number(pick[3]) : now.getUTCFullYear();
    if (!pick[3] && Date.UTC(y, m - 1, Number(pick[2])) < now.getTime() - 86_400_000) y += 1;
    return { y, m, d: Number(pick[2]), index: from + pick.index };
  }
  const y = Number(pick[3]);
  return { y: y < 100 ? 2000 + y : y, m: Number(pick[1]), d: Number(pick[2]), index: from + pick.index };
}

function findTime(text: string, from: number): { h: number; mi: number } | undefined {
  const near = TIME_RE.exec(text.slice(from, from + 80)) ?? TIME_RE.exec(text);
  if (!near) return undefined;
  let h = Number(near[1]) % 12;
  if (near[3]!.toLowerCase() === 'p') h += 12;
  return { h, mi: Number(near[2] ?? 0) };
}

function whenOf(text: string, now: Date): { at: number; atIso: string } | undefined {
  const d = findDate(text, now);
  if (!d || d.m < 1 || d.m > 12 || d.d < 1 || d.d > 31) return undefined;
  const t = findTime(text, d.index) ?? { h: 9, mi: 0 };
  const at = pacificToUnix(d.y, d.m, d.d, t.h, t.mi);
  return { at, atIso: new Date(at * 1000).toISOString() };
}

const DOC_PATTERNS: Array<[RegExp, string]> = [
  [/pay\s?stubs?|paychecks?|proof of income|wage statements?/i, 'pay stubs'],
  [/\b(photo )?id\b|driver'?s licen[sc]e|identification/i, 'photo ID'],
  [/\blease\b|rent receipt|proof of (residency|address|rent)|utility bill/i, 'proof of address'],
  [/bank statements?/i, 'bank statements'],
  [/social security (card|number)|\bssn\b/i, 'Social Security card'],
  [/birth certificates?/i, 'birth certificates'],
  [/immigration|green card|permanent resident|work permit/i, 'immigration documents'],
  [/child ?care|dependent care/i, 'child care costs'],
  [/medical (bills|expenses)/i, 'medical expenses'],
];

function docsFrom(text: string): string[] {
  const found = DOC_PATTERNS.filter(([re]) => re.test(text)).map(([, label]) => label);
  return [...new Set(found)];
}

const PROGRAM_PATTERNS: Array<[RegExp, Program]> = [
  [/medi-?cal/i, 'medi_cal'],
  [/calworks/i, 'calworks'],
  [/general relief/i, 'general_relief'],
  [/\bcfap\b/i, 'cfap'],
  [/section 8|housing choice/i, 'section8'],
  [/calfresh|food stamps|\bsnap\b/i, 'calfresh'],
];

function programFrom(text: string): Program | undefined {
  return PROGRAM_PATTERNS.find(([re]) => re.test(text))?.[1];
}

const RE = {
  denied: /\b(denied|denial|not eligible|ineligible|unable to approve|regret to inform|discontinu\w+|terminat\w+)\b/i,
  approved: /\b(approved|approval|you (?:are|have been) (?:found )?eligible|benefits (?:will )?(?:begin|start)|has been granted)\b/i,
  renewal: /\b(renew\w*|recertif\w+|redetermination|annual review|periodic report)\b/i,
  interview: /\binterview\b/i,
  docs: /\b(please (?:provide|submit|bring|send|upload)|documents? (?:are |is )?(?:needed|required|requested)|verification|missing (?:information|documents?)|proof of)\b/i,
};

export function classifyCountyEmail(
  email: { subject?: string; text?: string; from?: string },
  now: Date = new Date(),
): Classification {
  const subject = email.subject ?? '';
  const body = (email.text ?? '').replace(/\r/g, '');
  const all = `${subject}\n${body}`;
  const program = programFrom(all);
  const withProgram = (e: Extracted): Extracted => (program ? { ...e, program } : e);

  // Subject is the strongest signal; fall back to body in a fixed precedence.
  const test = (re: RegExp): boolean => re.test(subject) || re.test(body);
  const subjectFirst = (): EmailCategory | undefined => {
    if (RE.denied.test(subject)) return 'denied';
    if (RE.approved.test(subject)) return 'approved';
    if (RE.renewal.test(subject)) return 'renewal_due';
    if (RE.interview.test(subject)) return 'interview_scheduled';
    if (RE.docs.test(subject) || /documents?|verification/i.test(subject)) return 'documents_requested';
    return undefined;
  };
  const category: EmailCategory = subjectFirst()
    ?? (test(RE.denied) ? 'denied'
      : test(RE.approved) ? 'approved'
        : test(RE.renewal) ? 'renewal_due'
          : test(RE.interview) && whenOf(all, now) ? 'interview_scheduled'
            : test(RE.docs) ? 'documents_requested'
              : 'other');

  switch (category) {
    case 'interview_scheduled':
    case 'renewal_due': {
      const w = whenOf(all, now);
      return { category, extracted: withProgram(w ?? {}) };
    }
    case 'documents_requested': {
      const dlAt = body.search(/\b(?:by|before|no later than)\s/i);
      const dl = dlAt >= 0 ? findDate(body, now, dlAt) : undefined;
      const docs = docsFrom(all);
      return {
        category,
        extracted: withProgram({
          docs,
          ...(dl ? { deadlineIso: new Date(pacificToUnix(dl.y, dl.m, dl.d, 17, 0) * 1000).toISOString() } : {}),
        }),
      };
    }
    case 'denied': {
      const reason = /(?:because|reason:?|due to)\s+([^.\n]{3,160})/i.exec(all)?.[1]?.trim();
      return { category, extracted: withProgram(reason ? { reason } : {}) };
    }
    case 'approved':
      return { category, extracted: withProgram({}) };
    default:
      return { category: 'other', extracted: {} };
  }
}
