import type { ReactNode } from 'react'
import { Button } from '../../components/Button'
import { Icon, type IconName } from '../../components/icons'
import { navigate } from '../../lib/router'

export function Band({ id, title, intro, children, tint }: { id: string; title: string; intro?: string; children: ReactNode; tint?: boolean }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={`scroll-mt-20 py-20 max-mobile:py-14 ${tint ? 'bg-grey-50' : ''}`}>
      <div className="mx-auto max-w-site px-6 max-mobile:px-4">
        <h2 id={`${id}-h`} className="type-section-heading max-w-[40rem]">{title}</h2>
        {intro && <p className="mt-4 max-w-[38rem] type-page-intro text-secondary">{intro}</p>}
        <div className="mt-12">{children}</div>
      </div>
    </section>
  )
}

export function Card({ icon, title, children, className = '' }: { icon?: IconName; title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-32 bg-background-tertiary p-6 ${className}`}>
      {icon && <span className="flex size-11 items-center justify-center rounded-12 bg-accent text-on-accent"><Icon name={icon} size={20} /></span>}
      <h3 className={`type-card-title ${icon ? 'mt-5' : ''}`}>{title}</h3>
      <p className="mt-2 type-body-s text-secondary">{children}</p>
    </div>
  )
}

const steps = [
  ['Text', 'Patients text Aid. It asks plain questions and screens them for six California programs.'],
  ['Collect', 'They photograph pay stubs and IDs. Aid reads them, files them in the vault and asks for what is missing.'],
  ['File', 'Aid fills out and submits applications, and phones the county or plan, holding the line until a person answers.'],
  ['Keep covered', 'Autopilot sends interview and renewal reminders so coverage does not lapse.'],
]
export function HowItWorks() {
  return (
    <Band id="how" title="From first text to confirmed coverage" tint>
      <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {steps.map(([t, b], i) => (
          <li key={t} className="rounded-32 bg-white p-6 shadow-soft-sm">
            <span aria-hidden="true" className="font-serif text-4xl leading-none text-accent">{i + 1}</span>
            <h3 className="mt-4 type-card-title">{t}</h3>
            <p className="mt-2 type-body-s text-secondary">{b}</p>
          </li>
        ))}
      </ol>
    </Band>
  )
}

export function Outcomes() {
  const items = [
    ['Days → minutes', 'to submit an application once documents are in'],
    ['~4–5×', 'caseworker capacity per staff member'],
    ['Fewer', 'coverage losses at renewal'],
  ]
  return (
    <section aria-labelledby="outcomes-h" className="bg-blue-900 py-16 text-white">
      <div className="mx-auto max-w-site px-6 max-mobile:px-4">
        <h2 id="outcomes-h" className="sr-only">Expected outcomes</h2>
        <dl className="grid gap-10 md:grid-cols-3">
          {items.map(([big, small]) => (
            <div key={big}>
              <dt className="font-serif text-[clamp(2.5rem,5vw,4rem)] leading-none tracking-[-0.03em]">{big}</dt>
              <dd className="mt-3 type-body-m text-white/75">{small}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-10 type-label-s text-white/60">Pilot estimates from our design partners’ early data and internal modeling. Your results will vary.</p>
      </div>
    </section>
  )
}

export function WhyNow() {
  return (
    <Band id="why" title="Medi-Cal is about to get much more paperwork" intro="Enrollment teams are already stretched. Two changes make manual follow-up unsustainable.">
      <div className="grid gap-5 md:grid-cols-2">
        <Card title="2027 work requirements">Expansion adults will need to document work or qualifying activity to keep Medi-Cal. Every member becomes a documents problem.</Card>
        <Card title="6-month renewals">Renewals move to every six months, so each member has twice as many chances to lose coverage on a missed form or interview.</Card>
      </div>
    </Band>
  )
}

export function Features() {
  const f: [IconName, string, string][] = [
    ['phone', 'SMS and voice agent', 'Patients get answers by text in their language, and Aid makes the phone calls staff dread.'],
    ['clock', 'Autopilot follow-ups, powered by Keewano', 'Keewano decides who needs a nudge, a submission or a renewal start, and the queue shows why.'],
    ['user', 'Hold-and-handoff calls', 'Aid waits on hold with the agency, then transfers to your staff the moment a person picks up.'],
    ['document', 'Document vault', 'Photos are classified, stored per household and attached to the right application.'],
    ['building', 'Staff dashboard', 'Every case, message, call transcript and submission in one live view, with a full audit trail.'],
  ]
  return (
    <Band id="product" title="Everything a caseworker does between visits" intro="Aid handles the repeatable work and tells your team where a human is needed.">
      <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {f.map(([i, t, b]) => <li key={t} className="flex"><Card icon={i} title={t} className="w-full">{b}</Card></li>)}
      </ul>
    </Band>
  )
}

export function Audiences() {
  return (
    <>
      <Band id="clinics" title="For clinics" intro="Stop losing patients to paperwork." tint>
        <ul className="grid gap-5 md:grid-cols-3">
          <li><Card title="Free up your navigators">Aid does intake, screening and chasing documents, so staff spend time on the hard cases.</Card></li>
          <li><Card title="Enroll more patients">Patients apply from their phone, any hour, without a visit.</Card></li>
          <li><Card title="Pay for results">Clinic pricing is per successful enrollment, so you only pay when a patient gets covered.</Card></li>
        </ul>
      </Band>
      <Band id="plans" title="For health plans" intro="Keep members covered, and show it in your numbers.">
        <ul className="grid gap-5 md:grid-cols-3">
          <li><Card title="Retention at renewal">Proactive reminders and filled-out renewals cut procedural disenrollment.</Card></li>
          <li><Card title="Work-requirement support">Collect and track qualifying-activity documents for every member who needs them.</Card></li>
          <li><Card title="Measured outcomes">See time-to-submit, missed interviews and retention by cohort, live.</Card></li>
        </ul>
      </Band>
    </>
  )
}

export function Pricing() {
  const tiers = [
    { name: 'Pilot', price: 'Free', note: 'for 60 days', body: 'Up to a small cohort of patients, full product, weekly check-ins.', cta: 'Start a pilot', href: '/setup', primary: true },
    { name: 'Clinic', price: '$X', note: 'per successful enrollment', body: 'No seat fees. You pay when an application is approved.', cta: 'Start a pilot', href: '/setup' },
    { name: 'Health plan', price: 'Per retained member', note: 'per month', body: 'Priced on members kept covered through renewal.', cta: 'Start a pilot', href: '/setup' },
  ]
  return (
    <Band id="pricing" title="Pricing that follows outcomes" tint>
      <ul className="grid gap-5 md:grid-cols-3">
        {tiers.map((t) => (
          <li key={t.name} className={`flex flex-col rounded-32 p-6 ${t.primary ? 'bg-white ring-2 ring-accent' : 'bg-white shadow-soft-sm'}`}>
            <h3 className="type-card-title">{t.name}</h3>
            <p className="mt-4 font-serif text-[2.25rem] leading-none tracking-[-0.03em]">{t.price}</p>
            <p className="mt-1 type-body-s text-secondary">{t.note}</p>
            <p className="mt-4 type-body-s">{t.body}</p>
            <div className="mt-auto pt-6"><Button variant={t.primary ? 'primary' : 'outline'} onClick={() => navigate(t.href)}>{t.cta}</Button></div>
          </li>
        ))}
      </ul>
      <p className="mt-6 type-body-s text-secondary">Final pricing is set per pilot. <a className="rounded-4 text-link underline underline-offset-[3px] focus-ring" href="mailto:pilot@aid.example">Contact us</a> to talk it through.</p>
    </Band>
  )
}

export function Security() {
  return (
    <Band id="security" title="Built for sensitive records">
      <ul className="grid gap-5 md:grid-cols-3">
        <li><Card icon="lock" title="Org-isolated data">Each organization’s patients, messages and documents are separated at the database level.</Card></li>
        <li><Card icon="shield" title="Encrypted document storage">IDs and pay stubs are stored encrypted and opened only through short-lived links.</Card></li>
        <li><Card icon="user" title="A human signs everything">Aid prepares applications. A person at your organization reviews and signs before anything is filed.</Card></li>
      </ul>
    </Band>
  )
}

export const faqs = [
  { q: 'Is Aid a government service?', a: 'No. Aid is a software company. We sell to clinics, health plans and nonprofits, who use it to help their patients and members apply for benefits.' },
  { q: 'Which programs does Aid cover?', a: 'CalFresh, Medi-Cal, CalWORKs, General Relief, CFAP and Section 8, with county-specific rules for Los Angeles and San Francisco in this prototype.' },
  { q: 'Does Aid submit applications without a person?', a: 'No. Aid prepares everything and a person at your organization reviews and signs before submission.' },
  { q: 'What do patients need?', a: 'A phone that can text and take photos. There is no app and no account.' },
  { q: 'How does the pilot work?', a: 'You get 60 days free with a small cohort. We set up your organization, connect your phone number and measure time to submit and coverage retention against your current process.' },
  { q: 'Is this production software?', a: 'This site is a hackathon prototype running on demo data. Numbers shown are pilot estimates, not guarantees.' },
]
