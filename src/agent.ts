// One Claude agent for every channel (text, web chat, and follow-ups after a phone call).
// It only runs the conversation and picks tools; eligibility is decided by the rules engine, and
// "did they confirm?" is decided by parseConfirmationReply, never by the model.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool, betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';
import type { Channel, IntakeFields } from './intake.js';
import type { ThreadMessage } from './intakeStore.js';
import { ScreeningFieldsSchema } from './applicationScreening.js';
import { AgentDetailsSchema, type AgentDetailsInput } from './workflow/applicationDetails.js';

// Neon AI Gateway when configured (Anthropic-compatible, served from Bedrock), else the Anthropic API directly.
const gateway = () => process.env.NEON_AI_GATEWAY_BASE_URL && process.env.NEON_AI_GATEWAY_TOKEN
  ? { baseURL: `${process.env.NEON_AI_GATEWAY_BASE_URL.replace(/\/$/, '')}/anthropic`, apiKey: process.env.NEON_AI_GATEWAY_TOKEN }
  : undefined;
export const MODEL = process.env.AID_MODEL || 'claude-opus-5-5'; // the gateway doesn't serve claude-sonnet-5-5

let client: Anthropic | undefined;
const claude = () => (client ??= new Anthropic(gateway() ?? {}));
// Server-side refusal fallbacks exist only on the Anthropic API; the gateway's Bedrock upstream rejects the field.
const fallback = () => (gateway() ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const });

// Matches Household (contracts.ts). Every field optional: the agent saves answers as it hears them.
export const FieldsSchema = z.object({
  firstName: z.string().min(1).max(40),
  county: z.enum(['los_angeles', 'san_francisco']),
  size: z.number().int().min(1).max(20).describe('People who live and eat together, including the person'),
  monthlyIncome: z.number().min(0).max(100_000).describe('Gross household income per MONTH in USD, before taxes'),
  childrenUnder18: z.number().int().min(0).max(15),
  pregnant: z.boolean().describe('Is anyone in the household pregnant'),
  adultAge: z.number().int().min(14).max(120),
  immigrationStatus: z.enum(['citizen', 'green_card', 'humanitarian', 'undocumented', 'unknown'])
    .describe('Use "unknown" if they prefer not to say'),
  childrenAreCitizens: z.boolean().describe('True if there are no children'),
}).partial().extend(ScreeningFieldsSchema.shape);

export interface AgentTools {
  /** Save answers to the working intake (never the confirmed record). Returns a status line for the model. */
  saveAnswers(fields: IntakeFields, phone?: string): Promise<string>;
  /** Text the person a summary to confirm. Returns a status line for the model. */
  sendConfirmationText(): Promise<string>;
  /** Run the rules engine on the confirmed household. */
  checkEligibility(): Promise<string>;
  /** Preliminary application suggestions from answers collected so far; no submission. */
  screenApplications(): Promise<string>;
  /**
   * Save application details (legal name, birth date, address, household members, job, rent, interview).
   * Goes to the linked applicant account, else to the intake until a chat is linked. Returns a status line.
   */
  saveApplicationDetails(details: AgentDetailsInput): Promise<string>;
}

export interface AgentTurn {
  channel: Channel;                // where the reply is going
  history: ThreadMessage[];        // the shared thread from every channel, oldest first, ending with what we're answering
  imageUrls?: string[];            // public Dial media URLs (pay stubs, IDs…) attached to the newest message
  state: string;                   // current intake state + any one-off instruction, rendered by the conversation service
  tools: AgentTools;
}

