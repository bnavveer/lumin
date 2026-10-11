import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CALL_PURPOSES, PURPOSE_LABEL, type CallPurposeKey, type CallsConfig, type CallScript, type ScriptedCall,
} from '../../../shared/calls'
import type { WorkflowStep } from '../../../shared/workflow'
import { Button, IconButton } from '../components/Button'
import { cx } from '../components/cx'
import { Icon } from '../components/icons'
import { useRouter } from '../site/router'
import { useAuth } from './auth'
import { Pill, timeAgo } from './ui'

// Scripted county calls: edit the questions, call the demo county line, watch it live, read the answers.
// API contract: shared/calls.ts.

const POLL_MS = 2000
const MAX_QUESTIONS = 8
const TERMINAL: ReadonlySet<ScriptedCall['status']> = new Set(['completed', 'failed', 'simulated'])

function useCallsApi() {
  const { getToken } = useAuth()
  return useCallback(async <T,>(path: string, body?: unknown): Promise<T> => {
    const token = await getToken()
    const headers = new Headers()
    if (token) headers.set('authorization', `Bearer ${token}`)
    if (body !== undefined) headers.set('content-type', 'application/json')
    const res = await fetch(path, body !== undefined ? { method: 'POST', headers, body: JSON.stringify(body) } : { headers })
    const j = (await res.json().catch(() => null)) as (T & { error?: string }) | null
    if (!res.ok) throw new Error(j?.error ?? `Something went wrong (${res.status}).`)
    return j as T
  }, [getToken])
}

