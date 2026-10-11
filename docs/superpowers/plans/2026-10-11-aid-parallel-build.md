# Aid: Two-Person Parallel Build Plan (SpeedHacks, Oct 11 2026)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to implement this plan task-by-task. Each human runs ONE lane in their own Claude Code session. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Aid is an AI caseworker. A person texts or calls a phone number. The agent screens them for six California programs and collects documents by photo. It submits the applications itself, and makes the phone calls (waiting on hold, then handing off to the person). It keeps every case moving until approval, using each household's case history in Keewano to decide what to do next.

**Architecture:**
- One Node/TypeScript process runs everything:
  - a Dial event loop (text messages in and out, call transcripts)
  - a Claude agent with tools
  - an autopilot loop: every 2 minutes it asks Keewano which households need action, then acts
  - a Hono web server for the clinic dashboard, the review-and-sign page and a mock county intake portal
- Case events go to Keewano, typed and small, and Keewano drives every follow-up decision.
- Profiles, messages and transcripts (raw text) stay in local SQLite, because Keewano only accepts small typed events, not logs or raw text.

**Tech stack:**
- Node 22, TypeScript, `tsx`, Vitest
- Hono + `@hono/node-server`, `better-sqlite3`
- `ai@^5`, `@ai-sdk/anthropic`, `zod`, `@modelcontextprotocol/sdk`
- `@getdial/sdk`, `pg`, `uuid`, `dotenv`
- Claude model `claude-sonnet-5-5`

**Spec:** The design discussion in the planning session. The research it depends on is `research/*.md` (rule numbers are cited there).

## Global Constraints

- Deadline is **5:00 PM PT**. Feature freeze at **3:45 PM**. The demo video (5 minutes or less) is recorded by **4:30 PM**. Submit on HackerSquad by **4:45 PM**. Saving a draft does not count as submitting.
- California only. Six programs: **CalFresh, Medi-Cal, CalWORKs, General Relief, CFAP, Section 8**.
- **Demo county is Los Angeles County**, because its General Relief and Section 8 income limits are confirmed in `research/`. San Francisco has a config entry, but its General Relief (called CAAP) and Section 8 (50% of area median income) numbers are unconfirmed, so it returns "needs info" for those programs.
- Eligibility is decided by **deterministic rules**, never by the AI model. The AI only runs the conversation, picks tools, and pulls structured data from photos and transcripts.
- **Never call a real government office during the demo.** A teammate's phone (`DEMO_OFFICE_PHONE`) plays the county or housing authority.
- **Never submit to the real BenefitsCal.** Submission goes to the mock county portal at `/county`. The demo says this out loud.
- Keewano events are **small and typed** (none, string of 256 characters or less, uint, timestamp). No transcripts, message text or logs go to Keewano.
- Keewano must be **load-bearing**: the autopilot's list of who to contact comes only from Keewano queries. Removing Keewano means no follow-ups happen.
- Secrets live only in `.env`, which is gitignored (already set up; `KEEWANO_PAT` is already in it). Commit `.env.example` only.
- Dial: add money to the account first. That removes the 5-minute call limit and the 2-concurrent-call limit. Use **iMessage** for the demo thread, because unregistered US text numbers are blocked by carriers. Start the $25 carrier (10DLC) registration anyway.
- Add your Keewano project name to the HackerSquad submission.

## Review Focus

1. **Income given as hourly, weekly or "idk".** The agent must ask a follow-up question and convert to monthly before calling `checkEligibility`. `checkEligibility` throws on a non-finite or negative income (tested in Task B1).
2. **Duplicate Dial events** (reconnects, at-least-once delivery). The same event must never produce two replies. `store.markProcessed` returns false the second time (tested in Task B2).
3. **A double submission or double call from the autopilot.** The same household, action kind and day must run at most once. `store.claimAction` is idempotent (tested in Task B2).
4. **Mixed-status families** (undocumented parent with citizen children). Medi-Cal and CalFresh must still show the children as eligible, not say "not eligible" (tested in Task B1).
5. **Photos that can't be read** (HEIC, blurry, wrong document). The agent replies asking for a JPEG or a clearer photo and never crashes the loop (tested in Task A2; the loop also catches per-event errors in A1).

---

## Who does what

| | **Person A: "Voice & Hands"** | **Person B: "Brain & Memory"** |
|---|---|---|
| Owns | Dial, the Claude agent, calls (hold-and-handoff), packet and submission, the action executor, `main.ts` | Eligibility rules, SQLite store, Keewano (events, queries, MCP), autopilot queries, server, dashboard, seed data |
| Files | `src/dial.ts`, `src/agent.ts`, `src/calls.ts`, `src/submit.ts`, `src/actions.ts`, `src/main.ts`, `web/packet.html` | `data/programs.ts`, `src/eligibility.ts`, `src/store.ts`, `src/keewano.ts`, `src/autopilot.ts`, `src/staffAsk.ts`, `src/server.ts`, `web/dashboard.html`, `web/county.html`, `scripts/*` |
| Sponsor prize | Dial | Keewano |

`src/contracts.ts` is written together in Task 0. After 12:15 it is **frozen**. Any change goes through a quick spoken agreement between both people, plus `~/.alike/bin/alike it "contract: …"` so both agent sessions see the decision (this is also your Alike prize evidence; Alike pairing must be finished first with `npx @alikeai/setup --doctor`).

**Git:** both people commit to `main`. Because the files above are owned by one person each, there are no conflicts. Run `git pull --rebase` before every push. Commit small and often.

**Working against stubs:** until B's modules land, A imports them anyway and runs the A tests, which only exercise A's pure functions. A's first live run waits for Checkpoint 1.

## Timeline (now is about 11:50)

| Time | Person A | Person B |
|---|---|---|
| 11:50–12:15 | **Task 0 together:** project skeleton and `contracts.ts`. Then A sets up Dial: add money, buy a number, test iMessage | Task 0 together. Then B sets up Keewano: send `#SpeedHacks`, create the SDK key (PAT and MCP are already done) |
| 12:15–1:15 | A1 Dial client and event loop · A2 agent conversation | B1 eligibility and tests · B2 store |
| 1:15–2:15 | A3 calls (hold-and-handoff) · A4 packet and submission | B3 Keewano client · B4 seed history (**before 1:45**; new events take ~5 minutes to become queryable) |
| 2:15–2:45 | **Checkpoint 1** (both) | |
| 2:45–3:30 | A5 action executor and `main.ts` autopilot loop | B5 autopilot queries · B6 server, dashboard and staff "Ask" box |
| 3:30–3:45 | **Checkpoint 2:** full demo run-through twice | |
| 3:45–4:30 | Record the video (A drives the phone, B drives the dashboard) | Write the HackerSquad project form while A edits |
| 4:30–4:45 | **Submit.** Check it shows as "submitted" | |

**Cut list if behind at 2:45:** cut in this order: staff Ask box, then the metrics header, then the Section 8 waitlist call, then document photo understanding (just log `DocReceived` with the type the person says). **Never cut:** the Dial text thread, a live Keewano query driving the autopilot, or one hold-and-handoff call.

---

## How the agent submits by itself and keeps going

### Three ways Aid submits

| Path | What the agent does | Real-world version | In the hackathon |
|---|---|---|---|
| **1. Electronic submission** | Builds the application from the conversation and documents. The person reviews it and taps **Sign** on the packet page. The agent then submits it and gets back a confirmation number | A partner or authorized-representative channel into BenefitsCal or county systems | **Mock county portal** (`POST /county/api/applications`), which returns a confirmation number and shows it in the `/county` inbox. This is honestly mocked |
| **2. Lock in the start date immediately** | CalFresh can be filed with just name, address and signature, which locks in the benefit start date; documents follow later (see `research/links.md`). The agent files this minimal application **the moment the person signs**, then the full application later | Fax or upload of the minimal application form to the county | Same mock endpoint, `kind: "minimal"`; the autopilot's `submit` action sends `kind: "full"` |
| **3. By phone: hold-and-handoff** | A Dial voice agent calls the county or housing authority, navigates the phone menu, and waits on hold. When a live person answers, it gives the case summary and **transfers the call to the person** (`transferTo`), who confirms their identity and consent | The same, against real lines | `DEMO_OFFICE_PHONE` plays the county; `transferTo` is the person's phone |

**Guardrails:**
- Anything legally binding (the signature, statements under penalty of perjury, identity) needs the person's explicit action: ticking the declaration box and tapping Sign, or being on the phone themselves.
- The agent never signs on someone's behalf.
- The agent asks permission before requesting documents, preparing an application or calling an office.
- Every submission and call is recorded as a Keewano event and saved in SQLite, so there is a full record of what happened.
- Autopilot sends only to `AUTOPILOT_ALLOW` households during the demo, because the seeded households have fake numbers.

### The "keeps going" loop (autopilot)

```
 every 2 minutes (demo; 15 minutes in production)
   │
   ▼
 Keewano SQL (Postgres protocol): "which households match each stuck pattern?"
   │  interview scheduled, not confirmed            → interview_nudge (text)
   │  documents requested, none received            → docs_nudge (text)
   │  packet signed, nothing submitted              → submit (full application to the county)
   │  Section 8 waitlist last seen "closed"          → waitlist_check (Dial call)
   │  renewal due, no packet signed since           → renewal_start (text)
   ▼
 store.claimAction(householdId, kind, today)   ← idempotent, so no double texts or calls
   ▼
 actions.executeAction(action) → Dial text / Dial call / county submit → logEvent to Keewano
   ▼
 the next query sees the new event → the household drops off that list (the loop closes)
```

Event-driven triggers run alongside the loop:
- An incoming text goes to the agent turn.
- `call.transcribed` → extract the outcome → log `CallOutcome` → text the person.
- Signing the packet → submit the minimal application straight away.

Escalating to a human: the dashboard's "Needs a human" list shows any household with three or more `no_answer` call outcomes, or where the agent couldn't finish. That list is also driven by a Keewano query.

---

## File structure

```
aid/
  package.json  tsconfig.json  .env.example  .gitignore
  benefits-map.html                 (existing public screener; served at /screener)
  data/programs.ts                  B: thresholds and documents, each cited to research/
  src/contracts.ts                  BOTH (frozen): shared types and interfaces
  src/eligibility.ts                B: pure rules engine
  src/store.ts                      B: SQLite (households, messages, calls, processed events, claimed actions, submissions, display timeline)
  src/keewano.ts                    B: register event types, ingest, SQL client
  src/autopilot.ts                  B: Keewano queries → Action[]
  src/staffAsk.ts                   B: Claude + Keewano MCP answers staff questions
  src/server.ts                     B: Hono routes (dashboard API, packet, county mock)
  src/dial.ts                       A: Dial client wrapper and event loop
  src/agent.ts                      A: Claude conversation turn with tools
  src/calls.ts                      A: office calls, hold-and-handoff, outcome extraction
  src/submit.ts                     A: packet page and submission to the county mock
  src/actions.ts                    A: executes autopilot actions
  src/main.ts                       A: wires everything and starts the loops
  web/dashboard.html  web/county.html (B)   web/packet.html (A)
  scripts/register-events.ts  scripts/seed.ts (B)
  tests/*.test.ts
```

---

## Task 0 (both, 11:50–12:15): skeleton and frozen contracts

**Files:** Create `package.json`, `tsconfig.json`, `.env.example`, `src/contracts.ts`. Modify `.gitignore`.

- [ ] **Step 1: Initialize the project**

```bash
cd ~/aid
npm init -y
npm i hono @hono/node-server better-sqlite3 ai@^5 @ai-sdk/anthropic zod @modelcontextprotocol/sdk @getdial/sdk pg uuid dotenv
npm i -D typescript tsx vitest @types/node @types/better-sqlite3 @types/pg @types/uuid
npx tsc --init --target es2022 --module nodenext --moduleResolution nodenext --strict --skipLibCheck --outDir dist
npm pkg set type=module scripts.dev="tsx watch src/main.ts" scripts.test="vitest run"
printf "node_modules\n*.db\ndist\n" >> .gitignore
```

- [ ] **Step 2: Write `.env.example`**

