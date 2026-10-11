// Live wiring for scheduled calls + the 15s loop that starts due ones. Lazily created: importing does no I/O.
import { z } from 'zod';
import { supabaseIntakeRepo } from '../intakeStore.js';
import { generateObjectWithFallback } from '../llm.js';
import { appendMessage } from '../store.js';
import { liveCallsRuntime } from './live.js';
import { createScheduler, supabaseScheduledRepo, type Scheduler } from './schedule.js';
import type { WhenLlm } from './when.js';

export const SCHEDULE_TICK_MS = 15_000;

const WhenOut = z.object({ iso: z.string().nullable() });
const llmWhen: WhenLlm = async (text, now, tz) => {
  const { object } = await generateObjectWithFallback('fast', WhenOut, {
    system: `Convert a requested time into an ISO 8601 timestamp WITH a UTC offset. The person is in the ${tz} time zone. If it is not a time or date, return iso null.`,
    prompt: `Current time: ${now.toISOString()} (UTC). Requested: "${text.slice(0, 120)}"`,
  });
  return object.iso;
};

let scheduler: Scheduler | undefined;
export function liveScheduler(): Scheduler {
  if (scheduler) return scheduler;
  const rt = liveCallsRuntime();
  const intakes = supabaseIntakeRepo();
  scheduler = createScheduler({
    repo: supabaseScheduledRepo(),
    callsEnabled: () => rt.config().enabled,
    startCall: (input, onDone) => rt.startScriptedCall(input, onDone),
    latestWorkflowId: async hid => (await rt.deps.latestWorkflowFor(hid))?.wf.id ?? null,
    log: (hid, e) => rt.deps.log(hid, e),
    timeline: (hid, label) => rt.deps.timeline(hid, label),
    async notifyChat(hid, text) {
      // The household thread is shared by text and the (linked) web chat; the mirror feeds the dashboard log.
      await intakes.appendMessage(hid, 'sms', 'assistant', text);
      await appendMessage(hid, 'assistant', text).catch(() => undefined);
    },
    publish: id => rt.deps.publish(id),
    now: () => new Date(),
    llmWhen,
  });
  return scheduler;
}

let timer: ReturnType<typeof setInterval> | undefined;
/** Starts the due-call loop once per process. */
export function startScheduledCallLoop(intervalMs = SCHEDULE_TICK_MS): void {
  if (timer) return;
  timer = setInterval(() => {
    void liveScheduler().runDueScheduledCalls()
      .catch(err => console.error('[schedule] tick failed:', err instanceof Error ? err.message : err));
  }, intervalMs);
  timer.unref?.();
}
