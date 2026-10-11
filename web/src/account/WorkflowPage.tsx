import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Workflow } from '../../../shared/workflow'
import { Button } from '../components/Button'
import { Icon } from '../components/icons'
import { Link, useRouter } from '../site/router'
import { makeApi, type Api } from './api'
import { useAuth } from './auth'
import { OpenLive } from './EvidenceView'
import { NextSteps, type StepActions } from './NextSteps'
import { Timeline } from './Timeline'
import { useWorkflow } from './useWorkflow'
import { AccountPage, ErrorState, ProgressBar, programList, RequireAuth, safeUrl, Skeleton, StatusPill, useToast } from './ui'

export function WorkflowPage() {
  return (
    <RequireAuth>
      <WorkflowView />
    </RequireAuth>
  )
}

/** Show the live panel while filling, and while the browser is held open for signing. */
function liveViewFor(w: Workflow): string | null {
  const fill = w.steps.find((s) => s.kind === 'fill' && s.status !== 'skipped')
  const sign = w.steps.find((s) => s.kind === 'sign')
  const active = fill?.status === 'running' || (fill?.status === 'done' && sign?.status !== 'done' && Boolean(w.liveViewUrl))
  if (!active) return null
  const fromEvidence = w.steps.flatMap((s) => s.evidence).find((e) => e.kind === 'live_view' && safeUrl(e.url))?.url
  return safeUrl(w.liveViewUrl) ?? safeUrl(fromEvidence)
}

const replayFor = (w: Workflow): string | null =>
  safeUrl(w.steps.flatMap((s) => s.evidence).find((e) => e.kind === 'replay' && safeUrl(e.url))?.url)

