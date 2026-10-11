import type { PortalId } from './portals'

// The programs the agent applies for. Numbers and rules come from
// ../../../research/ (checked 2026-10-11). Anything marked `unconfirmed`
// was only seen in search results or derived. Check it before showing it as fact.

export type ProgramId = 'calfresh' | 'medi-cal' | 'calworks' | 'general-relief' | 'cfap'

export type Fact = { text: string; unconfirmed?: boolean }

export type Program = {
  id: ProgramId
  name: string
  category: 'food' | 'health' | 'cash'
  plain: string // one line, plain words
  runBy: string
  applyVia: PortalId[]
  otherWays: string[] // phone, in person
  whoQualifies: Fact[]
  amount: Fact
  timing: Fact
  bring: string[]
  tips: string[]
  sources: { title: string; href: string }[]
  photo: string // file in /public/photos without extension
}

export const programs: Program[] = [
  {
    id: 'calfresh',
    name: 'CalFresh',
    category: 'food',
    plain: 'Money for groceries every month on an EBT card.',
    runBy: 'Your county, with the California Department of Social Services (CDSS)',
    applyVia: ['benefitscal'],
    otherWays: ['Call the CalFresh Benefits Helpline: 1-877-847-3663', 'Visit your county social services office'],
    whoQualifies: [
      { text: 'Household income up to 200% of the poverty line (about $2,660/mo for 1 person)' },
      { text: 'No limit on savings or a car for most households' },
      { text: 'People on SSI can get CalFresh in California' },
      { text: 'Adults 18–64 without kids under 14 may have to work 20 hours a week (rules started June 1, 2026)' },
    ],
    amount: { text: 'Up to $306/mo for 1 person, $1,023/mo for 4 (from Oct 1, 2026)' },
    timing: { text: 'Decision within 30 days. Very low income? You can get it within 3 days (expedited).' },
    bring: ['Photo ID', 'Pay stubs from the last 30 days', 'Rent or mortgage and utility bills', 'Social Security numbers for everyone applying', 'Immigration papers, if any'],
    tips: [
      'Apply the same day even without every document. The county will ask for the rest.',
      'There is a phone interview. Answer calls from numbers you don’t know.',
    ],
    sources: [
      { title: 'CalFresh (CDSS)', href: 'https://www.cdss.ca.gov/inforesources/calfresh' },
      { title: 'CalFresh contacts (CDSS)', href: 'https://www.cdss.ca.gov/inforesources/CalFresh/Contacts' },
    ],
    photo: 'farmers-market-apricots',
  },
  {
    id: 'medi-cal',
    name: 'Medi-Cal',
    category: 'health',
    plain: 'Free or low-cost health coverage: doctors, hospital, prescriptions, dental.',
    runBy: 'Your county, with the Department of Health Care Services (DHCS)',
    applyVia: ['benefitscal'],
    otherWays: ['Call the Medi-Cal Helpline: 1-800-541-5555', 'Visit your county social services office', 'Apply through Covered California (screens for both)'],
    whoQualifies: [
      { text: 'Adults with income up to 138% of the poverty line (about $22,025 a year for 1 person)' },
      { text: 'Children up to 266%; pregnant people up to 213% (MCAP up to 322%)' },
      { text: 'No asset test for children' },
    ],
    amount: { text: '$0 premium for most people' },
    timing: { text: 'Decision within 45 days (90 if a disability must be reviewed). Can cover up to 3 months back.' },
    bring: ['Photo ID', 'Proof of income', 'Proof you live in California', 'Social Security number, if you have one', 'Immigration papers, if any'],
    tips: ['At a hospital without coverage, ask for Hospital Presumptive Eligibility. It covers you the same day.'],
    sources: [
      { title: 'Medi-Cal contacts (DHCS)', href: 'https://www.dhcs.ca.gov/medi-cal/contact/' },
      { title: 'Covered California: apply', href: 'https://www.coveredca.com/apply/' },
    ],
    photo: 'poppies',
  },
  {
    id: 'calworks',
    name: 'CalWORKs',
    category: 'cash',
    plain: 'Monthly cash and job help for families with children.',
    runBy: 'Your county welfare department, with CDSS',
    applyVia: ['benefitscal'],
    otherWays: ['Visit your county social services office (some counties, like San Diego, require an in-person interview)'],
    whoQualifies: [
      { text: 'Families with children under 18 (or pregnant)' },
      { text: 'Income under limits that depend on family size and region', unconfirmed: true },
      { text: 'Adults can get aid for up to 60 months total' },
    ],
    amount: { text: 'Up to $1,175/mo for a family of 3 with no other income (Region 1)', unconfirmed: true },
    timing: { text: 'Emergency help ("Immediate Need") in about 1 day. Standard timing varies by county.', unconfirmed: true },
    bring: ['Photo ID', 'Social Security numbers', 'Children’s birth certificates', 'Proof of income', 'Proof of where you live'],
    tips: ['Homeless, facing eviction, or out of food in 3 days? Ask for "Immediate Need" when you apply.'],
    sources: [{ title: 'About CalWORKs (CDSS)', href: 'https://www.cdss.ca.gov/inforesources/calworks-summary/program-overview/about-calworks' }],
    photo: 'palm-street-la',
  },
  {
    id: 'general-relief',
    name: 'General Relief',
    category: 'cash',
    plain: 'County cash aid for adults who can’t get other cash programs.',
    runBy: 'Your county (each county runs its own)',
    applyVia: ['benefitscal'],
    otherWays: ['LA County DPSS: 1-866-613-3777', 'Visit your county social services office'],
    whoQualifies: [
      { text: 'Adults without kids who don’t qualify for CalWORKs, SSI or other cash aid' },
      { text: 'Very low income and few resources. Limits are set by each county', unconfirmed: true },
    ],
    amount: { text: 'LA County: up to $221/mo for 1 person, $375 for 2. Other counties differ.' },
    timing: { text: 'Varies by county', unconfirmed: true },
    bring: ['Photo ID', 'Proof of income (or that you have none)', 'Proof you live in the county'],
    tips: ['Not every county takes General Relief on BenefitsCal. Call your county first.', 'Some counties limit aid to a few months a year for people who can work.'],
    sources: [{ title: 'LA County DPSS', href: 'https://dpss.lacounty.gov/' }],
    photo: 'ferndale-main-street',
  },
  {
    id: 'cfap',
    name: 'CFAP',
    category: 'food',
    plain: 'California Food Assistance Program: CalFresh-sized food benefits for some immigrants.',
    runBy: 'Your county, with CDSS (state-funded)',
    applyVia: ['benefitscal'],
    otherWays: ['Visit your county social services office'],
    whoQualifies: [
      { text: 'Lawfully present immigrants who meet CalFresh income rules but can’t get CalFresh because of federal immigration rules' },
      { text: 'Planned: all income-eligible Californians 55+ regardless of status, starting Oct 1, 2027', unconfirmed: true },
    ],
    amount: { text: 'Same as CalFresh', unconfirmed: true },
    timing: { text: 'Same as CalFresh: 30 days, or faster if expedited' },
    bring: ['Everything for CalFresh', 'Immigration documents'],
    tips: ['You use the same application as CalFresh. The county decides which one you get.'],
    sources: [
      { title: 'CFAP (CDSS)', href: 'https://cdss.ca.gov/inforesources/cdss-programs/calfresh/cfap' },
      { title: 'CFAP (Fresno County)', href: 'https://www.fresnocountyca.gov/Departments/Social-Services/Assistance-Programs/CalFresh/California-Food-Assistance-Program-CFAP' },
    ],
    photo: 'salinas-farm-tractor',
  },
]

export const programById = Object.fromEntries(programs.map((p) => [p.id, p])) as Record<ProgramId, Program>
