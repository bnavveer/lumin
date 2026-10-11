import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { SelectField, TextField } from '../../components/Form'
import { Icon } from '../../components/icons'
import { Logo } from '../../components/Logo'
import { cx } from '../../components/cx'
import { useAuth } from '../../lib/auth'
import { getSupabase } from '../../lib/supabase'
import { AutopilotFields, ErrorNote, ProgramFields } from './SettingsFields'
import { Connections, InviteForm } from './TeamAndConnections'
import { errorMessage, setupApi, SetupApiError } from './setupApi'
import { DEFAULT_SETTINGS, type County, type Org, type OrgSettings } from './types'

const STEPS = ['Create your account', 'Your clinic', 'Your Aid number', 'Autopilot rules', 'Invite your team', 'Connections', 'You’re live'] as const
const COUNTY_OPTIONS = [
  { value: 'los_angeles', label: 'Los Angeles County (live)' },
  { value: 'san_francisco', label: 'San Francisco (beta)' },
]

function Rail({ current }: { current: number }) {
  return (
    <nav aria-label="Setup progress" className="lg:sticky lg:top-8">
      <p className="mb-3 type-body-s text-secondary lg:hidden">
        Step {current + 1} of {STEPS.length}: <span className="font-medium text-primary">{STEPS[current]}</span>
      </p>
      <ol className="flex gap-1.5 lg:flex-col lg:gap-1">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === current ? 'step' : undefined} className="flex-1 lg:flex-none">
            <span className={cx('block h-1.5 rounded-full lg:hidden', i < current ? 'bg-blue-700' : i === current ? 'bg-blue-600/60' : 'bg-background-secondary')} />
            <span className={cx('hidden items-center gap-3 rounded-12 px-3 py-2 type-body-m lg:flex', i === current && 'bg-background-tertiary font-medium')}>
              <span className={cx('flex size-6 items-center justify-center rounded-full text-xs', i < current ? 'bg-blue-700 text-white' : 'border border-border-secondary text-secondary')}>
                {i < current ? <Icon name="check" size={14} strokeWidth={2.5} /> : i + 1}
              </span>
              <span className={i > current ? 'text-secondary' : ''}>{s}</span>
            </span>
            <span className="sr-only">{s}{i < current ? ' (done)' : ''}</span>
          </li>
        ))}
      </ol>
    </nav>
  )
}

function Panel({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="type-section-heading" tabIndex={-1} id="step-heading">{title}</h1>
      <p className="mt-2 mb-7 type-body-m text-secondary">{intro}</p>
      {children}
    </div>
  )
}

function AccountStep({ onDone }: { onDone: () => void }) {
  const { supabaseAvailable } = useAuth()
  const [mode, setMode] = useState<'signup' | 'signin'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkEmail, setCheckEmail] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const sb = await getSupabase()
      if (!sb) throw new Error('Sign-up isn’t available right now. Try again in a minute.')
      if (mode === 'signup') {
        const { data, error: err } = await sb.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${window.location.origin}/#/setup` } })
        if (err) throw err
        if (!data.session) return setCheckEmail(true) // email confirmation is required
      } else {
        const { error: err } = await sb.auth.signInWithPassword({ email: email.trim(), password })
        if (err) throw err
      }
      onDone()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (checkEmail)
    return (
      <Panel title="Check your email" intro={`We sent a confirmation link to ${email}. Open it, then come back to this tab and sign in to continue.`}>
        <Button variant="outline" onClick={() => { setCheckEmail(false); setMode('signin') }}>I’ve confirmed, sign me in</Button>
      </Panel>
    )

  return (
    <Panel title={mode === 'signup' ? 'Start your Aid pilot' : 'Welcome back'} intro={mode === 'signup' ? 'Create your account. Setup takes about five minutes.' : 'Sign in to pick up where you left off.'}>
      <form onSubmit={submit} className="max-w-md space-y-5" noValidate>
        <TextField label="Work email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} hint={mode === 'signup' ? 'At least 8 characters.' : undefined} />
        <ErrorNote message={error ?? (supabaseAvailable ? null : 'Sign-up is not configured on this server yet.')} />
        <Button type="submit" size="lg" disabled={busy || !email.includes('@') || password.length < 8} iconRight="arrow-right">
          {busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </Button>
      </form>
      <button type="button" className="mt-6 cursor-pointer rounded-4 type-body-s text-link underline underline-offset-[3px] focus-ring" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(null) }}>
        {mode === 'signup' ? 'I already have an account' : 'Create a new account instead'}
      </button>
    </Panel>
  )
}

