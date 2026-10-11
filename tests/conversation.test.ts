import { beforeEach, describe, expect, it } from 'vitest';
import type { CaseEvent, Household } from '../src/contracts.js';
import type { AgentTurn } from '../src/agent.js';
import { createConversation, MAX_WEB_CONFIRMS_PER_PHONE } from '../src/conversation.js';
import { householdId, type IntakeFields } from '../src/intake.js';
import { memoryIntakeRepo } from '../src/intakeStore.js';

const PHONE = '+12135550100';
const HID = householdId(PHONE);
const full: IntakeFields = {
  firstName: 'Maria', county: 'los_angeles', size: 3, monthlyIncome: 1850, childrenUnder18: 2, pregnant: false,
  adultAge: 31, immigrationStatus: 'citizen', childrenAreCitizens: true,
};

// The fake agent runs whatever script the test sets, using the same tools the real one gets.
type Script = (t: AgentTurn) => Promise<string>;

function setup() {
  const repo = memoryIntakeRepo();
  const texts: { to: string; body: string }[] = [];
  const households = new Map<string, Household>();
  const events: { hid: string; e: CaseEvent }[] = [];
  const turns: AgentTurn[] = [];
  let clock = new Date('2026-10-11T19:00:00Z');
  let script: Script = async () => 'ok';
  const conv = createConversation({
    repo, orgId: 'org-1',
    sendText: async (to, body) => { texts.push({ to, body }); },
    runAgent: async t => { turns.push(t); return script(t); },
    extractFromCall: async () => ({ fields: full, notes: '' }),
    getHousehold: async id => households.get(id),
    upsertHousehold: async h => { households.set(h.id, h); },
    logEvents: async (hid, es) => { for (const e of es) events.push({ hid, e }); },
    mirrorMessage: async () => {},
    addTimeline: async () => {},
    now: () => clock,
  });
  return {
    conv, repo, texts, households, events, turns,
    setScript: (s: Script) => { script = s; },
    tick: (ms: number) => { clock = new Date(clock.getTime() + ms); },
  };
}

let t: ReturnType<typeof setup>;
beforeEach(() => { t = setup(); });