```
ANTHROPIC_API_KEY=
DIAL_API_KEY=
DIAL_FROM_NUMBER_ID=
DEMO_OFFICE_PHONE=+1...         # teammate's phone; plays county / housing authority
DEMO_PERSON_B_PHONE=+1...       # receives the live autopilot nudge in the demo
KEEWANO_SDK_KEY=                # Settings → Project → API Keys (SDK type)
KEEWANO_PAT=kwpat-...           # Settings → Personal → Security
KEEWANO_PG_USER=you@email.com   # your Keewano signup email
KEEWANO_PROJECT_ID=             # Settings → Details → Project ID (the Postgres database name)
PUBLIC_BASE_URL=http://localhost:3000   # set to a cloudflared tunnel URL so the phone can open packet links
PORT=3000
AUTOPILOT_MS=120000
AUTOPILOT_ALLOW=                # comma-separated household ids allowed to receive real texts or calls
```

- [ ] **Step 3: Write `src/contracts.ts` (FROZEN after this)**

```ts
// Shared contract between Lane A and Lane B. Do not change without agreement + an `alike it` decision.
export type Program = 'calfresh' | 'medi_cal' | 'calworks' | 'general_relief' | 'cfap' | 'section8';
export type County = 'los_angeles' | 'san_francisco';
export type ImmigrationStatus = 'citizen' | 'green_card' | 'humanitarian' | 'undocumented' | 'unknown';

export interface Household {
  id: string;                 // uuidv5(phone, uuidv5.URL), also the Keewano installId
  phone: string;              // E.164
  firstName?: string;
  county: County;
  size: number;               // people who live and eat together, integer >= 1
  monthlyIncome: number;      // gross USD per month
  childrenUnder18: number;
  pregnant: boolean;
  adultAge: number;
  immigrationStatus: ImmigrationStatus;
  childrenAreCitizens: boolean;
}

export type MatchStatus = 'likely' | 'needs_info' | 'not_eligible';
export interface ProgramMatch {
  program: Program;
  status: MatchStatus;
  estMonthlyValue: number | null; // USD; null = non-cash (coverage, voucher) or unknown
  reason: string;                 // one plain-English sentence for the person
  docs: string[];
  applyVia: string;
}

export type CallPurpose = 'apply_by_phone' | 'reschedule_interview' | 'waitlist_check' | 'status_check';
export type CallOutcomeKind = 'transferred' | 'booked' | 'waitlist_open' | 'waitlist_closed' | 'no_answer' | 'info';
export type ActionKind = 'interview_nudge' | 'docs_nudge' | 'submit' | 'waitlist_check' | 'renewal_start';

// Keewano custom events (ids assigned in keewano.ts by position; append only)
export type CaseEvent =
  | { type: 'County'; value: County }
  | { type: 'HouseholdSize'; value: number }
  | { type: 'IncomePctFpl'; value: number }
  | { type: 'Source'; value: 'aid' | 'baseline' }
  | { type: 'Screened'; value: string }                 // csv of likely programs
  | { type: 'DocsRequested'; value: number }
  | { type: 'DocReceived'; value: string }              // id | paystub | lease | ssn_card | birth_cert | immigration | other
  | { type: 'PacketSigned' }
  | { type: 'ApplicationSubmitted'; value: Program }
  | { type: 'InterviewScheduled'; at: number }          // unix seconds
  | { type: 'InterviewConfirmed' }
  | { type: 'CallPlaced'; value: CallPurpose }
  | { type: 'CallOutcome'; value: CallOutcomeKind }
  | { type: 'Approved'; value: Program }
  | { type: 'RenewalDue'; at: number }
  | { type: 'NudgeSent'; value: ActionKind }
  | { type: 'UserReplied' }
  | { type: 'WaitlistStatus'; value: 'open' | 'closed' };

export interface Action {
  householdId: string;
  kind: ActionKind;
  source: 'keewano';          // load-bearing: actions only come from Keewano queries
  detail: string;             // shown on the dashboard
}

export interface PacketRoutes {
  renderPacket(householdId: string): string;
  sign(householdId: string): Promise<void>;
}

// ── Lane B provides ──
// eligibility.ts  checkEligibility(h): ProgramMatch[]; annualFpl(size): number; pctFpl(h): number
// store.ts        openStore, upsertHousehold, getHousehold, getHouseholdByPhone, listHouseholds,
//                 appendMessage, getMessages, markProcessed(eventId): boolean,
//                 claimAction(hid, kind, day): boolean, saveCall, getCallByDialId, listCalls,
//                 saveSubmission, listSubmissions, addTimeline, getTimeline
// keewano.ts      logEvent(hid, e: CaseEvent, at?): Promise<void>; keewanoSql(sql)
// autopilot.ts    findActions(): Promise<Action[]>
// server.ts       startServer(port, { packet: PacketRoutes }): void
// ── Lane A provides ──
// dial.ts         normalizePhone, sendText, placeCall, getCall, startEventLoop
// calls.ts        placeOfficeCall(hid, purpose), handleCallTranscribed(callId)
// submit.ts       packetRoutes: PacketRoutes; submitApplication(hid, 'minimal' | 'full')
// actions.ts      executeAction(a: Action)
```

- [ ] **Step 4: Commit and push**

```bash
git add -A && git commit -m "chore: scaffold Aid service and freeze shared contracts" && git push
```

- [ ] **Step 5 (A): Dial setup**

```bash
npm i -g @getdial/cli
dial auth login <email> && dial auth verify-otp --code <code>
dial auth register-number +1<your cell> && dial auth verify-otp --number --code <code>
# Top up at getdial.ai/dashboard/billing (removes the 5-min / 2-concurrent caps)
dial number purchase --help    # confirm the iMessage flag name (SDK field: includeImessage)
dial number purchase --area-code 213 --include-imessage \
  --inbound-instruction "You are Aid, a friendly California benefits helper. Screen callers for CalFresh, Medi-Cal, CalWORKs, General Relief, CFAP and Section 8 by asking household size, monthly income, kids, pregnancy, age, county and (optional) immigration status. Keep answers short." \
  --explicit-programmatic-consent "Account holder approved" --json
# Put the returned id in .env as DIAL_FROM_NUMBER_ID. Poll `dial number list --json` until iMessage setupStatus is ready.
dial message --to <teammate iPhone> --body "Aid test"   # verify iMessage in BOTH directions now
```

- [ ] **Step 6 (B): Keewano setup** (the PAT and MCP connection are already done)
  1. In app.keewano.com, open the bottom-left chat and send `#SpeedHacks`.
  2. Create an **SDK-type** API key under Settings → Project → API Keys. Put it in `.env` as `KEEWANO_SDK_KEY`.
  3. Copy the Project ID (Settings → Details) into `KEEWANO_PROJECT_ID`, and your signup email into `KEEWANO_PG_USER`.

---

## LANE B (Person B)

### Task B1: Eligibility rules engine

**Files:** Create `data/programs.ts`, `src/eligibility.ts`, `tests/eligibility.test.ts`
**Interfaces:**
- Consumes `Household`, `ProgramMatch` from contracts.
- Produces `checkEligibility(h: Household): ProgramMatch[]` (always 6 entries, in Program order), `annualFpl(size)` and `pctFpl(h)`.

- [ ] **Step 1: Write `data/programs.ts`**

```ts
// All numbers from research/*.md (researched 2026-10-11). DERIVED = computed, not from an official table.
export const FPL_BASE = 15_960;          // 1 person, 2026 (README)
export const FPL_PER_PERSON = 5_680;
export const CALFRESH_GROSS_PCT = 200;   // CA broad-based categorical eligibility (README)
export const SNAP_MAX: Record<number, number> = { 1: 306, 2: 562, 4: 1023 }; // research/federal-food-cash-health.md:11
export const SNAP_SIZE_RATIO: Record<number, number> = { 3: 0.786, 5: 1.188, 6: 1.425, 7: 1.575, 8: 1.8 }; // DERIVED vs 4-person
export const SNAP_MIN = 25;              // research/federal-food-cash-health.md:11
export const SNAP_STD_DEDUCTION = 209;   // DERIVED approximation; CalFresh amounts are estimates
export const MEDICAL_ADULT_PCT = 138, MEDICAL_CHILD_PCT = 266, MEDICAL_PREG_PCT = 213; // research/ca-health.md
export const CALWORKS_MAP = 1_175;       // Region 1 non-exempt, family of 3 (research/ca-food-cash.md:46); screening cap for all sizes
export const CALWORKS_EARNED_DISREGARD = 600;
export const GR_MAX: Record<string, Record<number, number>> = { los_angeles: { 1: 221, 2: 375 } }; // research/ca-food-cash.md:78
export const VLI_1P: Record<string, number> = { los_angeles: 58_300 }; // 50% AMI, research/ca-housing-utilities-other.md:24
export const HUD_SIZE_ADJ: Record<number, number> = { 1: 0.7, 2: 0.8, 3: 0.9, 4: 1, 5: 1.08, 6: 1.16, 7: 1.24, 8: 1.32 }; // HUD standard factors; DERIVED limits

export const DOCS = {
  calfresh: ['Photo ID', 'Social Security numbers', 'Pay stubs from the last 30 days', 'Rent and utility bills'],
  medi_cal: ['Photo ID', 'Proof of income', 'Proof of address'],
  calworks: ['ID', 'SSNs and birth certificates for everyone', "Kids' shot records", 'Proof of income and rent'],
  general_relief: ['ID', 'Proof you live in the county', 'Income proof or a statement that you have none'],
  cfap: ['Same papers as CalFresh', 'Immigration documents'],
  section8: ['ID', 'SSNs and birth certificates for everyone', 'Income and bank statements'],
} as const;

export const APPLY_VIA = {
  calfresh: 'BenefitsCal (benefitscal.com) or your county office. Aid can file for you.',
  medi_cal: 'BenefitsCal (same application as CalFresh)',
  calworks: 'BenefitsCal or county office; ask about Immediate Need if in crisis',
  general_relief: 'County social services office (LA County: DPSS)',
  cfap: 'Same as CalFresh. The county checks CFAP automatically.',
  section8: 'Local housing authority waitlist (LACDA / HACLA). Lists are often closed; Aid watches them.',
} as const;
```

