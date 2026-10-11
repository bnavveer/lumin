import { describe, expect, it } from 'vitest';
import type { CallScript } from '../shared/calls.js';
import { createCallsRuntime, type CallsDeps } from '../src/calls/runtime.js';
import { createScheduler, memoryScheduledRepo, ScheduleCallInput } from '../src/calls/schedule.js';
import { memoryCallRepo } from '../src/calls/store.js';
import { parseWhen, parseWhenDeterministic, formatLocal } from '../src/calls/when.js';
import type { Household } from '../src/contracts.js';
import { memoryWorkflowRepo } from '../src/workflow/store.js';

const TZ = 'America/Los_Angeles';
// Sunday Oct 11 2026, 9:00 AM PDT (UTC-7)
const NOW = new Date('2026-10-11T16:00:00Z');
const OFFICE = '+13462874886';
const HID = '11111111-1111-4111-8111-111111111111';
const household = { id: HID, orgId: 'org', phone: '+12135550100', firstName: 'Maria', county: 'los_angeles' } as Household;

describe('parseWhen', () => {
  it('handles now, relative, tomorrow and weekday phrasings in LA time', async () => {
    expect((await parseWhen('now', NOW, TZ)).toISOString()).toBe(NOW.toISOString());
    expect((await parseWhen('Call now', NOW, TZ).catch(() => null))).toBeNull(); // not a time phrase; no LLM here
    expect((await parseWhen('in 5 minutes', NOW, TZ)).toISOString()).toBe('2026-10-11T16:05:00.000Z');
    expect((await parseWhen('in 2 hours', NOW, TZ)).toISOString()).toBe('2026-10-11T18:00:00.000Z');
    expect((await parseWhen('tomorrow at 10am', NOW, TZ)).toISOString()).toBe('2026-10-12T17:00:00.000Z');
    expect((await parseWhen('tomorrow 10:30 am', NOW, TZ)).toISOString()).toBe('2026-10-12T17:30:00.000Z');
    expect((await parseWhen('Thursday 2pm', NOW, TZ)).toISOString()).toBe('2026-10-15T21:00:00.000Z');
    expect((await parseWhen('at 3', NOW, TZ)).toISOString()).toBe('2026-10-11T22:00:00.000Z');
    expect((await parseWhen('8am', NOW, TZ)).toISOString()).toBe('2026-10-12T15:00:00.000Z'); // already past today -> tomorrow
    expect(formatLocal(new Date('2026-10-12T17:00:00Z'), TZ)).toMatch(/Mon, Oct 12, 10:00\sAM PDT/);
  });

  it('rejects past times and times more than 30 days out', async () => {
    await expect(parseWhen('today at 8am', NOW, TZ)).rejects.toThrow(/past/);
    await expect(parseWhen('2026-10-10T10:00:00Z', NOW, TZ)).rejects.toThrow(/past/);
    await expect(parseWhen('in 40 days', NOW, TZ)).rejects.toThrow(/30 days/);
  });

  it('falls back to the LLM only for phrasings it does not know', async () => {
    expect(parseWhenDeterministic('the 14th after lunch', NOW, TZ)).toBeNull();
    const at = await parseWhen('the 14th after lunch', NOW, TZ, async () => '2026-10-14T13:00:00-07:00');
    expect(at.toISOString()).toBe('2026-10-14T20:00:00.000Z');
  });
});

function setup() {
  const callRepo = memoryCallRepo();
  const dialed: string[] = [];
  const texts: string[] = [];
  const events: string[] = [];
  const timeline: string[] = [];
  const chat: string[] = [];
  const deps: CallsDeps = {
    repo: callRepo, workflows: memoryWorkflowRepo(),
    households: { get: async id => (id === HID ? household : undefined) },
    dial: {
      configured: () => true, officePhone: () => OFFICE,
      placeCall: async c => { dialed.push(c.to); return 'dial-1'; },
      getCall: async () => ({ done: true, transcript: 'Aid: Did you get the pay stub?\nCounty: Yes, on Oct 9.' }),
      sendText: async (_to, body) => { texts.push(body); return 'm1'; },
    },
    simulate: () => false, autoCallOnEmail: () => false,
    llm: {
      suggest: async () => ({ goal: 'g', questions: ['q'] }),
      extract: async (s: CallScript) => ({ answers: [{ question: s.questions[0]!, answer: 'Yes, received Oct 9.', confidence: 'high' as const }], summary: 'They got the pay stub on Oct 9.', outcome: 'info' as const }),
      simulateCounty: async () => '',
    },
    latestWorkflowFor: async () => undefined,
    log: async (_h, e) => { events.push(`${e.type}:${'value' in e ? String(e.value) : ''}`); },
    timeline: async () => undefined, publish: async () => undefined, sleep: async () => undefined,
    poll: { intervalMs: 1, timeoutMs: 10 },
  };
  const rt = createCallsRuntime(deps);
  const repo = memoryScheduledRepo();
  let now = NOW;
  const s = createScheduler({
    repo, callsEnabled: () => true,
    startCall: (input, onDone) => rt.startScriptedCall(input, onDone),
    latestWorkflowId: async () => null,
    log: async (_h, e) => { events.push(`${e.type}:${'value' in e ? String(e.value) : ''}`); },
    timeline: async (_h, l) => { timeline.push(l); },
    notifyChat: async (_h, t) => { chat.push(t); },
    publish: async () => undefined,
    now: () => now, tz: TZ,
  });
  return { s, rt, repo, callRepo, dialed, texts, events, timeline, chat, setNow: (d: Date) => { now = d; } };
}

