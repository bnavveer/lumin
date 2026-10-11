// Text-message consent (TCPA/CTIA): exact wording + timestamp are stored for every opt-in / opt-out.
import type { ConversationDeps } from './deps.js';
import { T } from './prompts.js';

export const CONSENT_VERSION = 'sms-consent-v1';

export const consentWording = (clinic: string): string => T.consentAsk(clinic);

export async function recordConsent(
  deps: ConversationDeps, hid: string, clinic: string, reply: string, channel: string,
): Promise<void> {
  await deps.repo.addConsent(hid, 'sms_contact', `[${CONSENT_VERSION}] ${consentWording(clinic)}`, reply, channel);
  await deps.repo.addTimeline(hid, 'Agreed to get help by text');
}

export async function recordOptOut(deps: ConversationDeps, hid: string, reply: string, channel: string): Promise<void> {
  await deps.repo.addConsent(hid, 'opt_out', T.optOut(), reply, channel);
  await deps.repo.addTimeline(hid, 'Opted out of texts');
}

export async function recordOptIn(deps: ConversationDeps, hid: string, reply: string, channel: string): Promise<void> {
  await deps.repo.addConsent(hid, 'opt_in', T.optIn(), reply, channel);
  await deps.repo.addTimeline(hid, 'Opted back in to texts');
}