- [ ] **Step 2: Write the failing tests `tests/eligibility.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { checkEligibility, annualFpl } from '../src/eligibility.js';
import type { Household, Program } from '../src/contracts.js';

const base: Household = { id: 'h', phone: '+12135550100', county: 'los_angeles', size: 1, monthlyIncome: 0,
  childrenUnder18: 0, pregnant: false, adultAge: 35, immigrationStatus: 'citizen', childrenAreCitizens: true };
const pick = (h: Household, p: Program) => checkEligibility(h).find(m => m.program === p)!;

describe('checkEligibility', () => {
  it('returns all six programs in order', () => {
    expect(checkEligibility(base).map(m => m.program))
      .toEqual(['calfresh', 'medi_cal', 'calworks', 'general_relief', 'cfap', 'section8']);
  });
  it('single adult with no income in LA: CalFresh max, Medi-Cal, GR $221, Section 8; no CalWORKs or CFAP', () => {
    expect(pick(base, 'calfresh')).toMatchObject({ status: 'likely', estMonthlyValue: 306 });
    expect(pick(base, 'medi_cal').status).toBe('likely');
    expect(pick(base, 'general_relief')).toMatchObject({ status: 'likely', estMonthlyValue: 221 });
    expect(pick(base, 'section8').status).toBe('likely');
    expect(pick(base, 'calworks').status).toBe('not_eligible');
    expect(pick(base, 'cfap').status).toBe('not_eligible');
  });
  it('family of 3 at $2,400/mo: CalWORKs likely at about $275; no GR', () => {
    const h = { ...base, size: 3, monthlyIncome: 2400, childrenUnder18: 2 };
    expect(pick(h, 'calworks')).toMatchObject({ status: 'likely', estMonthlyValue: 275 });
    expect(pick(h, 'general_relief').status).toBe('not_eligible');
    expect(pick(h, 'calfresh').status).toBe('likely');
  });
  it('single adult at $3,000/mo: over CalFresh and adult Medi-Cal, still under Section 8', () => {
    const h = { ...base, monthlyIncome: 3000 };
    expect(pick(h, 'calfresh').status).toBe('not_eligible');
    expect(pick(h, 'medi_cal').status).toBe('not_eligible');
    expect(pick(h, 'section8').status).toBe('likely');
  });
  it('green card holder: CFAP is the fallback for CalFresh', () => {
    const h = { ...base, monthlyIncome: 1000, immigrationStatus: 'green_card' as const };
    expect(pick(h, 'cfap').status).toBe('likely');
    expect(pick(h, 'calfresh').status).toBe('needs_info');
  });
  it('mixed-status family: citizen kids still eligible for Medi-Cal and CalFresh', () => {
    const h = { ...base, size: 3, monthlyIncome: 1500, childrenUnder18: 2, immigrationStatus: 'undocumented' as const };
    expect(pick(h, 'medi_cal').status).toBe('likely');
    expect(pick(h, 'medi_cal').reason).toMatch(/children/i);
    expect(pick(h, 'calfresh').reason).toMatch(/children/i);
    expect(pick(h, 'calworks').status).toBe('needs_info');
  });
  it('San Francisco GR and Section 8 are needs_info (unconfirmed limits)', () => {
    const h = { ...base, county: 'san_francisco' as const };
    expect(pick(h, 'general_relief').status).toBe('needs_info');
    expect(pick(h, 'section8').status).toBe('needs_info');
  });
  it('rejects invalid input instead of guessing', () => {
    expect(() => checkEligibility({ ...base, size: 0 })).toThrow(RangeError);
    expect(() => checkEligibility({ ...base, monthlyIncome: -5 })).toThrow(RangeError);
    expect(() => checkEligibility({ ...base, monthlyIncome: Number.NaN })).toThrow(RangeError);
  });
  it('FPL scales by household size', () => {
    expect(annualFpl(1)).toBe(15_960);
    expect(annualFpl(4)).toBe(32_000);
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail.** `npx vitest run tests/eligibility.test.ts` should fail with a module-not-found error for `src/eligibility.js`.

- [ ] **Step 4: Implement `src/eligibility.ts`**

```ts
import * as P from '../data/programs.js';
import type { Household, ProgramMatch, Program } from './contracts.js';

export function annualFpl(size: number): number {
  if (!Number.isInteger(size) || size < 1) throw new RangeError('household size must be an integer >= 1');
  return P.FPL_BASE + P.FPL_PER_PERSON * (size - 1);
}
export const pctFpl = (h: Household) => Math.round(((h.monthlyIncome * 12) / annualFpl(h.size)) * 100);

function snapMax(size: number): number {
  if (P.SNAP_MAX[size]) return P.SNAP_MAX[size];
  const extra = size > 8 ? (size - 8) * 230 : 0;
  return Math.round(P.SNAP_MAX[4] * P.SNAP_SIZE_RATIO[Math.min(size, 8)]) + extra;
}
function calfreshEstimate(h: Household): number {
  const net = Math.max(0, h.monthlyIncome * 0.8 - P.SNAP_STD_DEDUCTION);
  return Math.max(P.SNAP_MIN, Math.round(snapMax(h.size) - 0.3 * net));
}
const match = (program: Program, status: ProgramMatch['status'], estMonthlyValue: number | null, reason: string): ProgramMatch =>
  ({ program, status, estMonthlyValue, reason, docs: [...P.DOCS[program]], applyVia: P.APPLY_VIA[program] });

function validate(h: Household) {
  annualFpl(h.size);
  if (!Number.isFinite(h.monthlyIncome) || h.monthlyIncome < 0) throw new RangeError('monthlyIncome must be a finite number >= 0');
}

function calfresh(h: Household, pct: number): ProgramMatch {
  if (pct > P.CALFRESH_GROSS_PCT) return match('calfresh', 'not_eligible', null, `Income is ${pct}% of the poverty line; CalFresh allows up to 200%.`);
  const est = calfreshEstimate(h);
  switch (h.immigrationStatus) {
    case 'citizen': return match('calfresh', 'likely', est, `About $${est}/mo for food (estimate).`);
    case 'green_card': return match('calfresh', 'needs_info', est, 'Many green card holders wait 5 years for CalFresh; if so, CFAP pays the same.');
    case 'humanitarian': return match('calfresh', 'needs_info', null, 'Refugees and asylees lost federal eligibility in April 2026; the county will check.');
    default:
      return h.childrenUnder18 > 0 && h.childrenAreCitizens
        ? match('calfresh', 'likely', null, 'Your citizen children can get CalFresh even if you can’t.')
        : match('calfresh', 'not_eligible', null, 'CalFresh requires an eligible immigration status.');
  }
}

function mediCal(h: Household, pct: number): ProgramMatch {
  const kidsOk = h.childrenUnder18 > 0 && pct <= P.MEDICAL_CHILD_PCT;
  const pregOk = h.pregnant && pct <= P.MEDICAL_PREG_PCT;
  const adultStatusOk = h.immigrationStatus !== 'undocumented'; // new UIS adult enrollment frozen since Jan 1 2026
  if (pct <= P.MEDICAL_ADULT_PCT && adultStatusOk)
    return match('medi_cal', 'likely', null, kidsOk ? 'Free health coverage for you and your children.' : 'Free health coverage for you.');
  if (pregOk) return match('medi_cal', 'likely', null, 'Free pregnancy coverage (pregnant people are exempt from the 2026 freeze).');
  if (kidsOk) return match('medi_cal', 'likely', null, adultStatusOk ? 'Free coverage for your children.' : 'Free coverage for your children (new adult enrollment is frozen for your status).');
  return match('medi_cal', 'not_eligible', null, adultStatusOk
    ? `Income is ${pct}% of the poverty line; adults qualify up to 138%.`
    : 'New adult enrollment is frozen for your status since Jan 2026.');
}

function calworks(h: Household): ProgramMatch {
  if (h.childrenUnder18 === 0 && !h.pregnant) return match('calworks', 'not_eligible', null, 'CalWORKs is for families with children or pregnant people.');
  const countable = Math.max(0, h.monthlyIncome - P.CALWORKS_EARNED_DISREGARD) * 0.5;
  if (countable >= P.CALWORKS_MAP) return match('calworks', 'not_eligible', null, 'Income is above the CalWORKs limit.');
  if (h.immigrationStatus === 'undocumented' || h.immigrationStatus === 'unknown')
    return match('calworks', 'needs_info', null, 'Your citizen children may get a child-only CalWORKs grant.');
  const est = Math.round(P.CALWORKS_MAP - countable);
  return match('calworks', 'likely', est, `Up to about $${est}/mo in cash (estimate).`);
}

function generalRelief(h: Household): ProgramMatch {
  if (h.childrenUnder18 > 0) return match('general_relief', 'not_eligible', null, 'Families with children use CalWORKs instead.');
  const max = P.GR_MAX[h.county]?.[Math.min(h.size, 2)];
  if (max === undefined) return match('general_relief', 'needs_info', null, 'Your county runs its own program; the county office will check.');
  if (h.monthlyIncome >= max) return match('general_relief', 'not_eligible', null, `General Relief is for income under $${max}/mo.`);
  if (h.immigrationStatus === 'undocumented') return match('general_relief', 'needs_info', null, 'The county checks immigration rules for General Relief.');
  return match('general_relief', 'likely', max - h.monthlyIncome, `Up to $${max - h.monthlyIncome}/mo in county cash aid.`);
}

function cfap(h: Household, pct: number): ProgramMatch {
  if (pct > P.CALFRESH_GROSS_PCT) return match('cfap', 'not_eligible', null, 'Income is above the CFAP limit.');
  if (h.immigrationStatus === 'green_card') return match('cfap', 'likely', calfreshEstimate(h), 'State food aid if you are still in the 5-year wait for CalFresh.');
  if (h.immigrationStatus === 'humanitarian') return match('cfap', 'needs_info', null, 'No state backfill is confirmed yet for refugees and asylees; the county will check.');
  if (h.immigrationStatus === 'undocumented') return match('cfap', 'not_eligible', null, 'CFAP expands to undocumented adults 55+ in Oct 2027.');
  return match('cfap', 'not_eligible', null, 'Citizens use CalFresh instead.');
}

function section8(h: Household): ProgramMatch {
  const onePerson = P.VLI_1P[h.county];
  if (onePerson === undefined) return match('section8', 'needs_info', null, 'We are confirming this county’s income limit.');
  const limit = Math.round((onePerson / P.HUD_SIZE_ADJ[1]) * P.HUD_SIZE_ADJ[Math.min(h.size, 8)]);
  if (h.monthlyIncome * 12 > limit) return match('section8', 'not_eligible', null, `Section 8 is for income under about $${limit.toLocaleString()}/yr.`);
  return match('section8', 'likely', null, 'You are under the income limit. Waitlists are often closed; Aid will watch them and call for you.');
}

export function checkEligibility(h: Household): ProgramMatch[] {
  validate(h);
  const pct = pctFpl(h);
  return [calfresh(h, pct), mediCal(h, pct), calworks(h), generalRelief(h), cfap(h, pct), section8(h)];
}
```

- [ ] **Step 5: Run the tests and confirm they pass.** `npx vitest run tests/eligibility.test.ts`. The CalWORKs figure works out as `(2400 − 600) × 0.5 = 900` and `1175 − 900 = 275`.
- [ ] **Step 6: Commit.** `git add data src/eligibility.ts tests/eligibility.test.ts && git commit -m "feat: deterministic CA eligibility engine for six programs"`

### Task B2: SQLite store

**Files:** Create `src/store.ts`, `tests/store.test.ts`
**Interfaces:**
- Produces the store functions listed in contracts.
- `openStore(path = 'aid.db')` sets the module-level db; tests use `':memory:'`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import * as store from '../src/store.js';

beforeEach(() => { store.openStore(':memory:'); });

describe('store', () => {
  it('markProcessed is true once, then false (dedupes Dial redelivery)', () => {
    expect(store.markProcessed('evt_1')).toBe(true);
    expect(store.markProcessed('evt_1')).toBe(false);
  });
  it('claimAction is idempotent per household, kind and day', () => {
    expect(store.claimAction('h1', 'docs_nudge', '2026-10-11')).toBe(true);
    expect(store.claimAction('h1', 'docs_nudge', '2026-10-11')).toBe(false);
    expect(store.claimAction('h1', 'docs_nudge', '2026-10-12')).toBe(true);
  });
  it('round-trips a household and its messages', () => {
    store.upsertHousehold({ id: 'h1', phone: '+12135550100', county: 'los_angeles', size: 1, monthlyIncome: 0,
      childrenUnder18: 0, pregnant: false, adultAge: 30, immigrationStatus: 'citizen', childrenAreCitizens: true });
    store.appendMessage('h1', 'user', 'hi');
    expect(store.getHouseholdByPhone('+12135550100')?.id).toBe('h1');
    expect(store.getMessages('h1').map(m => m.content)).toEqual(['hi']);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** `npx vitest run tests/store.test.ts`
- [ ] **Step 3: Implement `src/store.ts`**

```ts
import Database from 'better-sqlite3';
import type { Household } from './contracts.js';