function ClinicStep({ initial, onDone }: { initial: Org | null; onDone: (o: Org) => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [county, setCounty] = useState<County>(initial?.county ?? 'los_angeles')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (initial) return onDone(initial) // workspace already exists
    setBusy(true)
    setError(null)
    try {
      onDone(await setupApi.createOrg(name.trim(), county))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  const valid = name.trim().length >= 2

  return (
    <Panel title="Tell us about your clinic" intro="This creates your workspace. Patients’ cases and your team live here.">
      <form onSubmit={submit} className="max-w-md space-y-5" noValidate>
        <TextField label="Clinic or plan name" required maxLength={120} disabled={!!initial} value={name} onChange={(e) => setName(e.target.value)} placeholder="Eastside Community Health" />
        <SelectField label="County" value={county} disabled={!!initial} onChange={(e) => setCounty(e.target.value as County)} options={COUNTY_OPTIONS} hint={county === 'san_francisco' ? 'San Francisco is in beta: screening works, county filing is manual.' : undefined} />
        <ErrorNote message={error} />
        <Button type="submit" size="lg" disabled={busy || !valid} iconRight="arrow-right">{busy ? 'Creating…' : initial ? 'Continue' : 'Create workspace'}</Button>
      </form>
    </Panel>
  )
}

function NumberStep({ org, onNext }: { org: Org; onNext: () => void }) {
  const [copied, setCopied] = useState(false)
  const number = org.aidPhone ?? '(213) …'
  const poster = `Need help with food, health or housing benefits? Text AID to ${number}. Free, private, and in your language.`
  async function copy() {
    try {
      await navigator.clipboard.writeText(poster)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <Panel title="Your Aid number" intro="Patients text this number to start. Aid screens them, collects documents by photo, and keeps your team in the loop.">
      <div className="max-w-xl space-y-6">
        <div className="rounded-24 bg-blue-700 p-6 text-white">
          <p className="type-body-s text-white/75">Patients text</p>
          <p className="mt-1 font-serif text-4xl tracking-tight">{org.aidPhone ?? 'Number coming soon'}</p>
          {!org.aidPhone && <p className="mt-2 type-body-s text-white/75">We’ll provision a local number for your pilot. You don’t need to do anything.</p>}
        </div>
        <figure className="rounded-16 border border-dashed border-border-secondary p-5">
          <figcaption className="mb-2 type-body-s text-secondary">Sample poster text</figcaption>
          <blockquote className="type-body-m">{poster}</blockquote>
          <Button className="mt-4" variant="outline" size="sm" icon="document" onClick={copy}>Copy text</Button>
          <span role="status" className="ml-3 type-body-s text-green-600">{copied ? 'Copied' : ''}</span>
        </figure>
        <Button size="lg" iconRight="arrow-right" onClick={onNext}>Continue</Button>
      </div>
    </Panel>
  )
}

function RulesStep({ org, onDone }: { org: Org; onDone: (o: Org) => void }) {
  const [settings, setSettings] = useState<OrgSettings>(org.settings ?? DEFAULT_SETTINGS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function save() {
    setBusy(true)
    setError(null)
    try {
      onDone(await setupApi.saveSettings(settings))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel title="Set Aid’s autopilot rules" intro="Choose what Aid may do without asking. You can change any of this later in Settings.">
      <div className="max-w-2xl space-y-8">
        <AutopilotFields value={settings} onChange={setSettings} />
        <div>
          <h2 className="mb-3 type-body-m font-medium">Programs to screen for</h2>
          <ProgramFields value={settings} onChange={setSettings} />
        </div>
        <ErrorNote message={error} />
        <Button size="lg" iconRight="arrow-right" disabled={busy || settings.programs.length === 0} onClick={save}>{busy ? 'Saving…' : 'Save and continue'}</Button>
      </div>
    </Panel>
  )
}

export default function SetupWizard() {
  const { ready, session } = useAuth()
  const [step, setStep] = useState(0)
  const [org, setOrg] = useState<Org | null>(null)
  const [boot, setBoot] = useState<'loading' | 'ready'>('loading')
  const [bootError, setBootError] = useState<string | null>(null)

  // Resume: signed in with a workspace -> number step; signed in without -> clinic step.
  useEffect(() => {
    if (!ready) return
    if (!session) {
      setStep(0)
      return setBoot('ready')
    }
    let cancelled = false
    setupApi
      .getOrg()
      .then((o) => { if (!cancelled) { setOrg(o); setStep((s) => (s < 2 ? 2 : s)) } })
      .catch((e) => {
        if (cancelled) return
        if (e instanceof SetupApiError && e.status === 403) setStep((s) => (s < 1 ? 1 : s))
        else setBootError(errorMessage(e))
      })
      .finally(() => !cancelled && setBoot('ready'))
    return () => { cancelled = true }
  }, [ready, session])

  useEffect(() => {
    document.getElementById('step-heading')?.focus({ preventScroll: true })
  }, [step, boot])

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1))

  return (
    <div className="min-h-dvh overflow-x-hidden bg-background-primary">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
        <Logo showRegion={false} />
        <a href="#/staff" className="rounded-8 type-body-s text-secondary underline underline-offset-[3px] focus-ring">Exit setup</a>
      </header>
      <main className="mx-auto grid max-w-6xl gap-8 px-4 pt-4 pb-20 sm:px-8 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-14">
        <Rail current={step} />
        <div className="min-w-0 [&_#step-heading]:outline-none">
          {boot === 'loading' ? (
            <p role="status" className="type-body-m text-secondary">Loading…</p>
          ) : (
            <>
              <ErrorNote message={bootError} className="mb-6" />
              {step === 0 && <AccountStep onDone={() => setStep(1)} />}
              {step === 1 && <ClinicStep initial={org} onDone={(o) => { setOrg(o); next() }} />}
              {step === 2 && org && <NumberStep org={org} onNext={next} />}
              {step === 3 && org && <RulesStep org={org} onDone={(o) => { setOrg(o); next() }} />}
              {step === 4 && (
                <Panel title="Invite your team" intro="Caseworkers get an email invite. You can skip this and add people later in Settings.">
                  <div className="max-w-2xl space-y-8">
                    <InviteForm />
                    <Button size="lg" iconRight="arrow-right" onClick={next}>Continue</Button>
                  </div>
                </Panel>
              )}
              {step === 5 && (
                <Panel title="Check your connections" intro="Aid works with these services. Amber means something still needs setting up; you can finish now and fix it later.">
                  <div className="max-w-3xl space-y-8">
                    <Connections />
                    <Button size="lg" iconRight="arrow-right" onClick={next}>Continue</Button>
                  </div>
                </Panel>
              )}
              {step === 6 && (
                <Panel title={`${org?.name ?? 'Your clinic'} is live`} intro="Aid is ready to take its first patient. Your dashboard shows every case, call and nudge as it happens.">
                  <Button size="lg" iconRight="arrow-right" onClick={() => { window.location.hash = '/staff' }}>Open your dashboard</Button>
                </Panel>
              )}
              {step > 0 && step < 6 && (
                <button type="button" onClick={() => setStep((s) => Math.max(s - 1, 1))} className="mt-8 inline-flex cursor-pointer items-center gap-1.5 rounded-4 type-body-s text-secondary focus-ring">
                  <Icon name="arrow-left" size={16} /> Back
                </button>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
