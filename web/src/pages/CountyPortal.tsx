import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { clock } from '../lib/format'
import { usePoll } from '../lib/usePoll'
import { PublicShell } from '../screens/Shell'
import { EmptyState, ErrorCard, Loading, Page } from '../screens/ui'

const rowKey = (s: { householdId: string; confirmation: string }) => `${s.householdId}:${s.confirmation}`

// Plain, deliberately unbranded look: this stands in for the county's own system.
export function CountyPortal() {
  const poll = usePoll(api.countyApplications, 3000)
  const seen = useRef<Set<string> | null>(null)
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!poll.data) return
    const keys = poll.data.map(rowKey)
    if (seen.current === null) {
      seen.current = new Set(keys)
      return
    }
    const added = keys.filter((k) => !seen.current!.has(k))
    if (added.length) {
      keys.forEach((k) => seen.current!.add(k))
      setFresh((p) => new Set([...p, ...added]))
    }
  }, [poll.data])

  const rows = [...(poll.data ?? [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  return (
    <PublicShell>
      <Page width="max-w-[60rem]">
        <div className="mt-6 border-b-4 border-grey-200 pb-4">
          <h1 className="type-page-heading">LA County Intake Portal (DEMO MOCK)</h1>
          <p className="mt-2 type-body-s text-secondary">A stand-in for the county system, for demonstration only. Refreshes every 3 seconds.</p>
        </div>
        <div className="mt-6">
          {!poll.data && poll.loading ? <Loading label="Loading applications" />
            : !poll.data ? <ErrorCard title="Couldn’t load applications" message={poll.error ?? 'No data.'} onRetry={poll.refresh} />
            : rows.length === 0 ? <EmptyState icon="document" title="No applications received yet">Submitted applications appear here as they arrive.</EmptyState>
            : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] border-collapse text-left type-body-s">
                  <caption className="sr-only">Received applications</caption>
                  <thead><tr className="border-b-2 border-border-secondary">
                    <th scope="col" className="p-3 font-medium">Confirmation</th>
                    <th scope="col" className="p-3 font-medium">Household</th>
                    <th scope="col" className="p-3 font-medium">Type</th>
                    <th scope="col" className="p-3 font-medium">Received</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={rowKey(r)} className={`border-b border-border-tertiary ${fresh.has(rowKey(r)) ? 'row-new' : ''}`}>
                        <td className="p-3 font-mono">{r.confirmation}</td>
                        <td className="p-3 font-mono">{r.householdId.slice(0, 8)}</td>
                        <td className="p-3">{r.kind === 'full' ? 'Full application' : 'Minimal application'}</td>
                        <td className="p-3">{clock(r.at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
        {poll.error && poll.data && <p role="status" className="mt-3 type-label-s text-amber-700">Couldn’t refresh just now. Showing the last list.</p>}
      </Page>
    </PublicShell>
  )
}
