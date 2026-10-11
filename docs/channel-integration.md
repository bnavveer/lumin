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

Visit `http://localhost:3000/chat`. This entry serves the built frontend, chat/feedback API and Dial event listener together. For frontend hot reload, also run `npm run dev:web`; Vite proxies `/api` to port 3000. The separate `dev:api` entry is the staff API, not the shared chat/Dial entry.

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
