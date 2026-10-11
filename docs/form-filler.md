# Browser form-filler and mock BenefitsCal

Files: `src/benefitscal/{spec,mockSite,browser,filler}.ts`, `scripts/fill-demo.ts`, `tests/benefitscal.test.ts`.

## Run

```
npm run dev:api                                   # serves the mock at http://localhost:3000/mock/benefitscal
npx tsx scripts/fill-demo.ts --mode local                 # visible Chromium (add --headless for CI)
npx tsx scripts/fill-demo.ts --mode kernel [--hold 60]    # Kernel hosted browser, prints the live view URL
```

Options: `--household <id>` (default Lin), `--base <url>`, `--hold <seconds>` (keeps the Kernel browser open after the run so judges can watch).

Kernel browsers run in the cloud and cannot reach localhost. With `--mode kernel` and a localhost base, the script starts a
`cloudflared` quick tunnel automatically. In a deployment, pass the public API URL as `--base` / `baseUrl`.

## Flow

sign in (any email/password) -> 6-digit code (`123456`, logged as `[mock-benefitscal] verification code for <email>: 123456`,
also at `GET /mock/benefitscal/_last-code`) -> 9 sections -> upload (jpeg/png/pdf, under 7.99 MB) -> review -> signature screen (`ABPAP`).

The filler reads `data-page-id` from each page, fills fields from `SECTIONS` + `buildAnswers(household, extra)`, and **stops at
the signature page**. `shouldStopAt(pageId)` is plain code; the filler never fills `sig_*` fields and `advance()` throws on that page.
Only an explicit `POST /mock/benefitscal/submit` with a completed signature block yields a `MOCK-########` confirmation.

## Integration

```ts
const r = await fillApplication({ householdId, baseUrl, mode: 'kernel', onEvent, getVerificationCode, extra, holdMs });
// r.status: 'stopped_for_signature' | 'needs_human' | 'error'; r.liveViewUrl; r.screenshotPath; r.missingFields; r.replayViewUrl
```

`getVerificationCode(email)` defaults to polling the mock; swap in a human prompt or AgentMail for a real deployment.
Fields the Household lacks (last name, dob, address, employer...) come from `extra`; unknowns stay blank and a required blank
field makes the run return `needs_human`.

## Limits

State is in memory (lost on restart). The mock is a demo-sized replica, not the real site's 234 routes. Oversized PDFs cannot be
compressed and are skipped. The replay URL is returned only after the browser is closed.

## Kernel live view: keeping the link alive

Why links used to die: the fill step deleted the Kernel browser 10 s after the stop at signature, and cleared
`workflow.liveViewUrl`, and the UI showed the live panel only while the fill step was running. Tunnels were
handed to Kernel even when `/api/health` never answered through them.

Now:
- After the stop at signature the Kernel browser stays alive for `KERNEL_HOLD_SECONDS` (default 600). Kernel's own
  inactivity timeout is `max(900, hold + 300)` s. A scheduled cleanup (`kernelSessions.ts`) stops the replay and deletes
  the browser after the hold, or immediately when the sign step finishes.
- The fill step stores `kernelSessionId`, `replayUrl` and `heldUntil` in its meta.
- `GET /api/workflows/:id/live` (owner only) re-reads the browser from Kernel (`browsers.retrieve`) and returns
  `{ url, status: 'live' | 'ended', replayUrl?, embeddable }`. The UI calls it on open, on Refresh and when the frame fails,
  and shows the replay once the session ended.
- Kernel live view pages send no `X-Frame-Options`/`frame-ancestors`, so the iframe works, but the port is 8443 and some
  networks block it: "Open live browser" (new tab) is the primary path, the iframe is a preview.
- `tunnel.ts` health-checks `GET /api/health` through the tunnel (up to 30 s), keeps one healthy tunnel per process and
  restarts it when a check fails. Kernel creation is retried once, then the step falls back to a local browser.
- Dev note: `tsx watch` restarts the server on any `src/` edit, which drops the mock site's in-memory session and makes a
  running fill land on "signin". That is a dev-only failure, not a live-view one.

## Real BenefitsCal (opt-in, preview by default)

Read the guardrail header in `src/benefitscal/realSite.ts` first. Requires `ALLOW_REAL_BENEFITSCAL=true`.

```
ALLOW_REAL_BENEFITSCAL=true npx tsx scripts/real-benefitscal.ts --landing-only        # read-only check of the landing page
ALLOW_REAL_BENEFITSCAL=true npx tsx scripts/real-benefitscal.ts --household <id>      # preview: proposes a fill plan, types nothing
ALLOW_REAL_BENEFITSCAL=true npx tsx scripts/real-benefitscal.ts --household <id> --type
```

1. Open the printed live view link and sign in yourself (including the verification code). Aid never sees credentials.
2. Open your application (an `/ApplyForBenefits/AB…` page). Aid polls for that for up to 10 minutes.
3. Preview: Aid reads the visible fields, maps your real profile data with the LLM, prints/records `{label, value, confidence}`
   and a screenshot, and types nothing. With `--type` it types only those values (never checkboxes/radios), then clicks only
   Next/Continue/Save and continue.
4. Hard stops in code: never clicks anything matching `/submit|sign|signature|agree|certify|i declare|penalty of perjury|send application|finish/i`,
   never ticks rights/signature checkboxes, stops at `ABORS`, `ABSID`, `ABPAP` or a "Review and Submit"/"Sign" heading.
   Seed households (`+1213555…`, `+1213556…`, `+1213557…`, `+1555…`) can be previewed but never typed. No uploads.

Workflow: `POST /api/workflows { programs, target: 'real' }` (400 unless the env flag is set). The fill step opens the real site,
waits for your sign-in, records the plan and waits for you. Approving the fill step re-attaches to the same browser and types.
