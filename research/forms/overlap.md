# How much do the benefit forms overlap?

Built by `build-overlap.js` from 20 application forms. Y = asked, P = partly or only in some cases, N = not asked.

## Fields ranked by how many forms ask for them

| Field | Forms asking (Y) | Partly (P) | Share |
|---|---|---|---|
| full_name **(core)** | 19 | 1 | 98% |
| phone **(core)** | 19 | 0 | 95% |
| signature_consent **(core)** | 19 | 0 | 95% |
| dob **(core)** | 18 | 0 | 90% |
| home_address **(core)** | 17 | 2 | 90% |
| household_members **(core)** | 14 | 5 | 83% |
| other_income **(core)** | 15 | 2 | 80% |
| social_security_ssi **(core)** | 12 | 7 | 78% |
| current_benefits **(core)** | 13 | 5 | 78% |
| job_income **(core)** | 13 | 4 | 75% |
| mailing_address **(core)** | 11 | 5 | 68% |
| ssn **(core)** | 9 | 8 | 65% |
| language **(core)** | 13 | 0 | 65% |
| members_income **(core)** | 9 | 8 | 65% |
| self_employment **(core)** | 10 | 6 | 65% |
| email **(core)** | 10 | 5 | 63% |
| disability **(core)** | 10 | 4 | 60% |
| unemployment_benefits **(core)** | 8 | 8 | 60% |
| annual_income_estimate **(core)** | 11 | 2 | 60% |
| race_ethnicity **(core)** | 9 | 5 | 57% |
| citizenship_status **(core)** | 10 | 2 | 55% |
| homeless_status **(core)** | 10 | 1 | 53% |
| authorized_rep **(core)** | 6 | 8 | 50% |
| proof_income **(core)** | 8 | 4 | 50% |
| sex_gender | 9 | 1 | 48% |
| student_status | 7 | 4 | 45% |
| veteran_status | 8 | 2 | 45% |
| child_support_received | 6 | 5 | 43% |
| current_insurance | 7 | 2 | 40% |
| immigration_docs | 5 | 5 | 38% |
| foster_status | 7 | 1 | 38% |
| bank_accounts | 7 | 1 | 38% |
| property_other_assets | 7 | 1 | 38% |
| county | 6 | 2 | 35% |
| members_ssn | 4 | 6 | 35% |
| school_info | 6 | 2 | 35% |
| tribal_status | 5 | 2 | 30% |
| proof_citizenship_immigration | 5 | 2 | 30% |
| photo_id | 3 | 5 | 28% |
| medical_expenses | 4 | 3 | 28% |
| proof_address | 5 | 1 | 28% |
| tax_filing_status | 5 | 0 | 25% |
| pregnancy | 4 | 1 | 23% |
| employment_history | 2 | 5 | 23% |
| rent_mortgage | 4 | 1 | 23% |
| medicare_info | 4 | 1 | 23% |
| proof_expenses | 4 | 1 | 23% |
| prior_year_tax | 3 | 2 | 20% |
| other_names | 2 | 3 | 18% |
| vehicles | 3 | 1 | 18% |
| utilities_costs | 3 | 1 | 18% |
| child_care_costs | 3 | 1 | 18% |
| employer_insurance_offer | 3 | 0 | 15% |
| bank_direct_deposit | 2 | 2 | 15% |
| child_support_paid | 2 | 1 | 13% |
| utility_account_number | 2 | 0 | 10% |
| landlord_info | 1 | 2 | 10% |
| medical_providers | 1 | 2 | 10% |

**Core fields** = asked by at least half the forms (24 of 58).

## How much of each form the core fields cover

