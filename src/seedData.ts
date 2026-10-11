import { v5 as uuidv5 } from 'uuid';
import type { CaseEvent, Household, Program } from './contracts.js';
import { DEMO_ORG_ID } from './supabase.js';

export interface SeedHousehold {
  household: Household;
  events: Array<{ event: CaseEvent; at: number }>;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  tag: 'baseline' | 'aid' | 'demo';
  pattern?: string;
}

const DAY = 86_400, HOUR = 3_600, MIN = 60;
const DEFAULT_ROSA_PHONE = '+12135570000';
const FIRST = ['Maria', 'Jose', 'Ana', 'Luis', 'Carmen', 'Juan', 'Sofia', 'Miguel', 'Elena', 'Carlos', 'Lucia', 'David', 'Priya', 'Wei', 'Aisha', 'Tyrone', 'Keisha', 'Hector', 'Nguyen', 'Denise', 'Omar', 'Yolanda', 'Andre', 'Marisol', 'Tamika'];
const PROGRAMS: Program[] = ['calfresh', 'medi_cal', 'calworks'];
const DOCS = ['id', 'paystub', 'lease', 'ssn_card', 'birth_cert'] as const;
const TOOLS = ['screen_household', 'request_docs', 'prepare_packet', 'place_call', 'check_waitlist'];
const FPL_BASE = 15650, FPL_STEP = 5500; // rough annual FPL; only used to derive a plausible pct

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const int = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const pick = <T>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

function makeHousehold(r: Rng, phone: string, firstName: string, over: Partial<Household> = {}): Household {
  const size = int(r, 1, 6);
  return {
    id: uuidv5(phone, uuidv5.URL), orgId: DEMO_ORG_ID, phone, firstName, county: 'los_angeles', size,
    monthlyIncome: int(r, 0, 1800 + size * 450), childrenUnder18: Math.min(size - 1, int(r, 0, 3)),
    pregnant: false, adultAge: int(r, 19, 72), immigrationStatus: 'citizen', childrenAreCitizens: true, ...over,
  };
}

const pctFpl = (h: Household) => Math.round((h.monthlyIncome * 12 * 100) / (FPL_BASE + FPL_STEP * (h.size - 1)));

/** Builder that keeps a cursor, clamps to nowSec and tracks sorted events. */
function timeline(nowSec: number, start: number) {
  const events: SeedHousehold['events'] = [];
  const add = (event: CaseEvent, at: number) => { events.push({ event, at: Math.min(at, nowSec) }); };
  const finish = () => events.sort((a, b) => a.at - b.at);
  return { events, add, finish, start };
}

function intake(add: (e: CaseEvent, at: number) => void, h: Household, source: 'aid' | 'baseline', t: number): void {
  add({ type: 'Source', value: source }, t);
  add({ type: 'County', value: h.county }, t + 1);
  add({ type: 'HouseholdSize', value: h.size }, t + 2);
  add({ type: 'IncomePctFpl', value: pctFpl(h) }, t + 3);
  add({ type: 'Screened', value: 'calfresh,medi_cal' }, t + 4);
}

function cohort(r: Rng, nowSec: number, source: 'aid' | 'baseline', basePhone: number): SeedHousehold[] {
  const out: SeedHousehold[] = [];
  for (let i = 0; i < 60; i++) {
    const phone = `+${basePhone + i}`;
    const h = makeHousehold(r, phone, pick(r, FIRST));
    const screened = nowSec - int(r, 25, 45) * DAY - int(r, 0, 12) * HOUR;
    const { events, add, finish } = timeline(nowSec, screened);
    intake(add, h, source, screened);
    const docsReq = screened + int(r, 5, 40) * MIN;
    add({ type: 'DocsRequested', value: int(r, 2, 4) }, docsReq);
    const prog = pick(r, PROGRAMS);
    const submits = r() >= (source === 'baseline' ? 0.25 : 0.03);
    const submitGap = source === 'aid' ? int(r, 10 * MIN, 6 * HOUR) : int(r, 6, 21) * DAY + int(r, 0, 12) * HOUR;
    if (source === 'aid') {
      add({ type: 'AgentToolCalled', value: pick(r, TOOLS) }, docsReq + 30);
      add({ type: 'AgentTurnMs', value: int(r, 800, 4000) }, docsReq + 31);
    }
    if (submits) {
      const docAt = source === 'aid' ? screened + Math.floor(submitGap / 2) : screened + int(r, 3, 10) * DAY;
      add({ type: 'DocReceived', value: pick(r, DOCS) }, docAt);
      const signAt = screened + submitGap - 5 * MIN;
      add({ type: 'PacketSigned' }, signAt);
      add({ type: 'ApplicationSubmitted', value: prog }, screened + submitGap);
      const interviewAt = screened + submitGap + int(r, 2, 7) * DAY;
      add({ type: 'InterviewScheduled', at: interviewAt }, screened + submitGap + int(r, 1, 3) * HOUR);
      const confirmRate = source === 'aid' ? 0.95 : 0.7;
      if (r() < confirmRate) {
        add({ type: 'InterviewConfirmed' }, interviewAt - int(r, 1, 24) * HOUR);
        if (r() < 0.55) add({ type: 'Approved', value: prog }, interviewAt + int(r, 3, 14) * DAY);
      }
    } else {
      add({ type: 'DocReceived', value: pick(r, DOCS) }, screened + int(r, 3, 10) * DAY);
    }
    if (source === 'aid' && r() < 0.35) {
      const nudgeAt = screened + int(r, 1, 3) * DAY;
      add({ type: 'NudgeSent', value: pick(r, ['docs_nudge', 'interview_nudge'] as const) }, nudgeAt);
      add({ type: 'NudgeVariant', value: pick(r, ['A', 'B']) }, nudgeAt + 1);
      if (r() < 0.7) add({ type: 'UserReplied' }, nudgeAt + int(r, 2, 120) * MIN);
    }
    out.push({ household: h, events: finish(), messages: [], tag: source });
  }
  return out;
}

