import { useState, type ReactNode } from 'react'
import {
  ApplicationTimeline,
  BenefitCard,
  BenefitsTotal,
  DocumentChecklist,
  DocumentDropZone,
  StatusBadge,
  type Benefit,
  type Status,
} from './components/Benefits'
import { Button, IconButton, TextLink } from './components/Button'
import {
  AiDisclaimer,
  AssistantMessage,
  ChatNotice,
  ChatThread,
  ComposerShell,
  ConsentCard,
  QuickReplies,
  SourcesCard,
  TypingIndicator,
  UserMessage,
  type Source,
} from './components/Chat'
import { AskDock, ChatComposer } from './components/ChatComposer'
import { CaliforniaFlag, USFlag } from './components/Flags'
import { Checkbox, ChoiceGroup, SelectField, StepProgress, SummaryList, TextField } from './components/Form'
import { GovBanner, BannerDetails } from './components/GovBanner'
import { Icon } from './components/icons'
import { Logo, RegionChip } from './components/Logo'
import { Accordion, CarouselControls, FeatureCard, Hero, LinkCard, SectionHeading, SiteFooter } from './components/Marketing'
import { Photo, PhotoCredit } from './components/Photo'
import { PortalCard, ProgramCard } from './components/Programs'
import { SiteHeader } from './components/SiteHeader'
import { heroPhotos, photos } from './data/photos'
import { portals } from './data/portals'
import { programs } from './data/programs'

// Gallery of every component. Numbers are sample data from ../research/.

const counties = [
  'Alameda', 'Alpine', 'Amador', 'Butte', 'Calaveras', 'Colusa', 'Contra Costa', 'Del Norte', 'El Dorado', 'Fresno',
  'Glenn', 'Humboldt', 'Imperial', 'Inyo', 'Kern', 'Kings', 'Lake', 'Lassen', 'Los Angeles', 'Madera', 'Marin',
  'Mariposa', 'Mendocino', 'Merced', 'Modoc', 'Mono', 'Monterey', 'Napa', 'Nevada', 'Orange', 'Placer', 'Plumas',
  'Riverside', 'Sacramento', 'San Benito', 'San Bernardino', 'San Diego', 'San Francisco', 'San Joaquin',
  'San Luis Obispo', 'San Mateo', 'Santa Barbara', 'Santa Clara', 'Santa Cruz', 'Shasta', 'Sierra', 'Siskiyou',
  'Solano', 'Sonoma', 'Stanislaus', 'Sutter', 'Tehama', 'Trinity', 'Tulare', 'Tuolumne', 'Ventura', 'Yolo', 'Yuba',
]

const sources: Source[] = [
  { domain: 'cdss.ca.gov', title: 'CalFresh eligibility and how to apply', href: 'https://www.cdss.ca.gov/calfresh' },
  { domain: 'cdss.ca.gov', title: 'CalFresh income limits', href: 'https://www.cdss.ca.gov/inforesources/calfresh/eligibility-and-issuance-requirements' },
  { domain: 'benefitscal.com', title: 'Apply for CalFresh, Medi-Cal and CalWORKs', href: 'https://benefitscal.com' },
]

const benefits: Benefit[] = [
  {
    id: 'calfresh',
    name: 'CalFresh',
    plain: 'Money for groceries on an EBT card.',
    agency: 'County social services · CDSS',
    status: 'likely',
    value: 'Up to $306/mo',
    reason: 'California’s income limit is 200% of the poverty line, higher than most states.',
  },
  {
    id: 'medi-cal',
    name: 'Medi-Cal',
    plain: 'Free or low-cost health coverage.',
    agency: 'County social services · DHCS',
    status: 'likely',
    value: '$0 premium',
    reason: 'Adults qualify up to 138% of the poverty line (about $22,025 a year for 1 person).',
  },
  {
    id: 'care',
    name: 'CARE',
    plain: 'Lower gas and electric rates.',
    agency: 'Your utility (PG&E, SCE, SDG&E…)',
    status: 'likely',
    value: 'Lower bills',
    reason: 'You automatically qualify once you’re on CalFresh or Medi-Cal.',
  },
  {
    id: 'calworks',
    name: 'CalWORKs',
    plain: 'Monthly cash for families with children.',
    agency: 'County social services · CDSS',
    status: 'maybe',
    reason: 'Do any children live with you? We need to know before we can check.',
  },
  {
    id: 'covered-ca',
    name: 'Covered California',
    plain: 'Health plans with help paying the premium.',
    agency: 'Covered California',
    status: 'unlikely',
    reason: 'You’d get Medi-Cal instead, which costs less.',
  },
]

