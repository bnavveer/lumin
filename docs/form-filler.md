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
