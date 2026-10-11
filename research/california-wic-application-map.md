# California WIC application and certification map

Research date: October 11, 2026. Coverage: official statewide screening/routing, representative Fresno EOC intake, and official certification/provider forms. Fresno is a research example, **not the user's residence**. The primary researcher inspected the public screener and Fresno form live; this researcher inspected public pages and downloaded forms. No account, contact request, CAPTCHA, signature, upload, message, appointment request, or submission was completed.

The companion [field catalog](california-wic-intake-fields.json) contains 191 source-scoped records. Required values distinguish explicit markers, conditional requirements, unmarked fields, and unknown requirements. `live_observed` is limited to primary CUA observations; paper fields are not asserted to be web-intake controls. Keys are local research identifiers, not WIC API names.

## What applying means

California WIC routes families to a local agency for an appointment and staff certification. Its statewide website provides an eligibility assessment and office search; a possible-eligibility result is not enrollment. The office verifies category, California residency, income eligibility and nutrition risk. BenefitsCal's WIC referral choice does not itself complete WIC certification. [How Can I Get WIC?](https://myfamily.wic.ca.gov/Home/HowCanIGetWIC), [WPPM 200-01, revised January 15, 2026](https://www.cdph.ca.gov/Programs/CFH/DWICSN/CDPH%20Document%20Library/LocalAgencies/WPPM/200-01-Eligibility-Requirements.pdf)

Practical sequence: screen for possible fit; choose a local office; provide that agency's enrollment/contact intake; obtain an appointment; provide requested evidence and complete the staff nutrition assessment and rights process; retain the agency's certification outcome and follow-up appointment. Do not label a submitted web contact form as approved benefits.

## Statewide screener: primary live observations

