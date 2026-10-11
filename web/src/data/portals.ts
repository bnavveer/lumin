// Websites the agent can apply through. To support a new site, add an entry
// here and list its id in each program's `applyVia`.
//
// Facts come from ../../../research/ (checked 2026-10-11). Fields marked
// `unconfirmed` couldn't be checked on an official page.

export type PortalId = 'benefitscal'

export type Portal = {
  id: PortalId
  name: string
  url: string
  phone?: { number: string; label: string }
  runBy: string
  summary: string
  // How the agent fills out applications here. Only 'manual' exists for now.
  integration: 'manual' | 'api' | 'browser'
  notes?: string[]
}

export const portals: Record<PortalId, Portal> = {
  benefitscal: {
    id: 'benefitscal',
    name: 'BenefitsCal',
    url: 'https://benefitscal.com',
    phone: { number: '1-877-847-3663', label: 'CalFresh Benefits Helpline' },
    runBy: 'California counties and the California Department of Social Services',
    summary: 'One application for CalFresh, Medi-Cal, CalWORKs, General Relief and CFAP. It goes to your county office.',
    integration: 'manual',
    notes: [
      'GetCalFresh.org no longer takes applications. Everything goes through BenefitsCal.',
      'General Relief on BenefitsCal depends on the county (LA County accepts it).',
    ],
  },
}
