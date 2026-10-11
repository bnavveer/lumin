import { useState } from 'react'
import type { ApplicationMatch, ApplicationProgram, ApplicationScreening } from '../../../shared/chat'
import { StatusBadge, type Status } from '../components/Benefits'
import { Button } from '../components/Button'
import { cx } from '../components/cx'
import { Icon } from '../components/icons'
import { ErrorState, Skeleton } from './ui'

// Suggestions from GET /api/me/suggestions as selectable cards. The "likely"
// ones start selected. "Start applying" hands the picked programs to the parent.

const pill: Record<ApplicationMatch['status'], { status: Status; label: string }> = {
  likely: { status: 'likely', label: 'Likely' },
  needs_info: { status: 'maybe', label: 'Needs info' },
  not_eligible: { status: 'unlikely', label: 'Not eligible' },
}

export function ProgramPicker({ screening, loading, error, onRetry, starting, onStart, onCancel, onAskChat }: {
  screening: ApplicationScreening | null
  loading: boolean
  error: string | null
  onRetry: () => void
  starting: boolean
  onStart: (programs: ApplicationProgram[]) => void
  onCancel?: () => void
  onAskChat: () => void
}) {
  const matches = screening?.matches ?? []
  const [picked, setPicked] = useState<Set<ApplicationProgram> | null>(null)
  const selected = picked ?? new Set(matches.filter((m) => m.status === 'likely').map((m) => m.program))
  const toggle = (p: ApplicationProgram) => {
    const next = new Set(selected)
    if (next.has(p)) next.delete(p)
    else next.add(p)
    setPicked(next)
  }
  const ordered = [...matches].sort((a, b) => rank(a) - rank(b))

  return (
    <section aria-labelledby="picker-title" className="rounded-32 bg-background-tertiary p-6 max-mobile:p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="picker-title" className="type-heading-s">Choose what Aid should apply for</h2>
          <p className="mt-1 type-body-s text-secondary">
            Aid researches each program, collects what’s needed, and fills out the application. You review and sign before anything is sent.
          </p>
        </div>
        {onCancel && <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>}
      </div>

      <div className="mt-5" aria-live="polite">
        {loading && <div className="grid gap-3" role="status" aria-label="Loading suggestions"><Skeleton className="h-24 bg-background-primary" /><Skeleton className="h-24 bg-background-primary" /></div>}
        {error && !loading && <ErrorState message={error} onRetry={onRetry} />}
        {!loading && !error && ordered.length === 0 && (
          <div className="rounded-24 bg-background-primary p-5">
            <p className="type-body-m font-medium">No suggestions yet</p>
            <p className="mt-1 type-body-s text-secondary">Tell Aid about your household in the chat and matches appear here.</p>
            <Button variant="outline" size="sm" icon="message" className="mt-4" onClick={onAskChat}>Talk to Aid</Button>
          </div>
        )}
        {!loading && !error && ordered.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {ordered.map((m) => (
              <MatchCard key={m.program} match={m} checked={selected.has(m.program)} onToggle={() => toggle(m.program)} />
            ))}
          </ul>
        )}
      </div>

      {ordered.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button size="lg" disabled={selected.size === 0 || starting} aria-busy={starting} iconRight={starting ? 'spinner' : 'arrow-right'} onClick={() => onStart([...selected])}>
            {starting ? 'Starting…' : `Start applying${selected.size ? ` (${selected.size})` : ''}`}
          </Button>
          <p className="type-body-s text-secondary">{screening?.notice ?? 'These are suggestions, not approval decisions.'}</p>
        </div>
      )}
    </section>
  )
}

const rank = (m: ApplicationMatch) => (m.status === 'likely' ? 0 : m.status === 'needs_info' ? 1 : 2)

function MatchCard({ match: m, checked, onToggle }: { match: ApplicationMatch; checked: boolean; onToggle: () => void }) {
  const p = pill[m.status]
  return (
    <li>
      <label className={cx(
        'relative flex h-full cursor-pointer flex-col gap-2 rounded-24 border-2 bg-background-primary p-4 transition-colors duration-150 has-[:focus-visible]:shadow-focus',
        checked ? 'border-blue-700' : 'border-transparent hover:border-border-tertiary',
      )}>
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={onToggle} />
        <div className="flex items-start justify-between gap-3">
          <span className="type-card-title">{m.name}</span>
          <span aria-hidden="true" className={cx('flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors', checked ? 'border-blue-700 bg-blue-700 text-white' : 'border-border-secondary')}>
            {checked && <Icon name="check" size={14} strokeWidth={3} />}
          </span>
        </div>
        <div><StatusBadge status={p.status} label={p.label} /></div>
        <p className="type-body-s">{m.reason}</p>
        <p className="mt-auto flex items-start gap-1.5 pt-1 type-body-s text-secondary">
          <Icon name="arrow-right" size={14} className="mt-1 shrink-0" />
          <span>{m.nextStep}</span>
        </p>
      </label>
    </li>
  )
}
