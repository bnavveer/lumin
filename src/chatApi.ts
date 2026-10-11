// JSON API for the website chat. No UI here: any frontend can drive it.
//   POST /api/chat/sessions                 → { sessionId }
//   POST /api/chat/sessions/:id/messages    { text } → { reply, view }
//   GET  /api/chat/sessions/:id             → view (poll it to see replies that came in by text after YES)
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod/v4';
import type { Conversation } from './conversation.js';

const SessionId = z.uuid();
const Body = z.object({ text: z.string().trim().min(1).max(2000) });

export function chatApi(conv: Conversation): Hono {
  const app = new Hono();
  app.use('*', bodyLimit({ maxSize: 16 * 1024 }));

  app.post('/sessions', c => c.json(conv.createWebSession(), 201));

  app.get('/sessions/:id', async c => {
    const id = SessionId.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'bad session id' }, 400);
    return c.json(await conv.webView(id.data));
  });

  app.post('/sessions/:id/messages', async c => {
    const id = SessionId.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'bad session id' }, 400);
    const body = Body.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'text is required (1–2000 characters)' }, 400);
    try {
      return c.json(await conv.handleWeb(id.data, body.data.text));
    } catch (err) {
      console.error('[chat] turn failed', err);
      return c.json({ error: 'Aid had a problem answering. Please try again.' }, 502);
    }
  });

  return app;
}
