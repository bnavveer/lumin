// Anonymous site feedback: the "Submit feedback" dialog and thumbs up/down on chat answers.
//   POST /api/feedback { kind: 'message' | 'rating', text?, rating?, page } → 204
// Nothing ties it to a person or case: no session id, no IP. For now it only goes to the server log.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod/v4';

const Feedback = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('message'), text: z.string().trim().min(1).max(2000), page: z.string().max(200) }),
  z.object({ kind: z.literal('rating'), rating: z.enum(['up', 'down']), page: z.string().max(200) }),
]);

export type FeedbackEntry = z.infer<typeof Feedback>;

export function feedbackApi(record: (f: FeedbackEntry) => void = f => console.log('[feedback]', JSON.stringify(f))): Hono {
  const app = new Hono();
  app.use('*', bodyLimit({ maxSize: 8 * 1024 }));
  app.post('/', async c => {
    const body = Feedback.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid feedback' }, 400);
    record(body.data);
    return c.body(null, 204);
  });
  return app;
}