| Form | Fields asked | Covered by core | Confidence |
|---|---|---|---|
| care_fera (PG&E CARE/FERA Program Application, Form 01-9077 (residential)) | 15 | 88% | high |
| ihss (SOC 295L (9/18) Application for In-Home Supportive Services, large-print edition of SOC 295) | 17 | 83% | medium |
| lifeline (FCC Form 5629 Lifeline Program Application Form (USAC National Verifier, OMB 3060-0819)) | 15 | 83% | medium |
| wic (California WIC application and certification (MyFamily WIC / local agency certification appointment)) | 27 | 79% | low |
| section8 (HACLA-style Section 8 / public housing waitlist pre-application and full eligibility application (California PHA)) | 29 | 77% | low |
| liheap (CSD 43 Energy Intake Form (LIHEAP/HEAP) with CSD 081 Account Holder Authorization, as used by Alameda County LIHEAP) | 24 | 77% | high |
| extra_help (SSA-1020 Application for Extra Help with Medicare Prescription Drug Plan costs (only an older edition copy was readable; current SSA-1020-OCR-SM 01-2026 blocked to fetch; text partly garbled)) | 22 | 76% | low |
| general_relief (LA County DPSS General Relief application (not located; base is the GR intake packet eligibility rules and BenefitsCal GR requirements)) | 17 | 73% | low |
| school_meals (USDA-template Application for Free or Reduced-Price Meals, 2026-27 (district-hosted California copy)) | 20 | 73% | medium |
| child_care (California subsidized child care eligibility application (Alternative Payment Program / CDE Confidential Application for Child Development Services, county APP form)) | 36 | 70% | low |
| head_start (California Head Start / Early Head Start enrollment application (typical county or city grantee form)) | 34 | 69% | low |
| unemployment (California EDD Unemployment Insurance Application DE 1101ID Rev. 6 (6-22) (internet paper version; UI Online asks similar questions, not fetched)) | 26 | 67% | medium |
| covered_ca (Covered California / Single Streamlined Application, paper version CCFRM604 ENG (Revised 09/2025)) | 37 | 66% | high |
| medi_cal (California Single Streamlined Application (SSApp) paper form, 2014 Covered California edition (MC 210 renewal form not used)) | 39 | 62% | medium |
| capi (SOC 814 (12/20) Statement of Facts, Cash Assistance Program for Immigrants (CAPI)) | 39 | 62% | high |
| fafsa (2027-28 FAFSA Form (official studentaid.gov PDF; student section read, parent section conditional and only partly checked)) | 32 | 60% | high |
| vita_tax (IRS Form 13614-C Intake/Interview and Quality Review Sheet (Rev. 10-2026)) | 35 | 57% | high |
| calfresh (CF 285 (8/21) Application for CalFresh Benefits) | 44 | 55% | high |
| ssi (SSA-8000-BK Application for Supplemental Security Income (text read from the 05-2021 edition copy on SSA POMS; current SSA edition is 09-2024, not fetched). SSA-3368-BK Disability Report noted in extra.) | 43 | 51% | medium |
| calworks (SAWS 2 PLUS (4/15) Application for CalFresh, Cash Aid, and/or Medi-Cal/Health Care Programs (combined CalWORKs application)) | 52 | 48% | medium |

## Questions unique to each form (not in the shared list)

