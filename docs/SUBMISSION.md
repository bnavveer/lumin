# SpeedHacks submission: {{NAME}}

> **Naming note:** "Aid" is the working name. The team may rename it to "Caseless" or "Nudge". Replace every `{{NAME}}` in this file once the name is final (find and replace). The repo, README and UI still say "Aid".
>
> **Number rule:** every number below is either **MEASURED** (comes from code, tests or a live query) or labelled **ESTIMATE**. Estimates are team judgment, not study results. Edit the "Verify before submitting" list at the end.

---

## 1. Name, tagline, short description

**Name:** {{NAME}}

**Tagline:** An AI caseworker that fills out the benefits paperwork, chases the county, and keeps your case moving until you are approved.

**Description (3 sentences):**
{{NAME}} lets a person text a phone number, answer a few questions, and get screened for six California programs (CalFresh, Medi-Cal, CalWORKs, General Relief, CFAP, Section 8), then prepares the application and the document photos for them. A hosted browser fills the form and stops before the signature, so a human always reviews and signs. After that, Keewano's event history decides who needs a nudge (unconfirmed interview, missing documents, stalled application, closed waitlist, renewal), so cases keep moving without a caseworker tracking each one by hand.

---

## 2. Long description (HackerSquad form, about 250 words)

Getting benefits in California means hours of forms, document hunting, hold music and missed interview calls. Most of that time is not the application itself; it is the follow-up, and it falls on low-income families and on overloaded clinic staff.

{{NAME}} is an AI caseworker for community clinics. A household texts in, Claude asks short questions, and a deterministic rules engine (not the model) screens for six programs. The household photographs documents, which are read, compressed and checked for expiry and missing items. A Kernel hosted browser then fills the application and stops at the signature screen; a person always signs. Each case gets an AgentMail inbox, and county emails are classified into events. Keewano holds every case event and decides who needs a follow-up: a live Keewano query, not a cron list, produces the autopilot queue. Staff can ask Keewano unprepared questions, and see a baseline vs {{NAME}} time-to-submit metric. Answers about rules are cited from our research notes (Supabase pgvector, with Exa for live waitlist and resource lookups) and work in Spanish. Neon AI Gateway routes each task to the best model (Claude, Gemini or GPT) with fallback.

**What is real:** the screening engine, text conversation, document vault, form-filling code, AgentMail inbox, Keewano queries and autopilot, Exa lookups, org-isolated Supabase data.
**What is mocked:** BenefitsCal and the county intake are mocks we built from live research of the real flow; nothing is submitted to a real agency. The two-week Keewano history is **synthetic** and labelled as such. DEMO_MODE fallbacks exist for vendor outages.

**Next:** real authorized-representative submission channels, more counties and programs (PG&E CARE/FERA, WIC, LifeLine are already mapped), HIPAA readiness.

---

## 3. Time saved

**Scope:** one household applying for 2 to 3 programs and keeping them for a year. All figures are **ESTIMATES** from the build plan, per household per year, and **include setup, review and correction time on the {{NAME}} side** (the person still reads the summary, checks the form and signs). They are not measured on real families.

