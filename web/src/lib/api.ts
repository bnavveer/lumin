import type {
  ApiError,
  AskResponse,
  AutopilotState,
  CaseDetail,
  CaseSummary,
  CountyApplications,
  ProgramMatch,
  PublicConfig,
  ScreenRequest,
  TimeSavedMetrics,
} from './types'

export class ApiRequestError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

// Set by AuthProvider so every request can attach the current access token.
let tokenGetter: () => Promise<string | null> = async () => null
export function setTokenGetter(fn: () => Promise<string | null>) {
  tokenGetter = fn
}

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  const token = await tokenGetter().catch(() => null)
  if (token) headers.Authorization = `Bearer ${token}`
  let res: Response
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new ApiRequestError(0, 'Can’t reach the Aid server. Check your connection and try again.')
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const j = (await res.json()) as Partial<ApiError>
      if (j.error) message = j.error
    } catch {
      /* non-JSON error body */
    }
    throw new ApiRequestError(res.status, message)
  }
  try {
    return (await res.json()) as T
  } catch {
    throw new ApiRequestError(res.status, 'The server sent a response Aid could not read.')
  }
}

export const api = {
  publicConfig: () => request<PublicConfig>('/api/public-config'),
  cases: () => request<CaseSummary[]>('/api/staff/cases'),
  caseDetail: (id: string) => request<CaseDetail>(`/api/staff/cases/${encodeURIComponent(id)}`),
  autopilot: () => request<AutopilotState>('/api/staff/autopilot'),
  ask: (q: string) => request<AskResponse>('/api/staff/ask', { method: 'POST', body: { q } }),
  metrics: () => request<TimeSavedMetrics>('/api/staff/metrics'),
  screen: (req: ScreenRequest) => request<ProgramMatch[]>('/api/screen', { method: 'POST', body: req }),
  countyApplications: () => request<CountyApplications>('/api/county/applications'),
}