describe('text (Dial SMS)', () => {
  it('saves answers to the intake but not the household until they reply YES', async () => {
    t.setScript(async turn => { await turn.tools.saveAnswers(full); return await turn.tools.sendConfirmationText(); });
    await t.conv.handleSms('(213) 555-0100', 'hi I need food help, 3 of us, 1850 a month…');
    expect(t.households.size).toBe(0);
    expect(t.texts.some(x => /Reply YES/.test(x.body))).toBe(true);
    expect((await t.repo.get(HID))?.status).toBe('awaiting_confirmation');

    t.setScript(async turn => { await turn.tools.checkEligibility(); return 'You likely qualify for CalFresh.'; });
    await t.conv.handleSms(PHONE, 'YES');
    expect(t.households.get(HID)).toMatchObject({ phone: PHONE, size: 3, monthlyIncome: 1850, orgId: 'org-1' });
    expect(t.events.map(x => x.e.type)).toEqual(expect.arrayContaining(['Source', 'County', 'IncomePctFpl', 'Screened']));
    expect(t.texts.at(-1)?.body).toBe('You likely qualify for CalFresh.');
    expect(t.turns.at(-1)?.state).toMatch(/confirmed their info by text/);
  });

  it('a question while waiting does not cancel the pending confirmation', async () => {
    t.setScript(async turn => { await turn.tools.saveAnswers(full); return await turn.tools.sendConfirmationText(); });
    await t.conv.handleSms(PHONE, 'answers…');
    t.setScript(async () => 'It is Lumin, the benefits helper.');
    await t.conv.handleSms(PHONE, 'who is this?');
    t.setScript(async () => 'Great.');
    await t.conv.handleSms(PHONE, 'yes');
    expect(t.households.has(HID)).toBe(true);
  });

  it('eligibility refuses to run on unconfirmed answers', async () => {
    let result = '';
    t.setScript(async turn => { await turn.tools.saveAnswers(full); result = await turn.tools.checkEligibility(); return 'x'; });
    await t.conv.handleSms(PHONE, 'hi');
    expect(result).toMatch(/not confirmed/);
  });

  it('screens partial answers without confirmation, then updates matches when an answer changes', async () => {
    let result: any;
    t.setScript(async turn => {
      await turn.tools.saveAnswers({ county: 'los_angeles', pregnant: true, wicIncomeEligibleViaProgram: true });
      result = JSON.parse(await turn.tools.screenApplications());
      return 'WIC may fit.';
    });
    const { sessionId } = t.conv.createWebSession();
    const first = await t.conv.handleWeb(sessionId, 'I am pregnant and receive qualifying assistance');
    expect(result.matches.find((m: any) => m.program === 'wic').status).toBe('likely');
    expect(first.view.screening.matches.find(m => m.program === 'wic')?.status).toBe('likely');
    expect(t.households.size).toBe(0);
    expect(t.texts).toHaveLength(0);
    t.setScript(async turn => {
      await turn.tools.saveAnswers({ pregnant: false, childrenUnder5: 0, breastfeedingInfantUnder12Months: false, pregnancyEndedWithin6Months: false });
      return 'Updated.';
    });
    const second = await t.conv.handleWeb(sessionId, 'Correct those answers');
    expect(second.view.screening.matches.find(m => m.program === 'wic')?.status).toBe('not_eligible');
  });

  it('retains supplemental fields after confirmation and blocks stale confirmed results after edits', async () => {
    t.setScript(async turn => {
      await turn.tools.saveAnswers({ ...full, childrenUnder5: 1, wicIncomeEligibleViaProgram: true });
      return turn.tools.sendConfirmationText();
    });
    await t.conv.handleSms(PHONE, 'answers');
    t.setScript(async turn => turn.tools.checkEligibility());
    await t.conv.handleSms(PHONE, 'yes');
    const result = JSON.parse(t.texts.at(-1)!.body);
    expect(result.matches.find((m: any) => m.program === 'wic').status).toBe('likely');
    expect((await t.repo.get(HID))?.fields.childrenUnder5).toBe(1);
    t.setScript(async turn => { await turn.tools.saveAnswers({ monthlyIncome: 9000 }); return turn.tools.checkEligibility(); });
    await t.conv.handleSms(PHONE, 'my income changed');
    expect(t.texts.at(-1)?.body).toContain('not confirmed');
  });

  it('refuses an inconsistent update without damaging prior answers', async () => {
    t.setScript(async turn => { await turn.tools.saveAnswers(full); return turn.tools.saveAnswers({ childrenUnder5: 5 }); });
    await t.conv.handleSms(PHONE, 'five children under five');
    expect(t.texts.at(-1)?.body).toContain('Not saved');
    expect((await t.repo.get(HID))?.fields.childrenUnder5).toBeUndefined();
  });

  it('does not reply to STOP', async () => {
    expect(await t.conv.handleSms(PHONE, 'STOP')).toBeNull();
    expect(t.texts).toHaveLength(0);
  });

  it('a changed answer after confirming needs a new YES', async () => {
    t.setScript(async turn => { await turn.tools.saveAnswers(full); return await turn.tools.sendConfirmationText(); });
    await t.conv.handleSms(PHONE, 'answers');
    await t.conv.handleSms(PHONE, 'yes');
    t.tick(120_000);
    t.setScript(async turn => { await turn.tools.saveAnswers({ monthlyIncome: 2400 }); return await turn.tools.sendConfirmationText(); });
    await t.conv.handleSms(PHONE, 'actually I make 2400 now');
    expect(t.households.get(HID)?.monthlyIncome).toBe(1850);
    await t.conv.handleSms(PHONE, 'yes');
    expect(t.households.get(HID)?.monthlyIncome).toBe(2400);
  });
});

