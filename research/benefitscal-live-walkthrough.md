# BenefitsCal live walkthrough

Research date: October 11, 2026. Evidence: live BenefitsCal UI, signed-in test account, inspected with CUA. Initial name/address inspection was performed by the delegated researcher; continuation through all nine sections to the unsigned signature screen was observed by the primary researcher using the owning browser session. This documents the tested baseline and major exploratory branches, not every county/program combination or every conditional detail. A route is a screen identifier, not a public API contract.

## Test assumptions and boundaries

- Existing signed-in account displayed a test account label. No login or credentials were entered in this walkthrough.
- Empty name fields were advanced using the synthetic name **Test Applicant**. Middle name, suffix, and other names were left empty.
- Synthetic adult birth date **01/01/1990**, child **TestChild Applicant**, child birth date **01/01/2015**, and authorized test email **test@navveer.com** were used. All phone fields remained blank. No SSN values, real identity/contact data, documents, password, or verification code were entered.
- The explored address path used homelessness **Yes**, **Fresno** county, ZIP **93721**, and **No** mailing address. These are test assumptions, not an actual applicant's circumstances.
- Food, Cash Aid (CalWORKs, TCVAP, RCA), and Medi-Cal were selected. The adult college-student answer was Yes. An immigration branch was inspected with adult citizen/national No; the child citizen/national answer was Yes. Other test answers and blank-field behavior are recorded below.
- No signature, certification, agreement acceptance, application submission, or messages were performed. No application number was observed. Saving/persistence beyond successful page advancement has not been independently checked.

## Navigation and progress

The left rail showed nine sections: Your Information; People; Household Details; Income; Expenses; Assets; Other Situations; Document Upload; Review and Submit. Initial screens displayed Step 1 of 9. Your Information was initially labeled Reviewed in the rail while later sections were Not Available; this did not mean the whole first section had been completed. Completing sections led to the `ABNAV` summary; after Household Details, Income, Expenses, Assets and Other Situations were available. All nine sections were eventually reached, stopping at the unsigned signature form.

Each visited screen offered Back to Previous Page and Next. Header included Home, Messages, Help, language selection, notifications, account dropdown, and Search. These ancillary controls were not exercised.

## Verified screens

### 1. Name Information — `https://benefitscal.com/ApplyForBenefits/ABNMI`

Prompt: “What's your name?” Supporting text: “(Nice to meet you!)”. Help accordion: “Who should fill out this application?” (not expanded).

| Field | Observed control | Required evidence / notes |
|---|---|---|
| First Name | Text input | Required; blank validation: “Please make sure to enter a First Name.” |
| Middle Name | Text input | No required marker observed |
| Last Name | Text input | Required; blank validation: “Please make sure to enter a Last Name.” |
| Suffix | Dropdown, initially `-Select One-` | No required marker observed; dropdown options not opened |
| Other Names | Text input | No required marker observed; helper “Maiden, Nicknames, etc.” |

The inherited page state already displayed first/last blank-validation errors. Entering Test / Applicant and pressing Next advanced to Home Address. This validates that the other name inputs can remain empty on this path.

### 2. Home Address — `https://benefitscal.com/ApplyForBenefits/ABNHA`

Prompts: “Tell us more about where you currently live.” and “Are you experiencing homelessness?” Choices Yes and No. Help accordion: “What is homelessness?” (not expanded). Initially neither radio was selected and a normal address block was visible. State dropdown was eventually shown as California and disabled; an earlier loading screenshot showed a placeholder, so the completed UI state is authoritative.

Normal address block:

| Field | Observed control | Required evidence / notes |
|---|---|---|
| Address Line 1 | Text input | Blank validation observed: “Please make sure to enter an Address Line 1.” |
| Address Line 2 | Text input | Helper: “This could be an apartment, unit or dorm room number.” No required marker observed |
| City | Text input | Required marker visible in screenshot |
| State | Dropdown | California, disabled in completed AX state |
| Zip Code | Text input | Required marker visible in screenshot |

Selecting homelessness Yes and pressing Next replaced the normal-address block with this branch on the same URL. No navigation to another page occurred.

Homelessness Yes branch:

| Field / question | Observed control | Required evidence / notes |
|---|---|---|
| What county are you currently in? | Dropdown, `-Select One-` | Required marker and blank validation: “Please make sure to enter a What county are you currently in.” Options not successfully opened |
| What's the zip code where you are currently staying? | Text input | Required marker and blank validation: “Please make sure to enter a What's the zip code where you are currently staying.” |
| Is there an address where we can send you mail? | Yes / No radios | Neither selected; its downstream branch not exercised |

Supporting heading: “This is to make sure we send your application to the right office.” The missing county and ZIP initially blocked advancement. Primary continuation selected Fresno, supplied 93721, selected No mailing address, and advanced. The complete county list and mailing-address Yes branch were not captured.

## Primary continuation: Your Information

All route suffixes below are under `https://benefitscal.com/ApplyForBenefits/`. Rows record live observations supplied by the primary researcher. Required means a visible requirement or observed validation; optional means explicit wording or successful blank progression. A Yes/No question alone does not establish required status.

