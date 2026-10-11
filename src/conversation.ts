// Channel-agnostic case conversation. Text, phone calls and web chat all land here, share one profile
// per phone number, and nothing becomes the real household record until the person texts back YES.
//
//   web chat ──┐                       ┌─ intakes (working copy, per thread)
//   text (Dial)┼─► conversation ─► agent ┤
//   call (Dial)┘   (this file)          └─ households (only after YES by text)
import { randomUUID } from 'node:crypto';
import type { CaseEvent, Household } from './contracts.js';
import {
  type Channel, type Intake, type IntakeFields, confirmationText, fieldsFromHousehold, householdId, isWebIntake,
  mergeFields, missingFields, normalizePhone, parseConfirmationReply, toHousehold, webIntakeId,
} from './intake.js';
import type { IntakeRepo, ThreadMessage } from './intakeStore.js';
import type { AgentTools, AgentTurn } from './agent.js';
import { pctFpl } from './eligibility.js';
import { screenApplications } from './applicationScreening.js';
import type { WebView } from '../shared/chat.js';
export type { WebView } from '../shared/chat.js';

export interface ConversationDeps {
  repo: IntakeRepo;
  orgId: string;
  sendText(to: string, body: string): Promise<unknown>;
  runAgent(turn: AgentTurn): Promise<string>;
  extractFromCall(transcript: string): Promise<{ fields: IntakeFields; notes: string }>;
  getHousehold(id: string): Promise<Household | undefined>;
  upsertHousehold(h: Household): Promise<void>;
  logEvents(hid: string, es: CaseEvent[]): Promise<void>;
  /** Copy to the dashboard's per-household message log (only exists once the household is confirmed). */
  mirrorMessage(hid: string, role: 'user' | 'assistant', content: string): Promise<void>;
  addTimeline(hid: string, label: string): Promise<void>;
  now?: () => Date;
}

export const CONFIRM_COOLDOWN_MS = 60_000;      // one confirmation text per intake per minute
export const MAX_WEB_CONFIRMS_PER_PHONE = 3;    // per 24h: a web visitor can't use us to spam someone's phone


