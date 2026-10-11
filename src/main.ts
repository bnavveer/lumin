import 'dotenv/config';
import { serve } from '@hono/node-server';
import { liveConversation, startDialChannels, sendProactiveText } from './channels.js';
import { createApp } from './server.js';
import { packetRoutes } from './packet.js';
import { setOutbox, setProactiveMessage, startAutopilotLoop } from './demoRunner.js';
import { proactiveMessage } from './caseManager/engine.js';
import { startScheduledCallLoop } from './calls/scheduleLive.js';
import { startInboxPoller } from './inboxPoller.js';

const conv = liveConversation();
setProactiveMessage(proactiveMessage);
setOutbox(async (householdId, phone, text) => {
  await sendProactiveText(householdId, phone, text);
  await conv.recordChannelMessage(phone, 'assistant', text, { mirror: false });
});
const app = createApp({ packet: packetRoutes, conversation: conv });

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, () => console.log(`[aid] website, chat, applicant and staff APIs on http://localhost:${port}`));
if (process.env.DIAL_ENABLED !== 'false') void startDialChannels(conv);
if (process.env.AUTOPILOT_ENABLED === 'true') startAutopilotLoop();
if (process.env.SCHEDULED_CALLS_ENABLED !== 'false') startScheduledCallLoop();
if (process.env.INBOX_POLL_ENABLED !== 'false') startInboxPoller();