| Route | Fields, choices, and conditional behavior | Tested path / validation |
|---|---|---|
| `ABCON` | Home Phone, Mobile Phone, Work/Alternate Phone, Email | Email test@navveer.com; all phones blank allowed Next. Email required status not tested with blank |
| `ABCOP` | Optional email-alert and text-alert checkboxes; mobile consent includes legal terms and conditions | Consent and alert boxes left unchecked; no terms accepted |
| `ABPRI` | Program selection: Food; Cash Aid (CalWORKs, TCVAP, RCA); Medi-Cal; General Assistance/General Relief. Applying for yourself? Yes/No | At least one program required; applying-for-self answer required. Food + Cash Aid + Medi-Cal chosen |
| `ABDIS` | Disability/need help? Yes/No; deaf or hard of hearing? Yes/No | Yes branch displayed instruction to contact county for help; no added field observed |
| `ABCOS` | College student? Yes/No | Yes selected |
| `ABCFA` | CalFresh authorized representative? Yes/No | No selected; designation branch untested |
| `ABCFS` | Someone to get/spend CalFresh benefits? Yes/No | No selected; designation branch untested |
| `ABHAR` | Health coverage representative? Yes/No | No selected; designation branch untested |
| `ABHCA` | Previously applied through Covered California? Yes/No | Yes exposed an optional case-number field; final test answer No |
| `ABRDT` | Date of birth, MM/DD/YYYY | Required; adult 01/01/1990 |
| `ABSSN` | SSN choice: Yes; No; I don't have it right now | No SSN entered. Note says optional for people not applying; do not generalize this exception to applicants |
| `ABNSN` | Reason: ATIN/ITIN; Religious Exemption; Does not qualify or only valid for a non-work reason; Applied for SSN; Other | Other reveals explanation, maximum 255 characters. Adult explanation: “Synthetic test draft for form research. No real applicant or SSN. Do not submit.” Child reason later left blank and Next succeeded |
| `ABMRS` | Marital status: Common Law; Divorced; Married; Never Married; Registered Domestic Partner; Separated; Single; Widowed | Offers skip path for a person under 18 who has never married; full marriage branches untested |
| `ABCID` | Citizenship/immigration introduction | Informational transition |
| `ABDOC` | US citizen/national? Yes/No | Note says nonapplicants can skip. Adult No opened immigration path; child Yes opened citizenship follow-up |
| `ABISS` | US entry date if known; immigration-document-type dropdown; document number; continuously in US since 1996? Yes/No | Adult No citizen path. All fields/answers blank allowed Next. Dropdown has a long list, not transcribed in this continuation |
| `ABDSM` | 40 quarters of US work? Yes/No; T/U visa, continued presence, VAWA or derivative relief? Yes/No; status changed in past 12 months? Yes/No | Seen on adult immigration path; downstream Yes branches not fully exercised |
| `ABDSC` | Sponsored noncitizen? Yes/No | Sponsor-details branch untested |
| `ABBID` | Background-information introduction | Informational transition |
| `ABASX` | Gender: Female; Male; Prefer not to answer | Prefer not to answer selected |
| `ABGNR` | Gender identity: Another; Female; transgender female-to-male; Male; transgender male-to-female; Non-binary; Prefer not to answer | Optional skip; Prefer not to answer selected |
| `ABSXO` | Sexual orientation: Straight; Gay/Lesbian; Bisexual; Queer; Another; Unknown; Prefer not to answer | Optional; Prefer not to answer selected |
| `ABHSP` | Hispanic/Latino/Spanish? Yes; No; Prefer not to answer | Optional; Prefer not to answer selected |
| `ABRAE` | Race dropdown: American Indian/Alaskan Native; Asian; Black/African American; Native Hawaiian/Pacific Islander; Other/Mixed; White; Prefer not to answer | Optional; Prefer not to answer selected |
| `ABYSD` | Your Information completion | Next led to `ABNAV` section summary |
| `ABNAV` | Section summary | People became available; started People |

## Primary continuation: People

The People path added one synthetic 11-year-old child, TestChild Applicant, born 01/01/2015. Repeat-person forms reused the same route suffixes; route alone is therefore insufficient to identify a household record.

| Route | Fields, choices, and conditional behavior | Tested path / validation |
|---|---|---|
| `ABHSD` | Other people? Yes/No | Yes opened add-person flow |
| `ABNMI` | Repeat name inputs: First Name, Middle Name, Last Name, Suffix, Other Names | First and last required; TestChild / Applicant entered |
| `ABHHR` | Relationship dropdown: Aunt/Uncle; Child; Common Law Partner; Cousin; Registered Domestic Partner; Fictive Kin; Grandchild; Grandparent; Niece/Nephew; Other Relative; Biological/Adoptive Parent; Stepparent; Sibling; Stepchild; Spouse; Stepsibling; Unrelated | Child selected. Labels here summarize observed options; no relationship-specific branches beyond Child tested |
| `ABPSM` | Per-person program selection, prechecked from the selected application programs; Not Applying option | Food + Cash Aid + Medi-Cal remained selected for child; Not Applying path untested |
| `ABBPF` | Buy and prepare food together? Yes/No | Yes selected |
| `ABLNA` | Live with you? Yes; No, permanently out; No, temporarily out | Yes selected; out-of-home branches untested |
| `ABCON` | Repeated contact screen | No real child contact data entered; primary observation did not transcribe separate repeated-field requirements |
| `ABRDT` | Repeated date-of-birth input | Required; child 01/01/2015 |
| `ABSSN` | Repeated SSN choices | No SSN values entered |
| `ABNSN` | Repeated no-SSN reason | Reason left blank; Next succeeded |
| `ABMRS` | Repeated marital screen; under-18/never-married skip path | Child skip behavior available |
| `ABCID` / `ABDOC` | Repeated citizenship introduction and citizen/national question | Child citizen/national Yes |
| `ABNDC` | Naturalized or derived citizen? Yes/No | No selected; Yes-details branch untested |
| `ABBID`, `ABASX`, `ABGNR`, `ABSXO`, `ABHSP`, `ABRAE` | Repeated background introduction and demographics listed above | Prefer not to answer selected for demographics |
| `ABBPL` | Child birth place: City, State, Country; Country defaults United States | City/state blank allowed Next |
| `ABVAC` | Vaccines? Yes/No; explicitly only for CalWORKs children under 6 | Skipped for test child age 11; this screen's fields were not exercised for an under-6 child |
| `ABPSN` | Parent situations, select all: not in home; unemployed; disabled; deceased; None | Not in home selected |
| `ABPSA` | Absent parent's First Name and Last Name; ADD A PARENT control | Blank parent names allowed Next. Adding further absent parents untested |
| `ABPLS` | Household roster: edit, remove, add another person | Roster reached; destructive/removal actions not performed |
| `ABTCD` | People completion | Led to `ABNAV` summary; Household Details enabled |

