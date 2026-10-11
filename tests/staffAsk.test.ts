import { afterEach, describe, expect, it, vi } from 'vitest';
import { askStaffQuestion, setAskDeps, SYSTEM_PROMPT } from '../src/staffAsk.js';

afterEach(() => { setAskDeps(); delete process.env.DEMO_MODE; vi.restoreAllMocks(); });
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('askStaffQuestion', () => {
  it('rejects empty and over-long questions without calling the model', async () => {
    const generate = vi.fn();
    setAskDeps({ generate: generate as never, tools: async () => ({}) });
    await expect(askStaffQuestion('')).rejects.toThrow('1 to 500');
    await expect(askStaffQuestion('   ')).rejects.toThrow('1 to 500');
    await expect(askStaffQuestion('x'.repeat(501))).rejects.toThrow('1 to 500');
    expect(generate).not.toHaveBeenCalled();
  });
  it('passes question, tools, system prompt and step limit to generateText', async () => {
    const generate = vi.fn(async () => ({ text: ' 124 households and 1,486 events. ' }));
    const tools = { run_sql_query: {} } as never;
    setAskDeps({ generate: generate as never, tools: async () => tools });
    const out = await askStaffQuestion('How many users?');
    expect(out).toBe('124 households and 1,486 events.');
    const args = (generate.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(args.prompt).toBe('How many users?');
    expect(args.tools).toBe(tools);
    expect(args.system).toBe(SYSTEM_PROMPT);
    expect(args.stopWhen).toBeDefined();
    expect(args.abortSignal).toBeInstanceOf(AbortSignal);
  });
  it('system prompt explains the data model', () => {
    for (const w of ['Source', 'baseline', 'AgentTurnMs', 'NudgeVariant', 'EscalatedToHuman', 'never invent']) {
      expect(SYSTEM_PROMPT.toLowerCase()).toContain(w.toLowerCase());
    }
  });
  it('throws when generation fails and demo mode is off', async () => {
    quiet();
    setAskDeps({ generate: (async () => { throw new Error('rate limited'); }) as never, tools: async () => ({}) });
    await expect(askStaffQuestion('hi')).rejects.toThrow('[staffAsk]');
  });
  it('falls back to the demo answer when DEMO_MODE=true', async () => {
    quiet();
    process.env.DEMO_MODE = 'true';
    setAskDeps({ generate: (async () => { throw new Error('down'); }) as never, tools: async () => ({}) });
    const out = await askStaffQuestion('who is on the waitlist?');
    expect(out).toContain('Marcus');
  });
});
