import { useState, type FormEvent } from 'react'
import { BenefitCard, BenefitsTotal } from '../components/Benefits'
import { Button } from '../components/Button'
import { Checkbox, SelectField, TextField } from '../components/Form'
import { api } from '../lib/api'
import { countyLabel, matchStatus, programLabel, usd } from '../lib/format'
import type { County, ImmigrationStatus, ProgramMatch, ScreenRequest } from '../lib/types'
import { PublicShell } from '../screens/Shell'
import { ErrorCard, Page } from '../screens/ui'

const immigrationOptions: { value: ImmigrationStatus; label: string }[] = [
  { value: 'citizen', label: 'U.S. citizen' },
  { value: 'green_card', label: 'Green card holder' },
  { value: 'humanitarian', label: 'Refugee, asylee or other humanitarian status' },
  { value: 'undocumented', label: 'Undocumented' },
  { value: 'unknown', label: 'I’d rather not say' },
]

type FormState = {
  firstName: string
  county: County
  size: string
  monthlyIncome: string
  childrenUnder18: string
  adultAge: string
  pregnant: boolean
  immigrationStatus: ImmigrationStatus
  childrenAreCitizens: boolean
}

const initial: FormState = {
  firstName: '', county: 'los_angeles', size: '3', monthlyIncome: '1900', childrenUnder18: '2', adultAge: '34',
  pregnant: false, immigrationStatus: 'citizen', childrenAreCitizens: true,
}

function num(v: string): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

export function Screener() {
  const [f, setF] = useState<FormState>(initial)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [busy, setBusy] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [results, setResults] = useState<ProgramMatch[] | null>(null)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }))

  function validate(): ScreenRequest | null {
    const e: typeof errors = {}
    const size = num(f.size), income = num(f.monthlyIncome), kids = num(f.childrenUnder18), age = num(f.adultAge)
    if (!(size >= 1 && size <= 20)) e.size = 'Enter a number from 1 to 20.'
    if (!(income >= 0)) e.monthlyIncome = 'Enter 0 or more.'
    if (!(kids >= 0 && kids < size + 1)) e.childrenUnder18 = 'Enter 0 or more, and fewer than the household size.'
    if (!(age >= 16 && age <= 110)) e.adultAge = 'Enter an age from 16 to 110.'
    setErrors(e)
    if (Object.keys(e).length) return null
    return {
      firstName: f.firstName.trim() || undefined, county: f.county, size, monthlyIncome: income, childrenUnder18: kids,
      pregnant: f.pregnant, adultAge: age, immigrationStatus: f.immigrationStatus, childrenAreCitizens: f.childrenAreCitizens,
    }
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    const body = validate()
    if (!body) return
    setBusy(true)
    setApiError(null)
    try {
      setResults(await api.screen(body))
      requestAnimationFrame(() => document.getElementById('results')?.focus())
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const yearly = (results ?? []).filter((r) => r.status === 'likely').reduce((s, r) => s + (r.estMonthlyValue ?? 0) * 12, 0)
  const likelyCount = (results ?? []).filter((r) => r.status === 'likely').length

  return (
    <PublicShell>
      <Page width="max-w-[56rem]">
        <h1 className="type-page-heading mt-6">What help could your household get?</h1>
        <p className="mt-3 max-w-prose type-page-intro text-secondary">Answer a few questions. Nothing is saved and nothing is submitted. These are estimates, not decisions.</p>

        <form onSubmit={submit} noValidate className="mt-10 grid gap-6 sm:grid-cols-2">
          <TextField label="First name" optional value={f.firstName} onChange={(e) => set('firstName', e.target.value)} autoComplete="given-name" />
          <SelectField label="County" value={f.county} onChange={(e) => set('county', e.target.value as County)} options={(Object.keys(countyLabel) as County[]).map((c) => ({ value: c, label: countyLabel[c] }))} />
          <TextField label="People in your household" type="number" inputMode="numeric" min={1} value={f.size} onChange={(e) => set('size', e.target.value)} error={errors.size} />
          <TextField label="Children under 18" type="number" inputMode="numeric" min={0} value={f.childrenUnder18} onChange={(e) => set('childrenUnder18', e.target.value)} error={errors.childrenUnder18} />
          <TextField label="Household income per month, before taxes" type="number" inputMode="decimal" min={0} prefix="$" value={f.monthlyIncome} onChange={(e) => set('monthlyIncome', e.target.value)} error={errors.monthlyIncome} />
          <TextField label="Your age" type="number" inputMode="numeric" min={16} value={f.adultAge} onChange={(e) => set('adultAge', e.target.value)} error={errors.adultAge} />
          <SelectField label="Immigration status" hint="Some programs depend on this. Applying for your children never hurts their eligibility." value={f.immigrationStatus} onChange={(e) => set('immigrationStatus', e.target.value as ImmigrationStatus)} options={immigrationOptions} className="sm:col-span-2" />
          <Checkbox label="Someone in the household is pregnant" checked={f.pregnant} onChange={(e) => set('pregnant', e.target.checked)} />
          <Checkbox label="Our children are U.S. citizens" checked={f.childrenAreCitizens} onChange={(e) => set('childrenAreCitizens', e.target.checked)} />
          <div className="sm:col-span-2">
            <Button type="submit" size="lg" disabled={busy} iconRight="arrow-right">{busy ? 'Checking…' : 'Check my benefits'}</Button>
          </div>
        </form>

        {apiError && <div className="mt-8"><ErrorCard title="We couldn’t check your benefits" message={apiError} onRetry={() => void submit(new Event('submit') as unknown as FormEvent)} /></div>}

        {results && (
          <section id="results" tabIndex={-1} aria-label="Your results" className="mt-16 outline-none">
            {likelyCount > 0 ? (
              <BenefitsTotal amount={`${usd(yearly)} a year`} count={likelyCount} note="Estimates based on what you told us. The county makes the final decision." />
            ) : (
              <p className="text-center type-body-m text-secondary">Nothing came up as likely this time. Programs below may still apply if your answers change.</p>
            )}
            <ul className="mt-10 grid gap-5 md:grid-cols-2">
              {results.map((r) => (
                <li key={r.program} className="flex">
                  <BenefitCard
                    className="w-full"
                    benefit={{
                      id: r.program, name: programLabel[r.program], plain: r.reason, agency: r.applyVia,
                      status: matchStatus[r.status],
                      value: r.estMonthlyValue ? `About ${usd(r.estMonthlyValue)}/mo` : undefined,
                    }}
                    action={r.docs.length > 0 && r.status !== 'not_eligible' ? (
                      <details className="group">
                        <summary className="cursor-pointer rounded-8 type-body-s font-medium focus-ring">What to bring ({r.docs.length})</summary>
                        <ul className="mt-2 list-disc space-y-1 pl-5 type-body-s text-secondary">{r.docs.map((d) => <li key={d}>{d}</li>)}</ul>
                        <p className="mt-3 type-body-s"><span className="font-medium">How to apply:</span> {r.applyVia}</p>
                      </details>
                    ) : undefined}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </Page>
    </PublicShell>
  )
}