## Primary continuation: Household Details

Source: primary researcher's live CUA observations. The selections in this section were exploratory and deliberately exposed many mutually inconsistent branches. They are **not filing-ready applicant facts**. All 14 situation choices below were selected for research. Adult Test Applicant was selected on person selectors except teen-parent, current-foster-child, and child-care selectors, where TestChild Applicant was selected. Detail-screen blank progression is evidence of website navigation behavior, not a claim that the omitted information is unnecessary for eligibility or case processing.

### Tax household

| Route | Fields, choices, and conditional behavior | Tested path / validation |
|---|---|---|
| `ABTRN` | Federal tax return next year? Yes/No | Required; Yes selected |
| `ABTXN` | Who files taxes? Household-person selector | Required; Test Applicant selected |
| `ABTXF` | Filing jointly with spouse? Yes/No | No selected; joint-spouse branch untested |
| `ABTDP` | Claim dependents? Yes/No | Yes reveals household checkboxes and Someone else; TestChild selected. Someone else details untested |
| `ABTRS` | Relationship for each dependent | Child prefilled for TestChild |
| `ABTAE` | Consent to use future income-tax data? Yes/No | No selected; consent not granted |
| `ABTXS` | Tax-filer summary | Repeatable tax-filer record summary |

### Household situation gateway and branches

`ABHGW` offered these select-all situation choices: college/trade school; pregnant; primary caretaker of child age 0–18; disability; prior public assistance; food outside home; facility/shelter/other; breastfeeding; military member or dependent; child needing care; past foster care; teen parent; current foster child; leaving California; and None. All 14 substantive choices were selected to expose their screens; None was not the exploratory selection. The observation does not establish these as genuine test-account circumstances.

| Route(s) | Fields, choices, and conditional behavior | Tested path / validation |
|---|---|---|
| `ABGPS` → `ABGAI` → `ABGAS` | Who received prior assistance? Then received assistance in California? Yes/No. Yes reveals County selection; summary | Person selector required. County left blank and Next accepted. Assistance type/history details beyond observed fields not established |
| `ABCPS` | Primary caretaker: multiple household-person checkboxes | Adult selected; additional caretaker combinations untested |
| `ABPGN` → `ABPRG` → `ABPGY` | Pregnant person; due date; number of babies 1–12; presumptive eligibility card? Yes/No; summary | Person selector required. Yes follow-up for card and date validation untested |
| `ABDPS` → `ABDIA` | Disabled person; limits daily activities? Yes/No; medical facility/nursing home? Yes/No | Person selector required. Further Yes-dependent details untested |
| `ABDIB` | Needs personal assistance with activities of daily living or facility care? Yes/No | Detailed Yes branches untested |
| `ABDIC` | Expected disability duration: 30 days or more; 12 months or more | Observed choices; thresholds are UI wording, not a standalone eligibility rule |
| `ABDID` | Needs care so someone else can work or attend school? Yes/No; cares for another household member? Yes/No | Further person/care detail branches untested |
| `ABDIE` → `ABDSU` | Works and needs medical expenses to keep working? Yes/No; disability summary | Offers skip if not working. Expense details untested |
| `ABCLS` → `ABCLI` | College person; searchable school-name combo; enrollment Half-time or more / Less than half-time; units 1–50; working while in school? Yes/No | Person selector required; Half-time or more selected, other details blank |
| `ABCSE` → `ABCSU` | Student situations, multiple checkboxes: approved work-study; not enrolling next term; TANF-funded Cal Grant A/B; noncredit/adult education; employment training; summary | Blank situations accepted Next. Training examples included LPIE, WIOA, campus/research/teaching/on-the-job and CalFresh training. Each situation's downstream fields not tested |
| `ABFDS` → `ABFDI` → `ABFSY` | Person receiving food elsewhere; program combo: communal dining for elderly/disabled; Native American reservation food distribution; Meals on Wheels; other; summary | Person selector required. Program-specific/Other follow-up untested |
| `ABFPS` → `ABFIN` → `ABFSM` | Person in facility; facility name; expected release date; summary | Person selector required. Facility details/date validation untested |
| `ABBRE` → `ABBRI` → `ABBFS` | Breastfeeding person; gave birth in past 12 months? Yes/No; summary | Person selector required. Further Yes branches untested |
| `ABMPS` → `ABMIS` → `ABMSY` | Military person; status Active Duty / Veteran / Dependent; service From/To dates; summary | Person selector required. Status-specific/date details untested |
| `ABCCS` → `ABCCE` | Child cared for by a household member, multiple selection; explanation with 255-character limit | TestChild selected. Explanation left blank on exploratory path |
| `ABFCP` → `ABFOC` → `ABFOS` | Person formerly in foster care; From/To dates; State; summary | Person selector required. Age/state/date-specific branches untested |
| `ABTPS` → `ABTSS` → `ABTSU` | Teen-parent person; school status: diploma / GED / attending regularly / not attending (explain); summary | Required selector showed only TestChild (synthetic age 11). This is an observed option, not an interpretation that age 11 qualifies as a teen parent. Not-attending explanation branch untested |
| `ABFCH` → `ABFCI` → `ABFCM` | Current foster child; court dependency order? Yes/No; count child for CalFresh? Yes/No; summary | Person selector required; TestChild selected. Court/order Yes details untested |
| `ABLCP` → `ABLCI` → `ABLCT` → `ABLCS` | Person leaving California; reason with 255-character limit; leaving for more than 30 days? Yes/No; summary | Person selector required. Detailed reason and duration consequences untested |

