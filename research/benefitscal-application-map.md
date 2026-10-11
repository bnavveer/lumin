# BenefitsCal application research

Research date: October 11, 2026. Purpose: identify the information a person may need to prepare and submit a BenefitsCal application, and document the application flow for this project.

This is an intake preparation map, not an eligibility determination. The combined application branches by selected program, county, people, and answers. A field appearing in a paper application does not establish that it is mandatory in the current website.

**Result:** inspected all nine live sections through the unsigned primary-applicant signature screen (`ABPAP`), recording 234 distinct routes and 407 screen observations. The test path selected CalFresh, CalWORKs and health coverage in Fresno County with a synthetic adult and child. The paper catalog adds 86 question/appendix records containing 490 input descriptors. Those counts describe research coverage, not the number of questions a single applicant must answer.

**Test state:** no application was signed or submitted, and no documents were uploaded. The draft contains synthetic, incomplete and deliberately inconsistent branch-exploration answers. It is **not filing-ready** and must never be submitted as a real claim. No sign-in password or verification code is saved in these deliverables.

## Deliverables and evidence

| File | Use | Evidence boundary |
|---|---|---|
| [Live walkthrough](benefitscal-live-walkthrough.md) | Observed screen order, labels, choices, validation, and test state | Only the screens and branches actually visited |
| [Public guide inventory](benefitscal-public-form-inventory.md) | Official BenefitsCal guide, uploads, review, signature, receipt, and workflow | Guide version dates matter; not all middle sections are illustrated |
| [Paper cross-check](benefitscal-paper-crosscheck.md) | Broader question inventory for the combined application | SAWS 2 PLUS reference; not an exact current web form |
| [Complete paper form PDF](benefitscal-SAWS2_PLUS-reference.pdf) | Original 29-page SAWS 2 PLUS source, including instructions and appendices | Printed 4/15 version; use as a reference, not proof of current eligibility rules |
| [Intake field catalog](benefitscal-intake-fields.json) | Structured preparation fields with source references | Research catalog, not a BenefitsCal API contract |

## Nine sections confirmed in the live website

1. Your Information
2. People
3. Household Details
4. Income
5. Expenses
6. Assets
7. Other Situations
8. Document Upload
9. Review and Submit

At the beginning of inspection the existing signed-in application was at `https://benefitscal.com/ApplyForBenefits/ABNMI`. The name screen required first and last name; it also offered middle name, suffix, and other names. Required status of later fields must be taken from the live walkthrough, not inferred from this overview.

## What to prepare

This table is a collection checklist across possible branches. Ask for the applicable information; do not make every row a prerequisite to starting an application. Exact questions and sources are in the detailed inventories.

| Category | Information to have ready when applicable |
|---|---|
| Application context | County; desired food, cash, and/or health programs; who is applying; any existing case/application reference |
| Applicant and contact | Legal and other names, date of birth, home and mailing situation, contact email/phone, preferred languages, assistance or accessibility needs |
| Household people | Each person's name, birth date, relationship, whether applying for each program, marital situation, who lives together, and who purchases/prepares food together |
| Identification | SSN and citizenship/immigration information where the program requests it for an applicant; use the form's no-SSN/not-applying options where appropriate |
| Health and family | Pregnancy and expected delivery information; disability, Medicare or other coverage; absent parent/caretaker details; health expenses and unpaid bills where asked |
| Work and money coming in | Employer/self-employment details, gross pay, dates/frequency, hours, business expenses, changes in employment, benefits and other income, and expected changes |
| Expenses | Rent/mortgage, utilities, child/dependent care, child support paid, health costs, and other deductions requested for the selected program |
| Property and resources | Cash, accounts, vehicles, real estate, other property, ownership/value/debt and transfers where asked for the selected program and household situation |
| Tax and health coverage | Tax filing plans, spouse/dependents, expected income, current insurance and offered employer coverage when applying for health coverage |
| Other circumstances | Student status, foster-care history, military/tribal information, benefit history and other program-specific questions shown by the application |
| Assistance and authorization | Helper/interpreter information and any authorized representative designation, including scope of authority |
| Evidence and filing | Available supporting records, applicant review/certifications/signatures, application copy and confirmation receipt |

