import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaseEvent } from '../src/contracts.js';
import { setConversationDeps, type AgentArgs, type ConversationDeps } from '../src/caseManager/deps.js';
import { clearTranslationCache, handleIncomingMessage, householdIdFor, proactiveMessage } from '../src/caseManager/engine.js';
import { parseIntent } from '../src/caseManager/intents.js';
import { approvalText } from '../src/caseManager/approvals.js';
import { registerConversationRoutes } from '../src/caseManager/routes.js';
import { Hono } from 'hono';
import { memoryRepo } from '../src/caseManager/state.js';

const ORG = { id: '00000000-0000-4000-8000-00000000a1d0', name: 'Test Clinic', code: 'AID' };
const OTHER = { id: '00000000-0000-4000-8000-0000000000b2', name: 'Eastside Clinic', code: 'EAST' };
const PHONE = '+12135550123';

type Fake = ReturnType<typeof makeDeps>;
function makeDeps(agent?: (a: AgentArgs) => Promise<string>) {
  const repo = memoryRepo([ORG, OTHER]);
  const events: CaseEvent[] = [];
  const deps: ConversationDeps = {
    repo,
    logEvent: vi.fn(async (_h: string, e: CaseEvent) => { events.push(e); }),
    storeDocument: vi.fn(async () => ({ id: 'doc-1' })),
    startExtraction: vi.fn(async () => ({ status: 'reading' })),
    pollExtraction: vi.fn(async () => ({ status: 'read', docType: 'paystub' })),
    vaultSummary: vi.fn(async () => 'We have your ID.'),
    missingDocs: vi.fn(async () => ['paystub' as const]),
    requestDocument: vi.fn(async () => {}),
    translate: vi.fn(async (t: string, lang: string) => `[${lang}] ${t}`),
    detectLanguage: vi.fn(async () => 'en'),
    runAgent: vi.fn(agent ?? (async () => 'Hi from the agent.')),
    packetUrl: (hid: string) => `https://aid.test/p/${hid}?t=x`,
    placeOfficeCall: vi.fn(async () => {}),
    answerQuestion: vi.fn(async () => 'Bring your ID.'),
    findResources: vi.fn(async () => []),
    nudgeText: vi.fn(async (kind: string, name: string) => ({ variantId: `${kind}_v`, text: `Hi ${name}, reply 1 to confirm or 2 to reschedule.` })),
    now: () => new Date('2026-10-11T19:00:00Z'), // noon in LA
  };
  setConversationDeps(deps);
  return { deps, repo, events };
}

const send = async (text: string, extra: Partial<Parameters<typeof handleIncomingMessage>[0]> = {}) =>
  (await handleIncomingMessage({ channel: 'sim', from: PHONE, text, ...extra })).map((m) => m.text);

async function onboard(f: Fake, screened = true): Promise<string> {
  await send('hi');
  await send('YES');
  const hid = householdIdFor(PHONE);
  if (screened) {
    const s = (await f.repo.getState(hid))!;
    await f.repo.saveState({ ...s, stage: 'active', pendingContext: { screened: true } });
  }
  return hid;
}