function demoHouseholds(r: Rng, nowSec: number, rosaPhone: string): SeedHousehold[] {
  const demo = (phone: string, name: string, over: Partial<Household>, pattern: string,
    build: (add: (e: CaseEvent, at: number) => void, h: Household) => void,
    messages: SeedHousehold['messages']): SeedHousehold => {
    const h = makeHousehold(r, phone, name, over);
    const { events, add, finish } = timeline(nowSec, 0);
    build(add, h);
    return { household: h, events: finish(), messages, tag: 'demo', pattern };
  };
  return [
    demo(rosaPhone, 'Rosa', { size: 4, monthlyIncome: 1900, childrenUnder18: 2, adultAge: 34 }, 'interview_unconfirmed', (add, h) => {
      const t = nowSec - 6 * DAY;
      intake(add, h, 'aid', t);
      add({ type: 'ApplicationSubmitted', value: 'calfresh' }, t + 2 * HOUR);
      add({ type: 'InterviewScheduled', at: nowSec + 20 * HOUR }, t + 3 * HOUR);
    }, [
      { role: 'user', content: 'Hi, I need help getting food stamps for my kids' },
      { role: 'assistant', content: 'Hi Rosa, I can help with that. How many people live in your home, and about how much does your household earn each month?' },
      { role: 'user', content: 'Four of us, around $1900 a month' },
      { role: 'assistant', content: 'You likely qualify for CalFresh and Medi-Cal. I submitted your CalFresh application. Your phone interview is tomorrow, please reply YES to confirm.' },
    ]),
    demo('+12135570001', 'James', { size: 2, monthlyIncome: 1100, childrenUnder18: 1, adultAge: 41 }, 'docs_stalled', (add, h) => {
      const t = nowSec - 5 * DAY;
      intake(add, h, 'aid', t);
      add({ type: 'DocsRequested', value: 3 }, nowSec - 4 * DAY);
    }, [
      { role: 'user', content: 'I lost my job last month, can I get Medi-Cal?' },
      { role: 'assistant', content: 'Sorry to hear that, James. You likely qualify. To finish your application I need a photo of your ID, a recent paystub, and your lease.' },
      { role: 'user', content: 'ok I will send them soon' },
    ]),
    demo('+12135570002', 'Lin', { size: 3, monthlyIncome: 2300, childrenUnder18: 1, adultAge: 29 }, 'signed_not_submitted', (add, h) => {
      const t = nowSec - 3 * DAY;
      intake(add, h, 'aid', t);
      add({ type: 'DocsRequested', value: 2 }, t + 10 * MIN);
      add({ type: 'DocReceived', value: 'id' }, t + 1 * DAY);
      add({ type: 'DocReceived', value: 'paystub' }, t + 1 * DAY + HOUR);
      add({ type: 'PacketSigned' }, nowSec - 2 * DAY);
    }, [
      { role: 'user', content: 'I uploaded my ID and paystub' },
      { role: 'assistant', content: 'Thanks Lin, got both. Your packet is ready to sign.' },
      { role: 'user', content: 'Signed it!' },
      { role: 'assistant', content: 'Great, you are all set to submit. I will send it in next.' },
    ]),
    demo('+12135570003', 'Marcus', { size: 1, monthlyIncome: 400, childrenUnder18: 0, adultAge: 52 }, 'waitlist_closed', (add, h) => {
      const t = nowSec - 12 * DAY;
      intake(add, h, 'aid', t);
      add({ type: 'CallPlaced', value: 'waitlist_check' }, nowSec - 8 * DAY);
      add({ type: 'CallOutcome', value: 'waitlist_closed' }, nowSec - 8 * DAY + 10 * MIN);
      add({ type: 'WaitlistStatus', value: 'closed' }, nowSec - 8 * DAY + 11 * MIN);
    }, [
      { role: 'user', content: 'Is the Section 8 waitlist open in LA?' },
      { role: 'assistant', content: 'Let me call the housing office and check for you.' },
      { role: 'assistant', content: 'Marcus, the waitlist is closed right now. I will keep checking and text you when it opens.' },
    ]),
  ];
}

export function generateSeed(opts: { nowSec: number; rng?: () => number; demoPhone?: string }): SeedHousehold[] {
  const r = opts.rng ?? mulberry32(42);
  return [
    ...cohort(r, opts.nowSec, 'baseline', 12135551000),
    ...cohort(r, opts.nowSec, 'aid', 12135561000),
    ...demoHouseholds(r, opts.nowSec, opts.demoPhone ?? DEFAULT_ROSA_PHONE),
  ];
}
