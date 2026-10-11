import { useState, type FormEvent } from 'react'
import { Button } from '../components/Button'
import { TextField } from '../components/Form'
import { Icon } from '../components/icons'
import { Link, useRouter } from '../site/router'
import { useAuth } from './auth'
import { ApiError } from './api'
import { AccountPage } from './ui'
import { useEffect } from 'react'

// /login and /signup. After auth, go to ?next= (same-site paths only) or /dashboard.

function useAfterAuth() {
  const { navigate, search } = useRouter()
  const { user } = useAuth()
  const next = new URLSearchParams(search).get('next')
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
  useEffect(() => {
    if (user) navigate(target, { replace: true })
  }, [user, navigate, target])
  return target
}

function Shell({ title, intro, children, footer }: { title: string; intro: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <AccountPage>
      <div className="pt-8 max-mobile:pt-2">
        <h1 className="type-section-heading">{title}</h1>
        <p className="mt-4 type-body-m text-secondary">{intro}</p>
        <div className="mt-8">{children}</div>
        <p className="mt-8 type-body-m text-secondary">{footer}</p>
        <p className="mt-6 flex items-start gap-2 type-body-s text-tertiary">
          <Icon name="lock" size={16} className="mt-0.5 shrink-0" />
          Your answers stay private. Aid never submits anything you haven’t reviewed.
        </p>
      </div>
    </AccountPage>
  )
}

function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-16 bg-[#fdf2f3] px-4 py-3 type-body-s text-red-600">
      <Icon name="warning" size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

export function Login() {
  const { signIn } = useAuth()
  const target = useAfterAuth()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    try {
      await signIn(String(f.get('email')).trim(), String(f.get('password')))
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'That email and password don’t match. Check them and try again.' : err instanceof Error ? err.message : 'Could not sign in.')
      setBusy(false)
    }
  }

  return (
    <Shell
      title="Sign in"
      intro="See where your applications stand and pick up the conversation with Aid."
      footer={<>New to Aid? <Link href={`/signup${target === '/dashboard' ? '' : `?next=${encodeURIComponent(target)}`}`} className="rounded-4 text-link underline underline-offset-4 focus-ring">Create an account</Link></>}
    >
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate={false}>
        <TextField label="Email" name="email" type="email" autoComplete="email" required autoFocus />
        <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
        {error && <FormError>{error}</FormError>}
        <Button type="submit" size="lg" disabled={busy} aria-busy={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
      </form>
    </Shell>
  )
}

export function Signup() {
  const { signUp } = useAuth()
  const target = useAfterAuth()
  const [error, setError] = useState<{ message: string; exists?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const password = String(f.get('password'))
    if (password.length < 8) return setError({ message: 'Use at least 8 characters for your password.' })
    const phone = String(f.get('phone') ?? '').trim()
    setBusy(true)
    setError(null)
    try {
      await signUp({
        email: String(f.get('email')).trim(),
        password,
        firstName: String(f.get('firstName') ?? '').trim() || undefined,
        phone: phone || undefined,
      })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError({ message: 'An account with that email already exists.', exists: true })
      else setError({ message: err instanceof Error ? err.message : 'Could not create your account.' })
      setBusy(false)
    }
  }

  return (
    <Shell
      title="Create your account"
      intro="One place to start applications, upload documents and follow every step. It takes a minute."
      footer={<>Already have an account? <Link href="/login" className="rounded-4 text-link underline underline-offset-4 focus-ring">Sign in</Link></>}
    >
      <form onSubmit={submit} className="flex flex-col gap-5">
        <TextField label="First name" name="firstName" autoComplete="given-name" required autoFocus />
        <TextField label="Email" name="email" type="email" autoComplete="email" required />
        <TextField label="Password" name="password" type="password" autoComplete="new-password" minLength={8} required hint="At least 8 characters." />
        <TextField
          label="Mobile phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          optional
          hint="So Aid can text you updates, like when it’s time to sign. Message and data rates may apply."
        />
        {error && (
          <FormError>
            {error.message}{' '}
            {error.exists && <Link href={`/login${target === '/dashboard' ? '' : `?next=${encodeURIComponent(target)}`}`} className="font-medium underline underline-offset-4 focus-ring">Sign in instead</Link>}
          </FormError>
        )}
        <Button type="submit" size="lg" disabled={busy} aria-busy={busy}>{busy ? 'Creating account…' : 'Create account'}</Button>
      </form>
    </Shell>
  )
}
