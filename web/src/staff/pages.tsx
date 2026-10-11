import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../account/auth'
import { request } from '../account/api'
import {
  AccountShell,
  docNames,
  ErrorNotice,
  errorText,
  fieldClass,
  linkClass,
  RequireAccount,
  safeUrl,
} from '../account/pages'
import { Button } from '../components/Button'
import type { CaseDetail, CaseSummary } from '../lib/types'
import { Link, useRouter } from '../site/router'
import type { WorkflowSummary } from '../../../shared/workflow'

type VaultDoc = {
  id: string
  docType: string
  status: string
  docDate: string | null
  expiresAt: string | null
  expiresSoon: boolean
  expired: boolean
  reusedFor: string[]
  createdAt: string
}
type Approval = {
  id: string
  kind: string
  description: string
  status: string
  createdAt: string
}
const countyName = {
  los_angeles: 'Los Angeles County',
  san_francisco: 'San Francisco County',
}
const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

export function StaffDashboard() {
  return (
    <RequireAccount staff>
      <StaffList />
    </RequireAccount>
  )
}
function StaffList() {
  const auth = useAuth()
  const { navigate } = useRouter()
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setCases(await request<CaseSummary[]>(auth.getToken, '/api/staff/cases'))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [auth.getToken])
  useEffect(() => {
    void load()
  }, [load])
  async function logout() {
    try {
      await auth.signOut()
      navigate('/staff/login')
    } catch (e) {
      setError(errorText(e))
    }
  }
  const filtered = cases.filter((c) =>
    `${c.firstName || ''} ${countyName[c.county]} ${c.id}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )
  return (
    <AccountShell
      title="Your clinic’s cases."
      intro="Review the household’s history, documents, and proposed actions before deciding what happens next."
    >
      <div className="flex flex-wrap justify-between gap-3">
        <Link href="/account" className={linkClass}>
          My account
        </Link>
        <Button variant="outline" size="sm" onClick={() => void logout()}>
          Sign out
        </Button>
      </div>
      {error && <ErrorNotice message={error} onRetry={() => void load()} />}
      {loading ? (
        <p role="status" className="mt-8">
          Loading cases…
        </p>
      ) : (
        <>
          <label className="mt-8 block max-w-[28rem] type-body-s">
            Find a case
            <input
              type="search"
              className={fieldClass}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, county, or case ID"
            />
          </label>
          {filtered.length === 0 && (
            <p className="mt-8 type-body-m text-secondary">
              {cases.length
                ? 'No cases match your search.'
                : 'No cases assigned to this clinic yet.'}
            </p>
          )}
          <ul className="mt-6 divide-y divide-border-tertiary">
            {filtered.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/staff/cases/${encodeURIComponent(c.id)}`}
                  className="grid grid-cols-[1fr_auto] gap-4 rounded-8 py-6 focus-ring hover:bg-blue-50 max-mobile:grid-cols-1"
                >
                  <span>
                    <span className="block type-heading-s">
                      {c.firstName || 'Household'}
                    </span>
                    <span className="mt-2 block type-body-s text-secondary">
                      {countyName[c.county]} · Household of {c.size}
                    </span>
                    <span className="mt-3 block type-body-m">
                      {c.lastEvent?.label || 'Open case to review details'}
                    </span>
                  </span>
                  <span className="type-body-s text-secondary">
                    Updated {date(c.updatedAt)}
                    {c.actions.length > 0 && (
                      <span className="mt-2 block text-primary">
                        {c.actions.length} proposed{' '}
                        {c.actions.length === 1 ? 'action' : 'actions'}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </AccountShell>
  )
}