let db: Database.Database;
export function openStore(path = 'aid.db') {
  db = new Database(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS households (id TEXT PRIMARY KEY, phone TEXT UNIQUE, json TEXT NOT NULL, updated_at INTEGER);
    CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, hid TEXT, role TEXT, content TEXT, at INTEGER);
    CREATE TABLE IF NOT EXISTS processed (event_id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS actions (hid TEXT, kind TEXT, day TEXT, PRIMARY KEY (hid, kind, day));
    CREATE TABLE IF NOT EXISTS calls (dial_id TEXT PRIMARY KEY, hid TEXT, purpose TEXT, outcome TEXT, transcript TEXT, at INTEGER);
    CREATE TABLE IF NOT EXISTS submissions (id INTEGER PRIMARY KEY, hid TEXT, kind TEXT, confirmation TEXT, payload TEXT, at INTEGER);
    CREATE TABLE IF NOT EXISTS timeline (id INTEGER PRIMARY KEY, hid TEXT, label TEXT, at INTEGER); -- display only; decisions use Keewano
  `);
  return db;
}
const now = () => Math.floor(Date.now() / 1000);
type Row = { json: string } | undefined;
const parse = (r: Row) => (r ? (JSON.parse(r.json) as Household) : undefined);

export function upsertHousehold(h: Household) {
  db.prepare(`INSERT INTO households (id, phone, json, updated_at) VALUES (?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`)
    .run(h.id, h.phone, JSON.stringify(h), now());
}
export const getHousehold = (id: string) => parse(db.prepare('SELECT json FROM households WHERE id = ?').get(id) as Row);
export const getHouseholdByPhone = (phone: string) => parse(db.prepare('SELECT json FROM households WHERE phone = ?').get(phone) as Row);
export const listHouseholds = () =>
  (db.prepare('SELECT json FROM households ORDER BY updated_at DESC').all() as { json: string }[]).map(r => JSON.parse(r.json) as Household);

export function appendMessage(hid: string, role: 'user' | 'assistant', content: string) {
  db.prepare('INSERT INTO messages (hid, role, content, at) VALUES (?, ?, ?, ?)').run(hid, role, content, now());
}
export const getMessages = (hid: string, limit = 40) =>
  (db.prepare('SELECT role, content, at FROM messages WHERE hid = ? ORDER BY id DESC LIMIT ?').all(hid, limit) as
    { role: 'user' | 'assistant'; content: string; at: number }[]).reverse();

export const markProcessed = (eventId: string) =>
  db.prepare('INSERT OR IGNORE INTO processed (event_id) VALUES (?)').run(eventId).changes === 1;
export const claimAction = (hid: string, kind: string, day: string) =>
  db.prepare('INSERT OR IGNORE INTO actions (hid, kind, day) VALUES (?, ?, ?)').run(hid, kind, day).changes === 1;

export function saveCall(c: { dialId: string; hid: string; purpose: string; outcome?: string; transcript?: string }) {
  db.prepare(`INSERT INTO calls (dial_id, hid, purpose, outcome, transcript, at) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(dial_id) DO UPDATE SET outcome = excluded.outcome, transcript = excluded.transcript`)
    .run(c.dialId, c.hid, c.purpose, c.outcome ?? null, c.transcript ?? null, now());
}
export const getCallByDialId = (dialId: string) =>
  db.prepare('SELECT dial_id AS dialId, hid, purpose, outcome, transcript FROM calls WHERE dial_id = ?').get(dialId) as
    { dialId: string; hid: string; purpose: string; outcome: string | null; transcript: string | null } | undefined;
export const listCalls = (hid: string) => db.prepare('SELECT * FROM calls WHERE hid = ? ORDER BY at').all(hid);

export function saveSubmission(hid: string, kind: string, confirmation: string, payload: unknown) {
  db.prepare('INSERT INTO submissions (hid, kind, confirmation, payload, at) VALUES (?, ?, ?, ?, ?)')
    .run(hid, kind, confirmation, JSON.stringify(payload), now());
}
export const listSubmissions = () => db.prepare('SELECT hid, kind, confirmation, at FROM submissions ORDER BY at DESC').all();
export const addTimeline = (hid: string, label: string, at = now()) =>
  db.prepare('INSERT INTO timeline (hid, label, at) VALUES (?, ?, ?)').run(hid, label, at);
export const getTimeline = (hid: string) =>
  db.prepare('SELECT label, at FROM timeline WHERE hid = ? ORDER BY at').all(hid) as { label: string; at: number }[];
```

- [ ] **Step 4: Run the tests and confirm they pass.** Then commit: `git add src/store.ts tests/store.test.ts && git commit -m "feat: sqlite store with dedupe and idempotent action claims"`

### Task B3: Keewano client (register, ingest, query)

**Files:** Create `src/keewano.ts`, `scripts/register-events.ts`, `tests/keewano.test.ts`
**Interfaces:**
- Produces `EVENT_TYPES`, `EVENTS_HASH`, `toWire(e, ts)` (pure, tested), `registerEvents()`, `ingest(hid, events, at?, sessionId?)`, `logEvent(hid, e, at?)` and `keewanoSql<T>(sql)`.
- `logEvent` also writes `store.addTimeline`, which is for display only.

- [ ] **Step 1: Write the failing test**

```ts
import { it, expect } from 'vitest';
import { toWire, EVENTS_HASH, EVENT_TYPES } from '../src/keewano.js';

it('assigns permanent ids from 2000 in list order', () => {
  expect(EVENT_TYPES[0]).toEqual({ eventTypeId: 2000, name: 'County', dataType: 'string' });
  expect(EVENT_TYPES.find(e => e.name === 'Screened')?.eventTypeId).toBe(2004);
});
it('maps typed case events to Keewano wire format', () => {
  expect(toWire({ type: 'Screened', value: 'calfresh,medi_cal' }, 100))
    .toEqual({ eventTypeId: 2004, dataType: 'string', timestamp: 100, data: 'calfresh,medi_cal' });
  expect(toWire({ type: 'PacketSigned' }, 100)).toEqual({ eventTypeId: 2007, dataType: 'none', timestamp: 100 });
  expect(toWire({ type: 'InterviewScheduled', at: 999 }, 100)).toEqual({ eventTypeId: 2009, dataType: 'timestamp', timestamp: 100, data: 999 });
  expect(EVENTS_HASH).toBeGreaterThan(0);
});
it('rejects strings over 256 chars (Keewano cap)', () => {
  expect(() => toWire({ type: 'DocReceived', value: 'x'.repeat(257) }, 1)).toThrow(RangeError);
});
```

- [ ] **Step 2: Run it and confirm it fails.** `npx vitest run tests/keewano.test.ts`
- [ ] **Step 3: Implement `src/keewano.ts`**

```ts
import { crc32 } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { CaseEvent } from './contracts.js';
import { addTimeline } from './store.js';

const API = 'https://api.keewano.com/event/ingress/v1/json';
// APPEND ONLY. Never reorder or change a type: ids come from position.
const DEFS: [string, string][] = [
  ['County', 'string'], ['HouseholdSize', 'uint'], ['IncomePctFpl', 'uint'], ['Source', 'string'],
  ['Screened', 'string'], ['DocsRequested', 'uint'], ['DocReceived', 'string'], ['PacketSigned', 'none'],
  ['ApplicationSubmitted', 'string'], ['InterviewScheduled', 'timestamp'], ['InterviewConfirmed', 'none'],
  ['CallPlaced', 'string'], ['CallOutcome', 'string'], ['Approved', 'string'], ['RenewalDue', 'timestamp'],
  ['NudgeSent', 'string'], ['UserReplied', 'none'], ['WaitlistStatus', 'string'],
];
export const EVENT_TYPES = DEFS.map(([name, dataType], i) => ({ eventTypeId: 2000 + i, name, dataType }));
const BY_NAME = new Map(EVENT_TYPES.map(e => [e.name, e]));
// Same idea as Keewano's docs: crc32 of the sorted-key JSON list, never 0
export const EVENTS_HASH = (crc32(JSON.stringify(EVENT_TYPES.map(e => ({ dataType: e.dataType, eventTypeId: e.eventTypeId, name: e.name })))) >>> 0) || 1;

export function toWire(e: CaseEvent, ts: number) {
  const t = BY_NAME.get(e.type);
  if (!t) throw new Error(`unknown event type ${e.type}`);
  const base = { eventTypeId: t.eventTypeId, dataType: t.dataType, timestamp: ts };
  if (t.dataType === 'none') return base;
  const data = 'at' in e ? e.at : (e as { value: string | number }).value;
  if (typeof data === 'string' && data.length > 256) throw new RangeError(`${e.type} value exceeds 256 chars`);
  return { ...base, data };
}

async function post(path: string, body: unknown): Promise<number> {
  const res = await fetch(`${API}/${path}`, { method: 'POST',
    headers: { 'k-token': process.env.KEEWANO_SDK_KEY ?? '', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.status >= 400) throw new Error(`Keewano ${path} ${res.status}: ${await res.text()}`);
  return res.status;
}
export const registerEvents = () => post('custom', { customEventsHash: EVENTS_HASH, eventTypes: EVENT_TYPES });

const processSession = randomUUID();
const batches = new Map<string, number>();
export async function ingest(hid: string, events: CaseEvent[], at = Math.floor(Date.now() / 1000), sessionId = processSession) {
  const batch = (batches.get(sessionId) ?? 0) + 1;
  batches.set(sessionId, batch);
  await post('in', { dataSessionId: sessionId, batch, customEventsHash: EVENTS_HASH, installId: hid,
    events: events.map((e, i) => toWire(e, at + i)) });
}
export async function logEvent(hid: string, e: CaseEvent, at?: number) {
  const ts = at ?? Math.floor(Date.now() / 1000);
  addTimeline(hid, 'value' in e ? `${e.type}: ${e.value}` : e.type, ts);
  await ingest(hid, [e], ts);
}

let pool: pg.Pool | undefined;
export async function keewanoSql<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  pool ??= new pg.Pool({ host: 'pgsql.keewano.com', port: 27543, user: process.env.KEEWANO_PG_USER,
    password: process.env.KEEWANO_PAT, database: process.env.KEEWANO_PROJECT_ID, ssl: true, max: 2 });
  return (await pool.query(sql)).rows as T[];
}
```

- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Write `scripts/register-events.ts` and run it**

```ts
import 'dotenv/config';
import { registerEvents } from '../src/keewano.js';
console.log('register status', await registerEvents()); // 202 = registered, 200 = already registered
```
Run: `npx tsx scripts/register-events.ts`. Expected output: `register status 202`. If you get 409, a different event list already uses that hash: append new events rather than changing existing ones.

- [ ] **Step 6: Commit.** `git add src/keewano.ts scripts/register-events.ts tests/keewano.test.ts && git commit -m "feat: keewano typed event client"`

### Task B4: Seed two weeks of history (finish by 1:45 PM)

**Files:** Create `scripts/seed.ts`
**Interfaces:** Consumes `ingest` (B3), `openStore`, `upsertHousehold` and `addTimeline` (B2), plus `uuid` v5.

The seed creates 120 households:
- **60 with `Source("baseline")`.** This is the manual workflow without Aid: 6–21 days from screening to application submitted, about 30% never confirm their interview, and about 25% never submit.
- **60 with `Source("aid")`.** Same-day submission.
- **4 demo households,** one per stuck pattern. The interview pattern uses `DEMO_PERSON_B_PHONE`, so the autopilot texts a **real phone live** in the demo.

- [ ] **Step 1: Write `scripts/seed.ts`**

```ts
import 'dotenv/config';
import { v5 as uuidv5 } from 'uuid';
import { randomUUID } from 'node:crypto';
import { ingest } from '../src/keewano.js';
import { openStore, upsertHousehold, addTimeline } from '../src/store.js';
import type { CaseEvent, Household, Program } from '../src/contracts.js';

openStore();
const DAY = 86_400, HOUR = 3_600, now = Math.floor(Date.now() / 1000);
const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const PROGRAMS: Program[] = ['calfresh', 'medi_cal', 'calworks', 'general_relief', 'cfap', 'section8'];
type Pattern = 'interview_unconfirmed' | 'docs_stalled' | 'signed_not_submitted' | 'waitlist';

async function seedOne(i: number, source: 'aid' | 'baseline', phone: string, firstName: string, pattern?: Pattern) {
  const id = uuidv5(phone, uuidv5.URL);
  const h: Household = { id, phone, firstName, county: 'los_angeles', size: rnd(1, 5), monthlyIncome: rnd(0, 3200),
    childrenUnder18: rnd(0, 3), pregnant: false, adultAge: rnd(19, 70), immigrationStatus: 'citizen', childrenAreCitizens: true };
  upsertHousehold(h);
  let t = now - rnd(4, 14) * DAY;
  const ev: [CaseEvent, number][] = [];
  const at = (e: CaseEvent, gap: number) => { t = Math.min(t + gap, now - 60); ev.push([e, t]); };

  at({ type: 'County', value: 'los_angeles' }, 0);
  at({ type: 'HouseholdSize', value: h.size }, 1);
  at({ type: 'IncomePctFpl', value: rnd(0, 190) }, 1);
  at({ type: 'Source', value: source }, 1);
  at({ type: 'Screened', value: 'calfresh,medi_cal' }, 60);
  at({ type: 'DocsRequested', value: 3 }, 60);

  if (pattern !== 'docs_stalled') {
    const gap = source === 'aid' ? rnd(10 * 60, 6 * HOUR) : rnd(6, 21) * DAY;
    at({ type: 'DocReceived', value: 'paystub' }, Math.floor(gap / 2));
    at({ type: 'PacketSigned' }, 300);
    const submits = pattern !== 'signed_not_submitted' && (source === 'aid' || Math.random() > 0.25);
    if (submits) {
      at({ type: 'ApplicationSubmitted', value: PROGRAMS[i % PROGRAMS.length] }, Math.floor(gap / 2));
      if (pattern === 'interview_unconfirmed') at({ type: 'InterviewScheduled', at: now + 20 * HOUR }, 600);
      else {
        at({ type: 'InterviewScheduled', at: t + 3 * DAY }, HOUR);
        if (source === 'aid' || Math.random() > 0.3) at({ type: 'InterviewConfirmed' }, 600);
      }
    }
  }
  if (pattern === 'waitlist') at({ type: 'WaitlistStatus', value: 'closed' }, 60);

  const session = randomUUID();
  for (const [e, ts] of ev) { await ingest(id, [e], ts, session); addTimeline(id, 'value' in e ? `${e.type}: ${e.value}` : e.type, ts); }
  return id;
}

for (let i = 0; i < 60; i++) await seedOne(i, 'baseline', `+1213555${1000 + i}`, `Client B${i}`);
for (let i = 0; i < 60; i++) await seedOne(i, 'aid', `+1213556${1000 + i}`, `Client A${i}`);
const demo = [
  await seedOne(900, 'aid', process.env.DEMO_PERSON_B_PHONE!, 'Rosa', 'interview_unconfirmed'),
  await seedOne(901, 'aid', '+12135570001', 'James', 'docs_stalled'),
  await seedOne(902, 'aid', '+12135570002', 'Lin', 'signed_not_submitted'),
  await seedOne(903, 'aid', '+12135570003', 'Marcus', 'waitlist'),
];
console.log('seeded 124 households. Put the Rosa/Lin/Marcus ids in AUTOPILOT_ALLOW:', demo.join(','));
```
**Safety:** James's number is fake. Leave him out of `AUTOPILOT_ALLOW` so he only appears on the dashboard. Lin's `submit` and Marcus's call go to the mock county and `DEMO_OFFICE_PHONE`, so those are safe to allow.

- [ ] **Step 2: Run the seed and check the data in Keewano**
  1. Run `npx tsx scripts/seed.ts`. It should print the demo ids. Paste the Rosa, Lin and Marcus ids into `.env` as `AUTOPILOT_ALLOW`.
  2. Wait 5 minutes.
  3. In Keewano Ask, ask: *"How many users and events does my project have, and which event types does it record?"* It should report about 124 users and list the event types.
- [ ] **Step 3: Commit.** `git add scripts/seed.ts && git commit -m "feat: seed baseline vs aid case histories into keewano"`

### Task B5: Autopilot queries (Keewano decides who gets action)

**Files:** Create `src/autopilot.ts`, `tests/autopilot.test.ts`
**Interfaces:**
- Consumes `keewanoSql` (B3).
- Produces `QUERIES`, `rowsToActions(kind, rows)` (pure, tested) and `findActions(): Promise<Action[]>`.

- [ ] **Step 1: Check Keewano's SQL dialect against real data (required; the queries below are a best guess)**
  1. In Keewano's SQL Query Studio (or via the Keewano MCP in Claude Code), run `SELECT * FROM events LIMIT 5`.
  2. Note the entity id column (expected `user_id`) and the event column names (expected: the event names, e.g. `PacketSigned`).
  3. Read `https://docs.keewano.com/sql-query-studio/reference.md` for the per-entity `count()` and `occurrence()` functions and any time-window functions.
  4. Rewrite each query in `QUERIES` so it runs. If a pattern can't be expressed in SQL, use a Lua script query (`process_user(user, events)`) through MCP instead, and keep the same function signature.
- [ ] **Step 2: Write the failing test**

```ts
import { it, expect } from 'vitest';
import { rowsToActions } from '../src/autopilot.js';
it('turns Keewano rows into keewano-sourced actions', () => {
  expect(rowsToActions('docs_nudge', [{ user_id: 'h1' }, { user_id: 'h2' }])).toEqual([
    { householdId: 'h1', kind: 'docs_nudge', source: 'keewano', detail: 'Documents requested, none received' },
    { householdId: 'h2', kind: 'docs_nudge', source: 'keewano', detail: 'Documents requested, none received' },
  ]);
});
```
- [ ] **Step 3: Implement `src/autopilot.ts`**

```ts
import { keewanoSql } from './keewano.js';
import type { Action, ActionKind } from './contracts.js';

const DETAIL: Record<ActionKind, string> = {
  interview_nudge: 'Interview scheduled, not confirmed',
  docs_nudge: 'Documents requested, none received',
  submit: 'Packet signed but not submitted',
  waitlist_check: 'Section 8 waitlist last seen closed',
  renewal_start: 'Renewal due, nothing signed yet',
};
// Rewrite after Step 1. Read-only subset: no JOIN or CTE; per-entity counts via count(col) in WHERE.
export const QUERIES: Record<ActionKind, string> = {
  interview_nudge: `SELECT DISTINCT user_id FROM events WHERE Source = 'aid' AND count(InterviewScheduled) > count(InterviewConfirmed)`,
  docs_nudge: `SELECT DISTINCT user_id FROM events WHERE Source = 'aid' AND count(DocsRequested) >= 1 AND count(DocReceived) = 0`,
  submit: `SELECT DISTINCT user_id FROM events WHERE Source = 'aid' AND count(PacketSigned) >= 1 AND count(ApplicationSubmitted) = 0`,
  waitlist_check: `SELECT DISTINCT user_id FROM events WHERE Source = 'aid' AND WaitlistStatus = 'closed'`,
  renewal_start: `SELECT DISTINCT user_id FROM events WHERE Source = 'aid' AND count(RenewalDue) >= 1 AND count(PacketSigned) = 0`,
};
export const rowsToActions = (kind: ActionKind, rows: { user_id: string }[]): Action[] =>
  rows.map(r => ({ householdId: r.user_id, kind, source: 'keewano', detail: DETAIL[kind] }));

export async function findActions(): Promise<Action[]> {
  const out: Action[] = [];
  for (const kind of Object.keys(QUERIES) as ActionKind[]) {
    try { out.push(...rowsToActions(kind, await keewanoSql<{ user_id: string }>(QUERIES[kind]))); }
    catch (err) { console.error(`[autopilot] ${kind} query failed`, err); } // one bad query never stops the others
  }
  return out;
}
```
- [ ] **Step 4: Run the test and the live queries, then commit**
  1. Run `npx vitest run tests/autopilot.test.ts` and confirm it passes.
  2. Run `npx tsx -e "import('dotenv/config').then(()=>import('./src/autopilot.js')).then(m=>m.findActions()).then(a=>console.log(a.length, a.slice(0,4)))"`. Each of the four demo households should appear under its pattern.
  3. Commit: `git add src/autopilot.ts tests/autopilot.test.ts && git commit -m "feat: keewano-driven autopilot queries"`

### Task B6: Server, dashboard, staff "Ask" box and county mock

**Files:** Create `src/staffAsk.ts`, `src/server.ts`, `web/dashboard.html`, `web/county.html`
**Interfaces:**
- Consumes `store.*`, `checkEligibility`, `findActions`, `keewanoSql`, and A's `PacketRoutes`.
- Produces `startServer(port, { packet })` and `askStaffQuestion(q)`.
- Routes:
  - `GET /` serves the dashboard, `GET /screener` serves `benefits-map.html`, `GET /county` serves the county inbox
  - `GET /api/cases`
  - `GET /api/cases/:id`
  - `POST /api/ask` with `{q}` returns `{answer}`
  - `GET /api/metrics`
  - `GET /p/:id` and `POST /p/:id/sign`
  - `POST /county/api/applications` with `{householdId, kind, payload}` returns `{confirmation}`
  - `GET /county/api/applications`

- [ ] **Step 1: Write `src/staffAsk.ts`.** Claude plus the Keewano MCP server, so a judge's unprepared question is answered from Keewano.

```ts
import { experimental_createMCPClient as createMCPClient, generateText, stepCountIs } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

let tools: Awaited<ReturnType<Awaited<ReturnType<typeof createMCPClient>>['tools']>> | undefined;
async function keewanoTools() {
  if (tools) return tools;
  const client = await createMCPClient({ transport: new StreamableHTTPClientTransport(new URL('https://api.keewano.com/mcp'),
    { requestInit: { headers: { 'k-token': process.env.KEEWANO_PAT ?? '' } } }) });
  tools = await client.tools();
  return tools;
}
export async function askStaffQuestion(q: string): Promise<string> {
  const { text } = await generateText({ model: anthropic('claude-sonnet-5-5'), tools: await keewanoTools(), stopWhen: stepCountIs(6),
    system: 'You answer caseworker questions about Aid households using ONLY the Keewano tools. Each Keewano user is one household. Source("baseline") = the manual workflow without Aid; Source("aid") = with Aid. Answer in 2-4 sentences with concrete numbers.',
    prompt: q });
  return text;
}
```

- [ ] **Step 2: Write `src/server.ts`**

```ts
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import * as store from './store.js';
import { checkEligibility } from './eligibility.js';
import { findActions } from './autopilot.js';
import { askStaffQuestion } from './staffAsk.js';
import { keewanoSql } from './keewano.js';
import type { PacketRoutes } from './contracts.js';

const page = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

export function startServer(port: number, routes: { packet: PacketRoutes }) {
  const app = new Hono();
  app.get('/', c => c.html(page('web/dashboard.html')));
  app.get('/screener', c => c.html(page('benefits-map.html')));
  app.get('/county', c => c.html(page('web/county.html')));

  app.get('/api/cases', async c => {
    const actions = await findActions();
    return c.json(store.listHouseholds().slice(0, 60).map(h => ({ id: h.id, firstName: h.firstName, county: h.county, size: h.size,
      actions: actions.filter(a => a.householdId === h.id), timeline: store.getTimeline(h.id) })));
  });
  app.get('/api/cases/:id', c => {
    const h = store.getHousehold(c.req.param('id'));
    if (!h) return c.json({ error: 'not found' }, 404);
    return c.json({ household: h, eligibility: checkEligibility(h), messages: store.getMessages(h.id),
      calls: store.listCalls(h.id), timeline: store.getTimeline(h.id) });
  });
  app.post('/api/ask', async c => {
    const { q } = await c.req.json<{ q?: string }>();
    if (!q || q.length > 500) return c.json({ error: 'Ask a question (max 500 characters)' }, 400);
    try { return c.json({ answer: await askStaffQuestion(q) }); }
    catch (e) { console.error('[ask]', e); return c.json({ error: 'Keewano is unavailable right now, try again' }, 502); }
  });
  app.get('/api/metrics', async c => {
    // Rewrite after B5 Step 1. Before/after from Keewano: households that reached ApplicationSubmitted, by Source.
    try { return c.json(await keewanoSql(`SELECT Source, count(DISTINCT user_id) AS submitted FROM events WHERE count(ApplicationSubmitted) >= 1 GROUP BY Source`)); }
    catch (e) { console.error('[metrics]', e); return c.json({ error: 'metrics unavailable' }, 502); }
  });

  app.get('/p/:id', c => c.html(routes.packet.renderPacket(c.req.param('id'))));
  app.post('/p/:id/sign', async c => {
    const id = c.req.param('id');
    try { await routes.packet.sign(id); return c.redirect(`/p/${id}?signed=1`); }
    catch (e) { console.error('[sign]', e); return c.html('<p>Something went wrong submitting. Aid will retry automatically.</p>', 500); }
  });

  app.post('/county/api/applications', async c => {
    const body = await c.req.json<{ householdId: string; kind: string; payload: unknown }>();
    if (!store.getHousehold(body.householdId)) return c.json({ error: 'unknown household' }, 400);
    const confirmation = `LA-${new Date().getFullYear()}-${randomInt(100_000, 999_999)}`;
    store.saveSubmission(body.householdId, body.kind, confirmation, body.payload);
    return c.json({ confirmation });
  });
  app.get('/county/api/applications', c => c.json(store.listSubmissions()));

  serve({ fetch: app.fetch, port });
  console.log(`[server] http://localhost:${port}`);
}
```

- [ ] **Step 3: Write `web/dashboard.html`**

  A single static file using plain JavaScript (no build step) that polls `/api/cases` every 5 seconds.

  **Design:** an editorial, civic-service look. Reuse the `:root` tokens and dark-mode block from `benefits-map.html` (`--bg #f3f5f8`, `--surface #fff`, `--ink #142030`, `--muted #586678`, `--accent #1756b8`, `--ok #1b7643`, `--warn #9a5c00`; fonts Public Sans and IBM Plex Mono).

  **Layout:**
  1. **Header strip:** "Aid · LA County pilot" and live counters (households, submitted, autopilot actions). It also has a large **"Submitted: baseline vs Aid"** figure from `/api/metrics`, labelled "live from Keewano".
  2. **Left column, "Autopilot queue":** cards built from each case's `actions[]`. Each card has a `via Keewano` chip, the household's first name and the detail text. Left-border color by kind: `interview_nudge` warn, `docs_nudge` muted, `submit` ok, `waitlist_check` and `renewal_start` accent.
  3. **Right column, case drawer:** opens on click and calls `/api/cases/:id`. It shows:
     - the timeline as a vertical list with formatted times
     - the eligibility rows with status pills and dollar estimates
     - the message thread as chat bubbles
     - call transcripts in `<details>` elements
  4. **Bottom, "Ask Keewano" box:** a text input and button that POST to `/api/ask` and show the answer, with a loading state.

  **Requirements:**
  - Insert all dynamic text with `textContent` or `createElement`, never `innerHTML`, because the page shows user-provided text.
  - Cards are `<button>` elements with visible focus rings.
  - At 375px wide the layout stacks into one column with no horizontal scroll.

- [ ] **Step 4: Write `web/county.html`**

  A deliberately plain "Los Angeles County Intake Portal (DEMO)" page. It shows a table that polls `/county/api/applications` every 3 seconds, with columns confirmation number, household id (first 8 characters), kind (minimal or full) and received time. Newly arrived rows briefly highlight. A banner reads: "Mock county system for the demo. Production path: authorized-representative submission."

- [ ] **Step 5: Smoke test with a stub packet**

```bash
npx tsx -e "import('dotenv/config').then(async()=>{const s=await import('./src/store.js');s.openStore();const m=await import('./src/server.js');m.startServer(3000,{packet:{renderPacket:()=>'stub',sign:async()=>{}}})})"
```
- Open `http://localhost:3000`. The seeded households should show, with "via Keewano" queue cards for the four demo households.
- In the Ask box, ask: "How many households submitted with Aid vs baseline?" It should return a numeric answer.
- [ ] **Step 6: Commit.** `git add src/server.ts src/staffAsk.ts web/dashboard.html web/county.html && git commit -m "feat: dashboard, county mock and Keewano staff Ask"`

---

## LANE A (Person A)

### Task A1: Dial client and event loop

**Files:** Create `src/dial.ts`, `tests/dial.test.ts`
**Interfaces:**
- Consumes `store.markProcessed` (B2).
- Produces:
  - `normalizePhone(raw): string`
  - `sendText(to, body, media?)`
  - `placeCall({ to, instruction, transferTo?, idempotencyKey? }): Promise<string>`
  - `getCall(callId)`
  - `startEventLoop(handlers)`
  - `type InboundMessage = { messageId; from; body; media: { url; contentType }[] }`

- [ ] **Step 1: Write the failing test**

```ts
import { it, expect } from 'vitest';
import { normalizePhone } from '../src/dial.js';
it('normalizes US numbers to E.164', () => {
  expect(normalizePhone('(213) 555-0100')).toBe('+12135550100');
  expect(normalizePhone('+1 213 555 0100')).toBe('+12135550100');
  expect(() => normalizePhone('555')).toThrow(RangeError);
});
```
- [ ] **Step 2: Run it and confirm it fails.** `npx vitest run tests/dial.test.ts`
- [ ] **Step 3: Implement `src/dial.ts`**

```ts
import { DialClient } from '@getdial/sdk';
import * as store from './store.js';

let client: DialClient | undefined;
const dial = () => (client ??= new DialClient({ apiKey: process.env.DIAL_API_KEY ?? '' }));
const FROM = () => process.env.DIAL_FROM_NUMBER_ID ?? '';

export type InboundMessage = { messageId: string; from: string; body: string; media: { url: string; contentType: string }[] };

export function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  throw new RangeError(`not a US phone number: ${raw}`);
}
// Sending is NOT idempotent on Dial's side: never retry blindly.
export async function sendText(to: string, body: string, media?: string[]) {
  return dial().sendMessage({ to, fromNumberId: FROM(), body, ...(media ? { media } : {}) });
}
export async function placeCall(o: { to: string; instruction: string; transferTo?: string; idempotencyKey?: string }): Promise<string> {
  const call = await dial().makeCall({ to: o.to, fromNumberId: FROM(), outboundInstruction: o.instruction, language: 'en-US',
    ...(o.transferTo ? { transferTo: o.transferTo } : {}), ...(o.idempotencyKey ? { idempotencyKey: o.idempotencyKey } : {}) });
  return call.id;
}
export async function getCall(callId: string) {
  // Verify this path on the Dial "Get a call" docs page; some pages show /api/v1/calls/{id}.
  const res = await fetch(`https://api.getdial.ai/v1/calls/${callId}`, { headers: { Authorization: `Bearer ${process.env.DIAL_API_KEY}` } });
  if (!res.ok) throw new Error(`getCall ${callId} failed: ${res.status}`);
  return res.json() as Promise<{ status: string; transcript?: string; transcriptTurns?: { speaker: string; text: string }[] }>;
}

type Handlers = { onMessage(m: InboundMessage): Promise<void>; onCallTranscribed(callId: string): Promise<void> };
export async function startEventLoop(h: Handlers): Promise<never> {
  for (;;) { // reconnect forever; Dial replays missed events only if we're back within 2 minutes
    try {
      const conn = await dial().newEventsConnection();
      for await (const e of conn as AsyncIterable<{ id: string; type: string; data: any }>) {
        if (!store.markProcessed(e.id)) continue; // at-least-once delivery → dedupe
        try {
          if (e.type === 'message.received') await h.onMessage(e.data as InboundMessage);
          if (e.type === 'call.transcribed') await h.onCallTranscribed(e.data.callId);
        } catch (err) { console.error('[dial] handler error', e.type, err); } // one bad event never kills the loop
      }
    } catch (err) { console.error('[dial] event stream dropped, reconnecting', err); }
    await new Promise(r => setTimeout(r, 2000));
  }
}
```
- [ ] **Step 4: Run the test (it should pass), then check the real stream**

```bash
npx tsx -e "import('dotenv/config').then(async()=>{(await import('./src/store.js')).openStore();(await import('./src/dial.js')).startEventLoop({onMessage:async m=>console.log(m),onCallTranscribed:async id=>console.log(id)})})"
```
Text the Dial number from an iPhone. The `InboundMessage` should be logged. If the SDK's event or field names differ from the docs, fix `dial.ts` now. **Only `dial.ts` touches the Dial SDK.**
- [ ] **Step 5: Commit.** `git add src/dial.ts tests/dial.test.ts && git commit -m "feat: dial client with deduped reconnecting event loop"`

### Task A2: Agent conversation turn

**Files:** Create `src/agent.ts`, `tests/agent.test.ts`
**Interfaces:**
- Consumes `checkEligibility` and `pctFpl` (B1), `store.*` (B2), `logEvent` (B3), `sendText` and `InboundMessage` (A1), `placeOfficeCall` (A3).
- Produces `handleInbound(m: InboundMessage)` and `describeMedia(media)` (pure, tested).

- [ ] **Step 1: Write the failing test**

```ts
import { it, expect } from 'vitest';
import { describeMedia } from '../src/agent.js';
it('flags HEIC as unsupported and keeps jpeg/png', () => {
  expect(describeMedia([{ url: 'u1', contentType: 'image/heic' }, { url: 'u2', contentType: 'image/jpeg' }]))
    .toEqual({ usable: ['u2'], unsupported: 1 });
});
it('handles missing media', () => { expect(describeMedia(undefined)).toEqual({ usable: [], unsupported: 0 }); });
```
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement `src/agent.ts`**

```ts
import { generateText, tool, stepCountIs, type ModelMessage } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { v5 as uuidv5 } from 'uuid';
import * as store from './store.js';
import { checkEligibility, pctFpl } from './eligibility.js';
import { logEvent } from './keewano.js';
import { sendText, type InboundMessage } from './dial.js';
import { placeOfficeCall } from './calls.js';
import type { Household } from './contracts.js';

const OK_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);
export function describeMedia(media: { url: string; contentType: string }[] | undefined) {
  const list = media ?? [];
  return { usable: list.filter(m => OK_TYPES.has(m.contentType)).map(m => m.url), unsupported: list.filter(m => !OK_TYPES.has(m.contentType)).length };
}
const safeLog = (hid: string, e: Parameters<typeof logEvent>[1]) => logEvent(hid, e).catch(err => console.error('[keewano] log failed', e.type, err));

