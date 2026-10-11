import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '../components/Button'
import { TextField } from '../components/Form'
import { canViewStaff, useAuth } from '../lib/auth'
import { navigate } from '../lib/router'
import { PublicShell } from '../screens/Shell'
import { Loading, Page } from '../screens/ui'

export function StaffLogin() {
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (auth.ready && canViewStaff(auth)) navigate('/staff')
  }, [auth])

  const showDemo = auth.demoMode || !auth.supabaseAvailable

  async function run(kind: 'password' | 'link', ev: FormEvent) {
    ev.preventDefault()
    setBusy(true)
    setError(null)
    const msg = kind === 'password' ? await auth.signInWithPassword(email, password) : await auth.signInWithMagicLink(email)
    setBusy(false)
    if (msg) setError(msg)
    else if (kind === 'link') setSent(true)
  }

  return (
    <PublicShell>
      <Page width="max-w-[30rem]">
        <h1 className="type-page-heading mt-8">Staff sign in</h1>
        <p className="mt-3 type-body-m text-secondary">For clinic staff who manage Aid cases.</p>
        {!auth.ready ? (
          <div className="mt-8"><Loading label="Loading sign-in" /></div>
        ) : (
          <>
            {auth.supabaseAvailable && (
              <form onSubmit={(e) => void run('password', e)} className="mt-8 flex flex-col gap-5">
                <TextField label="Work email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                {error && <p role="alert" className="type-body-s text-red-600">{error}</p>}
                {sent && <p role="status" className="type-body-s text-green-600">Check your email for a sign-in link.</p>}
                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={busy || !email || !password}>Sign in</Button>
                  <Button variant="outline" disabled={busy || !email} onClick={(e) => void run('link', e as unknown as FormEvent)}>Email me a link</Button>
                </div>
              </form>
            )}
            {!auth.supabaseAvailable && (
              <p role="status" className="mt-8 rounded-24 bg-amber-50 p-4 type-body-s text-amber-700">
                {auth.configError ? 'Can’t reach the Aid server, so sign-in is unavailable.' : 'Sign-in isn’t set up on this server.'} You can still look around in demo mode.
              </p>
            )}
            {showDemo && (
              <div className="mt-8 border-t border-border-tertiary pt-6">
                <Button variant={auth.supabaseAvailable ? 'secondary' : 'primary'} onClick={() => { auth.continueInDemo(); navigate('/staff') }}>Continue in demo mode</Button>
                <p className="mt-2 type-body-s text-secondary">Uses sample data. No account needed.</p>
              </div>
            )}
          </>
        )}
      </Page>
    </PublicShell>
  )
}
