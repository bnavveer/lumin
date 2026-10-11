import type { ApplicationMatch, ApplicationProgram } from '../../../shared/chat'

// Which programs are worth showing, from the household's basic answers.
// The server's screening lists every program it knows; most of them only
// apply to some households (WIC needs a pregnancy or a young child, CalWORKs
// needs children, PG&E discounts need a PG&E account...). This keeps the list
// to programs that could fit and tucks the rest away with the reason.
//
// It never decides eligibility. A "likely" match is always shown, and when an
// answer is unknown the program stays visible rather than being hidden.

export type Answers = Partial<{
  childrenUnder18: number
  childrenUnder5: number
  pregnant: boolean
  breastfeedingInfantUnder12Months: boolean
  pregnancyEndedWithin6Months: boolean
  adultAge: number
  immigrationStatus: string
  pgeCustomer: boolean
  needsEnergyBillHelp: boolean
  needsDailyLivingHelp: boolean
  needsChildCare: boolean
  californiaResident: boolean
}>

type Rule = (a: Answers) => { fits: boolean | null; why: string }

const known = (v: unknown) => v !== undefined && v !== null

const rules: Partial<Record<ApplicationProgram, Rule>> = {
  calworks: (a) =>
    !known(a.childrenUnder18) && !known(a.pregnant)
      ? { fits: null, why: '' }
      : { fits: (a.childrenUnder18 ?? 0) > 0 || a.pregnant === true, why: 'CalWORKs is for families with children or a pregnancy.' },
  general_relief: (a) =>
    !known(a.childrenUnder18) ? { fits: null, why: '' } : { fits: (a.childrenUnder18 ?? 0) === 0, why: 'General Relief is for adults without children at home.' },
  cfap: (a) =>
    !known(a.immigrationStatus) || a.immigrationStatus === 'unknown'
      ? { fits: null, why: '' }
      : { fits: a.immigrationStatus !== 'citizen', why: 'CFAP is for immigrants who can’t get CalFresh. Citizens apply for CalFresh.' },
  wic: (a) => {
    const signals = [a.pregnant, a.breastfeedingInfantUnder12Months, a.pregnancyEndedWithin6Months]
    const young = a.childrenUnder5
    if (signals.every((s) => !known(s)) && !known(young)) return { fits: null, why: '' }
    return { fits: signals.some((s) => s === true) || (young ?? 0) > 0, why: 'WIC is for pregnancy, new parents and children under 5.' }
  },
  pge_care: (a) => (!known(a.pgeCustomer) ? { fits: null, why: '' } : { fits: a.pgeCustomer === true, why: 'CARE is a discount for PG&E customers.' }),
  pge_fera: (a) => (!known(a.pgeCustomer) ? { fits: null, why: '' } : { fits: a.pgeCustomer === true, why: 'FERA is a discount for PG&E customers.' }),
  liheap: (a) => (!known(a.needsEnergyBillHelp) ? { fits: false, why: 'Energy bill help, if you need it. Ask in chat.' } : { fits: a.needsEnergyBillHelp === true, why: 'Energy bill help, if you need it.' }),
  ihss: (a) =>
    a.needsDailyLivingHelp === true || (a.adultAge ?? 0) >= 65
      ? { fits: true, why: '' }
      : { fits: false, why: 'In-home care for people who need help with daily living.' },
  child_care: (a) =>
    a.needsChildCare === true
      ? { fits: true, why: '' }
      : { fits: false, why: (a.childrenUnder18 ?? 0) > 0 ? 'Child care help, if you need it. Ask in chat.' : 'Child care help for working parents.' },
}

export function sortByRelevance(matches: ApplicationMatch[], answers: Answers) {
  const shown: ApplicationMatch[] = []
  const hidden: { match: ApplicationMatch; why: string }[] = []
  for (const m of matches) {
    if (m.status === 'not_eligible') {
      hidden.push({ match: m, why: m.reason })
      continue
    }
    const rule = rules[m.program]
    const verdict = rule ? rule(answers) : { fits: null, why: '' }
    if (m.status === 'likely' || verdict.fits !== false) shown.push(m)
    else hidden.push({ match: m, why: verdict.why })
  }
  return { shown, hidden }
}