Summary pages offered Edit, Remove, and Add Another for repeatable entries. Most detail screens accepted blank answers with Next on this exploratory path; the primary observation did not provide a field-by-field blank-validation transcript, so required status must not be inferred for every listed detail. Required person selections are explicitly identified above. Adding another, editing, and removing every branch record were not systematically exercised.

Household Details concluded with `ABRGS`, a summary of all 15 categories including tax, then `ABSDE` completion. Returning to `ABNAV` unlocked Income, Expenses, Assets, and Other Situations.

## Primary continuation: Income

Source: primary researcher's live CUA observations. Employment, self-employment, financial aid/work-study, in-kind housing, variable income, and employment-change paths were explored. Amounts and employer labels below are synthetic. No payroll or bank account was connected, and no Truv privacy/terms consent was accepted.

### Employment and self-employment

| Route | Fields, choices, and conditional behavior | Tested path / validation |
|---|---|---|
| `ABEIQ` | Anyone in household has a job? Yes/No. Includes employment, self-employment, gigs; excludes work-study, asked later | Yes selected |
| `ABEQT` | Whose job? Person selector | Required |
| `ABEQH` | Self-employment? Yes/No | No for first job; Yes for second job |
| `ABEIT` | Employment: Truv payroll Agree and Verify, with legal privacy/terms; ADD INCOME MANUALLY. Self-employment: Truv bank-connect alternative plus manual entry | Manual entry chosen for both. No connection or agreement accepted |
| `ABEIC` | Employer name; address; city; state; ZIP; phone; how often paid; gross amount; average hours/week; job continues? Yes/No | Synthetic employer `SYNTHETIC TEST`, Monthly, gross 100. Employer name maximum 20 characters confirmed by control attribute and a 28-character entry triggered Max length error. Other employer details blank |
| `ABEIC` frequency | Weekly; Biweekly; Semi-monthly; Monthly; Daily; Quarterly; Semi-annually; Annually; One-time; Hourly | Frequency and gross amount required; Monthly used |
| `ABJTS` | Jobs summary with Add, Edit, Remove | First job reached; second job added through repeated `ABEQT` / `ABEQH` |
| `ABSED` | Business name/type if any; start date if known; gross Monthly Income | Gross monthly income required; synthetic 100 entered, other business details blank |
| `ABSEM` | Cost method: Actual Cost; 40% Flat Rate; Monthly Average | Actual Cost reveals Amount; left blank and Next accepted. Other methods' detail behavior untested |
| `ABJTS` | Repeated job/self-employment summary | With gross 100 and blank actual expense, summary displayed expense 0 and net 0. This is the observed UI result, not an arithmetic rule or verified calculation |

### Money other than work

| Route | Fields, choices, and conditional behavior | Tested path / validation |
|---|---|---|
| `ABUIN` | Money not from work? Yes/No | Yes selected |
| `ABUIA` | Government-income categories listed below | Financial Aid and Work Study selected; other categories' detail screens not exercised |
| `ABUAA` | Whose income? | Required; repeated for Financial Aid and Work Study |
| `ABUAB` | Amount; frequency; income continues? Yes/No | Amount and frequency left blank; Next accepted on tested paths. Choices Weekly, Biweekly, Semi-monthly, Monthly, Daily, Quarterly, Semi-annually, Annually, One-time |
| `ABUAC` | Income summary with Add, Edit, Remove | Reached for tested categories |
| `ABUIB` | Other-income categories listed below | Category list observed; no category detail screen tested |

Government-income choices at `ABUIA`: Financial Aid; Work Study; Public Assistance; Social Security Disability; SSI/SSP; Social Security Retirement/Survivors; Unemployment Insurance; State Disability Insurance; Foster Care Payments; Veterans Income/Education; Government/Railroad Disability/Retirement; Tribal Payments; Cal-Learn Bonus/Penalty; Cash Diversion/noncash; None. These labels summarize the observed categories; only Financial Aid and Work Study were followed into their detail screens.