describe('scheduleCall', () => {
  it('places an immediate call to the office only, then reports answers in chat and by text', async () => {
    const t = setup();
    const { row, immediate } = await t.s.scheduleCall({ householdId: HID, when: 'now', questions: ['Did you get my pay stub?'], source: 'chat' });
    expect(immediate).toBe(true);
    await t.rt.idle();
    expect(t.dialed).toEqual([OFFICE]);
    const final = await t.repo.get(row.id);
    expect(final?.status).toBe('done');
    expect(final?.callId).toBeTruthy();
    expect(t.chat[0]).toMatch(/Did you get my pay stub\? Yes, received Oct 9/);
    expect(t.texts[0]).toMatch(/pay stub/);
    expect(t.events).toContain('AgentToolCalled:call_scheduled');
    expect(t.timeline[0]).toMatch(/^Call scheduled for Sun, Oct 11/);
  });

  it('stores a later call without dialing, and the loop runs only due rows exactly once', async () => {
    const t = setup();
    const later = await t.s.scheduleCall({ householdId: HID, when: 'tomorrow at 10am', questions: ['When is my interview?'], source: 'sms' });
    const soon = await t.s.scheduleCall({ householdId: HID, when: 'in 5 minutes', questions: ['Can I do the interview by phone?'], source: 'chat' });
    expect(later.immediate).toBe(false);
    expect(t.dialed).toEqual([]);
    expect((await t.s.runDueScheduledCalls())).toEqual([]); // nothing due yet
    t.setNow(new Date(NOW.getTime() + 6 * 60_000));
    const [a, b] = await Promise.all([t.s.runDueScheduledCalls(), t.s.runDueScheduledCalls()]);
    expect([...a, ...b].map(r => r.id)).toEqual([soon.row.id]);
    await t.rt.idle();
    expect(await t.s.runDueScheduledCalls()).toEqual([]); // never double-runs
    expect(t.dialed).toEqual([OFFICE]);
    expect((await t.repo.get(later.row.id))?.status).toBe('scheduled');
    expect((await t.repo.get(soon.row.id))?.status).toBe('done');
  });

  it('cancels a scheduled call and refuses to cancel twice', async () => {
    const t = setup();
    const { row } = await t.s.scheduleCall({ householdId: HID, when: 'tomorrow at 10am', questions: ['When is my interview?'], source: 'web' });
    expect((await t.s.cancel(row.id)).status).toBe('canceled');
    await expect(t.s.cancel(row.id)).rejects.toThrow(/already/);
    t.setNow(new Date(NOW.getTime() + 2 * 86_400_000));
    expect(await t.s.runDueScheduledCalls()).toEqual([]);
    expect(t.dialed).toEqual([]);
  });

  it('the chat tool validates input and explains bad times', async () => {
    expect(ScheduleCallInput.safeParse({ when: 'now', questions: [] }).success).toBe(false);
    expect(ScheduleCallInput.safeParse({ when: 'now', questions: Array(7).fill('Is it open?') }).success).toBe(false);
    expect(ScheduleCallInput.safeParse({ when: '', questions: ['Is it open?'] }).success).toBe(false);
    const t = setup();
    expect(await t.s.scheduleFromChat(HID, { when: 'now', questions: [] }, 'chat')).toMatch(/^Not scheduled/);
    expect(await t.s.scheduleFromChat(HID, { when: 'yesterday at 2pm', questions: ['Is it open?'] }, 'chat')).toMatch(/^Not scheduled/);
    const ok = await t.s.scheduleFromChat(HID, { when: 'tomorrow at 10am', questions: ['When is my interview?'] }, 'chat');
    expect(ok).toMatch(/Scheduled for Mon, Oct 12, 10:00\sAM PDT.*When is my interview\?/);
    expect(t.dialed).toEqual([]);
  });
});
