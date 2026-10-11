# Shared chat, text and call screening

The public frontend and Dial use one `Conversation` instance in `src/main.ts`. Answers are saved to the intake repository and screened by `src/applicationScreening.ts`. `shared/chat.ts` defines the browser/API result shape.

- Web chat shows preliminary program matches as answers arrive, including reasons, missing questions and official application links. “Help me check” sends the chosen program back into the same chat.
- A browser session becomes linked to a phone only after the person confirms the summary by replying YES from that phone. A typed phone number alone never exposes its history.
- Linked browser sessions poll every five seconds while visible. Text replies and processed call transcripts update the same answers and program list. Live calls collect answers; saved-case screening and follow-up occur after the call ends.
- Incoming Dial events are filtered to the configured Aid line and deduplicated. Tests inject fake messaging, calls and event delivery.

## Run

Configure `.env` from `.env.example`, including Supabase, the agent credentials, and Dial. Apply the intake migration `supabase/migrations/20261011200000_intake.sql` before using the persistent repository. `INTAKE_STORE=memory` is only for local trials; it does not survive restarts.

```sh
npm install
npm --prefix web install
npm --prefix web run build
npm run dev
```

Visit `http://localhost:3000/chat`. This entry serves the built frontend, chat/feedback API and Dial event listener together. For frontend hot reload, also run `npm run dev:web`; Vite proxies `/api` to port 3000. The `dev:api` entry mounts the same account, staff, vault, workflow and chat routes with the Dial listener disabled.

`DIAL_FROM_NUMBER` selects the line. Set `PUBLIC_DIAL_NUMBER` to its E.164 phone number if the selector is an ID or nickname; `/api/config` exposes only this public number to the frontend. `DIAL_ENABLED=false` disables the event listener during web-only development. Sending a confirmation from the live conversation still uses real messaging.

After changing the voice prompt, apply it to the configured line:

```sh
npx tsx scripts/dial-setup.ts
```

## Check without contacting anyone

```sh
npm run verify
npm --prefix web run build
npx tsx scripts/integration-preview.ts
```

The preview on `http://127.0.0.1:4177/chat` uses synthetic answers, a fake agent and fake messaging with the real HTTP API, conversation service and matcher. It cannot be run in production mode. Any first message creates the sample family’s matches; “Help me check” exercises the chat action.

On October 11, 2026, the configured live inbound instruction was successfully updated and read back, and the four intake/conversation tables were reachable. No real call or SMS roundtrip was made for this integration check. Browser visual verification was blocked by the browser tool failing to load its request-header policy. Automated API/channel integration tests cover the shared state flow; they do not establish live carrier delivery.

After pulling `origin/main` through `efbcc02` and merging the upstream offline-test fix `cf94c18`, all 250 tests passed. TypeScript and the frontend production build passed. A local HTTP smoke check verified four sample matches, a program follow-up, session restoration and phone configuration. The native compression test has its own 30-second timeout for slower machines.

## Applicant and staff integration

`src/main.ts` now serves the complete `src/server.ts` application with the same conversation instance used by Dial. The frontend exposes `/account`, `/account/screening`, `/account/documents`, `/applications/:id`, `/staff` and `/staff/cases/:id`. `/api/me` requires a real Supabase bearer token; an anonymous 401 is expected, not a missing route.

Apply these migrations after the existing base, intake, vault and conversation migrations:

- `20261011250000_applicant_workflows.sql`: profiles, one-owner chat claims, workflow history, private uploads, storage-deletion retries and verified household linking.
- `20261011260000_phone_preferences.sql`: persistent pre-intake STOP preferences.

An applicant may prepare a workflow before phone confirmation. Once the claimed chat is confirmed by SMS, its account, existing workflows and uploaded documents connect to that verified household. Staff can see workflow summaries and documents only within their own clinic. A typed phone number alone does not link records.

Incoming SMS routes between intake and case management; pending intake confirmation takes priority over case-action approval. Proactive delivery uses the consent/STOP/quiet-hours guard and starts only with `AUTOPILOT_ENABLED=true` plus the existing household allowlist. Staff approval responses are saved in the case conversation; that route does not currently send an SMS.

### Filing boundary for the live tester

The automatic filler in `src/benefitscal/filler.ts` targets the mock site and stops at signature. The applicant workflow currently supports preparation, private documents, official application handoffs, and clearly unverified applicant-reported receipts. It does **not** currently fill or submit the real BenefitsCal application. No mock confirmation or applicant-reported reference writes a real submitted-application record. Near end-to-end official filing remains a separate incomplete integration.

Local regression tests use injected services; they do not prove live carrier delivery, portal filling, signature, or agency acceptance. Live portal testing is assigned to the other tester per the user’s instruction.
