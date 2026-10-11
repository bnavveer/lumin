import { describe, expect, it, vi } from 'vitest';
import type { Call, DialEvent } from '@getdial/sdk';
import { createConversation } from '../src/conversation.js';
import { createDialChannelHandlers, startDialChannels } from '../src/channels.js';
import { dispatchEvent, type EventHandlers } from '../src/dial.js';
import { chatApi } from '../src/chatApi.js';
import { memoryIntakeRepo } from '../src/intakeStore.js';
import type { AgentTurn } from '../src/agent.js';
import type { Household } from '../src/contracts.js';
import type { IntakeFields } from '../src/intake.js';

const PHONE = '+12135550100';
const LINE = '+16183531752';
const full: IntakeFields = { firstName: 'Maria', county: 'los_angeles', size: 3, monthlyIncome: 1850,
  childrenUnder18: 2, pregnant: false, adultAge: 31, immigrationStatus: 'citizen', childrenAreCitizens: true };
const supplemental: IntakeFields = { childrenUnder5: 1, wicIncomeEligibleViaProgram: true };
function message(id: string, body = 'YES', to = LINE): DialEvent {
  return { id, object: 'event', type: 'message.received', version: 1, createdAt: '', relatedObject: null,
    data: { messageId: `m-${id}`, from: PHONE, to, channel: 'sms', body, media: [], source: 'external' } } as DialEvent;
}
function callEvent(id: string, callId = 'call-1'): DialEvent {
  return { id, object: 'event', type: 'call.transcribed', version: 1, createdAt: '', relatedObject: null,
    data: { callId } } as DialEvent;
}
function setup() {
  const repo = memoryIntakeRepo();
  const households = new Map<string, Household>();
  const sendText = vi.fn(async () => 'mock-message');
  const extract = vi.fn(async () => ({ fields: { ...full, ...supplemental }, notes: 'supplemental facts' }));
  let script: (turn: AgentTurn) => Promise<string> = async t => t.tools.checkEligibility();
  const conv = createConversation({ repo, orgId: 'test-org', sendText,
    runAgent: turn => script(turn), extractFromCall: extract,
    getHousehold: async id => households.get(id), upsertHousehold: async h => { households.set(h.id, h); },
    logEvents: async () => {}, mirrorMessage: async () => {}, addTimeline: async () => {},
    now: () => new Date('2026-10-11T19:00:00Z') });
  const seen = new Set<string>();
  const getCall = vi.fn(async () => ({ direction: 'inbound', from: PHONE, to: LINE,
    transcript: 'Maria lives in LA. One child is under five and receives qualifying assistance.' } as Call));
  const outbound = vi.fn(async () => {});
  const overrides = { getCall, sendText, ourNumber: vi.fn(async () => LINE),
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
    setScript: (s: typeof script) => { script = s; },
    dispatch: (event: DialEvent) => dispatchEvent(event, handlers) };
}

describe('HTTP chat and actual Dial channel handlers', () => {
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