Other-income choices at `ABUIB`: Child/Spousal Support; Workers' Compensation; Gifts/Loans; Help Paying Rent/Food/Clothing; Rental/Royalties; Lottery/Gambling; Pension; Private Disability/Retirement; Insurance/Legal Settlements; Net Farming/Fishing; Dividend/Interest; Sales/Notes/Contracts/Trust Deeds/Promissory; Strike Benefits; Room/Board; Other; None. This is live category-list coverage, not verification of each category's required fields or conditional details.

### In-kind help, changing income, and employment changes

| Route(s) | Fields, choices, and conditional behavior | Tested path / validation |
|---|---|---|
| `ABINK` → `ABINA` | Receives rent/utilities/food/clothing free or in exchange for work? Yes/No; item multi-select: housing/rent, utilities, food, clothing | Yes; housing selected. Other item details untested |
| `ABINB` → `ABINC` → `ABIND` | Whose in-kind help? Free or for work dropdown: For Free / Exchange for Work; Item Value; Given By; summary | Person selector required. Value/source/arrangement detail validation not established |
| `ABMIN` → `ABMTO` | Income changes monthly? Yes/No; whose income? | Yes; person selector required |
| `ABMTR` → `ABMTS` | This year's Total Amount; next year's income changes? Yes/No; summary | Further next-year Yes branch untested |
| `ABCIA` | On strike? Yes/No | Left blank; Yes subbranch untested |
| `ABCIB` → `ABCBA` | Employment changed in last year? Yes/No; whose employment? | Yes; person selector required |
| `ABCBB` → `ABCBC` | Change in last 60 days? Yes/No; Change Date; Last Pay Date; reason (255-character limit); county help getting a job? Yes/No; summary | Detail-screen conditional branches and date/reason validation not fully exercised |
| `ABJIS` | Final income summary, grouped entries | Reached; primary researcher proceeding to Expenses |

As elsewhere, blank progression is recorded only for the specific tested screen/fields. It must not become a general assertion that income evidence or reporting is optional for eligibility.

## Primary continuation: Expenses

Source: primary researcher's live CUA observations. Six housing types and the major care, medical, insurance, court, and tax branches were exposed. Adult Test Applicant was used except the child-care recipient, TestChild Applicant. Most detail fields were left blank and allowed progression; this is not evidence that reporting actual expenses is optional for eligibility. Summaries commonly offered Edit, Remove, and Add Another.

Frequency shorthand below refers to the choices observed on each control: **8** = Weekly, Biweekly, Semi-monthly, Monthly, Quarterly, Semi-annually, Annually, One-time; **9** adds Daily; **10** adds Daily and Hourly. Frequency requirements were not universally tested.

### Housing and dependent care

| Route(s) | Fields, choices, and conditional behavior | Tested path / validation |
|---|---|---|
| `ABHEG` | Six checkboxes: Rent/Mortgage; separately paid Property Taxes/Insurance; separately paid Gas/Electric/Other Heating/Cooling; Telephone/Mobile; Water/Sewage/Garbage; Homeless Shelter; plus None | All six substantive types tested |
| `ABMHE` → `ABAPH` → `ABHEX` | Person paying expense; Amount; frequency 8; anyone outside household helps? Yes/No; repeatable summary | Person required, single adult or child. Blank costs accepted and review showed $0 |
| `ABAPH` rent branch | Outside help Yes reveals contributor First/Last Name, additional Amount, frequency 8 | Revealed, then reset to No. Contributor detail validation untested |
| `ABAPH` gas branch | LIHEAP received/expected? Yes/No | Observed additional question; detailed Yes consequences untested |
| `ABCST` → `ABCMS` → `ABPCA` | Dependent care for work, school, or job search? Yes/No; person receiving care; cost, frequency 10; provider Name, Address, City, State, ZIP | Yes; child recipient selected; provider/detail validation untested |
| `ABPCB` → `ABCSY` | Outside help paying dependent care? Yes/No; summary | Left blank; Yes branch untested |

### Medical costs and needs

| Route(s) | Fields, choices, and conditional behavior | Tested path / validation |
|---|---|---|
| `ABMED` → `ABMEX` | Medical-cost introduction; four medical-condition categories plus None | All four substantive categories selected; exact branches below |
| `ABHSS` → `ABHSA` → `ABHSR` | Person with IHSS expense; monthly IHSS cost; summary | Person required. Blank cost did not produce an expense card |
| `ABDSS` → `ABDSD` → `ABDSR` | Person age 60+ or disabled; expense type dropdown (13 types below); amount, frequency 9; reimbursed? Yes/No; summary | Person required. Reimbursement Yes details untested; every type not individually tested |
| `ABBPS` → `ABBPI` → `ABBSR` | Multiple people with retroactive bills; period radios 1 / 2 / 3 months; summary | Three months selected. Visible heading says last 1 or 2 months while accessible group says last 3 months; discrepancy retained without interpretation |
| `ABSNS` → `ABNSA` → `ABSNR` | Person with special needs; checkboxes doctor-prescribed diet, special telephone equipment, housework, high utilities, special laundry, Other; summary | Person required; no detail category selected, so category-specific fields untested |

The 13 `ABDSD` expense types observed were medical/dental; hospital/outpatient/nursing; prescriptions; health/hospital insurance premiums; Medicare premiums; dentures/hearing aids/prosthetics; attendant; attendant meals; prescribed over-the-counter items; transportation/lodging; glasses/contacts; medical supplies/equipment; service animal. The list is verified, but details for each type are not.

### Health coverage and employer offers

