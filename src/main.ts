import 'dotenv/config';
import { serve } from '@hono/node-server';
import { fileURLToPath } from 'node:url';
import { liveConversation, startDialChannels } from './channels.js';
import { createApp } from './app.js';

const conv = liveConversation();
const app = createApp(conv, {
  phone: process.env.PUBLIC_DIAL_NUMBER ?? process.env.DIAL_FROM_NUMBER,
  webRoot: fileURLToPath(new URL('../web/dist/', import.meta.url)),
});

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, () => console.log(`[aid] chat API on http://localhost:${port}/api/chat`));
if (process.env.DIAL_ENABLED !== 'false') void startDialChannels(conv);
