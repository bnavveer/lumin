import { useEffect, useMemo, useRef, useState } from 'react'
import type { Workflow } from '../../../shared/workflow'
import { Button } from '../components/Button'
import { Icon } from '../components/icons'
import { Link, useRouter } from '../site/router'
import { makeApi } from './api'
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

function liveViewFor(w: Workflow): string | null {
  const running = w.steps.some((s) => s.kind === 'fill' && s.status === 'running')
  if (!running) return null
  const fromEvidence = w.steps.flatMap((s) => s.evidence).find((e) => e.kind === 'live_view' && safeUrl(e.url))?.url
  return safeUrl(w.liveViewUrl) ?? safeUrl(fromEvidence)
}

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
      {workflow && <Loaded w={workflow} actions={actions} />}
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

function Loaded({ w, actions }: { w: Workflow; actions: StepActions }) {
  const done = w.steps.filter((s) => s.status === 'done' || s.status === 'skipped').length
  const live = liveViewFor(w)
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

      {live && (
        <section aria-labelledby="live-title" className="rounded-32 bg-blue-900 p-3 text-white">
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
            <h2 id="live-title" className="flex items-center gap-2 type-heading-s text-white">
              <span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-flag-red motion-reduce:animate-none" />Aid is filling out your application
            </h2>
            <OpenLive href={live} />
          </div>
          <div className="aspect-[16/10] overflow-hidden rounded-24 bg-black">
            <iframe title="Live view of the browser where Aid is filling out your application" src={live} sandbox="allow-same-origin allow-scripts" referrerPolicy="no-referrer" loading="lazy" className="size-full border-0" />
          </div>
        </section>
      )}

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
