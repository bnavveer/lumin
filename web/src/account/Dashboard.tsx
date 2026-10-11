import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { ApplicationProgram } from '../../../shared/chat'
import type { Me, WorkflowSummary } from '../../../shared/workflow'
import { Button } from '../components/Button'
import { TextField } from '../components/Form'
import { Icon } from '../components/icons'
import { useChat } from '../site/chat/useChat'
import { Link, useRouter } from '../site/router'
import { useAuth } from './auth'
import { makeApi, type Api } from './api'
import { ChatPanel, seedChatSession } from './DashboardChat'
import { ProgramPicker } from './ProgramPicker'
import { AccountPage, ActorBadge, ErrorState, ProgressBar, programList, RequireAuth, Skeleton, StatusPill, timeAgo, useAsync, useToast } from './ui'

export function Dashboard() {
  return (
    <RequireAuth>
      <DashboardSeeded />
    </RequireAuth>
  )
}

// useChat reads its saved session when it mounts, so seed it first.
function DashboardSeeded() {
  const { user } = useAuth()
  const [ready] = useState(() => (user ? (seedChatSession(user.id), true) : false))
  return ready ? <DashboardView /> : null
}

function DashboardView() {
  const { user, getToken } = useAuth()
  const { navigate, search } = useRouter()
  const toast = useToast()
  const api = useMemo(() => makeApi(getToken), [getToken])
  const chat = useChat()
  const chatRef = useRef<HTMLElement | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [starting, setStarting] = useState(false)

  const me = useAsync(() => api.me(), [api])
  const workflows = useAsync(() => api.listWorkflows(), [api])
  const sessionId = chat.view?.sessionId ?? undefined
  // Only react to a screening once the chat has produced a likely match.
  const matchCount = chat.messages.length > 0 ? (chat.view?.screening?.matches.filter((m) => m.status === 'likely').length ?? 0) : 0
  const suggestions = useAsync(() => (pickerOpen || matchCount > 0 ? api.suggestions(sessionId) : Promise.resolve(null)), [api, sessionId, pickerOpen, matchCount])

  // Chat finished a screening: surface the picker (once, until dismissed).
  const showPicker = pickerOpen || (matchCount > 0 && !dismissed)

  const focusChat = () => {
    chatRef.current?.scrollIntoView({ block: 'nearest' })
    chatRef.current?.querySelector('textarea')?.focus()
  }
  useEffect(() => {
    if (new URLSearchParams(search).get('focus') === 'chat') setTimeout(focusChat, 100)
  }, [search])

  async function start(programs: ApplicationProgram[]) {
    setStarting(true)
    try {
      const wf = await api.createWorkflow(programs, sessionId)
      navigate(`/workflows/${wf.id}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not start the application.')
      setStarting(false)
    }
  }

  // Fall back to the chat's own screening if the suggestions call failed.
  const screening = suggestions.data ?? chat.view?.screening ?? null

  return (
    <AccountPage wide>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,30rem)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-serif text-[2.75rem] leading-none tracking-[-0.035em] [font-variation-settings:'opsz'_72] max-mobile:text-[2.25rem]">Your applications</h1>
              <ProfileChip me={me.data} loading={me.loading} email={user?.email ?? ''} api={api} onSaved={me.reload} />
            </div>
            {!showPicker && (
              <Button icon="plus" onClick={() => setPickerOpen(true)}>Start a new application</Button>
            )}
          </div>

          {showPicker && (
            <div className="mt-8">
              <ProgramPicker
                screening={screening}
                loading={suggestions.loading && !screening}
                error={suggestions.error && !screening ? suggestions.error : null}
                onRetry={suggestions.reload}
                starting={starting}
                onStart={start}
                onCancel={() => { setPickerOpen(false); setDismissed(true) }}
                onAskChat={focusChat}
              />
            </div>
          )}

          <WorkflowList
            loading={workflows.loading}
            error={workflows.error}
            items={workflows.data}
            onRetry={workflows.reload}
            onStart={() => setPickerOpen(true)}
            onAskChat={focusChat}
            hidePrompt={showPicker}
          />
        </div>

        <div className="h-[34rem] lg:sticky lg:top-24 lg:h-[calc(100dvh-8rem)] lg:max-h-[52rem]">
          <ChatPanel chat={chat} userId={user?.id ?? ''} firstName={me.data?.firstName ?? null} inputRef={chatRef} />
        </div>
      </div>
    </AccountPage>
  )
}

// ── Workflow list ────────────────────────────────────────────────────────
function WorkflowList({ loading, error, items, onRetry, onStart, onAskChat, hidePrompt }: {
  loading: boolean; error: string | null; items: WorkflowSummary[] | null; onRetry: () => void; onStart: () => void; onAskChat: () => void; hidePrompt: boolean
}) {
  if (loading && !items)
    return <div className="mt-8 grid gap-4" role="status" aria-label="Loading your applications"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
  if (error && !items) return <div className="mt-8"><ErrorState message={error} onRetry={onRetry} /></div>
  if (!items || items.length === 0) return hidePrompt ? null : <EmptyState onStart={onStart} onAskChat={onAskChat} />
  return (
    <ul className="mt-8 grid gap-4">
      {items.map((w) => <li key={w.id}><WorkflowCard w={w} /></li>)}
    </ul>
  )
}

function WorkflowCard({ w }: { w: WorkflowSummary }) {
  return (
    <article className="group relative rounded-32 bg-background-tertiary p-6 transition-colors duration-200 hover:bg-background-secondary has-[a:focus-visible]:shadow-focus max-mobile:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="type-card-title">
          <Link href={`/workflows/${w.id}`} className="outline-none after:absolute after:inset-0 after:rounded-32">{programList(w.programs)}</Link>
        </h2>
        <StatusPill status={w.status} />
      </div>
      <div className="mt-4"><ProgressBar done={w.progress.done} total={w.progress.total} label={`${programList(w.programs)} progress`} /></div>
      {w.nextStep && (
        <div className="mt-5 flex items-start gap-3 rounded-24 bg-background-primary p-4">
          <ActorBadge actor={w.nextStep.actor} />
          <div className="min-w-0">
            <p className="type-body-m font-medium">{w.nextStep.title}</p>
            {w.nextStep.detail && <p className="mt-0.5 type-body-s text-secondary">{w.nextStep.detail}</p>}
          </div>
        </div>
      )}
      <p className="mt-4 flex items-center justify-between type-label-s text-tertiary">
        <span>Updated {timeAgo(w.updatedAt)}</span>
        <span className="inline-flex items-center gap-1 text-link">View details <Icon name="arrow-right" size={14} /></span>
      </p>
    </article>
  )
}

const flow = [
  ['Tell Aid what you need', 'Chat in your own words. Aid asks only what the programs require.'],
  ['Pick programs', 'Choose which benefits to apply for from Aid’s suggestions.'],
  ['Aid researches and applies', 'It reads the current rules, fills out each application in a private browser, and can call or text the county for you.'],
  ['You review and sign', 'You approve before anything is sent, and follow every step here with proof.'],
]

function EmptyState({ onStart, onAskChat }: { onStart: () => void; onAskChat: () => void }) {
  return (
    <section aria-labelledby="empty-title" className="mt-8 rounded-32 bg-background-tertiary p-8 max-mobile:p-5">
      <h2 id="empty-title" className="type-heading-s">No applications yet</h2>
      <p className="mt-1 type-body-m text-secondary">Here’s how it works once you start one.</p>
      <ol className="mt-6 grid gap-5 sm:grid-cols-2">
        {flow.map(([title, body], i) => (
          <li key={title} className="flex gap-4">
            <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-700 type-label-m text-white">{i + 1}</span>
            <div>
              <p className="type-body-m font-medium">{title}</p>
              <p className="mt-1 type-body-s text-secondary">{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button icon="plus" onClick={onStart}>Start a new application</Button>
        <Button variant="outline" icon="message" onClick={onAskChat}>Talk to Aid first</Button>
      </div>
    </section>
  )
}

// ── Profile chip ─────────────────────────────────────────────────────────
function ProfileChip({ me, loading, email, api, onSaved }: { me: Me | null; loading: boolean; email: string; api: Api; onSaved: () => void }) {
  const { signOut } = useAuth()
  const { navigate } = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const name = me?.firstName || email.split('@')[0] || 'Account'

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    try {
      await api.updateProfile({ firstName: String(f.get('firstName') ?? '').trim() || undefined, phone: String(f.get('phone') ?? '').trim() || undefined })
      onSaved()
      setOpen(false)
      toast('Profile saved.', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save your profile.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="profile-panel"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border-tertiary pr-3 pl-1.5 type-body-s transition-colors hover:bg-background-tertiary focus-ring"
      >
        <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full bg-blue-700 type-label-s font-medium text-white uppercase">{name.slice(0, 1)}</span>
        {loading ? <span className="h-3 w-16 animate-pulse rounded bg-background-secondary" /> : <span className="font-medium">{name}</span>}
        {me?.phone && <span className="text-secondary max-mobile:hidden">{me.phone}</span>}
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} />
      </button>
      {open && (
        <form id="profile-panel" onSubmit={save} className="mt-3 grid max-w-md gap-4 rounded-24 border border-border-tertiary bg-background-primary p-5 shadow-soft-md">
          <p className="type-body-s text-secondary">Signed in as {email}</p>
          <TextField label="First name" name="firstName" defaultValue={me?.firstName ?? ''} autoComplete="given-name" />
          <TextField label="Mobile phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={me?.phone ?? ''} optional hint="So Aid can text you updates." />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="sm" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
            <Button variant="outline" size="sm" onClick={async () => { await signOut(); navigate('/') }}>Sign out</Button>
          </div>
        </form>
      )}
    </div>
  )
}
