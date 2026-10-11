import type { StepStatus, WorkflowStep } from '../../../shared/workflow'
import { cx } from '../components/cx'
import { CallPanel } from './CallPanel'
import { EvidenceList } from './EvidenceView'
import { programNames, StepIcon, stepStatusLabel, timeAgo } from './ui'

const textTone: Record<StepStatus, string> = {
  pending: 'text-tertiary', running: 'text-blue-600', waiting_on_you: 'text-blue-700', done: 'text-green-600', failed: 'text-red-600', skipped: 'text-tertiary',
}

export function Timeline({ steps }: { steps: WorkflowStep[] }) {
  return (
    <ol className="relative flex flex-col" aria-label="Application steps">
      {steps.map((s, i) => {
        const last = i === steps.length - 1
        const muted = s.status === 'pending' || s.status === 'skipped'
        return (
          <li key={s.id} id={`step-${s.id}`} className="relative flex gap-4 pb-8 last:pb-0 max-mobile:gap-3" aria-current={s.status === 'running' || s.status === 'waiting_on_you' ? 'step' : undefined}>
            {!last && <span aria-hidden="true" className={cx('absolute top-9 bottom-0 left-4 -ml-px w-0.5', s.status === 'done' ? 'bg-green-600/40' : 'bg-border-tertiary')} />}
            <div className="relative z-10 shrink-0"><StepIcon status={s.status} /></div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className={cx('type-card-title', muted && 'text-secondary')}>{s.title}</h3>
                {s.program && <span className="type-label-s text-tertiary">{programNames[s.program]}</span>}
              </div>
              <p className={cx('mt-1 type-label-s font-medium', textTone[s.status])}>
                {stepStatusLabel[s.status]}
                {s.finishedAt && <span className="font-normal text-tertiary"> · {timeAgo(s.finishedAt)}</span>}
              </p>
              <Summary step={s} />
              <EvidenceList items={s.evidence} />
              {s.kind === 'call' && s.status !== 'skipped' && <CallPanel step={s} />}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// The fill step streams progress lines, one per line of summary.
function Summary({ step }: { step: WorkflowStep }) {
  if (!step.summary) return null
  if (step.kind === 'fill') {
    const lines = step.summary.split('\n').filter(Boolean)
    return (
      <ul className="mt-3 flex flex-col gap-1.5 rounded-16 bg-background-tertiary px-4 py-3" aria-label="Progress">
        {lines.map((l, i) => {
          const active = step.status === 'running' && i === lines.length - 1
          return (
            <li key={i} className="flex items-start gap-2 type-body-s">
              <span className="mt-1 flex size-3.5 shrink-0 items-center justify-center">
                {active ? <span className="size-2 animate-pulse rounded-full bg-blue-600 motion-reduce:animate-none" /> : <span className="size-1.5 rounded-full bg-border-secondary" />}
              </span>
              <span className={active ? 'font-medium' : 'text-secondary'}>{l}</span>
            </li>
          )
        })}
      </ul>
    )
  }
  return <p className="mt-2 max-w-prose type-body-m text-secondary">{step.summary}</p>
}