export function createConversation(d: ConversationDeps) {
  const now = () => (d.now ? d.now() : new Date());
  const locks = new Map<string, Promise<unknown>>();

  /** Serialize work per thread so two quick messages can't interleave tool calls. */
  function serialized<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = locks.get(key) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    locks.set(key, next);
    void next.finally(() => { if (locks.get(key) === next) locks.delete(key); }).catch(() => {});
    return next;
  }

  const safe = (what: string, p: Promise<unknown>) => p.catch(err => console.error(`[conversation] ${what} failed`, err));

  async function record(thread: string, channel: ThreadMessage['channel'], role: 'user' | 'assistant', content: string) {
    await d.repo.appendMessage(thread, channel, role, content);
    if (!isWebIntake(thread) && await d.getHousehold(thread)) await safe('mirrorMessage', d.mirrorMessage(thread, role, content));
  }

  /** The phone's own intake, seeded from the confirmed household if there is one. */
  async function phoneIntake(phone: string, channel: Channel): Promise<Intake> {
    const hid = householdId(phone);
    const existing = await d.repo.get(hid);
    if (existing) return existing;
    const h = await d.getHousehold(hid);
    return {
      id: hid, channel, phone, householdId: h ? hid : null, fields: h ? fieldsFromHousehold(h) : {},
      status: h ? 'confirmed' : 'collecting', confirmationRequestedAt: null, confirmedAt: null, updatedAt: now().toISOString(),
    };
  }

  function describeState(i: Intake, h: Household | undefined): string {
    const missing = missingFields(i.fields);
    return JSON.stringify({
      answersSoFar: i.fields,
      stillNeeded: missing,
      mobileNumberKnown: Boolean(i.phone),
      status: i.status === 'awaiting_confirmation' ? 'confirmation text sent; waiting for them to reply YES by text'
        : i.status === 'confirmed' ? 'confirmed by text' : 'collecting answers (not confirmed yet)',
      hasConfirmedRecord: Boolean(h),
    }, null, 1);
  }

  /** Text the summary. Shared by the agent tool and the post-call flow. */
  async function requestConfirmation(intakeId: string): Promise<string> {
    const i = await d.repo.get(intakeId);
    if (!i) return 'No answers saved yet.';
    try { screenApplications(i.fields, now()); } catch { return 'Not sent: some answers are inconsistent. Correct the household counts or income first.'; }
    const missing = missingFields(i.fields);
    if (missing.length) return `Not sent: still need ${missing.join(', ')}.`;
    if (!i.phone) return 'Not sent: ask for their mobile number first, then save it with save_answers.';
    const t = now();
    if (i.confirmationRequestedAt && t.getTime() - Date.parse(i.confirmationRequestedAt) < CONFIRM_COOLDOWN_MS)
      return 'A confirmation text was just sent. Ask them to check their texts and reply YES.';
    if (i.channel === 'web') {
      const since = new Date(t.getTime() - 86_400_000).toISOString();
      if (await d.repo.confirmationsSentSince(i.phone, since) >= MAX_WEB_CONFIRMS_PER_PHONE)
        return 'Not sent: too many confirmation texts to this number today. Ask them to text Lumin directly from that phone instead.';
    }
    const body = confirmationText(i.fields, i.channel);
    await d.sendText(i.phone, body);
    await d.repo.save({ ...i, status: 'awaiting_confirmation', confirmationRequestedAt: t.toISOString() });
    // The text lives in the phone's thread so a later reply there has context.
    await record(householdId(i.phone), 'sms', 'assistant', body);
    return `Sent a confirmation text to ${i.phone.slice(0, -4).replace(/\d/g, '•')}${i.phone.slice(-4)}. Tell them to reply YES to that text.`;
  }

  async function checkFor(intakeId: string): Promise<string> {
    const i = await d.repo.get(intakeId);
    const h = i?.householdId ? await d.getHousehold(i.householdId) : undefined;
    if (!h || i?.status !== 'confirmed') return 'Their current info is not confirmed yet, so confirmed eligibility can\'t run. Use preliminary screen_applications or send the confirmation text and wait for YES.';
    const screening = screenApplications(i.fields, now());
    await safe('logEvents', d.logEvents(h.id, [{ type: 'Screened', value: screening.matches.filter(m => m.status === 'likely').map(m => m.program).join(',') }]));
    return JSON.stringify(screening);
  }

  function toolsFor(intakeId: string, channel: Channel): AgentTools {
    return {
      async saveAnswers(fields, phone) {
        const i = await d.repo.get(intakeId);
        if (!i) return 'error: intake missing';
        let nextPhone = i.phone;
        if (phone !== undefined && channel === 'web' && !i.householdId) {
          try { nextPhone = normalizePhone(phone); } catch { return 'That is not a valid US mobile number. Ask again.'; }
        }
        const merged = mergeFields(i.fields, fields);
        try { screenApplications(merged, now()); } catch {
          return 'Not saved: these answers are invalid or inconsistent. Check income, household counts and the last answer before trying again.';
        }
        const changed = JSON.stringify(merged) !== JSON.stringify(i.fields) || nextPhone !== i.phone;
        await d.repo.save({ ...i, phone: nextPhone, fields: merged, status: changed ? 'collecting' : i.status });
        const missing = missingFields(merged);
        return missing.length ? `Saved. Still need: ${missing.join(', ')}.`
          : nextPhone ? 'Saved. Every field is known: call send_confirmation_text.'
            : 'Saved. Every field is known: ask for their mobile number so you can text a summary to confirm.';
      },
      sendConfirmationText: () => requestConfirmation(intakeId),
      checkEligibility: async () => checkFor(intakeId),
      screenApplications: async () => JSON.stringify(screenApplications((await d.repo.get(intakeId))?.fields ?? {}, now())),
    };
  }

  async function agentReply(intakeId: string, thread: string, channel: Channel, opts: { imageUrls?: string[]; note?: string } = {}) {
    const i = (await d.repo.get(intakeId))!;
    const state = describeState(i, i.householdId ? await d.getHousehold(i.householdId) : undefined);
    const reply = await d.runAgent({
      channel, history: await d.repo.getThread(thread, 40), imageUrls: opts.imageUrls,
      state: opts.note ? `${state}\n\nRight now: ${opts.note}` : state,
      tools: toolsFor(intakeId, channel),
    });
    await record(thread, channel === 'voice' ? 'sms' : channel, 'assistant', reply);
    return reply;
  }

  /** YES by text: write the household, link any web session, then tell them what they likely get. */
  async function confirm(pending: Intake, phone: string): Promise<void> {
    const hid = householdId(phone);
    const before = await d.getHousehold(hid);
    const own = await phoneIntake(phone, 'sms');
    const fields = mergeFields(before ? fieldsFromHousehold(before) : {}, pending.fields);
    const h = toHousehold(hid, before?.orgId ?? d.orgId, phone, fields);
    await d.upsertHousehold(h);
    const t = now().toISOString();
    if (isWebIntake(pending.id)) {
      await d.repo.save({ ...pending, status: 'confirmed', householdId: hid, confirmedAt: t });
      await d.repo.moveThread(pending.id, hid); // the web chat now reads the shared thread
    }
    await d.repo.save({ ...own, fields, status: 'confirmed', householdId: hid, confirmedAt: t });
    await safe('logEvents', d.logEvents(hid, [
      ...(before ? [] : [{ type: 'Source', value: 'aid' } as const]),
      { type: 'County', value: h.county }, { type: 'HouseholdSize', value: h.size }, { type: 'IncomePctFpl', value: pctFpl(h) },
    ]));
    await safe('addTimeline', d.addTimeline(hid, before ? 'Info updated and confirmed by text' : 'Info confirmed by text'));
    const reply = await agentReply(hid, hid, 'sms', {
      note: 'they just replied YES and confirmed their info by text. Run check_eligibility and tell them what they likely qualify for.',
    });
    await d.sendText(phone, reply);
  }

  async function webView(sessionId: string): Promise<WebView> {
    const wid = webIntakeId(sessionId);
    const i = await d.repo.get(wid);
    const linkedIntake = i?.householdId ? await d.repo.get(i.householdId) : undefined;
    const active = linkedIntake ?? i;
    return {
      sessionId,
      status: active?.status ?? 'collecting',
      linked: Boolean(i?.householdId),
      missing: active ? missingFields(active.fields) : [],
      messages: (await d.repo.getThread(i?.householdId ?? wid, 100)).filter(m => m.channel !== 'system'),
      screening: screenApplications(active?.fields ?? {}, now()),
    };
  }

  return {
    requestConfirmation,

    async smsContext(rawPhone: string) {
      const phone = normalizePhone(rawPhone);
      const hid = householdId(phone);
      const [household, intake, awaiting] = await Promise.all([
        d.getHousehold(hid), d.repo.get(hid), d.repo.latestAwaiting(phone),
      ]);
      return { hasConfirmedRecord: Boolean(household), confirmed: Boolean(household && (!intake || intake.status === 'confirmed')), awaitingConfirmation: Boolean(awaiting) };
    },

    async recordChannelMessage(rawPhone: string, role: 'user' | 'assistant', content: string, options: { mirror?: boolean } = {}) {
      const hid = householdId(normalizePhone(rawPhone));
      return serialized(hid, () => options.mirror === false
        ? d.repo.appendMessage(hid, 'sms', role, content)
        : record(hid, 'sms', role, content));
    },

    /** A text arrived on our Dial number. Returns the reply that was sent (or null). */
    handleSms(rawFrom: string, body: string, imageUrls: string[] = []): Promise<string | null> {
      const phone = normalizePhone(rawFrom);
      const hid = householdId(phone);
      return serialized(hid, async () => {
        await record(hid, 'sms', 'user', body || (imageUrls.length ? '[photo]' : ''));
        const pending = await d.repo.latestAwaiting(phone);
        const answer = parseConfirmationReply(body);
        if (answer === 'stop') return null; // carrier handles the opt-out reply
        if (pending && answer === 'yes') { await confirm(pending, phone); return 'confirmed'; }
        if (pending && answer === 'no' && isWebIntake(pending.id)) {
          await d.repo.save({ ...pending, status: 'rejected' });
          const msg = 'Okay, I won\'t use that. Sorry for the bother. If you ever want help with benefits, just text here.';
          await record(hid, 'sms', 'assistant', msg);
          await d.sendText(phone, msg);
          return msg;
        }
        let own = await phoneIntake(phone, 'sms');
        if (pending && isWebIntake(pending.id)) {
          // They're fixing the web answers by text: carry them over to this phone's intake. The web session stays
          // unlinked, so whoever typed in the web chat never sees this phone's history.
          own = { ...own, fields: mergeFields(own.fields, pending.fields), status: 'collecting' };
          await d.repo.save({ ...pending, status: 'superseded' });
        }
        await d.repo.save(own);
        const reply = await agentReply(hid, hid, 'sms', { imageUrls });
        await d.sendText(phone, reply);
        return reply;
      });
    },

    /** Someone called our Dial number and Dial's voice agent took their answers. */
    handleInboundCall(rawFrom: string, transcript: string): Promise<void> {
      const phone = normalizePhone(rawFrom);
      const hid = householdId(phone);
      return serialized(hid, async () => {
        if (!transcript.trim()) return; // hung up before saying anything: don't text a stranger
        await record(hid, 'voice', 'user', `(phone call transcript)\n${transcript}`);
        const { fields, notes } = await d.extractFromCall(transcript);
        const own = await phoneIntake(phone, 'voice');
        const merged = mergeFields(own.fields, fields);
        try { screenApplications(merged, now()); } catch {
          await d.repo.save(own);
          const reply = await agentReply(hid, hid, 'voice', { note: 'The call contained inconsistent household counts or income. Those answers were not saved. Ask one clarifying question using the transcript.' });
          await d.sendText(phone, reply);
          return;
        }
        await d.repo.save({ ...own, channel: own.householdId ? own.channel : 'voice', fields: merged, status: 'collecting' });
        if (!missingFields(merged).length) { await requestConfirmation(hid); return; }
        const reply = await agentReply(hid, hid, 'voice', {
          note: `they just hung up a phone call with Lumin (transcript above${notes ? `; call notes: ${notes}` : ''}). Text them a short follow-up asking for what is still needed.`,
        });
        await d.sendText(phone, reply);
      });
    },

    createWebSession(): { sessionId: string } {
      return { sessionId: randomUUID() };
    },

    /** A message in the website chat. The reply goes back in the HTTP response. */
    handleWeb(sessionId: string, text: string): Promise<{ reply: string; view: WebView }> {
      const wid = webIntakeId(sessionId);
      return serialized(wid, async () => {
        let i = await d.repo.get(wid);
        if (!i) {
          i = { id: wid, channel: 'web', phone: null, householdId: null, fields: {}, status: 'collecting',
            confirmationRequestedAt: null, confirmedAt: null, updatedAt: now().toISOString() };
          await d.repo.save(i);
        }
        if (i.status === 'rejected') {
          return { reply: 'The phone owner said this wasn\'t them, so this chat is closed. Start a new chat to try again.', view: await webView(sessionId) };
        }
        // Linked sessions talk on the phone's thread and edit the phone's intake, so text and chat stay in sync.
        const [intakeId, thread] = i.householdId ? [i.householdId, i.householdId] : [wid, wid];
        await record(thread, 'web', 'user', text);
        const reply = await agentReply(intakeId, thread, 'web');
        return { reply, view: await webView(sessionId) };
      });
    },

    webView,
  };
}

export type Conversation = ReturnType<typeof createConversation>;
