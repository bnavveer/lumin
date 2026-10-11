# Aid demo run sheet (5 minutes, Lane B end to end)

Everything here works without Lane A (Dial). Texts are simulated in-process and outbound nudges land in the household thread.

Setup once: copy `.env.example` to `.env` and fill it in, set `DEMO_MODE=true`, `AUTOPILOT_ALLOW=<household ids>`, `PUBLIC_BASE_URL`. Seed data with `npx tsx scripts/seed.ts`.

```bash
export BASE=http://localhost:3000
export LIN=377f71de-5cef-5c6d-8fb4-55c846de892f   # demo household (Lin)
```

In DEMO_MODE the staff routes need no token. Otherwise add `-H "Authorization: Bearer $TOKEN"` to every `/api/staff/*` call.

## 0. Start the API (0:00)

```bash
npm run dev:api          # tsx watch src/devServer.ts, API on :3000, autopilot loop on
curl $BASE/api/health    # {"ok":true}
```

Dashboard (optional): `npm run dev:web` then http://localhost:5174.

## 1. Text the agent (0:30)

```bash
npx tsx scripts/text-sim.ts +12135550123
```

Type `hi`, answer the screener, `YES`, `STATUS`, `DOCS`, `LANG ES`. `/photo <https-url>` sends a document photo, `/thread` prints the transcript, `/quit` exits.

HTTP equivalent:

```bash
curl -s -X POST $BASE/api/dev/sim/message -H 'content-type: application/json' \
  -d '{"from":"+12135550123","text":"hi"}'
curl -s "$BASE/api/dev/sim/thread?from=%2B12135550123"
```

## 2. Form-filler on Kernel with live view (1:30)

```bash
npx tsx scripts/fill-demo.ts --mode kernel --hold 60
```

Opens a cloud browser (Kernel), prints a live view URL, and fills the mock BenefitsCal for Lin. A cloudflared tunnel starts automatically if the base is localhost. Offline alternative: `--mode local`.

## 3. County email (2:15)

```bash
curl -s -X POST $BASE/api/demo/county-email -H 'content-type: application/json' \
  -d "{\"householdId\":\"$LIN\",\"template\":\"interview_scheduled\"}"
curl -s $BASE/api/staff/cases/$LIN/inbox
```

Templates: `interview_scheduled`, `documents_requested`, `approved`. The email is classified and written to the timeline as a Keewano event.

## 4. Autopilot tick (3:00)

```bash
curl -s -X POST $BASE/api/dev/autopilot/run | jq
```

Keewano SQL finds households needing action, only ids in `AUTOPILOT_ALLOW` are texted, once per household/kind/day. The result lists `sent` (text, variantId), `skipped` (with reasons), extractions polled, and waitlist status. Check the outbound text with the thread call in step 1 or the `[outbox] ->` log line.

## 5. Ask Keewano (3:30)

```bash
curl -s -X POST $BASE/api/staff/ask -H 'content-type: application/json' \
  -d '{"q":"How many households have unconfirmed interviews this week?"}' | jq
```

## 6. Knowledge (4:00)

```bash
curl -s -X POST $BASE/api/knowledge/ask -H 'content-type: application/json' \
  -d '{"question":"Can I get CalFresh if my kids are citizens but I am undocumented?","county":"los_angeles"}' | jq
```

## 7. Waitlist check (4:30)

```bash
curl -s -X POST $BASE/api/staff/waitlists/check | jq
```

Exa reads the HACLA / LACDA pages, the model classifies open vs closed, and affected households get a `WaitlistStatus` event.

## 8. Vault (bonus)

```bash
curl -s $BASE/api/staff/cases/$LIN/vault | jq
curl -s $BASE/api/staff/cases/$LIN/vault/summary | jq
curl -s -X POST $BASE/api/staff/cases/$LIN/doc-requests -H 'content-type: application/json' \
  -d '{"docType":"paystub","reason":"Interview needs two recent paystubs"}'
curl -s -X POST $BASE/api/staff/documents/<document-id>/extract
```

## What is mocked

| Thing | Reality |
|---|---|
| County submission | `POST /county/api/applications` is a local mock that returns a fake confirmation number. Nothing is sent to a real county. |
| BenefitsCal | The form-filler targets our mock BenefitsCal site, not the real one. |
| County email | Sent by our own AgentMail demo sender with canned templates. |
| History | Households and events are synthetic seed data (`scripts/seed.ts`), tagged `Source=baseline` or `aid`. |
| Texts | Simulated via `text-sim` / `/api/dev/sim/*`; Dial SMS is Lane A. |

## If something fails live

- Keep `DEMO_MODE=true`: staff dashboard routes fall back to canned demo data when Supabase or Keewano is down.
- Autopilot finds nothing (Keewano not indexed yet): run `npx tsx scripts/seed.ts` and retry in a minute, or show `GET /api/staff/autopilot` which serves canned actions in DEMO_MODE.
- Model errors: calls fall back across providers automatically (429 included). If all fail, show the pre-recorded clip for that step.
- Kernel live view will not load: rerun with `--mode local` (visible local browser), or pass `--base https://<public-host>`.
- Port busy: `pkill -f "tsx watch src/devServer.ts"; npm run dev:api`.
- Autopilot spamming or unwanted: set `AUTOPILOT_ENABLED=false` and restart; trigger ticks manually instead.
- Waitlist check slow: the result is cached, run it once before recording.
