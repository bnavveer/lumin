import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { PublicConfig } from '../lib/types'

// Lazy Supabase client. The URL and publishable key come from the server
// (GET /api/public-config) so the web bundle holds no environment values.

let client: Promise<SupabaseClient> | null = null

export function getSupabase(): Promise<SupabaseClient> {
  client ??= fetch('/api/public-config')
    .then((r) => {
      if (!r.ok) throw new Error(`public-config ${r.status}`)
      return r.json() as Promise<PublicConfig>
    })
    .then((cfg) => {
      if (!cfg.supabaseUrl || !cfg.supabasePublishableKey) throw new Error('Sign-in is not configured on this server.')
      return createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      })
    })
    .catch((e) => {
      client = null // allow a retry
      throw e
    })
  return client
}
