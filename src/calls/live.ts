// Live wiring of CallsDeps: Supabase, Dial, the LLM gateway, Keewano. Singleton runtime per process.
import { z } from 'zod';
import type { CallScript } from '../../shared/calls.js';
import { optionalEnv } from '../env.js';
import { normalizePhone } from '../intake.js';
import { logEvent } from '../keewano.js';
import { generateObjectWithFallback, generateWithFallback } from '../llm.js';
import { addTimeline, getHousehold } from '../store.js';
import { admin } from '../supabase.js';
import { supabaseWorkflowRepo } from '../workflow/store.js';
import { publishWorkflow } from './publisher.js';
import { createCallsRuntime, ExtractOut, type CallsDeps, type CallsRuntime } from './runtime.js';
import { SuggestOut, suggestPrompt } from './scripts.js';
import { supabaseCallRepo } from './store.js';

const flag = (name: string): boolean => /^(1|true|yes)$/i.test(optionalEnv(name) ?? '');

const dialConfigured = (): boolean =>
  Boolean(optionalEnv('DIAL_API_KEY') && (optionalEnv('DIAL_FROM_NUMBER') || optionalEnv('DIAL_FROM_NUMBER_ID')));

function officePhone(): string | null {
  const raw = optionalEnv('DEMO_OFFICE_PHONE');
  if (!raw) return null;
  try { return normalizePhone(raw); } catch { return null; }
}

async function simulateCounty(script: CallScript, firstName: string | null): Promise<string> {
  const { text } = await generateWithFallback('fast', {
    system: 'You write a realistic, short phone-call transcript between "Aid" (an automated assistant calling on behalf of an applicant) and "County" (a Los Angeles County DPSS eligibility worker). Aid opens by saying it is an automated assistant calling with permission, then asks each question in order, waits, and confirms each answer back. The County worker gives plausible, specific answers (dates in the next two weeks, real document names, office hours). Never include SSNs or case numbers. Format: one line per turn, "Aid: ..." or "County: ...". 10 to 20 lines. No other text.',
    prompt: `Applicant first name: ${firstName ?? 'the applicant'}\nGoal: ${script.goal}\nQuestions:\n${script.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
  });
  return text.trim();
}

export function liveCallsDeps(): CallsDeps {
  const workflows = supabaseWorkflowRepo();
  return {
    repo: supabaseCallRepo(),
    workflows,
    households: { get: id => getHousehold(id) },
    dial: {
      configured: dialConfigured,
      officePhone,
      async placeCall(o) { return (await import('../dial.js')).placeCall(o); },
      async getCall(id) {
        const { getCall, transcriptText } = await import('../dial.js');
        const call = await getCall(id);
        const transcript = transcriptText(call);
        const st = call.status;
        return { done: transcript.trim().length > 0 || (st?.state === 'Terminated' && st.terminationType !== 'completed'), transcript };
      },
      async sendText(to, body) { return (await import('../dial.js')).sendText(to, body); },
    },
    simulate: () => flag('CALL_SIMULATE'),
    autoCallOnEmail: () => flag('AUTO_CALL_ON_EMAIL'),
    llm: {
      async suggest(i) {
        const { object } = await generateObjectWithFallback('fast', SuggestOut, suggestPrompt(i));
        return object;
      },
      async extract(script, transcript) {
        const { object } = await generateObjectWithFallback('fast', ExtractOut, {
          system: 'You read a phone-call transcript between an automated assistant and a county benefits office. For EACH question (same order, copy the question text exactly), give the county\'s answer in one short plain sentence, or null if it was not answered. confidence: high if clearly stated, medium if implied, low if unsure. summary: 1 to 2 sentences for the applicant with any dates, times and documents. outcome: booked if an interview time was set or confirmed, waitlist_open/waitlist_closed for waitlist answers, no_answer if nobody helped, transferred if moved to a person, else info. Never invent facts.',
          prompt: `Questions:\n${script.questions.map((q, n) => `${n + 1}. ${q}`).join('\n')}\n\nTranscript:\n${transcript.slice(0, 12_000)}`,
        });
        return object;
      },
      simulateCounty,
    },
    async latestWorkflowFor(householdId) {
      const { data, error } = await admin().from('workflows').select('id').eq('household_id', householdId)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (error || !data) return undefined;
      return workflows.getWorkflow((data as { id: string }).id);
    },
    log: (hid, e) => logEvent(hid, e),
    timeline: (hid, label) => addTimeline(hid, label),
    publish: id => publishWorkflow(id),
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    poll: { intervalMs: 3000, timeoutMs: 360_000 },
  };
}

let runtime: CallsRuntime | undefined;
/** Lazily created so importing this module does no I/O. */
export function liveCallsRuntime(): CallsRuntime {
  return (runtime ??= createCallsRuntime(liveCallsDeps()));
}