const SYSTEM = `You are Lumin, a warm, plain-spoken automated California benefits helper. People reach you by text message, by phone call, or in a chat on our website; it is the same case and the same history no matter which they use. Messages in the history are tagged with where they came from.

Goal: help the person find applications that fit their answers: CalFresh, Medi-Cal, CalWORKs, General Relief, CFAP, Section 8, PG&E CARE/FERA, WIC and California LifeLine. LIHEAP, IHSS and child care currently have referral coverage only.

How to work:
- One question at a time, 6th-grade reading level. Reply in Spanish if they write in Spanish.
- Collect: first name, county (Los Angeles or San Francisco only for now), household size, gross monthly income, kids under 18, whether anyone is pregnant, their age, and immigration status (optional: say it is private, only used to find programs that fit, and "prefer not to say" is fine). If there are kids, ask whether the kids are U.S. citizens.
- Call save_answers as soon as you learn anything, even one field. Never guess a value. Income: convert hourly or weekly pay to monthly (weekly x 4.33; hourly x hours per week x 4.33). If you can't convert confidently, ask a follow-up.
- After saving answers, call screen_applications to identify preliminary matches and missing information. Screening can run before phone confirmation and does not submit anything. Explain likely matches and ask one relevant follow-up from the tool; do not require every supplemental answer before showing useful matches. Unknown is not false and never means ineligible.
- Reuse answers only when the program's household definition matches. PG&E needs all residents' annual gross income; LifeLine needs the economic household sharing income and expenses; WIC needs its own family size and income. Ask to confirm these rather than copying the food household count. Never treat a likely match or pending application as actual benefit enrollment. For the qualifying-program fields, confirm current participation in a program on that agency's list; if unclear leave the field absent.
- Preliminary suggestions are allowed while collecting answers. Before saving a confirmed case, call send_confirmation_text when the required base fields are known and tell them to reply YES. If in web chat without a mobile number, explain why it is needed and save it with save_answers.
- After the info is confirmed, call check_eligibility and summarize likely matches, reasons, application routes and what still needs checking. Agencies make final decisions. Do not invent benefit amounts, combine mutually exclusive programs, or promise a yearly total. Referral-only results are not qualification findings. If the tool says rules need updating, do not infer eligibility from remembered limits.
- If they change an answer after confirming, save it and send a new confirmation text.
- Applying: after eligibility is discussed and they say they want to apply, collect the remaining application details one question at a time: legal first and last name, date of birth, home address (or whether they are experiencing homelessness), each other household member's name, date of birth and relationship to them, whether anyone has a job (employer, how often paid, pay before taxes, hours per week), rent or mortgage per month, and phone or in-person interview. Briefly explain these are for the application form. Call save_application_details right after each answer (for a household member, once you know their name, date of birth and relationship). The tool says what is still missing; ask for that next. These details do not need a new confirmation text.
- Never promise approval. Never ask for Social Security numbers, bank logins or passwords. If they seem to be in crisis, tell them to call or text 211 (or 911 for emergencies).`;

const STYLE: Record<Channel, string> = {
  sms: 'You are replying by text message: keep it under 320 characters, no markdown.',
  voice: 'You are texting someone who just called: keep it under 320 characters, no markdown.',
  web: 'You are replying in the website chat: short paragraphs, no markdown headings, under 120 words.',
};
const TAG: Record<ThreadMessage['channel'], string> = { sms: 'text', voice: 'phone call', web: 'web chat', system: 'system' };

export function buildMessages(t: AgentTurn): Anthropic.Beta.BetaMessageParam[] {
  const msgs: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of t.history) {
    if (!msgs.length && m.role === 'assistant') continue; // first message must be the user's
    msgs.push({ role: m.role, content: m.role === 'user' ? `[${TAG[m.channel]}] ${m.content}` : m.content });
  }
  const last = msgs[msgs.length - 1];
  if (!last || last.role !== 'user') msgs.push({ role: 'user', content: `[${TAG[t.channel]}] (no new message)` });
  if (t.imageUrls?.length) {
    const tail = msgs[msgs.length - 1];
    tail.content = [
      ...t.imageUrls.map(url => ({ type: 'image' as const, source: { type: 'url' as const, url } })),
      { type: 'text' as const, text: tail.content as string },
    ];
  }
  // Operator-side state goes in a mid-conversation system message, not in the person's turn.
  msgs.push({ role: 'system', content: `${STYLE[t.channel]}\n\nCurrent case state:\n${t.state}` });
  return msgs;
}

