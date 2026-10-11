import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { applicationReadiness, type ApplicationDetails, type HouseholdMember, type Relationship } from '../../../shared/applicationDetails'
import { brand } from '../brand/brand'
import { cx } from '../components/cx'
import { Icon } from '../components/icons'
import { Link } from '../site/router'
import { makeApi } from './api'
import { useAuth } from './auth'
import { authPrimary } from './AuthLayout'
import { AccountPage, ErrorState, RequireAuth, Skeleton, useAsync, useToast } from './ui'

// /account/details: everything a CalFresh / Medi-Cal / CalWORKs application
// needs beyond the screening answers. The chat can fill these in too; this
// page is for reviewing them or answering directly. "Needed" marks what the
// application can't be finished without (shared/applicationDetails.ts).

export function DetailsPage() {
  return (
    <RequireAuth>
      <DetailsView />
    </RequireAuth>
  )
}

type Draft = ApplicationDetails

const relationships: [Relationship, string][] = [
  ['spouse', 'Spouse or partner'],
  ['child', 'Child'],
  ['parent', 'Parent'],
  ['sibling', 'Brother or sister'],
  ['other_relative', 'Other relative'],
  ['unrelated', 'Not related'],
]

function DetailsView() {
  const { getToken } = useAuth()
  const toast = useToast()
  const api = useMemo(() => makeApi(getToken), [getToken])
  const loaded = useAsync(() => Promise.all([api.applicationDetails(), api.screening()]), [api])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (loaded.data && !draft) setDraft(loaded.data[0].details)
  }, [loaded.data, draft])

  const screening = (loaded.data?.[1] ?? {}) as { county?: string; size?: number; monthlyIncome?: number }
  const readiness = draft ? applicationReadiness(draft, screening) : null
  const needed = new Set(readiness?.missing.map((m) => m.field))
  const others = typeof screening.size === 'number' ? Math.max(0, screening.size - 1) : 0

  const set = <K extends keyof Draft>(k: K, v: Draft[K] | undefined) => setDraft((d) => ({ ...(d ?? {}), [k]: v }))
  const setMember = (i: number, k: keyof HouseholdMember, v: string) =>
    setDraft((d) => {
      const members = [...(d?.members ?? [])]
      while (members.length <= i) members.push({ firstName: '', lastName: '', dateOfBirth: '', relationship: '' as Relationship })
      members[i] = { ...members[i], [k]: v }
      return { ...(d ?? {}), members }
    })

  async function save() {
    if (!draft) return
    setBusy(true)
    setError(null)
    const body: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(draft)) body[k] = v === '' || v === undefined ? null : v
    // Only send household members that are filled in; the server checks each one.
    body.members = (draft.members ?? []).slice(0, others).filter((m) => m.firstName && m.lastName && m.dateOfBirth && m.relationship)
    try {
      const res = await api.saveApplicationDetails(body as never)
      setDraft(res.details)
      toast(res.readiness.complete ? 'Saved. Your application details are complete.' : 'Saved.', 'success')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your details.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AccountPage wide>
      <div className="mx-auto max-w-[46rem] pt-6">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 rounded-4 type-body-s text-secondary hover:text-primary focus-ring">
          <Icon name="arrow-left" size={15} />
          Back to your dashboard
        </Link>
        <h1 className="mt-5 font-serif text-[clamp(2.25rem,4vw,3.25rem)] leading-[1.02] tracking-[-0.035em] [font-variation-settings:'opsz'_72]">
          Application details
        </h1>
        <p className="mt-3 type-body-m text-secondary">
          {brand.name} uses these to fill out your CalFresh, Medi-Cal and CalWORKs application. You can also answer them in the chat. You review and sign before anything is sent.
        </p>

        {loaded.error && !loaded.data && <div className="mt-8"><ErrorState message={loaded.error} onRetry={loaded.reload} /></div>}
        {!draft && !loaded.error && <div className="mt-8 grid gap-4"><Skeleton className="h-48" /><Skeleton className="h-64" /></div>}

        {draft && (
          <form
            className="mt-8 flex flex-col gap-5 pb-28"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <Section title="About you">
              <Grid>
                <Field label="Legal first name" needed={needed.has('legalFirstName')} value={draft.legalFirstName} onChange={(v) => set('legalFirstName', v)} autoComplete="given-name" />
                <Field label="Middle name" value={draft.middleName} onChange={(v) => set('middleName', v)} autoComplete="additional-name" optional />
                <Field label="Last name" needed={needed.has('lastName')} value={draft.lastName} onChange={(v) => set('lastName', v)} autoComplete="family-name" />
                <Field label="Date of birth" type="date" needed={needed.has('dateOfBirth')} value={draft.dateOfBirth} onChange={(v) => set('dateOfBirth', v)} autoComplete="bday" max={new Date().toISOString().slice(0, 10)} />
              </Grid>
            </Section>

            <Section title="Your home">
              <Choice
                legend="Do you have a home address?"
                needed={needed.has('homeless')}
                value={draft.homeless === undefined ? undefined : draft.homeless ? 'no' : 'yes'}
                options={[['yes', 'Yes'], ['no', 'No, I’m experiencing homelessness']]}
                onChange={(v) => set('homeless', v === 'no')}
              />
              {draft.homeless === false && (
                <Grid>
                  <Field label="Street address" needed={needed.has('street')} value={draft.street} onChange={(v) => set('street', v)} autoComplete="address-line1" wide />
                  <Field label="Apt or unit" value={draft.apt} onChange={(v) => set('apt', v)} autoComplete="address-line2" optional />
                  <Field label="City" needed={needed.has('city')} value={draft.city} onChange={(v) => set('city', v)} autoComplete="address-level2" />
                  <Field label="ZIP code" needed={needed.has('zip')} value={draft.zip} onChange={(v) => set('zip', v.replace(/\D/g, '').slice(0, 5))} autoComplete="postal-code" inputMode="numeric" />
                </Grid>
              )}
            </Section>

            <Section title="People who live with you">
              {typeof screening.size !== 'number' ? (
                <p className="type-body-s text-secondary">
                  First tell {brand.name} how many people live and eat with you, in the{' '}
                  <Link href="/dashboard?focus=chat" className="rounded-4 text-link underline underline-offset-4 focus-ring">chat</Link>.
                </p>
              ) : others === 0 ? (
                <p className="type-body-s text-secondary">You told {brand.name} you live on your own. If that changed, say so in the chat.</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {Array.from({ length: others }, (_, i) => {
                    const m = draft.members?.[i]
                    return (
                      <li key={i} className="rounded-24 bg-background-tertiary/60 p-4">
                        <p className="mb-3 type-body-s font-medium">Person {i + 2}</p>
                        <Grid>
                          <Field label="First name" needed={needed.has(`members.${i}.firstName`)} value={m?.firstName} onChange={(v) => setMember(i, 'firstName', v)} />
                          <Field label="Last name" needed={needed.has(`members.${i}.firstName`)} value={m?.lastName} onChange={(v) => setMember(i, 'lastName', v)} />
                          <Field label="Date of birth" type="date" needed={needed.has(`members.${i}.dateOfBirth`)} value={m?.dateOfBirth} onChange={(v) => setMember(i, 'dateOfBirth', v)} max={new Date().toISOString().slice(0, 10)} />
                          <Select label="Relationship to you" needed={needed.has(`members.${i}.relationship`)} value={m?.relationship} options={relationships} onChange={(v) => setMember(i, 'relationship', v)} />
                        </Grid>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Section>

            <Section title="Work">
              <Choice
                legend="Does anyone in your household have a job?"
                needed={needed.has('hasJob')}
                value={draft.hasJob === undefined ? undefined : draft.hasJob ? 'yes' : 'no'}
                options={[['yes', 'Yes'], ['no', 'No']]}
                onChange={(v) => set('hasJob', v === 'yes')}
              />
              {draft.hasJob && (
                <Grid>
                  <Field label="Employer" needed={needed.has('employerName')} value={draft.employerName} onChange={(v) => set('employerName', v)} autoComplete="organization" />
                  <Select
                    label="How often you’re paid"
                    needed={needed.has('payFrequency')}
                    value={draft.payFrequency}
                    options={[['weekly', 'Every week'], ['biweekly', 'Every two weeks'], ['semi_monthly', 'Twice a month'], ['monthly', 'Once a month']]}
                    onChange={(v) => set('payFrequency', v as Draft['payFrequency'])}
                  />
                  <Field label="Pay before taxes, each paycheck" type="number" prefix="$" needed={needed.has('grossPay')} value={draft.grossPay?.toString()} onChange={(v) => set('grossPay', v === '' ? undefined : Number(v))} inputMode="decimal" />
                  <Field label="Hours per week" type="number" value={draft.hoursPerWeek?.toString()} onChange={(v) => set('hoursPerWeek', v === '' ? undefined : Number(v))} inputMode="numeric" optional />
                </Grid>
              )}
            </Section>

            <Section title="Housing costs">
              <Grid>
                <Field label="Rent or mortgage per month" type="number" prefix="$" needed={needed.has('rentAmount')} value={draft.rentAmount?.toString()} onChange={(v) => set('rentAmount', v === '' ? undefined : Number(v))} inputMode="decimal" hint="Enter 0 if you don’t pay rent." />
              </Grid>
              <label className="mt-1 flex cursor-pointer items-center gap-3 type-body-s">
                <input type="checkbox" checked={draft.paysUtilities === true} onChange={(e) => set('paysUtilities', e.target.checked)} className="size-5 accent-blue-700" />
                I pay for gas, electric or heating separately
              </label>
            </Section>

            <Section title="Your interview">
              <Choice
                legend="The county interviews everyone who applies. How would you like yours?"
                needed={needed.has('interviewPreference')}
                value={draft.interviewPreference}
                options={[['phone', 'By phone'], ['in_person', 'In person']]}
                onChange={(v) => set('interviewPreference', v as Draft['interviewPreference'])}
              />
            </Section>

            {error && (
              <p role="alert" className="flex gap-2 rounded-16 bg-[#fdf2f3] px-4 py-3 type-body-s text-red-600">
                <Icon name="warning" size={17} className="mt-0.5 shrink-0" />
                {error}
              </p>
            )}

            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#0e21291a] bg-white/90 px-6 py-4 backdrop-blur-xl max-mobile:px-4">
              <div className="mx-auto flex max-w-[46rem] items-center justify-between gap-4">
                <p className="type-body-s text-secondary" aria-live="polite">
                  {readiness?.complete ? (
                    <span className="flex items-center gap-1.5 text-green-600"><Icon name="check-circle" size={17} />Everything the application needs is here.</span>
                  ) : (
                    `${readiness?.missing.length ?? 0} needed ${readiness?.missing.length === 1 ? 'answer' : 'answers'} left`
                  )}
                </p>
                <button type="submit" disabled={busy} className={cx(authPrimary, 'h-12 !w-auto shrink-0 px-10 text-[0.9375rem]')}>
                  {busy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </AccountPage>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[2rem] bg-white p-6 ring-1 ring-[#0e21291a] max-mobile:p-5">
      <h2 className="mb-4 type-card-title">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  )
}

const Grid = ({ children }: { children: ReactNode }) => <div className="grid gap-4 sm:grid-cols-2">{children}</div>

const inputClass =
  'h-13 w-full rounded-16 border bg-white px-4 text-base tracking-tight outline-none transition-[border-color,box-shadow] focus:border-blue-700 focus:shadow-[0_0_0_4px_#0b4a5e1f]'

function Label({ label, needed, optional }: { label: string; needed?: boolean; optional?: boolean }) {
  return (
    <span className="mb-1.5 flex items-baseline justify-between gap-2 type-body-s font-medium">
      {label}
      {needed ? <span className="rounded-full bg-poppy-50 px-2 py-0.5 type-label-s font-medium text-[#b8451a]">Needed</span> : optional ? <span className="font-normal text-tertiary">Optional</span> : null}
    </span>
  )
}

function Field({
  label,
  value,
  onChange,
  needed,
  optional,
  wide,
  prefix,
  hint,
  type = 'text',
  ...rest
}: {
  label: string
  value: string | undefined
  onChange: (v: string) => void
  needed?: boolean
  optional?: boolean
  wide?: boolean
  prefix?: string
  hint?: string
  type?: string
  autoComplete?: string
  inputMode?: 'numeric' | 'decimal' | 'tel' | 'email' | 'text'
  max?: string
}) {
  return (
    <label className={cx('block', wide && 'sm:col-span-2')}>
      <Label label={label} needed={needed} optional={optional} />
      <span className="relative block">
        {prefix && <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-secondary">{prefix}</span>}
        <input
          type={type}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={cx(inputClass, 'h-[3.25rem]', prefix && 'pl-8', needed ? 'border-[#f2741f80]' : 'border-[#0e212933]')}
          {...rest}
        />
      </span>
      {hint && <span className="mt-1.5 block type-label-s leading-normal text-tertiary">{hint}</span>}
    </label>
  )
}

function Select({ label, value, options, onChange, needed }: { label: string; value: string | undefined; options: [string, string][]; onChange: (v: string) => void; needed?: boolean }) {
  return (
    <label className="block">
      <Label label={label} needed={needed} />
      <span className="relative block">
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={cx(inputClass, 'h-[3.25rem] cursor-pointer appearance-none pr-10', needed ? 'border-[#f2741f80]' : 'border-[#0e212933]')}
        >
          <option value="" disabled>
            Choose one
          </option>
          {options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" size={16} className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-secondary" />
      </span>
    </label>
  )
}

function Choice({ legend, value, options, onChange, needed }: { legend: string; value: string | undefined; options: [string, string][]; onChange: (v: string) => void; needed?: boolean }) {
  return (
    <fieldset>
      <legend className="w-full">
        <Label label={legend} needed={needed} />
      </legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map(([v, l]) => (
          <label
            key={v}
            className={cx(
              'flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2.5 type-body-s transition-colors has-[:focus-visible]:shadow-focus',
              value === v ? 'border-blue-700 bg-blue-50 font-medium' : 'border-[#0e212933] hover:border-[#0e212966]',
            )}
          >
            <input type="radio" name={legend} value={v} className="sr-only" checked={value === v} onChange={() => onChange(v)} />
            {value === v && <Icon name="check" size={14} strokeWidth={2.5} className="text-blue-700" />}
            {l}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
