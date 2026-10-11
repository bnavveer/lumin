import { useEffect, useMemo, useRef, useState } from 'react'
import type { ApplicationProgram } from '../../../shared/chat'
import type { WorkflowSummary } from '../../../shared/workflow'
import { Button } from '../components/Button'
import { Icon } from '../components/icons'
import { useChat } from '../site/chat/useChat'
import { Link, useRouter } from '../site/router'
import { useAuth } from './auth'
import { makeApi } from './api'
import { ChatPanel, seedChatSession } from './DashboardChat'
import { ProgramPicker } from './ProgramPicker'
import { ReadinessCard } from './ReadinessCard'
import { ContactCard } from './ContactCard'
import type { Answers } from './relevance'
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
  // The chat can fill in answers and application details, so refresh after each reply.
  const replies = chat.messages.filter((m) => m.role === 'assistant').length
  const details = useAsync(() => api.applicationDetails(), [api, replies])
  const answers = useAsync(() => api.screening(), [api, replies])
  const docs = useAsync(() => api.documents(), [api])
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

  // "Answer in the chat": ask Lumin to collect whatever is still missing.
  const finishInChat = () => {
    focusChat()
    if (!chat.busy) void chat.send('I want to finish my application details. Ask me what you still need.')
  }

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
            <div className="min-w-0">
              <h1 className="font-serif text-[clamp(2.25rem,4vw,3.25rem)] leading-[1.02] tracking-[-0.035em] text-balance [font-variation-settings:'opsz'_72]">
                {me.data?.firstName ? `${me.data.firstName}, here’s what’s next.` : 'Here’s what’s next.'}
              </h1>
              <p className="mt-3 max-w-[34rem] type-body-m text-secondary">Your applications, documents and next steps, all in one place.</p>
            </div>
            {!showPicker && (
              <Button icon="plus" onClick={() => setPickerOpen(true)}>Start a new application</Button>
            )}
          </div>

          <div className="mt-8">
            <ReadinessCard readiness={details.data?.readiness ?? null} loading={details.loading} onAskChat={finishInChat} />
          </div>

          {showPicker && (
            <div className="mt-8">
              <ProgramPicker
                screening={screening}
                answers={(answers.data ?? {}) as Answers}
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

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <ContactCard me={me.data} loading={me.loading} email={user?.email ?? ''} api={api} onSaved={me.reload} />
            <DocumentsShortcut count={docs.data?.length ?? null} />
          </div>
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
  ['Tell Lumin what you need', 'Chat in your own words. Lumin asks only what the programs require.'],
  ['Pick programs', 'Choose which benefits to apply for from Lumin’s suggestions.'],
  ['Lumin researches and applies', 'It reads the current rules, fills out each application in a private browser, and can call or text the county for you.'],
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
        <Button variant="outline" icon="message" onClick={onAskChat}>Talk to Lumin first</Button>
      </div>
    </section>
  )
}

// ── Documents shortcut ───────────────────────────────────────────────────
function DocumentsShortcut({ count }: { count: number | null }) {
  return (
    <Link
      href="/account/documents"
      className="group relative flex flex-col overflow-hidden rounded-[2rem] bg-[linear-gradient(180deg,#052430_0%,#0b4a5e_100%)] p-6 text-white transition-transform duration-300 ease-out-quint hover:-translate-y-0.5 focus-ring max-mobile:p-5"
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-white text-blue-700">
        <Icon name="document" size={19} />
      </span>
      <span className="mt-5 type-card-title">Your documents</span>
      <span className="mt-1 type-body-s text-white/75">
        {count === null ? 'Pay stubs, IDs and letters, kept private.' : count === 0 ? 'Nothing uploaded yet. Add a pay stub or ID.' : `${count} ${count === 1 ? 'document' : 'documents'} saved privately.`}
      </span>
      <span className="mt-auto flex items-center gap-1.5 pt-5 type-body-s font-medium">
        Open your documents
        <Icon name="arrow-right" size={15} className="transition-transform duration-300 group-hover:translate-x-1" />
      </span>
    </Link>
  )
}