| Step | Today (ESTIMATE) | With {{NAME}} (ESTIMATE, incl. review) | What changes |
|---|---|---|---|
| Discovering eligibility | 1 to 1.5 h | about 5 min | Text screening against deterministic rules; the person confirms the answers |
| Applying | 1.5 to 3 h | 12 to 15 min | Form pre-filled from the conversation; person reviews and signs |
| Documents | 1 to 1.5 h | 6 to 8 min | Photo in, read, compressed, checked for expiry and missing items; the person fixes anything flagged |
| Phone and hold time | 1.5 to 2 h | 2 to 3 min | Agent contacts offices; the person joins only to confirm identity (note: the voice-call lane is a teammate's work, see section 5) |
| Missed interviews | 0.5 to 1 h (reschedule, redo) | about 2 min | Nudge and one-tap confirm before the interview |
| Renewal | 0.5 to 1 h | 5 to 7 min | Renewal start triggered by a Keewano query; prior data reused |
| **Total per year** | **about 6 to 10 h** | **about 32 to 40 min** | |

The per-step split is our allocation of the plan's total (about 6 to 10 hours down to about 30 to 40 minutes); the totals are the claim, the rows are illustrative. We have not timed real users.

**What is MEASURED:** the Keewano metric compares **median hours from screening to application submitted** for a `baseline` cohort vs an `aid` cohort. The data behind it is a **synthetic two-week history** we seeded (120 households; baseline modeled as slow and drop-off-prone, {{NAME}} as same-day). It demonstrates that the metric is computed live from Keewano, not that {{NAME}} produces those results in the real world. Read the number as a pipeline check.

**Caseworker capacity:** about **4 to 5x** more households per caseworker (**ESTIMATE**), because staff review exceptions instead of chasing every case.

---

## 4. Technologies used (form field)

Claude (Anthropic) · Keewano (agent memory, autopilot queries, Ask Keewano via MCP, time-saved metric) · Dial (SMS / iMessage / voice) · Alike (shared decision record between teammates' agent sessions) · Supabase (Postgres with org-level RLS, private Storage, pgvector, staff auth) · Neon AI Gateway (per-task model routing across Claude, Gemini and GPT with cross-provider fallback, embeddings, translation) · Kernel (hosted browser with live view and replay) · AgentMail (per-case inboxes) · Exa (live waitlist and resource lookups with citations) · Devin (background research and self-repairing form scripts) · TypeScript, Node, Hono, React, Vite, Tailwind, Playwright, Vitest

---

## 5. Sponsor prizes

**Keewano.** Keewano is the agent's memory and its decision-maker. Every case event (screened, docs requested, packet signed, interview scheduled, county email received, nudge variant sent) is a small typed Keewano event. The autopilot queue comes only from Keewano SQL queries (interview unconfirmed in 48 h, documents requested over 3 days with none received, signed but not submitted, waitlist closed 7+ days, renewal due within 30 days); if Keewano is removed, no follow-ups happen. Staff use Ask Keewano (MCP) for unprepared questions, nudge wording is A/B tested from Keewano data, and the before/after time-saved metric is a live query over baseline vs {{NAME}} cohorts. Queries are in `docs/keewano-queries.md`. Honest caveat: the history is synthetic, and the notes record that row semantics were not fully verified against live data when written.

**Dial.** Dial is the household's channel: SMS/iMessage for the conversation, consent and STOP/HELP handling, document photos, nudges, and voice for office calls and hold-and-handoff. Without it, the people we serve (who often have a phone but not a laptop or an app habit) have no way in. Dial is a teammate's lane; confirm which pieces are live before submitting (see checklist). Consent copy and STOP handling are implemented in `src/conversation/`.

**Alike.** The two teammates built in parallel from one frozen API contract (`src/contracts.ts`). Contract changes and design decisions were recorded in Alike so both agent sessions saw them, which is why the lanes merged without conflicts. It is process infrastructure, not a user-facing feature; we do not claim more than that.

---

## 6. Market and path forward

**Buyers**
- Community clinics and FQHCs: want patients enrolled and kept on coverage.
- Medi-Cal managed-care plans: paid per member and lose revenue when members churn at renewal.
- Community-based organizations (CBOs) that run enrollment assistance with thin staff.

**Pricing ideas (not tested)**
- Per successful enrollment or per retained member per year.
- Free 60-day pilot with one clinic, measured by the Keewano time-to-submit metric on real cases.

**Why now:** the 2025 federal law adds Medicaid work requirements and moves Medicaid renewals to every 6 months from January 2027. More paperwork, more documents, more ways to lose coverage by missing a deadline. Plans and clinics will pay to prevent that churn.

**Moat**
- Authorized-representative relationships with households and counties (hard to copy, slow to build).
- Form maps: we have already mapped BenefitsCal (nine sections, 234 routes observed), PG&E CARE/FERA, WIC and LifeLine.
- Keewano outcome data: which nudge wording, timing and channel get people to finish.

**Roadmap:** more counties and programs, real authorized-representative submission channels, HIPAA readiness and a BAA path, more languages.

---

## 7. Demo video script (5 minutes)

| Time | Show | Rubric |
|---|---|---|
| 0:00 to 0:30 | Problem: hours of forms, hold time and missed interviews for CalFresh, Medi-Cal and Section 8. Say the headline estimate (6 to 10 h down to 30 to 40 min) and that it is an estimate. | Problem and impact (40%) |
| 0:30 to 1:20 | Text flow: consent message (YES / STOP), screening conversation, result with program list and estimated monthly values, photo of a pay stub read into the vault. Deterministic rules, not the model, decide eligibility. | Product quality and demo; technical execution |
| 1:20 to 2:10 | Kernel live view: hosted browser fills the (mock) BenefitsCal application section by section and stops at the signature screen. State: a human always signs; the mock is built from live research of the real flow. | Technical execution; problem and impact |
| 2:10 to 2:50 | County email arrives in the case's AgentMail inbox, is classified, and a Keewano event appears on the case timeline (shown as a simulated county email, from the demo route). | Technical execution; originality |
| 2:50 to 3:35 | Autopilot queue on the dashboard: cards marked "via Keewano". Show the live Keewano query that produced them; one nudge goes out and the household drops off the queue on the next query. | Technical execution; originality |
| 3:35 to 4:00 | Ask Keewano: type an unprepared question and show the answer. | Technical execution |
| 4:00 to 4:25 | Ask a rules question in Spanish; the answer comes back in Spanish with citations. Then the Section 8 waitlist check via Exa, with source links. | Product quality; problem and impact |
| 4:25 to 4:40 | Time-saved view: baseline vs {{NAME}} median hours to submit. Say it is synthetic seed data. | Problem and impact (40%) |
| 4:40 to 5:00 | Market: clinics and plans pay per enrollment or retained member; January 2027 renewals. State what is mocked and what is next. | Market and path forward |

---

## 8. 60-second pitch

"Getting food assistance or Medi-Cal in California is a part-time job. The application is hours. Then comes the follow-up: the documents, the hold music, the interview you miss because a text got buried. People lose benefits they qualify for, and clinic staff burn their days chasing each case.

{{NAME}} is an AI caseworker. A family texts us. Rules, not a language model, decide what they likely qualify for. Their documents are photographed, read and checked. A hosted browser fills the application and stops at the signature, because a human always signs.

Then the part that matters: Keewano remembers every case event and decides who needs a nudge today, so nothing stalls quietly. Our estimate is six to ten hours a year per household down to thirty to forty minutes, including review. We measure the submit-time difference live in Keewano, on synthetic data for now.

Clinics and Medi-Cal plans pay per enrollment or retained member. And from January 2027, six-month renewals make this problem much bigger. We're {{NAME}}."

---

## 9. Risks and ethics

- **A human always signs.** The form-filler never fills signature fields and refuses to advance past the signature page. Anything legally binding needs the person's own action. Submission in the demo goes only to a mock.
- **Consent and STOP compliance.** First contact requires an explicit YES; STOP opts out and stays opted out until START; HELP is answered; message copy includes "Msg&data rates may apply". Spanish consent text is hand-written, not machine-translated.
- **Org-isolated data.** Supabase row-level security scopes every record to the owning clinic; documents sit in a private bucket with signed URLs; packet links are HMAC-signed.
- **No passwords stored.** Portal credentials and verification codes are not saved. The research notes record that no password or code was kept.
- **Minimal PII in analytics.** Keewano events are small and typed (counts, program names, categories); no message text, transcripts or documents go to Keewano. The household identifier is a derived ID.
- **Not an eligibility decision.** Screening is guidance; the county decides. Estimates are labelled as estimates and the UI says to apply even if close to a limit.
- **Model risk.** The AI converses and extracts; it does not decide eligibility. Model calls fall back across providers, and unreadable photos get a request for a clearer one rather than a guess.
- **Not production-ready for PHI.** HIPAA controls, a BAA path and a security review are roadmap items, not done.

---

## Verify before submitting

1. Replace `{{NAME}}` everywhere.
2. Confirm with the Dial teammate what is live (SMS/iMessage, voice hold-and-handoff). The repo's `src/` has no standalone Dial client file; text and edit section 3 (phone row), section 5 and the demo script to match what is actually demoed.
3. Confirm the Keewano project name and add it to the form.
4. Run the live Keewano metric once and paste the real baseline vs {{NAME}} median hours here, labelled synthetic.
5. Confirm the Kernel step runs from the deployed (not localhost) URL, and the county-email step works with the demo route.
6. Decide whether to claim Devin and Alike usage as shown; remove anything not shown.
7. Make the repo public or give judges access before 5:00 PM PT.
