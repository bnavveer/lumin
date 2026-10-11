import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Conversation } from './conversation.js';
import type { PublicChannelConfig } from '../shared/chat.js';
import { chatApi } from './chatApi.js';
import { feedbackApi } from './feedbackApi.js';

/** One origin serves the frontend, chat and the public phone entry points. */
export function createApp(conv: Conversation, options: { phone?: string; webRoot?: string; apiNotFound?: boolean } = {}) {
  const app = new Hono();
  app.get('/health', c => c.json({ ok: true }));
  app.get('/api/config', c => {
    const config: PublicChannelConfig = { phone: /^\+1\d{10}$/.test(options.phone ?? '') ? options.phone! : null };
    return c.json(config);
  });
  app.use('/api/chat/*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next(); });
  app.route('/api/chat', chatApi(conv));
  app.route('/api/feedback', feedbackApi());
  if (options.apiNotFound !== false) app.all('/api/*', c => c.json({ error: 'API route not found' }, 404));
  if (options.webRoot && existsSync(join(options.webRoot, 'index.html'))) {
    app.use('*', serveStatic({ root: options.webRoot }));
    // Client-side page routes must survive reloads; missing assets remain 404s.
    const index = serveStatic({ root: options.webRoot, path: 'index.html' });
    for (const path of ['/', '/chat', '/how-it-works', '/privacy', '/about', '/coming-soon', '/faq', '/privacy-policy', '/terms', '/kit', '/login', '/signup', '/dashboard']) app.get(path, index);
    app.get('/workflows/:id', index);
  }
  return app;
}
