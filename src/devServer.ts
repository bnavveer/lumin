// Lane B dev entry: runs the API without Lane A's Dial loop.
// Replaced by src/main.ts once Lane A lands; the packet routes below are placeholders until src/submit.ts exists.
import './env.js';
import { startServer } from './server.js';
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

startServer(Number(process.env.PORT ?? 3000), { packet: placeholderPacket });