function WorkflowView() {
  const { getToken } = useAuth()
  const { path, navigate } = useRouter()
  const id = decodeURIComponent(path.split('/')[2] ?? '')
  const api = useMemo(() => makeApi(getToken), [getToken])
  const { workflow, error, loading, reload, replace } = useWorkflow(api, id)
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  async function act(key: string, fn: () => Promise<Workflow>) {
    setBusy(key)
    try {
      replace(await fn())
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That didn’t work. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const actions: StepActions = {
    busy,
    upload: (file, docType, key) => void act(key, () => api.uploadDocument(id, file, docType)),
    approve: (stepId, decision, key) => void act(key, () => api.approve(id, stepId, decision)),
    run: (stepId, key) => void act(key, () => api.run(id, stepId)),
    openChat: () => navigate('/dashboard?focus=chat'),
  }

  return (
    <AccountPage wide>
      <Link href="/dashboard" className="mb-6 inline-flex items-center gap-1.5 rounded-8 type-body-s text-secondary hover:text-primary focus-ring">
        <Icon name="arrow-left" size={16} />All applications
      </Link>
      {loading && !workflow && <WorkflowSkeleton />}
      {error && !workflow && <ErrorState message={error} onRetry={() => void reload()} />}
      {workflow && <Loaded w={workflow} actions={actions} api={api} />}
    </AccountPage>
  )
}

function WorkflowSkeleton() {
  return (
    <div role="status" aria-label="Loading application" className="grid gap-6">
      <Skeleton className="h-32" /><Skeleton className="h-48" /><Skeleton className="h-96" />
    </div>
  )
}

function Loaded({ w, actions, api }: { w: Workflow; actions: StepActions; api: Api }) {
  const done = w.steps.filter((s) => s.status === 'done' || s.status === 'skipped').length
  const live = liveViewFor(w)
  const replay = replayFor(w)
  const lastStatus = useRef(w.status)
  const [announce, setAnnounce] = useState('')
  useEffect(() => {
    if (lastStatus.current !== w.status) {
      lastStatus.current = w.status
      setAnnounce(`Status updated: ${w.status.replace(/_/g, ' ')}`)
    }
  }, [w.status])

  return (
    <div className="grid gap-8">
      <header className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-[2.75rem] leading-[1.05] tracking-[-0.035em] [font-variation-settings:'opsz'_72] max-mobile:text-[2.25rem]">{programList(w.programs)}</h1>
          <StatusPill status={w.status} />
        </div>
        <div className="max-w-xl"><ProgressBar done={done} total={w.steps.length} label="Application progress" /></div>
        <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      </header>

      <NextSteps steps={w.nextSteps} actions={actions} />

      {live && <LivePanel workflowId={w.id} initialUrl={live} replayUrl={replay} api={api} filling={w.steps.some((s) => s.kind === 'fill' && s.status === 'running')} />}

      <section aria-labelledby="steps-title">
        <h2 id="steps-title" className="mb-6 type-heading-s">What Aid is doing</h2>
        <Timeline steps={w.steps} />
      </section>

      <div>
        <Button variant="ghost" size="sm" icon="message" className="text-secondary" onClick={actions.openChat}>Ask Aid about this application</Button>
      </div>
    </div>
  )
}

type LiveState = { url: string | null; status: 'live' | 'ended' | 'checking'; replayUrl: string | null }

/**
 * Live view of the Kernel browser. Kernel links can rotate and the browser ends after the hold, so the
 * URL is re-fetched from GET /api/workflows/:id/live on mount, on "Refresh" and when the frame fails.
 * The new-tab button is the reliable path; the iframe is a best-effort preview.
 */
function LivePanel({ workflowId, initialUrl, replayUrl, api, filling }: { workflowId: string; initialUrl: string; replayUrl: string | null; api: Api; filling: boolean }) {
  const [state, setState] = useState<LiveState>({ url: initialUrl, status: 'checking', replayUrl })
  const refresh = useCallback(async () => {
    if (!api.live) { setState((s) => ({ ...s, status: 'live' })); return }
    setState((s) => ({ ...s, status: 'checking' }))
    try {
      const r = await api.live(workflowId)
      setState({ url: safeUrl(r.url), status: r.status, replayUrl: safeUrl(r.replayUrl) ?? replayUrl })
    } catch {
      setState((s) => ({ ...s, status: 'live' }))
    }
  }, [api, workflowId, replayUrl])
  useEffect(() => { void refresh() }, [refresh])

  const url = state.url
  if (state.status === 'ended' || !url) {
    return (
      <section aria-labelledby="live-title" className="flex flex-wrap items-center justify-between gap-3 rounded-32 bg-blue-900 p-5 text-white">
        <div>
          <h2 id="live-title" className="type-heading-s text-white">The live browser session has ended</h2>
          <p className="type-body-s text-white/80">{state.replayUrl ? 'You can still watch the recording of everything Aid did.' : 'A recording will appear in the steps below when it is ready.'}</p>
        </div>
        {state.replayUrl && <a href={state.replayUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-blue-900 focus-ring">Watch replay<span className="sr-only"> (opens in a new tab)</span></a>}
      </section>
    )
  }
  return (
    <section aria-labelledby="live-title" className="rounded-32 bg-blue-900 p-3 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
        <h2 id="live-title" className="flex items-center gap-2 type-heading-s text-white">
          <span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-flag-red motion-reduce:animate-none" />
          {filling ? 'Aid is filling out your application' : 'Your application is open and waiting for your signature'}
        </h2>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void refresh()} className="inline-flex h-9 items-center rounded-full border border-white/40 px-4 text-sm font-medium hover:bg-white/10 focus-ring">
            {state.status === 'checking' ? 'Checking…' : 'Refresh'}
          </button>
          <OpenLive href={url} />
        </div>
      </div>
      <p className="px-3 pb-2 type-body-s text-white/80">For the best view, and to sign, use “Open live browser” (new tab). The preview below may not load on every network.</p>
      <div className="aspect-[16/10] overflow-hidden rounded-24 bg-black">
        <iframe key={url} title="Live view of the browser where Aid is filling out your application" src={url} referrerPolicy="no-referrer" allow="clipboard-read; clipboard-write" onError={() => void refresh()} className="size-full border-0" />
      </div>
    </section>
  )
}
