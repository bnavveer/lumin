import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import type {
  ApplicationProgram,
  ApplicationScreening,
} from '../../../shared/chat'
import type {
  Me,
  NextStep,
  Workflow,
  WorkflowSummary,
} from '../../../shared/workflow'
import { Button } from '../components/Button'
import { Page } from '../site/chrome'
import { Link, useRouter } from '../site/router'
import { makeApi, request } from './api'
import { useAuth } from './auth'
import { fixturesOn } from './fixtureFlag'

export const fieldClass =
  'mt-2 w-full rounded-12 border border-border-secondary bg-white px-4 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-50'
export const linkClass =
  'rounded-4 text-link underline underline-offset-4 focus-ring'
export const programNames: Record<ApplicationProgram, string> = {
  calfresh: 'CalFresh',
  medi_cal: 'Medi-Cal',
  calworks: 'CalWORKs',
  general_relief: 'General Relief',
  cfap: 'California Food Assistance',
  section8: 'Housing assistance',
  pge_care: 'PG&E CARE',
  pge_fera: 'PG&E FERA',
  wic: 'WIC',
  california_lifeline: 'California LifeLine',
  liheap: 'Energy assistance',
  ihss: 'In-Home Supportive Services',
  child_care: 'Child care assistance',
}
const workflowLabels: Record<Workflow['status'], string> = {
  researching: 'Checking requirements',
  needs_documents: 'Documents needed',
  ready_to_fill: 'Ready to prepare',
  filling: 'Preparing application',
  awaiting_signature: 'Your review is needed',
  submitted: 'Submitted',
  following_up: 'Following up',
  done: 'Complete',
  needs_attention: 'Needs attention',
}
const stepLabels = {
  pending: 'Not started',
  running: 'In progress',
  waiting_on_you: 'Your action is needed',
  done: 'Complete',
  failed: 'Needs attention',
  skipped: 'Skipped',
}
export const docNames: Record<string, string> = {
  id: 'Photo ID',
  paystub: 'Pay stub',
  lease: 'Lease or housing costs',
  ssn_card: 'Social Security card',
  birth_cert: 'Birth certificate',
  immigration: 'Immigration document',
  other: 'Other document',
}
export const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Could not complete this action. Try again.'
export function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

