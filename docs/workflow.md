# Applicant accounts and application workflows

Code: `src/workflow/` (mounted in `src/server.ts` via `registerWorkflowRoutes(app)`). Wire contract: `shared/workflow.ts`.
Migration: `supabase/migrations/20261011250000_workflows.sql` (applicant_accounts, workflows, workflow_steps, workflow_evidence; RLS select-own, writes are server-only).

## Accounts
- `POST /api/auth/signup` creates a confirmed Supabase Auth user (email/password, no confirmation email). Rate limited 5/min/IP. 409 if the email exists.
- All other routes need `Authorization: Bearer <supabase access token>`. `GET /api/workflows/:id/events` also accepts `?access_token=` because EventSource cannot send headers. DEMO_MODE never bypasses auth.
- `POST /api/me/profile {phone}` links the account to the household keyed by that phone (the same id text/voice use). Without a phone the household id is `uuidv5('acct:<userId>')`. Missing household answers get placeholder defaults until the web chat (`chatSessionId`) fills them.

## Steps (in order)
| step | what happens | waits on you |
|---|---|---|
| research (one per program, parallel) | `answerFromResearch` (research/*.md) + `answerFromWeb` (Exa) + Section 8 waitlist watcher. Each citation becomes `citation` evidence; summary is 2-3 sentences. | no |
| documents | Vault vs `REQUIRED_DOCS` for CalFresh/Medi-Cal/CalWORKs. Upload via `POST /api/workflows/:id/documents` (jpeg/png/webp/pdf, 10 MB) → Storage + documents row + compression + vision extraction. | yes, until all docs are on file or you approve "continue without" |
| fill | One BenefitsCal fill for calfresh/medi_cal/calworks on Kernel (public URL from `PUBLIC_BASE_URL` if https, else a cloudflared quick tunnel, `src/benefitscal/tunnel.ts`), falling back to a local browser. Stops at the signature page. Evidence: live_view, screenshot, replay. Other programs get a skipped fill step with an `open_url` next step. | no |
| sign | Points at the mock signature page; approve = "I signed". Logs PacketSigned. | yes |
| submit | POSTs the mock county endpoint, `confirmation` evidence, ApplicationSubmitted per program. | no |
| call | Only after approval, only to `DEMO_OFFICE_PHONE`, via Dial; polls up to 3 min, summarizes the transcript. Skipped if Dial is not configured. | yes |
| notify | Texts the account phone. Skipped without a phone or Dial. | no |
| follow_up | Notes that the Keewano autopilot will remind about interviews and renewals. | no |

Failures mark only that step `failed` with a "Try again" (`POST /api/workflows/:id/run {stepId}`). A step never runs twice at once; a step left `running` by a restart is marked failed on the next advance.

## Tests
`tests/workflow.test.ts` drives the HTTP routes with fake deps (`WorkflowDeps` in `src/workflow/deps.ts`) and the memory repo.
