// ai@5 tools for the conversation agent. Every tool wraps an existing module; consequential actions
// can only be PROPOSED (pending approval), never executed from here.
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import type { Household, Program } from '../contracts.js';
import { checkEligibility, pctFpl } from '../eligibility.js';
import { proposeAction } from './approvals.js';
import { bg, type ConversationDeps } from './deps.js';
import type { Approval, ConversationState } from './state.js';
import { APPROVAL_KINDS } from './state.js';
import { docsText, likelyPrograms, statusText } from './status.js';
import { T } from './prompts.js';

export interface TurnContext {
  deps: ConversationDeps;
  household: Household;
  state: ConversationState;
  clinic: string;
  proposed: Approval[];
  escalated: boolean;
}

export const screened = (ctx: TurnContext): boolean => ctx.state.pendingContext.screened === true || ctx.state.stage === 'active';

export const HouseholdInput = z.object({
  firstName: z.string().max(80).optional(),
  county: z.enum(['los_angeles', 'san_francisco']),
  size: z.number().int().min(1).max(20),
  monthlyIncome: z.number().min(0).max(100000),
  childrenUnder18: z.number().int().min(0).max(20),
  pregnant: z.boolean(),
  adultAge: z.number().int().min(15).max(120),
  immigrationStatus: z.enum(['citizen', 'green_card', 'humanitarian', 'undocumented', 'unknown']),
  childrenAreCitizens: z.boolean(),
}).refine(h => h.childrenUnder18 <= h.size, {
  message: 'Children under 18 cannot exceed the household size.', path: ['childrenUnder18'],
});

const matchesBrief = (h: Household) => checkEligibility(h).map((m) => ({
  program: m.program, status: m.status, estMonthlyValue: m.estMonthlyValue, reason: m.reason, docs: m.docs,
}));