`ABMES` offered four health-coverage situations plus None: currently enrolled; offered through a job; ended in the past 90 days or expected to end; workers' compensation claim/lawsuit/settlement. All four substantive situations were selected.

| Route(s) | Fields, choices, and conditional behavior | Tested path / validation |
|---|---|---|
| `ABCES` → `ABCEA` → `ABCER` | Person covered; coverage dropdown Medicaid/Medi-Cal, CHIP, Medicare, TRICARE, VA, Peace Corps, Employer Insurance, Other; summary | Person required; Employer Insurance followed |
| `ABCEA` Employer Insurance | Provider; policy number; COBRA? Yes/No; retiree plan? Yes/No; state employee? Yes/No; expected to end? Yes/No | Expected-end Yes showed no inline field in observed state. Other coverage-specific branches untested |
| `ABJHS` → `ABEIN` | Person offered job coverage; employer Name, Address, City, State (California default), ZIP, Phone, EIN; contact First/Last Name, Phone, Email; eligible currently or in next three months? Yes/No | Person required; eligibility Yes selected |
| `ABEHC` | Enrollment Date; other eligible household-person checkboxes; minimum value standard? Yes/No; state employee? Yes/No | Detailed Yes branches/date validation untested |
| `ABEWP` | Work wellness? Yes/No | Yes selected, but conditional inline fields not captured; this is a coverage gap |
| `ABECC` → `ABECS` | Expected plan changes, multiple choices: no offer; starts meeting minimum value standard; change to lowest-premium minimum-value-standard plan; no changes; summary | Blank Next did not advance. Selected starts meeting minimum value standard to advance. Remaining branches untested |
| `ABNDS` → `ABNDA` → `ABLHI` | Person whose coverage ended; Provider; End Date; reason (255 characters); summary | Detail validation and all expected-end variants untested |
| `ABWSC` → `ABCOD` | Workers' compensation people, multiple selection; court-cost introduction | No further claim-details screen observed on this path |

### Support, tax deductions, and special needs payment

| Route(s) | Fields, choices, and conditional behavior | Tested path / validation |
|---|---|---|
| `ABCOC` → `ABCSS` → `ABCHI` → `ABCSR` | Child support? Yes/No; payer; children's names; amount; frequency 9; summary | Yes; payer required; amount/detail validation untested |
| `ABSSQ` → `ABSSS` → `ABSSA` → `ABSSR` | Spousal support/alimony? Yes/No; payer; amount; frequency 9; summary | Yes; payer required |
| `ABTDD` → `ABTDA` → `ABASS` → `ABAAS` → `ABARS` | Tax-deduction introduction; deductible alimony? Yes/No; person; frequency 9; summary | Yes; person required. No amount input visible on tested screen |
| `ABTDS` → `ABSPS` → `ABSLA` → `ABSLR` | Student-loan interest? Yes/No; person; frequency 9; summary | Yes; person required. No amount input visible on tested screen |
| `ABTDO` → `ABODS` → `ABODA` → `ABODR` | Other tax deduction? Yes/No; person; frequency 9; description (255 characters); summary | Yes; person required. No amount visible even after Monthly selected |
| `ABSNP` | Special-needs payment for housing/items lost through fire, earthquake, or flood? Yes/No | Yes reveals explanation (255 characters); explanation validation untested |
| `ABESU` | Expenses review: housing, care, medical, insurance, court, tax, total | Section review reached |

The missing amount controls on three tax-deduction paths are observations of the tested UI state, not a conclusion that amounts can never be requested. These and the retroactive-bill label disagreement should be checked against subsequent states before implementing equivalent behavior.

Expenses ended at `ABESC` completion, then `ABNAV` offered Start Assets.

## Primary continuation: Assets

Source: primary researcher's live CUA observations. Asset answers were synthetic branch probes, not financial disclosures or a filing-ready statement. All 15 financial categories, vehicle ownership/use, property, all nine personal/business categories, and a transfer branch were exposed. Detail fields generally remained blank; financial summary entries displayed $0. Blank progression does not establish eligibility rules or excuse actual asset reporting.

### Financial assets

