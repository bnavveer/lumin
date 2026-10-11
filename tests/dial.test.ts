import { describe, expect, it } from 'vitest';
import type { DialEvent } from '@getdial/sdk';
import { dispatchEvent, transcriptText, type EventHandlers, type InboundMessage } from '../src/dial.js';
import { buildMessages } from '../src/agent.js';

const received = (id: string, to = '+16183531752') => ({
  id, object: 'event', type: 'message.received', version: 1, createdAt: '', relatedObject: null,
  data: { messageId: `m-${id}`, from: '+12135550100', to, channel: 'sms', body: 'hi', media: [], source: 'external' },
}) as DialEvent;

function handlers() {
  const seen = new Set<string>();
  const got: InboundMessage[] = [];
  const calls: string[] = [];
  const h: EventHandlers = {
    firstSeen: async id => (seen.has(id) ? false : (seen.add(id), true)),
    onMessage: async m => { got.push(m); },
    onCallTranscribed: async id => { calls.push(id); },
  };
  return { h, got, calls };
}

describe('dial event dispatch', () => {
  it('delivers a duplicate event only once', async () => {
    const { h, got } = handlers();
    await dispatchEvent(received('e1'), h, '+16183531752');
    await dispatchEvent(received('e1'), h, '+16183531752');
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ from: '+12135550100', body: 'hi' });
  });

  it('ignores texts to other lines on the account', async () => {
    const { h, got } = handlers();
    await dispatchEvent(received('e2', '+19995550000'), h, '+16183531752');
    expect(got).toHaveLength(0);
  });

  it('routes call.transcribed by call id', async () => {
    const { h, calls } = handlers();
    await dispatchEvent({ id: 'e3', object: 'event', type: 'call.transcribed', version: 1, createdAt: '', relatedObject: null,
      data: { callId: 'c1' } } as DialEvent, h);
    expect(calls).toEqual(['c1']);
  });

  it('falls back to transcript turns', () => {
    expect(transcriptText({ transcript: null, transcriptTurns: [{ speaker: 'agent', text: 'hi' }, { speaker: 'user', text: 'yo' }] } as never))
      .toBe('agent: hi\nuser: yo');
  });
});

describe('agent message building', () => {
  const base = { channel: 'sms' as const, state: '{}', tools: {} as never };

  it('tags each message with its channel and puts case state in a trailing system message', () => {
    const msgs = buildMessages({ ...base, history: [
      { channel: 'web', role: 'user', content: 'hi from the site', at: '' },
      { channel: 'web', role: 'assistant', content: 'hello', at: '' },
      { channel: 'sms', role: 'user', content: 'now by text', at: '' },
    ] });
    expect(msgs[0]).toMatchObject({ role: 'user', content: '[web chat] hi from the site' });
    expect(msgs[2]).toMatchObject({ role: 'user', content: '[text] now by text' });
    expect(msgs.at(-1)?.role).toBe('system');
  });

  it('drops a leading assistant message and attaches photos to the newest message', () => {
    const msgs = buildMessages({ ...base, imageUrls: ['https://media.example/p.jpg'], history: [
      { channel: 'sms', role: 'assistant', content: 'Aid: please check your info', at: '' },
      { channel: 'sms', role: 'user', content: '[photo]', at: '' },
    ] });
    expect(msgs[0].role).toBe('user');
    expect(Array.isArray(msgs[0].content) && msgs[0].content[0]).toMatchObject({ type: 'image' });
  });
});
