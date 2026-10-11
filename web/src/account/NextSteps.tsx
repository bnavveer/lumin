import { useRef } from 'react'
import type { NextStep } from '../../../shared/workflow'
import { Button } from '../components/Button'
import { Icon } from '../components/icons'
import { ActorBadge, safeUrl } from './ui'

export type StepActions = {
  busy: string | null
  upload: (file: File, docType: string, key: string) => void
  approve: (stepId: string, decision: 'approve' | 'decline', key: string) => void
  run: (stepId: string, key: string) => void
  openChat: () => void
}

export function NextSteps({ steps, actions }: { steps: NextStep[]; actions: StepActions }) {
  return (
    <section aria-labelledby="next-title" className="rounded-32 bg-background-tertiary p-6 max-mobile:p-4">
      <h2 id="next-title" className="type-heading-s">Next steps</h2>
      {steps.length === 0 ? (
        <p className="mt-3 type-body-m text-secondary">Nothing for you to do right now. Aid will tell you the moment something changes.</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {steps.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-24 bg-background-primary p-4">
              <div className="min-w-0 flex-1 basis-60">
                <div className="flex items-center gap-2"><ActorBadge actor={n.actor} /><p className="type-body-m font-medium">{n.title}</p></div>
                {n.detail && <p className="mt-1.5 type-body-s text-secondary">{n.detail}</p>}
              </div>
              <ActionControl n={n} actions={actions} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ActionControl({ n, actions }: { n: NextStep; actions: StepActions }) {
  const a = n.action
  const file = useRef<HTMLInputElement>(null)
  if (!a) return null
  const key = n.id
  const busy = actions.busy === key
  const url = safeUrl(a.url)
  const stepId = a.stepId

  switch (a.type) {
    case 'upload':
      return (
        <>
          <input ref={file} type="file" accept="application/pdf,image/*" className="sr-only" tabIndex={-1} aria-label={`${a.label}${a.docType ? ` (${a.docType})` : ''}`}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) actions.upload(f, a.docType ?? 'other', key) }} />
          <Button variant="primary" size="sm" icon={busy ? 'spinner' : 'paperclip'} disabled={busy} aria-busy={busy} onClick={() => file.current?.click()}>{busy ? 'Uploading…' : a.label}</Button>
        </>
      )
    case 'sign':
      return (
        <div className="flex flex-wrap gap-2">
          {url && <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-full bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 focus-ring">{a.label}<Icon name="external" size={14} /><span className="sr-only"> (opens in a new tab)</span></a>}
          <Button variant="outline" size="sm" icon={busy ? 'spinner' : 'check'} disabled={busy || !stepId} onClick={() => stepId && actions.approve(stepId, 'approve', key)}>I’ve signed</Button>
        </div>
      )
    case 'approve':
      return (
        <div className="flex flex-wrap gap-2">
          {/call/i.test(n.title) && stepId && (
            <a href="#call-panel" className="inline-flex h-9 items-center gap-2 rounded-full border border-border-primary px-4 text-sm font-medium hover:bg-background-tertiary focus-ring">
              <Icon name="edit" size={14} />Edit questions
            </a>
          )}
          <Button size="sm" icon={busy ? 'spinner' : 'check'} disabled={busy || !stepId} onClick={() => stepId && actions.approve(stepId, 'approve', key)}>Approve</Button>
          <Button variant="outline" size="sm" disabled={busy || !stepId} onClick={() => stepId && actions.approve(stepId, 'decline', key)}>Decline</Button>
        </div>
      )
    case 'open_url':
      return url ? (
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-full border border-border-primary px-4 text-sm font-medium hover:bg-background-tertiary focus-ring">{a.label}<Icon name="external" size={14} /><span className="sr-only"> (opens in a new tab)</span></a>
      ) : null
    case 'run':
      return <Button variant="outline" size="sm" icon={busy ? 'spinner' : 'refresh'} disabled={busy || !stepId} onClick={() => stepId && actions.run(stepId, key)}>{a.label || 'Retry'}</Button>
    case 'chat':
      return <Button variant="outline" size="sm" icon="message" onClick={actions.openChat}>{a.label}</Button>
  }
}