export function StaffCase({ id }: { id: string }) {
  return (
    <RequireAccount staff>
      <CaseContent key={id} id={id} />
    </RequireAccount>
  )
}
function CaseContent({ id }: { id: string }) {
  const { getToken } = useAuth()
  const [detail, setDetail] = useState<CaseDetail | null>(null)
  const [docs, setDocs] = useState<VaultDoc[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [vaultError, setVaultError] = useState('')
  const [approvalError, setApprovalError] = useState('')
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([])
  const [workflowError, setWorkflowError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmation, setConfirmation] = useState<{
    approval: Approval
    decision: 'approve' | 'decline'
  } | null>(null)
  const root = `/api/staff/cases/${encodeURIComponent(id)}`
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setVaultError('')
    setApprovalError('')
    setWorkflowError('')
    const [caseResult, vaultResult, approvalsResult, workflowResult] = await Promise.allSettled(
      [
        request<CaseDetail>(getToken, root),
        request<VaultDoc[]>(getToken, `${root}/vault`),
        request<Approval[]>(getToken, `${root}/approvals`),
        request<WorkflowSummary[]>(getToken, `${root}/workflows`),
      ],
    )
    if (caseResult.status === 'fulfilled') setDetail(caseResult.value)
    else setError(errorText(caseResult.reason))
    if (vaultResult.status === 'fulfilled') setDocs(vaultResult.value)
    else setVaultError(errorText(vaultResult.reason))
    if (approvalsResult.status === 'fulfilled')
      setApprovals(approvalsResult.value)
    else setApprovalError(errorText(approvalsResult.reason))
    if (workflowResult.status === 'fulfilled') setWorkflows(workflowResult.value)
    else setWorkflowError(errorText(workflowResult.reason))
    setLoading(false)
  }, [getToken, root])
  useEffect(() => {
    void load()
  }, [load])
  async function resolve() {
    if (!confirmation) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await request<{
        messages?: { to: string; text: string }[]
      }>(
        getToken,
        `${root}/approvals/${encodeURIComponent(confirmation.approval.id)}/resolve`,
        {
          method: 'POST',
          body: JSON.stringify({ decision: confirmation.decision }),
        },
      )
      setConfirmation(null)
      setNotice(
        result.messages?.length
          ? 'Decision saved. The resulting message is recorded in the conversation; delivery is handled separately.'
          : 'Decision saved.',
      )
      await load()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  async function requestDoc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await request(getToken, `${root}/doc-requests`, {
        method: 'POST',
        body: JSON.stringify({
          docType: values.get('docType'),
          reason: values.get('reason'),
        }),
      })
      setNotice('Document request saved.')
      form.reset()
      await load()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <AccountShell
      title={
        detail?.household.firstName
          ? `${detail.household.firstName}’s case`
          : 'Household case'
      }
      intro={
        detail
          ? `${countyName[detail.household.county]} · Household of ${detail.household.size}`
          : undefined
      }
    >
      <div className="flex flex-wrap justify-between gap-4">
        <Link href="/staff" className={linkClass}>
          Back to clinic cases
        </Link>
        <Button
          size="sm"
          variant="outline"
          disabled={loading || busy}
          onClick={() => void load()}
        >
          Refresh case
        </Button>
      </div>
      {error && <ErrorNotice message={error} onRetry={() => void load()} />}
      {notice && (
        <p role="status" className="mt-5 rounded-12 bg-green-50 p-4">
          {notice}
        </p>
      )}
      {loading && (
        <p className="mt-5" role="status">
          Loading case details…
        </p>
      )}
      {detail && (
        <div className="mt-8 grid grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)] gap-12 max-[850px]:grid-cols-1">
          <div>
            <section className="mb-10">
              <h2 className="type-feature-heading">Applicant preparations</h2>
              <p className="mt-3 type-body-s text-secondary">Saved application progress from the verified applicant account. Preparation and reported receipts do not establish agency submission.</p>
              {workflowError && <ErrorNotice message={workflowError} onRetry={() => void load()} />}
              {!workflowError && workflows.length === 0 && <p className="mt-5 text-secondary">No linked application preparations yet.</p>}
              {workflows.map(w => <article key={w.id} className="mt-5 rounded-16 border border-border-tertiary p-5">
                <h3 className="type-heading-s">{w.programs.map(p => p.replaceAll('_', ' ')).join(', ')}</h3>
                <p className="mt-2 type-body-s">{w.progress.done} of {w.progress.total} steps complete · Updated {date(w.updatedAt)}</p>
                {w.nextStep && <p className="mt-2 type-body-s text-secondary">{w.nextStep.title}: {w.nextStep.detail}</p>}
              </article>)}
            </section>
            <section>
              <h2 className="type-feature-heading">Proposed actions</h2>
              <p className="mt-3 type-body-s text-secondary">
                Review the full description before approving. An approval is not
                the applicant’s legal signature.
              </p>
              {approvalError && (
                <ErrorNotice
                  message={approvalError}
                  onRetry={() => void load()}
                />
              )}
              {!approvalError &&
                approvals.filter((a) => a.status === 'pending').length ===
                  0 && (
                  <p className="mt-5 text-secondary">
                    No actions are waiting for approval.
                  </p>
                )}
              {approvals
                .filter((a) => a.status === 'pending')
                .map((a) => (
                  <article
                    key={a.id}
                    className="mt-5 rounded-16 border border-border-tertiary p-5"
                  >
                    <h3 className="type-heading-s">
                      {a.kind.replaceAll('_', ' ')}
                    </h3>
                    <p className="mt-3 whitespace-pre-wrap type-body-m">
                      {a.description}
                    </p>
                    <p className="mt-3 type-body-s text-secondary">
                      Proposed {date(a.createdAt)}
                    </p>
                    <div className="mt-4 flex gap-3">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          setConfirmation({ approval: a, decision: 'approve' })
                        }
                      >
                        Review approval
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          setConfirmation({ approval: a, decision: 'decline' })
                        }
                      >
                        Review decline
                      </Button>
                    </div>
                  </article>
                ))}
              {confirmation && (
                <div
                  className="mt-5 rounded-16 bg-amber-50 p-5"
                  role="region"
                  aria-label="Confirm decision"
                >
                  <h3 className="type-heading-s">
                    {confirmation.decision === 'approve'
                      ? 'Approve this action?'
                      : 'Decline this action?'}
                  </h3>
                  <p className="mt-3">{confirmation.approval.description}</p>
                  <div className="mt-4 flex gap-3">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void resolve()}
                    >
                      {busy
                        ? 'Saving…'
                        : confirmation.decision === 'approve'
                          ? 'Confirm approval'
                          : 'Confirm decline'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirmation(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </section>
            <section className="mt-10">
              <h2 className="type-feature-heading">Documents</h2>
              {vaultError && (
                <ErrorNotice message={vaultError} onRetry={() => void load()} />
              )}
              {docs.length === 0 && !vaultError && (
                <p className="mt-4 text-secondary">
                  No documents received yet.
                </p>
              )}
              <ul className="mt-4 divide-y divide-border-tertiary">
                {docs.map((d) => {
                  const download = safeUrl(
                    detail.documents.find((item) => item.id === d.id)?.url,
                  )
                  return (
                    <li key={d.id} className="py-4">
                      <span className="type-heading-s">
                        {docNames[d.docType] || d.docType}
                      </span>
                      <p className="mt-2 type-body-s text-secondary">
                        {d.status.replaceAll('_', ' ')} · Received{' '}
                        {date(d.createdAt)}
                      </p>
                      {d.expiresAt && (
                        <p
                          className={`mt-2 type-body-s ${d.expired ? 'text-destructive' : d.expiresSoon ? 'text-amber-700' : 'text-secondary'}`}
                        >
                          {d.expired ? 'Expired' : 'Expires'}{' '}
                          {date(d.expiresAt)}
                        </p>
                      )}
                      {download && (
                        <a
                          href={download}
                          target="_blank"
                          rel="noreferrer"
                          className={`${linkClass} mt-2 inline-block type-body-s`}
                        >
                          Open document
                        </a>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
            <section className="mt-10">
              <h2 className="type-feature-heading">Conversation</h2>
              {detail.messages.length === 0 && (
                <p className="mt-4 text-secondary">No messages recorded.</p>
              )}
              <ol className="mt-4 space-y-4">
                {detail.messages.map((m, i) => (
                  <li
                    key={`${m.at}-${i}`}
                    className={`rounded-16 p-4 ${m.role === 'user' ? 'bg-blue-50' : 'border border-border-tertiary'}`}
                  >
                    <p className="type-body-s text-secondary">
                      {m.role === 'user' ? 'Applicant' : 'Lumin'} · {date(m.at)}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap type-body-m">
                      {m.content}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          </div>
          <aside className="space-y-8">
            <section className="rounded-24 bg-blue-50 p-6">
              <h2 className="type-heading-s">Request a document</h2>
              <form className="mt-5 space-y-4" onSubmit={requestDoc}>
                <label className="block type-body-s">
                  Document type
                  <select name="docType" className={fieldClass}>
                    {Object.entries(docNames).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block type-body-s">
                  Why it is needed
                  <textarea
                    name="reason"
                    required
                    minLength={1}
                    maxLength={300}
                    rows={3}
                    className={fieldClass}
                  />
                </label>
                <Button type="submit" disabled={busy}>
                  Save document request
                </Button>
              </form>
            </section>
            <section>
              <h2 className="type-heading-s">Program screening</h2>
              <p className="mt-3 type-body-s text-secondary">
                Preliminary information. The agency decides eligibility.
              </p>
              <ul className="mt-4 space-y-4">
                {detail.eligibility.map((m) => (
                  <li key={m.program}>
                    <h3 className="font-medium">
                      {m.program.replaceAll('_', ' ')}
                    </h3>
                    <p className="mt-1 type-body-s text-secondary">
                      {m.reason}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="type-heading-s">Case timeline</h2>
              <ol className="mt-4 space-y-3">
                {detail.timeline.map((t, i) => (
                  <li
                    key={`${t.at}-${i}`}
                    className="border-l-2 border-border-tertiary pl-3"
                  >
                    <p className="type-body-s">{t.label}</p>
                    <p className="mt-1 type-body-s text-secondary">
                      {date(t.at)}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        </div>
      )}
    </AccountShell>
  )
}