`ABAGW` offered 15 categories plus None: Checking; Savings; Cash; Life/Burial Insurance; Stocks/Bonds; Money Market; Mutual/Trust Funds; Savings Bonds; Certificate of Deposit; IRA; Oil/Mining/Mineral Rights; Uncashed Checks; Safe Deposit Box; Mortgage Financed for Someone Else (not one's personal mortgage); Other (examples included 401(k), inheritance, intellectual property, gold). All 15 substantive categories were tested.

Each category followed `ABAPS` (required person selector, adult selected), `ABAIN` (dynamic detail fields), and `ABASM` (summary with Edit, Remove, Add Another).

| `ABAIN` category | Observed detail fields | Conditional coverage |
|---|---|---|
| Checking / Savings | Today's Balance; Bank/Credit Union; joint? Yes/No | Checking joint Yes exposed Who Joint With dropdown: household people or Someone Else. Someone Else revealed First/Last Name. Savings joint details not individually tested |
| Cash | Amount | No additional detail seen |
| Life/Burial Insurance | Value; Insurance Provider; shared policy? Yes/No | Shared-policy Yes branch not individually tested |
| Stocks/Bonds | Stock/Bond Value; Where Held; joint? Yes/No | Joint Yes branch not individually tested |
| Money Market / Mutual or Trust Funds / Certificate of Deposit | Value; Where Held; joint? Yes/No | Each category visited; joint Yes branches not individually tested |
| Savings Bonds | Value | No additional detail seen |
| IRA | Value; Where Held | No joint question observed |
| Oil/Mining/Mineral Rights / Safe Deposit Box | Value; Where Held; jointly owned? Yes/No | Each category visited; joint Yes branches not individually tested |
| Uncashed Checks | Value | No additional detail seen |
| Mortgage Financed for Someone Else | Value | No additional detail seen |
| Other | Asset Name; Value; Where Held; joint asset? Yes/No | Joint Yes branch not individually tested |

All tested financial detail screens accepted blank fields and produced $0 summary entries. This is observed draft behavior, not an asset valuation rule.

### Vehicles and property

| Route(s) | Fields, choices, and conditional behavior | Tested path / validation |
|---|---|---|
| `ABVDE` → `ABOVQ` → `ABOVP` | Vehicle introduction; owns a vehicle? Yes/No; owner | Yes; owner required |
| `ABOVI` | Plate; Year; Make; Model; leased? Yes/No; Estimated Value; Value Source; Amount Owed; Debt Source | Details blank. Value-source options: For Sale Ads, Car Dealer, Kelley Blue Book, Mechanic, Purchase Price, Other. Debt-source options: Last Bill, Lender Statement, Estimate, Other |
| `ABOVU` | Other household users, owner preselected; use checkboxes Home, Work, Disabled Transport, Fuel/Water, Other | Other selected; no inline field appeared in observed state |
| `ABOVG` → `ABOVS` | Gift/donation? Yes/No; owned-vehicle summary | Gift/donation left blank; Yes branch untested |
| `ABUVQ` → `ABUVP` → `ABUVI` | Uses a nonowned vehicle? Yes/No; person; Year, Make, Model | Yes; person required |
| `ABUVU` → `ABUVS` | Same five use categories; nonowned-vehicle summary | Use details beyond visible choices untested |
| `ABOPD` → `ABOPQ` → `ABOPP` | Property introduction; owns property? Yes/No; person | Yes; person required |
| `ABOPI` → `ABOPS` | Property Address; rented out? Yes/No; lives there? Yes/No; summary | Rented-out Yes revealed Rent Amount and frequency 9 (including Daily). Lives-there No revealed plan to live there someday? Yes/No. Further follow-up/validation untested |

### Personal/business items and asset transfers

| Route(s) | Fields, choices, and conditional behavior | Tested path / validation |
|---|---|---|
| `ABPPD` → `ABPPQ` | Personal/business-item introduction; business/personal item worth more than $500? Yes/No | Yes. Prompt also referenced jewelry worth $100 or more and jointly owned items; excludes wedding/engagement rings and heirlooms |
| `ABPPG` | Nine categories plus None, listed below | All nine substantive categories selected |
| `ABPPI` | Repeated category detail: Purchase Price or Current Value; Amount Owed; Listed for Sale? Yes/No | No person selector seen. Jewelry listed-for-sale Yes showed no additional inline field. Business Tools screen labels had not fully loaded before Next, so its detail fields are not independently verified; its summary card was observed |
| `ABPPR` | Nine-card personal/business review | All nine category cards observed |
| `ABSTD` → `ABSOT` | Transfer introduction; for Medi-Cal, sold/given/traded/transferred assets in last 30 months? Yes/No | Yes; this time window is observed Medi-Cal UI wording, not an inferred rule for other programs |
| `ABANF` → `ABSRY` | Item; Date; Value; Amount Received; transfer summary | No owner selector observed; detail fields blank |
| `ABASU` → `ABASE` → `ABNAV` | Overall review: financial assets/accounts; owned vehicles; used vehicles; property; personal/business items; sales/transfers; completion; section navigator | Assets completed |

The nine `ABPPG` categories were Jewelry/Art/Antiques/Musical Instruments; Sporting Goods/Guns; Personal Tools; Business Tools; Business Inventory; Business Equipment; Trailers/Nonmotor Boats; Camper Shells; Livestock. Eight category detail screens were captured with the common fields above; Business Tools remains a loading-state evidence gap. Summary existence must not be used as proof of that screen's field labels.

## Primary continuation: Other Situations

Source: primary researcher's live CUA observations.

| Route | Fields, choices, and conditional behavior | Tested path / validation |
|---|---|---|
| `ABOSS` | Optional referrals: Family Planning, Vaccine Services, WIC | All unchecked |
| `ABPFG` | Eight household Yes/No questions listed below | Duplicate-food-benefits Yes tested; other seven answers blank and Yes branches untested |
| `ABDFA` | Household people involved in duplicate food benefits, multiple selection | Required selection. None selected; used Back, then reset preceding answer to No |
| `ABSND` → `ABNAV` | Other Situations completion; section navigator | Reached |

The eight `ABPFG` subjects were convictions for duplicate food benefits after September 22, 1996; EBT trafficking of $500 or more after that date; parole/probation; trading food benefits for drugs after that date; trading food benefits for guns/ammunition/explosives after that date; cash aid stopped for welfare fraud; penalty/sanction for noncooperation; fleeing a felony. These summarize live questions, not legal eligibility conclusions. No convictions or sanctions were asserted as real facts.

## Primary continuation: Document Upload

| Route / control | Observed behavior | Tested path / boundary |
|---|---|---|
| `APDMC` | Per-person document suggestions, Add Other Document and Add Person | Adult suggestions listed below; child list remained collapsed |
| Identity upload → `https://benefitscal.com/Dashboard/DBDUP` | File editor: each file under 8 MB; cannot be encrypted/password-protected; multiple files per document type | No file uploaded |
| Identity document modal | Required searchable Document combo: Driver License/State ID; Other Identity Related; Passport; Social Security Card. Continue disabled until selection; Close | No subtype selected; modal closed |
| Additional document | Opened empty file editor | Returned without selecting/uploading files |
| `APDMC` Next | Modal recommends documents; control labeled Continue to submit | This navigated to `APDUD` completion, **did not submit the application** |
| `APDUD` → `ABNAV` | Upload-section completion; section navigator | Reached without documents |

Adult suggestions displayed Medical Disability, Identity, Student, Income/Employment, Assets/Resources, Vehicle Registration, Rent/Lease/Mortgage, Expenses, and Address Proof. This is the current adult's suggestion list, not the complete upload-category catalog. Child suggestions were not expanded.

Live wording explicitly allowed submitting without documents and uploading later. It said citizenship proof was not required to submit and the county may ask later; it also said users **can** add Citizenship/Immigration/Birth Certificate documents per person. This differs from an older 2025 report of category removal: preserve the observed current wording and do not infer either a complete current category list or a universal proof exemption.

## Primary continuation: Review and Submit — stopped unsigned

| Route | Fields, choices, and conditional behavior | Tested path / validation |
|---|---|---|
| `ABORS` | Quick summary: selected programs, names, phones, email, address; Update control | Summary viewed |
| `ABMIR` | Missing SSN/phone reminder | Existing blanks accepted; no SSN or phone added |
| `ABEXP` | Three expedited-service Yes/No questions, listed below | All blank; Next accepted. No expedited determination made |
| `ABICS` | Emergency needs, multiple selection: utilities off; food runs out within three days; clothing; rides; eviction notice; immediate medical need; child abuse; domestic abuse; elder abuse; pregnancy; other health/safety emergency; None | All unchecked; branches untested |
| `ABIPR` | Interview In Person / Phone; disability arrangements? Yes/No | Arrangements Yes showed no inline field in observed state; interview follow-up unverified |
| `ABVRE` | Voter registration: Yes; Already registered; No | All blank; Next accepted |
| `ABSID` | Signature introduction; spouse, parent, registered domestic partner, or authorized representative may need to sign | Informational screen viewed |
| `ABPAP` | PLEASE SIGN BELOW; review link, declarations, embedded rights/rules, signature controls | **Stopped here. No acknowledgment, signature, or Next performed** |

`ABEXP` asked whether gross monthly income was below $150 and combined cash/checking/savings were $100 or less; whether income plus liquid assets were less than rent/mortgage/utilities; and whether a migrant/seasonal household had assets under $100. These are observed screening questions, not researched eligibility conclusions. Blank navigation does not establish eligibility for expedited service.

### Unsigned signature boundary at `ABPAP`

The screen contained declarations covering truth, accuracy and completeness; rights, program rules and penalties; SSN/immigration information sharing; Medi-Cal third-party recovery; and perjury, plus lengthy embedded rights text. The observed final controls were:

| Control | Observed status |
|---|---|
| Acknowledgment of having read, understood and agreed to Rights and Medi-Cal text | Left unchecked |
| Individual Type dropdown: Applicant; Caretaker Relative; Adult Household Member; Authorized Representative; Guardian | Required; left unselected |
| First Name and Last Name | Required; left blank |
| Date | Disabled, displayed 10/11/2026 |
| Electronic signature is legally equivalent checkbox | Left unchecked |
| Next | Not activated |

Review My Application opened a browser `blob:` PDF tab. Browser security blocked tool access to the blob scheme; no bypass was attempted. The generated PDF could not be inspected or downloaded in this walkthrough, so its completeness and layout are unverified. Post-signature review/confirmation/submission screens and any receipt/application number remain unverified.

## Final test state and limitations

Live exploration ended at `https://benefitscal.com/ApplyForBenefits/ABPAP`, unsigned. All nine sections were reached, with major branches recorded above. Browser tab ID `1733884854`, Brave browser ID `1`; a separate generated blob-PDF tab was opened but could not be inspected. The draft retains synthetic adult/child and deliberately inconsistent branch-test answers, blank details, and synthetic income. It is **not filing-ready**. No signature, certification, legal acknowledgment, final submission, document upload, payroll/bank connection, application number, or submission receipt was produced in this walkthrough. The earlier ABNHA handoff state is superseded.

Initial direct CUA tab binding failed because the tab was already owned by another browser session. The delegated researcher stopped UI actions, and the primary researcher continued using the owning session. Transient loading AX snapshots lacked labels; only stable labeled state, visible screenshot evidence, and primary live observations are reported.

Coverage caveats: this verifies one combined Food/Cash Aid/Medi-Cal path with an adult and a child, plus the explicitly observed exploratory branches. It does not prove all county/program combinations, all required status, all dropdown options, all relationship/immigration/representative branches, all repeat-person cases, normal-home/mail-address progression, every detailed Yes-dependent household/expense/asset/other-situation screen, or details of untested nonwork-income categories. Business Tools detail labels, collapsed child upload suggestions, complete upload-category lists, blob-PDF contents, and post-signature screens remain unverified. The broader paper/public inventories complement this baseline and must not be represented as live verification. This is a whole baseline through the safe unsigned boundary, not exhaustive live branch coverage.