- **care_fera:** PG&E account number and name must match bill; primary residence only (no P.O. box); preferred contact method (mail/email/phone/text); alternative phone number; adult and child (under 18) head count only; Section 2A: check public assistance programs (LIHEAP, WIC, CalFresh, CalWORKs, Head Start, SSI, Medi-Cal, NSLP, BIA, General Assistance); Section 2B: total gross annual household income from all members; guardian or power-of-attorney checkbox; sub-metered renters: landlord completes Section 1A; consent to share information with other utilities and agencies; not claimed as a dependent; no shared energy meter
- **ihss:** IHSS services requested and living arrangement; past IHSS receipt: county, last date, monthly hours; SSI/SSP living arrangement (independent, board and care, home of another); blind or visually impaired and communication format preferences (Braille, audio, large print); ethnic origin and primary reading/speaking language codes; optional sexual orientation and gender identity; affirmation of responsibilities as IHSS employer (hiring, hours, share-of-cost); agreement to unannounced home visits and fraud warning; signature of applicant and of any representative with relationship and address
- **lifeline:** last 4 digits of SSN only (or Tribal ID if no SSN); best way to reach you (email/phone/text/mail); whether address is temporary; tribal lands residence checkbox; qualify via government program (SNAP, SSI, Medicaid, FPHA, VA pension, Tribal TANF, FDPIR, Tribal Head Start) or via income threshold (yes/no by household size); dependent/child applicant: name, DOB, last 4 SSN; initial each of about 12 agreement statements; consent for USAC to contact by text; one Lifeline benefit per household attestation; sales agent name and ID (only if submitted by agent); copy of state ID and proof of program or 3 months pay stubs
- **wic:** height and weight measurements at certification; hemoglobin/anemia blood test; breastfeeding status; health and nutrition history; dual-participation check across WIC offices; signed Know Your Rights and Responsibilities acknowledgment (CDPH 4132)
- **section8:** head of household must be 18 or older; each adult member declares citizenship/immigration status; Resident Alien Card (I-551) or other immigration document; reasonable accommodation questionnaire (S504-02); preference claims: work hours, age 62+, enrollment in education/training, military service; City of Los Angeles residence or work status; ability to pay portion of rent; consent for criminal background check; credit and residential history checks (public housing, full application); income and preference verification
- **liheap:** total number of people in household and number receiving income; age-group counts (0-2, 3-5, 6-18, 19-59, 60+); Native American and seasonal/migrant farmworker counts; CalFresh receipt (yes/no); energy bill to apply benefit to (one only); energy company and account number; utility shut-off status and past-due notice; utilities included in rent or submetered; all-electric home, and whether gas and electric companies are the same; main heating fuel and secondary heating sources; wood/propane/oil out-of-fuel status and days until out; account holder authorization and consent to share utility data (CSD 081); weatherization consent
- **extra_help:** whether you have Medicare Savings Program or state Medicaid office info; whether spouse has Extra Help and spouse's own income/resources; life insurance value, burial plots, irrevocable burial contracts (resource questions); burial funds (not required if used for burial expenses); helper's relationship and knowledge of applicant's SSN (SSA-1020B for helping someone else)
- **general_relief:** monthly net income test (all sources); home ownership and home value limit; cash on hand and bank balance limit at application; personal property: stocks, bonds, insurance policies; probation or parole violation; fleeing prosecution or custody after felony; applied under more than one GR case number; sick or disabled and unable to work; medical facility admission; GROW work participation and substance abuse program; acknowledgment of GR Rights and Responsibilities (GR 21); couple or domestic partner grant amount
- **school_meals:** child's grade and school for each child; migrant or runaway status; SNAP, TANF, or FDPIR case number (skips income section); income frequency (weekly, biweekly, twice monthly, monthly, yearly); child income reported as one total; last four SSN digits of signing adult (or 'no SSN' box); Head Start enrollment (categorical eligibility); optional children's ethnicity and race
- **child_care:** reason for care need (work, school, training, incapacity); work or school hours and schedule; child's age and special needs; parent fee or share of cost; preferred provider type (center, family child care, license-exempt); program eligibility re-verified at least every two years
- **head_start:** child's birth certificate; child's immunization record; custody or guardianship papers; TANF/CalWORKs notices; child's developmental or health screening history; parent work, school, or training status; preference or priority status (foster, homeless, income-eligible, over-income categories)
- **unemployment:** worked outside California or in Canada in last 18 months; Social Security numbers used and EDD client number; driver license or state ID number and issuing state; job search methods and how you get to work; usual occupation, seasonal work dates, other work skills; last employer details: last work date, last-week gross wages, supervisor, reason for separation; expect to return to a former employer or have a start date with a new one; union or non-union trade membership and strike benefits; elected public official status; school recess or substitute teacher status (LA); alternate base period consent; Disaster Unemployment Assistance supplement (disaster type, county, hours before disaster); highest grade of school completed; TTY / California Relay use; prior California UI or disability claim dates in last 2 years
- **covered_ca:** relationship of each person to each other; primary contact and preferred contact method; primary caretaker for children 20 or younger; full-time student status for ages 18-20 (only if relevant); American Indian/Alaska Native status and Indian Health Service care (Attachment D); alternative format preference (Braille, large print, audio); lives temporarily out of state; involved in lawsuit over injury or accident; claimed as a dependent on someone else's return; Medicare Part A free eligibility; wants Medi-Cal to pay medical expenses from last 3 months; income that changes month to month and expected annual total; tax deductions (alimony, student loan interest, IRA, etc.) that lower cost; expected to file taxes / required to file
- **medi_cal:** lived in US since August 1996; temporarily living out of state; lawsuit or settlement from injury (third-party liability); long-term care or home and community-based services need; medical expenses in last 3 months Medi-Cal should pay; primary caretaker of child 20 or younger; full-time student status for ages 18-20; special enrollment life event; tribe membership and recognition state; Medicare Part A/B enrollment and premium eligibility; consent to autodialed or prerecorded messages; voter registration offer; CHDP, WIC and family planning referral questions; interview and communication preferences
- **capi:** ADA and accommodation needs (reading help, sign language, travel to interview); county-use language, disability and communication questions; other names used (applicant); sexual orientation and gender identity (optional); sponsor name, address, phone; sponsor deceased or disabled; I-864/SOC 809/SOC 813 status; indigence exception and sponsor deeming; entry date to US, port of entry, time spent outside US; criminal history: felony, attempted felony, parole or probation violation; intent to remain in California; current living arrangement (house, nursing home, shelter, jail, etc.); IHSS receipt and need for personal care assistance; cooking facilities and whether applicant lives alone; Medi-Cal and SSA disability determination status, DDSD and SSI referrals; APS referral and abuse victim questions; marital status and whether spouse is applying or eligible; burial funds, cemetery plots, life estates, unprobated estates; property transferred or sold for less within 36 months; life insurance policies (face value, cash surrender value, loans); special expenses for disabled applicant (IRWE); CalFresh receipt and referral; SOC 453 household expense form required with application; SSN explanation or proof of SSN application; wage employer address, phone and dates; self-employment dates and tax year; remarks and change-reporting acknowledgment
- **fafsa:** parent section (conditional): parent identity, income, assets and household repeat for the parent; marital status (single, married, remarried, separated, divorced, widowed); number of people in family and number in college; children or other people the student supports; parent education level (college attended or completed); high school completion or GED/HiSET/homeschool status and high school name; veteran or active duty and public safety officer status; incarceration status and whether parents are refusing to provide information; 2025 federal and territory tax return (filed, joint, filing status, AGI, tax paid, EITC received); untaxed IRA/pension distributions, rollovers, tax-exempt interest, foreign earned income; net worth of investments, businesses and farms (excluding home); college list (school codes) and college plans; consent to IRS data transfer and FSA signature
- **vita_tax:** can anyone else claim you or your spouse as a dependent; lived in two or more states in 2026; Identity Protection PIN (IPPIN) issued; owners or holders of digital assets (crypto); $3 Presidential Election Campaign Fund; refund split between accounts and balance-due payment method; preferred language for written IRS communications; estimated tax payments and last year's refund applied; EITC, CTC, AOTC or HOH credit disallowed in a previous year (year and reason); letters or bills received from IRS; Low Income Taxpayer Clinic referral; disaster-area loss (1099-A), home sale (1099-S), new vehicle purchase (1098-VLI); HSA contributions/distributions and Marketplace coverage (1095-A); educational classes and scholarship income (1098-T); legally blind or totally and permanently disabled, per person; each household member's residency, months lived in home and whether a full-time student; gig income (rideshare, delivery), digital asset income; CalEITC has no separate item on the federal form
- **calfresh:** fraud and program-violation certification; expedited service screening questions; interview preference and availability; interest in Medi-Cal (yes/no); LIHEAP payment receipt; resources sold or transferred in last 3 months; convictions: duplicate benefits, trafficking, drug or firearm trading; fleeing felon and probation/parole violation; sponsor information for noncitizens; food from shelters or meal programs; living in an institution; household member 60+ or disabled unable to buy food; strike and recent job loss or hours reduction; foster child: counted as unearned income election; optional domestic violence history; accommodation needs and contact authorization (phone, text, email); authorized representative to receive/spend benefits
- **ssi:** prior marriages and dates/how they ended (#6); unable to work due to illness: date, blindness (#7); child claimants: parent's disability/age/SSN and when child became disabled (#7); birthplace (#8) and American Indian status (#11); immigration status details, admission date, sponsor (#11-12, #17); date first made home in US, time outside US (#15-16); unsatisfied felony warrants (#18); living situation: institution or non-institutional care, facility, placing agency (#19-23); everyone who lives with you and their income (#26); landlord name, address, phone (#30); household expense contributions and food/shelter split (#31-37); owner of home or property, mortgage amounts, life insurance loans (#27-28, #39-45); burial funds, cemetery lots, assets sold or transferred in last 36 months (#47-49); overpayments being collected, SNAP status and application (#51, #58); assignment of medical rights, unpaid medical bills (#59); work under SSA number, school attendance and school name (#57, #60); representative payee history (#61c); [SSA-3368 Adult Disability Report, not fetched, from secondary guides, low confidence] adds each medical condition with treatment dates, doctors/hospitals/clinics and medications, work history about 5 years with job duties, education and training, and who holds medical records
- **calworks:** eviction or pay-or-quit notice and utility shut-off; immediate need screen (food running out, transportation, emergencies); birth certificates for cash aid applicants; teen parent and pregnancy status of household members; child living with parent outside home (under 21); child/adult care for disabled or dependent (who provides care); special needs (special diet, equipment, housework, utilities); cash, certificates of deposit and stocks: value and location; life or burial insurance; personal property and jewelry over thresholds; tax dependents and planned tax filing for health coverage; food, housing, sponsor and noncitizen details (6b-6f); fraud, sanctions, diversion program and third-party liability; non-cooperation and welfare-to-work sanctions; CHDP, immunization, WIC, family planning service interest; employer health plan details (employee benefits form); special need payment for fire, flood or other loss; residence in California and planned absences over 30 days; fingerprinting and photo-imaging requirement notice

## Full matrix

| Field | calfresh | medi_cal | calworks | capi | ihss | general_relief | covered_ca | ssi | extra_help | fafsa | vita_tax | unemployment | wic | section8 | liheap | care_fera | lifeline | head_start | child_care | school_meals |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Identity** | | | | | | | | | | | | | | | | | | | | |
| full_name | Y | Y | Y | Y | P | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| other_names | P | N | P | P | N | N | N | Y | N | N | N | Y | N | N | N | N | N | N | N | N |
| dob | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | N | Y | Y | Y | N |
| ssn | Y | Y | Y | P | Y | Y | P | Y | Y | Y | P | Y | N | P | P | N | P | N | P | P |
| sex_gender | Y | Y | Y | Y | P | N | Y | Y | N | Y | N | Y | N | N | N | N | N | Y | N | N |
| race_ethnicity | Y | Y | Y | P | P | N | Y | N | N | Y | Y | Y | P | N | P | N | N | Y | P | Y |
| language | Y | Y | Y | Y | Y | N | Y | Y | N | N | Y | Y | Y | N | N | Y | N | Y | Y | N |
| citizenship_status | Y | Y | Y | Y | N | N | Y | Y | N | Y | Y | Y | N | Y | N | N | N | P | P | N |
| immigration_docs | Y | Y | Y | Y | N | N | P | P | N | P | P | Y | N | N | N | N | N | N | P | N |
| photo_id | Y | N | Y | N | N | N | N | N | N | N | Y | P | P | P | N | N | P | N | P | N |
| **Contact** | | | | | | | | | | | | | | | | | | | | |
| home_address | Y | Y | Y | Y | Y | Y | Y | Y | Y | P | N | Y | Y | Y | Y | Y | Y | Y | Y | P |
| mailing_address | Y | Y | Y | Y | N | N | Y | Y | Y | Y | Y | Y | P | P | Y | N | P | P | P | N |
| phone | Y | Y | Y | Y | Y | N | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| email | Y | Y | Y | Y | Y | N | P | N | N | Y | Y | N | P | P | Y | Y | Y | P | P | N |
| county | N | N | Y | Y | N | Y | N | Y | N | N | N | P | N | P | Y | N | N | N | Y | N |
| **Household** | | | | | | | | | | | | | | | | | | | | |
| household_members | Y | Y | Y | Y | Y | P | Y | Y | P | P | Y | N | Y | Y | Y | P | P | Y | Y | Y |
| members_ssn | Y | Y | Y | N | Y | N | P | P | P | N | P | N | N | P | N | N | P | N | N | N |
| members_income | Y | Y | Y | P | N | P | Y | P | P | P | P | N | Y | Y | Y | P | N | Y | Y | P |
| pregnancy | N | Y | Y | N | N | N | Y | N | N | N | N | N | Y | N | N | N | N | P | N | N |
| disability | Y | Y | Y | Y | P | Y | P | Y | N | N | Y | Y | N | Y | Y | N | N | P | P | N |
| student_status | Y | P | P | N | N | N | P | Y | N | Y | Y | Y | N | P | N | N | N | N | Y | Y |
| homeless_status | Y | Y | Y | Y | N | N | Y | Y | N | Y | N | N | P | N | N | N | N | Y | Y | Y |
| foster_status | Y | Y | Y | N | N | N | P | N | N | Y | N | N | N | N | N | N | N | Y | Y | Y |
| veteran_status | P | Y | N | P | Y | N | Y | Y | N | Y | Y | Y | N | Y | N | N | N | N | N | N |
| tribal_status | N | Y | Y | N | N | N | Y | Y | N | P | N | N | N | N | P | N | Y | N | N | N |
| **Income** | | | | | | | | | | | | | | | | | | | | |
| job_income | Y | Y | Y | Y | N | P | Y | Y | P | P | Y | Y | Y | Y | Y | N | N | P | Y | Y |
| self_employment | Y | Y | Y | Y | N | P | Y | Y | P | P | Y | Y | P | P | N | N | N | P | Y | Y |
| unemployment_benefits | Y | Y | Y | Y | N | P | Y | P | P | P | Y | Y | P | P | N | N | N | P | P | Y |
| social_security_ssi | Y | Y | Y | Y | P | P | Y | Y | Y | Y | Y | Y | P | P | Y | P | N | P | P | Y |
| child_support_received | Y | Y | Y | Y | N | N | N | P | N | Y | N | N | P | P | N | N | N | P | P | Y |
| other_income | Y | Y | Y | Y | N | P | Y | Y | Y | Y | Y | Y | Y | Y | Y | N | N | P | Y | Y |
| annual_income_estimate | N | Y | Y | Y | N | N | Y | P | Y | N | Y | N | Y | Y | N | Y | P | Y | Y | N |
| prior_year_tax | N | N | N | Y | N | N | P | N | N | Y | Y | N | N | N | N | N | N | P | N | N |
| tax_filing_status | N | Y | Y | N | N | N | Y | N | N | Y | Y | N | N | N | N | N | N | N | N | N |
| employment_history | P | N | P | P | N | N | N | Y | N | N | N | Y | N | N | N | N | N | P | P | N |
| **Assets** | | | | | | | | | | | | | | | | | | | | |
| bank_accounts | Y | N | Y | Y | N | Y | N | Y | Y | Y | P | N | N | N | N | N | N | N | N | N |
| vehicles | N | N | Y | Y | N | N | N | Y | N | N | P | N | N | N | N | N | N | N | N | N |
| property_other_assets | P | N | Y | Y | N | Y | N | Y | Y | Y | Y | N | N | N | N | N | N | N | N | N |
| **Expenses** | | | | | | | | | | | | | | | | | | | | |
| rent_mortgage | Y | N | Y | Y | N | N | N | Y | N | N | P | N | N | N | N | N | N | N | N | N |
| utilities_costs | Y | N | Y | N | N | N | N | P | N | N | N | N | N | N | Y | N | N | N | N | N |
| child_care_costs | Y | N | Y | N | N | N | N | N | N | N | Y | N | N | N | N | N | N | N | P | N |
| medical_expenses | Y | P | Y | P | N | N | P | Y | N | N | Y | N | N | N | N | N | N | N | N | N |
| child_support_paid | Y | N | Y | N | N | N | N | P | N | N | N | N | N | N | N | N | N | N | N | N |
| **Health and insurance** | | | | | | | | | | | | | | | | | | | | |
| current_insurance | N | Y | Y | N | N | N | Y | P | Y | N | Y | N | Y | N | N | N | N | P | N | Y |
| employer_insurance_offer | N | Y | Y | N | N | N | Y | N | N | N | N | N | N | N | N | N | N | N | N | N |
| medicare_info | N | Y | P | N | N | N | Y | Y | Y | N | N | N | N | N | N | N | N | N | N | N |
| **Program-specific** | | | | | | | | | | | | | | | | | | | | |
| current_benefits | P | P | Y | Y | Y | N | P | Y | Y | Y | N | P | Y | P | Y | Y | Y | Y | Y | Y |
| utility_account_number | N | N | N | N | N | N | N | N | N | N | N | N | N | N | Y | Y | N | N | N | N |
| landlord_info | N | N | N | N | N | N | N | Y | N | N | N | N | N | N | P | P | N | N | N | N |
| medical_providers | N | N | N | P | N | N | N | N | N | N | N | N | P | N | N | N | N | Y | N | N |
| school_info | P | N | P | N | N | N | N | Y | N | Y | N | Y | N | N | N | N | N | Y | Y | Y |
| bank_direct_deposit | N | N | N | N | N | P | N | Y | N | N | Y | N | N | N | N | N | N | N | P | N |
| signature_consent | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | N | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| authorized_rep | Y | Y | Y | N | Y | N | Y | Y | P | P | N | N | P | P | P | P | N | P | P | N |
| **Proof documents** | | | | | | | | | | | | | | | | | | | | |
| proof_income | Y | P | Y | P | N | N | N | N | N | N | Y | N | Y | Y | Y | P | P | Y | Y | N |
| proof_address | Y | N | Y | N | N | N | N | N | N | N | N | N | Y | P | N | N | N | Y | Y | N |
| proof_citizenship_immigration | Y | Y | Y | Y | N | N | N | N | N | N | N | N | N | Y | N | N | N | P | P | N |
| proof_expenses | Y | N | Y | P | N | N | N | N | N | N | Y | N | N | N | Y | N | N | N | N | N |
