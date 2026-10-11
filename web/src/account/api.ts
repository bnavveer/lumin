import type { ApplicationProgram, ApplicationScreening } from '../../../shared/chat'
import type { CreateWorkflowRequest, FillTarget, LiveViewResponse, Me, Workflow, WorkflowSummary } from '../../../shared/workflow'
import type { ApplicationDetails, ApplicationDetailsResponse } from '../../../shared/applicationDetails'
import { fixturesOn } from './fixtureFlag'
import * as fx from './fixtures'

/** A file in the person's private document vault (GET /api/me/documents). */
export type AccountDocument = { id: string; docType: string; fileName: string; sizeBytes: number; status: string; createdAt: string; workflowId?: string | null }

// Typed client for the routes listed in shared/workflow.ts.
// Every call carries `Authorization: Bearer <supabase access token>`.

// Demo-only: which site the next workflow fills. Set by the Program picker, read by createWorkflow,
// so callers that only pass (programs, chatSessionId) keep working.
let fillTarget: FillTarget = 'mock'
export const setFillTarget = (t: FillTarget) => { fillTarget = t }

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export type TokenGetter = () => Promise<string | null>

export async function request<T>(getToken: TokenGetter, path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('authorization', `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData)) headers.set('content-type', 'application/json')
  let res: Response
  try {
    res = await fetch(path, { ...init, headers })
  } catch {
    throw new ApiError(0, 'Could not reach Lumin. Check your connection and try again.')
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(res.status, body?.error ?? `Something went wrong (${res.status}).`)
  }
  return (await res.json()) as T
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

export interface Api {
  me(): Promise<Me>
  updateProfile(p: { firstName?: string | null; phone?: string | null; currentPassword?: string }): Promise<Me>
  screening(): Promise<Record<string, unknown>>
  applicationDetails(): Promise<ApplicationDetailsResponse>
  saveApplicationDetails(d: { [K in keyof ApplicationDetails]?: ApplicationDetails[K] | null }): Promise<ApplicationDetailsResponse>
  documents(): Promise<AccountDocument[]>
  uploadAccountDocument(file: File, docType: string): Promise<AccountDocument>
  downloadDocument(id: string): Promise<{ url: string; expiresIn: number }>
  deleteDocument(id: string): Promise<{ ok: true }>
  suggestions(chatSessionId?: string): Promise<ApplicationScreening>
  listWorkflows(): Promise<WorkflowSummary[]>
  createWorkflow(programs: ApplicationProgram[], chatSessionId?: string, target?: FillTarget): Promise<Workflow>
  getWorkflow(id: string): Promise<Workflow>
  uploadDocument(id: string, file: File, docType: string): Promise<Workflow>
  approve(id: string, stepId: string, decision: 'approve' | 'decline'): Promise<Workflow>
  run(id: string, stepId: string): Promise<Workflow>
  /** A FRESH Kernel live view URL (links can rotate or end), or 'ended' with the replay. */
  live?(id: string): Promise<LiveViewResponse>
}

export function makeApi(getToken: TokenGetter): Api {
  if (fixturesOn()) return { ...fx.fixtureApi, live: async () => ({ url: null, status: 'ended' }) }
  const r = <T>(path: string, init?: RequestInit) => request<T>(getToken, path, init)
  return {
    me: () => r<Me>('/api/me'),
    updateProfile: (p: { firstName?: string | null; phone?: string | null; currentPassword?: string }) => r<Me>('/api/me/profile', json(p)),
    screening: () => r<Record<string, unknown>>('/api/me/screening'),
    applicationDetails: () => r<ApplicationDetailsResponse>('/api/me/application-details'),
    saveApplicationDetails: (d) => r<ApplicationDetailsResponse>('/api/me/application-details', json(d)),
    documents: () => r<AccountDocument[]>('/api/me/documents'),
    uploadAccountDocument: (file: File, docType: string) => {
      const form = new FormData()
      form.append('file', file)
      form.append('docType', docType)
      return r<AccountDocument>('/api/me/documents', { method: 'POST', body: form })
    },
    downloadDocument: (id: string) => r<{ url: string; expiresIn: number }>(`/api/me/documents/${encodeURIComponent(id)}/download`),
    deleteDocument: (id: string) => r<{ ok: true }>(`/api/me/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    suggestions: (chatSessionId?: string) =>
      r<ApplicationScreening>(`/api/me/suggestions${chatSessionId ? `?chatSessionId=${encodeURIComponent(chatSessionId)}` : ''}`),
    listWorkflows: () => r<WorkflowSummary[]>('/api/workflows'),
    createWorkflow: (programs: ApplicationProgram[], chatSessionId?: string, target: FillTarget = fillTarget) =>
      r<Workflow>('/api/workflows', json({ programs, chatSessionId, target } satisfies CreateWorkflowRequest)),
    getWorkflow: (id: string) => r<Workflow>(`/api/workflows/${encodeURIComponent(id)}`),
    uploadDocument: (id: string, file: File, docType: string) => {
      const form = new FormData()
      form.append('file', file)
      form.append('docType', docType)
      return r<Workflow>(`/api/workflows/${encodeURIComponent(id)}/documents`, { method: 'POST', body: form })
    },
    approve: (id: string, stepId: string, decision: 'approve' | 'decline') =>
      r<Workflow>(`/api/workflows/${encodeURIComponent(id)}/approve`, json({ stepId, decision })),
    run: (id: string, stepId: string) => r<Workflow>(`/api/workflows/${encodeURIComponent(id)}/run`, json({ stepId })),
    live: (id: string) => r<LiveViewResponse>(`/api/workflows/${encodeURIComponent(id)}/live`),
  }
}
