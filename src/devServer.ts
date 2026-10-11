// Lane B dev entry: runs the API without Lane A's Dial loop.
// Replaced by src/main.ts once Lane A lands; the packet routes below are placeholders until src/submit.ts exists.
import './env.js';
import { createApp } from './server.js';
import { serve } from '@hono/node-server';
import { startAutopilotLoop, runAutopilotOnce } from './demoRunner.js';
import { isDemoMode, requireStaff } from './auth.js';
import type { PacketRoutes } from './contracts.js';

const placeholderPacket: PacketRoutes = {
  async renderPacket(householdId) {
    return `<!doctype html><meta charset="utf-8"><title>Aid packet</title>
      <p style="font-family:system-ui;padding:2rem">Packet review page for household ${householdId.replace(/[^a-f0-9-]/gi, '')} is provided by Lane A (src/submit.ts).</p>`;
  },
  async sign() {
    throw new Error('Packet signing is provided by Lane A (src/submit.ts)');
  },
};

const port = Number(process.env.PORT ?? 3000);
const app = createApp({ packet: placeholderPacket });

// One manual autopilot tick (DEMO_MODE only). Registered before the SPA catch-all would matter, so it lives under /api/dev.
app.post('/api/dev/autopilot/run', requireStaff, async (c) => {
  if (!isDemoMode()) return c.json({ error: 'Not found' }, 404);
  return c.json(await runAutopilotOnce());
});

serve({ fetch: app.fetch, port }, (info) => console.log(`[server] listening on :${info.port}`));

if (process.env.AUTOPILOT_ENABLED !== 'false') startAutopilotLoop();
