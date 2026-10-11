import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

// Single demo clinic; real deployments create one org per clinic / health plan.
export const DEMO_ORG_ID = '00000000-0000-4000-8000-00000000a1d0';

let adminClient: SupabaseClient | undefined;

// Service-role client: server only, bypasses RLS. Never send this key to the browser.
export function admin(): SupabaseClient {
  adminClient ??= createClient(env('SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}