export function AccountShell({
  title,
  intro,
  children,
}: {
  title: string
  intro?: string
  children: ReactNode
}) {
  return (
    <Page dock={false}>
      <div className="mx-auto max-w-[72rem] px-6 pt-16 max-mobile:px-4 max-mobile:pt-10">
        <h1 className="type-section-heading">{title}</h1>
        {intro && (
          <p className="mt-5 max-w-[42rem] type-body-m text-secondary">
            {intro}
          </p>
        )}
        {fixturesOn() && (
          <p role="status" className="mt-6 rounded-12 bg-amber-50 p-4">
            Sample account. All application details shown here are fictional.
          </p>
        )}
        <div className="mt-10">{children}</div>
      </div>
    </Page>
  )
}
export function ErrorNotice({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div
      role="alert"
      className="my-5 rounded-12 border border-red-600/30 bg-red-600/5 p-4"
    >
      <p>{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
export function useAccountApi() {
  const { getToken } = useAuth()
  return useMemo(() => makeApi(getToken), [getToken])
}
function destination(search: string) {
  const next = new URLSearchParams(search).get('next')
  return next && /^\/(account|applications|staff)(\/|\?|$)/.test(next)
    ? next
    : '/account'
}
export function AuthPage({
  signup = false,
  staff = false,
}: {
  signup?: boolean
  staff?: boolean
}) {
  const auth = useAuth()
  const { navigate, search } = useRouter()
  const next = staff ? '/staff' : destination(search)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState(false)
  useEffect(() => {
    if (!auth.loading && auth.user) navigate(next, { replace: true })
  }, [auth.loading, auth.user, next, navigate])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const email = String(values.get('email') ?? '').trim()
      const password = String(values.get('password') ?? '')
      if (signup) {
        const confirmationRequired = await auth.signUp({
          email,
          password,
          firstName: String(values.get('firstName') ?? '').trim() || undefined,
          phone: String(values.get('phone') ?? '').trim() || undefined,
        })
        if (confirmationRequired) {
          setConfirmation(true)
          return
        }
      } else await auth.signIn(email, password)
      navigate(next, { replace: true })
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  if (confirmation)
    return (
      <AccountShell
        title="Check your email."
        intro="Open the confirmation link in your email to finish creating your account, then return here to sign in."
      >
        <Link
          className={linkClass}
          href={`/login?next=${encodeURIComponent(next)}`}
        >
          Go to sign in
        </Link>
      </AccountShell>
    )
  return (
    <AccountShell
      title={
        staff
          ? 'Staff sign in'
          : signup
            ? 'Keep your next steps together.'
            : 'Welcome back.'
      }
      intro={
        staff
          ? 'Sign in with the account your clinic has invited. Access is limited to your clinic’s cases.'
          : signup
            ? 'Save your program matches, organize documents, and see what to do next. The county decides eligibility.'
            : 'Sign in to check your saved programs and application preparation.'
      }
    >
      <div className="max-w-[30rem]">
        {error && <ErrorNotice message={error} />}
        <form onSubmit={submit} className="space-y-5">
          {signup && (
            <label className="block">
              First name <span className="text-secondary">(optional)</span>
              <input
                name="firstName"
                autoComplete="given-name"
                maxLength={80}
                className={fieldClass}
              />
            </label>
          )}
          <label className="block">
            Email
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              maxLength={254}
              className={fieldClass}
            />
          </label>
          <label className="block">
            Password
            <input
              type="password"
              name="password"
              required
              minLength={signup ? 8 : 1}
              maxLength={128}
              autoComplete={signup ? 'new-password' : 'current-password'}
              className={fieldClass}
            />
            {signup && (
              <span className="mt-2 block type-body-s text-secondary">
                Use at least 8 characters.
              </span>
            )}
          </label>
          {signup && (
            <label className="block">
              Phone <span className="text-secondary">(optional)</span>
              <input
                type="tel"
                name="phone"
                autoComplete="tel"
                placeholder="+1 213 555 0123"
                maxLength={24}
                className={fieldClass}
              />
              <span className="mt-2 block type-body-s text-secondary">
                You can add a contact number later in your account.
              </span>
            </label>
          )}
          <Button
            type="submit"
            size="lg"
            disabled={busy || auth.loading}
            className="w-full"
          >
            {busy
              ? signup
                ? 'Creating account…'
                : 'Signing in…'
              : signup
                ? 'Create account'
                : 'Sign in'}
          </Button>
        </form>
        {!staff && (
          <p className="mt-6 type-body-s">
            {signup ? 'Already have an account? ' : 'New to Lumin? '}
            <Link
              className={linkClass}
              href={`${signup ? '/login' : '/signup'}?next=${encodeURIComponent(next)}`}
            >
              {signup ? 'Sign in' : 'Create an account'}
            </Link>
          </p>
        )}
        <p className="mt-5 type-body-s text-secondary">
          By continuing, you agree to our{' '}
          <Link className={linkClass} href="/terms">
            terms
          </Link>{' '}
          and{' '}
          <Link className={linkClass} href="/privacy-policy">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </AccountShell>
  )
}

export function RequireAccount({
  children,
  staff = false,
}: {
  children: ReactNode
  staff?: boolean
}) {
  const { user, loading } = useAuth()
  const { path, search } = useRouter()
  if (loading)
    return (
      <AccountShell title="Opening your account">
        <p role="status">Checking sign-in…</p>
      </AccountShell>
    )
  if (!user)
    return (
      <AccountShell
        title={staff ? 'Staff access' : 'Your applications, in one place.'}
        intro="Sign in to open your saved information. If you were checking programs in chat, your next steps will be here after you sign in."
      >
        <Link
          className="inline-flex rounded-full bg-blue-700 px-6 py-3 text-white focus-ring"
          href={`${staff ? '/staff/login' : '/login'}?next=${encodeURIComponent(path + search)}`}
        >
          Sign in
        </Link>
        {!staff && (
          <Link
            className={`${linkClass} ml-6`}
            href={`/signup?next=${encodeURIComponent(path + search)}`}
          >
            Create an account
          </Link>
        )}
      </AccountShell>
    )
  return children
}

export function Dashboard() {
  return (
    <RequireAccount>
      <DashboardContent />
    </RequireAccount>
  )
}
function DashboardContent() {
  const api = useAccountApi()
  const auth = useAuth()
  const { navigate, search } = useRouter()
  const chatSessionId =
    new URLSearchParams(search).get('chatSessionId') || undefined
  const [me, setMe] = useState<Me | null>(null)
  const [screening, setScreening] = useState<ApplicationScreening | null>(null)
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([])
  const [selected, setSelected] = useState<ApplicationProgram[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [suggestionError, setSuggestionError] = useState('')
  const [saved, setSaved] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setSuggestionError('')
    if (chatSessionId && !fixturesOn()) {
      try {
        await request(auth.getToken, '/api/me/link-chat', {
          method: 'POST',
          body: JSON.stringify({ chatSessionId }),
        })
      } catch (e) {
        setError(errorText(e))
        setLoading(false)
        return
      }
    }
    const [profile, applications, suggestions] = await Promise.allSettled([
      api.me(),
      api.listWorkflows(),
      api.suggestions(chatSessionId),
    ])
    if (profile.status === 'fulfilled') setMe(profile.value)
    if (applications.status === 'fulfilled') setWorkflows(applications.value)
    if (suggestions.status === 'fulfilled') setScreening(suggestions.value)
    else setSuggestionError(errorText(suggestions.reason))
    const failed = [profile, applications].find((r) => r.status === 'rejected')
    if (failed?.status === 'rejected') setError(errorText(failed.reason))
    setLoading(false)
  }, [api, chatSessionId, auth.getToken])
  useEffect(() => {
    void load()
  }, [load])
  async function create() {
    setBusy(true)
    setError('')
    try {
      const workflow = await api.createWorkflow(selected, chatSessionId)
      navigate(`/applications/${encodeURIComponent(workflow.id)}`)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSaved(false)
    const values = new FormData(event.currentTarget)
    try {
      setMe(
        await api.updateProfile({
          firstName: String(values.get('firstName') ?? '').trim() || null,
          phone: String(values.get('phone') ?? '').trim() || null,
        }),
      )
      setSaved(true)
      const suggestions = await api.suggestions(chatSessionId)
      setScreening(suggestions)
      setSuggestionError('')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  async function logout() {
    setBusy(true)
    try {
      await auth.signOut()
      navigate('/login')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <AccountShell
      title={
        me?.firstName
          ? `${me.firstName}, here’s what’s next.`
          : 'Your next steps.'
      }
      intro="Keep your documents and application preparation together. Your program matches are preliminary; you review and submit on the official application site."
    >
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-5">
          <Link href="/chat" className={linkClass}>
            Continue benefits chat
          </Link>
          <Link href="/account/screening" className={linkClass}>
            Household answers
          </Link>
          <Link href="/account/documents" className={linkClass}>
            My documents
          </Link>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void logout()}
        >
          Sign out
        </Button>
      </div>
      {error && <ErrorNotice message={error} onRetry={() => void load()} />}
      {loading ? (
        <p role="status">Loading your programs and applications…</p>
      ) : (
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)] gap-12 max-[850px]:grid-cols-1">
          <div>
            <section aria-labelledby="applications-heading">
              <h2 id="applications-heading" className="type-feature-heading">
                Application preparation
              </h2>
              {workflows.length === 0 ? (
                <p className="mt-4 type-body-m text-secondary">
                  No applications saved yet. Choose a program below to start a
                  checklist.
                </p>
              ) : (
                <ul className="mt-5 divide-y divide-border-tertiary">
                  {workflows.map((w) => (
                    <li key={w.id}>
                      <Link
                        href={`/applications/${encodeURIComponent(w.id)}`}
                        className="block rounded-8 py-5 focus-ring hover:bg-blue-50"
                      >
                        <span className="block type-heading-s">
                          {w.programs.map((p) => programNames[p]).join(', ')}
                        </span>
                        <span className="mt-2 block type-body-s text-secondary">
                          {workflowLabels[w.status]} · {w.progress.done} of{' '}
                          {w.progress.total} steps complete
                        </span>
                        {w.nextStep && (
                          <span className="mt-2 block type-body-m">
                            {w.nextStep.title}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="mt-12" aria-labelledby="matches-heading">
              <h2 id="matches-heading" className="type-feature-heading">
                Programs to consider
              </h2>
              {suggestionError && (
                <ErrorNotice
                  message={suggestionError}
                  onRetry={() => void load()}
                />
              )}
              {screening && (
                <>
                  <p className="mt-4 type-body-s text-secondary">
                    {screening.notice}
                  </p>
                  {screening.matches.filter((m) => m.status !== 'not_eligible')
                    .length === 0 && (
                    <p className="mt-5">
                      Tell us about your household in{' '}
                      <Link href="/chat" className={linkClass}>
                        benefits chat
                      </Link>{' '}
                      or{' '}
                      <Link href="/account/screening" className={linkClass}>
                        save your household answers
                      </Link>{' '}
                      to find possible programs.
                    </p>
                  )}
                  <div className="mt-4 divide-y divide-border-tertiary">
                    {screening.matches
                      .filter((m) => m.status !== 'not_eligible')
                      .map((m) => (
                        <label
                          key={m.program}
                          className="flex cursor-pointer gap-4 py-5"
                        >
                          <input
                            type="checkbox"
                            checked={selected.includes(m.program)}
                            onChange={(e) =>
                              setSelected((prev) =>
                                e.target.checked
                                  ? [...prev, m.program]
                                  : prev.filter((p) => p !== m.program),
                              )
                            }
                            className="mt-1 size-5 shrink-0 accent-blue-700"
                          />
                          <span>
                            <span className="block type-heading-s">
                              {m.name}
                            </span>
                            <span className="mt-2 block type-body-s text-secondary">
                              {m.status === 'needs_info'
                                ? 'More information needed. '
                                : 'May be a match. '}
                              {m.reason}
                            </span>
                            <span className="mt-2 block type-body-s">
                              {m.nextStep}
                            </span>
                            {safeUrl(m.applicationUrl) && (
                              <a
                                href={safeUrl(m.applicationUrl)!}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className={`${linkClass} mt-3 inline-block type-body-s`}
                              >
                                Apply directly on the official site
                              </a>
                            )}
                          </span>
                        </label>
                      ))}
                  </div>
                  {screening.matches.some(
                    (m) => m.status !== 'not_eligible',
                  ) && (
                    <Button
                      className="mt-5"
                      disabled={busy || selected.length === 0}
                      onClick={() => void create()}
                    >
                      {busy ? 'Saving…' : 'Start preparation'}
                    </Button>
                  )}
                </>
              )}
            </section>
          </div>
          <aside className="self-start rounded-24 bg-blue-50 p-6">
            <h2 className="type-heading-s">Your contact details</h2>
            <p className="mt-3 break-words type-body-s text-secondary">
              {me?.email || auth.user?.email}
            </p>
            <form onSubmit={saveProfile} className="mt-5 space-y-4">
              <label className="block type-body-s">
                First name
                <input
                  key={`name-${me?.firstName}`}
                  name="firstName"
                  defaultValue={me?.firstName || ''}
                  maxLength={80}
                  autoComplete="given-name"
                  className={fieldClass}
                />
              </label>
              <label className="block type-body-s">
                Phone
                <input
                  key={`phone-${me?.phone}`}
                  name="phone"
                  type="tel"
                  defaultValue={me?.phone || ''}
                  placeholder="+1 213 555 0123"
                  autoComplete="tel"
                  maxLength={24}
                  className={fieldClass}
                />
              </label>
              <p className="type-body-s text-secondary">
                Use a number where you can be reached. Confirm your household in
                chat to connect a text conversation.
              </p>
              <Button variant="outline" disabled={busy} type="submit">
                Save contact details
              </Button>
              {saved && (
                <p role="status" className="type-body-s">
                  Contact details saved.
                </p>
              )}
            </form>
          </aside>
        </div>
      )}
    </AccountShell>
  )
}

export function ApplicationDetail({ id }: { id: string }) {
  return (
    <RequireAccount>
      <ApplicationContent key={id} id={id} />
    </RequireAccount>
  )
}
function ApplicationContent({ id }: { id: string }) {
  const api = useAccountApi()
  const { getToken } = useAuth()
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [uploadType, setUploadType] = useState('id')
  const [file, setFile] = useState<File | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setWorkflow(await api.getWorkflow(id))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [api, id])
  useEffect(() => {
    void load()
  }, [load])
  const active = workflow?.steps.some((s) => s.status === 'running')
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => {
      if (!document.hidden)
        void api
          .getWorkflow(id)
          .then(setWorkflow)
          .catch((e) => setError(errorText(e)))
    }, 10000)
    return () => clearInterval(timer)
  }, [active, api, id])
  async function action(operation: () => Promise<Workflow>, message: string) {
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      setWorkflow(await operation())
      setSuccess(message)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setError('Choose a file smaller than 10 MB.')
      return
    }
    await action(
      () => api.uploadDocument(id, file, uploadType),
      'Document received. Check the document step below for its status.',
    )
  }
  async function recordReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    await action(
      () =>
        request<Workflow>(
          getToken,
          `/api/workflows/${encodeURIComponent(id)}/receipt`,
          {
            method: 'POST',
            body: JSON.stringify({
              program: values.get('program'),
              confirmation: String(values.get('confirmation') ?? '').trim(),
            }),
          },
        ),
      'Your reported confirmation was saved. Lumin has not verified submission; check the official portal for status.',
    )
  }
  function nextAction(next: NextStep) {
    const a = next.action
    if (!a) return null
    const url = safeUrl(a.url)
    if (a.type === 'open_url' || a.type === 'sign')
      return url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={`${linkClass} mt-3 inline-block`}
        >
          {a.label}
        </a>
      ) : (
        <p className="mt-3 type-body-s text-secondary">
          Open the official program site to review, sign, and submit.
        </p>
      )
    if (a.type === 'chat')
      return (
        <div className="mt-3 flex flex-wrap gap-5">
          <Link href="/chat" className={linkClass}>
            {a.label}
          </Link>
          <Link href="/account/screening" className={linkClass}>
            Update household answers
          </Link>
        </div>
      )
    if (a.type === 'upload')
      return (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => {
            setUploadType(a.docType || 'other')
            document
              .getElementById('document-upload')
              ?.scrollIntoView({ behavior: 'smooth' })
            document.getElementById('document-file')?.focus()
          }}
        >
          {a.label}
        </Button>
      )
    if (!a.stepId) return null
    const stepId = a.stepId
    return (
      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            void action(
              () =>
                a.type === 'approve'
                  ? api.approve(id, stepId, 'approve')
                  : api.run(id, stepId),
              a.type === 'approve'
                ? 'Your approval was saved.'
                : 'Preparation updated. Review the steps below.',
            )
          }
        >
          {a.label}
        </Button>
        {a.type === 'approve' && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              void action(
                () => api.approve(id, stepId, 'decline'),
                'Your decision was saved.',
              )
            }
          >
            Decline
          </Button>
        )}
      </div>
    )
  }
  return (
    <AccountShell
      title={
        workflow
          ? workflow.programs.map((p) => programNames[p]).join(' & ')
          : 'Application preparation'
      }
      intro="Lumin helps organize the steps. You review your information, provide any required signature, and submit through the official program site."
    >
      <Link href="/account" className={linkClass}>
        Back to your account
      </Link>
      {error && <ErrorNotice message={error} onRetry={() => void load()} />}
      {success && (
        <p role="status" className="mt-5 rounded-12 bg-green-50 p-4">
          {success}
        </p>
      )}
      {loading && (
        <p role="status" className="mt-6">
          Loading application…
        </p>
      )}
      {workflow && (
        <>
          <div className="my-8 flex flex-wrap items-center justify-between gap-4">
            <p className="type-heading-s">{workflowLabels[workflow.status]}</p>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || loading}
              onClick={() => void load()}
            >
              Refresh status
            </Button>
          </div>
          <div className="rounded-16 bg-amber-50 p-5 type-body-s">
            <strong>Review and submit on the official site.</strong>
            <p className="mt-2">
              Lumin does not automatically fill, sign, or submit agency forms.
              Follow the official-site links in your next steps, review your
              information, and complete the application there.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)] gap-12 max-[850px]:grid-cols-1">
            <div>
              <h2 className="type-feature-heading">Next steps</h2>
              {workflow.nextSteps.length === 0 ? (
                <p className="mt-4 text-secondary">
                  No pending next steps. Review the application history below.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-border-tertiary">
                  {workflow.nextSteps.map((n) => (
                    <li key={n.id} className="py-5">
                      <h3 className="type-heading-s">{n.title}</h3>
                      <p className="mt-2 type-body-s text-secondary">
                        {n.actor === 'you'
                          ? 'For you'
                          : n.actor === 'county'
                            ? 'With the county'
                            : 'With Lumin'}
                      </p>
                      <p className="mt-2 type-body-m">{n.detail}</p>
                      {nextAction(n)}
                    </li>
                  ))}
                </ul>
              )}
              <h2 className="mt-10 type-feature-heading">
                Application history
              </h2>
              <ol className="mt-5 space-y-5">
                {workflow.steps.map((step) => (
                  <li
                    key={step.id}
                    className="rounded-16 border border-border-tertiary p-5"
                  >
                    <div className="flex flex-wrap justify-between gap-3">
                      <h3 className="type-heading-s">{step.title}</h3>
                      <span className="type-body-s text-secondary">
                        {stepLabels[step.status]}
                      </span>
                    </div>
                    {step.summary && (
                      <p className="mt-3 whitespace-pre-wrap type-body-s text-secondary">
                        {step.summary}
                      </p>
                    )}
                    {step.evidence.length > 0 && (
                      <ul className="mt-4 space-y-3">
                        {step.evidence.map((e) => (
                          <li
                            key={e.id}
                            className="rounded-8 bg-blue-50 p-3 type-body-s"
                          >
                            {safeUrl(e.url) ? (
                              <a
                                href={safeUrl(e.url)!}
                                target="_blank"
                                rel="noreferrer"
                                className={linkClass}
                              >
                                {e.title}
                              </a>
                            ) : (
                              <span className="font-medium">{e.title}</span>
                            )}
                            {e.detail && (
                              <p className="mt-2 whitespace-pre-wrap">
                                {e.detail}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {((['research', 'documents'].includes(step.kind) &&
                      ['pending', 'waiting_on_you', 'failed'].includes(
                        step.status,
                      )) ||
                      (step.status === 'failed' && step.kind === 'fill')) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4"
                        disabled={busy}
                        onClick={() =>
                          void action(
                            () => api.run(id, step.id),
                            'The step was retried. Check its status above.',
                          )
                        }
                      >
                        {step.kind === 'research'
                          ? 'Recheck program options'
                          : step.kind === 'documents'
                            ? 'Update document checklist'
                            : 'Retry step'}
                      </Button>
                    )}
                  </li>
                ))}
              </ol>
            </div>
            <aside
              id="document-upload"
              className="self-start rounded-24 bg-blue-50 p-6"
            >
              <h2 className="type-heading-s">Add a document</h2>
              <p className="mt-3 type-body-s text-secondary">
                Upload a clear image or PDF for your checklist. Uploading here
                does not send it to the county.
              </p>
              <form className="mt-5 space-y-5" onSubmit={upload}>
                <label className="block type-body-s">
                  Document type
                  <select
                    className={fieldClass}
                    value={uploadType}
                    onChange={(e) => setUploadType(e.target.value)}
                  >
                    {Object.entries(docNames).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block type-body-s">
                  File
                  <input
                    id="document-file"
                    type="file"
                    required
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    className="mt-3 block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-primary"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  <span className="mt-2 block text-secondary">
                    PDF, JPG, PNG, or WebP. Up to 10 MB.
                  </span>
                </label>
                <Button type="submit" disabled={busy || !file}>
                  {busy ? 'Saving…' : 'Upload document'}
                </Button>
              </form>
              <details className="mt-8 border-t border-border-tertiary pt-5">
                <summary className="cursor-pointer font-medium focus-ring">
                  Already submitted on the official site?
                </summary>
                <p className="mt-3 type-body-s text-secondary">
                  Save the confirmation number for your records. This is your
                  report of submission; Lumin does not verify it with the county.
                </p>
                <form onSubmit={recordReceipt} className="mt-5 space-y-4">
                  <label className="block type-body-s">
                    Program
                    <select name="program" className={fieldClass}>
                      {workflow.programs.map((p) => (
                        <option key={p} value={p}>
                          {programNames[p]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block type-body-s">
                    Confirmation number
                    <input
                      name="confirmation"
                      required
                      minLength={1}
                      maxLength={200}
                      autoComplete="off"
                      className={fieldClass}
                    />
                  </label>
                  <Button type="submit" variant="outline" disabled={busy}>
                    Save reported confirmation
                  </Button>
                </form>
              </details>
              {safeUrl(workflow.liveViewUrl) && (
                <a
                  href={safeUrl(workflow.liveViewUrl)!}
                  target="_blank"
                  rel="noreferrer"
                  className={`${linkClass} mt-6 block`}
                >
                  View preparation session
                </a>
              )}
            </aside>
          </div>
        </>
      )}
    </AccountShell>
  )
}
