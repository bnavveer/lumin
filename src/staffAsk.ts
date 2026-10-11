// Staff "Ask Aid" box: Claude answers questions by querying Keewano through its MCP server.
import { anthropic } from '@ai-sdk/anthropic';
import { generateText, stepCountIs, dynamicTool, jsonSchema, type ToolSet } from 'ai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { env } from './env.js';
import { demoAnswer, isDemoMode } from './demo.js';

const MCP_URL = 'https://api.keewano.com/mcp';
const MODEL = 'claude-sonnet-5-5';
const MAX_Q = 500;
const TIMEOUT_MS = 45_000;
const MAX_STEPS = 8;

export const SYSTEM_PROMPT = `You are Aid's analytics assistant for county benefits caseworkers. You answer questions about the Aid program by querying the Keewano analytics project through your tools (use run_sql_query first; call get_tool_guide if SQL syntax is unclear; list_event_types shows the catalog).

Data model: every Keewano user is one household (user_id = household id). Every event describes that household's case:
County (string), HouseholdSize (uint), IncomePctFpl (uint), Source ('aid' = handled by the Aid agent, 'baseline' = comparison cohort handled the manual way), Screened (csv of likely programs), DocsRequested (count), DocReceived (doc type), PacketSigned, ApplicationSubmitted (program), InterviewScheduled (timestamp of the interview), InterviewConfirmed, CallPlaced (purpose), CallOutcome, Approved (program), RenewalDue (timestamp), NudgeSent (action kind), UserReplied, WaitlistStatus ('open' or 'closed').
Agent self-observation events: AgentToolCalled (tool name), AgentTurnMs (latency of one agent turn in ms), EscalatedToHuman (reason), NudgeVariant (which message wording was sent, for A/B testing).
Other events in the project are generic Keewano SDK events and are usually irrelevant. Event names are columns and must be double-quoted in SQL, e.g. "Source". Columns hold their last value forward in a user's timeline. Compare Source = 'aid' against 'baseline' for impact questions.

Answer in 2 to 4 sentences with real numbers from the query results. Never invent numbers: if the data is empty or a query fails, say so plainly. No markdown tables.`;

type GenerateFn = typeof generateText;
interface Deps { generate: GenerateFn; tools?: () => Promise<ToolSet> }
const defaults = (): Deps => ({ generate: generateText });
let deps: Deps = defaults();

/** Test seam: inject generateText and/or the tool set. Call with no args to restore defaults. */
export function setAskDeps(d: { generate?: GenerateFn; tools?: () => Promise<ToolSet> } = {}): void {
  deps = { ...defaults(), ...d };
}

let mcp: Client | undefined;
async function getMcpTools(): Promise<ToolSet> {
  if (!mcp) {
    const client = new Client({ name: 'aid-staff-ask', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), {
      requestInit: { headers: { 'k-token': env('KEEWANO_PAT') } },
    }));
    mcp = client;
  }
  const projectId = process.env.KEEWANO_PROJECT_ID;
  const { tools } = await mcp.listTools();
  const set: ToolSet = {};
  for (const t of tools) {
    set[t.name] = dynamicTool({
      description: `${t.description ?? ''}${projectId ? ` (Our projectId is ${projectId}.)` : ''}`.slice(0, 1500),
      inputSchema: jsonSchema(t.inputSchema as Parameters<typeof jsonSchema>[0]),
      execute: async (args) => {
        const res = await mcp!.callTool({ name: t.name, arguments: args as Record<string, unknown> });
        const text = (res.content as Array<{ type: string; text?: string }>).map(c => c.text ?? '').join('\n');
        return res.isError ? `Tool error: ${text}` : text;
      },
    });
  }
  return set;
}

async function resetMcp(): Promise<void> {
  const c = mcp;
  mcp = undefined;
  try { await c?.close(); } catch { /* already closed */ }
}

export async function askStaffQuestion(q: string): Promise<string> {
  const question = typeof q === 'string' ? q.trim() : '';
  if (question.length < 1 || question.length > MAX_Q) throw new Error(`question must be 1 to ${MAX_Q} characters`);
  try {
    const tools = await (deps.tools ?? getMcpTools)();
    const { text } = await deps.generate({
      model: anthropic(MODEL),
      system: SYSTEM_PROMPT,
      prompt: question,
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const answer = text.trim();
    if (!answer) throw new Error('empty answer');
    return answer;
  } catch (err) {
    if (!deps.tools) await resetMcp();
    console.error('[staffAsk] failed:', err);
    if (isDemoMode()) return demoAnswer(question);
    throw new Error(`[staffAsk] could not answer: ${err instanceof Error ? err.message : String(err)}`);
  }
}