const SYSTEM = `You are Aid, a warm, plain-spoken California benefits caseworker texting with someone (Los Angeles County pilot).
Goal: get them every benefit they qualify for among CalFresh, Medi-Cal, CalWORKs, General Relief, CFAP and Section 8, with the least effort on their side.
Rules:
- Short texts (under 320 characters), one question at a time, 6th-grade reading level. Reply in Spanish if they write in Spanish.
- Collect: first name, county, household size, gross monthly income, kids under 18, pregnant, age, and immigration status (optional; say it is private and only used to find programs that fit).
- Income: convert hourly or weekly pay to monthly. If unsure, ask a follow-up question. Never guess.
- Then call save_household, then check_eligibility. Summarize likely programs with dollar estimates and a yearly total, and say the county makes the final decision.
- Ask permission before: requesting documents (then call request_documents), sending the application for review, or calling an office.
- Photos arrive as images: identify the document type and call record_document. If unreadable, ask for a clearer photo.
- When they reply "1" to an interview reminder, call confirm_interview. When they reply "2", call call_office with reschedule_interview.
- Never promise approval. Never ask for SSNs, bank logins or passwords over text.`;

export async function handleInbound(m: InboundMessage) {
  const phone = m.from;
  const hid = uuidv5(phone, uuidv5.URL);
  const known = Boolean(store.getHouseholdByPhone(phone));
  const { usable, unsupported } = describeMedia(m.media);
  store.appendMessage(hid, 'user', m.body || (usable.length ? '[photo]' : '[unsupported attachment]'));
  if (known) await safeLog(hid, { type: 'UserReplied' });
  if (unsupported > 0 && usable.length === 0) {
    const msg = 'I couldn’t open that photo. Could you send it as a regular photo (JPEG) instead?';
    store.appendMessage(hid, 'assistant', msg);
    await sendText(phone, msg);
    return;
  }

  const history: ModelMessage[] = store.getMessages(hid).slice(0, -1).map(x => ({ role: x.role, content: x.content }));
  history.push({ role: 'user', content: [{ type: 'text', text: m.body || 'Here is a document photo.' },
    ...usable.map(u => ({ type: 'image' as const, image: new URL(u) }))] });

  const { text } = await generateText({
    model: anthropic('claude-sonnet-5-5'), system: SYSTEM, messages: history, stopWhen: stepCountIs(8),
    tools: {
      save_household: tool({
        description: 'Save the household profile once every field is known',
        inputSchema: z.object({ firstName: z.string().max(40).optional(), county: z.enum(['los_angeles', 'san_francisco']),
          size: z.number().int().min(1).max(20), monthlyIncome: z.number().min(0).max(100_000), childrenUnder18: z.number().int().min(0).max(15),
          pregnant: z.boolean(), adultAge: z.number().int().min(14).max(120),
          immigrationStatus: z.enum(['citizen', 'green_card', 'humanitarian', 'undocumented', 'unknown']), childrenAreCitizens: z.boolean() }),
        execute: async p => {
          const h: Household = { id: hid, phone, ...p };
          store.upsertHousehold(h);
          await safeLog(hid, { type: 'Source', value: 'aid' });
          await safeLog(hid, { type: 'County', value: h.county });
          await safeLog(hid, { type: 'HouseholdSize', value: h.size });
          await safeLog(hid, { type: 'IncomePctFpl', value: pctFpl(h) });
          return 'saved';
        } }),
      check_eligibility: tool({ description: 'Run the deterministic California rules for the saved household', inputSchema: z.object({}),
        execute: async () => {
          const h = store.getHousehold(hid);
          if (!h) return 'Call save_household first.';
          const matches = checkEligibility(h);
          await safeLog(hid, { type: 'Screened', value: matches.filter(x => x.status === 'likely').map(x => x.program).join(',') });
          return matches;
        } }),
      request_documents: tool({ description: 'Record that a document checklist was sent', inputSchema: z.object({ count: z.number().int().min(1).max(20) }),
        execute: async ({ count }) => { await safeLog(hid, { type: 'DocsRequested', value: count }); return 'recorded'; } }),
      record_document: tool({ description: 'Record a received document by type',
        inputSchema: z.object({ docType: z.enum(['id', 'paystub', 'lease', 'ssn_card', 'birth_cert', 'immigration', 'other']) }),
        execute: async ({ docType }) => { await safeLog(hid, { type: 'DocReceived', value: docType }); return 'recorded'; } }),
      send_application_for_review: tool({ description: 'Get the link to their prefilled application to review and sign', inputSchema: z.object({}),
        execute: async () => `${process.env.PUBLIC_BASE_URL}/p/${hid}` }),
      call_office: tool({ description: 'Call an office for them (only with their permission)',
        inputSchema: z.object({ purpose: z.enum(['apply_by_phone', 'reschedule_interview', 'waitlist_check', 'status_check']) }),
        execute: async ({ purpose }) => { await placeOfficeCall(hid, purpose); return 'Calling now. Tell them you will text the result.'; } }),
      confirm_interview: tool({ description: 'They confirmed their county interview', inputSchema: z.object({}),
        execute: async () => { await safeLog(hid, { type: 'InterviewConfirmed' }); return 'confirmed'; } }),
    },
  });
  const reply = text.trim() || 'Got it, one second.';
  store.appendMessage(hid, 'assistant', reply);
  await sendText(phone, reply);
}
```
- [ ] **Step 4: Run the test (it should pass).** The real conversation is tested at Checkpoint 1, once B1–B3 have landed.
- [ ] **Step 5: Commit.** `git add src/agent.ts tests/agent.test.ts && git commit -m "feat: Aid conversational agent with eligibility and case tools"`

### Task A3: Office calls (hold-and-handoff) and outcome extraction

**Files:** Create `src/calls.ts`, `tests/calls.test.ts`
**Interfaces:**
- Consumes `store.*`, `logEvent`, and `placeCall`, `getCall` and `sendText` (A1).
- Produces `buildInstruction(h, purpose)` (pure, tested), `placeOfficeCall(hid, purpose): Promise<string>` and `handleCallTranscribed(callId)`.

- [ ] **Step 1: Write the failing test**

```ts
import { it, expect } from 'vitest';
import { buildInstruction } from '../src/calls.js';
import type { Household } from '../src/contracts.js';
const h: Household = { id: 'h', phone: '+12135550100', firstName: 'Maria', county: 'los_angeles', size: 3, monthlyIncome: 2400,
  childrenUnder18: 2, pregnant: false, adultAge: 31, immigrationStatus: 'citizen', childrenAreCitizens: true };
