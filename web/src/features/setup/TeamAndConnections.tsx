import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { SelectField, TextField } from '../../components/Form'
import { Icon } from '../../components/icons'
import { cx } from '../../components/cx'
import { ErrorNote } from './SettingsFields'
import { errorMessage, setupApi } from './setupApi'
import type { Role, SetupCheck, TeamMember } from './types'

const ROLE_OPTIONS = [
  { value: 'caseworker', label: 'Caseworker (can work cases)' },
  { value: 'admin', label: 'Admin (can also change settings)' },
]

export function InviteForm({ disabled, onInvited }: { disabled?: boolean; onInvited?: (m: TeamMember) => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('caseworker')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string[]>([])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const m = await setupApi.invite(email.trim(), role)
      setSent((s) => [...s, m.email ?? email.trim()])
      setEmail('')
      onInvited?.(m)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-[1fr_16rem]">
        <TextField label="Teammate’s email" type="email" autoComplete="off" required disabled={disabled || busy} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@clinic.org" />
        <SelectField label="Role" value={role} disabled={disabled || busy} onChange={(e) => setRole(e.target.value as Role)} options={ROLE_OPTIONS} />
      </div>
      <ErrorNote message={error} />
      <div aria-live="polite" className="space-y-1">
        {sent.map((s) => (
          <p key={s} className="flex items-center gap-2 type-body-s text-green-600">
            <Icon name="check-circle" size={16} /> Invite sent to {s}
          </p>
        ))}
      </div>
      <Button type="submit" variant="outline" disabled={disabled || busy || !email.includes('@')}>
        {busy ? 'Sending…' : 'Send invite'}
      </Button>
    </form>
  )
}

export function TeamList({ refreshKey, enabled }: { refreshKey?: number; enabled: boolean }) {
  const [team, setTeam] = useState<TeamMember[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setupApi.team().then((t) => !cancelled && setTeam(t)).catch((e) => !cancelled && setError(errorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [refreshKey, enabled])

  if (!enabled) return <p className="type-body-s text-secondary">Only clinic admins can see the full team.</p>
  if (error) return <ErrorNote message={error} />
  if (!team) return <p className="type-body-s text-secondary" role="status">Loading team…</p>
  return (
    <ul className="divide-y divide-border-tertiary">
      {team.map((m) => (
        <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <span className="min-w-0 break-all type-body-m">{m.email ?? 'Unknown user'}</span>
          <span className="flex items-center gap-2 type-body-s">
            <span className="rounded-full bg-background-tertiary px-3 py-1 capitalize">{m.role}</span>
            <span className={cx('rounded-full px-3 py-1', m.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-700')}>
              {m.status === 'active' ? 'Active' : 'Invite pending'}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

export function Connections({ autoLoad = true }: { autoLoad?: boolean }) {
  const [checks, setChecks] = useState<SetupCheck[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setChecks((await setupApi.status()).checks)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (autoLoad) void load()
  }, [autoLoad, load])

  return (
    <div className="space-y-4">
      <ErrorNote message={error} />
      <ul className="grid gap-3 sm:grid-cols-2" aria-busy={loading}>
        {(checks ?? []).map((c) => (
          <li key={c.key} className={cx('rounded-16 border p-4', c.ok ? 'border-green-600/30 bg-green-50' : 'border-amber-700/30 bg-amber-50')}>
            <p className="flex items-center gap-2 type-body-m font-medium">
              <Icon name={c.ok ? 'check-circle' : 'warning'} size={18} className={c.ok ? 'text-green-600' : 'text-amber-700'} />
              <span className="min-w-0">{c.label}</span>
            </p>
            <p className="mt-1 pl-7 type-body-s text-secondary">
              <span className="sr-only">{c.ok ? 'Connected. ' : 'Needs attention. '}</span>
              {c.detail}
            </p>
          </li>
        ))}
      </ul>
      {loading && !checks && <p className="type-body-s text-secondary" role="status">Checking your connections…</p>}
      <Button variant="outline" size="sm" onClick={load} disabled={loading}>
        {loading ? 'Checking…' : 'Re-check'}
      </Button>
    </div>
  )
}