export function buildTools(ctx: TurnContext): ToolSet {
  const { deps } = ctx;
  const hid = ctx.household.id;
  const logged = <A, R>(name: string, fn: (a: A) => Promise<R>) => async (a: A): Promise<R | { error: string }> => {
    bg(deps.logEvent(hid, { type: 'AgentToolCalled', value: name }), `log ${name}`);
    try { return await fn(a); } catch (err) {
      console.error(`[conversation] tool ${name} failed:`, err instanceof Error ? err.message : err);
      return { error: 'That lookup failed. Tell the person you will check and follow up, or offer HUMAN.' };
    }
  };

  return {
    update_household: tool({
      description: 'Save the full household screening profile (replaces any partial one) and return what they likely qualify for.',
      inputSchema: HouseholdInput,
      execute: logged('update_household', async (input: z.infer<typeof HouseholdInput>) => {
        if (screened(ctx)) return {
          error: 'Your existing household needs an intake correction and a fresh confirmation text. No profile changes were saved.',
        };
        const parsed = HouseholdInput.safeParse(input);
        if (!parsed.success) return { error: 'Check the household counts and answers. No profile changes were saved.' };
        const h: Household = { ...ctx.household, ...parsed.data };
        await deps.repo.upsertHousehold(h);
        ctx.household = h;
        ctx.state = { ...ctx.state, stage: 'active', pendingContext: { ...ctx.state.pendingContext, screened: true } };
        const likely = likelyPrograms(h, true);
        bg(Promise.all([
          deps.logEvent(hid, { type: 'Source', value: 'aid' }),
          deps.logEvent(hid, { type: 'County', value: h.county }),
          deps.logEvent(hid, { type: 'HouseholdSize', value: h.size }),
          deps.logEvent(hid, { type: 'IncomePctFpl', value: pctFpl(h) }),
          deps.logEvent(hid, { type: 'Screened', value: likely.join(',') }),
        ]), 'log screening');
        await deps.repo.addTimeline(hid, `Screened by text: likely ${likely.join(', ') || 'none'}`);
        return { saved: true, pctFpl: pctFpl(h), matches: matchesBrief(h) };
      }),
    }),
    check_eligibility: tool({
      description: 'Check which programs the screened household likely qualifies for.',
      inputSchema: z.object({}),
      execute: logged('check_eligibility', async () =>
        screened(ctx) ? { matches: matchesBrief(ctx.household) } : { error: 'Not screened yet: collect answers and call update_household.' }),
    }),
    vault_status: tool({
      description: 'Which documents Lumin already has for this person and which are still missing.',
      inputSchema: z.object({}),
      execute: logged('vault_status', async () => ({ summary: await docsText(deps, ctx.household, screened(ctx)) })),
    }),
    request_document: tool({
      description: 'Ask the person for a specific document (records the request).',
      inputSchema: z.object({
        docType: z.enum(['id', 'paystub', 'lease', 'ssn_card', 'birth_cert', 'immigration', 'other']),
        reason: z.string().min(1).max(200),
      }),
      execute: logged('request_document', async ({ docType, reason }: { docType: Parameters<ConversationDeps['requestDocument']>[1]; reason: string }) => {
        await deps.requestDocument(hid, docType, reason);
        return { requested: docType, tell: 'Ask them to text a photo of it right here.' };
      }),
    }),
    answer_question: tool({
      description: 'Answer a benefits question (how to apply, what to bring, rules, office info) from sourced research, then the web.',
      inputSchema: z.object({ question: z.string().min(1).max(400) }),
      execute: logged('answer_question', async ({ question }: { question: string }) => ({
        answer: await deps.answerQuestion(question, { county: ctx.household.county, lang: ctx.state.language }),
      })),
    }),
    find_local_resources: tool({
      description: 'Find real local places (food, WIC, county office, legal aid, housing) near the person.',
      inputSchema: z.object({ need: z.enum(['food', 'wic', 'county_office', 'legal_aid', 'housing']), zip: z.string().regex(/^\d{5}$/).optional() }),
      execute: logged('find_local_resources', async ({ need, zip }: { need: string; zip?: string }) => ({
        places: await deps.findResources(need, ctx.household.county, zip),
      })),
    }),
    propose_action: tool({
      description: 'Propose a consequential action (submit application, fill BenefitsCal, call an office, reuse documents, start renewal). It ONLY creates a request; the person must reply YES. Lumin appends the YES/NO question automatically.',
      inputSchema: z.object({
        kind: z.enum(APPROVAL_KINDS as unknown as [string, ...string[]]),
        description: z.string().min(5).max(200).describe('Short context note shown in quotes after the fixed action text.'),
        programs: z.array(z.enum(['calfresh', 'medi_cal', 'calworks', 'general_relief', 'cfap', 'section8'])).optional(),
        purpose: z.enum(['apply_by_phone', 'reschedule_interview', 'waitlist_check', 'status_check']).optional(),
      }),
      execute: logged('propose_action', async (a: { kind: string; description: string; programs?: Program[]; purpose?: string }) => {
        const payload: Record<string, unknown> = {
          ...(a.programs ? { programs: a.programs } : {}), ...(a.purpose ? { purpose: a.purpose } : {}),
        };
        const approval = await proposeAction(deps, hid, a.kind as Approval['kind'], payload, a.description);
        ctx.proposed.push(approval);
        return { pending: true, approvalId: approval.id, tell: 'Lumin will append the exact YES/NO question itself. Do NOT ask for YES/NO or restate the action; at most add one short sentence of context.' };
      }),
    }),
    get_status: tool({
      description: 'Current case status: submitted programs, next interview, missing documents, pending approvals.',
      inputSchema: z.object({}),
      execute: logged('get_status', async () => ({ status: await statusText(deps, ctx.household, screened(ctx)) })),
    }),
    escalate_to_human: tool({
      description: 'Hand the case to a human caseworker (person asked, upset, crisis, or something Lumin cannot handle).',
      inputSchema: z.object({ reason: z.enum(['requested', 'upset', 'crisis', 'complex', 'other']) }),
      execute: logged('escalate_to_human', async ({ reason }: { reason: string }) => {
        await escalate(ctx, reason);
        return { escalated: true, tell: T.human(ctx.clinic) };
      }),
    }),
  };
}

export async function escalate(ctx: Pick<TurnContext, 'deps' | 'household' | 'escalated'>, reason: string): Promise<void> {
  bg(ctx.deps.logEvent(ctx.household.id, { type: 'EscalatedToHuman', value: reason }), 'log escalation');
  await ctx.deps.repo.addTimeline(ctx.household.id, `Asked for a caseworker (${reason})`);
  ctx.escalated = true;
}