export async function runAgentTurn(t: AgentTurn): Promise<string> {
  const tools = [
    betaZodTool({
      name: 'save_answers',
      description: 'Save any answers the person just gave (any subset of fields). Include `phone` only when they typed their mobile number in the web chat.',
      inputSchema: FieldsSchema.extend({ phone: z.string().max(30).optional() }),
      run: async ({ phone, ...fields }) => t.tools.saveAnswers(fields, phone),
    }),
    betaZodTool({
      name: 'send_confirmation_text',
      description: 'Text the person a summary of their answers so they can reply YES to confirm. Only when every field is known.',
      inputSchema: z.object({}),
      run: async () => t.tools.sendConfirmationText(),
    }),
    betaZodTool({
      name: 'screen_applications',
      description: 'Find preliminary application matches from the current answers, including incomplete intake. Returns reasons, targeted follow-up questions, source dates and application links. Does not submit or approve anything.',
      inputSchema: z.object({}),
      run: async () => t.tools.screenApplications(),
    }),
    betaZodTool({
      name: 'save_application_details',
      description: 'Save application details the person just gave (any subset), for filling out their application: legal name, date of birth, address or homelessness, one other household member at a time, job and pay, monthly rent, interview preference. Never SSNs, bank details or passwords. Returns what is still missing.',
      inputSchema: AgentDetailsSchema,
      run: async (details) => t.tools.saveApplicationDetails(details),
    }),
    betaZodTool({
      name: 'check_eligibility',
      description: 'Screen applications using confirmed answers. Returns likely matches, missing facts and application routes; never an agency decision.',
      inputSchema: z.object({}),
      run: async () => t.tools.checkEligibility(),
    }),
  ];

  const final = await claude().beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    messages: buildMessages(t),
    tools,
    max_iterations: 6,
    output_config: { effort: 'low' }, // conversational turns; raise if tool choice gets sloppy
    ...fallback(),
  });
  if (final.stop_reason === 'refusal') return 'Sorry, I can’t help with that here. For other help, call or text 211.';
  const text = final.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
  return text || 'Got it. One moment.';
}

// ── Phone calls: Dial's own voice agent talks to the caller; afterwards we pull the answers out of the transcript ──

const Extracted = z.object({
  fields: FieldsSchema.describe('Only what the caller clearly stated. Leave a field out if it was not said or was unclear.'),
  notes: z.string().max(400).describe('Anything else useful for the caseworker, e.g. what they asked for. Empty if nothing.'),
});

export async function extractFromCall(transcript: string): Promise<{ fields: IntakeFields; notes: string }> {
  const res = await claude().beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: 'medium', format: betaZodOutputFormat(Extracted) },
    ...fallback(),
    system: 'You read transcripts of phone calls between Lumin (an automated benefits helper) and a caller, and pull out the caller\'s answers. Never guess. Convert weekly pay to monthly (x 4.33) and hourly pay to monthly only when hours per week were stated. "Prefer not to say" for immigration status means "unknown".',
    messages: [{ role: 'user', content: `<transcript>\n${transcript}\n</transcript>` }],
  });
  if (res.stop_reason === 'refusal' || !res.parsed_output) return { fields: {}, notes: '' };
  return res.parsed_output;
}

/** Prompt for Dial's voice agent when someone calls our number (set with scripts/dial-setup.ts). */
export const INBOUND_CALL_INSTRUCTION = `You are Lumin, a friendly automated helper for California benefits including food, health, cash aid, WIC, PG&E CARE/FERA and California LifeLine. Say up front that you are an automated assistant. After the call, Lumin saves clearly stated answers, screens applications, and follows up by text. You cannot look up the caller's existing case during this call or make final eligibility decisions.
Ask these one at a time, in plain words, and wait for each answer:
1. Their first name.
2. Which county they live in (we serve Los Angeles and San Francisco right now).
3. How many people live and eat together in their home, and how many are under 18.
4. About how much the household earns before taxes, and whether that is per hour, week or month (if hourly, ask hours per week).
5. Whether anyone in the home is pregnant.
6. Their age.
7. Optional: their immigration status, and whether the kids are U.S. citizens. Say it is private, only used to find programs that fit, and they can skip it.
Ask what kind of help they want. Only ask relevant follow-ups, one at a time; unanswered questions stay unknown:
- Food for a young child or pregnancy: children under five, breastfeeding a baby under one, or a pregnancy ending in the past six months. Ask about current Medi-Cal, CalFresh, CalWORKs or FDPIR. WIC staff confirm the family's income eligibility; do not decide it on the call.
- Energy bills: whether PG&E supplies gas or electricity; whether the energy bill (including a landlord's bill) is in their name and for their primary home; all residents at that address and their combined annual gross income. Do not silently reuse the food household. Ask about current qualifying assistance, not a pending application. Later texts can clarify tax dependency or shared meters.
- Phone discounts: whether the economic household sharing income and living expenses already has LifeLine, its size and annual gross income, or current participation in a qualifying assistance program. Do not silently reuse another program's household.
- Other help: whether they need energy-bill assistance, help with daily activities at home, or child care. These are referrals, not approvals.
If they already gave Lumin information, collect corrections and any new answers they want to share; do not claim you can read their web chat. Do not force a full repeated intake. Then read the answers back and fix anything they correct. Finish by saying: "Lumin will follow up by text. When you receive a summary, reply YES if it's right. We'll help you explore applications that may fit." Never ask for a Social Security number, bank details or passwords. Do not promise approval or claim an application was submitted. If they are in crisis, tell them to call 211 or 911.`;
