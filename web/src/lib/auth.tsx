import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { api, setTokenGetter } from './api'
import { getSupabase } from './supabase'

type AuthState = {
  ready: boolean
  session: Session | null
  demoMode: boolean // server allows no-auth requests
  supabaseAvailable: boolean
  configError: boolean // /api/public-config unreachable
  inDemo: boolean // user chose "Continue in demo mode"
  signInWithPassword: (email: string, password: string) => Promise<string | null>
  signInWithMagicLink: (email: string) => Promise<string | null>
  signOut: () => Promise<void>
  continueInDemo: () => void
}

const AuthContext = createContext<AuthState | null>(null)
const DEMO_KEY = 'aid.demo'

function readDemo(): boolean {
  try {
    return sessionStorage.getItem(DEMO_KEY) === '1'
  } catch {
    return false
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [demoMode, setDemoMode] = useState(false)
  const [supabaseAvailable, setSupabaseAvailable] = useState(false)
  const [configError, setConfigError] = useState(false)
  const [inDemo, setInDemo] = useState(readDemo)

  useEffect(() => {
    let unsub: (() => void) | undefined
    let cancelled = false
    ;(async () => {
      try {
        const cfg = await api.publicConfig()
        if (!cancelled) setDemoMode(cfg.demoMode)
      } catch {
        if (!cancelled) setConfigError(true) // server down: screens show their own error cards
      }
      const sb = await getSupabase()
      if (sb && !cancelled) {
        setSupabaseAvailable(true)
        const { data } = await sb.auth.getSession()
        if (!cancelled) setSession(data.session)
        const sub = sb.auth.onAuthStateChange((_e, s) => setSession(s))
        unsub = () => sub.data.subscription.unsubscribe()
      }
      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
      unsub?.()
    }
  }, [])

  useEffect(() => {
    setTokenGetter(async () => {
      const sb = await getSupabase()
      if (!sb) return null
      const { data } = await sb.auth.getSession()
      return data.session?.access_token ?? null
    })
  }, [])

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const sb = await getSupabase()
    if (!sb) return 'Sign-in isn’t available right now.'
    const { error } = await sb.auth.signInWithPassword({ email, password })
    return error ? error.message : null
  }, [])

  const signInWithMagicLink = useCallback(async (email: string) => {
    const sb = await getSupabase()
    if (!sb) return 'Sign-in isn’t available right now.'
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/#/staff` },
    })
    return error ? error.message : null
  }, [])

  const signOut = useCallback(async () => {
    const sb = await getSupabase()
    await sb?.auth.signOut()
    try {
      sessionStorage.removeItem(DEMO_KEY)
    } catch {
      /* ignore */
    }
    setInDemo(false)
    setSession(null)
  }, [])

  const continueInDemo = useCallback(() => {
    try {
      sessionStorage.setItem(DEMO_KEY, '1')
    } catch {
      /* ignore */
    }
    setInDemo(true)
  }, [])

  const value = useMemo(
    () => ({ ready, session, demoMode, supabaseAvailable, configError, inDemo, signInWithPassword, signInWithMagicLink, signOut, continueInDemo }),
    [ready, session, demoMode, supabaseAvailable, configError, inDemo, signInWithPassword, signInWithMagicLink, signOut, continueInDemo],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

// True when staff screens may load: signed in, or demo mode chosen.
export function canViewStaff(a: AuthState): boolean {
  return !!a.session || ((a.demoMode || a.configError) && a.inDemo)
}