it('waitlist call asks open or closed and never includes an SSN', () => {
  const s = buildInstruction(h, 'waitlist_check');
  expect(s).toMatch(/Section 8/); expect(s).toMatch(/open or closed/); expect(s).not.toMatch(/\d{3}-\d{2}-\d{4}/);
});
it('apply_by_phone tells the agent to transfer when a live caseworker answers', () => {
  expect(buildInstruction(h, 'apply_by_phone')).toMatch(/transfer/i);
});
```
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement `src/calls.ts`**

```ts
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import * as store from './store.js';
import { logEvent } from './keewano.js';
import { placeCall, getCall, sendText } from './dial.js';
import type { Household, CallPurpose } from './contracts.js';

export function buildInstruction(h: Household, purpose: CallPurpose): string {
  const place = h.county === 'los_angeles' ? 'Los Angeles County' : 'San Francisco';
  const common = `You are Aid, an automated assistant calling on behalf of ${h.firstName ?? 'a client'}, a household of ${h.size} in ${place}, with their permission. Say up front that you are an automated assistant. Be polite and brief. Navigate phone menus by listening and choosing the option for your goal. If put on hold, wait patiently. Never share Social Security numbers and never make up facts.`;
  switch (purpose) {
    case 'apply_by_phone': return `${common} Goal: start a CalFresh and Medi-Cal application by phone. When a live caseworker answers, say "I have ${h.firstName ?? 'the applicant'} ready to join, transferring now" and transfer the call.`;
    case 'reschedule_interview': return `${common} Goal: reschedule their CalFresh phone interview to a weekday morning this week. Confirm the new date, time and the number they will be called from.`;
    case 'waitlist_check': return `${common} Goal: ask whether the Section 8 Housing Choice Voucher waitlist is open or closed right now, when it next opens, and how to get notified. Do not apply on this call.`;
    case 'status_check': return `${common} Goal: ask for the status of their pending application and whether any documents are missing.`;
  }
}

