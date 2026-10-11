# Scripted county calls

Aid calls "the county office" with questions you can edit, then shows the transcript and a table of answers.
For the demo, **the county office is your own phone**: calls only ever go to `DEMO_OFFICE_PHONE`.

Code: `src/calls/*` (scripts, runtime, triggers, routes), `shared/calls.ts` (API contract), UI in
`web/src/account/CallPanel.tsx` (mounted on the workflow's call step), table `scripted_calls`
(`supabase/migrations/20261011260000_calls.sql`).

## Env

| Var | Needed for |
|---|---|
| `DIAL_API_KEY` | real calls and texts |
| `DIAL_FROM_NUMBER_ID` (or `DIAL_FROM_NUMBER`) | the Dial line Aid calls from |
| `DEMO_OFFICE_PHONE` | the number that plays the county office (your phone). Never anything else is dialed. |
| `CALL_SIMULATE=true` | no Dial: an LLM role-plays the county. Everything is labelled SIMULATED. Takes precedence over real calls. |
| `AUTO_CALL_ON_EMAIL=true` | optional: a county email starts the call at once instead of asking for approval |
| `DEMO_MODE=true` | enables `POST /api/demo/county-email` |

Without Dial (and without `CALL_SIMULATE`), the UI and `GET /api/calls/config` say
"Calling isn't configured: add DIAL_API_KEY, DIAL_FROM_NUMBER_ID and DEMO_OFFICE_PHONE"; everything else works.

For a real-phone demo, remove `CALL_SIMULATE` from `.env` and restart the API.

## Demo choreography

1. Sign in, open a workflow (`/workflows/:id`). The **Call the county** card sits on the call step.
2. Send the county email: `curl -X POST localhost:3000/api/demo/county-email -H 'content-type: application/json' -d '{"householdId":"<household id>","template":"interview_scheduled"}'`,
   then let the inbox sync (the AgentMail webhook, or open the case inbox on the staff dashboard, which calls
   `GET /api/staff/cases/:id/inbox`).
3. A proposed call appears in **Next steps**: "Aid wants to call DPSS to confirm the interview. Approve?" (plus a text if Dial is set up).
4. Click **Edit questions**: change the purpose, rewrite, reorder, add or remove questions, or press "Suggest questions". Edits auto-save to the call step.
5. Click **Approve**. Aid calls `DEMO_OFFICE_PHONE`, saying first that it is an automated assistant calling on the applicant's behalf with permission.
6. Your phone rings. Answer as the county and reply to each question. Aid confirms every answer back.
7. The live card moves through Dialing → Ringing → In progress → Done; the answers table (question, answer, confidence), the summary and the transcript appear, and the call step gets a `call_transcript` evidence row.
8. The applicant gets a 1 to 2 line text summary (when the household has a phone and Dial is configured).

"Call now" in the editor starts a call immediately, without the approval step.

## API (all need `Authorization: Bearer <applicant token>`, owner-scoped; other users get 404)

- `GET /api/calls/config` → `{ enabled, simulated, officePhoneMasked, message }`
- `GET /api/workflows/:id/calls` → call history
- `POST /api/workflows/:id/calls/suggest {purpose}` → `CallScript`
- `GET|POST /api/workflows/:id/calls/script` → the script saved on the call step (used on approve)
- `POST /api/workflows/:id/calls {script, purpose?}` → starts a call
- `GET /api/calls/:callId` → status, transcript, answers