describe('web chat', () => {
  async function webIntakeReady(sessionId: string) {
    t.setScript(async turn => { await turn.tools.saveAnswers(full, '213-555-0100'); return await turn.tools.sendConfirmationText(); });
    return t.conv.handleWeb(sessionId, 'my answers… my number is 213-555-0100');
  }

  it('confirms by text, then the chat and the text thread share one case', async () => {
    const { sessionId } = t.conv.createWebSession();
    const first = await webIntakeReady(sessionId);
    expect(first.view.linked).toBe(false);
    expect(t.texts[0]).toMatchObject({ to: PHONE });
    expect(t.texts[0].body).toMatch(/website/);

    t.setScript(async () => 'Confirmed! You likely qualify for CalFresh.');
    await t.conv.handleSms(PHONE, 'Yes');
    expect(t.households.has(HID)).toBe(true);

    const view = await t.conv.webView(sessionId);
    expect(view.linked).toBe(true);
    expect(view.status).toBe('confirmed');
    // the chat now shows the web messages AND the text replies
    expect(view.messages.map(m => m.channel)).toEqual(expect.arrayContaining(['web', 'sms']));
    expect(view.messages.at(-1)?.content).toMatch(/CalFresh/);

    // and a follow-up in the chat sees the text history too
    t.setScript(async () => 'Sure.');
    await t.conv.handleWeb(sessionId, 'what documents do I need?');
    expect(t.turns.at(-1)?.history.some(m => m.channel === 'sms')).toBe(true);
  });

  it('a web visitor never sees an existing case before the phone owner confirms', async () => {
    t.households.set(HID, { id: HID, orgId: 'org-1', phone: PHONE, ...full, firstName: 'Owner' } as Household);
    await t.repo.appendMessage(HID, 'sms', 'user', 'private message from the real owner');
    const { sessionId } = t.conv.createWebSession();
    await webIntakeReady(sessionId);
    const view = await t.conv.webView(sessionId);
    expect(view.linked).toBe(false);
    expect(JSON.stringify(view)).not.toMatch(/private message|Owner/);
    expect(JSON.stringify(t.turns.at(-1))).not.toMatch(/private message|Owner/);
  });

  it('NO from the phone owner rejects the web intake and closes the chat', async () => {
    const { sessionId } = t.conv.createWebSession();
    await webIntakeReady(sessionId);
    await t.conv.handleSms(PHONE, 'not me');
    expect(t.households.size).toBe(0);
    const again = await t.conv.handleWeb(sessionId, 'hello?');
    expect(again.reply).toMatch(/closed/);
  });

  it('corrections by text carry the web answers over without linking the web session', async () => {
    const { sessionId } = t.conv.createWebSession();
    await webIntakeReady(sessionId);
    t.setScript(async turn => { await turn.tools.saveAnswers({ size: 4 }); return 'Updated.'; });
    await t.conv.handleSms(PHONE, 'there are 4 of us');
    expect((await t.repo.get(HID))?.fields).toMatchObject({ size: 4, monthlyIncome: 1850 });
    expect((await t.conv.webView(sessionId)).linked).toBe(false);
  });

  it('limits confirmation texts so the chat cannot be used to spam a phone', async () => {
    for (let n = 0; n < MAX_WEB_CONFIRMS_PER_PHONE; n++) await webIntakeReady(t.conv.createWebSession().sessionId);
    const sent = t.texts.length;
    await webIntakeReady(t.conv.createWebSession().sessionId);
    expect(t.texts.length).toBe(sent);
  });

  it('rejects a bad phone number', async () => {
    let out = '';
    t.setScript(async turn => { out = await turn.tools.saveAnswers({}, '555'); return 'x'; });
    await t.conv.handleWeb(t.conv.createWebSession().sessionId, 'my number is 555');
    expect(out).toMatch(/not a valid/);
  });
});

describe('phone call (Dial voice agent)', () => {
  it('pulls answers from the transcript and texts a summary to confirm', async () => {
    await t.conv.handleInboundCall(PHONE, 'agent: hi… user: I am Maria, LA county, 3 of us…');
    expect(t.texts).toHaveLength(1);
    expect(t.texts[0].body).toMatch(/thanks for calling/);
    t.setScript(async () => 'Thanks!');
    await t.conv.handleSms(PHONE, 'yes');
    expect(t.households.get(HID)).toMatchObject({ firstName: 'Maria', size: 3 });
  });

  it('does not text someone who hung up without talking', async () => {
    await t.conv.handleInboundCall(PHONE, '   ');
    expect(t.texts).toHaveLength(0);
  });
});
