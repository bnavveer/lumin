import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Call, DialEvent } from '@getdial/sdk';
import { createConversation } from '../src/conversation.js';
import { createDialChannelHandlers, createIntakeTextSender, sendProactiveText, startDialChannels } from '../src/channels.js';
import { dispatchEvent, type EventHandlers } from '../src/dial.js';
import { chatApi } from '../src/chatApi.js';
import { memoryIntakeRepo } from '../src/intakeStore.js';
import type { AgentTurn } from '../src/agent.js';
import type { Household } from '../src/contracts.js';
import { householdId, type IntakeFields } from '../src/intake.js';
import { setConversationDeps, type ConversationDeps } from '../src/caseManager/deps.js';
import { handleIncomingMessage } from '../src/caseManager/engine.js';
import { defaultState, memoryRepo } from '../src/caseManager/state.js';

const PHONE = '+12135550100';
const LINE = '+16183531752';
const full: IntakeFields = { firstName: 'Maria', county: 'los_angeles', size: 3, monthlyIncome: 1850,
  childrenUnder18: 2, pregnant: false, adultAge: 31, immigrationStatus: 'citizen', childrenAreCitizens: true };
const supplemental: IntakeFields = { childrenUnder5: 1, wicIncomeEligibleViaProgram: true };
function message(id: string, body = 'YES', to = LINE, media: Array<{ url: string; contentType: string }> = []): DialEvent {
  return { id, object: 'event', type: 'message.received', version: 1, createdAt: '', relatedObject: null,
    data: { messageId: `m-${id}`, from: PHONE, to, channel: 'sms', body, media, source: 'external' } } as DialEvent;
}
function callEvent(id: string, callId = 'call-1'): DialEvent {
  return { id, object: 'event', type: 'call.transcribed', version: 1, createdAt: '', relatedObject: null,
    data: { callId } } as DialEvent;
}
function setup() {
  const repo = memoryIntakeRepo();
  const households = new Map<string, Household>();
  const preferences = new Map<string, boolean>();
  const caseRepo = memoryRepo([{ id: 'test-org', name: 'Test Clinic', code: 'AID' }]);
  caseRepo.getHousehold = async id => households.get(id);
  caseRepo.getHouseholdByPhone = async phone => [...households.values()].find(h => h.phone === phone);
  caseRepo.upsertHousehold = async h => { households.set(h.id, h); };
  const caseDeps: ConversationDeps = {
    repo: caseRepo, logEvent: vi.fn(async () => {}),
    storeDocument: vi.fn(async () => ({ id: 'doc-1' })), startExtraction: vi.fn(async () => ({ status: 'reading' })),
    pollExtraction: vi.fn(async () => ({ status: 'reading' })), vaultSummary: vi.fn(async () => 'We have your ID.'),
    missingDocs: vi.fn(async () => ['paystub' as const]), requestDocument: vi.fn(async () => {}),
    translate: vi.fn(async text => text), detectLanguage: vi.fn(async () => 'en'),
    runAgent: vi.fn(async () => 'Your case is being reviewed.'), packetUrl: id => `https://aid.test/p/${id}`,
    placeOfficeCall: vi.fn(async () => {}), answerQuestion: vi.fn(async () => 'Bring your ID.'),
    findResources: vi.fn(async () => []), nudgeText: vi.fn(async () => ({ variantId: 'test', text: 'Please send your pay stub.' })),
    now: () => new Date('2026-10-11T19:00:00Z'),
  };
  setConversationDeps(caseDeps);
  const sendText = vi.fn(async (_to: string, _body: string) => 'mock-message');
  const extract = vi.fn(async () => ({ fields: { ...full, ...supplemental }, notes: 'supplemental facts' }));
  let script: (turn: AgentTurn) => Promise<string> = async t => t.tools.checkEligibility();
  const conv = createConversation({ repo, orgId: 'test-org', sendText: createIntakeTextSender({ sendText,
    isOptedOut: async phone => preferences.get(phone) ?? false, getCaseDeps: async () => caseDeps }),
    runAgent: turn => script(turn), extractFromCall: extract,
    getHousehold: async id => households.get(id), upsertHousehold: async h => { households.set(h.id, h); },
    logEvents: async () => {}, mirrorMessage: async () => {}, addTimeline: async () => {},
    now: () => new Date('2026-10-11T19:00:00Z') });
  const seen = new Set<string>();
  const getCall = vi.fn(async () => ({ direction: 'inbound', from: PHONE, to: LINE,
    transcript: 'Maria lives in LA. One child is under five and receives qualifying assistance.' } as Call));
  const outbound = vi.fn(async () => {});
  const overrides = { getCall, sendText, ourNumber: vi.fn(async () => LINE),
    isOptedOut: async (phone: string) => preferences.get(phone) ?? false,
    setOptedOut: async (phone: string, value: boolean) => { preferences.set(phone, value); },
    getCaseDeps: async () => caseDeps, handleCaseMessage: handleIncomingMessage,
    firstSeen: async (id: string) => seen.has(id) ? false : (seen.add(id), true) };
  const handlers = createDialChannelHandlers(conv, outbound, overrides);
  const app = chatApi(conv);
  async function session() { return (await (await app.request('/sessions', { method: 'POST' })).json()).sessionId as string; }
  async function post(id: string, text: string) {
    const response = await app.request(`/sessions/${id}/messages`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    expect(response.status).toBe(200);
    return response.json();
  }
  async function view(id: string) { return (await app.request(`/sessions/${id}`)).json(); }
  return { conv, handlers, overrides, sendText, extract, getCall, outbound, households, session, post, view,
    repo, preferences, caseRepo, caseDeps,
    setScript: (s: typeof script) => { script = s; },
    dispatch: (event: DialEvent) => dispatchEvent(event, handlers) };
}

afterEach(() => { setConversationDeps(); });

async function confirmWeb(t: ReturnType<typeof setup>): Promise<string> {
  t.setScript(async turn => { await turn.tools.saveAnswers(full, PHONE); return turn.tools.sendConfirmationText(); });
  const id = await t.session();
  await t.post(id, 'My details');
  t.setScript(async turn => turn.tools.checkEligibility());
  await t.dispatch(message(`confirm-${id}`));
  return id;
}

describe('HTTP chat and actual Dial channel handlers', () => {
  it('persists STOP before confirmation without creating a household and resumes only after START', async () => {
    const t = setup();
    await t.dispatch(message('pre-stop', 'STOP'));
    const count = t.sendText.mock.calls.length;
    await t.dispatch(message('pre-no-reply', 'YES'));
    await t.dispatch(callEvent('pre-no-followup'));
    expect(t.preferences.get(PHONE)).toBe(true);
    expect(t.households.size).toBe(0);
    expect(t.sendText).toHaveBeenCalledTimes(count);
    expect(t.extract).not.toHaveBeenCalled();
    expect(t.repo.messages.some(m => m.content === 'STOP')).toBe(true);
    await t.dispatch(message('pre-start', 'START'));
    expect(t.preferences.get(PHONE)).toBe(false);
    t.setScript(async () => 'What county do you live in?');
    await t.dispatch(message('pre-intake', 'I need benefits'));
    expect(t.sendText).toHaveBeenLastCalledWith(PHONE, 'What county do you live in?');
    expect(t.households.size).toBe(0);
  });

  it('blocks web confirmation sends to an opted out phone', async () => {
    const t = setup();
    await t.dispatch(message('web-stop', 'STOP'));
    const id = await t.session();
    t.setScript(async turn => { await turn.tools.saveAnswers(full, PHONE); return 'Saved your details.'; });
    await t.post(id, 'My details');
    await expect(t.conv.requestConfirmation(`web:${id}`)).rejects.toThrow('Texts are paused');
    expect((await t.repo.get(`web:${id}`))?.status).toBe('collecting');
    expect(t.sendText).toHaveBeenCalledTimes(1);
  });

  it('routes case commands through consent, shares their replies with linked web chat, and stores document media only after YES', async () => {
    const t = setup();
    const id = await confirmWeb(t);
    const media = [{ url: 'https://files.test/paystub.pdf', contentType: 'application/pdf' }];
    await t.dispatch(message('case-docs-setup', 'DOCS'));
    expect(t.sendText.mock.calls.at(-1)?.[1]).toMatch(/Reply YES/);
    await t.dispatch(message('case-photo-no-consent', 'pay stub', LINE, media));
    expect(t.caseDeps.storeDocument).not.toHaveBeenCalled();
    await t.dispatch(message('case-consent', 'YES'));
    expect((await t.caseRepo.getState(householdId(PHONE)))?.stage).toBe('active');
    await t.dispatch(message('case-photo-consented', 'pay stub', LINE, media));
    expect(t.caseDeps.storeDocument).toHaveBeenCalledWith(householdId(PHONE), media[0].url, 'application/pdf', 'paystub');
    await t.dispatch(message('case-docs', 'DOCS'));
    const view = await t.view(id);
    expect(view.messages.some((m: any) => m.role === 'assistant' && /your photo|photo/.test(m.content))).toBe(true);
    expect(view.messages.at(-1).content).toBe(t.sendText.mock.calls.at(-1)?.[1]);
    // The engine already wrote dashboard messages; the shared-thread hook must not copy them twice.
    expect((await t.caseRepo.getMessages(householdId(PHONE))).filter(m => m.content === 'DOCS')).toHaveLength(2);
  });

  it('keeps household corrections and their confirmation in intake while ordinary consented case questions reach the case engine', async () => {
    const t = setup();
    const id = await confirmWeb(t);
    await t.caseRepo.saveState({ ...defaultState(householdId(PHONE)), stage: 'active', pendingContext: { screened: true } });
    await t.dispatch(message('case-question', 'When is my interview?'));
    expect(t.caseDeps.runAgent).toHaveBeenCalledTimes(1);
    t.setScript(async turn => { await turn.tools.saveAnswers({ monthlyIncome: 2000 }); return turn.tools.sendConfirmationText(); });
    await t.dispatch(message('case-correction', 'Actually my income is $2000'));
    expect(t.caseDeps.runAgent).toHaveBeenCalledTimes(1);
    expect(t.households.get(householdId(PHONE))?.monthlyIncome).toBe(1850);
    t.setScript(async turn => turn.tools.checkEligibility());
    await t.dispatch(message('case-correction-yes', 'YES'));
    expect(t.households.get(householdId(PHONE))?.monthlyIncome).toBe(2000);
    expect((await t.view(id)).status).toBe('confirmed');
  });

  it('persists case STOP, suppresses proactive sends, and preserves START and pending approvals', async () => {
    const t = setup();
    await confirmWeb(t);
    const hid = householdId(PHONE);
    await t.caseRepo.saveState({ ...defaultState(hid), stage: 'active', pendingContext: { screened: true } });
    const approval = await t.caseRepo.createApproval(hid, 'share_documents', 'Share documents', {});
    await t.dispatch(message('approval-no', 'NO'));
    expect((await t.caseRepo.getApproval(approval.id))?.status).toBe('declined');
    await sendProactiveText(hid, PHONE, 'Reminder', t.overrides);
    expect(t.sendText).toHaveBeenLastCalledWith(PHONE, 'Reminder');
    await t.dispatch(message('case-stop', 'STOP'));
    const count = t.sendText.mock.calls.length;
    expect((await t.caseRepo.getState(hid))?.stage).toBe('opted_out');
    await expect(sendProactiveText(hid, PHONE, 'Reminder', t.overrides)).rejects.toThrow('suppressed');
    await t.dispatch(message('case-stopped-text', 'When is my interview?'));
    expect(t.sendText).toHaveBeenCalledTimes(count);
    expect(t.caseDeps.runAgent).not.toHaveBeenCalled();
    await t.dispatch(message('case-start', 'START'));
    expect((await t.caseRepo.getState(hid))?.stage).toBe('active');
    await sendProactiveText(hid, PHONE, 'Reminder again', t.overrides);
    expect(t.sendText).toHaveBeenLastCalledWith(PHONE, 'Reminder again');
    await t.caseRepo.saveState({ ...defaultState(hid), stage: 'new' });
    await expect(sendProactiveText(hid, PHONE, 'No consent', t.overrides)).rejects.toThrow('suppressed');
    await t.caseRepo.saveState({ ...defaultState(hid), stage: 'active' });
    t.caseDeps.now = () => new Date('2026-10-12T05:00:00Z');
    await expect(sendProactiveText(hid, PHONE, 'Quiet hours', t.overrides)).rejects.toThrow('suppressed');
  });

  it('supports existing cases without intake rows and honors an engine-only opt-out during corrections', async () => {
    const t = setup();
    const hid = householdId(PHONE);
    t.households.set(hid, { id: hid, orgId: 'test-org', phone: PHONE, ...full } as Household);
    await t.caseRepo.saveState({ ...defaultState(hid), stage: 'active', pendingContext: { screened: true } });
    await t.dispatch(message('legacy-status', 'STATUS'));
    expect(t.sendText.mock.calls.at(-1)?.[1]).toMatch(/CalFresh|Medi-Cal/);
    await t.caseRepo.saveState({ ...defaultState(hid), stage: 'opted_out', pendingContext: { stageBeforeOptOut: 'active' } });
    // A working correction does not erase the case's STOP state.
    await t.repo.save({ id: hid, channel: 'sms', phone: PHONE, householdId: hid, fields: full,
      status: 'collecting', confirmationRequestedAt: null, confirmedAt: null, updatedAt: '' });
    await expect(createIntakeTextSender(t.overrides)(PHONE, 'Follow up')).rejects.toThrow('Texts are paused');
    await t.dispatch(message('legacy-call-stopped', 'HELP'));
    expect(t.sendText).toHaveBeenCalledTimes(1);
    await t.dispatch(message('legacy-restart', 'START'));
    expect((await t.caseRepo.getState(hid))?.stage).toBe('active');
    expect(t.preferences.get(PHONE)).toBe(false);
  });

  it('returns preliminary screening through HTTP for partial web answers without sending SMS', async () => {
    const t = setup();
    t.setScript(async turn => { await turn.tools.saveAnswers({ county: 'los_angeles', pregnant: true,
      wicIncomeEligibleViaProgram: true }); return turn.tools.screenApplications(); });
    const id = await t.session();
    const result = await t.post(id, 'I am pregnant and receive qualifying assistance');
    expect(result.view.screening.matches.find((m: any) => m.program === 'wic').status).toBe('likely');
    expect((await t.view(id)).screening).toEqual(result.view.screening);
    expect(t.households.size).toBe(0);
    expect(t.sendText).not.toHaveBeenCalled();
  });

  it('links web confirmation to a mocked Dial YES and exposes shared messages and matches over HTTP', async () => {
    const t = setup();
    t.setScript(async turn => { await turn.tools.saveAnswers({ ...full, ...supplemental }, PHONE);
      return turn.tools.sendConfirmationText(); });
    const id = await t.session();
    expect((await t.post(id, 'My household details')).view.linked).toBe(false);
    t.setScript(async turn => turn.tools.checkEligibility());
    await t.dispatch(message('sms-yes'));
    const view = await t.view(id);
    expect(view).toMatchObject({ linked: true, status: 'confirmed' });
    expect(view.messages.map((m: any) => m.channel)).toEqual(expect.arrayContaining(['web', 'sms']));
    expect(view.messages.some((m: any) => m.role === 'user' && m.content === 'YES')).toBe(true);
    expect(view.screening.matches.find((m: any) => m.program === 'wic').status).toBe('likely');
    expect(t.households.size).toBe(1);
    const lastReply = JSON.parse(view.messages.at(-1).content);
    expect(lastReply.matches).toEqual(view.screening.matches);
  });

  it('routes a transcript with supplemental fields into the linked web case and deduplicates it', async () => {
    const t = setup();
    t.setScript(async turn => { await turn.tools.saveAnswers(full, PHONE); return turn.tools.sendConfirmationText(); });
    const id = await t.session();
    await t.post(id, 'Details without child age');
    t.setScript(async turn => turn.tools.checkEligibility());
    await t.dispatch(message('link-yes'));
    const event = callEvent('voice-event');
    await t.dispatch(event);
    await t.dispatch(event);
    expect(t.getCall).toHaveBeenCalledTimes(1);
    expect(t.extract).toHaveBeenCalledTimes(1);
    const view = await t.view(id);
    expect(view.linked).toBe(true);
    expect(view.messages.filter((m: any) => m.channel === 'voice')).toHaveLength(1);
    expect(view.screening.matches.find((m: any) => m.program === 'wic').status).toBe('likely');
  });

  it('ignores inbound calls and texts addressed to another configured account line', async () => {
    const t = setup();
    t.getCall.mockResolvedValueOnce({ direction: 'inbound', from: PHONE, to: '+19995550000',
      transcript: 'private unrelated call' } as Call);
    await t.dispatch(callEvent('other-call'));
    await t.dispatch(message('other-sms', 'YES', '+19995550000'));
    expect(t.extract).not.toHaveBeenCalled();
    expect(t.sendText).not.toHaveBeenCalled();
    expect(t.outbound).not.toHaveBeenCalled();
  });

  it('preserves outbound callback and does not extract outbound transcripts', async () => {
    const t = setup();
    t.getCall.mockResolvedValueOnce({ direction: 'outbound', from: LINE, to: PHONE, transcript: 'office callback' } as Call);
    await t.dispatch(callEvent('outbound', 'office-call'));
    expect(t.outbound).toHaveBeenCalledWith('office-call');
    expect(t.extract).not.toHaveBeenCalled();
  });

  it('deduplicates SMS confirmation events and injects the stream adapter without live Dial', async () => {
    const t = setup();
    t.setScript(async turn => { await turn.tools.saveAnswers(full, PHONE); return turn.tools.sendConfirmationText(); });
    const id = await t.session();
    await t.post(id, 'Details');
    t.setScript(async turn => turn.tools.checkEligibility());
    const event = message('same-yes');
    await t.dispatch(event);
    const count = t.sendText.mock.calls.length;
    await t.dispatch(event);
    expect(t.sendText).toHaveBeenCalledTimes(count);
    expect((await t.view(id)).messages.filter((m: any) => m.content === 'YES')).toHaveLength(1);
    const stream = vi.fn(async (_handlers: EventHandlers): Promise<never> => { throw new Error('mock stream stopped'); });
    await expect(startDialChannels(t.conv, t.outbound, { ...t.overrides, startEventLoop: stream }))
      .rejects.toThrow('mock stream stopped');
    expect(stream.mock.calls[0][0]).toMatchObject({ onMessage: expect.any(Function), onCallTranscribed: expect.any(Function) });
  });
});
