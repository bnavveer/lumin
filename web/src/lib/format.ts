import type { ActionKind, CallOutcomeKind, CallPurpose, County, DocType, MatchStatus, Program } from './types'
import type { Status } from '../components/Benefits'

export const programLabel: Record<Program, string> = {
  calfresh: 'CalFresh',
  medi_cal: 'Medi-Cal',
  calworks: 'CalWORKs',
  general_relief: 'General Relief',
  cfap: 'CFAP',
  section8: 'Section 8',
}

export const countyLabel: Record<County, string> = {
  los_angeles: 'Los Angeles County',
  san_francisco: 'San Francisco',
}

export const matchStatus: Record<MatchStatus, Status> = {
  likely: 'likely',
  needs_info: 'maybe',
  not_eligible: 'unlikely',
}

export const actionKindLabel: Record<ActionKind, string> = {
  interview_nudge: 'Interview reminder',
  docs_nudge: 'Document reminder',
  submit: 'Ready to submit',
  waitlist_check: 'Waitlist check',
  renewal_start: 'Renewal',
}

export const callPurposeLabel: Record<CallPurpose, string> = {
  apply_by_phone: 'Apply by phone',
  reschedule_interview: 'Reschedule interview',
  waitlist_check: 'Waitlist check',
  status_check: 'Status check',
}

export const callOutcomeLabel: Record<CallOutcomeKind, string> = {
  transferred: 'Transferred to a person',
  booked: 'Interview booked',
  waitlist_open: 'Waitlist open',
  waitlist_closed: 'Waitlist closed',
  no_answer: 'No answer',
  info: 'Info gathered',
}

export const docTypeLabel: Record<DocType, string> = {
  id: 'Photo ID',
  paystub: 'Pay stub',
  lease: 'Lease',
  ssn_card: 'Social Security card',
  birth_cert: 'Birth certificate',
  immigration: 'Immigration papers',
  other: 'Other document',
}

export const usd = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`

export function householdName(firstName: string | null | undefined, id: string): string {
  return firstName?.trim() || `Household ${id.slice(0, 6)}`
}

export function relTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return 'never'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 'unknown'
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function clock(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function hours(h: number | null): string {
  if (h === null) return 'n/a'
  if (h < 1) return `${Math.round(h * 60)} min`
  return `${h.toFixed(h < 10 ? 1 : 0)} h`
}