For Medi-Cal, DHCS lists identity, income and address information among application preparation items and says to contact the county if documents are unavailable. Its guidance distinguishes information from proof: California residency generally requires certification and an address, not documentary proof of residence. [DHCS application help](https://www.dhcs.ca.gov/medi-cal/help/)

For CalFresh, the state initial application explains that a person can file with name, address and signature. A comprehensive intake checklist should not prevent someone from filing promptly because some evidence is still missing. [SAWS 1, rights and responsibilities](https://www.cdss.ca.gov/cdssweb/entres/forms/English/SAWS_1.pdf)

## Evidence to organize

Prepare records that support the answers actually given: identification, recent pay/income records, self-employment records, benefit award statements, housing and utility expenses, dependent care or support expenses, insurance details, and property records where requested. Do not assume every applicant must upload all of these. The Document Upload page and county follow-up determine what applies.

For each possible upload, track the household person, document category, covered dates, filename, whether it has been uploaded, and receipt. Keep a distinction between a missing document, an unavailable document, and a document that does not apply. The [official BenefitsCal resources](https://www.calsaws.org/benefitscal/) include separate guides for uploads during and after an application.

## Filing workflow

1. Choose the county and programs and identify the applicant.
2. Complete the applicable people, household, income, expense, asset and other-situation questions.
3. Review every section and correct inaccurate or test information.
4. Add available requested documents, or follow the website's option to supply them later where offered.
5. The applicant or properly authorized representative reviews the declarations, rights and responsibilities, and completes the required signature step.
6. Submit the application, then retain the confirmation/application number and a copy. A saved draft is not a filed application; a filing receipt is not an approval of benefits.
7. Follow county instructions for interviews, missing evidence and notices. CalFresh's official responsibilities include truthful answers and evidence of eligibility. [CDSS rights and responsibilities](https://www.cdss.ca.gov/inforesources/calfresh/rights-and-responsibilities)

The precise controls and observed stopping point are documented in the live walkthrough. This research task does not authorize filing synthetic test answers as a benefits claim.

## Implementation implications

- Model people, income sources, expenses, properties, insurance policies and documents as repeatable records with stable local identifiers.
- Record per-program applicant status separately from merely living in the household.
- Preserve `unknown`, `not applicable`, `declined where allowed`, and `not answered` separately from `no` or zero.
- Capture amount, frequency and effective dates together; do not silently treat weekly pay as monthly income.
- Store field provenance and verification level so a paper-reference field cannot silently become a mandatory website field.
- Keep the user's review and signature explicit. Test records must be clearly distinguishable from filing-ready applicant answers.
- Never store sign-in passwords or verification codes in research notes or the field catalog.

## Coverage status

The live path reached all nine sections and stopped before agreeing to the legal declarations or entering a signature. On `ABPAP`, the observed signature controls are individual type (Applicant, Caretaker Relative, Adult Household Member, Authorized Representative or Guardian), first name, last name, system date, acknowledgment of rights/Medi-Cal agreements, and the electronic-signature checkbox. Additional signatures, final submission and the receipt are documented from official references, not tested live.

The current upload screen expressly permits submission before documents are uploaded. It also mentions an optional Citizenship/Immigration/Birth Certificate category, which differs from the older removal report cited in the public inventory. Preserve this version distinction. The upload editor says files must be less than 8 MB and must not be encrypted or password protected.

The “Review my application” link opened a generated PDF preview, but browser security blocked access to its `blob:` URL. Its contents were not inspected or exported; no workaround was attempted.

See the live walkthrough for individual untested conditionals. GA/GR, alternative counties, all representative/co-signer scenarios, every income subtype and every nested Yes/Other path have not been exhaustively exercised. The public reference and paper inventories expand preparation coverage, but do not prove every live conditional branch has been exercised. Paper-only fields remain explicitly labeled `paper_reference_not_live` in the JSON.
