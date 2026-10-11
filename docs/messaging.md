# Aid by text: the conversation engine

After setup, a person manages their whole case by text: status, documents, interviews, approvals, questions, renewals, language, opt-out, and reaching a human. There is no app and no login. The engine is channel-agnostic and **never sends anything itself**. The caller (Dial SMS loop, email, simulator) delivers the replies it returns.

Code: `src/caseManager/` (engine, intents, tools, approvals, consent, state, status, prompts, routes, deps). Migration: `supabase/migrations/20261011240000_conversation.sql` (`conversation_state`, `consents`, `pending_approvals`, `orgs.join_code`).

## Integration (Dial loop)

```ts
import { handleIncomingMessage, proactiveMessage } from './caseManager/index.js';

// inbound SMS / iMessage
const replies = await handleIncomingMessage({
  channel: 'sms', from: evt.from, text: evt.body ?? '',
  media: evt.media?.map((m) => ({ url: m.url, contentType: m.contentType })),
  messageId: evt.id,                       // duplicates are ignored
});
for (const r of replies) await sendText(r.to, r.text);

// autopilot nudge (actions.ts)
for (const r of await proactiveMessage(householdId, 'interview_nudge')) await sendText(r.to, r.text);
```

`proactiveMessage` kinds: `interview_nudge`, `docs_nudge`, `renewal_start`, `submit` (creates a pending approval), `waitlist_check` (no text). It returns `[]` when the person has not consented, has opted out, or it is quiet hours (8pm to 8am Pacific).

## Flow

1. **Setup.** The first text (or `JOIN <CODE>`) creates the household, attaches it to the clinic (`orgs.join_code`; `AID` is the demo clinic), and asks for consent. The consent text also covers AI reading the documents the person sends. Nothing else happens until **YES**, and photos are not processed before then. The exact wording and the timestamp are stored in `consents`.
2. **Deterministic keywords** (English and Spanish), checked before the LLM: `STOP/ALTO`, `START`, `HELP/AYUDA`, `STATUS/ESTADO`, `DOCS`, `HUMAN/HUMANO`, `LANG ES|EN|ZH|VI|TL`, `RENEW/RENOVAR`, `YES/SI`, `NO`, and `1`/`2` after an interview nudge. After STOP, only START gets a reply.
3. **Photos.** The engine calls `storeDocumentFromUrl`, then `startExtraction`, and replies "Reading your document". A later turn reports what was read and what is still missing.
4. **LLM layer.** Anything else goes to `model('agent')` with tools: update_household, check_eligibility, vault_status, request_document, answer_question, find_local_resources, propose_action, get_status, escalate_to_human.

## Approvals (human in the loop)

Consequential actions (`submit_application`, `run_filler`, `call_office`, `share_documents`, `start_renewal`) are only **proposed** as rows in `pending_approvals`. The person sees fixed text built from the action kind (`describeAction`). Any text the model wrote is shown only as a quoted note. **YES** resolves the latest pending approval and **NO** declines it. Staff can resolve an approval too, with `POST /api/staff/cases/:id/approvals/:approvalId/resolve {decision}`. Texting YES is never a legal signature: submit and renewal send the signed `packetUrl()` link, and the person signs there.

## Simulator (DEMO_MODE only, staff auth, reserved +1555 numbers)

- `POST /api/dev/sim/message {from:"+15555550123", text, mediaUrls?}` returns `{replies, ms}`.
- `GET /api/dev/sim/thread?from=+15555550123` returns the transcript, state and approvals.
- CLI: `npx tsx scripts/text-sim.ts +15555550123` (in-process; `/photo <url>`, `/thread`, `/quit`).