export async function placeOfficeCall(hid: string, purpose: CallPurpose): Promise<string> {
  const h = store.getHousehold(hid);
  if (!h) throw new Error(`unknown household ${hid}`);
  const day = new Date().toISOString().slice(0, 10);
  const callId = await placeCall({ to: process.env.DEMO_OFFICE_PHONE!, instruction: buildInstruction(h, purpose),
    transferTo: purpose === 'apply_by_phone' ? h.phone : undefined, idempotencyKey: `${hid}:${purpose}:${day}` });
  store.saveCall({ dialId: callId, hid, purpose });
  await logEvent(hid, { type: 'CallPlaced', value: purpose }).catch(e => console.error('[keewano]', e));
  return callId;
}

const Outcome = z.object({
  outcome: z.enum(['transferred', 'booked', 'waitlist_open', 'waitlist_closed', 'no_answer', 'info']),
  when: z.string().optional().describe('ISO 8601 datetime if something was scheduled'),
  summaryForClient: z.string().max(300).describe('Friendly text message to the client explaining what happened'),
});

export async function handleCallTranscribed(callId: string) {
  const rec = store.getCallByDialId(callId);
  if (!rec) return; // not a call we placed (e.g. an inbound screening call)
  const call = await getCall(callId);
  const transcript = call.transcript ?? (call.transcriptTurns ?? []).map(t => `${t.speaker}: ${t.text}`).join('\n');
  const { object } = await generateObject({ model: anthropic('claude-sonnet-5-5'), schema: Outcome,
    prompt: `Call purpose: ${rec.purpose}\nTranscript:\n${transcript || '(empty: nobody answered)'}\n\nExtract the outcome.` });
  store.saveCall({ dialId: callId, hid: rec.hid, purpose: rec.purpose, outcome: object.outcome, transcript });
  const log = (e: Parameters<typeof logEvent>[1]) => logEvent(rec.hid, e).catch(err => console.error('[keewano]', err));
  await log({ type: 'CallOutcome', value: object.outcome });
  if (object.outcome === 'waitlist_open' || object.outcome === 'waitlist_closed')
    await log({ type: 'WaitlistStatus', value: object.outcome === 'waitlist_open' ? 'open' : 'closed' });
  const when = object.when ? Date.parse(object.when) : NaN;
  if (object.outcome === 'booked' && Number.isFinite(when)) await log({ type: 'InterviewScheduled', at: Math.floor(when / 1000) });
  const h = store.getHousehold(rec.hid);
  if (h) { store.appendMessage(h.id, 'assistant', object.summaryForClient); await sendText(h.phone, object.summaryForClient); }
}
```
- [ ] **Step 4: Run the test (it should pass), then make one real call (needs B2 and B4)**

```bash
npx tsx -e "import('dotenv/config').then(async()=>{(await import('./src/store.js')).openStore();console.log(await (await import('./src/calls.js')).placeOfficeCall('<Marcus id>','waitlist_check'))})"
```
The teammate on `DEMO_OFFICE_PHONE` answers as the housing authority: "The Section 8 list is closed until March." Expected: when `main.ts` (A5) runs the event loop, the `call.transcribed` event triggers the outcome extraction, and the summary text arrives.
- [ ] **Step 5: Test the transfer.** Place an `apply_by_phone` call. The teammate says "Caseworker speaking." The household's phone should ring with the transferred call. If no transfer happens, read Dial's `transferTo` docs page and adjust the instruction wording.
- [ ] **Step 6: Commit.** `git add src/calls.ts tests/calls.test.ts && git commit -m "feat: office calls with hold-and-handoff and outcome extraction"`

### Task A4: Packet, signing and autonomous submission

**Files:** Create `src/submit.ts`, `web/packet.html`, `tests/submit.test.ts`
**Interfaces:**
- Consumes `store.*`, `checkEligibility`, `logEvent` and `sendText`.
- Produces `escapeHtml`, `buildPayload(h)` (pure, tested), `submitApplication(hid, kind)` and `packetRoutes: PacketRoutes`.

- [ ] **Step 1: Write the failing test**

```ts
import { it, expect } from 'vitest';
import { buildPayload, escapeHtml } from '../src/submit.js';
import type { Household } from '../src/contracts.js';
const h: Household = { id: 'h', phone: '+12135550100', firstName: '<b>Maria</b>', county: 'los_angeles', size: 3, monthlyIncome: 2400,
  childrenUnder18: 2, pregnant: false, adultAge: 31, immigrationStatus: 'citizen', childrenAreCitizens: true };
it('payload includes eligible programs only', () => {
  const p = buildPayload(h);
  expect(p.programs).toContain('calfresh');
  expect(p.programs).not.toContain('general_relief');
});
it('escapes user text before it reaches HTML', () => {
  expect(escapeHtml('<b>"x"</b>')).toBe('&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
});
```
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Write `web/packet.html`.** It's a mobile-first page that uses the same `:root` tokens as `benefits-map.html`, with a single `{{BODY}}` placeholder inside `<main>`. Make the Sign button large and full-width on mobile.
- [ ] **Step 4: Implement `src/submit.ts`**

```ts
import { readFileSync } from 'node:fs';
import * as store from './store.js';
import { checkEligibility } from './eligibility.js';
import { logEvent } from './keewano.js';
import { sendText } from './dial.js';
import type { Household, PacketRoutes, Program } from './contracts.js';

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ENTITIES[c]);

export function buildPayload(h: Household) {
  const matches = checkEligibility(h);
  return {
    applicant: { firstName: h.firstName ?? '', phone: h.phone, county: h.county },
    household: { size: h.size, monthlyIncome: h.monthlyIncome, childrenUnder18: h.childrenUnder18, pregnant: h.pregnant },
    programs: matches.filter(m => m.status !== 'not_eligible').map(m => m.program) as Program[],
    docsChecklist: [...new Set(matches.filter(m => m.status === 'likely').flatMap(m => m.docs))],
  };
}

