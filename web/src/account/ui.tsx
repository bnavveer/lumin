import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ApplicationProgram } from '../../../shared/chat'
import type { NextStep, StepStatus, WorkflowStatus } from '../../../shared/workflow'
import { Button, IconButton } from '../components/Button'
import { cx } from '../components/cx'
import { Icon, type IconName } from '../components/icons'
import { Header, SkipLink } from '../site/chrome'
import { useRouter } from '../site/router'
import { useAuth } from './auth'

// Small shared pieces for the account pages, built from the site kit.

export const programNames: Record<ApplicationProgram, string> = {
  calfresh: 'CalFresh', medi_cal: 'Medi-Cal', calworks: 'CalWORKs', general_relief: 'General Relief', cfap: 'CFAP',
  section8: 'Section 8', pge_care: 'PG&E CARE', pge_fera: 'PG&E FERA', wic: 'WIC', california_lifeline: 'California LifeLine',
  liheap: 'LIHEAP', ihss: 'IHSS', child_care: 'Child care',
}
export const programList = (ps: ApplicationProgram[]) => ps.map((p) => programNames[p] ?? p).join(', ')

/** Only http(s) URLs are ever rendered as links, frames or images. */
export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`
  return `${Math.floor(s / 86400)} d ago`
}

// ── Status pill ──────────────────────────────────────────────────────────
const tone = {
  neutral: 'bg-background-tertiary text-secondary',
  info: 'bg-blue-50 text-blue-600',
  warn: 'bg-amber-50 text-amber-700',
  good: 'bg-green-50 text-green-600',
  bad: 'bg-[#fdf2f3] text-red-600',
} as const

const workflowStatus: Record<WorkflowStatus, { label: string; tone: keyof typeof tone; icon: IconName }> = {
  researching: { label: 'Researching', tone: 'info', icon: 'spinner' },
  needs_documents: { label: 'Needs documents', tone: 'warn', icon: 'document' },
  ready_to_fill: { label: 'Ready to fill', tone: 'info', icon: 'edit' },
  filling: { label: 'Filling it out', tone: 'info', icon: 'spinner' },
  awaiting_signature: { label: 'Needs your signature', tone: 'warn', icon: 'edit' },
  submitted: { label: 'Submitted', tone: 'good', icon: 'check-circle' },
  following_up: { label: 'Following up', tone: 'info', icon: 'clock' },
  done: { label: 'Done', tone: 'good', icon: 'check-circle' },
  needs_attention: { label: 'Needs attention', tone: 'bad', icon: 'warning' },
}

export function StatusPill({ status }: { status: WorkflowStatus }) {
  const s = workflowStatus[status] ?? workflowStatus.researching
  return <Pill toneName={s.tone} icon={s.icon} label={s.label} />
}

export function Pill({ toneName, icon, label }: { toneName: keyof typeof tone; icon?: IconName; label: string }) {
  return (
    <span className={cx('inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 type-label-s font-medium whitespace-nowrap', tone[toneName])}>
      {icon && <Icon name={icon} size={14} strokeWidth={2} />}
      {label}
    </span>
  )
}

const actors: Record<NextStep['actor'], { label: string; className: string; icon: IconName }> = {
  you: { label: 'You', className: 'bg-blue-700 text-white', icon: 'user' },
  aid: { label: 'Lumin', className: 'bg-background-secondary text-primary', icon: 'shield' },
  county: { label: 'County', className: 'bg-grey-200 text-primary', icon: 'building' },
}
export function ActorBadge({ actor }: { actor: NextStep['actor'] }) {
  const a = actors[actor]
  return (
    <span className={cx('inline-flex h-6 items-center gap-1 rounded-full px-2.5 type-label-s font-medium', a.className)}>
      <Icon name={a.icon} size={12} strokeWidth={2} />
      {a.label}
    </span>
  )
}

export function ProgressBar({ done, total, label }: { done: number; total: number; label?: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={label ?? 'Progress'} className="h-2 overflow-hidden rounded-full bg-background-secondary">
        <div className="h-full origin-left rounded-full bg-blue-700 transition-transform duration-700 ease-out-quint" style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      <p className="mt-2 type-label-s text-secondary">{done} of {total} steps done</p>
    </div>
  )
}

export function StepIcon({ status }: { status: StepStatus }) {
  const base = 'flex size-8 items-center justify-center rounded-full'
  switch (status) {
    case 'done':
      return <span className={cx(base, 'bg-green-600 text-white')}><Icon name="check" size={16} strokeWidth={2.5} /></span>
    case 'running':
      return <span className={cx(base, 'bg-blue-50 text-blue-600')}><Icon name="spinner" size={18} strokeWidth={2.5} /></span>
    case 'waiting_on_you':
      return <span className={cx(base, 'bg-blue-700 text-white')}><Icon name="user" size={16} /></span>
    case 'failed':
      return <span className={cx(base, 'bg-red-600 text-white')}><Icon name="warning" size={16} /></span>
    case 'skipped':
      return <span className={cx(base, 'bg-grey-200 text-secondary')}><Icon name="arrow-right" size={14} /></span>
    default:
      return <span className={cx(base, 'border-2 border-border-secondary bg-background-primary')} />
  }
}
export const stepStatusLabel: Record<StepStatus, string> = {
  pending: 'Not started', running: 'In progress', waiting_on_you: 'Waiting on you', done: 'Done', failed: 'Failed', skipped: 'Skipped',
}

// ── Skeleton / error / empty ─────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('animate-pulse rounded-16 bg-background-tertiary motion-reduce:animate-none', className)} />
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-4 rounded-24 border border-border-tertiary p-6">
      <p className="flex items-center gap-2 type-body-m font-medium"><Icon name="warning" size={18} className="text-red-600" />{message}</p>
      {onRetry && <Button variant="outline" size="sm" icon="refresh" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

// ── Toasts ───────────────────────────────────────────────────────────────
type Toast = { id: number; message: string; tone: 'error' | 'success' }
const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => {})
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const n = useRef(0)
  const push = useCallback((message: string, t: Toast['tone'] = 'error') => {
    const id = ++n.current
    setToasts((ts) => [...ts.slice(-2), { id, message, tone: t }])
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 6000)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex max-w-md items-start gap-3 rounded-24 bg-blue-900 py-3 pr-2 pl-4 text-white shadow-elevation-1 animate-[bubble-in_.3s_var(--ease-out-quint)]">
            <Icon name={t.tone === 'error' ? 'warning' : 'check-circle'} size={18} className="mt-0.5 shrink-0" />
            <p className="type-body-s text-white">{t.message}</p>
            <IconButton icon="close" label="Dismiss" size="sm" variant="ghost" className="shrink-0 text-white hover:bg-white/15" onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// ── Page frame and auth gate ─────────────────────────────────────────────
export function AccountPage({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <ToastProvider>
      <SkipLink />
      <div className="sticky top-0 z-30 bg-white/85 backdrop-blur-xl">
        <Header />
      </div>
      <main id="main" tabIndex={-1} className={cx('mx-auto w-full px-6 pt-4 pb-24 outline-none max-mobile:px-4', wide ? 'max-w-site' : 'max-w-[28rem]')}>
        {children}
      </main>
    </ToastProvider>
  )
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const { navigate, path } = useRouter()
  useEffect(() => {
    if (!loading && !user) navigate(`/login?next=${encodeURIComponent(path)}`, { replace: true })
  }, [loading, user, navigate, path])
  if (loading || !user)
    return (
      <AccountPage wide>
        <div role="status" aria-label="Loading" className="grid gap-6 pt-6 lg:grid-cols-[1fr_28rem]">
          <Skeleton className="h-64" />
          <Skeleton className="h-96" />
        </div>
      </AccountPage>
    )
  return <>{children}</>
}

/** Fetch-once hook with loading / error / reload. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true })
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fn().then(
      (data) => live && setState({ data, error: null, loading: false }),
      (e: unknown) => live && setState({ data: null, error: e instanceof Error ? e.message : 'Something went wrong.', loading: false }),
    )
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])
  return useMemo(() => ({ ...state, reload: () => setNonce((n) => n + 1) }), [state])
}