At [Am I Eligible?](https://myfamily.wic.ca.gov/Home/AmIEligible), the tested stages were residency, category and income guidance. No identity or contact data was entered.

| Stage | Observed controls |
|---|---|
| Residency | Live in California (default); plan to move; none |
| Category | Pregnant (default); breastfeeding infant under 12 months; baby/pregnancy within six months; child under five including foster children and children cared for by fathers/grandparents; receiving WIC in another state; none |
| Income guidance | Public-program button for Medi-Cal/CalFresh/CalWORKs/FDPIR, or household-size buttons 1–9, More than 9, None |

Selecting household size 1 opened the published income table and generic possible-eligibility/local-office handoff. **There was no numeric income-comparison input in the inspected screener.** The table is effective May 1, 2026–June 30, 2027. Its result remains informational; local WIC staff determine eligibility. The page explains special household-size treatment for expected births and foster children; do not copy BenefitsCal household count without review. [Official assessment](https://myfamily.wic.ca.gov/Home/AmIEligible)

[Office search](https://myfamily.wic.ca.gov/Home/WICOfficeGrocer) uses city/ZIP and search radius. It is routing, not an appointment booking confirmation. State help number: 1-800-852-5770.

## Representative local web intake: Fresno EOC

[Enrollment form](https://fresnoeoc.org/wic/enroll-in-wic/) is a staff-follow-up intake. Primary live inspection exposed the branches below without entering identity/contact data or submitting. Stars indicate local form requirements, not statewide mandatory fields. Server validation and CAPTCHA were not tested.

| Group | Live observed fields and branch behavior |
|---|---|
| Request/transfer | Apply, Re-Apply, transfer within California, transfer from another state. Re-Apply adds no field. Within-California transfer adds prior county (unstarred). Interstate transfer adds starred acknowledgment requesting prior-office records faxed to 559-263-1152; intake may continue before fax |
| Role/category | Maternal role, Dad, Legal Guardian, Foster Parent. Maternal role reveals pregnant/breastfeeding-to-first-birthday/postpartum-to-sixth-month checkboxes; all selected added no detail. Dad alone reveals starred mother's name, DOB and same-address question; No reveals starred situation explanation, not mother's address inputs. Guardian/foster hide mother fields |
| Applicant/contact | Starred name, DOB, home address, phone, contact methods, enrollment appointment preference, language. Email unstarred. Call/Text preference; call-time options morning, afternoon, anytime. Text choice includes messaging consent. Different mailing address adds unstarred address; Other language adds unstarred language input |
| Children | Starred child-under-five Yes/No. Up to five sequential slots; names and birthdates unstarred, foster and breastfeeding answers starred. First four slots offer starred another-child Yes/No; fifth has no further-child control |
| Site | Starred preference: Clovis Shaw/Willow, Downtown Fulton Mall, Kings Canyon/Chestnut, Shields/First, West Shaw, Unsure |
| Agriculture | Starred work-in-agriculture-in-past-two-years question; Yes reveals unstarred leave-area-for-work Yes/No |

Referral follow-ups were also inspected live: Social Media reveals starred Facebook/Instagram/TikTok/YouTube choice; Provider/Hospital reveals starred provider name; public/social service reveals starred CalFresh, CalWORKs, CPS, Medi-Cal or Social Services/Social Worker choice. Other reveals an unstarred checkbox list of outreach/community sources, including More Options; that option reveals an unstarred explanation. Call preference reveals unstarred call-time choices. Comments and CAPTCHA are present. No income amount, SSN or document-upload control was observed across the exposed intake. This does not mean staff certification omits financial or clinical evidence.

## Appointment and evidence preparation

The statewide guidance tells families to prepare participant identification, residence/income evidence, pregnancy proof where relevant, and requested provider forms; staff may ask enrolling children to attend. It identifies active Medi-Cal as an income-proof option. These are preparation items, not five mandatory website uploads. [First appointment guidance](https://myfamily.wic.ca.gov/Home/HowCanIGetWIC)

The newer adjunctive policy requires staff to assess qualifying public-program eligibility first. Individual/family qualifying routes differ; verified adjunctive cases do not require extra income documentation, and inability to self-report estimated income must not block certification. Use current proof/agency verification, not the fact that a BenefitsCal draft selected Medi-Cal or CalFresh. [WPPM 210-02, January 15, 2026](https://www.cdph.ca.gov/Programs/CFH/DWICSN/CDPH%20Document%20Library/LocalAgencies/WPPM/210-02-Adjunctive-Eligibility-Criteria.pdf)

Staff nutrition assessment covers body measurements, blood results, clinical/health history and eating/feeding patterns. These belong to the WIC professional assessment; an assistant should not invent results or assign nutrition risk. [WPPM 210-09](https://www.cdph.ca.gov/Programs/CFH/DWICSN/CDPH%20Document%20Library/LocalAgencies/WPPM/210-09Overview.pdf)

Fresno advertises phone appointments, but the posted presence waiver states September 30, 2026 expiration, or as later communicated. No extension was located during this research. Confirm current agency arrangements rather than promising entirely remote certification. The newer overview distinguishes one missing required proof from more than one; older/local simplifications must not become a universal missing-document rule. [Fresno phone appointments](https://fresnoeoc.org/wic/remote/), [posted waiver](https://www.cdph.ca.gov/Programs/CFH/DWICSN/CDPH%20Document%20Library/LocalAgencies/WPPM/200-00PhysicalPresenceWaiverforCertificationsandRecertifications.pdf), [2026 overview](https://www.cdph.ca.gov/Programs/CFH/DWICSN/CDPH%20Document%20Library/LocalAgencies/WPPM/200-01-Eligibility-Requirements.pdf)

## Official paper forms inspected

Forms were downloaded from official hosts, text-extracted and visually checked for the principal field blocks. They are blank references, not completed applications. The public [CDPH forms index](https://www.cdph.ca.gov/Programs/PSB/Pages/WIC.aspx) publishes referral/declaration forms rather than a universal consumer application.

| Form and revision | Field scope and use |
|---|---|
| [247A Pediatric Referral](wic-cdph-247a.pdf), 11/25 | Child/caregiver identity; recent and birth measurements; hemoglobin/hematocrit, lead and dates; DTaP doses; infant feeding; provider/clinic/signature. Provider referral |
| [247B Postpartum/Breastfeeding](wic-cdph-247b.pdf), 04/17 | Patient contacts; postpartum measurements/labs; delivery/outcome and infant measures; medical conditions/medications; provider signature. Referral does not guarantee eligibility |
| [247C Pregnant Referral](wic-cdph-247c.pdf), 04/17 | Patient contacts; prenatal measures/labs; due/prior pregnancy dates, gravida/para, pre-pregnancy weight; medical conditions/medications; provider signature |
| [4130 Self Declaration](wic-cdph-4130.pdf), 11/24 | Applicable missing/unavailable income, address or ID proof; reasons; declared gross annual income/address/names; family/staff identifiers; representative signature. Agency-specific applicability and truth declaration; not a blanket proof bypass |
| [247 Medical Formula/Nutritionals](wic-cdph-247.pdf), 04/26 | Conditional provider request: patient measurements/labs/feeding/insurance; product/form/daily amount/duration/diagnosis; food restrictions; provider credentials/signature. Not universal enrollment data |
| [4132 Rights and Responsibilities](wic-cdph-4132-rights.pdf), 10/24 | Rights/program responsibilities; truth certification; family representative/caretaker signature/date/family ID and staff-review block. No signature or acceptance performed |

## Reuse and remaining gaps

Name, birthdate, current address/contact, matching child records and benefit enrollment can be candidate reuse data. Reconfirm person, dates, caregiver authority and WIC category/family rules. Do not transfer SSNs, immigration documents, expense/asset probes or synthetic BenefitsCal test answers into WIC intake. No such identifier fields were found in the reviewed intake.

Remaining gaps: other local-agency forms; server/CAPTCHA/submission response; staff-only WIC WISE screens; current post-September-2026 presence arrangements; local document-transfer mechanisms; appointment confirmation, final staff determination and card issuance. Paper inventories and the live baseline complement each other; neither proves exhaustive statewide web-form coverage.