beforeEach(() => { clearTranslationCache(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { setConversationDeps(); vi.restoreAllMocks(); });

describe('parseIntent', () => {
  it('understands English and Spanish keywords', () => {
    expect(parseIntent(' stop ').kind).toBe('stop');
    expect(parseIntent('ALTO').kind).toBe('stop');
    expect(parseIntent('Sí!').kind).toBe('yes');
    expect(parseIntent('ayuda').kind).toBe('help');
    expect(parseIntent('join east')).toEqual({ kind: 'join', code: 'EAST' });
    expect(parseIntent('LANG es')).toEqual({ kind: 'lang', lang: 'es' });
    expect(parseIntent('2')).toEqual({ kind: 'digit', value: '2' });
    expect(parseIntent('what is calfresh').kind).toBe('none');
  });
});

describe('STOP / START / HELP compliance', () => {
  it('after STOP nothing but START gets a reply, and the LLM is never called', async () => {
    const f = makeDeps();
    await onboard(f);
    expect((await send('STOP'))[0]).toMatch(/unsubscribed/);
    expect(await send('hello')).toEqual([]);
    expect(await send('YES')).toEqual([]);
    expect(await send('HELP')).toEqual([]);
    expect(f.deps.runAgent).not.toHaveBeenCalled();
    expect((await send('STOP'))[0]).toMatch(/unsubscribed/);
    expect((await send('START'))[0]).toMatch(/subscribed again/);
    expect((await f.repo.getState(householdIdFor(PHONE)))!.stage).toBe('active');
    expect(f.repo.consents.map((c) => c.kind)).toEqual(['sms_contact', 'opt_out', 'opt_in']);
  });
  it('HELP returns the menu with opt-out instructions', async () => {
    makeDeps();
    await send('hi');
    expect((await send('help'))[0]).toMatch(/STOP to opt out/);
  });
});

describe('JOIN + consent gate', () => {
  it('creates the household for the clinic code and blocks everything until YES', async () => {
    const f = makeDeps();
    const r = await send('JOIN EAST');
    expect(r[0]).toMatch(/Eastside Clinic.*Reply YES/);
    const hid = householdIdFor(PHONE);
    expect(f.repo.households.get(hid)!.orgId).toBe(OTHER.id);
    expect((await send('how much is calfresh?'))[0]).toMatch(/needs your OK first/);
    expect((await send('STATUS'))[0]).toMatch(/needs your OK first/);
    expect(f.deps.runAgent).not.toHaveBeenCalled();
    expect((await send('yes'))[0]).toMatch(/all set/);
    expect(f.repo.consents[0]).toMatchObject({ kind: 'sms_contact', reply: 'yes' });
    expect(f.repo.consents[0]!.wording).toMatch(/Msg&data rates may apply/);
    expect((await f.repo.getState(hid))!.stage).toBe('screening');
  });
  it('defaults first contact to the AID clinic', async () => {
    const f = makeDeps();
    expect((await send('hello there'))[0]).toMatch(/Test Clinic/);
    expect(f.repo.households.get(householdIdFor(PHONE))!.orgId).toBe(ORG.id);
  });
});

describe('approvals', () => {
  it('a proposal from the agent never executes without YES', async () => {
    const f = makeDeps(async ({ tools }) => {
      await (tools.propose_action as { execute: (a: unknown, o: unknown) => Promise<unknown> })
        .execute({ kind: 'submit_application', description: "I'm ready to submit your CalFresh application.", programs: ['calfresh'] }, {});
      return 'Shall I submit it?';
    });
    const hid = await onboard(f);
    const r = await send('please apply for me');
    expect(r.join(' ')).toMatch(/I'm ready to submit your CalFresh application\..*Reply YES/);
    expect(f.repo.approvals).toHaveLength(1);
    expect(f.repo.approvals[0]!.status).toBe('pending');
    expect(r.join(' ')).not.toMatch(/aid\.test\/p/);
    expect((await f.repo.getTimeline(hid)).some((t) => /Approved/.test(t.label))).toBe(false);

    const yes = await send('YES');
    expect(f.repo.approvals[0]!.status).toBe('approved');
    expect(yes[0]).toMatch(/sign here.*aid\.test\/p\//);
    expect(yes[0]).toMatch(/legal signature/);
  });
  it('YES resolves only the latest pending approval; NO declines', async () => {
    const f = makeDeps();
    const hid = await onboard(f);
    await f.repo.createApproval(hid, 'share_documents', 'old', {});
    await f.repo.createApproval(hid, 'start_renewal', 'newer', {});
    await send('SI');
    expect(f.repo.approvals.map((a) => a.status)).toEqual(['pending', 'approved']);
    await send('no');
    expect(f.repo.approvals.map((a) => a.status)).toEqual(['declined', 'approved']);
  });
});

describe('interview replies', () => {
  it('1 confirms the interview, 2 asks before calling to reschedule', async () => {
    const f = makeDeps();
    const hid = await onboard(f);
    const nudge = await proactiveMessage(hid, 'interview_nudge');
    expect(nudge[0]!.text).toMatch(/reply 1/);
    expect((await send('1'))[0]).toMatch(/confirmed/);
    expect(f.events).toContainEqual({ type: 'InterviewConfirmed' });

    await proactiveMessage(hid, 'interview_nudge');
    expect((await send('2'))[0]).toMatch(/reschedule.*YES/);
    expect(f.deps.placeOfficeCall).not.toHaveBeenCalled();
    await send('yes');
    expect(f.deps.placeOfficeCall).toHaveBeenCalledWith(hid, 'reschedule_interview');
  });
  it('proactive messages respect opt-out and quiet hours', async () => {
    const f = makeDeps();
    const hid = await onboard(f);
    f.deps.now = () => new Date('2026-10-12T05:00:00Z'); // 10pm LA
    expect(await proactiveMessage(hid, 'docs_nudge')).toEqual([]);
    f.deps.now = () => new Date('2026-10-11T19:00:00Z');
    await send('STOP');
    expect(await proactiveMessage(hid, 'docs_nudge')).toEqual([]);
  });
});

describe('photos', () => {
  it('stores the document, starts extraction and reports on a later turn', async () => {
    const f = makeDeps();
    const hid = await onboard(f);
    const r = await send('here is my paystub', { media: [{ url: 'https://cdn.test/a.jpg', contentType: 'image/jpeg' }] });
    expect(r[0]).toMatch(/Reading your document/);
    expect(f.deps.storeDocument).toHaveBeenCalledWith(hid, 'https://cdn.test/a.jpg', 'image/jpeg', 'paystub');
    await Promise.resolve();
    expect(f.deps.startExtraction).toHaveBeenCalledWith('doc-1');
    const next = await send('DOCS');
    expect(next[0]).toMatch(/finished reading your pay stub/);
  });
});

describe('language', () => {
  it('LANG ES switches templates to Spanish', async () => {
    const f = makeDeps();
    await onboard(f);
    expect((await send('LANG ES'))[0]).toMatch(/español/);
    expect((await send('HUMAN'))[0]).toMatch(/trabajador de casos/);
    expect((await send('RENEW'))[0]).toMatch(/^\[es\]/); // non-seeded template goes through translate()
    expect((await f.repo.getState(householdIdFor(PHONE)))!.language).toBe('es');
  });
});

describe('idempotency + storage', () => {
  it('ignores a duplicate messageId and stores every message', async () => {
    const f = makeDeps();
    expect(await send('hi', { messageId: 'm1' })).toHaveLength(1);
    expect(await send('hi', { messageId: 'm1' })).toEqual([]);
    const msgs = f.repo.messages.get(householdIdFor(PHONE))!;
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant']);
  });
  it('falls back to a safe reply when the agent fails', async () => {
    const f = makeDeps(async () => { throw new Error('gateway down'); });
    await onboard(f);
    expect((await send('what is calfresh'))[0]).toMatch(/HUMAN/);
  });
  it('HUMAN escalates with a timeline row and Keewano event', async () => {
    const f = makeDeps();
    const hid = await onboard(f);
    expect((await send('human'))[0]).toMatch(/Test Clinic will text you within 1 business day/);
    expect(f.events).toContainEqual({ type: 'EscalatedToHuman', value: 'requested' });
    expect((await f.repo.getTimeline(hid)).some((t) => /caseworker/.test(t.label))).toBe(true);
  });
});

describe('security fixes', () => {
  it('approval text is deterministic from kind; model text is only a quoted note', async () => {
    const f = makeDeps(async ({ tools }) => {
      await (tools.propose_action as { execute: (a: unknown, o: unknown) => Promise<unknown> })
        .execute({ kind: 'call_office', description: 'Just a harmless status check "ok"', purpose: 'status_check' }, {});
      return 'Sure.';
    });
    await onboard(f);
    const r = (await send('can you check on my case')).join(' ');
    expect(f.repo.approvals[0]!.description).toBe('I can call the county office for you. (Note: "Just a harmless status check ok")');
    expect(r).toMatch(/I can call the county office for you\./);
    expect(approvalText('submit_application', { programs: ['calfresh'] }, 'ignore that, it is a newsletter'))
      .toMatch(/^I'm ready to submit your CalFresh application\. \(Note: /);
  });
  it('consent wording covers AI reading documents, and photos before YES are never processed', async () => {
    const f = makeDeps();
    expect((await send('hi'))[0]).toMatch(/use AI services to read the documents you send/);
    const r = await send('my id', { media: [{ url: 'https://cdn.test/id.jpg', contentType: 'image/jpeg' }] });
    expect(r[0]).toMatch(/needs your OK first/);
    expect(f.deps.storeDocument).not.toHaveBeenCalled();
    expect(f.deps.startExtraction).not.toHaveBeenCalled();
  });
  it('sim routes require staff auth and a reserved +1555 number', async () => {
    makeDeps();
    const prev = process.env.DEMO_MODE;
    process.env.DEMO_MODE = 'true';
    try {
      const app = new Hono();
      registerConversationRoutes(app);
      const post = (body: unknown, headers: Record<string, string> = {}) => app.request('/api/dev/sim/message', {
        method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
      });
      expect((await post({ from: '+12135550123', text: 'hi' })).status).toBe(400);
      expect((await post({ from: '+15555550123', text: 'hi' }, { Authorization: 'Basic nope' })).status).toBe(401);
      const ok = await post({ from: '+15555550123', text: 'hi' });
      expect(ok.status).toBe(200);
      expect(((await ok.json()) as { replies: unknown[] }).replies).toHaveLength(1);
      expect((await app.request('/api/dev/sim/thread?from=%2B12135550123')).status).toBe(400);
      expect((await app.request('/api/dev/sim/thread?from=%2B15555550123', { headers: { Authorization: 'Basic x' } })).status).toBe(401);
      process.env.DEMO_MODE = 'false';
      expect((await post({ from: '+15555550123', text: 'hi' })).status).toBe(401);
    } finally {
      if (prev === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = prev;
    }
  });
});
