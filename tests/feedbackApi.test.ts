import { describe, expect, it } from 'vitest';
import { feedbackApi, type FeedbackEntry } from '../src/feedbackApi.js';

describe('feedbackApi', () => {
  const post = (app: ReturnType<typeof feedbackApi>, body: unknown) =>
    app.request('/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it('records a message and a rating', async () => {
    const got: FeedbackEntry[] = [];
    const app = feedbackApi(f => got.push(f));
    expect((await post(app, { kind: 'message', text: '  Add Orange County ', page: '/faq' })).status).toBe(204);
    expect((await post(app, { kind: 'rating', rating: 'down', page: '/chat' })).status).toBe(204);
    expect(got).toEqual([
      { kind: 'message', text: 'Add Orange County', page: '/faq' },
      { kind: 'rating', rating: 'down', page: '/chat' },
    ]);
  });

  it('rejects empty or malformed feedback', async () => {
    const app = feedbackApi(() => { throw new Error('should not record'); });
    expect((await post(app, { kind: 'message', text: '   ', page: '/' })).status).toBe(400);
    expect((await post(app, { kind: 'rating', rating: 'meh', page: '/' })).status).toBe(400);
    expect((await app.request('/', { method: 'POST', body: 'not json' })).status).toBe(400);
  });
});
