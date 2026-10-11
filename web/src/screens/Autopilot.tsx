import { Chip, EmptyState, ErrorCard, Skeleton } from './ui'
import { Link } from '../lib/router'
import { actionKindLabel, householdName, relTime } from '../lib/format'
import { useNow } from '../lib/useNow'
import type { Polled } from '../lib/usePoll'
import type { ActionKind, AutopilotState, CaseSummary } from '../lib/types'

const kindStyle: Record<ActionKind, string> = {
  interview_nudge: 'border-l-amber-700 bg-amber-50',
  docs_nudge: 'border-l-blue-500 bg-blue-50',
  submit: 'border-l-green-600 bg-green-50',
  waitlist_check: 'border-l-grey-200 bg-grey-50',
  renewal_start: 'border-l-red-600 bg-[#fdf2f3]',
}

export function AutopilotQueue({ poll, cases }: { poll: Polled<AutopilotState>; cases: CaseSummary[] }) {
  const now = useNow(5000)
  const { data, error, loading, refresh } = poll
  const names = new Map(cases.map((c) => [c.id, c.firstName]))
  return (
    <section aria-labelledby="autopilot">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="autopilot" className="type-heading-s">Autopilot queue</h2>
        {data && <span className="type-label-s text-secondary">Last run {relTime(data.lastRunAt, now)}</span>}
      </div>
      <div className="mt-4">
        {!data && loading ? (
          <Skeleton className="h-40" />
        ) : !data ? (
          <ErrorCard title="Couldn’t load the autopilot queue" message={error ?? 'No data.'} onRetry={refresh} />
        ) : data.actions.length === 0 ? (
          <EmptyState icon="check-circle" title="Nothing needs attention">Keewano has no reminders or submissions queued right now.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.actions.map((a, i) => (
              <li key={`${a.householdId}-${a.kind}-${i}`} className={`rounded-16 border-l-4 p-4 ${kindStyle[a.kind]}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="type-body-m font-medium">{actionKindLabel[a.kind]}</p>
                  <Chip className="bg-white/70 text-secondary" icon="check-circle">decided by Keewano</Chip>
                </div>
                <p className="mt-1 type-body-s">{a.detail}</p>
                <Link to={`/staff/case/${a.householdId}`} className="mt-2 inline-block rounded-4 type-body-s text-link underline underline-offset-[3px] focus-ring">
                  {householdName(names.get(a.householdId), a.householdId)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
