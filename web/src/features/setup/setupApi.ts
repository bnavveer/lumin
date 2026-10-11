import { getSupabase } from '../../lib/supabase'
import type { County, Org, OrgSettings, Role, SetupCheck, TeamMember } from './types'

export class SetupApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'SetupApiError'
    this.status = status
  }
}

async function token(): Promise<string | null> {
  const sb = await getSupabase()
  if (!sb) return null
  const { data } = await sb.auth.getSession()
  return data.session?.access_token ?? null
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const t = await token()
  if (t) headers.Authorization = `Bearer ${t}`
  let res: Response
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new SetupApiError(0, 'Can’t reach the Aid server. Check your connection and try again.')
  }
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : `Request failed (${res.status})`
    throw new SetupApiError(res.status, msg)
  }
  return data as T
}

export const setupApi = {
  createOrg: (clinicName: string, county: County) => request<Org>('/api/onboarding/org', 'POST', { clinicName, county }),
  getOrg: () => request<Org>('/api/staff/org'),
  saveSettings: (patch: Partial<OrgSettings>) => request<Org>('/api/staff/settings', 'PUT', patch),
  team: () => request<TeamMember[]>('/api/staff/team'),
  invite: (email: string, role: Role) => request<TeamMember>('/api/staff/team/invite', 'POST', { email, role }),
  status: () => request<{ checks: SetupCheck[] }>('/api/staff/setup-status'),
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : 'Something went wrong. Try again.')