export function CallPanel({ step }: { step: WorkflowStep }) {
  const { path } = useRouter()
  const workflowId = path.split('/')[2] ?? ''
  const call = useCallsApi()
  const [config, setConfig] = useState<CallsConfig | null>(null)
  const [calls, setCalls] = useState<ScriptedCall[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [open, setOpen] = useState(step.status === 'waiting_on_you')
  const base = `/api/workflows/${encodeURIComponent(workflowId)}/calls`

  const reloadCalls = useCallback(() => {
    call<ScriptedCall[]>(base).then(setCalls).catch(() => undefined)
  }, [call, base])

  useEffect(() => {
    call<CallsConfig>('/api/calls/config').then(setConfig).catch(() => setConfig(null))
    reloadCalls()
  }, [call, reloadCalls, step.status])

  useEffect(() => { if (step.status === 'waiting_on_you') setOpen(true) }, [step.status])

  const latest = calls[0]
  const shownId = activeId ?? (latest && !TERMINAL.has(latest.status) ? latest.id : latest?.id ?? null)

  return (
    <section id="call-panel" aria-label="County call" className="mt-4 flex flex-col gap-4 rounded-24 border border-border-tertiary bg-background-primary p-5 max-mobile:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon name="phone" size={18} />
          <h4 className="type-body-m font-medium">Call the county</h4>
          {config?.simulated && <Pill toneName="warn" label="SIMULATED" />}
        </div>
        <Button variant="outline" size="sm" icon={open ? 'chevron-up' : 'edit'} aria-expanded={open} aria-controls="call-editor" onClick={() => setOpen(!open)}>
          {open ? 'Hide questions' : 'Edit questions'}
        </Button>
      </div>
      {config && !config.enabled && (
        <p role="status" className="rounded-16 bg-amber-50 px-4 py-3 type-body-s text-amber-700">{config.message}</p>
      )}
      {config?.officePhoneMasked && (
        <p className="type-body-s text-secondary">Calls go to the demo county line: {config.officePhoneMasked}</p>
      )}
      {open && (
        <ScriptEditor workflowId={workflowId} base={base} enabled={Boolean(config?.enabled)}
          onStarted={(c) => { setCalls((cs) => [c, ...cs]); setActiveId(c.id) }} />
      )}
      {shownId && <LiveCallCard key={shownId} callId={shownId} onDone={reloadCalls} />}
      {calls.length > 1 && (
        <div>
          <h5 className="type-label-s font-medium text-secondary">Call history</h5>
          <ul className="mt-2 flex flex-col gap-1">
            {calls.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setActiveId(c.id)} aria-pressed={c.id === shownId}
                  className={cx('flex w-full items-center justify-between gap-3 rounded-12 px-3 py-2 text-left type-body-s hover:bg-background-tertiary focus-ring', c.id === shownId && 'bg-background-tertiary')}>
                  <span className="min-w-0 truncate">{c.script.goal}</span>
                  <span className="shrink-0 text-tertiary">{c.simulated ? 'Simulated · ' : ''}{statusText[c.status]} · {timeAgo(c.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function ScriptEditor({ workflowId, base, enabled, onStarted }: { workflowId: string; base: string; enabled: boolean; onStarted: (c: ScriptedCall) => void }) {
  const call = useCallsApi()
  const [purpose, setPurpose] = useState<CallPurposeKey>('confirm_interview')
  const [script, setScript] = useState<CallScript | null>(null)
  const [busy, setBusy] = useState<'suggest' | 'call' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle')
  const loaded = useRef(false)
  const dirty = useRef(false)

  const suggest = useCallback(async (p: CallPurposeKey) => {
    setBusy('suggest'); setError(null)
    try { dirty.current = true; setScript(await call<CallScript>(`${base}/suggest`, { purpose: p })) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(null) }
  }, [call, base])

  // Load the saved script (an email-proposed call stores one); otherwise suggest one.
  useEffect(() => {
    if (loaded.current || !workflowId) return
    loaded.current = true
    call<{ script: CallScript | null; purpose: CallPurposeKey | null }>(`${base}/script`)
      .then((r) => {
        if (r.purpose) setPurpose(r.purpose)
        if (r.script) setScript(r.script)
        else void suggest(r.purpose ?? 'confirm_interview')
      })
      .catch(() => void suggest('confirm_interview'))
  }, [call, base, suggest, workflowId])

  // Auto-save edits so "Approve" uses exactly these questions.
  useEffect(() => {
    if (!script || !dirty.current) return
    const valid = script.goal.trim() && script.questions.some((q) => q.trim())
    if (!valid) return
    setSaved('saving')
    const t = setTimeout(() => {
      call(`${base}/script`, { script: clean(script), purpose }).then(() => setSaved('saved')).catch(() => setSaved('idle'))
    }, 700)
    return () => clearTimeout(t)
  }, [script, purpose, call, base])

  const edit = (next: CallScript) => { dirty.current = true; setScript(next) }
  const setQ = (i: number, v: string) => script && edit({ ...script, questions: script.questions.map((q, j) => (j === i ? v : q)) })
  const move = (i: number, d: -1 | 1) => {
    if (!script) return
    const qs = [...script.questions]
    const j = i + d
    if (j < 0 || j >= qs.length) return
    ;[qs[i], qs[j]] = [qs[j]!, qs[i]!]
    edit({ ...script, questions: qs })
  }

  const callNow = async () => {
    if (!script) return
    setBusy('call'); setError(null)
    try { onStarted(await call<ScriptedCall>(base, { script: clean(script), purpose })) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(null) }
  }

  return (
    <div id="call-editor" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-1 basis-48 flex-col gap-1 type-label-s font-medium">
          Purpose
          <select value={purpose} onChange={(e) => setPurpose(e.target.value as CallPurposeKey)}
            className="h-10 rounded-12 border border-border-primary bg-background-primary px-3 type-body-s focus-ring">
            {CALL_PURPOSES.map((p) => <option key={p} value={p}>{PURPOSE_LABEL[p]}</option>)}
          </select>
        </label>
        <Button variant="secondary" size="sm" icon={busy === 'suggest' ? 'spinner' : 'refresh'} disabled={busy !== null} onClick={() => void suggest(purpose)}>
          {busy === 'suggest' ? 'Thinking…' : 'Suggest questions'}
        </Button>
      </div>
      {script && (
        <>
          <label className="flex flex-col gap-1 type-label-s font-medium">
            Goal
            <input value={script.goal} maxLength={300} onChange={(e) => edit({ ...script, goal: e.target.value })}
              className="h-10 rounded-12 border border-border-primary bg-background-primary px-3 type-body-s font-normal focus-ring" />
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="type-label-s font-medium">Questions Lumin will ask, in order</legend>
            <ol className="flex flex-col gap-2">
              {script.questions.map((q, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-right type-label-s text-tertiary" aria-hidden="true">{i + 1}.</span>
                  <input value={q} maxLength={300} aria-label={`Question ${i + 1}`} onChange={(e) => setQ(i, e.target.value)}
                    className="h-10 min-w-0 flex-1 rounded-12 border border-border-primary bg-background-primary px-3 type-body-s focus-ring" />
                  <IconButton size="sm" icon="chevron-up" label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} />
                  <IconButton size="sm" icon="chevron-down" label={`Move question ${i + 1} down`} disabled={i === script.questions.length - 1} onClick={() => move(i, 1)} />
                  <IconButton size="sm" icon="close" label={`Remove question ${i + 1}`} disabled={script.questions.length <= 1}
                    onClick={() => edit({ ...script, questions: script.questions.filter((_, j) => j !== i) })} />
                </li>
              ))}
            </ol>
            <div>
              <Button variant="ghost" size="sm" icon="plus" disabled={script.questions.length >= MAX_QUESTIONS}
                onClick={() => edit({ ...script, questions: [...script.questions, ''] })}>Add question</Button>
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" icon={busy === 'call' ? 'spinner' : 'phone'} disabled={!enabled || busy !== null || !clean(script).questions.length} onClick={() => void callNow()}>
              {busy === 'call' ? 'Starting…' : 'Call now'}
            </Button>
            <span className="type-body-s text-tertiary" aria-live="polite">
              {saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved. Approving the call step uses these questions.' : ''}
            </span>
          </div>
        </>
      )}
      {error && <p role="alert" className="type-body-s text-red-600">{error}</p>}
    </div>
  )
}

const clean = (s: CallScript): CallScript => ({ ...s, goal: s.goal.trim(), questions: s.questions.map((q) => q.trim()).filter(Boolean) })

const statusText: Record<ScriptedCall['status'], string> = {
  queued: 'Dialing', ringing: 'Ringing', in_progress: 'In progress', completed: 'Done', failed: 'Failed', simulated: 'Done',
}
const STAGES = ['Dialing', 'Ringing', 'In progress', 'Done'] as const
const stageOf = (s: ScriptedCall['status']): number => ({ queued: 0, ringing: 1, in_progress: 2, completed: 3, simulated: 3, failed: 3 })[s]

function LiveCallCard({ callId, onDone }: { callId: string; onDone: () => void }) {
  const call = useCallsApi()
  const [c, setC] = useState<ScriptedCall | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    let stop = false
    let t: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      try {
        const next = await call<ScriptedCall>(`/api/calls/${encodeURIComponent(callId)}`)
        if (stop) return
        setC(next); setErr(null)
        if (TERMINAL.has(next.status)) { doneRef.current(); return }
      } catch (e) { if (!stop) setErr(e instanceof Error ? e.message : String(e)) }
      if (!stop) t = setTimeout(tick, POLL_MS)
    }
    void tick()
    return () => { stop = true; if (t) clearTimeout(t) }
  }, [call, callId])

  const stage = useMemo(() => (c ? stageOf(c.status) : 0), [c])
  if (!c) return <p className="type-body-s text-secondary" role="status">{err ?? 'Loading call…'}</p>
  const failed = c.status === 'failed'

  return (
    <article aria-label="Live call" className="flex flex-col gap-4 rounded-16 bg-background-tertiary p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h5 className="type-body-m font-medium">{c.script.goal}</h5>
        {c.simulated && <Pill toneName="warn" label="SIMULATED" />}
        {c.trigger === 'email' && <Pill toneName="info" icon="message" label="From a county email" />}
      </div>
      <ol className="grid grid-cols-4 gap-2" aria-label="Call progress">
        {STAGES.map((label, i) => {
          const reached = i <= stage
          const current = i === stage && !TERMINAL.has(c.status)
          return (
            <li key={label} aria-current={current ? 'step' : undefined} className="flex flex-col gap-1.5">
              <span className={cx('h-1.5 rounded-full', reached ? (failed && i === 3 ? 'bg-red-600' : 'bg-blue-700') : 'bg-border-tertiary', current && 'animate-pulse motion-reduce:animate-none')} />
              <span className={cx('type-label-s', reached ? 'text-primary' : 'text-tertiary')}>{i === 3 && failed ? 'Failed' : label}</span>
            </li>
          )
        })}
      </ol>
      {failed && <p role="alert" className="type-body-s text-red-600">{c.error ?? 'The call did not finish.'}</p>}
      {c.summary && <p className="type-body-m">{c.summary}</p>}
      {c.answers && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[20rem] border-collapse type-body-s">
            <caption className="sr-only">Answers from the county</caption>
            <thead>
              <tr className="text-left text-secondary">
                <th scope="col" className="py-2 pr-3 font-medium">Question</th>
                <th scope="col" className="py-2 pr-3 font-medium">Answer</th>
                <th scope="col" className="py-2 font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {c.answers.map((a, i) => (
                <tr key={i} className="border-t border-border-tertiary align-top">
                  <td className="py-2 pr-3">{a.question}</td>
                  <td className={cx('py-2 pr-3', !a.answer && 'text-tertiary')}>{a.answer ?? 'Not answered'}</td>
                  <td className="py-2"><Pill toneName={a.confidence === 'high' ? 'good' : a.confidence === 'medium' ? 'info' : 'neutral'} label={a.confidence} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {c.transcript && (
        <details className="group">
          <summary className="cursor-pointer type-label-s font-medium text-blue-700 focus-ring">
            {c.simulated ? 'Show SIMULATED transcript' : 'Show transcript'}
          </summary>
          <pre className="mt-2 max-h-80 overflow-auto rounded-12 bg-background-primary p-3 type-body-s whitespace-pre-wrap">{c.transcript}</pre>
        </details>
      )}
    </article>
  )
}
