import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase } from './supabase'
import { ApiError } from './api'
import { fixturesOn } from './fixtureFlag'

type SignUpInput = { email: string; password: string; firstName?: string; phone?: string }

type AuthValue = {
  session: Session | null
  user: Pick<User, 'id' | 'email'> | null
  loading: boolean
  getToken: () => Promise<string | null>
  signUp: (input: SignUpInput) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

const FIXTURE_USER = { id: 'fixture-user', email: 'maria@example.com' }

export function AuthProvider({ children }: { children: ReactNode }) {
  const fixtures = fixturesOn()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(!fixtures)

  useEffect(() => {
    if (fixtures) return
    let off: (() => void) | undefined
    let live = true
    getSupabase()
      .then(async (sb) => {
        const { data } = await sb.auth.getSession()
        if (!live) return
        setSession(data.session)
        setLoading(false)
        const sub = sb.auth.onAuthStateChange((_e, s) => setSession(s))
        off = () => sub.data.subscription.unsubscribe()
      })
      .catch(() => live && setLoading(false))
    return () => {
      live = false
      off?.()
    }
  }, [fixtures])

  const getToken = useCallback(async () => {
    if (fixtures) return 'fixture-token'
    const sb = await getSupabase()
    const { data } = await sb.auth.getSession()
    return data.session?.access_token ?? null
  }, [fixtures])

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = await getSupabase()
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (error) throw new ApiError(401, error.message)
  }, [])

  const signUp = useCallback(
    async (input: SignUpInput) => {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new ApiError(res.status, body?.error ?? 'Could not create your account.')
      }
      await signIn(input.email, input.password)
    },
    [signIn],
  )

  const signOut = useCallback(async () => {
    const sb = await getSupabase()
    await sb.auth.signOut()
    setSession(null)
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: fixtures ? FIXTURE_USER : session?.user ? { id: session.user.id, email: session.user.email } : null,
      loading,
      getToken,
      signUp,
      signIn,
      signOut: fixtures ? async () => {} : signOut,
    }),
    [fixtures, session, loading, getToken, signUp, signIn, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const v = useContext(AuthContext)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
