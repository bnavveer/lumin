import { useState } from 'react'
import { ApplicationTimeline, StatusBadge } from '../components/Benefits'
import { AssistantMessage, ChatThread, UserMessage } from '../components/Chat'
import { Icon } from '../components/icons'
import { api } from '../lib/api'
import { callOutcomeLabel, callPurposeLabel, clock, countyLabel, docTypeLabel, householdName, matchStatus, programLabel, usd } from '../lib/format'
import { useRealtime, REALTIME_TABLES } from '../lib/realtime'
import { Link } from '../lib/router'
import { usePoll } from '../lib/usePoll'
import type { CallOutcomeKind, CallRecord, CaseDetail } from '../lib/types'
import { StaffShell } from '../screens/Shell'
import { Chip, EmptyState, ErrorCard, Loading } from '../screens/ui'

const outcomeTone: Record<CallOutcomeKind, string> = {
  booked: 'bg-green-50 text-green-600',
  waitlist_open: 'bg-green-50 text-green-600',
  transferred: 'bg-blue-50 text-blue-600',
  info: 'bg-blue-50 text-blue-600',
  waitlist_closed: 'bg-amber-50 text-amber-700',
  no_answer: 'bg-grey-50 text-secondary',
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="min-w-0">
      <h2 id={id} className="type-heading-s">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

// Only link to http(s) document URLs.
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : undefined)

function CallItem({ call }: { call: CallRecord }) {
  const [open, setOpen] = useState(false)
  const tid = `call-${call.dialId}`
  return (
    <li className="rounded-16 border border-border-tertiary p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-body-m font-medium">{callPurposeLabel[call.purpose]}</p>
        <div className="flex items-center gap-2">
          {call.outcome ? <Chip className={outcomeTone[call.outcome]}>{callOutcomeLabel[call.outcome]}</Chip> : <Chip className="bg-grey-50 text-secondary">In progress</Chip>}
          <span className="type-label-s text-tertiary">{clock(call.at)}</span>
        </div>
      </div>
      {call.transcript && (
        <>
          <button type="button" aria-expanded={open} aria-controls={tid} onClick={() => setOpen((v) => !v)}
            className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded-8 type-body-s font-medium focus-ring">
            {open ? 'Hide transcript' : 'Show transcript'}
            <Icon name="chevron-down" size={14} className={open ? 'rotate-180' : ''} />
          </button>
          <pre id={tid} hidden={!open} className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-12 bg-background-tertiary p-3 font-body type-body-s">{call.transcript}</pre>
        </>
      )}
    </li>
  )
}

function Body({ d }: { d: CaseDetail }) {
  const h = d.household
  const steps = d.timeline.map((t, i) => ({ label: t.label, date: clock(t.at), state: (i === d.timeline.length - 1 ? 'current' : 'done') as 'current' | 'done' }))
  return (
    <>
      <p className="mt-2 type-body-m text-secondary">
        {countyLabel[h.county]} · {h.size} {h.size === 1 ? 'person' : 'people'} · {usd(h.monthlyIncome)}/mo income · {h.childrenUnder18} {h.childrenUnder18 === 1 ? 'child' : 'children'} · {h.phone}
      </p>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_1fr]">
        <div className="flex min-w-0 flex-col gap-10">
          <Section id="timeline" title="Timeline">
            {steps.length ? <ApplicationTimeline steps={steps} /> : <EmptyState icon="clock" title="No activity yet" />}
          </Section>
          <Section id="elig" title="Eligibility">
            {d.eligibility.length === 0 ? <EmptyState title="Not screened yet" /> : (
              <div className="overflow-x-auto rounded-16 border border-border-tertiary">
                <table className="w-full min-w-[30rem] text-left type-body-s">
                  <caption className="sr-only">Eligibility by program</caption>
                  <thead className="bg-background-tertiary">
                    <tr><th scope="col" className="p-3 font-medium">Program</th><th scope="col" className="p-3 font-medium">Status</th><th scope="col" className="p-3 text-right font-medium">Per month</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border-tertiary">
                    {d.eligibility.map((m) => (
                      <tr key={m.program}>
                        <th scope="row" className="p-3 align-top font-medium">{programLabel[m.program]}<span className="mt-0.5 block font-normal text-secondary">{m.reason}</span></th>
                        <td className="p-3 align-top"><StatusBadge status={matchStatus[m.status]} /></td>
                        <td className="p-3 text-right align-top">{m.estMonthlyValue ? usd(m.estMonthlyValue) : 'n/a'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
          <Section id="docs" title="Documents">
            {d.documents.length === 0 ? <EmptyState icon="document" title="No documents yet">Photos sent by text show up here.</EmptyState> : (
              <ul className="divide-y divide-border-tertiary">
                {d.documents.map((doc) => {
                  const url = safeUrl(doc.url)
                  return (
                    <li key={doc.id} className="flex items-center justify-between gap-3 py-3">
                      <span><span className="block type-body-m">{docTypeLabel[doc.docType]}</span><span className="type-label-s text-tertiary">{clock(doc.at)}</span></span>
                      {url && <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-4 type-body-s text-link underline focus-ring">Open<Icon name="external" size={14} /></a>}
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>
          <Section id="subs" title="Submissions">
            {d.submissions.length === 0 ? <EmptyState icon="check-circle" title="Nothing submitted yet" /> : (
              <ul className="flex flex-col gap-3">
                {d.submissions.map((s) => (
                  <li key={s.confirmation} className="rounded-16 bg-green-50 p-4">
                    <p className="type-body-m font-medium">{s.kind === 'full' ? 'Full application' : 'Minimal application'}</p>
                    <p className="type-body-s">Confirmation <span className="font-mono">{s.confirmation}</span> · {clock(s.at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
        <div className="flex min-w-0 flex-col gap-10">
          <Section id="sms" title="Text thread">
            {d.messages.length === 0 ? <EmptyState title="No messages yet" /> : (
              <ChatThread className="gap-5 rounded-32 bg-grey-50 p-4">
                {d.messages.map((m, i) => m.role === 'user'
                  ? <UserMessage key={i}>{m.content}</UserMessage>
                  : <AssistantMessage key={i}><p className="whitespace-pre-wrap">{m.content}</p></AssistantMessage>)}
              </ChatThread>
            )}
          </Section>
          <Section id="calls" title="Calls">
            {d.calls.length === 0 ? <EmptyState icon="phone" title="No calls yet">When Aid phones an agency for this household, the call and transcript appear here.</EmptyState> : (
              <ul className="flex flex-col gap-3">{d.calls.map((c) => <CallItem key={c.dialId} call={c} />)}</ul>
            )}
          </Section>
        </div>
      </div>
    </>
  )
}

export function CaseDetailPage({ id }: { id: string }) {
  const poll = usePoll(() => api.caseDetail(id), 10_000, [id])
  useRealtime(REALTIME_TABLES, poll.refresh)
  const d = poll.data
  return (
    <StaffShell wide>
      <Link to="/staff" className="inline-flex items-center gap-1 rounded-8 type-body-s focus-ring"><Icon name="arrow-left" size={16} />All cases</Link>
      <h1 className="type-page-heading mt-3">{d ? householdName(d.household.firstName, d.household.id) : 'Case'}</h1>
      {!d && poll.loading ? <div className="mt-6"><Loading label="Loading case" /></div>
        : !d ? <div className="mt-6"><ErrorCard title="Couldn’t load this case" message={poll.error ?? 'No data.'} onRetry={poll.refresh} /></div>
        : <Body d={d} />}
    </StaffShell>
  )
}
