import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { brand } from '../brand/brand'
import { cx } from '../components/cx'
import { Icon } from '../components/icons'
import { Link, useRouter } from '../site/router'
import { ApiError } from './api'
import { useAuth } from './auth'
import { AuthField, AuthLayout, authPrimary, authQuiet, PasswordField } from './AuthLayout'

// /login and /signup. After auth, go to ?next= (same-site paths only) or /dashboard.
// Whenever the page's content changes (an error, or the "check your email"
// step), it scrolls back to the top so the person sees what happened.

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

const nextQuery = (target: string) => (target === '/dashboard' ? '' : `?next=${encodeURIComponent(target)}`)

function toTop() {
  scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
}

function FormError({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), [])
  return (
    <p ref={ref} role="alert" className="flex items-start gap-2.5 rounded-16 bg-[#fdf2f3] px-4 py-3 type-body-s text-red-600">
      <Icon name="warning" size={17} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

function Fine() {
  return (
    <p className="mt-6 flex items-start justify-center gap-2 border-t border-[#0e21291a] pt-5 text-center type-label-s leading-normal text-tertiary">
      <Icon name="lock" size={14} className="mt-px shrink-0" />
      <span>
        Your answers stay private. {brand.name} never submits anything you haven’t reviewed. By continuing you agree to our{' '}
        <Link className="rounded-4 underline underline-offset-2 focus-ring" href="/terms">terms</Link> and{' '}
        <Link className="rounded-4 underline underline-offset-2 focus-ring" href="/privacy-policy">privacy policy</Link>.
      </span>
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
      const msg = err instanceof Error ? err.message : ''
      setError(
        /confirm/i.test(msg)
          ? 'Confirm your email first. Open the link we sent you, then sign in.'
          : err instanceof ApiError && err.status === 401
            ? 'That email and password don’t match. Check them and try again.'
            : msg || 'Could not sign in.',
      )
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Welcome back." intro="See where your applications stand and pick up where you left off." photoSlot="login">
      <form onSubmit={submit} className="flex flex-col gap-5">
        {error && <FormError>{error}</FormError>}
        <AuthField label="Email" name="email" type="email" autoComplete="email" inputMode="email" required autoFocus />
        <PasswordField label="Password" name="password" autoComplete="current-password" required />
        <button type="submit" disabled={busy} aria-busy={busy} className={cx(authPrimary, 'mt-2')}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-6 text-center type-body-s text-secondary">
        New to {brand.name}?{' '}
        <Link href={`/signup${nextQuery(target)}`} className="rounded-4 text-link underline underline-offset-4 focus-ring">
          Create an account
        </Link>
      </p>
      <Fine />
    </AuthLayout>
  )
}

export function Signup() {
  const { signUp } = useAuth()
  const target = useAfterAuth()
  const [error, setError] = useState<{ message: string; exists?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  // The result replaces the form: bring the person back to the top to see it.
  useEffect(() => {
    if (sentTo) toTop()
  }, [sentTo])

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const password = String(f.get('password'))
    if (password.length < 8) return setError({ message: 'Use at least 8 characters for your password.' })
    const email = String(f.get('email')).trim()
    const phone = String(f.get('phone') ?? '').trim()
    setBusy(true)
    setError(null)
    try {
      const confirmationRequired = await signUp({
        email,
        password,
        firstName: String(f.get('firstName') ?? '').trim() || undefined,
        phone: phone || undefined,
      })
      // Signed in right away: useAfterAuth moves on. Otherwise show the email step.
      if (confirmationRequired) setSentTo(email)
      setBusy(false)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError({ message: 'An account with that email already exists.', exists: true })
      else setError({ message: err instanceof Error ? err.message : 'Could not create your account.' })
      setBusy(false)
    }
  }

  if (sentTo)
    return (
      <AuthLayout title="Check your email." showPerks={false} photoSlot="email">
        <div className="flex items-start gap-4 rounded-[1.5rem] bg-white p-5 ring-1 ring-[#0e21291a]">
          <span className="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
            <Icon name="mail" size={22} />
            <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-poppy ring-2 ring-white" />
          </span>
          <p className="type-body-m">
            We sent a confirmation link to <span className="font-medium [overflow-wrap:anywhere]">{sentTo}</span>. Open it and you’ll go straight to your dashboard.
          </p>
        </div>
        <p className="mt-4 type-body-s text-secondary">Don’t see it in a few minutes? Check your spam or promotions folder.</p>
        <div className="mt-8 flex flex-col gap-3">
          <Link className={authPrimary} href={`/login${nextQuery(target)}`}>
            I’ve confirmed, sign in
          </Link>
          <button type="button" className={authQuiet} onClick={() => setSentTo(null)}>
            Use a different email
          </button>
        </div>
      </AuthLayout>
    )

  return (
    <AuthLayout
      title="Keep your next steps together."
      intro="One place to start applications, keep your documents and follow every step. It takes a minute."
      photoSlot="signup"
    >
      <form onSubmit={submit} className="flex flex-col gap-5">
        {error && (
          <FormError>
            {error.message}{' '}
            {error.exists && (
              <Link href={`/login${nextQuery(target)}`} className="font-medium underline underline-offset-4 focus-ring">
                Sign in instead
              </Link>
            )}
          </FormError>
        )}
        <AuthField label="First name" name="firstName" autoComplete="given-name" maxLength={80} required autoFocus />
        <AuthField label="Email" name="email" type="email" autoComplete="email" inputMode="email" maxLength={254} required />
        <PasswordField label="Password" name="password" autoComplete="new-password" minLength={8} maxLength={128} required hint="At least 8 characters." />
        <AuthField
          label="Mobile number"
          name="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="(213) 555-0123"
          maxLength={24}
          optional
          hint={`So ${brand.name} can text you updates, like when it’s time to sign. Message and data rates may apply.`}
        />
        <button type="submit" disabled={busy} aria-busy={busy} className={cx(authPrimary, 'mt-2')}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="mt-6 text-center type-body-s text-secondary">
        Already have an account?{' '}
        <Link href={`/login${nextQuery(target)}`} className="rounded-4 text-link underline underline-offset-4 focus-ring">
          Sign in
        </Link>
      </p>
      <Fine />
    </AuthLayout>
  )
}