export async function submitApplication(hid: string, kind: 'minimal' | 'full'): Promise<string> {
  const h = store.getHousehold(hid);
  if (!h) throw new Error(`unknown household ${hid}`);
  const payload = buildPayload(h);
  const res = await fetch(`http://localhost:${process.env.PORT ?? 3000}/county/api/applications`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ householdId: hid, kind, payload }) });
  if (!res.ok) throw new Error(`county submission failed: ${res.status}`);
  const { confirmation } = await res.json() as { confirmation: string };
  for (const p of payload.programs.filter(p => p !== 'section8'))
    await logEvent(hid, { type: 'ApplicationSubmitted', value: p }).catch(e => console.error('[keewano]', e));
  const msg = kind === 'minimal'
    ? `Done! I filed your application to lock in today as your start date (confirmation ${confirmation}). I’ll send the rest once your documents are in.`
    : `Your full application is submitted (confirmation ${confirmation}). The county usually calls for a phone interview next. I’ll remind you before it.`;
  store.appendMessage(hid, 'assistant', msg);
  await sendText(h.phone, msg);
  return confirmation;
}

const template = () => readFileSync(new URL('../web/packet.html', import.meta.url), 'utf8');
export const packetRoutes: PacketRoutes = {
  renderPacket(hid) {
    const h = store.getHousehold(hid);
    if (!h) return template().replace('{{BODY}}', '<p>We couldn’t find this application. Text Aid for a new link.</p>');
    const p = buildPayload(h);
    const rows = checkEligibility(h).filter(m => m.status !== 'not_eligible')
      .map(m => `<li><strong>${escapeHtml(m.program)}</strong>: ${escapeHtml(m.reason)}</li>`).join('');
    const docs = p.docsChecklist.map(d => `<li>${escapeHtml(d)}</li>`).join('');
    return template().replace('{{BODY}}', `
      <h1>Review your application${h.firstName ? `, ${escapeHtml(h.firstName)}` : ''}</h1>
      <p>Household of ${h.size} · $${h.monthlyIncome.toLocaleString()}/month · ${escapeHtml(h.county.replace('_', ' '))}</p>
      <h2>Programs we’ll apply for</h2><ul>${rows}</ul>
      <h2>Documents</h2><ul>${docs}</ul>
      <form method="post" action="/p/${escapeHtml(hid)}/sign">
        <label><input type="checkbox" required> I declare under penalty of perjury that this information is true, and I authorize Aid to submit it for me.</label>
        <button type="submit">Sign &amp; submit</button>
      </form>`);
  },
  async sign(hid) {
    await logEvent(hid, { type: 'PacketSigned' }).catch(e => console.error('[keewano]', e));
    await submitApplication(hid, 'minimal'); // lock the start date now; the autopilot 'submit' action sends the full application
  },
};
```
- [ ] **Step 5: Run the test (it should pass), then run it by hand (needs B6's server)**
  1. Open `/p/<hid>`, tick the box and sign.
  2. Expected: `/county` shows a new `minimal` row with a confirmation number, and the phone gets the confirmation text.
- [ ] **Step 6: Commit.** `git add src/submit.ts web/packet.html tests/submit.test.ts && git commit -m "feat: review-and-sign packet with autonomous county submission"`

### Task A5: Action executor and `main.ts` (the autopilot loop)

**Files:** Create `src/actions.ts`, `src/main.ts`, `tests/actions.test.ts`
**Interfaces:**
- Consumes `Action` and `findActions` (B5), `claimAction` and `getHousehold` (B2), `submitApplication` (A4), `placeOfficeCall` (A3), `sendText` (A1), `logEvent` (B3) and `startServer` (B6).
- Produces `nudgeText(kind, name)` (pure, tested) and `executeAction(a)`.

- [ ] **Step 1: Write the failing test**

```ts
import { it, expect } from 'vitest';
import { nudgeText } from '../src/actions.js';
it('interview nudge names them, warns about unknown numbers and offers reply options', () => {
  const t = nudgeText('interview_nudge', 'Rosa');
  expect(t).toMatch(/Rosa/); expect(t).toMatch(/unknown number/i); expect(t).toMatch(/Reply 1/);
});
it('docs nudge asks for a photo', () => { expect(nudgeText('docs_nudge', 'James')).toMatch(/photo/i); });
```
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement `src/actions.ts`**

```ts
import * as store from './store.js';
import { logEvent } from './keewano.js';
import { sendText } from './dial.js';
import { submitApplication } from './submit.js';
import { placeOfficeCall } from './calls.js';
import type { Action, ActionKind } from './contracts.js';

export function nudgeText(kind: ActionKind, name = 'there'): string {
  switch (kind) {
    case 'interview_nudge': return `Hi ${name}, it’s Aid. Your CalFresh phone interview is coming up. The county will call from an unknown number, so please pick up! Missing it is the #1 reason applications get denied. Reply 1 to confirm, or 2 and I’ll call to reschedule.`;
    case 'docs_nudge': return `Hi ${name}, it’s Aid. We’re still missing your pay stubs. Just snap a photo and text it here. It takes 30 seconds, and then I can finish your application.`;
    case 'renewal_start': return `Hi ${name}, it’s Aid. Your Medi-Cal renewal is due soon. Reply YES and I’ll fill it out for you so your coverage doesn’t lapse.`;
    default: return '';
  }
}

export async function executeAction(a: Action) {
  const day = new Date().toISOString().slice(0, 10);
  if (!store.claimAction(a.householdId, a.kind, day)) return; // already handled today
  const h = store.getHousehold(a.householdId);
  if (!h) return;
  console.log(`[autopilot] ${a.kind} → ${h.firstName ?? h.id} (decided by Keewano query)`);
  if (a.kind === 'submit') { await submitApplication(h.id, 'full'); return; }
  if (a.kind === 'waitlist_check') { await placeOfficeCall(h.id, 'waitlist_check'); return; }
  const text = nudgeText(a.kind, h.firstName);
  store.appendMessage(h.id, 'assistant', text);
  await sendText(h.phone, text);
  await logEvent(h.id, { type: 'NudgeSent', value: a.kind }).catch(e => console.error('[keewano]', e));
}
```
- [ ] **Step 4: Implement `src/main.ts`**

```ts
import 'dotenv/config';
import { openStore } from './store.js';
import { startServer } from './server.js';
import { startEventLoop } from './dial.js';
import { handleInbound } from './agent.js';
import { handleCallTranscribed } from './calls.js';
import { packetRoutes } from './submit.js';
import { findActions } from './autopilot.js';
import { executeAction } from './actions.js';

openStore();
startServer(Number(process.env.PORT ?? 3000), { packet: packetRoutes });
void startEventLoop({ onMessage: handleInbound, onCallTranscribed: handleCallTranscribed });

// Only households in AUTOPILOT_ALLOW get real texts/calls (seeded households have fake numbers).
const allow = new Set((process.env.AUTOPILOT_ALLOW ?? '').split(',').map(s => s.trim()).filter(Boolean));
let running = false;
async function tick() {
  if (running) return; // never overlap ticks
  running = true;
  try {
    for (const a of await findActions()) {
      if (!allow.has(a.householdId)) continue;
      await executeAction(a).catch(e => console.error('[autopilot] action failed', a.kind, a.householdId, e));
    }
  } catch (e) { console.error('[autopilot] tick failed', e); }
  finally { running = false; }
}
setInterval(tick, Number(process.env.AUTOPILOT_MS ?? 120_000));
void tick();
```
**Live households:** a household that comes in live, like Maria, is allowed automatically once it has texted in. Add it to the allow-list when its first message arrives: export a `allowHousehold(hid)` helper from `main.ts` and call it in `handleInbound`, or simply include live demo ids in `AUTOPILOT_ALLOW` before recording.
- [ ] **Step 5: Run the tests (they should pass), then run the whole loop**
  1. Run `npm run dev`.
  2. Within 2 minutes:
     - `DEMO_PERSON_B_PHONE` (Rosa) receives the interview nudge.
     - Lin's full application appears on `/county`.
     - `DEMO_OFFICE_PHONE` rings for Marcus's waitlist call.
  3. Reply "1" from Rosa's phone. The agent logs `InterviewConfirmed`.
  4. About 5 minutes later, Rosa no longer appears in the Keewano `interview_nudge` results, so the loop has closed.
- [ ] **Step 6: Commit.** `git add src/actions.ts src/main.ts tests/actions.test.ts && git commit -m "feat: keewano-driven autopilot executes nudges, submissions and calls"`

---

## Checkpoint 1 (2:15–2:45, both)

- [ ] `npm test` passes completely.
- [ ] Start a tunnel with `npx cloudflared tunnel --url http://localhost:3000` and set `PUBLIC_BASE_URL` to its URL.
- [ ] Run `npm run dev`. From an iPhone, text "I need help with food" and complete screening. You get an eligibility summary with dollar amounts.
- [ ] Get the packet link, open it on the phone, sign it. The `/county` page shows the confirmation, and the phone gets the confirmation text.
- [ ] About 5 minutes later, Keewano shows `Screened`, `PacketSigned` and `ApplicationSubmitted` for that household.

## Checkpoint 2 (3:30–3:45, both): demo run-through

- [ ] Run the demo script below twice. Time it, and note any step that was flaky.
- [ ] Wipe the live test household so the recorded demo starts clean: delete `aid.db` and re-run the seed, or text from a fresh phone.

## Demo script (5 minutes or less)

| Time | Show |
|---|---|
| 0:00–0:35 | **The problem.** Applying for CalFresh, Medi-Cal and Section 8 means hours of forms, hold time and missed interviews. Show the Keewano baseline: how many baseline households ever submitted, versus Aid. |
| 0:35–1:50 | **Live text flow.** iPhone texts Aid → screening → "likely CalFresh ~$X, Medi-Cal, CalWORKs ~$Y; ~$Z per year" → photo of a pay stub → packet link → **Sign** → `/county` shows the confirmation and the phone receives it. |
| 1:50–2:50 | **Hold-and-handoff.** "Can you check if Section 8 is open?" Aid calls the "housing authority" (teammate), the outcome comes back by text, and the transcript is on the dashboard. |
| 2:50–3:50 | **Keewano autopilot.** Dashboard queue with "via Keewano" cards → the **live query** fires → Rosa's phone gets the nudge → reply "1" → explain the loop. Then take an **unprepared question** in the "Ask Keewano" box. |
| 3:50–4:30 | **Time saved.** Baseline vs Aid from Keewano. Per household, roughly 6–10 hours today versus about 30–40 minutes with Aid; say clearly these hours are team estimates. |
| 4:30–5:00 | **Business.** Clinics and Medi-Cal plans pay per enrollment or kept member. Why now: the 2025 federal law adds work requirements and 6-month renewals from January 2027. Be explicit about what's mocked (county submission, the office phone) and what's next (the authorized-representative channel, more counties). |

## Submission (4:30–4:45)

- [ ] On HackerSquad, fill in: project name, description, repo link, team, technologies (Dial, Keewano, Alike, Claude) and the Keewano project name. Upload the video. **Click Submit** and confirm the status shows "submitted".
- [ ] Make the repo public, or give judges access before 5:00.

---

## Self-review notes

- **Spec coverage:**
  - Six programs: B1.
  - Dial texts, iMessage, calls and handoff: Task 0 Step 5, A1 and A3.
  - Keewano is load-bearing (the autopilot comes only from Keewano; live query; staff Ask; before/after metric): B3–B6 and A5.
  - Autonomous submission (minimal on sign, full via autopilot, by phone via handoff): A3, A4 and A5.
  - Keeps going: the A5 loop plus event triggers.
  - Alike: contract decisions recorded with `alike it`.
- **Known unknowns, each with a verification step:**
  - Keewano SQL column names and functions (B5 Step 1).
  - Dial's getCall REST path (A1 comment).
  - How Dial's `transferTo` is triggered (A3 Step 5).
  - Dial's iMessage flag name, and whether iMessage avoids the carrier block (Task 0 Step 5).
  - Dial SDK event shapes (A1 Step 4).
  - SF CAAP and Section 8 limits (returned as `needs_info` by design).
- **Estimates labelled in the product:**
  - CalFresh dollar amounts.
  - CalWORKs: the family-of-3 maximum grant is used as the cap for every household size.
  - Section 8 limits for other household sizes are calculated with HUD's standard size factors.
  - The per-household hours saved.
