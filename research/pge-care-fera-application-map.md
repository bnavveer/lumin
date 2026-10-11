# PG&E CARE / FERA application map

Researched 2026-10-11. Companion schema: [pge-care-fera-intake-fields.json](pge-care-fera-intake-fields.json), 79 entries: 54 public paper/reference fields and 25 initial-page live observations supplied by the root agent. No account created, personal values entered, signature made, message sent or application submitted. Later online pages have not been verified.

## Official sources and current version

- [CARE overview and enrollment](https://www.pge.com/en/account/billing-and-assistance/financial-assistance/california-alternate-rates-for-energy-program.html).
- [FERA overview and enrollment](https://www.pge.com/en/account/billing-and-assistance/financial-assistance/family-electric-rate-assistance-program-fera.html).
- [Blank residential application PDF](https://www.pge.com/assets/pge/localized/en/docs/account/billing-and-assistance/care-fera-application.pdf): Form 01-9077, Rev. 6.26 CRS-0626-5966, two pages; p. 1 instructions/income tables and p. 2 full form. Rendered p. 2 visually checked during research.
- [Blank sub-metered application PDF](https://www.pge.com/assets/pge/localized/en/docs/account/billing-and-assistance/care-fera-application-sub-meter.pdf): Form 01-9285, Rev. 6.26, two pages; p. 2 tenant/landlord form. [Tariff sample](https://www.pge.com/tariffs/assets/pdf/tariffbook/GAS_FORMS_01-9285.pdf) shows effective June 1, 2026; English form is PDF p. 4 in this tariff wrapper.
- [PEV process](https://www.pge.com/en/account/billing-and-assistance/financial-assistance/care-fera-post-enrollment-verification.html), [PEV FAQ](https://www.pge.com/en/account/billing-and-assistance/financial-assistance/care-fera-pev-faq.html).
- [CARE PEV blank form](https://www.pge.com/assets/pge/localized/en/docs/account/billing-and-assistance/pev-request-form.pdf), June 2025 CCC-0625-4817; [FERA PEV blank form](https://www.pge.com/assets/pge/localized/en/docs/account/billing-and-assistance/fera-pev-request-form.pdf), June 2025 CCC-0625-4827; both two pages.
- [Zero-income affidavit](https://www.pge.com/assets/pge/localized/en/docs/account/billing-and-assistance/zero-affidavit.pdf), June 2024 CCC-0624-7332, one page.

The linked current residential PDF uses guidelines valid through **May 31, 2027**. Search indexes also expose an older large-print form ending May 31, 2026; do not use those expired thresholds. FERA now includes households of 1–2 in its current table; a blanket three-person minimum would be wrong for this reference.

| People | CARE annual gross maximum | FERA annual gross range |
|---|---:|---:|
| 1–2 | $43,280 | $43,281–$54,100 |
| 3 | $54,640 | $54,641–$68,300 |
| 4 | $66,000 | $66,001–$82,500 |
| 5 | $77,360 | $77,361–$96,700 |
| 6 | $88,720 | $88,721–$110,900 |
| 7 | $100,080 | $100,081–$125,100 |
| 8 | $111,440 | $111,441–$139,300 |
| Each added person | Add $11,360 | Table says add $11,360–$14,200 |

Source: current residential PDF p. 1. Current income means all taxable/nontaxable revenue of **all people living in the home**, including wages, interest/dividends, support, assistance, Social Security/pensions, subsidies, rent, self-employment and employment-related noncash income. This is not CalFresh net income or a tax household. CARE and FERA share an application and applicant is screened for the appropriate program; cannot receive both simultaneously. CARE can qualify by eligible public assistance **OR** household income. The PDF's OR instruction resolves the public CARE page's ambiguous list of eligibility bullets.

## Initial online application: live observed by root

The official Apply/Renew button opened [energyinsight.pge.com/carefera?care_lang=english](https://energyinsight.pge.com/carefera?care_lang=english) without a login. The root agent inspected the full initial page and clicked Income, Public Assistance and Community Outreach Contractor choices only. It did not enter customer/account/contact values or press Next/sign/submit.

| Group | Observed controls | Required evidence / branches |
|---|---|---|
| Utility match | First 10 digits of account number; customer name (placeholder Smith, John); address line 1; address line 2; city; static California; ZIP | Account, name, address 1, city and ZIP marked required. Address 2 not reported marked. Exact account validation untested. |
| Communication | Language; Mail to billing address / Email / Phone / Text; Email and Confirm Email; main phone with Home/Work/Mobile; optional alternate phone with type; optional main/alternate mobile fields | Email consent wording shown. No mandatory status inferred where root did not report a marker; required-by-preference changes untested. |
| Language | Cantonese, English, Hmong, Korean, Mandarin, Russian, Spanish, Tagalog, Vietnamese | Nine options; same set as current paper. |
| Resident counts | Adults 1–20, default 1; children 0–20, default 0 | Both marked required. Paper distinguishes children under 18; count current all-resident household. |
| Qualification | Income / Public Assistance | Required selection. Income reveals required annual household income; Public Assistance reveals eleven assistance choices and income loses required marker. Fixed-income checkbox observed disabled in these default branch states; activation not verified. |
| Referral | Community Outreach Contractor Yes/No | Yes reveals COC number; requiredness unverified. Do not invent a contractor identifier. |

The form cannot be advanced legitimately in this research without real utility account details. Thus later review, electronic signature, submission and online confirmation content are **paper/public references only**, not live observations. A PG&E service account number is distinct from a website login and from a BenefitsCal case/application number. Initial application does not require creating a web account in the observed route. Online PEV later does require signing into My Account per public instructions.

## Complete residential paper form inventory

Current PDF p. 2 has three sections; individual fields mostly lack required/optional marks. Its instruction to complete Section 1 does not prove that every email or alternative phone is mandatory. The JSON records `not_marked` accordingly.

1. **You and your household:** PG&E account number; bill account-holder name; primary-residence street address (no PO Box); unit; city/state/ZIP; email with informational-email authorization; preferred and alternative phone numbers, each with Home/Work/Mobile checkboxes; one preferred communication choice Mail/Email/Phone/Text (message/data rates may apply); one language choice from the nine above; adults, children under 18, and total people at that address.
2. **Household qualification:** complete **2A OR 2B**, only one needed. 2A check all programs in which applicant or a household member actually participates: LIHEAP, WIC, CalFresh/SNAP, CalWORKs/TANF or Tribal TANF, Head Start Income Eligible (Tribal only), SSI, Medi-Cal for Families (Healthy Families A&B), NSLP, Bureau of Indian Affairs General Assistance, Medicaid/Medi-Cal under 65, Medicaid/Medi-Cal age 65 and over. 2B asks total gross annual income for every household member, plus a fixed-income checkbox covering pension, Social Security, SSP/SSDI, retirement-account interest/dividends, Medi-Cal 65+ or SSI. The fixed-income checkbox is not a replacement for reporting income.
3. **Declaration:** customer signature and date; mark guardian/power-of-attorney circle when applicable. Signer certifies truth, reviews program conditions, states not claimed as another person's dependent other than spouse and not knowingly sharing a meter with another home; agrees to report ineligibility, possible verification/ESA participation, possible removal for excessive CARE usage, possible program changes, authorized information sharing and repayment if false information. These are declaration terms, not nine separately marked online questions. Fresh review/signature required; do not reuse a BenefitsCal signature or assume its authorized representative equals a PG&E guardian/POA.

The paper form has no SSN, immigration-document number, DOB, employment provider password, bank login, or household member-by-member name roster for **initial residential enrollment**. Such facts may exist in BenefitsCal but should not be collected for this form merely because available.

## Sub-metered branch

If landlord bills gas/electricity directly, use the separate sub-metered form. PG&E's CARE page explicitly says sub-metered tenants cannot use its online CARE application. Landlord/facility manager fills Section 1A: applicant status (add new/drop/renew/move to different space), park/facility name and address, landlord/manager name and mailing address, email, preferred phone/type, and PG&E electricity/gas account numbers. Tenant completes 1B: name as on landlord energy bill (bill must be in tenant's name), primary address and mailing address, unit/city/state/ZIP, email, preferred/alternate phone/type, language, communication preference and adults/children/total. Complete qualification route and signature/date; signing permits landlord/manager to see eligibility determination to pass the discount along. No landlord contacted during research.

Nonprofit/group facilities, agricultural housing and migrant farmworker housing have additional separate CARE applications linked by the CARE page. Those organizational flows are outside this residential schema; do not route their applicants to this residential form.

## Documents and conditional post-enrollment verification

Current enrollment pages and PEV overview explicitly say **no eligibility proof is needed at initial application**. A utility bill/account number helps match the account, but the public paper form does not ask for a bill attachment. PG&E may later request PEV by a specified deadline. The FERA FAQ also states that proof is required when reapplying within 24 months after denial; follow the denial/request instructions rather than applying the ordinary no-proof rule to every reapplication.

PEV p. 1 fields: customer name, account number, address/city/ZIP, email/phone; all household members with proof category (public assistance/income/zero income), adults and children counts; opt-out/no-longer-qualifies checkbox; declaration signature and date. More members use a separate sheet. Use matching CARE or FERA form. The PEV page instructs that program-based proof may be supplied for participating member while listing everyone.

PEV p. 2 documents these alternatives (copies accepted; more may be requested):

| Income/support | Examples of acceptable proof |
|---|---|
| Qualifying assistance | Award/participation letter dated within 12 months |
| Wages/tips/commissions | Two most recent consecutive pay stubs, W-2 or IRS 1040 first page; Schedule 1 if Line 8 income |
| Social Security/SSDI/pension/disability/workers compensation/unemployment | Award letter, two recent check stubs, or latest direct-deposit bank statement with printed name |
| Self-employment | 1040 first page + Schedule 1 + all Schedule C forms, or current three-month profit/loss statement |
| Rental/royalty | 1040 first page + Schedule 1, rental agreement or trust statement |
| Interest/dividends | 1040 first page or 1099s |
| Settlement | Settlement documents |
| Child/spousal support | Court documents or two recent pay stubs |
| Educational aid | Current school-year award letter |
| Untaxed cash work | Signed letter with type of work, estimated monthly cash amount, employer name/phone if applicable |
| No household income | Zero-income affidavit together with PEV |

1040-SR exception: provide first **and second** pages. Both PEV forms instruct concealing SSNs and bank account numbers on document copies. This is distinct from the PG&E **utility** account number needed on the form. No upload-size/extension maximum was established; public page describes JPEG photos and upload/drag-drop.

Zero-income affidavit has utility account number/name/address, account holder named in declaration, printed customer full name, signature/date. It certifies no ongoing income/support from specified sources for all members and promises reporting changes within the calendar year; signer certifies under California penalty of perjury. Do not precheck or sign this from a missing income value. High-usage PEV uses a separate form/process referenced by PG&E and is outside this standard PEV field inventory.

## Application, signature, submission and confirmation

Public residential PDF p. 1 supports online, phone (1-866-743-2273), email scanned/photo completed form to CAREandFERA@pge.com, fax 1-877-302-7563, or mail. Current web enrollment instructions say complete and sign first; email subject CARE application or FERA application, attach the form. Sub-metered subject: Sub-metered tenant application. These are instructions for an applicant, **not authorization for agent email/fax/submission**.

Mailing discrepancy: current website gives CARE/FERA Program, PO Box 29647, Oakland CA **94604-9647**; current enrollment PDFs show **94604-7563**. Both use the same PO Box. This research preserves the conflict; verify address on the latest return instructions or contact PG&E before mailing. PEV forms and web use 94604-9647 consistently.

Residential paper p. 2 says if qualified, discount appears on the first page of next PG&E bill; save completed application and transmission evidence. It does not describe an immediate paper receipt or guarantee approval. Root has not observed online final confirmation.

PEV online route: locate request and due date → sign in/create pge.com account → dashboard alert or Payments/All payment tasks/Assistance programs/CARE-FERA/Income Verification Process → fields → review → upload proofs → final review/submit. Status is available via account alert. Offline PEV: completed signed dated matching form plus documents by mail/fax or email (subject CARE/FERA PEV). Deadline is the particular PG&E letter/email; no universal deadline inferred.

## Reusing BenefitsCal safely

Candidate reuse: applicant/contact/address/language, **current all-resident** roster/counts, income source records and recently confirmed enrollment/award letters. Reconfirm scope and freshness: BenefitsCal application submission is not CalFresh/Medi-Cal enrollment; PG&E income includes all residents and sources, not deductions or a SNAP purchasing household; account-holder name must match bill; annual income needs current recomputation. Add utility-specific account match, communication consent, contractor referral, meter/dependency certification and current declaration. Never reuse signatures, passwords, BenefitsCal case numbers as utility identifiers, or assumed landlord authorizations.

## Limits

This inventory covers the complete current blank residential form, extra sub-meter fields, standard PEV/zero-income forms, and initial live page. It does not establish later online controls, error messages, submission mechanics, proof for every denial/high-usage exception, organization applications, or a real applicant's eligibility. Public PDFs and linked pages can change without stable URLs; keep version and research date with each field. Individual mandatory status remains `not_marked`/`unknown` where no explicit evidence exists.
