import type { Polled } from '../lib/usePoll'
import { hours } from '../lib/format'
import type { TimeSavedMetrics } from '../lib/types'
import { Chip, ErrorCard, Skeleton } from './ui'

function Bar({ label, value, max, tone }: { label: string; value: number | null; max: number; tone: 'base' | 'aid' }) {
  const scale = value === null || max <= 0 ? 0.02 : Math.max(0.03, Math.min(1, value / max))
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="type-body-s text-secondary">{label}</span>
        <span className="font-serif text-[1.75rem] leading-none tracking-[-0.03em]">{hours(value)}</span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-background-tertiary" aria-hidden="true">
        <div
          className={`h-full origin-left rounded-full transition-transform duration-700 motion-reduce:transition-none ${tone === 'aid' ? 'bg-green-600' : 'bg-blue-700/40'}`}
          style={{ transform: `scaleX(${scale})` }}
        />
      </div>
    </div>
  )
}

export function TimeSavedBanner({ poll }: { poll: Polled<TimeSavedMetrics> }) {
  const { data, error, loading, refresh } = poll
  if (!data && loading) return <Skeleton className="h-44" />
  if (!data) return <ErrorCard title="Couldn’t load time-saved numbers" message={error ?? 'No data.'} onRetry={refresh} />
  const { baseline, aid } = data
  const max = Math.max(baseline.medianHoursToSubmit ?? 0, aid.medianHoursToSubmit ?? 0)
  const live = data.source === 'keewano'
  const saved = baseline.medianHoursToSubmit !== null && aid.medianHoursToSubmit !== null ? baseline.medianHoursToSubmit - aid.medianHoursToSubmit : null
  return (
    <section aria-labelledby="timesaved" className="rounded-32 bg-background-tertiary p-6 max-mobile:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="timesaved" className="type-card-title">
          {saved !== null && saved > 0 ? `Aid gets households submitted ${hours(saved)} sooner` : 'Time to submit'}
        </h2>
        <Chip className={live ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-700'} icon={live ? 'check-circle' : 'info'}>
          {live ? <><span className="live-dot mr-1 inline-block size-1.5 rounded-full bg-green-600 motion-reduce:animate-none" aria-hidden="true" />live from Keewano</> : 'demo data'}
        </Chip>
      </div>
      <div className="mt-6 grid gap-8 md:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-5">
          <Bar label={`Without Aid, median hours to submit (${baseline.households} households)`} value={baseline.medianHoursToSubmit} max={max} tone="base" />
          <Bar label={`With Aid, median hours to submit (${aid.households} households)`} value={aid.medianHoursToSubmit} max={max} tone="aid" />
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Stat label="Submitted" base={`${Math.round(baseline.submittedPct)}%`} aid={`${Math.round(aid.submittedPct)}%`} />
          <Stat label="Interviews missed" base={`${Math.round(baseline.interviewMissedPct)}%`} aid={`${Math.round(aid.interviewMissedPct)}%`} />
        </dl>
      </div>
    </section>
  )
}

function Stat({ label, base, aid }: { label: string; base: string; aid: string }) {
  return (
    <div>
      <dt className="type-body-s text-secondary">{label}</dt>
      <dd className="mt-1 font-serif text-[2rem] leading-none tracking-[-0.03em]">
        {aid}
        <span className="ml-2 font-body text-sm text-tertiary">vs {base}</span>
      </dd>
    </div>
  )
}