const swatches = [
  { name: 'blue-900 · ink', hex: '#000c1f', className: 'bg-blue-900' },
  { name: 'blue-800 · hover', hex: '#00163b', className: 'bg-blue-800' },
  { name: 'blue-700 · primary', hex: '#002664', className: 'bg-blue-700' },
  { name: 'blue-600 · focus', hex: '#004ac3', className: 'bg-blue-600' },
  { name: 'blue-500 · link', hex: '#0066c5', className: 'bg-blue-500' },
  { name: 'blue-50', hex: '#f1f5fb', className: 'bg-blue-50' },
  { name: 'flag-red', hex: '#e64133', className: 'bg-flag-red' },
  { name: 'flag-blue', hex: '#1d49bb', className: 'bg-flag-blue' },
  { name: 'red-600 · error', hex: '#d80007', className: 'bg-red-600' },
  { name: 'green-600 · success', hex: '#007f26', className: 'bg-green-600' },
  { name: 'page-top', hex: '#f2f3f4', className: 'bg-page-top' },
  { name: 'surface 5%', hex: 'blue-700 @ 5%', className: 'bg-background-tertiary' },
]

function Section({ id, title, note, children }: { id: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-site scroll-mt-8 border-t border-border-tertiary px-6 py-20 max-mobile:px-4">
      <div className="mb-10 flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="type-section-heading">{title}</h2>
        {note && <p className="max-w-md type-body-s text-secondary">{note}</p>}
      </div>
      {children}
    </section>
  )
}

function Specimen({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="mb-3 type-label-s font-medium tracking-normal text-tertiary uppercase">{label}</p>
      {children}
    </div>
  )
}

