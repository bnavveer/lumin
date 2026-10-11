import { useState, type FormEvent } from 'react'
import type { Me } from '../../../shared/workflow'
import { cx } from '../components/cx'
import { Icon } from '../components/icons'
import { useRouter } from '../site/router'
import type { Api } from './api'
import { useAuth } from './auth'
import { AuthField, PasswordField, authPrimary, authQuiet } from './AuthLayout'
import { Skeleton, useToast } from './ui'

// Contact details. Once a name and phone are saved they're locked: they're
// what the application and the county use to reach the person. Changing them
// takes a deliberate step and the account password (the server re-checks it).
// Empty fields can be filled in without a password.

const fmtPhone = (p: string | null) => {
  const d = (p ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p ?? ''
}

export function ContactCard({ me, loading, email, api, onSaved }: { me: Me | null; loading: boolean; email: string; api: Api; onSaved: () => void }) {
  const { signOut } = useAuth()
  const { navigate } = useRouter()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading && !me) return <Skeleton className="h-44" />
  const locked = Boolean(me?.contactLocked ?? (me?.firstName && me?.phone))
  const missing = !me?.firstName || !me?.phone

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const firstName = String(f.get('firstName') ?? '').trim()
    const phone = String(f.get('phone') ?? '').trim()
    const currentPassword = String(f.get('currentPassword') ?? '')
    setBusy(true)
    setError(null)
    try {
      await api.updateProfile({
        ...(firstName && firstName !== me?.firstName ? { firstName } : {}),
        ...(phone && phone !== me?.phone && phone !== fmtPhone(me?.phone ?? null) ? { phone } : {}),
        ...(currentPassword ? { currentPassword } : {}),
      })
      onSaved()
      setEditing(false)
      toast('Contact details saved.', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your contact details.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="contact-title" className="rounded-[2rem] bg-white p-6 ring-1 ring-[#0e21291a] max-mobile:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="contact-title" className="flex items-center gap-2 type-card-title">
          Contact details
          {locked && !editing && (
            <span className="inline-flex items-center gap-1 rounded-full bg-background-tertiary px-2 py-0.5 type-label-s font-medium text-secondary">
              <Icon name="lock" size={12} />
              Saved
            </span>
          )}
        </h2>
        {!editing && (locked || !missing) && (
          <button type="button" onClick={() => setEditing(true)} className="cursor-pointer rounded-4 type-body-s text-link underline underline-offset-4 focus-ring">
            Request a change
          </button>
        )}
      </div>

      {!editing && !missing ? (
        <dl className="mt-4 grid gap-3 type-body-s">
          <Row label="Name" value={me?.firstName ?? ''} />
          <Row label="Mobile" value={fmtPhone(me?.phone ?? null)} />
          <Row label="Email" value={email} />
        </dl>
      ) : (
        <form onSubmit={save} className="mt-4 flex flex-col gap-4">
          {editing && locked && (
            <p className="flex gap-2 rounded-16 bg-amber-50 px-4 py-3 type-body-s text-amber-700">
              <Icon name="info" size={17} className="mt-0.5 shrink-0" />
              Your applications use these details. To change them, confirm it’s you with your password.
            </p>
          )}
          <AuthField label="First name" name="firstName" defaultValue={me?.firstName ?? ''} autoComplete="given-name" maxLength={80} required={!me?.firstName} />
          <AuthField label="Mobile number" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={fmtPhone(me?.phone ?? null)} placeholder="(213) 555-0123" maxLength={24} required={!me?.phone} />
          {editing && locked && <PasswordField label="Your password" name="currentPassword" autoComplete="current-password" required />}
          {error && (
            <p role="alert" className="flex gap-2 type-body-s text-red-600">
              <Icon name="warning" size={16} className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button type="submit" disabled={busy} className={cx(authPrimary, 'h-12 min-w-0 flex-1 text-[0.9375rem]')}>
              {busy ? 'Saving…' : editing && locked ? 'Confirm and save' : 'Save contact details'}
            </button>
            {editing && (
              <button type="button" onClick={() => { setEditing(false); setError(null) }} className={cx(authQuiet, 'h-12 flex-1 text-[0.9375rem]')}>
                Cancel
              </button>
            )}
          </div>
          <p className="type-label-s leading-normal text-tertiary">Once saved, these are locked so your applications stay consistent.</p>
        </form>
      )}

      <div className="mt-5 border-t border-[#0e21291a] pt-4">
        <button
          type="button"
          onClick={async () => {
            await signOut()
            navigate('/')
          }}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-4 type-body-s text-secondary hover:text-primary focus-ring"
        >
          Sign out
        </button>
      </div>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-secondary">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{value || '—'}</dd>
    </div>
  )
}
