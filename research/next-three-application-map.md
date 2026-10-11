# Next three application flows

Researched October 11, 2026: PG&E CARE/FERA, California WIC, and California LifeLine. This package maps public forms, conditional questions, evidence, submission routes, and reuse of the BenefitsCal intake. It does not contain an application for a real person. No account was created, identity/contact values entered, document uploaded, signature made, message sent, or application submitted for these three programs.

## Research package

| Program | Application and document map | Structured field inventory | Live coverage |
|---|---|---|---|
| PG&E CARE/FERA | [Application map](pge-care-fera-application-map.md) | [JSON](pge-care-fera-intake-fields.json) | Public initial online page; income, assistance-program, and contractor branches. Later pages require utility account details. |
| California WIC | [Application map](california-wic-application-map.md) | [JSON](california-wic-intake-fields.json) | State screener and Fresno EOC local intake, including caregiver, transfer, mailing address, language, agriculture, and five child slots. Fresno is a research example, not an assumed residence. |
| California LifeLine | [Application map](california-lifeline-application-map.md) | [JSON](california-lifeline-intake-fields.json) | Public registration Step 1, enrollment-code explanation, acceptable identification and proof lists. Provider-started case needed for later steps. |

Each schema distinguishes `live_observed`, `public_web`, and `paper_reference_not_live`. Required status follows the source; `not_marked` does not establish optionality or server behavior. An entry can describe a field group, repeated record, attachment, or certification. Counts are inventory entries, not necessarily a count of distinct questions an applicant sees.

## What the product should collect and where it should hand off

| Flow | Reusable candidates after review | New or program-specific information | Submission path |
|---|---|---|---|
| PG&E CARE/FERA | Contact/address/language; current all-resident counts; current income records or actual qualifying-program participation | Utility account number and bill-holder match; communication choice; meter/dependency declaration; landlord fields for sub-metered route | Direct online application or signed paper/phone route. Standard initial enrollment does not require eligibility-proof attachments. Later requested verification is a separate flow. |
| WIC | Applicant/child identities; contact/address/language; current income or verified qualifying-program evidence | Local agency; pregnancy/postpartum/breastfeeding category; child age; appointment preference; nutrition assessment and conditional clinician forms | Local intake requests an appointment/contact. WIC staff complete certification. The state screener and a local web intake are not themselves completed benefit certification. |
| California LifeLine | Legal identity/DOB/addresses; SSN last four when applicable; current assistance or income evidence | Participating provider and issued enrollment code; economic-household questions; qualifying dependent; applicable tribal/TTY details; portal authentication; fresh initials and signature | Provider initiates case; applicant completes issued form online or by mail with required evidence by the actual issued deadline. |

Keep program-specific household definitions. PG&E counts all residents for household income. LifeLine asks about sharing income and living expenses. WIC has its own family and pregnancy/foster-child rules. BenefitsCal answers can seed a review, but cannot settle those definitions automatically. A pending BenefitsCal application is not proof of program enrollment.

Collect credentials and one-time codes only in the relevant provider's authentication flow; these are documented workflow requirements, not reusable intake answers. Do not copy a BenefitsCal password, signature, or authorization to another program.

## Live WIC details that affect the interface

- The state screener asks residence, category, then qualifying-program participation or household size. Selecting a household size displays an income table and a tentative result; it does not collect or verify actual income. Local staff determine eligibility.
- Fresno EOC's maternal role reveals pregnancy/breastfeeding/postpartum checkboxes. Dad reveals mother-of-child identity and address-sameness questions; a different address reveals an explanation. Legal guardian and foster-parent selections hide those mother questions.
- A different mailing address reveals mailing-address fields; Other language reveals a language textbox. Children expand sequentially to five slots, each with name, birthdate, foster and breastfeeding questions.
- Transfer within California asks prior county. Transfer from another state displays a records-fax instruction with acknowledgement. Agriculture work reveals whether the worker had to leave the area.
- No income amount, SSN, document upload, or signature was observed in the exposed Fresno intake. Its Submit button was not pressed and CAPTCHA was not completed. The page also includes unrelated newsletter/contact forms; those are excluded from the WIC inventory.

## Unresolved source and access limits

- PG&E's current website and enrollment PDFs disagree on the mailing ZIP+4 for the same PO Box. The program map preserves both; verify the return address before mailing.
- WIC local offices can have different intake forms. An older posted physical-presence waiver has an expiration before this research date while Fresno still offers phone appointments; confirm current appointment/certification arrangements with the chosen office.
- LifeLine's official sample packet has fictional identifiers and dates; never use them to start or match a case. Its income prose and broadband wording have conflicts documented in the program map. California and federal Lifeline have separate processes.
- Later PG&E and LifeLine online pages, server validation, uploads, authenticated review, submission receipts, and real eligibility outcomes are unverified. The official paper/reference inventories cover the available questions without pretending those pages were traversed.

Sources, versions, locators, and per-field reuse notes are recorded in the linked program files. The official blank/sample PDFs are references, not completed applications. Recheck changing limits and instructions when implementing or applying.