export default function App() {
  const [household, setHousehold] = useState(['1'])
  const [situation, setSituation] = useState(['working'])
  const [agree, setAgree] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [demo, setDemo] = useState<{ role: 'user' | 'assistant'; text: string }[]>([])
  const [thinking, setThinking] = useState(false)

  function ask(text: string) {
    setDemo((d) => [...d, { role: 'user', text }])
    setThinking(true)
    setTimeout(() => {
      setThinking(false)
      setDemo((d) => [
        ...d,
        {
          role: 'assistant',
          text: 'Thanks. This gallery doesn’t have the AI connected yet, so this is a placeholder reply.',
        },
      ])
    }, 1400)
  }

  return (
    <div className="min-h-dvh pb-32">
      <a
        href="#main"
        className="sr-only rounded-40 bg-background-primary px-4 py-2.5 type-body-m font-medium shadow-elevation-1 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus-ring"
      >
        Skip to main content
      </a>
      <GovBanner />
      <SiteHeader />

      <main id="main">
        <div className="py-20">
          <Hero onSubmit={ask} slides={heroPhotos} />
        </div>

        <Section
          id="programs"
          title="Programs"
          note="The five programs the agent applies for first, all through BenefitsCal. Add more in src/data/programs.ts and src/data/portals.ts."
        >
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
            {programs.map((p) => (
              <ProgramCard key={p.id} program={p} onApply={(prog) => ask(`Apply for ${prog.name} for me`)} />
            ))}
          </div>
          <div className="mt-6 flex flex-col gap-4">
            {Object.values(portals).map((portal) => (
              <PortalCard key={portal.id} portal={portal} programs={programs.filter((p) => p.applyVia.includes(portal.id))} />
            ))}
          </div>
        </Section>

        <Section
          id="photos"
          title="Photos"
          note="Iconic California, with a film-camera look added by web/scripts/vintage.py. All public domain or CC BY. Credit the author where a photo is shown."
        >
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
            {photos.map((p) => (
              <figure key={p.id} className="mb-6 break-inside-avoid">
                <div className="overflow-hidden rounded-32">
                  <Photo photo={p} sizes="(max-width: 640px) 100vw, 33vw" />
                </div>
                <PhotoCredit photo={p} className="mt-2 px-2" />
              </figure>
            ))}
          </div>
        </Section>

        <Section
          id="brand"
          title="Brand"
          note={
            <>
              Tokens copied from america.gov’s stylesheet. The fonts are free stand-ins: Newsreader for Rhymes and Inter
              for Helvetica Now. Edit names and claims in <code>src/brand/brand.ts</code>.
            </>
          }
        >
          <div className="grid gap-12 lg:grid-cols-2">
            <Specimen label="Logo">
              <div className="flex flex-col gap-6 rounded-32 bg-grey-50 p-8">
                <Logo />
                <Logo size="lg" showRegion={false} />
                <div className="flex items-center gap-4">
                  <USFlag width={48} />
                  <CaliforniaFlag width={48} className="ring-1 ring-border-tertiary" />
                  <RegionChip />
                </div>
              </div>
            </Specimen>
            <Specimen label="Color">
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {swatches.map((s) => (
                  <div key={s.name}>
                    <div className={`h-16 rounded-16 ring-1 ring-border-quaternary ${s.className}`} />
                    <p className="mt-1.5 type-label-s font-medium leading-tight">{s.name}</p>
                    <p className="type-label-s leading-tight text-tertiary">{s.hex}</p>
                  </div>
                ))}
              </div>
            </Specimen>
          </div>

          <Specimen label="Type" className="mt-14">
            <div className="flex flex-col gap-6">
              <p className="type-page-heading">Page heading</p>
              <p className="type-section-heading">Section heading, serif</p>
              <p className="type-feature-heading">Feature heading, sans medium</p>
              <p className="type-home-supporting text-secondary">Supporting text under the hero. Gray, 65% ink.</p>
              <p className="type-page-intro max-w-prose text-secondary">
                Page intro. Short paragraphs in a narrow column, the way america.gov/how-it-works reads.
              </p>
              <p className="type-body-m">
                Body. 16px Inter, −0.03em tracking. Links look like <TextLink href="#">this</TextLink>.
              </p>
              <p className="type-label-s text-secondary">Label S. Banner text, captions, metadata.</p>
            </div>
          </Specimen>

          <Specimen label="Corners and elevation" className="mt-14">
            <div className="flex flex-wrap items-end gap-4">
              {[8, 16, 24, 32, 40, 48].map((r) => (
                <div key={r} className="text-center">
                  <div className="size-20 bg-background-tertiary" style={{ borderRadius: r }} />
                  <p className="mt-1.5 type-label-s text-tertiary">{r}px</p>
                </div>
              ))}
              <div className="text-center">
                <div className="size-20 rounded-32 bg-white shadow-elevation-1" />
                <p className="mt-1.5 type-label-s text-tertiary">elevation-1</p>
              </div>
            </div>
          </Specimen>
        </Section>

        <Section id="buttons" title="Buttons">
          <div className="flex flex-col gap-8">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Menu</Button>
              <Button iconRight="arrow-right">Start my application</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline" icon="edit">
                Review first
              </Button>
              <Button variant="ghost">Ghost</Button>
              <Button disabled>Disabled</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <IconButton icon="arrow-right" label="Send" variant="primary" size="lg" />
              <IconButton icon="close" label="Close" size="sm" />
              <IconButton icon="paperclip" label="Attach" variant="ghost" />
              <IconButton icon="mic" label="Voice" variant="ghost" />
              <CarouselControls playing={playing} onTogglePlay={() => setPlaying((p) => !p)} />
            </div>
          </div>
        </Section>

        <Section id="chat" title="Chat" note="How the assistant talks with people. The live demo at the bottom uses a fake reply.">
          <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <ChatThread>
              <UserMessage>I live in Fresno by myself. I work part time and make about $1,600 a month.</UserMessage>
              <AssistantMessage sources={sources}>
                <p>
                  Based on what you told me, you <strong>likely qualify for CalFresh, Medi-Cal and CARE</strong>.
                  CalFresh could give you up to $306 a month for groceries.
                </p>
                <p>A few quick questions so I can fill out your applications:</p>
              </AssistantMessage>
              <div className="rounded-32 border border-border-tertiary p-6">
                <ChoiceGroup
                  legend="How many people live with you, including you?"
                  options={['1', '2', '3', '4', '5+'].map((v) => ({ value: v, label: v }))}
                  value={household}
                  onChange={setHousehold}
                />
              </div>
              <QuickReplies options={['What is CalFresh?', 'Do I need documents?', 'Talk to a person']} />
              <ConsentCard
                program="CalFresh"
                agency="Fresno County"
                fields={[
                  { label: 'Name', value: 'Maria Lopez' },
                  { label: 'Household', value: '1 person' },
                  { label: 'Monthly income', value: '$1,600' },
                  { label: 'Documents', value: '2 pay stubs, California ID' },
                ]}
              />
              <TypingIndicator label="Checking Medi-Cal rules" />
              {demo.map((m, i) =>
                m.role === 'user' ? (
                  <UserMessage key={i}>{m.text}</UserMessage>
                ) : (
                  <AssistantMessage key={i}>
                    <p>{m.text}</p>
                  </AssistantMessage>
                ),
              )}
              {thinking && <TypingIndicator />}
              <div className="flex flex-col gap-3">
                <ChatComposer onSubmit={ask} />
                <AiDisclaimer />
              </div>
            </ChatThread>

            <div className="flex flex-col gap-10">
              <Specimen label="Sources card">
                <SourcesCard sources={sources} onClose={() => {}} />
              </Specimen>
              <Specimen label="Error over composer">
                <ComposerShell
                  notice={
                    <ChatNotice title="Something went wrong." action={<TextLink href="#">Try again</TextLink>} />
                  }
                >
                  <ChatComposer />
                </ComposerShell>
              </Specimen>
              <Specimen label="Notices">
                <div className="flex flex-col gap-5">
                  <ChatNotice tone="success" title="Application sent to Fresno County" />
                  <ChatNotice tone="warning" title="Your interview is in 3 days">
                    The county will call you. Keep your phone nearby.
                  </ChatNotice>
                  <ChatNotice tone="info" title="We saved your progress" />
                </div>
              </Specimen>
              <Specimen label="Dock composer">
                <ChatComposer variant="dock" />
              </Specimen>
            </div>
          </div>
        </Section>

        <Section id="intake" title="Intake form" note="For when people want to fill in a form instead of chatting, and for checking answers before sending.">
          <div className="grid gap-16 lg:grid-cols-2">
            <div className="flex flex-col gap-8">
              <StepProgress steps={['About you', 'Household', 'Income', 'Documents', 'Review']} current={1} />
              <TextField label="Full legal name" defaultValue="Maria Lopez" autoComplete="name" />
              <SelectField
                label="County"
                hint="Your county office handles CalFresh, Medi-Cal and CalWORKs."
                defaultValue="Fresno"
                options={counties.map((c) => ({ value: c, label: c }))}
              />
              <TextField label="Monthly income before taxes" prefix="$" inputMode="decimal" defaultValue="1,600" />
              <TextField label="Phone" type="tel" optional placeholder="(559) 555-0100" />
              <TextField label="Date of birth" error="Enter a date like 04/12/1990" defaultValue="4/12" />
              <ChoiceGroup
                legend="Does any of this apply to you?"
                hint="Pick all that apply."
                multiple
                options={[
                  { value: 'working', label: 'I’m working' },
                  { value: 'pregnant', label: 'Pregnant' },
                  { value: 'kids', label: 'Kids under 18' },
                  { value: 'senior', label: '60 or older' },
                  { value: 'disabled', label: 'Disability' },
                  { value: 'student', label: 'In college' },
                ]}
                value={situation}
                onChange={setSituation}
              />
              <Checkbox
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                label="I agree to let the assistant fill out applications for me"
                description="It will always show you each application and wait for your OK before sending."
              />
              <div className="flex gap-3">
                <Button variant="outline" icon="arrow-left">
                  Back
                </Button>
                <Button iconRight="arrow-right" disabled={!agree}>
                  Continue
                </Button>
              </div>
            </div>
            <Specimen label="Review your answers">
              <SummaryList
                onEdit={() => {}}
                rows={[
                  { key: 'name', label: 'Name', value: 'Maria Lopez' },
                  { key: 'county', label: 'County', value: 'Fresno' },
                  { key: 'household', label: 'Household', value: '1 person' },
                  { key: 'income', label: 'Monthly income', value: '$1,600 (part-time job)' },
                  { key: 'situation', label: 'Situation', value: 'Working' },
                ]}
              />
            </Specimen>
          </div>
        </Section>

        <Section id="benefits" title="Results" note="Sample numbers for 1 person in California, from the research notes. Not an eligibility decision.">
          <BenefitsTotal amount="$306/mo" count={3} note="Plus $0 health coverage and lower energy bills. Estimates only. The county makes the final decision." />
          <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {benefits.map((b) => (
              <BenefitCard
                key={b.id}
                benefit={b}
                action={
                  b.status === 'likely' ? (
                    <Button size="sm" iconRight="arrow-right">
                      Apply for me
                    </Button>
                  ) : b.status === 'maybe' ? (
                    <Button size="sm" variant="outline">
                      Answer 1 question
                    </Button>
                  ) : undefined
                }
              />
            ))}
          </div>
          <Specimen label="Status badges" className="mt-12">
            <div className="flex flex-wrap gap-2">
              {(['likely', 'maybe', 'unlikely', 'drafting', 'submitted', 'action', 'approved', 'denied'] as Status[]).map((s) => (
                <StatusBadge key={s} status={s} />
              ))}
            </div>
          </Specimen>
        </Section>

        <Section id="status" title="Tracking">
          <div className="grid gap-16 lg:grid-cols-3">
            <Specimen label="Application timeline · CalFresh">
              <ApplicationTimeline
                steps={[
                  { label: 'Application sent', date: 'Oct 2', detail: 'Fresno County got it.', state: 'done' },
                  { label: 'Documents received', date: 'Oct 4', state: 'done' },
                  { label: 'Phone interview', date: 'Oct 14', detail: 'The county will call you between 9 and 11 AM.', state: 'current' },
                  { label: 'Decision', detail: 'Usually within 30 days of applying.', state: 'todo' },
                  { label: 'EBT card mailed', state: 'todo' },
                ]}
              />
            </Specimen>
            <Specimen label="Documents to add">
              <DocumentChecklist
                items={[
                  { name: 'Photo ID', why: 'California ID or driver’s license', done: true },
                  { name: 'Last 30 days of pay stubs', why: 'Shows your income', done: true },
                  { name: 'Rent receipt or lease', why: 'Rent can raise your CalFresh amount' },
                  { name: 'Utility bill', why: 'Counts toward your expenses' },
                ]}
              />
            </Specimen>
            <Specimen label="Upload">
              <DocumentDropZone />
            </Specimen>
          </div>
        </Section>

        <Section id="marketing" title="Marketing pages">
          <SectionHeading intro="Instead of filling out a different form for every program, you tell us about your life once. We find what you qualify for and fill out the applications for you.">
            One conversation. Every benefit.
          </SectionHeading>
          <div className="grid gap-x-4 gap-y-14 md:grid-cols-2">
            <FeatureCard
              media={
                <div className="flex flex-col items-center gap-3">
                  <span className="flex size-24 items-center justify-center rounded-full bg-white shadow-elevation-1">
                    <Icon name="document" size={40} />
                  </span>
                </div>
              }
              lead="One application."
            >
              Answer questions once. We reuse your answers for CalFresh, Medi-Cal, CalWORKs and more.
            </FeatureCard>
            <FeatureCard
              media={
                <span className="flex size-28 items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_30%,#5b8cff,#002664)] text-white shadow-elevation-1">
                  <Icon name="arrow-right" size={44} />
                </span>
              }
              lead="You approve everything."
            >
              Nothing is sent until you’ve seen it and said yes.
            </FeatureCard>
            <FeatureCard
              media={
                <span className="flex size-24 items-center justify-center rounded-full bg-white shadow-elevation-1">
                  <Icon name="shield" size={40} />
                </span>
              }
              lead="Private by default."
            >
              Your information goes only to the agencies you apply to.
            </FeatureCard>
            <FeatureCard media={<CaliforniaFlag width={160} className="rounded-8 shadow-elevation-1" />} lead="Built for California.">
              California rules, California programs, your county office.
            </FeatureCard>
          </div>

          <div className="mt-24 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <LinkCard icon={<Icon name="home" />} kicker="BenefitsCal" title="One application for CalFresh, Medi-Cal and CalWORKs" cta="How it works" href="#" />
            <LinkCard icon={<Icon name="shield" />} kicker="Covered California" title="Health plans if you earn too much for Medi-Cal" cta="Learn more" href="#" />
            <LinkCard icon={<Icon name="phone" />} kicker="211 California" title="Free help from a real person, any time" cta="Call 211" href="tel:211" />
            <LinkCard icon={<Icon name="user" />} kicker="Your county" title="Find your county social services office" cta="Find my office" href="#" />
          </div>

          <div className="mt-24">
            <SectionHeading>Frequently asked questions.</SectionHeading>
            <Accordion
              askAnything={ask}
              items={[
                { q: 'Is this free?', a: 'Yes. There is no charge to use it, and the benefits programs are free to apply for.' },
                { q: 'Do I need an account?', a: 'No. You can start without one. You’ll need one to track your applications later.' },
                { q: 'Will applying hurt my immigration case?', a: 'Many benefits don’t count against you. Ask us about your situation, or talk to a free legal aid group.' },
                { q: 'What do you do with my information?', a: 'We only send it to the agencies you choose to apply to.' },
                { q: 'Can I apply for someone else?', a: 'Yes, if they give you permission. Some programs need their signature.' },
              ]}
            />
          </div>

          <Specimen label="Banner explainer" className="mx-auto mt-24 max-w-[27rem]">
            <div className="rounded-40 bg-white p-10 shadow-elevation-1">
              <BannerDetails />
            </div>
          </Specimen>
        </Section>
      </main>

      <SiteFooter
        links={[
          { label: 'How it works', href: '#how' },
          { label: 'Benefits we cover', href: '#benefits' },
          { label: 'Privacy', href: '#privacy' },
          { label: 'Frequently asked questions', href: '#faq' },
          { label: 'Submit feedback', href: '#feedback' },
        ]}
      />
      <AskDock onSubmit={ask} />
    </div>
  )
}
