import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { api } from './api'

// Created lazily from /api/public-config so no keys are baked into the bundle.
// Resolves to null when Supabase isn't configured (demo mode) or the server is down.
let clientPromise: Promise<SupabaseClient | null> | null = null

export function getSupabase(): Promise<SupabaseClient | null> {
  clientPromise ??= api
    .publicConfig()
    .then((cfg) => (cfg.supabaseUrl && cfg.supabasePublishableKey ? createClient(cfg.supabaseUrl, cfg.supabasePublishableKey) : null))
    .catch(() => {
      clientPromise = null // allow a retry after a failed config fetch
      return null
    })
  return clientPromise
}
