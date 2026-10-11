import { api } from '../lib/api'
import { countyLabel, householdName, relTime } from '../lib/format'
import { useRealtime, REALTIME_TABLES } from '../lib/realtime'
import { Link } from '../lib/router'
import { useNow } from '../lib/useNow'
import { usePoll } from '../lib/usePoll'
import { AskPanel } from '../screens/AskPanel'
import { AutopilotQueue } from '../screens/Autopilot'
import { StaffShell } from '../screens/Shell'
import { TimeSavedBanner } from '../screens/TimeSaved'
import { Chip, EmptyState, ErrorCard, Skeleton } from '../screens/ui'

const POLL_MS = 10_000

export function StaffDashboard() {
  const cases = usePoll(api.cases, POLL_MS)
  const autopilot = usePoll(api.autopilot, POLL_MS)
  const metrics = usePoll(api.metrics, POLL_MS)
  const now = useNow(5000)
  useRealtime(REALTIME_TABLES, () => {
    cases.refresh()
    autopilot.refresh()
    metrics.refresh()
  })
  const list = cases.data ?? []
  const pending = autopilot.data?.actions.length
  const anyBody = [cases, autopilot, metrics].some((p) => p.data)
  const allDown = !anyBody && [cases, autopilot, metrics].every((p) => p.error)

  return (
    <StaffShell wide>
      <h1 className="type-page-heading">Today’s caseload</h1>
      <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
        <Counter label="Active cases" value={cases.data ? String(list.length) : '…'} />
        <Counter label="Autopilot actions" value={pending === undefined ? '…' : String(pending)} />
        <Counter label="Submitted with Aid" value={metrics.data ? `${Math.round(metrics.data.aid.submittedPct)}%` : '…'} />
      </dl>

      {allDown && (
        <div className="mt-6">
          <ErrorCard title="Can’t reach the Aid server" message={cases.error ?? ''} onRetry={() => { cases.refresh(); autopilot.refresh(); metrics.refresh() }} />
        </div>
      )}

      <div className="mt-6"><TimeSavedBanner poll={metrics} /></div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex min-w-0 flex-col gap-8">
          <AutopilotQueue poll={autopilot} cases={list} />
          <section aria-labelledby="cases">
            <h2 id="cases" className="type-heading-s">Cases</h2>
            <div className="mt-4">
              {!cases.data && cases.loading ? (
                <div className="flex flex-col gap-3"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
              ) : !cases.data ? (
                <ErrorCard title="Couldn’t load cases" message={cases.error ?? 'No data.'} onRetry={cases.refresh} />
              ) : list.length === 0 ? (
                <EmptyState icon="user" title="No cases yet">When someone texts Aid, their household shows up here.</EmptyState>
              ) : (
                <ul className="divide-y divide-border-tertiary rounded-24 border border-border-tertiary">
                  {list.map((c) => (
                    <li key={c.id}>
                      <Link to={`/staff/case/${c.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-24 p-4 hover:bg-background-tertiary focus-ring">
                        <span className="min-w-0">
                          <span className="block type-body-m font-medium">{householdName(c.firstName, c.id)}</span>
                          <span className="block type-body-s text-secondary">
                            {countyLabel[c.county]}, {c.size} {c.size === 1 ? 'person' : 'people'}
                            {c.lastEvent && <> · {c.lastEvent.label}</>}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          {c.actions.length > 0 && <Chip className="bg-amber-50 text-amber-700">{c.actions.length} to do</Chip>}
                          <span className="type-label-s text-tertiary">{relTime(c.updatedAt, now)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
        <div className="min-w-0 lg:sticky lg:top-4 lg:self-start"><AskPanel /></div>
      </div>
    </StaffShell>
  )
}

function Counter({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="type-body-s text-secondary">{label}</dt>
      <dd className="font-serif text-[2.5rem] leading-none tracking-[-0.03em]">{value}</dd>
    </div>
  )
}
