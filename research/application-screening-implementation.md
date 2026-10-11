# Application matching from collected answers

Implemented October 11, 2026 in `src/applicationScreening.ts`, connected to the shared SMS, web chat and post-call conversation service. This is an application shortlist, not a final eligibility decision or automated submission.

## Behavior

The agent saves answers, calls `screen_applications`, and explains likely matches with one relevant follow-up question. Incomplete intake can be screened before phone confirmation. The chat API includes `view.screening` on message responses and session reads, so clients can consume deterministic results directly. Each result includes program name, status, reason, missing fields, follow-up questions, application/source URL, source date, effective-through date, next step and screening/referral coverage.

Confirmed checking requires the current intake to remain confirmed. Editing any answer invalidates that state; the confirmed-check tool cannot return the old household as if it reflected the edit. Preliminary suggestions update immediately. Supplemental answers are stored in the existing intake JSON and included in the confirmation summary; the frozen household, program and submission contracts are unchanged. Linked conversations retain their extra answers after confirmation.

## Coverage

| Programs | Current support |
|---|---|
| CalFresh, Medi-Cal | Adapts existing six-program engine, preserves likely matches, and routes unknown status and apparent exclusions to county review. No benefit amounts or totals in this application shortlist. |
| CalWORKs, General Relief, CFAP, Section 8 | Agency review: existing simplified cash/household/AMI calculations are insufficient for firm qualification. These return needs-info with the application route. |
| PG&E CARE / FERA | Separate all-resident income/count; current assistance route for CARE; utility/electric service, residence, account-name, dependency and shared-meter checks. Shared application; no simultaneous CARE/FERA recommendation. |
| WIC | Pregnancy, child under five, breastfeeding infant and recent-pregnancy categories; separate WIC family/monthly income or current adjunctive route. Office verifies the participant/family route and nutrition risk. Over-income cases retain exception review. |
| California LifeLine | Economic-household count/income or actual current assistance participation; duplicate-household-benefit question; provider initiation. No inherited BenefitsCal household assumptions. |
| LIHEAP, IHSS, subsidized child care | Need-based referrals only. No local income/funding/assessment rules claimed; route to provider/county/agency. |

Missing answers stay unknown, not zero or false. A pending application or a likely program match never establishes current program participation. Supplemental household counts/income must be explicitly confirmed for their program scope rather than silently copied from the food household. No SSN, password, utility account number or document upload is needed just to screen.

The existing agent’s base intake remains limited to Los Angeles and San Francisco. Supplemental California programs can be screened with stated California residency, but expanded county onboarding/routing remains separate work. The dataset does not claim to cover every program in the wider benefits guide.

## Rules and sources

- PG&E: [current enrollment guidance](https://www.pge.com/en/account/billing-and-assistance/financial-assistance/california-alternate-rates-for-energy-program.html), [FERA](https://www.pge.com/en/account/billing-and-assistance/financial-assistance/family-electric-rate-assistance-program-fera.html), and the June 2026 form recorded in [the application map](pge-care-fera-application-map.md). CARE maximum for 1–2 residents $43,280/year, plus $11,360 per additional resident; FERA upper limit $54,100, plus $14,200, and above CARE's income band. Valid through May 31, 2027.
- WIC: [state screener](https://myfamily.wic.ca.gov/Home/AmIEligible), effective May 1, 2026–June 30, 2027. Monthly table rounds the annual 185% guideline upward: $29,526 plus $10,508 per additional member, divided by 12 and rounded up. WIC family-size exceptions and adjunctive eligibility require local verification; [research map](california-wic-application-map.md).
- LifeLine: [CPUC eligibility table](https://www.cpuc.ca.gov/lifeline), effective June 1, 2026–May 31, 2027: annual $24,600 / $33,300 / $42,100 / $50,800 for sizes 1–4, then $8,700 per added member. Uses the current CPUC table, not inconsistent prose in the sample packet. [Research map](california-lifeline-application-map.md).
- Existing six-program inputs originate in `data/programs.ts` and the earlier research. The new adapter requires review after 2026 ends; that cutoff is an implementation freshness safeguard, not a claim that every program legally expires then. Exact county rules, immigration exceptions, deductions and benefit amounts still need more complete rule coverage.
- Referral routes: [LIHEAP](https://www.csd.ca.gov/Pages/LIHEAPProgram.aspx), [IHSS](https://www.cdss.ca.gov/in-home-supportive-services/contact-us), [child care](https://www.cdss.ca.gov/calworks-child-care).

Outside the supported income-table dates the matcher returns needs-info, rather than applying an expired threshold. Dates do not eliminate the need to monitor intervening policy changes. No agent message, signature, application submission, deployment or production database change was performed to test this feature.

## Verification

Focused tests cover partial profiles, unknown immigration, distinct households, current participation versus pending matches, income boundaries, CARE/FERA exclusivity, WIC categories and monthly rounding, LifeLine duplicates, stale tables, invalid values, confirmation persistence and corrected answers. Conversation tests use local fake agents and messaging; no real texts or external AI requests are made.

The channel integration additionally tests partial web screening, text confirmation linking, post-call supplemental answers appearing in the same browser session, line filtering, event deduplication, frontend serving and public phone configuration. See [channel integration](../docs/channel-integration.md) for setup and verification limits.
