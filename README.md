# Lumin

**California benefits, one conversation.** Lumin is an AI caseworker for Californians. You tell it about your household in your own words, by web chat, text message or phone call. It works out which programs you likely qualify for, collects what the application needs, gathers your documents, fills out the BenefitsCal application for CalFresh, Medi-Cal, CalWORKs, CFAP and General Relief, and stops so **you** can review and sign. Then it follows up with the county for you.

> **Status:** working prototype. Every flow below runs end to end against real services (Supabase, the AI gateway, Dial, Kernel, AgentMail, Exa, Keewano). Applications are filled on a **practice replica of BenefitsCal** and submitted to a **mock county endpoint**. Filling the real benefitscal.com is an opt-in preview mode that never signs or submits (see [Safety and guardrails](#safety-and-guardrails)). Eligibility results are screening estimates; the county always decides.

---

## Contents

- [What it does](#what-it-does)
- [How a case moves](#how-a-case-moves)
- [Features](#features)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Running safely in development](#running-safely-in-development)
- [Database](#database)
- [Scripts](#scripts)
- [Testing](#testing)
- [HTTP API overview](#http-api-overview)
- [Safety and guardrails](#safety-and-guardrails)
- [Design and content](#design-and-content)
- [Research and accuracy](#research-and-accuracy)
- [Known limitations](#known-limitations)
- [More documentation](#more-documentation)
- [Credits and licenses](#credits-and-licenses)

---

## What it does

| For the person applying | For clinic and community staff |
|---|---|
| Ask in plain words (English or Spanish), by web chat, text or a phone call. It's one case, whichever channel they use. | A staff dashboard with every case, its timeline, messages, documents and calls. |
| See which programs likely fit, with estimated amounts and what's still uncertain. | An autopilot queue: Keewano analytics decides who needs a nudge (missed interview, missing documents, renewal), and the agent words it. |
| Keep answers, documents and next steps in an account. | "Ask Lumin": questions about the caseload answered from Keewano data. |
| Lumin researches each program, fills out the application and stops at the signature. The person signs, and Lumin submits and tracks it. | Document vault per household, with expiry and missing-document checks. |
| Lumin can call or email the county (with permission) and reports back by chat or text. | Time-saved metrics: the Lumin cohort vs. a baseline cohort. |

**Programs.** Screening covers CalFresh, Medi-Cal, CalWORKs, General Relief, CFAP, Section 8, PG&E CARE and FERA, WIC, California LifeLine, LIHEAP, IHSS and subsidized child care. The BenefitsCal application (one form) covers **CalFresh, Medi-Cal, CalWORKs, CFAP and General Relief**. Other programs get a referral with the official link and what to bring. Counties: **Los Angeles** and **San Francisco** for now.

---

## How a case moves

```
 Website chat ─┐
 Text (Dial) ──┼─▶ Conversation engine ─▶ Claude agent (tools) ─▶ intake (draft answers)
 Phone (Dial) ─┘    (src/conversation.ts)   save_answers                    │
                                            save_application_details        │ reply YES by text
                                            screen_applications             ▼
                                            schedule_call            confirmed household
                                                                            │
  Account (Supabase Auth) ◀── chat linked to account ──┐                    │
     │  dashboard, application details, documents      │                    │
     ▼                                                  │                    ▼
  Start an application ─▶ Workflow engine (src/workflow/engine.ts)
     research ─▶ documents ─▶ fill (BenefitsCal, Kernel browser) ─▶ sign (person) ─▶ submit ─▶ call ─▶ notify ─▶ follow-up
```

1. **Talk.** The agent asks one question at a time: county, household size, income, children, pregnancy, age, immigration status (optional, "prefer not to say" is fine).
2. **Confirm.** Answers stay a draft until the person replies **YES** to a summary texted to their phone. Nothing becomes the household record before that.
3. **Screen.** A rules engine (not the model) checks each program and returns likely, needs-info or not-eligible, with reasons and sources.
4. **Apply.** In their account, the person picks programs. Lumin needs the **application details** too: legal name, date of birth, address, everyone in the household, job and pay, rent, savings, vehicle, taxes, voter registration, interview preference. The chat collects these, or the person fills them in on `/account/details`. A readiness card shows what's left.
5. **Workflow.** Research (with citations) → documents → fill the BenefitsCal form → **the person signs** → submit → optional county call → text update → follow-up reminders. Every step leaves evidence (sources, screenshots, live browser view, recordings) on the application page.

---

## Features

### Website (`web/`)
- React 19 + Vite + Tailwind v4. California theme: Pacific blue-greens, a poppy accent, golden-hour backgrounds; Newsreader + Inter type.
- **Home:** a large swipeable photo hero (drag or arrows, loops, holds while you type), a chat bar that docks at the top of the screen as you scroll, a scroll-revealed statement, an animated application walkthrough (conversation → documents → review and sign → filed), feature tiles and a "coming soon" collage.
- **Pages:** `/chat`, `/how-it-works`, `/privacy`, `/about`, `/coming-soon`, `/faq`, `/privacy-policy`, `/terms`, plus `/kit` (component gallery).
- **Account:** `/signup`, `/login`, `/dashboard`, `/account/details`, `/account/documents`, `/account/screening`, `/workflows/:id`. `/account` and `/applications` redirect to `/dashboard`.
- **Staff:** `/staff/login`, `/staff`, `/staff/cases/:id`.
- English and Spanish everywhere (`?lang=es`, the footer menu, or the browser language). All site copy lives in `web/src/site/copy.ts`.
- Voice input (Web Speech API) with clear errors, reduced-motion support, keyboard focus states, sticky skip links.

### Conversation engine and agent
- `src/conversation.ts`: one case per phone number across web, text and voice. Serializes work per thread, rate-limits confirmation texts, and links a web chat to a phone household only after YES.
- `src/agent.ts`: Claude with tools: `save_answers`, `send_confirmation_text`, `screen_applications` / `check_eligibility`, `save_application_details`, `schedule_call`. Never asks for SSNs, bank logins or passwords.
- `src/caseManager/`: the text-message engine (intents, approvals, consent, status).
- `src/llm/`: all AI calls route through the Neon AI Gateway, with a credential per task (agent, fast, vision, knowledge, translate, audio) and cross-provider fallback; `ANTHROPIC_API_KEY` is the last-resort fallback.

### Accounts and applications (`src/workflow/`)
- Supabase Auth accounts. Signup creates the user and signs them in.
- **Application details** (`shared/applicationDetails.ts`): one contract shared by the browser, the API, the chat tool and the filler, with a pure `applicationReadiness()` so they always agree on what's missing.
- **Contact lock:** once a name and phone are saved, changing them requires the account password (re-checked with Supabase).
- Workflow steps live in `src/workflow/steps/` (`research`, `documents`, `fill`, `fillReal`, `finish`). Progress streams to the browser over SSE (`/api/workflows/:id/events`).

### BenefitsCal form filler (`src/benefitscal/`)
- `spec.ts`: a single source of truth for the form (pages, fields, options). `mockSite.ts` serves a practice replica built from it.
- `filler.ts`: Playwright fills it page by page, locally or in a **Kernel** cloud browser with a live view, and stops at the signature page.
- The person's real details are used. On the practice replica only, unanswered fields get clearly fake placeholders, and the step says how many.
- `realSite.ts`: the opt-in real benefitscal.com mode. The person signs in themselves; Lumin previews a fill plan, types only after approval, and never signs or submits.

### Calls, email, documents, knowledge
- **Calls** (`src/calls/`): scripted county calls via Dial, placed now or at a scheduled time, with question editing, live call card and answers extracted back into the case.
- **Email** (`src/agentmail.ts`, `src/inbox*.ts`): an AgentMail inbox per case; county emails are classified (interview scheduled, documents requested, denial) and can propose a follow-up call.
- **Documents** (`src/vault.ts`, `src/docExtract.ts`): private Supabase Storage, compression, vision extraction, expiry, missing-document checks.
- **Knowledge** (`src/knowledge.ts`, `src/webKnowledge.ts`): cited answers from `research/*.md` (pgvector) plus live web results from Exa. The Section 8 waitlist watcher reads housing-authority pages.

### Analytics and autopilot
- **Keewano** (`src/keewano.ts`): append-only case event types; SQL queries drive the autopilot (`src/autopilot.ts`, `src/demoRunner.ts`), staff "Ask Lumin" (`src/staffAsk.ts`), wording insights and time-saved metrics.

---

## Architecture

| Layer | Technology |
|---|---|
| Web app | React 19, Vite 8, Tailwind CSS v4, TypeScript |
| API | Node + Hono (`src/server.ts`), one process serving chat, accounts, staff, calls and the mock county |
| AI | Claude via the Neon AI Gateway (Anthropic SDK tool runner), embeddings via the gateway |
| Data | Supabase: Postgres with RLS, Auth, Storage, pgvector |
| Messaging | Dial: SMS, outbound calls, inbound voice agent, event stream |
| Browser automation | Playwright, Kernel cloud browsers, cloudflared quick tunnels |
| Email | AgentMail |
| Web search | Exa |
| Analytics | Keewano |
| Tests | Vitest (41 files, 399 tests) |

`src/main.ts` is the production entry. It starts the HTTP server plus the Dial event loop, the scheduled-call loop, the inbox poller and (optionally) the autopilot. `src/devServer.ts` is the same server with the Dial event loop off.

---

## Repository layout

| Path | What's there |
|---|---|
| `src/` | The API: conversation engine, agent, eligibility, workflow engine, filler, calls, email, knowledge, analytics |
| `shared/` | Browser-safe wire contracts shared by `src/` and `web/` (`chat.ts`, `workflow.ts`, `calls.ts`, `applicationDetails.ts`) |
| `web/` | The website (`web/src/site` public pages, `web/src/account` applicant pages, `web/src/staff` staff pages, `web/src/components` UI kit, `web/src/data` programs, portals and photos) |
| `supabase/` | SQL migrations and seed data |
| `tests/` | Vitest suites (fakes for every external service) |
| `scripts/` | Live checks, demos and one-time setup (see [Scripts](#scripts)) |
| `research/` | Cited research notes: program rules, how to apply, form maps for BenefitsCal, LifeLine, PG&E CARE/FERA, WIC |
| `docs/` | Deeper docs per subsystem (see [More documentation](#more-documentation)) |
| `design/` | Brand spec (`BRANDING.md`) and reference screenshots |
| `benefits-map.html` | The original one-page benefits guide (open in any browser, no build) |

---

## Getting started

### Prerequisites
- Node.js 22 or newer (developed on Node 24)
- A Supabase project (Postgres, Auth, Storage)
- Credentials for the services you want live: the Neon AI Gateway (or an Anthropic key), Dial, Kernel, AgentMail, Exa, Keewano. Most features degrade gracefully or have a demo mode when a service is missing.

### 1. Install

```bash
git clone https://github.com/bnavveer/aid.git
cd aid
npm install
npm --prefix web install
npx playwright install chromium   # only needed for the local form filler
```

### 2. Configure

```bash
cp .env.example .env
# fill in the values; see "Environment variables" below
```

### 3. Create the database

Apply every file in `supabase/migrations/` in order, then `supabase/seed.sql`. Options:
- Supabase SQL editor: paste each file in order.
- Supabase CLI: `supabase db push`, then `psql < supabase/seed.sql`.
- Supabase MCP: `apply_migration` per file.

All migrations are idempotent (`if not exists`, `drop ... if exists`), so re-running them is safe.

### 4. Run

Two terminals:

```bash
# API on http://localhost:3000. See "Running safely" before using real numbers.
SCHEDULED_CALLS_ENABLED=false INBOX_POLL_ENABLED=false npm run dev:api

# Website. Vite forwards /api to http://localhost:3000 (override with API_URL).
npm --prefix web run dev            # http://localhost:5173
# or: npm run dev:web               # http://localhost:5174
```

Open the site, ask a question in the hero chat bar, then create an account to see the dashboard.

**No backend? Sample-account mode.** In development, add `?fixtures=1` to any account URL (e.g. `/dashboard?fixtures=1`) to see the account pages with fictional data and no API calls. `?fixtures=0` turns it off. It never works in a production build.

---

## Environment variables

Copy `.env.example`. Never commit real values.

| Variable | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Supabase project, public key (served to the browser), service-role key (server only) |
| `SUPABASE_DB_PASSWORD` | Direct SQL / migration scripts |
| `INTAKE_STORE` | `memory` keeps chat intakes in memory (no Supabase needed for chat) |
| `NEON_AI_GATEWAY_BASE_URL`, `NEON_AI_GATEWAY_TOKEN`, `NEON_AI_TOKEN_{AGENT,FAST,VISION,KNOWLEDGE}` | AI gateway and per-task credentials |
| `AID_MODEL`, `AID_MODEL_{AGENT,FAST,VISION,TRANSLATE,KNOWLEDGE,AUDIO}` | Optional model overrides per task |
| `ANTHROPIC_API_KEY` | Last-resort direct fallback when no gateway is set |
| `AID_LLM_CLASSIFY` | `0` skips the LLM inbox classifier |
| `DIAL_API_KEY`, `DIAL_FROM_NUMBER` (or `DIAL_FROM_NUMBER_ID`), `PUBLIC_DIAL_NUMBER`, `DIAL_WEBHOOK_SECRET` | Texts and calls |
| `DIAL_ENABLED` | `false` disables the inbound Dial event loop |
| `KERNEL_API_KEY`, `KERNEL_HOLD_SECONDS` | Cloud browser for the form filler, and how long its live view stays open |
| `ALLOW_REAL_BENEFITSCAL` | `true` allows the opt-in real benefitscal.com preview mode |
| `AGENTMAIL_API_KEY`, `AGENTMAIL_WEBHOOK_SECRET`, `AGENTMAIL_DEMO_INBOX` | Case inboxes and the demo county-email sender |
| `INBOX_POLL_ENABLED` | `false` disables background inbox polling (on by default when an AgentMail key is set) |
| `AUTO_CALL_ON_EMAIL` | `true` lets a county email place the follow-up call automatically (default: propose only) |
| `SCHEDULED_CALLS_ENABLED` | `false` disables the loop that places scheduled county calls (on by default) |
| `DEMO_OFFICE_PHONE` | The only number the workflow's county call may dial in the demo |
| `EXA_API_KEY` | Live web knowledge and the waitlist watcher |
| `DEVIN_API_KEY` | Deep dives and a document-extraction fallback |
| `KEEWANO_SDK_KEY`, `KEEWANO_PROJECT_ID`, `KEEWANO_PAT`, `KEEWANO_PG_USER` | Analytics events and SQL |
| `AUTOPILOT_ENABLED`, `AUTOPILOT_MS`, `AUTOPILOT_ALLOW` | Autopilot loop: on/off, tick interval, households it may text |
| `DEMO_MODE` | `true` serves canned staff data when a live service fails (never bypasses auth) |
| `PACKET_LINK_SECRET` | Signs `/p/:id` packet links |
| `PUBLIC_BASE_URL` | Public URL of the API (packet links, Kernel reaching the practice site, signup redirects) |
| `PORT` | API port (default 3000) |
| `TRUST_PROXY` | Trust `X-Forwarded-For` only behind a known proxy |
| `DEMO_PERSON_B_PHONE` | Live-demo participant's phone for `scripts/seed.ts` |
| `API_URL` (web) | Where the Vite dev server forwards `/api` |

---

## Running safely in development

The dev server talks to real services. Before running it against real numbers:

- **Texts are real.** `npm run dev:api` turns off the *inbound* Dial loop, but the chat can still send the YES confirmation text through Dial. For local testing without texting, blank the Dial key: `DIAL_API_KEY= DIAL_FROM_NUMBER= npm run dev:api`.
- **Scheduled calls are real.** The scheduled-call loop is on by default and will place calls stored in the shared database. Use `SCHEDULED_CALLS_ENABLED=false`.
- **Inbox polling** is on by default when `AGENTMAIL_API_KEY` is set. Use `INBOX_POLL_ENABLED=false`.
- **Autopilot** only runs with `AUTOPILOT_ENABLED=true`, and only texts households in `AUTOPILOT_ALLOW`.
- Use fictional 555-01xx numbers for test households. `src/caseManager` has a DEMO_MODE simulator with reserved +1555 numbers.

---

## Database

Supabase Postgres with row-level security; all writes go through the server. Migrations (`supabase/migrations/`, applied in order):

| Migration | Adds |
|---|---|
| `…190000_init` | Orgs, households, staff, events, timeline, messages, documents, submissions (RLS by org) |
| `…200000_intake`, `…200000_onboarding` | Cross-channel intakes and threads; clinic setup |
| `…210000_vault` | Document vault |
| `…220000_inboxes` | Per-case AgentMail inboxes and email log |
| `…230000_knowledge` | pgvector knowledge chunks |
| `…240000_conversation` | Text-engine state |
| `…250000_workflows` | Applicant accounts, workflows, steps, evidence |
| `…260000_calls`, `…290000_scheduled_calls` | County calls and scheduled calls |
| `…270000_applicant_workflows`, `…280000_phone_preferences` | Applicant profiles, chat claims, workflow state, phone preferences |
| `…300000_application_details` | `applicant_profiles.application_details` and an atomic merge function (service role only) |

Index the research notes for knowledge answers: `npx tsx scripts/index-research.ts`.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Production-like server (`src/main.ts`), including the Dial event loop |
| `npm run dev:api` | The same API without the inbound Dial loop |
| `npm run dev:web` | Website on port 5174 |
| `npm run typecheck` / `npm test` / `npm run verify` | Type check, tests, both |
| `npm --prefix web run build` | Production build of the website (type checks first) |
| `npx tsx scripts/text-sim.ts` | Chat with the text engine in your terminal (no Dial, no HTTP) |
| `npx tsx scripts/chat-e2e.ts` | Live web-chat test against a running server |
| `npx tsx scripts/fill-demo.ts --household <id> --mode local\|kernel` | Run the form filler on the practice replica |
| `npx tsx scripts/real-benefitscal.ts` | Opt-in real benefitscal.com preview (read `src/benefitscal/realSite.ts` first) |
| `npx tsx scripts/sms-roundtrip.ts`, `scripts/dial-to-dial-test.ts` | Live Dial checks |
| `npx tsx scripts/dial-setup.ts` | One-time: point the Dial number's voice agent at the intake script |
| `npx tsx scripts/seed.ts` | Seed demo households and history |
| `npx tsx scripts/register-events.ts` | Register Keewano event types |
| `npx tsx scripts/index-research.ts` | Reload `research/*.md` into the knowledge index |
| `npx tsx scripts/integration-preview.ts` | Local UI fixture with the real API and screener, no AI calls or messages |

---

## Testing

```bash
npm test             # all suites
npm run verify       # type check + tests
npm --prefix web run build
```

Every external service has a fake, so the suites run offline. Two inbox tests reach real services if your `.env` keys are present; run `mv .env .env.off && npm test && mv .env.off .env` for a fully hermetic run (CI has no `.env`).

---

## HTTP API overview

Full contracts are in `shared/*.ts`; subsystem docs in `docs/`.

| Route | Purpose |
|---|---|
| `POST /api/chat/sessions`, `POST /api/chat/sessions/:id/messages`, `GET /api/chat/sessions/:id` | Website chat |
| `POST /api/auth/signup` | Create an applicant account (rate limited) |
| `GET /api/me`, `POST /api/me/profile` | Profile and contact details (saved name/phone need `currentPassword` to change) |
| `GET/POST /api/me/application-details` | Application details plus readiness |
| `POST /api/me/link-chat`, `GET /api/me/screening`, `GET /api/me/suggestions` | Link a chat, saved answers, program suggestions |
| `GET/POST /api/me/documents`, `GET /api/me/documents/:id/download`, `DELETE /api/me/documents/:id` | Private document vault |
| `GET/POST /api/workflows`, `GET /api/workflows/:id`, `GET /api/workflows/:id/events` (SSE) | Applications and live progress |
| `POST /api/workflows/:id/documents`, `/approve`, `/run`, `/receipt`, `GET /live` | Uploads, approvals, retries, receipts, fresh live-view links |
| `/api/staff/*` | Staff dashboard, cases, vault, autopilot, Ask Lumin, metrics (staff token) |
| `/api/calls/*` | Scripted and scheduled county calls |
| `POST /api/feedback` | Anonymous site feedback and answer ratings |

All `/api/me/*` and `/api/workflows/*` routes need `Authorization: Bearer <Supabase access token>` and fail closed, including in DEMO_MODE.

---

## Safety and guardrails

- **The person signs, never Lumin.** The filler stops at the signature page. The person signs and taps "I've signed".
- **Confirmation by text.** Chat answers are a draft until the phone owner replies YES. A web visitor can't link someone else's phone household, and confirmation texts are rate-limited per number.
- **Consent before acting.** County calls and real-site typing need explicit approval.
- **No placeholder data on the real site.** Real benefitscal.com waits until application details are complete, always previews first, types only after approval, and never signs or submits. Placeholders exist only on the practice replica, and they're counted.
- **Sensitive data.** The agent never asks for SSNs, bank logins or passwords. Immigration status is optional. Documents are private (signed, short-lived download links).
- **Locked contact details.** Changing a saved name or phone needs the account password.
- **Honest copy.** The site doesn't claim to be a government website; eligibility is presented as screening, and the county decides.

---

## Design and content

- Brand spec, colors, type and the photo pipeline: [`design/BRANDING.md`](design/BRANDING.md). Theme tokens: `web/src/brand/theme.css`. Names: `web/src/brand/brand.ts`.
- Photos: `web/public/photos/` (film look applied by `web/scripts/vintage.py`), credits in `web/src/data/photos.ts`. The hero and account pages use only CC0 / public-domain photos, so no credit line is needed there.
- Agency marks on the home page: `web/public/marks/`, switchable with `USE_REAL_MARKS` in `web/src/site/media.tsx`. Read the legal note in BRANDING.md before launch.

---

## Research and accuracy

`research/` holds the cited notes behind the rules and the guide (researched October 11, 2026): federal and California programs, how and where to apply, and field-by-field maps of the BenefitsCal, California LifeLine, PG&E CARE/FERA and WIC applications.

**Key 2026 numbers:** poverty line $15,960 for 1 person (+$5,680 each); SNAP up to $306/mo for 1, $1,023 for 4 (CalFresh gross limit 200% FPL vs. SNAP's 130%); Medi-Cal adults 138% FPL; SSI/SSP in California $1,233.94/mo; WIC 185% FPL.

Facts marked **UNCONFIRMED** or **(U)** came from secondary sources; check them before relying on them. Screening is an estimate: offices count income differently, and the county decides. For free local help, call or text **211**.

`benefits-map.html` is the original standalone guide: an income ladder calculator, where to apply in California, 33 benefits in 7 groups, and what changed in 2025–2027.

---

## Known limitations

- **Two account backends coexist.** The workflow engine (`src/workflow/routes.ts`, `applicant_accounts`) answers first; the earlier account routes (`src/workflow/accountRoutes.ts`, `applicant_profiles`) still serve application details, screening, documents and chat links. Consolidating them would simplify linking.
- **Email isn't verified at signup.** The engine creates confirmed users (no confirmation email).
- **Practice filing.** End to end runs on the BenefitsCal replica and a mock county endpoint; the real site is preview-only.
- **Coverage.** Two counties (Los Angeles, San Francisco); the BenefitsCal form fills the first other household member in detail.
- **Rate limiting** is in-memory (single process).

---

## More documentation

| Doc | Covers |
|---|---|
| [`docs/workflow.md`](docs/workflow.md) | Applicant accounts and the workflow steps |
| [`docs/form-filler.md`](docs/form-filler.md) | The BenefitsCal filler, Kernel live view, real-site mode |
| [`docs/channel-integration.md`](docs/channel-integration.md) | Shared chat, text and call screening |
| [`docs/messaging.md`](docs/messaging.md) | The text-message engine |
| [`docs/calls.md`](docs/calls.md) | Scripted and scheduled county calls |
| [`docs/agentmail.md`](docs/agentmail.md) | Case inboxes and county email |
| [`docs/keewano-queries.md`](docs/keewano-queries.md) | Analytics queries behind autopilot and metrics |
| [`docs/DEMO.md`](docs/DEMO.md) | A five-minute end-to-end demo run sheet |
| [`supabase/README.md`](supabase/README.md) | Applying the schema and seed |
| [`design/BRANDING.md`](design/BRANDING.md) | Brand, photos and pre-launch checklist |

---

## Credits and licenses

- Photos: Wikimedia Commons, the Library of Congress (Carol M. Highsmith), the National Park Service, USDA and BLM. CC0, public domain or CC BY 2.0 (credited where shown); details in `web/src/data/photos.ts`.
- California flag and the agency seals and logos in `web/public/marks/`: public domain via Wikimedia Commons (see the legal note in BRANDING.md).
- Fonts: Newsreader and Inter (SIL Open Font License); Mrs Saint Delafield for the example signature (OFL).
