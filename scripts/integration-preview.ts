// Local UI fixture only. Uses the real API/conversation/screener, with no AI calls or real messages.
// npm --prefix web run build && npx tsx scripts/integration-preview.ts
import { serve } from '@hono/node-server';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { createConversation } from '../src/conversation.js';
import { memoryIntakeRepo } from '../src/intakeStore.js';
import type { Household } from '../src/contracts.js';

if (process.env.NODE_ENV === 'production') throw new Error('Preview fixtures cannot run in production');
const households = new Map<string, Household>();
const conv = createConversation({
  repo: memoryIntakeRepo(), orgId: 'local-preview', now: () => new Date('2026-10-11T12:00:00Z'),
  sendText: async () => {}, logEvents: async () => {}, mirrorMessage: async () => {}, addTimeline: async () => {},
  getHousehold: async id => households.get(id), upsertHousehold: async h => { households.set(h.id, h); },
  extractFromCall: async () => ({ fields: {}, notes: '' }),
  runAgent: async turn => {
    const last = turn.history.at(-1)?.content ?? '';
    if (/help me check/i.test(last)) {
      await turn.tools.screenApplications();
      return 'Your saved answers suggest WIC may fit. A local WIC office checks eligibility and arranges an appointment. Would you like help finding the office?';
    }
    await turn.tools.saveAnswers({ county: 'los_angeles', size: 3, monthlyIncome: 1800, childrenUnder18: 2,
      adultAge: 31, immigrationStatus: 'citizen', childrenAreCitizens: true, pregnant: false,
      childrenUnder5: 1, wicFamilySize: 3, wicMonthlyIncome: 1800, pgeCustomer: false,
      householdHasLifeline: false, lifelineHouseholdSize: 3, lifelineAnnualIncome: 21600 });
    await turn.tools.screenApplications();
    return 'Based on these sample answers, CalFresh, Medi-Cal, WIC and California LifeLine may fit. Open “Programs to explore” to see why, check what is missing, or visit an official application site.';
  },
});
const app = createApp(conv, { phone: '+12135550100', webRoot: fileURLToPath(new URL('../web/dist/', import.meta.url)) });
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 4177 }, () => console.log('Local fixture: http://127.0.0.1:4177/chat — no real texts, calls or AI requests'));
