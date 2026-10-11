# AgentMail (case inboxes)

Each household gets an inbox `aid-case-<first 8 of id>@agentmail.to`, used as the clinic's authorized-representative contact (with consent).
County emails are classified deterministically (src/inboxClassifier.ts), stored in `inbound_emails`, logged to Keewano, and noted in the case thread.

- API: `https://api.agentmail.to/v0`, `Authorization: Bearer $AGENTMAIL_API_KEY`
- Webhook: `POST /api/webhooks/agentmail` (event `message.received`). Svix signatures (`svix-id`, `svix-timestamp`, `svix-signature`, secret `whsec_...`) verified with `AGENTMAIL_WEBHOOK_SECRET`; without Svix headers, `?secret=<AGENTMAIL_WEBHOOK_SECRET>` is required.
- Polling fallback: `GET /api/staff/cases/:id/inbox` syncs the inbox first.
- Demo: `POST /api/demo/county-email {householdId, template}` (DEMO_MODE=true only) sends a labelled simulation from `la-county-dpss-demo@agentmail.to` (override with `AGENTMAIL_DEMO_INBOX`).
